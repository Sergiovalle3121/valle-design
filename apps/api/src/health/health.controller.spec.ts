import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { ReadinessState } from '../bootstrap/readiness.state';
import { HealthController } from './health.controller';

interface FakeSource {
  query: jest.Mock;
  showMigrations: jest.Mock;
  options: { synchronize?: boolean; migrations?: unknown };
}

function dataSource(overrides: Partial<FakeSource> = {}): FakeSource {
  return {
    query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    showMigrations: jest.fn().mockResolvedValue(false),
    options: { synchronize: false, migrations: ['migracion'] },
    ...overrides,
  };
}

function build(source: FakeSource, readiness = new ReadinessState()) {
  return new HealthController(source as unknown as DataSource, readiness);
}

async function statusOf(promise: Promise<unknown>) {
  try {
    return { ok: true, body: await promise };
  } catch (error) {
    if (error instanceof ServiceUnavailableException) {
      return {
        ok: false,
        body: error.getResponse() as Record<string, unknown>,
      };
    }
    throw error;
  }
}

describe('probes de salud', () => {
  describe('liveness (GET /health)', () => {
    it('no toca la base: un parpadeo de PostgreSQL no puede provocar restart-loop', () => {
      const source = dataSource();
      const body = build(source).health();
      expect(source.query).not.toHaveBeenCalled();
      expect(body.status).toBe('ok');
    });

    it('sigue en 200 durante el drenaje: un 503 aqui MATARIA el contenedor a mitad del apagado', () => {
      const readiness = new ReadinessState();
      readiness.startDraining();
      expect(build(dataSource(), readiness).health().status).toBe('ok');
    });
  });

  describe('readiness (GET /health/ready)', () => {
    it('con base sana y cadena al dia responde ok', async () => {
      const result = await statusOf(build(dataSource()).ready());
      expect(result.ok).toBe(true);
      expect(result.body).toMatchObject({
        status: 'ok',
        db: 'up',
        migrations: 'up-to-date',
      });
    });

    it('con la base caida responde 503 degraded', async () => {
      const source = dataSource({
        query: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      });
      const result = await statusOf(build(source).ready());
      expect(result.ok).toBe(false);
      expect(result.body).toMatchObject({ status: 'degraded', db: 'down' });
    });

    it('con migraciones pendientes responde 503 aunque la base responda', async () => {
      // «La base responde» no es «la base esta lista»: durante un despliegue,
      // una replica nueva con el esquema a medio migrar serviria peticiones
      // contra columnas que aun no existen.
      const source = dataSource({
        showMigrations: jest.fn().mockResolvedValue(true),
      });
      const result = await statusOf(build(source).ready());
      expect(result.ok).toBe(false);
      expect(result.body).toMatchObject({
        status: 'degraded',
        db: 'up',
        migrations: 'pending',
      });
    });

    it('en el carril de synchronize (SQLite dev) no consulta la cadena', async () => {
      const source = dataSource({
        options: { synchronize: true },
        showMigrations: jest.fn(),
      });
      const result = await statusOf(build(source).ready());
      expect(result.ok).toBe(true);
      expect(source.showMigrations).not.toHaveBeenCalled();
    });

    it('durante el drenaje responde 503 SIN consultar la base', async () => {
      // El balanceador debe sacar la replica de rotacion; gastar una consulta
      // en una instancia que ya se apaga solo retiene el pool.
      const source = dataSource();
      const readiness = new ReadinessState();
      readiness.startDraining();

      const result = await statusOf(build(source, readiness).ready());

      expect(result.ok).toBe(false);
      expect(result.body).toMatchObject({ status: 'draining' });
      expect(result.body).toHaveProperty('drainingSince');
      expect(source.query).not.toHaveBeenCalled();
    });
  });
});
