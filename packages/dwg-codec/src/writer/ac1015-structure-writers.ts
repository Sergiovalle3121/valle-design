/**
 * Emisores de los objetos ESTRUCTURALES R2000 que faltaban — campaña
 * 2026-08-21, OLA 3 (el writer de archivo completo).
 *
 * Un archivo AC1015 que un lector ajeno acepte no lleva sólo entidades: lleva
 * el esqueleto completo de tablas y diccionarios — DICTIONARY, STYLE, LTYPE,
 * APPID, DIMSTYLE, VPORT, MLINESTYLE, LAYOUT, ACDBPLACEHOLDER, los CONTROLES
 * de todas las tablas y los BLOCK_RECORD con su flujo REAL de punteros. Este
 * módulo emite esos cuerpos, cada uno componiendo con
 * `composeAc1015ObjectBody` y `emitAc1015TableObjectCommonTail` existentes
 * (cero marcos gemelos).
 *
 * DISPOSICIONES: capítulo 20 de ODA-ODS-DWG-5.4.1-PUBLIC (SOURCE_REGISTER)
 * para el orden de campos, y el fixture 01-vacio de NUESTRO corpus admitido
 * (dibujo first-party convertido por la herramienta independiente con
 * licencia; medición bit a bit del 2026-08-21) para los VALORES por defecto y
 * los códigos exactos del flujo de handles: dueño nulo como H(4,tam 0),
 * xdictionary nulo como H(3,0), punteros duros nulos como H(5,0), entradas de
 * control como H(2,handle) y los colgantes de control como H(3,handle).
 *
 * Reglas del laboratorio: determinista (mismo spec y handle → mismos bits),
 * fallo cerrado ante specs imposibles, cero dependencias y NINGUNA constante
 * gemela con el lector: los tipos que el lector ya nombra se importan de sus
 * módulos; los que el lector aún no decodifica se declaran aquí una sola vez.
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
} from "./ac1015-entity-writer.js";
import { emitAc1015TableObjectCommonTail } from "./ac1015-table-writer.js";

// ---------------------------------------------------------------------------
// Códigos de tipo de los objetos estructurales que el LECTOR aún no decodifica
// (hechos del capítulo 20 de la ODS, confirmados en el fixture 01-vacio).
// Una sola fuente: cuando el lector aprenda estos tipos, deberá importarlos
// de aquí o mover la constante a su módulo de objeto — nunca duplicarla.
// ---------------------------------------------------------------------------
export const AC1015_TYPE_DICTIONARY = 42;
export const AC1015_TYPE_STYLE_CONTROL = 52;
export const AC1015_TYPE_STYLE = 53;
export const AC1015_TYPE_LTYPE_CONTROL = 56;
export const AC1015_TYPE_LTYPE = 57;
export const AC1015_TYPE_VIEW_CONTROL = 60;
export const AC1015_TYPE_UCS_CONTROL = 62;
export const AC1015_TYPE_VPORT_CONTROL = 64;
export const AC1015_TYPE_VPORT = 65;
export const AC1015_TYPE_APPID_CONTROL = 66;
export const AC1015_TYPE_APPID = 67;
export const AC1015_TYPE_DIMSTYLE_CONTROL = 68;
export const AC1015_TYPE_DIMSTYLE = 69;
export const AC1015_TYPE_VPENT_CONTROL = 70;
export const AC1015_TYPE_MLINESTYLE = 73;

/** Tope de bytes de un nombre emitido: mismo límite corto del laboratorio. */
export const AC1015_STRUCT_WRITER_MAX_NAME_BYTES = 0xff;

/**
 * Una referencia cruda del flujo de handles: código de 4 bits + valor. El
 * valor 0 emite un contador de cero bytes — la forma nula MEDIDA en el
 * corpus (H(4,0) dueño nulo, H(3,0) xdictionary nulo, H(5,0) puntero nulo).
 */
export interface Ac1015StructHandleRef {
  readonly code: number;
  readonly value: number;
}

function ref(code: number, value: number): Ac1015StructHandleRef {
  return Object.freeze({ code, value });
}

/** Emite una referencia validando código y valor (fallo cerrado). */
function emitRef(stream: DwgBitEmitter, reference: Ac1015StructHandleRef): void {
  if (
    !Number.isInteger(reference.code) ||
    reference.code < 0 ||
    reference.code > 0xf ||
    !Number.isSafeInteger(reference.value) ||
    reference.value < 0
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A handle-stream reference needs a 4-bit code and a non-negative value.",
    );
  }
  stream.emitH(reference.code, reference.value);
}

