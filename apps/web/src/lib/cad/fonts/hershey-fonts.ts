/**
 * Fuentes de trazos Hershey: la primera vez que una `.shx` pedida por un DXF
 * se dibuja con MÉTRICA DE TRAZOS de verdad en vez de con una sans del sistema.
 *
 * ## Qué es esto y qué no es
 *
 * Una `.shx` de AutoCAD es un programa de trazos compilado. Este producto no
 * interpreta ese formato y no va a fingir que lo hace: lo que hace este módulo
 * es ofrecer OTRO juego de trazos —las fuentes Hershey, dominio público— cuya
 * naturaleza (polilíneas de un solo trazo, sin relleno) es la misma que la de
 * las `.shx` de texto clásicas. `txt.shx` y `romans.shx` son, de hecho,
 * derivadas históricas del trabajo de Hershey, así que la sustitución no es un
 * parche estético: es volver a la fuente original.
 *
 * La sustitución SE SIGUE DECLARANDO (`mtext-fonts.ts` la publica con
 * disposición `substituted` y `metricsDiffer: true`): las anchuras son las de
 * los trazos Hershey, no las del binario `.shx` que el dibujo nombraba, y
 * afirmar métrica idéntica sin haberla validado contra el original sería
 * mentir. Lo que cambia es la CLASE de sustituto: un trazo por un trazo, y no
 * un contorno relleno por un trazo.
 *
 * ## Las familias y su mapeo, uno a uno
 *
 * - `txt.shx` → **Hershey Simplex** (trazo simple sin serifas, como TXT).
 * - `simplex.shx` → **Hershey Simplex** (es su descendiente directo).
 * - `romans.shx` → **Hershey Roman Simplex** — el MISMO repertorio de trazos
 *   que Simplex: en la colección Hershey el juego ASCII «Simplex» ES el «Roman
 *   Simplex» (el mapa `romans.hmp` clásico apunta a esos mismos glifos). Se
 *   conserva el nombre propio para que el informe de fuentes diga la verdad
 *   histórica, no para fingir dos tablas distintas.
 * - `isocp.shx` → **Hershey ISO** — APROXIMACIÓN declarada: no existe un juego
 *   Hershey del alfabeto ISO 3098; se usan los trazos Simplex, cuyo esqueleto
 *   de un solo trazo es el mismo estilo de rotulación normalizada.
 * - `monotxt.shx` → **Hershey Mono** — los trazos Simplex con avance FIJO
 *   (el de los dígitos, 20 unidades), cada glifo centrado en su célula.
 *
 * ## Caracteres fuera del ASCII de la tabla
 *
 * El juego clásico cubre 32..126. Los que el español y el dibujo técnico piden
 * a diario —áéíóúü ñÑ ° ± Ø ¿¡— se COMPONEN aquí sobre los trazos base (glifo
 * + acento, O + barra, signo rotado). Esa composición es de este módulo, no de
 * la colección Hershey, y así se documenta. Cualquier otro carácter sin glifo
 * se dibuja como `?` —la misma conducta que AutoCAD tiene con una `.shx` sin
 * el símbolo— porque un hueco silencioso parece contenido que no está.
 */
import {
  CAD_HERSHEY_SIMPLEX_GLYPHS,
  type CadHersheyGlyphData,
} from "./hershey-simplex-data";

export type CadHersheyFamily =
  | "Hershey Simplex"
  | "Hershey Roman Simplex"
  | "Hershey ISO"
  | "Hershey Mono";

/** Las familias que van COMPILADAS en la aplicación, listas para declarar. */
export const CAD_HERSHEY_FAMILIES: readonly CadHersheyFamily[] = [
  "Hershey Simplex",
  "Hershey Roman Simplex",
  "Hershey ISO",
  "Hershey Mono",
];

/** Nombre `.shx` pelado (minúsculas, sin extensión) → familia Hershey. */
export const CAD_HERSHEY_SHX_FAMILIES: Readonly<Record<string, CadHersheyFamily>> = {
  txt: "Hershey Simplex",
  simplex: "Hershey Simplex",
  romans: "Hershey Roman Simplex",
  isocp: "Hershey ISO",
  monotxt: "Hershey Mono",
};

