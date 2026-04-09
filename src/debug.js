import { supabase } from "./supabaseClient";

/**
 * Copiar de UserPanel.jsx - Calcular puntos de un pronóstico
 */
function calcPuntos(pron, partido) {
  if (!partido || pron?.goles_local == null) return null;
  if (partido.goles_local_real == null) return null;
  const gl = Number(pron.goles_local), gv = Number(pron.goles_visitante);
  const rl = Number(partido.goles_local_real), rv = Number(partido.goles_visitante_real);
  if (gl === rl && gv === rv) return 3;
  const rp = gl > gv ? "L" : gl < gv ? "V" : "E";
  const rr = rl > rv ? "L" : rl < rv ? "V" : "E";
  return rp === rr ? 1 : 0;
}

/**
 * DEBUG: Encontrar pronósticos huérfanos (partido_id no existe en tabla partidos)
 * Uso en consola: window.__debugOrphanPronosticos(usuarioId o username)
 */
export async function debugOrphanPronosticos(usuarioIdOUsername) {
  console.log("🔍 Buscando pronósticos para usuario:", usuarioIdOUsername);

  // Primero, intentar buscar el usuario si se pasó un username
  let usuarioId = usuarioIdOUsername;
  if (!usuarioIdOUsername.includes("-")) {
    // Parece un username, buscar el UUID
    console.log("  → Buscando UUID del usuario...");
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, username, nombre")
      .eq("username", usuarioIdOUsername);

    if (!usuarios || usuarios.length === 0) {
      console.error("❌ Usuario no encontrado:", usuarioIdOUsername);
      return;
    }
    usuarioId = usuarios[0].id;
    console.log(
      `  ✅ Encontrado: ${usuarios[0].nombre} (${usuarios[0].username}) → ${usuarioId}`
    );
  }

  // Traer TODOS los pronósticos del usuario
  const { data: allProns } = await supabase
    .from("pronosticos")
    .select("*")
    .eq("usuario_id", usuarioId);

  console.log(`📊 Total pronósticos encontrados: ${allProns?.length || 0}`);

  if (!allProns || allProns.length === 0) {
    console.log("❌ No hay pronósticos para este usuario");
    return;
  }

  // Traer TODOS los partidos
  const { data: allPartidos } = await supabase
    .from("partidos")
    .select("id, jornada_id, orden, equipo_local, equipo_visitante");

  const partidoIds = new Set(allPartidos?.map((p) => p.id) || []);
  console.log(`📋 Total partidos existentes en BD: ${allPartidos?.length || 0}`);

  // Clasificar pronósticos
  const pronValidos = [];
  const pronHuerfanos = [];

  allProns.forEach((pron) => {
    if (partidoIds.has(pron.partido_id)) {
      pronValidos.push(pron);
    } else {
      pronHuerfanos.push(pron);
    }
  });

  console.log(`\n✅ Pronósticos VÁLIDOS (partido_id existe): ${pronValidos.length}`);
  console.table(
    pronValidos.map((p) => ({
      pronóstico_id: p.id,
      partido_id: p.partido_id,
      jornada_id: p.jornada_id,
      goles: `${p.goles_local}-${p.goles_visitante}`,
    }))
  );

  console.log(`\n❌ Pronósticos HUÉRFANOS (partido_id NO existe): ${pronHuerfanos.length}`);
  console.table(
    pronHuerfanos.map((p) => ({
      pronóstico_id: p.id,
      partido_id_viejo: p.partido_id,
      jornada_id: p.jornada_id,
      goles: `${p.goles_local}-${p.goles_visitante}`,
    }))
  );

  // Análisis por jornada
  console.log("\n📈 ANÁLISIS POR JORNADA:");
  const porJornada = {};
  pronHuerfanos.forEach((p) => {
    if (!porJornada[p.jornada_id]) {
      porJornada[p.jornada_id] = [];
    }
    porJornada[p.jornada_id].push(p);
  });

  Object.entries(porJornada).forEach(([jornadaId, prons]) => {
    console.log(`\n  Jornada ${jornadaId}: ${prons.length} pronósticos huérfanos`);
    console.table(
      prons.map((p) => ({
        partido_id_viejo: p.partido_id.slice(0, 8),
        goles: `${p.goles_local}-${p.goles_visitante}`,
      }))
    );
  });

  // Guardar en ventana global para fácil acceso
  window.__debugData = {
    usuarioId,
    pronValidos,
    pronHuerfanos,
    totalPronósticos: allProns.length,
    totalPartidos: allPartidos?.length || 0,
  };

  console.log(
    "\n💾 Datos guardados en window.__debugData para POST a servidor"
  );
  return window.__debugData;
}

