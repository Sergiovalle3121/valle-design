"use client";

import { useEffect, useState } from "react";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import { formatRegionDateTime } from "@/lib/cad/region";
import { getClientRegion } from "@/lib/cad/region/client";

/**
 * T-62(a) — LA BITÁCORA QUE SE ESCRIBÍA Y NADIE PODÍA LEER.
 *
 * `DesignAuditLog.record()` llevaba desde Fase 3 registrando cada guardado y
 * archivado de un documento; no existía ninguna pantalla que lo devolviera.
 * «El cliente no puede ver quién tocó sus planos» era el bloqueante que esta
 * ficha cierra — este panel es esa pantalla, y vive en `/equipo` porque es
 * la bitácora de la ORGANIZACIÓN, no de la cuenta personal de nadie.
 */

const ACCION: Record<string, string> = {
  cad_document_saved: "Guardó un documento",
  cad_document_archived: "Archivó un documento",
  cad_document_created: "Creó un documento",
};

const fecha = (iso: string) =>
  formatRegionDateTime(new Date(iso), getClientRegion(), {
    dateStyle: "medium",
    timeStyle: "short",
  });

export function AuditLogPanel({ organizationId }: { organizationId: string }) {
  const [items, setItems] = useState<Array<{
    id: string;
    actor: string | null;
    action: string;
    referenceType: string | null;
    referenceId: string | null;
    createdAt: string;
  }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const resultado =
          await designClient.organizations.auditLog(organizationId);
        if (controller.signal.aborted) return;
        setItems(resultado.items);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof DesignApiError
            ? "No se pudo leer la bitácora."
            : "No se pudo leer la bitácora. Revisa tu conexión.",
        );
      }
    })();
    return () => controller.abort();
  }, [organizationId]);

  if (error) {
    return (
      <p role="alert" className="type-small text-danger-ink">
        {error}
      </p>
    );
  }

  if (items === null) {
    return <p className="type-small text-muted-foreground">Cargando…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="type-small text-muted-foreground">
        Todavía no hay nada registrado en esta organización.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border" data-testid="audit-log-list">
      {items.map((entry) => (
        <li key={entry.id} className="flex gap-4 py-3">
          <span className="type-sheet-number shrink-0 pt-0.5 text-muted-foreground">
            {fecha(entry.createdAt)}
          </span>
          <span className="type-small text-foreground">
            {entry.actor ?? "El sistema"} ·{" "}
            {ACCION[entry.action] ?? entry.action}
          </span>
        </li>
      ))}
    </ul>
  );
}
