import type { NestApplicationOptions } from '@nestjs/common';

/**
 * Opciones con las que `main.ts` crea la aplicación Nest.
 *
 * `bodyParser: false` NO es una omisión: sin ella, `init()` monta
 * `express.urlencoded` de forma GLOBAL (Nest sólo salta el JSON porque
 * `useBodyParser('json')` ya lo aplicó), y un formulario HTML alojado en OTRO
 * sitio podía enviar `email`/`password` a `POST /v1/auth/login` como
 * `application/x-www-form-urlencoded`: a una navegación de formulario no le
 * aplica CORS, la ruta es pública y `Set-Cookie` se honra en navegaciones
 * cross-site — el navegador de la víctima quedaba con la sesión del ATACANTE
 * (login CSRF) y su trabajo nuevo caía en la organización de él. Con el único
 * parser de cuerpo siendo el JSON explícito de `main.ts` —más los crudos por
 * ruta (Stripe, /v1/outbox) y multer por ruta (`FileInterceptor`)— un
 * formulario cross-site no produce cuerpo que satisfaga `LoginDto`, y un JSON
 * cross-origin ya lo rechaza el preflight de CORS.
 *
 * Vive en su propio módulo, y no inline en `main.ts`, para que la prueba
 * `nest-app-options.spec.ts` pueda levantar una app mínima con EXACTAMENTE
 * estas opciones sin importar `main.ts` (que arranca el servidor al cargarse).
 */
export const NEST_APP_OPTIONS: Readonly<NestApplicationOptions> = Object.freeze(
  {
    cors: false,
    bodyParser: false,
  },
);
