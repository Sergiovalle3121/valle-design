"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  FAQ_CATEGORIES,
  FAQ_ENTRIES,
  FAQ_FALLBACK_HREF,
  type FaqCategoryId,
} from "@/lib/marketing/faq";
import { buttonClass, cx } from "@/components/ui";

/**
 * EL CENTRO DE PREGUNTAS.
 *
 * ── QUÉ ES Y QUÉ NO ─────────────────────────────────────────────────────────
 * No es un acordeón con siete preguntas: es la parte de la página donde alguien
 * que está decidiendo resuelve SU duda concreta. Por eso tiene buscador y
 * categorías, y por eso las respuestas están abiertas por defecto dentro de su
 * categoría en vez de escondidas tras un clic — un acordeón cerrado obliga a
 * abrir veinte cajones para encontrar una frase.
 *
 * ── LAS TRES DECISIONES QUE LO HACEN ÚTIL ───────────────────────────────────
 *
 * 1 · EL BUSCADOR MIRA LA RESPUESTA, NO SÓLO LA PREGUNTA. Quien busca «Argon2»,
 *     «CFDI» o «tableta» no está tecleando el título de ninguna pregunta: está
 *     tecleando la palabra que le importa, y esa palabra vive en el cuerpo. Un
 *     buscador que sólo mira títulos es un índice, no un buscador.
 *
 * 2 · SE NORMALIZAN LOS ACENTOS. En español la mitad de la gente escribe
 *     «facturacion» sin tilde, y una búsqueda que no encuentra «facturación»
 *     por eso es una búsqueda rota. `NFD` + quitar diacríticos, en las dos
 *     puntas de la comparación.
 *
 * 3 · NUNCA HAY CALLEJÓN SIN SALIDA. Si la búsqueda no devuelve nada, el vacío
 *     no dice «sin resultados»: ofrece el canal de soporte. La pregunta que
 *     nadie previó es exactamente la que hay que poder hacer a una persona, y
 *     además es información gratis sobre qué falta en esta lista.
 *
 * ── ACCESIBILIDAD ───────────────────────────────────────────────────────────
 * Los filtros son `<button>` reales con `aria-pressed`; el número de resultados
 * viaja en una región `aria-live` para que quien no ve la pantalla sepa que la
 * lista cambió al teclear; cada respuesta es un `<dt>/<dd>` dentro de una `<dl>`,
 * que es el marcado que un lector de pantalla anuncia como par pregunta-respuesta.
 */

