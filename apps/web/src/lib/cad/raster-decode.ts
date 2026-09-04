/**
 * DECODIFICADOR DE IMAGEN DEL MOTOR: del archivo a los píxeles, sin navegador
 * y sin red (Ola I, 2026-09-04).
 *
 * Medido antes: el motor NO sabía leer un archivo de imagen. IMAGEATTACH
 * (Ola H) mete el escaneo dentro del dibujo como `data:image/…` y el
 * anfitrión lo decodifica una vez con el navegador sólo para saber su tamaño
 * en píxeles; a partir de ahí la imagen era una cadena opaca. Vectorizar un
 * escaneo exige lo contrario: los PÍXELES, en el motor, donde ya está el
 * documento y donde se pueden probar sin abrir un navegador.
 *
 * ## Por qué se puede hacer aquí
 *
 * Porque la pieza cara ya estaba escrita. El IDAT de un PNG es un flujo zlib
 * y `pdf/pdf-inflate.ts` lleva un INFLATE completo con su propia spec desde
 * que el importador de PDF lo necesitó. Lo que falta encima es formato, no
 * compresión: cabecera, bloques, filtros por línea y desempaquetado de
 * muestras. El BMP no lleva ni eso.
 *
 * ## Lo que lee y lo que RECHAZA diciéndolo
 *
 *   - PNG, profundidades 1, 2, 4, 8 y 16 bits por muestra, en los cinco tipos
 *     de color (gris, RGB, paleta, gris+alfa, RGBA), con los cinco filtros
 *     (None, Sub, Up, Average, Paeth) y con `tRNS`.
 *   - BMP sin comprimir (BI_RGB) de 1, 4, 8, 24 y 32 bits, de abajo arriba y
 *     de arriba abajo, con cabecera de 12 (CORE) o ≥ 40 bytes (INFO/V4/V5).
 *   - JPEG, WebP, GIF y TIFF se RECHAZAN con su motivo. Un JPEG es DCT,
 *     Huffman y submuestreo de color: otro descodificador entero. Adivinarlo
 *     —leer la miniatura, o inventar píxeles— sería peor que no leerlo, así
 *     que se dice el límite y se dice la salida (volver a guardar en PNG).
 *   - El PNG entrelazado (Adam7) y el BMP comprimido (RLE, BITFIELDS) también
 *     se rechazan por su nombre. Un archivo que llega cortado FALLA: nunca
 *     devuelve media imagen con el resto en negro.
 *
 * La salida es RGBA de 8 bits con la fila 0 ARRIBA, que es como viene el
 * archivo. La conversión al sistema de píxeles del dibujo —donde la `y` sube—
 * la hace quien coloca, no quien decodifica.
 */
import { cadBase64ToBytes } from "./geo-import-bundle";
import { cadPdfInflate } from "./pdf/pdf-inflate";

/** Tope de píxeles. Un A0 a 600 dpi son 33 Mpx; por encima el RGBA no cabe en memoria sin pelear. */
export const CAD_RASTER_MAX_PIXELS = 24_000_000;

export type CadRasterDecodeCode =
  | "empty"
  | "unknown_format"
  | "unsupported_format"
  | "unsupported_feature"
  | "truncated"
  | "malformed"
  | "too_large"
  | "inflate";

export class CadRasterDecodeError extends Error {
  readonly code: CadRasterDecodeCode;
  constructor(code: CadRasterDecodeCode, message: string) {
    super(message);
    this.name = "CadRasterDecodeError";
    this.code = code;
  }
}

export function isCadRasterDecodeError(error: unknown): error is CadRasterDecodeError {
  return error instanceof CadRasterDecodeError;
}

export interface CadRasterImage {
  width: number;
  height: number;
  /** RGBA de 8 bits, 4 bytes por píxel, fila 0 ARRIBA. */
  rgba: Uint8Array;
  format: "png" | "bmp";
  /** Lo que se leyó, tal cual va al manifiesto: «PNG 8 bits, paleta indexada». */
  description: string;
}

