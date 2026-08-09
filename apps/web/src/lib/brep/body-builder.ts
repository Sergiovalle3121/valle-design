/**
 * Construcción de cuerpos B-rep a partir de caras, con cosido de gemelas.
 *
 * Coser las medias-aristas es donde se detectan casi todos los errores de
 * modelado, y por eso este archivo prefiere LANZAR a construir algo dudoso:
 *
 *   · La misma arista dirigida (a→b) aparece dos veces ⇒ dos caras la recorren
 *     en el mismo sentido ⇒ una de las dos está del revés. Un kernel que se lo
 *     traga produce un sólido que parece correcto hasta que alguien calcula su
 *     volumen y sale negativo, tres operaciones después.
 *   · Tres o más caras en una arista ⇒ no es una variedad, y todo lo que viene
 *     detrás (booleanas, redondeos, teselado con normales) asume que lo es.
 *
 * Rechazar en el constructor convierte un fallo tardío e incomprensible en un
 * mensaje inmediato que dice qué arista y qué caras.
 *
 * SOLDADURA DE VÉRTICES. `BodyBuilder` funde puntos que caen dentro de la
 * tolerancia mediante una rejilla espacial. Sin ella, dos caras generadas por
 * operaciones distintas comparten geométricamente una arista pero no
 * topológicamente, y el resultado es un sólido con costuras invisibles que el
 * validador denuncia como "aristas de borde" sin que se vea nada raro al
 * dibujarlo.
 */
import type { BrepSurface } from "./surfaces";
import { BREP_TOLERANCE } from "./tolerance";
import {
  NO_INDEX,
  emptyBody,
  faceComponents,
  loopVertices,
  type BrepBody,
  type BrepFace,
  type LoopKind,
} from "./topology";
import { v3Distance, type Vec3 } from "./vec3";

export interface FaceSpec {
  /** Índices de vértice del contorno, ANTIHORARIO visto desde fuera del sólido. */
  outer: number[];
  /** Agujeros, en sentido contrario al contorno. */
  inners?: number[][];
  surface?: BrepSurface | null;
  reversed?: boolean;
}

/**
 * Construye un cuerpo a partir de puntos y caras. No suelda: los índices de
 * vértice ya vienen resueltos por el llamante. Para soldar, `BodyBuilder`.
 */