function assertHandle(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      `${what} must be a positive safe integer.`,
    );
  }
}

function assertName(name: readonly number[], what: string): void {
  if (
    !Array.isArray(name) ||
    name.length < 1 ||
    name.length > AC1015_STRUCT_WRITER_MAX_NAME_BYTES
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      `${what} needs between 1 and 255 byte values.`,
    );
  }
}

// ---------------------------------------------------------------------------
// CONTROLES de tabla con el flujo MEDIDO (dueño H(4,0), xdic H(3,0),
// entradas H(2,h) y colgantes con su código real).
// ---------------------------------------------------------------------------

/**
 * Cuerpo de un objeto de CONTROL de tabla con la disposición MEDIDA en el
 * corpus: común de tabla, recuento BL (sólo las entradas contadas) y flujo
 * `H(4,0) H(3,0) H(2,entrada)... colgantes...`. Los colgantes son los
 * punteros que el formato lleva FUERA del recuento — la tabla de bloques
 * lleva *Model_Space y *Paper_Space como H(3,handle); la de tipos de línea,
 * ByBlock y ByLayer como H(3,handle) (hechos medidos en 01-vacio).
 *
 * `postCountZeroBytes`: el control de DIMSTYLE (tipo 68) lleva UN byte a
 * cero tras el recuento que ningún otro control lleva (hecho medido: declara
 * 80 bits donde sus hermanos declaran 72; el oráculo externo rechaza el
 * cuerpo sin él con "Object improperly read: <AcDbDimStyleTable>").
 */
export function writeAc1015StructTableControlBody(
  type: number,
  entryHandles: readonly number[],
  ownHandle: number,
  trailingRefs: readonly Ac1015StructHandleRef[] = [],
  postCountZeroBytes = 0,
): Uint8Array {
  if (!Number.isInteger(type) || type < 0 || type > 0xffff) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A table-control type must fit in an unsigned 16-bit value.",
    );
  }
  assertHandle(ownHandle, "A table control handle");
  if (!Array.isArray(entryHandles) || !Array.isArray(trailingRefs)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A table control needs entry handles and trailing references as arrays.",
    );
  }
  for (const handle of entryHandles) {
    assertHandle(handle, "A table control entry handle");
  }

  if (
    !Number.isInteger(postCountZeroBytes) ||
    postCountZeroBytes < 0 ||
    postCountZeroBytes > 8
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A table control post-count padding must be a small non-negative integer.",
    );
  }
  const tail = new DwgBitEmitter();
  emitAc1015TableObjectCommonTail(tail, ownHandle);
  tail.emitBL(entryHandles.length);
  for (let index = 0; index < postCountZeroBytes; index += 1) {
    tail.emitRC(0);
  }
  return composeAc1015ObjectBody(type, tail, (stream) => {
    emitRef(stream, ref(4, 0)); // dueño nulo, forma medida
    emitRef(stream, ref(3, 0)); // xdictionary nulo, forma medida
    for (const handle of entryHandles) {
      emitRef(stream, ref(2, handle));
    }
    for (const trailing of trailingRefs) {
      emitRef(stream, trailing);
    }
  });
}

// ---------------------------------------------------------------------------
// DICTIONARY / DICTIONARYWDFLT / ACDBPLACEHOLDER
// ---------------------------------------------------------------------------

/** Una entrada de diccionario: nombre en bytes + handle del objeto. */
export interface Ac1015DictionaryEntrySpec {
  readonly name: readonly number[];
  readonly handle: number;
}

export interface Ac1015DictionaryWriteSpec {
  /**
   * Tipo BS del cuerpo: 42 para DICTIONARY; el código de clase (500+índice)
   * para ACDBDICTIONARYWDFLT, que añade el puntero al valor por defecto.
   */
  readonly type?: number;
  /** Handle del dueño (H(4)); 0 = dueño nulo (el NOD cuelga de la raíz). */
  readonly ownerHandle: number;
  /** Reactores persistentes (H(4,r) cada uno, como en el corpus). */
  readonly reactorHandles?: readonly number[];
  readonly entries: readonly Ac1015DictionaryEntrySpec[];
  /** Sólo DICTIONARYWDFLT: entrada por defecto (H(5), hard pointer). */
  readonly defaultEntryHandle?: number;
}

