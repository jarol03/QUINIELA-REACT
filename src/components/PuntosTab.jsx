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
    setSaving(null);
    showToast("Resultado guardado ✓");
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  // 1. Calcular estadísticas base y ordenar
  const tablaBase = usuarios.map(u => {
    let pts = 0, exactos = 0, resultados = 0;
    partidos.forEach(p => {
      const pron = allProns.find(pr => pr.usuario_id === u.id && pr.partido_id === p.id);
      const puntos = calcPuntos(pron, p);
      if (puntos === 3) { pts += 3; exactos++; }
      else if (puntos === 1) { pts += 1; resultados++; }
    });
    return { ...u, pts, exactos, resultados };
  }).sort((a, b) => b.pts - a.pts || b.exactos - a.exactos || b.resultados - a.resultados);

  // 2. Calcular posiciones reales (manejo de empates)
  const tablaFinal = tablaBase.map((u, idx) => {
    if (idx === 0) {
      u.posReal = 1;
    } else {
      const prev = tablaBase[idx - 1];
      // Si tiene mismos puntos y mismos exactos, es empate
      const esEmpate = u.pts === prev.pts && u.exactos === prev.exactos;
      u.posReal = esEmpate ? prev.posReal : idx + 1;
    }
    return u;
  });

  // Datos para el PDF con la posición real
  const pdfData = tablaFinal.map(u => ({
    nombre: u.nombre || u.username,
    username: u.username,
    pts: u.pts,
    exactos: u.exactos,
    resultados: u.resultados,
    pos: u.posReal, 
  }));

  const tieneResultados = partidos.some(p => p.goles_local_real !== null && p.goles_local_real !== undefined);

  return (
    <div className="puntos-tab">
      {toast && <div className="toast">{toast}</div>}

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
          <div className="resultados-section">
            <div className="rs-header">
              <h3 className="col-label">Resultados reales</h3>
              <p className="dim-text">Ingresa marcadores finales</p>
            </div>
            <div className="resultados-list">
              {partidos.map((p, i) => {
                const r = editRes[p.id] || { local: "", visitante: "" };
                const isSaving = saving === p.id;
                const hasSaved = p.goles_local_real !== null && p.goles_local_real !== undefined;
                return (
                  <div key={p.id} className={`resultado-row ${hasSaved ? "has-result" : ""}`}>
                    <span className="resultado-num">{i + 1}</span>
                    <div className="resultado-teams">
                      <span className="rt-team">{p.equipo_local}</span>
                      <span className="rt-vs">vs</span>
                      <span className="rt-team">{p.equipo_visitante}</span>
                    </div>
                    <div className="resultado-inputs">
                      <input
                        className="res-input" type="number" value={r.local}
                        onChange={e => setEditRes(prev => ({ ...prev, [p.id]: { ...prev[p.id], local: e.target.value } }))}
                        placeholder="—"
                      />
                      <span className="res-dash">–</span>
                      <input
                        className="res-input" type="number" value={r.visitante}
                        onChange={e => setEditRes(prev => ({ ...prev, [p.id]: { ...prev[p.id], visitante: e.target.value } }))}
                        placeholder="—"
                      />
                      <button
                        className={`res-save-btn ${hasSaved ? "res-saved" : ""}`}
                        onClick={() => saveResultado(p.id)}
                        disabled={isSaving || r.local === "" || r.visitante === ""}
                      >
                        {isSaving ? "..." : hasSaved ? "✓" : "Guardar"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tabla-section">
            <div className="tabla-header">
              <div>
                <h3 className="col-label">Tabla de posiciones</h3>
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
                  </tr>
                </thead>
                <tbody>
                  {tablaFinal.map((u) => (
                    <tr key={u.id} className={u.posReal === 1 && u.pts > 0 ? "tp-leader" : ""}>
                      <td className="tp-pos-cell">
                        {u.pts > 0 ? (
                          u.posReal === 1 ? "🥇" : u.posReal === 2 ? "🥈" : u.posReal === 3 ? "🥉" : u.posReal
                        ) : u.posReal}
                      </td>
                      <td className="tp-user-cell">
                        <div className="tp-avatar">{u.username.charAt(0).toUpperCase()}</div>
                        {u.username}
                      </td>
                      <td className="tp-pts-cell">{u.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <PDFExportModal
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        type="puntos"
        title={` ${selectedJ?.nombre || ""}`}
        subtitle={`${tablaFinal.length} participantes`}
        jornada={selectedJ?.nombre}
        data={pdfData}
      />
    </div>
  );
}