/**
 * Writer de la tabla de bloques R2000 — fase D4 (espejo de `table-block.ts`).
 *
 * Emite los cuerpos COMPLETOS del BLOCK_RECORD, de su CONTROL y de las
 * entidades BLOCK/ENDBLK, válidos para la envoltura D1, de modo que un
 * contenedor del writer pueda llevar un bloque CON CONTENIDO: el registro con
 * su nombre, el par BLOCK/ENDBLK que lo abre y lo cierra, y N entidades cuyo
 * flujo de handles abre con el registro como propietario (modo 0 — así es
 * como el lector de la base resuelve la pertenencia).
 *
 * Flujos de handles, confesadamente mínimos y contabilizados por el lector:
 * - BLOCK_RECORD: propietario (el control, código 4) o nulo, xdictionary
 *   nulo, y los punteros a la entidad BLOCK, primera entidad, última entidad
 *   y ENDBLK como referencias absolutas (código 5) o nulas cuando faltan.
 *   El ORDEN de ese flujo es una disposición de LABORATORIO declarada en el
 *   worklog (el lector lo contabiliza sin interpretarlo); los punteros
 *   primera/última quedan registrados como hecho con certeza MEDIA.
 * - CONTROL: el emisor genérico de controles con DOS nulos finales — los
 *   registros de model y paper space que el formato lleva fuera del recuento
 *   (hecho registrado, certeza MEDIA) como placeholders confesos.
 * - BLOCK/ENDBLK: propietario (el registro, código 4), xdictionary y capa
 *   nulos — el MISMO común de entidad del writer de entidades.
 *
 * Reglas del laboratorio: determinista, fallo cerrado ante specs imposibles,
 * cero dependencias y NINGUNA constante gemela — códigos de tipo, común de
 * entidad, común de tabla y composición vienen de los MISMOS módulos que usa
 * el lector. Hechos de ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER);
 * implementación original; certezas y pendientes en DWG0_WORKLOG.
 */
import { isFiniteDwgPoint3, type DwgPoint3 } from "../model/entity-geometry.js";
import {
  AC1015_TYPE_BLOCK,
  AC1015_TYPE_BLOCK_CONTROL,
  AC1015_TYPE_BLOCK_HEADER,
  AC1015_TYPE_ENDBLK,
} from "../objects/table-block.js";
import { throwDwgError } from "../security/parse-error.js";
import {
  composeAc1015ObjectBody,
  DwgBitEmitter,
  emitAc1015EntityCommonTail,
} from "./ac1015-entity-writer.js";
import {
  AC1015_TABLE_WRITER_MAX_NAME_BYTES,
  emitAc1015TableObjectCommonTail,
  writeAc1015TableControlBody,
} from "./ac1015-table-writer.js";

/**
 * Especificación de un BLOCK_RECORD mínimo. El nombre son BYTES en la página
 * de códigos del dibujo; los handles opcionales alimentan el flujo final
 * (ausente = nulo confeso). Banderas de xref/anónimo y previsualización no
 * se emiten en esta fase: viajan a cero.
 */
export interface Ac1015BlockRecordWriteSpec {
  readonly name: readonly number[];
  /** Punto base del bloque. Por defecto, el origen. */
  readonly basePoint?: DwgPoint3;
  /** Handle del CONTROL propietario; ausente = nulo confeso. */
  readonly ownerControlHandle?: number;
  /** Handle de la entidad BLOCK que abre el contenido. */
  readonly blockEntityHandle?: number;
  /** Handle de la primera entidad del bloque (hecho con certeza MEDIA). */
  readonly firstEntityHandle?: number;
  /** Handle de la última entidad del bloque (hecho con certeza MEDIA). */
  readonly lastEntityHandle?: number;
  /** Handle de la entidad ENDBLK que cierra el contenido. */
  readonly endblkHandle?: number;
}

/** Especificación del CONTROL de la tabla de bloques. */
export interface Ac1015BlockControlWriteSpec {
  readonly entryHandles: readonly number[];
}

/** Especificación de la entidad BLOCK: su nombre y su registro propietario. */
export interface Ac1015BlockBeginWriteSpec {
  readonly name: readonly number[];
  readonly ownerBlockHandle: number;
}

/** Especificación de la entidad ENDBLK: sólo su registro propietario. */
export interface Ac1015BlockEndWriteSpec {
  readonly ownerBlockHandle: number;
}

/**
 * Emite el cuerpo completo de un BLOCK_RECORD con el handle propio dado. El
 * resultado es exactamente lo que `decodeAc1015BlockRecordBody` espera.
 */
