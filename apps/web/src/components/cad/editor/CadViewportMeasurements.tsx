"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps, type MutableRefObject } from "react";
import { Pencil } from "lucide-react";
import { Button, Input } from "@/components/ui";
import type { CadDocument } from "@/lib/cad/cad-document";
import { cadDrawingVisibleMetrics, type CadVisibleDimension } from "@/lib/cad/onboarding/drawing-visible-metrics";
import type { CadRoomAreaLabel } from "@/lib/cad/onboarding/room-area-labels";
import type { CadViewController } from "@/lib/cad/view/view-controller";
import ScaleBar from "./ScaleBar";
export { renameCadRoomSpace } from "./cad-room-name-editor";

type Props = ComponentProps<typeof ScaleBar> & {
  document: CadDocument | null;
  viewControllerRef: MutableRefObject<CadViewController | null>;
  essential: boolean;
  onRenameRoom?: (room: CadRoomAreaLabel, name: string) => boolean;
};

type PlacedLabel = { room: CadRoomAreaLabel; x: number; y: number };
type PlacedDimension = { dimension: CadVisibleDimension; x: number; y: number };

/** Escala y áreas del plano, sin añadir trabajo de React al editor monolítico. */
export function CadViewportMeasurements({ document, viewControllerRef, essential, onRenameRoom, ...scaleBar }: Props) {
  const metrics = useMemo(() => cadDrawingVisibleMetrics(document), [document]);
  const [placed, setPlaced] = useState<{ rooms: PlacedLabel[]; dimensions: PlacedDimension[] }>({ rooms: [], dimensions: [] });
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const skipRenameBlurRef = useRef(false);
  const beginRename = (room: CadRoomAreaLabel) => {
    if (!onRenameRoom) return;
    skipRenameBlurRef.current = false;
    setDraftName(room.name);
    setEditingRoomId(room.id);
  };
  const saveRename = (room: CadRoomAreaLabel) => {
    const name = draftName.trim();
    if (name && name !== room.name && onRenameRoom?.(room, name) === false) return;
    skipRenameBlurRef.current = true;
    setEditingRoomId(null);
  };

  useEffect(() => {
    let last = "";
    const project = () => {
      const view = viewControllerRef.current;
      const mount = scaleBar.mountRef.current;
      const visible = ({ x, y }: { x: number; y: number }) =>
        Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0 &&
        x < (mount?.clientWidth ?? 0) && y < (mount?.clientHeight ?? 0);
      const rooms = view?.mode === "2d" && mount
        ? metrics.rooms.map((room) => ({ room, ...view.worldToScreen(room.at) })).filter(visible)
        : [];
      const dimensions = essential && view?.mode === "2d" && mount
        ? metrics.dimensions.map((dimension) => ({ dimension, ...view.worldToScreen(dimension.at) })).filter(visible)
        : [];
      const key = [
        ...rooms.map(({ room, x, y }) => `${room.id}:${room.name}:${room.axisAreaText}:${Math.round(x)}:${Math.round(y)}`),
        ...dimensions.map(({ dimension, x, y }) => `${dimension.id}:${dimension.text}:${Math.round(x)}:${Math.round(y)}`),
      ].join("|");
      if (key === last) return;
      last = key;
      setPlaced({ rooms, dimensions });
    };
    project();
    const timer = window.setInterval(project, 120);
    return () => window.clearInterval(timer);
  }, [metrics, essential, scaleBar.mountRef, viewControllerRef]);

  return (
    <>
      <ScaleBar {...scaleBar} />
      {essential && metrics.openings && (
        <div data-testid="cad-opening-counts" className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-slate-500/40 bg-slate-950/85 px-2 py-1 text-xs font-medium text-white shadow-sm">
          {metrics.openings.doors} {metrics.openings.doors === 1 ? "puerta" : "puertas"} · {metrics.openings.windows} {metrics.openings.windows === 1 ? "ventana" : "ventanas"}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 z-10" data-testid="cad-room-area-overlay">
        {placed.rooms.map(({ room, x, y }) => (
          <div
            key={room.id}
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-control border border-border bg-surface/90 text-center text-foreground shadow-floating ${essential ? "max-w-32 px-1 py-0.5" : "px-2 py-1"}`}
            style={{ left: x, top: y + (!essential && room.textLabelMatchesName ? 20 : 0) }}
            title={`Área entre ejes de muros: ${room.axisAreaText} m²${room.clearAreaText ? `. Área útil: ${room.clearAreaText} m².` : "."}`}
          >
            {editingRoomId === room.id ? (
              <Input
                autoFocus
                data-testid="cad-room-name-input"
                label="Nombre del cuarto"
                hideLabel
                wrapperClassName="pointer-events-auto w-32"
                className="text-center"
                value={draftName}
                maxLength={80}
                onChange={(event) => setDraftName(event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
                onBlur={() => { if (!skipRenameBlurRef.current) saveRename(room); }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    skipRenameBlurRef.current = true;
                    setEditingRoomId(null);
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    saveRename(room);
                  }
                }}
              />
            ) : essential || !room.textLabelMatchesName ? (
              <div
                className={`pointer-events-auto max-w-32 cursor-text type-micro font-semibold leading-tight ${essential ? "break-words" : "truncate"}`}
                title="Doble clic para renombrar el cuarto"
                onMouseDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => { event.stopPropagation(); beginRename(room); }}
              >{room.name}</div>
            ) : null}
            <div className="type-caption font-bold leading-tight">{room.axisAreaText} m²</div>
            {!essential && !room.textLabelMatchesName && <div className="type-micro leading-tight text-muted-foreground">entre ejes</div>}
            {room.textLabelMatchesName && onRenameRoom && (
              <Button
                variant="secondary"
                size="sm"
                className="pointer-events-auto absolute -right-4 -top-4 w-8 min-w-8 p-0"
                aria-label="Renombrar este cuarto"
                title="Renombrar este cuarto"
                onClick={() => beginRename(room)}
              ><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></Button>
            )}
          </div>
        ))}
      </div>
      {essential && <div className="pointer-events-none absolute inset-0 z-10" data-testid="cad-dimension-label-overlay">
        {placed.dimensions.map(({ dimension, x, y }) => (
          <div key={dimension.id} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-slate-950/90 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white shadow-sm" style={{ left: x, top: y }}>
            {dimension.text}
          </div>
        ))}
      </div>}
      <span className="sr-only" role="status" aria-live="polite">
        {metrics.rooms.map((room) => `${room.name}: ${room.axisAreaText} metros cuadrados entre ejes`).join(". ")}
      </span>
    </>
  );
}
