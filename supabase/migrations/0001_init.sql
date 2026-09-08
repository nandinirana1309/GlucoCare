-- GlucoCare - initial database schema (Stage 7)
-- =============================================================
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Design notes:
--  * No login screen. The app uses Supabase "anonymous sign-in", which gives
--    each visitor a real (anonymous) auth user id. That id is stored in
--    `session_id` and Row Level Security only lets a user touch their own rows.
--  * `raw` jsonb keeps a full copy of the assessment for debugging / export.
--  * Nothing here is required for the app to run - it is an optional backup.

-- ---------- assessments -------------------------------------------------

create table if not exists public.assessments (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null default auth.uid(),
  created_at      timestamptz not null default now(),

  name            text,
  age             numeric,
  gender          text,
  diabetes_status text,
  diabetes_type   text,
  family_history  text,

  glucose         numeric,
  hba1c           numeric,
  height_cm       numeric,
  weight_kg       numeric,
  systolic        numeric,
  diastolic       numeric,

  symptoms        text[] not null default '{}',
  warning_signs   text[] not null default '{}',

  activity_level  text,
  smoking         text,
  diet_pattern    text,
  sleep_hours     numeric,

  locality        text,
  report_name     text,
  raw             jsonb
);

alter table public.assessments enable row level security;

create policy "own assessments - select"
  on public.assessments for select
  using (auth.uid() = session_id);

create policy "own assessments - insert"
  on public.assessments for insert
  with check (auth.uid() = session_id);

-- ---------- results ----------------------------------------------------

create table if not exists public.results (
  id              uuid primary key default gen_random_uuid(),
  assessment_id   uuid not null references public.assessments(id) on delete cascade,
  session_id      uuid not null default auth.uid(),
  created_at      timestamptz not null default now(),

  concern_level   text not null,
  concern_score   integer not null,
  engine_version  text not null,

  indicators      jsonb not null default '[]',
  risk_factors    jsonb not null default '[]',
  red_flags       jsonb not null default '[]',
  recommendations jsonb not null default '[]'
);

alter table public.results enable row level security;

create policy "own results - select"
  on public.results for select
  using (auth.uid() = session_id);

create policy "own results - insert"
  on public.results for insert
  with check (auth.uid() = session_id);

create index if not exists results_assessment_id_idx
  on public.results (assessment_id);
