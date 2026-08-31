"use client";

import { Command } from "lucide-react";
import { cx, Tooltip } from "@/components/ui";
import type { CadRibbonCommand } from "@/lib/cad/ribbon";
import { CAD_RIBBON_PANEL_ICONS } from "./ribbon-icons";

/**
 * UN BOTÓN DE LA CINTA = UN COMANDO DEL REGISTRO.
 *
 * `onRun` despacha el nombre canónico exactamente por el mismo camino que la
 * línea de comandos (`CadCommandEngineHost.invoke`, ver
 * `Layout3DEditor.tsx`): un clic aquí y teclear el comando y pulsar Intro
 * son la MISMA acción, no dos implementaciones que puedan divergir.
 */
export function CadRibbonButton({
  command,
  onRun,
  disabled,
}: {
  command: CadRibbonCommand;
  onRun: (name: string) => void;
  disabled?: boolean;
}) {
  // Indexar el mapa (no llamar una función) es lo que ya usa `CadToolPalette`
  // para el mismo problema: `react-hooks/static-components` marca un
  // componente resuelto por LLAMADA como "creado durante el render", pero no
  // el acceso directo a una tabla estática — que es justo lo que esto es.
  const Icon = CAD_RIBBON_PANEL_ICONS[command.panel] ?? Command;
  const shortcut = command.aliases[0];
  return (
    <Tooltip label={command.summary} shortcut={shortcut} side="bottom">
      <button
        type="button"
        data-testid={`cad-ribbon-command-${command.name}`}
        disabled={disabled}
        onClick={() => onRun(command.name)}
        title={`${command.name}${shortcut ? ` (${shortcut})` : ""} — ${command.summary}`}
        className={cx(
          "group/ribbon flex w-16 shrink-0 flex-col items-center gap-1 rounded-control px-1.5 py-1.5",
          "text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
        <span className="type-micro text-center leading-tight">
          {command.name}
        </span>
      </button>
    </Tooltip>
  );
}
