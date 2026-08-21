import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  API_RATE_LIMITS,
  ApiRateLimitService,
} from '../identity/api-rate-limit.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { CadDocumentsRepository } from './cad-documents.repository';
import { buildDxfExportInput } from './cad-dxf-export';
import { CadBlocksService } from '../cad-documents/cad-blocks.service';
import { CadDocumentsService } from '../cad-documents/cad-documents.service';
import { CadIntentService } from '../cad-documents/cad-intent.service';
import type { CadIntentLayoutContext } from '../cad-documents/cad-intent.service';
import { CadVisionService } from '../cad-documents/cad-vision.service';
import type { CadProject } from '../cad-documents/entities/cad-project.entity';
import type { CadDocument } from '../cad-documents/entities/cad-document.entity';
import type { CadDocumentVersion } from '../cad-documents/entities/cad-document-version.entity';
import type { CadPublication } from '../cad-documents/entities/cad-publication.entity';
import {
  CadIntentDto,
  CadVisionDto,
  CreateCadBlockDto,
  CreateCadDocumentDto,
  CreateCadProjectDto,
  ListBlocksQueryDto,
  ListDocumentsQueryDto,
  ListProjectsQueryDto,
  PageQueryDto,
  RecordCadPublicationDto,
  SaveCadContentDto,
  UpdateCadBlockDto,
  UpdateCadDocumentMetaDto,
  UpdateCadProjectDto,
  UploadDxfDto,
} from './dto/cad.dto';

/**
 * Superficie HTTP del producto Design: `/v1/cad/*` según la semántica de
 * `packages/contracts/specs/design-api.v1.yaml` (CAS, códigos de error,
 * permisos cad:* y entitlement design.cad — impuestos por CadAuthGuard +
 * PermissionsGuard globales).
 *
 * El YAML, este router y el SDK comparten las rutas literales `/v1/cad/*`;
 * no existe un alias `/v1/*` ni una capa de remapeo de prefijos.
 *
 * Todo delega en los servicios REALES del dominio (CadDocumentsService,
 * CadBlocksService, CadIntentService, CadVisionService) a través del
 * repositorio fino CadDocumentsRepository (ciclo de vida de filas cad_* +
 * CAS SQL).
 */
@Controller('v1/cad')
export class CadController {
  constructor(
    private readonly repository: CadDocumentsRepository,
    private readonly cadDocuments: CadDocumentsService,
    private readonly blocks: CadBlocksService,
    private readonly intent: CadIntentService,
    private readonly vision: CadVisionService,
    private readonly rateLimits: ApiRateLimitService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /* ───────────────────────────── Proyectos ──────────────────────────────── */

  @Get('projects')
  @RequirePermissions('cad:view')
  async listProjects(@Query() query: ListProjectsQueryDto) {
    const { items, total } = await this.repository.listProjects(query);
    return { items: items.map(projectResource), total };
  }

  @Post('projects')
  @RequirePermissions('cad:edit')
  async createProject(@Body() dto: CreateCadProjectDto) {
    return projectResource(await this.repository.createProject(dto));
  }

  @Get('projects/:projectId')
  @RequirePermissions('cad:view')
  async getProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return projectResource(await this.repository.getProject(projectId));
  }

