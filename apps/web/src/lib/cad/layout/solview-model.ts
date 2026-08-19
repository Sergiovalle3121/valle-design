/**
 * De qué está hecha una vista derivada: qué del MODELO alimenta una ventana y
 * cómo se proyecta sobre su papel.
 *
 * Es la mitad geométrica de SOLVIEW/SOLDRAW. La otra —qué ventanas y qué capas
 * se crean, y cuándo hay que rehacer el dibujo— vive en `solview.ts` y
 * `solview-associativity.ts`. Están separadas porque esta parte es pura
 * geometría y se puede medir sola, y porque el día que la proyección mejore
 * (aristas ocultas exactas sobre cuerpos cóncavos) sólo cambia este archivo.
 *
 * ## Qué cuenta como CUERPO, y por qué el muro también
 *
 * Un `solid3d` ya trae su cuerpo B-rep: `solid3d-build.ts` lo evalúa. Un muro
 * no, y sin embargo es la entidad que da sentido a todo esto: el arquitecto
 * dibuja la planta con muros y lo que quiere es que el alzado y el corte salgan
 * solos. Así que aquí el muro se convierte en el PRISMA que ya es —su contorno
 * de planta, con las uniones L/T ya resueltas por `wall-joins.ts`, extruido su
 * altura— y a partir de ahí es un cuerpo como cualquier otro.
 *
 * Se deriva en vez de persistirse por la misma razón que `wall-geometry.ts`
 * deriva la doble línea: el muro guarda su RECETA. Un prisma persistido sería
 * una segunda copia que se desincroniza en cuanto alguien cambia el grosor, y
 * entonces el alzado enseñaría un muro que ya no existe.
 *
 * ## Qué NO hace este módulo
 *
 * No resuelve la visibilidad de aristas por su cuenta: se la pide a
 * `view/hidden-lines.ts`, que hoy es EXACTA sólo sobre cuerpos convexos y lo
 * declara en `exact`. Esa bandera se propaga hasta la ventana y hasta el
 * informe de SOLDRAW en vez de taparse. Un prisma de muro es convexo, así que
 * la planta y los alzados de un edificio de muros rectos son exactos; una
 * pieza en L no lo es, y el producto lo dice.
 */
import type { CadDocument, CadEntity, CadPoint2, CadPoint3 } from "../cad-document";
import type { CadSolid3dEntity } from "../cad-entities-v5";
import type { CadWallEntity } from "../cad-entities-v6";
import type { CadViewportView } from "../cad-paper-viewport";
import { solid3dBody } from "../solid3d-build";
import { sectionLoopsOfSolid } from "../solid3d-section";
import { cadSolidEdgeVisibility } from "../view/hidden-lines";
import { wallJoinedFootprint, wallJoins, type CadWallJoinWall } from "../wall-joins";
import {
  extrudeProfile,
  halfEdgeSegment,
  makeFrame,
  V3_X,
  V3_Z,
  vec3,
  type BrepBody,
} from "../../brep";
import {
  cadViewportProjectPoint,
  cadViewportViewDepth,
  type CadViewportViewFrame,
} from "./viewport-view";

/** Segmento ya proyectado sobre el papel de la vista. */
export interface CadSolviewSegment {
  a: CadPoint2;
  b: CadPoint2;
}

export interface CadSolviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Un cuerpo del modelo que puede salir en una vista, con de dónde vino. */
export interface CadSolviewSource {
  entityId: string;
  entityType: "wall" | "solid3d";
  layer: string;
  body: BrepBody;
}

/**
 * Lo que UNA entidad aporta a UNA vista.
 *
 * `visible` y `hidden` son los dos juegos de aristas; `sectionLoops` sólo se
 * rellena en las vistas de sección, y es la huella del corte —lo que se
 * sombrea, y lo único de todo esto que se puede acotar como una superficie.
 */
export interface CadSolviewContribution {
  entityId: string;
  entityType: "wall" | "solid3d";
  layer: string;
  visible: CadSolviewSegment[];
  hidden: CadSolviewSegment[];
  sectionLoops: CadPoint2[][];
  /** Envolvente de todo lo anterior, en coordenadas de la vista. */
  bounds: CadSolviewRect;
  /** `true` si la clasificación de aristas ocultas es demostrablemente exacta. */
  exact: boolean;
}

/** Tolerancia con la que se decide si algo cae delante del plano de corte. */
const SECTION_EPSILON = 1e-6;

