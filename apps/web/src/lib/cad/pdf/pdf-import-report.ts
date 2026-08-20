/**
 * Lo que el arquitecto ve cuando importa un PDF, dicho en español llano.
 *
 * ## Por qué comparte estructura con el informe del DXF
 *
 * El manifiesto de pérdidas del DXF ajeno (`dxf-import-report.ts`) no es un
 * componente: es una PROMESA del producto —decimos qué se perdió— con una forma
 * concreta detrás. Tres columnas, un criterio publicado para la frontera entre
 * ellas, y un titular que se lee sin abrir nada.
 *
 * Duplicar esa forma para el PDF habría dado dos informes que se parecen y se
 * comportan distinto: uno ordena las pérdidas primero y el otro no, uno abre la
 * sección de lo perdido y el otro la esconde. Así que se REUTILIZA: los tipos
 * vienen de allí, el agrupado y el tono vienen de `import-report-view.ts`, y el
 * panel es el mismo componente. Lo único propio de aquí es el VOCABULARIO,
 * porque lo que se pierde al importar un PDF no se parece a lo que se pierde al
 * importar un DXF.
 *
 * ## La diferencia de fondo entre un DXF y un PDF
 *
 * Un DXF trae entidades: un arco es un arco y una cota sabe que mide. Un PDF NO.
 * Un PDF es papel: dentro sólo hay trazos y rótulos, porque el CAD que lo emitió
 * ya tiró las cotas, los bloques, los sombreados con patrón y los tipos de línea
 * al imprimirlo. Eso NO lo perdemos nosotros y aun así hay que decirlo, porque
 * el arquitecto ve un plano completo en la pantalla del visor y espera que entre
 * completo. La fila estructural que lo explica va SIEMPRE, incluso cuando la
 * importación no tiene ni un solo aviso.
 *
 * Módulo PURO: sin React, sin DOM. Lo consumen la orden `PDFIMPORT` y el panel
 * de importación, y por eso ninguno de los dos puede describir el mismo archivo
 * de dos maneras distintas.
 */
import type {
  CadDxfFidelity,
  CadDxfImportReport,
  CadDxfImportReportRow,
} from "../dxf-import-report";
import type { CadPdfImportResult, CadPdfImportWarning } from "./pdf-import";

/** Las mismas tres columnas del informe de DXF, con el mismo criterio. */
export type CadPdfFidelity = CadDxfFidelity;
export type CadPdfImportReportRow = CadDxfImportReportRow;
/** Misma forma que el informe de DXF: lo consume el mismo panel. */
export type CadPdfImportReport = CadDxfImportReport;

/**
 * Qué significa cada aviso del importador, en español llano y con su columna.
 *
 * Es la PARTE PUBLICADA del criterio, igual que en el informe del DXF: cambiar
 * aquí la severidad de un código cambia lo que el usuario ve, y por eso está en
 * un solo sitio y con una spec detrás que exige que todo código tenga frase.
 *
 * La frontera entre `degraded` y `lost` es la misma: «¿queda algo dibujado en el
 * sitio correcto?». Ante la duda, la más severa.
 */
interface Rule {
  fidelity: CadPdfFidelity;
  detail: (count: number, sample: string) => string;
}

