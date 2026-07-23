/**
 * HATCH honesto en el kernel DXF (CAD-NEXT-067).
 *
 * Export: relleno SOLID nativo con contorno poligonal (verificación
 * estructural de los códigos de grupo — dxf-parser DESCARTA HATCH, así que no
 * hay round-trip posible con el parser). Import: ese descarte era una pérdida
 * SILENCIOSA; el pre-escaneo la convierte en advertencia honesta sin perder
 * el resto de la geometría.
 */
import { strict as assert } from "node:assert";
import { exportCadDxf } from "./dxf-export";
import { exportCadLayoutDxf } from "./layout-export-adapter";
import { importDxfPrimitives } from "./dxf-import";

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

// --- import: el descarte del parser deja de ser silencioso -------------------
// dxf-parser tira el HATCH sin avisar; nuestro pre-escaneo lo reporta y la
// geometría restante (la LINE) importa normal.
const fixture = [
  "0", "SECTION", "2", "ENTITIES",
  "0", "HATCH", "8", "Areas", "2", "SOLID", "70", "1",
  "0", "HATCH", "8", "Areas", "2", "ANSI31", "70", "0",
  "0", "LINE", "8", "0", "10", "0", "20", "0", "30", "0", "11", "500", "21", "500", "31", "0",
  "0", "ENDSEC",
  "0", "EOF",
].join("\n") + "\n";
const imported = importDxfPrimitives(fixture);
const hatchWarnings = imported.warnings.filter((w) => w.code === "hatch_dropped");
assert.equal(hatchWarnings.length, 1, "un solo aviso agregado de hatch");
assert.ok(hatchWarnings[0].message.includes("2"), "cuenta los dos achurados");
assert.equal(imported.primitives.length, 1, "la línea sobrevive el import");
assert.equal(imported.primitives[0].kind, "line");

// Nuestro propio export con hatch reimporta con el aviso (ciclo honesto).
const own = importDxfPrimitives(layout.content);
assert.ok(
  own.warnings.some((w) => w.code === "hatch_dropped"),
  "reimportar nuestro export avisa del relleno no importable",
);
assert.ok(
  own.primitives.some((p) => p.kind === "rect" || p.kind === "polyline"),
  "el contorno de la zona sí reimporta",
);

// Un archivo sin hatches no inventa avisos.
const clean = importDxfPrimitives(
  ["0", "SECTION", "2", "ENTITIES", "0", "LINE", "8", "0", "10", "0", "20", "0", "30", "0", "11", "1", "21", "1", "31", "0", "0", "ENDSEC", "0", "EOF"].join("\n") + "\n",
);
assert.equal(clean.warnings.filter((w) => w.code === "hatch_dropped").length, 0, "sin HATCH no hay aviso");

console.log("cad dxf hatch specs passed");
