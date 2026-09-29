create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
create table public.profiles(id uuid primary key,active boolean not null default true);
insert into public.profiles values('00000000-0000-0000-0000-000000000001',true),('00000000-0000-0000-0000-000000000002',true);
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;
-- Verify compatibility with a legacy numeric chat ID.
create table public.chat_messages(id bigint primary key,user_id uuid not null,message text not null,created_at timestamptz not null default now());