/**
 * DEBUG: Para un usuario específico, mostrar qué partidos de una jornada
 * tienen pronóstico vs cuál falta
 */
export async function debugJornadaDetalles(usuarioIdOUsername, jornadaIdONombre) {
  console.log(
    `\n🔎 Analizando Jornada para usuario ${usuarioIdOUsername}`
  );

  // Resolver usuario
  let usuarioId = usuarioIdOUsername;
  if (!usuarioIdOUsername.includes("-")) {
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, username")
      .eq("username", usuarioIdOUsername);
    if (!usuarios || usuarios.length === 0) {
      console.error("❌ Usuario no encontrado");
      return;
    }
    usuarioId = usuarios[0].id;
    console.log(`✅ Usuario: ${usuarios[0].username} (${usuarioId})`);
  }

  // Resolver jornada
  let jornadaId = jornadaIdONombre;
  if (!jornadaIdONombre.includes("-")) {
    const { data: jornadas } = await supabase
      .from("jornadas")
      .select("id, nombre")
      .eq("nombre", jornadaIdONombre);
    if (!jornadas || jornadas.length === 0) {
      console.error("❌ Jornada no encontrada");
      return;
    }
    jornadaId = jornadas[0].id;
    console.log(`✅ Jornada: ${jornadas[0].nombre} (${jornadaId})`);
  }

  // Partidos de la jornada (ordenados)
  const { data: partidos } = await supabase
    .from("partidos")
    .select("*")
    .eq("jornada_id", jornadaId)
    .order("orden");

  console.log(`\n📋 Partidos en Jornada ${jornadaId}:`);
  console.table(
    partidos?.map((p) => ({
      orden: p.orden,
      equipo_local: p.equipo_local,
      vs: "vs",
      equipo_visitante: p.equipo_visitante,
      id: p.id.slice(0, 8),
      resultado: p.goles_local_real
        ? `${p.goles_local_real}-${p.goles_visitante_real}`
        : "SIN RESULTADO",
    })) || []
  );

  // Pronósticos del usuario en esta jornada
  const { data: prons } = await supabase
    .from("pronosticos")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("jornada_id", jornadaId);

  console.log(`\n📝 Pronósticos guardados del usuario en Jornada ${jornadaId}:`);
  console.table(
    prons?.map((p) => ({
      partido_id: p.partido_id.slice(0, 8),
      goles: `${p.goles_local}-${p.goles_visitante}`,
      existe: "❌ NO EXISTE",
    })) || []
  );

  // Correlacionar: mostrar cuáles faltan
  console.log(`\n🔗 CORRELACIÓN:`);
  const pronIds = new Set(prons?.map((p) => p.partido_id) || []);
  const resultado = partidos?.map((p) => ({
    orden: p.orden,
    equipo: `${p.equipo_local} vs ${p.equipo_visitante}`,
    partido_id: p.id.slice(0, 8),
    tiene_pronóstico: pronIds.has(p.id) ? "✅ SÍ" : "❌ NO",
    resultado: p.goles_local_real
      ? `${p.goles_local_real}-${p.goles_visitante_real}`
      : "⏳ PENDIENTE",
  }));

  console.table(resultado);
}

/**
 * DEBUG: Análisis profundo del patrón de pronósticos
 * Usa: window.__debugPatronPronosticos("ksanchez22", "Jornada 1")
 * Muestra qué pronósticos existen realmente en BD y en qué orden
 */
