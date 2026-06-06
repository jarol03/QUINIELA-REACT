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
      const cobroEfectivo = montoDisputado / ganadores.length;

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
