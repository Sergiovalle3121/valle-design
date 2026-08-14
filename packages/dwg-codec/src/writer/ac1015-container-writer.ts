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
import {
  AC1015_WRITER_MAX_OBJECTS,
  buildAc1015ObjectMapSection,
  writeAc1015ObjectEnvelope,
  type Ac1015SyntheticObjectSpec,
} from "./ac1015-object-writer.js";

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
   * Objetos sintéticos opacos (fase D1). Se emiten uno tras otro en la región
   * SIN mapear entre la sección de clases y el mapa de objetos, y el mapa los
   * referencia con sus handles y offsets reales. Por defecto, ninguno: el
   * contenedor mínimo de la fase C, byte a byte.
   */
  readonly objects?: readonly Ac1015SyntheticObjectSpec[];
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
 * Emite las envolturas de los objetos sintéticos y calcula sus entradas del
 * mapa. Los handles por defecto son secuenciales desde 1; uno explícito debe
 * ser estrictamente creciente — el writer no emite un mapa que su propio
 * lector rechazaría.
 */
function buildSyntheticObjects(
  specs: readonly Ac1015SyntheticObjectSpec[] | undefined,
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
      "The synthetic object list must be an array.",
    );
  }
  if (specs.length > AC1015_WRITER_MAX_OBJECTS) {
    throwDwgError(
      "DWG_FILE_LIMIT_EXCEEDED",
      "resource",
      0,
      "The synthetic object list exceeds the phase-D laboratory limit.",
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
    const envelope = writeAc1015ObjectEnvelope(spec);
    envelopes.push(envelope);
    mapEntries.push(Object.freeze({ handle, offset: nextOffset }));
    previousHandle = handle;
    nextOffset += envelope.length;
  }
  return { envelopes, mapEntries };
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