export async function debugPatronPronosticos(usuarioIdOUsername, jornadaNombreOId) {
  console.log(`\n📊 ANÁLISIS DE PATRÓN: ${usuarioIdOUsername} → ${jornadaNombreOId}`);

  // Resolver usuario
  let usuarioId = usuarioIdOUsername;
  let userData = null;
  if (!usuarioIdOUsername.includes("-")) {
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id, username, nombre")
      .eq("username", usuarioIdOUsername);
    if (!usuarios || usuarios.length === 0) {
      console.error("❌ Usuario no encontrado");
      return;
    }
    usuarioId = usuarios[0].id;
    userData = usuarios[0];
    console.log(`✅ Usuario: ${userData.nombre} (@${userData.username})`);
  }

  // Resolver jornada
  let jornadaId = jornadaNombreOId;
  if (!jornadaNombreOId.includes("-")) {
    const { data: jornadas } = await supabase
      .from("jornadas")
      .select("id, nombre")
      .eq("nombre", jornadaNombreOId);
    if (!jornadas || jornadas.length === 0) {
      console.error("❌ Jornada no encontrada");
      return;
    }
    jornadaId = jornadas[0].id;
    console.log(`✅ Jornada: ${jornadas[0].nombre}`);
  }

  // Traer TODO
  const { data: partidos } = await supabase
    .from("partidos")
    .select("*")
    .eq("jornada_id", jornadaId)
    .order("orden");

  const { data: prons } = await supabase
    .from("pronosticos")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("jornada_id", jornadaId)
    .order("created_at");

  console.log(`\n📋 Partidos en BD: ${partidos?.length || 0}`);
  console.log(`📝 Pronósticos guardados: ${prons?.length || 0}`);

  // Crear mapa de cuál partido tiene pronóstico
  const pronPorPartidoId = {};
  (prons || []).forEach((p) => {
    pronPorPartidoId[p.partido_id] = p;
  });

  // Mostrar la correlación:
  console.log(`\n\n🔗 CORRELACIÓN CON DETALLES:\n`);
  const detalles = [];
  (partidos || []).forEach((p, idx) => {
    const pron = pronPorPartidoId[p.id];
    detalles.push({
      orden: p.orden,
      equipo: `${p.equipo_local} vs ${p.equipo_visitante}`,
      "¿Pronóstico?": pron ? `✅ ${pron.goles_local}-${pron.goles_visitante}` : "❌",
      resultado: p.goles_local_real
        ? `${p.goles_local_real}-${p.goles_visitante_real}`
        : "⏳",
      "Puntos?": pron && p.goles_local_real != null ? calcPuntos(pron, p) + " pts" : "—",
    });
  });

  console.table(detalles);

  // Análisis de patrón
  console.log(`\n\n⚠️ ANÁLISIS DE PATRÓN:\n`);
  let ultimoConPronustico = -1;
  let primerSinPronustico = -1;
  
  (partidos || []).forEach((p, idx) => {
    const pron = pronPorPartidoId[p.id];
    if (pron) {
      ultimoConPronustico = p.orden;
    } else if (primerSinPronustico === -1) {
      primerSinPronustico = p.orden;
    }
  });

  console.log(`• Último partido CON pronóstico: Orden ${ultimoConPronustico}`);
  console.log(`• Primer partido SIN pronóstico: Orden ${primerSinPronustico}`);

  if (primerSinPronustico > ultimoConPronustico) {
    console.log(
      `\n🔴 PATRÓN ENCONTRADO: A partir del orden ${primerSinPronustico} NO hay pronósticos`
    );
    const sinPronComoPredispone = (partidos || []).filter(
      (p) => !pronPorPartidoId[p.id] && p.orden >= primerSinPronustico
    );
    console.log(`   → ${sinPronComoPredispone.length} partidos sin pronóstico desde ese punto`);
  } else {
    console.log(`\n✅ Los pronósticos están normalmente distribuidos`);
  }

  // Guardar data
  window.__debugPatternData = {
    usuario: userData || usuarioId,
    jornada: jornadaNombreOId,
    totalPartidos: partidos?.length || 0,
    totalPronósticos: prons?.length || 0,
    pronósticos: prons,
    partidos,
    pronPorPartidoId,
    ultimoConPronustico,
    primerSinPronustico,
  };

  console.log(`\n💾 Datos guardados en window.__debugPatternData`);
  return window.__debugPatternData;
}

