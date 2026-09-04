/**
 * Un PNG mínimo y VÁLIDO fabricado a mano, para specs y goldens (Ola H).
 *
 * Sin `zlib`: el flujo IDAT usa bloques deflate «almacenados» (sin
 * comprimir), que cualquier decodificador acepta, con su Adler-32 y sus CRC
 * calculados aquí. Así el mismo archivo lo produce Node en un spec, lo
 * elige el navegador en un golden por el selector de archivos y lo lee
 * jsPDF al trazar, sin ninguna dependencia. Cabe un 2 × 2 y cabe un
 * 64 × 64; no está pensado para más de 65 535 bytes por bloque, y lo dice.
 */

export type CadPngPixel = (x: number, y: number) => readonly [number, number, number, number];

/** Un PNG RGBA de 8 bits por canal, `width × height`, píxel a píxel. */
export function cadPngFixture(width: number, height: number, pixel: CadPngPixel): Uint8Array {
  const stride = 1 + width * 4;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0; // filtro None
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const at = y * stride + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** Un damero de dos colores, útil para ver si la imagen se pinta y en qué orientación. */
export function cadPngChecker(width: number, height: number, dark: readonly [number, number, number] = [30, 41, 59], light: readonly [number, number, number] = [226, 232, 240]): Uint8Array {
  return cadPngFixture(width, height, (x, y) => {
    const [r, g, b] = (x + y) % 2 === 0 ? dark : light;
    return [r, g, b, 255];
  });
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([...type].map((character) => character.charCodeAt(0)));
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(concat([typeBytes, data])));
  return concat([length, typeBytes, data, crc]);
}

/** zlib con bloques deflate almacenados: cabecera 78 01, bloques ≤ 65 535, Adler-32. */
function zlibStored(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  const MAX = 65_535;
  for (let offset = 0; offset < data.length || offset === 0; offset += MAX) {
    const slice = data.subarray(offset, Math.min(data.length, offset + MAX));
    const final = offset + MAX >= data.length ? 1 : 0;
    const header = new Uint8Array(5);
    header[0] = final;
    header[1] = slice.length & 0xff;
    header[2] = slice.length >> 8;
    header[3] = ~slice.length & 0xff;
    header[4] = (~slice.length >> 8) & 0xff;
    parts.push(header, slice);
    if (data.length === 0) break;
  }
  const adler = new Uint8Array(4);
  new DataView(adler.buffer).setUint32(0, adler32(data));
  parts.push(adler);
  return concat(parts);
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65_521;
    b = (b + a) % 65_521;
  }
  return ((b << 16) | a) >>> 0;
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

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Los otros tipos de color, y el BMP (Ola I, 2026-09-04)
// ---------------------------------------------------------------------------
//
// `cadPngFixture` sólo sabe emitir RGBA porque era lo único que la Ola H
// necesitaba pintar. El decodificador del motor (`raster-decode.ts`) tiene
// que leer además gris, RGB y paleta —y con menos de 8 bits por muestra, que
// es como se guarda un escaneo bilevel de verdad— y también BMP. Un
// decodificador sin archivos de los cuatro tipos no está probado: está
// escrito. De ahí estos dos fabricantes.

/** Tipos de color del PNG: 0 gris, 2 RGB, 3 paleta, 4 gris+alfa, 6 RGBA. */
export type CadPngColorType = 0 | 2 | 3 | 4 | 6;

export interface CadPngTypedOptions {
  width: number;
  height: number;
  colorType: CadPngColorType;
  /** Bits por muestra. Menos de 8 sólo en gris y paleta, como manda la norma. */
  bitDepth?: 1 | 2 | 4 | 8;
  /** La paleta, sólo con `colorType` 3. */
  palette?: readonly (readonly [number, number, number])[];
  /** Alfa por entrada de paleta (bloque tRNS), sólo con `colorType` 3. */
  paletteAlpha?: readonly number[];
  /** Las muestras del píxel: `[gris]`, `[r,g,b]`, `[índice]`, `[gris,a]` o `[r,g,b,a]`. */
  sample: (x: number, y: number) => readonly number[];
}

