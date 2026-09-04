/**
 * Emisores con referencias RESUELTAS al estilo del ARCHIVO REAL — campaña
 * 2026-08-21, OLA 3 (partido de `ac1015-structure-writers.ts` por el
 * presupuesto de 800 líneas del monorepo; misma semántica, cero cambios).
 *
 * Aquí viven los cuerpos que llevan el flujo de handles MEDIDO en el corpus:
 * LAYER resuelta (control/plotstyle/linetype reales), BLOCK_RECORD con sus
 * punteros primera/última entidad, los marcadores BLOCK/ENDBLK con modo de
 * espacio, y la entidad con cadena resuelta (posiciones first/middle/last de
 * la lista enlazada que un lector ajeno recorre — hecho verificado contra el
 * oráculo externo: sin `next`, sólo sobrevive la primera entidad).
 */
import {
  AC1015_TYPE_BLOCK,
  AC1015_TYPE_BLOCK_HEADER,
  AC1015_TYPE_ENDBLK,
} from "../objects/table-block.js";
import { AC1015_TYPE_LAYER } from "../objects/table-layer.js";
import { throwDwgError } from "../security/parse-error.js";
import type { DwgGeometryEntity } from "../model/entity-geometry.js";
import {
  composeAc1015ObjectBody,
  DwgBitEmitter,
  writeAc1015EntityBody,
  type Ac1015InsertAttributeHandles,
} from "./ac1015-entity-writer.js";
import { emitAc1015TableObjectCommonTail } from "./ac1015-table-writer.js";
import {
  assertHandle,
  assertName,
  emitRef,
  emitTableEntryHead,
  ref,
} from "./ac1015-structure-writers.js";

// ---------------------------------------------------------------------------
// LAYER con referencias RESUELTAS (la del writer de tablas lleva nulos).
// ---------------------------------------------------------------------------

export interface Ac1015ResolvedLayerWriteSpec {
  readonly name: readonly number[];
  /** Índice de color CmC. Por defecto 7 (blanco/negro). */
  readonly colorIndex?: number;
  /** BS de estado crudo. Por defecto 1008, el valor medido de la capa "0". */
  readonly stateFlags?: number;
  readonly controlHandle: number;
  /** Handle del estilo de trazado (el placeholder "Normal"). */
  readonly plotStyleHandle: number;
  /** Handle del LTYPE de la capa (Continuous en el esquema canónico). */
  readonly linetypeHandle: number;
}

/**
 * Cuerpo de un LAYER (20.4.54) con el flujo RESUELTO que llevan los archivos
 * reales: control H(4), xdic H(3,0), xref H(5,0), plotstyle H(5) y tipo de
 * línea H(5). El writer de la fase D3 (`writeAc1015LayerBody`) emite nulos
 * confesos y sigue siendo válido para el round-trip de laboratorio; ESTE es
 * el que viaja en el archivo completo.
 */
export function writeAc1015ResolvedLayerBody(
  spec: Ac1015ResolvedLayerWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "A layer handle");
  assertHandle(spec.controlHandle, "A layer control handle");
  assertHandle(spec.plotStyleHandle, "A layer plot style handle");
  assertHandle(spec.linetypeHandle, "A layer linetype handle");
  assertName(spec.name, "A layer name");
  const colorIndex = spec.colorIndex ?? 7;
  const stateFlags = spec.stateFlags ?? 1008;
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
  emitTableEntryHead(tail, spec.name);
  tail.emitBS(stateFlags);
  tail.emitBS(colorIndex);
  return composeAc1015ObjectBody(AC1015_TYPE_LAYER, tail, (stream) => {
    emitRef(stream, ref(4, spec.controlHandle));
    emitRef(stream, ref(3, 0));
    emitRef(stream, ref(5, 0));
    emitRef(stream, ref(5, spec.plotStyleHandle));
    emitRef(stream, ref(5, spec.linetypeHandle));
  });
}

// ---------------------------------------------------------------------------
// BLOCK_RECORD con el flujo REAL y BLOCK/ENDBLK con modo de espacio.
// ---------------------------------------------------------------------------

