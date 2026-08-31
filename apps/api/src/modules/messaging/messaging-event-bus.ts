import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type { MessagingChannelKind } from './entities/messaging-channel.entity';
import type { MessagingMessage } from './entities/messaging-message.entity';

/**
 * Fanout EN PROCESO de mensajes nuevos hacia `@Sse('events')`.
 *
 * Deliberadamente sin cola ni broker: un `Subject` de RxJS vive mientras vive
 * el proceso Node. En un despliegue de VARIAS instancias, un mensaje enviado
 * en la instancia A no llega por SSE a un cliente conectado a la instancia B
 * — sólo lo verá al recargar o al reabrir el canal. Es una limitación
 * declarada, no un descuido: extenderlo a multi-instancia pide un backend de
 * pub/sub compartido (Redis, `LISTEN/NOTIFY` de PostgreSQL) que no existe hoy
 * en este repo, y añadirlo aquí habría sido inventar infraestructura fuera
 * del alcance de esta campaña.
 */
export interface MessagingEvent {
  tenantId: string;
  channelId: string;
  channelKind: MessagingChannelKind;
  message: MessagingMessage;
}

@Injectable()
export class MessagingEventBus {
  private readonly subject = new Subject<MessagingEvent>();

  readonly events$: Observable<MessagingEvent> = this.subject.asObservable();

  publish(event: MessagingEvent): void {
    this.subject.next(event);
  }
}
