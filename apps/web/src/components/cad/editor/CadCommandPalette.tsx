"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { FOCUSABLE } from "@/components/ui/Modal";
import {
  searchCadPalette,
  type CadPaletteEntry,
} from "@/lib/cad/command-palette";

/**
 * LA PALETA Ctrl+K (buscar comando, herramienta o símbolo).
 *
 * Extraída de `Layout3DEditor.tsx` por la misma razón que `CadToolPalette` y
 * `CadLeftDockPanel`: el monolito tiene un trinquete de tamaño que SÓLO BAJA
 * (`scripts/cad/monolith-budget.json`), así que una mejora de accesibilidad
 * de tres atributos se paga sacando el bloque entero. Es puramente controlada:
 * el estado (`showPalette`, `paletteQuery`, `recentPaletteActions`) sigue en
 * el editor, porque `close-palette` de la cascada de Escape y el ejecutor de
 * entradas también lo escriben; aquí sólo se pinta y se invoca por prop.
 *
 * ## Lo que corrige (F9 P-06)
 *
 * El contenedor era un `<div>` con clases y nada más: un lector de pantalla
 * no lo anunciaba como diálogo ni le daba nombre. Ahora lleva `role="dialog"`,
 * `aria-label` y `aria-modal`. Y `aria-modal` no se afirma en vano: se copia
 * el atrapador de Tab/Shift+Tab de `CadDialogShell`, para que quien navega
 * con teclado cicle DENTRO de la paleta en vez de caer al lienzo con la caja
 * todavía delante. Escape sigue cerrando exactamente como antes (en la caja
 * de buscar y, con el foco en una fila, por la cascada del editor).
 *
 * ## Lo que NO se cambia
 *
 * Cuatro goldens (107, 119, 190, `real/primera-hora`) encuentran la paleta por
 * el `placeholder` de la caja, toman `ancestor::div[2]` como contenedor y
 * enumeran los `button` de dentro. Por eso el texto del placeholder y la forma
 * del DOM —input → fila flexible → contenedor— se conservan tal cual: sin
 * envoltorios nuevos ni botón de cerrar.
 */
export function CadCommandPalette({
  query,
  onQueryChange,
  onClose,
  recent,
  onRun,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  /** Cierra la paleta y vacía la consulta; lo decide el editor. */
  onClose: () => void;
  /** Claves `kind:id` de las últimas entradas ejecutadas. */
  recent: string[];
  onRun: (entry: CadPaletteEntry) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const results = searchCadPalette(query).slice(0, 9);

  useEffect(() => {
    // Mismo atrapador que `CadDialogShell`: Tab y Shift+Tab ciclan dentro del
    // panel; si el foco se fue fuera (el lienzo), se re-captura al entrar.
    const alPulsar = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const targets = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (targets.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active ? panel.contains(active) : false;
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", alPulsar, { capture: true });
    return () =>
      document.removeEventListener("keydown", alPulsar, { capture: true });
  }, []);

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Buscar comando, herramienta o símbolo"
      className="absolute top-3 right-3 z-30 w-[22rem] rounded-card border border-indigo-400/20 bg-surface/80 p-3 shadow-floating backdrop-blur"
    >
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-2.5 py-2">
        <Search className="h-4 w-4 text-primary-ink" />
        <input
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          aria-label="Buscar comando, herramienta o símbolo"
          placeholder="Buscar comando, herramienta o símbolo..."
          className="min-w-0 flex-1 bg-transparent type-small text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="rounded-md border border-border px-1.5 py-0.5 type-micro text-muted-foreground">
          Ctrl K
        </span>
      </div>
      {recent.length > 0 && !query.trim() && (
        <div className="mt-2 flex flex-wrap gap-1 border-b border-border pb-2">
          <span className="mr-1 self-center type-micro uppercase tracking-wide text-muted-foreground">
            Recientes
          </span>
          {recent.map((key) => {
            const [, id] = key.split(":");
            return (
              <span
                key={key}
                className="rounded-full bg-muted/60 px-2 py-0.5 type-micro text-muted-foreground dark:text-muted-foreground"
              >
                {id}
              </span>
            );
          })}
        </div>
      )}
      <div className="mt-2 max-h-80 overflow-y-auto space-y-1">
        {results.map((entry) => (
          <button
            key={`${entry.kind}-${entry.id}`}
            onClick={() => onRun(entry)}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-muted/60"
          >
            <span className="min-w-0">
              <span className="block truncate type-small font-semibold text-foreground">
                {entry.label}
              </span>
              <span className="block truncate type-micro text-muted-foreground dark:text-muted-foreground">
                {entry.description}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block rounded-full border border-border px-2 py-0.5 type-micro uppercase tracking-wide text-primary-ink">
                {entry.kind}
              </span>
              {entry.shortcut && (
                <span className="mt-1 block type-micro text-muted-foreground">
                  {entry.shortcut}
                </span>
              )}
            </span>
          </button>
        ))}
        {results.length === 0 && (
          <div className="px-2 py-6 text-center type-caption text-muted-foreground">
            Sin resultados CAD.
          </div>
        )}
      </div>
    </div>
  );
}