export interface Ac1015StructBlockRecordWriteSpec {
  readonly name: readonly number[];
  readonly controlHandle: number;
  /** Entidad BLOCK que abre el contenido (H(3), hard owner). */
  readonly blockEntityHandle: number;
  /** Primera entidad real del bloque; ausente = H(4,0). */
  readonly firstEntityHandle?: number;
  /** Última entidad real del bloque; ausente = H(4,0). */
  readonly lastEntityHandle?: number;
  /** Entidad ENDBLK que cierra el contenido (H(3), hard owner). */
  readonly endblkHandle: number;
  /** LAYOUT asociado (espacios modelo/papel); ausente = H(5,0). */
  readonly layoutHandle?: number;
}

/**
 * Cuerpo de un BLOCK HEADER (20.4.52) con la disposición y el flujo MEDIDOS:
 * `control H(4) · xdic H(3,0) · NULL H(5,0) · BLOCK H(3) · primera H(4) ·
 * última H(4) · ENDBLK H(3) · layout H(5)`. El writer D4
 * (`writeAc1015BlockRecordBody`) conserva su disposición de laboratorio;
 * éste es el espejo del archivo real.
 */
export function writeAc1015StructBlockRecordBody(
  spec: Ac1015StructBlockRecordWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "A block record handle");
  assertHandle(spec.controlHandle, "A block record control handle");
  assertHandle(spec.blockEntityHandle, "A block record BLOCK handle");
  assertHandle(spec.endblkHandle, "A block record ENDBLK handle");
  assertName(spec.name, "A block record name");
  for (const optional of [
    spec.firstEntityHandle,
    spec.lastEntityHandle,
    spec.layoutHandle,
  ]) {
    if (optional !== undefined) {
      assertHandle(optional, "A block record pointer");
    }
  }

  const tail = new DwgBitEmitter();
  emitAc1015TableObjectCommonTail(tail, ownHandle);
  emitTableEntryHead(tail, spec.name);
  tail.pushBit(0); // no anónimo
  tail.pushBit(0); // sin ATTDEFs
  tail.pushBit(0); // no es xref
  tail.pushBit(0); // no es xref superpuesto
  tail.pushBit(0); // bit "loaded" R2000 (0 medido)
  tail.emitBD(0);
  tail.emitBD(0);
  tail.emitBD(0); // punto base en el origen
  tail.emitTV([]); // ruta de xref vacía
  tail.emitRC(0); // recuentos de inserción: sólo el terminador
  tail.emitTV([]); // descripción vacía
  tail.emitBL(0); // sin previsualización
  return composeAc1015ObjectBody(AC1015_TYPE_BLOCK_HEADER, tail, (stream) => {
    emitRef(stream, ref(4, spec.controlHandle));
    emitRef(stream, ref(3, 0));
    emitRef(stream, ref(5, 0)); // NULL hard pointer del formato
    emitRef(stream, ref(3, spec.blockEntityHandle));
    emitRef(stream, ref(4, spec.firstEntityHandle ?? 0));
    emitRef(stream, ref(4, spec.lastEntityHandle ?? 0));
    emitRef(stream, ref(3, spec.endblkHandle));
    emitRef(stream, ref(5, spec.layoutHandle ?? 0));
  });
}

/**
 * Modo de espacio de una entidad estructural BLOCK/ENDBLK: 2 = model space,
 * 1 = paper space, 0 = contenido de un bloque de usuario (dueño en el flujo).
 * Son los tres valores MEDIDOS en el corpus.
 */
export type Ac1015SpaceMode = 0 | 1 | 2;

export interface Ac1015StructBlockMarkerWriteSpec {
  /** Sólo BLOCK: nombre de la entidad (p. ej. "*Model_Space"). */
  readonly name?: readonly number[];
  readonly mode: Ac1015SpaceMode;
  /** Obligatorio en modo 0: el BLOCK_RECORD dueño. */
  readonly ownerBlockRecordHandle?: number;
  /** Capa de la entidad (H(5)); la capa "0" en el esquema canónico. */
  readonly layerHandle: number;
}

/**
 * Común de entidad al estilo del ARCHIVO REAL: sin gráfico, modo dado,
 * cero reactores, bit de vínculos a 0 (prev/next nulos viajan en el flujo),
 * color ByLayer, escala 1, banderas ByLayer, visible, lineweight 0x1D.
 * Es la variante medida del común D2 (`emitAc1015EntityCommonTail` emite
 * vínculos implícitos con bit 1); las dos formas son válidas para el lector
 * propio — ésta es la que escriben los productores reales.
 */
