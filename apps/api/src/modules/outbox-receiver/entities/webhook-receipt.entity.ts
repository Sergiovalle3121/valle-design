import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';

export const WEBHOOK_RECEIPT_QUEUES = ['email', 'domain'] as const;
export type WebhookReceiptQueue = (typeof WEBHOOK_RECEIPT_QUEUES)[number];

/**
 * Entrega del outbox propio YA aceptada. Es la barrera de idempotencia del
 * receptor y NADA más: el worker entrega at-least-once (ADR-0006), así que sin
 * un único durable sobre la clave, una reentrega reenviaría el mismo correo de
 * verificación dos veces — o aplicaría dos veces un evento de dominio cuando
 * la cola `domain` tenga consumo real.
 *
 * No guarda el payload: los correos de identidad llevan tokens de verificación
 * y de reset, exactamente lo que jamás debe quedar apuntado en una tabla de
 * recibos. Sólo la huella sha256 del cuerpo, para poder auditar que una
 * redelivery traía lo mismo.
 *
 * Sin `organization_id`/`tenant_id` a propósito, como `payment_events`: los
 * correos de identidad viajan sin organización (registro y reset ocurren antes
 * de pertenecer a ninguna) y afirmar un alcance que no siempre existe sería
 * mentir en el esquema. El recibo pertenece al canal con el worker.
 */
@Entity('webhook_receipts')
@Index(['idempotencyKey'], { unique: true })
export class WebhookReceipt {
  @PrimaryGeneratedColumn('uuid') id!: string;
  /** Cola declarada por el cuerpo FIRMADO, no por la URL que alguien invocó. */
  @Column({ type: 'varchar', length: 20 }) queue!: WebhookReceiptQueue;
  /** La misma clave estable que el worker persiste en su outbox (160 allá). */
  @Column({ name: 'idempotency_key', type: 'varchar', length: 160 })
  idempotencyKey!: string;
  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash!: string;
  /** Qué hizo la entrega: útil para soporte sin volver a leer el payload. */
  @Column({ type: 'varchar', length: 40 }) outcome!: string;
  @CreateDateColumn({ name: 'received_at', type: DATE_COLUMN_TYPE })
  receivedAt!: Date;
}
