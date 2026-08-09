"use client";

/**
 * La consola LISP, conectada.
 *
 * `CadLispPalette` es presentacional y `CadLispRuntime` no sabe de React. Éste
 * es el único punto donde se tocan, y por eso es corto: busca el runtime atado
 * al anfitrión del motor, lee su instantánea y decide si hay algo que pintar.
 *
 * Devuelve `null` cuando no hay subsistema atado —un anfitrión montado a mano en
 * una spec, por ejemplo— en vez de reventar. Que la línea de comandos siga
 * funcionando sin LISP no es una comodidad: es la garantía de que enchufar el
 * subsistema no puede tumbar el editor.
 */
import React from "react";
import type { CadCommandEngineHost } from "../command-line/command-engine-host";
import { CadLispPalette } from "./CadLispPalette";
import { cadLispOf, useCadLisp } from "./use-lisp";

export interface CadLispDockProps {
  host: CadCommandEngineHost;
  disabled?: boolean;
}

export function CadLispDock({ host, disabled }: CadLispDockProps) {
  const attachment = cadLispOf(host);
  return attachment ? (
    <CadLispDockBody host={host} disabled={disabled} attachment={attachment} />
  ) : null;
}

/**
 * El cuerpo va en un componente aparte porque `useCadLisp` es un hook y no
 * puede colgar de un `if`. Sin esta separación, un anfitrión sin subsistema
 * atado cambiaría el número de hooks entre renders.
 */
function CadLispDockBody({
  host,
  disabled,
  attachment,
}: CadLispDockProps & { attachment: NonNullable<ReturnType<typeof cadLispOf>> }) {
  const snapshot = useCadLisp(attachment.runtime);
  if (!snapshot.open) return null;
  return (
    <CadLispPalette
      runtime={attachment.runtime}
      snapshot={snapshot}
      host={host}
      disabled={disabled}
    />
  );
}

export default CadLispDock;
