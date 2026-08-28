import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/database/unique-violation';
import {
  EMAIL_SERVICE,
  type EmailService,
} from '../commercial/ports/commercial.ports';
import {
  Membership,
  Organization,
} from '../organizations/entities/organization.entity';
import { permissionsForOrganizationRole } from '../organizations/organization-permissions';
import {
  Credential,
  IdentityAuditEvent,
  OneTimeToken,
  OneTimeTokenPurpose,
  Session,
  User,
} from './entities/identity.entity';
import {
  constantTimeEqual,
  DUMMY_PASSWORD_HASH,
  hashArgon2idPassword,
  hashOpaqueToken,
  MAX_TOKEN_LENGTH,
  verifyArgon2idPassword,
} from './identity-security';
import { IdentityMfaService } from './identity-mfa.service';

export { CSRF_COOKIE, SESSION_COOKIE } from './identity-security';

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SESSION_COOKIE_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/iu;

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Credential)
    private readonly credentials: Repository<Credential>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(OneTimeToken)
    private readonly tokens: Repository<OneTimeToken>,
    @InjectRepository(IdentityAuditEvent)
    private readonly audit: Repository<IdentityAuditEvent>,
    private readonly mfa: IdentityMfaService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  findUserByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: this.normalizeEmail(email) });
  }

  hashToken(token: string): string {
    return hashOpaqueToken(token);
  }

  tokensMatch(left: unknown, right: unknown): boolean {
    return constantTimeEqual(left, right);
  }

  tokenMatchesHash(rawToken: string, expectedHash: string): boolean {
    return constantTimeEqual(this.hashToken(rawToken), expectedHash);
  }

  newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashPassword(password: string): Promise<string> {
    return hashArgon2idPassword(password);
  }

  verifyPassword(hash: string, password: string): Promise<boolean> {
    return verifyArgon2idPassword(hash, password);
  }

  async register(email: string, password: string, displayName?: string) {
    const normalized = this.normalizeEmail(email);
    const existing = await this.users.findOneBy({ email: normalized });

    // Hash on both paths so an observer cannot distinguish an existing account
    // from a new one using the response time.
    const passwordHash = await this.hashPassword(password);
    if (existing) {
      return { accepted: true };
    }

    const verification = this.newToken();
    try {
      await this.dataSource.transaction(async (manager) => {
        const user = await manager.save(
          User,
          manager.create(User, {
            email: normalized,
            displayName: displayName?.trim() || null,
          }),
        );
        await manager.save(
          Credential,
          manager.create(Credential, {
            userId: user.id,
            passwordHash,
            algorithm: 'argon2id',
          }),
        );
        const token = await manager.save(
          OneTimeToken,
          manager.create(OneTimeToken, {
            subjectId: user.id,
            purpose: 'verify_email',
            tokenHash: this.hashToken(verification),
            expiresAt: new Date(Date.now() + 24 * 3_600_000),
          }),
        );
        await this.enqueueIdentityEmail(
          manager,
          user,
          token,
          verification,
          'identity.verify-email',
          '/verify-email',
        );
        await manager.save(
          IdentityAuditEvent,
          manager.create(IdentityAuditEvent, {
            actorUserId: user.id,
            action: 'identity.registered',
          }),
        );
      });
    } catch (error) {
      if (
        !isUniqueViolation(error) ||
        !(await this.users.findOneBy({ email: normalized }))
      ) {
        throw error;
      }
      // A concurrent registration won the unique email constraint. Preserve
      // the same non-enumerating response as the ordinary existing-user path.
    }

    return { accepted: true };
  }

  /**
   * INICIO DE SESIÓN, en uno o en dos actos.
   *
   * Cuando la cuenta NO tiene segundo factor, esto se comporta exactamente como
   * antes: contraseña correcta ⇒ sesión. Cuando SÍ lo tiene, la contraseña por
   * sí sola ya no abre nada: se emite un DESAFÍO de vida corta y el llamador
   * tiene que volver con el código.
   *
   * El desafío es un token de un solo uso, guardado en hash como todos los
   * demás. Es deliberado que no sea una sesión «a medias» marcada con una
   * bandera: una sesión parcial es una sesión, y basta un endpoint que se
   * olvide de mirar la bandera para que el segundo factor deje de existir. Un
   * desafío que no es sesión no puede autenticar nada por accidente.
   */
  async login(
    email: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ): Promise<
    | {
        kind: 'session';
        session: Session;
        user: User;
        cookie: string;
        csrf: string;
      }
    | { kind: 'mfa'; challenge: string; expiresAt: Date }
  > {
    const user = await this.users.findOneBy({
      email: this.normalizeEmail(email),
    });
    const credential = user
      ? await this.credentials.findOneBy({ userId: user.id })
      : null;
    const candidateHash =
      credential?.algorithm === 'argon2id'
        ? credential.passwordHash
        : DUMMY_PASSWORD_HASH;

    // A real Argon2id derivation also runs for missing/unsupported accounts.
    const valid = await this.verifyPassword(candidateHash, password);
    if (!user || !credential || !user.emailVerifiedAt || !valid) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const factor = await this.mfa.confirmedMfaFactor(user.id);
    if (factor) {
      return { kind: 'mfa', ...(await this.issueMfaChallenge(user)) };
    }

    const created = await this.createSession(user, ip, userAgent);
    await this.recordSignIn(user, created.session, 'password');
    return { kind: 'session', ...created };
  }

  /**
   * Segundo acto: el código. Cierra el desafío y abre la sesión.
   *
   * Acepta un código TOTP o uno de respaldo, y en los dos casos el desafío se
   * consume ANTES de validar nada: si se consumiera después, un atacante con el
   * desafío tendría intentos ilimitados dentro de sus cinco minutos. Así cada
   * desafío vale exactamente un intento, que es lo que convierte el límite de
   * peticiones en un límite de verdad.
   */
  async completeMfaLogin(
    challenge: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{
    session: Session;
    user: User;
    cookie: string;
    csrf: string;
  } | null> {
    if (!this.validOpaqueToken(challenge)) return null;
    const consumed = await this.dataSource.transaction((manager) =>
      this.consumeTokenWithManager(manager, challenge, 'mfa_challenge'),
    );
    if (!consumed) return null;

    const user = await this.users.findOneBy({ id: consumed.subjectId });
    if (!user) return null;

    const method = await this.mfa.consumeSecondFactor(user.id, code);
    if (!method) {
      throw new UnauthorizedException('Código inválido o ya utilizado.');
    }

    const created = await this.createSession(user, ip, userAgent);
    await this.recordSignIn(user, created.session, method);
    return created;
  }

  async createSession(user: User, ip?: string, userAgent?: string) {
    const secret = this.newToken();
    const csrf = this.newToken();
    const session = await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        secretHash: this.hashToken(secret),
        csrfHash: this.hashToken(csrf),
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        ipAddress: ip || null,
        userAgent: userAgent?.slice(0, 500) || null,
      }),
    );

    return { session, user, cookie: `${session.id}.${secret}`, csrf };
  }

  async authenticate(
    cookieValue?: string,
  ): Promise<{ session: Session; user: User } | null> {
    const match = cookieValue ? SESSION_COOKIE_PATTERN.exec(cookieValue) : null;
    if (!match) {
      return null;
    }

    const [, id, secret] = match;
    const session = await this.sessions.findOneBy({ id });
    const secretMatches = this.tokenMatchesHash(
      secret,
      session?.secretHash ?? '',
    );
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !secretMatches
    ) {
      return null;
    }

    const user = await this.users.findOneBy({ id: session.userId });
    return user ? { session, user } : null;
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const result = await this.sessions
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('id = :id AND userId = :userId AND revokedAt IS NULL', {
        id,
        userId,
      })
      .execute();
    return !!result.affected;
  }

  async revokeAll(userId: string, exceptId?: string): Promise<void> {
    const query = this.sessions
      .createQueryBuilder()
      .update()
      .set({ revokedAt: new Date() })
      .where('userId = :userId AND revokedAt IS NULL', { userId });
    if (exceptId) {
      query.andWhere('id != :exceptId', { exceptId });
    }
    await query.execute();
  }

  async listSessions(userId: string): Promise<Session[]> {
    return this.sessions.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async activeOrganizationContext(
    userId: string,
    organizationId: string | null,
  ) {
    if (!organizationId) return null;
    const membership = await this.dataSource
      .getRepository(Membership)
      .findOneBy({
        organizationId,
        userId,
      });
    if (!membership) return null;
    const organization = await this.dataSource
      .getRepository(Organization)
      .findOneBy({ id: organizationId });
    if (!organization) return null;
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      tenantId: organization.id,
      role: membership.role,
      permissions: permissionsForOrganizationRole(membership.role),
    };
  }

  async sendVerificationEmail(email: string): Promise<void> {
    const user = await this.findUserByEmail(email);
    if (!user || user.emailVerifiedAt) return;
    await this.issueIdentityEmailToken(
      user,
      'verify_email',
      24 * 3_600_000,
      'identity.verify-email',
      '/verify-email',
    );
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    const user = await this.findUserByEmail(email);
    if (!user) return;
    await this.issueIdentityEmailToken(
      user,
      'reset_password',
      60 * 60_000,
      'identity.reset-password',
      '/reset-password',
    );
  }

  async verifyEmail(raw: string): Promise<boolean> {
    if (!this.validOpaqueToken(raw)) return false;
    return this.dataSource.transaction(async (manager) => {
      const token = await this.consumeTokenWithManager(
        manager,
        raw,
        'verify_email',
      );
      if (!token) return false;
      const result = await manager.update(User, token.subjectId, {
        emailVerifiedAt: new Date(),
      });
      if (!result.affected) {
        throw new Error('Identity invariant violated: token subject missing.');
      }
      await manager.save(
        IdentityAuditEvent,
        manager.create(IdentityAuditEvent, {
          actorUserId: token.subjectId,
          action: 'identity.email_verified',
        }),
      );
      return true;
    });
  }

  async resetPassword(raw: string, password: string): Promise<boolean> {
    if (!this.validOpaqueToken(raw)) return false;
    const passwordHash = await this.hashPassword(password);
    return this.dataSource.transaction(async (manager) => {
      const token = await this.consumeTokenWithManager(
        manager,
        raw,
        'reset_password',
      );
      if (!token) return false;
      const credential = await manager.update(
        Credential,
        { userId: token.subjectId },
        { passwordHash, algorithm: 'argon2id' },
      );
      if (!credential.affected) {
        throw new Error(
          'Identity invariant violated: password credential missing.',
        );
      }
      await manager
        .createQueryBuilder()
        .update(Session)
        .set({ revokedAt: new Date() })
        .where('userId = :userId AND revokedAt IS NULL', {
          userId: token.subjectId,
        })
        .execute();
      await manager.save(
        IdentityAuditEvent,
        manager.create(IdentityAuditEvent, {
          actorUserId: token.subjectId,
          action: 'identity.password_reset',
        }),
      );
      return true;
    });
  }

  /**
   * El desafío entre la contraseña y el código. Cinco minutos.
   *
   * Suficiente para abrir la aplicación de autenticación y teclear seis
   * dígitos, incluso buscando el teléfono; corto como para que un desafío
   * filtrado no sirva de nada al rato. Reutiliza la tabla de tokens de un solo
   * uso, así que emitir uno invalida el anterior por construcción.
   */
  private async issueMfaChallenge(
    user: User,
  ): Promise<{ challenge: string; expiresAt: Date }> {
    const raw = this.newToken();
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await this.dataSource.transaction(async (manager) => {
      await this.lockIdentitySubject(manager, user.id);
      await manager
        .createQueryBuilder()
        .update(OneTimeToken)
        .set({ consumedAt: new Date() })
        .where(
          'subjectId = :userId AND purpose = :purpose AND consumedAt IS NULL',
          { userId: user.id, purpose: 'mfa_challenge' },
        )
        .execute();
      await manager.save(
        OneTimeToken,
        manager.create(OneTimeToken, {
          subjectId: user.id,
          purpose: 'mfa_challenge',
          tokenHash: this.hashToken(raw),
          expiresAt,
        }),
      );
    });
    return { challenge: raw, expiresAt };
  }

  /* ═══ ACTIVIDAD DE LA CUENTA ═════════════════════════════════════════════ */

  /**
   * Deja constancia del inicio de sesión y AVISA por correo.
   *
   * Dos cosas que el producto no hacía y que son la base de que un usuario
   * pueda vigilar su propia cuenta: la tabla de auditoría no registraba ni un
   * inicio de sesión —sólo alta, verificación y restablecimiento— así que la
   * página de cuenta no tenía nada que enseñar.
   *
   * El aviso por correo va por el outbox transaccional, igual que la
   * verificación y el restablecimiento. Y NO se envía en el primer inicio tras
   * el alta: el usuario acaba de registrarse, sabe perfectamente que entró, y
   * un correo de «inicio de sesión nuevo» a los diez segundos de otro de
   * bienvenida enseña a la gente a ignorar exactamente el aviso que algún día
   * tendrá que leer con atención.
   *
   * Ni el fallo del registro ni el del correo pueden tumbar un inicio de sesión
   * válido: se registran y se sigue. Que la auditoría estorbe a la función que
   * audita es cambiar un problema pequeño por uno grande.
   */
  private async recordSignIn(
    user: User,
    session: Session,
    method: 'password' | 'totp' | 'backup_code',
  ): Promise<void> {
    try {
      const previous = await this.audit.count({
        where: { actorUserId: user.id, action: 'identity.signed_in' },
      });
      const userAgent = session.userAgent?.slice(0, 200) ?? null;
      // El registro y el aviso van en la MISMA transacción, igual que la
      // verificación de correo: o queda constancia y sale el aviso, o no pasa
      // ninguna de las dos cosas. Un aviso enviado sin fila en el historial
      // manda al usuario a una página de actividad que no le enseña el suceso
      // del que acaba de recibir un correo.
      await this.dataSource.transaction(async (manager) => {
        await manager.save(
          IdentityAuditEvent,
          manager.create(IdentityAuditEvent, {
            actorUserId: user.id,
            action: 'identity.signed_in',
            metadata: {
              method,
              sessionId: session.id,
              // El agente de usuario ya se guarda en la sesión; aquí viaja
              // recortado para que el historial se pueda leer sin unir tablas.
              userAgent,
            },
          }),
        );
        if (previous > 0) {
          await this.email.enqueue(
            {
              organizationId: null,
              tenantId: null,
              to: user.email,
              template: 'identity.new-sign-in',
              payload: {
                method,
                at: new Date().toISOString(),
                userAgent,
              },
              // La sesión es única, así que un reintento del mismo inicio no
              // puede producir dos correos.
              idempotencyKey: `identity.new-sign-in:${session.id}`,
            },
            { native: manager },
          );
        }
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo registrar el inicio de sesión de ${user.id}: ${
          error instanceof Error ? error.message : 'causa desconocida'
        }`,
      );
    }
  }

  /**
   * El historial reciente que enseña la página de cuenta.
   *
   * Sale de la tabla de auditoría que ya existía. Se limita a los sucesos de
   * IDENTIDAD del propio usuario y a un tope de filas: un historial infinito en
   * una página de cuenta es una consulta cara para responder a una pregunta
   * («¿entró alguien más?») que sólo mira los últimos días.
   */
  async recentActivity(
    userId: string,
    limit = 25,
  ): Promise<IdentityAuditEvent[]> {
    return this.audit.find({
      where: { actorUserId: userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  private async issueIdentityEmailToken(
    user: User,
    purpose: OneTimeTokenPurpose,
    ttlMs: number,
    template: string,
    path: string,
  ): Promise<void> {
    const raw = this.newToken();
    await this.dataSource.transaction(async (manager) => {
      await this.lockIdentitySubject(manager, user.id);
      await manager
        .createQueryBuilder()
        .update(OneTimeToken)
        .set({ consumedAt: new Date() })
        .where(
          'subjectId = :userId AND purpose = :purpose AND consumedAt IS NULL',
          { userId: user.id, purpose },
        )
        .execute();
      const token = await manager.save(
        OneTimeToken,
        manager.create(OneTimeToken, {
          subjectId: user.id,
          purpose,
          tokenHash: this.hashToken(raw),
          expiresAt: new Date(Date.now() + ttlMs),
        }),
      );
      await this.enqueueIdentityEmail(
        manager,
        user,
        token,
        raw,
        template,
        path,
      );
    });
  }

  private async lockIdentitySubject(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    if (this.dataSource.options.type !== 'postgres') return;
    await manager
      .getRepository(User)
      .createQueryBuilder('identity_user')
      .setLock('pessimistic_write')
      .where('identity_user.id = :userId', { userId })
      .getOneOrFail();
  }

  private async enqueueIdentityEmail(
    manager: EntityManager,
    user: User,
    token: OneTimeToken,
    raw: string,
    template: string,
    path: string,
  ): Promise<void> {
    await this.email.enqueue(
      {
        organizationId: null,
        tenantId: null,
        to: user.email,
        template,
        payload: {
          token: raw,
          path: `${path}?token=${encodeURIComponent(raw)}`,
          expiresAt: token.expiresAt.toISOString(),
        },
        idempotencyKey: `${template}:${token.id}`,
      },
      { native: manager },
    );
  }

  private validOpaqueToken(raw: string): boolean {
    return raw.length <= MAX_TOKEN_LENGTH && OPAQUE_TOKEN_PATTERN.test(raw);
  }

  private async consumeTokenWithManager(
    manager: EntityManager,
    raw: string,
    purpose: OneTimeTokenPurpose,
  ): Promise<OneTimeToken | null> {
    const token = await manager.findOne(OneTimeToken, {
      where: { tokenHash: this.hashToken(raw), purpose },
    });
    if (!token || token.consumedAt || token.expiresAt <= new Date()) {
      return null;
    }
    const result = await manager
      .createQueryBuilder()
      .update(OneTimeToken)
      .set({ consumedAt: new Date() })
      .where('id = :id AND consumedAt IS NULL', { id: token.id })
      .execute();
    return result.affected ? token : null;
  }
}
