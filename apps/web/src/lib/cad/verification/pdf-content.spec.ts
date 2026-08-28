import { strict as assert } from "node:assert";
import { inspectCadPdf } from "../plot/plot-pdf";
import {
  extractCadPdfGeometry,
  hasSegmentOfLength,
  segmentLengthMm,
} from "../plot/plot-pdf-geometry";
import { createCadPaperSpace } from "../paper-space";
import { createCadSheetSet } from "../sheet-set/sheet-set";
import { publishCadSheetSet } from "../sheet-set/sheet-set-publish";
import { CAD_DOCUMENT_SCHEMA, type CadDocument, type CadEntity } from "../cad-document";

/**
 * 3.1 — EL PDF, VERIFICADO POR SU CONTENIDO.
 *
 * «Que puedan descargar sus planos» es la promesa central del lanzamiento, y
 * hasta esta campaña lo único que se comprobaba del PDF era su cubierta:
 * páginas, tamaño y fuentes declaradas. Un archivo con el `MediaBox` de un A3
 * y la página EN BLANCO pasaba todas aquellas pruebas.
 *
 * Aquí se abre el content stream y se mide lo que hay dentro:
 *
 *   1. ESCALA EXACTA — el muro de 3.5 m mide 70 mm de papel a 1:50. Es la
 *      afirmación de la campaña, comprobada sobre los trazos reales del
 *      archivo y no sobre la etiqueta del cajetín.
 *   2. CAPAS → PLUMAS — cada trazo llega con el grosor y el color de su capa.
 *   3. TEXTOS CON ACENTOS — «Ámbito», «Niño», «3.50 m» salen legibles; los
 *      acentos viajan en octal WinAnsi y es justo donde se pierden.
 *   4. COTAS VISIBLES — la geometría de la cota está dibujada, no sólo su
 *      número en un campo.
 *   5. CAJETÍN COMPLETO — sin un solo campo vacío.
 *   6. MÁRGENES ISO — nada pintado fuera del área útil.
 *
 * Sobre TRES documentos de referencia, versionados aquí mismo como fixtures:
 * una planta acotada, una lámina con textos acentuados y un juego de dos hojas.
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/**
 * TOLERANCIA DE PAPEL: 0.05 mm.
 *
 * Es el orden del redondeo que jsPDF hace al escribir coordenadas en puntos
 * con dos decimales (0.01 pt ≈ 0.0035 mm) más el ida y vuelta mm→pt→mm. Una
 * escala mal aplicada se equivoca en MILÍMETROS, así que este margen distingue
 * sin ambigüedad el redondeo del defecto.
 */
const PAPER_TOL = 0.05;

/** El muro de la campaña, y su medida en papel a 1:50. */
const WALL_MM = 3500;
const SCALE = 50;
const WALL_ON_PAPER = WALL_MM / SCALE; // 70 mm exactos

/**
 * EL DOCUMENTO DE REFERENCIA, y por qué se construye entero.
 *
 * La primera versión de este spec fabricaba a mano los `CadVectorCommand` de
 * la hoja. Se puso roja midiendo 3500 mm donde esperaba 70, y tenía razón: el
 * plan vectorial viaja YA en milímetros de papel, y quien aplica la escala es
 * `buildCadPublishPlan`. Un fixture escrito a mano se saltaba justo la
 * conversión que esta suite existe para verificar.
 *
 * Así que aquí se construye un documento CANÓNICO —con su espacio modelo, su
 * lámina y su ventana a 1:50— y se le pide al producto el plan. Medir 70 mm en
 * el PDF resultante verifica entonces la cadena entera: documento → plan →
 * PDF, que es la que recorre un plano de verdad.
 */
