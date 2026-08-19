import type { CadEntity, CadPoint2, CadPoint3 } from './cad-document';

export interface CadBoundaryPath {
  sourceId: string;
  points: readonly CadPoint2[];
  closed: boolean;
}

export interface CadBoundaryBuildResult {
  loops: CadPoint2[][];
  loopSourceIds: string[][];
  sourceIds: string[];
  openSourceIds: string[];
}

const distance = (left: CadPoint2, right: CadPoint2) => Math.hypot(left.x - right.x, left.y - right.y);

/**
 * Área firmada (fórmula del cordón de zapato), medida DESDE EL PRIMER VÉRTICE.
 *
 * El desplazamiento no es cosmética. La fórmula sin trasladar multiplica
 * coordenadas ABSOLUTAS entre sí, así que un plano georreferenciado —el caso
 * normal en topografía y en cualquier archivo que venga de un levantamiento—
 * calcula un área pequeña como diferencia de productos gigantescos, y la resta
 * se come los dígitos significativos que quedaban. Medido en este árbol con un
 * cuadrado de 10×10 (área real 100):
 *
 *     origen 1e7  →  100      (aún exacto)
 *     origen 1e9  →  128      (28 % de error)
 *     origen 1e12 →  0        (el área DESAPARECE)
 *
 * Un cero ahí no es un fallo visible: es un sombreado que informa cero metros
 * cuadrados en una tabla de acabados, y el anillo exterior que `stitch…`
 * elige por mayor área pasa a ser el equivocado. Trasladar al primer vértice
 * es algebraicamente la MISMA área —los términos de traslación se cancelan en
 * un polígono cerrado— y deja los productos en el tamaño del dibujo, no en el
 * de sus coordenadas. Los tres casos de arriba dan 100 exacto.
 */
export function cadBoundarySignedArea(points: readonly CadPoint2[]): number {
  if (points.length < 3) return 0;
  const originX = points[0].x;
  const originY = points[0].y;
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += (current.x - originX) * (next.y - originY) - (next.x - originX) * (current.y - originY);
  }
  return area / 2;
}

export function cadPointInBoundary(point: CadPoint2, boundary: readonly CadPoint2[]): boolean {
  let inside = false;
  for (let index = 0, previous = boundary.length - 1; index < boundary.length; previous = index++) {
    const left = boundary[index];
    const right = boundary[previous];
    if ((left.y > point.y) !== (right.y > point.y)
      && point.x < ((right.x - left.x) * (point.y - left.y)) / (right.y - left.y) + left.x)
      inside = !inside;
  }
  return inside;
}

function cleanLoop(points: readonly CadPoint2[], tolerance: number): CadPoint2[] {
  const result: CadPoint2[] = [];
  for (const point of points) {
    if (!result.length || distance(result.at(-1)!, point) > tolerance)
      result.push({ x: point.x, y: point.y });
  }
  if (result.length > 2 && distance(result[0], result.at(-1)!) <= tolerance) result.pop();
  return result;
}

/**
 * ¿Este camino se cierra SOBRE SÍ MISMO, aunque no lo declare?
 *
 * Es la forma más común de contorno cerrado que llega de fuera. Una LWPOLYLINE
 * escrita por otro programa suele repetir el primer vértice al final en vez de
 * poner la bandera 70/1, y un ARCO de barrido nulo —el «arco de 360°» que trae
 * cualquier archivo de otra mano— se tesela como circunferencia completa y su
 * adaptador la entrega SIEMPRE como abierta.
 *
 * Sin esta comprobación esos contornos se rechazaban, y el rechazo era además
 * INVISIBLE de diagnosticar: `cleanLoop` quita el vértice repetido ANTES de que
 * nadie mire si cerraba, así que la prueba de cierre acababa comparando el
 * primer vértice contra el PENÚLTIMO —un lado entero de distancia— y el
 * contorno salía por la lista de abiertos. El arquitecto pinchaba dentro de un
 * cuadrado perfectamente cerrado y el sombreado le decía que no había contorno.
 */
