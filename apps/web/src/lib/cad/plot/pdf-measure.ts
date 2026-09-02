/**
 * Escalímetro sobre el PDF: se mide el ARCHIVO, no la intención.
 *
 * ## Por qué existe
 *
 * «El plano se ve bien» no es una comprobación. La única forma de saber que
 * 1:50 mide 1:50 es coger el PDF entregado, sacar las coordenadas de sus
 * trazos y restar. Este módulo abre el flujo de contenido de un PDF sin
 * comprimir, lee los operadores de camino y de texto, y devuelve segmentos y
 * rótulos en MILÍMETROS de papel — que es la unidad en la que un arquitecto
 * pone el escalímetro.
 *
 * Con eso, una prueba puede afirmar «este muro de 10 m mide 200,000 mm sobre
 * el papel» y fallar con una cifra cuando no sea verdad. Un fallo medido vale
 * más que un verde de inspección visual.
 *
 * ## Qué sabe leer y qué no
 *
 * Lee lo que este producto emite: caminos rectos (`m`, `l`, `re`), grosores
 * (`w`) y texto (`Tf`, `Td`, `Tj`). **No** interpreta curvas de Bézier ni
 * matrices `cm`, y por eso las DECLARA en vez de ignorarlas: una `cm` sin
 * aplicar desplazaría todas las medidas siguientes y produciría un informe
 * precioso y falso. Si aparece, el resultado lo dice y quien mide decide.
 *
 * ## El sistema de coordenadas
 *
 * El PDF mide en puntos desde la esquina INFERIOR izquierda. Aquí todo sale en
 * milímetros desde la esquina SUPERIOR izquierda, que es el sistema del plan de
 * trazado. Así lo medido y lo esperado se comparan sin convertir nada por el
 * camino, que es donde se cuelan los errores de signo.
 */

/** Milímetros → puntos PostScript. */
export const PDF_MM_TO_POINTS = 72 / 25.4;

export interface CadPdfSegment {
  /** Página, 1-based. */
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lengthMm: number;
  lineWidthMm: number;
  /** Patrón `d` vigente al trazar, en milímetros; ausente = continua. */
  dashMm?: number[];
}

export interface CadPdfLabel {
  page: number;
  x: number;
  y: number;
  /** Alto nominal de la fuente, en mm de papel. */
  sizeMm: number;
  /** Recurso de fuente del flujo: `F1`. */
  fontRef: string;
  text: string;
  /**
   * `true` cuando el rótulo va escrito como cadena HEXADECIMAL.
   *
   * Es lo que hace jsPDF con una fuente incrustada: los bytes son índices de
   * glifo, no caracteres, y sin el `cmap` de la fuente no hay forma de
   * recuperar el texto. La POSICIÓN y el TAMAÑO sí se miden igual; lo único
   * que se pierde es poder buscar un rótulo por su contenido, y se dice en vez
   * de devolver una cadena vacía que parecería un rótulo en blanco.
   */
  hexEncoded: boolean;
}

export interface CadPdfFontEntry {
  /** Nombre `/BaseFont` del PDF. */
  baseFont: string;
  /** `true` sólo si el objeto lleva `/FontFile`, `/FontFile2` o `/FontFile3`. */
  embedded: boolean;
  subtype: string;
}

export interface CadPdfMeasurement {
  pages: Array<{ widthMm: number; heightMm: number }>;
  segments: CadPdfSegment[];
  labels: CadPdfLabel[];
  fonts: CadPdfFontEntry[];
  /**
   * Lo que este lector NO supo interpretar. Vacío es la única lectura en la
   * que se puede confiar para medir; con algo dentro, la medida es parcial y
   * queda dicho cuál es el hueco.
   */
  unreadable: string[];
}

/** El PDF no se pudo leer para medir. Explícito: medir a medias es peor. */
export class CadPdfMeasureError extends Error {
  constructor(readonly code: "compressed" | "no_pages" | "page_stream_mismatch", detail: string) {
    super(detail);
    this.name = "CadPdfMeasureError";
  }
}

function latin1(bytes: Uint8Array): string {
  let text = "";
  // Trozos, no `String.fromCharCode(...bytes)`: un PDF de una serie de veinte
  // láminas pasa del millón de bytes y desbordaría la pila de argumentos.
  const CHUNK = 8192;
  for (let index = 0; index < bytes.length; index += CHUNK)
    text += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  return text;
}

