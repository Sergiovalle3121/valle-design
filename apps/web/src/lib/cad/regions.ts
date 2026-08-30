/**
 * REGION: convertir contornos en superficies.
 *
 * ## Qué es una región aquí, y por qué no es un tipo nuevo
 *
 * En AutoCAD REGION es un tipo de entidad propio. En este documento no puede
 * serlo: la unión `CadEntity` la define `cad-document.ts`, que en esta ola
 * pertenece a otra sesión, y añadir un tipo a la unión sin adaptador registrado
 * revienta en cuanto alguien lo dibuja.
 *
 * Así que una región es lo que ES una región en 2D: un contorno CERRADO,
 * marcado como tal en `context.metadata`. Un círculo ya es una región y se
 * queda siendo un círculo —marcarlo no le quita exactitud—; cuatro líneas que
 * cierran un rectángulo se funden en UNA polilínea cerrada, que es exactamente
 * lo que REGION hace y por lo que se usa: para que MASSPROP, HATCH y BOUNDARY
 * tengan un solo objeto que medir en vez de cuatro que casi se tocan.
 *
 * La consecuencia honesta: un DXF exportado llevará POLYLINE cerrada donde
 * AutoCAD llevaría REGION. Se pierde la etiqueta, no la geometría ni el área.
 * Cuando la unión gane el tipo, este módulo cambia de destino sin cambiar de
 * algoritmo — la parte difícil, que es encadenar los bordes, ya está aquí.
 */
import { normalizeArcSweepDegrees } from "./arc-sweep";
import type { CadEntity, CadPoint2 } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";
import {
  CAD_ENTITY_REGISTRY,
  type CadEntityRegistry,
  type CadNativeEntity,
} from "./entity-runtime";
import { contourSignedArea } from "./inquiry/contours";

/** Marca de región. Vive en `metadata` porque el esquema no tiene campo. */
export const CAD_REGION_METADATA_KEY = "region";

/** Tipos que ya encierran un área por sí solos. */
const ALREADY_CLOSED = new Set(["circle", "ellipse", "hatch", "solid"]);

export interface CadRegionVertex extends CadPoint2 {
  /** Abombamiento del tramo que ARRANCA en este vértice. `tan(barrido/4)`. */
  bulge?: number;
}

/** Los vértices con los que una entidad entra en una cadena. */
export function cadRegionEdge(
  entity: CadEntity,
  registry: CadEntityRegistry = CAD_ENTITY_REGISTRY,
): CadRegionVertex[] | null {
  if (entity.type === "line")
    return [
      { x: entity.start.x, y: entity.start.y },
      { x: entity.end.x, y: entity.end.y },
    ];
  if (entity.type === "arc") {
    // Un arco entra como UN tramo con abombamiento, no como treinta cuerdas: la
    // región resultante tiene la misma área que el arco y no una aproximación.
    const sweep = normalizeArcSweepDegrees(entity.startAngle, entity.endAngle);
    const bulge = Math.tan((sweep * Math.PI) / 720);
    const at = (degrees: number): CadPoint2 => ({
      x: entity.center.x + entity.radius * Math.cos((degrees * Math.PI) / 180),
      y: entity.center.y + entity.radius * Math.sin((degrees * Math.PI) / 180),
    });
    return [{ ...at(entity.startAngle), bulge }, { ...at(entity.endAngle) }];
  }
  if (entity.type === "polyline" && !entity.closed)
    return entity.vertices.map((vertex) => ({
      x: vertex.x,
      y: vertex.y,
      ...(vertex.bulge ? { bulge: vertex.bulge } : {}),
    }));
  if (!registry.supports(entity)) return null;
  const paths = registry.adapter(entity).renderer.paths(entity, 64);
  if (paths.length !== 1 || paths[0].closed || paths[0].points.length < 2) return null;
  return paths[0].points.map((point) => ({ x: point.x, y: point.y }));
}

