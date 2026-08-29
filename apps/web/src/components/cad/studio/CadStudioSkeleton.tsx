"use client";

import { Skeleton } from "@/components/ui";

/**
 * LA CARCASA DEL ESTUDIO, MIENTRAS EL EDITOR LLEGA.
 *
 * ## Qué problema resuelve
 *
 * El editor son ~3,8 MB de JavaScript que se descargan DESPUÉS de la
 * hidratación (`next/dynamic` con `ssr: false`). Hasta esta pantalla, lo que el
 * usuario veía en ese hueco era una tarjeta centrada con la frase «Cargando
 * documento…»: un spinner mudo que no dice cuánto falta, no se parece en nada a
 * lo que va a aparecer, y cuando el editor por fin llega **sustituye la pantalla
 * entera** — un salto de layout completo justo en el momento en que la persona
 * está mirando.
 *
 * Esta carcasa pinta la MISMA retícula que el editor: barra superior, riel de
 * herramientas a la izquierda, lienzo, panel a la derecha, barra de estado
 * abajo. Cuando el editor llega, ocupa los mismos huecos. No hay salto porque
 * no hay cambio de forma, sólo de contenido.
 *
 * ## Por qué no lleva porcentaje
 *
 * Porque no lo sabemos. Un progreso inventado que se queda clavado en el 90 %
 * es peor que ninguno: enseña que el programa miente. Lo que sí se comunica es
 * la ETAPA —«abriendo el documento» vs «cargando el editor»— que sí se conoce y
 * sí distingue un documento pesado de una conexión lenta.
 *
 * `aria-busy` y un `role="status"` con la etapa hacen que un lector de pantalla
 * anuncie la espera en vez de leer una retícula de cajas vacías.
 */
export function CadStudioSkeleton({
  etapa = "Cargando el editor…",
}: {
  /** Qué está pasando ahora mismo. Se anuncia; no se inventa un porcentaje. */
  etapa?: string;
}) {
  return (
    <div
      aria-busy="true"
      data-testid="cad-studio-skeleton"
      className="grid h-screen grid-rows-[auto_1fr_auto] bg-background text-foreground"
    >
      {/* Barra superior: marca, nombre del documento, acciones. */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Skeleton className="h-6 w-28 rounded-control" />
        <Skeleton className="h-5 w-48 rounded-control" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-20 rounded-control" />
        <Skeleton className="h-8 w-24 rounded-control" />
      </div>

      <div className="grid min-h-0 grid-cols-[auto_1fr_auto]">
        {/* Riel de herramientas. */}
        <div className="flex w-12 flex-col gap-2 border-r border-border p-2">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-8 rounded-control" />
          ))}
        </div>

        {/* El lienzo. Va con la retícula tenue del papel, no en gris plano: es
            lo que va a haber ahí, y verlo aparecer es menos brusco. */}
        <div className="relative min-w-0 bg-muted/20">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.35] blueprint-grid"
          />
          <p
            role="status"
            className="absolute inset-x-0 bottom-8 text-center type-small text-muted-foreground"
          >
            {etapa}
          </p>
        </div>

        {/* Panel derecho: capas, propiedades. */}
        <div className="w-64 space-y-3 border-l border-border p-3">
          <Skeleton className="h-5 w-24 rounded-control" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-control" />
          ))}
        </div>
      </div>

      {/* Barra de estado. */}
      <div className="flex items-center gap-3 border-t border-border px-4 py-2">
        <Skeleton className="h-4 w-32 rounded-control" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-20 rounded-control" />
      </div>
    </div>
  );
}
