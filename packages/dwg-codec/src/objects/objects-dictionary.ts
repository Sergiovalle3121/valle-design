/**
 * Objetos no gráficos R2000 (AC1015) — fase D5: DICTIONARY, XRECORD, GROUP,
 * MLINESTYLE y la RESOLUCIÓN DE CLASES con sus objetos de clase.
 *
 * La sección AcDb:Classes declara las clases del dibujo: los objetos cuyo
 * tipo BS es 500 o más se decodifican buscando su número en esa lista — el
 * nombre DXF de la clase decide la disposición. Este módulo decodifica la
 * sección (su payload lo entrega el marco verificado existente) y, con el
 * mapa número→nombre, los objetos de clase LAYOUT, PLOTSETTINGS,
 * ACDBDICTIONARYWDFLT, ACDBPLACEHOLDER, DICTIONARYVAR y SCALE. Los demás
 * tipos de clase quedan para que el lector los ENUMERE con su nombre.
 *
 * Hechos registrados en SOURCE_REGISTER (ODA-ODS-DWG-5.4.1-PUBLIC): la
 * disposición R13–R15 de la sección de clases (capítulo 10: conjuntos
 * {classnum BS, versión BS, appname TV, nombre C++ TV, nombre DXF TV,
 * wasazombie B, itemclassid BS} hasta agotar el dato); DICTIONARY §20.4.44
 * (recuento de items, bandera de clonado BS, bandera de hard-owner RC y los
 * nombres TV, con los handles de los items en el flujo final);
 * DICTIONARYWDFLT §20.4.45 (lo mismo más un handle de entrada por defecto);
 * XRECORD §20.4.104; GROUP §20.4.72; MLINESTYLE §20.4.73; LAYOUT §20.4.84
 * (que en R2000 incluye los campos de plotsettings); SCALE §20.4.92;
 * DICTIONARYVAR §20.4.74.
 *
 * Intake 2026-08-21 (corpus admitido, 25 DWG AC1015): las disposiciones de
 * este módulo cerraron bit a bit en 1186 DICTIONARY, 911 XRECORD, 26
 * MLINESTYLE, 50 LAYOUT, 25 WDFLT, 25 PLACEHOLDER, 200 DICTIONARYVAR y 425
 * SCALE reales; la sección de clases decodificó las 12 clases de cada archivo
 * con 4 bits de relleno final. GROUP y PLOTSETTINGS no aparecen en el corpus:
 * quedan verificados por round-trip de laboratorio (certeza declarada).
 *
 * Nota medida: la ODS declara el recuento de reactores del DICTIONARY como
 * BS; el común compartido lo lee BL. Ambas codificaciones coinciden bit a bit
 * para 0–255 reactores (todo el corpus) — reutilizar el común manda (cero
 * gemelos) y un recuento mayor caería cerrado en el cierre exacto.
 *
 * Reglas del laboratorio: fallo cerrado con offset, recuentos acotados antes
 * de reservar, banderas crudas y todo congelado. Lo que este módulo no
 * interpreta (los databytes del XRECORD, el flujo de handles) queda
 * CONTABILIZADO con su posición exacta — jamás ignorado en silencio.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import {
  DwgBitReader,
  resolveDwgHandleReference,
  type DwgResolvedHandle,
} from "../codecs/bitcodes.js";
import { throwDwgError } from "../security/parse-error.js";
import {
  assertHandleCountFits,
  finiteDecoded,
  type Ac1015OpaqueSpan,
} from "./entity-common.js";
import {
  assertAc1015ObjectBodyType,
  closeAc1015ObjectWithHandleStream,
  readAc1015TableObjectCommon,
  type Ac1015TableObjectCommon,
} from "./table-layer.js";
import {
  readAc1015FieldLayout,
  type Ac1015FieldLayout,
  type Ac1015SymbolFieldValue,
} from "./tables-symbol.js";

/** Códigos de tipo BS fijos de esta familia (hechos registrados). */
export const AC1015_TYPE_DICTIONARY = 0x2a;
export const AC1015_TYPE_GROUP = 0x48;
export const AC1015_TYPE_MLINESTYLE = 0x49;
export const AC1015_TYPE_XRECORD = 0x4f;

