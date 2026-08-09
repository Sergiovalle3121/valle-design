/**
 * Configuración de página y área de trazado — el modelo de PAGESETUP y PLOT.
 *
 * ## Qué decide este archivo
 *
 * Trazar es responder cuatro preguntas y no más: **qué papel**, **qué trozo del
 * dibujo**, **a qué escala** y **dónde sobre la hoja**. Cada una tiene una
 * respuesta numérica exacta, y de que sean exactas depende que el plano salga
 * a 1:50 de verdad y no «más o menos a 1:50».
 *
 * Todo lo de aquí es aritmética pura sobre milímetros de papel y unidades de
 * dibujo. No hay PDF, ni canvas, ni documento: entran unos límites y una
 * configuración, sale una colocación. El emisor de PDF consume el resultado.
 *
 * ## Dónde se guarda cada cosa, y por qué
 *
 * `CadPaperSpace.pageSetup` del esquema guarda papel, márgenes, modo de color
 * y escala de grosores. Eso persiste tal cual, por la ruta canónica de
 * mutación. Lo demás —área, escala, centrado, desfase— es **decisión de
 * trazado**, no propiedad de la presentación: viaja en la petición de PLOT y
 * se deriva de la presentación cuando no se dice otra cosa. La única excepción
 * es la tabla de plumas, que sí tiene que sobrevivir a cerrar el programa
 * porque un plano trazado sin su CTB es papel tirado; se guarda en un atributo
 * RESERVADO del cajetín (`PLOT_STYLE_TABLE`), que es el único bolsillo de
 * cadenas que la presentación tiene y donde además ese dato suele imprimirse.
 */
import type { CadPoint2 } from "../cad-document";
import type { CadBounds } from "../entity-runtime";
import { CAD_SHEET_PAPERS, type CadSheetPaper } from "../paper-space";

/** Atributo del cajetín donde persiste el nombre de la tabla de plumas. */
export const CAD_PLOT_STYLE_TABLE_ATTRIBUTE = "PLOT_STYLE_TABLE";

export type CadPlotAreaKind = "layout" | "extents" | "window" | "limits" | "display";

export type CadPlotArea =
  | { kind: "layout" | "extents" | "limits" | "display" }
  | { kind: "window"; corner1: CadPoint2; corner2: CadPoint2 };

/**
 * Escala de trazado. `fit` es «ajustar a la hoja», que calcula el factor; el
 * resto es una razón EXPLÍCITA papel:dibujo, que es como se pide un plano.
 *
 * `1:50` sobre un dibujo en milímetros es `{ paperMm: 1, drawingUnits: 50 }`.
 */
export type CadPlotScale =
  | { kind: "fit" }
  | { kind: "ratio"; paperMm: number; drawingUnits: number };

export interface CadPageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CadPageSetup {
  /** Nombre del setup. `""` para el implícito de la presentación. */
  name: string;
  paper: CadSheetPaper | "custom";
  /** Sólo con `paper: "custom"`. Milímetros, en orientación vertical. */
  customSize?: { width: number; height: number };
  orientation: "portrait" | "landscape";
  margins: CadPageMargins;
  area: CadPlotArea;
  scale: CadPlotScale;
  /** Centra el área trazada en la zona imprimible. Anula el desfase. */
  centered: boolean;
  /** Desfase respecto de la esquina imprimible, en mm. */
  offset: CadPoint2;
  /** Nombre de la tabla de plumas (`.ctb` o `.stb`). `null` = sin tabla. */
  plotStyleTable: string | null;
  colorMode: "color" | "monochrome";
  lineweightScale: number;
  /** Trazar los grosores de línea. Apagarlo saca todo a un grosor fino. */
  plotLineweights: boolean;
  plotTransparency: boolean;
}

export interface CadPlotRequest {
  layoutId: string;
  pageSetup: CadPageSetup;
  /** Nombre del archivo, sin extensión. */
  fileName: string;
  /** Copias. Una petición de vista previa siempre vale 1. */
  copies: number;
}

/** Tamaño real de la hoja, ya orientada, en milímetros. */
export function cadPageSize(setup: CadPageSetup): { width: number; height: number } {
  const base =
    setup.paper === "custom"
      ? (setup.customSize ?? { width: 210, height: 297 })
      : CAD_SHEET_PAPERS[setup.paper];
  return setup.orientation === "portrait"
    ? { width: base.width, height: base.height }
    : { width: base.height, height: base.width };
}

/** Zona imprimible: la hoja menos los márgenes. En milímetros. */
export function cadPrintableArea(setup: CadPageSetup): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const page = cadPageSize(setup);
  return {
    x: setup.margins.left,
    y: setup.margins.top,
    width: Math.max(1, page.width - setup.margins.left - setup.margins.right),
    height: Math.max(1, page.height - setup.margins.top - setup.margins.bottom),
  };
}

