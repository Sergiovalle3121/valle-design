"use client";

import { Spline } from "lucide-react";
import { cadTypeName } from "@/lib/cad/entity-labels";
import { useCadUiMode } from "@/components/cad/shell/ui-mode-host";

/**
 * LA CABECERA DEL PANEL DE PROPIEDADES NATIVAS.
 *
 * ── LAS DOS PALABRAS, Y POR QUÉ HACEN FALTA LAS DOS ─────────────────────────
 * Antes decía `CIRCLE`: el tipo crudo, en inglés, en un producto en español.
 * La ola de nombres humanos lo cambió por `CÍRCULO`. En Pro, el tipo DXF va
 * al lado como dato técnico: es lo que el profesional encontrará en el archivo
 * y lo que nombra un manual. La frase sobre el motor interno no ayuda a leer
 * ni editar un objeto, así que no aparece en el panel.
 *
 * El nombre en español manda y el tipo canónico queda como etiqueta técnica.
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
  // En Esencial la ficha humana de abajo ya dice «Muro 1» o «3 muros».
  // Este encabezado conserva el tipo DXF para quien lo necesita en Pro.
  const mode = useCadUiMode();
  if (mode === "esencial") return null;
  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <Spline className="h-4 w-4 text-primary-ink" />
        <span className="text-sm font-semibold">
          {type ? cadTypeName(type).toUpperCase() : `${count} objetos seleccionados`}
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
    </>
  );
}
