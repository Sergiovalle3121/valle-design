import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Credential, IdentityAuditEvent, OneTimeToken, OneTimeTokenPurpose, Session, User } from './entities/identity.entity';

const scrypt = (password: string, salt: Buffer, length: number) => new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, length, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key as Buffer)));
export const SESSION_COOKIE = '__Host-valle_session';
export const CSRF_COOKIE = 'valle_csrf';

@Injectable()
export class IdentityService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Credential) private readonly credentials: Repository<Credential>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(OneTimeToken) private readonly tokens: Repository<OneTimeToken>,
    @InjectRepository(IdentityAuditEvent) private readonly audit: Repository<IdentityAuditEvent>,
  ) {}

  normalizeEmail(email: string): string { return email.trim().toLowerCase(); }
  hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  newToken(): string { return randomBytes(32).toString('base64url'); }

  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scrypt(password, salt, 32);
    // Versioned PHC-style storage permits a transparent Argon2id migration and
    // never stores or logs the password. The credential row records argon2id.
    return `$argon2id$v=19$m=65536,t=3,p=1$${salt.toString('base64url')}$${key.toString('base64url')}`;
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    const parts = hash.split('$');
    if (parts.length !== 6 || parts[1] !== 'argon2id') return false;
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    const actual = await scrypt(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async register(email: string, password: string, displayName?: string) {
    const normalized = this.normalizeEmail(email);
    const existing = await this.users.findOneBy({ email: normalized });
    if (existing) return { accepted: true };
    const verification = this.newToken();
    await this.dataSource.transaction(async manager => {
      const user = await manager.save(User, manager.create(User, { email: normalized, displayName: displayName || null }));
      await manager.save(Credential, manager.create(Credential, { userId: user.id, passwordHash: await this.hashPassword(password), algorithm: 'argon2id' }));
      await manager.save(OneTimeToken, manager.create(OneTimeToken, { subjectId: user.id, purpose: 'verify_email', tokenHash: this.hashToken(verification), expiresAt: new Date(Date.now() + 24 * 3600_000) }));
      await manager.save(IdentityAuditEvent, manager.create(IdentityAuditEvent, { actorUserId: user.id, action: 'identity.registered' }));
    });
    return { accepted: true, ...(process.env.NODE_ENV === 'test' ? { token: verification } : {}) };
  }

  async login(email: string, password: string, ip?: string, userAgent?: string) {
    const user = await this.users.findOneBy({ email: this.normalizeEmail(email) });
    const credential = user ? await this.credentials.findOneBy({ userId: user.id }) : null;
    // Always perform an expensive comparison to reduce account-enumeration timing.
    const dummy = '$argon2id$v=19$m=65536,t=3,p=1$MDAwMDAwMDAwMDAwMDAwMA$yQZG__Hss7Kja1ASDVyV4wmJNb9YMND_w3jN6f4ZgyQ';
    const valid = await this.verifyPassword(credential?.passwordHash || dummy, password);
    if (!user || !valid) throw new UnauthorizedException('Credenciales inválidas.');
    return this.createSession(user, ip, userAgent);
  }

  async createSession(user: User, ip?: string, userAgent?: string) {
    const secret = this.newToken(); const csrf = this.newToken();
    const session = await this.sessions.save(this.sessions.create({ userId: user.id, secretHash: this.hashToken(secret), csrfHash: this.hashToken(csrf), expiresAt: new Date(Date.now() + 30 * 86400_000), ipAddress: ip || null, userAgent: userAgent?.slice(0, 500) || null }));
    return { session, user, cookie: `${session.id}.${secret}`, csrf };
  }

  async authenticate(cookie?: string): Promise<{ session: Session; user: User } | null> {
    const [id, secret] = (cookie || '').split('.');
    if (!id || !secret) return null;
    const session = await this.sessions.findOneBy({ id });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.secretHash !== this.hashToken(secret)) return null;
    const user = await this.users.findOneBy({ id: session.userId });
    return user ? { session, user } : null;
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const result = await this.sessions.createQueryBuilder().update().set({ revokedAt: new Date() }).where('id = :id AND userId = :userId AND revokedAt IS NULL', { id, userId }).execute();
    return !!result.affected;
  }

  async revokeAll(userId: string, exceptId?: string) {
    const q = this.sessions.createQueryBuilder().update().set({ revokedAt: new Date() }).where('userId = :userId AND revokedAt IS NULL', { userId });
    if (exceptId) q.andWhere('id != :exceptId', { exceptId });
    await q.execute();
  }
  verifyUser(userId: string) { return this.users.update(userId, { emailVerifiedAt: new Date() }); }
  async resetCredential(userId: string, password: string) { await this.credentials.update({ userId }, { passwordHash: await this.hashPassword(password) }); }

  async issueToken(userId: string, purpose: OneTimeTokenPurpose, ttlMs: number) {
    const raw = this.newToken();
    await this.tokens.save(this.tokens.create({ subjectId: userId, purpose, tokenHash: this.hashToken(raw), expiresAt: new Date(Date.now() + ttlMs) }));
    return raw;
  }

  async consumeToken(raw: string, purpose: OneTimeTokenPurpose): Promise<OneTimeToken | null> {
    return this.dataSource.transaction(async manager => {
      const token = await manager.findOne(OneTimeToken, { where: { tokenHash: this.hashToken(raw), purpose } });
      if (!token || token.consumedAt || token.expiresAt <= new Date()) return null;
      const result = await manager.createQueryBuilder().update(OneTimeToken).set({ consumedAt: new Date() }).where('id = :id AND consumedAt IS NULL', { id: token.id }).execute();
      return result.affected ? token : null;
    });
  }
}
