import { useState, useEffect, useCallback, useRef, memo } from "react";
import { supabase } from "../supabaseClient";
import "../styles/panel.css";
import "../styles/user.css";

// ── Helpers ────────────────────────────────────────────────────────────────
function isPartidoClosed(partido) {
  if (!partido?.fecha_limite) return false;
  return new Date() > new Date(partido.fecha_limite);
}

function jornadaStatus(partidos) {
  if (!partidos || partidos.length === 0) return "open";
  const now    = new Date();
  const open   = partidos.filter(p => !p.fecha_limite || new Date(p.fecha_limite) > now);
  const closed = partidos.filter(p =>  p.fecha_limite && new Date(p.fecha_limite) <= now);
  if (open.length === 0) return "all-closed";
  if (closed.length > 0) return "partial";
  return "open";
}

function fmtFecha(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-HN", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function calcPuntos(pron, partido) {
  if (!partido || pron?.goles_local == null) return null;
  if (partido.goles_local_real == null) return null;
  const gl = Number(pron.goles_local), gv = Number(pron.goles_visitante);
  const rl = Number(partido.goles_local_real), rv = Number(partido.goles_visitante_real);
  if (gl === rl && gv === rv) return 3;
  const rp = gl > gv ? "L" : gl < gv ? "V" : "E";
  const rr = rl > rv ? "L" : rl < rv ? "V" : "E";
  return rp === rr ? 1 : 0;
}

function addPosRanking(arr) {
  const result = [];
  let posActual = 1;
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) { result.push({ ...arr[i], pos: 1 }); }
    else {
      const esEmpate = arr[i].pts === arr[i - 1].pts;
      if (!esEmpate) posActual = result[i - 1].pos + 1;
      result.push({ ...arr[i], pos: posActual });
    }
  }
  return result;
}

function medalEmoji(pos, pts) {
  if (pts <= 0) return pos;
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return pos;
}

