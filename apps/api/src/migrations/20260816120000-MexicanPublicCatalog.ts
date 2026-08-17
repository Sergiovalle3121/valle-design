import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El catálogo deja de ser un ejemplo y pasa a ser una oferta con precio.
 *
 * Hasta aquí el producto sabía cobrar pero no sabía qué cobrar: `plan_catalog`
 * tenía `standalone-trial` y `standalone-full` sin nombre comercial, y el
 * único precio del sistema era una muestra de 29 USD que el bootstrap siembra
 * FUERA de producción. Con eso no se puede publicar una página de precios:
 * o se inventan cifras en el frontend — mentira que además se desincroniza del
 * cobro real — o no hay página. Esta migración pone la oferta en la base, que
 * es donde el checkout ya la busca (`POST /v1/commercial/checkout-sessions`
 * resuelve plan + moneda + período contra `plan_prices`).
 *
 * Por qué estos importes, y no otros. Los precios oficiales de Autodesk en
 * México son AutoCAD Web 2.175 MXN/año (~181/mes), AutoCAD LT 6.335 MXN/año
 * (~528/mes) y AutoCAD completo 26.150 MXN/año (~2.179/mes). Un mensual de
 * 199 MXN queda POR ENCIMA del anual de AutoCAD Web, así que el mensual no
 * compite por precio: compite por lo que AutoCAD Web no da (proyectos en la
 * nube, colaboración sobre el documento, AutoLISP, cero instalación) y por no
 * exigir un compromiso de doce meses. El que compite de frente es el anual:
 * 1.990 MXN/año son ~166/mes, por debajo de los ~181 de AutoCAD Web. El plan
 * de despacho baja a 169/usuario/mes desde tres asientos porque el coste de
 * soporte por usuario cae cuando el comprador es uno solo para todo el equipo.
 *
 * IVA INCLUIDO en los importes publicados (`metadata.taxIncluded`). En México
 * el comprador de este producto es mayoritariamente persona física o despacho
 * pequeño que razona sobre el cargo final de su tarjeta; publicar 199 y cobrar
 * 230,84 es la vía rápida a una contracargo. La consecuencia contable — que el
 * ingreso neto por suscripción mensual es 171,55 MXN antes de comisión — queda
 * anotada aquí para que nadie la descubra tarde.
 *
 * `metadata.public` es el interruptor de publicación: sólo lo que lo lleva sale
 * por el catálogo anónimo. `standalone-full` NO lo lleva a propósito: es el
 * plan al que apunta el flujo heredado de upgrade-intents y puede tener
 * suscripciones vivas, pero no es una oferta que queramos anunciar.
 *
 * Los INSERT usan `ON CONFLICT DO NOTHING` y los UPDATE fusionan JSON con
 * `||` sobre las claves de presentación: una fila que ya exista conserva su
 * `active` y las claves que el operador haya añadido. Apagar un plan es el
 * interruptor del operador y una migración no debe revertirlo.
 */
export class MexicanPublicCatalog20260816120000 implements MigrationInterface {
  name = 'MexicanPublicCatalog20260816120000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // El trial ya existe desde la fundación comercial: aquí sólo se le añade
    // la presentación que le faltaba para poder aparecer en la página de
    // precios como la columna de entrada. Sigue sin precio, que es lo que
    // significa gratis.
    await queryRunner.query(`
      UPDATE "plan_catalog"
      SET "metadata" = COALESCE("metadata", '{}'::jsonb) || '{
        "public": true,
        "name": "Prueba",
        "kind": "trial",
        "perSeat": false,
        "seatsMinimum": 1,
        "taxIncluded": true
      }'::jsonb
      WHERE "code" = 'standalone-trial'
    `);

    for (const plan of [
      {
        code: 'individual',
        metadata: {
          public: true,
          name: 'Individual',
          kind: 'paid',
          perSeat: false,
          seatsMinimum: 1,
          taxIncluded: true,
        },
        prices: [
          { period: 'monthly', amountCents: 19_900 },
          { period: 'yearly', amountCents: 199_000 },
        ],
      },
      {
        code: 'despacho',
        metadata: {
          public: true,
          name: 'Despacho',
          kind: 'paid',
          perSeat: true,
          seatsMinimum: 3,
          taxIncluded: true,
        },
        prices: [
          { period: 'monthly', amountCents: 16_900 },
          { period: 'yearly', amountCents: 169_000 },
        ],
      },
    ]) {
      await queryRunner.query(
        `
        INSERT INTO "plan_catalog" ("code", "active", "metadata")
        VALUES ($1, true, $2::jsonb)
        ON CONFLICT ("code") DO UPDATE
        SET "metadata" = COALESCE("plan_catalog"."metadata", '{}'::jsonb)
                         || EXCLUDED."metadata"
      `,
        [plan.code, JSON.stringify(plan.metadata)],
      );
      // Mismo entitlement que el resto del catálogo: hoy el producto vende UNA
      // capacidad (`design.cad`) y fingir una matriz de funciones por plan que
      // el runtime no aplica sería vender humo.
      await queryRunner.query(
        `
        INSERT INTO "plan_entitlements" ("plan_code", "entitlement_code")
        VALUES ($1, 'design.cad')
        ON CONFLICT ("plan_code", "entitlement_code") DO NOTHING
      `,
        [plan.code],
      );
      for (const price of plan.prices) {
        // El índice único parcial permite a lo sumo un precio activo por
        // (plan, moneda, período), así que `DO NOTHING` deja intacto un precio
        // que el operador ya hubiera publicado: cambiar un precio vivo es una
        // decisión comercial, no el efecto colateral de una migración.
        await queryRunner.query(
          `
          INSERT INTO "plan_prices"
            ("plan_code", "currency", "period", "amount_cents", "active")
          VALUES ($1, 'MXN', $2, $3, true)
          ON CONFLICT DO NOTHING
        `,
          [plan.code, price.period, price.amountCents],
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Se revierte sólo lo que esta migración introduce. Si alguna suscripción
    // ya apunta a `individual` o `despacho`, el FK RESTRICT de
    // `subscriptions.plan_code` hará fallar el borrado del plan — correcto:
    // revertir un plan ya vendido exige decidir antes qué pasa con quien lo
    // compró, y eso no lo puede decidir un `down` automático.
    await queryRunner.query(
      `DELETE FROM "plan_prices" WHERE "plan_code" IN ('individual', 'despacho')`,
    );
    await queryRunner.query(
      `DELETE FROM "plan_entitlements" WHERE "plan_code" IN ('individual', 'despacho')`,
    );
    await queryRunner.query(
      `DELETE FROM "plan_catalog" WHERE "code" IN ('individual', 'despacho')`,
    );
    // El trial pierde la presentación añadida aquí y vuelve a quedar fuera del
    // catálogo público, que es exactamente el estado anterior.
    //
    // `kind` NO se retira aunque el `up` lo escriba: la fundación comercial ya
    // lo había sembrado, así que quitarlo dejaría el trial peor de como estaba
    // antes de esta migración. Un `down` sólo puede devolver lo que su `up`
    // cambió; borrar de paso una clave ajena es pérdida de datos disfrazada de
    // rollback.
    await queryRunner.query(`
      UPDATE "plan_catalog"
      SET "metadata" = "metadata"
        - 'public' - 'name' - 'perSeat' - 'seatsMinimum' - 'taxIncluded'
      WHERE "code" = 'standalone-trial'
    `);
  }
}
