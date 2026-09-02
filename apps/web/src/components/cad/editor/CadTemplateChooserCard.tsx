"use client";

import { Stamp } from "lucide-react";
import { CAD_LAYOUT_TEMPLATE_CATALOG } from "@/lib/cad/templates-catalog";
import type { CadLayoutTemplateId } from "@/lib/cad/templates";

/**
 * La tarjeta «Plantillas CAD» del panel de equipamiento, extraída del
 * monolito con un propósito de BUNDLE, no de estética. Primero se cargó con
 * `next/dynamic` para que `@/lib/cad/templates` (4.900+ líneas de datos de
 * 149 plantillas) viajara en su propio chunk; no bastó: la tarjeta se monta
 * al abrir el estudio, así que ese chunk se descargaba igual — 306 KB de los
 * 4.313 KB medidos el 2026-09-02 con source maps. Ahora lee el CATÁLOGO
 * generado (`templates-catalog.ts`: etiqueta, grupo, descripción y número de
 * objetos, 45 KB de fuente) y el cuerpo de las plantillas sólo lo carga el
 * editor con `import()` al aplicar una (`onApply`): aquí sólo se elige.
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
          {CAD_LAYOUT_TEMPLATE_CATALOG.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {CAD_LAYOUT_TEMPLATE_CATALOG.map((template) => (
          <button
            key={template.id}
            onClick={() => onApply(template.id)}
            title={template.description}
            className="rounded-lg bg-indigo-400/[0.08] px-2 py-1.5 text-left type-micro text-primary-ink hover:bg-indigo-400/[0.14]"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{template.label}</span>
              <span className="shrink-0 type-micro text-primary-ink">
                {template.assetCount} obj
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
