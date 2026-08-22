import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { buttonClass } from "@/components/ui";
import { COMMERCIAL_LINKS } from "@/config/commercial";

/**
 * 404 CON LA MARCA PROPIA.
 *
 * Sin este archivo, una dirección equivocada mostraba la pantalla por defecto
 * de Next: fondo blanco, la tipografía del framework y, en producción, un «404
 * · This page could not be found» en inglés. Un cliente mexicano que se
 * equivoca de enlace veía la marca de NEXT, no la nuestra, y en otro idioma.
 *
 * Un 404 útil no se disculpa: ofrece las tres salidas más probables. Quien
 * llega aquí venía a algún sitio.
 */
export const metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <main
      id="contenido"
      className="relative grid min-h-screen place-items-center px-5 py-16"
    >
      <div aria-hidden="true" className="aurora-bg fixed inset-0 -z-10" />
      <div className="w-full max-w-lg text-center">
        <Link href="/" className="inline-flex">
          <Logo />
        </Link>
        <Compass
          aria-hidden="true"
          className="mx-auto mt-10 h-10 w-10 text-muted-foreground"
        />
        <p className="type-eyebrow mt-6 text-primary-ink">Error 404</p>
        <h1 className="type-title mt-3">Esta página no existe</h1>
        <p className="type-body mt-4 text-muted-foreground">
          El enlace puede estar mal copiado, o la página pudo haberse movido. Tus
          planos no se han ido a ninguna parte.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/dashboard" className={buttonClass({ variant: "primary" })}>
            Ir a mis proyectos
          </Link>
          <Link href="/" className={buttonClass({ variant: "secondary" })}>
            Volver al inicio
          </Link>
        </div>
        <p className="type-small mt-8 text-muted-foreground">
          ¿Deberías estar viendo algo aquí?{" "}
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href={COMMERCIAL_LINKS.support}
          >
            Escríbenos
          </a>
          .
        </p>
      </div>
    </main>
  );
}
