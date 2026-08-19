/**
 * Geometría DERIVADA del hueco alojado: dónde cae, qué corta y cómo se dibuja.
 *
 * Es a `CadOpeningEntity` lo que `wall-geometry.ts` es a `CadWallEntity`: el
 * único sitio donde la receta —anfitrión, distancia sobre el eje, anchura— se
 * convierte en puntos. Y por la misma razón: el adaptador de entidad, el
 * contorno del muro que se parte para dejar pasar el hueco, la
 * previsualización del comando y el recuento de cantidades tienen que hablar de
 * EXACTAMENTE el mismo rectángulo. Dos cálculos distintos del mismo hueco
 * producen un plano en el que la puerta que se ve no es la que se exporta.
 *
 * Es una HOJA del grafo de carga: sólo importa tipos y la derivación base del
 * muro, que es hoja a su vez.
 *
 * ## El hueco vive en el marco del EJE, no en el mundo
 *
 * Todo lo de aquí se calcula sobre el eje del anfitrión: `t` es la distancia
 * desde `start`, `u` la dirección unitaria del eje y `n` su normal izquierda.
 * Llevar al mundo es la última operación de cada función. Ése es el motivo de
 * que mover, girar o escalar el muro arrastre sus huecos sin una sola línea de
 * código que los persiga: el marco se mueve y el hueco está dentro.
 *
 * ## Lo que NO cabe se RECHAZA, no se recorta
 *
 * Un hueco que sobresale del muro se descarta entero (`wallOpeningFit`) en vez
 * de recortarse contra el extremo. Recortarlo dibujaría media puerta pegada a
 * una esquina —creíble, medible, y falsa— y la tabla de cantidades contaría un
 * hueco de una anchura que nadie pidió. La frontera del servidor rechaza esos
 * documentos; esta función es la que hace que el editor tampoco los dibuje
 * mientras tanto.
 */
import type { CadEntity, CadPoint2 } from "./cad-document";
import type { CadOpeningEntity } from "./cad-entities-v7";
import type { CadWallPlanRecipe } from "./wall-geometry";

/** Lo mínimo del hueco para situarlo: dónde está su centro y cuánto mide. */
export type CadOpeningPlanRecipe = Pick<CadOpeningEntity, "position" | "width">;

/**
 * Holgura mínima de muro a cada lado del hueco, en fracción de su anchura.
 *
 * Un hueco que llega EXACTAMENTE al extremo del muro deja una jamba de espesor
 * cero: en el dibujo es una cara partida en un punto y en obra no existe. Se
 * exige que el hueco quepa con sus dos jambas dentro del eje; el mínimo es
 * cero-estricto, no una holgura inventada, porque cuánto pide una jamba lo
 * decide el proyecto y no este módulo.
 */
export const CAD_OPENING_MIN_JAMB = 0;

/** Marco local del eje del muro. `null` si la receta es degenerada. */
export interface CadWallAxisFrame {
  origin: CadPoint2;
  /** Dirección unitaria de `start` a `end`. */
  u: CadPoint2;
  /** Normal unitaria a la IZQUIERDA de `u`. Misma que usa `wallFootprint`. */
  n: CadPoint2;
  length: number;
  /** Media anchura del muro; el grosor se reparte simétrico sobre el eje. */
  half: number;
}

export function wallAxisFrame(wall: CadWallPlanRecipe): CadWallAxisFrame | null {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9) || !(wall.thickness > 0)) return null;
  return {
    origin: { x: wall.start.x, y: wall.start.y },
    u: { x: dx / length, y: dy / length },
    n: { x: -dy / length, y: dx / length },
    length,
    half: wall.thickness / 2,
  };
}

/** Punto del mundo a partir de coordenadas del marco del eje. */
export function wallAxisPoint(frame: CadWallAxisFrame, t: number, offset: number): CadPoint2 {
  return {
    x: frame.origin.x + frame.u.x * t + frame.n.x * offset,
    y: frame.origin.y + frame.u.y * t + frame.n.y * offset,
  };
}

/** Parámetro sobre el eje de un punto del mundo. Es la proyección, sin más. */
export function wallAxisParameter(frame: CadWallAxisFrame, point: CadPoint2): number {
  return (point.x - frame.origin.x) * frame.u.x + (point.y - frame.origin.y) * frame.u.y;
}

