/**
 * Las TABLAS del documento —bloques, capas y referencias externas— escritas por
 * la MISMA vía que la geometría.
 *
 * ## Por qué existe
 *
 * `entity-commands.ts` es el único embudo de mutación del editor: un lote, un
 * `commitChange`, un paso de deshacer. Hasta ahora sabía escribir entidades,
 * restricciones y parámetros; las tablas no, y por eso todo lo que las tocaba
 * —`defineCadBlock`, `attachCadXref`, `createCadDocumentLayer`— llamaba a
 * `commitChange` por su cuenta. Eso es una SEGUNDA ruta de mutación, y con ella
 * BLOCK sería imposible de hacer bien: definir el bloque, borrar la geometría
 * que sustituye y crear el INSERT son tres cosas que tienen que ser UNA, o
 * deshacer deja el dibujo sin la geometría y sin el bloque.
 *
 * Aquí viven las órdenes de tabla y su aplicación. `entity-commands.ts` las
 * enruta; este módulo no sabe nada de entidades ni de historia.
 *
 * ## Qué NO hace
 *
 * No emite `commitChange` ni ordena `modelSpace`: devuelve las tres tablas ya
 * resueltas y quien llama las mete en el mismo `commitChange` que todo lo
 * demás. Tampoco importa `professional-blocks`: la detección de ciclos que
 * necesita cabe en veinte líneas, y traerse aquel módulo metería
 * `entity-runtime` → `professional-blocks` → aquí en el mismo ciclo de carga
 * que el benchmark de humo existe para cazar.
 */
import type {
  CadBlockDefinition,
  CadDocument,
  CadEntity,
  CadExternalReference,
  CadLayerDef,
} from "./cad-document";

/**
 * Órdenes que escriben una TABLA del documento.
 *
 * `entity` se declara ausente —igual que en `constraint` y `parameter`— porque
 * el anfitrión decide qué capa comprobar preguntando
 * `"entityId" in command ? … : "entity" in command ? …`, y estas órdenes no
 * apuntan a ninguna entidad.
 */
export type CadDocumentTableCommand =
  | { type: "block"; entity?: undefined; op: "define"; definition: CadBlockDefinition }
  | { type: "block"; entity?: undefined; op: "redefine"; definition: CadBlockDefinition }
  | { type: "block"; entity?: undefined; op: "delete"; blockId: string }
  | { type: "layer"; entity?: undefined; op: "upsert"; layer: CadLayerDef }
  | { type: "layer"; entity?: undefined; op: "delete"; layerId: string }
  | { type: "xref"; entity?: undefined; op: "upsert"; reference: CadExternalReference }
  | { type: "xref"; entity?: undefined; op: "delete"; xrefId: string };

export interface CadDocumentTables {
  blocks: CadBlockDefinition[];
  layers: CadLayerDef[];
  externalReferences: CadExternalReference[];
}

export const isCadDocumentTableCommand = (
  command: { type: string },
): command is CadDocumentTableCommand =>
  command.type === "block" || command.type === "layer" || command.type === "xref";

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
const fold = (value: string) => value.trim().toLocaleLowerCase();

/**
 * ¿La tabla de bloques resultante tiene un ciclo?
 *
 * Un bloque que se contiene a sí mismo —directamente o a través de otro— cuelga
 * a cualquiera que lo resuelva, y resolverlo es lo que hacen el render, la
 * selección y la exportación. Se comprueba ANTES de escribir, sobre la tabla
 * que quedaría, porque después ya no hay dibujo que salvar.
 */
function blockCycle(blocks: readonly CadBlockDefinition[]): string | null {
  const byKey = new Map<string, CadBlockDefinition>();
  for (const block of blocks) {
    byKey.set(block.id, block);
    if (!byKey.has(block.name)) byKey.set(block.name, block);
  }
  const state = new Map<string, "visiting" | "done">();
  const visit = (block: CadBlockDefinition, path: string[]): string | null => {
    if (state.get(block.id) === "done") return null;
    if (state.get(block.id) === "visiting") return [...path, block.name].join(" -> ");
    state.set(block.id, "visiting");
    for (const child of block.entities) {
      if (child.type !== "insert") continue;
      const nested = byKey.get(child.block);
      if (!nested) continue;
      const cycle = visit(nested, [...path, block.name]);
      if (cycle) return cycle;
    }
    state.set(block.id, "done");
    return null;
  };
  for (const block of blocks) {
    const cycle = visit(block, []);
    if (cycle) return cycle;
  }
  return null;
}

