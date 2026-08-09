/**
 * Topología B-rep con estructura de media-arista (Fase 1).
 *
 * Un sólido no es una malla. Una malla es una lista de triángulos que no sabe
 * qué toca a qué; un B-rep sabe, en tiempo constante, qué caras comparten una
 * arista, qué aristas rodean un vértice y en qué orden. Esa adyacencia es lo
 * que hace posibles las booleanas y los redondeos, y es también lo que se puede
 * VALIDAR — de ahí que la topología vaya antes que cualquier operación.
 *
 * MODELO. Cada arista se parte en dos medias-aristas opuestas, una por cara.
 * Una media-arista conoce su vértice de origen, su lazo, su siguiente y su
 * anterior dentro del lazo, y su GEMELA en la cara de al lado. Con eso:
 *
 *   · recorrer una cara      → seguir `next` desde el lazo.
 *   · cruzar a la cara vecina → `twin`.
 *   · girar alrededor de un vértice → `next(twin(h))`, que sale del mismo
 *     vértice que `h`. Cada paso es O(1); no hay búsquedas.
 *
 * ORIENTACIÓN. El lazo exterior de una cara se recorre en sentido ANTIHORARIO
 * visto DESDE FUERA del sólido. Los lazos interiores (agujeros) van al revés.
 * Consecuencia directa y comprobable: cada arista es recorrida por sus dos
 * medias-aristas en sentidos OPUESTOS. Cuando eso deja de cumplirse, la malla
 * tiene caras del revés, y no hace falta dibujarla para saberlo.
 *
 * ÍNDICES, NO PUNTEROS. Todo son enteros contra arrays. Un B-rep con punteros
 * es imposible de serializar sin reescribirlo entero, y `-1` como "no hay" es
 * más barato de comprobar que `null` en un bucle que se recorre millones de
 * veces. `NO_INDEX` da nombre a ese −1 para que nadie lo confunda con un índice.
 */
import type { BrepSurface } from "./surfaces";
import { aabbEmpty, aabbExpand, v3Add, v3Cross, v3Dot, v3Length, v3Normalize, v3Scale, v3Sub, type Aabb3, type Vec3 } from "./vec3";

/** Ausencia de índice. Nunca es un índice válido. */
export const NO_INDEX = -1;

export interface BrepVertex {
  point: Vec3;
  /** Una media-arista cualquiera que SALE de este vértice; `NO_INDEX` si está aislado. */
  halfEdge: number;
}

export interface BrepHalfEdge {
  /** Vértice del que sale. El de llegada es `origin` de `next`. */
  origin: number;
  edge: number;
  loop: number;
  next: number;
  prev: number;
  /** Media-arista opuesta. `NO_INDEX` en una arista de borde (cuerpo abierto). */
  twin: number;
}

export interface BrepEdge {
  /** Las dos medias-aristas. `b` es `NO_INDEX` en una arista de borde. */
  a: number;
  b: number;
}

export type LoopKind = "outer" | "inner";

export interface BrepLoop {
  face: number;
  /** Media-arista por la que empezar a recorrer el lazo. */
  first: number;
  kind: LoopKind;
}

export interface BrepFace {
  /** `loops[0]` es SIEMPRE el exterior; el resto, agujeros. */
  loops: number[];
  /** Superficie portadora. `null` = plano implícito ajustado a los vértices del lazo. */
  surface: BrepSurface | null;
  /**
   * La normal de la cara es OPUESTA a la de su superficie portadora.
   * Existe porque una misma superficie (un cilindro, por ejemplo) puede servir a
   * dos caras que miran a lados distintos; el sentido lo lleva la CARA, no la
   * superficie.
   */
  reversed: boolean;
  shell: number;
}

export interface BrepShell {
  faces: number[];
  /** `true` si ninguna de sus aristas es de borde. */
  closed: boolean;
}

