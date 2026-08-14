/**
 * Writer del contenedor R2000 (AC1015) — fase C del laboratorio.
 *
 * Produce el archivo AC1015 estructuralmente válido MÍNIMO: cabecera con su
 * directorio de tres secciones, sección de variables de cabecera y sección de
 * clases enmarcadas con centinelas + tamaño + CRC, y el mapa de objetos — por
 * defecto VACÍO (sólo su página terminadora big-endian) y, desde la fase D1,
 * POBLADO cuando el llamador pide objetos sintéticos opacos, que se emiten en
 * la región sin mapear previa al mapa. Los payloads de las dos primeras
 * secciones son OPACOS aquí: el contenido real de las variables de cabecera y
 * de las clases es de fases posteriores, y por eso el placeholder por defecto
 * es un rótulo first-party evidente, no un remedo de datos reales.
 *
 * El writer existe para una cosa: ser la mitad emisora del round-trip que
 * mantiene honesto al lector. Por eso no inventa constantes propias — importa
 * la magia, el centinela de cabecera, los centinelas de sección y las
 * máscaras de CRC de los MISMOS módulos que usa el lector; si un hecho está
 * mal transcrito, fallan juntos y el test lo delata.
 *
 * Reglas del laboratorio:
 * - **Determinista**: misma entrada → mismos bytes, sin reloj, azar ni estado.
 * - **Fallo cerrado**: opciones fuera de rango o payloads desmesurados lanzan
 *   el error tipado; jamás se emite un archivo "casi" válido.
 * - **Frontera defendida**: los payloads del llamador se inspeccionan y se
 *   copian UNA vez (rechazando SharedArrayBuffer) antes de componer nada, para
 *   que nadie mute la entrada a mitad de la escritura.
 *
 * Hechos de ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER). Implementación
 * original. Límite declarado: la validación de estas constantes contra corpus
 * real con derechos queda para la fase de intake (DWG0_WORKLOG).
 */
import {
  crc16Dwg,
  FILE_HEADER_CRC_XOR_BY_RECORD_COUNT,
} from "../codecs/crc16.js";
import {
  AC1015_FILE_HEADER_END_SENTINEL,
  AC1015_MAGIC,
} from "../container/ac1015-file-header.js";
import {
  AC1015_CLASSES_SENTINELS,
  AC1015_HEADER_VARIABLES_SENTINELS,
  AC1015_SECTION_CRC_SEED,
  AC1015_SECTION_FRAME_OVERHEAD,
  type Ac1015SectionSentinelPair,
} from "../container/ac1015-section-frame.js";
import {
  copyInspectedByteView,
  inspectOrdinaryByteView,
} from "../security/byte-view.js";
import { throwDwgError } from "../security/parse-error.js";
import type { Ac1015ObjectMapEntry } from "../container/ac1015-object-map.js";
import type { DwgGeometryEntity } from "../model/entity-geometry.js";
import {
  writeAc1015BlockBeginBody,
  writeAc1015BlockControlBody,
  writeAc1015BlockEndBody,
  writeAc1015BlockRecordBody,
  type Ac1015BlockBeginWriteSpec,
  type Ac1015BlockControlWriteSpec,
  type Ac1015BlockEndWriteSpec,
  type Ac1015BlockRecordWriteSpec,
} from "./ac1015-block-writer.js";
import { writeAc1015EntityBody } from "./ac1015-entity-writer.js";
import {
  AC1015_WRITER_MAX_OBJECTS,
  buildAc1015ObjectMapSection,
  wrapAc1015ObjectBody,
  writeAc1015ObjectEnvelope,
  type Ac1015SyntheticObjectSpec,
} from "./ac1015-object-writer.js";
import {
  writeAc1015LayerBody,
  writeAc1015LayerControlBody,
  type Ac1015LayerControlWriteSpec,
  type Ac1015LayerWriteSpec,
} from "./ac1015-table-writer.js";

/**
 * Especificación de una entidad REAL (fase D2): la geometría del modelo
 * neutral, envuelta como cuerpo de entidad R2000 completo. El handle del
 * mapa y el handle propio del cuerpo son el MISMO valor — un archivo cuyo
 * índice y cuyos objetos se contradicen sería un archivo mentiroso.
 */