/** ¿Alguna entidad —suelta o dentro de un bloque— inserta esta definición? */
function blockIsUsed(
  block: CadBlockDefinition,
  entities: readonly CadEntity[],
  blocks: readonly CadBlockDefinition[],
): boolean {
  const keys = new Set([block.id, block.name]);
  const references = (list: readonly CadEntity[]) =>
    list.some((entity) => entity.type === "insert" && keys.has(entity.block));
  if (references(entities)) return true;
  return blocks.some((candidate) => candidate.id !== block.id && references(candidate.entities));
}

/**
 * Aplica las órdenes de tabla sobre las tablas de partida.
 *
 * `entities` es el estado de las entidades DESPUÉS de aplicar la parte de
 * geometría del lote, no el de partida: BLOCK borra la geometría que convierte
 * en definición dentro del mismo lote, y preguntar por el documento de entrada
 * diría que sigue estando en la capa que se va a purgar.
 */
export function applyCadDocumentTables(
  document: Pick<CadDocument, "blocks" | "layers" | "externalReferences">,
  commands: readonly CadDocumentTableCommand[],
  entities: readonly CadEntity[],
): CadDocumentTables {
  if (commands.length === 0)
    return {
      blocks: document.blocks,
      layers: document.layers,
      externalReferences: document.externalReferences,
    };

  let blocks = [...document.blocks];
  let layers = [...document.layers];
  let externalReferences = [...document.externalReferences];
  let touchedLayers = false;

  for (const command of commands) {
    if (command.type === "block") {
      if (command.op === "delete") {
        const target = blocks.find((block) => block.id === command.blockId);
        if (!target) throw new Error(`Block ${command.blockId} was not found.`);
        if (blockIsUsed(target, entities, blocks))
          throw new Error(`Block ${target.name} is still inserted; it cannot be deleted.`);
        blocks = blocks.filter((block) => block.id !== target.id);
        continue;
      }
      const definition = command.definition;
      const name = definition.name.trim();
      if (!name) throw new Error("A block definition needs a name.");
      if (definition.entities.length === 0)
        throw new Error(`Block ${name} cannot be empty.`);
      // El nombre es la clave con la que se INSERTA un bloque, así que dos
      // definiciones con el mismo nombre y distinto id hacen ambiguo cada
      // INSERT del documento. Se rechaza aunque los ids no choquen.
      if (blocks.some((block) => block.id !== definition.id && fold(block.name) === fold(name)))
        throw new Error(`Block ${name} already exists.`);
      const existing = blocks.find((block) => block.id === definition.id);
      if (command.op === "define" && existing)
        throw new Error(`Block ${name} already exists.`);
      if (command.op === "redefine" && !existing)
        throw new Error(`Block ${definition.id} was not found.`);
      const next: CadBlockDefinition = {
        ...definition,
        name,
        version: command.op === "redefine" ? (existing?.version ?? 1) + 1 : (definition.version ?? 1),
      };
      blocks = existing
        ? blocks.map((block) => (block.id === next.id ? next : block))
        : [...blocks, next].sort(byId);
      const cycle = blockCycle(blocks);
      if (cycle) throw new Error(`Block cycle: ${cycle}.`);
      continue;
    }

    if (command.type === "layer") {
      touchedLayers = true;
      if (command.op === "delete") {
        const target = layers.find((layer) => layer.id === command.layerId);
        if (!target) throw new Error(`Layer ${command.layerId} was not found.`);
        if (entities.some((entity) => entity.layer === target.id))
          throw new Error(`Layer ${target.name} still has entities; it cannot be deleted.`);
        layers = layers.filter((layer) => layer.id !== target.id);
        continue;
      }
      const existing = layers.find((layer) => layer.id === command.layer.id);
      const duplicate = layers.some(
        (layer) => layer.id !== command.layer.id && fold(layer.name) === fold(command.layer.name),
      );
      if (duplicate) throw new Error(`Layer ${command.layer.name} already exists.`);
      layers = existing
        ? layers.map((layer) => (layer.id === command.layer.id ? { ...command.layer } : layer))
        : [...layers, { ...command.layer }].sort(byId);
      continue;
    }

    if (command.op === "delete") {
      if (!externalReferences.some((reference) => reference.id === command.xrefId))
        throw new Error(`Xref ${command.xrefId} was not found.`);
      externalReferences = externalReferences.filter(
        (reference) => reference.id !== command.xrefId,
      );
      continue;
    }
    const reference = command.reference;
    externalReferences = externalReferences.some((candidate) => candidate.id === reference.id)
      ? externalReferences.map((candidate) =>
          candidate.id === reference.id ? { ...reference } : candidate,
        )
      : [...externalReferences, { ...reference }].sort(byId);
  }

  return {
    blocks,
    // Un lote que no toca capas devuelve el array TAL CUAL: reordenar la tabla
    // de capas de un documento por escribir un bloque cambiaría su serializado
    // —y su hash— sin que nadie lo haya pedido.
    layers: touchedLayers ? layers : document.layers,
    externalReferences,
  };
}
