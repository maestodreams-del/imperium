-- Monthly cleaning charges use the existing rental agreement permissions.
alter table public.rental_agreements
  add column if not exists cleaning_net numeric(12,2) not null default 0 check (cleaning_net>=0),
  add column if not exists cleaning_gross numeric(12,2) not null default 0 check (cleaning_gross>=0);
notify pgrst, 'reload schema';
