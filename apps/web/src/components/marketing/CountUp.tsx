"use client";

/**
 * Conteo al entrar al viewport, para las cifras de evidencia.
 *
 * El movimiento aquí COMUNICA: el número creciendo dice «esto se midió, no se
 * escribió». Reglas: el valor final llega SIEMPRE (el conteo es un adorno del
 * camino, no del dato); `prefers-reduced-motion` muestra el final directo; el
 * servidor ya manda el número completo, así que sin JavaScript la cifra está
 * ahí — el observador solo la re-anima al entrar.
 */
import { useEffect, useRef, useState } from "react";
import { formatRegionNumber } from "@/lib/cad/region";
import { getClientRegion } from "@/lib/cad/region/client";

const DURATION_MS = 1100;

export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION_MS);
          // ease-out cúbico: el final se posa, no frena en seco.
          const eased = 1 - (1 - t) ** 3;
          setShown(Math.round(value * eased));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        setShown(0);
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {formatRegionNumber(shown, getClientRegion())}
    </span>
  );
}
