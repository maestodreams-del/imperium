-- CI-only HTTP substitute. Never installed on the production database.
create schema if not exists extensions;
create table public.navigation_test_requests(endpoint text,query jsonb);
create or replace function extensions.http_get(uri text,data jsonb) returns table(status integer,content varchar) language plpgsql as $$
begin
 insert into public.navigation_test_requests values(uri,data);
 return query select 200,'{"routes":[],"items":[{"title":"Szczecin","position":{"lat":53.43,"lng":14.55},"address":{"label":"Szczecin, Polska"}}]}'::varchar;
end $$;