export interface Ac1015EntityObjectSpec {
  readonly entity: DwgGeometryEntity;
  /** Handle del objeto. Por defecto, el anterior más uno (desde 1). */
  readonly handle?: number;
  /**
   * Fase D4: handle del BLOCK_RECORD dueño — la entidad viaja en modo 0 y
   * pertenece al bloque; ausente, viaja en modo 2 (model space).
   */
  readonly ownerBlockHandle?: number;
  /** Fase D4, sólo INSERT: handle del BLOCK_RECORD insertado. */
  readonly insertBlockHandle?: number;
}

/** Especificación de una entrada LAYER real (fase D3), misma regla de handle. */
export interface Ac1015LayerObjectSpec {
  readonly layer: Ac1015LayerWriteSpec;
  /** Handle del objeto. Por defecto, el anterior más uno (desde 1). */
  readonly handle?: number;
}

/** Especificación del CONTROL de la tabla de capas (fase D3). */
export interface Ac1015LayerControlObjectSpec {
  readonly layerControl: Ac1015LayerControlWriteSpec;
  /** Handle del objeto. Por defecto, el anterior más uno (desde 1). */
  readonly handle?: number;
}

/** Especificación de un BLOCK_RECORD (fase D4), misma regla de handle. */
export interface Ac1015BlockRecordObjectSpec {
  readonly blockRecord: Ac1015BlockRecordWriteSpec;
  /** Handle del objeto. Por defecto, el anterior más uno (desde 1). */
  readonly handle?: number;
}

/** Especificación del CONTROL de la tabla de bloques (fase D4). */
export interface Ac1015BlockControlObjectSpec {
  readonly blockControl: Ac1015BlockControlWriteSpec;
  /** Handle del objeto. Por defecto, el anterior más uno (desde 1). */
  readonly handle?: number;
}

/** Especificación de la entidad BLOCK que abre un bloque (fase D4). */
export interface Ac1015BlockBeginObjectSpec {
  readonly blockBegin: Ac1015BlockBeginWriteSpec;
  /** Handle del objeto. Por defecto, el anterior más uno (desde 1). */
  readonly handle?: number;
}

/** Especificación de la entidad ENDBLK que cierra un bloque (fase D4). */
export interface Ac1015BlockEndObjectSpec {
  readonly blockEnd: Ac1015BlockEndWriteSpec;
  /** Handle del objeto. Por defecto, el anterior más uno (desde 1). */
  readonly handle?: number;
}

/**
 * Un objeto del contenedor: sintético opaco (D1), entidad real (D2/D4),
 * tabla de capas mínima (D3) o tabla de bloques con sus entidades
 * estructurales (D4).
 */
export type Ac1015ObjectSpec =
  | Ac1015SyntheticObjectSpec
  | Ac1015EntityObjectSpec
  | Ac1015LayerObjectSpec
  | Ac1015LayerControlObjectSpec
  | Ac1015BlockRecordObjectSpec
  | Ac1015BlockControlObjectSpec
  | Ac1015BlockBeginObjectSpec
  | Ac1015BlockEndObjectSpec;

/** Página de códigos por defecto: ANSI_1252, la habitual en dibujos R2000. */
export const AC1015_DEFAULT_CODEPAGE = 0x4e4;

/**
 * Tope de payload por sección en esta fase. Es un límite de LABORATORIO, no
 * del formato: los placeholders de la fase C caben de sobra y un payload
 * gigante sólo puede ser un error del llamador — se rechaza cerrado.
 */
export const AC1015_WRITER_MAX_SECTION_PAYLOAD = 0xffff;

/**
 * Placeholder determinista de las variables de cabecera: un rótulo ASCII
 * first-party de 16 bytes. Se eligió texto legible a propósito — quien abra
 * el binario debe ver un placeholder confeso, no datos que finjan ser reales.
 * Se entrega una copia fresca para que ningún llamador pueda mutar el defecto
 * compartido de todos los demás.
 */
export function ac1015HeaderVariablesPlaceholder(): Uint8Array {
  // "VALLE-DWG0-HVARS"
  return Uint8Array.from([
    0x56, 0x41, 0x4c, 0x4c, 0x45, 0x2d, 0x44, 0x57, 0x47, 0x30, 0x2d, 0x48,
    0x56, 0x41, 0x52, 0x53,
  ]);
}

