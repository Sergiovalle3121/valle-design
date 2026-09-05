/**
 * COMPARE: el diff de ENTIDADES entre dos dibujos cualesquiera.
 *
 * ## Lo que había, y por qué no servía
 *
 * `snapshots.ts` compara dos instantáneas del MISMO dibujo por su hash y
 * contesta `changed: true|false`. Eso responde «¿cambió algo?» y ninguna de las
 * preguntas que un dibujante hace de verdad: qué se añadió, qué desapareció,
 * qué se movió y qué sólo cambió de capa. Y no compara dos ARCHIVOS: un hash
 * de documento cambia por el número de versión, por el historial y por el orden
 * de serialización, así que dos dibujos con la misma geometría dan hashes
 * distintos y el diff diría «todo cambió».
 *
 * Este módulo compara entidad contra entidad. No muta nada y no dibuja nada:
 * las nubes de revisión son `compare-revision-clouds.ts` y la orden es
 * `engine/commands/compare-drawings.ts`.
 *
 * ## El emparejamiento tiene DOS pasadas, y la segunda es la que importa
 *
 * 1. **Por id.** Dos entidades con el mismo id son la misma entidad, y su
 *    comparación cuenta el cambio real: se movió, cambió de capa, las dos, o
 *    ninguna.
 * 2. **Por firma geométrica normalizada**, para lo que quedó suelto. Un dibujo
 *    que pasó por un DXF de ida y vuelta, por una explosión o por un
 *    copiar-pegar trae los mismos objetos con ids NUEVOS. Sin esta pasada, ese
 *    dibujo daría «todo borrado y todo añadido» — que es literalmente cierto
 *    mirando los ids y completamente inútil mirando el plano.
 *
 * La firma normaliza dos cosas: los números se redondean a una REJILLA de
 * tolerancia y la línea se firma con sus extremos ordenados, porque una línea
 * dibujada al revés es la misma línea.
 *
 * Se redondea a rejilla a propósito, y aquí es una decisión distinta de la de
 * OVERKILL: aquel agrupa por REPRESENTANTE —el primer valor visto funda su
 * grupo— para no tener fronteras, y el precio es que el resultado depende del
 * orden en que llegan las entidades. Comparando dos documentos ese precio no se
 * puede pagar: el emparejamiento tiene que salir igual mirando A→B que B→A, y
 * con representantes la firma de una entidad de B dependería de qué entidades
 * de A se hubieran visto antes. La rejilla tiene frontera —dos valores
 * separados 0,9·tolerancia pueden caer en cubos distintos— y esa frontera
 * produce una diferencia DE MÁS, que se ve y se descarta; el orden variable
 * produce parejas distintas en cada pasada, que no se ve.
 *
 * ## Geometría y propiedad son cambios DISTINTOS
 *
 * Mover un muro 250 mm y cambiarle la capa a un texto no son la misma noticia,
 * y una lista que los mezcla obliga a abrir los dos para saber cuál es cuál.
 * Aquí se separan: `geometryChanged` y `propertyChanges`, y una entidad
 * modificada puede traer los dos.
 *
 * Las propiedades comparadas son SEIS y están enumeradas: capa, color, tipo de
 * línea, grosor, estilo y texto. Todo lo demás —coordenadas, radios, vértices,
 * y también una nota o una etiqueta— entra en la firma geométrica. Es una
 * partición EXHAUSTIVA a propósito: un campo que no estuviera en ninguna de las
 * dos mitades cambiaría sin que el diff lo viese, y una diferencia invisible es
 * mucho peor que una mal clasificada.
 */
import type { CadDocument, CadEntity } from "./cad-document";

/** Los dos lados de la comparación sólo necesitan sus entidades. */
export type CadCompareSide = Pick<CadDocument, "entities">;

export type CadCompareKind = "added" | "deleted" | "modified" | "equal";

export type CadComparePropertyName =
  | "layer"
  | "color"
  | "linetype"
  | "lineweight"
  | "style"
  | "text";

export interface CadComparePropertyChange {
  property: CadComparePropertyName;
  /** Cómo se llama en la línea de comandos, en español. */
  label: string;
  before: string;
  after: string;
}

export interface CadCompareEntry {
  kind: CadCompareKind;
  /** El id del lado que existe; el del dibujo nuevo cuando existen los dos. */
  entityId: string;
  type: string;
  /** La entidad del dibujo BASE. Ausente en un añadido. */
  before?: CadEntity;
  /** La entidad del dibujo NUEVO. Ausente en un borrado. */
  after?: CadEntity;
  /** Cómo se emparejaron. Ausente cuando no hay pareja. */
  matchedBy?: "id" | "signature";
  geometryChanged: boolean;
  propertyChanges: readonly CadComparePropertyChange[];
}

