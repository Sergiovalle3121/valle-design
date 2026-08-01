import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FindOptionsWhere, IsNull } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
  TenantScopedRepository,
  getTenantRepositoryToken,
} from '../../common/tenant/tenant-scoped.repository';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { isUniqueViolation } from '../../common/database/unique-violation';
import { CadProject } from '../cad-documents/entities/cad-project.entity';
import { CadDocument } from '../cad-documents/entities/cad-document.entity';
import { CadDocumentVersion } from '../cad-documents/entities/cad-document-version.entity';
import { CadPublication } from '../cad-documents/entities/cad-publication.entity';
import { CadDocumentsService } from '../cad-documents/cad-documents.service';
import type {
  CadDxfMetaInput,
  CadPublicationReceipt,
} from '../cad-documents/cad-documents.service';
import { isStoredCadDocumentBlobPointer } from '../cad-documents/cad-document-storage';
import type { PersistedCadDocument } from '../cad-documents/cad-document-validation';
import { CAD_AUDIT_PUBLISHER } from '../cad-documents/ports/cad-audit-publisher.port';
import type { CadAuditPublisher } from '../cad-documents/ports/cad-audit-publisher.port';

export interface PageQuery {
  q?: string;
  limit?: number;
  offset?: number;
}

export interface CadDocumentSaveResult {
  cadDocumentId: string;
  cadDocumentVersion: number;
  entityCount: number;
  storedAsBlobPointer: boolean;
}

/** Tope de filas que una lista pagina en memoria (límite v1: 200 por página). */
const LIST_SCAN_CAP = 1000;

/**
 * Repositorio FINO del ciclo de vida CAD propio (contrato design-api.v1):
 * opera las filas `cad_projects` / `cad_documents` / `cad_document_versions` /
 * `cad_publications` delegando toda la lógica del documento canónico en
 * CadDocumentsService (que trabaja sobre valores). Modelado sobre cómo
 * line-engineering llevaba el ciclo de vida de `sf_line_layouts`, pero contra
 * las tablas cad_* del producto:
 *
 * - El guardado es un CAS SQL — `UPDATE … WHERE cad_document_version =
 *   expected` con incremento atómico — exactamente el patrón
 *   `compareAndSwapCadDocument` del origen; el perdedor recibe el 409
 *   contractual `cad_document_version_conflict`.
 * - Cada versión ganadora se registra en `cad_document_versions` (idempotente
 *   por el índice único (document_id, version), patrón de la proyección).
 * - Las publicaciones crean su fila inmutable en `cad_publications` además del
 *   recibo embebido server-managed.
 */
@Injectable()
export class CadDocumentsRepository {
  constructor(
    @Inject(getTenantRepositoryToken(CadProject))
    private readonly projects: TenantScopedRepository<CadProject>,
    @Inject(getTenantRepositoryToken(CadDocument))
    private readonly documents: TenantScopedRepository<CadDocument>,
    @Inject(getTenantRepositoryToken(CadDocumentVersion))
    private readonly versions: TenantScopedRepository<CadDocumentVersion>,
    @Inject(getTenantRepositoryToken(CadPublication))
    private readonly publications: TenantScopedRepository<CadPublication>,
    private readonly tenantCtx: TenantContextService,
    private readonly cadDocuments: CadDocumentsService,
    @Optional()
    @Inject(CAD_AUDIT_PUBLISHER)
    private readonly audit?: CadAuditPublisher,
  ) {}

  /* ─────────────────────────────── Proyectos ─────────────────────────────── */

  async listProjects(
    query: PageQuery & { status?: string },
  ): Promise<{ items: CadProject[]; total: number }> {
    const where: FindOptionsWhere<CadProject> = {};
    if (query.status) where.status = query.status;
    const rows = await this.projects.find({
      where,
      order: { created_at: 'DESC' },
      take: LIST_SCAN_CAP,
    });
    return paginate(rows, query, (p) => p.name);
  }

