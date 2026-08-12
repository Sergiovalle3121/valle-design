import { Inject, Injectable } from '@nestjs/common';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { Subscription } from './entities/commercial.entities';
import {
  CAD_EVENT_PUBLISHER,
  type CadEventPublisher,
} from './ports/commercial.ports';

/**
 * Transición EXPLÍCITA del trial vencido.
 *
 * Elección: evaluación perezosa en la superficie de lectura comercial, no un
 * job. Un job introduciría el único proceso con reloj propio del producto (el
 * worker de outbox reacciona a filas, no a horas), correría en cada réplica y
 * competiría con las lecturas; la evaluación perezosa reutiliza la petición
 * que de todos modos va a leer la suscripción y es idempotente por
 * construcción. El costo aceptado: una organización que nunca vuelve a
 * consultar su estado comercial conserva `trialing` en la fila — sin efecto
 * práctico, porque entitlement y guards ya tratan el trial vencido como no
 * vigente por comparación de fecha (fail-closed); la fila persistida es la
 * verdad para UX/soporte/auditoría, no la barrera de acceso.
 *
 * Estado destino: `suspended`, no `past_due` ni `cancelled`. `past_due`
 * describe un cobro fallido y aquí no existe pasarela que cobre; `cancelled`
 * es una terminación explícita que nadie pidió. `suspended` dice exactamente
 * lo que pasó: el acceso quedó en pausa hasta que un upgrade confirmado lo
 * reactive.
 */
@Injectable()
export class SubscriptionLifecycleService {
  constructor(
    private readonly database: DataSource,
    @Inject(CAD_EVENT_PUBLISHER)
    private readonly events: CadEventPublisher,
  ) {}

  /**
   * Suspende el trial vencido de la organización, si lo hay. Devuelve el
   * estado resultante de la operación:
   * - `suspended`: esta llamada ganó la transición y publicó el evento;
   * - `unchanged`: no había trial vencido (o alguien más ya lo transicionó).
   *
   * El UPDATE condicionado por `status = 'trialing'` es el árbitro: bajo
   * carrera, PostgreSQL serializa las dos escrituras y sólo una afecta filas,
   * así que el evento de dominio se publica exactamente una vez (y su
   * idempotencyKey por suscripción lo garantiza también contra reintentos).
   */
  async settleExpiredTrial(
    organizationId: string | null | undefined,
    tenantId: string | null | undefined,
    now: Date = new Date(),
  ): Promise<'suspended' | 'unchanged'> {
    if (!organizationId || organizationId !== tenantId) return 'unchanged';
    return this.database.transaction(async (manager) => {
      const transitioned = await manager.update(
        Subscription,
        {
          organizationId,
          tenantId,
          status: 'trialing' as const,
          trialEndsAt: LessThanOrEqual(now),
        },
        { status: 'suspended' as const },
      );
      if (!transitioned.affected) return 'unchanged';

      const subscription = await manager.findOneByOrFail(Subscription, {
        organizationId,
        tenantId,
      });
      await this.events.publish(
        {
          organizationId,
          tenantId,
          type: 'commercial.trial.suspended',
          aggregateId: subscription.id,
          payload: {
            planCode: subscription.planCode,
            trialEndsAt: subscription.trialEndsAt
              ? new Date(subscription.trialEndsAt).toISOString()
              : null,
          },
          idempotencyKey: `commercial-trial-suspended:${subscription.id}`,
        },
        { native: manager },
      );
      return 'suspended';
    });
  }
}
