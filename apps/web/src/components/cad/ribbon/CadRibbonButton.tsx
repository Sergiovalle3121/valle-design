"use client";

import { cx, Tooltip } from "@/components/ui";
import type { CadRibbonCommand } from "@/lib/cad/ribbon";
import { CAD_COMMAND_ICONS } from "./command-icons";
import { CAD_RIBBON_PANEL_ICONS } from "./ribbon-icons";

/**
 * UN BOTÓN DE LA CINTA = UN COMANDO DEL REGISTRO.
 *
 * `onRun` despacha el nombre canónico exactamente por el mismo camino que la
 * línea de comandos (`CadCommandEngineHost.invoke`, ver
 * `Layout3DEditor.tsx`): un clic aquí y teclear el comando y pulsar Intro
 * son la MISMA acción, no dos implementaciones que puedan divergir.
 *
 * ## Tres tamaños, como en AutoCAD
 *
 *   · `large`: el botón grande del panel (`command.primary`): icono de 24 px
 *     y el rótulo debajo, en dos líneas si hace falta. Mide 4,25 rem.
 *   · `small`: una fila de 20 px con el icono de 16 px y el rótulo a la
 *     derecha; el panel apila tres. Mide 7 rem.
 *   · `menu`: la fila del desplegable del panel, más ancha porque ahí no
 *     hay presupuesto de cinta.
 *
 * Los anchos son FIJOS a propósito: `lib/cad/ribbon-layout.ts` calcula con
 * ellos cuántos botones caben en la ventana sin medir el DOM
 * (`CAD_RIBBON_METRICS`). Cambiar un `w-*` aquí exige cambiar la constante.
 *
 * El rótulo es el español del oficio (`command-labels.ts`: «Línea», no
 * LINE); el nombre canónico y su alias viven en el tooltip y en el `title`
 * nativo, que es lo que lee un lector de pantalla y lo que sobrevive sin CSS.
 */
export type CadRibbonButtonSize = "large" | "small" | "menu";

/** Rótulo · NOMBRE (alias) — resumen: el `title` nativo del botón. */
export function cadRibbonButtonTitle(command: CadRibbonCommand): string {
  return `${command.label} · ${cadRibbonCommandCode(command)} — ${command.summary}`;
}

/** «LINE (L)»: el nombre canónico con su primer alias, si lo tiene. */
export function cadRibbonCommandCode(command: CadRibbonCommand): string {
  const shortcut = command.aliases[0];
  return `${command.name}${shortcut ? ` (${shortcut})` : ""}`;
}

export function CadRibbonButton({
  command,
  onRun,
  disabled,
  size = command.primary ? "large" : "small",
}: {
  command: CadRibbonCommand;
  onRun: (name: string) => void;
  disabled?: boolean;
  size?: CadRibbonButtonSize;
}) {
  // UN icono POR COMANDO (`command-icons.ts`, con su gate). El del PANEL
  // queda de red: sólo lo alcanzaría un comando sin fila, y
  // `command-icons.spec.ts` hace que eso no pueda existir.
  //
  // Indexar el mapa (no llamar una función) es lo que ya usa `CadToolPalette`
  // para el mismo problema: `react-hooks/static-components` marca un
  // componente resuelto por LLAMADA como "creado durante el render", pero no
  // el acceso directo a una tabla estática — que es justo lo que esto es.
  const Icon = CAD_COMMAND_ICONS[command.name] ?? CAD_RIBBON_PANEL_ICONS[command.panel];
  const large = size === "large";
  return (
    <Tooltip
      title={command.label}
      shortcut={cadRibbonCommandCode(command)}
      label={command.summary}
      side="bottom"
      className={large ? "h-full" : undefined}
    >
      <button
        type="button"
        data-testid={`cad-ribbon-command-${command.name}`}
        data-primary={command.primary ? "true" : undefined}
        data-size={size}
        disabled={disabled}
        onClick={() => onRun(command.name)}
        title={cadRibbonButtonTitle(command)}
        className={cx(
          // Sólo tokens: reposo transparente, `bg-muted` al pasar el ratón
          // (relleno y tinta son tokens distintos; `--primary` no es relleno
          // de botón), anillo `ring-ring` al enfocar con teclado.
          "group/ribbon flex shrink-0 items-center rounded-control",
          "text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-40",
          command.primary && "bg-brand-strong/5 text-foreground",
          large
            ? "h-full w-[4.25rem] flex-col justify-start gap-0.5 px-0.5 py-0.5"
            : size === "small"
              ? "h-5 w-28 gap-1 px-1"
              : "h-6 w-48 gap-1.5 px-1.5",
        )}
      >
        <Icon aria-hidden="true" className={large ? "h-6 w-6 shrink-0" : "h-4 w-4 shrink-0"} />
        <span
          className={
            large
              ? "type-micro w-full break-words text-center leading-tight"
              : "type-micro whitespace-nowrap leading-none"
          }
        >
          {command.label}
        </span>
      </button>
    </Tooltip>
  );
}