const RULES: Readonly<Record<string, Rule>> = {
  text_glyph_indices: {
    fidelity: "lost",
    detail: (count) =>
      `${count} rótulo(s) NO entraron como texto: el PDF guarda índices de glifo de una fuente ` +
      "incrustada y no trae la tabla para volverlos caracteres. Nadie puede recuperarlos sin " +
      "inventárselos. Si los necesitas, pide al remitente un DXF o un PDF exportado con texto real.",
  },
  invisible_text_skipped: {
    fidelity: "lost",
    detail: (count) =>
      `${count} rótulo(s) invisibles no se importaron. Son la capa de búsqueda que deja un OCR ` +
      "sobre un escaneo: en el PDF no se ven, y meterlos llenaría el dibujo de textos fantasma.",
  },
  hidden_layer_skipped: {
    fidelity: "lost",
    detail: (count, sample) =>
      `${count} capa(s) del PDF venían APAGADAS y su contenido no entró${sample ? ` (${sample})` : ""}. ` +
      "El remitente no las ve en su pantalla. Si las quieres, vuelve a importar activando las capas ocultas.",
  },
  shading_dropped: {
    fidelity: "lost",
    detail: (count) =>
      `${count} degradado(s) no entraron: el dibujo no tiene con qué representarlos. ` +
      "El contorno de la zona sí está si venía trazado.",
  },
  raster_dropped: {
    fidelity: "lost",
    detail: (count) =>
      `${count} imagen(es) del PDF no entran como geometría — son píxeles, no trazos. ` +
      "Para conservarlas, adjunta el PDF de fondo con PDFATTACH en vez de importarlo.",
  },
  soft_mask_dropped: {
    fidelity: "lost",
    detail: (count) =>
      `${count} máscara(s) suaves no se reproducen: lo que tapaban entra visible.`,
  },
  path_limit: {
    fidelity: "lost",
    detail: () =>
      "El PDF supera el límite de trazos de una importación y se recortó: hay geometría del final " +
      "de la página que NO está en el dibujo. Importa página por página o pide el archivo por partes.",
  },
  xobject_dropped: {
    fidelity: "lost",
    detail: (count) =>
      `${count} objeto(s) reutilizados del PDF no se pudieron dibujar: si el plano traía bloques ` +
      "repetidos, faltan sus copias.",
  },
  stream_unreadable: {
    fidelity: "lost",
    detail: (count) =>
      `${count} flujo(s) de contenido no se pudieron descomprimir. El archivo está dañado o usa una ` +
      "compresión que este lector no deshace: lo que hubiera dentro NO está en el dibujo.",
  },
  fill_as_outline: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} relleno(s) macizos entraron como su CONTORNO, sin nada dentro. La forma es exacta; ` +
      "el relleno hay que rehacerlo con un sombreado.",
  },
  pattern_fill_flattened: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} tramado(s) entraron como contorno sin su trama. El patrón vive en el PDF como una ` +
      "receta de dibujo, no como un sombreado con nombre.",
  },
  transparency_flattened: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} elemento(s) con transparencia entraron OPACOS. Se ven, pero tapan lo que había debajo.`,
  },
  clip_not_applied: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} recorte(s) del PDF no se aplicaron: puede haber entrado geometría que en el papel ` +
      "quedaba fuera del recorte. Sobra dibujo, no falta — revisa los bordes antes de acotar.",
  },
  assumed_encoding: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} rótulo(s) llegaron sin declarar su codificación y se leyeron como Windows occidental. ` +
      "Si algún acento o una eñe sale rara, es por eso y basta con corregir el texto.",
  },
  assumed_page_size: {
    fidelity: "degraded",
    detail: () =>
      "La página no declaraba su tamaño y se supuso Carta. Si el plano entra a una medida que no " +
      "cuadra, es por esto: ajusta la escala tras importar.",
  },
  unsupported_feature: {
    fidelity: "degraded",
    detail: (count, sample) =>
      `${count} recurso(s) del PDF no tienen equivalente en el dibujo${sample ? `: ${sample}` : ""}.`,
  },
};

function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`;
}

