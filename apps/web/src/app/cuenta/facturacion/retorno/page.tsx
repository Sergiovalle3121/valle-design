import type { Metadata } from "next";
import { CheckoutReturn } from "./CheckoutReturn";

/**
 * `/cuenta/facturacion/retorno` — a donde vuelve el cliente desde la pasarela.
 *
 * Es la URL que el operador configura en `STRIPE_CHECKOUT_SUCCESS_URL` y en
 * `STRIPE_CHECKOUT_CANCEL_URL`. Las DOS apuntan aquí a propósito: la página no
 * se cree lo que diga la URL —que cualquiera puede teclear— sino lo que
 * responda `GET /v1/commercial/subscription`. Que el proveedor te devuelva por
 * la puerta de "éxito" no significa que el dinero haya llegado.
 */
export const metadata: Metadata = {
  title: "Estado del pago",
  robots: { index: false, follow: false },
};

export default function CheckoutReturnPage() {
  return <CheckoutReturn />;
}
