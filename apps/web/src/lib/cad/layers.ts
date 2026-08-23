/** Canonical layer ids are user-defined strings; defaults remain exported below. */
export type CadLayerId = string;

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

/**
 * LA CAPA ACTIVA AL ABRIR UN DIBUJO.
 *
 * Era `equipment`, herencia del planificador de plantas del que nació el
 * producto: allí lo primero que hacías era colocar equipo. En un CAD universal
 * es un error visible y caro. Se midió sobre el plano de ejemplo de la portada,
 * dibujado con los comandos reales: los seis muros, las cuatro ventanas, el
 * sombreado del baño y los tres rótulos de local acababan TODOS en la capa
 * `Equipment`. Una planta arquitectónica entera en la capa de equipamiento es
 * un plano que no se puede publicar por capas, que es media razón para usar un
 * CAD. Y la barra de estado lo anunciaba —«Layer Equipment»— en cada captura.
 *
 * `layout` es la capa neutra y general del juego de fábrica, la primera de la
 * lista y el equivalente de la capa 0 de AutoCAD: el sitio correcto para lo que
 * se dibuja antes de haber elegido capa.
 *
 * NO se toca el NOMBRE de ninguna capa. `Equipment` viaja dentro de los DXF que
 * los clientes ya exportaron (`cadStarterLayers` escribe `name: item.label`) y
 * además es vocabulario de dibujo legítimo: el estándar AIA nombra `A-EQPM` la
 * capa de equipamiento de una planta. Lo que cambia es cuál está ACTIVA.
 */
export const DEFAULT_ACTIVE_CAD_LAYER: CadLayerId = "layout";

export const DEFAULT_CAD_LAYERS: CadLayer[] = [
  {
    id: "layout",
    label: "Layout",
    color: "#38bdf8",
    visible: true,
    locked: false,
  },
  {
    id: "architecture",
    label: "Architecture",
    color: "#64748b",
    visible: true,
    locked: false,
  },
  {
    id: "structure",
    label: "Structure",
    color: "#475569",
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
  {
    id: "utilities",
    label: "Utilities",
    color: "#0ea5e9",
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

export function unlockAllCadLayers(layers: CadLayer[]): CadLayer[] {
  return layers.map((layer) => ({ ...layer, locked: false }));
}

export function hideEmptyCadLayers(
  layers: CadLayer[],
  counts: CadLayerCounts = {},
): CadLayer[] {
  return layers.map((layer) => ({
    ...layer,
    visible: (counts[layer.id] ?? 0) > 0,
  }));
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
