import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  IsNull,
  Raw,
} from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
  TenantScopedRepository,
  getTenantRepositoryToken,
} from '../../common/tenant/tenant-scoped.repository';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { isUniqueViolation } from '../../common/database/unique-violation';
import { normalizeRequiredName } from '../../common/validation/normalized-name';
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
import {
  CAD_EVENT_PUBLISHER,
  USAGE_METER,
} from '../commercial/ports/commercial.ports';
import type {
  CadEventPublisher,
  UsageMeter,
} from '../commercial/ports/commercial.ports';

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

/**
 * Columnas que viajan en los LISTADOS. Nunca el documento canónico
 * (`cadDocument`, jsonb que puede pesar decenas de MB), ni el DXF crudo
 * (`dxfData`), ni `legacyMetadata`: un listado de 200 filas arrastrando eso
 * es transferencia y heap por una respuesta que sólo muestra nombre y
 * versión. Son exactamente las columnas que `documentSummary`/
 * `projectResource` serializan.
 */
const DOCUMENT_LIST_COLUMNS = [
  'id',
  'projectId',
  'name',
  'model',
  'revision',
  'cadDocumentVersion',
  'layers',
  'legacySourceId',
  'created_at',
  'updated_at',
  'created_by',
] as const satisfies readonly (keyof CadDocument)[];

const PROJECT_LIST_COLUMNS = [
  'id',
  'name',
  'description',
  'status',
  'legacySourceId',
  'created_at',
  'updated_at',
  'created_by',
] as const satisfies readonly (keyof CadProject)[];

/** Ventana de página del contrato v1: default 50, máximo 200. */
function pageWindow(query: PageQuery): { offset: number; limit: number } {
  return {
    offset: Math.max(0, query.offset ?? 0),
    limit: Math.min(Math.max(1, query.limit ?? 50), 200),
  };
}

/**
 * Búsqueda `q` por nombre EN SQL, portable entre PostgreSQL y SQLite:
 * `LOWER(col) LIKE LOWER(:q)` con comodines escapados — un nombre con `%` o
 * `_` literales no es un patrón. Sustituye a la paginación en memoria con
 * tope de 1000 filas que hacía mentir a `total` por encima del tope y volvía
 * inalcanzable todo documento más viejo que las 1000 filas más recientes.
 * Como FindOperator dentro de `find`, conserva el scoping de tenant del
 * TenantScopedRepository (un QueryBuilder lo perdería).
 */
