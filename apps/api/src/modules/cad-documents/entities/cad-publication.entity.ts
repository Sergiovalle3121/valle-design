import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';

/**
 * Recibo inmutable de publicación del documento CAD propio (WP3): qué hojas
 * (paper spaces) se publicaron, el hash y tamaño del PDF generado, quién y
 * cuándo. Equivalente en tabla propia de los recibos `publications` que hoy
 * viajan dentro del documento canónico legacy.
 *
 * `legacy_source_id` = id del recibo embebido de origen cuando la fila se copie
 * en Fase 4; NULL = publicación nativa. Sin FK fuera de tablas cad_*.
 */
@Entity('cad_publications')
@Index('idx_cad_publication_scope', ['tenant_id', 'documentId'])
export class CadPublication extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK a `cad_documents`. */
  @Column({ type: 'varchar', length: 36, name: 'document_id' })
  documentId: string;

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName: string;

  /** sha256 del PDF publicado (integridad del artefacto, no FK a blobs). */
  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ type: 'integer' })
  bytes: number;

  /** Ids de las hojas (paper spaces) incluidas en la publicación. */
  @Column({ type: JSON_COLUMN_TYPE, name: 'paper_space_ids' })
  paperSpaceIds: string[];

  @Column({ type: 'varchar', length: 255, name: 'published_by' })
  publishedBy: string;

  @Column({ type: DATE_COLUMN_TYPE, name: 'published_at' })
  publishedAt: Date;

  /** Id del recibo legacy de origen (Fase 4). NULL = publicación nativa. */
  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    name: 'legacy_source_id',
  })
  legacySourceId: string | null;
}
