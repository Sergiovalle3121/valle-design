/**
 * Fusión de caras coplanarias: el hueco que el índice del kernel confesaba.
 *
 * ## El problema, medido
 *
 * Las booleanas de este kernel trabajan por BSP sobre polígonos convexos. El
 * resultado es correcto —volumen exacto, invariantes verdes, género bueno— pero
 * queda FRAGMENTADO: la unión de dos cajas de 100×100×50 contiguas devuelve 20
 * caras y 30 aristas repartidas sobre seis planos, cuando el sólido resultante
 * es una caja de 200×100×50 con 6 caras y 12 aristas. Nadie lo nota mirando la
 * pantalla —el sombreado es idéntico— y todo el mundo lo paga después:
 *
 *   · el STEP exportado lleva más del triple de entidades de las que describe
 *     el sólido, y quien lo abre en otro CAD ve una caja llena de costuras;
 *   · designar «la cara de arriba» designa un triángulo, no la tapa, y el
 *     empujón de PRESSPULL mueve un cuarto de la cara;
 *   · FLATSHOT y SOLPROF proyectan las aristas internas, así que el alzado sale
 *     con diagonales que no existen en la pieza;
 *   · encadenar booleanas sobre un cuerpo fragmentado es más frágil y más caro:
 *     cada corte multiplica los trozos.
 *
 * ## Cómo se funde
 *
 * 1. AGRUPAR POR PLANO CANÓNICO. La firma de una cara plana es su normal
 *    unitaria SALIENTE más su distancia con signo al origen. La normal no se
 *    canonicaliza a un semiespacio a propósito: dos caras sobre el mismo plano
 *    geométrico pero con normales opuestas son los dos lados de una pared
 *    delgada, y fundirlas sería inventar material.
 *
 *    La agrupación va por rejilla cuantizada, con el mismo cuidado que
 *    `BodyBuilder` con los vértices: una clave redondeada parte en dos los
 *    valores que caen a ambos lados de un borde de celda, y ese fallo aparece
 *    sólo en algunas coordenadas. Aquí cada grupo se REGISTRA además en las
 *    ochenta celdas vecinas (3⁴ − 1: tres componentes de la normal y la
 *    distancia), de modo que una sola consulta encuentra al grupo aunque la
 *    cara caiga en la celda de al lado. La pertenencia final se decide con la
 *    tolerancia de verdad contra el representante del grupo, no con la clave.
 *
 * 2. FUNDIR PARES ADYACENTES. Dentro de un grupo se prueban pares que comparten
 *    aristas. La fusión sólo se acepta si las aristas compartidas forman UNA
 *    cadena contigua en el lazo exterior de cada una de las dos caras. Si la
 *    cadena está partida en dos tramos —dos caras que se tocan por dos sitios
 *    distintos, como los dos extremos de un anillo— el lazo resultante no sería
 *    simple: tendría un pellizco o encerraría un agujero que este paso no sabe
 *    declarar. Se DESCARTA, y se cuenta. Un cuerpo con una fusión forzada es
 *    peor que un cuerpo fragmentado, porque el primero miente.
 *
 *    Los lazos interiores de las dos caras se conservan tal cual como agujeros
 *    de la cara fundida: la topología ya los soporta (`loops[0]` es el exterior
 *    y el resto son anillos) y `eulerCounts` ya los cuenta en `R`.
 *
 *    Se itera hasta punto fijo: una fusión rechazada hoy puede aceptarse cuando
 *    la cara vecina haya crecido, y una cara puede absorber a cuatro.
 *
 * 3. DISOLVER LOS VÉRTICES QUE SOBRAN. Fundir cuatro triángulos en un
 *    rectángulo deja puntos a mitad de un lado: en la unión de las dos cajas,
 *    los cuatro vértices de x = 100 acaban con DOS aristas colineales cada uno.
 *    Un vértice de grado dos no es legal en un sólido cerrado —hacen falta tres
 *    caras para cerrar el abanico— así que la fusión no está terminada hasta
 *    que se van. Sin este paso el resultado tendría 6 caras y 16 aristas en vez
 *    de 6 y 12, y `validateBody` lo denunciaría.
 *
 *    Sólo se disuelve el vértice cuyas DOS aristas son colineales y que cae
 *    ESTRICTAMENTE entre sus dos vecinos: fuera de ese caso, quitarlo cambiaría
 *    la forma. Y nunca si dejaría un lazo con menos de tres vértices, ni si la
 *    arista que lo sustituye ya existe por otro lado (sería una tercera cara en
 *    una arista, es decir, dejar de ser una variedad).
 *
 * 4. RECONSTRUIR. Los vértices que quedaron sin usar se compactan y el cuerpo se
 *    vuelve a coser con `buildBody`, que es quien detecta cualquier
 *    incoherencia que los pasos anteriores hubieran dejado. Se prefiere LANZAR
 *    a devolver un cuerpo dudoso, igual que hace el constructor.
 *
 * ## Lo que esta pasada NO hace, dicho
 *
 *   · Fundir por un lazo INTERIOR. Si la cadena compartida está en un agujero
 *     de una de las dos caras —una cara que rellena el hueco de otra— la fusión
 *     se descarta. El caso existe y tiene solución, pero pide decidir qué pasa
 *     con el anillo cuando el relleno es parcial, y eso merece su propio paso.
 *   · Fundir dos caras que se tocan por DOS cadenas separadas (cerrar un
 *     anillo). El resultado sería una cara con un agujero nuevo, y deducir cuál
 *     de los dos lazos resultantes es el exterior exige un punto-en-polígono
 *     que este paso no hace.
 *   · Tocar caras curvas. El agrupamiento usa la normal geométrica del lazo, que
 *     para una cara facetada es la del plano que la contiene; una superficie
 *     portadora curva no se consulta ni se funde.
 */
