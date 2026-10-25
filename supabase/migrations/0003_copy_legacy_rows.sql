-- GlucoCare - OPTIONAL: copy Stage-7 rows into the Project-II history tables
-- =============================================================
-- Only needed if your Supabase project already contains rows in the old
-- `assessments` / `results` tables (from before Project-II).
--
--  * Copies each old assessment into assessment_snapshots (+ results +
--    measurements) WITHOUT name, locality or report filename.
--  * Idempotent: the old row id is reused as client_id, so running this twice
--    copies nothing twice.
--  * Does NOT delete or modify the old tables. After you have checked the
--    copied data you may drop them yourself:
--        drop table public.results; drop table public.assessments;
--  * Old rows were scored by engine 1.0.0 and have no factor breakdown; they
--    are stored with engine_version '1.0.0' and an empty factor list, and the
--    app shows "factor breakdown not available for this older assessment".
--
-- Run in the SQL editor as the project owner (RLS is bypassed for the owner).

insert into public.assessment_snapshots (id, user_id, client_id, created_at, assessed_on, engine_version, input)
select a.id, a.session_id, a.id, a.created_at, a.created_at::date, coalesce(r.engine_version, '1.0.0'),
       (coalesce(a.raw, '{}'::jsonb) - 'name' - 'locality' - 'report')
from public.assessments a
left join public.results r on r.assessment_id = a.id
where exists (select 1 from auth.users u where u.id = a.session_id)
on conflict do nothing;

insert into public.assessment_results
  (assessment_id, user_id, created_at, engine_version, concern_level, concern_score,
   level_basis, factors, safety, result)
select r.assessment_id, r.session_id, r.created_at, r.engine_version, r.concern_level, r.concern_score,
       '{"type":"legacy"}'::jsonb, '[]'::jsonb,
       jsonb_build_object('level', case when jsonb_array_length(r.red_flags) > 0 then 'urgent' else 'normal' end,
                          'isUrgent', jsonb_array_length(r.red_flags) > 0,
                          'triggeredRules', coalesce((select jsonb_agg(f->'id') from jsonb_array_elements(r.red_flags) f), '[]'::jsonb),
                          'reasons', coalesce((select jsonb_agg(f->'reason') from jsonb_array_elements(r.red_flags) f), '[]'::jsonb),
                          'triggers', '[]'::jsonb,
                          'aiAllowed', jsonb_array_length(r.red_flags) = 0),
       jsonb_build_object('engineVersion', r.engine_version, 'concernLevel', r.concern_level,
                          'concernScore', r.concern_score, 'indicators', r.indicators,
                          'riskFactors', r.risk_factors, 'redFlags', r.red_flags,
                          'recommendations', r.recommendations, 'legacy', true)
from public.results r
join public.assessment_snapshots s on s.id = r.assessment_id
on conflict do nothing;

insert into public.measurements (user_id, assessment_id, kind, value, unit, measured_on, source, verification)
select a.session_id, a.id, m.kind, m.value, m.unit, a.created_at::date, 'assessment', 'manual'
from public.assessments a
join public.assessment_snapshots s on s.id = a.id
cross join lateral (values
  ('glucose', a.glucose, 'mg/dL'), ('hba1c', a.hba1c, '%'),
  ('systolic', case when a.diastolic is not null then a.systolic end, 'mmHg'),
  ('diastolic', case when a.systolic is not null then a.diastolic end, 'mmHg'),
  ('height', a.height_cm, 'cm'), ('weight', a.weight_kg, 'kg')
) as m(kind, value, unit)
where m.value is not null
  and not exists (select 1 from public.measurements x where x.assessment_id = a.id)
  and ((m.kind = 'glucose' and m.value between 20 and 800) or (m.kind = 'hba1c' and m.value between 3 and 20)
    or (m.kind = 'systolic' and m.value between 60 and 260) or (m.kind = 'diastolic' and m.value between 30 and 180)
    or (m.kind = 'height' and m.value between 50 and 260) or (m.kind = 'weight' and m.value between 10 and 400));
