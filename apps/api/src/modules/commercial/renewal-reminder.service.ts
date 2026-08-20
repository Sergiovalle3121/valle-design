import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { Subscription } from './entities/commercial.entities';
import { IdempotencyConflictError } from './payload-hash';
import { EMAIL_SERVICE, type EmailService } from './ports/commercial.ports';

/**
 * Recordatorio de renovación para pagos ÚNICOS (OXXO/SPEI).
 *
 * Una suscripción de tarjeta se renueva sola; una pagada en efectivo NO: el
 * proveedor no tiene mandato de cobro recurrente, así que cuando llega
 * `current_period_end` el acceso simplemente caduca. Sin este aviso, el
 * cliente que pagó en OXXO se entera de que su plan venció el día que no puede
 * abrir su plano — el peor momento y la peor forma.
 *
 * Cómo encaja en el sistema, pieza a pieza:
 *
 * - Corre dentro del tick del worker de outbox (proceso que ya existe y ya
 *   está supervisado), con una COMPUERTA HORARIA: consultar cada segundo una
 *   condición que cambia una vez al día sería ruido sobre la base. Si una
 *   pasada falla, la siguiente es en una hora — no un reintento en bucle.
 * - Es idempotente POR CONSTRUCCIÓN: la clave
 *   `renewal-reminder:${subscriptionId}:${periodEnd}` es determinista, y el
 *   único de `email_outbox.idempotency_key` (más el insert `orIgnore` del
 *   puerto) garantiza a lo sumo UN correo por suscripción y vencimiento,
 *   aunque la pasada corra en N réplicas a la vez o el proceso se reinicie.
 *   Si el cliente renueva y el período avanza, la clave cambia con él: el
 *   siguiente vencimiento tendrá su propio aviso.
 * - El destinatario es quien puede ACTUAR: la dueña de la organización. Un
 *   aviso a un `member` sin permiso de compra sería una alarma sin botón.
 *
 * Elegibilidad exacta: `active` + SIN `provider_subscription_id` (no hay
 * renovación automática detrás) + `current_period_end` dentro de los próximos
 * 5 días. Una suscripción ya vencida NO recibe aviso: «te va a vencer» después
 * de vencer sería mentir la urgencia — ese caso es del flujo de reactivación,
 * no de un recordatorio.
 */

/** Ventana de aviso: se avisa cuando faltan 5 días o menos. */
const REMINDER_WINDOW_MS = 5 * 86_400_000;
/** Compuerta horaria del tick. */
const RUN_INTERVAL_MS = 60 * 60_000;

export const RENEWAL_REMINDER_TEMPLATE = 'commercial.renewal-reminder';

interface ReminderCandidate {
  id: string;
  organizationId: string;
  planCode: string;
  currentPeriodEnd: Date;
  email: string;
  organizationName: string;
}

@Injectable()
export class RenewalReminderService {
  private nextRunAtMs = 0;

  constructor(
    private readonly database: DataSource,
    @Inject(EMAIL_SERVICE)
    private readonly email: EmailService,
  ) {}

  /**
   * Puerta del tick: corre a lo sumo una vez por hora POR PROCESO. Con varias
   * réplicas habrá varias pasadas por hora; es correcto, no un defecto — la
   * idempotencia la arbitra el esquema, no este contador en memoria.
   */
  async maybeRun(now: Date = new Date()): Promise<void> {
    if (now.getTime() < this.nextRunAtMs) return;
    // Se avanza ANTES de correr: si la pasada falla, la siguiente es en una
    // hora, no un martilleo cada segundo sobre una base que ya tiene problemas.
    this.nextRunAtMs = now.getTime() + RUN_INTERVAL_MS;
    await this.runOnce(now);
  }

  /** Una pasada completa. Devuelve cuántas suscripciones estaban en ventana. */
  async runOnce(now: Date = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + REMINDER_WINDOW_MS);
    const rows = await this.database
      .getRepository(Subscription)
      .createQueryBuilder('s')
      .innerJoin(Organization, 'o', 'o.id = s.organizationId')
      .innerJoin(User, 'u', 'u.id = o.ownerUserId')
      .select('s.id', 'id')
      .addSelect('s.organizationId', 'organizationId')
      .addSelect('s.planCode', 'planCode')
      .addSelect('s.currentPeriodEnd', 'currentPeriodEnd')
      .addSelect('u.email', 'email')
      .addSelect('o.name', 'organizationName')
      .where(`s.status = 'active'`)
      .andWhere('s.providerSubscriptionId IS NULL')
      .andWhere('s.currentPeriodEnd IS NOT NULL')
      .andWhere('s.currentPeriodEnd > :now', { now })
      .andWhere('s.currentPeriodEnd <= :horizon', { horizon })
      .getRawMany<ReminderCandidate>();

    // Una transacción POR FILA: lo ya encolado queda encolado aunque una fila
    // posterior falle, y la pasada de la próxima hora reintenta sólo lo que
    // falta (la clave dedupe el resto). Si el aviso de este período ya existe
    // con otro payload — la organización se renombró entre pasadas — el
    // conflicto de idempotencia NO es un fallo: el aviso ya salió y un cambio
    // de nombre no amerita un segundo correo.
    for (const row of rows) {
      const periodEnd = new Date(row.currentPeriodEnd).toISOString();
      try {
        await this.database.transaction(async (manager) => {
          await this.email.enqueue(
            {
              organizationId: row.organizationId,
              tenantId: row.organizationId,
              to: row.email,
              template: RENEWAL_REMINDER_TEMPLATE,
              payload: {
                organizationName: row.organizationName,
                planCode: row.planCode,
                currentPeriodEnd: periodEnd,
              },
              idempotencyKey: `renewal-reminder:${row.id}:${periodEnd}`,
            },
            { native: manager },
          );
        });
      } catch (error) {
        if (error instanceof IdempotencyConflictError) continue;
        throw error;
      }
    }
    return rows.length;
  }
}
