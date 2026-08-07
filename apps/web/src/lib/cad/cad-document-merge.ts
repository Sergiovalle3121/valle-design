/**
 * Fusión a tres vías de un DOCUMENTO, no sólo de sus entidades.
 *
 * EL PROBLEMA QUE CIERRA. `mergeCadDocuments` fusionaba `entities` y clonaba el
 * resto del documento de `mine`. Un `CadDocument` tiene catorce secciones: las
 * doce restantes —capas, bloques, estilos, layouts, restricciones, referencias
 * externas, opacas, manifiesto de pérdida, publicaciones, metadatos, historial
 * y colaboración— se tomaban del lado propio sin mirar. Fusionar borraba en
 * silencio la capa, el bloque o el layout que hubiese creado la otra sesión.
 *
 * Y algo peor que borrar: una entidad SUYA sí entraba en la fusión, con su
 * `layer` apuntando a una capa que sólo existía en su tabla. El resultado es un
 * documento con una referencia colgante, que el validador del servidor rechaza
 * al guardar — así que la fusión terminaba en un error opaco en vez de en un
 * plano.
 *
 * LA REGLA, IGUAL PARA TODAS LAS SECCIONES.
 *
 *   mine == theirs → cualquiera
 *   mine == base   → theirs
 *   theirs == base → mine
 *   ambos distintos → colisión TIPADA, y la fusión no se declara aplicable
 *
 * Aplicarla por sección es lo que arregla la referencia colgante sin inventar
 * nada: una capa que la otra sesión AÑADIÓ no existe en `base` ni en `mine`, así
 * que la regla la trae consigo junto a las entidades que la usan. Sólo queda
 * colgante lo que alguien borró mientras el otro lo seguía usando, que es un
 * conflicto de verdad y se informa como tal.
 *
 * IDENTIDAD ESTABLE POR SECCIÓN. Las colecciones se emparejan por `id`; los
 * estilos, que viven en tablas anidadas, por `categoría/nombre`. Emparejar por
 * posición haría que insertar una capa al principio renombrase todas las demás.
 */
import type {
  CadChange,
  CadCollaborationState,
  CadDocument,
  CadDocumentMeta,
  CadLossManifestEntry,
  CadStyleTable,
} from "./cad-document";

/** Secciones del documento que se fusionan con identidad propia. */
export type CadMergeSection =
  | "meta"
  | "layers"
  | "entities"
  | "styles"
  | "blocks"
  | "constraints"
  | "paperSpaces"
  | "externalReferences"
  | "unsupportedEntities"
  | "publications"
  | "cells";

/**
 * Un recurso que ambas ramas cambiaron de forma distinta. Lleva la sección, el
 * recurso, QUÉ cambió cada lado y qué depende de él: sin las dos últimas cosas,
 * elegir entre «lo mío» y «lo suyo» es elegir a ciegas.
 */
export interface CadSectionCollision {
  section: CadMergeSection;
  resourceId: string;
  /** `sección:recurso`. Es la clave con la que se resuelve. */
  key: string;
  reason: "both_added" | "both_modified" | "delete_modify";
  minePaths: string[];
  theirsPaths: string[];
  /** Ids que dejan de resolver si este recurso desaparece. */
  dependents: string[];
}

export type CadSectionResolution = { strategy: "mine" } | { strategy: "theirs" };

/**
 * Una referencia que el documento fusionado no puede resolver. No es un aviso
 * cosmético: es exactamente lo que el validador del servidor rechaza, así que
 * informarlo aquí evita ofrecer una fusión que sólo puede acabar en error.
 */
export interface CadMergeReferenceBreak {
  /** Sección del recurso QUE FALTA. */
  section: CadMergeSection;
  resourceId: string;
  /** Quiénes se quedan huérfanos. */
  dependents: string[];
  detail: string;
}

export interface SectionMergeSink {
  collisions: CadSectionCollision[];
  unresolved: string[];
  applied: string[];
}

export function emptySectionSink(): SectionMergeSink {
  return { collisions: [], unresolved: [], applied: [] };
}

export function sectionKey(section: CadMergeSection, resourceId: string): string {
  return `${section}:${resourceId}`;
}

// ---------------------------------------------------------------------------
// Comparación estable (misma que usa el diff de entidades)
// ---------------------------------------------------------------------------

