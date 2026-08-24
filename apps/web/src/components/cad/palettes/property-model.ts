/**
 * Modelo de la paleta de PROPIEDADES (Ctrl+1).
 *
 * Los adaptadores de `CAD_ENTITY_REGISTRY` ya saben leer y escribir las
 * propiedades de UNA entidad (`properties.read` / `properties.write`). Lo que
 * no existía es la capa que convierte N entidades —de tipos distintos— en la
 * tabla que AutoCAD enseña: propiedades comunes, agrupadas por categoría, con
 * `*VARIES*` donde los valores difieren y edición que se propaga a todas.
 *
 * Este módulo es esa capa, y es PURO: entra una lista de sujetos, sale una
 * descripción de filas. No sabe de React, ni del documento, ni de la escena.
 * La paleta lo pinta; el editor traduce cada edición a `CadEntityCommand[]` y
 * la aplica por la ÚNICA ruta de mutación (`commitNativeCommands`), en un lote
 * y un paso de deshacer.
 *
 * ## Por qué la INTERSECCIÓN y no la unión
 *
 * Con una línea y un círculo designados, la unión ofrecería `radius` — un
 * campo que sólo afecta a la mitad de lo seleccionado y que deja al usuario sin
 * saber qué acaba de cambiar. AutoCAD muestra la intersección, y aquí también:
 * con un solo objeto la intersección es todo, así que el caso de siempre no
 * cambia ni un campo.
 */
import type {
  CadPropertyBag,
  CadPropertyValue,
} from "@/lib/cad/entity-runtime";
import {
  CAD_WALL_MATERIAL_IDS,
  cadWallMaterialStyle,
} from "@/lib/cad/wall-materials";

export type { CadPropertyValue };

/** Texto que AutoCAD muestra cuando los objetos designados no coinciden. */
export const CAD_PROPERTY_VARIES = "*VARIES*";

/** Una entidad designada, ya leída por su adaptador. */
export interface CadPropertySubject {
  id: string;
  /** Tipo canónico (`line`, `circle`, `mtext`…). */
  type: string;
  properties: Readonly<CadPropertyBag>;
}

export type CadPropertyEditorKind =
  "text" | "multiline" | "number" | "boolean" | "readonly" | "select";

export interface CadPropertyOption {
  value: string;
  label: string;
}

export interface CadPropertyRow {
  key: string;
  category: string;
  kind: CadPropertyEditorKind;
  /** Valor común, o `null` cuando difiere entre los objetos designados. */
  value: CadPropertyValue | null;
  varies: boolean;
  /** Sólo en filas `kind: "select"`: las opciones que ofrece el desplegable. */
  options?: readonly CadPropertyOption[];
  /**
   * Objetos a los que va una escritura de esta fila. Es la designación entera
   * porque las filas son la intersección, pero se expone explícito para que la
   * paleta no tenga que asumirlo.
   */
  entityIds: string[];
}

export interface CadPropertyGroup {
  category: string;
  rows: CadPropertyRow[];
}

export interface CadPropertyModel {
  /** Objetos designados. */
  count: number;
  /** Tipos distintos presentes, en orden de aparición. */
  types: string[];
  /** Cabecera lista para pintar: `LINE line-1` o `3 objetos · line, circle`. */
  headline: string;
  groups: CadPropertyGroup[];
}

const GENERAL = "General";
const GEOMETRY = "Geometría";
const TEXT = "Texto";
const DIMENSION = "Cota";
const HATCH = "Sombreado";
const BLOCK = "Bloque";
const ATTRIBUTES = "Atributos";
const OTHER = "Otros";

/** Orden de las categorías en la paleta. Espeja el de AutoCAD. */
const CATEGORY_ORDER = [
  GENERAL,
  GEOMETRY,
  TEXT,
  DIMENSION,
  HATCH,
  BLOCK,
  ATTRIBUTES,
  OTHER,
];

/**
 * Categoría por clave. Lo que no está aquí cae en «Otros», que es un destino
 * legítimo y no un error: una entidad nueva aparece completa en la paleta
 * desde el primer día, aunque nadie haya clasificado aún sus campos.
 */
