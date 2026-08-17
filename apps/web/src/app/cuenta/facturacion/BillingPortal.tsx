"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import {
  cancellationWarning,
  invoiceRow,
  renewalNote,
  subscriptionStatusLabel,
  type InvoiceRow,
  type Subscription,
} from "@/lib/commercial/billing";
import {
  BILLING_PATH,
  canCancelSubscription,
  PRICING_PATH,
} from "@/lib/commercial/checkout";

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; detail: string };

/**
 * Lo que se sabe SIN preguntar a la API. Se calcula al pintar y no en un
 * efecto: escribir estado de forma síncrona dentro de un efecto provoca
 * renders en cascada (y un aviso del compilador de React) para responder algo
 * que el contexto de sesión ya sabía.
 */
type SessionGate = "loading" | "expired" | "no-organization" | "ready";

type CancelState =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "sending" }
  | { status: "done"; message: string }
  | { status: "failed"; message: string };

/**
 * Portal de facturación.
 *
 * Dos decisiones que parecen de detalle y no lo son:
 *
 * - Las facturas se cargan APARTE de la suscripción. `GET /invoices` exige
 *   owner/admin y `GET /subscription` no: un miembro tiene derecho a saber en
 *   qué plan está su organización aunque no pueda ver los importes, y hacer que
 *   un 403 del historial tire la página entera le ocultaría también eso.
 * - La baja se le esconde a quien no es owner en vez de enseñarle un botón que
 *   la API va a rechazar. Un control que falla al pulsarlo no informa: frustra.
 */
