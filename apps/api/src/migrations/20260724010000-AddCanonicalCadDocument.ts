import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { JSON_COLUMN_TYPE } from '../common/database/json-column-type';

export class AddCanonicalCadDocument20260724010000 implements MigrationInterface {
  name = 'AddCanonicalCadDocument20260724010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sf_line_layouts'))) return;
    const table = await queryRunner.getTable('sf_line_layouts');
    if (!table?.findColumnByName('cad_document')) {
      await queryRunner.addColumn(
        'sf_line_layouts',
        new TableColumn({
          name: 'cad_document',
          type: JSON_COLUMN_TYPE,
          isNullable: true,
        }),
      );
    }
    if (!table?.findColumnByName('cad_document_version')) {
      await queryRunner.addColumn(
        'sf_line_layouts',
        new TableColumn({
          name: 'cad_document_version',
          type: 'integer',
          default: '0',
        }),
      );
    }
  }

  // Deliberate no-op: a rollback must not silently discard canonical drawings.
  public async down(): Promise<void> {}
}
