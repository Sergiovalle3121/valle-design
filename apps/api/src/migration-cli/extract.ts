import {
  cadBlobKeyFromStoredDocument,
  isStoredCadDocumentBlobPointer,
} from '../modules/cad-documents/cad-document-storage';
import type {
  BlockExportRecord,
  DocumentExportRecord,
  PublicationExportRecord,
  VersionExportRecord,
} from './archive';
import { stableSha256 } from './stable-json';

/**
 * Transformación PURA fila legacy → registros de exportación. Sin I/O: la
 * lectura de la base y de los blobs vive en export.ts; aquí solo decisiones
 * de mapeo, todas unit-testeables:
 *
 * - Un layout sin `cad_document` NO es un documento (se omite y se reporta).
 * - La versión canónica y los `cadDocument` embebidos en snapshots se vuelven
 *   versiones CAS etiquetadas; los conflictos se resuelven de forma
 *   determinista (la canónica gana su slot; duplicados idénticos se colapsan;
 *   un snapshot con contenido DISTINTO en un slot tomado se descarta con
 *   aviso — jamás se inventa un número de versión que el CAS legacy no vivió).
 * - connectors/assets/annotations/cells/aprobación/footprint viajan como
 *   `legacyMetadata` del documento (Design no tiene columnas industriales).
 */

/** Fila de `sf_line_layouts` tal como la devuelve el SELECT del exportador. */
export interface SourceLayoutRow {
  id: string;
  tenant_id: string | null;
  organization_id: string | null;
  plant_id: string | null;
  model: string;
  revision: string;
  footprint_w: number;
  footprint_h: number;
  unit: string;
  grid_size: number;
  approval_status: string | null;
  approved_by: string | null;
  approved_at: string | Date | null;
  approval_note: string | null;
  dxf_data: string | null;
  dxf_name: string | null;
  dxf_offset_x: number;
  dxf_offset_y: number;
  dxf_scale: number;
  dxf_rotation: number;
  dxf_visible: boolean;
  dxf_opacity: number;
  connectors: unknown[] | null;
  assets: unknown[] | null;
  annotations: unknown[] | null;
  snapshots: LegacySnapshot[] | null;
  cells: unknown[] | null;
  layers: Record<string, unknown>[] | null;
  cad_document: Record<string, unknown> | null;
  cad_document_version: number;
  created_at: string | Date;
  updated_at: string | Date;
  created_by: string | null;
}

export interface LegacySnapshot {
  id?: string;
  name?: string;
  createdAt?: string;
  createdBy?: string | null;
  cadDocument?: Record<string, unknown> | null;
  cadDocumentVersion?: number;
  [key: string]: unknown;
}

export interface SourceBlockRow {
  id: string;
  tenant_id: string | null;
  organization_id: string | null;
  plant_id: string | null;
  name: string;
  assets: unknown[];
  definition: Record<string, unknown> | null;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
  created_by: string | null;
}

export interface ExtractWarning {
  layoutId: string;
  code:
    | 'snapshot_sin_version'
    | 'conflicto_version_snapshot'
    | 'documento_version_cero'
    | 'publicacion_invalida';
  detail: string;
}

export interface LayoutExtraction {
  /** null cuando el layout no tiene documento canónico (no se exporta). */
  document: DocumentExportRecord | null;
  versions: VersionExportRecord[];
  /** blobKeys de punteros referenciados por lo exportado (canónico+versiones). */
  referencedBlobKeys: string[];
  warnings: ExtractWarning[];
  skippedReason?: 'sin_documento';
}

function iso(value: string | Date | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function isoOrNull(value: string | Date | null | undefined): string | null {
  return value ? iso(value) : null;
}

/** sha de contenido de un valor `cadDocument` almacenado (puntero o inline). */
export function storedContentSha256(stored: Record<string, unknown>): string {
  if (isStoredCadDocumentBlobPointer(stored)) {
    return stored._storage.sha256.toLowerCase();
  }
  return stableSha256(stored);
}

/** Nombre derivado del documento — mismo criterio que la proyección WP3. */
export function deriveDocumentName(
  model: string | null,
  revision: string | null,
): string {
  return (
    [model, revision]
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 160) || 'CAD'
  );
}

