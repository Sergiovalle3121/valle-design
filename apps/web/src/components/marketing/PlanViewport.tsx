import { PlanDrawing } from "@/components/brand/PlanDrawing";
import { cx } from "@/components/ui";

/**
 * EL VISOR DEL HERO — el plano dibujándose, dentro de una lámina.
 *
 * ── LA DECISIÓN QUE HAY DETRÁS ──────────────────────────────────────────────
 * La campaña de diseño anterior arregló la carencia número uno de esta portada:
 * vendía un CAD sin enseñar un dibujo. Puso capturas REALES del editor, y ésa
 * sigue siendo la prueba más fuerte que tiene la página — por eso no se toca y
 * vive justo debajo, en la banda de prueba visual.
 *
 * Lo que una captura no puede hacer es enseñar el ACTO. Un plano terminado
 * demuestra que el programa existe; una línea apareciendo demuestra que
 * dibuja. Este visor pone eso en el hero.
 *
 * ── POR QUÉ NO FINGE SER LA APLICACIÓN ──────────────────────────────────────
 * Deliberadamente NO lleva barra de ventana, ni paletas, ni botones falsos.
 * Una interfaz dibujada a mano que imita el producto es una mentira barata: el
 * visitante entra esperando esa pantalla y encuentra otra. Esto se presenta por
 * lo que es —una lámina con su cajetín y sus marcas de registro— y la
 * aplicación de verdad se enseña con capturas de la aplicación de verdad.
 *
 * Las marcas de esquina, la retícula y la numeración de lámina salen del
 * sistema (`corner-marks`, `blueprint-grid`, `type-sheet-number`): el visor no
 * inventa un lenguaje visual propio, consume el de la casa.
 */
export function PlanViewport({
  className,
  lamina = "A-01",
  rotulo = "Planta baja · esc 1:50",
}: {
  className?: string;
  lamina?: string;
  rotulo?: string;
}) {
  return (
    <figure
      className={cx(
        "corner-marks relative overflow-hidden rounded-surface border border-border bg-card shadow-floating",
        className,
      )}
    >
      {/* La retícula del papel, por debajo de todo y sin capturar el puntero. */}
      <div
        aria-hidden="true"
        className="blueprint-grid pointer-events-none absolute inset-0 opacity-60 dark:opacity-45"
      />

      {/* Cabecera de lámina: numeración y rótulo, en mono y tabular. */}
      <div className="relative flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <span className="type-sheet-number text-primary-ink">{lamina}</span>
        <span className="type-mono type-micro truncate text-muted-foreground">
          {rotulo}
        </span>
      </div>

      <div className="relative px-4 py-5 sm:px-7 sm:py-8">
        <PlanDrawing className="h-auto w-full" />
      </div>
    </figure>
  );
}
