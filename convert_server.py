"""Convertisseur local pour Mélo : lien (YouTube, SoundCloud…) -> MP3 avec titre, artiste et pochette.
Lancer : double-clic sur convertisseur.bat. N'écoute que sur ce PC (127.0.0.1)."""
import glob
import json
import os
import re
import shutil
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote

import yt_dlp

PORT = 8777
# Only Mélo may use the converter: stops other websites from making this PC download things.
ALLOWED_ORIGIN = re.compile(r'^(https://plogeart\.github\.io|http://(localhost|127\.0\.0\.1)(:\d+)?)$')


def convert(url, folder):
    opts = {
        'format': 'bestaudio/best',
        'noplaylist': True,
        'outtmpl': os.path.join(folder, '%(title).150B.%(ext)s'),
        'writethumbnail': True,
        'js_runtimes': {'deno': {}, 'node': {}},  # YouTube needs a JS runtime; node is already installed
        'postprocessors': [
            {'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'},
            {'key': 'FFmpegMetadata'},
            {'key': 'EmbedThumbnail'},
        ],
        'quiet': True,
        'no_warnings': True,
        'noprogress': True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    mp3s = glob.glob(os.path.join(folder, '*.mp3'))
    if not mp3s:
        raise RuntimeError('aucun MP3 produit')
    return mp3s[0]


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        origin = self.headers.get('Origin', '')
        if ALLOWED_ORIGIN.match(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Access-Control-Allow-Methods', 'POST')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Allow-Private-Network', 'true')  # Chrome: public site -> localhost
            self.send_header('Access-Control-Expose-Headers', 'X-Filename')
            self.send_header('Vary', 'Origin')

    def reply(self, code, body, ctype, extra=None):
        self.send_response(code)
        self.cors()
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def fail(self, code, msg):
        self.reply(code, json.dumps({'error': msg}).encode(), 'application/json')

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_POST(self):
        if self.path != '/convert':
            return self.fail(404, 'introuvable')
        if not ALLOWED_ORIGIN.match(self.headers.get('Origin', '')):
            return self.fail(403, 'origine non autorisée')
        try:
            url = json.loads(self.rfile.read(min(int(self.headers.get('Content-Length') or 0), 10_000)))['url']
        except (ValueError, KeyError, TypeError):
            return self.fail(400, 'requête invalide')
        if not isinstance(url, str) or not re.match(r'^https?://\S+$', url):
            return self.fail(400, 'lien invalide')
        print('Conversion :', url, flush=True)
        with tempfile.TemporaryDirectory() as folder:
            try:
                path = convert(url, folder)
            except Exception as e:  # yt-dlp errors: unavailable video, private, blocked…
                msg = re.sub(r'\x1b\[[0-9;]*m', '', str(e)).replace('ERROR: ', '')[:300]
                print('  échec :', msg, flush=True)
                return self.fail(500, msg)
            with open(path, 'rb') as f:
                data = f.read()
        print('  ok :', os.path.basename(path), flush=True)
        self.reply(200, data, 'audio/mpeg', {'X-Filename': quote(os.path.basename(path))})

    def log_message(self, *args):  # keep the window readable
        pass


if __name__ == '__main__':
    if not shutil.which('ffmpeg'):
        print('ATTENTION : ffmpeg introuvable. Installe-le : winget install Gyan.FFmpeg')
    print(f'Convertisseur Mélo prêt (port {PORT}). Laisse cette fenêtre ouverte pendant que tu ajoutes des liens.')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
