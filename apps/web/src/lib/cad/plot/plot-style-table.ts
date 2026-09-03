/**
 * Tablas de estilos de trazado: CTB (por color) y STB (con nombre).
 *
 * ## Qué traduce una tabla de plumas
 *
 * «Color 7» → «pluma negra de 0,25 mm». Ese es todo el asunto, y es lo que
 * separa un plano trazado de una captura de pantalla impresa. Un estudio lleva
 * veinte años afinando la suya: qué color sale fino, cuál grueso, cuál al 50 %
 * de intensidad para que la trama de un forjado no compita con el contorno.
 * Trazar sin ella saca todos los grosores iguales y el plano es papel tirado.
 *
 * - **CTB**: dependiente del color. 255 estilos, uno por índice ACI. Es lo que
 *   usa el 95 % del trabajo existente.
 * - **STB**: por nombre. El estilo se asigna a la capa o al objeto, no al
 *   color, así que un plano puede ser azul en pantalla y salir negro sin
 *   depender de qué color tenga.
 *
 * ## Sobre el formato de archivo, sin exagerar
 *
 * Lo que se lee y se escribe aquí es la **lista de propiedades** que vive
 * dentro de un `.ctb`/`.stb`: el mismo vocabulario (`plot_style`, `color`,
 * `screen`, `lineweight`, `custom_lineweight_table`) y la misma estructura de
 * bloques anidados. Un `.ctb` real la lleva comprimida con zlib detrás de una
 * cabecera `PIAFILEVERSION`; `importCadPlotStyleTable` la detecta, localiza el
 * flujo zlib y lo descomprime **con el códec que se le inyecte** — `node:zlib`
 * en Node, `DecompressionStream` en el navegador. Sin códec, lee el cuerpo en
 * claro.
 *
 * Lo que SÍ se garantiza: una tabla escrita aquí se vuelve a leer aquí sin
 * perder nada, y las semánticas —color, pluma, intensidad, grosor, tipo de
 * línea— son las de AutoCAD, así que transcribir una tabla del estudio una vez
 * la deja funcionando. Lo que NO se afirma es equivalencia byte a byte con el
 * escritor de Autodesk.
 */
import { aciToHex, hexToAci, screenHex, toGrayscaleHex } from "./aci-palette";

export type CadPlotLineEndStyle = "butt" | "square" | "round" | "diamond" | "object";
export type CadPlotLineJoinStyle = "miter" | "bevel" | "round" | "diamond" | "object";
export type CadPlotFillStyle =
  | "solid"
  | "checkerboard"
  | "crosshatch"
  | "diamonds"
  | "horizontal-bars"
  | "slant-left"
  | "slant-right"
  | "square-dots"
  | "vertical-bars"
  | "object";

export interface CadPlotStyle {
  /** `Color_7` en una CTB; el nombre que quiera el estudio en una STB. */
  name: string;
  description: string;
  /** Color de salida. `null` = el del objeto («Usar color del objeto»). */
  color: string | null;
  enableDither: boolean;
  convertToGrayscale: boolean;
  /** Pluma física del trazador. 0 = automática. */
  pen: number;
  virtualPen: number;
  /** Intensidad 0–100 %. 100 = tinta plena. */
  screen: number;
  /** `null` = el del objeto. */
  linetype: string | null;
  adaptiveLinetype: boolean;
  /** Grosor en MILÍMETROS. 0 = el del objeto. */
  lineweight: number;
  lineEndStyle: CadPlotLineEndStyle;
  lineJoinStyle: CadPlotLineJoinStyle;
  fillStyle: CadPlotFillStyle;
}

export interface CadPlotStyleTable {
  kind: "ctb" | "stb";
  /** Nombre del archivo sin extensión: `Estudio-2004`. */
  name: string;
  description: string;
  /** Factor global de grosores. `applyScaleFactor` decide si se usa. */
  scaleFactor: number;
  applyScaleFactor: boolean;
  /** En una CTB, 255 entradas: el índice 0 es el ACI 1. */
  styles: CadPlotStyle[];
  /** Grosores personalizados, en mm, en el orden del archivo. */
  customLineweights: number[];
}

export const CAD_DEFAULT_LINEWEIGHTS: readonly number[] = [
  0, 0.05, 0.09, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.53, 0.6,
  0.7, 0.8, 0.9, 1.0, 1.06, 1.2, 1.4, 1.58, 2.0, 2.11,
];

