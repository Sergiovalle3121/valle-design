/**
 * Primitivas de ESCRITURA de un fichero DXF: pares código/valor, saneado de
 * nombres y formato numérico.
 *
 * Salen de `dxf-export.ts` porque dejaron de ser suyas: los escritores de los
 * tipos del esquema 4 viven en su propio módulo y necesitan exactamente estas
 * seis funciones. Duplicarlas allí habría sido la manera segura de que el
 * formato numérico de un WIPEOUT y el de una LINE se separasen con el tiempo.
 *
 * Módulo HOJA: sólo importa TIPOS, así que puede importarlo cualquiera sin
 * cerrar un ciclo de carga.
 */
import type { CadDxfPoint } from "./dxf-import";
import type { CadEntityPresentation } from "./cad-document";

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
  // La cota se escribe de verdad (Ola C): antes era un "0" fijo y una LINE
  // vertical salía de longitud cero. `fmt(0)` sigue dando "0", así que los
  // ficheros planos no cambian ni un byte.
  pushPair(lines, 30, fmt(point.z ?? 0));
}

/**
 * Códigos comunes de presentación: 6 (tipo de línea), 48 (su escala) y 370
 * (grosor en centésimas de milímetro).
 *
 * Se emiten JUSTO detrás del código 8, que es donde los pone AutoCAD y donde
 * los espera cualquiera que lea el fichero de arriba abajo. Escribirlos al
 * final de la entidad habría sido menos código y habría funcionado con los
 * lectores que indexan por código; con una POLYLINE, cuyos vértices son
 * entidades VERTEX propias, habrían aterrizado sobre el SEQEND.
 *
 * `byLayer` NO se escribe: la ausencia del código 6 ya significa BYLAYER en el
 * formato, y emitir el literal engorda el fichero sin decir nada nuevo. Lo que
 * sí se escribe siempre que exista es la escala propia: es independiente del
 * origen del tipo de línea.
 */
export function pushPresentation(lines: string[], presentation?: CadEntityPresentation) {
  if (!presentation) return;
  const linetype = presentation.linetype;
  // `safeText` y no `safeLayerName`: el saneador de capas sustituye el vacío
  // por la capa "0", y un tipo de línea llamado "0" no existe. Un nombre que se
  // queda en nada se OMITE, que en el formato significa BYLAYER; inventarle un
  // nombre habría producido un fichero que referencia un LTYPE fantasma.
  const linetypeName = linetype?.value ? safeText(linetype.value) : "";
  if (linetype?.source === "explicit" && linetypeName) pushPair(lines, 6, linetypeName);
  else if (linetype?.source === "byBlock") pushPair(lines, 6, "BYBLOCK");
  if (typeof linetype?.scale === "number" && linetype.scale > 0)
    pushPair(lines, 48, fmt(linetype.scale));
  const lineweight = presentation.lineweight;
  if (lineweight?.source === "explicit" && typeof lineweight.value === "number")
    pushPair(lines, 370, Math.round(lineweight.value));
  else if (lineweight?.source === "byBlock") pushPair(lines, 370, -2);
}