  async createProject(input: {
    name: string;
    description?: string;
  }): Promise<CadProject> {
    const row = this.projects.create({
      name: input.name.trim().slice(0, 160),
      description: input.description?.trim().slice(0, 500) || null,
      status: 'active',
      created_by: this.actor(),
    });
    row.plant_id = this.tenantCtx.getPlantId();
    row.organization_id = this.tenantCtx.getOrganizationId();
    return this.projects.save(row);
  }

  async getProject(id: string): Promise<CadProject> {
    const row = await this.projects.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Proyecto no encontrado.');
    return row;
  }

  async updateProject(
    id: string,
    patch: { name?: string; description?: string | null; status?: string },
  ): Promise<CadProject> {
    const row = await this.getProject(id);
    if (patch.name !== undefined) row.name = patch.name.trim().slice(0, 160);
    if (patch.description !== undefined) {
      row.description = patch.description?.trim().slice(0, 500) || null;
    }
    if (patch.status !== undefined) row.status = patch.status;
    return this.projects.save(row);
  }

  /** Borrado suave del contrato v1: DELETE = status archived, nada se pierde. */
  async archiveProject(id: string): Promise<CadProject> {
    const row = await this.getProject(id);
    if (row.status !== 'archived') {
      row.status = 'archived';
      await this.projects.save(row);
      await this.recordAudit('cad_project_archived', 'CAD_PROJECT', row.id);
    }
    return row;
  }

  /* ─────────────────────────────── Documentos ────────────────────────────── */

  async listDocuments(
    query: PageQuery & { projectId?: string },
  ): Promise<{ items: CadDocument[]; total: number }> {
    const where: FindOptionsWhere<CadDocument> = {};
    if (query.projectId) where.projectId = query.projectId;
    const rows = await this.documents.find({
      where,
      order: { created_at: 'DESC' },
      take: LIST_SCAN_CAP,
    });
    return paginate(rows, query, (d) => d.name);
  }

  async createDocument(input: {
    name: string;
    projectId?: string;
    model?: string;
    revision?: string;
  }): Promise<CadDocument> {
    if (input.projectId) {
      // El proyecto debe existir Y pertenecer al tenant (lectura scoped).
      await this.getProject(input.projectId);
    }
    const row = this.documents.create({
      name: input.name.trim().slice(0, 160),
      projectId: input.projectId ?? null,
      model: input.model?.trim().slice(0, 64) || null,
      revision: input.revision?.trim().slice(0, 16) || null,
      cadDocument: null,
      cadDocumentVersion: 0,
      layers: null,
      created_by: this.actor(),
    });
    row.plant_id = this.tenantCtx.getPlantId();
    row.organization_id = this.tenantCtx.getOrganizationId();
    const saved = await this.documents.save(row);
    await this.recordAudit('cad_document_created', 'CAD_DOCUMENT', saved.id, {
      afterState: { name: saved.name, projectId: saved.projectId },
    });
    return saved;
  }

  async getDocument(id: string): Promise<CadDocument> {
    const row = await this.documents.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Documento CAD no encontrado.');
    return row;
  }

  async updateDocumentMeta(
    id: string,
    patch: {
      name?: string;
      projectId?: string | null;
      layers?: Record<string, unknown>[] | null;
    },
  ): Promise<CadDocument> {
    const row = await this.getDocument(id);
    if (patch.name !== undefined) row.name = patch.name.trim().slice(0, 160);
    if (patch.projectId !== undefined) {
      if (patch.projectId) await this.getProject(patch.projectId);
      row.projectId = patch.projectId ?? null;
    }
    if (patch.layers !== undefined) {
      row.layers = Array.isArray(patch.layers)
        ? patch.layers.filter(
            (layer): layer is Record<string, unknown> =>
              !!layer && typeof layer === 'object' && !Array.isArray(layer),
          )
        : null;
    }
    return this.documents.save(row);
  }

