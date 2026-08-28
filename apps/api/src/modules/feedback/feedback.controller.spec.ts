import type { Request } from 'express';
import { FeedbackController } from './feedback.controller';
import type { FeedbackService } from './feedback.service';
import type { ApiRateLimitService } from '../identity/api-rate-limit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';

/**
 * EL ACTOR QUE EL CONTROLADOR EXTRAE DE LA PETICIÓN.
 *
 * ── POR QUÉ ESTA PRUEBA EXISTE ──────────────────────────────────────────────
 * El controlador leía `request.user.id`. Lo que el guard adjunta es un
 * `AuthenticatedUser`, y ese campo se llama `userId`: la lectura devolvía
 * `undefined` siempre y el autor viajaba en cadena vacía. La columna es
 * `uuid NOT NULL` con clave foránea, así que PostgreSQL rechazaba la cadena y
 * CADA envío de comentario respondía 500. La función estrella de su ola estaba
 * rota de punta a punta y ninguna prueba lo vio, porque todas entraban por el
 * SERVICIO con un id válido ya en la mano.
 *
 * De ahí la forma de esta prueba: no comprueba lógica de negocio —de eso ya se
 * ocupa `feedback.pg.spec.ts`— sino la COSTURA entre lo que el guard escribe y
 * lo que el controlador lee. Se teclea `AuthenticatedUser` a propósito: el día
 * que alguien renombre un campo del guard, esto deja de compilar en vez de
 * empezar a devolver 500 en producción.
 */
describe('FeedbackController · el actor sale del usuario del guard', () => {
  const usuarioDelGuard: AuthenticatedUser = {
    userId: '11111111-2222-4333-8444-555555555555',
    email: 'arquitecta@ejemplo.mx',
    role: 'member',
    tenant_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    organization_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    plant_id: null,
    permissions: ['cad:view'],
    scopes: null,
  };

  function conControlador() {
    const recibido: {
      autor?: { userId: string; email: string; organizationId: string | null };
    } = {};
    const feedback = {
      create: jest.fn(async (_input: unknown, autor: never) => {
        recibido.autor = autor;
        return {
          id: 'f1',
          kind: 'idea',
          message: 'hola',
          status: 'nuevo',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
    } as unknown as FeedbackService;
    const rateLimits = {
      enforce: jest.fn(async () => undefined),
    } as unknown as ApiRateLimitService;
    return {
      controlador: new FeedbackController(feedback, rateLimits),
      recibido,
    };
  }

  const peticion = (user: AuthenticatedUser) =>
    ({ user }) as unknown as Request;

  it('el autor es el `userId` del guard, no un `id` que nadie escribe', async () => {
    const { controlador, recibido } = conControlador();
    await controlador.create(
      { kind: 'idea', message: 'Una sugerencia' } as never,
      peticion(usuarioDelGuard),
    );
    expect(recibido.autor).toEqual({
      userId: usuarioDelGuard.userId,
      email: usuarioDelGuard.email,
      organizationId: usuarioDelGuard.organization_id,
    });
    // La acusación concreta: nunca en blanco. Una cadena vacía aquí es un 500
    // en cuanto la fila toca PostgreSQL.
    expect(recibido.autor?.userId).not.toBe('');
  });

  it('sin usuario en la petición el autor queda vacío y NO se inventa', async () => {
    const { controlador, recibido } = conControlador();
    await controlador.create(
      { kind: 'idea', message: 'Una sugerencia' } as never,
      {} as unknown as Request,
    );
    // Que quede vacío está bien: es el guard quien decide si hay sesión, y sin
    // él la petición no debería haber llegado. Lo que no puede pasar es que el
    // controlador se invente un autor.
    expect(recibido.autor).toEqual({
      userId: '',
      email: '',
      organizationId: null,
    });
  });
});
