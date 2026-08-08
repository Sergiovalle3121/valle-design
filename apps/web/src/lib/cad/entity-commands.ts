/**
 * Ejecutor de comandos sobre entidades canónicas.
 *
 * Vive aparte de `entity-runtime.ts` a propósito: aquel es el REGISTRO
 * (qué sabe hacer cada tipo de entidad: dibujarse, seleccionarse, dar sus
 * grips, sus snaps y sus propiedades), y esto es la TRANSACCIÓN (cómo se
 * aplican esas capacidades al documento sin romper el orden de dibujo, las
 * asociatividades ni la historia). Separarlos mantiene el registro por debajo
 * del presupuesto de tamaño y deja el embudo de mutación en un archivo que se
 * puede leer entero.
 *
 * Todo cambio de geometría del editor pasa por aquí. No hay una segunda vía.
 */
import {
  commitChange,
  preserveDrawOrder,
  type CadDocument,
  type CadPoint2,
} from "./cad-document";
import { regenerateAssociativeDimensions } from "./associative-dimension";
import { regenerateAssociativeMleaders } from "./associative-mleader";
import { regenerateAssociativeHatches } from "./hatch-associativity";
import {
  CAD_ENTITY_REGISTRY,
  CadEntityRegistry,
  cadEntityBoundaryPaths,
  cloneContext,
  type CadEntityTransform,
  type CadNativeEntity,
  type CadPropertyBag,
} from "./entity-runtime";

export type CadEntityCommand =
  | { type: "transform"; entityId: string; transform: CadEntityTransform }
  | { type: "properties"; entityId: string; patch: Partial<CadPropertyBag> }
  | { type: "grip"; entityId: string; gripId: string; point: CadPoint2 }
  | { type: "copy"; entityId: string; newEntityId: string; offset?: CadPoint2 }
  /**
   * Da de alta una entidad nativa nueva. `drawOrder` decide dónde entra en
   * `modelSpace.entityIds`: `"front"` (por defecto) al final, que es lo que se
   * dibuja encima; `"back"` al principio, para fondos como HATCH o WIPEOUT.
   */
  | { type: "insert"; entity: CadNativeEntity; drawOrder?: "front" | "back" }
  /**
   * Sustituye una entidad conservando su id, su posición en el orden de dibujo
   * y las referencias que la apuntan. Existe porque hay ediciones que cambian
   * el TIPO —un círculo con escala no uniforme es una elipse, un arco alargado
   * hasta cerrarse es un círculo— y resolverlas como borrar+crear rompería las
   * cotas asociativas y los sombreados que dependen de esa entidad.
   */
  | { type: "replace"; entityId: string; entity: CadNativeEntity }
  | { type: "hatch-association"; entityId: string; associative: boolean }
  | { type: "dimension-association"; entityId: string; associative: boolean }
  | { type: "mleader-association"; entityId: string; associative: boolean }
  | { type: "delete"; entityId: string };

export interface CadEntityCommandResult {
  document: CadDocument;
  affectedEntityIds: string[];
  createdEntityIds: string[];
  deletedEntityIds: string[];
}

/**
 * Etiqueta de historia de un comando suelto. Se calcula ANTES de tocar nada
 * para que un id inexistente falle con el mismo mensaje y en el mismo momento
 * que antes de existir el ejecutor por lotes.
 */
function cadEntityCommandLabel(
  document: CadDocument,
  command: CadEntityCommand,
  registry: CadEntityRegistry,
): string {
  if (command.type === "insert") return `insert:${command.entity.type}`;
  const source = document.entities.find((entity) => entity.id === command.entityId);
  if (!source || !registry.supports(source))
    throw new Error(`Native CAD entity ${command.entityId} was not found.`);
  return `${command.type}:${source.type}`;
}

/**
 * Aplica N comandos como UNA sola transacción: una regeneración de asociativos,
 * un `commitChange` y, por tanto, una única entrada de historia.
 *
 * Es un prerrequisito del motor de comandos, no una optimización. Con un
 * comando por llamada, un ARRAY de 50 elementos dejaba 50 entradas de historia
 * y subía `meta.version` 50 veces para UNA orden del usuario — y cada vuelta
 * pagaba además el `structuredClone` completo de bloques, estilos, hojas y
 * referencias que hace `commitChange`. La frontera de deshacer es el COMANDO,
 * no la entidad.
 *
 * `executeCadEntityCommand` se reimplementa encima con un solo elemento, así
 * que el caso de un comando conserva exactamente el mismo documento, la misma
 * etiqueta y los mismos errores que antes.
 */
