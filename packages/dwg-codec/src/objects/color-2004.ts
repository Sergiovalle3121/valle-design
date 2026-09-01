/**
 * Proyección del color `CmC` de R2004+ al índice ACI — UN SOLO criterio.
 *
 * Desde R2004 un color deja de ser el `BS` de índice de R2000 y pasa a ser
 * TRES campos: `BS` de índice, `BL` de color empaquetado y `RC` de byte de
 * nombre. El byte alto del `BL` es el método (0xC0 ByLayer/256, 0xC1
 * ByBlock/0, 0xC3 índice ACI en los 24 bits bajos).
 *
 * POR QUÉ VIVE APARTE. Este criterio lo midió el adaptador AC1018 (8/8, 0
 * discrepancias) y lo necesita ahora, IGUAL, el lector de capas de R2010+.
 * Dos copias de una proyección de color es exactamente donde se colaría una
 * divergencia silenciosa entre caminos de versión: un archivo AC1018 y un
 * AC1032 del mismo dibujo devolviendo colores distintos sin que nada falle.
 * Se comparte el criterio, no se duplica.
 *
 * FALLO CERRADO. Un método fuera del modelo de índice, o un byte de nombre
 * distinto de cero (color por nombre de libro), es CAPACIDAD AUSENTE tipada
 * —`DWG_VERSION_DECODER_UNSUPPORTED`— y jamás un color inventado. Un color
 * plausible y equivocado es peor que ningún color: el llamador ya sabe
 * declarar la ausencia como pérdida.
 */
import { throwDwgError } from "../security/parse-error.js";

/** ByLayer proyectado al índice 256, tal como lo modela el camino R2000. */
export const R2004_COLOR_METHOD_BY_LAYER = 0xc0;
/** ByBlock proyectado al índice 0. */
export const R2004_COLOR_METHOD_BY_BLOCK = 0xc1;
/** Índice ACI explícito en los 24 bits bajos. */
export const R2004_COLOR_METHOD_INDEX = 0xc3;
/** Mayor índice ACI que el modelo R2000 admite (256 ByLayer, 257 ByBlock). */
const MAX_ACI_INDEX = 257;

/**
 * Proyecta el `BL` de color y el `RC` de nombre de un `CmC` R2004+ al índice
 * ACI del modelo neutral. `errorOffset` es el byte del cuerpo donde empieza
 * el color, para que el error apunte al sitio y no al principio del objeto.
 */
export function projectR2004ColorIndex(
  rawColor: number,
  colorByte: number,
  errorOffset: number,
): number {
  if (colorByte !== 0) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      errorOffset,
      "R2004 colors with color or book name strings are not modeled.",
    );
  }
  const method = (rawColor >>> 24) & 0xff;
  const low = rawColor & 0xffffff;
  if (method === R2004_COLOR_METHOD_BY_LAYER) return 256;
  if (method === R2004_COLOR_METHOD_BY_BLOCK) return 0;
  if (method === R2004_COLOR_METHOD_INDEX && low <= MAX_ACI_INDEX) return low;
  throwDwgError(
    "DWG_VERSION_DECODER_UNSUPPORTED",
    "unsupported",
    errorOffset,
    "An R2004 color method outside the ACI index model is not decoded.",
  );
}
