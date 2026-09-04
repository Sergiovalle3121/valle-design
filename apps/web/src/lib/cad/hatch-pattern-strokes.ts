/**
 * Del patrón resuelto (`hatch-pattern-table.ts`) a los TRAZOS: una familia
 * de líneas de barrido por familia del patrón, con sus trazos y puntos, y
 * la misma geometría escrita como renglones de definición DXF.
 *
 * Es el único generador: lo llaman el adaptador de pantalla, el plan de
 * publicación y el escritor DXF, así que los tres no pueden discrepar. La
 * fase de los trazos se calcula desde el origen de la familia y se corre
 * `shift` por fila: es lo que hace que un ladrillo quede a soga en vez de en
 * columnas, y que dos sombreados vecinos con el mismo origen casen.
 */
import { hatchPolygon, type HatchSegment } from "./hatch";
import { hatchRegionContainsPoint } from "./hatch-associativity";
import type { CadPoint2 } from "./cad-document";
import { cadHatchFamilies, type CadHatchResolvedFamily } from "./hatch-pattern-table";

/** Un punto (0 en la secuencia) mide esta fracción de la separación de ANSI31: un segmento de longitud cero no se pinta. */
export const CAD_HATCH_DOT_LENGTH_RATIO = 0.08;

export interface CadHatchPatternInput {
  pattern: string;
  angle?: number;
  origin?: CadPoint2;
  islandStyle?: "normal" | "outer" | "ignore";
}

export interface CadHatchPatternStrokes {
  strokes: HatchSegment[];
  known: boolean;
  /** Líneas de barrido generadas antes de trocearlas en trazos. */
  lineCount: number;
}

/** Cuántas líneas de barrido producirá como mucho el patrón sobre una diagonal dada. */
export function cadHatchPatternLineEstimate(pattern: string, angle: number | undefined, scale: number, diagonal: number): number {
  return cadHatchFamilies(pattern, angle, scale).families.reduce(
    (total, family) => total + Math.ceil(diagonal / Math.max(family.spacing, 1e-9)),
    0,
  );
}

/**
 * Trocea una cuerda en trazos según la secuencia, empezando en `phase`
 * (distancia ya recorrida en el patrón al llegar a `a`). Los puntos salen con
 * longitud `dot`.
 */
export function cadHatchDashChord(
  a: CadPoint2,
  b: CadPoint2,
  dash: readonly number[],
  phase: number,
  dot: number,
): HatchSegment[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length <= 1e-9) return [];
  const elements = dash.map((value) => ({ length: value === 0 ? dot : Math.abs(value), paint: value >= 0 }));
  const period = elements.reduce((sum, element) => sum + element.length, 0);
  if (period <= 1e-9) return [{ a, b }];
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const at = (d: number): CadPoint2 => ({ x: a.x + dir.x * d, y: a.y + dir.y * d });
  const out: HatchSegment[] = [];
  let local = ((phase % period) + period) % period;
  let index = 0;
  while (local >= elements[index].length) {
    local -= elements[index].length;
    index = (index + 1) % elements.length;
  }
  let pos = 0;
  let remaining = elements[index].length - local;
  while (pos < length - 1e-9) {
    const take = Math.min(remaining, length - pos);
    if (elements[index].paint && take > 1e-9) out.push({ a: at(pos), b: at(pos + take) });
    pos += take;
    index = (index + 1) % elements.length;
    remaining = elements[index].length;
  }
  return out;
}

/**
 * Los trazos de un sombreado: para cada familia, líneas de barrido del
 * contorno exterior, filtradas por las islas en su punto medio (la regla de
 * siempre) y troceadas si la familia lleva secuencia.
 */
