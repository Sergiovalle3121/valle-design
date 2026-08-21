import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';

/**
 * Recibo CFDI: el rastro fiscal de cada cobro, separado del espejo de
 * facturas del proveedor de pagos (`invoices`). Una fila por factura pagada
 * (kind `nominative`) o por factura global mensual (kind `global`, la del
 * público en general con RFC XAXX010101000).
 *
 * Ciclo de estados:
 *   `pending`  → recién descubierta por el job; aún sin timbrar.
 *   `issued`   → timbrada por el PAC (uuid = folio fiscal del SAT).
 *   `manual`   → no hay PAC (adaptador nulo): la emite una persona; el
 *                motivo queda en `detail`.
 *   `pooled`   → la organización no tiene datos fiscales: espera la factura
 *                global del mes (al cerrarse, `globalReceiptId` la enlaza).
 *   `failed`   → el PAC rechazó; `detail` guarda el error y el job reintenta
 *                hasta agotar los intentos.
 *
 * La idempotencia vive en el ESQUEMA: único parcial por `invoice_id` (una
 * factura, un CFDI) y único parcial por (`kind`,`period_start`) para la
 * global (un mes, una global) — no en la memoria del job, que corre en N
 * réplicas.
 */
@Entity('cfdi_receipts')
@Index('uq_cfdi_receipt_invoice', ['invoiceId'], {
  unique: true,
  where: 'invoice_id IS NOT NULL',
})
@Index('uq_cfdi_receipt_global_period', ['kind', 'periodStart'], {
  unique: true,
  where: "kind = 'global'",
})
@Index('idx_cfdi_receipt_scope', ['tenantId', 'status'])
export class CfdiReceipt {
  @PrimaryGeneratedColumn('uuid') id!: string;

  /** NULL sólo en la factura global: pertenece al emisor, no a un tenant. */
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind!: 'nominative' | 'global';

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: 'pending' | 'issued' | 'manual' | 'pooled' | 'failed';

  /** Folio fiscal (UUID del SAT) cuando `issued`. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  uuid!: string | null;

  /** Referencia del comprobante en el PAC (para descargar XML/PDF). */
  @Column({ name: 'provider_ref', type: 'varchar', length: 120, nullable: true })
  providerRef!: string | null;

  /** bigint: PostgreSQL lo devuelve como string, SQLite como number. */
  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents!: string | number;

  @Column({ type: 'character', length: 3 })
  currency!: string;

  /** Ventana de la factura global; NULL en las nominativas. */
  @Column({ name: 'period_start', type: DATE_COLUMN_TYPE, nullable: true })
  periodStart!: Date | null;

  @Column({ name: 'period_end', type: DATE_COLUMN_TYPE, nullable: true })
  periodEnd!: Date | null;

  /** La global que cubrió a esta fila `pooled`. */
  @Column({ name: 'global_receipt_id', type: 'uuid', nullable: true })
  globalReceiptId!: string | null;

  /** Motivo de `manual`/`failed`. Nunca datos de pago ni PII. */
  @Column({ type: 'text', nullable: true })
  detail!: string | null;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @CreateDateColumn({ name: 'created_at', type: DATE_COLUMN_TYPE })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: DATE_COLUMN_TYPE })
  updatedAt!: Date;
}