export interface Ac1015ContainerWriteOptions {
  /** Byte de versión de mantenimiento (0–255). Por defecto 0. */
  readonly maintenanceVersion?: number;
  /** Página de códigos RS (0–65535). Por defecto ANSI_1252. */
  readonly codepage?: number;
  /** Payload opaco de las variables de cabecera. Por defecto, el placeholder. */
  readonly headerVariablesPayload?: Uint8Array;
  /** Payload opaco de la sección de clases. Por defecto, vacío. */
  readonly classesPayload?: Uint8Array;
  /**
   * Objetos del cuerpo: sintéticos opacos (fase D1), entidades REALES
   * (fases D2/D3) o la tabla de capas mínima (fase D3), mezclables. Se
   * emiten uno tras otro en la región SIN mapear entre la sección de clases
   * y el mapa de objetos, y el mapa los referencia con sus handles y offsets
   * reales. Por defecto, ninguno: el contenedor mínimo de la fase C, byte a
   * byte.
   */
  readonly objects?: readonly Ac1015ObjectSpec[];
}

/** Identificadores de registro del directorio (hecho ya registrado en fase B). */
const HEADER_VARIABLES_RECORD_ID = 0;
const CLASSES_RECORD_ID = 1;
const OBJECT_MAP_RECORD_ID = 2;

/** El mínimo contenedor lleva exactamente estos tres registros. */
const RECORD_COUNT = 3;

/** Bytes de la cabecera con tres registros: 0x15 fijos + 4 + 3×9 + CRC + centinela. */
const FILE_HEADER_LENGTH = 0x15 + 4 + RECORD_COUNT * 9 + 2 + 16;

/**
 * Escribe un contenedor AC1015 mínimo y estructuralmente válido.
 *
 * Determinista por construcción: el resultado es función pura de las opciones.
 * El archivo producido debe abrirse con `parseAc1015FileHeader` y sus marcos
 * verificarse con `readAc1015SectionFrame` / `readAc1015EmptyObjectMap`; ese
 * round-trip es la evidencia de laboratorio de esta fase.
 */
export function writeAc1015Container(
  options: Ac1015ContainerWriteOptions = {},
): Uint8Array {
  const maintenanceVersion = options.maintenanceVersion ?? 0;
  if (
    !Number.isInteger(maintenanceVersion) ||
    maintenanceVersion < 0 ||
    maintenanceVersion > 0xff
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The maintenance version must be a byte between 0 and 255.",
    );
  }
  const codepage = options.codepage ?? AC1015_DEFAULT_CODEPAGE;
  if (!Number.isInteger(codepage) || codepage < 0 || codepage > 0xffff) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The codepage must fit in an unsigned 16-bit value.",
    );
  }

  const headerVariablesPayload = ownedPayload(
    options.headerVariablesPayload,
    ac1015HeaderVariablesPlaceholder(),
  );
  const classesPayload = ownedPayload(
    options.classesPayload,
    new Uint8Array(0),
  );

  // Disposición: las secciones se pegan una tras otra justo después de la
  // cabecera. Los tamaños del directorio cubren el marco COMPLETO (centinelas
  // incluidos): es la lectura estricta con la que el lector de marcos exige
  // encaje exacto, y el round-trip la mantiene honesta. Los OBJETOS viven en
  // la región sin mapear entre las clases y el mapa: ningún registro del
  // directorio los cubre, igual que en el formato — el mapa es quien los
  // encuentra.
  const headerVariablesStart = FILE_HEADER_LENGTH;
  const headerVariablesSize =
    AC1015_SECTION_FRAME_OVERHEAD + headerVariablesPayload.length;
  const classesStart = headerVariablesStart + headerVariablesSize;
  const classesSize = AC1015_SECTION_FRAME_OVERHEAD + classesPayload.length;
  const objectsStart = classesStart + classesSize;
  const { envelopes, mapEntries } = buildSyntheticObjects(
    options.objects,
    objectsStart,
  );
  const objectMapStart =
    objectsStart +
    envelopes.reduce((total, envelope) => total + envelope.length, 0);
  const objectMapBytes = buildAc1015ObjectMapSection(mapEntries);
  const objectMapSize = objectMapBytes.length;
  const fileLength = objectMapStart + objectMapSize;

  const head: number[] = [];
  head.push(...AC1015_MAGIC);
  head.push(0, 0, 0, 0, 0); // reservados: el lector no los interpreta
  head.push(maintenanceVersion);
  head.push(0x01); // byte fijo que el lector exige antes del preview seeker
  pushUint32LE(head, 0); // sin imagen de previsualización en esta fase
  head.push(0, 0); // versión/mantenimiento de la aplicación escritora
  pushUint16LE(head, codepage);
  pushUint32LE(head, RECORD_COUNT);
  pushRecord(
    head,
    HEADER_VARIABLES_RECORD_ID,
    headerVariablesStart,
    headerVariablesSize,
  );
  pushRecord(head, CLASSES_RECORD_ID, classesStart, classesSize);
  pushRecord(head, OBJECT_MAP_RECORD_ID, objectMapStart, objectMapSize);

  // CRC de cabecera: semilla 0xC0C1 sobre todo lo anterior, enmascarado con
  // la constante XOR del recuento — la misma tabla que consulta el lector.
  const crcXor = FILE_HEADER_CRC_XOR_BY_RECORD_COUNT.get(RECORD_COUNT);
  if (crcXor === undefined) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      0,
      "The writer record count has no CRC mask.",
    );
  }
  pushUint16LE(head, crc16Dwg(Uint8Array.from(head), 0xc0c1) ^ crcXor);
  head.push(...AC1015_FILE_HEADER_END_SENTINEL);
  if (head.length !== FILE_HEADER_LENGTH) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      head.length,
      "The writer produced a file header of unexpected length.",
    );
  }

  const file = new Uint8Array(fileLength);
  file.set(Uint8Array.from(head), 0);
  file.set(
    buildSectionFrame(
      AC1015_HEADER_VARIABLES_SENTINELS,
      headerVariablesPayload,
    ),
    headerVariablesStart,
  );
  file.set(
    buildSectionFrame(AC1015_CLASSES_SENTINELS, classesPayload),
    classesStart,
  );
  let envelopeOffset = objectsStart;
  for (const envelope of envelopes) {
    file.set(envelope, envelopeOffset);
    envelopeOffset += envelope.length;
  }
  file.set(objectMapBytes, objectMapStart);
  return file;
}

