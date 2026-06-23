import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { calcularRachas, fetchAllPaginated, fmtFecha } from "./rachaUtils";
import { RachaRow } from "./RachaTab";

export default function RachaView({ user }) {
  const [resultados,  setResultados]  = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
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

    // Fetch pronósticos para partidos SIN resultado (para preview de "casi racha")
    const sinResultadoIds = (allPts || [])
      .filter(p => p.goles_local_real == null && p.fecha_limite)
      .map(p => p.id);
    let upcomingProns = [];
    if (sinResultadoIds.length > 0) {
      upcomingProns = await fetchAllPaginated((from, to) => supabase.from("pronosticos").select("*").in("partido_id", sinResultadoIds).range(from, to));
    }

    setResultados(calcularRachas(usrs, allPts, allProns, upcomingProns, config));
    setLoading(false);
  };

  const miData     = resultados.find(r => r.u.id === user.id);
  const ganadores  = resultados.filter(r => r.yaGano && r.esGanadorOficial);
  const ganadoresFuera = resultados.filter(r => r.yaGano && !r.esGanadorOficial);
  const misRacha   = miData?.rachaActual ?? 0;
  const yoGane     = miData?.yaGano ?? false;
  const soyOficial = miData?.esGanadorOficial ?? false;

  return (
    <div className="user-tab-content">
      <div className="user-section-header">
        <h2 className="user-section-title">🔥 Racha</h2>
        <p className="user-section-sub">Premio por 3 marcadores exactos consecutivos</p>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : (
        <>
          {/* Mi estado personal */}
          <div className={`racha-hero ${yoGane && soyOficial ? "racha-hero-ganador" : yoGane && !soyOficial ? "racha-hero-fuera" : misRacha >= 2 ? "racha-hero-cerca" : ""}`}>
            {yoGane && soyOficial ? (
              <>
                <div className="rh-icon">🏆</div>
                <div className="rh-info">
                  <span className="rh-titulo">¡Ganaste el premio!</span>
                  <span className="rh-sub">Fuiste el primero en lograr 3 exactos seguidos</span>
                </div>
              </>
            ) : yoGane && !soyOficial ? (
              <>
                <div className="rh-icon">🎯</div>
                <div className="rh-info">
                  <span className="rh-titulo">Lograste 3 exactos seguidos</span>
                  <span className="rh-sub">Pero el premio ya estaba cerrado · sin recompensa</span>
                </div>
              </>
            ) : (
              <>
                <div className="rh-dots-big">
                  {[0, 1, 2].map(i => (
                    <span key={i} className={`rh-dot ${i < misRacha ? "rh-dot-on" : "rh-dot-off"}`} />
                  ))}
                </div>
                <div className="rh-info">
                  <span className="rh-titulo">
                    {misRacha === 0 && "Sin racha activa"}
                    {misRacha === 1 && "⚡ 1 exacto seguido"}
                    {misRacha === 2 && "🔥 ¡2 exactos seguidos! Uno más..."}
                  </span>
                  <span className="rh-sub">
                    {misRacha === 0 && "Acerta el próximo marcador para empezar una racha"}
                    {misRacha === 1 && "Sigue así, necesitas 2 más para ganar"}
                    {misRacha === 2 && "¡El siguiente exacto te da el premio!"}
                  </span>
                </div>
              </>

            )}
            {misRacha === 2 && miData?.proximoExacto && (
              <div className="rh-preview">
                <span className="rh-preview-label">⏳ Pendiente de resultado:</span>
                <span className="rh-preview-match">
                  {miData.proximoExacto.partido.equipo_local} vs {miData.proximoExacto.partido.equipo_visitante}
                </span>
                <span className="rh-preview-score">
                  Tu pronóstico: {miData.proximoExacto.pronostico.goles_local}–{miData.proximoExacto.pronostico.goles_visitante}
                </span>
              </div>
            )}
          </div>

          {/* Ganadores oficiales */}
          {ganadores.length > 0 && (
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

          {/* Lista completa */}
          <div className="racha-tabla">
            <div className="racha-tabla-header">
              <span className="col-label" style={{ marginBottom: 0 }}>Rachas actuales</span>
            </div>
            {resultados.map(({ u, yaGano, esGanadorOficial, rachaActual, proximoExacto }) => (
              <RachaRow key={u.id} u={u} yaGano={yaGano} esGanadorOficial={esGanadorOficial} rachaActual={rachaActual} proximoExacto={proximoExacto} yoId={user.id} showYo />
            ))}
          </div>
        </>
      )}
    </div>
  );
}