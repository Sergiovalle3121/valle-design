/**
 * HATCH honesto en el kernel DXF (CAD-NEXT-067).
 *
 * Export e import ASCII conservan relleno, patrón y contornos poligonales sin
 * depender de que dxf-parser soporte HATCH.
 */
import { strict as assert } from "node:assert";
import { exportCadDxf } from "./dxf-export";
import { exportCadLayoutDxf } from "./layout-export-adapter";
import { importDxfPrimitives } from "./dxf-import";
import { cadHatchPatternBaseAngle } from "./hatch-pattern-table";

// --- export kernel: HATCH SOLID con contorno cerrado -------------------------
const exported = exportCadDxf({
  hatches: [
    { layer: "Zonas", points: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }] },
  ],
});
assert.equal(exported.entityCount, 1, "un HATCH cuenta como una entidad");
assert.ok(exported.content.includes("0\nHATCH"), "escribe HATCH nativo");
assert.ok(exported.content.includes("2\nSOLID"), "patrón SOLID");
assert.ok(exported.content.includes("70\n1"), "flag de relleno sólido");
assert.ok(exported.content.includes("93\n4"), "4 vértices de contorno");
assert.ok(exported.content.includes("73\n1"), "contorno cerrado");
assert.ok(exported.layers.includes("Zonas"), "la capa del hatch existe en la tabla");

const patterned = exportCadDxf({
  hatches: [{
    layer: "Sections",
    pattern: "ANSI31",
    solid: false,
    angle: 30,
    scale: 25,
    boundaries: [
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }],
    ],
  }],
});
assert.ok(patterned.content.includes("2\nANSI31"), "conserva el nombre de patrón");
assert.ok(patterned.content.includes("91\n2"), "emite contorno exterior y hueco");
// `angle: 30` son rayas de ANSI31 a 30° absolutos; el 52 del DXF es el giro
// respecto al patrón (45°): −15. Antes se escribía 30 y AutoCAD lo abría a 75°.
assert.ok(patterned.content.includes("52\n-15"), "emite el GIRO del patrón (ángulo − base)");
assert.ok(patterned.content.includes("53\n30"), "y la familia lleva su ángulo absoluto");
assert.ok(patterned.content.includes("41\n25"), "emite la escala del patrón");
const patternedImport = importDxfPrimitives(patterned.content);
assert.equal(patternedImport.hatches.length, 1);
assert.equal(patternedImport.hatches[0].boundaries.length, 2);
assert.equal(patternedImport.hatches[0].solid, false);
// El lector crudo devuelve el 52 tal cual (el giro); el puente al documento
// (`dxf-cad-document.ts`) le suma la base del patrón y recupera los 30°.
assert.equal(patternedImport.hatches[0].angle, -15);
assert.equal(cadHatchPatternBaseAngle("ANSI31") + patternedImport.hatches[0].angle, 30);
assert.equal(patternedImport.hatches[0].scale, 25);

// Un contorno degenerado (< 3 puntos) no emite nada.
const degenerate = exportCadDxf({ hatches: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] });
assert.equal(degenerate.entityCount, 0, "sin área no hay relleno");
assert.ok(!degenerate.content.includes("HATCH"), "sin HATCH fantasma");

// --- adaptador: una caja con hatch emite contorno + relleno ------------------
const layout = exportCadLayoutDxf({
  boxes: [
    { id: "z1", label: "Zona ESD", x: 1000, y: 1000, width: 4000, height: 3000, hatch: true, layer: "Safety" },
    { id: "b1", label: "Mesa", x: 8000, y: 1000, width: 1500, height: 800 },
  ],
});
assert.ok(layout.content.includes("0\nHATCH"), "la zona sale como área rellena");
assert.ok(layout.content.includes("0\nPOLYLINE"), "y conserva su contorno");
const hatchCountInExport = (layout.content.match(/0\nHATCH/g) ?? []).length;
assert.equal(hatchCountInExport, 1, "sólo la caja marcada emite relleno");

// El círculo no intenta contorno rectangular de hatch.
const circleLayout = exportCadLayoutDxf({
  boxes: [{ id: "c1", label: "Tanque", x: 0, y: 0, width: 2000, height: 2000, shape: "circle", hatch: true }],
});
assert.ok(!circleLayout.content.includes("HATCH"), "círculo con hatch no emite contorno falso");

// --- import: contornos incompatibles avisan sin perder la geometría restante -
const fixture = [
  "0", "SECTION", "2", "ENTITIES",
  "0", "HATCH", "8", "Areas", "2", "SOLID", "70", "1",
  "0", "HATCH", "8", "Areas", "2", "ANSI31", "70", "0",
  "0", "LINE", "8", "0", "10", "0", "20", "0", "30", "0", "11", "500", "21", "500", "31", "0",
  "0", "ENDSEC",
  "0", "EOF",
].join("\n") + "\n";
const imported = importDxfPrimitives(fixture);
const hatchWarnings = imported.warnings.filter((w) => w.code === "hatch_unsupported_boundary");
assert.equal(hatchWarnings.length, 2, "cada HATCH sin contorno compatible avisa");
assert.equal(imported.hatches.length, 0, "no inventa límites para hatches inválidos");
assert.equal(imported.primitives.length, 1, "la línea sobrevive el import");
assert.equal(imported.primitives[0].kind, "line");

// Nuestro propio export con hatch reimporta como HATCH nativo.
const own = importDxfPrimitives(layout.content);
assert.equal(own.hatches.length, 1, "round-trip conserva el relleno");
assert.equal(own.hatches[0].solid, true);
assert.equal(own.warnings.some((w) => w.code.startsWith("hatch_")), false);
assert.ok(
  own.primitives.some((p) => p.kind === "rect" || p.kind === "polyline"),
  "el contorno de la zona sí reimporta",
);

// Un archivo sin hatches no inventa avisos.
const clean = importDxfPrimitives(
  ["0", "SECTION", "2", "ENTITIES", "0", "LINE", "8", "0", "10", "0", "20", "0", "30", "0", "11", "1", "21", "1", "31", "0", "0", "ENDSEC", "0", "EOF"].join("\n") + "\n",
);
assert.equal(clean.hatches.length, 0, "sin HATCH no inventa rellenos");

console.log("cad dxf hatch specs passed");
