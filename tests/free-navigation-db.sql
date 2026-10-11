-- Production-safe checks: no external requests and no lasting changes.
savepoint free_navigation_checks;
do $$ declare owner_id uuid;participant uuid;begin
 select a.owner_id into owner_id from public.imperium_access_control a;
 select id into participant from public.profiles where active and id<>owner_id limit 1;
 perform set_config('imperium.nav_owner',owner_id::text,true);perform set_config('imperium.nav_participant',participant::text,true);
end $$;
set local role authenticated;
do $$ declare denied boolean;status jsonb;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('imperium.nav_participant'),'role','authenticated')::text,true);
 perform set_config('request.method','POST',true);perform set_config('request.path','/rpc/imperium_navigation_route',true);perform public.imperium_guard_access();
 status:=public.imperium_navigation_status();if status->>'provider'<>'ORS' or status?'api_key' then raise exception 'Secret exposed';end if;
 denied:=false;begin perform public.imperium_navigation_configure('test-only-invalid-api-key-123456789');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Participant could replace free provider credentials';end if;
 denied:=false;begin perform * from imperium_private.navigation_free_config;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Participant could read provider key';end if;
 denied:=false;begin perform public.imperium_navigation_route('{"vehicle":{"mode":"spaceship"}}');exception when others then denied:=true;end;if not denied then raise exception 'Invalid route accepted';end if;
 perform set_config('request.path','/rpc/salary_set_compensation',true);denied:=false;begin perform public.imperium_guard_access();exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Operational permissions widened';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('imperium.nav_owner'),'role','authenticated')::text,true);
 perform public.imperium_navigation_configure('test-only-invalid-api-key-123456789');status:=public.imperium_navigation_status();if status->>'configured'<>'true' or status::text like '%test-only%' then raise exception 'Configuration state failed';end if;
 denied:=false;begin perform * from imperium_private.navigation_free_config;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Owner can retrieve stored key';end if;
end $$;
reset role;
do $$ declare p jsonb;q jsonb;denied boolean;begin
 p:='{"origin":[53.43,14.55],"destination":[52.52,13.4],"vehicle":{"mode":"truck","height":400,"width":255,"length":1650,"currentWeight":40000,"grossWeight":40000,"weightPerAxle":11500,"axles":5,"trailers":1,"emission":"euro6","co2":"2","confirmed":true},"roads":"free","avoid":["ferry"],"currency":"EUR"}';
 q:=imperium_private.navigation_ors_parameters(p);
 if (q#>>'{options,profile_params,restrictions,height}')::numeric<>4 or (q#>>'{options,profile_params,restrictions,weight}')::numeric<>40 or q#>>'{options,vehicle_type}'<>'hgv' or not ((q#>'{options,avoid_features}')?'tollways') then raise exception 'Truck parameters lost';end if;
 denied:=false;begin perform imperium_private.navigation_parameters(p-'origin');exception when others then denied:=true;end;if not denied then raise exception 'Missing coordinate accepted';end if;
 denied:=false;begin perform imperium_private.navigation_parameters(jsonb_set(p,'{vehicle,confirmed}','false'));exception when others then denied:=true;end;if not denied then raise exception 'Unconfirmed truck accepted';end if;
 denied:=false;begin perform imperium_private.navigation_parameters(jsonb_set(p,'{vehicle,currentWeight}','90000'));exception when others then denied:=true;end;if not denied then raise exception 'Invalid gross mass accepted';end if;
end $$;
update public.profiles set active=false where id=current_setting('imperium.nav_participant')::uuid;
set local role authenticated;
do $$ declare denied boolean:=false;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('imperium.nav_participant'),'role','authenticated')::text,true);
 begin perform public.imperium_navigation_status();exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Inactive user accessed navigation';end if;
end $$;
reset role;
rollback to savepoint free_navigation_checks;
release savepoint free_navigation_checks;
