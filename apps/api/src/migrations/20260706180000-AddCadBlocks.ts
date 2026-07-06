import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bloques CAD reutilizables (ADR §224): biblioteca por tenant de celdas
 * estándar (assets con coordenadas relativas) insertables en cualquier layout.
 *
 * Las columnas de auditoría (created_at/updated_at/deleted_at/created_by)
 * vienen de TenantBaseEntity — el CREATE espeja esa forma exacta.
 *
 * Aditivo puro con guards (patrón §145) — en bases donde synchronize ya
 * materializó la entidad, es no-op.
 */
export class AddCadBlocks20260706180000 implements MigrationInterface {
  name = 'AddCadBlocks20260706180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sf_cad_blocks'))) {
      await queryRunner.query(`
        CREATE TABLE "sf_cad_blocks" (
          "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
          "tenant_id"       character varying(36),
          "organization_id" character varying(36),
          "plant_id"        character varying(36),
          "name"            character varying(80) NOT NULL,
          "assets"          jsonb NOT NULL,
          "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at"      TIMESTAMP NOT NULL DEFAULT now(),
          "deleted_at"      TIMESTAMP,
          "created_by"      character varying(255),
          CONSTRAINT "PK_sf_cad_blocks" PRIMARY KEY ("id")
        )
      `);
      await queryRunner.query(
        `CREATE INDEX "idx_sf_cad_block_scope" ON "sf_cad_blocks" ("tenant_id", "plant_id")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('sf_cad_blocks')) {
      await queryRunner.query(`DROP TABLE "sf_cad_blocks"`);
    }
  }
}
