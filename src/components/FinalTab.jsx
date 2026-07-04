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
  const [equipos,    setEquipos]    = useState([]);
  const [miPred,     setMiPred]     = useState(null);
  const [todasPreds, setTodasPreds] = useState([]);
  const [usuarios,   setUsuarios]   = useState([]);
  const [localSel,   setLocalSel]   = useState("");
  const [visitSel,   setVisitSel]   = useState("");
  const [golesL,     setGolesL]     = useState("");
  const [golesV,     setGolesV]     = useState("");
  const [campeon,    setCampeon]    = useState("");
  const [saving,     setSaving]     = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState({ msg: "", type: "success" });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (campeon && campeon !== localSel && campeon !== visitSel) {
      setCampeon("");
    }
  }, [localSel, visitSel]);

  const load = async () => {
    setLoading(true);
    const [{ data: cfgs }, { data: eqs }, { data: pred }, { data: preds }, { data: usrs }] = await Promise.all([
      supabase.from("final_config").select("*").limit(1),
      supabase.from("equipos_mundial").select("*").order("nombre"),
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
      setCampeon(pred.campeon || "");
    }
    setLoading(false);
  };

  const isClosed = config?.fecha_limite
    ? new Date() > new Date(config.fecha_limite)
    : false;

  const resultadoReal = config?.equipo_local_real && config?.goles_local_real != null;

  const acerte = miPred && resultadoReal && (
    miPred.equipo_local     === config.equipo_local_real &&
    miPred.equipo_visitante === config.equipo_visitante_real &&
    Number(miPred.goles_local)     === Number(config.goles_local_real) &&
    Number(miPred.goles_visitante) === Number(config.goles_visitante_real) &&
    (Number(miPred.goles_local) === Number(miPred.goles_visitante) ? miPred.campeon === config.campeon_real : true)
  );

  const handleSave = async () => {
    if (!localSel || !visitSel || golesL === "" || golesV === "") {
      showToast("Completa todos los campos.", "error"); return;
    }
    if (localSel === visitSel) {
      showToast("Los dos equipos no pueden ser el mismo.", "error"); return;
    }

    let finalCampeon = "";
    if (Number(golesL) === Number(golesV)) {
      if (!campeon || (campeon !== localSel && campeon !== visitSel)) {
        showToast("Selecciona el campeón de la final (desempate).", "error"); return;
      }
      finalCampeon = campeon;
    } else {
      finalCampeon = Number(golesL) > Number(golesV) ? localSel : visitSel;
    }

    if (!finalCampeon) {
      showToast("Error: no se pudo determinar el campeón.", "error"); return;
    }

    setSaving(true);
    const payload = {
      usuario_id:       user.id,
      equipo_local:     localSel,
      equipo_visitante: visitSel,
      goles_local:      Number(golesL),
      goles_visitante:  Number(golesV),
      campeon:          finalCampeon,
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

  const equiposLlave1 = equipos.filter(e => e.llave === 1 || e.llave == null);
  const equiposLlave2 = equipos.filter(e => e.llave === 2);
  const eqEliminadosSet = new Set(equipos.filter(e => e.eliminado).map(e => e.nombre));

  const handleSelectLlave1 = (nombre) => {
    if (isClosed || eqEliminadosSet.has(nombre)) return;
    if (nombre === localSel) { setLocalSel(""); return; }
    if (nombre === visitSel) setVisitSel("");
    setLocalSel(nombre);
  };

  const handleSelectLlave2 = (nombre) => {
    if (isClosed || eqEliminadosSet.has(nombre)) return;
    if (nombre === visitSel) { setVisitSel(""); return; }
    if (nombre === localSel) setLocalSel("");
    setVisitSel(nombre);
  };

  const predConEstado = todasPreds.map(p => {
    const u = usuarios.find(u => u.id === p.usuario_id);
    const localElim = eqEliminadosSet.has(p.equipo_local);
    const visitElim = eqEliminadosSet.has(p.equipo_visitante);
    const enJuego   = !localElim && !visitElim;
    const esGanador = resultadoReal &&
      p.equipo_local     === config.equipo_local_real &&
      p.equipo_visitante === config.equipo_visitante_real &&
      Number(p.goles_local)     === Number(config.goles_local_real) &&
      Number(p.goles_visitante) === Number(config.goles_visitante_real) &&
      (Number(p.goles_local) === Number(p.goles_visitante) ? p.campeon === config.campeon_real : true);
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
        <p className="user-section-sub">
          Elige el campeón de cada llave y predice el resultado exacto
        </p>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : !config ? (
        <div className="empty-state">
          <span className="empty-icon">⏳</span>
          <p>Aún no disponible</p>
          <span>El admin habilitará la predicción próximamente.</span>
        </div>
      ) : (
        <>
          {config.fecha_limite && (
            <div className={`final-fecha-banner ${isClosed ? "closed" : "open"}`}>
              {isClosed
                ? `🔒 Predicciones cerradas el ${fmtFecha(config.fecha_limite)}`
                : `⏰ Cierra el ${fmtFecha(config.fecha_limite)}`}
            </div>
          )}

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

          {miPred && (
            <div className="final-mi-pred">
              <div className="fmp-label">Tu predicción</div>
              <div className="fmp-score">
                <span className="fmp-team fmp-team-llave1">{miPred.equipo_local}</span>
                <span className="fmp-marcador">{miPred.goles_local} – {miPred.goles_visitante}</span>
                <span className="fmp-team fmp-team-llave2">{miPred.equipo_visitante}</span>
              </div>
              {!isClosed && <span className="fmp-edit-hint">Puedes modificarla abajo hasta el cierre</span>}
            </div>
          )}

          {/* ─── BRACKET: DOS LLAVES ─── */}
          {!isClosed && (
            <div className="bk-container">
              <div className="bk-columns">
                {/* Llave 1 */}
                <div className="bk-card bk-card-llave1">
                  <div className="bk-card-header">
                    <span className="bk-card-icon">❶</span>
                    <span className="bk-card-title">Llave 1</span>
                    <span className="bk-card-rounds">Octavos → Final</span>
                  </div>
                  <div className="bk-teams">
                    {equiposLlave1.map((eq, i) => {
                      const sel = eq.nombre === localSel;
                      const elim = eq.eliminado;
                      return (
                        <button
                          key={eq.nombre}
                          className={`bk-team-btn ${sel ? "bk-team-selected-l1" : ""} ${elim ? "bk-team-elim" : ""}`}
                          onClick={() => handleSelectLlave1(eq.nombre)}
                          disabled={elim || isClosed}
                          style={{ animationDelay: `${i * 0.05}s` }}
                        >
                          <span className="bk-team-marker" />
                          <span className="bk-team-name">{eq.nombre}</span>
                          {elim && <span className="bk-team-strike" />}
                          {sel && <span className="bk-team-badge">✓</span>}
                        </button>
                      );
                    })}
                    {equiposLlave1.length === 0 && (
                      <span className="bk-empty-msg">Sin equipos asignados</span>
                    )}
                  </div>
                  {localSel && (
                    <div className="bk-card-footer">
                      <span className="bk-footer-label">Tu elegido</span>
                      <span className="bk-footer-team">{localSel}</span>
                    </div>
                  )}
                </div>

                {/* Llave 2 */}
                <div className="bk-card bk-card-llave2">
                  <div className="bk-card-header">
                    <span className="bk-card-icon">❷</span>
                    <span className="bk-card-title">Llave 2</span>
                    <span className="bk-card-rounds">Octavos → Final</span>
                  </div>
                  <div className="bk-teams">
                    {equiposLlave2.map((eq, i) => {
                      const sel = eq.nombre === visitSel;
                      const elim = eq.eliminado;
                      return (
                        <button
                          key={eq.nombre}
                          className={`bk-team-btn ${sel ? "bk-team-selected-l2" : ""} ${elim ? "bk-team-elim" : ""}`}
                          onClick={() => handleSelectLlave2(eq.nombre)}
                          disabled={elim || isClosed}
                          style={{ animationDelay: `${i * 0.05}s` }}
                        >
                          <span className="bk-team-marker" />
                          <span className="bk-team-name">{eq.nombre}</span>
                          {elim && <span className="bk-team-strike" />}
                          {sel && <span className="bk-team-badge">✓</span>}
                        </button>
                      );
                    })}
                    {equiposLlave2.length === 0 && (
                      <span className="bk-empty-msg">Sin equipos asignados</span>
                    )}
                  </div>
                  {visitSel && (
                    <div className="bk-card-footer">
                      <span className="bk-footer-label">Tu elegido</span>
                      <span className="bk-footer-team">{visitSel}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── FINAL SCORE ─── */}
              <div className="bk-final-section">
                <div className="bk-final-path">
                  <div className="bk-path-line" />
                </div>
                <div className="bk-final-card">
                  <div className="bk-final-label">GRAN FINAL</div>
                  <div className="bk-final-match">
                    <div className={`bk-final-team ${localSel ? "bk-final-active" : ""}`}>
                      <span className="bk-ft-name">{localSel || "Llave 1"}</span>
                      <span className="bk-ft-llave">L1</span>
                    </div>
                    <div className="bk-final-score">
                      <span className="bk-score-vs">VS</span>
                      <div className="bk-score-inputs">
                        <input
                          className="bk-score-input"
                          type="number" min="0" inputMode="numeric"
                          value={golesL}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === "") { setGolesL(""); return; }
                            const n = parseInt(v, 10);
                            if (!isNaN(n)) setGolesL(Math.max(0, n));
                          }}
                          placeholder="0"
                        />
                        <span className="bk-score-dash">–</span>
                        <input
                          className="bk-score-input"
                          type="number" min="0" inputMode="numeric"
                          value={golesV}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === "") { setGolesV(""); return; }
                            const n = parseInt(v, 10);
                            if (!isNaN(n)) setGolesV(Math.max(0, n));
                          }}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className={`bk-final-team bk-final-team-r ${visitSel ? "bk-final-active" : ""}`}>
                      <span className="bk-ft-name">{visitSel || "Llave 2"}</span>
                      <span className="bk-ft-llave">L2</span>
                    </div>
                  </div>

                  {localSel && visitSel && golesL !== "" && golesV !== "" && (
                    <div className="bk-final-preview">
                      {Number(golesL) === Number(golesV) ? (
                        <div className="bk-tie-breaker">
                          <p style={{ margin: "0 0 10px 0", fontSize: "0.9rem", color: "var(--text-color)" }}>🏆 Resultado en empate. ¿Quién ganará el campeonato?</p>
                          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                            <button
                              className={`admin-btn-secondary ${campeon === localSel ? "active" : ""}`}
                              onClick={() => !isClosed && setCampeon(localSel)}
                              disabled={isClosed}
                              style={{ borderColor: campeon === localSel ? "var(--primary)" : "", background: campeon === localSel ? "rgba(43,212,125,0.1)" : "" }}
                            >{localSel}</button>
                            <button
                              className={`admin-btn-secondary ${campeon === visitSel ? "active" : ""}`}
                              onClick={() => !isClosed && setCampeon(visitSel)}
                              disabled={isClosed}
                              style={{ borderColor: campeon === visitSel ? "var(--primary)" : "", background: campeon === visitSel ? "rgba(43,212,125,0.1)" : "" }}
                            >{visitSel}</button>
                          </div>
                        </div>
                      ) : (
                        <span className="bk-fp-campeon">
                          🏆 Campeón: {" "}
                          <strong>
                            {Number(golesL) > Number(golesV) ? localSel : visitSel}
                          </strong>
                        </span>
                      )}
                    </div>
                  )}

                  <button
                    className="bk-save-btn"
                    onClick={handleSave}
                    disabled={saving || !localSel || !visitSel || golesL === "" || golesV === "" || (Number(golesL) === Number(golesV) && (!campeon || (campeon !== localSel && campeon !== visitSel)))}
                  >
                    {saving ? (
                      <span className="bk-save-loading">Guardando…</span>
                    ) : miPred ? (
                      <span>✓ Actualizar predicción</span>
                    ) : (
                      <span>Guardar predicción →</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

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
