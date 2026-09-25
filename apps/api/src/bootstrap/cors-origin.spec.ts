import { Controller, Get, Post } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import {
  ERROR_REPORTER,
  type ErrorReport,
} from '../observability/error-reporter.port';
import { NEST_APP_OPTIONS } from '../nest-app-options';
import {
  CORS_ORIGIN_REJECTED,
  corsOriginCheck,
  sanitizeOrigin,
} from './cors-origin';

/**
 * Un origen ajeno recibe 403 y no cuenta como error del servidor.
 *
 * Del 17 al 24 de septiembre de 2026 todos los 5xx de producción fueron
 * rechazos de CORS contestados como 500 (un escáner de WordPress y un
 * entorno de vista previa). La app mínima de abajo monta el MISMO filtro
 * global que `app.module.ts` y el mismo `enableCors` que `main.ts`, y
 * comprueba el código, el cuerpo y que el reporter no se entere.
 */

const PERMITIDO = 'https://vallecad.com';

@Controller()
class SondaController {
  @Get('v1/auth/session')
  session() {
    return { ok: true };
  }

  @Post('v1/cad/documents')
  create() {
    return { creado: true };
  }
}

function registro() {
  const warns: string[] = [];
  const errors: string[] = [];
  return {
    warns,
    errors,
    logger: {
      warn: (m: string) => warns.push(m),
      error: (m: string) => errors.push(m),
    },
  };
}

function decidir(
  permitidos: readonly string[],
  origin: string | undefined,
): { err: Error | null; allow?: boolean; log: ReturnType<typeof registro> } {
  const log = registro();
  let result: { err: Error | null; allow?: boolean } = { err: null };
  corsOriginCheck(permitidos, log.logger)(origin, (err, allow) => {
    result = { err, allow };
  });
  return { ...result, log };
}

describe('corsOriginCheck — la decisión por petición', () => {
  it('sin Origin no hay nada que decidir', () => {
    expect(decidir([PERMITIDO], undefined)).toMatchObject({
      err: null,
      allow: true,
    });
  });

  it('el origen permitido pasa, con o sin barra final', () => {
    expect(decidir([PERMITIDO], PERMITIDO).allow).toBe(true);
    expect(decidir([PERMITIDO], `${PERMITIDO}/`).allow).toBe(true);
  });

  it('un origen ajeno es un 403 con código propio, registrado como warn', () => {
    const { err, allow, log } = decidir([PERMITIDO], 'https://malo.example');
    expect(allow).toBe(false);
    expect(err).toMatchObject({ status: 403 });
    expect(
      (err as unknown as { getResponse(): unknown }).getResponse(),
    ).toMatchObject({ code: CORS_ORIGIN_REJECTED });
    expect(log.errors).toEqual([]);
    expect(log.warns).toHaveLength(1);
  });

  it('sin orígenes configurados el defecto es del operador: error y 500', () => {
    const { err, allow, log } = decidir([], 'https://vallecad.com');
    expect(allow).toBe(false);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toHaveProperty('status');
    expect(log.errors).toHaveLength(1);
  });

  it('el origen se sanea antes de registrarlo', () => {
    expect(
      sanitizeOrigin('https://a.example\n[Nest] ERROR falso\u001b[31m'),
    ).toBe('https://a.example[Nest] ERROR falso[31m');
    expect(sanitizeOrigin('x'.repeat(500))).toHaveLength(200);
  });
});

describe('CORS en la app: el rechazo llega al cliente como 403', () => {
  let app: NestExpressApplication;
  const reports: ErrorReport[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SondaController],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        {
          provide: ERROR_REPORTER,
          useValue: { report: (r: ErrorReport) => reports.push(r) },
        },
      ],
    }).compile();
    app =
      moduleRef.createNestApplication<NestExpressApplication>(NEST_APP_OPTIONS);
    app.useLogger(false);
    app.useBodyParser('json');
    app.enableCors({
      origin: corsOriginCheck([PERMITIDO], registro().logger),
      credentials: true,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('el origen permitido recibe la respuesta y su cabecera CORS', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/auth/session')
      .set('Origin', PERMITIDO)
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe(PERMITIDO);
  });

  it('un origen ajeno recibe 403, sin llegar al handler ni al reporter', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/cad/documents')
      .set('Origin', 'https://web-valle-design-pr-224.up.railway.app')
      .send({})
      .expect(403);
    expect(res.body).toMatchObject({ code: CORS_ORIGIN_REJECTED });
    expect(res.body).not.toHaveProperty('creado');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(reports).toEqual([]);
  });

  it('el escáner de WordPress de producción recibe 403, no 500', async () => {
    await request(app.getHttpServer())
      .post('/wp-json/batch/v1')
      .set('Origin', 'https://vallecad.com.evil.example')
      .send({})
      .expect(403);
    expect(reports).toEqual([]);
  });

  it('el preflight de un origen ajeno también es 403', async () => {
    await request(app.getHttpServer())
      .options('/v1/cad/documents')
      .set('Origin', 'https://malo.example')
      .set('Access-Control-Request-Method', 'POST')
      .expect(403);
  });

  it('sin Origin (curl, health check) la ruta desconocida sigue siendo 404', async () => {
    await request(app.getHttpServer()).post('/wp-json/batch/v1').expect(404);
  });
});
