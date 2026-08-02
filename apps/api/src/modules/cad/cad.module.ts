import { Module } from '@nestjs/common';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { CadController } from './cad.controller';
import { CadReviewController } from './cad-review.controller';
import { CadReviewLinkController } from './cad-review-link.controller';
import { CadDocumentsRepository } from './cad-documents.repository';
import { CadReviewRepository } from './cad-review.repository';

/**
 * Superficie HTTP del producto Design (/v1/cad/*): controllers + repositorios
 * finos del ciclo de vida sobre el kernel CAD puro (CadDocumentsModule).
 * Fase 5 añade la superficie de review: sesiones/comentarios del autor
 * (CadReviewController) y el contexto de solo lectura del review link
 * (CadReviewLinkController, autenticado por token server-owned).
 */
@Module({
  imports: [CadDocumentsModule],
  controllers: [CadController, CadReviewController, CadReviewLinkController],
  providers: [CadDocumentsRepository, CadReviewRepository],
  exports: [CadDocumentsRepository, CadReviewRepository],
})
export class CadModule {}