function wallPrism(wall: CadWallEntity, others: readonly CadWallJoinWall[]): BrepBody | null {
  if (!(wall.thickness > 0) || !(wall.height > 0)) return null;
  const joins = wallJoins({ ...wall, id: wall.id }, others);
  const footprint = wallJoinedFootprint(wall, joins);
  if (!footprint || footprint.length < 3) return null;
  // La base va a la cota del arranque del eje: un muro en la planta primera no
  // es el mismo muro trasladado en el papel, es el mismo muro más arriba, y el
  // alzado tiene que enseñarlo donde está.
  const base = wall.start.z ?? 0;
  const frame = makeFrame(vec3(0, 0, base), V3_Z, V3_X);
  try {
    return extrudeProfile({ profile: { outer: footprint }, height: wall.height, frame });
  } catch {
    // Un contorno degenerado que el kernel rechaza NO se aproxima: esta entidad
    // simplemente no aporta cuerpo, y quien cuente las fuentes lo verá faltar.
    return null;
  }
}

/**
 * Cuerpos del modelo que pueden salir en una vista derivada.
 *
 * Se recorre `entities` y no `modelSpace.entityIds` a propósito: el orden de
 * dibujo no significa nada para una proyección, y recorrer el array ordenado
 * por id hace que dos documentos con el mismo contenido produzcan la misma
 * lista — que es lo que necesita una huella reproducible.
 */
export function cadSolviewSources(
  document: Pick<CadDocument, "entities">,
  filter?: ReadonlySet<string>,
): CadSolviewSource[] {
  const walls = document.entities.filter(
    (entity): entity is CadWallEntity => entity.type === "wall",
  );
  const joinInput: CadWallJoinWall[] = walls.map((wall) => ({
    id: wall.id,
    start: wall.start,
    end: wall.end,
    thickness: wall.thickness,
  }));
  const sources: CadSolviewSource[] = [];
  for (const entity of [...document.entities].sort((a, b) => a.id.localeCompare(b.id))) {
    if (filter && !filter.has(entity.id)) continue;
    if (entity.type === "wall") {
      const body = wallPrism(entity, joinInput);
      if (body) sources.push({ entityId: entity.id, entityType: "wall", layer: entity.layer, body });
      continue;
    }
    if (entity.type === "solid3d") {
      const body = solidBodyOrNull(entity);
      if (body)
        sources.push({ entityId: entity.id, entityType: "solid3d", layer: entity.layer, body });
    }
  }
  return sources;
}

function solidBodyOrNull(entity: CadSolid3dEntity): BrepBody | null {
  try {
    const body = solid3dBody(entity);
    return body.faces.length > 0 ? body : null;
  } catch {
    // Un árbol con una referencia colgante ya lo rechaza la frontera del
    // servidor; aquí, en el cliente, se omite en vez de tumbar la lámina entera.
    return null;
  }
}

const EMPTY_BOUNDS: CadSolviewRect = { x: 0, y: 0, width: 0, height: 0 };

function boundsOf(points: readonly CadPoint2[]): CadSolviewRect {
  if (points.length === 0) return EMPTY_BOUNDS;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** ¿Se solapan dos rectángulos? Tocarse por el borde cuenta. */
export function cadSolviewRectsOverlap(a: CadSolviewRect, b: CadSolviewRect): boolean {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  );
}

/**
 * Recorta un cuerpo contra el plano de corte quedándose con lo de DETRÁS.
 *
 * No se corta el sólido de verdad —eso sería una booleana, y aquí sólo se
 * dibuja—: se descartan las aristas que quedan enteras del lado del
 * observador. Una arista que atraviesa el plano SÍ se dibuja entera, que es lo
 * que hace un corte de obra: la parte de delante se retira, no se recorta a
 * media pieza.
 */
function keepsBehind(
  segment: { from: CadPoint3; to: CadPoint3 },
  view: CadViewportView,
): boolean {
  const plane = view.sectionPlane;
  if (!plane) return true;
  const signed = (point: CadPoint3) =>
    (point.x - plane.origin.x) * plane.normal.x +
    (point.y - plane.origin.y) * plane.normal.y +
    (point.z - plane.origin.z) * plane.normal.z;
  // La normal apunta hacia el observador: positivo = delante del corte.
  return Math.min(signed(segment.from), signed(segment.to)) <= SECTION_EPSILON;
}

/**
 * Proyecta UN cuerpo sobre el papel de una vista.
 *
 * El orden importa: primero se clasifica la visibilidad en 3D —que es donde la
 * pregunta tiene sentido— y sólo después se proyecta. Clasificar sobre la
 * proyección obligaría a resolver qué trazo tapa a cuál en 2D, que es el mismo
 * problema pero perdiendo la información que lo resuelve.
 */