export function stableText(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableText).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableText(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function equal(left: unknown, right: unknown): boolean {
  return stableText(left) === stableText(right);
}

export function changedFieldPaths(
  left: unknown,
  right: unknown,
  prefix = "",
): string[] {
  if (equal(left, right)) return [];
  if (
    left === undefined ||
    right === undefined ||
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) ||
    Array.isArray(right)
  )
    return [prefix || "value"];
  const keys = new Set([
    ...Object.keys(left as Record<string, unknown>),
    ...Object.keys(right as Record<string, unknown>),
  ]);
  return [...keys].sort().flatMap((key) =>
    changedFieldPaths(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
      prefix ? `${prefix}.${key}` : key,
    ),
  );
}

function collisionReasonFor(
  baseItem: unknown,
  mineItem: unknown,
  theirsItem: unknown,
): CadSectionCollision["reason"] {
  if (baseItem === undefined) return "both_added";
  if (mineItem === undefined || theirsItem === undefined) return "delete_modify";
  return "both_modified";
}

// ---------------------------------------------------------------------------
// Fusión genérica de una colección con identidad estable
// ---------------------------------------------------------------------------

/**
 * Orden del resultado: primero el de `mine`, después lo que sólo trae `theirs`
 * en el orden de `theirs`. Ordenar por id alfabetizaría tablas que el usuario
 * compuso a mano (las capas y los layouts se muestran en su orden).
 */
function orderedValues<T>(
  merged: Map<string, T>,
  mineItems: readonly T[],
  theirsItems: readonly T[],
  keyOf: (item: T) => string,
): T[] {
  const out: T[] = [];
  const taken = new Set<string>();
  const push = (key: string) => {
    if (taken.has(key) || !merged.has(key)) return;
    taken.add(key);
    out.push(merged.get(key)!);
  };
  for (const item of mineItems) push(keyOf(item));
  for (const item of theirsItems) push(keyOf(item));
  for (const key of merged.keys()) push(key);
  return out;
}

export function mergeKeyedSection<T>(
  section: CadMergeSection,
  baseItems: readonly T[],
  mineItems: readonly T[],
  theirsItems: readonly T[],
  keyOf: (item: T) => string,
  dependentsOf: (resourceId: string) => string[],
  resolutions: Record<string, CadSectionResolution>,
  sink: SectionMergeSink,
): T[] {
  const base = new Map(baseItems.map((item) => [keyOf(item), item]));
  const mine = new Map(mineItems.map((item) => [keyOf(item), item]));
  const theirs = new Map(theirsItems.map((item) => [keyOf(item), item]));
  const merged = new Map(mine);
  const ids = [
    ...new Set([...base.keys(), ...mine.keys(), ...theirs.keys()]),
  ].sort();

  for (const id of ids) {
    const baseItem = base.get(id);
    const mineItem = mine.get(id);
    const theirsItem = theirs.get(id);
    // La otra sesión no tocó este recurso: se queda lo mío, sea lo que sea.
    if (equal(baseItem, theirsItem)) continue;
    if (equal(baseItem, mineItem) || equal(mineItem, theirsItem)) {
      if (theirsItem === undefined) merged.delete(id);
      else merged.set(id, structuredClone(theirsItem));
      continue;
    }
    const key = sectionKey(section, id);
    sink.collisions.push({
      section,
      resourceId: id,
      key,
      reason: collisionReasonFor(baseItem, mineItem, theirsItem),
      minePaths: changedFieldPaths(baseItem, mineItem),
      theirsPaths: changedFieldPaths(baseItem, theirsItem),
      dependents: dependentsOf(id),
    });
    const resolution = resolutions[key];
    if (!resolution) {
      // Sin decidir se conserva lo propio en el documento de previsualización,
      // pero la fusión NO se declara aplicable: ver `ok` en el resultado.
      sink.unresolved.push(key);
      continue;
    }
    const chosen = resolution.strategy === "mine" ? mineItem : theirsItem;
    if (chosen === undefined) merged.delete(id);
    else merged.set(id, structuredClone(chosen));
    sink.applied.push(key);
  }

  return orderedValues(merged, mineItems, theirsItems, keyOf);
}

// ---------------------------------------------------------------------------
// Secciones con forma propia
// ---------------------------------------------------------------------------

