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
  type CadConstraint,
  type CadDocument,
  type CadEntity,
  type CadEntityContext,
  type CadEntityPresentation,
  type CadImageDefinition,
  type CadParameter,
  type CadPoint2,
  type CadStyleTable,
} from "./cad-document";
import {
  deleteCadParameter,
  evaluateCadParameters,
  setCadParameter,
} from "./constraints/parameters";
import { solveConstraintSystem } from "./constraints/solver";
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
  /**
   * Da de alta o actualiza una DEFINICIÓN de imagen del documento.
   *
   * Existe porque una entidad IMAGE apunta a una entrada de
   * `document.imageDefinitions` igual que un INSERT apunta a un bloque, y sin
   * esta orden el comando IMAGE tendría que escribir esa sección por su cuenta
   * — una SEGUNDA vía de mutación, que es exactamente la propiedad que este
   * módulo existe para impedir. Una sola ruta, un solo `commitChange`, un solo
   * paso de deshacer.
   */
  | { type: "image-definition"; definition: CadImageDefinition }
  /**
   * Fusiona claves en `context.metadata`, sin tocar el resto del contexto.
   *
   * Existe para las asociatividades que NO tienen campo propio en el esquema.
   * ARRAY necesita dejar escrito en cada copia de qué matriz forma parte y con
   * qué parámetros se generó; sin eso, la matriz deja de existir en cuanto se
   * suelta el ratón y «asociativa» es una palabra. El bolsillo de propiedades
   * no vale: `properties.write` es por adaptador y ninguno expone el contexto.
   *
   * Un valor `null` BORRA la clave, que es como una matriz se desasocia.
   */
  | { type: "metadata"; entityId: string; patch: Record<string, string | number | boolean | null> }
  /**
   * Sustituye la presentación EXPLÍCITA de la entidad (color, tipo de línea y
   * grosor propios, frente a los heredados de la capa). Es lo que MATCHPROP
   * copia y lo único que no cabe en `properties`, que es por adaptador y no
   * expone el contexto. `null` la borra entera, devolviendo la entidad a
   * PorCapa — que es un resultado distinto de «no cambiar nada» y por eso se
   * puede pedir.
   */
  | { type: "presentation"; entityId: string; presentation: CadEntityPresentation | null }
  | { type: "hatch-association"; entityId: string; associative: boolean }
  | { type: "dimension-association"; entityId: string; associative: boolean }
  | { type: "mleader-association"; entityId: string; associative: boolean }
  | { type: "delete"; entityId: string }
  /**
   * Restricciones y parámetros: SECCIONES del documento, no entidades.
   *
   * Van por el mismo embudo que la geometría a propósito. Un parámetro que
   * cambia mueve el dibujo, así que el cambio del parámetro y el movimiento de
   * la geometría son UNA transacción: un `commitChange`, un paso de deshacer.
   * Con dos rutas separadas, deshacer dejaría el dibujo movido y el parámetro
   * viejo, o al revés.
   *
   * `entity` se declara ausente en vez de omitirse porque el anfitrión decide
   * qué capa comprobar preguntando `"entityId" in command ? … : command.entity`,
   * y estos comandos no apuntan a ninguna entidad.
   */
  | { type: "constraint"; entity?: undefined; op: "upsert"; constraint: CadConstraint }
  | { type: "constraint"; entity?: undefined; op: "delete"; constraintId: string }
  /** Quita TODAS las restricciones que tocan estas entidades (DELCONSTRAINT). */
  | { type: "constraint"; entity?: undefined; op: "clear"; entityIds: string[] }
  | {
      type: "parameter";
      entity?: undefined;
      op: "set";
      parameter: { name: string; expression: string; comment?: string };
    }
  | { type: "parameter"; entity?: undefined; op: "delete"; name: string }
  /**
   * La tabla de ESTILOS, que es otra sección del documento.
   *
   * Existe porque `STYLE`, `DIMSTYLE`, `MLEADERSTYLE` y `TABLESTYLE` tienen que
   * poder escribirla, y sin esto sólo podían hacerlo llamando a `commitChange`
   * por su cuenta — una segunda ruta de mutación, que es exactamente la
   * propiedad que este módulo existe para impedir. Con esto, «crea el estilo
   * COTAS-2 y aplícaselo a esta cota» es UN lote y UN paso de deshacer.
   *
   * No entra en `CadDocumentSectionCommand` a propósito: aquella rama resuelve
   * el sistema de restricciones entero, y definir un estilo de texto no mueve
   * geometría. Pagar un solve por un cambio de fuente sería gratuito sólo en un
   * dibujo vacío.
   */
  | {
      type: "style";
      entity?: undefined;
      op: "upsert";
      family: CadStyleFamilyName;
      name: string;
      values: Readonly<Record<string, string | number | boolean>>;
    }
  | { type: "style"; entity?: undefined; op: "delete"; family: CadStyleFamilyName; name: string };