  /** Borrado suave (deleted_at): conserva historial y publicaciones. */
  async archiveDocument(id: string): Promise<void> {
    const row = await this.getDocument(id);
    await this.documents.softRemove(row);
    await this.recordAudit('cad_document_archived', 'CAD_DOCUMENT', id);
  }

  /* ─────────────────────── Contenido canónico (CAS) ──────────────────────── */

  /**
   * Guarda el documento canónico mediante CAS optimista. La validación (token
   * obligatorio, payload, recibos server-managed) es del dominio
   * (prepareCadDocumentSave); aquí vive el ciclo de vida de la fila: almacenar
   * (inline o blob), CAS SQL y la fila de historial.
   */
  async saveContent(
    id: string,
    input: {
      document?: Record<string, unknown>;
      validatedDocument?: PersistedCadDocument;
      expectedVersion?: number;
      forceArchive?: boolean;
    },
  ): Promise<CadDocumentSaveResult> {
    const row = await this.getDocument(id);
    const plan = await this.cadDocuments.prepareCadDocumentSave({
      document: input.document,
      validatedDocument: input.validatedDocument,
      expectedVersion: input.expectedVersion,
      storedDocument: row.cadDocument ?? null,
      currentVersion: row.cadDocumentVersion ?? 0,
      // La fila contenedora ya existe (POST /documents); "nunca guardado" se
      // expresa con cadDocumentVersion 0 y el CAS con expected=0.
      isNewDocument: false,
    });
    const stored = await this.cadDocuments.storeCadDocument(
      plan.document,
      input.forceArchive === true || plan.storedAsBlobPointer,
    );
    const nextVersion = await this.compareAndSwapCadDocument(
      row.id,
      plan.expectedVersion,
      stored,
    );
    await this.recordVersion(row, nextVersion, stored);
    await this.recordAudit('cad_document_saved', 'CAD_DOCUMENT', row.id, {
      afterState: {
        baseRevision: plan.expectedVersion,
        resultingRevision: nextVersion,
        entityCount: plan.entityCount,
      },
    });
    return {
      cadDocumentId: row.id,
      cadDocumentVersion: nextVersion,
      entityCount: plan.entityCount,
      storedAsBlobPointer: isStoredCadDocumentBlobPointer(stored),
    };
  }

  /* ────────────────────────────── Versiones ──────────────────────────────── */

  async listVersions(
    documentId: string,
    query: PageQuery,
  ): Promise<{ items: CadDocumentVersion[]; total: number }> {
    await this.getDocument(documentId);
    const [rows, total] = await this.versions.findAndCount({
      where: { documentId },
      order: { version: 'DESC' },
      take: Math.min(Math.max(1, query.limit ?? 50), 200),
      skip: Math.max(0, query.offset ?? 0),
    });
    return { items: rows, total };
  }

  async getVersion(
    documentId: string,
    version: number,
  ): Promise<CadDocumentVersion> {
    await this.getDocument(documentId);
    const row = await this.versions.findOne({
      where: { documentId, version },
    });
    if (!row) throw new NotFoundException('Versión CAS no encontrada.');
    return row;
  }

  /* ───────────────────────────── Publicaciones ───────────────────────────── */

  async listPublications(documentId: string): Promise<CadPublication[]> {
    await this.getDocument(documentId);
    return this.publications.find({
      where: { documentId },
      order: { publishedAt: 'DESC' },
      take: 1000,
    });
  }

