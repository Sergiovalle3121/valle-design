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
import {
  CAD_DEFAULT_FONT_FAMILY,
  cadStandardFontFor,
  resolveCadPlotFonts,
  type CadPlotFontResolution,
  type CadPlotFontUsage,
} from "./plot-fonts";
import { layoutCadTitleBlock, type CadTitleBlockLayout } from "./title-block";

/** Márgenes ISO 5457 con los que se compone un cajetín sin configuración. */
const DEFAULT_PLOT_MARGINS = { top: 10, right: 10, bottom: 10, left: 20 } as const;

export { cadStandardFontFor } from "./plot-fonts";

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
  /**
   * Familias que el DIBUJO pide, con cuántos rótulos dependen de cada una.
   * Sin ellas el emisor no puede saber qué se está sustituyendo, y lo dice.
   */
  fontUsage?: readonly CadPlotFontUsage[];
  /** Familia de cada rótulo, indexada por `entityId` del plan vectorial. */
  fontByEntity?: ReadonlyMap<string, string>;
  /** Cajetín paramétrico ya colocado, por hoja. */
  titleBlocks?: readonly CadTitleBlockLayout[];
  /**
   * Hojas que NO llevan cajetín, por id. Es el caso de la portada de un juego:
   * un índice no es una lámina y no tiene número de plano ni escala.
   *
   * Se declara explícitamente en vez de deducirlo de que la hoja venga sin
   * atributos. Deducirlo dejaría sin cajetín —y sin identificar— a cualquier
   * lámina cuyo cajetín no se hubiera rellenado, que es justo la que más
   * necesita salir marcada.
   */
  sheetsWithoutTitleBlock?: readonly string[];
  metadata?: CadPlotPdfMetadata;
  /**
   * Comprimir los flujos. Se apaga en las pruebas para poder afirmar sobre el
   * contenido del PDF sin descomprimir nada.
   */
  compress?: boolean;
}

