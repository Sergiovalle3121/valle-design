import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { CadController } from './cad.controller';
import { CadReviewController } from './cad-review.controller';
import { CadReviewLinkController } from './cad-review-link.controller';
import { CadSheetSetController } from './cad-sheet-set.controller';
import { CadPresenceController } from './cad-presence.controller';
import { CadDocumentsRepository } from './cad-documents.repository';
import { CadReviewRepository } from './cad-review.repository';
import { CadSheetSetsRepository } from './cad-sheet-sets.repository';
import { CadPresenceRepository } from './cad-presence.repository';
import { CadPresenceService } from './cad-presence.service';
import { CadPresenceBus } from './cad-presence.bus';
import { CadPresenceCleanupService } from './cad-presence-cleanup.service';
import { CadPresenceDocumentGuard } from './cad-presence-document.guard';
import { CadPresenceBeat } from './entities/cad-presence-beat.entity';
import { CadDemoShareController } from './cad-demo-share.controller';
import { CadDemoShareClaimController } from './cad-demo-share-claim.controller';
import { CadDemoShareService } from './cad-demo-share.service';
import { CadDemoShareCleanupService } from './cad-demo-share-cleanup.service';
import { CadDemoShare } from './entities/cad-demo-share.entity';

/**
 * Superficie HTTP del producto Design (/v1/cad/*): controllers + repositorios
 * finos del ciclo de vida sobre el kernel CAD puro (CadDocumentsModule).
 * Fase 5 añade la superficie de review: sesiones/comentarios del autor
 * (CadReviewController) y el contexto de solo lectura del review link
 * (CadReviewLinkController, autenticado por token server-owned). El frente de
 * colaboración en vivo añade la presencia por servidor (CadPresenceController
 * + CadPresenceService/Bus/Cleanup): efímera, sin tocar el documento, con su
 * propia entidad (`cad_presence_beats`) declarada AQUÍ y no en
 * CadDocumentsModule — el kernel del documento no gana una dependencia nueva
 * por esto. Lo mismo para el enlace temporal de la demostración
 * (`cad_demo_shares`, CadDemoShareController/Service/Cleanup): sin tenant,
 * anónimo y con caducidad; sólo el reclamo cruza a un documento del tenant.
 */
@Module({
  imports: [
    CadDocumentsModule,
    TypeOrmModule.forFeature([CadPresenceBeat, CadDemoShare]),
  ],
  controllers: [
    CadController,
    CadReviewController,
    CadReviewLinkController,
    CadSheetSetController,
    CadPresenceController,
    CadDemoShareController,
    CadDemoShareClaimController,
  ],
  providers: [
    CadDocumentsRepository,
    CadReviewRepository,
    CadSheetSetsRepository,
    CadPresenceRepository,
    CadPresenceService,
    CadPresenceBus,
    CadPresenceCleanupService,
    CadPresenceDocumentGuard,
    CadDemoShareService,
    CadDemoShareCleanupService,
  ],
  exports: [
    CadDocumentsRepository,
    CadReviewRepository,
    CadSheetSetsRepository,
  ],
})
export class CadModule {}
