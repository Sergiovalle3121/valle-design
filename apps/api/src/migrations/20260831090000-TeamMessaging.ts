import { MigrationInterface, QueryRunner } from 'typeorm';
import { TENANT_SETTING } from './20260820120000-TenantIntegrityRls';

/**
 * Mensajería de equipo (canales por proyecto + directos): la petición
 * explícita del dueño de producto — «un sistema como Teams para que
 * arquitectos e ingenieros trabajen en equipo sobre un mismo proyecto», con
 * el ancla al dibujo como diferenciador frente a Teams real.
 *
 * Tres tablas nuevas, ADITIVAS, sin tocar ninguna tabla `cad_*` existente:
 *
 *   - `messaging_channels`: un canal de proyecto (`kind = 'project'`, ligado
 *     a `cad_projects` por `project_id`, con nombre) o un canal directo entre
 *     dos miembros (`kind = 'direct'`, `direct_key` = los dos `userId`
 *     ordenados y unidos con `:`, único por tenant — evita duplicar el mismo
 *     par de personas en dos canales).
 *   - `messaging_channel_members`: quién ve qué canal y desde cuándo leyó
 *     (`last_read_at`, NULL = nunca) — la base de la insignia de no leídos.
 *     Los canales DIRECTOS exigen fila aquí para ser visibles (es la lista de
 *     control de acceso); los canales de PROYECTO son visibles a cualquier
 *     miembro de la organización — la fila existe solo para guardar
 *     `last_read_at` y se crea perezosamente (`ensureMembership`).
 *   - `messaging_messages`: cuerpo, autor, hilo padre opcional (respuesta) y
 *     `anchor` — el MISMO contrato JSON que `cad_comments.anchor`
 *     (`apps/web/src/lib/cad/collab/comment-anchor.ts`,
 *     `apps/api/src/modules/cad/cad-comment-anchor.ts` para la validación de
 *     forma): un mensaje puede apuntar a una entidad, cara o vista del
 *     dibujo exactamente igual que un comentario de revisión. No se reinventa
 *     el ancla — se reutiliza su forma para que un mismo visor sepa pintar
 *     las dos.
 *
 * RLS en la MISMA migración (regla del dominio CAD/design): las tres tablas
 * nacen con `tenant_id NOT NULL` (no hay filas legadas que adoptar, a
 * diferencia de las tablas `cad_*` de 2026-08-01) así que no hace falta el
 * pre-check de huérfanos de `TenantIntegrityRls` — se declara NOT NULL desde
 * el CREATE TABLE y se activa RLS con la MISMA política
 * (`tenant_id = current_setting('app.tenant_id', true)`) reutilizando
 * `TENANT_SETTING` en vez de duplicar el literal.
 */
export class TeamMessaging20260831090000 implements MigrationInterface {
  name = 'TeamMessaging20260831090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const postgres = queryRunner.connection.options.type === 'postgres';
    const json = postgres ? 'jsonb' : 'text';
    const date = postgres ? 'timestamp' : 'datetime';
    const id = postgres ? 'uuid' : 'varchar(36)';
    const idDefault = postgres ? ' DEFAULT gen_random_uuid()' : '';
    const tenantBase = `
        "tenant_id" varchar(36) NOT NULL,
        "organization_id" varchar(36) NULL,
        "plant_id" varchar(36) NULL,
        "created_at" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" ${date} NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" ${date} NULL,
        "created_by" varchar(255) NULL`;

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "messaging_channels" (
        "id" ${id} PRIMARY KEY NOT NULL${idDefault},${tenantBase},
        "kind" varchar(16) NOT NULL,
        "project_id" ${id} NULL,
        "name" varchar(160) NULL,
        "direct_key" varchar(160) NULL,
        CONSTRAINT "fk_messaging_channel_project"
          FOREIGN KEY ("project_id") REFERENCES "cad_projects" ("id")
          ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "messaging_channel_members" (
        "id" ${id} PRIMARY KEY NOT NULL${idDefault},${tenantBase},
        "channel_id" ${id} NOT NULL,
        "user_id" ${id} NOT NULL,
        "last_read_at" ${date} NULL,
        CONSTRAINT "fk_messaging_channel_member_channel"
          FOREIGN KEY ("channel_id") REFERENCES "messaging_channels" ("id")
          ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "messaging_messages" (
        "id" ${id} PRIMARY KEY NOT NULL${idDefault},${tenantBase},
        "channel_id" ${id} NOT NULL,
        "author_user_id" ${id} NOT NULL,
        "body" text NOT NULL,
        "parent_message_id" ${id} NULL,
        "anchor" ${json} NULL,
        CONSTRAINT "fk_messaging_message_channel"
          FOREIGN KEY ("channel_id") REFERENCES "messaging_channels" ("id")
          ON DELETE CASCADE,
        CONSTRAINT "fk_messaging_message_parent"
          FOREIGN KEY ("parent_message_id") REFERENCES "messaging_messages" ("id")
          ON DELETE SET NULL
      )`,
    );

    // ── Índices ──────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_messaging_channel_scope"
       ON "messaging_channels" ("tenant_id", "organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_messaging_channel_project"
       ON "messaging_channels" ("tenant_id", "project_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_messaging_channel_direct_key"
       ON "messaging_channels" ("tenant_id", "direct_key")
       WHERE "direct_key" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_messaging_channel_member_channel"
       ON "messaging_channel_members" ("tenant_id", "channel_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_messaging_channel_member_user"
       ON "messaging_channel_members" ("tenant_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_messaging_channel_member"
       ON "messaging_channel_members" ("channel_id", "user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_messaging_message_channel_created"
       ON "messaging_messages" ("tenant_id", "channel_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_messaging_message_parent"
       ON "messaging_messages" ("tenant_id", "parent_message_id")`,
    );

    // ── RLS: misma política que el resto del dominio CAD/design ───────────
    for (const table of [
      'messaging_channels',
      'messaging_channel_members',
      'messaging_messages',
    ] as const) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `CREATE POLICY "p_${table}_tenant" ON "${table}"
           USING ("tenant_id" = ${TENANT_SETTING})
           WITH CHECK ("tenant_id" = ${TENANT_SETTING})`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'messaging_messages',
      'messaging_channel_members',
      'messaging_channels',
    ] as const) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "p_${table}_tenant" ON "${table}"`,
      );
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "messaging_messages"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "messaging_channel_members"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "messaging_channels"`);
  }
}
