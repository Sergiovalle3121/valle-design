import type { Metadata } from "next";
import { AuthPage } from "@/components/AuthPage";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

/**
 * Es la página al final del embudo: casi todos los CTA de la landing y de las
 * guías apuntan aquí, así que su descripción es la última promesa que lee
 * alguien antes de decidir. Dice sólo lo que la cuenta permite hacer.
 */
export const metadata: Metadata = publicPageMetadata({
  path: "/register",
  title: "Crear cuenta",
  description:
    "Crea tu cuenta y empieza a dibujar planos en línea con Valle Design: proyectos en la nube, intercambio DXF e impresión a PDF a escala.",
});

export default function RegisterPage() {
  return <AuthPage mode="register" />;
}
