/**
 * Tablas de símbolos R2000 (AC1015) — fase D5: STYLE, LTYPE, VIEW, UCS,
 * VPORT, APPID, DIMSTYLE y VP ENT HDR, cada una con su objeto de CONTROL.
 *
 * Todas las entradas comparten la MISMA apertura tras el común de objeto de
 * tabla (`readAc1015TableObjectCommon`, reutilizado de la fase D3 — cero
 * comunes gemelos): nombre TV, bit de referencia externa (bandera 64), índice
 * de xref más uno BS y bit de dependencia de xref. Después divergen en sus
 * campos, que este módulo lee con DISPOSICIONES DECLARATIVAS (nombre + código
 * de bits en el orden exacto del formato) y expone CRUDOS y congelados en un
 * registro por entrada — banderas sin interpretar, doubles validados finitos.
 *
 * Hechos registrados en SOURCE_REGISTER (ODA-ODS-DWG-5.4.1-PUBLIC), capítulo
 * 20: códigos de tipo 0x34–0x47; los controles declaran su recuento BL de
 * entradas con los handles en el flujo final; el LTYPE lleva sus trazos como
 * secuencia RC-contada de {longitud BD, código de forma BS, offsets RD,
 * escala BD, rotación BD, banderas BS} seguida del área de texto; el DIMSTYLE
 * R2000 lleva sus variables en el orden de 20.4.68.
 *
 * Intake 2026-08-21 (corpus admitido, 25 DWG AC1015, 3232 objetos medidos):
 * - **DIMSTYLE CONTROL**: entre el recuento de entradas y el flujo de handles
 *   viaja UN byte RC adicional que la ODS 20.4.67 no lista (observado 0x00 en
 *   los 25 controles). Se lee sólo cuando el tamaño en bits declarado lo
 *   exige y viaja CRUDO (`dimstyleTailByte`); sin él, ningún control cierra.
 * - **LTYPE**: el área de texto de 256 bytes de 20.4.58 está SIEMPRE presente
 *   en AC1015 — con y sin trazos, con banderas de forma a cero (79 LTYPE
 *   medidos, los 79 cierran exactos sólo con ella). Se exige ese encaje.
 * - Las demás disposiciones de este módulo cerraron bit a bit en el corpus
 *   (los tipos VIEW/UCS no aparecen en él: sus decodificadores quedan
 *   verificados por round-trip de laboratorio, certeza declarada).
 *
 * Reglas del laboratorio: fallo cerrado con offset, recuentos acotados antes
 * de reservar, lo dudoso viaja crudo y todo lo devuelto va congelado.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { DwgBitReader } from "../codecs/bitcodes.js";
import { throwDwgError } from "../security/parse-error.js";
import {
  assertHandleCountFits,
  finiteDecoded,
  type Ac1015OpaqueSpan,
} from "./entity-common.js";
import {
  closeAc1015ObjectWithHandleStream,
  readAc1015TableObjectCommon,
  type Ac1015TableObjectCommon,
} from "./table-layer.js";
import type {
  Ac1015DecodedDictionaryFamily,
  Ac1015DecodedMlineStyle,
} from "./objects-dictionary.js";

/** Códigos de tipo BS de las tablas de símbolos (hechos registrados). */
export const AC1015_TYPE_STYLE_CONTROL = 0x34;
export const AC1015_TYPE_STYLE = 0x35;
export const AC1015_TYPE_LTYPE_CONTROL = 0x38;
export const AC1015_TYPE_LTYPE = 0x39;
export const AC1015_TYPE_VIEW_CONTROL = 0x3c;
export const AC1015_TYPE_VIEW = 0x3d;
export const AC1015_TYPE_UCS_CONTROL = 0x3e;
export const AC1015_TYPE_UCS = 0x3f;
export const AC1015_TYPE_VPORT_CONTROL = 0x40;
export const AC1015_TYPE_VPORT = 0x41;
export const AC1015_TYPE_APPID_CONTROL = 0x42;
export const AC1015_TYPE_APPID = 0x43;
export const AC1015_TYPE_DIMSTYLE_CONTROL = 0x44;
export const AC1015_TYPE_DIMSTYLE = 0x45;
export const AC1015_TYPE_VP_ENT_HDR_CONTROL = 0x46;
export const AC1015_TYPE_VP_ENT_HDR = 0x47;