  @Patch('projects/:projectId')
  @RequirePermissions('cad:edit')
  async updateProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateCadProjectDto,
  ) {
    requireSomeField(dto);
    return projectResource(await this.repository.updateProject(projectId, dto));
  }

  @Delete('projects/:projectId')
  @RequirePermissions('cad:admin')
  async archiveProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return projectResource(await this.repository.archiveProject(projectId));
  }

  /* ──────────────────────────── Documentos ──────────────────────────────── */

  @Get('documents')
  @RequirePermissions('cad:view')
  async listDocuments(@Query() query: ListDocumentsQueryDto) {
    const { items, total } = await this.repository.listDocuments(query);
    return { items: items.map(documentSummary), total };
  }

  @Post('documents')
  @RequirePermissions('cad:edit')
  async createDocument(@Body() dto: CreateCadDocumentDto) {
    return documentSummary(await this.repository.createDocument(dto));
  }

  /**
   * HIDRATACIÓN R3 (cierra el hueco anotado por R2): el editor espera SIEMPRE
   * el documento canónico completo — igual que el `getLayout` del origen, que
   * llamaba `hydrateCadDocument` con `includeCadDocument=true` en cada
   * apertura. Un documento >1 MB se persiste como puntero a blob
   * (`_storage.kind === 'document_blob'`); antes de R3 este GET devolvía el
   * puntero crudo y el adaptador web respondía 502 para no pisar el dibujo.
   * Ahora el servidor rehidrata el puntero desde el blob store y responde el
   * JSON inline. Cambio ADITIVO del contrato: `CadDocumentEnvelope` ya admite
   * la rama inline; el puntero deja de aparecer en respuestas de apertura
   * (sigue siendo el formato PERSISTIDO y el que reportan los save results
   * vía `storedAsBlobPointer`).
   */
  @Get('documents/:documentId')
  @RequirePermissions('cad:view')
  async openDocument(@Param('documentId', ParseUUIDPipe) documentId: string) {
    const row = await this.repository.getDocument(documentId);
    return {
      ...documentSummary(row),
      cadDocument: row.cadDocument
        ? await this.cadDocuments.hydrateCadDocument(row.cadDocument)
        : null,
      // ADITIVO R3 (paridad con el layout legacy, que incluía la colocación
      // del plano DXF en la apertura): la COLOCACIÓN viaja aquí; los datos
      // del plano se piden aparte a GET :id/dxf sólo cuando existe — así el
      // cliente no sondea el subrecurso a ciegas (y sin 404 de ruido).
      dxf: this.cadDocuments.toDxfPlacement(row),
    };
  }

  @Patch('documents/:documentId')
  @RequirePermissions('cad:edit')
  async updateDocumentMeta(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateCadDocumentMetaDto,
  ) {
    requireSomeField(dto);
    return documentSummary(
      await this.repository.updateDocumentMeta(documentId, dto),
    );
  }

  @Delete('documents/:documentId')
  @RequirePermissions('cad:admin')
  @HttpCode(204)
  async archiveDocument(
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    await this.repository.archiveDocument(documentId);
  }

  @Delete('documents/:documentId/provisional')
  @RequirePermissions('cad:edit')
  @HttpCode(204)
  async discardProvisionalDocument(
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    await this.repository.discardProvisionalDocument(documentId);
  }

  /* ─────────────────── Contenido canónico (CAS optimista) ───────────────── */

  @Put('documents/:documentId/content')
  @RequirePermissions('cad:edit')
  async saveContent(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: SaveCadContentDto,
  ) {
    // Techo generoso por documento (VD-RL-001): un dibujante guardando
    // frenéticamente no lo alcanza; un cliente roto en bucle sí.
    await this.rateLimits.enforce(
      'cad.content.write',
      [documentId],
      API_RATE_LIMITS.cadContentWritePerDocument,
    );
    return this.repository.saveContent(documentId, {
      document: dto.cadDocument,
      expectedVersion: dto.expectedCadDocumentVersion,
    });
  }

  @Put('documents/:documentId/archive')
  @RequirePermissions('cad:edit')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024,
        files: 1,
        fields: 4,
        fieldSize: 8 * 1024 * 1024,
      },
    }),
  )
  async saveContentArchive(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { payload?: string },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('El archivo CAD gzip es obligatorio.');
    }
    // Más estricto que /content: cada intento acarrea hasta 20 MiB
    // comprimidos y una descompresión acotada en el servidor.
    await this.rateLimits.enforce(
      'cad.archive.write',
      [documentId],
      API_RATE_LIMITS.cadArchiveWritePerDocument,
    );
    const expectedVersion = parseArchivePayload(body?.payload);
    const validatedDocument = await this.cadDocuments.decodeCadDocumentUpload(
      file.buffer,
    );
    return this.repository.saveContent(documentId, {
      validatedDocument,
      expectedVersion,
      forceArchive: true,
    });
  }

  /* ────────────────────────────── Versiones ─────────────────────────────── */

  @Get('documents/:documentId/versions')
  @RequirePermissions('cad:view')
  async listVersions(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query() query: PageQueryDto,
  ) {
    const { items, total } = await this.repository.listVersions(
      documentId,
      query,
    );
    return { items: items.map(versionSummary), total };
  }

  @Get('documents/:documentId/versions/:version')
  @RequirePermissions('cad:view')
  async getVersion(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    if (version < 1) {
      throw new NotFoundException('Versión CAS no encontrada.');
    }
    const row = await this.repository.getVersion(documentId, version);
    // Misma hidratación R3 que la apertura: quien restaura una versión
    // histórica necesita el documento completo, no el puntero a blob.
    return {
      ...versionSummary(row),
      cadDocument: row.cadDocument
        ? await this.cadDocuments.hydrateCadDocument(row.cadDocument)
        : row.cadDocument,
    };
  }

  /* ──────────────────────────── Publicaciones ───────────────────────────── */

  @Get('documents/:documentId/publications')
  @RequirePermissions('cad:view')
  async listPublications(
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    const rows = await this.repository.listPublications(documentId);
    return { items: rows.map(publicationResource) };
  }

  @Post('documents/:documentId/publications')
  @RequirePermissions('cad:publish')
  async recordPublication(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: RecordCadPublicationDto,
  ) {
    const { publication, cadDocumentVersion } =
      await this.repository.recordPublication(documentId, dto);
    // Recibo contractual + el nuevo token CAS (aditivo: el cliente lo declara
    // en su siguiente guardado, igual que en el flujo legacy).
    return { ...publication, cadDocumentVersion };
  }

  /* ─────────────────────────── Plano DXF de fondo ───────────────────────── */

  @Get('documents/:documentId/dxf')
  @RequirePermissions('cad:view')
  getDxf(@Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.repository.getDxf(documentId);
  }

  @Put('documents/:documentId/dxf')
  @RequirePermissions('cad:edit')
  setDxf(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UploadDxfDto,
  ) {
    return this.repository.setDxf(documentId, dto);
  }

  @Delete('documents/:documentId/dxf')
  @RequirePermissions('cad:edit')
  @HttpCode(204)
  async clearDxf(@Param('documentId', ParseUUIDPipe) documentId: string) {
    // 404 si el documento no existe; idempotente si no hay plano.
    await this.repository.clearDxf(documentId);
  }

  @Get('documents/:documentId/export/dxf')
  @RequirePermissions('cad:view')
  async exportDxf(@Param('documentId', ParseUUIDPipe) documentId: string) {
    const row = await this.repository.getDocument(documentId);
    const document = row.cadDocument
      ? await this.cadDocuments.hydrateCadDocument(row.cadDocument)
      : null;
    const input = buildDxfExportInput(
      document,
      row.name,
      row.model,
      row.revision,
    );
    const exported = this.cadDocuments.buildLayoutDxf(input);
    // Fase 5: exportar el DXF entrega el dibujo completo — se audita como
    // acción sensible (actor/tenant/acción/referencia, igual que los saves).
    await this.repository.recordDxfExported(documentId, exported.filename);
    return {
      fileName: exported.filename,
      unit: exported.unit,
      dxf: exported.dxf,
    };
  }

  /* ─────────────────────────────── Bloques ──────────────────────────────── */

  @Get('blocks')
  @RequirePermissions('cad:view')
  async listBlocks(@Query() query: ListBlocksQueryDto) {
    return { items: await this.blocks.list(query.q ?? '') };
  }

  @Post('blocks')
  @RequirePermissions('cad:edit')
  createBlock(@Body() dto: CreateCadBlockDto) {
    return this.blocks.create(dto);
  }

  @Get('blocks/:blockId')
  @RequirePermissions('cad:view')
  async getBlock(@Param('blockId', ParseUUIDPipe) blockId: string) {
    const row = (await this.blocks.list()).find((b) => b.id === blockId);
    if (!row) throw new NotFoundException('Bloque no encontrado.');
    return row;
  }

  @Patch('blocks/:blockId')
  @RequirePermissions('cad:edit')
  updateBlock(
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Body() dto: UpdateCadBlockDto,
  ) {
    requireSomeField(dto);
    return this.blocks.update(blockId, dto);
  }

  @Delete('blocks/:blockId')
  @RequirePermissions('cad:edit')
  @HttpCode(204)
  async removeBlock(@Param('blockId', ParseUUIDPipe) blockId: string) {
    await this.blocks.remove(blockId);
  }

  /* ───────────────────────────── Intent / Vision ────────────────────────── */

  @Post('documents/:documentId/intent')
  @RequirePermissions('cad:edit')
  async interpretIntent(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: CadIntentDto,
  ) {
    const row = await this.repository.getDocument(documentId);
    return this.intent.interpret(
      row.model ?? row.name,
      row.revision ?? 'A',
      dto.prompt,
      () => this.intentContext(row, dto),
    );
  }

  @Post('vision')
  @RequirePermissions('cad:edit')
  async vectorize(@Body() dto: CadVisionDto) {
    // Por CUENTA, no por documento: cada llamada cuesta inferencia y la
    // imagen viaja completa. 10/min es holgado para un humano digitalizando.
    const context = this.tenantContext.get();
    await this.rateLimits.enforce(
      'cad.vision',
      [context?.tenant_id ?? '', context?.user_email ?? ''],
      API_RATE_LIMITS.cadVisionPerAccount,
    );
    return this.vision.vectorize(dto.image);
  }

  /**
   * Contexto de layout para el mediador NL→CAD: el que mandó el cliente, o
   * uno mínimo derivado del documento (unidad de `meta`; huella por defecto).
   * Se evalúa de forma diferida — en modo mock ni siquiera se hidrata.
   */
  private async intentContext(
    row: CadDocument,
    dto: CadIntentDto,
  ): Promise<CadIntentLayoutContext> {
    if (dto.context) {
      return {
        footprint: dto.context.footprint,
        stations: dto.context.stations.map((s) => ({
          id: s.id,
          station: s.station,
          x: s.x ?? null,
          y: s.y ?? null,
          w: s.w ?? null,
          h: s.h ?? null,
        })),
        connectors: dto.context.connectors,
      };
    }
    let unit = 'mm';
    try {
      if (row.cadDocument) {
        const document = await this.cadDocuments.hydrateCadDocument(
          row.cadDocument,
        );
        const meta =
          document.meta && typeof document.meta === 'object'
            ? (document.meta as Record<string, unknown>)
            : {};
        if (typeof meta.unit === 'string' && meta.unit) unit = meta.unit;
      }
    } catch {
      // Contexto degradado: la interpretación sigue con los defaults.
    }
    return {
      footprint: { unit, footprintW: 10_000, footprintH: 10_000 },
      stations: [],
      connectors: [],
    };
  }
}

