"use client";

import type { CadHumanPropertyModel } from "./human-property-model";

/** Vista breve y de sólo lectura; la edición exacta sigue en Detalles técnicos. */
export function CadHumanProperties({ model }: { model: CadHumanPropertyModel }) {
  return (
    <section data-testid="cad-human-properties" className="mb-3 rounded-card border border-border bg-surface p-3">
      <h3 className="mb-3 type-heading text-foreground">{model.heading}</h3>
      <dl className="grid grid-cols-2 gap-2">
        {model.fields.map((field) => (
          <div key={field.key} data-testid={`cad-human-property-${field.key}`} className="min-w-0 rounded-control bg-muted/40 p-2">
            <dt className="type-micro text-muted-foreground">{field.label}</dt>
            <dd className="mt-1 flex items-center gap-2 break-words type-small text-foreground">
              {field.swatch ? <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ backgroundColor: field.swatch }} /> : null}
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
