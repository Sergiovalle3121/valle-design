/**
 * Estilo de cota con NOMBRE: el núcleo de ~30 DIMVARs que un despacho usa de
 * verdad para fijar su norma de acotación.
 *
 * Dos nociones conviven y conviene no confundirlas:
 *
 * - `CadDimensionStyleDefinition` (esto): la DEFINICIÓN con nombre que vive en
 *   `document.styles.dimension` y viaja por DXF como tabla DIMSTYLE. Es la
 *   norma del despacho.
 * - El `DimensionStyle` geométrico de `dimension.ts`: los 4 números que la
 *   geometría pura consume. Se derivan de aquí en el HORNEADO.
 *
 * El modelo de aplicación es el de AutoCAD con una diferencia honesta: la
 * entidad HORNEA en sus campos el subconjunto que su esquema soporta (los
 * overrides efectivos, que ya viajan por XDATA), y el resto de la definición
 * gobierna vía la tabla — persistente, editable y con round-trip — hasta que
 * el esquema de entidad crezca. `DIMSTYLE → Aplicar` re-hornea las cotas
 * existentes del estilo, que es como una norma alcanza a un plano ya dibujado.
 *
 * Cada campo lleva su DIMVAR de AutoCAD al lado: ese vocabulario es el puente
 * con el DXF (tabla DIMSTYLE) y con la cabeza de cualquier dibujante.
 */
import type { CadStyleTable } from "./cad-document";
import { cadDimensionFamilyFor, cadDimensionSubStyleName, type CadDimensionFamilyKind } from "./dimension-family";

export type CadDimensionArrowhead =
  | "closed-filled"
  | "open"
  | "architectural-tick"
  | "dot";

export type CadDimensionZeroSuppression = "none" | "leading" | "trailing" | "both";

export interface CadDimensionStyleDefinition {
  /* ── Texto ─────────────────────────────────────────────────────────────── */
  /** DIMTXSTY — estilo de texto que rotula la cota. */
  textStyle?: string;
  /** DIMTXT — altura del texto (unidades de modelo). */
  textHeight?: number;
  /** DIMGAP — separación texto ↔ línea de cota. */
  textGap?: number;
  /** DIMTAD — posición vertical: 0 centrado, 1 encima. */
  textVertical?: "centered" | "above";
  /** DIMJUST — posición horizontal: centrado o pegado a una extensión. */
  textJustification?: "centered" | "first" | "second";
  /** DIMTIH — texto DENTRO de las extensiones siempre horizontal. */
  textInsideHorizontal?: boolean;
  /** DIMTOH — texto FUERA de las extensiones siempre horizontal. */
  textOutsideHorizontal?: boolean;
  /** DIMCLRT — color del texto (CSS o ACI serializado, como el resto del kernel). */
  textColor?: string;

  /* ── Flechas ───────────────────────────────────────────────────────────── */
  /** DIMBLK — terminador de ambos extremos. */
  arrowhead?: CadDimensionArrowhead;
  /** DIMBLK1 — terminador del primer extremo (con DIMSAH). */
  arrowheadFirst?: CadDimensionArrowhead;
  /** DIMBLK2 — terminador del segundo extremo (con DIMSAH). */
  arrowheadSecond?: CadDimensionArrowhead;
  /** DIMSAH — usar DIMBLK1/DIMBLK2 en vez de DIMBLK. */
  separateArrowheads?: boolean;
  /** DIMASZ — tamaño de flecha. */
  arrowSize?: number;

  /* ── Líneas ────────────────────────────────────────────────────────────── */
  /** DIMEXE — cuánto sobresale la extensión tras la línea de cota. */
  extensionOvershoot?: number;
  /** DIMEXO — hueco punto medido → arranque de extensión. */
  extensionGap?: number;
  /** DIMDLI — separación entre cotas de línea base (DIMBASELINE). */
  baselineSpacing?: number;
  /** DIMCLRD — color de la línea de cota. */
  dimLineColor?: string;
  /** DIMCLRE — color de las extensiones. */
  extensionLineColor?: string;
  /** DIMLWD — grosor de la línea de cota (centésimas de mm, como las capas). */
  dimLineWeight?: number;
  /** DIMLWE — grosor de las extensiones. */
  extensionLineWeight?: number;
  /** DIMTOFL — forzar línea de cota entre extensiones aunque el texto no quepa. */
  forceLineInside?: boolean;
  /** DIMTIX — forzar el TEXTO dentro de las extensiones. */
  forceTextInside?: boolean;

