/**
 * El trabajo de trazado: del documento a hojas listas para emitir.
 *
 * ## Las tres cosas que pasan aquí y en este orden
 *
 * 1. **Se construye el plan vectorial** con `buildCadPublishPlan`, que ya sabe
 *    proyectar el modelo por cada ventana, resolver bloques anidados, cotas
 *    asociativas y directrices. No se reimplementa nada de eso.
 * 2. **Se filtran las ventanas apagadas.** `MVIEW OFF` conserva el encuadre
 *    pero no dibuja, y el plan no lo sabe.
 * 3. **Se aplica la tabla de plumas.** Aquí es donde «color 7» se convierte en
 *    «negro de 0,25 mm».
 *
 * ## Por qué el plan se pide siempre a COLOR
 *
 * `buildCadPublishPlan` aplasta todo a un gris cuando la hoja está en
 * monocromo, y eso destruye la información que una CTB necesita: la tabla se
 * indexa POR COLOR, así que con todo aplastado los 255 estilos colapsan en
 * uno. Se pide siempre a color y el monocromo se aplica DESPUÉS, que además es
 * el orden correcto — en AutoCAD el modo de color es una propiedad de la
 * configuración de página, no del dibujo.
 */
import type { CadDocument, CadPaperSpace } from "../cad-document";
import {
  buildCadPublishPlan,
  type CadPublishPlan,
  type CadPublishSheet,
  type CadPublishViewport,
  type CadVectorCommand,
} from "../paper-space";
import { cadViewportIsOn } from "../layout/viewport-operations";
import { toGrayscaleHex } from "./aci-palette";
import { cadDocumentFontByEntity, type CadPlotFontUsage } from "./plot-fonts";
import {
  layoutCadTitleBlock,
  type CadTitleBlockFields,
  type CadTitleBlockLayout,
} from "./title-block";
import {
  resolveCadPlotStyle,
  type CadPlotStyleTable,
} from "./plot-style-table";
import {
  cadPageSize,
  cadPrintableArea,
  preflightCadPageSetup,
  resolveCadPlotArea,
  type CadPageSetup,
  type CadPageSetupIssue,
  type CadPlotAreaSources,
} from "./page-setup";

export interface CadPlotJobInput {
  document: CadDocument;
  /** Presentaciones a trazar, en orden. Vacío = todas las publicables. */
  layoutIds?: readonly string[];
  pageSetup: CadPageSetup;
  plotStyleTable?: CadPlotStyleTable | null;
  /** Marca de tiempo del manifiesto. Fija en las pruebas para que sea estable. */
  generatedAt?: string;
  /**
   * Datos del cajetín que sólo sabe quien publica: la fecha, el autor, y el
   * número de lámina cuando viene de un conjunto de planos. Todo lo demás sale
   * de la presentación y de sus ventanas.
   */
  titleBlock?: Partial<CadTitleBlockFields>;
  /**
   * Número de lámina de cada hoja dentro de la SERIE, y cuántas son.
   *
   * Sin esto, la serie es el propio trabajo de trazado y se numera 1..N. Un
   * conjunto de planos que publica un subconjunto tiene que pasar el total
   * verdadero: «3/6» impreso en una tirada de tres láminas es una mentira que
   * llega hasta obra.
   */
  series?: {
    numbersBySheetId?: ReadonlyMap<string, string>;
    /** Posición 1-based de cada hoja en la serie COMPLETA, no en este trabajo. */
    indexBySheetId?: ReadonlyMap<string, number>;
    total?: number;
  };
}

export interface CadPlotJob {
  sheets: CadPublishSheet[];
  plan: CadPublishPlan;
  issues: CadPageSetupIssue[];
  /** Ventanas omitidas por estar apagadas, con su hoja. */
  skippedViewports: Array<{ sheetId: string; viewportId: string }>;
  /** Milímetros de papel de cada hoja, ya orientados por la configuración. */
  pageSize: { width: number; height: number };
  /** Cajetín de cada hoja, resuelto y colocado en mm de papel. */
  titleBlocks: CadTitleBlockLayout[];
  /** Familias que piden los rótulos trazados, con su recuento. */
  fontUsage: CadPlotFontUsage[];
  /** Familia de cada rótulo, por `entityId`, para que el emisor la respete. */
  fontByEntity: Map<string, string>;
}

/**
 * Documento equivalente con las hojas forzadas a color.
 *
 * Se copia SÓLO la sección de presentaciones —el resto viaja por referencia—
 * porque un `structuredClone` de un documento de cien mil entidades para
 * cambiar un campo por hoja es el tipo de coste que no se nota hasta que el
 * dibujo es grande.
 */
