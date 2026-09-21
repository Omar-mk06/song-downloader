# 🎵 Song Downloader — Spicetify Extension

**Download any Spotify song as an MP3 file** — right from the player bar or the right-click context menu.

A [Spicetify](https://spicetify.app/) extension that adds a small download button next to the now-playing controls and a **"Download Song"** entry to the track context menu. It ships with an optional local server (`spotdl-server.py`) that uses [spotdl](https://github.com/spotDL/spotify-downloader) to fetch high-quality MP3s and register them in Spotify's **Local Files** library automatically — no restart needed. If the server isn't running, the extension falls back to a public web API.

---

## ✨ Features

- ▶️ **Player-bar button** — download the currently playing track with one click.
- 🖱️ **Context-menu entry** — right-click any track → *Download Song*.
- 🖥️ **Local spotdl server** (recommended) — best quality, auto-added to Spotify's Local Files.
- 🌐 **Web API fallback** — works even without the server, saves via the browser.
- 🔁 **Auto-refresh** — Spotify's Local Files index is refreshed so the new song appears instantly.
- 🪶 Lightweight, no external JS dependencies, single file extension.

---

## 📦 Repository contents

| File                  | What it is                                                                |
| --------------------- | ------------------------------------------------------------------------ |
| `downloadSong.js`     | The Spicetify extension. Install this into your `Extensions/` folder.    |
| `spotdl-server.py`    | Optional local HTTP server that wraps `spotdl` and registers the folder. |
| `Start Downloader.bat`| Windows launcher for the server (double-click to start).                 |
| `manifest.json`      | Spicetify Marketplace manifest.                                          |
| `README.md`          | This file.                                                                |
| `LICENSE`            | MIT.                                                                     |

---

## 🚀 Installation

### Option A — Spicetify Marketplace (easiest)

1. Open Spicetify Marketplace in Spotify.
2. Search for **Song Downloader** and click *Install*.

### Option B — Manual install

1. Copy `downloadSong.js` into your Spicetify `Extensions/` folder:
   - Windows: `%localappdata%\spicetify\Extensions\`
   - Linux/macOS: `~/.config/spicetify/Extensions/`
2. Add the extension to your config:
   ```bash
   spicetify config extensions downloadSong.js
   spicetify apply
   ```
3. Restart Spotify. You should see a ⬇ button in the player bar.

### Option C — Enable the local server (recommended for best quality)

The extension works without the server, but the server gives you:
- Higher-quality MP3s (via `spotdl`).
- Songs saved to `Music\Spotify Downloads` and **auto-registered** in Spotify's Local Files.

1. Install Python 3.8+ and spotdl:
   ```bash
   pip install spotdl
   ```
2. Copy `spotdl-server.py` and `Start Downloader.bat` into your Spicetify folder (next to `spicetify.exe`).
3. Double-click **`Start Downloader.bat`** once and leave the window open while using Spotify.
4. The extension auto-detects the server on `http://localhost:7879` and uses it when available.

> 💡 The server only listens on `localhost`, so it is not exposed to your network.

---

## 🖥️ How it works

```
 ┌──────────────┐   click ⬇   ┌──────────────────┐
 │ Spotify UI   │ ──────────▶ │ downloadSong.js  │
 │ (extension)  │             │  (this extension) │
 └──────────────┘             └────────┬─────────┘
                                       │
                       ┌───────────────┴───────────────┐
                       ▼                               ▼
              ┌─────────────────┐            ┌──────────────────┐
              │ spotdl-server   │  fallback  │ web API (spotify │
              │ (localhost:7879)│            │  -down mirror)   │
              └────────┬────────┘            └────────┬─────────┘
                       │                              │
                       ▼                              ▼
              Music\Spotify Downloads            Browser Downloads
              + registered in Local Files        folder
```

- **Method 1 — Local server:** `downloadSong.js` calls `http://localhost:7879/download?url=…`. The server runs `spotdl`, saves the MP3 to `~/Music/Spotify Downloads`, and the extension asks Spotify to refresh its Local Files index so the song shows up immediately.
- **Method 2 — Web API fallback:** If the server is not running, the extension queries a public mirror of `api.spotifydown.com` (via `CosmosAsync` or a CORS proxy) to get a CDN link, then downloads the file through the browser.

---

## ⚙️ Configuration

All knobs live at the top of `downloadSong.js`:

```js
const SERVER = "http://localhost:7879"; // local spotdl server URL
```

And at the top of `spotdl-server.py`:

```python
PORT         = 7879
DOWNLOAD_DIR = os.path.join(HOME, "Music", "Spotify Downloads")
SPOTIFY_PREFS = os.path.join(os.getenv("APPDATA", ""), "Spotify", "prefs")
```

Change `DOWNLOAD_DIR` if you want songs saved somewhere else. The folder is registered in Spotify's `prefs` file automatically on server startup and on extension load (via `/setup`).

---

## 🧩 HTTP API (server)

| Endpoint      | Method | Description                                                            |
| ------------- | ------ | ---------------------------------------------------------------------- |
| `/ping`       | GET    | Health check. Returns `{"ok": true, "saveDir": "..."}`.                |
| `/setup`      | GET    | Creates the download folder and registers it in Spotify's Local Files. |
| `/download`   | GET    | `?url=https://open.spotify.com/track/<id>` — downloads via `spotdl`.   |
| `*`           | OPTIONS| CORS preflight.                                                        |

All responses include permissive CORS headers so the extension (running inside Spotify) can call the server directly.

---

## 🛠️ Troubleshooting

- **"Run Start Downloader.bat" notification** — the local server isn't running. Start it with the `.bat` file, or just ignore it and the extension will use the web fallback.
- **Download fails / no song appears** — open Spotify's Developer Tools (`Ctrl+Shift+I`) and check the console for `[SD]` logs. Common causes: `spotdl` not installed, no internet, or the track being unavailable on the fallback mirror.
- **Song downloads but doesn't show in Local Files** — make sure Spotify is closed when the server first writes to `prefs`, or restart Spotify once. The folder is registered on server start and on extension load.
- **CORS errors in console** — these are expected for the web fallback; the extension tries `CosmosAsync` first, then a CORS proxy.
- **Port 7879 already in use** — change `PORT` in `spotdl-server.py` **and** `SERVER` in `downloadSong.js` to match.

---

## ⚠️ Disclaimer

This project is for **personal, educational use only**. Downloading copyrighted material without permission may violate the terms of service of Spotify and the laws of your country. You are responsible for how you use it. The author does not host or distribute any copyrighted content.

---

## 📝 License

[MIT](./LICENSE) © Omar-mk06