/**
 * `Monochrome.CTB`, `monochrome.ctb` y `monochrome` son LA MISMA tabla.
 *
 * El nombre lo teclea una persona en `PAGESETUP Estilos` y el archivo viene de
 * Windows, donde la caja no distingue. Comparar cadena a cadena convertía una
 * mayúscula en «la tabla no está cargada» — un fallo inventado por el programa
 * y no por el dibujo. Vive aquí, con el modelo, porque lo usan los DOS que
 * deciden si una tabla está: la comprobación previa de la configuración de
 * página y el propio trazado.
 */
export function cadPlotStyleTableNameMatches(a: string, b: string): boolean {
  const bare = (name: string) => name.trim().toLowerCase().replace(/\.(ctb|stb)$/, "");
  return a.trim() === b.trim() || bare(a) === bare(b);
}

/**
 * La tabla que pide un nombre, o `null`.
 *
 * Prueba el nombre EXACTO primero: `acad.ctb` y `acad.stb` sólo se distinguen
 * por la extensión, así que escribirla tiene que decidir en vez de dejarlo al
 * orden del catálogo.
 */
export function cadFindPlotStyleTable(
  tables: ReadonlyMap<string, CadPlotStyleTable>,
  name: string,
): CadPlotStyleTable | null {
  const exacto = tables.get(name);
  if (exacto) return exacto;
  for (const [clave, tabla] of tables)
    if (cadPlotStyleTableNameMatches(clave, name)) return tabla;
  return null;
}

export function createCadPlotStyle(overrides: Partial<CadPlotStyle> = {}): CadPlotStyle {
  return {
    name: "Normal",
    description: "",
    color: null,
    enableDither: true,
    convertToGrayscale: false,
    pen: 0,
    virtualPen: 0,
    screen: 100,
    linetype: null,
    adaptiveLinetype: true,
    lineweight: 0,
    lineEndStyle: "object",
    lineJoinStyle: "object",
    fillStyle: "object",
    ...overrides,
  };
}

/**
 * CTB en blanco: 255 estilos que no cambian nada («Usar el del objeto»).
 *
 * Es el punto de partida honesto. Una tabla nueva que ya trajera grosores
 * inventados haría que el primer trazado saliera distinto del dibujo sin que
 * nadie hubiera pedido nada.
 */
export function createCadColorTable(name = "acad"): CadPlotStyleTable {
  return {
    kind: "ctb",
    name,
    description: "",
    scaleFactor: 1,
    applyScaleFactor: false,
    styles: Array.from({ length: 255 }, (_unused, index) =>
      createCadPlotStyle({ name: `Color_${index + 1}` }),
    ),
    customLineweights: [...CAD_DEFAULT_LINEWEIGHTS],
  };
}

export function createCadNamedTable(name = "acad"): CadPlotStyleTable {
  return {
    kind: "stb",
    name,
    description: "",
    scaleFactor: 1,
    applyScaleFactor: false,
    styles: [createCadPlotStyle({ name: "Normal" })],
    customLineweights: [...CAD_DEFAULT_LINEWEIGHTS],
  };
}

/**
 * La CTB monocroma clásica: todo sale negro, cada color con su grosor.
 *
 * Los grosores son los de la serie ISO 128 que usa cualquier estudio: 0,13 para
 * ejes y tramas, 0,25 para el general, 0,35 para contornos y 0,50 para
 * secciones. Es el punto de partida que la gente espera encontrar hecho.
 */
export function createCadMonochromeTable(name = "monochrome"): CadPlotStyleTable {
  const weights: Readonly<Record<number, number>> = {
    1: 0.25,
    2: 0.18,
    3: 0.35,
    4: 0.13,
    5: 0.5,
    6: 0.25,
    7: 0.25,
    8: 0.13,
    9: 0.09,
  };
  const table = createCadColorTable(name);
  table.description = "Todo negro, grosor por color (ISO 128).";
  table.styles = table.styles.map((style, index) =>
    createCadPlotStyle({
      ...style,
      color: "#000000",
      convertToGrayscale: true,
      lineweight: weights[index + 1] ?? 0.25,
    }),
  );
  return table;
}

// ---------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------

export interface CadPlotStyleQuery {
  /** Color efectivo de la entidad, en hexadecimal. */
  color: string;
  /** Nombre del estilo asignado. Sólo lo usa una STB. */
  styleName?: string;
  /** Grosor propio de la entidad, en mm. */
  lineweight?: number;
}

export interface CadResolvedPlotStyle {
  color: string;
  lineweight: number;
  linetype: string | null;
  style: CadPlotStyle | null;
}

