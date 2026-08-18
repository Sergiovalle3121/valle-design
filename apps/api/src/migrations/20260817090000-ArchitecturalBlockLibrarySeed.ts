import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ARCHITECTURAL_SEED_AUTHOR,
  ARCHITECTURAL_SEED_LIKE,
  ARCHITECTURAL_SEED_ROWS,
} from './seed/architectural-blocks';

/**
 * La biblioteca de bloques deja de ser un nombre y pasa a tener bloques.
 *
 * `ProfessionalCadBlockLibrary20260728110000` se llama «biblioteca profesional
 * de bloques» y lo único que hace es añadir las columnas `definition` y
 * `version` a `sf_cad_blocks`. Es decir: la biblioteca existía como esquema y
 * estaba VACÍA. Para un arquitecto eso es lo mismo que no existir — abre un
 * lienzo en blanco y no puede colocar una puerta —, y nadie deja AutoCAD para
 * volver a dibujar a mano las treinta piezas que dibuja todos los días. Esta
 * migración siembra esas piezas, a escala real y con el punto de inserción en
 * el sitio donde de verdad se colocan.
 *
 * ## Carril de sistema, no de inquilino
 *
 * Las filas se escriben con `tenant_id IS NULL`, que es el carril de sistema
 * que ya usan `cad_projects` y `cad_documents`, y con la llave estable
 * `legacy_source_id = 'valle:arq:<slug>'`. Sobre esa columna existe desde
 * `MigrationLegacyImport20260802090000` un índice único PARCIAL para ese mismo
 * carril, así que la idempotencia no depende de que este código se acuerde de
 * comprobar: la impone la base. Sembrar dos veces no duplica nada.
 *
 * `CadBlocksService` publica ese carril a todos los inquilinos en modo
 * lectura: son bloques del producto, no del cliente, y por eso el propio
 * servicio rechaza modificarlos o borrarlos.
 *
 * ## Fallo cerrado
 *
 * Si la tabla o las columnas que este sembrado necesita no están, se LANZA. Un
 * `return` silencioso —el patrón de las migraciones aditivas, correcto cuando
 * lo único en juego es una columna que quizá ya exista— aquí produciría una
 * biblioteca vacía que aparenta haberse aplicado, que es justo el estado que
 * esta migración existe para eliminar. Al final se cuenta lo sembrado contra
 * el catálogo: si falta uno, la migración falla y la transacción se deshace.
 *
 * ## El `down` no borra dibujo del usuario
 *
 * Sólo se retiran las filas del carril de sistema cuya llave está en el
 * catálogo, una por una y por igualdad exacta. Los bloques del inquilino —los
 * que el arquitecto guardó con BLOCK— llevan `tenant_id` y jamás entran en el
 * `DELETE`. Y las inserciones que ya vivan dentro de un documento no dependen
 * de esta tabla: la definición viaja COPIADA dentro del propio documento, así
 * que revertir la biblioteca no vacía ningún plano guardado.
 */
export class ArchitecturalBlockLibrarySeed20260817090000 implements MigrationInterface {
  name = 'ArchitecturalBlockLibrarySeed20260817090000';

  private async requireShape(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sf_cad_blocks')))
      throw new Error(
        'No existe sf_cad_blocks: la biblioteca de bloques arquitectónicos no puede sembrarse sobre una cadena de migraciones incompleta.',
      );
    for (const column of ['definition', 'version', 'legacy_source_id']) {
      if (!(await queryRunner.hasColumn('sf_cad_blocks', column)))
        throw new Error(
          `Falta sf_cad_blocks."${column}": el sembrado de bloques arquitectónicos lo necesita y no puede inventarlo.`,
        );
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.requireShape(queryRunner);

    for (const row of ARCHITECTURAL_SEED_ROWS) {
      await queryRunner.query(
        `
        INSERT INTO "sf_cad_blocks"
          ("tenant_id", "organization_id", "plant_id", "name", "assets",
           "definition", "version", "legacy_source_id", "created_by")
        VALUES (NULL, NULL, NULL, $1, '[]'::jsonb, $2::jsonb, 1, $3, $4)
        ON CONFLICT DO NOTHING
      `,
        [
          row.name,
          JSON.stringify(row.definition),
          row.legacySourceId,
          ARCHITECTURAL_SEED_AUTHOR,
        ],
      );
    }

    // La cuenta es la prueba de que están TODOS. Un catálogo con un slug
    // repetido dejaría que el índice único se comiera el segundo `INSERT` sin
    // decir nada, y la biblioteca saldría corta de la migración que existe
    // para llenarla.
    const [{ count }] = (await queryRunner.query(
      `SELECT count(*)::int AS count
         FROM "sf_cad_blocks"
        WHERE "tenant_id" IS NULL AND "legacy_source_id" LIKE $1`,
      [ARCHITECTURAL_SEED_LIKE],
    )) as Array<{ count: number }>;
    if (count !== ARCHITECTURAL_SEED_ROWS.length)
      throw new Error(
        `La biblioteca arquitectónica quedó incompleta: se esperaban ${ARCHITECTURAL_SEED_ROWS.length} bloques en el carril de sistema y hay ${count}.`,
      );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sf_cad_blocks'))) return;
    if (!(await queryRunner.hasColumn('sf_cad_blocks', 'legacy_source_id')))
      return;
    await queryRunner.query(
      `DELETE FROM "sf_cad_blocks"
        WHERE "tenant_id" IS NULL AND "legacy_source_id" = ANY($1::text[])`,
      [ARCHITECTURAL_SEED_ROWS.map((row) => row.legacySourceId)],
    );
  }
}
