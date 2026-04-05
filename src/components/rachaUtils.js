// ── Utilidades compartidas de racha ──────────────────────────────────────

export function calcPuntos(pron, partido) {
  if (!pron || pron.goles_local == null) return null;
  if (partido.goles_local_real == null) return null;
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

// Detecta la PRIMERA racha de 3 exactos consecutivos.
// Una vez encontrada para — no importa si hay otra racha después.
export function detectarPrimeraRacha(partidosOrdenados, pronsMap) {
  let racha = [];
  for (const p of partidosOrdenados) {
    const pts = calcPuntos(pronsMap[p.id], p);
    if (pts === 3) {
      racha.push(p);
      if (racha.length >= 3) return racha.slice(0, 3);
    } else {
      racha = [];
    }
  }
  return null;
}

// Racha actual desde el último partido hacia atrás.
// Si el usuario ya ganó el premio, su racha actual es 0
// (ya no compite para volver a ganarlo).
export function calcRachaActual(partidosOrdenados, pronsMap, yaGano) {
  if (yaGano) return 0;
  let racha = 0;
  for (let i = partidosOrdenados.length - 1; i >= 0; i--) {
    const pts = calcPuntos(pronsMap[partidosOrdenados[i].id], partidosOrdenados[i]);
    if (pts === 3) racha++;
    else break;
  }
  return racha;
}

// Calcula el estado completo de racha para todos los usuarios.
export function calcularRachas(usrs, allPts, allProns) {
  const conRes = ordenarPartidos(allPts || []);

  const data = (usrs || []).map(u => {
    const pronsMap = {};
    (allProns || [])
      .filter(pr => pr.usuario_id === u.id)
      .forEach(pr => { pronsMap[pr.partido_id] = pr; });

    const primeraRacha = detectarPrimeraRacha(conRes, pronsMap);
    const yaGano       = !!primeraRacha;
    const rachaActual  = calcRachaActual(conRes, pronsMap, yaGano);

    return { u, primeraRacha, yaGano, rachaActual };
  });

  // Ordenar: ganadores primero, luego por racha actual desc, luego alphabético
  data.sort((a, b) => {
    if (a.yaGano && !b.yaGano) return -1;
    if (!a.yaGano && b.yaGano) return 1;
    if (b.rachaActual !== a.rachaActual) return b.rachaActual - a.rachaActual;
    return (a.u.nombre || a.u.username).localeCompare(b.u.nombre || b.u.username);
  });

  return data;
}