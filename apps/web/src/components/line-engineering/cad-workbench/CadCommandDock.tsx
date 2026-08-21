'use client';

import type { RefObject } from 'react';
import { WandSparkles } from 'lucide-react';
import { describeCadIntent, type CadIntent } from '../cad-intent';
import type { CadCommandHistoryItem, CadCommandPreview, CadOperation } from '@/lib/cad/commands';
import type { CadCommandSuggestion } from '@/lib/cad/command-line-assist';

export interface CadAiProposal {
  source: 'intent' | 'optimize';
  intents: CadIntent[];
  descriptions?: string[];
  errors: string[];
  message?: string;
}

export interface CadCommandDockPreview {
  preview: CadCommandPreview;
}

interface CadCommandDockProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  preview: CadCommandDockPreview | null;
  log: CadCommandHistoryItem[];
  suggestions: CadCommandSuggestion[];
  selectionCount: number;
  aiBusy: null | 'intent' | 'optimize';
  aiProposal: CadAiProposal | null;
  canUndo: boolean;
  canRedo: boolean;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onHistory: (direction: 'older' | 'newer') => void;
  onRepeat: () => void;
  onClearInput: () => void;
  onDismissPreview: () => void;
  onRequestAi: (source: 'intent' | 'optimize') => void;
  onApplyAi: () => void;
  onDiscardAi: () => void;
  onApplyPreview: () => void;
  onSuggestion: (suggestion: CadCommandSuggestion) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const describeCadPreviewOperation = (operation: CadOperation): string => {
  switch (operation.type) {
    case 'move': return `Mover ${operation.objectId} → (${Math.round(operation.after.x)}, ${Math.round(operation.after.y)})`;
    case 'create': return `Crear ${operation.object.label} en (${Math.round(operation.object.x)}, ${Math.round(operation.object.y)})`;
    case 'delete': return `Borrar ${operation.objectId}`;
    case 'rename': return `Renombrar a "${operation.label}"`;
    case 'clear_annotations': return `Quitar ${operation.kind === 'dims' ? 'cotas' : operation.kind === 'notes' ? 'notas' : 'anotaciones'}`;
    case 'annotate': return operation.annotation.kind === 'text' ? `Texto "${operation.annotation.text}"` : `Cota ${operation.annotation.text}`;
    case 'connect': return `Conectar ${operation.from} → ${operation.to}`;
    case 'measure': return `Medir ${Math.round(operation.distance)} ${operation.unit}`;
    case 'focus': return `Enfocar ${operation.objectIds.length || 'todo'}`;
    case 'history': return operation.action === 'undo' ? 'Deshacer' : 'Rehacer';
    case 'studio_export': return `Exportar ${operation.format.toUpperCase()}`;
    case 'studio_view': return `Cambiar a vista ${operation.mode.toUpperCase()}`;
    case 'studio_save': return 'Guardar estudio';
    case 'report': return operation.title;
  }
};

