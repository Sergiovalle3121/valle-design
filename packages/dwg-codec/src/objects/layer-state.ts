/**
 * Semántica de las banderas de estado de una capa — UN SOLO criterio.
 *
 * QUÉ CAMBIA. El `BS` de estado de LAYER se decodificaba en las cinco
 * versiones y se declaraba PÉRDIDA: «su semántica bit a bit sigue sin fuente
 * registrada y no se interpreta». Para el usuario eso no era prudencia, era
 * un dibujo mal abierto: toda capa llegaba al lienzo como visible y editable,
 * así que una capa CONGELADA se dibujaba igual que las demás. Leer el número
 * y no saber qué significa es, en el producto, no haberlo leído.
 *
 * CÓMO SE MIDIÓ, Y CONTRA QUÉ. `04-capas` del corpus admitido está construido
 * a propósito con una capa congelada y una bloqueada, y su DXF fuente dice
 * cuál es cuál ANTES de mirar el binario. La sonda
 * `scripts/dwg/probe-layer-state-flags.mjs` contrasta las DIECISÉIS
 * posiciones de bit contra ese oráculo sobre 98 capas de 57 fixtures en las
 * cinco versiones: el bit 0 acierta siempre para congelada y el bit 3 siempre
 * para bloqueada, y ninguna otra posición separa ninguno de los dos hechos.
 *
 * LA TRAMPA QUE HABRÍA CAÍDO SOLA. El grupo 70 del DXF marca «bloqueada» con
 * el valor 4 —el bit 2—, y el DWG la marca en el bit 3. Copiar la convención
 * del DXF por analogía habría acertado en congelada y fallado en bloqueada:
 * el peor error posible, el que funciona a medias y nadie mira dos veces.
 *
 * LO QUE NO SE AFIRMA. Los bits 1, 2 y 4..15 son CONSTANTES en todo el corpus
 * y no se les atribuye significado: un bit que nunca varía no puede falsar
 * nada, por muy sugerente que sea su valor. Y la capa APAGADA —que el DXF
 * codifica con color negativo— no aparece ni una vez en el corpus, así que no
 * se mide, no se afirma, y el llamador la declara como pérdida.
 */

/** Bit medido de «capa congelada»: 1 en 5/5 casos positivos, 0 en 93/93. */
export const LAYER_STATE_FROZEN_BIT = 0;
/** Bit medido de «capa bloqueada». NO es el bit 2 del grupo 70 del DXF. */
export const LAYER_STATE_LOCKED_BIT = 3;

/** Máscara de los dos bits cuya semántica está medida. */
const MEASURED_MASK = (1 << LAYER_STATE_FROZEN_BIT) | (1 << LAYER_STATE_LOCKED_BIT);
/**
 * Bits 4..9, observados a UNO en las 98 capas del corpus sin una sola
 * excepción. No se interpretan; se registran para poder decir cuándo un
 * archivo se sale de lo medido.
 */
const OBSERVED_ONES_MASK = 0b11_1111_0000;
/** Ancho del `BS` que transporta las banderas. */
const STATE_FLAGS_MASK = 0xffff;

export interface LayerStateInterpretation {
  /** Medido: el bit 0. Una capa congelada no se dibuja. */
  readonly frozen: boolean;
  /** Medido: el bit 3. Una capa bloqueada se dibuja pero no se edita. */
  readonly locked: boolean;
  /**
   * Bits que se apartan del patrón constante observado en todo el corpus —
   * unos donde siempre hubo ceros, o ceros donde siempre hubo unos. No es un
   * error: es la frontera de lo medido, y existe para que el llamador pueda
   * DECLARAR que este archivo trae estado que este laboratorio no interpreta,
   * en vez de callarlo.
   */
  readonly unmeasuredBits: number;
}

/**
 * Interpreta el `BS` de estado de una capa. Nunca lanza: el estado fuera de
 * lo medido no es corrupción ni capacidad ausente, es un hecho que se
 * transporta al llamador para que lo declare.
 */
export function interpretLayerStateFlags(stateFlags: number): LayerStateInterpretation {
  const flags = stateFlags & STATE_FLAGS_MASK;
  // Se acusa la desviación en los DOS sentidos: un bit encendido donde el
  // corpus siempre trajo cero, y uno apagado donde siempre trajo uno. Mirar
  // sólo el primer sentido dejaría pasar en silencio la mitad de los casos
  // nuevos, que es justo la clase de omisión que este módulo existe para
  // evitar.
  const unexpectedOnes = flags & ~(MEASURED_MASK | OBSERVED_ONES_MASK) & STATE_FLAGS_MASK;
  const unexpectedZeros = ~flags & OBSERVED_ONES_MASK & STATE_FLAGS_MASK;
  return Object.freeze({
    frozen: (flags & (1 << LAYER_STATE_FROZEN_BIT)) !== 0,
    locked: (flags & (1 << LAYER_STATE_LOCKED_BIT)) !== 0,
    unmeasuredBits: unexpectedOnes | unexpectedZeros,
  });
}
