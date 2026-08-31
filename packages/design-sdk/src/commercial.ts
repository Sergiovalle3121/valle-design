/**
 * Superficie COMERCIAL (`/v1/commercial/*`): suscripción, entitlements,
 * catálogo de planes, checkout auditable y recibos CFDI.
 *
 * Vive fuera de `client.ts` por la MISMA razón que `identity.ts`, `presence.ts`
 * y `messaging.ts`: ese archivo está en su techo de 800 líneas para un archivo
 * no presupuestado (`scripts/cad/monolith-budget.json`), y las superficies de
 * mensajería, llamadas y presencia que entraron en esta ola lo pasaron.
 *
 * Separarla además dice algo cierto del producto: lo comercial no es CAD. Un
 * integrador que sólo dibuja no necesita cargar con la facturación.
 *
 * La fábrica toma `call`/`resource` en vez de reimplementarlos — mismo
 * transporte, misma política de CSRF y mismo desempaquetado de errores que el
 * resto del cliente.
 */
import type { components } from "./generated/design-api";

type Schemas = components["schemas"];

export type CommercialBillingPortalSession = Schemas["CommercialBillingPortalSession"];
export type CommercialCheckoutSessionCreate = Schemas["CommercialCheckoutSessionCreate"];
export type CommercialSubscriptionCancellation = Schemas["CommercialSubscriptionCancellation"];
export type CommercialSubscriptionResponse = Schemas["CommercialSubscriptionResponse"];
export type CommercialCfdiReceiptList = Schemas["CommercialCfdiReceiptList"];
export type CommercialCheckoutSession = Schemas["CommercialCheckoutSession"];
export type CommercialInvoiceList = Schemas["CommercialInvoiceList"];
export type CommercialPlanList = Schemas["CommercialPlanList"];
export type EffectiveEntitlementList = Schemas["EffectiveEntitlementList"];
export type SatTaxCatalogs = Schemas["SatTaxCatalogs"];
export type TaxProfileResponse = Schemas["TaxProfileResponse"];
export type TaxProfileSave = Schemas["TaxProfileSave"];

type Llamar = <T>(
  method: string,
  path: string,
  body?: unknown,
) => Promise<T>;
type Recurso = (path: string, query?: Record<string, unknown>) => string;

export function createCommercialSurface(call: Llamar, resource: Recurso) {
  return {
    subscription: () =>
      call<CommercialSubscriptionResponse>(
        "GET",
        resource("/v1/commercial/subscription"),
      ),
    entitlements: () =>
      call<EffectiveEntitlementList>(
        "GET",
        resource("/v1/commercial/entitlements"),
      ),
    /**
     * Catálogo publicado: planes activos con sus precios activos. `checkout`
     * dice cómo se cobra hoy (`external` = fuera del producto, vía
     * upgrade-intents); una pasarela real ampliará ese enum.
     */
    plans: () =>
      call<CommercialPlanList>("GET", resource("/v1/commercial/plans")),
    /**
     * Abre una compra autoservicio (owner/admin). Con `checkout: hosted`,
     * `url` es la página de pago del proveedor. Con el proveedor nulo
     * responde 409 `checkout_unavailable` y el intent queda registrado: ese
     * despliegue cobra por fuera.
     */
    createCheckoutSession: (input: CommercialCheckoutSessionCreate) =>
      call<CommercialCheckoutSession>(
        "POST",
        resource("/v1/commercial/checkout-sessions"),
        input,
      ),
    /** Historial de facturas de la organización activa (owner/admin). */
    invoices: () =>
      call<CommercialInvoiceList>("GET", resource("/v1/commercial/invoices")),
    /** Rastro fiscal: qué CFDI cubre cada cobro (owner/admin). */
    cfdiReceipts: () =>
      call<CommercialCfdiReceiptList>("GET", resource("/v1/commercial/cfdi")),
    /**
     * URL de descarga del XML/PDF de un CFDI timbrado. La descarga es una
     * navegación con cookie de sesión (adjunto binario), no un fetch JSON.
     */
    cfdiFileUrl: (receiptId: string, format: "pdf" | "xml") =>
      resource(
        `/v1/commercial/cfdi/${encodeURIComponent(receiptId)}/files/${format}`,
      ),
    /**
     * Baja a fin de período (owner). No corta el acceso: lo comprado sigue
     * vigente hasta `currentPeriodEnd`.
     */
    cancelSubscription: () =>
      call<CommercialSubscriptionCancellation>(
        "POST",
        resource("/v1/commercial/subscription/cancel"),
      ),
    /**
     * Portal del proveedor para que el cliente arregle su medio de pago sin
     * pasar por soporte (owner/admin). La URL caduca: se usa y se olvida.
     */
    billingPortalSession: () =>
      call<CommercialBillingPortalSession>(
        "POST",
        resource("/v1/commercial/billing-portal-sessions"),
      ),
    /**
     * Catalogos del SAT (regimen fiscal y uso de CFDI). Publico y cacheable:
     * el formulario fiscal aparece en el alta, antes de que exista
     * organizacion activa.
     */
    taxCatalogs: () =>
      call<SatTaxCatalogs>(
        "GET",
        resource("/v1/commercial/public/tax-catalogs"),
      ),
    /** Datos fiscales CFDI 4.0 de la organizacion activa (owner/admin). */
    taxProfile: () =>
      call<TaxProfileResponse>("GET", resource("/v1/commercial/tax-profile")),
    /**
     * Captura o sustituye los datos fiscales. Los cinco campos van juntos
     * porque juntos se validan; un 400 `tax_profile_invalid` trae TODOS los
     * campos mal en `issues`.
     */
    saveTaxProfile: (input: TaxProfileSave) =>
      call<TaxProfileResponse>(
        "PUT",
        resource("/v1/commercial/tax-profile"),
        input,
      ),
  };

}
