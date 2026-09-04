/**
 * SHELL — vaciar un sólido: lo que convierte una caja en un recipiente.
 *
 * ## Qué faltaba
 *
 * `solids-edit.ts` lo declaraba con todas sus letras: *«Cuerpo · Estampar y
 * Vaciar (SHELL): sin operación de kernel … Vaciar pide desfasar TODAS las
 * caras a la vez hacia dentro resolviendo sus intersecciones; ninguna de las dos
 * existe en `lib/brep/`»*. Ésta es la mitad que faltaba. La otra —Estampar—
 * sigue sin existir y se sigue diciendo.
 *
 * ## Cómo se vacía, y por qué así
 *
 * Un sólido vaciado es el exterior MENOS un cuerpo interior. Todo el trabajo
 * está en construir ese interior, y aquí se construye por DESFASE DE PLANOS:
 *
 *   1. cada cara aporta su plano `n·x = d` con `n` la normal SALIENTE;
 *   2. el plano interior es el mismo `n` con `d − espesor` — desplazado hacia
 *      dentro exactamente el espesor pedido;
 *   3. cada vértice se recalcula como la INTERSECCIÓN de los planos
 *      desfasados de sus caras incidentes.
 *
 * El paso 3 es el que hace honesto el resultado. Mover cada vértice a lo largo
 * de «su» normal —el atajo que todo el mundo escribe primero— no da un cuerpo
 * interior: la esquina de una caja se movería 10 en x, en y y en z a la vez,
 * saliéndose de los tres planos. La intersección de los tres planos SÍ cae
 * donde debe, y por construcción cada vértice nuevo cumple exactamente los
 * planos de todas sus caras: las caras interiores nacen planas y paralelas a
 * las suyas, no «casi».
 *
 * Con TRES planos el punto es único y se resuelve por Cramer (exacto). Con
 * CUATRO O MÁS —el ápice de una pirámide, el de un cono facetado— el sistema
 * está sobredeterminado y se resuelve por mínimos cuadrados; entonces se
 * comprueba el RESIDUO, porque un sistema sobredeterminado puede no tener
 * solución: si los planos desfasados de ese vértice no concurren, el interior
 * tendría que partir el vértice en varios, es decir, OTRA topología. Eso se
 * rechaza nombrándolo en vez de devolver un cuerpo torcido.
 *
 * La topología se conserva TAL CUAL: mismas caras, mismos lazos, mismos
 * índices de vértice. Sólo cambian las coordenadas. Por eso el interior nace
 * válido —lo cose el mismo `buildBody` con los mismos `FaceSpec`— y por eso el
 * hueco sale de `booleanDifference(exterior, interior)`, camino ya probado.
 *
 * ## Sólo convexos, y la convexidad se COMPRUEBA
 *
 * En un cuerpo cóncavo el desfase hacia dentro deja de ser el interior: en un
 * rincón entrante los planos desfasados se cruzan del lado equivocado, las
 * caras se dan la vuelta y el «interior» se sale del sólido. La forma correcta
 * de vaciar un cóncavo es el offset con recorte (resolver qué trozos de cada
 * plano desfasado sobreviven), y eso es otro algoritmo, no un parche a éste.
 *
 * Así que la convexidad no se supone: se mide con `edgeDihedralAngle` sobre
 * TODAS las aristas, con el mismo convenio que ya usa el chaflán —diedro
 * interior menor que π es convexo, mayor es cóncavo—. Un cuerpo cóncavo se
 * rechaza nombrando su peor arista y su ángulo.
 *
 * ## El límite del espesor, calculado y no adivinado
 *
 * El vértice desfasado es una función AFÍN del espesor: `p(t) = base − t·rate`,
 * porque resolver `A·p = d − t·1` es resolver `A·base = d` y `A·rate = 1` y
 * restar. Eso permite calcular EXACTAMENTE cuánto aguanta el cuerpo sin una
 * sola bisección: para cada vértice `v` y cada cara `f` que no lo contiene, la
 * holgura `(d_f − t) − n_f·p_v(t)` es afín en `t`, vale `s₀ ≥ 0` en `t = 0` y
 * decrece con pendiente `k = 1 − n_f·rate_v`. El mayor espesor admisible es
 * `mín s₀/k` sobre los pares con `k > 0`.
 *
 * En una caja de 100 ese mínimo sale 50, que es la mitad de su espesor mínimo:
 * a partir de ahí el interior se ha comido la pieza. El rechazo dice el número
 * en vez de decir «no cabe».
 *
 * ## Lo que esta operación NO hace, dicho
 *
 *   · La cáscara ABIERTA de AutoCAD —vaciar RETIRANDO las caras designadas, que
 *     es lo que convierte la caja en una caja sin tapa— no está. Pide quitar
 *     caras del exterior y coser el interior con el exterior por el borde del
 *     hueco, y eso es cirugía topológica, no una resta booleana.
 *   · Vaciar hacia FUERA (espesor negativo, la convención de AutoCAD para
 *     engordar). El desfase saldría, pero el sólido resultante sería el
 *     engordado menos el original y eso es otra orden con otro nombre.
 *   · Cuerpos cóncavos, por lo dicho arriba.
 *   · Caras curvas: el kernel es facetado y aquí se trabaja sobre el plano de
 *     cada cara. Un cilindro es un prisma de N lados y se vacía como tal.
 */
