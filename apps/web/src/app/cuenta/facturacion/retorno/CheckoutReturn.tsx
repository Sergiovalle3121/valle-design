"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { COMMERCIAL_LINKS } from "@/config/commercial";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { designClient } from "@/lib/cad/repositories/client";
import {
  forgetCheckout,
  recallCheckout,
  resolveCheckoutOutcome,
  BILLING_PATH,
  PRICING_PATH,
  type CheckoutOutcomeView,
  type Subscription,
} from "@/lib/commercial/checkout";

/** Cada cuánto se vuelve a preguntar mientras el pago sigue sin confirmar. */
const POLL_INTERVAL_MS = 5_000;
/**
 * Cuántas veces. Tres minutos cubren de sobra una tarjeta; un pago en efectivo
 * NO cabe aquí ni pretende caber, y por eso al agotarse el sondeo la página
 * sigue diciendo "pendiente" y ofrece comprobar a mano, en vez de declarar un
 * fallo que no ha ocurrido.
 */
const MAX_POLLS = 36;

type Snapshot =
  | { status: "loading" }
  | {
      status: "read";
      outcome: CheckoutOutcomeView;
      subscription: Subscription | null;
    }
  | { status: "unreadable" };

/**
 * Desenlace del pago, leído del estado real de la suscripción.
 *
 * La página no acepta un `?resultado=` como verdad. Lo único que el navegador
 * aporta es de QUÉ plan esperaba confirmación (lo guardó al salir hacia la
 * pasarela), y eso sólo sirve para no cantar victoria cuando la suscripción
 * activa es todavía la anterior.
 */
export function CheckoutReturn() {
  const auth = useDesignAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: "loading" });
  const [poll, setPoll] = useState(0);

  const ready =
    !auth.isLoading && auth.isAuthenticated && !!auth.organizationId;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await designClient.commercial.subscription();
        if (cancelled) return;
        const storage =
          typeof window === "undefined" ? null : window.sessionStorage;
        const expected = recallCheckout(storage)?.planCode ?? null;
        const outcome = resolveCheckoutOutcome(response.subscription, expected);
        // Confirmado: se olvida la espera para que una visita posterior a esta
        // misma URL no siga hablando de una compra ya cerrada.
        if (outcome.outcome === "pagado") forgetCheckout(storage);
        setSnapshot({
          status: "read",
          outcome,
          subscription: response.subscription,
        });
      } catch {
        if (!cancelled) setSnapshot({ status: "unreadable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, poll]);

  const waiting =
    snapshot.status === "read" &&
    snapshot.outcome.keepPolling &&
    poll < MAX_POLLS;

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(
      () => setPoll((value) => value + 1),
      POLL_INTERVAL_MS,
    );
    return () => clearTimeout(timer);
  }, [waiting, poll]);

  if (auth.isLoading) {
    return (
      <Frame title="Comprobando tu sesión">
        <p role="status">Un momento…</p>
      </Frame>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <Frame title="Inicia sesión para ver el estado">
        <p role="alert">
          El estado de un pago sólo se puede consultar dentro de la cuenta que
          lo hizo. Si acabas de pagar, tu compra sigue su curso aunque no la
          veas aquí.
        </p>
        <Link
          className={actionClass}
          href={`/login?returnTo=${encodeURIComponent(`${BILLING_PATH}/retorno`)}`}
        >
          Iniciar sesión
        </Link>
      </Frame>
    );
  }

  if (!auth.organizationId) {
    return (
      <Frame title="Elige tu organización">
        <p role="status">
          Las suscripciones son de la organización. Entra en la tuya desde el
          panel para ver el estado del pago.
        </p>
        <Link className={actionClass} href="/dashboard">
          Ir al panel
        </Link>
      </Frame>
    );
  }

  if (snapshot.status === "loading") {
    return (
      <Frame title="Comprobando el estado del pago">
        <p role="status">Preguntando al servicio…</p>
      </Frame>
    );
  }

  if (snapshot.status === "unreadable") {
    return (
      <Frame title="No pudimos leer el estado de tu suscripción">
        <p role="alert">
          El servicio no respondió. Esto NO significa que tu pago haya fallado:
          significa que ahora mismo no podemos confirmarlo. Vuelve a intentarlo
          en un momento.
        </p>
        <button
          type="button"
          className={actionClass}
          onClick={() => {
            setSnapshot({ status: "loading" });
            setPoll((value) => value + 1);
          }}
        >
          Comprobar de nuevo
        </button>
      </Frame>
    );
  }

  const { outcome } = snapshot;
  const exhausted = outcome.keepPolling && poll >= MAX_POLLS;

  return (
    <Frame title={outcome.title}>
      <p
        role={outcome.outcome === "fallido" ? "alert" : "status"}
        data-testid={`checkout-outcome-${outcome.outcome}`}
      >
        {outcome.detail}
      </p>

      {snapshot.subscription && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Plan registrado ahora mismo:{" "}
          <strong>{snapshot.subscription.planCode}</strong>.
        </p>
      )}

      {exhausted && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Hemos dejado de comprobarlo automáticamente para no tener esta página
          consultando sin fin. Sigue pendiente, no fallido: puedes cerrarla y
          volver más tarde.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {outcome.outcome === "pagado" ? (
          <Link className={actionClass} href="/dashboard">
            Empezar a trabajar
          </Link>
        ) : (
          <button
            type="button"
            className={actionClass}
            onClick={() => {
              setSnapshot({ status: "loading" });
              setPoll((value) => value + 1);
            }}
          >
            Comprobar de nuevo
          </button>
        )}
        <Link className={actionClass} href={BILLING_PATH}>
          Ver mi facturación
        </Link>
        {outcome.outcome === "fallido" && (
          <>
            <Link className={actionClass} href={PRICING_PATH}>
              Volver a los planes
            </Link>
            <a className={actionClass} href={COMMERCIAL_LINKS.support}>
              Escribir a soporte
            </a>
          </>
        )}
      </div>
    </Frame>
  );
}

const actionClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-indigo-500 px-4 py-2 font-semibold text-indigo-700 hover:bg-indigo-500/5 dark:text-indigo-200";

function Frame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl p-6 md:p-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
          Compra
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      </header>
      <div className="mt-8 space-y-4">{children}</div>
    </main>
  );
}
