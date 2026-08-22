"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { cx, focusRing, motionBase } from "./styles";

export interface TabItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Contador a la derecha de la etiqueta (documentos, avisos, capas…). */
  count?: number;
  disabled?: boolean;
  "data-testid"?: string;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Etiqueta de la lista para el lector de pantalla. */
  label: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * PESTAÑAS con el patrón de teclado que exige WAI-ARIA.
 *
 * La parte que casi nadie implementa y es justo la que importa: dentro de una
 * lista de pestañas, las FLECHAS cambian de pestaña e Inicio/Fin saltan a los
 * extremos; el Tab NO recorre pestaña por pestaña, sale de la lista al
 * contenido. Por eso sólo la pestaña activa tiene `tabIndex=0` y el resto -1
 * (patrón de "tab stop" único): con `tabIndex=0` en las cinco, alguien con
 * teclado tiene que pulsar Tab cinco veces para pasar de largo.
 */
export function Tabs({
  items,
  value,
  onChange,
  label,
  className,
  size = "md",
}: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const move = useCallback(
    (delta: number | "first" | "last") => {
      const enabled = items.filter((item) => !item.disabled);
      if (enabled.length === 0) return;
      let next: TabItem;
      if (delta === "first") next = enabled[0];
      else if (delta === "last") next = enabled[enabled.length - 1];
      else {
        const current = enabled.findIndex((item) => item.id === value);
        const index = (current + delta + enabled.length) % enabled.length;
        next = enabled[index];
      }
      onChange(next.id);
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)
        ?.focus();
    },
    [items, onChange, value],
  );

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cx(
        "flex items-center gap-1 overflow-x-auto border-b border-border",
        className,
      )}
      onKeyDown={(event) => {
        const map: Record<string, number | "first" | "last"> = {
          ArrowRight: 1,
          ArrowLeft: -1,
          Home: "first",
          End: "last",
        };
        const action = map[event.key];
        if (action === undefined) return;
        event.preventDefault();
        move(action);
      }}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-tab-id={item.id}
            data-testid={item["data-testid"]}
            aria-selected={active}
            aria-controls={`panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cx(
              "inline-flex shrink-0 items-center gap-2 border-b-2 -mb-px",
              size === "sm" ? "type-caption px-2.5 py-2" : "type-small px-3.5 py-2.5",
              "font-medium",
              motionBase,
              focusRing,
              "disabled:pointer-events-none disabled:opacity-40",
              active
                ? "border-brand-strong text-foreground dark:border-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={cx(
                  "type-mono type-micro rounded-full px-1.5 py-px",
                  active ? "bg-primary/15 text-primary-ink" : "bg-muted",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
  className,
}: {
  id: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div id={`panel-${id}`} role="tabpanel" tabIndex={0} className={cx(focusRing, className)}>
      {children}
    </div>
  );
}
