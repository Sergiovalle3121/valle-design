import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { FeedbackController } from './feedback.controller';
import type { FeedbackService } from './feedback.service';
import type { ApiRateLimitService } from '../identity/api-rate-limit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';

/**
 * LA PUERTA DEL PANEL DE OPERADOR, ejercida.
 *
 * ── POR QUÉ ESTA PRUEBA EXISTE ──────────────────────────────────────────────
 * `assertOperator` es la ÚNICA frontera entre «ver mis comentarios» y «ver los
 * de todas las organizaciones del producto», y no tenía ni una prueba en ningún
 * nivel. `product-operators.spec.ts` cubre el parseo de la lista —que `@` a
 * secas no entra, que se normalizan mayúsculas— pero nadie comprobaba que el
 * controlador la USE, ni que falle CERRADO cuando la variable no está.
 *
 * Una lista bien parseada que nadie consulta protege exactamente lo mismo que
 * ninguna lista.
 */
describe('FeedbackController · la puerta del panel de operador', () => {
  const ORIGINAL = process.env.PRODUCT_OPERATOR_EMAILS;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PRODUCT_OPERATOR_EMAILS;
    else process.env.PRODUCT_OPERATOR_EMAILS = ORIGINAL;
  });

  const controlador = () =>
    new FeedbackController(
      { listAll: jest.fn(async () => []) } as unknown as FeedbackService,
      {
        enforce: jest.fn(async () => undefined),
      } as unknown as ApiRateLimitService,
    );

  const como = (email: string): Request =>
    ({
      user: {
        userId: '11111111-2222-4333-8444-555555555555',
        email,
        role: 'member',
        tenant_id: null,
        organization_id: null,
        plant_id: null,
        permissions: ['cad:view'],
        scopes: null,
      } satisfies AuthenticatedUser,
    }) as unknown as Request;

  it('SIN la variable configurada no entra nadie, ni quien la escribiría', async () => {
    delete process.env.PRODUCT_OPERATOR_EMAILS;
    await expect(
      controlador().all(como('sergio@ejemplo.mx')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('con la lista puesta, un correo que NO está en ella se queda fuera', async () => {
    process.env.PRODUCT_OPERATOR_EMAILS = 'sergio@ejemplo.mx';
    await expect(
      controlador().all(como('otra@ejemplo.mx')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un correo de la lista entra, y la comparación no distingue mayúsculas', async () => {
    process.env.PRODUCT_OPERATOR_EMAILS = 'sergio@ejemplo.mx';
    await expect(controlador().all(como('SERGIO@Ejemplo.MX'))).resolves.toEqual(
      { items: [] },
    );
  });

  it('una petición SIN usuario no entra: el correo vacío no puede casar', async () => {
    // La acusación concreta: si la lista trajera basura y el filtro dejara
    // pasar una cadena vacía, una petición sin sesión abriría el panel.
    process.env.PRODUCT_OPERATOR_EMAILS = 'sergio@ejemplo.mx,,  ,@';
    await expect(
      controlador().all({} as unknown as Request),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
