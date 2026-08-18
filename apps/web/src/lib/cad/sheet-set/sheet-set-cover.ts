/**
 * Portada del juego de láminas.
 *
 * ## Qué entrega un arquitecto
 *
 * «Arquitectónico 1/6 … 6/6», no seis PDF sueltos. Y delante de las seis, una
 * hoja que dice qué contiene el juego: número de lámina, título, escala y
 * revisión de cada una. Es lo primero que mira quien recibe el paquete, y es lo
 * que le permite darse cuenta de que falta la 4 antes de llevarlo a obra.
 *
 * ## Por qué el índice se DERIVA de los cajetines
 *
 * Ésta es la decisión que importa. La portada no recibe una lista aparte: se
 * construye leyendo los cajetines ya resueltos de las láminas. Una portada con
 * su propia fuente de datos se desincroniza el día que alguien renumera el
 * conjunto —la lámina diría «A-104» y el índice «A-103»— y ese desajuste no lo
 * detecta nadie hasta que el cliente pide el plano equivocado. Derivándola, la
 * incoherencia deja de ser posible: si el índice y el cajetín no coinciden es
 * que el cajetín cambió, y el índice cambia con él.
 *
 * ## La portada NO consume número de lámina
 *
 * Un juego de seis láminas tiene seis láminas. La portada es la página 1 del
 * PDF pero no es la lámina 1: si consumiese número, las láminas irían de 2/7 a
 * 7/7 y ningún cajetín cuadraría con lo que el estudio tiene escrito en sus
 * expedientes. Se declara aquí porque es la clase de convenio que, sin decirlo,
 * cada quien resuelve de una manera.
 */
import type { CadPublishSheet, CadVectorCommand } from "../paper-space";
import type { CadPageMargins } from "../plot/page-setup";
import type { CadTitleBlockLayout } from "../plot/title-block";

export interface CadCoverRow {
  /** Posición en la serie, 1-based. */
  index: number;
  /** `3/6`, tal y como sale impreso en el cajetín de esa lámina. */
  sheetOf: string;
  number: string;
  title: string;
  scale: string;
  revision: string;
}

/**
 * Filas del índice, leídas de los cajetines de las láminas.
 *
 * Toma lo que el cajetín IMPRIME, no lo que el modelo guarda: si una lámina
 * salió con «—» en la revisión porque nadie la rellenó, el índice dice «—»
 * también. Una portada más completa que las láminas que indexa describe un
 * juego que no existe.
 */
export function cadCoverRowsFromTitleBlocks(
  titleBlocks: readonly CadTitleBlockLayout[],
): CadCoverRow[] {
  return titleBlocks.map((block, index) => {
    const printed = (key: keyof CadTitleBlockLayout["fields"]): string => {
      const cell = block.cells.find((candidate) => candidate.key === key);
      return cell?.value ?? block.fields[key] ?? "—";
    };
    return {
      index: index + 1,
      sheetOf: printed("sheetOf"),
      number: printed("sheetNumber"),
      title: printed("title"),
      scale: printed("scale"),
      revision: printed("revision"),
    };
  });
}

export interface CadCoverSheetInput {
  id?: string;
  /** Nombre del conjunto: lo que va en grande arriba. */
  setName: string;
  subtitle?: string;
  /** Hoja YA orientada, en milímetros. */
  page: { width: number; height: number; orientation: "portrait" | "landscape" };
  margins: CadPageMargins;
  rows: readonly CadCoverRow[];
  colorMode?: "color" | "monochrome";
}

const INK = "#111827";
const RULE_WIDTH = 0.25;

/** Reparto horizontal del índice, en fracción del ancho útil. */
const COLUMNS: ReadonlyArray<{ label: string; width: number; key: keyof CadCoverRow }> = [
  { label: "HOJA", width: 0.1, key: "sheetOf" },
  { label: "Nº DE LÁMINA", width: 0.2, key: "number" },
  { label: "TÍTULO", width: 0.44, key: "title" },
  { label: "ESCALA", width: 0.16, key: "scale" },
  { label: "REV.", width: 0.1, key: "revision" },
];