import { buildBody, type FaceSpec } from "./body-builder";
import { BREP_TOLERANCE, resolveTolerance, type BrepTolerance } from "./tolerance";
import {
  bodyBounds,
  faceCentroid,
  faceGeometricNormal,
  facePlanarity,
  loopVertices,
  type BrepBody,
} from "./topology";
import { aabbDiagonal, v3Cross, v3Dot, v3Length, v3Sub, type Vec3 } from "./vec3";
import type { BrepSurface } from "./surfaces";

/** Plano canónico de una cara: normal unitaria SALIENTE y distancia con signo. */
export interface CanonicalPlane {
  normal: Vec3;
  /** `n · p` para cualquier `p` de la cara. */
  distance: number;
}

export interface CoplanarMergeReport {
  /** El cuerpo fundido. Es el MISMO objeto de entrada cuando no hubo nada que fundir. */
  body: BrepBody;
  /** ¿Cambió algo? `false` ⇒ `body` es la entrada, sin copiar. */
  changed: boolean;
  /** Fusiones de par aplicadas. */
  merges: number;
  /**
   * INTENTOS de fusión descartados por cadena partida, lazo interior o lazo
   * exterior no simple. Es un contador de intentos, no de pares distintos: el
   * punto fijo vuelve a probar un par rechazado cuando la cara vecina ha
   * crecido, y ese reintento vuelve a contar. Sirve para saber si quedó algo
   * sin fundir, no para medir cuánto.
   */
  rejected: number;
  /** Vértices de grado dos disueltos tras fundir. */
  dissolved: number;
  /** Planos canónicos distintos encontrados. */
  planes: number;
  faces: { before: number; after: number };
  edges: { before: number; after: number };
  vertices: { before: number; after: number };
}

/** Cara en curso de fusión: sus lazos como listas de índices de vértice. */
interface WorkFace {
  alive: boolean;
  /** `loops[0]` es el exterior; el resto, agujeros. */
  loops: number[][];
  surface: BrepSurface | null;
  reversed: boolean;
}

