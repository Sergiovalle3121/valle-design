/**
 * Las tablas de SÍMBOLOS —bloques y referencias externas— escritas por la MISMA
 * vía que la geometría.
 *
 * ## Por qué existe
 *
 * `entity-commands.ts` es el único embudo de mutación del editor: un lote, un
 * `commitChange`, un paso de deshacer. Hasta ahora sabía escribir entidades,
 * restricciones y parámetros; estas tablas no, y por eso todo lo que las tocaba
 * —`defineCadBlock`, `attachCadXref`— llamaba a `commitChange` por su cuenta.
 * Eso es una SEGUNDA ruta de mutación, y con ella BLOCK sería imposible de
 * hacer bien: definir el bloque, borrar la geometría que sustituye y crear el
 * INSERT son tres cosas que tienen que ser UNA, o deshacer deja el dibujo sin
 * la geometría y sin el bloque.
 *
 * Aquí viven esas órdenes y su aplicación. `entity-commands.ts` las enruta;
 * este módulo no sabe nada de historia.
 *
 * ## Qué NO está aquí, y por qué
 *
 * Las CAPAS y el ORDEN DE DIBUJO viven en `entity-command-tables.ts`, que
 * llegó por el mismo razonamiento desde `-LAYER`, LAYERSTATE y DRAWORDER.
 * Tener dos órdenes `layer` sería exactamente la segunda vía que ambos módulos
 * existen para impedir, así que hay UNA: la de allí, con su borrado que
 * REASIGNA las entidades en la misma transacción. Lo mismo pasó antes con los
 * ESTILOS, que son de `entity-commands.ts`. PURGE, XATTACH y ADCENTER emiten
 * esas órdenes ajenas y no unas propias.
 *
 * ## Qué NO hace
 *
 * No emite `commitChange` ni ordena `modelSpace`: devuelve las dos tablas ya
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
 * La orden para borrar una capa que quien llama YA ha probado que está vacía.
 *
 * La orden `layer` es de `entity-command-tables.ts` y su borrado REASIGNA a
 * otra capa lo que quedase dentro, así que exige un destino y comprueba que
 * exista antes de tocar nada. Aquí no hay nada que reasignar —eso lo garantiza
 * quien llama—, pero el destino sigue siendo obligatorio, y elegirlo mal
 * convierte un purgado legítimo en «No existe la capa de destino».
 *
 * Por eso se elige contra la tabla real y no a ciegas con "0": un documento
 * puede no tener capa 0 —`migrateCadDocument` no la inventa— y la capa que se
 * va puede ser la única que hay. El último recurso es la propia capa que se
 * borra, que es seguro precisamente porque está vacía: la reasignación no
 * alcanza a ninguna entidad y la capa desaparece igual.
 *
 * Lo emiten PURGE y XREF Desligar, que son los dos sitios donde se borra una
 * capa que se acaba de dejar sin contenido.
 */
export function cadEmptyLayerDeleteCommand(
  layers: readonly CadLayerDef[],
  name: string,
): { type: "layer"; entity?: undefined; op: "delete"; name: string; reassignTo: string } {
  const fold = (value: string) => value.trim().toLocaleLowerCase();
  const survivor =
    layers.find((layer) => fold(layer.name) === "0") ??
    layers.find((layer) => fold(layer.name) !== fold(name));
  return { type: "layer", op: "delete", name, reassignTo: survivor?.name ?? name };
}

/**
 * Órdenes que escriben una TABLA del documento.
 *
 * `entity` se declara ausente —igual que en `constraint` y `parameter`— porque
 * el anfitrión decide qué capa comprobar preguntando
 * `"entityId" in command ? … : "entity" in command ? …`, y estas órdenes no
 * apuntan a ninguna entidad.
 */
export type CadSymbolTableCommand =
  | { type: "block"; entity?: undefined; op: "define"; definition: CadBlockDefinition }
  | { type: "block"; entity?: undefined; op: "redefine"; definition: CadBlockDefinition }
  | { type: "block"; entity?: undefined; op: "delete"; blockId: string }
  | { type: "xref"; entity?: undefined; op: "upsert"; reference: CadExternalReference }
  | { type: "xref"; entity?: undefined; op: "delete"; xrefId: string };

export interface CadSymbolTables {
  blocks: CadBlockDefinition[];
  externalReferences: CadExternalReference[];
}

export const isCadSymbolTableCommand = (
  command: { type: string },
): command is CadSymbolTableCommand =>
  command.type === "block" || command.type === "xref";

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

/**
 * ¿Alguna entidad —suelta o dentro de un bloque— inserta esta definición?
 *
 * Los bloques que el MISMO lote va a borrar no cuentan. Sin eso, borrar un
 * árbol de bloques huérfanos dependería del orden en que se emitieran las
 * órdenes: el contenedor antes que el contenido, o falla. Un lote es atómico
 * respecto de su punto de partida, así que su orden interno no debería decidir
 * si una operación legítima se puede hacer.
 */
function blockIsUsed(
  block: CadBlockDefinition,
  entities: readonly CadEntity[],
  blocks: readonly CadBlockDefinition[],
  alsoDeleted: ReadonlySet<string>,
): boolean {
  const keys = new Set([block.id, block.name]);
  const references = (list: readonly CadEntity[]) =>
    list.some((entity) => entity.type === "insert" && keys.has(entity.block));
  if (references(entities)) return true;
  return blocks.some(
    (candidate) =>
      candidate.id !== block.id && !alsoDeleted.has(candidate.id) && references(candidate.entities),
  );
}

/**
 * Aplica las órdenes de tabla de símbolos sobre las tablas de partida.
 *
 * `entities` es el estado de las entidades DESPUÉS de aplicar la parte de
 * geometría del lote, no el de partida: BLOCK borra la geometría que convierte
 * en definición dentro del mismo lote, y preguntar por el documento de entrada
 * diría que el bloque recién definido sigue sin usarse.
 */
export function applyCadSymbolTables(
  document: Pick<CadDocument, "blocks" | "externalReferences">,
  commands: readonly CadSymbolTableCommand[],
  entities: readonly CadEntity[],
): CadSymbolTables {
  if (commands.length === 0)
    return { blocks: document.blocks, externalReferences: document.externalReferences };

  let blocks = [...document.blocks];
  let externalReferences = [...document.externalReferences];
  // Se calcula ANTES del bucle: lo que este lote va a borrar no puede contar
  // como «todavía en uso» para lo que también se va a borrar.
  const pendingBlockDeletes = new Set(
    commands
      .filter((command): command is Extract<CadSymbolTableCommand, { type: "block"; op: "delete" }> =>
        command.type === "block" && command.op === "delete")
      .map((command) => command.blockId),
  );

  for (const command of commands) {
    if (command.type === "block") {
      if (command.op === "delete") {
        const target = blocks.find((block) => block.id === command.blockId);
        if (!target) throw new Error(`Block ${command.blockId} was not found.`);
        if (blockIsUsed(target, entities, blocks, pendingBlockDeletes))
          throw new Error(`Block ${target.name} is still inserted; it cannot be deleted.`);
        blocks = blocks.filter((block) => block.id !== target.id);
        continue;
      }
      const definition = command.definition;
      const name = definition.name.trim();
      if (!name) throw new Error("A block definition needs a name.");
      // Un bloque SÓLO de atributos es legítimo —un cajetín es exactamente
      // eso—, así que la tabla lo acepta. Lo que no puede es no tener nada.
      if (definition.entities.length === 0 && Object.keys(definition.attributes ?? {}).length === 0)
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

  return { blocks, externalReferences };
}
