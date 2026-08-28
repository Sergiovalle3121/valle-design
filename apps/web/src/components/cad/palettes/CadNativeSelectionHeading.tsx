"use client";

import { Spline } from "lucide-react";
import { cadTypeName } from "@/lib/cad/entity-labels";

/**
 * LA CABECERA DEL PANEL DE PROPIEDADES NATIVAS.
 *
 * ── LAS DOS PALABRAS, Y POR QUÉ HACEN FALTA LAS DOS ─────────────────────────
 * Antes decía `CIRCLE`: el tipo crudo, en inglés, en un producto en español.
 * La ola de nombres humanos lo cambió por `CÍRCULO` y eso destapó lo que
 * faltaba en el otro extremo — este panel presume, literalmente debajo de esta
 * línea, de «geometría canónica … DXF sin aproximación persistida», y el tipo
 * DXF es el dato que sostiene esa promesa: es lo que el profesional encontrará
 * dentro del fichero, lo que nombra un manual y lo que escribe en una consulta.
 *
 * Así que se enseñan los dos, con jerarquía: el nombre en español manda y el
 * tipo canónico va al lado como etiqueta técnica. Es exactamente lo que hace la
 * paleta de propiedades de cualquier CAD localizado.
 *
 * ── POR QUÉ VIVE FUERA DEL MONOLITO ─────────────────────────────────────────
 * Porque `Layout3DEditor.tsx` sólo puede encoger y el gate lo dijo en el
 * momento exacto: al añadir la etiqueta el archivo se pasó cuatro líneas de su
 * asignación. La instrucción del gate es «mueve el código nuevo a un módulo
 * aparte», y esta cabecera —presentación pura, sin estado— es justo lo que
 * nunca debió estar dentro.
 */
export function CadNativeSelectionHeading({
  type,
  count,
}: {
  /** El tipo de la entidad principal designada; `null` en selección múltiple. */
  type: string | null;
  count: number;
}) {
  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <Spline className="h-4 w-4 text-primary-ink" />
        <span className="text-sm font-semibold">
          {type ? cadTypeName(type).toUpperCase() : `${count} curvas nativas`}
        </span>
        {type ? (
          <span
            title="Tipo de entidad DXF"
            className="rounded border border-border px-1.5 py-px type-micro tracking-wide text-muted-foreground"
          >
            {type.toUpperCase()}
          </span>
        ) : null}
      </div>
      <div className="mb-3 type-micro text-muted-foreground dark:text-muted-foreground">
        Geometría canónica · selección, grips, snaps y DXF sin aproximación
        persistida.
      </div>
    </>
  );
}
