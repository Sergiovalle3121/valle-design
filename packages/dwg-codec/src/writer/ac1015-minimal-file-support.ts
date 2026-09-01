/**
 * Apoyos del writer de archivo mínimo AC1015 — campaña 2026-08-21, OLA 3
 * (partido de `ac1015-minimal-file-writer.ts` por el presupuesto de 800
 * líneas del monorepo; misma semántica, cero cambios).
 *
 * Aquí viven las SECCIONES auxiliares del archivo (clases mínimas,
 * AuxHeader del capítulo 27, previsualización mínima, ObjFreeSpace del 21 y
 * el SECOND FILE HEADER del 26 con sus centinelas y los seis bytes medidos),
 * la validación de opciones y los helpers de bytes que el orquestador
 * comparte. Los valores por defecto son los MEDIDOS del fixture 01-vacio.
 */
import { crc16Dwg } from "../codecs/crc16.js";
import { AC1015_MAGIC } from "../container/ac1015-file-header.js";
import type { DwgGeometryEntity } from "../model/entity-geometry.js";
import { throwDwgError } from "../security/parse-error.js";
import { AC1015_WRITER_MAX_OBJECTS } from "./ac1015-object-writer.js";
import { DwgBitEmitter } from "./dwg-bit-emitter.js";

// ---------------------------------------------------------------------------
// Opciones públicas del archivo mínimo — trasladadas aquí desde
// `ac1015-minimal-file-writer.ts` por el presupuesto de 800 líneas del
// monorepo; ese módulo las re-exporta tal cual, así que nada que ya
// importara de allí nota el traslado.
// ---------------------------------------------------------------------------

/** Una capa adicional a la capa "0" del esquema canónico. */
export interface Ac1015MinimalFileLayerSpec {
  readonly name: readonly number[];
  /** Índice de color CmC. Por defecto 7. */
  readonly colorIndex?: number;
  /**
   * Estado de la capa. Se compone con el criterio ÚNICO que también lo lee
   * (`objects/layer-state.ts`): congelada es el bit 0 y bloqueada el 3, sobre
   * la base 0b1111110000 que el corpus trae siempre. Ausentes = capa normal.
   */
  readonly frozen?: boolean;
  readonly locked?: boolean;
  /**
   * Nombre del tipo de línea de la capa. Debe coincidir con el `name` de una
   * de las entradas de `linetypes`; ausente o desconocido = Continuous, que es
   * lo único que el archivo llevaba hasta el 2026-09-01.
   */
  readonly linetypeName?: string;
}

/**
 * Una entrada LTYPE propia del archivo, con su patrón. Sin esto el archivo
 * sólo podía llevar Continuous, así que una capa con `TRAZOS` se escribía
 * sólida — leída de vuelta decía «Continuous», que es un valor equivocado y
 * no una ausencia.
 */
export interface Ac1015MinimalFileLinetypeSpec {
  readonly name: readonly number[];
  readonly description?: readonly number[];
  readonly patternLength?: number;
  readonly dashes?: readonly { readonly length: number }[];
}

/**
 * Una entidad de model space O del contenido de un bloque — misma forma para
 * las dos (cero marcos gemelos): `layerIndex` resuelve contra `layers` en
 * ambos casos, e `insertBlockIndex` permite que un bloque inserte OTRO
 * bloque (el handle de cada BLOCK_RECORD ya está resuelto por adelantado en
 * `planAc1015MinimalFile`, así que una referencia hacia adelante en `blocks`
 * funciona igual que una hacia atrás).
 */
export interface Ac1015MinimalFileEntitySpec {
  readonly entity: DwgGeometryEntity;
  /** 0 = capa "0" (por defecto); 1.. = índice+1 en `layers`. */
  readonly layerIndex?: number;
  /** Sólo INSERT: índice del bloque insertado en `blocks`. */
  readonly insertBlockIndex?: number;
}

/**
 * Una entidad dentro de un bloque acepta la forma completa (con `layerIndex`/
 * `insertBlockIndex`) o SÓLO la entidad — compatibilidad hacia atrás con
 * llamadores anteriores a la ola V1→V3, que pasaban `DwgGeometryEntity[]` a
 * secas (capa "0" implícita, sin INSERT anidado). `normalizeBlockEntity` (más
 * abajo) resuelve la forma corta a la larga antes de validar: un solo camino
 * de validación para las dos.
 */
