import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { formatDisplay } from "./DateTimePicker";
import PDFExportModal from "./PDFExportModal";

// --- Funciones de Utilidad ---
function getGEP(gL, gV) {
  if (gL === null || gV === null || gL === undefined || gV === undefined) return null;
  if (Number(gL) > Number(gV)) return "G";
  if (Number(gL) < Number(gV)) return "P";
  return "E";
}

function formatHora(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString("es-HN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayName(u) {
  return u.nombre || u.username;
}

// --- Componente Principal ---
export default function PreviasTab() {
  const [jornadas, setJornadas] = useState([]);
  const [selectedJ, setSelectedJ] = useState(null);
  const [partidos, setPartidos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [allProns, setAllProns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedP, setSelectedP] = useState(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  useEffect(() => {
    fetchJornadas();
  }, []);

  const fetchJornadas = async () => {
    const { data } = await supabase
      .from("jornadas")
      .select("*")
      .order("created_at", { ascending: false });
    setJornadas(data || []);
  };

  const loadJornada = async (j) => {
    setLoading(true);
    setSelectedJ(j);
    setSelectedP(null); // Resetear partido al cambiar jornada

    try {
      const [{ data: pts }, { data: prons }, { data: usrs }] = await Promise.all([
        supabase.from("partidos").select("*").eq("jornada_id", j.id).order("orden"),
        supabase.from("pronosticos").select("*").eq("jornada_id", j.id),
        supabase.from("usuarios").select("*").order("username"),
      ]);

      setPartidos(pts || []);
      setAllProns(prons || []);
      setUsuarios(usrs || []);
      
      if (pts?.length > 0) setSelectedP(pts[0]);
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- Cálculos Derivados (Memorizados para rendimiento) ---
  const previaDatos = useMemo(() => {
    if (!selectedP) return [];
    return usuarios.map((u) => {
      const pron = allProns.find(
        (pr) => pr.usuario_id === u.id && pr.partido_id === selectedP.id
      );
      return {
        ...u,
        goles_local: pron?.goles_local ?? null,
        goles_visitante: pron?.goles_visitante ?? null,
        gep: pron ? getGEP(pron.goles_local, pron.goles_visitante) : null,
        hora: pron?.updated_at || pron?.created_at || null,
      };
    });
  }, [selectedP, usuarios, allProns]);

  const total = previaDatos.filter((u) => u.gep !== null).length;
  const countG = previaDatos.filter((u) => u.gep === "G").length;
  const countE = previaDatos.filter((u) => u.gep === "E").length;
  const countP = previaDatos.filter((u) => u.gep === "P").length;

  const pctG = total > 0 ? Math.round((countG / total) * 100) : 0;
  const pctE = total > 0 ? Math.round((countE / total) * 100) : 0;
  const pctP = total > 0 ? Math.round((countP / total) * 100) : 0;

  const barData = selectedP ? [
    { label: `G — ${selectedP.equipo_local}`, pct: pctG, count: countG, color: [0, 210, 140] },
    { label: "E — Empate", pct: pctE, count: countE, color: [220, 160, 20] },
    { label: `P — ${selectedP.equipo_visitante}`, pct: pctP, count: countP, color: [220, 80, 110] },
  ] : [];

  const pdfData = previaDatos.map((u) => ({
    nombre: u.nombre || u.username,
    username: u.username,
    goles_local: u.goles_local,
    goles_visitante: u.goles_visitante,
    gep: u.gep,
    hora: formatHora(u.hora),
  }));

  return (
    <div className="previas-tab">
      {/* Selector de jornada */}
      <div className="copiar-section">
        <h3 className="col-label">Selecciona una jornada</h3>
        <div className="jornada-pills">
          {jornadas.map((j) => (
            <button
              key={j.id}
              className={`jornada-pill ${selectedJ?.id === j.id ? "active" : ""}`}
              onClick={() => loadJornada(j)}
            >
              {j.nombre}
              {j.terminada && <span className="pill-done">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>Cargando...</p>
        </div>
      )}

      {selectedJ && !loading && (
        <div className="previas-layout">
          {/* Lista de partidos */}
          <div className="previas-partidos-panel">
            <h3 className="col-label" style={{ padding: "16px 16px 12px" }}>
              Partidos ({partidos.length})
            </h3>
            <div className="previas-partidos-list">
              {partidos.map((p, i) => {
                const pronCount = allProns.filter(
                  (pr) => pr.partido_id === p.id && pr.goles_local !== null
                ).length;
                return (
                  <button
                    key={p.id}
                    className={`previas-partido-item ${selectedP?.id === p.id ? "active" : ""}`}
                    onClick={() => setSelectedP(p)}
                  >
                    <span className="ppi-num">{i + 1}</span>
                    <div className="ppi-info">
                      <span className="ppi-teams">
                        {p.equipo_local} vs {p.equipo_visitante}
                      </span>
                      <span className="ppi-count">
                        {pronCount}/{usuarios.length} pronósticos
                      </span>
                    </div>
                    <span className="ppi-arrow">›</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detalle del Partido seleccionado */}
          <div className="previas-detail">
            {!selectedP ? (
              <div className="empty-state-col">
                <p>Selecciona un partido</p>
              </div>
            ) : (
              <div className="previa-content-wrapper">
                <div className="previas-detail-header">
                  <div>
                    <h3 className="previas-match-title">
                      {selectedP.equipo_local} <span className="previas-vs">vs</span>{" "}
                      {selectedP.equipo_visitante}
                    </h3>
                    <p className="dim-text">
                      {total} de {usuarios.length} participantes pronosticaron
                    </p>
                  </div>
                  <button className="download-btn" onClick={() => setPdfOpen(true)}>
                    ⬇ Exportar PDF
                  </button>
                </div>

                <PDFExportModal
                  open={pdfOpen}
                  onClose={() => setPdfOpen(false)}
                  type="previas"
                  title={`${selectedP.equipo_local} vs ${selectedP.equipo_visitante}`}
                  subtitle={`${total} de ${usuarios.length} pronósticos`}
                  jornada={selectedJ?.nombre}
                  data={pdfData}
                  extraHeader={{ barData }}
                />

                <div className="previa-card-img">
                  <div className="pci-title">
                    <span className="pci-jornada">{selectedJ.nombre}</span>
                    <h2 className="pci-match">
                      {selectedP.equipo_local} <span>vs</span> {selectedP.equipo_visitante}
                    </h2>
                  </div>

                  {/* Barras de estadísticas */}
                  <div className="pci-bars">
                    {[
                      { label: `G — ${selectedP.equipo_local}`, pct: pctG, count: countG, cls: "pci-bar-g", lcls: "pci-g" },
                      { label: "E — Empate", pct: pctE, count: countE, cls: "pci-bar-e", lcls: "pci-e" },
                      { label: `P — ${selectedP.equipo_visitante}`, pct: pctP, count: countP, cls: "pci-bar-p", lcls: "pci-p" },
                    ].map((b) => (
                      <div key={b.label} className="pci-bar-item">
                        <div className="pci-bar-labels">
                          <span className={`pci-bar-label ${b.lcls}`}>{b.label}</span>
                          <span className="pci-bar-pct">{b.pct}% ({b.count})</span>
                        </div>
                        <div className="pci-bar-track">
                          <div
                            className={`pci-bar-fill ${b.cls}`}
                            style={{ width: `${b.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tabla de pronósticos individuales */}
                  <table className="previa-table">
                    <thead>
                      <tr>
                        <th className="pvt-user">Participante</th>
                        <th className="pvt-score">Marcador</th>
                        <th className="pvt-gep">Res.</th>
                        <th className="pvt-hora">Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previaDatos.map((u) => (
                        <tr key={u.id}>
                          <td className="pvt-user-cell">
                            <div className="pvt-avatar">
                              {displayName(u).charAt(0).toUpperCase()}
                            </div>
                            <div className="pvt-names">
                              <span>{displayName(u)}</span>
                              {u.nombre && u.nombre !== u.username && (
                                <span className="pvt-username-sub">@{u.username}</span>
                              )}
                            </div>
                          </td>
                          <td className="pvt-score-cell">
                            {u.gep !== null ? (
                              <span className="pvt-marcador">
                                {u.goles_local} – {u.goles_visitante}
                              </span>
                            ) : (
                              <span className="pvt-missing">Sin pronóstico</span>
                            )}
                          </td>
                          <td className="pvt-gep-cell">
                            {u.gep && (
                              <span className={`gep-badge gep-${u.gep.toLowerCase()}`}>
                                {u.gep}
                              </span>
                            )}
                          </td>
                          <td className="pvt-hora-cell">{formatHora(u.hora)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}