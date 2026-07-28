import {
  CAD_ENTITY_REGISTRY,
  CadSpatialIndex,
  type CadBounds,
  type CadNativeEntity,
  type CadScenePatch,
} from "./entity-runtime";
import type { CadDocument } from "./cad-document";

function centerDistanceSquared(
  entity: CadNativeEntity,
  point: { x: number; y: number },
  document?: CadDocument,
): number {
  const bounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, document);
  const dx = (bounds.minX + bounds.maxX) / 2 - point.x;
  const dy = (bounds.minY + bounds.maxY) / 2 - point.y;
  return dx * dx + dy * dy;
}

type CadPathSelectionMode = "polygon" | "fence" | "lasso";

function pathBounds(points: readonly { x: number; y: number }[]): CadBounds | null {
  if (!points.length) return null;
  return points.reduce<CadBounds>((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function pointInPolygon(point: { x: number; y: number }, polygon: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const left = polygon[index];
    const right = polygon[previous];
    if (
      (left.y > point.y) !== (right.y > point.y)
      && point.x < ((right.x - left.x) * (point.y - left.y)) / (right.y - left.y) + left.x
    ) inside = !inside;
  }
  return inside;
}

function orientation(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }): boolean {
  return p.x <= Math.max(a.x, b.x) && p.x >= Math.min(a.x, b.x)
    && p.y <= Math.max(a.y, b.y) && p.y >= Math.min(a.y, b.y);
}

function segmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if ((abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0)) return true;
  const epsilon = 1e-9;
  return (Math.abs(abC) <= epsilon && onSegment(a, b, c))
    || (Math.abs(abD) <= epsilon && onSegment(a, b, d))
    || (Math.abs(cdA) <= epsilon && onSegment(c, d, a))
    || (Math.abs(cdB) <= epsilon && onSegment(c, d, b));
}

function segments(points: readonly { x: number; y: number }[], closed: boolean): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  const result: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
  for (let index = 1; index < points.length; index++) result.push([points[index - 1], points[index]]);
  if (closed && points.length > 2) result.push([points.at(-1)!, points[0]]);
  return result;
}

function entityMatchesPath(
  entity: CadNativeEntity,
  selectionPath: readonly { x: number; y: number }[],
  mode: CadPathSelectionMode,
  crossing: boolean,
  document?: CadDocument,
): boolean {
  const entityPaths = CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(entity, 64, document);
  const selectionSegments = segments(selectionPath, mode !== "fence");
  const entityPoints = entityPaths.flatMap((path) => path.points);
  const entitySegments = entityPaths.flatMap((path) => segments(path.points, path.closed));
  const intersects = entitySegments.some(([a, b]) =>
    selectionSegments.some(([c, d]) => segmentsIntersect(a, b, c, d)));
  if (mode === "fence") return intersects;
  const fullyInside = entityPoints.length > 0 && entityPoints.every((point) => pointInPolygon(point, selectionPath));
  if (!crossing) return fullyInside;
  if (fullyInside || intersects || entityPoints.some((point) => pointInPolygon(point, selectionPath))) return true;
  return entityPaths.some((path) => path.closed && selectionPath.some((point) => pointInPolygon(point, path.points)));
}

/**
 * Full-document spatial index, independent from the disposable Three.js scene.
 * LOD can therefore omit detailed objects without making their canonical
 * geometry undiscoverable by point, window or snap queries.
 */
export class CadNativeSelectionIndex {
  private readonly spatialIndex: CadSpatialIndex;
  private readonly entities = new Map<string, CadNativeEntity>();
  private document?: CadDocument;

  constructor(cellSize = 100) {
    this.spatialIndex = new CadSpatialIndex(cellSize);
  }

  replace(entities: readonly CadNativeEntity[], document?: CadDocument): void {
    this.clear();
    this.document = document;
    for (const entity of entities) this.upsert(entity);
  }

  applyPatch(patch: CadScenePatch, document?: CadDocument): void {
    if (document) this.document = document;
    for (const id of new Set(patch.remove)) this.remove(id);
    for (const entity of patch.upsert) this.upsert(entity);
  }

  private upsert(entity: CadNativeEntity): void {
    this.entities.set(entity.id, entity);
    this.spatialIndex.upsert(
      entity.id,
      CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, this.document),
    );
  }

  private remove(id: string): void {
    this.entities.delete(id);
    this.spatialIndex.remove(id);
  }

  entity(id: string): CadNativeEntity | undefined {
    return this.entities.get(id);
  }

  search(bounds: CadBounds, limit = Number.POSITIVE_INFINITY): CadNativeEntity[] {
    const result: CadNativeEntity[] = [];
    for (const id of this.spatialIndex.search(bounds)) {
      const entity = this.entities.get(id);
      if (entity) result.push(entity);
      if (result.length >= limit) break;
    }
    return result;
  }

  hitTest(
    point: { x: number; y: number },
    tolerance: number,
    limit = 16,
  ): CadNativeEntity[] {
    const bounds = {
      minX: point.x - tolerance,
      minY: point.y - tolerance,
      maxX: point.x + tolerance,
      maxY: point.y + tolerance,
    };
    return this.search(bounds)
      .filter((entity) =>
        CAD_ENTITY_REGISTRY.adapter(entity).hitTester.hitTest(
          entity,
          point,
          tolerance,
          this.document,
        ),
      )
      .sort((left, right) =>
        centerDistanceSquared(left, point, this.document) - centerDistanceSquared(right, point, this.document)
        || left.id.localeCompare(right.id),
      )
      .slice(0, limit);
  }

  intersecting(
    bounds: CadBounds,
    crossing: boolean,
    limit = 300,
  ): CadNativeEntity[] {
    const result: CadNativeEntity[] = [];
    for (const entity of this.search(bounds)) {
      if (!CAD_ENTITY_REGISTRY.adapter(entity).hitTester.intersectsWindow(
        entity,
        bounds,
        crossing,
        this.document,
      )) continue;
      result.push(entity);
      if (result.length >= limit) break;
    }
    return result;
  }

  path(
    points: readonly { x: number; y: number }[],
    mode: CadPathSelectionMode,
    crossing = mode !== "polygon",
    limit = 300,
  ): CadNativeEntity[] {
    if (points.length < (mode === "fence" ? 2 : 3)) return [];
    const bounds = pathBounds(points);
    if (!bounds) return [];
    const result: CadNativeEntity[] = [];
    for (const entity of this.search(bounds)) {
      if (!entityMatchesPath(entity, points, mode, crossing, this.document)) continue;
      result.push(entity);
      if (result.length >= limit) break;
    }
    return result;
  }

  get size(): number {
    return this.entities.size;
  }

  clear(): void {
    this.entities.clear();
    this.spatialIndex.clear();
    this.document = undefined;
  }
}
