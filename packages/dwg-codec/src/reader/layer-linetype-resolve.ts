/**
 * Resolución del handle de tipo de línea de cada capa a su NOMBRE.
 *
 * Vive aparte de los dos ensambladores porque los dos hacen exactamente lo
 * mismo y por la misma razón: la tabla LTYPE se construye DESPUÉS de recorrer
 * los objetos, así que durante el recorrido sólo se puede transportar el
 * handle, y el nombre se resuelve al cerrar. Dos copias de este paso serían
 * dos sitios donde una divergencia entre el camino R2000 y el R2010+ no la
 * vería ninguna prueba.
 */
import type { Ac1015DatabaseLayer } from "./database-model.js";
import type { Ac1015DatabaseTableEntry } from "../objects/tables-symbol.js";

/** Los nombres de tabla viajan como bytes de la página de códigos del dibujo. */
const decodeName = (bytes: readonly number[]): string =>
  String.fromCharCode(...bytes).replace(/\0+$/, "");

/**
 * Devuelve las capas con `linetypeName` resuelto contra la tabla LTYPE del
 * MISMO dibujo. Un handle que la tabla no trae deja el nombre `undefined`: se
 * declara la ausencia en vez de inventar un tipo de línea que el archivo no
 * dice, y el handle se conserva para poder nombrar a qué apuntaba.
 */
export function resolveLayerLinetypeNames(
  layers: readonly Ac1015DatabaseLayer[],
  linetypes: readonly Ac1015DatabaseTableEntry[],
): readonly Ac1015DatabaseLayer[] {
  const nameOf = new Map<number, string>();
  for (const entry of linetypes) nameOf.set(entry.handle, decodeName(entry.name));
  return Object.freeze(
    layers.map((layer) =>
      Object.freeze({
        ...layer,
        linetypeName:
          layer.linetypeHandle === undefined
            ? undefined
            : nameOf.get(layer.linetypeHandle),
      }),
    ),
  );
}