export type CadRasterSniff = "png" | "bmp" | "jpeg" | "gif" | "webp" | "tiff" | "unknown";

/** Qué formato es, por su firma. No abre el archivo: sólo lo reconoce. */
export function cadRasterSniff(bytes: Uint8Array): CadRasterSniff {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return "png";
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (bytes.length >= 12 && text4(bytes, 0) === "RIFF" && text4(bytes, 8) === "WEBP") return "webp";
  if (bytes.length >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 42) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[3] === 42))) return "tiff";
  return "unknown";
}

/** El motivo por el que un formato reconocido NO se lee. Se enseña tal cual. */
const REFUSED: Readonly<Record<string, string>> = {
  jpeg:
    "es un JPEG, y el motor no lleva descodificador JPEG: son transformada discreta del coseno, Huffman y submuestreo de color, un formato entero aparte. No se adivina. Vuelve a guardar el escaneo como PNG o BMP y VECTORIZE lo lee.",
  gif:
    "es un GIF, y el motor no lleva descodificador LZW. Vuelve a guardar el escaneo como PNG o BMP.",
  webp:
    "es un WebP, y el motor no lleva descodificador VP8. Vuelve a guardar el escaneo como PNG o BMP.",
  tiff:
    "es un TIFF, y el motor no lo lee todavía (son muchas compresiones distintas dentro del mismo envoltorio). Vuelve a guardar el escaneo como PNG o BMP.",
};

/**
 * Los píxeles del archivo. Lanza `CadRasterDecodeError` con su código y su
 * motivo en cuanto algo no cuadra: nunca devuelve una imagen a medias.
 */
export function cadRasterDecode(bytes: Uint8Array): CadRasterImage {
  if (bytes.length === 0) throw new CadRasterDecodeError("empty", "El archivo de imagen está vacío.");
  const kind = cadRasterSniff(bytes);
  if (kind === "png") return decodePng(bytes);
  if (kind === "bmp") return decodeBmp(bytes);
  const refusal = REFUSED[kind];
  if (refusal) throw new CadRasterDecodeError("unsupported_format", `El archivo ${refusal}`);
  throw new CadRasterDecodeError("unknown_format", "El archivo no empieza por la firma de un PNG ni de un BMP: no se reconoce como imagen.");
}

/** Lo mismo, desde el `data:image/…;base64,…` con el que la imagen viaja dentro del dibujo. */
export function cadRasterDecodeDataUri(uri: string): CadRasterImage {
  const head = /^data:([^;,]*)(;[^,]*)?,/i.exec(uri);
  if (!head)
    throw new CadRasterDecodeError(
      "unknown_format",
      "La imagen no viaja dentro del dibujo (su URI no es un «data:»): el motor no sale a la red a buscarla. Vuelve a adjuntarla con IMAGEATTACH.",
    );
  if (!/;base64/i.test(head[2] ?? ""))
    throw new CadRasterDecodeError("unsupported_format", "El «data:» de la imagen no viene en base64, que es lo único que IMAGEATTACH escribe.");
  let bytes: Uint8Array;
  try {
    bytes = cadBase64ToBytes(uri.slice(head[0].length));
  } catch {
    throw new CadRasterDecodeError("malformed", "El «data:» de la imagen no es base64 legible: el dibujo la trae dañada.");
  }
  return cadRasterDecode(bytes);
}

/**
 * Luminancia de 0 (negro) a 255 (blanco), un byte por píxel, con los pesos de
 * la ITU-R BT.601. Lo transparente se compone sobre BLANCO a propósito: en un
 * escaneo el fondo sin píxel es papel, y tomarlo por tinta llenaría el dibujo
 * de trazos que nadie dibujó.
 */
