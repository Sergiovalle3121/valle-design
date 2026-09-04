/**
 * EL DECODIFICADOR DE IMAGEN DEL MOTOR contra archivos fabricados byte a byte
 * (Ola I, 2026-09-04).
 *
 *   - EL MISMO PÍXEL por cinco caminos: gris, RGB, paleta y RGBA en PNG, y el
 *     BMP de 24 bits. Si los cinco no coinciden en el mismo valor, uno de los
 *     cinco desempaquetados está mal y el escaneo saldría vectorizado torcido.
 *   - Los cinco FILTROS del PNG (None, Sub, Up, Average y Paeth) sobre un
 *     degradado, contra el mismo mapa esperado.
 *   - Menos de 8 bits: el PNG bilevel de 1 bit y el de paleta de 4, que es
 *     como sale un escaneo de línea de verdad.
 *   - BMP indexado, de arriba abajo y de abajo arriba, con su relleno de fila
 *     a múltiplo de 4 bytes.
 *   - FALLA CERRADO: un PNG cortado, un PNG con un CRC tocado, un PNG
 *     entrelazado y un BMP comprimido lanzan con su código y su motivo; NUNCA
 *     devuelven media imagen.
 *   - Un JPEG, un GIF y un WebP se rechazan diciendo POR QUÉ y qué hacer.
 */
import { strict as assert } from "node:assert";
import { cadBmpFixture, cadPngFixture, cadPngTypedFixture } from "./image-fixtures";
import { cadImageDataUri } from "./image-attach-payload";
import {
  CAD_RASTER_MAX_PIXELS,
  cadRasterDecode,
  cadRasterDecodeDataUri,
  cadRasterLuminance,
  cadRasterSniff,
  isCadRasterDecodeError,
} from "./raster-decode";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

/** El código y el motivo de un rechazo, o `null` si no lanzó. */
function refusal(run: () => unknown): { code: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error) {
    if (!isCadRasterDecodeError(error)) throw error;
    return { code: error.code, message: error.message };
  }
}

const pixelAt = (image: { width: number; rgba: Uint8Array }, x: number, y: number) => {
  const at = (y * image.width + x) * 4;
  return [image.rgba[at], image.rgba[at + 1], image.rgba[at + 2], image.rgba[at + 3]];
};

/* ── El mismo píxel por cinco caminos ───────────────────────────────────── */
//
// Un damero de 4 × 3 con dos colores: tinta (32, 32, 32) y papel (240, 240,
// 240). Se eligen GRISES a propósito para que el mismo valor pueda escribirse
// en un canal (gris), en tres (RGB), en cuatro (RGBA) y en una paleta, y los
// cinco archivos tengan que devolver EXACTAMENTE lo mismo.
const INK = 32;
const PAPER = 240;
const isInk = (x: number, y: number) => (x + y) % 2 === 0;
const grey = (x: number, y: number) => (isInk(x, y) ? INK : PAPER);
{
  const width = 4;
  const height = 3;
  const files: Array<{ label: string; bytes: Uint8Array; description: string }> = [
    { label: "PNG gris 8 bits", description: "PNG 8 bits, gris", bytes: cadPngTypedFixture({ width, height, colorType: 0, sample: (x, y) => [grey(x, y)] }) },
    { label: "PNG RGB", description: "PNG 8 bits, RGB", bytes: cadPngTypedFixture({ width, height, colorType: 2, sample: (x, y) => [grey(x, y), grey(x, y), grey(x, y)] }) },
    {
      label: "PNG paleta",
      description: "PNG 8 bits, paleta indexada",
      bytes: cadPngTypedFixture({ width, height, colorType: 3, palette: [[INK, INK, INK], [PAPER, PAPER, PAPER]], sample: (x, y) => [isInk(x, y) ? 0 : 1] }),
    },
    { label: "PNG RGBA", description: "PNG 8 bits, RGBA", bytes: cadPngFixture(width, height, (x, y) => [grey(x, y), grey(x, y), grey(x, y), 255]) },
    {
      label: "BMP 24 bits",
      description: "BMP 24 bits, RGB",
      bytes: cadBmpFixture({ width, height, bitCount: 24, sample: (x, y) => [grey(x, y), grey(x, y), grey(x, y)] }),
    },
  ];
  for (const file of files) {
    const image = cadRasterDecode(file.bytes);
    eq([image.width, image.height], [width, height], `${file.label}: 4 × 3 px`);
    eq(image.description, file.description, `${file.label}: se declara lo que se leyó`);
    eq(pixelAt(image, 0, 0), [INK, INK, INK, 255], `${file.label}: el píxel (0, 0) es tinta`);
    eq(pixelAt(image, 1, 0), [PAPER, PAPER, PAPER, 255], `${file.label}: el píxel (1, 0) es papel`);
    eq(pixelAt(image, 3, 2), [PAPER, PAPER, PAPER, 255], `${file.label}: el píxel (3, 2) —última fila, última columna— es papel`);
    const luminance = cadRasterLuminance(image);
    eq([luminance[0], luminance[1]], [INK, PAPER], `${file.label}: la luminancia sale con los mismos dos valores`);
  }
}

