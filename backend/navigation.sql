-- HERE credentials are server-only. Coordinates are used for the requested route;
-- this module does not store location history or expose it to other participants.
create schema if not exists imperium_private;
revoke all on schema imperium_private from public,anon,authenticated;
create schema if not exists extensions;
create extension if not exists http with schema extensions;
create table if not exists imperium_private.navigation_config(singleton boolean primary key default true check(singleton),api_key text not null,updated_at timestamptz not null default now());
create table if not exists imperium_private.navigation_usage(profile_id uuid not null,day date not null,requests integer not null default 0,minute timestamptz not null,minute_requests integer not null default 0,primary key(profile_id,day));
revoke all on all tables in schema imperium_private from public,anon,authenticated;

create or replace function public.imperium_navigation_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.imperium_social_active() then raise insufficient_privilege;end if;
 return jsonb_build_object('configured',exists(select 1 from imperium_private.navigation_config where length(api_key)>0),'provider','HERE','daily_limit',200);
end $$;
create or replace function public.imperium_navigation_configure(p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.imperium_access_status() then raise insufficient_privilege;end if;
 if p_key is null or length(btrim(p_key)) not between 20 and 200 or btrim(p_key)!~'^[A-Za-z0-9_-]+$' then raise exception 'Wklej poprawny klucz API HERE.';end if;
 insert into imperium_private.navigation_config(singleton,api_key) values(true,btrim(p_key)) on conflict(singleton) do update set api_key=excluded.api_key,updated_at=now();
 return public.imperium_navigation_status();
end $$;

create or replace function imperium_private.navigation_request(p_endpoint text,p_query jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare k text;code integer;body text;n integer;m integer;current_minute timestamptz:=date_trunc('minute',clock_timestamp());
begin
 if not public.imperium_social_active() then raise insufficient_privilege;end if;
 if p_endpoint not in ('https://router.hereapi.com/v8/routes','https://geocode.search.hereapi.com/v1/geocode') then raise insufficient_privilege;end if;
 select api_key into k from imperium_private.navigation_config where singleton;
 if k is null then return jsonb_build_object('error','Właściciel musi najpierw połączyć HERE w zakładce Nawigacja.','code','not_configured');end if;
 insert into imperium_private.navigation_usage(profile_id,day,requests,minute,minute_requests) values(auth.uid(),current_date,1,current_minute,1)
 on conflict(profile_id,day) do update set requests=navigation_usage.requests+1,minute=current_minute,minute_requests=case when navigation_usage.minute=current_minute then navigation_usage.minute_requests+1 else 1 end returning requests,minute_requests into n,m;
 if n>200 or m>20 then return jsonb_build_object('error','Limit zapytań nawigacji osiągnięty. Spróbuj później.','code','rate_limit');end if;
 -- A network failure must return generic text: never echo a URL containing the key.
 begin
  perform set_config('http.curlopt_timeout_msec','6500',true);
  select status,content into code,body from extensions.http_get(p_endpoint,p_query||jsonb_build_object('apiKey',k));
 exception when others then return jsonb_build_object('error','Brak odpowiedzi serwisu tras. Sprawdź połączenie i spróbuj ponownie.','code','network_error');end;
 if code in (401,403) then return jsonb_build_object('error','HERE odrzucił dostęp. Właściciel powinien sprawdzić klucz i uprawnienia do Routing, Toll Costs oraz Geocoding.','code','provider_access');end if;
 if code=429 then return jsonb_build_object('error','Limit usługi HERE. Spróbuj później.','code','provider_limit');end if;
 if code<>200 then return jsonb_build_object('error','Serwis nie obliczył trasy. Sprawdź adresy i parametry pojazdu.','code','provider_error');end if;
 begin return body::jsonb;exception when others then return jsonb_build_object('error','Nieprawidłowa odpowiedź serwisu tras.','code','provider_error');end;
end $$;

create or replace function public.imperium_navigation_search(p_query text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.imperium_social_active() then raise insufficient_privilege;end if;
 if p_query is null or length(btrim(p_query)) not between 3 and 250 then raise exception 'Wpisz adres (3–250 znaków).';end if;
 result:=imperium_private.navigation_request('https://geocode.search.hereapi.com/v1/geocode',jsonb_build_object('q',btrim(p_query),'lang','pl-PL','limit',5));
 if result?'error' then return result;end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('title',i->>'title','position',i->'position','address',i->'address'->>'label')) from jsonb_array_elements(result->'items') i),'[]'::jsonb));
end $$;