/** `[a b c d]` de cada `/MediaBox`, en el orden en que aparecen. */
function mediaBoxes(text: string): Array<{ widthMm: number; heightMm: number }> {
  return [
    ...text.matchAll(/\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/g),
  ].map((match) => ({
    widthMm: (Number(match[3]) - Number(match[1])) / PDF_MM_TO_POINTS,
    heightMm: (Number(match[4]) - Number(match[2])) / PDF_MM_TO_POINTS,
  }));
}

/**
 * Flujos de contenido, en orden de página.
 *
 * Se quedan sólo los que llevan operadores de dibujo. Un PDF trae también
 * flujos de metadatos y de programas de fuente, y contarlos como página
 * desalinearía todas las medidas con su hoja.
 */
function contentStreams(text: string): string[] {
  const streams: string[] = [];
  for (const match of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const body = match[1];
    if (/(^|\s)(m|l|re|Tj|TJ)(\s|$)/.test(body)) streams.push(body);
  }
  return streams;
}

/** Objetos `/Type /Font` con su `/BaseFont` y si llevan programa dentro. */
function fontEntries(text: string): CadPdfFontEntry[] {
  const fonts: CadPdfFontEntry[] = [];
  for (const match of text.matchAll(/<<[^<>]*?\/Type\s*\/Font[\s\S]*?>>/g)) {
    const body = match[0];
    const baseFont = body.match(/\/BaseFont\s*\/([A-Za-z0-9+\-,._]+)/)?.[1];
    if (!baseFont) continue;
    fonts.push({
      baseFont,
      // El descriptor con el programa puede vivir en otro objeto; se busca en
      // el archivo entero por el nombre de la familia, porque lo que decide si
      // una fuente viaja dentro es que EXISTA el programa, no dónde esté.
      embedded: new RegExp(
        `/FontName\\s*/${baseFont.replace(/[+.]/g, "\\$&")}[\\s\\S]{0,600}?/FontFile[23]?\\s`,
      ).test(text),
      subtype: body.match(/\/Subtype\s*\/([A-Za-z0-9]+)/)?.[1] ?? "",
    });
  }
  // Sin repetir: jsPDF declara el mismo objeto de fuente en cada página.
  const seen = new Set<string>();
  return fonts.filter((font) => {
    if (seen.has(font.baseFont)) return false;
    seen.add(font.baseFont);
    return true;
  });
}

/**
 * Tramo 0x80–0x9F de WinAnsi (CP1252), que NO coincide con Latin-1.
 *
 * Ahí viven la raya, el guion medio, las comillas tipográficas y los puntos
 * suspensivos — justo lo que lleva el nombre de un proyecto y el texto de una
 * nota. Leer esos bytes como Latin-1 los convierte en caracteres de control
 * invisibles, y entonces un rótulo perfectamente impreso parece haber perdido
 * caracteres. El error estaría en el lector, no en el plano, pero el informe
 * diría lo contrario.
 */
const CP1252_HIGH: Readonly<Record<number, string>> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘",
  0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜",
  0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

/** Cadena literal de PDF: `(Muro \(sur\))` → `Muro (sur)`, ya en WinAnsi. */
function decodeString(raw: string): string {
  const unescaped = raw
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    )
    .replace(/\\([nrtbf()\\])/g, (_match, char: string) => {
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
      return escapes[char] ?? char;
    });
  return [...unescaped]
    .map((char) => CP1252_HIGH[char.charCodeAt(0)] ?? char)
    .join("");
}

interface StreamScan {
  segments: Array<Omit<CadPdfSegment, "page">>;
  labels: Array<Omit<CadPdfLabel, "page">>;
  unreadable: string[];
}

/**
 * Recorre un flujo de contenido.
 *
 * Postfijo puro: los números se apilan y el operador los consume. Es como está
 * escrito un PDF, y seguirlo al pie de la letra evita la tentación de casar
 * patrones sobre el texto — que funciona hasta que un número lleva signo.
 */