/**
 * Cuerpo de un DICTIONARY R2000 (capítulo 20.4.44) con los valores MEDIDOS:
 * bandera de clonación BS = 1, bandera hard-owner RC = 0, nombres TV en el
 * orden dado y flujo `H(4,dueño) reactores H(3,0) H(2,item)...`, más el
 * puntero por defecto H(5) cuando el spec es un DICTIONARYWDFLT.
 */
export function writeAc1015DictionaryBody(
  spec: Ac1015DictionaryWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "A dictionary handle");
  const type = spec.type ?? AC1015_TYPE_DICTIONARY;
  if (!Number.isInteger(type) || type < 0 || type > 0xffff) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A dictionary type must fit in an unsigned 16-bit value.",
    );
  }
  if (
    !Number.isSafeInteger(spec.ownerHandle) ||
    spec.ownerHandle < 0 ||
    !Array.isArray(spec.entries)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A dictionary needs a non-negative owner handle and an entries array.",
    );
  }
  const reactors = spec.reactorHandles ?? [];
  if (!Array.isArray(reactors)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The dictionary reactors must be an array.",
    );
  }
  for (const reactor of reactors) {
    assertHandle(reactor, "A dictionary reactor handle");
  }
  for (const entry of spec.entries) {
    assertName(entry.name, "A dictionary entry name");
    assertHandle(entry.handle, "A dictionary entry handle");
  }
  if (spec.defaultEntryHandle !== undefined) {
    assertHandle(spec.defaultEntryHandle, "A dictionary default entry handle");
  }

  // El común de tabla emite BL(0) reactores; un diccionario con reactores
  // REALES debe declararlos, así que el común se emite a mano: es el mismo
  // trío H + EED + reactores, con el recuento verdadero.
  const body = new DwgBitEmitter();
  body.emitH(0, ownHandle);
  body.emitBS(0); // EED vacío
  body.emitBL(reactors.length);
  body.emitBL(spec.entries.length);
  body.emitBS(1); // bandera de clonación (valor medido en todo el corpus)
  body.emitRC(0); // bandera hard-owner (valor medido)
  for (const entry of spec.entries) {
    body.emitTV([...entry.name]);
  }
  return composeAc1015ObjectBody(type, body, (stream) => {
    emitRef(stream, ref(4, spec.ownerHandle));
    for (const reactor of reactors) {
      emitRef(stream, ref(4, reactor));
    }
    emitRef(stream, ref(3, 0)); // xdictionary nulo
    for (const entry of spec.entries) {
      emitRef(stream, ref(2, entry.handle));
    }
    if (spec.defaultEntryHandle !== undefined) {
      emitRef(stream, ref(5, spec.defaultEntryHandle));
    }
  });
}

/**
 * Cuerpo de un ACDBPLACEHOLDER (clase; sin datos propios): común mínimo con
 * su reactor y flujo `H(4,dueño) H(4,dueño) H(3,0)` — la forma medida del
 * placeholder "Normal" del diccionario de estilos de trazado.
 */
export function writeAc1015PlaceholderBody(
  type: number,
  ownerHandle: number,
  ownHandle: number,
): Uint8Array {
  if (!Number.isInteger(type) || type < 0 || type > 0xffff) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A placeholder type must fit in an unsigned 16-bit value.",
    );
  }
  assertHandle(ownerHandle, "A placeholder owner handle");
  assertHandle(ownHandle, "A placeholder handle");
  const body = new DwgBitEmitter();
  body.emitH(0, ownHandle);
  body.emitBS(0); // EED vacío
  body.emitBL(1); // un reactor: su dueño (forma medida)
  return composeAc1015ObjectBody(type, body, (stream) => {
    emitRef(stream, ref(4, ownerHandle));
    emitRef(stream, ref(4, ownerHandle));
    emitRef(stream, ref(3, 0));
  });
}

// ---------------------------------------------------------------------------
// Entradas de tabla: STYLE, LTYPE, APPID, DIMSTYLE, VPORT, LAYER resuelta.
// ---------------------------------------------------------------------------

/** Cola común de una ENTRADA de tabla: nombre + 64-flag + xref (medidos). */
function emitTableEntryHead(tail: DwgBitEmitter, name: readonly number[]): void {
  tail.emitTV([...name]);
  tail.pushBit(1); // 64-flag del grupo 70 (valor medido en el corpus)
  tail.emitBS(0); // xrefindex+1: sin xref
  tail.pushBit(0); // no dependiente de xref
}

