/**
 * De BYTES a TEXTO: qué dice realmente un rótulo del PDF.
 *
 * ## El problema, en un plano
 *
 * `(Muro exterior) Tj` parece texto y a veces lo es. Pero en un PDF salido de
 * un CAD con la fuente incrustada y subconjuntada, lo que va entre paréntesis
 * son ÍNDICES DE GLIFO: el byte 3 significa «el tercer dibujito del programa de
 * fuente», que puede ser la «M». Sin la tabla `/ToUnicode` que el escritor
 * decidió incluir —o no— esos bytes no se pueden volver texto.
 *
 * `pdf-measure.ts` ya se topó con esto y lo resolvió con honestidad: mide la
 * posición y el tamaño del rótulo y DECLARA que su contenido no se sabe. Aquí
 * se va un paso más allá porque importar exige el texto, no sólo su sitio, pero
 * la regla es la misma: cuando no se sabe qué dice, se dice que no se sabe. Un
 * MTEXT con «□□□□» en un plano es basura; un MTEXT inventado es peor.
 *
 * ## Qué se sabe leer
 *
 *  - `/ToUnicode` — la tabla que el propio PDF trae para esto. Es la vía buena
 *    y la que emite cualquier CAD moderno.
 *  - `/Encoding /WinAnsiEncoding` y `/MacRomanEncoding`, con sus `/Differences`.
 *    Es lo que traen las fuentes estándar sin incrustar.
 *  - Sin ninguna de las dos y con fuente simple, se supone WinAnsi, que es lo
 *    que emite el 95 % de los escritores. Se DECLARA la suposición.
 *  - Sin ninguna de las dos y con fuente compuesta (`Type0`), NO se adivina: los
 *    códigos son de dos bytes y podrían ser cualquier cosa.
 */
import { CadPdfObjects, type CadPdfValue } from "./pdf-objects";
import { CadPdfLexer } from "./pdf-objects";

/**
 * Tramo 0x80–0x9F de WinAnsi (CP1252), que NO coincide con Latin-1.
 *
 * Es la misma tabla que ya usa el escalímetro del trazado, y por la misma
 * razón: ahí viven la raya, las comillas tipográficas y los puntos suspensivos
 * que lleva el nombre de cualquier proyecto. Leerlos como Latin-1 los convierte
 * en caracteres de control invisibles y un rótulo impreso perfectamente parece
 * haber perdido letras.
 */
const CP1252_HIGH: Readonly<Record<number, string>> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘",
  0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜",
  0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

/** Los glifos con nombre que de verdad aparecen en un plano en español. */
const GLYPH_NAMES: Readonly<Record<string, string>> = {
  space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$", percent: "%",
  ampersand: "&", quotesingle: "'", parenleft: "(", parenright: ")", asterisk: "*",
  plus: "+", comma: ",", hyphen: "-", period: ".", slash: "/", zero: "0", one: "1",
  two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8",
  nine: "9", colon: ":", semicolon: ";", less: "<", equal: "=", greater: ">",
  question: "?", at: "@", bracketleft: "[", backslash: "\\", bracketright: "]",
  underscore: "_", braceleft: "{", bar: "|", braceright: "}", degree: "°",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ",
  udieresis: "ü", Udieresis: "Ü", questiondown: "¿", exclamdown: "¡",
  endash: "–", emdash: "—", quoteright: "’", quoteleft: "‘", bullet: "•",
};

