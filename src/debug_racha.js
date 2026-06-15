// debug_racha.js — correr con: node --experimental-vm-modules src/debug_racha.js
// O simplemente pegar este bloque en la consola del navegador en la app.

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf-8");
const getVar = (name) => { const m = env.match(new RegExp(`^${name}=(.*)`, "m")); return m ? m[1].trim() : ""; };

const INSFORGE_URL = getVar("VITE_INSFORGE_URL");
const INSFORGE_KEY = getVar("VITE_INSFORGE_ANON_KEY");

const db = createClient(INSFORGE_URL, INSFORGE_KEY);

// ─── Funciones copiadas de rachaUtils (sin imports) ───────────────────────────

async function fetchAllPaginated(queryFactory, pageSize = 1000) {
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

function calcPuntos(pron, partido) {
  if (partido.goles_local_real == null) return null;
  if (!pron || pron.goles_local == null) return 0;
  const gl = Number(pron.goles_local), gv = Number(pron.goles_visitante);
  const rl = Number(partido.goles_local_real), rv = Number(partido.goles_visitante_real);
  if (gl === rl && gv === rv) return 3;
  const rp = gl > gv ? "L" : gl < gv ? "V" : "E";
  const rr = rl > rv ? "L" : rl < rv ? "V" : "E";
  return rp === rr ? 1 : 0;
}

function ordenarPartidosPorFecha(partidos) {
  return [...partidos].sort((a, b) => {
    if (!a.fecha_limite && !b.fecha_limite) return (a.orden ?? 0) - (b.orden ?? 0);
    if (!a.fecha_limite) return 1;
    if (!b.fecha_limite) return -1;
    const diff = new Date(a.fecha_limite) - new Date(b.fecha_limite);
    if (diff !== 0) return diff;
    return (a.orden ?? 0) - (b.orden ?? 0);
  });
}

function ordenarPartidos(partidos) {
  return ordenarPartidosPorFecha(partidos).filter(p => p.goles_local_real != null);
}

function agruparPorFecha(partidos) {
  const grupos = []; const mapa = {};
  for (const p of partidos) {
    const key = p.fecha_limite ? new Date(p.fecha_limite).toISOString() : `individual_${p.id}`;
    if (!mapa[key]) { mapa[key] = []; grupos.push(mapa[key]); }
    mapa[key].push(p);
  }
  return grupos;
}

function evaluarBloque(bloque, pronsMap) {
  let exactos = 0, conResultado = 0;
  const partidosExactos = [];
  for (const p of bloque) {
    const pts = calcPuntos(pronsMap[p.id], p);
    if (pts === null) continue;
    conResultado++;
    if (pts === 3) { exactos++; partidosExactos.push(p); }
  }
  if (conResultado === 0) return { suma: 0, partidos: [] };
  if (exactos === 0)      return { suma: -1, partidos: [] };
  return { suma: exactos, partidos: partidosExactos };
}

function detectarPrimeraRacha(partidosOrdenados, pronsMap) {
  const grupos = agruparPorFecha(partidosOrdenados);
  let acumulado = 0, rachaPartidos = [];
  for (const grupo of grupos) {
    const { suma, partidos } = evaluarBloque(grupo, pronsMap);
    if (suma === -1) { acumulado = 0; rachaPartidos = []; }
    else if (suma > 0) {
      acumulado += suma;
      rachaPartidos = [...rachaPartidos, ...partidos];
      if (acumulado >= 3) return rachaPartidos.slice(0, 3);
    }
  }
  return null;
}

function calcRachaActual(partidosOrdenados, pronsMap, yaGano) {
  if (yaGano) return 0;
  const grupos = agruparPorFecha(partidosOrdenados);
  let racha = 0;
  for (let i = grupos.length - 1; i >= 0; i--) {
    const { suma } = evaluarBloque(grupos[i], pronsMap);
    if (suma === -1) break;
    if (suma === 0)  continue;
    racha += suma;
  }
  return racha;
}

// ─── Script principal ─────────────────────────────────────────────────────────

async function main() {
  console.log("Descargando datos de InsForge...\n");

  const [{ data: usrs }, allPts, allProns] = await Promise.all([
    db.from("usuarios").select("id, username, nombre").order("username"),
    fetchAllPaginated((from, to) => db.from("partidos").select("*").range(from, to)),
    fetchAllPaginated((from, to) => db.from("racha_pronosticos_view").select("*").range(from, to)),
  ]);

  console.log(`Usuarios: ${usrs?.length}   Partidos: ${allPts.length}   Pronósticos en view: ${allProns.length}`);

  // Verificar si la view devuelve todo o está truncada
  const { count } = await db.from("pronosticos").select("*", { count: "exact", head: true });
  console.log(`Pronósticos en tabla pronosticos: ${count}`);
  if (count > allProns.length) {
    console.warn(`\n⚠️  LA VIEW DEVUELVE MENOS FILAS QUE LA TABLA REAL (${allProns.length} vs ${count})`);
    console.warn("   El problema puede estar en la VIEW de la BD.\n");
  }

  // Construir mapa de pronósticos por usuario
  const userPronsCache = {};
  (allProns || []).forEach(pr => {
    if (!userPronsCache[pr.usuario_id]) userPronsCache[pr.usuario_id] = {};
    const userMap = userPronsCache[pr.usuario_id];
    const prev = userMap[pr.partido_id];
    if (!prev || new Date(pr.created_at || 0) >= new Date(prev.created_at || 0)) {
      userMap[pr.partido_id] = pr;
    }
  });

  const conRes = ordenarPartidos(allPts);
  const allOrdenados = ordenarPartidosPorFecha(allPts);
  const sinRes = allOrdenados.filter(p => p.goles_local_real == null);
  const siguientePartido = sinRes[0] ?? null;
  let siguientesSimultaneos = [];
  let isSiguienteExpirado = false;
  if (siguientePartido) {
    siguientesSimultaneos = sinRes.filter(p => p.fecha_limite === siguientePartido.fecha_limite);
    isSiguienteExpirado = siguientePartido.fecha_limite && new Date() > new Date(siguientePartido.fecha_limite);
  }

  console.log(`\n── Siguiente partido sin resultado: ${siguientePartido ? `${siguientePartido.equipo_local} vs ${siguientePartido.equipo_visitante}` : "NINGUNO"}`);
  console.log(`   fecha_limite: ${siguientePartido?.fecha_limite}   expirado: ${isSiguienteExpirado}`);
  console.log(`   Simultáneos en ese bloque: ${siguientesSimultaneos.length}`);

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("USUARIOS CON RACHA >= 2 (que aún no ganaron)");
  console.log("═══════════════════════════════════════════════════════");

  const resultados = (usrs || []).map(u => {
    const pronsMap = userPronsCache[u.id] || {};
    const primeraRacha = detectarPrimeraRacha(conRes, pronsMap);
    const yaGano       = !!primeraRacha;
    const rachaActual  = calcRachaActual(conRes, pronsMap, yaGano);
    return { u, yaGano, rachaActual, pronsMap };
  });

  const conRacha2 = resultados.filter(r => r.rachaActual >= 2 && !r.yaGano);
  if (conRacha2.length === 0) {
    console.log("No hay usuarios con racha >= 2 activa.");
    return;
  }

  for (const { u, rachaActual, pronsMap } of conRacha2) {
    console.log(`\n▶ ${u.nombre || u.username}  (racha: ${rachaActual})`);
    console.log(`  isSiguienteExpirado: ${isSiguienteExpirado}`);

    if (!isSiguienteExpirado) {
      console.log("  (El siguiente partido aún no venció — no se muestra pronóstico todavía)");
      continue;
    }

    for (const p of siguientesSimultaneos) {
      const pronEnView = pronsMap[p.id];
      // Buscar también directo en la lista cruda allProns
      const pronEnLista = allProns.find(pr => pr.usuario_id === u.id && pr.partido_id === p.id);

      console.log(`  Partido: ${p.equipo_local} vs ${p.equipo_visitante}  (ID: ${p.id})`);
      console.log(`    pronsMap[partidoId]: ${pronEnView ? `${pronEnView.goles_local}-${pronEnView.goles_visitante}` : "❌ null/undefined"}`);
      console.log(`    En allProns (lista raw): ${pronEnLista ? `${pronEnLista.goles_local}-${pronEnLista.goles_visitante}` : "❌ No encontrado"}`);

      if (!pronEnView && pronEnLista) {
        console.log(`    ⚠️  DISCREPANCIA: Está en allProns pero NO en pronsMap (bug en la deduplicación)`);
      }
      if (!pronEnView && !pronEnLista) {
        console.log(`    ⚠️  No está en la view ni en allProns — puede ser problema de la BD`);
        // Consultar directamente la BD
        const { data: directo } = await db.from("pronosticos")
          .select("*")
          .eq("usuario_id", u.id)
          .eq("partido_id", p.id);
        console.log(`    BD directa (pronosticos): ${directo?.length ? JSON.stringify(directo[0]) : "VACÍO"}`);
      }
    }
  }

  console.log("\n═══ FIN DEBUG ═══");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
