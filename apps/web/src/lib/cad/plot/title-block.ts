/**
 * Cajetín paramétrico: los datos del plano, colocados sobre el papel.
 *
 * ## Por qué es paramétrico y no una plantilla dibujada
 *
 * Un despacho entrega juegos de veinte láminas. Si el cajetín se teclea hoja a
 * hoja, dentro de un mes tres dirán la revisión anterior — no por descuido,
 * sino porque el dato vive en dos sitios y sólo se actualiza uno. Aquí los
 * campos se LEEN del documento, de la presentación y de la serie: el número de
 * lámina sale del conjunto, la escala sale de la ventana gráfica, la fecha se
 * inyecta. Nadie escribe «1:50» a mano en veinte sitios.
 *
 * ## Por qué mide 180 mm en todas las hojas
 *
 * ISO 7200 fija el cajetín en 180 mm de ancho, y esa cifra no es decorativa:
 * un cajetín que creciera con la hoja saldría gigante en A0 y el texto que se
 * lee cómodo en A3 se volvería un cartel. Lo que un arquitecto espera es que
 * el cajetín se vea IGUAL en A4 y en A0, porque la lámina se archiva doblada a
 * A4 y el cajetín tiene que quedar legible en el mismo sitio.
 *
 * Sólo encoge —proporcionalmente y avisando— cuando la hoja no da para 180 mm.
 * Encogerlo en silencio produciría rótulos de 0,8 mm que la impresora convierte
 * en una mancha, y ése es justo el plano que el municipio devuelve.
 *
 * ## Todo son milímetros de papel
 *
 * Este módulo no sabe de PDF ni de canvas. Entran unos campos y un tamaño de
 * hoja, sale una lista de rectángulos y rótulos en milímetros desde la esquina
 * SUPERIOR izquierda —el mismo sistema que usa el emisor de PDF—. Así la misma
 * geometría se puede afirmar en una prueba sin generar un archivo.
 */
import type { CadPaperSpace } from "../cad-document";
import type { CadPageMargins } from "./page-setup";

/** Ancho nominal del cajetín, ISO 7200. */
export const CAD_TITLE_BLOCK_WIDTH_MM = 180;
/**
 * Alto nominal: cinco bandas de datos.
 *
 * Son 30 mm y no una cifra redonda cualquiera: es EXACTAMENTE la franja que
 * `createCadPaperSpace` descuenta por debajo de la ventana gráfica al crear la
 * presentación. Con 40 mm el cajetín subía diez milímetros dentro del área de
 * dibujo y el plano se imprimía encima del número de lámina — un defecto que no
 * se ve en pantalla, porque en pantalla el cajetín no está.
 */
export const CAD_TITLE_BLOCK_HEIGHT_MM = 30;
/** Por debajo de esto un rótulo impreso deja de leerse. */
export const CAD_TITLE_BLOCK_MIN_TEXT_MM = 1.5;

export interface CadTitleBlockFields {
  project: string;
  client: string;
  /** Título de la LÁMINA, no del proyecto. */
  title: string;
  drawingNumber: string;
  /** Número de lámina dentro de la serie: `A-101`. */
  sheetNumber: string;
  /** Posición en la serie: `3/6`. Vacío cuando la lámina va suelta. */
  sheetOf: string;
  revision: string;
  date: string;
  drawnBy: string;
  checkedBy: string;
  discipline: string;
  /** Escala principal de la lámina: `1:50`, o `1:50 / 1:20` con varias. */
  scale: string;
  units: string;
}

/** Cómo se rellena cada campo, para poder auditar el cajetín. */
export type CadTitleBlockSource = "layout" | "series" | "viewport" | "input" | "missing";

export interface CadTitleBlockCell {
  key: keyof CadTitleBlockFields;
  /** Rótulo impreso encima del valor: «ESCALA». */
  label: string;
  value: string;
  source: CadTitleBlockSource;
  /** Rectángulo de la celda, en mm desde la esquina superior izquierda. */
  x: number;
  y: number;
  width: number;
  height: number;
  labelSizeMm: number;
  valueSizeMm: number;
}

