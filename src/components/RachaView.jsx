import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { calcularRachas, fetchAllPaginated } from "./rachaUtils";
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
      allProns
    ] = await Promise.all([
      supabase.from("usuarios").select("id, username, nombre").order("username"),
      fetchAllPaginated((from, to) => supabase.from("partidos").select("*").range(from, to)),
      fetchAllPaginated((from, to) => supabase.from("racha_pronosticos_view").select("*").range(from, to))
    ]);
    setResultados(calcularRachas(usrs, allPts, allProns));
    setLoading(false);
  };

  const miData     = resultados.find(r => r.u.id === user.id);
  const ganadores  = resultados.filter(r => r.yaGano);
  const misRacha   = miData?.rachaActual ?? 0;
  const yoGane     = miData?.yaGano ?? false;

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
          <div className={`racha-hero ${yoGane ? "racha-hero-ganador" : misRacha >= 2 ? "racha-hero-cerca" : ""}`}>
            {yoGane ? (
              <>
                <div className="rh-icon">🏆</div>
                <div className="rh-info">
                  <span className="rh-titulo">¡Ganaste el premio!</span>
                  <span className="rh-sub">Fuiste el primero en lograr 3 exactos seguidos</span>
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
                    {misRacha === 2 && "🔥 ¡2 exactos seguidos! Un más..."}
                  </span>
                  <span className="rh-sub">
                    {misRacha === 0 && "Acerta el próximo marcador para empezar una racha"}
                    {misRacha === 1 && "Sigue así, necesitas 2 más para ganar"}
                    {misRacha === 2 && "¡El siguiente exacto te da el premio!"}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Ganadores */}
          {ganadores.length > 0 && (
            <div className="racha-ganadores-user">
              <span className="rgu-label">🏆 Premio ganado por</span>
              {ganadores.map(({ u }) => (
                <div key={u.id} className="rgu-row">
                  <div className="rgu-avatar">{(u.nombre || u.username).charAt(0).toUpperCase()}</div>
                  <span className="rgu-nombre">{u.nombre || u.username}</span>
                  <span className="rgu-badge">🏆</span>
                </div>
              ))}
            </div>
          )}

          {/* Lista completa */}
          <div className="racha-tabla">
            <div className="racha-tabla-header">
              <span className="col-label" style={{ marginBottom: 0 }}>Rachas actuales</span>
            </div>
            {resultados.map(({ u, yaGano, rachaActual }) => (
              <RachaRow key={u.id} u={u} yaGano={yaGano} rachaActual={rachaActual} yoId={user.id} showYo />
            ))}
          </div>
        </>
      )}
    </div>
  );
}