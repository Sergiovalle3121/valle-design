/**
 * PDFIMPORT: el PDF VECTORIAL como geometría editable.
 *
 * ## Qué importa de verdad y qué no
 *
 * Este módulo importa los TRAZOS y el TEXTO de un PDF vectorial. Eso es lo que
 * sale de cualquier CAD moderno al exportar, y es la mitad del correo que
 * recibe un despacho. **No** importa un PDF escaneado: ahí dentro no hay
 * geometría, hay una fotografía, y no hay lector en el mundo que saque líneas
 * de una foto sin inventárselas. Cuando el archivo es una imagen se dice con
 * todas las letras y se remite a `PDFATTACH`, que es lo que sí resuelve ese
 * caso: poner el escaneo de fondo y calcar encima.
 *
 * Decirlo importa tanto como hacerlo. Un importador que devuelve un documento
 * vacío ante un escaneo deja al arquitecto pensando que el programa falló, o
 * peor, que su archivo está roto. Y uno que devolviera «geometría» sacada de
 * los bordes de la imagen entregaría un plano falso, que en obra se paga.
 *
 * ## La cadena completa
 *
 *   bytes → objetos (`pdf-objects`) → páginas (`pdf-pages`) →
 *   flujo de contenido (`pdf-content`) → curvas (`pdf-curves`) → AQUÍ
 *
 * Cada eslabón declara lo que no supo hacer, y este módulo los junta en una
 * lista de avisos que `pdf-import-report.ts` traduce a español llano — el mismo
 * contrato que ya existe para el DXF ajeno.
 *
 * ## La escala
 *
 * Un punto PostScript es 1/72 de pulgada. El documento trabaja en milímetros,
 * así que por defecto un punto son 0,352 8 mm y el plano entra a TAMAÑO DE
 * PAPEL, no a escala real. Es lo correcto y es lo que hace AutoCAD: el PDF no
 * sabe a qué escala se dibujó. Para llevarlo a medida real está `PDFATTACH` con
 * su ajuste por dos puntos, y aquí `unitsPerPoint`.
 */
import type { CadEntity, CadLayerDef, CadPoint3 } from "../cad-document";
import {
  CadPdfObjectError,
  readCadPdfObjects,
  type CadPdfObjects,
} from "./pdf-objects";
import {
  readCadPdfStructure,
  type CadPdfDocumentStructure,
  type CadPdfPage,
} from "./pdf-pages";
import {
  scanCadPdfContent,
  type CadPdfContentScan,
  type CadPdfPoint,
} from "./pdf-content";
import {
  cadPdfDedupe,
  cadPdfFlattenSubpath,
  cadPdfIsDegenerate,
  type CadPdfCurveMode,
} from "./pdf-curves";

/** Milímetros por punto PostScript. La escala por defecto: tamaño de papel. */
export const CAD_PDF_MM_PER_POINT = 25.4 / 72;

export interface CadPdfImportWarning {
  code: string;
  message: string;
  /** Cuántos casos cubre. Siempre ≥ 1. */
  count: number;
  detail?: string;
}

/** El PDF no se pudo importar como geometría. Cada código, una causa distinta. */
export class CadPdfImportError extends Error {
  constructor(
    readonly code:
      | "not_pdf"
      | "encrypted"
      | "no_pages"
      | "page_out_of_range"
      | "scanned_image"
      | "no_geometry"
      | "unreadable_content",
    detail: string,
  ) {
    super(detail);
    this.name = "CadPdfImportError";
  }
}

export interface CadPdfImportOptions {
  /** Página a importar, 1-based. Por defecto la primera. */
  page?: number;
  /** Unidades de dibujo por punto PostScript. Por defecto, milímetros. */
  unitsPerPoint?: number;
  /** Cómo entran las Béziers. `polyline` aproxima; `spline` es exacto. */
  curveMode?: CadPdfCurveMode;
  /**
   * Desviación máxima admitida al aplanar, en UNIDADES DE DIBUJO.
   *
   * 0,05 mm por defecto: es la mitad del trazo más fino que imprime un plóter y
   * dos órdenes de magnitud por debajo de lo que cualquiera puede medir sobre el
   * papel. Bajarlo multiplica los vértices sin que nadie note la diferencia.
   */
  curveTolerance?: number;
  /** Importar también lo que el remitente dejó en capas apagadas. */
  includeHiddenLayers?: boolean;
  /** Punto del dibujo donde cae la esquina inferior izquierda de la página. */
  insertion?: Partial<CadPoint3>;
  /** Prefijo de los ids generados. Distingue dos importaciones del mismo PDF. */
  idPrefix?: string;
  /** Prefijo de las capas creadas. */
  layerPrefix?: string;
}

