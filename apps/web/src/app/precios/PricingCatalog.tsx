"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, FileText, Receipt, ShieldCheck } from "lucide-react";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "../docs/PublicPageShell";
import { Badge, buttonClass, cx, Surface } from "@/components/ui";
import { COMMERCIAL_LINKS } from "@/config/commercial";
import {
  FREE_LAUNCH_PROMISE,
  LAUNCH_MODE,
  checkoutIsVisible,
  freeOfferHeadline,
} from "@/config/launch";
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
 * Lo que trae CUALQUIER plan. No es una lista de marketing: cada punto
 * corresponde a algo implementado, y lo dice explícitamente en la parte que
 * suele omitirse —el DWG que NO se lee—.
 */
const INCLUDED = [
  "Editor CAD 2D en el navegador: capas, geometría, acotación y bloques",
  "Espacio papel con varias ventanas y su escala, e impresión a PDF",
  "Importación y exportación DXF con informe de lo que se pierde",
  "Valle Design no lee ni escribe DWG — se dice aquí, no en la letra pequeña",
  "Proyectos y documentos por organización, con permisos por rol",
  "Enlaces de revisión con caducidad y comentarios anclados a la geometría",
] as const;

/**
 * EL SELLO FISCAL — diferenciación real en México, no un adorno.
 *
 * Un despacho mexicano que contrata software extranjero paga en dólares, recibe
 * un recibo que su contador no puede deducir y descubre el IVA al final. Que el
 * importe salga en pesos con IVA dentro y con CFDI es, para ese comprador, una
 * ventaja concreta — y estaba enterrada en una nota de una línea bajo el precio.
 *
 * Lo que se afirma aquí sale del catálogo (`taxNote` lo publica el producto) y
 * de la superficie fiscal que ya existe en `/cuenta/facturacion`: no hay ni una
 * promesa nueva, sólo se pone donde se ve.
 */
function FiscalSeal() {
  const items = [
    { Icon: Receipt, label: "IVA incluido" },
    { Icon: FileText, label: "Factura CFDI" },
    { Icon: ShieldCheck, label: "Cancelas cuando quieras" },
  ] as const;
  return (
    <ul
      data-testid="fiscal-seal"
      className="flex flex-wrap items-center gap-x-5 gap-y-2"
    >
      {items.map(({ Icon, label }) => (
        <li
          key={label}
          className="type-small inline-flex items-center gap-2 text-muted-foreground"
        >
          <Icon aria-hidden="true" className="h-4 w-4 text-success-ink" />
          {label}
        </li>
      ))}
    </ul>
  );
}

/**
 * LA OFERTA DE FUNDADORES — la cabecera del lanzamiento.
 *
 * Dice tres cosas y ninguna es un adorno:
 *
 * 1. **Cuánto dura**, con el número que concede el backend. `trialDays` viene
 *    del catálogo público, que lo lee de `TRIAL_DAYS`. Si el operador arranca
 *    con otro valor, este titular cambia solo. Aquí no hay un «90» escrito.
 * 2. **Que no hay tarjeta**, porque es la primera pregunta de quien ha sido
 *    quemado por una prueba gratuita antes.
 * 3. **Qué pasa después**, que es la pregunta que casi nadie responde. El
 *    precio futuro NO se escribe aquí: está en las tarjetas de abajo, que
 *    salen del catálogo real. Esta sección enlaza a ellas.
 *
 * Y la promesa que sostiene todo lo demás: al terminar, los planos siguen
 * siendo del usuario. Eso no es copy — es la regla de oro del guard, probada
 * en `entitlement-read-only.pg.spec.ts`.
 */
