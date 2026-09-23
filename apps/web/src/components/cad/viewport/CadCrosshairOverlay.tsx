import type { Ref } from "react";

/**
 * La cruz filar, su cuadro de designación y la apertura de captura.
 *
 * ## Por qué el ancla mide CERO
 *
 * El contenedor es un punto sin tamaño (`size-0`) colocado con `transform`
 * exactamente sobre el píxel del cursor. No es un descuido: la fixture
 * `e2e/fixtures/world-point.ts` comprueba que `Math.round(bounds.x)` es la
 * coordenada del puntero, y todo lo que cuelga de aquí se centra con
 * `left-1/2 top-1/2 -translate-*`, así que el ancla tiene que ser el punto.
 *
 * ## Y por qué los brazos se miden contra la PANTALLA
 *
 * Aquí estuvo el defecto, vivo desde que existe la mira: los brazos pedían
 * `width: 32%` y `height: 32%`, y un porcentaje se resuelve contra el bloque
 * contenedor… que mide 0×0. Un 32 % de cero es cero. La mira existía en el
 * DOM, `display` decía `block`, y su caja medía 0×0 píxeles: nadie la vio
 * nunca. Quien dibujaba apuntaba con el cuadradito de 8 px del pickbox.
 *
 * La intención era «32 % de la pantalla», que es lo que significa CURSORSIZE
 * en AutoCAD, así que se miden en `vw`/`vh`. El lienzo no es exactamente la
 * ventana —le quitan sitio la cinta y la barra de estado—, pero la diferencia
 * es de unas decenas de píxeles sobre brazos de varios cientos, y a cambio no
 * hace falta medir nada en cada movimiento del ratón.
 *
 * `mix-blend-difference` es lo que hace que la cruz se vea igual sobre el
 * fondo oscuro, sobre un muro claro y sobre un sombreado: se invierte contra
 * lo que tenga debajo en vez de confiar en un color fijo.
 */
export function CadCrosshairOverlay({
  ref,
  crosshairPercent,
  pickBoxPx,
  aperturePx,
}: {
  /** El editor lo mueve con `transform` en cada `pointermove`. */
  ref?: Ref<HTMLDivElement>;
  /** Largo de los brazos, en porcentaje de pantalla (CURSORSIZE). */
  crosshairPercent: number;
  /** Lado del cuadro de designación, en píxeles. */
  pickBoxPx: number;
  /** Radio de la apertura de captura, en píxeles. */
  aperturePx: number;
}) {
  return (
    <div
      ref={ref}
      data-testid="cad-crosshair"
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-20 hidden size-0"
    >
      <span
        className="absolute left-1/2 top-1/2 h-px -translate-x-1/2 -translate-y-1/2 bg-indigo-100/90 mix-blend-difference"
        style={{ width: `${crosshairPercent}vw` }}
      />
      <span
        className="absolute left-1/2 top-1/2 w-px -translate-x-1/2 -translate-y-1/2 bg-indigo-100/90 mix-blend-difference"
        style={{ height: `${crosshairPercent}vh` }}
      />
      <span
        data-testid="cad-pick-box"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-indigo-100/90 mix-blend-difference"
        style={{ width: pickBoxPx, height: pickBoxPx }}
      />
      <span
        data-testid="cad-snap-aperture"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-amber-300/60"
        style={{ width: aperturePx * 2, height: aperturePx * 2 }}
      />
    </div>
  );
}
