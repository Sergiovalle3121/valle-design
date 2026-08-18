"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "../../docs/PublicPageShell";
import { COMMERCIAL_LINKS } from "@/config/commercial";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { designClient } from "@/lib/cad/repositories/client";
import {
  authPathForCheckout,
  availablePaymentMethods,
  canOpenCheckout,
  checkoutProblem,
  parsePlanSelection,
  rememberCheckout,
  BILLING_PATH,
  PRICING_PATH,
  type CheckoutProblem,
  type PaymentMethod,
} from "@/lib/commercial/checkout";
import { TaxProfileForm } from "../../cuenta/facturacion/TaxProfileForm";

type StarterState =
  /** Eligiendo medio de pago: la compra NO arranca sola. */
  | { status: "choosing" }
  | { status: "opening" }
  | { status: "redirecting"; url: string }
  /** Faltan datos fiscales: se piden AQUÍ, antes de mandar a nadie a pagar. */
  | { status: "fiscal" }
  | { status: "problem"; problem: CheckoutProblem };

/**
 * Abre la compra del plan que viene en la URL.
 *
 * El importe NO viaja desde aquí: se manda `planCode`, `currency` y `period`, y
 * el servidor busca el precio en `plan_prices`. Un cliente que manipule la URL
 * no puede comprar más barato — como mucho, pedir un plan que no existe y
 * recibir un error tipado.
 */
