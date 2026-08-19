/**
 * PDFIMPORT contra el corpus: qué entra, qué degrada y qué se declara perdido.
 *
 * Las tres afirmaciones que este spec defiende y que ninguna refactorización
 * puede romper en silencio:
 *
 *  1. **Un PDF escaneado FALLA con su nombre.** No devuelve un documento vacío
 *     ni geometría sacada de los bordes de la imagen. Es la promesa central del
 *     entregable: un plano inventado es peor que ningún plano.
 *  2. **La geometría entra donde toca.** Se comprueban COORDENADAS, no
 *     recuentos: un importador que aplique mal el `MediaBox` desplazado o el
 *     `/Rotate` produce el número correcto de entidades en el sitio equivocado,
 *     y eso pasaría cualquier prueba que sólo cuente.
 *  3. **El error de las curvas es el que se publica.** Se mide contra la Bézier
 *     original, no contra la promesa del algoritmo.
 *
 * Correr:  npx tsx src/lib/cad/pdf/pdf-import.spec.ts
 */
import { strict as assert } from "node:assert";
import { cadPdfCorpus } from "./pdf-corpus";
import {
  CAD_PDF_MM_PER_POINT,
  CadPdfImportError,
  importCadPdf,
  readCadPdfPageList,
} from "./pdf-import";
import { cadPdfBezierAt, cadPdfFlattenBezier, cadPdfMeasureFlattenError } from "./pdf-curves";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (actual: number, expected: number, tolerance: number, message: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: se esperaba ${expected} ± ${tolerance} y se midió ${actual}`,
  );
  checks += 1;
};

const corpus = new Map(cadPdfCorpus().map((file) => [file.id, file]));
const file = (id: string) => {
  const entry = corpus.get(id);
  assert.ok(entry, `el corpus no trae ${id}`);
  return entry;
};

// --- 1. el caso base: vectorial, comprimido y sin comprimir dan LO MISMO ----
{
  const plain = importCadPdf(file("cad-vector-uncompressed").bytes);
  const compressed = importCadPdf(file("cad-vector-compressed").bytes);

  ok(plain.entities.length > 0, "un PDF vectorial deja entidades");
  assert.equal(
    compressed.entities.length,
    plain.entities.length,
    "comprimir un PDF no puede cambiar lo que entra",
  );
  checks += 1;

  // El muro de abajo va de (72,72) a (288,72) en puntos. En milímetros son
  // 25,4 y 101,6. Se comprueba la COORDENADA, que es lo que un recuento no ve.
  const wall = plain.entities.find(
    (entity) => entity.type === "line" && Math.abs(entity.start.x - 72 * CAD_PDF_MM_PER_POINT) < 0.01,
  );
  ok(!!wall, "el muro inferior tiene que estar donde lo puso el PDF");
  if (wall && wall.type === "line") {
    near(wall.start.y, 72 * CAD_PDF_MM_PER_POINT, 0.01, "el arranque del muro en Y");
    near(wall.end.x, 288 * CAD_PDF_MM_PER_POINT, 0.01, "el final del muro en X");
    near(
      Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y),
      216 * CAD_PDF_MM_PER_POINT,
      0.01,
      "la longitud del muro en mm de papel",
    );
  }

  // El rectángulo `re` entra CERRADO: si entrase abierto, un sombreado sobre él
  // no encontraría contorno.
  const rect = plain.entities.find((entity) => entity.type === "polyline" && entity.closed);
  ok(!!rect, "el `re` del PDF entra como polilínea cerrada");

  // El texto de verdad entra como MTEXT con su contenido.
  const texts = plain.entities.filter((entity) => entity.type === "mtext");
  ok(texts.length === 2, `se esperaban 2 rótulos y entraron ${texts.length}`);
  ok(
    texts.some((entity) => entity.type === "mtext" && entity.text.includes("PLANTA BAJA")),
    "el rótulo «PLANTA BAJA» tiene que llegar con su texto",
  );
  // El guion largo y el signo ± vienen en WinAnsi. Leerlos como Latin-1 los
  // convertiría en caracteres de control invisibles.
  ok(
    texts.some((entity) => entity.type === "mtext" && entity.text.includes("–")),
    "un guion largo de WinAnsi tiene que sobrevivir",
  );

  // El color explícito del eje azul viaja: `0 0 1 RG`.
  const blue = plain.entities.find(
    (entity) => entity.context?.presentation?.color?.value === "#0000ff",
  );
  ok(!!blue, "el color de trazo del PDF entra como presentación explícita");
}

// --- 2. un ESCANEO falla con su nombre y remite a PDFATTACH -----------------
{
  for (const id of ["scanned-image-only", "scanned-with-ocr-layer"]) {
    assert.throws(
      () => importCadPdf(file(id).bytes),
      (error: unknown) => {
        if (!(error instanceof CadPdfImportError)) return false;
        assert.equal(error.code, "scanned_image", `${id}: código equivocado`);
        assert.ok(
          error.message.includes("imagen") && error.message.includes("PDFATTACH"),
          `${id}: el mensaje tiene que decir que es una imagen y remitir a PDFATTACH`,
        );
        return true;
      },
      `${id} tenía que fallar como escaneo`,
    );
    checks += 1;
  }
}

// --- 3. `MediaBox` desplazado: el plano NO se sale del papel ----------------
{
  const shifted = importCadPdf(file("shifted-mediabox").bytes);
  const base = importCadPdf(file("cad-vector-uncompressed").bytes);

  // El papel mide 550×400 pt = 194×141 mm.
  near(shifted.pageSize.width, 550 * CAD_PDF_MM_PER_POINT, 0.01, "el ancho útil del papel");
  near(shifted.pageSize.height, 400 * CAD_PDF_MM_PER_POINT, 0.01, "el alto útil del papel");

  const lines = shifted.entities.filter((entity) => entity.type === "line");
  ok(lines.length > 0, "el PDF desplazado deja líneas");
  for (const line of lines) {
    if (line.type !== "line") continue;
    for (const point of [line.start, line.end]) {
      ok(
        point.x >= -0.01 && point.x <= shifted.pageSize.width + 0.01,
        `un trazo se sale del papel en X: ${point.x}`,
      );
      ok(
        point.y >= -0.01 && point.y <= shifted.pageSize.height + 0.01,
        `un trazo se sale del papel en Y: ${point.y}`,
      );
    }
  }
  // Y además cae en el MISMO sitio relativo que en el archivo sin desplazar:
  // restar el origen no puede ser sólo «que quepa», tiene que ser exacto.
  const first = shifted.entities.find((entity) => entity.type === "line");
  const reference = base.entities.find((entity) => entity.type === "line");
  if (first?.type === "line" && reference?.type === "line")
    near(
      Math.hypot(first.end.x - first.start.x, first.end.y - first.start.y),
      Math.hypot(reference.end.x - reference.start.x, reference.end.y - reference.start.y),
      0.01,
      "el trazo desplazado mide lo mismo que el original",
    );
}

// --- 4. `/Rotate 90`: el papel cambia de forma y la geometría gira ----------
{
  const rotated = importCadPdf(file("rotated-90").bytes);
  near(rotated.pageSize.width, 792 * CAD_PDF_MM_PER_POINT, 0.01, "girada, la página mide 792 pt de ancho");
  near(rotated.pageSize.height, 612 * CAD_PDF_MM_PER_POINT, 0.01, "girada, la página mide 612 pt de alto");
  assert.equal(rotated.pageRotation, 90);
  checks += 1;

  // El muro que iba de (72,72) a (288,72) horizontal tiene que salir VERTICAL.
  const wall = rotated.entities.find(
    (entity) =>
      entity.type === "line" &&
      Math.abs(Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y) - 216 * CAD_PDF_MM_PER_POINT) < 0.01,
  );
  ok(!!wall, "el muro de 216 pt sigue existiendo tras girar");
  if (wall?.type === "line")
    near(
      Math.abs(wall.end.x - wall.start.x),
      0,
      0.01,
      "el muro horizontal del PDF sale vertical al aplicar /Rotate 90",
    );

  for (const entity of rotated.entities) {
    if (entity.type !== "line") continue;
    ok(
      entity.start.x >= -0.01 && entity.start.x <= rotated.pageSize.width + 0.01,
      "la geometría girada sigue dentro del papel",
    );
  }
}

// --- 5. multipágina: elegir página devuelve ESA página ----------------------
{
  const list = readCadPdfPageList(file("multipage-three").bytes);
  assert.equal(list.length, 3);
  checks += 1;

  const first = importCadPdf(file("multipage-three").bytes, { page: 1 });
  const second = importCadPdf(file("multipage-three").bytes, { page: 2 });
  const third = importCadPdf(file("multipage-three").bytes, { page: 3 });
  assert.equal(first.pageCount, 3);
  checks += 1;
  // La segunda página trae UNA línea larga y nada más.
  ok(second.entities.length === 1, `la página 2 trae 1 entidad y llegaron ${second.entities.length}`);
  ok(
    third.entities.every((entity) => entity.type === "polyline"),
    "la página 3 sólo trae un rectángulo",
  );
  ok(first.entities.length > second.entities.length, "la página 1 trae más que la 2");

  assert.throws(
    () => importCadPdf(file("multipage-three").bytes, { page: 9 }),
    (error: unknown) => error instanceof CadPdfImportError && error.code === "page_out_of_range",
    "pedir una página que no existe tiene que fallar con su código",
  );
  checks += 1;
}

// --- 6. capas opcionales: lo apagado NO entra, y se dice --------------------
{
  const bytes = file("optional-content-groups").bytes;
  const normal = importCadPdf(bytes);
  ok(
    normal.optionalGroups.some((group) => group.name === "Muros" && group.visible),
    "la capa «Muros» tiene que leerse encendida",
  );
  ok(
    normal.optionalGroups.some((group) => group.name === "Cotas" && !group.visible),
    "la capa «Cotas» tiene que leerse apagada",
  );
  ok(
    normal.warnings.some((warning) => warning.code === "hidden_layer_skipped"),
    "saltarse una capa apagada tiene que dejar aviso",
  );
  // Y las capas que sí entran nacen como capas del dibujo, no todo en una.
  ok(
    normal.layers.some((layer) => layer.name.includes("Muros")),
    "la capa del PDF se convierte en capa del dibujo",
  );

  const withHidden = importCadPdf(bytes, { includeHiddenLayers: true });
  ok(
    withHidden.entities.length > normal.entities.length,
    "pedir las capas apagadas tiene que traer MÁS geometría",
  );
}

// --- 7. objetos comprimidos: un PDF 1.5 no es un PDF sin páginas -----------
{
  const modern = importCadPdf(file("object-streams-1-5").bytes);
  ok(modern.entities.length > 0, "un PDF 1.5 con las páginas en un ObjStm tiene que entrar");
  const classic = importCadPdf(file("cad-vector-compressed").bytes);
  assert.equal(
    modern.entities.filter((entity) => entity.type !== "mtext").length,
    classic.entities.filter((entity) => entity.type !== "mtext").length,
    "la estructura del archivo no puede cambiar la geometría que entra",
  );
  checks += 1;
}

// --- 8. bloques reutilizados: los XObject de formulario se expanden ---------
{
  const forms = importCadPdf(file("form-xobjects").bytes);
  const base = importCadPdf(file("cad-vector-uncompressed").bytes);
  const geometryOf = (result: { entities: Array<{ type: string }> }) =>
    result.entities.filter((entity) => entity.type !== "mtext").length;
  ok(
    geometryOf(forms) > geometryOf(base),
    "los dos bloques insertados tienen que añadir geometría, no desaparecer",
  );
  // El segundo se inserta con `2 0 0 2 …`: su geometría mide el DOBLE.
  // Sólo los CUADRADOS del bloque: el plano base trae además un rectángulo de
  // 72×36, y meterlo en la comparación mediría la escala equivocada.
  const squares = forms.entities.filter((entity) => {
    if (entity.type !== "polyline" || !entity.closed || entity.vertices.length !== 4) return false;
    const width = Math.abs(entity.vertices[1].x - entity.vertices[0].x);
    const height = Math.abs(entity.vertices[2].y - entity.vertices[1].y);
    return width > 0 && Math.abs(width - height) < 1e-6;
  });
  ok(squares.length >= 2, "los dos cuadrados del bloque tienen que estar");
  const sizes = squares
    .map((entity) =>
      entity.type === "polyline"
        ? Math.abs(entity.vertices[1].x - entity.vertices[0].x)
        : 0,
    )
    .sort((a, b) => a - b);
  if (sizes.length >= 2)
    near(sizes[sizes.length - 1] / sizes[0], 2, 0.05, "la matriz del segundo bloque duplica su tamaño");
}

// --- 9. el texto que NO se puede traducir se declara, no se inventa ---------
{
  const withTable = importCadPdf(file("text-embedded-tounicode").bytes);
  ok(
    withTable.entities.some((entity) => entity.type === "mtext" && entity.text.includes("CORTE")),
    "con `/ToUnicode` el texto se recupera",
  );

  const withoutTable = importCadPdf(file("text-glyph-indices").bytes);
  ok(
    withoutTable.entities.every((entity) => entity.type !== "mtext"),
    "sin tabla de caracteres NO puede aparecer ningún MTEXT inventado",
  );
  ok(
    withoutTable.warnings.some((warning) => warning.code === "text_glyph_indices"),
    "y la pérdida tiene que quedar declarada",
  );
  assert.equal(withoutTable.counts.unreadableTexts, 1);
  checks += 1;

  // Texto en curvas: entra como trazos y NO como texto. Es correcto y hay que
  // decirlo, porque el usuario ve letras y espera poder editarlas.
  const curves = importCadPdf(file("text-as-curves").bytes);
  ok(
    curves.entities.every((entity) => entity.type !== "mtext"),
    "el texto convertido a curvas no puede volver a ser texto",
  );
  ok(curves.entities.length > 6, "pero sus trazos sí entran");
}

// --- 10. el error de las curvas es el MEDIDO, no el prometido ---------------
{
  const result = importCadPdf(file("cad-vector-uncompressed").bytes, {
    curveMode: "polyline",
    curveTolerance: 0.05,
  });
  ok(result.curveFidelity.curves === 1, "la página trae una Bézier");
  ok(
    result.curveFidelity.maxErrorUnits <= result.curveFidelity.toleranceUnits + 1e-9,
    `el error medido (${result.curveFidelity.maxErrorUnits}) supera la tolerancia pedida`,
  );
  ok(result.curveFidelity.maxErrorUnits > 0, "una curva aplanada NO tiene error cero");

  // Apretar la tolerancia tiene que reducir el error de verdad, no sólo el
  // número publicado.
  const tight = importCadPdf(file("cad-vector-uncompressed").bytes, {
    curveMode: "polyline",
    curveTolerance: 0.001,
  });
  ok(
    tight.curveFidelity.maxErrorUnits < result.curveFidelity.maxErrorUnits,
    "una tolerancia diez veces menor tiene que dar menos error",
  );

  // En modo spline la conversión es álgebra, no aproximación: error CERO.
  const exact = importCadPdf(file("cad-vector-uncompressed").bytes, { curveMode: "spline" });
  assert.equal(exact.curveFidelity.maxErrorUnits, 0);
  checks += 1;
  const spline = exact.entities.find((entity) => entity.type === "spline");
  ok(!!spline, "en modo spline la Bézier entra como spline");
  if (spline?.type === "spline") {
    assert.equal(spline.degree, 3);
    assert.deepEqual(spline.knots, [0, 0, 0, 0, 1, 1, 1, 1]);
    assert.equal(spline.controlPoints.length, 4);
    checks += 3;
  }
}

// --- 11. el aplanado, comprobado contra la curva de verdad ------------------
{
  // Una curva cerrada y fea, de las que salen de un empalme mal hecho.
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: 100 };
  const p2 = { x: 100, y: 100 };
  const p3 = { x: 100, y: 0 };
  for (const tolerance of [1, 0.1, 0.01, 0.001]) {
    const points = [p0, ...cadPdfFlattenBezier(p0, p1, p2, p3, tolerance)];
    const measured = cadPdfMeasureFlattenError(p0, p1, p2, p3, points);
    ok(
      measured <= tolerance,
      `tolerancia ${tolerance}: la desviación medida fue ${measured}`,
    );
    // El primer y el último punto son EXACTOS: aplanar no puede mover los
    // extremos, o los empalmes con lo que viene antes y después se abrirían.
    near(points[0].x, p0.x, 1e-12, "el aplanado conserva el arranque");
    near(points[points.length - 1].x, p3.x, 1e-12, "el aplanado conserva el final");
  }
  // Y el muestreo de la curva es el de verdad: en t = 0,5 de esta Bézier.
  const mid = cadPdfBezierAt(p0, p1, p2, p3, 0.5);
  near(mid.x, 50, 1e-9, "la Bézier evaluada en su punto medio");
  near(mid.y, 75, 1e-9, "la Bézier evaluada en su punto medio");
}

// --- 12. degradados y rellenos: cada pérdida con su nombre ------------------
{
  const result = importCadPdf(file("shading-and-fills").bytes);
  ok(
    result.warnings.some((warning) => warning.code === "shading_dropped"),
    "un degradado tiene que declararse perdido",
  );
  ok(
    result.warnings.some((warning) => warning.code === "fill_as_outline"),
    "un relleno macizo tiene que declararse como contorno sin trama",
  );
  ok(
    result.warnings.some((warning) => warning.code === "clip_not_applied"),
    "un recorte sin aplicar tiene que declararse",
  );
}

// --- 13. lo que NO es un PDF falla antes de leer nada -----------------------
{
  assert.throws(
    () => importCadPdf(Uint8Array.from("esto no es un PDF", (c) => c.charCodeAt(0))),
    (error: unknown) => error instanceof CadPdfImportError && error.code === "not_pdf",
    "un archivo que no es PDF tiene que decirlo",
  );
  checks += 1;
}

// --- 14. la escala por defecto es TAMAÑO DE PAPEL, y se puede cambiar -------
{
  const millimetres = importCadPdf(file("cad-vector-uncompressed").bytes);
  near(millimetres.pageSize.width, 215.9, 0.1, "una Carta mide 215,9 mm de ancho");

  // 1:50 sobre el papel: un metro de obra son 20 mm de papel.
  const scaled = importCadPdf(file("cad-vector-uncompressed").bytes, {
    unitsPerPoint: CAD_PDF_MM_PER_POINT * 50,
  });
  near(
    scaled.pageSize.width,
    215.9 * 50,
    5,
    "a escala 1:50 la página mide cincuenta veces más",
  );
}

console.log(`pdf-import.spec.ts ✅ ${checks} comprobaciones`);