export type Ac1015MinimalFileBlockEntityInput =
  | DwgGeometryEntity
  | Ac1015MinimalFileEntitySpec;

/** Un bloque de usuario con su contenido. */
export interface Ac1015MinimalFileBlockSpec {
  readonly name: readonly number[];
  readonly entities: readonly Ac1015MinimalFileBlockEntityInput[];
}

export interface Ac1015MinimalFileOptions {
  readonly layers?: readonly Ac1015MinimalFileLayerSpec[];
  /** Entradas LTYPE propias, además de ByBlock/ByLayer/Continuous. */
  readonly linetypes?: readonly Ac1015MinimalFileLinetypeSpec[];
  readonly blocks?: readonly Ac1015MinimalFileBlockSpec[];
  readonly entities?: readonly Ac1015MinimalFileEntitySpec[];
  /** Variable MEASUREMENT del Template: 0 = inglés (defecto), 1 = métrico. */
  readonly measurement?: 0 | 1;
}

/** El plan determinista de handles de un archivo mínimo. */
export interface Ac1015MinimalFilePlan {
  /** Handle de cada capa: [capa "0", ...capas extra]. */
  readonly layerHandles: readonly number[];
  /** Handle de cada entrada LTYPE propia, en el orden de las opciones. */
  readonly linetypeHandles: readonly number[];
  /** Handle del BLOCK_RECORD de cada bloque de usuario. */
  readonly blockRecordHandles: readonly number[];
  /** Handles de las entidades de model space, en orden de las opciones. */
  readonly modelEntityHandles: readonly number[];
  /** Handles de las entidades de cada bloque, en orden. */
  readonly blockEntityHandles: readonly (readonly number[])[];
  /** El siguiente handle libre: la HANDSEED del archivo. */
  readonly handseed: number;
}

// ---------------------------------------------------------------------------
// Esquema canónico de handles (hechos medidos del corpus).
// ---------------------------------------------------------------------------
export const H_BLOCK_CONTROL = 0x01;
export const H_LAYER_CONTROL = 0x02;
export const H_STYLE_CONTROL = 0x03;
export const H_LTYPE_CONTROL = 0x05;
export const H_VIEW_CONTROL = 0x06;
export const H_UCS_CONTROL = 0x07;
export const H_VPORT_CONTROL = 0x08;
export const H_APPID_CONTROL = 0x09;
export const H_DIMSTYLE_CONTROL = 0x0a;
export const H_VPENT_CONTROL = 0x0b;
export const H_NOD = 0x0c;
export const H_GROUP_DICT = 0x0d;
export const H_PLOTSTYLE_DICT = 0x0e;
export const H_PLACEHOLDER = 0x0f;
export const H_LAYER_ZERO = 0x10;
export const H_STYLE_STANDARD = 0x11;
export const H_APPID_ACAD = 0x12;
export const H_LTYPE_BYBLOCK = 0x14;
export const H_LTYPE_BYLAYER = 0x15;
export const H_LTYPE_CONTINUOUS = 0x16;
export const H_MLSTYLE_DICT = 0x17;
export const H_MLINESTYLE = 0x18;
export const H_PLOTSETTINGS_DICT = 0x19;
export const H_LAYOUTS_DICT = 0x1a;
export const H_PAPER_RECORD = 0x1b;
export const H_PAPER_LAYOUT = 0x1c;
export const H_MODEL_RECORD = 0x1d;
export const H_MODEL_LAYOUT = 0x1e;
export const H_DIMSTYLE_STANDARD = 0x20;
export const H_VPORT_ACTIVE = 0x21;
/** Primer handle dinámico: capas extra, bloques, entidades y marcadores. */
export const H_DYNAMIC_BASE = 0x22;

/** Códigos de clase de ESTE archivo: 500 + índice en la lista de clases. */
export const CLASS_TYPE_DICTIONARYWDFLT = 500;
export const CLASS_TYPE_PLACEHOLDER = 501;
export const CLASS_TYPE_LAYOUT = 502;

/** Disposición fija de la cabecera de 6 registros (0x61 bytes). */
export const FILE_HEADER_LENGTH = 0x15 + 4 + 6 * 9 + 2 + 16;
export const AUX_HEADER_START = FILE_HEADER_LENGTH; // 0x61, hueco tras la cabecera
export const AUX_HEADER_LENGTH = 123;
export const PREVIEW_START = AUX_HEADER_START + AUX_HEADER_LENGTH; // 0xDC
export const PREVIEW_LENGTH = 37;
export const HEADER_VARIABLES_START = PREVIEW_START + PREVIEW_LENGTH; // 0x101
/** Relleno R13C3 tras la sección de clases (capítulo 11: 0x200 ceros). */
export const POST_CLASSES_PADDING = 0x200;

