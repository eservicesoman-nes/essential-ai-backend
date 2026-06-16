with open('services/router.js', 'rb') as f:
    raw = f.read()

# Detect line ending style
uses_crlf = b'\r\n' in raw
c = raw.decode('utf-8')

old = "const { createClient } = require('@supabase/supabase-js');"
new = "const { createClient } = require('@supabase/supabase-js');\nconst ws = require('ws');"

old2 = "const supabase = createClient(supabaseUrl, supabaseAnonKey);"
new2 = "const supabase = createClient(supabaseUrl, supabaseAnonKey, { realtime: { transport: ws } });"

if uses_crlf:
    old = old.replace('\n', '\r\n')
    new = new.replace('\n', '\r\n')

changed = False
if old in c:
    c = c.replace(old, new)
    changed = True
else:
    print('PATTERN 1 NOT FOUND')

if old2 in c:
    c = c.replace(old2, new2)
    changed = True
else:
    print('PATTERN 2 NOT FOUND')

if changed:
    with open('services/router.js', 'wb') as f:
        f.write(c.encode('utf-8'))
    print('PATCHED')
else:
    print('NO CHANGES MADE')
