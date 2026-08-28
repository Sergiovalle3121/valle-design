import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SEGUNDO FACTOR Y ACTIVIDAD DE LA CUENTA.
 *
 * Tres cambios que van juntos porque responden a la misma petición del dueño:
 * «que la creación de cuenta sea lo más segura Y lo más bella posible, porque
 * ahí van los datos de sus clientes». La belleza la pone la interfaz; la
 * seguridad la ponen estas tablas.
 *
 * ── 1 · `identity_mfa_factors` ──────────────────────────────────────────────
 * Un factor por usuario (índice ÚNICO sobre `userId`, no una simple clave
 * foránea): el producto ofrece TOTP y no una colección de factores, y un
 * usuario con dos secretos activos es un estado que nadie sabría explicar en
 * soporte.
 *
 * `secret_ciphertext` guarda el secreto CIFRADO. Un secreto TOTP no puede
 * guardarse en hash —el servidor tiene que reproducir el código— y en claro
 * convertiría cualquier volcado de la base de datos en la derrota total del
 * factor: quien se lleva la tabla genera códigos válidos para siempre y el
 * usuario nunca se entera. La clave vive fuera de la base de datos
 * (`IDENTITY_MFA_ENCRYPTION_KEY`) y el arranque en producción muere sin ella.
 *
 * `last_used_step` es la defensa contra REPETICIÓN, y es la parte que casi
 * todas las implementaciones caseras olvidan: sin ella un código robado sigue
 * sirviendo durante los noventa segundos de la ventana de tolerancia.
 *
 * `confirmed_at` separa «lo empecé a dar de alta» de «funciona». Un alta a
 * medias que ya exigiera segundo factor dejaría al usuario fuera de su propia
 * cuenta, que es el peor fallo posible en esta función.
 *
 * ── 2 · `identity_backup_codes` ─────────────────────────────────────────────
 * En hash, porque aquí sólo hace falta comparar. Son la ÚNICA recuperación a
 * propósito: un «te mandamos un enlace al correo» convertiría el segundo factor
 * en decoración, porque quien controle el correo entraría igual.
 *
 * `ON DELETE CASCADE` en las dos tablas: al borrar un usuario no puede quedar
 * un secreto huérfano cifrado con una clave que nadie va a volver a usar.
 *
 * ── 3 · `mfa_challenge` en `identity_one_time_tokens` ───────────────────────
 * El desafío entre «la contraseña es correcta» y «el código también» ES un
 * token de un solo uso con caducidad corta, así que reutiliza la tabla que ya
 * resuelve lo difícil —hash en reposo, consumo con UPDATE condicional, y emitir
 * uno nuevo invalida los anteriores del mismo propósito—. Sólo hay que ampliar
 * el CHECK, que en PostgreSQL exige soltarlo y volverlo a crear.
 *
 * ── QUÉ PIERDE `down()` ─────────────────────────────────────────────────────
 * Los segundos factores dados de alta y sus códigos de respaldo. Es una pérdida
 * REAL: revertir esta migración deja a esos usuarios entrando sólo con
 * contraseña, sin aviso. No hay forma de evitarlo —las tablas son el factor—,
 * pero sí de decirlo aquí para que quien la ejecute sepa lo que hace.
 */
export class IdentityMfaAndLoginActivity20260828120000 implements MigrationInterface {
  name = 'IdentityMfaAndLoginActivity20260828120000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "identity_mfa_factors" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "type" varchar(16) NOT NULL DEFAULT 'totp',
        "secretCiphertext" varchar(512) NOT NULL,
        "confirmedAt" timestamptz NULL,
        "lastUsedStep" bigint NULL,
        "lastUsedAt" timestamptz NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_identity_mfa_factors_user"
          FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_identity_mfa_factors_type"
          CHECK ("type" IN ('totp')),
        CONSTRAINT "chk_identity_mfa_factors_ciphertext"
          CHECK ("secretCiphertext" LIKE 'v1.%')
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_identity_mfa_factors_user"
      ON "identity_mfa_factors"("userId")
    `);

    await queryRunner.query(`
      CREATE TABLE "identity_backup_codes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "codeHash" varchar(64) NOT NULL,
        "consumedAt" timestamptz NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_identity_backup_codes_user"
          FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_identity_backup_codes_hash"
          CHECK ("codeHash" ~ '^[0-9a-f]{64}$')
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_identity_backup_codes_hash"
      ON "identity_backup_codes"("codeHash")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_identity_backup_codes_user"
      ON "identity_backup_codes"("userId")
    `);

    // El CHECK original se escribió EN LÍNEA y sin nombre
    // (`20260802160000-FirstPartyIdentity.ts:53`), así que PostgreSQL le puso
    // el suyo. Soltarlo por un nombre adivinado funcionaría hoy y reventaría el
    // día que la generación automática cambie o haya colisión, así que se busca
    // en el catálogo por su DEFINICIÓN y se suelta por el nombre real.
    // El que se crea después sí lleva nombre explícito, para que la próxima
    // migración que toque esto no tenga que repetir este baile.
    await queryRunner.query(`
      DO $$
      DECLARE nombre text;
      BEGIN
        SELECT conname INTO nombre
        FROM pg_constraint
        WHERE conrelid = '"identity_one_time_tokens"'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%purpose%';
        IF nombre IS NOT NULL THEN
          EXECUTE format('ALTER TABLE "identity_one_time_tokens" DROP CONSTRAINT %I', nombre);
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "identity_one_time_tokens"
      ADD CONSTRAINT "chk_identity_one_time_purpose"
      CHECK ("purpose" IN ('verify_email', 'reset_password', 'invitation', 'mfa_challenge'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Los desafíos vivos se borran ANTES de estrechar el CHECK: si quedara una
    // fila con el propósito nuevo, el ALTER fallaría y la reversión moriría a
    // mitad de camino, que es el peor sitio donde puede morir una migración.
    await queryRunner.query(
      `DELETE FROM "identity_one_time_tokens" WHERE "purpose" = 'mfa_challenge'`,
    );
    await queryRunner.query(`
      ALTER TABLE "identity_one_time_tokens"
      DROP CONSTRAINT "chk_identity_one_time_purpose"
    `);
    // Se devuelve con el nombre que PostgreSQL habría generado para el CHECK
    // en línea original, para que revertir deje el esquema donde estaba en vez
    // de donde a esta migración le venía bien.
    await queryRunner.query(`
      ALTER TABLE "identity_one_time_tokens"
      ADD CONSTRAINT "identity_one_time_tokens_purpose_check"
      CHECK ("purpose" IN ('verify_email', 'reset_password', 'invitation'))
    `);
    await queryRunner.query(`DROP TABLE "identity_backup_codes"`);
    await queryRunner.query(`DROP TABLE "identity_mfa_factors"`);
  }
}