export function extractLayout(row: SourceLayoutRow): LayoutExtraction {
  const warnings: ExtractWarning[] = [];
  if (!row.cad_document || typeof row.cad_document !== 'object') {
    return {
      document: null,
      versions: [],
      referencedBlobKeys: [],
      warnings,
      skippedReason: 'sin_documento',
    };
  }

  const canonicalVersion = Math.max(
    0,
    Math.floor(Number(row.cad_document_version) || 0),
  );
  const model = (row.model ?? '').trim().slice(0, 64) || null;
  const revision = (row.revision ?? '').trim().slice(0, 16) || null;

  const snapshotSummaries = (row.snapshots ?? []).map((snapshot) => ({
    id: snapshot.id ?? null,
    name: snapshot.name ?? null,
    createdAt: snapshot.createdAt ?? null,
    createdBy: snapshot.createdBy ?? null,
    cadDocumentVersion: snapshot.cadDocumentVersion ?? null,
    hasCadDocument: !!snapshot.cadDocument,
    cadDocumentSha256: snapshot.cadDocument
      ? storedContentSha256(snapshot.cadDocument)
      : null,
  }));

  const document: DocumentExportRecord = {
    legacySourceId: row.id,
    tenantId: row.tenant_id ?? null,
    organizationId: row.organization_id ?? null,
    plantId: row.plant_id ?? null,
    name: deriveDocumentName(model, revision),
    model,
    revision,
    cadDocument: row.cad_document,
    cadDocumentVersion: canonicalVersion,
    layers: Array.isArray(row.layers)
      ? row.layers.filter(
          (layer): layer is Record<string, unknown> =>
            !!layer && typeof layer === 'object' && !Array.isArray(layer),
        )
      : null,
    dxf: {
      data: row.dxf_data ?? null,
      name: row.dxf_name ?? null,
      offsetX: Number(row.dxf_offset_x) || 0,
      offsetY: Number(row.dxf_offset_y) || 0,
      scale: Number(row.dxf_scale) || 1,
      rotation: Number(row.dxf_rotation) || 0,
      visible: row.dxf_visible !== false,
      opacity: Number(row.dxf_opacity ?? 0.5),
    },
    legacyMetadata: {
      source: 'sf_line_layouts',
      footprint: {
        footprintW: row.footprint_w,
        footprintH: row.footprint_h,
        unit: row.unit,
        gridSize: row.grid_size,
      },
      approval: {
        status: row.approval_status ?? null,
        approvedBy: row.approved_by ?? null,
        approvedAt: isoOrNull(row.approved_at),
        note: row.approval_note ?? null,
      },
      connectors: row.connectors ?? null,
      assets: row.assets ?? null,
      annotations: row.annotations ?? null,
      cells: row.cells ?? null,
      snapshots: snapshotSummaries,
    },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    createdBy: row.created_by ?? null,
    contentSha256: storedContentSha256(row.cad_document),
  };

  // ── Versiones CAS: canónica primero (gana su slot), luego snapshots ──
  const versions: VersionExportRecord[] = [];
  const taken = new Map<number, string>(); // version → sha
  if (canonicalVersion >= 1) {
    versions.push({
      documentLegacySourceId: row.id,
      tenantId: row.tenant_id ?? null,
      version: canonicalVersion,
      label: null,
      legacySourceId: `${row.id}:v${canonicalVersion}`,
      cadDocument: row.cad_document,
      sha256: document.contentSha256,
      createdAt: iso(row.updated_at),
      createdBy: row.created_by ?? null,
    });
    taken.set(canonicalVersion, document.contentSha256);
  } else {
    warnings.push({
      layoutId: row.id,
      code: 'documento_version_cero',
      detail:
        'cad_document presente con cad_document_version 0: se copia el documento pero no genera fila de historial CAS.',
    });
  }

  for (const snapshot of row.snapshots ?? []) {
    if (!snapshot.cadDocument || typeof snapshot.cadDocument !== 'object') {
      continue; // snapshot sin documento: solo metadata (resumen ya incluido)
    }
    const version = Math.floor(Number(snapshot.cadDocumentVersion));
    if (!Number.isFinite(version) || version < 1) {
      warnings.push({
        layoutId: row.id,
        code: 'snapshot_sin_version',
        detail: `Snapshot ${snapshot.id ?? '?'} («${snapshot.name ?? ''}») trae cadDocument sin token CAS válido; no se migra como versión (metadata preservada).`,
      });
      continue;
    }
    const sha = storedContentSha256(snapshot.cadDocument);
    const existing = taken.get(version);
    if (existing !== undefined) {
      if (existing !== sha) {
        warnings.push({
          layoutId: row.id,
          code: 'conflicto_version_snapshot',
          detail: `Snapshot ${snapshot.id ?? '?'} reclama la versión ${version} con contenido distinto (sha ${sha.slice(0, 12)}… ≠ ${existing.slice(0, 12)}…); se conserva la primera y se descarta el snapshot.`,
        });
      }
      continue;
    }
    versions.push({
      documentLegacySourceId: row.id,
      tenantId: row.tenant_id ?? null,
      version,
      label: (snapshot.name ?? '').slice(0, 120) || null,
      legacySourceId: (snapshot.id ?? `${row.id}:snap:v${version}`).slice(
        0,
        96,
      ),
      cadDocument: snapshot.cadDocument,
      sha256: sha,
      createdAt: snapshot.createdAt
        ? iso(snapshot.createdAt)
        : iso(row.updated_at),
      createdBy: snapshot.createdBy ?? null,
    });
    taken.set(version, sha);
  }

  const referencedBlobKeys = new Set<string>();
  for (const payload of [
    row.cad_document,
    ...versions.map((v) => v.cadDocument),
  ]) {
    const key = cadBlobKeyFromStoredDocument(payload);
    if (key) referencedBlobKeys.add(key);
  }

  return {
    document,
    versions,
    referencedBlobKeys: [...referencedBlobKeys],
    warnings,
  };
}

