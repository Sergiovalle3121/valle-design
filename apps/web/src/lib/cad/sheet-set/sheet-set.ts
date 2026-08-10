/**
 * Conjuntos de planos.
 *
 * ## Por qué NO vive dentro de `CadDocument`
 *
 * Es una decisión de arquitectura, no una comodidad. Un conjunto agrupa hojas
 * de **varios dibujos**: la planta viene de un archivo, las instalaciones de
 * otro, los detalles de un tercero. Meterlo dentro de un documento obligaría a
 * elegir cuál de ellos es el dueño, y a que abrir el conjunto cargase un
 * documento entero para leer una lista de veinte filas.
 *
 * AutoCAD llegó a la misma conclusión hace veinte años: el conjunto es un
 * archivo aparte, el `.dst`. Aquí también — su propio módulo, su propia tabla,
 * su propia versión para el control de concurrencia.
 *
 * ## Qué resuelve
 *
 * Tres cosas que a mano son tediosas y por tanto salen mal:
 *
 * - **Numeración automática.** `A-101`, `A-102`, `A-103`… Renumerar veinte
 *   planos porque se insertó uno nuevo en el hueco tres es media hora y dos
 *   erratas.
 * - **Campos que se rellenan solos.** El cajetín dice el número del plano, su
 *   título, su escala, su fecha y su revisión. Escribirlos a mano garantiza que
 *   dentro de un mes tres planos digan la revisión anterior.
 * - **Publicación por lotes.** Un PDF paginado con las veinte hojas en orden,
 *   no veinte PDF que alguien tiene que juntar.
 */

export interface CadSheetNumbering {
  /** `A-` en `A-101`. */
  prefix: string;
  /** Primer número. */
  start: number;
  /** Salto entre hojas. Los estudios que dejan hueco usan 10. */
  step: number;
  /** Dígitos mínimos: 3 convierte el 7 en `007`. */
  padding: number;
  suffix: string;
}

export const CAD_DEFAULT_NUMBERING: CadSheetNumbering = {
  prefix: "A-",
  start: 101,
  step: 1,
  padding: 0,
  suffix: "",
};

export interface CadSheetSetSheet {
  id: string;
  order: number;
  /** Documento CAD del que sale la hoja. */
  documentId: string;
  /** Presentación dentro de ese documento. */
  layoutId: string;
  title: string;
  /**
   * Número del plano. Lo escribe `renumberCadSheetSet`; se puede fijar a mano
   * marcando `numberLocked`, porque hay planos cuyo número es contractual y no
   * puede moverse aunque se reordene el conjunto.
   */
  number: string;
  numberLocked?: boolean;
  revision: string;
  /** Campos propios; anulan los del conjunto para esta hoja. */
  fields?: Record<string, string>;
  includeInPublish?: boolean;
}

export interface CadSheetSetSubset {
  id: string;
  name: string;
  sheetIds: string[];
}

export interface CadSheetSet {
  schema: 1;
  id: string;
  name: string;
  description?: string;
  /** Campos comunes del conjunto: proyecto, cliente, autor, fecha. */
  fields: Record<string, string>;
  numbering: CadSheetNumbering;
  sheets: CadSheetSetSheet[];
  subsets?: CadSheetSetSubset[];
  /**
   * Versión monótona. Toda escritura la envía como `expectedVersion`: dos
   * personas ordenando el mismo conjunto a la vez se resuelven con un 409, no
   * sobrescribiendo a la que llegó antes.
   */
  version: number;
  updatedAt?: string;
}

export function createCadSheetSet(input: {
  id: string;
  name: string;
  description?: string;
  fields?: Record<string, string>;
  numbering?: Partial<CadSheetNumbering>;
}): CadSheetSet {
  return {
    schema: 1,
    id: input.id,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    fields: { ...(input.fields ?? {}) },
    numbering: { ...CAD_DEFAULT_NUMBERING, ...(input.numbering ?? {}) },
    sheets: [],
    version: 1,
  };
}

/** Número que le toca a la posición `index`, según la numeración del conjunto. */
export function cadSheetNumberAt(numbering: CadSheetNumbering, index: number): string {
  const value = numbering.start + index * (numbering.step || 1);
  const digits = Math.max(0, Math.floor(numbering.padding));
  const body = digits > 0 ? String(Math.abs(value)).padStart(digits, "0") : String(Math.abs(value));
  return `${numbering.prefix}${value < 0 ? "-" : ""}${body}${numbering.suffix}`;
}

/**
 * Renumera el conjunto entero respetando los números fijados.
 *
 * Las hojas con `numberLocked` conservan el suyo y **no consumen** posición:
 * si el `A-102` está fijado, la hoja siguiente sin fijar sigue tomando el
 * número que le tocaría por orden. Es lo que hace que fijar un número no
 * desplace todo lo que viene detrás.
 */
export function renumberCadSheetSet(set: CadSheetSet): CadSheetSet {
  let index = 0;
  const sheets = ordered(set).map((sheet, order) => {
    if (sheet.numberLocked) return { ...sheet, order };
    const number = cadSheetNumberAt(set.numbering, index);
    index += 1;
    return { ...sheet, order, number };
  });
  return { ...set, sheets };
}

