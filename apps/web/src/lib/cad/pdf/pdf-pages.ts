/**
 * Las PÁGINAS de un PDF: cuántas hay, qué tamaño tienen, cómo están giradas y
 * dónde vive su contenido.
 *
 * ## Por qué el tamaño de la página no es `MediaBox` a secas
 *
 * `/MediaBox` puede empezar en un origen que NO es `0 0`. Un exportador que
 * recorta una lámina grande emite `[850 400 1400 800]`: el papel mide 550×400
 * puntos y sus coordenadas viven desplazadas. Un lector que reste mal deja todo
 * el plano fuera del papel, y como el dibujo sigue siendo geométricamente
 * correcto NADIE lo detecta hasta que se imprime. El desplazamiento se resta
 * aquí, una sola vez, y todo lo demás trabaja con el origen en la esquina
 * inferior izquierda del papel.
 *
 * `/Rotate` es el otro. Un plano escaneado en horizontal llega como una página
 * vertical con `/Rotate 90`. Si no se aplica, el plano entra tumbado y lo que
 * el arquitecto calca encima sale girado noventa grados: un error catastrófico
 * y silencioso, porque el dibujo se ve perfectamente bien hasta que se compara
 * con la realidad.
 *
 * ## Las capas opcionales
 *
 * Un PDF de CAD moderno trae grupos de contenido opcional (OCG): las capas del
 * dibujo original, con las que estaban apagadas al exportar marcadas como
 * apagadas. Aquí se leen sus NOMBRES y cuáles nacen apagadas; el intérprete de
 * contenido decide qué hacer con ellas. Importar la geometría de una capa que
 * el remitente había apagado añade al plano líneas que él no ve — y discutir
 * sobre un plano donde cada uno ve cosas distintas es peor que no importarlo.
 */
import {
  CadPdfObjectError,
  CadPdfObjects,
  type CadPdfValue,
} from "./pdf-objects";

/** Rectángulo del PDF, en puntos, tal cual viene: `[x0 y0 x1 y1]`. */
export interface CadPdfBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CadPdfPage {
  /** 1-based, como lo cuenta el usuario. */
  number: number;
  /** Ancho y alto ÚTILES, en puntos, ya sin el desplazamiento del `MediaBox`. */
  widthPt: number;
  heightPt: number;
  /** Esquina inferior izquierda del `MediaBox`. Lo que hay que RESTAR. */
  originPt: { x: number; y: number };
  /** Giro declarado, normalizado a 0, 90, 180 o 270. */
  rotate: number;
  /** `/Resources` ya heredado del árbol de páginas. */
  resources: CadPdfValue;
  /** Contenido concatenado de todos los `/Contents` de la página. */
  content: Uint8Array;
  /** Motivos por los que parte del contenido no se pudo leer. */
  unreadable: readonly string[];
}

/** Un grupo de contenido opcional: una CAPA del dibujo original. */
export interface CadPdfOptionalGroup {
  /** Número de objeto del OCG. Es como lo nombra el flujo de contenido. */
  ref: number;
  name: string;
  /** `false` si la configuración por defecto lo trae APAGADO. */
  visible: boolean;
}

export interface CadPdfDocumentStructure {
  pages: CadPdfPage[];
  optionalGroups: CadPdfOptionalGroup[];
  /** Versión declarada en la cabecera (`%PDF-1.7` → `"1.7"`). */
  version: string;
  /** `/Producer` o `/Creator`, si el PDF los declara. Sirve para el informe. */
  producer: string;
}

const MM_PER_POINT = 25.4 / 72;

/** Puntos PostScript → milímetros. La unidad del papel del arquitecto. */
export const cadPdfPointsToMm = (points: number) => points * MM_PER_POINT;

function boxOf(objects: CadPdfObjects, value: CadPdfValue): CadPdfBox | null {
  if (value.kind !== "array" || value.items.length < 4) return null;
  const numbers = value.items.map((item) => {
    const resolved = objects.resolve(item);
    return resolved.kind === "number" ? resolved.value : Number.NaN;
  });
  if (numbers.some((number) => !Number.isFinite(number))) return null;
  return {
    x0: Math.min(numbers[0], numbers[2]),
    y0: Math.min(numbers[1], numbers[3]),
    x1: Math.max(numbers[0], numbers[2]),
    y1: Math.max(numbers[1], numbers[3]),
  };
}

