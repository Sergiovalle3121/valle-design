/**
 * El flujo de trabajo de los bloques: definir, insertar, publicar y editar
 * atributos, expresado como `CadEntityCommand[]`.
 *
 * ## Por qué existe
 *
 * `professional-blocks.ts` sabe RESOLVER un INSERT —darle la geometría de mundo
 * a la matriz de un bloque— y tiene funciones que escriben el documento por su
 * cuenta (`defineCadBlock`, `insertCadBlock`), cada una con su `commitChange`.
 * Ninguna sirve al motor de comandos, que emite lotes y no documentos, y la
 * segunda ruta de mutación es justo lo que el producto no puede permitirse:
 * definir el bloque, borrar la geometría que sustituye y crear el INSERT son
 * TRES escrituras que tienen que ser UNA, o deshacer deja el dibujo sin la
 * geometría y sin el bloque.
 *
 * Aquí no se escribe nada: entran una selección y unos parámetros, y salen
 * órdenes. Quien las aplica es `executeCadEntityCommandBatch`, como todo lo
 * demás. Módulo puro: se prueba en Node sin montar el editor.
 *
 * ## Las tres cosas que hay que hacer bien
 *
 * 1. **La escala NEGATIVA sobrevive.** `scale.x = −1` es un espejo, y el kernel
 *    entero depende de que el signo llegue intacto hasta `insertMatrix`.
 *    `Math.abs` en cualquier punto de este camino se come el espejo y produce
 *    un dibujo plausible y falso. No hay ni uno.
 * 2. **Los ATTDEF de la selección se convierten en ATRIBUTOS del bloque.**
 *    Dejarlos como geometría los dibujaría dos veces: una como etiqueta cruda
 *    (`PRECIO`) y otra como valor resuelto (`12,50 €`).
 * 3. **Los atributos posicionados se calculan al insertar.** Ver
 *    `positioned-attributes.ts`: sin ellos un cajetín es una lista de pares
 *    clave/valor invisible.
 */
import type {
  CadBlockDefinition,
  CadEntity,
  CadPoint3,
} from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import type { CadNativeEntity } from "../entity-runtime";
import { cadResolvePositionedAttributes } from "./positioned-attributes";

type CadInsertEntity = Extract<CadEntity, { type: "insert" }>;
type CadAttdefEntity = Extract<CadEntity, { type: "attdef" }>;
type CadBlockAttributes = NonNullable<CadBlockDefinition["attributes"]>;

/**
 * Nombre reservado del bloque que guarda el PUNTO BASE del dibujo (BASE, la
 * variable `INSBASE` de AutoCAD).
 *
 * **Esto es una solución provisional y consciente.** Su sitio natural sería
 * `meta.insertionBase`, pero `cad-document.ts` pertenece a otra sesión en esta
 * ronda y añadirle un campo sería pisarla. Una entrada de la tabla de bloques
 * SÍ persiste, sobrevive a guardar y reabrir, y viaja con el documento, que es
 * lo que BASE necesita para significar algo. El prefijo `*` es el mismo que usa
 * DXF para sus bloques de sistema (`*Model_Space`), así que no colisiona con
 * ningún nombre que el usuario pueda teclear: `cadBlockNameIsValid` lo rechaza.
 *
 * Cuando el esquema tenga su campo, esto se migra y se borra.
 */
export const CAD_BASE_POINT_BLOCK = "*BASE";

/** Caracteres que DXF no admite en un nombre de tabla. */
const INVALID_BLOCK_NAME = /[<>/\\":;?*|=`,]/;

export function cadBlockNameIsValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 96 && !INVALID_BLOCK_NAME.test(trimmed);
}

const fold = (value: string) => value.trim().toLocaleLowerCase();

/** Resuelve un bloque por id o por nombre, sin distinguir mayúsculas. */
export function cadFindBlock(
  blocks: readonly CadBlockDefinition[],
  key: string,
): CadBlockDefinition | undefined {
  const needle = fold(key);
  return (
    blocks.find((block) => block.id === key) ??
    blocks.find((block) => fold(block.name) === needle)
  );
}

