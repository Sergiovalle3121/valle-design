/**
 * Emisión del PDF trazado.
 *
 * ## Qué garantiza
 *
 * Una página por hoja, con el `MediaBox` EXACTO del papel configurado; los
 * trazos con el color y el grosor que dictó la tabla de plumas; y un registro
 * explícito de qué fuentes lleva el archivo y cuáles van incrustadas.
 *
 * ## Fuentes, dicho con precisión
 *
 * Un PDF puede llevar una fuente de dos maneras, y las dos son legítimas:
 *
 * - **Residente**: Helvetica, Times y Courier son las catorce estándar de PDF.
 *   No van dentro del archivo porque **todo** visor conforme las tiene, así que
 *   el plano se ve idéntico en cualquier sitio sin engordar el archivo.
 * - **Incrustada**: cualquier otra familia tiene que viajar dentro o el visor
 *   la sustituirá por otra, y una sustitución cambia las anchuras y descoloca
 *   los rótulos del cajetín.
 *
 * Este emisor hace las dos. Si el anfitrión le pasa el programa de la fuente
 * (`CadPlotFontProgram`), la incrusta; si no, mapea la familia del dibujo a la
 * estándar más cercana y **lo deja escrito en el resultado**, para que quien
 * traza sepa lo que ha salido en vez de suponerlo. Nunca dice que incrustó una
 * fuente que no tenía.
 */
import type { CadPublishSheet, CadVectorCommand } from "../paper-space";
import { parseHexColor } from "./aci-palette";

export interface CadPlotFontProgram {
  /** Familia tal y como la nombra el dibujo: `Arial`, `ISOCPEUR`. */
  family: string;
  style: "normal" | "bold" | "italic" | "bolditalic";
  /** Nombre del archivo con extensión: `isocpeur.ttf`. */
  fileName: string;
  /** El programa de la fuente en base64. */
  base64: string;
}

export interface CadPlotPdfMetadata {
  title?: string;
  subject?: string;
  author?: string;
  keywords?: string;
}

export interface CadPlotPdfOptions {
  fonts?: readonly CadPlotFontProgram[];
  metadata?: CadPlotPdfMetadata;
  /**
   * Comprimir los flujos. Se apaga en las pruebas para poder afirmar sobre el
   * contenido del PDF sin descomprimir nada.
   */
  compress?: boolean;
}

export interface CadPlotPdfFontReport {
  /** Familia pedida por el dibujo. */
  family: string;
  /** Nombre con el que aparece en el PDF. */
  baseFont: string;
  embedded: boolean;
}

export interface CadPlotPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  pages: Array<{
    sheetId: string;
    name: string;
    widthMm: number;
    heightMm: number;
    orientation: "portrait" | "landscape";
  }>;
  fonts: CadPlotPdfFontReport[];
  warnings: string[];
}

/** Las catorce estándar que este emisor sabe usar sin incrustar. */
const STANDARD_FONTS: Readonly<Record<string, string>> = {
  arial: "helvetica",
  helvetica: "helvetica",
  "helvetica neue": "helvetica",
  verdana: "helvetica",
  tahoma: "helvetica",
  "segoe ui": "helvetica",
  times: "times",
  "times new roman": "times",
  georgia: "times",
  serif: "times",
  courier: "courier",
  "courier new": "courier",
  monospace: "courier",
};

/** Familia del dibujo → fuente estándar, cuando no hay programa que incrustar. */
export function cadStandardFontFor(family: string): string {
  return STANDARD_FONTS[family.trim().toLowerCase()] ?? "helvetica";
}

const rgb = (color: string): [number, number, number] => parseHexColor(color) ?? [17, 24, 39];

/** Milímetros → puntos PostScript, que es la unidad interna del PDF. */
export const MM_TO_POINTS = 72 / 25.4;

function fontsOf(sheets: readonly CadPublishSheet[]): string[] {
  // El plan vectorial no lleva la familia por mandato: los rótulos salen con la
  // fuente del estilo de texto, que el emisor resuelve por familia. Hoy se usa
  // una sola, y se declara explícitamente en vez de deducirla de nada.
  void sheets;
  return ["Arial"];
}

/**
 * Traza las hojas a un PDF.
 *
 * Asíncrona porque `jspdf` se carga bajo demanda: son ~350 kB que no tienen
 * por qué entrar en el paquete inicial de un editor que la mayoría de las
 * sesiones no usa para imprimir.
 */