export function buildBody(points: readonly Vec3[], faces: readonly FaceSpec[]): BrepBody {
  const body = emptyBody();
  body.vertices = points.map((point) => ({ point: { ...point }, halfEdge: NO_INDEX }));

  /** Clave de arista dirigida → media-arista que la recorre. */
  const directed = new Map<number, number>();
  const key = (from: number, to: number) => from * points.length + to;

  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const spec = faces[faceIndex];
    const loopSpecs: Array<{ vertices: number[]; kind: LoopKind }> = [
      { vertices: spec.outer, kind: "outer" },
      ...(spec.inners ?? []).map((inner) => ({ vertices: inner, kind: "inner" as LoopKind })),
    ];
    const face: BrepFace = {
      loops: [],
      surface: spec.surface ?? null,
      reversed: spec.reversed ?? false,
      shell: NO_INDEX,
    };
    body.faces.push(face);

    for (const loopSpec of loopSpecs) {
      const vertices = loopSpec.vertices;
      if (vertices.length < 3) {
        throw new Error(`Cara ${faceIndex}: un lazo necesita al menos 3 vértices, llegaron ${vertices.length}.`);
      }
      for (const vertex of vertices) {
        if (!Number.isInteger(vertex) || vertex < 0 || vertex >= points.length) {
          throw new Error(`Cara ${faceIndex}: índice de vértice fuera de rango (${vertex}).`);
        }
      }
      const loopIndex = body.loops.length;
      body.loops.push({ face: faceIndex, first: NO_INDEX, kind: loopSpec.kind });
      face.loops.push(loopIndex);

      const created: number[] = [];
      for (let i = 0; i < vertices.length; i += 1) {
        const from = vertices[i];
        const to = vertices[(i + 1) % vertices.length];
        if (from === to) {
          throw new Error(`Cara ${faceIndex}: arista degenerada, el vértice ${from} se repite consecutivamente.`);
        }
        const halfEdgeIndex = body.halfEdges.length;
        body.halfEdges.push({ origin: from, edge: NO_INDEX, loop: loopIndex, next: NO_INDEX, prev: NO_INDEX, twin: NO_INDEX });
        created.push(halfEdgeIndex);
        if (body.vertices[from].halfEdge === NO_INDEX) body.vertices[from].halfEdge = halfEdgeIndex;

        const forward = key(from, to);
        if (directed.has(forward)) {
          const other = directed.get(forward) as number;
          const otherFace = body.loops[body.halfEdges[other].loop].face;
          throw new Error(
            `Arista ${from}→${to} recorrida en el MISMO sentido por las caras ${otherFace} y ${faceIndex}: una de las dos está del revés.`,
          );
        }
        directed.set(forward, halfEdgeIndex);

        const backward = key(to, from);
        const twin = directed.get(backward);
        if (twin !== undefined) {
          if (body.halfEdges[twin].twin !== NO_INDEX) {
            throw new Error(`Arista ${from}↔${to} compartida por más de dos caras: el cuerpo no es una variedad.`);
          }
          const edgeIndex = body.halfEdges[twin].edge;
          body.halfEdges[halfEdgeIndex].twin = twin;
          body.halfEdges[twin].twin = halfEdgeIndex;
          body.halfEdges[halfEdgeIndex].edge = edgeIndex;
          body.edges[edgeIndex].b = halfEdgeIndex;
        } else {
          const edgeIndex = body.edges.length;
          body.edges.push({ a: halfEdgeIndex, b: NO_INDEX });
          body.halfEdges[halfEdgeIndex].edge = edgeIndex;
        }
      }
      for (let i = 0; i < created.length; i += 1) {
        const current = created[i];
        const next = created[(i + 1) % created.length];
        body.halfEdges[current].next = next;
        body.halfEdges[next].prev = current;
      }
      body.loops[loopIndex].first = created[0];
    }
  }

  assignShells(body);
  return body;
}

/**
 * Reparte las caras en cáscaras según su conectividad REAL por aristas.
 *
 * Se calcula en vez de pedirse porque la conectividad es un hecho del cuerpo,
 * no una opinión del llamante. Una diferencia booleana que deja una cavidad
 * dentro de un sólido produce dos cáscaras sin que nadie se lo diga, y la
 * fórmula de Euler-Poincaré necesita ese número exacto para dar el género bueno.
 */
export function assignShells(body: BrepBody): void {
  const components = faceComponents(body);
  const shells: BrepBody["shells"] = [];
  for (let face = 0; face < body.faces.length; face += 1) {
    const component = components[face];
    while (shells.length <= component) shells.push({ faces: [], closed: true });
    shells[component].faces.push(face);
    body.faces[face].shell = component;
  }
  for (const edge of body.edges) {
    if (edge.b !== NO_INDEX) continue;
    const face = body.loops[body.halfEdges[edge.a].loop].face;
    shells[body.faces[face].shell].closed = false;
  }
  body.shells = shells;
}

/**
 * Constructor incremental con soldadura de vértices por rejilla espacial.
 *
 * La rejilla usa celdas de lado `tolerance`, y cada consulta mira las 27 celdas
 * vecinas. Es O(1) amortizado y —a diferencia de redondear la coordenada a una
 * clave— no parte en dos vértices que caigan a ambos lados de un borde de celda.
 * Ese fallo concreto es traicionero: aparece sólo en algunas coordenadas, y
 * produce sólidos con una costura abierta de un solo vértice.
 */