function scanStream(body: string, pageHeightMm: number): StreamScan {
  const segments: StreamScan["segments"] = [];
  const labels: StreamScan["labels"] = [];
  const unreadable: string[] = [];

  const toMmX = (points: number) => points / PDF_MM_TO_POINTS;
  const toMmY = (points: number) => pageHeightMm - points / PDF_MM_TO_POINTS;

  let stack: number[] = [];
  let lineWidthMm = 0;
  let current: { x: number; y: number } | null = null;
  let subpathStart: { x: number; y: number } | null = null;
  let fontRef = "";
  let fontSizeMm = 0;
  let textPoint: { x: number; y: number } | null = null;

  const tokens = body.match(/\([^)\\]*(?:\\.[^)\\]*)*\)|<[0-9A-Fa-f\s]*>|\/[^\s/[\]<>()]+|[^\s]+/g) ?? [];

  let dashMm: number[] | undefined;
  let dashArray: number[] | null = null;
  let pendingArray: number[] | null = null;
  for (const token of tokens) {
    // `[a b c] fase d`: el array llega troceado por espacios («[3.54», «0.7]»
    // o «[]»); se recoge entero y `d` lo convierte a milímetros.
    if (token.startsWith("[") || dashArray) {
      if (token.startsWith("[")) dashArray = [];
      const inner = token.startsWith("[") ? token.slice(1) : token;
      const closes = inner.endsWith("]");
      const body = closes ? inner.slice(0, -1) : inner;
      if (body !== "" && Number.isFinite(Number(body))) dashArray!.push(Number(body));
      if (closes) {
        pendingArray = dashArray;
        dashArray = null;
      }
      continue;
    }
    const numeric = Number(token);
    if (token !== "" && Number.isFinite(numeric) && /^[-+.\d]/.test(token)) {
      stack.push(numeric);
      continue;
    }
    if (token.startsWith("(")) {
      const text = decodeString(token.slice(1, -1));
      if (textPoint && fontRef)
        labels.push({
          x: textPoint.x,
          y: textPoint.y,
          sizeMm: fontSizeMm,
          fontRef,
          text,
          hexEncoded: false,
        });
      stack = [];
      continue;
    }
    if (token.startsWith("<") && !token.startsWith("<<")) {
      if (textPoint && fontRef) {
        labels.push({
          x: textPoint.x,
          y: textPoint.y,
          sizeMm: fontSizeMm,
          fontRef,
          text: "",
          hexEncoded: true,
        });
        unreadable.push(
          "rótulo en cadena hexadecimal (fuente incrustada): se mide su posición y su tamaño, no su texto",
        );
      }
      stack = [];
      continue;
    }
    if (token.startsWith("/")) {
      // Sólo los recursos de fuente. En el flujo aparecen también nombres de
      // espacio de color, y quedarse con el último convertiría `/DeviceRGB` en
      // la fuente del rótulo siguiente.
      if (/^F\d+$/.test(token.slice(1))) fontRef = token.slice(1);
      continue;
    }

    switch (token) {
      case "m": {
        const [x, y] = stack.slice(-2);
        current = { x: toMmX(x), y: toMmY(y) };
        subpathStart = current;
        break;
      }
      case "l": {
        const [x, y] = stack.slice(-2);
        const next = { x: toMmX(x), y: toMmY(y) };
        if (current)
          segments.push({
            x1: current.x,
            y1: current.y,
            x2: next.x,
            y2: next.y,
            lengthMm: Math.hypot(next.x - current.x, next.y - current.y),
            lineWidthMm,
            ...(dashMm ? { dashMm } : {}),
          });
        current = next;
        break;
      }
      case "h": {
        if (current && subpathStart)
          segments.push({
            x1: current.x,
            y1: current.y,
            x2: subpathStart.x,
            y2: subpathStart.y,
            lengthMm: Math.hypot(subpathStart.x - current.x, subpathStart.y - current.y),
            lineWidthMm,
            ...(dashMm ? { dashMm } : {}),
          });
        current = subpathStart;
        break;
      }
      case "re": {
        const [x, y, width, height] = stack.slice(-4);
        const left = toMmX(x);
        const right = toMmX(x + width);
        const bottom = toMmY(y);
        const top = toMmY(y + height);
        const corners = [
          [left, top, right, top],
          [right, top, right, bottom],
          [right, bottom, left, bottom],
          [left, bottom, left, top],
        ] as const;
        for (const [x1, y1, x2, y2] of corners)
          segments.push({ x1, y1, x2, y2, lengthMm: Math.hypot(x2 - x1, y2 - y1), lineWidthMm, ...(dashMm ? { dashMm } : {}) });
        current = null;
        subpathStart = null;
        break;
      }
      case "w":
        lineWidthMm = (stack.at(-1) ?? 0) / PDF_MM_TO_POINTS;
        break;
      case "d":
        dashMm = pendingArray && pendingArray.length > 0 ? pendingArray.map((value) => value / PDF_MM_TO_POINTS) : undefined;
        pendingArray = null;
        break;
      case "Tf":
        fontSizeMm = (stack.at(-1) ?? 0) / PDF_MM_TO_POINTS;
        break;
      case "Td":
      case "TD": {
        const [x, y] = stack.slice(-2);
        textPoint = { x: toMmX(x), y: toMmY(y) };
        break;
      }
      case "Tm": {
        const [x, y] = stack.slice(-2);
        textPoint = { x: toMmX(x), y: toMmY(y) };
        break;
      }
      case "c":
      case "v":
      case "y":
        unreadable.push("curva de Bézier: no se mide su longitud, sólo sus extremos se ignoran");
        current = null;
        break;
      case "cm":
        unreadable.push("matriz `cm`: las coordenadas siguientes van transformadas y no se aplican");
        break;
      default:
        break;
    }
    stack = [];
  }

  return { segments, labels, unreadable: [...new Set(unreadable)] };
}