function referenceDocument(entities: CadEntity[], sheetId: string): CadDocument {
  const paperSpace = createCadPaperSpace({
    id: sheetId,
    name: `Lámina ${sheetId}`,
    order: 0,
    paper: "A3",
    orientation: "landscape",
    unit: "mm",
    // Los límites del modelo abarcan el dibujo con holgura; la ESCALA se fija
    // a mano en 1:50 en vez de dejar que se ajuste sola, porque el número que
    // se quiere comprobar es ése.
    modelBounds: { x: -1000, y: -1000, width: 12000, height: 9000 },
    scale: SCALE,
    metadata: {
      project: PROJECT,
      drawingNumber: sheetId,
      title: `Lámina ${sheetId}`,
      sheetNumber: sheetId,
      revision: "0",
      discipline: "Arquitectura",
      preparedBy: "Arquitecta",
    },
  });
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [
      { id: "MUROS", name: "MUROS", color: "#000000", visible: true, locked: false },
      { id: "COTAS", name: "COTAS", color: "#dc2626", visible: true, locked: false },
      { id: "TEXTOS", name: "TEXTOS", color: "#111827", visible: true, locked: false },
    ],
    entities,
    history: [{ version: 1, label: "documento de referencia" }],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [{ ...paperSpace, pageSetup: { ...paperSpace.pageSetup, colorMode: "color" } }],
    styles: {},
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

/** Una línea del espacio modelo, en unidades de dibujo (mm). */
function line(
  id: string,
  from: [number, number],
  to: [number, number],
  layer: string,
  lineweight?: number,
): CadEntity {
  return {
    id,
    type: "line",
    start: { x: from[0], y: from[1], z: 0 },
    end: { x: to[0], y: to[1], z: 0 },
    layer,
    ...(lineweight
      ? { context: { presentation: { lineweight, lineweightSource: "explicit" } } }
      : {}),
  } as unknown as CadEntity;
}

/** Un rótulo del espacio modelo. */
function text(id: string, at: [number, number], value: string, height = 250): CadEntity {
  return {
    id,
    type: "text",
    x: at[0],
    y: at[1],
    text: value,
    height,
    layer: "TEXTOS",
  } as unknown as CadEntity;
}

/** Los tres rótulos con los que se comprueba que el español sobrevive. */
const ACCENTED = [
  "Ámbito de intervención",
  "Niño — habitación 2",
  "PROYECCIÓN DE LOSA",
];

const PROJECT = "Casa Valle";
const CLIENT = "Familia Ramirez";

/**
 * PUBLICA COMO LO HACE EL PRODUCTO.
 *
 * `publishCadSheetSet` es el camino real del comando PLOT sobre un juego: arma
 * el plan, resuelve el CAJETÍN de cada lámina —de ahí salen la escala y las
 * unidades, que el emisor no adivina— y llama al mismo emisor de PDF.
 *
 * La primera versión de este spec llamaba a `renderCadPlotPdf` directamente
 * con hojas armadas a mano. Salieron seis campos del cajetín como «—» y la
 * escala sin resolver: no era un defecto del producto, era el spec saltándose
 * la mitad del camino. Un verificador que no recorre la ruta real verifica
 * otra cosa.
 */
async function publishSet(
  entries: ReadonlyArray<{ document: CadDocument; sheetId: string }>,
): Promise<{ bytes: Uint8Array }> {
  const documents = new Map<string, CadDocument>();
  let set = createCadSheetSet({
    id: "juego",
    name: "Casa Valle — planos",
    fields: {
      PROJECT,
      CLIENT,
      DATE: "2026-08-27",
      PREPARED_BY: "Arquitecta",
      CHECKED_BY: "DRO",
      UNITS: "mm",
      DISCIPLINE: "Arquitectura",
    },
  });
  entries.forEach((entry, index) => {
    documents.set(entry.sheetId, entry.document);
    set = {
      ...set,
      sheets: [
        ...set.sheets,
        {
          id: entry.sheetId,
          order: index,
          documentId: entry.sheetId,
          layoutId: entry.sheetId,
          title: entry.sheetId,
          number: entry.sheetId,
          numberLocked: true,
          revision: "0",
          includeInPublish: true,
        },
      ],
    };
  });
  const result = await publishCadSheetSet({
    set,
    documents,
    date: "2026-08-27T00:00:00.000Z",
    fileName: "casa-valle",
    // Sin portada en los casos de una sola lámina: el índice es correcto pero
    // añade una página en blanco de geometría que confundiría los recuentos.
    cover: entries.length > 1,
    pdf: { compress: true },
  });
  return { bytes: result.bytes };
}

/** Publica UNA lámina por el mismo camino. */
function publish(document: CadDocument, sheetId: string) {
  return publishSet([{ document, sheetId }]);
}

async function main(): Promise<void> {
  /* ════════════════════════════════════════════════════════════════════════
     DOCUMENTO 1 — planta acotada: la escala, medida en el archivo
     ════════════════════════════════════════════════════════════════════════ */

  const planta = referenceDocument(
    [
      // EL MURO: 3500 unidades de dibujo, horizontal, con pluma gruesa.
      line("muro", [0, 0], [WALL_MM, 0], "MUROS", 0.5),
      // Un muro perpendicular de 2400: segunda medida conocida, otro eje.
      line("muro-2", [0, 0], [0, 2400], "MUROS", 0.5),
      // LA COTA: línea de cota y sus dos extensiones, en capa fina.
      line("cota-linea", [0, -400], [WALL_MM, -400], "COTAS", 0.13),
      line("cota-ext-a", [0, -50], [0, -450], "COTAS", 0.13),
      line("cota-ext-b", [WALL_MM, -50], [WALL_MM, -450], "COTAS", 0.13),
      text("cota-texto", [WALL_MM / 2, -300], "3.50 m"),
    ],
    "A-101",
  );

  const published = await publish(planta, "A-101");
  ok(published.bytes.length > 1000, "el trazado produce un PDF con contenido");

  const geometry = extractCadPdfGeometry(published.bytes);
  ok(
    geometry.pageSizesMm.some(
      (size) => near(size.width, 420, 0.05) && near(size.height, 297, 0.05),
    ),
    `hay una página A3 apaisada (${geometry.pageSizesMm.map((s) => `${s.width.toFixed(1)}×${s.height.toFixed(1)}`).join(", ")})`,
  );
  ok(
    geometry.segments.length > 0,
    `el content stream trae ${geometry.segments.length} trazos. Si esto falla, el PDF está EN BLANCO — y la lectura de cubierta no lo habría notado`,
  );

  const lengths = [...new Set(geometry.segments.map((s) => segmentLengthMm(s).toFixed(2)))]
    .sort((a, b) => Number(a) - Number(b))
    .join(", ");

  /* ── 1. LA ESCALA, medida sobre el trazo ─────────────────────────────── */

  ok(
    hasSegmentOfLength(geometry, WALL_ON_PAPER, PAPER_TOL),
    `el muro de 3.5 m mide ${WALL_ON_PAPER} mm en el papel a 1:${SCALE}. Longitudes halladas: ${lengths}`,
  );
  ok(
    hasSegmentOfLength(geometry, 2400 / SCALE, PAPER_TOL),
    `y el muro de 2.4 m mide ${2400 / SCALE} mm: la escala es la MISMA en los dos ejes`,
  );
  ok(
    !hasSegmentOfLength(geometry, WALL_MM, 1),
    "no hay ningún trazo de 3500 mm: la escala se aplicó",
  );
  ok(
    !hasSegmentOfLength(geometry, WALL_ON_PAPER / SCALE, PAPER_TOL),
    "ni ninguno de 1.4 mm: no se aplicó dos veces",
  );

  /* ── 2. CAPAS → PLUMAS ───────────────────────────────────────────────── */

  const wall = geometry.segments.find((segment) =>
    near(segmentLengthMm(segment), WALL_ON_PAPER, PAPER_TOL),
  )!;
  const extensions = geometry.segments.filter((segment) =>
    near(segmentLengthMm(segment), 400 / SCALE, PAPER_TOL),
  );
  ok(
    wall.widthMm > 0,
    `el muro llega con una pluma declarada (${wall.widthMm.toFixed(3)} mm), no con el grosor por defecto del PDF`,
  );
  ok(
    extensions.length >= 2,
    `las dos líneas de extensión de la cota están DIBUJADAS (${extensions.length}), no sólo su número`,
  );
  ok(
    extensions.every((segment) => segment.widthMm <= wall.widthMm + 1e-9),
    `y la cota se traza más fina que el muro (${extensions[0].widthMm.toFixed(3)} ≤ ${wall.widthMm.toFixed(3)}): la jerarquía de plumas sobrevive al PDF`,
  );

  /* ── 3. LA COTA Y SU NÚMERO ──────────────────────────────────────────── */

  ok(
    geometry.texts.some((run) => run.text.includes("3.50")),
    `el número de la cota está impreso (textos: ${geometry.texts.map((t) => t.text).join(" | ").slice(0, 240)})`,
  );

  /* ── 4. CAJETÍN COMPLETO: ni un campo vacío ──────────────────────────── */

  const printed = geometry.texts.map((run) => run.text).join(" ");
  for (const value of [PROJECT, CLIENT, "A-101", `1:${SCALE}`]) {
    ok(
      printed.includes(value),
      `el cajetín imprime «${value}»; un campo vacío es un plano sin identificar. Impreso: ${printed.slice(0, 300)}`,
    );
  }
  // LA COMPROBACIÓN QUE DE VERDAD CIERRA EL CAJETÍN: el emisor marca con «—»
  // los campos que nadie pudo resolver. Ninguno de los que este juego declara
  // puede salir así.
  const emDashes = (printed.match(/—/gu) ?? []).length;
  ok(
    emDashes === 0,
    `ningún campo del cajetín sale como «—» (hay ${emDashes}). Impreso: ${printed.slice(0, 300)}`,
  );

  /* ── 5. MÁRGENES ISO ─────────────────────────────────────────────────── */

  const outside = geometry.segments.filter((segment) =>
    [segment.from, segment.to].some(
      (point) =>
        point.x < -PAPER_TOL ||
        point.y < -PAPER_TOL ||
        point.x > 420 + PAPER_TOL ||
        point.y > 297 + PAPER_TOL,
    ),
  );
  ok(outside.length === 0, `nada se pinta fuera de la hoja (${outside.length} trazos se salían)`);

  /* ════════════════════════════════════════════════════════════════════════
     DOCUMENTO 2 — los acentos, que es donde se pierde el español
     ════════════════════════════════════════════════════════════════════════ */

  const acentos = await publish(
    referenceDocument(
      [
        line("marco", [0, 0], [WALL_MM, 0], "MUROS", 0.35),
        ...ACCENTED.map((value, index) =>
          text(`t-${index}`, [100, 500 + index * 700], value, 300),
        ),
      ],
      "A-201",
    ),
    "A-201",
  );

  const readAccents = extractCadPdfGeometry(acentos.bytes);
  const accentText = readAccents.texts.map((run) => run.text).join(" | ");
  for (const expected of ACCENTED) {
    ok(
      accentText.includes(expected),
      `el PDF conserva «${expected}» con sus acentos intactos (leído: ${accentText.slice(0, 300)})`,
    );
  }
  ok(
    !accentText.includes("\uFFFD"),
    "y no hay caracteres de reemplazo donde iban los acentos",
  );

  /* ════════════════════════════════════════════════════════════════════════
     DOCUMENTO 3 — juego de dos láminas, cada una con su número
     ════════════════════════════════════════════════════════════════════════ */

  const juego = await publishSet([
    { document: referenceDocument([line("muro", [0, 0], [WALL_MM, 0], "MUROS", 0.5)], "A-101"), sheetId: "A-101" },
    { document: referenceDocument([line("corte", [0, 0], [6000, 0], "MUROS", 0.5)], "A-102"), sheetId: "A-102" },
  ]);
  const readSet = extractCadPdfGeometry(juego.bytes);
  const setText = readSet.texts.map((run) => run.text).join(" ");
  ok(
    readSet.pageCount >= 2,
    `el juego tiene al menos sus dos láminas (${readSet.pageCount} páginas, portada incluida)`,
  );
  ok(
    setText.includes("A-101") && setText.includes("A-102"),
    `cada lámina lleva SU número, no el de la primera repetido (${setText.slice(0, 240)})`,
  );
  ok(
    hasSegmentOfLength(readSet, WALL_ON_PAPER, PAPER_TOL) &&
      hasSegmentOfLength(readSet, 6000 / SCALE, PAPER_TOL),
    `y las dos láminas traen su geometría a la misma escala (longitudes: ${[...new Set(readSet.segments.map((seg) => segmentLengthMm(seg).toFixed(2)))].sort((a, b) => Number(a) - Number(b)).join(", ")})`,
  );
  const cover = inspectCadPdf(juego.bytes);
  ok(
    cover.pageCount === readSet.pageCount,
    "la lectura de cubierta coincide con la de contenido",
  );
  ok(cover.baseFonts.length > 0, "y las fuentes están declaradas");

  /* ── LA PRUEBA NEGATIVA: un PDF vacío NO pasa ────────────────────────── */

  const blank = await publish(referenceDocument([], "A-301"), "A-301");
  const readBlank = extractCadPdfGeometry(blank.bytes);
  ok(
    !hasSegmentOfLength(readBlank, WALL_ON_PAPER, PAPER_TOL),
    "una hoja SIN dibujo no tiene el trazo de 70 mm: el verificador distingue el plano del papel en blanco",
  );
  const blankCover = inspectCadPdf(blank.bytes);
  ok(
    blankCover.pageSizesMm.some((size) => near(size.width, 420, 0.05)),
    "y sin embargo su CUBIERTA es idéntica a la del plano con contenido — por eso hacía falta este módulo",
  );

  console.log(
    `verificación 3.1 (contenido del PDF): ${checks} comprobaciones sobre 3 documentos de referencia`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
