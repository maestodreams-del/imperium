# IMPERIUM dla Windows

Instalator uruchamia ten sam interfejs, konta i bazę Supabase co aplikacja Android. Nie przenosi danych lokalnych demo między urządzeniami.

## Uruchomienie lokalne

Z katalogu repozytorium: `python3 desktop/prepare.py`, następnie w katalogu `desktop`: `npm install` i `npm start`.

## Instalator

Workflow **Build IMPERIUM desktop** buduje instalator Windows jako artefakt `IMPERIUM-Windows`. Po instalacji zaloguj się tym samym kontem co na telefonie. SmartScreen może wyświetlić ostrzeżenie dla niepodpisanego instalatora. Aktualizacja desktopowego programu wymaga ponownej instalacji kolejnego wydania; aktualizator WWW używany przez APK nie podmienia plików wykonywalnych Windows.