/**
 * Mide un PDF trazado.
 *
 * Exige que el PDF esté SIN comprimir: un flujo `FlateDecode` no se puede leer
 * aquí sin arrastrar un descompresor, y devolver cero segmentos de un archivo
 * comprimido diría «no hay nada dibujado» cuando lo que pasa es que no se supo
 * mirar. Se emite con `compress: false` para medir, y comprimido para entregar.
 */
export function measureCadPdf(bytes: Uint8Array): CadPdfMeasurement {
  const text = latin1(bytes);
  const pages = mediaBoxes(text);
  if (pages.length === 0)
    throw new CadPdfMeasureError("no_pages", "El PDF no declara ninguna página con `/MediaBox`.");

  const streams = contentStreams(text);
  if (streams.length === 0 && /\/Filter\s*\/FlateDecode/.test(text))
    throw new CadPdfMeasureError(
      "compressed",
      "El PDF viene comprimido: vuelve a emitirlo con `compress: false` para poder medirlo.",
    );
  if (streams.length !== pages.length)
    throw new CadPdfMeasureError(
      "page_stream_mismatch",
      `El PDF declara ${pages.length} página(s) y ${streams.length} flujo(s) de contenido; no se pueden emparejar sin adivinar.`,
    );

  const segments: CadPdfSegment[] = [];
  const labels: CadPdfLabel[] = [];
  const unreadable = new Set<string>();

  streams.forEach((stream, index) => {
    const scan = scanStream(stream, pages[index].heightMm);
    const page = index + 1;
    for (const segment of scan.segments) segments.push({ page, ...segment });
    for (const label of scan.labels) labels.push({ page, ...label });
    for (const note of scan.unreadable) unreadable.add(note);
  });

  return { pages, segments, labels, fonts: fontEntries(text), unreadable: [...unreadable] };
}

/**
 * Segmento medido más parecido a una longitud esperada.
 *
 * Es la operación del escalímetro: se busca en el papel el trazo que debería
 * medir 200 mm y se mira cuánto mide de verdad. Devuelve `null` cuando no hay
 * ningún candidato, para que quien mide no confunda «no se dibujó» con «midió
 * exacto».
 */
export function nearestCadPdfSegment(
  segments: readonly CadPdfSegment[],
  expectedMm: number,
  filter: (segment: CadPdfSegment) => boolean = () => true,
): CadPdfSegment | null {
  let best: CadPdfSegment | null = null;
  let bestError = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    if (!filter(segment)) continue;
    const error = Math.abs(segment.lengthMm - expectedMm);
    if (error < bestError) {
      bestError = error;
      best = segment;
    }
  }
  return best;
}

/** Segmentos que se salen del papel: lo que se dibuja pero no se imprime. */
export function cadPdfSegmentsOutsidePage(
  measurement: CadPdfMeasurement,
  toleranceMm = 0.01,
): CadPdfSegment[] {
  return measurement.segments.filter((segment) => {
    const page = measurement.pages[segment.page - 1];
    if (!page) return true;
    const outside = (x: number, y: number) =>
      x < -toleranceMm ||
      y < -toleranceMm ||
      x > page.widthMm + toleranceMm ||
      y > page.heightMm + toleranceMm;
    return outside(segment.x1, segment.y1) || outside(segment.x2, segment.y2);
  });
}
