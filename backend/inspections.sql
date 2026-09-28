-- Technical inspection expiry register, separate from timed tasks.
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  last_inspected date,
  valid_until date not null,
  notes text not null default '' check (char_length(notes) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspections_date_order check (last_inspected is null or last_inspected <= valid_until)
);
create index if not exists inspections_location_valid_until_idx on public.inspections(location_id,valid_until);
alter table public.inspections enable row level security;
drop policy if exists inspections_read on public.inspections;
create policy inspections_read on public.inspections for select to authenticated
  using (public.can_access_location(location_id));
drop policy if exists inspections_admin_insert on public.inspections;
create policy inspections_admin_insert on public.inspections for insert to authenticated
  with check (public.is_admin());
drop policy if exists inspections_admin_update on public.inspections;
create policy inspections_admin_update on public.inspections for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists inspections_admin_delete on public.inspections;
create policy inspections_admin_delete on public.inspections for delete to authenticated
  using (public.is_admin());
grant select,insert,update,delete on public.inspections to authenticated;