const STYLE_CATEGORIES = [
  "text",
  "dimension",
  "mleader",
  "table",
  "plot",
] as const;

type StyleCategory = (typeof STYLE_CATEGORIES)[number];

interface StyleRow {
  key: string;
  category: StyleCategory;
  name: string;
  value: unknown;
}

function styleRows(styles: CadStyleTable): StyleRow[] {
  const rows: StyleRow[] = [];
  for (const category of STYLE_CATEGORIES) {
    const table = (styles as unknown as Record<string, unknown>)[category];
    if (!table || typeof table !== "object") continue;
    for (const name of Object.keys(table as Record<string, unknown>).sort())
      rows.push({
        key: `${category}/${name}`,
        category,
        name,
        value: (table as Record<string, unknown>)[name],
      });
  }
  return rows;
}

/**
 * Los estilos se emparejan por `categoría/nombre` porque no tienen id: es la
 * identidad con la que el usuario los referencia desde las entidades.
 */
export function mergeStyles(
  base: CadStyleTable,
  mine: CadStyleTable,
  theirs: CadStyleTable,
  resolutions: Record<string, CadSectionResolution>,
  sink: SectionMergeSink,
): CadStyleTable {
  const rows = mergeKeyedSection(
    "styles",
    styleRows(base),
    styleRows(mine),
    styleRows(theirs),
    (row) => row.key,
    () => [],
    resolutions,
    sink,
  );
  const merged: CadStyleTable = {
    text: {},
    dimension: {},
    table: {},
    plot: {},
  };
  // `mleader` es opcional en el esquema: sólo se materializa si alguno de los
  // dos lados lo traía, para no cambiar la serialización de los documentos que
  // nunca lo tuvieron.
  if (mine.mleader !== undefined || theirs.mleader !== undefined)
    merged.mleader = {};
  for (const row of rows) {
    const table = (merged as unknown as Record<string, Record<string, unknown>>)[
      row.category
    ];
    if (!table) continue;
    table[row.name] = structuredClone(row.value);
  }
  return merged;
}

/**
 * `version` y `schema` son contadores monótonos: el máximo es siempre la
 * respuesta y no hay nada que preguntar. El resto de `meta` —unidad, huella y
 * rejilla— es contenido que el usuario compuso, y sí se decide a tres vías.
 */
export function mergeMeta(
  base: CadDocumentMeta,
  mine: CadDocumentMeta,
  theirs: CadDocumentMeta,
  resolutions: Record<string, CadSectionResolution>,
  sink: SectionMergeSink,
): CadDocumentMeta {
  const merged: CadDocumentMeta = {
    ...structuredClone(mine),
    version: Math.max(mine.version, theirs.version),
    schema: Math.max(mine.schema, theirs.schema),
  };
  const fields = ["unit", "footprintW", "footprintH", "gridSize"] as const;
  for (const field of fields) {
    const baseValue = base[field];
    const mineValue = mine[field];
    const theirsValue = theirs[field];
    if (equal(baseValue, theirsValue)) continue;
    if (equal(baseValue, mineValue) || equal(mineValue, theirsValue)) {
      assignMetaField(merged, field, theirsValue);
      continue;
    }
    const key = sectionKey("meta", field);
    sink.collisions.push({
      section: "meta",
      resourceId: field,
      key,
      reason: "both_modified",
      minePaths: [field],
      theirsPaths: [field],
      dependents: [],
    });
    const resolution = resolutions[key];
    if (!resolution) {
      sink.unresolved.push(key);
      continue;
    }
    assignMetaField(
      merged,
      field,
      resolution.strategy === "mine" ? mineValue : theirsValue,
    );
    sink.applied.push(key);
  }
  return merged;
}

function assignMetaField(
  meta: CadDocumentMeta,
  field: "unit" | "footprintW" | "footprintH" | "gridSize",
  value: string | number | undefined,
): void {
  if (value === undefined) {
    delete (meta as unknown as Record<string, unknown>)[field];
    return;
  }
  (meta as unknown as Record<string, unknown>)[field] = value;
}

/**
 * El historial y el manifiesto de pérdida son registros APEND-ONLY: describen
 * lo que ya pasó. Se unen sin preguntar porque quedarse con un lado sería
 * borrar hechos, no resolver un conflicto.
 */
