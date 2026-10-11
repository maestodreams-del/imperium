-- CI only; never deploy these HTTP substitutes.
create type extensions.http_header as (field varchar,value varchar);
create type extensions.http_request as (method text,uri varchar,headers extensions.http_header[],content_type varchar,content varchar);
create function extensions.http_header(field varchar,value varchar) returns extensions.http_header language sql as $$select $1,$2$$;
alter table navigation_test_requests add column method text,add column headers jsonb;
create or replace function extensions.http_get(uri text,data jsonb) returns table(status integer,content varchar) language plpgsql as $$
begin
 insert into public.navigation_test_requests(endpoint,query,method) values(uri,data,'GET');
 return query select 200,'{"features":[{"properties":{"label":"Szczecin, Polska"},"geometry":{"coordinates":[14.55,53.43]}}]}'::varchar;
end $$;
create function extensions.http(req extensions.http_request) returns table(status integer,content varchar) language plpgsql as $$
begin
 insert into public.navigation_test_requests(endpoint,query,method,headers) values(req.uri,req.content::jsonb,req.method,to_jsonb(req.headers));
 return query select 200,'{"type":"FeatureCollection","features":[]}'::varchar;
end $$;
