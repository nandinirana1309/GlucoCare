-- GlucoCare - Project-II health history (Phase 3)
-- =============================================================
-- Run AFTER 0001_init.sql (Supabase dashboard -> SQL Editor, or `supabase db push`).
--
-- Design notes (see README "Database"):
--  * Every row has user_id = the (anonymous or signed-in) Supabase auth user.
--    Row Level Security only lets a user see / insert / delete THEIR rows.
--  * History is IMMUTABLE: there are no UPDATE policies. A correction is a
--    delete + new record, which keeps the history honest.
--  * Saves go through the save_assessment / save_report functions so that a
--    snapshot and its measurements are written in ONE transaction, and are
--    IDEMPOTENT on (user_id, client_id) - a double submit cannot duplicate.
--  * Minimal data: no name, no locality, no report file, no raw report text.
--    assessment_snapshots.input is rejected if it contains name/locality/report.
--  * The Stage-7 tables (assessments, results) are LEFT IN PLACE - this
--    migration never deletes existing data. See 0003 for an optional copy.
--  * Functions are SECURITY INVOKER, so RLS still applies inside them.

-- ---------- assessment_snapshots --------------------------------------

create table if not exists public.assessment_snapshots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id       uuid not null,
  created_at      timestamptz not null default now(),
  assessed_on     date not null,
  engine_version  text not null,
  input           jsonb not null,
  unique (user_id, client_id),
  constraint snapshot_input_has_no_identifiers
    check (not (input ? 'name') and not (input ? 'locality') and not (input ? 'report'))
);

-- ---------- assessment_results (1:1, frozen engine output) -----------

create table if not exists public.assessment_results (
  assessment_id   uuid primary key references public.assessment_snapshots(id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  engine_version  text not null,
  concern_level   text not null check (concern_level in ('Low', 'Moderate', 'High')),
  concern_score   smallint not null check (concern_score >= 0),
  level_basis     jsonb not null,
  factors         jsonb not null,
  safety          jsonb not null,
  result          jsonb not null              -- the full AssessmentResult, as computed
);

-- ---------- medical_reports (metadata only) ---------------------------

create table if not exists public.medical_reports (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id          uuid not null,
  created_at         timestamptz not null default now(),
  label              text not null check (char_length(label) between 1 and 120),
  report_date        date not null,
  file_type          text not null check (file_type in ('pdf', 'png', 'jpeg')),
  page_count         smallint check (page_count is null or page_count between 1 and 500),
  extraction_method  text not null check (extraction_method in ('pdf_text', 'ocr', 'mixed', 'manual_only')),
  parser_version     text not null,
  unique (user_id, client_id)
);

-- ---------- extracted_values (review audit trail) --------------------

create table if not exists public.extracted_values (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.medical_reports(id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind             text not null check (kind in ('glucose','hba1c','systolic','diastolic','height','weight','bmi')),
  matched_label    text check (matched_label is null or char_length(matched_label) <= 60),
  extracted_value  numeric,
  extracted_unit   text check (extracted_unit is null or char_length(extracted_unit) <= 20),
  confidence       text not null check (confidence in ('high', 'medium', 'low')),
  status           text not null check (status in ('confirmed', 'edited', 'rejected', 'added')),
  final_value      numeric,
  glucose_context  text check (glucose_context is null or glucose_context in ('fasting','random','post_meal','unknown')),
  reviewed_at      timestamptz not null default now(),
  -- a rejected value keeps no numbers; everything else must have a final value
  constraint rejected_values_keep_no_numbers
    check ((status = 'rejected') = (final_value is null)
           and (status <> 'rejected' or extracted_value is null))
);

-- ---------- measurements (the longitudinal series) -------------------

create table if not exists public.measurements (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  assessment_id       uuid references public.assessment_snapshots(id) on delete cascade,
  report_id           uuid references public.medical_reports(id) on delete cascade,
  extracted_value_id  uuid references public.extracted_values(id) on delete set null,
  kind                text not null check (kind in ('glucose','hba1c','systolic','diastolic','height','weight','bmi')),
  value               numeric not null,
  unit                text not null,
  measured_on         date not null,
  glucose_context     text check (glucose_context is null or glucose_context in ('fasting','random','post_meal','unknown')),
  source              text not null check (source in ('assessment', 'report')),
  verification        text not null check (verification in
                        ('manual','calculated','report_confirmed','report_edited','report_added')),
  created_at          timestamptz not null default now(),
  constraint measurement_has_one_parent
    check ((source = 'assessment' and assessment_id is not null and report_id is null)
        or (source = 'report' and report_id is not null and assessment_id is null)),
  constraint measurement_verification_matches_source
    check ((source = 'assessment' and verification in ('manual', 'calculated'))
        or (source = 'report' and verification in ('report_confirmed', 'report_edited', 'report_added'))),
  -- plausibility limits mirror src/lib/validation.ts (data-entry limits, not medical thresholds)
  constraint measurement_value_plausible check (
       (kind = 'glucose'   and value between 20 and 800)
    or (kind = 'hba1c'     and value between 3 and 20)
    or (kind = 'systolic'  and value between 60 and 260)
    or (kind = 'diastolic' and value between 30 and 180)
    or (kind = 'height'    and value between 50 and 260)
    or (kind = 'weight'    and value between 10 and 400)
    or (kind = 'bmi'       and value between 5 and 150))
);

create index if not exists measurements_user_kind_date_idx on public.measurements (user_id, kind, measured_on);
create index if not exists snapshots_user_date_idx on public.assessment_snapshots (user_id, assessed_on);
create index if not exists reports_user_date_idx on public.medical_reports (user_id, report_date);
create index if not exists extracted_values_report_idx on public.extracted_values (report_id);

-- ---------- Row Level Security ----------------------------------------
-- Pattern: select / insert / delete own rows only. NO update policies.
-- Child rows must also point at a parent the same user owns, so a guessed
-- id cannot attach data to someone else's record.

alter table public.assessment_snapshots enable row level security;
alter table public.assessment_results   enable row level security;
alter table public.medical_reports      enable row level security;
alter table public.extracted_values     enable row level security;
alter table public.measurements         enable row level security;

create policy "snapshots: select own" on public.assessment_snapshots
  for select to authenticated using (user_id = auth.uid());
create policy "snapshots: insert own" on public.assessment_snapshots
  for insert to authenticated with check (user_id = auth.uid());
create policy "snapshots: delete own" on public.assessment_snapshots
  for delete to authenticated using (user_id = auth.uid());

create policy "results: select own" on public.assessment_results
  for select to authenticated using (user_id = auth.uid());
create policy "results: insert own" on public.assessment_results
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.assessment_snapshots s
                where s.id = assessment_id and s.user_id = auth.uid()));
