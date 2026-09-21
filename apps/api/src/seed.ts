import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { TenantContextService } from './common/tenant/tenant-context.service';
import type { TenantContext } from './common/tenant/tenant-context.service';
import { CadDocumentsRepository } from './modules/cad/cad-documents.repository';
import { validateCadDocumentPayload } from './modules/cad-documents/cad-document-validation';
import { User } from './modules/identity/entities/identity.entity';
import { Organization } from './modules/organizations/entities/organization.entity';

/**
 * Seed mínimo REAL de Valle Design: tenant demo + proyecto + documento CAD de
 * ejemplo VÁLIDO (pasa la validación real del dominio) guardado por el ciclo
 * de vida real (CAS + historial de versiones). Idempotente: correrlo dos
 * veces no duplica nada.
 *
 * Uso:
 *   DATABASE_URL=postgres://... npm run seed        (o sin BD → dev.sqlite)
 */
// UUID estable del fixture: los eventos y el consumo usan columnas UUID.
export const SEED_TENANT_ID = 'c66b4598-96be-4c1b-a200-1f144fd0cc97';
export const SEED_OWNER_ID = '1a56374a-1fe3-45dd-b444-97e2fb40ef59';
const SEED_OWNER_EMAIL = 'seed-demo@valle-design.invalid';
const SEED_ORGANIZATION_SLUG = 'valle-demo-seed';
export const SEED_ACTOR = 'demo@valle.design';
export const SEED_PROJECT_NAME = 'Proyecto demo Valle';
export const SEED_DOCUMENT_NAME = 'Plano demo';

async function ensureSeedOrganization(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    const owner = await manager.findOneBy(User, { id: SEED_OWNER_ID });
    if (owner && owner.email !== SEED_OWNER_EMAIL) {
      throw new Error('El UUID del propietario demo pertenece a otro usuario.');
    }
    if (!owner) {
      // Propietario técnico del fixture; no crea credenciales ni acceso web.
      await manager.insert(User, {
        id: SEED_OWNER_ID,
        email: SEED_OWNER_EMAIL,
        displayName: 'Propietario del seed demo',
      });
    }
    const organization = await manager.findOneBy(Organization, {
      id: SEED_TENANT_ID,
    });
    if (
      organization &&
      (organization.ownerUserId !== SEED_OWNER_ID ||
        organization.slug !== SEED_ORGANIZATION_SLUG)
    ) {
      throw new Error('El UUID de la organización demo ya tiene otro destino.');
    }
    if (!organization) {
      await manager.insert(Organization, {
        id: SEED_TENANT_ID,
        name: 'Organización demo Valle',
        slug: SEED_ORGANIZATION_SLUG,
        ownerUserId: SEED_OWNER_ID,
      });
    }
  });
}

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
        layer: 'A-WALL',
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

export async function seed(): Promise<void> {
  // Un fixture inválido no debe dejar un proyecto o documento a medio crear.
  const content = demoCadDocument();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const tenantCtx = app.get(TenantContextService);
    const repository = app.get(CadDocumentsRepository);
    await ensureSeedOrganization(app.get(DataSource));

    const context: TenantContext = {
      tenant_id: SEED_TENANT_ID,
      organization_id: SEED_TENANT_ID,
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
      } else {
        const existing = await repository.getDocument(document.id);
        // Sólo reanudar la fila vacía creada por este seed tras un fallo.
        // Un documento guardado, importado o creado por otra persona se conserva.
        const provisional =
          existing.name === SEED_DOCUMENT_NAME &&
          existing.projectId === project.id &&
          existing.created_by === SEED_ACTOR &&
          existing.model === 'AXOS-CAD-STUDIO' &&
          existing.revision === 'UNIVERSAL' &&
          existing.cadDocumentVersion === 0 &&
          existing.cadDocument === null &&
          existing.dxfData === null &&
          existing.layers === null;
        if (!provisional) {
          console.log(
            `[seed] Documento: ${document.id} ya existía (versión CAS ${existing.cadDocumentVersion}); nada que hacer.`,
          );
          return;
        }
      }
      const saved = await repository.saveContent(document.id, {
        document: content,
        expectedVersion: 0,
      });
      console.log(
        `[seed] Documento: ${document.id} guardado (versión CAS ${saved.cadDocumentVersion}, ${saved.entityCount} entidades).`,
      );
    });
    console.log('✅ Seed demo completo.');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void seed().catch((err) => {
    console.error('❌ Seed falló:', err);
    process.exit(1);
  });
}
