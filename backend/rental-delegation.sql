-- Delegate rental agreements without granting broad administrator rights.
alter table public.profiles add column if not exists can_manage_rentals boolean not null default false;

create or replace function public.can_manage_rentals()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid()
    and p.active=true and (p.role='admin' or p.can_manage_rentals));
$$;

drop policy if exists rentals_admin on public.rental_agreements;
drop policy if exists rentals_read on public.rental_agreements;
drop policy if exists rentals_insert_delegated on public.rental_agreements;
drop policy if exists rentals_update_delegated on public.rental_agreements;
drop policy if exists rentals_delete_admin on public.rental_agreements;
create policy rentals_read on public.rental_agreements for select to authenticated
  using (public.is_admin() or (public.can_manage_rentals() and public.can_access_location(location_id)));
create policy rentals_insert_delegated on public.rental_agreements for insert to authenticated
  with check (public.can_manage_rentals() and public.can_access_location(location_id));
create policy rentals_update_delegated on public.rental_agreements for update to authenticated
  using (public.can_manage_rentals() and public.can_access_location(location_id))
  with check (public.can_manage_rentals() and public.can_access_location(location_id));
create policy rentals_delete_admin on public.rental_agreements for delete to authenticated
  using (public.is_admin());

-- If exactly one active account is named Zenon, grant him rental access.
-- Location assignments still limit which buildings he can manage.
do $$ begin
  if (select count(*) from public.profiles where active=true and full_name ~* '(^|[[:space:]])Zenon([[:space:]]|$)')=1 then
    update public.profiles set can_manage_rentals=true
    where active=true and full_name ~* '(^|[[:space:]])Zenon([[:space:]]|$)';
  end if;
end $$;
