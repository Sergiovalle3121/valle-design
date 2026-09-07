"use client";

import type { CadRibbonPanel as CadRibbonPanelData } from "@/lib/cad/ribbon";
import { CadRibbonButton } from "./CadRibbonButton";

/** Un panel con nombre (AutoCAD: "Dibujo", "Modificar"…) dentro de una pestaña. */
export function CadRibbonPanel({
  panel,
  onRun,
  disabledCommands,
}: {
  panel: CadRibbonPanelData;
  onRun: (name: string) => void;
  disabledCommands?: ReadonlySet<string>;
}) {
  // T-73(f): la cinta no tenía ni `role` ni `aria-label` — un lector de
  // pantalla anunciaba "grupo" (o nada) al entrar a cada panel, sin decir
  // "Dibujo" o "Modificar". `aria-labelledby` apunta al rótulo que YA se
  // pinta abajo: ni duplica el texto ni depende de mantener dos copias en
  // sincronía. No es `role="toolbar"`: ese rol EXIGE navegación con flechas
  // (un solo Tab-stop, roving tabindex) que la cinta no implementa todavía
  // — prometerlo con el rol sin dar el teclado sería peor que no marcarlo.
  const labelId = `cad-ribbon-panel-label-${panel.label}`;
  return (
    <div
      data-testid={`cad-ribbon-panel-${panel.label}`}
      role="group"
      aria-labelledby={labelId}
      // pt-0.5 / pb-0: la fila de paneles medía 80 px (54 de botones + 15 de
      // rótulo + 11 de márgenes); a 720 px de alto el lienzo necesita cada uno.
      className="flex shrink-0 flex-col gap-0.5 border-r border-border/60 px-2 pb-0 pt-0.5 last:border-r-0"
    >
      <div className="flex flex-1 flex-wrap content-start gap-0.5">
        {panel.commands.map((command) => (
          <CadRibbonButton
            key={command.name}
            command={command}
            onRun={onRun}
            disabled={disabledCommands?.has(command.name)}
          />
        ))}
      </div>
      <div id={labelId} className="type-micro text-center text-muted-foreground">
        {panel.label}
      </div>
    </div>
  );
}
