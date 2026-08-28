"use client";

/**
 * «AQUÍ FALTAN PANELES, Y ES POR EL ANCHO» — dicho, no escondido.
 *
 * ── Qué se descubrió al mirarlo en un teléfono de verdad ──────────────────
 *
 * El estudio **arranca** en 390 px: el lienzo se pinta, la línea de comandos
 * responde y nada se sale de la pantalla. Eso está bien. Lo que no estaba bien
 * es lo que pasa con los muelles laterales: a partir de `max-[1100px]` se
 * ocultan por CSS —el panel de capas, el de propiedades, la bandeja de
 * símbolos— **sin decir una palabra**.
 *
 * Para quien lo abre en el móvil, eso no se lee como «esta pantalla es
 * estrecha»: se lee como «este programa no tiene gestor de capas». Es
 * exactamente la clase de degradación silenciosa que la campaña persigue —el
 * producto pareciendo menos de lo que es, sin que nadie pueda saberlo.
 *
 * ── Por qué un aviso y no una pared ───────────────────────────────────────
 *
 * Porque el estudio SÍ sirve en un móvil para lo que la gente hace en un móvil:
 * abrir el plano que le acaban de mandar y mirarlo. Bloquearlo sería quitar
 * algo que funciona. El aviso dice lo que falta y por qué, y se quita de en
 * medio: se descarta con un toque y no vuelve en esa pestaña.
 *
 * ── Por qué vive aquí y se monta desde `CadPaletteOverlays` ───────────────
 *
 * `Layout3DEditor.tsx` sólo puede encoger. `CadPaletteOverlays` ya es el
 * anfitrión de lo que flota sobre el lienzo y no necesita ninguna propiedad
 * nueva para pintar esto, así que el editor no suma ni una línea.
 */
import { useEffect, useState } from "react";

/**
 * El mismo umbral que el CSS que oculta los muelles (`max-[1100px]:hidden` en
 * el editor). Si alguien mueve uno sin el otro, el aviso mentiría — por eso
 * está escrito aquí con su nombre y su razón, y no como un número suelto.
 */
export const CAD_DOCK_BREAKPOINT_PX = 1100;

const DISMISSED_KEY = "valle:cad:small-screen-notice";

export function CadSmallScreenNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const decidir = () => {
      let descartado = false;
      try {
        descartado = sessionStorage.getItem(DISMISSED_KEY) === "1";
      } catch {
        // Pestaña privada o almacenamiento apagado: el modo de fallo correcto
        // es enseñar el aviso, no romper el estudio.
      }
      setVisible(!descartado && window.innerWidth < CAD_DOCK_BREAKPOINT_PX);
    };
    decidir();
    window.addEventListener("resize", decidir);
    return () => window.removeEventListener("resize", decidir);
  }, []);

  if (!visible) return null;

  return (
    <div
      data-testid="cad-small-screen-notice"
      role="status"
      /*
       * NO CAPTURA EL PUNTERO, y va abajo.
       *
       * La primera versión se pintaba arriba y sí capturaba: en una tableta de
       * 1024 px —por debajo del umbral, así que el aviso sale— se ponía encima
       * de la barra de herramientas y se comía los toques. El golden de la
       * tableta lo cazó, y tenía razón: un arquitecto en obra habría perdido el
       * primer gesto de cada sesión contra un cartel informativo.
       *
       * Es exactamente la regla que el propio `ToastContext` ya tenía escrita
       * —«una notificación NUNCA debe robar un clic a un control real»— y que
       * yo no apliqué aquí. La tarjeta deja pasar el puntero y sólo el botón de
       * cerrar lo vuelve a capturar.
       */
      className="pointer-events-none fixed inset-x-2 bottom-24 z-[92] rounded-xl border border-border bg-surface/95 px-3 py-2 shadow-lg backdrop-blur"
    >
      <p className="type-caption text-foreground">
        Esta pantalla es estrecha, así que los paneles laterales —capas,
        propiedades y la biblioteca— están plegados.{" "}
        <strong>Siguen existiendo</strong>: aparecen solos en un equipo con más
        ancho. Aquí puedes abrir el plano, mirarlo y teclear comandos.
      </p>
      <div className="mt-1.5 flex justify-end">
        <button
          type="button"
          data-testid="cad-small-screen-dismiss"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISSED_KEY, "1");
            } catch {
              // Que no se pueda recordar no impide cerrarlo ahora.
            }
            setVisible(false);
          }}
          className="pointer-events-auto rounded-lg px-2 py-1 type-micro font-semibold text-primary-ink"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
