/**
 * Los writers de MLINESTYLE y LAYOUT.
 *
 * Viven aparte de `ac1015-structure-writers.ts` desde el 2026-09-01, cuando
 * enseñar al writer de LTYPE a emitir su patrón de trazos empujó aquel archivo
 * por encima del presupuesto de monolito. La costura no es arbitraria: ninguno
 * de estos dos es una ENTRADA DE TABLA —no llevan la cabeza común de entrada
 * ni viven bajo un objeto de control de tabla—, así que se van juntos y allá
 * quedan las entradas de tabla con su plomería compartida.
 */
import { AC1015_TYPE_MLINESTYLE } from "./ac1015-structure-writers.js";
import {
  assertHandle,
  assertName,
  emitRef,
  ref,
} from "./ac1015-structure-writers.js";
import { throwDwgError } from "../security/parse-error.js";
import { composeAc1015ObjectBody, DwgBitEmitter } from "./ac1015-entity-writer.js";

export interface Ac1015MlineStyleWriteSpec {
  readonly name: readonly number[];
  /** Handle del diccionario ACAD_MLINESTYLE dueño (y reactor). */
  readonly dictionaryHandle: number;
}

/**
 * Cuerpo del MLINESTYLE Standard medido (20.4.73): dos líneas a ±0.5 con
 * color ByLayer e índice de tipo de línea 32767, ángulos de 90 grados.
 */
export function writeAc1015MlineStyleBody(
  spec: Ac1015MlineStyleWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "A mlinestyle handle");
  assertHandle(spec.dictionaryHandle, "A mlinestyle dictionary handle");
  assertName(spec.name, "A mlinestyle name");

  const body = new DwgBitEmitter();
  body.emitH(0, ownHandle);
  body.emitBS(0); // EED vacío
  body.emitBL(1); // un reactor: el diccionario (forma medida)
  body.emitTV([...spec.name]);
  body.emitTV([]); // descripción vacía
  body.emitBS(0); // banderas
  body.emitBS(256); // color de relleno ByLayer
  body.emitBD(Math.PI / 2); // ángulo inicial (valor medido)
  body.emitBD(Math.PI / 2); // ángulo final (valor medido)
  body.emitRC(2); // dos líneas en el estilo
  for (const offset of [0.5, -0.5]) {
    body.emitBD(offset);
    body.emitBS(256); // color ByLayer
    body.emitBS(32767); // índice de tipo de línea (valor medido)
  }
  return composeAc1015ObjectBody(AC1015_TYPE_MLINESTYLE, body, (stream) => {
    emitRef(stream, ref(4, spec.dictionaryHandle));
    emitRef(stream, ref(4, spec.dictionaryHandle));
    emitRef(stream, ref(3, 0));
  });
}

// ---------------------------------------------------------------------------
// LAYOUT (clase) con los dos perfiles medidos: Model y Layout1.
// ---------------------------------------------------------------------------

export interface Ac1015LayoutWriteSpec {
  /** Código de clase del LAYOUT en ESTE archivo (500 + índice de clase). */
  readonly type: number;
  readonly name: readonly number[];
  readonly tabOrder: number;
  readonly layoutsDictionaryHandle: number;
  readonly blockRecordHandle: number;
  /**
   * Perfil de plot: "model" replica el del Model medido (papel Letter con
   * márgenes); "paper" el del Layout1 medido (dispositivo none_device sin
   * papel elegido).
   */
  readonly profile: "model" | "paper";
}

/** "none_device" en bytes ASCII (valor medido de ambos layouts del corpus). */
const NONE_DEVICE = Object.freeze([
  0x6e, 0x6f, 0x6e, 0x65, 0x5f, 0x64, 0x65, 0x76, 0x69, 0x63, 0x65,
]);

/** "Letter_(8.50_x_11.00_Inches)" en ASCII (papel medido del perfil model). */
const LETTER_PAPER = Object.freeze(
  [..."Letter_(8.50_x_11.00_Inches)"].map((c) => c.charCodeAt(0)),
);

