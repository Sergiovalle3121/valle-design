import type { CadNativeEntity } from "./entity-runtime";

/**
 * A browser cannot keep one Three.js object per entity for arbitrarily large
 * drawings. The canonical document remains complete; this limit only controls
 * the disposable detailed scene projection.
 */
export const CAD_NATIVE_DETAILED_RENDER_LIMIT = 10_000;
export const CAD_NATIVE_LARGE_DRAWING_THRESHOLD = 50_000;
export const CAD_NATIVE_LARGE_DRAWING_RENDER_LIMIT = 2_500;

export interface CadNativeRenderPlan {
  entities: CadNativeEntity[];
  total: number;
  rendered: number;
  omitted: number;
  limited: boolean;
}

/**
 * Builds a deterministic, evenly distributed LOD sample. Selected entities are
 * always projected first so an edit never disappears merely because the
 * drawing crossed the detailed-render threshold.
 */
export function planCadNativeRenderBudget(
  entities: readonly CadNativeEntity[],
  selectedEntityIds: readonly string[] = [],
  limit?: number,
): CadNativeRenderPlan {
  const total = entities.length;
  const requestedLimit = limit ?? (
    total > CAD_NATIVE_LARGE_DRAWING_THRESHOLD
      ? CAD_NATIVE_LARGE_DRAWING_RENDER_LIMIT
      : CAD_NATIVE_DETAILED_RENDER_LIMIT
  );
  const safeLimit = Math.max(0, Math.floor(requestedLimit));
  if (total <= safeLimit) {
    return {
      entities: entities as CadNativeEntity[],
      total,
      rendered: total,
      omitted: 0,
      limited: false,
    };
  }

  if (safeLimit === 0) {
    return { entities: [], total, rendered: 0, omitted: total, limited: true };
  }

  const selectedIds = new Set(selectedEntityIds);
  const selected = entities
    .filter((entity) => selectedIds.has(entity.id))
    .slice(0, safeLimit);
  const selectedInPlan = new Set(selected.map((entity) => entity.id));
  const remainingBudget = safeLimit - selected.length;
  if (remainingBudget === 0) {
    return {
      entities: selected,
      total,
      rendered: selected.length,
      omitted: total - selected.length,
      limited: true,
    };
  }

  const candidates = entities.filter((entity) => !selectedInPlan.has(entity.id));
  const step = candidates.length / remainingBudget;
  const sampled = Array.from(
    { length: remainingBudget },
    (_, index) => candidates[Math.floor(index * step)],
  );
  const planned = [...selected, ...sampled];
  return {
    entities: planned,
    total,
    rendered: planned.length,
    omitted: total - planned.length,
    limited: true,
  };
}
