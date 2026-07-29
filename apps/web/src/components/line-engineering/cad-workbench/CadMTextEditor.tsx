"use client";

import { useEffect, useState } from 'react';
import type { CadEntity } from '@/lib/cad/cad-document';

type CadMTextEntity = Extract<CadEntity, { type: 'mtext' }>;

export interface CadMTextDraft {
  text: string;
  insertionX: number;
  insertionY: number;
  width: number;
  height: number;
  rotation: number;
  alignment: NonNullable<CadMTextEntity['alignment']>;
  paragraphAlignment: NonNullable<CadMTextEntity['paragraphAlignment']>;
  style: string;
  fontFamily: string;
  lineSpacing: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  backgroundMask: boolean;
  backgroundColor: string;
  backgroundPadding: number;
  columns: number;
  layer: string;
}

interface CadMTextEditorProps {
  initial: CadMTextEntity | null;
  defaultInsertion: { x: number; y: number };
  defaultLayer: string;
  defaultHeight: number;
  textStyles: Record<string, { fontFamily?: string; height?: number }>;
  onSave: (draft: CadMTextDraft) => void;
  onCancel: () => void;
}

function draftFromProps(props: CadMTextEditorProps): CadMTextDraft {
  const entity = props.initial;
  return {
    text: entity?.text ?? '',
    insertionX: entity?.insertion.x ?? props.defaultInsertion.x,
    insertionY: entity?.insertion.y ?? props.defaultInsertion.y,
    width: entity?.width ?? props.defaultHeight * 20,
    height: entity?.height ?? props.defaultHeight,
    rotation: entity?.rotation ?? 0,
    alignment: entity?.alignment ?? 'top-left',
    paragraphAlignment: entity?.paragraphAlignment ?? 'left',
    style: entity?.style ?? Object.keys(props.textStyles)[0] ?? 'Standard',
    fontFamily: entity?.fontFamily ?? 'Arial',
    lineSpacing: entity?.lineSpacing ?? 1.2,
    bold: entity?.bold ?? false,
    italic: entity?.italic ?? false,
    underline: entity?.underline ?? false,
    backgroundMask: entity?.backgroundMask ?? false,
    backgroundColor: entity?.backgroundColor ?? '#111827',
    backgroundPadding: entity?.backgroundPadding ?? 0.15,
    columns: entity?.columns ?? 1,
    layer: entity?.layer ?? props.defaultLayer,
  };
}