/* ── La luminancia pesa los canales, y compone lo transparente sobre papel ── */
{
  // Rojo puro: 0,299 × 255 = 76,2 → 76. Verde: 0,587 × 255 = 149,7 → 150.
  const colored = cadRasterDecode(cadPngTypedFixture({ width: 3, height: 1, colorType: 2, sample: (x) => [[255, 0, 0], [0, 255, 0], [0, 0, 255]][x] }));
  eq(Array.from(cadRasterLuminance(colored)), [76, 150, 29], "la luminancia usa los pesos de la ITU-R BT.601, no la media de los tres");
  const transparent = cadRasterDecode(cadPngFixture(2, 1, (x) => (x === 0 ? [0, 0, 0, 0] : [0, 0, 0, 255])));
  eq(Array.from(cadRasterLuminance(transparent)), [255, 0], "un píxel transparente es PAPEL, no tinta: en un escaneo el fondo sin píxel es hoja en blanco");
}

/* ── Los cinco filtros del PNG ──────────────────────────────────────────── */
//
// `cadPngTypedFixture` siempre escribe el filtro None, así que aquí se
// fabrica a mano un IDAT con una línea por filtro sobre el mismo degradado.
{
  const width = 4;
  const height = 5;
  const expected: number[][] = [];
  for (let y = 0; y < height; y += 1) expected.push([0, 1, 2, 3].map((x) => (x * 40 + y * 7) & 0xff));
  // Se filtra cada línea con SU filtro, que es lo que hace un codificador de verdad.
  const rowBytes = width;
  const filtered = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    filtered[y * (rowBytes + 1)] = y; // filtros 0..4, uno por línea
    for (let x = 0; x < width; x += 1) {
      const value = expected[y][x];
      const left = x > 0 ? expected[y][x - 1] : 0;
      const up = y > 0 ? expected[y - 1][x] : 0;
      const upLeft = y > 0 && x > 0 ? expected[y - 1][x - 1] : 0;
      let encoded: number;
      if (y === 0) encoded = value;
      else if (y === 1) encoded = value - left;
      else if (y === 2) encoded = value - up;
      else if (y === 3) encoded = value - ((left + up) >> 1);
      else {
        const estimate = left + up - upLeft;
        const a = Math.abs(estimate - left);
        const b = Math.abs(estimate - up);
        const c = Math.abs(estimate - upLeft);
        encoded = value - (a <= b && a <= c ? left : b <= c ? up : upLeft);
      }
      filtered[y * (rowBytes + 1) + 1 + x] = encoded & 0xff;
    }
  }
  const png = pngWithRawIdat(width, height, 8, 0, filtered);
  const image = cadRasterDecode(png);
  const got: number[][] = [];
  for (let y = 0; y < height; y += 1) got.push([0, 1, 2, 3].map((x) => pixelAt(image, x, y)[0]));
  eq(got, expected, "los cinco filtros (None, Sub, Up, Average y Paeth) devuelven el mismo degradado");
}