export interface CadCompareSummary {
  /** Sólo en el dibujo nuevo. */
  added: number;
  /** Sólo en el dibujo base. */
  deleted: number;
  modified: number;
  equal: number;
  /** De los modificados, cuántos movieron geometría y cuántos tocaron propiedades. */
  geometryModified: number;
  propertyModified: number;
  beforeEntities: number;
  afterEntities: number;
  /**
   * El cuadre: `añadidos + borrados + 2·(modificados + iguales)`.
   *
   * No es la suma llana, y la diferencia no es un tecnicismo: una entidad
   * modificada ocupa UN sitio en cada documento, así que consume dos de las
   * entidades contadas entre los dos lados. Sumando llanamente, comparar un
   * dibujo de 10 objetos consigo mismo daría 10 frente a un total de 20 y
   * parecería que faltan diez. Con este cuadre, ninguna entidad de ninguno de
   * los dos lados puede quedarse fuera de la clasificación sin que la cuenta
   * lo delate.
   */
  accountedSides: number;
  beforeAfterEntities: number;
  balanced: boolean;
}

export interface CadCompareResult {
  entries: readonly CadCompareEntry[];
  summary: CadCompareSummary;
}

export interface CadCompareOptions {
  /**
   * Rejilla de la firma geométrica, en unidades de dibujo. Por defecto 1e-6:
   * suficiente para absorber el ruido de coma flotante de un DXF de ida y
   * vuelta y demasiado fino para fundir dos objetos que el dibujante distingue.
   */
  tolerance?: number;
}

const DEFAULT_TOLERANCE = 1e-6;

// ---------------------------------------------------------------------------
// Firma geométrica
// ---------------------------------------------------------------------------

/**
 * Los campos que NO son geometría: se comparan aparte, como propiedades.
 *
 * `context` no está en la lista porque se poda por dentro (`geometryContext`):
 * su presentación es propiedad, su cota de importación es ruido, y el resto
 * —elevación, normal, metadatos de asociatividad— sí es del dibujo.
 */
const PROPERTY_FIELDS = new Set(["layer", "color", "style", "text", "linetype", "lineweight"]);

/** Lo que se poda de `context` antes de firmar. */
const CONTEXT_NOISE = new Set(["presentation", "handle", "provenance"]);

function gridKey(value: number, tolerance: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (tolerance <= 0) return String(value + 0);
  // El ÍNDICE de la celda, no el valor reconstruido: `round(v/t)*t` vuelve a
  // introducir ruido de coma flotante justo en el sitio donde se está
  // intentando quitarlo.
  const cell = Math.round(value / tolerance);
  return Object.is(cell, -0) ? "0" : String(cell);
}

function canonical(value: unknown, tolerance: number): string {
  if (value === null || value === undefined) return "~";
  if (typeof value === "number") return gridKey(value, tolerance);
  if (typeof value === "boolean") return value ? "!" : "¡";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item, tolerance)).join(",")}]`;
  if (typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${key}:${canonical(item, tolerance)}`)
      .join(",")}}`;
  return JSON.stringify(String(value));
}

function geometryContext(entity: CadEntity): unknown {
  const context = "context" in entity ? entity.context : undefined;
  if (!context) return undefined;
  const kept = Object.entries(context).filter(
    ([key, value]) => !CONTEXT_NOISE.has(key) && value !== undefined,
  );
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/**
 * Firma de la GEOMETRÍA de una entidad: su tipo más todo lo que no es una de
 * las seis propiedades con nombre, redondeado a la rejilla.
 *
 * La LÍNEA es el único caso especial y con motivo: sus extremos se ordenan
 * antes de firmar, porque una línea dibujada de B a A es la misma línea y sin
 * ordenar la segunda pasada de emparejamiento no la reconocería. La polilínea
 * NO se normaliza al revés: invertir sus vértices también invierte el signo de
 * cada `bulge`, y una «normalización» que no lo tuviera en cuenta emparejaría
 * una curva con su reflejo.
 */
export function cadCompareGeometrySignature(
  entity: CadEntity,
  tolerance: number = DEFAULT_TOLERANCE,
): string {
  const source: Record<string, unknown> = { ...(entity as unknown as Record<string, unknown>) };
  delete source.id;
  for (const field of PROPERTY_FIELDS) delete source[field];
  const context = geometryContext(entity);
  if (context === undefined) delete source.context;
  else source.context = context;

  if (entity.type === "line") {
    const a = entity.start;
    const b = entity.end;
    const swap = b.x < a.x || (b.x === a.x && (b.y < a.y || (b.y === a.y && (b.z ?? 0) < (a.z ?? 0))));
    source.start = swap ? b : a;
    source.end = swap ? a : b;
  }

  return `${entity.type}#${canonical(source, tolerance)}`;
}

// ---------------------------------------------------------------------------
// Propiedades
// ---------------------------------------------------------------------------

