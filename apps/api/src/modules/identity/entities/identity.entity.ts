import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';

@Entity('identity_users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  displayName!: string | null;

  @Column({ type: DATE_COLUMN_TYPE, nullable: true })
  emailVerifiedAt!: Date | null;

  @CreateDateColumn({ type: DATE_COLUMN_TYPE })
  createdAt!: Date;
}

@Entity('identity_credentials')
export class Credential {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', length: 512 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 32, default: 'argon2id' })
  algorithm!: string;

  @CreateDateColumn({ type: DATE_COLUMN_TYPE })
  createdAt!: Date;
}

@Entity('identity_sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', length: 64 })
  secretHash!: string;

  @Column({ type: 'varchar', length: 64 })
  csrfHash!: string;

  @Column({ type: DATE_COLUMN_TYPE })
  expiresAt!: Date;

  @Column({ type: DATE_COLUMN_TYPE, nullable: true })
  revokedAt!: Date | null;

  @Column({ type: DATE_COLUMN_TYPE, nullable: true })
  lastSeenAt!: Date | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'uuid', nullable: true })
  activeOrganizationId!: string | null;

  @CreateDateColumn({ type: DATE_COLUMN_TYPE })
  createdAt!: Date;
}

export type OneTimeTokenPurpose =
  'verify_email' | 'reset_password' | 'invitation';

@Entity('identity_one_time_tokens')
export class OneTimeToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  subjectId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subjectId' })
  subject!: User;

  @Column({ type: 'varchar', length: 32 })
  purpose!: OneTimeTokenPurpose;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: DATE_COLUMN_TYPE })
  expiresAt!: Date;

  @Column({ type: DATE_COLUMN_TYPE, nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: DATE_COLUMN_TYPE })
  createdAt!: Date;
}

@Entity('identity_audit_events')
export class IdentityAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  action!: string;

  @Column({ type: JSON_COLUMN_TYPE, nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: DATE_COLUMN_TYPE })
  createdAt!: Date;
}

/** Opaque, shared fixed-window counters; no email/IP is persisted in clear. */
@Entity('identity_rate_limits')
export class IdentityRateLimit {
  @PrimaryColumn({ type: 'varchar', length: 256 })
  key!: string;

  @Column({ type: 'integer' })
  count!: number;

  @Index('idx_identity_rate_limits_reset')
  @Column({ name: 'reset_at', type: DATE_COLUMN_TYPE })
  resetAt!: Date;

  @Column({ name: 'updated_at', type: DATE_COLUMN_TYPE })
  updatedAt!: Date;
}