create policy "results: delete own" on public.assessment_results
  for delete to authenticated using (user_id = auth.uid());

create policy "reports: select own" on public.medical_reports
  for select to authenticated using (user_id = auth.uid());
create policy "reports: insert own" on public.medical_reports
  for insert to authenticated with check (user_id = auth.uid());
create policy "reports: delete own" on public.medical_reports
  for delete to authenticated using (user_id = auth.uid());

create policy "extracted: select own" on public.extracted_values
  for select to authenticated using (user_id = auth.uid());
create policy "extracted: insert own" on public.extracted_values
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.medical_reports r
                where r.id = report_id and r.user_id = auth.uid()));
create policy "extracted: delete own" on public.extracted_values
  for delete to authenticated using (user_id = auth.uid());

create policy "measurements: select own" on public.measurements
  for select to authenticated using (user_id = auth.uid());
create policy "measurements: insert own" on public.measurements
  for insert to authenticated with check (
    user_id = auth.uid()
    and (assessment_id is null or exists (select 1 from public.assessment_snapshots s
                                          where s.id = assessment_id and s.user_id = auth.uid()))
    and (report_id is null or exists (select 1 from public.medical_reports r
                                      where r.id = report_id and r.user_id = auth.uid())));
create policy "measurements: delete own" on public.measurements
  for delete to authenticated using (user_id = auth.uid());

-- Only signed-in (incl. anonymous-auth) users; the public "anon" role gets nothing.
revoke all on public.assessment_snapshots, public.assessment_results, public.medical_reports,
              public.extracted_values, public.measurements from anon;
grant select, insert, delete on public.assessment_snapshots, public.assessment_results,
              public.medical_reports, public.extracted_values, public.measurements to authenticated;