/**
 * Recibos de publicación del documento canónico HIDRATADO. Los recibos son
 * server-managed en el origen (id, sha256, bytes, paperSpaceIds, publishedBy,
 * publishedAt); un recibo malformado se descarta con aviso — no aborta el
 * documento.
 */
export function extractPublications(
  hydratedDocument: Record<string, unknown>,
  row: Pick<SourceLayoutRow, 'id' | 'tenant_id' | 'updated_at'>,
): { publications: PublicationExportRecord[]; warnings: ExtractWarning[] } {
  const warnings: ExtractWarning[] = [];
  const publications: PublicationExportRecord[] = [];
  const raw = hydratedDocument.publications;
  if (!Array.isArray(raw)) return { publications, warnings };
  for (const value of raw) {
    const receipt =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    const sha256 =
      typeof receipt?.sha256 === 'string' &&
      /^[a-f0-9]{64}$/i.test(receipt.sha256)
        ? receipt.sha256.toLowerCase()
        : null;
    const bytes = Number(receipt?.bytes);
    const paperSpaceIds = Array.isArray(receipt?.paperSpaceIds)
      ? receipt.paperSpaceIds.map(String)
      : [];
    if (!receipt || !sha256 || !(bytes > 0) || paperSpaceIds.length === 0) {
      warnings.push({
        layoutId: row.id,
        code: 'publicacion_invalida',
        detail: `Recibo de publicación malformado en el documento del layout ${row.id}; se omite.`,
      });
      continue;
    }
    const legacySourceId =
      (typeof receipt.id === 'string' && receipt.id.trim().slice(0, 64)) ||
      stableSha256(receipt);
    publications.push({
      documentLegacySourceId: row.id,
      tenantId: row.tenant_id ?? null,
      legacySourceId,
      fileName:
        (typeof receipt.fileName === 'string' &&
          receipt.fileName.slice(0, 255)) ||
        'publicacion.pdf',
      sha256,
      bytes: Math.floor(bytes),
      paperSpaceIds,
      publishedBy:
        (typeof receipt.publishedBy === 'string' &&
          receipt.publishedBy.slice(0, 255)) ||
        'desconocido',
      publishedAt:
        typeof receipt.publishedAt === 'string'
          ? receipt.publishedAt
          : iso(row.updated_at),
    });
  }
  return { publications, warnings };
}

export function extractBlock(row: SourceBlockRow): BlockExportRecord {
  return {
    legacySourceId: row.id,
    tenantId: row.tenant_id ?? null,
    organizationId: row.organization_id ?? null,
    plantId: row.plant_id ?? null,
    name: row.name,
    assets: Array.isArray(row.assets) ? row.assets : [],
    definition: row.definition ?? null,
    version: Math.max(1, Math.floor(Number(row.version) || 1)),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    createdBy: row.created_by ?? null,
  };
}

/* ───────────────────────────── Delta ───────────────────────────── */

export interface DeltaBase {
  documents: Map<string, { cadDocumentVersion: number; updatedAt: string }>;
  blocks: Map<string, { version: number; updatedAt: string }>;
  blobShas: Set<string>;
}

export function deltaKey(
  tenantId: string | null,
  legacySourceId: string,
): string {
  // El centinela de "sin tenant" es U+0000, escrito como escape: en crudo
  // convierte el fichero en binario para grep/ripgrep, que lo saltan sin
  // avisar. La cadena resultante es idéntica.
  return `${tenantId ?? '\u0000'}::${legacySourceId}`;
}

/**
 * ¿El layout cambió respecto del manifiesto base? Cambia si es nuevo, si el
 * token CAS avanzó o si `updated_at` avanzó (cubre snapshots/dxf/metadata sin
 * bump del CAS). Nunca compara hacia atrás: cualquier diferencia = cambiado.
 */
export function layoutChangedSinceBase(
  base: DeltaBase | null,
  tenantId: string | null,
  legacySourceId: string,
  cadDocumentVersion: number,
  updatedAt: string,
): boolean {
  if (!base) return true;
  const previous = base.documents.get(deltaKey(tenantId, legacySourceId));
  if (!previous) return true;
  return (
    cadDocumentVersion !== previous.cadDocumentVersion ||
    updatedAt !== previous.updatedAt
  );
}

export function blockChangedSinceBase(
  base: DeltaBase | null,
  tenantId: string | null,
  legacySourceId: string,
  version: number,
  updatedAt: string,
): boolean {
  if (!base) return true;
  const previous = base.blocks.get(deltaKey(tenantId, legacySourceId));
  if (!previous) return true;
  return version !== previous.version || updatedAt !== previous.updatedAt;
}
