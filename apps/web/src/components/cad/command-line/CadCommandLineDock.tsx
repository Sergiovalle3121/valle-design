"use client";

/**
 * La línea de comandos, conectada.
 *
 * `CadCommandLine` es presentacional a propósito y `CadCommandEngineHost` no
 * sabe de React. Éste es el único punto donde se tocan, y por eso es corto:
 * lee la instantánea y devuelve los gestos al anfitrión.
 *
 * Vive fuera del monolito para que montarla no le cueste ni una línea de JSX
 * ni un `useState` — el presupuesto de `npm run check:cad` sólo permite bajar
 * ambos números.
 *
 * ## OLA «comando» — la raíz que monta `CadShellFrame`
 *
 * Esta raíz (`cad-command-dock`) es lo que el armazón cuelga en su ranura
 * `commandDock`. Tiene que medir EXACTAMENTE lo que mide `CadCommandLine`
 * (26 px en reposo, 78 con el registro desplegado) porque el resto del
 * armazón — el lienzo de encima, que es `1fr` — se lleva lo que sobra de esa
 * cuenta. Por eso el recorrido guiado y la consola LISP, que antes se
 * apilaban aquí en flujo normal (`flex flex-col gap-2`, uno encima del otro,
 * encima de la línea de comandos), YA NO son hijos en el DOM final de esta
 * raíz: se portan a `<body>` con su propia franja flotante, fija sobre el
 * borde inferior de la ventana. Un recorrido guiado desplegado (hasta 32 vh)
 * inflando esta franja rompería el contrato de 26/78 px que el resto del
 * estudio da por hecho.
 *
 * El recorrido guiado, cuando el muelle izquierdo está a la vista, se sigue
 * pintando ahí dentro por SU PROPIO portal (`onboarding/tour-slot.ts`) — esta
 * franja flotante es sólo el sitio de respaldo para cuando ese muelle está
 * plegado u oculto, que es exactamente donde vivía antes de esta ola.
 */
import React from "react";
import { createPortal } from "react-dom";
import { useCadUiMode } from "@/components/cad/shell/ui-mode-host";
import { CadGuidedTourDock } from "../onboarding/CadGuidedTourDock";
import { CadLispDock } from "../lisp/CadLispDock";
import { submitCadLisp } from "../lisp/use-lisp";
import { CadCommandLine } from "./CadCommandLine";
import type { CadCommandEngineHost } from "./command-engine-host";
import { useCadCommandEngine } from "./use-command-engine";
import { CAD_SHELL_METRICS } from "@/components/cad/shell/cad-shell-layout";

/**
 * Cuánto separar la franja flotante de respaldo del borde de la ventana:
 * lo que la franja de comandos Y la barra de estado cobran como MÍNIMO
 * (`commandRow` + `statusRow`, importados — nunca un número nuevo). Si el
 * registro está desplegado (78 px) el hueco real es mayor y sobra aire; si
 * hiciera falta el pixel exacto habría que leer `logExpanded`, que es estado
 * interno de `CadCommandLine` y no se saca de ahí sólo para esto.
 */
const FLOATING_DOCK_BOTTOM_OFFSET = CAD_SHELL_METRICS.commandRow + CAD_SHELL_METRICS.statusRow;

export interface CadCommandLineDockProps {
  host: CadCommandEngineHost;
  /** El dibujo está en sólo lectura: se muestra el diálogo, no se acepta orden. */
  disabled?: boolean;
  /** La caja, para que el editor la enfoque al recibir un carácter desde el lienzo. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function CadCommandLineDock({ host, disabled, inputRef }: CadCommandLineDockProps) {
  const snapshot = useCadCommandEngine(host);
  return (
    <div data-testid="cad-command-dock" className="w-full">
      <CadCommandLine
        prompt={snapshot.prompt}
        wording={useCadUiMode()}
        history={snapshot.history}
        lastCommand={snapshot.lastCommand}
        activeCommand={snapshot.activeCommand}
        disabled={disabled}
        // Lo tecleado se APUNTA antes de despacharlo por si es una expresión
        // LISP: el motor normaliza a mayúsculas y eso destrozaría sus cadenas.
        // Para cualquier otra cosa esto es exactamente `host.submit`.
        onSubmit={(value) => submitCadLisp(host, value)}
        // Pulsar una opción equivale a teclear su atajo: entra por la misma
        // puerta que el texto, así que no hay una segunda semántica que mantener.
        onKeyword={(shortcut) => host.submit(shortcut)}
        onCancel={() => host.cancel()}
        onRepeat={() => host.repeat()}
        inputRef={inputRef}
      />
      {/*
        EL RECORRIDO GUIADO Y LA CONSOLA LISP, fuera de la franja. Se montan
        aquí (mismo motivo de siempre: aquí está el anfitrión) pero se PINTAN
        en un portal a `<body>`, fijo sobre el borde inferior de la ventana
        — ni `cad-command-dock` ni `CadCommandLine` los tienen como
        descendiente en el DOM final, así que ninguno de los dos puede
        engordar la franja acoplada. `pointer-events-none` en el envoltorio y
        `pointer-events-auto` en cada tarjeta: el hueco entre ambas dockeds
        deja pasar el clic al lienzo, la tarjeta se queda con el suyo.
      */}
      {typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-3 z-[80] flex flex-col-reverse items-start gap-2"
              style={{ bottom: FLOATING_DOCK_BOTTOM_OFFSET + 12 }}
            >
              {/*
                `flex-col-reverse`: el hijo que SÍ suele tener contenido (el
                recorrido) va primero en el JSX pero se pinta ABAJO de la
                pila — junto al ancla — y el de LISP (casi siempre vacío,
                `CadLispDock` devuelve `null` hasta que se abre con APPLOAD)
                queda arriba, sin gastar el hueco de 8 px de `gap-2` contra la
                franja cuando no hay nada que mostrar en él.
              */}
              {/*
                `pointer-events-none` en ESTE envoltorio, no `auto`: es de
                ancho completo, así que con `auto` se quedaba los clics de toda
                la franja aunque la tarjeta del recorrido ocupe sólo su esquina
                — el usuario pulsaba a 900 px de distancia de la tarjeta y no
                pasaba nada. La tarjeta reactiva el puntero para sí cuando
                flota (`pointer-events-auto` en su propia clase), que es lo que
                el golden 67 comprueba: lo que se ve es lo que se pulsa.
              */}
              <div className="pointer-events-none w-full">
                <CadGuidedTourDock host={host} disabled={disabled} />
              </div>
              <div className="pointer-events-auto w-full">
                <CadLispDock host={host} disabled={disabled} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default CadCommandLineDock;