export interface CadTitleBlockLayout {
  sheetId: string;
  /** Marco exterior de la lámina. */
  frame: { x: number; y: number; width: number; height: number };
  /** Recuadro del cajetín, dentro del marco. */
  box: { x: number; y: number; width: number; height: number };
  /** Líneas interiores del cajetín. */
  rules: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  cells: CadTitleBlockCell[];
  /** 1 cuando cabe a tamaño nominal; menor cuando la hoja obligó a encoger. */
  shrink: number;
  fields: CadTitleBlockFields;
  /** Campos que nadie pudo rellenar. Se imprimen como «—» y se dicen. */
  missing: Array<keyof CadTitleBlockFields>;
  issues: string[];
}

const EMPTY = "—";

/** Atributo del cajetín de la presentación → campo, en orden de preferencia. */
const ATTRIBUTE_MAP: Record<keyof CadTitleBlockFields, readonly string[]> = {
  project: ["PROJECT", "PROYECTO"],
  client: ["CLIENT", "CLIENTE"],
  title: ["TITLE", "TITULO"],
  drawingNumber: ["DRAWING_NO", "PLANO_NO"],
  sheetNumber: ["SHEET_NO", "LAMINA_NO"],
  sheetOf: ["SHEET_OF"],
  revision: ["REVISION"],
  date: ["DATE", "FECHA"],
  drawnBy: ["PREPARED_BY", "DIBUJO"],
  checkedBy: ["CHECKED_BY", "REVISO"],
  discipline: ["DISCIPLINE", "DISCIPLINA"],
  scale: ["SCALE", "ESCALA"],
  units: ["UNITS", "UNIDADES"],
};

export interface CadTitleBlockInput {
  /** Presentación de la que sale la lámina. Es la fuente principal. */
  layout?: CadPaperSpace;
  /**
   * Atributos del cajetín sueltos, cuando quien compone ya no tiene la
   * presentación a mano — es el caso del emisor de PDF, que recibe hojas ya
   * planas. Los usa sólo si no hay presentación.
   */
  attributes?: Record<string, string>;
  /** Posición en la serie, 1-based, y total. Manda sobre el atributo. */
  series?: { index: number; total: number; number?: string };
  /** Escalas de las ventanas gráficas, ya formateadas: `["1:50"]`. */
  viewportScales?: readonly string[];
  /** Unidad del dibujo. */
  units?: string;
  /** Valores que ganan a todo: los inyecta quien publica. */
  overrides?: Partial<CadTitleBlockFields>;
}

function attributeOf(
  source: Record<string, string> | undefined,
  names: readonly string[],
): string {
  const attributes = source ?? {};
  for (const name of names) {
    const value = attributes[name]?.trim();
    // `-` es el relleno que `createCadPaperSpace` pone en los campos que nadie
    // ha rellenado. Tratarlo como valor imprimiría un guion donde hace falta
    // saber que el dato FALTA.
    if (value && value !== "-") return value;
  }
  return "";
}

/** `3/6`. Vacío cuando la lámina no pertenece a una serie. */
export function cadSheetSeriesLabel(index: number, total: number): string {
  if (!Number.isInteger(index) || !Number.isInteger(total)) return "";
  if (index < 1 || total < 1 || index > total) return "";
  return `${index}/${total}`;
}

/**
 * Rellena el cajetín desde el documento, la presentación y la serie.
 *
 * El orden de precedencia es el que la gente espera: lo inyectado gana sobre lo
 * calculado, y lo calculado —número de lámina, escala— gana sobre el atributo
 * guardado, porque el atributo es una copia de ayer y la ventana gráfica es la
 * verdad de hoy.
 */
