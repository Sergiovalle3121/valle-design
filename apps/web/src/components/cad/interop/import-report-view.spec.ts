/**
 * El panel de importación: qué se enseña, en qué orden y qué NO se esconde.
 *
 * El componente se renderiza de verdad —`renderToStaticMarkup`— porque las dos
 * reglas que importan son propiedades del HTML resultante y no del modelo:
 *
 *   1. Las secciones de pérdida salen ABIERTAS. Un `<details>` cerrado sobre
 *      «no entró en el dibujo» cumple el requisito sobre el papel y lo
 *      incumple en la pantalla, que es donde se juega.
 *   2. En el HTML no aparece ni un código interno. El panel anterior volcaba
 *      `unsupported_entity` tal cual, y por eso este spec busca la jerga en el
 *      marcado y no en el modelo: es lo que el usuario lee.
 *
 * El spec es `.ts` y no `.tsx` a propósito: el runner sólo recoge `*.spec.ts`,
 * así que un spec en `.tsx` sería un test muerto que se pudre en silencio —
 * exactamente el problema que ese runner existe para impedir.
 *
 * Correr:  npx tsx src/components/cad/interop/import-report-view.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { exportCadDxf } from "@/lib/cad/dxf-export";
import { importDxfPrimitives } from "@/lib/cad/dxf-import";
import {
  buildCadDxfImportReport,
  type CadDxfImportReport,
} from "@/lib/cad/dxf-import-report";
import { CadDxfImportReportPanel } from "./CadDxfImportReport";
import { cadDxfImportTone, groupCadDxfImportReport } from "./import-report-view";

function reportFor(text: string): CadDxfImportReport {
  const result = importDxfPrimitives(text);
  return buildCadDxfImportReport(result, {
    entityCount: result.primitives.length,
    blockCount: result.blocks.length,
  });
}

const cleanDxf = exportCadDxf({
  primitives: [
    { kind: "line", layer: "MUROS", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    { kind: "circle", layer: "COLUMNAS", points: [{ x: 5, y: 5 }], radius: 2 },
  ],
}).content;

// Un plano ajeno con dos entidades que el lector no representa y una que sí.
const lossyDxf = [
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "MUROS", "10", "0", "20", "0", "11", "100", "21", "0",
  "0", "3DFACE", "8", "TECHOS",
  "0", "MESH", "8", "TERRENO",
  "0", "ENDSEC", "0", "EOF",
].join("\n");

// --- el orden es el mensaje --------------------------------------------------
{
  const sections = groupCadDxfImportReport(reportFor(lossyDxf));
  assert.deepEqual(
    sections.map((section) => section.fidelity),
    ["lost", "kept"],
    "sin degradaciones sólo hay dos secciones, y lo perdido va primero",
  );
  assert.equal(sections[0].title, "No entró en el dibujo");
  assert.equal(sections[0].open, true, "lo que falta no se esconde tras un clic");
  assert.equal(sections[1].open, false, "lo que salió bien puede ir plegado");
  // Las DOS entidades que no entran se cuentan. El 3DFACE lo declara el
  // mapeador; el MESH lo descarta `dxf-parser` antes de llegar a él y hasta
  // esta ola desaparecía sin aviso — el panel confesaba una de dos pérdidas.
  // Lo destapó la matriz del corpus externo y lo cerró el recuento de la
  // sección ENTITIES sobre los pares crudos.
  assert.equal(sections[0].count, 2, "se declaran las dos entidades que no entraron");
  const detalles = sections[0].rows.map((row) => row.detail).join(" ");
  assert.ok(detalles.includes("3DFACE") && detalles.includes("MESH"), detalles);

  // Una sección vacía no se pinta: un encabezado «no entró en el dibujo · 0»
  // asusta sin motivo y enseña a ignorar el panel.
  const clean = groupCadDxfImportReport(reportFor(cleanDxf));
  assert.deepEqual(clean.map((section) => section.fidelity), ["kept"]);
}

// --- el tono no puede tirar hacia el verde -----------------------------------
{
  assert.equal(cadDxfImportTone(reportFor(cleanDxf)), "ok");
  assert.equal(cadDxfImportTone(reportFor(lossyDxf)), "alert");
  assert.equal(
    cadDxfImportTone({
      entityCount: 1, blockCount: 0, layerCount: 1, headline: "x", hasLosses: true,
      rows: [{ fidelity: "degraded", code: "d", count: 1, detail: "algo" }],
    }),
    "warn",
    "una degradación no es una pérdida, pero tampoco es verde",
  );
}

// --- el HTML que de verdad se ve --------------------------------------------
{
  const report = reportFor(lossyDxf);
  const html = renderToStaticMarkup(
    createElement(CadDxfImportReportPanel, { report, fileName: "estructura.dxf" }),
  );
  assert.ok(html.includes("estructura.dxf"), "el informe se ancla al archivo que llegó");
  assert.ok(html.includes('data-tone="alert"'), "el tono viaja al marcado");
  assert.ok(html.includes("No entró en el dibujo"), "el encabezado de pérdidas está");
  // El atributo `open` se serializa donde React decida dentro de la etiqueta,
  // así que se busca la etiqueta entera y se comprueba que lo lleva.
  const lostTag = html.match(/<details[^>]*data-testid="cad-dxf-import-lost"[^>]*>/)?.[0] ?? "";
  assert.ok(lostTag, "la sección de pérdidas se renderiza");
  assert.ok(/\bopen\b/.test(lostTag), `debía salir desplegada: ${lostTag}`);
  const keptTag = html.match(/<details[^>]*data-testid="cad-dxf-import-kept"[^>]*>/)?.[0] ?? "";
  assert.ok(!/\bopen\b/.test(keptTag), `lo conservado puede ir plegado: ${keptTag}`);
  assert.ok(html.includes("3DFACE"), "se nombra el tipo real que no entró");
  assert.ok(
    html.includes("Conserva el archivo original"),
    "cuando falta algo, se dice qué hacer: no sustituir el original",
  );
  // Ni un código interno en lo que el usuario lee.
  const visible = html.replace(/<[^>]*>/g, " ");
  for (const jargon of ["unsupported_entity", "invalid_", "hatch_edge", "kept_", "degraded"])
    assert.ok(!visible.includes(jargon), `jerga visible en el panel: ${jargon}`);

  // Un informe limpio no enseña la coletilla de «conserva el original»: sería
  // sembrar una duda que el propio informe acaba de descartar.
  const cleanHtml = renderToStaticMarkup(
    createElement(CadDxfImportReportPanel, { report: reportFor(cleanDxf) }),
  );
  assert.ok(cleanHtml.includes('data-tone="ok"'));
  assert.ok(!cleanHtml.includes("Conserva el archivo original"));
}

console.log(
  "CadDxfImportReport: lo perdido sale primero y desplegado, el tono nunca tira hacia el verde y " +
    "el marcado no contiene un solo código interno",
);
