"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import {
  cancellationWarning,
  cfdiRow,
  invoiceRow,
  renewalNote,
  subscriptionStatusLabel,
  type CfdiRow,
  type InvoiceRow,
  type Subscription,
} from "@/lib/commercial/billing";
import {
  BILLING_PATH,
  canCancelSubscription,
  canOpenCheckout,
  pendingPaymentNotice,
  PRICING_PATH,
  type PendingPayment,
} from "@/lib/commercial/checkout";
import { TaxProfileForm } from "./TaxProfileForm";

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

/**
 * Estado del botón que lleva al portal del proveedor.
 *
 * Es una navegación EXTERNA con una URL que caduca: se pide justo al pulsar y
 * no al cargar la página. Pedirla por adelantado dejaría en el DOM un enlace
 * muerto para quien tarde diez minutos en decidirse.
 */
type PortalState =
  | { status: "idle" }
  | { status: "opening" }
  | { status: "failed"; message: string };

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
  const [cfdi, setCfdi] = useState<CfdiRow[]>([]);
  const [cancel, setCancel] = useState<CancelState>({ status: "idle" });
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(
    null,
  );
  const [portal, setPortal] = useState<PortalState>({ status: "idle" });
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
        setPendingPayment(current.pendingPayment);
        try {
          const history = await designClient.commercial.invoices();
          if (cancelled) return;
          setInvoices(history.items.map(invoiceRow));
          // El rastro fiscal comparte las reglas de acceso del historial: si
          // las facturas se pueden ver, los CFDI también.
          const receipts = await designClient.commercial.cfdiReceipts();
          if (cancelled) return;
          setCfdi(receipts.items.map(cfdiRow));
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

  /**
   * Portal del proveedor. Antes, a alguien en `past_due` se le informaba del
   * fallo y nada más: su única salida era escribir a soporte. Los datos de la
   * tarjeta no pasan por este producto, así que la forma honesta de que la
   * arregle es llevarle a quien la custodia.
   */
  const openProviderPortal = async () => {
    setPortal({ status: "opening" });
    try {
      const session = await designClient.commercial.billingPortalSession();
      // Destino EXTERNO: el router de Next sólo navega dentro de la aplicación.
      window.location.assign(session.url);
    } catch (error) {
      const unavailable =
        error instanceof DesignApiError &&
        error.code === "billing_portal_unavailable";
      setPortal({
        status: "failed",
        message: unavailable
          ? "Tu suscripción no se cobra por una pasarela, así que no hay medio de pago que actualizar aquí. Escríbenos y lo vemos contigo."
          : error instanceof Error
            ? error.message
            : "No pudimos abrir el portal de pagos.",
      });
    }
  };

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
            <p className="mt-2 text-sm" data-testid="subscription-seats">
              Asientos contratados: {subscription.seats}. Al invitar a alguien
              por encima de ese número, la API lo rechaza: el límite no vive en
              esta pantalla.
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

      {pendingPayment && (
        <section aria-labelledby="pago-pendiente" className="mt-10">
          <h2 id="pago-pendiente" className="text-xl font-semibold">
            Pago en curso
          </h2>
          <div
            className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5"
            data-testid="pending-payment"
          >
            <p className="text-sm" role="status">
              {pendingPaymentNotice(pendingPayment)}
            </p>
            {pendingPayment.voucherUrl && (
              <a
                className="mt-3 inline-block underline underline-offset-4"
                href={pendingPayment.voucherUrl}
                target="_blank"
                rel="noreferrer noopener"
                data-testid="voucher-link"
              >
                Ver tu ficha de pago
              </a>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="datos-fiscales" className="mt-10">
        <h2 id="datos-fiscales" className="text-xl font-semibold">
          Datos fiscales (CFDI 4.0)
        </h2>
        {canOpenCheckout(auth.role) ? (
          <TaxProfileForm />
        ) : (
          <p className="mt-4 text-sm" role="status" data-testid="fiscal-denied">
            Los datos fiscales de la organización los gestiona el propietario o
            un administrador.
          </p>
        )}
      </section>

      {subscription && canOpenCheckout(auth.role) && (
        <section aria-labelledby="medio-de-pago" className="mt-10">
          <h2 id="medio-de-pago" className="text-xl font-semibold">
            Medio de pago
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {subscription.status === "past_due"
              ? "Tu último cobro no prosperó. Actualiza tu tarjeta en el portal de nuestro proveedor de pagos: los datos de tu tarjeta nunca pasan por Valle Design."
              : "Cambia tu tarjeta o revisa tus cobros en el portal de nuestro proveedor de pagos. Los datos de tu tarjeta nunca pasan por Valle Design."}
          </p>
          {portal.status === "failed" && (
            <p role="alert" className="mt-3 text-sm text-rose-600">
              {portal.message}
            </p>
          )}
          <button
            type="button"
            className={`${actionClass} mt-4`}
            data-testid="open-billing-portal"
            disabled={portal.status === "opening"}
            onClick={() => void openProviderPortal()}
          >
            {portal.status === "opening"
              ? "Abriendo el portal…"
              : "Actualizar medio de pago"}
          </button>
        </section>
      )}

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

      {!invoicesDenied && (
        <section aria-labelledby="cfdi" className="mt-10">
          <h2 id="cfdi" className="text-xl font-semibold">
            CFDI
          </h2>
          {cfdi.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
              Todavía no hay comprobantes fiscales. Aparecen aquí en cuanto se
              confirma un cobro.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {cfdi.map((receipt) => (
                <li
                  key={receipt.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
                >
                  <span>
                    <strong className="block">{receipt.label}</strong>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {receipt.amount} · {receipt.status}
                      {receipt.createdAt ? ` · ${receipt.createdAt}` : ""}
                    </span>
                  </span>
                  {receipt.filesAvailable ? (
                    <span className="flex gap-4">
                      <a
                        className="underline underline-offset-4"
                        href={designClient.commercial.cfdiFileUrl(
                          receipt.id,
                          "pdf",
                        )}
                      >
                        PDF
                      </a>
                      <a
                        className="underline underline-offset-4"
                        href={designClient.commercial.cfdiFileUrl(
                          receipt.id,
                          "xml",
                        )}
                      >
                        XML
                      </a>
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500">
                      Archivos aún no disponibles
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
