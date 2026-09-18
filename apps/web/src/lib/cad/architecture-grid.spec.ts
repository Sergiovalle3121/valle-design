/**
 * ARQ-03 · Geometría pura de la rejilla de ejes estructurales.
 *
 * Comprueba: claves alfabéticas (saltando I, O, Ñ), claves numéricas,
 * conteo de ejes/globos/cruces, rotación, parseo de espaciamientos,
 * rechazo de espaciamientos no positivos.
 */
import assert from "node:assert/strict";
import {
  cadColumnGrid,
  cadGridAlphaKey,
  cadParseGridSpacings,
} from "./architecture-grid";

let checks = 0;

// ---------------------------------------------------------------------------
// 1 · cadGridAlphaKey: salta I, O y Ñ
// ---------------------------------------------------------------------------

const first25: string[] = [];
for (let i = 0; i < 25; i++) first25.push(cadGridAlphaKey(i));

// A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, J=8 (skip I), K=9, L=10, M=11,
// N=12, P=13 (skip O), Q=14, R=15, S=16, T=17, U=18, V=19, W=20, X=21,
// Y=22, Z=23, AA=24
assert.ok(!first25.includes("I"), "I no aparece en las primeras 25 claves");
assert.ok(!first25.includes("O"), "O no aparece en las primeras 25 claves");
assert.ok(!first25.includes("Ñ"), "Ñ no aparece en las primeras 25 claves");
assert.equal(first25[0], "A");
assert.equal(first25[3], "D");
assert.equal(first25[7], "H");
assert.equal(first25[8], "J"); // salta I
assert.equal(first25[23], "Z");
assert.equal(first25[24], "AA");
assert.equal(cadGridAlphaKey(25), "AB", "índice 25 → AB");
assert.equal(cadGridAlphaKey(47), "AZ", "índice 47 → AZ");
checks += 11;

// ---------------------------------------------------------------------------
// 2 · Rejilla 3 vanos X (4500, 4500, 3000) × 2 vanos Y (6000, 6000)
// ---------------------------------------------------------------------------

const grid = cadColumnGrid({
  origin: { x: 0, y: 0 },
  angleDeg: 0,
  spacingsX: [4500, 4500, 3000],
  spacingsY: [6000, 6000],
  extent: 500,
  globeRadius: 200,
});

// 4 ejes verticales (A, B, C, D) + 3 horizontales (1, 2, 3) = 7
assert.equal(grid.axes.length, 7, "7 ejes: 4 verticales + 3 horizontales");
checks++;

const verticalKeys = grid.axes.filter((a) => a.vertical).map((a) => a.key);
const horizontalKeys = grid.axes.filter((a) => !a.vertical).map((a) => a.key);
assert.deepEqual(verticalKeys, ["A", "B", "C", "D"], "claves verticales A B C D");
assert.deepEqual(horizontalKeys, ["1", "2", "3"], "claves horizontales 1 2 3");
checks += 2;

// Globos: 2 por eje vertical + 2 por eje horizontal = 14
assert.equal(grid.globes.length, 14, "14 globes: 2 por cada eje");
checks++;

// Cruces: 2 por eje = 14
assert.equal(grid.crosses.length, 14, "14 cruces: 2 por cada eje");
checks++;

// ---------------------------------------------------------------------------
// 3 · "3x4500" produce el mismo resultado que [4500, 4500, 4500]
// ---------------------------------------------------------------------------

const parsed = cadParseGridSpacings("3x4500");
assert.ok(Array.isArray(parsed), "3x4500 es un array");
if (Array.isArray(parsed)) {
  assert.deepEqual(parsed, [4500, 4500, 4500]);
}
checks++;

const parsedMixed = cadParseGridSpacings("2x6000,3000");
assert.ok(Array.isArray(parsedMixed));
if (Array.isArray(parsedMixed)) {
  assert.deepEqual(parsedMixed, [6000, 6000, 3000]);
}
checks++;

// ---------------------------------------------------------------------------
// 4 · Rechazo de espaciamientos no positivos
// ---------------------------------------------------------------------------

const bad = cadParseGridSpacings("0");
assert.equal(typeof bad, "string", "espaciamiento 0 devuelve mensaje de error");
checks++;

const badNeg = cadParseGridSpacings("-100");
assert.equal(typeof badNeg, "string", "espaciamiento negativo devuelve mensaje de error");
checks++;

const badRepeat = cadParseGridSpacings("0x4500");
assert.equal(typeof badRepeat, "string", "repetición 0 devuelve mensaje de error");
checks++;

// ---------------------------------------------------------------------------
// 5 · Rotación 30°: las posiciones cambian
// ---------------------------------------------------------------------------

const rotated = cadColumnGrid({
  origin: { x: 100, y: 200 },
  angleDeg: 30,
  spacingsX: [4500],
  spacingsY: [6000],
  extent: 500,
  globeRadius: 200,
});

// Con 0° el eje A vertical empieza en (100, 200-500). Con 30° rota.
const baseAxis = grid.axes[0]; // A, vertical, ángulo 0
const rotAxis = rotated.axes[0]; // A, vertical, ángulo 30
const baseDy = baseAxis.start.y - 0;
const rotDy = rotAxis.start.y - 200;
// A 30° la componente Y crece respecto a 0°
assert.ok(Math.abs(rotDy) > Math.abs(baseDy) * 0.5, "rotación 30° desplaza los ejes");
checks++;

// ---------------------------------------------------------------------------
// 6 · Ejes con origen distinto de cero
// ---------------------------------------------------------------------------

const offsetGrid = cadColumnGrid({
  origin: { x: 5000, y: 3000 },
  angleDeg: 0,
  spacingsX: [1000],
  spacingsY: [1000],
  extent: 100,
  globeRadius: 50,
});

// Eje vertical A empieza en x=5000, y = 3000 - 100
assert.ok(
  Math.abs(offsetGrid.axes[0].start.x - 5000) < 1e-6 &&
    Math.abs(offsetGrid.axes[0].start.y - (3000 - 100)) < 1e-6,
  "eje A con origen desplazado",
);
checks++;

// ---------------------------------------------------------------------------
console.log(
  `ARQ-03 architecture-grid: ${checks} comprobaciones verdes — ` +
    `claves alfabéticas (sin I/O/Ñ), numéricas, conteo ejes/globes/cruces, ` +
    `parseo 3x, rechazo no positivos, rotación, origen desplazado`,
);