/**
 * Tabla de capas R2000 (AC1015) — fase D3: LAYER y su objeto de CONTROL.
 *
 * Primer objeto del laboratorio que NO es una entidad. Los objetos de tabla
 * comparten con las entidades el arranque del prólogo (tipo BS, tamaño RL en
 * bits, handle H, EED contabilizado — `readAc1015ObjectPrologue`) pero NO
 * llevan gráfico de previsualización ni modo de entidad: tras el EED viene
 * directamente su recuento de reactores BL y después los campos del tipo.
 *
 * Hechos registrados en SOURCE_REGISTER (ODA-ODS-DWG-5.4.1-PUBLIC): códigos
 * de tipo 0x32 LAYER CONTROL y 0x33 LAYER; una entrada LAYER codifica nombre
 * TV, bit de referencia externa (bandera 64), índice de xref más uno BS, bit
 * de dependencia de xref, un BS empaquetado de estado y color CmC, con el
 * tipo de línea y el plotstyle por handle en el flujo final; un control
 * declara su recuento de entradas BL y lleva los handles de sus entradas en
 * el flujo final.
 *
 * Reglas del laboratorio:
 * - **Lo dudoso viaja crudo**: la semántica bit a bit del BS de estado
 *   (congelada/bloqueada/trazado/grosor de línea) queda pendiente de corpus
 *   real; el modelo expone el valor ENTERO sin fingir interpretarlo.
 * - **Nada se ignora en silencio**: el flujo de handles final (propietario,
 *   reactores, xdictionary, ltype/plotstyle del layer o entradas del control)
 *   queda contabilizado como tramo opaco con su posición exacta.
 * - **Fallo cerrado**: truncamientos, recuentos que no caben en el flujo de
 *   handles o un tamaño en bits que no cuadra → error tipado con su byte.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import {
  DwgBitReader,
  type DwgColorReference,
  type DwgHandleReference,
} from "../codecs/bitcodes.js";
import { throwDwgError } from "../security/parse-error.js";
import {
  assertHandleCountFits,
  readAc1015ObjectPrologue,
  type Ac1015OpaqueSpan,
} from "./entity-common.js";

/** Códigos de tipo BS de la tabla de capas (hechos registrados). */
export const AC1015_TYPE_LAYER_CONTROL = 0x32;
export const AC1015_TYPE_LAYER = 0x33;

/** La cabecera común interpretada de un objeto de tabla (no entidad). */
export interface Ac1015TableObjectCommon {
  readonly type: number;
  /** Tamaño declarado del dato en bits, hasta el arranque de los handles. */
  readonly bitSize: number;
  readonly ownHandle: DwgHandleReference;
  /** Recuento de reactores BL; sus handles viven en el flujo opaco final. */
  readonly reactorCount: number;
}

/**
 * Una entrada LAYER en el modelo neutral mínimo de esta fase. El nombre son
 * BYTES en la página de códigos del dibujo (mismo contrato que `readTV`); el
 * BS de estado viaja crudo porque su semántica bit a bit queda pendiente de
 * corpus real, y los handles (ltype/plotstyle) siguen en el flujo opaco.
 */
export interface Ac1015LayerRecord {
  readonly name: readonly number[];
  readonly xrefRef: boolean;
  readonly xrefIndexPlusOne: number;
  readonly xrefDependent: boolean;
  /** BS de estado crudo (congelada/bloqueada/trazado/grosor empaquetados). */
  readonly stateFlags: number;
  readonly color: DwgColorReference;
}

/** Un LAYER decodificado por completo: común, entrada y restos opacos. */
export interface Ac1015DecodedLayer {
  readonly common: Ac1015TableObjectCommon;
  readonly layer: Ac1015LayerRecord;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/** Un LAYER CONTROL decodificado: común, recuento de entradas y opacos. */
export interface Ac1015DecodedLayerControl {
  readonly common: Ac1015TableObjectCommon;
  /** Cuántas entradas referencia; sus handles viven en el flujo opaco final. */
  readonly entryCount: number;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/**
 * Decodifica el cuerpo COMPLETO de un objeto LAYER. `bodyBytes` son los bytes
 * exactos del dato de la envoltura D1 (tipo BS incluido); los offsets de
 * error son relativos a su inicio.
 */
export function decodeAc1015LayerBody(bodyBytes: Uint8Array): Ac1015DecodedLayer {
  assertAc1015ObjectBodyType(bodyBytes, AC1015_TYPE_LAYER, "LAYER");

  const { common, reader, bodyBitLength, opaqueSpans } =
    readAc1015TableObjectCommon(bodyBytes);

  // La entrada: nombre TV (bytes crudos), los tres campos de xref y el BS de
  // estado crudo, cerrando con el color CmC.
  const name = reader.readTV();
  const nameBytes = new Array<number>(name.bytes.length);
  for (let index = 0; index < name.bytes.length; index += 1) {
    nameBytes[index] = name.bytes[index]!;
  }
  const xrefRef = reader.readB() === 1;
  const xrefIndexPlusOne = reader.readBS();
  const xrefDependent = reader.readB() === 1;
  const stateFlags = reader.readBS();
  const color = reader.readCmC();

  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    opaqueSpans,
  );

