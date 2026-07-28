interface CadHatchPaletteProps {
  docked?: boolean;
  pickMode: boolean;
  solid: boolean;
  islandStyle: 'normal' | 'outer' | 'ignore';
  onSolidChange: (solid: boolean) => void;
  onIslandStyleChange: (style: 'normal' | 'outer' | 'ignore') => void;
  onPickModeChange: (active: boolean) => void;
  onCreateFromSelection: (solid: boolean) => void;
}

export function CadHatchPalette({
  pickMode,
  solid,
  islandStyle,
  onSolidChange,
  onIslandStyleChange,
  onPickModeChange,
  onCreateFromSelection,
  docked,
}: CadHatchPaletteProps) {
  return (
    <div data-testid="cad-hatch-palette" className={docked ? 'w-full p-3 text-[11px]' : 'absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-white/10 bg-gray-900 p-3 text-[11px] shadow-2xl'}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">HATCH nativo</div>
      <div className="mb-2 grid grid-cols-2 gap-1">
        <button onClick={() => onSolidChange(false)} className={`rounded-md border px-2 py-1 ${!solid ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100' : 'border-white/10 text-gray-300'}`}>ANSI31</button>
        <button onClick={() => onSolidChange(true)} className={`rounded-md border px-2 py-1 ${solid ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100' : 'border-white/10 text-gray-300'}`}>SOLID</button>
      </div>
      <label className="mb-2 block text-[10px] text-gray-500">
        Islands
        <select
          aria-label="Estilo de islands"
          value={islandStyle}
          onChange={(event) => onIslandStyleChange(event.target.value as 'normal' | 'outer' | 'ignore')}
          className="mt-1 w-full rounded-md border border-white/10 bg-gray-950 px-2 py-1 text-gray-200 outline-none"
        >
          <option value="normal">Normal · par/impar</option>
          <option value="outer">Outer · primer nivel</option>
          <option value="ignore">Ignore · sin islands</option>
        </select>
      </label>
      <button
        data-testid="cad-hatch-pick-point"
        onClick={() => onPickModeChange(!pickMode)}
        className={`mb-2 w-full rounded-lg px-2 py-1.5 font-semibold ${pickMode ? 'bg-amber-300 text-gray-950' : 'bg-violet-500/20 text-violet-100 hover:bg-violet-500/30'}`}
      >
        {pickMode ? 'Cancelar pick point' : 'Pick point en región'}
      </button>
      <div className="grid grid-cols-2 gap-1">
        <button data-testid="cad-hatch-selection-pattern" onClick={() => onCreateFromSelection(false)} className="rounded-md bg-white/[0.06] px-2 py-1 text-gray-200 hover:bg-white/[0.12]">Selección ANSI31</button>
        <button data-testid="cad-hatch-selection-solid" onClick={() => onCreateFromSelection(true)} className="rounded-md bg-white/[0.06] px-2 py-1 text-gray-200 hover:bg-white/[0.12]">Selección SOLID</button>
      </div>
      <p className="mt-2 text-[9.5px] leading-relaxed text-gray-500">Pick point detecta el loop cerrado menor bajo el cursor, conserva islands y crea referencias asociativas.</p>
    </div>
  );
}