  /* ── Ajuste ────────────────────────────────────────────────────────────── */
  /** DIMSCALE — escala global de tamaños (flechas, huecos, texto). */
  overallScale?: number;
  /** DIMLFAC — factor multiplicador de la medida lineal. */
  linearFactor?: number;

  /* ── Unidades ──────────────────────────────────────────────────────────── */
  /** DIMDEC — decimales de la medida. */
  precision?: number;
  /** DIMZIN — supresión de ceros (4=iniciales, 8=finales, 12=ambos). */
  zeroSuppression?: CadDimensionZeroSuppression;
  /** DIMRND — redondeo de la medida (0 = sin redondeo). */
  roundTo?: number;
  /** DIMPOST (antes del separador) — prefijo del texto de medida. */
  prefix?: string;
  /** DIMPOST (después del separador) — sufijo del texto de medida. */
  suffix?: string;
  /** Unidad de presentación de la medida (junto a DIMLFAC cubre DIMALTF/UNIT). */
  units?: "mm" | "cm" | "m" | "in" | "ft";
}

/** Defaults del estilo `Standard`: los mismos números que el kernel dibuja hoy. */
export const CAD_DIMENSION_STYLE_DEFAULTS: Required<
  Pick<
    CadDimensionStyleDefinition,
    | "textStyle"
    | "textHeight"
    | "textGap"
    | "textVertical"
    | "textJustification"
    | "textInsideHorizontal"
    | "textOutsideHorizontal"
    | "arrowhead"
    | "separateArrowheads"
    | "arrowSize"
    | "extensionOvershoot"
    | "extensionGap"
    | "baselineSpacing"
    | "forceLineInside"
    | "forceTextInside"
    | "overallScale"
    | "linearFactor"
    | "precision"
    | "zeroSuppression"
    | "roundTo"
  >
> = {
  textStyle: "Standard",
  textHeight: 120,
  textGap: 90,
  textVertical: "above",
  textJustification: "centered",
  textInsideHorizontal: false,
  textOutsideHorizontal: false,
  arrowhead: "closed-filled",
  separateArrowheads: false,
  arrowSize: 180,
  extensionOvershoot: 120,
  extensionGap: 40,
  baselineSpacing: 380,
  forceLineInside: false,
  forceTextInside: false,
  overallScale: 1,
  linearFactor: 1,
  precision: 2,
  zeroSuppression: "none",
  roundTo: 0,
};

/**
 * Resuelve la definición EFECTIVA de un estilo por nombre: defaults de
 * `Standard` ← `Standard` del documento ← estilo nombrado ← su subestilo de
 * familia (`NOMBRE$n`, Ola I) cuando se dice para qué tipo de cota se
 * resuelve. Un nombre que el documento no define resuelve a `Standard` (misma
 * tolerancia que AutoCAD con un DIMSTYLE ausente: la cota no se queda sin
 * dibujar).
 */
export function resolveCadDimensionStyle(
  styles: CadStyleTable | undefined,
  name: string | undefined,
  kind?: CadDimensionFamilyKind,
): CadDimensionStyleDefinition {
  const table = styles?.dimension ?? {};
  const standard = table.Standard ?? {};
  const named = name && name !== "Standard" ? (table[name] ?? {}) : {};
  const family = cadDimensionFamilyFor(kind);
  const sub = family ? (table[cadDimensionSubStyleName(name ?? "Standard", family)] ?? {}) : {};
  return { ...CAD_DIMENSION_STYLE_DEFAULTS, ...standard, ...named, ...sub };
}

/**
 * Subconjunto que se HORNEA en la entidad al crear (o al re-aplicar): son los
 * campos que el esquema de entidad `dimension` soporta hoy y los que el DXF
 * transporta como override por XDATA. DIMSCALE multiplica los tamaños al
 * hornear — así un solo número escala flechas, huecos y separaciones, que es
 * exactamente para lo que existe.
 */
