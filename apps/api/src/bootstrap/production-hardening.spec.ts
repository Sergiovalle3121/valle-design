import {
  applyServerTimeouts,
  DEFAULT_SERVER_TIMEOUTS,
  helmetOptions,
  JSON_BODY_LIMIT,
  serverTimeoutsFromEnv,
  type TimeoutConfigurableServer,
} from './production-hardening';

describe('endurecimiento del servidor productivo', () => {
  describe('timeouts', () => {
    it('sin variables usa los valores por defecto', () => {
      expect(serverTimeoutsFromEnv({})).toEqual(DEFAULT_SERVER_TIMEOUTS);
    });

    it('keepAlive supera el idle timeout habitual del balanceador (60 s)', () => {
      // Si el servidor cerrara antes que el proxy, existiría una ventana en la
      // que el proxy envia una peticion por una conexion recien cerrada y no
      // puede reintentarla: 502 esporadicos sin rastro en la aplicacion.
      expect(DEFAULT_SERVER_TIMEOUTS.keepAliveTimeoutMs).toBeGreaterThan(
        60_000,
      );
    });

    it('headersTimeout queda SIEMPRE por encima de keepAlive, aunque se configure al reves', () => {
      const timeouts = serverTimeoutsFromEnv({
        HTTP_KEEP_ALIVE_TIMEOUT_MS: '90000',
        HTTP_HEADERS_TIMEOUT_MS: '5000',
      });
      expect(timeouts.keepAliveTimeoutMs).toBe(90_000);
      expect(timeouts.headersTimeoutMs).toBeGreaterThan(90_000);
    });

    it('el techo de apagado queda por debajo del stopTimeout habitual (30 s)', () => {
      // Salir por decision propia y no por SIGKILL: un SIGKILL deja el pool
      // sin cerrar y transacciones a medias.
      expect(DEFAULT_SERVER_TIMEOUTS.shutdownGraceMs).toBeLessThan(30_000);
      expect(DEFAULT_SERVER_TIMEOUTS.drainDelayMs).toBeLessThan(
        DEFAULT_SERVER_TIMEOUTS.shutdownGraceMs,
      );
    });

    it.each([
      ['no numerico', 'lento'],
      ['negativo', '-1'],
      ['cero', '0'],
      ['decimal', '1500.5'],
      ['vacio', ''],
    ])('un valor %s cae al default en vez de romper el arranque', (_, raw) => {
      const timeouts = serverTimeoutsFromEnv({ HTTP_REQUEST_TIMEOUT_MS: raw });
      expect(timeouts.requestTimeoutMs).toBe(
        DEFAULT_SERVER_TIMEOUTS.requestTimeoutMs,
      );
    });

    it('aplica los tres timeouts al servidor HTTP', () => {
      const server: TimeoutConfigurableServer = {
        keepAliveTimeout: 5_000,
        headersTimeout: 60_000,
        requestTimeout: 0,
      };
      applyServerTimeouts(server, serverTimeoutsFromEnv({}));
      expect(server.keepAliveTimeout).toBe(
        DEFAULT_SERVER_TIMEOUTS.keepAliveTimeoutMs,
      );
      expect(server.headersTimeout).toBe(
        DEFAULT_SERVER_TIMEOUTS.headersTimeoutMs,
      );
      expect(server.requestTimeout).toBe(
        DEFAULT_SERVER_TIMEOUTS.requestTimeoutMs,
      );
    });
  });

  describe('limite de cuerpo', () => {
    it('deja margen sobre los 8 000 000 bytes del documento canonico sin quedar sin tope', () => {
      const bytes = Number(JSON_BODY_LIMIT.replace('mb', '')) * 1024 * 1024;
      expect(bytes).toBeGreaterThan(8_000_000);
      expect(Number.isFinite(bytes)).toBe(true);
    });
  });

  describe('cabeceras de seguridad', () => {
    it('la CSP de una API que solo sirve JSON es default-src none', () => {
      const options = helmetOptions({ NODE_ENV: 'production' });
      const csp = options.contentSecurityPolicy;
      expect(typeof csp === 'object' && csp !== null).toBe(true);
      const directives = (csp as { directives: Record<string, string[]> })
        .directives;
      expect(directives['default-src']).toEqual(["'none'"]);
      expect(directives['frame-ancestors']).toEqual(["'none'"]);
      expect(directives['base-uri']).toEqual(["'none'"]);
      expect(directives['form-action']).toEqual(["'none'"]);
    });

    it('HSTS de un ano con subdominios SOLO en produccion', () => {
      const production = helmetOptions({ NODE_ENV: 'production' });
      expect(production.hsts).toEqual({
        maxAge: 31_536_000,
        includeSubDomains: true,
        preload: false,
      });
    });

    it('en desarrollo NO emite HSTS: fijaria localhost en el navegador durante meses', () => {
      expect(helmetOptions({ NODE_ENV: 'development' }).hsts).toBe(false);
      expect(helmetOptions({}).hsts).toBe(false);
    });

    it('preload queda apagado: es una decision de dominio con vuelta atras de meses', () => {
      const hsts = helmetOptions({ NODE_ENV: 'production' }).hsts as {
        preload: boolean;
      };
      expect(hsts.preload).toBe(false);
    });

    it('CORP cross-origin: la API es un origen distinto del web', () => {
      expect(
        helmetOptions({ NODE_ENV: 'production' }).crossOriginResourcePolicy,
      ).toEqual({ policy: 'cross-origin' });
    });

    it('referrer-policy no-referrer: una URL de API no debe viajar a terceros', () => {
      expect(helmetOptions({}).referrerPolicy).toEqual({
        policy: 'no-referrer',
      });
    });
  });
});