/** Los bloques que un usuario puede insertar: los de sistema no se listan. */
export function cadInsertableBlocks(
  blocks: readonly CadBlockDefinition[],
): readonly CadBlockDefinition[] {
  return blocks.filter((block) => !block.name.startsWith("*"));
}

// ---------------------------------------------------------------------------
// Punto base del dibujo (BASE)
// ---------------------------------------------------------------------------

/** El punto base del dibujo, o el origen si nunca se fijó. */
export function cadDrawingBasePoint(blocks: readonly CadBlockDefinition[]): CadPoint3 {
  const holder = blocks.find((block) => block.name === CAD_BASE_POINT_BLOCK);
  return holder ? { ...holder.basePoint } : { x: 0, y: 0, z: 0 };
}

export function cadSetDrawingBasePointCommands(
  blocks: readonly CadBlockDefinition[],
  point: CadPoint3,
): CadEntityCommand[] {
  const holder = blocks.find((block) => block.name === CAD_BASE_POINT_BLOCK);
  const definition: CadBlockDefinition = {
    id: holder?.id ?? "block:*base",
    name: CAD_BASE_POINT_BLOCK,
    basePoint: { ...point },
    // Un POINT en el propio punto base: la tabla de bloques no admite
    // definiciones vacías, y un punto es lo que BASE significa.
    entities: [
      {
        id: `${holder?.id ?? "block:*base"}:entity:0`,
        type: "point",
        position: { ...point },
        layer: "0",
      },
    ],
    description: "Punto base de inserción del dibujo (BASE / INSBASE).",
  };
  return [{ type: "block", op: holder ? "redefine" : "define", definition }];
}

// ---------------------------------------------------------------------------
// BLOCK — definir desde una selección
// ---------------------------------------------------------------------------

export interface CadDefineBlockInput {
  /** Id de la definición. Lo aporta quien llama para que la spec sea determinista. */
  id: string;
  name: string;
  basePoint: CadPoint3;
  /** La selección, ya resuelta a entidades. */
  entities: readonly CadEntity[];
  /** Id del INSERT que sustituye a la selección. */
  insertId: string;
  /**
   * Qué se hace con la selección:
   * - `insert` (por defecto, lo que hace BLOCK): se borra y en su sitio queda
   *   una inserción del bloque recién definido.
   * - `retain`: se conserva tal cual; el bloque queda sólo en la tabla.
   * - `delete`: se borra y no se inserta nada.
   */
  disposition?: "insert" | "retain" | "delete";
  description?: string;
  keywords?: readonly string[];
  /** `tenant` publica la definición para que ADCENTER la vea (WBLOCK). */
  scope?: "document" | "tenant";
  tenantId?: string;
}

export interface CadDefineBlockResult {
  commands: CadEntityCommand[];
  definition: CadBlockDefinition;
  /** Etiquetas de atributo recogidas de los ATTDEF de la selección. */
  attributeTags: string[];
}

/** Un ATTDEF de la selección, traducido a entrada de la tabla de atributos. */
function attributeFromAttdef(attdef: CadAttdefEntity): CadBlockAttributes[string] {
  return {
    defaultValue: attdef.defaultValue ?? "",
    // `verify` es la bandera con la que AutoCAD pide confirmación del valor;
    // aquí se lee como «este atributo no puede quedar vacío».
    required: attdef.verify === true,
    prompt: attdef.prompt ?? attdef.tag,
    position: { ...attdef.insertion },
    ...(attdef.height === undefined ? {} : { height: attdef.height }),
    ...(attdef.style === undefined ? {} : { style: attdef.style }),
    ...(attdef.invisible ? { invisible: true } : {}),
    ...(attdef.constant ? { constant: true } : {}),
  };
}

/**
 * Reasigna los ids de las entidades que entran en una definición.
 *
 * Mismo criterio que `professional-blocks.remapBlockEntityIds`: `<bloque>:entity:<i>`.
 * Los conectores se reapuntan a los ids nuevos, o quedarían señalando entidades
 * que ya no existen dentro del bloque.
 */