/** Atributos que una página HEREDA de sus ancestros en el árbol. */
interface Inherited {
  resources: CadPdfValue | null;
  mediaBox: CadPdfBox | null;
  rotate: number | null;
}

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  // Los `/Contents` de una página pueden venir troceados en varios flujos, y un
  // operador puede quedar PARTIDO entre dos. Se unen con un salto de línea, que
  // es lo que exige la especificación y lo que evita que `10 20 l` y `S` del
  // trozo siguiente se peguen en `lS`.
  const separator = Uint8Array.of(0x0a);
  const total = chunks.reduce((sum, chunk) => sum + chunk.length + 1, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
    out.set(separator, cursor);
    cursor += 1;
  }
  return out.subarray(0, cursor);
}

function contentOf(
  objects: CadPdfObjects,
  page: CadPdfValue,
  unreadable: string[],
): Uint8Array {
  const contents = objects.entry(page, "Contents");
  const streams =
    contents.kind === "array" ? contents.items.map((item) => objects.resolve(item)) : [contents];
  const chunks: Uint8Array[] = [];
  for (const stream of streams) {
    if (stream.kind !== "stream") continue;
    const { data, unreadable: reason } = objects.streamData(stream);
    if (reason) {
      unreadable.push(reason);
      continue;
    }
    chunks.push(data);
  }
  return concatenate(chunks);
}

function pageFrom(
  objects: CadPdfObjects,
  node: CadPdfValue,
  inherited: Inherited,
  number: number,
): CadPdfPage {
  const unreadable: string[] = [];
  const mediaBox =
    boxOf(objects, objects.entry(node, "MediaBox")) ??
    inherited.mediaBox ??
    // Carta, que es el papel por defecto de la especificación. Se DECLARA que
    // se supuso: una escala derivada de un tamaño supuesto no es una medida.
    (unreadable.push("la página no declara su tamaño y se supone Carta (612×792 pt)"),
    { x0: 0, y0: 0, x1: 612, y1: 792 });

  const rotateValue = objects.entry(node, "Rotate");
  const rotateRaw =
    rotateValue.kind === "number" ? rotateValue.value : (inherited.rotate ?? 0);
  // `/Rotate` sólo admite múltiplos de 90. Uno que no lo sea es un archivo mal
  // escrito; se normaliza al múltiplo más cercano en vez de propagar un giro
  // arbitrario que descuadraría todo el plano.
  const rotate = ((Math.round(rotateRaw / 90) * 90) % 360 + 360) % 360;

  const ownResources = objects.entry(node, "Resources");
  const resources =
    ownResources.kind === "dict" ? ownResources : (inherited.resources ?? { kind: "null" });

  return {
    number,
    widthPt: mediaBox.x1 - mediaBox.x0,
    heightPt: mediaBox.y1 - mediaBox.y0,
    originPt: { x: mediaBox.x0, y: mediaBox.y0 },
    rotate,
    resources,
    content: contentOf(objects, node, unreadable),
    unreadable,
  };
}

/**
 * Recorre el árbol de páginas desde el catálogo.
 *
 * Se lleva un conjunto de nodos ya visitados porque un `/Kids` que se apunta a
 * sí mismo —lo produce algún reparador de PDF— colgaría el recorrido, y un
 * navegador colgado no dice qué pasó.
 */
