"use client";

/**
 * LA LÍNEA DE COMANDOS SE APARTA DE LA BARRA DE ESTADO.
 *
 * ## El defecto
 *
 * El muelle de la línea de comandos está clavado a `bottom-14` (56 px) y la
 * barra de estado del estudio es `absolute bottom-3` con `flex-wrap`: a 1440 px
 * envuelve en dos renglones, mide 57 px de alto y su borde superior queda en
 * 831. El muelle terminaba en 844. Trece píxeles de solape, y la barra de
 * estado —coordenadas del cursor, capa activa, OSNAP— se leía a través del
 * panel translúcido de la línea de comandos. Salió en la captura de portada
 * antes que en ninguna prueba.
 *
 * ## Por qué una medida y no un número
 *
 * La barra ENVUELVE. Un `bottom-24` clavado arregla los 1440 px de la captura y
 * vuelve a romperse en cuanto la ventana estrecha y la barra pasa a tres
 * renglones, o cuando el modo enfoque la esconde y el muelle queda flotando muy
 * alto sin motivo. Lo que hay que respetar es la ALTURA REAL de la barra, así
 * que se mide.
 *
 * ## Por qué se mide por `.cad-status-bar`
 *
 * Porque esa clase NO es una utilidad de Tailwind: es un gancho semántico que
 * la hoja global ya usa para reformar la barra en pantalla táctil
 * (`globals.css`, `.cad-shell .cad-status-bar`). Es decir, ya era un contrato
 * entre el monolito y el resto del árbol antes de este módulo; atarse a él no
 * inventa un acoplamiento, usa el que existe. Atarse a una utilidad de Tailwind
 * —`absolute bottom-3`— sí habría sido lo que el registro del viewport existe
 * para evitar.
 *
 * ## Por qué vive fuera del monolito
 *
 * `Layout3DEditor.tsx` sólo puede encoger. Aquí no le cuesta NADA: el editor
 * conserva su `bottom-14` intacto y quien se desplaza es la línea de comandos,
 * por su cuenta, con un desfase relativo. Sin este módulo montado la variable no
 * existe, el desfase es cero y todo se queda exactamente donde estaba.
 */
import { useEffect } from "react";

/** La barra de estado del estudio. Gancho semántico, no utilidad. */
const STATUS_BAR = ".cad-shell .cad-status-bar";

/**
 * La variable que lee LA LÍNEA DE COMANDOS —no su envoltorio—.
 *
 * Es lo que MÁS de los 56 px de fábrica hace falta, y se aplica como desfase
 * RELATIVO sobre la propia línea. La diferencia no es de estilo: el envoltorio
 * es una columna que la línea comparte con el acompañante de los primeros cinco
 * minutos y con la consola AutoLISP, así que subir el ENVOLTORIO sube los tres.
 * Medido con los goldens: subirlo 21 px puso en rojo el 12 (lazo y ventana
 * sobre el lienzo) y dos casos del 39 (arrastre de grip), porque los BOTONES
 * del acompañante —que sí reclaman el ratón— aterrizaban sobre las coordenadas
 * del plano que esas pruebas pinchan. Con los tres en su sitio y la línea
 * desplazada sola, los catorce casos vuelven a verde.
 */
export const CAD_COMMAND_LINE_CLEARANCE_VAR =
  "--cad-command-line-clearance-extra";

/** Lo que el envoltorio ya reserva por su cuenta (`bottom-14`). */
const BASE_CLEARANCE_PX = 56;

/** Aire entre el borde inferior del muelle y el superior de la barra. */
const GAP_PX = 8;

/**
 * Calcula el hueco que la línea de comandos debe dejar por debajo.
 *
 * Puro y exportado para su spec: la barra es `absolute bottom-3` dentro del
 * lienzo, así que lo que hay que reservar es lo que va desde el borde inferior
 * de ese contenedor hasta el borde superior de la barra, más el aire.
 *
 * Sin barra visible (modo enfoque) devuelve `null`, que significa «quita la
 * variable y vuelve al valor de fábrica del editor».
 */
export function cadStatusBarClearancePx(
  bar: { top: number; height: number } | null,
  containerBottom: number,
): number | null {
  if (!bar || bar.height <= 0) return null;
  const clearance = containerBottom - bar.top + GAP_PX - BASE_CLEARANCE_PX;
  return Number.isFinite(clearance) && clearance > 0
    ? Math.round(clearance)
    : null;
}

/**
 * Publica la variable mientras el muelle esté montado y la retira al salir.
 *
 * Se escribe en `:root` y no en el contenedor del editor porque el envoltorio
 * del muelle es hijo suyo y hereda igual, y `:root` no obliga a este módulo a
 * conocer la estructura del monolito para encontrar dónde escribir.
 */
export function useCadStatusBarClearance(): void {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    /** La barra que el observador tiene fichada ahora mismo. */
    let observed: Element | null = null;

    // La barra reenvuelve al redimensionar y cambia de alto al aparecer o
    // desaparecer un indicador; medir en el cuadro siguiente evita leer el
    // layout a mitad de la misma tarea que lo está cambiando.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    const resize = new ResizeObserver(schedule);
    // El modo enfoque MONTA y DESMONTA la barra, y eso no es un cambio de
    // tamaño: hay que enterarse por el árbol. `childList` sin `subtree` sobre
    // su contenedor directo es exacto y cuesta lo que cuesta un CAD dibujando
    // —nada—; observar `document.body` entero sí habría metido una tarea por
    // cada renglón que la barra de estado repinta.
    const mounts = new MutationObserver(schedule);

    function apply() {
      frame = 0;
      const bar = document.querySelector(STATUS_BAR);
      const container = bar?.parentElement ?? null;
      if (bar !== observed) {
        if (observed) resize.unobserve(observed);
        if (bar) resize.observe(bar);
        observed = bar;
      }
      if (!bar || !container) {
        root.style.removeProperty(CAD_COMMAND_LINE_CLEARANCE_VAR);
        return;
      }
      const barRect = bar.getBoundingClientRect();
      const clearance = cadStatusBarClearancePx(
        { top: barRect.top, height: barRect.height },
        container.getBoundingClientRect().bottom,
      );
      if (clearance === null)
        root.style.removeProperty(CAD_COMMAND_LINE_CLEARANCE_VAR);
      else
        root.style.setProperty(
          CAD_COMMAND_LINE_CLEARANCE_VAR,
          `${clearance}px`,
        );
    }

    const host = document.querySelector(STATUS_BAR)?.parentElement;
    if (host) mounts.observe(host, { childList: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      mounts.disconnect();
      window.removeEventListener("resize", schedule);
      root.style.removeProperty(CAD_COMMAND_LINE_CLEARANCE_VAR);
    };
  }, []);
}