function remapEntities(entities: readonly CadEntity[], blockId: string): CadEntity[] {
  const ids = new Map(entities.map((entity, index) => [entity.id, `${blockId}:entity:${index}`]));
  return entities.map((entity, index) => {
    const id = `${blockId}:entity:${index}`;
    const clone = structuredClone(entity) as CadEntity;
    if (clone.type === "connector")
      return { ...clone, id, from: ids.get(clone.from) ?? clone.from, to: ids.get(clone.to) ?? clone.to };
    return { ...clone, id };
  });
}

export function cadDefineBlockCommands(input: CadDefineBlockInput): CadDefineBlockResult {
  const name = input.name.trim();
  if (!cadBlockNameIsValid(name))
    throw new Error("El nombre de bloque debe tener de 1 a 96 caracteres válidos de DXF.");
  if (input.entities.length === 0)
    throw new Error("Un bloque necesita al menos un objeto designado.");

  const attdefs = input.entities.filter((entity): entity is CadAttdefEntity => entity.type === "attdef");
  const geometry = input.entities.filter((entity) => entity.type !== "attdef");
  const attributes: CadBlockAttributes = {};
  for (const attdef of attdefs) {
    const tag = attdef.tag.trim().toUpperCase();
    if (!tag) continue;
    attributes[tag] = attributeFromAttdef(attdef);
  }
  if (geometry.length === 0 && Object.keys(attributes).length === 0)
    throw new Error("Un bloque necesita geometría o atributos.");

  const definition: CadBlockDefinition = {
    id: input.id,
    name,
    basePoint: { ...input.basePoint },
    entities: remapEntities(geometry, input.id),
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.keywords?.length ? { keywords: [...new Set(input.keywords)] } : {}),
    version: 1,
    library: {
      scope: input.scope ?? "document",
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    },
  };

  const disposition = input.disposition ?? "insert";
  const commands: CadEntityCommand[] = [{ type: "block", op: "define", definition }];
  if (disposition !== "retain")
    for (const entity of input.entities) commands.push({ type: "delete", entityId: entity.id });
  if (disposition === "insert")
    commands.push(
      ...cadInsertBlockCommands({
        id: input.insertId,
        block: definition,
        insertion: input.basePoint,
        layer: geometry[0]?.layer ?? input.entities[0].layer,
      }),
    );

  return { commands, definition, attributeTags: Object.keys(attributes).sort() };
}

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

export interface CadInsertBlockInput {
  id: string;
  block: CadBlockDefinition;
  insertion: CadPoint3;
  /**
   * Escala por eje. **Admite valores negativos**: `{x: -1, y: 1}` es la
   * inserción espejada, y es la razón por la que este campo no pasa por
   * `Math.abs` en ningún punto del camino.
   */
  scale?: Partial<CadPoint3>;
  rotation?: number;
  layer: string;
  /** Valores de atributo por etiqueta. Los que falten toman su valor por defecto. */
  attributes?: Record<string, string>;
}

const finite = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Number(value) : fallback;

/**
 * Valores de atributo de una inserción: los constantes vienen de la definición
 * y no admiten valor de instancia; el resto acepta lo que se le pase y cae al
 * valor por defecto.
 */
export function cadResolveInsertAttributes(
  block: Pick<CadBlockDefinition, "attributes">,
  values: Record<string, string> = {},
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [tag, definition] of Object.entries(block.attributes ?? {}))
    resolved[tag] = definition.constant
      ? (definition.defaultValue ?? "")
      : (values[tag] ?? definition.defaultValue ?? "");
  return resolved;
}

/** Atributos obligatorios que se han quedado vacíos. */
export function cadMissingRequiredAttributes(
  block: Pick<CadBlockDefinition, "attributes">,
  values: Record<string, string>,
): string[] {
  return Object.entries(block.attributes ?? {})
    .filter(([tag, definition]) => definition.required && !(values[tag] ?? "").trim())
    .map(([tag]) => tag)
    .sort();
}

