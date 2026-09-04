/**
 * LA VENTANA DE COMPARACIÓN: plantillas Hershey, manchas y distancia de
 * chanfle (Ola I, 2026-09-04).
 *
 * Esto es la mecánica del reconocimiento de texto, separada de su tubería
 * (`raster-text-recognize.ts`) porque son dos oficios distintos: allí se
 * decide QUÉ se compara —qué manchas forman un renglón, dónde cae su línea
 * base, a qué altura—; aquí se compara, y nada más.
 *
 * ## La ventana
 *
 * Todas las comparaciones de un renglón ocurren en la MISMA ventana, anclada
 * a dos referencias:
 *
 *   - **La línea base**, en la fila `above`. Es lo que separa una coma de un
 *     apóstrofo: la misma forma en dos alturas son dos signos distintos, y
 *     alinear por la caja de la tinta los haría idénticos.
 *   - **El centro de masa horizontal**, en la columna `anchor`. No el canto
 *     izquierdo: un píxel de ruido asomando por la izquierda corría el glifo
 *     entero y con él todas las distancias (medido: la `I` de PREDIO pasaba a
 *     leerse `í`, porque la plantilla de la í tiene su acento justo un píxel a
 *     la izquierda del asta).
 *
 * Como la plantilla siempre cae en el mismo sitio de la ventana, se rasteriza
 * y se transforma UNA vez por renglón y sirve para todos sus caracteres. De
 * ahí la caché.
 *
 * ## La distancia
 *
 * Chanfle simétrico: la media de mancha→plantilla y plantilla→mancha, dividida
 * entre la altura de mayúscula para que el número no dependa del tamaño. La
 * transformada de distancia es la clásica de dos pasadas con pesos 3 y 4 —una
 * aproximación euclídea con un 2 % de error, que basta de sobra cuando lo que
 * se hace es comparar, no medir—.
 *
 * ## Los dos lados pasan por el mismo adelgazamiento
 *
 * Una fuente de trazos es una línea de grosor cero. El escaneo la trae con el
 * grosor de la plumilla, así que ambos —mancha y plantilla— pasan por el
 * `cadRasterThin` de la tubería antes de compararse: si no, la distancia mide
 * sobre todo el GROSOR, todas las letras parecidas empatan y ninguna gana el
 * margen.
 */
import {
  CAD_HERSHEY_CAP_HEIGHT,
  cadHersheyGlyph,
  type CadHersheyFamily,
} from "./fonts/hershey-fonts";
import { CAD_HERSHEY_SIMPLEX_GLYPHS } from "./fonts/hershey-simplex-data";
import { cadRasterThin } from "./raster-vectorize";

/**
 * Los caracteres candidatos, EN ORDEN DE PREFERENCIA: cuando dos plantillas
 * salen idénticas a la escala del renglón, se lee la primera de esta lista.
 * Mayúsculas y cifras van delante porque un rótulo de plano es mayúscula: `I`
 * antes que `l` no es un capricho, es la lectura más probable de una vertical
 * de altura de mayúscula en un cuadro de construcción.
 */
export const CAD_RASTER_TEXT_ALPHABET: readonly string[] = (() => {
  const ascii = Object.keys(CAD_HERSHEY_SIMPLEX_GLYPHS).filter((character) => character !== " ");
  const upper = ascii.filter((character) => /[A-Z]/.test(character));
  const digits = ascii.filter((character) => /[0-9]/.test(character));
  const lower = ascii.filter((character) => /[a-z]/.test(character));
  const signs = ascii.filter((character) => !/[A-Za-z0-9]/.test(character));
  // Los compuestos por `hershey-fonts.ts` (acentos, ñ, ¿¡, Ø, °, ±) van al
  // final: sin ellos un cuadro de construcción en español no se lee entero.
  const composed = [..."ÁÉÍÓÚÜÑ°±Øáéíóúüñ¿¡ø"];
  return [...upper, ...digits, ...signs, ...lower, ...composed];
})();

export interface CadRasterBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Una mancha de tinta: sus píxeles en la imagen y la caja que ocupan. */
export interface CadRasterInkBlob {
  bbox: CadRasterBox;
  indices: number[];
}

/**
 * La ventana común de un renglón: dónde cae la línea base, dónde el ancla
 * horizontal y cuánto sitio hay alrededor.
 */