/**
 * Qué pluma le toca a una entidad.
 *
 * Con CTB manda el color, traducido a índice ACI. Con STB manda el nombre del
 * estilo, y si la entidad no tiene ninguno se usa `Normal` — que es
 * exactamente lo que hace AutoCAD y por qué una STB sin estilos asignados no
 * cambia el dibujo.
 */
export function resolveCadPlotStyle(
  table: CadPlotStyleTable | null,
  query: CadPlotStyleQuery,
): CadResolvedPlotStyle {
  const fallback: CadResolvedPlotStyle = {
    color: query.color,
    lineweight: query.lineweight ?? 0,
    linetype: null,
    style: null,
  };
  if (!table) return fallback;

  const style =
    table.kind === "ctb"
      ? table.styles[hexToAci(query.color) - 1]
      : (table.styles.find((candidate) => candidate.name === (query.styleName ?? "Normal")) ??
        table.styles.find((candidate) => candidate.name === "Normal"));
  if (!style) return fallback;

  let color = style.color ?? query.color;
  if (style.convertToGrayscale) color = toGrayscaleHex(color);
  if (style.screen !== 100) color = screenHex(color, style.screen);

  const scale = table.applyScaleFactor ? Math.max(0, table.scaleFactor) : 1;
  const lineweight = (style.lineweight > 0 ? style.lineweight : (query.lineweight ?? 0)) * scale;

  return { color, lineweight, linetype: style.linetype, style };
}

/** Color de salida del índice ACI `aci` según la tabla. Para la vista previa. */
export function cadPlotStylePreviewColor(table: CadPlotStyleTable, aci: number): string {
  return resolveCadPlotStyle(table, { color: aciToHex(aci) }).color;
}

// ---------------------------------------------------------------------------
// Serialización
// ---------------------------------------------------------------------------

const BOOL = (value: boolean): string => (value ? "TRUE" : "FALSE");
const parseBool = (value: string): boolean => value.trim().toUpperCase() === "TRUE";

/**
 * El color se guarda como el entero con signo de AutoCAD: `-1` significa
 * «usar el del objeto», y cualquier otro lleva el RGB en los tres bytes bajos
 * con `0xC2` en el alto (el marcador de color verdadero).
 */
function encodeColor(color: string | null): number {
  if (!color) return -1;
  const value = Number.parseInt(color.replace("#", ""), 16);
  if (!Number.isFinite(value)) return -1;
  // Entero de 32 bits con signo, igual que en el archivo.
  return ((0xc2 << 24) | (value & 0xffffff)) | 0;
}

function decodeColor(value: number): string | null {
  if (!Number.isFinite(value) || value === -1) return null;
  const rgb = value & 0xffffff;
  return `#${rgb.toString(16).padStart(6, "0")}`;
}

const END_STYLES: readonly CadPlotLineEndStyle[] = ["butt", "square", "round", "diamond"];
const JOIN_STYLES: readonly CadPlotLineJoinStyle[] = ["miter", "bevel", "round", "diamond"];
const FILL_STYLES: readonly CadPlotFillStyle[] = [
  "solid",
  "checkerboard",
  "crosshatch",
  "diamonds",
  "horizontal-bars",
  "slant-left",
  "slant-right",
  "square-dots",
  "vertical-bars",
];

const OBJECT_ENUM = 5;

function encodeEnum<T extends string>(values: readonly T[], value: T | "object"): number {
  const index = values.indexOf(value as T);
  return index < 0 ? OBJECT_ENUM : index;
}

function decodeEnum<T extends string>(values: readonly T[], raw: number): T | "object" {
  return values[raw] ?? "object";
}

/** Milímetros → decímetros de milímetro, que es como el archivo guarda el grosor. */
const number = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));