/** Los ocho controles comparten disposición: recuento BL + handles al final. */
export const AC1015_SYMBOL_CONTROL_TYPES: ReadonlySet<number> = new Set([
  AC1015_TYPE_STYLE_CONTROL,
  AC1015_TYPE_LTYPE_CONTROL,
  AC1015_TYPE_VIEW_CONTROL,
  AC1015_TYPE_UCS_CONTROL,
  AC1015_TYPE_VPORT_CONTROL,
  AC1015_TYPE_APPID_CONTROL,
  AC1015_TYPE_DIMSTYLE_CONTROL,
  AC1015_TYPE_VP_ENT_HDR_CONTROL,
]);

/**
 * Un código de campo de las disposiciones declarativas: los códigos de bits
 * del formato más las composiciones de bits crudas ("2B"/"4B") que la ODS
 * describe como campos de N bits. "TV" entrega BYTES (contrato de `readTV`).
 */
export type Ac1015SymbolFieldCode =
  | "B"
  | "2B"
  | "4B"
  | "RC"
  | "BS"
  | "BL"
  | "BD"
  | "RD"
  | "TV"
  | "2RD"
  | "2BD"
  | "3BD";

/** Una disposición: parejas nombre → código, en el orden EXACTO del formato. */
export type Ac1015FieldLayout = readonly (readonly [string, Ac1015SymbolFieldCode])[];

/** Valor de un campo leído: número crudo o bytes/tuplas como lista congelada. */
export type Ac1015SymbolFieldValue = number | readonly number[];

/** La apertura compartida de toda entrada de tabla de símbolos. */
export interface Ac1015SymbolTableEntryHead {
  readonly name: readonly number[];
  readonly xrefRef: boolean;
  readonly xrefIndexPlusOne: number;
  readonly xrefDependent: boolean;
}

/** Una entrada decodificada: común, apertura y campos crudos congelados. */
export interface Ac1015DecodedSymbolEntry {
  readonly common: Ac1015TableObjectCommon;
  readonly head: Ac1015SymbolTableEntryHead;
  readonly fields: Readonly<Record<string, Ac1015SymbolFieldValue>>;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

/** Un CONTROL de tabla de símbolos decodificado. */
export interface Ac1015DecodedSymbolControl {
  readonly common: Ac1015TableObjectCommon;
  /** Cuántas entradas referencia; sus handles viven en el flujo opaco final. */
  readonly entryCount: number;
  /**
   * Sólo DIMSTYLE CONTROL: el byte RC que el corpus demostró entre el
   * recuento y el flujo de handles (0x00 en los 25 medidos; la ODS no lo
   * lista). Viaja crudo; en los demás controles es `undefined`.
   */
  readonly dimstyleTailByte: number | undefined;
  readonly opaqueSpans: readonly Ac1015OpaqueSpan[];
}

// ---------------------------------------------------------------------------
// Disposiciones declarativas (orden exacto de ODA-ODS-DWG-5.4.1-PUBLIC §20.4)
// ---------------------------------------------------------------------------

/** STYLE (SHAPEFILE §20.4.56), tras la apertura común de entrada. */
export const AC1015_STYLE_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["verticalBit", "B"],
  ["shapeFileBit", "B"],
  ["fixedHeight", "BD"],
  ["widthFactor", "BD"],
  ["obliqueAngle", "BD"],
  ["generationFlags", "RC"],
  ["lastHeight", "BD"],
  ["fontName", "TV"],
  ["bigFontName", "TV"],
] as const);

