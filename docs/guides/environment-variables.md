# Variables de entorno

`.env.example` y `apps/web/.env.example` son inventarios de referencia. El
código no promete cargar esos archivos por sí mismo: inyecta las variables con
el shell, el runtime o un gestor de secretos. No guardes `.env`, URLs con
credenciales ni claves reales en Git.

## API y PostgreSQL

| Variable         | Requerida            | Comportamiento                                                                                                                                                     |
| ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`       | Sí en producción     | Usa `production` para activar guards de despliegue, cookies Secure y HTTPS en outbox.                                                                              |
| `PORT`           | No                   | Puerto API; default `4000`.                                                                                                                                        |
| `DATABASE_URL`   | Una conexión PG      | URL PostgreSQL. Tiene prioridad sobre el grupo `DB_*`.                                                                                                             |
| `DB_HOST`        | Una conexión PG      | Alternativa a `DATABASE_URL`; se completa con `DB_PORT` (default `5432`), `DB_USERNAME`, `DB_PASSWORD` y `DB_DATABASE`.                                            |
| `SYNCHRONIZE`    | Sí en producción     | Debe ser exactamente `false`. `true` está prohibido en producción. También conviene fijarlo en `false` en staging/dev PostgreSQL cuando se prueban migraciones.    |
| `MIGRATIONS_RUN` | Según entorno        | Con `true`, aplica migraciones al arranque cuando synchronize está apagado fuera de producción. Producción las ejecuta con synchronize apagado.                    |
| `DB_SSL_STRICT`  | Según proveedor      | Con `true`, valida el certificado PostgreSQL. SSL se activa en producción o si la URL contiene `sslmode=require`.                                                  |
| `SQLITE_PATH`    | Sólo dev             | Archivo del fallback SQLite cuando no existe configuración PostgreSQL; default `dev.sqlite` relativo a `apps/api`.                                                 |
| `ALLOWED_ORIGIN` | Sí para web separado | Orígenes CORS exactos, separados por coma, `;`, salto de línea o arreglo JSON. Se normaliza el slash final. Sin valor fuera de desarrollo se rechaza cross-origin. |

SQLite no es productivo y no valida migraciones, rate limiting compartido ni el
worker multi-réplica. Para cualquier gate de release usa PostgreSQL 16.

## Identidad y organizaciones

| Variable                         | Requerida        | Comportamiento                                                                                                                                                           |
| -------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IDENTITY_RATE_LIMIT_KEY_SECRET` | Sí en producción | Secreto compartido entre réplicas, mínimo 32 caracteres. Deriva claves HMAC opacas para los contadores PostgreSQL. Un valor diferente por réplica rompe la coordinación. |
| `TRIAL_DAYS`                     | No               | Duración del trial creado con cada organización; entero de 1 a 90, default `14`. Valores inválidos usan 14.                                                              |
| `REVIEW_LINK_TTL_MINUTES`        | No               | TTL predeterminado de review links; default 10,080 minutos (7 días), acotado entre 5 minutos y 90 días.                                                                  |

Las cookies no tienen variables de nombre o seguridad configurables. En
producción se usa `__Host-valle_session` Secure/HttpOnly y `valle_csrf`; el
reverse proxy debe comunicar HTTPS con `X-Forwarded-Proto=https`.

## Dispatcher y webhooks de outbox

| Variable                    | Requerida        | Comportamiento                                                                                                      |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `OUTBOX_DISPATCHER_ENABLED` | Sí en producción | Debe ser `true`. Requiere PostgreSQL; el arranque rechaza SQLite.                                                   |
| `OUTBOX_EMAIL_WEBHOOK_URL`  | Sí con worker    | Receptor absoluto para email. HTTPS obligatorio en producción; HTTP sólo se acepta en loopback fuera de producción. |
| `OUTBOX_DOMAIN_WEBHOOK_URL` | Sí con worker    | Receptor absoluto para eventos de dominio; mismas reglas. Puede ser la misma URL que email.                         |
| `OUTBOX_WEBHOOK_SECRET`     | Sí con worker    | Secreto HMAC compartido con ambos receptores, mínimo 32 caracteres.                                                 |
| `OUTBOX_WEBHOOK_TIMEOUT_MS` | No               | Timeout por POST; default `15000`, entero entre `1000` y `120000`.                                                  |
| `OUTBOX_POLL_INTERVAL_MS`   | No               | Espera entre lotes; default `1000`, entero entre `250` y `60000`.                                                   |

