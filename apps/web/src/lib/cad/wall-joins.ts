/**
 * UNIONES automáticas entre muros — derivadas, nunca persistidas.
 *
 * Dos muros que comparten un extremo no deben dibujarse como dos cajas
 * solapadas con sus testeros dentro de la esquina: en planta se limpian — el
 * inglete en L, el empalme en T, la continuación colineal. Este módulo calcula
 * esa limpieza como FUNCIÓN PURA de las recetas (`eje + grosor`) de los muros
 * implicados. El documento canónico no cambia de esquema: la unión no viaja,
 * se rederiva cada vez que alguien dibuja, igual que el propio contorno del
 * muro en `wall-geometry.ts`. Mover un muro deshace y rehace sus uniones sin
 * que nadie las haya guardado — esa es exactamente la recompensa que se buscó
 * al persistir la receta y no el polígono.
 *
 * ## El modelo de ajuste: cuatro esquinas que se deslizan por sus caras
 *
 * El contorno base tiene cuatro esquinas y este módulo NO añade vértices: cada
 * unión se expresa como una EXTENSIÓN (+) o un RECORTE (−) de cada cara,
 * medido a lo largo del eje en cada extremo, más la decisión de si el testero
 * de ese extremo se dibuja o queda absorbido dentro de la masa del otro muro.
 * Mantener el anillo en cuatro puntos es una restricción deliberada de la ola
 * 1: los casos que pedirían vértices extra (bisel explícito, T con rotura de
 * la cara del pasante) degradan a la variante de cuatro puntos más honesta.
 *
 * ## Tolerancias — pequeñas a propósito
 *
 * El encadenado de WALL y los OSNAP producen coincidencia EXACTA de extremos
 * (el mismo punto confirmado alimenta el final de un tramo y el arranque del
 * siguiente). La tolerancia sólo existe para absorber deriva de coma flotante
 * tras transformaciones; NO para soldar muros que el usuario dejó separados —
 * unir a 5 mm de distancia sería magia destructiva que cambia el dibujo que el
 * usuario ve por uno que no dibujó.
 *
 * Es una HOJA práctica del grafo de carga: sólo importa tipos y la derivación
 * base de `wall-geometry.ts`, que es hoja a su vez.
 */
import type { CadPoint2 } from "./cad-document";
import { wallFootprint, type CadWallPlanRecipe } from "./wall-geometry";

/**
 * Distancia máxima entre dos extremos para considerarlos EL MISMO punto, en
 * unidades del documento. 1e-6 absorbe la deriva de coma flotante de un
 * round-trip de transformaciones y nada más: dos clics distintos jamás caen
 * tan cerca (la rejilla más fina del producto está órdenes de magnitud por
 * encima).
 */
export const CAD_WALL_JOIN_POINT_TOLERANCE = 1e-6;

/**
 * Distancia máxima del extremo que llega al EJE del muro pasante para que la
 * unión sea una T. Constante propia porque mide contra una RECTA, no contra un
 * punto — pero el razonamiento es el mismo: el extremo de una T se coloca con
 * OSNAP (Cercano/Perpendicular) y cae exacto sobre el eje; la tolerancia sólo
 * cubre deriva numérica.
 */
export const CAD_WALL_TEE_AXIS_TOLERANCE = 1e-6;

/**
 * |sen| del ángulo entre ejes por debajo del cual dos muros son COLINEALES y
 * el inglete no está definido (las caras son paralelas: o se continúan o no se
 * cortan nunca). 1e-6 rad ≈ 0,00006°: sólo la continuación dibujada como tal.
 */
export const CAD_WALL_COLLINEAR_SIN = 1e-6;

/**
 * Tope del inglete: ninguna cara se extiende más de este múltiplo del grosor
 * MAYOR de los dos muros. Es el `miterlimit` de SVG/Canvas (4× el ancho de
 * trazo) aplicado al muro: en ángulos por debajo de ~14° la púa del inglete
 * crece sin límite y deja de leerse como esquina; al toparla, la unión degrada
 * a bisel y el testero se DIBUJA como línea de corte visible — mentir con una
 * esquina "limpia" que en realidad quedó abierta sería peor que enseñarla.
 */
export const CAD_WALL_MITER_LIMIT_RATIO = 4;

/** La receta con identidad: lo mínimo para detectar y calcular uniones. */
export interface CadWallJoinWall extends CadWallPlanRecipe {
  id: string;
}

export type CadWallJoinKind = "free" | "corner" | "tee" | "collinear";