export const DRAWING_CODEPAGE = 30;

export const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
/** Versión de mantenimiento medida en el corpus R2000. */
export const MAINTENANCE_VERSION = 6;
/** Timestamps deterministas (los del fixture 01-vacio, también en defaults). */
export const TDCREATE = [2461273, 58247617] as const;
export const TDUPDATE = [2461273, 58247625] as const;

/** Centinelas del SECOND FILE HEADER (capítulo 26, hecho registrado). */
const SECOND_HEADER_BEGIN_SENTINEL = [
  0xd4, 0x7b, 0x21, 0xce, 0x28, 0x93, 0x9f, 0xbf, 0x53, 0x24, 0x40, 0x09,
  0x12, 0x3c, 0xaa, 0x01,
] as const;
const SECOND_HEADER_END_SENTINEL = [
  0x2b, 0x84, 0xde, 0x31, 0xd7, 0x6c, 0x60, 0x40, 0xac, 0xdb, 0xbf, 0xf6,
  0xed, 0xc3, 0x55, 0xfe,
] as const;

/** Centinela de apertura del área de previsualización (capítulo 8). */
const PREVIEW_BEGIN_SENTINEL = [
  0x1f, 0x25, 0x6d, 0x07, 0xd4, 0x36, 0x28, 0x28, 0x9d, 0x57, 0xca, 0x3f,
  0x9d, 0x44, 0x10, 0x2b,
] as const;

/**
 * Los seis bytes que el productor real escribe entre la versión de
 * mantenimiento y los localizadores del second header (medidos bit a bit;
 * los cuatro últimos son los RC que el capítulo 26 lista como
 * 0x18,0x78,0x01,0x04|0x05 — el corpus R2000 lleva 0x06 al final).
 */
const SECOND_HEADER_MAGIC_BYTES = [0x10, 0x5c, 0x18, 0x78, 0x01, 0x06] as const;

// ---------------------------------------------------------------------------
// Secciones auxiliares
// ---------------------------------------------------------------------------

/** Las tres clases mínimas del archivo (capítulo 10; valores medidos). */
export function buildClassesPayload(): Uint8Array {
  const emitter = new DwgBitEmitter();
  const appName = ascii("ObjectDBX Classes");
  const emitClass = (
    classnum: number,
    cppName: string,
    dxfName: string,
  ): void => {
    emitter.emitBS(classnum);
    emitter.emitBS(0); // versión/banderas proxy (0 medido en estas tres)
    emitter.emitTV(appName);
    emitter.emitTV(ascii(cppName));
    emitter.emitTV(ascii(dxfName));
    emitter.pushBit(0); // wasazombie
    emitter.emitBS(0x1f3); // itemclassid: clase que produce OBJETOS
  };
  emitClass(CLASS_TYPE_DICTIONARYWDFLT, "AcDbDictionaryWithDefault", "ACDBDICTIONARYWDFLT");
  emitClass(CLASS_TYPE_PLACEHOLDER, "AcDbPlaceHolder", "ACDBPLACEHOLDER");
  emitClass(CLASS_TYPE_LAYOUT, "AcDbLayout", "LAYOUT");
  return emitter.toBytes();
}

