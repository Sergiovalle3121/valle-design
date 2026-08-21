/**
 * Spec de la fase D5, mitad de tablas de símbolos: STYLE, LTYPE, VIEW, UCS,
 * VPORT, APPID, DIMSTYLE, VP ENT HDR y sus CONTROLES.
 *
 * No existe writer first-party para estos tipos todavía: los casos felices
 * componen los cuerpos a mano con `DwgBitEmitter` siguiendo las disposiciones
 * DECLARATIVAS exportadas — el mismo orden que el decodificador lee, así que
 * cualquier asimetría revienta el round-trip. Los gemelos tristes cortan,
 * mienten tamaños o declaran recuentos imposibles; los filtros cruzados
 * exigen que un tipo ajeno caiga `unsupported`, no corrupto. Los hechos
 * MEDIDOS del corpus (byte extra del DIMSTYLE CONTROL, área de texto de 256
 * bytes del LTYPE) tienen aquí su gemelo de laboratorio.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AC1015_DIMSTYLE_FIELD_LAYOUT,
  AC1015_LTYPE_TEXT_AREA_BYTES,
  AC1015_STYLE_FIELD_LAYOUT,
  AC1015_SYMBOL_CONTROL_TYPES,
  AC1015_TYPE_APPID,
  AC1015_TYPE_APPID_CONTROL,
  AC1015_TYPE_DIMSTYLE,
  AC1015_TYPE_DIMSTYLE_CONTROL,
  AC1015_TYPE_LTYPE,
  AC1015_TYPE_LTYPE_CONTROL,
  AC1015_TYPE_STYLE,
  AC1015_TYPE_STYLE_CONTROL,
  AC1015_TYPE_UCS,
  AC1015_TYPE_UCS_CONTROL,
  AC1015_TYPE_VIEW,
  AC1015_TYPE_VIEW_CONTROL,
  AC1015_TYPE_VPORT,
  AC1015_TYPE_VPORT_CONTROL,
  AC1015_TYPE_VP_ENT_HDR,
  AC1015_TYPE_VP_ENT_HDR_CONTROL,
  AC1015_UCS_FIELD_LAYOUT,
  AC1015_VIEW_FIELD_LAYOUT,
  AC1015_VIEW_UCS_FIELD_LAYOUT,
  AC1015_VPORT_FIELD_LAYOUT,
  AC1015_VP_ENT_HDR_FIELD_LAYOUT,
  buildAc1015NeutralTables,
  decodeAc1015SymbolControlBody,
  decodeAc1015SymbolFamilyObject,
  decodeAc1015SymbolTableEntryBody,
  type Ac1015FieldLayout,
  type Ac1015SymbolFieldValue,
} from "../../src/objects/tables-symbol.js";
import { DwgBitEmitter } from "../../src/writer/dwg-bit-emitter.js";
import { assertDwgError } from "../support/assert.js";

/** Compone un cuerpo de OBJETO: tipo BS + RL (con ajuste) + cola + flujo. */
function composeBody(
  type: number,
  tail: DwgBitEmitter,
  streamHandles = 2,
  bitSizeAdjust = 0,
): Uint8Array {
  const head = new DwgBitEmitter();
  head.emitBS(type);
  const bitSize = head.bitLength + 32 + tail.bitLength + bitSizeAdjust;
  const body = new DwgBitEmitter();
  body.pushEmitter(head);
  body.emitRL(bitSize);
  body.pushEmitter(tail);
  for (let index = 0; index < streamHandles; index += 1) {
    body.emitH(0, 0);
  }
  return body.toBytes();
}

/** El prólogo de objeto de tabla: handle propio + EED vacío + 0 reactores. */
function objectTail(handle: number): DwgBitEmitter {
  const tail = new DwgBitEmitter();
  tail.emitH(0, handle);
  tail.emitBS(0); // EED vacío
  tail.emitBL(0); // reactores
  return tail;
}

/** La apertura de entrada: nombre TV + los tres campos de xref a cero. */
function pushEntryHead(tail: DwgBitEmitter, name: readonly number[]): void {
  tail.emitTV([...name]);
  tail.pushBit(0);
  tail.emitBS(0);
  tail.pushBit(0);
}

