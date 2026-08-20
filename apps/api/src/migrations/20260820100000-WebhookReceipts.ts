import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El circuito de correo se cierra: recibos del receptor de outbox (ADR-0008).
 *
 * Hasta aquí el producto ENCOLABA correo (email_outbox) y el worker lo
 * entregaba firmado a un receptor HTTPS… que no existía en ningún despliegue.
 * Con el receptor viviendo en la misma API aparece el hecho nuevo que el
 * esquema tiene que representar: una entrega ACEPTADA. El worker entrega
 * at-least-once (ADR-0006), así que sin una barrera durable una reentrega
 * enviaría dos veces el mismo correo de verificación.
 *
 * `webhook_receipts` es esa barrera — el espejo entrante de `payment_events`:
 * `idempotency_key` con índice ÚNICO, insertado PRIMERO y en la MISMA
 * transacción que el envío, de modo que «aceptado» y «enviado» no pueden
 * separarse ni bajo caída. No guarda el payload: los correos de identidad
 * llevan tokens de verificación y reset — sólo la huella sha256, para auditar
 * que una redelivery traía lo mismo.
 *
 * Sin organization_id/tenant_id a propósito: los correos de registro y reset
 * viajan sin organización (el usuario aún no pertenece a ninguna), y afirmar
 * un alcance de tenant que no siempre existe sería mentir en el esquema
 * (mismo razonamiento que payment_events frente a ADR-0005).
 */
export class WebhookReceipts20260820100000 implements MigrationInterface {
  name = 'WebhookReceipts20260820100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhook_receipts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "queue" varchar(20) NOT NULL,
        "idempotency_key" varchar(160) NOT NULL,
        "payload_hash" varchar(64) NOT NULL,
        "outcome" varchar(40) NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_webhook_receipts_queue"
          CHECK ("queue" IN ('email', 'domain')),
        CONSTRAINT "chk_webhook_receipts_payload_hash"
          CHECK ("payload_hash" ~ '^[0-9a-f]{64}$')
      )
    `);
    // Único de UNA columna: la clave del outbox emisor ya es única global en
    // email_outbox (y por organización en domain_outbox, con prefijos que no
    // colisionan entre colas), así que un mismo mensaje jamás se acepta dos
    // veces aunque cambie de cola en una versión futura.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_webhook_receipts_idempotency_key"
      ON "webhook_receipts"("idempotency_key")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Se pierde el registro de qué entregas fueron aceptadas: sin receptor no
    // significa nada, y el outbox emisor conserva su propio historial de
    // envíos (status/sent_at), que es la fuente primaria.
    await queryRunner.query(`DROP TABLE "webhook_receipts"`);
  }
}
