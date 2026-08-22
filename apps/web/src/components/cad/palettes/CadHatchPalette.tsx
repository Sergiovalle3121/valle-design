import { useState } from "react";

interface CadHatchPaletteProps {
  docked?: boolean;
  pickMode: boolean;
  solid: boolean;
  islandStyle: "normal" | "outer" | "ignore";
  onSolidChange: (solid: boolean) => void;
  onIslandStyleChange: (style: "normal" | "outer" | "ignore") => void;
  onPickModeChange: (active: boolean) => void;
  onCreateAtPoint: (point: { x: number; y: number }) => void;
  onCreateFromSelection: (solid: boolean) => void;
}

export function CadHatchPalette({
  pickMode,
  solid,
  islandStyle,
  onSolidChange,
  onIslandStyleChange,
  onPickModeChange,
  onCreateAtPoint,
  onCreateFromSelection,
  docked,
}: CadHatchPaletteProps) {
  const [exactX, setExactX] = useState("0");
  const [exactY, setExactY] = useState("0");
  const exactPoint = { x: Number(exactX), y: Number(exactY) };
  const exactPointValid =
    Number.isFinite(exactPoint.x) && Number.isFinite(exactPoint.y);
  return (
    <div
      data-testid="cad-hatch-palette"
      className={
        docked
          ? "w-full p-3 type-micro"
          : "absolute right-0 top-full z-50 mt-1.5 w-72 rounded-card border border-border bg-surface p-3 type-micro shadow-2xl"
      }
    >
      <div className="mb-2 type-micro font-semibold uppercase tracking-wide text-primary-ink">
        HATCH nativo
      </div>
      <div className="mb-2 grid grid-cols-2 gap-1">
        <button
          onClick={() => onSolidChange(false)}
          className={`rounded-control border px-2 py-1 ${!solid ? "border-primary/30 bg-primary/15 text-primary-ink" : "border-border text-foreground"}`}
        >
          ANSI31
        </button>
        <button
          onClick={() => onSolidChange(true)}
          className={`rounded-control border px-2 py-1 ${solid ? "border-primary/30 bg-primary/15 text-primary-ink" : "border-border text-foreground"}`}
        >
          SOLID
        </button>
      </div>
      <label className="mb-2 block type-micro text-muted-foreground">
        Islands
        <select
          aria-label="Estilo de islands"
          value={islandStyle}
          onChange={(event) =>
            onIslandStyleChange(
              event.target.value as "normal" | "outer" | "ignore",
            )
          }
          className="mt-1 w-full rounded-control border border-border bg-surface px-2 py-1 text-foreground outline-none"
        >
          <option value="normal">Normal · par/impar</option>
          <option value="outer">Outer · primer nivel</option>
          <option value="ignore">Ignore · sin islands</option>
        </select>
      </label>
      <button
        data-testid="cad-hatch-pick-point"
        onClick={() => onPickModeChange(!pickMode)}
        className={`mb-2 w-full rounded-control px-2 py-1.5 font-semibold ${pickMode ? "bg-amber-300 text-gray-950" : "bg-violet-500/20 text-violet-100 hover:bg-violet-500/30"}`}
      >
        {pickMode ? "Cancelar pick point" : "Pick point en región"}
      </button>
      <div className="mb-2 rounded-control border border-border bg-surface/80 p-2">
        <div className="mb-1 type-micro uppercase tracking-wide text-muted-foreground">
          Punto exacto del dibujo
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
          <input
            data-testid="cad-hatch-point-x"
            aria-label="Coordenada X del hatch"
            inputMode="decimal"
            value={exactX}
            onChange={(event) => setExactX(event.target.value)}
            className="min-w-0 rounded-control border border-border bg-surface px-2 py-1 text-foreground outline-none focus:border-primary/30"
          />
          <input
            data-testid="cad-hatch-point-y"
            aria-label="Coordenada Y del hatch"
            inputMode="decimal"
            value={exactY}
            onChange={(event) => setExactY(event.target.value)}
            className="min-w-0 rounded-control border border-border bg-surface px-2 py-1 text-foreground outline-none focus:border-primary/30"
          />
          <button
            data-testid="cad-hatch-create-exact"
            disabled={!exactPointValid}
            onClick={() => onCreateAtPoint(exactPoint)}
            className="rounded-control bg-indigo-500 px-2 py-1 font-semibold text-foreground hover:bg-indigo-400 disabled:opacity-40"
          >
            Crear
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          data-testid="cad-hatch-selection-pattern"
          onClick={() => onCreateFromSelection(false)}
          className="rounded-control bg-muted/60 px-2 py-1 text-foreground hover:bg-muted"
        >
          Selección ANSI31
        </button>
        <button
          data-testid="cad-hatch-selection-solid"
          onClick={() => onCreateFromSelection(true)}
          className="rounded-control bg-muted/60 px-2 py-1 text-foreground hover:bg-muted"
        >
          Selección SOLID
        </button>
      </div>
      <p className="mt-2 type-micro leading-relaxed text-muted-foreground">
        Pick point detecta el loop cerrado menor bajo el cursor, conserva
        islands y crea referencias asociativas.
      </p>
    </div>
  );
}