/**
 * Clave sin ambigüedad de una arista NO dirigida.
 *
 * Va como cadena y no como `a·N + b` a propósito: el entero compuesto obliga a
 * conocer el número de vértices para elegir el multiplicador, y elegirlo
 * pequeño produce colisiones silenciosas —dos aristas distintas con la misma
 * clave— que se manifiestan como una fusión imposible aceptada.
 */
function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Plano canónico de una cara del cuerpo. */
export function canonicalPlane(body: BrepBody, face: number): CanonicalPlane {
  const normal = faceGeometricNormal(body, face);
  return { normal, distance: v3Dot(normal, faceCentroid(body, face)) };
}

/**
 * Reparte las caras en grupos coplanarios.
 *
 * Devuelve, para cada cara, el índice de su grupo. La celda de la rejilla mide
 * exactamente una tolerancia, y cada grupo se registra en sus 81 celdas (la
 * suya y las 80 vecinas) para que ninguna cara se quede en el lado equivocado
 * de un borde de celda.
 */
function groupByPlane(
  body: BrepBody,
  angular: number,
  linear: number,
): { group: number[]; planes: CanonicalPlane[] } {
  const group = new Array<number>(body.faces.length).fill(-1);
  const planes: CanonicalPlane[] = [];
  const cells = new Map<string, number[]>();

  const cellOf = (plane: CanonicalPlane, dx: number, dy: number, dz: number, dd: number): string =>
    `${Math.floor(plane.normal.x / angular) + dx}|${Math.floor(plane.normal.y / angular) + dy}` +
    `|${Math.floor(plane.normal.z / angular) + dz}|${Math.floor(plane.distance / linear) + dd}`;

  for (let face = 0; face < body.faces.length; face += 1) {
    const plane = canonicalPlane(body, face);
    // Una cara sin normal (degenerada) o que NO es plana dentro de tolerancia
    // no tiene plano canónico que compartir: se le da un grupo propio, donde
    // nunca encontrará pareja. Fundir dos caras alabeadas por su normal media
    // produciría una cara todavía más alabeada, y el validador la rechazaría
    // después sin que nadie supiera cuál de las dos la había estropeado.
    if (!(v3Length(plane.normal) > 0.5) || facePlanarity(body, face) > linear) {
      planes.push(plane);
      group[face] = planes.length - 1;
      continue;
    }
    let found = -1;
    for (const candidate of cells.get(cellOf(plane, 0, 0, 0, 0)) ?? []) {
      const reference = planes[candidate];
      if (v3Length(v3Sub(plane.normal, reference.normal)) > angular) continue;
      if (Math.abs(plane.distance - reference.distance) > linear) continue;
      found = candidate;
      break;
    }
    if (found < 0) {
      found = planes.length;
      planes.push(plane);
      for (let dx = -1; dx <= 1; dx += 1)
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dz = -1; dz <= 1; dz += 1)
            for (let dd = -1; dd <= 1; dd += 1) {
              const key = cellOf(plane, dx, dy, dz, dd);
              const bucket = cells.get(key);
              if (bucket) bucket.push(found);
              else cells.set(key, [found]);
            }
    }
    group[face] = found;
  }
  return { group, planes };
}

/** Las aristas de un lazo, como claves no dirigidas y en orden de recorrido. */
function loopEdgeKeys(loop: readonly number[]): string[] {
  return loop.map((vertex, index) => edgeKey(vertex, loop[(index + 1) % loop.length]));
}

/**
 * El único tramo contiguo de posiciones marcadas de un lazo cíclico.
 *
 * `null` cuando no hay ninguna, cuando hay más de un tramo (la cadena está
 * partida) o cuando están TODAS (la cara desaparecería). Devuelve el inicio del
 * tramo y su longitud.
 */