/** AuxHeader (capítulo 27): 123 bytes, campo a campo con los valores medidos. */
export function buildAuxHeader(handseed: number): Uint8Array {
  const out: number[] = [];
  out.push(0xff, 0x77, 0x01);
  pushUint16LE(out, 23); // versión DWG: AC1015
  pushUint16LE(out, MAINTENANCE_VERSION);
  pushUint32LE(out, 1); // número de guardados
  pushUint32LE(out, 0xffffffff);
  pushUint16LE(out, 1); // guardados, parte 1
  pushUint16LE(out, 0); // guardados, parte 2
  pushUint32LE(out, 0);
  pushUint16LE(out, 23);
  pushUint16LE(out, MAINTENANCE_VERSION);
  pushUint16LE(out, 23);
  pushUint16LE(out, MAINTENANCE_VERSION);
  pushUint16LE(out, 0x0005);
  pushUint16LE(out, 0x0893);
  pushUint16LE(out, 0x0005);
  pushUint16LE(out, 0x0893);
  pushUint16LE(out, 0x0000);
  pushUint16LE(out, 0x0001);
  for (let index = 0; index < 5; index += 1) pushUint32LE(out, 0);
  pushUint32LE(out, TDCREATE[0]);
  pushUint32LE(out, TDCREATE[1]);
  pushUint32LE(out, TDUPDATE[0]);
  pushUint32LE(out, TDUPDATE[1]);
  pushUint32LE(out, handseed <= 0x7fffffff ? handseed : 0xffffffff);
  pushUint32LE(out, 0); // sello de plot educativo
  pushUint16LE(out, 0);
  pushUint16LE(out, 1); // parte 1 − parte 2
  pushUint32LE(out, 0);
  pushUint32LE(out, 0);
  pushUint32LE(out, 0);
  pushUint32LE(out, 1); // número de guardados
  for (let index = 0; index < 4; index += 1) pushUint32LE(out, 0);
  if (out.length !== AUX_HEADER_LENGTH) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      out.length,
      "The aux header emitter produced an unexpected length.",
    );
  }
  return Uint8Array.from(out);
}

/** Previsualización mínima (capítulo 8): sin imágenes, 37 bytes medidos. */
export function buildPreviewBlob(): Uint8Array {
  const out: number[] = [...PREVIEW_BEGIN_SENTINEL];
  pushUint32LE(out, 1); // tamaño del área: sólo el contador
  out.push(0); // cero imágenes
  out.push(...PREVIEW_BEGIN_SENTINEL.map((byte) => byte ^ 0xff));
  if (out.length !== PREVIEW_LENGTH) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      out.length,
      "The preview emitter produced an unexpected length.",
    );
  }
  return Uint8Array.from(out);
}

/** ObjFreeSpace (capítulo 21): 53 bytes con los valores que escribe la ODA. */
export function buildObjFreeSpace(objectCount: number, objectsStart: number): Uint8Array {
  const out: number[] = [];
  pushUint32LE(out, 0);
  pushUint32LE(out, objectCount);
  pushUint32LE(out, TDUPDATE[0]);
  pushUint32LE(out, TDUPDATE[1]);
  pushUint32LE(out, objectsStart);
  out.push(4); // cuatro valores de 64 bits a continuación
  for (const value of [0x32, 0x64, 0x200, 0xffffffff]) {
    pushUint32LE(out, value);
    pushUint32LE(out, 0);
  }
  if (out.length !== 53) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      out.length,
      "The ObjFreeSpace emitter produced an unexpected length.",
    );
  }
  return Uint8Array.from(out);
}

export interface SecondHeaderExtent {
  readonly start: number;
  readonly size: number;
}

export interface SecondHeaderInput {
  readonly headerVariables: SecondHeaderExtent;
  readonly classes: SecondHeaderExtent;
  readonly objectMap: SecondHeaderExtent;
  readonly objFreeSpace: SecondHeaderExtent;
  readonly handseed: number;
}

/**
 * SECOND FILE HEADER (capítulo 26 + medición bit a bit del corpus): flujo de
 * bits entre centinelas, con la localización y los localizadores como BL en
 * forma RL FORZADA (válida para cualquier lector y alineada a byte para los
 * registros de handle), los seis bytes medidos tras el mantenimiento, los
 * registros extra {4: 0,1} y {5: AuxHeader}, los 14 registros de handle y el
 * CRC 0xC0C1 desde el campo de tamaño, más los 8 bytes de cola a cero.
 */
