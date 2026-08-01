import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';

/**
 * Comentario sobre un documento CAD propio (WP3), opcionalmente dentro de una
 * sesión de revisión. `anchor` guarda la posición en el dibujo (coordenadas /
 * entidad ancla) como JSON libre para no acoplar la tabla al esquema del
 * documento canónico.
 *
 * Timestamps (`created_at`/`updated_at`) vienen de TenantBaseEntity.
 */
@Entity('cad_comments')
@Index('idx_cad_comment_scope', ['tenant_id', 'documentId'])
@Index('idx_cad_comment_session', ['tenant_id', 'reviewSessionId'])
export class CadComment extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK a `cad_review_sessions`. NULL = comentario directo sobre el documento. */
  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
    name: 'review_session_id',
  })
  reviewSessionId: string | null;

  /** FK a `cad_documents`. */
  @Column({ type: 'varchar', length: 36, name: 'document_id' })
  documentId: string;

  @Column({ type: 'varchar', length: 255 })
  author: string;

  @Column({ type: 'text' })
  body: string;

  /** Posición del comentario en el dibujo (JSON libre). NULL = sin ancla. */
  @Column({ type: JSON_COLUMN_TYPE, nullable: true })
  anchor: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;
}
