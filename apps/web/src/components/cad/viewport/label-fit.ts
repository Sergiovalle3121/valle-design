/**
 * QUE EL RÓTULO QUEPA EN SU CARTEL.
 *
 * ## El defecto, visible en la portada
 *
 * `makeNoteLabel` medía el texto, TOPABA la anchura del cartel en 520 px… y
 * luego dibujaba el texto entero, centrado, sobre ese cartel topado. Todo lo
 * que sobrepasaba el tope se salía por los dos lados y lo recortaba el borde
 * del lienzo. En /demo se leía «bitación — plantilla universal»: al rótulo de
 * la plantilla —«Casa habitación — plantilla universal»— le faltaban las
 * primeras letras, en la primera pantalla que ve cualquiera que entra.
 *
 * ## Qué hace ahora, y en qué orden
 *
 * 1. Si cabe, no se toca nada. Es el caso de «SALA» y «COCINA».
 * 2. Si no cabe, se ENCOGE la letra hasta que quepa, con un suelo: por debajo
 *    del 60 % del tamaño original un rótulo deja de leerse a la distancia a la
 *    que se mira un plano, y un rótulo ilegible no es mejor que uno recortado.
 * 3. Y si ni encogido cabe, se RECORTA con puntos suspensivos. Recortar
 *    diciéndolo es honesto; recortar en silencio —lo de antes— hace que el
 *    usuario lea otra cosa distinta de la que el documento dice.
 *
 * La función es pura y recibe el medidor: así se comprueba en Node, sin
 * lienzo, y sirve igual para el cartel oscuro de `makeLabel` y para el amarillo
 * de `makeNoteLabel`.
 */

/** Cuánto mide un texto con un tamaño de letra dado, en píxeles. */
export type CadLabelMeasure = (text: string, fontSize: number) => number;

export interface CadFittedLabel {
  /** El texto que se dibuja: el mismo, o recortado con «…». */
  readonly text: string;
  /** El tamaño de letra con el que se dibuja. */
  readonly fontSize: number;
  /** `true` si hubo que quitar caracteres: quien lo pinta puede decirlo aparte. */
  readonly truncated: boolean;
}

/** Por debajo de esto el rótulo deja de leerse; mejor recortar que encoger más. */
const SUELO = 0.6;

export function cadFitLabelText(
  text: string,
  fontSize: number,
  maxWidth: number,
  measure: CadLabelMeasure,
): CadFittedLabel {
  const limpio = text ?? "";
  if (!(maxWidth > 0) || limpio.length === 0)
    return { text: limpio, fontSize, truncated: false };

  const anchoOriginal = measure(limpio, fontSize);
  if (anchoOriginal <= maxWidth) return { text: limpio, fontSize, truncated: false };

  // 2. Encoger, sin bajar del suelo. Se calcula por proporción y se comprueba,
  //    porque una fuente no escala exactamente lineal con el tamaño.
  const minimo = Math.max(1, Math.floor(fontSize * SUELO));
  const propuesto = Math.max(minimo, Math.floor((fontSize * maxWidth) / anchoOriginal));
  let tamano = propuesto;
  while (tamano > minimo && measure(limpio, tamano) > maxWidth) tamano -= 1;
  if (measure(limpio, tamano) <= maxWidth)
    return { text: limpio, fontSize: tamano, truncated: false };

  // 3. Recortar, diciéndolo. Búsqueda binaria sobre el número de caracteres:
  //    medir carácter a carácter en un rótulo largo se nota al abrir un plano
  //    con cientos de ellos.
  let bajo = 0;
  let alto = limpio.length;
  while (bajo < alto) {
    const medio = Math.ceil((bajo + alto) / 2);
    if (measure(`${limpio.slice(0, medio)}…`, tamano) <= maxWidth) bajo = medio;
    else alto = medio - 1;
  }
  return { text: `${limpio.slice(0, bajo)}…`, fontSize: tamano, truncated: true };
}