/**
 * Trocear en guiones cuando el guión es SUBPÍXEL es coste sin dibujo.
 *
 * MEDIDO en `architecture@100k`: un `AR-CONC` de 652 unidades de diagonal
 * produce 24.004 trazos, y son guiones, no líneas: mediana 0,543 unidades. A
 * 320 px aparentes —el TOPE del escalón medio, el hatch más grande que llega
 * aquí— ese guión mide **0,27 px**, y a 100 px mide 0,083 px. Un guión de un
 * cuarto de píxel no se ve como guión: se ve como la línea continua sobre la
 * que está.
 *
 * Así que por debajo de ese escalón se dibuja la línea ENTERA en vez de sus
 * guiones. Es el mismo criterio que el producto ya acepta para las curvas —la
 * flecha de la cuerda por debajo del píxel— aplicado a lo largo de la línea en
 * vez de a través de ella.
 *
 * Lo que NO se toca es el ESPACIADO entre líneas. Ensancharlo sí cambia el
 * dibujo, se probó en una ola anterior y el golden 47 lo cazó con razón. Aquí
 * las líneas son las mismas, en el mismo sitio: sólo se deja de partirlas donde
 * la partición no se puede ver.
 */
export function cadHatchPatternStrokes(
  boundaries: readonly CadPoint2[][],
  entity: CadHatchPatternInput,
  scale: number,
  options: { collapseDashes?: boolean } = {},
): CadHatchPatternStrokes {
  const outer = boundaries[0];
  if (!outer || outer.length < 3) return { strokes: [], known: true, lineCount: 0 };
  const { families, known } = cadHatchFamilies(entity.pattern, entity.angle, scale);
  const origin = entity.origin ?? { x: 0, y: 0 };
  const dot = scale * CAD_HATCH_DOT_LENGTH_RATIO;
  const strokes: HatchSegment[] = [];
  let lineCount = 0;
  for (const family of families) {
    const rad = (family.angle * Math.PI) / 180;
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    const normal = { x: -dir.y, y: dir.x };
    const familyOrigin = { x: origin.x + normal.x * family.perp, y: origin.y + normal.y * family.perp };
    const chords = hatchPolygon(outer as CadPoint2[], { angle: family.angle, spacing: family.spacing, origin: familyOrigin }).filter((segment) => {
      const midpoint = { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 };
      return hatchRegionContainsPoint(boundaries, midpoint, entity.islandStyle ?? "normal");
    });
    lineCount += chords.length;
    if (!family.dash || options.collapseDashes) {
      strokes.push(...chords);
      continue;
    }
    for (const chord of chords) {
      const dx = chord.a.x - familyOrigin.x;
      const dy = chord.a.y - familyOrigin.y;
      const row = Math.round((dx * normal.x + dy * normal.y) / family.spacing);
      const along = dx * dir.x + dy * dir.y;
      strokes.push(...cadHatchDashChord(chord.a, chord.b, family.dash, along - row * family.shift, dot));
    }
  }
  return { strokes, known, lineCount };
}

export interface CadHatchDxfPatternLine {
  /** Código 53: ángulo absoluto de la familia. */
  angle: number;
  /** Códigos 43/44: origen de la familia. */
  base: CadPoint2;
  /** Códigos 45/46: vector entre líneas sucesivas, ya girado al dibujo. */
  offset: CadPoint2;
  /** Códigos 79/49: la secuencia en unidades de dibujo (0 = punto). */
  dashes: readonly number[];
}

/** La misma tabla como renglones de definición del HATCH del DXF, una por familia. */
export function cadHatchPatternDxfLines(
  pattern: string,
  angle: number | undefined,
  scale: number,
  origin: CadPoint2,
): CadHatchDxfPatternLine[] {
  return cadHatchFamilies(pattern, angle, scale).families.map((family: CadHatchResolvedFamily) => {
    const rad = (family.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      angle: family.angle,
      base: { x: origin.x - sin * family.perp, y: origin.y + cos * family.perp },
      offset: { x: family.shift * cos - family.spacing * sin, y: family.shift * sin + family.spacing * cos },
      dashes: family.dash ?? [],
    };
  });
}
