/**
 * La capa de OBJETOS de un PDF: qué hay dentro del archivo, antes de saber qué
 * significa.
 *
 * ## Por qué no se lee la tabla de referencias cruzadas
 *
 * Un PDF «bien formado» se lee por su `startxref`: al final del archivo hay un
 * desplazamiento a una tabla que dice en qué byte vive cada objeto. Ese camino
 * es el correcto y es el que falla primero con archivos reales. Un PDF que pasó
 * por un firmante, por una impresora virtual o por una descarga interrumpida
 * tiene la tabla desfasada, y entonces el lector salta a un byte que ya no es el
 * principio de nada. AutoCAD abre esos PDF; nosotros también tenemos que.
 *
 * Así que se BARRE el archivo buscando `N G obj … endobj`. Es más lento —una
 * pasada sobre el archivo entero— y es inmune a una tabla mentirosa. Cuando el
 * mismo objeto aparece dos veces (un PDF con actualizaciones incrementales trae
 * varias versiones del mismo número), gana la ÚLTIMA, que es lo que dice la
 * especificación y lo que hace cualquier visor.
 *
 * ## Los objetos comprimidos
 *
 * Desde PDF 1.5 lo normal es que las páginas no estén sueltas: viven dentro de
 * un `/Type /ObjStm`, un flujo comprimido con varios objetos dentro. Un lector
 * que sólo barra `obj` en el archivo NO ENCUENTRA LAS PÁGINAS de un PDF moderno
 * y concluiría «este PDF no tiene páginas», que es falso. Se expanden.
 *
 * ## Fallo cerrado en los filtros
 *
 * Un filtro que no se sabe deshacer NO devuelve los bytes crudos como si fueran
 * el contenido. Se marca el flujo como ilegible con su motivo. Interpretar bytes
 * LZW como si fueran operadores de camino produciría trazos aleatorios: un plano
 * inventado, que es la peor forma de fallar que tiene un CAD.
 */
import { CadPdfInflateError, cadPdfInflate } from "./pdf-inflate";

// ---------------------------------------------------------------------------
// Modelo de objetos
// ---------------------------------------------------------------------------

export type CadPdfValue =
  | { kind: "null" }
  | { kind: "bool"; value: boolean }
  | { kind: "number"; value: number }
  /** Cadena literal o hexadecimal, ya sin escapes. Bytes, no texto: sin el
   * `/Encoding` de su fuente no se sabe qué caracteres son. */
  | { kind: "string"; bytes: Uint8Array }
  | { kind: "name"; name: string }
  | { kind: "array"; items: CadPdfValue[] }
  | { kind: "dict"; entries: Map<string, CadPdfValue> }
  | { kind: "stream"; entries: Map<string, CadPdfValue>; raw: Uint8Array }
  | { kind: "ref"; num: number; gen: number };

export const CAD_PDF_NULL: CadPdfValue = { kind: "null" };

/** El archivo no se pudo leer como PDF. Explícito: a medias es peor. */
export class CadPdfObjectError extends Error {
  constructor(
    readonly code: "not_pdf" | "no_objects" | "no_pages" | "encrypted",
    detail: string,
  ) {
    super(detail);
    this.name = "CadPdfObjectError";
  }
}

// ---------------------------------------------------------------------------
// Léxico
// ---------------------------------------------------------------------------

const SPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

const isSpace = (byte: number) => SPACE.has(byte);
const isDelim = (byte: number) => DELIM.has(byte);
const isRegular = (byte: number) => !isSpace(byte) && !isDelim(byte);

/**
 * Analizador descendente sobre los BYTES del archivo.
 *
 * Trabaja con desplazamientos y no con una cadena porque un flujo comprimido es
 * binario: convertirlo a texto para volver a bytes pierde información en cuanto
 * alguien use una codificación que no sea latin-1.
 */
export class CadPdfLexer {
  constructor(
    readonly data: Uint8Array,
    public position = 0,
  ) {}

  skipSpace(): void {
    for (;;) {
      while (this.position < this.data.length && isSpace(this.data[this.position]))
        this.position += 1;
      // Un comentario `%` llega hasta el fin de línea. Sin saltarlo, un `%%EOF`
      // dentro de un objeto se leería como un nombre.
      if (this.data[this.position] !== 0x25) return;
      while (this.position < this.data.length && this.data[this.position] !== 0x0a && this.data[this.position] !== 0x0d)
        this.position += 1;
    }
  }