/** Intervalo `[from, to]` que el hueco ocupa sobre el eje del anfitrión. */
export interface CadOpeningSpan {
  from: number;
  to: number;
}

export function wallOpeningSpan(opening: CadOpeningPlanRecipe): CadOpeningSpan {
  const half = opening.width / 2;
  return { from: opening.position - half, to: opening.position + half };
}

/**
 * ¿Cabe este hueco en este muro? Devuelve el PROBLEMA cuando no, con números.
 *
 * Se contesta con un motivo y no con un booleano porque los tres consumidores
 * quieren cosas distintas de la respuesta: el adaptador la usa para no dibujar,
 * el comando para negarse a colocar diciendo por qué, y el recuento para
 * declarar el hueco inválido en vez de sumarlo. Un booleano habría obligado a
 * los tres a reconstruir el mensaje, cada uno a su manera.
 */
export function wallOpeningFit(
  wall: CadWallPlanRecipe,
  opening: CadOpeningPlanRecipe,
): { ok: true } | { ok: false; problem: string } {
  const frame = wallAxisFrame(wall);
  if (!frame) return { ok: false, problem: "El muro anfitrión tiene una receta degenerada." };
  if (!(opening.width > 0))
    return { ok: false, problem: `Un hueco necesita una anchura positiva y mide ${opening.width}.` };
  const span = wallOpeningSpan(opening);
  if (span.from < CAD_OPENING_MIN_JAMB)
    return {
      ok: false,
      problem:
        `El hueco empieza en ${round(span.from)} sobre el eje y el muro empieza en 0: ` +
        `no queda jamba en el arranque.`,
    };
  if (span.to > frame.length - CAD_OPENING_MIN_JAMB)
    return {
      ok: false,
      problem:
        `El hueco acaba en ${round(span.to)} sobre el eje y el muro mide ${round(frame.length)}: ` +
        `no queda jamba en el final.`,
    };
  return { ok: true };
}

function round(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : String(value);
}

/**
 * Intervalos que los huecos VÁLIDOS quitan del eje, ordenados y FUSIONADOS.
 *
 * Se fusionan los que se solapan a propósito. Dos huecos superpuestos son un
 * error de proyecto y el servidor los rechaza, pero mientras el documento vive
 * en memoria hay que dibujar algo: dos intervalos solapados sin fusionar
 * partirían la cara en trozos con extremos cruzados, que es un contorno roto.
 * Fusionados, la cara sale con un solo vano — feo, y honesto.
 */
export function wallOpeningIntervals(
  wall: CadWallPlanRecipe,
  openings: readonly CadOpeningPlanRecipe[],
): CadOpeningSpan[] {
  const spans = openings
    .filter((opening) => wallOpeningFit(wall, opening).ok)
    .map(wallOpeningSpan)
    .sort((a, b) => a.from - b.from);
  const merged: CadOpeningSpan[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }
  return merged;
}

/**
 * Parte un segmento de CARA por los intervalos de hueco.
 *
 * La cara se recibe con sus dos extremos y con el parámetro de eje de cada uno
 * (`tA`, `tB`), no como una recta paralela al eje: con uniones en inglete las
 * caras del muro NO son paralelas al eje y sus extremos no caen en 0 y en la
 * longitud. Interpolar dentro de la cara con la fracción del parámetro es lo
 * que hace que el hueco caiga en el mismo sitio en las dos caras aunque una sea
 * más larga que la otra.
 */
