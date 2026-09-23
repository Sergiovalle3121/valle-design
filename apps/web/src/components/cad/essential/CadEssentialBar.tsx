"use client";

import { Ellipsis, Search } from "lucide-react";
import { cx } from "@/components/ui";
import { useCadActiveCommand } from "@/components/cad/ribbon/active-command";
import { CAD_ESSENTIAL_TOOLS, type CadEssentialTool } from "./essential-tools";

/**
 * LA BARRA DEL MODO ESENCIAL: una fila de 56 px (`h-14`,
 * `CAD_SHELL_METRICS.essentialBar`) que ocupa la ranura `ribbon` del armazón
 * en lugar de la cinta. Doce herramientas con icono de 16 px y rótulo A LA
 * DERECHA en una sola fila: bajo el `@media` táctil de `globals.css` todo
 * botón del CAD mide 44 px como mínimo, y con el rótulo debajo del icono la
 * barra se pasaría de los 70 px que dejan el lienzo por debajo del 75 %.
 *
 * Sin `absolute` ni `fixed`: es una ranura del armazón, no un flotante sobre
 * el lienzo. `dispatch` es el MISMO punto de entrada que recibe la cinta;
 * «Seleccionar» va por `onSelectTool` porque no es una orden del motor.
 *
 * La ranura vacía `cad-essential-bar-tools` del extremo derecho la usa la
 * píldora de borrador (ORTO/Terminar) para acoplarse aquí en vez de flotar.
 */
export interface CadEssentialBarProps {
  /** Nombre canónico → motor, la misma lambda que recibe `CadRibbon`. */
  dispatch: (commandName: string) => void;
  /** «Seleccionar»: el modo de designación del editor, no una orden. */
  onSelectTool: () => void;
  /** «Buscar · Ctrl K»: abre la paleta de comandos. */
  onOpenPalette: () => void;
  /** «Más herramientas»: quien monta la barra decide qué enseña. */
  onMore: () => void;
  readOnly?: boolean;
  /** Ref callback de la ranura derecha; sin él la ranura queda vacía. */
  attachToolsSlot?: (element: HTMLDivElement | null) => void;
}

// Sólo tokens, como `CadRibbonButton`: reposo transparente, `bg-muted` al
// pasar el ratón, anillo `ring-ring` con teclado. `h-9` deja 8 px de aire
// arriba y abajo dentro de los 56 px de la barra.
const BOTON = cx(
  "flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-1.5",
  "text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:pointer-events-none disabled:opacity-40",
);

export function CadEssentialBar({
  dispatch,
  onSelectTool,
  onOpenPalette,
  onMore,
  readOnly = false,
  attachToolsSlot,
}: CadEssentialBarProps) {
  const ejecutar = (tool: CadEssentialTool) => {
    if ("tool" in tool.run) onSelectTool();
    else dispatch(tool.run.command);
  };
  return (
    <div
      data-testid="cad-essential-bar"
      role="toolbar"
      aria-label="Herramientas esenciales"
      className="flex h-14 w-full items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b border-border bg-surface px-1.5"
    >
      {CAD_ESSENTIAL_TOOLS.map((tool) => (
        <EssentialToolButton
          key={tool.id}
          tool={tool}
          // Mismo apagado que la cinta: en sólo lectura sólo lo que muta.
          disabled={readOnly && tool.mutates}
          onRun={ejecutar}
        />
      ))}
      <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-border" />
      <button
        type="button"
        data-testid="cad-essential-search"
        aria-keyshortcuts="Control+K"
        title="Abrir la búsqueda de comandos, herramientas y símbolos"
        onClick={onOpenPalette}
        className={BOTON}
      >
        <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="type-micro leading-none">Buscar · Ctrl K</span>
      </button>
      <button
        type="button"
        data-testid="cad-essential-more"
        title="Abrir todas las herramientas del estudio"
        onClick={onMore}
        className={BOTON}
      >
        <Ellipsis aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="type-micro leading-none">Más herramientas</span>
      </button>
      <div
        data-testid="cad-essential-bar-tools"
        ref={attachToolsSlot}
        className="ml-auto flex shrink-0 items-center gap-1"
      />
    </div>
  );
}

function EssentialToolButton({
  tool,
  disabled,
  onRun,
}: {
  tool: CadEssentialTool;
  disabled: boolean;
  onRun: (tool: CadEssentialTool) => void;
}) {
  // Leer el icono de la tabla (no llamar una función) es lo que hacen
  // `CadRibbonButton` y `CadToolPalette` para que
  // `react-hooks/static-components` no lo tome por un componente creado
  // durante el render.
  const Icon = tool.icon;
  // ENCENDIDO: la herramienta cuyo comando tiene abierto el motor, y
  // «Seleccionar» cuando no hay ninguno —que es el reposo, igual que en
  // AutoCAD. Sin esto, pulsar «Muro» no cambiaba nada en pantalla y sólo se
  // sabía qué herramienta había en la mano leyendo el aviso del borde
  // inferior (`ribbon/active-command.ts` guarda la medición).
  const activo = useCadActiveCommand();
  const esComando = "command" in tool.run;
  const encendido = esComando ? tool.run.command === activo : activo === null;
  return (
    <button
      type="button"
      data-testid={`cad-essential-tool-${tool.id}`}
      data-active={encendido ? "true" : undefined}
      aria-pressed={encendido ? true : undefined}
      disabled={disabled}
      onClick={() => onRun(tool)}
      title={tool.title}
      className={cx(
        BOTON,
        // Dos encendidos, no uno. El comando EN CURSO lleva el relleno de marca
        // con su tinta emparejada: es una herramienta armada y tiene que verse
        // desde el otro lado de la pantalla. El reposo —«Seleccionar»— se marca
        // en gris: dice dónde estás sin gritar, y deja la barra en calma, que
        // es lo que se midió como bueno en la Tanda 1.
        encendido && esComando && "bg-brand-strong text-primary-foreground hover:bg-brand-strong",
        encendido && !esComando && "bg-muted text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="type-micro leading-none">{tool.label}</span>
    </button>
  );
}