/**
 * Exportar para agregar a window
 */
window.__debugOrphanPronosticos = debugOrphanPronosticos;
window.__debugJornadaDetalles = debugJornadaDetalles;
window.__debugPatronPronosticos = debugPatronPronosticos;

/**
 * DEBUG: Comparar datos de BD vs datos en el componente UserPanel
 * Uso: window.__debugCompararComponente()
 */
export function debugCompararComponente() {
  console.log(`\n🔀 COMPARANDO BD vs COMPONENTE UserPanel\n`);

  if (!window.__debugPatternData) {
    console.error(
      "❌ Primero ejecuta: window.__debugPatronPronosticos('ksanchez22', 'Jornada 1')"
    );
    return;
  }

  const dataBD = window.__debugPatternData.pronósticos;
  console.log(`📋 EN BD: ${dataBD.length} pronósticos`);
  console.table(
    dataBD.map((p) => ({
      partido_id: p.partido_id.slice(0, 8),
      goles: `${p.goles_local}-${p.goles_visitante}`,
      created_at: new Date(p.created_at).toLocaleString("es-HN"),
    }))
  );

  // Ahora verificar qué hay en el STATE de React
  if (!window.__ReactDebugInfo) {
    console.log(`\n⚠️ IMPORTANTE:`);
    console.log(`El estado del componente NO está disponible en consola.`);
    console.log(`\n📌 Para debuggear el componente desde DevTools:`);
    console.log(
      `1. Abre DevTools → React DevTools (pestaña "Components")`
    );
    console.log(`2. Busca el componente "UserPanel"`);
    console.log(`3. En "Hooks" busca "allPronsMios" (3er o 4to hook)`);
    console.log(
      `4. Expande y cuenta cuántos pronósticos hay en esa variable`
    );
    console.log(`\n📊 ESPERADO: ${dataBD.length} pronósticos`);
    console.log(`   PARTIDO_IDS esperados:`);
    dataBD.forEach((p) => {
      console.log(`   - ${p.partido_id.slice(0, 8)}`);
    });

    return;
  }

  const dataComponente = window.__ReactDebugInfo.allPronsMios || [];
  console.log(`\n💾 EN COMPONENTE: ${dataComponente.length} pronósticos en allPronsMios`);

  // Comparar
  const bdIds = new Set(dataBD.map((p) => p.partido_id));
  const compIds = new Set(dataComponente.map((p) => p.partido_id));

  const enBDperNoEnComp = dataBD.filter(
    (p) => !compIds.has(p.partido_id)
  );
  const enCompPerNoEnBD = dataComponente.filter(
    (p) => !bdIds.has(p.partido_id)
  );

  if (enBDperNoEnComp.length > 0) {
    console.log(
      `\n🔴 EN BD pero NO EN COMPONENTE (${enBDperNoEnComp.length}):`
    );
    console.table(
      enBDperNoEnComp.map((p) => ({
        partido_id: p.partido_id.slice(0, 8),
        goles: `${p.goles_local}-${p.goles_visitante}`,
      }))
    );
  }

  if (enCompPerNoEnBD.length > 0) {
    console.log(
      `\n🟢 EN COMPONENTE pero NO EN BD (${enCompPerNoEnBD.length}):`
    );
    console.table(
      enCompPerNoEnBD.map((p) => ({
        partido_id: p.partido_id.slice(0, 8),
        goles: `${p.goles_local}-${p.goles_visitante}`,
      }))
    );
  }

  if (enBDperNoEnComp.length === 0 && enCompPerNoEnBD.length === 0) {
    console.log(`\n✅ Los datos COINCIDEN perfectamente`);
  }
}

