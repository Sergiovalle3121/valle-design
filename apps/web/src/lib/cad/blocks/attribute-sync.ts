/**
 * ATTSYNC — poner al día los atributos de las referencias de un bloque.
 *
 * ## El defecto que cierra, dicho como se sufre
 *
 * Un despacho define su cajetín como bloque con seis atributos y lo inserta en
 * cuarenta láminas. A media obra hace falta uno más —`REVISION`— o cambia la
 * altura de `PROYECTO`. Se redefine el bloque y… las cuarenta referencias que
 * ya estaban siguen igual: sin la etiqueta nueva, con la altura vieja. En
 * AutoCAD eso lo arregla `ATTSYNC`; aquí no existía ninguna orden que lo
 * hiciera, y hacerlo a mano son cuarenta ediciones que nadie hace.
 *
 * ## Las cuatro reglas, y por qué cada una
 *
 * 1. **Lo que el dibujante escribió NO se pierde.** Una etiqueta que ya tenía
 *    valor lo conserva. Sincronizar no es reiniciar: si `ATTSYNC` borrara los
 *    valores, nadie lo usaría dos veces.
 * 2. **Lo que la definición añade, entra** con su valor por defecto. Es lo
 *    único que justifica la orden.
 * 3. **Lo que la definición ya no declara, sale.** Una etiqueta huérfana no se
 *    dibuja, no se puede editar y aun así viaja en el archivo y sale en las
 *    extracciones de datos: es basura que parece dato.
 * 4. **Un atributo CONSTANTE toma siempre el valor de la definición.** Es lo
 *    que significa constante; conservar el que tuviera sería conservar una
 *    mentira.
 *
 * La geometría —posición, altura, estilo, invisibilidad— se recalcula SIEMPRE
 * desde la definición con la matriz del INSERT (`cadResolvePositionedAttributes`),
 * que es justo la mitad que un `ATTEDIT` no puede arreglar.
 *
 * ## Lo que NO hace, y se dice
 *
 * No toca el bloque: sincroniza las REFERENCIAS con la definición que ya hay.
 * Y no emite nada para una referencia que ya está al día — un `ATTSYNC` sobre
 * un dibujo limpio no puede dejar un paso de deshacer que no cambió nada.
 */
import type {
  CadBlockDefinition,
  CadDocument,
  CadEntity,
} from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import type { CadNativeEntity } from "../entity-runtime";
import { cadResolvePositionedAttributes } from "./positioned-attributes";

type CadInsertEntity = Extract<CadEntity, { type: "insert" }>;

export interface CadAttsyncResult {
  commands: CadEntityCommand[];
  /** Referencias que de verdad cambian. */
  updated: number;
  /** Referencias miradas, cambien o no. */
  visited: number;
  /** Etiquetas que entran, sin repetir y en orden. */
  added: string[];
  /** Etiquetas que salen, sin repetir y en orden. */
  removed: string[];
}

/** Los valores que le tocan a una referencia según la definición vigente. */
export function cadAttsyncValues(
  block: Pick<CadBlockDefinition, "attributes">,
  current: Record<string, string> | undefined,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [tag, definition] of Object.entries(block.attributes ?? {}))
    next[tag] = definition.constant
      ? (definition.defaultValue ?? "")
      : (current?.[tag] ?? definition.defaultValue ?? "");
  return next;
}

/** ¿Dos mapas de atributos dicen lo mismo? */
function sameValues(a: Record<string, string>, b: Record<string, string> | undefined): boolean {
  const claves = Object.keys(a);
  const otras = Object.keys(b ?? {});
  if (claves.length !== otras.length) return false;
  return claves.every((clave) => (b ?? {})[clave] === a[clave]);
}

/** ¿La geometría resuelta es la misma? Se compara en forma estable. */
function samePositioned(
  a: readonly unknown[] | undefined,
  b: readonly unknown[] | undefined,
): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/**
 * Las órdenes que ponen al día las referencias de un bloque.
 *
 * `blockName` acota a un bloque por su nombre o su id; sin él, todo el dibujo.
 *
 * Se recorren las entidades del documento y nada más: en este modelo las
 * referencias VIVAS viven todas ahí —una presentación guarda ventanas y los
 * atributos de su cajetín, no entidades sueltas—, y las que están DENTRO de una
 * definición de bloque no son referencias del dibujo, así que tampoco se
 * sincronizan. Es lo mismo que hace ATTSYNC en AutoCAD.
 */
export function cadAttsyncCommands(
  document: Pick<CadDocument, "entities" | "blocks">,
  blockName?: string,
): CadAttsyncResult {
  const buscado = blockName?.trim().toLocaleLowerCase();
  const definitions = new Map<string, CadBlockDefinition>();
  for (const block of document.blocks ?? []) {
    definitions.set(block.id, block);
    definitions.set(block.name.toLocaleLowerCase(), block);
  }

  const commands: CadEntityCommand[] = [];
  const added = new Set<string>();
  const removed = new Set<string>();
  let updated = 0;
  let visited = 0;

  const visit = (entities: readonly CadEntity[]): void => {
    for (const entity of entities) {
      if (entity.type !== "insert") continue;
      const block =
        definitions.get(entity.block) ??
        definitions.get(entity.block.toLocaleLowerCase());
      if (!block) continue;
      if (
        buscado &&
        block.name.toLocaleLowerCase() !== buscado &&
        block.id.toLocaleLowerCase() !== buscado
      )
        continue;
      visited += 1;

      const insert = entity as CadInsertEntity;
      const values = cadAttsyncValues(block, insert.attributes);
      const positioned = cadResolvePositionedAttributes(block, insert, values);
      const igual =
        sameValues(values, insert.attributes) &&
        samePositioned(positioned, insert.positionedAttributes);
      if (igual) continue;

      for (const tag of Object.keys(values))
        if (!(tag in (insert.attributes ?? {}))) added.add(tag);
      for (const tag of Object.keys(insert.attributes ?? {}))
        if (!(tag in values)) removed.add(tag);

      updated += 1;
      const siguiente = {
        ...insert,
        // Un mapa VACÍO no se escribe: un INSERT sin atributos no debe estrenar
        // un `attributes: {}` que antes no tenía, porque eso cambiaría el
        // archivo guardado sin cambiar el dibujo.
        ...(Object.keys(values).length > 0
          ? { attributes: values }
          : { attributes: undefined }),
        ...(positioned.length > 0
          ? { positionedAttributes: positioned }
          : { positionedAttributes: undefined }),
      };
      commands.push({
        type: "replace",
        entityId: insert.id,
        entity: siguiente as unknown as CadNativeEntity,
      });
    }
  };

  visit(document.entities);

  return {
    commands,
    updated,
    visited,
    added: [...added].sort((a, b) => a.localeCompare(b, "es")),
    removed: [...removed].sort((a, b) => a.localeCompare(b, "es")),
  };
}
