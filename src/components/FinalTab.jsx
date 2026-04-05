import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

function fmtFecha(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-HN", {
    day: "2-digit", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export default function FinalTab({ user }) {
  const [config,     setConfig]     = useState(null);
  const [equipos,    setEquipos]    = useState([]);   // todos los equipos con estado eliminado
  const [miPred,     setMiPred]     = useState(null);
  const [todasPreds, setTodasPreds] = useState([]);   // todas las predicciones
  const [usuarios,   setUsuarios]   = useState([]);
  const [localSel,   setLocalSel]   = useState("");
  const [visitSel,   setVisitSel]   = useState("");
  const [golesL,     setGolesL]     = useState("");
  const [golesV,     setGolesV]     = useState("");
  const [saving,     setSaving]     = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState({ msg: "", type: "success" });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: cfgs }, { data: eqs }, { data: pred }, { data: preds }, { data: usrs }] = await Promise.all([
      supabase.from("final_config").select("*").limit(1),
      supabase.from("equipos_mundial").select("*").order("nombre"),  // todos, con eliminado
      supabase.from("predicciones_final").select("*").eq("usuario_id", user.id).maybeSingle(),
      supabase.from("predicciones_final").select("*"),
      supabase.from("usuarios").select("id, username, nombre").order("username"),
    ]);
    setConfig(cfgs?.[0] || null);
    setEquipos(eqs || []);
    setTodasPreds(preds || []);
    setUsuarios(usrs || []);
    if (pred) {
      setMiPred(pred);
      setLocalSel(pred.equipo_local);
      setVisitSel(pred.equipo_visitante);
      setGolesL(pred.goles_local);
      setGolesV(pred.goles_visitante);
    }
    setLoading(false);
  };

  const isClosed = config?.fecha_limite
    ? new Date() > new Date(config.fecha_limite)
    : false;

  const resultadoReal = config?.equipo_local_real && config?.goles_local_real != null;

  // ¿Acerté?
  const acerte = miPred && resultadoReal && (
    miPred.equipo_local     === config.equipo_local_real &&
    miPred.equipo_visitante === config.equipo_visitante_real &&
    Number(miPred.goles_local)     === Number(config.goles_local_real) &&
    Number(miPred.goles_visitante) === Number(config.goles_visitante_real)
  );

  const handleSave = async () => {
    if (!localSel || !visitSel || golesL === "" || golesV === "") {
      showToast("Completa todos los campos.", "error"); return;
    }
    if (localSel === visitSel) {
      showToast("Los dos equipos no pueden ser el mismo.", "error"); return;
    }
    setSaving(true);
    const payload = {
      usuario_id:       user.id,
      equipo_local:     localSel,
      equipo_visitante: visitSel,
      goles_local:      Number(golesL),
      goles_visitante:  Number(golesV),
      updated_at:       new Date().toISOString(),
    };
    const { error } = await supabase
      .from("predicciones_final")
      .upsert(payload, { onConflict: "usuario_id" });

    if (!error) { await load(); showToast("¡Predicción guardada! 🏆", "success"); }
    else showToast("Error al guardar.", "error");
    setSaving(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "success" }), 3000);
  };

  // Equipos activos para los selectores
  const equiposActivos = equipos.filter(e => !e.eliminado);
  const eqEliminadosSet = new Set(equipos.filter(e => e.eliminado).map(e => e.nombre));

  const localOpts = equiposActivos.filter(e => e.nombre !== visitSel);
  const visitOpts = equiposActivos.filter(e => e.nombre !== localSel);
  // Si el equipo seleccionado fue eliminado, lo mostramos igual para no confundir
  if (localSel && !equiposActivos.find(e => e.nombre === localSel))
    localOpts.unshift({ nombre: localSel, eliminado: true });
  if (visitSel && !equiposActivos.find(e => e.nombre === visitSel))
    visitOpts.unshift({ nombre: visitSel, eliminado: true });

  // Calcular estado de cada predicción
  const predConEstado = todasPreds.map(p => {
    const u = usuarios.find(u => u.id === p.usuario_id);
    const localElim = eqEliminadosSet.has(p.equipo_local);
    const visitElim = eqEliminadosSet.has(p.equipo_visitante);
    const enJuego   = !localElim && !visitElim;
    const esGanador = resultadoReal &&
      p.equipo_local     === config.equipo_local_real &&
      p.equipo_visitante === config.equipo_visitante_real &&
      Number(p.goles_local)     === Number(config.goles_local_real) &&
      Number(p.goles_visitante) === Number(config.goles_visitante_real);
    return { ...p, u, localElim, visitElim, enJuego, esGanador };
  }).sort((a, b) => {
    if (a.esGanador && !b.esGanador) return -1;
    if (!a.esGanador && b.esGanador) return 1;
    if (a.enJuego && !b.enJuego) return -1;
    if (!a.enJuego && b.enJuego) return 1;
    return 0;
  });

  return (
    <div className="user-tab-content">
      <div className="user-section-header">
        <h2 className="user-section-title">🏆 Gran Final</h2>
        <p className="user-section-sub">Predice el resultado exacto de la final del Mundial 2026</p>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : !config ? (
        <div className="empty-state">
          <span className="empty-icon">⏳</span>
          <p>Aún no disponible</p>
          <span>El admin habilitará la predicción de la final próximamente.</span>
        </div>
      ) : (
        <>
          {/* Fecha límite */}
          {config.fecha_limite && (
            <div className={`final-fecha-banner ${isClosed ? "closed" : "open"}`}>
              {isClosed
                ? `🔒 Predicciones cerradas el ${fmtFecha(config.fecha_limite)}`
                : `⏰ Cierra el ${fmtFecha(config.fecha_limite)}`}
            </div>
          )}

          {/* Resultado real — si ya se jugó */}
          {resultadoReal && (
            <div className={`final-resultado-real ${acerte ? "final-acerte" : "final-no-acerte"}`}>
              <div className="frr-title">
                {acerte ? "🎉 ¡Acertaste el resultado exacto!" : "📋 Resultado final"}
              </div>
              <div className="frr-score">
                <span className="frr-team">{config.equipo_local_real}</span>
                <span className="frr-marcador">{config.goles_local_real} – {config.goles_visitante_real}</span>
                <span className="frr-team">{config.equipo_visitante_real}</span>
              </div>
              {acerte && <div className="frr-badge">🏆 ¡Ganaste!</div>}
            </div>
          )}

          {/* Mi predicción guardada — resumen */}
          {miPred && (
            <div className="final-mi-pred">
              <div className="fmp-label">Tu predicción</div>
              <div className="fmp-score">
                <span className="fmp-team">{miPred.equipo_local}</span>
                <span className="fmp-marcador">{miPred.goles_local} – {miPred.goles_visitante}</span>
                <span className="fmp-team">{miPred.equipo_visitante}</span>
              </div>
              {!isClosed && <span className="fmp-edit-hint">Puedes modificarla abajo hasta el cierre</span>}
            </div>
          )}

          {/* Tabla de en juego — visible cuando ya cerró */}
          {isClosed && predConEstado.length > 0 && (
            <div className="final-standings">
              <div className="fst-header">
                <span className="fst-title">Tabla de participantes</span>
                <div className="fst-counts">
                  <span className="fst-count-vivo">
                    ✅ {predConEstado.filter(p => p.enJuego).length} en juego
                  </span>
                  <span className="fst-count-elim">
                    ❌ {predConEstado.filter(p => !p.enJuego).length} eliminados
                  </span>
                </div>
              </div>

              <div className="fst-list">
                {predConEstado.map(p => {
                  const esMio = p.usuario_id === user.id;
                  return (
                    <div key={p.usuario_id} className={`fst-row ${p.esGanador ? "fst-ganador" : p.enJuego ? "fst-vivo" : "fst-eliminado"} ${esMio ? "fst-mio" : ""}`}>
                      <div className="fst-avatar">
                        {(p.u?.nombre || p.u?.username || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="fst-info">
                        <span className="fst-nombre">
                          {p.u?.nombre || p.u?.username}
                          {esMio && <span className="fst-yo"> (tú)</span>}
                        </span>
                        <span className="fst-pred">
                          <span className={p.localElim ? "fst-team-elim" : ""}>{p.equipo_local}</span>
                          {" "}<strong>{p.goles_local}–{p.goles_visitante}</strong>{" "}
                          <span className={p.visitElim ? "fst-team-elim" : ""}>{p.equipo_visitante}</span>
                        </span>
                        {/* Razón de eliminación */}
                        {!p.enJuego && (
                          <span className="fst-razon">
                            ❌ {[p.localElim && p.equipo_local, p.visitElim && p.equipo_visitante].filter(Boolean).join(" y ")} eliminado{p.localElim && p.visitElim ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="fst-estado">
                        {p.esGanador ? "🏆" : p.enJuego ? "✅" : "❌"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Formulario — solo si no cerró */}
          {!isClosed && (
            <div className="final-form">
              <div className="final-form-title">
                {miPred ? "✏️ Modificar predicción" : "📝 Ingresar predicción"}
              </div>

              {/* Selector equipo local */}
              <div className="final-field-group">
                <label className="final-field-label">Equipo 1 (local)</label>
                <select
                  className="final-select"
                  value={localSel}
                  onChange={e => setLocalSel(e.target.value)}
                >
                  <option value="">— Selecciona un equipo —</option>
                  {localOpts.map(e => (
                    <option key={e.nombre} value={e.nombre}>
                      {e.nombre}{e.eliminado ? " ❌" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Marcador */}
              <div className="final-score-row">
                <div className="final-score-input-wrap">
                  <span className="final-score-team-label">{localSel || "Local"}</span>
                  <input
                    className="final-score-input"
                    type="number" min="0" inputMode="numeric"
                    value={golesL}
                    onChange={e => setGolesL(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0"
                  />
                </div>
                <span className="final-score-vs">–</span>
                <div className="final-score-input-wrap">
                  <span className="final-score-team-label">{visitSel || "Visitante"}</span>
                  <input
                    className="final-score-input"
                    type="number" min="0" inputMode="numeric"
                    value={golesV}
                    onChange={e => setGolesV(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Selector equipo visitante */}
              <div className="final-field-group">
                <label className="final-field-label">Equipo 2 (visitante)</label>
                <select
                  className="final-select"
                  value={visitSel}
                  onChange={e => setVisitSel(e.target.value)}
                >
                  <option value="">— Selecciona un equipo —</option>
                  {visitOpts.map(e => (
                    <option key={e.nombre} value={e.nombre}>
                      {e.nombre}{e.eliminado ? " ❌" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Preview */}
              {localSel && visitSel && golesL !== "" && golesV !== "" && (
                <div className="final-preview">
                  <span className="fp-label">Tu predicción:</span>
                  <span className="fp-text">
                    {localSel} <strong>{golesL}</strong> – <strong>{golesV}</strong> {visitSel}
                    {" · Campeón: "}<strong>{Number(golesL) >= Number(golesV) ? localSel : visitSel}</strong>
                  </span>
                </div>
              )}

              <button
                className="final-save-btn"
                onClick={handleSave}
                disabled={saving || !localSel || !visitSel || golesL === "" || golesV === ""}
              >
                {saving ? "Guardando..." : miPred ? "✓ Actualizar predicción" : "Guardar predicción →"}
              </button>
            </div>
          )}

          {/* Cerrado sin predicción */}
          {isClosed && !miPred && (
            <div className="empty-state" style={{ marginTop: 20 }}>
              <span className="empty-icon">😔</span>
              <p>No ingresaste predicción</p>
              <span>El plazo para predecir ya cerró.</span>
            </div>
          )}
        </>
      )}

      {toast.msg && (
        <div className={`toast ${toast.type === "error" ? "toast-error" : ""}`}>{toast.msg}</div>
      )}
    </div>
  );
}