export function cadDimensionStyleBake(
  definition: CadDimensionStyleDefinition,
): {
  precision?: number;
  units?: "mm" | "cm" | "m" | "in" | "ft";
  prefix?: string;
  suffix?: string;
  arrowhead?: CadDimensionArrowhead;
  arrowSize?: number;
  extensionGap?: number;
  extensionOvershoot?: number;
  textGap?: number;
  /* ── Esquema 10: lo que hasta ahora se definía y no se pintaba ─────────── */
  textHeight?: number;
  textStyle?: string;
  textColor?: string;
  dimLineColor?: string;
  extensionLineColor?: string;
  textVertical?: "centered" | "above";
  textJustification?: "centered" | "first" | "second";
} {
  const scale = definition.overallScale ?? 1;
  const scaled = (value: number | undefined) =>
    value === undefined ? undefined : value * scale;
  const emit = <T>(value: T | undefined, key: string) =>
    value === undefined ? {} : { [key]: value };
  return {
    ...emit(definition.precision, "precision"),
    ...emit(definition.units, "units"),
    ...emit(definition.prefix, "prefix"),
    ...emit(definition.suffix, "suffix"),
    ...emit(definition.arrowhead, "arrowhead"),
    ...emit(scaled(definition.arrowSize), "arrowSize"),
    ...emit(scaled(definition.extensionGap), "extensionGap"),
    ...emit(scaled(definition.extensionOvershoot), "extensionOvershoot"),
    ...emit(scaled(definition.textGap), "textGap"),
    /*
     * ESQUEMA 10. Hasta aquí, un despacho podía fijar su altura de texto, sus
     * colores y la posición del rótulo, guardarlo, verlo viajar por DXF… y el
     * plano salía exactamente igual. Poder fijar una norma que no se aplica es
     * no poder fijarla. Estos siete campos son los que faltaban para que
     * DIMSTYLE gobierne el DIBUJO y no sólo la tabla.
     *
     * La altura escala con DIMSCALE como los demás tamaños; los colores y las
     * posiciones no, porque no son medidas.
     */
    ...emit(scaled(definition.textHeight), "textHeight"),
    ...emit(definition.textStyle, "textStyle"),
    ...emit(definition.textColor, "textColor"),
    ...emit(definition.dimLineColor, "dimLineColor"),
    ...emit(definition.extensionLineColor, "extensionLineColor"),
    ...emit(definition.textVertical, "textVertical"),
    ...emit(definition.textJustification, "textJustification"),
  };
}

/** Etiquetas es-MX por campo, con su DIMVAR — para `DIMSTYLE → Comparar`. */
const FIELD_LABELS: ReadonlyArray<[keyof CadDimensionStyleDefinition, string]> = [
  ["textStyle", "estilo de texto (DIMTXSTY)"],
  ["textHeight", "altura de texto (DIMTXT)"],
  ["textGap", "separación de texto (DIMGAP)"],
  ["textVertical", "posición vertical (DIMTAD)"],
  ["textJustification", "posición horizontal (DIMJUST)"],
  ["textInsideHorizontal", "texto interior horizontal (DIMTIH)"],
  ["textOutsideHorizontal", "texto exterior horizontal (DIMTOH)"],
  ["textColor", "color de texto (DIMCLRT)"],
  ["arrowhead", "terminador (DIMBLK)"],
  ["arrowheadFirst", "terminador 1 (DIMBLK1)"],
  ["arrowheadSecond", "terminador 2 (DIMBLK2)"],
  ["separateArrowheads", "terminadores separados (DIMSAH)"],
  ["arrowSize", "tamaño de flecha (DIMASZ)"],
  ["extensionOvershoot", "exceso de extensión (DIMEXE)"],
  ["extensionGap", "hueco de extensión (DIMEXO)"],
  ["baselineSpacing", "separación de línea base (DIMDLI)"],
  ["dimLineColor", "color de línea de cota (DIMCLRD)"],
  ["extensionLineColor", "color de extensiones (DIMCLRE)"],
  ["dimLineWeight", "grosor de línea de cota (DIMLWD)"],
  ["extensionLineWeight", "grosor de extensiones (DIMLWE)"],
  ["forceLineInside", "línea forzada dentro (DIMTOFL)"],
  ["forceTextInside", "texto forzado dentro (DIMTIX)"],
  ["overallScale", "escala global (DIMSCALE)"],
  ["linearFactor", "factor lineal (DIMLFAC)"],
  ["precision", "decimales (DIMDEC)"],
  ["zeroSuppression", "supresión de ceros (DIMZIN)"],
  ["roundTo", "redondeo (DIMRND)"],
  ["prefix", "prefijo (DIMPOST)"],
  ["suffix", "sufijo (DIMPOST)"],
  ["units", "unidad de medida"],
];

