/**
 * El PLANO DE IMAGEN: aplanar el mundo, y hacerlo barato de consultar.
 *
 * Todo lo que separa un punto del mundo de un punto del dibujo vive aquí, y
 * nada más vive aquí. Se separó de `hidden-line-solver.ts` porque son dos
 * responsabilidades con dos formas distintas de estar mal: una proyección se
 * equivoca en MILÍMETROS y se comprueba contra la trigonometría; un algoritmo
 * de visibilidad se equivoca en ARISTAS y se comprueba contando. Mezclarlas
 * daba un archivo en el que un fallo de tres milímetros y una arista de más se
 * depuran en el mismo sitio.
 *
 * ## La base, y por qué sale la planta de siempre
 *
 * `right = forward × up`, `up' = right × forward`. Con la mirada cenital
 * (`forward = -Z`) y la vertical por defecto, sale `u = x`, `v = y`: la planta
 * del dibujo, sin ninguna permutación escrita a mano. Con la mirada horizontal
 * hacia +Y sale `u = x`, `v = z`: el alzado frontal. Que las vistas normalizadas
 * caigan solas de la base es la señal de que la base es la correcta.
 *
 * ## Lo que la perspectiva rompe si no se mira
 *
 * Un segmento recto del mundo se proyecta recto, también en perspectiva. Lo que
 * NO es lineal es la profundidad: recorrer la imagen a paso constante no recorre
 * el segmento a paso constante. Lo lineal sobre la imagen es `1/profundidad`, y
 * de ahí sale `cadPointAtImageParam`. Sin esa corrección, el punto medio de un
 * trozo de arista se calcula donde no está, y la consulta de visibilidad
 * responde sobre otro punto del espacio — un error que en paralela no existe y
 * que en perspectiva no se ve hasta que el sólido está cerca.
 *
 * ## Por qué hay una rejilla y no un árbol
 *
 * La consulta que domina el coste es «qué caras cubren este punto de la
 * imagen», repetida decenas de miles de veces sobre un conjunto de caras que no
 * cambia. Una rejilla uniforme la resuelve en tiempo constante con un solo
 * acceso a un array, se construye en una pasada y no reequilibra nada. Un árbol
 * BVH ganaría con caras muy desiguales; en una escena de arquitectura las caras
 * son de tamaños parecidos y el árbol sólo añadiría punteros y una recursión.
 */
import type { Vec3 } from "../../brep";

/** Por debajo de esto una cara se considera vista de canto y no tapa nada. */
export const CAD_IMAGE_GRAZING = 1e-12;

export type CadHiddenLineErrorCode =
  /** Dirección de mirada nula, o base de vista degenerada. */
  | "vista-degenerada"
  /** Una cara que no es plana: el test de profundidad no está definido sobre ella. */
  | "cara-no-plana"
  /** Perspectiva con geometría en el plano del ojo o detrás de él. */
  | "detras-del-observador"
  /** No se dio ningún cuerpo con aristas: no hay nada que proyectar. */
  | "escena-vacia";

export interface CadHiddenLineFailure {
  ok: false;
  code: CadHiddenLineErrorCode;
  message: string;
}

export const cadHiddenLineFailure = (
  code: CadHiddenLineErrorCode,
  message: string,
): CadHiddenLineFailure => ({ ok: false, code, message });

// ---------------------------------------------------------------------------
// Álgebra mínima
//
// No se usa `vec3.ts` en el bucle caliente: sus funciones devuelven objetos
// nuevos por componente y aquí se llaman millones de veces. Estas cuatro son
// las mismas cuentas sin la indirección.
// ---------------------------------------------------------------------------

export const v3dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const v3sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export const v3cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export function v3unit(vector: Vec3): Vec3 | null {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!(length > 1e-15)) return null;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

// ---------------------------------------------------------------------------
// La base de la vista
// ---------------------------------------------------------------------------

/**
 * Base ortonormal de la vista. `forward` va del ojo hacia la escena, así que la
 * profundidad crece al alejarse; `right` y `up` son los ejes de la imagen, y son
 * exactamente los que se convierten en la X y la Y del dibujo 2D emitido.
 */
export interface CadProjectionFrame {
  kind: "parallel" | "perspective";
  /** Origen de coordenadas de imagen. En perspectiva es el ojo. */
  origin: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  /**
   * Distancia ojo–plano de imagen, sólo en perspectiva. Quien la construye pasa
   * la distancia al centro de la escena para que allí la escala sea 1:1 y el
   * error en milímetros signifique algo.
   */
  focal: number;
}

