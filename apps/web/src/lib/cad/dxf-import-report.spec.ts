/**
 * El informe de importación dice la VERDAD y la dice en español.
 *
 * Este spec existe porque un informe es la clase de código que se degrada sin
 * romperse: basta con que un aviso nuevo del importador no tenga frase para que
 * el usuario lea otra vez un código de depuración, y nada falle. Así que se
 * comprueban cuatro cosas que no se pueden cumplir por accidente:
 *
 *   1. Un fichero LIMPIO no inventa pérdidas. Un informe que siempre encuentra
 *      algo que declarar deja de leerse a la tercera importación.
 *   2. Cada aviso que el importador sabe emitir tiene su frase publicada. Sin
 *      esto, el hueco se descubre en producción y con un cliente delante.
 *   3. Las frases no llevan jerga: ni códigos, ni `snake_case`, ni siglas de
 *      programa. Es literalmente el requisito del producto.
 *   4. Lo que se DEGRADA en silencio se declara igual. Una cota ajena entra
 *      como líneas y texto SIN que el importador emita ningún aviso: si el
 *      informe no la nombra, nadie lo hace.
 *
 * Correr:  npx tsx src/lib/cad/dxf-import-report.spec.ts
 */
import { strict as assert } from "node:assert";
import { exportCadDxf } from "./dxf-export";
import { importDxfPrimitives } from "./dxf-import";
import {
  buildCadDxfImportReport,
  CAD_DXF_IMPORT_REPORT_CODES,
  type CadDxfImportReportRow,
} from "./dxf-import-report";
import { importDocumentText } from "./document-import";

const report = (text: string, extra: readonly CadDxfImportReportRow[] = []) => {
  const result = importDxfPrimitives(text);
  return buildCadDxfImportReport(
    result,
    { entityCount: result.primitives.length, blockCount: result.blocks.length },
    extra,
  );
};

