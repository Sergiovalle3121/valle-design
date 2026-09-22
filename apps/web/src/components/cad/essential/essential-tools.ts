import { MousePointer2, type LucideIcon } from "lucide-react";
import { cadRibbonButtonTitle } from "@/components/cad/ribbon/CadRibbonButton";
import { CAD_COMMAND_ICONS } from "@/components/cad/ribbon/command-icons";
import { findCadRibbonCommand } from "@/lib/cad/ribbon";

/**
 * LAS DOCE HERRAMIENTAS DEL MODO ESENCIAL — la tabla, sin React.
 *
 * Once son órdenes del motor y viajan por el MISMO `dispatch` que la cinta
 * (nombre canónico → `CAD_COMMAND_REGISTRY_V2`); «Seleccionar» no es una
 * orden sino el modo de designación del editor, y por eso su `run` es
 * `{ tool: "select" }` y la barra lo resuelve con un callback aparte.
 *
 * Los rótulos son propios: `command-labels.ts` trunca «Rectáng» para que
 * quepa en la cinta (golden 214 lo mide) y aquí hay sitio para la palabra
 * entera. El icono sale de `command-icons.ts` (un dibujo por comando, con su
 * gate) y el `title` de `cadRibbonButtonTitle`, para que el nombre canónico y
 * su alias («LINE (L)») viajen con el botón igual que en la cinta.
 *
 * Muro despacha WALL del motor, nunca el `toggleWall` heredado: aquél crea
 * activos sin `entity.type === "wall"` y deja a DOOR/WINDOW sin muro
 * anfitrión. `CadEssentialBar.spec.ts` fija el orden, los nombres y que
 * cada uno esté registrado, expuesto en la cinta y disponible.
 */
export type CadEssentialToolId =
  | "select"
  | "wall"
  | "door"
  | "window"
  | "line"
  | "rect"
  | "circle"
  | "text"
  | "dim"
  | "erase"
  | "undo"
  | "redo";

/** Qué hace el botón: un modo del editor o una orden del motor. */
export type CadEssentialRun =
  | { readonly tool: "select" }
  | { readonly command: string };

export interface CadEssentialTool {
  readonly id: CadEssentialToolId;
  /** Rótulo visible, en español y sin truncar. */
  readonly label: string;
  readonly run: CadEssentialRun;
  readonly icon: LucideIcon;
  /** `title` nativo: «Rótulo · NOMBRE (alias) — resumen». */
  readonly title: string;
  /** Se apaga en sólo lectura: mismo criterio que la cinta (`mutates`). */
  readonly mutates: boolean;
}

function orden(
  id: CadEssentialToolId,
  label: string,
  name: string,
): CadEssentialTool {
  const ribbon = findCadRibbonCommand(name);
  return {
    id,
    label,
    run: { command: name },
    // Sin reposo a propósito: `command-icons.spec.ts` garantiza un icono por
    // comando registrado y `CadEssentialBar.spec.ts` que estos once lo están.
    icon: CAD_COMMAND_ICONS[name],
    title: ribbon ? cadRibbonButtonTitle(ribbon) : `${label} · ${name}`,
    // Si el comando no estuviera en la cinta se apaga en sólo lectura: es
    // el lado seguro, y el spec impide que ocurra.
    mutates: ribbon?.mutates ?? true,
  };
}

export const CAD_ESSENTIAL_TOOLS: readonly CadEssentialTool[] = [
  {
    id: "select",
    label: "Seleccionar",
    run: { tool: "select" },
    // El mismo dibujo que «Seleccionar» en `CadToolPalette`.
    icon: MousePointer2,
    title: "Seleccionar — Elige y mueve objetos con el ratón",
    mutates: false,
  },
  orden("wall", "Muro", "WALL"),
  orden("door", "Puerta", "DOOR"),
  orden("window", "Ventana", "WINDOW"),
  orden("line", "Línea", "LINE"),
  orden("rect", "Rectángulo", "RECTANG"),
  orden("circle", "Círculo", "CIRCLE"),
  orden("text", "Texto", "TEXT"),
  orden("dim", "Cota", "DIMLINEAR"),
  orden("erase", "Borrar", "ERASE"),
  orden("undo", "Deshacer", "U"),
  orden("redo", "Rehacer", "REDO"),
];