  /** La palabra regular que empieza en el cursor, sin consumirla. */
  peekWord(): string {
    this.skipSpace();
    let end = this.position;
    while (end < this.data.length && isRegular(this.data[end])) end += 1;
    return latin1(this.data, this.position, end);
  }

  private readWord(): string {
    this.skipSpace();
    const start = this.position;
    while (this.position < this.data.length && isRegular(this.data[this.position]))
      this.position += 1;
    if (this.position === start) this.position += 1; // no atascarse en un byte raro
    return latin1(this.data, start, this.position);
  }

  /**
   * La siguiente palabra regular, CONSUMIÉNDOLA.
   *
   * La usa el intérprete de flujos de contenido para leer un operador (`m`,
   * `re`, `Tj`). Está aquí y no allí porque saltarse espacios y comentarios
   * exactamente igual que el analizador de objetos es lo que evita que los dos
   * lean el mismo archivo de dos maneras.
   */
  readOperator(): string {
    return this.readWord();
  }

  /** `true` si el cursor está sobre algo que puede empezar un valor. */
  atValue(): boolean {
    this.skipSpace();
    const byte = this.data[this.position];
    if (byte === undefined) return false;
    return (
      byte === 0x2f || byte === 0x28 || byte === 0x5b || byte === 0x3c ||
      (byte >= 0x30 && byte <= 0x39) || byte === 0x2b || byte === 0x2d || byte === 0x2e
    );
  }

