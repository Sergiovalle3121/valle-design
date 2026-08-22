import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TenantContextService } from './common/tenant/tenant-context.service';
import type { TenantContext } from './common/tenant/tenant-context.service';
import { CadDocumentsRepository } from './modules/cad/cad-documents.repository';
import { validateCadDocumentPayload } from './modules/cad-documents/cad-document-validation';

/**
 * Seed mínimo REAL de Valle Design: tenant demo + proyecto + documento CAD de
 * ejemplo VÁLIDO (pasa la validación real del dominio) guardado por el ciclo
 * de vida real (CAS + historial de versiones). Idempotente: correrlo dos
 * veces no duplica nada.
 *
 * Uso:
 *   DATABASE_URL=postgres://... npm run seed        (o sin BD → dev.sqlite)
 */
export const SEED_TENANT_ID = 'demo-tenant';
export const SEED_ACTOR = 'demo@valle.design';
export const SEED_PROJECT_NAME = 'Proyecto demo Valle';
export const SEED_DOCUMENT_NAME = 'Plano demo';

/** Documento canónico de ejemplo (formato meta.schema v3, entidades reales). */
/**
 * Documento de demostración: una planta arquitectónica simple —cuatro muros
 * cerrados, una recámara acotable y su rótulo— más una lámina A4 a escala 1:100.
 * Es CAD general a propósito: lo primero que ve quien estrena el producto no
 * debe ser una celda de ensamble de una línea de producción.
 */
export function demoCadDocument(): Record<string, unknown> {
  return validateCadDocumentPayload({
    meta: { schema: 3, version: 1, unit: 'mm' },
    entities: [
      {
        id: 'wall-1',
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 12000, y: 0 },
        layer: 'A-WALL',
      },
      {
        id: 'wall-2',
        type: 'line',
        start: { x: 12000, y: 0 },
        end: { x: 12000, y: 8000 },
        layer: 'A-WALL',
      },
      {
        id: 'wall-3',
        type: 'line',
        start: { x: 12000, y: 8000 },
        end: { x: 0, y: 8000 },
        layer: 'A-WALL',
      },
      {
        id: 'wall-4',
        type: 'line',
        start: { x: 0, y: 8000 },
        end: { x: 0, y: 0 },
        layer: 'A-WALL',
      },
      {
        id: 'room-1',
        type: 'box',
        x: 1000,
        y: 1000,
        w: 3000,
        h: 2000,
        kind: 'zone',
        label: 'Recamara principal',
      },
      {
        id: 'label-1',
        type: 'text',
        position: { x: 1200, y: 1200 },
        text: 'PLANTA BAJA',
        layer: 'TEXTO',
      },
    ],
    paperSpaces: [
      {
        id: 'sheet-1',
        page: { width: 297, height: 210 },
        includeInPublish: true,
        viewports: [
          {
            id: 'vp-1',
            scale: 0.01,
            paperBounds: { x: 10, y: 10, width: 277, height: 190 },
            modelBounds: { x: 0, y: 0, width: 12000, height: 8000 },
          },
        ],
      },
    ],
  });
}

async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const tenantCtx = app.get(TenantContextService);
    const repository = app.get(CadDocumentsRepository);

    const context: TenantContext = {
      tenant_id: SEED_TENANT_ID,
      organization_id: null,
      plant_id: null,
      user_email: SEED_ACTOR,
      role: 'Admin',
      permissions: [
        'cad:view',
        'cad:edit',
        'cad:review',
        'cad:publish',
        'cad:admin',
      ],
      scopes: null,
    };

    await tenantCtx.run(context, async () => {
      // Proyecto demo (idempotente por nombre dentro del tenant).
      const projects = await repository.listProjects({ q: SEED_PROJECT_NAME });
      const project =
        projects.items.find((p) => p.name === SEED_PROJECT_NAME) ??
        (await repository.createProject({
          name: SEED_PROJECT_NAME,
          description: 'Proyecto de demostración creado por el seed.',
        }));
      console.log(`[seed] Proyecto: ${project.id} (${project.name})`);

      // Documento demo con contenido REAL guardado por el ciclo CAS.
      const documents = await repository.listDocuments({
        projectId: project.id,
        q: SEED_DOCUMENT_NAME,
      });
      let document = documents.items.find((d) => d.name === SEED_DOCUMENT_NAME);
      if (!document) {
        document = await repository.createDocument({
          name: SEED_DOCUMENT_NAME,
          projectId: project.id,
          // Centinela PERSISTIDO del estudio universal: es el mismo valor que
          // llevan todos los documentos ya guardados. No se renombra — ver
          // IDENTITY.md y packages/contracts/src/legacy/.
          model: 'AXOS-CAD-STUDIO',
          revision: 'UNIVERSAL',
        });
        const saved = await repository.saveContent(document.id, {
          document: demoCadDocument(),
          expectedVersion: 0,
        });
        console.log(
          `[seed] Documento: ${document.id} guardado (versión CAS ${saved.cadDocumentVersion}, ${saved.entityCount} entidades).`,
        );
      } else {
        console.log(
          `[seed] Documento: ${document.id} ya existía (versión CAS ${document.cadDocumentVersion}); nada que hacer.`,
        );
      }
    });
    console.log('✅ Seed demo completo.');
  } finally {
    await app.close();
  }
}

seed().catch((err) => {
  console.error('❌ Seed falló:', err);
  process.exit(1);
});