const glyphToChar = (name: string): string => {
  if (GLYPH_NAMES[name]) return GLYPH_NAMES[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  // `uni00E1` y `u00E1` son la notación estándar para un glifo sin nombre.
  const uni = name.match(/^uni([0-9A-Fa-f]{4})$/) ?? name.match(/^u([0-9A-Fa-f]{4,6})$/);
  if (uni) return String.fromCodePoint(Number.parseInt(uni[1], 16));
  return "";
};

export interface CadPdfFont {
  /** Recurso del flujo: `F1`. */
  ref: string;
  baseFont: string;
  subtype: string;
  /** `true` si los códigos ocupan DOS bytes (fuentes compuestas). */
  twoByte: boolean;
  /** Cómo se supo (o no) traducir sus códigos. */
  source: "toUnicode" | "encoding" | "assumed_winansi" | "unknown";
  embedded: boolean;
  /** Código → texto. Vacío cuando no hay forma de saberlo. */
  map: Map<number, string>;
}

/** `<0041> <0042> <0043>` y `<0041> <005A> <0061>` de un CMap `/ToUnicode`. */
function parseToUnicode(data: Uint8Array): Map<number, string> {
  const map = new Map<number, string>();
  const text = String.fromCharCode(...data.subarray(0, Math.min(data.length, 4_000_000)));
  const hexToText = (hex: string): string => {
    let out = "";
    for (let index = 0; index + 3 < hex.length + 1; index += 4)
      out += String.fromCharCode(Number.parseInt(hex.slice(index, index + 4).padEnd(4, "0"), 16));
    // Los sustitutos de UTF-16 llegan en pares; `String.fromCharCode` ya los
    // deja como tal y la cadena resultante los une sola.
    return out;
  };

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g))
      map.set(Number.parseInt(pair[1], 16), hexToText(pair[2]));

  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1];
    for (const range of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const from = Number.parseInt(range[1], 16);
      const to = Number.parseInt(range[2], 16);
      const base = Number.parseInt(range[3], 16);
      // Un rango disparatado sería un archivo dañado; recorrerlo entero colgaría
      // el importador. 65536 es el tamaño de un plano de códigos completo.
      if (to < from || to - from > 65535) continue;
      for (let code = from; code <= to; code += 1)
        map.set(code, String.fromCharCode(base + (code - from)));
    }
    for (const range of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const from = Number.parseInt(range[1], 16);
      const items = [...range[3].matchAll(/<([0-9A-Fa-f]+)>/g)];
      items.forEach((item, offset) => map.set(from + offset, hexToText(item[1])));
    }
  }
  return map;
}

/** WinAnsi/MacRoman + `/Differences`. */
function encodingMap(objects: CadPdfObjects, encoding: CadPdfValue): Map<number, string> | null {
  const map = new Map<number, string>();
  const baseName = encoding.kind === "name" ? encoding.name : objects.name(encoding, "BaseEncoding");
  const known = ["WinAnsiEncoding", "MacRomanEncoding", "StandardEncoding"].includes(baseName);
  if (known)
    for (let code = 32; code < 256; code += 1)
      map.set(code, CP1252_HIGH[code] ?? String.fromCharCode(code));

  const differences = objects.array(encoding, "Differences");
  let code = 0;
  let touched = false;
  for (const item of differences) {
    const value = objects.resolve(item);
    if (value.kind === "number") code = value.value;
    else if (value.kind === "name") {
      const char = glyphToChar(value.name);
      if (char) map.set(code, char);
      touched = true;
      code += 1;
    }
  }
  return known || touched ? map : null;
}

/**
 * Las fuentes declaradas en `/Resources /Font` de una página o de un XObject.
 *
 * `seen` corta los ciclos: un `/Resources` que se referencia a sí mismo existe
 * en archivos reparados por herramientas, y sin tope colgaría el importador.
 */
