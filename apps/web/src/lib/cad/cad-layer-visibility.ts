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
 * ## Congelada no es apagada, y desde la campaña de cimientos apagada tampoco
 * ## es imantable
 *
 * La congelada NO SE REGENERA ni cuenta: no entra en la envolvente de
 * `ZOOM Extensión` (`view/document-extents.ts`) ni se proyecta en las ventanas
 * de papel salvo anulación explícita (`paper-space.ts`). La apagada sí cuenta
 * para la envolvente y la regeneración — pero, como en cualquier CAD, lo que
 * no se ve NO se selecciona NI imanta el cursor: apagada y congelada quedan
 * fuera de la selección y del enganche (`native-selection-index.ts`, filtros
 * "snap" y "selection"). La BLOQUEADA se ve y se imanta —acotar contra un eje
 * bloqueado es el uso normal— pero no se selecciona para modificar.
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

/**
 * Ids de las capas cuyo contenido NO imanta el cursor: apagadas y congeladas.
 * Lo que no se ve no puede ser un imán — un snap de 1 mm al objeto invisible
 * equivocado cuesta más que cien comandos nuevos.
 */
export function cadUnsnappableLayerIds(layers: readonly CadLayerDef[]): Set<string> {
  return cadHiddenLayerIds(layers);
}

/**
 * Ids de las capas cuyo contenido NO se designa: apagadas, congeladas y
 * BLOQUEADAS. La bloqueada se ve y se imanta (acotar contra un eje bloqueado
 * es el uso normal), pero un clic o una ventana no la capturan para modificar.
 */
export function cadUnselectableLayerIds(layers: readonly CadLayerDef[]): Set<string> {
  const excluded = cadHiddenLayerIds(layers);
  for (const layer of layers) if (layer.locked) excluded.add(layer.id);
  return excluded;
}
