import { strict as assert } from "node:assert";
import { measureCadPdf } from "@/lib/cad/plot/pdf-measure";
import type { CadPublishPlan, CadPublishSheet } from "@/lib/cad/paper-space";
import { renderCadSheetSetPdf } from "./sheet-set-pdf";

/*
 * EL PDF DEL BOTÓN LEE EL MISMO PLAN QUE PLOT.
 *
 * F4 metió en `buildCadPublishPlan` el contorno real de una ventana poligonal
 * (T-19·4) y lo dibujado directamente sobre el papel (T-30), y `plot-pdf.ts`
 * los honra. El emisor del botón «Publicar PDF» —éste— seguía recortando al
 * rectángulo envolvente y tirando `paperCommands`: el arreglo llegaba a PLOT y
 * no al botón que el arquitecto pulsa. Este spec fija que los dos emisores
 * leen las mismas dos cosas del plan.
 */

const base: CadPublishSheet = {
  id: "sheet:1",
  name: "Planta",
  width: 210,
  height: 297,
  orientation: "portrait",
  colorMode: "monochrome",
  lineweightScale: 1,
  titleBlock: {},
  viewports: [
    {
      id: "vp:1",
      name: "Model",
      clip: { x: 10, y: 10, width: 190, height: 240 },
      scale: 50,
      locked: true,
      commands: [],
    },
  ],
};

function plan(sheet: CadPublishSheet): CadPublishPlan {
  return {
    sheets: [sheet],
    warnings: [],
    manifest: { generatedAt: "1970-01-01T00:00:00.000Z", rows: [] },
    vectorCommandCount: 0,
    rasterCommandCount: 0,
  } as unknown as CadPublishPlan;
}

const meta = { model: "casa", revision: "A", productLabel: "Valle Design" };

async function bytesOf(sheet: CadPublishSheet): Promise<Uint8Array> {
  return new Uint8Array(await renderCadSheetSetPdf(plan(sheet), meta, undefined, { compress: false }));
}

/** El flujo de contenido tal cual, para mirar los OPERADORES que `measureCadPdf` no lee (`W`, `S`). */
const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("latin1");

async function main(): Promise<void> {
  let checks = 0;

  // T-19·4: cinco vértices ⇒ el recorte traza cuatro `lineTo` que el rectángulo
  // envolvente nunca produce (la ventana no lleva comandos, así que todo trazo
  // del contenido, fuera del marco y el cajetín, viene del contorno).
  {
    const rectBytes = await bytesOf(base);
    const polyBytes = await bytesOf({
      ...base,
      viewports: [
        {
          ...base.viewports[0],
          clipPolygon: [
            { x: 20, y: 20 },
            { x: 180, y: 20 },
            { x: 180, y: 100 },
            { x: 100, y: 240 },
            { x: 20, y: 100 },
          ],
        },
      ],
    });
    const rect = measureCadPdf(rectBytes);
    const poly = measureCadPdf(polyBytes);
    const diagonal = (m: typeof poly) =>
      m.segments.filter((s) => Math.abs(s.x1 - s.x2) > 1e-6 && Math.abs(s.y1 - s.y2) > 1e-6);
    assert.equal(diagonal(rect).length, 0, "el rectángulo no tiene aristas oblicuas");
    assert.ok(
      diagonal(poly).length >= 2,
      `el contorno poligonal debía trazar sus dos aristas oblicuas; hubo ${diagonal(poly).length}`,
    );
    checks += 2;

    // T-19·5: el recorte se aplica sobre un camino AÚN sin pintar. Con el
    // estilo por defecto jsPDF emitía `re S W n` / `h S W n`: `S` consume el
    // camino, `W` recibe uno vacío (no recorta) y el marco de la ventana sale
    // trazado con la pluma que quedara puesta. Mismo defecto y misma prueba
    // que en `plot-output.spec.ts`.
    const rectText = latin1(rectBytes);
    const polyText = latin1(polyBytes);
    assert.ok(/\bre\s+W\s+n\b/.test(rectText), "la ventana rectangular recorta (re W n) en el PDF del botón");
    assert.ok(/\bh\s+W\s+n\b/.test(polyText), "la ventana poligonal recorta (h W n) en el PDF del botón");
    assert.ok(!/\bS\s+W\b/.test(rectText) && !/\bS\s+W\b/.test(polyText), "el recorte no se pinta antes de aplicarse");
    checks += 3;
  }

  // T-30: una línea y un texto de PAPEL llegan al PDF sin pasar por la ventana.
  {
    const measured = measureCadPdf(
      await bytesOf({
        ...base,
        paperCommands: [
          {
            kind: "path",
            entityId: "e-linea-papel",
            viewportId: "sheet:1:paper",
            points: [
              { x: 20, y: 255 },
              { x: 190, y: 255 },
            ],
            closed: false,
            style: { stroke: "#000000", lineWidth: 0.25 },
          },
          {
            kind: "text",
            entityId: "e-texto-papel",
            viewportId: "sheet:1:paper",
            point: { x: 20, y: 252 },
            text: "NOTAS GENERALES",
            size: 4,
            rotation: 0,
            color: "#000000",
          },
        ],
      }),
    );
    assert.ok(
      measured.labels.some((label) => label.text.includes("NOTAS GENERALES")),
      "T-30: el texto de papel llega al PDF del botón",
    );
    assert.ok(
      measured.segments.some(
        (s) => Math.abs(s.y1 - s.y2) < 1e-6 && Math.abs(Math.abs(s.x2 - s.x1) - 170) < 1,
      ),
      "T-30: la línea de papel llega al PDF del botón",
    );
    checks += 2;
  }
  console.log(`sheet-set-pdf.spec: OK — ${checks} comprobaciones`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