const CATEGORY_BY_KEY: Record<string, string> = {
  layer: GENERAL,
  closed: GENERAL,
  solid: GENERAL,
  style: GENERAL,
  associative: GENERAL,
  associationStatus: GENERAL,

  startX: GEOMETRY,
  startY: GEOMETRY,
  endX: GEOMETRY,
  endY: GEOMETRY,
  length: GEOMETRY,
  centerX: GEOMETRY,
  centerY: GEOMETRY,
  radius: GEOMETRY,
  diameter: GEOMETRY,
  startAngle: GEOMETRY,
  endAngle: GEOMETRY,
  majorAxisX: GEOMETRY,
  majorAxisY: GEOMETRY,
  ratio: GEOMETRY,
  startParameter: GEOMETRY,
  endParameter: GEOMETRY,
  degree: GEOMETRY,
  controlPointCount: GEOMETRY,
  vertexCount: GEOMETRY,
  segmentCount: GEOMETRY,
  arcSegments: GEOMETRY,
  rotation: GEOMETRY,
  insertionX: GEOMETRY,
  insertionY: GEOMETRY,
  scaleX: GEOMETRY,
  scaleY: GEOMETRY,
  // El grosor del muro es geometría en planta. `height` NO se lista aquí: la
  // clave la comparte MTEXT (altura de texto, categoría Texto) y la categoría
  // se resuelve por clave, no por tipo.
  thickness: GEOMETRY,
  material: GEOMETRY,

  text: TEXT,
  height: TEXT,
  width: TEXT,
  fontFamily: TEXT,
  bold: TEXT,
  italic: TEXT,
  underline: TEXT,
  alignment: TEXT,
  paragraphAlignment: TEXT,
  lineSpacing: TEXT,
  columns: TEXT,
  backgroundMask: TEXT,
  backgroundColor: TEXT,
  backgroundPadding: TEXT,
  textWidth: TEXT,
  textHeight: TEXT,
  textRotation: TEXT,
  textAlignment: TEXT,
  contentType: TEXT,

  dimensionKind: DIMENSION,
  measurement: DIMENSION,
  label: DIMENSION,
  offset: DIMENSION,
  axis: DIMENSION,
  precision: DIMENSION,
  units: DIMENSION,
  prefix: DIMENSION,
  suffix: DIMENSION,
  alternateUnits: DIMENSION,
  extensionLines: DIMENSION,
  arrowhead: DIMENSION,
  arrowSize: DIMENSION,
  textOverride: DIMENSION,
  referenceCount: DIMENSION,
  landing: DIMENSION,
  doglegLength: DIMENSION,
  leaderLineCount: DIMENSION,

  pattern: HATCH,
  scale: HATCH,
  angle: HATCH,
  islandStyle: HATCH,
  originX: HATCH,
  originY: HATCH,
  boundaryCount: HATCH,
  boundaryReferenceCount: HATCH,

  block: BLOCK,
  attributeCount: BLOCK,
};

/**
 * Claves que el adaptador DERIVA y su `write` ignora.
 *
 * Ofrecer un campo editable que no escribe nada es peor que no ofrecerlo: el
 * usuario teclea, el valor vuelve solo a su sitio y parece que el producto ha
 * perdido el cambio. Lo que no se puede escribir se pinta en sólo lectura.
 * `length` es el caso claro: el adaptador de LINE la calcula desde los
 * extremos y su `write` no la mira.
 */
const READONLY_KEYS = new Set([
  "length",
  "measurement",
  "label",
  "associationStatus",
  "block",
]);

/**
 * Claves de un conjunto FINITO, con desplegable en vez de texto libre. La
 * opción vacía siempre es "sin declarar" — no hace falta que cada dueño de
 * campo la repita — así que se antepone aquí, una sola vez, para las claves
 * que la ofrecen.
 */
const SELECT_OPTIONS_BY_KEY: Record<string, readonly CadPropertyOption[]> = {
  material: [
    { value: "", label: "Genérico" },
    ...CAD_WALL_MATERIAL_IDS.map((id) => ({
      value: id,
      label: cadWallMaterialStyle(id).label,
    })),
  ],
};

/** El prefijo de los atributos de un INSERT: `attribute:MARK`. */
const ATTRIBUTE_PREFIX = "attribute:";