// ── Componente principal ───────────────────────────────────────────────────
export default function UserPanel({ user, onLogout }) {
  const [tab, setTab]                       = useState("jornadas"); // jornadas | puntos | ranking
  const [jornadas, setJornadas]             = useState([]);
  const [jornadaPartidos, setJornadaPartidos] = useState({});
  const [selectedJornada, setSelectedJornada] = useState(null);
  const [partidos, setPartidos]             = useState([]);
  const [pronosticos, setPronosticos]       = useState({});
  const [savedPronosticos, setSavedPronosticos] = useState({});
  const [saving, setSaving]                 = useState(false);
  const [loadingJornada, setLoadingJornada] = useState(false);
  const [loading, setLoading]               = useState(true);
  const [toast, setToast]                   = useState({ msg: "", type: "success" });

  // Puntos y ranking
  const [misJornadas, setMisJornadas]           = useState([]);
  const [ranking, setRanking]                   = useState([]);
  const [loadingRanking, setLoadingRanking]     = useState(false);
  const [allPartidos, setAllPartidos]           = useState([]);
  const [allPronsMios, setAllPronsMios]         = useState([]);
  const [jornadaExpandida, setJornadaExpandida] = useState(null);

  const debugLog = useRef([]);

  // Debug listener
  useEffect(() => {
    const handleError = (e) => {
      const entry = { type: "JS_ERROR", msg: e.message, time: new Date().toISOString() };
      debugLog.current.push(entry);
      console.error("[QUINIELA DEBUG]", entry);
    };
    window.addEventListener("error", handleError);
    window.__quinielaDebug = () => { console.table(debugLog.current); return debugLog.current; };
    return () => window.removeEventListener("error", handleError);
  }, []);

  useEffect(() => { fetchJornadas(); }, []);

  // Cuando cambia al tab de puntos/ranking, cargar datos
  useEffect(() => {
    if (tab === "puntos" || tab === "ranking") loadRanking();
  }, [tab]);

  const fetchJornadas = async () => {
    setLoading(true);
    const { data: jData } = await supabase
      .from("jornadas").select("*").eq("terminada", false)
      .order("created_at", { ascending: false });
    const js = jData || [];
    setJornadas(js);

    if (js.length > 0) {
      const { data: allPts } = await supabase
        .from("partidos").select("id, jornada_id, fecha_limite")
        .in("jornada_id", js.map(j => j.id));
      const map = {};
      (allPts || []).forEach(p => {
        if (!map[p.jornada_id]) map[p.jornada_id] = [];
        map[p.jornada_id].push(p);
      });
      setJornadaPartidos(map);
    }
    setLoading(false);
  };

  const loadRanking = async () => {
    setLoadingRanking(true);
    const [{ data: usrs }, { data: allPts }, { data: allProns }, { data: js }] = await Promise.all([
      supabase.from("usuarios").select("id, username, nombre").order("username"),
      supabase.from("partidos").select("*"),
      supabase.from("pronosticos").select("*"),
      supabase.from("jornadas").select("*").order("created_at"),
    ]);

    const jornadasConRes = (js || []).filter(j =>
      (allPts || []).some(p => p.jornada_id === j.id && p.goles_local_real != null)
    );
    setMisJornadas(jornadasConRes);
    setAllPartidos(allPts || []);
    // Solo mis pronósticos
    setAllPronsMios((allProns || []).filter(pr => pr.usuario_id === user.id));

    const rankData = (usrs || []).map(u => {
      let totalPts = 0;
      const porJornada = {};
      jornadasConRes.forEach(j => {
        const ptsDej = (allPts || []).filter(p => p.jornada_id === j.id);
        let jPts = 0;
        ptsDej.forEach(p => {
          const pron = (allProns || []).find(pr => pr.usuario_id === u.id && pr.partido_id === p.id);
          const pts = calcPuntos(pron, p);
          if (pts === 3) { jPts += 3; totalPts += 3; }
          else if (pts === 1) { jPts += 1; totalPts += 1; }
        });
        porJornada[j.id] = jPts;
      });
      return { ...u, pts: totalPts, porJornada };
    }).sort((a, b) => b.pts - a.pts);

    setRanking(addPosRanking(rankData));
    setLoadingRanking(false);
  };

  const selectJornada = async (jornada) => {
    setLoadingJornada(true);
    setSelectedJornada(jornada);
    setPronosticos({}); setSavedPronosticos({});

    const { data: pts } = await supabase.from("partidos").select("*")
      .eq("jornada_id", jornada.id).order("orden");
    setPartidos(pts || []);

    const { data: prons } = await supabase.from("pronosticos").select("*")
      .eq("jornada_id", jornada.id).eq("usuario_id", user.id);
    const map = {};
    (prons || []).forEach(p => { map[p.partido_id] = { local: p.goles_local, visitante: p.goles_visitante }; });
    setPronosticos(map); setSavedPronosticos(map);
    setLoadingJornada(false);
  };

  const handleChange = useCallback((partidoId, team, value) => {
    const val = value === "" ? "" : Math.max(0, parseInt(value) || 0);
    setPronosticos(prev => ({ ...prev, [partidoId]: { ...prev[partidoId], [team]: val } }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const now = new Date();
    const upserts = partidos
      .filter(p => !p.fecha_limite || new Date(p.fecha_limite) > now)
      .filter(p => {
        const v = pronosticos[p.id];
        return v?.local !== undefined && v?.local !== "" && v?.visitante !== undefined && v?.visitante !== "";
      })
      .map(p => ({
        usuario_id: user.id, jornada_id: selectedJornada.id, partido_id: p.id,
        goles_local: pronosticos[p.id]?.local ?? null,
        goles_visitante: pronosticos[p.id]?.visitante ?? null,
      }));

    if (!upserts.length) { showToast("No hay pronósticos abiertos.", "error"); setSaving(false); return; }
    const { error } = await supabase.from("pronosticos").upsert(upserts, { onConflict: "usuario_id,partido_id" });
    if (!error) { setSavedPronosticos({ ...pronosticos }); showToast("¡Guardado!", "success"); }
    else showToast("Error al guardar.", "error");
    setSaving(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 3000);
  };

  // Derivados para la vista de pronósticos
  const openPartidos   = partidos.filter(p => !isPartidoClosed(p));
  const closedPartidos = partidos.filter(p =>  isPartidoClosed(p));
  const openFilled     = openPartidos.filter(p => {
    const v = pronosticos[p.id];
    return v?.local !== undefined && v?.local !== "" && v?.visitante !== undefined && v?.visitante !== "";
  }).length;
  const allOpenFilled  = openPartidos.length > 0 && openFilled === openPartidos.length;
  const totalFilled    = partidos.filter(p => {
    const v = pronosticos[p.id]; return v?.local !== undefined && v?.local !== "" && v?.visitante !== undefined && v?.visitante !== "";
  }).length;
  const progress       = partidos.length > 0 ? Math.round((totalFilled / partidos.length) * 100) : 0;
  const alreadySaved   = openPartidos.length > 0 && openPartidos.every(p => {
    const s = savedPronosticos[p.id]; return s && s.local != null && s.visitante != null;
  });
  const hasUnsaved     = openPartidos.some(p => {
    const cur = pronosticos[p.id], sav = savedPronosticos[p.id];
    return String(cur?.local ?? "") !== String(sav?.local ?? "") || String(cur?.visitante ?? "") !== String(sav?.visitante ?? "");
  });

  // Datos propios en el ranking
  const miPos    = ranking.find(u => u.id === user.id);
  const misPts   = miPos?.pts ?? 0;
  const misRankg = miPos?.pos ?? "—";

  return (
    <div className="panel-bg user-app">
      {/* ── HEADER ── */}
      <header className="user-header">
        <div className="user-header-info">
          <div className="user-avatar-sm">{(user.nombre || user.username).charAt(0).toUpperCase()}</div>
          <div>
            <span className="user-header-name">{user.nombre || user.username}</span>
            {misPts > 0 && <span className="user-header-pts">{misPts} pts · #{misRankg}</span>}
          </div>
        </div>
        <button className="panel-logout" onClick={onLogout}>Salir</button>
      </header>

      {/* ── CONTENT ── */}
      <div className="user-content">

        {/* ═══════════ TAB: JORNADAS ═══════════ */}
        {tab === "jornadas" && (
          <div className="user-tab-content">
            {!selectedJornada ? (
              <>
                <div className="user-section-header">
                  <h2 className="user-section-title">Jornadas</h2>
                  <p className="user-section-sub">Selecciona para ingresar tus pronósticos</p>
                </div>

                {loading && <div className="loading-state"><div className="spinner" /></div>}

                {!loading && jornadas.length === 0 && (
                  <div className="empty-state">
                    <span className="empty-icon">🏟️</span>
                    <p>Sin jornadas disponibles</p>
                    <span>Luis abrirá las jornadas pronto.</span>
                  </div>
                )}

                <div className="user-jornadas-list">
                  {jornadas.map((j, idx) => {
                    const pts = jornadaPartidos[j.id] || [];
                    const st  = jornadaStatus(pts);
                    const openCount = pts.filter(p => !p.fecha_limite || new Date(p.fecha_limite) > new Date()).length;
                    return (
                      <div key={j.id} className={`user-jornada-card ${st}`}
                        onClick={() => selectJornada(j)}
                        style={{ animationDelay: `${idx * 0.05}s` }}>
                        <div className="ujc-left">
                          <div className={`ujc-dot ${st}`} />
                          <div>
                            <span className="ujc-nombre">{j.nombre}</span>
                            <span className="ujc-meta">
                              {pts.length} partido{pts.length !== 1 ? "s" : ""}
                              {st === "partial" && ` · ${openCount} abierto${openCount !== 1 ? "s" : ""}`}
                              {st === "all-closed" && " · todos cerrados"}
                            </span>
                          </div>
                        </div>
                        <div className="ujc-right">
                          <span className="ujc-badge">
                            {st === "all-closed" ? "Ver" : "Jugar"}
                          </span>
                          <span className="ujc-arrow">›</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* ── Vista pronósticos ── */
              <div className="pronosticos-view">
                <button className="back-btn" onClick={() => setSelectedJornada(null)}>← Volver</button>

                <div className="pronosticos-header">
                  <div className="pronosticos-header-top">
                    <h2 className="section-title" style={{ marginBottom: 4 }}>{selectedJornada.nombre}</h2>
                    {openPartidos.length === 0
                      ? <span className="status-badge closed">⏸ Todos cerrados</span>
                      : closedPartidos.length > 0
                        ? <span className="status-badge partial">⚡ {openPartidos.length}/{partidos.length} abiertos</span>
                        : <span className="status-badge open">▶ Abierta</span>
                    }
                  </div>

                  {openPartidos.length > 0 && (
                    <div className="progress-section">
                      {alreadySaved && !hasUnsaved ? (
                        <div className="already-saved-banner">
                          <span className="asb-icon">✅</span>
                          <div><strong>¡Pronósticos guardados!</strong><span>Puedes modificarlos hasta que cierre cada partido.</span></div>
                        </div>
                      ) : hasUnsaved ? (
                        <div className="unsaved-banner">
                          <span className="asb-icon">⚠️</span>
                          <div><strong>Cambios sin guardar</strong><span>Presiona "Guardar" antes de salir.</span></div>
                        </div>
                      ) : null}
                      <div className="progress-bar-wrap">
                        <div className="progress-bar-labels">
                          <span>{totalFilled}/{partidos.length} completados</span>
                          <span className="progress-pct">{progress}%</span>
                        </div>
                        <div className="progress-bar-track">
                          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {loadingJornada ? (
                  <div className="loading-state"><div className="spinner" /></div>
                ) : partidos.length === 0 ? (
                  <p className="dim-text">No hay partidos en esta jornada.</p>
                ) : (
                  <div className="partidos-list">
                    {partidos.map((p, i) => (
                      <PartidoRow
                        key={p.id} partido={p} index={i}
                        value={pronosticos[p.id] || {}}
                        savedValue={savedPronosticos[p.id]}
                        onChange={handleChange}
                        animDelay={i * 0.04}
                      />
                    ))}
                  </div>
                )}

                {openPartidos.length > 0 && partidos.length > 0 && !loadingJornada && (
                  <div className="save-bar">
                    {!allOpenFilled && <p className="save-hint">Faltan {openPartidos.length - openFilled} partido{openPartidos.length - openFilled !== 1 ? "s" : ""} por completar</p>}
                    <button
                      className={`save-btn ${alreadySaved && !hasUnsaved ? "save-btn-done" : ""}`}
                      onClick={handleSave} disabled={saving}>
                      {saving ? "Guardando..." : alreadySaved && !hasUnsaved ? "✓ Guardado" : "Guardar pronósticos →"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════ TAB: MIS PUNTOS ═══════════ */}
        {tab === "puntos" && (
          <div className="user-tab-content">
            <div className="user-section-header">
              <h2 className="user-section-title">Mis Puntos</h2>
              <p className="user-section-sub">Tu desempeño por jornada y partido</p>
            </div>

            {loadingRanking ? (
              <div className="loading-state"><div className="spinner" /></div>
            ) : misJornadas.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📊</span>
                <p>Aún sin resultados</p>
                <span>Cuando Luis ingrese resultados verás tus puntos aquí.</span>
              </div>
            ) : (
              <>
                {/* Tarjeta resumen */}
                <div className="mis-pts-hero">
                  <div className="mph-pos">{medalEmoji(misRankg, misPts)}</div>
                  <div className="mph-info">
                    <span className="mph-pts">{misPts} puntos</span>
                    <span className="mph-sub">Posición #{misRankg} de {ranking.length}</span>
                  </div>
                </div>

                {/* Jornadas con accordion de partidos */}
                <div className="mis-jornadas-pts">
                  {misJornadas.map(j => {
                    const jPts      = miPos?.porJornada?.[j.id] ?? 0;
                    const maxPts    = Math.max(...ranking.map(u => u.porJornada?.[j.id] ?? 0), 1);
                    const pct       = Math.round((jPts / maxPts) * 100);
                    const expanded  = jornadaExpandida === j.id;
                    const ptsDej    = allPartidos.filter(p => p.jornada_id === j.id && p.goles_local_real != null).sort((a,b) => a.orden - b.orden);

                    return (
                      <div key={j.id} className="mjp-card">
                        {/* Fila resumen — click para expandir */}
                        <div className="mjp-row" onClick={() => setJornadaExpandida(expanded ? null : j.id)}>
                          <div className="mjp-row-left">
                            <span className="mjp-nombre">{j.nombre}</span>
                            <div className="mjp-bar-wrap">
                              <div className="mjp-bar-track">
                                <div className="mjp-bar-fill" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                          <div className="mjp-row-right">
                            <span className="mjp-pts">{jPts}</span>
                            <span className="mjp-chevron">{expanded ? "▲" : "▼"}</span>
                          </div>
                        </div>

                        {/* Desglose por partido */}
                        {expanded && (
                          <div className="mjp-partidos">
                            {ptsDej.length === 0 && (
                              <p className="dim-text" style={{padding:"8px 0"}}>Sin partidos con resultado.</p>
                            )}
                            {ptsDej.map((p, i) => {
                              const pron = allPronsMios.find(pr => pr.partido_id === p.id);
                              const pts  = calcPuntos(pron, p);
                              const tienePron = pron?.goles_local != null;

                              return (
                                <div key={p.id} className={`mjp-partido-row ${pts === 3 ? "mjp-exacto" : pts === 1 ? "mjp-resultado" : pts === 0 ? "mjp-nada" : "mjp-sin-pron"}`}>
                                  <span className="mjp-p-num">{i + 1}</span>

                                  <div className="mjp-p-info">
                                    <span className="mjp-p-teams">
                                      {p.equipo_local} <span className="mjp-p-vs">vs</span> {p.equipo_visitante}
                                    </span>
                                    <div className="mjp-p-scores">
                                      {/* Resultado real */}
                                      <span className="mjp-p-real">
                                        Real: <strong>{p.goles_local_real} – {p.goles_visitante_real}</strong>
                                      </span>
                                      {/* Mi pronóstico */}
                                      {tienePron ? (
                                        <span className="mjp-p-pron">
                                          Yo: <strong>{pron.goles_local} – {pron.goles_visitante}</strong>
                                        </span>
                                      ) : (
                                        <span className="mjp-p-sin">Sin pronóstico</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Badge de puntos */}
                                  <div className="mjp-p-badge">
                                    {pts === 3 && <span className="mjp-badge mjp-badge-3">+3 🎯</span>}
                                    {pts === 1 && <span className="mjp-badge mjp-badge-1">+1 ✓</span>}
                                    {pts === 0 && <span className="mjp-badge mjp-badge-0">0</span>}
                                    {pts === null && <span className="mjp-badge mjp-badge-null">—</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════ TAB: RANKING ═══════════ */}
        {tab === "ranking" && (
          <div className="user-tab-content">
            <div className="user-section-header">
              <h2 className="user-section-title">Ranking Global</h2>
              <p className="user-section-sub">Suma de todas las jornadas</p>
            </div>

            {loadingRanking ? (
              <div className="loading-state"><div className="spinner" /></div>
            ) : ranking.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🏆</span>
                <p>Ranking no disponible</p>
                <span>Se activará cuando haya resultados ingresados.</span>
              </div>
            ) : (
              <div className="ranking-list">
                {ranking.map(u => {
                  const esMio = u.id === user.id;
                  return (
                    <div key={u.id} className={`ranking-row ${esMio ? "ranking-row-me" : ""} ${u.pos <= 3 && u.pts > 0 ? `ranking-row-top${u.pos}` : ""}`}>
                      <div className="rr-pos">{medalEmoji(u.pos, u.pts)}</div>
                      <div className="rr-avatar">{(u.nombre).charAt(0).toUpperCase()}</div>
                      <div className="rr-info">
                        <span className="rr-nombre">
                          {u.nombre || u.username}
                          {esMio && <span className="rr-yo"> (tú)</span>}
                        </span>
                        {/* {u.nombre && u.nombre !== u.username && (
                          <span className="rr-username">@{u.username}</span>
                        )} */}
                      </div>
                      <div className="rr-pts">
                        <span className="rr-pts-num">{u.pts}</span>
                        <span className="rr-pts-label">pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav className="user-bottom-nav">
        <button className={`ubn-item ${tab === "jornadas" ? "active" : ""}`} onClick={() => { setTab("jornadas"); setSelectedJornada(null); }}>
          <span className="ubn-icon">⚽</span>
          <span className="ubn-label">Jornadas</span>
        </button>
        <button className={`ubn-item ${tab === "puntos" ? "active" : ""}`} onClick={() => setTab("puntos")}>
          <span className="ubn-icon">📊</span>
          <span className="ubn-label">Mis Puntos</span>
        </button>
        <button className={`ubn-item ${tab === "ranking" ? "active" : ""}`} onClick={() => setTab("ranking")}>
          <span className="ubn-icon">🏆</span>
          <span className="ubn-label">Ranking</span>
        </button>
      </nav>

      {toast.msg && (
        <div className={`toast ${toast.type === "error" ? "toast-error" : ""}`}>{toast.msg}</div>
      )}
    </div>
  );
}

// ── PartidoRow memoizado ───────────────────────────────────────────────────
const PartidoRow = memo(function PartidoRow({ partido: p, index: i, value: val, savedValue: saved, onChange, animDelay }) {
  const closed       = isPartidoClosed(p);
  const isSaved      = saved?.local != null && saved?.visitante != null;
  const isFilled     = val.local !== "" && val.local !== undefined && val.visitante !== "" && val.visitante !== undefined;
  const isModified   = isSaved && (String(val.local) !== String(saved.local) || String(val.visitante) !== String(saved.visitante));

  return (
    <div className={`partido-row ${closed ? "partido-readonly" : ""} ${isSaved && !isModified ? "partido-saved" : ""} ${isModified ? "partido-modified" : ""}`}
      style={{ animationDelay: `${animDelay}s` }}>
      <span className="partido-num">{i + 1}</span>

      <div className="partido-teams">
        <div className="partido-teams-inner">
          <div className="team-vs-row">
            <span className="team-name">{p.equipo_local}</span>
            <span className="vs-sep">VS</span>
            <span className="team-name">{p.equipo_visitante}</span>
          </div>
          {p.fecha_limite && (
            <span className={`partido-fecha ${closed ? "partido-fecha-closed" : "partido-fecha-open"}`}>
              {closed ? "🔒 " : "⏰ "}{fmtFecha(p.fecha_limite)}
            </span>
          )}
        </div>
      </div>

      <div className="score-inputs">
        <input className={`score-input ${closed ? "score-input-saved" : ""} ${isSaved && !isModified && !closed ? "score-input-ok" : ""}`}
          type="number" min="0" inputMode="numeric"
          value={val.local ?? ""} onChange={e => onChange(p.id, "local", e.target.value)}
          disabled={closed} placeholder="0" />
        <span className="score-dash">–</span>
        <input className={`score-input ${closed ? "score-input-saved" : ""} ${isSaved && !isModified && !closed ? "score-input-ok" : ""}`}
          type="number" min="0" inputMode="numeric"
          value={val.visitante ?? ""} onChange={e => onChange(p.id, "visitante", e.target.value)}
          disabled={closed} placeholder="0" />
      </div>

      <div className="partido-status-icon">
        {closed      ? <span className="psi psi-locked">🔒</span>
        : isModified  ? <span className="psi psi-modified">✏️</span>
        : isSaved     ? <span className="psi psi-ok">✓</span>
        : isFilled    ? <span className="psi psi-ready">○</span>
                      : <span className="psi psi-empty">·</span>}
      </div>
    </div>
  );
});