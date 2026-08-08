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
  return (
    <CadCommandLine
      prompt={snapshot.prompt}
      history={snapshot.history}
      lastCommand={snapshot.lastCommand}
      disabled={disabled}
      onSubmit={(value) => host.submit(value)}
      // Pulsar una opción equivale a teclear su atajo: entra por la misma
      // puerta que el texto, así que no hay una segunda semántica que mantener.
      onKeyword={(shortcut) => host.submit(shortcut)}
      onCancel={() => host.cancel()}
      onRepeat={() => host.repeat()}
    />
  );
}

export default CadCommandLineDock;
