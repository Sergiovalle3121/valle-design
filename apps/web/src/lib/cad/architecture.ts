import type { CadLayerId } from "./layers";
import { getCadSymbol } from "./symbols";

export type CadArchitectureRole =
  | "wall"
  | "column"
  | "door"
  | "room"
  | "utility";

/**
 * El uso de un local.
 *
 * ## Por qué esta lista tiene dos mitades
 *
 * La lista NACIÓ industrial —`smt`, `assembly`, `test`, `quality`,
 * `warehouse`, `packing`, `shipping`, `ehs`— porque el programa nació
 * distribuyendo líneas de producción. Un CAD para despachos mexicanos que no
 * sabe decir «recámara» no está a una función de distancia de su mercado: está
 * a un VOCABULARIO, que es peor, porque el arquitecto no puede añadirlo desde
 * fuera. Aquí se añade.
 *
 * Los industriales NO se borran. Hay documentos guardados con `use:smt` y
 * quitarlos convertiría su cuarto clasificado en «sin clasificar» la próxima
 * vez que se abrieran: perder la clasificación del usuario para hacerle sitio
 * a la nuestra es exactamente el trato que nadie acepta.
 *
 * Las claves van SIN acentos ni eñes porque son etiquetas que el usuario
 * teclea (`use:recamara`) y que viajan al DXF; el acento vive en la etiqueta
 * que se muestra, y el clasificador pliega acentos para que `use:recámara`
 * funcione igual.
 */
export type CadRoomUseType =
  // Locales de arquitectura: lo que dibuja un despacho mexicano.
  | "recamara"
  | "bano"
  | "medio-bano"
  | "cocina"
  | "sala"
  | "comedor"
  | "estudio"
  | "cochera"
  | "patio"
  | "jardin"
  | "azotea"
  | "pasillo"
  | "vestibulo"
  | "bodega"
  | "cuarto-servicio"
  | "lavado"
  // Herencia de las líneas de producción: se conserva íntegra.
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
  recamara: "Recámara",
  bano: "Baño",
  "medio-bano": "Medio baño",
  cocina: "Cocina",
  sala: "Sala",
  comedor: "Comedor",
  estudio: "Estudio",
  cochera: "Cochera",
  patio: "Patio",
  jardin: "Jardín",
  azotea: "Azotea",
  pasillo: "Pasillo",
  vestibulo: "Vestíbulo",
  bodega: "Bodega",
  "cuarto-servicio": "Cuarto de servicio",
  lavado: "Cuarto de lavado",
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

/**
 * Pliega acentos y eñes: «recámara» y «recamara» son la misma palabra, y
 * «baño» y «bano» también. Sin esto, el clasificador sólo entendía a quien
 * escribiera sin acentos — es decir, a casi nadie que escriba en español.
 */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Lo que el usuario ESCRIBE en `use:` → la clave canónica.
 *
 * Existe para que una etiqueta explícita se resuelva por igualdad y no por
 * búsqueda de subcadenas dentro de todo el texto del objeto. Un cuarto
 * etiquetado `use:smt` cuyo nombre fuese «Almacén SMT» dependía del ORDEN de
 * los `includes` para acabar en `smt` o en `warehouse`; cuando el usuario ha
 * dicho explícitamente qué es, no hay nada que adivinar.
 */
const ROOM_USE_ALIASES = new Map<string, CadRoomUseType>([
  ["recamara", "recamara"], ["dormitorio", "recamara"], ["habitacion", "recamara"],
  ["bano", "bano"], ["banio", "bano"], ["wc", "bano"], ["sanitario", "bano"],
  ["medio-bano", "medio-bano"], ["medio bano", "medio-bano"], ["medio-banio", "medio-bano"],
  ["cocina", "cocina"],
  ["sala", "sala"], ["estancia", "sala"], ["living", "sala"],
  ["comedor", "comedor"],
  ["estudio", "estudio"], ["despacho", "estudio"], ["biblioteca", "estudio"],
  ["cochera", "cochera"], ["garage", "cochera"], ["garaje", "cochera"], ["estacionamiento", "cochera"],
  ["patio", "patio"],
  ["jardin", "jardin"],
  ["azotea", "azotea"], ["roof-garden", "azotea"],
  ["pasillo", "pasillo"], ["corredor", "pasillo"], ["circulacion", "pasillo"],
  ["vestibulo", "vestibulo"], ["recibidor", "vestibulo"], ["hall", "vestibulo"],
  ["bodega", "bodega"], ["trastero", "bodega"],
  ["cuarto-servicio", "cuarto-servicio"], ["cuarto de servicio", "cuarto-servicio"], ["servicio", "cuarto-servicio"],
  ["lavado", "lavado"], ["cuarto de lavado", "lavado"], ["lavanderia", "lavado"],
  ["smt", "smt"], ["assembly", "assembly"], ["ensamble", "assembly"],
  ["test", "test"], ["prueba", "test"], ["quality", "quality"], ["calidad", "quality"], ["qc", "quality"],
  ["warehouse", "warehouse"], ["almacen", "warehouse"],
  ["packing", "packing"], ["empaque", "packing"],
  ["shipping", "shipping"], ["embarque", "shipping"],
  ["office", "office"], ["oficina", "office"],
  ["ehs", "ehs"], ["safety", "ehs"],
  ["utility", "utility"], ["utilidad", "utility"],
]);

