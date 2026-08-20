/**
 * Tabla de bloques R2000 (AC1015) — fase D4: BLOCK_RECORD (BLOCK HEADER), su
 * CONTROL y las entidades estructurales BLOCK y ENDBLK.
 *
 * Un bloque del dibujo se compone de CUATRO piezas del formato: el objeto de
 * tabla BLOCK HEADER (aquí, BLOCK_RECORD) que le da nombre y punto base; el
 * objeto de CONTROL que enumera la tabla; y las entidades BLOCK/ENDBLK que
 * abren y cierran su contenido en el cuerpo del dibujo. Este módulo decodifica
 * las cuatro con los MISMOS criterios compartidos de `entity-common.ts` y
 * `table-layer.ts` — cero comunes ni cierres gemelos.
 *
 * Hechos registrados en SOURCE_REGISTER (ODA-ODS-DWG-5.4.1-PUBLIC): códigos
 * de tipo 0x04 BLOCK, 0x05 ENDBLK, 0x30 BLOCK CONTROL y 0x31 BLOCK HEADER;
 * la entrada BLOCK HEADER codifica nombre TV, campos de xref (bandera 64,
 * índice+1, dependencia), los bits de anónimo/tiene-ATTDEFs/es-xref/xref
 * superpuesto, punto base 3BD, ruta de xref TV, la secuencia RC de recuentos
 * de inserción terminada en 0, descripción TV y datos de previsualización con
 * tamaño BL; sus punteros a la entidad BLOCK, a la primera y última entidad
 * del bloque y al ENDBLK viajan en el flujo de handles final. La entidad
 * BLOCK lleva sólo su nombre TV tras el común de entidad; ENDBLK no lleva
 * campos propios.
 *
 * Intake 2026-08-20 (`VALLE-CORPUS-AC1015-INTAKE-DAE5E77`): los 18 BLOCK
 * HEADER reales del corpus DESMINTIERON esa disposición — entre el bit de
 * xref-superpuesto y el punto base viaja UN bit adicional (observado 0 en
 * los 18; sin él, el punto base decodifica (1,1,1) y el resto se desalinea
 * hasta salirse del cuerpo). El bit se lee y se expone CRUDO en el modelo
 * (`postXrefFlagsBit`): ninguna fuente registrada nombra su semántica. La
 * misma medición CONFIRMÓ con archivos reales el orden de los campos
 * restantes, los recuentos RC reales terminados en 0 y que el RL de tamaño
 * cuenta desde el primer bit del dato.
 *
 * Reglas del laboratorio:
 * - **Nada se ignora en silencio**: la previsualización se contabiliza como
 *   tramo opaco `graphic` y los flujos de handles como `handle-stream`; los
 *   punteros primera/última entidad quedan registrados como HECHO, no se
 *   interpretan — la pertenencia entidad→bloque la resuelve el lector de la
 *   base por el propietario del común (certeza declarada).
 * - **Fallo cerrado**: truncamientos, recuentos o tamaños que no caben y
 *   doubles no finitos → error tipado con su byte. Un tipo ajeno es
 *   capacidad ausente (`unsupported`), no corrupción.
 */
import { throwDwgError } from "../security/parse-error.js";
import type { DwgPoint3 } from "../model/entity-geometry.js";
import {
  assertHandleCountFits,
  finiteDecoded,
  frozenPoint3,
  readAc1015EntityCommon,
  readAc1015EntityHandleHead,
  type Ac1015EntityCommon,
  type Ac1015EntityHandleHead,
  type Ac1015OpaqueSpan,
} from "./entity-common.js";
import {
  assertAc1015ObjectBodyType,
  closeAc1015ObjectWithHandleStream,
  readAc1015TableObjectCommon,
  type Ac1015TableObjectCommon,
} from "./table-layer.js";

/** Códigos de tipo BS de la tabla de bloques (hechos registrados). */
export const AC1015_TYPE_BLOCK = 0x04;
export const AC1015_TYPE_ENDBLK = 0x05;
export const AC1015_TYPE_BLOCK_CONTROL = 0x30;
export const AC1015_TYPE_BLOCK_HEADER = 0x31;