import { bodyToFaceSpecs, buildBody, type FaceSpec } from "./body-builder";
import { booleanDifference } from "./boolean";
import { validateBody } from "./invariants";
import { attachPlanarSurfaces } from "./primitives";
import { resolveTolerance, type BrepTolerance } from "./tolerance";
import {
  NO_INDEX,
  bodyBounds,
  bodyIsClosed,
  connectedComponentCount,
  edgeDihedralAngle,
  faceCentroid,
  faceGeometricNormal,
  planarBodyVolume,
  vertexOutgoingHalfEdges,
  type BrepBody,
} from "./topology";
import { aabbDiagonal, v3Cross, v3Dot, v3Length, v3Sub, vec3, type Vec3 } from "./vec3";

/**
 * Diedro interior por encima del cual una arista se declara CÓNCAVA.
 *
 * Más flojo que el `1e-9` con que el chaflán distingue una arista plana, y a
 * propósito: allí se pregunta por UNA arista de un cuerpo recién construido,
 * aquí por TODAS las de un cuerpo que puede venir de una booleana por BSP, con
 * normales que salen de sumas de Newell sobre polígonos ya cortados. A `1e-9`,
 * una caja cortada por un plano se declararía cóncava por ruido de coma
 * flotante; a `1e-6` sigue sin caber ningún rincón real (el más suave que
 * produce un cuerpo de verdad mide milésimas de radián).
 */
const CONVEX_TOLERANCE_RAD = 1e-6;

/**
 * `|n₀ · (n₁ × n₂)|` mínimo para aceptar que tres planos definen un punto.
 *
 * Las tres normales son unitarias, así que el producto mixto es el seno del
 * ángulo con que el tercer plano se aparta del diedro de los otros dos. Por
 * debajo de esto los tres planos son un libro abierto y su «intersección» es
 * una recta larguísima cuyo punto elegido depende del ruido: mejor rechazar.
 */
const MIN_TRIPLE = 1e-6;

/**
 * Umbral del determinante de las ecuaciones normales `M = Σ nᵢnᵢᵀ`.
 *
 * Por Cauchy–Binet, `det(M)` es la SUMA de los cuadrados de los productos
 * mixtos de todos los tríos de normales. Exigir `det(M) > MIN_TRIPLE²` es por
 * tanto exigir que exista al menos un trío tan bien condicionado como el que
 * admitiría el camino exacto. No es un número inventado: es el mismo criterio
 * escrito para k planos.
 */
const MIN_NORMAL_DET = MIN_TRIPLE * MIN_TRIPLE;

/**
 * Desviación admisible de `n · rate` respecto de 1 al comprobar que los planos
 * de un vértice CONCURREN al desfasarlos.
 *
 * `rate` es adimensional —sale de resolver `A·rate = 1` con `A` de normales
 * unitarias—, así que el umbral también lo es y no hay que escalarlo al tamaño
 * del modelo. Es el residuo relativo por unidad de espesor: con `1e-6`, una
 * pared de 10 se sale de su plano menos de `1e-5`, muy por debajo de cualquier
 * tolerancia lineal del kernel.
 */
