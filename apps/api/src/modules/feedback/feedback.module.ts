import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialModule } from '../commercial/commercial.module';
import { IdentityModule } from '../identity/identity.module';
import { ProductFeedback } from './entities/feedback.entity';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

/**
 * El centro de comentarios. Depende de `CommercialModule` sólo por el puerto de
 * correo —el que sabe escribir en el outbox transaccional— y de `IdentityModule`
 * por el limitador de peticiones, exactamente igual que el módulo de soporte.
 */
@Module({
  imports: [
    CommercialModule,
    IdentityModule,
    TypeOrmModule.forFeature([ProductFeedback]),
  ],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