/**
 * Ajuste derivado de UN extremo de un muro.
 *
 * `leftExtension`/`rightExtension` mueven la esquina de esa cara A LO LARGO
 * del eje: positivo la extiende más allá del plano del extremo, negativo la
 * recorta hacia dentro. «Izquierda» y «derecha» son las del contorno base
 * (mirando de `start` a `end`), en los DOS extremos — la misma convención que
 * el orden de esquinas de `wallFootprint`.
 */
export interface CadWallJoinEnd {
  kind: CadWallJoinKind;
  /** El muro contra el que se une, o `null` en un extremo libre. */
  otherId: string | null;
  leftExtension: number;
  rightExtension: number;
  /** Si el testero de este extremo se dibuja (`true`) o queda absorbido. */
  cap: boolean;
}

export interface CadWallJoins {
  start: CadWallJoinEnd;
  end: CadWallJoinEnd;
}

const FREE_END: CadWallJoinEnd = {
  kind: "free",
  otherId: null,
  leftExtension: 0,
  rightExtension: 0,
  cap: true,
};

interface WallFrame {
  wall: CadWallJoinWall;
  length: number;
  /** Dirección unitaria de `start` a `end`. */
  u: CadPoint2;
  /** Normal unitaria a la IZQUIERDA del eje. */
  n: CadPoint2;
  half: number;
}

const cross = (a: CadPoint2, b: CadPoint2): number => a.x * b.y - a.y * b.x;
const dot = (a: CadPoint2, b: CadPoint2): number => a.x * b.x + a.y * b.y;

function wallFrame(wall: CadWallJoinWall): WallFrame | null {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9) || !(wall.thickness > 0)) return null;
  const u = { x: dx / length, y: dy / length };
  return { wall, length, u, n: { x: -u.y, y: u.x }, half: wall.thickness / 2 };
}

/** El extremo (`start`/`end`) del otro muro que coincide con `point`, si hay. */
function coincidentEnd(frame: WallFrame, point: CadPoint2): "start" | "end" | null {
  const { wall } = frame;
  if (Math.hypot(wall.start.x - point.x, wall.start.y - point.y) <= CAD_WALL_JOIN_POINT_TOLERANCE)
    return "start";
  if (Math.hypot(wall.end.x - point.x, wall.end.y - point.y) <= CAD_WALL_JOIN_POINT_TOLERANCE)
    return "end";
  return null;
}

/**
 * Extensión firmada de una cara con el tope aplicado.
 *
 * `raw` sale de la intersección exacta; el tope superior es el límite de
 * inglete y el inferior es la longitud del propio muro (un recorte mayor lo
 * consumiría entero e invertiría el anillo). Devuelve también si hubo que
 * topar, porque un inglete topado dibuja su testero como bisel.
 */
function clampExtension(
  raw: number,
  frame: WallFrame,
  other: WallFrame,
): { value: number; clamped: boolean } {
  const miterCap = CAD_WALL_MITER_LIMIT_RATIO * Math.max(frame.wall.thickness, other.wall.thickness);
  if (raw > miterCap) return { value: miterCap, clamped: true };
  if (raw < -frame.length) return { value: -frame.length, clamped: true };
  return { value: raw, clamped: false };
}

/**
 * Inglete en L: cada cara de este muro se corta contra la cara CORRESPONDIENTE
 * del otro — la interior con la interior, la exterior con la exterior. Una
 * cara es «interior» si mira hacia el cuerpo del otro muro: su desplazamiento
 * `ν` cumple `ν·d₂ > 0` (con `d₂` la dirección saliente del otro). Con eso el
 * emparejamiento es un cálculo, no una tabla de casos por cuadrante.
 */
function cornerEnd(
  frame: WallFrame,
  outward: CadPoint2,
  other: WallFrame,
  otherOutward: CadPoint2,
): CadWallJoinEnd {
  const denominator = cross(outward, otherOutward);
  const extensions: number[] = [];
  let clamped = false;
  for (const side of [1, -1] as const) {
    const nu1 = { x: frame.n.x * side, y: frame.n.y * side };
    // La cara del otro que queda al MISMO lado de la esquina que ésta.
    const facing = Math.sign(dot(nu1, otherOutward));
    const otherSide = Math.sign(dot(other.n, outward)) === facing ? 1 : -1;
    const nu2 = { x: other.n.x * otherSide, y: other.n.y * otherSide };
    const offset = {
      x: nu2.x * other.half - nu1.x * frame.half,
      y: nu2.y * other.half - nu1.y * frame.half,
    };
    // P + ν₁·h₁ + t·d = P + ν₂·h₂ + s·d₂ ⇒ t por producto vectorial con d₂.
    const t = cross(offset, otherOutward) / denominator;
    const result = clampExtension(-t, frame, other);
    extensions.push(result.value);
    clamped ||= result.clamped;
  }
  return {
    kind: "corner",
    otherId: other.wall.id,
    leftExtension: extensions[0],
    rightExtension: extensions[1],
    cap: clamped,
  };
}