/** Cuántas filas caben antes de que la tabla se salga del papel. */
export function cadCoverRowCapacity(
  page: { height: number },
  margins: CadPageMargins,
  rowHeightMm = 7,
): number {
  const usable = page.height - margins.top - margins.bottom - 46;
  return Math.max(0, Math.floor(usable / rowHeightMm));
}

/**
 * Portada como una hoja publicable más.
 *
 * Se devuelve un `CadPublishSheet` normal —con su ventana y sus órdenes
 * vectoriales— y no un dibujo aparte. Así la portada pasa por el MISMO emisor
 * que las láminas: mismo tamaño de página, misma tabla de plumas, misma fuente.
 * Una portada emitida por otro camino sale con otra tipografía y se nota.
 */
export function buildCadCoverSheet(input: CadCoverSheetInput): {
  sheet: CadPublishSheet;
  /** Filas que no cupieron. Nunca se recortan en silencio. */
  overflowRows: CadCoverRow[];
} {
  const id = input.id ?? "cover";
  const commands: CadVectorCommand[] = [];
  const left = input.margins.left;
  const right = input.page.width - input.margins.right;
  const width = Math.max(1, right - left);

  const text = (
    key: string,
    x: number,
    y: number,
    value: string,
    size: number,
    bold = false,
    maxWidth?: number,
  ): void => {
    commands.push({
      kind: "text",
      entityId: `${id}:${key}`,
      viewportId: `${id}:viewport`,
      point: { x, y },
      text: value,
      size,
      rotation: 0,
      color: INK,
      align: "left",
      bold,
      ...(maxWidth ? { maxWidth } : {}),
    });
  };
  const rule = (key: string, y: number, lineWidth = RULE_WIDTH): void => {
    commands.push({
      kind: "path",
      entityId: `${id}:${key}`,
      viewportId: `${id}:viewport`,
      points: [
        { x: left, y },
        { x: right, y },
      ],
      closed: false,
      style: { stroke: INK, lineWidth },
    });
  };

  let y = input.margins.top + 14;
  text("set-name", left, y, input.setName, 8, true, width);
  y += 8;
  if (input.subtitle) {
    text("subtitle", left, y, input.subtitle, 4, false, width);
    y += 6;
  }
  text("caption", left, y, `Índice del juego — ${input.rows.length} lámina(s)`, 3.2, false, width);
  y += 6;
  rule("rule-title", y, 0.5);
  y += 7;

  // Cabecera de la tabla.
  let cursorX = left;
  for (const column of COLUMNS) {
    text(`head-${column.key}`, cursorX, y, column.label, 2.6, true, width * column.width - 2);
    cursorX += width * column.width;
  }
  y += 2.5;
  rule("rule-head", y);

  const rowHeight = 7;
  const capacity = cadCoverRowCapacity(input.page, input.margins, rowHeight);
  const shown = input.rows.slice(0, capacity);
  const overflowRows = input.rows.slice(capacity);

  for (const row of shown) {
    y += rowHeight;
    cursorX = left;
    for (const column of COLUMNS) {
      text(
        `row-${row.index}-${column.key}`,
        cursorX,
        y - 1.8,
        String(row[column.key]),
        3,
        column.key === "number",
        width * column.width - 2,
      );
      cursorX += width * column.width;
    }
    rule(`rule-row-${row.index}`, y, 0.13);
  }

  return {
    sheet: {
      id,
      name: "Portada",
      width: input.page.width,
      height: input.page.height,
      orientation: input.page.orientation,
      colorMode: input.colorMode ?? "monochrome",
      lineweightScale: 1,
      titleBlock: {},
      viewports: [
        {
          id: `${id}:viewport`,
          name: "Índice",
          clip: { x: left, y: input.margins.top, width, height: input.page.height },
          scale: 1,
          locked: true,
          commands,
        },
      ],
    },
    overflowRows,
  };
}