/** VIEW (§20.4.60) hasta el bit de UCS asociado; el bloque UCS es opcional. */
export const AC1015_VIEW_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["viewHeight", "BD"],
  ["viewWidth", "BD"],
  ["viewCenter", "2RD"],
  ["viewTarget", "3BD"],
  ["viewDirection", "3BD"],
  ["twistAngle", "BD"],
  ["lensLength", "BD"],
  ["frontClip", "BD"],
  ["backClip", "BD"],
  ["viewModeBits", "4B"],
  ["renderMode", "RC"],
  ["pspaceFlagBit", "B"],
] as const);

/** El bloque UCS del VIEW, presente sólo con el bit de UCS asociado a 1. */
export const AC1015_VIEW_UCS_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["ucsOrigin", "3BD"],
  ["ucsXAxis", "3BD"],
  ["ucsYAxis", "3BD"],
  ["ucsElevation", "BD"],
  ["ucsOrthographicViewType", "BS"],
] as const);

/** UCS (§20.4.62). */
export const AC1015_UCS_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["origin", "3BD"],
  ["xAxis", "3BD"],
  ["yAxis", "3BD"],
  ["elevation", "BD"],
  ["orthographicViewType", "BS"],
  ["orthographicType", "BS"],
] as const);

/** VPORT (§20.4.64), R2000: cerró bit a bit en los 25 VPORT del corpus. */
export const AC1015_VPORT_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["viewHeight", "BD"],
  ["aspectRatio", "BD"],
  ["viewCenter", "2RD"],
  ["viewTarget", "3BD"],
  ["viewDirection", "3BD"],
  ["viewTwist", "BD"],
  ["lensLength", "BD"],
  ["frontClip", "BD"],
  ["backClip", "BD"],
  ["viewModeBits", "4B"],
  ["renderMode", "RC"],
  ["lowerLeft", "2RD"],
  ["upperRight", "2RD"],
  ["ucsFollowBit", "B"],
  ["circleZoom", "BS"],
  ["fastZoomBit", "B"],
  ["ucsIconBits", "2B"],
  ["gridOnBit", "B"],
  ["gridSpacing", "2RD"],
  ["snapOnBit", "B"],
  ["snapStyleBit", "B"],
  ["snapIsopair", "BS"],
  ["snapRotation", "BD"],
  ["snapBase", "2RD"],
  ["snapSpacing", "2RD"],
  ["unknownBit", "B"],
  ["ucsPerViewportBit", "B"],
  ["ucsOrigin", "3BD"],
  ["ucsXAxis", "3BD"],
  ["ucsYAxis", "3BD"],
  ["ucsElevation", "BD"],
  ["ucsOrthographicType", "BS"],
] as const);

/** APPID (§20.4.66): un byte 71 sin documentar, crudo. */
export const AC1015_APPID_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["unknownByte71", "RC"],
] as const);

/** VP ENT HDR (§20.4.70): el bit 1 del grupo 70, crudo. */
export const AC1015_VP_ENT_HDR_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["flag70Bit", "B"],
] as const);