export function formatCadPlotStyleTable(table: CadPlotStyleTable): string {
  const lines: string[] = [];
  lines.push(`description="${table.description}"`);
  lines.push(`aci_table_available=${BOOL(table.kind === "ctb")}`);
  lines.push(`scale_factor=${number(table.scaleFactor)}`);
  lines.push(`apply_factor=${BOOL(table.applyScaleFactor)}`);
  lines.push("custom_lineweight_display_units=0");
  lines.push("plot_style{");
  table.styles.forEach((style, index) => {
    lines.push(` ${index}{`);
    lines.push(`  name="${style.name}"`);
    lines.push(`  localized_name="${style.name}"`);
    lines.push(`  description="${style.description}"`);
    lines.push(`  color=${encodeColor(style.color)}`);
    lines.push(`  mode_color=${encodeColor(style.color)}`);
    lines.push(`  color_policy=${style.convertToGrayscale ? 3 : 1}`);
    lines.push(`  physical_pen_number=${style.pen}`);
    lines.push(`  virtual_pen_number=${style.virtualPen}`);
    lines.push(`  screen=${style.screen}`);
    lines.push(`  linepattern_size=0.5`);
    lines.push(`  linetype=${style.linetype === null ? 31 : 0}`);
    lines.push(`  linetype_name="${style.linetype ?? "Use object linetype"}"`);
    lines.push(`  adaptive_linetype=${BOOL(style.adaptiveLinetype)}`);
    lines.push(`  lineweight=${number(style.lineweight)}`);
    lines.push(`  fill_style=${encodeEnum(FILL_STYLES, style.fillStyle)}`);
    lines.push(`  end_style=${encodeEnum(END_STYLES, style.lineEndStyle)}`);
    lines.push(`  join_style=${encodeEnum(JOIN_STYLES, style.lineJoinStyle)}`);
    lines.push(`  dither=${BOOL(style.enableDither)}`);
    lines.push(" }");
  });
  lines.push("}");
  lines.push("custom_lineweight_table{");
  table.customLineweights.forEach((weight, index) => {
    lines.push(` ${index}=${number(weight)}`);
  });
  lines.push("}");
  return `${lines.join("\r\n")}\r\n`;
}

interface ParsedBlock {
  values: Map<string, string>;
  blocks: Map<string, ParsedBlock>;
}

/** Analizador del formato de bloques anidados. Sin regex sobre todo el texto. */
function parseBlocks(source: string): ParsedBlock {
  const root: ParsedBlock = { values: new Map(), blocks: new Map() };
  const stack: ParsedBlock[] = [root];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "}") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (line.endsWith("{")) {
      const key = line.slice(0, -1).trim();
      const block: ParsedBlock = { values: new Map(), blocks: new Map() };
      stack[stack.length - 1].blocks.set(key, block);
      stack.push(block);
      continue;
    }
    const equals = line.indexOf("=");
    if (equals < 0) continue;
    stack[stack.length - 1].values.set(line.slice(0, equals).trim(), line.slice(equals + 1).trim());
  }
  return root;
}

const unquote = (value: string | undefined, fallback = ""): string =>
  value === undefined ? fallback : value.replace(/^"([\s\S]*)"$/, "$1");

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function parseCadPlotStyleTable(source: string, name = "acad"): CadPlotStyleTable {
  const root = parseBlocks(source);
  const styleBlocks = root.blocks.get("plot_style");
  const kind = parseBool(root.values.get("aci_table_available") ?? "TRUE") ? "ctb" : "stb";

  const styles: CadPlotStyle[] = [];
  if (styleBlocks) {
    const keys = [...styleBlocks.blocks.keys()].sort((a, b) => Number(a) - Number(b));
    for (const key of keys) {
      const block = styleBlocks.blocks.get(key)!;
      const colorValue = num(block.values.get("color"), -1);
      styles.push(
        createCadPlotStyle({
          name: unquote(block.values.get("name"), `Color_${Number(key) + 1}`),
          description: unquote(block.values.get("description")),
          color: decodeColor(colorValue),
          convertToGrayscale: num(block.values.get("color_policy"), 1) === 3,
          enableDither: parseBool(block.values.get("dither") ?? "TRUE"),
          pen: num(block.values.get("physical_pen_number"), 0),
          virtualPen: num(block.values.get("virtual_pen_number"), 0),
          screen: num(block.values.get("screen"), 100),
          linetype:
            num(block.values.get("linetype"), 31) === 31
              ? null
              : unquote(block.values.get("linetype_name"), "CONTINUOUS"),
          adaptiveLinetype: parseBool(block.values.get("adaptive_linetype") ?? "TRUE"),
          lineweight: num(block.values.get("lineweight"), 0),
          fillStyle: decodeEnum(FILL_STYLES, num(block.values.get("fill_style"), OBJECT_ENUM)),
          lineEndStyle: decodeEnum(END_STYLES, num(block.values.get("end_style"), OBJECT_ENUM)),
          lineJoinStyle: decodeEnum(JOIN_STYLES, num(block.values.get("join_style"), OBJECT_ENUM)),
        }),
      );
    }
  }

  const weightBlock = root.blocks.get("custom_lineweight_table");
  const customLineweights = weightBlock
    ? [...weightBlock.values.entries()]
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, value]) => num(value, 0))
    : [...CAD_DEFAULT_LINEWEIGHTS];

  return {
    kind,
    name,
    description: unquote(root.values.get("description")),
    scaleFactor: num(root.values.get("scale_factor"), 1),
    applyScaleFactor: parseBool(root.values.get("apply_factor") ?? "FALSE"),
    // Una CTB tiene 255 estilos por definición: si el archivo trae menos —está
    // truncado, o es una STB mal etiquetada— se completa en vez de dejar
    // huecos que reventarían al resolver un ACI alto.
    styles:
      kind === "ctb" && styles.length < 255
        ? [
            ...styles,
            ...Array.from({ length: 255 - styles.length }, (_unused, index) =>
              createCadPlotStyle({ name: `Color_${styles.length + index + 1}` }),
            ),
          ]
        : styles.length > 0
          ? styles
          : [createCadPlotStyle()],
    customLineweights,
  };
}