/** Las cinco familias de `CadStyleTable`. */
export type CadStyleFamilyName = "text" | "dimension" | "mleader" | "table" | "plot";

/** Los que operan sobre secciones del documento y no sobre entidades. */
type CadDocumentSectionCommand = Extract<CadEntityCommand, { type: "constraint" | "parameter" }>;
type CadStyleCommand = Extract<CadEntityCommand, { type: "style" }>;

const isSectionCommand = (command: CadEntityCommand): command is CadDocumentSectionCommand =>
  command.type === "constraint" || command.type === "parameter";

const isStyleCommand = (command: CadEntityCommand): command is CadStyleCommand =>
  command.type === "style";

/**
 * Aplica los comandos de estilo sobre la tabla, sin tocar lo que no nombran.
 *
 * `upsert` FUSIONA: escribir sólo la altura de un estilo de texto no debe
 * borrarle la fuente. Un valor `undefined` no llega hasta aquí —el tipo no lo
 * admite—, así que no hay forma accidental de vaciar un campo; para eso está
 * borrar el estilo entero.
 */
function applyStyleCommands(
  styles: CadStyleTable,
  commands: readonly CadStyleCommand[],
): CadStyleTable {
  if (commands.length === 0) return styles;
  const next: CadStyleTable = {
    text: { ...styles.text },
    dimension: { ...styles.dimension },
    mleader: { ...(styles.mleader ?? {}) },
    table: { ...styles.table },
    plot: { ...styles.plot },
  };
  for (const command of commands) {
    const name = command.name.trim();
    if (!name) throw new Error("Un estilo necesita un nombre no vacío.");
    const family = next[command.family] as Record<string, Record<string, unknown>>;
    if (command.op === "delete") {
      delete family[name];
      continue;
    }
    family[name] = { ...(family[name] ?? {}), ...command.values };
  }
  // La familia `mleader` es OPCIONAL en el esquema: materializarla como `{}` en
  // un documento que nunca la tuvo cambiaría su serializado y con él su hash.
  if (Object.keys(next.mleader ?? {}).length === 0 && !styles.mleader) delete next.mleader;
  return next;
}

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
  if (command.type === "image-definition") return `image-definition:${command.definition.id}`;
  if (isStyleCommand(command)) return `style:${command.op}:${command.family}:${command.name}`;
  if (isSectionCommand(command)) return `${command.type}:${command.op}`;
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
  // Catálogo de imágenes: se copia sólo si el lote lo toca, para que un
  // documento que nunca insertó una imagen siga sin la sección y su serializado
  // no cambie.
  let imageDefinitions = document.imageDefinitions;
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

  const sectionCommands: CadDocumentSectionCommand[] = [];
  const styleCommands: CadStyleCommand[] = [];

  for (const command of commands) {
    if (isStyleCommand(command)) {
      styleCommands.push(command);
      continue;
    }
    if (isSectionCommand(command)) {
      sectionCommands.push(command);
      continue;
    }
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

    if (command.type === "image-definition") {
      const id = command.definition.id;
      if (!id) throw new Error("An image definition needs a non-empty id.");
      const existing = imageDefinitions ?? [];
      imageDefinitions = existing.some((definition) => definition.id === id)
        ? existing.map((definition) => (definition.id === id ? { ...command.definition } : definition))
        : [...existing, { ...command.definition }];
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
    } else if (command.type === "metadata") {
      const merged: Record<string, string | number | boolean | null> = {
        ...(source.context?.metadata ?? {}),
      };
      for (const [key, value] of Object.entries(command.patch)) {
        if (value === null) delete merged[key];
        else merged[key] = value;
      }
      // Un `metadata` vacío se quita entero, y un contexto que se queda sin
      // nada también: dejar `{}` colgando cambiaría el serializado de todas las
      // entidades que nunca han tenido metadatos y rompería la comparación de
      // documentos.
      const context: CadEntityContext = { ...(source.context ?? {}) };
      if (Object.keys(merged).length === 0) delete context.metadata;
      else context.metadata = merged;
      present.set(
        source.id,
        Object.keys(context).length === 0
          ? { ...source, context: undefined }
          : { ...source, context },
      );
      regenerationSourceIds.push(source.id);
    } else if (command.type === "presentation") {
      const context: CadEntityContext = { ...(source.context ?? {}) };
      if (command.presentation === null) delete context.presentation;
      else context.presentation = structuredClone(command.presentation);
      const empty = Object.keys(context).length === 0;
      present.set(source.id, empty ? { ...source, context: undefined } : { ...source, context });
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

  // Las secciones se aplican DESPUÉS de la geometría y ANTES de regenerar los
  // asociativos: si cambiar un parámetro mueve una línea, la cota que la mide
  // tiene que enterarse dentro de esta misma transacción.
  const sections = applyDocumentSections(document, sectionCommands, present);
  for (const entity of sections.movedEntityIds) {
    touchedIds.push(entity);
    regenerationSourceIds.push(entity);
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
  const staged: CadDocument = {
    ...document,
    entities,
    constraints: sections.constraints,
    styles: applyStyleCommands(document.styles, styleCommands),
    modelSpace: { entityIds: [...createdBackIds, ...ordered] },
    // Mismo criterio que `parameters` justo debajo: el catálogo de imágenes
    // sólo viaja si el lote lo tocó o si el documento ya lo traía.
    ...(imageDefinitions ? { imageDefinitions } : {}),
  };
  // La sección de parámetros sólo existe si se usa: materializarla como `[]`
  // cambiaría el serializado de todos los documentos que hoy no la tienen, y
  // con él sus hashes.
  if (sections.parameters === undefined) delete staged.parameters;
  else staged.parameters = sections.parameters;
  const nextDocument = commitChange(staged, label);
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

/**
 * Aplica los comandos de sección y RESUELVE las restricciones sobre el estado
 * ya editado.
 *
 * Resolver aquí dentro es lo que hace que «cambio el parámetro `ancho`» y «el
 * perfil se reajusta» sean el mismo paso de deshacer. Si el sistema resultante
 * es imposible, se LANZA: el ejecutor por lotes es atómico y el anfitrión ya
 * revierte al checkpoint. Un dibujo medio reajustado es peor que un cambio que
 * no se hizo, porque nadie sabe qué parte es la buena.
 *
 * Sólo se resuelve cuando el lote toca restricciones o parámetros. Una edición
 * corriente de geometría no paga este coste; de propagar las restricciones tras
 * mover algo ya se encarga el editor con `solveCadConstraints`.
 */
function applyDocumentSections(
  document: CadDocument,
  commands: readonly CadDocumentSectionCommand[],
  present: Map<string, CadEntity>,
): { constraints: CadConstraint[]; parameters: CadParameter[] | undefined; movedEntityIds: string[] } {
  if (commands.length === 0)
    return { constraints: document.constraints, parameters: document.parameters, movedEntityIds: [] };

  let constraints = [...document.constraints];
  let parameters = [...(document.parameters ?? [])];
  const unit = document.meta.unit;

  for (const command of commands) {
    if (command.type === "constraint") {
      if (command.op === "delete") {
        constraints = constraints.filter((constraint) => constraint.id !== command.constraintId);
        continue;
      }
      if (command.op === "clear") {
        const targets = new Set(command.entityIds);
        constraints = constraints.filter(
          (constraint) => !constraint.entityIds.some((entityId) => targets.has(entityId)),
        );
        continue;
      }
      constraints = [
        ...constraints.filter((constraint) => constraint.id !== command.constraint.id),
        { ...command.constraint, entityIds: [...command.constraint.entityIds] },
      ].sort((a, b) => a.id.localeCompare(b.id));
      continue;
    }
    const written =
      command.op === "delete"
        ? deleteCadParameter(parameters, command.name, { unit })
        : setCadParameter(parameters, command.parameter, { unit });
    if (!written.ok) throw new Error(written.issues[0]?.message ?? "El parámetro no se pudo escribir.");
    parameters = written.parameters;
  }

  const evaluation = evaluateCadParameters(parameters, { unit });
  // Una referencia colgando NO bloquea. `setCadParameter` ya rechaza crear una,
  // así que si aparece aquí es que el documento venía con ella —importado, o
  // guardado por una versión anterior— y negarse a tocar cualquier otro
  // parámetro dejaría esa tabla imposible de arreglar desde dentro.
  const blocking = evaluation.issues.filter((issue) => issue.code !== "parameter_unknown_reference");
  if (blocking.length > 0) throw new Error(blocking[0].message);
  parameters = evaluation.parameters;

  const solution = solveConstraintSystem([...present.values()], constraints, {
    parameterValues: evaluation.values,
  });
  if (!solution.converged && constraints.some((constraint) => constraint.enabled))
    throw new Error(
      solution.issues[0]?.message ?? "Las restricciones del documento no se pueden cumplir.",
    );

  const movedEntityIds: string[] = [];
  for (const entity of solution.entities) {
    const before = present.get(entity.id);
    present.set(entity.id, entity);
    if (before && JSON.stringify(before) !== JSON.stringify(entity)) movedEntityIds.push(entity.id);
  }
  return { constraints, parameters: parameters.length > 0 ? parameters : undefined, movedEntityIds };
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
