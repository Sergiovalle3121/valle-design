import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';

/**
 * Mensaje de un canal. `anchor` reutiliza EXACTAMENTE el mismo contrato JSON
 * que `cad_comments.anchor` (`CadCommentAnchorPoint` en
 * `apps/web/src/lib/cad/collab/comment-anchor.ts`; la forma se valida en el
 * servidor con `assertCadCommentAnchor`, la misma barrera que usan los
 * comentarios de revisión) — un mensaje puede apuntar a una entidad, cara o
 * vista del dibujo igual que un comentario, y el mismo visor sabe pintar los
 * dos.
 */
@Entity('messaging_messages')
@Index('idx_messaging_message_channel_created', [
  'tenant_id',
  'channelId',
  'created_at',
])
@Index('idx_messaging_message_parent', ['tenant_id', 'parentMessageId'])
export class MessagingMessage extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'channel_id' })
  channelId: string;

  @Column({ type: 'uuid', name: 'author_user_id' })
  authorUserId: string;

  @Column({ type: 'text' })
  body: string;

  /** Mensaje al que responde. NULL = mensaje raíz del canal. */
  @Column({ type: 'uuid', nullable: true, name: 'parent_message_id' })
  parentMessageId: string | null;

  /** Ancla al dibujo (JSON libre, mismo contrato que CadComment.anchor). */
  @Column({ type: JSON_COLUMN_TYPE, nullable: true })
  anchor: Record<string, unknown> | null;
}