window.__debugCompararComponente = debugCompararComponente;

/**
 * DEBUG: Investigar por qué no encuentra pronósticos en el componente
 * Usa: window.__debugBuscarPronósticos()
 */
export async function debugBuscarPronósticos() {
  console.log(`\n🔎 DEBUG: Buscando pronósticos como lo hace el componente\n`);

  if (!window.__ReactDebugInfo) {
    console.log(
      "⚠️ Primero ve a la app, abre 'Mis Puntos', luego ejecuta esto en consola"
    );
    return;
  }

  const { usuario, allPronsMios, allPartidos, misJornadas } = window.__ReactDebugInfo;

  console.log(`👤 Usuario: ${usuario.username} (ID: ${usuario.id})`);
  console.log(`📚 Datos cargados en componente:`);
  console.log(`   - allPronsMios: ${allPronsMios.length} pronósticos`);
  console.log(`   - allPartidos: ${allPartidos.length} partidos`);
  console.log(`   - misJornadas: ${misJornadas.length} jornadas`);

  if (misJornadas.length === 0) {
    console.log("❌ No hay jornadas cargadas");
    return;
  }

  const j = misJornadas[0]; // Primera jornada (Jornada 1)
  console.log(`\n📋 Analizando: ${j.nombre} (${j.id})\n`);

  // Partidos CON resultado (como lo hace el componente)
  const ptsDej = allPartidos
    .filter((p) => p.jornada_id === j.id && p.goles_local_real != null)
    .sort((a, b) => a.orden - b.orden);

  console.log(`Partidos con resultado: ${ptsDej.length}`);
  console.table(
    ptsDej.map((p) => ({
      orden: p.orden,
      equipo: `${p.equipo_local} vs ${p.equipo_visitante}`,
      partido_id: p.id.slice(0, 8),
      resultado: `${p.goles_local_real}-${p.goles_visitante_real}`,
    }))
  );

  console.log(`\n🔍 Buscando pronósticos para cada partido:\n`);

  const resultados = ptsDej.map((p) => {
    const pron = allPronsMios.find((pr) => pr.partido_id === p.id);
    return {
      orden: p.orden,
      equipo: `${p.equipo_local} vs ${p.equipo_visitante}`,
      partido_id: p.id.slice(0, 8),
      "¿Encontrado?": pron ? "✅ SÍ" : "❌ NO",
      pronóstico: pron ? `${pron.goles_local}-${pron.goles_visitante}` : "—",
    };
  });

  console.table(resultados);

  // Análisis
  const noEncontrados = resultados.filter((r) => r["¿Encontrado?"] === "❌ NO");
  if (noEncontrados.length > 0) {
    console.log(`\n🔴 PROBLEMA: ${noEncontrados.length} pronósticos NO encontrados`);
    console.log(`\n📊 Comparando partido_id en allPartidos vs allPronsMios:\n`);

    const partidoIds = new Set(allPartidos.map((p) => p.id));
    const pronPartidoIds = new Set(allPronsMios.map((pr) => pr.partido_id));

    console.log(`• Partidos TOTALES: ${allPartidos.length}`);
    console.log(`• Pronósticos TOTALES: ${allPronsMios.length}`);

    const enPronsPeroNoEnPartidos = Array.from(pronPartidoIds).filter(
      (id) => !partidoIds.has(id)
    );

    if (enPronsPeroNoEnPartidos.length > 0) {
      console.log(`\n🔴 CRÍTICO: ${enPronsPeroNoEnPartidos.length} pronósticos con partido_id que NO existen en tabla partidos`);
      console.log(`   (Esto es el bug del partit_id mismatch - IDs cambiados)`);
      console.table(
        allPronsMios
          .filter((pr) => enPronsPeroNoEnPartidos.includes(pr.partido_id))
          .map((pr) => ({
            partido_id_viejo: pr.partido_id.slice(0, 8),
            goles: `${pr.goles_local}-${pr.goles_visitante}`,
            jornada: pr.jornada_id.slice(0, 8),
          }))
      );
    }

    const enPartidosPeroNoEnProns = Array.from(partidoIds).filter(
      (id) => !pronPartidoIds.has(id)
    );

    if (enPartidosPeroNoEnProns.length > 0) {
      console.log(`\n⚠️ ${enPartidosPeroNoEnProns.length} partidos SIN pronóstico en allPronsMios`);
      const partidos_sin = allPartidos.filter((p) =>
        enPartidosPeroNoEnProns.includes(p.id)
      );
      console.table(
        partidos_sin
          .filter((p) => p.jornada_id === j.id)
          .map((p) => ({
            orden: p.orden,
            equipo: `${p.equipo_local} vs ${p.equipo_visitante}`,
            partido_id: p.id.slice(0, 8),
          }))
      );
    }
  } else {
    console.log(`\n✅ Todos los pronósticos se encontraron correctamente`);
  }
}