export function executeCadEntityCommandBatch(
  document: CadDocument,
  commands: readonly CadEntityCommand[],
  label: string,
  registry = CAD_ENTITY_REGISTRY,
): CadEntityCommandResult {
  if (commands.length === 0)
    throw new Error("A CAD entity command batch needs at least one command.");

  // El mapa es la fuente de verdad mientras se aplica el lote: sustituir una
  // entidad con `entities.map` costaría O(n) por comando, y un ARRAY de mil
  // elementos sobre un documento de 100k recorrería cien millones de entidades.
  // El orden del array da igual porque abajo se ordena por id; el que importa
  // —el de dibujo— vive en `modelSpace.entityIds`.
  const present = new Map(document.entities.map((entity) => [entity.id, entity]));
  // Los ids nacidos en este lote se acumulan aparte porque `preserveDrawOrder`
  // sólo sabe añadir al final.
  const createdFrontIds: string[] = [];
  const createdBackIds: string[] = [];
  const deletedEntityIds: string[] = [];
  const touchedIds: string[] = [];
  const regenerationSourceIds: string[] = [];

  const forget = (entityId: string) => {
    const front = createdFrontIds.indexOf(entityId);
    if (front >= 0) createdFrontIds.splice(front, 1);
    const back = createdBackIds.indexOf(entityId);
    if (back >= 0) createdBackIds.splice(back, 1);
  };

  for (const command of commands) {
    if (command.type === "insert") {
      // El id se lee antes del guardia: `supports` estrecha a `never` en la
      // rama falsa, así que leerlo después no compila. La comprobación en
      // tiempo de ejecución se conserva porque el tipo estático no protege de
      // un `as` en el borde del editor.
      const incomingId = command.entity.id;
      if (!registry.supports(command.entity))
        throw new Error(`CAD entity ${incomingId} is not a native entity.`);
      if (present.has(command.entity.id))
        throw new Error(`CAD entity id ${command.entity.id} already exists.`);
      present.set(command.entity.id, command.entity);
      (command.drawOrder === "back" ? createdBackIds : createdFrontIds).push(command.entity.id);
      touchedIds.push(command.entity.id);
      regenerationSourceIds.push(command.entity.id);
      continue;
    }

    const source = present.get(command.entityId);
    if (!source || !registry.supports(source))
      throw new Error(`Native CAD entity ${command.entityId} was not found.`);
    const adapter = registry.adapter(source);
    touchedIds.push(source.id);

    if (command.type === "delete") {
      present.delete(source.id);
      // Crear y borrar dentro del mismo lote no debe dejar un id fantasma en el
      // orden de dibujo ni contarse como creado hacia fuera.
      const bornHere = createdFrontIds.includes(source.id) || createdBackIds.includes(source.id);
      forget(source.id);
      if (!bornHere) deletedEntityIds.push(source.id);
      regenerationSourceIds.push(source.id);
    } else if (command.type === "copy") {
      if (present.has(command.newEntityId))
        throw new Error(`CAD entity id ${command.newEntityId} already exists.`);
      const copy = adapter.commands.transform(
        { ...source, id: command.newEntityId, context: cloneContext(source.context) },
        { translation: command.offset ?? { x: 0, y: 0 } },
      );
      present.set(copy.id, copy);
      createdFrontIds.push(copy.id);
      regenerationSourceIds.push(source.id);
    } else if (command.type === "replace") {
      if (command.entity.id !== command.entityId)
        throw new Error(
          `A replace command must keep the entity id (${command.entityId} != ${command.entity.id}).`,
        );
      // El id se lee antes del guardia: `supports` estrecha a `never` en la
      // rama falsa, así que leerlo después no compila. La comprobación en
      // tiempo de ejecución se conserva porque el tipo estático no protege de
      // un `as` en el borde del editor.
      const incomingId = command.entity.id;
      if (!registry.supports(command.entity))
        throw new Error(`CAD entity ${incomingId} is not a native entity.`);
      present.set(command.entity.id, command.entity);
      regenerationSourceIds.push(source.id);
    } else if (command.type === "hatch-association") {
      if (source.type !== "hatch") throw new Error("Hatch association commands require a HATCH entity.");
      present.set(source.id, {
        ...source,
        associative: command.associative,
        associationStatus: command.associative ? "associated" : "detached",
      });
      if (command.associative) regenerationSourceIds.push(...(source.boundaryRefs ?? []));
    } else if (command.type === "dimension-association") {
      if (source.type !== "dimension") throw new Error("Dimension association commands require a DIMENSION entity.");
      present.set(source.id, {
        ...source,
        associative: command.associative,
        associationStatus: command.associative ? "associated" : "detached",
      });
      if (command.associative)
        regenerationSourceIds.push(...(source.references ?? []).map((reference) => reference.entityId));
    } else if (command.type === "mleader-association") {
      if (source.type !== "mleader") throw new Error("MLeader association commands require an MLEADER entity.");
      present.set(source.id, {
        ...source,
        associative: command.associative,
        associationStatus: command.associative ? "associated" : "detached",
      });
      if (command.associative)
        regenerationSourceIds.push(...(source.references ?? []).map((reference) => reference.entityId));
    } else {
      present.set(
        source.id,
        command.type === "transform"
          ? adapter.commands.transform(source, command.transform)
          : command.type === "properties"
            ? adapter.properties.write(source, command.patch)
            : adapter.grips.moveGrip(source, command.gripId, command.point),
      );
      regenerationSourceIds.push(source.id);
    }
  }

  const regenerationSources = [...new Set(regenerationSourceIds)];
  let entities = [...present.values()];
  const regenerated = regenerateAssociativeHatches(
    entities,
    regenerationSources,
    (entity) => cadEntityBoundaryPaths(entity, registry),
  );
  const regeneratedDimensions = regenerateAssociativeDimensions(regenerated.entities, regenerationSources);
  const regeneratedMleaders = regenerateAssociativeMleaders(regeneratedDimensions.entities, regenerationSources);
  entities = regeneratedMleaders.entities;
  // `entities` se ordena por id para que el serializado sea determinista y los
  // hashes reproducibles. El Z-ORDER NO vive aquí: vive en
  // `modelSpace.entityIds`, y ahí alfabetizar destruía el dibujo — editar,
  // mover o soltar un grip reordenaba el plano entero por id, así que "traer al
  // frente", el apilado de hatches y los wipeouts no sobrevivían a una edición.
  entities.sort((a, b) => a.id.localeCompare(b.id));
  const deleted = new Set(deletedEntityIds);
  const ordered = preserveDrawOrder(
    document.modelSpace.entityIds,
    // Los supervivientes conservan su posición relativa exacta; lo creado
    // entra al frente. `preserveDrawOrder` además deduplica, así que no quedan
    // fantasmas ni omisiones.
    document.modelSpace.entityIds.filter((id) => !deleted.has(id)).concat(createdFrontIds),
  );
  const nextDocument = commitChange(
    {
      ...document,
      entities,
      modelSpace: { entityIds: [...createdBackIds, ...ordered] },
    },
    label,
  );
  return {
    document: nextDocument,
    affectedEntityIds: [...new Set([
      ...touchedIds,
      ...regenerated.regeneratedIds,
      ...regenerated.brokenIds,
      ...regeneratedDimensions.regeneratedIds,
      ...regeneratedDimensions.brokenIds,
      ...regeneratedMleaders.regeneratedIds,
      ...regeneratedMleaders.brokenIds,
    ])],
    createdEntityIds: [...createdBackIds, ...createdFrontIds],
    deletedEntityIds,
  };
}

export function executeCadEntityCommand(
  document: CadDocument,
  command: CadEntityCommand,
  registry = CAD_ENTITY_REGISTRY,
): CadEntityCommandResult {
  return executeCadEntityCommandBatch(
    document,
    [command],
    cadEntityCommandLabel(document, command, registry),
    registry,
  );
}