export interface CadRasterTextWindow {
  width: number;
  height: number;
  /** Holgura alrededor de la tinta, en píxeles. */
  pad: number;
  /** Fila de la ventana donde cae la línea base. */
  above: number;
  /** Columna donde se ancla el centro de masa de la tinta. */
  anchor: number;
  /** Escala de la fuente: `altura de mayúscula / 21`. */
  scale: number;
  capHeightPx: number;
}

/**
 * La ventana para un renglón de esta altura con manchas de este ancho. Arriba
 * cabe hasta la tilde de una `Á` (1,35 alturas) y abajo el descendente de una
 * `g` (media altura).
 */
export function cadRasterTextWindow(capHeightPx: number, widestBlobPx: number): CadRasterTextWindow {
  const pad = 2;
  const width = Math.ceil(Math.max(widestBlobPx, 2 * capHeightPx)) + 2 * pad;
  const above = Math.ceil(1.35 * capHeightPx) + pad;
  const below = Math.ceil(0.5 * capHeightPx) + pad;
  return { width, height: above + below + 1, pad, above, anchor: width >> 1, scale: capHeightPx / CAD_HERSHEY_CAP_HEIGHT, capHeightPx };
}

/** El corrimiento que lleva el centro de masa de una mancha al ancla. */
export function cadRasterTextShift(blob: CadRasterInkBlob, imageWidth: number, window: CadRasterTextWindow): number {
  let columnSum = 0;
  for (const index of blob.indices) columnSum += index % imageWidth;
  return window.anchor - Math.round(columnSum / blob.indices.length);
}

export interface CadRasterTextTemplate {
  character: string;
  /** Trazos ya rasterizados en la ventana local. */
  mask: Uint8Array;
  distance: Float32Array;
  pixels: number[];
  /** Caja de la tinta de la plantilla, en píxeles relativos a la ventana. */
  box: CadRasterBox;
  advance: number;
  /** Columna de la ventana donde cae el origen de la célula (la pluma). */
  penOffset: number;
  /** Firma del dibujo, para colapsar las plantillas idénticas. */
  signature: string;
}

export interface CadRasterTextVariant {
  shift: number;
  pixels: number[];
  distance: Float32Array;
  box: CadRasterBox;
}

/** La mancha llevada a la ventana con un corrimiento dado, ya con su chanfle. */
export function cadRasterTextRender(blob: CadRasterInkBlob, shift: number, imageWidth: number, window: CadRasterTextWindow, baselineRow: number): CadRasterTextVariant {
  const mask = new Uint8Array(window.width * window.height);
  const pixels: number[] = [];
  for (const index of blob.indices) {
    const x = index % imageWidth;
    const y = (index - x) / imageWidth;
    const lx = x + shift;
    const ly = y - baselineRow + window.above;
    if (lx < 0 || ly < 0 || lx >= window.width || ly >= window.height) continue;
    const at = ly * window.width + lx;
    if (mask[at]) continue;
    mask[at] = 1;
    pixels.push(at);
  }
  return {
    shift,
    pixels,
    distance: cadRasterTextChamfer(mask, window.width, window.height),
    box: {
      minX: blob.bbox.minX + shift,
      maxX: blob.bbox.maxX + shift,
      minY: blob.bbox.minY - baselineRow + window.above,
      maxY: blob.bbox.maxY - baselineRow + window.above,
    },
  };
}

/**
 * Descarta de golpe las plantillas que no pueden ser: la que arranca medio
 * renglón más arriba, la que se hunde bajo la base o la que mide el doble de
 * ancho. Sin este filtro habría que puntuar los 114 glifos contra cada mancha.
 */
export function cadRasterTextPlausible(template: CadRasterBox, candidate: CadRasterBox, capHeightPx: number): boolean {
  const slack = 0.32 * capHeightPx;
  if (Math.abs(template.minY - candidate.minY) > slack) return false;
  if (Math.abs(template.maxY - candidate.maxY) > slack) return false;
  const templateWidth = template.maxX - template.minX;
  const candidateWidth = candidate.maxX - candidate.minX;
  return Math.abs(templateWidth - candidateWidth) <= 0.55 * capHeightPx;
}

const templateCache = new Map<string, CadRasterTextTemplate[]>();

