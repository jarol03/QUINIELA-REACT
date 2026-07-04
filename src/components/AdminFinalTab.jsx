import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import DateTimePicker, { formatDisplay } from "./DateTimePicker";
import PDFExportModal from "./PDFExportModal";

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
  const [nuevoEquipoLlave, setNuevoEquipoLlave] = useState(1);
  const [editandoLlave, setEditandoLlave] = useState(null); // {id, llave}

  // PDF
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfData, setPdfData] = useState([]);
  const [pdfStats, setPdfStats] = useState(null);

  // Buscador predicciones
  const [searchPred, setSearchPred] = useState("");

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
    const { error } = await supabase.from("equipos_mundial").insert({
      nombre, orden: equipos.length + 1, llave: nuevoEquipoLlave,
    });
    if (!error) { setNuevoEquipo(""); setNuevoEquipoLlave(1); await load(); showToast("Equipo agregado ✓"); }
    else showToast("Error: ese equipo ya existe.");
  };

  const cambiarLlave = async (id, llave) => {
    await supabase.from("equipos_mundial").update({ llave }).eq("id", id);
    setEditandoLlave(null);
    setEquipos(prev => prev.map(e => e.id === id ? { ...e, llave } : e));
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

  const generarDataPdf = () => {
    const eliminadosSet = new Set(eliminados.map(e => e.nombre));
    
    let vivos = [];
    let muertosCount = 0;
    
    predicciones.forEach(p => {
      const u = usuarios.find(u => u.id === p.usuario_id);
      if (!u) return;
      
      const localElim = eliminadosSet.has(p.equipo_local);
      const visitElim = eliminadosSet.has(p.equipo_visitante);
      
      if (!localElim && !visitElim) {
        vivos.push({ ...p, nombre: u.nombre, username: u.username });
      } else {
        muertosCount++;
      }
    });

    const countByPred = {};
    vivos.forEach(p => {
      let campeon = p.equipo_local;
      let subcampeon = p.equipo_visitante;
      let golesC = Number(p.goles_local);
      let golesS = Number(p.goles_visitante);
      if (Number(p.goles_visitante) > Number(p.goles_local)) {
        campeon = p.equipo_visitante;
        subcampeon = p.equipo_local;
        golesC = Number(p.goles_visitante);
        golesS = Number(p.goles_local);
      }
      
      const key = `${p.equipo_local}-${p.goles_local}-${p.equipo_visitante}-${p.goles_visitante}`;
      if (!countByPred[key]) countByPred[key] = 0;
      countByPred[key]++;
      
      p.campeon = campeon;
      p.subcampeon = subcampeon;
      p.goles_campeon = golesC;
      p.goles_subcampeon = golesS;
      p.predKey = key;
    });

    vivos.forEach(p => {
      p.premio = 1000 / countByPred[p.predKey];
    });

    vivos.sort((a, b) => {
      if (a.campeon !== b.campeon) return a.campeon.localeCompare(b.campeon);
      if (a.goles_campeon !== b.goles_campeon) return b.goles_campeon - a.goles_campeon;
      if (a.goles_subcampeon !== b.goles_subcampeon) return b.goles_subcampeon - a.goles_subcampeon;
      const nA = (a.nombre || a.username || "").toLowerCase();
      const nB = (b.nombre || b.username || "").toLowerCase();
      return nA.localeCompare(nB);
    });

    const total = vivos.length + muertosCount;
    const pctVivos = total > 0 ? Math.round((vivos.length / total) * 100) : 0;
    const pctMuertos = total > 0 ? 100 - pctVivos : 0;

    const champCounts = {};
    vivos.forEach(p => {
      champCounts[p.campeon] = (champCounts[p.campeon] || 0) + 1;
    });
    
    const champStats = Object.keys(champCounts).map(c => ({
      label: c,
      count: champCounts[c],
      pct: vivos.length > 0 ? Math.round((champCounts[c] / vivos.length) * 100) : 0
    })).sort((a, b) => b.count - a.count).slice(0, 5);
    
    const colors = [
      [251, 191, 36], // yellow
      [0, 210, 140],  // green
      [56, 189, 248], // cyan
      [167, 139, 250], // purple
      [248, 113, 113], // red
    ];
    champStats.forEach((st, i) => st.color = colors[i % colors.length]);

    setPdfStats({ pctVivos, pctMuertos, barData: champStats });
    setPdfData(vivos);
    setShowPdfModal(true);
  };

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
                        <option value="" style={{ backgroundColor: "#1e293b", color: "#fff" }}>— Equipo local —</option>
                        {equipos.map(e => <option key={e.nombre} value={e.nombre} style={{ backgroundColor: "#1e293b", color: "#fff" }}>{e.nombre}</option>)}
                      </select>
                    </div>
                    <div className="af-goles-row">
                      <div className="ri-team">
                        <span className="ri-team-name">{resLocal || "Local"}</span>
                        <input className="res-input" type="number" min="0" value={resGolesL}
                          onChange={e => setResGolesL(e.target.value)} placeholder="0" />
                      </div>
                      <span className="res-dash">–</span>
                      <div className="ri-team">
                        <span className="ri-team-name">{resVisit || "Visitante"}</span>
                        <input className="res-input" type="number" min="0" value={resGolesV}
                          onChange={e => setResGolesV(e.target.value)} placeholder="0" />
                      </div>
                    </div>
                    <div className="final-field-group">
                      <label className="dt-label">Equipo visitante</label>
                      <select className="admin-input" value={resVisit} onChange={e => setResVisit(e.target.value)}>
                        <option value="" style={{ backgroundColor: "#1e293b", color: "#fff" }}>— Equipo visitante —</option>
                        {equipos.map(e => <option key={e.nombre} value={e.nombre} style={{ backgroundColor: "#1e293b", color: "#fff" }}>{e.nombre}</option>)}
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
              <div className="af-add-equipo-stack">
                <div className="af-add-equipo">
                  <input className="admin-input" placeholder="Agregar equipo..." value={nuevoEquipo}
                    onChange={e => setNuevoEquipo(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && agregarEquipo()} />
                  <button className="admin-btn-primary" onClick={agregarEquipo} disabled={!nuevoEquipo.trim()}>+</button>
                </div>
                <div className="af-llave-picker">
                  <span className="af-llave-label">Llave:</span>
                  <button
                    className={`af-llave-btn ${nuevoEquipoLlave === 1 ? "active" : ""}`}
                    onClick={() => setNuevoEquipoLlave(1)}
                  >1</button>
                  <button
                    className={`af-llave-btn ${nuevoEquipoLlave === 2 ? "active" : ""}`}
                    onClick={() => setNuevoEquipoLlave(2)}
                  >2</button>
                </div>
              </div>

              {/* Activos */}
              {activos.length > 0 && (
                <>
                  <p className="af-equipo-section-label">▶ Activos ({activos.length})</p>
                  <div className="af-equipos-list">
                    {activos.map(e => (
                      <div key={e.id} className="af-equipo-row active">
                        <span className={`af-llave-badge af-llave-badge-${e.llave || 1}`}>
                          L{e.llave || 1}
                        </span>
                        <span className="af-equipo-nombre">{e.nombre}</span>
                        <div className="af-equipo-actions">
                          {editandoLlave?.id === e.id ? (
                            <div className="af-llave-edit-inline">
                              <button className="af-llave-btn-sm" onClick={() => cambiarLlave(e.id, 1)}>L1</button>
                              <button className="af-llave-btn-sm" onClick={() => cambiarLlave(e.id, 2)}>L2</button>
                              <button className="af-llave-cancel" onClick={() => setEditandoLlave(null)}>✕</button>
                            </div>
                          ) : (
                            <button className="af-llave-switch" onClick={() => setEditandoLlave({ id: e.id, llave: e.llave })}>
                              ↺
                            </button>
                          )}
                          <button className="af-elim-btn" onClick={() => toggleEliminado(e)}>❌</button>
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
                        <span className={`af-llave-badge af-llave-badge-${e.llave || 1}`}>
                          L{e.llave || 1}
                        </span>
                        <span className="af-equipo-nombre">{e.nombre}</span>
                        <div className="af-equipo-actions">
                          <button className="af-restore-btn" onClick={() => toggleEliminado(e)}>↩</button>
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
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {resultadoReal && ganadores.length > 0 && (
                    <span className="af-ganadores-badge">🏆 {ganadores.length} ganador{ganadores.length !== 1 ? "es" : ""}</span>
                  )}
                  <button className="admin-btn-secondary" onClick={generarDataPdf} disabled={predicciones.length === 0}>
                    📄 Descargar PDF
                  </button>
                </div>
              </div>

              {predicciones.length === 0 ? (
                <p className="dim-text">Nadie ha ingresado su predicción aún.</p>
              ) : (
                <>
                  <input
                    className="admin-input"
                    placeholder="🔍 Buscar participante..."
                    value={searchPred}
                    onChange={(e) => setSearchPred(e.target.value)}
                    style={{ marginBottom: 12 }}
                  />
                  <div className="af-preds-list">
                    {usuarios
                      .filter(u => 
                        (u.nombre || "").toLowerCase().includes(searchPred.toLowerCase()) ||
                        (u.username || "").toLowerCase().includes(searchPred.toLowerCase())
                      )
                      .map(u => {
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
                </>
              )}
            </div>
          </div>

        </div>
      )}

      {showPdfModal && (
        <PDFExportModal
          open={showPdfModal}
          onClose={() => setShowPdfModal(false)}
          title="PRONÓSTICO SELECCIÓN CAMPEONA"
          type="final"
          data={pdfData}
          extraHeader={{ barData: pdfStats?.barData, stats: pdfStats }}
        />
      )}
    </div>
  );
}