// ── Utilidades compartidas de racha ──────────────────────────────────────
//
// REGLAS DE SIMULTÁNEOS:
// Partidos con el mismo fecha_limite se tratan como un bloque.
//   · Si acierta AL MENOS UNO exacto del bloque → racha +1 (beneficio)
//   · Si acierta TODOS exactos del bloque → racha +N (uno por partido)
//   · Si no acierta ninguno del bloque → racha se rompe (reset a 0)
//   · Si algún partido no tiene pronóstico → se ignora, no rompe

export async function fetchAllPaginated(queryFactory, pageSize = 1000) {
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

export function calcPuntos(pron, partido) {
  // Si el partido NO tiene resultado aún → null (ignorar en racha)
  if (partido.goles_local_real == null) return null;

  // Si hay resultado pero NO hay pronóstico → 0 (rompe racha)
  if (!pron || pron.goles_local == null) return 0;

  const gl = Number(pron.goles_local),  gv = Number(pron.goles_visitante);
  const rl = Number(partido.goles_local_real), rv = Number(partido.goles_visitante_real);
  if (gl === rl && gv === rv) return 3;
  const rp = gl > gv ? "L" : gl < gv ? "V" : "E";
  const rr = rl > rv ? "L" : rl < rv ? "V" : "E";
  return rp === rr ? 1 : 0;
}

export function fmtFecha(iso) {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleString("es-HN", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

// Ordena partidos con resultado por fecha_limite ASC (sin fecha van al final)
export function ordenarPartidos(partidos) {
  return [...partidos]
    .filter(p => p.goles_local_real != null)
    .sort((a, b) => {
      if (!a.fecha_limite && !b.fecha_limite) return 0;
      if (!a.fecha_limite) return 1;
      if (!b.fecha_limite) return -1;
      return new Date(a.fecha_limite) - new Date(b.fecha_limite);
    });
}

// Agrupa partidos por fecha_limite (mismo timestamp = simultáneos).
// Partidos sin fecha_limite van cada uno en su propio grupo.
function agruparPorFecha(partidos) {
  const grupos = [];
  const mapa   = {};
  for (const p of partidos) {
    const key = p.fecha_limite
      ? new Date(p.fecha_limite).toISOString()  // normalizar a ISO exacto
      : `individual_${p.id}`;
    if (!mapa[key]) { mapa[key] = []; grupos.push(mapa[key]); }
    mapa[key].push(p);
  }
  return grupos;
}

// Evalúa un bloque de partidos (simultáneos o individual).
// Devuelve:
//   número > 0  → cuántos exactos suman al contador de racha
//   -1          → ningún exacto con resultado → rompe racha
//    0          → todos sin resultado todavía → neutro, ignorar
function evaluarBloque(bloque, pronsMap) {
  let exactos        = 0;
  let conResultado   = 0;
  const partidosExactos = [];

  for (const p of bloque) {
    const pts = calcPuntos(pronsMap[p.id], p);
    if (pts === null) continue;   // sin resultado aún → ignorar este partido
    conResultado++;
    if (pts === 3) { exactos++; partidosExactos.push(p); }
  }

  if (conResultado === 0) return { suma: 0, partidos: [] };   // neutro
  if (exactos === 0)      return { suma: -1, partidos: [] };  // rompe
  return { suma: exactos, partidos: partidosExactos };        // suma N
}

// Detecta la PRIMERA racha de 3+ exactos consecutivos respetando simultáneos.
// Una vez encontrada, para — no busca rachas posteriores.
export function detectarPrimeraRacha(partidosOrdenados, pronsMap) {
  const grupos = agruparPorFecha(partidosOrdenados);
  let acumulado    = 0;
  let rachaPartidos = [];

  for (const grupo of grupos) {
    const { suma, partidos } = evaluarBloque(grupo, pronsMap);

    if (suma === -1) {
      // Rompe racha
      acumulado     = 0;
      rachaPartidos = [];
    } else if (suma === 0) {
      // Neutro — no hace nada
    } else {
      acumulado    += suma;
      rachaPartidos = [...rachaPartidos, ...partidos];
      if (acumulado >= 3) {
        return rachaPartidos.slice(0, 3);
      }
    }
  }
  return null;
}

// Racha ACTUAL desde el último bloque hacia atrás.
// Si el usuario ya ganó el premio → 0 (ya no compite).
export function calcRachaActual(partidosOrdenados, pronsMap, yaGano) {
  if (yaGano) return 0;

  const grupos = agruparPorFecha(partidosOrdenados);
  let racha = 0;

  for (let i = grupos.length - 1; i >= 0; i--) {
    const { suma } = evaluarBloque(grupos[i], pronsMap);
    if (suma === -1) break;    // rompe — detenemos
    if (suma === 0)  continue; // neutro — seguir mirando hacia atrás
    racha += suma;             // sumar exactos del bloque
  }
  return racha;
}

// Calcula el estado completo para todos los usuarios.
export function calcularRachas(usrs, allPts, allProns) {
  const conRes = ordenarPartidos(allPts || []);

  // OPTIMIZACIÓN O(N): Agrupar todos los pronósticos por usuario de una sola pasada
  // Esto evita hacer un .filter() de toda la lista por cada usuario.
  const userPronsCache = {};
  (allProns || []).forEach(pr => {
    if (!userPronsCache[pr.usuario_id]) {
      userPronsCache[pr.usuario_id] = {};
    }
    const userMap = userPronsCache[pr.usuario_id];
    const prev = userMap[pr.partido_id];
    
    // Guardar solo el más reciente (aunque racha_pronosticos_view ya limpia duplicados)
    if (!prev || new Date(pr.created_at || 0).getTime() >= new Date(prev.created_at || 0).getTime()) {
      userMap[pr.partido_id] = pr; 
    }
  });

  const data = (usrs || []).map(u => {
    const pronsMap = userPronsCache[u.id] || {};

    const primeraRacha = detectarPrimeraRacha(conRes, pronsMap);
    const yaGano       = !!primeraRacha;
    const rachaActual  = calcRachaActual(conRes, pronsMap, yaGano);

    const debugBloques = agruparPorFecha(conRes).map(bloque => {
      let exactos = 0;
      let conResultado = 0;
      const puntajes = [];
      for (const p of bloque) {
        const pts = calcPuntos(pronsMap[p.id], p);
        if (pts !== null) { conResultado++; }
        if (pts === 3) { exactos++; }
        puntajes.push({ partido: p, pts, pron: pronsMap[p.id] });
      }
      return { 
        bloque, 
        exactos, 
        conResultado, 
        puntajes, 
        suma: evaluarBloque(bloque, pronsMap).suma // Re-eval to show exactly what's added
      };
    });

    return { u, primeraRacha, yaGano, rachaActual, debugBloques };
  });

  data.conResDebug = conRes; // attach directly to array for global debug

  data.sort((a, b) => {
    if (a.yaGano && !b.yaGano) return -1;
    if (!a.yaGano && b.yaGano) return 1;
    if (b.rachaActual !== a.rachaActual) return b.rachaActual - a.rachaActual;
    return (a.u.nombre || a.u.username).localeCompare(b.u.nombre || b.u.username);
  });

  return data;
}