export interface CadPlotPdfFontReport extends CadPlotFontResolution {
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

const rgb = (color: string): [number, number, number] => parseHexColor(color) ?? [17, 24, 39];

/** Milímetros → puntos PostScript, que es la unidad interna del PDF. */
export const MM_TO_POINTS = 72 / 25.4;

/**
 * Familias que hay que declarar en este trazado.
 *
 * El plan vectorial no lleva la familia: quien la sabe es el documento, y por
 * eso entra por `fontUsage`. Cuando nadie la pasa se supone la implícita, pero
 * NO en silencio — la advertencia deja constancia de que el informe de fuentes
 * de ese PDF es una suposición y no una lectura del dibujo.
 */
function usageOf(
  options: CadPlotPdfOptions,
  warnings: string[],
): readonly CadPlotFontUsage[] {
  if (options.fontUsage && options.fontUsage.length > 0) return options.fontUsage;
  warnings.push(
    `Nadie declaró las familias del dibujo: el informe de fuentes supone ${CAD_DEFAULT_FONT_FAMILY} y puede no corresponderse con los estilos de texto reales.`,
  );
  return [{ family: CAD_DEFAULT_FONT_FAMILY, usageCount: 0 }];
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

  // Segunda criba, y la que de verdad protege: se PRUEBA cada fuente añadida.
  //
  // jsPDF no lanza cuando el programa de la fuente es ilegible; publica el
  // error en su bus, deja la fuente registrada con los metadatos a medias y
  // sigue. El estallido llega mucho después, dentro de `text()`, como un
  // `TypeError` sin nombre que tumba el trazado ENTERO — un plano perdido por
  // un archivo de fuente corrupto. Medir el ancho de un texto obliga a jsPDF a
  // tocar esos metadatos aquí, donde el fallo todavía tiene arreglo.
  for (const family of [...embedded.keys()]) {
    const name = embedded.get(family) as string;
    try {
      pdf.setFont(name, "normal");
      pdf.getTextWidth("Ag");
    } catch (error) {
      embedded.delete(family);
      warnings.push(
        `El programa de la fuente ${name} no es legible (${
          error instanceof Error ? error.message : String(error)
        }); se sustituye por la estándar.`,
      );
    }
  }

  /**
   * Estilos que existen de verdad para cada fuente.
   *
   * Una fuente incrustada suele traer un solo corte. Pedirle «negrita» a jsPDF
   * no falla: cambia sin avisar a Times-Bold, y el cajetín acaba impreso en una
   * tipografía que nadie eligió. Se consulta la lista y se pide lo que hay.
   */
  const registered: Record<string, string[]> = pdf.getFontList();
  const styleFor = (name: string, wanted: string): string =>
    (registered[name] ?? []).includes(wanted) ? wanted : "normal";

  // Familias que hay que declarar: las del dibujo y las que se pidió incrustar.
  const usage = usageOf(options, warnings);
  const declared = new Map(usage.map((entry) => [entry.family.trim().toLowerCase(), entry]));
  for (const program of options.fonts ?? [])
    if (!declared.has(program.family.trim().toLowerCase()))
      declared.set(program.family.trim().toLowerCase(), { family: program.family, usageCount: 0 });

  const resolutions = resolveCadPlotFonts([...declared.values()], [...embedded.values()]);
  const fontReports: CadPlotPdfFontReport[] = resolutions.map((resolution) => ({
    ...resolution,
    embedded: resolution.disposition === "embedded",
  }));

  /** Nombre de fuente de jsPDF para una familia del dibujo. */
  const byFamily = new Map(
    fontReports.map((report) => [report.family.trim().toLowerCase(), report.baseFont]),
  );
  const pickFont = (family: string | undefined): string =>
    byFamily.get((family ?? CAD_DEFAULT_FONT_FAMILY).trim().toLowerCase()) ??
    cadStandardFontFor(family ?? CAD_DEFAULT_FONT_FAMILY);
  const bodyFont = pickFont(usage[0]?.family);

  // Las sustituciones se dicen UNA A UNA y con nombre. «Se usan las fuentes
  // estándar» no sirve: lo que hace falta saber es que ISOCPEUR salió en
  // Helvetica, porque eso cambia las anchuras y descoloca las cotas.
  for (const report of fontReports)
    if (report.disposition === "substituted")
      warnings.push(
        `La fuente ${report.family} NO viaja dentro del PDF: se sustituye por la estándar ${report.substitutedBy}. Las anchuras de texto no serán las del dibujo.`,
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
  const titleBlocks = new Map(
    (options.titleBlocks ?? []).map((layout) => [layout.sheetId, layout]),
  );
  const framedOnly = new Set(options.sheetsWithoutTitleBlock ?? []);
  /** Familia de un rótulo. Los derivados llevan el id de su entidad y un sufijo. */
  const familyOf = (entityId: string): string | undefined =>
    options.fontByEntity?.get(entityId) ??
    options.fontByEntity?.get(entityId.split(":attribute:")[0]);

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
      for (const command of viewport.commands)
        drawCommand(
          pdf,
          command,
          command.kind === "text" ? pickFont(familyOf(command.entityId)) : bodyFont,
          styleFor,
        );
    }

    // Sin cajetín compuesto, se compone aquí con los atributos que la hoja ya
    // trae. Degradar a un marco vacío dejaría la lámina SIN número de plano, y
    // callado: un PDF con borde bonito y sin identificar es peor que un error.
    // La única hoja que sale sólo con marco es la que lo pide por su nombre.
    if (framedOnly.has(sheet.id)) drawPlainFrame(pdf, sheet);
    else
      drawTitleBlock(
        pdf,
        titleBlocks.get(sheet.id) ??
          layoutCadTitleBlock({
            sheetId: sheet.id,
            page: { width: sheet.width, height: sheet.height },
            margins: DEFAULT_PLOT_MARGINS,
            attributes: sheet.titleBlock,
            series: { index: index + 1, total: sheets.length },
          }),
        bodyFont,
        styleFor,
      );
  });

  const bytes = new Uint8Array(pdf.output("arraybuffer") as ArrayBuffer);

  // Última comprobación, contra el ARCHIVO: si nadie incrustó nada, el informe
  // no puede decir que sí. Se mira el PDF ya escrito, no lo que se pretendía.
  const written = inspectCadPdf(bytes);
  const lied = written.embeddedFonts === 0 && fontReports.some((report) => report.embedded);
  const fonts = lied
    ? fontReports.map((report): CadPlotPdfFontReport => {
        if (!report.embedded) return report;
        const baseFont = cadStandardFontFor(report.family);
        return {
          ...report,
          embedded: false,
          baseFont,
          disposition: "substituted",
          substitutedBy: baseFont,
        };
      })
    : fontReports;
  if (lied)
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

