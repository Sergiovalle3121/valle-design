/**
 * De lo tecleado a una entrada de comando.
 *
 * Este archivo **es** el diseño de la línea de comandos: el orden en que se
 * intenta interpretar un texto decide qué se siente natural y qué se siente
 * roto. AutoCAD lo resolvió hace décadas y el orden no es arbitrario.
 *
 * ```text
 *  1. 'ZOOM        → comando transparente, sin abandonar el que está en curso
 *  2. C            → palabra clave del prompt actual, si la hay
 *  3. MID          → override de OSNAP para ESTA captura; el paso no avanza
 *  4. 10,20 @5<30  → coordenada
 *  5. 250          → distancia, o entrada directa sobre la dirección del cursor
 *  6. <45          → ángulo
 *  7. cualquier    → texto, si el paso lo admite
 *  8. sin comando  → resolución de alias e invocación
 * ```
 *
 * Los dos puntos que más se notan:
 *
 * - **La palabra clave gana a la coordenada.** Si no, en un PLINE la `C` de
 *   «Cerrar» se interpretaría como un número inválido y el usuario vería un
 *   error donde esperaba una acción.
 * - **El override de OSNAP no consume el paso.** Escribir `MID` no da un punto:
 *   dice «la próxima captura, al punto medio». Modelarlo así es lo que permite
 *   que los catorce modos de `snap-engine.ts` compongan sin que el motor sepa
 *   nada de snaps.
 */
import { parseCoordinate, type Point } from "../precision-input";
import type { SnapType } from "../snap-engine";
import {
  isCadUcsPlanar,
  isCadWorldUcs,
  ucsToWorld,
  worldToUcs,
  type CadNamedUcs,
} from "../ucs";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  type CadCommandInput,
  type CadInputMask,
  type CadPrompt,
} from "./command-types";
import { matchCadKeyword } from "./prompt";
import { resolveCadCommandAlias } from "./alias-table";

/**
 * Overrides de captura de una sola vez, con los mismos tres caracteres que usa
 * AutoCAD. `NON` desactiva el snap para la próxima captura, que es la vía de
 * escape cuando el imán estorba.
 */
export const CAD_OSNAP_OVERRIDES: Readonly<Record<string, readonly SnapType[]>> = {
  END: ["endpoint"],
  ENDP: ["endpoint"],
  MID: ["midpoint"],
  CEN: ["center"],
  GCE: ["geometric-center"],
  NOD: ["node"],
  QUA: ["quadrant"],
  QUAD: ["quadrant"],
  INT: ["intersection"],
  APP: ["apparent-intersection"],
  APPINT: ["apparent-intersection"],
  INS: ["insertion"],
  PER: ["perpendicular"],
  PERP: ["perpendicular"],
  TAN: ["tangent"],
  NEA: ["nearest"],
  NEAR: ["nearest"],
  EXT: ["extension"],
  NON: [],
  NONE: [],
};

export type CadResolvedToken =
  | { kind: "input"; input: CadCommandInput }
  | { kind: "invoke"; command: string; transparent: boolean }
  | { kind: "osnapOverride"; modes: readonly SnapType[] }
  | { kind: "error"; message: string };

export interface CadTokenContext {
  /** Paso activo: sin él, lo tecleado sólo puede ser un nombre de comando. */
  accepts?: CadInputMask;
  prompt?: CadPrompt;
  /** Último punto fijado; base de `@relativo` y de la entrada directa. */
  lastPoint?: Point | null;
  /** Dirección actual del cursor: sin ella la entrada directa no existe. */
  cursor?: Point | null;
  /** Nombres canónicos conocidos. Si falta, no se valida la existencia. */
  knownCommands?: ReadonlySet<string>;
  /**
   * SCU activo. Sin él, lo tecleado son coordenadas del mundo.
   *
   * Es la mitad que faltaba del SCU: hasta ahora el sistema decidía cómo se
   * INFORMABA un punto pero no cómo se ESCRIBÍA, así que en un edificio girado
   * 23,5° había que leer en un sistema y teclear en otro. Con esto, `10,20`
   * significa diez y veinte medidos sobre el plano de trabajo, que es lo que
   * pone la acotación del plano que el dibujante tiene delante.
   */
  ucs?: CadNamedUcs;
}

/**
 * Prefijo que fuerza coordenadas del MUNDO habiendo un SCU activo, como en
 * AutoCAD. Existe porque hay un caso en el que hace falta de verdad: pegar una
 * coordenada que viene de fuera —un replanteo topográfico, un listado del
 * estructurista— sin tener que restituir el SCU universal y volver.
 */
const WORLD_COORDINATE_PREFIX = "*";

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

function accepts(mask: CadInputMask | undefined, flag: number): boolean {
  return ((mask ?? 0) & flag) !== 0;
}

/**
 * Entrada directa de distancia: se teclea un número y el punto sale sobre la
 * dirección en la que ya apunta el cursor. Es el gesto más usado del dibujo
 * profesional —apuntar y escribir 3000— y necesita a la vez el último punto
 * fijado y la posición actual del puntero.
 */
