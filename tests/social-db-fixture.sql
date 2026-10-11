-- Extend the isolated communications fixture with a third identity.
insert into public.profiles(id,full_name,active,role) values('10000000-0000-4000-8000-000000000003','Third participant',true,'worker');
insert into auth.users values('10000000-0000-4000-8000-000000000003');
