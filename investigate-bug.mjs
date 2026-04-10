#!/usr/bin/env node

/**
 * Script para investigar el bug de pronósticos huérfanos de ksanchez22
 * Uso: node investigate-bug.mjs <SUPABASE_URL> <SUPABASE_ANON_KEY>
 * O: node investigate-bug.mjs (si están en .env)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.argv[2] || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.argv[3] || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ Credenciales de Supabase no encontradas");
  console.error("Uso: node investigate-bug.mjs <SUPABASE_URL> <SUPABASE_ANON_KEY>");
  console.error("     O define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function investigar() {
  console.log("🔍 Investigando bug de ksanchez22...\n");

  // 1. Encontrar usuario
  console.log("1️⃣  Buscando usuario ksanchez22...");
  const { data: usuarios } = await supabase
    .from("usuarios")
    .select("id, username, nombre")
    .eq("username", "ksanchez22");

  if (!usuarios || usuarios.length === 0) {
    console.error("❌ Usuario ksanchez22 no encontrado");
    process.exit(1);
  }

  const usuario = usuarios[0];
  const usuarioId = usuario.id;
  console.log(`✅ Encontrado: ${usuario.nombre} (@${usuario.username})`);
  console.log(`   ID: ${usuarioId}\n`);

  // 2. Traer todos los pronósticos del usuario
  console.log("2️⃣  Trayendo pronósticos del usuario...");
  const { data: allProns } = await supabase
    .from("pronosticos")
    .select("*")
    .eq("usuario_id", usuarioId);

  console.log(`✅ Total pronósticos: ${allProns?.length || 0}\n`);

  // 3. Traer todos los partidos
  console.log("3️⃣  Trayendo partidos actuales...");
  const { data: allPartidos } = await supabase
    .from("partidos")
    .select("id, jornada_id, orden, equipo_local, equipo_visitante");

  console.log(`✅ Total partidos en BD: ${allPartidos?.length || 0}\n`);

  // 4. Identificar pronósticos huérfanos
  console.log("4️⃣  Identificando pronósticos huérfanos...\n");
  const partidoIds = new Set(allPartidos?.map((p) => p.id) || []);
  const pronValidos = [];
  const pronHuerfanos = [];

  allProns?.forEach((pron) => {
    if (partidoIds.has(pron.partido_id)) {
      pronValidos.push(pron);
    } else {
      pronHuerfanos.push(pron);
    }
  });

  console.log(`✅ Pronósticos VÁLIDOS: ${pronValidos.length}`);
  console.log(`❌ Pronósticos HUÉRFANOS (partido_id no existe): ${pronHuerfanos.length}\n`);

  // 5. Detalles de pronósticos huérfanos
  if (pronHuerfanos.length > 0) {
    console.log("📋 PRONÓSTICOS HUÉRFANOS - Detalles:");
    console.log("════════════════════════════════════════════════════════\n");
    
    pronHuerfanos.forEach((pron, idx) => {
      console.log(`${idx + 1}. Pronóstico ID: ${pron.id}`);
      console.log(`   Jornada ID: ${pron.jornada_id}`);
      console.log(`   PARTIDO_ID viejo (NO EXISTE): ${pron.partido_id}`);
      console.log(`   Pronóstico: ${pron.goles_local}-${pron.goles_visitante}`);
      console.log(`   Creado: ${new Date(pron.created_at).toLocaleString("es-HN")}`);
      console.log();
    });

    console.log("════════════════════════════════════════════════════════\n");

    // 6. Agrupar por jornada para ver el patrón
    console.log("📊 ANÁLISIS POR JORNADA:\n");
    const porJornada = {};
    
    allProns?.forEach((pron) => {
      const hasPartido = partidoIds.has(pron.partido_id);
      if (!porJornada[pron.jornada_id]) {
        porJornada[pron.jornada_id] = { validos: 0, huerfanos: 0 };
      }
      if (hasPartido) {
        porJornada[pron.jornada_id].validos++;
      } else {
        porJornada[pron.jornada_id].huerfanos++;
      }
    });

    Object.entries(porJornada).forEach(([jornadaId, counts]) => {
      console.log(`Jornada ${jornadaId.slice(0, 8)}...`);
      console.log(`  ✅ Válidos: ${counts.validos}`);
      console.log(`  ❌ Huérfanos: ${counts.huerfanos}`);
    });

    console.log("\n");

    // 7. Mostrar los IDs de partidos huérfanos específicos
    console.log("🔑 IDs DE PARTIDOS HUÉRFANOS (no existen en tabla partidos):\n");
    const huerfanoIds = new Set(pronHuerfanos.map((p) => p.partido_id));
    huerfanoIds.forEach((id) => {
      console.log(`  - ${id}`);
    });

    console.log("\n");

    // 8. Buscar matches por nombre de equipo
    console.log("🧩 INTENTANDO RELACIONAR CON PARTIDOS POR EQUIPO:\n");
    console.log("Nota: Esto es especulativo, basándose en el nombre del equipo\n");

    // Traer jornadas para contexto
    const { data: jornadas } = await supabase
      .from("jornadas")
      .select("id, nombre");

    const jornadaMap = {};
    jornadas?.forEach((j) => {
      jornadaMap[j.id] = j.nombre;
    });

    // Para cada pronóstico huérfano, mostrar su jornada
    pronHuerfanos.forEach((pron) => {
      const jornadaNombre = jornadaMap[pron.jornada_id] || "Desconocida";
      console.log(`Pronóstico ${pron.id.slice(0, 8)}... en ${jornadaNombre}`);
      console.log(`  Pronóstico: ${pron.goles_local}-${pron.goles_visitante}`);
      
      // Mostrar qué partidos existe en esa jornada
      const partidosDeLaJornada = allPartidos?.filter((p) => p.jornada_id === pron.jornada_id);
      console.log(`  Partidos en esa jornada:`);
      partidosDeLaJornada?.forEach((p) => {
        console.log(`    - ${p.equipo_local} vs ${p.equipo_visitante}`);
      });
      console.log();
    });
  }

  // 9. Resumen
  console.log("\n" + "═".repeat(60));
  console.log("📊 RESUMEN");
  console.log("═".repeat(60) + "\n");

  console.log(`Usuario: ${usuario.nombre} (@${usuario.username})`);
  console.log(`Total pronósticos: ${allProns?.length || 0}`);
  console.log(`  ✅ Válidos: ${pronValidos.length}`);
  console.log(`  ❌ Huérfanos: ${pronHuerfanos.length}`);
  console.log(`\nBUG: Los ${pronHuerfanos.length} pronósticos huérfanos tienen`);
  console.log(`partido_id antiguos que no existen en la tabla partidos actual.`);
  console.log(`\n💡 SOLUCIÓN:`);
  console.log(`Estas filas deben ser eliminadas o sus partido_id deben ser`);
  console.log(`actualizados con los IDs correctos si se pueden identificar`);
  console.log(`los partidos correspondientes.\n`);
}

investigar().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