/** Primer tipo BS reservado a clases: classnum 500 en adelante. */
export const AC1015_FIRST_CLASS_TYPE = 0x1f4;

/** Una clase declarada en la sección AcDb:Classes (nombres en BYTES). */
export interface Ac1015ClassRecord {
  readonly classNumber: number;
  readonly versionFlags: number;
  readonly appName: readonly number[];
  readonly cppClassName: readonly number[];
  readonly dxfClassName: readonly number[];
  readonly wasAZombie: boolean;
  readonly itemClassId: number;
}

/**
 * Decodifica el payload COMPLETO de la sección de clases R13–R15 (el marco —
 * centinelas, tamaño y CRC — ya lo verificó `readAc1015SectionFrame`). Se
 * leen conjuntos hasta que quede menos de un byte: el relleno final del flujo
 * de bits (medido: 4 bits en el corpus) nunca alcanza para otro conjunto.
 */
export function decodeAc1015ClassesSection(
  payload: Uint8Array,
): readonly Ac1015ClassRecord[] {
  const reader = new DwgBitReader(new BoundedByteCursor(payload));
  const totalBits = payload.length * 8;
  const records: Ac1015ClassRecord[] = [];
  while (totalBits - reader.bitPosition >= 8) {
    const classNumber = reader.readBS();
    const versionFlags = reader.readBS();
    const appName = copyTextBytes(reader.readTV().bytes);
    const cppClassName = copyTextBytes(reader.readTV().bytes);
    const dxfClassName = copyTextBytes(reader.readTV().bytes);
    const wasAZombie = reader.readB() === 1;
    const itemClassId = reader.readBS();
    records.push(
      Object.freeze({
        classNumber,
        versionFlags,
        appName,
        cppClassName,
        dxfClassName,
        wasAZombie,
        itemClassId,
      }),
    );
  }
  return Object.freeze(records);
}

// ---------------------------------------------------------------------------
// DICTIONARY (y su variante de clase con entrada por defecto)
// ---------------------------------------------------------------------------

/** Una entrada de diccionario: nombre en bytes + referencia resuelta. */
export interface Ac1015DictionaryEntry {
  readonly name: readonly number[];
  readonly item: DwgResolvedHandle;
}

/** Un DICTIONARY decodificado por completo, con su flujo interpretado. */
export interface Ac1015DecodedDictionary {
  readonly common: Ac1015TableObjectCommon;
  readonly cloningFlag: number;
  readonly hardOwnerFlag: number;
  readonly owner: DwgResolvedHandle;
  readonly xdictionary: DwgResolvedHandle;
  readonly entries: readonly Ac1015DictionaryEntry[];
  /** Sólo ACDBDICTIONARYWDFLT: la entrada por defecto (hard pointer). */
  readonly defaultEntry: DwgResolvedHandle | undefined;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/** Decodifica el cuerpo COMPLETO de un DICTIONARY (0x2A). */
export function decodeAc1015DictionaryBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedDictionary {
  return decodeDictionaryCore(bodyBytes, AC1015_TYPE_DICTIONARY, "DICTIONARY", false);
}

/**
 * Decodifica un ACDBDICTIONARYWDFLT: la MISMA disposición del DICTIONARY con
 * un handle de entrada por defecto al final del flujo. Su tipo es de clase,
 * por eso lo aporta el llamador tras resolver la sección de clases.
 */
export function decodeAc1015DictionaryWithDefaultBody(
  bodyBytes: Uint8Array,
  expectedType: number,
): Ac1015DecodedDictionary {
  return decodeDictionaryCore(bodyBytes, expectedType, "ACDBDICTIONARYWDFLT", true);
}

function decodeDictionaryCore(
  bodyBytes: Uint8Array,
  expectedType: number,
  what: string,
  withDefaultEntry: boolean,
): Ac1015DecodedDictionary {
  assertAc1015ObjectBodyType(bodyBytes, expectedType, what);
  const { common, reader, bodyBitLength, opaqueSpans } =
    readAc1015TableObjectCommon(bodyBytes);

  const itemCount = reader.readBL();
  // Propietario + xdictionary + reactores + items (+ la entrada por defecto)
  // ocupan al menos un byte cada uno en el flujo: la suma se cobra ANTES de
  // reservar las listas o recorrer nombre alguno.
  assertHandleCountFits(
    reader,
    common.reactorCount + itemCount + 2 + (withDefaultEntry ? 1 : 0),
    common.bitSize,
    bodyBitLength,
    "dictionary item",
  );
  const cloningFlag = reader.readBS();
  const hardOwnerFlag = reader.readRC();
  const names = new Array<readonly number[]>(itemCount);
  for (let index = 0; index < itemCount; index += 1) {
    names[index] = copyTextBytes(reader.readTV().bytes);
  }

  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    opaqueSpans,
  );

