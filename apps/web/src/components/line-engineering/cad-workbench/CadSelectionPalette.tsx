import type { CadSelectionOperation } from '@/lib/cad/selection-controller';

export type CadSelectionGeometryMode = 'pick' | 'window' | 'crossing' | 'polygon' | 'fence' | 'lasso';

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
  { id: 'pick', label: 'Punto' },
  { id: 'window', label: 'Ventana' },
  { id: 'crossing', label: 'Cruce' },
  { id: 'polygon', label: 'Polígono' },
  { id: 'fence', label: 'Fence' },
  { id: 'lasso', label: 'Lasso' },
];

const OPERATIONS: Array<{ id: CadSelectionOperation; label: string }> = [
  { id: 'replace', label: 'Reemplazar' },
  { id: 'add', label: 'Agregar' },
  { id: 'remove', label: 'Quitar' },
  { id: 'toggle', label: 'Alternar' },
];

const buttonClass = 'rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[10.5px] text-gray-200 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';

export function CadSelectionPalette(props: CadSelectionPaletteProps) {
  return (
    <div
      data-testid="cad-selection-palette"
      className={props.docked ? 'w-full p-3 text-[11px]' : 'absolute right-0 top-full z-50 mt-1.5 w-[340px] rounded-xl border border-white/10 bg-gray-900 p-3 text-[11px] shadow-2xl'}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">Selección profesional</div>
        <span data-testid="cad-selection-count" className="rounded-full bg-indigo-400/10 px-2 py-0.5 text-indigo-200">{props.selectedCount} seleccionados</span>
      </div>

      <div className="mb-1 text-[9px] uppercase tracking-wide text-gray-500">Geometría</div>
      <div className="mb-2 grid grid-cols-3 gap-1">
        {GEOMETRY_MODES.map((item) => (
          <button
            key={item.id}
            data-testid={`cad-selection-mode-${item.id}`}
            onClick={() => props.onModeChange(item.id)}
            className={`${buttonClass} ${props.mode === item.id ? 'border-indigo-400/40 bg-indigo-400/15 text-indigo-100' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-1 text-[9px] uppercase tracking-wide text-gray-500">Operación</div>
      <div className="mb-2 grid grid-cols-4 gap-1">
        {OPERATIONS.map((item) => (
          <button
            key={item.id}
            data-testid={`cad-selection-operation-${item.id}`}
            onClick={() => props.onOperationChange(item.id)}
            className={`${buttonClass} px-1 ${props.operation === item.id ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-5 gap-1">
        <button onClick={props.onPrevious} disabled={props.previousCount === 0} className={buttonClass}>Anterior</button>
        <button onClick={props.onLast} className={buttonClass}>Último</button>
        <button onClick={props.onAll} className={buttonClass}>Todo</button>
        <button onClick={props.onInvert} className={buttonClass}>Invertir</button>
        <button onClick={props.onClear} disabled={props.selectedCount === 0} className={buttonClass}>Limpiar</button>
      </div>

      <div className="rounded-lg border border-white/10 bg-gray-950/50 p-2">
        <div className="mb-1.5 text-[9px] uppercase tracking-wide text-gray-500">Quick select</div>
        <div className="grid grid-cols-2 gap-1.5">
          <select
            aria-label="Filtrar por tipo"
            value={props.quickType}
            onChange={(event) => props.onQuickTypeChange(event.target.value)}
            className="rounded-md border border-white/10 bg-gray-950 px-2 py-1 text-[10.5px] text-white outline-none"
          >
            <option value="">Todos los tipos</option>
            {props.entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select
            aria-label="Filtrar por capa"
            value={props.quickLayer}
            onChange={(event) => props.onQuickLayerChange(event.target.value)}
            className="rounded-md border border-white/10 bg-gray-950 px-2 py-1 text-[10.5px] text-white outline-none"
          >
            <option value="">Todas las capas</option>
            {props.layers.map((layer) => <option key={layer} value={layer}>{layer}</option>)}
          </select>
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input
            data-testid="cad-quick-select-text"
            value={props.quickText}
            onChange={(event) => props.onQuickTextChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') props.onQuick(); }}
            placeholder="ID, etiqueta o propiedad…"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-gray-950 px-2 py-1 text-[10.5px] text-white outline-none focus:border-indigo-400/40"
          />
          <button data-testid="cad-quick-select-apply" onClick={props.onQuick} className={`${buttonClass} border-indigo-400/20 text-indigo-100`}>Aplicar</button>
        </div>
      </div>
      <p className="mt-2 text-[9.5px] leading-relaxed text-gray-500">
        Arrastra para ventana/cruce. Para polígono, fence o lasso, dibuja un trazo continuo sobre el fondo. Clics repetidos ciclan geometría solapada.
      </p>
    </div>
  );
}