/**
 * Empalme en T: las dos caras del muro que llega terminan contra la cara
 * CERCANA del pasante (la que mira hacia el cuerpo del que llega), y su
 * testero queda absorbido. El pasante no se toca en esta ola: romper su cara
 * a la altura de la T pediría un contorno de más de cuatro vértices.
 */
function teeEnd(
  frame: WallFrame,
  origin: CadPoint2,
  outward: CadPoint2,
  through: WallFrame,
): CadWallJoinEnd {
  const denominator = dot(outward, through.n);
  // El que llega se desliza casi paralelo al pasante: no hay cara que cortar.
  if (Math.abs(denominator) <= CAD_WALL_COLLINEAR_SIN) return FREE_END;
  const toOrigin = {
    x: origin.x - through.wall.start.x,
    y: origin.y - through.wall.start.y,
  };
  const nearFace = Math.sign(denominator) * through.half;
  const extensions: number[] = [];
  let clamped = false;
  for (const side of [1, -1] as const) {
    const nu1 = { x: frame.n.x * side, y: frame.n.y * side };
    // (P + ν₁·h₁ + t·d − S₂)·n₂ = ±h₂ despejado en t.
    const t = (nearFace - dot(toOrigin, through.n) - dot(nu1, through.n) * frame.half) / denominator;
    const result = clampExtension(-t, frame, through);
    extensions.push(result.value);
    clamped ||= result.clamped;
  }
  return {
    kind: "tee",
    otherId: through.wall.id,
    leftExtension: extensions[0],
    rightExtension: extensions[1],
    cap: clamped,
  };
}

/** Uniones de UN extremo del muro contra el resto del documento. */
function wallEndJoin(
  frame: WallFrame,
  end: "start" | "end",
  others: readonly WallFrame[],
): CadWallJoinEnd {
  const origin = end === "start" ? frame.wall.start : frame.wall.end;
  // Dirección SALIENTE desde el punto de unión hacia el cuerpo del muro.
  const outward = end === "start" ? frame.u : { x: -frame.u.x, y: -frame.u.y };

  const adjacent: { frame: WallFrame; otherOutward: CadPoint2 }[] = [];
  for (const other of others) {
    const shared = coincidentEnd(other, origin);
    if (!shared) continue;
    const otherOutward = shared === "start" ? other.u : { x: -other.u.x, y: -other.u.y };
    adjacent.push({ frame: other, otherOutward });
  }
  // Tres o más muros en el mismo punto: el inglete por pares no está definido
  // (cada pareja pediría una esquina distinta). Se deja el testero — ola 2.
  if (adjacent.length > 1) return FREE_END;
  if (adjacent.length === 1) {
    const { frame: other, otherOutward } = adjacent[0];
    const sin = cross(outward, otherOutward);
    if (Math.abs(sin) <= CAD_WALL_COLLINEAR_SIN) {
      // Mismo eje. Continuación (direcciones opuestas): los testeros
      // interiores se absorben — salvo el del muro ESTRICTAMENTE más grueso,
      // cuyo testero asoma alrededor del delgado y debe verse. Un muro
      // dibujado ENCIMA de otro (misma dirección) no tiene unión limpia.
      if (dot(outward, otherOutward) < 0)
        return {
          kind: "collinear",
          otherId: other.wall.id,
          leftExtension: 0,
          rightExtension: 0,
          cap: frame.wall.thickness > other.wall.thickness + CAD_WALL_JOIN_POINT_TOLERANCE,
        };
      return FREE_END;
    }
    return cornerEnd(frame, outward, other, otherOutward);
  }

  // Sin extremo compartido: ¿toca el eje INTERIOR de un pasante? El margen en
  // los extremos del pasante es la tolerancia de punto: más cerca del extremo
  // ya habría sido esquina.
  const throughs: WallFrame[] = [];
  for (const other of others) {
    const toOrigin = {
      x: origin.x - other.wall.start.x,
      y: origin.y - other.wall.start.y,
    };
    if (Math.abs(dot(toOrigin, other.n)) > CAD_WALL_TEE_AXIS_TOLERANCE) continue;
    const along = dot(toOrigin, other.u);
    if (along <= CAD_WALL_JOIN_POINT_TOLERANCE) continue;
    if (along >= other.length - CAD_WALL_JOIN_POINT_TOLERANCE) continue;
    throughs.push(other);
  }
  // Dos pasantes por el mismo punto es un cruce, no una T: se deja el testero.
  if (throughs.length !== 1) return FREE_END;
  return teeEnd(frame, origin, outward, throughs[0]);
}