/**
 * Cuerpo B-rep. Un cuerpo con todas sus cáscaras cerradas es un SÓLIDO; uno con
 * aristas de borde es una lámina. Ambos usan la misma estructura a propósito:
 * el barrido de un perfil abierto produce una lámina, y forzarla a fingirse
 * sólida sólo esconde el problema.
 */
export interface BrepBody {
  vertices: BrepVertex[];
  halfEdges: BrepHalfEdge[];
  edges: BrepEdge[];
  loops: BrepLoop[];
  faces: BrepFace[];
  shells: BrepShell[];
}

/** Alias con la palabra que usa el dominio. Un sólido ES un cuerpo cerrado. */
export type BrepSolid = BrepBody;

export function emptyBody(): BrepBody {
  return { vertices: [], halfEdges: [], edges: [], loops: [], faces: [], shells: [] };
}

// --- Recorridos O(1) por paso ---------------------------------------------

/** Vértice de llegada de una media-arista. */
export function halfEdgeDestination(body: BrepBody, halfEdge: number): number {
  return body.halfEdges[body.halfEdges[halfEdge].next].origin;
}

/** Segmento geométrico de una media-arista (origen → destino). */
export function halfEdgeSegment(body: BrepBody, halfEdge: number): { from: Vec3; to: Vec3 } {
  return {
    from: body.vertices[body.halfEdges[halfEdge].origin].point,
    to: body.vertices[halfEdgeDestination(body, halfEdge)].point,
  };
}

/**
 * Medias-aristas de un lazo en orden.
 *
 * El guardián de ciclo NO es paranoia decorativa: un `next` mal cosido produce
 * un bucle infinito dentro del validador, es decir, el gate que existe para
 * detectar el problema se cuelga en vez de informar. El límite es el número
 * total de medias-aristas del cuerpo, así que un lazo legítimo nunca lo alcanza.
 */
export function loopHalfEdges(body: BrepBody, loop: number): number[] {
  const first = body.loops[loop].first;
  if (first === NO_INDEX) return [];
  const out: number[] = [];
  let current = first;
  const limit = body.halfEdges.length + 1;
  do {
    out.push(current);
    current = body.halfEdges[current].next;
    if (out.length > limit) {
      throw new Error(`Lazo ${loop} no cierra: se superaron ${limit} medias-aristas siguiendo next.`);
    }
  } while (current !== first);
  return out;
}

/** Vértices de un lazo en orden de recorrido. */
export function loopVertices(body: BrepBody, loop: number): number[] {
  return loopHalfEdges(body, loop).map((halfEdge) => body.halfEdges[halfEdge].origin);
}

/** Puntos de un lazo, ya en coordenadas del mundo. */
export function loopPoints(body: BrepBody, loop: number): Vec3[] {
  return loopVertices(body, loop).map((vertex) => body.vertices[vertex].point);
}

export function faceOuterLoop(body: BrepBody, face: number): number {
  return body.faces[face].loops[0];
}

export function faceInnerLoops(body: BrepBody, face: number): number[] {
  return body.faces[face].loops.slice(1);
}

/** Todas las medias-aristas de una cara, exterior primero. */
export function faceHalfEdges(body: BrepBody, face: number): number[] {
  return body.faces[face].loops.flatMap((loop) => loopHalfEdges(body, loop));
}

/** Caras que comparten una arista: dos en un sólido cerrado, una en un borde. */
export function edgeFaces(body: BrepBody, edge: number): number[] {
  const { a, b } = body.edges[edge];
  const faces: number[] = [];
  if (a !== NO_INDEX) faces.push(body.loops[body.halfEdges[a].loop].face);
  if (b !== NO_INDEX) faces.push(body.loops[body.halfEdges[b].loop].face);
  return faces;
}

