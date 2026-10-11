-- Shared contact cards and private one-to-one conversations.
-- No new direct table privileges; every RPC checks the active caller and scope.
create table if not exists public.imperium_contact_cards (
 profile_id uuid primary key references public.profiles(id),
 position text not null default '' check(length(position)<=80),
 about text not null default '' check(length(about)<=500),
 phone text not null default '' check(length(phone)<=64),
 email text not null default '' check(length(email)<=254),
 avatar_data text not null default '' check(length(avatar_data)<=280000),
 updated_at timestamptz not null default now()
);
alter table public.imperium_contact_cards enable row level security;
revoke all on public.imperium_contact_cards from public,anon,authenticated;
create table if not exists public.profile_messages (
 id uuid primary key default gen_random_uuid(),sender_id uuid not null references public.profiles(id),receiver_id uuid not null references public.profiles(id),
 body text not null check(length(btrim(body)) between 1 and 2000),created_at timestamptz not null default now(),read_at timestamptz,check(sender_id<>receiver_id)
);
alter table public.profile_messages enable row level security;
create index if not exists profile_messages_pair_history on public.profile_messages(sender_id,receiver_id,created_at desc,id desc);
create index if not exists profile_messages_unread on public.profile_messages(receiver_id) where read_at is null;

create or replace function public.imperium_social_active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active);
$$;
create or replace function public.imperium_social_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.imperium_social_active() then raise insufficient_privilege using message='Konto nieaktywne.';end if;
 select jsonb_build_object('active',true,'contacts',coalesce(jsonb_agg(jsonb_build_object(
 'id',p.id,'name',p.full_name,'active',p.active,'owner',exists(select 1 from public.imperium_access_control a where a.owner_id=p.id),
 'position',coalesce(c.position,''),'about',coalesce(c.about,''),'phone',coalesce(c.phone,''),'email',coalesce(c.email,''),'avatar_data',coalesce(c.avatar_data,'')) order by p.full_name),'[]'::jsonb)) into result
 from public.profiles p left join public.imperium_contact_cards c on c.profile_id=p.id
 where p.active or exists(select 1 from public.profile_messages m where (m.sender_id=auth.uid() and m.receiver_id=p.id) or (m.receiver_id=auth.uid() and m.sender_id=p.id));
 return result;
end $$;
create or replace function public.imperium_social_save_card(p_position text,p_about text,p_phone text,p_email text,p_avatar text) returns void language plpgsql security definer set search_path='' as $$
declare image_bytes bytea;
begin
 if not public.imperium_social_active() then raise insufficient_privilege;end if;
 if p_position is null or p_about is null or p_phone is null or p_email is null or p_avatar is null or length(p_position)>80 or length(p_about)>500 or length(p_phone)>64 or length(p_email)>254 or length(p_avatar)>280000 then raise exception 'Sprawdź długość pól karty kontaktu.';end if;
 if p_avatar<>'' then
  if p_avatar !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Wybierz zdjęcie JPG, PNG lub WebP.';end if;
  image_bytes:=decode(substr(p_avatar,24),'base64');
  if octet_length(image_bytes)>204800 or octet_length(image_bytes)<4 or substring(image_bytes from 1 for 3)<>decode('ffd8ff','hex') then raise exception 'Nieprawidłowe zdjęcie.';end if;
 end if;
 insert into public.imperium_contact_cards(profile_id,position,about,phone,email,avatar_data) values(auth.uid(),btrim(p_position),btrim(p_about),btrim(p_phone),btrim(p_email),p_avatar)
 on conflict(profile_id) do update set position=excluded.position,about=excluded.about,phone=excluded.phone,email=excluded.email,avatar_data=excluded.avatar_data,updated_at=now();
end $$;
create or replace function public.imperium_social_inbox() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.imperium_social_active() then raise insufficient_privilege using message='Konto nieaktywne.';end if;
 with mine as (select m.*,case when sender_id=auth.uid() then receiver_id else sender_id end peer_id from public.profile_messages m where sender_id=auth.uid() or receiver_id=auth.uid()),
 latest as (select distinct on(peer_id) * from mine order by peer_id,created_at desc,id desc),
 counts as (select peer_id,count(*) n from mine where receiver_id=auth.uid() and read_at is null group by peer_id)
 select coalesce(jsonb_agg(jsonb_build_object('peer_id',l.peer_id,'body',l.body,'created_at',l.created_at,'sender_id',l.sender_id,'read_at',l.read_at,'unread',coalesce(c.n,0)) order by l.created_at desc,l.id desc),'[]'::jsonb) into result from latest l left join counts c using(peer_id);
 return result;
