import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Checkout SIN pasarela: el upgrade se registra como un intent auditable.
 *
 * No hay proveedor de pagos, así que el producto no puede cobrar; lo que sí
 * puede es dejar constancia durable de quién pidió pasar a qué plan y quién lo
 * confirmó (owner/admin) después de que el cobro ocurriera fuera del producto.
 * La fila es el asiento de auditoría: nunca se borra al decidirse, sólo cambia
 * de estado.
 *
 * Invariantes en el esquema, no en el código:
 * - un único intent `pending` por organización (índice único parcial): dos
 *   propuestas simultáneas no pueden coexistir ni carrear la confirmación;
 * - `decided_at` está poblado exactamente cuando el intent dejó de estar
 *   `pending`, así una fila decidida sin fecha (o al revés) es irrepresentable;
 * - `tenant_id = organization_id`, el mismo contrato de alcance que el resto
 *   de tablas comerciales.
 */
export class SubscriptionUpgradeIntents20260812110000 implements MigrationInterface {
  name = 'SubscriptionUpgradeIntents20260812110000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "subscription_upgrade_intents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "tenant_id" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "requested_plan_code" varchar(80) NOT NULL
          REFERENCES "plan_catalog"("code") ON DELETE RESTRICT,
        "status" varchar(20) NOT NULL DEFAULT 'pending'
          CHECK ("status" IN ('pending', 'confirmed', 'cancelled')),
        "requested_by_user_id" uuid NOT NULL
          REFERENCES "identity_users"("id") ON DELETE RESTRICT,
        "decided_by_user_id" uuid NULL
          REFERENCES "identity_users"("id") ON DELETE RESTRICT,
        "decided_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_upgrade_intents_tenant_scope"
          CHECK ("tenant_id" = "organization_id"),
        CONSTRAINT "chk_upgrade_intents_decision"
          CHECK (("status" = 'pending') = ("decided_at" IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_upgrade_intent_pending_per_org"
      ON "subscription_upgrade_intents"("organization_id")
      WHERE "status" = 'pending'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "subscription_upgrade_intents"`);
  }
}
