/**
 * Evaluador del árbol de construcción de un SOLID3D.
 *
 * Es la pieza que convierte la RECETA que persiste el documento (ver
 * `cad-entities-v5.ts`) en un cuerpo del kernel B-rep, y por tanto el único
 * sitio del producto donde `lib/brep/` deja de ser una isla.
 *
 * ## Tres reglas que este módulo impone
 *
 * 1. **Se valida DESPUÉS de cada operación, no sólo al final.** El validador de
 *    `invariants.ts` es lo mejor que tiene el kernel y comprobarlo sólo en la
 *    raíz desperdicia su única virtud: decir QUÉ operación rompió el sólido. Un
 *    cuerpo inválido dos booleanas más abajo es indistinguible de un error de
 *    entrada.
 * 2. **Una referencia rota se RECHAZA, no se arregla.** Un `union` que nombra un
 *    nodo inexistente no tiene reparación razonable —no hay nada que adivinar—,
 *    así que `validateSolidTree` lo declara y el evaluador lanza.
 * 3. **La colocación es aparte de la receta.** Mover un sólido no reevalúa nada:
 *    cambia `placement`. Y como la afín del documento puede REFLEJAR, aquí está
 *    la regla que casi nadie escribe: con determinante negativo hay que darle la
 *    vuelta al cuerpo. Si no, las normales miran hacia dentro, el volumen sale
 *    negativo y el sólido se ve del revés sin un solo error por ningún sitio.
 *
 * ## Memoización, y por qué es necesaria y no una optimización prematura
 *
 * `CadSceneSynchronizer` recalcula la proyección de una entidad cada vez que su
 * `JSON.stringify` cambia, y `bounds()` se pregunta en cada pointermove a través
 * del índice espacial. Evaluar el árbol —con sus booleanas y su validación— en
 * cada una de esas llamadas convertiría un sólido de tres operaciones en una
 * congelación del editor. La clave del caché es la huella EXACTA del árbol más
 * su colocación, así que no puede devolver un cuerpo desactualizado.
 */
import {
  BodyBuilder,
  aabbDiagonal,
  attachPlanarSurfaces,
  assertValidBody,
  bodyBounds,
  bodyMassProperties,
  bodyToFaceSpecs,
  booleanDifference,
  booleanIntersection,
  booleanUnion,
  buildBody,
  chamferEdges,
  compareMassProperties,
  eulerCounts,
  extrudeProfile,
  halfEdgeDestination,
  halfEdgeSegment,
  filletEdges,
  loftProfiles,
  makeBox,
  makeFrame,
  reverseBody,
  revolveProfile,
  sweepProfile,
  tessellateBody,
  validateBody,
  vec3,
  type BrepBody,
  type BrepMesh,
  type EulerCounts,
  type FaceSpec,
  type MassProperties,
  type SurfaceFrame,
  type Vec2,
  type Vec3,
} from "../brep";
import type {
  CadSolid3dEntity,
  CadSolidFrame,
  CadSolidNode,
  CadSolidPlacement,
  CadSolidProfile,
} from "./cad-entities-v5";

/** Techo de nodos por sólido. Un árbol mayor no es un dibujo: es un bucle. */
export const CAD_SOLID_MAX_NODES = 256;

export interface CadSolidTreeIssue {
  code:
    | "empty-tree"
    | "duplicate-node"
    | "missing-root"
    | "broken-reference"
    | "cycle"
    | "operand-count"
    | "too-many-nodes"
    | "bad-geometry";
  nodeId?: string;
  message: string;
}

const identityPlacement: Required<CadSolidPlacement> = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
  dz: 0,
};

/** Colocación completa, con los valores por defecto ya resueltos. */
export function resolveSolidPlacement(placement?: CadSolidPlacement): Required<CadSolidPlacement> {
  if (!placement) return { ...identityPlacement };
  return {
    a: placement.a,
    b: placement.b,
    c: placement.c,
    d: placement.d,
    e: placement.e,
    f: placement.f,
    dz: placement.dz ?? 0,
  };
}

/** Determinante de la parte lineal. Negativo ⟺ la colocación refleja. */
export function solidPlacementDeterminant(placement?: CadSolidPlacement): number {
  const m = resolveSolidPlacement(placement);
  return m.a * m.d - m.b * m.c;
}

