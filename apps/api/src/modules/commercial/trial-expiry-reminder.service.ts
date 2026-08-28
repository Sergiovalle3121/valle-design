import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../identity/entities/identity.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { Subscription } from './entities/commercial.entities';
import { IdempotencyConflictError } from './payload-hash';
import { EMAIL_SERVICE, type EmailService } from './ports/commercial.ports';

/**
 * AVISO DE FIN DE PRUEBA — el correo que evita la sorpresa del día 91.
 *
 * Una prueba de catorce días no necesita este servicio: quien la empieza la
 * recuerda. Una de tres meses sí. El usuario se registra en agosto, entrega
 * dos proyectos, y en noviembre abre el navegador sin la menor idea de que hoy
 * era el último día. Un producto que se promociona con «tres meses gratis»
 * tiene la obligación de avisar antes de que se acaben.
 *
 * ─── Por qué es un servicio aparte de `RenewalReminderService` ─────────────
 *
 * Porque avisa de otra cosa, a otra gente y con otra urgencia. Aquél avisa a
 * quien PAGÓ en OXXO de que su periodo pagado se acaba y no se renueva solo;
 * éste avisa a quien NO ha pagado nada de que su prueba termina. Fundirlos en
 * una consulta con condiciones cruzadas habría hecho que un cambio en la
 * elegibilidad de uno afectara al otro en silencio — que es exactamente cómo
 * un cliente recibe el correo equivocado.
 *
 * ─── Dos hitos, no una ventana ─────────────────────────────────────────────
 *
 * `RenewalReminderService` avisa UNA vez dentro de una ventana de cinco días.
 * Aquí hacen falta DOS avisos —a siete días y a uno— porque el primero da
 * tiempo a decidir y el segundo es el que la gente lee. Cada hito lleva su
 * propia clave de idempotencia, así que:
 *
 * - el aviso de 7 días y el de 1 día son correos distintos y ninguno bloquea
 *   al otro;
 * - cada uno sale UNA sola vez por prueba, aunque la pasada corra en N
 *   réplicas, el proceso se reinicie o el tick se repita (el único de
 *   `email_outbox.idempotency_key` lo arbitra, no un contador en memoria);
 * - si el usuario activa un plan, `trialEndsAt` cambia y con él la clave: una
 *   prueba extendida vuelve a avisar sobre su nueva fecha, que es lo correcto.
 *
 * ─── Lo que este aviso NO dice ─────────────────────────────────────────────
 *
 * No amenaza. El payload lleva `readOnlyAfterExpiry: true` porque lo que pasa
 * al vencer NO es perder el trabajo: es dejar de poder editarlo. La plantilla
 * tiene que poder decir «tus planos siguen siendo tuyos y podrás exportarlos»,
 * porque es verdad y está probado en `entitlement-read-only.pg.spec.ts`. Un
 * aviso que insinúe lo contrario sería, además de falso, la mejor forma de que
 * alguien no vuelva.
 */

/** Los dos hitos, en días completos antes del vencimiento. */
export const TRIAL_REMINDER_MILESTONES = [7, 1] as const;
export type TrialReminderMilestone = (typeof TRIAL_REMINDER_MILESTONES)[number];

/** Compuerta horaria del tick, igual que en el recordatorio de renovación. */
const RUN_INTERVAL_MS = 60 * 60_000;
const MS_PER_DAY = 86_400_000;

export const TRIAL_EXPIRY_REMINDER_TEMPLATE = 'commercial.trial-expiry';

interface TrialCandidate {
  id: string;
  organizationId: string;
  planCode: string;
  trialEndsAt: Date;
  email: string;
  organizationName: string;
}

@Injectable()
export class TrialExpiryReminderService {
  private nextRunAtMs = 0;

  constructor(
    private readonly database: DataSource,
    @Inject(EMAIL_SERVICE)
    private readonly email: EmailService,
  ) {}

  async maybeRun(now: Date = new Date()): Promise<void> {
    if (now.getTime() < this.nextRunAtMs) return;
    this.nextRunAtMs = now.getTime() + RUN_INTERVAL_MS;
    await this.runOnce(now);
  }