/**
 * Una entrada BLOCK_RECORD en el modelo neutral mínimo. El nombre y las
 * cadenas son BYTES en la página de códigos del dibujo (contrato de `readTV`);
 * la previsualización sólo declara su longitud — sus bytes quedan
 * contabilizados opacos, no interpretados.
 */
export interface Ac1015BlockRecord {
  readonly name: readonly number[];
  readonly xrefRef: boolean;
  readonly xrefIndexPlusOne: number;
  readonly xrefDependent: boolean;
  readonly anonymous: boolean;
  readonly hasAttributeDefinitions: boolean;
  readonly isXref: boolean;
  readonly xrefOverlaid: boolean;
  /**
   * Bit CRUDO entre el bit de xref superpuesto y el punto base. El corpus
   * real lo exhibe (0 en los 18 BLOCK HEADER medidos) y ninguna fuente
   * registrada nombra su semántica: viaja sin interpretar, como el BS de
   * estado del LAYER (`VALLE-CORPUS-AC1015-INTAKE-DAE5E77`).
   */
  readonly postXrefFlagsBit: number;
  readonly basePoint: DwgPoint3;
  readonly xrefPath: readonly number[];
  /** Secuencia RC de recuentos de inserción, sin su terminador 0. */
  readonly insertCounts: readonly number[];
  readonly description: readonly number[];
  readonly previewByteLength: number;
}

/** Un BLOCK_RECORD decodificado por completo. */
export interface Ac1015DecodedBlockRecord {
  readonly common: Ac1015TableObjectCommon;
  readonly record: Ac1015BlockRecord;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/** El CONTROL de la tabla de bloques decodificado. */
export interface Ac1015DecodedBlockControl {
  readonly common: Ac1015TableObjectCommon;
  /** Cuántas entradas referencia; sus handles viven en el flujo opaco final. */
  readonly entryCount: number;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/** La entidad BLOCK decodificada: común de entidad + nombre + referencias. */
export interface Ac1015DecodedBlockBegin {
  readonly common: Ac1015EntityCommon;
  readonly name: readonly number[];
  readonly references: Ac1015EntityHandleHead;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/** La entidad ENDBLK decodificada: sólo común y referencias. */
export interface Ac1015DecodedBlockEnd {
  readonly common: Ac1015EntityCommon;
  readonly references: Ac1015EntityHandleHead;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/**
 * Decodifica el cuerpo COMPLETO de un objeto BLOCK_RECORD (BLOCK HEADER).
 * `bodyBytes` son los bytes exactos del dato de la envoltura D1 (tipo BS
 * incluido); los offsets de error son relativos a su inicio.
 */
export function decodeAc1015BlockRecordBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedBlockRecord {
  assertAc1015ObjectBodyType(bodyBytes, AC1015_TYPE_BLOCK_HEADER, "BLOCK_RECORD");

  const { common, reader, bodyBitLength, opaqueSpans } =
    readAc1015TableObjectCommon(bodyBytes);

  const name = copyTextBytes(reader.readTV().bytes);
  const xrefRef = reader.readB() === 1;
  const xrefIndexPlusOne = reader.readBS();
  const xrefDependent = reader.readB() === 1;
  const anonymous = reader.readB() === 1;
  const hasAttributeDefinitions = reader.readB() === 1;
  const isXref = reader.readB() === 1;
  const xrefOverlaid = reader.readB() === 1;
  // El bit adicional que el corpus real demostró aquí (hecho 2 del intake):
  // se lee para mantener la alineación y viaja crudo, sin interpretarse.
  const postXrefFlagsBit = reader.readB();
  const basePoint = frozenPoint3(
    finiteDecoded(reader, reader.readBD(), "a block base point"),
    finiteDecoded(reader, reader.readBD(), "a block base point"),
    finiteDecoded(reader, reader.readBD(), "a block base point"),
  );
  const xrefPath = copyTextBytes(reader.readTV().bytes);

  // La secuencia de recuentos de inserción: RC distintos de cero hasta un 0.
  // El propio cursor acotado la corta si se sale del cuerpo; el tamaño en
  // bits declarado la corta si miente.
  const insertCounts: number[] = [];
  for (;;) {
    const count = reader.readRC();
    if (count === 0) break;
    insertCounts.push(count);
  }

  const description = copyTextBytes(reader.readTV().bytes);

  // La previsualización no se interpreta: se recorre con presupuesto y queda
  // contabilizada como tramo opaco `graphic`, igual que en las entidades.
  const previewByteLength = reader.readBL();
  if (previewByteLength * 8 > reader.bitsRemaining) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "A block preview extends outside the object body.",
    );
  }
  if (previewByteLength > 0) {
    const startBit = reader.bitPosition;
    for (let index = 0; index < previewByteLength; index += 1) {
      reader.readRC();
    }
    opaqueSpans.push(
      Object.freeze({
        kind: "graphic" as const,
        startBit,
        bitLength: reader.bitPosition - startBit,
      }),
    );
  }

  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    opaqueSpans,
  );

