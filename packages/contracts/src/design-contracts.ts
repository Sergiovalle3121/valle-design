/**
 * CONTRATOS v1 DEL PRODUCTO DESIGN (CAD) — Fase 2 de la separación de
 * productos.
 *
 * Tipos MÍNIMOS derivados A MANO de los contratos fuente en
 * `packages/contracts/specs/` (`design-api.v1.yaml` y
 * `design-events.v1.yaml`): identificadores tipados, códigos de evento,
 * permisos `cad:*`, entitlement `design.cad`, códigos de error y límites del
 * documento canónico. Nada de clientes HTTP ni lógica.
 *
 * El SDK completo se genera desde OpenAPI. Este módulo conserva únicamente el
 * subconjunto estable que comparten API, SDK y gates de contrato.
 */

import type { ProductCapabilityId } from "./product-catalog";

/* ───────────────────────── Identificadores tipados ────────────────────────── */

/**
 * Marca nominal para ids: evita pasar un `cadDocumentId` donde se espera un
 * `cadProjectId` sin costo en runtime (sigue siendo string).
 */
type Tagged<TTag extends string> = string & { readonly __tag?: TTag };

export type CadProjectId = Tagged<"CadProjectId">;
export type CadDocumentId = Tagged<"CadDocumentId">;
export type CadPublicationId = Tagged<"CadPublicationId">;
export type CadReviewSessionId = Tagged<"CadReviewSessionId">;
export type CadCommentId = Tagged<"CadCommentId">;
export type CadBlockId = Tagged<"CadBlockId">;

/**
 * Token CAS de concurrencia optimista del documento canónico: entero
 * monótono; 0 = documento nunca guardado.
 */
export type CadDocumentVersionToken = number;

/* ──────────────────── Identificadores LEGADOS persistidos ─────────────────── */

/**
 * Los centinelas del CAD Studio universal (`AXOS-CAD-STUDIO` / `UNIVERSAL`)
 * ya NO se declaran aquí: viven en `./legacy/cad-studio-identifiers`, junto a
 * los demás identificadores que no pueden renombrarse sin migrar datos, y
 * documentados en `./legacy/README.md`.
 *
 * Se re-exportan sin cambiar un solo literal para no romper a los
 * consumidores existentes.
 *
 * @deprecated Importar desde `./legacy` (o desde el subcamino `legacy` del
 * paquete). Esta re-exportación se retira cuando se retire el propio alias,
 * es decir cuando la migración de datos descrita en `legacy/README.md` §1 se
 * haya ejecutado y el conteo de filas con el valor viejo sea cero en todos
 * los entornos. No hay fecha: la condición es el conteo, no el calendario.
 */
export {
  /** @deprecated Usar `legacy/cad-studio-identifiers`. */
  LEGACY_CAD_STUDIO_MODEL,
  /** @deprecated Usar `legacy/cad-studio-identifiers`. */
  LEGACY_CAD_STUDIO_REVISION,
} from "./legacy/cad-studio-identifiers";

/* ─────────────────────── Entitlement y permisos cad:* ─────────────────────── */

/**
 * Entitlement comercial requerido por TODOS los endpoints de la API de
 * Design. Es la capacidad `design.cad` del catálogo de productos; el guard
 * server-side responde `403 entitlement_required` cuando falta.
 */
export const DESIGN_CAD_ENTITLEMENT: ProductCapabilityId = "design.cad";

/**
 * Permisos RBAC granulares del producto Design (v1), derivados de una
 * membresía verificada. No existe traducción de permisos externos o enviados
 * por el cliente.
 */
export const CAD_PERMISSIONS = [
  "cad:view",
  "cad:edit",
  "cad:review",
  "cad:publish",
  "cad:admin",
] as const;

export type CadPermission = (typeof CAD_PERMISSIONS)[number];

export function isCadPermission(value: unknown): value is CadPermission {
  return (
    typeof value === "string" &&
    (CAD_PERMISSIONS as readonly string[]).includes(value)
  );
}

/* ───────────────────────────── Códigos de error ───────────────────────────── */

/**
 * Códigos de error CONTRACTUALES de la API de Design v1 (viajan en el campo
 * `code` del `ApiErrorEnvelope`). Los tres `cad_*` reflejan la semántica CAS
 * real del backend; `entitlement_required` es el 403 estándar.
 */
export const DESIGN_API_ERROR_CODES = [
  /** Falta `expectedCadDocumentVersion` al guardar (400). */
  "cad_document_version_required",
  /** CAS fallido: la versión declarada no es la persistida (409). */
  "cad_document_version_conflict",
  /** Un guardado normal intentó mutar los recibos de publicación (400). */
  "cad_publications_server_managed",
  /** El tenant no tiene `design.cad` vigente o falta el permiso `cad:*` (403). */
  "entitlement_required",
  /** Review link desconocido o malformado (401). */
  "review_token_invalid",
  /** Review link expirado — `expiresAt` server-side vencida (401). */
  "review_token_expired",
  /** Review link revocado o sesión cerrada (401). */
  "review_token_revoked",
  /** La sesión de revisión ya estaba cerrada (409 al cerrar; 400 al comentar). */
  "review_session_closed",
  /** Contexto de review link fuera de su superficie de solo lectura (403). */
  "review_read_only",
  /** La sesión de revisión no admite comentarios (403). */
  "review_comments_disabled",
] as const;

