# IMPERIUM: powiadomienia w tle

Ta aktualizacja dodaje natywne powiadomienia Firebase Cloud Messaging (FCM) z dźwiękiem, także gdy aplikacja jest w tle. Wymaga jednorazowego zainstalowania APK 5.3.0. Późniejsze zmiany interfejsu nadal korzystają z istniejącej automatycznej aktualizacji WWW.

## Konfiguracja

1. Utwórz projekt Firebase i dodaj aplikację Android o identyfikatorze `pl.imperium.app`. Pobierz `google-services.json`.
2. W konsoli Firebase włącz Cloud Messaging API (HTTP v1). Utwórz klucz konta usługi uprawnionego do wysyłania wiadomości FCM. Nie zapisuj plików kluczy w repozytorium.
3. W sekretach GitHub Actions ustaw `FIREBASE_GOOGLE_SERVICES_JSON_BASE64` (zawartość `google-services.json` zakodowana base64), `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` (JSON konta usługi zakodowany base64), `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL` i dotychczasowy `SUPABASE_SECRET_KEY`.
4. Po scaleniu zmian uruchom ręcznie workflow **Deploy IMPERIUM background push**. Wprowadzi on tabelę tokenów, funkcję Edge i opublikuje aktualizację WWW, która rejestruje tokeny. Następnie workflow Android zbuduje APK 5.3.0 z konfiguracją Firebase.
5. Zainstaluj nowy APK na telefonach, zaloguj się i zezwól na powiadomienia systemowe. Przetestuj zdarzenie z drugiego konta przy aplikacji schowanej w tle. Telefon wymaga usług Google Play i połączenia z internetem.

Funkcja Edge przyjmuje tylko zdarzenia utworzone przez zalogowanego użytkownika w ciągu ostatnich trzech minut. Wysyła je administratorom i przypisanym do obiektu aktywnym użytkownikom, pomijając autora. Tokeny i klucz Firebase nie są widoczne w interfejsie aplikacji. Powiadomienia wyłączone dla aplikacji lub wymuszone zatrzymanie aplikacji w systemie mogą blokować ich dostarczanie.
