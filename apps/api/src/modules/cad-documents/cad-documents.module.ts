import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SfCadBlock } from './entities/sf-cad-block.entity';
import { CadProject } from './entities/cad-project.entity';
import { CadDocument } from './entities/cad-document.entity';
import { CadDocumentVersion } from './entities/cad-document-version.entity';
import { CadPublication } from './entities/cad-publication.entity';
import { CadReviewSession } from './entities/cad-review-session.entity';
import { CadComment } from './entities/cad-comment.entity';
import { CadBlocksService } from './cad-blocks.service';
import { CadDocumentsService } from './cad-documents.service';
import { CadIntentService } from './cad-intent.service';
import { CadVisionService } from './cad-vision.service';
import { CadLegacyProjectionService } from './cad-legacy-projection.service';
import { DocumentsModule } from '../documents/documents.module';
import { EventLedgerModule } from '../event-ledger/event-ledger.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { DOCUMENT_BLOB_STORE } from '../documents/blob/document-blob-store';
import type { DocumentBlobStore } from '../documents/blob/document-blob-store';
import { provideTenantScopedRepository } from '../../common/tenant/tenant-scoped.repository';
import { CAD_BLOB_STORE } from './ports/cad-blob-store.port';
import { CAD_AI_PROVIDER } from './ports/cad-ai-provider.port';
import { CAD_AUDIT_PUBLISHER } from './ports/cad-audit-publisher.port';
import { CAD_EVENT_PUBLISHER } from './ports/cad-event-publisher.port';
import {
  ENTITLEMENT_CLIENT,
  PLATFORM_IDENTITY_CLIENT,
  USAGE_METER,
} from './ports/platform-client.ports';
import { EnterpriseBlobStoreAdapter } from './enterprise-blob-store.adapter';
import { CideAiProviderAdapter } from './cide-ai-provider.adapter';
import { EnterpriseCadAuditPublisher } from './enterprise-audit-publisher.adapter';
import { NoopCadEventPublisher } from './noop-event-publisher.adapter';
import {
  EnterpriseEntitlementClient,
  NoopUsageMeter,
  TenantContextIdentityClient,
} from './platform-client.adapter';

/**
 * CAD Documents (WP2a/WP2b/WP2c/WP3) — kernel CAD puro, futuro corazón del
 * producto Design. Agrupa la biblioteca de bloques, la validación/
 * almacenamiento del CadDocument, la lógica de dominio del documento canónico
 * (CadDocumentsService), el puente NL→CAD y Vision→CAD, sin conocer nada del
 * dominio industrial (line-engineering lo importa, nunca al revés). En Fase 3
 * este módulo se extrae entero como producto independiente.
 *
 * WP3 añade el modelo de datos CAD PROPIO (tablas cad_*: proyectos, documentos,
 * versiones, publicaciones, sesiones de revisión y comentarios) y la proyección
 * de compatibilidad desde la tabla legacy (CadLegacyProjectionService), sin
 * tocar `sf_line_layouts`.
 *
 * WP2c invierte las dependencias de infraestructura: el dominio CAD sólo
 * conoce los PUERTOS neutrales de `./ports/`, y este módulo los satisface con
 * adaptadores enterprise (`*.adapter.ts`). Los símbolos de `../documents` y
 * `../ai` viven ÚNICAMENTE en los adaptadores y en este wiring; en Fase 3 el
 * repo Design provee sus propias implementaciones sin tocar el dominio.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SfCadBlock,
      CadProject,
      CadDocument,
      CadDocumentVersion,
      CadPublication,
      CadReviewSession,
      CadComment,
    ]),
    // Aporta DOCUMENT_BLOB_STORE, que el adaptador envuelve como CAD_BLOB_STORE.
    DocumentsModule,
    // Aporta EventLedgerService para el adaptador de auditoría CAD.
    EventLedgerModule,
    // Aporta EntitlementsService (autoridad comercial) para ENTITLEMENT_CLIENT.
    EntitlementsModule,
  ],
  providers: [
    CadBlocksService,
    CadDocumentsService,
    CadIntentService,
    CadVisionService,
    CadLegacyProjectionService,
    provideTenantScopedRepository(SfCadBlock, { strict: true }),
    provideTenantScopedRepository(CadProject, { strict: true }),
    provideTenantScopedRepository(CadDocument, { strict: true }),
    provideTenantScopedRepository(CadDocumentVersion, { strict: true }),
    provideTenantScopedRepository(CadPublication, { strict: true }),
    provideTenantScopedRepository(CadReviewSession, { strict: true }),
    provideTenantScopedRepository(CadComment, { strict: true }),
    // ── Puertos WP2c: cada token se satisface con su adaptador enterprise ──
    {
      provide: CAD_BLOB_STORE,
      // Sin blob store subyacente el puerto queda ausente (undefined) para que
      // CadDocumentsService conserve su 503 explícito al exigirlo.
      inject: [{ token: DOCUMENT_BLOB_STORE, optional: true }],
      useFactory: (inner?: DocumentBlobStore) =>
        inner ? new EnterpriseBlobStoreAdapter(inner) : undefined,
    },
    { provide: CAD_AI_PROVIDER, useClass: CideAiProviderAdapter },
    { provide: CAD_AUDIT_PUBLISHER, useClass: EnterpriseCadAuditPublisher },
    // Fase 2 sustituye el no-op por el publicador real de eventos design.*.
    { provide: CAD_EVENT_PUBLISHER, useClass: NoopCadEventPublisher },
    {
      provide: PLATFORM_IDENTITY_CLIENT,
      useClass: TenantContextIdentityClient,
    },
    { provide: ENTITLEMENT_CLIENT, useClass: EnterpriseEntitlementClient },
    { provide: USAGE_METER, useClass: NoopUsageMeter },
  ],
  exports: [
    CadBlocksService,
    CadDocumentsService,
    CadIntentService,
    CadVisionService,
    CadLegacyProjectionService,
    CAD_BLOB_STORE,
    CAD_AI_PROVIDER,
    CAD_AUDIT_PUBLISHER,
    CAD_EVENT_PUBLISHER,
    PLATFORM_IDENTITY_CLIENT,
    ENTITLEMENT_CLIENT,
    USAGE_METER,
  ],
})
export class CadDocumentsModule {}
