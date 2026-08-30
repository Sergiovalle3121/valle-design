"use client";

/**
 * Búsqueda de soporte: UN campo sobre el centro de preguntas Y las guías.
 *
 * Quien llega a soporte trae una pregunta, no ganas de navegar categorías.
 * El índice es el mismo texto que ya viaja a la portada y al JSON-LD
 * (lib/marketing/faq.ts) más las guías de documentación — cero copias
 * nuevas del contenido, cero servidor: son ~40 textos y filtrar en memoria
 * es instantáneo.
 */
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cx, focusRing } from "@/components/ui/styles";
import { DOC_GUIDES, docGuidePath } from "@/config/site-routes";
import { FAQ_ENTRIES } from "@/lib/marketing/faq";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

interface Hit {
  tipo: "pregunta" | "guía";
  titulo: string;
  extracto: string;
  href: string;
}

export function SupportSearch() {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);

  const hits = useMemo<Hit[]>(() => {
    const needle = normalize(deferred.trim());
    if (needle.length < 2) return [];
    const fromFaq = FAQ_ENTRIES.flatMap((entry): Hit[] =>
      normalize(`${entry.pregunta} ${entry.respuesta}`).includes(needle)
        ? [
            {
              tipo: "pregunta",
              titulo: entry.pregunta,
              extracto: `${entry.respuesta.slice(0, 140)}…`,
              href: `/#faq`,
            },
          ]
        : [],
    );
    const fromGuides = DOC_GUIDES.flatMap((guide): Hit[] =>
      normalize(`${guide.title} ${guide.description} ${guide.summary}`).includes(needle)
        ? [
            {
              tipo: "guía",
              titulo: guide.title,
              extracto: guide.summary,
              href: docGuidePath(guide.slug),
            },
          ]
        : [],
    );
    return [...fromGuides, ...fromFaq].slice(0, 8);
  }, [deferred]);

  return (
    <div data-testid="support-search">
      <label className="block">
        <span className="sr-only">Buscar en preguntas y guías</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Busca tu duda: escala, DXF, cotas, imprimir…"
          className={cx(
            "w-full rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground",
            focusRing,
          )}
        />
      </label>
      <p aria-live="polite" className="type-small mt-2 text-muted-foreground">
        {deferred.trim().length < 2
          ? "Busca sobre el centro de preguntas y las guías."
          : `${hits.length} resultado${hits.length === 1 ? "" : "s"}.`}
      </p>
      {hits.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {hits.map((hit) => (
            <li key={`${hit.tipo}-${hit.titulo}`}>
              <Link
                href={hit.href}
                className="group block rounded-card border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-out-expo hover:border-primary/40 hover:shadow-elevated"
              >
                <span className="type-micro text-primary-ink">{hit.tipo}</span>
                <span className="mt-1 flex items-center gap-2 font-medium text-foreground">
                  {hit.titulo}
                  <ArrowRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  />
                </span>
                <span className="type-small mt-1 block text-muted-foreground">
                  {hit.extracto}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
