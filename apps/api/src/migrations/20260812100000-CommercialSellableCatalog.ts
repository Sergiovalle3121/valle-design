import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catálogo comercial VENDIBLE en producción.
 *
 * La fundación comercial (20260802170000) siembra únicamente el plan de trial,
 * así que una base productiva recién migrada puede REGALAR un trial pero no
 * tiene ningún plan al que una organización pueda pasar cuando ese trial
 * caduca: no existe nada vendible. Esta migración cierra ese hueco con el plan
 * `standalone-full` (mismo entitlement `design.cad`, sin precio: PlanCatalog
 * no publica precios y no hay pasarela de pagos — el cobro ocurre fuera del
 * producto y la confirmación del upgrade la registra un owner/admin).
 *
 * Además reconcilia la EXISTENCIA de las filas del trial. El bootstrap se
 * niega a tocar producción y a reparar catálogos no vacíos, y la migración
 * fundacional ya quedó registrada como aplicada, de modo que una fila perdida
 * por operación manual no tenía ningún camino revisado de reposición y cada
 * creación de organización respondía 503 `trial_catalog_unavailable`.
 * `ON CONFLICT DO NOTHING` repone sólo filas ausentes: un plan existente
 * conserva su `active` — apagar el trial es el interruptor del operador y una
 * migración no debe revertirlo.
 */
export class CommercialSellableCatalog20260812100000 implements MigrationInterface {
  name = 'CommercialSellableCatalog20260812100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "plan_catalog" ("code", "active", "metadata")
      VALUES ('standalone-trial', true, '{"kind":"trial","pricePublished":false}'::jsonb)
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "plan_entitlements" ("plan_code", "entitlement_code")
      VALUES ('standalone-trial', 'design.cad')
      ON CONFLICT ("plan_code", "entitlement_code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "plan_catalog" ("code", "active", "metadata")
      VALUES ('standalone-full', true, '{"kind":"paid","pricePublished":false}'::jsonb)
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "plan_entitlements" ("plan_code", "entitlement_code")
      VALUES ('standalone-full', 'design.cad')
      ON CONFLICT ("plan_code", "entitlement_code") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Sólo se revierte lo que esta migración introduce: el plan vendible. Las
    // filas del trial pertenecen a la fundación comercial. Si alguna
    // suscripción ya apunta a `standalone-full`, el FK RESTRICT de
    // `subscriptions.plan_code` hace fallar el down — correcto: revertir un
    // plan vendido exige decidir primero qué pasa con esas suscripciones.
    await queryRunner.query(
      `DELETE FROM "plan_entitlements" WHERE "plan_code" = 'standalone-full'`,
    );
    await queryRunner.query(
      `DELETE FROM "plan_catalog" WHERE "code" = 'standalone-full'`,
    );
  }
}
