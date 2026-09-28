# Backend IMPERIUM v5

Dla nowego projektu Supabase uruchom `schema.sql` w SQL Editor.

Dla istniejącej bazy IMPERIUM v2/v3/v4 uruchom `upgrade-any-to-v5.sql`.

v5 dodaje `reward_coins`, `penalty_coins`, tabelę `coin_transactions` oraz funkcje atomowego rozliczenia nagrody i niewykonania. Saldo użytkownika jest sumą niezmienialnego dziennika transakcji, a nie pojedynczą liczbą nadpisywaną bez historii.
