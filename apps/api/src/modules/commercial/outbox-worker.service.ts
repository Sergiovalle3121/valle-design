import {
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CommercialOutboxDispatcher,
  type CommercialOutboxDispatchSummary,
} from './outbox-dispatcher.service';
import { CfdiIssuanceService } from './cfdi-issuance.service';
import { RenewalReminderService } from './renewal-reminder.service';
import { TrialExpiryReminderService } from './trial-expiry-reminder.service';
import { WebhookCommercialOutboxTransport } from './webhook-outbox.transport';

const DEFAULT_POLL_INTERVAL_MS = 1_000;

@Injectable()
export class CommercialOutboxWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CommercialOutboxWorker.name);
  private active = false;
  private pollMs = DEFAULT_POLL_INTERVAL_MS;
  private timer?: NodeJS.Timeout;
  private current?: Promise<void>;

  constructor(
    private readonly database: DataSource,
    private readonly dispatcher: CommercialOutboxDispatcher,
    private readonly transport: WebhookCommercialOutboxTransport,
    // Opcional: el worker sigue siendo correcto sin recordatorios (specs,
    // wirings parciales). Con él, cada tick pasa por la compuerta horaria.
    @Optional()
    private readonly renewalReminders?: RenewalReminderService,
    @Optional()
    private readonly cfdiIssuance?: CfdiIssuanceService,
    @Optional()
    private readonly trialReminders?: TrialExpiryReminderService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.OUTBOX_DISPATCHER_ENABLED !== 'true') {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'Production requires OUTBOX_DISPATCHER_ENABLED=true so verification, reset and invitation email cannot remain stranded.',
        );
      }
      return;
    }
    if (this.database.options.type !== 'postgres') {
      throw new Error(
        'OUTBOX_DISPATCHER_ENABLED requires PostgreSQL; SQLite has no safe multi-worker lease.',
      );
    }
    this.pollMs = pollIntervalMs(process.env.OUTBOX_POLL_INTERVAL_MS);
    this.transport.assertConfigured();
    this.active = true;
    this.schedule(0);
    this.logger.log('Commercial outbox worker enabled.');
  }

  async onApplicationShutdown(): Promise<void> {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    await this.current;
  }

  private schedule(delayMs: number): void {
    if (!this.active) return;
    this.timer = setTimeout(() => {
      this.current = this.tick().finally(() => {
        this.current = undefined;
        this.schedule(this.pollMs);
      });
    }, delayMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      const summary = await this.dispatcher.dispatchOnce();
      if (summary.claimed || summary.dead || summary.leaseLost) {
        this.logSummary(summary);
      }
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'OutboxWorkerError';
      // Error text is deliberately omitted because providers may echo PII.
      this.logger.error(`Commercial outbox dispatch failed (${kind}).`);
    }
    // try/catch PROPIO: un fallo del recordatorio jamás degrada la entrega de
    // correo, y viceversa. La compuerta horaria vive dentro del servicio.
    try {
      await this.renewalReminders?.maybeRun();
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'RenewalReminderError';
      this.logger.error(`Renewal reminder pass failed (${kind}).`);
    }
    // Aviso de fin de prueba, con su propio try/catch por la misma razón: el
    // correo que evita la sorpresa del día 91 no puede caerse porque falle
    // otra pasada, ni tumbar a las demás si falla él.
    try {
      await this.trialReminders?.maybeRun();
    } catch (error) {
      const kind =
        error instanceof Error ? error.name : 'TrialExpiryReminderError';
      this.logger.error(`Trial expiry reminder pass failed (${kind}).`);
    }
    // Emisión de CFDI, con la misma independencia: un PAC caído no toca el
    // correo ni los recordatorios, y su compuerta horaria vive dentro.
    try {
      await this.cfdiIssuance?.maybeRun();
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'CfdiIssuanceError';
      this.logger.error(`CFDI issuance pass failed (${kind}).`);
    }
  }

  private logSummary(summary: CommercialOutboxDispatchSummary): void {
    this.logger.log(
      `Commercial outbox batch claimed=${summary.claimed} sent=${summary.sent} ` +
        `failed=${summary.failed} dead=${summary.dead} leaseLost=${summary.leaseLost}`,
    );
  }
}

export function pollIntervalMs(raw: string | undefined): number {
  const value = raw ? Number(raw) : DEFAULT_POLL_INTERVAL_MS;
  if (!Number.isInteger(value) || value < 250 || value > 60_000) {
    throw new Error(
      'OUTBOX_POLL_INTERVAL_MS must be an integer from 250 to 60000.',
    );
  }
  return value;
}
