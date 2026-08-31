import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';

export const MESSAGING_CHANNEL_KINDS = ['project', 'direct'] as const;
export type MessagingChannelKind = (typeof MESSAGING_CHANNEL_KINDS)[number];

/**
 * Canal de mensajería: de PROYECTO (ligado a `cad_projects`, visible a
 * cualquier miembro de la organización) o DIRECTO (entre dos personas,
 * `direct_key` = los dos `userId` ordenados y unidos con `:`, único por
 * tenant — evita abrir dos canales para el mismo par).
 */
@Entity('messaging_channels')
@Index('idx_messaging_channel_scope', ['tenant_id', 'organization_id'])
@Index('idx_messaging_channel_project', ['tenant_id', 'projectId'])
export class MessagingChannel extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  kind: MessagingChannelKind;

  /** FK a `cad_projects`. NULL para canales directos. */
  @Column({ type: 'uuid', nullable: true, name: 'project_id' })
  projectId: string | null;

  /** Nombre visible. Obligatorio para canales de proyecto; null en directos. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  name: string | null;

  /** `[userIdA, userIdB].sort().join(':')`. NULL en canales de proyecto. */
  @Column({ type: 'varchar', length: 160, nullable: true, name: 'direct_key' })
  directKey: string | null;
}