export function buildSecondHeader(
  location: number,
  input: SecondHeaderInput,
): Uint8Array {
  const handleRecords: readonly { id: number; value: number }[] = [
    { id: 0, value: input.handseed },
    { id: 1, value: H_BLOCK_CONTROL },
    { id: 2, value: H_LAYER_CONTROL },
    { id: 3, value: H_STYLE_CONTROL },
    { id: 4, value: H_LTYPE_CONTROL },
    { id: 5, value: H_VIEW_CONTROL },
    { id: 6, value: H_UCS_CONTROL },
    { id: 7, value: H_VPORT_CONTROL },
    { id: 8, value: H_APPID_CONTROL },
    { id: 9, value: H_DIMSTYLE_CONTROL },
    { id: 10, value: H_VPENT_CONTROL },
    { id: 11, value: H_NOD },
    { id: 12, value: H_MLSTYLE_DICT },
    { id: 13, value: H_GROUP_DICT },
  ];
  const recordsBytes = handleRecords.reduce(
    (total, record) => total + 2 + Math.max(1, byteLengthOf(record.value)),
    0,
  );
  // 85 bytes fijos hasta el final del recuento BS(14) con los BL en forma RL.
  const PRE_RECORDS_BYTES = 85;
  const sectionSize = PRE_RECORDS_BYTES + recordsBytes + 2 + 8;

  const emitter = new DwgBitEmitter();
  emitter.emitRL(sectionSize);
  emitForcedLongBL(emitter, location);
  for (const byte of AC1015_MAGIC) emitter.emitRC(byte);
  for (let index = 0; index < 5; index += 1) emitter.emitRC(0);
  emitter.emitRC(MAINTENANCE_VERSION);
  emitter.pushBits(0, 4);
  for (const byte of SECOND_HEADER_MAGIC_BYTES) emitter.emitRC(byte);
  const locators: readonly { id: number; start: number; size: number }[] = [
    { id: 0, ...input.headerVariables },
    { id: 1, ...input.classes },
    { id: 2, ...input.objectMap },
    { id: 3, ...input.objFreeSpace },
    { id: 4, start: 0, size: 1 }, // registro extra medido (semántica sin nombrar)
    { id: 5, start: AUX_HEADER_START, size: AUX_HEADER_LENGTH },
  ];
  for (const locator of locators) {
    emitter.emitRC(locator.id);
    emitForcedLongBL(emitter, locator.start);
    emitForcedLongBL(emitter, locator.size);
  }
  emitter.emitBS(handleRecords.length);
  if (emitter.bitLength !== PRE_RECORDS_BYTES * 8) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      emitter.bitLength,
      "The second header prefix is not byte aligned as designed.",
    );
  }
  for (const record of handleRecords) {
    const bytes = handleValueBytes(record.value);
    emitter.emitRC(bytes.length);
    emitter.emitRC(record.id);
    for (const byte of bytes) emitter.emitRC(byte);
  }
  const crc = crc16Dwg(emitter.toBytes(), 0xc0c1);
  emitter.emitRS(crc);
  for (let index = 0; index < 8; index += 1) emitter.emitRC(0);

  const body = emitter.toBytes();
  if (body.length !== sectionSize) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      body.length,
      "The second header body does not match its declared size.",
    );
  }
  const out = new Uint8Array(16 + body.length + 16);
  out.set(Uint8Array.from(SECOND_HEADER_BEGIN_SENTINEL), 0);
  out.set(body, 16);
  out.set(Uint8Array.from(SECOND_HEADER_END_SENTINEL), 16 + body.length);
  return out;
}

/** BL en forma larga forzada: bandera 00 + RL (válida para todo lector). */
function emitForcedLongBL(emitter: DwgBitEmitter, value: number): void {
  emitter.pushBits(0b00, 2);
  emitter.emitRL(value);
}

/**
 * Posición en la cadena de entidades de un espacio o bloque: el lector ajeno
 * RECORRE la lista enlazada desde el `first` del BLOCK_RECORD, así que cada
 * entidad declara su lugar (hecho verificado contra el oráculo el 2026-08-21:
 * con punteros nulos sólo sobrevivía la primera entidad de cada cadena).
 */
export function handleValueBytes(value: number): number[] {
  if (value === 0) return [0];
  const bytes: number[] = [];
  let rest = value;
  while (rest > 0) {
    bytes.unshift(rest % 0x100);
    rest = Math.floor(rest / 0x100);
  }
  return bytes;
}

export function byteLengthOf(value: number): number {
  let length = 0;
  let rest = value;
  while (rest > 0) {
    length += 1;
    rest = Math.floor(rest / 0x100);
  }
  return length;
}
// ---------------------------------------------------------------------------
// Validación de opciones (fallo cerrado)
// ---------------------------------------------------------------------------

/** Un bloque YA normalizado: sus entidades son siempre la forma larga. */
export interface ValidatedBlockSpec {
  readonly name: readonly number[];
  readonly entities: readonly Ac1015MinimalFileEntitySpec[];
}

export interface ValidatedOptions {
  readonly layers: readonly Ac1015MinimalFileLayerSpec[];
  readonly linetypes: readonly Ac1015MinimalFileLinetypeSpec[];
  readonly blocks: readonly ValidatedBlockSpec[];
  readonly entities: readonly Ac1015MinimalFileEntitySpec[];
  readonly measurement: 0 | 1;
}