function nameContains(term: string) {
  const escaped = term.replace(/[\\%_]/gu, (ch) => `\\${ch}`);
  return Raw((alias) => `LOWER(${alias}) LIKE LOWER(:q) ESCAPE '\\'`, {
    q: `%${escaped}%`,
  });
}

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
    @Optional()
    @Inject(CAD_EVENT_PUBLISHER)
    private readonly events?: CadEventPublisher,
    @Optional() @Inject(USAGE_METER) private readonly usage?: UsageMeter,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  /* ─────────────────────────────── Proyectos ─────────────────────────────── */

  async listProjects(
    query: PageQuery & { status?: string },
  ): Promise<{ items: CadProject[]; total: number }> {
    const where: FindOptionsWhere<CadProject> = {};
    if (query.status) where.status = query.status;
    const term = (query.q ?? '').trim();
    if (term) where.name = nameContains(term);
    const { offset, limit } = pageWindow(query);
    const [items, total] = await this.projects.findAndCount({
      select: [...PROJECT_LIST_COLUMNS],
      where,
      order: { created_at: 'DESC' },
      skip: offset,
      take: limit,
    });
    return { items, total };
  }

  async createProject(input: {
    name: string;
    description?: string;
  }): Promise<CadProject> {
    const row = this.projects.create({
      name: normalizeRequiredName(input.name, {
        resource: 'proyecto CAD',
        maxLength: 160,
      }),
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
    if (patch.name !== undefined) {
      row.name = normalizeRequiredName(patch.name, {
        resource: 'proyecto CAD',
        maxLength: 160,
      });
    }
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
    query: PageQuery & {
      projectId?: string;
      model?: string;
      revision?: string;
    },
  ): Promise<{ items: CadDocument[]; total: number }> {
    const where: FindOptionsWhere<CadDocument> = {};
    if (query.projectId) where.projectId = query.projectId;
    if (query.model) where.model = query.model;
    if (query.revision) where.revision = query.revision;

    // TODO se aplica ANTES del límite y EN SQL — filtros, búsqueda `q` y
    // conteo. Un marcador histórico no desaparece por estar después de las
    // primeras 200 filas del tenant, `total` es el total real, y ninguna
    // fila arrastra el jsonb del documento ni el DXF crudo (proyección).
    const term = (query.q ?? '').trim();
    if (term) where.name = nameContains(term);
    const { offset, limit } = pageWindow(query);
    const [items, total] = await this.documents.findAndCount({
      select: [...DOCUMENT_LIST_COLUMNS],
      where,
      order: { created_at: 'DESC' },
      skip: offset,
      take: limit,
    });
    return { items, total };
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
      name: normalizeRequiredName(input.name, {
        resource: 'documento CAD',
        maxLength: 160,
      }),
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
    if (patch.name !== undefined) {
      row.name = normalizeRequiredName(patch.name, {
        resource: 'documento CAD',
        maxLength: 160,
      });
    }
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

  /**
   * Rollback acotado de una importación: un editor sólo puede descartar la
   * fila vacía que él mismo acaba de crear. No es un alias del borrado
   * administrativo: tenant, actor y estado provisional forman parte del
   * predicado atómico para que un guardado concurrente nunca sea archivado.
   */
  async discardProvisionalDocument(id: string): Promise<void> {
    const tenantId = this.tenantCtx.requireTenantId(
      'descartar documento CAD provisional',
    );
    const actor = this.actor();
    if (!actor) {
      throw new ForbiddenException(
        'No hay un actor autenticado para descartar el documento provisional.',
      );
    }

    // Lectura scoped: otro tenant recibe 404 y no puede inferir la fila.
    const row = await this.getDocument(id);
    if (row.created_by !== actor) {
      throw new ForbiddenException(
        'Sólo quien creó el documento provisional puede descartarlo.',
      );
    }
    if (
      row.cadDocumentVersion !== 0 ||
      row.cadDocument !== null ||
      row.dxfData !== null
    ) {
      throw new ConflictException(
        'El documento ya contiene información y no puede descartarse como provisional.',
      );
    }

    const result = await this.documents.update(
      {
        id,
        tenant_id: tenantId,
        created_by: actor,
        cadDocumentVersion: 0,
        cadDocument: IsNull(),
        dxfData: IsNull(),
        deleted_at: IsNull(),
      },
      { deleted_at: new Date() },
    );
    if (result.affected !== 1) {
      throw new ConflictException(
        'El documento dejó de ser provisional antes de poder descartarlo.',
      );
    }
    await this.recordAudit(
      'cad_provisional_document_discarded',
      'CAD_DOCUMENT',
      id,
    );
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
    const persist = async (manager?: EntityManager) => {
      const stored = await this.cadDocuments.storeCadDocument(
        plan.document,
        input.forceArchive === true || plan.storedAsBlobPointer,
        manager,
      );
      const next = await this.compareAndSwapCadDocument(
        row.id,
        plan.expectedVersion,
        stored,
        manager,
      );
      await this.recordVersion(row, next, stored, manager);
      const tenantId = row.tenant_id;
      const organizationId = row.organization_id ?? tenantId;
      if (this.events || this.usage) {
        if (!tenantId || !organizationId)
          throw new Error('La mutación CAD requiere tenant y organización.');
        if (!manager)
          throw new Error(
            'Los adaptadores comerciales requieren una transacción activa.',
          );
        const tx = { native: manager };
        const key = `cad-document:${row.id}:version:${next}`;
        await this.usage?.record(
          {
            organizationId,
            tenantId,
            metric: 'design.document.saved',
            quantity: 1,
            idempotencyKey: key,
          },
          tx,
        );
        await this.events?.publish(
          {
            organizationId,
            tenantId,
            type: 'design.document.saved',
            aggregateId: row.id,
            payload: { version: next, entityCount: plan.entityCount },
            idempotencyKey: key,
          },
          tx,
        );
      }
      return { next, stored };
    };
    const persisted = this.dataSource
      ? await this.dataSource.transaction((manager) => persist(manager))
      : await persist();
    await this.recordAudit('cad_document_saved', 'CAD_DOCUMENT', row.id, {
      afterState: {
        baseRevision: plan.expectedVersion,
        resultingRevision: persisted.next,
        entityCount: plan.entityCount,
      },
    });
    return {
      cadDocumentId: row.id,
      cadDocumentVersion: persisted.next,
      entityCount: plan.entityCount,
      storedAsBlobPointer: isStoredCadDocumentBlobPointer(persisted.stored),
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
    const persist = async (manager?: EntityManager) => {
      const { publication, storedDocument } =
        await this.cadDocuments.appendCadPublication(
          row.cadDocument!,
          {
            paperSpaceIds: input.paperSpaceIds,
            fileName: input.fileName,
            sha256: input.sha256,
            bytes: input.bytes,
            publishedBy: this.tenantCtx.getUserEmail(),
          },
          manager,
        );
      const cadDocumentVersion = await this.compareAndSwapCadDocument(
        row.id,
        input.expectedCadDocumentVersion,
        storedDocument,
        manager,
      );
      await this.recordVersion(
        row,
        cadDocumentVersion,
        storedDocument,
        manager,
      );
      const publications = this.publications.withManager(manager);
      const receiptRow = publications.create({
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
      await publications.save(receiptRow);
      const tenantId = row.tenant_id;
      const organizationId = row.organization_id ?? tenantId;
      if (this.events || this.usage) {
        if (!tenantId || !organizationId)
          throw new Error('La publicación CAD requiere tenant y organización.');
        if (!manager)
          throw new Error(
            'Los adaptadores comerciales requieren una transacción activa.',
          );
        const tx = { native: manager };
        const key = `cad-document:${row.id}:version:${cadDocumentVersion}:publication`;
        await this.usage?.record(
          {
            organizationId,
            tenantId,
            metric: 'design.document.published',
            quantity: 1,
            idempotencyKey: key,
          },
          tx,
        );
        await this.events?.publish(
          {
            organizationId,
            tenantId,
            type: 'design.document.published',
            aggregateId: row.id,
            payload: {
              version: cadDocumentVersion,
              publicationId: publication.id,
              paperSpaceIds: publication.paperSpaceIds,
              sha256: publication.sha256,
              bytes: publication.bytes,
            },
            idempotencyKey: key,
          },
          tx,
        );
      }
      return { publication, cadDocumentVersion };
    };
    const { publication, cadDocumentVersion } = this.dataSource
      ? await this.dataSource.transaction((manager) => persist(manager))
      : await persist();
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

  /**
   * Asiento de auditoría de la exportación DXF (Fase 5 — la exportación
   * entrega el dibujo COMPLETO como archivo: acción sensible, se audita como
   * los saves/publicaciones). El controller la invoca tras armar el export.
   */
  async recordDxfExported(documentId: string, fileName: string): Promise<void> {
    await this.recordAudit('cad_dxf_exported', 'CAD_DOCUMENT', documentId, {
      afterState: { fileName },
    });
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
    manager?: EntityManager,
  ): Promise<number> {
    const documents = this.documents.withManager(manager);
    const result = await documents.update(
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
          await documents.findOne({
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
    manager?: EntityManager,
  ): Promise<void> {
    const versions = this.versions.withManager(manager);
    const entry = versions.create({
      documentId: row.id,
      version,
      cadDocument: stored,
      sha256: storedDocumentSha256(stored),
      created_by: this.actor(),
    });
    entry.plant_id = row.plant_id;
    entry.organization_id = row.organization_id;
    try {
      await versions.save(entry);
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

