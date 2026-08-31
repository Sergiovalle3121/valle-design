import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';

/**
 * Membresía de un canal: en canales DIRECTOS es la lista de control de
 * acceso (sin fila aquí, el canal no existe para esa persona); en canales de
 * PROYECTO existe solo para guardar `last_read_at` — la visibilidad la da la
 * organización, no esta tabla (ver `ensureProjectChannelMembership` en el
 * servicio).
 */
@Entity('messaging_channel_members')
@Index('idx_messaging_channel_member_channel', ['tenant_id', 'channelId'])
@Index('idx_messaging_channel_member_user', ['tenant_id', 'userId'])
@Index('uq_messaging_channel_member', ['channelId', 'userId'], {
  unique: true,
})
export class MessagingChannelMember extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'channel_id' })
  channelId: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  /** Último instante leído. NULL = nunca leyó este canal. */
  @Column({ type: DATE_COLUMN_TYPE, nullable: true, name: 'last_read_at' })
  lastReadAt: Date | null;
}