export function writeAc1015BlockRecordBody(
  spec: Ac1015BlockRecordWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertPositiveHandle(ownHandle, "A block record handle");
  assertNameBytes(spec.name, "A block record name");
  const basePoint = spec.basePoint ?? Object.freeze({ x: 0, y: 0, z: 0 });
  if (!isFiniteDwgPoint3(basePoint)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A block base point must be a finite 3D point.",
    );
  }
  const streamHandles = [
    spec.ownerControlHandle,
    spec.blockEntityHandle,
    spec.firstEntityHandle,
    spec.lastEntityHandle,
    spec.endblkHandle,
  ].map((handle) => assertOptionalHandle(handle, "A block record pointer"));

  const tail = new DwgBitEmitter();
  emitAc1015TableObjectCommonTail(tail, ownHandle);
  tail.emitTV(spec.name); // valida cada byte 0–255
  tail.pushBit(0); // sin referencia externa
  tail.emitBS(0); // índice de xref más uno: sin xref
  tail.pushBit(0); // no dependiente de xref
  tail.pushBit(0); // no anónimo
  tail.pushBit(0); // sin ATTDEFs
  tail.pushBit(0); // no es xref
  tail.pushBit(0); // no es xref superpuesto
  tail.emitBD(basePoint.x);
  tail.emitBD(basePoint.y);
  tail.emitBD(basePoint.z);
  tail.emitTV([]); // ruta de xref vacía
  tail.emitRC(0); // secuencia de recuentos de inserción: sólo el terminador
  tail.emitTV([]); // descripción vacía
  tail.emitBL(0); // sin datos de previsualización

  // El flujo final: propietario con código 4 (decisión de laboratorio; el
  // lector acepta 2–5 como absolutas), xdictionary nulo y los cuatro
  // punteros del bloque con código 5 o nulos — disposición de LABORATORIO
  // declarada (el lector la contabiliza sin interpretarla aún).
  const [owner, blockEntity, firstEntity, lastEntity, endblk] = streamHandles;
  return composeAc1015ObjectBody(AC1015_TYPE_BLOCK_HEADER, tail, (stream) => {
    emitAbsoluteOrNull(stream, 4, owner);
    stream.emitH(0, 0); // xdictionary nulo
    emitAbsoluteOrNull(stream, 5, blockEntity);
    emitAbsoluteOrNull(stream, 5, firstEntity);
    emitAbsoluteOrNull(stream, 5, lastEntity);
    emitAbsoluteOrNull(stream, 5, endblk);
  });
}

/**
 * Emite el CONTROL de la tabla de bloques: el emisor genérico de controles
 * con dos nulos finales (model y paper space fuera del recuento).
 */
export function writeAc1015BlockControlBody(
  spec: Ac1015BlockControlWriteSpec,
  ownHandle: number,
): Uint8Array {
  return writeAc1015TableControlBody(
    AC1015_TYPE_BLOCK_CONTROL,
    spec.entryHandles,
    ownHandle,
    2,
  );
}

/**
 * Emite la entidad BLOCK que abre el contenido de un bloque: común de
 * entidad en modo 0 (propietario en el flujo) + nombre TV.
 */
export function writeAc1015BlockBeginBody(
  spec: Ac1015BlockBeginWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertPositiveHandle(ownHandle, "A block begin handle");
  assertPositiveHandle(spec.ownerBlockHandle, "A block begin owner handle");
  assertNameBytes(spec.name, "A block begin name");

  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, ownHandle, true);
  tail.emitTV(spec.name);
  return composeAc1015ObjectBody(AC1015_TYPE_BLOCK, tail, (stream) => {
    stream.emitH(4, spec.ownerBlockHandle); // propietario: el BLOCK_RECORD
    stream.emitH(0, 0); // xdictionary nulo
    stream.emitH(0, 0); // capa nula (placeholder confeso)
  });
}

/**
 * Emite la entidad ENDBLK que cierra el contenido de un bloque: sólo el
 * común de entidad en modo 0 — el formato no le da campos propios.
 */
export function writeAc1015BlockEndBody(
  spec: Ac1015BlockEndWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertPositiveHandle(ownHandle, "A block end handle");
  assertPositiveHandle(spec.ownerBlockHandle, "A block end owner handle");

  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, ownHandle, true);
  return composeAc1015ObjectBody(AC1015_TYPE_ENDBLK, tail, (stream) => {
    stream.emitH(4, spec.ownerBlockHandle);
    stream.emitH(0, 0); // xdictionary nulo
    stream.emitH(0, 0); // capa nula (placeholder confeso)
  });
}

/** Un puntero presente viaja absoluto con su código; ausente, nulo confeso. */
function emitAbsoluteOrNull(
  stream: DwgBitEmitter,
  code: number,
  handle: number | undefined,
): void {
  if (handle === undefined) {
    stream.emitH(0, 0);
  } else {
    stream.emitH(code, handle);
  }
}

function assertPositiveHandle(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      `${what} must be a positive safe integer.`,
    );
  }
}

function assertOptionalHandle(
  value: number | undefined,
  what: string,
): number | undefined {
  if (value === undefined) return undefined;
  assertPositiveHandle(value, what);
  return value;
}

function assertNameBytes(name: readonly number[], what: string): void {
  if (
    !Array.isArray(name) ||
    name.length < 1 ||
    name.length > AC1015_TABLE_WRITER_MAX_NAME_BYTES
  ) {
    // Un bloque sin nombre no es una entrada de tabla; el tope corto es una
    // decisión de laboratorio, no un hecho del formato.
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      `${what} needs between 1 and 255 byte values.`,
    );
  }
}
