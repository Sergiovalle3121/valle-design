"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "../docs/PublicPageShell";
import { COMMERCIAL_LINKS } from "@/config/commercial";
import { checkoutPath, type PlanSelection } from "@/lib/commercial/checkout";
import {
  planView,
  type PlanPeriod,
  type PlanView,
} from "@/lib/commercial/pricing";
import {
  CATALOG_CURRENCY,
  catalogFailureMessage,
  classifyCatalogFailure,
  fetchPublicCatalog,
  type CatalogState,
} from "@/lib/commercial/public-catalog";

/**
 * Catálogo real, sin red de seguridad de precios inventados.
 *
 * Cuando la lectura falla, esta pantalla se queda SIN importes a propósito.
 * Un precio "de ejemplo" en una página pública no es un placeholder: es una
 * oferta, y alguien vendrá a reclamarla.
 */
export function PricingCatalog() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  const [period, setPeriod] = useState<PlanPeriod>("monthly");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const catalog = await fetchPublicCatalog({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setState({ status: "ready", catalog });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "unavailable",
          failure: classifyCatalogFailure(error),
        });
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  };

  return (
    <PublicPageShell
      eyebrow="Planes"
      title="Precios"
      intro="Los importes de esta página los publica el propio producto: salen del catálogo comercial vigente, no de una tabla escrita a mano. Si el servicio no responde, esta página lo dice en vez de enseñarte una cifra que quizá ya no exista."
    >
      {state.status === "loading" && (
        <p role="status" data-testid="pricing-loading">
          Leyendo el catálogo de planes…
        </p>
      )}

      {state.status === "unavailable" && (
        <PublicSection title="No podemos mostrar los precios ahora">
          <p role="alert" data-testid="pricing-error">
            {catalogFailureMessage(state.failure)}
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={retry} className={publicActionClass}>
              Reintentar
            </button>
            <a className={publicActionClass} href={COMMERCIAL_LINKS.sales}>
              Preguntar al equipo comercial
            </a>
          </div>
        </PublicSection>
      )}

      {state.status === "ready" && state.catalog.items.length === 0 && (
        <PublicSection title="Todavía no hay planes publicados">
          <p role="status" data-testid="pricing-empty">
            Este despliegue no tiene ningún plan marcado como publicable. No
            inventamos uno: escríbenos y te contamos las condiciones vigentes.
          </p>
          <a className={publicActionClass} href={COMMERCIAL_LINKS.sales}>
            Hablar con el equipo comercial
          </a>
        </PublicSection>
      )}

      {state.status === "ready" && state.catalog.items.length > 0 && (
        <>
          {state.catalog.checkout === "external" && (
            <p
              role="status"
              data-testid="checkout-external-note"
              className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-5 py-4 text-sm text-amber-800 dark:text-amber-200"
            >
              La compra en línea todavía no está habilitada en este despliegue:
              no hay pasarela de pago configurada. Los precios de abajo son los
              reales y vigentes; la contratación se cierra con el equipo
              comercial, que te confirmará alta y facturación.
            </p>
          )}

          <PeriodSwitch period={period} onChange={setPeriod} />

          <div className="grid gap-5 sm:grid-cols-2">
            {state.catalog.items.map((plan) => (
              <PlanCard
                key={plan.code}
                view={planView(state.catalog, plan, CATALOG_CURRENCY)}
                period={period}
                currency={CATALOG_CURRENCY}
              />
            ))}
          </div>

          <PublicSection title="Lo que incluye cualquier plan">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Editor CAD 2D en el navegador: capas, geometría, acotación y
                bloques.
              </li>
              <li>
                Importación y exportación DXF con informe de lo que se pierde en
                la conversión. Valle Design no lee ni escribe DWG.
              </li>
              <li>
                Proyectos y documentos por organización, con permisos por rol.
              </li>
            </ul>
            <p>
              Los importes se publican en pesos mexicanos. Cancelas cuando
              quieras desde tu portal de facturación y conservas el acceso hasta
              el final del periodo pagado.
            </p>
          </PublicSection>
        </>
      )}
    </PublicPageShell>
  );
}

function PeriodSwitch({
  period,
  onChange,
}: {
  period: PlanPeriod;
  onChange: (value: PlanPeriod) => void;
}) {
  const options: ReadonlyArray<[PlanPeriod, string]> = [
    ["monthly", "Mensual"],
    ["yearly", "Anual"],
  ];
  return (
    <div
      role="group"
      aria-label="Periodicidad del pago"
      className="inline-flex rounded-xl border border-black/10 p-1 dark:border-white/15"
    >
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={period === value}
          onClick={() => onChange(value)}
          className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${
            period === value
              ? "bg-indigo-600 text-white"
              : "text-gray-600 dark:text-gray-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Tarjeta de un plan. El botón de compra SÓLO existe si `purchasable` lo
 * permite —es decir, si el despliegue tiene pasarela y el plan tiene precio—;
 * en cualquier otro caso se enseña el camino que sí funciona.
 */
function PlanCard({
  view,
  period,
  currency,
}: {
  view: PlanView;
  period: PlanPeriod;
  currency: string;
}) {
  const shown = view.periods.find((entry) => entry.period === period);
  const selection: PlanSelection = {
    planCode: view.code,
    currency,
    period,
  };
  return (
    <article
      data-testid="plan-card"
      className="rounded-2xl border border-black/10 p-6 dark:border-white/10"
    >
      <h2 className="text-xl font-semibold">{view.name}</h2>

      {shown ? (
        <>
          <p className="mt-4">
            <span className="text-3xl font-bold">{shown.amount}</span>{" "}
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {shown.unit}
            </span>
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {view.taxNote}
          </p>
          {view.seatsNote && (
            <p className="mt-1 text-sm font-medium" data-testid="plan-seats">
              {view.seatsNote}
              {shown.minimumCharge
                ? ` · desde ${shown.minimumCharge} ${
                    period === "yearly" ? "al año" : "al mes"
                  }`
                : ""}
            </p>
          )}
          {period === "yearly" && view.saving && view.savingAmount && (
            <p
              className="mt-3 inline-block rounded-lg bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-800 dark:text-emerald-200"
              data-testid="plan-saving"
            >
              Ahorras {view.savingAmount} al año ({view.saving.percent} %)
              frente a pagar mes a mes
            </p>
          )}
        </>
      ) : view.kind === "trial" ? (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Sin coste. Empieza a dibujar y decide después.
        </p>
      ) : (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Este plan no tiene precio publicado para esa periodicidad.
        </p>
      )}

      <div className="mt-6">
        {view.purchasable && shown ? (
          <Link
            data-testid="plan-checkout-cta"
            href={checkoutPath(selection)}
            className={publicActionClass}
          >
            Contratar {view.name}
          </Link>
        ) : view.kind === "trial" ? (
          <Link href="/register" className={publicActionClass}>
            Empezar la prueba
          </Link>
        ) : (
          <a
            data-testid="plan-sales-cta"
            href={COMMERCIAL_LINKS.sales}
            className={publicActionClass}
          >
            Contratar con el equipo comercial
          </a>
        )}
      </div>
    </article>
  );
}