/**
 * Diferencias EFECTIVAS entre dos estilos, campo a campo y en el vocabulario
 * del dibujante. Compara las definiciones resueltas: lo que de verdad
 * gobernaría una cota, no el subconjunto que alguien tecleó.
 */
export function cadCompareDimensionStyles(
  styles: CadStyleTable | undefined,
  nameA: string,
  nameB: string,
): string[] {
  const a = resolveCadDimensionStyle(styles, nameA);
  const b = resolveCadDimensionStyle(styles, nameB);
  const differences: string[] = [];
  for (const [key, label] of FIELD_LABELS) {
    const left = a[key];
    const right = b[key];
    if (left === right) continue;
    if (left === undefined && right === undefined) continue;
    differences.push(
      `${label}: ${formatValue(left)} → ${formatValue(right)}`,
    );
  }
  return differences;
}

function formatValue(value: unknown): string {
  if (value === undefined) return "(sin definir)";
  if (typeof value === "boolean") return value ? "sí" : "no";
  return String(value);
}

/* ───────────────────────── Códec DXF (tabla DIMSTYLE) ─────────────────────── */

/**
 * Tipo de cada campo, para el códec clave=valor de la XDATA: el escritor y el
 * lector comparten ESTA tabla, así que no pueden divergir en silencio.
 */
const FIELD_KINDS: Record<keyof CadDimensionStyleDefinition, "number" | "boolean" | "string"> = {
  textStyle: "string",
  textHeight: "number",
  textGap: "number",
  textVertical: "string",
  textJustification: "string",
  textInsideHorizontal: "boolean",
  textOutsideHorizontal: "boolean",
  textColor: "string",
  arrowhead: "string",
  arrowheadFirst: "string",
  arrowheadSecond: "string",
  separateArrowheads: "boolean",
  arrowSize: "number",
  extensionOvershoot: "number",
  extensionGap: "number",
  baselineSpacing: "number",
  dimLineColor: "string",
  extensionLineColor: "string",
  dimLineWeight: "number",
  extensionLineWeight: "number",
  forceLineInside: "boolean",
  forceTextInside: "boolean",
  overallScale: "number",
  linearFactor: "number",
  precision: "number",
  zeroSuppression: "string",
  roundTo: "number",
  prefix: "string",
  suffix: "string",
  units: "string",
};

/** Campos que son LONGITUDES de modelo (se reescalan al importar un DXF). */
export const CAD_DIMENSION_STYLE_LENGTH_FIELDS = [
  "textHeight",
  "textGap",
  "arrowSize",
  "extensionOvershoot",
  "extensionGap",
  "baselineSpacing",
] as const;

/** clave=valor de la XDATA VALLE_DIM de una entrada DIMSTYLE. */
export function cadDimensionStyleToEntries(
  definition: CadDimensionStyleDefinition,
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const key of Object.keys(FIELD_KINDS) as Array<keyof CadDimensionStyleDefinition>) {
    const value = definition[key];
    if (value === undefined) continue;
    entries.push([key, String(value)]);
  }
  return entries;
}

/** Reconstruye la definición desde clave=valor, con tipos de la tabla. */
export function cadDimensionStyleFromEntries(
  entries: Iterable<[string, string]>,
): CadDimensionStyleDefinition {
  const definition: Record<string, unknown> = {};
  for (const [key, raw] of entries) {
    const kind = FIELD_KINDS[key as keyof CadDimensionStyleDefinition];
    if (!kind) continue;
    if (kind === "number") {
      const value = Number(raw);
      if (Number.isFinite(value)) definition[key] = value;
    } else if (kind === "boolean") {
      definition[key] = raw === "true";
    } else if (raw.length > 0) {
      definition[key] = raw;
    }
  }
  return definition as CadDimensionStyleDefinition;
}

/**
 * Pares DXF ESTÁNDAR de una entrada DIMSTYLE (los DIMVARs con código propio).
 * Es la cara del fichero para lectores ajenos; la fidelidad exacta propia
 * viaja aparte por XDATA. Los colores sólo se escriben si ya son un índice
 * ACI (un CSS `#rrggbb` no tiene código estándar y va sólo en la XDATA).
 */