export interface CadPdfCurveFidelity {
  mode: CadPdfCurveMode;
  /** Cuántas Béziers traía la página. */
  curves: number;
  /** Tolerancia pedida, en unidades de dibujo. */
  toleranceUnits: number;
  /**
   * Desviación máxima MEDIDA, en unidades de dibujo. En modo `spline` es
   * exactamente 0 porque la conversión es algebraica, no una aproximación.
   */
  maxErrorUnits: number;
}

export interface CadPdfImportResult {
  page: number;
  pageCount: number;
  /** Tamaño útil de la página importada, en unidades de dibujo. */
  pageSize: { width: number; height: number };
  /** Giro declarado por el PDF y ya aplicado a la geometría. */
  pageRotation: number;
  entities: CadEntity[];
  layers: CadLayerDef[];
  warnings: CadPdfImportWarning[];
  curveFidelity: CadPdfCurveFidelity;
  /** Nombres de las capas opcionales que traía el PDF, encendidas y apagadas. */
  optionalGroups: ReadonlyArray<{ name: string; visible: boolean }>;
  /** Qué produjo el PDF, si lo declara. Ayuda a explicar rarezas. */
  producer: string;
  version: string;
  counts: {
    paths: number;
    texts: number;
    images: number;
    /** Rótulos cuyos bytes eran índices de glifo y no se pudieron traducir. */
    unreadableTexts: number;
    /** Rótulos invisibles: la capa que deja un OCR sobre un escaneo. */
    invisibleTexts: number;
  };
}

const safe = (value: string) => value.trim().replace(/[^a-z0-9_.:-]+/gi, "-").slice(0, 64);

/**
 * Transformada de la página: origen del `MediaBox`, `/Rotate` y escala.
 *
 * Se compone UNA vez y se aplica a cada punto. Repartir estos tres pasos por el
 * código sería garantizar que algún camino se olvida de uno, y olvidarse del
 * giro produce un plano perfecto girado noventa grados.
 */
function pageTransform(
  page: CadPdfPage,
  unitsPerPoint: number,
  insertion: CadPoint3,
): (point: CadPdfPoint) => CadPoint3 {
  const { x: originX, y: originY } = page.originPt;
  const width = page.widthPt;
  const height = page.heightPt;
  return (point) => {
    const x = point.x - originX;
    const y = point.y - originY;
    let rotatedX = x;
    let rotatedY = y;
    // `/Rotate` gira el contenido en sentido HORARIO al mostrarlo. Estas son
    // esas tres rotaciones, ya trasladadas al primer cuadrante para que la
    // esquina inferior izquierda del papel siga siendo el origen.
    if (page.rotate === 90) {
      rotatedX = y;
      rotatedY = width - x;
    } else if (page.rotate === 180) {
      rotatedX = width - x;
      rotatedY = height - y;
    } else if (page.rotate === 270) {
      rotatedX = height - y;
      rotatedY = x;
    }
    return {
      x: insertion.x + rotatedX * unitsPerPoint,
      y: insertion.y + rotatedY * unitsPerPoint,
      z: insertion.z,
    };
  };
}

/** Capa de destino de un trazo: la del PDF si la tenía, o la general. */
function layerIdFor(prefix: string, layerName: string | null): string {
  return layerName ? `${prefix}-${safe(layerName)}` : prefix;
}

const LAYER_COLORS = ["#d4d4d8", "#93c5fd", "#fcd34d", "#86efac", "#f9a8d4", "#fdba74"];

/**
 * ¿Es esto un ESCANEO?
 *
 * El criterio se elige severo a propósito y se publica: una página SIN ningún
 * trazo, con al menos una imagen, y sin texto visible. Los tres a la vez.
 *
 *  - Si hay trazos, hay geometría, aunque sea poca: se importa lo que hay.
 *  - Si hay texto visible, el PDF no es sólo una foto.
 *  - El texto INVISIBLE no cuenta como contenido: es la capa que deja un OCR
 *    sobre un escaneo, y tomarla por contenido haría que justo los escaneos
 *    mejor procesados —los que sí se pueden buscar— dejaran de detectarse.
 */