/** DIMSTYLE (§20.4.68), R2000: cerró bit a bit en los 27 DIMSTYLE reales. */
export const AC1015_DIMSTYLE_FIELD_LAYOUT: Ac1015FieldLayout = Object.freeze([
  ["dimpost", "TV"],
  ["dimapost", "TV"],
  ["dimscale", "BD"],
  ["dimasz", "BD"],
  ["dimexo", "BD"],
  ["dimdli", "BD"],
  ["dimexe", "BD"],
  ["dimrnd", "BD"],
  ["dimdle", "BD"],
  ["dimtp", "BD"],
  ["dimtm", "BD"],
  ["dimtol", "B"],
  ["dimlim", "B"],
  ["dimtih", "B"],
  ["dimtoh", "B"],
  ["dimse1", "B"],
  ["dimse2", "B"],
  ["dimtad", "BS"],
  ["dimzin", "BS"],
  ["dimazin", "BS"],
  ["dimtxt", "BD"],
  ["dimcen", "BD"],
  ["dimtsz", "BD"],
  ["dimaltf", "BD"],
  ["dimlfac", "BD"],
  ["dimtvp", "BD"],
  ["dimtfac", "BD"],
  ["dimgap", "BD"],
  ["dimaltrnd", "BD"],
  ["dimalt", "B"],
  ["dimaltd", "BS"],
  ["dimtofl", "B"],
  ["dimsah", "B"],
  ["dimtix", "B"],
  ["dimsoxd", "B"],
  ["dimclrd", "BS"],
  ["dimclre", "BS"],
  ["dimclrt", "BS"],
  ["dimadec", "BS"],
  ["dimdec", "BS"],
  ["dimtdec", "BS"],
  ["dimaltu", "BS"],
  ["dimalttd", "BS"],
  ["dimaunit", "BS"],
  ["dimfrac", "BS"],
  ["dimlunit", "BS"],
  ["dimdsep", "BS"],
  ["dimtmove", "BS"],
  ["dimjust", "BS"],
  ["dimsd1", "B"],
  ["dimsd2", "B"],
  ["dimtolj", "BS"],
  ["dimtzin", "BS"],
  ["dimaltz", "BS"],
  ["dimalttz", "BS"],
  ["dimupt", "B"],
  ["dimfit", "BS"],
  ["dimlwd", "BS"],
  ["dimlwe", "BS"],
  ["unknown70Bit", "B"],
] as const);

/** Bits mínimos de un trazo de LTYPE: BD+BS+RD+RD+BD+BD+BS = 138. */
const LTYPE_DASH_MIN_BITS = 138;
/** Bytes del área de texto del LTYPE en AC1015 (hecho medido: siempre 256). */
export const AC1015_LTYPE_TEXT_AREA_BYTES = 256;

// ---------------------------------------------------------------------------
// Lectura declarativa
// ---------------------------------------------------------------------------

/** Copia los bytes de un TV al modelo neutral como lista congelada. */
function copyTextBytes(bytes: Uint8Array): readonly number[] {
  const copy = new Array<number>(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    copy[index] = bytes[index]!;
  }
  return Object.freeze(copy);
}

/** Lee UN campo según su código; los doubles se validan finitos aquí. */
function readFieldCode(
  reader: DwgBitReader,
  code: Ac1015SymbolFieldCode,
  what: string,
): Ac1015SymbolFieldValue {
  switch (code) {
    case "B":
      return reader.readB();
    case "2B":
      return reader.readB() | (reader.readB() << 1);
    case "4B":
      return (
        reader.readB() |
        (reader.readB() << 1) |
        (reader.readB() << 2) |
        (reader.readB() << 3)
      );
    case "RC":
      return reader.readRC();
    case "BS":
      return reader.readBS();
    case "BL":
      return reader.readBL();
    case "BD":
      return finiteDecoded(reader, reader.readBD(), what);
    case "RD":
      return finiteDecoded(reader, reader.readRD(), what);
    case "TV":
      return copyTextBytes(reader.readTV().bytes);
    case "2RD":
      return Object.freeze([
        finiteDecoded(reader, reader.readRD(), what),
        finiteDecoded(reader, reader.readRD(), what),
      ]);
    case "2BD":
      return Object.freeze([
        finiteDecoded(reader, reader.readBD(), what),
        finiteDecoded(reader, reader.readBD(), what),
      ]);
    case "3BD":
      return Object.freeze([
        finiteDecoded(reader, reader.readBD(), what),
        finiteDecoded(reader, reader.readBD(), what),
        finiteDecoded(reader, reader.readBD(), what),
      ]);
  }
}

/**
 * Lee una disposición completa sobre un registro MUTABLE del llamador, en el
 * orden exacto declarado. Exportada para que `objects-dictionary.ts` lea sus
 * objetos de clase con el MISMO criterio — cero lectores gemelos.
 */
export function readAc1015FieldLayout(
  reader: DwgBitReader,
  layout: Ac1015FieldLayout,
  into: Record<string, Ac1015SymbolFieldValue>,
  what: string,
): void {
  for (const [name, code] of layout) {
    into[name] = readFieldCode(reader, code, `${what} field "${name}"`);
  }
}

