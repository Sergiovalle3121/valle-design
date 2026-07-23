/** Formato de unidades UNITS/DIMSTYLE (AXOS-CAD-DEPTH-B5). */
import { strict as assert } from "node:assert";
import {
  formatCentimeters,
  formatLength,
  formatMeters,
} from "./unit-format";

// --- decimal ---------------------------------------------------------------
assert.equal(formatLength(123.456, { system: "decimal" }), "123.46", "decimal 2 dec por defecto");
assert.equal(formatLength(123.456, { system: "decimal", precision: 1 }), "123.5", "decimal 1 dec");
assert.equal(formatLength(123.4, { system: "decimal", precision: 2, suffix: " mm" }), "123.40 mm", "decimal con sufijo");

// --- científico ------------------------------------------------------------
assert.equal(formatLength(12300, { system: "scientific", precision: 2 }), "1.23E+4", "científico");

// --- fraccionario ----------------------------------------------------------
assert.equal(formatLength(6.5, { system: "fractional" }), "6 1/2", "6 1/2");
assert.equal(formatLength(6.25, { system: "fractional" }), "6 1/4", "6 1/4");
assert.equal(formatLength(6, { system: "fractional" }), "6", "entero sin fracción");
assert.equal(formatLength(0.5, { system: "fractional" }), "1/2", "sólo fracción");
assert.equal(formatLength(-6.5, { system: "fractional" }), "-6 1/2", "negativo");

// --- arquitectónico (pulgadas) ---------------------------------------------
assert.equal(formatLength(18, { system: "architectural" }), "1'-6\"", "18\" = 1'-6\"");
assert.equal(formatLength(18.5, { system: "architectural" }), "1'-6 1/2\"", "18.5\" = 1'-6 1/2\"");
assert.equal(formatLength(12, { system: "architectural" }), "1'-0\"", "12\" = 1'-0\"");
assert.equal(formatLength(6.5, { system: "architectural" }), "0'-6 1/2\"", "6.5\" = 0'-6 1/2\"");
// Acarreo por redondeo de la fracción hacia el pie siguiente.
assert.equal(formatLength(11.99, { system: "architectural" }), "1'-0\"", "11.99\" redondea a 1'-0\"");

// --- ingeniería ------------------------------------------------------------
assert.equal(formatLength(18.5, { system: "engineering", precision: 2 }), "1'-6.50\"", "ingeniería 1'-6.50\"");

// --- atajos métricos -------------------------------------------------------
assert.equal(formatMeters(2500), "2.50 m", "2500 mm → 2.50 m");
assert.equal(formatCentimeters(2500), "250.0 cm", "2500 mm → 250.0 cm");

console.log("cad unit-format specs passed");
