#!/usr/bin/env python3
"""A tiny OPDS 1.2 server for trying ComicPill's OPDS browser — not for real use.

  python3 scripts/opds-test-server.py /folder/with/comics [port]      (user: demo, password: demo)

Android emulator address:  http://10.0.2.2:8090/opds      Phone on the same Wi-Fi:  http://<this computer's IP>:8090/opds
"""
import base64, mimetypes, os, sys, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from xml.sax.saxutils import escape

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8090
USER, PASS = 'demo', 'demo'
TYPES = {'.cbz': 'application/vnd.comicbook+zip', '.cbr': 'application/vnd.comicbook-rar', '.cb7': 'application/x-cb7', '.pdf': 'application/pdf', '.epub': 'application/epub+zip'}
FEED = '<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">'

def comics():
    return sorted(f for f in os.listdir(ROOT) if os.path.splitext(f)[1].lower() in TYPES)

class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a): sys.stderr.write('%s %s\n' % (self.command, self.path))

    def authed(self):
        want = 'Basic ' + base64.b64encode(f'{USER}:{PASS}'.encode()).decode()
        if self.headers.get('Authorization') == want: return True
        self.send_response(401); self.send_header('WWW-Authenticate', 'Basic realm="comics"'); self.end_headers(); return False

    def xml(self, body):
        data = body.encode(); self.send_response(200)
        self.send_header('Content-Type', 'application/atom+xml;profile=opds-catalog'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        if not self.authed(): return
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        if u.path in ('/opds', '/opds/'):
            return self.xml(FEED + '<id>root</id><title>Sample comics</title>'
                '<link rel="search" href="/opds/search?q={searchTerms}" type="application/atom+xml"/>'
                '<entry><id>all</id><title>All comics</title><content type="text">Every sample comic</content><link rel="subsection" href="/opds/all" type="application/atom+xml;profile=opds-catalog"/></entry></feed>')
        if u.path in ('/opds/all', '/opds/search'):
            term = (q.get('q', [''])[0]).lower(); rows = []
            for f in comics():
                if term and term not in f.lower(): continue
                name = os.path.splitext(f)[0]; t = TYPES[os.path.splitext(f)[1].lower()]
                rows.append(f'<entry><id>{escape(f)}</id><title>{escape(name)}</title><author><name>ComicPill samples</name></author><summary>Sample comic {escape(name)}</summary>'
                            f'<link rel="http://opds-spec.org/acquisition" href="/files/{urllib.parse.quote(f)}" type="{t}"/></entry>')
            return self.xml(FEED + '<id>list</id><title>Results</title>' + ''.join(rows) + '</feed>')
        if u.path.startswith('/files/'):
            path = os.path.join(ROOT, os.path.basename(urllib.parse.unquote(u.path[7:])))
            if not os.path.isfile(path): self.send_error(404); return
            data = open(path, 'rb').read(); self.send_response(200)
            self.send_header('Content-Type', mimetypes.guess_type(path)[0] or 'application/octet-stream'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data); return
        self.send_error(404)

if __name__ == '__main__':
    print(f'OPDS test server on http://0.0.0.0:{PORT}/opds  (user {USER} / password {PASS}), serving {len(comics())} comics from {ROOT}')
    ThreadingHTTPServer(('0.0.0.0', PORT), H).serve_forever()