export interface CadPlotAreaSources {
  /** Envolvente de la PRESENTACIÓN, en mm de papel: la hoja imprimible. */
  layout: CadBounds;
  /** Envolvente de todo lo dibujado, en unidades de dibujo. */
  extents: CadBounds | null;
  /** Límites del dibujo, en unidades de dibujo. */
  limits: CadBounds | null;
  /** Lo que se ve ahora en pantalla, en unidades de dibujo. */
  display: CadBounds | null;
}

export interface CadPlotAreaResolution {
  bounds: CadBounds;
  /**
   * En qué está medida `bounds`. `paper` para el área «Presentación», que ya
   * viene en milímetros y por tanto NO se vuelve a escalar; `drawing` para las
   * demás. Confundirlas es el error que saca un plano mil veces más grande.
   */
  space: "paper" | "drawing";
  kind: CadPlotAreaKind;
}

/**
 * Qué trozo se traza. Devuelve `null` cuando el área pedida no existe —un
 * dibujo vacío no tiene extensión, un dibujo sin LIMITS no tiene límites— para
 * que PLOT lo diga en vez de trazar una hoja en blanco.
 */
export function resolveCadPlotArea(
  area: CadPlotArea,
  sources: CadPlotAreaSources,
): CadPlotAreaResolution | null {
  switch (area.kind) {
    case "layout":
      return { bounds: sources.layout, space: "paper", kind: "layout" };
    case "extents":
      return sources.extents ? { bounds: sources.extents, space: "drawing", kind: "extents" } : null;
    case "limits":
      return sources.limits ? { bounds: sources.limits, space: "drawing", kind: "limits" } : null;
    case "display":
      return sources.display ? { bounds: sources.display, space: "drawing", kind: "display" } : null;
    case "window": {
      const bounds = {
        minX: Math.min(area.corner1.x, area.corner2.x),
        minY: Math.min(area.corner1.y, area.corner2.y),
        maxX: Math.max(area.corner1.x, area.corner2.x),
        maxY: Math.max(area.corner1.y, area.corner2.y),
      };
      if (!(bounds.maxX > bounds.minX) || !(bounds.maxY > bounds.minY)) return null;
      return { bounds, space: "drawing", kind: "window" };
    }
  }
}

export interface CadPlotPlacement {
  /** Milímetros de papel por unidad de dibujo. */
  mmPerDrawingUnit: number;
  /** Esquina inferior izquierda del área trazada, en mm desde el borde. */
  origin: CadPoint2;
  /** Tamaño del área trazada sobre el papel, en mm. */
  size: { width: number; height: number };
  /** Zona imprimible, para que el emisor recorte. */
  printable: { x: number; y: number; width: number; height: number };
  /** `true` si a la escala pedida el dibujo no cabe en la zona imprimible. */
  overflows: boolean;
  /** La escala efectiva como razón 1:n, redondeada a seis cifras. */
  effectiveRatio: number;
}

/**
 * Coloca el área sobre la hoja.
 *
 * `mmPerDrawingUnit` es la cantidad que lo gobierna todo: a 1:50 con el dibujo
 * en milímetros vale 0,02, y multiplicando por ella cualquier longitud del
 * dibujo se obtiene su longitud sobre el papel. Que sea UNA cantidad explícita
 * —y no un ajuste implícito repartido por el emisor— es lo que permite afirmar
 * en una prueba que un muro de 5 m sale a 100 mm.
 */
export function computeCadPlotPlacement(
  setup: CadPageSetup,
  resolution: CadPlotAreaResolution,
  unitFactorMm = 1,
): CadPlotPlacement {
  const printable = cadPrintableArea(setup);
  const { bounds } = resolution;
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-9);

  // El área «Presentación» ya está en milímetros: escalarla otra vez la
  // multiplicaría por el factor de unidades del dibujo.
  const toMm = resolution.space === "paper" ? 1 : unitFactorMm;

  let mmPerDrawingUnit: number;
  if (setup.scale.kind === "fit") {
    mmPerDrawingUnit = Math.min(
      printable.width / (spanX * toMm),
      printable.height / (spanY * toMm),
    ) * toMm;
  } else {
    const { paperMm, drawingUnits } = setup.scale;
    mmPerDrawingUnit =
      drawingUnits > 0 && paperMm > 0 ? (paperMm / drawingUnits) * toMm : toMm;
  }

  const width = spanX * mmPerDrawingUnit;
  const height = spanY * mmPerDrawingUnit;
  const origin = setup.centered
    ? {
        x: printable.x + (printable.width - width) / 2,
        y: printable.y + (printable.height - height) / 2,
      }
    : { x: printable.x + setup.offset.x, y: printable.y + setup.offset.y };

  return {
    mmPerDrawingUnit,
    origin,
    size: { width, height },
    printable,
    overflows: width > printable.width + 1e-6 || height > printable.height + 1e-6,
    effectiveRatio:
      mmPerDrawingUnit > 0 ? Math.round((toMm / mmPerDrawingUnit) * 1e6) / 1e6 : 0,
  };
}