window.__debugBuscarPronósticos = debugBuscarPronósticos;

/**
 * DEBUG: Encontrar pronósticos "huérfanos" con partido_id viejo
 * que pueden ser reparados
 */
export async function debugEncontrarHuerfanos() {
  console.log(`\n🔍 Buscando pronósticos "huérfanos" en BD\n`);

  // Traer TODOS los pronósticos (no filtrados)
  const { data: todosProns } = await supabase.from("pronosticos").select("*");

  // Traer TODOS los partidos
  const { data: todoPartidos } = await supabase.from("partidos").select("*");

  const partidoIds = new Set(todoPartidos?.map((p) => p.id) || []);

  const huerfanos = (todosProns || []).filter((p) => !partidoIds.has(p.partido_id));
  const validos = (todosProns || []).filter((p) => partidoIds.has(p.partido_id));

  console.log(`📊 ESTADÍSTICAS:`);
  console.log(`   Total pronósticos: ${todosProns?.length || 0}`);
  console.log(`   Válidos (existe partido_id): ${validos.length}`);
  console.log(`   Huérfanos (NO existe partido_id): ${huerfanos.length}`);

  if (huerfanos.length === 0) {
    console.log(`\n✅ No hay pronósticos huérfanos`);
    return;
  }

  console.log(`\n🔴 PRONÓSTICOS HUÉRFANOS:\n`);

  // Agrupar por usuario
  const porUsuario = {};
  huerfanos.forEach((p) => {
    if (!porUsuario[p.usuario_id]) {
      porUsuario[p.usuario_id] = [];
    }
    porUsuario[p.usuario_id].push(p);
  });

  // Obtener nombres de usuarios
  const usuarioIds = Object.keys(porUsuario);
  const { data: usuarios } = await supabase
    .from("usuarios")
    .select("id, username, nombre")
    .in("id", usuarioIds);

  const usuarioMap = {};
  (usuarios || []).forEach((u) => {
    usuarioMap[u.id] = u;
  });

  // Mostrar por usuario
  Object.entries(porUsuario).forEach(([userId, prons]) => {
    const user = usuarioMap[userId] || { username: "???", nombre: "???" };
    console.log(
      `👤 ${user.nombre} (@${user.username}): ${prons.length} pronósticos huérfanos`
    );

    console.table(
      prons.map((p) => ({
        pronóstico_id: p.id.slice(0, 8),
        partido_id_viejo: p.partido_id.slice(0, 8),
        jornada_id: p.jornada_id.slice(0, 8),
        goles: `${p.goles_local}-${p.goles_visitante}`,
        created_at: new Date(p.created_at).toLocaleString("es-HN"),
      }))
    );
  });

  window.__huerfanosData = {
    huerfanos,
    validos,
    usuarioMap,
    porUsuario,
  };

  console.log(`\n💾 Datos guardados en window.__huerfanosData`);
  return window.__huerfanosData;
}

