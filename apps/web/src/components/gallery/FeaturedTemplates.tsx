/**
 * Las plantillas destacadas de la portada: ocho giros distintos, cada plano
 * dibujado por el motor. Servidor puro y cero JavaScript — la retícula entera
 * es enlaces e imágenes lazy; el catálogo completo con búsqueda vive en
 * /plantillas y este bloque es su escaparate.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PlanRender } from "./PlanRender";
import { buttonClass } from "@/components/ui";
import {
  FEATURED_TEMPLATE_IDS,
  galleryTemplate,
} from "@/lib/marketing/template-gallery";

export function FeaturedTemplates({ total }: { total: number }) {
  const featured = FEATURED_TEMPLATE_IDS.flatMap((id) => {
    const template = galleryTemplate(id);
    return template ? [template] : [];
  });
  return (
    <div className="mt-12">
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {featured.map((template) => (
          <li key={template.id}>
            <Link
              href={`/plantillas/${template.id}`}
              className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-card transition-[border-color,box-shadow,transform] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated"
            >
              <PlanRender
                id={template.id}
                label={template.label}
                widthM={template.widthM}
                heightM={template.heightM}
                sizes="(min-width: 1024px) 25vw, 50vw"
                className="block border-b border-border"
              />
              <span className="flex flex-1 flex-col p-4">
                <span className="type-micro text-primary-ink">{template.giroLabel}</span>
                <span className="mt-1 text-sm font-semibold text-foreground">
                  {template.label}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <Link
          href="/plantillas"
          className={buttonClass({ variant: "secondary", size: "lg" })}
          data-testid="featured-templates-cta"
        >
          Ver las {total} plantillas
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