export type DesignApiErrorCode = (typeof DESIGN_API_ERROR_CODES)[number];

/** Detalle del 409 `cad_document_version_conflict`. */
export interface CadDocumentVersionConflictDetails {
  readonly expected: CadDocumentVersionToken;
  readonly current: CadDocumentVersionToken;
}

/* ──────────────────────────── Límites del documento ───────────────────────── */

/**
 * Límites REALES del documento canónico y sus transportes, espejo de
 * `cad-document-validation.ts` / `cad-document-storage.ts` (apps/api,
 * módulo cad-documents). Se duplican aquí como CONTRATO: el editor y los
 * consumidores validan contra estos números sin importar código del backend.
 */
export const CAD_DOCUMENT_LIMITS = {
  /** Versiones de formato del documento soportadas (`meta.schema`). */
  minSchema: 1,
  maxSchema: 10,
  maxEntities: 100_000,
  maxBlocks: 2_000,
  maxConstraints: 250_000,
  maxPaperSpaces: 500,
  maxViewportsPerPaperSpace: 32,
  maxEmbeddedPublications: 1_000,
  maxCollaborationVersions: 12,
  maxReviewThreads: 500,
  maxReviewLinks: 20,
  maxCollaborationAuditEvents: 500,
  maxNestingDepth: 64,
  maxIdLength: 128,
  maxCommentBodyLength: 1_000,
  /** JSON serializado máximo para guardar inline. */
  maxInlineBytes: 8_000_000,
  /** JSON descomprimido máximo vía archivo gzip (128 MiB). */
  maxArchiveBytes: 128 * 1024 * 1024,
  /** Archivo gzip máximo en el multipart (20 MiB). */
  maxCompressedUploadBytes: 20 * 1024 * 1024,
  /** Umbral a partir del cual el servidor persiste como puntero a blob. */
  blobThresholdBytes: 1_000_000,
} as const;

/* ──────────────────────────── Eventos de dominio ──────────────────────────── */

/** Códigos versionados de los eventos que Design emite (v1). */
export const DESIGN_EVENT_CODES = [
  "design.document.created.v1",
  "design.document.published.v1",
  "design.layout.released.v1",
  "design.document.archived.v1",
] as const;

export type DesignEventCode = (typeof DESIGN_EVENT_CODES)[number];

export function isDesignEventCode(value: unknown): value is DesignEventCode {
  return (
    typeof value === "string" &&
    (DESIGN_EVENT_CODES as readonly string[]).includes(value)
  );
}

/** Campos comunes de todo evento `design.*.v1` (entrega at-least-once). */
export interface DesignEventBase {
  /** Único por evento; clave de deduplicación del consumidor. */
  readonly eventId: string;
  readonly eventCode: DesignEventCode;
  /** Momento del hecho de dominio (ISO 8601, UTC). */
  readonly occurredAt: string;
  readonly tenantId: string;
  /** Identidad auditada que causó el hecho (email). */
  readonly actor: string;
  readonly cadProjectId: CadProjectId | null;
  readonly cadDocumentId: CadDocumentId;
  /** URL absoluta y OPACA hacia la UI de Design: se guarda y abre tal cual. */
  readonly deepLink: string;
}

export interface DesignDocumentCreatedEvent extends DesignEventBase {
  readonly eventCode: "design.document.created.v1";
  readonly name: string;
}

export interface DesignDocumentPublishedEvent extends DesignEventBase {
  readonly eventCode: "design.document.published.v1";
  readonly cadPublicationId: CadPublicationId;
  readonly fileName: string;
  /** sha256 (hex minúsculas) del PDF publicado. */
  readonly sha256: string;
  readonly bytes: number;
  readonly paperSpaceIds: readonly string[];
}

/**
 * Snapshot de SOLO LECTURA del documento liberado. Regla de frontera:
 * Enterprise solo puede almacenar del CAD los ids (`cadProjectId`,
 * `cadDocumentId`, `cadPublicationId`), el deep link y este snapshot.
 */
export interface DesignDocumentSnapshot {
  readonly name: string;
  /** `meta.version` del contenido liberado. */
  readonly contentVersion: number;
  readonly entityCount: number;
}

export interface DesignLayoutReleasedEvent extends DesignEventBase {
  readonly eventCode: "design.layout.released.v1";
  readonly cadDocumentVersion: CadDocumentVersionToken;
  readonly snapshot: DesignDocumentSnapshot;
}

export interface DesignDocumentArchivedEvent extends DesignEventBase {
  readonly eventCode: "design.document.archived.v1";
}

export type DesignEvent =
  | DesignDocumentCreatedEvent
  | DesignDocumentPublishedEvent
  | DesignLayoutReleasedEvent
  | DesignDocumentArchivedEvent;

/* ─────────────────── Referencia permitida en Enterprise ───────────────────── */

/**
 * Lo ÚNICO que Enterprise puede persistir de un documento CAD tras la
 * separación (ver `specs/README.md`). Cualquier otro dato se consulta en
 * caliente a la API de Design con el entitlement y permisos del usuario.
 */
export interface DesignDocumentReference {
  readonly cadProjectId: CadProjectId | null;
  readonly cadDocumentId: CadDocumentId;
  readonly cadPublicationId: CadPublicationId | null;
  readonly deepLink: string;
  readonly snapshot: DesignDocumentSnapshot | null;
}
