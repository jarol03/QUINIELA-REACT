import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import "../styles/panel.css";
import "../styles/user.css";
import { formatDisplay } from "./DateTimePicker";

// Cierre por partido individual
function isPartidoClosed(partido) {
  if (!partido?.fecha_limite) return false;
  return new Date() > new Date(partido.fecha_limite);
}

// Estado del partido para la card de jornada
function jornadaStatus(partidos) {
  if (!partidos || partidos.length === 0) return "open";
  const now = new Date();
  const open   = partidos.filter(p => !p.fecha_limite || new Date(p.fecha_limite) > now);
  const closed = partidos.filter(p =>  p.fecha_limite && new Date(p.fecha_limite) <= now);
  if (open.length === 0) return "all-closed";
  if (closed.length > 0) return "partial";
  return "open";
}

export default function UserPanel({ user, onLogout }) {
  const [jornadas,         setJornadas]         = useState([]);
  const [jornadaPartidos,  setJornadaPartidos]   = useState({});
  const [selectedJornada,  setSelectedJornada]   = useState(null);
  const [partidos,         setPartidos]          = useState([]);
  const [pronosticos,      setPronosticos]        = useState({});
  const [savedPronosticos, setSavedPronosticos]   = useState({});
  const [saving,           setSaving]            = useState(false);
  const [loadingJornada,   setLoadingJornada]    = useState(false);
  const [toast,            setToast]             = useState({ msg: "", type: "success" });
  const [loading,          setLoading]           = useState(true);

  // ── DEBUG: log de errores del cliente ──────────────────────────────────
  const debugLog = useRef([]);

  useEffect(() => {
    const handleError = (e) => {
      const entry = {
        type: "JS_ERROR",
        msg: e.message,
        stack: e.error?.stack,
        time: new Date().toISOString(),
        pronosticos: JSON.stringify(pronosticos),
        partidos: partidos.map(p => ({ id: p.id, local: p.equipo_local, visitante: p.equipo_visitante, fecha: p.fecha_limite })),
      };
      debugLog.current.push(entry);
      console.error("[QUINIELA DEBUG]", entry);
    };
    const handleUnhandled = (e) => {
      const entry = {
        type: "UNHANDLED_PROMISE",
        msg: e.reason?.message || String(e.reason),
        time: new Date().toISOString(),
      };
      debugLog.current.push(entry);
      console.error("[QUINIELA DEBUG]", entry);
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandled);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandled);
    };
  }, [pronosticos, partidos]);

  // Función para que el admin vea el log
  useEffect(() => {
    window.__quinielaDebug = () => {
      console.table(debugLog.current);
      return debugLog.current;
    };
  }, []);

  useEffect(() => { fetchJornadas(); }, []);

  const fetchJornadas = async () => {
    setLoading(true);
    const { data: jData } = await supabase
      .from("jornadas")
      .select("*")
      .eq("terminada", false)
      .order("created_at", { ascending: false });

    const js = jData || [];
    setJornadas(js);

    if (js.length > 0) {
      const { data: allPts } = await supabase
        .from("partidos")
        .select("id, jornada_id, fecha_limite")
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

  const selectJornada = async (jornada) => {
    setLoadingJornada(true);
    setSelectedJornada(jornada);
    setPronosticos({});
    setSavedPronosticos({});

    const { data: pts } = await supabase
      .from("partidos")
      .select("*")
      .eq("jornada_id", jornada.id)
      .order("orden");
    setPartidos(pts || []);

    const { data: prons } = await supabase
      .from("pronosticos")
      .select("*")
      .eq("jornada_id", jornada.id)
      .eq("usuario_id", user.id);

    const map = {};
    (prons || []).forEach(p => {
      map[p.partido_id] = { local: p.goles_local, visitante: p.goles_visitante };
    });
    setPronosticos(map);
    setSavedPronosticos(map);
    setLoadingJornada(false);
  };

  // ── FIX PRINCIPAL: useCallback estable, sin dependencias que causen re-render ──
  // El bug ocurría porque handleChange causaba un re-render completo que
  // en algunos browsers/dispositivos perdía el foco del input activo.
  const handleChange = useCallback((partidoId, team, value) => {
    const val = value === "" ? "" : Math.max(0, parseInt(value) || 0);
    setPronosticos(prev => ({
      ...prev,
      [partidoId]: { ...prev[partidoId], [team]: val }
    }));
  }, []); // sin dependencias — usa el setter funcional de useState

  const handleSave = async () => {
    setSaving(true);
    const now = new Date();

    const upserts = partidos
      .filter(p => !p.fecha_limite || new Date(p.fecha_limite) > now)
      .filter(p => {
        const v = pronosticos[p.id];
        return v?.local !== undefined && v?.local !== "" &&
               v?.visitante !== undefined && v?.visitante !== "";
      })
      .map(p => ({
        usuario_id:      user.id,
        jornada_id:      selectedJornada.id,
        partido_id:      p.id,
        goles_local:     pronosticos[p.id]?.local ?? null,
        goles_visitante: pronosticos[p.id]?.visitante ?? null,
      }));

    if (upserts.length === 0) {
      showToast("No hay pronósticos abiertos para guardar.", "error");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("pronosticos")
      .upsert(upserts, { onConflict: "usuario_id,partido_id" });

    if (!error) {
      setSavedPronosticos({ ...pronosticos });
      showToast("¡Pronósticos guardados correctamente!", "success");
    } else {
      showToast("Error al guardar. Intenta de nuevo.", "error");
    }
    setSaving(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 3500);
  };

  const openPartidos   = partidos.filter(p => !isPartidoClosed(p));
  const closedPartidos = partidos.filter(p =>  isPartidoClosed(p));

  const openFilled = openPartidos.filter(p => {
    const v = pronosticos[p.id];
    return v?.local !== undefined && v?.local !== "" &&
           v?.visitante !== undefined && v?.visitante !== "";
  }).length;

  const allOpenFilled = openPartidos.length > 0 && openFilled === openPartidos.length;

  const totalFilled = partidos.filter(p => {
    const v = pronosticos[p.id];
    return v?.local !== undefined && v?.local !== "" &&
           v?.visitante !== undefined && v?.visitante !== "";
  }).length;

  const progress = partidos.length > 0 ? Math.round((totalFilled / partidos.length) * 100) : 0;

  const alreadySaved = openPartidos.length > 0 && openPartidos.every(p => {
    const s = savedPronosticos[p.id];
    return s && s.local !== null && s.local !== undefined;
  });

  const hasUnsavedChanges = openPartidos.some(p => {
    const cur = pronosticos[p.id];
    const sav = savedPronosticos[p.id];
    return String(cur?.local ?? "") !== String(sav?.local ?? "") ||
           String(cur?.visitante ?? "") !== String(sav?.visitante ?? "");
  });

  const anyOpen = openPartidos.length > 0;

  return (
    <div className="panel-bg">
      <header className="panel-header">
        <div className="panel-header-left">
          <span className="panel-logo">⚽ Quiniela 2026</span>
        </div>
        <div className="panel-header-right">
          <span className="panel-username">
            {user.nombre ? `👤 ${user.nombre}` : `👤 ${user.username}`}
          </span>
          <button className="panel-logout" onClick={onLogout}>Salir</button>
        </div>
      </header>

      <div className="panel-body">
        {!selectedJornada ? (
          <div className="jornadas-view">
            <div className="page-header">
              <h2 className="section-title">Mis Jornadas</h2>
              <p className="page-subtitle">Selecciona una jornada para ver o ingresar tus pronósticos</p>
            </div>

            {loading && <div className="loading-state"><div className="spinner" /><p>Cargando...</p></div>}

            {!loading && jornadas.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon">🏟️</span>
                <p>No hay jornadas disponibles aún.</p>
                <span>El administrador abrirá las jornadas pronto.</span>
              </div>
            )}

            <div className="jornadas-grid">
              {jornadas.map((j, idx) => {
                const pts   = jornadaPartidos[j.id] || [];
                const st    = jornadaStatus(pts);
                const label = st === "all-closed" ? "⏸ CERRADA"
                            : st === "partial"    ? "⚡ PARCIAL"
                            : "▶ ABIERTA";
                const cls   = st === "all-closed" ? "closed"
                            : st === "partial"    ? "partial"
                            : "open";
                return (
                  <div
                    key={j.id}
                    className={`jornada-card ${cls}`}
                    onClick={() => selectJornada(j)}
                    style={{ animationDelay: `${idx * 0.06}s` }}
                  >
                    <div className="jornada-card-tag">{label}</div>
                    <h3 className="jornada-card-title">{j.nombre}</h3>
                    {pts.length > 0 && (
                      <p className="jornada-card-date">
                        {pts.length} partido{pts.length !== 1 ? "s" : ""}
                        {st === "partial" && ` · ${pts.filter(p => !p.fecha_limite || new Date(p.fecha_limite) > new Date()).length} abierto(s)`}
                      </p>
                    )}
                    <span className="jornada-card-cta">
                      {st === "all-closed" ? "Ver mis pronósticos" : "Ingresar pronósticos"} →
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        ) : (
          <div className="pronosticos-view">
            <button className="back-btn" onClick={() => setSelectedJornada(null)}>← Volver</button>

            <div className="pronosticos-header">
              <div className="pronosticos-header-top">
                <h2 className="section-title" style={{ marginBottom: 4 }}>{selectedJornada.nombre}</h2>
                {openPartidos.length === 0
                  ? <span className="status-badge closed">⏸ Todos cerrados</span>
                  : closedPartidos.length > 0
                    ? <span className="status-badge partial">⚡ {openPartidos.length} abierto{openPartidos.length !== 1 ? "s" : ""} de {partidos.length}</span>
                    : <span className="status-badge open">▶ Abierta</span>
                }
              </div>

              {anyOpen && (
                <div className="progress-section">
                  {alreadySaved && !hasUnsavedChanges ? (
                    <div className="already-saved-banner">
                      <span className="asb-icon">✅</span>
                      <div>
                        <strong>¡Ya guardaste tus pronósticos!</strong>
                        <span>Puedes modificarlos hasta que cierre cada partido.</span>
                      </div>
                    </div>
                  ) : hasUnsavedChanges ? (
                    <div className="unsaved-banner">
                      <span className="asb-icon">⚠️</span>
                      <div>
                        <strong>Tienes cambios sin guardar</strong>
                        <span>No olvides presionar "Guardar pronósticos".</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="progress-bar-wrap">
                    <div className="progress-bar-labels">
                      <span>{totalFilled} de {partidos.length} partidos completados</span>
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
                  // ── FIX: cada partido es un componente separado con React.memo
                  // para que un cambio en un partido NO re-renderice los demás
                  <PartidoRow
                    key={p.id}
                    partido={p}
                    index={i}
                    value={pronosticos[p.id] || {}}
                    savedValue={savedPronosticos[p.id]}
                    onChange={handleChange}
                    animDelay={i * 0.04}
                  />
                ))}
              </div>
            )}

            {anyOpen && partidos.length > 0 && !loadingJornada && (
              <div className="save-bar">
                {!allOpenFilled && openPartidos.length > 0 && (
                  <p className="save-hint">
                    Faltan {openPartidos.length - openFilled} partido{openPartidos.length - openFilled !== 1 ? "s" : ""} abierto{openPartidos.length - openFilled !== 1 ? "s" : ""} por completar
                  </p>
                )}
                {/* FIX: el botón NO cambia disabled cuando allOpenFilled cambia para evitar re-focus issues */}
                <button
                  className={`save-btn ${alreadySaved && !hasUnsavedChanges ? "save-btn-done" : ""}`}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Guardando..." : alreadySaved && !hasUnsavedChanges ? "✓ Pronósticos guardados" : "Guardar pronósticos →"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {toast.msg && (
        <div className={`toast ${toast.type === "error" ? "toast-error" : ""}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── PartidoRow como componente React.memo ──────────────────────────────────
// Esto es clave: cada fila solo se re-renderiza cuando SUS datos cambian,
// no cuando cambia cualquier otro partido. Esto elimina el re-render
// completo que causaba la pérdida de foco en el penúltimo partido.
import { memo } from "react";

const PartidoRow = memo(function PartidoRow({ partido: p, index: i, value: val, savedValue: saved, onChange, animDelay }) {
  const partidoClosed  = isPartidoClosed(p);
  const isPartidoSaved = saved?.local !== null && saved?.local !== undefined &&
                         saved?.visitante !== null && saved?.visitante !== undefined;
  const isFilled       = val.local !== "" && val.local !== undefined &&
                         val.visitante !== "" && val.visitante !== undefined;
  const isModified     = isPartidoSaved && (
    String(val.local) !== String(saved.local) ||
    String(val.visitante) !== String(saved.visitante)
  );

  return (
    <div
      className={`partido-row
        ${partidoClosed ? "partido-readonly" : ""}
        ${isPartidoSaved && !isModified ? "partido-saved" : ""}
        ${isModified ? "partido-modified" : ""}
      `}
      style={{ animationDelay: `${animDelay}s` }}
    >
      <span className="partido-num">{i + 1}</span>

      <div className="partido-teams">
        <div className="partido-teams-inner">
          <div className="team-vs-row">
            <span className="team-name">{p.equipo_local}</span>
            <span className="vs-sep">VS</span>
            <span className="team-name">{p.equipo_visitante}</span>
          </div>
          {p.fecha_limite && (
            <span className={`partido-fecha ${partidoClosed ? "partido-fecha-closed" : "partido-fecha-open"}`}>
              {partidoClosed ? "🔒 Cerró: " : "⏰ Cierra: "}
              {new Date(p.fecha_limite).toLocaleString("es-HN", {
                day: "2-digit", month: "2-digit",
                hour: "2-digit", minute: "2-digit", hour12: true
              })}
            </span>
          )}
        </div>
      </div>

      <div className="score-inputs">
        <input
          className={`score-input
            ${partidoClosed ? "score-input-saved" : ""}
            ${isPartidoSaved && !isModified && !partidoClosed ? "score-input-ok" : ""}
          `}
          type="number" min="0"
          value={val.local ?? ""}
          onChange={e => onChange(p.id, "local", e.target.value)}
          disabled={partidoClosed}
          placeholder="0"
          inputMode="numeric"
        />
        <span className="score-dash">–</span>
        <input
          className={`score-input
            ${partidoClosed ? "score-input-saved" : ""}
            ${isPartidoSaved && !isModified && !partidoClosed ? "score-input-ok" : ""}
          `}
          type="number" min="0"
          value={val.visitante ?? ""}
          onChange={e => onChange(p.id, "visitante", e.target.value)}
          disabled={partidoClosed}
          placeholder="0"
          inputMode="numeric"
        />
      </div>

      <div className="partido-status-icon">
        {partidoClosed ? (
          <span className="psi psi-locked" title="Cerrado">🔒</span>
        ) : isModified ? (
          <span className="psi psi-modified" title="Modificado sin guardar">✏️</span>
        ) : isPartidoSaved ? (
          <span className="psi psi-ok" title="Guardado">✓</span>
        ) : isFilled ? (
          <span className="psi psi-ready" title="Listo para guardar">○</span>
        ) : (
          <span className="psi psi-empty" title="Sin completar">·</span>
        )}
      </div>
    </div>
  );
});