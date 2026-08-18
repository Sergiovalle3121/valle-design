import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El producto empieza a poder facturar en México, y a cobrar por asiento de
 * verdad.
 *
 * Tres hechos nuevos que las tablas actuales no podían representar:
 *
 * 1. `tax_profiles` — sin RFC, razón social, régimen fiscal, uso de CFDI y
 *    código postal NO hay CFDI 4.0, y sin CFDI el pago no es un gasto
 *    deducible: un despacho mexicano sencillamente no contrata el software.
 *    La tabla no es un cajón de texto libre: el régimen y el uso son claves de
 *    catálogo del SAT, el RFC lleva su forma impuesta por CHECK y el tipo de
 *    persona (física/moral) se deriva de su longitud. Todo ello en el ESQUEMA,
 *    porque un perfil fiscal a medias pasa por capturado hasta el día del
 *    timbrado —y para entonces el cobro ya ocurrió.
 *
 * 2. `subscriptions.seats` — el checkout ya cobraba la cantidad correcta de
 *    asientos, pero nada impedía meter después el triple de miembros. El
 *    límite se impone en la API sobre esta columna. El BACKFILL es
 *    deliberadamente generoso (ver abajo): retirar el acceso a alguien que ya
 *    trabajaba sería cobrarle al cliente el precio de nuestra omisión.
 *
 * 3. `subscription_upgrade_intents` gana el vocabulario del pago ASÍNCRONO.
 *    OXXO y SPEI tardan de horas a días: entre «el cliente pidió su ficha» y
 *    «entró el dinero» hay un estado real que hoy no existía y que dejaba la
 *    interfaz sin nada que contar durante dos días.
 *
 * Nada de esto activa un PAC: el adaptador de CFDI se elige por configuración
 * (CFDI_PAC_*) y por defecto es el nulo, con emisión manual. Con el esquema
 * puesto y sin PAC, el producto captura y valida datos fiscales; no timbra.
 */
export class MexicanFiscalAndSeats20260817100000 implements MigrationInterface {
  name = 'MexicanFiscalAndSeats20260817100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tax_profiles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "tenant_id" uuid NOT NULL
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        "rfc" varchar(13) NOT NULL,
        "person_type" varchar(10) NOT NULL,
        "legal_name" varchar(300) NOT NULL,
        "tax_regime_code" varchar(4) NOT NULL,
        "cfdi_use_code" varchar(4) NOT NULL,
        "postal_code" character(5) NOT NULL,
        "updated_by_user_id" uuid NULL
          REFERENCES "identity_users"("id") ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_tax_profiles_tenant_scope"
          CHECK ("tenant_id" = "organization_id"),
        -- La FORMA del RFC vive en el esquema y no sólo en el validador de la
        -- aplicación: una fila mal formada aquí es una factura rechazada
        -- después, y ninguna ruta futura (importación, script de soporte)
        -- debería poder introducirla.
        CONSTRAINT "chk_tax_profiles_rfc_shape"
          CHECK ("rfc" ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2}[0-9A]$'),
        -- Persona física = 13 caracteres (cuatro letras del nombre y los dos
        -- apellidos), moral = 12 (tres letras de la denominación). La
        -- coherencia entre ambos datos se impone aquí para que nunca dependa
        -- de que alguien recuerde derivarla.
        CONSTRAINT "chk_tax_profiles_person_type"
          CHECK (("person_type" = 'fisica' AND length("rfc") = 13)
              OR ("person_type" = 'moral' AND length("rfc") = 12)),
        CONSTRAINT "chk_tax_profiles_tax_regime"
          CHECK ("tax_regime_code" ~ '^[0-9]{3}$'),
        CONSTRAINT "chk_tax_profiles_cfdi_use"
          CHECK ("cfdi_use_code" ~ '^[A-Z]{1,2}[0-9]{2}$'),
        CONSTRAINT "chk_tax_profiles_postal_code"
          CHECK ("postal_code" ~ '^[0-9]{5}$' AND "postal_code" <> '00000'),
        CONSTRAINT "chk_tax_profiles_legal_name"
          CHECK (length(btrim("legal_name")) >= 3)
      )
    `);
    // Un perfil fiscal por organización: quien factura es la organización, no
    // la persona que teclea. El único lo hace irrepresentable de otro modo.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_tax_profiles_organization"
      ON "tax_profiles"("organization_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN "seats" integer NOT NULL DEFAULT 1
    `);
    /**
     * BACKFILL GENEROSO, y a propósito.
     *
     * Poner 1 en todas las filas existentes expulsaría de golpe a cada equipo
     * que ya estuviera trabajando: el límite se estrenaría quitando acceso a
     * gente que lleva meses dentro, por una restricción que el producto nunca
     * les impuso al contratar. Se toma el número de miembros ACTUALES como
     * suelo, así que nadie pierde nada hoy y el límite empieza a morder desde
     * la siguiente contratación, que es cuando el cliente sí eligió cuántos
     * asientos pagaba.
     */
    await queryRunner.query(`
      UPDATE "subscriptions" AS "s"
      SET "seats" = GREATEST(1, (
        SELECT COUNT(*)
        FROM "organization_memberships" AS "m"
        WHERE "m"."organizationId" = "s"."organization_id"
      ))
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD CONSTRAINT "chk_subscriptions_seats" CHECK ("seats" >= 1)
    `);

    await queryRunner.query(`
      ALTER TABLE "subscription_upgrade_intents"
      ADD COLUMN "requested_seats" integer NOT NULL DEFAULT 1,
      ADD COLUMN "payment_method" varchar(20) NULL,
      ADD COLUMN "awaiting_payment_at" timestamptz NULL,
      ADD COLUMN "voucher_url" text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_upgrade_intents"
      ADD CONSTRAINT "chk_upgrade_intents_requested_seats"
        CHECK ("requested_seats" >= 1),
      ADD CONSTRAINT "chk_upgrade_intents_payment_method"
        CHECK ("payment_method" IS NULL
               OR "payment_method" IN ('card', 'oxxo', 'spei')),
      -- Mismo criterio que "invoices.hosted_url": un enlace que el cliente va
      -- a pulsar para ver su ficha de pago no puede llegar por HTTP plano.
      ADD CONSTRAINT "chk_upgrade_intents_voucher_url_https"
        CHECK ("voucher_url" IS NULL OR "voucher_url" LIKE 'https://%')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscription_upgrade_intents"
      DROP CONSTRAINT IF EXISTS "chk_upgrade_intents_voucher_url_https",
      DROP CONSTRAINT IF EXISTS "chk_upgrade_intents_payment_method",
      DROP CONSTRAINT IF EXISTS "chk_upgrade_intents_requested_seats"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_upgrade_intents"
      DROP COLUMN IF EXISTS "voucher_url",
      DROP COLUMN IF EXISTS "awaiting_payment_at",
      DROP COLUMN IF EXISTS "payment_method",
      DROP COLUMN IF EXISTS "requested_seats"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP CONSTRAINT IF EXISTS "chk_subscriptions_seats"
    `);
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "seats"`,
    );
    // Los datos fiscales se van con la tabla: son del cliente y no tienen
    // ningún otro sitio donde vivir en el esquema anterior. Quien revierta
    // esta migración pierde la captura, y eso es preferible a dejar RFC
    // huérfanos en una columna suelta de otra tabla.
    await queryRunner.query(`DROP TABLE IF EXISTS "tax_profiles"`);
  }
}