  // El flujo, interpretado ADEMÁS de contabilizado (mismo patrón que la
  // cabeza de entidad): propietario, reactores recorridos, xdictionary, un
  // handle por item en el ORDEN de los nombres y el defecto de la variante.
  const base = common.ownHandle.value;
  const owner = resolveDwgHandleReference(reader.readH(), base);
  for (let index = 0; index < common.reactorCount; index += 1) {
    reader.readH();
  }
  const xdictionary = resolveDwgHandleReference(reader.readH(), base);
  const entries = new Array<Ac1015DictionaryEntry>(itemCount);
  for (let index = 0; index < itemCount; index += 1) {
    entries[index] = Object.freeze({
      name: names[index]!,
      item: resolveDwgHandleReference(reader.readH(), base),
    });
  }
  const defaultEntry = withDefaultEntry
    ? resolveDwgHandleReference(reader.readH(), base)
    : undefined;

  return Object.freeze({
    common,
    cloningFlag,
    hardOwnerFlag,
    owner,
    xdictionary,
    entries: Object.freeze(entries),
    defaultEntry,
    opaqueSpans: spans,
  });
}

// ---------------------------------------------------------------------------
// XRECORD, GROUP y MLINESTYLE
// ---------------------------------------------------------------------------

/** Un XRECORD: sus databytes quedan contabilizados, no interpretados. */
export interface Ac1015DecodedXrecord {
  readonly common: Ac1015TableObjectCommon;
  /** Primer bit de los databytes dentro del cuerpo. */
  readonly dataStartBit: number;
  readonly dataByteLength: number;
  readonly cloningFlag: number;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/** Decodifica el cuerpo COMPLETO de un XRECORD (0x4F). */
export function decodeAc1015XrecordBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedXrecord {
  assertAc1015ObjectBodyType(bodyBytes, AC1015_TYPE_XRECORD, "XRECORD");
  const { common, reader, bodyBitLength, opaqueSpans } =
    readAc1015TableObjectCommon(bodyBytes);

  const dataByteLength = reader.readBL();
  if (dataByteLength * 8 > common.bitSize - reader.bitPosition) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The xrecord data bytes extend outside the declared bit size.",
    );
  }
  const dataStartBit = reader.bitPosition;
  // Los pares indicador/dato del XRECORD son de una fase posterior: los bytes
  // se recorren (el presupuesto los cobró con el cuerpo) y viajan contados.
  for (let index = 0; index < dataByteLength; index += 1) {
    reader.readRC();
  }
  const cloningFlag = reader.readBS();

  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    opaqueSpans,
  );
  return Object.freeze({
    common,
    dataStartBit,
    dataByteLength,
    cloningFlag,
    opaqueSpans: spans,
  });
}

/** Un GROUP: nombre, banderas crudas y recuento de miembros contabilizado. */
export interface Ac1015DecodedGroup {
  readonly common: Ac1015TableObjectCommon;
  readonly name: readonly number[];
  readonly unnamedFlag: number;
  readonly selectableFlag: number;
  /** Cuántos miembros referencia; sus handles viven en el flujo opaco final. */
  readonly memberCount: number;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/** Decodifica el cuerpo COMPLETO de un GROUP (0x48). */
export function decodeAc1015GroupBody(bodyBytes: Uint8Array): Ac1015DecodedGroup {
  assertAc1015ObjectBodyType(bodyBytes, AC1015_TYPE_GROUP, "GROUP");
  const { common, reader, bodyBitLength, opaqueSpans } =
    readAc1015TableObjectCommon(bodyBytes);

  const name = copyTextBytes(reader.readTV().bytes);
  const unnamedFlag = reader.readBS();
  const selectableFlag = reader.readBS();
  const memberCount = reader.readBL();
  assertHandleCountFits(
    reader,
    common.reactorCount + memberCount + 2,
    common.bitSize,
    bodyBitLength,
    "group member",
  );

  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    opaqueSpans,
  );
  return Object.freeze({
    common,
    name,
    unnamedFlag,
    selectableFlag,
    memberCount,
    opaqueSpans: spans,
  });
}

