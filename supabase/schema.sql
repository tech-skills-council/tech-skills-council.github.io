-- ============================================================
-- Tech & Skills Council — enrolment store
-- Run this in the Supabase SQL editor once, on a new project.
--
-- Security model:
--   * The anon key shipped in config.js is public by design.
--   * RLS below lets anonymous visitors INSERT and nothing else.
--     No SELECT, UPDATE or DELETE policy exists for anon, so the
--     table cannot be read back with that key — only through the
--     dashboard or a service-role key that never leaves a server.
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.enrolments (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  full_name         text not null check (char_length(trim(full_name)) between 2 and 120),
  email             text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  university        text not null check (university in ('REC','SNU','AU')),
  year_of_study     text not null check (year_of_study in ('1','2','3','4','other')),
  branch            text not null check (char_length(trim(branch)) between 2 and 120),

  experience        text     check (experience in ('none','some','comfortable')),
  interests         text     check (interests is null or char_length(interests) <= 500),
  attending_launch  boolean  not null default false,
  council_interest  boolean  not null default false,

  source            text     not null default 'website',
  turnstile_token   text,
  status            text     not null default 'new' check (status in ('new','confirmed','withdrawn'))
);

-- one enrolment per email
create unique index if not exists enrolments_email_key
  on public.enrolments (lower(email));

create index if not exists enrolments_university_idx
  on public.enrolments (university, created_at desc);

-- ------------------------------------------------------------
-- Row-level security
-- ------------------------------------------------------------
alter table public.enrolments enable row level security;

-- Anonymous visitors may add themselves, and only themselves.
drop policy if exists "anon can enrol" on public.enrolments;
create policy "anon can enrol"
  on public.enrolments
  for insert
  to anon
  with check (
    status = 'new'
    and source = 'website'
  );

-- Deliberately NO select/update/delete policy for anon or authenticated.
-- Council members read enrolments through the Supabase dashboard, or
-- through a server-side integration using the service-role key.

-- ------------------------------------------------------------
-- Handy views for the council (dashboard use)
-- ------------------------------------------------------------
create or replace view public.enrolment_counts as
  select university,
         count(*)                                    as total,
         count(*) filter (where attending_launch)    as attending_launch,
         count(*) filter (where council_interest)    as council_interest,
         max(created_at)                             as latest
  from public.enrolments
  group by university;

comment on table public.enrolments is
  'Launch Day and membership enrolments. Personal data: store securely, never share outside the council without explicit consent, delete on request.';
