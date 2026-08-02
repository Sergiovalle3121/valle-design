import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('identity_users')
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true }) @Column() email!: string;
  @Column({ nullable: true }) displayName!: string | null;
  @Column({ nullable: true }) emailVerifiedAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('identity_credentials')
export class Credential {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index({ unique: true }) @Column() userId!: string;
  @Column() passwordHash!: string;
  @Column({ default: 'argon2id' }) algorithm!: string;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('identity_sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index() @Column() userId!: string;
  @Column() secretHash!: string;
  @Column() csrfHash!: string;
  @Column() expiresAt!: Date;
  @Column({ nullable: true }) revokedAt!: Date | null;
  @Column({ nullable: true }) lastSeenAt!: Date | null;
  @Column({ nullable: true }) ipAddress!: string | null;
  @Column({ nullable: true }) userAgent!: string | null;
  @CreateDateColumn() createdAt!: Date;
}

export type OneTimeTokenPurpose = 'verify_email' | 'reset_password' | 'invitation';

@Entity('identity_one_time_tokens')
export class OneTimeToken {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index() @Column() subjectId!: string;
  @Column() purpose!: OneTimeTokenPurpose;
  @Index({ unique: true }) @Column() tokenHash!: string;
  @Column() expiresAt!: Date;
  @Column({ nullable: true }) consumedAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('identity_audit_events')
export class IdentityAuditEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ nullable: true }) actorUserId!: string | null;
  @Column({ nullable: true }) organizationId!: string | null;
  @Column() action!: string;
  @Column({ type: 'simple-json', nullable: true }) metadata!: Record<string, unknown> | null;
  @CreateDateColumn() createdAt!: Date;
}
