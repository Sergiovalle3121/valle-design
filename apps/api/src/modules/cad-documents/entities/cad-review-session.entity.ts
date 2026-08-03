import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';

/**
 * Sesión de revisión de un documento CAD propio (WP3): el ciclo de vida de una
 * ronda de comentarios/markup sobre el dibujo.
 *
 * REVIEW LINKS SERVER-OWNED (Fase 5): `token_hash` guarda el sha256 (hex) del
 * token del review link — NUNCA el token en claro, que solo viaja en la
 * respuesta de creación. El canje valida hash + expiración (`expires_at`,
 * comprobada server-side en CADA request) + revocación (`revoked_at`: cerrar
 * la sesión mata el link de inmediato). `allow_comments` decide si el contexto
 * de review (siempre de solo lectura sobre el dibujo) puede crear/resolver
 * comentarios.
 *
 * `created_at`/`created_by` vienen de TenantBaseEntity — NO redeclararlos.
 */
@Entity('cad_review_sessions')
@Index('idx_cad_review_session_scope', ['tenant_id', 'documentId'])
@Index('uq_cad_review_session_token', ['tokenHash'], {
  unique: true,
  where: '"token_hash" IS NOT NULL',
})
export class CadReviewSession extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK a `cad_documents`. */
  @Column({ type: 'uuid', name: 'document_id' })
  documentId: string;

  /** Ciclo de vida: 'open' | 'closed' (extensible). */
  @Column({ type: 'varchar', length: 24, default: 'open' })
  status: string;

  @Column({ type: DATE_COLUMN_TYPE, nullable: true, name: 'closed_at' })
  closedAt: Date | null;

  /**
   * sha256 hex (64 chars) del token del review link. NULL = sesión sin link.
   * El índice único parcial hace el canje O(log n) y global (el tenant sale
   * de la fila, jamás del cliente).
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'token_hash' })
  tokenHash: string | null;

  /** Expiración del review link (server-side). NULL = sesión sin link. */
  @Column({ type: DATE_COLUMN_TYPE, nullable: true, name: 'expires_at' })
  expiresAt: Date | null;

  /** Revocación explícita del link (cerrar la sesión lo estampa). */
  @Column({ type: DATE_COLUMN_TYPE, nullable: true, name: 'revoked_at' })
  revokedAt: Date | null;

  /** ¿El contexto de review puede crear/resolver comentarios? */
  @Column({ type: 'boolean', default: true, name: 'allow_comments' })
  allowComments: boolean;

  /** Id anterior a la normalización UUID. NULL en sesiones nativas. */
  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    name: 'legacy_source_id',
  })
  legacySourceId: string | null;
}