export function CheckoutStarter() {
  const auth = useDesignAuth();
  const params = useSearchParams();
  // Se memoriza sobre los TRES valores crudos: `parsePlanSelection` devuelve un
  // objeto nuevo en cada render y, sin esto, el efecto que abre la compra
  // volvería a dispararse en cada uno.
  const plan = params.get("plan");
  const periodo = params.get("periodo");
  const moneda = params.get("moneda");
  const selection = useMemo(() => {
    const values: Record<string, string | null> = { plan, periodo, moneda };
    return parsePlanSelection((key) => values[key] ?? null);
  }, [plan, periodo, moneda]);
  const [state, setState] = useState<StarterState>({ status: "choosing" });
  const [method, setMethod] = useState<PaymentMethod>("card");
  const opening = useRef(false);

  const ready =
    !!selection &&
    !auth.isLoading &&
    auth.isAuthenticated &&
    !!auth.organizationId &&
    canOpenCheckout(auth.role);

  const methods = selection
    ? availablePaymentMethods(selection.currency)
    : [];

  /**
   * La compra ya NO arranca sola al montar.
   *
   * Antes bastaba llegar a esta URL para que el producto abriera un cobro. Con
   * OXXO y SPEI eso deja de ser aceptable: el medio de pago decide si el
   * cliente sale con una tarjeta cobrada o con una ficha de efectivo que cubre
   * un solo periodo, y esa diferencia tiene que elegirla él, no la URL.
   */
  const openCheckout = async () => {
    if (!ready || !selection || opening.current) return;
    // Una sola apertura en vuelo: cada llamada crea (o reutiliza) un intent
    // auditable, y disparar dos llenaría la auditoría de ruido.
    opening.current = true;
    setState({ status: "opening" });
    try {
      const session = await designClient.commercial.createCheckoutSession({
        planCode: selection.planCode,
        currency: selection.currency,
        period: selection.period,
        paymentMethod: method,
      });
      if (session.checkout !== "hosted" || !session.url) {
        // Defensa en profundidad: la API responde 409 cuando no hay pasarela,
        // así que llegar aquí significa que el proveedor cambió de opinión a
        // mitad. No se enseña un enlace vacío.
        setState({
          status: "problem",
          problem: checkoutProblem({ code: "checkout_unavailable" }),
        });
        return;
      }
      rememberCheckout(
        typeof window === "undefined" ? null : window.sessionStorage,
        { planCode: selection.planCode, startedAt: Date.now() },
      );
      setState({ status: "redirecting", url: session.url });
      // Destino EXTERNO (la pasarela): el router de Next sólo navega dentro
      // de la aplicación.
      window.location.assign(session.url);
    } catch (error) {
      const problem = checkoutProblem(error);
      // Sin datos fiscales no se manda a nadie a pagar: se le pide aquí lo que
      // falta y se retoma la compra. Rebotarle a otra pantalla con un error
      // sería perder la venta por un formulario de cinco campos.
      setState(
        problem.code === "tax_profile_required"
          ? { status: "fiscal" }
          : { status: "problem", problem },
      );
    } finally {
      opening.current = false;
    }
  };

  if (!selection) {
    return (
      <Shell title="No sabemos qué plan quieres">
        <p role="alert">
          El enlace llegó sin un plan válido. Vuelve a la página de precios y
          elige de nuevo; no vamos a suponer uno por ti.
        </p>
        <Link className={publicActionClass} href={PRICING_PATH}>
          Ver los planes
        </Link>
      </Shell>
    );
  }

  if (auth.isLoading) {
    return (
      <Shell title="Comprobando tu sesión">
        <p role="status">Un momento…</p>
      </Shell>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <Shell title="Necesitas una cuenta para contratar">
        <p>
          Guardamos el plan que elegiste: al volver, la compra continúa donde la
          dejaste.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className={publicActionClass}
            href={authPathForCheckout("register", selection)}
          >
            Crear cuenta
          </Link>
          <Link
            className={publicActionClass}
            href={authPathForCheckout("login", selection)}
          >
            Ya tengo cuenta
          </Link>
        </div>
      </Shell>
    );
  }

  if (!auth.organizationId) {
    return (
      <Shell title="Elige primero tu organización">
        <p>
          Las suscripciones se contratan por organización, no por persona. Crea
          la tuya o entra en una existente y vuelve a esta página.
        </p>
        <Link className={publicActionClass} href="/dashboard">
          Ir a mi organización
        </Link>
      </Shell>
    );
  }

  if (!canOpenCheckout(auth.role)) {
    return (
      <Shell title="Tu rol no permite contratar">
        <p role="status">
          Sólo el propietario o un administrador de la organización pueden abrir
          una compra. Pídeselo a quien lo sea: al hacerlo, el plan queda activo
          para todo el equipo.
        </p>
        <Link className={publicActionClass} href={PRICING_PATH}>
          Volver a los planes
        </Link>
      </Shell>
    );
  }

  if (state.status === "problem") {
    return (
      <Shell title={state.problem.title}>
        <p role="alert">{state.problem.detail}</p>
        {state.problem.code && (
          <p className="text-sm text-gray-500">
            Código para soporte: <code>{state.problem.code}</code>
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Link className={publicActionClass} href={PRICING_PATH}>
            Volver a los planes
          </Link>
          <Link className={publicActionClass} href={BILLING_PATH}>
            Ver mi facturación
          </Link>
          {state.problem.contactSales && (
            <a className={publicActionClass} href={COMMERCIAL_LINKS.sales}>
              Hablar con el equipo comercial
            </a>
          )}
        </div>
      </Shell>
    );
  }

  if (state.status === "fiscal") {
    return (
      <Shell title="Nos faltan tus datos fiscales">
        <p role="status">
          Sin RFC no podemos emitirte un CFDI, y sin CFDI lo que pagues no es
          deducible. Te los pedimos ahora, antes de cobrarte, para no tener que
          perseguirte después con el mes ya cerrado. No se te ha cobrado nada.
        </p>
        <TaxProfileForm
          submitLabel="Guardar y continuar al pago"
          onSaved={() => void openCheckout()}
        />
      </Shell>
    );
  }

  if (state.status === "opening" || state.status === "redirecting") {
    return (
      <Shell title="Te llevamos al pago">
        <p role="status">
          Abriendo la página de pago del proveedor para el plan{" "}
          <strong>{selection.planCode}</strong>. No cierres esta pestaña.
        </p>
        {state.status === "redirecting" && (
          <a className={publicActionClass} href={state.url}>
            Continuar al pago
          </a>
        )}
      </Shell>
    );
  }

  return (
    <Shell title="¿Cómo prefieres pagar?">
      <p>
        Contratas el plan <strong>{selection.planCode}</strong>. El importe lo
        fija el catálogo del producto y lo cobra el proveedor en su propia
        página.
      </p>
      <fieldset className="space-y-3" data-testid="payment-methods">
        <legend className="sr-only">Medio de pago</legend>
        {methods.map((option) => (
          <label
            key={option.method}
            className="flex gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
          >
            <input
              type="radio"
              name="paymentMethod"
              className="mt-1"
              value={option.method}
              checked={method === option.method}
              onChange={() => setMethod(option.method)}
            />
            <span>
              <strong className="block">{option.label}</strong>
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {option.detail}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className={publicActionClass}
        data-testid="continue-to-payment"
        onClick={() => void openCheckout()}
      >
        Continuar al pago
      </button>
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <PublicPageShell
      eyebrow="Compra"
      title="Contratar"
      intro="Esta pantalla sólo abre el pago; el importe lo fija el catálogo del producto y lo cobra el proveedor en su propia página."
    >
      <PublicSection title={title}>{children}</PublicSection>
    </PublicPageShell>
  );
}