export interface CadProjectionFrameInput {
  kind: "parallel" | "perspective";
  /** Mirada en paralela; en perspectiva se deriva de `eye` y `towards`. */
  direction?: Vec3;
  eye?: Vec3;
  towards?: Vec3;
  up?: Vec3;
  focal?: number;
}

/**
 * Base ortonormal a partir de la vista. Falla cerrado ante una mirada nula: una
 * proyección sin dirección no es una proyección aproximada, no es nada.
 */
export function cadProjectionFrame(
  input: CadProjectionFrameInput,
): CadProjectionFrame | CadHiddenLineFailure {
  const eye = input.eye ?? { x: 0, y: 0, z: 0 };
  const raw =
    input.kind === "parallel"
      ? (input.direction ?? { x: 0, y: 0, z: 0 })
      : v3sub(input.towards ?? { x: 0, y: 0, z: 0 }, eye);
  const forward = v3unit(raw);
  if (!forward)
    return cadHiddenLineFailure("vista-degenerada", "La dirección de mirada tiene longitud cero.");

  // La vertical por defecto es la Z del mundo. Con mirada cenital la Z no define
  // ninguna vertical de pantalla, y se cae a la Y — que es justo lo que
  // convierte «mirar desde arriba» en la PLANTA de siempre.
  const candidates: Vec3[] = [
    input.up ?? { x: 0, y: 0, z: 1 },
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
  ];
  let right: Vec3 | null = null;
  for (const candidate of candidates) {
    const normalized = v3unit(candidate);
    if (!normalized) continue;
    if (Math.abs(v3dot(normalized, forward)) > 1 - 1e-9) continue;
    right = v3unit(v3cross(forward, normalized));
    if (right) break;
  }
  if (!right)
    return cadHiddenLineFailure("vista-degenerada", "La vertical de la vista es paralela a la mirada.");

  return {
    kind: input.kind,
    origin: input.kind === "perspective" ? eye : { x: 0, y: 0, z: 0 },
    right,
    up: v3cross(right, forward),
    forward,
    focal: input.focal ?? 1,
  };
}

export interface CadImagePoint {
  u: number;
  v: number;
  /** Distancia a lo largo de la mirada. Más grande es más lejos. */
  depth: number;
}

/** Un punto del mundo, aplanado. `null` si en perspectiva cae detrás del ojo. */
export function cadProjectPoint(frame: CadProjectionFrame, point: Vec3): CadImagePoint | null {
  const w = v3sub(point, frame.origin);
  const depth = v3dot(w, frame.forward);
  if (frame.kind === "parallel") return { u: v3dot(w, frame.right), v: v3dot(w, frame.up), depth };
  if (!(depth > CAD_IMAGE_GRAZING)) return null;
  const k = frame.focal / depth;
  return { u: v3dot(w, frame.right) * k, v: v3dot(w, frame.up) * k, depth };
}

/**
 * Punto 3D correspondiente al parámetro `s` MEDIDO SOBRE LA IMAGEN.
 *
 * En paralela `s` y el parámetro del segmento coinciden. En perspectiva no: lo
 * lineal sobre la imagen es `1/profundidad`, y usar `s` como parámetro del
 * segmento pondría el punto donde no está.
 */
