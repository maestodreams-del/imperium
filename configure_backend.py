#!/usr/bin/env python3
import sys, re, pathlib

if len(sys.argv) != 3:
    print('Użycie: python3 configure_backend.py https://PROJECT.supabase.co ANON_OR_PUBLISHABLE_KEY')
    raise SystemExit(2)
url, key = sys.argv[1].rstrip('/'), sys.argv[2].strip()
root = pathlib.Path(__file__).parent
p = root/'config.js'
s = p.read_text(encoding='utf-8')
s = re.sub(r'DEFAULT_SUPABASE_URL:\s*"[^"]*"', f'DEFAULT_SUPABASE_URL: "{url}"', s)
s = re.sub(r'DEFAULT_SUPABASE_ANON_KEY:\s*"[^"]*"', f'DEFAULT_SUPABASE_ANON_KEY: "{key}"', s)
p.write_text(s, encoding='utf-8')
(root/'android-wrapper/app/src/main/assets/config.js').write_text(s, encoding='utf-8')
print('OK: backend wpisany do wersji WWW i Android.')