window.__debugEncontrarHuerfanos = debugEncontrarHuerfanos;

/**
 * DEBUG: Validar que el usuario_id del componente es correcto
 * y comparar pronósticos en BD vs componente
 */
export async function debugValidarUsuarioId() {
  console.log(`\n🔍 Validando usuario_id en BD vs Componente\n`);

  if (!window.__ReactDebugInfo) {
    console.error(
      "❌ Primero abre 'Mis Puntos' en la app, luego ejecuta esto"
    );
    return;
  }

  const { usuario, allPronsMios } = window.__ReactDebugInfo;

  console.log(`👤 Datos del componente:`);
  console.log(`   usuario.id: ${usuario.id}`);
  console.log(`   usuario.username: ${usuario.username}`);
  console.log(`   usuario.email: ${usuario.email}`);
  console.log(`   allPronsMios.length: ${allPronsMios.length}`);

  // Buscar pronósticos en BD directamente con este usuario_id
  console.log(`\n🔎 Buscando pronósticos en BD con usuario_id: ${usuario.id}`);

  const { data: pronsPorId, error: errPorId } = await supabase
    .from("pronosticos")
    .select("*")
    .eq("usuario_id", usuario.id);

  if (errPorId) {
    console.error("❌ Error en query:", errPorId);
    return;
  }

  console.log(`   → Encontrados: ${pronsPorId?.length || 0} pronósticos`);

  if (!pronsPorId || pronsPorId.length === 0) {
    console.log(`\n❌ No hay pronósticos con ese usuario_id en BD`);
    console.log(`\n   Esto significa que el usuario_id es INCORRECTO`);
    console.log(`\n   Buscando qué usuario_id podría ser correcto...`);

    const { data: usuariosBD } = await supabase
      .from("usuarios")
      .select("id, username")
      .eq("username", usuario.username);

    if (usuariosBD && usuariosBD.length > 0) {
      console.log(`\n   ✅ Usuario encontrado en BD:`);
      usuariosBD.forEach((u) => {
        console.log(`      - ID: ${u.id}`);
        console.log(`      - Username: ${u.username}`);
      });
    }

    return;
  }

  // Comparar
  const pronIdsEnBD = new Set(pronsPorId.map((p) => p.id));
  const pronIdsEnComp = new Set(allPronsMios.map((p) => p.id));

  console.log(`\n📊 COMPARACIÓN:`);
  console.log(`   BD:        ${pronsPorId.length} pronósticos`);
  console.log(`   Componente: ${allPronsMios.length} pronósticos`);

  if (pronsPorId.length === allPronsMios.length) {
    console.log(`\n✅ Coinciden (sin diferencias)`);
    return;
  }

  const enBDperNoEnComp = pronsPorId.filter((p) => !pronIdsEnComp.has(p.id));
  const enCompPerNoEnBD = allPronsMios.filter((p) => !pronIdsEnBD.has(p.id));

  if (enBDperNoEnComp.length > 0) {
    console.log(
      `\n🔴 EN BD pero NO EN COMPONENTE (${enBDperNoEnComp.length}):`
    );
    console.table(
      enBDperNoEnComp.map((p) => ({
        id: p.id.slice(0, 8),
        jornada: p.jornada_id.slice(0, 8),
        partido: p.partido_id.slice(0, 8),
        goles: `${p.goles_local}-${p.goles_visitante}`,
        created_at: new Date(p.created_at).toLocaleString("es-HN"),
      }))
    );
  }

  if (enCompPerNoEnBD.length > 0) {
    console.log(`\n🟢 EN COMPONENTE pero NO EN BD (${enCompPerNoEnBD.length}):`);
    console.table(
      enCompPerNoEnBD.map((p) => ({
        id: p.id.slice(0, 8),
        jornada: p.jornada_id.slice(0, 8),
        partido: p.partido_id.slice(0, 8),
        goles: `${p.goles_local}-${p.goles_visitante}`,
      }))
    );
  }
}

window.__debugValidarUsuarioId = debugValidarUsuarioId;
