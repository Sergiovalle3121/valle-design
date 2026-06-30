export type CadPropertyObjectType = "station" | "asset";

export interface CadPropertyObject {
  id: string;
  type: CadPropertyObjectType;
  label: string;
  kind?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  layerId: string;
  layerLabel: string;
  layerVisible: boolean;
  layerLocked: boolean;
  tags?: string;
  notes?: string;
}

export interface CadObjectSourceMetadata {
  source: "manual" | "dxf" | "generated";
  dxfLayer?: string;
  editableImport?: boolean;
}

export interface CadObjectProperties {
  object: CadPropertyObject;
  area: number;
  center: { x: number; y: number };
  bounds: { x: number; y: number; width: number; height: number };
  tagList: string[];
  source: CadObjectSourceMetadata;
  safetyClassification: "none" | "aisle" | "no-go" | "restricted" | "esd";
  warnings: string[];
}

export interface CadSelectionLayerSummary {
  id: string;
  label: string;
  count: number;
  locked: boolean;
  visible: boolean;
}

export interface CadSelectionProperties {
  count: number;
  stationCount: number;
  assetCount: number;
  lockedCount: number;
  hiddenCount: number;
  area: number;
  bounds: { x: number; y: number; width: number; height: number };
  layers: CadSelectionLayerSummary[];
  tags: string[];
  warnings: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function parseCadObjectTags(value: string | undefined): string[] {
  return unique(
    (value ?? "")
      .split(/[,\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}

export function cadObjectSourceFromTags(
  tags: string[],
): CadObjectSourceMetadata {
  const normalized = tags.map((tag) => tag.toLowerCase());
  const dxfLayer = tags
    .find((tag) => tag.toLowerCase().startsWith("dxf-layer:"))
    ?.slice("dxf-layer:".length)
    .trim();

  if (normalized.includes("dxf") || dxfLayer) {
    return {
      source: "dxf",
      dxfLayer,
      editableImport: normalized.some((tag) => tag.startsWith("editable-")),
    };
  }

  if (
    normalized.some(
      (tag) =>
        tag.startsWith("generated") ||
        tag === "rack-row" ||
        tag === "template",
    )
  ) {
    return { source: "generated" };
  }

  return { source: "manual" };
}

export function cadSafetyClassificationFromTags(
  tags: string[],
): CadObjectProperties["safetyClassification"] {
  const normalized = tags.map((tag) => tag.toLowerCase().replace(/_/g, "-"));
  if (normalized.some((tag) => tag === "no-go" || tag.includes("no-go"))) {
    return "no-go";
  }
  if (normalized.some((tag) => tag === "restricted" || tag.includes("restricted"))) {
    return "restricted";
  }
  if (normalized.some((tag) => tag === "esd" || tag.includes("esd"))) {
    return "esd";
  }
  if (
    normalized.some(
      (tag) =>
        tag === "aisle" ||
        tag === "clearance" ||
        tag === "material-flow" ||
        tag.includes("forklift") ||
        tag === "emergency" ||
        tag === "exit" ||
        tag === "egress" ||
        tag === "keep-clear",
    )
  ) {
    return "aisle";
  }
  return "none";
}

export function describeCadObjectProperties(
  object: CadPropertyObject,
): CadObjectProperties {
  const tagList = parseCadObjectTags(object.tags);
  const source = cadObjectSourceFromTags(tagList);
  const safetyClassification = cadSafetyClassificationFromTags(tagList);
  const warnings: string[] = [];

  if (object.layerLocked) {
    warnings.push("Layer is locked; geometry edits are protected.");
  }
  if (!object.layerVisible) {
    warnings.push("Layer is hidden; object may not be visible in the viewport.");
  }
  if (source.source === "dxf" && !source.editableImport) {
    warnings.push("Imported from DXF without editable conversion metadata.");
  }
  if (object.width <= 0 || object.height <= 0) {
    warnings.push("Object has a non-positive footprint.");
  }

  return {
    object,
    area: object.width * object.height,
    center: {
      x: object.x + object.width / 2,
      y: object.y + object.height / 2,
    },
    bounds: {
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
    },
    tagList,
    source,
    safetyClassification,
    warnings,
  };
}

export function summarizeCadSelectionProperties(
  objects: CadPropertyObject[],
): CadSelectionProperties | null {
  if (!objects.length) return null;

  const minX = Math.min(...objects.map((object) => object.x));
  const minY = Math.min(...objects.map((object) => object.y));
  const maxX = Math.max(...objects.map((object) => object.x + object.width));
  const maxY = Math.max(...objects.map((object) => object.y + object.height));
  const layerMap = new Map<string, CadSelectionLayerSummary>();

  for (const object of objects) {
    const current = layerMap.get(object.layerId) ?? {
      id: object.layerId,
      label: object.layerLabel,
      count: 0,
      locked: object.layerLocked,
      visible: object.layerVisible,
    };
    current.count += 1;
    current.locked = current.locked || object.layerLocked;
    current.visible = current.visible && object.layerVisible;
    layerMap.set(object.layerId, current);
  }

  const warnings: string[] = [];
  const lockedCount = objects.filter((object) => object.layerLocked).length;
  const hiddenCount = objects.filter((object) => !object.layerVisible).length;
  if (lockedCount) warnings.push(`${lockedCount} object(s) are on locked layers.`);
  if (hiddenCount) warnings.push(`${hiddenCount} object(s) are on hidden layers.`);

  return {
    count: objects.length,
    stationCount: objects.filter((object) => object.type === "station").length,
    assetCount: objects.filter((object) => object.type === "asset").length,
    lockedCount,
    hiddenCount,
    area: objects.reduce(
      (total, object) => total + object.width * object.height,
      0,
    ),
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    },
    layers: [...layerMap.values()].sort((a, b) => b.count - a.count),
    tags: unique(objects.flatMap((object) => parseCadObjectTags(object.tags))),
    warnings,
  };
}
