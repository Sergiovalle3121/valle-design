/**
 * LA INSIGNIA 3D DEL HERO.
 *
 * El hero vendía sólo el dibujo 2D — el plano dibujándose en `<PlanViewport>`,
 * que sigue siendo la prueba más fuerte de la página y no se toca. Pero desde
 * ADR-0016 la identidad del producto es «CAD 2D general y universal, y
 * modelador 3D de modelado directo» (`IDENTITY.md`), y el hero seguía sin
 * decirlo. Esta insignia cierra ESE hueco: un cubo girando muy despacio,
 * junto al texto que nombra la capacidad.
 *
 * ── POR QUÉ ES CSS 3D Y NO THREE.JS ──────────────────────────────────────
 * La primera versión usaba un `<canvas>` de WebGL (Three.js, carga perezosa
 * en un efecto). Medido en CI (PR #203, gate de Lighthouse móvil): `/` caía
 * de 77-81 a 64-67 (umbral 78) y el TBT subía de ~150 ms a 561-582 ms — SÓLO
 * en la ruta con la insignia; `/register` y `/precios` sin cambio. Diferir el
 * arranque a `requestIdleCallback` no lo arregló: el runner de Lighthouse
 * rasteriza WebGL por software (sin GPU real — igual que el resto del CI, ver
 * los jobs con SwiftShader/Mesa) y compilar el shader de un `WebGLRenderer`
 * es un costo fijo caro ahí, con o sin retraso, agravado por la
 * ralentización 4× de CPU del emulado móvil.
 *
 * `transform-style: preserve-3d` con seis caras es un cubo real —proyección
 * en perspectiva, sombreado por cara, giro— sin un solo byte de JavaScript:
 * lo compone el hilo de composición del navegador, no el principal, así que
 * no cuenta contra el TBT ni exige un contexto WebGL en ningún runner. Es
 * Server Component a propósito, por la misma razón: nada que hidratar.
 *
 * `prefers-reduced-motion` no necesita lógica propia aquí: la regla global de
 * `globals.css` (`animation-duration: 0.001ms !important`) ya aplasta esta
 * animación como cualquier otra del sitio.
 */
export function Brep3DBadge({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ perspective: "160px", display: "grid", placeItems: "center" }}
    >
      {/*
        El cubo mide 2/3 del contenedor a propósito: el contenedor recorta en
        círculo (`rounded-full overflow-hidden` en el llamador), y un cubo a
        tamaño completo saca sus esquinas del círculo en la mayoría de los
        ángulos de giro — ahí sólo se ve una cara plana, sin facetas. Inscrito
        con margen, las caras y sus costuras quedan visibles pase lo que pase.
      */}
      <div className="brep-cube">
        <span className="brep-cube-face brep-cube-face--front" />
        <span className="brep-cube-face brep-cube-face--back" />
        <span className="brep-cube-face brep-cube-face--right" />
        <span className="brep-cube-face brep-cube-face--left" />
        <span className="brep-cube-face brep-cube-face--top" />
        <span className="brep-cube-face brep-cube-face--bottom" />
      </div>
    </div>
  );
}
