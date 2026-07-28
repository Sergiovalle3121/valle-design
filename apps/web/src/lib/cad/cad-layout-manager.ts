import type { CadModelBounds } from './paper-space';
import { fitCadViewportScale } from './paper-space';
import type { CadPaperSpace, CadPaperViewport } from './cad-document';

export interface CadLayoutPreflightIssue {
  code: 'no_viewports' | 'viewport_outside_printable_area' | 'viewport_overlap' | 'viewport_unlocked' | 'invalid_scale' | 'all_layers_frozen';
  severity: 'warning' | 'error';
  viewportId?: string;
  detail: string;
}

const TITLE_BLOCK_HEIGHT = 30;
const MIN_VIEWPORT_SIZE = 12;

export function cadPrintableBounds(space: CadPaperSpace) {
  const margins = space.pageSetup?.margins ?? { top: 10, right: 10, bottom: 10, left: 10 };
  return {
    x: margins.left,
    y: margins.top,
    width: Math.max(MIN_VIEWPORT_SIZE, space.page.width - margins.left - margins.right),
    height: Math.max(MIN_VIEWPORT_SIZE, space.page.height - margins.top - margins.bottom - TITLE_BLOCK_HEIGHT),
  };
}

export function normalizeCadViewportPaperBounds(
  space: CadPaperSpace,
  bounds: CadPaperViewport['paperBounds'],
): CadPaperViewport['paperBounds'] {
  const printable = cadPrintableBounds(space);
  const width = Math.max(MIN_VIEWPORT_SIZE, Math.min(printable.width, Number(bounds.width) || MIN_VIEWPORT_SIZE));
  const height = Math.max(MIN_VIEWPORT_SIZE, Math.min(printable.height, Number(bounds.height) || MIN_VIEWPORT_SIZE));
  return {
    x: Math.max(printable.x, Math.min(printable.x + printable.width - width, Number(bounds.x) || 0)),
    y: Math.max(printable.y, Math.min(printable.y + printable.height - height, Number(bounds.y) || 0)),
    width,
    height,
  };
}

export function createCadPaperViewport(input: {
  space: CadPaperSpace;
  id: string;
  name?: string;
  modelBounds: CadModelBounds;
  unit?: string;
}): CadPaperViewport {
  const printable = cadPrintableBounds(input.space);
  const count = input.space.viewports?.length ?? 0;
  const gap = 4;
  const paperBounds = normalizeCadViewportPaperBounds(input.space, {
    x: printable.x + (count % 2) * (printable.width / 2),
    y: printable.y + (Math.floor(count / 2) % 2) * (printable.height / 2),
    width: printable.width / 2 - gap,
    height: printable.height / 2 - gap,
  });
  const scale = fitCadViewportScale(input.modelBounds, paperBounds, input.unit);
  return {
    id: input.id,
    name: input.name ?? `Viewport ${count + 1}`,
    paperBounds,
    modelBounds: { ...input.modelBounds },
    scale,
    annotationScale: scale,
    locked: false,
  };
}

export function updateCadPaperViewport(
  space: CadPaperSpace,
  viewportId: string,
  update: (viewport: CadPaperViewport) => CadPaperViewport,
): CadPaperSpace {
  return {
    ...space,
    viewports: (space.viewports ?? []).map((viewport) => {
      if (viewport.id !== viewportId) return viewport;
      const next = update(viewport);
      return { ...next, paperBounds: normalizeCadViewportPaperBounds(space, next.paperBounds) };
    }),
  };
}

export function duplicateCadPaperViewport(space: CadPaperSpace, viewportId: string, id: string): CadPaperSpace {
  const source = space.viewports?.find((viewport) => viewport.id === viewportId);
  if (!source) return space;
  const copy: CadPaperViewport = {
    ...structuredClone(source),
    id,
    name: `${source.name ?? 'Viewport'} copy`,
    locked: false,
    paperBounds: normalizeCadViewportPaperBounds(space, { ...source.paperBounds, x: source.paperBounds.x + 5, y: source.paperBounds.y + 5 }),
  };
  return { ...space, viewports: [...(space.viewports ?? []), copy] };
}

export function deleteCadPaperViewport(space: CadPaperSpace, viewportId: string): CadPaperSpace {
  return { ...space, viewports: (space.viewports ?? []).filter((viewport) => viewport.id !== viewportId) };
}

export function setCadViewportLayerVisibility(space: CadPaperSpace, viewportId: string, layerId: string, visible: boolean): CadPaperSpace {
  return updateCadPaperViewport(space, viewportId, (viewport) => ({
    ...viewport,
    layerVisibility: { ...(viewport.layerVisibility ?? {}), [layerId]: visible },
  }));
}

export function setCadViewportLayerOverride(
  space: CadPaperSpace,
  viewportId: string,
  layerId: string,
  override: { color?: string; linetype?: string; lineweight?: number } | null,
): CadPaperSpace {
  return updateCadPaperViewport(space, viewportId, (viewport) => {
    const next = { ...(viewport.layerOverrides ?? {}) };
    if (override) next[layerId] = override;
    else delete next[layerId];
    return { ...viewport, layerOverrides: next };
  });
}

function overlaps(a: CadPaperViewport['paperBounds'], b: CadPaperViewport['paperBounds']) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function preflightCadPaperSpace(space: CadPaperSpace, layerIds: readonly string[] = []): CadLayoutPreflightIssue[] {
  const viewports = space.viewports ?? [];
  if (!viewports.length) return [{ code: 'no_viewports', severity: 'error', detail: 'The layout has no model viewport.' }];
  const printable = cadPrintableBounds(space);
  const issues: CadLayoutPreflightIssue[] = [];
  viewports.forEach((viewport, index) => {
    const bounds = viewport.paperBounds;
    if (bounds.x < printable.x || bounds.y < printable.y || bounds.x + bounds.width > printable.x + printable.width || bounds.y + bounds.height > printable.y + printable.height)
      issues.push({ code: 'viewport_outside_printable_area', severity: 'error', viewportId: viewport.id, detail: `${viewport.name ?? viewport.id} exceeds the printable area.` });
    if (!(viewport.scale > 0) || !Number.isFinite(viewport.scale))
      issues.push({ code: 'invalid_scale', severity: 'error', viewportId: viewport.id, detail: `${viewport.name ?? viewport.id} has an invalid scale.` });
    if (!viewport.locked)
      issues.push({ code: 'viewport_unlocked', severity: 'warning', viewportId: viewport.id, detail: `${viewport.name ?? viewport.id} is editable; lock it before issue.` });
    if (layerIds.length && layerIds.every((layerId) => viewport.layerVisibility?.[layerId] === false))
      issues.push({ code: 'all_layers_frozen', severity: 'warning', viewportId: viewport.id, detail: `${viewport.name ?? viewport.id} freezes every document layer.` });
    viewports.slice(index + 1).forEach((other) => {
      if (overlaps(bounds, other.paperBounds))
        issues.push({ code: 'viewport_overlap', severity: 'warning', viewportId: viewport.id, detail: `${viewport.name ?? viewport.id} overlaps ${other.name ?? other.id}.` });
    });
  });
  return issues;
}