function looksScanned(scan: CadPdfContentScan): boolean {
  if (scan.paths.length > 0) return false;
  if (scan.images.length === 0) return false;
  return !scan.texts.some((text) => text.renderMode !== 3 && text.text.length > 0);
}

interface WarningBag {
  add(code: string, message: string, detail?: string): void;
  list(): CadPdfImportWarning[];
}

function warningBag(): WarningBag {
  const items = new Map<string, CadPdfImportWarning>();
  return {
    add(code, message, detail) {
      const key = `${code}|${detail ?? ""}`;
      const existing = items.get(key);
      if (existing) existing.count += 1;
      else items.set(key, { code, message, count: 1, ...(detail ? { detail } : {}) });
    },
    list: () => [...items.values()],
  };
}

/** Traduce una nota del intérprete a un aviso con código estable. */
const UNSUPPORTED_CODES: ReadonlyArray<{ pattern: RegExp; code: string }> = [
  { pattern: /degradado/, code: "shading_dropped" },
  { pattern: /patr[oó]n/, code: "pattern_fill_flattened" },
  { pattern: /transparencia/, code: "transparency_flattened" },
  { pattern: /m[aá]scara/, code: "soft_mask_dropped" },
  { pattern: /recorte/, code: "clip_not_applied" },
  { pattern: /imagen/, code: "raster_dropped" },
  { pattern: /XObject/, code: "xobject_dropped" },
  { pattern: /l[ií]mite de trazos/, code: "path_limit" },
  { pattern: /tama[nñ]o y se supone/, code: "assumed_page_size" },
  { pattern: /no se pudo (leer|descomprimir)/, code: "stream_unreadable" },
];

const codeFor = (note: string): string =>
  UNSUPPORTED_CODES.find((entry) => entry.pattern.test(note))?.code ?? "unsupported_feature";

/**
 * Importa UNA página de un PDF como entidades canónicas.
 *
 * Lanza `CadPdfImportError` cuando no hay nada honesto que devolver. Nunca
 * devuelve un documento vacío haciéndolo pasar por éxito.
 */
