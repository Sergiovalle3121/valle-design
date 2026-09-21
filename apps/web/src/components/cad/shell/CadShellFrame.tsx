"use client";

import type { ReactNode } from "react";

/**
 * EL ARMAZÓN. Rejilla de 5 filas × 3 columnas que reparte el estudio entero
 * — antes cada pieza se posicionaba a mano (`fixed`, `absolute`, `bottom-3`)
 * sobre un `div.cad-shell` que sólo era `flex flex-col`, y el lienzo se
 * quedaba con lo que sobraba de dos muelles que nacían abiertos y una
 * paleta flotante encima. Aquí el reparto es EXPLÍCITO: cada ranura es una
 * prop, cada fila tiene su alto fijado por `cad-shell-layout.ts` (la única
 * fuente de esos números), y el que rellena una ranura NO decide su propia
 * posición — la rejilla decide por él.
 *
 * ## La regla de oro
 *
 * Ninguna ranura se pinta con `absolute`/`fixed`: quien la rellena entrega un
 * `<div>` normal, en el flujo, y la rejilla lo coloca. Un hijo que se saca de
 * flujo (`position: fixed`, `bottom-*`, `z-*` en su raíz) vuelve a flotar
 * sobre lo que haya debajo — exactamente el defecto que esta ola vino a
 * cerrar (línea de comandos de 480 px tapando el lienzo, paleta de 17
 * botones encima del dibujo). `scripts/cad/check-monolith-budget.mjs` no
 * vigila esto; lo vigila un `grep` en CI y este comentario para quien lea el
 * código antes que el CI.
 *
 * ## Filas y columnas
 *
 * `grid-template-rows: 32px auto 1fr auto 26px` — appBar / ribbon / canvas /
 * commandDock / statusBar. `ribbon` es `auto` porque su alto lo decide quien
 * lo rellena (0 px minimizada, 104 px desplegada) y la rejilla no debe
 * duplicar esa decisión con un número propio. `commandDock` es `auto` por lo
 * mismo: 26 px en reposo, 78 con el historial desplegado.
 *
 * `grid-template-columns: auto 1fr auto` — leftRail+leftPanel / canvas /
 * rightRail+rightPanel. El riel y el panel de un lado comparten columna
 * (van en el MISMO `<div>` de ese lado, uno junto al otro) para que el ancho
 * de esa columna sea "lo que ese lado pida" y el lienzo (`1fr`) se lleve
 * siempre lo que sobra — nunca al revés.
 */
export interface CadShellFrameProps {
  /** Fila 1, 32 px: cerrar, título, pestañas de la cinta, accesos rápidos. */
  appBar: ReactNode;
  /** Fila 2, `auto`: cuerpo de la cinta (0 px minimizada, 72 px desplegada). */
  ribbon: ReactNode;
  /** Columna 1 arriba: riel de iconos del muelle izquierdo, 44 px. */
  leftRail: ReactNode;
  /** Columna 1 abajo: panel abierto del muelle izquierdo, 0 o 280 px. */
  leftPanel: ReactNode;
  /** Columna 2, `1fr`: el lienzo — se lleva todo lo que sobra. */
  canvas: ReactNode;
  /** Columna 3 arriba: riel de iconos del muelle derecho, 44 px. */
  rightRail: ReactNode;
  /** Columna 3 abajo: panel abierto del muelle derecho, 0, 280 o 360 px. */
  rightPanel: ReactNode;
  /** Fila 4, `auto`: línea de comandos acoplada, 26 px (78 con historial). */
  commandDock: ReactNode;
  /** Fila 5, 26 px: barra de estado, una sola fila de iconos. */
  statusBar: ReactNode;
  /** Clase adicional para el contenedor raíz — nunca `fixed`/`absolute`. */
  className?: string;
}

export function CadShellFrame({
  appBar,
  ribbon,
  leftRail,
  leftPanel,
  canvas,
  rightRail,
  rightPanel,
  commandDock,
  statusBar,
  className,
}: CadShellFrameProps) {
  return (
    <div
      data-testid="cad-shell-frame"
      className={`grid h-full min-h-0 w-full min-w-0${className ? ` ${className}` : ""}`}
      style={{
        gridTemplateRows: "32px auto 1fr auto 26px",
        gridTemplateColumns: "auto 1fr auto",
      }}
    >
      <div
        data-testid="cad-shell-appbar-row"
        className="col-span-3 min-h-0 min-w-0"
        style={{ gridRow: 1, gridColumn: "1 / span 3" }}
      >
        {appBar}
      </div>
      <div
        data-testid="cad-shell-ribbon-row"
        className="col-span-3 min-h-0 min-w-0"
        style={{ gridRow: 2, gridColumn: "1 / span 3" }}
      >
        {ribbon}
      </div>
      <div
        data-testid="cad-shell-left-dock"
        className="flex min-h-0 shrink-0"
        style={{ gridRow: 3, gridColumn: 1 }}
      >
        {leftRail}
        {leftPanel}
      </div>
      <div
        className="min-h-0 min-w-0"
        style={{ gridRow: 3, gridColumn: 2 }}
      >
        {canvas}
      </div>
      <div
        data-testid="cad-shell-right-dock"
        className="flex min-h-0 shrink-0"
        style={{ gridRow: 3, gridColumn: 3 }}
      >
        {rightRail}
        {rightPanel}
      </div>
      <div
        data-testid="cad-shell-commanddock-row"
        className="col-span-3 min-h-0 min-w-0"
        style={{ gridRow: 4, gridColumn: "1 / span 3" }}
      >
        {commandDock}
      </div>
      <div
        data-testid="cad-shell-statusbar-row"
        className="col-span-3 min-h-0 min-w-0"
        style={{ gridRow: 5, gridColumn: "1 / span 3" }}
      >
        {statusBar}
      </div>
    </div>
  );
}
