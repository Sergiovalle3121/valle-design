/**
 * Sabor R2004 (AC1018) de las variables de cabecera del capítulo 9.
 *
 * La SECUENCIA vive una sola vez en `ac1015-header-variables.ts` (el núcleo
 * compartido con los condicionales por sabor); este módulo aporta lo que es
 * EXCLUSIVO de R2004: el tipo del resultado y el lector de colores CmC 2004.
 *
 * CmC 2004 (hecho registrado, medido byte a byte en los 8 AC1018 del corpus):
 * BS de índice (siempre 0) + BL de color + RC de banderas de nombres. El BL
 * lleva el MÉTODO en su byte alto: 0xC0 = ByLayer (índice 256), 0xC1 =
 * ByBlock (índice 0), 0xC3 = índice ACI en los bits bajos. Un método RGB
 * verdadero (0xC2), un índice fuera del rango ACI o banderas de nombres de
 * color/libro son capacidad ausente de este modelo de índices — fallo cerrado
 * tipado, jamás un color inventado.
 */
import type {
  DwgBitReader,
  DwgColorReference,
  DwgHandleReference,
} from "../codecs/bitcodes.js";
import { throwDwgError } from "../security/parse-error.js";
import {
  decodeHeaderVariablesCore,
  type Ac1015HeaderHandles,
  type Ac1015HeaderVariables,
} from "./ac1015-header-variables.js";

/** El bloque de banderas RC de render/orden R2004+ (crudo, sin interpretar). */
export interface R2004HeaderRenderFlags {
  readonly sortents: number;
  readonly indexctl: number;
  readonly hidetext: number;
  readonly xclipframe: number;
  readonly dimassoc: number;
  readonly halogap: number;
  readonly obscuredcolor: number;
  readonly intersectioncolor: number;
  readonly obscuredltype: number;
  readonly intersectiondisplay: number;
  readonly projectname: readonly number[];
}

/**
 * La forma del NÚCLEO compartido del capítulo 9: la de R2000 con los campos
 * condicionales OPCIONALES. Cada sabor la estrecha — el núcleo construye
 * exactamente las claves de su sabor, así que el estrechamiento es un
 * contrato de presencia, no una mentira de tipos. Vive aquí (y no en el
 * módulo del núcleo) sólo por el presupuesto de monolito; es un tipo, así
 * que la importación cruzada se borra al compilar.
 */
export type CoreHeaderVariables = Omit<Ac1015HeaderVariables, "handles"> & {
  readonly handles: Omit<
    Ac1015HeaderHandles,
    "currentViewportEntityHeader" | "viewportEntityHeaderControl"
  > & {
    readonly currentViewportEntityHeader?: DwgHandleReference;
    readonly viewportEntityHeaderControl?: DwgHandleReference;
    readonly materialsDictionary?: DwgHandleReference;
    readonly colorsDictionary?: DwgHandleReference;
  };
  readonly undocumentedR2004Bit?: number;
  readonly unknownR2004Longs?: readonly [number, number, number];
  readonly unknownR2004TimeLongs?: readonly [number, number, number];
  readonly r2004RenderFlags?: R2004HeaderRenderFlags;
};

/**
 * Los handles del sabor R2004 (AC1018): sin el viewport pre-2004 ni el
 * control R13-R15, y CON los diccionarios MATERIALS y COLORS.
 */
export interface R2004HeaderHandles
  extends Omit<
    Ac1015HeaderHandles,
    "currentViewportEntityHeader" | "viewportEntityHeaderControl"
  > {
  readonly materialsDictionary: DwgHandleReference;
  readonly colorsDictionary: DwgHandleReference;
}

/**
 * Las variables de cabecera del sabor R2004 (AC1018): la secuencia R2000 con
 * los condicionales R2004+ del capítulo 9 y sus campos sin documentar CRUDOS.
 */
export interface R2004HeaderVariables
  extends Omit<Ac1015HeaderVariables, "handles"> {
  readonly handles: R2004HeaderHandles;
  /** El B sin documentar tras LIMCHECK, crudo. */
  readonly undocumentedR2004Bit: number;
  /** Los tres BL sin nombre tras PDMODE, crudos. */
  readonly unknownR2004Longs: readonly [number, number, number];
  /** Los tres BL sin nombre tras TDUPDATE, crudos. */
  readonly unknownR2004TimeLongs: readonly [number, number, number];
  /** El bloque RC SORTENTS…PROJECTNAME, crudo. */
  readonly r2004RenderFlags: R2004HeaderRenderFlags;
}

/**
 * Decodifica el payload de variables de cabecera del sabor R2004 (AC1018):
 * la MISMA secuencia del capítulo 9 con los condicionales R2004+ activados y
 * los colores en su forma CmC 2004.
 */
export function decodeR2004HeaderVariables(
  payload: Uint8Array,
): R2004HeaderVariables {
  return decodeHeaderVariablesCore(
    payload,
    true,
    readR2004HeaderColor,
  ) as R2004HeaderVariables;
}

/** Un CmC 2004 proyectado al índice del modelo neutral (fallo cerrado). */
export function readR2004HeaderColor(reader: DwgBitReader): DwgColorReference {
  reader.readBS();
  const rawColor = reader.readBL() >>> 0;
  const colorByte = reader.readRC();
  if (colorByte !== 0) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      Math.floor(reader.bitPosition / 8),
      "R2004 colors with color or book name strings are not modeled.",
    );
  }
  const method = (rawColor >>> 24) & 0xff;
  const low = rawColor & 0xffffff;
  if (method === 0xc0) return Object.freeze({ index: 256 });
  if (method === 0xc1) return Object.freeze({ index: 0 });
  if (method === 0xc3 && low <= 257) return Object.freeze({ index: low });
  throwDwgError(
    "DWG_VERSION_DECODER_UNSUPPORTED",
    "unsupported",
    Math.floor(reader.bitPosition / 8),
    "An R2004 color method outside the ACI index model is not decoded.",
  );
}
