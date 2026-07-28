import {
  CAD_ENTITY_REGISTRY,
  CadSpatialIndex,
  type CadBounds,
  type CadNativeEntity,
  type CadScenePatch,
} from "./entity-runtime";

function centerDistanceSquared(
  entity: CadNativeEntity,
  point: { x: number; y: number },
): number {
  const bounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity);
  const dx = (bounds.minX + bounds.maxX) / 2 - point.x;
  const dy = (bounds.minY + bounds.maxY) / 2 - point.y;
  return dx * dx + dy * dy;
}

/**
 * Full-document spatial index, independent from the disposable Three.js scene.
 * LOD can therefore omit detailed objects without making their canonical
 * geometry undiscoverable by point, window or snap queries.
 */
export class CadNativeSelectionIndex {
  private readonly spatialIndex: CadSpatialIndex;
  private readonly entities = new Map<string, CadNativeEntity>();

  constructor(cellSize = 100) {
    this.spatialIndex = new CadSpatialIndex(cellSize);
  }

  replace(entities: readonly CadNativeEntity[]): void {
    this.clear();
    for (const entity of entities) this.upsert(entity);
  }

  applyPatch(patch: CadScenePatch): void {
    for (const id of new Set(patch.remove)) this.remove(id);
    for (const entity of patch.upsert) this.upsert(entity);
  }

  private upsert(entity: CadNativeEntity): void {
    this.entities.set(entity.id, entity);
    this.spatialIndex.upsert(
      entity.id,
      CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity),
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
        ),
      )
      .sort((left, right) =>
        centerDistanceSquared(left, point) - centerDistanceSquared(right, point)
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
      )) continue;
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
  }
}
