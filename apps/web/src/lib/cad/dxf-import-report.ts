/**
 * Lo que el arquitecto ve cuando ENTRA un DXF ajeno, dicho en español llano.
 *
 * ## Por qué existe
 *
 * El manifiesto de pérdidas de la EXPORTACIÓN ya existía y nadie lo veía. Del
 * lado de la IMPORTACIÓN sólo había `CadDxfImportWarning[]`: una lista de
 * códigos —`unsupported_entity`, `anisotropic_insert`— que el panel de
 * importación volcaba tal cual. Eso no es informar: es enseñarle al usuario el
 * registro de depuración del programa y esperar que lo interprete.
 *
 * Un despacho mexicano recibe el plano del estructurista y lo abre aquí. Si
 * pierde tres cotas asociativas y no se entera hasta que el municipio se lo
 * devuelve, no vuelve. Y AutoCAD tampoco se lo dice — ahí está la ventaja: el
 * que declara lo que pierde es el que merece confianza.
 *
 * ## Las tres columnas y su criterio
 *
 * - `kept` — ENTRA ÍNTEGRO. La entidad canónica representa lo mismo que traía
 *   el fichero: un arco vuelve arco, con su centro, su radio y sus ángulos.
 * - `degraded` — ENTRA, PERO PEOR. La geometría se ve igual y la RECETA se
 *   pierde: una cota asociativa que entra como líneas y texto sigue midiendo
 *   lo mismo en pantalla, pero ya no se recalcula al mover el muro.
 * - `lost` — NO ENTRA. La entidad no está en el documento resultante.
 *
 * La frontera entre `degraded` y `lost` es «¿queda algo dibujado en el sitio
 * correcto?». Se elige a propósito la más severa cuando hay duda: un aviso de
 * más se lee y se descarta; uno de menos se descubre en obra.
 *
 * Módulo PURO: sin React, sin DOM, sin THREE. Lo consumen la orden `DXFIN` del
 * motor de comandos y el panel de importación del tablero, y por eso ninguno de
 * los dos puede describir el mismo fichero de dos maneras distintas.
 */
import type { CadDxfImportResult, CadDxfImportWarning } from "./dxf-import";

export type CadDxfFidelity = "kept" | "degraded" | "lost";

export interface CadDxfImportReportRow {
  fidelity: CadDxfFidelity;
  /** Clave estable para pruebas y para la `key` de React. No se muestra. */
  code: string;
  /** Cuántas entidades cubre la fila. Siempre ≥ 1. */
  count: number;
  /** La frase que lee el arquitecto. Español llano, sin códigos ni siglas. */
  detail: string;
}

export interface CadDxfImportReport {
  /** Entidades canónicas que quedaron en el documento. */
  entityCount: number;
  blockCount: number;
  layerCount: number;
  /** Ordenadas: primero lo perdido, luego lo degradado, luego lo conservado. */
  rows: readonly CadDxfImportReportRow[];
  /** Una sola línea, para la línea de comandos y para el titular del panel. */
  headline: string;
  /** `true` si hay algo que el arquitecto debería mirar antes de trabajar. */
  hasLosses: boolean;
}

/**
 * Nombre en español de cada primitiva, en singular y plural.
 *
 * Se escriben los dos porque «1 líneas» delata que nadie leyó la frase, y una
 * frase que delata descuido no se cree aunque sea cierta.
 */
const PRIMITIVE_NAMES: Readonly<Record<string, readonly [string, string]>> = {
  line: ["línea", "líneas"],
  polyline: ["polilínea", "polilíneas"],
  rect: ["rectángulo", "rectángulos"],
  text: ["texto", "textos"],
  circle: ["círculo", "círculos"],
  arc: ["arco", "arcos"],
  ellipse: ["elipse", "elipses"],
  spline: ["spline", "splines"],
  point: ["punto", "puntos"],
  xline: ["línea de construcción", "líneas de construcción"],
  ray: ["semirrecta", "semirrectas"],
  solid: ["sólido 2D", "sólidos 2D"],
  wipeout: ["enmascaramiento", "enmascaramientos"],
  image: ["imagen", "imágenes"],
  attdef: ["definición de atributo", "definiciones de atributo"],
  table: ["tabla", "tablas"],
};

function plural(count: number, names: readonly [string, string]): string {
  return `${count} ${count === 1 ? names[0] : names[1]}`;
}

