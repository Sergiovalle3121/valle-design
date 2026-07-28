"use client";

import { useState } from 'react';

export interface CadDimensionDraft {
  kind: 'linear' | 'aligned' | 'angular' | 'radius' | 'diameter' | 'ordinate' | 'arc-length';
  axis: 'x' | 'y';
  offset: number;
  style: string;
  precision: number;
  units: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  alternateUnits: '' | 'mm' | 'cm' | 'm' | 'in' | 'ft';
  prefix: string;
  suffix: string;
  extensionLines: boolean;
  arrowhead: 'closed-filled' | 'open' | 'architectural-tick' | 'dot';
}

interface CadDimensionPaletteProps {
  selectedCount: number;
  defaultOffset: number;
  styles: string[];
  onCreate: (draft: CadDimensionDraft) => void;
}

export function CadDimensionPalette({ selectedCount, defaultOffset, styles, onCreate }: CadDimensionPaletteProps) {
  const [draft, setDraft] = useState<CadDimensionDraft>({
    kind: 'aligned', axis: 'x', offset: defaultOffset, style: styles[0] ?? 'Standard', precision: 2,
    units: 'mm', alternateUnits: '', prefix: '', suffix: '', extensionLines: true, arrowhead: 'closed-filled',
  });
  return (
    <div data-testid="cad-dimension-palette" className="absolute right-0 top-full z-50 mt-1.5 w-80 rounded-xl border border-emerald-400/20 bg-gray-950 p-3 text-[10.5px] shadow-2xl">
      <div className="mb-2 flex items-center justify-between"><span className="font-semibold text-emerald-100">Dimensión asociativa</span><span className="text-gray-500">{selectedCount} fuente(s)</span></div>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 text-gray-400">Tipo<select data-testid="cad-dimension-kind" value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as CadDimensionDraft['kind'] }))} className="mt-1 w-full rounded border border-white/10 bg-gray-900 px-2 py-1 text-white">
          <option value="linear">Linear</option><option value="aligned">Aligned</option><option value="angular">Angular</option><option value="radius">Radius</option><option value="diameter">Diameter</option><option value="ordinate">Ordinate</option><option value="arc-length">Arc length</option>
        </select></label>
        <label className="text-gray-400">Eje<select value={draft.axis} onChange={(event) => setDraft((current) => ({ ...current, axis: event.target.value as 'x' | 'y' }))} className="mt-1 w-full rounded border border-white/10 bg-gray-900 px-2 py-1 text-white"><option value="x">X</option><option value="y">Y</option></select></label>
        <label className="text-gray-400">Offset<input data-testid="cad-dimension-offset" type="number" value={draft.offset} onChange={(event) => setDraft((current) => ({ ...current, offset: Number(event.target.value) || 0 }))} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label className="text-gray-400">Estilo<input list="cad-dimension-styles" value={draft.style} onChange={(event) => setDraft((current) => ({ ...current, style: event.target.value }))} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /><datalist id="cad-dimension-styles">{styles.map((style) => <option key={style} value={style} />)}</datalist></label>
        <label className="text-gray-400">Precisión<input type="number" min="0" max="8" value={draft.precision} onChange={(event) => setDraft((current) => ({ ...current, precision: Math.max(0, Math.min(8, Number(event.target.value) || 0)) }))} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label className="text-gray-400">Unidades<select data-testid="cad-dimension-units" value={draft.units} onChange={(event) => setDraft((current) => ({ ...current, units: event.target.value as CadDimensionDraft['units'] }))} className="mt-1 w-full rounded border border-white/10 bg-gray-900 px-2 py-1 text-white">{['mm', 'cm', 'm', 'in', 'ft'].map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        <label className="text-gray-400">Alterna<select value={draft.alternateUnits} onChange={(event) => setDraft((current) => ({ ...current, alternateUnits: event.target.value as CadDimensionDraft['alternateUnits'] }))} className="mt-1 w-full rounded border border-white/10 bg-gray-900 px-2 py-1 text-white"><option value="">Off</option>{['mm', 'cm', 'm', 'in', 'ft'].map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        <label className="text-gray-400">Prefijo<input value={draft.prefix} onChange={(event) => setDraft((current) => ({ ...current, prefix: event.target.value.slice(0, 64) }))} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label className="text-gray-400">Sufijo<input value={draft.suffix} onChange={(event) => setDraft((current) => ({ ...current, suffix: event.target.value.slice(0, 64) }))} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label className="col-span-2 text-gray-400">Arrowhead<select value={draft.arrowhead} onChange={(event) => setDraft((current) => ({ ...current, arrowhead: event.target.value as CadDimensionDraft['arrowhead'] }))} className="mt-1 w-full rounded border border-white/10 bg-gray-900 px-2 py-1 text-white"><option value="closed-filled">Closed filled</option><option value="open">Open</option><option value="architectural-tick">Architectural tick</option><option value="dot">Dot</option></select></label>
      </div>
      <label className="mt-2 flex items-center gap-2 text-gray-300"><input type="checkbox" checked={draft.extensionLines} onChange={(event) => setDraft((current) => ({ ...current, extensionLines: event.target.checked }))} className="accent-emerald-500" /> Extension lines</label>
      <button data-testid="cad-dimension-create" disabled={selectedCount < 1} onClick={() => onCreate(draft)} className="mt-3 w-full rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-gray-950 disabled:opacity-40">Crear dimensión asociativa</button>
      <div className="mt-2 text-[9.5px] leading-relaxed text-gray-500">LINE: linear/aligned/ordinate · ARC: angular/radius/diameter/arc length · las referencias se regeneran al editar la fuente.</div>
    </div>
  );
}
