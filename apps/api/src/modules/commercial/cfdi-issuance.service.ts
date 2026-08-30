import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CfdiReceipt } from './entities/cfdi-receipt.entity';
import { Invoice, TaxProfile } from './entities/commercial.entities';
import {
  CFDI_PROVIDER,
  type CfdiProvider,
  type CfdiReceiver,
} from './ports/cfdi-provider.port';

/**
 * Emisión de CFDI a partir de los cobros confirmados — el ciclo completo:
 * pago→CFDI nominativo si hay datos fiscales, pago→pool si no, y la factura
 * GLOBAL mensual (RFC genérico, público en general) que cubre el pool del mes
 * anterior.
 *
 * Mismo encaje que RenewalReminderService: corre dentro del tick del worker
 * de outbox con compuerta horaria, e idempotente POR ESQUEMA — el único
 * parcial por `invoice_id` y el único (kind, period_start) de la global
 * arbitran entre réplicas; nada depende de la memoria del proceso. Y NUNCA
 * dentro de la transacción del webhook: hablar con el PAC es una llamada de
 * red (ADR-0006).
 *
 * Con el adaptador NULO nada se finge: los recibos quedan `manual` con el
 * motivo, que es la lista de trabajo del operador y lo que la web enseña.
 */

const RUN_INTERVAL_MS = 60 * 60_000;
/** Reintentos ante rechazo del PAC antes de dejar el recibo en `failed`. */
const MAX_ATTEMPTS = 5;
/** Techo de recibos procesados por pasada: el tick se mantiene barato. */
const BATCH_LIMIT = 25;

/** Receptor genérico del SAT para la factura global (CFDI 4.0). */
export const GENERIC_RFC = 'XAXX010101000';
const GENERIC_NAME = 'PUBLICO EN GENERAL';
const GENERIC_REGIME = '616';
const GENERIC_USE = 'S01';

export interface CfdiIssuancePassReport {
  discovered: number;
  issued: number;
  manual: number;
  pooled: number;
  failed: number;
  globalIssued: boolean;
}

/**
 * Ruta de tabla ya escapada (mismo patrón que el store de rate limiting):
 * el SQL crudo debe funcionar igual en producción (esquema default) y en el
 * arnés de pruebas (esquema propio por suite).
 */
function escapedTablePath(tablePath: string): string {
  return tablePath
    .split('.')
    .map((part) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(part)) {
        throw new Error('CFDI table path is invalid.');
      }
      return `"${part}"`;
    })
    .join('.');
}

@Injectable()
export class CfdiIssuanceService {
  private readonly logger = new Logger(CfdiIssuanceService.name);
  private nextRunAtMs = 0;

  constructor(
    private readonly database: DataSource,
    @Optional()
    @Inject(CFDI_PROVIDER)
    private readonly cfdi?: CfdiProvider,
  ) {}

  private table(entity: typeof CfdiReceipt | typeof Invoice): string {
    return escapedTablePath(this.database.getMetadata(entity).tablePath);
  }

  /** Puerta del tick: a lo sumo una pasada por hora POR PROCESO. */
  async maybeRun(now: Date = new Date()): Promise<void> {
    if (now.getTime() < this.nextRunAtMs) return;
    this.nextRunAtMs = now.getTime() + RUN_INTERVAL_MS;
    await this.runOnce(now);
  }

  async runOnce(now: Date = new Date()): Promise<CfdiIssuancePassReport> {
    const report: CfdiIssuancePassReport = {
      discovered: 0,
      issued: 0,
      manual: 0,
      pooled: 0,
      failed: 0,
      globalIssued: false,
    };
    if (!this.cfdi) return report;

    report.discovered = await this.discoverPaidInvoices();
    await this.processPending(now, report);
    report.globalIssued = await this.issueMonthlyGlobal(now);
    return report;
  }

  /**
   * Cada factura PAGADA sin recibo gana su fila `pending`. El `ON CONFLICT
   * DO NOTHING` sobre el único parcial hace la carrera inofensiva: N réplicas
   * descubren, una inserta. Una factura reembolsada antes de timbrar ya no
   * está `paid` y jamás entra — no se factura dinero que ya se devolvió.
   */
  private async discoverPaidInvoices(): Promise<number> {
    const receipts = this.table(CfdiReceipt);
    const invoices = this.table(Invoice);
    const rows = await this.database.query(
      `INSERT INTO ${receipts}
         ("organization_id", "tenant_id", "invoice_id", "kind", "status",
          "amount_cents", "currency")
       SELECT i."organization_id", i."tenant_id", i."id", 'nominative',
              'pending', i."amount_cents", i."currency"
         FROM ${invoices} i
         LEFT JOIN ${receipts} r ON r."invoice_id" = i."id"
        WHERE i."status" = 'paid' AND r."id" IS NULL
        ON CONFLICT DO NOTHING
        RETURNING "id"`,
    );
    return rows.length;
  }