export function BillingPortal() {
  const auth = useDesignAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoicesDenied, setInvoicesDenied] = useState(false);
  const [cancel, setCancel] = useState<CancelState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);

  const gate: SessionGate = auth.isLoading
    ? "loading"
    : !auth.isAuthenticated
      ? "expired"
      : !auth.organizationId
        ? "no-organization"
        : "ready";

  // La lectura vive DENTRO del efecto y el reintento es un contador: llamar a
  // una función que escribe estado desde el cuerpo del efecto dispara renders
  // en cascada. Aquí sólo se escribe estado después de un `await`.
  useEffect(() => {
    if (gate !== "ready") return;
    let cancelled = false;
    void (async () => {
      try {
        const current = await designClient.commercial.subscription();
        if (cancelled) return;
        setSubscription(current.subscription);
        try {
          const history = await designClient.commercial.invoices();
          if (cancelled) return;
          setInvoices(history.items.map(invoiceRow));
          setInvoicesDenied(false);
        } catch (error) {
          if (cancelled) return;
          // 403 del historial: el plan sí se enseña; los importes no.
          if (error instanceof DesignApiError && error.status === 403) {
            setInvoices([]);
            setInvoicesDenied(true);
          } else {
            throw error;
          }
        }
        setState({ status: "ready" });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          detail:
            error instanceof DesignApiError && error.status === 401
              ? "Tu sesión ha caducado. Inicia sesión de nuevo para ver tu facturación."
              : error instanceof Error
                ? error.message
                : "No pudimos leer tu facturación.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gate, attempt]);

  const confirmCancellation = async () => {
    setCancel({ status: "sending" });
    try {
      const result = await designClient.commercial.cancelSubscription();
      setCancel({ status: "done", message: result.cancellation.message });
      // Se relee el estado real en vez de dar por hecho el efecto de la baja:
      // con el proveedor nulo la solicitud sólo queda registrada.
      setAttempt((value) => value + 1);
    } catch (error) {
      const denied = error instanceof DesignApiError && error.status === 403;
      const already =
        error instanceof DesignApiError &&
        error.code === "subscription_already_cancelled";
      setCancel({
        status: "failed",
        message: denied
          ? "Sólo el propietario de la organización puede dar de baja la suscripción."
          : already
            ? "La suscripción ya estaba cancelada."
            : error instanceof Error
              ? error.message
              : "No se pudo registrar la baja.",
      });
    }
  };

  if (gate === "expired") {
    return (
      <Frame>
        <p role="alert">Tu sesión ha caducado. Inicia sesión de nuevo.</p>
        <Link
          className={actionClass}
          href={`/login?returnTo=${encodeURIComponent(BILLING_PATH)}`}
        >
          Iniciar sesión
        </Link>
      </Frame>
    );
  }

  if (gate === "no-organization") {
    return (
      <Frame>
        <p role="status">
          La facturación es de la organización, no de la cuenta. Entra en una
          organización desde el panel y vuelve aquí.
        </p>
        <Link className={actionClass} href="/dashboard">
          Ir al panel
        </Link>
      </Frame>
    );
  }

  if (gate === "loading" || state.status === "loading") {
    return (
      <Frame>
        <p role="status">Cargando tu facturación…</p>
      </Frame>
    );
  }

  if (state.status === "error") {
    return (
      <Frame>
        <p role="alert">{state.detail}</p>
        <button
          type="button"
          className={actionClass}
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        >
          Reintentar
        </button>
      </Frame>
    );
  }

  return (
    <Frame>
      <section aria-labelledby="plan-actual">
        <h2 id="plan-actual" className="text-xl font-semibold">
          Plan actual
        </h2>
        {subscription ? (
          <div
            className="mt-4 rounded-2xl border border-black/10 p-5 dark:border-white/10"
            data-testid="subscription-card"
          >
            <p className="text-2xl font-semibold">{subscription.planCode}</p>
            <p className="mt-1 text-sm">
              Estado: {subscriptionStatusLabel(subscription.status)}
              {subscription.effective ? "" : " · sin acceso efectivo"}
            </p>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              {renewalNote(subscription)}
            </p>
          </div>
        ) : (
          <p className="mt-4" role="status">
            Esta organización no tiene ninguna suscripción registrada.{" "}
            <Link className="underline" href={PRICING_PATH}>
              Consulta los planes
            </Link>
            .
          </p>
        )}
      </section>

      <section aria-labelledby="facturas" className="mt-10">
        <h2 id="facturas" className="text-xl font-semibold">
          Facturas
        </h2>
        {invoicesDenied ? (
          <p
            className="mt-4 text-sm"
            role="status"
            data-testid="invoices-denied"
          >
            Tu rol no incluye el historial de facturación. Pídeselo al
            propietario o a un administrador de la organización.
          </p>
        ) : invoices.length === 0 ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
            Todavía no hay facturas emitidas.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
              >
                <span>
                  <strong className="block">{invoice.label}</strong>
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {invoice.amount} · {invoice.status}
                    {invoice.issuedAt ? ` · ${invoice.issuedAt}` : ""}
                    {invoice.period ? ` · ${invoice.period}` : ""}
                  </span>
                </span>
                {invoice.hostedUrl ? (
                  <a
                    className="underline underline-offset-4"
                    href={invoice.hostedUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Ver documento
                  </a>
                ) : (
                  <span className="text-sm text-gray-500">
                    Documento no disponible
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {subscription && subscription.status !== "cancelled" && (
        <section aria-labelledby="baja" className="mt-10">
          <h2 id="baja" className="text-xl font-semibold">
            Dar de baja
          </h2>
          {canCancelSubscription(auth.role) ? (
            <div className="mt-4" data-testid="cancel-area">
              {cancel.status === "done" ? (
                <p role="status" className="text-sm">
                  {cancel.message}
                </p>
              ) : cancel.status === "confirming" ||
                cancel.status === "sending" ? (
                <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5">
                  <p className="text-sm" data-testid="cancel-warning">
                    {cancellationWarning(subscription)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className={actionClass}
                      disabled={cancel.status === "sending"}
                      onClick={() => void confirmCancellation()}
                    >
                      {cancel.status === "sending"
                        ? "Registrando la baja…"
                        : "Sí, cancelar al final del periodo"}
                    </button>
                    <button
                      type="button"
                      className={actionClass}
                      disabled={cancel.status === "sending"}
                      onClick={() => setCancel({ status: "idle" })}
                    >
                      No, seguir con mi plan
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {cancel.status === "failed" && (
                    <p role="alert" className="mb-3 text-sm text-rose-600">
                      {cancel.message}
                    </p>
                  )}
                  <button
                    type="button"
                    className={actionClass}
                    data-testid="cancel-button"
                    onClick={() => setCancel({ status: "confirming" })}
                  >
                    Cancelar la suscripción
                  </button>
                </>
              )}
            </div>
          ) : (
            <p
              className="mt-4 text-sm"
              role="status"
              data-testid="cancel-denied"
            >
              Sólo el propietario de la organización puede darla de baja. Si
              necesitas cancelar, pídeselo: el acceso se mantiene hasta el final
              del periodo pagado.
            </p>
          )}
        </section>
      )}
    </Frame>
  );
}

const actionClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-indigo-500 px-4 py-2 font-semibold text-indigo-700 hover:bg-indigo-500/5 disabled:opacity-60 dark:text-indigo-200";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl p-6 md:p-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
          Tu cuenta
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Facturación</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Plan, estado, renovación y facturas de tu organización.
        </p>
      </header>
      <div className="mt-8 space-y-4">{children}</div>
    </main>
  );
}
