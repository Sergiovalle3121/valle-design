import type { DataSource, FindManyOptions, Repository } from 'typeorm';
import type {
  IdentityAuditEvent,
  Session,
  User,
} from './entities/identity.entity';
import {
  exportPersonalData,
  PERSONAL_DATA_EXPORT_SESSION_LIMIT,
} from './identity-export';
import type { IdentityMfaService } from './identity-mfa.service';

/**
 * El tope de sesiones de la exportación, con repositorios falsos.
 *
 * La frontera de seguridad (nunca el hash, nunca la IP) ya la prueba
 * `identity-export.pg.spec.ts` contra PostgreSQL real; aquí sólo importa la
 * FORMA de la consulta: acotada a las más recientes, porque las filas de
 * sesión nunca se borran y una cuenta vieja acumulaba miles (hallazgo «GET
 * /v1/auth/export lists sessions without a bound»).
 */

const sesion = (indice: number): Session =>
  ({
    id: `sesion-${indice}`,
    userId: 'usuario-1',
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, indice)),
    expiresAt: new Date(Date.UTC(2026, 0, 2, 0, indice)),
    revokedAt: null,
    userAgent: null,
  }) as unknown as Session;

function armar(totalSesiones: number) {
  const consultas: FindManyOptions<Session>[] = [];
  const almacen = Array.from({ length: totalSesiones }, (_, i) => sesion(i));
  const sessions = {
    find: (options: FindManyOptions<Session>) => {
      consultas.push(options);
      // El falso honra `take` como lo haría el motor; lo que se prueba es que
      // la consulta lo lleve, no que el falso sepa recortar.
      return Promise.resolve(almacen.slice(0, options.take ?? almacen.length));
    },
  } as unknown as Repository<Session>;
  const users = {
    findOneByOrFail: () =>
      Promise.resolve({
        id: 'usuario-1',
        email: 'dibujante@ejemplo.mx',
        displayName: null,
        emailVerifiedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
  } as unknown as Repository<User>;
  const audit = {
    find: () => Promise.resolve([]),
  } as unknown as Repository<IdentityAuditEvent>;
  const dataSource = {
    getRepository: () => ({ findBy: () => Promise.resolve([]) }),
  } as unknown as DataSource;
  const mfa = {
    mfaStatus: () => Promise.resolve({ enabled: false }),
  } as unknown as IdentityMfaService;
  return { consultas, deps: { dataSource, users, sessions, audit, mfa } };
}

describe('exportPersonalData — sesiones acotadas', () => {
  it('pide sólo las mil sesiones más recientes del usuario', async () => {
    const { consultas, deps } = armar(PERSONAL_DATA_EXPORT_SESSION_LIMIT + 5);

    const exportado = await exportPersonalData(deps, 'usuario-1');

    expect(PERSONAL_DATA_EXPORT_SESSION_LIMIT).toBe(1000);
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).toMatchObject({
      where: { userId: 'usuario-1' },
      order: { createdAt: 'DESC' },
      take: PERSONAL_DATA_EXPORT_SESSION_LIMIT,
    });
    expect(exportado.sessions).toHaveLength(PERSONAL_DATA_EXPORT_SESSION_LIMIT);
  });
});