/**
 * Resuelve la forma corta de una entidad de bloque (`DwgGeometryEntity` a
 * secas) a la larga (`{ entity }`, capa "0" implícita) — la forma larga pasa
 * tal cual. El discriminador es la presencia de `entity`: ninguna entidad
 * neutral del modelo tiene ese campo en su nivel superior.
 */
function normalizeBlockEntity(
  item: Ac1015MinimalFileBlockSpec["entities"][number],
): Ac1015MinimalFileEntitySpec {
  if (typeof item === "object" && item !== null && "entity" in item) {
    return item as Ac1015MinimalFileEntitySpec;
  }
  return { entity: item as DwgGeometryEntity };
}

export function validateOptions(options: Ac1015MinimalFileOptions): ValidatedOptions {
  if (typeof options !== "object" || options === null) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The minimal file options must be an object.",
    );
  }
  const layers = options.layers ?? [];
  const linetypes = options.linetypes ?? [];
  const blocks = options.blocks ?? [];
  const entities = options.entities ?? [];
  const measurement = options.measurement ?? 0;
  if (
    !Array.isArray(layers) ||
    !Array.isArray(linetypes) ||
    !Array.isArray(blocks) ||
    !Array.isArray(entities)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The minimal file layers, linetypes, blocks and entities must be arrays.",
    );
  }
  if (measurement !== 0 && measurement !== 1) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The MEASUREMENT variable must be 0 (English) or 1 (metric).",
    );
  }
  for (const layer of layers) {
    assertNameBytes(layer.name, "A minimal file layer name");
  }
  const normalizedBlocks: ValidatedBlockSpec[] = blocks.map((block) => {
    assertNameBytes(block.name, "A minimal file block name");
    if (!Array.isArray(block.entities)) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A minimal file block needs an entities array.",
      );
    }
    const normalizedEntities = block.entities.map(normalizeBlockEntity);
    for (const spec of normalizedEntities) {
      assertEntitySpec(spec, layers, blocks.length);
    }
    return { name: block.name, entities: normalizedEntities };
  });
  entities.forEach((spec) => {
    assertEntitySpec(spec, layers, blocks.length);
  });
  return { layers, linetypes, blocks: normalizedBlocks, entities, measurement };
}

/**
 * Un `Ac1015MinimalFileEntitySpec` es válido tanto en model space como
 * dentro de un bloque — misma forma, misma validación (cero marcos gemelos).
 * Un INSERT dentro de un bloque referencia OTRO bloque por índice, igual que
 * en model space: el handle de cada BLOCK_RECORD ya está resuelto por
 * adelantado (`planAc1015MinimalFile`), así que una referencia hacia
 * adelante en `blocks` resuelve igual que una hacia atrás.
 */
function assertEntitySpec(
  spec: Ac1015MinimalFileEntitySpec,
  layers: readonly Ac1015MinimalFileLayerSpec[],
  blocksCount: number,
): void {
  const layerIndex = spec.layerIndex ?? 0;
  if (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex > layers.length) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A minimal file entity layer index escapes the declared layers.",
    );
  }
  if (spec.entity.kind === "insert") {
    const blockIndex = spec.insertBlockIndex;
    if (
      blockIndex === undefined ||
      !Number.isInteger(blockIndex) ||
      blockIndex < 0 ||
      blockIndex >= blocksCount
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "An INSERT entity needs the index of a declared block.",
      );
    }
  } else if (spec.insertBlockIndex !== undefined) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Only an INSERT entity may name an inserted block.",
    );
  }
}

function assertNameBytes(name: readonly number[], what: string): void {
  if (!Array.isArray(name) || name.length < 1 || name.length > 0xff) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      `${what} needs between 1 and 255 byte values.`,
    );
  }
  for (const byte of name) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        `${what} must hold byte values between 0 and 255.`,
      );
    }
  }
}
// ---------------------------------------------------------------------------
// Primitivas de bytes little-endian del ensamblado
// ---------------------------------------------------------------------------

export function pushUint16LE(into: number[], value: number): void {
  into.push(value & 0xff, (value >> 8) & 0xff);
}

export function pushUint32LE(into: number[], value: number): void {
  into.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

export function pushRecord(into: number[], id: number, start: number, size: number): void {
  into.push(id & 0xff);
  pushUint32LE(into, start);
  pushUint32LE(into, size);
}
