# 💿 CD Sorter — LAN Edition

Photograph your CDs on your phone, see them sorted alphabetically on your desktop — live.

## Architecture

```
Phone (browser) ──[LAN]──► Flask server ──► Claude Vision API
                                │
                         WebSocket push
                                │
                         Desktop dashboard (React)
```

## Setup

### 1. Install Python dependencies
```bash
pip install flask flask-cors flask-sock anthropic
```

### 2. Set your Anthropic API key
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Build the React dashboard
```bash
npm install
npm run build
```

### 4. Start the server
```bash
python server.py
```

You'll see:
```
══════════════════════════════════════════
  💿  CD Sorter LAN Server
══════════════════════════════════════════
  Dashboard  →  http://192.168.x.x:5000
  Phone      →  http://192.168.x.x:5000/mobile
══════════════════════════════════════════
```

### 5. Open on devices
- **Desktop**: open `http://192.168.x.x:5000` in your browser
- **Phone**: open `http://192.168.x.x:5000/mobile` — make sure you're on the same Wi-Fi

## Usage

1. On your phone, tap **Camera** (uses rear camera) or **Gallery**
2. Photograph your CDs — a whole shelf works, multiple CDs per shot is fine
3. Tap **Send to Desktop**
4. Watch them appear on the dashboard in real time, sorted alphabetically

## Tips for best results
- Shoot in good lighting so the text on spines/covers is sharp
- Multiple CDs per photo = fewer shots needed
- You can delete individual entries from the dashboard with the × button
- The collection persists in `cds.json` between server restarts
