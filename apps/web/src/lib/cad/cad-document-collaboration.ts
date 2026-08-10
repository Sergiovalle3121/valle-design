/**
 * Vocabulario de COLABORACIÓN del documento canónico: versiones, hilos de
 * revisión, enlaces de sólo lectura y auditoría.
 *
 * Sale de `cad-document.ts` por el trinquete de tamaño —aquel archivo sólo puede
 * encoger y el esquema 5 le añade dos entidades—, y sale entero porque es una
 * pieza con frontera propia: nada de esto es geometría, todo se persiste en la
 * misma sección `collaboration` y todo lo consume el mismo módulo
 * (`cad-collaboration.ts`).
 *
 * Su único import es `import type`, que se borra al compilar, así que este
 * módulo es una HOJA del grafo de carga aunque nombre a `CadDocument`. La
 * referencia circular es de TIPOS y no existe en tiempo de ejecución.
 *
 * `cad-document.ts` lo reexporta: ningún consumidor cambia de import.
 */
import type { CadDocument, CadPoint2 } from "./cad-document";

export type CadReviewThreadStatus = "open" | "resolved";

export interface CadReviewThread {
  id: string;
  entityId?: string;
  body: string;
  author: string;
  assignedTo?: string;
  status: CadReviewThreadStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  markup?: {
    kind: "note" | "arrow" | "cloud";
    point?: CadPoint2;
    color: string;
  };
}

/**
 * Metadato NO SENSIBLE de un review link. El token NUNCA vive aquí: lo genera
 * el servidor al crear la sesión de revisión (`POST /v1/cad/documents/:id/
 * review-sessions`), sólo se persiste su sha256 en `cad_review_sessions.
 * token_hash` y su valor en claro aparece UNA vez, en esa respuesta.
 *
 * `id` es el id de la sesión de revisión server-owned — la misma referencia
 * que usan revocación (`/v1/cad/review-sessions/:id/close`) y auditoría.
 * `hasToken` lo escribe la API al redactar documentos heredados que todavía
 * traían el token en claro dentro del JSON.
 */
export interface CadReviewLink {
  id: string;
  label: string;
  readOnly: true;
  createdAt: string;
  createdBy: string;
  expiresAt?: string;
  revokedAt?: string;
  hasToken?: boolean;
}

export interface CadCollaborationAuditEvent {
  id: string;
  action:
    | "version_created"
    | "merge_applied"
    | "comment_added"
    | "comment_resolved"
    | "review_link_created"
    | "review_link_revoked";
  actor: string;
  at: string;
  detail: string;
  entityIds?: string[];
}

export interface CadVersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  createdBy: string;
  contentHash: string;
  /** Full canonical content without collaboration recursion. */
  document: Omit<CadDocument, "collaboration">;
}

export interface CadCollaborationState {
  versions: CadVersionSnapshot[];
  threads: CadReviewThread[];
  reviewLinks: CadReviewLink[];
  audit: CadCollaborationAuditEvent[];
}

