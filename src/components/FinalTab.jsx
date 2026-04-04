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
  const [config,    setConfig]    = useState(null);  // final_config row
  const [equipos,   setEquipos]   = useState([]);    // equipos no eliminados
  const [miPred,    setMiPred]    = useState(null);  // predicción guardada
  const [localSel,  setLocalSel]  = useState("");
  const [visitSel,  setVisitSel]  = useState("");
  const [golesL,    setGolesL]    = useState("");
  const [golesV,    setGolesV]    = useState("");
  const [saving,    setSaving]    = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState({ msg: "", type: "success" });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: cfgs }, { data: eqs }, { data: pred }] = await Promise.all([
      supabase.from("final_config").select("*").limit(1),
      supabase.from("equipos_mundial").select("*").eq("eliminado", false).order("nombre"),
      supabase.from("predicciones_final").select("*").eq("usuario_id", user.id).single(),
    ]);
    setConfig(cfgs?.[0] || null);
    setEquipos(eqs || []);
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

  const equiposParaVisitante = equipos.filter(e => e.nombre !== localSel);
  const equiposParaLocal     = equipos.filter(e => e.nombre !== visitSel);

  // Si el equipo seleccionado fue eliminado, lo incluimos igual para que se vea
  const localOpts = localSel && !equipos.find(e => e.nombre === localSel)
    ? [{ nombre: localSel, eliminado: true }, ...equiposParaLocal]
    : equiposParaLocal;
  const visitOpts = visitSel && !equipos.find(e => e.nombre === visitSel)
    ? [{ nombre: visitSel, eliminado: true }, ...equiposParaVisitante]
    : equiposParaVisitante;

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