import { Body, Controller, Post } from '@nestjs/common';
import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NEST_APP_OPTIONS } from './nest-app-options';

/**
 * Login CSRF por formulario: la prueba de la opción que lo cierra.
 *
 * Levanta una app mínima con EXACTAMENTE las opciones de `main.ts` y el mismo
 * `useBodyParser('json')`, y comprueba las dos cosas que importan: que en la
 * pila de Express no quede ningún `urlencodedParser` global, y que un cuerpo
 * `application/x-www-form-urlencoded` —lo único que un formulario HTML de
 * otro sitio puede enviar sin preflight— NO llegue al handler, mientras el
 * JSON sí. El caso de control levanta la app sin `bodyParser: false` para
 * dejar escrito el defecto que se cierra: sin esa opción Nest monta el parser
 * de formularios por su cuenta.
 */

const CREDENCIALES = { email: 'atacante@ejemplo.mx', password: 'ajena' };

@Controller('sonda')
class SondaController {
  @Post('login')
  login(@Body() body: unknown) {
    return { body: body ?? null };
  }
}

interface RouterDeExpress {
  router?: { stack: Array<{ handle: { name: string } }> };
}

async function levantar(
  options: NestApplicationOptions,
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [SondaController],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(options);
  // Igual que main.ts: el JSON explícito es el único parser de cuerpo global.
  app.useBodyParser('json');
  await app.init();
  return app;
}

function parsersGlobales(app: NestExpressApplication): string[] {
  // `getInstance()` devuelve `any` en la interfaz HttpServer; se fija UNA vez.
  const express = app.getHttpAdapter().getInstance() as RouterDeExpress;
  return (express.router?.stack ?? [])
    .map((layer) => layer.handle.name)
    .filter((name) => name.endsWith('Parser'));
}

async function cuerpoRecibido(
  app: NestExpressApplication,
  tipo: 'form' | 'json',
): Promise<unknown> {
  const res = await request(app.getHttpServer())
    .post('/sonda/login')
    .type(tipo)
    .send(CREDENCIALES)
    .expect(201);
  return (res.body as { body: unknown }).body;
}

describe('NEST_APP_OPTIONS — sin parser de formularios global', () => {
  let app: NestExpressApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('declara bodyParser: false, y cors: false (el CORS se configura aparte con lista de orígenes)', () => {
    expect(NEST_APP_OPTIONS).toEqual({ cors: false, bodyParser: false });
  });

  it('en la pila de Express sólo queda el parser JSON explícito', async () => {
    app = await levantar(NEST_APP_OPTIONS);
    const parsers = parsersGlobales(app);
    expect(parsers).toContain('jsonParser');
    expect(parsers).not.toContain('urlencodedParser');
  });

  it('un cuerpo de formulario cross-site no llega al handler; el JSON sí', async () => {
    app = await levantar(NEST_APP_OPTIONS);
    // Sin parser el handler ve `undefined` (aquí `null`); lo que importa es
    // que las credenciales del formulario no lleguen de ninguna forma.
    const formulario = await cuerpoRecibido(app, 'form');
    expect(JSON.stringify(formulario ?? null)).not.toContain(
      CREDENCIALES.email,
    );
    expect(await cuerpoRecibido(app, 'json')).toEqual(CREDENCIALES);
  });

  it('control: sin bodyParser: false, Nest monta urlencodedParser y el formulario entra', async () => {
    app = await levantar({ cors: false });
    expect(parsersGlobales(app)).toContain('urlencodedParser');
    expect(await cuerpoRecibido(app, 'form')).toEqual(CREDENCIALES);
  });
});
