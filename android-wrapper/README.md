# IMPERIUM Android APK

Projekt jest wrapperem WebView bez zewnętrznych bibliotek AndroidX. Frontend jest wbudowany w `app/src/main/assets`, więc interfejs uruchamia się bez hostingu strony WWW. Połączenie z Supabase odbywa się bezpośrednio po HTTPS.

## Budowanie
Otwórz katalog `android-wrapper` w Android Studio i wybierz:
**Build → Build App Bundles or APKs → Build APKs**.

APK debug znajdziesz zwykle w:
`app/build/outputs/apk/debug/app-debug.apk`.

Do normalnej dystrybucji wewnętrznej najlepiej utworzyć własny keystore i zbudować Signed APK.

## Pliki
Wrapper obsługuje wielokrotny wybór zdjęć, filmów i dokumentów z Androidowego selektora plików. JavaScript otrzymuje je przez standardowy `<input type=file multiple>`.

## Konfiguracja chmury wbudowana w APK
Jeśli ustawisz Supabase URL/key w głównym `config.js`, skopiuj go ponownie do:
`app/src/main/assets/config.js`
przed budowaniem. Skrypt `../configure_backend.py` robi to automatycznie.