create or replace function imperium_private.navigation_parameters(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare q jsonb;v jsonb:=p->'vehicle';mode text:=v->>'mode';roads text:=p->>'roads';avoid text[]:=array[]::text[];a text;x numeric;field text;bounds numeric[];coord jsonb;
begin
 if p is null or length(p::text)>5000 or mode is null or mode not in ('car','truck') or roads is null or roads not in ('allow','avoid','free') or coalesce(p->>'currency','') not in ('PLN','EUR') then raise exception 'Nieprawidłowe ustawienia trasy.';end if;
 foreach field in array array['origin','destination'] loop
  coord:=p->field;
  if coalesce(jsonb_typeof(coord),'')<>'array' or jsonb_array_length(coord)<>2 or jsonb_typeof(coord->0)<>'number' or jsonb_typeof(coord->1)<>'number' or (coord->>0)::numeric not between -85 and 85 or (coord->>1)::numeric not between -180 and 180 then raise exception 'Wybierz punkt początkowy i docelowy.';end if;
 end loop;
 q:=jsonb_build_object('transportMode',mode,'origin',(p->'origin'->>0)||','||(p->'origin'->>1),'destination',(p->'destination'->>0)||','||(p->'destination'->>1),'routingMode','fast','alternatives',1,'return','polyline,summary,actions,instructions,tolls','spans','length,tollSystems,attributes,countryCode','currency',p->>'currency','lang','pl-PL','units','metric');
 if roads<>'allow' then avoid:=array_append(avoid,'tollRoad');end if;
 if jsonb_typeof(coalesce(p->'avoid','[]'::jsonb))<>'array' then raise exception 'Nieprawidłowe opcje unikania.';end if;
 for a in select jsonb_array_elements_text(coalesce(p->'avoid','[]'::jsonb)) loop
  if a not in ('ferry','controlledAccessHighway','tunnel','dirtRoad') then raise exception 'Nieprawidłowa opcja unikania.';end if;avoid:=array_append(avoid,a);
 end loop;
 if mode='truck' then
  if coalesce((v->>'confirmed')::boolean,false) is not true then raise exception 'Potwierdź parametry ciężarówki.';end if;
  foreach field in array array['height','width','length','currentWeight','grossWeight','weightPerAxle','axles','trailers'] loop
   bounds:=case field when 'height' then array[100,600] when 'width' then array[100,500] when 'length' then array[200,5000] when 'axles' then array[2,20] when 'trailers' then array[0,4] else array[500,100000] end;
   if coalesce(jsonb_typeof(v->field),'')<>'number' then raise exception 'Uzupełnij parametry ciężarówki.';end if;
   x:=(v->>field)::numeric;if x<bounds[1] or x>bounds[2] or x<>trunc(x) then raise exception 'Sprawdź masę, osie i wymiary pojazdu.';end if;
   q:=q||jsonb_build_object('vehicle['||(case field when 'axles' then 'axleCount' when 'trailers' then 'trailerCount' else field end)||']',x);
  end loop;
  if (v->>'currentWeight')::numeric>(v->>'grossWeight')::numeric or (v->>'weightPerAxle')::numeric>(v->>'currentWeight')::numeric then raise exception 'Masa rzeczywista nie może przekraczać DMC; sprawdź nacisk osi.';end if;
  if coalesce(v->>'emission','') not in ('euro1','euro2','euro3','euro4','euro5','euro6','euroEev') or coalesce(v->>'co2','') not in ('1','2','3','4','5') then raise exception 'Wybierz klasę Euro i CO₂.';end if;
  q:=q||jsonb_build_object('tolls[emissionType]',(v->>'emission')||';co2class='||(v->>'co2'));
 end if;
 if cardinality(avoid)>0 then q:=q||jsonb_build_object('avoid[features]',array_to_string(array(select distinct unnest(avoid)),','));end if;
 return q;
end $$;
create or replace function public.imperium_navigation_route(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.imperium_social_active() then raise insufficient_privilege;end if;
 return imperium_private.navigation_request('https://router.hereapi.com/v8/routes',imperium_private.navigation_parameters(p_request));
end $$;
revoke all on all functions in schema imperium_private from public,anon,authenticated;
revoke all on function public.imperium_navigation_status(),public.imperium_navigation_configure(text),public.imperium_navigation_search(text),public.imperium_navigation_route(jsonb) from public;
grant execute on function public.imperium_navigation_status(),public.imperium_navigation_configure(text),public.imperium_navigation_search(text),public.imperium_navigation_route(jsonb) to authenticated;
-- Preserve the existing owner gate; expose only these scoped RPCs to participants.
create or replace function public.imperium_guard_access() returns void language plpgsql security invoker set search_path='' as $$
declare p text:=current_setting('request.path',true);m text:=current_setting('request.method',true);
begin
 if auth.role()='service_role' or public.imperium_access_status() then return;end if;
 if m='POST' and p='/rpc/imperium_device_notice' then return;end if;
 if auth.uid() is not null and ((m='POST' and p in ('/rpc/imperium_access_status','/rpc/imperium_comms_feed','/rpc/imperium_ack_announcement','/rpc/imperium_register_notice_device','/rpc/imperium_revoke_notice_device','/rpc/imperium_social_directory','/rpc/imperium_social_save_card','/rpc/imperium_social_inbox','/rpc/imperium_social_thread','/rpc/imperium_social_send','/rpc/imperium_social_read','/rpc/imperium_navigation_status','/rpc/imperium_navigation_search','/rpc/imperium_navigation_route')) or (m='GET' and p in ('/app_updates','/profiles'))) then return;end if;
 raise sqlstate '42501' using message='IMPERIUM_OWNER_ONLY: Dostęp wyłącznie dla właściciela.';
end $$;
notify pgrst,'reload schema';