export function cadSolviewProject(
  source: CadSolviewSource,
  frame: CadViewportViewFrame,
  view: CadViewportView,
): CadSolviewContribution {
  const visibility = cadSolidEdgeVisibility(source.body, {
    kind: "parallel",
    direction: view.direction,
  });
  const project = (point: CadPoint3): CadPoint2 => cadViewportProjectPoint(point, frame);
  const collect = (edges: readonly number[]): CadSolviewSegment[] => {
    const segments: CadSolviewSegment[] = [];
    for (const edge of edges) {
      const half = source.body.edges[edge]?.a;
      if (half === undefined || half < 0) continue;
      const segment = halfEdgeSegment(source.body, half);
      if (view.kind === "section" && !keepsBehind(segment, view)) continue;
      segments.push({ a: project(segment.from), b: project(segment.to) });
    }
    return segments;
  };

  const visible = collect(visibility.visible);
  const hidden = collect(visibility.hidden);

  const sectionLoops: CadPoint2[][] = [];
  if (view.kind === "section" && view.sectionPlane) {
    for (const loop of sectionLoopsOfSolid(source.body, view.sectionPlane)) {
      if (loop.length >= 3) sectionLoops.push(loop.map(project));
    }
  }

  const all = [
    ...visible.flatMap((s) => [s.a, s.b]),
    ...hidden.flatMap((s) => [s.a, s.b]),
    ...sectionLoops.flat(),
  ];
  return {
    entityId: source.entityId,
    entityType: source.entityType,
    layer: source.layer,
    visible,
    hidden,
    sectionLoops,
    bounds: boundsOf(all),
    exact: visibility.exact,
  };
}

/** Profundidad de un punto respecto del ojo. Reexportada para quien ordene trazos. */
export { cadViewportViewDepth };

/**
 * Todo lo que una vista enseña, ya proyectado y filtrado por su ventana.
 *
 * `window` va en coordenadas de la VISTA, relativas al objetivo de la cámara.
 * Filtrar aquí y no al dibujar es lo que hace que la asociatividad sea útil:
 * la huella se calcula sobre esta lista, así que mover algo que no cae dentro
 * de la ventana no ensucia la vista. Sin el filtro, cualquier edición en
 * cualquier rincón del modelo marcaría obsoletos todos los cortes del juego.
 */
export function cadSolviewContributions(
  sources: readonly CadSolviewSource[],
  frame: CadViewportViewFrame,
  view: CadViewportView,
  window: CadSolviewRect,
): CadSolviewContribution[] {
  const contributions: CadSolviewContribution[] = [];
  for (const source of sources) {
    const contribution = cadSolviewProject(source, frame, view);
    const empty =
      contribution.visible.length === 0 &&
      contribution.hidden.length === 0 &&
      contribution.sectionLoops.length === 0;
    if (empty) continue;
    if (!cadSolviewRectsOverlap(contribution.bounds, window)) continue;
    contributions.push(contribution);
  }
  return contributions;
}

/**
 * Ventana que encuadra todo lo que estas fuentes proyectan, con margen.
 *
 * El margen es relativo al tamaño encuadrado, no absoluto: un margen fijo de
 * 100 mm es holgado en una pieza y despreciable en una nave, y la ventana
 * acabaría distinta según la escala del dibujo.
 */
export function cadSolviewWindow(
  sources: readonly CadSolviewSource[],
  frame: CadViewportViewFrame,
  view: CadViewportView,
  marginRatio = 0.05,
): CadSolviewRect | null {
  const points: CadPoint2[] = [];
  for (const source of sources) {
    const contribution = cadSolviewProject(source, frame, view);
    const { bounds } = contribution;
    if (bounds.width === 0 && bounds.height === 0 && contribution.visible.length === 0) continue;
    points.push(
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    );
  }
  if (points.length === 0) return null;
  const bounds = boundsOf(points);
  const margin = Math.max(bounds.width, bounds.height) * marginRatio;
  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: Math.max(bounds.width + margin * 2, 1e-6),
    height: Math.max(bounds.height + margin * 2, 1e-6),
  };
}

/** Entidades del documento que este módulo sabe convertir en cuerpo. */
export function cadSolviewIsSourceEntity(entity: CadEntity): boolean {
  return entity.type === "wall" || entity.type === "solid3d";
}
