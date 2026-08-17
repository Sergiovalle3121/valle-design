import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutStarter } from "./CheckoutStarter";

/**
 * `/precios/checkout` — el puente entre elegir un plan y pagarlo.
 *
 * Existe como ruta propia (y no como un `onClick` en la página de precios)
 * porque es el punto al que se VUELVE tras iniciar sesión: el plan elegido
 * viaja en la URL, así que quien llega desde el login retoma exactamente la
 * compra que había empezado, sin volver a elegir.
 *
 * `noindex`: es una página de tránsito con parámetros; indexarla sólo
 * conseguiría que un buscador mandara visitantes a un checkout sin contexto.
 */
export const metadata: Metadata = {
  title: "Contratar",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <Suspense fallback={<p role="status">Preparando tu compra…</p>}>
      <CheckoutStarter />
    </Suspense>
  );
}