  private readName(): string {
    this.position += 1; // la `/`
    const start = this.position;
    while (this.position < this.data.length && isRegular(this.data[this.position]))
      this.position += 1;
    // `#41` es una `A`. Los nombres con acentos o espacios llegan así, y sin
    // deshacerlo una capa opcional llamada «Planta baja» no se reconocería.
    return latin1(this.data, start, this.position).replace(/#([0-9A-Fa-f]{2})/g, (_all, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  }

  private readLiteralString(): Uint8Array {
    this.position += 1; // el `(`
    const out: number[] = [];
    let depth = 1;
    while (this.position < this.data.length) {
      const byte = this.data[this.position];
      this.position += 1;
      if (byte === 0x5c) {
        const escaped = this.data[this.position];
        this.position += 1;
        if (escaped >= 0x30 && escaped <= 0x37) {
          let octal = escaped - 0x30;
          for (let extra = 0; extra < 2; extra += 1) {
            const next = this.data[this.position];
            if (next === undefined || next < 0x30 || next > 0x37) break;
            octal = octal * 8 + (next - 0x30);
            this.position += 1;
          }
          out.push(octal & 0xff);
        } else if (escaped === 0x6e) out.push(0x0a);
        else if (escaped === 0x72) out.push(0x0d);
        else if (escaped === 0x74) out.push(0x09);
        else if (escaped === 0x62) out.push(0x08);
        else if (escaped === 0x66) out.push(0x0c);
        else if (escaped === 0x0a) continue; // continuación de línea
        else if (escaped === 0x0d) {
          if (this.data[this.position] === 0x0a) this.position += 1;
          continue;
        } else out.push(escaped);
        continue;
      }
      if (byte === 0x28) depth += 1;
      if (byte === 0x29) {
        depth -= 1;
        if (depth === 0) break;
      }
      out.push(byte);
    }
    return Uint8Array.from(out);
  }

  private readHexString(): Uint8Array {
    this.position += 1; // el `<`
    const digits: number[] = [];
    while (this.position < this.data.length && this.data[this.position] !== 0x3e) {
      const byte = this.data[this.position];
      this.position += 1;
      const digit =
        byte >= 0x30 && byte <= 0x39
          ? byte - 0x30
          : byte >= 0x41 && byte <= 0x46
            ? byte - 0x37
            : byte >= 0x61 && byte <= 0x66
              ? byte - 0x57
              : -1;
      if (digit >= 0) digits.push(digit);
    }
    this.position += 1; // el `>`
    // Un dígito impar final se completa con cero: lo dice la especificación y
    // hay escritores que lo emiten.
    if (digits.length % 2) digits.push(0);
    const out = new Uint8Array(digits.length / 2);
    for (let index = 0; index < out.length; index += 1)
      out[index] = (digits[index * 2] << 4) | digits[index * 2 + 1];
    return out;
  }

  /** Un valor. `null` cuando el cursor está sobre algo que no lo es. */
  parseValue(depth = 0): CadPdfValue | null {
    this.skipSpace();
    if (this.position >= this.data.length) return null;
    // Un PDF malicioso o dañado puede anidar arrays sin fin. El límite es la
    // diferencia entre un error legible y un desbordamiento de pila.
    if (depth > 64) return CAD_PDF_NULL;
    const byte = this.data[this.position];

    if (byte === 0x2f) return { kind: "name", name: this.readName() };
    if (byte === 0x28) return { kind: "string", bytes: this.readLiteralString() };
    if (byte === 0x5b) {
      this.position += 1;
      const items: CadPdfValue[] = [];
      for (;;) {
        this.skipSpace();
        if (this.position >= this.data.length) break;
        if (this.data[this.position] === 0x5d) {
          this.position += 1;
          break;
        }
        const item = this.parseValue(depth + 1);
        if (!item) break;
        items.push(item);
      }
      return { kind: "array", items };
    }
    if (byte === 0x3c) {
      if (this.data[this.position + 1] !== 0x3c)
        return { kind: "string", bytes: this.readHexString() };
      this.position += 2;
      const entries = new Map<string, CadPdfValue>();
      for (;;) {
        this.skipSpace();
        if (this.position >= this.data.length) break;
        if (this.data[this.position] === 0x3e) {
          this.position += 2;
          break;
        }
        if (this.data[this.position] !== 0x2f) {
          // Basura dentro de un diccionario: se salta un byte para no colgarse.
          // Un PDF dañado no puede convertirse en un bucle infinito.
          this.position += 1;
          continue;
        }
        const key = this.readName();
        const value = this.parseValue(depth + 1);
        entries.set(key, value ?? CAD_PDF_NULL);
      }
      return this.maybeStream(entries);
    }
    if (byte === 0x5d || byte === 0x3e || byte === 0x29) return null;

    const word = this.readWord();
    if (word === "true") return { kind: "bool", value: true };
    if (word === "false") return { kind: "bool", value: false };
    if (word === "null") return CAD_PDF_NULL;
    if (/^[-+.\d]/.test(word)) {
      const value = Number(word.replace(/^--+/, "-"));
      if (!Number.isFinite(value)) return CAD_PDF_NULL;
      // `12 0 R` es una referencia y `12 0` son dos números. Se mira adelante
      // sin consumir: confundirlos rompería toda la resolución de páginas.
      if (Number.isInteger(value) && value >= 0) {
        const save = this.position;
        this.skipSpace();
        const generationStart = this.position;
        const generation = this.readWord();
        if (/^\d+$/.test(generation)) {
          this.skipSpace();
          if (this.data[this.position] === 0x52 && !isRegular(this.data[this.position + 1] ?? 0x20)) {
            this.position += 1;
            return { kind: "ref", num: value, gen: Number(generation) };
          }
        }
        this.position = generation === "" ? save : generationStart;
        this.position = save;
      }
      return { kind: "number", value };
    }
    return CAD_PDF_NULL;
  }

  /** Si tras el diccionario viene `stream`, se queda con sus bytes crudos. */
  private maybeStream(entries: Map<string, CadPdfValue>): CadPdfValue {
    const save = this.position;
    this.skipSpace();
    if (this.peekWord() !== "stream") {
      this.position = save;
      return { kind: "dict", entries };
    }
    this.position += "stream".length;
    if (this.data[this.position] === 0x0d) this.position += 1;
    if (this.data[this.position] === 0x0a) this.position += 1;
    const start = this.position;

    // `/Length` se cree sólo si CUADRA con un `endstream`. Es indirecto en la
    // mitad de los PDF, y hay escritores que lo dejan mal tras editar el
    // archivo: fiarse a ciegas corta el flujo por donde no es y el contenido
    // resultante se lee como geometría incompleta sin que nadie lo note.
    const declared = entries.get("Length");
    let end = -1;
    if (declared?.kind === "number") {
      const candidate = start + declared.value;
      if (candidate <= this.data.length && findKeyword(this.data, "endstream", candidate, candidate + 20) >= 0)
        end = candidate;
    }
    if (end < 0) {
      const found = findKeyword(this.data, "endstream", start, this.data.length);
      end = found < 0 ? this.data.length : found;
      // El EOL que precede a `endstream` no es del flujo.
      while (end > start && (this.data[end - 1] === 0x0a || this.data[end - 1] === 0x0d)) end -= 1;
    }
    this.position = end;
    const closing = findKeyword(this.data, "endstream", end, Math.min(end + 32, this.data.length));
    this.position = closing >= 0 ? closing + "endstream".length : end;
    return { kind: "stream", entries, raw: this.data.subarray(start, end) };
  }
}

function latin1(data: Uint8Array, from: number, to: number): string {
  let text = "";
  const CHUNK = 8192;
  for (let index = from; index < to; index += CHUNK)
    text += String.fromCharCode(...data.subarray(index, Math.min(index + CHUNK, to)));
  return text;
}

/** Primer byte donde aparece la palabra, o `-1`. Búsqueda directa sobre bytes. */
function findKeyword(data: Uint8Array, word: string, from: number, to: number): number {
  const needle = Uint8Array.from(word, (c) => c.charCodeAt(0));
  const limit = Math.min(to, data.length) - needle.length;
  outer: for (let index = Math.max(0, from); index <= limit; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1)
      if (data[index + offset] !== needle[offset]) continue outer;
    return index;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/** Filtros que NO se deshacen aquí, con lo que significan para el usuario. */
const IMAGE_FILTERS = new Set(["DCTDecode", "JPXDecode", "CCITTFaxDecode", "JBIG2Decode"]);

export interface CadPdfStreamData {
  data: Uint8Array;
  /** Motivo por el que el flujo NO se pudo leer, en español. `null` si se leyó. */
  unreadable: string | null;
  /** `true` si el último filtro es un códec de imagen: son píxeles, no trazos. */
  imagePayload: boolean;
}

function asciiHexDecode(data: Uint8Array): Uint8Array {
  const digits: number[] = [];
  for (const byte of data) {
    if (byte === 0x3e) break;
    const digit =
      byte >= 0x30 && byte <= 0x39
        ? byte - 0x30
        : byte >= 0x41 && byte <= 0x46
          ? byte - 0x37
          : byte >= 0x61 && byte <= 0x66
            ? byte - 0x57
            : -1;
    if (digit >= 0) digits.push(digit);
  }
  if (digits.length % 2) digits.push(0);
  const out = new Uint8Array(digits.length / 2);
  for (let index = 0; index < out.length; index += 1)
    out[index] = (digits[index * 2] << 4) | digits[index * 2 + 1];
  return out;
}

function ascii85Decode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let group: number[] = [];
  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index];
    if (byte === 0x7e) break; // `~>`
    if (isSpace(byte)) continue;
    if (byte === 0x7a && group.length === 0) {
      out.push(0, 0, 0, 0); // `z` son cuatro ceros
      continue;
    }
    if (byte < 0x21 || byte > 0x75) continue;
    group.push(byte - 0x21);
    if (group.length === 5) {
      let value = 0;
      for (const digit of group) value = value * 85 + digit;
      out.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
      group = [];
    }
  }
  if (group.length > 1) {
    const missing = 5 - group.length;
    for (let index = 0; index < missing; index += 1) group.push(84);
    let value = 0;
    for (const digit of group) value = value * 85 + digit;
    const bytes = [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
    out.push(...bytes.slice(0, 4 - missing));
  }
  return Uint8Array.from(out);
}

function runLengthDecode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let index = 0;
  while (index < data.length) {
    const length = data[index];
    index += 1;
    if (length === 128) break;
    if (length < 128) {
      for (let step = 0; step <= length; step += 1) out.push(data[index + step] ?? 0);
      index += length + 1;
    } else {
      const byte = data[index] ?? 0;
      index += 1;
      for (let step = 0; step < 257 - length; step += 1) out.push(byte);
    }
  }
  return Uint8Array.from(out);
}

