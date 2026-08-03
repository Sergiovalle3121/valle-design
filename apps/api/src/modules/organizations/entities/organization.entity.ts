import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';
import { User } from '../../identity/entities/identity.entity';

export const ORGANIZATION_ROLES = [
  'owner',
  'admin',
  'member',
  'viewer',
] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  slug!: string;
  @Column({ type: 'uuid' }) ownerUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ownerUserId' })
  owner!: User;
  @CreateDateColumn({ type: DATE_COLUMN_TYPE }) createdAt!: Date;
}

@Entity('organization_memberships')
@Index(['organizationId', 'userId'], { unique: true })
export class Membership {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index()
  @Column({ type: 'uuid' })
  organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization!: Organization;
  @Index()
  @Column({ type: 'uuid' })
  userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
  @Column({ type: 'varchar', length: 20, default: 'member' })
  role!: OrganizationRole;
  @CreateDateColumn({ type: DATE_COLUMN_TYPE }) createdAt!: Date;
}

@Entity('organization_invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index()
  @Column({ type: 'uuid' })
  organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization!: Organization;
  @Column({ type: 'varchar', length: 254 }) email!: string;
  @Column({ type: 'varchar', length: 20 }) role!: Exclude<
    OrganizationRole,
    'owner'
  >;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;
  @Column({ type: DATE_COLUMN_TYPE }) expiresAt!: Date;
  @Column({ type: DATE_COLUMN_TYPE, nullable: true }) consumedAt!: Date | null;
  @Column({ type: 'uuid' }) invitedByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'invitedByUserId' })
  invitedBy!: User;
  @CreateDateColumn({ type: DATE_COLUMN_TYPE }) createdAt!: Date;
}