export class BodyBuilder {
  private readonly points: Vec3[] = [];
  private readonly faces: FaceSpec[] = [];
  private readonly grid = new Map<string, number[]>();
  private readonly tolerance: number;

  constructor(tolerance = BREP_TOLERANCE.linear) {
    this.tolerance = Math.max(tolerance, Number.MIN_VALUE);
  }

  private cellKey(point: Vec3, dx: number, dy: number, dz: number): string {
    const size = this.tolerance;
    return `${Math.floor(point.x / size) + dx}|${Math.floor(point.y / size) + dy}|${Math.floor(point.z / size) + dz}`;
  }

  /** Devuelve el índice del vértice, reutilizando uno existente si coincide. */
  addVertex(point: Vec3): number {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = this.grid.get(this.cellKey(point, dx, dy, dz));
          if (!bucket) continue;
          for (const index of bucket) {
            if (v3Distance(this.points[index], point) <= this.tolerance) return index;
          }
        }
      }
    }
    const index = this.points.length;
    this.points.push({ ...point });
    const key = this.cellKey(point, 0, 0, 0);
    const bucket = this.grid.get(key);
    if (bucket) bucket.push(index);
    else this.grid.set(key, [index]);
    return index;
  }

  /** Cara por PUNTOS: suelda los vértices y colapsa los repetidos consecutivos. */
  addPolygon(outer: readonly Vec3[], options: { inners?: readonly Vec3[][]; surface?: BrepSurface | null; reversed?: boolean } = {}): void {
    const resolve = (points: readonly Vec3[]): number[] => {
      const indices = points.map((point) => this.addVertex(point));
      const collapsed: number[] = [];
      for (const index of indices) {
        if (collapsed.length > 0 && collapsed[collapsed.length - 1] === index) continue;
        collapsed.push(index);
      }
      while (collapsed.length > 1 && collapsed[0] === collapsed[collapsed.length - 1]) collapsed.pop();
      return collapsed;
    };
    const outerIndices = resolve(outer);
    if (outerIndices.length < 3) return; // Cara degenerada tras soldar: se descarta en silencio.
    this.faces.push({
      outer: outerIndices,
      inners: options.inners?.map(resolve).filter((loop) => loop.length >= 3),
      surface: options.surface ?? null,
      reversed: options.reversed ?? false,
    });
  }

  /** Cara por ÍNDICES ya resueltos con `addVertex`. */
  addFace(spec: FaceSpec): void {
    this.faces.push(spec);
  }

  get vertexCount(): number {
    return this.points.length;
  }

  get faceCount(): number {
    return this.faces.length;
  }

  build(): BrepBody {
    return buildBody(this.points, this.faces);
  }
}

/** Descompone un cuerpo en la descripción de caras que lo reconstruiría. */
export function bodyToFaceSpecs(body: BrepBody): FaceSpec[] {
  return body.faces.map((face) => ({
    outer: loopVertices(body, face.loops[0]),
    inners: face.loops.slice(1).map((loop) => loopVertices(body, loop)),
    surface: face.surface,
    reversed: face.reversed,
  }));
}

/**
 * Da la vuelta a un cuerpo: todas sus normales pasan a mirar al otro lado.
 *
 * Es la pieza que hace posible la diferencia booleana `A − B` como `A ∩ ¬B`, y
 * también la que convierte una cáscara exterior en la pared de una cavidad. Se
 * implementa invirtiendo el recorrido de cada lazo, que es exactamente lo que
 * significa "mirar al otro lado" en esta representación.
 */
export function reverseBody(body: BrepBody): BrepBody {
  const specs = bodyToFaceSpecs(body).map((spec) => ({
    outer: [...spec.outer].reverse(),
    inners: spec.inners?.map((inner) => [...inner].reverse()),
    surface: spec.surface,
    reversed: !spec.reversed,
  }));
  return buildBody(
    body.vertices.map((vertex) => vertex.point),
    specs,
  );
}
