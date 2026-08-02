import { redirect } from "next/navigation";

/**
 * Compatibilidad de deep links del contrato: la ruta enterprise del estudio
 * (`/dashboard/cad`) vive ahora en `/studio`. Redirección permanente
 * server-side — los marcadores y enlaces guardados siguen funcionando.
 */
export default function LegacyCadStudioRedirect(): never {
  redirect("/studio");
}
