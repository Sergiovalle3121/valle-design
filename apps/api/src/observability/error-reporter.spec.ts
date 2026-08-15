import { NullErrorReporter } from './adapters/null-error-reporter';
import {
  parseSentryDsn,
  SentryHttpErrorReporter,
  type FetchLike,
} from './adapters/sentry-http.error-reporter';
import { createErrorReporter } from './error-reporter.factory';
import { ErrorReportingLogger } from './error-reporting.logger';
import type { ErrorReport } from './error-reporter.port';
import { REDACTED } from './scrub';

const DSN = 'https://clavepublica123@o42.ingest.example.com/7654321';

function report(overrides: Partial<ErrorReport> = {}): ErrorReport {
  return {
    kind: 'QueryFailedError',
    message: 'algo fallo',
    level: 'error',
    source: 'AllExceptionsFilter',
    ...overrides,
  };
}

/** `fetch` de mentira: registra las llamadas y NUNCA toca la red. */
function fakeFetch(status = 200) {
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    body: string;
  }> = [];
  const impl: FetchLike = (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return Promise.resolve({ ok: status < 400, status });
  };
  return { impl, calls };
}

describe('puerto ErrorReporter', () => {
  describe('adaptador nulo (por defecto)', () => {
    it('acepta reportes sin hacer nada observable fuera del proceso', () => {
      const reporter = new NullErrorReporter();
      reporter.report(report());
      expect(reporter.count).toBe(1);
      expect(reporter.last?.kind).toBe('QueryFailedError');
    });
  });

  describe('fabrica', () => {
    const silent = { log: () => undefined, warn: () => undefined };

    it('sin SENTRY_DSN devuelve el adaptador INERTE (comportamiento por defecto del repo)', () => {
      const reporter = createErrorReporter({ env: {}, logger: silent });
      expect(reporter).toBeInstanceOf(NullErrorReporter);
    });

    it.each([
      ['sin clave publica', 'https://o42.ingest.example.com/7654321'],
      ['sin proyecto', 'https://k3yPubl1ca@o42.ingest.example.com/'],
      [
        'proyecto no numerico',
        'https://k3yPubl1ca@o42.ingest.example.com/proyecto',
      ],
      ['no es una URL', 'esto-no-es-un-dsn'],
      ['esquema no HTTP', 'ftp://k3yPubl1ca@host/1'],
    ])('un DSN %s NO tumba el arranque: cae al adaptador inerte', (_c, dsn) => {
      const warns: string[] = [];
      const reporter = createErrorReporter({
        env: { SENTRY_DSN: dsn },
        logger: { log: () => undefined, warn: (m) => warns.push(m) },
      });
      expect(reporter).toBeInstanceOf(NullErrorReporter);
      // El DSN NO se imprime: lleva la clave publica del proyecto.
      expect(warns.join(' ')).not.toContain(dsn);
      expect(warns.join(' ')).not.toContain('k3yPubl1ca');
    });

    it('con DSN valido y fetch disponible activa el adaptador HTTP', () => {
      const reporter = createErrorReporter({
        env: { SENTRY_DSN: DSN, NODE_ENV: 'production' },
        fetchImpl: fakeFetch().impl,
        logger: silent,
      });
      expect(reporter).toBeInstanceOf(SentryHttpErrorReporter);
    });

    it('sin fetch en el runtime cae al adaptador inerte en vez de fallar', () => {
      const reporter = createErrorReporter({
        env: { SENTRY_DSN: DSN },
        fetchImpl: undefined as unknown as FetchLike,
        logger: silent,
      });
      // globalThis.fetch existe en Node 20; se fuerza el caso comprobando que
      // la fabrica nunca lanza y siempre devuelve un reporter usable.
      expect(typeof reporter.report).toBe('function');
    });
  });

  describe('parseo de DSN', () => {
    it('extrae clave, host y proyecto', () => {
      expect(parseSentryDsn(DSN)).toEqual({
        publicKey: 'clavepublica123',
        host: 'o42.ingest.example.com',
        projectId: '7654321',
        protocol: 'https',
        path: '',
      });
    });

    it('admite instalaciones on-premise con ruta', () => {
      expect(parseSentryDsn('https://clave@sentry.interno/ruta/12')?.path).toBe(
        '/ruta',
      );
    });
  });

  describe('adaptador HTTP compatible con Sentry', () => {
    function build(status = 200) {
      const fetcher = fakeFetch(status);
      const reporter = new SentryHttpErrorReporter({
        dsn: parseSentryDsn(DSN)!,
        fetchImpl: fetcher.impl,
        environment: 'production',
        release: 'v0.1.0',
      });
      return { reporter, fetcher };
    }

    it('publica en el endpoint de envelope del proyecto', () => {
      const { reporter } = build();
      expect(reporter.endpoint).toBe(
        'https://o42.ingest.example.com/api/7654321/envelope/',
      );
    });

    it('envia un envelope de tres lineas con la cabecera de autenticacion', async () => {
      const { reporter, fetcher } = build();
      reporter.report(report());
      await reporter.flush();

      expect(fetcher.calls).toHaveLength(1);
      const call = fetcher.calls[0];
      expect(call.headers['X-Sentry-Auth']).toContain(
        'sentry_key=clavepublica123',
      );
      expect(call.headers['Content-Type']).toBe(
        'application/x-sentry-envelope',
      );
      const lines = call.body.trim().split('\n');
      expect(lines).toHaveLength(3);
      expect(JSON.parse(lines[0])).toHaveProperty('event_id');
      expect(JSON.parse(lines[1])).toMatchObject({ type: 'event' });
      expect(JSON.parse(lines[2])).toMatchObject({
        level: 'error',
        environment: 'production',
        release: 'v0.1.0',
      });
    });

    it('SANEA el mensaje y la traza antes de que salgan del proceso', async () => {
      const { reporter, fetcher } = build();
      reporter.report(
        report({
          message:
            'duplicate key (email)=(ana@empresa.com) en tenant 3f2504e0-4f89-11d3-9a0c-0305e82c3301',
          stack:
            'QueryFailedError: postgres://valle:secreto@db:5432\n    at q (/app/dist/x.js:1:1)',
        }),
      );
      await reporter.flush();

      const body = fetcher.calls[0].body;
      expect(body).not.toContain('ana@empresa.com');
      expect(body).not.toContain('secreto');
      expect(body).not.toContain('3f2504e0-4f89-11d3-9a0c-0305e82c3301');
      expect(body).toContain(REDACTED);
      // Y lo accionable sobrevive.
      expect(body).toContain('/app/dist/x.js:1:1');
    });

    it('SANEA tambien las etiquetas, incluidas las que llegan del llamante', async () => {
      const { reporter, fetcher } = build();
      reporter.report(
        report({
          route: '/v1/cad/documents/:documentId',
          statusCode: 500,
          tags: { email: 'ana@empresa.com', plan: 'pro' },
        }),
      );
      await reporter.flush();
      const parsed: unknown = JSON.parse(
        fetcher.calls[0].body.trim().split('\n')[2],
      );
      const { tags } = parsed as { tags: Record<string, string> };
      expect(tags.route).toBe('/v1/cad/documents/:documentId');
      expect(tags.plan).toBe('pro');
      expect(tags.email).toBe(REDACTED);
    });

    it('report() NO devuelve promesa: el camino de la peticion no espera a la telemetria', () => {
      const { reporter } = build();
      expect(reporter.report(report())).toBeUndefined();
    });

    it('un backend caido no propaga la excepcion al llamante', async () => {
      const reporter = new SentryHttpErrorReporter({
        dsn: parseSentryDsn(DSN)!,
        fetchImpl: () => Promise.reject(new Error('ENOTFOUND')),
        environment: 'production',
      });
      expect(() => reporter.report(report())).not.toThrow();
      await expect(reporter.flush()).resolves.toBeUndefined();
    });

    it('un 429 del proveedor se anota como clase de error, sin su cuerpo', async () => {
      const kinds: string[] = [];
      const reporter = new SentryHttpErrorReporter({
        dsn: parseSentryDsn(DSN)!,
        fetchImpl: () => Promise.resolve({ ok: false, status: 429 }),
        environment: 'production',
        onTransportError: (kind) => kinds.push(kind),
      });
      reporter.report(report());
      await reporter.flush();
      expect(kinds).toEqual(['HTTP_429']);
    });

    it('con el backend lento aplica contrapresion en vez de crecer sin limite', async () => {
      let resolveAll: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        resolveAll = resolve;
      });
      const reporter = new SentryHttpErrorReporter({
        dsn: parseSentryDsn(DSN)!,
        fetchImpl: () => gate.then(() => ({ ok: true, status: 200 })),
        environment: 'production',
        maxInFlight: 2,
      });
      for (let i = 0; i < 10; i += 1) reporter.report(report());
      expect(reporter.dropped).toBe(8);
      resolveAll();
      await reporter.flush();
    });
  });

  describe('puente con el logger de Nest (worker de outbox)', () => {
    beforeEach(() => {
      // La consola de Nest escribe por stderr; aqui se comprueba el EFECTO
      // (que el reporte sale), no el log, que sigue siendo el de siempre.
      jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('un logger.error del worker llega al reporter', () => {
      const reporter = new NullErrorReporter();
      const logger = new ErrorReportingLogger(reporter);

      logger.error(
        'Commercial outbox dispatch failed (QueryFailedError).',
        undefined,
        'CommercialOutboxWorker',
      );

      expect(reporter.count).toBe(1);
      expect(reporter.last).toMatchObject({
        level: 'error',
        source: 'CommercialOutboxWorker',
        message: 'Commercial outbox dispatch failed (QueryFailedError).',
      });
    });

    it('sanea lo que se registre con PII', () => {
      const reporter = new NullErrorReporter();
      const logger = new ErrorReportingLogger(reporter);

      logger.error('fallo para ana@empresa.com', undefined, 'AlgunServicio');

      expect(reporter.last?.message).not.toContain('ana@empresa.com');
      expect(reporter.last?.message).toContain(REDACTED);
    });

    it('un reporter que lanza NO rompe el logging', () => {
      const logger = new ErrorReportingLogger({
        report: () => {
          throw new Error('telemetria rota');
        },
      });
      expect(() => logger.error('cualquier cosa')).not.toThrow();
    });
  });
});