function FoundersOffer({ trialDays }: { trialDays: number }) {
  if (LAUNCH_MODE !== "free") return null;
  const headline = freeOfferHeadline(trialDays);
  if (!headline) return null;
  return (
    <Surface
      as="section"
      elevation="elevated"
      data-testid="founders-offer"
      className="border-brand-strong ring-1 ring-brand-strong"
    >
      <Badge tone="brand">Oferta de fundadores</Badge>
      <h2 className="type-title mt-4" data-testid="founders-headline">
        {headline}, sin tarjeta
      </h2>
      <p className="type-lead mt-3 text-muted-foreground">
        {FREE_LAUNCH_PROMISE}
      </p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          `Acceso completo al editor durante ${freeOfferHeadline(trialDays).replace(" gratis", "")}`,
          "No pedimos ni guardamos ningún medio de pago para empezar",
          "Tus documentos se exportan a DXF y se imprimen a PDF desde el primer día",
          "Cuando termine, seguirás pudiendo abrirlos y exportarlos",
        ].map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <Check
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-success-ink"
            />
            <span className="type-small text-foreground">{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/register"
          data-testid="founders-cta"
          className={buttonClass({ variant: "primary", size: "lg" })}
        >
          Empezar gratis
        </Link>
      </div>
      <p className="type-caption mt-5 text-muted-foreground">
        Los importes de abajo son los que el producto cobrará cuando termine el
        lanzamiento; hoy no se cobra ninguno. Quien entre ahora conserva la
        tarifa de fundador al activar un plan.
      </p>
    </Surface>
  );
}

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

      {state.status === "ready" && (
        <FoundersOffer trialDays={state.catalog.trialDays} />
      )}

      {state.status === "ready" && state.catalog.items.length > 0 && (
        <>
          {state.catalog.checkout === "external" && checkoutIsVisible() && (
            <p
              role="status"
              data-testid="checkout-external-note"
              className="rounded-card border border-warning/40 bg-warning/10 px-5 py-4 type-small text-warning-ink"
            >
              La compra en línea todavía no está habilitada en este despliegue:
              no hay pasarela de pago configurada. Los precios de abajo son los
              reales y vigentes; la contratación se cierra con el equipo
              comercial, que te confirmará alta y facturación.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <PeriodSwitch period={period} onChange={setPeriod} />
            <FiscalSeal />
          </div>

          {/*
            `sm:grid-cols-2` a secas repartía los planes por igual y ninguno
            destacaba: el visitante tenía que comparar dos tarjetas idénticas y
            decidir solo. `items-start` es lo que deja al plan recomendado
            sobresalir hacia arriba sin estirar al de al lado.
          */}
          <div className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {state.catalog.items.map((plan, index) => (
              <PlanCard
                key={plan.code}
                view={planView(
                  state.catalog,
                  plan,
                  CATALOG_CURRENCY,
                  LAUNCH_MODE,
                )}
                period={period}
                currency={CATALOG_CURRENCY}
                // El destacado es el PRIMER plan de pago del catálogo, en el
                // orden que publica el operador. No se inventa un «más
                // vendido» —no hay ese dato—: la etiqueta dice de quién es la
                // recomendación, que es una afirmación que sí podemos sostener.
                recommended={
                  plan.kind === "paid" &&
                  state.catalog.items.findIndex((item) => item.kind === "paid") ===
                    index
                }
              />
            ))}
          </div>

          <PublicSection title="Lo que incluye cualquier plan">
            <p>
              No hay funciones del editor reservadas al plan caro: lo que cambia
              entre planes es cuánta gente entra y cuánto se paga, no qué se
              puede dibujar.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-success-ink"
                  />
                  <span className="type-small text-foreground">{item}</span>
                </li>
              ))}
            </ul>
            <p>
              Cancelas cuando quieras desde tu portal de facturación y conservas
              el acceso hasta el final del periodo pagado.
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
      className="inline-flex rounded-control border border-border bg-card p-1"
    >
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={period === value}
          onClick={() => onChange(value)}
          className={cx(
            "min-h-11 rounded-control px-5 type-small font-semibold transition-colors duration-200 ease-out-expo",
            period === value
              ? "bg-brand-strong text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
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
  recommended = false,
}: {
  view: PlanView;
  period: PlanPeriod;
  currency: string;
  recommended?: boolean;
}) {
  const shown = view.periods.find((entry) => entry.period === period);
  const selection: PlanSelection = {
    planCode: view.code,
    currency,
    period,
  };
  return (
    <Surface
      as="article"
      data-testid="plan-card"
      data-recommended={recommended ? "true" : undefined}
      elevation={recommended ? "elevated" : "resting"}
      className={cx(
        "relative flex h-full flex-col",
        // El destacado se marca con BORDE y elevación, no con un fondo de
        // color: teñir la tarjeta entera la saca del sistema y obliga a
        // recalcular el contraste de todo lo que lleva dentro.
        recommended && "border-brand-strong ring-1 ring-brand-strong",
      )}
    >
      {recommended ? (
        // El envoltorio OPACO es lo que impide que el borde de la tarjeta
        // atraviese la etiqueta: el badge lleva fondo tintado al 10 % y, sin
        // algo sólido debajo, la línea del borde se ve por detrás del texto y
        // parece un tachado.
        <span className="absolute -top-3 left-6 rounded-full bg-card px-1">
          <Badge tone="brand">Nuestra recomendación</Badge>
        </span>
      ) : null}

      <h2 className="type-heading">{view.name}</h2>

      {shown ? (
        <>
          {/* `type-numeric` da cifras de ancho fijo: al conmutar mensual/anual
              el importe cambia de dígitos y sin `tnum` la tarjeta entera daba
              un salto lateral. */}
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
            <span
              className="type-numeric text-4xl font-bold tracking-title text-foreground"
              data-testid="plan-amount"
            >
              {shown.amount}
            </span>
            <span className="type-small text-muted-foreground">
              {shown.unit}
            </span>
          </p>
          <p className="mt-1 type-small text-muted-foreground">
            {view.taxNote}
          </p>
          {!checkoutIsVisible() && (
            <p
              className="mt-2 type-small font-medium text-primary-ink"
              data-testid="plan-future-price"
            >
              Precio anunciado para cuando termine el lanzamiento. Hoy no se
              cobra.
            </p>
          )}
          {view.seatsNote && (
            <p className="mt-1 type-small font-medium" data-testid="plan-seats">
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
              className="mt-3 inline-block rounded-control bg-success/10 px-3 py-1 type-small font-semibold text-success-ink"
              data-testid="plan-saving"
            >
              Ahorras {view.savingAmount} al año ({view.saving.percent} %)
              frente a pagar mes a mes
            </p>
          )}
        </>
      ) : view.kind === "trial" ? (
        <p className="mt-4 type-small text-muted-foreground">
          Sin coste. Empieza a dibujar y decide después.
        </p>
      ) : (
        <p className="mt-4 type-small text-muted-foreground">
          Este plan no tiene precio publicado para esa periodicidad.
        </p>
      )}

      {/* `mt-auto` empuja la acción al pie: en una fila de tarjetas de alturas
          distintas, los botones quedan alineados y el ojo los compara. */}
      <div className="mt-auto pt-6">
        {view.purchasable && shown ? (
          <Link
            data-testid="plan-checkout-cta"
            href={checkoutPath(selection)}
            className={buttonClass({
              variant: recommended ? "primary" : "secondary",
              fullWidth: true,
            })}
          >
            Contratar {view.name}
          </Link>
        ) : view.kind === "trial" ? (
          <Link
            href="/register"
            className={buttonClass({
              variant: recommended ? "primary" : "secondary",
              fullWidth: true,
            })}
          >
            Empezar la prueba
          </Link>
        ) : checkoutIsVisible() ? (
          <a
            data-testid="plan-sales-cta"
            href={COMMERCIAL_LINKS.sales}
            className={cx(publicActionClass, "w-full")}
          >
            Contratar con el equipo comercial
          </a>
        ) : (
          // MODO LANZAMIENTO GRATUITO. Un botón «Contratar» aquí sería una
          // mentira en los dos sentidos: hoy no se cobra, y quien lo pulsara
          // acabaría en un camino que el despliegue no puede completar. El
          // importe se sigue publicando —es el precio real de después, y
          // decirlo por adelantado es lo honesto— pero la acción que se ofrece
          // es la única que funciona hoy.
          <Link
            href="/register"
            data-testid="plan-free-launch-cta"
            className={buttonClass({
              variant: recommended ? "primary" : "secondary",
              fullWidth: true,
            })}
          >
            Empezar gratis
          </Link>
        )}
      </div>
    </Surface>
  );
}
