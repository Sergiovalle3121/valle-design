import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import {
  evaluateMetricsAccess,
  extractBearer,
  MIN_METRICS_TOKEN_LENGTH,
} from './metrics-access';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsController } from './metrics.controller';
import type { MetricsGaugesProvider } from './metrics-gauges.provider';
import {
  DEFAULT_LATENCY_BUCKETS,
  MetricsRegistry,
  type MetricsGauges,
} from './metrics.registry';

const EMPTY_GAUGES: MetricsGauges = {
  outboxBacklog: [],
  outboxOldestPendingAgeSeconds: [],
  outboxDispatch: [],
  outboxDelivery: [],
  dbPool: [],
};

const TOKEN = 'token-de-metricas-suficientemente-largo';

function parseSeries(body: string): Map<string, number> {
  const series = new Map<string, number>();
  for (const line of body.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const separator = line.lastIndexOf(' ');
    series.set(line.slice(0, separator), Number(line.slice(separator + 1)));
  }
  return series;
}

describe('metricas Prometheus', () => {
  describe('formato de exposicion', () => {
    it('cuenta peticiones por metodo, PATRON de ruta y estado', () => {
      const registry = new MetricsRegistry();
      registry.observeHttp({
        method: 'get',
        route: '/v1/cad/documents/:documentId',
        statusCode: 200,
        durationSeconds: 0.02,
      });
      registry.observeHttp({
        method: 'GET',
        route: '/v1/cad/documents/:documentId',
        statusCode: 200,
        durationSeconds: 0.03,
      });
      registry.observeHttp({
        method: 'GET',
        route: '/v1/cad/documents/:documentId',
        statusCode: 404,
        durationSeconds: 0.01,
      });

      const series = parseSeries(registry.render(EMPTY_GAUGES));
      expect(
        series.get(
          'valle_http_requests_total{method="GET",route="/v1/cad/documents/:documentId",status="200"}',
        ),
      ).toBe(2);
      expect(
        series.get(
          'valle_http_requests_total{method="GET",route="/v1/cad/documents/:documentId",status="404"}',
        ),
      ).toBe(1);
    });

    it('declara HELP y TYPE de cada metrica (sin ellos el scrapper no la tipa)', () => {
      const body = new MetricsRegistry().render(EMPTY_GAUGES);
      for (const metric of [
        'valle_http_requests_total',
        'valle_http_request_duration_seconds',
        'valle_outbox_backlog',
        'valle_outbox_oldest_pending_age_seconds',
        'valle_outbox_dispatch_total',
        'valle_db_pool_connections',
        'valle_process_uptime_seconds',
      ]) {
        expect(body).toContain(`# HELP ${metric} `);
        expect(body).toContain(`# TYPE ${metric} `);
      }
    });

    it('el histograma es ACUMULATIVO y cierra en +Inf, como exige el formato', () => {
      const registry = new MetricsRegistry();
      // 0.02 s cae en el bucket 0.025; 3 s, entre 2.5 y 5.
      registry.observeHttp({
        method: 'POST',
        route: '/v1/cad/documents',
        statusCode: 201,
        durationSeconds: 0.02,
      });
      registry.observeHttp({
        method: 'POST',
        route: '/v1/cad/documents',
        statusCode: 201,
        durationSeconds: 3,
      });

      const series = parseSeries(registry.render(EMPTY_GAUGES));
      const labels = 'method="POST",route="/v1/cad/documents"';
      expect(
        series.get(
          `valle_http_request_duration_seconds_bucket{${labels},le="0.01"}`,
        ),
      ).toBe(0);
      expect(
        series.get(
          `valle_http_request_duration_seconds_bucket{${labels},le="0.025"}`,
        ),
      ).toBe(1);
      expect(
        series.get(
          `valle_http_request_duration_seconds_bucket{${labels},le="2.5"}`,
        ),
      ).toBe(1);
      expect(
        series.get(
          `valle_http_request_duration_seconds_bucket{${labels},le="5"}`,
        ),
      ).toBe(2);
      expect(
        series.get(
          `valle_http_request_duration_seconds_bucket{${labels},le="+Inf"}`,
        ),
      ).toBe(2);
      expect(
        series.get(`valle_http_request_duration_seconds_count{${labels}}`),
      ).toBe(2);
      expect(
        series.get(`valle_http_request_duration_seconds_sum{${labels}}`),
      ).toBeCloseTo(3.02, 3);
    });

    it('los buckets permiten calcular p50 y p95 en ambos extremos utiles', () => {
      // p50 de este API vive en decenas de ms y el p95 de un guardado grande,
      // en segundos: sin cobertura a los dos lados, el percentil satura.
      expect(DEFAULT_LATENCY_BUCKETS[0]).toBeLessThanOrEqual(0.005);
      expect(
        DEFAULT_LATENCY_BUCKETS[DEFAULT_LATENCY_BUCKETS.length - 1],
      ).toBeGreaterThanOrEqual(10);
    });

    it('publica backlog, lag del outbox, dispatcher y pool', () => {
      const body = new MetricsRegistry().render({
        outboxBacklog: [
          { queue: 'email', status: 'pending', value: 12 },
          { queue: 'domain', status: 'dead', value: 1 },
        ],
        outboxOldestPendingAgeSeconds: [
          { queue: 'email', value: 340 },
          { queue: 'domain', value: null },
        ],
        outboxDispatch: [{ queue: 'email', event: 'sent', value: 900 }],
        outboxDelivery: [{ queue: 'email', count: 900, totalSeconds: 45.5 }],
        dbPool: [
          { state: 'total', value: 10 },
          { state: 'waiting', value: 3 },
        ],
      });
      const series = parseSeries(body);
      expect(
        series.get('valle_outbox_backlog{queue="email",status="pending"}'),
      ).toBe(12);
      expect(
        series.get('valle_outbox_backlog{queue="domain",status="dead"}'),
      ).toBe(1);
      expect(
        series.get('valle_outbox_oldest_pending_age_seconds{queue="email"}'),
      ).toBe(340);
      expect(
        series.get('valle_outbox_dispatch_total{queue="email",event="sent"}'),
      ).toBe(900);
      expect(series.get('valle_db_pool_connections{state="waiting"}')).toBe(3);
    });

    it('una cola sin pendientes publica 0 y NO desaparece de la exposicion', () => {
      // Una serie que desaparece dispara absent() y parece una caida del
      // exportador, no una cola vacia.
      const series = parseSeries(
        new MetricsRegistry().render({
          ...EMPTY_GAUGES,
          outboxOldestPendingAgeSeconds: [{ queue: 'domain', value: null }],
        }),
      );
      expect(
        series.get('valle_oldest_pending_age_seconds{queue="domain"}'),
      ).toBeUndefined();
      expect(
        series.get('valle_outbox_oldest_pending_age_seconds{queue="domain"}'),
      ).toBe(0);
    });

    it('escapa comillas y barras en las etiquetas', () => {
      const registry = new MetricsRegistry();
      registry.observeHttp({
        method: 'GET',
        route: '/v1/raro"con\\comillas',
        statusCode: 200,
        durationSeconds: 0.01,
      });
      expect(registry.render(EMPTY_GAUGES)).toContain(
        'route="/v1/raro\\"con\\\\comillas"',
      );
    });

    it('acota la cardinalidad: rutas nuevas sin presupuesto caen en una cubeta', () => {
      const registry = new MetricsRegistry();
      for (let i = 0; i < 600; i += 1) {
        registry.observeHttp({
          method: 'GET',
          route: `/v1/generada/${i}`,
          statusCode: 200,
          durationSeconds: 0.01,
        });
      }
      const body = registry.render(EMPTY_GAUGES);
      expect(body).toContain('(desbordado)');
      const routes = new Set(
        [...body.matchAll(/route="([^"]+)"/g)].map((m) => m[1]),
      );
      expect(routes.size).toBeLessThanOrEqual(401);
    });
  });

  describe('middleware de medicion', () => {
    function run(route: unknown, statusCode: number) {
      const registry = new MetricsRegistry();
      const middleware = new HttpMetricsMiddleware(registry);
      let finish = () => undefined as void;
      const request = { method: 'GET', route } as unknown as Request;
      const response = {
        statusCode,
        on: (event: string, listener: () => void) => {
          if (event === 'finish') finish = listener;
        },
      };
      const next = jest.fn();
      middleware.use(request, response as never, next);
      expect(next).toHaveBeenCalledTimes(1);
      finish();
      return registry.render(EMPTY_GAUGES);
    }

    it('etiqueta con el PATRON de ruta, nunca con la URL real', () => {
      const body = run({ path: '/v1/cad/documents/:documentId' }, 200);
      expect(body).toContain('route="/v1/cad/documents/:documentId"');
    });

    it('una peticion sin ruta casada se agrupa: su path crudo es entrada del cliente', () => {
      expect(run(undefined, 404)).toContain('route="(sin ruta)"');
    });
  });

  describe('proteccion del endpoint', () => {
    it('extrae el bearer y solo el bearer', () => {
      expect(extractBearer('Bearer abc')).toBe('abc');
      expect(extractBearer('bearer  abc  ')).toBe('abc');
      expect(extractBearer('Basic abc')).toBeNull();
      expect(extractBearer(undefined)).toBeNull();
    });

    it('DESACTIVADO por defecto: sin METRICS_TOKEN no hay endpoint', () => {
      expect(evaluateMetricsAccess(undefined, `Bearer ${TOKEN}`)).toBe(
        'disabled',
      );
      expect(evaluateMetricsAccess('', undefined)).toBe('disabled');
    });

    it('un token demasiado corto se trata como no configurado', () => {
      const corto = 'x'.repeat(MIN_METRICS_TOKEN_LENGTH - 1);
      expect(evaluateMetricsAccess(corto, `Bearer ${corto}`)).toBe('disabled');
    });

    it('con token configurado exige el bearer exacto', () => {
      expect(evaluateMetricsAccess(TOKEN, `Bearer ${TOKEN}`)).toBe('granted');
      expect(evaluateMetricsAccess(TOKEN, 'Bearer otro-token-cualquiera')).toBe(
        'unauthorized',
      );
      expect(evaluateMetricsAccess(TOKEN, undefined)).toBe('unauthorized');
      expect(evaluateMetricsAccess(TOKEN, `Bearer ${TOKEN}x`)).toBe(
        'unauthorized',
      );
    });
  });

  describe('controller', () => {
    const gauges = {
      collect: () => Promise.resolve(EMPTY_GAUGES),
    } as unknown as MetricsGaugesProvider;

    function controller() {
      return new MetricsController(new MetricsRegistry(), gauges);
    }

    function request(authorization?: string): Request {
      return { headers: { authorization } } as unknown as Request;
    }

    afterEach(() => {
      delete process.env.METRICS_TOKEN;
    });

    it('sin METRICS_TOKEN responde 404, NO 401: un 401 confirma que hay algo detras', async () => {
      await expect(controller().metrics(request())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('con token configurado y sin credencial responde 401', async () => {
      process.env.METRICS_TOKEN = TOKEN;
      await expect(controller().metrics(request())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('con la credencial correcta devuelve la exposicion', async () => {
      process.env.METRICS_TOKEN = TOKEN;
      const body = await controller().metrics(request(`Bearer ${TOKEN}`));
      expect(body).toContain('# TYPE valle_http_requests_total counter');
      expect(body.endsWith('\n')).toBe(true);
    });
  });
});