  async recordPublication(
    documentId: string,
    input: {
      expectedCadDocumentVersion: number;
      paperSpaceIds: string[];
      fileName: string;
      sha256: string;
      bytes: number;
    },
  ): Promise<{
    publication: CadPublicationReceipt & { documentId: string };
    cadDocumentVersion: number;
  }> {
    const row = await this.getDocument(documentId);
    if (!row.cadDocument) {
      throw new NotFoundException('No existe un documento CAD para publicar.');
    }
    // El dominio valida las hojas y construye el recibo + documento siguiente;
    // esta capa aporta el actor y conserva el CAS + la fila inmutable.
    const { publication, storedDocument } =
      await this.cadDocuments.appendCadPublication(row.cadDocument, {
        paperSpaceIds: input.paperSpaceIds,
        fileName: input.fileName,
        sha256: input.sha256,
        bytes: input.bytes,
        publishedBy: this.tenantCtx.getUserEmail(),
      });
    const cadDocumentVersion = await this.compareAndSwapCadDocument(
      row.id,
      input.expectedCadDocumentVersion,
      storedDocument,
    );
    await this.recordVersion(row, cadDocumentVersion, storedDocument);
    const receiptRow = this.publications.create({
      id: publication.id,
      documentId: row.id,
      fileName: publication.fileName,
      sha256: publication.sha256,
      bytes: publication.bytes,
      paperSpaceIds: publication.paperSpaceIds,
      publishedBy: publication.publishedBy,
      publishedAt: new Date(publication.publishedAt),
      created_by: this.actor(),
    });
    receiptRow.plant_id = row.plant_id;
    receiptRow.organization_id = row.organization_id;
    await this.publications.save(receiptRow);
    await this.recordAudit('cad_sheet_set_published', 'CAD_DOCUMENT', row.id, {
      afterState: {
        publicationId: publication.id,
        paperSpaceIds: publication.paperSpaceIds,
        fileName: publication.fileName,
        sha256: publication.sha256,
        bytes: publication.bytes,
        cadDocumentVersion,
      },
    });
    return {
      publication: { ...publication, documentId: row.id },
      cadDocumentVersion,
    };
  }

  /* ─────────────────────────── Plano DXF de fondo ────────────────────────── */

  async getDxf(documentId: string): Promise<{
    name: string;
    data: string;
    placement: NonNullable<ReturnType<CadDocumentsService['toDxfPlacement']>>;
  }> {
    const row = await this.getDocument(documentId);
    const placement = this.cadDocuments.toDxfPlacement(row);
    if (!row.dxfData || !placement) {
      // DIFERENCIA DELIBERADA con el legacy (que devolvía null): v1 responde
      // 404 — el subrecurso no existe.
      throw new NotFoundException('El documento no tiene plano DXF de fondo.');
    }
    return { name: placement.name, data: row.dxfData, placement };
  }

  async setDxf(
    documentId: string,
    input: { name: string; data: string; placement?: CadDxfMetaInput },
  ): Promise<{
    name: string;
    data: string;
    placement: NonNullable<ReturnType<CadDocumentsService['toDxfPlacement']>>;
  }> {
    if (!input.data?.trim()) {
      throw new BadRequestException('El DXF está vacío.');
    }
    const row = await this.getDocument(documentId);
    row.dxfData = input.data;
    row.dxfName = (input.name || 'plano.dxf').slice(0, 255);
    // Reset a defaults (patrón del origen) antes de aplicar la colocación.
    row.dxfOffsetX = 0;
    row.dxfOffsetY = 0;
    row.dxfScale = 1;
    row.dxfRotation = 0;
    row.dxfVisible = true;
    row.dxfOpacity = 0.5;
    if (input.placement) this.cadDocuments.applyDxfMeta(row, input.placement);
    await this.documents.save(row);
    await this.recordAudit('cad_dxf_background_set', 'CAD_DOCUMENT', row.id, {
      afterState: { name: row.dxfName, bytes: input.data.length },
    });
    return this.getDxf(documentId);
  }