/**
 * Punto del dibujo → punto del papel, en milímetros desde la esquina inferior
 * izquierda de la hoja.
 *
 * Es la única transformación del trazado, y por eso vive suelta: el emisor de
 * PDF, la vista previa y las pruebas usan exactamente ésta.
 */
export function cadPlotProject(
  placement: CadPlotPlacement,
  resolution: CadPlotAreaResolution,
  point: CadPoint2,
): CadPoint2 {
  return {
    x: placement.origin.x + (point.x - resolution.bounds.minX) * placement.mmPerDrawingUnit,
    y: placement.origin.y + (point.y - resolution.bounds.minY) * placement.mmPerDrawingUnit,
  };
}

const DEFAULT_MARGINS: CadPageMargins = { top: 10, right: 10, bottom: 10, left: 10 };

/**
 * Configuración por defecto de una presentación: lo que PAGESETUP muestra la
 * primera vez que se abre.
 *
 * Traza la PRESENTACIÓN a 1:1 y centrada, que es lo correcto: en espacio papel
 * el dibujo ya viene a escala dentro de sus ventanas, y volver a escalarlo
 * sería escalar dos veces.
 */
export function defaultCadPageSetup(input: {
  paper?: CadSheetPaper | "custom";
  customSize?: { width: number; height: number };
  orientation?: "portrait" | "landscape";
  margins?: CadPageMargins;
  colorMode?: "color" | "monochrome";
  lineweightScale?: number;
  plotStyleTable?: string | null;
} = {}): CadPageSetup {
  return {
    name: "",
    paper: input.paper ?? "A3",
    ...(input.customSize ? { customSize: input.customSize } : {}),
    orientation: input.orientation ?? "landscape",
    margins: input.margins ?? DEFAULT_MARGINS,
    area: { kind: "layout" },
    scale: { kind: "ratio", paperMm: 1, drawingUnits: 1 },
    centered: true,
    offset: { x: 0, y: 0 },
    plotStyleTable: input.plotStyleTable ?? null,
    colorMode: input.colorMode ?? "monochrome",
    lineweightScale: input.lineweightScale ?? 1,
    plotLineweights: true,
    plotTransparency: false,
  };
}

export interface CadPageSetupIssue {
  code:
    | "unknown_area"
    | "overflows_printable_area"
    | "invalid_scale"
    | "empty_printable_area"
    | "missing_plot_style_table";
  severity: "warning" | "error";
  detail: string;
}

/**
 * Comprobación previa al trazado.
 *
 * Existe porque los tres fallos que arruinan una tirada —el área no existe, la
 * escala no cabe, la tabla de plumas no está— son silenciosos: el PDF sale, y
 * el error se descubre en papel. Devolverlos ANTES es la diferencia entre una
 * advertencia y una carpeta de planos mal trazados.
 */
export function preflightCadPageSetup(
  setup: CadPageSetup,
  sources: CadPlotAreaSources,
  knownPlotStyleTables: readonly string[] = [],
  unitFactorMm = 1,
): CadPageSetupIssue[] {
  const issues: CadPageSetupIssue[] = [];
  const printable = cadPrintableArea(setup);
  if (!(printable.width > 1) || !(printable.height > 1))
    issues.push({
      code: "empty_printable_area",
      severity: "error",
      detail: "Los márgenes no dejan zona imprimible.",
    });

  if (setup.scale.kind === "ratio" && !(setup.scale.paperMm > 0 && setup.scale.drawingUnits > 0))
    issues.push({
      code: "invalid_scale",
      severity: "error",
      detail: "La escala de trazado tiene un término no positivo.",
    });

  const resolution = resolveCadPlotArea(setup.area, sources);
  if (!resolution) {
    issues.push({
      code: "unknown_area",
      severity: "error",
      detail: `El área de trazado «${setup.area.kind}» no está definida en este dibujo.`,
    });
  } else {
    const placement = computeCadPlotPlacement(setup, resolution, unitFactorMm);
    if (placement.overflows)
      issues.push({
        code: "overflows_printable_area",
        severity: "warning",
        detail: `A 1:${placement.effectiveRatio} el área trazada mide ${placement.size.width.toFixed(1)} × ${placement.size.height.toFixed(1)} mm y no cabe en ${printable.width} × ${printable.height} mm.`,
      });
  }

  if (setup.plotStyleTable && !knownPlotStyleTables.includes(setup.plotStyleTable))
    issues.push({
      code: "missing_plot_style_table",
      severity: "error",
      detail: `La tabla de plumas «${setup.plotStyleTable}» no está cargada; los grosores saldrían por defecto.`,
    });

  return issues;
}