  return Object.freeze({
    common,
    record: Object.freeze({
      name,
      xrefRef,
      xrefIndexPlusOne,
      xrefDependent,
      anonymous,
      hasAttributeDefinitions,
      isXref,
      xrefOverlaid,
      postXrefFlagsBit,
      basePoint,
      xrefPath,
      insertCounts: Object.freeze(insertCounts),
      description,
      previewByteLength,
    }),
    opaqueSpans: spans,
  });
}

/**
 * Decodifica el CONTROL de la tabla de bloques: mismo contrato que el de la
 * tabla de capas (recuento BL + handles contabilizados), con dos handles
 * adicionales declarados como hecho — los registros de model y paper space
 * viajan aparte del recuento (certeza MEDIA en el worklog).
 */
export function decodeAc1015BlockControlBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedBlockControl {
  assertAc1015ObjectBodyType(
    bodyBytes,
    AC1015_TYPE_BLOCK_CONTROL,
    "BLOCK CONTROL",
  );

  const { common, reader, bodyBitLength, opaqueSpans } =
    readAc1015TableObjectCommon(bodyBytes);

  const entryCount = reader.readBL();
  // Reactores Y entradas comparten el flujo final; cada handle ocupa al
  // menos un byte, así que la suma se cobra ANTES de recorrer o reservar.
  assertHandleCountFits(
    reader,
    common.reactorCount + entryCount,
    common.bitSize,
    bodyBitLength,
    "block table entry",
  );

  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    opaqueSpans,
  );

  return Object.freeze({ common, entryCount, opaqueSpans: spans });
}

/**
 * Decodifica la entidad BLOCK que abre el contenido de un bloque: común de
 * entidad completo, nombre TV y la cabeza del flujo interpretada — su
 * propietario es el BLOCK_RECORD al que pertenece.
 */
export function decodeAc1015BlockBeginBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedBlockBegin {
  assertAc1015ObjectBodyType(bodyBytes, AC1015_TYPE_BLOCK, "BLOCK");

  const { common, opaqueSpans, reader, bodyBitLength } =
    readAc1015EntityCommon(bodyBytes);
  const name = copyTextBytes(reader.readTV().bytes);

  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    [...opaqueSpans],
  );
  const references = readAc1015EntityHandleHead(reader, common);

  return Object.freeze({ common, name, references, opaqueSpans: spans });
}

/**
 * Decodifica la entidad ENDBLK que cierra el contenido de un bloque: sólo el
 * común de entidad (el formato no le da campos propios) y la cabeza del
 * flujo interpretada.
 */
export function decodeAc1015BlockEndBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedBlockEnd {
  assertAc1015ObjectBodyType(bodyBytes, AC1015_TYPE_ENDBLK, "ENDBLK");

  const { common, opaqueSpans, reader, bodyBitLength } =
    readAc1015EntityCommon(bodyBytes);

  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    [...opaqueSpans],
  );
  const references = readAc1015EntityHandleHead(reader, common);

  return Object.freeze({ common, references, opaqueSpans: spans });
}

/** Copia los bytes de un TV al modelo neutral como lista congelada. */
function copyTextBytes(bytes: Uint8Array): readonly number[] {
  const copy = new Array<number>(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    copy[index] = bytes[index]!;
  }
  return Object.freeze(copy);
}