function singleRun(marked: readonly boolean[]): { start: number; length: number } | null {
  const total = marked.length;
  let count = 0;
  for (const flag of marked) if (flag) count += 1;
  if (count === 0 || count === total) return null;
  const starts: number[] = [];
  for (let i = 0; i < total; i += 1) {
    if (marked[i] && !marked[(i - 1 + total) % total]) starts.push(i);
  }
  if (starts.length !== 1) return null;
  return { start: starts[0], length: count };
}

/**
 * Intenta fundir dos caras coplanarias.
 *
 * Devuelve el lazo exterior fundido, o `null` si no son adyacentes, o
 * `"rechazada"` si lo son pero la fusión no puede hacerse con honestidad. Los
 * dos casos se distinguen porque el segundo se CUENTA: un rechazo es
 * información sobre el cuerpo, y una no-adyacencia no es nada.
 */
function mergeOuterLoops(a: WorkFace, b: WorkFace): number[] | null | "rechazada" {
  const outerA = a.loops[0];
  const outerB = b.loops[0];

  // Todas las aristas de B, por lazo, para distinguir «comparten por el
  // exterior» de «comparten por un agujero».
  const keysB = new Map<string, number>();
  for (let loop = 0; loop < b.loops.length; loop += 1) {
    for (const key of loopEdgeKeys(b.loops[loop])) {
      if (keysB.has(key)) return "rechazada"; // arista repetida dentro de una misma cara.
      keysB.set(key, loop);
    }
  }

  let shared = 0;
  let throughInner = false;
  const seen = new Set<string>();
  for (let loop = 0; loop < a.loops.length; loop += 1) {
    for (const key of loopEdgeKeys(a.loops[loop])) {
      if (seen.has(key)) return "rechazada";
      seen.add(key);
      const other = keysB.get(key);
      if (other === undefined) continue;
      shared += 1;
      if (loop !== 0 || other !== 0) throughInner = true;
    }
  }
  if (shared === 0) return null;
  if (throughInner) return "rechazada";

  const markedA = loopEdgeKeys(outerA).map((key) => keysB.get(key) === 0);
  const markedB = loopEdgeKeys(outerB).map((key) => seen.has(key));
  const runA = singleRun(markedA);
  const runB = singleRun(markedB);
  if (!runA || !runB || runA.length !== runB.length) return "rechazada";

  const m = outerA.length;
  const n = outerB.length;
  const k = runA.length;
  const pa = runA.start;
  const pb = runB.start;
  // Las dos caras recorren la cadena en sentidos OPUESTOS: el final de la
  // cadena en A es el principio en B. Si no lo es, una de las dos está del
  // revés y fundirlas produciría un lazo que se muerde la cola.
  if (outerB[pb] !== outerA[(pa + k) % m] || outerB[(pb + k) % n] !== outerA[pa]) return "rechazada";

  const merged: number[] = [];
  for (let t = 0; t <= m - k; t += 1) merged.push(outerA[(pa + k + t) % m]);
  for (let t = 1; t < n - k; t += 1) merged.push(outerB[(pb + k + t) % n]);
  if (merged.length < 3) return "rechazada";
  if (new Set(merged).size !== merged.length) return "rechazada"; // lazo con pellizco.
  return merged;
}

/** ¿Cae `mid` en el segmento `from`–`to`, dentro de tolerancia y ESTRICTAMENTE entre ellos? */
function collinearBetween(from: Vec3, mid: Vec3, to: Vec3, linear: number): boolean {
  const first = v3Sub(mid, from);
  const second = v3Sub(to, mid);
  const span = v3Length(v3Sub(to, from));
  if (!(span > linear)) return false;
  if (v3Length(v3Cross(first, second)) / span > linear) return false;
  return v3Dot(first, second) > 0;
}