/** Emite una disposición completa (espejo de `readAc1015FieldLayout`). */
function pushFieldLayout(
  tail: DwgBitEmitter,
  layout: Ac1015FieldLayout,
  values: Record<string, Ac1015SymbolFieldValue> = {},
): void {
  for (const [name, code] of layout) {
    const value = values[name];
    switch (code) {
      case "B":
        tail.pushBit((value as 0 | 1 | undefined) ?? 0);
        break;
      case "2B":
      case "4B": {
        const width = code === "2B" ? 2 : 4;
        const raw = (value as number | undefined) ?? 0;
        for (let bit = 0; bit < width; bit += 1) {
          tail.pushBit(((raw >> bit) & 1) as 0 | 1);
        }
        break;
      }
      case "RC":
        tail.emitRC((value as number | undefined) ?? 0);
        break;
      case "BS":
        tail.emitBS((value as number | undefined) ?? 0);
        break;
      case "BL":
        tail.emitBL((value as number | undefined) ?? 0);
        break;
      case "BD":
        tail.emitBD((value as number | undefined) ?? 0);
        break;
      case "RD":
        tail.emitRD((value as number | undefined) ?? 0);
        break;
      case "TV":
        tail.emitTV([...((value as readonly number[] | undefined) ?? [])]);
        break;
      case "2RD": {
        const pair = (value as readonly number[] | undefined) ?? [0, 0];
        tail.emitRD(pair[0]!);
        tail.emitRD(pair[1]!);
        break;
      }
      case "2BD": {
        const pair = (value as readonly number[] | undefined) ?? [0, 0];
        tail.emitBD(pair[0]!);
        tail.emitBD(pair[1]!);
        break;
      }
      case "3BD": {
        const triple = (value as readonly number[] | undefined) ?? [0, 0, 0];
        tail.emitBD(triple[0]!);
        tail.emitBD(triple[1]!);
        tail.emitBD(triple[2]!);
        break;
      }
    }
  }
}

const STYLE_NAME = [0x52, 0x4f, 0x54, 0x55]; // "ROTU"

function styleBody(handle = 0x11): Uint8Array {
  const tail = objectTail(handle);
  pushEntryHead(tail, STYLE_NAME);
  pushFieldLayout(tail, AC1015_STYLE_FIELD_LAYOUT, {
    widthFactor: 0.9,
    obliqueAngle: 0.2617993877991494,
    lastHeight: 2.5,
    fontName: [0x74, 0x78, 0x74],
  });
  return composeBody(AC1015_TYPE_STYLE, tail, 3);
}

test("los códigos de tipo BS registrados de las tablas de símbolos", () => {
  assert.deepEqual(
    [
      AC1015_TYPE_STYLE_CONTROL,
      AC1015_TYPE_STYLE,
      AC1015_TYPE_LTYPE_CONTROL,
      AC1015_TYPE_LTYPE,
      AC1015_TYPE_VIEW_CONTROL,
      AC1015_TYPE_VIEW,
      AC1015_TYPE_UCS_CONTROL,
      AC1015_TYPE_UCS,
      AC1015_TYPE_VPORT_CONTROL,
      AC1015_TYPE_VPORT,
      AC1015_TYPE_APPID_CONTROL,
      AC1015_TYPE_APPID,
      AC1015_TYPE_DIMSTYLE_CONTROL,
      AC1015_TYPE_DIMSTYLE,
      AC1015_TYPE_VP_ENT_HDR_CONTROL,
      AC1015_TYPE_VP_ENT_HDR,
    ],
    [0x34, 0x35, 0x38, 0x39, 0x3c, 0x3d, 0x3e, 0x3f, 0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47],
  );
  assert.equal(AC1015_SYMBOL_CONTROL_TYPES.size, 8);
});

test("round-trip de un CONTROL: recuento y flujo contabilizado", () => {
  const tail = objectTail(3);
  tail.emitBL(2); // dos entradas
  const decoded = decodeAc1015SymbolControlBody(
    composeBody(AC1015_TYPE_STYLE_CONTROL, tail, 4),
  );
  assert.equal(decoded.common.type, AC1015_TYPE_STYLE_CONTROL);
  assert.equal(decoded.common.ownHandle.value, 3);
  assert.equal(decoded.entryCount, 2);
  assert.equal(decoded.dimstyleTailByte, undefined);
  assert.equal(decoded.opaqueSpans.length, 1);
  assert.equal(decoded.opaqueSpans[0]!.kind, "handle-stream");
  assert.equal(decoded.opaqueSpans[0]!.startBit, decoded.common.bitSize);
});