const MAX_RATE_RESIDUAL = 1e-6;

/**
 * Pendiente mínima para que una cara acote el espesor.
 *
 * Las caras que pasan POR el vértice tienen pendiente exactamente cero, y en
 * coma flotante «exactamente cero» es `±1e-17`. Dividir la holgura entre ese
 * ruido daría un límite disparatado —o negativo— a partir de una cara que no
 * limita nada.
 */
const MIN_SLACK_RATE = 1e-12;

export interface ShellOptions {
  tolerance?: Partial<BrepTolerance>;
}

export interface ConvexityReport {
  convex: boolean;
  /** Aristas cuyo diedro interior pasa de π. */
  concaveEdges: number;
  /** La peor de ellas, o `NO_INDEX` si el cuerpo es convexo. */
  worstEdge: number;
  /** Diedro interior de la peor, en grados. */
  worstDegrees: number;
}

/**
 * ¿Es convexo el cuerpo? Con el convenio del chaflán: diedro interior menor
 * que π es una arista convexa, mayor es un rincón entrante.
 *
 * Una arista de BORDE (`edgeDihedralAngle` devuelve `null`) no tiene diedro
 * porque sólo tiene una cara. No se cuenta como cóncava: el cuerpo abierto se
 * rechaza antes, por abierto, y con su propio motivo.
 */
export function bodyConvexity(body: BrepBody): ConvexityReport {
  let concaveEdges = 0;
  let worstEdge = NO_INDEX;
  let worst = 0;
  for (let edge = 0; edge < body.edges.length; edge += 1) {
    const dihedral = edgeDihedralAngle(body, edge);
    if (dihedral === null) continue;
    if (dihedral > Math.PI + CONVEX_TOLERANCE_RAD) concaveEdges += 1;
    if (dihedral > worst) {
      worst = dihedral;
      worstEdge = edge;
    }
  }
  return {
    convex: concaveEdges === 0,
    concaveEdges,
    worstEdge: concaveEdges === 0 ? NO_INDEX : worstEdge,
    worstDegrees: (worst * 180) / Math.PI,
  };
}

/** Plano de una cara: normal unitaria SALIENTE y `n · p` para sus puntos. */
interface FacePlane {
  normal: Vec3;
  distance: number;
}

function facePlanes(body: BrepBody): FacePlane[] {
  const planes: FacePlane[] = [];
  for (let face = 0; face < body.faces.length; face += 1) {
    const normal = faceGeometricNormal(body, face);
    planes.push({ normal, distance: v3Dot(normal, faceCentroid(body, face)) });
  }
  return planes;
}

/** Tolerancia lineal de la pasada: la MISMA que aplica el validador. */
function linearToleranceFor(body: BrepBody, tol: BrepTolerance): number {
  return tol.linear * Math.max(1, aabbDiagonal(bodyBounds(body)));
}

/** Caras incidentes en un vértice, sin repetir. */
function vertexFaces(body: BrepBody, vertex: number): number[] {
  const faces = new Set<number>();
  for (const halfEdge of vertexOutgoingHalfEdges(body, vertex)) {
    faces.add(body.loops[body.halfEdges[halfEdge].loop].face);
  }
  return [...faces];
}

/** Resuelve `[m₀; m₁; m₂]·x = rhs` por Cramer. `null` si el sistema no manda. */
function solve3(m0: Vec3, m1: Vec3, m2: Vec3, rhs: readonly [number, number, number], minDet: number): Vec3 | null {
  const cross12 = v3Cross(m1, m2);
  const determinant = v3Dot(m0, cross12);
  if (!(Math.abs(determinant) > minDet)) return null;
  const cross20 = v3Cross(m2, m0);
  const cross01 = v3Cross(m0, m1);
  return vec3(
    (rhs[0] * cross12.x + rhs[1] * cross20.x + rhs[2] * cross01.x) / determinant,
    (rhs[0] * cross12.y + rhs[1] * cross20.y + rhs[2] * cross01.y) / determinant,
    (rhs[0] * cross12.z + rhs[1] * cross20.z + rhs[2] * cross01.z) / determinant,
  );
}

