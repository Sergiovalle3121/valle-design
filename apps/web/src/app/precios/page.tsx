import type { Metadata } from "next";
import { PricingCatalog } from "./PricingCatalog";

/**
 * `/precios` — la puerta de entrada del embudo.
 *
 * El marco (título, texto, pie) es estático y se renderiza en el servidor; los
 * IMPORTES no viven aquí ni pueden vivir aquí: los trae el catálogo real desde
 * `GET /v1/commercial/public/plans`. Un array de precios en este archivo sería
 * una promesa que nadie podría cumplir el día que el operador cambie la tabla.
 */
export const metadata: Metadata = {
  title: "Precios",
  description:
    "Planes y precios publicados de Valle Design, leídos del catálogo real del producto.",
};

export default function PricingPage() {
  return <PricingCatalog />;
}
