import type { Metadata } from "next";
import { PublicPageShell, PublicSection } from "../docs/PublicPageShell";
import { CHANGELOG, CHANGE_KINDS } from "@/lib/marketing/changelog";
import { cx } from "@/components/ui";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

/**
 * NOVEDADES — la prueba de que esto está vivo.
 *
 * Un producto joven tiene un problema de confianza que ninguna frase de
 * marketing resuelve: el visitante no sabe si detrás hay alguien trabajando o
 * si lleva medio año parado con una portada bonita. Una lista fechada de lo que
 * ha cambiado responde a eso sin prometer nada — y para una beta, eso es
 * argumento de venta.
 *
 * El contenido sale de `lib/marketing/changelog.ts` y cada entrada describe algo
 * que YA está en producción. No hay hoja de ruta aquí a propósito: una hoja de
 * ruta pública es una lista de promesas con fecha, y este producto se ha ganado
 * su credibilidad declarando límites en vez de anunciando futuros.
 *
 * La agrupación es por fecha y no por tipo porque lo que el visitante quiere
 * saber primero es CUÁNDO fue lo último, no de qué clase era.
 */

export const metadata: Metadata = publicPageMetadata({
  path: "/novedades",
  title: "Novedades del producto",
  description:
    "Lo que ha cambiado en Valle Design, fechado y en producción: novedades, mejoras y arreglos del editor CAD en línea.",
});

/** Fecha larga en es-MX, calculada en el servidor: misma cadena para todos. */
const formatoFecha = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function fechaLarga(iso: string): string {
  // `T00:00:00Z` explícito: sin él, un ISO de sólo fecha se interpreta en la
  // zona local y en México se muestra el día ANTERIOR. Es el error de fecha por
  // un día más común que existe.
  return formatoFecha.format(new Date(`${iso}T00:00:00Z`));
}

export default function NovedadesPage() {
  const porFecha = CHANGELOG.reduce<Map<string, typeof CHANGELOG>>(
    (mapa, entrada) => {
      const previas = mapa.get(entrada.fecha) ?? [];
      mapa.set(entrada.fecha, [...previas, entrada] as typeof CHANGELOG);
      return mapa;
    },
    new Map(),
  );

  return (
    <PublicPageShell
      eyebrow="Novedades"
      title="Lo que ha cambiado"
      intro="Cada entrada describe algo que ya está en producción y que puedes tocar hoy. No hay hoja de ruta en esta página: preferimos que juzgues el producto por lo que hace, no por lo que promete."
    >
      <PublicSection title="Historial de cambios">
        <ol className="space-y-10">
          {[...porFecha.entries()].map(([fecha, entradas]) => (
            <li key={fecha} className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              {/* La fecha como columna propia: el ojo baja por ella y encuentra
                  el ritmo del producto de un vistazo. En móvil se apila. */}
              <p className="type-sheet-number text-muted-foreground sm:pt-1">
                <time dateTime={fecha}>{fechaLarga(fecha)}</time>
              </p>

              <div className="space-y-4 border-l border-border pl-6 sm:pl-8">
                {entradas.map((entrada) => (
                  <article key={entrada.titulo}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={cx(
                          "type-micro rounded-full px-2.5 py-1 font-semibold uppercase tracking-[0.06em]",
                          CHANGE_KINDS[entrada.tipo].className,
                        )}
                      >
                        {CHANGE_KINDS[entrada.tipo].label}
                      </span>
                      <h3 className="type-heading">{entrada.titulo}</h3>
                    </div>
                    <p className="type-small mt-2 text-muted-foreground">
                      {entrada.detalle}
                    </p>
                  </article>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </PublicSection>
    </PublicPageShell>
  );
}
