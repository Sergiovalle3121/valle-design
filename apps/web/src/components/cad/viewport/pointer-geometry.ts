/**
 * Dos conversiones de puntero que el editor repetía y no podía probar.
 *
 * Salen de `Layout3DEditor.tsx` por lo de siempre —ese archivo tiene un
 * trinquete que sólo baja— y porque las dos son aritmética: entra un evento y
 * un rectángulo, sale un número. Aquí se prueban en Node; allí había que montar
 * un lienzo THREE para llegar a ellas.
 */

/** Coordenadas del evento relativas al lienzo, para colocar DOM encima. */
export function cadLocalPoint(
  event: { clientX: number; clientY: number },
  canvas: { getBoundingClientRect(): { left: number; top: number } },
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/**
 * La apertura del pickbox, de píxeles a unidades de dibujo.
 *
 * Los dos topes no son adorno: sin el suelo, una huella diminuta colapsa la
 * tolerancia a cero y nada se puede designar; sin el techo, una huella enorme
 * la hace tan grande que se designa lo que sea. La conversión en sí la hace el
 * controlador de vista, que en 2D es una división exacta —la relación
 * píxel↔mundo no es constante en perspectiva, y aproximarla con distancia de
 * cámara y FOV derivaba al acercarse.
 */
export function cadPointerWorldTolerance(
  pixels: number,
  frame: { W: number; H: number },
  convert: (pixels: number, min: number, max: number) => number,
): number {
  return convert(
    pixels,
    Math.max(0.01, Math.min(frame.W, frame.H) * 0.00001),
    Math.max(frame.W, frame.H) * 0.02,
  );
}