/**
 * Comprueba la ESTRUCTURA del árbol: ids únicos, raíz presente, referencias
 * resueltas, ausencia de ciclos y aridad de cada operación.
 *
 * Devuelve TODOS los problemas en vez de lanzar en el primero, porque el panel
 * de propiedades y la validación del servidor quieren enseñarlos juntos.
 */
export function validateSolidTree(entity: CadSolid3dEntity): CadSolidTreeIssue[] {
  const issues: CadSolidTreeIssue[] = [];
  const nodes = entity.nodes ?? [];
  if (nodes.length === 0) {
    issues.push({ code: "empty-tree", message: "Un SOLID3D necesita al menos un nodo de construcción." });
    return issues;
  }
  if (nodes.length > CAD_SOLID_MAX_NODES) {
    issues.push({
      code: "too-many-nodes",
      message: `El árbol tiene ${nodes.length} nodos y el máximo es ${CAD_SOLID_MAX_NODES}.`,
    });
  }
  const byId = new Map<string, CadSolidNode>();
  for (const node of nodes) {
    if (!node.id || typeof node.id !== "string") {
      issues.push({ code: "duplicate-node", message: "Todo nodo necesita un id no vacío." });
      continue;
    }
    if (byId.has(node.id)) {
      issues.push({ code: "duplicate-node", nodeId: node.id, message: `El nodo ${node.id} está duplicado.` });
      continue;
    }
    byId.set(node.id, node);
  }
  if (!entity.root || !byId.has(entity.root)) {
    issues.push({
      code: "missing-root",
      nodeId: entity.root,
      message: `La raíz ${entity.root || "(vacía)"} no existe entre los nodos del árbol.`,
    });
  }

  for (const node of byId.values()) {
    for (const reference of nodeOperands(node)) {
      if (!byId.has(reference)) {
        issues.push({
          code: "broken-reference",
          nodeId: node.id,
          message: `El nodo ${node.id} (${node.op}) referencia ${reference}, que no existe.`,
        });
      }
    }
    const arity = expectedOperandCount(node);
    if (arity !== null && nodeOperands(node).length < arity) {
      issues.push({
        code: "operand-count",
        nodeId: node.id,
        message: `El nodo ${node.id} (${node.op}) necesita al menos ${arity} operando(s).`,
      });
    }
  }

  // Ciclos. Un `union` que se alcanza a sí mismo no es geometría rara: es un
  // bucle infinito con paso por el kernel, y el síntoma sería una pestaña
  // colgada sin ningún mensaje.
  const state = new Map<string, "visiting" | "done">();
  const walk = (id: string): void => {
    const status = state.get(id);
    if (status === "done") return;
    if (status === "visiting") {
      issues.push({ code: "cycle", nodeId: id, message: `El nodo ${id} forma un ciclo en el árbol.` });
      return;
    }
    const node = byId.get(id);
    if (!node) return;
    state.set(id, "visiting");
    for (const reference of nodeOperands(node)) walk(reference);
    state.set(id, "done");
  };
  for (const id of byId.keys()) walk(id);

  return issues;
}

function nodeOperands(node: CadSolidNode): string[] {
  if ("operands" in node) return node.operands ?? [];
  if ("operand" in node) return node.operand ? [node.operand] : [];
  return [];
}

/** Operandos MÍNIMOS que exige cada operación; `null` para las hojas. */
function expectedOperandCount(node: CadSolidNode): number | null {
  switch (node.op) {
    case "union":
    case "subtract":
    case "intersect":
      return 2;
    case "fillet":
    case "chamfer":
    case "slice":
      return 1;
    default:
      return null;
  }
}

export interface SolidEvaluateOptions {
  /**
   * Validar los invariantes tras CADA operación. Por defecto sí — es el motivo
   * por el que existe el validador. Se puede apagar en un camino de sólo
   * dibujo donde el árbol ya se validó al escribirlo.
   */
  validate?: boolean;
}

const point = (p: { x: number; y: number; z: number }): Vec3 => vec3(p.x, p.y, p.z);

function toFrame(frame: CadSolidFrame | undefined): SurfaceFrame | undefined {
  if (!frame) return undefined;
  return makeFrame(
    point(frame.origin),
    point(frame.zAxis),
    frame.xAxis ? point(frame.xAxis) : undefined,
  );
}

function toProfile(profile: CadSolidProfile): { outer: Vec2[]; inners: Vec2[][] } {
  return {
    outer: profile.outer.map((p) => ({ x: p.x, y: p.y })),
    inners: (profile.inners ?? []).map((ring) => ring.map((p) => ({ x: p.x, y: p.y }))),
  };
}

