# IMPERIUM v5

Wewnętrzna aplikacja Android/PWA do zarządzania pracownikami, obiektami, zadaniami, raportami, dyscypliną i systemem punktowym **Imperatorskie Nikitocoiny (NK)**.

## Najważniejsze funkcje
- administrator i pracownicy;
- logowanie/rejestracja przez Supabase Auth;
- przypisywanie pracowników do obiektów;
- tworzenie i edycja zadań oraz obiektów;
- priorytety, timer, terminy i przedłużanie czasu;
- zdjęcia, wideo i dokumenty przy zadaniu oraz raporcie;
- raport, akceptacja oraz zwrot `Do poprawy`;
- uwagi, wymagania i zaplanowane konsekwencje per zadanie;
- dewiza **AD GLORIAM IMPERATORIS NIKITAE**;
- karta pracownika z historią zadań i dyscypliny;
- **Imperatorskie Nikitocoiny**: saldo i pełny dziennik operacji;
- przy tworzeniu zadania administrator ustawia `Nagrodę za wykonanie` i `Odjęcie za niewykonanie`;
- akceptacja zadania automatycznie nalicza bazową nagrodę;
- przy akceptacji można dopisać dodatkowy bonus za wzorowe wykonanie;
- decyzja `Niewykonane` odejmuje skonfigurowaną liczbę NK i zwraca zadanie do puli;
- administrator może ręcznie dodać/odjąć NK z obowiązkowym powodem;
- wszystkie operacje NK są audytowane z datą, powodem, zadaniem i administratorem;
- wspólna baza i synchronizacja między telefonami przez Supabase;
- automatyczna kompilacja APK przez GitHub Actions.

## Nowa baza Supabase
1. Utwórz projekt Supabase.
2. Otwórz SQL Editor.
3. Uruchom cały plik `backend/schema.sql`.
4. Wstaw Project URL i publiczny `publishable` / `anon` key do `config.js`.
5. Pierwsze zarejestrowane konto bootstrapuje się jako administrator.

## Aktualizacja istniejącej bazy v2/v3/v4
W Supabase SQL Editor uruchom tylko:

`backend/upgrade-any-to-v5.sql`

Nie kasuje istniejących zadań ani kont. Dodaje pola Nikitocoinów, portfel, historię transakcji i RPC do bezpiecznego rozliczania zadań.

## Jak działają Nikitocoiny
Przykład zadania:
- nagroda: `100 NK`;
- niewykonanie: `40 NK`.

Po wysłaniu raportu administrator wybiera `Akceptuj + NK`. Pracownik dostaje 100 NK plus ewentualny bonus wpisany przez administratora. Jeżeli administrator wybierze `Niewykonane −40 NK`, w historii pojawia się ujemna transakcja, a zadanie wraca do statusu `Nowe`.

`Zespół -> Karta` pokazuje bieżące saldo i pełny portfel: nagrody, bonusy, niewykonania i ręczne korekty.

**Nikitocoiny są wewnętrznymi punktami IMPERIUM. Aplikacja nie potrąca automatycznie pieniędzy z wynagrodzenia.**

## APK
Projekt Android znajduje się w `android-wrapper/`. Workflow `.github/workflows/build-apk.yml` buduje APK w GitHub Actions. Gotowy artefakt nazywa się `IMPERIUM-apk`.