/**
 * LZW del PDF. Es el filtro de los PDF anteriores a 1.2 y de algunos
 * exportadores de CAD antiguos, que es justo el plano de 1995 que un despacho
 * mexicano todavía tiene en el archivero.
 *
 * `earlyChange` (por defecto 1) es la peculiaridad histórica: el ancho de
 * código sube UN código antes de lo que dicta el algoritmo original. Ignorarlo
 * descoloca el diccionario a partir del código 511 y a partir de ahí sale
 * basura estructurada — legible como operadores, y falsa.
 */
function lzwDecode(data: Uint8Array, earlyChange: number): Uint8Array {
  const out: number[] = [];
  const dictionary: number[][] = [];
  const reset = () => {
    dictionary.length = 0;
    for (let index = 0; index < 256; index += 1) dictionary.push([index]);
    dictionary.push([], []); // 256 = limpiar, 257 = fin
  };
  reset();
  let codeWidth = 9;
  let previous: number[] | null = null;
  let bitBuffer = 0;
  let bitCount = 0;
  for (let index = 0; index <= data.length; index += 1) {
    if (index < data.length) {
      bitBuffer = (bitBuffer << 8) | data[index];
      bitCount += 8;
    } else if (bitCount < codeWidth) break;
    while (bitCount >= codeWidth) {
      const code = (bitBuffer >> (bitCount - codeWidth)) & ((1 << codeWidth) - 1);
      bitCount -= codeWidth;
      if (code === 256) {
        reset();
        codeWidth = 9;
        previous = null;
        continue;
      }
      if (code === 257) return Uint8Array.from(out);
      let entry: number[];
      if (code < dictionary.length) entry = dictionary[code];
      else if (previous) entry = [...previous, previous[0]];
      else return Uint8Array.from(out);
      out.push(...entry);
      if (previous) dictionary.push([...previous, entry[0]]);
      previous = entry;
      if (dictionary.length + earlyChange >= 1 << codeWidth && codeWidth < 12) codeWidth += 1;
    }
  }
  return Uint8Array.from(out);
}