function emitStructEntityCommon(
  tail: DwgBitEmitter,
  ownHandle: number,
  mode: Ac1015SpaceMode,
): void {
  tail.emitH(0, ownHandle);
  tail.emitBS(0); // EED vacío
  tail.pushBit(0); // sin gráfico de previsualización
  tail.pushBits(mode, 2);
  tail.emitBL(0); // cero reactores
  tail.pushBit(0); // vínculos EXPLÍCITOS: prev/next viajan en el flujo
  tail.emitBS(256); // color ByLayer
  tail.emitBD(1); // escala de tipo de línea
  tail.pushBits(0b00, 2); // linetype ByLayer
  tail.pushBits(0b00, 2); // plotstyle ByLayer
  tail.emitBS(0); // visible
  tail.emitRC(0x1d); // lineweight ByLayer
}

/** Flujo común de un marcador BLOCK/ENDBLK medido: xdic, prev, next, capa. */
function emitMarkerHandleStream(
  stream: DwgBitEmitter,
  spec: Ac1015StructBlockMarkerWriteSpec,
): void {
  if (spec.mode === 0) {
    emitRef(stream, ref(4, spec.ownerBlockRecordHandle ?? 0));
  }
  emitRef(stream, ref(3, 0)); // xdictionary nulo
  emitRef(stream, ref(4, 0)); // entidad previa nula
  emitRef(stream, ref(4, 0)); // entidad siguiente nula
  emitRef(stream, ref(5, spec.layerHandle));
}

function assertMarkerSpec(
  spec: Ac1015StructBlockMarkerWriteSpec,
  what: string,
): void {
  if (spec.mode !== 0 && spec.mode !== 1 && spec.mode !== 2) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      `${what} needs a space mode of 0, 1 or 2.`,
    );
  }
  if (spec.mode === 0) {
    assertHandle(
      spec.ownerBlockRecordHandle ?? 0,
      `${what} owner block record handle`,
    );
  }
  assertHandle(spec.layerHandle, `${what} layer handle`);
}

/** Entidad BLOCK que abre un espacio o un bloque, al estilo del archivo real. */
export function writeAc1015StructBlockBeginBody(
  spec: Ac1015StructBlockMarkerWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "A block begin handle");
  assertMarkerSpec(spec, "A block begin");
  assertName(spec.name ?? [], "A block begin name");

  const tail = new DwgBitEmitter();
  emitStructEntityCommon(tail, ownHandle, spec.mode);
  tail.emitTV([...(spec.name ?? [])]);
  return composeAc1015ObjectBody(AC1015_TYPE_BLOCK, tail, (stream) => {
    emitMarkerHandleStream(stream, spec);
  });
}

/** Entidad ENDBLK que cierra un espacio o un bloque, al estilo real. */
export function writeAc1015StructBlockEndBody(
  spec: Ac1015StructBlockMarkerWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "A block end handle");
  assertMarkerSpec(spec, "A block end");

  const tail = new DwgBitEmitter();
  emitStructEntityCommon(tail, ownHandle, spec.mode);
  return composeAc1015ObjectBody(AC1015_TYPE_ENDBLK, tail, (stream) => {
    emitMarkerHandleStream(stream, spec);
  });
}

// ---------------------------------------------------------------------------
// Entidad con referencias RESUELTAS: el cuerpo D2 con el flujo del archivo
// real (vínculos explícitos nulos + capa), SIN emisores de geometría gemelos.
// ---------------------------------------------------------------------------

/**
 * Posición de la entidad en la CADENA de su espacio o bloque. El lector
 * ajeno recorre la lista enlazada desde el puntero `first` del BLOCK_RECORD:
 * una cadena con `next` nulo se corta tras la primera entidad (hecho
 * verificado contra el oráculo externo el 2026-08-21 — sólo sobrevivía la
 * primera). Las formas son las MEDIDAS en el corpus:
 * - "isolated": prev H(4,0) y next H(4,0) explícitos y nulos;
 * - "first": prev H(4,0) nulo y next H(6,0) — código 6 = handle propio + 1;
 * - "middle": bit de vínculos implícitos a 1, sin punteros en el flujo
 *   (prev/next = handle ± 1);
 * - "last": prev H(8,0) — código 8 = handle propio − 1 — y next H(4,0).
 * Las posiciones no "middle" exigen que los handles de la cadena sean
 * CONSECUTIVOS, y el writer de archivo los reparte así.
 */
export type Ac1015EntityChainPosition = "isolated" | "first" | "middle" | "last";

