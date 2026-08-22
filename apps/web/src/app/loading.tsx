import { Skeleton } from "@/components/ui";

/**
 * LA ESPERA POR DEFECTO DE TODA LA APLICACIÓN.
 *
 * Sin este archivo, Next no tiene frontera de Suspense en la raíz: la
 * navegación entre rutas de servidor se queda con la página ANTERIOR congelada
 * hasta que la nueva termina de resolverse. El usuario pulsa y no pasa nada —
 * y vuelve a pulsar.
 *
 * Es deliberadamente genérico: no sabe qué página viene, así que dibuja la
 * forma que TODAS comparten —un titular y unos renglones— en vez de fingir una
 * silueta que quizá no llegue. Las esperas con forma propia (el tablero, el
 * estudio) traen la suya.
 */
export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-4xl px-5 py-20 sm:px-8"
      aria-busy="true"
    >
      <p role="status" className="sr-only">
        Cargando
      </p>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-5 h-10 w-2/3" />
      <div className="mt-8 max-w-2xl">
        <Skeleton lines={4} />
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </main>
  );
}