const PNG_CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Un PNG del tipo de color y la profundidad que se pidan, sin comprimir. */
export function cadPngTypedFixture(options: CadPngTypedOptions): Uint8Array {
  const { width, height, colorType, sample } = options;
  const bitDepth = options.bitDepth ?? 8;
  const channels = PNG_CHANNELS[colorType];
  if (!channels) throw new Error(`cadPngTypedFixture: tipo de color ${colorType} desconocido.`);
  if (bitDepth !== 8 && colorType !== 0 && colorType !== 3)
    throw new Error("cadPngTypedFixture: menos de 8 bits por muestra sólo cabe en gris o paleta.");
  if (colorType === 3 && !options.palette) throw new Error("cadPngTypedFixture: el tipo 3 necesita su paleta.");

  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const stride = 1 + rowBytes;
  const raw = new Uint8Array(stride * height);
  const mask = (1 << bitDepth) - 1;
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0; // filtro None: el decodificador ya prueba los otros cuatro aparte
    let bit = 0;
    for (let x = 0; x < width; x += 1) {
      const values = sample(x, y);
      for (let channel = 0; channel < channels; channel += 1) {
        const value = values[channel] ?? 0;
        if (bitDepth === 8) {
          raw[y * stride + 1 + (bit >> 3)] = value & 0xff;
        } else {
          const shift = 8 - bitDepth - (bit % 8);
          raw[y * stride + 1 + (bit >> 3)] |= (value & mask) << shift;
        }
        bit += bitDepth;
      }
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  const parts: Uint8Array[] = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
  ];
  if (options.palette) {
    const plte = new Uint8Array(options.palette.length * 3);
    options.palette.forEach(([r, g, b], index) => {
      plte[index * 3] = r;
      plte[index * 3 + 1] = g;
      plte[index * 3 + 2] = b;
    });
    parts.push(chunk("PLTE", plte));
    if (options.paletteAlpha) parts.push(chunk("tRNS", new Uint8Array(options.paletteAlpha)));
  }
  parts.push(chunk("IDAT", zlibStored(raw)), chunk("IEND", new Uint8Array(0)));
  return concat(parts);
}

export interface CadBmpOptions {
  width: number;
  height: number;
  /** Bits por píxel: 1, 4 y 8 son indexados; 24 y 32 llevan el color dentro. */
  bitCount: 1 | 4 | 8 | 24 | 32;
  palette?: readonly (readonly [number, number, number])[];
  /** `[índice]` en los indexados, `[r,g,b]` en 24 y 32 bits. */
  sample: (x: number, y: number) => readonly number[];
  /** `true` escribe las filas de arriba abajo (altura negativa). */
  topDown?: boolean;
}

/** Un BMP sin comprimir (BI_RGB) con su BITMAPINFOHEADER de 40 bytes. */
export function cadBmpFixture(options: CadBmpOptions): Uint8Array {
  const { width, height, bitCount, sample } = options;
  const indexed = bitCount <= 8;
  if (indexed && !options.palette) throw new Error("cadBmpFixture: los BMP indexados necesitan su paleta.");
  const paletteCount = indexed ? 1 << bitCount : 0;
  // Las filas del BMP se rellenan hasta múltiplo de 4 bytes. No es un detalle:
  // leerlas sin el relleno desplaza la imagen una fila cada pocas líneas.
  const stride = ((width * bitCount + 31) >> 5) << 2;
  const pixelOffset = 14 + 40 + paletteCount * 4;
  const out = new Uint8Array(pixelOffset + stride * height);
  const view = new DataView(out.buffer);
  out[0] = 0x42; // B
  out[1] = 0x4d; // M
  view.setUint32(2, out.length, true);
  view.setUint32(10, pixelOffset, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, options.topDown ? -height : height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, bitCount, true);
  view.setUint32(30, 0, true); // BI_RGB
  view.setUint32(34, stride * height, true);
  view.setUint32(46, paletteCount, true);
  if (options.palette)
    options.palette.forEach(([r, g, b], index) => {
      const at = 14 + 40 + index * 4;
      out[at] = b; // el BMP guarda BGRA, no RGBA
      out[at + 1] = g;
      out[at + 2] = r;
      out[at + 3] = 0;
    });

  const mask = indexed ? (1 << bitCount) - 1 : 0;
  for (let y = 0; y < height; y += 1) {
    // Sin `topDown`, la primera fila almacenada es la ÚLTIMA de la imagen.
    const storedRow = options.topDown ? y : height - 1 - y;
    const rowAt = pixelOffset + storedRow * stride;
    for (let x = 0; x < width; x += 1) {
      const values = sample(x, y);
      if (indexed) {
        const bit = x * bitCount;
        const shift = 8 - bitCount - (bit % 8);
        out[rowAt + (bit >> 3)] |= (values[0] & mask) << shift;
      } else {
        const at = rowAt + x * (bitCount >> 3);
        out[at] = values[2] & 0xff; // B
        out[at + 1] = values[1] & 0xff; // G
        out[at + 2] = values[0] & 0xff; // R
        if (bitCount === 32) out[at + 3] = 0;
      }
    }
  }
  return out;
}
