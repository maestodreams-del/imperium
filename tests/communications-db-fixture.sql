-- Isolated test database only. Synthetic identities.

create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
create schema auth;create schema storage;
grant usage on schema auth,storage,public to anon,authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
create table public.profiles(id uuid primary key,full_name text,active boolean,role text,created_at timestamptz default now());
create table auth.users(id uuid primary key);
insert into public.profiles(id,full_name,active,role) values('10000000-0000-4000-8000-000000000001','Owner',true,'admin'),('10000000-0000-4000-8000-000000000002','Other admin',true,'admin');
insert into auth.users select id from public.profiles;
create table public.salary_managers(profile_id uuid primary key references public.profiles);
insert into public.salary_managers values('10000000-0000-4000-8000-000000000001');
create table public.tasks(id int,title text);insert into public.tasks values(1,'Private task');
create table public.app_updates(version int,active boolean);insert into public.app_updates values(1,true);
create table storage.objects(id int,bucket_id text);insert into storage.objects values(1,'task-files'),(2,'app-updates');
alter table public.profiles enable row level security;create policy profiles_read on public.profiles for select to authenticated using(true);
alter table public.tasks enable row level security;create policy tasks_read on public.tasks for select to authenticated using(true);
alter table public.app_updates enable row level security;create policy updates_read on public.app_updates for select to authenticated using(true);
alter table storage.objects enable row level security;create policy objects_read on storage.objects for select to authenticated using(true);
grant select,insert,update,delete on all tables in schema public,storage to authenticated;