/* ───────────────────────── Proyecciones de recurso ────────────────────────── */

function projectResource(row: CadProject) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    legacySourceId: row.legacySourceId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function documentSummary(row: CadDocument) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    model: row.model,
    revision: row.revision,
    cadDocumentVersion: row.cadDocumentVersion ?? 0,
    layers: row.layers,
    legacySourceId: row.legacySourceId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function versionSummary(row: CadDocumentVersion) {
  return {
    documentId: row.documentId,
    version: row.version,
    sha256: row.sha256,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function publicationResource(row: CadPublication) {
  return {
    id: row.id,
    documentId: row.documentId,
    paperSpaceIds: row.paperSpaceIds,
    fileName: row.fileName,
    sha256: row.sha256,
    bytes: row.bytes,
    publishedAt: row.publishedAt,
    publishedBy: row.publishedBy,
    legacySourceId: row.legacySourceId,
  };
}

/** El PATCH del contrato exige minProperties 1: un patch vacío es un 400. */
function requireSomeField(dto: object): void {
  if (!Object.values(dto).some((value) => value !== undefined)) {
    throw new BadRequestException('El patch debe incluir al menos un campo.');
  }
}

/**
 * Campo `payload` del multipart: string JSON con el token CAS. Sin token ⇒
 * el 400 contractual `cad_document_version_required`.
 */
function parseArchivePayload(payload?: string): number {
  if (!payload) {
    throw new BadRequestException({
      code: 'cad_document_version_required',
      message:
        'expectedCadDocumentVersion es obligatorio al guardar el documento CAD.',
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(payload) as unknown;
  } catch {
    throw new BadRequestException('El campo payload no contiene JSON válido.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('El campo payload debe ser un objeto.');
  }
  const record = raw as Record<string, unknown>;
  const unknownKey = Object.keys(record).find(
    (key) => key !== 'expectedCadDocumentVersion',
  );
  if (unknownKey) {
    throw new BadRequestException(
      `El campo payload sólo admite expectedCadDocumentVersion (recibido: ${unknownKey}).`,
    );
  }
  const expected = record.expectedCadDocumentVersion;
  if (expected === undefined || expected === null) {
    throw new BadRequestException({
      code: 'cad_document_version_required',
      message:
        'expectedCadDocumentVersion es obligatorio al guardar el documento CAD.',
    });
  }
  if (
    typeof expected !== 'number' ||
    !Number.isInteger(expected) ||
    expected < 0
  ) {
    throw new BadRequestException(
      'expectedCadDocumentVersion debe ser un entero >= 0.',
    );
  }
  return expected;
}