/**
 * Adivinanza por TEXTO, sólo cuando no hay etiqueta explícita.
 *
 * Los locales de arquitectura van primero porque son el mercado del producto:
 * un «Comedor industrial» de una nave es antes un comedor que un cuarto sin
 * clasificar. El bloque industrial sigue intacto detrás, así que ningún cuarto
 * que hoy se clasifica deja de hacerlo — ninguna de sus palabras clave contiene
 * a ninguna de las de arriba ni al revés.
 */
const ROOM_USE_TEXT_RULES: Array<[readonly string[], CadRoomUseType]> = [
  [["medio bano", "medio-bano", "1/2 bano"], "medio-bano"],
  [["cuarto de servicio", "cuarto-servicio"], "cuarto-servicio"],
  [["cuarto de lavado", "lavanderia", "lavado"], "lavado"],
  [["recamara", "dormitorio", "habitacion"], "recamara"],
  [["bano", "sanitario", "wc"], "bano"],
  [["cocina", "cocineta"], "cocina"],
  [["cochera", "garaje", "garage", "estacionamiento"], "cochera"],
  [["comedor"], "comedor"],
  [["sala", "estancia"], "sala"],
  [["estudio", "biblioteca"], "estudio"],
  [["vestibulo", "recibidor"], "vestibulo"],
  [["pasillo", "corredor"], "pasillo"],
  [["patio"], "patio"],
  [["jardin"], "jardin"],
  [["azotea", "roof garden"], "azotea"],
  [["bodega", "trastero"], "bodega"],
  [["smt"], "smt"],
  [["assembly", "ensamble"], "assembly"],
  [["test", "prueba"], "test"],
  [["quality", "calidad", "qc"], "quality"],
  [["warehouse", "almacen", "store"], "warehouse"],
  [["packing", "empaque"], "packing"],
  [["shipping", "embarque"], "shipping"],
  [["office", "oficina"], "office"],
  [["ehs", "safety"], "ehs"],
  [["utility", "utilities", "utilidad"], "utility"],
];

export function roomUseTypeFromTags(
  tagsValue: CadArchitectureObjectInput["tags"],
  label = "",
): CadRoomUseType {
  const tags = normalizedTags(tagsValue);
  const explicit = prefixedTag(tags, ["use:", "room-use:"]);
  // Lo dicho a propósito manda sobre lo adivinado.
  if (explicit) {
    const exact = ROOM_USE_ALIASES.get(fold(explicit));
    if (exact) return exact;
  }
  const text = fold(`${explicit ?? ""} ${tags.join(" ")} ${label}`);
  for (const [needles, use] of ROOM_USE_TEXT_RULES)
    if (needles.some((needle) => text.includes(needle))) return use;
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
  if (kind === "path" || hasAnyTag(tags, ["aisle", "circulation", "pedestrian"])) return "aisles";
  if (SAFETY_KINDS.has(kind) || hasAnyTag(tags, ["safety", "no-go", "restricted", "emergency", "esd"])) return "safety";
  // Biblioteca de símbolos como fuente de verdad (VD-CAD-LAYER-001): una
  // puerta colocada por el copiloto va a Arquitectura, no a Equipos — igual
  // en el DXF que se abre en AutoCAD. Los tags especiales de arriba ganan.
  const symbol = getCadSymbol(kind);
  if (symbol) return SYMBOL_CATEGORY_LAYERS[symbol.category] ?? "equipment";
  return "equipment";
}

/** Capa CAD por categoría de símbolo; lo no mapeado cae a equipment. */
const SYMBOL_CATEGORY_LAYERS: Partial<Record<string, CadLayerId>> = {
  architecture: "architecture",
  safety: "safety",
};

export function describeCadArchitectureObject(
  object: CadArchitectureObjectInput,
): CadArchitectureObjectSummary | null {
  const layerId = object.layerId ?? defaultCadLayerForAssetKind(object.kind, object.tags);
  const warnings: string[] = [];
  const area = areaOf(object);
  const length = Math.max(object.width, object.height);
  const thickness = Math.min(object.width, object.height);

  if (object.kind === "wall") {
    if (layerId !== "architecture") warnings.push("El muro no está en la capa de Arquitectura.");
    if (thickness <= 0) warnings.push("El espesor del muro no es válido.");
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
    if (layerId !== "structure") warnings.push("La columna no está en la capa de Estructura.");
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
    if (layerId !== "architecture") warnings.push("La puerta no está en la capa de Arquitectura.");
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
    if (roomUse === "unclassified") warnings.push("Falta el uso del local; etiquétalo con use:recamara, use:bano, use:cocina, use:sala…");
    if (!object.label?.trim()) warnings.push("El local no tiene nombre visible en el plano.");
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
    if (layerId === "aisles" || asset.kind === "path" || hasAnyTag(tags, ["aisle", "circulation", "pedestrian"])) {
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
