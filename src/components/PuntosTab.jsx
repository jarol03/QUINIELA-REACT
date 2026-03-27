import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import PDFExportModal from "./PDFExportModal";

// ── Lógica de puntos ─────────────────────────────────────────────────────
function calcPuntos(pron, partido) {
  if (!partido || pron?.goles_local === null || pron?.goles_local === undefined) return null;
  if (partido.goles_local_real === null || partido.goles_local_real === undefined) return null;

  const gl = Number(pron.goles_local);
  const gv = Number(pron.goles_visitante);
  const rl = Number(partido.goles_local_real);
  const rv = Number(partido.goles_visitante_real);

  if (gl === rl && gv === rv) return 3; // Exacto
  const resPron = gl > gv ? "L" : gl < gv ? "V" : "E";
  const resReal = rl > rv ? "L" : rl < rv ? "V" : "E";
  if (resPron === resReal) return 1; // Solo resultado
  return 0;
}

function getResultado(gL, gV) {
  if (gL === null || gV === null || gL === undefined || gV === undefined) return "—";
  return Number(gL) > Number(gV) ? "L" : Number(gL) < Number(gV) ? "V" : "E";
}

export default function PuntosTab() {
  const [jornadas, setJornadas]   = useState([]);
  const [selectedJ, setSelectedJ] = useState(null);
  const [usuarios, setUsuarios]   = useState([]);
  const [partidos, setPartidos]   = useState([]);
  const [allProns, setAllProns]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(null);
  const [toast, setToast]         = useState("");
  const [editRes, setEditRes]     = useState({});
  const [pdfOpen, setPdfOpen]     = useState(false);
  const [editingIds, setEditingIds] = useState(new Set()); // partidos en modo edición
  const tableRef = useRef(null);

  useEffect(() => { fetchJornadas(); }, []);

  const fetchJornadas = async () => {
    const { data } = await supabase.from("jornadas").select("*").order("created_at", { ascending: false });
    setJornadas(data || []);
  };

  const loadJornada = async (j) => {
    setLoading(true);
    setSelectedJ(j);
    setEditRes({});

    const [{ data: pts }, { data: prons }, { data: usrs }] = await Promise.all([
      supabase.from("partidos").select("*").eq("jornada_id", j.id).order("orden"),
      supabase.from("pronosticos").select("*").eq("jornada_id", j.id),
      supabase.from("usuarios").select("*").order("username"),
    ]);

    setPartidos(pts || []);
    setAllProns(prons || []);
    setUsuarios(usrs || []);

    // Inicializar editores de resultado con valores actuales
    const resMap = {};
    (pts || []).forEach(p => {
      resMap[p.id] = {
        local: p.goles_local_real ?? "",
        visitante: p.goles_visitante_real ?? "",
      };
    });
    setEditRes(resMap);
    setLoading(false);
  };

  const saveResultado = async (partidoId) => {
    const r = editRes[partidoId];
    if (r.local === "" || r.visitante === "") return;
    setSaving(partidoId);
    await supabase.from("partidos").update({
      goles_local_real: Number(r.local),
      goles_visitante_real: Number(r.visitante),
    }).eq("id", partidoId);
    const { data } = await supabase.from("partidos").select("*").eq("jornada_id", selectedJ.id).order("orden");
    setPartidos(data || []);
    setEditingIds(prev => { const s = new Set(prev); s.delete(partidoId); return s; });
    setSaving(null);
    showToast("Resultado guardado ✓");
  };

  const clearResultado = async (partidoId) => {
    if (!confirm("¿Quitar el resultado? Los puntos de este partido quedarán en cero.")) return;
    await supabase.from("partidos").update({
      goles_local_real: null,
      goles_visitante_real: null,
    }).eq("id", partidoId);
    setEditRes(prev => ({ ...prev, [partidoId]: { local: "", visitante: "" } }));
    setEditingIds(prev => { const s = new Set(prev); s.delete(partidoId); return s; });
    const { data } = await supabase.from("partidos").select("*").eq("jornada_id", selectedJ.id).order("orden");
    setPartidos(data || []);
    showToast("Resultado eliminado");
  };

  const toggleEditing = (partidoId) => {
    setEditingIds(prev => {
      const s = new Set(prev);
      s.has(partidoId) ? s.delete(partidoId) : s.add(partidoId);
      return s;
    });
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  // Calcular tabla de posiciones
  const tabla = usuarios.map(u => {
    let pts = 0, exactos = 0, resultados = 0;
    partidos.forEach(p => {
      const pron = allProns.find(pr => pr.usuario_id === u.id && pr.partido_id === p.id);
      const puntos = calcPuntos(pron, p);
      if (puntos === 3) { pts += 3; exactos++; }
      else if (puntos === 1) { pts += 1; resultados++; }
    });
    return { ...u, pts, exactos, resultados };
  }).sort((a, b) => b.pts - a.pts || b.exactos - a.exactos);

  // Datos formateados para el modal PDF
  const pdfData = tabla.map((u, i) => ({
    nombre: u.nombre || u.username,
    username: u.username,
    pts: u.pts,
    exactos: u.exactos,
    resultados: u.resultados,
    pos: i + 1,
  }));

  const tieneResultados = partidos.some(p => p.goles_local_real !== null && p.goles_local_real !== undefined);

  return (
    <div className="puntos-tab">
      {toast && <div className="toast">{toast}</div>}

      {/* Selector de jornada */}
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

          {/* ── Ingresar resultados reales ── */}
          <div className="resultados-section">
            <div className="rs-header">
              <h3 className="col-label">Resultados reales</h3>
              <p className="dim-text">Ingresa los marcadores finales para calcular puntos</p>
            </div>
            <div className="resultados-list">
              {partidos.map((p, i) => {
                const r          = editRes[p.id] || { local: "", visitante: "" };
                const isSaving   = saving === p.id;
                const hasSaved   = p.goles_local_real !== null && p.goles_local_real !== undefined;
                const isEditing  = editingIds.has(p.id);
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
                          onChange={e => setEditRes(prev => ({ ...prev, [p.id]: { ...prev[p.id], local: e.target.value } }))}
                          placeholder="—"
                        />
                        <span className="res-dash">–</span>
                        <input className="res-input" type="number" min="0" value={r.visitante}
                          onChange={e => setEditRes(prev => ({ ...prev, [p.id]: { ...prev[p.id], visitante: e.target.value } }))}
                          placeholder="—"
                        />
                        <button className="res-save-btn" onClick={() => saveResultado(p.id)}
                          disabled={isSaving || r.local === "" || r.visitante === ""}>
                          {isSaving ? "..." : "Guardar"}
                        </button>
                        {isEditing && (
                          <button className="res-cancel-btn" onClick={() => toggleEditing(p.id)} title="Cancelar">✕</button>
                        )}
                      </div>
                    ) : (
                      <div className="resultado-display">
                        <span className="res-score-display">{p.goles_local_real} – {p.goles_visitante_real}</span>
                        <button className="res-edit-btn" onClick={() => toggleEditing(p.id)} title="Editar resultado">✏️</button>
                        <button className="res-clear-btn" onClick={() => clearResultado(p.id)} title="Quitar resultado">🗑</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Tabla de posiciones ── */}
          <div className="tabla-section">
            <div className="tabla-header">
              <div>
                <h3 className="col-label">Tabla de posiciones</h3>
                {!tieneResultados && <p className="dim-text">Ingresa resultados para ver los puntos</p>}
              </div>
              {tieneResultados && (
                <button className="download-btn" onClick={() => setPdfOpen(true)}>⬇ Exportar PDF</button>
              )}
            </div>

            <div ref={tableRef} className="tabla-wrap">
              <div className="tabla-title-img">{selectedJ.nombre} — Tabla de Puntos</div>
              <table className="tabla-puntos">
                <thead>
                  <tr>
                    <th className="tp-pos">#</th>
                    <th className="tp-user">Participante</th>
                    <th className="tp-pts">Pts</th>
                    {/* <th className="tp-stat" title="Marcadores exactos">🎯</th>
                    <th className="tp-stat" title="Solo resultado">✓</th>
                    {partidos.map((p, i) => (
                      <th key={p.id} className="tp-partido-col" title={`${p.equipo_local} vs ${p.equipo_visitante}`}>
                        P{i + 1}
                      </th>
                    ))} */}
                  </tr>
                </thead>
                <tbody>
                  {tabla.map((u, idx) => (
                    <tr key={u.id} className={idx === 0 && u.pts > 0 ? "tp-leader" : ""}>
                      <td className="tp-pos-cell">
                        {idx === 0 && u.pts > 0 ? "🥇" : idx === 1 && u.pts > 0 ? "🥈" : idx === 2 && u.pts > 0 ? "🥉" : idx + 1}
                      </td>
                      <td className="tp-user-cell">
                        <div className="tp-avatar">{u.username.charAt(0).toUpperCase()}</div>
                        {u.username}
                      </td>
                      <td className="tp-pts-cell">{u.pts}</td>
                      {/* <td className="tp-stat-cell tp-exacto">{u.exactos}</td>
                      <td className="tp-stat-cell tp-resultado">{u.resultados}</td>
                      {partidos.map(p => {
                        const pron = allProns.find(pr => pr.usuario_id === u.id && pr.partido_id === p.id);
                        const pts = calcPuntos(pron, p);
                        return (
                          <td key={p.id} className={`tp-pts-cell tp-mini ${pts === 3 ? "pts-3" : pts === 1 ? "pts-1" : pts === 0 ? "pts-0" : "pts-null"}`}>
                            {pts !== null ? pts : "·"}
                          </td>
                        );
                      })} */}
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
      {/* Modal PDF */}
      <PDFExportModal
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        type="puntos"
        title={`Tabla de Puntos — ${selectedJ?.nombre || ""}`}
        subtitle={`${tabla.length} participantes`}
        jornada={selectedJ?.nombre}
        data={pdfData}
      />
    </div>
  );
}