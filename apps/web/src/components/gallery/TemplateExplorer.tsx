"use client";

/**
 * El escaparate de plantillas: búsqueda y filtro por giro SIN servidor.
 *
 * Son 149 fichas de texto plano (los planos llegan lazy por <img>): filtrar en
 * memoria es instantáneo y funciona sin red. El estado vive en la URL
 * (`?giro=`, `?q=`) para que un enlace filtrado se pueda COMPARTIR — un
 * directorio que no se puede enlazar por giro no sirve como catálogo.
 *
 * Accesibilidad deliberada:
 * · el contador de resultados es `aria-live=polite`: quien filtra con lector
 *   de pantalla oye cuántas quedan, sin que cada tecleo interrumpa;
 * · los filtros son botones con `aria-pressed`, no enlaces disfrazados;
 * · cada tarjeta es UN enlace con el nombre como texto — nada de tarjetas
 *   clicables enteras con spans anidados que el foco no sabe leer.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { PlanRender } from "./PlanRender";
import { cx, focusRing } from "@/components/ui/styles";
import {
  TEMPLATE_GIROS,
  type GalleryTemplate,
  type TemplateGiro,
} from "@/lib/marketing/template-giros";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function TemplateExplorer({ templates }: { templates: GalleryTemplate[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const giroInicial = params.get("giro") as TemplateGiro | null;
  const [giro, setGiro] = useState<TemplateGiro | null>(
    giroInicial && TEMPLATE_GIROS.some((item) => item.id === giroInicial)
      ? giroInicial
      : null,
  );
  const [query, setQuery] = useState(params.get("q") ?? "");
  const deferredQuery = useDeferredValue(query);

  const visibles = useMemo(() => {
    const needle = normalize(deferredQuery.trim());
    return templates.filter((template) => {
      if (giro && template.giro !== giro) return false;
      if (!needle) return true;
      return normalize(
        `${template.label} ${template.description} ${template.giroLabel}`,
      ).includes(needle);
    });
  }, [templates, giro, deferredQuery]);

  const syncUrl = (nextGiro: TemplateGiro | null, nextQuery: string) => {
    const search = new URLSearchParams();
    if (nextGiro) search.set("giro", nextGiro);
    if (nextQuery.trim()) search.set("q", nextQuery.trim());
    const qs = search.toString();
    router.replace(qs ? `/plantillas?${qs}` : "/plantillas", { scroll: false });
  };

  return (
    <div data-testid="template-explorer">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full max-w-md">
          <span className="sr-only">Buscar plantilla</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              syncUrl(giro, event.target.value);
            }}
            placeholder="Busca tu giro: taquería, consultorio, bodega…"
            data-testid="template-search"
            className={cx(
              "w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
              focusRing,
            )}
          />
        </label>
        <p aria-live="polite" className="type-small text-muted-foreground">
          {visibles.length} de {templates.length} plantillas
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar por giro">
        <button
          type="button"
          aria-pressed={giro === null}
          onClick={() => {
            setGiro(null);
            syncUrl(null, query);
          }}
          className={cx(
            "rounded-full border px-3.5 py-1.5 type-small transition-colors duration-150",
            focusRing,
            giro === null
              ? "border-transparent bg-brand-strong text-primary-foreground"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          Todas
        </button>
        {TEMPLATE_GIROS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={giro === item.id}
            onClick={() => {
              const next = giro === item.id ? null : item.id;
              setGiro(next);
              syncUrl(next, query);
            }}
            className={cx(
              "rounded-full border px-3.5 py-1.5 type-small transition-colors duration-150",
              focusRing,
              giro === item.id
                ? "border-transparent bg-brand-strong text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.map((template) => (
          <li key={template.id} className="group">
            <Link
              href={`/plantillas/${template.id}`}
              className={cx(
                "flex h-full flex-col overflow-hidden rounded-card border border-border bg-card transition-[border-color,box-shadow,transform] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated",
                focusRing,
              )}
            >
              <PlanRender
                id={template.id}
                label={template.label}
                widthM={template.widthM}
                heightM={template.heightM}
                sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw"
                className="block border-b border-border"
              />
              <span className="flex flex-1 flex-col p-5">
                <span className="type-micro text-primary-ink">{template.giroLabel}</span>
                <span className="mt-1.5 font-semibold text-foreground">{template.label}</span>
                <span className="type-small mt-1.5 text-muted-foreground">
                  {template.widthM} × {template.heightM} m · {template.objects} objetos
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {visibles.length === 0 ? (
        <p className="mt-10 type-lead text-muted-foreground">
          Ninguna plantilla responde a «{query}». Prueba con el giro más
          cercano — todas se pueden adaptar: los muros, capas y cotas son
          editables.
        </p>
      ) : null}
    </div>
  );
}
