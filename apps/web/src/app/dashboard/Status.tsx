"use client";

import { LogIn } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { buttonClass } from "@/components/ui";

/**
 * La pantalla de una sola frase del tablero: «cargando», «sesión expirada»,
 * «hace falta una organización».
 *
 * Vive aquí y no dentro de `page.tsx` porque el gate de tamaño del repo pone el
 * techo de un fichero no presupuestado en 800 líneas, y el tablero lo rebasó al
 * ganar la precarga del estudio y la frontera de error. Ese techo no es una
 * molestia: es lo que impide que esta página se convierta en el segundo
 * monolito del producto. La respuesta correcta era sacar lo que ya era
 * autónomo, no pedir una excepción.
 *
 * `role="status"` para que la espera se anuncie en vez de quedarse en un texto
 * que sólo ve quien mira.
 */
export function Status({ text, action }: { text: string; action?: () => void }) {
  return (
    <main
      id="contenido"
      className="relative grid min-h-screen place-items-center p-6"
    >
      <div aria-hidden="true" className="aurora-bg fixed inset-0 -z-10" />
      <div className="max-w-md text-center">
        <Logo />
        <p role="status" className="type-body mt-8 text-muted-foreground">
          {text}
        </p>
        {action && (
          <button
            onClick={action}
            className={`${buttonClass({ variant: "primary", size: "lg" })} mt-6`}
          >
            <LogIn className="h-4 w-4" /> Continuar
          </button>
        )}
      </div>
    </main>
  );
}