/**
 * Cuerpo de un LAYOUT R2000 (20.4.84): la parte de plotsettings y la de
 * layout, campo a campo como el corpus, y el flujo
 * `H(4,dict) H(4,dict) H(3,0) H(4,blockRecord) H(4,0) H(5,0) H(5,0)`.
 */
export function writeAc1015LayoutBody(
  spec: Ac1015LayoutWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "A layout handle");
  assertHandle(spec.layoutsDictionaryHandle, "A layouts dictionary handle");
  assertHandle(spec.blockRecordHandle, "A layout block record handle");
  assertName(spec.name, "A layout name");
  if (!Number.isInteger(spec.type) || spec.type < 0 || spec.type > 0xffff) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A layout type must fit in an unsigned 16-bit value.",
    );
  }
  if (
    !Number.isSafeInteger(spec.tabOrder) ||
    spec.tabOrder < 0 ||
    (spec.profile !== "model" && spec.profile !== "paper")
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A layout needs a non-negative tab order and a known profile.",
    );
  }
  const model = spec.profile === "model";

  const body = new DwgBitEmitter();
  body.emitH(0, ownHandle);
  body.emitBS(0); // EED vacío
  body.emitBL(1); // un reactor: el diccionario de layouts (forma medida)
  // --- parte plotsettings (valores medidos por perfil) ---
  body.emitTV([]); // nombre de configuración de página
  body.emitTV([...NONE_DEVICE]); // impresora/configuración
  body.emitBS(model ? 1712 : 688); // banderas de plot
  for (const margin of model
    ? [6.35, 6.35, 6.35000508, 6.35000508]
    : [0, 0, 0, 0]) {
    body.emitBD(margin);
  }
  body.emitBD(model ? 215.89999999999998 : 0); // ancho de papel
  body.emitBD(model ? 279.4 : 0); // alto de papel
  body.emitTV(model ? [...LETTER_PAPER] : []);
  body.emitBD(0);
  body.emitBD(0); // origen de plot
  body.emitBS(0); // unidades de papel
  body.emitBS(0); // rotación de plot
  body.emitBS(model ? 0 : 5); // tipo de plot
  body.emitBD(0);
  body.emitBD(0); // ventana mínima
  body.emitBD(0);
  body.emitBD(0); // ventana máxima
  body.emitTV([]); // nombre de vista de plot (R2000)
  body.emitBD(1); // unidades reales
  body.emitBD(1); // unidades de dibujo
  body.emitTV([]); // hoja de estilos
  body.emitBS(model ? 0 : 16); // tipo de escala estándar
  body.emitBD(1); // factor de escala
  body.emitBD(0);
  body.emitBD(0); // origen de imagen de papel
  // --- parte layout (valores medidos) ---
  body.emitTV([...spec.name]);
  body.emitBL(spec.tabOrder);
  body.emitBS(1); // bandera del layout (valor medido)
  for (const value of [0, 0, 0]) body.emitBD(value); // origen UCS
  body.emitRD(0);
  body.emitRD(0); // límites mínimos
  body.emitRD(12);
  body.emitRD(9); // límites máximos (valores medidos)
  for (const value of [0, 0, 0]) body.emitBD(value); // punto de inserción
  body.emitBD(1);
  body.emitBD(0);
  body.emitBD(0); // eje X del UCS
  body.emitBD(0);
  body.emitBD(1);
  body.emitBD(0); // eje Y del UCS
  body.emitBD(0); // elevación
  body.emitBS(0); // tipo de vista ortográfica
  for (const value of [1e20, 1e20, 1e20]) body.emitBD(value); // extmin
  for (const value of [-1e20, -1e20, -1e20]) body.emitBD(value); // extmax
  return composeAc1015ObjectBody(spec.type, body, (stream) => {
    emitRef(stream, ref(4, spec.layoutsDictionaryHandle));
    emitRef(stream, ref(4, spec.layoutsDictionaryHandle));
    emitRef(stream, ref(3, 0));
    emitRef(stream, ref(4, spec.blockRecordHandle));
    emitRef(stream, ref(4, 0)); // último viewport activo: nulo
    emitRef(stream, ref(5, 0)); // UCS base
    emitRef(stream, ref(5, 0)); // UCS con nombre
  });
}
