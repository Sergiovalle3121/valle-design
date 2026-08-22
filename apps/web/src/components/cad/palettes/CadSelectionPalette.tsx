import type { CadSelectionOperation } from "@/lib/cad/selection-controller";

export type CadSelectionGeometryMode =
  "pick" | "window" | "crossing" | "polygon" | "fence" | "lasso";

interface CadSelectionPaletteProps {
  docked?: boolean;
  selectedCount: number;
  previousCount: number;
  mode: CadSelectionGeometryMode;
  operation: CadSelectionOperation;
  quickType: string;
  quickLayer: string;
  quickText: string;
  entityTypes: readonly string[];
  layers: readonly string[];
  onModeChange: (mode: CadSelectionGeometryMode) => void;
  onOperationChange: (operation: CadSelectionOperation) => void;
  onQuickTypeChange: (value: string) => void;
  onQuickLayerChange: (value: string) => void;
  onQuickTextChange: (value: string) => void;
  onPrevious: () => void;
  onLast: () => void;
  onAll: () => void;
  onInvert: () => void;
  onQuick: () => void;
  onClear: () => void;
}

const GEOMETRY_MODES: Array<{ id: CadSelectionGeometryMode; label: string }> = [
  { id: "pick", label: "Punto" },
  { id: "window", label: "Ventana" },
  { id: "crossing", label: "Cruce" },
  { id: "polygon", label: "Polígono" },
  { id: "fence", label: "Fence" },
  { id: "lasso", label: "Lasso" },
];

const OPERATIONS: Array<{ id: CadSelectionOperation; label: string }> = [
  { id: "replace", label: "Reemplazar" },
  { id: "add", label: "Agregar" },
  { id: "remove", label: "Quitar" },
  { id: "toggle", label: "Alternar" },
];

const buttonClass =
  "rounded-control border border-border bg-muted/60 px-2 py-1 type-micro text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";

export function CadSelectionPalette(props: CadSelectionPaletteProps) {
  return (
    <div
      data-testid="cad-selection-palette"
      className={
        props.docked
          ? "w-full p-3 type-micro"
          : "absolute right-0 top-full z-50 mt-1.5 w-[340px] rounded-card border border-border bg-surface p-3 type-micro shadow-2xl"
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="type-micro font-semibold uppercase tracking-wide text-primary-ink">
          Selección profesional
        </div>
        <span
          data-testid="cad-selection-count"
          className="rounded-full bg-primary/15 px-2 py-0.5 text-primary-ink"
        >
          {props.selectedCount} seleccionados
        </span>
      </div>

      <div className="mb-1 type-micro uppercase tracking-wide text-muted-foreground">
        Geometría
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1">
        {GEOMETRY_MODES.map((item) => (
          <button
            key={item.id}
            data-testid={`cad-selection-mode-${item.id}`}
            onClick={() => props.onModeChange(item.id)}
            className={`${buttonClass} ${props.mode === item.id ? "border-primary/30 bg-primary/15 text-primary-ink" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-1 type-micro uppercase tracking-wide text-muted-foreground">
        Operación
      </div>
      <div className="mb-2 grid grid-cols-4 gap-1">
        {OPERATIONS.map((item) => (
          <button
            key={item.id}
            data-testid={`cad-selection-operation-${item.id}`}
            onClick={() => props.onOperationChange(item.id)}
            className={`${buttonClass} px-1 ${props.operation === item.id ? "border-success/30 bg-success/15 text-success-ink" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-5 gap-1">
        <button
          onClick={props.onPrevious}
          disabled={props.previousCount === 0}
          className={buttonClass}
        >
          Anterior
        </button>
        <button onClick={props.onLast} className={buttonClass}>
          Último
        </button>
        <button onClick={props.onAll} className={buttonClass}>
          Todo
        </button>
        <button onClick={props.onInvert} className={buttonClass}>
          Invertir
        </button>
        <button
          onClick={props.onClear}
          disabled={props.selectedCount === 0}
          className={buttonClass}
        >
          Limpiar
        </button>
      </div>

      <div className="rounded-control border border-border bg-surface/80 p-2">
        <div className="mb-1.5 type-micro uppercase tracking-wide text-muted-foreground">
          Quick select
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <select
            aria-label="Filtrar por tipo"
            value={props.quickType}
            onChange={(event) => props.onQuickTypeChange(event.target.value)}
            className="rounded-control border border-border bg-surface px-2 py-1 type-micro text-foreground outline-none"
          >
            <option value="">Todos los tipos</option>
            {props.entityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por capa"
            value={props.quickLayer}
            onChange={(event) => props.onQuickLayerChange(event.target.value)}
            className="rounded-control border border-border bg-surface px-2 py-1 type-micro text-foreground outline-none"
          >
            <option value="">Todas las capas</option>
            {props.layers.map((layer) => (
              <option key={layer} value={layer}>
                {layer}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input
            data-testid="cad-quick-select-text"
            value={props.quickText}
            onChange={(event) => props.onQuickTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") props.onQuick();
            }}
            placeholder="ID, etiqueta o propiedad…"
            className="min-w-0 flex-1 rounded-control border border-border bg-surface px-2 py-1 type-micro text-foreground outline-none focus:border-primary/30"
          />
          <button
            data-testid="cad-quick-select-apply"
            onClick={props.onQuick}
            className={`${buttonClass} border-primary/30 text-primary-ink`}
          >
            Aplicar
          </button>
        </div>
      </div>
      <p className="mt-2 type-micro leading-relaxed text-muted-foreground">
        Arrastra para ventana/cruce. Para polígono, fence o lasso, dibuja un
        trazo continuo sobre el fondo. Clics repetidos ciclan geometría
        solapada.
      </p>
    </div>
  );
}
