import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { JSON_COLUMN_TYPE } from '../common/database/json-column-type';

/** Adds canonical, versioned BLOCK definitions without invalidating legacy asset rows. */
export class ProfessionalCadBlockLibrary20260728110000 implements MigrationInterface {
  name = 'ProfessionalCadBlockLibrary20260728110000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sf_cad_blocks'))) return;
    const table = await queryRunner.getTable('sf_cad_blocks');
    if (!table?.findColumnByName('definition'))
      await queryRunner.addColumn(
        'sf_cad_blocks',
        new TableColumn({
          name: 'definition',
          type: JSON_COLUMN_TYPE,
          isNullable: true,
        }),
      );
    if (!table?.findColumnByName('version'))
      await queryRunner.addColumn(
        'sf_cad_blocks',
        new TableColumn({ name: 'version', type: 'integer', default: '1' }),
      );
  }

  /** Definition payloads are user CAD data; rollback must not discard them. */
  async down(): Promise<void> {}
}