/** Quita tildes y baja a minúsculas: la comparación que espera un hispanohablante. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type Filtro = FaqCategoryId | "todas";

export function FaqCenter() {
  const [consulta, setConsulta] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const resultados = useMemo(() => {
    const aguja = normalizar(consulta);
    return FAQ_ENTRIES.filter((entrada) => {
      if (filtro !== "todas" && entrada.categoria !== filtro) return false;
      if (!aguja) return true;
      // Se busca en pregunta Y respuesta: ver la decisión 1 de la cabecera.
      return normalizar(`${entrada.pregunta} ${entrada.respuesta}`).includes(
        aguja,
      );
    });
  }, [consulta, filtro]);

  /**
   * Las categorías se agrupan a partir de LO FILTRADO, no de la lista completa:
   * así una búsqueda no deja encabezados de categorías vacías colgando, que es
   * el fallo clásico de un filtro pegado sobre una lista agrupada.
   */
  const porCategoria = useMemo(
    () =>
      FAQ_CATEGORIES.map((categoria) => ({
        categoria,
        entradas: resultados.filter((e) => e.categoria === categoria.id),
      })).filter((grupo) => grupo.entradas.length > 0),
    [resultados],
  );

  const buscando = consulta.trim().length > 0;

  return (
    <div className="mt-12">
      {/* ── Buscador ──────────────────────────────────────────────────────── */}
      <div className="relative max-w-xl">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={consulta}
          onChange={(event) => setConsulta(event.target.value)}
          placeholder="Busca una duda: DXF, escala, Argon2, factura…"
          aria-label="Buscar en las preguntas frecuentes"
          data-testid="faq-search"
          className="focus-glow motion-fast w-full rounded-control border border-input bg-card py-3 pl-11 pr-4 type-body text-foreground transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
        />
      </div>

      {/* ── Filtros por categoría ─────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap gap-2">
        <FiltroChip
          activo={filtro === "todas"}
          onClick={() => setFiltro("todas")}
          numero="00"
          label="Todas"
        />
        {FAQ_CATEGORIES.map((categoria) => (
          <FiltroChip
            key={categoria.id}
            activo={filtro === categoria.id}
            onClick={() => setFiltro(categoria.id)}
            numero={categoria.numero}
            label={categoria.label}
          />
        ))}
      </div>

      {/* El recuento se anuncia: sin esto, teclear no produce ningún cambio
          perceptible para quien no ve la lista moverse. */}
      <p
        role="status"
        aria-live="polite"
        className="mt-5 type-small text-muted-foreground"
      >
        {resultados.length === 0
          ? "Ninguna respuesta coincide con esa búsqueda."
          : `${resultados.length} ${resultados.length === 1 ? "respuesta" : "respuestas"}${
              buscando ? " para tu búsqueda" : ""
            }.`}
      </p>

      {/* ── Resultados ────────────────────────────────────────────────────── */}
      {resultados.length === 0 ? (
        <div className="mt-8 rounded-card border border-border bg-card p-8 text-center shadow-resting">
          <p className="type-heading">Esa pregunta todavía no está aquí</p>
          <p className="type-body mx-auto mt-3 max-w-xl text-muted-foreground">
            Escríbenos y te respondemos. Además nos dice qué falta en esta
            página, que es información que no tenemos de ninguna otra forma.
          </p>
          <Link
            href={FAQ_FALLBACK_HREF}
            className={cx(buttonClass({ variant: "primary" }), "mt-6")}
          >
            Preguntar a soporte
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-12">
          {porCategoria.map(({ categoria, entradas }) => (
            <section key={categoria.id} aria-labelledby={`faq-${categoria.id}`}>
              <header className="border-b border-border pb-4">
                <p className="type-sheet-number text-primary-ink">
                  {categoria.numero} · {categoria.label.toUpperCase()}
                </p>
                <h3 id={`faq-${categoria.id}`} className="type-heading mt-2">
                  {categoria.resumen}
                </h3>
              </header>

              <dl className="mt-6 grid gap-5 lg:grid-cols-2">
                {entradas.map((entrada) => (
                  <div
                    key={entrada.pregunta}
                    className="rounded-card border border-border bg-card p-6 shadow-resting"
                  >
                    <dt className="type-body font-semibold text-foreground">
                      {entrada.pregunta}
                    </dt>
                    <dd className="type-small mt-3 text-muted-foreground">
                      {entrada.respuesta}
                      {entrada.enlace ? (
                        <>
                          {" "}
                          <Link
                            href={entrada.enlace.href}
                            className="motion-fast font-medium text-primary-ink underline underline-offset-4 transition-[color] hover:text-foreground"
                          >
                            {entrada.enlace.texto}
                          </Link>
                          .
                        </>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * La ficha de filtro. Lleva su numeración de lámina delante porque es el mismo
 * detalle tipográfico que ordena la página entera, y porque un número da al ojo
 * un ancla estable cuando las etiquetas tienen largos muy distintos.
 */
function FiltroChip({
  activo,
  onClick,
  numero,
  label,
}: {
  activo: boolean;
  onClick: () => void;
  numero: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cx(
        "motion-fast inline-flex items-center gap-2 rounded-control border px-3.5 py-2 type-small transition-[background-color,border-color,color]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        activo
          ? "border-brand-strong bg-brand-strong text-primary-foreground shadow-control"
          : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
      )}
    >
      <span className="type-sheet-number opacity-70">{numero}</span>
      {label}
    </button>
  );
}