export function mergeHistory(
  mine: readonly CadChange[],
  theirs: readonly CadChange[],
): CadChange[] {
  const seen = new Set<string>();
  const out: CadChange[] = [];
  for (const change of [...mine, ...theirs]) {
    const key = `${change.version}|${change.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...change });
  }
  return out.sort(
    (left, right) =>
      left.version - right.version || left.label.localeCompare(right.label),
  );
}

export function mergeLossManifest(
  mine: readonly CadLossManifestEntry[],
  theirs: readonly CadLossManifestEntry[],
): CadLossManifestEntry[] {
  const seen = new Set<string>();
  const out: CadLossManifestEntry[] = [];
  for (const entry of [...mine, ...theirs]) {
    const key = stableText(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(structuredClone(entry));
  }
  return out;
}

/**
 * POLÍTICA EXPLÍCITA DE COLABORACIÓN. Son metadatos de revisión —versiones
 * nombradas, hilos de comentarios, enlaces y auditoría—, no geometría. Se unen
 * por id y NUNCA generan colisión: bloquear la fusión de un plano porque dos
 * sesiones editaron el mismo comentario sería desproporcionado.
 *
 * Cuando el mismo id difiere en ambos lados gana el estado MÁS AVANZADO, que es
 * el único criterio que no retrocede trabajo de revisión: un hilo resuelto no
 * vuelve a abrirse y un enlace revocado no vuelve a estar vigente. Fuera de esos
 * dos casos gana `theirs`, que es lo que el servidor ya tiene confirmado.
 */
export function mergeCollaboration(
  mine: CadCollaborationState | undefined,
  theirs: CadCollaborationState | undefined,
): CadCollaborationState | undefined {
  if (!mine && !theirs) return undefined;
  const left = mine ?? { versions: [], threads: [], reviewLinks: [], audit: [] };
  const right =
    theirs ?? { versions: [], threads: [], reviewLinks: [], audit: [] };

  const unionById = <T extends { id: string }>(
    a: readonly T[],
    b: readonly T[],
    prefer: (mineItem: T, theirsItem: T) => T,
  ): T[] => {
    const out = new Map<string, T>();
    for (const item of a) out.set(item.id, structuredClone(item));
    for (const item of b) {
      const existing = out.get(item.id);
      out.set(
        item.id,
        existing ? structuredClone(prefer(existing, item)) : structuredClone(item),
      );
    }
    return [...out.values()];
  };

  return {
    versions: unionById(
      left.versions ?? [],
      right.versions ?? [],
      (_mineItem, theirsItem) => theirsItem,
    ).slice(-12),
    threads: unionById(left.threads ?? [], right.threads ?? [], (m, t) =>
      m.status === "resolved" ? m : t,
    ).slice(-500),
    reviewLinks: unionById(left.reviewLinks ?? [], right.reviewLinks ?? [], (m, t) =>
      m.revokedAt ? m : t,
    ).slice(-20),
    audit: unionById(
      left.audit ?? [],
      right.audit ?? [],
      (_mineItem, theirsItem) => theirsItem,
    )
      .sort((leftItem, rightItem) =>
        leftItem.at === rightItem.at
          ? leftItem.id.localeCompare(rightItem.id)
          : leftItem.at.localeCompare(rightItem.at),
      )
      .slice(-500),
  };
}

/**
 * Orden de dibujo fusionado: el propio primero, después lo que sólo trae la otra
 * sesión en SU orden, y al final cualquier id presente que no estuviera en
 * ninguna de las dos listas. Derivarlo de las entidades ordenadas por id
 * alfabetizaría el z-order del plano.
 */
export function mergeDrawOrder(
  mineIds: readonly string[],
  theirsIds: readonly string[],
  presentIds: readonly string[],
): string[] {
  const present = new Set(presentIds);
  const out: string[] = [];
  const taken = new Set<string>();
  const push = (id: string) => {
    if (taken.has(id) || !present.has(id)) return;
    taken.add(id);
    out.push(id);
  };
  for (const id of mineIds) push(id);
  for (const id of theirsIds) push(id);
  for (const id of presentIds) push(id);
  return out;
}

// ---------------------------------------------------------------------------
// Cierre referencial del documento fusionado
// ---------------------------------------------------------------------------

function insertedBlockNames(entities: readonly { type: string }[]): string[] {
  return entities
    .filter((entity): entity is { type: "insert"; block: string; id: string } =>
      entity.type === "insert",
    )
    .map((entity) => entity.block);
}

/**
 * Las mismas invariantes referenciales que el validador canónico del servidor
 * aplica al guardar. Comprobarlas aquí es lo que impide ofrecer una fusión que
 * sólo puede terminar en un 400 con un mensaje que nadie sabe interpretar.
 */
export function cadDocumentReferenceBreaks(
  document: CadDocument,
): CadMergeReferenceBreak[] {
  /**
   * MISMA frontera que el validador del servidor, ni más estricta ni menos:
   * la existencia de la capa sólo puede comprobarse cuando el documento DECLARA
   * sus capas. Un documento heredado o mínimo que llega con la tabla vacía no
   * se rechaza por eso allí, así que tampoco puede bloquear una fusión aquí —
   * hacerlo inventaría un motivo de bloqueo que el producto no aplica.
   */
  const layers: ReadonlySet<string> | null = document.layers.length
    ? new Set(document.layers.map((layer) => layer.id))
    : null;
  const blocks = new Set(document.blocks.map((block) => block.id));
  const entityIds = new Set(document.entities.map((entity) => entity.id));
  const paperSpaceIds = new Set(document.paperSpaces.map((space) => space.id));

  const missing = new Map<string, { section: CadMergeSection; dependents: string[] }>();
  const note = (
    section: CadMergeSection,
    resourceId: string | undefined,
    known: ReadonlySet<string> | null,
    dependent: string,
  ) => {
    if (known === null || resourceId === undefined || known.has(resourceId)) return;
    const key = sectionKey(section, resourceId);
    const entry = missing.get(key) ?? { section, dependents: [] };
    if (!entry.dependents.includes(dependent)) entry.dependents.push(dependent);
    missing.set(key, entry);
  };

  for (const entity of document.entities) {
    note("layers", (entity as { layer?: string }).layer, layers, entity.id);
    if (entity.type === "insert") note("blocks", entity.block, blocks, entity.id);
  }
  for (const opaque of document.unsupportedEntities)
    note("layers", opaque.layer, layers, opaque.id);
  for (const block of document.blocks) {
    for (const nested of block.entities) {
      note("layers", (nested as { layer?: string }).layer, layers, `${block.id}/${nested.id}`);
      if (nested.type === "insert")
        note("blocks", nested.block, blocks, `${block.id}/${nested.id}`);
    }
    for (const name of insertedBlockNames(block.entities))
      note("blocks", name, blocks, block.id);
  }
  for (const id of document.modelSpace.entityIds)
    note("entities", id, entityIds, "modelSpace");
  for (const space of document.paperSpaces) {
    for (const id of space.entityIds) note("entities", id, entityIds, space.id);
    if (space.titleBlock?.block)
      note("blocks", space.titleBlock.block, blocks, `${space.id}/titleBlock`);
    for (const viewport of space.viewports ?? []) {
      const where = `${space.id}/${viewport.id}`;
      for (const layerId of Object.keys(viewport.layerVisibility ?? {}))
        note("layers", layerId, layers, where);
      for (const layerId of Object.keys(viewport.layerOverrides ?? {}))
        note("layers", layerId, layers, where);
    }
  }
  for (const constraint of document.constraints)
    for (const id of constraint.entityIds)
      note("entities", id, entityIds, constraint.id);
  for (const reference of document.externalReferences) {
    note("blocks", reference.blockId, blocks, reference.id);
    note("entities", reference.insertId, entityIds, reference.id);
  }
  for (const publication of document.publications)
    for (const id of publication.paperSpaceIds)
      note("paperSpaces", id, paperSpaceIds, publication.id);

  return [...missing.entries()]
    .map(([key, entry]) => ({
      section: entry.section,
      resourceId: key.slice(entry.section.length + 1),
      dependents: [...entry.dependents].sort(),
      detail: `${entry.section}/${key.slice(entry.section.length + 1)} no existe en el documento fusionado; ${entry.dependents.length} referencia(s) quedarían colgantes.`,
    }))
    .sort((left, right) =>
      left.section === right.section
        ? left.resourceId.localeCompare(right.resourceId)
        : left.section.localeCompare(right.section),
    );
}