  private async processPending(
    now: Date,
    report: CfdiIssuancePassReport,
  ): Promise<void> {
    const receipts = this.database.getRepository(CfdiReceipt);
    const candidates = await receipts
      .createQueryBuilder('r')
      .where(`r.kind = 'nominative'`)
      .andWhere(
        `(r.status = 'pending' OR (r.status = 'failed' AND r.attempt_count < :max))`,
        { max: MAX_ATTEMPTS },
      )
      .orderBy('r.created_at', 'ASC')
      .take(BATCH_LIMIT)
      .getMany();

    for (const receipt of candidates) {
      const profile = await this.database
        .getRepository(TaxProfile)
        .findOneBy({ organizationId: receipt.organizationId! });
      if (!profile) {
        // Sin datos fiscales no hay CFDI nominativo: al pool de la global.
        await receipts.update(receipt.id, { status: 'pooled' });
        report.pooled += 1;
        continue;
      }
      const invoice = await this.database
        .getRepository(Invoice)
        .findOneBy({ id: receipt.invoiceId! });
      const receiver: CfdiReceiver = {
        rfc: profile.rfc,
        legalName: profile.legalName,
        taxRegimeCode: profile.taxRegimeCode,
        cfdiUseCode: profile.cfdiUseCode,
        postalCode: profile.postalCode,
      };
      await this.issueInto(receipt, report, {
        organizationId: receipt.organizationId!,
        invoiceId: receipt.invoiceId!,
        amountCents: Number(receipt.amountCents),
        currency: receipt.currency,
        issuedAt: invoice?.issuedAt ?? now,
        concept: invoice?.number
          ? `Suscripción Valle Design (${invoice.number})`
          : 'Suscripción Valle Design',
        receiver,
      });
    }
  }

  /**
   * Factura global del MES ANTERIOR: una sola por período (único de esquema),
   * emitida a partir del día 1 y sólo si el pool tiene cobros MXN. Los
   * recibos cubiertos quedan enlazados vía `global_receipt_id` — siguen
   * siendo `pooled`, pero con la global que los ampara.
   */
  private async issueMonthlyGlobal(now: Date): Promise<boolean> {
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const receipts = this.database.getRepository(CfdiReceipt);

    // Pool del mes anterior aún sin cubrir. Sólo MXN: una global multi-moneda
    // no existe en el SAT; un cobro pooled en otra divisa queda para el
    // operador (y este log lo dice).
    const pool: Array<{ id: string; amount_cents: string | number }> =
      await this.database.query(
        `SELECT r."id", r."amount_cents"
         FROM ${this.table(CfdiReceipt)} r
         JOIN ${this.table(Invoice)} i ON i."id" = r."invoice_id"
        WHERE r."status" = 'pooled' AND r."global_receipt_id" IS NULL
          AND r."currency" = 'MXN'
          AND i."issued_at" >= $1 AND i."issued_at" < $2`,
        [periodStart, periodEnd],
      );
    if (pool.length === 0) return false;

    const totalCents = pool.reduce(
      (sum, row) => sum + Number(row.amount_cents),
      0,
    );

    // Reclamo idempotente del período; si otra réplica ganó, no hay doble.
    const claimed = await this.database.query(
      `INSERT INTO ${this.table(CfdiReceipt)}
         ("kind", "status", "amount_cents", "currency", "period_start", "period_end")
       VALUES ('global', 'pending', $1, 'MXN', $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING "id"`,
      [totalCents, periodStart, periodEnd],
    );
    const globalRow = claimed[0]
      ? await receipts.findOneByOrFail({ id: claimed[0].id })
      : await receipts.findOneBy({ kind: 'global', periodStart });
    if (!globalRow || !['pending', 'failed'].includes(globalRow.status)) {
      return false;
    }
    if (
      globalRow.status === 'failed' &&
      globalRow.attemptCount >= MAX_ATTEMPTS
    ) {
      return false;
    }

    const report: CfdiIssuancePassReport = {
      discovered: 0,
      issued: 0,
      manual: 0,
      pooled: 0,
      failed: 0,
      globalIssued: false,
    };
    await this.issueInto(globalRow, report, {
      organizationId: 'publico-en-general',
      invoiceId: globalRow.id,
      amountCents: totalCents,
      currency: 'MXN',
      issuedAt: now,
      concept: `Factura global ${periodStart.getUTCFullYear()}-${String(periodStart.getUTCMonth() + 1).padStart(2, '0')} (público en general)`,
      receiver: {
        rfc: GENERIC_RFC,
        legalName: GENERIC_NAME,
        taxRegimeCode: GENERIC_REGIME,
        cfdiUseCode: GENERIC_USE,
        postalCode: process.env.CFDI_ISSUER_POSTAL_CODE?.trim() || '00000',
      },
    });
    if (report.issued === 0 && report.manual === 0) return false;

    await this.database.query(
      `UPDATE ${this.table(CfdiReceipt)} SET "global_receipt_id" = $1
        WHERE "id" = ANY($2::uuid[])`,
      [globalRow.id, pool.map((row) => row.id)],
    );
    return report.issued > 0;
  }

  /** Emite un recibo (nominativo o global) y persiste el desenlace. */
  private async issueInto(
    receipt: CfdiReceipt,
    report: CfdiIssuancePassReport,
    request: Parameters<CfdiProvider['issue']>[0],
  ): Promise<void> {
    const receipts = this.database.getRepository(CfdiReceipt);
    try {
      const result = await this.cfdi!.issue(request);
      if (result.kind === 'issued') {
        await receipts.update(receipt.id, {
          status: 'issued',
          uuid: result.uuid,
          providerRef: result.providerRef ?? null,
          detail: null,
        });
        report.issued += 1;
      } else {
        await receipts.update(receipt.id, {
          status: 'manual',
          detail: result.reason,
        });
        report.manual += 1;
      }
    } catch (error) {
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message.slice(0, 500)}`
          : 'error desconocido';
      await receipts.update(receipt.id, {
        status: 'failed',
        detail,
        attemptCount: receipt.attemptCount + 1,
      });
      report.failed += 1;
      this.logger.error(
        `CFDI ${receipt.kind} ${receipt.id}: intento ${receipt.attemptCount + 1}/${MAX_ATTEMPTS} falló.`,
      );
    }
  }
}
