-- Invoice preparation. Sending to KSeF is server-side only and is not enabled by this migration.
create or replace function public.invoice_valid_nip(n text) returns boolean
language sql immutable set search_path='' as $$
  select case when n ~ '^[1-9][0-9]{9}$' then
    ((substring(n,1,1)::int*6 + substring(n,2,1)::int*5 + substring(n,3,1)::int*7 +
      substring(n,4,1)::int*2 + substring(n,5,1)::int*3 + substring(n,6,1)::int*4 +
      substring(n,7,1)::int*5 + substring(n,8,1)::int*6 + substring(n,9,1)::int*7) % 11)=substring(n,10,1)::int else false end;
$$;
create table if not exists public.invoice_sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 200),
  nip text not null unique check (public.invoice_valid_nip(nip)),
  street_address text not null check (char_length(trim(street_address)) between 1 and 250),
  postal_city text not null check (char_length(trim(postal_city)) between 1 and 150),
  bank_account text not null default '' check (char_length(bank_account)<=64),
  created_at timestamptz not null default now()
);

create or replace function public.invoice_lines_valid(lines jsonb) returns boolean
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(lines)='array' then jsonb_array_length(lines) between 1 and 100
    and not exists (
      select 1 from jsonb_array_elements(lines) x where
        jsonb_typeof(x)<>'object'
        or char_length(trim(coalesce(x->>'description',''))) not between 1 and 250
        or char_length(trim(coalesce(x->>'unit',''))) not between 1 and 20
        or case when coalesce(x->>'quantity','') ~ '^[0-9]{1,8}(\.[0-9]{1,3})?$'
          then (x->>'quantity')::numeric<=0 else true end
        or coalesce(x->>'unit_net','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
        or coalesce(x->>'vat_rate','') not in ('23','8','5')
    ) else false end;
$$;

create table if not exists public.invoice_drafts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.invoice_sellers(id) on delete restrict,
  rental_id uuid references public.rental_agreements(id) on delete set null,
  invoice_number text not null check (char_length(trim(invoice_number)) between 1 and 80),
  issue_date date not null,
  sale_date date not null,
  due_date date not null,
  buyer_name text not null check (char_length(trim(buyer_name)) between 1 and 200),
  buyer_nip text not null check (public.invoice_valid_nip(buyer_nip)),
  buyer_street text not null check (char_length(trim(buyer_street)) between 1 and 250),
  buyer_postal_city text not null check (char_length(trim(buyer_postal_city)) between 1 and 150),
  lines jsonb not null check (public.invoice_lines_valid(lines)),
  status text not null default 'draft' check (status in ('draft','sending','processing','accepted','rejected')),
  ksef_reference text,
  ksef_session text,
  ksef_number text,
  ksef_error text,
  issued_xml text,
  upo_xml text,
  sent_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(seller_id,invoice_number),
  check (due_date>=issue_date)
);
create index if not exists invoice_drafts_created_idx on public.invoice_drafts(created_at desc);

create or replace function public.protect_invoice_draft() returns trigger
language plpgsql set search_path='' as $$
begin
  if auth.role()='service_role' then
    new.updated_at=now();return new;
  end if;
  if tg_op='UPDATE' then
    if old.status<>'draft' then raise exception 'Wysłanej faktury nie można edytować'; end if;
    if new.status<>'draft' or new.ksef_reference is distinct from old.ksef_reference
      or new.ksef_session is distinct from old.ksef_session or new.ksef_number is distinct from old.ksef_number
      or new.ksef_error is distinct from old.ksef_error or new.issued_xml is distinct from old.issued_xml
      or new.upo_xml is distinct from old.upo_xml or new.sent_at is distinct from old.sent_at
    then raise exception 'Status KSeF może zmienić tylko usługa serwerowa'; end if;
    new.updated_at=now();
  elsif new.status<>'draft' or new.ksef_reference is not null or new.ksef_number is not null then
    raise exception 'Nowa faktura musi być szkicem';
  end if;
  return new;
end $$;
drop trigger if exists protect_invoice_draft on public.invoice_drafts;
create trigger protect_invoice_draft before insert or update on public.invoice_drafts
for each row execute function public.protect_invoice_draft();

alter table public.invoice_sellers enable row level security;
alter table public.invoice_drafts enable row level security;
drop policy if exists invoice_sellers_admin on public.invoice_sellers;
drop policy if exists invoice_drafts_admin_read on public.invoice_drafts;
drop policy if exists invoice_drafts_admin_insert on public.invoice_drafts;
drop policy if exists invoice_drafts_admin_update on public.invoice_drafts;
drop policy if exists invoice_drafts_admin_delete on public.invoice_drafts;
create policy invoice_sellers_admin on public.invoice_sellers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy invoice_drafts_admin_read on public.invoice_drafts for select to authenticated using (public.is_admin());
create policy invoice_drafts_admin_insert on public.invoice_drafts for insert to authenticated
  with check (public.is_admin() and created_by=auth.uid() and status='draft');
create policy invoice_drafts_admin_update on public.invoice_drafts for update to authenticated
  using (public.is_admin() and status='draft') with check (public.is_admin() and status='draft');
create policy invoice_drafts_admin_delete on public.invoice_drafts for delete to authenticated
  using (public.is_admin() and status='draft');
grant select,insert,update,delete on public.invoice_sellers,public.invoice_drafts to authenticated;