export function resolveCadTitleBlockFields(
  input: CadTitleBlockInput,
): { fields: CadTitleBlockFields; sources: Record<keyof CadTitleBlockFields, CadTitleBlockSource> } {
  const sources = {} as Record<keyof CadTitleBlockFields, CadTitleBlockSource>;
  const fields = {} as CadTitleBlockFields;
  const attributes = input.layout?.titleBlock?.attributes ?? input.attributes;

  const scaleFromViewports = [...new Set(input.viewportScales ?? [])].join(" / ");
  const seriesLabel = input.series
    ? cadSheetSeriesLabel(input.series.index, input.series.total)
    : "";

  const computed: Partial<Record<keyof CadTitleBlockFields, [string, CadTitleBlockSource]>> = {
    sheetOf: [seriesLabel, "series"],
    scale: [scaleFromViewports, "viewport"],
    units: [input.units ?? "", "input"],
    ...(input.series?.number ? { sheetNumber: [input.series.number, "series"] as [string, CadTitleBlockSource] } : {}),
  };

  for (const key of Object.keys(ATTRIBUTE_MAP) as Array<keyof CadTitleBlockFields>) {
    const override = input.overrides?.[key]?.trim();
    if (override) {
      fields[key] = override;
      sources[key] = "input";
      continue;
    }
    const [value, source] = computed[key] ?? ["", "layout"];
    if (value) {
      fields[key] = value;
      sources[key] = source;
      continue;
    }
    const attribute = attributeOf(attributes, ATTRIBUTE_MAP[key]);
    if (attribute) {
      fields[key] = attribute;
      sources[key] = "layout";
      continue;
    }
    fields[key] = "";
    sources[key] = "missing";
  }

  // El título de la lámina cae al nombre de la pestaña antes que a «—»: una
  // presentación siempre tiene nombre, y un cajetín sin título no es un plano.
  if (!fields.title && input.layout?.name) {
    fields.title = input.layout.name;
    sources.title = "layout";
  }
  return { fields, sources };
}

/** Las cinco bandas del cajetín, con su reparto en columnas. */
const BANDS: ReadonlyArray<{
  heightRatio: number;
  cells: ReadonlyArray<{ key: keyof CadTitleBlockFields; label: string; span: number; strong?: boolean }>;
}> = [
  {
    heightRatio: 0.225,
    cells: [{ key: "project", label: "PROYECTO", span: 12, strong: true }],
  },
  {
    heightRatio: 0.175,
    cells: [
      { key: "client", label: "CLIENTE", span: 8 },
      { key: "discipline", label: "DISCIPLINA", span: 4 },
    ],
  },
  {
    heightRatio: 0.225,
    cells: [{ key: "title", label: "LÁMINA", span: 12, strong: true }],
  },
  {
    heightRatio: 0.1875,
    cells: [
      { key: "scale", label: "ESCALA", span: 3 },
      { key: "units", label: "UNIDADES", span: 2 },
      { key: "date", label: "FECHA", span: 3 },
      { key: "drawnBy", label: "DIBUJÓ", span: 2 },
      { key: "checkedBy", label: "REVISÓ", span: 2 },
    ],
  },
  {
    heightRatio: 0.1875,
    cells: [
      { key: "drawingNumber", label: "Nº DE PLANO", span: 5 },
      { key: "sheetNumber", label: "LÁMINA", span: 3 },
      { key: "sheetOf", label: "HOJA", span: 2 },
      { key: "revision", label: "REV.", span: 2 },
    ],
  },
];

const COLUMNS = 12;

export interface CadTitleBlockLayoutInput extends CadTitleBlockInput {
  sheetId: string;
  /** Hoja YA orientada, en milímetros. */
  page: { width: number; height: number };
  margins: CadPageMargins;
}

/**
 * Coloca el cajetín sobre la hoja.
 *
 * Ancla en la esquina inferior derecha del marco, que es donde lo busca
 * cualquiera que coja el plano — el pliegue a A4 deja precisamente esa esquina
 * a la vista.
 */
