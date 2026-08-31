import {
  Body,
  Controller,
  HttpCode,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { from } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { CadPresenceService } from './cad-presence.service';
import { CadPresenceDocumentGuard } from './cad-presence-document.guard';
import { PublishCadPresenceBeatDto } from './dto/cad-presence.dto';

/**
 * Superficie de presencia EN VIVO (`/v1/cad/documents/:documentId/presence*`,
 * contrato design-api.v1.yaml, tag `presence`): el segundo adaptador del
 * puerto `CadPresenceChannelPort` del cliente (ver
 * `apps/web/.../collab/presence-channel.ts`), esta vez cruzando máquinas de
 * verdad y no sólo pestañas del mismo navegador.
 *
 * Alcance deliberado: SOLO presencia. Nada de aquí lee ni escribe
 * `cad_document` — el documento sigue siendo CAS de un solo escritor,
 * completamente ajeno a este controller.
 *
 * Requiere sesión first-party (`cad:view` + entitlement `design.cad`, guards
 * globales): un invitado de review link no tiene cookie de sesión y
 * `EventSource` no puede mandar el header `X-Review-Token`, así que la
 * presencia de invitado queda fuera de esta versión — "todavía no", no
 * "nunca" (ver PR).
 *
 * ── Por qué el tenant se captura ANTES de devolver el Observable ───────────
 * `TenantInterceptor` abre el `AsyncLocalStorage` alrededor de la llamada
 * SÍNCRONA a `next.handle()`, así que leer `TenantContextService` aquí, en el
 * cuerpo síncrono del método, ocurre dentro de ese contexto. Pero el stream
 * SSE sigue vivo mucho después de que ese contexto se cierre — sus emisiones
 * futuras vienen de un `Subject` que dispara código de OTRAS peticiones, sin
 * ninguna garantía de que el ALS siga activo. Por eso `tenantId` se lee una
 * vez, aquí, en una constante — nunca dentro de un callback async del stream.
 */
@Controller('v1/cad')
export class CadPresenceController {
  constructor(
    private readonly presence: CadPresenceService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post('documents/:documentId/presence')
  @RequirePermissions('cad:view')
  @HttpCode(204)
  async publish(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: PublishCadPresenceBeatDto,
  ): Promise<void> {
    const tenantId = this.tenantContext.requireTenantId('cad.presence.publish');
    const email = this.tenantContext.getUserEmail();
    await this.presence.publishBeat(tenantId, documentId, email, {
      peerId: dto.peerId,
      cursor: dto.cursor ?? null,
      viewport: dto.viewport ?? null,
    });
  }

  @Sse('documents/:documentId/presence/stream')
  @RequirePermissions('cad:view')
  // Guard, no comprobación dentro del servicio: ver cad-presence-document.guard.ts
  // para por qué un `getDocument` async DENTRO del handler SSE pierde la
  // carrera contra el commit de cabeceras de Nest.
  @UseGuards(CadPresenceDocumentGuard)
  stream(
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Observable<MessageEvent> {
    const tenantId = this.tenantContext.requireTenantId('cad.presence.stream');
    // `presence.stream` es async (verifica el documento antes de abrir el
    // Observable); `from(promise).pipe(concatMap)` aplana la promesa de
    // Observable en el Observable que Nest necesita devolver de inmediato.
    return from(this.presence.stream(tenantId, documentId)).pipe(
      concatMap((observable) => observable),
    );
  }
}
