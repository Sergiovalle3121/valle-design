import { IsNull } from 'typeorm';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { EmailOutbox } from '../commercial/entities/commercial.entities';
import { PostgresEmailService } from '../commercial/adapters/postgres.adapters';
import { Organization } from '../organizations/entities/organization.entity';
import { currentLegalDocument } from '../legal/legal-documents';
import {
  Credential,
  IdentityAuditEvent,
  IdentityBackupCode,
  IdentityMfaFactor,
  OneTimeToken,
  Session,
  User,
} from './entities/identity.entity';
import { IdentityMfaService } from './identity-mfa.service';
import { IdentityService } from './identity.service';
import { RegistrationLegalAcceptance } from './entities/registration-legal-acceptance.entity';

const TERMS_VERSION = currentLegalDocument('terms')!.version;

describePostgres('Identity registration atomicity', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let identity: IdentityService;

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [
        User,
        Credential,
        Session,
        OneTimeToken,
        IdentityAuditEvent,
        IdentityMfaFactor,
        IdentityBackupCode,
        Organization,
        EmailOutbox,
        RegistrationLegalAcceptance,
      ],
      { schemaPrefix: 'identity_registration' },
    );
    identity = new IdentityService(
      harness.dataSource,
      harness.dataSource.getRepository(User),
      harness.dataSource.getRepository(Credential),
      harness.dataSource.getRepository(Session),
      harness.dataSource.getRepository(OneTimeToken),
      harness.dataSource.getRepository(IdentityAuditEvent),
      new IdentityMfaService(
        harness.dataSource,
        harness.dataSource.getRepository(Credential),
        harness.dataSource.getRepository(IdentityMfaFactor),
        harness.dataSource.getRepository(IdentityBackupCode),
      ),
      new PostgresEmailService(),
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  it('persists who, current terms and server time in the registration transaction', async () => {
    const email = 'legal.registration@example.test';
    const before = Date.now();
    await identity.register(
      email,
      'Correct-password-legal-2026!',
      'Legal User',
      TERMS_VERSION,
    );

    const user = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ email });
    const row = await harness.dataSource
      .getRepository(RegistrationLegalAcceptance)
      .findOneByOrFail({ userId: user.id });
    expect(row.termsVersion).toBe(currentLegalDocument('terms')?.version);
    expect(row.acceptedAt.getTime()).toBeGreaterThanOrEqual(before - 5_000);
    expect(row.acceptedAt.getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
    await expect(
      harness.dataSource.getRepository(RegistrationLegalAcceptance).count(),
    ).resolves.toBe(1);
  });

  it('rejects stale terms equally for known and new emails without changing either account', async () => {
    const known = 'known-legal@example.test';
    await identity.register(
      known,
      'Correct-password-known-2026!',
      'Known',
      TERMS_VERSION,
    );
    const first = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ email: known });
    for (const email of [known, 'new-legal@example.test']) {
      await expect(
        identity.register(
          email,
          'Correct-password-known-2026!',
          'Person',
          '1999-01-01',
        ),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(harness.dataSource.getRepository(User).count()).resolves.toBe(
      1,
    );
    await expect(
      harness.dataSource
        .getRepository(RegistrationLegalAcceptance)
        .countBy({ userId: first.id }),
    ).resolves.toBe(1);
  });

  it('rolls back the legal record and account if email enqueue fails', async () => {
    const failing = new IdentityService(
      harness.dataSource,
      harness.dataSource.getRepository(User),
      harness.dataSource.getRepository(Credential),
      harness.dataSource.getRepository(Session),
      harness.dataSource.getRepository(OneTimeToken),
      harness.dataSource.getRepository(IdentityAuditEvent),
      new IdentityMfaService(
        harness.dataSource,
        harness.dataSource.getRepository(Credential),
        harness.dataSource.getRepository(IdentityMfaFactor),
        harness.dataSource.getRepository(IdentityBackupCode),
      ),
      {
        enqueue: async () => {
          throw new Error('synthetic email outage');
        },
      },
    );
    await expect(
      failing.register(
        'rollback-legal@example.test',
        'Correct-password-rollback-2026!',
        'Rollback',
        TERMS_VERSION,
      ),
    ).rejects.toThrow('synthetic email outage');
    await expect(harness.dataSource.getRepository(User).count()).resolves.toBe(
      0,
    );
    await expect(
      harness.dataSource.getRepository(RegistrationLegalAcceptance).count(),
    ).resolves.toBe(0);
  });

  it('returns the generic acceptance response to concurrent duplicate registrations', async () => {
    const email = 'concurrent.registration@example.test';
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        identity.register(
          index % 2 ? email.toUpperCase() : `  ${email}  `,
          `Correct-password-${index}-2026!`,
          `Attempt ${index}`,
          TERMS_VERSION,
        ),
      ),
    );

    expect(results).toEqual(
      Array.from({ length: 4 }, () => ({ accepted: true })),
    );
    const user = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ email });
    await expect(
      harness.dataSource.getRepository(User).countBy({ email }),
    ).resolves.toBe(1);
    await expect(
      harness.dataSource.getRepository(Credential).countBy({ userId: user.id }),
    ).resolves.toBe(1);
    await expect(
      harness.dataSource.getRepository(OneTimeToken).countBy({
        subjectId: user.id,
        purpose: 'verify_email',
      }),
    ).resolves.toBe(1);
    await expect(
      harness.dataSource.getRepository(EmailOutbox).countBy({
        recipient: email,
      }),
    ).resolves.toBe(1);
    await expect(
      harness.dataSource.getRepository(IdentityAuditEvent).countBy({
        actorUserId: user.id,
        action: 'identity.registered',
      }),
    ).resolves.toBe(1);
    await expect(
      harness.dataSource
        .getRepository(RegistrationLegalAcceptance)
        .countBy({ userId: user.id }),
    ).resolves.toBe(1);
  });

  it('serializes concurrent token rotation so only the newest reset token remains active', async () => {
    const email = 'concurrent.reset@example.test';
    await identity.register(
      email,
      'Correct-password-reset-2026!',
      'Reset User',
      TERMS_VERSION,
    );
    const user = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ email });

    await Promise.all(
      Array.from({ length: 4 }, () => identity.sendPasswordResetEmail(email)),
    );

    const tokens = harness.dataSource.getRepository(OneTimeToken);
    await expect(
      tokens.countBy({ subjectId: user.id, purpose: 'reset_password' }),
    ).resolves.toBe(4);
    await expect(
      tokens.countBy({
        subjectId: user.id,
        purpose: 'reset_password',
        consumedAt: IsNull(),
      }),
    ).resolves.toBe(1);
    await expect(
      harness.dataSource.getRepository(EmailOutbox).countBy({
        recipient: email,
        template: 'identity.reset-password',
      }),
    ).resolves.toBe(4);
  });

  it('acumula los reenvíos de verificación: cada correo enviado sigue valiendo y verificar con el primero cierra los demás', async () => {
    const email = 'concurrent.verify@example.test';
    await identity.register(
      email,
      'Correct-password-verify-2026!',
      'Verify User',
      TERMS_VERSION,
    );
    const user = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ email });

    await Promise.all(
      Array.from({ length: 4 }, () => identity.sendVerificationEmail(email)),
    );

    const tokens = harness.dataSource.getRepository(OneTimeToken);
    // El del alta más los cuatro reenvíos: los CINCO siguen vigentes. Antes el
    // reenvío consumía el anterior y el primer correo —el que llega antes—
    // moría en la bandeja.
    await expect(
      tokens.countBy({ subjectId: user.id, purpose: 'verify_email' }),
    ).resolves.toBe(5);
    await expect(
      tokens.countBy({
        subjectId: user.id,
        purpose: 'verify_email',
        consumedAt: IsNull(),
      }),
    ).resolves.toBe(5);

    const emails = await harness.dataSource.getRepository(EmailOutbox).find({
      where: { recipient: email, template: 'identity.verify-email' },
      order: { createdAt: 'ASC' },
    });
    expect(emails).toHaveLength(5);
    const rawTokens = emails.map(
      (row) => (row.payload as { token: string }).token,
    );

    // El PRIMER correo verifica…
    await expect(identity.verifyEmail(rawTokens[0])).resolves.toEqual(
      expect.objectContaining({ outcome: 'verified', email }),
    );
    const verifiedUser = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ email });
    expect(verifiedUser.emailVerifiedAt).toBeInstanceOf(Date);
    // …y consume el resto: ningún enlace de verificación sigue abierto.
    await expect(
      tokens.countBy({
        subjectId: user.id,
        purpose: 'verify_email',
        consumedAt: IsNull(),
      }),
    ).resolves.toBe(0);
    // Los demás enlaces ya no verifican nada, pero dicen la verdad: la cuenta
    // ya estaba verificada.
    await expect(identity.verifyEmail(rawTokens[4])).resolves.toEqual(
      expect.objectContaining({ outcome: 'already_verified', email }),
    );
  });
});
