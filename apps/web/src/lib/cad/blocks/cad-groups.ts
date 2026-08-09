/**
 * GROUP / UNGROUP: conjuntos con nombre que se designan de una pieza.
 *
 * ## Dónde viven los grupos, y por qué ahí
 *
 * `CadDocument` no tiene sección de grupos y `cad-document.ts` pertenece a otra
 * sesión en esta ronda, así que la pertenencia se guarda en
 * `entity.context.metadata`, que es el bolsillo que el esquema ya ofrece para
 * las asociatividades sin campo propio — es donde ARRAY deja de qué matriz
 * forma parte cada copia, y se escribe con la orden `metadata`, por la ruta
 * canónica de mutación.
 *
 * La clave es `cad:groups` y el valor una lista separada por comas, porque en
 * AutoCAD una entidad puede pertenecer a VARIOS grupos y modelarlo con un solo
 * nombre lo impediría de forma invisible: entrar en el segundo grupo sacaría
 * del primero sin decirlo. Los nombres no admiten coma, así que la lista no es
 * ambigua.
 *
 * **Lo que esto no da, y hay que decirlo:** un grupo aquí no tiene orden
 * interno propio ni el interruptor `PICKSTYLE` de AutoCAD para desactivar la
 * selección por grupo. Lo primero no lo necesita nadie todavía; lo segundo es
 * interfaz y llegará con el panel.
 */
import type { CadEntity } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";

/** Clave de metadatos donde vive la pertenencia. */
export const CAD_GROUP_METADATA_KEY = "cad:groups";

const INVALID_GROUP_NAME = /[,<>/\\":;?*|=`]/;

export function cadGroupNameIsValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 96 && !INVALID_GROUP_NAME.test(trimmed);
}

/** Los grupos a los que pertenece una entidad, en orden alfabético y sin repetir. */
export function cadGroupsOf(entity: Pick<CadEntity, "context">): string[] {
  const raw = entity.context?.metadata?.[CAD_GROUP_METADATA_KEY];
  if (typeof raw !== "string" || !raw.trim()) return [];
  return [...new Set(raw.split(",").map((name) => name.trim()).filter(Boolean))].sort();
}

export interface CadGroupSummary {
  name: string;
  entityIds: string[];
}

/** Inventario de los grupos del dibujo, con sus miembros. */
export function cadDocumentGroups(entities: readonly CadEntity[]): CadGroupSummary[] {
  const groups = new Map<string, string[]>();
  for (const entity of entities)
    for (const name of cadGroupsOf(entity)) groups.set(name, [...(groups.get(name) ?? []), entity.id]);
  return [...groups.entries()]
    .map(([name, entityIds]) => ({ name, entityIds: [...entityIds].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const writeGroups = (entityId: string, names: readonly string[]): CadEntityCommand => ({
  type: "metadata",
  entityId,
  // `null` BORRA la clave: una entidad que se queda sin grupos no debe
  // arrastrar un `cad:groups: ""` que ensucia su serializado y su hash.
  patch: { [CAD_GROUP_METADATA_KEY]: names.length ? [...names].sort().join(",") : null },
});

/**
 * GROUP: mete las entidades designadas en un grupo con nombre.
 *
 * Es idempotente por entidad: volver a agrupar algo que ya estaba dentro no
 * emite orden para ello, así que el lote no queda con escrituras que no
 * cambian nada —y por tanto no crea un paso de deshacer vacío.
 */
export function cadCreateGroupCommands(
  name: string,
  entities: readonly CadEntity[],
): CadEntityCommand[] {
  const trimmed = name.trim();
  if (!cadGroupNameIsValid(trimmed))
    throw new Error("El nombre de grupo debe tener de 1 a 96 caracteres y no puede llevar comas.");
  if (entities.length === 0) throw new Error("Un grupo necesita al menos un objeto designado.");
  return entities
    .filter((entity) => !cadGroupsOf(entity).includes(trimmed))
    .map((entity) => writeGroups(entity.id, [...cadGroupsOf(entity), trimmed]));
}

/** UNGROUP: deshace el grupo, dejando las entidades donde estaban. */
export function cadUngroupCommands(
  name: string,
  entities: readonly CadEntity[],
): CadEntityCommand[] {
  const trimmed = name.trim();
  const members = entities.filter((entity) => cadGroupsOf(entity).includes(trimmed));
  if (members.length === 0) throw new Error(`No hay ningún grupo llamado ${trimmed}.`);
  return members.map((entity) =>
    writeGroups(entity.id, cadGroupsOf(entity).filter((group) => group !== trimmed)),
  );
}

/**
 * Selección POR GRUPO: designar un miembro designa el grupo entero.
 *
 * Es la mitad del valor de un grupo —la otra es que se mueva junto— y se
 * resuelve aquí, sobre la selección, en vez de en el controlador de selección:
 * así vale igual para el ratón, para la línea de comandos y para un script.
 */
export function cadExpandSelectionByGroup(
  selection: readonly string[],
  entities: readonly CadEntity[],
): string[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const names = new Set(
    selection.flatMap((id) => {
      const entity = byId.get(id);
      return entity ? cadGroupsOf(entity) : [];
    }),
  );
  if (names.size === 0) return [...selection];
  const expanded = new Set(selection);
  for (const entity of entities)
    if (cadGroupsOf(entity).some((name) => names.has(name))) expanded.add(entity.id);
  return [...expanded].sort();
}