/**
 * `mergeCoplanarFaces(body, tolerance)` — la operación completa.
 *
 * No muta la entrada. Cuando no hay nada que fundir devuelve el MISMO cuerpo
 * (`changed: false`), para que quien la llame pueda decir «no hay nada que
 * limpiar» y no tocar el documento en vez de reescribir lo mismo.
 */
export function mergeCoplanarFaces(
  body: BrepBody,
  tolerance?: Partial<BrepTolerance>,
): CoplanarMergeReport {
  const tol = resolveTolerance(tolerance);
  // La escala lineal es EXACTAMENTE la del validador (`invariants.ts`:
  // `tol.linear · max(1, diagonal)`), y no la de `scaledLinearTolerance`, que
  // es cien veces más apretada. El motivo no es estético: si esta pasada fuese
  // más estricta que el validador, una cara que el kernel considera PLANA
  // quedaría fuera del agrupamiento y no se fundiría nunca, en silencio y sin
  // que nada lo denunciara. Lo que el cuerpo acepta como su propio plano es lo
  // que aquí cuenta como coplanario.
  const linear = tol.linear * Math.max(1, aabbDiagonal(bodyBounds(body)));
  const angular = Math.max(tol.angular, BREP_TOLERANCE.angular);

  const before = {
    faces: body.faces.length,
    edges: body.edges.length,
    vertices: body.vertices.length,
  };
  const unchanged = (planeCount: number): CoplanarMergeReport => ({
    body,
    changed: false,
    merges: 0,
    rejected: 0,
    dissolved: 0,
    planes: planeCount,
    faces: { before: before.faces, after: before.faces },
    edges: { before: before.edges, after: before.edges },
    vertices: { before: before.vertices, after: before.vertices },
  });
  if (body.faces.length === 0) return unchanged(0);

  const { group, planes } = groupByPlane(body, angular, linear);
  const faces: WorkFace[] = body.faces.map((face) => ({
    alive: true,
    loops: face.loops.map((loop) => loopVertices(body, loop)),
    surface: face.surface,
    reversed: face.reversed,
  }));

  const byPlane = new Map<number, number[]>();
  for (let face = 0; face < faces.length; face += 1) {
    const bucket = byPlane.get(group[face]);
    if (bucket) bucket.push(face);
    else byPlane.set(group[face], [face]);
  }

  let merges = 0;
  let rejected = 0;
  for (const members of byPlane.values()) {
    if (members.length < 2) continue;
    // Punto fijo: una fusión rechazada puede aceptarse cuando la vecina crece,
    // y cada pasada retira al menos una cara, así que el número de pasadas está
    // acotado por el tamaño del grupo.
    for (let pass = 0; pass < members.length; pass += 1) {
      let changedInPass = false;
      for (const seed of members) {
        if (!faces[seed].alive) continue;
        let grew = true;
        while (grew) {
          grew = false;
          for (const other of members) {
            if (other === seed || !faces[other].alive) continue;
            const merged = mergeOuterLoops(faces[seed], faces[other]);
            if (merged === null) continue;
            if (merged === "rechazada") {
              rejected += 1;
              continue;
            }
            faces[seed].loops = [merged, ...faces[seed].loops.slice(1), ...faces[other].loops.slice(1)];
            if (!faces[seed].surface) {
              faces[seed].surface = faces[other].surface;
              faces[seed].reversed = faces[other].reversed;
            }
            faces[other].alive = false;
            merges += 1;
            grew = true;
            changedInPass = true;
          }
        }
      }
      if (!changedInPass) break;
    }
  }

  const dissolved = dissolveStraightVertices(body, faces, linear);
  if (merges === 0 && dissolved === 0) return unchanged(planes.length);

  // Compactar: los vértices que se quedaron sin lazo no pueden viajar al cuerpo
  // nuevo — un vértice aislado rompe Euler y el validador lo denuncia.
  const remap = new Map<number, number>();
  const points: Vec3[] = [];
  const specs: FaceSpec[] = [];
  for (const face of faces) {
    if (!face.alive) continue;
    const resolve = (loop: readonly number[]): number[] =>
      loop.map((vertex) => {
        const known = remap.get(vertex);
        if (known !== undefined) return known;
        const index = points.length;
        points.push({ ...body.vertices[vertex].point });
        remap.set(vertex, index);
        return index;
      });
    const outer = resolve(face.loops[0]);
    const inners = face.loops.slice(1).map(resolve);
    specs.push({
      outer,
      ...(inners.length > 0 ? { inners } : {}),
      surface: face.surface,
      reversed: face.reversed,
    });
  }

  const merged = buildBody(points, specs);
  return {
    body: merged,
    changed: true,
    merges,
    rejected,
    dissolved,
    planes: planes.length,
    faces: { before: before.faces, after: merged.faces.length },
    edges: { before: before.edges, after: merged.edges.length },
    vertices: { before: before.vertices, after: merged.vertices.length },
  };
}

