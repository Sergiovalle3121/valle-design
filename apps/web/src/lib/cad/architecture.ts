import type { CadLayerId } from "./layers";

export type CadArchitectureRole =
  | "wall"
  | "column"
  | "door"
  | "room"
  | "utility";

export type CadRoomUseType =
  | "smt"
  | "assembly"
  | "test"
  | "quality"
  | "warehouse"
  | "packing"
  | "shipping"
  | "office"
  | "ehs"
  | "utility"
  | "unclassified";

export interface CadArchitectureObjectInput {
  id: string;
  kind: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  layerId?: CadLayerId | string;
  tags?: string[] | string;
}

export interface CadArchitectureMetric {
  label: string;
  value: string;
}

export interface CadArchitectureObjectSummary {
  id: string;
  role: CadArchitectureRole;
  label: string;
  layerId: CadLayerId | string;
  area: number;
  length?: number;
  thickness?: number;
  roomUse?: CadRoomUseType;
  department?: string;
  technical: CadArchitectureMetric[];
  warnings: string[];
}

export interface CadAreaBucket {
  key: string;
  label: string;
  count: number;
  area: number;
}

export interface CadArchitectureTakeoffSummary {
  unit: string;
  footprintArea: number;
  stationArea: number;
  equipmentArea: number;
  architectureArea: number;
  structureArea: number;
  utilityArea: number;
  aisleArea: number;
  safetyArea: number;
  roomArea: number;
  occupiedArea: number;
  openFloorArea: number;
  occupiedPct: number;
  wallLength: number;
  wallCount: number;
  columnCount: number;
  doorCount: number;
  roomCount: number;
  utilityCount: number;
  byLayer: CadAreaBucket[];
  byRoomUse: CadAreaBucket[];
  byDepartment: CadAreaBucket[];
}

export interface CadArchitectureTakeoffInput {
  unit?: string;
  footprintArea: number;
  stations?: CadArchitectureObjectInput[];
  assets?: CadArchitectureObjectInput[];
  layers?: Array<{ id: string; label: string }>;
}

const UTILITY_KINDS = new Set([
  "power_panel",
  "compressed_air",
  "network_drop",
  "maintenance_area",
  "tool_crib",
  "calibration_station",
  "eyewash",
]);

const SAFETY_KINDS = new Set([
  "fire_extinguisher",
  "emergency_exit",
  "first_aid",
  "spill_kit",
  "ppe_station",
]);

const ROOM_USE_LABELS: Record<CadRoomUseType, string> = {
  smt: "SMT",
  assembly: "Assembly",
  test: "Test",
  quality: "Quality",
  warehouse: "Warehouse",
  packing: "Packing",
  shipping: "Shipping",
  office: "Office",
  ehs: "EHS",
  utility: "Utility",
  unclassified: "Unclassified",
};