/** Altura de mayúscula de la retícula Hershey. Escalar = altura / esto. */
export const CAD_HERSHEY_CAP_HEIGHT = 21;

/** Avance fijo de Hershey Mono: el de los dígitos del juego Simplex. */
export const CAD_HERSHEY_MONO_ADVANCE = 20;

/** ¿A qué familia Hershey va esta `.shx`? `null` si no está en el mapeo. */
export function cadHersheyFamilyForShx(bare: string): CadHersheyFamily | null {
  return CAD_HERSHEY_SHX_FAMILIES[bare.trim().toLowerCase()] ?? null;
}

/** ¿Es este nombre una familia Hershey? Compara sin distinguir mayúsculas. */
export function cadHersheyFamilyByName(name: string): CadHersheyFamily | null {
  const bare = name.trim().toLowerCase();
  return CAD_HERSHEY_FAMILIES.find((family) => family.toLowerCase() === bare) ?? null;
}

export interface CadHersheyGlyph {
  readonly advance: number;
  readonly strokes: readonly (readonly number[])[];
}

/** Desplaza una polilínea plana `[x0,y0,…]` en x. */
function shifted(strokes: readonly (readonly number[])[], dx: number): number[][] {
  return strokes.map((stroke) => stroke.map((value, index) => (index % 2 === 0 ? value + dx : value)));
}

/** Glifo base + trazos extra encima (acentos, diéresis, virgulilla). */
function composed(base: CadHersheyGlyphData, extra: number[][]): CadHersheyGlyph {
  return { advance: base.advance, strokes: [...base.strokes, ...extra] };
}

/** Centro horizontal de la célula del glifo, para colocar acentos. */
function center(base: CadHersheyGlyphData): number {
  return Math.round(base.advance / 2);
}

/** Acento agudo: sube hacia la derecha. `top` es la cota superior del glifo. */
function acute(cx: number, top: number): number[][] {
  return [[cx - 1, top + 2, cx + 2, top + 6]];
}

/** Diéresis: dos puntos cortos sobre la vocal. */
function diaeresis(cx: number, top: number): number[][] {
  return [
    [cx - 3, top + 3, cx - 3, top + 4],
    [cx + 3, top + 3, cx + 3, top + 4],
  ];
}

/** Virgulilla de la eñe: la onda clásica. */
function tilde(cx: number, top: number): number[][] {
  return [[cx - 4, top + 3, cx - 2, top + 5, cx + 2, top + 3, cx + 4, top + 5]];
}

/** Rota un glifo 180° dentro de su célula, bajado a la caja de la `x` (¿ ¡). */
function rotated(base: CadHersheyGlyphData): CadHersheyGlyph {
  return {
    advance: base.advance,
    strokes: base.strokes.map((stroke) =>
      stroke.map((value, index) => (index % 2 === 0 ? base.advance - value : 14 - value)),
    ),
  };
}

/** La `i` sin su punto, para montar la `í`. */
function dotlessI(): CadHersheyGlyphData {
  const base = CAD_HERSHEY_SIMPLEX_GLYPHS.i;
  return {
    advance: base.advance,
    strokes: base.strokes.filter((stroke) => {
      for (let index = 1; index < stroke.length; index += 2) if (stroke[index] <= 14) return true;
      return false;
    }),
  };
}

/** Barra de Ø/ø: cruza la célula de abajo-izquierda a arriba-derecha. */
function slashed(base: CadHersheyGlyphData, bottom: number, top: number): CadHersheyGlyph {
  return composed(base, [[3, bottom, base.advance - 3, top]]);
}

/**
 * Glifos compuestos por ESTE módulo (no forman parte de la colección Hershey).
 * Se construyen perezosamente una vez: son sumas de trazos ya publicados.
 */
let composedGlyphs: Map<string, CadHersheyGlyph> | null = null;