export function CadCommandDock({
  inputRef, value, preview, log, suggestions, selectionCount, aiBusy, aiProposal,
  canUndo, canRedo, onValueChange, onSubmit, onHistory, onRepeat, onClearInput,
  onDismissPreview, onRequestAi, onApplyAi, onDiscardAi, onApplyPreview,
  onSuggestion, onUndo, onRedo,
}: CadCommandDockProps) {
  return (
    <div className="border-b border-indigo-400/20 bg-indigo-400/[0.06] p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-200">
        <WandSparkles className="h-3.5 w-3.5" /> Copiloto CAD
      </div>
      <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
        Comandos determinísticos locales (Preview) o interpretación con IA (CIDE) — la IA solo propone; tú apruebas.
      </p>
      <form className="mt-2 flex gap-1.5" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <input
          ref={inputRef}
          aria-label="Copiloto CAD en lenguaje natural"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') { event.preventDefault(); onHistory('older'); }
            else if (event.key === 'ArrowDown') { event.preventDefault(); onHistory('newer'); }
            else if ((event.key === 'Enter' || event.key === ' ') && !value.trim()) { event.preventDefault(); onRepeat(); }
            else if (event.key === 'Escape') { event.preventDefault(); if (preview) onDismissPreview(); else onClearInput(); }
          }}
          placeholder="pasillo 1.2 entre SMT e inspección"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white placeholder:text-gray-600 outline-none focus:border-indigo-400/60"
        />
        <button type="submit" className="rounded-lg bg-indigo-500 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-400">Preview</button>
        <button type="button" onClick={() => onRequestAi('intent')} disabled={aiBusy !== null} title="Interpreta la instrucción con el motor de IA (CIDE)" className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{aiBusy === 'intent' ? '…' : 'IA'}</button>
      </form>
      <button type="button" onClick={() => onRequestAi('optimize')} disabled={aiBusy !== null} className="mt-1.5 w-full rounded-lg border border-violet-400/30 bg-violet-400/[0.08] px-2 py-1.5 text-[11px] font-semibold text-violet-200 hover:bg-violet-400/[0.14] disabled:opacity-50">
        {aiBusy === 'optimize' ? 'Analizando layout…' : 'Optimizar recorrido con IA'}
      </button>

      {aiProposal && (
        <div className="mt-2 rounded-xl border border-violet-400/25 bg-gray-950/70 p-2">
          <div className="text-[11px] font-semibold text-violet-200">Propuesta IA · {aiProposal.source === 'intent' ? 'instrucción' : 'optimización'}</div>
          {aiProposal.message && <div className="mt-1 text-[10.5px] text-amber-200">{aiProposal.message}</div>}
          {aiProposal.intents.slice(0, 6).map((intent, index) => (
            <div key={`ai-${index}`} className="mt-1 rounded-md bg-white/[0.04] px-1.5 py-1 text-[10.5px] text-gray-300">{aiProposal.descriptions?.[index] ?? describeCadIntent(intent)}</div>
          ))}
          {aiProposal.intents.length > 6 && <div className="mt-1 text-[10px] text-gray-500">…y {aiProposal.intents.length - 6} acción(es) más.</div>}
          {aiProposal.errors.slice(0, 2).map((error) => <div key={error} className="mt-1 text-[10.5px] text-rose-300">Descartada: {error}</div>)}
          <div className="mt-2 flex gap-1.5">
            {aiProposal.intents.length > 0 && <button type="button" onClick={onApplyAi} className="rounded-lg bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600">Aplicar {aiProposal.intents.length}</button>}
            <button type="button" onClick={onDiscardAi} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10">Descartar</button>
          </div>
        </div>
      )}

      {preview && (
        <div className="mt-2 rounded-xl border border-white/10 bg-gray-950/70 p-2">
          <div className="text-[11px] font-semibold text-white">{preview.preview.summary}</div>
          <div className="mt-1 text-[10.5px] text-gray-500 dark:text-gray-400">{preview.preview.affectedObjectIds.length} objeto(s) · {preview.preview.operations.length} operación(es)</div>
          {preview.preview.operations.slice(0, 3).map((operation, index) => (
            <div key={`${operation.type}-${index}`} className="mt-1 rounded-md bg-white/[0.04] px-1.5 py-1 text-[10.5px] text-gray-300">
              {operation.type === 'report' ? (
                <div>
                  <div className="font-semibold text-indigo-100">{operation.title}</div>
                  {operation.rows.slice(0, 3).map((row) => <div key={`${row.label}-${row.value}`} className="mt-0.5 flex justify-between gap-2 text-gray-500 dark:text-gray-400"><span className="truncate">{row.label}</span><span className="shrink-0 text-gray-200">{row.value}</span></div>)}
                </div>
              ) : describeCadPreviewOperation(operation)}
            </div>
          ))}
          {preview.preview.issues.slice(0, 2).map((issue) => <div key={`${issue.code}-${issue.message}`} className={`mt-1 text-[10.5px] ${issue.level === 'error' ? 'text-rose-300' : issue.level === 'warning' ? 'text-amber-300' : 'text-indigo-200'}`}>{issue.message}</div>)}
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={onApplyPreview} className="rounded-lg bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600">Aplicar</button>
            <button type="button" onClick={onDismissPreview} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10">Cancelar</button>
            <button type="button" onClick={onDismissPreview} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10">Editar</button>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500"><span>Sugerencias</span><span>{selectionCount} sel</span></div>
          {suggestions.map((suggestion) => (
            <button type="button" key={suggestion.id} onClick={() => onSuggestion(suggestion)} title={suggestion.example} className={`w-full rounded-lg border px-2 py-1.5 text-left hover:bg-white/[0.08] ${suggestion.ready ? 'border-indigo-400/20 bg-indigo-400/[0.05]' : 'border-amber-400/20 bg-amber-400/[0.05]'}`}>
              <span className="flex items-center justify-between gap-2"><span className="truncate text-[11px] font-semibold text-gray-100">{suggestion.label}</span><span className={`shrink-0 text-[9.5px] uppercase tracking-wide ${suggestion.ready ? 'text-indigo-200' : 'text-amber-200'}`}>{suggestion.ready ? 'Preview' : 'Pendiente'}</span></span>
              <span className="mt-0.5 block truncate text-[10.5px] text-gray-400">{suggestion.example}</span>
              <span className={`mt-0.5 block truncate text-[10px] ${suggestion.ready ? 'text-indigo-200/70' : 'text-amber-200/80'}`}>{suggestion.reason}</span>
            </button>
          ))}
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-500"><span>Historial</span><span>{log.length}</span></div>
          <div className="flex gap-1.5">
            <button type="button" onClick={onUndo} disabled={!canUndo} className="flex-1 rounded-lg border border-white/10 px-2 py-1 text-[10.5px] text-gray-300 disabled:opacity-40 hover:bg-white/10">Deshacer cmd</button>
            <button type="button" onClick={onRedo} disabled={!canRedo} className="flex-1 rounded-lg border border-white/10 px-2 py-1 text-[10.5px] text-gray-300 disabled:opacity-40 hover:bg-white/10">Rehacer cmd</button>
          </div>
          {log.slice(0, 3).map((item) => <div key={item.id} className="rounded-lg bg-white/[0.04] px-2 py-1 text-[10.5px] text-gray-300"><span className={item.status === 'failed' ? 'text-rose-300' : item.status === 'applied' ? 'text-emerald-300' : 'text-indigo-200'}>{item.status}</span> · {item.label}{item.durationMs !== undefined ? ` · ${item.durationMs} ms` : ''}{item.affectedObjectIds?.length ? ` · ${item.affectedObjectIds.length} obj` : ''}</div>)}
        </div>
      )}
    </div>
  );
}