function withColorSheets(document: CadDocument, layoutIds?: readonly string[]): CadDocument {
  const wanted = layoutIds && layoutIds.length > 0 ? new Set(layoutIds) : null;
  return {
    ...document,
    paperSpaces: document.paperSpaces.map((space): CadPaperSpace => {
      const included = wanted ? wanted.has(space.id) : space.includeInPublish !== false;
      return {
        ...space,
        includeInPublish: included,
        pageSetup: space.pageSetup
          ? { ...space.pageSetup, colorMode: "color" }
          : undefined,
      };
    }),
  };
}

function styleCommand(
  command: CadVectorCommand,
  table: CadPlotStyleTable | null,
  setup: CadPageSetup,
): CadVectorCommand {
  const monochrome = setup.colorMode === "monochrome";
  const weightScale = setup.plotLineweights ? Math.max(0.01, setup.lineweightScale) : 0;

  // La imagen no tiene pluma: pasa tal cual (Ola H).
  if (command.kind === "image") return command;
  if (command.kind === "text") {
    const resolved = resolveCadPlotStyle(table, { color: command.color });
    const color = monochrome ? toGrayscaleHex(resolved.color) : resolved.color;
    return { ...command, color: monochrome ? "#000000" : color };
  }

  const resolved = resolveCadPlotStyle(table, {
    color: command.style.stroke,
    lineweight: command.style.lineWidth,
  });
  // Un grosor de 0 significa «el más fino que sepa el trazador». En papel eso
  // es una línea de pelo, no una línea invisible: 0,05 mm, que es el mínimo de
  // la tabla de grosores de AutoCAD.
  const lineWidth =
    weightScale === 0
      ? 0.05
      : Math.max(0.05, (resolved.lineweight || command.style.lineWidth) * weightScale);
  return {
    ...command,
    style: {
      ...command.style,
      stroke: monochrome ? toGrayscaleHex(resolved.color) : resolved.color,
      lineWidth,
    },
  };
}

/**
 * Fuentes de área de trazado de una hoja concreta.
 *
 * La zona imprimible es la de la CONFIGURACIÓN de página, no la de la hoja del
 * esquema: PAGESETUP puede cambiar el papel de A3 a A1 sin tocar la
 * presentación, y trazar sobre el papel viejo saldría recortado.
 */
export function cadPlotAreaSources(
  setup: CadPageSetup,
  extents: { minX: number; minY: number; maxX: number; maxY: number } | null,
  display: { minX: number; minY: number; maxX: number; maxY: number } | null = null,
): CadPlotAreaSources {
  const printable = cadPrintableArea(setup);
  return {
    layout: {
      minX: printable.x,
      minY: printable.y,
      maxX: printable.x + printable.width,
      maxY: printable.y + printable.height,
    },
    extents,
    // El esquema no guarda LIMITS; la envolvente es la mejor referencia que hay
    // y decirlo aquí evita que `PLOT Límites` finja un rectángulo inventado.
    limits: extents,
    display,
  };
}

