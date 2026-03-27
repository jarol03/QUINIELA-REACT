import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import "../styles/panel.css";
import "../styles/user.css";
import { formatDisplay } from "./DateTimePicker";

export default function UserPanel({ user, onLogout }) {
  const [jornadas, setJornadas] = useState([]);
  const [selectedJornada, setSelectedJornada] = useState(null);
  const [partidos, setPartidos] = useState([]);
  const [pronosticos, setPronosticos] = useState({});
  const [savedPronosticos, setSavedPronosticos] = useState({});
  const [saving, setSaving] = useState(false);
  const [loadingJornada, setLoadingJornada] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "success" });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchJornadas(); }, []);

  const fetchJornadas = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("jornadas")
      .select("*")
      .eq("terminada", false)          // solo jornadas activas
      .order("created_at", { ascending: false });
    setJornadas(data || []);
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

  const isClosed = (jornada) => {
    if (jornada?.terminada) return true;
    if (!jornada?.fecha_limite) return false;
    return new Date() > new Date(jornada.fecha_limite);
  };

  const handleChange = (partidoId, team, value) => {
    const val = value === "" ? "" : Math.max(0, parseInt(value) || 0);
    setPronosticos(prev => ({
      ...prev,
      [partidoId]: { ...prev[partidoId], [team]: val }
    }));
  };

  const handleSave = async () => {
    if (isClosed(selectedJornada)) return;
    setSaving(true);

    const upserts = partidos.map(p => ({
      usuario_id: user.id,
      jornada_id: selectedJornada.id,
      partido_id: p.id,
      goles_local: pronosticos[p.id]?.local ?? null,
      goles_visitante: pronosticos[p.id]?.visitante ?? null,
    }));

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

  // ¿Ya guardó todos los pronósticos antes?
  const alreadySaved = partidos.length > 0 && partidos.every(p => {
    const s = savedPronosticos[p.id];
    return s && s.local !== null && s.local !== undefined && s.visitante !== null && s.visitante !== undefined;
  });

  // ¿Hay cambios sin guardar respecto a lo guardado?
  const hasUnsavedChanges = partidos.some(p => {
    const cur = pronosticos[p.id];
    const sav = savedPronosticos[p.id];
    return String(cur?.local ?? "") !== String(sav?.local ?? "") ||
           String(cur?.visitante ?? "") !== String(sav?.visitante ?? "");
  });

  const allFilled = partidos.every(p =>
    pronosticos[p.id]?.local !== undefined && pronosticos[p.id]?.local !== "" &&
    pronosticos[p.id]?.visitante !== undefined && pronosticos[p.id]?.visitante !== ""
  );

  const closed = isClosed(selectedJornada);

  // Calcula % de partidos completados
  const filledCount = partidos.filter(p =>
    pronosticos[p.id]?.local !== undefined && pronosticos[p.id]?.local !== "" &&
    pronosticos[p.id]?.visitante !== undefined && pronosticos[p.id]?.visitante !== ""
  ).length;
  const progress = partidos.length > 0 ? Math.round((filledCount / partidos.length) * 100) : 0;

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
          /* ── VISTA: LISTA DE JORNADAS ── */
          <div className="jornadas-view">
            <div className="page-header">
              <h2 className="section-title">Mis Jornadas</h2>
              <p className="page-subtitle">Selecciona una jornada para ingresar tus pronósticos</p>
            </div>

            {loading && (
              <div className="loading-state">
                <div className="spinner" />
                <p>Cargando jornadas...</p>
              </div>
            )}

            {!loading && jornadas.length === 0 && (
              <div className="empty-state">
                <span className="empty-icon">🏟️</span>
                <p>No hay jornadas disponibles aún.</p>
                <span>El administrador abrirá las jornadas pronto.</span>
              </div>
            )}

            <div className="jornadas-grid">
              {jornadas.map((j, idx) => {
                const closed = isClosed(j);
                return (
                  <div
                    key={j.id}
                    className={`jornada-card ${closed ? "closed" : "open"}`}
                    onClick={() => selectJornada(j)}
                    style={{ animationDelay: `${idx * 0.06}s` }}
                  >
                    <div className="jornada-card-tag">{closed ? "⏸ CERRADA" : "▶ ABIERTA"}</div>
                    <h3 className="jornada-card-title">{j.nombre}</h3>
                    {j.fecha_limite && (
                      <p className="jornada-card-date">
                        {closed ? "Cerró el" : "Cierra el"}{" "}
                        {formatDisplay(j.fecha_limite)}
                      </p>
                    )}
                    <span className="jornada-card-cta">
                      {closed ? "Ver mis pronósticos" : "Ingresar pronósticos"} →
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── VISTA: PRONÓSTICOS ── */
          <div className="pronosticos-view">
            <button className="back-btn" onClick={() => setSelectedJornada(null)}>
              ← Volver
            </button>

            {/* Encabezado de jornada */}
            <div className="pronosticos-header">
              <div className="pronosticos-header-top">
                <h2 className="section-title" style={{ marginBottom: 4 }}>{selectedJornada.nombre}</h2>
                {closed ? (
                  <span className="status-badge closed">⏸ Cerrada</span>
                ) : selectedJornada.fecha_limite ? (
                  <span className="status-badge open">
                    ⏰ Cierra {formatDisplay(selectedJornada.fecha_limite)}
                  </span>
                ) : (
                  <span className="status-badge open">▶ Abierta</span>
                )}
              </div>

              {/* Barra de estado / progreso */}
              {!closed && partidos.length > 0 && (
                <div className="progress-section">
                  {alreadySaved && !hasUnsavedChanges ? (
                    <div className="already-saved-banner">
                      <span className="asb-icon">✅</span>
                      <div>
                        <strong>¡Ya guardaste tus pronósticos!</strong>
                        <span>Puedes modificarlos hasta que cierre la jornada.</span>
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

                  {/* Barra de progreso */}
                  <div className="progress-bar-wrap">
                    <div className="progress-bar-labels">
                      <span>{filledCount} de {partidos.length} partidos completados</span>
                      <span className="progress-pct">{progress}%</span>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Lista de partidos */}
            {loadingJornada ? (
              <div className="loading-state">
                <div className="spinner" />
              </div>
            ) : partidos.length === 0 ? (
              <p className="dim-text">No hay partidos en esta jornada.</p>
            ) : (
              <div className="partidos-list">
                {partidos.map((p, i) => {
                  const val = pronosticos[p.id] || {};
                  const saved = savedPronosticos[p.id];
                  const isPartidoSaved = saved?.local !== null && saved?.local !== undefined &&
                                        saved?.visitante !== null && saved?.visitante !== undefined;
                  const isFilled = val.local !== "" && val.local !== undefined &&
                                   val.visitante !== "" && val.visitante !== undefined;
                  const isModified = isPartidoSaved && (
                    String(val.local) !== String(saved.local) ||
                    String(val.visitante) !== String(saved.visitante)
                  );

                  return (
                    <div
                      key={p.id}
                      className={`partido-row
                        ${closed ? "partido-readonly" : ""}
                        ${isPartidoSaved && !isModified ? "partido-saved" : ""}
                        ${isModified ? "partido-modified" : ""}
                      `}
                      style={{ animationDelay: `${i * 0.04}s` }}
                    >
                      <span className="partido-num">{i + 1}</span>

                      <div className="partido-teams">
                        <span className="team-name">{p.equipo_local}</span>
                        <span className="vs-sep">VS</span>
                        <span className="team-name">{p.equipo_visitante}</span>
                      </div>

                      <div className="score-inputs">
                        <input
                          className={`score-input ${closed ? "score-input-saved" : ""} ${isPartidoSaved && !isModified && !closed ? "score-input-ok" : ""}`}
                          type="number"
                          min="0"
                          value={val.local ?? ""}
                          onChange={e => handleChange(p.id, "local", e.target.value)}
                          disabled={closed}
                          placeholder="0"
                        />
                        <span className="score-dash">–</span>
                        <input
                          className={`score-input ${closed ? "score-input-saved" : ""} ${isPartidoSaved && !isModified && !closed ? "score-input-ok" : ""}`}
                          type="number"
                          min="0"
                          value={val.visitante ?? ""}
                          onChange={e => handleChange(p.id, "visitante", e.target.value)}
                          disabled={closed}
                          placeholder="0"
                        />
                      </div>

                      {/* Indicador de estado del partido */}
                      <div className="partido-status-icon">
                        {closed ? (
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
                })}
              </div>
            )}

            {/* Barra de guardado */}
            {!closed && partidos.length > 0 && !loadingJornada && (
              <div className="save-bar">
                {!allFilled && (
                  <p className="save-hint">
                    Faltan {partidos.length - filledCount} partido{partidos.length - filledCount !== 1 ? "s" : ""} por completar
                  </p>
                )}
                <button
                  className={`save-btn ${alreadySaved && !hasUnsavedChanges ? "save-btn-done" : ""}`}
                  onClick={handleSave}
                  disabled={saving || !allFilled}
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