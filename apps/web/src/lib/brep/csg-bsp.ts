/**
 * Árbol BSP para las operaciones booleanas.
 *
 * La partición binaria del espacio resuelve el problema difícil de una booleana
 * —clasificar cada trozo de superficie como dentro o fuera del otro sólido— sin
 * necesidad de ningún test de contención por rayos. La idea, que viene de Naylor
 * y que popularizó `csg.js`: si un polígono se parte recursivamente por los
 * planos del otro sólido, cada fragmento acaba entero a un lado de cada plano, y
 * el lado en el que cae ES su clasificación. No hay casos ambiguos porque no hay
 * fragmentos que crucen nada.
 *
 * EL CASO QUE ROMPE LAS IMPLEMENTACIONES INGENUAS, y que aquí tiene nombre
 * propio: dos sólidos que se tocan EXACTAMENTE en una cara. Sus polígonos son
 * coplanarios, así que no hay "delante" ni "detrás" que decidir por posición. La
 * respuesta está en la ORIENTACIÓN: si las dos normales apuntan al mismo lado,
 * las caras son la misma superficie vista dos veces y una sobra; si apuntan a
 * lados opuestos, son dos superficies que se anulan. Por eso `splitPolygon`
 * tiene DOS cubos coplanarios, `coplanarFront` y `coplanarBack`, y no uno.
 *
 * TOLERANCIA. La clasificación de un vértice usa una banda muerta: fuera de ella
 * está delante o detrás, dentro está EN el plano. Con banda cero, dos caras que
 * deberían ser coplanarias se clasifican como cruzadas por un error de 1e-16 y
 * la booleana produce astillas de área microscópica. La banda se escala con el
 * tamaño del modelo, porque un umbral absoluto que funciona en milímetros es
 * absurdo en kilómetros.
 */
import { v3Add, v3Cross, v3Dot, v3Length, v3Normalize, v3Scale, v3Sub, type Vec3 } from "./vec3";

/** Plano orientado: `normal · p = offset`. */
export interface CsgPlane {
  normal: Vec3;
  offset: number;
}

/** Polígono CONVEXO con su plano. Los polígonos entran triangulados, y partir un convexo da convexos. */
export interface CsgPolygon {
  vertices: Vec3[];
  plane: CsgPlane;
}

const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

export function planeFromPoints(a: Vec3, b: Vec3, c: Vec3): CsgPlane | null {
  const normal = v3Cross(v3Sub(b, a), v3Sub(c, a));
  const length = v3Length(normal);
  if (length === 0) return null;
  const unit = v3Scale(normal, 1 / length);
  return { normal: unit, offset: v3Dot(unit, a) };
}

/** Polígono a partir de sus vértices; `null` si es degenerado. */
export function makePolygon(vertices: readonly Vec3[]): CsgPolygon | null {
  if (vertices.length < 3) return null;
  // El plano se ajusta por Newell y no por los tres primeros vértices: tres
  // vértices casi colineales dan una normal basura, y en un polígono salido de
  // una partición eso pasa constantemente.
  let normal: Vec3 = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < vertices.length; i += 1) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    normal = v3Add(normal, {
      x: (current.y - next.y) * (current.z + next.z),
      y: (current.z - next.z) * (current.x + next.x),
      z: (current.x - next.x) * (current.y + next.y),
    });
  }
  const length = v3Length(normal);
  if (length === 0) return null;
  const unit = v3Scale(normal, 1 / length);
  let offset = 0;
  for (const vertex of vertices) offset += v3Dot(unit, vertex);
  return { vertices: vertices.map((vertex) => ({ ...vertex })), plane: { normal: unit, offset: offset / vertices.length } };
}

export function flipPolygon(polygon: CsgPolygon): CsgPolygon {
  return {
    vertices: [...polygon.vertices].reverse(),
    plane: { normal: v3Scale(polygon.plane.normal, -1), offset: -polygon.plane.offset },
  };
}

