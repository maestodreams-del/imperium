-- Isolated CI database only. All identities below are synthetic fixtures.
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth to authenticated,anon;
create table public.profiles(id uuid primary key,full_name text not null,role text not null,active boolean not null default true,created_at timestamptz not null default now());
create table public.work_attendance(id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles(id),started_at timestamptz not null,ended_at timestamptz,check(ended_at is null or ended_at>=started_at));
insert into public.profiles(id,full_name,role) values
 ('00000000-0000-0000-0000-000000000001','Owner','admin'),
 ('00000000-0000-0000-0000-000000000002','Zenon','worker'),
 ('00000000-0000-0000-0000-000000000003','Mikalai','worker'),
 ('00000000-0000-0000-0000-000000000004','Mikita','worker'),
 ('00000000-0000-0000-0000-000000000005','Dmytro Test','worker'),
 ('00000000-0000-0000-0000-000000000006','Olena','worker');