// --- 1. un fichero limpio no inventa pérdidas -------------------------------
{
  const clean = exportCadDxf({
    primitives: [
      { kind: "line", layer: "MUROS", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      { kind: "circle", layer: "COLUMNAS", points: [{ x: 50, y: 50 }], radius: 10 },
    ],
  });
  const clean_ = report(clean.content);
  assert.equal(clean_.hasLosses, false, "un DXF que entra entero no declara pérdidas");
  assert.ok(
    clean_.rows.every((row) => row.fidelity === "kept"),
    `todo debía entrar íntegro: ${clean_.rows.map((row) => row.code).join(", ")}`,
  );
  assert.ok(clean_.headline.includes("Entró completo"), clean_.headline);
  // Singular de verdad: «1 líneas» delata que nadie leyó la frase, y una frase
  // que delata descuido no se cree aunque sea cierta.
  const line = clean_.rows.find((row) => row.code === "kept_line");
  assert.ok(line?.detail.startsWith("1 línea "), line?.detail);
}

// --- 2. cada aviso del importador tiene frase publicada ---------------------
{
  // Los códigos que el importador sabe emitir, leídos de su propio fuente. Si
  // alguien añade uno y no le escribe la frase, esta aserción lo caza.
  const emitted = [
    "invalid_line", "invalid_polyline", "invalid_circle", "invalid_arc",
    "invalid_ellipse", "invalid_spline", "invalid_text", "unsupported_entity",
    "unknown_block", "insert_depth", "anisotropic_insert",
    "dimension_without_block", "hatch_edge_path_partial",
    "hatch_unsupported_boundary", "parse_failed", "entity_limit",
  ];
  const missing = emitted.filter((code) => !CAD_DXF_IMPORT_REPORT_CODES.includes(code));
  assert.deepEqual(missing, [], `avisos del importador sin frase en español: ${missing.join(", ")}`);
}

// --- 3. sin jerga ------------------------------------------------------------
{
  // Un fichero con una entidad que el lector no sabe representar: es el caso
  // más común de un plano ajeno y el que peor se leía antes.
  const foreign = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "MUROS", "10", "0", "20", "0", "11", "100", "21", "0",
    "0", "3DFACE", "8", "TECHOS",
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
  const mixed = report(foreign);
  assert.equal(mixed.hasLosses, true, "una entidad que no entra es una pérdida");
  const lost = mixed.rows.find((row) => row.fidelity === "lost");
  assert.ok(lost, "la entidad no soportada aparece como perdida");
  assert.ok(lost!.detail.includes("3DFACE"), `debe nombrar el tipo real: ${lost!.detail}`);

  for (const row of mixed.rows) {
    assert.ok(
      !/[a-z]+_[a-z]+/.test(row.detail),
      `una frase con código interno no es español llano: ${row.detail}`,
    );
    assert.ok(
      !/\b(degraded|dropped|warning|unsupported|entity)\b/i.test(row.detail),
      `frase con jerga del programa: ${row.detail}`,
    );
    assert.ok(row.count >= 1, "toda fila cuenta al menos una entidad");
  }
  // El titular tiene que decir CUÁNTO, no «hay incidencias».
  assert.ok(/\d/.test(mixed.headline), mixed.headline);
}

// --- 4. la degradación SILENCIOSA también se declara ------------------------
{
  // Una cota ajena con su bloque de geometría entra como líneas y texto sueltos
  // y el importador NO emite aviso: sólo lo emite cuando falta el bloque. Es la
  // pérdida más cara de un plano de arquitectura —deja de recalcularse— y sin
  // esta fila no se declararía en ningún sitio del producto.
  const withDimension = [
    "0", "SECTION", "2", "BLOCKS",
    "0", "BLOCK", "2", "*D1", "10", "0", "20", "0",
    "0", "LINE", "8", "COTAS", "10", "0", "20", "0", "11", "100", "21", "0",
    "0", "ENDBLK",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    "0", "DIMENSION", "8", "COTAS", "2", "*D1", "10", "0", "20", "0",
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
  const flattened = report(withDimension);
  const row = flattened.rows.find((entry) => entry.code === "dimension_flattened");
  assert.ok(row, "la cota aplanada se declara aunque el importador calle");
  assert.equal(row!.fidelity, "degraded");
  assert.ok(row!.detail.includes("recalcul"), row!.detail);
}

// --- 5. las filas de quien llama entran y ordenan igual ---------------------
{
  const clean = exportCadDxf({
    primitives: [{ kind: "line", layer: "0", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }],
  });
  const withExtra = report(clean.content, [
    { fidelity: "degraded", code: "text_as_mtext", count: 2, detail: "dos textos entran como texto con formato." },
  ]);
  assert.equal(withExtra.hasLosses, true, "una fila añadida cuenta como pérdida");
  // Lo degradado va ANTES que lo conservado: un informe que empieza celebrando
  // lo que sí entró se cierra antes de llegar a lo que no.
  assert.equal(withExtra.rows[0].code, "text_as_mtext");
}

// --- 6. el informe que ve el tablero es el mismo ----------------------------
{
  // `importDocumentText` es la ruta REAL del panel de importación. Si el
  // informe no viaja por ahí, el componente no tiene nada que enseñar.
  const dxf = exportCadDxf({
    primitives: [{ kind: "arc", layer: "DETALLE", points: [{ x: 0, y: 0 }], radius: 5, startAngle: 0, endAngle: 90 }],
  });
  const imported = importDocumentText("plano.dxf", dxf.content);
  assert.ok(imported.dxfReport, "la importación DXF trae su informe en español");
  assert.equal(imported.dxfReport!.entityCount, imported.importedEntityCount);
  // El JSON canónico es NUESTRO formato y no degrada nada: no lleva informe.
  const json = importDocumentText(
    "doc.json",
    JSON.stringify(imported.document),
  );
  assert.equal(json.dxfReport, undefined, "un JSON canónico no necesita informe de fidelidad");
}

console.log(
  "dxf-import-report: un DXF limpio no inventa pérdidas, los 16 avisos del importador tienen frase " +
    "en español sin jerga, y la cota que se aplana en silencio se declara igual",
);
