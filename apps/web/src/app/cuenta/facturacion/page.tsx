import type { Metadata } from "next";
import { BillingPortal } from "./BillingPortal";

/**
 * `/cuenta/facturacion` — el portal del cliente.
 *
 * Todo lo que se pinta aquí sale de la API (`subscription`, `invoices`): el
 * documento fiscal lo custodia el proveedor de pagos y esta página sólo enlaza
 * al suyo. Nada de PDFs generados por la web, que serían facturas falsas.
 */
export const metadata: Metadata = {
  title: "Facturación",
  robots: { index: false, follow: false },
};

export default function BillingPage() {
  return <BillingPortal />;
}
