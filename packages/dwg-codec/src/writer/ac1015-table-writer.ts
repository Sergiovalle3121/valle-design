/**
 * Writer de la tabla de capas R2000 — fase D3 (espejo de `table-layer.ts`).
 *
 * Emite los cuerpos COMPLETOS del objeto LAYER y de su objeto de CONTROL,
 * válidos para la envoltura D1 (`wrapAc1015ObjectBody`), de modo que un
 * contenedor del writer pueda llevar la tabla de capas mínima junto a las
 * entidades reales y el pipeline lector recupere nombre y color de la capa.
 *
 * El común de objeto que emite esta fase, campo a campo:
 * - handle propio con código 0 y bytes mínimos big-endian;
 * - EED vacío (tamaño BS = 0) — los objetos de tabla NO llevan gráfico de
 *   previsualización ni modo de entidad;
 * - 0 reactores.
 *
 * Flujos de handles finales, confesadamente mínimos y contabilizados por el
 * lector como tramo opaco:
 * - LAYER: propietario, xdictionary, bloque de referencia externa, plotstyle
 *   y tipo de línea NULOS — placeholders CONFESOS (resolver referencias entre
 *   objetos es de una fase posterior).
 * - CONTROL: propietario y xdictionary nulos, más un handle absoluto
 *   (código 2) por cada entrada declarada.
 *
 * Reglas del laboratorio: determinista (mismo spec y handle → mismos bits),
 * fallo cerrado ante specs imposibles, cero dependencias y NINGUNA constante
 * gemela — los códigos de tipo y el emisor de bits son los MISMOS que usa el
 * lector. Hechos de ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER);
 * implementación original; certezas y pendientes en DWG0_WORKLOG.
 */
import {
  AC1015_TYPE_LAYER,
  AC1015_TYPE_LAYER_CONTROL,
} from "../objects/table-layer.js";
import { throwDwgError } from "../security/parse-error.js";
import { composeAc1015ObjectBody, DwgBitEmitter } from "./ac1015-entity-writer.js";

/** Tope de bytes del nombre de una capa emitida: límite de LABORATORIO. */
export const AC1015_TABLE_WRITER_MAX_NAME_BYTES = 0xff;

/** Tope de entradas de un control emitido: límite de LABORATORIO. */
export const AC1015_TABLE_WRITER_MAX_ENTRIES = 4096;

/**
 * Especificación de una entrada LAYER mínima. El nombre son BYTES en la
 * página de códigos del dibujo (mismo contrato que el modelo del lector); el
 * color es el índice CmC R2000 y las banderas de estado viajan crudas.
 */
export interface Ac1015LayerWriteSpec {
  readonly name: readonly number[];
  /** Índice de color CmC (BS). Por defecto 7. */
  readonly colorIndex?: number;
  /** BS de estado crudo. Por defecto 0 (capa descongelada y desbloqueada). */
  readonly stateFlags?: number;
}

/** Especificación del objeto de CONTROL: los handles de sus entradas. */
export interface Ac1015LayerControlWriteSpec {
  readonly entryHandles: readonly number[];
}

/**
 * Emite el cuerpo completo de un objeto LAYER con el handle propio dado. El
 * resultado (tipo incluido) es exactamente lo que `decodeAc1015LayerBody`
 * espera y lo que `wrapAc1015ObjectBody` envuelve para el contenedor.
 */
