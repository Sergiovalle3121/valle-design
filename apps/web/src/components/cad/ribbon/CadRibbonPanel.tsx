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
  return (
    <div
      data-testid={`cad-ribbon-panel-${panel.label}`}
      className="flex shrink-0 flex-col gap-1 border-r border-border/60 px-2 pb-1 pt-1.5 last:border-r-0"
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
      <div className="type-micro text-center text-muted-foreground">
        {panel.label}
      </div>
    </div>
  );
}
