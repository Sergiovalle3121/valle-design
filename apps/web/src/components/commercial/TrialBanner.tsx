"use client";

import Link from "next/link";
import { AlertTriangle, Clock, Download } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { PRICING_PATH } from "@/config/site-routes";
import {
  trialNotice,
  trialStatus,
  type Subscription,
} from "@/lib/commercial/trial-phase";

/**
 * EL AVISO DIGNO — lo contrario de una pantalla muerta.
 *
 * Tres reglas, y cada una responde a una forma concreta de perder un usuario:
 *
 * 1. **Aparece con tiempo.** Desde catorce días antes, no el día del
 *    vencimiento. Quien se entera el mismo día no decide: reacciona.
 * 2. **Dice qué SIGUE funcionando.** Un banner que sólo enumera lo que se
 *    pierde convierte un recordatorio en una amenaza. Al vencer, este dice —y
 *    es verdad, y está probado— que los documentos siguen abriéndose y
 *    exportándose.
 * 3. **No bloquea nada.** Durante el aviso se sigue editando; vencido, el
 *    banner explica el modo de solo lectura pero la aplicación NO se convierte
 *    en un muro: el usuario entra, ve sus planos y se los lleva.
 *
 * El componente no llama a la red ni decide vigencia: recibe la suscripción y
 * la fase la calcula `trial-phase.ts`, que es puro y está probado en sus
 * fronteras exactas.
 */
export function TrialBanner({
  subscription,
  now,
  className,
}: {
  subscription: Subscription | null | undefined;
  now?: Date;
  className?: string;
}) {
  const status = trialStatus(subscription, now);
  const notice = trialNotice(status);
  if (!notice) return null;

  const expired = status.phase === "expired";
  const Icon = expired ? AlertTriangle : Clock;

  return (
    <section
      role="status"
      data-testid={expired ? "trial-expired-banner" : "trial-ending-banner"}
      data-trial-phase={status.phase}
      className={cx(
        "rounded-card border px-5 py-4",
        expired
          ? "border-warning/40 bg-warning/10"
          : "border-brand-strong/40 bg-brand-strong/5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden="true"
          className={cx(
            "mt-0.5 h-5 w-5 shrink-0",
            expired ? "text-warning-ink" : "text-primary-ink",
          )}
        />
        <div className="min-w-0">
          <p className="type-small text-foreground">{notice}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={PRICING_PATH}
              data-testid="trial-banner-plans"
              className={buttonClass({ variant: "secondary" })}
            >
              Ver planes
            </Link>
            {expired && (
              // El enlace a la propia lista de documentos parece redundante y
              // no lo es: es la prueba, a la vista, de que sus planos siguen
              // ahí. Quien lee «tu prueba terminó» necesita ver el camino a su
              // trabajo en la misma frase, no deducir que existe.
              <Link
                href="/dashboard"
                data-testid="trial-banner-documents"
                className={buttonClass({ variant: "ghost" })}
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Abrir y exportar mis planos
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
