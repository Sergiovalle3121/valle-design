/**
 * EL CUADRO DE INSTALACIONES: longitudes por servicio y equipos por símbolo
 * (Ola F, 2026-09-02).
 *
 * Se lee del documento tal como está: cada LINE o POLYLINE en una capa de
 * servicio (`mep-support.ts`) suma su longitud a ese servicio, agrupada por
 * diámetro o ancho cuando la orden lo dejó en `context.metadata` (una tubería
 * dibujada a mano en IH-AF cuenta igual, sin diámetro); los contornos a doble
 * línea de ducto y charola NO se cuentan (miden el perímetro, no el tramo):
 * cuenta su eje. Cada INSERT de un bloque `MEP-…` se cuenta por símbolo.
 *
 * Es el mismo criterio que `bim-schedule.ts` con los muros: lo que está
 * dibujado se cuenta, lo que está anotado se cree, y el cuadro dice de dónde
 * sale cada número.
 */
import type { CadEntity, CadPoint2 } from "./cad-document";
import type { CadCommandDocumentView } from "./engine/command-types";
import { cadMepServiceFor, cadPathLength, type CadMepKind, type CadMepService } from "./engine/commands/mep-support";
import { CAD_MEP_SYMBOLS } from "./mep-symbols";

export interface CadMepRunRow {
  service: CadMepService;
  kind: CadMepKind;
  /** Diámetro nominal en mm (tubería) o ancho en unidades del documento; `null` si nadie lo dijo. */
  size: number | null;
  /** Longitud total en unidades del documento. */
  length: number;
  segments: number;
}

export interface CadMepDeviceRow {
  blockId: string;
  name: string;
  layer: string;
  count: number;
}

export interface CadMepSchedule {
  runs: CadMepRunRow[];
  devices: CadMepDeviceRow[];
}

type View = Pick<CadCommandDocumentView, "entities" | "layers" | "blocks">;

function layerNameOf(view: View, layerId: string): string {
  return view.layers.find((layer) => layer.id === layerId || layer.name === layerId)?.name ?? layerId;
}

function pathOf(entity: CadEntity): CadPoint2[] | null {
  if (entity.type === "line") return [entity.start, entity.end];
  if (entity.type === "polyline") return entity.vertices;
  return null;
}

/** Longitudes por servicio y tamaño, y equipos por símbolo. */
export function buildCadMepSchedule(view: View): CadMepSchedule {
  const runs = new Map<string, CadMepRunRow>();
  const devices = new Map<string, CadMepDeviceRow>();
  for (const entity of view.entities) {
    if (entity.type === "insert") {
      const symbol = CAD_MEP_SYMBOLS.find((candidate) => candidate.id === entity.block);
      const block = view.blocks.find((candidate) => candidate.id === entity.block);
      if (!symbol && !(block && block.id.toUpperCase().startsWith("MEP-"))) continue;
      const row = devices.get(entity.block) ?? { blockId: entity.block, name: symbol?.name ?? block?.name ?? entity.block, layer: layerNameOf(view, entity.layer), count: 0 };
      row.count += 1;
      devices.set(entity.block, row);
      continue;
    }
    const path = pathOf(entity);
    if (!path) continue;
    const metadata = entity.context?.metadata ?? {};
    if (metadata.outline === true) continue;
    const service = cadMepServiceFor(typeof metadata.service === "string" ? metadata.service : undefined) ?? cadMepServiceFor(layerNameOf(view, entity.layer));
    if (!service) continue;
    const size = typeof metadata.size === "number" ? metadata.size : null;
    const key = `${service.id} ${size ?? ""}`;
    const row = runs.get(key) ?? { service, kind: service.kind, size, length: 0, segments: 0 };
    row.length += cadPathLength(path);
    row.segments += Math.max(0, path.length - 1);
    runs.set(key, row);
  }
  const order = (row: CadMepRunRow) => `${row.kind}|${row.service.id}|${String(row.size ?? 0).padStart(8, "0")}`;
  return {
    runs: [...runs.values()].sort((a, b) => order(a).localeCompare(order(b))),
    devices: [...devices.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
