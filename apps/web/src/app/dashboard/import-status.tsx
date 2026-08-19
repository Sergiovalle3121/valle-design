"use client";

/**
 * El progreso y el desenlace de una importación, fuera de la página.
 *
 * No es una separación estética: `dashboard/page.tsx` está sujeto al
 * presupuesto de tamaño que `check-monolith-budget.mjs` aplica a todo archivo no
 * presupuestado (800 líneas), y la página ya lo rozaba. Lo que se mueve es lo
 * que NO decide nada —pintar el estado de la importación y comprimir— y se
 * queda en la página lo que sí: qué se crea, con qué plantilla y con qué
 * permiso.
 */
import { X } from "lucide-react";
import { CadDxfImportReportPanel } from "@/components/cad/interop/CadDxfImportReport";
import type { DocumentImportReport } from "@/lib/cad/document-import";

export type ImportState =
  | { status: "idle" }
  | {
      status: "running";
      progress: number;
      stage: string;
      canCancel: boolean;
    }
  | {
      status: "success";
      report: DocumentImportReport;
      documentId: string;
    }
  | { status: "error"; message: string };

export function ImportStatus({
  state,
  onCancel,
  onOpen,
}: {
  state: ImportState;
  onCancel: () => void;
  onOpen: (documentId: string) => void;
}) {
  if (state.status === "idle") return null;
  if (state.status === "running") {
    return (
      <div className="mt-3 rounded-xl bg-indigo-500/10 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span role="status">{state.stage}</span>
          {state.canCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 text-xs"
            >
              <X className="h-3 w-3" /> Cancelar
            </button>
          )}
        </div>
        <progress
          aria-label="Progreso de importación"
          className="mt-2 w-full"
          max={1}
          value={state.progress}
        />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm">
        {state.message}
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm">
      <p role="status">
        Importado: {state.report.importedEntityCount} entidades y{" "}
        {state.report.importedBlockCount} bloques.
      </p>
      {/*
        El informe en español manda cuando existe. La lista cruda de códigos se
        queda SÓLO para el JSON canónico, que no pasa por el lector DXF y cuyas
        incidencias son de esquema, no de fidelidad.
      */}
      {state.report.dxfReport ? (
        <div className="mt-2">
          <CadDxfImportReportPanel report={state.report.dxfReport} />
        </div>
      ) : (
        state.report.warnings.length > 0 && (
          <details className="mt-2">
            <summary>
              {state.report.warnings.length} advertencias de interoperabilidad
            </summary>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {state.report.warnings.slice(0, 6).map((warning, index) => (
                <li key={`${warning.code}:${index}`}>{warning.message}</li>
              ))}
            </ul>
          </details>
        )
      )}
      <button
        type="button"
        onClick={() => onOpen(state.documentId)}
        className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 text-white"
      >
        Abrir documento importado
      </button>
    </div>
  );
}

/**
 * Comprime el documento serializado para la vía de archivo.
 *
 * Falla CERRADO y con un mensaje accionable si el navegador no trae
 * `CompressionStream`: un `catch` silencioso enviaría el JSON sin comprimir y el
 * servidor lo rechazaría por tamaño con un error que no dice nada.
 */
export async function gzipDocument(serialized: string): Promise<Blob> {
  if (typeof CompressionStream === "undefined") {
    throw new Error(
      "Este navegador no puede comprimir documentos grandes. Actualízalo o importa un archivo menor de 1 MB.",
    );
  }
  const compressed = new Blob([serialized])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(compressed).arrayBuffer()], {
    type: "application/gzip",
  });
}

export function abortError(): DOMException {
  return new DOMException("Importación cancelada.", "AbortError");
}