export function writeAc1015LayerBody(
  spec: Ac1015LayerWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertOwnHandle(ownHandle);
  if (
    !Array.isArray(spec.name) ||
    spec.name.length < 1 ||
    spec.name.length > AC1015_TABLE_WRITER_MAX_NAME_BYTES
  ) {
    // Una capa sin nombre no es una entrada de tabla; el tope corto es una
    // decisión de laboratorio, no un hecho del formato.
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A layer name needs between 1 and 255 byte values.",
    );
  }
  const colorIndex = spec.colorIndex ?? 7;
  const stateFlags = spec.stateFlags ?? 0;
  for (const [what, value] of [
    ["color index", colorIndex],
    ["state flags", stateFlags],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        `A layer ${what} must fit in an unsigned 16-bit value.`,
      );
    }
  }

  const tail = new DwgBitEmitter();
  emitAc1015TableObjectCommonTail(tail, ownHandle);
  tail.emitTV(spec.name); // valida cada byte 0–255
  tail.pushBit(0); // sin referencia externa
  tail.emitBS(0); // índice de xref más uno: sin xref
  tail.pushBit(0); // no dependiente de xref
  tail.emitBS(stateFlags);
  tail.emitBS(colorIndex); // color CmC en su forma R2000: un índice BS

  // Flujo de handles: propietario, xdictionary, bloque de xref, plotstyle y
  // tipo de línea NULOS — placeholders confesos de esta fase.
  return composeAc1015ObjectBody(AC1015_TYPE_LAYER, tail, (stream) => {
    for (let index = 0; index < 5; index += 1) {
      stream.emitH(0, 0);
    }
  });
}

/**
 * Emite el cuerpo completo del objeto de CONTROL de la tabla de capas: el
 * común de objeto, su recuento de entradas BL y un flujo de handles con las
 * entradas como referencias absolutas (código 2).
 */
export function writeAc1015LayerControlBody(
  spec: Ac1015LayerControlWriteSpec,
  ownHandle: number,
): Uint8Array {
  return writeAc1015TableControlBody(
    AC1015_TYPE_LAYER_CONTROL,
    spec.entryHandles,
    ownHandle,
    0,
  );
}

/**
 * Emisor GENÉRICO de un objeto de control de tabla (fase D4): común de
 * objeto, recuento de entradas BL y flujo de handles con propietario y
 * xdictionary nulos, las entradas como referencias absolutas (código 2) y
 * `trailingNullHandles` nulos finales — los controles que declaran handles
 * extra fuera del recuento (la tabla de bloques con sus registros de model y
 * paper space) los llevan como placeholders CONFESOS. Un solo emisor para
 * todos los controles: cero gemelos.
 */
export function writeAc1015TableControlBody(
  type: number,
  entryHandles: readonly number[],
  ownHandle: number,
  trailingNullHandles: number,
): Uint8Array {
  assertOwnHandle(ownHandle);
  if (!Array.isArray(entryHandles)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A table control needs an array of entry handles.",
    );
  }
  if (entryHandles.length > AC1015_TABLE_WRITER_MAX_ENTRIES) {
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      0,
      "A table control exceeds the phase-D laboratory entry limit.",
    );
  }
  for (const handle of entryHandles) {
    if (!Number.isSafeInteger(handle) || handle < 1) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A table control entry handle must be a positive safe integer.",
      );
    }
  }
  if (
    !Number.isSafeInteger(trailingNullHandles) ||
    trailingNullHandles < 0 ||
    trailingNullHandles > 8
  ) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      0,
      "A table control writer received an impossible trailing-handle count.",
    );
  }

  const tail = new DwgBitEmitter();
  emitAc1015TableObjectCommonTail(tail, ownHandle);
  tail.emitBL(entryHandles.length);

  return composeAc1015ObjectBody(type, tail, (stream) => {
    stream.emitH(0, 0); // propietario nulo (placeholder confeso)
    stream.emitH(0, 0); // xdictionary nulo
    for (const handle of entryHandles) {
      stream.emitH(2, handle); // entrada como referencia absoluta
    }
    for (let index = 0; index < trailingNullHandles; index += 1) {
      stream.emitH(0, 0);
    }
  });
}

/**
 * El común mínimo de un objeto de tabla: H + EED vacío + 0 reactores.
 * Exportado desde la fase D4 para el writer de la tabla de bloques.
 */
export function emitAc1015TableObjectCommonTail(
  tail: DwgBitEmitter,
  ownHandle: number,
): void {
  tail.emitH(0, ownHandle);
  tail.emitBS(0); // EED vacío
  tail.emitBL(0); // cero reactores
}

function assertOwnHandle(ownHandle: number): void {
  if (!Number.isSafeInteger(ownHandle) || ownHandle < 1) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A table object handle must be a positive safe integer.",
    );
  }
}