/**
 * Emite las envolturas de los objetos — sintéticos opacos o entidades reales
 * — y calcula sus entradas del mapa. Los handles por defecto son secuenciales
 * desde 1; uno explícito debe ser estrictamente creciente — el writer no
 * emite un mapa que su propio lector rechazaría. El cuerpo de una entidad
 * lleva DENTRO el mismo handle que la referencia en el mapa.
 */
function buildSyntheticObjects(
  specs: readonly Ac1015ObjectSpec[] | undefined,
  objectsStart: number,
): { envelopes: readonly Uint8Array[]; mapEntries: Ac1015ObjectMapEntry[] } {
  if (specs === undefined) {
    return { envelopes: [], mapEntries: [] };
  }
  if (!Array.isArray(specs)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The object list must be an array.",
    );
  }
  if (specs.length > AC1015_WRITER_MAX_OBJECTS) {
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      0,
      "The object list exceeds the phase-D laboratory limit.",
    );
  }
  const envelopes: Uint8Array[] = [];
  const mapEntries: Ac1015ObjectMapEntry[] = [];
  let previousHandle = 0;
  let nextOffset = objectsStart;
  for (const spec of specs) {
    const handle = spec.handle ?? previousHandle + 1;
    if (
      !Number.isSafeInteger(handle) ||
      handle < 1 ||
      handle <= previousHandle
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "Object handles must be strictly increasing safe integers from 1.",
      );
    }
    const envelope = buildObjectEnvelope(spec, handle);
    envelopes.push(envelope);
    mapEntries.push(Object.freeze({ handle, offset: nextOffset }));
    previousHandle = handle;
    nextOffset += envelope.length;
  }
  return { envelopes, mapEntries };
}

/**
 * Un spec declara EXACTAMENTE una naturaleza — entidad real, sintético
 * opaco, capa/control de capas o pieza de la tabla de bloques —: la mezcla
 * sería ambigua y se rechaza cerrada en vez de elegir en silencio.
 */
