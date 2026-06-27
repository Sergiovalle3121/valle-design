/**
 * Plot a escala / paper space para el CAD (Fase 70 — láminas e impresión).
 *
 * Helpers PUROS para imprimir el layout a una escala real fija sobre una lámina
 * de tamaño estándar (A4…A0, Letter, ARCH): elige una escala "bonita" (1:50,
 * 1:100…) que quepa, transforma coordenadas del footprint a milímetros de papel,
 * y calcula el escalímetro. El editor (Codex) dibuja la lámina, el cajetín y el
 * escalímetro a partir de esto y exporta a PDF vectorial.
 *
 * Coordenadas del mundo en unidades del footprint ('mm' | 'm'); el papel siempre
 * en milímetros. Correr tests:  npx tsx src/components/line-engineering/plot-scale.spec.ts
 */
import { Point } from './precision-input';

/** Tamaños de papel en mm, orientación horizontal (ancho × alto). */
export const PAPER_SIZES = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
  A2: { w: 594, h: 420 },
  A1: { w: 841, h: 594 },
  A0: { w: 1189, h: 841 },
  Letter: { w: 279.4, h: 215.9 },
  ArchD: { w: 914.4, h: 609.6 },
} as const;

export type PaperName = keyof typeof PAPER_SIZES;

/** Escalas arquitectónicas/ingenieriles comunes (denominador del ratio 1:N). */
export const NICE_SCALES = [10, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 1500, 2000, 5000];

const toMm = (v: number, unit: string) => (unit === 'm' ? v * 1000 : v);

export interface PlotLayout {
  /** Denominador de la escala (1:scale). 1 mm de papel = `scale` mm reales. */
  scale: number;
  /** Tamaño del dibujo sobre el papel, en mm. */
  drawingWmm: number;
  drawingHmm: number;
  /** Offset del dibujo dentro del papel (centra dentro del área útil), en mm. */
  offsetXmm: number;
  offsetYmm: number;
  paper: { w: number; h: number };
}

export interface FitOptions {
  margin?: number; // margen alrededor del área útil, en mm (default 10)
  titleBlockH?: number; // alto reservado para el cajetín al pie, en mm (default 0)
}

/**
 * Elige la escala "bonita" más detallada (menor denominador) con la que el
 * footprint cabe en el área útil del papel, y centra el dibujo. Si ni la escala
 * más chica de la lista cabe, usa la más grande disponible (el dibujo se recorta
 * lo mínimo posible).
 */
export function fitScale(
  footprint: { footprintW: number; footprintH: number; unit: string },
  paperName: PaperName,
  opts: FitOptions = {},
): PlotLayout {
  const paper = PAPER_SIZES[paperName];
  const margin = opts.margin ?? 10;
  const titleBlockH = opts.titleBlockH ?? 0;
  const availW = Math.max(1, paper.w - margin * 2);
  const availH = Math.max(1, paper.h - margin * 2 - titleBlockH);

  const wMm = Math.max(1, toMm(footprint.footprintW, footprint.unit));
  const hMm = Math.max(1, toMm(footprint.footprintH, footprint.unit));

  let chosen = NICE_SCALES[NICE_SCALES.length - 1];
  for (const s of NICE_SCALES) {
    if (wMm / s <= availW && hMm / s <= availH) { chosen = s; break; }
  }

  const drawingWmm = wMm / chosen;
  const drawingHmm = hMm / chosen;
  const offsetXmm = margin + Math.max(0, (availW - drawingWmm) / 2);
  // El área útil empieza arriba del cajetín (que va al pie).
  const offsetYmm = margin + titleBlockH + Math.max(0, (availH - drawingHmm) / 2);

  return { scale: chosen, drawingWmm, drawingHmm, offsetXmm, offsetYmm, paper: { w: paper.w, h: paper.h } };
}

/**
 * Transforma un punto del footprint (en su unidad) a milímetros de papel. La Y se
 * invierte para la convención CAD (origen del footprint abajo-izquierda → papel
 * con Y hacia abajo desde la esquina superior).
 */
export function worldToPaper(p: Point, footprint: { footprintH: number; unit: string }, layout: PlotLayout): Point {
  const xMm = toMm(p.x, footprint.unit) / layout.scale;
  const yMm = toMm(p.y, footprint.unit) / layout.scale;
  return {
    x: layout.offsetXmm + xMm,
    y: layout.offsetYmm + (layout.drawingHmm - yMm), // flip Y dentro del dibujo
  };
}

export interface ScaleBar {
  /** Intervalo real (en la unidad del footprint) de cada división del escalímetro. */
  intervalReal: number;
  /** Longitud en papel (mm) de cada división. */
  intervalMm: number;
  /** Número de divisiones. */
  divisions: number;
  unit: string;
}

/**
 * Escalímetro: elige un intervalo real "redondo" cuyo dibujo mida ~`targetMm` en
 * papel (default 40 mm) y reporta divisiones para dibujarlo. Trabaja en la unidad
 * del footprint.
 */
export function scaleBar(layout: PlotLayout, unit: string, targetMm = 40, divisions = 4): ScaleBar {
  // intervalo real en mm que ocupa ~targetMm en papel: realMm = targetMm * scale
  const rawRealMm = targetMm * layout.scale;
  const rawReal = unit === 'm' ? rawRealMm / 1000 : rawRealMm;
  const nice = niceRound(rawReal);
  const niceRealMm = unit === 'm' ? nice * 1000 : nice;
  return { intervalReal: nice, intervalMm: niceRealMm / layout.scale, divisions, unit };
}

/** Redondea hacia abajo a 1/2/5 × 10^k (números "redondos" de escalímetro). */
export function niceRound(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nice = f >= 5 ? 5 : f >= 2 ? 2 : 1;
  return nice * base;
}
