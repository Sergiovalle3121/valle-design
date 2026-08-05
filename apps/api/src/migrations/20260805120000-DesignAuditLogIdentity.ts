import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repara la identidad de `design_audit_log`.
 *
 * EL DEFECTO
 * La entidad declaraba `@PrimaryGeneratedColumn('uuid')`, que en PostgreSQL
 * significa «la BASE genera el id»: TypeORM omite el valor y emite `DEFAULT`
 * en el INSERT. Pero `20260801121000-DesignFoundation` creó la columna como
 * `varchar(36) PRIMARY KEY NOT NULL` SIN default — la única tabla del
 * repositorio sin generación propia. Cada asiento de auditoría CAD moría con
 *
 *   null value in column "id" of relation "design_audit_log"
 *     violates not-null constraint            (SQLSTATE 23502)
 *
 * y `DesignCadAuditPublisher` lo tragaba como aviso, así que la aplicación
 * seguía y la auditoría no registraba NADA. CI no lo veía porque las pruebas
 * pg de esa tabla corrían con `synchronize: true`, es decir contra el esquema
 * derivado de la entidad (uuid + default), no contra este DDL.
 *
 * POR QUÉ NO SE CAMBIA EL TIPO A `uuid`
 * Convertir la columna exigiría que TODA fila existente fuese un UUID válido.
 * Una bitácora append-only puede contener ids heredados con otro formato, y
 * perderlos —o rechazarlos en el arranque de un despliegue— sería peor que la
 * divergencia de tipo. Se conserva `varchar(36)`, que admite un UUID textual
 * completo, y se documenta la decisión aquí en vez de dejarla implícita.
 *
 * DÓNDE SE GENERA EL ID
 * En la APLICACIÓN (`DesignAuditLogEntry`, hook `@BeforeInsert`), porque es la
 * única estrategia idéntica en PostgreSQL y en el adaptador SQLite de
 * desarrollo. Este `DEFAULT` es una red de seguridad para cualquier escritor
 * que no pase por la entidad, no la fuente principal.
 *
 * `gen_random_uuid()` es del núcleo de PostgreSQL desde la 13 — no requiere
 * `pgcrypto` ni ninguna otra extensión que producción pudiera no tener. Aun
 * así se comprueba antes de usarla y, si faltara, la migración falla con la
 * remediación explícita en vez de dejar la tabla a medias.
 */
export class DesignAuditLogIdentity20260805120000 implements MigrationInterface {
  name = 'DesignAuditLogIdentity20260805120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    const available = (await queryRunner.query(
      `SELECT 1 AS ok FROM pg_proc WHERE proname = 'gen_random_uuid' LIMIT 1`,
    )) as unknown[];
    if (!available.length) {
      throw new Error(
        'DesignAuditLogIdentity: falta gen_random_uuid(). Es del núcleo de ' +
          'PostgreSQL >= 13; en una versión anterior, habilita la extensión ' +
          'pgcrypto (CREATE EXTENSION pgcrypto) o actualiza el servidor antes ' +
          'de aplicar esta migración.',
      );
    }

    await queryRunner.query(
      `ALTER TABLE "design_audit_log"
         ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text`,
    );
    // La columna ya era NOT NULL, pero se reafirma: el default sólo sirve si
    // la restricción sigue en pie, y así el estado final es explícito venga de
    // donde venga la base.
    await queryRunner.query(
      `ALTER TABLE "design_audit_log" ALTER COLUMN "id" SET NOT NULL`,
    );
  }

  /**
   * Quitar el default es seguro: la identidad la genera la aplicación, así que
   * revertir no deja la tabla sin poder escribir — la deja exactamente como
   * estaba antes de esta migración.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    await queryRunner.query(
      `ALTER TABLE "design_audit_log" ALTER COLUMN "id" DROP DEFAULT`,
    );
  }
}
