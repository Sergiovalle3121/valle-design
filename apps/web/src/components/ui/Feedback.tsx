"use client";

import type { ReactNode } from "react";
import { cx, motionBase } from "./styles";

/* ── BADGE ──────────────────────────────────────────────────────────────── */

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-primary/10 text-primary-ink border-primary/25",
  success: "bg-success/10 text-success-ink border-success/25",
  warning: "bg-warning/10 text-warning-ink border-warning/30",
  danger: "bg-danger/10 text-danger-ink border-danger/25",
};

export interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  /** Punto de color a la izquierda: útil para estado (en línea / caído / …). */
  dot?: boolean;
}

/**
 * Etiqueta de estado.
 *
 * Fondo tintado al 10% en vez de relleno sólido: un badge sólido pesa lo mismo
 * que un botón y el ojo lo lee como algo que se pulsa.
 *
 * El texto va a la TINTA del estado (`-ink`), no al tono del relleno. Medido
 * sobre tarjeta blanca: el verde de relleno como letra da 3,02:1 y el ámbar
 * 2,13:1 — por debajo del 4,5 que exige AA. Reutilizar el color del relleno
 * como color de letra «porque es el mismo estado» es la forma más común de
 * fallar accesibilidad sin enterarse.
 */
export function Badge({
  tone = "neutral",
  children,
  className,
  dot,
}: BadgeProps) {
  return (
    <span
      className={cx(
        "type-caption inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium",
        TONES[tone],
        className,
      )}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current"
        />
      ) : null}
      {children}
    </span>
  );
}

/* ── TOOLTIP ────────────────────────────────────────────────────────────── */

export interface TooltipProps {
  label: ReactNode;
  /** Segunda línea, más apagada: el atajo de teclado va aquí. */
  shortcut?: string;
  children: ReactNode;
  side?: "top" | "bottom" | "right" | "left";
  className?: string;
}

const SIDES = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
} as const;

/**
 * Etiqueta emergente, en CSS puro.
 *
 * Sin estado ni efectos: `group-hover` y `group-focus-within` lo resuelven, así
 * que no cuesta un re-render ni un `useEffect` por cada herramienta de la
 * paleta —que son dieciocho—. `group-focus-within` es lo que la hace aparecer
 * también al llegar con el teclado, que es la mitad del propósito de un tooltip
 * que enseña un atajo.
 *
 * `role="tooltip"` + `aria-hidden` en el envoltorio: el texto ya viaja al lector
 * de pantalla por el `aria-label` del control, y anunciarlo dos veces molesta.
 */
export function Tooltip({
  label,
  shortcut,
  children,
  side = "top",
  className,
}: TooltipProps) {
  return (
    <span className={cx("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute z-50 hidden w-max max-w-56 flex-col gap-0.5",
          "rounded-control border border-border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-floating",
          "opacity-0 group-hover/tip:flex group-hover/tip:opacity-100",
          "group-focus-within/tip:flex group-focus-within/tip:opacity-100",
          motionBase,
          SIDES[side],
        )}
      >
        <span className="type-caption font-medium">{label}</span>
        {shortcut ? (
          <span className="type-mono type-micro text-muted-foreground">
            {shortcut}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/* ── SKELETON ───────────────────────────────────────────────────────────── */

export interface SkeletonProps {
  className?: string;
  /** Atajo para bloques de texto: n renglones con el último más corto. */
  lines?: number;
}

/**
 * Hueso de carga.
 *
 * Antes de esto la app tenía CERO: `animate-pulse` y `skeleton` medían 0 usos, y
 * el tablero cargaba mostrando un `<p>` centrado en una pantalla en blanco. Un
 * hueso no es decoración: es la promesa de que ahí va a aparecer algo y con qué
 * forma. Por eso el último renglón es más corto — así se lee como párrafo y no
 * como tabla.
 *
 * `aria-hidden`: para el lector de pantalla el hueso no existe. Quien anuncia
 * la espera es el `aria-busy` de la región que lo contiene.
 */
export function Skeleton({ className, lines }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <div aria-hidden="true" className="flex flex-col gap-2">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton
            key={index}
            className={cx(
              "h-3.5",
              index === lines - 1 ? "w-3/5" : "w-full",
              className,
            )}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cx("animate-pulse rounded-control bg-muted", className)}
    />
  );
}

/* ── PROGRESS BAR ───────────────────────────────────────────────────────── */

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  /** Muestra "3 de 5" a la derecha de la etiqueta. */
  showCount?: boolean;
  className?: string;
  tone?: "brand" | "success";
  /** Se propaga tal cual: NUNCA se renombra un gancho de prueba existente. */
  "data-testid"?: string;
}

/**
 * Barra de progreso ESTILADA.
 *
 * El `<progress>` nativo se pinta con la apariencia del sistema operativo: en
 * Windows es una barra verde chata, en macOS una pastilla azul y en Android
 * otra cosa. Un producto que enseña tres barras distintas según el equipo del
 * cliente no tiene una barra de progreso: tiene tres.
 *
 * Se sustituye el elemento, no la semántica: `role="progressbar"` con
 * `aria-valuenow/min/max` dice exactamente lo mismo a un lector de pantalla.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  showCount = false,
  className,
  tone = "brand",
  ...rest
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.max(0, Math.min(value, safeMax));
  const pct = (clamped / safeMax) * 100;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {label || showCount ? (
        <div className="flex items-baseline justify-between gap-3">
          {label ? (
            <span className="type-caption text-muted-foreground">{label}</span>
          ) : null}
          {showCount ? (
            <span className="type-mono type-caption text-muted-foreground">
              {clamped} de {safeMax}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        {...rest}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cx(
            "h-full rounded-full transition-[width] duration-500 ease-out-expo",
            tone === "success" ? "bg-success" : "bg-brand-strong",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
