"use client";

/**
 * El plano tal y como lo ve el CLIENTE: SVG, sin WebGL, sin descargar nada.
 *
 * ## Por qué no es el estudio
 *
 * El estudio pesa un editor entero y pide sesión. Quien abre un enlace de
 * revisión no tiene cuenta, a menudo llega desde el móvil y sólo necesita ver
 * el dibujo y señalar un punto. Un SVG hace exactamente eso: se dibuja en
 * cualquier navegador, se amplía sin perder nitidez y se imprime.
 *
 * La geometría sale del MISMO registro de entidades que usa el editor
 * (`plan-projection.ts`), no de un dibujante paralelo. Es la diferencia entre
 * que el cliente comente sobre el plano del arquitecto o sobre una versión
 * parecida.
 *
 * ## La cámara es la del CAD, literalmente
 *
 * El encuadre se guarda como un `CadView` y el `viewBox` se deriva de él. Así
 * el paneo, el zoom en el cursor y la proyección de las chinchetas son las
 * MISMAS funciones probadas que usa el estudio (`view/cad-view.ts`,
 * `collab/overlay-model.ts`). Escribir aquí una segunda aritmética de cámara
 * habría significado que una chincheta cae en dos sitios distintos según quién
 * mire, y eso es justo lo que un enlace de revisión no se puede permitir.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CadPoint2 } from "@/lib/cad/cad-document";
import {
  cadViewFromViewport,
  cadViewPanByPixels,
  cadViewScreenToWorld,
  cadViewWorldToScreen,
  cadViewZoomAtCursor,
  cadViewZoomToBounds,
  type CadView,
} from "@/lib/cad/view/cad-view";
import {
  placeCadCommentPins,
  type CadCommentPin,
} from "@/lib/cad/collab/overlay-model";
import {
  cadPlanStrokePath,
  type CadPlanProjection,
} from "@/lib/cad/collab/plan-projection";

export interface ReviewPlanViewProps {
  projection: CadPlanProjection;
  pins: CadCommentPin[];
  activeId: string | null;
  onSelect: (commentId: string | null) => void;
  placing: boolean;
  onPlace: (point: CadPoint2) => void;
}

export default function ReviewPlanView({
  projection,
  pins,
  activeId,
  onSelect,
  placing,
  onPlace,
}: ReviewPlanViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ widthPx: 0, heightPx: 0 });
  const [view, setView] = useState<CadView | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(
    null,
  );
  // El encuadre inicial se hace UNA vez. Rehacerlo en cada medida devolvería
  // al cliente al plano completo cada vez que gira el móvil o aparece el
  // teclado, justo cuando estaba mirando un detalle.
  const framed = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      setSize({
        widthPx: Math.max(1, Math.round(rect.width)),
        heightPx: Math.max(1, Math.round(rect.height)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!(size.widthPx > 1) || !(size.heightPx > 1)) return;
    setView((previous) => {
      if (previous && framed.current)
        return { ...previous, widthPx: size.widthPx, heightPx: size.heightPx };
      const base = cadViewFromViewport(
        size.widthPx,
        size.heightPx,
        0,
        0,
        1,
      );
      if (!projection.bounds) return base;
      framed.current = true;
      return cadViewZoomToBounds(base, projection.bounds);
    });
  }, [projection.bounds, size.heightPx, size.widthPx]);

  const toWorld = useCallback(
    (event: { clientX: number; clientY: number }): CadPoint2 | null => {
      const host = hostRef.current;
      if (!host || !view) return null;
      const rect = host.getBoundingClientRect();
      return cadViewScreenToWorld(
        view,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    },
    [view],
  );

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const host = hostRef.current;
      if (!host || !view) return;
      const rect = host.getBoundingClientRect();
      setView(
        cadViewZoomAtCursor(
          view,
          event.clientX - rect.left,
          event.clientY - rect.top,
          event.deltaY < 0 ? 1.15 : 1 / 1.15,
        ),
      );
    },
    [view],
  );

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId || !view) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.moved && Math.hypot(dx, dy) < 4) return;
      state.moved = true;
      state.x = event.clientX;
      state.y = event.clientY;
      setView(cadViewPanByPixels(view, dx, dy));
    },
    [view],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      // Un arrastre NO es un clic: sin esto, panear el plano colocaría una
      // nota al soltar, que es la forma más rápida de llenar el dibujo de
      // comentarios que nadie quiso poner.
      if (!state || state.moved) return;
      if (!placing) {
        onSelect(null);
        return;
      }
      const world = toWorld(event);
      if (world) onPlace(world);
    },
    [onPlace, onSelect, placing, toWorld],
  );

  const placements = useMemo(() => {
    if (!view) return [];
    return placeCadCommentPins(
      (point) => cadViewWorldToScreen(view, point),
      { widthPx: view.widthPx, heightPx: view.heightPx },
      pins,
    );
  }, [pins, view]);

  const viewBox = view
    ? `${view.centerX - view.widthPx / 2 / view.pixelsPerUnit} ${
        view.centerY - view.heightPx / 2 / view.pixelsPerUnit
      } ${view.widthPx / view.pixelsPerUnit} ${view.heightPx / view.pixelsPerUnit}`
    : "0 0 1 1";
  // Grosor constante en PANTALLA: una línea de plano no engorda al ampliar.
  const strokeWidth = view ? 1.2 / view.pixelsPerUnit : 1;

  return (
    <div
      ref={hostRef}
      data-testid="cad-review-plan"
      data-placing={placing ? "true" : "false"}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
      className={`relative h-full w-full touch-none overflow-hidden bg-[#0b1020] ${
        placing ? "cursor-crosshair" : "cursor-grab"
      }`}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={viewBox}
        preserveAspectRatio="none"
        aria-label="Plano en revisión"
      >
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {projection.strokes.map((stroke, index) => (
            <path
              key={`${stroke.entityId}-${index}`}
              d={cadPlanStrokePath(stroke)}
              stroke={stroke.color}
              strokeWidth={strokeWidth}
            />
          ))}
        </g>
      </svg>

      {placements.map((placement) => (
        <button
          key={placement.id}
          type="button"
          data-testid={`cad-review-pin-${placement.id}`}
          data-offscreen={placement.offscreen ? "true" : "false"}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(activeId === placement.id ? null : placement.id);
          }}
          style={{ transform: `translate3d(${placement.x}px, ${placement.y}px, 0)` }}
          className={`absolute left-0 top-0 -ml-3 -mt-3 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold shadow-lg ${
            placement.resolved
              ? "border-emerald-200/60 bg-emerald-500/85 text-gray-950"
              : "border-amber-200/70 bg-amber-400 text-gray-950"
          } ${placement.offscreen ? "opacity-70 ring-2 ring-white/30" : ""} ${
            activeId === placement.id ? "ring-2 ring-cyan-300" : ""
          }`}
          aria-label={`Comentario ${placement.ordinal}`}
        >
          {placement.ordinal}
        </button>
      ))}

      {projection.truncated ? (
        <p
          data-testid="cad-review-truncated"
          role="alert"
          className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-rose-300/30 bg-gray-950/95 px-3 py-1 text-[11px] text-rose-100"
        >
          Este plano es demasiado grande para la vista de revisión y se muestra
          incompleto. Pide al autor un PDF o una vista más acotada.
        </p>
      ) : null}
    </div>
  );
}
