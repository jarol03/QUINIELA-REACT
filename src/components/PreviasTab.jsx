import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabaseClient";
import PDFExportModal from "./PDFExportModal";

const PAGE_SIZE = 1000;
async function fetchAllPaginated(queryFactory, pageSize = PAGE_SIZE) {
  const allRows = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await queryFactory(from, to);
    if (error) throw error;
    const page = data || [];
    allRows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

function getGEP(gL, gV) {
  if (gL === null || gV === null || gL === undefined || gV === undefined) return null;
  if (Number(gL) > Number(gV)) return "G";
  if (Number(gL) < Number(gV)) return "P";
  return "E";
}

function formatHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-HN", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function displayName(u) { return u.nombre || u.username; }

export default function PreviasTab() {
  const [jornadas,  setJornadas]  = useState([]);
  const [selectedJ, setSelectedJ] = useState(null);
  const [partidos,  setPartidos]  = useState([]);
  const [usuarios,  setUsuarios]  = useState([]);
  const [allProns,  setAllProns]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [selectedP, setSelectedP] = useState(null);
  const [pdfOpen,   setPdfOpen]   = useState(false);
  const [search,    setSearch]    = useState("");
  // Vista: "jornadas" | "partidos" | "detalle"
  const [vista, setVista] = useState("jornadas");

  useEffect(() => { fetchJornadas(); }, []);

  const fetchJornadas = async () => {
    const { data } = await supabase.from("jornadas").select("*").order("created_at", { ascending: false });
    setJornadas(data || []);
  };

  const loadJornada = async (j) => {
    setLoading(true);
    setSelectedJ(j);
    setSelectedP(null);
    setSearch("");
    try {
      const [ptsData, usrsData, pronsData] = await Promise.all([
        supabase.from("partidos").select("*").eq("jornada_id", j.id).order("orden"),
        supabase.from("usuarios").select("*").order("username"),
        fetchAllPaginated((from, to) =>
          supabase.from("pronosticos").select("*").eq("jornada_id", j.id).range(from, to)
        ),
      ]);
      setPartidos(ptsData.data || []);
      setUsuarios(usrsData.data || []);
      setAllProns(pronsData || []);
      setVista("partidos");
    } catch (err) {
      console.error("Error al cargar previa:", err);
    } finally {
      setLoading(false);
    }
  };

  const selectPartido = (p) => {
    setSelectedP(p);
    setSearch("");
    setVista("detalle");
  };

  // ── Datos del partido seleccionado ──
  const previaDatos = useMemo(() => {
    if (!selectedP) return [];
    
    // Optimizamos creando un mapa de pronósticos del partido actual indexado por usuario_id
    const pMap = new Map();
    const targetPId = String(selectedP.id).toLowerCase();
    
    allProns.forEach(pr => {
      if (String(pr.partido_id).toLowerCase() === targetPId) {
        pMap.set(String(pr.usuario_id).toLowerCase(), pr);
      }
    });

    return usuarios.map(u => {
      const uSearch = String(u.id).toLowerCase();
      const pron = pMap.get(uSearch);
      return {
        ...u,
        goles_local:     pron?.goles_local     ?? null,
        goles_visitante: pron?.goles_visitante ?? null,
        gep:  pron ? getGEP(pron.goles_local, pron.goles_visitante) : null,
        hora: pron?.updated_at || pron?.created_at || null,
      };
    });
  }, [selectedP, usuarios, allProns]);

  const previaDatosFiltrados = useMemo(() => {
    if (!search.trim()) return previaDatos;
    const q = search.toLowerCase();
    return previaDatos.filter(u =>
      (u.nombre || "").toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    );
  }, [previaDatos, search]);

  const total  = previaDatos.filter(u => u.gep !== null).length;
  const countG = previaDatos.filter(u => u.gep === "G").length;
  const countE = previaDatos.filter(u => u.gep === "E").length;
  const countP = previaDatos.filter(u => u.gep === "P").length;
  const pctG   = total > 0 ? Math.round((countG / total) * 100) : 0;
  const pctE   = total > 0 ? Math.round((countE / total) * 100) : 0;
  const pctP   = total > 0 ? Math.round((countP / total) * 100) : 0;

  const pdfData = previaDatos.map(u => ({
    nombre: u.nombre || u.username, username: u.username,
    goles_local: u.goles_local, goles_visitante: u.goles_visitante,
    gep: u.gep, hora: formatHora(u.hora),
  }));

  const barData = selectedP ? [
    { label: `G — ${selectedP.equipo_local}`,    pct: pctG, count: countG, color: [0,210,140] },
    { label: "E — Empate",                        pct: pctE, count: countE, color: [220,160,20] },
    { label: `P — ${selectedP.equipo_visitante}`, pct: pctP, count: countP, color: [220,80,110] },
  ] : [];

  // Nav helpers
  const goBack = () => {
    if (vista === "detalle")  { setVista("partidos"); setSelectedP(null); }
    if (vista === "partidos") { setVista("jornadas"); setSelectedJ(null); }
  };

  // ── Conteo de pronósticos por partido (para la lista de partidos) ──
  const pronCount = (p) =>
    allProns.filter(pr => pr.partido_id === p.id && pr.goles_local !== null).length;

  return (
    <div className="previas-tab">

      {/* ═══ VISTA: JORNADAS ═══ */}
      {vista === "jornadas" && (
        <>
          <div className="pv-section-header">
            <h3 className="col-label">Selecciona una jornada</h3>
          </div>

          {jornadas.length === 0 && <p className="dim-text">Sin jornadas aún.</p>}

          <div className="pv-jornadas-list">
            {jornadas.map((j, idx) => (
              <button
                key={j.id}
                className="pv-jornada-card"
                onClick={() => loadJornada(j)}
                style={{ animationDelay: `${idx * 0.04}s` }}
              >
                <div className="pvjc-left">
                  <div className={`pvjc-dot ${j.terminada ? "done" : "active"}`} />
                  <div>
                    <span className="pvjc-nombre">{j.nombre}</span>
                    {j.terminada && <span className="pvjc-badge">Terminada</span>}
                  </div>
                </div>
                <span className="pvjc-arrow">›</span>
              </button>
            ))}
          </div>

          {loading && <div className="loading-state"><div className="spinner" /></div>}
        </>
      )}

      {/* ═══ VISTA: LISTA DE PARTIDOS ═══ */}
      {vista === "partidos" && (
        <>
          <button className="pv-back-btn" onClick={goBack}>← Jornadas</button>

          <div className="pv-section-header">
            <h3 className="pv-jornada-titulo">{selectedJ?.nombre}</h3>
            <span className="pv-subtitle">{partidos.length} partido{partidos.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="pv-partidos-list">
            {partidos.map((p, i) => {
              const cnt   = pronCount(p);
              const pct   = usuarios.length > 0 ? Math.round((cnt / usuarios.length) * 100) : 0;
              const isClosed = p.fecha_limite && new Date() > new Date(p.fecha_limite);
              return (
                <button
                  key={p.id}
                  className={`pv-partido-card ${isClosed ? "pv-partido-closed" : "pv-partido-open"}`}
                  onClick={() => selectPartido(p)}
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <div className="pvpc-header">
                    <span className="pvpc-num">{i + 1}</span>
                    <div className="pvpc-teams">
                      <span className="pvpc-team">{p.equipo_local}</span>
                      <span className="pvpc-vs">vs</span>
                      <span className="pvpc-team">{p.equipo_visitante}</span>
                    </div>
                    <span className={`pvpc-status ${isClosed ? "closed" : "open"}`}>
                      {isClosed ? "🔒" : "▶"}
                    </span>
                  </div>
                  <div className="pvpc-footer">
                    {/* Mini barra de participación */}
                    <div className="pvpc-bar-wrap">
                      <div className="pvpc-bar-track">
                        <div className="pvpc-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="pvpc-count">{cnt}/{usuarios.length}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ VISTA: DETALLE DE PARTIDO ═══ */}
      {vista === "detalle" && selectedP && (
        <>
          <button className="pv-back-btn" onClick={goBack}>← {selectedJ?.nombre}</button>

          {/* Header del partido */}
          <div className="pv-detalle-header">
            <div className="pvdh-teams">
              <span className="pvdh-team">{selectedP.equipo_local}</span>
              <span className="pvdh-vs">vs</span>
              <span className="pvdh-team">{selectedP.equipo_visitante}</span>
            </div>
            <div className="pvdh-meta">
              <span className="pvdh-count">{total}/{usuarios.length} pronósticos</span>
              <button className="download-btn" onClick={() => setPdfOpen(true)}>⬇ PDF</button>
            </div>
          </div>

          {/* Barras G/E/P */}
          <div className="pv-bars-card">
            {[
              { label: selectedP.equipo_local, tag: "G", pct: pctG, count: countG, cls: "pci-bar-g", lcls: "pci-g" },
              { label: "Empate",               tag: "E", pct: pctE, count: countE, cls: "pci-bar-e", lcls: "pci-e" },
              { label: selectedP.equipo_visitante, tag: "P", pct: pctP, count: countP, cls: "pci-bar-p", lcls: "pci-p" },
            ].map(b => (
              <div key={b.tag} className="pv-bar-row">
                <div className="pv-bar-left">
                  <span className={`pv-bar-tag ${b.lcls}`}>{b.tag}</span>
                  <span className="pv-bar-label">{b.label}</span>
                </div>
                <div className="pv-bar-mid">
                  <div className="pci-bar-track">
                    <div className={`pci-bar-fill ${b.cls}`} style={{ width: `${b.pct}%` }} />
                  </div>
                </div>
                <span className="pv-bar-pct">{b.pct}%<span className="pv-bar-cnt"> ({b.count})</span></span>
              </div>
            ))}
          </div>

          {/* Buscador */}
          <div className="pv-search-wrap">
            <input
              className="admin-input"
              placeholder="🔍 Buscar participante..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Lista de pronósticos */}
          <div className="pv-prons-list">
            {/* Con pronóstico */}
            {previaDatosFiltrados.filter(u => u.gep !== null).map(u => (
              <div key={u.id} className="pv-pron-row">
                <div className="pv-pron-avatar">
                  {displayName(u).charAt(0).toUpperCase()}
                </div>
                <div className="pv-pron-info">
                  <span className="pv-pron-nombre">{displayName(u)}</span>
                  {/* {u.nombre && u.nombre !== u.username && (
                    <span className="pv-pron-username">@{u.username}</span>
                  )} */}
                  <span className="pv-pron-hora">{formatHora(u.hora)}</span>
                </div>
                <div className="pv-pron-right">
                  <span className="pv-pron-marcador">{u.goles_local} – {u.goles_visitante}</span>
                  <span className={`gep-badge gep-${u.gep.toLowerCase()}`}>{u.gep}</span>
                </div>
              </div>
            ))}

            {/* Sin pronóstico */}
            {previaDatosFiltrados.filter(u => u.gep === null).map(u => (
              <div key={u.id} className="pv-pron-row pv-pron-missing">
                <div className="pv-pron-avatar pv-pron-avatar-dim">
                  {displayName(u).charAt(0).toUpperCase()}
                </div>
                <div className="pv-pron-info">
                  <span className="pv-pron-nombre">{displayName(u)}</span>
                  {/* {u.nombre && u.nombre !== u.username && (
                    <span className="pv-pron-username">@{u.username}</span>
                  )} */}
                </div>
                <div className="pv-pron-right">
                  <span className="pv-pron-sin">Sin pronóstico</span>
                </div>
              </div>
            ))}

            {previaDatosFiltrados.length === 0 && (
              <p className="dim-text" style={{ padding: "16px 0" }}>Sin resultados para "{search}"</p>
            )}
          </div>

          <PDFExportModal
            open={pdfOpen} onClose={() => setPdfOpen(false)}
            type="previas"
            title={`${selectedP.equipo_local} vs ${selectedP.equipo_visitante}`}
            subtitle={`${total} de ${usuarios.length} pronósticos`}
            jornada={selectedJ?.nombre}
            data={pdfData} extraHeader={{ barData }}
          />
        </>
      )}
    </div>
  );
}