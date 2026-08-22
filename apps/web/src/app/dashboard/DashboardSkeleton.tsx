import { Skeleton, Surface } from "@/components/ui";

/**
 * EL TABLERO MIENTRAS CARGA.
 *
 * Antes: `<p role="status">Cargando proyectos y documentos…</p>` centrado en una
 * pantalla en blanco. Medido en toda la aplicación: `animate-pulse` 0 usos,
 * `skeleton` 0 usos. Una pantalla en blanco con una frase no informa de nada —
 * el usuario no sabe si va a aparecer una lista, una tabla o un error, y una
 * espera sin forma se siente el doble de larga que una con forma.
 *
 * El hueso dibuja la SILUETA de lo que viene: la cabecera con el nombre de la
 * organización, y la rejilla de documentos con su número real de columnas. Al
 * llegar los datos, nada se mueve de sitio.
 *
 * `aria-busy` en la región y `role="status"` con el texto en `sr-only`: para el
 * lector de pantalla el hueso no existe —sería ruido— y quien anuncia la espera
 * es una sola frase.
 */
export function DashboardSkeleton() {
  return (
    <main
      className="mx-auto min-h-screen w-full max-w-6xl p-6 md:p-10"
      aria-busy="true"
      data-testid="dashboard-skeleton"
    >
      <p role="status" className="sr-only">
        Cargando proyectos y documentos
      </p>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="w-full max-w-sm">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-64" />
          <Skeleton className="mt-3 h-3 w-40" />
        </div>
        <Skeleton className="h-11 w-36" />
      </header>

      <div className="mt-10">
        <Skeleton className="h-6 w-40" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Surface key={index} padded="sm" elevation="none">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-3 h-3 w-1/2" />
            </Surface>
          ))}
        </div>
      </div>
    </main>
  );
}

/**
 * Hueso de una LISTA de documentos, para cuando el tablero ya está pintado y
 * sólo se recarga la lista. Se separa del anterior porque son dos esperas
 * distintas: recargar la lista no debe borrar la cabecera que ya se leyó.
 */
export function DocumentListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      aria-busy="true"
      data-testid="document-list-skeleton"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: rows }, (_, index) => (
        <Surface key={index} padded="sm" elevation="none">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-3 h-3 w-1/2" />
        </Surface>
      ))}
    </div>
  );
}
