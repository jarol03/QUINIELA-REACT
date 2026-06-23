import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { calcularRachas, fmtFecha, fetchAllPaginated, ordenarPartidos } from "./rachaUtils";

export default function RachaTab() {
  const [resultados, setResultados] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [calculado,  setCalculado]  = useState(false);
  const [rachaConfig, setRachaConfig] = useState({ cerrada: false, ganadores_oficiales_ids: [] });
  const [saving,     setSaving]     = useState(false);

  const calcular = async () => {
    setLoading(true);
    const [
      { data: usrs },
      allPts,
      allProns,
      { data: configData }
    ] = await Promise.all([
      supabase.from("usuarios").select("id, username, nombre").order("username"),
      fetchAllPaginated((from, to) => supabase.from("partidos").select("*").range(from, to)),
      fetchAllPaginated((from, to) => supabase.from("racha_pronosticos_view").select("*").range(from, to)),
      supabase.from("configuracion").select("valor").eq("clave", "racha_cerrada").maybeSingle()
    ]);

    const config = configData?.valor || { cerrada: false, ganadores_oficiales_ids: [] };
    setRachaConfig(config);

    // Fetch pronósticos para partidos SIN resultado (para el preview de "casi racha")
    const sinResultadoIds = (allPts || [])
      .filter(p => p.goles_local_real == null && p.fecha_limite)
      .map(p => p.id);
    let upcomingProns = [];
    if (sinResultadoIds.length > 0) {
      upcomingProns = await fetchAllPaginated((from, to) => supabase.from("pronosticos").select("*").in("partido_id", sinResultadoIds).range(from, to));
    }

    const res = calcularRachas(usrs, allPts, allProns, upcomingProns, config);
    setResultados(res);
    
    // DEBUG DE TIEMPO PASADO
    const conRes = ordenarPartidos(allPts);
    if (conRes.length >= 2) {
      const ultimoEliminado = conRes[conRes.length - 1];
      const penultimoEliminado = conRes[conRes.length - 2];
      
      const calcMenos1 = calcularRachas(usrs, conRes.slice(0, -1), allProns);
      const calcMenos2 = calcularRachas(usrs, conRes.slice(0, -2), allProns);
      
      console.log("=== DEBUG TIEMPO PASADO ===");
      console.log(`1. Omitiendo el ÚLTIMO partido (${ultimoEliminado.equipo_local} vs ${ultimoEliminado.equipo_visitante}):`);
      const vivosMenos1 = calcMenos1.filter(r => r.rachaActual > 0 || r.yaGano);
      console.log("   ➤ Usuarios con racha viva:", vivosMenos1.length > 0 ? vivosMenos1.map(r => `${r.u.nombre || r.u.username} (Racha: ${r.rachaActual})`).join(", ") : "Ninguno");

      console.log(`2. Omitiendo los DOS últimos partidos (Puebla y ${penultimoEliminado.equipo_local} vs ${penultimoEliminado.equipo_visitante}):`);
      const vivosMenos2 = calcMenos2.filter(r => r.rachaActual > 0 || r.yaGano);
      console.log("   ➤ Usuarios con racha viva:", vivosMenos2.length > 0 ? vivosMenos2.map(r => `${r.u.nombre || r.u.username} (Racha: ${r.rachaActual})`).join(", ") : "Ninguno");
    }

    console.log("=== DEBUG RACHAS ===");
    console.log("Partidos con resultado (ordenados):", res.conResDebug);
    console.log("Estado de rachas por usuario:", res);
    console.log("====================");
    setCalculado(true);
    setLoading(false);
  };

  useEffect(() => { calcular(); }, []);

  const ganadores      = resultados.filter(r => r.yaGano && r.esGanadorOficial);
  const ganadoresFuera = resultados.filter(r => r.yaGano && !r.esGanadorOficial);

  const cerrarRacha = async () => {
    setSaving(true);
    const ids = ganadores.map(g => g.u.id);
    const { error } = await supabase
      .from("configuracion")
      .upsert({ clave: "racha_cerrada", valor: { cerrada: true, ganadores_oficiales_ids: ids } });
    if (!error) {
      setRachaConfig({ cerrada: true, ganadores_oficiales_ids: ids });
      calcular();
    }
    setSaving(false);
  };

  const abrirRacha = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("configuracion")
      .upsert({ clave: "racha_cerrada", valor: { cerrada: false, ganadores_oficiales_ids: rachaConfig.ganadores_oficiales_ids } });
    if (!error) {
      setRachaConfig({ cerrada: false, ganadores_oficiales_ids: rachaConfig.ganadores_oficiales_ids });
      calcular();
    }
    setSaving(false);
  };

  return (
      <div className="puntos-tab">
      <div className="racha-header">
        <div>
          <p className="dim-text">
            Premio por acertar <strong>3 marcadores exactos consecutivos</strong> por fecha del partido.
            Solo cuenta la primera vez — una vez ganado, ya no compite de nuevo.
          </p>
          {rachaConfig.cerrada && (
            <p className="dim-text" style={{ marginTop: 6, color: "var(--gold)" }}>
              🛑 Racha cerrada · {ganadores.length} ganador{ganadores.length !== 1 ? "es" : ""} oficial{ganadores.length !== 1 ? "es" : ""} con premio
            </p>
          )}
        </div>
        <div style={{display: "flex", gap: "8px", flexWrap: "wrap"}}>
          <button className="res-save-btn" onClick={calcular} disabled={loading} style={{ padding: "10px 16px" }}>
            {loading ? "Calculando..." : "↻ Recalcular"}
          </button>
          {rachaConfig.cerrada ? (
            <button className="res-save-btn" onClick={abrirRacha} disabled={saving} style={{ padding: "10px 16px", background: "rgba(255,107,138,0.15)", borderColor: "rgba(255,107,138,0.4)", color: "var(--danger)" }}>
              {saving ? "Guardando..." : "🔓 Reabrir racha"}
            </button>
          ) : (
            <button className="res-save-btn" onClick={cerrarRacha} disabled={saving || ganadores.length === 0} style={{ padding: "10px 16px", background: "rgba(251,191,36,0.15)", borderColor: "rgba(251,191,36,0.4)", color: "var(--gold)" }}>
              {saving ? "Guardando..." : "🔒 Cerrar racha"}
            </button>
          )}
        </div>
      </div>

      {loading && <div className="loading-state"><div className="spinner" /><p>Analizando rachas...</p></div>}

      {!loading && calculado && (
        <>
          {/* Ganadores oficiales */}
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

          {/* Ganadores fuera del premio (post-cierre) */}
          {ganadoresFuera.length > 0 && (
            <div className="racha-fuera-card">
              <div className="rfc-title">🎯 Lograron 3 exactos pero fuera del premio</div>
              {ganadoresFuera.map(({ u, primeraRacha }) => (
                <div key={u.id}>
                  <div className="rfc-ganador">
                    <div className="rfc-avatar">{(u.nombre || u.username).charAt(0).toUpperCase()}</div>
                    <div className="rfc-info">
                      <span className="rfc-nombre">{u.nombre || u.username}</span>
                      <span className="rfc-sub">3 exactos consecutivos · sin premio</span>
                    </div>
                    <span className="rfc-no-premio">🚫</span>
                  </div>
                  <div className="rfc-detalle">
                    <span className="rfc-det-label">Su racha ganadora:</span>
                    {primeraRacha.map((p, i) => (
                      <div key={p.id} className="rfc-partido">
                        <span className="rfc-p-num">{i + 1}</span>
                        <div className="rfc-p-info">
                          <span className="rfc-p-teams">{p.equipo_local} vs {p.equipo_visitante}</span>
                          <span className="rfc-p-fecha">{fmtFecha(p.fecha_limite)}</span>
                        </div>
                        <span className="rfc-p-score">{p.goles_local_real}–{p.goles_visitante_real}</span>
                        <span className="rfc-p-badge">🎯 +3</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tabla de todos */}
          <div className="racha-tabla">
            <div className="racha-tabla-header">
              <span className="col-label" style={{ marginBottom: 0 }}>Rachas actuales ({resultados.length})</span>
            </div>
            {resultados.map(({ u, yaGano, esGanadorOficial, rachaActual, proximoExacto }) => (
              <RachaRow key={u.id} u={u} yaGano={yaGano} esGanadorOficial={esGanadorOficial} rachaActual={rachaActual} proximoExacto={proximoExacto} showYo={false} />
            ))}
          </div>

        </>
      )}
    </div>
  );
}

// Componente compartido de fila — reutilizado también en el panel de usuario
export function RachaRow({ u, yaGano, esGanadorOficial = true, rachaActual, proximoExacto, yoId, showYo = true }) {
  const esMio = showYo && u.id === yoId;
  const estiloGanador = yaGano ? (esGanadorOficial ? "racha-row-ganador" : "racha-row-fuera") : "";
  return (
    <div className={`racha-row ${estiloGanador} ${!yaGano && rachaActual >= 2 ? "racha-row-cerca" : ""} ${esMio ? "racha-row-mio" : ""}`}>
      <div className={`racha-avatar ${yaGano && !esGanadorOficial ? "racha-avatar-fuera" : ""}`}>
        {(u.nombre || u.username).charAt(0).toUpperCase()}
      </div>
      <div className="racha-info">
        <span className="racha-nombre">
          {u.nombre || u.username}
          {esMio && <span className="racha-yo"> (tú)</span>}
        </span>
        <span className="racha-sub">
          {yaGano && esGanadorOficial && "🏆 Premio ganado · ya no compite"}
          {yaGano && !esGanadorOficial && "🎯 3 exactos · fuera del premio"}
          {!yaGano && rachaActual >= 2 && `🔥 ${rachaActual} exacto${rachaActual !== 1 ? "s" : ""} seguido${rachaActual !== 1 ? "s" : ""} — ¡cerca!`}
          {!yaGano && rachaActual === 1 && "⚡ 1 exacto seguido"}
          {!yaGano && rachaActual < 1 && "Sin racha activa"}
        </span>
        {rachaActual >= 2 && proximoExacto && (
          <span className="racha-proximo">
            ⏳ {proximoExacto.partido.equipo_local} vs {proximoExacto.partido.equipo_visitante}: {proximoExacto.pronostico.goles_local}–{proximoExacto.pronostico.goles_visitante}
          </span>
        )}
      </div>
      <div className="racha-dots">
        {[0, 1, 2].map(i => (
          <span key={i} className={`racha-dot ${
            yaGano && esGanadorOficial ? "racha-dot-ganador" :
            yaGano && !esGanadorOficial ? "racha-dot-fuera" :
            i < rachaActual ? "racha-dot-on"      : "racha-dot-off"
          }`} />
        ))}
      </div>
    </div>
  );
}