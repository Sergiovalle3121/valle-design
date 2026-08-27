import { Module } from '@nestjs/common';
import { CommercialModule } from '../commercial/commercial.module';
import { IdentityModule } from '../identity/identity.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

/**
 * El canal de vuelta del producto. Depende del módulo comercial sólo por el
 * puerto de correo (`EMAIL_SERVICE`), que es el que sabe escribir en el outbox
 * transaccional, y del de identidad por el limitador de peticiones.
 */
@Module({
  imports: [CommercialModule, IdentityModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