function categoryOf(key: string): string {
  if (key.startsWith(ATTRIBUTE_PREFIX)) return ATTRIBUTES;
  return CATEGORY_BY_KEY[key] ?? OTHER;
}

function editorKindOf(
  key: string,
  value: CadPropertyValue,
): CadPropertyEditorKind {
  if (READONLY_KEYS.has(key) || key.endsWith("Count")) return "readonly";
  if (key in SELECT_OPTIONS_BY_KEY) return "select";
  if (typeof value === "boolean") return "boolean";
  if (key === "text") return "multiline";
  if (typeof value === "number") return "number";
  return "text";
}

/**
 * Claves comunes a TODOS los sujetos, en el orden en que las declara el
 * primero. El orden importa: es el que ve el usuario, y un `Set` sobre un
 * `Object.keys` lo conserva porque los adaptadores devuelven literales.
 */
function commonKeys(subjects: readonly CadPropertySubject[]): string[] {
  const [first, ...rest] = subjects;
  return Object.keys(first.properties).filter((key) =>
    rest.every((subject) => key in subject.properties),
  );
}

function headlineOf(
  subjects: readonly CadPropertySubject[],
  types: string[],
): string {
  if (subjects.length === 1)
    return `${subjects[0].type.toUpperCase()} ${subjects[0].id}`;
  return `${subjects.length} objetos · ${types.join(", ")}`;
}

/**
 * Construye la tabla de propiedades de una designación.
 *
 * Con la designación vacía devuelve un modelo vacío en vez de lanzar: la
 * paleta sigue montada mientras no hay nada designado, igual que en AutoCAD.
 */
export function buildCadPropertyModel(
  subjects: readonly CadPropertySubject[],
): CadPropertyModel {
  const types: string[] = [];
  for (const subject of subjects)
    if (!types.includes(subject.type)) types.push(subject.type);

  if (subjects.length === 0)
    return { count: 0, types, headline: "Sin selección", groups: [] };

  const entityIds = subjects.map((subject) => subject.id);
  const byCategory = new Map<string, CadPropertyRow[]>();

  for (const key of commonKeys(subjects)) {
    const first = subjects[0].properties[key];
    const varies = subjects.some(
      (subject) => !Object.is(subject.properties[key], first),
    );
    const kind = editorKindOf(key, first);
    const row: CadPropertyRow = {
      key,
      category: categoryOf(key),
      kind,
      value: varies ? null : first,
      varies,
      ...(kind === "select" ? { options: SELECT_OPTIONS_BY_KEY[key] } : {}),
      entityIds: [...entityIds],
    };
    const rows = byCategory.get(row.category);
    if (rows) rows.push(row);
    else byCategory.set(row.category, [row]);
  }

  const groups: CadPropertyGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    const rows = byCategory.get(category);
    if (rows?.length) groups.push({ category, rows });
  }

  return {
    count: subjects.length,
    types,
    headline: headlineOf(subjects, types),
    groups,
  };
}

/**
 * Convierte lo tecleado en el valor que espera el adaptador.
 *
 * Devuelve `null` cuando el texto no sirve —un número que no lo es, o el
 * propio `*VARIES*` que la paleta muestra como marcador— para que quien llama
 * no aplique nada. Rechazar en silencio es correcto aquí: el campo conserva lo
 * que el documento dice, y el usuario ve que su texto no cuajó.
 */
export function coerceCadPropertyInput(
  row: Pick<CadPropertyRow, "kind">,
  raw: string,
): CadPropertyValue | null {
  if (row.kind === "readonly" || row.kind === "boolean") return null;
  if (raw === CAD_PROPERTY_VARIES) return null;
  if (row.kind === "number") {
    const next = Number(raw);
    return Number.isFinite(next) ? next : null;
  }
  return raw;
}

/**
 * Valor que el campo enseña. Con `*VARIES*` NO se rellena el campo —se deja
 * vacío y el marcador va de `placeholder`— para que teclear no obligue antes a
 * borrar un texto que no era un valor.
 */
export function cadPropertyFieldValue(row: CadPropertyRow): string {
  if (row.varies || row.value === null) return "";
  return String(row.value);
}