export function cadInsertBlockCommands(input: CadInsertBlockInput): CadEntityCommand[] {
  const scale = {
    x: finite(input.scale?.x, 1),
    y: finite(input.scale?.y, 1),
    z: finite(input.scale?.z, 1),
  };
  // Una escala CERO colapsa el bloque a un punto y hace singular su matriz: no
  // se puede invertir, así que ni la selección ni los snaps podrían volver a
  // coordenadas del bloque. Se rechaza. El signo, en cambio, se respeta.
  if (scale.x === 0 || scale.y === 0)
    throw new Error("La escala de una inserción no puede ser cero.");

  const attributes = cadResolveInsertAttributes(input.block, input.attributes);
  const missing = cadMissingRequiredAttributes(input.block, attributes);
  if (missing.length > 0)
    throw new Error(`Faltan atributos obligatorios: ${missing.join(", ")}.`);

  const positioned = cadResolvePositionedAttributes(
    input.block,
    { insertion: input.insertion, rotation: finite(input.rotation, 0), scale },
    attributes,
  );
  const insert: CadInsertEntity = {
    id: input.id,
    type: "insert",
    block: input.block.id,
    insertion: { ...input.insertion },
    scale,
    rotation: finite(input.rotation, 0),
    layer: input.layer,
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(positioned.length > 0 ? { positionedAttributes: positioned } : {}),
  };
  return [{ type: "insert", entity: insert as CadNativeEntity }];
}

// ---------------------------------------------------------------------------
// ATTEDIT
// ---------------------------------------------------------------------------

export interface CadBlockAttributePrompt {
  tag: string;
  prompt: string;
  defaultValue: string;
  constant: boolean;
  required: boolean;
}

/**
 * Lo que hay que preguntar al insertar un bloque con atributos.
 *
 * Los CONSTANTES no se preguntan —su valor lo fija la definición— y por eso no
 * salen en esta lista: preguntarlos sería ofrecer un campo que no cambia nada.
 */
export function cadBlockAttributePrompts(
  block: Pick<CadBlockDefinition, "attributes">,
): CadBlockAttributePrompt[] {
  return Object.entries(block.attributes ?? {})
    .filter(([, definition]) => !definition.constant)
    .map(([tag, definition]) => ({
      tag,
      prompt: definition.prompt?.trim() || tag,
      defaultValue: definition.defaultValue ?? "",
      constant: false,
      required: definition.required === true,
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * ATTEDIT: cambia los valores de los atributos de una inserción.
 *
 * Sale un `replace` y no un `properties`: hay que reescribir a la vez
 * `attributes` y `positionedAttributes`, y el bolsillo de propiedades del
 * adaptador de INSERT sólo conoce el primero. Con un `properties` el valor
 * cambiaría en la lista y el texto dibujado seguiría diciendo lo de antes.
 *
 * Las POSICIONES se recalculan desde la definición y la matriz de la inserción.
 * Es correcto mientras no exista ATTIPEDIT —mover un atributo suelto—, y cuando
 * exista habrá que conservar el desplazamiento manual en vez de recalcularlo.
 */
export function cadAttEditCommands(
  insert: CadInsertEntity,
  block: CadBlockDefinition,
  values: Record<string, string>,
): CadEntityCommand[] {
  const merged = cadResolveInsertAttributes(block, { ...(insert.attributes ?? {}), ...values });
  const missing = cadMissingRequiredAttributes(block, merged);
  if (missing.length > 0)
    throw new Error(`Faltan atributos obligatorios: ${missing.join(", ")}.`);
  const positioned = cadResolvePositionedAttributes(block, insert, merged);
  const next: CadInsertEntity = {
    ...insert,
    attributes: merged,
    ...(positioned.length > 0 ? { positionedAttributes: positioned } : {}),
  };
  return [{ type: "replace", entityId: insert.id, entity: next as CadNativeEntity }];
}