function buildObjectEnvelope(
  spec: Ac1015ObjectSpec,
  handle: number,
): Uint8Array {
  const isEntity = "entity" in spec && spec.entity !== undefined;
  const isSynthetic = "type" in spec && spec.type !== undefined;
  const isLayer = "layer" in spec && spec.layer !== undefined;
  const isLayerControl = "layerControl" in spec && spec.layerControl !== undefined;
  const isBlockRecord = "blockRecord" in spec && spec.blockRecord !== undefined;
  const isBlockControl = "blockControl" in spec && spec.blockControl !== undefined;
  const isBlockBegin = "blockBegin" in spec && spec.blockBegin !== undefined;
  const isBlockEnd = "blockEnd" in spec && spec.blockEnd !== undefined;
  const natures = [
    isEntity,
    isSynthetic,
    isLayer,
    isLayerControl,
    isBlockRecord,
    isBlockControl,
    isBlockBegin,
    isBlockEnd,
  ].filter((nature) => nature).length;
  if (natures !== 1) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An object spec must declare exactly one nature (entity, type, layer, layerControl, blockRecord, blockControl, blockBegin or blockEnd).",
    );
  }
  if (isEntity) {
    const entitySpec = spec as Ac1015EntityObjectSpec;
    return wrapAc1015ObjectBody(
      writeAc1015EntityBody(entitySpec.entity, handle, {
        ...(entitySpec.ownerBlockHandle === undefined
          ? {}
          : { ownerBlockHandle: entitySpec.ownerBlockHandle }),
        ...(entitySpec.insertBlockHandle === undefined
          ? {}
          : { insertBlockHandle: entitySpec.insertBlockHandle }),
      }),
    );
  }
  if (isLayer) {
    const layerSpec = spec as Ac1015LayerObjectSpec;
    return wrapAc1015ObjectBody(writeAc1015LayerBody(layerSpec.layer, handle));
  }
  if (isLayerControl) {
    const controlSpec = spec as Ac1015LayerControlObjectSpec;
    return wrapAc1015ObjectBody(
      writeAc1015LayerControlBody(controlSpec.layerControl, handle),
    );
  }
  if (isBlockRecord) {
    const recordSpec = spec as Ac1015BlockRecordObjectSpec;
    return wrapAc1015ObjectBody(
      writeAc1015BlockRecordBody(recordSpec.blockRecord, handle),
    );
  }
  if (isBlockControl) {
    const controlSpec = spec as Ac1015BlockControlObjectSpec;
    return wrapAc1015ObjectBody(
      writeAc1015BlockControlBody(controlSpec.blockControl, handle),
    );
  }
  if (isBlockBegin) {
    const beginSpec = spec as Ac1015BlockBeginObjectSpec;
    return wrapAc1015ObjectBody(
      writeAc1015BlockBeginBody(beginSpec.blockBegin, handle),
    );
  }
  if (isBlockEnd) {
    const endSpec = spec as Ac1015BlockEndObjectSpec;
    return wrapAc1015ObjectBody(
      writeAc1015BlockEndBody(endSpec.blockEnd, handle),
    );
  }
  return writeAc1015ObjectEnvelope(spec as Ac1015SyntheticObjectSpec);
}

/**
 * Copia UNA vez el payload del llamador a storage propio (o entrega el
 * defecto), rechazando vistas compartidas y payloads fuera del tope. La copia
 * temprana cierra la ventana de mutación concurrente: a partir de aquí el
 * writer sólo mira bytes que posee.
 */
function ownedPayload(
  provided: Uint8Array | undefined,
  fallback: Uint8Array,
): Uint8Array {
  const owned =
    provided === undefined
      ? fallback
      : copyInspectedByteView(inspectOrdinaryByteView(provided));
  if (owned.length > AC1015_WRITER_MAX_SECTION_PAYLOAD) {
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      0,
      "A section payload exceeds the phase-C laboratory limit.",
    );
  }
  return owned;
}

/** Marco completo de una sección: apertura + RL + payload + CRC + cierre. */
function buildSectionFrame(
  sentinels: Ac1015SectionSentinelPair,
  payload: Uint8Array,
): Uint8Array {
  const body: number[] = [];
  pushUint32LE(body, payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    body.push(payload[index]!);
  }
  const crc = crc16Dwg(Uint8Array.from(body), AC1015_SECTION_CRC_SEED);

  const frame = new Uint8Array(AC1015_SECTION_FRAME_OVERHEAD + payload.length);
  frame.set(sentinels.begin, 0);
  frame.set(Uint8Array.from(body), 16);
  frame[16 + body.length] = crc & 0xff;
  frame[16 + body.length + 1] = (crc >> 8) & 0xff;
  frame.set(sentinels.end, 16 + body.length + 2);
  return frame;
}

function pushUint16LE(into: number[], value: number): void {
  into.push(value & 0xff, (value >> 8) & 0xff);
}

function pushUint32LE(into: number[], value: number): void {
  into.push(
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  );
}

function pushRecord(
  into: number[],
  id: number,
  start: number,
  size: number,
): void {
  into.push(id & 0xff);
  pushUint32LE(into, start);
  pushUint32LE(into, size);
}