-- ---------- save_assessment: snapshot + result + measurements, atomic, idempotent

create or replace function public.save_assessment(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_client uuid := (p->>'client_id')::uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into assessment_snapshots (user_id, client_id, assessed_on, engine_version, input)
  values (v_user, v_client, (p->>'assessed_on')::date, p->>'engine_version', p->'input')
  on conflict (user_id, client_id) do nothing
  returning id into v_id;

  -- Already saved: return the existing record and write nothing else.
  if v_id is null then
    select id into v_id from assessment_snapshots
      where user_id = v_user and client_id = v_client;
    return v_id;
  end if;

  insert into assessment_results
    (assessment_id, user_id, engine_version, concern_level, concern_score,
     level_basis, factors, safety, result)
  values
    (v_id, v_user, p->>'engine_version',
     p->'result'->>'concernLevel', (p->'result'->>'concernScore')::smallint,
     p->'result'->'levelBasis', p->'result'->'factors', p->'result'->'safety', p->'result');

  insert into measurements
    (user_id, assessment_id, kind, value, unit, measured_on, glucose_context, source, verification)
  select v_user, v_id, m->>'kind', (m->>'value')::numeric, m->>'unit',
         (m->>'measured_on')::date, nullif(m->>'glucose_context', ''), 'assessment', m->>'verification'
  from jsonb_array_elements(coalesce(p->'measurements', '[]'::jsonb)) as m;

  return v_id;
end;
$$;

-- ---------- save_report: report + reviewed values + verified measurements

create or replace function public.save_report(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_client uuid := (p->>'client_id')::uuid;
  v_id uuid;
  v_value jsonb;
  v_value_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into medical_reports
    (user_id, client_id, label, report_date, file_type, page_count, extraction_method, parser_version)
  values
    (v_user, v_client, p->>'label', (p->>'report_date')::date, p->>'file_type',
     nullif(p->>'page_count', '')::smallint, p->>'extraction_method', p->>'parser_version')
  on conflict (user_id, client_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from medical_reports
      where user_id = v_user and client_id = v_client;
    return v_id;
  end if;

  for v_value in select * from jsonb_array_elements(coalesce(p->'values', '[]'::jsonb))
  loop
    insert into extracted_values
      (report_id, user_id, kind, matched_label, extracted_value, extracted_unit,
       confidence, status, final_value, glucose_context)
    values
      (v_id, v_user, v_value->>'kind', v_value->>'matched_label',
       nullif(v_value->>'extracted_value', '')::numeric, v_value->>'extracted_unit',
       v_value->>'confidence', v_value->>'status',
       nullif(v_value->>'final_value', '')::numeric, nullif(v_value->>'glucose_context', ''))
    returning id into v_value_id;

    -- Only reviewed, non-rejected values become measurements.
    if v_value->>'status' in ('confirmed', 'edited', 'added') then
      insert into measurements
        (user_id, report_id, extracted_value_id, kind, value, unit, measured_on,
         glucose_context, source, verification)
      values
        (v_user, v_id, v_value_id, v_value->>'kind', (v_value->>'final_value')::numeric,
         case v_value->>'kind'
           when 'glucose' then 'mg/dL' when 'hba1c' then '%'
           when 'systolic' then 'mmHg' when 'diastolic' then 'mmHg'
           when 'height' then 'cm' when 'weight' then 'kg' else 'kg/m2' end,
         (p->>'report_date')::date, nullif(v_value->>'glucose_context', ''),
         'report',
         case v_value->>'status'
           when 'confirmed' then 'report_confirmed'
           when 'edited' then 'report_edited'
           else 'report_added' end);
    end if;
  end loop;

  return v_id;
end;
$$;

-- ---------- delete_my_data: everything the caller owns -----------------

create or replace function public.delete_my_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  -- children (results, measurements, extracted_values) cascade
  delete from assessment_snapshots where user_id = auth.uid();
  delete from medical_reports where user_id = auth.uid();
end;
$$;

revoke all on function public.save_assessment(jsonb), public.save_report(jsonb), public.delete_my_data() from public, anon;
grant execute on function public.save_assessment(jsonb), public.save_report(jsonb), public.delete_my_data() to authenticated;
