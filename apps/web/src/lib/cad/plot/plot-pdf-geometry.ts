/**
 * EXTRACTOR DE GEOMETRÍA DEL PDF — el verificador que faltaba.
 *
 * `inspectCadPdf` (en `plot-pdf.ts`) lee la CUBIERTA del archivo: cuántas
 * páginas, de qué tamaño, con qué fuentes declaradas. Eso demuestra que se
 * emitió un PDF; no demuestra que el plano esté DENTRO. Un archivo con el
 * `MediaBox` de un A3, las fuentes correctas y la página en blanco pasaría
 * todas aquellas comprobaciones.
 *
 * Este módulo abre el `content stream` y saca los TRAZOS y los TEXTOS, con sus
 * coordenadas en MILÍMETROS de papel. Con eso se puede afirmar lo que de
 * verdad importa de un plano impreso:
 *
 *   · que el muro de 3.5 m mide 70 mm a 1:50 — la escala es real, no una
 *     etiqueta escrita en el cajetín;
 *   · que los textos están, con sus acentos intactos;
 *   · que las capas llegaron con su pluma (grosor y color de trazo);
 *   · que los márgenes ISO se respetan: nada pintado fuera del área útil.
 *
 * ─── Cómo lee el archivo ───────────────────────────────────────────────────
 *
 * jsPDF comprime los streams con Flate por defecto (`compress: true`), así que
 * hay que inflarlos. Se usa `node:zlib` porque este módulo es de VERIFICACIÓN
 * y corre en Node —specs y gates—, nunca en el navegador del usuario.
 *
 * El intérprete es deliberadamente PARCIAL: entiende los operadores que este
 * producto emite y nada más. Un intérprete completo de PostScript sería un
 * proyecto aparte y no haría más veraz ninguna de las afirmaciones de arriba.
 */
import { inflateSync } from "node:zlib";

const MM_PER_POINT = 25.4 / 72;

export interface PdfPoint {
  /** Milímetros desde el borde izquierdo de la página. */
  x: number;
  /** Milímetros desde el borde INFERIOR (el sistema del PDF). */
  y: number;
}

export interface PdfSegment {
  from: PdfPoint;
  to: PdfPoint;
  /** Grosor de línea en milímetros, tal y como lo fijó el operador `w`. */
  widthMm: number;
  /** Color de trazo RGB en 0..1, o `null` si el trazo heredó el negro. */
  strokeRgb: [number, number, number] | null;
  /** Página (1-based) donde vive el trazo. */
  page: number;
}

export interface PdfTextRun {
  text: string;
  at: PdfPoint;
  /** Tamaño en milímetros, ya convertido desde puntos. */
  sizeMm: number;
  page: number;
}

export interface CadPdfGeometry {
  pageCount: number;
  pageSizesMm: Array<{ width: number; height: number }>;
  segments: PdfSegment[];
  texts: PdfTextRun[];
  /** Longitud del trazo más largo, en mm. Atajo para el caso más frecuente. */
  longestSegmentMm: number;
}

/* ── Matrices ─────────────────────────────────────────────────────────────── */

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function apply(m: Matrix, x: number, y: number): PdfPoint {
  return {
    x: (m[0] * x + m[2] * y + m[4]) * MM_PER_POINT,
    y: (m[1] * x + m[3] * y + m[5]) * MM_PER_POINT,
  };
}

/* ── Lectura del contenedor ───────────────────────────────────────────────── */

/**
 * Los bytes crudos como cadena latin-1. El PDF mezcla texto ASCII con binario,
 * y ésta es la única lectura que conserva ambos sin corromper los índices.
 */
