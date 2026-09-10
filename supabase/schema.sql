-- ============================================================
-- Tech & Skills Council — database
-- Run once in the Supabase SQL editor.
--
-- Security model, in one line: the browser cannot write to these
-- tables at all. Every insert comes from the `enrol` edge function,
-- which uses the service-role key that never leaves the server.
-- RLS is enabled with NO policies for anon/authenticated, which
-- denies everything by default.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Launch Day registrations
-- ------------------------------------------------------------
create table if not exists public.launch_registrations (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  full_name         text not null check (char_length(trim(full_name)) between 2 and 120),
  email             text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  university        text not null check (university in ('REC','SNU','AU')),
  year_of_study     text not null check (year_of_study in ('1','2','3','4','other')),
  branch            text not null check (char_length(trim(branch)) between 2 and 120),

  experience        text     check (experience in ('none','some','comfortable')),
  bringing_laptop   boolean  not null default true,
  dietary           text     check (dietary is null or char_length(dietary) <= 120),
  hear_about        text     check (hear_about is null or char_length(hear_about) <= 40),
  interests         text     check (interests is null or char_length(interests) <= 500),
  on_asu_pathway    text     check (on_asu_pathway in ('yes','no')),

  attended          boolean  not null default false,
  status            text     not null default 'registered'
                    check (status in ('registered','confirmed','attended','cancelled'))
);

create unique index if not exists launch_email_key
  on public.launch_registrations (lower(email));
create index if not exists launch_campus_idx
  on public.launch_registrations (university, created_at desc);

-- ------------------------------------------------------------
-- 2. Council applications
-- ------------------------------------------------------------
create table if not exists public.council_applications (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),

  full_name             text not null check (char_length(trim(full_name)) between 2 and 120),
  email                 text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone                 text     check (phone is null or char_length(phone) <= 24),
  university            text not null check (university in ('REC','SNU','AU')),
  year_of_study         text not null check (year_of_study in ('1','2','3','4','other')),
  branch                text not null check (char_length(trim(branch)) between 2 and 120),

  -- what they are applying for
  role_type             text not null check (role_type in ('lead','associate','either','board')),
  team_first            text not null check (team_first in
                          ('skill_tracks','build_nights','design_creative','platform_infra',
                           'certification_asu','industry_alumni','pr_outreach')),
  team_second           text     check (team_second is null or team_second in
                          ('skill_tracks','build_nights','design_creative','platform_infra',
                           'certification_asu','industry_alumni','pr_outreach','none')),

  experience_level      text     check (experience_level in ('none','some','comfortable','advanced')),
  hours_per_week        text not null check (hours_per_week in ('1-3','4-6','7-10','10+')),

  -- the written answers that actually decide it
  why_join              text not null check (char_length(why_join) between 80 and 1200),
  relevant_experience   text not null check (char_length(relevant_experience) between 60 and 1200),
  what_you_would_build  text     check (what_you_would_build is null or char_length(what_you_would_build) <= 1200),
  leadership_history    text     check (leadership_history is null or char_length(leadership_history) <= 800),

  portfolio_url         text     check (portfolio_url is null or portfolio_url ~* '^https?://'),
  linkedin_url          text     check (linkedin_url is null or linkedin_url ~* '^https?://'),

  attending_launch      boolean  not null default false,
  on_asu_pathway        text     check (on_asu_pathway in ('yes','no')),

  -- review workflow
  status                text not null default 'new'
                        check (status in ('new','shortlisted','interviewed','offered','declined','withdrawn')),
  reviewer_notes        text
);

create unique index if not exists council_email_key
  on public.council_applications (lower(email));
create index if not exists council_team_idx
  on public.council_applications (team_first, status, created_at desc);

-- ------------------------------------------------------------
-- 2a. Migration: add on_asu_pathway to tables created before it
-- existed. Safe to re-run — a fresh install already has the column
-- from the create table statements above.
-- ------------------------------------------------------------
alter table public.launch_registrations
  add column if not exists on_asu_pathway text check (on_asu_pathway in ('yes','no'));
alter table public.council_applications
  add column if not exists on_asu_pathway text check (on_asu_pathway in ('yes','no'));

-- ------------------------------------------------------------
-- 3. Rate limiting (per IP hash, sliding window)
-- ------------------------------------------------------------
create table if not exists public.submit_events (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  ip_hash     text not null,
  form        text not null
);
create index if not exists submit_events_window_idx
  on public.submit_events (ip_hash, created_at desc);

-- how many submissions from this IP in the last N minutes
create or replace function public.recent_submits(p_ip_hash text, p_minutes int default 10)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.submit_events
  where ip_hash = p_ip_hash
    and created_at > now() - make_interval(mins => p_minutes);
$$;

-- keep the table small; call from a scheduled job or the function itself
create or replace function public.prune_submit_events()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.submit_events where created_at < now() - interval '1 day';
$$;

-- ------------------------------------------------------------
-- 4. Lock everything down
-- ------------------------------------------------------------
alter table public.launch_registrations enable row level security;
alter table public.council_applications enable row level security;
alter table public.submit_events        enable row level security;

-- No policies are created on purpose. With RLS on and no policy, the anon
-- and authenticated roles can do nothing at all — not select, not insert.
-- The edge function uses the service-role key, which bypasses RLS.
-- Council members read the data in the Supabase dashboard.

revoke all on public.launch_registrations from anon, authenticated;
revoke all on public.council_applications from anon, authenticated;
revoke all on public.submit_events        from anon, authenticated;

-- ------------------------------------------------------------
-- 5. Views for the council (dashboard use)
-- ------------------------------------------------------------
create or replace view public.launch_counts as
  select university,
         count(*)                                  as registered,
         count(*) filter (where bringing_laptop)   as with_laptop,
         count(*) filter (where experience = 'none') as absolute_beginners,
         max(created_at)                           as latest
  from public.launch_registrations
  group by university;

create or replace view public.council_pipeline as
  select team_first,
         count(*)                                     as applications,
         count(*) filter (where status = 'new')       as unreviewed,
         count(*) filter (where status = 'shortlisted') as shortlisted,
         count(*) filter (where role_type = 'lead')   as want_lead,
         max(created_at)                              as latest
  from public.council_applications
  group by team_first;

comment on table public.launch_registrations is
  'Launch Day registrations. Personal data — store securely, never share outside the council without consent, delete on request.';
comment on table public.council_applications is
  'Council applications. Personal data, plus written answers. Same handling rules as above.';
