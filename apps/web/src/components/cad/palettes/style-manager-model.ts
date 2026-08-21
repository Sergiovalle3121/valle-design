/**
 * Gestores de estilos: texto, cota, directriz, tabla y ploteo.
 *
 * El documento canónico tiene la sección `styles` con las cinco familias desde
 * hace tiempo, y los adaptadores de MTEXT, DIMENSION y MLEADER guardan el
 * nombre del estilo que usa cada entidad. Lo que no existía era dónde DEFINIR
 * esos estilos: se podía escribir «Titulos» en la propiedad `style` de un
 * texto, pero no había manera de decir qué significa «Titulos».
 *
 * Este módulo es la parte pura. Describe cada familia con sus campos —para que
 * la paleta se pinte sola y añadir un campo sea una línea— y hace las tres
 * operaciones sobre la tabla: crear, escribir y borrar.
 *
 * ## Lo que este gestor NO hace
 *
 * **Renombrar.** Las entidades referencian su estilo POR NOMBRE
 * (`mtext.style`, `dimension.style`, `mleader.style`). Renombrar sin reasignar
 * dejaría huérfanas todas las que lo usaban, y reasignarlas es una migración
 * sobre `entities` que pertenece a la ruta canónica de comandos, no a un
 * campo de texto. Se ofrece crear y borrar, y borrar se BLOQUEA mientras algo
 * lo use: el gestor cuenta las referencias y quien llama se las pasa.
 */
import type { CadStyleTable } from "@/lib/cad/cad-document";

export type CadStyleFamily =
  "text" | "dimension" | "mleader" | "table" | "plot";

export type CadStyleValue = string | number | boolean;

export interface CadStyleFieldDescriptor {
  key: string;
  label: string;
  kind: "text" | "number" | "boolean" | "enum";
  /** Sólo para `enum`. */
  options?: readonly string[];
  /** Lo que la interfaz enseña cuando el estilo no fija el campo. */
  fallback: CadStyleValue;
  /** Mínimo para los numéricos; un alto de texto de 0 no se dibuja. */
  min?: number;
}

export interface CadStyleFamilyDescriptor {
  family: CadStyleFamily;
  label: string;
  /** Qué entidades lo referencian, para explicar el bloqueo de borrado. */
  usedBy: string;
  fields: readonly CadStyleFieldDescriptor[];
}

