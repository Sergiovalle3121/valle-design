/**
 * El VOLUMEN 3D de piso, cielorraso y cubierta: la masa horizontal que
 * cierra un edificio de una planta por arriba y por abajo, igual que
 * `wall-solid.ts` cierra los paramentos verticales.
 *
 * ## Una sola primitiva para las tres losas
 *
 * Piso, cielorraso y cubierta son la MISMA operación —extruir un anillo de
 * planta entre dos cotas Z— con distinta huella y distinta cota. No hay
 * razón para tres funciones que dupliquen la llamada al kernel: hay una,
 * `architecturalSlabBodyLocal`, y quien la llama decide el anillo y el rango
 * de Z.
 *
 * El anillo NO se recibe en un marco local propio, a diferencia del muro: ya
 * llega en coordenadas de PLANTA (mm, el mismo `CadPoint2` del dibujo), y una
 * losa horizontal no gira nunca, así que ese mismo XY sirve directo como
 * plano de extrusión. Lo único local es Z, que aquí se mide desde el plano
 * de referencia que decida el llamador (p. ej. 0 para el nivel de piso
 * terminado), no desde el mundo.
 *
 * ## De dónde sale el anillo
 *
 * `detectCadRooms`/`buildCadBimSchedule` ya recorren el grafo de ejes de
 * muro y exponen `CadRoomAreaRow.ring` (cada local) y
 * `CadBimSchedule.exteriorRing` (la huella entera del edificio) — los dos en
 * sentido positivo (antihorario visto desde +Z), que es el que exige
 * `makePrism`. El piso y la cubierta usan el anillo EXTERIOR, no la unión de
 * los anillos de local: un piso por local dejaría sin losa la mitad exterior
 * del grosor de cada muro perimetral, y una cubierta por local dejaría un
 * local sin cubrir si algún muro interior fuera más alto que el resto.
 * Derivar el anillo de un recorrido DISTINTO al del cuadro de áreas habría
 * arriesgado que la losa 3D y la tabla 2D discreparan sobre dónde está el
 * edificio — el mismo motivo por el que `CadRoomAreaRow.ring` existe.
 */
import { makePrism, type BrepBody } from "../brep";
import type { CadPoint2 } from "./cad-document";

/**
 * Cuerpo B-rep de una losa horizontal: el anillo dado, extruido entre `z0` y
 * `z1`. `null` para una entrada degenerada —anillo de menos de 3 vértices o
 * rango de Z no positivo— o si el kernel rechaza el anillo (autointersección,
 * área nula tras la triangulación): una losa que no se puede construir no
 * cae silenciosa a un cuerpo vacío, se declara ausente.
 */
export function architecturalSlabBodyLocal(
  ring: readonly CadPoint2[],
  z0: number,
  z1: number,
): BrepBody | null {
  if (ring.length < 3 || !(z1 > z0)) return null;
  try {
    return makePrism(ring, z0, z1);
  } catch {
    return null;
  }
}

/**
 * Altura de apoyo para cielorraso y cubierta: la MENOR entre los muros que
 * cierran el edificio. Un edificio de una planta con todos los muros a la
 * misma altura da esa altura sin más. Si algún muro midiera menos que los
 * demás, apoyar la losa en la altura mayor la dejaría flotando sobre ese
 * muro corto —atravesándolo, que es justo lo que ningún corte de esta
 * campaña puede permitir—, así que se elige la opción que nunca atraviesa un
 * muro: la más baja. `null` sin muros que apoyen nada.
 */
export function conservativeWallTop(
  walls: readonly { height: number }[],
): number | null {
  if (walls.length === 0) return null;
  return Math.min(...walls.map((wall) => wall.height));
}
