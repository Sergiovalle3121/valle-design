import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../identity/entities/identity.entity';
import { CadDocumentsModule } from '../cad-documents/cad-documents.module';
import {
  getTenantRepositoryToken,
  provideTenantScopedRepository,
} from '../../common/tenant/tenant-scoped.repository';
import { CadProject } from '../cad-documents/entities/cad-project.entity';
import { MessagingChannel } from './entities/messaging-channel.entity';
import { MessagingChannelMember } from './entities/messaging-channel-member.entity';
import { MessagingMessage } from './entities/messaging-message.entity';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { MessagingEventBus } from './messaging-event-bus';

/**
 * Mensajería de equipo: canales de proyecto y directos, mensajes anclables
 * al dibujo, no leídos y un flujo `@Sse` en vivo — la pieza «como Teams»
 * pedida por el dueño de producto para que arquitectos e ingenieros
 * trabajen en equipo sobre un mismo proyecto.
 *
 * `CadDocumentsModule` sólo aporta el repositorio tenant-scoped de
 * `CadProject` (validar que un canal de proyecto apunta a un proyecto real
 * del tenant); no se toca ni se reexporta nada más de ese módulo.
 * `TypeOrmModule.forFeature([User])` es una segunda registración del MISMO
 * repositorio que ya usa `IdentityModule` (patrón estándar de TypeORM/Nest:
 * cada módulo que necesita `@InjectRepository` sobre una entidad la declara,
 * comparten la misma tabla) — no se toca `identity.module.ts`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MessagingChannel,
      MessagingChannelMember,
      MessagingMessage,
      User,
    ]),
    CadDocumentsModule,
  ],
  controllers: [MessagingController],
  providers: [
    MessagingService,
    MessagingEventBus,
    provideTenantScopedRepository(MessagingChannel, { strict: true }),
    provideTenantScopedRepository(MessagingChannelMember, { strict: true }),
    provideTenantScopedRepository(MessagingMessage, { strict: true }),
    provideTenantScopedRepository(CadProject, { strict: true }),
  ],
  exports: [
    MessagingService,
    getTenantRepositoryToken(MessagingChannel),
    getTenantRepositoryToken(MessagingChannelMember),
    getTenantRepositoryToken(MessagingMessage),
  ],
})
export class MessagingModule {}
