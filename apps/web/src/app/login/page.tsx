import type { Metadata } from "next";
import { AuthPage } from "@/components/AuthPage";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

/**
 * La pantalla de acceso también es pública: alguien que busca el producto por
 * su nombre llega antes aquí que a la portada. Sin canonical propio, esta URL
 * compite con `/` por la misma consulta.
 */
export const metadata: Metadata = publicPageMetadata({
  path: "/login",
  title: "Iniciar sesión",
  description:
    "Entra a tu cuenta de Valle Design y abre tus proyectos de CAD en línea desde el navegador, sin instalar nada.",
});

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
