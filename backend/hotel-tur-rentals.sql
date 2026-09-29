-- Hotel Tur room register and private rental PDFs.
create table if not exists public.rental_rooms (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  building text not null check (building in ('Smolańska 3','Smolańska 4','Parking')),
  floor text not null check (
    (building='Smolańska 3' and floor in ('Piwnica','Parter','1 piętro','2 piętro','3 piętro','4 piętro')) or
    (building='Smolańska 4' and floor in ('Piwnica','Parter','1 piętro','2 piętro','3 piętro')) or
    (building='Parking' and floor='Parking')),
  room_number text not null check (char_length(trim(room_number)) between 1 and 80),
  area_sqm numeric(12,2) not null check (area_sqm>0),
  has_electric_meter boolean not null default false,
  meter_reading numeric(14,3),
  meter_read_on date,
  created_at timestamptz not null default now(),
  unique(location_id,building,floor,room_number),
  check ((has_electric_meter and (meter_reading is null or meter_reading>=0) and (meter_reading is null)=(meter_read_on is null)) or
    (not has_electric_meter and meter_reading is null and meter_read_on is null))
);
alter table public.rental_agreements add column if not exists room_id uuid references public.rental_rooms(id) on delete restrict;
create index if not exists rental_agreements_room_idx on public.rental_agreements(room_id);

create or replace function public.validate_rental_room_location() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.room_id is not null and not exists (
    select 1 from public.rental_rooms x where x.id=new.room_id and x.location_id=new.location_id
  ) then raise exception 'Pomieszczenie nie należy do wybranego obiektu'; end if;
  return new;
end $$;
drop trigger if exists rental_room_location_guard on public.rental_agreements;
create trigger rental_room_location_guard before insert or update of room_id,location_id on public.rental_agreements
for each row execute function public.validate_rental_room_location();

alter table public.rental_rooms enable row level security;
drop policy if exists rental_rooms_read on public.rental_rooms;
drop policy if exists rental_rooms_insert on public.rental_rooms;
drop policy if exists rental_rooms_update on public.rental_rooms;
drop policy if exists rental_rooms_delete on public.rental_rooms;
create policy rental_rooms_read on public.rental_rooms for select to authenticated
  using (public.can_manage_rentals() and public.can_access_location(location_id));
create policy rental_rooms_insert on public.rental_rooms for insert to authenticated
  with check (public.can_manage_rentals() and public.can_access_location(location_id) and
    exists (select 1 from public.locations l where l.id=location_id and l.name ilike '%Hotel Tur%'));
create policy rental_rooms_update on public.rental_rooms for update to authenticated
  using (public.can_manage_rentals() and public.can_access_location(location_id))
  with check (public.can_manage_rentals() and public.can_access_location(location_id));
create policy rental_rooms_delete on public.rental_rooms for delete to authenticated
  using (public.is_admin());
grant select,insert,update,delete on public.rental_rooms to authenticated;

create table if not exists public.rental_documents (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rental_agreements(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 250),
  size_bytes bigint not null check (size_bytes>0 and size_bytes<=52428800),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists rental_documents_rental_idx on public.rental_documents(rental_id);
alter table public.rental_documents enable row level security;
drop policy if exists rental_documents_read on public.rental_documents;
drop policy if exists rental_documents_insert on public.rental_documents;
drop policy if exists rental_documents_delete on public.rental_documents;
create policy rental_documents_read on public.rental_documents for select to authenticated using (
  exists(select 1 from public.rental_agreements r where r.id=rental_id));
create policy rental_documents_insert on public.rental_documents for insert to authenticated with check (
  uploaded_by=auth.uid() and storage_path like rental_id::text||'/%' and
  exists(select 1 from public.rental_agreements r where r.id=rental_id and
    public.can_manage_rentals() and public.can_access_location(r.location_id)));
create policy rental_documents_delete on public.rental_documents for delete to authenticated using (
  exists(select 1 from public.rental_agreements r where r.id=rental_id and
    public.can_manage_rentals() and public.can_access_location(r.location_id)));
grant select,insert,delete on public.rental_documents to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('rental-documents','rental-documents',false,52428800,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=52428800,allowed_mime_types=array['application/pdf'];
drop policy if exists rental_pdf_read on storage.objects;
drop policy if exists rental_pdf_upload on storage.objects;
drop policy if exists rental_pdf_delete on storage.objects;
create policy rental_pdf_read on storage.objects for select to authenticated using (
  bucket_id='rental-documents' and exists (
    select 1 from public.rental_agreements r where r.id=(split_part(name,'/',1))::uuid));
create policy rental_pdf_upload on storage.objects for insert to authenticated with check (
  bucket_id='rental-documents' and public.can_manage_rentals() and exists (
    select 1 from public.rental_agreements r where r.id=(split_part(name,'/',1))::uuid
      and public.can_access_location(r.location_id)));
create policy rental_pdf_delete on storage.objects for delete to authenticated using (
  bucket_id='rental-documents' and public.can_manage_rentals() and exists (
    select 1 from public.rental_agreements r where r.id=(split_part(name,'/',1))::uuid
      and public.can_access_location(r.location_id)));