function walkPageTree(
  objects: CadPdfObjects,
  node: CadPdfValue,
  inherited: Inherited,
  pages: CadPdfPage[],
  seen: Set<CadPdfValue>,
  depth: number,
): void {
  if (depth > 64 || seen.has(node) || pages.length >= 4096) return;
  seen.add(node);
  const type = objects.name(node, "Type");
  const kids = objects.array(node, "Kids");

  if (type === "Page" || (kids.length === 0 && type !== "Pages")) {
    pages.push(pageFrom(objects, node, inherited, pages.length + 1));
    return;
  }

  const ownResources = objects.entry(node, "Resources");
  const ownMediaBox = boxOf(objects, objects.entry(node, "MediaBox"));
  const ownRotate = objects.entry(node, "Rotate");
  const next: Inherited = {
    resources: ownResources.kind === "dict" ? ownResources : inherited.resources,
    mediaBox: ownMediaBox ?? inherited.mediaBox,
    rotate: ownRotate.kind === "number" ? ownRotate.value : inherited.rotate,
  };
  for (const kid of kids) walkPageTree(objects, objects.resolve(kid), next, pages, seen, depth + 1);
}

function optionalGroupsOf(objects: CadPdfObjects): CadPdfOptionalGroup[] {
  const groups = new Map<number, CadPdfOptionalGroup>();
  const catalogs = objects.streamsOfType("Catalog");
  const roots: CadPdfValue[] = [...catalogs];
  for (const value of objects.values())
    if (value.kind === "dict" && objects.name(value, "Type") === "Catalog") roots.push(value);

  const off = new Set<number>();
  for (const root of roots) {
    const properties = objects.entry(root, "OCProperties");
    if (properties.kind !== "dict") continue;
    const configuration = objects.entry(properties, "D");
    for (const item of objects.array(configuration, "OFF"))
      if (item.kind === "ref") off.add(item.num);
    for (const item of objects.array(properties, "OCGs")) {
      if (item.kind !== "ref") continue;
      const group = objects.resolve(item);
      const name = objects.entry(group, "Name");
      groups.set(item.num, {
        ref: item.num,
        name:
          name.kind === "string"
            ? decodeCadPdfText(name.bytes)
            : `capa ${item.num}`,
        visible: !off.has(item.num),
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.ref - b.ref);
}

/**
 * Texto de una cadena de PDF.
 *
 * Un `/Name` de OCG o un `/Title` viene en PDFDocEncoding (≈ latin-1) o en
 * UTF-16BE con marca `FE FF`. Leer el segundo como el primero convierte «Muros»
 * en «M u r o s» con nulos entre medias, que en pantalla parece un nombre
 * corrupto y hace que el usuario dude del archivo en vez del lector.
 */
export function decodeCadPdfText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let index = 2; index + 1 < bytes.length; index += 2)
      text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    return text;
  }
  return String.fromCharCode(...bytes);
}

export function readCadPdfStructure(
  objects: CadPdfObjects,
  header: string,
): CadPdfDocumentStructure {
  const pages: CadPdfPage[] = [];
  const seen = new Set<CadPdfValue>();
  for (const value of objects.values()) {
    if (value.kind !== "dict" || objects.name(value, "Type") !== "Catalog") continue;
    const root = objects.entry(value, "Pages");
    if (root.kind === "dict")
      walkPageTree(objects, root, { resources: null, mediaBox: null, rotate: null }, pages, seen, 0);
  }

  // Sin catálogo utilizable se recogen los `/Type /Page` sueltos. Es el PDF con
  // la tabla rota, y renunciar ahí sería negarse a abrir justo el archivo que
  // más falta hace abrir.
  if (pages.length === 0) {
    for (const value of objects.values()) {
      if (value.kind !== "dict" || objects.name(value, "Type") !== "Page") continue;
      pages.push(
        pageFrom(objects, value, { resources: null, mediaBox: null, rotate: null }, pages.length + 1),
      );
    }
  }
  if (pages.length === 0)
    throw new CadPdfObjectError(
      "no_pages",
      "El PDF no declara ninguna página legible: puede estar truncado o usar una estructura que este lector no recorre.",
    );

  let producer = "";
  for (const value of objects.values()) {
    if (value.kind !== "dict") continue;
    for (const key of ["Producer", "Creator"]) {
      const entry = objects.entry(value, key);
      if (entry.kind === "string" && !producer) producer = decodeCadPdfText(entry.bytes).trim();
    }
  }

  return {
    pages,
    optionalGroups: optionalGroupsOf(objects),
    version: header.match(/%PDF-(\d+\.\d+)/)?.[1] ?? "",
    producer,
  };
}