/**
 * Deshace el predictor PNG/TIFF que acompaña a `/FlateDecode` y a `/LZWDecode`.
 *
 * Sin esto, un flujo con predictor sale como ruido con estructura: cada byte es
 * la DIFERENCIA con el de la fila anterior, no su valor. Se leería como
 * coordenadas perfectamente numéricas y completamente falsas.
 */
function undoPredictor(
  data: Uint8Array,
  predictor: number,
  colors: number,
  bitsPerComponent: number,
  columns: number,
): Uint8Array {
  if (predictor < 2) return data;
  const bytesPerPixel = Math.max(1, Math.ceil((colors * bitsPerComponent) / 8));
  const rowLength = Math.ceil((colors * bitsPerComponent * columns) / 8);
  if (predictor === 2) {
    // TIFF: sólo se define aquí el caso de 8 bits, que es el único que emiten
    // los escritores de PDF. Otro ancho se devuelve tal cual y quien llama lo
    // declara ilegible antes que entregar píxeles inventados.
    if (bitsPerComponent !== 8) return data;
    const out = data.slice();
    for (let row = 0; row + rowLength <= out.length; row += rowLength)
      for (let index = bytesPerPixel; index < rowLength; index += 1)
        out[row + index] = (out[row + index] + out[row + index - bytesPerPixel]) & 0xff;
    return out;
  }
  const rows = Math.floor(data.length / (rowLength + 1));
  const out = new Uint8Array(rows * rowLength);
  let previousRow = new Uint8Array(rowLength);
  for (let row = 0; row < rows; row += 1) {
    const tag = data[row * (rowLength + 1)];
    const source = data.subarray(row * (rowLength + 1) + 1, (row + 1) * (rowLength + 1));
    const current = new Uint8Array(rowLength);
    for (let index = 0; index < rowLength; index += 1) {
      const raw = source[index] ?? 0;
      const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0;
      const up = previousRow[index];
      const upLeft = index >= bytesPerPixel ? previousRow[index - bytesPerPixel] : 0;
      let value: number;
      if (tag === 0) value = raw;
      else if (tag === 1) value = raw + left;
      else if (tag === 2) value = raw + up;
      else if (tag === 3) value = raw + ((left + up) >> 1);
      else if (tag === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      } else value = raw;
      current[index] = value & 0xff;
    }
    out.set(current, row * rowLength);
    previousRow = current;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Documento: objetos indexados y resolución de referencias
// ---------------------------------------------------------------------------

export class CadPdfObjects {
  constructor(private readonly objects: Map<number, CadPdfValue>) {}

  get size(): number {
    return this.objects.size;
  }

  /** Sigue las referencias indirectas hasta un valor de verdad. */
  resolve(value: CadPdfValue | undefined): CadPdfValue {
    let current = value ?? CAD_PDF_NULL;
    // Un PDF dañado puede tener `1 0 obj 1 0 R endobj`. Sin tope, resolver
    // cuelga el navegador del arquitecto.
    for (let hop = 0; hop < 32 && current.kind === "ref"; hop += 1)
      current = this.objects.get(current.num) ?? CAD_PDF_NULL;
    return current.kind === "ref" ? CAD_PDF_NULL : current;
  }

  entry(dict: CadPdfValue | undefined, key: string): CadPdfValue {
    const target = this.resolve(dict);
    if (target.kind !== "dict" && target.kind !== "stream") return CAD_PDF_NULL;
    return this.resolve(target.entries.get(key));
  }

  number(dict: CadPdfValue | undefined, key: string, fallback: number): number {
    const value = this.entry(dict, key);
    return value.kind === "number" ? value.value : fallback;
  }

  name(dict: CadPdfValue | undefined, key: string): string {
    const value = this.entry(dict, key);
    return value.kind === "name" ? value.name : "";
  }

  array(dict: CadPdfValue | undefined, key: string): CadPdfValue[] {
    const value = this.entry(dict, key);
    return value.kind === "array" ? value.items : [];
  }

  /** Todos los objetos que son un flujo con `/Type` dado. */
  streamsOfType(type: string): CadPdfValue[] {
    return [...this.objects.values()].filter(
      (value) => value.kind === "stream" && this.name(value, "Type") === type,
    );
  }

  values(): IterableIterator<CadPdfValue> {
    return this.objects.values();
  }

  /**
   * Contenido de un flujo, con sus filtros deshechos.
   *
   * Devuelve SIEMPRE un resultado: si un filtro no se sabe deshacer, `data`
   * queda vacío y `unreadable` dice por qué. Nunca devuelve los bytes crudos
   * haciéndolos pasar por contenido.
   */
  streamData(value: CadPdfValue): CadPdfStreamData {
    const stream = this.resolve(value);
    if (stream.kind !== "stream")
      return { data: new Uint8Array(0), unreadable: "el objeto no es un flujo", imagePayload: false };

    const filterValue = this.resolve(stream.entries.get("Filter"));
    const filters =
      filterValue.kind === "name"
        ? [filterValue.name]
        : filterValue.kind === "array"
          ? filterValue.items.map((item) => (this.resolve(item).kind === "name" ? (this.resolve(item) as { name: string }).name : ""))
          : [];
    const parmsValue = this.resolve(stream.entries.get("DecodeParms")) ;
    const parmsList =
      parmsValue.kind === "array" ? parmsValue.items : parmsValue.kind === "dict" ? [parmsValue] : [];

    let data = stream.raw;
    for (const [index, filter] of filters.entries()) {
      const parms = parmsList[index] ?? parmsList[0];
      if (IMAGE_FILTERS.has(filter))
        return {
          data: new Uint8Array(0),
          unreadable: `el flujo es una imagen codificada con ${filter}`,
          imagePayload: true,
        };
      try {
        if (filter === "FlateDecode" || filter === "Fl") data = cadPdfInflate(data).data;
        else if (filter === "LZWDecode" || filter === "LZW")
          data = lzwDecode(data, this.number(parms, "EarlyChange", 1));
        else if (filter === "ASCIIHexDecode" || filter === "AHx") data = asciiHexDecode(data);
        else if (filter === "ASCII85Decode" || filter === "A85") data = ascii85Decode(data);
        else if (filter === "RunLengthDecode" || filter === "RL") data = runLengthDecode(data);
        else if (filter === "Crypt") continue;
        else
          return {
            data: new Uint8Array(0),
            unreadable: `el flujo usa el filtro ${filter}, que este lector no deshace`,
            imagePayload: false,
          };
      } catch (error) {
        const detail =
          error instanceof CadPdfInflateError
            ? error.message
            : "el flujo comprimido no se pudo descomprimir";
        return { data: new Uint8Array(0), unreadable: detail, imagePayload: false };
      }
      const predictor = this.number(parms, "Predictor", 1);
      if (predictor > 1)
        data = undoPredictor(
          data,
          predictor,
          this.number(parms, "Colors", 1),
          this.number(parms, "BitsPerComponent", 8),
          this.number(parms, "Columns", 1),
        );
    }
    return { data, unreadable: null, imagePayload: false };
  }
}

/**
 * Barre el archivo, indexa sus objetos y expande los objetos comprimidos.
 *
 * Un PDF cifrado se rechaza AQUÍ: sus flujos están cifrados y descomprimirlos
 * produce ruido. Decir «no tiene geometría» de un PDF protegido con contraseña
 * sería mentir sobre la causa, y el usuario buscaría el problema en su plano.
 */
export function readCadPdfObjects(bytes: Uint8Array): CadPdfObjects {
  const header = latin1(bytes, 0, Math.min(1024, bytes.length));
  if (!header.includes("%PDF-"))
    throw new CadPdfObjectError(
      "not_pdf",
      "El archivo no empieza por `%PDF-`: no es un PDF (¿lo renombraron?).",
    );

  const text = latin1(bytes, 0, bytes.length);
  const objects = new Map<number, CadPdfValue>();
  // La ÚLTIMA definición gana: un PDF con actualizaciones incrementales
  // reescribe objetos al final del archivo, y quedarse con la primera
  // devolvería el estado ANTES de la última edición.
  for (const match of text.matchAll(/(?:^|[\s>])(\d+)\s+(\d+)\s+obj\b/g)) {
    const number = Number(match[1]);
    const start = match.index + match[0].length;
    const lexer = new CadPdfLexer(bytes, start);
    const value = lexer.parseValue();
    if (value) objects.set(number, value);
  }
  if (objects.size === 0)
    throw new CadPdfObjectError(
      "no_objects",
      "El PDF no tiene ningún objeto legible: está truncado o cifrado de una forma que este lector no abre.",
    );

  const index = new CadPdfObjects(objects);
  if (text.includes("/Encrypt")) {
    // Sólo bloquea si el `/Encrypt` es de verdad el del tráiler; un `/Encrypt`
    // suelto dentro de una cadena no debería impedir abrir un PDF sano.
    const trailer = /\/Encrypt\s+\d+\s+\d+\s+R/.test(text) || /\/Encrypt\s*<</.test(text);
    if (trailer)
      throw new CadPdfObjectError(
        "encrypted",
        "El PDF está cifrado. Ábrelo con su contraseña y vuélvelo a guardar sin protección para poder importarlo.",
      );
  }

  expandObjectStreams(index, objects);
  return new CadPdfObjects(objects);
}

/**
 * Saca a la luz los objetos que viven dentro de un `/Type /ObjStm`.
 *
 * Los que ya estaban sueltos NO se pisan: si un PDF trae el objeto 12 suelto y
 * también dentro de un flujo, el suelto es el de la actualización incremental.
 */
function expandObjectStreams(index: CadPdfObjects, objects: Map<number, CadPdfValue>): void {
  for (const stream of index.streamsOfType("ObjStm")) {
    const { data, unreadable } = index.streamData(stream);
    if (unreadable) continue;
    const count = index.number(stream, "N", 0);
    const first = index.number(stream, "First", 0);
    if (count <= 0 || first <= 0 || first > data.length) continue;
    const headerLexer = new CadPdfLexer(data, 0);
    const pairs: Array<{ num: number; offset: number }> = [];
    for (let item = 0; item < count; item += 1) {
      const num = headerLexer.parseValue();
      const offset = headerLexer.parseValue();
      if (num?.kind !== "number" || offset?.kind !== "number") break;
      pairs.push({ num: num.value, offset: offset.value });
    }
    for (const pair of pairs) {
      if (objects.has(pair.num)) continue;
      const start = first + pair.offset;
      if (start >= data.length) continue;
      const value = new CadPdfLexer(data, start).parseValue();
      if (value) objects.set(pair.num, value);
    }
  }
}