/** Cuántas entidades de cada tipo quedaron, por su nombre en español. */
function keptRows(result: CadPdfImportResult): CadPdfImportReportRow[] {
  const byType = new Map<string, number>();
  for (const entity of result.entities)
    byType.set(entity.type, (byType.get(entity.type) ?? 0) + 1);

  const NAMES: Readonly<Record<string, [string, string]>> = {
    line: ["línea", "líneas"],
    polyline: ["polilínea", "polilíneas"],
    spline: ["spline", "splines"],
    mtext: ["texto", "textos"],
  };
  const rows: CadPdfImportReportRow[] = [];
  for (const [type, count] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const names = NAMES[type] ?? [type, type];
    rows.push({
      fidelity: "kept",
      code: `kept_${type}`,
      count,
      detail:
        type === "mtext"
          ? `${plural(count, names[0], names[1])} con su contenido, su posición y su altura.`
          : `${plural(count, names[0], names[1])} con su geometría exacta y su color.`,
    });
  }
  if (result.layers.length)
    rows.push({
      fidelity: "kept",
      code: "kept_layers",
      count: result.layers.length,
      detail:
        result.optionalGroups.length > 0
          ? `${plural(result.layers.length, "capa", "capas")} recreadas a partir de las capas ` +
            "opcionales que el PDF conservaba del CAD de origen."
          : `${plural(result.layers.length, "capa", "capas")} para alojar lo importado, separado ` +
            "del resto del dibujo.",
    });
  return rows;
}

/**
 * La fila que va SIEMPRE: un PDF no es un CAD.
 *
 * No es un aviso del importador porque no depende del archivo: es cierta para
 * todos. Y es la información más importante del panel, porque es la que evita
 * que alguien cuente con unas cotas que nunca llegaron a estar en el PDF.
 */
function structuralRow(result: CadPdfImportResult): CadPdfImportReportRow {
  return {
    fidelity: "degraded",
    code: "pdf_has_no_cad_semantics",
    count: result.entities.length,
    detail:
      "Todo entra como trazos y textos sueltos. Un PDF es papel: el programa que lo generó ya había " +
      "convertido sus cotas, bloques, sombreados y tipos de línea en dibujo al exportarlo, así que " +
      "aquí no hay nada que recuperar. Las cotas no se recalculan y los bloques no son bloques. " +
      "Si necesitas el dibujo vivo, pide el DXF al remitente.",
  };
}

/** La fila de las curvas, con el error MEDIDO, no con la tolerancia pedida. */
function curveRow(result: CadPdfImportResult): CadPdfImportReportRow | null {
  const { mode, curves, maxErrorUnits } = result.curveFidelity;
  if (curves === 0) return null;
  if (mode === "spline")
    return {
      fidelity: "kept",
      code: "curves_exact",
      count: curves,
      detail:
        `${plural(curves, "curva", "curvas")} entraron como splines EXACTAS: una curva de Bézier ` +
        "es una spline de grado 3, así que la conversión no pierde nada.",
    };
  return {
    fidelity: "degraded",
    code: "curves_flattened",
    count: curves,
    detail:
      `${plural(curves, "curva", "curvas")} entraron como polilíneas de tramos rectos. La desviación ` +
      `máxima MEDIDA es de ${maxErrorUnits.toFixed(4)} unidades de dibujo — por debajo del grosor de ` +
      "un trazo fino. Si necesitas la curva exacta, vuelve a importar en modo spline.",
  };
}

/** Avisos agrupados por código, con un ejemplo de detalle. */
function group(warnings: readonly CadPdfImportWarning[]): Map<string, { count: number; sample: string }> {
  const groups = new Map<string, { count: number; sample: string }>();
  for (const warning of warnings) {
    const entry = groups.get(warning.code) ?? { count: 0, sample: "" };
    entry.count += warning.count;
    if (!entry.sample && warning.detail) entry.sample = warning.detail;
    groups.set(warning.code, entry);
  }
  return groups;
}

const ORDER: Readonly<Record<CadPdfFidelity, number>> = { lost: 0, degraded: 1, kept: 2 };

/**
 * Construye el informe de una importación de PDF.
 *
 * `fileName` y `pageLabel` viajan en el titular porque un despacho importa
 * varias láminas del mismo archivo y un informe sin página no se sabe a cuál
 * pertenece.
 */
