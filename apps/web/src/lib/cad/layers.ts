export type CadLayerId =
  | "layout"
  | "equipment"
  | "flow"
  | "aisles"
  | "measurements"
  | "safety";

export interface CadLayer {
  id: CadLayerId;
  label: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

export type CadLayerAssignments = Record<string, CadLayerId>;
export type CadLayerCounts = Partial<Record<CadLayerId, number>>;

export interface CadLayerStateSummary {
  total: number;
  visible: number;
  hidden: number;
  locked: number;
  objectCount: number;
  hiddenObjectCount: number;
  lockedObjectCount: number;
}

export const DEFAULT_CAD_LAYERS: CadLayer[] = [
  {
    id: "layout",
    label: "Layout",
    color: "#38bdf8",
    visible: true,
    locked: false,
  },
  {
    id: "equipment",
    label: "Equipment",
    color: "#a78bfa",
    visible: true,
    locked: false,
  },
  { id: "flow", label: "Flow", color: "#34d399", visible: true, locked: false },
  {
    id: "aisles",
    label: "Aisles",
    color: "#fbbf24",
    visible: true,
    locked: false,
  },
  {
    id: "measurements",
    label: "Measurements",
    color: "#f472b6",
    visible: true,
    locked: false,
  },
  {
    id: "safety",
    label: "Safety",
    color: "#fb7185",
    visible: true,
    locked: false,
  },
];

export function toggleCadLayerVisible(
  layers: CadLayer[],
  id: CadLayerId,
): CadLayer[] {
  return layers.map((layer) =>
    layer.id === id ? { ...layer, visible: !layer.visible } : layer,
  );
}

export function toggleCadLayerLocked(
  layers: CadLayer[],
  id: CadLayerId,
): CadLayer[] {
  return layers.map((layer) =>
    layer.id === id ? { ...layer, locked: !layer.locked } : layer,
  );
}

export function isolateCadLayerVisibility(
  layers: CadLayer[],
  id: CadLayerId,
): CadLayer[] {
  return layers.map((layer) => ({ ...layer, visible: layer.id === id }));
}

export function showAllCadLayers(layers: CadLayer[]): CadLayer[] {
  return layers.map((layer) => ({ ...layer, visible: true }));
}

export function summarizeCadLayers(
  layers: CadLayer[],
  counts: CadLayerCounts = {},
): CadLayerStateSummary {
  return layers.reduce<CadLayerStateSummary>(
    (summary, layer) => {
      const count = counts[layer.id] ?? 0;
      summary.objectCount += count;
      if (layer.visible) summary.visible += 1;
      else {
        summary.hidden += 1;
        summary.hiddenObjectCount += count;
      }
      if (layer.locked) {
        summary.locked += 1;
        summary.lockedObjectCount += count;
      }
      return summary;
    },
    {
      total: layers.length,
      visible: 0,
      hidden: 0,
      locked: 0,
      objectCount: 0,
      hiddenObjectCount: 0,
      lockedObjectCount: 0,
    },
  );
}

export function assignObjectsToLayer(
  assignments: CadLayerAssignments,
  objectIds: string[],
  layerId: CadLayerId,
): CadLayerAssignments {
  const next = { ...assignments };
  for (const id of objectIds) next[id] = layerId;
  return next;
}

export function layerForObject(
  assignments: CadLayerAssignments,
  objectId: string,
  fallback: CadLayerId,
): CadLayerId {
  return assignments[objectId] ?? fallback;
}

export function isLayerLocked(layers: CadLayer[], id: CadLayerId): boolean {
  return !!layers.find((layer) => layer.id === id)?.locked;
}

export function isLayerVisible(layers: CadLayer[], id: CadLayerId): boolean {
  return layers.find((layer) => layer.id === id)?.visible ?? true;
}

export function isObjectLayerLocked(
  layers: CadLayer[],
  assignments: CadLayerAssignments,
  objectId: string,
  fallback: CadLayerId,
): boolean {
  return isLayerLocked(layers, layerForObject(assignments, objectId, fallback));
}

export function editableObjectIds(
  layers: CadLayer[],
  assignments: CadLayerAssignments,
  objects: Array<{ id: string; fallbackLayer: CadLayerId }>,
): string[] {
  return objects
    .filter(
      (object) =>
        !isObjectLayerLocked(
          layers,
          assignments,
          object.id,
          object.fallbackLayer,
        ),
    )
    .map((object) => object.id);
}