function latin1(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

/**
 * Los streams del archivo, ya inflados.
 *
 * Se recorren todos los objetos `stream`…`endstream`; los que declaran
 * `/FlateDecode` se inflan y los demás se toman tal cual. Un stream que no sea
 * de contenido (una fuente incrustada, por ejemplo) no casa con ningún
 * operador y aporta cero trazos, así que no hace falta distinguirlo por su
 * diccionario: el intérprete lo ignora solo.
 */
function contentStreams(bytes: Uint8Array): string[] {
  const raw = latin1(bytes);
  const streams: string[] = [];

  // SE RECORRE POR OBJETOS, no buscando la palabra «stream» suelta.
  //
  // Un stream comprimido es binario y puede contener los bytes de «stream» o
  // de «endstream»: escanear el archivo por esas palabras desincroniza la
  // lectura, y a partir de ahí los objetos siguientes se leen a mitad. Eso no
  // es una hipótesis — al añadir la portada a un juego, el extractor pasó de
  // leer 50 trazos a 12 sin dar un solo error, y los que faltaban eran los
  // del dibujo. Un verificador que se queda callado cuando pierde el plano es
  // peor que no tener verificador.
  //
  // Anclando cada stream a su `N 0 obj` y leyendo el `/Length` de SU PROPIO
  // diccionario, el largo es exacto y la desincronización deja de ser posible.
  const objects = /(\d+)\s+0\s+obj\b/gu;
  let object: RegExpExecArray | null;
  while ((object = objects.exec(raw)) !== null) {
    const dictionaryEnd = raw.indexOf("stream", object.index);
    if (dictionaryEnd < 0) continue;
    const dictionary = raw.slice(object.index, dictionaryEnd);
    // El objeto no es un stream: su diccionario cierra antes de la palabra.
    if (dictionary.includes(" obj", 8) || !/\/Length/u.test(dictionary)) continue;

    const afterKeyword = dictionaryEnd + "stream".length;
    const start =
      raw.startsWith("\r\n", afterKeyword)
        ? afterKeyword + 2
        : raw.startsWith("\n", afterKeyword)
          ? afterKeyword + 1
          : afterKeyword;

    const declared = /\/Length\s+(\d+)(?!\s+\d+\s+R)/u.exec(dictionary);
    const end = declared
      ? start + Number(declared[1])
      : raw.indexOf("endstream", start);
    if (end < 0 || end <= start) continue;

    const slice = bytes.slice(start, end);
    if (/\/FlateDecode/u.test(dictionary)) {
      try {
        streams.push(latin1(new Uint8Array(inflateSync(Buffer.from(slice)))));
      } catch {
        // Un stream que no infla no es geometría legible: se omite en vez de
        // reventar la lectura del resto del archivo.
      }
    } else {
      streams.push(latin1(slice));
    }
    objects.lastIndex = Math.max(end, objects.lastIndex);
  }
  return streams;
}

function pageSizes(bytes: Uint8Array): Array<{ width: number; height: number }> {
  const raw = latin1(bytes);
  const sizes: Array<{ width: number; height: number }> = [];
  for (const match of raw.matchAll(
    /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/gu,
  )) {
    sizes.push({
      width: (Number(match[3]) - Number(match[1])) * MM_PER_POINT,
      height: (Number(match[4]) - Number(match[2])) * MM_PER_POINT,
    });
  }
  return sizes;
}

/* ── El intérprete ────────────────────────────────────────────────────────── */

/** Un literal `(…)` del PDF, con sus escapes y sus octales resueltos. */
function decodeLiteral(source: string): string {
  let out = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = source[index + 1];
    if (next === undefined) break;
    if (next >= "0" && next <= "7") {
      // Octal de hasta tres dígitos: así viajan los acentos en WinAnsi.
      let digits = "";
      let cursor = index + 1;
      while (digits.length < 3 && source[cursor] >= "0" && source[cursor] <= "7") {
        digits += source[cursor];
        cursor += 1;
      }
      out += String.fromCharCode(Number.parseInt(digits, 8));
      index = cursor - 1;
      continue;
    }
    const escapes: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      "(": "(",
      ")": ")",
      "\\": "\\",
    };
    out += escapes[next] ?? next;
    index += 1;
  }
  return out;
}