/**
 * Reparte un polígono respecto de un plano en los cuatro cubos posibles.
 *
 * Es el corazón del algoritmo, y el orden de los casos importa: `COPLANAR` se
 * decide ANTES que nada, porque un polígono coplanario tiene todos sus vértices
 * en la banda muerta y calcular intersecciones con el plano que lo contiene
 * produce divisiones por cero.
 */
export function splitPolygon(
  plane: CsgPlane,
  polygon: CsgPolygon,
  coplanarFront: CsgPolygon[],
  coplanarBack: CsgPolygon[],
  front: CsgPolygon[],
  back: CsgPolygon[],
  epsilon: number,
): void {
  let polygonType = 0;
  const types: number[] = [];
  for (const vertex of polygon.vertices) {
    const distance = v3Dot(plane.normal, vertex) - plane.offset;
    const type = distance < -epsilon ? BACK : distance > epsilon ? FRONT : COPLANAR;
    polygonType |= type;
    types.push(type);
  }

  switch (polygonType) {
    case COPLANAR:
      (v3Dot(plane.normal, polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
      return;
    case FRONT:
      front.push(polygon);
      return;
    case BACK:
      back.push(polygon);
      return;
    default: {
      const frontVertices: Vec3[] = [];
      const backVertices: Vec3[] = [];
      const count = polygon.vertices.length;
      for (let i = 0; i < count; i += 1) {
        const j = (i + 1) % count;
        const ti = types[i];
        const tj = types[j];
        const vi = polygon.vertices[i];
        const vj = polygon.vertices[j];
        if (ti !== BACK) frontVertices.push(vi);
        if (ti !== FRONT) backVertices.push(ti === BACK ? vi : { ...vi });
        if ((ti | tj) === SPANNING) {
          const t = (plane.offset - v3Dot(plane.normal, vi)) / v3Dot(plane.normal, v3Sub(vj, vi));
          const crossing = v3Add(vi, v3Scale(v3Sub(vj, vi), t));
          frontVertices.push(crossing);
          backVertices.push({ ...crossing });
        }
      }
      const frontPolygon = frontVertices.length >= 3 ? makePolygon(frontVertices) : null;
      const backPolygon = backVertices.length >= 3 ? makePolygon(backVertices) : null;
      if (frontPolygon) front.push(frontPolygon);
      if (backPolygon) back.push(backPolygon);
      return;
    }
  }
}

/**
 * Nodo del árbol BSP.
 *
 * Se implementa con métodos mutables y no en estilo funcional porque el
 * algoritmo de `csg.js` es intrínsecamente destructivo (`invert`, `clipTo`,
 * `build` reordenan el árbol en sitio) y traducirlo a estructuras inmutables
 * duplicaría el árbol entero en cada paso, que en un sólido de miles de caras es
 * la diferencia entre milisegundos y segundos.
 */
export class BspNode {
  plane: CsgPlane | null = null;
  front: BspNode | null = null;
  back: BspNode | null = null;
  polygons: CsgPolygon[] = [];

  constructor(private readonly epsilon: number) {}

  static from(polygons: readonly CsgPolygon[], epsilon: number): BspNode {
    const node = new BspNode(epsilon);
    node.build(polygons);
    return node;
  }

  clone(): BspNode {
    const node = new BspNode(this.epsilon);
    node.plane = this.plane ? { normal: { ...this.plane.normal }, offset: this.plane.offset } : null;
    node.front = this.front ? this.front.clone() : null;
    node.back = this.back ? this.back.clone() : null;
    node.polygons = this.polygons.map((polygon) => ({
      vertices: polygon.vertices.map((vertex) => ({ ...vertex })),
      plane: { normal: { ...polygon.plane.normal }, offset: polygon.plane.offset },
    }));
    return node;
  }

  /** Da la vuelta al sólido que representa el árbol: dentro pasa a ser fuera. */
  invert(): void {
    this.polygons = this.polygons.map(flipPolygon);
    if (this.plane) this.plane = { normal: v3Scale(this.plane.normal, -1), offset: -this.plane.offset };
    const swap = this.front;
    this.front = this.back;
    this.back = swap;
    this.front?.invert();
    this.back?.invert();
  }

  /** Quita de `polygons` todo lo que quede DENTRO del sólido de este árbol. */
  clipPolygons(polygons: readonly CsgPolygon[]): CsgPolygon[] {
    if (!this.plane) return [...polygons];
    let front: CsgPolygon[] = [];
    let back: CsgPolygon[] = [];
    for (const polygon of polygons) {
      splitPolygon(this.plane, polygon, front, back, front, back, this.epsilon);
    }
    if (this.front) front = this.front.clipPolygons(front);
    // Sin hijo trasero, "detrás" significa dentro del sólido: se descarta.
    back = this.back ? this.back.clipPolygons(back) : [];
    return [...front, ...back];
  }

  /** Recorta este árbol contra otro. */
  clipTo(other: BspNode): void {
    this.polygons = other.clipPolygons(this.polygons);
    this.front?.clipTo(other);
    this.back?.clipTo(other);
  }

  allPolygons(): CsgPolygon[] {
    return [...this.polygons, ...(this.front?.allPolygons() ?? []), ...(this.back?.allPolygons() ?? [])];
  }

  /**
   * Añade polígonos al árbol, partiéndolos por los planos que ya hay.
   *
   * El plano de partición es el del PRIMER polígono que llega. Elegir uno mejor
   * (el que equilibre el árbol) daría árboles más someros; se deja el simple a
   * propósito, porque un heurístico de selección introduce dependencia del orden
   * de entrada y con eso resultados que cambian según cómo se construyó el
   * sólido. La estabilidad vale más aquí que la profundidad del árbol.
   */
  build(polygons: readonly CsgPolygon[]): void {
    if (polygons.length === 0) return;
    if (!this.plane) this.plane = { normal: { ...polygons[0].plane.normal }, offset: polygons[0].plane.offset };
    const front: CsgPolygon[] = [];
    const back: CsgPolygon[] = [];
    for (const polygon of polygons) {
      splitPolygon(this.plane, polygon, this.polygons, this.polygons, front, back, this.epsilon);
    }
    if (front.length > 0) {
      this.front ??= new BspNode(this.epsilon);
      this.front.build(front);
    }
    if (back.length > 0) {
      this.back ??= new BspNode(this.epsilon);
      this.back.build(back);
    }
  }
}

export type CsgOperation = "union" | "difference" | "intersection";

/**
 * Aplica la operación booleana sobre dos sopas de polígonos.
 *
 * Las tres secuencias son las de `csg.js`, y no son intercambiables ni
 * "optimizables": cada `invert` cambia qué significa dentro y fuera para el
 * árbol, y el doble recorte de `b` contra `a` es lo que elimina las caras
 * coplanarias duplicadas. Cambiar el orden produce sólidos con caras sueltas.
 */
export function csgOperation(
  operation: CsgOperation,
  aPolygons: readonly CsgPolygon[],
  bPolygons: readonly CsgPolygon[],
  epsilon: number,
): CsgPolygon[] {
  const a = BspNode.from(aPolygons, epsilon);
  const b = BspNode.from(bPolygons, epsilon);
  switch (operation) {
    case "union":
      a.clipTo(b);
      b.clipTo(a);
      b.invert();
      b.clipTo(a);
      b.invert();
      a.build(b.allPolygons());
      return a.allPolygons();
    case "difference":
      a.invert();
      a.clipTo(b);
      b.clipTo(a);
      b.invert();
      b.clipTo(a);
      b.invert();
      a.build(b.allPolygons());
      a.invert();
      return a.allPolygons();
    case "intersection":
      a.invert();
      b.clipTo(a);
      b.invert();
      a.clipTo(b);
      b.clipTo(a);
      a.build(b.allPolygons());
      a.invert();
      return a.allPolygons();
  }
}

/** Normaliza un vector garantizando longitud unidad o cero. Reexportado para las specs. */
export function unit(vector: Vec3): Vec3 {
  return v3Normalize(vector);
}