/** Bits mínimos de un segmento de MLINESTYLE: BD + CmC + BS = 6. */
const MLINESTYLE_SEGMENT_MIN_BITS = 6;

/** Un MLINESTYLE: banderas crudas y segmentos en listas paralelas. */
export interface Ac1015DecodedMlineStyle {
  readonly common: Ac1015TableObjectCommon;
  readonly name: readonly number[];
  readonly description: readonly number[];
  /** BS de banderas crudo (la tabla de bits DXF↔DWG es de fase posterior). */
  readonly styleFlags: number;
  readonly fillColorIndex: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly segmentOffsets: readonly number[];
  readonly segmentColorIndexes: readonly number[];
  /** Índices BS de tipo de línea crudos (32767 = por índice ausente). */
  readonly segmentLinetypeIndexes: readonly number[];
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/** Decodifica el cuerpo COMPLETO de un MLINESTYLE (0x49). */
export function decodeAc1015MlineStyleBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedMlineStyle {
  assertAc1015ObjectBodyType(bodyBytes, AC1015_TYPE_MLINESTYLE, "MLINESTYLE");
  const { common, reader, bodyBitLength, opaqueSpans } =
    readAc1015TableObjectCommon(bodyBytes);

  const name = copyTextBytes(reader.readTV().bytes);
  const description = copyTextBytes(reader.readTV().bytes);
  const styleFlags = reader.readBS();
  const fillColorIndex = reader.readCmC().index;
  const startAngle = finiteDecoded(reader, reader.readBD(), "an mlinestyle angle");
  const endAngle = finiteDecoded(reader, reader.readBD(), "an mlinestyle angle");
  const segmentCount = reader.readRC();
  if (
    segmentCount * MLINESTYLE_SEGMENT_MIN_BITS >
    common.bitSize - reader.bitPosition
  ) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The mlinestyle segment count cannot fit inside the declared bit size.",
    );
  }
  const segmentOffsets = new Array<number>(segmentCount);
  const segmentColorIndexes = new Array<number>(segmentCount);
  const segmentLinetypeIndexes = new Array<number>(segmentCount);
  for (let index = 0; index < segmentCount; index += 1) {
    segmentOffsets[index] = finiteDecoded(
      reader,
      reader.readBD(),
      "an mlinestyle segment offset",
    );
    segmentColorIndexes[index] = reader.readCmC().index;
    segmentLinetypeIndexes[index] = reader.readBS();
  }

  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    opaqueSpans,
  );
  return Object.freeze({
    common,
    name,
    description,
    styleFlags,
    fillColorIndex,
    startAngle,
    endAngle,
    segmentOffsets: Object.freeze(segmentOffsets),
    segmentColorIndexes: Object.freeze(segmentColorIndexes),
    segmentLinetypeIndexes: Object.freeze(segmentLinetypeIndexes),
    opaqueSpans: spans,
  });
}

// ---------------------------------------------------------------------------
// Objetos de clase (tipo resuelto contra la sección de clases)
// ---------------------------------------------------------------------------

/** PLOTSETTINGS (§20.4.84, campos "plotsettings"; R2000 con vista de plot). */
export const AC1015_PLOT_SETTINGS_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["pageSetupName", "TV"],
  ["printerConfig", "TV"],
  ["plotLayoutFlags", "BS"],
  ["leftMargin", "BD"],
  ["bottomMargin", "BD"],
  ["rightMargin", "BD"],
  ["topMargin", "BD"],
  ["paperWidth", "BD"],
  ["paperHeight", "BD"],
  ["paperSizeName", "TV"],
  ["plotOrigin", "2BD"],
  ["paperUnits", "BS"],
  ["plotRotation", "BS"],
  ["plotType", "BS"],
  ["windowMin", "2BD"],
  ["windowMax", "2BD"],
  ["plotViewName", "TV"],
  ["realWorldUnits", "BD"],
  ["drawingUnits", "BD"],
  ["styleSheetName", "TV"],
  ["scaleType", "BS"],
  ["scaleFactor", "BD"],
  ["paperImageOrigin", "2BD"],
] as const);

