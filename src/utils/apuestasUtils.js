/**
 * calcularGananciasNetas — Lógica de distribución proporcional de apuestas.
 *
 * Reglas:
 * - Si no hay ganadores, todos recuperan su apuesta completa.
 * - Cada ganador le "cobra" a cada participante el mínimo entre
 *   la apuesta del ganador y la del participante, dividido entre
 *   el número de ganadores.
 * - El ganador no se cobra a sí mismo.
 * - El perdedor recupera el sobrante de su apuesta.
 */
export function calcularGananciasNetas(lista) {
  const resultadoFinal = lista.map((p) => ({
    nombre: p.nombre,
    usuario_id: p.usuario_id,
    apuestaOriginal: Number(p.apuesta),
    gano: p.gano,
    gananciaNeta: 0,
    devolucionSobrante: Number(p.apuesta),
    totalMano: 0,
  }));

  const ganadores = resultadoFinal.filter((p) => p.gano);

  if (ganadores.length === 0) {
    return resultadoFinal.map((p) => ({
      ...p,
      totalMano: p.apuestaOriginal,
    }));
  }

  ganadores.forEach((ganador) => {
    resultadoFinal.forEach((participante) => {
      const montoDisputado = Math.min(
        ganador.apuestaOriginal,
        participante.apuestaOriginal
      );

      // CORRECCIÓN: Contamos cuántos ganadores tienen la capacidad de disputar este monto específico
      const ganadoresCompetidores = ganadores.filter(
        (g) => g.apuestaOriginal >= montoDisputado
      ).length;

      // Dividimos solo entre los que realmente entraron a competir en este rango
      const cobroEfectivo = montoDisputado / ganadoresCompetidores;

      if (ganador.nombre !== participante.nombre) {
        ganador.gananciaNeta += cobroEfectivo;
        participante.devolucionSobrante -= cobroEfectivo;
      }
    });
  });

  resultadoFinal.forEach((p) => {
    p.totalMano = p.gano
      ? p.apuestaOriginal + p.gananciaNeta
      : p.devolucionSobrante;

    p.gananciaNeta = Number(p.gananciaNeta.toFixed(2));
    p.devolucionSobrante = Number(p.devolucionSobrante.toFixed(2));
    p.totalMano = Number(p.totalMano.toFixed(2));
  });

  return resultadoFinal;
}

/**
 * calcularAllIn — Lógica de distribución All-In.
 *
 * Reglas:
 * - Cada ganador cobra de cada perdedor: MIN(apuesta_ganador, apuesta_perdedor)
 * - Si hay varios ganadores, cada uno cobra independientemente de cada perdedor
 * - Un perdedor puede ser cobrado por múltiples ganadores
 * - Si el total reclamado a un perdedor excede su apuesta, se distribuye
 *   proporcionalmente entre los ganadores según lo que cada uno reclama
 * - Los ganadores nunca ponen dinero para otros ganadores
 * - neto = cobrado - apuesta
 */
export function calcularAllIn(lista) {
  const res = lista.map((p) => ({
    nombre: p.nombre,
    apuesta: Number(p.apuesta),
    cobrado: Number(p.apuesta),
    neto: 0,
    gano: p.gano,
  }));

  const ganadores = res.filter((p) => p.gano);
  const perdedores = res.filter((p) => !p.gano);

  if (ganadores.length === 0 || perdedores.length === 0) {
    return res.map((p) => ({
      nombre: p.nombre,
      apuesta: p.apuesta,
      cobrado: p.apuesta,
      neto: 0,
    }));
  }

  // 1. Calcular reclamos independientes por cada perdedor
  const reclamos = {};
  for (const loser of perdedores) {
    const items = [];
    let totalReclamado = 0;
    for (const winner of ganadores) {
      const monto = Math.min(winner.apuesta, loser.apuesta);
      items.push({ winner, monto });
      totalReclamado += monto;
    }
    reclamos[loser.nombre] = { items, totalReclamado };
  }

  // 2. Distribuir el dinero de cada perdedor proporcionalmente
  const cobros = {};
  ganadores.forEach((w) => { cobros[w.nombre] = 0; });

  for (const loser of perdedores) {
    const { items, totalReclamado } = reclamos[loser.nombre];
    const disponible = loser.apuesta;
    const ratio = totalReclamado > 0 ? Math.min(1, disponible / totalReclamado) : 0;

    for (const { winner, monto } of items) {
      cobros[winner.nombre] += monto * ratio;
    }
  }

  // 3. Asignar cobrado final
  for (const p of res) {
    if (p.gano) {
      p.cobrado = p.apuesta + cobros[p.nombre];
    } else {
      p.cobrado = loserCobrado(p, reclamos);
    }
    p.neto = Number((p.cobrado - p.apuesta).toFixed(2));
    p.cobrado = Number(p.cobrado.toFixed(2));
  }

  return res.map((p) => ({
    nombre: p.nombre,
    apuesta: p.apuesta,
    cobrado: p.cobrado,
    neto: p.neto,
  }));
}

function loserCobrado(loser, reclamos) {
  const { totalReclamado } = reclamos[loser.nombre];
  const pagado = Math.min(totalReclamado, loser.apuesta);
  return loser.apuesta - pagado;
}
