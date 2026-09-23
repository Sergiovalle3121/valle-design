"use client";

import { useEffect, useMemo, useState, type ComponentProps, type MutableRefObject } from "react";
import type { CadDocument } from "@/lib/cad/cad-document";
import { cadRoomAreaLabels, type CadRoomAreaLabel } from "@/lib/cad/onboarding/room-area-labels";
import type { CadViewController } from "@/lib/cad/view/view-controller";
import ScaleBar from "./ScaleBar";

type Props = ComponentProps<typeof ScaleBar> & {
  document: CadDocument | null;
  viewControllerRef: MutableRefObject<CadViewController | null>;
};

type PlacedLabel = { room: CadRoomAreaLabel; x: number; y: number };

/** Escala y áreas del plano, sin añadir trabajo de React al editor monolítico. */
export function CadViewportMeasurements({ document, viewControllerRef, ...scaleBar }: Props) {
  const rooms = useMemo(() => cadRoomAreaLabels(document), [document]);
  const [placed, setPlaced] = useState<PlacedLabel[]>([]);

  useEffect(() => {
    let last = "";
    const project = () => {
      const view = viewControllerRef.current;
      const mount = scaleBar.mountRef.current;
      const next = view?.mode === "2d" && mount
        ? rooms.map((room) => ({ room, ...view.worldToScreen(room.at) })).filter(({ x, y }) =>
            Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0 &&
            x < mount.clientWidth && y < mount.clientHeight)
        : [];
      const key = next.map(({ room, x, y }) => `${room.id}:${Math.round(x)}:${Math.round(y)}`).join("|");
      if (key === last) return;
      last = key;
      setPlaced(next);
    };
    project();
    const timer = window.setInterval(project, 120);
    return () => window.clearInterval(timer);
  }, [rooms, scaleBar.mountRef, viewControllerRef]);

  return (
    <>
      <ScaleBar {...scaleBar} />
      <div className="pointer-events-none absolute inset-0 z-10" data-testid="cad-room-area-overlay">
        {placed.map(({ room, x, y }) => (
          <div
            key={room.id}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md border border-indigo-300/40 bg-slate-950/85 px-2 py-1 text-center text-white shadow-sm"
            style={{ left: x, top: y + (room.nameFromDocument ? 20 : 0) }}
            title={`Área entre ejes de muros: ${room.axisAreaText} m²${room.clearAreaText ? `. Área útil: ${room.clearAreaText} m².` : "."}`}
          >
            {!room.nameFromDocument && <div className="max-w-32 truncate type-micro font-semibold leading-tight">{room.name}</div>}
            <div className="text-xs font-bold leading-tight">{room.axisAreaText} m²</div>
            {!room.nameFromDocument && <div className="type-micro leading-tight text-slate-200">entre ejes</div>}
          </div>
        ))}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {rooms.map((room) => `${room.name}: ${room.axisAreaText} metros cuadrados entre ejes`).join(". ")}
      </span>
    </>
  );
}
