"use client";

import { useMemo, useRef, useState } from 'react';
import { Copy, Eye, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import type { CadLayerDef, CadPaperSpace, CadPaperViewport } from '@/lib/cad/cad-document';
import type { CadLayoutPreflightIssue } from '@/lib/cad/cad-layout-manager';
import type { CadPublishSheet } from '@/lib/cad/paper-space';
import { CAD_SHEET_SCALES } from '@/lib/cad/paper-space';

interface CadLayoutManagerProps {
  space: CadPaperSpace;
  activeViewportId: string | null;
  layers: CadLayerDef[];
  preflight: CadLayoutPreflightIssue[];
  preview: CadPublishSheet | null;
  onActivate(id: string): void;
  onAdd(): void;
  onDuplicate(id: string): void;
  onDelete(id: string): void;
  onChange(id: string, update: (viewport: CadPaperViewport) => CadPaperViewport, label: string): void;
  onLayerVisibility(id: string, layerId: string, visible: boolean): void;
  onLayerOverride(id: string, layerId: string, override: { color?: string; linetype?: string; lineweight?: number } | null): void;
  onRequestPreview(): void;
}

type DragState = {
  mode: 'move' | 'resize';
  viewport: CadPaperViewport;
  startX: number;
  startY: number;
  host: DOMRect;
};

function fieldValue(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function CadExactPrintPreview({ sheet }: { sheet: CadPublishSheet }) {
  const clipIds = useMemo(() => new Map(sheet.viewports.map((viewport) => [viewport.id, `cad-clip-${viewport.id.replace(/[^a-z0-9_-]/gi, '-')}`])), [sheet.viewports]);
  return (
    <div data-testid="cad-exact-print-preview" className="rounded-xl border border-white/10 bg-slate-200 p-2">
      <svg viewBox={`0 0 ${sheet.width} ${sheet.height}`} className="mx-auto block max-h-[460px] w-full bg-white shadow-xl" aria-label={`Exact print preview ${sheet.name}`}>
        <defs>{sheet.viewports.map((viewport) => <clipPath key={viewport.id} id={clipIds.get(viewport.id)}><rect {...viewport.clip} /></clipPath>)}</defs>
        <rect x="0" y="0" width={sheet.width} height={sheet.height} fill="#fff" />
        <rect x="6" y="6" width={Math.max(1, sheet.width - 12)} height={Math.max(1, sheet.height - 12)} fill="none" stroke="#111827" strokeWidth="0.45" />
        {sheet.viewports.map((viewport) => (
          <g key={viewport.id}>
            <g clipPath={`url(#${clipIds.get(viewport.id)})`}>
              {viewport.commands.map((command, index) => command.kind === 'path' ? (
                <path key={`${command.entityId}:${index}`} d={`${command.points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'}${point.x},${point.y}`).join(' ')}${command.closed ? ' Z' : ''}`} fill={command.style.fill ?? 'none'} stroke={command.style.stroke} strokeWidth={command.style.lineWidth} strokeDasharray={command.style.dash?.join(' ')} />
              ) : (
                <text key={`${command.entityId}:${index}`} x={command.point.x} y={command.point.y} fill={command.color} fontSize={command.size} fontWeight={command.bold ? 700 : 400} fontStyle={command.italic ? 'italic' : 'normal'} textAnchor={command.align === 'center' ? 'middle' : command.align === 'right' ? 'end' : 'start'} transform={`rotate(${command.rotation} ${command.point.x} ${command.point.y})`}>{command.text}</text>
              ))}
            </g>
            <rect {...viewport.clip} fill="none" stroke="#0f172a" strokeWidth="0.35" />
            <text x={viewport.clip.x + 1.5} y={viewport.clip.y + 4} fill="#0f172a" fontSize="3">{viewport.name} · 1:{viewport.scale}</text>
          </g>
        ))}
        <rect x="6" y={Math.max(6, sheet.height - 36)} width={Math.max(1, sheet.width - 12)} height="30" fill="none" stroke="#0f172a" strokeWidth="0.35" />
        <text x="9" y={Math.max(10, sheet.height - 29)} fill="#0f172a" fontSize="4">{sheet.titleBlock.PROJECT ?? sheet.name}</text>
        <text x="9" y={Math.max(14, sheet.height - 22)} fill="#0f172a" fontSize="3">{sheet.titleBlock.DRAWING_NO ?? ''} · {sheet.titleBlock.REVISION ?? ''}</text>
      </svg>
    </div>
  );
}

export function CadLayoutManager(props: CadLayoutManagerProps) {
  const { space } = props;
  const active = (space.viewports ?? []).find((viewport) => viewport.id === props.activeViewportId) ?? space.viewports?.[0] ?? null;
  const paperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const draftBoundsRef = useRef<CadPaperViewport['paperBounds'] | null>(null);
  const [draftBounds, setDraftBounds] = useState<CadPaperViewport['paperBounds'] | null>(null);
  const beginDrag = (event: React.PointerEvent, viewport: CadPaperViewport, mode: DragState['mode']) => {
    event.preventDefault(); event.stopPropagation();
    const host = paperRef.current?.getBoundingClientRect();
    if (!host || viewport.locked) return;
    props.onActivate(viewport.id);
    dragRef.current = { mode, viewport, startX: event.clientX, startY: event.clientY, host };
    draftBoundsRef.current = viewport.paperBounds;
    setDraftBounds(viewport.paperBounds);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / Math.max(1, drag.host.width) * space.page.width;
    const dy = (event.clientY - drag.startY) / Math.max(1, drag.host.height) * space.page.height;
    const next = drag.mode === 'move'
      ? { ...drag.viewport.paperBounds, x: drag.viewport.paperBounds.x + dx, y: drag.viewport.paperBounds.y + dy }
      : { ...drag.viewport.paperBounds, width: drag.viewport.paperBounds.width + dx, height: drag.viewport.paperBounds.height + dy };
    draftBoundsRef.current = next;
    setDraftBounds(next);
  };
  const endDrag = () => {
    const drag = dragRef.current;
    const finalBounds = draftBoundsRef.current;
    if (drag && finalBounds) props.onChange(drag.viewport.id, (viewport) => ({ ...viewport, paperBounds: finalBounds }), drag.mode === 'move' ? 'Mover viewport' : 'Redimensionar viewport');
    dragRef.current = null; draftBoundsRef.current = null; setDraftBounds(null);
  };
  const shownBounds = (viewport: CadPaperViewport) => active?.id === viewport.id && draftBounds ? draftBounds : viewport.paperBounds;
  const updateNumber = (section: 'paperBounds' | 'modelBounds', field: 'x' | 'y' | 'width' | 'height', value: number) => {
    if (!active || !Number.isFinite(value) || ((field === 'width' || field === 'height') && value <= 0)) return;
    props.onChange(active.id, (viewport) => ({ ...viewport, [section]: { ...viewport[section], [field]: value } }), `Viewport ${section}.${field}`);
  };

  return (
    <section data-testid="cad-layout-manager" className="col-span-full mt-2 space-y-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[10px] font-semibold uppercase tracking-[0.15em] text-indigo-200">Viewports · {space.viewports?.length ?? 0}</span>
        <button data-testid="cad-viewport-add" onClick={props.onAdd} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-[10.5px] font-semibold text-white hover:bg-indigo-500"><Plus className="h-3 w-3" />Viewport</button>
        <button disabled={!active} onClick={() => active && props.onDuplicate(active.id)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10.5px] disabled:opacity-35"><Copy className="h-3 w-3" />Duplicar</button>
        <button disabled={!active} onClick={() => active && props.onDelete(active.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300/20 px-2 py-1 text-[10.5px] text-rose-200 disabled:opacity-35"><Trash2 className="h-3 w-3" />Eliminar</button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div ref={paperRef} data-testid="cad-paper-preview" className="relative mx-auto w-full overflow-hidden rounded-sm bg-white shadow-xl" style={{ aspectRatio: `${space.page.width}/${space.page.height}` }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            {(space.viewports ?? []).map((viewport) => {
              const bounds = shownBounds(viewport);
              return (
                <button key={viewport.id} data-testid={`cad-paper-viewport-${viewport.id}`} onClick={() => props.onActivate(viewport.id)} onPointerDown={(event) => beginDrag(event, viewport, 'move')} className={`absolute overflow-hidden border-2 text-left text-[8px] ${active?.id === viewport.id ? 'z-10 border-indigo-500 bg-indigo-100/20 text-indigo-950' : 'border-slate-500 bg-slate-100/15 text-slate-700'}`} style={{ left: `${bounds.x / space.page.width * 100}%`, top: `${bounds.y / space.page.height * 100}%`, width: `${bounds.width / space.page.width * 100}%`, height: `${bounds.height / space.page.height * 100}%` }}>
                  <span className="absolute left-1 top-1 rounded bg-white/80 px-1 py-0.5">{viewport.name ?? viewport.id} · 1:{viewport.scale}{viewport.locked ? ' · LOCK' : ''}</span>
                  {!viewport.locked && <span data-testid={`cad-viewport-resize-${viewport.id}`} onPointerDown={(event) => beginDrag(event, viewport, 'resize')} className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize border-l border-t border-indigo-700 bg-indigo-400" />}
                </button>
              );
            })}
            <div className="pointer-events-none absolute inset-x-[2%] bottom-[2%] h-[10%] border border-slate-600 text-[7px] text-slate-600">TITLE BLOCK</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(space.viewports ?? []).map((viewport) => <button key={viewport.id} onClick={() => props.onActivate(viewport.id)} className={`rounded-full border px-2 py-0.5 text-[9.5px] ${active?.id === viewport.id ? 'border-indigo-300/50 bg-indigo-400/15 text-indigo-100' : 'border-white/10 text-gray-400'}`}>{viewport.name ?? viewport.id}</button>)}
          </div>
        </div>

        {active ? <div className="space-y-2 rounded-xl border border-white/10 bg-gray-950/45 p-2.5">
          <div className="flex items-center gap-2"><input data-testid="cad-viewport-name" value={active.name ?? ''} onChange={(event) => props.onChange(active.id, (viewport) => ({ ...viewport, name: event.target.value.slice(0, 80) }), 'Renombrar viewport')} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[11px] text-white" /><button data-testid="cad-viewport-lock" onClick={() => props.onChange(active.id, (viewport) => ({ ...viewport, locked: !viewport.locked }), active.locked ? 'Desbloquear viewport' : 'Bloquear viewport')} className={`rounded-lg p-1.5 ${active.locked ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-200'}`}>{active.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}</button></div>
          <div className="grid grid-cols-4 gap-1.5">{(['x', 'y', 'width', 'height'] as const).map((field) => <label key={`paper-${field}`} className="text-[9px] text-gray-500">Paper {field}<input data-testid={`cad-viewport-paper-${field}`} type="number" value={fieldValue(active.paperBounds[field])} disabled={active.locked} onChange={(event) => updateNumber('paperBounds', field, Number(event.target.value))} className="mt-0.5 w-full rounded border border-white/10 bg-gray-950/70 px-1 py-1 text-[10px] text-white disabled:opacity-40" /></label>)}</div>
          <div className="grid grid-cols-4 gap-1.5">{(['x', 'y', 'width', 'height'] as const).map((field) => <label key={`model-${field}`} className="text-[9px] text-gray-500">Model {field}<input data-testid={`cad-viewport-model-${field}`} type="number" value={fieldValue(active.modelBounds[field])} disabled={active.locked} onChange={(event) => updateNumber('modelBounds', field, Number(event.target.value))} className="mt-0.5 w-full rounded border border-white/10 bg-gray-950/70 px-1 py-1 text-[10px] text-white disabled:opacity-40" /></label>)}</div>
          <div className="grid grid-cols-3 gap-1.5">
            <label className="text-[9px] text-gray-500">Standard scale<select data-testid="cad-viewport-scale" value={CAD_SHEET_SCALES.includes(active.scale as typeof CAD_SHEET_SCALES[number]) ? active.scale : 'custom'} disabled={active.locked} onChange={(event) => event.target.value !== 'custom' && props.onChange(active.id, (viewport) => ({ ...viewport, scale: Number(event.target.value) }), 'Escala estándar')} className="mt-0.5 w-full rounded border border-white/10 bg-gray-950/70 px-1 py-1 text-[10px] text-white disabled:opacity-40"><option value="custom">Custom</option>{CAD_SHEET_SCALES.map((scale) => <option key={scale} value={scale}>1:{scale}</option>)}</select></label>
            <label className="text-[9px] text-gray-500">Custom scale<input data-testid="cad-viewport-custom-scale" type="number" min="0.001" value={active.scale} disabled={active.locked} onChange={(event) => Number(event.target.value) > 0 && props.onChange(active.id, (viewport) => ({ ...viewport, scale: Number(event.target.value) }), 'Escala personalizada')} className="mt-0.5 w-full rounded border border-white/10 bg-gray-950/70 px-1 py-1 text-[10px] text-white disabled:opacity-40" /></label>
            <label className="text-[9px] text-gray-500">Annotation scale<input data-testid="cad-viewport-annotation-scale" type="number" min="0.001" value={active.annotationScale ?? active.scale} onChange={(event) => Number(event.target.value) > 0 && props.onChange(active.id, (viewport) => ({ ...viewport, annotationScale: Number(event.target.value) }), 'Escala anotativa')} className="mt-0.5 w-full rounded border border-white/10 bg-gray-950/70 px-1 py-1 text-[10px] text-white" /></label>
          </div>
          <label className="block text-[9px] text-gray-500">Named view<input data-testid="cad-viewport-named-view" value={active.namedView ?? ''} onChange={(event) => props.onChange(active.id, (viewport) => ({ ...viewport, namedView: event.target.value.slice(0, 80) }), 'Vista nombrada')} className="mt-0.5 w-full rounded border border-white/10 bg-gray-950/70 px-2 py-1 text-[10px] text-white" /></label>
          <div className="max-h-36 space-y-1 overflow-y-auto border-t border-white/10 pt-2">{props.layers.map((layer) => {
            const visible = active.layerVisibility?.[layer.id] !== false;
            const override = active.layerOverrides?.[layer.id];
            return <div key={layer.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-1.5 rounded bg-white/[0.03] px-1.5 py-1 text-[9.5px]"><label className="flex min-w-0 items-center gap-1.5"><input data-testid={`cad-viewport-layer-${layer.id}`} type="checkbox" checked={visible} onChange={(event) => props.onLayerVisibility(active.id, layer.id, event.target.checked)} /><span className="truncate">{layer.name}</span></label><input aria-label={`Override color ${layer.name}`} type="color" value={override?.color ?? layer.color} onChange={(event) => props.onLayerOverride(active.id, layer.id, { ...override, color: event.target.value })} className="h-5 w-6 bg-transparent" /><input aria-label={`Override lineweight ${layer.name}`} type="number" step="0.05" min="0" value={override?.lineweight ?? ''} placeholder="LW" onChange={(event) => props.onLayerOverride(active.id, layer.id, { ...override, lineweight: event.target.value ? Number(event.target.value) : undefined })} className="w-11 rounded border border-white/10 bg-gray-950 px-1 py-0.5 text-[9px]" /><button onClick={() => props.onLayerOverride(active.id, layer.id, null)} className="text-gray-500 hover:text-white">Reset</button></div>;
          })}</div>
        </div> : <div className="grid place-items-center rounded-xl border border-dashed border-white/10 text-[11px] text-gray-500">Add a viewport to begin.</div>}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
        <button data-testid="cad-layout-preview-build" onClick={props.onRequestPreview} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[10.5px] font-semibold text-gray-900"><Eye className="h-3.5 w-3.5" />Exact print preview</button>
        <span className={`text-[10px] ${props.preflight.some((issue) => issue.severity === 'error') ? 'text-rose-200' : props.preflight.length ? 'text-amber-200' : 'text-emerald-200'}`}>{props.preflight.length ? `${props.preflight.length} preflight issue(s)` : 'Preflight ready'}</span>
        <span className="ml-auto text-[9.5px] text-gray-500">Drag unlocked viewports; use the lower-right grip to resize.</span>
      </div>
      {props.preflight.length > 0 && <div data-testid="cad-layout-preflight" className="grid gap-1 md:grid-cols-2">{props.preflight.map((issue, index) => <div key={`${issue.code}:${issue.viewportId ?? index}`} className={`rounded-lg border px-2 py-1 text-[9.5px] ${issue.severity === 'error' ? 'border-rose-300/20 bg-rose-400/[0.07] text-rose-100' : 'border-amber-300/20 bg-amber-400/[0.07] text-amber-100'}`}>{issue.code}: {issue.detail}</div>)}</div>}
      {props.preview && <CadExactPrintPreview sheet={props.preview} />}
    </section>
  );
}
