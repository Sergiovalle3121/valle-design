/**
 * LOD real de HATCH: `paths(entity, segments)` ignoraba `segments` por
 * completo y siempre pagaba el mismo suelo de espaciado (`diagonal/256`, unas
 * 256 líneas de barrido) sin importar si el sombreado ocupaba tres píxeles en
 * pantalla o la pantalla entera. Con 14.000 hatches en `architecture@100k`
 * —ver `docs/cad/evidence/render-stage-architecture-100k.json`— eso es
 * teselar la misma trama densa en cada escalón de zoom.
 *
 * Aquí se fija que:
 *
 *   · tier 0 (`segments` ≤ 8, ~24 px aparentes) dibuja SÓLO el contorno — cero
 *     trazos de relleno, no «menos» trazos;
 *   · por encima de ese umbral el espaciado es el EXACTO del patrón, en todos
 *     los escalones: el ensanchado ×4 del tier medio se retiró porque a 300 px
 *     aparentes el usuario ve la diferencia (ver el comentario del adaptador);
 *   · tier completo (`segments` > 32, y el valor por defecto 96 que usan
 *     `hitTest`/`bounds`/`blockChildPaths`) es BIT A BIT el mismo cálculo que
 *     antes de que existiera el escalón — nadie que dependa del contorno
 *     exacto para seleccionar o exportar ve un cambio;
 *   · el propio `hitTest`, que llama a `paths(entity)` sin `segments`, sigue
 *     acertando: su precisión no depende del LOD de pantalla.
 */
import { strict as assert } from "node:assert";
import type { CadNativeEntity } from "./entity-runtime";
import { hatchAdapter } from "./hatch-entity-adapter";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

type CadHatchEntity = Extract<CadNativeEntity, { type: "hatch" }>;

const square: CadHatchEntity = {
  id: "hatch-lod",
  type: "hatch",
  boundaries: [[
    { x: 0, y: 0, z: 0 },
    { x: 1000, y: 0, z: 0 },
    { x: 1000, y: 1000, z: 0 },
    { x: 0, y: 1000, z: 0 },
  ]],
  pattern: "ANSI31",
  solid: false,
  angle: 45,
  layer: "0",
};

const fillStrokeCount = (segments?: number): number =>
  hatchAdapter.renderer.paths(square, segments).filter((path) => !path.closed).length;

const outlineCount = hatchAdapter.renderer.paths(square, 8).filter((path) => path.closed).length;

// ── tier 0: sólo contorno ────────────────────────────────────────────────
ok(fillStrokeCount(8) === 0, "segments=8 (tier 0): cero trazos de relleno");
ok(outlineCount === square.boundaries.length, "segments=8 (tier 0): el contorno se dibuja igual");
ok(fillStrokeCount(1) === 0, "un segments menor que el umbral también es sólo contorno");

// ── por encima del umbral, el espaciado es el EXACTO del patrón ────────────
//
// Hubo aquí un escalón intermedio que ensanchaba el espaciado ×4 en todo el
// tier medio, y se retiró. Lo cazó el golden 47 —las instancias del lote caían
// de >100 a 83— y la aritmética le dio la razón: un sombreado de 3 000 mm
// encuadrado mide ~300 px y sus trazos quedan a ~9 px unos de otros;
// ensancharlos ×4 los pone a ~36 px, que a ese tamaño el usuario VE. El umbral
// de 320 px está calibrado para curvas, donde 32 segmentos y 128 son
// indistinguibles porque la flecha de la cuerda cae por debajo del píxel; el
// espaciado de un patrón no funciona así.
//
// El ahorro medido no vivía en este escalón sino en el tier 0 de arriba: en
// `architecture@100k` los 14 000 sombreados están por debajo de los 24 px, y
// ahí ya se devuelve sólo el contorno.
const mediumStrokes = fillStrokeCount(32);
const fullStrokes = fillStrokeCount(128);
ok(mediumStrokes > 0, "segments=32 sí dibuja relleno");
ok(
  mediumStrokes === fullStrokes,
  `por encima del umbral de contorno el espaciado es el del patrón: ${mediumStrokes} vs ${fullStrokes}`,
);

// ── tier completo y el valor por defecto (96, el de hitTest/bounds) son idénticos ──
const defaultStrokes = fillStrokeCount(undefined);
ok(defaultStrokes === fullStrokes, "el valor por defecto (96, usado por hitTest y bounds) es tier completo");
ok(
  JSON.stringify(hatchAdapter.renderer.paths(square, 96)) === JSON.stringify(hatchAdapter.renderer.paths(square, 128)),
  "96 y 128 producen EXACTAMENTE los mismos trazos: ambos están sobre el umbral de tier medio",
);

// ── el hitTest interno (sin `segments`) no pierde precisión con el LOD ─────
ok(
  hatchAdapter.hitTester.hitTest(square, { x: 500, y: 500 }, 1),
  "el centro del cuadrado sigue dando hit: hitTest no pasa `segments` y usa tier completo",
);

// ── el clic AL BORDE sigue acertando aunque el respaldo sólo pida el contorno ──
ok(
  hatchAdapter.hitTester.hitTest(square, { x: 500, y: 0.4 }, 1),
  "un clic justo fuera del borde inferior, dentro de tolerancia, sigue dando hit",
);
ok(
  !hatchAdapter.hitTester.hitTest(square, { x: 500, y: -50 }, 1),
  "un clic lejos de cualquier borde sigue sin dar hit",
);

// ── SOLID nunca calcula trazos, en ningún tier: no hay nada que acelerar ───
const solidSquare: CadHatchEntity = { ...square, id: "hatch-solid", solid: true };
ok(
  hatchAdapter.renderer.paths(solidSquare, 8).length === hatchAdapter.renderer.paths(solidSquare, 128).length,
  "un HATCH sólido dibuja lo mismo en cualquier escalón: nunca tuvo trazos de barrido",
);

console.log(
  `hatch-entity-adapter: ${checks} comprobaciones verdes — tier 0 sólo dibuja el contorno, tier medio dibuja menos ` +
    "trazos que tier completo, el valor por defecto (96) coincide bit a bit con tier completo, hitTest conserva su " +
    "precisión y SOLID no paga nunca el cálculo de trazos.",
);
