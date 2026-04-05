import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import PDFExportModal from "./PDFExportModal";

function calcPuntos(pron, partido) {
  if (!partido || pron?.goles_local === null || pron?.goles_local === undefined) return null;
  if (partido.goles_local_real === null || partido.goles_local_real === undefined) return null;
  const gl = Number(pron.goles_local),  gv = Number(pron.goles_visitante);
  const rl = Number(partido.goles_local_real), rv = Number(partido.goles_visitante_real);
  if (gl === rl && gv === rv) return 3;
  const resPron = gl > gv ? "L" : gl < gv ? "V" : "E";
  const resReal = rl > rv ? "L" : rl < rv ? "V" : "E";
  return resPron === resReal ? 1 : 0;
}

function addPos(arr) {
  // Empate = mismos puntos (sin importar exactos ni resultados)
  // Posiciones sin salto: 1, 1, 2, 3
  const result = [];
  let posActual = 1;

  for (let i = 0; i < arr.length; i++) {
    if (i === 0) {
      result.push({ ...arr[i], posReal: 1 });
    } else {
      const esEmpate = arr[i].pts === arr[i - 1].pts;
      if (!esEmpate) posActual = result[i - 1].posReal + 1;
      result.push({ ...arr[i], posReal: posActual });
    }
  }
  return result;
}

