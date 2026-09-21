"""
Song Downloader Server for Spicetify
Run once via "Start Downloader.bat" and keep the window open while using Spotify.
Downloaded songs are saved to Music\Spotify Downloads and registered in Spotify's
Local Files library so they appear in Spotify automatically (no restart needed).
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import subprocess, urllib.parse, os, json, re

PORT        = 7879
HOME        = os.path.expanduser("~")
DOWNLOAD_DIR = os.path.join(HOME, "Music", "Spotify Downloads")
SPOTIFY_PREFS = os.path.join(os.getenv("APPDATA", ""), "Spotify", "prefs")


# ── Spotify prefs helper ─────────────────────────────────────────────────────
def register_local_folder(folder):
    """Add folder to Spotify's local-files prefs so it shows up in Local Files."""
    if not os.path.exists(SPOTIFY_PREFS):
        print("  [prefs] Spotify prefs file not found — skipping auto-registration.")
        return False

    with open(SPOTIFY_PREFS, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
        lines   = content.splitlines(keepends=True)

    # Normalise for comparison (Spotify stores paths with forward slashes)
    norm = folder.replace("\\", "/").lower()

    # Already registered?
    for line in lines:
        if "local-files" in line and "path" in line:
            line_norm = line.replace("\\\\", "/").replace("\\", "/").lower()
            if norm in line_norm:
                print("  [prefs] Folder already registered in Spotify.")
                return True

    # Find the next free folder index
    indices = [int(m) for m in re.findall(r"storage\.local-files\.folder\.(\d+)\.", content)]
    idx = max(indices) + 1 if indices else 0

    fwd = folder.replace("\\", "/")   # Spotify prefers forward slashes in prefs

    additions = []
    additions.append(f'storage.local-files.folder.{idx}.enabled=1\n')
    additions.append(f'storage.local-files.folder.{idx}.path="{fwd}"\n')

    if "storage.local-files.autoSyncEnabled" not in content:
        additions.append("storage.local-files.autoSyncEnabled=1\n")
    if "storage.local-files.show_local_files" not in content:
        additions.append("storage.local-files.show_local_files=1\n")

    with open(SPOTIFY_PREFS, "a", encoding="utf-8") as f:
        f.writelines(additions)

    print(f"  [prefs] Registered '{folder}' in Spotify Local Files (index {idx}).")
    return True


# ── HTTP handler ─────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # silence default per-request log

    def send_json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Content-Type",   "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        # ── /ping ────────────────────────────────────────────────────────────
        if parsed.path == "/ping":
            self.send_json(200, {"ok": True, "saveDir": DOWNLOAD_DIR})
            return

        # ── /setup ───────────────────────────────────────────────────────────
        # Called by the extension on startup to ensure the library folder exists
        # and is registered in Spotify's prefs.
        if parsed.path == "/setup":
            os.makedirs(DOWNLOAD_DIR, exist_ok=True)
            ok = register_local_folder(DOWNLOAD_DIR)
            self.send_json(200, {"ok": ok, "saveDir": DOWNLOAD_DIR})
            return

        # ── /download ────────────────────────────────────────────────────────
        if parsed.path == "/download":
            url = params.get("url", [None])[0]
            if not url:
                self.send_json(400, {"error": "Missing url parameter"})
                return

            os.makedirs(DOWNLOAD_DIR, exist_ok=True)
            print(f"  Downloading: {url}")
            try:
                result = subprocess.run(
                    ["python", "-m", "spotdl", url, "--output", DOWNLOAD_DIR],
                    capture_output=True, text=True, timeout=300,
                )
                if result.returncode == 0:
                    print(f"  Done.")
                    self.send_json(200, {"status": "done", "saveDir": DOWNLOAD_DIR})
                else:
                    err = (result.stderr or result.stdout)[:300]
                    print(f"  spotdl error: {err}")
                    self.send_json(500, {"error": err})
            except subprocess.TimeoutExpired:
                self.send_json(500, {"error": "timeout"})
            except Exception as e:
                self.send_json(500, {"error": str(e)})
            return

        self.send_json(404, {"error": "not found"})


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    register_local_folder(DOWNLOAD_DIR)

    print("=" * 55)
    print("  Song Downloader Server")
    print(f"  Listening on  http://localhost:{PORT}")
    print(f"  Saving to     {DOWNLOAD_DIR}")
    print("  Songs appear in Spotify under  Local Files")
    print("  Keep this window open while using Spotify.")
    print("  Press Ctrl+C to stop.")
    print("=" * 55)
    try:
        HTTPServer(("localhost", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
