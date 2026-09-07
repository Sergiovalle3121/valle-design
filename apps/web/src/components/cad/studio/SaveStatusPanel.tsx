"use client";

import { useState } from "react";
import { AlertTriangle, Download, RotateCcw } from "lucide-react";
import { Button, cx } from "@/components/ui";
import type { CadSaveIssueKind } from "./CadSaveStatus";

/**
 * T-75(a): el aviso mejor escrito del producto duraba doce segundos.
 *
 * `describeCadSaveFailure` (`document-lifecycle/save-failure.ts`) escribe
 * tres párrafos completos — qué pasó, qué pasa con tu trabajo, qué puedes
 * hacer — y hasta ahora viajaban en un `toast.error(...)` que se autodestruye
 * a los 12 s. Lo que sobrevive después es la etiqueta de cinco palabras de
 * `CadSaveStatus` ("Error de guardado · cambios pendientes"), con el resto
 * del mensaje escondido en un `title` — un tooltip que en una tableta, sin
 * puntero que pueda posarse, NO EXISTE.
 *
 * Este panel es persistente: se queda en pantalla mientras `issue` no sea
 * `null`, no en un temporizador. No captura el puntero del lienzo —el mismo
 * principio que ya sigue `CadSaveStatus`—: vive anclado, con `pointer-events`
 * normales sólo dentro de su propia tarjeta.
 *
 * `onRetry`/`onExportDxf` son OPCIONALES a propósito: hoy nada en el
 * monolito los pasa (ver la petición F9 con el diff de montaje), así que el
 * panel se degrada a mostrar el texto completo y "Detalles" sin fingir
 * botones que no harían nada. Fix-or-hide aplicado a sus propias acciones.
 */
export interface SaveStatusPanelIssue {
  kind: CadSaveIssueKind;
  /** Encabezado corto. Opcional: hoy `Layout3DEditor.tsx` no lo conserva
   *  (ver la petición); sin él el panel usa un título genérico por tipo. */
  title?: string;
  message: string;
}

const GENERIC_TITLE: Record<CadSaveIssueKind, string> = {
  conflict: "Conflicto de versiones",
  offline: "Sin conexión",
  server: "No se pudo guardar",
};

export function SaveStatusPanel({
  issue,
  onRetry,
  onExportDxf,
  className,
}: {
  issue: SaveStatusPanelIssue | null;
  onRetry?: () => void;
  onExportDxf?: () => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!issue) return null;

  return (
    <div
      role="alert"
      data-testid="cad-save-status-panel"
      data-issue-kind={issue.kind}
      className={cx(
        "pointer-events-auto max-w-sm rounded-card border border-danger/40 bg-danger/[0.06] p-3 shadow-elevated",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="type-small font-semibold text-danger-ink">
            {issue.title ?? GENERIC_TITLE[issue.kind]}
          </p>
          <p
            className={cx(
              "type-small mt-1 text-muted-foreground",
              !expanded && "line-clamp-2",
            )}
          >
            {issue.message}
          </p>
          {issue.message.length > 90 && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="type-small mt-1 font-semibold text-primary-ink underline underline-offset-2"
            >
              {expanded ? "Ocultar detalles" : "Detalles"}
            </button>
          )}
          {(onRetry || onExportDxf) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {onRetry && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRetry}
                  iconLeft={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />}
                >
                  Reintentar
                </Button>
              )}
              {onExportDxf && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onExportDxf}
                  iconLeft={<Download aria-hidden="true" className="h-3.5 w-3.5" />}
                >
                  Exportar DXF
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
