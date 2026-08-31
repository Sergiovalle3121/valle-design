import {
  Body,
  Controller,
  Get,
  Header,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, Observable } from 'rxjs';
import { filter, map, mergeMap } from 'rxjs/operators';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';
import {
  CreateChannelDto,
  CreateMessageDto,
  ListChannelMessagesQueryDto,
} from './dto/messaging.dto';
import {
  type AuthorView,
  type ChannelView,
  MessagingService,
} from './messaging.service';
import { MessagingEventBus } from './messaging-event-bus';
import type { MessagingChannel } from './entities/messaging-channel.entity';
import type { MessagingMessage } from './entities/messaging-message.entity';

/**
 * Mensajería de equipo (`/v1/messaging/*`, tag `messaging`): canales de
 * proyecto y directos, mensajes con paginación por cursor, marca de leído y
 * un flujo `@Sse` de mensajes nuevos. Permisos reutilizados del catálogo
 * `cad:*` existente (mensajería es parte de la misma superficie de
 * colaboración del producto Design): `cad:view` para leer, `cad:edit` para
 * escribir — el mismo RBAC por rol de organización que ya gobierna el resto
 * de `/v1/cad/*`, sin ampliar el catálogo de permisos.
 */
@Controller('v1/messaging')
export class MessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly eventBus: MessagingEventBus,
  ) {}

  @Get('channels')
  @RequirePermissions('cad:view')
  async listChannels(@Req() req: Request) {
    const userId = actor(req).userId;
    const views = await this.messaging.listChannels(userId);
    return { items: views.map((view) => channelViewResource(view)) };
  }

  @Post('channels')
  @RequirePermissions('cad:edit')
  async createChannel(@Req() req: Request, @Body() dto: CreateChannelDto) {
    const userId = actor(req).userId;
    const channel = await this.messaging.createChannel(userId, dto);
    return this.channelResource(channel, userId);
  }

  @Get('channels/:channelId/messages')
  @RequirePermissions('cad:view')
  async listMessages(
    @Req() req: Request,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Query() query: ListChannelMessagesQueryDto,
  ) {
    const userId = actor(req).userId;
    const page = await this.messaging.listMessages(channelId, userId, {
      cursor: query.cursor,
      limit: query.limit,
    });
    const authors = await this.messaging.resolveAuthors(
      page.items.map((m) => m.authorUserId),
    );
    return {
      items: page.items.map((m) => messageResource(m, authors)),
      nextCursor: page.nextCursor,
    };
  }

  @Post('channels/:channelId/messages')
  @RequirePermissions('cad:edit')
  async sendMessage(
    @Req() req: Request,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body() dto: CreateMessageDto,
  ) {
    const userId = actor(req).userId;
    const message = await this.messaging.sendMessage(channelId, userId, dto);
    const authors = await this.messaging.resolveAuthors([userId]);
    return messageResource(message, authors);
  }

  @Post('channels/:channelId/read')
  @RequirePermissions('cad:view')
  async markRead(
    @Req() req: Request,
    @Param('channelId', ParseUUIDPipe) channelId: string,
  ) {
    const userId = actor(req).userId;
    await this.messaging.markRead(channelId, userId);
    return { read: true };
  }

  /**
   * Mensajes nuevos en vivo, de cualquier canal visible para quien llama.
   * Snapshot de canales DIRECTOS al conectar: un canal directo abierto
   * DESPUÉS de abrir esta conexión no aparece hasta reconectar (límite
   * declarado, ver `MessagingEventBus`). Los canales de PROYECTO no
   * necesitan snapshot: cualquiera del mismo tenant es visible.
   */
  @Sse('events')
  @RequirePermissions('cad:view')
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  events(@Req() req: Request): Observable<MessageEvent> {
    const user = actor(req);
    const tenantId = user.tenant_id;
    const userId = user.userId;

    return from(this.messaging.listMyDirectChannelIds(userId)).pipe(
      mergeMap((directChannelIds) =>
        this.eventBus.events$.pipe(
          filter(
            (event) =>
              event.tenantId === tenantId &&
              (event.channelKind === 'project' ||
                directChannelIds.has(event.channelId)),
          ),
          mergeMap((event) =>
            from(this.messaging.resolveAuthors([event.message.authorUserId])).pipe(
              map((authors) => ({
                data: JSON.stringify(messageResource(event.message, authors)),
              })),
            ),
          ),
        ),
      ),
    );
  }

  /* ─────────────────────────── Proyección de recursos ────────────────────── */

  /** Proyección de un canal recién creado: siempre 0 no leídos por definición. */
  private async channelResource(channel: MessagingChannel, userId: string) {
    let otherMember: AuthorView | null = null;
    if (channel.kind === 'direct' && channel.directKey) {
      const otherUserId = channel.directKey
        .split(':')
        .find((id) => id !== userId);
      if (otherUserId) {
        const authors = await this.messaging.resolveAuthors([otherUserId]);
        otherMember = authors.get(otherUserId) ?? null;
      }
    }
    return channelViewResource({
      channel,
      unreadCount: 0,
      lastMessageAt: null,
      otherMember,
    });
  }
}

function actor(req: Request): AuthenticatedUser {
  const user = (req as Request & { user?: AuthenticatedUser }).user;
  if (!user?.userId) {
    throw new Error('MessagingController: request sin usuario autenticado.');
  }
  return user;
}

function channelViewResource(view: ChannelView) {
  const { channel } = view;
  return {
    id: channel.id,
    kind: channel.kind,
    projectId: channel.projectId,
    name: channel.name,
    otherMember: view.otherMember,
    unreadCount: view.unreadCount,
    lastMessageAt: view.lastMessageAt,
    createdAt: channel.created_at,
  };
}

function messageResource(
  message: MessagingMessage,
  authors: Map<string, AuthorView>,
) {
  return {
    id: message.id,
    channelId: message.channelId,
    author: authors.get(message.authorUserId) ?? {
      userId: message.authorUserId,
      email: message.authorUserId,
      displayName: null,
    },
    body: message.body,
    parentMessageId: message.parentMessageId,
    anchor: message.anchor,
    createdAt: message.created_at,
  };
}
