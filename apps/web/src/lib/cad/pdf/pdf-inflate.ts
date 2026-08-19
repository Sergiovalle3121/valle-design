/**
 * INFLATE (RFC 1951) y su envoltorio zlib (RFC 1950), escritos aquí a mano.
 *
 * ## Por qué no una dependencia
 *
 * Casi todo PDF que llega a un despacho trae sus flujos con `/FlateDecode`. Sin
 * descomprimir no hay nada que leer: `pdf-measure.ts` ya se topó con esa pared y
 * decidió, con buen criterio, EXIGIR el PDF sin comprimir porque sólo tenía que
 * medir lo que nosotros mismos emitimos. Importar el PDF AJENO no tiene esa
 * salida: el archivo llega como llega.
 *
 * Las tres vías eran una dependencia de npm, el códec de la plataforma, o esto.
 *
 *  - **Dependencia**: `npm run check:licenses` bloquea licencias no permitidas y
 *    parte del ecosistema PDF de JavaScript es AGPL. Añadir un paquete para 200
 *    líneas de algoritmo publicado en un RFC de 1996 es cargar un árbol de
 *    dependencias, una superficie de suministro y una revisión legal a cambio de
 *    nada.
 *  - **Códec de la plataforma**: `node:zlib` no existe en el navegador y
 *    `DecompressionStream` es ASÍNCRONO. El lector de PDF se llama desde el
 *    intérprete de un flujo de contenido —dentro de un bucle sobre operadores—
 *    y volverlo asíncrono de punta a punta contagiaría a todo el importador.
 *    `plot-style-table.ts` resuelve lo suyo INYECTANDO un códec porque una
 *    tabla de plumas se abre una vez; un PDF descomprime un flujo por página,
 *    por XObject y por objeto comprimido.
 *  - **Esto**: síncrono, isomorfo, sin dependencias, y comprobado contra
 *    `node:zlib` en su spec con datos aleatorios y con los tres tipos de bloque.
 *
 * ## Fallo cerrado
 *
 * Un flujo corrupto NO devuelve los bytes que hubiera logrado sacar. Devolver
 * medio flujo de contenido produciría un plano a medio dibujar que parece
 * completo, que es exactamente la mentira que este producto no comete. Se lanza
 * `CadPdfInflateError` con el motivo y quien llama decide.
 *
 * La comprobación Adler-32 del envoltorio zlib se VERIFICA. Es barata y es la
 * única señal de que lo descomprimido es lo que se comprimió; saltársela
 * convertiría un archivo truncado en geometría plausible.
 */

/** El flujo comprimido no se pudo descomprimir. Explícito: a medias es peor. */
export class CadPdfInflateError extends Error {
  constructor(
    readonly code:
      | "zlib_header"
      | "block_type"
      | "stored_length"
      | "huffman_code"
      | "distance_range"
      | "truncated"
      | "checksum",
    detail: string,
  ) {
    super(detail);
    this.name = "CadPdfInflateError";
  }
}

/**
 * Lector de bits en orden LSB-primero, que es el de DEFLATE.
 *
 * Se lee bit a bit y no por tablas de consulta: un flujo de contenido de una
 * lámina son decenas de kilobytes, no megabytes, y la claridad vale más aquí
 * que los microsegundos. La medición está en el spec, no en la intuición.
 */
class BitReader {
  private bitPosition = 0;

  constructor(
    private readonly data: Uint8Array,
    private bytePosition: number,
  ) {}

  /** Un bit. Agotar los bytes es un fallo, no un cero implícito. */
  bit(): number {
    if (this.bytePosition >= this.data.length)
      throw new CadPdfInflateError(
        "truncated",
        "El flujo comprimido se acaba en mitad de un bloque: el archivo está truncado.",
      );
    const value = (this.data[this.bytePosition] >> this.bitPosition) & 1;
    this.bitPosition += 1;
    if (this.bitPosition === 8) {
      this.bitPosition = 0;
      this.bytePosition += 1;
    }
    return value;
  }

  bits(count: number): number {
    let value = 0;
    for (let index = 0; index < count; index += 1) value |= this.bit() << index;
    return value;
  }

  /** Descarta lo que quede del byte en curso (lo que exige un bloque STORED). */
  alignToByte(): void {
    if (this.bitPosition !== 0) {
      this.bitPosition = 0;
      this.bytePosition += 1;
    }
  }

  get byteOffset(): number {
    return this.bytePosition;
  }