function selfClosingPath(points: readonly CadPoint2[], tolerance: number): boolean {
  return points.length >= 4 && distance(points[0], points[points.length - 1]) <= tolerance;
}

export function stitchCadBoundaryPaths(
  paths: readonly CadBoundaryPath[],
  tolerance = 1e-4,
): CadBoundaryBuildResult {
  const pending = paths
    .filter((path) => path.points.length >= 2)
    .map((path) => ({
      ...path,
      closed: path.closed || selfClosingPath(path.points, tolerance),
      points: cleanLoop(path.points, tolerance),
    }))
    // Un camino que al limpiarse se queda en MENOS DE DOS puntos distintos no
    // es un contorno abierto: no es nada. Un tramo de longitud cero —el doble
    // clic que le sobró a alguien, o el resto de un escalado a cero— entraba
    // por aquí, se quedaba en un punto y salía por la lista de ABIERTOS. Y esa
    // lista no es informativa: `regenerateAssociativeHatches` marca el
    // sombreado como ROTO en cuanto tiene un elemento, así que una basura
    // invisible en la selección rompía para siempre la asociatividad de un
    // relleno cuyo contorno de verdad cerraba perfectamente.
    .filter((path) => path.points.length >= 2);
  const loops: CadPoint2[][] = [];
  const loopSourceIds: string[][] = [];
  const sourceIds = new Set<string>();
  const openSourceIds = new Set<string>();
  while (pending.length) {
    const seed = pending.shift()!;
    sourceIds.add(seed.sourceId);
    if (seed.closed && seed.points.length >= 3) {
      loops.push(seed.points);
      loopSourceIds.push([seed.sourceId]);
      continue;
    }
    const chain = [...seed.points];
    const chainSourceIds = new Set([seed.sourceId]);
    let joined = true;
    while (joined && distance(chain[0], chain.at(-1)!) > tolerance) {
      joined = false;
      for (let index = 0; index < pending.length; index++) {
        const candidate = pending[index];
        const start = candidate.points[0];
        const end = candidate.points.at(-1)!;
        if (distance(chain.at(-1)!, start) <= tolerance) chain.push(...candidate.points.slice(1));
        else if (distance(chain.at(-1)!, end) <= tolerance) chain.push(...[...candidate.points].reverse().slice(1));
        else continue;
        sourceIds.add(candidate.sourceId);
        chainSourceIds.add(candidate.sourceId);
        pending.splice(index, 1);
        joined = true;
        break;
      }
    }
    const cleaned = cleanLoop(chain, tolerance);
    if (cleaned.length >= 3 && distance(chain[0], chain.at(-1)!) <= tolerance) {
      loops.push(cleaned);
      loopSourceIds.push([...chainSourceIds]);
    }
    else for (const id of chainSourceIds) openSourceIds.add(id);
  }
  return { loops, loopSourceIds, sourceIds: [...sourceIds], openSourceIds: [...openSourceIds] };
}

function boundaryKey(boundary: readonly CadPoint2[]): string {
  const points = boundary.map((point) => `${point.x.toFixed(6)},${point.y.toFixed(6)}`);
  const rotations = (items: string[]) => items.map((_item, index) => [...items.slice(index), ...items.slice(0, index)].join(';'));
  return [...rotations(points), ...rotations([...points].reverse())].sort()[0] ?? '';
}

function boundaryCentroid(boundary: readonly CadPoint2[]): CadPoint2 {
  return boundary.reduce((sum, point) => ({ x: sum.x + point.x / boundary.length, y: sum.y + point.y / boundary.length }), { x: 0, y: 0 });
}

