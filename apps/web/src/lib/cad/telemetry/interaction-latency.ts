/**
 * LATENCIA DE INTERACCIÓN DEL ESTUDIO, MEDIDA EN EL NAVEGADOR DE VERDAD.
 *
 * ## Qué mide y por qué ésta y no otra cifra
 *
 * Mide lo que el usuario llama «va lento»: cuánto pasa desde que suelta el
 * ratón o la tecla hasta que la pantalla refleja el resultado. Es la definición
 * de INP (Interaction to Next Paint) y no la de «tiempo de render», que es la
 * que suele publicarse porque es la fácil: un render de 4 ms al final de una
 * cola de 300 ms de trabajo bloqueante da un número precioso y una interfaz
 * inservible.
 *
 * La API del navegador (`PerformanceObserver` con `type: "event"` y
 * `durationThreshold`) mide el intervalo completo — retardo de entrada,
 * procesamiento y pintado siguiente — que es exactamente el que se siente.
 *
 * ## Percentiles, no medias
 *
 * Una media esconde el caso que duele. Cien clics de 30 ms y cinco de 900 ms
 * dan una media de 71 ms —«va bien»— mientras el usuario ve el editor colgarse
 * cinco veces. Se publica p50, p75, p95 y el peor, que es el que se recuerda.
 *
 * ## Qué NO hace
 *
 * No envía nada. Recoge en memoria y expone el resumen; quién lo publica y a
 * dónde es decisión de quien lo monta. Un módulo de medida que además decide
 * mandar datos a un servidor es un módulo que no se puede usar en una prueba.
 */

/** Una interacción medida, tal como la entrega el navegador. */
export interface CadInteraction {
  /** Tipo de evento: pointerdown, keydown, click… */
  nombre: string;
  /** Milisegundos desde la entrada hasta el siguiente pintado. */
  duracion: number;
  /** Momento en que empezó, relativo al inicio de la navegación. */
  inicio: number;
}

export interface CadLatencyReport {
  muestras: number;
  p50: number;
  p75: number;
  p95: number;
  peor: number;
  /** Las cinco peores, con su tipo de evento: el «qué» del número. */
  peores: CadInteraction[];
}

/**
 * Percentil por interpolación lineal sobre la muestra ordenada.
 *
 * El método importa cuando hay pocas muestras, que es el caso normal de una
 * sesión de edición corta: tomar «el elemento en la posición n·p» redondeado
 * convierte 20 muestras en saltos del 5 % y hace que el p95 sea siempre el
 * máximo. La interpolación da un número que se mueve con los datos.
 */
export function percentil(valoresOrdenados: readonly number[], p: number): number {
  if (valoresOrdenados.length === 0) return 0;
  if (valoresOrdenados.length === 1) return valoresOrdenados[0];
  const pos = (valoresOrdenados.length - 1) * p;
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  if (bajo === alto) return valoresOrdenados[bajo];
  return (
    valoresOrdenados[bajo] +
    (valoresOrdenados[alto] - valoresOrdenados[bajo]) * (pos - bajo)
  );
}

/** Resume una lista de interacciones. Puro: se prueba sin navegador. */
export function resumirLatencia(
  interacciones: readonly CadInteraction[],
): CadLatencyReport {
  const duraciones = interacciones.map((i) => i.duracion).sort((a, b) => a - b);
  const peores = [...interacciones]
    .sort((a, b) => b.duracion - a.duracion)
    .slice(0, 5);
  return {
    muestras: interacciones.length,
    p50: percentil(duraciones, 0.5),
    p75: percentil(duraciones, 0.75),
    p95: percentil(duraciones, 0.95),
    peor: duraciones.length > 0 ? duraciones[duraciones.length - 1] : 0,
    peores,
  };
}

/**
 * Empieza a recoger. Devuelve el mando: `informe()` para leer y `detener()`
 * para soltar el observador.
 *
 * `durationThreshold: 16` — una interacción por debajo de un fotograma a 60 Hz
 * no es percibible y sólo añade ruido; 16 es además el mínimo que la
 * especificación obliga a respetar. Si el navegador no soporta la API (Safari
 * hasta hace poco), se devuelve un mando inerte en vez de lanzar: la medida es
 * opcional, la aplicación no.
 */
export function observarLatencia(
  ventana: Window & typeof globalThis = window,
): { informe: () => CadLatencyReport; detener: () => void } {
  const interacciones: CadInteraction[] = [];
  const PO = (ventana as unknown as { PerformanceObserver?: typeof PerformanceObserver })
    .PerformanceObserver;
  if (typeof PO !== "function") {
    return { informe: () => resumirLatencia(interacciones), detener: () => {} };
  }
  let observador: PerformanceObserver | null = null;
  try {
    observador = new PO((lista) => {
      for (const entrada of lista.getEntries()) {
        interacciones.push({
          nombre: entrada.name,
          duracion: entrada.duration,
          inicio: entrada.startTime,
        });
      }
    });
    observador.observe({
      type: "event",
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit);
  } catch {
    // Un navegador que no conoce el tipo "event" lanza al observar. La medida
    // se pierde; la aplicación sigue.
    observador = null;
  }
  return {
    informe: () => resumirLatencia(interacciones),
    detener: () => observador?.disconnect(),
  };
}
