"use client";

/**
 * T-75(g): borrar un plano desde el tablero, fuera de `page.tsx`.
 *
 * Igual que `import-status.tsx` (ver su cabecera): `dashboard/page.tsx`
 * está sujeto al presupuesto de 800 líneas de `check-monolith-budget.mjs`
 * para todo archivo no presupuestado, y esta ficha la habría pasado de
 * largo. Lo que se mueve es el estado y la confirmación del borrado —que no
 * decide nada del resto de la página—; lo que se queda en `page.tsx` es
 * sólo el botón por tarjeta y el permiso que lo gatea.
 *
 * `DELETE /v1/cad/documents/:documentId` exige `cad:admin`, no `cad:edit`:
 * un editor cualquiera no puede borrar el plano de otro. Antes de esto,
 * `documentsRepository.archive`/`designClient.documents.archive` no tenía
 * NINGÚN llamador de producto — nadie podía borrar un plano desde la
 * interfaz.
 */
import { useState } from "react";
import type { CadDocumentSummary } from "@valle/design-sdk";
import { Button, Modal } from "@/components/ui";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";

export function useArchiveDocument(onArchived: (documentId: string) => void) {
  const [target, setTarget] = useState<CadDocumentSummary | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!target) return;
    setArchiving(true);
    setError(null);
    try {
      await designClient.documents.archive(target.id);
      onArchived(target.id);
      setTarget(null);
    } catch (cause) {
      setError(
        cause instanceof DesignApiError && cause.status === 403
          ? "Tu rol no tiene permiso para borrar documentos."
          : cause instanceof Error
            ? cause.message
            : "No se pudo borrar el documento.",
      );
    } finally {
      setArchiving(false);
    }
  };

  return { target, setTarget, archiving, error, confirm };
}

export function ArchiveDocumentDialog({
  target,
  archiving,
  error,
  onCancel,
  onConfirm,
}: {
  target: CadDocumentSummary | null;
  archiving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={target !== null}
      onClose={() => {
        if (!archiving) onCancel();
      }}
      title={target ? `¿Borrar «${target.name}»?` : "¿Borrar el documento?"}
      description="Se ocultará de tu tablero. Su historial y las láminas ya publicadas se conservan; para verlo de nuevo, pide que un administrador lo restaure desde el servidor."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={archiving}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={archiving}>
            Borrar
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="type-small text-danger-ink">
          {error}
        </p>
      )}
    </Modal>
  );
}