export interface Ac1015TextStyleWriteSpec {
  readonly name: readonly number[];
  readonly controlHandle: number;
  /** Nombre del archivo de fuente. Por defecto "txt" (valor medido). */
  readonly fontName?: readonly number[];
}

/**
 * Cuerpo de un STYLE (SHAPEFILE, 20.4.56) con los valores del Standard
 * medido: sin altura fija, factor de anchura 1, última altura 0.2, fuente
 * "txt". Flujo: control H(4), xdic H(3,0), bloque de xref H(5,0).
 */
export function writeAc1015TextStyleBody(
  spec: Ac1015TextStyleWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "A text style handle");
  assertHandle(spec.controlHandle, "A text style control handle");
  assertName(spec.name, "A text style name");
  const fontName = spec.fontName ?? [0x74, 0x78, 0x74]; // "txt"

  const tail = new DwgBitEmitter();
  emitAc1015TableObjectCommonTail(tail, ownHandle);
  emitTableEntryHead(tail, spec.name);
  tail.pushBit(0); // no vertical
  tail.pushBit(0); // no es un shape file
  tail.emitBD(0); // altura fija 0
  tail.emitBD(1); // factor de anchura 1
  tail.emitBD(0); // ángulo oblicuo 0
  tail.emitRC(0); // banderas de generación
  tail.emitBD(0.2); // última altura usada (valor medido)
  tail.emitTV([...fontName]);
  tail.emitTV([]); // sin bigfont
  return composeAc1015ObjectBody(AC1015_TYPE_STYLE, tail, (stream) => {
    emitRef(stream, ref(4, spec.controlHandle));
    emitRef(stream, ref(3, 0));
    emitRef(stream, ref(5, 0));
  });
}

export interface Ac1015LinetypeWriteSpec {
  readonly name: readonly number[];
  /** Descripción en bytes; vacía por defecto. */
  readonly description?: readonly number[];
  readonly controlHandle: number;
}

/**
 * Cuerpo de un LTYPE simple (20.4.58) sin guiones: longitud de patrón 0,
 * alineación 'A', cero guiones y el área de cadenas de 256 bytes a cero que
 * los R2000 reales llevan SIEMPRE (hecho medido: ByBlock/ByLayer/Continuous
 * del corpus, 279-293 bytes cada uno). Flujo: control, xdic nulo, xref nulo.
 */
export function writeAc1015LinetypeBody(
  spec: Ac1015LinetypeWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "A linetype handle");
  assertHandle(spec.controlHandle, "A linetype control handle");
  assertName(spec.name, "A linetype name");
  const description = spec.description ?? [];
  if (!Array.isArray(description) || description.length > 0xff) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A linetype description needs at most 255 byte values.",
    );
  }

  const tail = new DwgBitEmitter();
  emitAc1015TableObjectCommonTail(tail, ownHandle);
  emitTableEntryHead(tail, spec.name);
  tail.emitTV([...description]);
  tail.emitBD(0); // longitud de patrón
  tail.emitRC(0x41); // alineación 'A' (constante del formato)
  tail.emitRC(0); // cero guiones
  for (let index = 0; index < 256; index += 1) {
    tail.emitRC(0); // área de cadenas R2004-: 256 bytes, todo ceros
  }
  return composeAc1015ObjectBody(AC1015_TYPE_LTYPE, tail, (stream) => {
    emitRef(stream, ref(4, spec.controlHandle));
    emitRef(stream, ref(3, 0));
    emitRef(stream, ref(5, 0));
  });
}

export interface Ac1015AppIdWriteSpec {
  readonly name: readonly number[];
  readonly controlHandle: number;
}

/** Cuerpo de un APPID (20.4.66): el registro "ACAD" mínimo medido. */
export function writeAc1015AppIdBody(
  spec: Ac1015AppIdWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "An appid handle");
  assertHandle(spec.controlHandle, "An appid control handle");
  assertName(spec.name, "An appid name");

  const tail = new DwgBitEmitter();
  emitAc1015TableObjectCommonTail(tail, ownHandle);
  emitTableEntryHead(tail, spec.name);
  tail.emitRC(0); // el 71 sin documentar, 0 en todo el corpus
  return composeAc1015ObjectBody(AC1015_TYPE_APPID, tail, (stream) => {
    emitRef(stream, ref(4, spec.controlHandle));
    emitRef(stream, ref(3, 0));
    emitRef(stream, ref(5, 0));
  });
}

