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
import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { CadDocumentInline, CadDocumentSummary } from "@valle/design-sdk";
import { CadDxfImportReportPanel } from "@/components/cad/interop/CadDxfImportReport";
import type { DocumentImportReport } from "@/lib/cad/document-import";
import { importDocumentFile } from "@/lib/cad/document-import-client";
import { designClient } from "@/lib/cad/repositories/client";

export type ImportState =
  | { status: "idle" }
  | {
      status: "running";
      progress: number;
      stage: string;
      canCancel: boolean;
    }
  | {
      /**
       * T-75(f): la importación no rechaza sola al primer atasco — se
       * queda aquí hasta que la persona decide. `progress`/`stage` son los
       * últimos que se vieron, para no perder el contexto de dónde se
       * quedó.
       */
      status: "stalled";
      progress: number;
      stage: string;
      onKeepWaiting: () => void;
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
  if (state.status === "stalled") {
    return (
      <div role="alert" className="mt-3 rounded-xl bg-warning/10 p-3 text-sm">
        <p className="text-warning-ink">
          «{state.stage}» no avanzó en un rato. El archivo puede ser grande y
          seguir procesándose, o el navegador puede haberse quedado sin
          responder.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={state.onKeepWaiting}
            className="rounded-lg bg-warning/20 px-3 py-1.5 font-semibold text-warning-ink"
          >
            Seguir esperando
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
          >
            <X className="h-3 w-3" /> Cancelar
          </button>
        </div>
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

/**
 * El flujo entero de importar un archivo, movido de `page.tsx` por la misma
 * razón que el resto del módulo: no decide QUÉ se importa (eso sigue en la
 * página: selección de proyecto, permiso, plantilla), sólo CÓMO se sigue su
 * progreso hasta convertirse en un documento guardado.
 *
 * T-75(f): el reloj de la importación es de ATASCO, no de plazo total
 * (`document-import-client.ts`, `createStallWatchdog`) — `onStalled` deja
 * la decisión de seguir esperando o cancelar en manos de la persona, en vez
 * de rechazar sola.
 */
export function useImportDocument({
  canEdit,
  selectedProject,
  busy,
  setBusy,
  onImported,
}: {
  canEdit: boolean;
  selectedProject: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onImported: (document: CadDocumentSummary) => void;
}) {
  const [importState, setImportState] = useState<ImportState>({ status: "idle" });
  const importAbort = useRef<AbortController | null>(null);

  const importDocument = async (
    file: File,
    sidecars: { shx?: File; dbf?: File; prj?: File; cpg?: File } = {},
  ) => {
    if (!canEdit || !selectedProject || busy) return;
    const controller = new AbortController();
    importAbort.current?.abort();
    importAbort.current = controller;
    setBusy(true);
    setImportState({
      status: "running",
      progress: 0,
      stage: "Preparando importación",
      canCancel: true,
    });
    let created: CadDocumentSummary | null = null;
    let lastStage = "Preparando importación";
    let lastProgress = 0;
    try {
      const report = await importDocumentFile(file, {
        sidecars,
        signal: controller.signal,
        onProgress: (progress, stage) => {
          lastStage = stage;
          lastProgress = progress * 0.65;
          setImportState({
            status: "running",
            progress: lastProgress,
            stage: lastStage,
            canCancel: true,
          });
        },
        onStalled: (resume) =>
          setImportState({
            status: "stalled",
            progress: lastProgress,
            stage: lastStage,
            onKeepWaiting: () => {
              resume();
              setImportState({
                status: "running",
                progress: lastProgress,
                stage: lastStage,
                canCancel: true,
              });
            },
          }),
      });
      if (controller.signal.aborted) throw abortError();
      setImportState({
        status: "running",
        progress: 0.7,
        stage: "Creando documento",
        canCancel: false,
      });
      created = await designClient.documents.create({
        name: file.name
          .replace(/\.[^.]+$/, "")
          .trim()
          .slice(0, 160),
        projectId: selectedProject,
      });

      const { serializeCadDocument } = await import("@/lib/cad/cad-document");
      const serialized = serializeCadDocument(report.document);
      const serializedBytes = new Blob([serialized]).size;
      if (serializedBytes > 1_000_000) {
        setImportState({
          status: "running",
          progress: 0.82,
          stage: "Comprimiendo documento grande",
          canCancel: false,
        });
        const archive = await gzipDocument(serialized);
        await designClient.documents.saveArchive(created.id, archive, 0);
      } else {
        setImportState({
          status: "running",
          progress: 0.86,
          stage: "Guardando contenido",
          canCancel: false,
        });
        await designClient.documents.saveContent(
          created.id,
          report.document as unknown as CadDocumentInline,
          0,
        );
      }
      onImported(created);
      setImportState({
        status: "success",
        report,
        documentId: created.id,
      });
    } catch (error) {
      let rollbackFailed = false;
      if (created) {
        try {
          await designClient.documents.discardProvisional(created.id);
        } catch {
          rollbackFailed = true;
        }
      }
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Importación cancelada."
          : error instanceof Error
            ? error.message
            : "No se pudo importar el documento.";
      setImportState({
        status: "error",
        message: rollbackFailed
          ? `${message} No se pudo descartar el documento provisional; revisa el dashboard.`
          : message,
      });
    } finally {
      if (importAbort.current === controller) importAbort.current = null;
      setBusy(false);
    }
  };

  return {
    importState,
    importDocument,
    cancelImport: () => importAbort.current?.abort(),
  };
}
