/**
 * La tabla de patrones de sombreado se DISTINGUE: ocho nombres, ocho
 * trazados. Medido antes de la tabla sobre este mismo contorno: ANSI31,
 * ANSI37, AR-CONC, AR-B816, EARTH, GRAVEL, STEEL y NET daban los mismos 46
 * paths (sha1 a98fe93df35c). Y el ANSI31 de hoy sale IDÉNTICO al de ayer:
 * es el patrón de todos los documentos existentes.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hatchPolygon } from "./hatch";
import {
  CAD_HATCH_PATTERNS,
  cadHatchFamilies,
  cadHatchPatternBaseAngle,
  cadHatchPatternDefinition,
} from "./hatch-pattern-table";
import {
  cadHatchDashChord,
  cadHatchPatternDxfLines,
  cadHatchPatternLineEstimate,
  cadHatchPatternStrokes,
} from "./hatch-pattern-strokes";
import { hatchAdapter } from "./hatch-entity-adapter";
import { buildCadHatchPublishStrokes } from "./hatch-publish-strokes";
import type { CadNativeEntity } from "./entity-runtime";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
const sha = (value: unknown) => createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 12);

const box = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 600 },
  { x: 0, y: 600 },
];
type Hatch = Extract<CadNativeEntity, { type: "hatch" }>;
const hatch = (pattern: string, angle?: number): Hatch => ({
  id: `h-${pattern}`,
  type: "hatch",
  pattern,
  solid: false,
  scale: 25,
  ...(angle === undefined ? {} : { angle }),
  boundaries: [box.map((point) => ({ ...point, z: 0 }))],
  layer: "0",
});

// ---------------------------------------------------------------------------
// 1. La tabla: nombres únicos, separaciones positivas, base = primera familia.
// ---------------------------------------------------------------------------
const names = CAD_HATCH_PATTERNS.map((pattern) => pattern.name);
assert.equal(new Set(names).size, names.length, "ningún nombre repetido");
ok(names.length >= 20, `la tabla trae ${names.length} patrones (≥ 20)`);
for (const pattern of CAD_HATCH_PATTERNS)
  for (const family of pattern.families) {
    assert.ok(family.offset > 0, `${pattern.name}: separación positiva`);
    if (family.dash) assert.ok(family.dash.some((value) => value > 0 || value === 0), `${pattern.name}: la secuencia pinta algo`);
  }
assert.equal(cadHatchPatternBaseAngle("ANSI31"), 45);
assert.equal(cadHatchPatternBaseAngle("ansi31"), 45, "sin distinguir mayúsculas");
assert.equal(cadHatchPatternBaseAngle("BRICK"), 0);
assert.equal(cadHatchPatternBaseAngle("NOEXISTE"), 45, "un nombre desconocido cae al respaldo ANSI31");
assert.equal(cadHatchPatternDefinition("NOEXISTE"), undefined);
ok(true, "la tabla es coherente y la base es el ángulo de la primera familia");

// ---------------------------------------------------------------------------
// 2. ANSI31 de hoy == ANSI31 de ayer, byte a byte: una familia continua a 45°
//    con la separación `scale`, alineada a la rejilla global de hatchPolygon.
// ---------------------------------------------------------------------------
const legacy = hatchPolygon(box, { angle: 45, spacing: 25, origin: undefined });
const today = cadHatchPatternStrokes([box], { pattern: "ANSI31" }, 25).strokes;
assert.deepEqual(today, legacy, "ANSI31 sin ángulo explícito: los mismos trazos que hatchPolygon a 45°");
const explicit = cadHatchPatternStrokes([box], { pattern: "ANSI31", angle: 45 }, 25).strokes;
assert.deepEqual(explicit, legacy, "y con el 45 explícito que persiste el comando HATCH, también");
const rotated = cadHatchPatternStrokes([box], { pattern: "ANSI31", angle: 30 }, 25).strokes;
assert.deepEqual(rotated, hatchPolygon(box, { angle: 30, spacing: 25 }), "`angle` sigue siendo el ángulo ABSOLUTO de las rayas");
ok(true, `ANSI31 conserva sus ${legacy.length} trazos exactos (sha ${sha(legacy)})`);

// ---------------------------------------------------------------------------
// 3. Ocho nombres, ocho trazados distintos (y ninguno vacío).
// ---------------------------------------------------------------------------
const eight = ["ANSI31", "ANSI37", "AR-CONC", "AR-B816", "EARTH", "GRAVEL", "STEEL", "NET"];
const signatures = new Map(eight.map((name) => [name, sha(cadHatchPatternStrokes([box], { pattern: name }, 25).strokes)]));
assert.equal(new Set(signatures.values()).size, eight.length, `los ocho difieren: ${[...signatures].map(([n, s]) => `${n}=${s}`).join(" ")}`);
for (const name of eight) assert.ok(cadHatchPatternStrokes([box], { pattern: name }, 25).strokes.length > 0, `${name} pinta algo`);
ok(true, "ocho patrones producen ocho trazados distintos sobre el mismo contorno");

// Y en la pantalla (adaptador) y el papel (plan de publicación) la misma tabla.
const screen = new Set(eight.map((name) => sha(hatchAdapter.renderer.paths(hatch(name), 96))));
const paper = new Set(eight.map((name) => sha(buildCadHatchPublishStrokes(hatch(name), 1 / 50).strokes)));
assert.equal(screen.size, eight.length, "el adaptador de pantalla distingue los ocho");
assert.equal(paper.size, eight.length, "el plan de publicación distingue los ocho");
ok(true, "pantalla y papel consumen la tabla: ocho firmas distintas en cada uno");

// ---------------------------------------------------------------------------
// 4. Trazos y puntos: la secuencia se respeta y la fase corre por fila.
// ---------------------------------------------------------------------------
const chord = cadHatchDashChord({ x: 0, y: 0 }, { x: 10, y: 0 }, [2, -2], 0, 0.1);
assert.deepEqual(
  chord.map((segment) => [segment.a.x, segment.b.x]),
  [[0, 2], [4, 6], [8, 10]],
  "trazo 2, hueco 2 sobre 10 unidades: tres trazos",
);
const phased = cadHatchDashChord({ x: 0, y: 0 }, { x: 10, y: 0 }, [2, -2], 1, 0.1);
assert.deepEqual(phased.map((segment) => [segment.a.x, segment.b.x]), [[0, 1], [3, 5], [7, 9]], "la fase 1 desplaza la secuencia");
const dotted = cadHatchDashChord({ x: 0, y: 0 }, { x: 4, y: 0 }, [0, -1], 0, 0.1);
assert.equal(dotted.length, 4, "un punto por periodo");
assert.ok(Math.abs(dotted[0].b.x - 0.1) < 1e-9, "el punto mide `dot`, nunca cero");
// BRICK: las juntas verticales de filas consecutivas están CORRIDAS (aparejo a
// soga): en la fila 0 hay junta en x=0; en la fila 1 la junta está a media
// pieza. Se mide en el propio trazado: los trazos verticales de dos filas
// vecinas no comparten x.
const brick = cadHatchPatternStrokes([box], { pattern: "BRICK" }, 100).strokes;
const vertical = brick.filter((segment) => Math.abs(segment.a.x - segment.b.x) < 1e-6);
const rowOf = (segment: { a: { y: number } }) => Math.round(Math.min(segment.a.y, segment.a.y) / 100);
const xsRow = (row: number) => new Set(vertical.filter((segment) => rowOf(segment) === row).map((segment) => Math.round(segment.a.x)));
const row0 = xsRow(0);
const row1 = xsRow(1);
assert.ok(row0.size > 0 && row1.size > 0, "hay juntas verticales en las dos primeras filas");
assert.ok([...row0].every((x) => !row1.has(x)), `las juntas de la fila 1 no caen sobre las de la fila 0 (${[...row0].join(",")} vs ${[...row1].join(",")})`);
ok(true, "BRICK sale a soga: las juntas verticales de filas vecinas no coinciden");

// ---------------------------------------------------------------------------
// 5. Resolución: giro, separación y respaldo declarado.
// ---------------------------------------------------------------------------
const resolved = cadHatchFamilies("ANSI37", 45, 10);
assert.equal(resolved.known, true);
assert.equal(resolved.rotation, 0);
assert.deepEqual(resolved.families.map((family) => [family.angle, family.spacing]), [[45, 10], [135, 10]]);
const turned = cadHatchFamilies("NET", 30, 10);
assert.equal(turned.rotation, 30, "NET (base 0) a 30 es un giro de 30");
assert.deepEqual(turned.families.map((family) => family.angle), [30, 120]);
const unknown = cadHatchFamilies("ZZZ", undefined, 10);
assert.equal(unknown.known, false, "un nombre desconocido se declara");
assert.deepEqual(unknown.families.map((family) => [family.angle, family.spacing]), [[45, 10]], "y dibuja el rayado de respaldo");
const published = buildCadHatchPublishStrokes(hatch("ZZZ"), 1 / 50);
assert.equal(published.warning?.code, "hatch_pattern_unknown", "el plan de publicación avisa del respaldo");
assert.ok(published.strokes.length > 0, "sin dejar el contorno vacío");
assert.equal(cadHatchPatternLineEstimate("NET", undefined, 25, 1000), 80, "la estimación suma las familias: 2 × ceil(1000/25)");
ok(true, "la resolución declara giro, separación y respaldo");

// ---------------------------------------------------------------------------
// 6. DXF: una definición por familia con el vector entre líneas ya girado.
// ---------------------------------------------------------------------------
const dxf = cadHatchPatternDxfLines("ANSI31", 45, 25, { x: 0, y: 0 });
assert.equal(dxf.length, 1);
assert.equal(dxf[0].angle, 45);
assert.ok(Math.abs(dxf[0].offset.x + 25 * Math.SQRT1_2) < 1e-9 && Math.abs(dxf[0].offset.y - 25 * Math.SQRT1_2) < 1e-9, "el vector entre rayas a 45° es (−s/√2, s/√2)");
assert.deepEqual(dxf[0].dashes, []);
const brickDxf = cadHatchPatternDxfLines("BRICK", 0, 100, { x: 5, y: 7 });
assert.equal(brickDxf.length, 2);
assert.deepEqual(brickDxf[1].dashes, [100, -100], "los trazos van en unidades de dibujo");
assert.ok(Math.abs(brickDxf[1].offset.x + 150) < 1e-9 && Math.abs(brickDxf[1].offset.y - 100) < 1e-9, "la familia vertical corre 100 por fila y se separa 150");
ok(true, "las definiciones DXF salen de la misma tabla, una por familia");

console.log(
  `hatch-pattern-table: ${checks} comprobaciones verdes — ${names.length} patrones, ANSI31 idéntico (${legacy.length} trazos), ocho nombres → ocho trazados en pantalla y papel, BRICK a soga y definiciones DXF por familia.`,
);
