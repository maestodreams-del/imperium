-- Free navigation through the current HeiGIT API. No HERE fallback or paid calls.
create table if not exists imperium_private.navigation_free_config(singleton boolean primary key default true check(singleton),api_key text not null,updated_at timestamptz not null default now());
create table if not exists imperium_private.navigation_free_usage(kind text not null,day date not null,requests integer not null,minute timestamptz not null,minute_requests integer not null,primary key(kind,day));
revoke all on all tables in schema imperium_private from public,anon,authenticated;

create or replace function public.imperium_navigation_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.imperium_social_active() then raise insufficient_privilege;end if;
 return jsonb_build_object('configured',exists(select 1 from imperium_private.navigation_free_config),'provider','ORS','free',true,'daily_limit',200,'toll_prices',false);
end $$;
create or replace function public.imperium_navigation_configure(p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.imperium_access_status() then raise insufficient_privilege;end if;
 if p_key is null or length(btrim(p_key)) not between 20 and 512 or btrim(p_key)!~'^[A-Za-z0-9_.=-]+$' then raise exception 'Wklej klucz openrouteservice z bezpłatnego konta HeiGIT.';end if;
 insert into imperium_private.navigation_free_config(singleton,api_key) values(true,btrim(p_key)) on conflict(singleton) do update set api_key=excluded.api_key,updated_at=now();
 return public.imperium_navigation_status();
end $$;

create or replace function imperium_private.navigation_ors_request(kind text,profile text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare k text;code integer;body text;n integer;m integer;endpoint text;current_minute timestamptz:=date_trunc('minute',clock_timestamp());
begin
 if not public.imperium_social_active() then raise insufficient_privilege;end if;
 if kind is null or kind not in ('search','route') or (kind='route' and coalesce(profile,'') not in ('driving-car','driving-hgv')) then raise insufficient_privilege;end if;
 select api_key into k from imperium_private.navigation_free_config where singleton;
 if k is null then return jsonb_build_object('error','Połącz bezpłatne konto openrouteservice w zakładce Nawigacja.','code','not_configured');end if;
 insert into imperium_private.navigation_usage(profile_id,day,requests,minute,minute_requests) values(auth.uid(),current_date,1,current_minute,1)
 on conflict(profile_id,day) do update set requests=navigation_usage.requests+1,minute=current_minute,minute_requests=case when navigation_usage.minute=current_minute then navigation_usage.minute_requests+1 else 1 end returning requests,minute_requests into n,m;
 if n>200 or m>20 then return jsonb_build_object('error','Limit zapytań nawigacji osiągnięty. Spróbuj później.','code','rate_limit');end if;
 -- Shared-key limits apply across all participants; reaching one stops requests.
 insert into imperium_private.navigation_free_usage(kind,day,requests,minute,minute_requests) values(kind,current_date,1,current_minute,1)
 on conflict on constraint navigation_free_usage_pkey do update set requests=navigation_free_usage.requests+1,minute=current_minute,minute_requests=case when navigation_free_usage.minute=current_minute then navigation_free_usage.minute_requests+1 else 1 end returning requests,minute_requests into n,m;
 if n>(case kind when 'route' then 1900 else 900 end) or m>35 then return jsonb_build_object('error','Wspólny limit bezpłatnej nawigacji osiągnięty. Spróbuj później.','code','rate_limit');end if;
 begin
  perform set_config('http.curlopt_timeout_msec','6500',true);
  if kind='search' then
   select status,content into code,body from extensions.http_get('https://api.heigit.org/pelias/v1/search',payload||jsonb_build_object('api_key',k));
  else
   endpoint:='https://api.heigit.org/openrouteservice/v2/directions/'||profile||'/geojson';
   select status,content into code,body from extensions.http(('POST',endpoint,array[extensions.http_header('Authorization',k)],'application/json',payload::text)::extensions.http_request);
  end if;
 exception when others then return jsonb_build_object('error','Brak odpowiedzi openrouteservice. Spróbuj ponownie.','code','network_error');end;
 if code in (401,403) then return jsonb_build_object('error','Sprawdź klucz openrouteservice i dostęp do usług w bezpłatnym koncie HeiGIT. Klucz HERE tutaj nie działa.','code','provider_access');end if;
 if code=429 then return jsonb_build_object('error','Limit bezpłatnego serwisu osiągnięty. Spróbuj później.','code','provider_limit');end if;
 if code<>200 then return jsonb_build_object('error','Nie znaleziono trasy dla tych ustawień lub przekroczono ograniczenia serwisu. Sprawdź punkty i pojazd.','code','provider_error');end if;
 begin return body::jsonb;exception when others then return jsonb_build_object('error','Nieprawidłowa odpowiedź openrouteservice.','code','provider_error');end;
end $$;

create or replace function imperium_private.navigation_ors_parameters(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare v jsonb:=p->'vehicle';q jsonb;opts jsonb:='{}';features jsonb:='[]';a text;
begin
 -- Reuse the established coordinate/vehicle validation, without issuing a HERE request.
 perform imperium_private.navigation_parameters(p);
 if p->>'roads'<>'allow' then features:=features||'"tollways"'::jsonb;end if;
 for a in select jsonb_array_elements_text(coalesce(p->'avoid','[]'::jsonb)) loop
  if a='controlledAccessHighway' then features:=features||'"highways"'::jsonb;
  elsif a='ferry' then features:=features||'"ferries"'::jsonb;
  else raise exception 'Bezpłatny serwis obsługuje unikanie opłat, autostrad i promów. Odśwież ustawienia trasy.';end if;
 end loop;
 opts:=jsonb_build_object('avoid_features',features);
 if v->>'mode'='truck' then
  opts:=opts||jsonb_build_object('vehicle_type','hgv','profile_params',jsonb_build_object('restrictions',jsonb_build_object('height',(v->>'height')::numeric/100,'width',(v->>'width')::numeric/100,'length',(v->>'length')::numeric/100,'weight',(v->>'currentWeight')::numeric/1000,'axleload',(v->>'weightPerAxle')::numeric/1000)));
 end if;
 q:=jsonb_build_object('coordinates',jsonb_build_array(jsonb_build_array(p->'origin'->1,p->'origin'->0),jsonb_build_array(p->'destination'->1,p->'destination'->0)),'preference','fastest','units','m','language','pl','instructions',true,'instructions_format','text','extra_info',jsonb_build_array('tollways'),'options',opts);
 return q;
end $$;
create or replace function public.imperium_navigation_search(p_query text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.imperium_social_active() then raise insufficient_privilege;end if;
 if p_query is null or length(btrim(p_query)) not between 3 and 250 then raise exception 'Wpisz adres (3–250 znaków).';end if;
 result:=imperium_private.navigation_ors_request('search',null,jsonb_build_object('text',btrim(p_query),'size',5,'lang','pl'));
 if result?'error' then return result;end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('title',i->'properties'->>'label','position',jsonb_build_object('lat',i->'geometry'->'coordinates'->1,'lng',i->'geometry'->'coordinates'->0),'address',i->'properties'->>'label')) from jsonb_array_elements(result->'features') i),'[]'::jsonb));
end $$;
create or replace function public.imperium_navigation_route(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare data jsonb;payload jsonb;
begin
 if not public.imperium_social_active() then raise insufficient_privilege;end if;
 payload:=imperium_private.navigation_ors_parameters(p_request);
 data:=imperium_private.navigation_ors_request('route',case p_request->'vehicle'->>'mode' when 'truck' then 'driving-hgv' else 'driving-car' end,payload);
 if data?'error' then return data;end if;
 return data||jsonb_build_object('provider','ORS');
end $$;
revoke all on all functions in schema imperium_private from public,anon,authenticated;
notify pgrst,'reload schema';
