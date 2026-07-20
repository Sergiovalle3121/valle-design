/**
 * Plano a escala (AXOS-CAD-PLOT-001): elección de la mayor escala estándar
 * que cabe, colocación centrada, cajetín y barra de escala redonda.
 */
import { strict as assert } from "node:assert";
import {
  buildPlotSheet,
  niceScaleBarSegment,
  CAD_PAPER_SIZES,
} from "./plot-sheet";

// Planta de 20 m × 12 m en A3 horizontal: imprimible 400×247 → 1:50 es la
// mayor escala estándar que cabe (20000/50=400 ≤ 400; 12000/50=240 ≤ 247).
{
  const sheet = buildPlotSheet({
    drawingW: 20000,
    drawingH: 12000,
    paper: "A3",
    orientation: "landscape",
    project: "Planta Tijuana",
    client: "ACME",
    drawnBy: "sergio",
    date: "2026-07-20",
  });
  assert.equal(sheet.sheetW, 420, "A3 horizontal: 420 de ancho");
  assert.equal(sheet.sheetH, 297, "A3 horizontal: 297 de alto");
  assert.equal(sheet.printable.w, 400, "imprimible descuenta márgenes");
  assert.equal(sheet.printable.h, 247, "imprimible descuenta cajetín");
  assert.equal(sheet.scale, 50, "elige 1:50 (la mayor que cabe)");
  assert.equal(sheet.titleBlock.scale, "1:50", "cajetín trae la escala");
  assert.equal(sheet.titleBlock.project, "Planta Tijuana");
  assert.equal(sheet.titleBlock.units, "mm");
  // Colocación centrada: a 1:50 el ancho escalado llena los 400 → x = 10.
  assert.ok(
    Math.abs(sheet.placement.x - 10) < 0.01,
    "dibujo centrado horizontalmente",
  );
  assert.ok(sheet.scaleBar, "hay barra de escala");
  assert.equal(sheet.scaleBar?.segmentMm, 1000, "tramo redondo de 1 m");
  assert.equal(sheet.scaleBar?.label, "1 m", "etiqueta en metros");
  assert.equal(sheet.issues.length, 0, "sin issues cuando cabe");
}

// Un cuarto de 4 m × 3 m en carta vertical: cabe a 1:25.
{
  const sheet = buildPlotSheet({
    drawingW: 4000,
    drawingH: 3000,
    paper: "letter",
    orientation: "portrait",
  });
  assert.equal(sheet.paperLabel, "Carta");
  assert.equal(sheet.scale, 25, "cuarto de casa a 1:25 en carta");
  assert.equal(sheet.titleBlock.project, "Proyecto sin nombre");
}

// Algo absurdo de 2 km en A4: no cabe ni a 1:1000 → issue accionable.
{
  const sheet = buildPlotSheet({
    drawingW: 2000000,
    drawingH: 500000,
    paper: "A4",
  });
  assert.equal(sheet.scale, null, "no hay escala estándar que quepa");
  assert.ok(sheet.issues.length > 0, "issue pide papel más grande");
  assert.equal(sheet.scaleBar, null, "sin barra de escala");
}

// Tramos redondos 1/2/5×10^n: objetivo ~20 mm de hoja.
assert.equal(niceScaleBarSegment(100), 2000, "1:100 → tramo de 2 m");
assert.equal(niceScaleBarSegment(50), 1000, "1:50 → tramo de 1 m");
assert.equal(niceScaleBarSegment(25), 500, "1:25 → tramo de 50 cm");
assert.equal(niceScaleBarSegment(1), 20, "1:1 → tramo de 20 mm");

// Catálogo de papeles: ISO A + formatos carta.
assert.equal(CAD_PAPER_SIZES.A0.w, 841, "A0 presente");
assert.equal(CAD_PAPER_SIZES.tabloid.label, "Tabloide", "tabloide presente");

console.log("cad plot-sheet specs passed");
