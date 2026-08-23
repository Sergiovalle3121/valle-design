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
 */
import React from "react";
import { useCadStatusBarClearance } from "./use-status-bar-clearance";
import { CadGuidedTourDock } from "../onboarding/CadGuidedTourDock";
import { CadLispDock } from "../lisp/CadLispDock";
import { submitCadLisp } from "../lisp/use-lisp";
import { CadCommandLine } from "./CadCommandLine";
import type { CadCommandEngineHost } from "./command-engine-host";
import { useCadCommandEngine } from "./use-command-engine";

export interface CadCommandLineDockProps {
  host: CadCommandEngineHost;
  /** El dibujo está en sólo lectura: se muestra el diálogo, no se acepta orden. */
  disabled?: boolean;
}

export function CadCommandLineDock({ host, disabled }: CadCommandLineDockProps) {
  const snapshot = useCadCommandEngine(host);
  // El muelle se aparta de la barra de estado por su cuenta; ver el módulo.
  useCadStatusBarClearance();
  return (
    <div className="flex w-full flex-col gap-1">
      {/*
        El recorrido guiado, encima de todo y sólo la primera vez. Se monta aquí
        por lo mismo que la consola LISP: registrarlo en el editor costaría JSX y
        un `useState` en un archivo cuyo presupuesto sólo puede bajar. Su estado
        vive fuera de React y sobrevive a los remontajes.
      */}
      <CadGuidedTourDock host={host} disabled={disabled} />
      {/*
        La consola AutoLISP, encima del diálogo y sólo cuando está abierta. Se
        pinta aquí y no en el registro de paletas del editor porque registrarla
        allí exige una línea en `Layout3DEditor.tsx`, que es de otra sesión; está
        pedida en el PR. Abrirla no cuesta un `useState` en el monolito: su
        estado vive en el runtime, fuera de React.
      */}
      <CadLispDock host={host} disabled={disabled} />
      <CadCommandLine
        prompt={snapshot.prompt}
        history={snapshot.history}
        lastCommand={snapshot.lastCommand}
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
      />
    </div>
  );
}

export default CadCommandLineDock;
