import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La compra deja de ser asistida: esquema de la pasarela real (P3 ola 2).
 *
 * Hasta aquí el producto sabía QUÉ vendía (plan_prices, ola 1) pero no podía
 * cobrarlo: el upgrade se registraba como intent y un humano confirmaba el
 * cobro externo. Con una pasarela de verdad aparecen tres hechos nuevos que el
 * esquema tiene que poder representar, y ninguno cabía en las tablas actuales:
 *
 * 1. `payment_events` — el proveedor entrega AT-LEAST-ONCE (igual que nuestro
 *    outbox, ADR-0006, pero en sentido entrante). Sin una barrera durable, un
 *    reintento de Stripe renovaría el período dos veces. `event_id` con índice
 *    ÚNICO es esa barrera: el INSERT es lo primero que hace el manejador, en la
 *    MISMA transacción que el efecto, así que «procesado» y «efecto aplicado»
 *    no pueden separarse ni bajo caída. No guarda el payload — puede llevar
 *    datos de pago — sólo su huella, para auditar que una redelivery traía lo
 *    mismo.
 *
 * 2. `invoices` — espejo de lectura del documento fiscal, que sigue siendo del
 *    proveedor. Existe para que el portal liste el historial sin llamar a
 *    Stripe en cada carga; `hosted_url` apunta al documento real. Lleva el
 *    CHECK `tenant_id = organization_id` como toda tabla por organización
 *    (ADR-0005) y el único (provider, provider_invoice_id) hace que una
 *    factura repetida por reintento sea irrepresentable.
 *
 * 3. `subscriptions` gana el vocabulario del ciclo de vida cobrado:
 *    `current_period_end` (hasta cuándo está pagado), `cancel_at_period_end`
 *    (baja programada, que NO es lo mismo que `cancelled`) y los dos
 *    identificadores del proveedor que permiten correlacionar un
 *    `invoice.paid` posterior con su organización. El único parcial sobre
 *    `provider_subscription_id` impone en el esquema que una suscripción de la
 *    pasarela pertenece a UNA organización.
 *
 * Nada de esto activa la pasarela: el adaptador se elige por configuración
 * (STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET). Con el esquema puesto y sin
 * claves, el producto sigue exactamente igual que en la ola 1.
 */
export class StripeBilling20260815100000 implements MigrationInterface {
  name = 'StripeBilling20260815100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payment_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider" varchar(40) NOT NULL,
        "event_id" varchar(255) NOT NULL,
        "type" varchar(160) NOT NULL,
        "payload_hash" varchar(64) NOT NULL,
        "outcome" varchar(40) NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_payment_events_payload_hash"
          CHECK ("payload_hash" ~ '^[0-9a-f]{64}$')
      )
    `);
    // Único de UNA columna: los identificadores de evento son globales en el
    // proveedor, así que dos proveedores no pueden colisionar, y con esto un
    // mismo evento jamás se procesa dos veces aunque cambiara el adaptador.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_payment_events_event_id"
      ON "payment_events"("event_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "tenant_id" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "provider" varchar(40) NOT NULL,
        "provider_invoice_id" varchar(255) NOT NULL,
        "number" varchar(80) NULL,
        "amount_cents" bigint NOT NULL,
        "currency" character(3) NOT NULL,
        "status" varchar(24) NOT NULL,
        "period_start" timestamptz NULL,
        "period_end" timestamptz NULL,
        "hosted_url" text NULL,
        "issued_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_invoices_tenant_scope"
          CHECK ("tenant_id" = "organization_id"),
        CONSTRAINT "chk_invoices_currency_iso4217"
          CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "chk_invoices_amount"
          CHECK ("amount_cents" >= 0),
        CONSTRAINT "chk_invoices_status"
          CHECK ("status" IN ('paid', 'open', 'uncollectible', 'void')),
        CONSTRAINT "chk_invoices_period"
          CHECK ("period_start" IS NULL OR "period_end" IS NULL
                 OR "period_end" >= "period_start"),
        CONSTRAINT "chk_invoices_hosted_url_https"
          CHECK ("hosted_url" IS NULL OR "hosted_url" LIKE 'https://%')
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_invoices_provider_invoice"
      ON "invoices"("provider", "provider_invoice_id")
    `);
    // El portal siempre lista «las últimas de mi organización»; el índice
    // sirve a esa consulta exacta y a ninguna otra inventada.
    await queryRunner.query(`
      CREATE INDEX "idx_invoices_organization_issued"
      ON "invoices"("organization_id", "issued_at" DESC)
    `);

    await queryRunner.query(`
      ALTER TABLE "subscriptions"
        ADD COLUMN "current_period_end" timestamptz NULL,
        ADD COLUMN "cancel_at_period_end" boolean NOT NULL DEFAULT false,
        ADD COLUMN "provider_subscription_id" varchar(255) NULL,
        ADD COLUMN "provider_customer_id" varchar(255) NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_subscriptions_provider_subscription"
      ON "subscriptions"("provider_subscription_id")
      WHERE "provider_subscription_id" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // El down devuelve la suscripción a su forma de la ola 1. Se pierde el
    // historial de facturas y la correlación con el proveedor: es información
    // que sólo existe porque hubo pasarela, y sin pasarela no significa nada.
    await queryRunner.query(
      `DROP INDEX "uq_subscriptions_provider_subscription"`,
    );
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
        DROP COLUMN "provider_customer_id",
        DROP COLUMN "provider_subscription_id",
        DROP COLUMN "cancel_at_period_end",
        DROP COLUMN "current_period_end"
    `);
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TABLE "payment_events"`);
  }
}