  /**
   * Una pasada. Devuelve cuántas pruebas CAÍAN HOY en un hito, que no es lo
   * mismo que cuántos correos nuevos salieron: `EmailService.enqueue` es
   * idempotente por construcción (`INSERT … ON CONFLICT DO NOTHING` sobre el
   * único de `idempotency_key`) y no distingue el alta del duplicado. Con la
   * cifra que el puerto puede sostener, la pasada de las 10:00 y la de las
   * 11:00 devuelven ambas 1 para la misma prueba a 7 días — y el outbox sigue
   * teniendo UNA fila. Quien quiera saber cuántos correos hay, cuenta filas;
   * este número dice cuántas pruebas se revisaron con hito.
   */
  async runOnce(now: Date = new Date()): Promise<number> {
    // El horizonte lo marca el hito MÁS LEJANO: una sola consulta trae las
    // candidatas de los dos avisos y el reparto se hace en memoria, sobre
    // unas pocas filas. Dos consultas por hito serían dos formas de que la
    // elegibilidad divergiera.
    const horizon = new Date(
      now.getTime() + Math.max(...TRIAL_REMINDER_MILESTONES) * MS_PER_DAY,
    );
    const rows = await this.database
      .getRepository(Subscription)
      .createQueryBuilder('s')
      .innerJoin(Organization, 'o', 'o.id = s.organizationId')
      .innerJoin(User, 'u', 'u.id = o.ownerUserId')
      .select('s.id', 'id')
      .addSelect('s.organizationId', 'organizationId')
      .addSelect('s.planCode', 'planCode')
      .addSelect('s.trialEndsAt', 'trialEndsAt')
      .addSelect('u.email', 'email')
      .addSelect('o.name', 'organizationName')
      .where(`s.status = 'trialing'`)
      .andWhere('s.trialEndsAt IS NOT NULL')
      // Ya vencida NO recibe aviso: «tu prueba termina pronto» después de
      // terminar miente la urgencia. Ese caso lo cubre la pantalla de
      // solo-lectura, que sí dice la verdad de lo que pasó.
      .andWhere('s.trialEndsAt > :now', { now })
      .andWhere('s.trialEndsAt <= :horizon', { horizon })
      .getRawMany<TrialCandidate>();

    let matched = 0;
    for (const row of rows) {
      const endsAt = new Date(row.trialEndsAt);
      const milestone = milestoneFor(endsAt, now);
      if (milestone === null) continue;
      const iso = endsAt.toISOString();
      try {
        await this.database.transaction(async (manager) => {
          await this.email.enqueue(
            {
              organizationId: row.organizationId,
              tenantId: row.organizationId,
              to: row.email,
              template: TRIAL_EXPIRY_REMINDER_TEMPLATE,
              payload: {
                organizationName: row.organizationName,
                planCode: row.planCode,
                trialEndsAt: iso,
                daysLeft: milestone,
                // La promesa que hace este aviso distinto de una amenaza.
                readOnlyAfterExpiry: true,
              },
              idempotencyKey: `trial-expiry:${row.id}:${iso}:${milestone}`,
            },
            { native: manager },
          );
        });
        matched += 1;
      } catch (error) {
        // El aviso ya salió (otra réplica, otro tick): no es un fallo.
        if (error instanceof IdempotencyConflictError) continue;
        throw error;
      }
    }
    return matched;
  }
}

/**
 * ¿A qué hito corresponde esta prueba HOY?
 *
 * Días completos redondeando hacia arriba, igual que la interfaz: con 6.3 días
 * por delante quedan 7, y ése es el aviso que toca. Se elige el hito MÁS
 * PEQUEÑO que todavía cubre lo que falta, así que una prueba que pase de 8 a 6
 * días entre dos pasadas recibe el de 7 en la primera pasada que lo alcanza y
 * el de 1 cuando llegue; nunca dos veces el mismo, porque la clave lo impide.
 *
 * Devuelve `null` fuera de los hitos: a 5, 4, 3 o 2 días no se manda nada. Un
 * correo diario durante la última semana no es diligencia, es acoso.
 */
export function milestoneFor(
  trialEndsAt: Date,
  now: Date,
): TrialReminderMilestone | null {
  const daysLeft = Math.ceil(
    (trialEndsAt.getTime() - now.getTime()) / MS_PER_DAY,
  );
  if (daysLeft <= 0) return null;
  return (
    TRIAL_REMINDER_MILESTONES.find((milestone) => daysLeft === milestone) ??
    null
  );
}