/** Estilo de una fuente que existe de verdad; `normal` cuando el pedido no. */
type StyleResolver = (name: string, wanted: string) => string;

function drawCommand(
  pdf: PdfLike,
  command: CadVectorCommand,
  bodyFont: string,
  styleFor: StyleResolver,
): void {
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
  pdf.setFont(
    bodyFont,
    styleFor(bodyFont, command.bold ? "bold" : command.italic ? "italic" : "normal"),
  );
  // El tamaño del plan viene en milímetros de papel; `setFontSize` habla en
  // puntos.
  pdf.setFontSize(Math.max(0.5, command.size) * MM_TO_POINTS);
  pdf.text(command.text, command.point.x, command.point.y, {
    align: command.align === "justify" ? "left" : (command.align ?? "left"),
    angle: command.rotation ? -command.rotation : undefined,
    ...(command.maxWidth ? { maxWidth: command.maxWidth } : {}),
  });
}

/** Sólo el marco. Para la hoja que declara no llevar cajetín: la portada. */
function drawPlainFrame(pdf: PdfLike, sheet: CadPublishSheet): void {
  pdf.setDrawColor(17, 24, 39);
  pdf.setLineWidth(0.5);
  pdf.rect(10, 10, sheet.width - 20, sheet.height - 20);
}

/**
 * Marco y cajetín paramétrico.
 *
 * Este emisor no DECIDE nada del cajetín: la colocación entera —dónde va la
 * caja, cuánto mide cada celda, qué tamaño tiene cada rótulo— llega ya resuelta
 * en milímetros desde `layoutCadTitleBlock`. Es lo que permite que una prueba
 * afirme que el cajetín cabe en A4 sin generar un PDF, y que lo que se afirma
 * sea exactamente lo que se imprime.
 */
function drawTitleBlock(
  pdf: PdfLike,
  layout: CadTitleBlockLayout,
  bodyFont: string,
  styleFor: StyleResolver,
): void {
  pdf.setDrawColor(17, 24, 39);
  pdf.setLineWidth(0.5);
  pdf.rect(layout.frame.x, layout.frame.y, layout.frame.width, layout.frame.height);

  pdf.setLineWidth(0.35);
  pdf.rect(layout.box.x, layout.box.y, layout.box.width, layout.box.height);
  pdf.setLineWidth(0.18);
  for (const rule of layout.rules) pdf.line(rule.x1, rule.y1, rule.x2, rule.y2);

  pdf.setTextColor(17, 24, 39);
  for (const cell of layout.cells) {
    const padding = Math.max(0.6, cell.height * 0.12);
    pdf.setFont(bodyFont, styleFor(bodyFont, "normal"));
    pdf.setFontSize(cell.labelSizeMm * MM_TO_POINTS);
    pdf.text(cell.label, cell.x + padding, cell.y + padding + cell.labelSizeMm);
    pdf.setFont(bodyFont, styleFor(bodyFont, "bold"));
    pdf.setFontSize(cell.valueSizeMm * MM_TO_POINTS);
    // El valor se recorta al ancho de su celda. Un nombre de proyecto largo que
    // se desborda pisa la celda vecina y deja el número de lámina ilegible —
    // que es justo el dato por el que se coge el plano.
    pdf.text(cell.value, cell.x + padding, cell.y + cell.height - padding, {
      maxWidth: Math.max(1, cell.width - padding * 2),
    });
  }
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