/**
 * Evalúa el árbol y devuelve el cuerpo YA COLOCADO en el dibujo.
 *
 * Sin caché: el punto de entrada normal es `solid3dBody`. Se exporta porque los
 * specs quieren poder pedir una evaluación limpia y comprobar que el caché no
 * está tapando un fallo.
 */
export function evaluateSolidTree(
  entity: CadSolid3dEntity,
  options: SolidEvaluateOptions = {},
): BrepBody {
  const issues = validateSolidTree(entity);
  if (issues.length > 0) {
    throw new Error(
      `El árbol de construcción de ${entity.id} no es válido: ${issues.map((issue) => issue.message).join(" · ")}`,
    );
  }
  const validate = options.validate ?? true;
  const byId = new Map(entity.nodes.map((node) => [node.id, node] as const));
  const built = new Map<string, BrepBody>();

  const evaluate = (id: string): BrepBody => {
    const cached = built.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node) throw new Error(`El nodo ${id} no existe en el árbol de ${entity.id}.`);
    const body = buildNode(node, evaluate);
    if (validate) {
      const report = validateBody(body, { requireClosed: true, requirePlanarFaces: true });
      if (!report.ok) {
        throw new Error(
          `El nodo ${node.id} (${node.op}) de ${entity.id} produjo un cuerpo inválido: ` +
            report.violations.map((violation) => violation.message).join(" · "),
        );
      }
    }
    built.set(id, body);
    return body;
  };

  return placeBody(evaluate(entity.root), entity.placement);
}

function buildNode(node: CadSolidNode, evaluate: (id: string) => BrepBody): BrepBody {
  switch (node.op) {
    case "box":
      return makeBox({ min: point(node.min), max: point(node.max) });
    case "extrude":
      return extrudeProfile({
        profile: toProfile(node.profile),
        height: node.height,
        frame: toFrame(node.frame),
        draftAngleRad: node.draftAngleRad,
        steps: node.steps,
      });
    case "revolve":
      return revolveProfile({
        profile: toProfile(node.profile),
        angleRad: node.angleRad,
        segments: node.segments,
        frame: toFrame(node.frame),
      });
    case "sweep":
      return sweepProfile({
        profile: toProfile(node.profile),
        path: node.path.map(point),
        closed: node.closed,
        upHint: node.upHint ? point(node.upHint) : undefined,
      });
    case "loft":
      return loftProfiles({
        sections: node.sections.map((section) => ({
          profile: toProfile(section.profile),
          frame: makeFrame(
            point(section.frame.origin),
            point(section.frame.zAxis),
            section.frame.xAxis ? point(section.frame.xAxis) : undefined,
          ),
        })),
        closed: node.closed,
        steps: node.steps,
      });
    case "brep":
      return attachPlanarSurfaces(
        buildBody(
          node.points.map(point),
          node.faces.map((face) => ({ outer: [...face.outer], inners: face.inners?.map((ring) => [...ring]) })),
        ),
      );
    case "union":
      return node.operands
        .map(evaluate)
        .reduce((accumulated, operand) => booleanUnion(accumulated, operand));
    case "subtract":
      return node.operands
        .map(evaluate)
        .reduce((accumulated, operand) => booleanDifference(accumulated, operand));
    case "intersect":
      return node.operands
        .map(evaluate)
        .reduce((accumulated, operand) => booleanIntersection(accumulated, operand));
    case "fillet": {
      const body = evaluate(node.operand);
      return filletEdges(body, resolveEdges(body, node.edges), node.radius, node.segments ?? 8);
    }
    case "chamfer": {
      const body = evaluate(node.operand);
      return chamferEdges(body, resolveEdges(body, node.edges), node.distance, { segments: 1 });
    }
    case "slice":
      return sliceBody(evaluate(node.operand), node.plane, node.keep);
  }
}

/**
 * Una lista de aristas VACÍA significa «el juego por defecto», y ese juego NO es
 * «todas».
 *
 * El kernel no sabe fundir dos redondeos que se encuentran en un vértice: haría
 * falta una transición esférica que no implementa, y sus prismas cortantes se
 * solaparían dejando astillas degeneradas. Así que pedir «todas las aristas» de
 * un cubo no es una operación ambiciosa, es una operación imposible, y el kernel
 * se niega — correctamente — antes de intentarla.
 *
 * `preferredFeatureEdges` elige por tanto un conjunto de aristas que NO se tocan
 * entre sí, dando prioridad a las verticales. Para un prisma extruido —que es
 * casi todo lo que sale de un CAD 2D— eso son exactamente las esquinas que se
 * ven en planta, que es lo que un dibujante quiere redondear. Se resuelve contra
 * el CUERPO y no al escribir el nodo porque los índices de arista cambian si se
 * edita un nodo anterior del árbol.
 */