/** El tipo BS con que arranca un cuerpo, sin mover ningún estado compartido. */
function peekAc1015BodyType(bodyBytes: Uint8Array): number {
  return new DwgBitReader(new BoundedByteCursor(bodyBytes)).readBS();
}

/** La apertura común de entrada: nombre TV + los tres campos de xref. */
function readSymbolEntryHead(reader: DwgBitReader): Ac1015SymbolTableEntryHead {
  const name = copyTextBytes(reader.readTV().bytes);
  const xrefRef = reader.readB() === 1;
  const xrefIndexPlusOne = reader.readBS();
  const xrefDependent = reader.readB() === 1;
  return Object.freeze({ name, xrefRef, xrefIndexPlusOne, xrefDependent });
}

// ---------------------------------------------------------------------------
// Decodificadores
// ---------------------------------------------------------------------------

/**
 * Decodifica el cuerpo COMPLETO de cualquiera de los ocho CONTROLES de tabla
 * de símbolos. Un tipo ajeno es capacidad ausente, no corrupción — mismo
 * criterio que el resto de filtros del laboratorio.
 */
export function decodeAc1015SymbolControlBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedSymbolControl {
  if (!AC1015_SYMBOL_CONTROL_TYPES.has(peekAc1015BodyType(bodyBytes))) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "This object type is not decoded as a symbol table control by the phase-D5 laboratory.",
    );
  }
  const { common, reader, bodyBitLength, opaqueSpans } =
    readAc1015TableObjectCommon(bodyBytes);

  const entryCount = reader.readBL();
  // Reactores Y entradas comparten el flujo final; la suma se cobra ANTES de
  // recorrer o reservar (en el LTYPE CONTROL es cota inferior: BYBLOCK y
  // BYLAYER viajan además del recuento, hecho registrado).
  assertHandleCountFits(
    reader,
    common.reactorCount + entryCount,
    common.bitSize,
    bodyBitLength,
    "symbol table entry",
  );

  // Hecho medido del intake 2026-08-21: el DIMSTYLE CONTROL lleva un byte RC
  // adicional que la ODS no lista. Se lee SOLO cuando el tamaño declarado lo
  // exige; cualquier otro sobrante lo rechaza el cierre exacto.
  const dimstyleTailByte =
    common.type === AC1015_TYPE_DIMSTYLE_CONTROL &&
    common.bitSize - reader.bitPosition === 8
      ? reader.readRC()
      : undefined;

  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    opaqueSpans,
  );
  return Object.freeze({ common, entryCount, dimstyleTailByte, opaqueSpans: spans });
}

/** Disposición fija por tipo de entrada; VIEW y LTYPE llevan lector propio. */
const ENTRY_LAYOUTS: ReadonlyMap<number, readonly [string, Ac1015FieldLayout]> =
  new Map([
    [AC1015_TYPE_STYLE, ["a STYLE", AC1015_STYLE_FIELD_LAYOUT] as const],
    [AC1015_TYPE_UCS, ["a UCS", AC1015_UCS_FIELD_LAYOUT] as const],
    [AC1015_TYPE_VPORT, ["a VPORT", AC1015_VPORT_FIELD_LAYOUT] as const],
    [AC1015_TYPE_APPID, ["an APPID", AC1015_APPID_FIELD_LAYOUT] as const],
    [AC1015_TYPE_DIMSTYLE, ["a DIMSTYLE", AC1015_DIMSTYLE_FIELD_LAYOUT] as const],
    [
      AC1015_TYPE_VP_ENT_HDR,
      ["a VP ENT HDR", AC1015_VP_ENT_HDR_FIELD_LAYOUT] as const,
    ],
  ]);

/**
 * Decodifica el cuerpo COMPLETO de una entrada de tabla de símbolos (STYLE,
 * LTYPE, VIEW, UCS, VPORT, APPID, DIMSTYLE o VP ENT HDR). `bodyBytes` son los
 * bytes exactos del dato de la envoltura D1 (tipo BS incluido).
 */