/**
 * Medias-aristas que SALEN de un vértice, girando a su alrededor.
 *
 * El giro es `next(twin(h))`. En un cuerpo con borde el abanico se corta al
 * llegar a una arista sin gemela; entonces se vuelve al principio y se gira en
 * el otro sentido con `twin(prev(h))`, de modo que el resultado es completo
 * también en los vértices de la frontera.
 */
export function vertexOutgoingHalfEdges(body: BrepBody, vertex: number): number[] {
  const start = body.vertices[vertex].halfEdge;
  if (start === NO_INDEX) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  let current = start;
  const limit = body.halfEdges.length + 1;
  for (let guard = 0; guard <= limit; guard += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    out.push(current);
    const twin = body.halfEdges[current].twin;
    if (twin === NO_INDEX) break;
    current = body.halfEdges[twin].next;
    if (current === start) return out;
  }
  // Abanico cortado por el borde: se completa girando en sentido contrario.
  current = start;
  for (let guard = 0; guard <= limit; guard += 1) {
    const prev = body.halfEdges[current].prev;
    const twin = body.halfEdges[prev].twin;
    if (twin === NO_INDEX || seen.has(twin)) break;
    seen.add(twin);
    out.push(twin);
    current = twin;
  }
  return out;
}

/** Aristas incidentes en un vértice. */
export function vertexEdges(body: BrepBody, vertex: number): number[] {
  return [...new Set(vertexOutgoingHalfEdges(body, vertex).map((halfEdge) => body.halfEdges[halfEdge].edge))];
}

/** ¿La arista es de borde (una sola cara)? */
export function edgeIsBoundary(body: BrepBody, edge: number): boolean {
  return body.edges[edge].b === NO_INDEX;
}

/** ¿Todas las cáscaras están cerradas? */
export function bodyIsClosed(body: BrepBody): boolean {
  return body.edges.every((edge) => edge.b !== NO_INDEX);
}

// --- Geometría derivada de la topología ------------------------------------

/**
 * Normal de un lazo por la fórmula de Newell.
 *
 * Newell y no "el producto vectorial de los dos primeros lados": ese atajo
 * devuelve basura en cuanto el primer vértice es un pico reflejo o los dos
 * primeros lados son casi colineales, cosa que pasa constantemente en los
 * perfiles que salen de un CAD 2D. Newell promedia sobre TODO el lazo y sólo
 * degenera si el lazo es realmente degenerado.
 *
 * El módulo del vector devuelto es el DOBLE del área del lazo, lo que lo hace
 * útil también para medir.
 */
export function newellNormal(points: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    x += (current.y - next.y) * (current.z + next.z);
    y += (current.z - next.z) * (current.x + next.x);
    z += (current.x - next.x) * (current.y + next.y);
  }
  return { x, y, z };
}

/**
 * Normal geométrica SALIENTE de una cara, deducida de sus vértices.
 *
 * Es independiente de la superficie portadora a propósito: sirve justamente
 * para contrastar que la superficie y la topología dicen lo mismo. Si no
 * coinciden, una de las dos miente.
 */
export function faceGeometricNormal(body: BrepBody, face: number): Vec3 {
  return v3Normalize(newellNormal(loopPoints(body, faceOuterLoop(body, face))));
}

/** Área con signo de un lazo respecto de una normal de referencia unitaria. */
export function loopSignedArea(points: readonly Vec3[], normal: Vec3): number {
  return v3Dot(newellNormal(points), normal) / 2;
}

/**
 * Área de una cara PLANA, restando ya los agujeros.
 *
 * Los lazos interiores se recorren al revés que el exterior, así que su área con
 * signo sale negativa y la resta es automática. No hay ningún `Math.abs` de por
 * medio: si un agujero está mal orientado, el área sale mayor que la del
 * contorno y el invariante lo caza.
 */
export function planarFaceArea(body: BrepBody, face: number): number {
  const normal = faceGeometricNormal(body, face);
  let area = 0;
  for (const loop of body.faces[face].loops) {
    area += loopSignedArea(loopPoints(body, loop), normal);
  }
  return area;
}

