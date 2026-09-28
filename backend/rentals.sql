-- Rental terms and the correspondence journal for each location.
create table if not exists public.rental_agreements (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  contractor text not null check (char_length(trim(contractor)) between 1 and 160),
  nip text not null default '' check (char_length(nip)<=24),
  contact_person text not null default '' check (char_length(contact_person)<=120),
  phone text not null default '' check (char_length(phone)<=50),
  email text not null default '' check (char_length(email)<=254),
  starts_on date not null,
  ends_on date,
  indefinite boolean not null default false,
  area_sqm numeric(12,2) not null check (area_sqm>0),
  price_sqm_net numeric(12,2) not null check (price_sqm_net>=0),
  price_sqm_gross numeric(12,2) not null check (price_sqm_gross>=0),
  parking_net numeric(12,2) not null default 0 check (parking_net>=0),
  parking_gross numeric(12,2) not null default 0 check (parking_gross>=0),
  internet_net numeric(12,2) not null default 0 check (internet_net>=0),
  internet_gross numeric(12,2) not null default 0 check (internet_gross>=0),
  created_at timestamptz not null default now(),
  constraint rental_term_check check ((indefinite and ends_on is null) or (not indefinite and ends_on>=starts_on))
);
create index if not exists rental_agreements_location_idx on public.rental_agreements(location_id,starts_on desc);

create table if not exists public.rental_correspondence (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  rental_id uuid references public.rental_agreements(id) on delete set null,
  kind text not null check (kind in ('incoming','outgoing','note')),
  subject text not null check (char_length(trim(subject)) between 1 and 160),
  body text not null check (char_length(trim(body)) between 1 and 10000),
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rental_correspondence_location_idx on public.rental_correspondence(location_id,occurred_at desc);

create or replace function public.validate_rental_correspondence_location()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.rental_id is not null and not exists (
    select 1 from public.rental_agreements r where r.id=new.rental_id and r.location_id=new.location_id
  ) then raise exception 'RENTAL_LOCATION_MISMATCH'; end if;
  return new;
end;
$$;
drop trigger if exists rental_correspondence_location_guard on public.rental_correspondence;
create trigger rental_correspondence_location_guard before insert or update on public.rental_correspondence
for each row execute function public.validate_rental_correspondence_location();

alter table public.rental_agreements enable row level security;
alter table public.rental_correspondence enable row level security;
drop policy if exists rentals_admin on public.rental_agreements;
create policy rentals_admin on public.rental_agreements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists rental_correspondence_admin on public.rental_correspondence;
create policy rental_correspondence_admin on public.rental_correspondence for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select,insert,update,delete on public.rental_agreements,public.rental_correspondence to authenticated;
