create table if not exists public.extra_missions(
 id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles(id),
 location_id uuid references public.locations(id),title text not null check(length(btrim(title)) between 1 and 120),
 description text not null check(length(btrim(description)) between 1 and 4000),
 done_on date not null default (now() at time zone 'Europe/Warsaw')::date,
 created_at timestamptz not null default now(),attachments jsonb not null default '[]'::jsonb check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=10)
);
create index if not exists extra_missions_worker_date on public.extra_missions(profile_id,done_on desc,created_at desc);
alter table public.extra_missions enable row level security;
create or replace function public.extra_mission_active() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and active) $$;
create or replace function public.extra_mission_attachments_valid(a jsonb,p_owner uuid) returns boolean language sql immutable set search_path=public as $$ select not exists(select 1 from jsonb_array_elements(a) x where jsonb_typeof(x)<>'object' or coalesce(x->>'path','') not like p_owner::text||'/%' or coalesce(x->>'name','')='' or coalesce(x->>'bucket','')<>'extra-mission-files') $$;
drop policy if exists extra_missions_read on public.extra_missions;
drop policy if exists extra_missions_insert on public.extra_missions;
create policy extra_missions_read on public.extra_missions for select to authenticated using(public.extra_mission_active() and (profile_id=auth.uid() or public.is_admin()));
create policy extra_missions_insert on public.extra_missions for insert to authenticated with check(public.extra_mission_active() and profile_id=auth.uid() and (location_id is null or public.can_access_location(location_id)) and public.extra_mission_attachments_valid(attachments,auth.uid()));
revoke all on public.extra_missions from authenticated;
grant select on public.extra_missions to authenticated;
grant insert(id,profile_id,location_id,title,description,attachments) on public.extra_missions to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('extra-mission-files','extra-mission-files',false,52428800) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
drop policy if exists extra_mission_files_read on storage.objects;
drop policy if exists extra_mission_files_upload on storage.objects;
drop policy if exists extra_mission_files_delete on storage.objects;
create policy extra_mission_files_read on storage.objects for select to authenticated using(bucket_id='extra-mission-files' and public.extra_mission_active() and (public.is_admin() or (storage.foldername(name))[1]=auth.uid()::text));
create policy extra_mission_files_upload on storage.objects for insert to authenticated with check(bucket_id='extra-mission-files' and public.extra_mission_active() and (storage.foldername(name))[1]=auth.uid()::text);
create policy extra_mission_files_delete on storage.objects for delete to authenticated using(bucket_id='extra-mission-files' and public.extra_mission_active() and (storage.foldername(name))[1]=auth.uid()::text);
