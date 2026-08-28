import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { EmailOutbox } from '../commercial/entities/commercial.entities';
import { PostgresEmailService } from '../commercial/adapters/postgres.adapters';
import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../identity/entities/identity.entity';
import { ProductFeedback } from './entities/feedback.entity';
import { FeedbackService, FEEDBACK_TEMPLATE } from './feedback.service';

/**
 * EL CANAL DE VUELTA, CONTRA PostgreSQL REAL.
 *
 * Lo que se ejerce aquí es lo que hace que este canal SIRVA, que no es guardar
 * texto:
 *
 *   · que el comentario y el aviso viajen JUNTOS o no viajen (una fila sin aviso
 *     espera a que alguien entre al panel por casualidad; un aviso sin fila
 *     manda al dueño a buscar algo que no existe);
 *   · que sin buzón configurado se guarde IGUAL en vez de tirar el comentario;
 *   · que el contexto técnico se recorte en el servidor a los campos declarados,
 *     porque lo que manda el navegador no se cree;
 *   · y que un comentario sobreviva a la desaparición de su organización, que es
 *     justo cuando lo que dice sobre el producto sigue siendo cierto.
 */
describePostgres('centro de comentarios (PostgreSQL real)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let feedback: FeedbackService;
  let usuarioId: string;
  let organizacionId: string;

  const CORREO_SOPORTE = 'soporte@ejemplo.mx';
  let soporteOriginal: string | undefined;

  beforeAll(async () => {
    harness = await createPostgresHarness(
      [User, Organization, ProductFeedback, EmailOutbox],
      { schemaPrefix: 'product_feedback' },
    );
    feedback = new FeedbackService(
      harness.dataSource,
      harness.dataSource.getRepository(ProductFeedback),
      new PostgresEmailService(),
    );
    soporteOriginal = process.env.SUPPORT_EMAIL;
  });

  afterAll(async () => {
    if (soporteOriginal === undefined) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = soporteOriginal;
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
    process.env.SUPPORT_EMAIL = CORREO_SOPORTE;
    const usuario = await harness.dataSource
      .getRepository(User)
      .save({ email: 'dibujante@ejemplo.mx', displayName: 'Dibujante' });
    usuarioId = usuario.id;
    const organizacion = await harness.dataSource
      .getRepository(Organization)
      .save({
        name: 'Despacho',
        slug: `despacho-${Date.now()}`,
        ownerUserId: usuario.id,
      });
    organizacionId = organizacion.id;
  });

  const autor = () => ({
    userId: usuarioId,
    email: 'dibujante@ejemplo.mx',
    organizationId: organizacionId,
  });

  it('guarda el comentario y encola el aviso en la misma transacción', async () => {
    const guardado = await feedback.create(
      { kind: 'sugerencia', message: 'Sería útil poder acotar en cadena.' },
      autor(),
    );
    expect(guardado.status).toBe('nuevo');

    const avisos = await harness.dataSource
      .getRepository(EmailOutbox)
      .find({ where: { template: FEEDBACK_TEMPLATE } });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].recipient).toBe(CORREO_SOPORTE);
    // La idempotencia sale del id del comentario: un reintento del mismo
    // comentario no puede producir dos correos.
    expect(avisos[0].idempotencyKey).toBe(
      `${FEEDBACK_TEMPLATE}:${guardado.id}`,
    );
  });

  it('SIN buzón configurado guarda igual, en vez de tirar el comentario', async () => {
    // Al revés que el botón de incidentes, que falla ruidoso: allí el correo ES
    // la entrega; aquí la entrega es la fila, y negarse a guardar por falta de
    // configuración sería perder lo que el usuario se molestó en escribir.
    delete process.env.SUPPORT_EMAIL;
    const guardado = await feedback.create(
      { kind: 'falla', message: 'El zoom se salta al pasar de 1:200.' },
      autor(),
    );
    expect(guardado.id).toBeTruthy();
    expect(
      await harness.dataSource.getRepository(ProductFeedback).count(),
    ).toBe(1);
    expect(await harness.dataSource.getRepository(EmailOutbox).count()).toBe(0);
  });

  it('el contexto técnico se recorta a los campos declarados', async () => {
    const guardado = await feedback.create(
      {
        kind: 'falla',
        message: 'Falla al exportar una lámina A1 con dos ventanas.',
        context: {
          ruta: '/studio/abc',
          navegador: 'Chrome en Mac',
          // Lo que NO puede acabar en la base de datos por mucho que lo mande
          // un cliente modificado: el dibujo.
          documento: '{"entities":[… 40 000 caracteres …]}',
          cookies: 'valle_session=secreto',
          apellido: 'Valle',
        },
      },
      autor(),
    );
    expect(guardado.context).toEqual({
      ruta: '/studio/abc',
      navegador: 'Chrome en Mac',
    });
  });

  it('un contexto vacío o sin campos válidos queda en null', async () => {
    const guardado = await feedback.create(
      {
        kind: 'duda',
        message: '¿Puedo abrir esto en otra computadora?',
        context: { basura: 1 },
      },
      autor(),
    );
    expect(guardado.context).toBeNull();
  });

  it('el mensaje se recorta al tope de la tabla', async () => {
    // Si el DTO fallara o alguien llamara al servicio directamente, el CHECK de
    // la base rechazaría un mensaje de 5000 caracteres con un error de
    // restricción ilegible. El recorte lo impide antes.
    const guardado = await feedback.create(
      { kind: 'duda', message: 'x'.repeat(5000) },
      autor(),
    );
    expect(guardado.message).toHaveLength(4000);
  });

  it('«mis comentarios» devuelve sólo los míos, lo último arriba', async () => {
    const otro = await harness.dataSource
      .getRepository(User)
      .save({ email: 'otra@ejemplo.mx', displayName: 'Otra' });
    await feedback.create(
      { kind: 'duda', message: 'Primero de todos.' },
      autor(),
    );
    await feedback.create(
      { kind: 'falla', message: 'Segundo de todos.' },
      autor(),
    );
    await feedback.create(
      { kind: 'duda', message: 'De otra persona, no debe salir.' },
      { userId: otro.id, email: otro.email, organizationId: null },
    );

    const mios = await feedback.listForUser(usuarioId);
    expect(mios).toHaveLength(2);
    expect(mios[0].message).toBe('Segundo de todos.');
    expect(mios.every((row) => row.userId === usuarioId)).toBe(true);
  });

  it('el panel del operador ve TODO y filtra por estado y clase', async () => {
    const a = await feedback.create(
      { kind: 'falla', message: 'Una falla concreta.' },
      autor(),
    );
    await feedback.create(
      { kind: 'sugerencia', message: 'Una idea concreta.' },
      autor(),
    );
    await feedback.setStatus(a.id, 'planeado');

    expect(await feedback.listAll()).toHaveLength(2);
    expect(await feedback.listAll({ status: 'planeado' })).toHaveLength(1);
    expect(await feedback.listAll({ kind: 'sugerencia' })).toHaveLength(1);
    expect(
      await feedback.listAll({ status: 'nuevo', kind: 'falla' }),
    ).toHaveLength(0);
  });

  it('cambiar el estado devuelve la fila; un id inexistente devuelve null', async () => {
    const guardado = await feedback.create(
      { kind: 'duda', message: '¿Cómo acoto un arco?' },
      autor(),
    );
    const actualizado = await feedback.setStatus(guardado.id, 'resuelto');
    expect(actualizado?.status).toBe('resuelto');
    expect(
      await feedback.setStatus('00000000-0000-4000-8000-000000000000', 'leido'),
    ).toBeNull();
  });

  it('el comentario SOBREVIVE a la desaparición de su organización', async () => {
    // Lo que dice sobre el producto sigue siendo cierto aunque el despacho que
    // lo escribió ya no exista: `ON DELETE SET NULL`, no CASCADE.
    const guardado = await feedback.create(
      {
        kind: 'sugerencia',
        message: 'El gestor de capas debería recordar el orden.',
      },
      autor(),
    );
    await harness.dataSource
      .getRepository(Organization)
      .delete({ id: organizacionId });
    const vivo = await harness.dataSource
      .getRepository(ProductFeedback)
      .findOneBy({ id: guardado.id });
    expect(vivo).not.toBeNull();
    expect(vivo?.organizationId).toBeNull();
    expect(vivo?.authorEmail).toBe('dibujante@ejemplo.mx');
  });

  it('el comentario se va CON su autor si se da de baja', async () => {
    // Al revés que la organización: el comentario es suyo.
    // Se usa un usuario que NO es dueño de ninguna organización: borrar al
    // propietario lo bloquea la clave foránea de `organizations`, que es
    // correcto y no tiene nada que ver con lo que esta prueba mide.
    const suelto = await harness.dataSource
      .getRepository(User)
      .save({ email: 'sinorganizacion@ejemplo.mx', displayName: 'Sin org' });
    const guardado = await feedback.create(
      { kind: 'duda', message: 'Una duda cualquiera.' },
      { userId: suelto.id, email: suelto.email, organizationId: null },
    );
    await harness.dataSource.getRepository(User).delete({ id: suelto.id });
    expect(
      await harness.dataSource
        .getRepository(ProductFeedback)
        .findOneBy({ id: guardado.id }),
    ).toBeNull();
  });
});