export function resolveCadHatchRegion(
  loops: readonly CadPoint2[][],
  pickPoint: CadPoint2,
  islandStyle: 'normal' | 'outer' | 'ignore' = 'normal',
): CadPoint2[][] {
  const containing = loops
    .filter((loop) => loop.length >= 3 && cadPointInBoundary(pickPoint, loop))
    .sort((left, right) => Math.abs(cadBoundarySignedArea(left)) - Math.abs(cadBoundarySignedArea(right)));
  const outer = containing[0];
  if (!outer) return [];
  const normalizedOuter = cadBoundarySignedArea(outer) < 0 ? [...outer].reverse() : [...outer];
  if (islandStyle === 'ignore') return [normalizedOuter];
  const nested = loops
    .filter((loop) => loop !== outer && loop.length >= 3 && cadPointInBoundary(boundaryCentroid(loop), outer))
    .sort((left, right) => Math.abs(cadBoundarySignedArea(right)) - Math.abs(cadBoundarySignedArea(left)));
  if (islandStyle === 'outer') {
    const firstLevel = nested.filter((loop) => !nested.some((candidate) =>
      candidate !== loop
      && Math.abs(cadBoundarySignedArea(candidate)) > Math.abs(cadBoundarySignedArea(loop))
      && cadPointInBoundary(boundaryCentroid(loop), candidate)));
    return [normalizedOuter, ...firstLevel.map((loop) => cadBoundarySignedArea(loop) > 0 ? [...loop].reverse() : [...loop])];
  }
  return [normalizedOuter, ...nested.map((loop) => [...loop])];
}

export function resolveCadHatchRegionWithSources(
  built: CadBoundaryBuildResult,
  pickPoint: CadPoint2,
  islandStyle: 'normal' | 'outer' | 'ignore' = 'normal',
): { boundaries: CadPoint2[][]; sourceIds: string[] } {
  const boundaries = resolveCadHatchRegion(built.loops, pickPoint, islandStyle);
  const keys = new Set(boundaries.map(boundaryKey));
  const sourceIds = new Set<string>();
  built.loops.forEach((loop, index) => {
    if (keys.has(boundaryKey(loop)))
      for (const sourceId of built.loopSourceIds[index] ?? []) sourceIds.add(sourceId);
  });
  return { boundaries, sourceIds: [...sourceIds] };
}

export function hatchRegionContainsPoint(
  boundaries: readonly CadPoint2[][],
  point: CadPoint2,
  islandStyle: 'normal' | 'outer' | 'ignore' = 'normal',
): boolean {
  if (!boundaries[0] || !cadPointInBoundary(point, boundaries[0])) return false;
  if (islandStyle === 'ignore') return true;
  const containing = boundaries.filter((boundary) => cadPointInBoundary(point, boundary)).length;
  return islandStyle === 'normal' ? containing % 2 === 1 : containing === 1;
}

export type CadBoundaryResolver = (entity: CadEntity) => CadBoundaryPath[];

export function regenerateAssociativeHatches(
  entities: readonly CadEntity[],
  changedEntityIds: readonly string[],
  resolveBoundary: CadBoundaryResolver,
): { entities: CadEntity[]; regeneratedIds: string[]; brokenIds: string[] } {
  const changed = new Set(changedEntityIds);
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const regeneratedIds: string[] = [];
  const brokenIds: string[] = [];
  const next = entities.map((entity): CadEntity => {
    if (entity.type !== 'hatch' || !entity.associative || !entity.boundaryRefs?.some((id) => changed.has(id))) return entity;
    const sources = entity.boundaryRefs.map((id) => byId.get(id)).filter((source): source is CadEntity => !!source);
    const built = stitchCadBoundaryPaths(sources.flatMap(resolveBoundary));
    if (sources.length !== entity.boundaryRefs.length || !built.loops.length || built.openSourceIds.length) {
      brokenIds.push(entity.id);
      return { ...entity, associationStatus: 'broken' };
    }
    regeneratedIds.push(entity.id);
    return {
      ...entity,
      boundaries: built.loops.map((loop) => loop.map((point): CadPoint3 => ({ ...point, z: 0 }))),
      associationStatus: 'associated',
    };
  });
  return { entities: next, regeneratedIds, brokenIds };
}
