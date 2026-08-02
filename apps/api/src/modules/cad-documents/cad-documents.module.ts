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
import { BlobStoreModule } from '../blob-store/blob-store.module';
import { DatabaseBlobStore } from '../blob-store/design-blob.store';
import { AuditLogModule } from '../audit-log/audit-log.module';
import {
  getTenantRepositoryToken,
  provideTenantScopedRepository,
} from '../../common/tenant/tenant-scoped.repository';
import { CAD_BLOB_STORE } from './ports/cad-blob-store.port';
import { CAD_AI_PROVIDER } from './ports/cad-ai-provider.port';
import { CAD_AUDIT_PUBLISHER } from './ports/cad-audit-publisher.port';
import { CommercialModule } from '../commercial/commercial.module';
import { PLATFORM_IDENTITY_CLIENT } from './ports/platform-client.ports';
import { DesignBlobStoreAdapter } from './design-blob-store.adapter';
import { CideAiProviderAdapter } from './cide-ai-provider.adapter';
import { DesignCadAuditPublisher } from './design-audit-publisher.adapter';
import { TenantContextIdentityClient } from './platform-client.adapter';
import { ReviewLinkService } from './review-link.service';

/**
 * CAD Documents — kernel CAD puro, corazón del producto Design. Agrupa la
 * biblioteca de bloques, la validación/almacenamiento del CadDocument, la
 * lógica de dominio del documento canónico (CadDocumentsService), el puente
 * NL→CAD y Vision→CAD, y el modelo de datos CAD propio (tablas cad_*).
 *
 * El dominio sólo conoce los PUERTOS neutrales de `./ports/`; en este repo
 * (Fase 3 de la separación) los adaptadores enterprise quedaron SUSTITUIDOS
 * por implementaciones propias de Design:
 * - CAD_BLOB_STORE  → DesignBlobStoreAdapter sobre DatabaseBlobStore
 *   (`design_blobs`, content-addressed en la base).
 * - CAD_AUDIT_PUBLISHER → DesignCadAuditPublisher sobre la bitácora propia
 *   `design_audit_log`.
 * - ENTITLEMENT_SERVICE → adaptador PostgreSQL local;
 *   cliente HTTP REAL del contrato platform-api.v1.yaml — Fase 5, cierra el
 *   TODO-R3 — con caché breve por tenant y fail-closed).
 * - PLATFORM_IDENTITY_CLIENT → TenantContextIdentityClient (contexto
 *   autenticado propio poblado por CadAuthGuard + TenantInterceptor).
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
    // Aporta DatabaseBlobStore, que el adaptador envuelve como CAD_BLOB_STORE.
    BlobStoreModule,
    // Aporta DesignAuditLog para el adaptador de auditoría CAD.
    AuditLogModule,
    CommercialModule,
  ],
  providers: [
    CadBlocksService,
    CadDocumentsService,
    CadIntentService,
    CadVisionService,
    CadLegacyProjectionService,
    // Canje server-owned de review links (Fase 5): lookup GLOBAL por
    // token_hash — el tenant sale de la fila de la sesión, nunca del cliente.
    ReviewLinkService,
    provideTenantScopedRepository(SfCadBlock, { strict: true }),
    provideTenantScopedRepository(CadProject, { strict: true }),
    provideTenantScopedRepository(CadDocument, { strict: true }),
    provideTenantScopedRepository(CadDocumentVersion, { strict: true }),
    provideTenantScopedRepository(CadPublication, { strict: true }),
    provideTenantScopedRepository(CadReviewSession, { strict: true }),
    provideTenantScopedRepository(CadComment, { strict: true }),
    // ── Puertos: cada token se satisface con su adaptador Design ──
    {
      provide: CAD_BLOB_STORE,
      inject: [DatabaseBlobStore],
      useFactory: (inner: DatabaseBlobStore) =>
        new DesignBlobStoreAdapter(inner),
    },
    { provide: CAD_AI_PROVIDER, useClass: CideAiProviderAdapter },
    { provide: CAD_AUDIT_PUBLISHER, useClass: DesignCadAuditPublisher },
    // El publicador real de eventos design.* llega con la integración por
    // contratos (design-events.v1.yaml); hasta entonces, no-op explícito.
    {
      provide: PLATFORM_IDENTITY_CLIENT,
      useClass: TenantContextIdentityClient,
    },
  ],
  exports: [
    CadBlocksService,
    CadDocumentsService,
    CadIntentService,
    CadVisionService,
    CadLegacyProjectionService,
    ReviewLinkService,
    // Repositorios scoped de las entidades cad_* para la capa HTTP (CadModule:
    // CadDocumentsRepository lleva el ciclo de vida + CAS sobre estas filas).
    getTenantRepositoryToken(CadProject),
    getTenantRepositoryToken(CadDocument),
    getTenantRepositoryToken(CadDocumentVersion),
    getTenantRepositoryToken(CadPublication),
    getTenantRepositoryToken(CadReviewSession),
    getTenantRepositoryToken(CadComment),
    getTenantRepositoryToken(SfCadBlock),
    CAD_BLOB_STORE,
    CAD_AI_PROVIDER,
    CAD_AUDIT_PUBLISHER,
    PLATFORM_IDENTITY_CLIENT,
    CommercialModule,
  ],
})
export class CadDocumentsModule {}