export function ordered(set: CadSheetSet): CadSheetSetSheet[] {
  return [...set.sheets].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export interface CadSheetSetAddInput {
  id: string;
  documentId: string;
  layoutId: string;
  title: string;
  revision?: string;
  /** Posición donde insertarla. Por defecto, al final. */
  at?: number;
  fields?: Record<string, string>;
}

/** Añade una hoja y renumera. Insertar en medio es el caso que importa. */
export function addCadSheet(set: CadSheetSet, input: CadSheetSetAddInput): CadSheetSet {
  const sheets = ordered(set);
  const at = Math.max(0, Math.min(sheets.length, input.at ?? sheets.length));
  const sheet: CadSheetSetSheet = {
    id: input.id,
    order: at,
    documentId: input.documentId,
    layoutId: input.layoutId,
    title: input.title,
    number: "",
    revision: input.revision ?? "-",
    ...(input.fields ? { fields: { ...input.fields } } : {}),
  };
  sheets.splice(at, 0, sheet);
  return renumberCadSheetSet({
    ...set,
    sheets: sheets.map((candidate, order) => ({ ...candidate, order })),
  });
}

export function removeCadSheet(set: CadSheetSet, sheetId: string): CadSheetSet {
  return renumberCadSheetSet({
    ...set,
    sheets: ordered(set)
      .filter((sheet) => sheet.id !== sheetId)
      .map((sheet, order) => ({ ...sheet, order })),
    subsets: set.subsets?.map((subset) => ({
      ...subset,
      sheetIds: subset.sheetIds.filter((id) => id !== sheetId),
    })),
  });
}

/** Mueve una hoja a otra posición y renumera. */
export function moveCadSheet(set: CadSheetSet, sheetId: string, to: number): CadSheetSet {
  const sheets = ordered(set);
  const from = sheets.findIndex((sheet) => sheet.id === sheetId);
  if (from < 0) return set;
  const target = Math.max(0, Math.min(sheets.length - 1, to));
  const [moved] = sheets.splice(from, 1);
  sheets.splice(target, 0, moved);
  return renumberCadSheetSet({
    ...set,
    sheets: sheets.map((sheet, order) => ({ ...sheet, order })),
  });
}

export function updateCadSheet(
  set: CadSheetSet,
  sheetId: string,
  patch: Partial<Omit<CadSheetSetSheet, "id" | "order">>,
): CadSheetSet {
  return {
    ...set,
    sheets: set.sheets.map((sheet) => (sheet.id === sheetId ? { ...sheet, ...patch } : sheet)),
  };
}

export interface CadSheetSetIssue {
  code:
    | "duplicate_number"
    | "empty_title"
    | "missing_document"
    | "missing_layout"
    | "no_publishable_sheets";
  severity: "warning" | "error";
  sheetId?: string;
  detail: string;
}

/**
 * Comprobación antes de publicar.
 *
 * Los números duplicados son un ERROR y no un aviso: dos planos con el mismo
 * número en la misma carpeta es exactamente la clase de fallo que se descubre
 * en obra.
 */
export function validateCadSheetSet(
  set: CadSheetSet,
  known?: {
    documentIds?: ReadonlySet<string>;
    layoutIdsByDocument?: ReadonlyMap<string, ReadonlySet<string>>;
  },
): CadSheetSetIssue[] {
  const issues: CadSheetSetIssue[] = [];
  const seen = new Map<string, string>();
  const publishable = ordered(set).filter((sheet) => sheet.includeInPublish !== false);

  for (const sheet of ordered(set)) {
    if (!sheet.title.trim())
      issues.push({
        code: "empty_title",
        severity: "warning",
        sheetId: sheet.id,
        detail: `La hoja ${sheet.number || sheet.id} no tiene título.`,
      });
    const previous = seen.get(sheet.number);
    if (sheet.number && previous)
      issues.push({
        code: "duplicate_number",
        severity: "error",
        sheetId: sheet.id,
        detail: `El número ${sheet.number} está en dos hojas (${previous} y ${sheet.id}).`,
      });
    else if (sheet.number) seen.set(sheet.number, sheet.id);

    if (known?.documentIds && !known.documentIds.has(sheet.documentId))
      issues.push({
        code: "missing_document",
        severity: "error",
        sheetId: sheet.id,
        detail: `El dibujo ${sheet.documentId} de la hoja ${sheet.number || sheet.id} no está disponible.`,
      });
    else if (known?.layoutIdsByDocument) {
      const layouts = known.layoutIdsByDocument.get(sheet.documentId);
      if (layouts && !layouts.has(sheet.layoutId))
        issues.push({
          code: "missing_layout",
          severity: "error",
          sheetId: sheet.id,
          detail: `La presentación ${sheet.layoutId} ya no existe en ${sheet.documentId}.`,
        });
    }
  }

  if (publishable.length === 0)
    issues.push({
      code: "no_publishable_sheets",
      severity: "error",
      detail: "El conjunto no tiene ninguna hoja publicable.",
    });

  return issues;
}

/**
 * Serializado canónico y determinista.
 *
 * Las claves van ordenadas en TODOS los niveles, no sólo en el primero: dos
 * conjuntos con el mismo contenido dan el mismo texto y por tanto el mismo
 * hash, que es lo que permite responder «no ha cambiado nada» sin comparar
 * campo a campo.
 */
export function serializeCadSheetSet(set: CadSheetSet): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));
      return Object.fromEntries(entries.map(([key, item]) => [key, canonical(item)]));
    }
    return value;
  };
  return JSON.stringify(
    canonical({
      ...set,
      sheets: ordered(set),
      subsets: [...(set.subsets ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    }),
    null,
    2,
  );
}
