/**
 * El manifiesto de pérdidas del PDF no puede volverse mudo.
 *
 * Lo que este spec defiende:
 *
 *  1. **Todo código de aviso tiene frase publicada.** El día que alguien añada
 *     un aviso nuevo y se olvide de escribir qué significa, el informe diría
 *     «incidencia sin describir» — que es exactamente el registro de depuración
 *     que este módulo existe para no enseñar. Aquí falla antes.
 *  2. **La fila estructural va SIEMPRE.** Incluso en la importación más limpia:
 *     es la que evita que alguien cuente con unas cotas que el PDF nunca trajo.
 *  3. **Las pérdidas se leen ANTES que los aciertos.** El orden es el mensaje, y
 *     lo garantiza el mismo agrupador que ya usa el informe del DXF — que es la
 *     prueba de que se reutiliza y no se duplica.
 *  4. **Un escaneo produce un informe que dice qué hacer**, no un error suelto.
 *
 * Correr:  npx tsx src/lib/cad/pdf/pdf-import-report.spec.ts
 */
import { strict as assert } from "node:assert";
import {
  cadDxfImportTone,
  groupCadDxfImportReport,
} from "../../../components/cad/interop/import-report-view";
import { cadPdfCorpus } from "./pdf-corpus";
import { CadPdfImportError, importCadPdf } from "./pdf-import";
import {
  CAD_PDF_IMPORT_REPORT_CODES,
  buildCadPdfFailureReport,
  buildCadPdfImportReport,
} from "./pdf-import-report";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const corpus = new Map(cadPdfCorpus().map((entry) => [entry.id, entry]));
const bytesOf = (id: string) => {
  const entry = corpus.get(id);
  assert.ok(entry, `falta ${id} en el corpus`);
  return entry.bytes;
};

// --- 1. ningún aviso del importador se queda sin frase ----------------------
{
  const emitted = new Set<string>();
  for (const entry of cadPdfCorpus()) {
    for (let page = 1; page <= entry.pages; page += 1) {
      try {
        const result = importCadPdf(entry.bytes, { page });
        for (const warning of result.warnings) emitted.add(warning.code);
        const withHidden = importCadPdf(entry.bytes, { page, includeHiddenLayers: true });
        for (const warning of withHidden.warnings) emitted.add(warning.code);
      } catch (error) {
        assert.ok(error instanceof CadPdfImportError, `${entry.id}: error inesperado`);
        checks += 1;
      }
    }
  }
  ok(emitted.size > 0, "el corpus tiene que provocar avisos de verdad");
  const published = new Set(CAD_PDF_IMPORT_REPORT_CODES);
  for (const code of emitted)
    ok(published.has(code), `el aviso «${code}» no tiene frase publicada en el informe`);
}

// --- 2. la fila estructural va siempre, incluso sin una sola pérdida --------
{
  const clean = importCadPdf(bytesOf("cad-vector-uncompressed"), { curveMode: "spline" });
  const report = buildCadPdfImportReport(clean);
  ok(
    report.rows.some((row) => row.code === "pdf_has_no_cad_semantics"),
    "la fila «un PDF no es un CAD» tiene que salir aunque no haya avisos",
  );
  const structural = report.rows.find((row) => row.code === "pdf_has_no_cad_semantics");
  ok(
    !!structural && structural.detail.includes("cotas") && structural.detail.includes("bloques"),
    "esa fila tiene que nombrar lo que el PDF no trae: cotas y bloques",
  );
  ok(
    report.rows.every((row) => row.fidelity !== "lost"),
    "una importación limpia no puede declarar pérdidas",
  );
  ok(
    report.headline.includes("sin pérdidas") && report.headline.includes("PDF nunca trae"),
    `el titular limpio tiene que seguir advirtiendo del límite: «${report.headline}»`,
  );
  // En modo spline las curvas se declaran EXACTAS, no aproximadas.
  ok(
    report.rows.some((row) => row.code === "curves_exact" && row.fidelity === "kept"),
    "una Bézier convertida a spline entra íntegra y así se declara",
  );
}

// --- 3. el error de las curvas aparece con su número en la frase ------------
{
  const flattened = importCadPdf(bytesOf("cad-vector-uncompressed"), {
    curveMode: "polyline",
    curveTolerance: 0.05,
  });
  const report = buildCadPdfImportReport(flattened);
  const row = report.rows.find((entry) => entry.code === "curves_flattened");
  ok(!!row, "aplanar curvas tiene que producir su fila");
  ok(row?.fidelity === "degraded", "una curva aplanada está degradada, no conservada");
  const measured = flattened.curveFidelity.maxErrorUnits.toFixed(4);
  ok(
    !!row && row.detail.includes(measured),
    `la frase tiene que llevar el error MEDIDO (${measured}): «${row?.detail}»`,
  );
}

