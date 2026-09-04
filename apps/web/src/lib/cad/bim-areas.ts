/**
 * ÁREAS DE UN LOCAL: la útil, la construida y la parte de muro que le toca.
 *
 * Las tres salen del MISMO anillo de ejes que `bim-schedule.ts` obtiene
 * recorriendo las caras del grafo de muros. Lo único que cambia entre una y
 * otra es cuánto se desplaza cada lado antes de volver a cerrar las esquinas
 * por intersección:
 *
 *  - **Área a ejes**: no se desplaza nada. Es la que produce el recorrido.
 *  - **Área útil**: cada lado entra medio grosor HACIA DENTRO. Es la que se
 *    habita, la que se vende y la que mide un reglamento de iluminación o de
 *    dimensión mínima de recámara.
 *  - **Área construida**: cada lado sale medio grosor HACIA FUERA si al otro
 *    lado no hay otro local —muro perimetral, se mide a paño exterior— y se
 *    queda quieto sobre el eje si separa dos locales —muro medianero, medio
 *    para cada uno—. Es la que se declara en una licencia de construcción.
 *
 * ## Por qué el medianero se mide al eje y no a paño
 *
 * Porque es lo que hace que el número sirva. Con este criterio la suma de las
 * áreas construidas de todos los locales de una planta es EXACTAMENTE la huella
 * construida del edificio: los locales teselan el contorno exterior desplazado
 * medio grosor hacia fuera, partiéndoselo por los ejes de los medianeros, sin
 * hueco y sin solape. Si el medianero se midiera a paño por los dos lados, cada
 * tabique interior se contaría dos veces y el cuadro sumaría más metros de los
 * que tiene el predio; si se midiera a paño por ninguno, faltarían. Un cuadro de
 * áreas cuya suma no es la huella no se puede presentar.
 *
 * ## Lo que no se aproxima
 *
 * Dos lados consecutivos paralelos no tienen esquina: las rectas desplazadas no
 * se cortan. Ahí el área se declara AUSENTE, con su motivo, en vez de
 * inventarse una. Un número aproximado en un cuadro de áreas es peor que
 * ninguno porque se copia al proyecto ejecutivo y nadie vuelve a mirarlo.
 *
 * Este módulo es geometría pura: no conoce muros, ni entidades, ni documento.
 * Vive aparte de `bim-schedule.ts` para que el cuadro siga siendo legible.
 */
import type { CadPoint2 } from "./cad-document";

/**
 * Un lado del anillo, con el desplazamiento que se le aplica antes de cerrar
 * las esquinas. El signo es POSITIVO hacia la izquierda de `from → to`, que en
 * un anillo recorrido en sentido antihorario —el que produce área positiva— es
 * hacia dentro del local.
 */
export interface CadOffsetSide {
  from: CadPoint2;
  to: CadPoint2;
  offset: number;
}

/** Un lado del anillo a ejes, con lo que hace falta saber para medirlo. */
export interface CadRoomSide {
  from: CadPoint2;
  to: CadPoint2;
  /** Grosor del muro que produjo el lado. */
  thickness: number;
  /**
   * `true` cuando al otro lado de ese muro hay OTRO local (medianero) y
   * `false` cuando lo que hay es la calle o un patio (perimetral). Es la única
   * distinción que separa el área construida del área a ejes.
   */
  shared: boolean;
}

/** Por qué un área no está definida. Nunca se sustituye por un número. */
export type CadAreaFailure =
  /** Un lado de longitud nula: no tiene dirección y no define recta. */
  | "degenerate"
  /** Dos lados consecutivos paralelos: sus rectas desplazadas no se cortan. */
  | "parallel"
  /**
   * El contorno desplazado se PLIEGA: algún lado acaba recorrido al revés que
   * el original —el local es más estrecho que sus propios muros— o el área
   * sale nula o negativa. Comprobar sólo el signo del área no basta: en un
   * local cuadrado el pliegue es simétrico y el área vuelve a salir positiva,
   * de modo que un cuarto de 1,00 × 1,00 con muros de 1,20 declararía 0,04 m²
   * de superficie útil en vez de decir que no tiene.
   */
  | "collapsed";

