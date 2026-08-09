/**
 * Índice de color de AutoCAD (ACI) ↔ RGB.
 *
 * ## Por qué hace falta
 *
 * Una tabla CTB es **dependiente del color**: dice «el color 7 sale con pluma
 * negra de 0,25 mm». El documento canónico guarda colores en hexadecimal, así
 * que sin esta traducción una CTB importada no se podría aplicar a nada.
 *
 * ## Qué es exacto y qué es reproducible
 *
 * Los índices **1–9 y 250–255 son la tabla real de AutoCAD**, valor a valor.
 * No es una elección estética: son los dieciséis que usa de verdad un plano de
 * ingeniería —los siete básicos para el grosor de pluma y los grises para
 * tramas— y son los que aparecen en las CTB que trae un estudio.
 *
 * Los índices **10–249 se generan** con la rampa cromática de 24 tonos × 10
 * matices que describe la paleta de AutoCAD. Es determinista y reversible
 * dentro de este producto, pero no se afirma que coincida byte a byte con la
 * tabla de Autodesk en cada uno de esos 240 valores. Decirlo aquí es más útil
 * que una tabla de 240 tripletes que nadie va a verificar.
 */

/** ACI 0 es PorBloque y 256 PorCapa: no son colores, son herencias. */
export const ACI_BY_BLOCK = 0;
export const ACI_BY_LAYER = 256;

/** Los dieciséis exactos. */
const EXACT: Readonly<Record<number, [number, number, number]>> = {
  1: [255, 0, 0],
  2: [255, 255, 0],
  3: [0, 255, 0],
  4: [0, 255, 255],
  5: [0, 0, 255],
  6: [255, 0, 255],
  7: [255, 255, 255],
  8: [128, 128, 128],
  9: [192, 192, 192],
  250: [51, 51, 51],
  251: [91, 91, 91],
  252: [132, 132, 132],
  253: [173, 173, 173],
  254: [214, 214, 214],
  255: [255, 255, 255],
};

/** Los 24 tonos de la rampa, en grados. 15° de paso, como la paleta. */
const HUE_STEP = 15;

/**
 * Los diez matices de cada tono: cinco luminancias, cada una en su versión
 * saturada y en su versión lavada. Es la estructura de la rampa de AutoCAD.
 */
const SHADES: readonly { value: number; saturation: number }[] = [
  { value: 1, saturation: 1 },
  { value: 1, saturation: 0.65 },
  { value: 0.8, saturation: 1 },
  { value: 0.8, saturation: 0.65 },
  { value: 0.6, saturation: 1 },
  { value: 0.6, saturation: 0.65 },
  { value: 0.45, saturation: 1 },
  { value: 0.45, saturation: 0.65 },
  { value: 0.33, saturation: 1 },
  { value: 0.33, saturation: 0.65 },
];

function hsvToRgb(hueDeg: number, saturation: number, value: number): [number, number, number] {
  const hue = ((hueDeg % 360) + 360) % 360 / 60;
  const chroma = value * saturation;
  const second = chroma * (1 - Math.abs((hue % 2) - 1));
  const match = value - chroma;
  const [r, g, b] =
    hue < 1 ? [chroma, second, 0]
      : hue < 2 ? [second, chroma, 0]
        : hue < 3 ? [0, chroma, second]
          : hue < 4 ? [0, second, chroma]
            : hue < 5 ? [second, 0, chroma]
              : [chroma, 0, second];
  return [
    Math.round((r + match) * 255),
    Math.round((g + match) * 255),
    Math.round((b + match) * 255),
  ];
}

function rgbOf(aci: number): [number, number, number] {
  const exact = EXACT[aci];
  if (exact) return exact;
  if (aci < 10 || aci > 249) return [255, 255, 255];
  const offset = aci - 10;
  const shade = SHADES[offset % 10];
  const hue = Math.floor(offset / 10) * HUE_STEP;
  return hsvToRgb(hue, shade.saturation, shade.value);
}

const hex = (value: number): string => value.toString(16).padStart(2, "0");

/** `#rrggbb` del índice. Fuera de 1..255 devuelve el blanco de AutoCAD. */
export function aciToHex(aci: number): string {
  const [r, g, b] = rgbOf(Math.round(aci));
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function parseHexColor(color: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** La tabla completa, calculada UNA vez: 255 índices y su RGB. */
const TABLE: readonly (readonly [number, number, number])[] = Array.from(
  { length: 255 },
  (_unused, index) => rgbOf(index + 1),
);

/**
 * Índice más parecido a un color hexadecimal.
 *
 * Se compara en RGB con distancia euclídea, no en un espacio perceptual: el
 * objetivo no es «qué color se le parece más al ojo» sino «qué pluma de la CTB
 * le corresponde», y las CTB reales usan los índices exactos, donde la
 * distancia es cero y cualquier métrica da lo mismo.
 */
export function hexToAci(color: string): number {
  const rgb = parseHexColor(color);
  if (!rgb) return 7;
  let best = 7;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < TABLE.length; index += 1) {
    const [r, g, b] = TABLE[index];
    const distance =
      (r - rgb[0]) * (r - rgb[0]) + (g - rgb[1]) * (g - rgb[1]) + (b - rgb[2]) * (b - rgb[2]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index + 1;
      if (distance === 0) break;
    }
  }
  return best;
}

/** Gris equivalente de un color, para `convertToGrayscale`. */
export function toGrayscaleHex(color: string): string {
  const rgb = parseHexColor(color);
  if (!rgb) return "#000000";
  // Luma BT.601: es la que usan los controladores de trazado monocromo.
  const luma = Math.round(0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]);
  return `#${hex(luma)}${hex(luma)}${hex(luma)}`;
}

/**
 * Aplica un porcentaje de intensidad (`screening`) sobre blanco.
 *
 * Un 50 % en una CTB no significa «medio transparente»: significa que la trama
 * de puntos deja pasar la mitad de la tinta, y sobre papel blanco eso se ve
 * como el color aclarado a la mitad. Trazar a PDF sin esto saca las tramas de
 * fondo tan negras como las líneas de contorno.
 */
export function screenHex(color: string, screenPercent: number): string {
  const rgb = parseHexColor(color);
  if (!rgb) return color;
  const ratio = Math.min(1, Math.max(0, screenPercent / 100));
  const mixed = rgb.map((channel) => Math.round(255 - (255 - channel) * ratio)) as [
    number,
    number,
    number,
  ];
  return `#${hex(mixed[0])}${hex(mixed[1])}${hex(mixed[2])}`;
}
