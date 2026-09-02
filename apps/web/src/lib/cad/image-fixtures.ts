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
