"use client";

import { useState } from 'react';
import type { CadExternalReference } from '@/lib/cad/cad-document';
import type { CadXrefGraph, CadXrefVersionComparison } from '@/lib/cad/cad-xrefs';

export interface CadXrefAttachDraft {
  assetId: string;
  revision: string;
  name: string;
  mode: 'attachment' | 'overlay';
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface CadXrefPaletteProps {
  references: CadExternalReference[];
  graph: CadXrefGraph;
  defaultPoint: { x: number; y: number };
  onAttach(draft: CadXrefAttachDraft): Promise<void>;
  onCompare(reference: CadExternalReference): Promise<CadXrefVersionComparison | null>;
  onReload(reference: CadExternalReference): Promise<void>;
  onUnload(id: string): void;
  onDetach(id: string): void;
  onBind(id: string): void;
}

const tone: Record<string, string> = {
  loaded: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200',
  unloaded: 'border-gray-300/15 bg-white/[0.04] text-gray-300',
  stale: 'border-amber-300/25 bg-amber-400/10 text-amber-200',
  missing: 'border-rose-300/25 bg-rose-400/10 text-rose-200',
  denied: 'border-rose-300/25 bg-rose-400/10 text-rose-200',
  cycle: 'border-rose-300/25 bg-rose-400/10 text-rose-200',
  depth_exceeded: 'border-rose-300/25 bg-rose-400/10 text-rose-200',
};

export function CadXrefPalette(props: CadXrefPaletteProps) {
  const [draft, setDraft] = useState<CadXrefAttachDraft>({ assetId: '', revision: 'UNIVERSAL', name: '', mode: 'attachment', x: props.defaultPoint.x, y: props.defaultPoint.y, scale: 1, rotation: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [comparison, setComparison] = useState<CadXrefVersionComparison | null>(null);
  const input = 'mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white outline-none focus:border-cyan-400/50';
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setMessage(null);
    try { await action(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'No se pudo completar la operación Xref.'); }
    finally { setBusy(null); }
  };
  return (
    <div data-testid="cad-xref-palette" className="h-full overflow-y-auto p-3 text-[10.5px]">
      <div className="flex items-center justify-between"><strong className="text-cyan-100">EXTERNAL REFERENCES</strong><span className="text-gray-500">{props.references.length} linked</span></div>
      <p className="mt-1 text-[9.5px] leading-relaxed text-gray-500">Referencias a layouts del mismo tenant. Nunca se persisten rutas locales del navegador.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <label className="text-gray-400">Asset / model<input data-testid="cad-xref-asset" value={draft.assetId} onChange={(event) => setDraft((current) => ({ ...current, assetId: event.target.value.slice(0, 96) }))} placeholder="PLANT-ARCH" className={input} /></label>
        <label className="text-gray-400">Revision<input data-testid="cad-xref-revision" value={draft.revision} onChange={(event) => setDraft((current) => ({ ...current, revision: event.target.value.slice(0, 64) }))} className={input} /></label>
        <label className="text-gray-400">Display name<input data-testid="cad-xref-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value.slice(0, 80) }))} placeholder={draft.assetId || 'Reference'} className={input} /></label>
        <label className="text-gray-400">Type<select data-testid="cad-xref-mode" value={draft.mode} onChange={(event) => setDraft((current) => ({ ...current, mode: event.target.value as CadXrefAttachDraft['mode'] }))} className={input}><option value="attachment">Attachment</option><option value="overlay">Overlay</option></select></label>
        {(['x', 'y', 'scale', 'rotation'] as const).map((key) => <label key={key} className="text-gray-400">{key}<input data-testid={`cad-xref-${key}`} type="number" value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: Number(event.target.value) || 0 }))} className={input} /></label>)}
        <button data-testid="cad-xref-attach" disabled={busy !== null || !draft.assetId.trim() || !draft.revision.trim() || draft.scale <= 0} onClick={() => void run('attach', () => props.onAttach({ ...draft, assetId: draft.assetId.trim(), revision: draft.revision.trim(), name: draft.name.trim() || draft.assetId.trim() }))} className="col-span-2 rounded-lg bg-cyan-500 px-3 py-1.5 font-semibold text-gray-950 disabled:opacity-40">{busy === 'attach' ? 'Resolving tenant asset…' : 'Attach tenant Xref'}</button>
      </div>
      {message && <div data-testid="cad-xref-message" className="mt-2 rounded-lg border border-rose-300/20 bg-rose-400/[0.08] px-2 py-1.5 text-rose-100">{message}</div>}

      <div className="mt-3 space-y-2">
        {props.references.map((reference) => {
          const status = reference.status ?? (reference.loaded ? 'loaded' : 'unloaded');
          return <article key={reference.id} data-testid={`cad-xref-row-${reference.assetId ?? reference.id}`} className="rounded-xl border border-white/10 bg-gray-950/50 p-2.5">
            <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><strong className="block truncate text-gray-100">{reference.name}</strong><span className="block truncate text-[9px] text-gray-500">{reference.relativePath ?? reference.uri}</span></div><span className={`rounded-full border px-1.5 py-0.5 text-[8.5px] ${tone[status] ?? tone.unloaded}`}>{status}</span></div>
            <div className="mt-1 grid grid-cols-3 gap-1 text-[9px] text-gray-500"><span>{reference.mode ?? 'attachment'}</span><span>v{reference.sourceVersion ?? 0}</span><span>{reference.contentHash?.slice(0, 10) ?? 'no hash'}</span></div>
            {reference.error && <p className="mt-1 text-[9px] text-rose-300">{reference.error}</p>}
            <div className="mt-2 grid grid-cols-5 gap-1">
              <button disabled={busy !== null} onClick={() => void run(`compare:${reference.id}`, async () => setComparison(await props.onCompare(reference)))} className="rounded border border-white/10 px-1 py-1 text-gray-200 disabled:opacity-30">Compare</button>
              <button disabled={busy !== null} onClick={() => void run(`reload:${reference.id}`, () => props.onReload(reference))} className="rounded border border-cyan-300/20 px-1 py-1 text-cyan-100 disabled:opacity-30">{reference.loaded ? 'Reload' : 'Load'}</button>
              <button disabled={!reference.loaded || busy !== null} onClick={() => props.onUnload(reference.id)} className="rounded border border-white/10 px-1 py-1 text-gray-300 disabled:opacity-30">Unload</button>
              <button disabled={!reference.loaded || busy !== null} onClick={() => props.onBind(reference.id)} className="rounded border border-amber-300/20 px-1 py-1 text-amber-100 disabled:opacity-30">Bind</button>
              <button disabled={busy !== null} onClick={() => props.onDetach(reference.id)} className="rounded border border-rose-300/20 px-1 py-1 text-rose-200 disabled:opacity-30">Detach</button>
            </div>
          </article>;
        })}
        {!props.references.length && <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-gray-500">No tenant Xrefs attached.</div>}
      </div>

      {comparison && <div data-testid="cad-xref-comparison" className="mt-3 rounded-xl border border-violet-300/20 bg-violet-400/[0.08] p-2 text-violet-100"><strong>Version compare {comparison.currentVersion} → {comparison.incomingVersion}</strong><div className="mt-1 grid grid-cols-3 text-[9.5px]"><span>+{comparison.added.length} added</span><span>~{comparison.modified.length} modified</span><span>−{comparison.deleted.length} deleted</span></div><div className="mt-1 text-[9px] text-violet-200/70">{comparison.currentHash.slice(0, 10)} → {comparison.incomingHash.slice(0, 10)}</div></div>}
      <div data-testid="cad-xref-graph" className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2"><div className="flex justify-between"><strong className="text-gray-300">Dependency graph</strong><span className="text-gray-500">depth {props.graph.maxDepth}/{8}</span></div>{props.graph.edges.map((edge, index) => <div key={`${edge.from}:${edge.to}:${index}`} className="mt-1 font-mono text-[9px] text-gray-500">{edge.from} → {edge.to} [{edge.mode}]</div>)}{props.graph.issues.map((issue, index) => <div key={`${issue.code}:${index}`} className="mt-1 text-[9px] text-rose-200">{issue.code}: {issue.detail}</div>)}</div>
      <p className="mt-2 text-[9px] leading-relaxed text-gray-500">Publish incluye sólo referencias cargadas mediante BLOCK/INSERT vectorial. DXF conserva esa proyección como BLOCK/INSERT; Bind la convierte en geometría local editable.</p>
    </div>
  );
}
