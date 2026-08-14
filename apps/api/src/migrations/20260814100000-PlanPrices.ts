import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El catálogo vendible publica PRECIOS (P3 ola 1).
 *
 * Hasta aquí `plan_catalog` no publicaba precio alguno y el checkout era
 * externo/asistido (subscription_upgrade_intents). Para que el piloto pueda
 * PUBLICAR cuánto cuesta un plan — y para que la ola 2 pueda enchufar una
 * pasarela sin re-modelar nada — el precio vive en su propia tabla, versionable
 * por activación: un precio nunca se edita en sitio, se desactiva y se crea el
 * siguiente, así los precios históricos quedan auditables.
 *
 * Invariantes en el esquema, no en el código:
 * - a lo sumo UN precio activo por (plan, moneda, período): índice único
 *   parcial `WHERE "active"` — los desactivados no compiten;
 * - `currency` es ISO-4217 en mayúsculas (CHECK con regex): 'usd' o 'US'
 *   son irrepresentables;
 * - `period` usa varchar + CHECK, el mismo patrón que los estados del resto de
 *   tablas comerciales (un tipo ENUM de PostgreSQL haría el próximo período un
 *   ALTER TYPE con lock, sin ganar nada);
 * - `amount_cents >= 0` en bigint: céntimos enteros, jamás decimales
 *   flotantes; 0 es legítimo (un plan puede publicarse gratis).
 *
 * SIN CHECK de tenant, a propósito: ADR-0005 gobierna datos que pertenecen a
 * UNA organización (`tenant_id = organization_id`). Un precio pertenece al
 * PRODUCTO, igual que `plan_catalog` y `plan_entitlements` — es configuración
 * global del catálogo que todas las organizaciones leen por igual. Añadirle
 * columnas de tenant afirmaría un alcance que no tiene.
 *
 * En producción esta migración NO siembra precios: publicar un precio es una
 * decisión comercial que llega por migración revisada u operador. Fuera de
 * producción, CommercialCatalogBootstrap siembra un precio de ejemplo solo
 * sobre una tabla vacía.
 */
export class PlanPrices20260814100000 implements MigrationInterface {
  name = 'PlanPrices20260814100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "plan_prices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "plan_code" varchar(80) NOT NULL
          REFERENCES "plan_catalog"("code") ON DELETE CASCADE,
        "currency" character(3) NOT NULL,
        "period" varchar(10) NOT NULL,
        "amount_cents" bigint NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_plan_prices_currency_iso4217"
          CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "chk_plan_prices_period"
          CHECK ("period" IN ('monthly', 'yearly')),
        CONSTRAINT "chk_plan_prices_amount"
          CHECK ("amount_cents" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_plan_prices_active_per_combination"
      ON "plan_prices"("plan_code", "currency", "period")
      WHERE "active"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Los precios no tienen FKs entrantes (una suscripción apunta al plan, no
    // al precio), así que el down es un DROP limpio: se pierde el historial de
    // precios publicados y nada más.
    await queryRunner.query(`DROP TABLE "plan_prices"`);
  }
}
