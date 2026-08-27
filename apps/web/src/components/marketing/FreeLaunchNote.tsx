"use client";

import { useEffect, useState } from "react";
import {
  FREE_LAUNCH_PROMISE,
  LAUNCH_MODE,
  freeOfferHeadline,
} from "@/config/launch";
import { fetchPublicCatalog } from "@/lib/commercial/public-catalog";

/**
 * LA PROMESA DEL LANZAMIENTO, ahí donde se decide.
 *
 * Aparece en el alta y en la portada, y su único trabajo es responder las dos
 * preguntas que hace quien está a punto de teclear su correo: «¿cuánto dura
 * esto gratis?» y «¿me van a pedir la tarjeta?».
 *
 * ─── Por qué pide el número a la API en vez de escribirlo ──────────────────
 *
 * Porque un «3 meses» escrito en el JSX es una promesa que el backend puede
 * dejar de cumplir sin que nada se ponga rojo. El número sale de `trialDays`,
 * que el catálogo público publica leyendo `TRIAL_DAYS`.
 *
 * ─── Por qué no bloquea NADA ───────────────────────────────────────────────
 *
 * Si la lectura falla, este componente no pinta nada y se calla. Es una nota
 * de marketing colgando de una llamada de red: que un catálogo caído impidiera
 * a alguien registrarse sería cambiar una promesa por un embudo roto. Por eso
 * no tiene estado de error, ni reintento, ni esqueleto — sólo aparece cuando
 * puede decir la verdad.
 */
export function FreeLaunchNote({ className }: { className?: string }) {
  const [trialDays, setTrialDays] = useState<number | null>(null);

  useEffect(() => {
    if (LAUNCH_MODE !== "free") return;
    const controller = new AbortController();
    void (async () => {
      try {
        const catalog = await fetchPublicCatalog({ signal: controller.signal });
        if (!controller.signal.aborted) setTrialDays(catalog.trialDays);
      } catch {
        // Silencio deliberado: ver la cabecera.
      }
    })();
    return () => controller.abort();
  }, []);

  if (LAUNCH_MODE !== "free" || trialDays === null) return null;
  const headline = freeOfferHeadline(trialDays);
  if (!headline) return null;

  return (
    <p
      role="status"
      data-testid="free-launch-note"
      className={
        className ??
        "rounded-card border border-brand-strong/40 bg-brand-strong/5 px-4 py-3 type-small text-foreground"
      }
    >
      <span className="font-semibold">{headline}.</span> {FREE_LAUNCH_PROMISE}
    </p>
  );
}
