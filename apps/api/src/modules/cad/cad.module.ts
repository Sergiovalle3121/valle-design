import { Module } from '@nestjs/common';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import { CadController } from './cad.controller';
import { CadDocumentsRepository } from './cad-documents.repository';

/**
 * Superficie HTTP del producto Design (/v1/cad/*): controller + repositorio
 * fino del ciclo de vida sobre el kernel CAD puro (CadDocumentsModule).
 */
@Module({
  imports: [CadDocumentsModule],
  controllers: [CadController],
  providers: [CadDocumentsRepository],
  exports: [CadDocumentsRepository],
})
export class CadModule {}
