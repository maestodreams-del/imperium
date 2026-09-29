-- Progress is personal to the recipient; unfinished alerts still stay in Important.
alter table public.important_alerts add column if not exists in_progress_at timestamptz;
create or replace function public.set_important_alert_progress(p_id uuid,p_in_progress boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.can_view_important() then raise exception 'NO_ACCESS'; end if;
  update public.important_alerts
     set in_progress_at=case when p_in_progress then now() else null end
   where id=p_id and recipient_id=auth.uid() and resolved_at is null
     and public.can_access_location(location_id);
end $$;
grant execute on function public.set_important_alert_progress(uuid,boolean) to authenticated;
