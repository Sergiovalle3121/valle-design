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
  visible: number;
  rendered: number;
  omitted: number;
  limited: boolean;
  viewportDriven: boolean;
}

export interface CadNativeViewportRenderOptions {
  /** Entities returned by the full-document spatial index for the visible bounds. */
  visibleEntities?: readonly CadNativeEntity[];
  /** Detailed entities allowed while the viewport still contains a large drawing. */
  largeViewportLimit?: number;
  /** Detailed entities allowed once a zoomed viewport is below the large threshold. */
  detailedViewportLimit?: number;
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
  viewport?: CadNativeViewportRenderOptions,
): CadNativeRenderPlan {
  const total = entities.length;
  const candidates = viewport?.visibleEntities ?? entities;
  const visible = candidates.length;
  const viewportDriven = viewport?.visibleEntities !== undefined;
  const detailedViewportLimit = viewport?.detailedViewportLimit
    ?? CAD_NATIVE_DETAILED_RENDER_LIMIT;
  const largeViewportLimit = viewport?.largeViewportLimit
    ?? CAD_NATIVE_LARGE_DRAWING_RENDER_LIMIT;
  const requestedLimit = limit ?? (
    total > CAD_NATIVE_LARGE_DRAWING_THRESHOLD && visible > detailedViewportLimit
      ? largeViewportLimit
      : detailedViewportLimit
  );
  const safeLimit = Math.max(0, Math.floor(requestedLimit));
  if (total <= safeLimit && !viewportDriven) {
    return {
      entities: entities as CadNativeEntity[],
      total,
      visible: total,
      rendered: total,
      omitted: 0,
      limited: false,
      viewportDriven: false,
    };
  }

  if (safeLimit === 0) {
    return {
      entities: [], total, visible, rendered: 0, omitted: total,
      limited: total > 0, viewportDriven,
    };
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
      visible,
      rendered: selected.length,
      omitted: total - selected.length,
      limited: true,
      viewportDriven,
    };
  }

  const detailCandidates = candidates.filter(
    (entity) => !selectedInPlan.has(entity.id),
  );
  const sampleCount = Math.min(remainingBudget, detailCandidates.length);
  const step = detailCandidates.length / sampleCount;
  const sampled = sampleCount === detailCandidates.length
    ? detailCandidates
    : Array.from(
        { length: sampleCount },
        (_, index) => detailCandidates[Math.floor(index * step)],
      );
  const planned = [...selected, ...sampled];
  return {
    entities: planned,
    total,
    visible,
    rendered: planned.length,
    omitted: total - planned.length,
    limited: planned.length < total,
    viewportDriven,
  };
}