/**
 * El vértice desfasado como función afín del espesor: `p(t) = base − t·rate`.
 *
 * `base` es la solución con espesor cero —que es el vértice original, porque
 * todos sus planos pasan por él— y `rate` la dirección en que se mete hacia
 * dentro por unidad de espesor. Guardar las dos cosas es lo que permite
 * calcular el espesor máximo sin buscar a tientas.
 */
interface VertexOffset {
  base: Vec3;
  rate: Vec3;
  /** Planos DISTINTOS que se usaron. */
  planes: number;
  /** `true` si se resolvió con tres planos exactos; `false` por mínimos cuadrados. */
  exact: boolean;
}

/**
 * Planos distintos de las caras de un vértice.
 *
 * La deduplicación importa en cuerpos FRAGMENTADOS: tras una booleana por BSP
 * una misma cara plana llega partida en varias, y un vértice puede tocar cinco
 * caras que son sólo tres planos. Sin deduplicar, el sistema sería
 * sobredeterminado por repetición —lo que no aporta información— y el camino
 * exacto de tres planos no se usaría nunca.
 */
function distinctPlanes(
  planes: readonly FacePlane[],
  faces: readonly number[],
  angular: number,
  linear: number,
): FacePlane[] {
  const kept: FacePlane[] = [];
  for (const face of faces) {
    const plane = planes[face];
    if (!(v3Length(plane.normal) > 0.5)) continue;
    const repeated = kept.some(
      (other) =>
        v3Length(v3Sub(plane.normal, other.normal)) <= angular &&
        Math.abs(plane.distance - other.distance) <= linear,
    );
    if (!repeated) kept.push(plane);
  }
  return kept;
}

/** Resuelve UN vértice, o dice por qué no puede. */
function solveVertex(
  body: BrepBody,
  vertex: number,
  planes: readonly FacePlane[],
  angular: number,
  linear: number,
): { ok: true; offset: VertexOffset } | { ok: false; reason: string } {
  const incident = distinctPlanes(planes, vertexFaces(body, vertex), angular, linear);
  if (incident.length < 3) {
    return {
      ok: false,
      reason:
        `El vértice ${vertex} sólo toca ${incident.length} plano(s) distinto(s): no es una esquina, ` +
        `sino un punto a mitad de una cara o de una arista, y desfasar no dice adónde debe ir. ` +
        `Es lo que deja una booleana fragmentada; SOLIDEDIT cUerpo Limpiar funde esas caras y entonces sí.`,
    };
  }

  if (incident.length === 3) {
    const [a, b, c] = incident;
    const base = solve3(a.normal, b.normal, c.normal, [a.distance, b.distance, c.distance], MIN_TRIPLE);
    const rate = solve3(a.normal, b.normal, c.normal, [1, 1, 1], MIN_TRIPLE);
    if (!base || !rate) {
      return {
        ok: false,
        reason: `Los tres planos del vértice ${vertex} son casi paralelos entre sí: su intersección no es un punto.`,
      };
    }
    return drifted(body, vertex, base, linear) ?? { ok: true, offset: { base, rate, planes: 3, exact: true } };
  }

  // Cuatro planos o más: ecuaciones normales `M·x = Σ nᵢ·rhsᵢ`.
  let m0 = vec3(0, 0, 0);
  let m1 = vec3(0, 0, 0);
  let m2 = vec3(0, 0, 0);
  let bd = vec3(0, 0, 0);
  let b1 = vec3(0, 0, 0);
  for (const plane of incident) {
    const n = plane.normal;
    m0 = vec3(m0.x + n.x * n.x, m0.y + n.x * n.y, m0.z + n.x * n.z);
    m1 = vec3(m1.x + n.y * n.x, m1.y + n.y * n.y, m1.z + n.y * n.z);
    m2 = vec3(m2.x + n.z * n.x, m2.y + n.z * n.y, m2.z + n.z * n.z);
    bd = vec3(bd.x + n.x * plane.distance, bd.y + n.y * plane.distance, bd.z + n.z * plane.distance);
    b1 = vec3(b1.x + n.x, b1.y + n.y, b1.z + n.z);
  }
  const base = solve3(m0, m1, m2, [bd.x, bd.y, bd.z], MIN_NORMAL_DET);
  const rate = solve3(m0, m1, m2, [b1.x, b1.y, b1.z], MIN_NORMAL_DET);
  if (!base || !rate) {
    return {
      ok: false,
      reason:
        `Las ${incident.length} caras del vértice ${vertex} no definen una esquina: sus normales son casi coplanarias ` +
        `y el sistema de mínimos cuadrados es singular.`,
    };
  }
  // El residuo del sistema NO desfasado tiene que ser cero: todos los planos
  // pasan por el vértice. Si no lo es, la geometría de partida ya miente.
  for (const plane of incident) {
    if (Math.abs(v3Dot(plane.normal, base) - plane.distance) > linear) {
      return {
        ok: false,
        reason:
          `Las ${incident.length} caras del vértice ${vertex} no se cortan todas en él: el cuerpo de partida ` +
          `no es coherente con sus propios planos.`,
      };
    }
  }
  // Y el residuo del desfasado: `n·p(t) − (d − t) = −t·(n·rate − 1)`, así que
  // basta comprobar `n·rate = 1` para saber que los planos desfasados concurren
  // A CUALQUIER espesor. Cuando no concurren, el interior tendría que partir el
  // vértice en varios y eso es OTRA topología, no un desfase.
  for (const plane of incident) {
    if (Math.abs(v3Dot(plane.normal, rate) - 1) > MAX_RATE_RESIDUAL) {
      return {
        ok: false,
        reason:
          `Los ${incident.length} planos del vértice ${vertex} no concurren al desfasarlos hacia dentro: ` +
          `no hay un punto a la misma distancia de todos. Vaciar ese vértice pediría partirlo en varios, ` +
          `es decir, cambiar la topología; todavía no está disponible.`,
      };
    }
  }
  return drifted(body, vertex, base, linear) ?? { ok: true, offset: { base, rate, planes: incident.length, exact: false } };
}

