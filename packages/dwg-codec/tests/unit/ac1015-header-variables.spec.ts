import assert from "node:assert/strict";
import test from "node:test";
import { decodeAc1015HeaderVariables } from "../../src/container/ac1015-header-variables.js";
import {
  createAc1015HeaderVariables,
  encodeAc1015HeaderVariables,
} from "../../src/writer/ac1015-header-writer.js";
import { assertDwgError } from "../support/assert.js";

/** Compara dos juegos de variables sin las medidas del lector. */
function stripped(
  vars: ReturnType<typeof decodeAc1015HeaderVariables>,
): Record<string, unknown> {
  const { decodedBitLength, payloadBitLength, ...rest } = vars;
  void decodedBitLength;
  void payloadBitLength;
  return rest;
}

test("las variables de cabecera hacen round-trip exacto con los defaults medidos", () => {
  const vars = createAc1015HeaderVariables();
  const payload = encodeAc1015HeaderVariables(vars);
  const decoded = decodeAc1015HeaderVariables(payload);
  assert.deepEqual(stripped(decoded), stripped(vars as never));
  // El relleno final queda declarado: lo decodificado nunca excede el payload.
  assert.ok(decoded.decodedBitLength <= decoded.payloadBitLength);
  assert.ok(decoded.payloadBitLength - decoded.decodedBitLength < 8);
});

test("un override de primer nivel viaja al payload y regresa exacto", () => {
  const vars = createAc1015HeaderVariables({
    ltscale: 2.5,
    insunits: 4,
    trailingUnknownShorts: [1, 2, 3, 4],
  });
  const decoded = decodeAc1015HeaderVariables(encodeAc1015HeaderVariables(vars));
  assert.equal(decoded.ltscale, 2.5);
  assert.equal(decoded.insunits, 4);
  assert.deepEqual(decoded.trailingUnknownShorts, [1, 2, 3, 4]);
});

test("el CPSNID viaja SOLO cuando CEPSNTYPE vale 3 (hecho registrado)", () => {
  const withPlotStyle = createAc1015HeaderVariables({
    cepsntype: 3,
    handles: {
      ...createAc1015HeaderVariables().handles,
      currentPlotStyleName: { code: 5, value: 0x2f, byteLength: 1 } as never,
    },
  });
  const decoded = decodeAc1015HeaderVariables(
    encodeAc1015HeaderVariables(withPlotStyle),
  );
  assert.equal(decoded.cepsntype, 3);
  assert.equal(decoded.handles.currentPlotStyleName?.value, 0x2f);
});

test("gemelo triste: un payload truncado falla cerrado y tipado", () => {
  const payload = encodeAc1015HeaderVariables(createAc1015HeaderVariables());
  for (const cut of [0, 8, 64, 130, payload.length - 40]) {
    assertDwgError(
      () => decodeAc1015HeaderVariables(payload.slice(0, cut)),
      "DWG_STRUCTURE_CORRUPT",
    );
  }
});

test("el decodificado es determinista estructura a estructura", () => {
  const payload = encodeAc1015HeaderVariables(createAc1015HeaderVariables());
  assert.deepEqual(
    decodeAc1015HeaderVariables(payload),
    decodeAc1015HeaderVariables(payload),
  );
});
