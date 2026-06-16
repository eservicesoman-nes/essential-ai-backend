with open('services/router.js', 'rb') as f:
    raw = f.read()

uses_crlf = b'\r\n' in raw
c = raw.decode('utf-8')

old = "if (webSearch && ['chat', 'deepcore'].includes(mode)) {"
new = "if (webSearch && mode === 'chat') {"

if uses_crlf:
    old = old.replace('\n', '\r\n')
    new = new.replace('\n', '\r\n')

if old in c:
    c = c.replace(old, new)
    with open('services/router.js', 'wb') as f:
        f.write(c.encode('utf-8'))
    print('PATCHED')
else:
    print('NOT FOUND')
