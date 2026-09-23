"use client";

import { cx } from "@/components/ui";
import type { CadRibbonCommand } from "@/lib/cad/ribbon";
import { cadRibbonSmallWidth } from "@/lib/cad/ribbon-layout";
import {
  CadRibbonTooltip,
  type CadRibbonTooltipText,
} from "./CadRibbonTooltip";
import { CAD_COMMAND_ICONS } from "./command-icons";
import { CAD_RIBBON_PANEL_ICONS } from "./ribbon-icons";
import { useCadActiveCommand } from "./active-command";

/**
 * Botón de un comando canónico: un clic y la línea de comandos comparten el
 * mismo despacho. El rótulo está en español; el tooltip añade código y alias.
 *
 * large: 68 px, icono de 24 px y rótulo debajo que puede ocupar dos líneas.
 * small: tres filas de 20 px; icono de 16 px y rótulo a su derecha. Su ancho
 * mínimo es 80 px en modo denso o 112 px en disperso, y crece según el texto.
 * menu: fila de 192 px dentro del desplegable.
 *
 * cadRibbonSmallWidth comparte el cálculo con el plan de columnas. Golden
 * 214 verifica que los rótulos completos caben; aria-label y title conservan
 * el nombre accesible y la explicación del comando. El tooltip se monta en
 * un portal para que la tira no lo recorte.
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

/** Las tres líneas del tooltip, como el de AutoCAD: rótulo · NOMBRE (alias) · descripción. */
export function cadRibbonButtonTooltip(
  command: CadRibbonCommand,
): CadRibbonTooltipText {
  return {
    title: command.label,
    shortcut: cadRibbonCommandCode(command),
    label: command.summary,
  };
}

export function CadRibbonButton({
  command,
  onRun,
  disabled,
  size = command.primary ? "large" : "small",
  dense = false,
}: {
  command: CadRibbonCommand;
  onRun: (name: string) => void;
  disabled?: boolean;
  size?: CadRibbonButtonSize;
  /** Sólo tiene efecto en `size="small"` — ver la nota «dense» de arriba. */
  dense?: boolean;
}) {
  // UN icono POR COMANDO (`command-icons.ts`, con su gate). El del PANEL
  // queda de red: sólo lo alcanzaría un comando sin fila, y
  // `command-icons.spec.ts` hace que eso no pueda existir.
  //
  // Indexar el mapa (no llamar una función) es lo que ya usa `CadToolPalette`
  // para el mismo problema: `react-hooks/static-components` marca un
  // componente resuelto por LLAMADA como "creado durante el render", pero no
  // el acceso directo a una tabla estática — que es justo lo que esto es.
  const Icon =
    CAD_COMMAND_ICONS[command.name] ?? CAD_RIBBON_PANEL_ICONS[command.panel];
  // ENCENDIDO mientras el motor lo tiene abierto. Sin esto el único realce era
  // `:hover`, y el ratón se va al lienzo en cuanto empiezas a dibujar: la cinta
  // no decía qué herramienta tenías en la mano (`ribbon/active-command.ts`).
  const active = useCadActiveCommand() === command.name;
  const large = size === "large";
  const denseSmall = size === "small" && dense;
  return (
    <CadRibbonTooltip
      {...cadRibbonButtonTooltip(command)}
      className={large ? "h-full" : undefined}
    >
      <button
        type="button"
        data-testid={`cad-ribbon-command-${command.name}`}
        data-primary={command.primary ? "true" : undefined}
        data-active={active ? "true" : undefined}
        // Sólo cuando está encendido: un comando no es un conmutador, y poner
        // `aria-pressed="false"` en los 264 botones los anunciaría todos como
        // si lo fueran. Cuando SÍ está corriendo, «presionado» es exactamente
        // lo que un lector de pantalla tiene que decir.
        aria-pressed={active ? true : undefined}
        data-size={size}
        data-dense={denseSmall ? "true" : undefined}
        style={
          size === "small"
            ? { width: cadRibbonSmallWidth(command, denseSmall) }
            : undefined
        }
        disabled={disabled}
        onClick={() => onRun(command.name)}
        title={cadRibbonButtonTitle(command)}
        // El nombre accesible NO puede depender de si el rótulo está
        // pintado: `getByRole('button',
        // { name: command.label })` (los localizadores de e2e) sigue
        // resolviendo porque `aria-label` no cambia con `dense`.
        aria-label={command.label}
        className={cx(
          // Sólo tokens: reposo transparente, `bg-muted` al pasar el ratón
          // (relleno y tinta son tokens distintos; `--primary` no es relleno
          // de botón), anillo `ring-ring` al enfocar con teclado.
          "group/ribbon flex shrink-0 items-center rounded-control",
          "text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-40",
          command.primary && "text-foreground",
          // El mismo encendido que el riel de paletas (`CadDockRail`): relleno
          // de marca y tinta sobre marca, no `--primary` como relleno de botón.
          active &&
            "bg-brand-strong text-primary-foreground hover:bg-brand-strong hover:text-primary-foreground",
          large
            ? "h-full w-[4.25rem] flex-col justify-start gap-0.5 px-0.5 py-0.5"
            : size === "small"
              ? cx("h-5 gap-1", denseSmall ? "px-0.5" : "px-1")
              : "h-6 w-48 gap-1.5 px-1.5",
        )}
      >
        <Icon
          aria-hidden="true"
          className={large ? "h-6 w-6 shrink-0" : "h-4 w-4 shrink-0"}
        />
        <span
          className={
            large
              ? "type-micro w-full break-words text-center leading-tight"
              : // `min-w-0`: sin él un hijo flex no encoge bajo su ancho de
                // contenido y `truncate` no tiene nada que recortar — el
                // rótulo se saldría del botón denso en vez de recortarse.
                "type-micro min-w-0 flex-1 truncate text-left leading-none"
          }
        >
          {command.label}
        </span>
      </button>
    </CadRibbonTooltip>
  );
}