  set byteOffset(value: number) {
    this.bytePosition = value;
  }
}

/**
 * Árbol de Huffman canónico en la forma «cuántos códigos de cada longitud» +
 * «símbolos ordenados». Es la representación de la propia RFC y evita construir
 * un árbol de nodos: con las dos tablas se decodifica avanzando longitud a
 * longitud, que es lo que hace `decodeSymbol`.
 */
interface Huffman {
  counts: Int32Array;
  symbols: Int32Array;
}

const MAX_BITS = 15;

function buildHuffman(lengths: Uint8Array): Huffman {
  const counts = new Int32Array(MAX_BITS + 1);
  for (const length of lengths) counts[length] += 1;
  // La longitud 0 significa «este símbolo no aparece»; contarla desplazaría
  // todos los desplazamientos y el árbol decodificaría basura coherente.
  counts[0] = 0;
  const offsets = new Int32Array(MAX_BITS + 2);
  for (let length = 1; length <= MAX_BITS; length += 1)
    offsets[length + 1] = offsets[length] + counts[length];
  const symbols = new Int32Array(lengths.length);
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol];
    if (length) {
      symbols[offsets[length]] = symbol;
      offsets[length] += 1;
    }
  }
  return { counts, symbols };
}

function decodeSymbol(reader: BitReader, huffman: Huffman): number {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let length = 1; length <= MAX_BITS; length += 1) {
    code |= reader.bit();
    const count = huffman.counts[length];
    if (code - first < count) return huffman.symbols[index + (code - first)];
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }
  throw new CadPdfInflateError(
    "huffman_code",
    "Un código Huffman del flujo no está en la tabla: el flujo comprimido no es DEFLATE válido.",
  );
}

/** Longitudes base y bits extra de los símbolos 257..285. Tabla de la RFC. */
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
/** Orden en que un bloque dinámico escribe las longitudes del alfabeto de códigos. */
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

let fixedLiteral: Huffman | null = null;
let fixedDistance: Huffman | null = null;

/** Árboles del bloque de Huffman FIJO. Se construyen una vez y se reutilizan. */
function fixedTrees(): { literal: Huffman; distance: Huffman } {
  if (!fixedLiteral || !fixedDistance) {
    const literalLengths = new Uint8Array(288);
    literalLengths.fill(8, 0, 144);
    literalLengths.fill(9, 144, 256);
    literalLengths.fill(7, 256, 280);
    literalLengths.fill(8, 280, 288);
    fixedLiteral = buildHuffman(literalLengths);
    fixedDistance = buildHuffman(new Uint8Array(30).fill(5));
  }
  return { literal: fixedLiteral, distance: fixedDistance };
}

/** Buffer de salida que crece al doble. Un PDF no dice cuánto va a ocupar. */
class Sink {
  private buffer = new Uint8Array(1 << 16);
  private length = 0;

  private ensure(extra: number): void {
    if (this.length + extra <= this.buffer.length) return;
    let capacity = this.buffer.length;
    while (capacity < this.length + extra) capacity *= 2;
    const grown = new Uint8Array(capacity);
    grown.set(this.buffer.subarray(0, this.length));
    this.buffer = grown;
  }

  push(byte: number): void {
    this.ensure(1);
    this.buffer[this.length] = byte;
    this.length += 1;
  }

  append(chunk: Uint8Array): void {
    this.ensure(chunk.length);
    this.buffer.set(chunk, this.length);
    this.length += chunk.length;
  }

  /** Copia hacia atrás. Se copia BYTE A BYTE a propósito: en DEFLATE la
   * distancia puede ser menor que la longitud y el solapamiento es el mecanismo
   * con el que se repite un patrón corto. Un `copyWithin` daría otro resultado. */
  copyBack(distance: number, length: number): void {
    if (distance > this.length)
      throw new CadPdfInflateError(
        "distance_range",
        "El flujo pide copiar de antes del principio: está corrupto.",
      );
    this.ensure(length);
    let from = this.length - distance;
    for (let index = 0; index < length; index += 1) {
      this.buffer[this.length] = this.buffer[from];
      this.length += 1;
      from += 1;
    }
  }

  take(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }

  get size(): number {
    return this.length;
  }
}