export function splitFaceByIntervals(
  a: CadPoint2,
  b: CadPoint2,
  tA: number,
  tB: number,
  intervals: readonly CadOpeningSpan[],
): { points: CadPoint2[]; closed: boolean }[] {
  if (intervals.length === 0) return [{ points: [a, b], closed: false }];
  const span = tB - tA;
  if (Math.abs(span) < 1e-12) return [{ points: [a, b], closed: false }];
  const at = (t: number): CadPoint2 => {
    const k = (t - tA) / span;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
  const pieces: { points: CadPoint2[]; closed: boolean }[] = [];
  let cursor = tA;
  for (const interval of intervals) {
    const from = Math.max(cursor, Math.min(interval.from, tB));
    const to = Math.max(cursor, Math.min(interval.to, tB));
    if (from > cursor + 1e-9) pieces.push({ points: [at(cursor), at(from)], closed: false });
    cursor = Math.max(cursor, to);
  }
  if (cursor < tB - 1e-9) pieces.push({ points: [at(cursor), at(tB)], closed: false });
  return pieces;
}

/**
 * Las dos JAMBAS del hueco: los cantos de obra que cierran el vano de cara a
 * cara. Las dibuja el HUECO y no el muro, para que borrar la puerta devuelva la
 * cara continua sin que el muro tenga que enterarse de nada.
 *
 * Se calculan sobre las caras REALES que se le pasan —las del contorno ya
 * ajustado por las uniones— por lo mismo que `splitFaceByIntervals`: en un muro
 * con inglete, una jamba trazada del eje hacia fuera con media anchura a cada
 * lado no llegaría a la cara.
 */
export interface CadWallFaces {
  /** Cara izquierda del eje: de `startLeft` a `endLeft`. */
  left: { a: CadPoint2; b: CadPoint2; tA: number; tB: number };
  /** Cara derecha del eje: de `startRight` a `endRight`. */
  right: { a: CadPoint2; b: CadPoint2; tA: number; tB: number };
}

/** Las dos caras largas del contorno, con el parámetro de eje de sus extremos. */
export function wallFaces(frame: CadWallAxisFrame, footprint: readonly CadPoint2[]): CadWallFaces {
  const [startLeft, startRight, endRight, endLeft] = footprint;
  return {
    left: {
      a: startLeft,
      b: endLeft,
      tA: wallAxisParameter(frame, startLeft),
      tB: wallAxisParameter(frame, endLeft),
    },
    right: {
      a: startRight,
      b: endRight,
      tA: wallAxisParameter(frame, startRight),
      tB: wallAxisParameter(frame, endRight),
    },
  };
}

function facePoint(face: CadWallFaces["left"], t: number): CadPoint2 {
  const span = face.tB - face.tA;
  const k = Math.abs(span) < 1e-12 ? 0 : (t - face.tA) / span;
  return { x: face.a.x + (face.b.x - face.a.x) * k, y: face.a.y + (face.b.y - face.a.y) * k };
}

export function wallOpeningJambs(
  faces: CadWallFaces,
  span: CadOpeningSpan,
): { points: CadPoint2[]; closed: boolean }[] {
  return [
    { points: [facePoint(faces.left, span.from), facePoint(faces.right, span.from)], closed: false },
    { points: [facePoint(faces.left, span.to), facePoint(faces.right, span.to)], closed: false },
  ];
}

/**
 * El símbolo de FÁBRICA del hueco, en planta.
 *
 * No pretende sustituir al bloque del estudio —para eso está `symbolBlock`—:
 * es lo que se dibuja cuando no hay uno, y tiene que ser reconocible al primer
 * vistazo por alguien que lleva veinte años leyendo plantas.
 *
 *  - **Puerta**: hoja perpendicular al muro desde la jamba de bisagra, del
 *    ancho del hueco, y arco de 90° hasta el otro canto. Es el símbolo de toda
 *    la vida y además DICE algo verdadero: por dónde barre y cuánto espacio se
 *    lleva por delante.
 *  - **Ventana**: el vidrio en el eje y las dos líneas de carpintería. Tres
 *    trazos y ninguno decorativo — sin las de carpintería, una ventana y un
 *    hueco de paso se dibujan igual.
 */
export function wallOpeningSymbolPaths(
  frame: CadWallAxisFrame,
  opening: Pick<CadOpeningEntity, "kind" | "position" | "width" | "swing" | "hinge">,
): { points: CadPoint2[]; closed: boolean }[] {
  const span = wallOpeningSpan(opening);
  const side = opening.swing === "right" ? -1 : 1;
  if (opening.kind === "window") {
    const glass = frame.half / 3;
    return [
      { points: [wallAxisPoint(frame, span.from, 0), wallAxisPoint(frame, span.to, 0)], closed: false },
      {
        points: [
          wallAxisPoint(frame, span.from, glass),
          wallAxisPoint(frame, span.to, glass),
        ],
        closed: false,
      },
      {
        points: [
          wallAxisPoint(frame, span.from, -glass),
          wallAxisPoint(frame, span.to, -glass),
        ],
        closed: false,
      },
    ];
  }

  // La puerta gira sobre el canto de bisagra, EN LA CARA por la que barre: es
  // donde está el marco, y trazar el arco desde el eje dejaría la hoja metida
  // medio muro dentro de la pared.
  const hingeT = opening.hinge === "end" ? span.to : span.from;
  const otherT = opening.hinge === "end" ? span.from : span.to;
  const pivot = wallAxisPoint(frame, hingeT, side * frame.half);
  const leafTip = wallAxisPoint(frame, hingeT, side * (frame.half + opening.width));
  const closedTip = wallAxisPoint(frame, otherT, side * frame.half);
  return [
    { points: [pivot, leafTip], closed: false },
    { points: arcPoints(pivot, leafTip, closedTip), closed: false },
  ];
}

/**
 * Arco de barrido, teselado.
 *
 * Se tesela aquí y no se devuelve como arco porque el vocabulario de trazos del
 * registro de entidades son POLILÍNEAS: el hueco se dibuja, se pincha y se
 * acota con los mismos puntos, y un arco «de verdad» obligaría a que cada
 * consumidor lo teselase por su cuenta con su propio número de tramos —y a que
 * el hit-test y el render dejasen de coincidir.
 */
function arcPoints(center: CadPoint2, from: CadPoint2, to: CadPoint2, segments = 16): CadPoint2[] {
  const radius = Math.hypot(from.x - center.x, from.y - center.y);
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  // El barrido de una hoja es SIEMPRE el menor de los dos arcos: normalizar a
  // (−π, π] es lo que evita que una puerta dibuje los 270° que sobran.
  let sweep = a1 - a0;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep <= -Math.PI) sweep += Math.PI * 2;
  const points: CadPoint2[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = a0 + (sweep * index) / segments;
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return points;
}

/**
 * Marco del SÍMBOLO para un bloque del estudio: dónde va, cuánto gira y cuánto
 * se escala para que ocupe exactamente el hueco.
 *
 * Se devuelve como datos y no como geometría porque quien resuelve un bloque es
 * el adaptador —que tiene el documento— y este módulo es una hoja que no puede
 * importar la tabla de bloques sin cerrar un ciclo.
 */
export interface CadOpeningSymbolFrame {
  insertion: CadPoint2;
  rotationDeg: number;
  /** Factor para que la anchura natural del bloque case con la del hueco. */
  scale: number;
}

export function wallOpeningSymbolFrame(
  frame: CadWallAxisFrame,
  opening: CadOpeningPlanRecipe,
  blockWidth: number,
): CadOpeningSymbolFrame | null {
  if (!(blockWidth > 1e-9) || !(opening.width > 0)) return null;
  return {
    insertion: wallAxisPoint(frame, opening.position, 0),
    rotationDeg: (Math.atan2(frame.u.y, frame.u.x) * 180) / Math.PI,
    scale: opening.width / blockWidth,
  };
}

// ---------------------------------------------------------------------------
// El ALOJAMIENTO como relación, no como geometría
// ---------------------------------------------------------------------------

/**
 * Huecos que se han quedado SIN ANFITRIÓN, para retirarlos.
 *
 * Un `opening` no persiste ni un punto del mundo: su geometría entera sale del
 * eje de su muro. Borrado el muro —o cambiado su tipo por un `replace`—, el
 * hueco no es una entidad huérfana que se pueda seguir dibujando en otro sitio:
 * es una entidad que ya no tiene sitio. Quien ejecuta un lote de comandos la
 * retira EN EL MISMO LOTE, que es lo que hace que «borro el muro» sea un solo
 * paso de deshacer y que el vano quede cerrado: sin hueco no hay intervalo que
 * parta las caras del muro, y la cara vuelve a salir entera sin que nadie la
 * repare.
 *
 * Vive aquí y no en el ejecutor de comandos por dos razones: aquel archivo está
 * bajo el techo de tamaño, y esto es la regla del ALOJAMIENTO —quién puede
 * hospedar a quién— que es de este módulo aunque no sea geometría.
 *
 * Recibe el mapa de entidades VIVAS del lote en curso, no el documento: el
 * anfitrión puede haber muerto en un comando anterior del mismo lote y el
 * documento de partida todavía lo tiene.
 */
export function orphanedOpeningIds(present: ReadonlyMap<string, CadEntity>): string[] {
  const orphans: string[] = [];
  for (const entity of present.values()) {
    if (entity.type !== "opening") continue;
    if (present.get(entity.hostId)?.type === "wall") continue;
    orphans.push(entity.id);
  }
  return orphans;
}