export async function renderCadPlotPdf(
  sheets: readonly CadPublishSheet[],
  options: CadPlotPdfOptions = {},
): Promise<CadPlotPdfResult> {
  const warnings: string[] = [];
  if (sheets.length === 0)
    return {
      bytes: new Uint8Array(),
      pageCount: 0,
      pages: [],
      fonts: [],
      warnings: ["No hay ninguna hoja que trazar."],
    };

  const { jsPDF } = await import("jspdf");
  const first = sheets[0];
  const pdf = new jsPDF({
    orientation: first.orientation,
    unit: "mm",
    format: [first.width, first.height],
    compress: options.compress ?? true,
    putOnlyUsedFonts: true,
  });

  // --- fuentes -------------------------------------------------------------
  const embedded = new Map<string, string>();
  for (const program of options.fonts ?? []) {
    // jsPDF no LANZA cuando el programa de la fuente es basura: se traga el
    // error en su bus de eventos y sigue. Si nos fiáramos de un try/catch,
    // el informe diría «incrustada» sobre un archivo que no lleva la fuente,
    // que es la mentira más cara que puede contar un trazador.
    if (!BASE64.test(program.base64.replace(/\s+/g, ""))) {
      warnings.push(
        `El programa de la fuente ${program.family} no es base64 válido; se sustituye por la estándar.`,
      );
      continue;
    }
    try {
      pdf.addFileToVFS(program.fileName, program.base64);
      pdf.addFont(program.fileName, program.family, program.style);
      embedded.set(program.family.trim().toLowerCase(), program.family);
    } catch (error) {
      warnings.push(
        `No se pudo incrustar la fuente ${program.family}: ${
          error instanceof Error ? error.message : String(error)
        }. Se sustituye por la estándar.`,
      );
    }
  }

  // Familias que hay que declarar: las del dibujo y las que se pidió incrustar.
  const families = [
    ...new Set([
      ...fontsOf(sheets),
      ...(options.fonts ?? []).map((program) => program.family),
    ]),
  ];
  const fontReports: CadPlotPdfFontReport[] = families.map((family) => {
    const embeddedName = embedded.get(family.trim().toLowerCase());
    return {
      family,
      baseFont: embeddedName ?? cadStandardFontFor(family),
      embedded: embeddedName !== undefined,
    };
  });
  const bodyFont = fontReports.find((report) => report.embedded)?.baseFont ??
    cadStandardFontFor(fontsOf(sheets)[0] ?? "Arial");
  if (!embedded.size)
    warnings.push(
      "El PDF usa las fuentes estándar de PDF (residentes en todo visor). Para incrustar una fuente propia, pásala en `fonts`.",
    );

  const metadata = options.metadata ?? {};
  pdf.setProperties({
    title: metadata.title ?? first.name,
    subject: metadata.subject ?? "Plano trazado con Valle Design",
    author: metadata.author ?? "Valle Design",
    keywords: metadata.keywords ?? "CAD, plano, trazado",
    creator: "Valle Design",
  });

  const pages: CadPlotPdfResult["pages"] = [];

  sheets.forEach((sheet, index) => {
    if (index > 0) pdf.addPage([sheet.width, sheet.height], sheet.orientation);
    pages.push({
      sheetId: sheet.id,
      name: sheet.name,
      widthMm: sheet.width,
      heightMm: sheet.height,
      orientation: sheet.orientation,
    });

    // Fondo blanco explícito: sin él, un visor con tema oscuro enseña el plano
    // sobre negro y las líneas negras desaparecen.
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, sheet.width, sheet.height, "F");

    pdf.setLineCap("butt");
    pdf.setLineJoin("miter");

    for (const viewport of sheet.viewports) {
      for (const command of viewport.commands) drawCommand(pdf, command, bodyFont);
    }

    drawTitleBlock(pdf, sheet, bodyFont);
  });

  const bytes = new Uint8Array(pdf.output("arraybuffer") as ArrayBuffer);

  // Última comprobación, contra el ARCHIVO: si nadie incrustó nada, el informe
  // no puede decir que sí. Se mira el PDF ya escrito, no lo que se pretendía.
  const written = inspectCadPdf(bytes);
  const fonts =
    written.embeddedFonts === 0
      ? fontReports.map((report) => ({ ...report, embedded: false }))
      : fontReports;
  if (written.embeddedFonts === 0 && fontReports.some((report) => report.embedded))
    warnings.push(
      "Ninguna fuente llegó a incrustarse en el PDF; los rótulos salen con la fuente estándar.",
    );

  return { bytes, pageCount: sheets.length, pages, fonts, warnings };
}

/** Base64 canónico. Rechaza antes de que jsPDF se lo trague en silencio. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * La instancia de jsPDF, tipada sin importarla en tiempo de ejecución. El
 * módulo se carga bajo demanda dentro de `renderCadPlotPdf`, y un import
 * normal aquí arriba lo metería en el paquete inicial — que es justo lo que la
 * carga diferida evita.
 */
type PdfLike = InstanceType<typeof import("jspdf").jsPDF>;