/**
 * ¿La solución cae DONDE ESTÁ el vértice?
 *
 * Los planos de las caras de un vértice pasan por él, así que con espesor cero
 * la intersección tiene que devolver el propio vértice. Cuando no lo hace, la
 * cara no es plana de verdad —su plano medio es una aproximación— y desfasarla
 * movería material sin que nadie lo hubiera pedido. Devuelve el rechazo, o
 * `null` si todo cuadra, para que quien llama lo encadene con `??`.
 */
function drifted(
  body: BrepBody,
  vertex: number,
  base: Vec3,
  linear: number,
): { ok: false; reason: string } | null {
  const drift = v3Length(v3Sub(base, body.vertices[vertex].point));
  if (!(drift > linear)) return null;
  return {
    ok: false,
    reason:
      `El vértice ${vertex} y la intersección de los planos de sus caras difieren ${drift.toExponential(2)}: ` +
      `esas caras no son planas de verdad y desfasarlas movería material.`,
  };
}

export interface ShellLimit {
  /**
   * Mayor espesor —EXCLUSIVO— que este cuerpo admite conservando su topología.
   * En una caja de 100 vale 50: la mitad de su espesor mínimo.
   */
  maxThickness: number;
  /** Vértices resueltos con tres planos exactos. */
  exact: number;
  /** Vértices resueltos por mínimos cuadrados (cuatro planos o más). */
  leastSquares: number;
}

/**
 * El espesor máximo del cuerpo y cómo se resolvió cada vértice.
 *
 * Va aparte de `shellBody` porque es lo que hace falta para PREGUNTAR antes de
 * vaciar: el diálogo puede decir cuánto cabe sin llegar a construir nada.
 */
export function shellLimit(
  body: BrepBody,
  options: ShellOptions = {},
): { ok: true; limit: ShellLimit } | { ok: false; reason: string } {
  const solved = solveOffsets(body, resolveTolerance(options.tolerance));
  if (!solved.ok) return solved;
  return { ok: true, limit: solved.limit };
}

/**
 * Resuelve TODOS los vértices y, con ellos, el espesor máximo.
 *
 * Una sola pasada porque el corte se calcula con lo mismo que el desfase: el
 * par `(base, rate)` de cada vértice. Separarlo en dos funciones públicas que
 * resolvieran cada una por su cuenta duplicaría el trabajo más caro del módulo
 * justo en el camino que siempre se recorre entero.
 */
