/**
 * EL CUADRO DE INSTALACIONES: longitudes por servicio y equipos por símbolo
 * (Ola F, 2026-09-02; medido en tres dimensiones desde la Ola G, 2026-09-04).
 *
 * Se lee del documento tal como está, y por UN solo lector (`mep-runs.ts`):
 * cada LINE o POLYLINE en una capa de servicio suma su longitud a ese
 * servicio, agrupada por diámetro o ancho cuando la orden lo dejó en
 * `context.metadata` (una tubería dibujada a mano en IH-AF cuenta igual, sin
 * diámetro); los contornos a doble línea de ducto y charola NO se cuentan
 * (miden el perímetro, no el tramo): cuenta su eje. Cada INSERT de un bloque
 * `MEP-…` se cuenta por símbolo.
 *
 * ## Lo que la Ola G corrigió, y era un defecto de cantidad
 *
 * La longitud se mide EN TRES DIMENSIONES. Antes se medía en planta y un
 * MONTANTE —el tramo vertical que baja del plafón al mueble— contaba cero
 * metros: el cuadro entregaba menos tubo del que el plano dibuja, y el número
 * que faltaba no dejaba hueco. Además cada renglón dice ahora cuánto de esa
 * longitud es VERTICAL y cuántos CODOS implica su geometría, que son las dos
 * partidas que un instalador cotiza aparte y que hasta ahora había que contar
 * a mano sobre el papel.
 *
 * Es el mismo criterio que `bim-schedule.ts` con los muros: lo que está
 * dibujado se cuenta, lo que está anotado se cree, y el cuadro dice de dónde
 * sale cada número.
 */
import type { CadCommandDocumentView } from "./engine/command-types";
import { cadMepElbows, cadMepRisers, cadPathLength, type CadMepKind, type CadMepService } from "./engine/commands/mep-support";
import { cadMepRunsOf } from "./mep-runs";
import { CAD_MEP_SYMBOLS } from "./mep-symbols";

export interface CadMepRunRow {
  service: CadMepService;
  kind: CadMepKind;
  /** Diámetro nominal en mm (tubería) o ancho en unidades del documento; `null` si nadie lo dijo. */
  size: number | null;
  /** Longitud total en unidades del documento, medida en tres dimensiones. */
  length: number;
  segments: number;
  /** Cuánto de `length` es vertical: los montantes. Parte del total, dicha aparte. */
  rise: number;
  /** Cuántos montantes son. Un montante son dos codos y un soporte, y se cotiza. */
  risers: number;
  /** Codos que la geometría implica: un vértice donde la corrida gira es un codo. */
  elbows: number;
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

/** Longitudes por servicio y tamaño, y equipos por símbolo. */
export function buildCadMepSchedule(view: View): CadMepSchedule {
  const runs = new Map<string, CadMepRunRow>();
  const devices = new Map<string, CadMepDeviceRow>();
  for (const entity of view.entities) {
    if (entity.type !== "insert") continue;
    const symbol = CAD_MEP_SYMBOLS.find((candidate) => candidate.id === entity.block);
    const block = view.blocks.find((candidate) => candidate.id === entity.block);
    if (!symbol && !(block && block.id.toUpperCase().startsWith("MEP-"))) continue;
    const row = devices.get(entity.block) ?? { blockId: entity.block, name: symbol?.name ?? block?.name ?? entity.block, layer: layerNameOf(view, entity.layer), count: 0 };
    row.count += 1;
    devices.set(entity.block, row);
  }
  for (const run of cadMepRunsOf(view)) {
    const key = `${run.service.id} ${run.size ?? ""}`;
    const row = runs.get(key) ?? { service: run.service, kind: run.kind, size: run.size, length: 0, segments: 0, rise: 0, risers: 0, elbows: 0 };
    const montantes = cadMepRisers(run.points);
    row.length += cadPathLength(run.points);
    row.segments += Math.max(0, run.points.length - 1);
    row.rise += montantes.rise;
    row.risers += montantes.count;
    row.elbows += cadMepElbows(run.points);
    runs.set(key, row);
  }
  const order = (row: CadMepRunRow) => `${row.kind}|${row.service.id}|${String(row.size ?? 0).padStart(8, "0")}`;
  return {
    runs: [...runs.values()].sort((a, b) => order(a).localeCompare(order(b))),
    devices: [...devices.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
