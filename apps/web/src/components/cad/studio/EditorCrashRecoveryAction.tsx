"use client";

/**
 * T-72(h): la acción de recuperación que la frontera de error del editor
 * ofrece como `extraActions` (`ErrorBoundary`, `components/ui/`).
 *
 * No promete el teclazo más reciente sin guardar: eso vive dentro del estado
 * de `Layout3DEditor`, fuera de alcance desde aquí a propósito (§5.3 de la
 * campaña — el monolito sólo lo toca F1). Lo que SÍ ofrece, con evidencia:
 * el último documento del diario de recuperación (IndexedDB,
 * `lib/cad/cad-recovery.ts`) — el mismo que ya escribe la cola de checkpoint
 * mientras el documento está sucio, y el que
 * `wrapDocumentPortForCrashRecovery` (`crash-recovery-port.ts`) refuerza en
 * el instante del fallo con el último contenido que de verdad viajó hacia el
 * servidor. Cuando no hay ninguno de los dos, lo dice: fix-or-hide, nunca un
 * botón que promete y no entrega.
 *
 * `loadCadRecovery` y `exportCadDocumentDxf` llegan por `import()` DENTRO del
 * manejador de clic, no como import estático: el gate de presupuesto de
 * bytes (`scripts/perf/bundle-budget.mjs`) cazó que arrastrarlos aquí subía
 * el JS de primera carga de `/studio/demo-123` en +26,7 KB gzip por encima
 * de su techo — el escritor DXF completo y el códec del diario de
 * recuperación son justo el peso que no debería pagar CUALQUIER visita al
 * estudio por una acción que sólo existe cuando el editor ya se cayó.
 */
import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";
import type { CadRecoveryScope } from "@/lib/cad/cad-recovery";
import type { CadDxfDocumentExportSource } from "@/lib/cad/dxf-document-export";

type RecoveryState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "ready"; savedAt: string }
  | { kind: "error" };

export function EditorCrashRecoveryAction({
  scope,
}: {
  scope: CadRecoveryScope | null;
}) {
  const [state, setState] = useState<RecoveryState>({ kind: "idle" });

  if (!scope) return null;

  const descargar = async () => {
    setState({ kind: "loading" });
    try {
      const [{ loadCadRecovery }, { exportCadDocumentDxf }] = await Promise.all([
        import("@/lib/cad/cad-recovery"),
        import("@/lib/cad/dxf-document-export"),
      ]);
      const record = await loadCadRecovery(scope);
      if (!record) {
        setState({ kind: "none" });
        return;
      }
      const exported = exportCadDocumentDxf(
        record.document as unknown as CadDxfDocumentExportSource,
      );
      const blob = new Blob([exported.content], { type: "application/dxf" });
      const url = URL.createObjectURL(blob);
      try {
        const link = window.document.createElement("a");
        link.href = url;
        link.download = `recuperacion-${record.savedAt.replace(/[:.]/g, "-")}.dxf`;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      setState({ kind: "ready", savedAt: record.savedAt });
    } catch {
      setState({ kind: "error" });
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="secondary"
        size="sm"
        onClick={descargar}
        loading={state.kind === "loading"}
        iconLeft={<Download aria-hidden="true" className="h-4 w-4" />}
      >
        Descargar el último punto de recuperación (DXF)
      </Button>
      {state.kind === "ready" ? (
        <p className="type-small text-muted-foreground">
          Es el estado guardado el {new Date(state.savedAt).toLocaleString("es-MX")}. Puede no
          incluir tus últimos cambios sin guardar.
        </p>
      ) : null}
      {state.kind === "none" ? (
        <p className="type-small text-muted-foreground">
          No hay ningún punto de recuperación guardado para este documento en este equipo.
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className="type-small text-danger-ink">
          No se pudo leer el punto de recuperación. Tu documento en el servidor no se ha tocado.
        </p>
      ) : null}
    </div>
  );
}