export function layoutCadTitleBlock(input: CadTitleBlockLayoutInput): CadTitleBlockLayout {
  const { fields, sources } = resolveCadTitleBlockFields(input);
  const issues: string[] = [];

  const frame = {
    x: input.margins.left,
    y: input.margins.top,
    width: Math.max(1, input.page.width - input.margins.left - input.margins.right),
    height: Math.max(1, input.page.height - input.margins.top - input.margins.bottom),
  };

  // Encoger es la última salida, no la primera: se conserva el tamaño nominal
  // mientras la hoja lo admita, y sólo entonces se reduce en proporción para
  // que el cajetín no deje de ser un cajetín.
  const shrink = Math.min(
    1,
    frame.width / CAD_TITLE_BLOCK_WIDTH_MM,
    frame.height / CAD_TITLE_BLOCK_HEIGHT_MM,
  );
  if (shrink < 1)
    issues.push(
      `La hoja de ${input.page.width} × ${input.page.height} mm no admite un cajetín de ${CAD_TITLE_BLOCK_WIDTH_MM} × ${CAD_TITLE_BLOCK_HEIGHT_MM} mm: se reduce al ${(shrink * 100).toFixed(1)} %.`,
    );

  const boxWidth = CAD_TITLE_BLOCK_WIDTH_MM * shrink;
  const boxHeight = CAD_TITLE_BLOCK_HEIGHT_MM * shrink;
  const box = {
    x: frame.x + frame.width - boxWidth,
    y: frame.y + frame.height - boxHeight,
    width: boxWidth,
    height: boxHeight,
  };

  const labelSize = 1.8 * shrink;
  const valueSize = 3 * shrink;
  const strongSize = 4 * shrink;
  if (labelSize < CAD_TITLE_BLOCK_MIN_TEXT_MM)
    issues.push(
      `Los rótulos del cajetín quedarían a ${labelSize.toFixed(2)} mm, por debajo del mínimo legible de ${CAD_TITLE_BLOCK_MIN_TEXT_MM} mm.`,
    );

  const cells: CadTitleBlockCell[] = [];
  const rules: CadTitleBlockLayout["rules"] = [];
  const missing: Array<keyof CadTitleBlockFields> = [];
  let cursorY = box.y;

  for (const [bandIndex, band] of BANDS.entries()) {
    const bandHeight = boxHeight * band.heightRatio;
    if (bandIndex > 0)
      rules.push({ x1: box.x, y1: cursorY, x2: box.x + box.width, y2: cursorY });
    let cursorX = box.x;
    for (const [cellIndex, cell] of band.cells.entries()) {
      const cellWidth = (box.width * cell.span) / COLUMNS;
      if (cellIndex > 0)
        rules.push({ x1: cursorX, y1: cursorY, x2: cursorX, y2: cursorY + bandHeight });
      const value = fields[cell.key];
      if (!value) missing.push(cell.key);
      cells.push({
        key: cell.key,
        label: cell.label,
        value: value || EMPTY,
        source: sources[cell.key],
        x: cursorX,
        y: cursorY,
        width: cellWidth,
        height: bandHeight,
        labelSizeMm: labelSize,
        valueSizeMm: cell.strong ? strongSize : valueSize,
      });
      cursorX += cellWidth;
    }
    cursorY += bandHeight;
  }

  return { sheetId: input.sheetId, frame, box, rules, cells, shrink, fields, missing, issues };
}

/**
 * Comprobación de contención, para que una prueba pueda afirmarla.
 *
 * Devuelve los milímetros que el cajetín se sale de la hoja. Cero es lo único
 * aceptable: un cajetín cortado por el borde no es un defecto estético, es una
 * lámina sin número de plano.
 */
export function cadTitleBlockOverflowMm(
  layout: CadTitleBlockLayout,
  page: { width: number; height: number },
): number {
  const { box } = layout;
  return Math.max(
    0,
    -box.x,
    -box.y,
    box.x + box.width - page.width,
    box.y + box.height - page.height,
  );
}
