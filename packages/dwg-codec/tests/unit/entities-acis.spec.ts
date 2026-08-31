/**
 * Spec de la preservación opaca ACIS (3DSOLID/REGION/BODY) — sesión DWG-B
 * (3D), 2026-08-31.
 *
 * Los cuerpos de prueba se componen con el MISMO writer real que ya prueba
 * round-trips de LINE/POINT/CIRCLE/ARC/LWPOLYLINE/TEXT/INSERT
 * (`emitAc1015EntityCommonTail` + `composeAc1015ObjectBody`,
 * `writer/ac1015-entity-writer.ts`): la cabecera común es byte a byte la
 * misma que ya usa el laboratorio para veinte tipos de entidad, y encima de
 * ella se emiten bytes de prueba RECONOCIBLES como "datos ACIS" — no son
 * SAT/SAB real (este módulo no interpreta ACIS, así que no necesita
 * fixtures ACIS reales para probarse), son un payload arbitrario que sirve
 * para verificar que la captura es EXACTA.
 *
 * El tipo BS de prueba (999) es un PLACEHOLDER de laboratorio: 3DSOLID/
 * REGION/BODY son tipos de CLASE sin código fijo (ver el docblock de
 * `entities-acis.ts`), así que ningún número "real" existe que usar aquí —
 * lo único que le importa a `decodeAcisOpaqueEntityBody` es la cabecera
 * común y el límite `bitSize`, ninguno de los dos depende del tipo.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DWG_ACIS_CLASS_NAMES,
  decodeAcisOpaqueEntityBody,
  dwgAcisClassNameOf,
} from "../../src/objects/entities-acis.js";
import {
  DwgBitEmitter,
  composeAc1015ObjectBody,
  emitAc1015EntityCommonTail,
} from "../../src/writer/ac1015-entity-writer.js";

const ACIS_TEST_TYPE = 999;

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/**
 * Reconstruye los bytes exactos de un tramo capturado a partir de
 * `rawBytes`/`leadingBitOffset`/`dataBitLength` — el mismo trabajo que haría
 * quien consuma la preservación más adelante. MSB-first (hecho ya
 * registrado y documentado en `dwg-bit-emitter.ts`: "Emisor de bits
 * MSB-first"), sólo en este archivo de prueba: la decisión de diseño es que
 * `decodeAcisOpaqueEntityBody` NO hace este trabajo — expone la metadata
 * para que el consumidor lo haga sin que el laboratorio tenga que adivinar
 * si hace falta.
 */
function bitsToBytes(
  rawBytes: readonly number[],
  leadingBitOffset: number,
  bitLength: number,
): number[] {
  const bits: number[] = [];
  for (let i = 0; i < bitLength; i += 1) {
    const bitIndex = leadingBitOffset + i;
    const byte = rawBytes[Math.floor(bitIndex / 8)] ?? 0;
    bits.push((byte >> (7 - (bitIndex % 8))) & 1);
  }
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | (bits[i + j] ?? 0);
    bytes.push(value);
  }
  return bytes;
}

/** Cuerpo sintético: cabecera común real + `payloadBytes` como "datos ACIS". */
function acisBody(ownHandle: number, payloadBytes: readonly number[]): Uint8Array {
  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, ownHandle, false);
  for (const byte of payloadBytes) tail.emitRC(byte);
  return composeAc1015ObjectBody(ACIS_TEST_TYPE, tail, (stream) => {
    stream.emitH(0, 0); // xdictionary nulo
    stream.emitH(0, 0); // capa nula
  });
}

