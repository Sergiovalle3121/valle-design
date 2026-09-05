import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Ban, Check, WifiOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Badge, Surface, buttonClass } from "@/components/ui";
import {
  MAX_CHECKPOINTS_PER_LANE,
  MAX_RECOVERY_AGE_MS,
} from "@/lib/cad/cad-recovery-journal";

/**
 * `/sin-conexion` — EL CASCARÓN QUE FALTABA.
 *
 * ## El hueco que cierra
 *
 * Los DATOS ya sobrevivían a la caída de la red: el journal de recuperación
 * escribe checkpoints en IndexedDB por carril de pestaña
 * (`lib/cad/cad-recovery-journal.ts`) y el oyente de `online`
 * (`components/cad/document-lifecycle/connectivity.ts`) reintenta el guardado
 * pendiente en cuanto vuelve el cable. Lo que NO sobrevivía era el cascarón:
 * una recarga sin conexión devolvía la página de error del navegador —la del
 * dinosaurio— y el arquitecto que perdió el wifi no tenía forma de saber si su
 * trabajo estaba a salvo o no.
 *
 * Esta ruta es lo que el service worker precacha y sirve cuando la navegación
 * falla. Existe ANTES que el service worker a propósito: si no existiera, el
 * SW tendría que llevar HTML con colores escritos a mano dentro de su propio
 * archivo, que es exactamente lo que el sistema de diseño prohíbe. Aquí el
 * fallback es una página de verdad, con tokens, primitivas y tipografía de la
 * escala, y el SW sólo tiene que guardarla.
 *
 * ## Por qué está en el grupo `(sw)`
 *
 * El paréntesis no aparece en la URL: `/sin-conexion` sigue siendo
 * `/sin-conexion`. El grupo existe para que todo lo que el service worker
 * precacha viva junto y se vea de un vistazo — hoy una página, mañana la lista
 * completa del manifiesto de precacheo.
 *
 * ## Por qué el texto sale de claves y no del archivo
 *
 * Es la primera superficie del producto traducida DE VERDAD. El resto de la app
 * elige literales EN/ES con `useLocale` dentro del componente, que funciona
 * hasta que hay que cambiar una frase y hay dos sitios que tocar. Aquí el
 * `.tsx` no escribe ni una palabra visible: todo viene del namespace `offline`
 * de los dos catálogos, y `src/i18n/key-driven-copy.spec.ts` exige que tengan el
 * mismo juego de claves, los mismos marcadores ICU y cero claves muertas.
 *
 * ## Lo que el service worker tiene que saber de ella
 *
 * La ruta se renderiza BAJO DEMANDA (`ƒ` en el build), no estática, porque el
 * idioma sale de la cookie `valle_locale` y leer una cookie hace dinámica la
 * petición. Para el precacheo no cambia nada —el SW pide `/sin-conexion` y
 * guarda la respuesta— pero sí fija una consecuencia que hay que asumir a
 * propósito: el HTML que quede en caché lleva el idioma que tuviera la cookie
 * EN EL MOMENTO DEL PRECACHEO. Quien cambie a español después verá el
 * fallback en inglés hasta que el SW refresque su copia. La alternativa
 * —precachear una variante por idioma y elegirla en el `fetch`— es trabajo del
 * frente del service worker, no de esta página.
 *
 * ## Las dos cifras
 *
 * `{checkpoints}` y `{days}` NO se escriben en el texto: se importan del módulo
 * que las hace cumplir. Un número de política copiado a mano en una frase de
 * marketing es un número que caduca en el siguiente commit sin que nadie se
 * entere; éste no puede mentir porque es el mismo que poda el journal.
 */

/** Días que un borrador se sigue ofreciendo, derivados de la política real. */
const RECOVERY_AGE_DAYS = Math.round(MAX_RECOVERY_AGE_MS / (24 * 60 * 60 * 1000));

/**
 * METADATA PROPIA, con `robots: { index: false }`.
 *
 * Una pantalla de error de conectividad indexada es ruido puro: el buscador la
 * guardaría como si fuera contenido y podría enseñársela a alguien que llega
 * buscando el producto. Se cierra AQUÍ, en la propia página, y no añadiéndola a
 * la lista de rutas privadas de `config/site-routes.ts`: esa configuración
 * viaja en el bundle cliente de la barra pública y alimenta sitemap y robots,
 * así que meter una ruta que no es ni pública ni privada la obligaría a
 * inventar una tercera categoría. El `noindex` de esta página no necesita que
 * nadie más se entere.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("offline");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

/**
 * Un punto de la lista: icono, título y el porqué debajo.
 *
 * El icono va `aria-hidden` porque no dice nada que el texto no diga; lo que
 * separa «sí» de «no» para un lector de pantalla es el encabezado de la
 * tarjeta, no un palomeo verde.
 */