export const CAD_STYLE_FAMILIES: readonly CadStyleFamilyDescriptor[] = [
  {
    family: "text",
    label: "Texto",
    usedBy: "MTEXT",
    fields: [
      { key: "fontFamily", label: "Fuente", kind: "text", fallback: "Arial" },
      {
        key: "height",
        label: "Altura",
        kind: "number",
        fallback: 120,
        min: 0.000001,
      },
    ],
  },
  {
    family: "dimension",
    label: "Cota",
    usedBy: "DIMENSION",
    fields: [
      {
        key: "textStyle",
        label: "Estilo de texto",
        kind: "text",
        fallback: "Standard",
      },
      {
        key: "arrowSize",
        label: "Tamaño de flecha",
        kind: "number",
        fallback: 180,
        min: 0.000001,
      },
      {
        key: "precision",
        label: "Decimales",
        kind: "number",
        fallback: 2,
        min: 0,
      },
      // Los dos campos que hacen mexicana una cota. Sin ellos en la paleta, la
      // norma llegaría en la plantilla y sería INVISIBLE e ineditable: quien
      // quisiera pasar un estilo de metros a centímetros tendría que rehacerlo.
      {
        key: "units",
        label: "Unidad rotulada",
        kind: "enum",
        // En arquitectura mexicana se acota en metros (planta) o centímetros
        // (detalle). La pulgada y el pie no se ofrecen: no se dibuja así en
        // México, y ofrecerlos invita a un plano que la obra no sabe leer.
        options: ["m", "cm", "mm"],
        fallback: "mm",
      },
      {
        key: "arrowhead",
        label: "Remate",
        kind: "enum",
        // La garrapata primero, que es la de arquitectura. Las cuatro están
        // admitidas por ISO 129-1; la flecha rellena es la de mecánica.
        options: ["architectural-tick", "closed-filled", "open", "dot"],
        fallback: "closed-filled",
      },
      // El resto del núcleo DIMVAR (dimension-style.ts): editable aquí para
      // que ningún campo de la norma exista sólo en el fichero. Cada etiqueta
      // lleva su DIMVAR — es el vocabulario del dibujante que llega de AutoCAD.
      { key: "textHeight", label: "Altura de texto (DIMTXT)", kind: "number", fallback: 120, min: 0.000001 },
      { key: "textGap", label: "Separación de texto (DIMGAP)", kind: "number", fallback: 90, min: 0 },
      { key: "textVertical", label: "Posición vertical (DIMTAD)", kind: "enum", options: ["above", "centered"], fallback: "above" },
      { key: "textJustification", label: "Posición horizontal (DIMJUST)", kind: "enum", options: ["centered", "first", "second"], fallback: "centered" },
      { key: "textInsideHorizontal", label: "Texto interior horizontal (DIMTIH)", kind: "boolean", fallback: false },
      { key: "textOutsideHorizontal", label: "Texto exterior horizontal (DIMTOH)", kind: "boolean", fallback: false },
      { key: "textColor", label: "Color de texto (DIMCLRT)", kind: "text", fallback: "" },
      { key: "arrowheadFirst", label: "Remate 1 (DIMBLK1)", kind: "enum", options: ["architectural-tick", "closed-filled", "open", "dot"], fallback: "closed-filled" },
      { key: "arrowheadSecond", label: "Remate 2 (DIMBLK2)", kind: "enum", options: ["architectural-tick", "closed-filled", "open", "dot"], fallback: "closed-filled" },
      { key: "separateArrowheads", label: "Remates separados (DIMSAH)", kind: "boolean", fallback: false },
      { key: "extensionOvershoot", label: "Exceso de extensión (DIMEXE)", kind: "number", fallback: 120, min: 0 },
      { key: "extensionGap", label: "Hueco de extensión (DIMEXO)", kind: "number", fallback: 40, min: 0 },
      { key: "baselineSpacing", label: "Separación línea base (DIMDLI)", kind: "number", fallback: 380, min: 0 },
      { key: "dimLineColor", label: "Color línea de cota (DIMCLRD)", kind: "text", fallback: "" },
      { key: "extensionLineColor", label: "Color de extensiones (DIMCLRE)", kind: "text", fallback: "" },
      { key: "dimLineWeight", label: "Grosor línea de cota (DIMLWD)", kind: "number", fallback: 25, min: 0 },
      { key: "extensionLineWeight", label: "Grosor de extensiones (DIMLWE)", kind: "number", fallback: 18, min: 0 },
      { key: "forceLineInside", label: "Línea forzada dentro (DIMTOFL)", kind: "boolean", fallback: false },
      { key: "forceTextInside", label: "Texto forzado dentro (DIMTIX)", kind: "boolean", fallback: false },
      { key: "overallScale", label: "Escala global (DIMSCALE)", kind: "number", fallback: 1, min: 0.000001 },
      { key: "linearFactor", label: "Factor lineal (DIMLFAC)", kind: "number", fallback: 1, min: 0.000001 },
      { key: "zeroSuppression", label: "Supresión de ceros (DIMZIN)", kind: "enum", options: ["none", "leading", "trailing", "both"], fallback: "none" },
      { key: "roundTo", label: "Redondeo (DIMRND)", kind: "number", fallback: 0, min: 0 },
      { key: "prefix", label: "Prefijo (DIMPOST)", kind: "text", fallback: "" },
      { key: "suffix", label: "Sufijo (DIMPOST)", kind: "text", fallback: "" },
    ],
  },
  {
    family: "mleader",
    label: "Directriz",
    usedBy: "MLEADER",
    fields: [
      {
        key: "textStyle",
        label: "Estilo de texto",
        kind: "text",
        fallback: "Standard",
      },
      {
        key: "arrowSize",
        label: "Tamaño de flecha",
        kind: "number",
        fallback: 180,
        min: 0.000001,
      },
      {
        key: "doglegLength",
        label: "Longitud de codo",
        kind: "number",
        fallback: 600,
        min: 0,
      },
      { key: "landing", label: "Con codo", kind: "boolean", fallback: true },
    ],
  },
  {
    family: "table",
    label: "Tabla",
    usedBy: "TABLE",
    fields: [
      {
        key: "textStyle",
        label: "Estilo de texto",
        kind: "text",
        fallback: "Standard",
      },
      {
        key: "rowHeight",
        label: "Alto de fila",
        kind: "number",
        fallback: 240,
        min: 0.000001,
      },
    ],
  },
  {
    family: "plot",
    label: "Ploteo",
    usedBy: "las presentaciones",
    fields: [
      {
        key: "colorMode",
        label: "Modo de color",
        kind: "enum",
        options: ["color", "monochrome"],
        fallback: "color",
      },
      {
        key: "lineweightScale",
        label: "Escala de grosor",
        kind: "number",
        fallback: 1,
        min: 0.000001,
      },
    ],
  },
];