export function cadRasterLuminance(image: CadRasterImage): Uint8Array {
  const { rgba } = image;
  const out = new Uint8Array(image.width * image.height);
  for (let index = 0; index < out.length; index += 1) {
    const at = index * 4;
    const alpha = rgba[at + 3] / 255;
    const grey = 0.299 * rgba[at] + 0.587 * rgba[at + 1] + 0.114 * rgba[at + 2];
    out[index] = Math.round(grey * alpha + 255 * (1 - alpha));
  }
  return out;
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const PNG_COLOR_NAME: Readonly<Record<number, string>> = {
  0: "gris",
  2: "RGB",
  3: "paleta indexada",
  4: "gris con alfa",
  6: "RGBA",
};
/** Profundidades que la norma admite en cada tipo de color. */
const PNG_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

function decodePng(bytes: Uint8Array): CadRasterImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  let paletteAlpha: Uint8Array | null = null;
  let transparent: number[] | null = null;
  const idat: Uint8Array[] = [];
  let sawEnd = false;

  let cursor = 8;
  while (cursor < bytes.length && !sawEnd) {
    if (cursor + 8 > bytes.length)
      throw new CadRasterDecodeError("truncated", "El PNG se corta en la cabecera de un bloque: el archivo llegó incompleto.");
    const length = view.getUint32(cursor);
    const type = text4(bytes, cursor + 4);
    const at = cursor + 8;
    if (length > 0x7fffffff || at + length + 4 > bytes.length)
      throw new CadRasterDecodeError("truncated", `El PNG se corta dentro del bloque «${type}»: el archivo llegó incompleto.`);
    // El CRC es la única defensa del formato contra leer basura como píxeles.
    if (crc32(bytes.subarray(cursor + 4, at + length)) !== view.getUint32(at + length))
      throw new CadRasterDecodeError("malformed", `El bloque «${type}» del PNG no cuadra con su CRC: el archivo está dañado.`);
    const data = bytes.subarray(at, at + length);

    if (type === "IHDR") {
      if (length !== 13) throw new CadRasterDecodeError("malformed", "La cabecera IHDR del PNG no mide 13 bytes.");
      width = view.getUint32(at);
      height = view.getUint32(at + 4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0) throw new CadRasterDecodeError("unsupported_feature", "El PNG declara un método de compresión que la norma no define.");
      if (data[11] !== 0) throw new CadRasterDecodeError("unsupported_feature", "El PNG declara un método de filtrado que la norma no define.");
      if (data[12] === 1)
        throw new CadRasterDecodeError("unsupported_feature", "El PNG está entrelazado (Adam7) y el motor sólo lee el barrido normal. Vuelve a guardarlo sin entrelazar.");
      if (data[12] !== 0) throw new CadRasterDecodeError("unsupported_feature", "El PNG declara un entrelazado que la norma no define.");
      if (width <= 0 || height <= 0) throw new CadRasterDecodeError("malformed", "El PNG declara un tamaño de cero píxeles.");
      if (!PNG_CHANNELS[colorType]) throw new CadRasterDecodeError("malformed", `El PNG declara el tipo de color ${colorType}, que la norma no define.`);
      if (!PNG_DEPTHS[colorType].includes(bitDepth))
        throw new CadRasterDecodeError("malformed", `El PNG declara ${bitDepth} bits por muestra en ${PNG_COLOR_NAME[colorType]}, que la norma no admite.`);
      guardSize(width, height);
    } else if (type === "PLTE") {
      if (length % 3 !== 0) throw new CadRasterDecodeError("malformed", "La paleta PLTE del PNG no mide un múltiplo de 3 bytes.");
      palette = data.slice();
    } else if (type === "tRNS") {
      // `tRNS` guarda SIEMPRE 16 bits por muestra, aunque la imagen sea de
      // menos: a 16 bits se compara por el byte alto, que es el que se lee.
      const trns = (offset: number) => (bitDepth === 16 ? view.getUint16(at + offset) >> 8 : view.getUint16(at + offset));
      if (colorType === 3) paletteAlpha = data.slice();
      else if (colorType === 0 && length >= 2) transparent = [trns(0)];
      else if (colorType === 2 && length >= 6) transparent = [trns(0), trns(2), trns(4)];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      sawEnd = true;
    }
    cursor = at + length + 4;
  }

  if (colorType < 0) throw new CadRasterDecodeError("malformed", "El PNG no trae cabecera IHDR.");
  if (!sawEnd) throw new CadRasterDecodeError("truncated", "El PNG no llega a su bloque IEND: el archivo está cortado.");
  if (idat.length === 0) throw new CadRasterDecodeError("malformed", "El PNG no trae ningún bloque IDAT: no hay píxeles que leer.");
  if (colorType === 3 && !palette) throw new CadRasterDecodeError("malformed", "El PNG es de paleta y no trae su bloque PLTE.");

  let inflated: Uint8Array;
  try {
    inflated = cadPdfInflate(concatBytes(idat)).data;
  } catch (error) {
    throw new CadRasterDecodeError("inflate", `El flujo comprimido del PNG no se pudo inflar: ${messageOf(error)}`);
  }

  const channels = PNG_CHANNELS[colorType];
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  if (inflated.length < (rowBytes + 1) * height)
    throw new CadRasterDecodeError(
      "truncated",
      `El PNG descomprimido trae ${inflated.length} byte(s) y sus ${height} línea(s) necesitan ${(rowBytes + 1) * height}: el archivo está cortado.`,
    );
  const raw = unfilterPng(inflated, width, height, rowBytes, Math.max(1, (channels * bitDepth) >> 3));

  const rgba = new Uint8Array(width * height * 4);
  const maxSample = (1 << bitDepth) - 1;
  const scale = bitDepth === 16 ? 1 : 255 / maxSample;
  for (let y = 0; y < height; y += 1) {
    const row = raw.subarray(y * rowBytes, (y + 1) * rowBytes);
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4;
      if (colorType === 3) {
        const index = sampleOf(row, x, bitDepth);
        const at = index * 3;
        if (at + 2 >= palette!.length) throw new CadRasterDecodeError("malformed", `El PNG usa el índice de paleta ${index}, que su PLTE no tiene.`);
        rgba[out] = palette![at];
        rgba[out + 1] = palette![at + 1];
        rgba[out + 2] = palette![at + 2];
        rgba[out + 3] = paletteAlpha && index < paletteAlpha.length ? paletteAlpha[index] : 255;
        continue;
      }
      const base = x * channels;
      if (colorType === 0 || colorType === 4) {
        const raw0 = sampleOf(row, base, bitDepth);
        const grey = Math.round(raw0 * scale);
        rgba[out] = grey;
        rgba[out + 1] = grey;
        rgba[out + 2] = grey;
        rgba[out + 3] = colorType === 4 ? Math.round(sampleOf(row, base + 1, bitDepth) * scale) : transparent && transparent[0] === raw0 ? 0 : 255;
        continue;
      }
      const r = sampleOf(row, base, bitDepth);
      const g = sampleOf(row, base + 1, bitDepth);
      const b = sampleOf(row, base + 2, bitDepth);
      rgba[out] = Math.round(r * scale);
      rgba[out + 1] = Math.round(g * scale);
      rgba[out + 2] = Math.round(b * scale);
      rgba[out + 3] =
        colorType === 6
          ? Math.round(sampleOf(row, base + 3, bitDepth) * scale)
          : transparent && transparent[0] === r && transparent[1] === g && transparent[2] === b
            ? 0
            : 255;
    }
  }

  return { width, height, rgba, format: "png", description: `PNG ${bitDepth} bits, ${PNG_COLOR_NAME[colorType]}` };
}