export interface Ac1015ResolvedEntityRefs {
  /** Presente: modo 0, dueño en el flujo. Ausente: modo 2 (model space). */
  readonly ownerBlockHandle?: number;
  /** Capa de la entidad (H(5)). */
  readonly layerHandle: number;
  /** Sólo INSERT: hard pointer al BLOCK_RECORD insertado. */
  readonly insertBlockHandle?: number;
  /**
   * Sólo TEXT y ATTRIB: hard pointer a su STYLE (grupo 7; capítulo 20.4.3 —
   * el oráculo externo rechaza un TEXT sin él con "Object improperly read").
   * El ATTRIB lo lleva igual que el TEXT: hecho registrado, y medido en los
   * cinco ATTRIB del corpus admitido, todos con H(5,0x11) cerrando su flujo.
   */
  readonly textStyleHandle?: number;
  /**
   * Sólo INSERT con atributos: primer y último ATTRIB (punteros blandos) y
   * SEQEND (propietario duro), detrás del hard pointer al bloque. Es la
   * forma MEDIDA en los cuatro INSERT con atributos del corpus.
   */
  readonly attributeHandles?: Ac1015InsertAttributeHandles;
  /** Posición en la cadena de entidades. Por defecto, "isolated". */
  readonly chainPosition?: Ac1015EntityChainPosition;
}

/**
 * Emite el cuerpo de una entidad REAL con el flujo de handles RESUELTO:
 * `[dueño H(4)] xdic H(3,0) prev H(4,0) next H(4,0) capa H(5) [estilo H(5)]
 * [bloque H(5)] [1er ATTRIB H(4) último ATTRIB H(4) SEQEND H(3)]`
 * — la forma medida en el corpus (los productores reales escriben vínculos
 * explícitos nulos, no la cadena implícita del común D2).
 *
 * NO duplica los emisores de geometría: compone llamando a
 * `writeAc1015EntityBody` (que valida la geometría y emite tipo + tamaño +
 * común + datos) y REUSA sus bits de datos tal cual; sólo el bit de vínculos
 * — cuya posición es función determinista del handle — pasa de 1 a 0 para
 * declarar los punteros que este flujo añade. Un writer que dejara el bit en
 * 1 y añadiera punteros mentiría sobre su propio flujo; el fallo es cerrado
 * si el cuerpo base no tiene la forma esperada.
 */
