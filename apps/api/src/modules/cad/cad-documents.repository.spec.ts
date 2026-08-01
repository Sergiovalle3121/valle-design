import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  TenantContextService,
  type TenantContext,
} from '../../common/tenant/tenant-context.service';
import { createTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';
import { CadDocumentsService } from '../cad-documents/cad-documents.service';
import { CadProject } from '../cad-documents/entities/cad-project.entity';
import { CadDocument } from '../cad-documents/entities/cad-document.entity';
import { CadDocumentVersion } from '../cad-documents/entities/cad-document-version.entity';
import { CadPublication } from '../cad-documents/entities/cad-publication.entity';
import { CadReviewSession } from '../cad-documents/entities/cad-review-session.entity';
import { CadComment } from '../cad-documents/entities/cad-comment.entity';
import { CadDocumentsRepository } from './cad-documents.repository';

const context = (tenant: string): TenantContext => ({
  tenant_id: tenant,
  organization_id: null,
  plant_id: null,
  user_email: 'cad@test',
  role: null,
  permissions: null,
  scopes: null,
});

const doc = (version: number, extra: Record<string, unknown> = {}) => ({
  meta: { schema: 3, version, unit: 'mm' },
  entities: [
    {
      id: 'line-1',
      type: 'line',
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
      layer: 'A-WALL',
    },
  ],
  ...extra,
});

describe('CadDocumentsRepository — ciclo de vida + CAS sobre tablas cad_*', () => {
  let source: DataSource;
  let tenant: TenantContextService;
  let repository: CadDocumentsRepository;

  beforeEach(async () => {
    source = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [
        CadProject,
        CadDocument,
        CadDocumentVersion,
        CadPublication,
        CadReviewSession,
        CadComment,
      ],
    });
    await source.initialize();
    tenant = new TenantContextService();
    const scoped = <T extends object>(entity: new () => T) =>
      createTenantScopedRepository(entity, source.manager, tenant, {
        strict: true,
      });
    repository = new CadDocumentsRepository(
      scoped(CadProject),
      scoped(CadDocument),
      scoped(CadDocumentVersion),
      scoped(CadPublication),
      tenant,
      new CadDocumentsService(),
    );
  });

  afterEach(async () => source.destroy());

  it('guarda con CAS: versión 0→1→2 y una fila de historial por versión', async () => {
    await tenant.run(context('tenant-a'), async () => {
      const document = await repository.createDocument({ name: 'Plano' });
      expect(document.cadDocumentVersion).toBe(0);

      const first = await repository.saveContent(document.id, {
        document: doc(1),
        expectedVersion: 0,
      });
      expect(first.cadDocumentVersion).toBe(1);
      expect(first.entityCount).toBe(1);
      expect(first.storedAsBlobPointer).toBe(false);

      const second = await repository.saveContent(document.id, {
        document: doc(2),
        expectedVersion: 1,
      });
      expect(second.cadDocumentVersion).toBe(2);

      const { items, total } = await repository.listVersions(document.id, {});
      expect(total).toBe(2);
      expect(items.map((v) => v.version)).toEqual([2, 1]);
      expect(items[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  it('un escritor DESFASADO recibe el 409 contractual con expected/current', async () => {
    await tenant.run(context('tenant-a'), async () => {
      const document = await repository.createDocument({ name: 'Plano' });
      await repository.saveContent(document.id, {
        document: doc(1),
        expectedVersion: 0,
      });

      // El mismo escritor reintenta con el token viejo (stale): CAS pierde.
      const stale = repository.saveContent(document.id, {
        document: doc(9),
        expectedVersion: 0,
      });
      await expect(stale).rejects.toThrow(ConflictException);
      const err = (await stale.catch((e) => e)) as ConflictException;
      expect(err.getResponse()).toMatchObject({
        code: 'cad_document_version_conflict',
        expected: 0,
        current: 1,
      });
    });
  });

  it('omitir el token CAS es el 400 contractual cad_document_version_required', async () => {
    await tenant.run(context('tenant-a'), async () => {
      const document = await repository.createDocument({ name: 'Plano' });
      const missing = repository.saveContent(document.id, {
        document: doc(1),
      });
      await expect(missing).rejects.toThrow(BadRequestException);
      const err = (await missing.catch((e) => e)) as BadRequestException;
      expect(err.getResponse()).toMatchObject({
        code: 'cad_document_version_required',
      });
    });
  });

  it('las publicaciones crean recibo inmutable + fila cad_publications vía CAS', async () => {
    await tenant.run(context('tenant-a'), async () => {
      const document = await repository.createDocument({ name: 'Plano' });
      await repository.saveContent(document.id, {
        document: doc(1, {
          paperSpaces: [
            { id: 'sheet-1', page: { width: 297, height: 210 } },
            {
              id: 'sheet-oculta',
              page: { width: 297, height: 210 },
              includeInPublish: false,
            },
          ],
        }),
        expectedVersion: 0,
      });

      const { publication, cadDocumentVersion } =
        await repository.recordPublication(document.id, {
          expectedCadDocumentVersion: 1,
          paperSpaceIds: ['sheet-1'],
          fileName: 'plano.pdf',
          sha256: 'a'.repeat(64),
          bytes: 1234,
        });
      expect(cadDocumentVersion).toBe(2);
      expect(publication.publishedBy).toBe('cad@test');

      const rows = await repository.listPublications(document.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].paperSpaceIds).toEqual(['sheet-1']);

      // Una hoja excluida del publish es un 400 del dominio.
      await expect(
        repository.recordPublication(document.id, {
          expectedCadDocumentVersion: 2,
          paperSpaceIds: ['sheet-oculta'],
          fileName: 'plano.pdf',
          sha256: 'b'.repeat(64),
          bytes: 99,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  it('aísla por tenant: el documento de A no existe para B', async () => {
    const id = await tenant.run(context('tenant-a'), async () => {
      const document = await repository.createDocument({ name: 'Privado' });
      return document.id;
    });
    await expect(
      tenant.run(context('tenant-b'), () => repository.getDocument(id)),
    ).rejects.toThrow(NotFoundException);
    // Y el CAS de B contra la fila de A tampoco puede avanzar.
    await expect(
      tenant.run(context('tenant-b'), () =>
        repository.saveContent(id, { document: doc(1), expectedVersion: 0 }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('el plano DXF de fondo vive junto al documento: put/get/clear', async () => {
    await tenant.run(context('tenant-a'), async () => {
      const document = await repository.createDocument({ name: 'Plano' });

      await expect(repository.getDxf(document.id)).rejects.toThrow(
        NotFoundException,
      );

      const uploaded = await repository.setDxf(document.id, {
        name: 'fondo.dxf',
        data: '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n',
        placement: { scale: 2, opacity: 0.8 },
      });
      expect(uploaded.name).toBe('fondo.dxf');
      expect(uploaded.placement.scale).toBe(2);
      expect(uploaded.placement.opacity).toBe(0.8);

      await repository.clearDxf(document.id);
      await expect(repository.getDxf(document.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