export function CadMTextEditor(props: CadMTextEditorProps) {
  const [draft, setDraft] = useState(() => draftFromProps(props));
  useEffect(() => setDraft(draftFromProps(props)), [props.initial, props.defaultInsertion.x, props.defaultInsertion.y, props.defaultHeight, props.defaultLayer, props.textStyles]);
  const number = (key: keyof CadMTextDraft, value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) setDraft((current) => ({ ...current, [key]: parsed }));
  };
  const valid = draft.text.trim().length > 0 && draft.width > 0 && draft.height > 0 && draft.lineSpacing >= 0.5;
  return (
    <div data-testid="cad-mtext-editor" role="dialog" aria-label={props.initial ? 'Editar MTEXT' : 'Crear MTEXT'} className="absolute left-1/2 top-20 z-[65] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl border border-cyan-400/25 bg-gray-950/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><div className="text-sm font-semibold text-cyan-100">{props.initial ? 'Editar MTEXT' : 'Nuevo MTEXT'}</div><div className="text-[10px] text-gray-500">Editor multilínea dentro del lienzo · Ctrl+Enter guarda · Esc cancela</div></div>
        <button onClick={props.onCancel} className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-white/10">Cerrar</button>
      </div>
      <textarea
        data-testid="cad-mtext-content"
        autoFocus
        value={draft.text}
        onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value.slice(0, 16_384) }))}
        onKeyDown={(event) => {
          if (event.key === 'Escape') props.onCancel();
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && valid) props.onSave(draft);
        }}
        rows={6}
        placeholder="Escribe texto multilínea…"
        className="w-full resize-y rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-sm text-white outline-none focus:border-cyan-400/40"
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {([['bold', 'B'], ['italic', 'I'], ['underline', 'U']] as const).map(([key, label]) => (
          <button key={key} data-testid={`cad-mtext-${key}`} aria-pressed={draft[key]} onClick={() => setDraft((current) => ({ ...current, [key]: !current[key] }))} className={`h-7 min-w-8 rounded border px-2 text-xs ${draft[key] ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100' : 'border-white/10 text-gray-300'}`}>{label}</button>
        ))}
        <button data-testid="cad-mtext-background-mask" aria-pressed={draft.backgroundMask} onClick={() => setDraft((current) => ({ ...current, backgroundMask: !current.backgroundMask }))} className={`h-7 rounded border px-2 text-xs ${draft.backgroundMask ? 'border-violet-400/40 bg-violet-400/15 text-violet-100' : 'border-white/10 text-gray-300'}`}>Máscara</button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-[10px] text-gray-400">
        <label>X<input data-testid="cad-mtext-x" type="number" value={draft.insertionX} onChange={(event) => number('insertionX', event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label>Y<input data-testid="cad-mtext-y" type="number" value={draft.insertionY} onChange={(event) => number('insertionY', event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label>Ancho<input data-testid="cad-mtext-width" type="number" min="1" value={draft.width} onChange={(event) => number('width', event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label>Altura<input data-testid="cad-mtext-height" type="number" min="1" value={draft.height} onChange={(event) => number('height', event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label>Rotación<input data-testid="cad-mtext-rotation" type="number" value={draft.rotation} onChange={(event) => number('rotation', event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label>Interlineado<input data-testid="cad-mtext-line-spacing" type="number" min="0.5" max="4" step="0.05" value={draft.lineSpacing} onChange={(event) => number('lineSpacing', event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label>Columnas<input data-testid="cad-mtext-columns" type="number" min="1" max="8" value={draft.columns} onChange={(event) => number('columns', event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label>Padding máscara<input type="number" min="0" max="2" step="0.05" value={draft.backgroundPadding} onChange={(event) => number('backgroundPadding', event.target.value)} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
        <label className="col-span-2">Attachment<select data-testid="cad-mtext-alignment" value={draft.alignment} onChange={(event) => setDraft((current) => ({ ...current, alignment: event.target.value as CadMTextDraft['alignment'] }))} className="mt-1 w-full rounded border border-white/10 bg-gray-900 px-2 py-1 text-white">
          {['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'].map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label className="col-span-2">Párrafo<select data-testid="cad-mtext-paragraph" value={draft.paragraphAlignment} onChange={(event) => setDraft((current) => ({ ...current, paragraphAlignment: event.target.value as CadMTextDraft['paragraphAlignment'] }))} className="mt-1 w-full rounded border border-white/10 bg-gray-900 px-2 py-1 text-white">
          {['left', 'center', 'right', 'justify'].map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label className="col-span-2">Estilo<input data-testid="cad-mtext-style" list="cad-mtext-styles" value={draft.style} onChange={(event) => setDraft((current) => ({ ...current, style: event.target.value }))} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /><datalist id="cad-mtext-styles">{Object.keys(props.textStyles).map((style) => <option key={style} value={style} />)}</datalist></label>
        <label className="col-span-2">Fuente / fallback<input data-testid="cad-mtext-font" value={draft.fontFamily} onChange={(event) => setDraft((current) => ({ ...current, fontFamily: event.target.value }))} className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white" /></label>
      </div>
      <div className="mt-3 flex justify-end gap-2"><button onClick={props.onCancel} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300">Cancelar</button><button data-testid="cad-mtext-save" disabled={!valid} onClick={() => props.onSave(draft)} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-gray-950 disabled:opacity-40">{props.initial ? 'Aplicar cambios' : 'Crear MTEXT'}</button></div>
    </div>
  );
}
