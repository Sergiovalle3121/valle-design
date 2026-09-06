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

/**
 * T-60b — CAMBIAR LA CONTRASEÑA ESTANDO DENTRO DE LA SESIÓN.
 *
 * Hasta esta ficha la única vía para cambiar la contraseña era el enlace por
 * correo, que exige perder el acceso primero. Contra PostgreSQL real porque
 * lo que hay que probar es exactamente la propiedad que `resetPassword` ya
 * demuestra para el otro camino: la sesión que hizo el cambio SOBREVIVE, las
 * demás no, y el hash nuevo es el que de verdad abre la próxima sesión.
 */
describePostgres(
  'Cambiar contraseña dentro de la sesión (PostgreSQL real)',
  () => {
    jest.setTimeout(60_000);

    let harness: PostgresHarness;
    let identity: IdentityService;

    const CORREO = 'dibujante@ejemplo.mx';
    const CONTRASENA = 'contrasena-larga-y-buena';
    const CONTRASENA_NUEVA = 'otra-contrasena-larga-y-buena';

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
        { schemaPrefix: 'identity_password_change' },
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
    });

    afterAll(async () => {
      if (harness) await harness.destroy();
    });

    beforeEach(async () => {
      await harness.truncateAll();
    });

    /** Una cuenta verificada, con DOS sesiones abiertas (dos dispositivos). */
    async function cuentaConDosSesiones() {
      await identity.register(CORREO, CONTRASENA, 'Dibujante');
      const usuario = await harness.dataSource
        .getRepository(User)
        .findOneByOrFail({ email: CORREO });
      await harness.dataSource
        .getRepository(User)
        .update({ id: usuario.id }, { emailVerifiedAt: new Date() });
      const primera = await identity.login(CORREO, CONTRASENA);
      const segunda = await identity.login(CORREO, CONTRASENA);
      if (primera.kind !== 'session' || segunda.kind !== 'session') {
        throw new Error('se esperaban sesiones, no un desafío MFA');
      }
      return { usuario, primera, segunda };
    }

    it('cambia el hash, deja viva la sesión que hizo el cambio y revoca las demás', async () => {
      const { usuario, primera, segunda } = await cuentaConDosSesiones();

      const changed = await identity.changePassword(
        usuario.id,
        primera.session.id,
        CONTRASENA,
        CONTRASENA_NUEVA,
      );
      expect(changed).toBe(true);

      const sessions = harness.dataSource.getRepository(Session);
      await expect(
        sessions.findOneByOrFail({ id: primera.session.id }),
      ).resolves.toMatchObject({ revokedAt: null });
      const revoked = await sessions.findOneByOrFail({
        id: segunda.session.id,
      });
      expect(revoked.revokedAt).not.toBeNull();

      // La contraseña VIEJA ya no sirve; la nueva sí.
      await expect(identity.login(CORREO, CONTRASENA)).rejects.toThrow();
      const relogueo = await identity.login(CORREO, CONTRASENA_NUEVA);
      expect(relogueo.kind).toBe('session');
    });

    it('rechaza el cambio si la contraseña actual es incorrecta, y no toca nada', async () => {
      const { usuario, primera, segunda } = await cuentaConDosSesiones();

      const changed = await identity.changePassword(
        usuario.id,
        primera.session.id,
        'esto-no-es-la-contrasena',
        CONTRASENA_NUEVA,
      );
      expect(changed).toBe(false);

      const sessions = harness.dataSource.getRepository(Session);
      await expect(
        sessions.findOneByOrFail({ id: segunda.session.id }),
      ).resolves.toMatchObject({ revokedAt: null });
      // La contraseña original sigue abriendo sesión: el intento fallido no
      // dejó el hash a medias.
      await expect(identity.login(CORREO, CONTRASENA)).resolves.toMatchObject({
        kind: 'session',
      });
    });

    it('registra el cambio en la auditoría de identidad', async () => {
      const { usuario, primera } = await cuentaConDosSesiones();
      await identity.changePassword(
        usuario.id,
        primera.session.id,
        CONTRASENA,
        CONTRASENA_NUEVA,
      );

      const actividad = await identity.recentActivity(usuario.id);
      expect(
        actividad.some(
          (evento) => evento.action === 'identity.password_changed',
        ),
      ).toBe(true);
    });
  },
);
