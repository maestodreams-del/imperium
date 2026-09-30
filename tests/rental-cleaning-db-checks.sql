do $$
begin
  if not exists(select 1 from public.rental_agreements where id=1 and cleaning_net=0 and cleaning_gross=0) then
    raise exception 'Existing agreement must retain zero cleaning charges';
  end if;
  update public.rental_agreements set cleaning_net=100, cleaning_gross=123 where id=1;
  begin
    update public.rental_agreements set cleaning_net=-1 where id=1;
    raise exception 'Negative charge accepted';
  exception when check_violation then null;
  end;
  if not exists(select 1 from public.rental_agreements where id=1 and cleaning_net=100 and cleaning_gross=123) then
    raise exception 'Cleaning charges were not persisted';
  end if;
end $$;