  async clearDxf(documentId: string): Promise<void> {
    const row = await this.getDocument(documentId);
    if (!row.dxfData) return;
    row.dxfData = null;
    row.dxfName = null;
    row.dxfOffsetX = 0;
    row.dxfOffsetY = 0;
    row.dxfScale = 1;
    row.dxfRotation = 0;
    row.dxfVisible = true;
    row.dxfOpacity = 0.5;
    await this.documents.save(row);
    await this.recordAudit(
      'cad_dxf_background_cleared',
      'CAD_DOCUMENT',
      row.id,
    );
  }

  /* ───────────────────────────── Interno ─────────────────────────────────── */

  /**
   * Ámbito de mutación para UPDATEs directos: TenantScopedRepository scopea
   * las LECTURAS, pero `update()` puentea esos overrides — el predicado de
   * escritura lleva el tenant explícito y falla cerrado (patrón del origen).
   */
  private mutationScope(id: string): FindOptionsWhere<CadDocument> {
    return {
      id,
      tenant_id: this.tenantCtx.getTenantId() ?? IsNull(),
      deleted_at: IsNull(),
    };
  }

  /**
   * CAS SQL del documento canónico: exactamente UNA fila en la versión
   * esperada avanza; un escritor desfasado no puede pisar al ganador aunque
   * ambos hayan leído la misma versión concurrentemente.
   */
  private async compareAndSwapCadDocument(
    documentId: string,
    expected: number,
    cadDocument: Record<string, unknown>,
  ): Promise<number> {
    const result = await this.documents.update(
      {
        ...this.mutationScope(documentId),
        cadDocumentVersion: expected,
      },
      {
        cadDocument,
        cadDocumentVersion: () => 'cad_document_version + 1',
      } as unknown as QueryDeepPartialEntity<CadDocument>,
    );
    if (result.affected !== 1) {
      const current =
        (
          await this.documents.findOne({
            where: { id: documentId },
          })
        )?.cadDocumentVersion ?? expected;
      throw new ConflictException({
        code: 'cad_document_version_conflict',
        message:
          'El dibujo cambió desde la última carga. Recarga y compara antes de guardar.',
        expected,
        current,
      });
    }
    return expected + 1;
  }

  /** Fila de historial idempotente (índice único document_id+version). */
  private async recordVersion(
    row: CadDocument,
    version: number,
    stored: Record<string, unknown>,
  ): Promise<void> {
    const entry = this.versions.create({
      documentId: row.id,
      version,
      cadDocument: stored,
      sha256: storedDocumentSha256(stored),
      created_by: this.actor(),
    });
    entry.plant_id = row.plant_id;
    entry.organization_id = row.organization_id;
    try {
      await this.versions.save(entry);
    } catch (err) {
      // Otra escritura concurrente ya registró esa versión — mismo resultado.
      if (!isUniqueViolation(err)) throw err;
    }
  }

  private actor(): string | null {
    return this.tenantCtx.get()?.user_email ?? null;
  }

  /** Asiento de auditoría vía puerto neutral; el adaptador es fail-soft. */
  private async recordAudit(
    action: string,
    referenceType: string,
    referenceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit?.record({
      action,
      referenceType,
      referenceId,
      actorName: this.actor() ?? undefined,
      metadata,
    });
  }
}

/** sha256 del archivo comprimido (puntero) o del JSON inline. */
function storedDocumentSha256(stored: Record<string, unknown>): string | null {
  if (isStoredCadDocumentBlobPointer(stored)) {
    return stored._storage.sha256.toLowerCase();
  }
  try {
    return createHash('sha256').update(JSON.stringify(stored)).digest('hex');
  } catch {
    return null;
  }
}

/** Paginación en memoria con búsqueda `q` (contains, case-insensitive). */
function paginate<T>(
  rows: T[],
  query: PageQuery,
  nameOf: (row: T) => string,
): { items: T[]; total: number } {
  const q = (query.q ?? '').trim().toLocaleLowerCase();
  const filtered = q
    ? rows.filter((row) => nameOf(row).toLocaleLowerCase().includes(q))
    : rows;
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(Math.max(1, query.limit ?? 50), 200);
  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}