export function importCadPdf(
  bytes: Uint8Array,
  options: CadPdfImportOptions = {},
): CadPdfImportResult {
  const unitsPerPoint = options.unitsPerPoint ?? CAD_PDF_MM_PER_POINT;
  const curveMode: CadPdfCurveMode = options.curveMode ?? "polyline";
  const toleranceUnits = options.curveTolerance ?? 0.05;
  const idPrefix = safe(options.idPrefix ?? "pdf") || "pdf";
  const layerPrefix = safe(options.layerPrefix ?? "PDF") || "PDF";
  const insertion: CadPoint3 = {
    x: Number.isFinite(options.insertion?.x) ? Number(options.insertion?.x) : 0,
    y: Number.isFinite(options.insertion?.y) ? Number(options.insertion?.y) : 0,
    z: Number.isFinite(options.insertion?.z) ? Number(options.insertion?.z) : 0,
  };

  let objects: CadPdfObjects;
  let structure: CadPdfDocumentStructure;
  try {
    objects = readCadPdfObjects(bytes);
    structure = readCadPdfStructure(objects, headerOf(bytes));
  } catch (error) {
    if (error instanceof CadPdfObjectError) {
      const code =
        error.code === "not_pdf"
          ? "not_pdf"
          : error.code === "encrypted"
            ? "encrypted"
            : "no_pages";
      throw new CadPdfImportError(code, error.message);
    }
    throw error;
  }

  const pageNumber = options.page ?? 1;
  if (pageNumber < 1 || pageNumber > structure.pages.length)
    throw new CadPdfImportError(
      "page_out_of_range",
      `El PDF tiene ${structure.pages.length} página(s) y se pidió la ${pageNumber}.`,
    );
  const page = structure.pages[pageNumber - 1];

  const scan = scanCadPdfContent(objects, page, structure.optionalGroups, {
    includeHiddenLayers: options.includeHiddenLayers,
  });

  if (looksScanned(scan))
    throw new CadPdfImportError(
      "scanned_image",
      "Este PDF es una imagen, no tiene geometría que importar; úsalo como plantilla con PDFATTACH y calca encima.",
    );

  if (scan.paths.length === 0 && scan.texts.length === 0) {
    // Distinguir «página en blanco» de «no supe leerla» es la diferencia entre
    // que el arquitecto busque el fallo en su archivo o en el nuestro.
    const unreadable = scan.unsupported.filter((note) => /no se pudo|filtro/.test(note));
    if (unreadable.length)
      throw new CadPdfImportError(
        "unreadable_content",
        `El contenido de la página ${pageNumber} no se pudo leer: ${unreadable[0]}`,
      );
    throw new CadPdfImportError(
      "no_geometry",
      scan.operators === 0
        ? `La página ${pageNumber} está en blanco: no tiene nada dibujado.`
        : `La página ${pageNumber} no dejó ninguna geometría importable.`,
    );
  }

  const toPoint = pageTransform(page, unitsPerPoint, insertion);
  // La tolerancia se pide en unidades de DIBUJO y el aplanado trabaja en puntos
  // de PDF. Convertirla aquí es lo que hace que «0,05 mm» signifique 0,05 mm en
  // el plano y no 0,05 puntos, que serían diecisiete veces más grueso.
  const tolerancePt = toleranceUnits / (unitsPerPoint || 1);

  const warnings = warningBag();
  for (const note of scan.unsupported) warnings.add(codeFor(note), note);
  for (const layer of scan.skippedLayers)
    warnings.add(
      "hidden_layer_skipped",
      `la capa «${layer}» venía apagada en el PDF y no se importó`,
      layer,
    );

  const entities: CadEntity[] = [];
  const usedLayers = new Map<string, string>();
  let curves = 0;
  let maxErrorPt = 0;
  let sequence = 0;
  const nextId = () => `${idPrefix}:${(sequence += 1)}`;

  const noteLayer = (layerName: string | null): string => {
    const id = layerIdFor(layerPrefix, layerName);
    if (!usedLayers.has(id)) usedLayers.set(id, layerName ? `${layerPrefix}-${layerName}` : layerPrefix);
    return id;
  };

  for (const path of scan.paths) {
    const layer = noteLayer(path.layerName);
    const presentation =
      path.color && path.color !== "#000000"
        ? { color: { source: "explicit" as const, value: path.color } }
        : undefined;
    for (const subpath of path.subpaths) {
      const flattened = cadPdfFlattenSubpath(subpath, curveMode, tolerancePt);
      curves += flattened.curves;
      maxErrorPt = Math.max(maxErrorPt, flattened.maxError);
      for (const piece of flattened.pieces) {
        if (piece.kind === "bezier") {
          entities.push({
            id: nextId(),
            type: "spline",
            degree: 3,
            controlPoints: piece.points.map(toPoint),
            // Una Bézier cúbica es una NURBS de grado 3 con estos nudos. No es
            // una elección de diseño: es la definición.
            knots: [0, 0, 0, 0, 1, 1, 1, 1],
            layer,
            ...(presentation ? { context: { presentation } } : {}),
          });
          continue;
        }
        const points = cadPdfDedupe(piece.points, 1e-7);
        if (cadPdfIsDegenerate(points)) continue;
        const vertices = points.map(toPoint);
        if (vertices.length === 2 && !piece.closed) {
          entities.push({
            id: nextId(),
            type: "line",
            start: vertices[0],
            end: vertices[1],
            layer,
            ...(presentation ? { context: { presentation } } : {}),
          });
          continue;
        }
        entities.push({
          id: nextId(),
          type: "polyline",
          vertices,
          closed: piece.closed,
          layer,
          ...(presentation ? { context: { presentation } } : {}),
        });
      }
    }
    if (path.fill && !path.stroke)
      warnings.add(
        "fill_as_outline",
        "un relleno macizo entra como su CONTORNO, sin el sombreado que lo llenaba",
      );
  }

  let unreadableTexts = 0;
  let invisibleTexts = 0;
  for (const text of scan.texts) {
    if (text.renderMode === 3) {
      invisibleTexts += 1;
      // El texto invisible NO se importa: es la capa de búsqueda de un OCR o un
      // truco de composición. Meterlo en el plano llenaría el dibujo de rótulos
      // que en el PDF nadie ve.
      warnings.add(
        "invisible_text_skipped",
        "hay texto invisible (capa de búsqueda de un escaneo) que no se importó",
      );
      continue;
    }
    if (text.glyphIndices || !text.text) {
      unreadableTexts += 1;
      warnings.add(
        "text_glyph_indices",
        `un rótulo con la fuente ${text.baseFont || "incrustada"} no se pudo traducir a texto: ` +
          "el PDF guarda índices de glifo y no trae su tabla de caracteres",
      );
      continue;
    }
    const layer = noteLayer(text.layerName);
    const origin = toPoint(text.origin);
    // El giro del papel se suma al del rótulo: un plano con `/Rotate 90` lleva
    // sus textos girados igual que su geometría.
    const rotation = text.rotation + (page.rotate * Math.PI) / 180;
    entities.push({
      id: nextId(),
      type: "mtext",
      insertion: origin,
      text: text.text,
      height: text.heightPt * unitsPerPoint,
      rotation,
      alignment: "bottom-left",
      layer,
    });
    if (text.fontSource === "assumed_winansi")
      warnings.add(
        "assumed_encoding",
        "un rótulo llegó sin declarar su codificación y se leyó como WinAnsi: " +
          "si algún acento sale raro, es por eso",
      );
  }

  for (const image of scan.images)
    warnings.add(
      "raster_dropped",
      `una imagen de ${image.widthPx}×${image.heightPx} píxeles NO entra como geometría; ` +
        "para conservarla, adjunta el PDF con PDFATTACH",
    );

  if (entities.length === 0)
    throw new CadPdfImportError(
      "no_geometry",
      `La página ${pageNumber} no dejó ninguna entidad: lo que traía no se pudo convertir en geometría.`,
    );

  const layers: CadLayerDef[] = [...usedLayers.entries()].map(([id, name], index) => ({
    id,
    name,
    color: LAYER_COLORS[index % LAYER_COLORS.length],
    visible: true,
    locked: false,
  }));

  const size = page.rotate === 90 || page.rotate === 270
    ? { width: page.heightPt * unitsPerPoint, height: page.widthPt * unitsPerPoint }
    : { width: page.widthPt * unitsPerPoint, height: page.heightPt * unitsPerPoint };

  return {
    page: pageNumber,
    pageCount: structure.pages.length,
    pageSize: size,
    pageRotation: page.rotate,
    entities,
    layers,
    warnings: warnings.list(),
    curveFidelity: {
      mode: curveMode,
      curves,
      toleranceUnits,
      // En modo spline no hay aproximación que medir; en modo polilínea el
      // número sale de comparar la curva original con lo que se emitió.
      maxErrorUnits: curveMode === "spline" ? 0 : maxErrorPt * unitsPerPoint,
    },
    optionalGroups: structure.optionalGroups.map((group) => ({
      name: group.name,
      visible: group.visible,
    })),
    producer: structure.producer,
    version: structure.version,
    counts: {
      paths: scan.paths.length,
      texts: scan.texts.length,
      images: scan.images.length,
      unreadableTexts,
      invisibleTexts,
    },
  };
}

function headerOf(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.subarray(0, Math.min(64, bytes.length)));
}

/**
 * Cuántas páginas tiene el PDF y de qué tamaño, sin importar nada.
 *
 * Lo necesita el diálogo de `PDFATTACH`: hay que enseñar la lista de páginas
 * ANTES de que el usuario elija cuál adjuntar, y hacerlo importando la página
 * entera sería leer un archivo de veinte láminas para enseñar un desplegable.
 */
export function readCadPdfPageList(bytes: Uint8Array): Array<{
  number: number;
  widthMm: number;
  heightMm: number;
  rotate: number;
}> {
  const objects = readCadPdfObjects(bytes);
  const structure = readCadPdfStructure(objects, headerOf(bytes));
  return structure.pages.map((page) => {
    const swap = page.rotate === 90 || page.rotate === 270;
    return {
      number: page.number,
      widthMm: (swap ? page.heightPt : page.widthPt) * CAD_PDF_MM_PER_POINT,
      heightMm: (swap ? page.widthPt : page.heightPt) * CAD_PDF_MM_PER_POINT,
      rotate: page.rotate,
    };
  });
}