/**
 * Tabla vacía para cuando todavía no hay documento cargado. Constante de
 * módulo y no un literal en el render: el gestor va memoizado y un objeto nuevo
 * por render lo despertaría con cada movimiento del ratón.
 */
export const EMPTY_CAD_STYLES: CadStyleTable = Object.freeze({
  text: {},
  dimension: {},
  mleader: {},
  table: {},
  plot: {},
}) as CadStyleTable;

export function cadStyleFamilyDescriptor(
  family: CadStyleFamily,
): CadStyleFamilyDescriptor {
  const descriptor = CAD_STYLE_FAMILIES.find(
    (entry) => entry.family === family,
  );
  if (!descriptor) throw new Error(`Unknown CAD style family ${family}.`);
  return descriptor;
}

export interface CadStyleRow {
  name: string;
  /** Valores efectivos: lo que el estilo fija, o el valor de fábrica. */
  values: Record<string, CadStyleValue>;
  /** Qué campos fija el estilo de verdad (los demás son de fábrica). */
  explicit: string[];
}

/** Una familia del documento, ordenada por nombre para que sea determinista. */
export function cadStyleRows(
  styles: CadStyleTable,
  family: CadStyleFamily,
): CadStyleRow[] {
  const descriptor = cadStyleFamilyDescriptor(family);
  const table = (styles[family] ?? {}) as Record<
    string,
    Record<string, CadStyleValue | undefined>
  >;
  return Object.keys(table)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const stored = table[name] ?? {};
      const values: Record<string, CadStyleValue> = {};
      const explicit: string[] = [];
      for (const field of descriptor.fields) {
        const value = stored[field.key];
        if (value === undefined) values[field.key] = field.fallback;
        else {
          values[field.key] = value;
          explicit.push(field.key);
        }
      }
      return { name, values, explicit };
    });
}

const INVALID_STYLE_NAME = /[<>/\\":;?*|=`,]/;

/**
 * Los mismos caracteres prohibidos que un nombre de capa. No es capricho: el
 * nombre viaja a DXF, donde la tabla de estilos comparte las restricciones de
 * la de capas.
 */
export function assertCadStyleName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 96 || INVALID_STYLE_NAME.test(trimmed))
    throw new Error(
      "El nombre del estilo debe tener 1–96 caracteres válidos de DXF.",
    );
  return trimmed;
}

export function createCadStyle(
  styles: CadStyleTable,
  family: CadStyleFamily,
  name: string,
): CadStyleTable {
  const key = assertCadStyleName(name);
  const table = (styles[family] ?? {}) as Record<string, unknown>;
  if (
    Object.keys(table).some(
      (candidate) => candidate.toLocaleLowerCase() === key.toLocaleLowerCase(),
    )
  )
    throw new Error(`El estilo ${key} ya existe.`);
  // Nace VACÍO a propósito: un estilo sin campos fijados hereda los de fábrica,
  // y así el diff del documento sólo contiene lo que el usuario decidió.
  return { ...styles, [family]: { ...table, [key]: {} } };
}

export function writeCadStyleValue(
  styles: CadStyleTable,
  family: CadStyleFamily,
  name: string,
  key: string,
  value: CadStyleValue,
): CadStyleTable {
  const descriptor = cadStyleFamilyDescriptor(family);
  const field = descriptor.fields.find((entry) => entry.key === key);
  if (!field) throw new Error(`El estilo ${family} no tiene el campo ${key}.`);
  const table = (styles[family] ?? {}) as Record<
    string,
    Record<string, CadStyleValue>
  >;
  if (!table[name]) throw new Error(`El estilo ${name} no existe.`);

  let next = value;
  if (field.kind === "number") {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric))
      throw new Error(`${field.label} tiene que ser un número.`);
    if (field.min !== undefined && numeric < field.min)
      throw new Error(`${field.label} no puede bajar de ${field.min}.`);
    next = numeric;
  }
  if (field.kind === "enum" && !field.options?.includes(String(value)))
    throw new Error(`${field.label} no admite «${String(value)}».`);

  return {
    ...styles,
    [family]: { ...table, [name]: { ...table[name], [key]: next } },
  };
}

export function deleteCadStyle(
  styles: CadStyleTable,
  family: CadStyleFamily,
  name: string,
): CadStyleTable {
  const table = { ...((styles[family] ?? {}) as Record<string, unknown>) };
  if (!(name in table)) throw new Error(`El estilo ${name} no existe.`);
  delete table[name];
  return { ...styles, [family]: table };
}
