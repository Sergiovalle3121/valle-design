/**
 * Extrusión de piso, cielorraso y techo a partir de los MUROS del plano.
 *
 * ## El buscador de loops ya existe: éste no es un buscador nuevo
 *
 * `hatch-associativity.ts` ya sabe coser trazos sueltos en anillos cerrados y
 * elegir el de mayor área como exterior (`stitchCadBoundaryPaths`,
 * `cadBoundarySignedArea`) — es la maquinaria que resuelve HATCH. Este módulo
 * no reimplementa esa costura: la alimenta con los trazos de los MUROS y
 * reparte lo que sale en habitaciones (los anillos interiores) y envolvente
 * (el anillo mayor).
 *
 * ## Por qué NO se usa `cadEntityBoundaryPaths` para los muros
 *
 * Esa función (en `entity-runtime.ts`) llama al renderizador del adaptador SIN
 * documento, así que un muro nunca ve sus uniones y entrega su contorno propio
 * ya cerrado (una tira delgada), no las caras abiertas que se sueldan con las
 * del vecino. Es una limitación conocida y ya escrita en el propio código de
 * HATCH (`engine/commands/hatch-support.ts`), no algo que corresponda arreglar
 * aquí. Con documento, en cambio, `wallAdapter.renderer.paths` devuelve la cara
 * interior y la cara exterior como trazos ABIERTOS que sí se sueldan en la
 * esquina — es el mismo camino que ya usa el pipeline de render 2D
 * (`entity-three.ts`, `tessellation-cache.ts`) para dibujar el inglete. Este
 * módulo llama al adaptador exactamente así.
 *
 * ## De dónde sale cada número
 *
 *  - **Habitación**: cada anillo INTERIOR que la costura entrega, salvo el de
 *    mayor área (ése es la envolvente, no un cuarto).
 *  - **Altura de habitación**: el MÍNIMO de `height` entre los muros que la
 *    delimitan. No hay override explícito en el esquema del documento — el día
 *    que lo haya, se lee aquí antes que el mínimo, sin tocar el resto.
 *  - **Nivel del piso**: el MÍNIMO de la `z` de los ejes de esos mismos muros.
 *    En un plano de una sola planta —el caso de hoy— es 0.
 *  - **Techo**: el anillo de MAYOR área es la envolvente exterior del
 *    edificio; el techo es una losa PLANA que arranca donde termina el
 *    cielorraso más alto. Cubiertas a dos aguas, con limatesas o de varios
 *    planos quedan fuera de esta primera versión a propósito.
 *
 * ## Un tabique en T no parte una sala en dos, y no es un fallo de aquí
 *
 * `wall-joins.ts` deja dicho que el pasante «no se toca en esta ola»: un muro
 * que llega a la MITAD de otro (T) no rompe la cara de éste, así que el punto
 * donde llega nunca coincide con un vértice del pasante y
 * `stitchCadBoundaryPaths` no tiene con qué coserlo. El tabique en T queda en
 * `openSourceIds` y la sala sale completa, sin partir — exactamente lo que
 * vería HATCH pinchando a cualquier lado del tabique. Partir salas por una T
 * pediría el grafo de ejes con corte en nodos que ya resuelve
 * `bim-schedule.ts` para el cuadro de áreas, con otro propósito y otra
 * representación; replicarlo aquí para la masa 3D es mejora de una ola
 * futura, no de esta primera versión.
 */
import type { CadDocument, CadPoint2 } from "./cad-document";
import type { CadWallEntity } from "./cad-entities-v6";
import {
  cadBoundarySelfIntersects,
  cadBoundarySignedArea,
  stitchCadBoundaryPaths,
  type CadBoundaryPath,
} from "./hatch-associativity";
import { CAD_ENTITY_REGISTRY, type CadEntityRegistry } from "./entity-runtime";

/**
 * Grosor de las losas, en unidades del documento (mm).
 *
 * La losa de piso CUELGA hacia abajo del nivel: su cara de arriba —la que se
 * pisa— queda exactamente en `levelZ`, que es el 0 con el que se acota el
 * plano. La de cielorraso hace lo simétrico hacia arriba desde `ceilingZ`: su
 * cara de ABAJO —la que se ve desde dentro del cuarto— es la altura de muro
 * tal cual, sin que el grosor de la losa la desplace.
 */
export const CAD_FLOOR_SLAB_THICKNESS = 150;
export const CAD_CEILING_SLAB_THICKNESS = 100;
/** Más gruesa que las losas de entrepiso: es la que queda a la intemperie. */
export const CAD_ROOF_SLAB_THICKNESS = 200;

/** Polígono XY con un único nivel Z y un grosor: lo que sabe extruir `roof-floor-three.ts`. */
export interface RoofFloorSlab {
  /** Anillo antihorario, sin repetir el primer vértice al final. */
  polygon: readonly CadPoint2[];
  /** Z de la cara de ABAJO de la losa. Extruye hacia +Z por `thickness`. */
  z: number;
  thickness: number;
}

export interface RoofFloorRoom {
  /** Estable mientras no cambien los muros que delimitan el cuarto. */
  id: string;
  wallIds: readonly string[];
  polygon: readonly CadPoint2[];
  levelZ: number;
  height: number;
  ceilingZ: number;
  floor: RoofFloorSlab;
  ceiling: RoofFloorSlab;
}