/* ── Menos de 8 bits: el escaneo bilevel de verdad ──────────────────────── */
{
  const bilevel = cadRasterDecode(cadPngTypedFixture({ width: 9, height: 2, colorType: 0, bitDepth: 1, sample: (x) => [x % 3 === 0 ? 0 : 1] }));
  eq([0, 1, 2, 3].map((x) => pixelAt(bilevel, x, 0)[0]), [0, 255, 255, 0], "PNG de 1 bit: 0 es negro y 1 es blanco, y la fila de 9 px cruza el byte");
  eq(bilevel.description, "PNG 1 bits, gris", "y se declara la profundidad que traía");
  const nibble = cadRasterDecode(
    cadPngTypedFixture({ width: 5, height: 1, colorType: 3, bitDepth: 4, palette: [[0, 0, 0], [255, 0, 0], [0, 255, 0]], sample: (x) => [x % 3] }),
  );
  eq([0, 1, 2, 3].map((x) => pixelAt(nibble, x, 0)), [[0, 0, 0, 255], [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 0, 255]], "PNG de paleta a 4 bits: dos índices por byte");
  const trns = cadRasterDecode(
    cadPngTypedFixture({ width: 2, height: 1, colorType: 3, palette: [[10, 20, 30], [40, 50, 60]], paletteAlpha: [0], sample: (x) => [x] }),
  );
  eq([pixelAt(trns, 0, 0)[3], pixelAt(trns, 1, 0)[3]], [0, 255], "el bloque tRNS da alfa a la entrada de paleta que lo declara");
}

/* ── BMP: relleno de fila, indexado y de arriba abajo ───────────────────── */
{
  // 3 px de 24 bits son 9 bytes por fila y el BMP rellena hasta 12: si el
  // relleno se ignora, la imagen se desplaza una columna por fila.
  const padded = cadRasterDecode(cadBmpFixture({ width: 3, height: 2, bitCount: 24, sample: (x, y) => [x * 10 + y, 0, 0] }));
  eq([0, 1, 2].map((x) => pixelAt(padded, x, 1)[0]), [1, 11, 21], "BMP de 24 bits: la fila de abajo sale entera pese al relleno a 4 bytes");
  const indexed = cadRasterDecode(cadBmpFixture({ width: 5, height: 1, bitCount: 4, palette: [[0, 0, 0], [255, 255, 255], [1, 2, 3]], sample: (x) => [x % 3] }));
  eq(pixelAt(indexed, 2, 0), [1, 2, 3, 255], "BMP indexado de 4 bits: la paleta vuelve como RGB (el archivo la guarda BGRA)");
  const down = cadRasterDecode(cadBmpFixture({ width: 2, height: 2, bitCount: 32, topDown: true, sample: (x, y) => [y * 100, 0, 0] }));
  eq([pixelAt(down, 0, 0)[0], pixelAt(down, 0, 1)[0]], [0, 100], "BMP de altura negativa: las filas van de arriba abajo y no se voltea");
  eq(down.description, "BMP 32 bits, RGB en 32 bits, de arriba abajo", "y se declara");
  eq(pixelAt(down, 0, 0)[3], 255, "el cuarto byte del BMP de 32 bits es reservado, no alfa: se lee OPACO");
}

/* ── Falla cerrado ──────────────────────────────────────────────────────── */
{
  const png = cadPngFixture(8, 8, () => [10, 20, 30, 255]);
  const cut = refusal(() => cadRasterDecode(png.subarray(0, png.length - 12)));
  ok(cut?.code === "truncated" && cut.message.includes("IEND"), `un PNG sin su bloque final falla CERRADO: ${cut?.code} · ${cut?.message}`);
  const halved = refusal(() => cadRasterDecode(png.subarray(0, png.length - 40)));
  ok(halved?.code === "truncated" && halved.message.includes("incompleto"), `y uno cortado dentro de un bloque también: ${halved?.code} · ${halved?.message}`);
  ok(refusal(() => cadRasterDecode(png.subarray(0, 40)))?.code === "truncated", "cortado a la mitad del IDAT, también");

  const tampered = png.slice();
  tampered[tampered.length - 20] ^= 0xff; // un byte del IDAT
  const broken = refusal(() => cadRasterDecode(tampered));
  ok(broken !== null && (broken.code === "malformed" || broken.code === "inflate"), `un byte tocado no pasa por píxeles: ${broken?.code} · ${broken?.message}`);

  const interlaced = pngWithRawIdat(2, 2, 8, 6, new Uint8Array(2 * (1 + 8)), 1);
  const adam7 = refusal(() => cadRasterDecode(interlaced));
  ok(adam7?.code === "unsupported_feature" && adam7.message.includes("Adam7"), `el PNG entrelazado se rechaza por su nombre: ${adam7?.message}`);

  const rle = cadBmpFixture({ width: 4, height: 2, bitCount: 8, palette: [[0, 0, 0], [255, 255, 255]], sample: () => [1] });
  new DataView(rle.buffer).setUint32(30, 1, true); // BI_RLE8
  const compressed = refusal(() => cadRasterDecode(rle));
  ok(compressed?.code === "unsupported_feature" && compressed.message.includes("RLE de 8 bits"), `el BMP comprimido dice con qué: ${compressed?.message}`);

  const short = refusal(() => cadRasterDecode(new Uint8Array(0)));
  ok(short?.code === "empty", "un archivo vacío se dice vacío");
  ok(refusal(() => cadRasterDecode(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])))?.code === "unknown_format", "lo que no es imagen se dice");
  const huge = pngWithRawIdat(6000, 6000, 8, 6, new Uint8Array(4));
  ok(refusal(() => cadRasterDecode(huge))?.code === "too_large", `36 Mpx pasan del tope de ${CAD_RASTER_MAX_PIXELS / 1e6} Mpx y se dice antes de reservar memoria`);
}