function solveOffsets(
  body: BrepBody,
  tol: BrepTolerance,
): { ok: true; offsets: VertexOffset[]; limit: ShellLimit } | { ok: false; reason: string } {
  const linear = linearToleranceFor(body, tol);
  const planes = facePlanes(body);

  const offsets: VertexOffset[] = [];
  let exact = 0;
  for (let vertex = 0; vertex < body.vertices.length; vertex += 1) {
    const solved = solveVertex(body, vertex, planes, tol.angular, linear);
    if (!solved.ok) return solved;
    offsets.push(solved.offset);
    if (solved.offset.exact) exact += 1;
  }

  // El corte: para cada vértice y cada cara que NO lo contiene, la holgura
  // decrece linealmente con el espesor y el primer cruce por cero manda.
  let maxThickness = Infinity;
  for (const offset of offsets) {
    for (const plane of planes) {
      const slack = plane.distance - v3Dot(plane.normal, offset.base);
      // Las caras que pasan POR el vértice —las suyas y las coplanarias con
      // ellas— tienen holgura nula y pendiente nula: nunca lo limitan, y
      // dividir una entre otra sólo daría ruido.
      if (Math.abs(slack) <= linear) continue;
      const rate = 1 - v3Dot(plane.normal, offset.rate);
      if (!(rate > MIN_SLACK_RATE)) continue;
      maxThickness = Math.min(maxThickness, slack / rate);
    }
  }
  if (!Number.isFinite(maxThickness)) {
    return { ok: false, reason: "El cuerpo no acota ningún espesor: no parece cerrado ni convexo." };
  }
  return { ok: true, offsets, limit: { maxThickness, exact, leastSquares: offsets.length - exact } };
}

/** Espesor máximo a secas, para quien sólo quiere el número. `null` si no se puede. */
export function maxShellThickness(body: BrepBody, options: ShellOptions = {}): number | null {
  const limit = shellLimit(body, options);
  return limit.ok ? limit.limit.maxThickness : null;
}

/**
 * El cuerpo INTERIOR: la misma topología con todos los planos metidos hacia
 * dentro el espesor pedido.
 *
 * Se cose con `buildBody` a partir de los MISMOS `FaceSpec` del exterior. Ésa
 * es la razón por la que el interior nace válido y no hay que repararlo: no se
 * ha inventado ni una cara.
 */