function buildComposedGlyphs(): Map<string, CadHersheyGlyph> {
  const table = CAD_HERSHEY_SIMPLEX_GLYPHS;
  const map = new Map<string, CadHersheyGlyph>();
  const lower: ReadonlyArray<readonly [string, string]> = [
    ["á", "a"],
    ["é", "e"],
    ["ó", "o"],
    ["ú", "u"],
  ];
  for (const [accented, plain] of lower)
    map.set(accented, composed(table[plain], acute(center(table[plain]), 14)));
  map.set("í", composed(dotlessI(), acute(center(table.i), 14)));
  const upper: ReadonlyArray<readonly [string, string]> = [
    ["Á", "A"],
    ["É", "E"],
    ["Í", "I"],
    ["Ó", "O"],
    ["Ú", "U"],
  ];
  for (const [accented, plain] of upper)
    map.set(accented, composed(table[plain], acute(center(table[plain]), 21)));
  map.set("ü", composed(table.u, diaeresis(center(table.u), 14)));
  map.set("Ü", composed(table.U, diaeresis(center(table.U), 21)));
  map.set("ñ", composed(table.n, tilde(center(table.n), 14)));
  map.set("Ñ", composed(table.N, tilde(center(table.N), 21)));
  map.set("¿", rotated(table["?"]));
  map.set("¡", rotated(table["!"]));
  map.set("Ø", slashed(table.O, -2, 23));
  map.set("ø", slashed(table.o, -2, 16));
  // Grado: octágono pequeño pegado al tope de mayúscula. Trazo propio.
  map.set("°", {
    advance: 10,
    strokes: [[3, 19, 4, 21, 6, 21, 7, 19, 6, 17, 4, 17, 3, 19]],
  });
  // Más-menos: célula del `+` del juego, con la raya de menos en la base.
  map.set("±", {
    advance: 26,
    strokes: [
      [13, 5, 13, 17],
      [4, 11, 22, 11],
      [4, 0, 22, 0],
    ],
  });
  return map;
}

/**
 * El glifo de un carácter en una familia, o el `?` cuando no existe: la misma
 * conducta que una `.shx` sin el símbolo, y por el mismo motivo — un hueco
 * silencioso se lee como contenido.
 */
export function cadHersheyGlyph(family: CadHersheyFamily, character: string): CadHersheyGlyph {
  const base: CadHersheyGlyphData | CadHersheyGlyph =
    CAD_HERSHEY_SIMPLEX_GLYPHS[character] ??
    (composedGlyphs ??= buildComposedGlyphs()).get(character) ??
    CAD_HERSHEY_SIMPLEX_GLYPHS["?"];
  if (family !== "Hershey Mono") return base;
  const dx = (CAD_HERSHEY_MONO_ADVANCE - base.advance) / 2;
  return { advance: CAD_HERSHEY_MONO_ADVANCE, strokes: shifted(base.strokes, dx) };
}

/**
 * Ancho de un renglón, en las MISMAS unidades que la altura de mayúscula que
 * se pase. Es la métrica de trazos de verdad: la suma de avances Hershey.
 */
export function cadHersheyTextWidth(
  family: CadHersheyFamily,
  text: string,
  capHeight: number,
): number {
  const scale = capHeight / CAD_HERSHEY_CAP_HEIGHT;
  let units = 0;
  for (const character of text) units += cadHersheyGlyph(family, character).advance;
  return units * scale;
}

export interface CadHersheyTextStrokes {
  /** Polilíneas `{x,y}` con la línea base en `y = 0` y `y` hacia ARRIBA. */
  strokes: { x: number; y: number }[][];
  /** Ancho total del renglón, en las unidades de `capHeight`. */
  width: number;
}

/**
 * Los trazos de un renglón entero, escalados a `capHeight` y con origen en el
 * arranque de la línea base. Quien dibuja sobre un lienzo (y hacia abajo) sólo
 * tiene que invertir `y`.
 */
export function cadHersheyTextStrokes(
  family: CadHersheyFamily,
  text: string,
  capHeight: number,
): CadHersheyTextStrokes {
  const scale = capHeight / CAD_HERSHEY_CAP_HEIGHT;
  const strokes: { x: number; y: number }[][] = [];
  let cursor = 0;
  for (const character of text) {
    const glyph = cadHersheyGlyph(family, character);
    for (const stroke of glyph.strokes) {
      const points: { x: number; y: number }[] = [];
      for (let index = 0; index + 1 < stroke.length; index += 2)
        points.push({ x: (cursor + stroke[index]) * scale, y: stroke[index + 1] * scale });
      if (points.length >= 2) strokes.push(points);
    }
    cursor += glyph.advance;
  }
  return { strokes, width: cursor * scale };
}
