import { HttpException } from '@nestjs/common';
import { ApiRateLimitService, API_RATE_LIMITS } from './api-rate-limit.service';
import { BoundedMemoryIdentityRateLimitStore } from './identity-rate-limit.store';

/**
 * La mecánica del techo (429 con retryAfterSeconds, claves opacas por scope)
 * se prueba aquí con el store en memoria; la atomicidad multi-réplica del
 * store PostgreSQL ya tiene su propia suite (.pg). Lo que este spec fija es
 * el CONTRATO del servicio: bajo el techo pasa, sobre el techo 429, y dos
 * scopes distintos no comparten presupuesto aunque lleven el mismo
 * identificador.
 */
describe('ApiRateLimitService', () => {
  let service: ApiRateLimitService;

  beforeEach(() => {
    service = new ApiRateLimitService(
      new BoundedMemoryIdentityRateLimitStore(),
    );
  });

  it('permite exactamente el techo y rechaza la petición siguiente con 429', async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.enforce('cad.content.write', ['doc-1'], 5),
      ).resolves.toBeUndefined();
    }

    await expect(
      service.enforce('cad.content.write', ['doc-1'], 5),
    ).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({
        code: 'rate_limited',
        retryAfterSeconds: expect.any(Number),
      }),
    });
  });

  it('el retryAfterSeconds nunca es 0: siempre hay una espera accionable', async () => {
    await service.enforce('cad.vision', ['t', 'a@b'], 1);
    const error = await service
      .enforce('cad.vision', ['t', 'a@b'], 1)
      .then(() => null)
      .catch((e: HttpException) => e);
    const body = error!.getResponse() as { retryAfterSeconds: number };
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('scopes distintos no comparten presupuesto aunque el identificador coincida', async () => {
    await service.enforce('cad.content.write', ['mismo-id'], 1);
    // Mismo identificador, otro scope: presupuesto propio.
    await expect(
      service.enforce('cad.archive.write', ['mismo-id'], 1),
    ).resolves.toBeUndefined();
  });

  it('identificadores distintos no comparten presupuesto dentro del scope', async () => {
    await service.enforce('cad.review.comment', ['sesion-a'], 1);
    await expect(
      service.enforce('cad.review.comment', ['sesion-b'], 1),
    ).resolves.toBeUndefined();
  });

  it('los techos publicados son los acordados (VD-RL-001)', () => {
    // Cambiarlos es legítimo; cambiarlos SIN QUERER no. Este assert convierte
    // un dedazo en un diff visible.
    expect(API_RATE_LIMITS).toEqual({
      cadContentWritePerDocument: 120,
      cadArchiveWritePerDocument: 30,
      cadVisionPerAccount: 10,
      checkoutSessionsPerOrganization: 10,
      reviewCommentsPerSession: 30,
      supportIncidentsPerAccount: 10,
    });
  });
});
