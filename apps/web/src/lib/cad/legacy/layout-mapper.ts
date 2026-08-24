import { migrateCadDocument, type CadDocument } from "@/lib/cad/cad-document";
import {
  cadDocumentToEditorSnapshot,
  splitTags,
} from "@/lib/cad/editor-snapshot";

/** Historical default footprint used by the legacy editor projection. */
export const DEFAULT_FOOTPRINT = {
  footprintW: 20_000,
  footprintH: 10_000,
  unit: "mm",
  gridSize: 500,
} as const;

export interface LegacyFootprint {
  footprintW: number;
  footprintH: number;
  unit: string;
  gridSize: number;
}

export interface LegacyAsset {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  shape?: "rect" | "circle";
  layer?: string;
  group?: string;
  tags?: string[];
  /** Acabado elegido (id de `lib/cad/materials/architectural-material-library.ts`). */
  materialId?: string;
}

export interface DocumentSummary {
  id: string;
  projectId: string | null;
  name: string;
  model: string | null;
  revision: string | null;
  cadDocumentVersion: number;
}

export interface DxfPlacement {
  name: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  visible: boolean;
  opacity: number;
}

export interface OpenedDocument extends DocumentSummary {
  cadDocument: Record<string, unknown> | null;
  dxf?: DxfPlacement | null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function footprintFromMeta(
  raw: Record<string, unknown> | null,
): LegacyFootprint {
  const meta =
    raw && typeof raw.meta === "object" && raw.meta && !Array.isArray(raw.meta)
      ? (raw.meta as Record<string, unknown>)
      : {};
  return {
    footprintW: positiveNumber(meta.footprintW) ?? DEFAULT_FOOTPRINT.footprintW,
    footprintH: positiveNumber(meta.footprintH) ?? DEFAULT_FOOTPRINT.footprintH,
    unit:
      typeof meta.unit === "string" && meta.unit
        ? meta.unit
        : DEFAULT_FOOTPRINT.unit,
    gridSize: positiveNumber(meta.gridSize) ?? DEFAULT_FOOTPRINT.gridSize,
  };
}

function groupsFromEntities(document: CadDocument): Map<string, string> {
  const groups = new Map<string, string>();
  for (const entity of document.entities) {
    if (entity.type === "box" && entity.group) {
      groups.set(entity.id, entity.group);
    } else if (entity.type === "circle" && entity.legacy?.group) {
      groups.set(entity.id, entity.legacy.group);
    }
  }
  return groups;
}

export function defaultApproval() {
  return { status: "draft", by: null, at: null, note: null };
}

export function emptyLayout(model: string, revision: string) {
  return {
    model,
    revision,
    footprint: { ...DEFAULT_FOOTPRINT },
    stations: [],
    dxf: null,
    connectors: [],
    assets: [],
    annotations: [],
    cells: [],
    layers: [],
    cadDocument: null,
    cadDocumentVersion: 0,
    approval: defaultApproval(),
  };
}

function placementFields(placement: DxfPlacement) {
  return {
    name: placement.name,
    offsetX: placement.offsetX,
    offsetY: placement.offsetY,
    scale: placement.scale,
    rotation: placement.rotation,
    visible: placement.visible,
    opacity: placement.opacity,
  };
}

/**
 * Pure canonical-document to legacy-layout projection. It performs no HTTP or
 * storage access and preserves the canonical payload alongside the projection.
 */
export function layoutFromDocument(
  model: string,
  revision: string,
  row: OpenedDocument,
  dxf: DxfPlacement | null,
) {
  const base = emptyLayout(model, revision);
  base.cadDocumentVersion = row.cadDocumentVersion ?? 0;
  if (!row.cadDocument) {
    return { ...base, dxf: dxf ? placementFields(dxf) : null };
  }

  const document = migrateCadDocument(row.cadDocument);
  const snapshot = cadDocumentToEditorSnapshot(document);
  const groups = groupsFromEntities(document);
  const assets: LegacyAsset[] = snapshot.assets.map((asset) => ({
    ...asset,
    ...(snapshot.layers[asset.id] ? { layer: snapshot.layers[asset.id] } : {}),
    ...(groups.has(asset.id) ? { group: groups.get(asset.id) } : {}),
    ...(snapshot.tags[asset.id]
      ? { tags: splitTags(snapshot.tags[asset.id]) }
      : {}),
  }));
  const stations = snapshot.placements.map(([id, placement]) => ({
    id,
    station: id,
    line: "",
    ctq: false,
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    rotation: placement.rotation,
  }));

  return {
    ...base,
    footprint: footprintFromMeta(row.cadDocument),
    stations,
    assets,
    annotations: snapshot.annotations,
    connectors: snapshot.connectors,
    dxf: dxf ? placementFields(dxf) : null,
    cadDocument: row.cadDocument,
  };
}
