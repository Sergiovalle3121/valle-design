/**
 * El sombreado llega al PDF con su PATRÓN, no sólo el contorno — medido sobre
 * los bytes del archivo, no sobre la intención del emisor.
 *
 * Método: el mismo dibujo se traza dos veces con `renderCadPlotPdf` sin
 * compresión y se leen los segmentos del flujo con `measureCadPdf`. La primera
 * pasada lleva un ANSI31 razonable: el PDF debe contener EXACTAMENTE los
 * trazos del patrón además de lo que ya contenía. La segunda lleva el mismo
 * sombreado con un espaciado que proyecta por debajo del mínimo en papel: la
 * GUARDA DE DENSIDAD degrada a contorno con el aviso
 * `hatch_pattern_too_dense`, y el archivo lo demuestra quedándose sin esos
 * trazos — nunca un PDF de cien mil paths.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "./cad-document";
import {
  CAD_HATCH_MAX_PUBLISH_STROKES,
  buildCadHatchPublishStrokes,
} from "./hatch-publish-strokes";
import { createCadLayout } from "./layout/layout-operations";
import { cadPageSetupFromLayout } from "./plot/page-setup";
import { buildCadPlotJob } from "./plot/plot-job";
import { renderCadPlotPdf } from "./plot/plot-pdf";
import { measureCadPdf } from "./plot/pdf-measure";

const METADATA = {
  project: "Nave",
  drawingNumber: "A-0001",
  title: "Planta",
  sheetNumber: "S-001",
  revision: "P01",
  discipline: "Arquitectura",
};

/**
 * Un dibujo con UN sombreado ANSI31. `hatchScale` es el espaciado en unidades
 * de dibujo y `size` el lado del contorno: juntos deciden la densidad EN PAPEL
 * (el generador impone un suelo de diagonal/256, así que la forma de bajar de
 * los 0,3 mm es un contorno pequeño con espaciado pequeño).
 */
function drawing(hatchScale: number, size = 4_000): CadDocument {
  const layout = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a1-landscape",
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    unit: "mm",
    metadata: METADATA,
    scale: 50,
  });
  return {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [
      { id: "MUROS", name: "MUROS", color: "#0000ff", visible: true, locked: false, lineweight: 0.18 },
    ],
    entities: [
      {
        id: "sombra",
        type: "hatch",
        pattern: "ANSI31",
        solid: false,
        scale: hatchScale,
        boundaries: [
          [
            { x: 1_000, y: 1_000, z: 0 },
            { x: 1_000 + size, y: 1_000, z: 0 },
            { x: 1_000 + size, y: 1_000 + size, z: 0 },
            { x: 1_000, y: 1_000 + size, z: 0 },
          ],
        ],
        layer: "MUROS",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["sombra"] },
    paperSpaces: [layout],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

async function pdfSegments(document: CadDocument) {
  const job = buildCadPlotJob({
    document,
    pageSetup: cadPageSetupFromLayout(document.paperSpaces[0]),
  });
  const pdf = await renderCadPlotPdf(job.sheets, { compress: false });
  return { job, measured: measureCadPdf(pdf.bytes) };
}

async function specs(): Promise<void> {
  // A escala 1:50, 200 unidades de espaciado son 4 mm de papel: patrón legible.
  const patterned = drawing(200);
  // El generador puro dice cuántos trazos son; el PDF tiene que llevarlos TODOS.
  const viewport = patterned.paperSpaces[0].viewports![0];
  const paperScale = 1 / viewport.scale;
  const plan = buildCadHatchPublishStrokes(
    patterned.entities[0] as never,
    paperScale,
  );
  assert.ok(plan.strokes.length > 10, `el patrón produce trazos de verdad (${plan.strokes.length})`);
  assert.equal(plan.warning, undefined, "y a esta densidad no hay degradación");

  const withPattern = await pdfSegments(patterned);
  // La guarda del método: la misma lámina con un sombreado que proyecta a
  // ~0,01 mm de espaciado en papel. Los dos PDF sólo difieren en los trazos
  // del patrón: el contorno son los mismos cuatro lados en ambos.
  const dense = await pdfSegments(drawing(0.6, 100));

  assert.ok(
    withPattern.job.plan.warnings.every((warning) => warning.code !== "hatch_pattern_too_dense"),
    "el patrón razonable no dispara la guarda",
  );
  assert.ok(
    dense.job.plan.warnings.some((warning) => warning.code === "hatch_pattern_too_dense"),
    "el patrón ilegible dispara hatch_pattern_too_dense",
  );
  assert.ok(
    dense.job.plan.warnings.every((warning) => warning.code !== "hatch_pattern_outline_only"),
    "la vieja degradación por defecto ya no existe",
  );

  const patternSegments = withPattern.measured.segments.length;
  const outlineSegments = dense.measured.segments.length;
  assert.equal(
    patternSegments - outlineSegments,
    plan.strokes.length,
    `los bytes del PDF llevan los ${plan.strokes.length} trazos del patrón ` +
      `(${patternSegments} segmentos frente a ${outlineSegments} del contorno solo)`,
  );
  // Los trazos miden lo que el patrón dice: a 45° dentro del cuadrado, ninguno
  // puede superar su diagonal — un trazo que se sale del contorno se vería.
  const diagonal = Math.hypot(4_000, 4_000);
  for (const stroke of plan.strokes)
    assert.ok(
      Math.hypot(stroke.b.x - stroke.a.x, stroke.b.y - stroke.a.y) <= diagonal + 1e-6,
      "ningún trazo del patrón excede la diagonal del contorno",
    );

  // Y el tope absoluto: ni el PDF con patrón se acerca al límite de trazos.
  assert.ok(
    patternSegments < CAD_HATCH_MAX_PUBLISH_STROKES,
    "el archivo queda muy por debajo del tope de trazos por sombreado",
  );

  console.log(
    `plot-hatch-pattern: el PDF lleva los ${plan.strokes.length} trazos del ANSI31 medidos en sus bytes ` +
      `(${patternSegments} segmentos con patrón, ${outlineSegments} sin él) y la guarda de densidad ` +
      "degrada a contorno con hatch_pattern_too_dense",
  );
}

specs().catch((error) => {
  console.error(error);
  process.exit(1);
});