export interface CadAreaResult {
  /** El área, o `null` con su motivo en `failure`. */
  area: number | null;
  failure?: CadAreaFailure;
}

/**
 * Área del anillo que resulta de desplazar cada lado y resolver cada esquina
 * por INTERSECCIÓN de los dos lados desplazados.
 *
 * Es el mismo criterio con el que se limpia un inglete en `wall-joins.ts`: la
 * esquina de dos muros de grosores distintos cae donde se cortan sus caras, no
 * en una media de nada. Por eso el área construida de una planta con muros de
 * 250 y tabiques de 150 sale exacta y no aproximada.
 */
export function cadOffsetRingArea(
  sides: readonly CadOffsetSide[],
): CadAreaResult {
  const lines: { point: CadPoint2; direction: CadPoint2 }[] = [];
  for (const side of sides) {
    const dx = side.to.x - side.from.x;
    const dy = side.to.y - side.from.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) return { area: null, failure: "degenerate" };
    // Normal izquierda unitaria por el desplazamiento pedido.
    const nx = (-dy / length) * side.offset;
    const ny = (dx / length) * side.offset;
    lines.push({
      point: { x: side.from.x + nx, y: side.from.y + ny },
      direction: { x: dx / length, y: dy / length },
    });
  }
  if (lines.length < 3) return { area: null, failure: "degenerate" };

  const corners: CadPoint2[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const next = lines[(index + 1) % lines.length];
    const cross =
      current.direction.x * next.direction.y -
      current.direction.y * next.direction.x;
    if (Math.abs(cross) < 1e-9) return { area: null, failure: "parallel" };
    const dx = next.point.x - current.point.x;
    const dy = next.point.y - current.point.y;
    const t = (dx * next.direction.y - dy * next.direction.x) / cross;
    corners.push({
      x: current.point.x + current.direction.x * t,
      y: current.point.y + current.direction.y * t,
    });
  }

  // Cada lado desplazado va de la esquina anterior a la suya. Si acaba
  // apuntando al revés que el lado original, el contorno se plegó y lo que
  // encierra ya no es este local.
  for (let index = 0; index < corners.length; index += 1) {
    const previous = corners[(index - 1 + corners.length) % corners.length];
    const current = corners[index];
    const { direction } = lines[index];
    if (
      (current.x - previous.x) * direction.x +
        (current.y - previous.y) * direction.y <
      0
    )
      return { area: null, failure: "collapsed" };
  }

  let total = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const from = corners[index];
    const to = corners[(index + 1) % corners.length];
    total += from.x * to.y - to.x * from.y;
  }
  const area = total / 2;
  return area > 0 ? { area } : { area: null, failure: "collapsed" };
}

/**
 * Área ÚTIL: todos los lados medio grosor hacia DENTRO, sea el muro perimetral
 * o medianero. Lo que se habita no distingue de qué lado está el vecino.
 *
 * `collapsed` es el local más estrecho que sus propios muros: al meter los
 * lados el contorno se cruza y el área sale negativa. No hay área útil que dar.
 */
export function cadRoomClearArea(
  sides: readonly CadRoomSide[],
): CadAreaResult {
  return cadOffsetRingArea(
    sides.map((side) => ({
      from: side.from,
      to: side.to,
      offset: side.thickness / 2,
    })),
  );
}

/**
 * Área CONSTRUIDA: a paño exterior en los muros perimetrales, al eje en los
 * medianeros. Véase la cabecera sobre por qué esa asimetría es justo lo que
 * hace que las áreas construidas de la planta sumen su huella.
 */
export function cadRoomBuiltArea(
  sides: readonly CadRoomSide[],
): CadAreaResult {
  return cadOffsetRingArea(
    sides.map((side) => ({
      from: side.from,
      to: side.to,
      offset: side.shared ? 0 : -side.thickness / 2,
    })),
  );
}