export function offsetInnerBody(
  body: BrepBody,
  thickness: number,
  options: ShellOptions = {},
): { ok: true; body: BrepBody; limit: ShellLimit } | { ok: false; reason: string } {
  if (!Number.isFinite(thickness) || !(thickness > 0)) {
    return { ok: false, reason: "El espesor de vaciado tiene que ser un número positivo." };
  }
  const solved = solveOffsets(body, resolveTolerance(options.tolerance));
  if (!solved.ok) return solved;
  if (thickness >= solved.limit.maxThickness) {
    return {
      ok: false,
      reason:
        `El espesor ${thickness} se come la pieza: este cuerpo admite menos de ${solved.limit.maxThickness} ` +
        `(a partir de ahí las caras desfasadas se cruzan y el interior deja de existir).`,
    };
  }

  const points: Vec3[] = solved.offsets.map(({ base, rate }) =>
    vec3(base.x - thickness * rate.x, base.y - thickness * rate.y, base.z - thickness * rate.z),
  );

  const specs: FaceSpec[] = bodyToFaceSpecs(body).map((spec) => ({
    outer: [...spec.outer],
    ...(spec.inners && spec.inners.length > 0 ? { inners: spec.inners.map((ring) => [...ring]) } : {}),
  }));

  let interior: BrepBody;
  try {
    interior = attachPlanarSurfaces(buildBody(points, specs));
  } catch (error) {
    return {
      ok: false,
      reason: `El cuerpo interior no se pudo coser: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const validation = validateBody(interior, { requireClosed: true, requirePlanarFaces: true });
  if (!validation.ok) {
    return {
      ok: false,
      reason: `El cuerpo interior no es un sólido válido: ${validation.violations.map((violation) => violation.message).join(" · ")}`,
    };
  }
  if (!(planarBodyVolume(interior) > 0)) {
    return { ok: false, reason: `El espesor ${thickness} deja un interior de volumen nulo o invertido.` };
  }
  return { ok: true, body: interior, limit: solved.limit };
}

export interface ShellReport {
  /** El cuerpo con hueco: exterior menos interior. Dos cáscaras. */
  body: BrepBody;
  /** El interior que se restó, por si alguien quiere medirlo o dibujarlo. */
  interior: BrepBody;
  thickness: number;
  /** El mayor espesor que este cuerpo habría admitido. */
  maxThickness: number;
  /** Cáscaras del resultado. Un vaciado cerrado tiene DOS. */
  shells: number;
  /** Vértices resueltos con tres planos exactos y por mínimos cuadrados. */
  exact: number;
  leastSquares: number;
  volume: { outer: number; inner: number; shell: number };
  faces: { outer: number; shell: number };
  edges: { outer: number; shell: number };
  vertices: { outer: number; shell: number };
}

export type ShellResult = { ok: true; report: ShellReport } | { ok: false; reason: string };

/**
 * Vacía un sólido CONVEXO dejando una pared del espesor pedido.
 *
 * Devuelve el motivo en vez de lanzar: vaciar demasiado o vaciar un cóncavo no
 * son errores de programación sino respuestas legítimas a una petición que no
 * cabe, y quien llama tiene que poder decírselas al dibujante tal cual.
 */
export function shellBody(body: BrepBody, thickness: number, options: ShellOptions = {}): ShellResult {
  if (body.faces.length === 0) return { ok: false, reason: "No hay cuerpo que vaciar." };
  if (!bodyIsClosed(body)) {
    return {
      ok: false,
      reason: "Vaciar necesita un sólido CERRADO; este cuerpo tiene aristas de borde y es una lámina.",
    };
  }
  const convexity = bodyConvexity(body);
  if (!convexity.convex) {
    return {
      ok: false,
      reason:
        `El cuerpo es CÓNCAVO: ${convexity.concaveEdges} arista(s) con diedro entrante, la peor de ` +
        `${convexity.worstDegrees.toFixed(1)}°. Desfasar los planos de un cuerpo cóncavo hacia dentro no da ` +
        `un cuerpo interior; todavía no está disponible.`,
    };
  }

  const inner = offsetInnerBody(body, thickness, options);
  if (!inner.ok) return inner;

  let hollow: BrepBody;
  try {
    hollow = booleanDifference(body, inner.body);
  } catch (error) {
    return {
      ok: false,
      reason: `La resta del interior no pudo completarse: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const validation = validateBody(hollow, { requireClosed: true, requirePlanarFaces: true });
  if (!validation.ok) {
    return {
      ok: false,
      reason: `El sólido vaciado no pasó los invariantes: ${validation.violations.map((violation) => violation.message).join(" · ")}`,
    };
  }
  const shells = connectedComponentCount(hollow);
  if (shells !== 2) {
    // Dos cáscaras es la firma de un vaciado CERRADO: la de fuera y la del
    // hueco. Una sola significa que el interior tocó la piel y el hueco se
    // abrió al exterior — un resultado que puede ser correcto como sólido pero
    // que ya no es lo que se pidió.
    return {
      ok: false,
      reason: `El vaciado no dejó un hueco cerrado: el resultado tiene ${shells} cáscara(s) en vez de dos.`,
    };
  }

  return {
    ok: true,
    report: {
      body: hollow,
      interior: inner.body,
      thickness,
      maxThickness: inner.limit.maxThickness,
      shells,
      exact: inner.limit.exact,
      leastSquares: inner.limit.leastSquares,
      volume: {
        outer: planarBodyVolume(body),
        inner: planarBodyVolume(inner.body),
        shell: planarBodyVolume(hollow),
      },
      faces: { outer: body.faces.length, shell: hollow.faces.length },
      edges: { outer: body.edges.length, shell: hollow.edges.length },
      vertices: { outer: body.vertices.length, shell: hollow.vertices.length },
    },
  };
}

/** Para la spec: las piezas que no se exportan pero sí se prueban. */
export const __shellTestables = { solve3, facePlanes, vertexFaces, distinctPlanes, CONVEX_TOLERANCE_RAD };