function readDynamicTrees(reader: BitReader): { literal: Huffman; distance: Huffman } {
  const literalCount = reader.bits(5) + 257;
  const distanceCount = reader.bits(5) + 1;
  const codeCount = reader.bits(4) + 4;

  const codeLengths = new Uint8Array(19);
  for (let index = 0; index < codeCount; index += 1)
    codeLengths[CODE_LENGTH_ORDER[index]] = reader.bits(3);
  const codeTree = buildHuffman(codeLengths);

  const lengths = new Uint8Array(literalCount + distanceCount);
  let index = 0;
  while (index < lengths.length) {
    const symbol = decodeSymbol(reader, codeTree);
    if (symbol < 16) {
      lengths[index] = symbol;
      index += 1;
      continue;
    }
    let repeat: number;
    let value = 0;
    if (symbol === 16) {
      if (index === 0)
        throw new CadPdfInflateError(
          "huffman_code",
          "El flujo repite una longitud anterior que no existe.",
        );
      value = lengths[index - 1];
      repeat = reader.bits(2) + 3;
    } else if (symbol === 17) repeat = reader.bits(3) + 3;
    else repeat = reader.bits(7) + 11;
    if (index + repeat > lengths.length)
      throw new CadPdfInflateError("huffman_code", "La tabla de longitudes del flujo se desborda.");
    lengths.fill(value, index, index + repeat);
    index += repeat;
  }

  return {
    literal: buildHuffman(lengths.subarray(0, literalCount)),
    distance: buildHuffman(lengths.subarray(literalCount)),
  };
}

/**
 * DEFLATE crudo, sin envoltorio. `from` es el byte donde empieza el flujo.
 */
export function cadPdfInflateRaw(data: Uint8Array, from = 0): Uint8Array {
  const reader = new BitReader(data, from);
  const sink = new Sink();
  for (;;) {
    const final = reader.bit();
    const type = reader.bits(2);

    if (type === 0) {
      reader.alignToByte();
      const start = reader.byteOffset;
      if (start + 4 > data.length)
        throw new CadPdfInflateError("truncated", "Un bloque sin comprimir se corta en su cabecera.");
      const length = data[start] | (data[start + 1] << 8);
      const complement = data[start + 2] | (data[start + 3] << 8);
      // LEN y ~LEN tienen que ser complementarios. Es la única defensa del
      // formato contra leer basura como si fuera un bloque legítimo.
      if ((length ^ 0xffff) !== complement)
        throw new CadPdfInflateError(
          "stored_length",
          "La longitud de un bloque sin comprimir no cuadra con su complemento.",
        );
      if (start + 4 + length > data.length)
        throw new CadPdfInflateError("truncated", "Un bloque sin comprimir declara más bytes de los que hay.");
      sink.append(data.subarray(start + 4, start + 4 + length));
      reader.byteOffset = start + 4 + length;
    } else if (type === 1 || type === 2) {
      const trees = type === 1 ? fixedTrees() : readDynamicTrees(reader);
      for (;;) {
        const symbol = decodeSymbol(reader, trees.literal);
        if (symbol === 256) break;
        if (symbol < 256) {
          sink.push(symbol);
          continue;
        }
        const lengthIndex = symbol - 257;
        if (lengthIndex >= LENGTH_BASE.length)
          throw new CadPdfInflateError("huffman_code", "Símbolo de longitud fuera de la tabla.");
        const length = LENGTH_BASE[lengthIndex] + reader.bits(LENGTH_EXTRA[lengthIndex]);
        const distanceSymbol = decodeSymbol(reader, trees.distance);
        if (distanceSymbol >= DISTANCE_BASE.length)
          throw new CadPdfInflateError("distance_range", "Símbolo de distancia fuera de la tabla.");
        const distance =
          DISTANCE_BASE[distanceSymbol] + reader.bits(DISTANCE_EXTRA[distanceSymbol]);
        sink.copyBack(distance, length);
      }
    } else {
      throw new CadPdfInflateError(
        "block_type",
        "El flujo declara un tipo de bloque reservado: no es DEFLATE válido.",
      );
    }

    if (final) {
      reader.alignToByte();
      return sink.take();
    }
  }
}

