/**
 * Fidelidad de trazado: lo que se ve contra lo que se imprime, en milímetros.
 *
 * ## Qué se afirma aquí y por qué hacía falta
 *
 * El producto sabía trazar PDF con escalas y tablas de plumas, pero nadie había
 * MEDIDO que el archivo entregado se corresponda con lo que el editor enseña.
 * Un plano que imprime mal es un plano inservible por muy bien que se dibuje, y
 * «se ve bien» no es una comprobación: es una opinión.
 *
 * Este módulo produce las cuatro cifras que convierten esa opinión en un dato:
 *
 * 1. **Escala.** Un muro de longitud conocida trazado a 1:50 debe medir
 *    `longitud / 50` milímetros sobre el papel. Se mide en el PDF con
 *    `pdf-measure` y se resta. La cifra que sale es el error del escalímetro.
 * 2. **Geometría.** Cada trazo de la VISTA PREVIA se busca en el PDF y se mide
 *    la distancia entre sus extremos. Es la comparación literal entre lo que ve
 *    el arquitecto y lo que sale por la impresora.
 * 3. **Texto.** La altura de rótulo esperada contra la impresa. Aquí aparece el
 *    recorte de [1,5 – 12] mm que el plan de publicación aplica a todo texto, y
 *    que a escalas grandes cambia el tamaño del rótulo sin avisar.
 * 4. **Fuentes.** Qué familia se incrusta y cuál se sustituye, leído del PDF.
 *
 * ## El criterio de comparación se publica con el número
 *
 * Un error de «0,001» no significa nada si no se dice contra qué se comparó ni
 * con qué tolerancia. Cada medida de aquí viaja con su criterio escrito
 * (`criterion`), y ese texto acaba dentro del artefacto de evidencia. Un número
 * sin criterio es un número que se puede reinterpretar cuando conviene.
 */
import type { CadDocument } from "../cad-document";
import { createCadPaperSpace, type CadSheetPaper } from "../paper-space";
import {
  applyCadPageSetupToLayout,
  cadPageSetupFromLayout,
  cadPageSize,
  type CadPageSetup,
} from "./page-setup";
import { buildCadPlotJob, buildCadPlotPreview } from "./plot-job";
import { createCadMonochromeTable } from "./plot-style-table";
import type { CadPlotFontResolution } from "./plot-fonts";
import { renderCadPlotPdf, type CadPlotFontProgram } from "./plot-pdf";
import {
  measureCadPdf,
  nearestCadPdfSegment,
  cadPdfSegmentsOutsidePage,
  type CadPdfMeasurement,
} from "./pdf-measure";

/** Recorte que `buildCadPublishPlan` aplica a la altura de todo rótulo, en mm. */
export const CAD_TEXT_HEIGHT_CLAMP_MM = { min: 1.5, max: 12 } as const;

/**
 * Caracteres que un plano mexicano lleva de verdad.
 *
 * Acentos y eñes de los rótulos, signos de apertura, ordinales, el grado de las
 * pendientes, los exponentes de las superficies, la raya del cajetín y los dos
 * signos de diámetro que conviven en la práctica: `Ø` (letra escandinava, que
 * es la que usa todo el mundo) y `⌀` (el signo técnico de verdad).
 */
export const CAD_PLOT_CHARSET_PROBE =
  "áéíóúÁÉÍÓÚñÑüÜ¿¡ºª°±²³×÷µØ€—–‘’“”…·Ω⌀";

export interface CadPlotCharsetReport {
  probed: string;
  /** Lo que quedó escrito en el PDF, leído de sus bytes. */
  rendered: string;
  /** Caracteres que no sobrevivieron al viaje. */
  lost: string[];
  /** Fuente con la que se hizo la prueba. */
  font: string;
  criterion: string;
}

/**
 * Qué caracteres sobreviven al PDF con la fuente que se le pase.
 *
 * Con las fuentes residentes el juego útil es WinAnsi (CP1252): todo lo español
 * entra, y lo que se sale —el signo técnico de diámetro, las letras griegas—
 * NO se representa. Saberlo por adelantado es la diferencia entre un plano
 * entregable y uno que en ventanilla enseña un cuadro en vez de un símbolo.
 */
