-- Registered address is distinct from the premises rented by the company.
alter table public.rental_agreements
  add column if not exists registered_address text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.rental_agreements'::regclass and conname='rental_registered_address_length') then
    alter table public.rental_agreements add constraint rental_registered_address_length
      check (char_length(registered_address)<=300);
  end if;
end $$;