  return Object.freeze({
    common,
    layer: Object.freeze({
      name: Object.freeze(nameBytes),
      xrefRef,
      xrefIndexPlusOne,
      xrefDependent,
      stateFlags,
      color,
    }),
    opaqueSpans: spans,
  });
}

/**
 * Decodifica el cuerpo COMPLETO del objeto de CONTROL de la tabla de capas:
 * el común de objeto y su recuento de entradas BL. Los handles de las
 * entradas viven en el flujo final y quedan contabilizados, no resueltos —
 * resolverlos contra el mapa es de una fase posterior.
 */
export function decodeAc1015LayerControlBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedLayerControl {
  assertAc1015ObjectBodyType(bodyBytes, AC1015_TYPE_LAYER_CONTROL, "LAYER CONTROL");

  const { common, reader, bodyBitLength, opaqueSpans } =
    readAc1015TableObjectCommon(bodyBytes);

  const entryCount = reader.readBL();
  // Reactores Y entradas comparten el flujo final con el propietario y el
  // xdictionary; cada handle ocupa al menos un byte, así que la suma de
  // recuentos se cobra ANTES de que nadie recorra o reserve nada por ellos.
  assertHandleCountFits(
    reader,
    common.reactorCount + entryCount,
    common.bitSize,
    bodyBitLength,
    "table entry",
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
 * El común de objeto de tabla: prólogo compartido + reactores BL. Exportado
 * desde la fase D4 para que la tabla de bloques (`table-block.ts`) comparta
 * el MISMO criterio — cero comunes gemelos.
 */
export function readAc1015TableObjectCommon(bodyBytes: Uint8Array): {
  common: Ac1015TableObjectCommon;
  reader: DwgBitReader;
  bodyBitLength: number;
  opaqueSpans: Ac1015OpaqueSpan[];
} {
  const { type, bitSize, ownHandle, opaqueSpans, reader, bodyBitLength } =
    readAc1015ObjectPrologue(bodyBytes);

  const reactorCount = reader.readBL();
  assertHandleCountFits(reader, reactorCount, bitSize, bodyBitLength, "reactor");

  const common: Ac1015TableObjectCommon = Object.freeze({
    type,
    bitSize,
    ownHandle,
    reactorCount,
  });
  return { common, reader, bodyBitLength, opaqueSpans };
}

/**
 * Cierra el decodificado exigiendo que el tamaño en bits declarado cuadre
 * EXACTAMENTE con lo leído (ahí arranca el flujo de handles) y anota ese
 * flujo como tramo opaco. El mismo contrato que el despachador de entidades.
 * Exportado desde la fase D4 para la tabla de bloques — un solo cierre.
 */
export function closeAc1015ObjectWithHandleStream(
  reader: DwgBitReader,
  bitSize: number,
  bodyBitLength: number,
  opaqueSpans: Ac1015OpaqueSpan[],
): readonly Ac1015OpaqueSpan[] {
  if (reader.bitPosition !== bitSize) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The declared bit size does not match the decoded object data.",
    );
  }
  const handleStreamBits = bodyBitLength - bitSize;
  if (handleStreamBits > 0) {
    opaqueSpans.push(
      Object.freeze({
        kind: "handle-stream" as const,
        startBit: bitSize,
        bitLength: handleStreamBits,
      }),
    );
  }
  return Object.freeze([...opaqueSpans]);
}

/**
 * Filtra el tipo ANTES de interpretar nada: un cuerpo cuyo tipo no es el
 * esperado puede ser un archivo perfecto que este decodificador no cubre —
 * capacidad ausente, no corrupción. Un cuerpo que no alcanza ni para su tipo
 * sí falla cerrado (dentro de `readBS`). Exportado desde la fase D4 para que
 * la tabla de bloques filtre con el MISMO criterio.
 */
export function assertAc1015ObjectBodyType(
  bodyBytes: Uint8Array,
  expectedType: number,
  what: string,
): void {
  const type = new DwgBitReader(new BoundedByteCursor(bodyBytes)).readBS();
  if (type !== expectedType) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      `This object type is not decoded as ${what} by the phase-D3 laboratory.`,
    );
  }
}