function tagList(value: CadArchitectureObjectInput["tags"]): string[] {
  if (Array.isArray(value)) return value.map((tag) => tag.trim()).filter(Boolean);
  return (value ?? "")
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizedTags(value: CadArchitectureObjectInput["tags"]): string[] {
  return tagList(value).map((tag) => tag.toLowerCase().replace(/_/g, "-"));
}

function areaOf(object: CadArchitectureObjectInput): number {
  return Math.max(0, object.width) * Math.max(0, object.height);
}

function hasAnyTag(tags: string[], values: string[]): boolean {
  return tags.some((tag) => values.some((value) => tag === value || tag.includes(value)));
}

function prefixedTag(tags: string[], prefixes: string[]): string | null {
  for (const tag of tags) {
    const match = prefixes.find((prefix) => tag.startsWith(prefix));
    if (match) return tag.slice(match.length).trim();
  }
  return null;
}

export function isCadRoomObject(object: CadArchitectureObjectInput): boolean {
  const tags = normalizedTags(object.tags);
  return (
    object.kind === "room" ||
    hasAnyTag(tags, ["room", "cuarto", "area-room", "room-boundary"]) ||
    !!prefixedTag(tags, ["use:", "room-use:"])
  );
}

export function roomUseTypeFromTags(
  tagsValue: CadArchitectureObjectInput["tags"],
  label = "",
): CadRoomUseType {
  const tags = normalizedTags(tagsValue);
  const explicit = prefixedTag(tags, ["use:", "room-use:"]);
  const text = `${explicit ?? ""} ${tags.join(" ")} ${label.toLowerCase()}`;

  if (text.includes("smt")) return "smt";
  if (text.includes("assembly") || text.includes("ensamble")) return "assembly";
  if (text.includes("test") || text.includes("prueba")) return "test";
  if (text.includes("quality") || text.includes("calidad") || text.includes("qc")) return "quality";
  if (text.includes("warehouse") || text.includes("almacen") || text.includes("store")) return "warehouse";
  if (text.includes("packing") || text.includes("empaque")) return "packing";
  if (text.includes("shipping") || text.includes("embarque")) return "shipping";
  if (text.includes("office") || text.includes("oficina")) return "office";
  if (text.includes("ehs") || text.includes("safety")) return "ehs";
  if (text.includes("utility") || text.includes("utilities") || text.includes("utilidad")) return "utility";
  return "unclassified";
}

export function roomDepartmentFromTags(
  tagsValue: CadArchitectureObjectInput["tags"],
  label = "",
): string {
  const tags = normalizedTags(tagsValue);
  const explicit = prefixedTag(tags, ["dept:", "department:"]);
  if (explicit) return explicit.toUpperCase();
  const useType = roomUseTypeFromTags(tagsValue, label);
  return ROOM_USE_LABELS[useType];
}

export function defaultCadLayerForAssetKind(
  kind: string,
  tagsValue?: CadArchitectureObjectInput["tags"],
): CadLayerId {
  const tags = normalizedTags(tagsValue);
  if (kind === "wall" || kind === "door" || isCadRoomObject({ id: "", kind, x: 0, y: 0, width: 0, height: 0, tags: tagsValue })) {
    return "architecture";
  }
  if (kind === "column") return "structure";
  if (UTILITY_KINDS.has(kind)) return "utilities";
  if (kind === "agvpath" || hasAnyTag(tags, ["aisle", "forklift", "pedestrian"])) return "aisles";
  if (SAFETY_KINDS.has(kind) || hasAnyTag(tags, ["safety", "no-go", "restricted", "emergency", "esd"])) return "safety";
  return "equipment";
}

export function describeCadArchitectureObject(
  object: CadArchitectureObjectInput,
): CadArchitectureObjectSummary | null {
  const layerId = object.layerId ?? defaultCadLayerForAssetKind(object.kind, object.tags);
  const warnings: string[] = [];
  const area = areaOf(object);
  const length = Math.max(object.width, object.height);
  const thickness = Math.min(object.width, object.height);

  if (object.kind === "wall") {
    if (layerId !== "architecture") warnings.push("Wall is not on the Architecture layer.");
    if (thickness <= 0) warnings.push("Wall thickness is not valid.");
    return {
      id: object.id,
      role: "wall",
      label: object.label || "Wall",
      layerId,
      area,
      length,
      thickness,
      technical: [
        { label: "Length", value: `${Math.round(length)} mm` },
        { label: "Thickness", value: `${Math.round(thickness)} mm` },
      ],
      warnings,
    };
  }

  if (object.kind === "column") {
    if (layerId !== "structure") warnings.push("Column is not on the Structure layer.");
    return {
      id: object.id,
      role: "column",
      label: object.label || "Column",
      layerId,
      area,
      technical: [
        { label: "Size", value: `${Math.round(object.width)} x ${Math.round(object.height)} mm` },
        { label: "Footprint", value: `${Math.round(area)} mm2` },
      ],
      warnings,
    };
  }

  if (object.kind === "door") {
    if (layerId !== "architecture") warnings.push("Door is not on the Architecture layer.");
    return {
      id: object.id,
      role: "door",
      label: object.label || "Door",
      layerId,
      area,
      length,
      thickness,
      technical: [
        { label: "Opening width", value: `${Math.round(length)} mm` },
        { label: "Leaf / jamb", value: `${Math.round(thickness)} mm` },
      ],
      warnings,
    };
  }

  if (isCadRoomObject(object)) {
    const roomUse = roomUseTypeFromTags(object.tags, object.label);
    const department = roomDepartmentFromTags(object.tags, object.label);
    if (roomUse === "unclassified") warnings.push("Room use is not classified; add use:smt, use:quality, etc.");
    if (!object.label?.trim()) warnings.push("Room is missing a visible name.");
    return {
      id: object.id,
      role: "room",
      label: object.label || "Room / area",
      layerId,
      area,
      roomUse,
      department,
      technical: [
        { label: "Area", value: `${Math.round(area)} mm2` },
        { label: "Use", value: ROOM_USE_LABELS[roomUse] },
        { label: "Department", value: department },
      ],
      warnings,
    };
  }

  if (UTILITY_KINDS.has(object.kind) || layerId === "utilities") {
    return {
      id: object.id,
      role: "utility",
      label: object.label || object.kind,
      layerId,
      area,
      technical: [
        { label: "Utility", value: object.kind.replace(/-/g, " ").replace(/_/g, " ") },
        { label: "Footprint", value: `${Math.round(area)} mm2` },
      ],
      warnings,
    };
  }

  return null;
}

function addBucket(
  map: Map<string, CadAreaBucket>,
  key: string,
  label: string,
  area: number,
): void {
  const bucket = map.get(key) ?? { key, label, count: 0, area: 0 };
  bucket.count += 1;
  bucket.area += area;
  map.set(key, bucket);
}

export function buildCadArchitectureTakeoff(
  input: CadArchitectureTakeoffInput,
): CadArchitectureTakeoffSummary {
  const footprintArea = Math.max(0, input.footprintArea);
  const layerLabels = new Map((input.layers ?? []).map((layer) => [layer.id, layer.label]));
  const byLayer = new Map<string, CadAreaBucket>();
  const byRoomUse = new Map<string, CadAreaBucket>();
  const byDepartment = new Map<string, CadAreaBucket>();
  let stationArea = 0;
  let equipmentArea = 0;
  let architectureArea = 0;
  let structureArea = 0;
  let utilityArea = 0;
  let aisleArea = 0;
  let safetyArea = 0;
  let roomArea = 0;
  let wallLength = 0;
  let wallCount = 0;
  let columnCount = 0;
  let doorCount = 0;
  let roomCount = 0;
  let utilityCount = 0;

  for (const station of input.stations ?? []) {
    const area = areaOf(station);
    const layerId = station.layerId ?? "layout";
    stationArea += area;
    addBucket(byLayer, String(layerId), layerLabels.get(String(layerId)) ?? String(layerId), area);
  }

  for (const asset of input.assets ?? []) {
    const tags = normalizedTags(asset.tags);
    const layerId = asset.layerId ?? defaultCadLayerForAssetKind(asset.kind, asset.tags);
    const layerKey = String(layerId);
    const area = areaOf(asset);
    const role = describeCadArchitectureObject({ ...asset, layerId })?.role;

    addBucket(byLayer, layerKey, layerLabels.get(layerKey) ?? layerKey, area);

    if (role === "wall") {
      wallCount += 1;
      wallLength += Math.max(asset.width, asset.height);
      architectureArea += area;
      continue;
    }
    if (role === "door") {
      doorCount += 1;
      architectureArea += area;
      continue;
    }
    if (role === "column") {
      columnCount += 1;
      structureArea += area;
      continue;
    }
    if (role === "room") {
      const useType = roomUseTypeFromTags(asset.tags, asset.label);
      const department = roomDepartmentFromTags(asset.tags, asset.label);
      roomCount += 1;
      roomArea += area;
      addBucket(byRoomUse, useType, ROOM_USE_LABELS[useType], area);
      addBucket(byDepartment, department, department, area);
      continue;
    }
    if (role === "utility") {
      utilityCount += 1;
      utilityArea += area;
      continue;
    }
    if (layerId === "aisles" || asset.kind === "agvpath" || hasAnyTag(tags, ["aisle", "forklift", "pedestrian"])) {
      aisleArea += area;
      continue;
    }
    if (layerId === "safety" || SAFETY_KINDS.has(asset.kind) || hasAnyTag(tags, ["safety", "no-go", "restricted", "esd", "emergency"])) {
      safetyArea += area;
      continue;
    }

    equipmentArea += area;
  }

  const occupiedArea = stationArea + equipmentArea + architectureArea + structureArea + utilityArea;
  const openFloorArea = Math.max(0, footprintArea - occupiedArea - safetyArea);

  return {
    unit: input.unit || "mm",
    footprintArea,
    stationArea,
    equipmentArea,
    architectureArea,
    structureArea,
    utilityArea,
    aisleArea,
    safetyArea,
    roomArea,
    occupiedArea,
    openFloorArea,
    occupiedPct: footprintArea > 0 ? Math.min(100, (occupiedArea / footprintArea) * 100) : 0,
    wallLength,
    wallCount,
    columnCount,
    doorCount,
    roomCount,
    utilityCount,
    byLayer: [...byLayer.values()].sort((a, b) => b.area - a.area || a.label.localeCompare(b.label)),
    byRoomUse: [...byRoomUse.values()].sort((a, b) => b.area - a.area || a.label.localeCompare(b.label)),
    byDepartment: [...byDepartment.values()].sort((a, b) => b.area - a.area || a.label.localeCompare(b.label)),
  };
}