// ---------------------------------------------------------------------------
// Contenedor de archivo
// ---------------------------------------------------------------------------

export const CAD_PLOT_TABLE_HEADER = "PIAFILEVERSION_2.0,CTBVER1,compress\r\npmzlibcodec";

/** Códec inyectado: `node:zlib` en Node, `DecompressionStream` en el navegador. */
export interface CadZlibCodec {
  inflate(data: Uint8Array): Uint8Array;
  deflate(data: Uint8Array): Uint8Array;
}

const ASCII = (text: string): Uint8Array =>
  Uint8Array.from(text, (character) => character.charCodeAt(0) & 0xff);

function textOf(data: Uint8Array): string {
  let out = "";
  for (const byte of data) out += String.fromCharCode(byte);
  return out;
}

/**
 * Localiza el flujo zlib dentro del archivo.
 *
 * Se busca la firma (`0x78` seguido de un segundo byte que hace múltiplo de 31
 * la palabra) en vez de confiar en un desplazamiento fijo, porque la cabecera
 * lleva tres enteros de tamaño cuya disposición exacta varía entre versiones y
 * un desplazamiento cableado convertiría «lee la CTB del estudio» en «lee las
 * CTB de una versión concreta».
 */
function findZlibStart(data: Uint8Array, from: number): number {
  for (let index = from; index + 1 < data.length; index += 1) {
    if (data[index] !== 0x78) continue;
    if (((data[index] << 8) | data[index + 1]) % 31 === 0) return index;
  }
  return -1;
}

export interface CadPlotTableImport {
  table: CadPlotStyleTable;
  /** `true` si venía comprimida detrás de la cabecera de AutoCAD. */
  compressed: boolean;
}

export function importCadPlotStyleTable(
  data: Uint8Array,
  name = "acad",
  codec?: CadZlibCodec,
): CadPlotTableImport {
  const head = textOf(data.subarray(0, Math.min(64, data.length)));
  if (!head.startsWith("PIAFILEVERSION"))
    return { table: parseCadPlotStyleTable(textOf(data), name), compressed: false };

  if (!codec)
    throw new Error(
      "La tabla de plumas viene comprimida y no se ha inyectado ningún códec zlib.",
    );
  const start = findZlibStart(data, CAD_PLOT_TABLE_HEADER.length);
  if (start < 0) throw new Error("La tabla de plumas no contiene ningún flujo zlib legible.");
  return {
    table: parseCadPlotStyleTable(textOf(codec.inflate(data.subarray(start))), name),
    compressed: true,
  };
}

/**
 * Escribe el archivo. Con códec sale el contenedor comprimido de AutoCAD; sin
 * él, el cuerpo en claro — que este mismo módulo vuelve a leer, así que
 * exportar e importar sin códec sigue siendo una ida y vuelta completa.
 */
export function exportCadPlotStyleTable(
  table: CadPlotStyleTable,
  codec?: CadZlibCodec,
): Uint8Array {
  const body = ASCII(formatCadPlotStyleTable(table));
  if (!codec) return body;
  const compressed = codec.deflate(body);
  const header = ASCII(CAD_PLOT_TABLE_HEADER);
  const sizes = new Uint8Array(12);
  const view = new DataView(sizes.buffer);
  view.setUint32(0, body.length, true);
  view.setUint32(4, body.length, true);
  view.setUint32(8, compressed.length, true);
  const out = new Uint8Array(header.length + sizes.length + compressed.length);
  out.set(header, 0);
  out.set(sizes, header.length);
  out.set(compressed, header.length + sizes.length);
  return out;
}

/** Extensión canónica del archivo según el tipo de tabla. */
export function cadPlotStyleTableFileName(table: CadPlotStyleTable): string {
  return `${table.name}.${table.kind}`;
}