/** Las plantillas del juego, rasterizadas a la escala del renglón. */
export function cadRasterTextTemplates(family: CadHersheyFamily, window: CadRasterTextWindow): CadRasterTextTemplate[] {
  const { width: windowWidth, height: windowHeight, pad, above, anchor, scale } = window;
  const key = `${family}|${scale.toFixed(4)}|${windowWidth}|${windowHeight}|${pad}|${above}|${anchor}`;
  const cached = templateCache.get(key);
  if (cached) return cached;
  const out: CadRasterTextTemplate[] = [];
  for (const character of CAD_RASTER_TEXT_ALPHABET) {
    const glyph = cadHersheyGlyph(family, character);
    if (glyph.strokes.length === 0) continue;
    // Primero se traza con la pluma en `pad` y la base en `above`; después se
    // corre el dibujo entero para que su centro de masa caiga en el ancla.
    const drawn = new Uint8Array(windowWidth * windowHeight);
    const toX = (fx: number) => pad + Math.round(fx * scale);
    const toY = (fy: number) => above - Math.round(fy * scale);
    for (const stroke of glyph.strokes)
      for (let index = 0; index + 3 < stroke.length; index += 2)
        line(drawn, windowWidth, windowHeight, toX(stroke[index]), toY(stroke[index + 1]), toX(stroke[index + 2]), toY(stroke[index + 3]));
    // La plantilla pasa por el MISMO adelgazamiento que la mancha: sólo así la
    // comparación es entre dos cosas de la misma naturaleza.
    cadRasterThin(drawn, windowWidth, windowHeight);
    let columnSum = 0;
    let drawnPixels = 0;
    for (let at = 0; at < drawn.length; at += 1) {
      if (!drawn[at]) continue;
      columnSum += at % windowWidth;
      drawnPixels += 1;
    }
    if (drawnPixels === 0) continue;
    const shift = anchor - Math.round(columnSum / drawnPixels);
    const mask = new Uint8Array(drawn.length);
    const pixels: number[] = [];
    let minX = windowWidth;
    let maxX = -1;
    let minY = windowHeight;
    let maxY = -1;
    for (let at = 0; at < drawn.length; at += 1) {
      if (!drawn[at]) continue;
      const x = (at % windowWidth) + shift;
      if (x < 0 || x >= windowWidth) continue;
      const y = (at - (at % windowWidth)) / windowWidth;
      const moved = y * windowWidth + x;
      mask[moved] = 1;
      pixels.push(moved);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (pixels.length === 0) continue;
    pixels.sort((a, b) => a - b);
    out.push({
      character,
      mask,
      distance: cadRasterTextChamfer(mask, windowWidth, windowHeight),
      pixels,
      box: { minX, minY, maxX, maxY },
      advance: glyph.advance,
      penOffset: pad + shift,
      signature: pixels.join(","),
    });
  }
  templateCache.set(key, out);
  return out;
}

/**
 * Distancia al píxel de tinta más cercano, por el chanfle clásico de dos
 * pasadas con pesos 3 (ortogonal) y 4 (diagonal), dividido entre 3 para que
 * salga en píxeles. Es la aproximación euclídea que se puede calcular en dos
 * barridos, y con un 2 % de error basta: aquí se compara, no se mide.
 */
export function cadRasterTextChamfer(mask: Uint8Array, width: number, height: number): Float32Array {
  const INFINITE = 1e9;
  const distance = new Float32Array(mask.length);
  for (let at = 0; at < mask.length; at += 1) distance[at] = mask[at] ? 0 : INFINITE;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const at = y * width + x;
      let best = distance[at];
      if (best === 0) continue;
      if (y > 0) {
        best = Math.min(best, distance[at - width] + 3);
        if (x > 0) best = Math.min(best, distance[at - width - 1] + 4);
        if (x < width - 1) best = Math.min(best, distance[at - width + 1] + 4);
      }
      if (x > 0) best = Math.min(best, distance[at - 1] + 3);
      distance[at] = best;
    }
  for (let y = height - 1; y >= 0; y -= 1)
    for (let x = width - 1; x >= 0; x -= 1) {
      const at = y * width + x;
      let best = distance[at];
      if (best === 0) continue;
      if (y < height - 1) {
        best = Math.min(best, distance[at + width] + 3);
        if (x > 0) best = Math.min(best, distance[at + width - 1] + 4);
        if (x < width - 1) best = Math.min(best, distance[at + width + 1] + 4);
      }
      if (x < width - 1) best = Math.min(best, distance[at + 1] + 3);
      distance[at] = best;
    }
  for (let at = 0; at < distance.length; at += 1) distance[at] /= 3;
  return distance;
}

/** Bresenham entero: la misma línea que dibuja un trazo de un píxel. */
function line(mask: Uint8Array, width: number, height: number, x0: number, y0: number, x1: number, y1: number): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (let guard = 0; guard < 1 << 16; guard += 1) {
    if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = 1;
    if (x === x1 && y === y1) return;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
}

