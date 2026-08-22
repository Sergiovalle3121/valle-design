"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { BrokenLinkArt } from "@/components/brand/Illustration";
import { Button, buttonClass } from "@/components/ui";
import { COMMERCIAL_LINKS } from "@/config/commercial";

/**
 * FRONTERA DE ERROR DE LA APLICACIÓN.
 *
 * Sin este archivo, cualquier excepción no capturada durante el render tumbaba
 * la ruta entera a la pantalla de error de Next — en desarrollo un volcado de
 * pila; en producción una página en blanco con un texto en inglés.
 *
 * DOS COSAS QUE SÍ HACE Y QUE UNA PANTALLA DE ERROR SUELE OLVIDAR:
 *
 *  · `reset()`. El error puede ser transitorio —una lectura que falló una vez—
 *    y `reset` vuelve a montar el subárbol sin recargar la página entera ni
 *    perder el estado del resto de la aplicación. Un botón que sólo dice
 *    «recarga» tira todo lo demás por si acaso.
 *  · `digest`. En producción Next NO envía el mensaje del error al navegador
 *    —lo cual es correcto: un mensaje puede filtrar la forma de la base de
 *    datos— y en su lugar manda un identificador. Enseñarlo es lo que permite
 *    que soporte encuentre ESA entrada en el registro del servidor en vez de
 *    pedirle al usuario que describa lo que vio.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // La consola del navegador es la única superficie de diagnóstico que
    // tenemos aquí; el servidor ya registró el error con este mismo digest.
    console.error("Fallo de render en la aplicación:", error);
  }, [error]);

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
        <BrokenLinkArt className="mx-auto mt-10" />
        <h1 className="type-title mt-6">Algo se rompió de nuestro lado</h1>
        <p className="type-body mt-4 text-muted-foreground">
          No es culpa de lo que hiciste. Tus documentos guardados están
          intactos: esto sólo afectó a lo que se estaba pintando en pantalla.
        </p>

        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            variant="primary"
            size="lg"
            onClick={reset}
            iconLeft={<RotateCcw className="h-4 w-4" />}
          >
            Reintentar
          </Button>
          <Link
            href="/dashboard"
            className={buttonClass({ variant: "secondary", size: "lg" })}
          >
            Ir a mis proyectos
          </Link>
        </div>

        {error.digest ? (
          <p className="type-small mt-8 text-muted-foreground">
            Si vuelve a pasar, dale este código a soporte:{" "}
            <code className="type-mono select-all rounded-control border border-border bg-muted px-2 py-0.5 text-foreground">
              {error.digest}
            </code>
          </p>
        ) : null}
        <p className="type-small mt-3 text-muted-foreground">
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href={COMMERCIAL_LINKS.support}
          >
            Contactar con soporte
          </a>
        </p>
      </div>
    </main>
  );
}
