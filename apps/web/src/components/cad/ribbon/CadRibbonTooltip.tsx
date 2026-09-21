"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { cx, TooltipContent, tooltipSurfaceClass } from "@/components/ui";
import {
  CAD_RIBBON_TOOLTIP_DELAY_MS,
  CAD_RIBBON_TOOLTIP_GAP,
  cadRibbonFocusIsVisible,
  positionCadRibbonFloating,
} from "./ribbon-floating";

export interface CadRibbonTooltipText {
  /** El rótulo en español («Línea»). */
  title: ReactNode;
  /** El nombre canónico con su alias («LINE (L)»). */
  shortcut?: string;
  /** La descripción del comando. */
  label: ReactNode;
}

/**
 * La tarjeta que se ve: `fixed` (la coloca `positionCadRibbonFloating`),
 * `invisible` hasta que está colocada, sin eventos de puntero (no tapa el
 * lienzo ni roba el clic) y por encima de los desplegables de la cinta
 * (`z-[80]`), que a su vez están por encima del estudio (`cad-shell`,
 * `z-[70]`, también en `<body>`).
 */
export function CadRibbonTooltipCard({
  title,
  shortcut,
  label,
  cardRef,
}: CadRibbonTooltipText & { cardRef?: Ref<HTMLSpanElement> }) {
  return (
    <span
      ref={cardRef}
      role="tooltip"
      aria-hidden="true"
      data-testid="cad-ribbon-tooltip"
      className={cx("pointer-events-none invisible fixed left-0 top-0 z-[90] flex", tooltipSurfaceClass)}
    >
      <TooltipContent title={title} shortcut={shortcut} label={label} />
    </span>
  );
}

/**
 * LA ETIQUETA DE AYUDA DE UN BOTÓN DE LA CINTA, fuera de la cinta.
 *
 * `Tooltip` (components/ui) es CSS puro y cuelga `absolute` de su control:
 * dentro de la tira de paneles (`overflow-x-auto`, que fuerza `overflow-y`)
 * quedaba recortada — de los 65 px de la etiqueta de «Línea» se veían 7, y
 * es el único sitio donde aparece «LINE (L)». Aquí la etiqueta se monta sólo
 * mientras se muestra, en un portal a `<body>`, colocada con `position:
 * fixed` bajo el botón y empujada hacia dentro si se sale de la ventana.
 *
 * Se muestra al detenerse el ratón (`CAD_RIBBON_TOOLTIP_DELAY_MS`) o al
 * llegar con el teclado (`:focus-visible`: el foco que el desplegable pone en
 * su primer comando al abrirse con un clic no la enciende); se esconde al
 * salir, al perder el foco y al pulsar, como la de AutoCAD.
 */
export function CadRibbonTooltip({
  title,
  shortcut,
  label,
  className,
  children,
}: CadRibbonTooltipText & { className?: string; children: ReactNode }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const cardRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const hide = () => {
    cancel();
    setAnchor(null);
  };

  // Un temporizador vivo al desmontar (el desplegable se cierra con el ratón
  // encima de un comando) no debe llamar a `setAnchor` sobre nada.
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!anchor || !card) return;
    positionCadRibbonFloating(card, anchor, window, { align: "center", gap: CAD_RIBBON_TOOLTIP_GAP });
  }, [anchor]);

  return (
    <span
      className={cx("inline-flex", className)}
      data-cad-ribbon-tooltip=""
      onPointerEnter={(event) => {
        // En pantalla táctil no hay «pasar por encima»: la etiqueta se
        // quedaría puesta tras el toque.
        if (event.pointerType === "touch") return;
        const target = event.currentTarget;
        cancel();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setAnchor(target);
        }, CAD_RIBBON_TOOLTIP_DELAY_MS);
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(event) => {
        if (!cadRibbonFocusIsVisible(event.target)) return;
        cancel();
        setAnchor(event.currentTarget);
      }}
      onBlur={hide}
    >
      {children}
      {anchor
        ? createPortal(
            <CadRibbonTooltipCard cardRef={cardRef} title={title} shortcut={shortcut} label={label} />,
            document.body,
          )
        : null}
    </span>
  );
}