/** La cola propia del LAYOUT tras sus campos de plotsettings (R2000). */
const LAYOUT_TAIL_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["layoutName", "TV"],
  ["tabOrder", "BL"],
  ["layoutFlags", "BS"],
  ["ucsOrigin", "3BD"],
  ["limitsMin", "2RD"],
  ["limitsMax", "2RD"],
  ["insertionBase", "3BD"],
  ["ucsXAxis", "3BD"],
  ["ucsYAxis", "3BD"],
  ["elevation", "BD"],
  ["orthographicViewType", "BS"],
  ["extentsMin", "3BD"],
  ["extentsMax", "3BD"],
] as const);

/** LAYOUT completo R2000: plotsettings + su cola (cerró en los 50 reales). */
export const AC1015_LAYOUT_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ...AC1015_PLOT_SETTINGS_FIELD_LAYOUT,
  ...LAYOUT_TAIL_FIELD_LAYOUT,
]);

/** DICTIONARYVAR (§20.4.74): un byte de esquema y el valor como cadena TV. */
export const AC1015_DICTIONARY_VAR_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["schemaByte", "RC"],
  ["value", "TV"],
] as const);

/** SCALE (§20.4.92). */
export const AC1015_SCALE_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["unknownFlags", "BS"],
  ["name", "TV"],
  ["paperUnits", "BD"],
  ["drawingUnits", "BD"],
  ["hasUnitScaleBit", "B"],
] as const);

/** Un objeto de clase decodificado: común + campos crudos congelados. */
export interface Ac1015DecodedClassObject {
  readonly common: Ac1015TableObjectCommon;
  readonly fields: Readonly<Record<string, Ac1015SymbolFieldValue>>;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

function decodeClassObjectCore(
  bodyBytes: Uint8Array,
  expectedType: number,
  what: string,
  layout: Ac1015FieldLayout,
): Ac1015DecodedClassObject {
  assertAc1015ObjectBodyType(bodyBytes, expectedType, what);
  const { common, reader, bodyBitLength, opaqueSpans } =
    readAc1015TableObjectCommon(bodyBytes);
  const fields: Record<string, Ac1015SymbolFieldValue> = {};
  readAc1015FieldLayout(reader, layout, fields, what);
  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    opaqueSpans,
  );
  return Object.freeze({ common, fields: Object.freeze(fields), opaqueSpans: spans });
}

/** Decodifica un LAYOUT de clase (tipo resuelto por el llamador). */
export function decodeAc1015LayoutBody(
  bodyBytes: Uint8Array,
  expectedType: number,
): Ac1015DecodedClassObject {
  return decodeClassObjectCore(bodyBytes, expectedType, "LAYOUT", AC1015_LAYOUT_FIELD_LAYOUT);
}

/** Decodifica un PLOTSETTINGS de clase. */
export function decodeAc1015PlotSettingsBody(
  bodyBytes: Uint8Array,
  expectedType: number,
): Ac1015DecodedClassObject {
  return decodeClassObjectCore(
    bodyBytes,
    expectedType,
    "PLOTSETTINGS",
    AC1015_PLOT_SETTINGS_FIELD_LAYOUT,
  );
}

/** Decodifica un DICTIONARYVAR de clase. */
export function decodeAc1015DictionaryVarBody(
  bodyBytes: Uint8Array,
  expectedType: number,
): Ac1015DecodedClassObject {
  return decodeClassObjectCore(
    bodyBytes,
    expectedType,
    "DICTIONARYVAR",
    AC1015_DICTIONARY_VAR_FIELD_LAYOUT,
  );
}

/** Decodifica un SCALE de clase. */
export function decodeAc1015ScaleBody(
  bodyBytes: Uint8Array,
  expectedType: number,
): Ac1015DecodedClassObject {
  return decodeClassObjectCore(bodyBytes, expectedType, "SCALE", AC1015_SCALE_FIELD_LAYOUT);
}

/** Decodifica un ACDBPLACEHOLDER: sólo el común, sin campos propios. */
export function decodeAc1015PlaceholderBody(
  bodyBytes: Uint8Array,
  expectedType: number,
): Ac1015DecodedClassObject {
  return decodeClassObjectCore(bodyBytes, expectedType, "ACDBPLACEHOLDER", Object.freeze([]));
}

