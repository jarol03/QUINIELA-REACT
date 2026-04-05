import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { calcularRachas, fmtFecha } from "./rachaUtils";

export default function RachaTab() {
  const [resultados, setResultados] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [calculado,  setCalculado]  = useState(false);

  const calcular = async () => {
    setLoading(true);
    const [{ data: usrs }, { data: allPts }, { data: allProns }] = await Promise.all([
      supabase.from("usuarios").select("id, username, nombre").order("username"),
      supabase.from("partidos").select("*"),
      supabase.from("pronosticos").select("*"),
    ]);
    setResultados(calcularRachas(usrs, allPts, allProns));
    setCalculado(true);
    setLoading(false);
  };

  useEffect(() => { calcular(); }, []);

  const ganadores = resultados.filter(r => r.yaGano);

  return (
    <div className="puntos-tab">
      <div className="racha-header">
        <div>
          <p className="dim-text">
            Premio por acertar <strong>3 marcadores exactos consecutivos</strong> por fecha del partido.
            Solo cuenta la primera vez — una vez ganado, ya no compite de nuevo.
          </p>
        </div>
        <button className="res-save-btn" onClick={calcular} disabled={loading} style={{ padding: "10px 16px" }}>
          {loading ? "Calculando..." : "↻ Recalcular"}
        </button>
      </div>

      {loading && <div className="loading-state"><div className="spinner" /><p>Analizando rachas...</p></div>}

      {!loading && calculado && (
        <>
          {/* Ganadores */}
          {ganadores.length > 0 ? (
            <div className="racha-ganadores-card">
              <div className="rgc-title">🏆 Ganador{ganadores.length !== 1 ? "es" : ""} del premio</div>
              {ganadores.map(({ u, primeraRacha }) => (
                <div key={u.id}>
                  <div className="rgc-ganador">
                    <div className="rgc-avatar">{(u.nombre || u.username).charAt(0).toUpperCase()}</div>
                    <div className="rgc-info">
                      <span className="rgc-nombre">{u.nombre || u.username}</span>
                      <span className="rgc-sub">3 exactos consecutivos · ya no compite</span>
                    </div>
                    <span className="rgc-trophy">🏆</span>
                  </div>
                  <div className="rgc-detalle">
                    <span className="rgc-det-label">Su racha ganadora:</span>
                    {primeraRacha.map((p, i) => (
                      <div key={p.id} className="rgc-partido">
                        <span className="rgc-p-num">{i + 1}</span>
                        <div className="rgc-p-info">
                          <span className="rgc-p-teams">{p.equipo_local} vs {p.equipo_visitante}</span>
                          <span className="rgc-p-fecha">{fmtFecha(p.fecha_limite)}</span>
                        </div>
                        <span className="rgc-p-score">{p.goles_local_real}–{p.goles_visitante_real}</span>
                        <span className="rgc-p-badge">🎯 +3</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="racha-sin-ganador">
              <span className="racha-sg-icon">🎯</span>
              <p>Nadie ha logrado 3 exactos consecutivos aún</p>
            </div>
          )}

          {/* Tabla de todos */}
          <div className="racha-tabla">
            <div className="racha-tabla-header">
              <span className="col-label" style={{ marginBottom: 0 }}>Rachas actuales ({resultados.length})</span>
            </div>
            {resultados.map(({ u, yaGano, rachaActual }) => (
              <RachaRow key={u.id} u={u} yaGano={yaGano} rachaActual={rachaActual} showYo={false} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Componente compartido de fila — reutilizado también en el panel de usuario
export function RachaRow({ u, yaGano, rachaActual, yoId, showYo = true }) {
  const esMio = showYo && u.id === yoId;
  return (
    <div className={`racha-row ${yaGano ? "racha-row-ganador" : rachaActual >= 2 ? "racha-row-cerca" : ""} ${esMio ? "racha-row-mio" : ""}`}>
      <div className="racha-avatar">
        {(u.nombre || u.username).charAt(0).toUpperCase()}
      </div>
      <div className="racha-info">
        <span className="racha-nombre">
          {u.nombre || u.username}
          {esMio && <span className="racha-yo"> (tú)</span>}
        </span>
        <span className="racha-sub">
          {yaGano
            ? "🏆 Premio ganado · ya no compite"
            : rachaActual >= 2
              ? `🔥 ${rachaActual} exacto${rachaActual !== 1 ? "s" : ""} seguido${rachaActual !== 1 ? "s" : ""} — ¡cerca!`
              : rachaActual === 1
                ? "⚡ 1 exacto seguido"
                : "Sin racha activa"}
        </span>
      </div>
      <div className="racha-dots">
        {[0, 1, 2].map(i => (
          <span key={i} className={`racha-dot ${
            yaGano          ? "racha-dot-ganador" :
            i < rachaActual ? "racha-dot-on"      : "racha-dot-off"
          }`} />
        ))}
      </div>
    </div>
  );
}