end $$;
create or replace function public.imperium_social_thread(p_peer uuid,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.imperium_social_active() or p_peer=auth.uid() or p_peer is null then raise insufficient_privilege;end if;
 if (p_before is null)<>(p_before_id is null) then raise exception 'Nieprawidłowy kursor rozmowy.';end if;
 with selected as (select m.* from public.profile_messages m where ((sender_id=auth.uid() and receiver_id=p_peer) or (receiver_id=auth.uid() and sender_id=p_peer))
 and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 51),
 numbered as(select s.*,row_number() over(order by created_at desc,id desc) n from selected s)
 select jsonb_build_object('messages',coalesce(jsonb_agg(jsonb_build_object('id',id,'sender_id',sender_id,'receiver_id',receiver_id,'body',body,'created_at',created_at,'read_at',read_at) order by created_at,id) filter(where n<=50),'[]'::jsonb),'has_more',count(*)>50) into result from numbered;
 return result;
end $$;
create or replace function public.imperium_social_send(p_peer uuid,p_body text,p_client_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare saved public.profile_messages;
begin
 if not public.imperium_social_active() or p_peer=auth.uid() or not exists(select 1 from public.profiles where id=p_peer and active) then raise insufficient_privilege using message='Odbiorca jest niedostępny.';end if;
 if p_client_id is null or p_body is null or length(btrim(p_body)) not between 1 and 2000 then raise exception 'Wiadomość musi mieć od 1 do 2000 znaków.';end if;
 insert into public.profile_messages(id,sender_id,receiver_id,body) values(p_client_id,auth.uid(),p_peer,btrim(p_body)) on conflict(id) do nothing;
 select * into saved from public.profile_messages where id=p_client_id;
 if saved.sender_id<>auth.uid() or saved.receiver_id<>p_peer or saved.body<>btrim(p_body) then raise insufficient_privilege;end if;
 return saved.id;
end $$;
create or replace function public.imperium_social_read(p_ids uuid[]) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not public.imperium_social_active() then raise insufficient_privilege;end if;
 if cardinality(p_ids)>500 then raise exception 'Zbyt wiele wiadomości.';end if;
 update public.profile_messages set read_at=now() where receiver_id=auth.uid() and id=any(p_ids) and read_at is null;
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.imperium_social_active(),public.imperium_social_directory(),public.imperium_social_save_card(text,text,text,text,text),public.imperium_social_inbox(),public.imperium_social_thread(uuid,timestamptz,uuid),public.imperium_social_send(uuid,text,uuid),public.imperium_social_read(uuid[]) from public;
grant execute on function public.imperium_social_active(),public.imperium_social_directory(),public.imperium_social_save_card(text,text,text,text,text),public.imperium_social_inbox(),public.imperium_social_thread(uuid,timestamptz,uuid),public.imperium_social_send(uuid,text,uuid),public.imperium_social_read(uuid[]) to authenticated;
create or replace function public.imperium_guard_access() returns void language plpgsql security invoker set search_path='' as $$
declare request_path text:=current_setting('request.path',true);request_method text:=current_setting('request.method',true);
begin
 if auth.role()='service_role' or public.imperium_access_status() then return;end if;
 if request_method='POST' and request_path='/rpc/imperium_device_notice' then return;end if;
 if auth.uid() is not null and (
 (request_method='POST' and request_path in ('/rpc/imperium_access_status','/rpc/imperium_comms_feed','/rpc/imperium_ack_announcement','/rpc/imperium_register_notice_device','/rpc/imperium_revoke_notice_device',
 '/rpc/imperium_social_directory','/rpc/imperium_social_save_card','/rpc/imperium_social_inbox','/rpc/imperium_social_thread','/rpc/imperium_social_send','/rpc/imperium_social_read')) or
 (request_method='GET' and request_path in ('/app_updates','/profiles'))) then return;end if;
 raise sqlstate '42501' using message='IMPERIUM_OWNER_ONLY: Dostęp wyłącznie dla właściciela.';
end $$;
notify pgrst,'reload schema';
