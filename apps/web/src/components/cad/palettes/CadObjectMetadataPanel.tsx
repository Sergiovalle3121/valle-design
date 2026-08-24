"use client";

import { ReadField } from "@/components/cad/studio/field-controls";
import type { CadObjectProperties } from "@/lib/cad/object-properties";

export interface CadObjectMetadataPanelProps {
  properties: CadObjectProperties | null;
}

export function CadObjectMetadataPanel({
  properties,
}: CadObjectMetadataPanelProps) {
  if (!properties) return null;
  return (
    <div className="rounded-lg border border-border bg-surface/80 p-2">
      <div className="mb-2 type-micro uppercase tracking-wide text-muted-foreground">
        Metadata CAD
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ReadField
          label="Centro"
          value={`${Math.round(properties.center.x)}, ${Math.round(properties.center.y)}`}
        />
        <ReadField
          label="Origen"
          value={
            properties.source.source === "dxf"
              ? "DXF editable"
              : properties.source.source === "generated"
                ? "Generado"
                : "Manual"
          }
        />
        {properties.source.dxfLayer && (
          <ReadField label="DXF layer" value={properties.source.dxfLayer} />
        )}
        <ReadField label="Safety" value={properties.safetyClassification} />
      </div>
      {properties.architecture && (
        <div className="mt-2 rounded-lg border border-slate-300/10 bg-slate-300/[0.04] p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="type-micro uppercase tracking-wide text-slate-300">
              Engineering CAD
            </span>
            <span className="rounded-full bg-muted/60 px-1.5 py-0.5 type-micro text-slate-200">
              {properties.architecture.role}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {properties.architecture.technical.slice(0, 4).map((item) => (
              <ReadField
                key={`${item.label}-${item.value}`}
                label={item.label}
                value={item.value}
              />
            ))}
          </div>
        </div>
      )}
      {properties.warnings.length > 0 && (
        <div className="mt-2 rounded-md border border-amber-300/15 bg-amber-400/[0.06] px-2 py-1 type-micro text-warning-ink">
          {properties.warnings[0]}
        </div>
      )}
    </div>
  );
}
