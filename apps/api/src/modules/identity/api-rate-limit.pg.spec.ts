import {
  createPostgresHarness,
  describePostgres,
  type PostgresHarness,
} from '../../common/testing/postgres-harness';
import { ApiRateLimitService } from './api-rate-limit.service';
import { IdentityRateLimit } from './entities/identity.entity';
import { PostgresIdentityRateLimitStore } from './postgres-identity-rate-limit.store';

/**
 * El cableado que producción usa de verdad: ApiRateLimitService → claves HMAC
 * opacas → PostgresIdentityRateLimitStore → `identity_rate_limits`.
 *
 * La atomicidad del store bajo carrera ya la demuestra su propia suite; lo
 * que ésta añade es el extremo a extremo del servicio NUEVO sobre PG real:
 * que el techo se respeta con peticiones CONCURRENTES (no en fila india, que
 * es donde un check-then-save mentiría) y que en la tabla no aparece ningún
 * identificador en claro — el documento/sesión/organización que se protege
 * no debe poder leerse de la tabla de límites.
 */
describePostgres('ApiRateLimitService (PostgreSQL real)', () => {
  jest.setTimeout(60_000);

  let harness: PostgresHarness;
  let service: ApiRateLimitService;

  beforeAll(async () => {
    harness = await createPostgresHarness([IdentityRateLimit], {
      schemaPrefix: 'api_rate_limit',
    });
    service = new ApiRateLimitService(
      new PostgresIdentityRateLimitStore(harness.dataSource),
    );
  });

  afterAll(async () => {
    if (harness) await harness.destroy();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  it('bajo carga CONCURRENTE deja pasar exactamente el techo', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () =>
        service.enforce('cad.review.comment', ['sesion-concurrente'], 10),
      ),
    );
    const allowed = results.filter((r) => r.status === 'fulfilled').length;
    const limited = results.filter(
      (r) =>
        r.status === 'rejected' &&
        (r.reason as { status?: number }).status === 429,
    ).length;
    expect(allowed).toBe(10);
    expect(limited).toBe(20);
  });

  it('la tabla nunca contiene el identificador en claro', async () => {
    const documentId = 'documento-secreto-8a1f';
    await service.enforce('cad.content.write', [documentId], 120);

    const rows: Array<{ key: string }> = await harness.dataSource.query(
      `SELECT "key" FROM "${harness.schema}"."identity_rate_limits"`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].key).not.toContain(documentId);
    expect(rows[0].key).toMatch(/^identity:cad\.content\.write:/u);
  });
});
