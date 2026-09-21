import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { DataSource, type EntityManager } from 'typeorm';
import { TenantContextService } from './common/tenant/tenant-context.service';
import * as validation from './modules/cad-documents/cad-document-validation';
import { User } from './modules/identity/entities/identity.entity';
import { Organization } from './modules/organizations/entities/organization.entity';
import {
  demoCadDocument,
  seed,
  SEED_ACTOR,
  SEED_DOCUMENT_NAME,
  SEED_OWNER_ID,
  SEED_PROJECT_NAME,
  SEED_TENANT_ID,
} from './seed';

jest.mock('./app.module', () => ({ AppModule: class AppModule {} }));

describe('seed demo', () => {
  const project = { id: 'project-fixture', name: SEED_PROJECT_NAME };
  const provisional = () => ({
    id: 'document-fixture',
    name: SEED_DOCUMENT_NAME,
    projectId: project.id,
    created_by: SEED_ACTOR,
    model: 'AXOS-CAD-STUDIO',
    revision: 'UNIVERSAL',
    cadDocumentVersion: 0,
    cadDocument: null,
    dxfData: null,
    layers: null,
  });
  const tenantCtx = new TenantContextService();
  const repository = {
    listProjects: jest.fn(),
    createProject: jest.fn(),
    listDocuments: jest.fn(),
    createDocument: jest.fn(),
    getDocument: jest.fn(),
    saveContent: jest.fn(),
  };
  const close = jest.fn();
  const manager = { findOneBy: jest.fn(), insert: jest.fn() };
  const dataSource = {
    transaction: jest.fn((fn: (tx: EntityManager) => Promise<void>) =>
      fn(manager as unknown as EntityManager),
    ),
  };
  let bootstrap: jest.SpyInstance<Promise<INestApplicationContext>>;

  beforeEach(() => {
    manager.findOneBy.mockResolvedValue(null);
    manager.insert.mockResolvedValue({});
    repository.listProjects.mockResolvedValue({ items: [] });
    repository.createProject.mockResolvedValue(project);
    repository.listDocuments.mockResolvedValue({ items: [] });
    repository.createDocument.mockResolvedValue(provisional());
    repository.getDocument.mockResolvedValue(provisional());
    repository.saveContent.mockImplementation(() => {
      expect(tenantCtx.getTenantId()).toBe(SEED_TENANT_ID);
      expect(tenantCtx.getOrganizationId()).toBe(SEED_TENANT_ID);
      return Promise.resolve({ cadDocumentVersion: 1, entityCount: 6 });
    });
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    bootstrap = jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockResolvedValue({
        get: (token: unknown) => {
          if (token === DataSource) return dataSource;
          return token === TenantContextService ? tenantCtx : repository;
        },
        close,
      } as unknown as INestApplicationContext);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('valida el dibujo real y usa un tenant compatible con PostgreSQL UUID', () => {
    const content = demoCadDocument();
    expect(isUUID(SEED_TENANT_ID)).toBe(true);
    expect(isUUID(SEED_OWNER_ID)).toBe(true);
    expect(content.entities).toHaveLength(6);
    expect(content.entities).toContainEqual(
      expect.objectContaining({ id: 'room-1', layer: 'A-WALL' }),
    );
  });

  it('valida antes de abrir la aplicación o crear filas', async () => {
    jest
      .spyOn(validation, 'validateCadDocumentPayload')
      .mockImplementationOnce(() => {
        throw new Error('fixture inválido');
      });
    await expect(seed()).rejects.toThrow('fixture inválido');
    expect(bootstrap).not.toHaveBeenCalled();
    expect(repository.createProject).not.toHaveBeenCalled();
    expect(repository.createDocument).not.toHaveBeenCalled();
  });

  it('crea el documento con el ciclo CAS inicial y cierra la aplicación', async () => {
    await seed();
    expect(manager.insert.mock.calls).toEqual([
      [
        User,
        {
          id: SEED_OWNER_ID,
          email: 'seed-demo@valle-design.invalid',
          displayName: 'Propietario del seed demo',
        },
      ],
      [
        Organization,
        {
          id: SEED_TENANT_ID,
          name: 'Organización demo Valle',
          slug: 'valle-demo-seed',
          ownerUserId: SEED_OWNER_ID,
        },
      ],
    ]);
    expect(repository.createDocument).toHaveBeenCalledWith({
      name: SEED_DOCUMENT_NAME,
      projectId: project.id,
      model: 'AXOS-CAD-STUDIO',
      revision: 'UNIVERSAL',
    });
    expect(repository.saveContent).toHaveBeenCalledWith('document-fixture', {
      document: demoCadDocument(),
      expectedVersion: 0,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reanuda sólo su documento provisional vacío sin duplicar filas', async () => {
    manager.findOneBy.mockImplementation((entity: unknown) =>
      Promise.resolve(
        entity === User
          ? { id: SEED_OWNER_ID, email: 'seed-demo@valle-design.invalid' }
          : {
              id: SEED_TENANT_ID,
              slug: 'valle-demo-seed',
              ownerUserId: SEED_OWNER_ID,
            },
      ),
    );
    repository.listProjects.mockResolvedValue({ items: [project] });
    repository.listDocuments.mockResolvedValue({ items: [provisional()] });
    await seed();
    expect(repository.createProject).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
    expect(repository.createDocument).not.toHaveBeenCalled();
    expect(repository.saveContent).toHaveBeenCalledWith('document-fixture', {
      document: demoCadDocument(),
      expectedVersion: 0,
    });
  });

  it.each([
    ['propietario ajeno', User, { email: 'otra-persona@example.test' }],
    ['organización ajena', Organization, { ownerUserId: 'other-owner' }],
    [
      'slug cambiado',
      Organization,
      { ownerUserId: SEED_OWNER_ID, slug: 'otro-slug' },
    ],
  ])('rechaza una colisión del fixture: %s', async (_name, entity, row) => {
    manager.findOneBy.mockImplementation((target: unknown) =>
      Promise.resolve(target === entity ? row : null),
    );
    await expect(seed()).rejects.toThrow('UUID');
    expect(repository.createProject).not.toHaveBeenCalled();
    expect(repository.createDocument).not.toHaveBeenCalled();
    expect(repository.saveContent).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['versión guardada', { cadDocumentVersion: 1 }],
    ['contenido CAD incluso en CAS0', { cadDocument: { entities: [] } }],
    ['fondo DXF', { dxfData: 'DXF existente' }],
    ['capas personalizadas', { layers: [{ name: 'Personalizada' }] }],
    ['otro creador', { created_by: 'otra-persona@example.test' }],
    ['otro modelo', { model: 'CUSTOM' }],
    ['otra revisión', { revision: 'CUSTOM' }],
    ['nombre cambiado', { name: 'Mi dibujo' }],
    ['proyecto cambiado', { projectId: 'other-project' }],
  ] satisfies Array<[string, Record<string, unknown>]>)(
    'conserva el documento existente: %s',
    async (_name, change) => {
      repository.listProjects.mockResolvedValue({ items: [project] });
      repository.listDocuments.mockResolvedValue({ items: [provisional()] });
      repository.getDocument.mockResolvedValue({ ...provisional(), ...change });
      await seed();
      expect(repository.createDocument).not.toHaveBeenCalled();
      expect(repository.saveContent).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
    },
  );

  it('propaga el conflicto CAS y cierra sin intentar sobrescribir', async () => {
    repository.listDocuments.mockResolvedValue({ items: [provisional()] });
    repository.saveContent.mockRejectedValueOnce(new Error('CAS conflict'));
    await expect(seed()).rejects.toThrow('CAS conflict');
    expect(repository.saveContent).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