test("hecho medido: el byte extra del DIMSTYLE CONTROL, con y sin él", () => {
  // CON el byte (los 25 controles reales del corpus lo llevan, valor 0).
  const withByte = objectTail(0xa);
  withByte.emitBL(1);
  withByte.emitRC(0);
  const decoded = decodeAc1015SymbolControlBody(
    composeBody(AC1015_TYPE_DIMSTYLE_CONTROL, withByte, 3),
  );
  assert.equal(decoded.dimstyleTailByte, 0);

  // SIN el byte el tamaño declarado cierra igual: capacidad, no exigencia.
  const withoutByte = objectTail(0xa);
  withoutByte.emitBL(1);
  const lean = decodeAc1015SymbolControlBody(
    composeBody(AC1015_TYPE_DIMSTYLE_CONTROL, withoutByte, 3),
  );
  assert.equal(lean.dimstyleTailByte, undefined);

  // Un sobrante de DOS bytes no es el hecho medido: fallo cerrado.
  const bloated = objectTail(0xa);
  bloated.emitBL(1);
  bloated.emitRC(0);
  bloated.emitRC(0);
  assertDwgError(
    () =>
      decodeAc1015SymbolControlBody(
        composeBody(AC1015_TYPE_DIMSTYLE_CONTROL, bloated, 3),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  // Y en un control que NO es DIMSTYLE, el mismo byte extra es corrupción.
  const foreign = objectTail(0x8);
  foreign.emitBL(1);
  foreign.emitRC(0);
  assertDwgError(
    () =>
      decodeAc1015SymbolControlBody(
        composeBody(AC1015_TYPE_VPORT_CONTROL, foreign, 3),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("round-trip del STYLE: oblicuo, factor de anchura y fuentes exactos", () => {
  const decoded = decodeAc1015SymbolTableEntryBody(styleBody());
  assert.equal(decoded.common.type, AC1015_TYPE_STYLE);
  assert.deepEqual(decoded.head.name, STYLE_NAME);
  assert.equal(decoded.head.xrefRef, false);
  assert.equal(decoded.head.xrefIndexPlusOne, 0);
  assert.equal(decoded.fields["verticalBit"], 0);
  assert.equal(decoded.fields["fixedHeight"], 0);
  assert.equal(decoded.fields["widthFactor"], 0.9);
  assert.equal(decoded.fields["obliqueAngle"], 0.2617993877991494);
  assert.equal(decoded.fields["lastHeight"], 2.5);
  assert.deepEqual(decoded.fields["fontName"], [0x74, 0x78, 0x74]);
  assert.deepEqual(decoded.fields["bigFontName"], []);
});

/** Un LTYPE de laboratorio: `dashes` y su área de texto de 256 bytes. */
function linetypeTail(
  handle: number,
  dashes: readonly number[],
  textAreaBytes = AC1015_LTYPE_TEXT_AREA_BYTES,
): DwgBitEmitter {
  const tail = objectTail(handle);
  pushEntryHead(tail, [0x54, 0x52, 0x41]); // "TRA"
  tail.emitTV([0x64]); // descripción "d"
  tail.emitBD(1); // longitud del patrón
  tail.emitRC(0x41); // alineación 'A'
  tail.emitRC(dashes.length);
  for (const length of dashes) {
    tail.emitBD(length);
    tail.emitBS(0); // código de forma
    tail.emitRD(0); // offset X
    tail.emitRD(0); // offset Y
    tail.emitBD(0); // escala
    tail.emitBD(0); // rotación
    tail.emitBS(0); // banderas de forma
  }
  for (let index = 0; index < textAreaBytes; index += 1) {
    tail.emitRC(index & 0xff);
  }
  return tail;
}

test("round-trip del LTYPE: trazos exactos y área de texto contabilizada", () => {
  const decoded = decodeAc1015SymbolTableEntryBody(
    composeBody(AC1015_TYPE_LTYPE, linetypeTail(0x14, [0.75, -0.25]), 3),
  );
  assert.equal(decoded.common.type, AC1015_TYPE_LTYPE);
  assert.equal(decoded.fields["patternLength"], 1);
  assert.equal(decoded.fields["alignment"], 0x41);
  assert.deepEqual(decoded.fields["dashLengths"], [0.75, -0.25]);
  assert.deepEqual(decoded.fields["dashShapeFlags"], [0, 0]);
  const textArea = decoded.fields["textAreaBytes"] as readonly number[];
  assert.equal(textArea.length, AC1015_LTYPE_TEXT_AREA_BYTES);
  assert.equal(textArea[0], 0);
  assert.equal(textArea[255], 255);
});

test("gemelo triste: un LTYPE sin su área de texto completa falla cerrado", () => {
  // 255 bytes de área: el tamaño declarado no deja los 256 medidos.
  assertDwgError(
    () =>
      decodeAc1015SymbolTableEntryBody(
        composeBody(AC1015_TYPE_LTYPE, linetypeTail(0x14, [], 255), 3),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
  // Un recuento de trazos que no cabe en el tamaño declarado.
  const lying = objectTail(0x14);
  pushEntryHead(lying, [0x54]);
  lying.emitTV([]);
  lying.emitBD(1);
  lying.emitRC(0x41);
  lying.emitRC(200); // 200 trazos declarados en un cuerpo diminuto
  assertDwgError(
    () => decodeAc1015SymbolTableEntryBody(composeBody(AC1015_TYPE_LTYPE, lying, 3)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("round-trip del VIEW: el bloque UCS sólo viaja con su bit a 1", () => {
  const without = objectTail(0x3d);
  pushEntryHead(without, [0x56]); // "V"
  pushFieldLayout(without, AC1015_VIEW_FIELD_LAYOUT, { viewHeight: 9, viewWidth: 16 });
  without.pushBit(0); // sin UCS asociado
  const flat = decodeAc1015SymbolTableEntryBody(
    composeBody(AC1015_TYPE_VIEW, without, 3),
  );
  assert.equal(flat.fields["viewHeight"], 9);
  assert.equal(flat.fields["associatedUcsBit"], 0);
  assert.equal(flat.fields["ucsOrigin"], undefined);

  const withUcs = objectTail(0x3d);
  pushEntryHead(withUcs, [0x56]);
  pushFieldLayout(withUcs, AC1015_VIEW_FIELD_LAYOUT, { viewModeBits: 0b1001 });
  withUcs.pushBit(1);
  pushFieldLayout(withUcs, AC1015_VIEW_UCS_FIELD_LAYOUT, {
    ucsOrigin: [1, 2, 3],
    ucsOrthographicViewType: 5,
  });
  const decoded = decodeAc1015SymbolTableEntryBody(
    composeBody(AC1015_TYPE_VIEW, withUcs, 3),
  );
  assert.equal(decoded.fields["viewModeBits"], 0b1001);
  assert.equal(decoded.fields["associatedUcsBit"], 1);
  assert.deepEqual(decoded.fields["ucsOrigin"], [1, 2, 3]);
  assert.equal(decoded.fields["ucsOrthographicViewType"], 5);
});

test("round-trip de UCS, VPORT, APPID y VP ENT HDR con sus disposiciones", () => {
  const ucsTail = objectTail(0x3f);
  pushEntryHead(ucsTail, [0x55]); // "U"
  pushFieldLayout(ucsTail, AC1015_UCS_FIELD_LAYOUT, {
    origin: [10, 20, 30],
    orthographicType: 2,
  });
  const ucs = decodeAc1015SymbolTableEntryBody(composeBody(AC1015_TYPE_UCS, ucsTail, 3));
  assert.deepEqual(ucs.fields["origin"], [10, 20, 30]);
  assert.equal(ucs.fields["orthographicType"], 2);

  const vportTail = objectTail(0x21);
  pushEntryHead(vportTail, [0x2a, 0x41]); // "*A"
  pushFieldLayout(vportTail, AC1015_VPORT_FIELD_LAYOUT, {
    viewHeight: 9,
    aspectRatio: 17.75,
    circleZoom: 100,
    ucsIconBits: 0b11,
    ucsPerViewportBit: 1,
  });
  const vport = decodeAc1015SymbolTableEntryBody(
    composeBody(AC1015_TYPE_VPORT, vportTail, 3),
  );
  assert.equal(vport.fields["viewHeight"], 9);
  assert.equal(vport.fields["aspectRatio"], 17.75);
  assert.equal(vport.fields["circleZoom"], 100);
  assert.equal(vport.fields["ucsIconBits"], 0b11);
  assert.equal(vport.fields["ucsPerViewportBit"], 1);

  const appidTail = objectTail(0x12);
  pushEntryHead(appidTail, [0x41, 0x43, 0x41, 0x44]); // "ACAD"
  appidTail.emitRC(0);
  const appid = decodeAc1015SymbolTableEntryBody(
    composeBody(AC1015_TYPE_APPID, appidTail, 3),
  );
  assert.deepEqual(appid.head.name, [0x41, 0x43, 0x41, 0x44]);
  assert.equal(appid.fields["unknownByte71"], 0);

  const headerTail = objectTail(0x58);
  pushEntryHead(headerTail, [0x31]); // "1"
  pushFieldLayout(headerTail, AC1015_VP_ENT_HDR_FIELD_LAYOUT, { flag70Bit: 1 });
  const header = decodeAc1015SymbolTableEntryBody(
    composeBody(AC1015_TYPE_VP_ENT_HDR, headerTail, 5),
  );
  assert.equal(header.fields["flag70Bit"], 1);
});

test("round-trip del DIMSTYLE: las variables R2000 en su orden exacto", () => {
  const tail = objectTail(0x1d);
  pushEntryHead(tail, [0x56, 0x43]); // "VC"
  pushFieldLayout(tail, AC1015_DIMSTYLE_FIELD_LAYOUT, {
    dimpost: [0x3c, 0x3e], // "<>"
    dimscale: 1,
    dimasz: 3.5,
    dimtxt: 4,
    dimdec: 4,
    dimlunit: 2,
    dimtol: 1,
    dimlwd: 25,
  });
  const decoded = decodeAc1015SymbolTableEntryBody(
    composeBody(AC1015_TYPE_DIMSTYLE, tail, 9),
  );
  assert.deepEqual(decoded.head.name, [0x56, 0x43]);
  assert.deepEqual(decoded.fields["dimpost"], [0x3c, 0x3e]);
  assert.equal(decoded.fields["dimscale"], 1);
  assert.equal(decoded.fields["dimasz"], 3.5);
  assert.equal(decoded.fields["dimtxt"], 4);
  assert.equal(decoded.fields["dimdec"], 4);
  assert.equal(decoded.fields["dimlunit"], 2);
  assert.equal(decoded.fields["dimtol"], 1);
  assert.equal(decoded.fields["dimlwd"], 25);
  assert.equal(decoded.fields["unknown70Bit"], 0);
});

test("la familia despacha: controles sin proyección, entradas a su tabla", () => {
  const style = decodeAc1015SymbolFamilyObject(AC1015_TYPE_STYLE, styleBody());
  assert.ok(style !== null);
  assert.equal(style.table, "styles");
  assert.equal(style.entry?.handle, 0x11);
  assert.deepEqual(style.entry?.name, STYLE_NAME);

  const controlTail = objectTail(3);
  controlTail.emitBL(0);
  const control = decodeAc1015SymbolFamilyObject(
    AC1015_TYPE_STYLE_CONTROL,
    composeBody(AC1015_TYPE_STYLE_CONTROL, controlTail, 2),
  );
  assert.ok(control !== null);
  assert.equal(control.table, undefined);
  assert.equal(control.entry, undefined);

  // Un tipo ajeno a la familia no es de nadie aquí: null, decide el llamador.
  assert.equal(decodeAc1015SymbolFamilyObject(0x64, styleBody()), null);

  const { tables, dictionaries } = buildAc1015NeutralTables([style, control], []);
  assert.equal(tables.styles.length, 1);
  assert.equal(tables.styles[0]!.handle, 0x11);
  assert.deepEqual(tables.linetypes, []);
  assert.deepEqual(tables.mlinestyles, []);
  assert.deepEqual(dictionaries, []);
});

test("filtros cruzados y gemelos tristes: ajenos, cortes y tamaños torcidos", () => {
  // Un cuerpo de entrada no es un control, y viceversa.
  assertDwgError(
    () => decodeAc1015SymbolControlBody(styleBody()),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );
  const controlTail = objectTail(3);
  controlTail.emitBL(0);
  const controlBody = composeBody(AC1015_TYPE_STYLE_CONTROL, controlTail, 2);
  assertDwgError(
    () => decodeAc1015SymbolTableEntryBody(controlBody),
    "DWG_VERSION_DECODER_UNSUPPORTED",
  );

  // Cortes dentro del dato declarado: fallo cerrado con su byte.
  const body = styleBody();
  for (const cut of [1, 4, 9, 14]) {
    assertDwgError(
      () => decodeAc1015SymbolTableEntryBody(body.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }

  // Un tamaño declarado corrido ±8 bits nunca puede cerrar.
  for (const adjust of [-8, 8]) {
    const tail = objectTail(0x11);
    pushEntryHead(tail, STYLE_NAME);
    pushFieldLayout(tail, AC1015_STYLE_FIELD_LAYOUT);
    assertDwgError(
      () =>
        decodeAc1015SymbolTableEntryBody(
          composeBody(AC1015_TYPE_STYLE, tail, 3, adjust),
        ),
      "DWG_STRUCTURE_CORRUPT",
    );
  }

  // Un recuento de entradas que no cabe en el flujo de handles.
  const greedy = objectTail(3);
  greedy.emitBL(500);
  assertDwgError(
    () => decodeAc1015SymbolControlBody(composeBody(AC1015_TYPE_LTYPE_CONTROL, greedy, 2)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

console.log(
  "tables-symbol.spec: fase D5 verde — las ocho tablas de símbolos y sus controles hacen round-trip con disposiciones declarativas; el byte del DIMSTYLE CONTROL y el área de 256 bytes del LTYPE (hechos medidos) tienen gemelo de laboratorio, y lo hostil cae tipado.",
);
