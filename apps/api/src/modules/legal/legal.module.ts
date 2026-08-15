import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LegalAcceptance } from './entities/legal-acceptance.entity';
import { LegalController } from './legal.controller';

/**
 * Documentos legales versionados y su registro de aceptación.
 *
 * Módulo propio y no parte de `commercial` a propósito: aceptar unos términos
 * no depende de tener plan, suscripción ni entitlement, y meterlo ahí ataría
 * la evidencia jurídica al ciclo de vida comercial.
 */
@Module({
  imports: [TypeOrmModule.forFeature([LegalAcceptance])],
  controllers: [LegalController],
})
export class LegalModule {}