/**
 * Las uniones de un muro contra el resto de muros del documento.
 *
 * Puro y por muro: el adaptador lo llama al derivar los trazos de CADA muro,
 * así que el coste es un barrido lineal de los demás muros — no hace falta un
 * índice para los documentos de hoy, y cuando haga falta será una caché
 * delante de esta misma función, no otra función.
 */
export function wallJoins(
  wall: CadWallJoinWall,
  others: readonly CadWallJoinWall[],
): CadWallJoins {
  const frame = wallFrame(wall);
  if (!frame) return { start: FREE_END, end: FREE_END };
  const frames: WallFrame[] = [];
  for (const other of others) {
    if (other.id === wall.id) continue;
    const otherFrame = wallFrame(other);
    if (otherFrame) frames.push(otherFrame);
  }
  return {
    start: wallEndJoin(frame, "start", frames),
    end: wallEndJoin(frame, "end", frames),
  };
}

/**
 * El contorno base con los ajustes aplicados: cada esquina se desliza por su
 * cara la extensión firmada de su extremo. Mismo orden y mismo sentido
 * antihorario que `wallFootprint`; con ambos extremos libres devuelve
 * exactamente el contorno base.
 */
export function wallJoinedFootprint(
  wall: CadWallPlanRecipe,
  joins: CadWallJoins,
): CadPoint2[] | null {
  const base = wallFootprint(wall);
  if (!base) return null;
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy);
  const u = { x: dx / length, y: dy / length };
  const [startLeft, startRight, endRight, endLeft] = base;
  return [
    { x: startLeft.x - u.x * joins.start.leftExtension, y: startLeft.y - u.y * joins.start.leftExtension },
    { x: startRight.x - u.x * joins.start.rightExtension, y: startRight.y - u.y * joins.start.rightExtension },
    { x: endRight.x + u.x * joins.end.rightExtension, y: endRight.y + u.y * joins.end.rightExtension },
    { x: endLeft.x + u.x * joins.end.leftExtension, y: endLeft.y + u.y * joins.end.leftExtension },
  ];
}

/**
 * Los trazos del contorno respetando los testeros absorbidos.
 *
 * Con ambos testeros dibujados es el anillo cerrado de siempre. Un testero
 * absorbido NO se traza — la esquina limpia de toda la vida no enseña la
 * diagonal del inglete ni la línea contra la cara del pasante — así que el
 * contorno pasa a ser una o dos polilíneas ABIERTAS que recorren caras y
 * testeros vivos en el mismo orden del anillo.
 */
export function wallJoinBoundaryPaths(
  footprint: readonly CadPoint2[],
  drawStartCap: boolean,
  drawEndCap: boolean,
): { points: CadPoint2[]; closed: boolean }[] {
  const [startLeft, startRight, endRight, endLeft] = footprint;
  if (drawStartCap && drawEndCap) return [{ points: [...footprint], closed: true }];
  if (drawStartCap)
    return [{ points: [endLeft, startLeft, startRight, endRight], closed: false }];
  if (drawEndCap)
    return [{ points: [startRight, endRight, endLeft, startLeft], closed: false }];
  return [
    { points: [startRight, endRight], closed: false },
    { points: [endLeft, startLeft], closed: false },
  ];
}

/**
 * Ventana [mínimo, máximo] de parámetro a lo largo del eje que sigue siendo
 * del muro tras los RECORTES de sus uniones. El rayado interior se limita a
 * esta ventana: un trazo que siguiera hasta el plano del extremo invadiría la
 * masa del muro vecino que el recorte acaba de ceder. Las EXTENSIONES no
 * amplían la ventana a propósito: rayar el triángulo del inglete pediría
 * recortar trazos contra la diagonal, y un trazo parcial parece un defecto —
 * la misma razón por la que `wallFillSegments` tira los trazos que no caben.
 */
export function wallJoinFillWindow(
  joins: CadWallJoins,
  length: number,
): { min: number; max: number } {
  const startTrim = Math.max(0, -joins.start.leftExtension, -joins.start.rightExtension);
  const endTrim = Math.max(0, -joins.end.leftExtension, -joins.end.rightExtension);
  return { min: startTrim, max: length - endTrim };
}