const PROPERTY_LABEL: Record<CadComparePropertyName, string> = {
  layer: "capa",
  color: "color",
  linetype: "tipo de línea",
  lineweight: "grosor",
  style: "estilo",
  text: "texto",
};

/** «PorCapa» es el valor real de lo no declarado, no un relleno. */
const BY_LAYER = "PorCapa";

const SOURCE_LABEL: Record<string, string> = {
  byLayer: BY_LAYER,
  byBlock: "PorBloque",
  explicit: "explícito",
};

function readString(entity: CadEntity, field: string): string {
  const value = (entity as unknown as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

/** Las seis propiedades con nombre de una entidad, ya en texto legible. */
export function cadComparePropertyValues(entity: CadEntity): Record<CadComparePropertyName, string> {
  const presentation = "context" in entity ? entity.context?.presentation : undefined;
  const color =
    presentation?.color?.value ??
    (presentation?.color ? SOURCE_LABEL[presentation.color.source] : undefined) ??
    readString(entity, "color");
  const linetype =
    presentation?.linetype?.value ??
    (presentation?.linetype ? SOURCE_LABEL[presentation.linetype.source] : undefined) ??
    readString(entity, "linetype");
  const lineweight =
    presentation?.lineweight?.value !== undefined
      ? String(presentation.lineweight.value)
      : presentation?.lineweight
        ? SOURCE_LABEL[presentation.lineweight.source]
        : "";
  return {
    layer: "layer" in entity && typeof entity.layer === "string" ? entity.layer : "",
    color: color || BY_LAYER,
    linetype: linetype || BY_LAYER,
    lineweight: lineweight || BY_LAYER,
    style: readString(entity, "style"),
    text: readString(entity, "text"),
  };
}

/** Qué propiedades con nombre difieren entre dos entidades. */
export function cadComparePropertyChanges(
  before: CadEntity,
  after: CadEntity,
): CadComparePropertyChange[] {
  const a = cadComparePropertyValues(before);
  const b = cadComparePropertyValues(after);
  const changes: CadComparePropertyChange[] = [];
  for (const property of Object.keys(PROPERTY_LABEL) as CadComparePropertyName[])
    if (a[property] !== b[property])
      changes.push({
        property,
        label: PROPERTY_LABEL[property],
        before: a[property],
        after: b[property],
      });
  return changes;
}

// ---------------------------------------------------------------------------
// El diff
// ---------------------------------------------------------------------------

function classify(
  before: CadEntity,
  after: CadEntity,
  matchedBy: "id" | "signature",
  tolerance: number,
): CadCompareEntry {
  const geometryChanged =
    matchedBy === "signature"
      ? false
      : cadCompareGeometrySignature(before, tolerance) !==
        cadCompareGeometrySignature(after, tolerance);
  const propertyChanges = cadComparePropertyChanges(before, after);
  return {
    kind: geometryChanged || propertyChanges.length > 0 ? "modified" : "equal",
    entityId: after.id,
    type: after.type,
    before,
    after,
    matchedBy,
    geometryChanged,
    propertyChanges,
  };
}

/**
 * Compara dos dibujos entidad a entidad.
 *
 * `before` es el dibujo BASE y `after` el que se está mirando: lo que sólo está
 * en `after` es un AÑADIDO y lo que sólo está en `before` es un BORRADO. La
 * orden COMPARE pasa el dibujo ajeno como base y el abierto como nuevo, que es
 * lo que hace que «añadido» signifique «esto lo puse yo».
 *
 * Las entradas salen en un orden estable y explicable: primero las del dibujo
 * base en su orden de documento (borrados, modificados e iguales emparejados por
 * cualquiera de las dos pasadas), después los añadidos en el orden del nuevo.
 * Sin un orden fijo, dos ejecuciones sobre los mismos documentos podrían
 * agrupar las nubes de revisión de forma distinta.
 */
export function cadCompareDocuments(
  before: CadCompareSide,
  after: CadCompareSide,
  options: CadCompareOptions = {},
): CadCompareResult {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;

  const afterById = new Map<string, CadEntity>();
  for (const entity of after.entities) afterById.set(entity.id, entity);

  const pairedAfter = new Set<string>();
  /**
   * Un hueco por cada entidad del dibujo base, en su orden de documento. La
   * entrada real se escribe tras la segunda pasada, pero su SITIO se aparta
   * ahora: así el orden de salida no depende de qué emparejamientos por firma
   * hayan salido, que es lo que haría que dos ejecuciones agruparan las nubes
   * de revisión de forma distinta.
   */
  const slots: (CadCompareEntry | null)[] = [];
  /** Lo del lado base que no encontró pareja por id: candidato a la 2ª pasada. */
  const loose: { entity: CadEntity; at: number }[] = [];

  for (const entity of before.entities) {
    const twin = afterById.get(entity.id);
    if (twin && !pairedAfter.has(twin.id)) {
      pairedAfter.add(twin.id);
      slots.push(classify(entity, twin, "id", tolerance));
      continue;
    }
    loose.push({ entity, at: slots.length });
    slots.push(null);
  }

  // Segunda pasada: firma geométrica normalizada, sobre lo que quedó suelto.
  const looseBySignature = new Map<string, number[]>();
  loose.forEach((item, index) => {
    const signature = cadCompareGeometrySignature(item.entity, tolerance);
    const queue = looseBySignature.get(signature);
    if (queue) queue.push(index);
    else looseBySignature.set(signature, [index]);
  });
  const takenLoose = new Set<number>();
  const added: CadEntity[] = [];

  for (const entity of after.entities) {
    if (pairedAfter.has(entity.id)) continue;
    const signature = cadCompareGeometrySignature(entity, tolerance);
    const queue = looseBySignature.get(signature);
    const index = queue?.shift();
    if (index === undefined) {
      added.push(entity);
      continue;
    }
    takenLoose.add(index);
    pairedAfter.add(entity.id);
    slots[loose[index].at] = classify(loose[index].entity, entity, "signature", tolerance);
  }

  loose.forEach((item, index) => {
    if (takenLoose.has(index)) return;
    slots[item.at] = {
      kind: "deleted",
      entityId: item.entity.id,
      type: item.entity.type,
      before: item.entity,
      geometryChanged: false,
      propertyChanges: [],
    };
  });

  const entries: CadCompareEntry[] = slots.filter((slot): slot is CadCompareEntry => slot !== null);
  for (const entity of added)
    entries.push({
      kind: "added",
      entityId: entity.id,
      type: entity.type,
      after: entity,
      geometryChanged: false,
      propertyChanges: [],
    });

  return { entries, summary: summarize(entries, before, after) };
}

function summarize(
  entries: readonly CadCompareEntry[],
  before: CadCompareSide,
  after: CadCompareSide,
): CadCompareSummary {
  let addedCount = 0;
  let deletedCount = 0;
  let modified = 0;
  let equal = 0;
  let geometryModified = 0;
  let propertyModified = 0;
  for (const entry of entries) {
    if (entry.kind === "added") addedCount += 1;
    else if (entry.kind === "deleted") deletedCount += 1;
    else if (entry.kind === "equal") equal += 1;
    else {
      modified += 1;
      if (entry.geometryChanged) geometryModified += 1;
      if (entry.propertyChanges.length > 0) propertyModified += 1;
    }
  }
  const accountedSides = addedCount + deletedCount + 2 * (modified + equal);
  const beforeAfterEntities = before.entities.length + after.entities.length;
  return {
    added: addedCount,
    deleted: deletedCount,
    modified,
    equal,
    geometryModified,
    propertyModified,
    beforeEntities: before.entities.length,
    afterEntities: after.entities.length,
    accountedSides,
    beforeAfterEntities,
    balanced: accountedSides === beforeAfterEntities,
  };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * El renglón que la orden imprime. Dice las cuatro clases SIEMPRE, incluso las
 * que salen a cero: un informe que omite lo vacío obliga a recordar cuántas
 * clases había para saber si falta una.
 */
export function cadCompareHeadline(summary: CadCompareSummary): string {
  const detail =
    summary.modified > 0
      ? ` (${plural(summary.geometryModified, "de geometría", "de geometría")}, ${plural(
          summary.propertyModified,
          "de propiedad",
          "de propiedad",
        )})`
      : "";
  return (
    `${plural(summary.added, "añadida", "añadidas")}, ` +
    `${plural(summary.deleted, "borrada", "borradas")}, ` +
    `${plural(summary.modified, "modificada", "modificadas")}${detail} y ` +
    `${plural(summary.equal, "igual", "iguales")}.`
  );
}

/** Detalle por entidad, para el `?` de la orden y para el informe. */
export function cadCompareEntryLine(entry: CadCompareEntry): string {
  if (entry.kind === "added") return `+ ${entry.type} ${entry.entityId}: sólo en el dibujo abierto.`;
  if (entry.kind === "deleted") return `- ${entry.type} ${entry.entityId}: sólo en el dibujo comparado.`;
  if (entry.kind === "equal")
    return `= ${entry.type} ${entry.entityId}: igual${entry.matchedBy === "signature" ? " (mismo objeto con otro id)" : ""}.`;
  const parts: string[] = [];
  if (entry.geometryChanged) parts.push("geometría");
  for (const change of entry.propertyChanges)
    parts.push(`${change.label} ${change.before || "—"} → ${change.after || "—"}`);
  return `~ ${entry.type} ${entry.entityId}: ${parts.join("; ")}.`;
}
