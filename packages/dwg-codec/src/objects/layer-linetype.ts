/**
 * El tipo de línea de una capa, por su handle — UN SOLO criterio.
 *
 * QUÉ FALTABA. El códec decodificaba la tabla LTYPE entera —patrón,
 * alineación y trazos, en las cinco versiones— y también la tabla de capas,
 * pero el registro de capa no llevaba NINGUNA referencia al tipo de línea:
 * los dos extremos estaban leídos y el puente entre ellos no existía. Una
 * capa de ejes con `TRAZOS` llegaba al lienzo dibujada continua.
 *
 * DÓNDE VIVE. El hecho de que el tipo de línea viaja POR HANDLE en el flujo
 * final de la entrada ya estaba registrado (`ODA-ODS-DWG-5.4.1-PUBLIC`); lo
 * que faltaba era SU POSICIÓN, y eso se midió:
 * `scripts/dwg/probe-layer-linetype.mjs` contrasta TODAS las posiciones del
 * flujo contra el oráculo DXF del mismo dibujo sobre 98 capas de las cinco
 * versiones. La posición 4 acierta en 98/98; las posiciones 0 a 3 no aciertan
 * ni una sola vez y ninguna resuelve siquiera a una entrada LTYPE.
 *
 * LA MISMA POSICIÓN, DOS LECTORES. R2000/R2004 la encuentra en el tramo
 * opaco que el decodificador de LAYER ya localizaba; R2010+ en su flujo de
 * handles propio. Que una sola posición sirva para las cinco versiones es un
 * resultado medido, no una analogía — por eso la constante vive aquí, una
 * vez, y no repetida en cada camino.
 *
 * LO QUE NO SE INTERPRETA. La posición 5, presente sólo en parte del corpus,
 * no resuelve a ningún LTYPE: es el plotstyle según el hecho ya registrado, y
 * se deja sin interpretar. Lo que se midió es dónde está el tipo de línea.
 */
import type { DwgResolvedHandle } from "../codecs/bitcodes.js";

/**
 * Posición MEDIDA del handle del tipo de línea dentro del flujo final de una
 * entrada LAYER, contando desde cero. Las cuatro anteriores son propietario,
 * reactores/xdictionary y demás referencias que este intake no interpreta.
 */
export const LAYER_LINETYPE_HANDLE_POSITION = 4;

/**
 * Devuelve el handle del tipo de línea de una capa, o `undefined` si el flujo
 * no llega a la posición medida.
 *
 * NO LANZA, Y ESO ES DELIBERADO. Un flujo más corto de lo medido no es
 * corrupción —el objeto se leyó entero y su CRC cuadra— sino una forma que
 * este intake no cubre. Reventar la apertura del dibujo por no saber su tipo
 * de línea sería un fallo cerrado mal colocado: el llamador declara la
 * ausencia como pérdida y la capa se dibuja continua, que es lo que ya hacía.
 * Un handle nulo se trata igual que la ausencia: el archivo dice
 * explícitamente que no apunta a ninguna parte.
 */
export function selectLayerLinetypeHandle(
  handles: readonly DwgResolvedHandle[],
): number | undefined {
  const reference = handles[LAYER_LINETYPE_HANDLE_POSITION];
  if (reference === undefined || reference.kind === "null") return undefined;
  return reference.handle;
}
