/**
 * Spec de la ola de escritura V1→V3 (2026-08-31): ELLIPSE y MTEXT.
 *
 * Mismo patrón que `entities-core.spec.ts`: la fuente única del binario
 * válido es el writer real (`writeAc1015EntityBody`); el pipeline lector
 * (`decodeAc1015EntityBody`, el mismo despachador que ya usa el resto del
 * laboratorio) debe devolver la geometría EXACTA, double a double. Esto es
 * consistencia interna writer→lector, NO evidencia de compatibilidad con
 * ningún software ajeno (CORPUS_POLICY.md, AGENTS.md del laboratorio): el
 * oráculo externo (ODA File Converter) sólo corre en la máquina del
 * titular y queda fuera de este entorno.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DwgEllipseEntity,
  DwgGeometryEntity,
  DwgMTextEntity,
} from "../../src/model/entity-geometry.js";
import { decodeAc1015EntityBody } from "../../src/objects/entities-core.js";
import { writeAc1015EntityBody } from "../../src/writer/ac1015-entity-writer.js";
import { assertDwgError } from "../support/assert.js";

/** Round-trip de un cuerpo suelto: writer → decodificador, geometría exacta. */
function roundTrip(entity: DwgGeometryEntity, handle = 7): void {
  const body = writeAc1015EntityBody(entity, handle);
  const decoded = decodeAc1015EntityBody(body);
  assert.deepEqual(decoded.entity, entity);
  assert.equal(decoded.common.ownHandle.code, 0);
  assert.equal(decoded.common.ownHandle.value, handle);
}

const ellipse: DwgEllipseEntity = Object.freeze({
  kind: "ellipse",
  center: Object.freeze({ x: 10, y: -5, z: 0.5 }),
  majorAxisEndpoint: Object.freeze({ x: 4, y: 0, z: 0 }),
  extrusion: Object.freeze({ x: 0, y: 0, z: 1 }),
  axisRatio: 0.6,
  startAngle: 0,
  endAngle: Math.PI * 2,
});

const mtext: DwgMTextEntity = Object.freeze({
  kind: "mtext",
  insertion: Object.freeze({ x: 1, y: 2, z: 0 }),
  extrusion: Object.freeze({ x: 0, y: 0, z: 1 }),
  xAxisDirection: Object.freeze({ x: 1, y: 0, z: 0 }),
  rectWidth: 25,
  height: 2.5,
  attachment: 1,
  drawingDirection: 1,
  extentsHeight: 5,
  extentsWidth: 25,
  valueBytes: Object.freeze([...Buffer.from("hola mundo", "ascii")]),
  lineSpacingStyle: 1,
  lineSpacingFactor: 1,
  trailingBit: 0,
});

test("ellipse: round-trip exacto writer -> lector", () => {
  roundTrip(ellipse);
  roundTrip({ ...ellipse, axisRatio: 1, startAngle: -Math.PI, endAngle: Math.PI });
  roundTrip({ ...ellipse, center: { x: 0, y: 0, z: 0 } });
});

test("ellipse: determinista (mismo handle -> mismos bytes)", () => {
  const a = writeAc1015EntityBody(ellipse, 42);
  const b = writeAc1015EntityBody(ellipse, 42);
  assert.deepEqual(a, b);
});

test("ellipse: razón de ejes negativa falla cerrado", () => {
  assertDwgError(
    () => writeAc1015EntityBody({ ...ellipse, axisRatio: -0.1 }, 1),
    "DWG_INPUT_INVALID",
  );
});

test("ellipse: geometría no finita falla cerrado", () => {
  assertDwgError(
    () =>
      writeAc1015EntityBody(
        { ...ellipse, center: { x: Number.NaN, y: 0, z: 0 } },
        1,
      ),
    "DWG_INPUT_INVALID",
  );
});

test("mtext: round-trip exacto writer -> lector", () => {
  roundTrip(mtext);
  roundTrip({ ...mtext, valueBytes: [], trailingBit: 1 });
  roundTrip({ ...mtext, rectWidth: 0, lineSpacingFactor: 0.75 });
});

test("mtext: determinista (mismo handle -> mismos bytes)", () => {
  const a = writeAc1015EntityBody(mtext, 99);
  const b = writeAc1015EntityBody(mtext, 99);
  assert.deepEqual(a, b);
});

test("mtext: trailingBit fuera de {0,1} falla cerrado", () => {
  assertDwgError(
    () => writeAc1015EntityBody({ ...mtext, trailingBit: 2 }, 1),
    "DWG_INPUT_INVALID",
  );
});

test("mtext: código de attachment fuera de rango BS falla cerrado", () => {
  assertDwgError(
    () => writeAc1015EntityBody({ ...mtext, attachment: -1 }, 1),
    "DWG_INPUT_INVALID",
  );
});

test("mtext: dentro de un bloque (modo 0, propietario en el flujo)", () => {
  const body = writeAc1015EntityBody(mtext, 5, { ownerBlockHandle: 3 });
  const decoded = decodeAc1015EntityBody(body);
  assert.deepEqual(decoded.entity, mtext);
});
