import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El rastro fiscal de cada cobro: `cfdi_receipts`.
 *
 * `invoices` es el espejo de la pasarela (el documento del PROVEEDOR de
 * pagos); lo que faltaba era el hecho FISCAL mexicano — qué CFDI cubre cada
 * cobro. Una fila por factura pagada (`nominative`) o por factura global
 * mensual del público en general (`global`, RFC XAXX010101000, la que cubre
 * los cobros de organizaciones sin datos fiscales).
 *
 * La idempotencia vive en el esquema, no en el job que corre en N réplicas:
 * único parcial por `invoice_id` (una factura, un CFDI) y único parcial por
 * (`kind`,`period_start`) en las globales (un mes, una global). El estado es
 * un vocabulario CERRADO por CHECK: `pending` (descubierta), `issued`
 * (timbrada, `uuid` = folio fiscal), `manual` (sin PAC: la emite una
 * persona), `pooled` (sin datos fiscales: espera la global del mes),
 * `failed` (rechazo del PAC; se reintenta con techo).
 *
 * `organization_id`/`tenant_id` son NULL sólo en la global: ese comprobante
 * pertenece al emisor, no a un tenant — afirmarle un alcance que no tiene
 * sería mentir en el esquema (mismo criterio que `payment_events`).
 */
export class CfdiReceipts20260820140000 implements MigrationInterface {
  name = 'CfdiReceipts20260820140000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cfdi_receipts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid,
        "tenant_id" uuid,
        "invoice_id" uuid,
        "kind" varchar(16) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "uuid" varchar(40),
        "provider_ref" varchar(120),
        "amount_cents" bigint NOT NULL,
        "currency" character(3) NOT NULL,
        "period_start" timestamptz,
        "period_end" timestamptz,
        "global_receipt_id" uuid,
        "detail" text,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_cfdi_receipts_kind"
          CHECK ("kind" IN ('nominative', 'global')),
        CONSTRAINT "chk_cfdi_receipts_status"
          CHECK ("status" IN ('pending', 'issued', 'manual', 'pooled', 'failed')),
        CONSTRAINT "chk_cfdi_receipts_tenant_matches_org"
          CHECK ("tenant_id" IS NOT DISTINCT FROM "organization_id"),
        CONSTRAINT "chk_cfdi_receipts_nominative_has_org"
          CHECK ("kind" = 'global' OR "organization_id" IS NOT NULL),
        CONSTRAINT "chk_cfdi_receipts_global_has_period"
          CHECK ("kind" = 'nominative'
                 OR ("period_start" IS NOT NULL AND "period_end" IS NOT NULL)),
        CONSTRAINT "fk_cfdi_receipts_global"
          FOREIGN KEY ("global_receipt_id") REFERENCES "cfdi_receipts"("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_cfdi_receipt_invoice"
      ON "cfdi_receipts"("invoice_id") WHERE "invoice_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_cfdi_receipt_global_period"
      ON "cfdi_receipts"("kind", "period_start") WHERE "kind" = 'global'
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_cfdi_receipt_scope"
      ON "cfdi_receipts"("tenant_id", "status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Los folios fiscales emitidos viven en el PAC y en el SAT; esta tabla es
    // el índice local. Deshacerla pierde el índice, no los comprobantes.
    await queryRunner.query(`DROP TABLE "cfdi_receipts"`);
  }
}
