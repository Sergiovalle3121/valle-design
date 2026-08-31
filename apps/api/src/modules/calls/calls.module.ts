import { Module } from '@nestjs/common';
import { CadModule } from '../cad/cad.module';
import { IdentityModule } from '../identity/identity.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

/**
 * Señalización de llamada: sala, participantes y buzón de señales, todo en
 * memoria de proceso (`CallsService` → `CallRoomStore`). Depende de
 * `CadModule` sólo por `CadDocumentsRepository` — verificar que el
 * documento existe y pertenece al tenant del actor antes de abrir una sala
 * — y de `IdentityModule` por el limitador de peticiones compartido, igual
 * que el resto de superficies de `/v1`.
 */
@Module({
  imports: [CadModule, IdentityModule],
  controllers: [CallsController],
  providers: [CallsService],
})
export class CallsModule {}