export function decodeAc1015SymbolTableEntryBody(
  bodyBytes: Uint8Array,
): Ac1015DecodedSymbolEntry {
  const type = peekAc1015BodyType(bodyBytes);
  if (
    !ENTRY_LAYOUTS.has(type) &&
    type !== AC1015_TYPE_LTYPE &&
    type !== AC1015_TYPE_VIEW
  ) {
    throwDwgError(
      "DWG_VERSION_DECODER_UNSUPPORTED",
      "unsupported",
      0,
      "This object type is not decoded as a symbol table entry by the phase-D5 laboratory.",
    );
  }
  const { common, reader, bodyBitLength, opaqueSpans } =
    readAc1015TableObjectCommon(bodyBytes);
  const head = readSymbolEntryHead(reader);

  const fields: Record<string, Ac1015SymbolFieldValue> = {};
  if (common.type === AC1015_TYPE_LTYPE) {
    readLinetypeFields(reader, common, fields);
  } else if (common.type === AC1015_TYPE_VIEW) {
    readAc1015FieldLayout(reader, AC1015_VIEW_FIELD_LAYOUT, fields, "a VIEW");
    // El bloque UCS del VIEW sólo viaja con el bit de UCS asociado a 1
    // (hecho registrado §20.4.60, R2000+).
    const hasUcs = reader.readB();
    fields["associatedUcsBit"] = hasUcs;
    if (hasUcs === 1) {
      readAc1015FieldLayout(reader, AC1015_VIEW_UCS_FIELD_LAYOUT, fields, "a VIEW");
    }
  } else {
    const [what, layout] = ENTRY_LAYOUTS.get(common.type)!;
    readAc1015FieldLayout(reader, layout, fields, what);
  }

  const spans = closeAc1015ObjectWithHandleStream(
    reader,
    common.bitSize,
    bodyBitLength,
    opaqueSpans,
  );
  return Object.freeze({ common, head, fields: Object.freeze(fields), opaqueSpans: spans });
}

/**
 * Los campos propios del LTYPE: descripción, patrón, trazos RC-contados en
 * listas paralelas y el área de texto de 256 bytes que el corpus demostró
 * SIEMPRE presente en AC1015 — sus bytes viajan crudos, no interpretados.
 */
function readLinetypeFields(
  reader: DwgBitReader,
  common: Ac1015TableObjectCommon,
  fields: Record<string, Ac1015SymbolFieldValue>,
): void {
  fields["description"] = copyTextBytes(reader.readTV().bytes);
  fields["patternLength"] = finiteDecoded(reader, reader.readBD(), "a linetype pattern length");
  fields["alignment"] = reader.readRC();
  const dashCount = reader.readRC();
  // El recuento se acota contra los bits declarados ANTES de reservar nada.
  if (dashCount * LTYPE_DASH_MIN_BITS > common.bitSize - reader.bitPosition) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The linetype dash count cannot fit inside the declared bit size.",
    );
  }
  const lengths = new Array<number>(dashCount);
  const shapeCodes = new Array<number>(dashCount);
  const xOffsets = new Array<number>(dashCount);
  const yOffsets = new Array<number>(dashCount);
  const scales = new Array<number>(dashCount);
  const rotations = new Array<number>(dashCount);
  const shapeFlags = new Array<number>(dashCount);
  for (let index = 0; index < dashCount; index += 1) {
    lengths[index] = finiteDecoded(reader, reader.readBD(), "a linetype dash length");
    shapeCodes[index] = reader.readBS();
    xOffsets[index] = finiteDecoded(reader, reader.readRD(), "a linetype dash offset");
    yOffsets[index] = finiteDecoded(reader, reader.readRD(), "a linetype dash offset");
    scales[index] = finiteDecoded(reader, reader.readBD(), "a linetype dash scale");
    rotations[index] = finiteDecoded(reader, reader.readBD(), "a linetype dash rotation");
    shapeFlags[index] = reader.readBS();
  }
  fields["dashLengths"] = Object.freeze(lengths);
  fields["dashShapeCodes"] = Object.freeze(shapeCodes);
  fields["dashXOffsets"] = Object.freeze(xOffsets);
  fields["dashYOffsets"] = Object.freeze(yOffsets);
  fields["dashScales"] = Object.freeze(scales);
  fields["dashRotations"] = Object.freeze(rotations);
  fields["dashShapeFlags"] = Object.freeze(shapeFlags);

  // Hecho medido: tras los trazos, el tamaño declarado debe dejar EXACTAMENTE
  // el área de texto de 256 bytes. Cualquier otro resto es un dato mentiroso.
  if (common.bitSize - reader.bitPosition !== AC1015_LTYPE_TEXT_AREA_BYTES * 8) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      "The linetype text area does not fill the declared bit size.",
    );
  }
  const textArea = new Array<number>(AC1015_LTYPE_TEXT_AREA_BYTES);
  for (let index = 0; index < AC1015_LTYPE_TEXT_AREA_BYTES; index += 1) {
    textArea[index] = reader.readRC();
  }
  fields["textAreaBytes"] = Object.freeze(textArea);
}

