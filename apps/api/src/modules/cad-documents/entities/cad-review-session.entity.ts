import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';

/**
 * Sesión de revisión de un documento CAD propio (WP3): el ciclo de vida de una
 * ronda de comentarios/markup sobre el dibujo. `token_hash` queda reservado
 * (nullable) para los review links compartibles futuros — se guarda el HASH del
 * token, nunca el token en claro.
 *
 * `created_at`/`created_by` vienen de TenantBaseEntity — NO redeclararlos.
 */
@Entity('cad_review_sessions')
@Index('idx_cad_review_session_scope', ['tenant_id', 'documentId'])
export class CadReviewSession extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK a `cad_documents`. */
  @Column({ type: 'varchar', length: 36, name: 'document_id' })
  documentId: string;

  /** Ciclo de vida: 'open' | 'closed' (extensible). */
  @Column({ type: 'varchar', length: 24, default: 'open' })
  status: string;

  @Column({ type: DATE_COLUMN_TYPE, nullable: true, name: 'closed_at' })
  closedAt: Date | null;

  /** Hash del token del review link futuro. NULL = sesión sin link. */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'token_hash' })
  tokenHash: string | null;
}