/**
 * Quita los vértices que la fusión dejó a mitad de un lado.
 *
 * La adyacencia se lleva incremental: al disolver `v` entre `a` y `b`, la
 * arista `a–b` sustituye a las dos, y `a` y `b` vuelven a la cola porque pueden
 * haberse quedado ellos mismos con grado dos. Recalcular la incidencia entera
 * en cada disolución sería O(V·E) sin necesidad.
 */
function dissolveStraightVertices(body: BrepBody, faces: readonly WorkFace[], linear: number): number {
  const neighbours = new Map<number, Set<number>>();
  const loopsOf = new Map<number, Array<number[]>>();
  const add = <T>(map: Map<number, T[]>, key: number, value: T) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(value);
    else map.set(key, [value]);
  };
  for (const face of faces) {
    if (!face.alive) continue;
    for (const loop of face.loops) {
      for (let i = 0; i < loop.length; i += 1) {
        const current = loop[i];
        const next = loop[(i + 1) % loop.length];
        if (!neighbours.has(current)) neighbours.set(current, new Set());
        if (!neighbours.has(next)) neighbours.set(next, new Set());
        (neighbours.get(current) as Set<number>).add(next);
        (neighbours.get(next) as Set<number>).add(current);
        add(loopsOf, current, loop);
      }
    }
  }

  let dissolved = 0;
  const queue = [...neighbours.keys()];
  const gone = new Set<number>();
  let guard = 0;
  const limit = queue.length * 4 + 16;
  while (queue.length > 0 && guard < limit) {
    guard += 1;
    const vertex = queue.shift() as number;
    if (gone.has(vertex)) continue;
    const ring = neighbours.get(vertex);
    if (!ring || ring.size !== 2) continue;
    const [a, b] = [...ring];
    if (a === b) continue;
    // La arista sustituta no puede existir ya: sería una tercera cara sobre
    // ella, es decir, dejar de ser una variedad.
    if ((neighbours.get(a) as Set<number>).has(b)) continue;
    if (!collinearBetween(body.vertices[a].point, body.vertices[vertex].point, body.vertices[b].point, linear)) continue;
    const loops = loopsOf.get(vertex) ?? [];
    if (loops.some((loop) => loop.length <= 3)) continue;

    for (const loop of loops) {
      const at = loop.indexOf(vertex);
      if (at >= 0) loop.splice(at, 1);
    }
    (neighbours.get(a) as Set<number>).delete(vertex);
    (neighbours.get(b) as Set<number>).delete(vertex);
    (neighbours.get(a) as Set<number>).add(b);
    (neighbours.get(b) as Set<number>).add(a);
    neighbours.delete(vertex);
    loopsOf.delete(vertex);
    gone.add(vertex);
    dissolved += 1;
    queue.push(a, b);
  }
  return dissolved;
}

/** Para la spec: las piezas que no se exportan pero sí se prueban. */
export const __coplanarTestables = { singleRun, mergeOuterLoops, collinearBetween, edgeKey };
