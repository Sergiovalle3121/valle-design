/**
 * Spec de la fase D5, mitad de objetos: DICTIONARY, XRECORD, GROUP,
 * MLINESTYLE, la sección de CLASES y los objetos de clase.
 *
 * Igual que en la mitad de tablas, no existe writer first-party: los casos
 * felices componen cuerpos y payloads a mano con `DwgBitEmitter` en el orden
 * exacto que el decodificador declara. La sección de clases se decodifica de
 * un payload sintético con relleno final (como el real); el diccionario
 * resuelve sus entradas nombre → handle contra el flujo; los objetos de
 * clase (LAYOUT, PLOTSETTINGS, DICTIONARYVAR, SCALE, WDFLT, PLACEHOLDER) se
 * despachan por NOMBRE de clase, nunca por número fijo. Lo hostil cae tipado.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AC1015_DICTIONARY_VAR_FIELD_LAYOUT,
  AC1015_LAYOUT_FIELD_LAYOUT,
  AC1015_SCALE_FIELD_LAYOUT,
  AC1015_TYPE_DICTIONARY,
  AC1015_TYPE_GROUP,
  AC1015_TYPE_MLINESTYLE,
  AC1015_TYPE_XRECORD,
  decodeAc1015ClassesSection,
  decodeAc1015DictionaryBody,
  decodeAc1015DictionaryFamilyObject,
  decodeAc1015DictionaryVarBody,
  decodeAc1015DictionaryWithDefaultBody,
  decodeAc1015GroupBody,
  decodeAc1015LayoutBody,
  decodeAc1015MlineStyleBody,
  decodeAc1015PlaceholderBody,
  decodeAc1015ScaleBody,
  decodeAc1015XrecordBody,
} from "../../src/objects/objects-dictionary.js";
import { buildAc1015NeutralTables } from "../../src/objects/tables-symbol.js";
import { DwgBitEmitter } from "../../src/writer/dwg-bit-emitter.js";
import { assertDwgError } from "../support/assert.js";

/** Compone un cuerpo de OBJETO: tipo BS + RL (con ajuste) + cola + flujo. */
function composeBody(
  type: number,
  tail: DwgBitEmitter,
  stream?: DwgBitEmitter,
  bitSizeAdjust = 0,
): Uint8Array {
  const head = new DwgBitEmitter();
  head.emitBS(type);
  const bitSize = head.bitLength + 32 + tail.bitLength + bitSizeAdjust;
  const body = new DwgBitEmitter();
  body.pushEmitter(head);
  body.emitRL(bitSize);
  body.pushEmitter(tail);
  if (stream !== undefined) body.pushEmitter(stream);
  return body.toBytes();
}

/** El prólogo de objeto: handle propio + EED vacío + reactores. */
function objectTail(handle: number, reactorCount = 0): DwgBitEmitter {
  const tail = new DwgBitEmitter();
  tail.emitH(0, handle);
  tail.emitBS(0); // EED vacío
  tail.emitBL(reactorCount);
  return tail;
}

/** Un flujo de handles: pares [código, valor] en orden. */
function handleStream(handles: readonly (readonly [number, number])[]): DwgBitEmitter {
  const stream = new DwgBitEmitter();
  for (const [code, value] of handles) {
    stream.emitH(code, value);
  }
  return stream;
}

const ASCII = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/** Un payload sintético de la sección de clases con dos clases + relleno. */
function classesPayload(): Uint8Array {
  const emitter = new DwgBitEmitter();
  for (const [classnum, dxfname] of [
    [500, "ACDBDICTIONARYWDFLT"],
    [511, "LAYOUT"],
  ] as const) {
    emitter.emitBS(classnum);
    emitter.emitBS(0); // versión/banderas
    emitter.emitTV(ASCII("ObjectDBX Classes"));
    emitter.emitTV(ASCII("AcDbClase"));
    emitter.emitTV(ASCII(dxfname));
    emitter.pushBit(0); // wasazombie
    emitter.emitBS(0x1f3); // produce objetos
  }
  return emitter.toBytes(); // el último byte queda con relleno a cero
}

