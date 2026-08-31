import {
  Body,
  Controller,
  ConflictException,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  API_RATE_LIMITS,
  ApiRateLimitService,
} from '../identity/api-rate-limit.service';
import {
  CallParticipantNotFoundError,
  CallRoomFullError,
  CallRoomNotFoundError,
} from './call-room-store';
import { toWireEvent } from './calls-wire';
import {
  JoinCallRoomDto,
  LeaveCallRoomDto,
  PostCallSignalDto,
} from './calls.dto';
import { CallsService } from './calls.service';
import type { CallServerEvent } from './calls.types';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';

/** Late para mantener viva la conexión a través de un proxy con timeout de
 * idle: sin tráfico propio la sala parece muerta antes de que nadie hable. */
const HEARTBEAT_MS = 20_000;

/**
 * SEÑALIZACIÓN DE LLAMADA — oferta/respuesta SDP y candidatos ICE, no medios.
 *
 * ── LO QUE VIAJA AQUÍ Y LO QUE NO ──────────────────────────────────────────
 * Audio, video y pantalla compartida van directo entre navegadores por
 * WebRTC; este controller nunca los toca. Lo único que cruza el servidor es
 * el puñado de mensajes necesarios para que dos navegadores se encuentren:
 * quién está en la sala, y la oferta/respuesta/candidato que arma la
 * conexión punto a punto. `@Sse` entrega esos mensajes por push, sin
 * WebSocket — comprobado: cero `@nestjs/websockets` en este API.
 *
 * ── POR QUÉ NADA DE ESTO SE GUARDA ─────────────────────────────────────────
 * Salas, participantes y señales viven en memoria del proceso
 * (`CallsService` → `CallRoomStore`) con TTL y barrido. Una llamada dura
 * minutos, no meses; escribirla a PostgreSQL no protegería nada que un
 * reinicio del proceso no borre también de los navegadores conectados.
 *
 * ── PERMISO ─────────────────────────────────────────────────────────────
 * `cad:view` en todo el controller: llamar sobre un documento es
 * colaboración, no edición, y es exactamente lo que alguien en solo-lectura
 * tras vencer su periodo gratuito puede seguir necesitando.
 */
@Controller('v1/calls')
@RequirePermissions('cad:view')
export class CallsController {
  constructor(
    private readonly calls: CallsService,
    private readonly rateLimits: ApiRateLimitService,
  ) {}

  private actor(request: Request): AuthenticatedUser & { tenantId: string } {
    const user = (request as Request & { user?: AuthenticatedUser }).user;
    if (!user?.tenant_id) {
      // El guard global ya exige sesión + entitlement antes de llegar aquí;
      // sin tenant activo no hay sala que abrir ni a nombre de quién.
      throw new ForbiddenException({
        code: 'organization_required',
        message: 'Activa una organización para usar llamadas.',
      });
    }
    return { ...user, tenantId: user.tenant_id };
  }

  @Post('rooms')
  async join(@Body() dto: JoinCallRoomDto, @Req() request: Request) {
    const actor = this.actor(request);
    await this.rateLimits.enforce(
      'calls-room-join',
      [actor.userId],
      API_RATE_LIMITS.callsRoomJoinsPerAccount,
    );
    try {
      return await this.calls.join(actor.tenantId, dto.documentId, {
        userId: actor.userId,
        email: actor.email,
        displayName: dto.displayName,
      });
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @Post('rooms/:roomId/leave')
  @HttpCode(200)
  leave(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: LeaveCallRoomDto,
    @Req() request: Request,
  ) {
    const actor = this.actor(request);
    try {
      this.calls.leave(actor.tenantId, roomId, dto.participantId);
    } catch (error) {
      throw toHttpException(error);
    }
    return { left: true };
  }

  @Post('rooms/:roomId/signals')
  @HttpCode(202)
  async signal(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: PostCallSignalDto,
    @Req() request: Request,
  ) {
    const actor = this.actor(request);
    await this.rateLimits.enforce(
      'calls-signal',
      [dto.fromParticipantId],
      API_RATE_LIMITS.callsSignalsPerParticipant,
    );
    try {
      this.calls.signal(
        actor.tenantId,
        roomId,
        dto.fromParticipantId,
        dto.toParticipantId,
        dto.kind,
        dto.payload,
      );
    } catch (error) {
      throw toHttpException(error);
    }
    return { queued: true };
  }

  /**
   * Entrega en vivo: roster y señales dirigidas a `participantId`.
   *
   * `EventSource` no manda headers propios, así que la identidad viaja por
   * la cookie de sesión de siempre (mismo origen) y `participantId` va en
   * la query — validado contra la sala + tenant del actor antes de abrir el
   * stream. `SseStream` de Nest ya manda `X-Accel-Buffering: no` por
   * default (verificado en `@nestjs/core/router/sse-stream.js`); la otra
   * mitad de la garantía anti-buffer —excluir `text/event-stream` de
   * `compression()`— vive en `main.ts`, porque esa sí NO trae default.
   */
  @Sse('rooms/:roomId/events')
  events(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Query('participantId', ParseUUIDPipe) participantId: string,
    @Req() request: Request,
  ): Observable<MessageEvent> {
    const actor = this.actor(request);
    return new Observable<MessageEvent>((subscriber) => {
      const emit = (event: CallServerEvent) =>
        subscriber.next({ type: event.type, data: toWireEvent(event) });
      let teardown: (() => void) | null = null;
      try {
        teardown = this.calls.connect(
          actor.tenantId,
          roomId,
          participantId,
          emit,
        );
      } catch (error) {
        subscriber.error(toHttpException(error));
        return;
      }
      const heartbeat = setInterval(
        () => emit({ type: 'ping', at: Date.now() }),
        HEARTBEAT_MS,
      );
      return () => {
        clearInterval(heartbeat);
        teardown?.();
      };
    });
  }
}

function toHttpException(error: unknown): Error {
  if (error instanceof CallRoomNotFoundError) {
    return new NotFoundException({
      code: 'call_room_not_found',
      message: error.message,
    });
  }
  if (error instanceof CallParticipantNotFoundError) {
    return new NotFoundException({
      code: 'call_participant_not_found',
      message: error.message,
    });
  }
  if (error instanceof CallRoomFullError) {
    return new ConflictException({
      code: 'call_room_full',
      message: error.message,
    });
  }
  return error instanceof Error ? error : new Error(String(error));
}