export async function measureCadPlotCharacterSet(
  fontPrograms?: readonly CadPlotFontProgram[],
  family = "Arial",
  probe = CAD_PLOT_CHARSET_PROBE,
): Promise<CadPlotCharsetReport> {
  const sheet = {
    id: "charset",
    name: "Juego de caracteres",
    width: 297,
    height: 210,
    orientation: "landscape" as const,
    colorMode: "monochrome" as const,
    lineweightScale: 1,
    titleBlock: {},
    viewports: [
      {
        id: "charset:viewport",
        name: "Sonda",
        clip: { x: 10, y: 10, width: 277, height: 190 },
        scale: 1,
        locked: true,
        commands: [
          {
            kind: "text" as const,
            entityId: "charset:probe",
            viewportId: "charset:viewport",
            point: { x: 15, y: 30 },
            text: probe,
            size: 4,
            rotation: 0,
            color: "#000000",
          },
        ],
      },
    ],
  };
  const pdf = await renderCadPlotPdf([sheet], {
    compress: false,
    fontUsage: [{ family, usageCount: 1 }],
    fontByEntity: new Map([["charset:probe", family]]),
    ...(fontPrograms ? { fonts: fontPrograms } : {}),
  });
  const measurement = measureCadPdf(pdf.bytes);
  const rendered = measurement.labels.map((label) => label.text).join("");
  return {
    probed: probe,
    rendered,
    lost: [...new Set([...probe])].filter((char) => !rendered.includes(char)),
    font: family,
    criterion:
      "Se traza la cadena sonda en una hoja suelta y se vuelve a leer del flujo de contenido del PDF, " +
      "decodificando WinAnsi (CP1252). Un carácter «perdido» es uno que el archivo ya no contiene: " +
      "no se representará en ningún visor, tenga o no la fuente.",
  };
}

export interface CadFidelityFixtureInput {
  paper: CadSheetPaper;
  orientation: "portrait" | "landscape";
  /** Denominador de la escala de la ventana gráfica: 50 para 1:50. */
  scaleDenominator: number;
  /** Longitud del muro de referencia, en unidades de dibujo. */
  wallLengthUnits: number;
  /** Altura del muro de referencia, en unidades de dibujo. */
  wallHeightUnits: number;
  /** Altura del rótulo de referencia, en unidades de dibujo. */
  textHeightUnits: number;
  /** Familia del rótulo. Es lo que decide si el PDF sustituye o no. */
  fontFamily: string;
  unit?: string;
}

/**
 * Dibujo patrón: dos muros de longitud EXACTA y un rótulo de altura exacta.
 *
 * Deliberadamente mínimo. Un corpus de veinte mil entidades mediría lo mismo
 * pero haría imposible señalar qué trazo produjo un error, y la gracia de esta
 * medida es poder decir «el muro sur salió 0,0002 mm corto», no «hay deriva».
 */