/** Deshace los cinco filtros por línea. Cada línea se filtra contra la ANTERIOR ya deshecha. */
function unfilterPng(inflated: Uint8Array, width: number, height: number, rowBytes: number, bpp: number): Uint8Array {
  const raw = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * (rowBytes + 1)];
    const source = y * (rowBytes + 1) + 1;
    const target = y * rowBytes;
    const previous = target - rowBytes;
    for (let index = 0; index < rowBytes; index += 1) {
      const value = inflated[source + index];
      const left = index >= bpp ? raw[target + index - bpp] : 0;
      const up = y > 0 ? raw[previous + index] : 0;
      const upLeft = y > 0 && index >= bpp ? raw[previous + index - bpp] : 0;
      let restored: number;
      if (filter === 0) restored = value;
      else if (filter === 1) restored = value + left;
      else if (filter === 2) restored = value + up;
      else if (filter === 3) restored = value + ((left + up) >> 1);
      else if (filter === 4) restored = value + paeth(left, up, upLeft);
      else throw new CadRasterDecodeError("malformed", `La línea ${y} del PNG declara el filtro ${filter}, que la norma no define.`);
      raw[target + index] = restored & 0xff;
    }
  }
  return raw;
}

/** El predictor de Paeth: el vecino más cercano a la suma izquierda + arriba − diagonal. */
function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const dLeft = Math.abs(estimate - left);
  const dUp = Math.abs(estimate - up);
  const dUpLeft = Math.abs(estimate - upLeft);
  if (dLeft <= dUp && dLeft <= dUpLeft) return left;
  return dUp <= dUpLeft ? up : upLeft;
}

