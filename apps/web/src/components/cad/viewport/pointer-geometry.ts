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

/**
 * Margen de deslizamiento de un CLIC, en píxeles de pantalla.
 *
 * Designando manda el margen corto: arrastrar sobre el lienzo es un gesto con
 * significado propio (ventana de designación, órbita) y confundirlo con un
 * clic designaría objetos que nadie pidió.
 */
export const CAD_CLICK_SLACK_PX = 5;

/**
 * El margen cuando hay un comando ESPERANDO UN PUNTO. Es más ancho a
 * propósito: ahí el arrastre no compite con nada —la órbita se fue al botón
 * derecho en cuanto el comando abrió— y el coste de los dos errores no se
 * parece. Descartar un clic bueno pierde el punto EN SILENCIO: el usuario ve
 * que no pasa nada y concluye que el programa no responde, que es exactamente
 * la queja que abrió este trabajo («es incómodo hasta usando el mouse»).
 *
 * 12 px ≈ 3 mm en pantalla de 96 ppp. El umbral de arrastre de Windows son 4,
 * y una mano apoyada en un ratón de mesa mueve entre 1 y 10 entre pulsar y
 * soltar; por encima de 12 ya es un desplazamiento querido.
 */
export const CAD_CLICK_SLACK_DRAWING_PX = 12;

/**
 * ¿El gesto fue un CLIC? Entra el desplazamiento entre pulsar y soltar, en
 * píxeles, y si hay un comando esperando un punto; sale la decisión. Con DEDO
 * no se usa: allí manda el reconocedor táctil, porque deslizar es APUNTAR.
 */
export function cadPointerIsClick(
  dx: number,
  dy: number,
  awaitingPoint: boolean,
): boolean {
  const slack = awaitingPoint ? CAD_CLICK_SLACK_DRAWING_PX : CAD_CLICK_SLACK_PX;
  return Math.hypot(dx, dy) < slack;
}