function drawCommand(pdf: PdfLike, command: CadVectorCommand, bodyFont: string): void {
  if (command.kind === "path") {
    if (command.points.length < 2) return;
    const [r, g, b] = rgb(command.style.stroke);
    pdf.setDrawColor(r, g, b);
    pdf.setLineWidth(command.style.lineWidth);
    const points = command.points;
    // `lines` toma DELTAS desde el punto inicial: pasarle coordenadas absolutas
    // dibuja una espiral que se va de la hoja, y es el error que hace que un
    // plano trazado no se parezca a lo que hay en pantalla.
    const deltas = points
      .slice(1)
      .map((point, index) => [point.x - points[index].x, point.y - points[index].y] as [number, number]);
    if (command.closed)
      deltas.push([
        points[0].x - points[points.length - 1].x,
        points[0].y - points[points.length - 1].y,
      ]);
    pdf.lines(deltas, points[0].x, points[0].y, [1, 1], "S", false);
    return;
  }

  const [r, g, b] = rgb(command.color);
  pdf.setTextColor(r, g, b);
  pdf.setFont(bodyFont, command.bold ? "bold" : command.italic ? "italic" : "normal");
  // El tamaño del plan viene en milímetros de papel; `setFontSize` habla en
  // puntos.
  pdf.setFontSize(Math.max(0.5, command.size) * MM_TO_POINTS);
  pdf.text(command.text, command.point.x, command.point.y, {
    align: command.align === "justify" ? "left" : (command.align ?? "left"),
    angle: command.rotation ? -command.rotation : undefined,
    ...(command.maxWidth ? { maxWidth: command.maxWidth } : {}),
  });
}

/** Marco y cajetín: el borde que convierte una página en una lámina. */
function drawTitleBlock(pdf: PdfLike, sheet: CadPublishSheet, bodyFont: string): void {
  pdf.setDrawColor(17, 24, 39);
  pdf.setLineWidth(0.5);
  pdf.rect(10, 10, sheet.width - 20, sheet.height - 20);

  const entries = Object.entries(sheet.titleBlock).filter(([, value]) => value && value !== "-");
  if (entries.length === 0) return;

  const boxWidth = Math.min(180, sheet.width - 30);
  const rowHeight = 6;
  const boxHeight = Math.min(entries.length, 6) * rowHeight + 4;
  const x = sheet.width - 10 - boxWidth;
  const y = sheet.height - 10 - boxHeight;
  pdf.setLineWidth(0.35);
  pdf.rect(x, y, boxWidth, boxHeight);
  pdf.setTextColor(17, 24, 39);
  pdf.setFont(bodyFont, "normal");
  pdf.setFontSize(2.5 * MM_TO_POINTS);
  entries.slice(0, 6).forEach(([key, value], index) => {
    pdf.text(`${key}: ${value}`, x + 2, y + 5 + index * rowHeight);
  });
}

// ---------------------------------------------------------------------------
// Lectura del PDF resultante
// ---------------------------------------------------------------------------

export interface CadPdfInspection {
  pageCount: number;
  /** `MediaBox` de cada página, en MILÍMETROS. */
  pageSizesMm: Array<{ width: number; height: number }>;
  /** Nombres `/BaseFont` declarados. */
  baseFonts: string[];
  /** Fuentes con programa incrustado (`/FontFile`, `/FontFile2`, `/FontFile3`). */
  embeddedFonts: number;
}

/**
 * Inspecciona el PDF producido.
 *
 * Existe para que las pruebas afirmen sobre el ARCHIVO —tamaño de página,
 * número de páginas, fuentes presentes— y no sobre una captura de pantalla ni
 * sobre el objeto que lo generó. Un emisor que se prueba contra su propia
 * intención no prueba nada.
 */
export function inspectCadPdf(bytes: Uint8Array): CadPdfInspection {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);

  const pageSizesMm: CadPdfInspection["pageSizesMm"] = [];
  for (const match of text.matchAll(
    /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/g,
  )) {
    const width = (Number(match[3]) - Number(match[1])) / MM_TO_POINTS;
    const height = (Number(match[4]) - Number(match[2])) / MM_TO_POINTS;
    pageSizesMm.push({
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
    });
  }

  const baseFonts = [
    ...new Set([...text.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-,._]+)/g)].map((m) => m[1])),
  ].sort();

  const counted = text.match(/\/Count\s+(\d+)/);
  return {
    // `/Count` del nodo de páginas es la verdad del archivo; el número de
    // `/MediaBox` puede no coincidir si una página los hereda del padre.
    pageCount: counted ? Number(counted[1]) : pageSizesMm.length,
    pageSizesMm,
    baseFonts,
    embeddedFonts: [...text.matchAll(/\/FontFile[23]?\s/g)].length,
  };
}