/**
 * WinAnsi → Unicode para lo que un plano mexicano necesita.
 *
 * jsPDF escribe los literales en WinAnsiEncoding (cp1252), donde `á` es 0xE1.
 * Leerlos como latin-1 acierta en las vocales acentuadas y en la ñ —cp1252 y
 * latin-1 coinciden ahí— y falla en el rango 0x80–0x9F, que es donde cp1252
 * mete los guiones largos y las comillas tipográficas. Se traduce ese rango y
 * sólo ése: inventar una tabla completa daría una falsa sensación de cobertura.
 */
const CP1252_HIGH: Record<number, string> = {
  0x85: "…",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
};

function fromWinAnsi(value: string): string {
  let out = "";
  for (const char of value) out += CP1252_HIGH[char.charCodeAt(0)] ?? char;
  return out;
}

interface GraphicsState {
  ctm: Matrix;
  width: number;
  stroke: [number, number, number] | null;
  fontSize: number;
}

/**
 * Lee un content stream y acumula trazos y textos.
 *
 * El estado gráfico se lleva en una pila (`q` / `Q`) como manda el formato: sin
 * ella, un `cm` dentro de un bloque anidado contaminaría todo lo que viene
 * después y las coordenadas saldrían desplazadas sin que nada lo delatara.
 */
function interpret(
  stream: string,
  page: number,
  segments: PdfSegment[],
  texts: PdfTextRun[],
): void {
  let state: GraphicsState = {
    ctm: IDENTITY,
    width: 0,
    stroke: null,
    fontSize: 0,
  };
  const stack: GraphicsState[] = [];
  let operands: string[] = [];
  let current: PdfPoint | null = null;
  let subpathStart: PdfPoint | null = null;
  let pending: PdfSegment[] = [];
  let textMatrix: Matrix = IDENTITY;
  let lineMatrix: Matrix = IDENTITY;

  const num = (fromEnd: number) =>
    Number(operands[operands.length - fromEnd]) || 0;

  // Los literales de texto se extraen ANTES de tokenizar: contienen espacios y
  // paréntesis que romperían cualquier separación por espacios en blanco. Cada
  // uno deja en su sitio una marca `#n#`. La almohadilla es segura: en el
  // formato sólo aparece DENTRO de un nombre (`/A#20B`), y los nombres se
  // reconocen antes por su `/` inicial.
  const literals: string[] = [];
  const masked = stream.replace(/\((?:[^()\\]|\\[\s\S])*\)/gu, (match) => {
    literals.push(match.slice(1, -1));
    return ` #${literals.length - 1}# `;
  });

  const stroked = new Set(["S", "s", "f", "F", "f*", "B", "B*", "b", "b*"]);

  for (const token of masked.split(/\s+/u)) {
    if (!token) continue;
    if (/^[-\d.]/u.test(token) || token.startsWith("/") || token.startsWith("#")) {
      operands.push(token);
      continue;
    }
    if (stroked.has(token)) {
      segments.push(...pending);
      pending = [];
      current = null;
      operands = [];
      continue;
    }
    switch (token) {
      case "q":
        stack.push({ ...state });
        break;
      case "Q":
        state = stack.pop() ?? state;
        break;
      case "cm":
        state.ctm = multiply(
          [num(6), num(5), num(4), num(3), num(2), num(1)],
          state.ctm,
        );
        break;
      case "w":
        state.width = num(1) * MM_PER_POINT;
        break;
      case "RG":
        state.stroke = [num(3), num(2), num(1)];
        break;
      case "m":
        current = apply(state.ctm, num(2), num(1));
        subpathStart = current;
        break;
      case "l":
      // Bézier: se registra su CUERDA. Basta para medir presencia y extensión
      // de una curva; su longitud verdadera exigiría integrarla y ninguna
      // afirmación de esta campaña lo necesita.
      case "c":
      case "v":
      case "y": {
        const next = apply(state.ctm, num(2), num(1));
        if (current)
          pending.push({
            from: current,
            to: next,
            widthMm: state.width,
            strokeRgb: state.stroke,
            page,
          });
        current = next;
        break;
      }
      case "re": {
        const height = num(1);
        const width = num(2);
        const y = num(3);
        const x = num(4);
        const corners = [
          apply(state.ctm, x, y),
          apply(state.ctm, x + width, y),
          apply(state.ctm, x + width, y + height),
          apply(state.ctm, x, y + height),
        ];
        for (let index = 0; index < 4; index += 1)
          pending.push({
            from: corners[index],
            to: corners[(index + 1) % 4],
            widthMm: state.width,
            strokeRgb: state.stroke,
            page,
          });
        current = corners[0];
        subpathStart = corners[0];
        break;
      }
      case "h":
        if (current && subpathStart)
          pending.push({
            from: current,
            to: subpathStart,
            widthMm: state.width,
            strokeRgb: state.stroke,
            page,
          });
        current = subpathStart;
        break;
      case "n":
      case "W":
      case "W*":
        // Recorte: el camino se consume sin pintar.
        pending = [];
        break;
      case "BT":
        textMatrix = IDENTITY;
        lineMatrix = IDENTITY;
        break;
      case "Tf":
        state.fontSize = num(1);
        break;
      case "Td":
      case "TD":
        lineMatrix = multiply([1, 0, 0, 1, num(2), num(1)], lineMatrix);
        textMatrix = lineMatrix;
        break;
      case "Tm":
        lineMatrix = [num(6), num(5), num(4), num(3), num(2), num(1)];
        textMatrix = lineMatrix;
        break;
      case "T*":
        lineMatrix = multiply([1, 0, 0, 1, 0, -state.fontSize], lineMatrix);
        textMatrix = lineMatrix;
        break;
      case "Tj":
      case "'":
      case "TJ": {
        const combined = operands
          .filter((operand) => operand.startsWith("#"))
          .map((operand) => literals[Number(operand.replaceAll("#", ""))] ?? "")
          .join("");
        const value = fromWinAnsi(decodeLiteral(combined));
        if (value.trim()) {
          const placed = multiply(textMatrix, state.ctm);
          texts.push({
            text: value,
            at: apply(placed, 0, 0),
            sizeMm: state.fontSize * MM_PER_POINT,
            page,
          });
        }
        break;
      }
      default:
        break;
    }
    if (token !== "W" && token !== "W*") operands = [];
  }
  // Un camino sin operador de pintado al final del stream no llegó a dibujarse.
}