export default function PuntosTab() {
  const [jornadas,    setJornadas]    = useState([]);
  const [selectedJ,   setSelectedJ]   = useState(null);
  const [usuarios,    setUsuarios]    = useState([]);
  const [partidos,    setPartidos]    = useState([]);
  const [allProns,    setAllProns]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(null);
  const [toast,       setToast]       = useState("");
  const [editRes,     setEditRes]     = useState({});
  const [editingIds,  setEditingIds]  = useState(new Set());
  const [pdfOpen,     setPdfOpen]     = useState(false);
  const [innerTab,    setInnerTab]    = useState("jornada");
  // Global ranking state
  const [globalData,  setGlobalData]  = useState([]);  // [{usuario, pts, exactos, resultados, porJornada:{id:pts}}]
  const [allJornadas, setAllJornadas] = useState([]);   // jornadas con resultados
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [globalPdfOpen, setGlobalPdfOpen] = useState(false);
  const tableRef = useRef(null);

  useEffect(() => { fetchJornadas(); }, []);

  const fetchJornadas = async () => {
    const { data } = await supabase.from("jornadas").select("*").order("created_at", { ascending: false });
    setJornadas(data || []);
  };

  const loadJornada = async (j) => {
    setLoading(true); setSelectedJ(j); setEditRes({}); setEditingIds(new Set());
    const [{ data: pts }, { data: prons }, { data: usrs }] = await Promise.all([
      supabase.from("partidos").select("*").eq("jornada_id", j.id).order("orden"),
      supabase.from("pronosticos").select("*").eq("jornada_id", j.id),
      supabase.from("usuarios").select("*").order("username"),
    ]);
    setPartidos(pts || []); setAllProns(prons || []); setUsuarios(usrs || []);
    const resMap = {};
    (pts || []).forEach(p => { resMap[p.id] = { local: p.goles_local_real ?? "", visitante: p.goles_visitante_real ?? "" }; });
    setEditRes(resMap);
    setLoading(false);
  };

  // ── Cargar ranking global ──────────────────────────────────────────────
  const loadGlobal = async () => {
    setLoadingGlobal(true);
    const [{ data: usrs }, { data: allPts }, { data: allPronsList }, { data: js }] = await Promise.all([
      supabase.from("usuarios").select("*").order("username"),
      supabase.from("partidos").select("*"),
      supabase.from("pronosticos").select("*"),
      supabase.from("jornadas").select("*").order("created_at"),
    ]);

    const jornadasConRes = (js || []).filter(j =>
      (allPts || []).some(p => p.jornada_id === j.id && p.goles_local_real !== null)
    );
    setAllJornadas(jornadasConRes);

    const global = (usrs || []).map(u => {
      let totalPts = 0, totalExactos = 0, totalResultados = 0;
      const porJornada = {};

      jornadasConRes.forEach(j => {
        const ptsDej = (allPts || []).filter(p => p.jornada_id === j.id);
        let jPts = 0;
        ptsDej.forEach(p => {
          const pron = (allPronsList || []).find(pr => pr.usuario_id === u.id && pr.partido_id === p.id);
          const puntos = calcPuntos(pron, p);
          if (puntos === 3) { jPts += 3; totalPts += 3; totalExactos++; }
          else if (puntos === 1) { jPts += 1; totalPts += 1; totalResultados++; }
        });
        porJornada[j.id] = jPts;
      });

      return { ...u, pts: totalPts, exactos: totalExactos, resultados: totalResultados, porJornada };
    }).sort((a, b) => b.pts - a.pts);

    setGlobalData(addPos(global));
    setLoadingGlobal(false);
  };

  useEffect(() => {
    if (innerTab === "global") loadGlobal();
  }, [innerTab]);

  // ── Resultados ──────────────────────────────────────────────────────────
  const saveResultado = async (partidoId) => {
    const r = editRes[partidoId];
    if (r.local === "" || r.visitante === "") return;
    setSaving(partidoId);
    await supabase.from("partidos").update({ goles_local_real: Number(r.local), goles_visitante_real: Number(r.visitante) }).eq("id", partidoId);
    const { data } = await supabase.from("partidos").select("*").eq("jornada_id", selectedJ.id).order("orden");
    setPartidos(data || []);
    setEditingIds(prev => { const s = new Set(prev); s.delete(partidoId); return s; });
    setSaving(null);
    showToast("Resultado guardado ✓");
  };

  const clearResultado = async (partidoId) => {
    if (!confirm("¿Quitar el resultado? Los puntos de este partido quedarán en cero.")) return;
    await supabase.from("partidos").update({ goles_local_real: null, goles_visitante_real: null }).eq("id", partidoId);
    setEditRes(prev => ({ ...prev, [partidoId]: { local: "", visitante: "" } }));
    setEditingIds(prev => { const s = new Set(prev); s.delete(partidoId); return s; });
    const { data } = await supabase.from("partidos").select("*").eq("jornada_id", selectedJ.id).order("orden");
    setPartidos(data || []);
    showToast("Resultado eliminado");
  };

  const toggleEditing = (partidoId) => {
    setEditingIds(prev => { const s = new Set(prev); s.has(partidoId) ? s.delete(partidoId) : s.add(partidoId); return s; });
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  // ── Tabla de jornada ───────────────────────────────────────────────────
  const tablaJornada = addPos(usuarios.map(u => {
    let pts = 0, exactos = 0, resultados = 0;
    partidos.forEach(p => {
      const pron = allProns.find(pr => pr.usuario_id === u.id && pr.partido_id === p.id);
      const puntos = calcPuntos(pron, p);
      if (puntos === 3) { pts += 3; exactos++; }
      else if (puntos === 1) { pts += 1; resultados++; }
    });
    return { ...u, pts, exactos, resultados };
  }).sort((a, b) => b.pts - a.pts));

  const pdfDataJornada = tablaJornada.map(u => ({
    nombre: u.nombre || u.username, username: u.username,
    pts: u.pts, exactos: u.exactos, resultados: u.resultados, pos: u.posReal,
  }));

  const pdfDataGlobal = globalData.map(u => ({
    nombre: u.nombre || u.username, username: u.username,
    pts: u.pts, exactos: u.exactos, resultados: u.resultados, pos: u.posReal,
  }));

  const tieneResultados = partidos.some(p => p.goles_local_real !== null && p.goles_local_real !== undefined);

  const medalPos = (pos, pts) => pts > 0
    ? (pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : pos)
    : pos;

  return (
    <div className="puntos-tab">
      {toast && <div className="toast">{toast}</div>}

      {/* ── Tabs internos ── */}
      <div className="puntos-inner-tabs">
        <button className={`puntos-inner-tab ${innerTab === "jornada" ? "active" : ""}`} onClick={() => setInnerTab("jornada")}>
          📋 Por Jornada
        </button>
        <button className={`puntos-inner-tab ${innerTab === "global" ? "active" : ""}`} onClick={() => setInnerTab("global")}>
          🏆 Ranking Global
        </button>
      </div>

      {/* ══════════════════════════════════
          TAB: POR JORNADA
      ══════════════════════════════════ */}
      {innerTab === "jornada" && (
        <>
          <div className="copiar-section">
            <h3 className="col-label">Selecciona una jornada</h3>
            <div className="jornada-pills">
              {jornadas.map(j => (
                <button key={j.id} className={`jornada-pill ${selectedJ?.id === j.id ? "active" : ""}`} onClick={() => loadJornada(j)}>
                  {j.nombre}{j.terminada && <span className="pill-done">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {loading && <div className="loading-state"><div className="spinner" /><p>Cargando...</p></div>}

          {selectedJ && !loading && (
            <div className="puntos-layout">

              {/* Resultados reales */}
              <div className="resultados-section">
                <div className="rs-header">
                  <h3 className="col-label">Resultados reales</h3>
                  <p className="dim-text">Ingresa los marcadores finales para calcular puntos</p>
                </div>
                <div className="resultados-list">
                  {partidos.map((p, i) => {
                    const r = editRes[p.id] || { local: "", visitante: "" };
                    const isSaving  = saving === p.id;
                    const hasSaved  = p.goles_local_real !== null && p.goles_local_real !== undefined;
                    const isEditing = editingIds.has(p.id);
                    const showInputs = !hasSaved || isEditing;
                    return (
                      <div key={p.id} className={`resultado-row ${hasSaved ? "has-result" : ""} ${isEditing ? "is-editing" : ""}`}>
                        <span className="resultado-num">{i + 1}</span>
                        <div className="resultado-teams">
                          <span className="rt-team">{p.equipo_local}</span>
                          <span className="rt-vs">vs</span>
                          <span className="rt-team">{p.equipo_visitante}</span>
                        </div>
                        {showInputs ? (
                          <div className="resultado-inputs">
                            <input className="res-input" type="number" min="0" value={r.local}
                              onChange={e => setEditRes(prev => ({ ...prev, [p.id]: { ...prev[p.id], local: e.target.value } }))} placeholder="—" />
                            <span className="res-dash">–</span>
                            <input className="res-input" type="number" min="0" value={r.visitante}
                              onChange={e => setEditRes(prev => ({ ...prev, [p.id]: { ...prev[p.id], visitante: e.target.value } }))} placeholder="—" />
                            <button className="res-save-btn" onClick={() => saveResultado(p.id)}
                              disabled={isSaving || r.local === "" || r.visitante === ""}>
                              {isSaving ? "..." : "Guardar"}
                            </button>
                            {isEditing && <button className="res-cancel-btn" onClick={() => toggleEditing(p.id)}>✕</button>}
                          </div>
                        ) : (
                          <div className="resultado-display">
                            <span className="res-score-display">{p.goles_local_real} – {p.goles_visitante_real}</span>
                            <button className="res-edit-btn"  onClick={() => toggleEditing(p.id)}  title="Editar">✏️</button>
                            <button className="res-clear-btn" onClick={() => clearResultado(p.id)} title="Quitar">🗑</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tabla de jornada */}
              <div className="tabla-section">
                <div className="tabla-header">
                  <div>
                    <h3 className="col-label">Tabla — {selectedJ.nombre}</h3>
                    {!tieneResultados && <p className="dim-text">Ingresa resultados para calcular</p>}
                  </div>
                  {tieneResultados && (
                    <button className="download-btn" onClick={() => setPdfOpen(true)}>⬇ Exportar PDF</button>
                  )}
                </div>
                <div ref={tableRef} className="tabla-wrap">
                  <div className="tabla-title-img">{selectedJ.nombre}</div>
                  <table className="tabla-puntos">
                    <thead>
                      <tr>
                        <th className="tp-pos">#</th>
                        <th className="tp-user">Participante</th>
                        <th className="tp-pts">Pts</th>
                        {/* <th className="tp-stat" title="Exactos">🎯</th> */}
                        {/* <th className="tp-stat" title="Resultado">✓</th> */}
                      </tr>
                    </thead>
                    <tbody>
                      {tablaJornada.map(u => (
                        <tr key={u.id} className={u.posReal === 1 && u.pts > 0 ? "tp-leader" : ""}>
                          <td className="tp-pos-cell">{medalPos(u.posReal, u.pts)}</td>
                          <td className="tp-user-cell">
                            <div className="tp-avatar">{(u.nombre || u.username).charAt(0).toUpperCase()}</div>
                            <div className="tp-user-names">
                              <span>{u.nombre || u.username}</span>
                              {u.nombre && u.nombre !== u.username && <span className="tp-username-sub">@{u.username}</span>}
                            </div>
                          </td>
                          <td className="tp-pts-cell">{u.pts}</td>
                          {/* <td className="tp-stat-cell tp-exacto">{u.exactos}</td> */}
                          {/* <td className="tp-stat-cell tp-resultado">{u.resultados}</td> */}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="tabla-legend">
                    <span className="legend-item pts-3">3 = exacto</span>
                    <span className="legend-item pts-1">1 = resultado</span>
                    <span className="legend-item pts-0">0 = nada</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <PDFExportModal open={pdfOpen} onClose={() => setPdfOpen(false)} type="puntos"
            title={`Tabla — ${selectedJ?.nombre || ""}`} subtitle={`${tablaJornada.length} participantes`}
            jornada={selectedJ?.nombre} data={pdfDataJornada} />
        </>
      )}

      {/* ══════════════════════════════════
          TAB: RANKING GLOBAL
      ══════════════════════════════════ */}
      {innerTab === "global" && (
        <>
          {loadingGlobal && <div className="loading-state"><div className="spinner" /><p>Calculando ranking...</p></div>}

          {!loadingGlobal && (
            <>
              {allJornadas.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📊</span>
                  <p>Sin resultados aún</p>
                  <span>Ingresa resultados de partidos en la pestaña "Por Jornada" para ver el ranking global.</span>
                </div>
              ) : (
                <>
                  <div className="global-header">
                    <div>
                      <p className="dim-text">Suma de puntos de todas las jornadas con resultados ingresados</p>
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <button className="res-save-btn" onClick={loadGlobal} style={{padding:"8px 14px"}}>↻ Actualizar</button>
                      {globalData.length > 0 && (
                        <button className="download-btn" onClick={() => setGlobalPdfOpen(true)}>⬇ Exportar PDF</button>
                      )}
                    </div>
                  </div>

                  <div className="global-tabla-wrap">
                    <table className="tabla-puntos global-tabla">
                      <thead>
                        <tr>
                          <th className="tp-pos">#</th>
                          <th className="tp-user">Participante</th>
                          <th className="tp-pts">Total</th>
                          {/* <th className="tp-stat" title="Exactos">🎯</th> */}
                          {/* <th className="tp-stat" title="Resultado">✓</th> */}
                          {/* {allJornadas.map(j => (
                            <th key={j.id} className="tp-partido-col" title={j.nombre}>
                              {j.nombre.length > 8 ? j.nombre.slice(0, 7) + "…" : j.nombre}
                            </th>
                          ))} */}
                        </tr>
                      </thead>
                      <tbody>
                        {globalData.map(u => (
                          <tr key={u.id} className={u.posReal === 1 && u.pts > 0 ? "tp-leader" : ""}>
                            <td className="tp-pos-cell">{medalPos(u.posReal, u.pts)}</td>
                            <td className="tp-user-cell">
                              <div className="tp-avatar">{(u.nombre || u.username).charAt(0).toUpperCase()}</div>
                              <div className="tp-user-names">
                                <span>{u.nombre}</span>
                                {/* {u.nombre && u.nombre !== u.username && <span className="tp-username-sub">@{u.username}</span>} */}
                              </div>
                            </td>
                            <td className="tp-pts-cell">{u.pts}</td>
                            {/* <td className="tp-stat-cell tp-exacto">{u.exactos}</td> */}
                            {/* <td className="tp-stat-cell tp-resultado">{u.resultados}</td> */}
                            {/* {allJornadas.map(j => (
                              <td key={j.id} className={`tp-mini ${u.porJornada[j.id] > 0 ? "pts-1" : "pts-null"}`}>
                                {u.porJornada[j.id] ?? 0}
                              </td>
                            ))} */}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <PDFExportModal open={globalPdfOpen} onClose={() => setGlobalPdfOpen(false)} type="puntos"
                    title="Ranking Global — Quiniela 2026" subtitle={`${globalData.length} participantes · ${allJornadas.length} jornadas`}
                    jornada="Todas las jornadas" data={pdfDataGlobal} />
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}