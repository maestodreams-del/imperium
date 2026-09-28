-- IMPERIUM v2 -> v3: uwagi i sankcje per zadanie
alter table public.tasks add column if not exists notes text;
alter table public.tasks add column if not exists sanction_type text not null default 'none';
alter table public.tasks add column if not exists sanction_text text;
alter table public.tasks add column if not exists disciplinary_note text;

do $$ begin
  alter table public.tasks add constraint tasks_sanction_type_check
  check (sanction_type in ('none','note','warning','reprimand','other'));
exception when duplicate_object then null; end $$;