/* ── Los formatos que NO se leen, con su motivo ─────────────────────────── */
{
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]);
  eq(cadRasterSniff(jpeg), "jpeg", "el JPEG se reconoce por su firma");
  const refused = refusal(() => cadRasterDecode(jpeg));
  ok(refused?.code === "unsupported_format", "y se rechaza como formato no soportado, no como archivo roto");
  ok(refused!.message.includes("no lleva descodificador JPEG") && refused!.message.includes("PNG o BMP"), `dice el límite y la salida: ${refused?.message}`);

  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
  ok(refusal(() => cadRasterDecode(gif))?.message.includes("LZW") === true, "el GIF dice qué le falta al motor");
  const webp = new Uint8Array(16);
  webp.set([0x52, 0x49, 0x46, 0x46], 0);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  eq(cadRasterSniff(webp), "webp", "el WebP se reconoce por RIFF…WEBP");
  ok(refusal(() => cadRasterDecode(webp))?.message.includes("VP8") === true, "y dice qué le falta");
  const tiff = new Uint8Array([0x49, 0x49, 42, 0, 8, 0, 0, 0]);
  ok(refusal(() => cadRasterDecode(tiff))?.code === "unsupported_format", "el TIFF también se rechaza diciéndolo");
}

/* ── Desde el data: con el que la imagen viaja dentro del dibujo ────────── */
{
  const png = cadPngFixture(2, 2, () => [12, 34, 56, 255]);
  const image = cadRasterDecodeDataUri(cadImageDataUri("image/png", png));
  eq(pixelAt(image, 1, 1), [12, 34, 56, 255], "el data: de IMAGEATTACH entra en el decodificador tal cual");
  ok(refusal(() => cadRasterDecodeDataUri("https://ejemplo.mx/plano.png"))?.code === "unknown_format", "un http(s) se rechaza: el motor no sale a la red");
  ok(refusal(() => cadRasterDecodeDataUri("data:image/png,%89PNG"))?.code === "unsupported_format", "un data: sin base64 se dice");
}

/**
 * Un PNG con su IDAT ya filtrado, para probar lo que el fabricante de
 * archivos válidos no emite (los cinco filtros, el entrelazado, un tamaño que
 * pasa del tope). Reusa el zlib de bloques almacenados del propio fabricante.
 */
function pngWithRawIdat(width: number, height: number, bitDepth: number, colorType: number, filtered: Uint8Array, interlace = 0): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[12] = interlace;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlibStored(filtered)), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function zlibStored(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + 5 + data.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  out[2] = 1;
  out[3] = data.length & 0xff;
  out[4] = (data.length >> 8) & 0xff;
  out[5] = ~data.length & 0xff;
  out[6] = (~data.length >> 8) & 0xff;
  out.set(data, 7);
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65_521;
    b = (b + a) % 65_521;
  }
  new DataView(out.buffer).setUint32(7 + data.length, ((b << 16) | a) >>> 0);
  return out;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

console.log(
  `raster-decode: ${checks} comprobaciones · el mismo píxel por PNG gris/RGB/paleta/RGBA y BMP 24; los cinco filtros; 1 y 4 bits; BMP con relleno, indexado y de arriba abajo; cortado, CRC tocado, Adam7, RLE y 36 Mpx fallan CERRADO; JPEG, GIF, WebP y TIFF rechazados con su motivo`,
);