function near(a: CadPoint2, b: CadPoint2, tolerance: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

/**
 * Invierte un borde.
 *
 * El abombamiento NO se limita a cambiar de signo: vive en el vértice donde
 * ARRANCA su tramo, así que al invertir se corre un vértice. Sin ese corrimiento
 * el arco sale reflejado, y la región cierra por el lado equivocado.
 */
function reversed(edge: readonly CadRegionVertex[]): CadRegionVertex[] {
  const last = edge.length - 1;
  return edge.map((_, index) => {
    const vertex = edge[last - index];
    const bulge = edge[last - index - 1]?.bulge;
    return { x: vertex.x, y: vertex.y, ...(bulge ? { bulge: -bulge } : {}) };
  });
}

interface Chain {
  vertices: CadRegionVertex[];
  sourceIds: string[];
  closed: boolean;
}

/**
 * Encadena bordes sueltos por sus extremos.
 *
 * Voraz a propósito: se toma un borde, se le pegan los que continúan por
 * cualquiera de sus dos puntas, y se cierra cuando las puntas se tocan. No
 * intenta resolver bifurcaciones —tres líneas que salen del mismo punto— porque
 * ahí no hay una respuesta correcta, y la que se elija sería una sorpresa. Lo
 * que no cierra se devuelve como rechazado, con su razón.
 */
function buildChains(
  edges: readonly { id: string; vertices: CadRegionVertex[] }[],
  tolerance: number,
): Chain[] {
  const pending = edges.map((edge) => ({ ...edge, used: false }));
  const chains: Chain[] = [];

  for (const seed of pending) {
    if (seed.used) continue;
    seed.used = true;
    const chain: Chain = { vertices: [...seed.vertices], sourceIds: [seed.id], closed: false };

    let grew = true;
    while (grew && !chain.closed) {
      grew = false;
      const head = chain.vertices[0];
      const tail = chain.vertices[chain.vertices.length - 1];
      for (const candidate of pending) {
        if (candidate.used) continue;
        const first = candidate.vertices[0];
        const last = candidate.vertices[candidate.vertices.length - 1];
        if (near(tail, first, tolerance)) {
          chain.vertices = [...chain.vertices.slice(0, -1), ...candidate.vertices];
        } else if (near(tail, last, tolerance)) {
          chain.vertices = [...chain.vertices.slice(0, -1), ...reversed(candidate.vertices)];
        } else if (near(head, last, tolerance)) {
          chain.vertices = [...candidate.vertices.slice(0, -1), ...chain.vertices];
        } else if (near(head, first, tolerance)) {
          chain.vertices = [...reversed(candidate.vertices).slice(0, -1), ...chain.vertices];
        } else {
          continue;
        }
        candidate.used = true;
        grew = true;
        chain.sourceIds.push(candidate.id);
        break;
      }
      if (
        chain.vertices.length >= 4 &&
        near(chain.vertices[0], chain.vertices[chain.vertices.length - 1], tolerance)
      ) {
        // El vértice de cierre se quita: una polilínea cerrada no repite el
        // primer punto al final, lo cierra el propio indicador.
        chain.vertices = chain.vertices.slice(0, -1);
        chain.closed = true;
      }
    }
    chains.push(chain);
  }
  return chains;
}

export interface CadRegionPlan {
  commands: readonly CadEntityCommand[];
  /** Contornos ya cerrados que se han marcado sin tocar su geometría. */
  tagged: number;
  /** Regiones nuevas formadas encadenando bordes sueltos. */
  created: number;
  /** Qué no se pudo convertir y por qué. Un renglón por causa. */
  rejected: readonly string[];
}

export interface CadRegionOptions {
  tolerance?: number;
  registry?: CadEntityRegistry;
  newEntityId: () => string;
  layer: string;
}

/**
 * Plan de REGION para un conjunto de entidades.
 *
 * Emite UN lote: marcar tres círculos y fundir doce líneas en tres regiones es
 * un solo paso de deshacer, no dieciocho.
 */
export function planCadRegions(
  entities: readonly CadEntity[],
  options: CadRegionOptions,
): CadRegionPlan {
  const registry = options.registry ?? CAD_ENTITY_REGISTRY;
  const tolerance = options.tolerance ?? 1e-6;
  const commands: CadEntityCommand[] = [];
  const rejected: string[] = [];
  let tagged = 0;

  const loose: { id: string; vertices: CadRegionVertex[] }[] = [];

  for (const entity of entities) {
    const closedAlready =
      ALREADY_CLOSED.has(entity.type) || (entity.type === "polyline" && entity.closed);
    if (closedAlready) {
      const already =
        "context" in entity && entity.context?.metadata?.[CAD_REGION_METADATA_KEY] === true;
      if (already) continue;
      commands.push({
        type: "metadata",
        entityId: entity.id,
        patch: { [CAD_REGION_METADATA_KEY]: true },
      });
      tagged += 1;
      continue;
    }
    const edge = cadRegionEdge(entity, registry);
    if (!edge || edge.length < 2) {
      rejected.push(`Un ${entity.type.toUpperCase()} no aporta un borde: no entra en la región.`);
      continue;
    }
    loose.push({ id: entity.id, vertices: edge });
  }

  let created = 0;
  for (const chain of buildChains(loose, tolerance)) {
    if (!chain.closed) {
      rejected.push(
        `${chain.sourceIds.length} objeto(s) forman una cadena ABIERTA: no encierran un área. ` +
          "Cierre el contorno o use JOIN.",
      );
      continue;
    }
    if (Math.abs(contourSignedArea(chain.vertices)) < 1e-12) {
      rejected.push("Una cadena cerrada encierra área nula: no se convierte en región.");
      continue;
    }
    const region: CadNativeEntity = {
      id: options.newEntityId(),
      type: "polyline",
      vertices: chain.vertices.map((vertex) => ({
        x: vertex.x,
        y: vertex.y,
        z: 0,
        ...(vertex.bulge ? { bulge: vertex.bulge } : {}),
      })),
      closed: true,
      layer: options.layer,
      context: { metadata: { [CAD_REGION_METADATA_KEY]: true } },
    };
    commands.push({ type: "insert", entity: region });
    for (const sourceId of chain.sourceIds) commands.push({ type: "delete", entityId: sourceId });
    created += 1;
  }

  return { commands, tagged, created, rejected };
}
