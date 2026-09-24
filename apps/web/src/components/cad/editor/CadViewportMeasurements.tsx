"use client";

import { useEffect, useMemo, useState, type ComponentProps, type MutableRefObject } from "react";
import type { CadDocument } from "@/lib/cad/cad-document";
import { cadDrawingVisibleMetrics, type CadVisibleDimension } from "@/lib/cad/onboarding/drawing-visible-metrics";
import type { CadRoomAreaLabel } from "@/lib/cad/onboarding/room-area-labels";
import type { CadViewController } from "@/lib/cad/view/view-controller";
import ScaleBar from "./ScaleBar";

type Props = ComponentProps<typeof ScaleBar> & {
  document: CadDocument | null;
  viewControllerRef: MutableRefObject<CadViewController | null>;
  essential: boolean;
};

type PlacedLabel = { room: CadRoomAreaLabel; x: number; y: number };
type PlacedDimension = { dimension: CadVisibleDimension; x: number; y: number };

/** Escala y áreas del plano, sin añadir trabajo de React al editor monolítico. */
export function CadViewportMeasurements({ document, viewControllerRef, essential, ...scaleBar }: Props) {
  const metrics = useMemo(() => cadDrawingVisibleMetrics(document), [document]);
  const [placed, setPlaced] = useState<{ rooms: PlacedLabel[]; dimensions: PlacedDimension[] }>({ rooms: [], dimensions: [] });

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
        ...rooms.map(({ room, x, y }) => `${room.id}:${room.axisAreaText}:${Math.round(x)}:${Math.round(y)}`),
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
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md border border-indigo-300/40 bg-slate-950/85 text-center text-white shadow-sm ${essential ? "max-w-32 px-1 py-0.5" : "px-2 py-1"}`}
            style={{ left: x, top: y + (!essential && room.nameFromDocument ? 20 : 0) }}
            title={`Área entre ejes de muros: ${room.axisAreaText} m²${room.clearAreaText ? `. Área útil: ${room.clearAreaText} m².` : "."}`}
          >
            {essential
              ? <div className="break-words type-micro font-semibold leading-tight">{room.name}</div>
              : !room.nameFromDocument && <div className="max-w-32 truncate type-micro font-semibold leading-tight">{room.name}</div>}
            <div className="text-xs font-bold leading-tight">{room.axisAreaText} m²</div>
            {!essential && !room.nameFromDocument && <div className="type-micro leading-tight text-slate-200">entre ejes</div>}
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