export interface Ac1015DimStyleWriteSpec {
  readonly name: readonly number[];
  readonly controlHandle: number;
  /** Handle del STYLE de texto (DIMTXSTY, hard pointer). */
  readonly textStyleHandle: number;
}

/**
 * Cuerpo de un DIMSTYLE R2000 (20.4.68) con TODOS los valores del Standard
 * medido en el corpus (los mismos defaults imperiales que llevan las
 * variables de cabecera, con dimtmove 0 en el objeto). Flujo: control,
 * xdic nulo, xref nulo, DIMTXSTY y los cuatro bloques de flecha nulos.
 */
export function writeAc1015DimStyleBody(
  spec: Ac1015DimStyleWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "A dimstyle handle");
  assertHandle(spec.controlHandle, "A dimstyle control handle");
  assertHandle(spec.textStyleHandle, "A dimstyle text style handle");
  assertName(spec.name, "A dimstyle name");

  const tail = new DwgBitEmitter();
  emitAc1015TableObjectCommonTail(tail, ownHandle);
  emitTableEntryHead(tail, spec.name);
  tail.emitTV([]); // DIMPOST
  tail.emitTV([]); // DIMAPOST
  for (const value of [1, 0.18, 0.0625, 0.38, 0.18, 0, 0, 0, 0]) {
    tail.emitBD(value); // DIMSCALE..DIMTM
  }
  for (const flag of [0, 0, 1, 1, 0, 0] as const) {
    tail.pushBit(flag); // DIMTOL DIMLIM DIMTIH DIMTOH DIMSE1 DIMSE2
  }
  tail.emitBS(0); // DIMTAD
  tail.emitBS(0); // DIMZIN
  tail.emitBS(0); // DIMAZIN
  for (const value of [0.18, 0.09, 0, 25.4, 1, 0, 1, 0.09, 0]) {
    tail.emitBD(value); // DIMTXT..DIMALTRND
  }
  tail.pushBit(0); // DIMALT
  tail.emitBS(2); // DIMALTD
  for (const flag of [0, 0, 0, 0] as const) {
    tail.pushBit(flag); // DIMTOFL DIMSAH DIMTIX DIMSOXD
  }
  tail.emitBS(0); // DIMCLRD
  tail.emitBS(0); // DIMCLRE
  tail.emitBS(0); // DIMCLRT
  for (const value of [0, 4, 4, 2, 2, 0, 0, 2, 46, 0, 0]) {
    tail.emitBS(value); // DIMADEC..DIMJUST (DIMTMOVE 0: valor medido)
  }
  tail.pushBit(0); // DIMSD1
  tail.pushBit(0); // DIMSD2
  for (const value of [1, 0, 0, 0]) {
    tail.emitBS(value); // DIMTOLJ DIMTZIN DIMALTZ DIMALTTZ
  }
  tail.pushBit(0); // DIMUPT
  tail.emitBS(3); // DIMFIT/DIMATFIT
  tail.emitBS(65534); // DIMLWD (ByBlock)
  tail.emitBS(65534); // DIMLWE (ByBlock)
  tail.pushBit(0); // bit final sin documentar (0 en el corpus)
  return composeAc1015ObjectBody(AC1015_TYPE_DIMSTYLE, tail, (stream) => {
    emitRef(stream, ref(4, spec.controlHandle));
    emitRef(stream, ref(3, 0));
    emitRef(stream, ref(5, 0));
    emitRef(stream, ref(5, spec.textStyleHandle));
    for (let index = 0; index < 4; index += 1) {
      emitRef(stream, ref(5, 0)); // DIMLDRBLK, DIMBLK, DIMBLK1, DIMBLK2
    }
  });
}

export interface Ac1015VportWriteSpec {
  readonly name: readonly number[];
  readonly controlHandle: number;
}

/**
 * Cuerpo del VPORT *Active (20.4.64) con los valores medidos del corpus:
 * altura de vista 9, dirección (0,0,1), lente 50, zoom de círculo 100,
 * rejilla y snap a 0.5, UCS identidad. Flujo: control, xdic nulo, xref nulo
 * y los dos UCS con nombre nulos.
 */