/** Punto medio de los vértices del lazo exterior. Útil como referencia de plano. */
export function faceCentroid(body: BrepBody, face: number): Vec3 {
  const points = loopPoints(body, faceOuterLoop(body, face));
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  let sum: Vec3 = { x: 0, y: 0, z: 0 };
  for (const point of points) sum = { x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z };
  return v3Scale(sum, 1 / points.length);
}

/** Desviación máxima de los vértices de la cara respecto de su plano medio. */
export function facePlanarity(body: BrepBody, face: number): number {
  const normal = faceGeometricNormal(body, face);
  if (v3Length(normal) < 0.5) return Infinity;
  const origin = faceCentroid(body, face);
  let worst = 0;
  for (const loop of body.faces[face].loops) {
    for (const point of loopPoints(body, loop)) {
      worst = Math.max(worst, Math.abs(v3Dot(v3Sub(point, origin), normal)));
    }
  }
  return worst;
}

export function bodyBounds(body: BrepBody): Aabb3 {
  let box = aabbEmpty();
  for (const vertex of body.vertices) box = aabbExpand(box, vertex.point);
  return box;
}

// --- Contadores de Euler ---------------------------------------------------

export interface EulerCounts {
  vertices: number;
  edges: number;
  faces: number;
  /** Lazos INTERIORES (agujeros en caras): `loops − faces`. */
  rings: number;
  shells: number;
  /** χ = V − E + F − R. */
  characteristic: number;
  /** G = S − χ/2. Entero en una topología válida. */
  genus: number;
}

/**
 * Cuentas de Euler-Poincaré.
 *
 * La fórmula completa es `V − E + F − R = 2·(S − G)`, con `R` el número de
 * lazos interiores. El detalle que se salta todo el mundo: `V − E + F` a secas
 * NO es la característica cuando hay caras con agujeros, porque una cara con un
 * anillo no es un disco (su característica vale 1 − R, no 1). Un cubo con un
 * agujero pasante da `V − E + F = 2`, y si uno se cree ese número concluye
 * género 0 sobre un sólido que evidentemente tiene un agujero. Restando `R` sale
 * χ = 0 y género 1, que es la verdad.
 */
export function eulerCounts(body: BrepBody): EulerCounts {
  const vertices = body.vertices.length;
  const edges = body.edges.length;
  const faces = body.faces.length;
  const rings = body.loops.length - faces;
  const shells = body.shells.length;
  const characteristic = vertices - edges + faces - rings;
  return {
    vertices,
    edges,
    faces,
    rings,
    shells,
    characteristic,
    genus: shells - characteristic / 2,
  };
}

/**
 * Componentes conexas por adyacencia de CARAS a través de aristas.
 * Devuelve, para cada cara, el índice de su componente.
 */
export function faceComponents(body: BrepBody): number[] {
  const component = new Array<number>(body.faces.length).fill(NO_INDEX);
  let next = 0;
  for (let seed = 0; seed < body.faces.length; seed += 1) {
    if (component[seed] !== NO_INDEX) continue;
    const stack = [seed];
    component[seed] = next;
    while (stack.length > 0) {
      const face = stack.pop() as number;
      for (const halfEdge of faceHalfEdges(body, face)) {
        const twin = body.halfEdges[halfEdge].twin;
        if (twin === NO_INDEX) continue;
        const neighbour = body.loops[body.halfEdges[twin].loop].face;
        if (component[neighbour] !== NO_INDEX) continue;
        component[neighbour] = next;
        stack.push(neighbour);
      }
    }
    next += 1;
  }
  return component;
}

/** Número de componentes conexas reales, con independencia de cómo estén declaradas las cáscaras. */
export function connectedComponentCount(body: BrepBody): number {
  const components = faceComponents(body);
  return components.length === 0 ? 0 : new Set(components).size;
}