El receptor valida `X-Valle-Signature` sobre
`<X-Valle-Timestamp>.<raw-body>`, aplica una ventana de frescura y deduplica
`Idempotency-Key`. La entrega es at-least-once.

## Pasarela de pagos (Stripe)

El proveedor de pagos se elige POR CONFIGURACIÓN y jamás a medias:

- Sin ninguna de estas variables, el producto usa el adaptador **nulo**: el
  catálogo publica `checkout: external`, el cobro ocurre fuera del producto
  (asistido) y se registra vía `POST /v1/commercial/upgrade-intents`. Es el
  modo por defecto y es una configuración válida.
- Con las **cuatro** primeras variables, se inyecta el adaptador de Stripe:
  `checkout: hosted`, `POST /v1/commercial/checkout-sessions` devuelve una URL
  de pago y el ciclo de vida lo mueven los webhooks firmados.
- Con **algunas pero no todas**, el arranque FALLA. Un despliegue que puede
  cobrar pero no puede verificar el webhook cobraría sin enterarse.

| Variable                            | Requerida        | Comportamiento                                                                                                    |
| ----------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                 | Con pasarela     | Clave secreta de la cuenta (`sk_…`). Viaja como `Authorization: Bearer` y nunca se registra.                       |
| `STRIPE_WEBHOOK_SECRET`             | Con pasarela     | Secreto del endpoint (`whsec_…`), mínimo 16 caracteres. Verifica la firma sobre los bytes crudos.                  |
| `STRIPE_CHECKOUT_SUCCESS_URL`       | Con pasarela     | Retorno tras pagar. HTTPS obligatorio; HTTP sólo en loopback fuera de producción. Sin credenciales en la URL.      |
| `STRIPE_CHECKOUT_CANCEL_URL`        | Con pasarela     | Retorno si el usuario abandona el pago; mismas reglas.                                                            |
| `STRIPE_API_BASE_URL`               | No               | Base de la API; default `https://api.stripe.com`. Sin query ni fragmento. Existe para apuntar a un doble local.   |
| `STRIPE_API_VERSION`                | No               | Fija la versión (`AAAA-MM-DD`). Sin ella manda la versión por defecto de la cuenta.                                |
| `STRIPE_TIMEOUT_MS`                 | No               | Timeout por llamada; default `20000`, entero entre `1000` y `120000`.                                             |
| `STRIPE_WEBHOOK_TOLERANCE_SECONDS`  | No               | Ventana de frescura de la firma; default `300`, entero entre `30` y `3600`. Fuera de ella el evento se rechaza.   |

El endpoint `POST /v1/commercial/webhooks/stripe` es público (el emisor no
tiene sesión: su credencial es la firma) y recibe el CUERPO CRUDO — su body
parser se monta sólo en esa ruta. Es idempotente por `event.id`, que se apunta
en `payment_events` dentro de la misma transacción que el efecto, así que una
reentrega no renueva dos veces. Configura en el dashboard del proveedor estos
eventos: `checkout.session.completed`, `invoice.paid`,
`invoice.payment_failed` y `customer.subscription.deleted`. Cualquier otro tipo
responde 200 y queda registrado sin efecto.

## Asistencia CIDE opcional

