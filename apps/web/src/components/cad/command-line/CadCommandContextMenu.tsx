"use client";

/**
 * El menú contextual del botón derecho sobre la línea de comandos.
 *
 * Extraído de `CadCommandLine.tsx` (T-«comandos vivos») para mantener ese
 * archivo bajo el presupuesto de 800 líneas (`check:monolith-budget`, ver
 * `scripts/cad/check-monolith-budget.mjs`): mismo comportamiento, mismos
 * testids, ahora en su propio módulo — la franja acoplada sigue siendo la
 * única raíz de `CadCommandLine`, y este menú sigue viviendo en un portal a
 * `<body>`, exactamente como antes de la extracción.
 *
 * Mismo lenguaje visual que `cad-context-menu` del lienzo
 * (`Layout3DEditor.tsx`): repetir/aceptar, las opciones de la orden en
 * curso, cortar/copiar/pegar y cancelar.
 *
 * El padre (`CadCommandLine`) es quien decide QUÉ pasa tras cada acción —
 * enfocar la caja, devolverle el foco al lienzo, cerrar el menú — porque
 * eso depende de su propio `inputRef` y de `setMenu`. Este componente sólo
 * pinta, posiciona y cierra al pulsar fuera; cada prop de acción ya trae
 * consigo el cierre que le corresponde.
 */
import React, { useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { CadPrompt } from "@/lib/cad/engine/command-types";
import { formatCadKeyword } from "@/lib/cad/engine/prompt";

/** Techo generoso del menú: repetir + 5-6 opciones + separadores. */
const CONTEXT_MENU_WIDTH = 224;
const CONTEXT_MENU_MAX_HEIGHT = 320;

/**
 * Dónde abrir el menú, recortado para que un clic cerca del borde de una
 * ventana pequeña (la laptop de 8 GB del dueño, no sólo un monitor grande)
 * no lo deje abriendo fuera de la pantalla.
 */
function contextMenuStyle(point: { x: number; y: number }): CSSProperties {
  if (typeof window === "undefined") return { position: "fixed", left: point.x, top: point.y };
  const left = Math.min(point.x, Math.max(8, window.innerWidth - CONTEXT_MENU_WIDTH));
  const top = Math.min(point.y, Math.max(8, window.innerHeight - CONTEXT_MENU_MAX_HEIGHT));
  return { position: "fixed", left, top };
}

export interface CadCommandContextMenuProps {
  /** Coordenadas del propio clic derecho — AutoCAD abre el menú ahí, no anclado a la franja. */
  point: { x: number; y: number };
  prompt: CadPrompt | null;
  activeCommand?: string | null;
  lastCommand?: string | null;
  /** Repetir la última orden, o aceptar la que está en curso. Ya incluye cerrar el menú. */
  onRepeat(): void;
  /** Pulsar una opción de la orden activa. Ya incluye cerrar el menú. */
  onKeyword(keyword: string): void;
  /** Cancelar la orden en curso. Ya incluye cerrar el menú. */
  onCancel(): void;
  /** Cortar/copiar/pegar. Ya incluye cerrar el menú. */
  onClipboardAction(accion: "cut" | "copy" | "paste"): void;
  /** Cerrar sin ninguna acción — clic fuera, o Escape (decidido por el padre). */
  onClose(): void;
}

export function CadCommandContextMenu({
  point,
  prompt,
  activeCommand,
  lastCommand,
  onRepeat,
  onKeyword,
  onCancel,
  onClipboardAction,
  onClose,
}: CadCommandContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Se cierra con un clic fuera de él — igual que el de `cad-context-menu`
  // del lienzo. `pointerdown` y no `click`: se cierra ANTES de que el clic
  // siguiente pueda activar otra cosa por debajo.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cerrar = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", cerrar);
    return () => window.removeEventListener("pointerdown", cerrar);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      data-testid="cad-command-context-menu"
      role="menu"
      aria-label="Menú de la línea de comandos"
      style={contextMenuStyle(point)}
      className="z-50 w-52 overflow-hidden rounded-xl border border-border bg-surface/80 p-1.5 type-micro text-foreground shadow-2xl backdrop-blur"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        data-testid="cad-command-context-repeat"
        disabled={!prompt && !lastCommand}
        onClick={onRepeat}
        className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
      >
        {prompt
          ? "Intro (aceptar)"
          : lastCommand
            ? `Repetir última orden (${lastCommand})`
            : "Repetir última orden"}
      </button>
      {prompt && prompt.options.length > 0 && (
        <>
          <div role="separator" className="my-1 border-t border-border" />
          <div className="px-2 py-1 type-micro text-muted-foreground">
            {activeCommand ? `Opciones de «${activeCommand}»` : "Opciones de la orden en curso"}
          </div>
          {prompt.options.map((option) => (
            <button
              key={option.keyword}
              type="button"
              role="menuitem"
              data-testid={`cad-command-context-option-${option.keyword}`}
              onClick={() => onKeyword(option.shortcut)}
              className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted"
            >
              {formatCadKeyword(option)}
            </button>
          ))}
        </>
      )}
      <div role="separator" className="my-1 border-t border-border" />
      <button
        type="button"
        role="menuitem"
        data-testid="cad-command-context-cut"
        onClick={() => onClipboardAction("cut")}
        className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted"
      >
        Cortar
      </button>
      <button
        type="button"
        role="menuitem"
        data-testid="cad-command-context-copy"
        onClick={() => onClipboardAction("copy")}
        className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted"
      >
        Copiar
      </button>
      <button
        type="button"
        role="menuitem"
        data-testid="cad-command-context-paste"
        onClick={() => onClipboardAction("paste")}
        className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted"
      >
        Pegar
      </button>
      <div role="separator" className="my-1 border-t border-border" />
      <button
        type="button"
        role="menuitem"
        data-testid="cad-command-context-cancel"
        onClick={onCancel}
        className="w-full rounded-lg px-2 py-1.5 text-left text-danger-ink hover:bg-rose-400/10"
      >
        Cancelar
      </button>
    </div>,
    document.body,
  );
}

export default CadCommandContextMenu;