// ---------------------------------------------------------------------------
// Familia y proyección a la base neutral
// ---------------------------------------------------------------------------

/** Tablas de la base neutral que reciben entradas de este módulo. */
export type Ac1015SymbolTableName =
  | "styles"
  | "linetypes"
  | "views"
  | "ucss"
  | "vports"
  | "appids"
  | "dimstyles";

/** Tabla destino por tipo; los controles y el VP ENT HDR no proyectan. */
const TABLE_OF_TYPE: ReadonlyMap<number, Ac1015SymbolTableName> = new Map([
  [AC1015_TYPE_STYLE, "styles"],
  [AC1015_TYPE_LTYPE, "linetypes"],
  [AC1015_TYPE_VIEW, "views"],
  [AC1015_TYPE_UCS, "ucss"],
  [AC1015_TYPE_VPORT, "vports"],
  [AC1015_TYPE_APPID, "appids"],
  [AC1015_TYPE_DIMSTYLE, "dimstyles"],
]);

/** Una entrada de tabla en la base neutral: handle, nombre y campos crudos. */
export interface Ac1015DatabaseTableEntry {
  readonly handle: number;
  /** Bytes del nombre en la página de códigos del dibujo. */
  readonly name: readonly number[];
  readonly fields: Readonly<Record<string, Ac1015SymbolFieldValue>>;
}

/** Las tablas de símbolos de la base neutral (fase D5). */
export interface Ac1015DatabaseSymbolTables {
  readonly styles: readonly Ac1015DatabaseTableEntry[];
  readonly linetypes: readonly Ac1015DatabaseTableEntry[];
  readonly dimstyles: readonly Ac1015DatabaseTableEntry[];
  readonly appids: readonly Ac1015DatabaseTableEntry[];
  readonly vports: readonly Ac1015DatabaseTableEntry[];
  readonly views: readonly Ac1015DatabaseTableEntry[];
  readonly ucss: readonly Ac1015DatabaseTableEntry[];
  readonly mlinestyles: readonly Ac1015DatabaseTableEntry[];
}

/** Un diccionario de la base neutral: handle y entradas nombre → handle. */
export interface Ac1015DatabaseDictionary {
  readonly handle: number;
  readonly entries: readonly {
    readonly name: readonly number[];
    /** Handle resuelto del item; `undefined` cuando la referencia es nula. */
    readonly itemHandle: number | undefined;
  }[];
}

/** Resultado de la familia: handle propio y, si proyecta, tabla + entrada. */
export interface Ac1015DecodedSymbolObject {
  readonly handle: number;
  readonly table: Ac1015SymbolTableName | undefined;
  readonly entry: Ac1015DatabaseTableEntry | undefined;
}

/**
 * Decodifica un cuerpo de la familia de tablas de símbolos según su tipo BS.
 * Devuelve `null` cuando el tipo no pertenece a la familia — el llamador
 * decide (otra familia o unsupported); la corrupción se propaga tipada.
 */