export function buildCadFidelityFixture(input: CadFidelityFixtureInput): CadDocument {
  const unit = input.unit ?? "mm";
  // La presentación se crea CON su papel, no con uno cualquiera al que luego se
  // le cambia la etiqueta: la ventana gráfica se dimensiona al crearla. El
  // cambio de papel posterior es un caso propio —se mide aparte, con
  // `plotOnPaper`, recorriendo el camino real de PAGESETUP— y meterlo dentro
  // del patrón de escala contaminaría todas las medidas.
  const paperSpace = createCadPaperSpace({
    id: "layout:patron",
    name: "Patrón de fidelidad",
    order: 0,
    paper: input.paper,
    orientation: input.orientation,
    modelBounds: {
      x: 0,
      y: 0,
      width: input.wallLengthUnits,
      height: input.wallHeightUnits,
    },
    unit,
    metadata: {
      project: "Patrón de fidelidad de trazado",
      drawingNumber: "VD-FID-001",
      title: "Muros de referencia",
      sheetNumber: "F-001",
      revision: "A",
      discipline: "Arquitectura",
      preparedBy: "Valle Design",
    },
    scale: input.scaleDenominator,
  });

  return {
    meta: { version: 1, schema: 4, unit },
    layers: [
      {
        id: "MURO",
        name: "MURO",
        color: "#0000ff",
        visible: true,
        locked: false,
        lineweight: 0.18,
      },
    ],
    entities: [
      {
        id: "muro-sur",
        type: "line",
        layer: "MURO",
        start: { x: 0, y: 0, z: 0 },
        end: { x: input.wallLengthUnits, y: 0, z: 0 },
      },
      {
        id: "muro-oeste",
        type: "line",
        layer: "MURO",
        start: { x: 0, y: 0, z: 0 },
        end: { x: 0, y: input.wallHeightUnits, z: 0 },
      },
      {
        id: "rotulo",
        type: "mtext",
        layer: "MURO",
        insertion: { x: 0, y: input.wallHeightUnits / 2, z: 0 },
        text: "PLANTA BAJA",
        height: input.textHeightUnits,
        rotation: 0,
        fontFamily: input.fontFamily,
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-sur", "muro-oeste", "rotulo"] },
    paperSpaces: [paperSpace],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    externalReferences: [],
  } as unknown as CadDocument;
}

export interface CadFidelityMeasure {
  expectedMm: number;
  measuredMm: number;
  errorMm: number;
  /** Error relativo respecto de lo esperado, en partes por millón. */
  errorPpm: number;
  criterion: string;
}

export interface CadPlotFidelityReport {
  fixture: CadFidelityFixtureInput & { paperSizeMm: { width: number; height: number } };
  page: { expectedMm: { width: number; height: number }; measuredMm: { width: number; height: number }; errorMm: number };
  /** Escala: el muro horizontal medido sobre el papel. */
  horizontal: CadFidelityMeasure;
  /** Escala: el muro vertical, que recorre el otro eje del papel. */
  vertical: CadFidelityMeasure;
  /** Altura del rótulo impreso contra la que pedía el dibujo. */
  text: CadFidelityMeasure & { clamped: boolean; unclampedExpectedMm: number };
  /** Vista previa contra PDF, extremo a extremo. */
  geometry: {
    comparedSegments: number;
    matchedSegments: number;
    maxDeviationMm: number;
    meanDeviationMm: number;
    criterion: string;
  };
  fonts: {
    declared: CadPlotFontResolution[];
    /** `/BaseFont` leídos del archivo. */
    inPdf: Array<{ baseFont: string; embedded: boolean; subtype: string }>;
    substituted: Array<{ family: string; substitutedBy: string }>;
    embedded: string[];
  };
  /** Trazos dibujados fuera del `MediaBox`: se dibujan y no se imprimen. */
  segmentsOutsidePage: number;
  /** Lo que el lector de PDF no supo interpretar. Vacío = medida completa. */
  unreadable: string[];
  pdfBytes: number;
  warnings: string[];
}

export interface CadPlotFidelityInput extends CadFidelityFixtureInput {
  /** Programas de fuente a incrustar. Sin ellos todo se sustituye o reside. */
  fontPrograms?: readonly CadPlotFontProgram[];
  /**
   * Trazar sobre un papel DISTINTO del que se usó para crear la presentación,
   * que es lo que hace PAGESETUP al cambiar de A1 a A3.
   *
   * El cambio pasa por `applyCadPageSetupToLayout`, que es el MISMO camino que
   * recorre PAGESETUP en el producto: la hoja cambia y las ventanas gráficas se
   * recolocan a la zona imprimible nueva. La cifra que sale —cuántos trazos
   * caen fuera del `MediaBox`— es la que antes medía el defecto
   * `paper-change-does-not-move-viewport` y ahora vigila que no regrese.
   */
  plotOnPaper?: CadSheetPaper;
}

function measure(
  expectedMm: number,
  measuredMm: number,
  criterion: string,
): CadFidelityMeasure {
  const errorMm = measuredMm - expectedMm;
  return {
    expectedMm,
    measuredMm,
    errorMm,
    errorPpm: expectedMm === 0 ? 0 : (errorMm / expectedMm) * 1e6,
    criterion,
  };
}

/** Segmentos esperados de la vista previa: pares consecutivos de cada trazo. */
function previewSegments(
  strokes: ReadonlyArray<{ points: { x: number; y: number }[]; closed: boolean }>,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const stroke of strokes) {
    for (let index = 1; index < stroke.points.length; index += 1)
      segments.push({
        x1: stroke.points[index - 1].x,
        y1: stroke.points[index - 1].y,
        x2: stroke.points[index].x,
        y2: stroke.points[index].y,
      });
    if (stroke.closed && stroke.points.length > 1)
      segments.push({
        x1: stroke.points[stroke.points.length - 1].x,
        y1: stroke.points[stroke.points.length - 1].y,
        x2: stroke.points[0].x,
        y2: stroke.points[0].y,
      });
  }
  return segments;
}

/** Distancia entre dos segmentos, comparando extremos en los dos sentidos. */
function segmentDistance(
  expected: { x1: number; y1: number; x2: number; y2: number },
  actual: { x1: number; y1: number; x2: number; y2: number },
): number {
  const direct = Math.max(
    Math.hypot(actual.x1 - expected.x1, actual.y1 - expected.y1),
    Math.hypot(actual.x2 - expected.x2, actual.y2 - expected.y2),
  );
  const reversed = Math.max(
    Math.hypot(actual.x2 - expected.x1, actual.y2 - expected.y1),
    Math.hypot(actual.x1 - expected.x2, actual.y1 - expected.y2),
  );
  return Math.min(direct, reversed);
}

const GEOMETRY_CRITERION =
  "Cada trazo de la vista previa se empareja con el trazo del PDF cuyos extremos quedan más cerca; " +
  "la desviación de una pareja es la MAYOR de las distancias entre sus dos extremos, en mm de papel. " +
  "Se publica el máximo y la media sobre todas las parejas.";

/**
 * Mide un trazado completo, del documento al PDF.
 *
 * El PDF se emite SIN comprimir a propósito: comprimido no se puede medir sin
 * arrastrar un descompresor, y una medida que no se puede repetir no es
 * evidencia. Lo que se entrega al arquitecto sí va comprimido; lo que se mide
 * es el mismo emisor con una opción distinta.
 */
export async function measureCadPlotFidelity(
  input: CadPlotFidelityInput,
): Promise<CadPlotFidelityReport> {
  const fixture = buildCadFidelityFixture(input);
  const pageSetup: CadPageSetup = {
    ...cadPageSetupFromLayout(fixture.paperSpaces[0]),
    paper: input.plotOnPaper ?? input.paper,
    orientation: input.orientation,
  };
  // Cambiar de papel recorre el camino real de PAGESETUP: la hoja se reescribe
  // CON sus ventanas recolocadas. Medir el trazado saltándose ese paso mediría
  // un producto que no existe.
  const document: CadDocument = input.plotOnPaper
    ? {
        ...fixture,
        paperSpaces: [
          applyCadPageSetupToLayout(fixture.paperSpaces[0], pageSetup),
          ...fixture.paperSpaces.slice(1),
        ],
      }
    : fixture;
  const plotStyleTable = createCadMonochromeTable("fidelidad");
  const jobInput = { document, pageSetup, plotStyleTable, generatedAt: "1970-01-01T00:00:00.000Z" };

  const job = buildCadPlotJob(jobInput);
  const preview = buildCadPlotPreview(jobInput);
  const pdf = await renderCadPlotPdf(job.sheets, {
    compress: false,
    titleBlocks: job.titleBlocks,
    fontUsage: job.fontUsage,
    fontByEntity: job.fontByEntity,
    strokedFamilies: job.strokedFamilies,
    ...(input.fontPrograms ? { fonts: input.fontPrograms } : {}),
    metadata: { title: "Patrón de fidelidad" },
  });

  const measurement: CadPdfMeasurement = measureCadPdf(pdf.bytes);
  const expectedPage = cadPageSize(pageSetup);
  const measuredPage = measurement.pages[0];

  // --- escala ---------------------------------------------------------------
  const unitFactor = input.unit === "m" ? 1000 : input.unit === "cm" ? 10 : 1;
  const expectedHorizontal = (input.wallLengthUnits * unitFactor) / input.scaleDenominator;
  const expectedVertical = (input.wallHeightUnits * unitFactor) / input.scaleDenominator;
  const horizontalSegment = nearestCadPdfSegment(
    measurement.segments,
    expectedHorizontal,
    (segment) => Math.abs(segment.y1 - segment.y2) < 1e-6,
  );
  const verticalSegment = nearestCadPdfSegment(
    measurement.segments,
    expectedVertical,
    (segment) => Math.abs(segment.x1 - segment.x2) < 1e-6,
  );
  const scaleCriterion =
    `El muro mide ${input.wallLengthUnits} unidades de dibujo (${input.unit ?? "mm"}); a 1:${input.scaleDenominator} ` +
    "debe medir esa longitud dividida por el denominador, en mm de papel. Se mide sobre el segmento del " +
    "flujo de contenido del PDF más próximo a esa longitud, convertido de puntos a mm con 25,4/72.";

  // --- rótulo ---------------------------------------------------------------
  const unclampedText = (input.textHeightUnits * unitFactor) / input.scaleDenominator;
  const expectedText = Math.max(
    CAD_TEXT_HEIGHT_CLAMP_MM.min,
    Math.min(CAD_TEXT_HEIGHT_CLAMP_MM.max, unclampedText),
  );
  // El rótulo del dibujo se busca por su texto. Con una fuente incrustada el
  // PDF lo escribe en hexadecimal —índices de glifo, no caracteres— y no hay
  // texto que buscar; entonces vale el PRIMER rótulo de la página, que es el
  // del modelo: el emisor dibuja las ventanas antes que el cajetín.
  const byText = measurement.labels.find((candidate) => candidate.text.includes("PLANTA"));
  const label = byText ?? measurement.labels.find((candidate) => candidate.page === 1);
  const labelCriterion = byText
    ? "el rótulo se localizó por su texto en el flujo de contenido"
    : "el texto va en hexadecimal (fuente incrustada): se tomó el primer rótulo de la página, que es el del modelo";

  // --- geometría ------------------------------------------------------------
  const expectedSegments = previewSegments(preview.sheets[0]?.strokes ?? []);
  let maxDeviation = 0;
  let sumDeviation = 0;
  let matched = 0;
  for (const expected of expectedSegments) {
    let best = Number.POSITIVE_INFINITY;
    for (const actual of measurement.segments) {
      const distance = segmentDistance(expected, actual);
      if (distance < best) best = distance;
    }
    if (!Number.isFinite(best)) continue;
    matched += 1;
    sumDeviation += best;
    maxDeviation = Math.max(maxDeviation, best);
  }

  return {
    fixture: { ...input, paperSizeMm: expectedPage },
    page: {
      expectedMm: expectedPage,
      measuredMm: measuredPage
        ? { width: measuredPage.widthMm, height: measuredPage.heightMm }
        : { width: 0, height: 0 },
      errorMm: measuredPage
        ? Math.max(
            Math.abs(measuredPage.widthMm - expectedPage.width),
            Math.abs(measuredPage.heightMm - expectedPage.height),
          )
        : Number.NaN,
    },
    horizontal: measure(expectedHorizontal, horizontalSegment?.lengthMm ?? Number.NaN, scaleCriterion),
    vertical: measure(expectedVertical, verticalSegment?.lengthMm ?? Number.NaN, scaleCriterion),
    text: {
      ...measure(
        expectedText,
        label?.sizeMm ?? Number.NaN,
        `La altura pedida (${input.textHeightUnits} unidades a 1:${input.scaleDenominator} = ${unclampedText.toFixed(3)} mm) se recorta ` +
          `al intervalo [${CAD_TEXT_HEIGHT_CLAMP_MM.min}, ${CAD_TEXT_HEIGHT_CLAMP_MM.max}] mm en el plan de publicación; ` +
          `lo medido es el operando de \`Tf\` del PDF convertido a mm — ${labelCriterion}.`,
      ),
      clamped: Math.abs(expectedText - unclampedText) > 1e-9,
      unclampedExpectedMm: unclampedText,
    },
    geometry: {
      comparedSegments: expectedSegments.length,
      matchedSegments: matched,
      maxDeviationMm: maxDeviation,
      meanDeviationMm: matched > 0 ? sumDeviation / matched : Number.NaN,
      criterion: GEOMETRY_CRITERION,
    },
    fonts: {
      declared: pdf.fonts,
      inPdf: measurement.fonts,
      substituted: pdf.fonts
        .filter((font) => font.disposition === "substituted")
        .map((font) => ({ family: font.family, substitutedBy: font.substitutedBy ?? "" })),
      embedded: pdf.fonts.filter((font) => font.disposition === "embedded").map((font) => font.family),
    },
    segmentsOutsidePage: cadPdfSegmentsOutsidePage(measurement).length,
    unreadable: measurement.unreadable,
    pdfBytes: pdf.bytes.length,
    warnings: pdf.warnings,
  };
}
