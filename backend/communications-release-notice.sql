-- One explicit release announcement. Existing business announcements are untouched.
insert into public.imperium_announcements(id,title,body,created_by,system_notice)
select '60480000-0000-4000-8000-000000000001','IMPERIUM 6.0 — nowe centrum ogłoszeń',
'Ekran główny IMPERIUM jest teraz tablicą ogłoszeń. Każdy uczestnik potwierdza przeczytanie własną kratką „Przeczytano”. Właściciel widzi potwierdzenia wraz z datą i godziną.

Zadania i misje zostały wyłączone w interfejsie. Pozostałe moduły operacyjne są dostępne tylko dla właściciela.

Aby korzystać z powtarzanej wibracji i wbudowanej przeglądarki, zainstaluj IMPERIUM 6.0 na Androidzie. Jeżeli widzisz przycisk „Pobierz APK 6.0”, pobierz plik i wybierz „Aktualizuj”.

Po przeczytaniu zaznacz potwierdzenie poniżej.',owner_id,true from public.imperium_access_control where singleton
on conflict(id) do nothing;
insert into public.imperium_announcement_receipts(announcement_id,profile_id,name_snapshot)
select '60480000-0000-4000-8000-000000000001',id,full_name from public.profiles where active on conflict do nothing;
