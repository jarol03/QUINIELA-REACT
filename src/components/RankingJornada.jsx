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

function addPos(arr) {
  const result = [];
  let posActual = 1;
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) { result.push({ ...arr[i], pos: 1 }); }
    else {
      const esEmpate = arr[i].pts === arr[i - 1].pts;
      if (!esEmpate) posActual = result[i - 1].pos + 1;
      result.push({ ...arr[i], pos: posActual });
    }
  }
  return result;
}

function medalEmoji(pos, pts) {
  if (pts <= 0) return pos;
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return pos;
}

export default function RankingJornada({ user }) {
  const [jornadas,    setJornadas]    = useState([]);
  const [selectedJ,   setSelectedJ]   = useState(null);
  const [tabla,       setTabla]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [hayPendientes, setHayPendientes] = useState(false);

  useEffect(() => { fetchJornadas(); }, []);

  const fetchJornadas = async () => {
    setLoadingList(true);
    const { data } = await supabase
      .from("jornadas").select("*")
      .order("created_at", { ascending: false });
    setJornadas(data || []);
    setLoadingList(false);
  };

  const loadJornada = async (j) => {
    setLoading(true);
    setSelectedJ(j);
    setTabla([]);

    const [{ data: pts }, { data: prons }, { data: usrs }] = await Promise.all([
      supabase.from("partidos").select("*").eq("jornada_id", j.id).order("orden"),
      supabase.from("pronosticos").select("*").eq("jornada_id", j.id),
      supabase.from("usuarios").select("id, username, nombre").order("username"),
    ]);

    const partidos   = pts  || [];
    const allProns   = prons || [];
    const usuarios   = usrs  || [];

    // Partidos CON resultado y SIN resultado en esta jornada
    const conRes  = partidos.filter(p => p.goles_local_real != null);
    const sinRes  = partidos.filter(p => p.goles_local_real == null);
    setHayPendientes(sinRes.length > 0);

    // Puntos máximos adicionales por usuario
    // = 3 × partidos sin resultado donde el usuario tiene pronóstico
    const maxExtra = (u) =>
      sinRes.reduce((acc, p) => {
        const pron = allProns.find(pr => pr.usuario_id === u.id && pr.partido_id === p.id);
        return acc + (pron?.goles_local != null ? 3 : 0);
      }, 0);

    // Calcular pts actuales
    const tablaBase = usuarios.map(u => {
      let pts = 0;
      conRes.forEach(p => {
        const pron   = allProns.find(pr => pr.usuario_id === u.id && pr.partido_id === p.id);
        const puntos = calcPuntos(pron, p);
        if (puntos === 3) pts += 3;
        else if (puntos === 1) pts += 1;
      });
      return { ...u, pts, ptsMax: pts + maxExtra(u) };
    }).sort((a, b) => b.pts - a.pts);

    const tablaConPos = addPos(tablaBase);

    // Umbral del top 3: mínimo de pts del 3er lugar actual
    // (si hay empates en pos 3 tomamos el pts de ese grupo)
    const top3Pts = tablaConPos.filter(u => u.pos <= 3).map(u => u.pts);
    const threshold = top3Pts.length > 0 ? Math.min(...top3Pts) : 0;

    // Asignar chances
    const tablaFinal = tablaConPos.map(u => {
      if (u.pos <= 3 && u.pts > 0) return { ...u, chances: "zona" };    // ya está
      if (sinRes.length === 0)      return { ...u, chances: "sin" };     // jornada cerrada
      if (u.ptsMax >= threshold)    return { ...u, chances: "con" };     // puede llegar
      return { ...u, chances: "sin" };
    });

    setTabla(tablaFinal);
    setLoading(false);
  };

  const tieneResultados = tabla.some(u => u.pts > 0);

  return (
    <div style={{ marginTop: -16 }}>
      {/* Selector de jornada */}
      <div className="rj-jornadas-list">
        {loadingList && <div className="loading-state"><div className="spinner" /></div>}
        {!loadingList && jornadas.map((j, idx) => (
          <button
            key={j.id}
            className={`rj-jornada-pill ${selectedJ?.id === j.id ? "active" : ""}`}
            onClick={() => loadJornada(j)}
            style={{ animationDelay: `${idx * 0.04}s` }}
          >
            {j.nombre}
            {j.terminada && <span className="rj-pill-done">✓</span>}
          </button>
        ))}
      </div>

      {loading && <div className="loading-state"><div className="spinner" /></div>}

      {selectedJ && !loading && tabla.length > 0 && (
        <>
          {/* Leyenda — solo cuando hay partidos pendientes */}
          {hayPendientes && tieneResultados && (
            <div className="rj-leyenda">
              <div className="rj-ley-item"><span className="rj-dot rj-dot-zona" />Zona dinero (top 3)</div>
              <div className="rj-ley-item"><span className="rj-dot rj-dot-con" />Con posibilidades</div>
              <div className="rj-ley-item"><span className="rj-dot rj-dot-sin" />Sin posibilidades</div>
            </div>
          )}

          {!tieneResultados && (
            <div className="empty-state" style={{ marginTop: 8, marginBottom: 16 }}>
              <span className="empty-icon">⏳</span>
              <p>Sin resultados aún en esta jornada</p>
            </div>
          )}

          {/* Lista — mismo diseño que ranking global */}
          <div className="ranking-list">
            {tabla.map(u => {
              const esMio   = u.id === user.id;
              const chances = tieneResultados ? u.chances : null;
              return (
                <div
                  key={u.id}
                  className={`ranking-row
                    ${esMio ? "ranking-row-me" : ""}
                    ${chances === "zona" ? "rj-zona" : ""}
                    ${chances === "con"  ? "rj-con"  : ""}
                    ${chances === "sin"  ? "rj-sin"  : ""}
                  `}
                >
                  <div className="rr-pos">{medalEmoji(u.pos, u.pts)}</div>
                  <div className={`rr-avatar ${chances === "zona" ? "rr-avatar-zona" : chances === "sin" ? "rr-avatar-sin" : ""}`}>
                    {(u.nombre || u.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="rr-info">
                    <span className="rr-nombre">
                      {u.nombre || u.username}
                      {esMio && <span className="rr-yo"> (tú)</span>}
                    </span>
                    {u.nombre && u.nombre !== u.username && (
                      <span className="rr-username">@{u.username}</span>
                    )}
                  </div>
                  <div className="rr-pts">
                    <span className="rr-pts-num">{u.pts}</span>
                    <span className="rr-pts-label">pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}