/** La muestra `index` de una línea, con la profundidad que sea. A 16 bits se toma el byte alto. */
function sampleOf(row: Uint8Array, index: number, bitDepth: number): number {
  if (bitDepth === 8) return row[index];
  if (bitDepth === 16) return row[index * 2];
  const perByte = 8 / bitDepth;
  const byte = row[Math.floor(index / perByte)];
  const shift = 8 - bitDepth * ((index % perByte) + 1);
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

// ---------------------------------------------------------------------------
// BMP
// ---------------------------------------------------------------------------

const BMP_COMPRESSION_NAME: Readonly<Record<number, string>> = {
  1: "RLE de 8 bits",
  2: "RLE de 4 bits",
  3: "máscaras de bits (BI_BITFIELDS)",
  4: "un JPEG incrustado",
  5: "un PNG incrustado",
};

function decodeBmp(bytes: Uint8Array): CadRasterImage {
  if (bytes.length < 26) throw new CadRasterDecodeError("truncated", "El BMP no llega ni a su cabecera: el archivo está cortado.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = view.getUint32(14, true);
  let width: number;
  let signedHeight: number;
  let bitCount: number;
  let compression = 0;
  let declaredPalette = 0;
  let paletteEntry = 4;
  if (headerSize === 12) {
    // BITMAPCOREHEADER: el BMP de OS/2, con paleta de 3 bytes por entrada.
    width = view.getInt16(18, true);
    signedHeight = view.getInt16(20, true);
    bitCount = view.getUint16(24, true);
    paletteEntry = 3;
  } else if (headerSize >= 40) {
    if (bytes.length < 54) throw new CadRasterDecodeError("truncated", "El BMP no llega al final de su cabecera de información.");
    width = view.getInt32(18, true);
    signedHeight = view.getInt32(22, true);
    bitCount = view.getUint16(28, true);
    compression = view.getUint32(30, true);
    declaredPalette = view.getUint32(46, true);
  } else {
    throw new CadRasterDecodeError("malformed", `El BMP declara una cabecera de ${headerSize} bytes, que ninguna versión del formato usa.`);
  }

  if (compression !== 0)
    throw new CadRasterDecodeError(
      "unsupported_feature",
      `El BMP está comprimido con ${BMP_COMPRESSION_NAME[compression] ?? `el método ${compression}`} y el motor sólo lee el BMP sin comprimir (BI_RGB). Vuelve a guardarlo sin compresión, o en PNG.`,
    );
  if (![1, 4, 8, 24, 32].includes(bitCount))
    throw new CadRasterDecodeError("unsupported_feature", `El BMP es de ${bitCount} bits por píxel y el motor lee 1, 4, 8, 24 y 32.`);
  // Altura negativa: las filas van de arriba abajo. Es lo que escriben las
  // capturas de pantalla de Windows, y leerlas al revés voltea el plano.
  const topDown = signedHeight < 0;
  const height = Math.abs(signedHeight);
  if (width <= 0 || height <= 0) throw new CadRasterDecodeError("malformed", "El BMP declara un tamaño de cero píxeles.");
  guardSize(width, height);

  const indexed = bitCount <= 8;
  const paletteCount = indexed ? (declaredPalette > 0 ? declaredPalette : 1 << bitCount) : 0;
  const paletteAt = 14 + headerSize;
  if (indexed && paletteAt + paletteCount * paletteEntry > bytes.length)
    throw new CadRasterDecodeError("truncated", "La paleta del BMP no cabe en el archivo: está cortado.");
  const declaredOffset = view.getUint32(10, true);
  const pixelsAt = declaredOffset > 0 ? declaredOffset : paletteAt + paletteCount * paletteEntry;
  const stride = ((width * bitCount + 31) >> 5) << 2;
  if (pixelsAt + stride * height > bytes.length)
    throw new CadRasterDecodeError(
      "truncated",
      `El BMP declara ${height} fila(s) de ${stride} byte(s) desde el byte ${pixelsAt} y el archivo sólo tiene ${bytes.length}: está cortado.`,
    );

  const rgba = new Uint8Array(width * height * 4);
  const mask = indexed ? (1 << bitCount) - 1 : 0;
  for (let y = 0; y < height; y += 1) {
    const storedRow = topDown ? y : height - 1 - y;
    const rowAt = pixelsAt + storedRow * stride;
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4;
      if (indexed) {
        const bit = x * bitCount;
        const shift = 8 - bitCount - (bit % 8);
        const index = (bytes[rowAt + (bit >> 3)] >> shift) & mask;
        const at = paletteAt + index * paletteEntry;
        if (index >= paletteCount) throw new CadRasterDecodeError("malformed", `El BMP usa el índice de paleta ${index}, que su tabla de ${paletteCount} entradas no tiene.`);
        rgba[out] = bytes[at + 2];
        rgba[out + 1] = bytes[at + 1];
        rgba[out + 2] = bytes[at];
        rgba[out + 3] = 255;
        continue;
      }
      const at = rowAt + x * (bitCount >> 3);
      rgba[out] = bytes[at + 2];
      rgba[out + 1] = bytes[at + 1];
      rgba[out + 2] = bytes[at];
      // El cuarto byte del BMP de 32 bits es «reservado» en BI_RGB, no alfa:
      // hay escritores que lo dejan en cero, y tomarlo por alfa borraría la
      // imagen entera. Se lee OPACO, que es lo que la norma dice.
      rgba[out + 3] = 255;
    }
  }

  const kind = indexed ? "paleta indexada" : bitCount === 32 ? "RGB en 32 bits" : "RGB";
  return { width, height, rgba, format: "bmp", description: `BMP ${bitCount} bits, ${kind}${topDown ? ", de arriba abajo" : ""}` };
}

// ---------------------------------------------------------------------------
// Cosas pequeñas
// ---------------------------------------------------------------------------

function guardSize(width: number, height: number): void {
  if (width * height > CAD_RASTER_MAX_PIXELS)
    throw new CadRasterDecodeError(
      "too_large",
      `La imagen mide ${width} × ${height} px (${Math.round((width * height) / 1e6)} Mpx) y el tope del motor son ${CAD_RASTER_MAX_PIXELS / 1e6} Mpx. Recórtala o bájale la resolución.`,
    );
}

function text4(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