export function readCadPdfFonts(
  objects: CadPdfObjects,
  resources: CadPdfValue,
  into: Map<string, CadPdfFont> = new Map(),
): Map<string, CadPdfFont> {
  const fontDict = objects.entry(resources, "Font");
  if (fontDict.kind !== "dict") return into;

  for (const [ref, entry] of fontDict.entries) {
    if (into.has(ref)) continue;
    const font = objects.resolve(entry);
    const subtype = objects.name(font, "Subtype");
    const baseFont = objects.name(font, "BaseFont") || "(sin nombre)";
    const twoByte = subtype === "Type0";

    // El descriptor puede estar en el descendiente de una fuente compuesta.
    const descendants = objects.array(font, "DescendantFonts");
    const descendant = descendants.length ? objects.resolve(descendants[0]) : font;
    const descriptor = objects.entry(descendant, "FontDescriptor");
    const embedded =
      descriptor.kind === "dict" &&
      ["FontFile", "FontFile2", "FontFile3"].some(
        (key) => objects.entry(descriptor, key).kind !== "null",
      );

    const toUnicode = objects.entry(font, "ToUnicode");
    if (toUnicode.kind === "stream") {
      const { data, unreadable } = objects.streamData(toUnicode);
      if (!unreadable) {
        const map = parseToUnicode(data);
        if (map.size) {
          into.set(ref, { ref, baseFont, subtype, twoByte, source: "toUnicode", embedded, map });
          continue;
        }
      }
    }

    const encoding = objects.entry(font, "Encoding");
    const fromEncoding = encoding.kind === "null" ? null : encodingMap(objects, encoding);
    if (fromEncoding) {
      into.set(ref, { ref, baseFont, subtype, twoByte, source: "encoding", embedded, map: fromEncoding });
      continue;
    }

    if (!twoByte) {
      // Fuente simple sin nada: WinAnsi es lo que emite casi todo el mundo. Se
      // supone y se DECLARA; la alternativa —no leer nada— perdería el texto de
      // la mayoría de los PDF de CAD por un escrúpulo que no aporta seguridad.
      const map = new Map<number, string>();
      for (let code = 32; code < 256; code += 1)
        map.set(code, CP1252_HIGH[code] ?? String.fromCharCode(code));
      into.set(ref, { ref, baseFont, subtype, twoByte, source: "assumed_winansi", embedded, map });
      continue;
    }

    into.set(ref, { ref, baseFont, subtype, twoByte, source: "unknown", embedded, map: new Map() });
  }

  // Los XObject de formulario traen sus propios recursos y sus propias fuentes.
  const xobjects = objects.entry(resources, "XObject");
  if (xobjects.kind === "dict")
    for (const entry of xobjects.entries.values()) {
      const xobject = objects.resolve(entry);
      if (xobject.kind !== "stream" || objects.name(xobject, "Subtype") !== "Form") continue;
      const nested = objects.entry(xobject, "Resources");
      if (nested.kind === "dict" && into.size < 512) readCadPdfFonts(objects, nested, into);
    }
  return into;
}

export interface CadPdfDecodedText {
  text: string;
  /** `true` si los bytes NO se pudieron traducir a caracteres. */
  glyphIndices: boolean;
  /** Códigos leídos. Sirve para avanzar el cursor de texto sin métricas. */
  codes: number[];
}

/** Traduce los bytes de un `Tj`/`TJ` con la fuente activa. */
export function decodeCadPdfString(bytes: Uint8Array, font: CadPdfFont | null): CadPdfDecodedText {
  const codes: number[] = [];
  if (!font) {
    for (const byte of bytes) codes.push(byte);
    return { text: "", glyphIndices: true, codes };
  }
  const step = font.twoByte ? 2 : 1;
  let text = "";
  let translated = 0;
  for (let index = 0; index + step <= bytes.length; index += step) {
    const code = step === 2 ? (bytes[index] << 8) | bytes[index + 1] : bytes[index];
    codes.push(code);
    const glyph = font.map.get(code);
    if (glyph !== undefined) {
      text += glyph;
      translated += 1;
    }
  }
  // Un texto traducido a MEDIAS es tan inservible como uno no traducido, y
  // además parece correcto. Se exige que la mayoría de los códigos tengan
  // traducción antes de dar el texto por bueno.
  const usable = codes.length > 0 && translated >= Math.ceil(codes.length * 0.6);
  // Los NUL sobran siempre: son el relleno de un `/ToUnicode` que traduce un
  // código a «nada», y en pantalla se ven como un cuadrado.
  return usable
    ? { text: text.replace(/\u0000/g, ""), glyphIndices: false, codes }
    : { text: "", glyphIndices: true, codes };
}

/** Un CMap suelto —`/Encoding` como flujo— también trae códigos a Unicode. */
export function parseCadPdfCMapStream(objects: CadPdfObjects, value: CadPdfValue): Map<number, string> {
  const stream = objects.resolve(value);
  if (stream.kind !== "stream") return new Map();
  const { data, unreadable } = objects.streamData(stream);
  return unreadable ? new Map() : parseToUnicode(data);
}

/** Reexportado para el intérprete: lee un valor suelto desde bytes. */
export const cadPdfValueFrom = (data: Uint8Array, at = 0) => new CadPdfLexer(data, at).parseValue();