export function preferredFeatureEdges(body: BrepBody): number[] {
  const candidates = body.edges.map((edge, index) => {
    const segment = halfEdgeSegment(body, edge.a);
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const dz = segment.to.z - segment.from.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    return {
      index,
      vertical: Math.abs(dz) / length > 0.999,
      from: body.halfEdges[edge.a].origin,
      to: halfEdgeDestination(body, edge.a),
    };
  });
  candidates.sort((a, b) => (a.vertical === b.vertical ? a.index - b.index : a.vertical ? -1 : 1));
  const used = new Set<number>();
  const chosen: number[] = [];
  for (const candidate of candidates) {
    if (used.has(candidate.from) || used.has(candidate.to)) continue;
    used.add(candidate.from);
    used.add(candidate.to);
    chosen.push(candidate.index);
  }
  return chosen.sort((a, b) => a - b);
}

function resolveEdges(body: BrepBody, edges: readonly number[]): number[] {
  if (edges.length > 0) return [...edges];
  return preferredFeatureEdges(body);
}

/**
 * Corta un cuerpo por un plano y conserva un lado.
 *
 * Se resuelve restando una CAJA que cubre el semiespacio a descartar, en vez de
 * intersecar superficies: el kernel es facetado y sus booleanas trabajan sobre
 * caras planas, así que una caja es exactamente la herramienta que sabe manejar.
 * El tamaño se deriva de la diagonal del cuerpo MÁS su distancia al plano, de
 * modo que la caja sobresale por todos lados aunque el plano pase por un
 * extremo.
 */
function sliceBody(
  body: BrepBody,
  plane: { origin: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } },
  keep: "positive" | "negative",
): BrepBody {
  const bounds = bodyBounds(body);
  const centre = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
  const reach =
    aabbDiagonal(bounds) +
    Math.hypot(centre.x - plane.origin.x, centre.y - plane.origin.y, centre.z - plane.origin.z);
  const size = Math.max(reach * 2, 1);
  const normal = point(plane.normal);
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (!(length > 0)) throw new Error("El plano de corte necesita una normal no nula.");
  // La caja se extruye DESDE el plano hacia el lado que se descarta.
  const height = keep === "positive" ? -size : size;
  const half = size;
  const cutter = extrudeProfile({
    profile: {
      outer: [
        { x: -half, y: -half },
        { x: half, y: -half },
        { x: half, y: half },
        { x: -half, y: half },
      ],
    },
    height,
    frame: makeFrame(point(plane.origin), normal),
  });
  return booleanDifference(body, cutter);
}

/**
 * Aplica la colocación al cuerpo evaluado.
 *
 * La afín es 2×3 sobre XY —la misma que el resto del documento— más un
 * desplazamiento en Z. Un plano transformado por una afín sigue siendo un plano,
 * así que todas las caras siguen siendo planas y no hace falta reteselar nada;
 * lo único que hay que rehacer son las superficies portadoras, porque las
 * antiguas describen la posición ANTERIOR.
 *
 * Y la regla que da nombre a este comentario: **con determinante negativo el
 * cuerpo se invierte**. Una reflexión cambia la lateralidad del espacio, de modo
 * que un lazo antihorario visto desde fuera pasa a serlo desde dentro. Sin
 * `reverseBody`, el sólido espejado tiene todas sus normales hacia dentro: se
 * dibuja negro o del revés, su volumen sale NEGATIVO y las booleanas que lo
 * tomen como operando devuelven el complementario.
 */
export function placeBody(body: BrepBody, placement?: CadSolidPlacement): BrepBody {
  const m = resolveSolidPlacement(placement);
  const determinant = m.a * m.d - m.b * m.c;
  if (
    m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0 && m.dz === 0
  )
    return body;
  if (!(Math.abs(determinant) > 0)) {
    throw new Error("La colocación de un SOLID3D es singular: aplastaría el sólido a un plano.");
  }
  const points = body.vertices.map((vertex) =>
    vec3(
      m.a * vertex.point.x + m.c * vertex.point.y + m.e,
      m.b * vertex.point.x + m.d * vertex.point.y + m.f,
      vertex.point.z + m.dz,
    ),
  );
  const specs: FaceSpec[] = bodyToFaceSpecs(body).map((spec) => ({
    outer: [...spec.outer],
    inners: spec.inners?.map((ring) => [...ring]),
  }));
  const moved = attachPlanarSurfaces(buildBody(points, specs));
  return determinant < 0 ? attachPlanarSurfaces(reverseBody(moved)) : moved;
}