/** Adler-32 del envoltorio zlib. `65521` es el primo que fija la RFC 1950. */
function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  // Se reduce cada 5552 bytes: es el máximo antes de que `b` desborde los 32
  // bits en coma flotante de un `number`, y desbordar daría una suma falsa que
  // haría fallar archivos correctos.
  for (let start = 0; start < data.length; start += 5552) {
    const end = Math.min(start + 5552, data.length);
    for (let index = start; index < end; index += 1) {
      a += data[index];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** `true` si los dos primeros bytes son una cabecera zlib legítima. */
export function cadPdfHasZlibHeader(data: Uint8Array): boolean {
  if (data.length < 2) return false;
  // Método 8 (deflate) en los 4 bits bajos, y la palabra de 16 bits múltiplo de
  // 31: es la comprobación que fija la RFC y la misma que ya usa el lector de
  // tablas de plumas para localizar su flujo.
  return (data[0] & 0x0f) === 8 && (((data[0] << 8) | data[1]) % 31 === 0);
}

/**
 * Flujo zlib completo: cabecera, DEFLATE y Adler-32 verificado.
 *
 * Los PDF del mundo real llevan la cabecera zlib, pero HAY escritores que
 * emiten DEFLATE crudo detrás de un `/FlateDecode`. Se acepta ese caso y se
 * DECLARA en el resultado, porque un flujo sin envoltorio no trae suma de
 * comprobación y su lectura vale menos que la del que sí la trae.
 */
export interface CadPdfInflateResult {
  data: Uint8Array;
  /** `false` cuando venía como DEFLATE crudo, sin cabecera ni Adler-32. */
  zlibWrapped: boolean;
  /** `true` sólo si había Adler-32 y coincidió. */
  checksumVerified: boolean;
}

export function cadPdfInflate(data: Uint8Array): CadPdfInflateResult {
  if (!cadPdfHasZlibHeader(data)) {
    // Sin envoltorio se intenta DEFLATE crudo. Si tampoco lo es, el error sale
    // del propio inflado y dice qué encontró — mejor que un «cabecera inválida»
    // que culparía al envoltorio de un problema del contenido.
    return { data: cadPdfInflateRaw(data, 0), zlibWrapped: false, checksumVerified: false };
  }
  if ((data[1] & 0x20) !== 0)
    throw new CadPdfInflateError(
      "zlib_header",
      "El flujo usa un diccionario preestablecido, que ningún PDF debería emitir.",
    );
  const inflated = cadPdfInflateRaw(data, 2);
  const tail = data.length - 4;
  if (tail < 2) return { data: inflated, zlibWrapped: true, checksumVerified: false };
  const expected =
    ((data[tail] << 24) | (data[tail + 1] << 16) | (data[tail + 2] << 8) | data[tail + 3]) >>> 0;
  const actual = adler32(inflated);
  if (expected !== actual)
    throw new CadPdfInflateError(
      "checksum",
      "La suma de comprobación del flujo no cuadra: el PDF está dañado y lo descomprimido no es de fiar.",
    );
  return { data: inflated, zlibWrapped: true, checksumVerified: true };
}

/**
 * Envuelve datos en un flujo zlib con bloques ALMACENADOS (sin comprimir).
 *
 * No es un compresor: es lo mínimo para que el corpus sintético pueda emitir un
 * PDF con `/FlateDecode` de verdad —que el lector tiene que inflar— sin
 * arrastrar un compresor entero ni depender de `node:zlib`, que no existe en el
 * navegador. Un bloque almacenado ES DEFLATE válido; lo que no es, es pequeño, y
 * eso da igual en un archivo de prueba.
 */
export function cadPdfZlibStored(data: Uint8Array): Uint8Array {
  const MAX_BLOCK = 65535;
  const blocks = Math.max(1, Math.ceil(data.length / MAX_BLOCK));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  // 0x78 0x01: método deflate, ventana de 32 KiB, sin diccionario, nivel rápido.
  // La palabra resultante es múltiplo de 31, que es lo que exige la RFC.
  out[0] = 0x78;
  out[1] = 0x01;
  let cursor = 2;
  for (let index = 0; index < blocks; index += 1) {
    const start = index * MAX_BLOCK;
    const length = Math.min(MAX_BLOCK, data.length - start);
    out[cursor] = index === blocks - 1 ? 1 : 0;
    out[cursor + 1] = length & 0xff;
    out[cursor + 2] = (length >> 8) & 0xff;
    out[cursor + 3] = ~length & 0xff;
    out[cursor + 4] = (~length >> 8) & 0xff;
    cursor += 5;
    out.set(data.subarray(start, start + length), cursor);
    cursor += length;
  }
  const checksum = adler32(data);
  out[cursor] = (checksum >>> 24) & 0xff;
  out[cursor + 1] = (checksum >>> 16) & 0xff;
  out[cursor + 2] = (checksum >>> 8) & 0xff;
  out[cursor + 3] = checksum & 0xff;
  return out.subarray(0, cursor + 4);
}