/**
 * Abre el PDF y devuelve su geometría.
 *
 * Los trazos llegan en milímetros de papel con el origen ABAJO a la izquierda,
 * que es el sistema del PDF: convertirlo aquí a coordenadas de pantalla sería
 * una interpretación, y quien mida un margen superior necesita el número que
 * el archivo realmente contiene.
 */
export function extractCadPdfGeometry(bytes: Uint8Array): CadPdfGeometry {
  const sizes = pageSizes(bytes);
  const segments: PdfSegment[] = [];
  const texts: PdfTextRun[] = [];
  contentStreams(bytes).forEach((stream, index) => {
    // Un stream por página en la salida de jsPDF. Si algún día hubiera más de
    // uno por página, los trazos seguirían siendo correctos y sólo el número de
    // página quedaría corto — se prefiere eso a inventar una relación.
    interpret(stream, Math.min(index + 1, Math.max(1, sizes.length)), segments, texts);
  });
  let longest = 0;
  for (const segment of segments) longest = Math.max(longest, segmentLengthMm(segment));
  return {
    pageCount: sizes.length,
    pageSizesMm: sizes,
    segments,
    texts,
    longestSegmentMm: longest,
  };
}

/** Longitud en mm de un trazo. */
export function segmentLengthMm(segment: PdfSegment): number {
  return Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
}

/** ¿Hay algún trazo de esta longitud, dentro de la tolerancia dada? */
export function hasSegmentOfLength(
  geometry: CadPdfGeometry,
  lengthMm: number,
  toleranceMm: number,
): boolean {
  return geometry.segments.some(
    (segment) => Math.abs(segmentLengthMm(segment) - lengthMm) <= toleranceMm,
  );
}