/** Convierte un cuerpo del kernel en el nodo `brep` que lo reproduce. */
export function bodyToSolidNode(
  body: BrepBody,
  id: string,
  source?: { format: "step" | "iges"; name?: string },
): CadSolidNode {
  return {
    id,
    op: "brep",
    points: body.vertices.map((vertex) => ({ ...vertex.point })),
    faces: bodyToFaceSpecs(body).map((spec) => ({
      outer: [...spec.outer],
      ...(spec.inners && spec.inners.length > 0 ? { inners: spec.inners.map((ring) => [...ring]) } : {}),
    })),
    ...(source ? { source } : {}),
  };
}

/**
 * Suelda una sopa de puntos repetidos antes de construir. `buildBody` no suelda
 * —los índices ya vienen resueltos— así que un cuerpo importado que trae el
 * mismo vértice escrito dos veces produciría dos vértices distintos y una
 * topología con aristas de borde donde no las hay.
 */
export function weldedBodyFromLoops(
  loops: readonly (readonly Vec3[])[],
  tolerance = 1e-7,
): BrepBody {
  const builder = new BodyBuilder(tolerance);
  for (const loop of loops) {
    if (loop.length < 3) continue;
    builder.addPolygon(loop);
  }
  return attachPlanarSurfaces(builder.build());
}

// ---------------------------------------------------------------------------
// Caché
// ---------------------------------------------------------------------------

interface SolidCacheEntry {
  body: BrepBody;
  mesh?: BrepMesh;
  mass?: MassProperties;
}

const cache = new Map<string, SolidCacheEntry>();
/** Techo del caché. Se desaloja lo más antiguo: un Map de JS conserva el orden. */
const CACHE_LIMIT = 128;

function cacheKey(entity: CadSolid3dEntity): string {
  return JSON.stringify({ nodes: entity.nodes, root: entity.root, placement: entity.placement });
}

function entryFor(entity: CadSolid3dEntity): SolidCacheEntry {
  const key = cacheKey(entity);
  const hit = cache.get(key);
  if (hit) return hit;
  const entry: SolidCacheEntry = { body: evaluateSolidTree(entity) };
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, entry);
  return entry;
}

/** Vacía el caché. Los specs lo usan para medir el coste real de una evaluación. */
export function clearSolidCache(): void {
  cache.clear();
}

/** Cuerpo del sólido, memoizado por la huella exacta de su árbol y colocación. */
export function solid3dBody(entity: CadSolid3dEntity): BrepBody {
  return entryFor(entity).body;
}

/** Malla del sólido, memoizada. Es el formato que espera el visor 3D. */
export function solid3dMesh(entity: CadSolid3dEntity): BrepMesh {
  const entry = entryFor(entity);
  entry.mesh ??= tessellateBody(entry.body);
  return entry.mesh;
}

/** Volumen, área y centroide, memoizados. */
export function solid3dMassProperties(entity: CadSolid3dEntity): MassProperties {
  const entry = entryFor(entity);
  entry.mass ??= bodyMassProperties(entry.body);
  return entry.mass;
}

/** Cuentas de Euler-Poincaré del sólido evaluado. */
export function solid3dEulerCounts(entity: CadSolid3dEntity): EulerCounts {
  return eulerCounts(solid3dBody(entity));
}

/**
 * Contraste de los DOS caminos: integración sobre las caras del B-rep frente a
 * suma sobre los triángulos de la malla. Se reexporta con el sólido como entrada
 * para que MASSPROP y las specs no tengan que evaluar el árbol a mano.
 */
export function solid3dMassComparison(entity: CadSolid3dEntity) {
  return compareMassProperties(solid3dBody(entity));
}

/** Lanza si el cuerpo del sólido rompe algún invariante. */
export function assertSolidValid(entity: CadSolid3dEntity): void {
  assertValidBody(
    solid3dBody(entity),
    { requireClosed: true, requirePlanarFaces: true },
    `SOLID3D ${entity.id}`,
  );
}