test("la sección de clases decodifica sus conjuntos y tolera el relleno", () => {
  const records = decodeAc1015ClassesSection(classesPayload());
  assert.equal(records.length, 2);
  assert.equal(records[0]!.classNumber, 500);
  assert.deepEqual(records[0]!.dxfClassName, ASCII("ACDBDICTIONARYWDFLT"));
  assert.equal(records[0]!.itemClassId, 0x1f3);
  assert.equal(records[0]!.wasAZombie, false);
  assert.equal(records[1]!.classNumber, 511);
  assert.deepEqual(records[1]!.dxfClassName, ASCII("LAYOUT"));

  // Sin clases no hay conjuntos: lista vacía, no error.
  assert.deepEqual(decodeAc1015ClassesSection(new Uint8Array(0)), []);

  // Un TV que se sale del payload es corrupción, no una clase a medias.
  const lying = new DwgBitEmitter();
  lying.emitBS(500);
  lying.emitBS(0);
  lying.emitBS(200); // longitud TV imposible en este payload
  assertDwgError(
    () => decodeAc1015ClassesSection(lying.toBytes()),
    "DWG_STRUCTURE_CORRUPT",
  );
});

/** Un DICTIONARY de laboratorio con dos entradas y un item nulo. */
function dictionaryBody(
  type = AC1015_TYPE_DICTIONARY,
  withDefault = false,
): Uint8Array {
  const tail = objectTail(0xc, 1);
  tail.emitBL(2); // items
  tail.emitBS(1); // bandera de clonado
  tail.emitRC(0); // bandera de hard-owner
  tail.emitTV(ASCII("ACAD_GROUP"));
  tail.emitTV(ASCII("ACAD_LAYOUT"));
  const stream = handleStream([
    [4, 0], // propietario nulo suave
    [5, 0x99], // el reactor declarado
    [3, 0], // xdictionary
    [2, 0xd], // ACAD_GROUP
    [0, 0], // ACAD_LAYOUT: referencia nula
    ...(withDefault ? ([[5, 0xf]] as const) : []),
  ]);
  return composeBody(type, tail, stream);
}

test("round-trip del DICTIONARY: entradas nombre → handle resueltas", () => {
  const decoded = decodeAc1015DictionaryBody(dictionaryBody());
  assert.equal(decoded.common.ownHandle.value, 0xc);
  assert.equal(decoded.common.reactorCount, 1);
  assert.equal(decoded.cloningFlag, 1);
  assert.equal(decoded.hardOwnerFlag, 0);
  assert.equal(decoded.entries.length, 2);
  assert.deepEqual(decoded.entries[0]!.name, ASCII("ACAD_GROUP"));
  assert.deepEqual(decoded.entries[0]!.item, { kind: "absolute", handle: 0xd });
  assert.deepEqual(decoded.entries[1]!.name, ASCII("ACAD_LAYOUT"));
  assert.equal(decoded.entries[1]!.item.kind, "null");
  assert.equal(decoded.defaultEntry, undefined);
  assert.equal(decoded.opaqueSpans[0]!.kind, "handle-stream");

  // La variante WDFLT: misma disposición más la entrada por defecto.
  const wdflt = decodeAc1015DictionaryWithDefaultBody(dictionaryBody(500, true), 500);
  assert.deepEqual(wdflt.defaultEntry, { kind: "absolute", handle: 0xf });
});

