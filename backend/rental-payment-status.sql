-- Preserve existing agreements and historical correspondence while replacing
-- the correspondence UI with payer classification and premises details.
alter table public.rental_agreements
  add column if not exists premises_address text not null default '',
  add column if not exists premises_number text not null default '',
  add column if not exists payment_status text;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.rental_agreements'::regclass and conname='rental_premises_address_length') then
    alter table public.rental_agreements add constraint rental_premises_address_length check (char_length(premises_address)<=300);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.rental_agreements'::regclass and conname='rental_premises_number_length') then
    alter table public.rental_agreements add constraint rental_premises_number_length check (char_length(premises_number)<=80);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.rental_agreements'::regclass and conname='rental_payment_status_check') then
    alter table public.rental_agreements add constraint rental_payment_status_check
      check (payment_status is null or payment_status in ('reliable','monitor','problematic'));
  end if;
end $$;
