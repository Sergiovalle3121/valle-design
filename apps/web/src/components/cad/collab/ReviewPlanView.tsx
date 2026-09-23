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
import type { CadReviewRoomArea } from "@/lib/cad/collab/review-room-areas";
import {
  cadReviewPinchUpdate,
  type ReviewPinch,
} from "@/lib/cad/collab/review-pinch";

export interface ReviewPlanViewProps {
  projection: CadPlanProjection;
  roomAreas: CadReviewRoomArea[];
  pins: CadCommentPin[];
  activeId: string | null;
  onSelect: (commentId: string | null) => void;
  placing: boolean;
  onPlace: (point: CadPoint2) => void;
}

export default function ReviewPlanView({
  projection,
  roomAreas,
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
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<ReviewPinch | null>(null);
  const usedTwoFingers = useRef(false);
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
      if (!host) return;
      const rect = host.getBoundingClientRect();
      setView((current) => current ? cadViewZoomAtCursor(
          current,
          event.clientX - rect.left,
          event.clientY - rect.top,
          event.deltaY < 0 ? 1.15 : 1 / 1.15,
        ) : current);
    },
    [],
  );

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointers.current.size === 0) usedTwoFingers.current = false;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // El navegador ya captura un contacto sobre una chincheta. Dejarlo allí
    // conserva su toque simple y permite que un segundo dedo llegue al plano.
    const onPin = event.target instanceof Element &&
      Boolean(event.target.closest('[data-testid^="cad-review-pin-"]'));
    if (!onPin) event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size >= 2) {
      usedTwoFingers.current = true;
      drag.current = null;
      pinch.current = pinchFromPointers(pointers.current);
    } else {
      drag.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    }
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size >= 2) {
        const next = pinchFromPointers(pointers.current);
        const previous = pinch.current;
        pinch.current = next;
        const host = hostRef.current;
        if (previous && next && host) {
          const rect = host.getBoundingClientRect();
          setView((current) => current ? cadReviewPinchUpdate(
            current,
            { ...previous, x: previous.x - rect.left, y: previous.y - rect.top },
            { ...next, x: next.x - rect.left, y: next.y - rect.top },
          ) : current);
        }
        return;
      }
      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.moved && Math.hypot(dx, dy) < 4) return;
      state.moved = true;
      state.x = event.clientX;
      state.y = event.clientY;
      setView((current) => current ? cadViewPanByPixels(current, dx, dy) : current);
    },
    [],
  );

  const forgetPointer = useCallback((pointerId: number) => {
    if (!pointers.current.delete(pointerId)) return;
    pinch.current = pinchFromPointers(pointers.current);
    if (usedTwoFingers.current) {
      const remaining = pointers.current.entries().next().value;
      drag.current = remaining ? {
        pointerId: remaining[0], x: remaining[1].x,
        y: remaining[1].y, moved: true,
      } : null;
      if (!remaining) usedTwoFingers.current = false;
    } else if (drag.current?.pointerId === pointerId) {
      drag.current = null;
    }
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      const wasPinching = usedTwoFingers.current;
      forgetPointer(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      if (wasPinching) return;
      // Un arrastre NO es un clic: sin esto, panear el plano colocaría una
      // nota al soltar, que es la forma más rápida de llenar el dibujo de
      // comentarios que nadie quiso poner.
      if (!state || state.pointerId !== event.pointerId || state.moved) return;
      if (event.target instanceof Element &&
          event.target.closest('[data-testid^="cad-review-pin-"]')) return;
      if (!placing) {
        onSelect(null);
        return;
      }
      const world = toWorld(event);
      if (world) onPlace(world);
    },
    [forgetPointer, onPlace, onSelect, placing, toWorld],
  );

  const placements = useMemo(() => {
    if (!view) return [];
    return placeCadCommentPins(
      (point) => cadViewWorldToScreen(view, point),
      { widthPx: view.widthPx, heightPx: view.heightPx },
      pins,
    );
  }, [pins, view]);

  const areaPlacements = useMemo(() => {
    if (!view) return [];
    const compact = view.widthPx < 600;
    return roomAreas.flatMap((area) => {
      const position = cadViewWorldToScreen(view, area.at);
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y) ||
          position.x <= 0 || position.y <= 0 ||
          position.x >= view.widthPx || position.y >= view.heightPx) return [];
      return [{ area, compact, x: position.x,
        y: position.y + (!compact && area.nameFromDocument ? 28 : 0) }];
    });
  }, [roomAreas, view]);
  const compactRoomLabelIds = useMemo(() =>
    new Set(roomAreas.flatMap((area) => area.labelId ? [area.labelId] : [])),
    [roomAreas]);

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
      onPointerCancel={(event) => forgetPointer(event.pointerId)}
      onLostPointerCapture={(event) => forgetPointer(event.pointerId)}
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
        <g strokeLinecap="round" strokeLinejoin="round">
          {projection.elements.map((element, index) => {
            if (element.kind === "stroke") {
              const stroke = element.stroke;
              return (
                <path
                  key={`${stroke.entityId}-${index}`}
                  d={cadPlanStrokePath(stroke)}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={strokeWidth}
                />
              );
            }
            const label = element.text;
            // On a narrow screen the authored label is too small to read and
            // collides with the area badge. Its exact name moves into the
            // same badge; other authored text remains in the SVG.
            if (size.widthPx < 600 && compactRoomLabelIds.has(label.entityId))
              return null;
            return (
              <g
                key={`${label.entityId}-${index}`}
                data-testid="cad-review-text"
                data-entity-id={label.entityId}
                transform={`translate(${label.origin.x} ${label.origin.y}) rotate(${label.rotation})`}
                fill={label.color}
                stroke="none"
                fontFamily={label.fontFamily}
                fontSize={label.fontSize}
                fontWeight={label.bold ? "bold" : undefined}
                fontStyle={label.italic ? "italic" : undefined}
                textDecoration={label.underline ? "underline" : undefined}
              >
                {label.lines.map((line, lineIndex) => (
                  <text
                    key={lineIndex}
                    x={line.x}
                    // La maqueta expresa la línea desde la caja superior; SVG
                    // coloca el glifo por su línea base, dentro de esa caja.
                    y={line.y + label.fontSize}
                    xmlSpace="preserve"
                    textLength={line.justify ? line.width : undefined}
                    lengthAdjust={line.justify ? "spacing" : undefined}
                  >
                    {line.text}
                  </text>
                ))}
              </g>
            );
          })}
        </g>
      </svg>

      {areaPlacements.map(({ area, compact, x, y }) => (
        <div
          key={area.id}
          data-testid="cad-review-room-area"
          data-room-id={area.id}
          data-compact={compact ? "true" : "false"}
          role="note"
          className={`pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-control border border-border bg-surface/90 text-center text-foreground shadow-resting ${
            compact ? "max-w-20 px-1 py-0.5" : "max-w-48 px-2 py-1"
          }`}
          style={{ left: x, top: y }}
          aria-label={`${area.name ?? `Local ${area.id}`}: área entre ejes de muros ${area.axisArea}${area.clearArea ? `; área útil ${area.clearArea}` : ""}`}
        >
          {compact || !area.nameFromDocument ? <div className="type-micro font-semibold break-words">{area.name ?? `Local ${area.id}`}</div> : null}
          <div className="type-micro">{compact ? area.axisArea : `A ejes · ${area.axisArea}`}</div>
          {!compact && area.clearArea ? <div className="type-micro">Útil · {area.clearArea}</div> : null}
        </div>
      ))}

      {placements.map((placement) => (
        <button
          key={placement.id}
          type="button"
          data-testid={`cad-review-pin-${placement.id}`}
          data-offscreen={placement.offscreen ? "true" : "false"}
          onPointerDown={(event) => {
            if (event.pointerType !== "touch") event.stopPropagation();
          }}
          onPointerUp={(event) => {
            if (event.pointerType !== "touch") event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(activeId === placement.id ? null : placement.id);
          }}
          style={{ transform: `translate3d(${placement.x}px, ${placement.y}px, 0)` }}
          className={`absolute left-0 top-0 z-20 -ml-3 -mt-3 flex h-6 w-6 items-center justify-center rounded-full border type-micro font-bold shadow-lg ${
            placement.resolved
              ? "border-emerald-200/60 bg-success/15 text-success-ink"
              : "border-amber-200/70 bg-amber-400 text-gray-950"
          } ${placement.offscreen ? "opacity-70 ring-2 ring-ring" : ""} ${
            activeId === placement.id ? "ring-2 ring-indigo-300" : ""
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
          className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-danger/30 bg-surface/80 px-3 py-1 type-micro text-rose-100"
        >
          Este plano es demasiado grande para la vista de revisión y se muestra
          incompleto. Pide al autor un PDF o una vista más acotada.
        </p>
      ) : null}
    </div>
  );
}

function pinchFromPointers(
  points: Map<number, { x: number; y: number }>,
): ReviewPinch | null {
  const pair = [...points.values()].slice(0, 2);
  if (pair.length !== 2) return null;
  return {
    x: (pair[0].x + pair[1].x) / 2,
    y: (pair[0].y + pair[1].y) / 2,
    distance: Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y),
  };
}
