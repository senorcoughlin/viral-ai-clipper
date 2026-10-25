"""Viral AI Clipper YouTube downloader.

POST /jobs        {"url": "..."}  (header X-Downloader-Secret) -> {"id"}
GET  /jobs/<id>   -> {"status": queued|running|done|error, "error", "fileUrl", "duration"}
GET  /files/<id>.mp4?sig=...  -> the mp4 (signed link, so RenderIO can fetch it)
GET  /health
Downloads <=720p mp4 with yt-dlp (+ optional residential proxy via YTDLP_PROXY),
3-5 at a time, rejects videos over MAX_SOURCE_MINUTES, deletes files after FILE_TTL_MIN.
"""
import hashlib, hmac, json, os, queue, shutil, subprocess, threading, time, uuid
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

SECRET = os.environ.get("DOWNLOADER_SECRET", "")
PUBLIC = os.environ.get("PUBLIC_URL", "").rstrip("/")
PROXY = os.environ.get("YTDLP_PROXY", "")
COOKIES = os.environ.get("YTDLP_COOKIES_FILE", "")
WORKERS = max(1, min(5, int(os.environ.get("CONCURRENCY", "4"))))
MAX_SEC = int(os.environ.get("MAX_SOURCE_MINUTES", "120")) * 60
TTL = int(os.environ.get("FILE_TTL_MIN", "120")) * 60
DIR = os.environ.get("DATA_DIR", "/data")
os.makedirs(DIR, exist_ok=True)
jobs, q, lock = {}, queue.Queue(), threading.Lock()

def sign(i): return hmac.new(SECRET.encode(), i.encode(), hashlib.sha256).hexdigest()[:32]

def ytdlp(args, timeout):
    base = ["yt-dlp", "--no-playlist", "--no-progress", "--retries", "3"]
    if PROXY: base += ["--proxy", PROXY]
    if COOKIES and os.path.exists(COOKIES): base += ["--cookies", COOKIES]
    return subprocess.run(base + args, capture_output=True, text=True, timeout=timeout)

def work():
    while True:
        jid, url = q.get()
        j = jobs[jid]; j["status"] = "running"
        try:
            meta = ytdlp(["-J", url], 60)
            if meta.returncode: raise RuntimeError(meta.stderr.strip().splitlines()[-1][:300] if meta.stderr.strip() else "metadata failed")
            dur = json.loads(meta.stdout).get("duration") or 0
            if dur and dur > MAX_SEC: raise RuntimeError(f"video is {dur//60} min; limit is {MAX_SEC//60}")
            out = os.path.join(DIR, jid + ".mp4")
            r = ytdlp(["-f", "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]/b",
                       "--merge-output-format", "mp4", "-o", out, url], 900)
            if r.returncode or not os.path.exists(out):
                raise RuntimeError(r.stderr.strip().splitlines()[-1][:300] if r.stderr.strip() else "download failed")
            j.update(status="done", duration=dur, size=os.path.getsize(out),
                     fileUrl=f"{PUBLIC}/files/{jid}.mp4?sig={sign(jid)}")
        except Exception as e:
            j.update(status="error", error=str(e))
        j["finished"] = time.time()

def janitor():
    while True:
        time.sleep(300)
        now = time.time()
        for jid, j in list(jobs.items()):
            if now - j["created"] > TTL:
                try: os.remove(os.path.join(DIR, jid + ".mp4"))
                except OSError: pass
                jobs.pop(jid, None)

def updater():
    while True:  # keep yt-dlp current; YouTube breaks old versions often
        subprocess.run(["pip", "install", "-q", "-U", "--pre", "yt-dlp[default]"], capture_output=True)
        time.sleep(24 * 3600)

class H(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code)
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def _auth(self):
        return SECRET and hmac.compare_digest(self.headers.get("X-Downloader-Secret", ""), SECRET)
    def do_POST(self):
        if self.path != "/jobs": return self._json(404, {"error": "not found"})
        if not self._auth(): return self._json(401, {"error": "unauthorized"})
        try: url = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0)).get("url", "")
        except Exception: url = ""
        if not urlparse(url).scheme in ("http", "https"): return self._json(400, {"error": "bad url"})
        jid = uuid.uuid4().hex
        jobs[jid] = {"status": "queued", "created": time.time(), "url": url}
        q.put((jid, url)); self._json(200, {"id": jid, "queued": q.qsize()})
    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/health": return self._json(200, {"ok": True, "queue": q.qsize(), "workers": WORKERS})
        if u.path.startswith("/jobs/"):
            if not self._auth(): return self._json(401, {"error": "unauthorized"})
            j = jobs.get(u.path[6:])
            if not j: return self._json(404, {"status": "missing"})
            return self._json(200, {k: v for k, v in j.items() if k != "url"})
        if u.path.startswith("/files/") and u.path.endswith(".mp4"):
            jid = u.path[7:-4]; sig = parse_qs(u.query).get("sig", [""])[0]
            p = os.path.join(DIR, jid + ".mp4")
            if not SECRET or not hmac.compare_digest(sig, sign(jid)) or not os.path.exists(p): return self._json(404, {"error": "not found"})
            size = os.path.getsize(p); self.send_response(200)
            self.send_header("Content-Type", "video/mp4"); self.send_header("Content-Length", str(size)); self.end_headers()
            with open(p, "rb") as f: shutil.copyfileobj(f, self.wfile, 1 << 20)
            return
        self._json(404, {"error": "not found"})
    def log_message(self, *a): pass

if __name__ == "__main__":
    for _ in range(WORKERS): threading.Thread(target=work, daemon=True).start()
    threading.Thread(target=janitor, daemon=True).start()
    threading.Thread(target=updater, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), H).serve_forever()
