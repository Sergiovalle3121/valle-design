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

## Servidor HTTP y apagado ordenado

| Variable                     | Requerida | Comportamiento                                                                                                                                                                 |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | No        | Vida de una conexión ociosa; default `65000`. **Debe superar el idle timeout del balanceador** (60 s en ALB/nginx): si el servidor cierra primero, el proxy devuelve 502 sin rastro en la aplicación. |
| `HTTP_HEADERS_TIMEOUT_MS`    | No        | Plazo para recibir cabeceras; default `70000`. Se fuerza SIEMPRE por encima de keep-alive: por debajo mataría conexiones sanas.                                                 |
| `HTTP_REQUEST_TIMEOUT_MS`    | No        | Techo de una petición; default `120000`. Una petición colgada retiene socket, memoria y una conexión del pool.                                                                  |
| `SHUTDOWN_DRAIN_DELAY_MS`    | No        | Espera con readiness en 503 antes de cerrar el listener; default `5000`. Debe cubrir al menos un ciclo de health check del balanceador.                                         |
| `SHUTDOWN_GRACE_MS`          | No        | Techo del apagado completo; default `25000`. Por debajo del `stopTimeout` del orquestador (30 s) para terminar por decisión propia y no por SIGKILL con el pool abierto.        |

Valores no numéricos, negativos, cero o decimales caen al default en vez de
romper el arranque: una variable mal escrita no debe impedir que el servicio
arranque, sólo que use un valor no declarado.

## Observabilidad

| Variable          | Requerida | Comportamiento                                                                                                                                                                    |
| ----------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `METRICS_TOKEN`   | No        | Bearer de `GET /metrics` (Prometheus), mínimo 16 caracteres. **Sin él el endpoint responde 404, no 401**: un 401 confirmaría que existe y que hay algo detrás. Desactivado por defecto. |
| `SENTRY_DSN`      | No        | Activa el adaptador HTTP compatible con Sentry (sin dependencia nueva; envío por `fetch`). **Sin él el reporte de errores es INERTE**: cero red, mismo comportamiento en specs y en desarrollo. Un DSN ilegible no tumba el arranque: se registra el motivo —nunca el DSN— y se cae al adaptador nulo. |
| `RELEASE_VERSION` | No        | Etiqueta `release` de los reportes. Se acepta también `GIT_SHA`.                                                                                                                   |
| `HOSTNAME`        | No        | `server_name` de los reportes; lo suele poner el orquestador.                                                                                                                     |

Todo lo que sale por el reporter pasa por saneo (`observability/scrub.ts`):
correos, URLs con credenciales, cabeceras `Authorization`/`Cookie`, JWT, UUID
de tenant, hashes y firmas se redactan antes de cruzar el proceso.

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
