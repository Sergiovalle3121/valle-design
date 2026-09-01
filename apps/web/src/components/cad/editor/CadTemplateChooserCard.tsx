"use client";

import { Stamp } from "lucide-react";
import {
  CAD_LAYOUT_TEMPLATES,
  type CadLayoutTemplateId,
} from "@/lib/cad/templates";

/**
 * La tarjeta «Plantillas CAD» del panel de equipamiento, extraída del
 * monolito con un propósito de BUNDLE, no de estética: este módulo es el
 * único del estudio que importa `@/lib/cad/templates` (4.900+ líneas de
 * datos de 149 plantillas) de forma estática, y el monolito lo carga con
 * `next/dynamic` — así el catálogo viaja en su propio chunk y abrir un plano
 * existente no lo descarga. La aplicación de la plantilla sigue siendo del
 * editor (`onApply`): aquí sólo se elige.
 */
export default function CadTemplateChooserCard({
  onApply,
}: {
  onApply: (templateId: CadLayoutTemplateId) => void;
}) {
  return (
    <div className="mb-3 rounded-xl border border-indigo-400/15 bg-indigo-400/[0.05] p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 type-micro uppercase tracking-wide text-primary-ink">
          <Stamp className="h-3.5 w-3.5" /> Plantillas CAD
        </div>
        <span className="type-micro text-primary-ink">
          {CAD_LAYOUT_TEMPLATES.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {CAD_LAYOUT_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => onApply(template.id)}
            title={template.description}
            className="rounded-lg bg-indigo-400/[0.08] px-2 py-1.5 text-left type-micro text-primary-ink hover:bg-indigo-400/[0.14]"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{template.label}</span>
              <span className="shrink-0 type-micro text-primary-ink">
                {template.assets.length} obj
              </span>
            </span>
            <span className="mt-0.5 block truncate type-micro text-primary-ink">
              {template.category} · {template.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