export interface RoofFloorEnvelope {
  wallIds: readonly string[];
  polygon: readonly CadPoint2[];
  /** Z donde arranca el techo: por encima del cielorraso más alto. */
  roofZ: number;
  roof: RoofFloorSlab;
}

export interface RoofFloorPlan {
  rooms: readonly RoofFloorRoom[];
  /** `null` sin muros que cierren ni siquiera la envolvente exterior. */
  envelope: RoofFloorEnvelope | null;
}

/** Anillo en sentido antihorario: la misma normalización que usa HATCH para su exterior. */
function counterClockwise(loop: readonly CadPoint2[]): CadPoint2[] {
  return cadBoundarySignedArea(loop) < 0 ? [...loop].reverse() : [...loop];
}

interface WallLoop {
  loop: CadPoint2[];
  wallIds: string[];
  area: number;
}

/**
 * Anillos cerrados que forman los muros del documento, con los ids que
 * delimitan cada uno — la costura de `hatch-associativity.ts` alimentada por
 * las caras UNIDAS de cada muro (véase la cabecera del módulo).
 *
 * Los anillos que se cruzan consigo mismos se descartan aquí, igual que los
 * descarta `resolveCadHatchRegion`: uno elegido como envolvente daría un
 * techo o un piso de área cero o inventada.
 */
function wallLoops(document: CadDocument, registry: CadEntityRegistry): WallLoop[] {
  const paths: CadBoundaryPath[] = [];
  for (const entity of document.entities) {
    if (entity.type !== "wall") continue;
    const adapter = registry.adapter(entity);
    for (const path of adapter.renderer.paths(entity, 192, document))
      paths.push({ sourceId: entity.id, points: path.points, closed: path.closed });
  }
  const built = stitchCadBoundaryPaths(paths);
  return built.loops
    .map((loop, index) => ({
      loop,
      wallIds: [...new Set(built.loopSourceIds[index] ?? [])].sort(),
      area: Math.abs(cadBoundarySignedArea(loop)),
    }))
    .filter((entry) => entry.loop.length >= 3 && entry.area > 0 && !cadBoundarySelfIntersects(entry.loop));
}

/** Nivel del piso y altura libre de los muros dados: mínimo de sus ejes y de su `height`. */
function levelAndHeight(walls: readonly CadWallEntity[]): { levelZ: number; height: number } {
  return {
    levelZ: Math.min(...walls.flatMap((wall) => [wall.start.z, wall.end.z])),
    height: Math.min(...walls.map((wall) => wall.height)),
  };
}

function slab(polygon: readonly CadPoint2[], z: number, thickness: number): RoofFloorSlab {
  return { polygon, z, thickness };
}

/**
 * Piso, cielorraso y techo derivados de los muros del documento.
 *
 * Pura: ni THREE ni React. `roof-floor-three.ts` extruye lo que aquí se
 * calcula y `architectural-mass-host.ts` lo reconcilia contra el visor.
 */
export function buildArchitecturalMassPlan(
  document: CadDocument,
  registry: CadEntityRegistry = CAD_ENTITY_REGISTRY,
): RoofFloorPlan {
  const wallsById = new Map<string, CadWallEntity>();
  for (const entity of document.entities) if (entity.type === "wall") wallsById.set(entity.id, entity);
  if (wallsById.size === 0) return { rooms: [], envelope: null };

  const loops = wallLoops(document, registry);
  if (loops.length === 0) return { rooms: [], envelope: null };

  // El anillo de MAYOR área es la envolvente exterior del edificio — la misma
  // regla que usa `cadHatchRegionFromObjects` para elegir el exterior de una
  // selección. Todo lo demás que cierra es una habitación.
  const envelopeLoop = loops.reduce((best, entry) => (entry.area > best.area ? entry : best));
  const roomLoops = loops.filter((entry) => entry !== envelopeLoop);

  const rooms: RoofFloorRoom[] = roomLoops.map((entry) => {
    const walls = entry.wallIds.map((id) => wallsById.get(id)!);
    const { levelZ, height } = levelAndHeight(walls);
    const ceilingZ = levelZ + height;
    const polygon = counterClockwise(entry.loop);
    return {
      id: `room:${entry.wallIds.join(",")}`,
      wallIds: entry.wallIds,
      polygon,
      levelZ,
      height,
      ceilingZ,
      floor: slab(polygon, levelZ - CAD_FLOOR_SLAB_THICKNESS, CAD_FLOOR_SLAB_THICKNESS),
      ceiling: slab(polygon, ceilingZ, CAD_CEILING_SLAB_THICKNESS),
    };
  });

  // Sin cuartos interiores (un anillo suelto sin tabiques todavía), el techo
  // se apoya en la altura de la propia envolvente: sigue siendo "por encima
  // del cielorraso más alto", sólo que el único cielorraso es el suyo.
  const roofZ = rooms.length
    ? Math.max(...rooms.map((room) => room.ceilingZ))
    : (() => {
        const { levelZ, height } = levelAndHeight(envelopeLoop.wallIds.map((id) => wallsById.get(id)!));
        return levelZ + height;
      })();

  const envelopePolygon = counterClockwise(envelopeLoop.loop);
  const envelope: RoofFloorEnvelope = {
    wallIds: envelopeLoop.wallIds,
    polygon: envelopePolygon,
    roofZ,
    roof: slab(envelopePolygon, roofZ, CAD_ROOF_SLAB_THICKNESS),
  };

  return { rooms, envelope };
}