/**
 * Volumen con signo de un cuerpo de caras PLANAS, por el teorema de la
 * divergencia: `V = ⅓ Σ_caras (P₀ · n) · A`.
 *
 * Positivo con normales salientes. Un resultado NEGATIVO no significa "volumen
 * negativo": significa que las caras miran hacia dentro, y ése es exactamente
 * el invariante de coherencia de normales que pide el encargo.
 *
 * Sólo vale para caras planas. Para caras curvas, el volumen sale del teselado
 * (`mass-properties.ts`), y comparar ambos caminos es lo que detecta que uno de
 * los dos miente.
 */
export function planarBodyVolume(body: BrepBody): number {
  let volume = 0;
  for (let face = 0; face < body.faces.length; face += 1) {
    const normal = faceGeometricNormal(body, face);
    const area = planarFaceArea(body, face);
    volume += v3Dot(faceCentroid(body, face), normal) * area;
  }
  return volume / 3;
}

/** Área total de un cuerpo de caras planas. */
export function planarBodyArea(body: BrepBody): number {
  let area = 0;
  for (let face = 0; face < body.faces.length; face += 1) area += planarFaceArea(body, face);
  return area;
}

/** Copia profunda. Las operaciones de modelado nunca mutan su entrada. */
export function cloneBody(body: BrepBody): BrepBody {
  return {
    vertices: body.vertices.map((vertex) => ({ point: { ...vertex.point }, halfEdge: vertex.halfEdge })),
    halfEdges: body.halfEdges.map((halfEdge) => ({ ...halfEdge })),
    edges: body.edges.map((edge) => ({ ...edge })),
    loops: body.loops.map((loop) => ({ ...loop })),
    faces: body.faces.map((face) => ({ ...face, loops: [...face.loops] })),
    shells: body.shells.map((shell) => ({ ...shell, faces: [...shell.faces] })),
  };
}

/**
 * Traslada un cuerpo, moviendo TAMBIÉN el origen de las superficies portadoras.
 *
 * Mover sólo los vértices es el error silencioso obvio: la topología queda bien,
 * el volumen sale bien, y las superficies portadoras se quedan donde estaban. La
 * incoherencia no se nota hasta que alguien pide una normal exacta al teselar o
 * exporta a STEP, y entonces el plano dice una cosa y la cara otra.
 *
 * Sólo hay traslación a propósito. Una transformada general tiene que decidir
 * qué hace con una superficie de revolución bajo escalado no uniforme (deja de
 * ser un cilindro), y ésa es una decisión que merece su propio módulo, no un
 * apaño aquí.
 */
export function translateBody(body: BrepBody, delta: Vec3): BrepBody {
  const moved = cloneBody(body);
  for (const vertex of moved.vertices) {
    vertex.point = v3Add(vertex.point, delta);
  }
  for (const face of moved.faces) {
    if (!face.surface || !("frame" in face.surface)) continue;
    face.surface = { ...face.surface, frame: { ...face.surface.frame, origin: v3Add(face.surface.frame.origin, delta) } };
  }
  return moved;
}

/** Ángulo diedro (rad) entre las dos caras de una arista; `null` si es de borde. */
export function edgeDihedralAngle(body: BrepBody, edge: number): number | null {
  const { a, b } = body.edges[edge];
  if (a === NO_INDEX || b === NO_INDEX) return null;
  const faceA = body.loops[body.halfEdges[a].loop].face;
  const faceB = body.loops[body.halfEdges[b].loop].face;
  const normalA = faceGeometricNormal(body, faceA);
  const normalB = faceGeometricNormal(body, faceB);
  const segment = halfEdgeSegment(body, a);
  const direction = v3Normalize(v3Sub(segment.to, segment.from));
  const cos = Math.max(-1, Math.min(1, v3Dot(normalA, normalB)));
  const sin = v3Dot(v3Cross(normalA, normalB), direction);
  return Math.PI - Math.atan2(sin, cos);
}
