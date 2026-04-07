#!/usr/bin/env python3
"""
CD Sorter LAN Server
Run: python server.py
Then open http://<your-ip>:5000 on desktop (dashboard)
And  http://<your-ip>:5000/mobile on your phone
"""

import os
import json
import base64
import socket
import threading
import time
import urllib.parse
import urllib.request
import anthropic
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_sock import Sock

app = Flask(__name__, static_folder="dist")
CORS(app)
sock = Sock(app)

# In-memory CD collection (persisted to disk)
DATA_FILE = "cds.json"
cd_collection = []
connected_clients = set()
clients_lock = threading.Lock()

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


def load_data():
    global cd_collection
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f:
            cd_collection = json.load(f)


def save_data():
    with open(DATA_FILE, "w") as f:
        json.dump(cd_collection, f)


def broadcast(message: dict):
    """Send a message to all connected WebSocket clients."""
    dead = set()
    with clients_lock:
        clients = set(connected_clients)
    for ws in clients:
        try:
            ws.send(json.dumps(message))
        except Exception:
            dead.add(ws)
    if dead:
        with clients_lock:
            connected_clients.difference_update(dead)


def extract_cds_from_image(image_b64: str, media_type: str) -> list[dict]:
    """Call Claude Vision to extract CD info from a base64 image."""
    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "Look at this image. It may contain one or more CDs, DVDs, Blu-rays, "
                            "or music albums. Extract every album/disc you can see.\n"
                            "Respond ONLY with a JSON array (no markdown, no backticks):\n"
                            '[{"artist":"Artist Name","album":"Album Title"},...]\n'
                            "If nothing is recognisable, return: []"
                        ),
                    },
                ],
            }
        ],
    )
    raw = message.content[0].text.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Try to salvage partial JSON
        import re
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return []


GENRE_CACHE: dict[str, str] = {}  # "artist||album" -> genre string

def lookup_genre(artist: str, album: str) -> str:
    """Query MusicBrainz for the genre/tag of an artist+album. Returns best tag or 'Unknown'."""
    cache_key = f"{artist.lower()}||{album.lower()}"
    if cache_key in GENRE_CACHE:
        return GENRE_CACHE[cache_key]

    headers = {"User-Agent": "CDSorter/1.0 ( cd-sorter@example.com )"}

    def mb_get(url: str):
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read().decode())

    genre = "Unknown"
    try:
        # 1. Search for the release (album)
        q = urllib.parse.quote(f'release:"{album}" AND artist:"{artist}"')
        data = mb_get(f"https://musicbrainz.org/ws/2/release/?query={q}&limit=1&fmt=json")
        releases = data.get("releases", [])

        if releases:
            rg_id = releases[0].get("release-group", {}).get("id")
            if rg_id:
                # 2. Fetch release-group tags
                rg = mb_get(f"https://musicbrainz.org/ws/2/release-group/{rg_id}?inc=tags&fmt=json")
                tags = rg.get("tags", [])
                if tags:
                    best = max(tags, key=lambda t: t.get("count", 0))
                    genre = best["name"].title()

        # 3. Fall back to artist tags if release-group had none
        if genre == "Unknown":
            q2 = urllib.parse.quote(f'artist:"{artist}"')
            adata = mb_get(f"https://musicbrainz.org/ws/2/artist/?query={q2}&limit=1&fmt=json")
            artists = adata.get("artists", [])
            if artists:
                aid = artists[0].get("id")
                if aid:
                    time.sleep(0.1)  # MusicBrainz rate limit
                    ainfo = mb_get(f"https://musicbrainz.org/ws/2/artist/{aid}?inc=tags&fmt=json")
                    tags = ainfo.get("tags", [])
                    if tags:
                        best = max(tags, key=lambda t: t.get("count", 0))
                        genre = best["name"].title()

    except Exception as e:
        print(f"  [MusicBrainz] {artist} / {album} → error: {e}")

    GENRE_CACHE[cache_key] = genre
    print(f"  [MusicBrainz] {artist} / {album} → {genre}")
    return genre


# ─── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("dist", "index.html")


@app.route("/mobile")
def mobile():
    return send_from_directory(".", "mobile.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("dist", path)


@app.route("/api/upload", methods=["POST"])
def upload():
    """Receive image from phone, process with Claude, broadcast to dashboard."""
    data = request.get_json(force=True)
    image_b64 = data.get("image")       # base64 string (no data-URL prefix)
    media_type = data.get("mediaType", "image/jpeg")

    if not image_b64:
        return jsonify({"error": "No image provided"}), 400

    # Broadcast "processing" status
    broadcast({"type": "status", "status": "processing"})

    try:
        found = extract_cds_from_image(image_b64, media_type)
    except Exception as e:
        broadcast({"type": "status", "status": "error", "message": str(e)})
        return jsonify({"error": str(e)}), 500

    new_entries = [
        {"id": f"{int(time.time()*1000)}-{i}", "artist": cd["artist"], "album": cd["album"], "genre": None}
        for i, cd in enumerate(found)
    ]

    cd_collection.extend(new_entries)
    save_data()

    # Broadcast immediately with genre=None so dashboard shows them right away
    broadcast({"type": "cds_added", "added": new_entries, "total": cd_collection})

    # Look up genres in background thread — broadcasts updates as each one resolves
    def fetch_genres():
        for entry in new_entries:
            genre = lookup_genre(entry["artist"], entry["album"])
            entry["genre"] = genre
            # Update the master collection too
            for cd in cd_collection:
                if cd["id"] == entry["id"]:
                    cd["genre"] = genre
                    break
            save_data()
            broadcast({"type": "genre_update", "id": entry["id"], "genre": genre})

    threading.Thread(target=fetch_genres, daemon=True).start()

    return jsonify({"found": len(new_entries), "cds": new_entries})


@app.route("/api/cds", methods=["GET"])
def get_cds():
    return jsonify(cd_collection)


@app.route("/api/cds/clear", methods=["POST"])
def clear_cds():
    global cd_collection
    cd_collection = []
    save_data()
    broadcast({"type": "cleared"})
    return jsonify({"ok": True})


@app.route("/api/cds/<cd_id>", methods=["DELETE"])
def delete_cd(cd_id):
    global cd_collection
    cd_collection = [c for c in cd_collection if c["id"] != cd_id]
    save_data()
    broadcast({"type": "deleted", "id": cd_id})
    return jsonify({"ok": True})


# ─── WebSocket ─────────────────────────────────────────────────────────────────

@sock.route("/ws")
def websocket(ws):
    with clients_lock:
        connected_clients.add(ws)
    # Send current state on connect
    ws.send(json.dumps({"type": "init", "total": cd_collection}))
    try:
        while True:
            ws.receive()  # keep alive
    except Exception:
        pass
    finally:
        with clients_lock:
            connected_clients.discard(ws)


# ─── Main ───────────────────────────────────────────────────────────────────────

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    load_data()
    ip = get_local_ip()
    print("\n" + "═" * 50)
    print("  💿  CD Sorter LAN Server")
    print("═" * 50)
    print(f"  Dashboard  →  http://{ip}:5000")
    print(f"  Phone      →  http://{ip}:5000/mobile")
    print("═" * 50 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
