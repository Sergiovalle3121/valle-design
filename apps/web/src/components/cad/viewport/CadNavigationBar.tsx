"use client";

import { Frame, Maximize } from "lucide-react";
import { cx, Tooltip } from "@/components/ui";

/**
 * LA BARRA DE NAVEGACIÓN. El equivalente AutoCAD vive junto al ViewCube, en
 * la esquina del viewport: encuadrar todo y encuadrar la selección son las
 * dos acciones que de verdad se usan cien veces por sesión. Llama a
 * `fitView`, que YA EXISTE y YA ESTÁ cableado en `Layout3DEditor` — no hay
 * lógica de cámara nueva aquí, sólo botones.
 */
export function CadNavigationBar({
  onFitView,
  hasSelection,
  className,
}: {
  onFitView: (scope: "all" | "selection") => void;
  hasSelection: boolean;
  className?: string;
}) {
  return (
    <div
      data-testid="cad-navigation-bar"
      className={cx(
        "flex flex-col gap-1 rounded-control border border-border/70 bg-surface/95 p-1 shadow-resting",
        className,
      )}
    >
      <Tooltip label="Encuadrar todo el dibujo" side="left">
        <button
          type="button"
          data-testid="cad-navigation-fit-all"
          title="Encuadrar todo (Extensión)"
          aria-label="Encuadrar todo"
          onClick={() => onFitView("all")}
          className="rounded-control p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Maximize aria-hidden="true" className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip label="Encuadrar la selección" side="left">
        <button
          type="button"
          data-testid="cad-navigation-fit-selection"
          title="Encuadrar la selección"
          aria-label="Encuadrar la selección"
          disabled={!hasSelection}
          onClick={() => onFitView("selection")}
          className="rounded-control p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <Frame aria-hidden="true" className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}
