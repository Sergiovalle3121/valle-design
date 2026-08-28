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
import { totp, TOTP_STEP_SECONDS } from './identity-mfa';

/**
 * EL SEGUNDO FACTOR, DE PUNTA A PUNTA Y CONTRA PostgreSQL REAL.
 *
 * `identity-mfa.spec.ts` demuestra que la aritmética ES TOTP, contra los
 * vectores del RFC. Eso no basta: la regla del repositorio dice que una
 * capacidad cuenta cuando su FLUJO está conectado y probado, no cuando existe su
 * módulo. Lo que se ejerce aquí es el flujo entero sobre la base de datos de
 * verdad, incluidas las tres propiedades que sólo se pueden romper en el paso
 * de la teoría a la tabla:
 *
 *   · que la contraseña sola deje de abrir sesión en cuanto hay factor;
 *   · que un código NO se pueda repetir dentro de su ventana de tolerancia;
 *   · que un código de respaldo se consuma exactamente una vez, incluso con dos
 *     peticiones simultáneas — que es donde SQLite mentiría, porque serializa
 *     toda escritura y la carrera sencillamente no ocurre.
 */
describePostgres('segundo factor (PostgreSQL real)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let identity: IdentityService;
  let mfa: IdentityMfaService;

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
        EmailOutbox,
      ],
      { schemaPrefix: 'identity_mfa' },
    );
    mfa = new IdentityMfaService(
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

  /** Una cuenta verificada y lista para entrar. */
  async function cuenta(): Promise<User> {
    await identity.register(CORREO, CONTRASENA, 'Dibujante');
    const usuario = await harness.dataSource
      .getRepository(User)
      .findOneByOrFail({ email: CORREO });
    await harness.dataSource
      .getRepository(User)
      .update({ id: usuario.id }, { emailVerifiedAt: new Date() });
    return usuario;
  }

  /** Da de alta el factor y lo deja confirmado. Devuelve secreto y respaldos. */
  async function conSegundoFactor(usuario: User) {
    const secreto = await mfa.beginMfaEnrollment(usuario.id);
    const codigo = totp(secreto, Date.now()) as string;
    const respaldos = await mfa.confirmMfaEnrollment(usuario.id, codigo);
    expect(respaldos).not.toBeNull();
    return { secreto, respaldos: respaldos as string[] };
  }

  it('sin segundo factor, la contraseña abre sesión como siempre', async () => {
    await cuenta();
    const resultado = await identity.login(CORREO, CONTRASENA);
    expect(resultado.kind).toBe('session');
  });

  it('el alta no protege NADA hasta confirmarse con un código', async () => {
    // El estado intermedio es el peligroso: un factor a medias que ya exigiera
    // código dejaría al usuario fuera de su propia cuenta.
    const usuario = await cuenta();
    await mfa.beginMfaEnrollment(usuario.id);
    expect(await mfa.mfaStatus(usuario.id)).toMatchObject({
      enabled: false,
      pending: true,
    });
    const resultado = await identity.login(CORREO, CONTRASENA);
    expect(resultado.kind).toBe('session');
  });

  it('un código equivocado no confirma el alta', async () => {
    const usuario = await cuenta();
    await mfa.beginMfaEnrollment(usuario.id);
    expect(await mfa.confirmMfaEnrollment(usuario.id, '000000')).toBeNull();
    expect((await mfa.mfaStatus(usuario.id)).enabled).toBe(false);
  });

  it('confirmar entrega diez códigos de respaldo y activa el factor', async () => {
    const usuario = await cuenta();
    const { respaldos } = await conSegundoFactor(usuario);
    expect(respaldos).toHaveLength(10);
    expect(new Set(respaldos).size).toBe(10);
    expect(await mfa.mfaStatus(usuario.id)).toMatchObject({
      enabled: true,
      pending: false,
      backupCodesRemaining: 10,
    });
  });

  it('con el factor activo, la contraseña sola YA NO abre sesión', async () => {
    // La aserción central de toda esta suite.
    const usuario = await cuenta();
    await conSegundoFactor(usuario);
    const resultado = await identity.login(CORREO, CONTRASENA);
    expect(resultado.kind).toBe('mfa');
    // CERO sesiones, no «una menos»: el desafío no es una sesión a medias. Esa
    // es justo la razón de que no sea una sesión con una bandera — basta un
    // endpoint que se olvide de mirar la bandera para que el factor deje de
    // existir, y una fila que no está en la tabla no puede autenticar nada.
    expect(await harness.dataSource.getRepository(Session).count()).toBe(0);
  });

  it('el desafío más el código correcto sí abren sesión', async () => {
    const usuario = await cuenta();
    const { secreto } = await conSegundoFactor(usuario);
    const desafio = await identity.login(CORREO, CONTRASENA);
    if (desafio.kind !== 'mfa') throw new Error('se esperaba un desafío');

    // El código del alta ya se consumió, así que hay que avanzar un paso: es
    // exactamente la defensa contra repetición actuando en el caso legítimo.
    const futuro = Date.now() + TOTP_STEP_SECONDS * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(futuro);
    try {
      const sesion = await identity.completeMfaLogin(
        desafio.challenge,
        totp(secreto, futuro) as string,
      );
      expect(sesion).not.toBeNull();
      expect(sesion?.user.id).toBe(usuario.id);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('el desafío se consume: no vale para un segundo intento', async () => {
    // Sin esto, quien tenga el desafío dispone de intentos ilimitados durante
    // sus cinco minutos y el límite de peticiones deja de ser un límite.
    const usuario = await cuenta();
    const { secreto } = await conSegundoFactor(usuario);
    const desafio = await identity.login(CORREO, CONTRASENA);
    if (desafio.kind !== 'mfa') throw new Error('se esperaba un desafío');

    await expect(
      identity.completeMfaLogin(desafio.challenge, '000000'),
    ).rejects.toThrow();
    const futuro = Date.now() + TOTP_STEP_SECONDS * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(futuro);
    try {
      expect(
        await identity.completeMfaLogin(
          desafio.challenge,
          totp(secreto, futuro) as string,
        ),
      ).toBeNull();
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('UN CÓDIGO TOTP NO SE PUEDE REPETIR dentro de su ventana', async () => {
    // La propiedad que casi todas las implementaciones caseras olvidan. El
    // código del alta ya quedó marcado como usado; volver a presentarlo en el
    // mismo paso de tiempo tiene que fallar aunque siga siendo "válido".
    const usuario = await cuenta();
    const { secreto } = await conSegundoFactor(usuario);
    const mismoCodigo = totp(secreto, Date.now()) as string;
    const desafio = await identity.login(CORREO, CONTRASENA);
    if (desafio.kind !== 'mfa') throw new Error('se esperaba un desafío');
    await expect(
      identity.completeMfaLogin(desafio.challenge, mismoCodigo),
    ).rejects.toThrow();
  });

  it('UN CÓDIGO TOTP NO VALE EN EL PASO SIGUIENTE (la deriva no es una segunda vida)', async () => {
    // LA PRUEBA QUE FALTABA, y su ausencia dejó pasar un agujero real.
    //
    // La de arriba reintenta en el MISMO paso de tiempo, donde cualquier
    // implementación —incluida la rota— acierta. El agujero vivía un paso más
    // allá: la ventana de deriva es ±1, así que el código del paso N sigue
    // casando en el paso N+1. Si la marca de consumo guarda el paso ACTUAL en
    // vez del que CASÓ, la comparación es `N+1 > N` y el código pasa otra vez.
    // Cada código valía dos veces y la ventana real de reutilización era de un
    // minuto, no de cero.
    //
    // Se viaja en el tiempo en vez de esperar 30 s de reloj: una prueba que
    // duerme medio minuto es una prueba que alguien acaba marcando como lenta y
    // saltándose. El alta gasta el código de SU paso, así que el inicio de
    // sesión legítimo tiene que ocurrir en un paso POSTERIOR — eso también es el
    // invariante, y por eso el primer viaje no es decorativo.
    const usuario = await cuenta();
    const { secreto } = await conSegundoFactor(usuario);

    const siguiente = Date.now() + 30_000;
    const codigo = totp(secreto, siguiente) as string;

    const primero = await identity.login(CORREO, CONTRASENA);
    if (primero.kind !== 'mfa') throw new Error('se esperaba un desafío');
    jest.spyOn(Date, 'now').mockReturnValue(siguiente);
    try {
      expect(
        await identity.completeMfaLogin(primero.challenge, codigo),
      ).not.toBeNull();
    } finally {
      jest.restoreAllMocks();
    }

    // Un paso más: el MISMO código sigue dentro de la ventana de deriva y tiene
    // que ser rechazado igualmente.
    const segundo = await identity.login(CORREO, CONTRASENA);
    if (segundo.kind !== 'mfa') throw new Error('se esperaba un desafío');
    jest.spyOn(Date, 'now').mockReturnValue(siguiente + 30_000);
    try {
      await expect(
        identity.completeMfaLogin(segundo.challenge, codigo),
      ).rejects.toThrow();
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('un código de respaldo entra una vez y sólo una', async () => {
    const usuario = await cuenta();
    const { respaldos } = await conSegundoFactor(usuario);

    const primero = await identity.login(CORREO, CONTRASENA);
    if (primero.kind !== 'mfa') throw new Error('se esperaba un desafío');
    expect(
      await identity.completeMfaLogin(primero.challenge, respaldos[0]),
    ).not.toBeNull();
    expect((await mfa.mfaStatus(usuario.id)).backupCodesRemaining).toBe(9);

    const segundo = await identity.login(CORREO, CONTRASENA);
    if (segundo.kind !== 'mfa') throw new Error('se esperaba un desafío');
    await expect(
      identity.completeMfaLogin(segundo.challenge, respaldos[0]),
    ).rejects.toThrow();
  });

  it('dos peticiones SIMULTÁNEAS con el mismo respaldo: gana una', async () => {
    // Aquí es donde SQLite mentiría: serializa toda escritura y la carrera no
    // ocurre. Sobre PostgreSQL, el UPDATE condicional sobre `consumedAt IS NULL`
    // es lo único que impide que dos peticiones a la vez lo gasten dos veces.
    const usuario = await cuenta();
    const { respaldos } = await conSegundoFactor(usuario);

    const desafios = await Promise.all([
      identity.login(CORREO, CONTRASENA),
      identity.login(CORREO, CONTRASENA),
    ]);
    // Emitir un desafío invalida el anterior, así que sólo el último sirve; se
    // usa ése dos veces en paralelo, que es la carrera que interesa.
    const ultimo = desafios[desafios.length - 1];
    if (ultimo.kind !== 'mfa') throw new Error('se esperaba un desafío');

    const resultados = await Promise.allSettled([
      identity.completeMfaLogin(ultimo.challenge, respaldos[1]),
      identity.completeMfaLogin(ultimo.challenge, respaldos[1]),
    ]);
    const exitosos = resultados.filter(
      (resultado) =>
        resultado.status === 'fulfilled' && resultado.value !== null,
    );
    expect(exitosos).toHaveLength(1);
  });

  it('desactivar exige la contraseña, no basta con estar dentro', async () => {
    // Una sesión abierta en una máquina desatendida es justo el escenario
    // contra el que sirve el factor.
    const usuario = await cuenta();
    await conSegundoFactor(usuario);
    expect(await mfa.disableMfa(usuario.id, 'otra-contrasena-larga')).toBe(
      false,
    );
    expect((await mfa.mfaStatus(usuario.id)).enabled).toBe(true);

    expect(await mfa.disableMfa(usuario.id, CONTRASENA)).toBe(true);
    expect(await mfa.mfaStatus(usuario.id)).toMatchObject({
      enabled: false,
      backupCodesRemaining: 0,
    });
    // Y los respaldos se van con él: dejarlos vivos sería dejar diez llaves
    // sueltas de una cerradura que ya no existe.
    expect(
      await harness.dataSource.getRepository(IdentityBackupCode).count(),
    ).toBe(0);
  });

  it('rehacer los respaldos invalida los anteriores', async () => {
    const usuario = await cuenta();
    const { respaldos } = await conSegundoFactor(usuario);
    const nuevos = await mfa.regenerateBackupCodes(usuario.id, CONTRASENA);
    expect(nuevos).toHaveLength(10);
    expect(nuevos).not.toEqual(respaldos);

    const desafio = await identity.login(CORREO, CONTRASENA);
    if (desafio.kind !== 'mfa') throw new Error('se esperaba un desafío');
    await expect(
      identity.completeMfaLogin(desafio.challenge, respaldos[0]),
    ).rejects.toThrow();
  });

  it('no se puede dar de alta un factor encima de otro ya confirmado', async () => {
    // Sería desactivar el segundo factor sin pedir ni el código ni la
    // contraseña: exactamente el agujero que el factor viene a tapar.
    const usuario = await cuenta();
    await conSegundoFactor(usuario);
    await expect(mfa.beginMfaEnrollment(usuario.id)).rejects.toThrow(
      /ya tiene segundo factor/u,
    );
  });

  it('el historial registra los inicios de sesión y su método', async () => {
    const usuario = await cuenta();
    await identity.login(CORREO, CONTRASENA);
    await identity.login(CORREO, CONTRASENA);
    const actividad = await identity.recentActivity(usuario.id);
    const inicios = actividad.filter(
      (evento) => evento.action === 'identity.signed_in',
    );
    expect(inicios).toHaveLength(2);
    expect(inicios[0].metadata).toMatchObject({ method: 'password' });
  });

  it('el PRIMER inicio no manda aviso; el segundo sí', async () => {
    // Un correo de «inicio de sesión nuevo» a los diez segundos del de
    // bienvenida enseña a la gente a ignorar justo el aviso que algún día
    // tendrá que leer con atención.
    await cuenta();
    const outbox = harness.dataSource.getRepository(EmailOutbox);
    await identity.login(CORREO, CONTRASENA);
    expect(
      await outbox.count({ where: { template: 'identity.new-sign-in' } }),
    ).toBe(0);

    await identity.login(CORREO, CONTRASENA);
    expect(
      await outbox.count({ where: { template: 'identity.new-sign-in' } }),
    ).toBe(1);
  });
});
