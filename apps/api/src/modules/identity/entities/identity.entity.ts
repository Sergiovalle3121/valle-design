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

/**
 * `mfa_challenge` se añadió con el segundo factor y reutiliza a propósito esta
 * tabla en vez de crear otra: un desafío de MFA ES un token de un solo uso con
 * caducidad corta, y aquí ya está resuelto lo difícil —se guarda en hash, se
 * consume con un UPDATE condicional, y emitir uno nuevo invalida los anteriores
 * del mismo propósito—. Una tabla propia habría duplicado esas tres reglas y
 * habría divergido en la primera prisa.
 */
export type OneTimeTokenPurpose =
  'verify_email' | 'reset_password' | 'invitation' | 'mfa_challenge';

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

/**
 * EL SEGUNDO FACTOR de una cuenta. Uno por usuario, y de momento sólo TOTP.
 *
 * `secretCiphertext` guarda el secreto CIFRADO (AES-256-GCM, ver
 * `identity-mfa.ts`): a diferencia de una contraseña, el servidor tiene que
 * poder reproducir el código, así que un hash no sirve — y guardarlo en claro
 * convertiría cualquier volcado de la base de datos en la derrota completa del
 * factor. La clave vive fuera de la base de datos.
 *
 * `confirmedAt` separa «lo empecé a dar de alta» de «funciona»: el factor no
 * protege nada hasta que el usuario demuestra con un código que su aplicación
 * quedó bien configurada. Un alta a medias que ya exigiera segundo factor
 * dejaría al usuario fuera de su propia cuenta, que es el peor fallo posible en
 * esta función.
 */
@Entity('identity_mfa_factors')
export class IdentityMfaFactor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', length: 16, default: 'totp' })
  type!: 'totp';

  @Column({ type: 'varchar', length: 512 })
  secretCiphertext!: string;

  @Column({ type: DATE_COLUMN_TYPE, nullable: true })
  confirmedAt!: Date | null;

  /**
   * El paso de tiempo del último código aceptado.
   *
   * Es la defensa contra REPETICIÓN, y es la parte que casi todas las
   * implementaciones caseras olvidan: sin ella, un código robado —de la pantalla
   * del usuario, de un registro, de una cámara— sigue sirviendo durante los
   * noventa segundos de la ventana, y ahí puede usarlo alguien más. Con ella, un
   * código vale exactamente una vez.
   *
   * `bigint` y no `integer`: el número de pasos desde 1970 cabe hoy en 32 bits,
   * pero elegir el tipo por lo que cabe hoy es cómo se fabrican los problemas
   * de 2038.
   */
  @Column({ type: 'bigint', nullable: true })
  lastUsedStep!: string | null;

  @Column({ type: DATE_COLUMN_TYPE, nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ type: DATE_COLUMN_TYPE })
  createdAt!: Date;
}

/**
 * CÓDIGOS DE RESPALDO — la salida cuando se pierde el teléfono.
 *
 * Se guardan en hash porque aquí el servidor sólo necesita COMPARAR. Y son la
 * ÚNICA recuperación a propósito: un «te mandamos un enlace al correo» convierte
 * el segundo factor en decoración, porque quien controle el correo entra igual y
 * el factor deja de añadir nada. El precio es que hay que guardarlos, y por eso
 * la interfaz obliga a descargarlos o copiarlos antes de terminar el alta.
 */
@Entity('identity_backup_codes')
export class IdentityBackupCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  codeHash!: string;

  @Column({ type: DATE_COLUMN_TYPE, nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: DATE_COLUMN_TYPE })
  createdAt!: Date;
}