export function cadDimensionStyleStandardPairs(
  definition: CadDimensionStyleDefinition,
): Array<[number, string | number]> {
  const pairs: Array<[number, string | number]> = [];
  const push = (code: number, value: string | number | undefined) => {
    if (value !== undefined) pairs.push([code, value]);
  };
  const flag = (value: boolean | undefined) =>
    value === undefined ? undefined : value ? 1 : 0;
  const aci = (value: string | undefined) =>
    value !== undefined && /^\d{1,3}$/u.test(value) ? Number(value) : undefined;

  if (definition.prefix !== undefined || definition.suffix !== undefined)
    push(3, `${definition.prefix ?? ""}<>${definition.suffix ?? ""}`);
  push(40, definition.overallScale);
  push(41, definition.arrowSize);
  push(42, definition.extensionGap);
  push(43, definition.baselineSpacing);
  push(44, definition.extensionOvershoot);
  push(45, definition.roundTo);
  push(73, flag(definition.textInsideHorizontal));
  push(74, flag(definition.textOutsideHorizontal));
  push(77, definition.textVertical === undefined ? undefined : definition.textVertical === "above" ? 1 : 0);
  push(
    78,
    definition.zeroSuppression === undefined
      ? undefined
      : { none: 0, leading: 4, trailing: 8, both: 12 }[definition.zeroSuppression],
  );
  push(140, definition.textHeight);
  push(144, definition.linearFactor);
  push(147, definition.textGap);
  push(172, flag(definition.forceLineInside));
  push(173, flag(definition.separateArrowheads));
  push(174, flag(definition.forceTextInside));
  push(176, aci(definition.dimLineColor));
  push(177, aci(definition.extensionLineColor));
  push(178, aci(definition.textColor));
  push(271, definition.precision);
  push(
    280,
    definition.textJustification === undefined
      ? undefined
      : { centered: 0, first: 1, second: 2 }[definition.textJustification],
  );
  push(371, definition.dimLineWeight);
  push(372, definition.extensionLineWeight);
  return pairs;
}

/**
 * Definición desde los pares ESTÁNDAR de un fichero ajeno (sin XDATA nuestra).
 * Es deliberadamente tolerante: un DIMSTYLE de otro CAD trae lo que trae.
 */
export function cadDimensionStyleFromStandardPairs(
  pairs: Iterable<[number, string]>,
): CadDimensionStyleDefinition {
  const definition: Record<string, unknown> = {};
  const numberField: Record<number, keyof CadDimensionStyleDefinition> = {
    40: "overallScale",
    41: "arrowSize",
    42: "extensionGap",
    43: "baselineSpacing",
    44: "extensionOvershoot",
    45: "roundTo",
    140: "textHeight",
    144: "linearFactor",
    147: "textGap",
    271: "precision",
    371: "dimLineWeight",
    372: "extensionLineWeight",
  };
  const flagField: Record<number, keyof CadDimensionStyleDefinition> = {
    73: "textInsideHorizontal",
    74: "textOutsideHorizontal",
    172: "forceLineInside",
    173: "separateArrowheads",
    174: "forceTextInside",
  };
  for (const [code, raw] of pairs) {
    const value = Number(raw);
    const asNumber = numberField[code];
    if (asNumber && Number.isFinite(value)) {
      definition[asNumber] = value;
      continue;
    }
    const asFlag = flagField[code];
    if (asFlag && Number.isFinite(value)) {
      definition[asFlag] = value !== 0;
      continue;
    }
    if (code === 3 && raw.includes("<>")) {
      const [prefix, suffix] = raw.split("<>", 2);
      if (prefix) definition.prefix = prefix;
      if (suffix) definition.suffix = suffix;
    } else if (code === 77 && Number.isFinite(value)) {
      definition.textVertical = value >= 1 ? "above" : "centered";
    } else if (code === 78 && Number.isFinite(value)) {
      definition.zeroSuppression =
        value >= 12 ? "both" : value >= 8 ? "trailing" : value >= 4 ? "leading" : "none";
    } else if (code === 280 && Number.isFinite(value)) {
      definition.textJustification = value === 1 ? "first" : value === 2 ? "second" : "centered";
    } else if (code === 176 || code === 177 || code === 178) {
      if (Number.isFinite(value) && value > 0) {
        const key = code === 176 ? "dimLineColor" : code === 177 ? "extensionLineColor" : "textColor";
        definition[key] = String(Math.round(value));
      }
    }
  }
  return definition as CadDimensionStyleDefinition;
}