export function cadPointAtImageParam(
  a: Vec3,
  b: Vec3,
  d0: number,
  d1: number,
  s: number,
  perspective: boolean,
): Vec3 {
  const t = perspective ? (s * d0) / (d1 + s * (d0 - d1)) : s;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/** El recíproco: parámetro de IMAGEN a partir del parámetro del SEGMENTO. */
export function cadImageParamAtPoint(d0: number, d1: number, t: number, perspective: boolean): number {
  if (!perspective) return t;
  return (t * d1) / (d0 + t * (d1 - d0));
}

/** Profundidad del segmento en el parámetro de imagen `s`. */
export function cadDepthAtImageParam(d0: number, d1: number, s: number, perspective: boolean): number {
  if (!perspective) return d0 + (d1 - d0) * s;
  return (d0 * d1) / (d1 + s * (d0 - d1));
}

// ---------------------------------------------------------------------------
// La rejilla
// ---------------------------------------------------------------------------

/** Rejilla uniforme sobre la imagen: cubos de índices por celda. */
export interface CadImageGrid {
  cols: number;
  rows: number;
  minU: number;
  minV: number;
  cellU: number;
  cellV: number;
  buckets: number[][];
}

export function cadImageGrid(
  minU: number,
  minV: number,
  maxU: number,
  maxV: number,
  items: number,
): CadImageGrid {
  // Una celda por elemento da, en una escena repartida, del orden de un elemento
  // por consulta. Se acota a 128×128 porque la rejilla se recorre entera al
  // construirla y una escena de tres cajas no debe pagar un millón de celdas.
  const side = Math.max(1, Math.min(128, Math.round(Math.sqrt(Math.max(1, items)))));
  const width = Math.max(maxU - minU, 1e-9);
  const height = Math.max(maxV - minV, 1e-9);
  return {
    cols: side,
    rows: side,
    minU,
    minV,
    cellU: width / side,
    cellV: height / side,
    buckets: Array.from({ length: side * side }, () => [] as number[]),
  };
}

export function cadImageGridColumn(grid: CadImageGrid, u: number): number {
  return Math.max(0, Math.min(grid.cols - 1, Math.floor((u - grid.minU) / grid.cellU)));
}

export function cadImageGridRow(grid: CadImageGrid, v: number): number {
  return Math.max(0, Math.min(grid.rows - 1, Math.floor((v - grid.minV) / grid.cellV)));
}

export function cadImageGridInsert(
  grid: CadImageGrid,
  index: number,
  minU: number,
  minV: number,
  maxU: number,
  maxV: number,
): void {
  const c0 = cadImageGridColumn(grid, minU);
  const c1 = cadImageGridColumn(grid, maxU);
  const r0 = cadImageGridRow(grid, minV);
  const r1 = cadImageGridRow(grid, maxV);
  for (let row = r0; row <= r1; row += 1)
    for (let col = c0; col <= c1; col += 1) grid.buckets[row * grid.cols + col].push(index);
}

/** Cubo de la celda que contiene el punto. Una cara que cubre el punto está aquí. */
export function cadImageGridBucketAt(grid: CadImageGrid, u: number, v: number): readonly number[] {
  return grid.buckets[cadImageGridRow(grid, v) * grid.cols + cadImageGridColumn(grid, u)];
}

// ---------------------------------------------------------------------------
// Predicados planos
// ---------------------------------------------------------------------------

/**
 * ¿Está el punto dentro del polígono con agujeros ya proyectado?
 *
 * Número de cruces sobre TODOS los lazos a la vez, paridad impar = dentro. Los
 * agujeros salen gratis: un punto dentro de un agujero cruza el exterior una vez
 * y el agujero otra, y la paridad vuelve a par. No se mira el sentido de
 * recorrido a propósito, porque la proyección puede invertirlo.
 */
export function cadPointInProjectedLoops(
  loops: readonly Float64Array[],
  u: number,
  v: number,
): boolean {
  let inside = false;
  for (const loop of loops) {
    const count = loop.length / 2;
    for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
      const ui = loop[i * 2];
      const vi = loop[i * 2 + 1];
      const uj = loop[j * 2];
      const vj = loop[j * 2 + 1];
      if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
    }
  }
  return inside;
}

/**
 * Parámetro sobre `[p0,p1]` donde cruza `[q0,q1]`, o `null` si no se cruzan.
 *
 * Los casos paralelos se dejan pasar: dos segmentos paralelos no cambian la
 * visibilidad al «cruzarse», y forzar un corte allí sólo añade trozos. Los
 * extremos también se excluyen — una arista que ARRANCA en un contorno no lo
 * cruza, y cortar en 0 produciría un trozo de longitud cero.
 */
export function cadSegmentCrossParameter(
  pu0: number,
  pv0: number,
  pu1: number,
  pv1: number,
  qu0: number,
  qv0: number,
  qu1: number,
  qv1: number,
): number | null {
  const rx = pu1 - pu0;
  const ry = pv1 - pv0;
  const sx = qu1 - qu0;
  const sy = qv1 - qv0;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-15) return null;
  const dx = qu0 - pu0;
  const dy = qv0 - pv0;
  const t = (dx * sy - dy * sx) / denominator;
  const w = (dx * ry - dy * rx) / denominator;
  if (t <= 0 || t >= 1 || w < 0 || w > 1) return null;
  return t;
}