function primitiveLabel(kind: string, count: number): string {
  const names = PRIMITIVE_NAMES[kind];
  // Una primitiva sin nombre en la tabla se nombra por su tipo DXF antes que
  // desaparecer del informe: un hueco en la tabla no puede volver mudo al
  // informe, que es exactamente el fallo que este módulo existe para impedir.
  return names ? plural(count, names) : `${count} × ${kind.toUpperCase()}`;
}

/**
 * Qué significa cada aviso del importador, en español llano y con su columna.
 *
 * La tabla es la PARTE PUBLICADA del criterio: cambiar aquí la severidad de un
 * código cambia lo que el usuario ve, y por eso está en un solo sitio y con una
 * spec detrás. `detail` recibe el número de casos y la lista de tipos DXF
 * implicados, porque «3 splines» informa y «SPLINE degraded» no.
 */
interface WarningRule {
  fidelity: CadDxfFidelity;
  detail: (count: number, types: readonly string[]) => string;
}

const TYPES = (types: readonly string[]) =>
  types.length ? types.join(", ") : "desconocido";

const WARNING_RULES: Readonly<Record<string, WarningRule>> = {
  parse_failed: {
    fidelity: "lost",
    detail: () =>
      "El archivo no se pudo leer como DXF de texto. No entró nada: revisa que sea un DXF " +
      "(no un DWG renombrado) y que no esté truncado.",
  },
  unsupported_entity: {
    fidelity: "lost",
    detail: (count, types) =>
      `${count} entidad(es) de tipo ${TYPES(types)} no tienen equivalente en el dibujo y NO entraron. ` +
      "Si hacen falta, pide al remitente que las explote a líneas y arcos antes de exportar.",
  },
  invalid_line: {
    fidelity: "lost",
    detail: (count) =>
      `${count} línea(s) llegaron sin sus dos extremos y no entraron. El archivo de origen está incompleto.`,
  },
  invalid_polyline: {
    fidelity: "lost",
    detail: (count) =>
      `${count} polilínea(s) llegaron con menos de dos vértices y no entraron.`,
  },
  invalid_circle: {
    fidelity: "lost",
    detail: (count) => `${count} círculo(s) llegaron sin centro o sin radio y no entraron.`,
  },
  invalid_arc: {
    fidelity: "lost",
    detail: (count) =>
      `${count} arco(s) llegaron sin centro, radio o ángulos y no entraron.`,
  },
  invalid_ellipse: {
    fidelity: "lost",
    detail: (count) => `${count} elipse(s) llegaron sin sus ejes y no entraron.`,
  },
  invalid_spline: {
    fidelity: "lost",
    detail: (count) =>
      `${count} spline(s) llegaron sin puntos de control suficientes y no entraron.`,
  },
  invalid_text: {
    fidelity: "lost",
    detail: (count) => `${count} texto(s) llegaron sin posición o sin contenido y no entraron.`,
  },
  unknown_block: {
    fidelity: "lost",
    detail: (count) =>
      `${count} inserción(es) apuntan a un bloque que el archivo no define: no hay nada que dibujar ` +
      "en su sitio. Suele pasar cuando el remitente exportó sin las referencias externas.",
  },
  insert_depth: {
    fidelity: "lost",
    detail: (count) =>
      `${count} bloque(s) anidados más allá del límite de anidamiento no se expandieron: su contenido ` +
      "no está en el dibujo.",
  },
  hatch_unsupported_boundary: {
    fidelity: "lost",
    detail: (count) =>
      `${count} sombreado(s) tienen un contorno que no se sabe reconstruir y no entraron. El contorno ` +
      "sí está si venía dibujado aparte; el relleno no.",
  },
  entity_limit: {
    fidelity: "lost",
    detail: () =>
      "El archivo supera el límite de entidades de una importación y se recortó: hay geometría del " +
      "final del archivo que NO está en el dibujo.",
  },
  hatch_edge_path_partial: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} sombreado(s) traían contornos con arcos o splines: el contorno entra APROXIMADO por ` +
      "tramos rectos, así que el borde del relleno no coincide al milímetro con el original.",
  },
  anisotropic_insert: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} bloque(s) llegan con escala distinta en X y en Y sobre geometría circular: los círculos ` +
      "deberían salir elípticos y entran como círculos del radio promedio.",
  },
  foreign_dimension_detached: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} cota(s) de otro programa entran VIVAS —vuelven a medir sus propios puntos y su número ` +
      "se recalcula— pero DESLIGADAS del dibujo: mover el muro que acotan ya no las cambia. El " +
      "archivo asocia por identificadores internos que no existen en este documento.",
  },
  foreign_dimension_unsupported: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} cota(s) de otro programa son de una familia que no se sabe rehacer (angular de dos ` +
      "líneas, lineal girada a un ángulo cualquiera): entran como líneas y texto, así que se ven " +
      "igual y no miden.",
  },
  lineweight_no_enumerado: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} grosor(es) del archivo no están en la lista de grosores del formato y se ajustaron al ` +
      "más cercano. El plano se imprime con un trazo ligeramente distinto del que mandó el remitente.",
  },
  linetype_sin_definicion: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} tipo(s) de línea se usan en el archivo y no están definidos en él: esas capas y ` +
      "entidades se dibujan continuas. Pide al remitente que exporte con su tabla de tipos de línea.",
  },
  linetype_complejo: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} tipo(s) de línea llevan texto o símbolos incrustados (los de tuberías y vallas): se ` +
      "conserva el patrón de guiones y se pierden el texto y los símbolos.",
  },
  dimension_without_block: {
    fidelity: "degraded",
    detail: (count) =>
      `${count} cota(s) llegaron sin su geometría: se conserva el TEXTO de la medida, pero no las ` +
      "líneas ni las flechas.",
  },
};

/** Avisos agrupados por código, con los tipos DXF que los provocaron. */
function groupWarnings(
  warnings: readonly CadDxfImportWarning[],
): Map<string, { count: number; types: Set<string> }> {
  const groups = new Map<string, { count: number; types: Set<string> }>();
  for (const warning of warnings) {
    const group = groups.get(warning.code) ?? { count: 0, types: new Set<string>() };
    group.count += 1;
    if (warning.entityType) group.types.add(warning.entityType);
    groups.set(warning.code, group);
  }
  return groups;
}

/**
 * Cuántas primitivas hay de cada tipo, separando las que NO vienen de una
 * entidad propia del fichero.
 *
 * `primitiveSources` distingue tres orígenes y los tres significan cosas
 * distintas para el informe: `entity` es una entidad del fichero que entró tal
 * cual, `insert` es geometría que además viaja como bloque vivo (contarla sería
 * contarla dos veces) y `dimension` es una cota que se APLANÓ a líneas y texto
 * —la degradación más cara de un plano de arquitectura y la única que hoy el
 * importador no declara con un aviso—.
 */
function countPrimitives(result: CadDxfImportResult): {
  byKind: Map<string, number>;
  flattenedDimensions: number;
} {
  const byKind = new Map<string, number>();
  let flattenedDimensions = 0;
  result.primitives.forEach((primitive, index) => {
    const source = result.primitiveSources[index];
    if (source === "insert") return;
    if (source === "dimension") {
      flattenedDimensions += 1;
      return;
    }
    byKind.set(primitive.kind, (byKind.get(primitive.kind) ?? 0) + 1);
  });
  return { byKind, flattenedDimensions };
}

const ORDER: Readonly<Record<CadDxfFidelity, number>> = {
  lost: 0,
  degraded: 1,
  kept: 2,
};

/**
 * Construye el informe. Recibe el resultado CRUDO del importador más los
 * recuentos del documento ya construido, porque son dos verdades distintas: el
 * importador sabe qué traía el fichero y el documento sabe qué quedó dentro.
 * Derivar el segundo del primero es justo la mentira que este informe evita.
 */
export function buildCadDxfImportReport(
  result: CadDxfImportResult,
  totals: { entityCount: number; blockCount: number },
  /**
   * Filas que sólo conoce QUIEN LLAMA. `DXFIN` convierte los TEXT simples en
   * MTEXT porque el lote de comandos no sabe transportar el tipo heredado; el
   * panel del tablero no hace esa conversión. Fingir aquí una degradación que
   * depende de la ruta sería mentir en la mitad de los casos.
   */
  extraRows: readonly CadDxfImportReportRow[] = [],
): CadDxfImportReport {
  const rows: CadDxfImportReportRow[] = [...extraRows];
  const { byKind, flattenedDimensions } = countPrimitives(result);

  // --- lo que no entró o entró peor, por avisos del importador ---------------
  for (const [code, group] of groupWarnings(result.warnings)) {
    const rule = WARNING_RULES[code];
    const types = [...group.types].sort();
    rows.push({
      fidelity: rule?.fidelity ?? "lost",
      code,
      count: group.count,
      // Un código SIN regla se declara como pérdida con el texto crudo del
      // importador: preferimos una frase fea a un silencio. El día que aparezca
      // uno nuevo, su spec lo caza y se le escribe la frase.
      detail: rule
        ? rule.detail(group.count, types)
        : `${group.count} entidad(es) con una incidencia todavía sin describir (${code}).`,
    });
  }

  // --- degradación estructural que NO produce aviso -------------------------
  // Una cota ajena entra como su dibujo: líneas, flechas y texto. Se ve igual y
  // deja de medir. El importador no emite aviso por ello —sólo lo emite cuando
  // falta el bloque— así que si no se declarara aquí, no se declararía en
  // ningún sitio.
  if (flattenedDimensions > 0) {
    rows.push({
      fidelity: "degraded",
      code: "dimension_flattened",
      count: flattenedDimensions,
      detail:
        `${flattenedDimensions} pieza(s) de cotas ajenas entraron como líneas y texto sueltos: se ven ` +
        "igual, pero dejan de recalcularse al mover la geometría. Las cotas creadas aquí sí son asociativas.",
    });
  }

  // --- lo que entró íntegro --------------------------------------------------
  for (const [kind, count] of [...byKind.entries()].sort(([a], [b]) => a.localeCompare(b)))
    rows.push({
      fidelity: "kept",
      code: `kept_${kind}`,
      count,
      detail: `${primitiveLabel(kind, count)} con su geometría exacta.`,
    });
  if (result.hatches.length)
    rows.push({
      fidelity: "kept",
      code: "kept_hatch",
      count: result.hatches.length,
      detail: `${plural(result.hatches.length, ["sombreado", "sombreados"])} con su patrón, su escala y sus islas.`,
    });
  if (result.mtexts.length)
    rows.push({
      fidelity: "kept",
      code: "kept_mtext",
      count: result.mtexts.length,
      detail: `${plural(result.mtexts.length, ["texto con formato", "textos con formato"])} con su tipografía, su ancho y su alineación.`,
    });
  if (result.semanticDimensions.length)
    rows.push({
      fidelity: "kept",
      code: "kept_dimension",
      count: result.semanticDimensions.length,
      detail: `${plural(result.semanticDimensions.length, ["cota asociativa", "cotas asociativas"])} que siguen midiendo al mover la geometría.`,
    });
  if (result.mleaders.length)
    rows.push({
      fidelity: "kept",
      code: "kept_mleader",
      count: result.mleaders.length,
      detail: `${plural(result.mleaders.length, ["directriz", "directrices"])} con su texto y sus vértices.`,
    });
  if (result.blocks.length)
    rows.push({
      fidelity: "kept",
      code: "kept_block",
      count: result.blocks.length,
      detail:
        `${plural(result.blocks.length, ["bloque", "bloques"])} con sus atributos, insertados ` +
        `${plural(result.inserts.length, ["vez", "veces"])}: siguen siendo bloques editables, no geometría suelta.`,
    });
  if (result.imageDefinitions.length)
    rows.push({
      fidelity: "degraded",
      code: "image_reference_only",
      count: result.imageDefinitions.length,
      detail:
        `${plural(result.imageDefinitions.length, ["imagen referenciada", "imágenes referenciadas"])}: el DXF guarda la RUTA, ` +
        "nunca los píxeles, así que el marco se verá vacío si no tienes el archivo original.",
    });

  rows.sort((a, b) => ORDER[a.fidelity] - ORDER[b.fidelity] || a.code.localeCompare(b.code));

  const lost = rows.filter((row) => row.fidelity === "lost");
  const degraded = rows.filter((row) => row.fidelity === "degraded");
  const sum = (list: readonly CadDxfImportReportRow[]) =>
    list.reduce((total, row) => total + row.count, 0);
  const headline =
    lost.length === 0 && degraded.length === 0
      ? `Entró completo: ${totals.entityCount} entidad(es) y ${totals.blockCount} bloque(s), sin pérdidas.`
      : `Entraron ${totals.entityCount} entidad(es) y ${totals.blockCount} bloque(s). ` +
        `${sum(degraded)} cosa(s) entraron con menos información y ${sum(lost)} no entraron.`;

  return {
    entityCount: totals.entityCount,
    blockCount: totals.blockCount,
    layerCount: result.layers.length,
    rows,
    headline,
    hasLosses: lost.length > 0 || degraded.length > 0,
  };
}

/** Códigos con frase publicada. Su spec lo usa para exigir cobertura. */
export const CAD_DXF_IMPORT_REPORT_CODES: readonly string[] =
  Object.keys(WARNING_RULES).sort();
