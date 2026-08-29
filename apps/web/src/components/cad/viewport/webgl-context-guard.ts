/**
 * EL CONTEXTO WEBGL SE PIERDE, Y HAY QUE ENTERARSE.
 *
 * ## El fallo que esto cierra
 *
 * El editor ya trata bien el caso «este navegador no da WebGL»: la creación del
 * `WebGLRenderer` va en un `try/catch` y el viewport se degrada con un telón
 * honesto. Lo que no trataba es el otro caso, que le pasa a máquinas que sí
 * tienen WebGL: **el contexto se pierde en marcha**. Un reinicio del driver, la
 * GPU quedándose sin memoria con un plano denso, un portátil cambiando de
 * tarjeta al desenchufarse — el navegador emite `webglcontextlost`, deja de
 * pintar, y el bucle `requestAnimationFrame` sigue llamando a `render()` sobre
 * un contexto muerto.
 *
 * El síntoma para el usuario es el peor posible: el lienzo se queda **congelado
 * con el último fotograma dibujado**. No hay error, no hay aviso, el resto de la
 * interfaz responde. Parece que el programa funciona y que su dibujo dejó de
 * cambiar. Sigue moviendo cosas y guardando encima de un plano que no ve.
 *
 * ## Lo que hace este guardián
 *
 * 1. `preventDefault()` sobre `webglcontextlost`. Sin eso el navegador NUNCA
 *    emite `webglcontextrestored`: la recuperación depende literalmente de esa
 *    línea, y es la que más se olvida.
 * 2. Avisa a quien lo monta para que pare el bucle y encienda el telón.
 * 3. Avisa de la restauración para que el bucle vuelva a arrancar.
 *
 * No decide qué se le enseña al usuario ni reconstruye la escena: eso es del
 * editor, que es quien sabe qué había dibujado.
 */
export interface CadWebglContextHandlers {
  /** El contexto se perdió: parar de pintar y decirlo. */
  onLost: () => void;
  /** El navegador devolvió el contexto: se puede volver a pintar. */
  onRestored: () => void;
}

/**
 * Engancha el guardián a un lienzo. Devuelve la función que lo suelta; llamarla
 * dos veces es seguro.
 */
export function guardCadWebglContext(
  canvas: HTMLCanvasElement,
  { onLost, onRestored }: CadWebglContextHandlers,
): () => void {
  const alPerder = (event: Event) => {
    // SIN esto no hay restauración posible. La especificación de WebGL lo dice
    // así: el agente de usuario sólo intenta restaurar el contexto si el evento
    // de pérdida fue cancelado.
    event.preventDefault();
    onLost();
  };
  const alRestaurar = () => onRestored();

  canvas.addEventListener("webglcontextlost", alPerder, false);
  canvas.addEventListener("webglcontextrestored", alRestaurar, false);

  let soltado = false;
  return () => {
    if (soltado) return;
    soltado = true;
    canvas.removeEventListener("webglcontextlost", alPerder, false);
    canvas.removeEventListener("webglcontextrestored", alRestaurar, false);
  };
}