export function writeAc1015ResolvedEntityBody(
  entity: DwgGeometryEntity,
  ownHandle: number,
  refs: Ac1015ResolvedEntityRefs,
): Uint8Array {
  assertHandle(refs.layerHandle, "An entity layer handle");
  const wantsStyle = entity.kind === "text" || entity.kind === "attrib";
  if (refs.textStyleHandle !== undefined) {
    assertHandle(refs.textStyleHandle, "An entity text style handle");
    if (!wantsStyle) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "Only a TEXT or ATTRIB entity may reference a text style.",
      );
    }
  }
  if (wantsStyle && refs.textStyleHandle === undefined) {
    // Un TEXT sin su STYLE es exactamente lo que el oráculo rechaza: fallo
    // cerrado aquí en vez de emitir un flujo que un lector ajeno no acepta.
    // El ATTRIB cierra su flujo igual, así que se le exige lo mismo.
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A TEXT or ATTRIB entity requires the handle of its text style.",
    );
  }
  // Los handles de los atributos se pasan al writer base para que sea ÉL
  // —una sola vez, en un solo sitio— quien exija que la bandera de ATTRIBs y
  // sus tres punteros viajen juntos. Este writer reconstruye después el
  // flujo entero, pero la validación no se duplica.
  const base = writeAc1015EntityBody(entity, ownHandle, {
    ...(refs.ownerBlockHandle === undefined
      ? {}
      : { ownerBlockHandle: refs.ownerBlockHandle }),
    ...(refs.insertBlockHandle === undefined
      ? {}
      : { insertBlockHandle: refs.insertBlockHandle }),
    ...(refs.attributeHandles === undefined
      ? {}
      : { insertAttributeHandles: refs.attributeHandles }),
  });

  // Disposición del cuerpo base (invariante del writer D2): tipo BS en forma
  // "01"+RC (los siete tipos emisibles caben en un byte), tamaño RL, handle
  // H(0,own), EED BS(0) en 2 bits, bit de gráfico, 2 bits de modo, BL(0) de
  // reactores en 2 bits y el bit de vínculos. Su posición es determinista.
  const ownByteLength = byteLengthOf(ownHandle);
  const noLinksBitIndex = 10 + 32 + 8 + 8 * ownByteLength + 2 + 1 + 2 + 2;

  const reader = new MsbBitReader(base);
  const typeFlag = reader.readBits(2);
  if (typeFlag !== 0b01) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      0,
      "The base entity body does not start with the expected short type form.",
    );
  }
  reader.readBits(8); // el RC del tipo
  const declaredBits = readRawRL(reader);
  if (
    declaredBits <= noLinksBitIndex ||
    Math.ceil(declaredBits / 8) > base.length
  ) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      0,
      "The base entity body declares an impossible bit size.",
    );
  }
  if (bitAt(base, noLinksBitIndex) !== 1) {
    // El común D2 emite SIEMPRE vínculos implícitos; otro valor delata que
    // el writer base cambió de forma y esta composición quedó desfasada.
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      0,
      "The base entity body does not carry the implicit-links bit this writer expects.",
    );
  }

  const chainPosition = refs.chainPosition ?? "isolated";
  if (!["isolated", "first", "middle", "last"].includes(chainPosition)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An entity chain position must be isolated, first, middle or last.",
    );
  }
  // "middle" conserva el bit de vínculos implícitos (prev/next = handle ± 1);
  // las otras posiciones lo bajan a 0 y declaran sus punteros en el flujo.
  const explicitLinks = chainPosition !== "middle";

  const body = new DwgBitEmitter();
  for (let index = 0; index < declaredBits; index += 1) {
    if (index === noLinksBitIndex && explicitLinks) {
      body.pushBit(0);
    } else {
      body.pushBit(bitAt(base, index));
    }
  }
  if (refs.ownerBlockHandle !== undefined) {
    body.emitH(4, refs.ownerBlockHandle);
  }
  body.emitH(3, 0); // xdictionary nulo
  if (chainPosition === "isolated") {
    body.emitH(4, 0); // sin entidad previa
    body.emitH(4, 0); // sin entidad siguiente
  } else if (chainPosition === "first") {
    body.emitH(4, 0); // sin entidad previa
    body.emitH(6, 0); // siguiente = handle propio + 1 (forma medida)
  } else if (chainPosition === "last") {
    body.emitH(8, 0); // previa = handle propio − 1 (forma medida)
    body.emitH(4, 0); // sin entidad siguiente
  }
  body.emitH(5, refs.layerHandle);
  if (refs.textStyleHandle !== undefined) {
    body.emitH(5, refs.textStyleHandle);
  }
  if (refs.insertBlockHandle !== undefined) {
    body.emitH(5, refs.insertBlockHandle);
  }
  if (refs.attributeHandles !== undefined) {
    body.emitH(4, refs.attributeHandles.firstAttribHandle);
    body.emitH(4, refs.attributeHandles.lastAttribHandle);
    body.emitH(3, refs.attributeHandles.seqendHandle);
  }
  return body.toBytes();
}

/** Bytes mínimos big-endian de un handle (0 → 0 bytes). */
function byteLengthOf(value: number): number {
  let length = 0;
  let rest = value;
  while (rest > 0) {
    length += 1;
    rest = Math.floor(rest / 0x100);
  }
  return length;
}

function bitAt(bytes: Uint8Array, index: number): 0 | 1 {
  const byte = bytes[index >> 3];
  if (byte === undefined) {
    throwDwgError(
      "DWG_INTERNAL_ERROR",
      "internal",
      index >> 3,
      "A bit index escaped the base entity body.",
    );
  }
  return ((byte >> (7 - (index & 7))) & 1) as 0 | 1;
}

/** Lector de bits MSB-first mínimo para verificar el prólogo del cuerpo base. */
class MsbBitReader {
  readonly #bytes: Uint8Array;
  #index = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  readBits(width: number): number {
    let value = 0;
    for (let count = 0; count < width; count += 1) {
      value = value * 2 + bitAt(this.#bytes, this.#index);
      this.#index += 1;
    }
    return value;
  }
}

/** RL crudo dentro del flujo de bits: 4 bytes little-endian. */
function readRawRL(reader: MsbBitReader): number {
  const b0 = reader.readBits(8);
  const b1 = reader.readBits(8);
  const b2 = reader.readBits(8);
  const b3 = reader.readBits(8);
  return b0 + b1 * 0x100 + b2 * 0x1_0000 + b3 * 0x100_0000;
}