function Punto({
  icono,
  titulo,
  cuerpo,
}: {
  icono: ReactNode;
  titulo: string;
  cuerpo: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0">{icono}</span>
      <span className="min-w-0">
        <span className="type-small block font-semibold text-foreground">
          {titulo}
        </span>
        <span className="type-small mt-1 block text-muted-foreground">
          {cuerpo}
        </span>
      </span>
    </li>
  );
}

export default function SinConexionPage() {
  const t = useTranslations("offline");

  return (
    <main
      id="contenido"
      className="flex min-h-screen items-center justify-center px-5 py-14 text-foreground sm:px-8"
    >
      <div className="w-full max-w-4xl">
        <header>
          <p className="type-eyebrow text-muted-foreground">{t("eyebrow")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <WifiOff aria-hidden="true" className="h-6 w-6 text-warning-ink" />
            <h1 className="type-title">{t("title")}</h1>
            <Badge tone="warning" dot>
              {t("badge")}
            </Badge>
          </div>
          <p className="type-lead mt-5 max-w-3xl text-muted-foreground">
            {t("intro")}
          </p>
        </header>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {/* LO QUE SÍ. Va primero porque es la respuesta a la pregunta que
              trae quien llega aquí: «¿perdí el plano?». */}
          <Surface as="section" padded="lg">
            <h2 className="type-heading">{t("worksTitle")}</h2>
            <ul className="mt-5 space-y-5">
              <Punto
                icono={
                  <Check aria-hidden="true" className="h-4 w-4 text-success-ink" />
                }
                titulo={t("works.drawTitle")}
                cuerpo={t("works.drawBody")}
              />
              <Punto
                icono={
                  <Check aria-hidden="true" className="h-4 w-4 text-success-ink" />
                }
                titulo={t("works.journalTitle")}
                cuerpo={t("works.journalBody", {
                  checkpoints: MAX_CHECKPOINTS_PER_LANE,
                  days: RECOVERY_AGE_DAYS,
                })}
              />
              <Punto
                icono={
                  <Check aria-hidden="true" className="h-4 w-4 text-success-ink" />
                }
                titulo={t("works.retryTitle")}
                cuerpo={t("works.retryBody")}
              />
            </ul>
          </Surface>

          {/* LO QUE NO. Enumerado igual de concreto que lo anterior: un
              «algunas funciones no están disponibles» no le sirve a nadie que
              esté decidiendo si sigue dibujando o cierra la máquina. */}
          <Surface as="section" padded="lg">
            <h2 className="type-heading">{t("blockedTitle")}</h2>
            <ul className="mt-5 space-y-5">
              <Punto
                icono={
                  <Ban aria-hidden="true" className="h-4 w-4 text-danger-ink" />
                }
                titulo={t("blocked.saveTitle")}
                cuerpo={t("blocked.saveBody")}
              />
              <Punto
                icono={
                  <Ban aria-hidden="true" className="h-4 w-4 text-danger-ink" />
                }
                titulo={t("blocked.blocksTitle")}
                cuerpo={t("blocked.blocksBody")}
              />
              <Punto
                icono={
                  <Ban aria-hidden="true" className="h-4 w-4 text-danger-ink" />
                }
                titulo={t("blocked.reviewTitle")}
                cuerpo={t("blocked.reviewBody")}
              />
            </ul>
          </Surface>
        </div>

        {/* EL LÍMITE DEL BORRADOR, dicho antes de que se descubra solo. El
            journal vive en IndexedDB de ESTE navegador y ESTE perfil; quien
            crea que su trabajo ya está en la cuenta y abra el plano en otra
            máquina no lo va a encontrar. Callarlo sería vender la
            recuperación local como si fuera un guardado. */}
        <Surface as="aside" padded className="mt-5">
          <div className="flex gap-3">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink"
            />
            <div className="min-w-0">
              <h2 className="type-small font-semibold text-warning-ink">
                {t("warningTitle")}
              </h2>
              <p className="type-small mt-2 text-muted-foreground">
                {t("warningBody")}
              </p>
            </div>
          </div>
        </Surface>

        {/* ENLACES, NO BOTONES CON `onClick`. Esta pantalla tiene que servir
            aunque el JavaScript de la aplicación no haya llegado a descargarse,
            y `<Link>` emite un `<a>` de verdad en el HTML: sin JS sigue siendo
            una navegación normal. Y una navegación normal ES el reintento —
            si la red volvió, entra; si no, el service worker vuelve a servir
            esta misma pantalla.

            `prefetch={false}` a propósito: precargar rutas desde la página que
            existe justamente porque NO hay red es tráfico que nunca va a
            llegar, y en cuanto vuelva la conexión el usuario ya habrá pulsado. */}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className={buttonClass({ variant: "primary" })}
            href="/dashboard"
            prefetch={false}
          >
            {t("boardAction")}
          </Link>
          <Link
            className={buttonClass({ variant: "secondary" })}
            href="/studio"
            prefetch={false}
          >
            {t("studioAction")}
          </Link>
        </div>
      </div>
    </main>
  );
}
