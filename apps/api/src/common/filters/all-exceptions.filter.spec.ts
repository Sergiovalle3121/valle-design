import {
  ArgumentsHost,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { NullErrorReporter } from '../../observability/adapters/null-error-reporter';
import { REDACTED } from '../../observability/scrub';
import { AllExceptionsFilter } from './all-exceptions.filter';

function host(
  request: Partial<{
    method: string;
    originalUrl: string;
    headers: Record<string, string>;
    route: { path: string };
  }> = {},
) {
  const headers: Record<string, string> = {};
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: (key: string, value: string) => {
      headers[key.toLowerCase()] = value;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
  };
  const req = {
    method: 'GET',
    originalUrl: '/v1/cad/documents/3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    headers: {},
    ...request,
  };
  const argumentsHost = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { argumentsHost, response, headers };
}

describe('AllExceptionsFilter y el puerto de reporte', () => {
  beforeEach(() => {
    // El filtro registra los 5xx con el Logger de Nest, que escribe por
    // stderr. La spec comprueba el efecto en el reporter, no la salida: sin
    // este silencio, cada corrida escupe trazas de errores provocados a
    // propósito y el log de CI deja de ser leíble.
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('funciona SIN reporter: el binding es opcional a proposito', () => {
    const filter = new AllExceptionsFilter();
    const { argumentsHost, response } = host();
    expect(() => filter.catch(new Error('vaya'), argumentsHost)).not.toThrow();
    expect(response.statusCode).toBe(500);
  });

  it('reporta los 5xx con clase, ruta, estado y requestId', () => {
    const reporter = new NullErrorReporter();
    const filter = new AllExceptionsFilter(reporter);
    const { argumentsHost, headers } = host({
      method: 'POST',
      route: { path: '/v1/cad/documents/:documentId/content' },
    });

    filter.catch(new InternalServerErrorException('boom'), argumentsHost);

    expect(reporter.count).toBe(1);
    expect(reporter.last).toMatchObject({
      level: 'error',
      source: 'AllExceptionsFilter',
      statusCode: 500,
      method: 'POST',
      route: '/v1/cad/documents/:documentId/content',
      requestId: headers['x-request-id'],
    });
  });

  it('NO reporta los 4xx: son errores esperados del cliente, no incidentes', () => {
    const reporter = new NullErrorReporter();
    const filter = new AllExceptionsFilter(reporter);
    const { argumentsHost } = host();

    filter.catch(new BadRequestException('campo invalido'), argumentsHost);

    expect(reporter.count).toBe(0);
  });

  it('etiqueta con el PATRON de ruta y nunca con originalUrl', () => {
    const reporter = new NullErrorReporter();
    const filter = new AllExceptionsFilter(reporter);
    const { argumentsHost } = host({
      originalUrl: '/v1/cad/documents/3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      route: { path: '/v1/cad/documents/:documentId' },
    });

    filter.catch(new Error('fallo'), argumentsHost);

    expect(reporter.last?.route).toBe('/v1/cad/documents/:documentId');
    expect(JSON.stringify(reporter.last)).not.toContain(
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    );
  });

  it('SANEA el mensaje del driver antes de reportarlo', () => {
    // El `message` de un QueryFailedError incluye la sentencia con sus
    // parametros: ahi viajan correos, UUID de tenant y hashes.
    const reporter = new NullErrorReporter();
    const filter = new AllExceptionsFilter(reporter);
    const { argumentsHost } = host();
    const error = new Error(
      'duplicate key value violates unique constraint DETAIL: Key (email)=(ana@empresa.com)',
    );

    filter.catch(error, argumentsHost);

    expect(reporter.last?.message).not.toContain('ana@empresa.com');
    expect(reporter.last?.message).toContain(REDACTED);
  });

  it('sanea tambien la traza y conserva archivo y linea', () => {
    const reporter = new NullErrorReporter();
    const filter = new AllExceptionsFilter(reporter);
    const { argumentsHost } = host();
    const error = new Error('fallo de conexion');
    error.stack = [
      'Error: connect ECONNREFUSED postgres://valle:secreto@db:5432/valle',
      '    at Connection.connect (/app/dist/pg.js:42:11)',
    ].join('\n');

    filter.catch(error, argumentsHost);

    expect(reporter.last?.stack).not.toContain('secreto');
    expect(reporter.last?.stack).toContain('/app/dist/pg.js:42:11');
  });

  it('un reporter que lanza no convierte un 500 en dos', () => {
    const filter = new AllExceptionsFilter({
      report: () => {
        throw new Error('telemetria rota');
      },
    });
    const { argumentsHost, response } = host();

    expect(() => filter.catch(new Error('boom'), argumentsHost)).not.toThrow();
    expect(response.statusCode).toBe(500);
    expect(response.body).toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('el cuerpo del 500 sigue sin filtrar internals al cliente', () => {
    const reporter = new NullErrorReporter();
    const filter = new AllExceptionsFilter(reporter);
    const { argumentsHost, response } = host();

    filter.catch(new Error('detalle interno del driver'), argumentsHost);

    expect(JSON.stringify(response.body)).not.toContain(
      'detalle interno del driver',
    );
  });
});