export function buildCadPlotJob(input: CadPlotJobInput): CadPlotJob {
  const document = withColorSheets(input.document, input.layoutIds);
  const plan = buildCadPublishPlan(document, input.generatedAt);
  const table = input.plotStyleTable ?? null;
  const skippedViewports: CadPlotJob["skippedViewports"] = [];

  const spacesById = new Map(document.paperSpaces.map((space) => [space.id, space]));
  const pageSize = cadPageSize(input.pageSetup);

  const sheets = plan.sheets.map((sheet): CadPublishSheet => {
    const space = spacesById.get(sheet.id);
    const off = new Set(
      (space?.viewports ?? []).filter((viewport) => !cadViewportIsOn(viewport)).map((v) => v.id),
    );
    for (const viewportId of off) skippedViewports.push({ sheetId: sheet.id, viewportId });
    const viewports = sheet.viewports
      .filter((viewport) => !off.has(viewport.id))
      .map(
        (viewport): CadPublishViewport => ({
          ...viewport,
          commands: viewport.commands.map((command) =>
            styleCommand(command, table, input.pageSetup),
          ),
        }),
      );
    return {
      ...sheet,
      // El papel de la CONFIGURACIÓN manda sobre el de la hoja.
      width: pageSize.width,
      height: pageSize.height,
      orientation: input.pageSetup.orientation,
      colorMode: input.pageSetup.colorMode,
      lineweightScale: input.pageSetup.lineweightScale,
      viewports,
    };
  });

  // --- cajetines -----------------------------------------------------------
  // La serie por defecto es el propio trabajo: seis presentaciones trazadas
  // juntas son «1/6 … 6/6». Quien publica un conjunto pasa el total verdadero.
  const total = input.series?.total ?? sheets.length;
  const titleBlocks = sheets.map((sheet, index) => {
    const space = spacesById.get(sheet.id);
    const number = input.series?.numbersBySheetId?.get(sheet.id);
    return layoutCadTitleBlock({
      sheetId: sheet.id,
      page: pageSize,
      margins: input.pageSetup.margins,
      ...(space ? { layout: space } : {}),
      series: {
        index: input.series?.indexBySheetId?.get(sheet.id) ?? index + 1,
        total,
        ...(number ? { number } : {}),
      },
      viewportScales: (space?.viewports ?? []).map((viewport) => `1:${viewport.scale}`),
      units: document.meta.unit,
      ...(input.titleBlock ? { overrides: input.titleBlock } : {}),
    });
  });

  // --- fuentes -------------------------------------------------------------
  const fontByEntity = cadDocumentFontByEntity(document);
  const counts = new Map<string, CadPlotFontUsage>();
  for (const sheet of sheets)
    for (const viewport of sheet.viewports)
      for (const command of viewport.commands) {
        if (command.kind !== "text") continue;
        const family =
          fontByEntity.get(command.entityId) ??
          fontByEntity.get(command.entityId.split(":attribute:")[0]) ??
          "Arial";
        const entry = counts.get(family) ?? { family, usageCount: 0 };
        entry.usageCount += 1;
        counts.set(family, entry);
      }
  // Un dibujo sin un solo rótulo sigue teniendo cajetín, y el cajetín lleva
  // texto: la familia implícita se declara aunque el modelo no la use.
  if (counts.size === 0) counts.set("Arial", { family: "Arial", usageCount: 0 });

  return {
    sheets,
    plan,
    issues: preflightCadPageSetup(
      input.pageSetup,
      cadPlotAreaSources(input.pageSetup, null),
      input.plotStyleTable ? [input.plotStyleTable.name] : [],
    ),
    skippedViewports,
    pageSize,
    titleBlocks,
    fontUsage: [...counts.values()].sort((a, b) => a.family.localeCompare(b.family, "es")),
    fontByEntity,
  };
}

// ---------------------------------------------------------------------------
// Vista previa
// ---------------------------------------------------------------------------

export interface CadPlotPreviewSheet {
  sheetId: string;
  name: string;
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  printable: { x: number; y: number; width: number; height: number };
  /** Trazos ya coloreados y con su grosor final, en mm de papel. */
  strokes: Array<{
    points: { x: number; y: number }[];
    closed: boolean;
    color: string;
    lineWidth: number;
  }>;
  labels: Array<{ x: number; y: number; text: string; size: number; color: string }>;
}

export interface CadPlotPreview {
  sheets: CadPlotPreviewSheet[];
  issues: CadPageSetupIssue[];
  /** Área resuelta; `null` si el área pedida no existe en este dibujo. */
  area: ReturnType<typeof resolveCadPlotArea>;
}

/**
 * Vista previa antes de trazar.
 *
 * Es la MISMA geometría que va al PDF, con los mismos colores y los mismos
 * grosores — no una aproximación pintada aparte. Una previa que se calcula por
 * otro camino miente justo en lo que se está mirando: si el grosor del PDF
 * sale de la CTB y el de la previa del color de la capa, la previa dice que
 * todo está bien y el papel dice que no.
 */
export function buildCadPlotPreview(input: CadPlotJobInput): CadPlotPreview {
  const job = buildCadPlotJob(input);
  const printable = cadPrintableArea(input.pageSetup);
  const sheets = job.sheets.map((sheet): CadPlotPreviewSheet => {
    const strokes: CadPlotPreviewSheet["strokes"] = [];
    const labels: CadPlotPreviewSheet["labels"] = [];
    for (const viewport of sheet.viewports)
      for (const command of viewport.commands) {
        if (command.kind === "path")
          strokes.push({
            points: command.points,
            closed: command.closed,
            color: command.style.stroke,
            lineWidth: command.style.lineWidth,
          });
        else if (command.kind === "text")
          labels.push({
            x: command.point.x,
            y: command.point.y,
            text: command.text,
            size: command.size,
            color: command.color,
          });
      }
    return {
      sheetId: sheet.id,
      name: sheet.name,
      width: sheet.width,
      height: sheet.height,
      orientation: sheet.orientation,
      printable,
      strokes,
      labels,
    };
  });
  return {
    sheets,
    issues: job.issues,
    area: resolveCadPlotArea(
      input.pageSetup.area,
      cadPlotAreaSources(input.pageSetup, null),
    ),
  };
}