// ---------------------------------------------------------------------------
// Familia
// ---------------------------------------------------------------------------

/** Resultado de la familia de diccionario para el lector de la base. */
export type Ac1015DecodedDictionaryFamily =
  | {
      readonly kind: "dictionary";
      readonly handle: number;
      readonly dictionary: Ac1015DecodedDictionary;
    }
  | {
      readonly kind: "mlinestyle";
      readonly handle: number;
      readonly mlinestyle: Ac1015DecodedMlineStyle;
    }
  | {
      /** Decodificado y verificado bit a bit; sin proyección en la base. */
      readonly kind: "object";
      readonly handle: number;
    };

/** ¿Los bytes del nombre de clase son EXACTAMENTE este ASCII? */
function classNameIs(bytes: readonly number[], ascii: string): boolean {
  if (bytes.length !== ascii.length) return false;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== ascii.charCodeAt(index)) return false;
  }
  return true;
}

/**
 * Decodifica un cuerpo de la familia de diccionario según su tipo BS: los
 * tipos fijos directamente y los de clase resolviendo el número contra el
 * mapa de la sección de clases. Devuelve `null` cuando ni el tipo ni el
 * nombre de clase pertenecen a la familia — el llamador ENUMERA (con nombre
 * de clase cuando lo hay); la corrupción se propaga tipada.
 */
export function decodeAc1015DictionaryFamilyObject(
  type: number,
  bodyBytes: Uint8Array,
  classNames: ReadonlyMap<number, readonly number[]>,
): Ac1015DecodedDictionaryFamily | null {
  if (type === AC1015_TYPE_DICTIONARY) {
    const dictionary = decodeAc1015DictionaryBody(bodyBytes);
    return Object.freeze({
      kind: "dictionary" as const,
      handle: dictionary.common.ownHandle.value,
      dictionary,
    });
  }
  if (type === AC1015_TYPE_MLINESTYLE) {
    const mlinestyle = decodeAc1015MlineStyleBody(bodyBytes);
    return Object.freeze({
      kind: "mlinestyle" as const,
      handle: mlinestyle.common.ownHandle.value,
      mlinestyle,
    });
  }
  if (type === AC1015_TYPE_XRECORD) {
    return opaqueMember(decodeAc1015XrecordBody(bodyBytes).common);
  }
  if (type === AC1015_TYPE_GROUP) {
    return opaqueMember(decodeAc1015GroupBody(bodyBytes).common);
  }

  const className = classNames.get(type);
  if (className === undefined) return null;
  if (classNameIs(className, "ACDBDICTIONARYWDFLT")) {
    const dictionary = decodeAc1015DictionaryWithDefaultBody(bodyBytes, type);
    return Object.freeze({
      kind: "dictionary" as const,
      handle: dictionary.common.ownHandle.value,
      dictionary,
    });
  }
  if (classNameIs(className, "LAYOUT")) {
    return opaqueMember(decodeAc1015LayoutBody(bodyBytes, type).common);
  }
  if (classNameIs(className, "PLOTSETTINGS")) {
    return opaqueMember(decodeAc1015PlotSettingsBody(bodyBytes, type).common);
  }
  if (classNameIs(className, "DICTIONARYVAR")) {
    return opaqueMember(decodeAc1015DictionaryVarBody(bodyBytes, type).common);
  }
  if (classNameIs(className, "SCALE")) {
    return opaqueMember(decodeAc1015ScaleBody(bodyBytes, type).common);
  }
  if (classNameIs(className, "ACDBPLACEHOLDER")) {
    return opaqueMember(decodeAc1015PlaceholderBody(bodyBytes, type).common);
  }
  return null;
}

function opaqueMember(common: Ac1015TableObjectCommon): Ac1015DecodedDictionaryFamily {
  return Object.freeze({ kind: "object" as const, handle: common.ownHandle.value });
}

/** Copia los bytes de un TV al modelo neutral como lista congelada. */
function copyTextBytes(bytes: Uint8Array): readonly number[] {
  const copy = new Array<number>(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    copy[index] = bytes[index]!;
  }
  return Object.freeze(copy);
}
