/**
 * PORTAL DE FACTURACIÓN — decir el estado con las palabras del cliente.
 *
 * Los estados del contrato (`trialing`, `past_due`, `cancelled`…) son
 * vocabulario del dominio de cobros, no algo que un arquitecto tenga que
 * aprender para saber si mañana puede abrir sus planos. Aquí se traducen una
 * sola vez, junto con las dos fechas que de verdad importan: hasta cuándo está
 * pagado y qué pasa si cancela.
 *
 * Lo más delicado del módulo es el texto de la baja. `cancelAtPeriodEnd` NO
 * corta el acceso: la API lo dice explícitamente y el cliente tiene que leerlo
 * ANTES de confirmar, o cancelará creyendo que pierde el servicio hoy —y
 * escribirá a soporte, o peor, volverá a pagar.
 */
import type { components } from "@valle/design-sdk";
import { formatMoney } from "./pricing";

type Schemas = components["schemas"];

export type Subscription = Schemas["EffectiveSubscriptionView"];
export type SubscriptionStatus = Schemas["SubscriptionStatus"];
export type Invoice = Schemas["CommercialInvoice"];
export type InvoiceStatus = Schemas["InvoiceStatus"];

/**
 * Fechas SIEMPRE en la zona horaria de México, no en la del dispositivo.
 *
 * Una fecha de renovación es un dato de facturación: tiene que ser LA MISMA
 * para el cliente, para soporte y para la factura. Dejarla a merced del reloj
 * del navegador significa que un cliente de Tijuana y otro de Cancún leen
 * fechas distintas del mismo cargo, y que la que aparece en pantalla no
 * coincide con la del documento fiscal. El producto se vende en México, con
 * precios en pesos e IVA incluido: su calendario es el mismo.
 */
const dates = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  timeZone: "America/Mexico_City",
});

/** Fecha legible, o `null` si no hay una fecha real que enseñar. */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return dates.format(parsed);
}

export function subscriptionStatusLabel(status: SubscriptionStatus): string {
  switch (status) {
    case "trialing":
      return "En periodo de prueba";
    case "active":
      return "Activa";
    case "past_due":
      return "Pago pendiente";
    case "suspended":
      return "Suspendida";
    case "cancelled":
      return "Cancelada";
  }
}

/**
 * Qué ocurre en la próxima fecha del ciclo.
 *
 * Con la baja programada, esa fecha deja de ser una renovación y pasa a ser el
 * final del acceso: llamarla igual en los dos casos es lo que hace que alguien
 * cancele y siga esperando el cargo.
 */
export function renewalNote(subscription: Subscription): string {
  const end = formatDate(subscription.currentPeriodEnd);
  const trial = formatDate(subscription.trialEndsAt);
  if (subscription.status === "cancelled") {
    return "La suscripción está cancelada y no se renovará.";
  }
  if (subscription.cancelAtPeriodEnd) {
    return end
      ? `Baja programada: conservas el acceso hasta el ${end} y no habrá un cargo nuevo.`
      : "Baja programada: conservas el acceso hasta el final del periodo en curso y no habrá un cargo nuevo.";
  }
  if (subscription.status === "trialing") {
    return trial
      ? `La prueba termina el ${trial}. Hasta entonces no hay ningún cargo.`
      : "Periodo de prueba en curso, sin fecha de fin registrada.";
  }
  if (subscription.status === "past_due") {
    return end
      ? `El último cobro no prosperó. El periodo pagado llega hasta el ${end}.`
      : "El último cobro no prosperó y no hay un periodo pagado registrado.";
  }
  return end
    ? `Se renueva el ${end}.`
    : "Sin fecha de renovación registrada: este plan no lo cobra ninguna pasarela.";
}

/**
 * Lo que el cliente debe leer ANTES de confirmar la baja. Se construye con su
 * fecha real para que no sea una advertencia genérica que nadie lee.
 */
export function cancellationWarning(subscription: Subscription): string {
  const end = formatDate(subscription.currentPeriodEnd);
  const tail = end
    ? `Conservarás el acceso hasta el ${end}, el final del periodo que ya pagaste.`
    : "Conservarás el acceso hasta el final del periodo en curso.";
  return `La baja NO corta el servicio ahora mismo. ${tail} A partir de esa fecha no se renovará ni se te cobrará de nuevo.`;
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  switch (status) {
    case "paid":
      return "Pagada";
    case "open":
      return "Pendiente de pago";
    case "uncollectible":
      return "Incobrable";
    case "void":
      return "Anulada";
  }
}

export interface InvoiceRow {
  id: string;
  /** Número del proveedor, o el identificador cuando aún no lo tiene. */
  label: string;
  amount: string;
  status: string;
  issuedAt: string | null;
  period: string | null;
  hostedUrl: string | null;
}

/**
 * Fila de factura lista para pintar.
 *
 * `hostedUrl` sólo se conserva si es HTTPS: el documento fiscal lo custodia el
 * proveedor, y un enlace que llegara con otro esquema no es un enlace al
 * documento, es un problema de seguridad esperando a que alguien lo pulse.
 */
export function invoiceRow(invoice: Invoice): InvoiceRow {
  const from = formatDate(invoice.periodStart);
  const to = formatDate(invoice.periodEnd);
  return {
    id: invoice.id,
    label: invoice.number ?? invoice.id,
    amount: formatMoney(invoice.amountCents, invoice.currency),
    status: invoiceStatusLabel(invoice.status),
    issuedAt: formatDate(invoice.issuedAt),
    period: from && to ? `${from} – ${to}` : (from ?? to),
    hostedUrl: safeDocumentUrl(invoice.hostedUrl),
  };
}

export type CfdiReceipt = Schemas["CommercialCfdiReceipt"];

export function cfdiStatusLabel(status: CfdiReceipt["status"]): string {
  switch (status) {
    case "pending":
      return "En emisión";
    case "issued":
      return "Timbrado";
    case "manual":
      return "En emisión manual";
    case "pooled":
      return "Cubierto por factura global";
    case "failed":
      return "Rechazado por el PAC (en reintento)";
  }
}

export interface CfdiRow {
  id: string;
  /** Folio fiscal cuando está timbrado; si no, el estado manda. */
  label: string;
  amount: string;
  status: string;
  filesAvailable: boolean;
  createdAt: string | null;
}

/** Fila de CFDI lista para pintar. Los archivos se descargan autenticados. */
export function cfdiRow(receipt: CfdiReceipt): CfdiRow {
  return {
    id: receipt.id,
    label:
      receipt.kind === "global"
        ? "Factura global (público en general)"
        : (receipt.uuid ?? "CFDI del cobro"),
    amount: formatMoney(receipt.amountCents, receipt.currency),
    status: cfdiStatusLabel(receipt.status),
    filesAvailable: receipt.filesAvailable,
    createdAt: formatDate(receipt.createdAt),
  };
}

function safeDocumentUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