// --- 4. las pérdidas se leen antes que los aciertos -------------------------
{
  const result = importCadPdf(bytesOf("text-glyph-indices"));
  const report = buildCadPdfImportReport(result);
  const sections = groupCadDxfImportReport(report);
  assert.deepEqual(
    sections.map((section) => section.fidelity),
    ["lost", "degraded", "kept"],
    "el orden de las secciones es el mensaje y no puede cambiar",
  );
  checks += 1;
  ok(sections[0].open, "lo que NO entró va desplegado");
  ok(cadDxfImportTone(report) === "alert", "un informe con pérdidas tiene tono de alerta");

  const glyphs = report.rows.find((row) => row.code === "text_glyph_indices");
  ok(!!glyphs && glyphs.fidelity === "lost", "el texto irrecuperable es una PÉRDIDA");
  ok(
    !!glyphs && !/glifo.*$/.test(glyphs.detail.split(":")[0]),
    "la frase empieza por lo que le pasa al usuario, no por la jerga",
  );
  ok(
    !!glyphs && glyphs.detail.includes("DWG") === false && glyphs.detail.includes("DXF"),
    "y remite al DXF, que es lo que el remitente sí puede mandar",
  );
}

// --- 5. un escaneo produce un informe que dice QUÉ HACER --------------------
{
  let report = null as ReturnType<typeof buildCadPdfFailureReport> | null;
  try {
    importCadPdf(bytesOf("scanned-image-only"));
  } catch (error) {
    assert.ok(error instanceof CadPdfImportError);
    report = buildCadPdfFailureReport(error, error.code);
  }
  ok(!!report, "un escaneo tiene que producir informe de fallo");
  ok(report!.entityCount === 0, "y declarar que no entró nada");
  ok(report!.headline.includes("No entró nada"), "con un titular que no deje dudas");
  const row = report!.rows[0];
  ok(
    row.detail.includes("PDFATTACH") && row.detail.includes("calca"),
    `el consejo tiene que ser accionable: «${row.detail}»`,
  );
  ok(cadDxfImportTone(report!) === "alert", "un fallo es alerta");
}

// --- 6. las capas apagadas se cuentan y se explican -------------------------
{
  const result = importCadPdf(bytesOf("optional-content-groups"));
  const report = buildCadPdfImportReport(result);
  const hidden = report.rows.find((row) => row.code === "hidden_layer_skipped");
  ok(!!hidden, "una capa apagada tiene que aparecer en el informe");
  ok(hidden?.fidelity === "lost", "lo que no entró es una pérdida");
  ok(
    !!hidden && hidden.detail.includes("Cotas"),
    `la frase tiene que NOMBRAR la capa: «${hidden?.detail}»`,
  );
  ok(
    !!hidden && hidden.detail.includes("capas ocultas"),
    "y decir cómo traerla si se quiere",
  );
  // Las capas que sí entraron se declaran conservadas y con su procedencia.
  const kept = report.rows.find((row) => row.code === "kept_layers");
  ok(!!kept && kept.detail.includes("opcionales"), "las capas del PDF entran como capas");
}

// --- 7. una imagen dentro de un PDF vectorial no se traga en silencio -------
{
  const result = importCadPdf(bytesOf("shading-and-fills"));
  const report = buildCadPdfImportReport(result);
  for (const code of ["shading_dropped", "fill_as_outline", "clip_not_applied"])
    ok(
      report.rows.some((row) => row.code === code),
      `el informe tiene que declarar «${code}»`,
    );
  ok(report.hasLosses, "un archivo con degradados no puede declararse limpio");
}

// --- 8. ninguna frase deja al usuario con un código en la mano --------------
{
  for (const entry of cadPdfCorpus()) {
    let report;
    try {
      report = buildCadPdfImportReport(importCadPdf(entry.bytes));
    } catch {
      continue;
    }
    for (const row of report.rows) {
      ok(row.detail.length > 30, `${entry.id}/${row.code}: la frase es demasiado corta para informar`);
      ok(
        !/^[a-z_]+$/.test(row.detail.trim()),
        `${entry.id}/${row.code}: la frase es un código, no una explicación`,
      );
      ok(row.count >= 1, `${entry.id}/${row.code}: toda fila cubre al menos un caso`);
    }
  }
}

console.log(`pdf-import-report.spec.ts ✅ ${checks} comprobaciones`);
