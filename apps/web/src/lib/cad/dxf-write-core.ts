/**
 * Primitivas de ESCRITURA de un fichero DXF: pares código/valor, saneado de
 * nombres y formato numérico.
 *
 * Salen de `dxf-export.ts` porque dejaron de ser suyas: los escritores de los
 * tipos del esquema 4 viven en su propio módulo y necesitan exactamente estas
 * seis funciones. Duplicarlas allí habría sido la manera segura de que el
 * formato numérico de un WIPEOUT y el de una LINE se separasen con el tiempo.
 *
 * Módulo HOJA: no importa ningún otro módulo del CAD, así que puede importarlo
 * cualquiera sin cerrar un ciclo de carga.
 */
import type { CadDxfPoint } from "./dxf-import";

export const DEFAULT_LAYER = "0";
export const MEASUREMENT_LAYER = "Measurements";
export const TEXT_LAYER = "Text";

export function safeLayerName(name: string | undefined): string {
  const cleaned = (name || DEFAULT_LAYER).trim().replace(/[\r\n]/g, " ");
  return cleaned || DEFAULT_LAYER;
}

export function safeText(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

export function safeStyleName(value: string | undefined): string {
  return safeText(value ?? "Standard").replace(/[<>/\\"':;?*|=`,]/g, "_").slice(0, 64) || "Standard";
}

export function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(6)).toString();
}

export function pushPair(
  lines: string[],
  code: number | string,
  value: number | string,
) {
  lines.push(String(code), String(value));
}

export function pushPoint(lines: string[], point: CadDxfPoint) {
  pushPair(lines, 10, fmt(point.x));
  pushPair(lines, 20, fmt(point.y));
  pushPair(lines, 30, "0");
}
