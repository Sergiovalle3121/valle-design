import { IsNull } from 'typeorm';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { EmailOutbox } from '../commercial/entities/commercial.entities';
import { PostgresEmailService } from '../commercial/adapters/postgres.adapters';
import { Organization } from '../organizations/entities/organization.entity';
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

  it('returns the generic acceptance response to concurrent duplicate registrations', async () => {
    const email = 'concurrent.registration@example.test';
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        identity.register(
          index % 2 ? email.toUpperCase() : `  ${email}  `,
          `Correct-password-${index}-2026!`,
          `Attempt ${index}`,
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
  });

  it('serializes concurrent token rotation so only the newest reset token remains active', async () => {
    const email = 'concurrent.reset@example.test';
    await identity.register(
      email,
      'Correct-password-reset-2026!',
      'Reset User',
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
});
