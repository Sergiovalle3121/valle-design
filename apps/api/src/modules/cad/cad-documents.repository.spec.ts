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
import { DesignBlob } from '../blob-store/entities/design-blob.entity';
import { DatabaseBlobStore } from '../blob-store/design-blob.store';
import { DesignBlobStoreAdapter } from '../cad-documents/design-blob-store.adapter';
import { CadDocumentsRepository } from './cad-documents.repository';

const context = (tenant: string, email = 'cad@test'): TenantContext => ({
  tenant_id: tenant,
  organization_id: null,
  plant_id: null,
  user_email: email,
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
        DesignBlob,
      ],
    });
    await source.initialize();
    tenant = new TenantContextService();
    const scoped = <T extends object>(entity: new () => T) =>
      createTenantScopedRepository(entity, source.manager, tenant, {
        strict: true,
      });
    const blobStore = new DatabaseBlobStore(scoped(DesignBlob), tenant);
    repository = new CadDocumentsRepository(
      scoped(CadProject),
      scoped(CadDocument),
      scoped(CadDocumentVersion),
      scoped(CadPublication),
      tenant,
      new CadDocumentsService(new DesignBlobStoreAdapter(blobStore)),
      undefined,
      undefined,
      undefined,
      source,
    );
  });

  afterEach(async () => source.destroy());

  it('normaliza nombres y rechaza whitespace-only también en llamadas internas', async () => {
    await tenant.run(context('tenant-a'), async () => {
      await expect(
        repository.createProject({ name: ' \t\r\n ' }),
      ).rejects.toThrow(BadRequestException);
      await expect(repository.createDocument({ name: '   ' })).rejects.toThrow(
        BadRequestException,
      );

      const project = await repository.createProject({
        name: '  Proyecto norte  ',
      });
      const document = await repository.createDocument({
        name: '  Plano uno  ',
        projectId: project.id,
      });
      expect(project.name).toBe('Proyecto norte');
      expect(document.name).toBe('Plano uno');

      await expect(
        repository.updateProject(project.id, { name: '  ' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        repository.updateDocumentMeta(document.id, { name: '\t' }),
      ).rejects.toThrow(BadRequestException);
      expect((await repository.getProject(project.id)).name).toBe(
        'Proyecto norte',
      );
      expect((await repository.getDocument(document.id)).name).toBe(
        'Plano uno',
      );
    });
  });

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

  it('revierte el blob comprimido cuando el CAS pierde', async () => {
    await tenant.run(context('tenant-a'), async () => {
      const document = await repository.createDocument({ name: 'Grande' });
      await repository.saveContent(document.id, {
        document: doc(1, { marker: 'winner' }),
        expectedVersion: 0,
        forceArchive: true,
      });
      expect(await source.getRepository(DesignBlob).count()).toBe(1);

      await expect(
        repository.saveContent(document.id, {
          document: doc(2, { marker: 'stale-and-different' }),
          expectedVersion: 0,
          forceArchive: true,
        }),
      ).rejects.toThrow(ConflictException);
      expect(await source.getRepository(DesignBlob).count()).toBe(1);
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

  it('descarta sólo el provisional vacío del mismo tenant y actor', async () => {
    const documentId = await tenant.run(
      context('tenant-a', 'creator@test.invalid'),
      async () =>
        (
          await repository.createDocument({
            name: 'Importación provisional',
          })
        ).id,
    );

    await expect(
      tenant.run(context('tenant-a', 'other@test.invalid'), () =>
        repository.discardProvisionalDocument(documentId),
      ),
    ).rejects.toThrow('Sólo quien creó');
    await expect(
      tenant.run(context('tenant-b', 'creator@test.invalid'), () =>
        repository.discardProvisionalDocument(documentId),
      ),
    ).rejects.toThrow(NotFoundException);

    await tenant.run(context('tenant-a', 'creator@test.invalid'), () =>
      repository.discardProvisionalDocument(documentId),
    );
    await expect(
      tenant.run(context('tenant-a', 'creator@test.invalid'), () =>
        repository.getDocument(documentId),
      ),
    ).rejects.toThrow(NotFoundException);

    const discarded = await source
      .getRepository(CadDocument)
      .findOne({ where: { id: documentId }, withDeleted: true });
    expect(discarded?.deleted_at).toBeInstanceOf(Date);
  });

  it('rechaza el descarte provisional después del primer guardado', async () => {
    await tenant.run(context('tenant-a'), async () => {
      const document = await repository.createDocument({ name: 'Persistido' });
      await repository.saveContent(document.id, {
        document: doc(1),
        expectedVersion: 0,
      });

      await expect(
        repository.discardProvisionalDocument(document.id),
      ).rejects.toThrow(ConflictException);
      expect((await repository.getDocument(document.id)).deleted_at).toBeNull();
    });
  });

  it('resuelve model+revision exactos después de >200 filas y mantiene el aislamiento por tenant', async () => {
    let tenantATargetId = '';
    await tenant.run(context('tenant-a'), async () => {
      const target = await repository.createDocument({
        name: 'Documento histórico',
        model: 'AXOS-CAD-STUDIO',
        revision: 'UNIVERSAL',
      });
      tenantATargetId = target.id;

      // Fuerza que el documento histórico quede fuera de la primera página.
      await source.getRepository(CadDocument).update(target.id, {
        created_at: new Date('2000-01-01T00:00:00.000Z'),
      });
      for (let index = 0; index < 205; index += 1) {
        await repository.createDocument({
          name: `Documento reciente ${index}`,
          model:
            index % 2 === 0 ? 'AXOS-CAD-STUDIO-ARCHIVE' : 'AXOS-CAD-STUDIO',
          revision: index % 2 === 0 ? 'UNIVERSAL' : 'UNIVERSAL-OLD',
        });
      }

      const firstPage = await repository.listDocuments({ limit: 200 });
      expect(firstPage.total).toBe(206);
      expect(firstPage.items).toHaveLength(200);
      expect(firstPage.items.map((item) => item.id)).not.toContain(target.id);
      const secondPage = await repository.listDocuments({
        limit: 200,
        offset: 200,
      });
      expect(secondPage.total).toBe(206);
      expect(secondPage.items.map((item) => item.id)).toContain(target.id);

      const exact = await repository.listDocuments({
        model: 'AXOS-CAD-STUDIO',
        revision: 'UNIVERSAL',
        limit: 1,
      });
      expect(exact.total).toBe(1);
      expect(exact.items.map((item) => item.id)).toEqual([target.id]);
    });

    let tenantBTargetId = '';
    await tenant.run(context('tenant-b'), async () => {
      const target = await repository.createDocument({
        name: 'Documento histórico B',
        model: 'AXOS-CAD-STUDIO',
        revision: 'UNIVERSAL',
      });
      tenantBTargetId = target.id;
      const exact = await repository.listDocuments({
        model: 'AXOS-CAD-STUDIO',
        revision: 'UNIVERSAL',
        limit: 1,
      });
      expect(exact.total).toBe(1);
      expect(exact.items.map((item) => item.id)).toEqual([target.id]);
    });

    expect(tenantBTargetId).not.toBe(tenantATargetId);
    await tenant.run(context('tenant-a'), async () => {
      const exact = await repository.listDocuments({
        model: 'AXOS-CAD-STUDIO',
        revision: 'UNIVERSAL',
        limit: 1,
      });
      expect(exact.items.map((item) => item.id)).toEqual([tenantATargetId]);
      expect(exact.items.map((item) => item.id)).not.toContain(tenantBTargetId);
    });
  });

  it('la búsqueda q pagina y cuenta EN SQL: total real, escapes y sin campos pesados', async () => {
    await tenant.run(context('tenant-a'), async () => {
      await repository.createDocument({ name: 'Planta Baja Norte' });
      await repository.createDocument({ name: 'planta baja SUR' });
      await repository.createDocument({ name: 'Corte 100% real' });
      await repository.createDocument({ name: 'Azotea' });
      const conContenido = await repository.createDocument({
        name: 'Planta Alta',
      });
      await repository.saveContent(conContenido.id, {
        document: doc(1),
        expectedVersion: 0,
      });

      // Total REAL del filtro (antes: mentía por encima del tope de 1000),
      // insensible a mayúsculas y paginado en SQL, no en memoria.
      const primera = await repository.listDocuments({ q: 'planta', limit: 2 });
      expect(primera.total).toBe(3);
      expect(primera.items).toHaveLength(2);
      const segunda = await repository.listDocuments({
        q: 'planta',
        limit: 2,
        offset: 2,
      });
      expect(segunda.total).toBe(3);
      expect(segunda.items).toHaveLength(1);

      // `%` literal en el término NO es comodín: se escapa.
      const porciento = await repository.listDocuments({ q: '100%' });
      expect(porciento.total).toBe(1);
      expect(porciento.items[0].name).toBe('Corte 100% real');
      expect((await repository.listDocuments({ q: '1000' })).total).toBe(0);

      // El listado NO arrastra el documento canónico ni el DXF crudo — son
      // los campos que hacen pesar decenas de MB a una respuesta de resumen.
      const listado = await repository.listDocuments({});
      expect(listado.items.map((item) => item.name)).toContain('Planta Alta');
      for (const item of listado.items) {
        expect(item.cadDocument).toBeUndefined();
        expect(item.dxfData).toBeUndefined();
      }

      // Y la apertura individual SÍ trae el contenido: la proyección es del
      // listado, no del documento.
      const abierto = await repository.getDocument(conContenido.id);
      expect(abierto.cadDocument).not.toBeNull();

      // Proyectos: misma semántica de búsqueda.
      await repository.createProject({ name: 'Residencial Valle' });
      await repository.createProject({ name: 'Nave industrial' });
      const proyectos = await repository.listProjects({ q: 'valle' });
      expect(proyectos.total).toBe(1);
      expect(proyectos.items[0].name).toBe('Residencial Valle');
    });
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
