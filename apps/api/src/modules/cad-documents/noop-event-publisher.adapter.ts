/**
 * Adaptador no-op del puerto CadEventPublisher (WP2c).
 *
 * Fase 2 lo SUSTITUYE por un publicador real de eventos `design.*` (bus u
 * outbox); mientras tanto el dominio ya puede publicar sin condicionales y sin
 * que nada ocurra.
 */
import { Injectable } from '@nestjs/common';
import type { CadEventPublisher } from './ports/cad-event-publisher.port';

@Injectable()
export class NoopCadEventPublisher implements CadEventPublisher {
  publish(): void {
    // No-op deliberado: aún no existe consumidor de eventos design.*.
  }
}
