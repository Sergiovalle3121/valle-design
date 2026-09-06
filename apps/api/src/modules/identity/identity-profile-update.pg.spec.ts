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
 * T-60d — LA RUTA DE PERFIL QUE NO EXISTÍA.
 *
 * Contra PostgreSQL real porque lo que hay que probar es el índice único de
 * `email` (una carrera entre dos cuentas pidiendo el mismo correo nuevo no se
 * puede simular con un mock) y que `emailVerifiedAt` vuelve a `null` — y el
 * correo de verificación se encola — DENTRO de la misma transacción que
 * cambia el correo, nunca a medias.
 */
describePostgres('Ruta de perfil: nombre y correo (PostgreSQL real)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let identity: IdentityService;

  const CORREO = 'dibujante@ejemplo.mx';
  const OTRO_CORREO = 'otro@ejemplo.mx';
  const CORREO_NUEVO = 'dibujante-nuevo@ejemplo.mx';
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
        EmailOutbox,
      ],
      { schemaPrefix: 'identity_profile_update' },
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

  async function cuentaVerificada(correo = CORREO) {
    await identity.register(correo, CONTRASENA, 'Dibujante');
    const usuario = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ email: correo });
    await harness.dataSource
      .getRepository(User)
      .update({ id: usuario.id }, { emailVerifiedAt: new Date() });
    return usuario;
  }

  it('cambia el nombre visible sin pedir contraseña', async () => {
    const usuario = await cuentaVerificada();

    const resultado = await identity.updateProfile(usuario.id, {
      displayName: 'Nuevo Nombre',
    });

    expect(resultado).toMatchObject({
      ok: true,
      emailChangePending: false,
    });
    const guardado = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ id: usuario.id });
    expect(guardado.displayName).toBe('Nuevo Nombre');
    expect(guardado.email).toBe(CORREO);
    // El correo no cambió: sigue verificado.
    expect(guardado.emailVerifiedAt).not.toBeNull();
  });

  it('vacía el nombre visible cuando se manda una cadena en blanco', async () => {
    const usuario = await cuentaVerificada();

    await identity.updateProfile(usuario.id, { displayName: '   ' });

    const guardado = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ id: usuario.id });
    expect(guardado.displayName).toBeNull();
  });

  it('cambia el correo con la contraseña correcta, deja la cuenta sin verificar y encola el correo al buzón nuevo', async () => {
    const usuario = await cuentaVerificada();

    const resultado = await identity.updateProfile(usuario.id, {
      email: CORREO_NUEVO,
      currentPassword: CONTRASENA,
    });

    expect(resultado).toMatchObject({ ok: true, emailChangePending: true });
    const guardado = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ id: usuario.id });
    expect(guardado.email).toBe(CORREO_NUEVO);
    expect(guardado.emailVerifiedAt).toBeNull();

    const encolado = await harness.dataSource
      .getRepository(EmailOutbox)
      .findOne({ where: { recipient: CORREO_NUEVO } });
    expect(encolado).not.toBeNull();
    expect(encolado?.template).toBe('identity.verify-email');
  });

  it('rechaza el cambio de correo con la contraseña incorrecta y no toca nada', async () => {
    const usuario = await cuentaVerificada();

    const resultado = await identity.updateProfile(usuario.id, {
      email: CORREO_NUEVO,
      currentPassword: 'esto-no-es-la-contrasena',
    });

    expect(resultado).toMatchObject({
      ok: false,
      reason: 'invalid_password',
    });
    const guardado = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ id: usuario.id });
    expect(guardado.email).toBe(CORREO);
    expect(guardado.emailVerifiedAt).not.toBeNull();
  });

  it('rechaza el correo si ya pertenece a otra cuenta', async () => {
    const usuario = await cuentaVerificada();
    await cuentaVerificada(OTRO_CORREO);

    const resultado = await identity.updateProfile(usuario.id, {
      email: OTRO_CORREO,
      currentPassword: CONTRASENA,
    });

    expect(resultado).toMatchObject({ ok: false, reason: 'email_in_use' });
    const guardado = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ id: usuario.id });
    expect(guardado.email).toBe(CORREO);
  });

  it('pedir el mismo correo que ya tiene no exige contraseña ni marca nada pendiente', async () => {
    const usuario = await cuentaVerificada();

    const resultado = await identity.updateProfile(usuario.id, {
      email: CORREO,
    });

    expect(resultado).toMatchObject({ ok: true, emailChangePending: false });
    const guardado = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ id: usuario.id });
    expect(guardado.emailVerifiedAt).not.toBeNull();
  });

  it('registra el cambio en la auditoría de identidad', async () => {
    const usuario = await cuentaVerificada();
    await identity.updateProfile(usuario.id, {
      email: CORREO_NUEVO,
      currentPassword: CONTRASENA,
    });

    const actividad = await identity.recentActivity(usuario.id);
    const suceso = actividad.find(
      (evento) => evento.action === 'identity.profile_updated',
    );
    expect(suceso).toBeDefined();
  });
});