| Variable               | Comportamiento                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `CIDE_BASE_URL`        | Base OpenAI-compatible. Si falta, intent/vision devuelven `available: false` sin hacer red. |
| `CIDE_API_KEY`         | Credencial opcional enviada como Bearer sólo al proveedor CIDE.                             |
| `CIDE_MODEL`           | Modelo de texto; default `qwen2.5:7b`.                                                      |
| `CIDE_VISION_MODEL`    | Modelo multimodal; default `qwen2.5vl:7b`, o cae a `CIDE_MODEL`.                            |
| `CIDE_TIMEOUT_MS`      | Timeout de vision; default `60000`.                                                         |
| `AI_MAX_OUTPUT_TOKENS` | Presupuesto de salida de intent; default `700`.                                             |
| `AI_MOCK`              | Con `1`, respuestas deterministas de prueba. Nunca producción.                              |

Evalúa privacidad y residencia de datos antes de habilitar CIDE con planos de
clientes.

## Web y build

| Variable                                                                                                                                                                                                                 | Comportamiento                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`                                                                                                                                                                                                    | Origen API incorporado al bundle. Default del cliente: `http://localhost:4000`.                               |
| `NEXT_PUBLIC_API_BASE`                                                                                                                                                                                                   | Alias aceptado; tiene prioridad en el helper base. Mantén un único valor para evitar confusión.               |
| `NEXT_PUBLIC_SALES_URL`, `NEXT_PUBLIC_DOCUMENTATION_URL`, `NEXT_PUBLIC_SUPPORT_URL`, `NEXT_PUBLIC_STATUS_URL`, `NEXT_PUBLIC_CONTACT_URL`, `NEXT_PUBLIC_PRIVACY_URL`, `NEXT_PUBLIC_TERMS_URL`, `NEXT_PUBLIC_LICENSES_URL` | Enlaces comerciales opcionales. Sin URL se usan páginas internas existentes; no apuntes a destinos ficticios. |
| `NEXT_PUBLIC_BRAND_*`                                                                                                                                                                                                    | Marca y textos opcionales. No cambian capacidades, licencia ni entidad legal real.                            |

## Pruebas y CI

| Variable                           | Comportamiento                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL`                | PostgreSQL de las suites `*.pg.spec.ts`.                                                |
| `TEST_PG_URL`, `DATABASE_URL_TEST` | Alias aceptados por el harness PG; prefiere `TEST_DATABASE_URL`.                        |
| `REQUIRE_POSTGRES_TESTS`           | Con `true`, la ausencia de PG falla en vez de saltar suites. Obligatorio en CI/release. |
| `IDENTITY_TEST_HARNESS`            | Con `true` fuera de producción, habilita captura exacta de email para pruebas.          |
| `IDENTITY_TEST_HARNESS_KEY`        | Clave del harness, mínimo 32 caracteres. Se envía en `X-Valle-Test-Harness`.            |
| `E2E_IDENTITY_HARNESS_KEY`         | La misma clave vista por fixtures Playwright.                                           |
| `E2E_REAL_API`                     | Con `1`, ejecuta los specs full-stack contra API real.                                  |
| `E2E_API_ORIGIN`, `E2E_BASE_URL`   | Orígenes API/web del recorrido.                                                         |
| `E2E_PROD`                         | Con `1`, Playwright arranca `next start` sobre un build previo.                         |
| `CAD_PERF_E2E`                     | Con `1`, incluye el corpus navegador 10k/100k.                                          |

El harness de email requiere recipient exacto y tenant exacto cuando aplica,
no enumera filas y responde 404 si no está habilitado. Está bloqueado cuando
`NODE_ENV=production`.

## Migración legacy

`DATABASE_URL_SOURCE` apunta al origen read-only y `DATABASE_URL_TARGET` al
destino standalone para el CLI de migración. No inviertas las URLs. Los
directorios de export incluyen manifiesto, NDJSON y blobs con hashes; se deben
conservar y verificar como una unidad.

Las variables `S3_*` y MinIO no forman parte del runtime actual: los blobs viven
en `design_blobs` dentro de PostgreSQL. No configures S3 esperando que cambie el
destino de almacenamiento.
