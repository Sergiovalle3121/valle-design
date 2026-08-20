/**
 * Qué capas se enseñan: la regla ÚNICA de apagada + congelada.
 *
 * ## Por qué existe este módulo
 *
 * Hasta el esquema 9, «no se ve» tenía una sola causa (`visible: false`) y la
 * pregunta se contestaba en cinco sitios distintos con el mismo filtro escrito
 * a mano. El esquema 9 añade la segunda causa —`frozen`, el bit 1 del código 70
 * de DXF— y repetir el `visible === false || frozen === true` en cada sitio es
 * exactamente cómo uno de los cinco se queda atrás y una capa congelada sigue
 * imantando el cursor. La regla vive aquí y los consumidores la importan.
 *
 * ## Congelada no es apagada
 *
 * Las dos desaparecen de la pantalla, pero la congelada además NO SE REGENERA
 * ni cuenta: no entra en la envolvente de `ZOOM Extensión`
 * (`view/document-extents.ts`), no entra en la selección ni en el enganche
 * (`native-selection-index.ts`) y no se proyecta en las ventanas de papel salvo
 * anulación explícita de la ventana (`paper-space.ts`). La apagada conserva el
 * comportamiento que ya tenía: invisible, pero presente para el índice.
 */
import type { CadLayerDef } from "./cad-document";

/** `true` si la capa se dibuja: ni apagada ni congelada. */
export function cadLayerShown(layer: CadLayerDef): boolean {
  return layer.visible && layer.frozen !== true;
}

/** `true` si la capa está congelada a nivel de documento. */
export function cadLayerFrozen(layer: CadLayerDef): boolean {
  return layer.frozen === true;
}

/**
 * Ids de las capas que NO se dibujan (apagadas o congeladas). Es el conjunto
 * que consumen el pipeline por lotes, la vista general nativa y los lotes de
 * INSERT: todos apagan por capa con un booleano, no reconstruyendo geometría.
 */
export function cadHiddenLayerIds(layers: readonly CadLayerDef[]): Set<string> {
  const hidden = new Set<string>();
  for (const layer of layers) if (!cadLayerShown(layer)) hidden.add(layer.id);
  return hidden;
}

/**
 * Ids de las capas CONGELADAS, que es un conjunto más pequeño que el de
 * ocultas: la selección y el enganche saltan sólo éstas — una capa apagada
 * sigue en el índice espacial, como siempre hizo.
 */
export function cadFrozenLayerIds(layers: readonly CadLayerDef[]): Set<string> {
  const frozen = new Set<string>();
  for (const layer of layers) if (cadLayerFrozen(layer)) frozen.add(layer.id);
  return frozen;
}