export function buildCadPdfImportReport(result: CadPdfImportResult): CadPdfImportReport {
  const rows: CadPdfImportReportRow[] = [structuralRow(result)];

  for (const [code, entry] of group(result.warnings)) {
    const rule = RULES[code];
    rows.push({
      fidelity: rule?.fidelity ?? "lost",
      code,
      count: entry.count,
      // Un código SIN regla se declara como pérdida con su texto crudo:
      // preferimos una frase fea a un silencio, igual que en el informe del DXF.
      detail: rule
        ? rule.detail(entry.count, entry.sample)
        : `${entry.count} incidencia(s) todavía sin describir (${code}).`,
    });
  }

  const curves = curveRow(result);
  if (curves) rows.push(curves);
  rows.push(...keptRows(result));
  rows.sort((a, b) => ORDER[a.fidelity] - ORDER[b.fidelity] || a.code.localeCompare(b.code));

  const lost = rows.filter((row) => row.fidelity === "lost");
  const sum = (list: readonly CadPdfImportReportRow[]) =>
    list.reduce((total, row) => total + row.count, 0);
  const pageLabel =
    result.pageCount > 1 ? `página ${result.page} de ${result.pageCount}` : "página única";
  const headline =
    lost.length === 0
      ? `Entraron ${result.entities.length} trazo(s) y texto(s) de la ${pageLabel}, sin pérdidas ` +
        "declaradas. Recuerda que un PDF nunca trae cotas ni bloques vivos."
      : `Entraron ${result.entities.length} trazo(s) y texto(s) de la ${pageLabel}. ` +
        `${sum(lost)} cosa(s) NO entraron.`;

  return {
    entityCount: result.entities.length,
    // Un PDF no tiene bloques: lo que el CAD de origen insertaba llegó ya
    // explotado. Poner aquí el número de XObject sería llamar bloque a algo que
    // el usuario no puede editar como tal.
    blockCount: 0,
    layerCount: result.layers.length,
    rows,
    headline,
    hasLosses: rows.some((row) => row.fidelity !== "kept"),
  };
}

/**
 * El informe de un PDF que NO se pudo importar.
 *
 * Un fallo también es información, y la más útil de todas cuando el archivo es
 * un escaneo: ahí el usuario no necesita saber qué se perdió, necesita saber que
 * tiene que usar `PDFATTACH`. Devolver el mismo informe para un fallo mantiene
 * una sola forma de contar lo que pasó.
 */
export function buildCadPdfFailureReport(error: Error, code: string): CadPdfImportReport {
  const ADVICE: Readonly<Record<string, string>> = {
    scanned_image:
      "Adjúntalo como plantilla con PDFATTACH, escálalo con dos puntos de medida conocida y calca encima. " +
      "Es lo que hace cualquiera con un plano en papel, y es más rápido que redibujarlo a ojo.",
    encrypted:
      "Ábrelo con su contraseña, guárdalo sin protección y vuelve a intentarlo.",
    not_pdf: "Comprueba que el archivo sea realmente un PDF y no otro formato renombrado.",
    no_geometry: "Prueba con otra página: puede que el dibujo esté en una lámina distinta.",
    unreadable_content:
      "El archivo está dañado. Pide al remitente que lo vuelva a exportar.",
    page_out_of_range: "Elige una página que exista en el archivo.",
  };
  return {
    entityCount: 0,
    blockCount: 0,
    layerCount: 0,
    rows: [
      {
        fidelity: "lost",
        code,
        count: 1,
        detail: `${error.message}${ADVICE[code] ? ` ${ADVICE[code]}` : ""}`,
      },
    ],
    headline: "No entró nada del PDF.",
    hasLosses: true,
  };
}

/** Códigos con frase publicada. Su spec lo usa para exigir cobertura. */
export const CAD_PDF_IMPORT_REPORT_CODES: readonly string[] = Object.keys(RULES).sort();
