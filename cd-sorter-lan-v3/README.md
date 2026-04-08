# 💿 CD Sorter — LAN Edition

Photograph your CD collection with your phone, watch them appear sorted on your desktop in real time — genre-tagged via MusicBrainz, powered by Claude Vision.

---

## Quick start (Windows)

1. Drop all files into a folder
2. Double-click **`start.bat`**
3. Paste your Anthropic API key when prompted
4. Open the URLs printed in the terminal

That's it. On subsequent runs `start.bat` skips reinstalling deps and goes straight to launching the server.

---

## Manual setup

### Prerequisites
- Python 3.x — [python.org](https://python.org) (check "Add python.exe to PATH" during install)
- Node.js — [nodejs.org](https://nodejs.org)
- An Anthropic API key — [console.anthropic.com](https://console.anthropic.com)

### Steps

```bat
REM 1. Install Python dependencies
python -m pip install flask flask-cors flask-sock anthropic

REM 2. Set your API key (PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-..."

REM 3. Build the React dashboard (first time only)
npm install
npm run build

REM 4. Start the server
python server.py
```

### Open in browser
| Device | URL |
|---|---|
| Desktop dashboard | `http://localhost:5000` |
| Phone (same Wi-Fi) | `http://<IP printed in terminal>:5000/mobile` |

To find your IP manually: run `ipconfig` and look for **IPv4 Address** under your Wi-Fi adapter.

### Firewall
Windows will prompt you to allow Python through the firewall the first time. Click **Allow access** with both Private and Public checked. If the dialog doesn't appear: Windows Defender Firewall → Allow an app → Add Python manually.

---

## How it works

```
Phone camera
    │
    │  base64 image over LAN (HTTP POST)
    ▼
Flask server  ──►  Claude Vision  (extracts artist + album)
    │
    ├──►  MusicBrainz API  (looks up genre in background)
    │
    │  WebSocket push (live, no refresh)
    ▼
Desktop dashboard  (sorted, color-coded by genre)
```

1. Open `/mobile` on your phone and tap **Camera** or **Gallery**
2. Photograph your CDs — whole shelves work, multiple CDs per shot is fine
3. Tap **Send to Desktop**
4. CDs appear on the dashboard instantly; genre badges fill in as MusicBrainz responds

---

## Dashboard features

### Sort modes
| Option | Behaviour |
|---|---|
| **Artist A–Z** | Alphabetical by artist, ignoring leading "The / A / An" |
| **Album A–Z** | Alphabetical by album title, same article-stripping |
| **Genre** | MusicBrainz genre first, ties broken by artist name |

### Other controls
- **Group sections** — collapses the list into genre headers
- **Filter by genre** — pill row that appears once 2+ genres are known; active pill lights up in that genre's color
- **×** button on each card to remove individual entries
- **Clear all** to wipe the collection

---

## Data & persistence

- Collection is saved to `cds.json` in the project folder and survives server restarts
- Genre lookups are cached in memory for the session — rescanning the same artist won't re-query MusicBrainz
- MusicBrainz is queried first by release-group tags, then falls back to artist tags if nothing is found
- No MusicBrainz API key required (free, open API — rate limit respected automatically)

---

## Changelog

### v4 — Sort UI overhaul + start script
- Sort controls redesigned as a proper labelled panel with active indicator dots and description lines
- **Artist A–Z**, **Album A–Z**, and **Genre** are now distinct named buttons
- **Group sections** toggle separated from sort buttons
- Genre filter pills light up in that genre's color when active
- Count shows "X of Y" when a filter is active
- Added `start.bat` — one-click setup: checks Python/Node, prompts for API key, installs deps, builds dashboard, launches server

### v3 — Genre lookup & improved sort
- MusicBrainz genre lookup runs in a background thread after each scan
- Genres push to the dashboard live via WebSocket as they resolve
- Color-coded genre badges on each CD card (deterministic color per genre name)
- Sort by genre, group by genre sections, filter by genre pills added
- In-memory genre cache to avoid duplicate lookups

### v2 — LAN + phone support
- Added Flask server (`server.py`) replacing browser-only Claude API calls
- Added `mobile.html` — phone-friendly upload page served over LAN
- WebSocket live updates: dashboard refreshes without a page reload
- CD collection persists to `cds.json` between server restarts
- Individual CD delete added to the dashboard

### v1 — Initial release
- Browser-only React app
- Upload CD photos from desktop
- Claude Vision extracts artist + album
- Alphabetical sorting by artist or album
