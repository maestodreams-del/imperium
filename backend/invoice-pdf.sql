-- Preserve the seller details used to prepare an invoice, even if the company card changes later.
alter table public.invoice_drafts add column if not exists seller_snapshot jsonb;
update public.invoice_drafts d set seller_snapshot=jsonb_build_object(
  'name',s.name,'nip',s.nip,'streetAddress',s.street_address,
  'postalCity',s.postal_city,'bankAccount',s.bank_account)
from public.invoice_sellers s where d.seller_id=s.id and d.seller_snapshot is null;
