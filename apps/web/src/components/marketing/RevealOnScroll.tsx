"use client";

/**
 * LA primitiva de aparición por scroll — una, del sistema, y ninguna más.
 *
 * La regla de la campaña de sitio es que el movimiento comunica jerarquía o
 * no existe: este componente hace exactamente una cosa (la sección entra con
 * una traslación corta y un fundido cuando cruza el viewport) con los tokens
 * de motion de la casa, y todas las públicas usan ESTA en vez de inventar
 * variantes. El CSS vive en globals (`.reveal-on-scroll`), así que:
 *
 * - `prefers-reduced-motion` lo neutraliza desde la regla global (aparece
 *   colocado, sin traslación);
 * - solo anima transform/opacity — jamás layout (regla 0.4, medida);
 * - sin JavaScript (o antes de hidratar) el contenido es VISIBLE: la clase
 *   de ocultación la pone el observador al montar, no el servidor. Un lector
 *   sin JS nunca hereda una página invisible.
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

export function RevealOnScroll({
  children,
  className,
  /** Retraso escalonado en ms para retículas de tarjetas (múltiplos cortos). */
  delayMs = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"ssr" | "hidden" | "shown">("ssr");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Sin IntersectionObserver no hay nada que hacer: el estado inicial
    // («ssr») ya pinta visible — no se necesita ningún setState.
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // La PRIMERA llamada del observador decide: lo que ya está en el
        // viewport se queda visible (nunca parpadea a oculto); lo que está
        // por debajo pasa a pendiente y se revela al llegar. Todo el estado
        // se decide aquí — nada de setState síncrono en el efecto.
        if (entry.isIntersecting) {
          setState("shown");
          observer.disconnect();
        } else {
          setState((current) => (current === "ssr" ? "hidden" : current));
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.RefObject<never>}
      className={cx("reveal-on-scroll", state === "hidden" && "reveal-pending", className)}
      style={delayMs ? ({ transitionDelay: `${delayMs}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