export function decodeAc1015SymbolFamilyObject(
  type: number,
  bodyBytes: Uint8Array,
): Ac1015DecodedSymbolObject | null {
  if (AC1015_SYMBOL_CONTROL_TYPES.has(type)) {
    const control = decodeAc1015SymbolControlBody(bodyBytes);
    return Object.freeze({
      handle: control.common.ownHandle.value,
      table: undefined,
      entry: undefined,
    });
  }
  if (!TABLE_OF_TYPE.has(type) && type !== AC1015_TYPE_VP_ENT_HDR) return null;
  const decoded = decodeAc1015SymbolTableEntryBody(bodyBytes);
  const handle = decoded.common.ownHandle.value;
  const table = TABLE_OF_TYPE.get(type);
  const entry =
    table === undefined
      ? undefined
      : Object.freeze({ handle, name: decoded.head.name, fields: decoded.fields });
  return Object.freeze({ handle, table, entry });
}

/**
 * Proyecta los objetos decodificados de ambas familias a las tablas y los
 * diccionarios de la base neutral, en el orden del mapa de objetos. Vive aquí
 * para que el lector de la base sólo ORQUESTE — un solo criterio de proyección.
 */
export function buildAc1015NeutralTables(
  symbolObjects: readonly Ac1015DecodedSymbolObject[],
  dictionaryObjects: readonly Ac1015DecodedDictionaryFamily[],
): {
  readonly tables: Ac1015DatabaseSymbolTables;
  readonly dictionaries: readonly Ac1015DatabaseDictionary[];
} {
  const buckets: Record<Ac1015SymbolTableName, Ac1015DatabaseTableEntry[]> = {
    styles: [],
    linetypes: [],
    dimstyles: [],
    appids: [],
    vports: [],
    views: [],
    ucss: [],
  };
  for (const object of symbolObjects) {
    if (object.table !== undefined && object.entry !== undefined) {
      buckets[object.table].push(object.entry);
    }
  }

  const mlinestyles: Ac1015DatabaseTableEntry[] = [];
  const dictionaries: Ac1015DatabaseDictionary[] = [];
  for (const object of dictionaryObjects) {
    if (object.kind === "mlinestyle") {
      mlinestyles.push(mlineStyleEntry(object.handle, object.mlinestyle));
      continue;
    }
    if (object.kind === "dictionary") {
      dictionaries.push(
        Object.freeze({
          handle: object.handle,
          entries: Object.freeze(
            object.dictionary.entries.map((entry) =>
              Object.freeze({
                name: entry.name,
                itemHandle:
                  entry.item.kind === "null" ? undefined : entry.item.handle,
              }),
            ),
          ),
        }),
      );
    }
  }

  return Object.freeze({
    tables: Object.freeze({
      styles: Object.freeze(buckets.styles),
      linetypes: Object.freeze(buckets.linetypes),
      dimstyles: Object.freeze(buckets.dimstyles),
      appids: Object.freeze(buckets.appids),
      vports: Object.freeze(buckets.vports),
      views: Object.freeze(buckets.views),
      ucss: Object.freeze(buckets.ucss),
      mlinestyles: Object.freeze(mlinestyles),
    }),
    dictionaries: Object.freeze(dictionaries),
  });
}

/** La entrada de tabla de un MLINESTYLE: mismos campos crudos, congelados. */
function mlineStyleEntry(
  handle: number,
  style: Ac1015DecodedMlineStyle,
): Ac1015DatabaseTableEntry {
  return Object.freeze({
    handle,
    name: style.name,
    fields: Object.freeze({
      description: style.description,
      styleFlags: style.styleFlags,
      fillColorIndex: style.fillColorIndex,
      startAngle: style.startAngle,
      endAngle: style.endAngle,
      segmentOffsets: style.segmentOffsets,
      segmentColorIndexes: style.segmentColorIndexes,
      segmentLinetypeIndexes: style.segmentLinetypeIndexes,
    }),
  });
}