test("dwgAcisClassNameOf reconoce los tres nombres de clase ACIS y ningún otro", () => {
  assert.equal(dwgAcisClassNameOf(ascii("3DSOLID")), "3DSOLID");
  assert.equal(dwgAcisClassNameOf(ascii("REGION")), "REGION");
  assert.equal(dwgAcisClassNameOf(ascii("BODY")), "BODY");
  assert.equal(dwgAcisClassNameOf(ascii("SURFACE")), null, "SURFACE es otra ola, no ACIS");
  assert.equal(dwgAcisClassNameOf(ascii("body")), null, "mayúsculas exactas, sin normalizar");
  assert.equal(dwgAcisClassNameOf(ascii("BOD")), null, "un prefijo no cuenta como el nombre completo");
  assert.equal(dwgAcisClassNameOf([]), null, "bytes vacíos no son ningún nombre de clase");
});

for (const className of DWG_ACIS_CLASS_NAMES) {
  test(`decodeAcisOpaqueEntityBody captura ${className} byte a byte, sin interpretar nada`, () => {
    const payload = [0xde, 0xad, 0xbe, 0xef, 0x00, 0x53, 0x41, 0x54]; // reconocible, no ACIS real
    const body = acisBody(0x42, payload);
    const decoded = decodeAcisOpaqueEntityBody(body, ascii(className));
    assert.equal(decoded.kind, "acisOpaque");
    assert.deepEqual(decoded.classNameBytes, ascii(className));
    assert.ok(
      decoded.leadingBitOffset >= 0 && decoded.leadingBitOffset < 8,
      "el desplazamiento inicial siempre cae dentro de un byte",
    );
    assert.equal(decoded.dataBitLength, payload.length * 8);
    assert.deepEqual(
      bitsToBytes(decoded.rawBytes, decoded.leadingBitOffset, decoded.dataBitLength),
      payload,
      "reconstruidos desde rawBytes+leadingBitOffset+dataBitLength, los bytes son EXACTAMENTE " +
        "los emitidos — la captura no pierde ni desplaza un solo bit, aunque la cabecera común " +
        "no termine alineada a byte (el writer real no la alinea)",
    );
  });
}

test("un payload vacío (objeto sin datos propios) reconstruye a cero bytes", () => {
  const body = acisBody(0x10, []);
  const decoded = decodeAcisOpaqueEntityBody(body, ascii("REGION"));
  assert.equal(decoded.dataBitLength, 0);
  assert.deepEqual(bitsToBytes(decoded.rawBytes, decoded.leadingBitOffset, 0), []);
  // `rawBytes` puede seguir trayendo el byte parcial que contiene el borde
  // (bits de la cabecera común antes de `leadingBitOffset`, o del flujo de
  // handles después de `dataBitLength`) — nunca más de ese único byte
  // cuando no hay datos propios.
  assert.ok(decoded.rawBytes.length <= 1);
});

test("un bitSize que corta a mitad de byte captura el byte completo con el offset correcto", () => {
  // Cabecera común + 3 bits sueltos (menos de un byte) como "payload": el
  // límite bitSize no cae en un borde de byte, y la captura sigue siendo
  // EXACTA — el byte parcial completo viaja en `rawBytes`, con
  // `dataBitLength` diciendo cuántos de sus bits son del objeto.
  const tail = new DwgBitEmitter();
  emitAc1015EntityCommonTail(tail, 0x20, false);
  tail.pushBits(0b101, 3);
  const body = composeAc1015ObjectBody(ACIS_TEST_TYPE, tail, (stream) => {
    stream.emitH(0, 0);
    stream.emitH(0, 0);
  });
  const decoded = decodeAcisOpaqueEntityBody(body, ascii("BODY"));
  assert.equal(decoded.dataBitLength, 3);
  assert.equal(decoded.rawBytes.length, 1, "el byte parcial se captura completo, alineado");
});

test("classNameBytes viaja tal cual lo pasó el llamador, congelado", () => {
  const body = acisBody(0x30, [0x01]);
  const decoded = decodeAcisOpaqueEntityBody(body, ascii("3DSOLID"));
  assert.ok(Object.isFrozen(decoded));
  assert.ok(Object.isFrozen(decoded.classNameBytes));
  assert.ok(Object.isFrozen(decoded.rawBytes));
});
