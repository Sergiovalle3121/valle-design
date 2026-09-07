import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { EmailOutbox } from '../commercial/entities/commercial.entities';
import { PostgresEmailService } from '../commercial/adapters/postgres.adapters';
import {
  Membership,
  Organization,
} from '../organizations/entities/organization.entity';
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

/**
 * T-62(c) — EL DERECHO ARCO MÍNIMO INDISCUTIBLE: exportar lo propio.
 *
 * Contra PostgreSQL real porque lo que hay que probar es exactamente la
 * frontera de seguridad: que la exportación NUNCA lleve `passwordHash`,
 * secretos de MFA ni la IP de una sesión — devolverlos sería el defecto
 * opuesto al que esta ficha existe para cerrar — y que SÍ lleve todo lo que
 * un dueño de cuenta puede pedir de vuelta.
 */
describePostgres(
  'Exportar datos personales, derecho ARCO (PostgreSQL real)',
  () => {
    jest.setTimeout(60_000);

    let harness: PostgresHarness;
    let identity: IdentityService;
    let organizations: Repository<Organization>;
    let memberships: Repository<Membership>;

    const CORREO = 'dibujante@ejemplo.mx';
    const CONTRASENA = 'contrasena-larga-y-buena';

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
          Membership,
          EmailOutbox,
        ],
        { schemaPrefix: 'identity_export' },
      );
      const mfa = new IdentityMfaService(
        harness.dataSource,
        harness.dataSource.getRepository(Credential),
        harness.dataSource.getRepository(IdentityMfaFactor),
        harness.dataSource.getRepository(IdentityBackupCode),
      );
      identity = new IdentityService(
        harness.dataSource,
        harness.dataSource.getRepository(User),
        harness.dataSource.getRepository(Credential),
        harness.dataSource.getRepository(Session),
        harness.dataSource.getRepository(OneTimeToken),
        harness.dataSource.getRepository(IdentityAuditEvent),
        mfa,
        new PostgresEmailService(),
      );
      organizations = harness.dataSource.getRepository(Organization);
      memberships = harness.dataSource.getRepository(Membership);
    });

    afterAll(async () => {
      if (harness) await harness.destroy();
    });

    beforeEach(async () => {
      await harness.truncateAll();
    });

    async function cuentaConSesion() {
      await identity.register(CORREO, CONTRASENA, 'Dibujante');
      const usuario = await harness.dataSource
        .getRepository(User)
        .findOneByOrFail({ email: CORREO });
      await harness.dataSource
        .getRepository(User)
        .update({ id: usuario.id }, { emailVerifiedAt: new Date() });
      const sesion = await identity.login(CORREO, CONTRASENA);
      if (sesion.kind !== 'session') throw new Error('se esperaba sesión');
      return { usuario, sesion };
    }

    it('exporta el perfil, la sesión (sin IP), la membresía y la actividad', async () => {
      const { usuario, sesion } = await cuentaConSesion();
      await harness.dataSource
        .getRepository(Session)
        .update(
          { id: sesion.session.id },
          { ipAddress: '203.0.113.7', userAgent: 'ExplorAdor/1.0' },
        );
      const organizacion = await organizations.save(
        organizations.create({
          name: 'Despacho de prueba',
          slug: `despacho-${randomUUID()}`,
          ownerUserId: usuario.id,
        }),
      );
      await memberships.save(
        memberships.create({
          organizationId: organizacion.id,
          userId: usuario.id,
          role: 'owner',
        }),
      );

      const exportado = await identity.exportPersonalData(usuario.id);

      expect(exportado.user).toMatchObject({
        id: usuario.id,
        email: CORREO,
        displayName: 'Dibujante',
      });
      expect(exportado.user.emailVerifiedAt).not.toBeNull();

      expect(exportado.sessions).toHaveLength(1);
      expect(exportado.sessions[0]).toMatchObject({
        id: sesion.session.id,
        userAgent: 'ExplorAdor/1.0',
      });
      // NUNCA la IP: es la misma regla que ya rige /cuenta.
      expect(JSON.stringify(exportado.sessions[0])).not.toContain(
        '203.0.113.7',
      );
      expect(JSON.stringify(exportado)).not.toContain('203.0.113.7');

      expect(exportado.memberships).toEqual([
        {
          organizationId: organizacion.id,
          organizationName: 'Despacho de prueba',
          role: 'owner',
        },
      ]);

      expect(exportado.mfa).toEqual({ enabled: false });

      expect(
        exportado.activity.some((a) => a.action === 'identity.registered'),
      ).toBe(true);
    });

    it('nunca lleva el hash de la contraseña ni ningún campo de credencial', async () => {
      const { usuario } = await cuentaConSesion();
      const exportado = await identity.exportPersonalData(usuario.id);
      const serializado = JSON.stringify(exportado);
      expect(serializado).not.toMatch(
        /argon2id|passwordHash|secretHash|csrfHash/iu,
      );
    });
  },
);
