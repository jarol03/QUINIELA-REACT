import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

function calcPuntos(pron, partido) {
  if (!pron || pron.goles_local == null) return null;
  if (partido.goles_local_real == null) return null;
  const gl = Number(pron.goles_local),  gv = Number(pron.goles_visitante);
  const rl = Number(partido.goles_local_real), rv = Number(partido.goles_visitante_real);
  if (gl === rl && gv === rv) return 3;
  const rp = gl > gv ? "L" : gl < gv ? "V" : "E";
  const rr = rl > rv ? "L" : rl < rv ? "V" : "E";
  return rp === rr ? 1 : 0;
}

function fmtFecha(iso) {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleString("es-HN", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

// Detecta la primera racha de 3 exactos consecutivos para un usuario.
// Recibe los partidos CON resultado, ordenados por fecha_limite ASC,
// y el mapa de pronósticos del usuario.
function detectarRacha(partidosOrdenados, pronsMap) {
  let racha = [];

  for (const p of partidosOrdenados) {
    const pron = pronsMap[p.id];
    const pts  = calcPuntos(pron, p);

    if (pts === 3) {
      racha.push(p);
      if (racha.length >= 3) {
        // Devuelve los 3 partidos de la primera racha
        return racha.slice(0, 3);
      }
    } else {
      // Cualquier no-exacto rompe la racha
      racha = [];
    }
  }
  return null; // no alcanzó 3 seguidos
}

export default function RachaTab() {
  const [resultados, setResultados] = useState([]); // [{usuario, racha:[p1,p2,p3] | null, rachaActual: n}]
  const [loading,    setLoading]    = useState(false);
  const [calculado,  setCalculado]  = useState(false);

  const calcular = async () => {
    setLoading(true);

    const [{ data: usrs }, { data: allPts }, { data: allProns }] = await Promise.all([
      supabase.from("usuarios").select("id, username, nombre").order("username"),
      supabase.from("partidos").select("*"),
      supabase.from("pronosticos").select("*"),
    ]);

    // Solo partidos con resultado real, ordenados por fecha_limite ASC
    // Los que no tienen fecha_limite van al final (orden de inserción)
    const conRes = (allPts || [])
      .filter(p => p.goles_local_real != null)
      .sort((a, b) => {
        if (!a.fecha_limite && !b.fecha_limite) return 0;
        if (!a.fecha_limite) return 1;
        if (!b.fecha_limite) return -1;
        return new Date(a.fecha_limite) - new Date(b.fecha_limite);
      });

    const data = (usrs || []).map(u => {
      // Mapa partidoId -> pronóstico de este usuario
      const pronsMap = {};
      (allProns || [])
        .filter(pr => pr.usuario_id === u.id)
        .forEach(pr => { pronsMap[pr.partido_id] = pr; });

      const primeraRacha = detectarRacha(conRes, pronsMap);

      // Racha actual (desde el último partido sin romper)
      let rachaActual = 0;
      for (let i = conRes.length - 1; i >= 0; i--) {
        const pts = calcPuntos(pronsMap[conRes[i].id], conRes[i]);
        if (pts === 3) rachaActual++;
        else break;
      }

      return { u, primeraRacha, rachaActual };
    });

    // Ordenar: primero los que tienen racha de 3, luego por racha actual desc
    data.sort((a, b) => {
      const aT = a.primeraRacha ? 1 : 0;
      const bT = b.primeraRacha ? 1 : 0;
      if (bT !== aT) return bT - aT;
      return b.rachaActual - a.rachaActual;
    });

    setResultados(data);
    setCalculado(true);
    setLoading(false);
  };

  useEffect(() => { calcular(); }, []);

  const ganadores = resultados.filter(r => r.primeraRacha);

  return (
    <div className="puntos-tab">
      <div className="racha-header">
        <div>
          <p className="dim-text">
            Premio por acertar <strong>3 marcadores exactos consecutivos</strong>, ordenados por fecha del partido.
            Cuenta la primera vez que ocurre, sin importar la jornada.
          </p>
        </div>
        <button className="res-save-btn" onClick={calcular} disabled={loading} style={{ padding: "10px 16px" }}>
          {loading ? "Calculando..." : "↻ Recalcular"}
        </button>
      </div>

      {loading && <div className="loading-state"><div className="spinner" /><p>Analizando rachas...</p></div>}

      {!loading && calculado && (
        <>
          {/* Ganadores del premio */}
          {ganadores.length > 0 ? (
            <div className="racha-ganadores-card">
              <div className="rgc-title">🏆 Ganador{ganadores.length !== 1 ? "es" : ""} del premio</div>
              {ganadores.map(({ u, primeraRacha }) => (
                <div key={u.id} className="rgc-ganador">
                  <div className="rgc-avatar">{(u.nombre || u.username).charAt(0).toUpperCase()}</div>
                  <div className="rgc-info">
                    <span className="rgc-nombre">{u.nombre || u.username}</span>
                    <span className="rgc-sub">3 exactos consecutivos</span>
                  </div>
                  <span className="rgc-trophy">🏆</span>
                </div>
              ))}

              {/* Detalle de los 3 partidos */}
              {ganadores.map(({ u, primeraRacha }) => (
                <div key={`det-${u.id}`} className="rgc-detalle">
                  <span className="rgc-det-label">Racha de {u.nombre || u.username}:</span>
                  {primeraRacha.map((p, i) => (
                    <div key={p.id} className="rgc-partido">
                      <span className="rgc-p-num">{i + 1}</span>
                      <div className="rgc-p-info">
                        <span className="rgc-p-teams">{p.equipo_local} vs {p.equipo_visitante}</span>
                        <span className="rgc-p-fecha">{fmtFecha(p.fecha_limite)}</span>
                      </div>
                      <span className="rgc-p-score">
                        {p.goles_local_real}–{p.goles_visitante_real}
                      </span>
                      <span className="rgc-p-badge">🎯 +3</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="racha-sin-ganador">
              <span className="racha-sg-icon">🎯</span>
              <p>Nadie ha logrado 3 exactos consecutivos aún</p>
            </div>
          )}

          {/* Tabla de todos los participantes */}
          <div className="racha-tabla">
            <div className="racha-tabla-header">
              <span className="col-label" style={{ marginBottom: 0 }}>
                Rachas actuales ({resultados.length})
              </span>
            </div>

            {resultados.map(({ u, primeraRacha, rachaActual }) => (
              <div key={u.id} className={`racha-row ${primeraRacha ? "racha-row-ganador" : rachaActual >= 2 ? "racha-row-cerca" : ""}`}>
                <div className="racha-avatar">
                  {(u.nombre || u.username).charAt(0).toUpperCase()}
                </div>
                <div className="racha-info">
                  <span className="racha-nombre">{u.nombre || u.username}</span>
                  <span className="racha-sub">
                    {primeraRacha
                      ? "✅ Premio ganado"
                      : rachaActual > 0
                        ? `🔥 ${rachaActual} exacto${rachaActual !== 1 ? "s" : ""} seguido${rachaActual !== 1 ? "s" : ""} ahora`
                        : "Sin racha activa"}
                  </span>
                </div>
                <div className="racha-dots">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className={`racha-dot ${
                        primeraRacha
                          ? "racha-dot-ganador"
                          : i < rachaActual
                            ? "racha-dot-on"
                            : "racha-dot-off"
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}