function directDistancePoint(distance: number, last: Point, cursor: Point): Point | null {
  const dx = cursor.x - last.x;
  const dy = cursor.y - last.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9)) return null;
  return { x: last.x + (dx / length) * distance, y: last.y + (dy / length) * distance };
}

export function resolveCadToken(raw: string, context: CadTokenContext): CadResolvedToken {
  const token = raw.trim();
  if (!token) return { kind: "error", message: "Vacío" };

  // 1. Comando transparente.
  if (token.startsWith("'")) {
    const name = resolveCadCommandAlias(token.slice(1), context.knownCommands);
    return name
      ? { kind: "invoke", command: name, transparent: true }
      : { kind: "error", message: `Comando desconocido "${token.slice(1)}".` };
  }

  // 2. Palabra clave del prompt.
  if (accepts(context.accepts, CAD_ACCEPT_KEYWORD) && context.prompt) {
    const keyword = matchCadKeyword(token, context.prompt.options);
    if (keyword) return { kind: "input", input: { kind: "keyword", keyword } };
  }

  // 3. Override de OSNAP: no avanza el paso.
  if (accepts(context.accepts, CAD_ACCEPT_POINT)) {
    const override = CAD_OSNAP_OVERRIDES[token.toUpperCase()];
    if (override) return { kind: "osnapOverride", modes: override };
  }

  // 6. El ángulo se detecta antes que la coordenada porque `<45` empieza por un
  //    carácter que el analizador de coordenadas no reconoce.
  if (token.startsWith("<") && accepts(context.accepts, CAD_ACCEPT_ANGLE)) {
    const degrees = Number(token.slice(1));
    return Number.isFinite(degrees)
      ? { kind: "input", input: { kind: "angle", degrees } }
      : { kind: "error", message: `Ángulo inválido "${token}".` };
  }

  // 5. Número suelto: distancia, o entrada directa sobre la dirección actual.
  if (NUMBER.test(token)) {
    const value = Number(token);
    if (accepts(context.accepts, CAD_ACCEPT_DISTANCE))
      return { kind: "input", input: { kind: "distance", value } };
    if (accepts(context.accepts, CAD_ACCEPT_POINT) && context.lastPoint && context.cursor) {
      // La entrada directa toma la dirección del CURSOR, que vive en el plano de
      // la pantalla. Con un SCU inclinado esa dirección no está en el plano de
      // trabajo y el punto saldría fuera de la cara: se dice, en vez de fijar un
      // punto que parece bueno y está a centímetros de su sitio.
      if (context.ucs && !isCadUcsPlanar(context.ucs))
        return {
          kind: "error",
          message:
            "La entrada directa de distancia toma la dirección del cursor y el SCU activo está inclinado: " +
            "la dirección del cursor no está en su plano. Teclee la coordenada completa.",
        };
      const point = directDistancePoint(value, context.lastPoint, context.cursor);
      if (point) return { kind: "input", input: { kind: "point", point, source: "typed" } };
      return {
        kind: "error",
        message: "Mueve el cursor para fijar la dirección antes de teclear la distancia.",
      };
    }
  }

  // 4. Coordenada, interpretada en el SCU activo.
  if (accepts(context.accepts, CAD_ACCEPT_POINT)) {
    const forcedWorld = token.startsWith(WORLD_COORDINATE_PREFIX);
    const body = forcedWorld ? token.slice(1) : token;
    const ucs = forcedWorld || !context.ucs || isCadWorldUcs(context.ucs) ? null : context.ucs;
    // El punto anterior se lleva ANTES al SCU: `@10,20` es un desplazamiento
    // medido sobre los ejes del sistema de trabajo, y sumarlo en coordenadas
    // del mundo giraría el incremento respecto de lo que se acaba de teclear.
    const last = ucs && context.lastPoint ? worldToUcs(context.lastPoint, ucs) : context.lastPoint;
    const parsed = parseCoordinate(body, { last: last ?? null });
    if (parsed.ok) {
      const point = ucs ? ucsToWorld(parsed.point, ucs) : parsed.point;
      return { kind: "input", input: { kind: "point", point, source: "typed" } };
    }
    // Si el paso NO admite texto, el error del analizador es la mejor
    // explicación disponible y se propaga tal cual.
    if (!accepts(context.accepts, CAD_ACCEPT_TEXT))
      return { kind: "error", message: parsed.error };
  }

  // 7. Texto libre.
  if (accepts(context.accepts, CAD_ACCEPT_TEXT))
    return { kind: "input", input: { kind: "text", value: token } };

  // 8. Sin comando activo: es una invocación.
  if (!context.accepts) {
    const name = resolveCadCommandAlias(token, context.knownCommands);
    return name
      ? { kind: "invoke", command: name, transparent: false }
      : { kind: "error", message: `Comando desconocido "${token}". Pulsa F1 para ayuda.` };
  }

  return { kind: "error", message: `Entrada no válida "${token}".` };
}
