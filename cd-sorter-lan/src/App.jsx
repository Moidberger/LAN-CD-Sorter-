import { useState, useEffect, useRef, useCallback } from "react";

// ─── Helpers ────────────────────────────────────────────────────────────────

// Genre color palette — deterministic per genre name
const GENRE_COLORS = [
  ["#f0c060","#2a1f00"], ["#a0d4f0","#001a2a"], ["#c8a0f0","#1a0030"],
  ["#f0a0b0","#2a000f"], ["#a0f0c0","#002a14"], ["#f0b090","#2a1000"],
  ["#90d0f0","#001828"], ["#d0f090","#182800"], ["#f090d0","#280018"],
  ["#90f0d0","#002820"],
];
function genreColor(genre) {
  if (!genre || genre === "Unknown") return ["rgba(255,255,255,0.1)", "rgba(255,255,255,0.4)"];
  let h = 0;
  for (let i = 0; i < genre.length; i++) h = (h * 31 + genre.charCodeAt(i)) & 0xffff;
  return GENRE_COLORS[h % GENRE_COLORS.length];
}

function CDCard({ cd, index, onDelete }) {
  const [bg, fg] = genreColor(cd.genre);
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "14px",
        padding: "13px 16px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "10px", marginBottom: "7px",
        animation: "fadeSlideIn 0.3s ease both",
        animationDelay: `${Math.min(index * 0.03, 0.4)}s`,
      }}
    >
      {/* Disc */}
      <div style={{
        width: "34px", height: "34px", borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(135deg,#c0c0c0 0%,#888 40%,#c0c0c0 60%,#666 100%)",
        boxShadow: "0 0 0 3px rgba(255,255,255,0.07), inset 0 0 0 8px rgba(0,0,0,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "7px", color: "rgba(255,255,255,0.3)",
      }}>●</div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "14px",
          color: "#f0ece4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{cd.artist}</div>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: "11px",
          color: "rgba(240,236,228,0.45)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{cd.album}</div>
      </div>

      {/* Genre badge */}
      <div style={{
        flexShrink: 0, padding: "3px 8px", borderRadius: "5px",
        background: bg, color: fg,
        fontFamily: "'DM Mono', monospace", fontSize: "10px", fontWeight: 400,
        letterSpacing: "0.3px", maxWidth: "90px",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        transition: "all 0.3s",
        opacity: cd.genre ? 1 : 0.4,
      }}>
        {cd.genre === null ? "…" : (cd.genre === "Unknown" ? "?" : cd.genre)}
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(cd.id)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.2)", fontSize: "16px", lineHeight: 1,
          padding: "4px 6px", borderRadius: "6px", transition: "color 0.15s",
          flexShrink: 0,
        }}
        onMouseEnter={e => e.target.style.color = "#ff7070"}
        onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.2)"}
        title="Remove"
      >×</button>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function CDSorterDashboard() {
  const [cds, setCds] = useState([]);
  const [sortBy, setSortBy] = useState("artist");
  const [groupByGenre, setGroupByGenre] = useState(false);
  const [filterGenre, setFilterGenre] = useState("all");
  const [wsStatus, setWsStatus] = useState("connecting"); // connecting | live | disconnected
  const [processingPhone, setProcessingPhone] = useState(false);
  const [flashCount, setFlashCount] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  // ── WebSocket connection ──
  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus("live");

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        setCds(msg.total || []);
      } else if (msg.type === "cds_added") {
        setCds(msg.total || []);
        setProcessingPhone(false);
        setFlashCount(msg.added?.length ?? 0);
        setTimeout(() => setFlashCount(null), 3000);
      } else if (msg.type === "status" && msg.status === "processing") {
        setProcessingPhone(true);
      } else if (msg.type === "status" && msg.status === "error") {
        setProcessingPhone(false);
      } else if (msg.type === "genre_update") {
        setCds(prev => prev.map(c => c.id === msg.id ? { ...c, genre: msg.genre } : c));
      } else if (msg.type === "cleared") {
        setCds([]);
      } else if (msg.type === "deleted") {
        setCds(prev => prev.filter(c => c.id !== msg.id));
      }
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Sort + filter ──
  const allGenres = ["all", ...Array.from(new Set(cds.map(c => c.genre).filter(g => g && g !== "Unknown"))).sort()];

  const strip = s => s.replace(/^(the |a |an )/i, "");
  const filtered = filterGenre === "all" ? cds : cds.filter(c => c.genre === filterGenre);
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "genre") {
      const ga = a.genre || "zzz", gb = b.genre || "zzz";
      if (ga !== gb) return ga.localeCompare(gb);
      return strip(a.artist).localeCompare(strip(b.artist));
    }
    const ka = strip(sortBy === "artist" ? a.artist : a.album);
    const kb = strip(sortBy === "artist" ? b.artist : b.album);
    return ka.localeCompare(kb);
  });

  // Group by genre if enabled
  const grouped = groupByGenre
    ? sorted.reduce((acc, cd) => {
        const g = cd.genre || "Unknown";
        if (!acc[g]) acc[g] = [];
        acc[g].push(cd);
        return acc;
      }, {})
    : null;

  // ── Delete ──
  const handleDelete = async (id) => {
    await fetch(`/api/cds/${id}`, { method: "DELETE" });
    // WS broadcast will update state
  };

  const handleClear = async () => {
    if (!window.confirm("Clear your entire collection?")) return;
    await fetch("/api/cds/clear", { method: "POST" });
  };

  // ── Status dot ──
  const dot = {
    live: { color: "#c8f0a0", label: "live" },
    connecting: { color: "#f0c060", label: "connecting…" },
    disconnected: { color: "#ff7070", label: "reconnecting…" },
  }[wsStatus];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@300;400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d0c0f; }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
        @keyframes flashIn {
          0%   { background: rgba(200,240,160,0.15); }
          100% { background: transparent; }
        }
        .flash { animation: flashIn 2s ease forwards; border-radius: 12px; }
      `}</style>

      <div style={{
        minHeight: "100vh", background: "#0d0c0f",
        backgroundImage: "radial-gradient(ellipse at 20% 0%, rgba(80,60,120,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(40,80,100,0.1) 0%, transparent 60%)",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "40px 20px",
        fontFamily: "'Syne', sans-serif",
      }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px", animation: "fadeSlideIn 0.5s ease both" }}>
          <div style={{ fontSize: "10px", letterSpacing: "4px", color: "rgba(255,255,255,0.28)", fontFamily: "'DM Mono', monospace", marginBottom: "8px", textTransform: "uppercase" }}>
            your collection
          </div>
          <h1 style={{ fontSize: "clamp(34px,6vw,52px)", fontWeight: 800, color: "#f0ece4", letterSpacing: "-2px", lineHeight: 1 }}>
            CD Sorter
          </h1>
          <p style={{ color: "rgba(240,236,228,0.35)", fontSize: "13px", marginTop: "8px", fontFamily: "'DM Mono', monospace" }}>
            photograph → identify → alphabetize
          </p>
        </div>

        {/* Connection bar */}
        <div style={{
          width: "100%", maxWidth: "560px", marginBottom: "24px",
          padding: "10px 16px",
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "10px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          animation: "fadeSlideIn 0.5s ease 0.1s both",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: "7px", height: "7px", borderRadius: "50%",
              background: dot.color,
              animation: wsStatus === "live" ? "pulse 2s ease infinite" : "none",
            }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
              {dot.label}
            </span>
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "rgba(255,255,255,0.25)" }}>
            phone → <span style={{ color: "rgba(255,255,255,0.5)" }}>http://{window.location.host}/mobile</span>
          </div>
        </div>

        {/* Phone processing indicator */}
        {processingPhone && (
          <div style={{
            width: "100%", maxWidth: "560px", marginBottom: "16px",
            padding: "12px 16px", borderRadius: "10px",
            background: "rgba(200,240,160,0.06)", border: "1px solid rgba(200,240,160,0.15)",
            display: "flex", alignItems: "center", gap: "10px",
            fontFamily: "'DM Mono', monospace", fontSize: "13px", color: "rgba(200,240,160,0.8)",
            animation: "fadeSlideIn 0.3s ease both",
          }}>
            <div style={{
              width: "14px", height: "14px", border: "2px solid rgba(200,240,160,0.2)",
              borderTopColor: "rgba(200,240,160,0.8)", borderRadius: "50%",
              animation: "pulse 0.8s linear infinite",
            }} />
            Processing image from phone…
          </div>
        )}

        {/* Flash badge */}
        {flashCount !== null && flashCount > 0 && (
          <div style={{
            width: "100%", maxWidth: "560px", marginBottom: "16px",
            padding: "12px 16px", borderRadius: "10px",
            background: "rgba(200,240,160,0.08)", border: "1px solid rgba(200,240,160,0.2)",
            fontFamily: "'DM Mono', monospace", fontSize: "13px", color: "#c8f0a0",
            animation: "fadeSlideIn 0.3s ease both",
          }}>
            ✓ {flashCount} new CD{flashCount > 1 ? "s" : ""} added from phone
          </div>
        )}

        {/* Collection controls */}
        {cds.length > 0 && (
          <div style={{
            width: "100%", maxWidth: "560px", marginBottom: "14px",
            animation: "fadeSlideIn 0.4s ease both",
          }}>
            {/* Sort + group row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>
                {filtered.length}{filterGenre !== "all" ? ` / ${cds.length}` : ""} disc{cds.length !== 1 ? "s" : ""}
              </span>
              <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "rgba(255,255,255,0.22)" }}>sort</span>
                {["artist", "album", "genre"].map(opt => (
                  <button key={opt} onClick={() => setSortBy(opt)} style={{
                    padding: "4px 9px", borderRadius: "6px", border: "none", cursor: "pointer",
                    fontFamily: "'DM Mono', monospace", fontSize: "11px",
                    background: sortBy === opt ? "rgba(255,255,255,0.1)" : "transparent",
                    color: sortBy === opt ? "#f0ece4" : "rgba(255,255,255,0.28)",
                    transition: "all 0.15s",
                  }}>{opt}</button>
                ))}
                <button onClick={() => setGroupByGenre(g => !g)} style={{
                  padding: "4px 9px", borderRadius: "6px", border: "none", cursor: "pointer",
                  fontFamily: "'DM Mono', monospace", fontSize: "11px",
                  background: groupByGenre ? "rgba(200,240,160,0.12)" : "transparent",
                  color: groupByGenre ? "#c8f0a0" : "rgba(255,255,255,0.28)",
                  transition: "all 0.15s",
                }}>group</button>
                <button onClick={handleClear} style={{
                  marginLeft: "4px", padding: "4px 9px", borderRadius: "6px", border: "none",
                  cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: "11px",
                  background: "transparent", color: "rgba(255,255,255,0.2)", transition: "color 0.15s",
                }}
                  onMouseEnter={e => e.target.style.color = "#ff7070"}
                  onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.2)"}
                >clear</button>
              </div>
            </div>

            {/* Genre filter pills */}
            {allGenres.length > 2 && (
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                {allGenres.map(g => (
                  <button key={g} onClick={() => setFilterGenre(g)} style={{
                    padding: "3px 9px", borderRadius: "20px", border: "none", cursor: "pointer",
                    fontFamily: "'DM Mono', monospace", fontSize: "10px",
                    background: filterGenre === g ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                    color: filterGenre === g ? "#f0ece4" : "rgba(255,255,255,0.3)",
                    transition: "all 0.15s",
                  }}>{g}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CD List */}
        <div style={{ width: "100%", maxWidth: "560px" }}>
          {sorted.length === 0 && !processingPhone ? (
            <div style={{
              textAlign: "center", padding: "48px 0",
              color: "rgba(255,255,255,0.13)", fontFamily: "'DM Mono', monospace", fontSize: "13px",
              animation: "fadeSlideIn 0.5s ease 0.2s both",
            }}>
              <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.4 }}>💿</div>
              Open <span style={{ color: "rgba(255,255,255,0.3)" }}>http://{window.location.host}/mobile</span><br />
              on your phone to start scanning
            </div>
          ) : groupByGenre && grouped ? (
            Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([genre, items]) => (
              <div key={genre} style={{ marginBottom: "20px" }}>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: "10px", letterSpacing: "2px",
                  color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: "8px",
                  paddingLeft: "4px", borderLeft: "2px solid rgba(255,255,255,0.1)", paddingLeft: "8px",
                }}>{genre} · {items.length}</div>
                {items.map((cd, i) => <CDCard key={cd.id} cd={cd} index={i} onDelete={handleDelete} />)}
              </div>
            ))
          ) : (
            sorted.map((cd, i) => (
              <CDCard key={cd.id} cd={cd} index={i} onDelete={handleDelete} />
            ))
          )}
        </div>
      </div>
    </>
  );
}