export function writeAc1015VportBody(
  spec: Ac1015VportWriteSpec,
  ownHandle: number,
): Uint8Array {
  assertHandle(ownHandle, "A vport handle");
  assertHandle(spec.controlHandle, "A vport control handle");
  assertName(spec.name, "A vport name");

  const tail = new DwgBitEmitter();
  emitAc1015TableObjectCommonTail(tail, ownHandle);
  emitTableEntryHead(tail, spec.name);
  tail.emitBD(9); // altura de vista
  tail.emitBD(17.756756755652958); // aspecto × altura (valor medido)
  tail.emitRD(10.42990654205607); // centro de vista X (valor medido)
  tail.emitRD(4.5); // centro de vista Y (valor medido)
  for (const value of [0, 0, 0]) tail.emitBD(value); // objetivo
  tail.emitBD(0);
  tail.emitBD(0);
  tail.emitBD(1); // dirección de vista (0,0,1)
  tail.emitBD(0); // giro
  tail.emitBD(50); // lente
  tail.emitBD(0); // plano de recorte frontal
  tail.emitBD(0); // plano de recorte trasero
  tail.pushBits(0b0001, 4); // modo de vista (4 bits, valor medido)
  tail.emitRC(0); // render mode
  tail.emitRD(0);
  tail.emitRD(0); // esquina inferior izquierda
  tail.emitRD(1);
  tail.emitRD(1); // esquina superior derecha
  tail.pushBit(0); // UCSFOLLOW
  tail.emitBS(100); // zoom de círculo
  tail.pushBit(1); // fast zoom
  tail.pushBits(0b11, 2); // UCSICON (valor medido)
  tail.pushBit(0); // rejilla apagada
  tail.emitRD(0.5);
  tail.emitRD(0.5); // espaciado de rejilla
  tail.pushBit(0); // snap apagado
  tail.pushBit(0); // estilo de snap
  tail.emitBS(0); // isopar de snap
  tail.emitBD(0); // rotación de snap
  tail.emitRD(0);
  tail.emitRD(0); // base de snap
  tail.emitRD(0.5);
  tail.emitRD(0.5); // espaciado de snap
  tail.pushBit(0); // bit sin documentar (0 medido)
  tail.pushBit(1); // UCS por viewport (valor medido)
  for (const value of [0, 0, 0]) tail.emitBD(value); // origen UCS
  tail.emitBD(1);
  tail.emitBD(0);
  tail.emitBD(0); // eje X del UCS
  tail.emitBD(0);
  tail.emitBD(1);
  tail.emitBD(0); // eje Y del UCS
  tail.emitBD(0); // elevación
  tail.emitBS(0); // tipo ortográfico
  return composeAc1015ObjectBody(AC1015_TYPE_VPORT, tail, (stream) => {
    emitRef(stream, ref(4, spec.controlHandle));
    emitRef(stream, ref(3, 0));
    emitRef(stream, ref(5, 0));
    emitRef(stream, ref(5, 0)); // UCS con nombre
    emitRef(stream, ref(5, 0)); // UCS base
  });
}

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
   * Sólo TEXT: hard pointer a su STYLE (grupo 7; capítulo 20.4.3 — el
   * oráculo externo rechaza un TEXT sin él con "Object improperly read").
   */
  readonly textStyleHandle?: number;
  /** Posición en la cadena de entidades. Por defecto, "isolated". */
  readonly chainPosition?: Ac1015EntityChainPosition;
}

/**
 * Emite el cuerpo de una entidad REAL con el flujo de handles RESUELTO:
 * `[dueño H(4)] xdic H(3,0) prev H(4,0) next H(4,0) capa H(5) [bloque H(5)]`
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
  if (refs.textStyleHandle !== undefined) {
    assertHandle(refs.textStyleHandle, "An entity text style handle");
    if (entity.kind !== "text") {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "Only a TEXT entity may reference a text style.",
      );
    }
  }
  if (entity.kind === "text" && refs.textStyleHandle === undefined) {
    // Un TEXT sin su STYLE es exactamente lo que el oráculo rechaza: fallo
    // cerrado aquí en vez de emitir un flujo que un lector ajeno no acepta.
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A TEXT entity requires the handle of its text style.",
    );
  }
  const base = writeAc1015EntityBody(entity, ownHandle, {
    ...(refs.ownerBlockHandle === undefined
      ? {}
      : { ownerBlockHandle: refs.ownerBlockHandle }),
    ...(refs.insertBlockHandle === undefined
      ? {}
      : { insertBlockHandle: refs.insertBlockHandle }),
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