test("gemelo triste: recuentos y cortes del DICTIONARY caen tipados", () => {
  // 500 items declarados con un flujo de tres handles.
  const greedy = objectTail(0xc);
  greedy.emitBL(500);
  assertDwgError(
    () =>
      decodeAc1015DictionaryBody(
        composeBody(AC1015_TYPE_DICTIONARY, greedy, handleStream([[0, 0], [0, 0], [0, 0]])),
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
  const body = dictionaryBody();
  for (const cut of [1, 5, 12, 20]) {
    assertDwgError(
      () => decodeAc1015DictionaryBody(body.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("round-trip del XRECORD: databytes contados y bandera de clonado", () => {
  const tail = objectTail(0x65, 1);
  tail.emitBL(5);
  for (let index = 0; index < 5; index += 1) tail.emitRC(0x10 + index);
  tail.emitBS(1);
  const decoded = decodeAc1015XrecordBody(
    composeBody(AC1015_TYPE_XRECORD, tail, handleStream([[4, 0xc], [4, 0xc], [3, 0]])),
  );
  assert.equal(decoded.dataByteLength, 5);
  assert.equal(decoded.cloningFlag, 1);
  assert.ok(decoded.dataStartBit > 0);

  // Databytes que se salen del tamaño declarado: fallo cerrado.
  const lying = objectTail(0x65);
  lying.emitBL(5000);
  assertDwgError(
    () => decodeAc1015XrecordBody(composeBody(AC1015_TYPE_XRECORD, lying)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("round-trip del GROUP y su recuento de miembros acotado", () => {
  const tail = objectTail(0x7b);
  tail.emitTV(ASCII("migrupo"));
  tail.emitBS(0); // con nombre
  tail.emitBS(1); // seleccionable
  tail.emitBL(3);
  const decoded = decodeAc1015GroupBody(
    composeBody(
      AC1015_TYPE_GROUP,
      tail,
      handleStream([[4, 0], [3, 0], [5, 1], [5, 2], [5, 3]]),
    ),
  );
  assert.deepEqual(decoded.name, ASCII("migrupo"));
  assert.equal(decoded.unnamedFlag, 0);
  assert.equal(decoded.selectableFlag, 1);
  assert.equal(decoded.memberCount, 3);

  const greedy = objectTail(0x7b);
  greedy.emitTV([]);
  greedy.emitBS(0);
  greedy.emitBS(0);
  greedy.emitBL(400);
  assertDwgError(
    () => decodeAc1015GroupBody(composeBody(AC1015_TYPE_GROUP, greedy, handleStream([[0, 0]]))),
    "DWG_STRUCTURE_CORRUPT",
  );
});

/** Un MLINESTYLE de laboratorio con dos segmentos (como VALLE-DOBLE). */
function mlineStyleBody(): Uint8Array {
  const tail = objectTail(0x18, 1);
  tail.emitTV(ASCII("VALLE-DOBLE"));
  tail.emitTV(ASCII("Muro doble"));
  tail.emitBS(0); // banderas
  tail.emitBS(256); // color de relleno ByLayer
  tail.emitBD(Math.PI / 2);
  tail.emitBD(Math.PI / 2);
  tail.emitRC(2);
  for (const [offset, color, linetypeIndex] of [
    [0.5, 1, 0],
    [-0.5, 5, 0],
  ] as const) {
    tail.emitBD(offset);
    tail.emitBS(color);
    tail.emitBS(linetypeIndex);
  }
  return composeBody(AC1015_TYPE_MLINESTYLE, tail, handleStream([[4, 0], [4, 0], [3, 0]]));
}

test("round-trip del MLINESTYLE: segmentos con offset, color e índice", () => {
  const decoded = decodeAc1015MlineStyleBody(mlineStyleBody());
  assert.deepEqual(decoded.name, ASCII("VALLE-DOBLE"));
  assert.deepEqual(decoded.description, ASCII("Muro doble"));
  assert.equal(decoded.fillColorIndex, 256);
  assert.equal(decoded.startAngle, Math.PI / 2);
  assert.deepEqual(decoded.segmentOffsets, [0.5, -0.5]);
  assert.deepEqual(decoded.segmentColorIndexes, [1, 5]);
  assert.deepEqual(decoded.segmentLinetypeIndexes, [0, 0]);

  // Un recuento de segmentos que no cabe en el tamaño declarado.
  const greedy = objectTail(0x18);
  greedy.emitTV([]);
  greedy.emitTV([]);
  greedy.emitBS(0);
  greedy.emitBS(0);
  greedy.emitBD(0);
  greedy.emitBD(0);
  greedy.emitRC(250);
  assertDwgError(
    () => decodeAc1015MlineStyleBody(composeBody(AC1015_TYPE_MLINESTYLE, greedy)),
    "DWG_STRUCTURE_CORRUPT",
  );
});

/** Emite los campos de una disposición de objeto de clase con valores. */
function pushClassFields(
  tail: DwgBitEmitter,
  layout: typeof AC1015_LAYOUT_FIELD_LAYOUT,
  values: Record<string, number | readonly number[]> = {},
): void {
  for (const [name, code] of layout) {
    const value = values[name];
    switch (code) {
      case "B":
        tail.pushBit((value as 0 | 1 | undefined) ?? 0);
        break;
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
      default:
        throw new Error(`código no emitido en el spec: ${code}`);
    }
  }
}

function layoutBody(type: number): Uint8Array {
  const tail = objectTail(0x1e, 1);
  pushClassFields(tail, AC1015_LAYOUT_FIELD_LAYOUT, {
    paperSizeName: ASCII("Carta"),
    paperWidth: 215.9,
    paperHeight: 279.4,
    layoutName: ASCII("Model"),
    tabOrder: 0,
    limitsMax: [12, 9],
    extentsMax: [100, 80, 0],
  });
  return composeBody(
    type,
    tail,
    handleStream([[4, 0x1a], [4, 0x1a], [3, 0], [4, 0x1d], [4, 0], [5, 0], [5, 0]]),
  );
}

test("round-trip del LAYOUT de clase: plotsettings + su cola R2000", () => {
  const decoded = decodeAc1015LayoutBody(layoutBody(511), 511);
  assert.deepEqual(decoded.fields["layoutName"], ASCII("Model"));
  assert.deepEqual(decoded.fields["paperSizeName"], ASCII("Carta"));
  assert.equal(decoded.fields["paperWidth"], 215.9);
  assert.equal(decoded.fields["tabOrder"], 0);
  assert.deepEqual(decoded.fields["limitsMax"], [12, 9]);
  assert.deepEqual(decoded.fields["extentsMax"], [100, 80, 0]);
});

test("round-trip de DICTIONARYVAR, SCALE y PLACEHOLDER de clase", () => {
  const varTail = objectTail(0x5e, 1);
  pushClassFields(varTail, AC1015_DICTIONARY_VAR_FIELD_LAYOUT, {
    value: ASCII("2"),
  });
  const dictVar = decodeAc1015DictionaryVarBody(
    composeBody(508, varTail, handleStream([[4, 0], [4, 0], [3, 0]])),
    508,
  );
  assert.equal(dictVar.fields["schemaByte"], 0);
  assert.deepEqual(dictVar.fields["value"], ASCII("2"));

  const scaleTail = objectTail(0x23, 1);
  pushClassFields(scaleTail, AC1015_SCALE_FIELD_LAYOUT, {
    name: ASCII("1:1"),
    paperUnits: 1,
    drawingUnits: 1,
    hasUnitScaleBit: 1,
  });
  const scale = decodeAc1015ScaleBody(
    composeBody(501, scaleTail, handleStream([[4, 0], [4, 0], [3, 0]])),
    501,
  );
  assert.deepEqual(scale.fields["name"], ASCII("1:1"));
  assert.equal(scale.fields["hasUnitScaleBit"], 1);

  const placeholder = decodeAc1015PlaceholderBody(
    composeBody(510, objectTail(0xf, 1), handleStream([[4, 0xe], [4, 0xe], [3, 0]])),
    510,
  );
  assert.deepEqual(placeholder.fields, {});
});

test("la familia despacha por tipo fijo y por NOMBRE de clase", () => {
  const classNames = new Map<number, readonly number[]>([
    [500, Object.freeze(ASCII("ACDBDICTIONARYWDFLT"))],
    [501, Object.freeze(ASCII("SCALE"))],
    [502, Object.freeze(ASCII("VISUALSTYLE"))],
    [511, Object.freeze(ASCII("LAYOUT"))],
  ]);

  const dictionary = decodeAc1015DictionaryFamilyObject(
    AC1015_TYPE_DICTIONARY,
    dictionaryBody(),
    classNames,
  );
  assert.equal(dictionary?.kind, "dictionary");
  assert.equal(dictionary?.handle, 0xc);

  const wdflt = decodeAc1015DictionaryFamilyObject(500, dictionaryBody(500, true), classNames);
  assert.equal(wdflt?.kind, "dictionary");

  const mlinestyle = decodeAc1015DictionaryFamilyObject(
    AC1015_TYPE_MLINESTYLE,
    mlineStyleBody(),
    classNames,
  );
  assert.equal(mlinestyle?.kind, "mlinestyle");

  const layout = decodeAc1015DictionaryFamilyObject(511, layoutBody(511), classNames);
  assert.equal(layout?.kind, "object");
  assert.equal(layout?.handle, 0x1e);

  // Una clase sin decodificador y un tipo desconocido: null, decide el llamador.
  assert.equal(decodeAc1015DictionaryFamilyObject(502, layoutBody(502), classNames), null);
  assert.equal(decodeAc1015DictionaryFamilyObject(0x64, dictionaryBody(), classNames), null);

  // La proyección: el diccionario y el MLINESTYLE llegan a la base neutral.
  assert.ok(dictionary && mlinestyle && dictionary.kind === "dictionary" && mlinestyle.kind === "mlinestyle");
  const { tables, dictionaries } = buildAc1015NeutralTables([], [dictionary, mlinestyle]);
  assert.equal(dictionaries.length, 1);
  assert.equal(dictionaries[0]!.handle, 0xc);
  assert.deepEqual(dictionaries[0]!.entries[0], {
    name: ASCII("ACAD_GROUP"),
    itemHandle: 0xd,
  });
  assert.deepEqual(dictionaries[0]!.entries[1], {
    name: ASCII("ACAD_LAYOUT"),
    itemHandle: undefined,
  });
  assert.equal(tables.mlinestyles.length, 1);
  assert.deepEqual(tables.mlinestyles[0]!.name, ASCII("VALLE-DOBLE"));
  assert.deepEqual(tables.mlinestyles[0]!.fields["segmentOffsets"], [0.5, -0.5]);
});

test("filtros cruzados: un tipo ajeno es capacidad ausente, no corrupción", () => {
  const xrecordTail = objectTail(0x65);
  xrecordTail.emitBL(0);
  xrecordTail.emitBS(1);
  const xrecordBody = composeBody(AC1015_TYPE_XRECORD, xrecordTail, handleStream([[4, 0], [3, 0]]));
  for (const decode of [
    () => decodeAc1015DictionaryBody(xrecordBody),
    () => decodeAc1015GroupBody(xrecordBody),
    () => decodeAc1015MlineStyleBody(xrecordBody),
    () => decodeAc1015LayoutBody(xrecordBody, 511),
    () => decodeAc1015XrecordBody(dictionaryBody()),
  ]) {
    const error = assertDwgError(decode, "DWG_VERSION_DECODER_UNSUPPORTED");
    assert.equal(error.detail.category, "unsupported");
  }
});

console.log(
  "objects-dictionary.spec: fase D5 verde — la sección de clases produce su mapa número→nombre, el diccionario resuelve entradas nombre→handle, XRECORD/GROUP/MLINESTYLE y los objetos de clase hacen round-trip y lo hostil cae tipado.",
);
