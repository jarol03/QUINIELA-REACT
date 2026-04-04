import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import DateTimePicker, { formatDisplay } from "./DateTimePicker";

function fmtFecha(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-HN", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export default function AdminFinalTab() {
  const [config,       setConfig]       = useState(null);
  const [equipos,      setEquipos]      = useState([]);
  const [predicciones, setPredicciones] = useState([]);
  const [usuarios,     setUsuarios]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [toast,        setToast]        = useState("");

  // Config form
  const [fechaLimite, setFechaLimite]   = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Resultado real form
  const [resLocal,   setResLocal]   = useState("");
  const [resVisit,   setResVisit]   = useState("");
  const [resGolesL,  setResGolesL]  = useState("");
  const [resGolesV,  setResGolesV]  = useState("");
  const [savingRes,  setSavingRes]  = useState(false);

  // Nuevo equipo
  const [nuevoEquipo, setNuevoEquipo] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: cfgs }, { data: eqs }, { data: preds }, { data: usrs }] = await Promise.all([
      supabase.from("final_config").select("*").limit(1),
      supabase.from("equipos_mundial").select("*").order("nombre"),
      supabase.from("predicciones_final").select("*"),
      supabase.from("usuarios").select("id, username, nombre"),
    ]);
    const cfg = cfgs?.[0] || null;
    setConfig(cfg);
    setEquipos(eqs || []);
    setPredicciones(preds || []);
    setUsuarios(usrs || []);
    if (cfg) {
      setFechaLimite(cfg.fecha_limite || "");
      setResLocal(cfg.equipo_local_real || "");
      setResVisit(cfg.equipo_visitante_real || "");
      setResGolesL(cfg.goles_local_real ?? "");
      setResGolesV(cfg.goles_visitante_real ?? "");
    }
    setLoading(false);
  };

  // Guardar / actualizar config
  const saveConfig = async () => {
    setSavingConfig(true);
    if (config) {
      await supabase.from("final_config").update({ fecha_limite: fechaLimite || null }).eq("id", config.id);
    } else {
      await supabase.from("final_config").insert({ fecha_limite: fechaLimite || null });
    }
    await load();
    showToast("Configuración guardada ✓");
    setSavingConfig(false);
  };

  // Guardar resultado real
  const saveResultado = async () => {
    if (!resLocal || !resVisit || resGolesL === "" || resGolesV === "") {
      showToast("Completa todos los campos del resultado."); return;
    }
    setSavingRes(true);
    const payload = {
      equipo_local_real:      resLocal,
      equipo_visitante_real:  resVisit,
      goles_local_real:       Number(resGolesL),
      goles_visitante_real:   Number(resGolesV),
    };
    if (config) {
      await supabase.from("final_config").update(payload).eq("id", config.id);
    } else {
      await supabase.from("final_config").insert(payload);
    }
    await load();
    showToast("Resultado de la final guardado ✓");
    setSavingRes(false);
  };

  const clearResultado = async () => {
    if (!confirm("¿Quitar el resultado de la final?")) return;
    await supabase.from("final_config").update({
      equipo_local_real: null, equipo_visitante_real: null,
      goles_local_real: null, goles_visitante_real: null,
    }).eq("id", config.id);
    await load();
    showToast("Resultado eliminado");
  };

  // Eliminar / restaurar equipo
  const toggleEliminado = async (eq) => {
    await supabase.from("equipos_mundial").update({ eliminado: !eq.eliminado }).eq("id", eq.id);
    setEquipos(prev => prev.map(e => e.id === eq.id ? { ...e, eliminado: !e.eliminado } : e));
  };

  const agregarEquipo = async () => {
    const nombre = nuevoEquipo.trim();
    if (!nombre) return;
    const { error } = await supabase.from("equipos_mundial").insert({ nombre, orden: equipos.length + 1 });
    if (!error) { setNuevoEquipo(""); await load(); showToast("Equipo agregado ✓"); }
    else showToast("Error: ese equipo ya existe.");
  };

  const eliminarEquipo = async (id) => {
    await supabase.from("equipos_mundial").delete().eq("id", id);
    setEquipos(prev => prev.filter(e => e.id !== id));
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const activos   = equipos.filter(e => !e.eliminado);
  const eliminados = equipos.filter(e => e.eliminado);
  const resultadoReal = config?.equipo_local_real && config?.goles_local_real != null;

  // Calcular ganadores
  const ganadores = predicciones.filter(p =>
    resultadoReal &&
    p.equipo_local     === config.equipo_local_real &&
    p.equipo_visitante === config.equipo_visitante_real &&
    Number(p.goles_local)     === Number(config.goles_local_real) &&
    Number(p.goles_visitante) === Number(config.goles_visitante_real)
  );

  return (
    <div className="puntos-tab">
      {toast && <div className="toast">{toast}</div>}

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : (
        <div className="af-layout">

          {/* ── COL IZQ ── */}
          <div className="af-col">

            {/* Config fecha límite */}
            <div className="admin-card">
              <span className="col-label">Fecha límite de predicciones</span>
              <div className="create-stack">
                <DateTimePicker value={fechaLimite} onChange={setFechaLimite} placeholder="Sin fecha límite" />
                <button className="admin-btn-primary w-full" onClick={saveConfig} disabled={savingConfig}>
                  {savingConfig ? "Guardando..." : config ? "Actualizar fecha" : "Activar predicción final"}
                </button>
              </div>
              {config?.fecha_limite && (
                <p className="dim-text" style={{ marginTop: 8 }}>
                  Cierre: {fmtFecha(config.fecha_limite)}
                </p>
              )}
            </div>

            {/* Resultado real de la final */}
            <div className="admin-card">
              <span className="col-label">Resultado real de la final</span>
              {resultadoReal ? (
                <div>
                  <div className="af-resultado-display">
                    <span className="af-res-team">{config.equipo_local_real}</span>
                    <span className="af-res-score">{config.goles_local_real} – {config.goles_visitante_real}</span>
                    <span className="af-res-team">{config.equipo_visitante_real}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button className="res-save-btn" onClick={() => { setSavingRes(false); setResLocal(config.equipo_local_real); }}>
                      ✏️ Editar
                    </button>
                    <button className="res-clear-btn" onClick={clearResultado}>🗑 Quitar</button>
                  </div>
                </div>
              ) : (
                <div className="create-stack">
                  <div className="af-result-form">
                    <div className="final-field-group">
                      <label className="dt-label">Equipo local (campeón o sub)</label>
                      <select className="admin-input" value={resLocal} onChange={e => setResLocal(e.target.value)}>
                        <option value="">— Equipo local —</option>
                        {equipos.map(e => <option key={e.nombre} value={e.nombre}>{e.nombre}</option>)}
                      </select>
                    </div>
                    <div className="af-goles-row">
                      <input className="res-input" type="number" min="0" value={resGolesL}
                        onChange={e => setResGolesL(e.target.value)} placeholder="0" />
                      <span className="res-dash">–</span>
                      <input className="res-input" type="number" min="0" value={resGolesV}
                        onChange={e => setResGolesV(e.target.value)} placeholder="0" />
                    </div>
                    <div className="final-field-group">
                      <label className="dt-label">Equipo visitante</label>
                      <select className="admin-input" value={resVisit} onChange={e => setResVisit(e.target.value)}>
                        <option value="">— Equipo visitante —</option>
                        {equipos.map(e => <option key={e.nombre} value={e.nombre}>{e.nombre}</option>)}
                      </select>
                    </div>
                    <button className="admin-btn-primary w-full" onClick={saveResultado} disabled={savingRes}>
                      {savingRes ? "Guardando..." : "Guardar resultado final"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Equipos eliminados */}
            <div className="admin-card">
              <span className="col-label">Equipos del mundial ({equipos.length})</span>
              <p className="dim-text" style={{ marginBottom: 10 }}>
                Marca los eliminados — dejarán de aparecer en las opciones de predicción.
              </p>

              {/* Agregar equipo */}
              <div className="af-add-equipo">
                <input className="admin-input" placeholder="Agregar equipo..." value={nuevoEquipo}
                  onChange={e => setNuevoEquipo(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && agregarEquipo()} />
                <button className="admin-btn-primary" onClick={agregarEquipo} disabled={!nuevoEquipo.trim()}>+</button>
              </div>

              {/* Activos */}
              {activos.length > 0 && (
                <>
                  <p className="af-equipo-section-label">▶ Activos ({activos.length})</p>
                  <div className="af-equipos-list">
                    {activos.map(e => (
                      <div key={e.id} className="af-equipo-row active">
                        <span className="af-equipo-nombre">{e.nombre}</span>
                        <div className="af-equipo-actions">
                          <button className="af-elim-btn" onClick={() => toggleEliminado(e)}>❌ Eliminar</button>
                          <button className="icon-btn danger" onClick={() => eliminarEquipo(e.id)}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Eliminados */}
              {eliminados.length > 0 && (
                <>
                  <p className="af-equipo-section-label" style={{ color: "var(--danger)" }}>❌ Eliminados ({eliminados.length})</p>
                  <div className="af-equipos-list">
                    {eliminados.map(e => (
                      <div key={e.id} className="af-equipo-row eliminated">
                        <span className="af-equipo-nombre">{e.nombre}</span>
                        <div className="af-equipo-actions">
                          <button className="af-restore-btn" onClick={() => toggleEliminado(e)}>↩ Restaurar</button>
                          <button className="icon-btn danger" onClick={() => eliminarEquipo(e.id)}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── COL DER: Predicciones de usuarios ── */}
          <div className="af-col">
            <div className="admin-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <span className="col-label" style={{ marginBottom: 0 }}>
                  Predicciones ({predicciones.length}/{usuarios.length})
                </span>
                {resultadoReal && ganadores.length > 0 && (
                  <span className="af-ganadores-badge">🏆 {ganadores.length} ganador{ganadores.length !== 1 ? "es" : ""}</span>
                )}
              </div>

              {predicciones.length === 0 ? (
                <p className="dim-text">Nadie ha ingresado su predicción aún.</p>
              ) : (
                <div className="af-preds-list">
                  {usuarios.map(u => {
                    const pred = predicciones.find(p => p.usuario_id === u.id);
                    const esGanador = ganadores.some(g => g.usuario_id === u.id);
                    return (
                      <div key={u.id} className={`af-pred-row ${esGanador ? "af-pred-ganador" : ""} ${!pred ? "af-pred-missing" : ""}`}>
                        <div className="af-pred-avatar">
                          {(u.nombre || u.username).charAt(0).toUpperCase()}
                        </div>
                        <div className="af-pred-info">
                          <span className="af-pred-nombre">{u.nombre || u.username}</span>
                          {pred ? (
                            <span className="af-pred-score">
                              {pred.equipo_local} <strong>{pred.goles_local}–{pred.goles_visitante}</strong> {pred.equipo_visitante}
                            </span>
                          ) : (
                            <span className="af-pred-sin">Sin predicción</span>
                          )}
                        </div>
                        {esGanador && <span className="af-pred-trophy">🏆</span>}
                        {!pred && <span className="af-pred-missing-dot">·</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}