/**
 * Plano a escala con cajetín (VD-CAD-PLOT-001): el motor de "plot" que
 * cualquier usuario de AutoCAD espera — dado el tamaño real del dibujo (mm)
 * y un papel, elige la MAYOR escala estándar que quepa en el área imprimible
 * (descontando márgenes y la franja del cajetín), centra el dibujo y arma
 * los campos del cajetín y la barra de escala con tramos redondos. Módulo
 * puro: el estudio lo renderiza; aquí solo vive la matemática, testeada.
 */

export type CadPaperId = "A4" | "A3" | "A2" | "A1" | "A0" | "letter" | "tabloid";
export type CadPaperOrientation = "landscape" | "portrait";

/** Tamaños de papel en mm (ancho × alto en portrait). */
export const CAD_PAPER_SIZES: Record<CadPaperId, { w: number; h: number; label: string }> = {
  A4: { w: 210, h: 297, label: "A4" },
  A3: { w: 297, h: 420, label: "A3" },
  A2: { w: 420, h: 594, label: "A2" },
  A1: { w: 594, h: 841, label: "A1" },
  A0: { w: 841, h: 1189, label: "A0" },
  letter: { w: 216, h: 279, label: "Carta" },
  tabloid: { w: 279, h: 432, label: "Tabloide" },
};

/** Escalas estándar de dibujo técnico, de la más grande a la más chica. */
export const CAD_STANDARD_SCALES = [
  1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 250, 500, 1000,
] as const;

const MARGIN_MM = 10;
const TITLE_BLOCK_MM = 30;

export interface CadPlotInput {
  /** Bounds reales del dibujo en mm. */
  drawingW: number;
  drawingH: number;
  paper?: CadPaperId;
  orientation?: CadPaperOrientation;
  project?: string;
  client?: string;
  drawnBy?: string;
  sheetNumber?: string;
  revision?: string;
  /** Fecha del plano (inyectada; el módulo no lee el reloj). */
  date?: string;
}

export interface CadPlotSheet {
  paper: CadPaperId;
  paperLabel: string;
  orientation: CadPaperOrientation;
  /** Tamaño físico de la hoja en mm ya orientada. */
  sheetW: number;
  sheetH: number;
  /** Denominador de la escala elegida (100 → "1:100"); null si no cabe. */
  scale: number | null;
  scaleLabel: string;
  /** Área imprimible del dibujo (sin márgenes ni cajetín), en mm de hoja. */
  printable: { x: number; y: number; w: number; h: number };
  /** Colocación centrada del dibujo escalado dentro del área imprimible. */
  placement: { x: number; y: number; w: number; h: number };
  titleBlock: {
    project: string;
    client: string;
    drawnBy: string;
    date: string;
    scale: string;
    units: string;
    sheetNumber: string;
    revision: string;
  };
  /** Barra de escala: tramos de longitud redonda real y su tamaño en hoja. */
  scaleBar: { segmentMm: number; segmentSheetMm: number; segments: number; label: string } | null;
  issues: string[];
}

/** Tramo "redondo" para la barra de escala: 1/2/5 × 10^n mm reales. */
export function niceScaleBarSegment(scale: number): number {
  // Objetivo: tramo de ~20 mm en hoja → 20 × escala mm reales, redondeado
  // al 1/2/5 × 10^n más cercano por abajo.
  const target = 20 * scale;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [5, 2, 1]) {
    if (m * pow <= target) return m * pow;
  }
  return pow;
}

const fmtMeters = (mm: number) =>
  mm >= 1000 ? `${mm / 1000} m` : `${mm} mm`;

export function buildPlotSheet(input: CadPlotInput): CadPlotSheet {
  const issues: string[] = [];
  const paper = input.paper ?? "A3";
  const orientation = input.orientation ?? "landscape";
  const base = CAD_PAPER_SIZES[paper];
  const sheetW = orientation === "landscape" ? base.h : base.w;
  const sheetH = orientation === "landscape" ? base.w : base.h;

  // Área imprimible: márgenes en los 4 lados + franja del cajetín abajo.
  const printable = {
    x: MARGIN_MM,
    y: MARGIN_MM,
    w: sheetW - MARGIN_MM * 2,
    h: sheetH - MARGIN_MM * 2 - TITLE_BLOCK_MM,
  };

  const drawingW = Math.max(1, input.drawingW);
  const drawingH = Math.max(1, input.drawingH);

  // La MAYOR escala estándar (denominador más chico) donde el dibujo cabe.
  let scale: number | null = null;
  for (const s of CAD_STANDARD_SCALES) {
    if (drawingW / s <= printable.w && drawingH / s <= printable.h) {
      scale = s;
      break;
    }
  }
  if (scale === null) {
    issues.push(
      "El dibujo no cabe ni a 1:1000 en este papel; usa un papel más grande.",
    );
  }

  const placedW = scale ? drawingW / scale : 0;
  const placedH = scale ? drawingH / scale : 0;
  const placement = {
    x: printable.x + (printable.w - placedW) / 2,
    y: printable.y + (printable.h - placedH) / 2,
    w: placedW,
    h: placedH,
  };

  const scaleLabel = scale ? `1:${scale}` : "—";
  const segmentMm = scale ? niceScaleBarSegment(scale) : 0;

  return {
    paper,
    paperLabel: base.label,
    orientation,
    sheetW,
    sheetH,
    scale,
    scaleLabel,
    printable,
    placement,
    titleBlock: {
      project: input.project?.trim() || "Proyecto sin nombre",
      client: input.client?.trim() || "—",
      drawnBy: input.drawnBy?.trim() || "—",
      date: input.date?.trim() || "—",
      scale: scaleLabel,
      units: "mm",
      sheetNumber: input.sheetNumber?.trim() || "01",
      revision: input.revision?.trim() || "A",
    },
    scaleBar: scale
      ? {
          segmentMm,
          segmentSheetMm: segmentMm / scale,
          segments: 4,
          label: fmtMeters(segmentMm),
        }
      : null,
    issues,
  };
}
