/**
 * El tipo de línea llega al PAPEL y al PDF — medido en los bytes, no en la
 * intención.
 *
 * Medido el 2026-09-02 antes de este cambio: `CadVectorStyle.dash` existía y
 * nadie lo asignaba; `styleFor` resolvía el nombre del tipo de línea y lo
 * tiraba; `plot-pdf.ts` no leía `dash`. Un eje en capa EJES=CENTER —la norma
 * mexicana lo trae así en un dibujo NUEVO, sin `styles.linetype`— salía
 * continuo en la lámina, en la vista previa y en el PDF de PLOT/PUBLISH.
 *
 * Método, calcado de `plot-hatch-pattern.spec.ts`: el mismo dibujo lleva una
 * línea en EJES=CENTER y otra en una capa continua; el plan de publicación
 * debe llevar `dash` sólo en la primera, y el PDF sin compresión debe llevar
 * el operador `[…] 0 d` con esos milímetros antes de su trazo. Cada mitad
 * tiene su rojo propio: revertir `paper-space-style.ts` deja el plan sin
 * `dash`; revertir sólo `plot-pdf.ts` deja el plan bien y el PDF sin `d`.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "./cad-document";
import { createCadLayout } from "./layout/layout-operations";
import { cadPageSetupFromLayout } from "./plot/page-setup";
import { buildCadPlotJob } from "./plot/plot-job";
import { renderCadPlotPdf } from "./plot/plot-pdf";
import { measureCadPdf } from "./plot/pdf-measure";

const METADATA = {
  project: "Nave",
  drawingNumber: "A-0002",
  title: "Ejes",
  sheetNumber: "S-002",
  revision: "P01",
  discipline: "Arquitectura",
};

/** Una línea en EJES=CENTER y otra en MUROS (continua), sin catálogo. */
function drawing(linetypeScale?: number): CadDocument {
  const layout = createCadLayout([], {
    id: "layout:ejes",
    name: "Ejes",
    templateId: "a1-landscape",
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    unit: "mm",
    metadata: METADATA,
    scale: 50,
  });
  return {
    meta: { version: 1, schema: 9, unit: "mm", ...(linetypeScale ? { linetypeScale } : {}) },
    layers: [
      { id: "EJES", name: "EJES", color: "#f97316", visible: true, locked: false, lineweight: 0.18, linetype: "CENTER" },
      { id: "MUROS", name: "MUROS", color: "#0000ff", visible: true, locked: false, lineweight: 0.35 },
    ],
    entities: [
      { id: "eje", type: "line", start: { x: 1_000, y: 3_000, z: 0 }, end: { x: 9_000, y: 3_000, z: 0 }, layer: "EJES" },
      { id: "muro", type: "line", start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 9_000, y: 1_000, z: 0 }, layer: "MUROS" },
    ],
    history: [],
    modelSpace: { entityIds: ["eje", "muro"] },
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

async function specs(): Promise<void> {
  const document = drawing();
  const job = buildCadPlotJob({ document, pageSetup: cadPageSetupFromLayout(document.paperSpaces[0]) });
  const commands = job.plan.sheets[0].viewports[0].commands;
  const eje = commands.find((command) => command.entityId === "eje" && command.kind === "path");
  const muro = commands.find((command) => command.entityId === "muro" && command.kind === "path");
  assert.ok(eje && eje.kind === "path", "el eje se traza");
  assert.ok(muro && muro.kind === "path", "el muro se traza");
  // CENTER de fábrica: 1,25 trazo, 0,25 hueco, 0,25 trazo, 0,25 hueco — en
  // milímetros de papel (PSLTSCALE=1, LTSCALE 1), y el punto no aparece.
  assert.deepEqual(eje.style.dash, [1.25, 0.25, 0.25, 0.25], "el eje lleva el patrón CENTER como alternancia trazo/hueco");
  assert.equal(muro.style.dash, undefined, "la línea continua no lleva `dash`: los PDF sin tipos de línea no cambian de bytes");

  // LTSCALE multiplica el patrón entero.
  const scaled = drawing(4);
  const scaledJob = buildCadPlotJob({ document: scaled, pageSetup: cadPageSetupFromLayout(scaled.paperSpaces[0]) });
  const scaledEje = scaledJob.plan.sheets[0].viewports[0].commands.find((command) => command.entityId === "eje" && command.kind === "path");
  assert.ok(scaledEje && scaledEje.kind === "path");
  assert.deepEqual(scaledEje.style.dash, [5, 1, 1, 1], "LTSCALE 4 cuadruplica cada tramo");

  // Y los BYTES del PDF: el operador `d` con esos milímetros precede al trazo
  // del eje; el muro se traza continuo (sin `d` vigente o `[] 0 d`).
  const pdf = await renderCadPlotPdf(job.sheets, { compress: false });
  const measured = measureCadPdf(pdf.bytes);
  const long = measured.segments.filter((segment) => segment.lengthMm > 100);
  assert.ok(long.length >= 2, `las dos líneas de 8 m a 1:50 miden 160 mm en papel (${long.length} segmentos largos)`);
  const dashed = long.filter((segment) => segment.dashMm && segment.dashMm.length > 0);
  const continuous = long.filter((segment) => !segment.dashMm || segment.dashMm.length === 0);
  assert.equal(dashed.length, 1, `exactamente un segmento largo lleva patrón \`d\` (${dashed.length})`);
  assert.equal(continuous.length, long.length - 1, "el resto se traza continuo");
  const patterned = dashed[0];
  assert.ok(patterned?.dashMm, "el segmento con patrón trae su `d`");
  assert.deepEqual(
    patterned.dashMm.map((value) => Number(value.toFixed(3))),
    [1.25, 0.25, 0.25, 0.25],
    "el `d` del PDF lleva exactamente los milímetros del patrón",
  );
  assert.ok(Math.abs(patterned.lineWidthMm - 0.18) < 0.02, `el grosor del eje sigue siendo el de su capa: ${patterned.lineWidthMm} mm`);

  console.log(
    `plot-linetype-pattern: el eje en EJES=CENTER llega al plan con dash [1.25,0.25,0.25,0.25] y al PDF con ` +
      `\`[${patterned.dashMm.join(" ")}] 0 d\` (${long.length} segmentos largos, 1 con patrón), la línea continua sin \`d\` y LTSCALE 4 → [5,1,1,1].`,
  );
}

specs().catch((error) => {
  console.error(error);
  process.exit(1);
});
