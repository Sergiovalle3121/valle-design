# Despliegue

## Artefactos y dependencias

Valle Design despliega un API NestJS, un web Next.js y PostgreSQL 16. Usa
Node.js 20.x y npm 10. `npm ci` debe consumir el lockfile sin modificaciones y
`npm run build` construye contratos, SDK, API y web.

`NEXT_PUBLIC_API_URL` se incorpora al bundle de Next.js durante el build. Debe
apuntar al origen público exacto del API antes de construir; cambiar sólo la
variable del proceso web después no reescribe el bundle.

## Configuración mínima de producción

- `NODE_ENV=production`.
- `DATABASE_URL` o el grupo `DB_HOST`, `DB_PORT`, `DB_USERNAME`,
  `DB_PASSWORD`, `DB_DATABASE` para PostgreSQL 16.
- `SYNCHRONIZE=false`. El runtime productivo ejecuta migraciones cuando la
  sincronización está apagada; también se recomienda ejecutarlas como un paso
  explícito y observable antes del rollout.
- `IDENTITY_RATE_LIMIT_KEY_SECRET` aleatorio, compartido entre réplicas y de al
  menos 32 caracteres.
- `ALLOWED_ORIGIN` con el/los orígenes web exactos y sin path.
- `OUTBOX_DISPATCHER_ENABLED=true`, dos URLs webhook HTTPS, un secreto webhook
  de al menos 32 caracteres y timeouts apropiados.
- `NEXT_PUBLIC_API_URL` para el build web.

Consulta `docs/guides/environment-variables.md` para nombres, límites y
variables opcionales. Los secretos deben provenir de un gestor de secretos, no
de una imagen, un archivo versionado ni argumentos visibles del proceso.

## Secuencia de release

1. Toma un backup consistente de PostgreSQL y completa una restauración de
   prueba. Registra RPO/RTO y versión; no basta con verificar que `pg_dump`
   terminó.
2. En un entorno efímero o staging, ejecuta `npm ci`, contrato/SDK, build,
   typecheck, tests, lint, audit, SBOM, licencias y gitleaks.
3. Crea una base PostgreSQL 16 vacía y aplica toda la cadena de migraciones.
   Ejecuta también la prueba de upgrade sobre datos previos y el down/up de las
   migraciones nuevas que se pretenda revertir.
4. Ejecuta las suites `*.pg.spec.ts` con
   `REQUIRE_POSTGRES_TESTS=true` y el smoke del API compilado contra el esquema
   migrado.
5. Construye el web con `NEXT_PUBLIC_API_URL` productivo. Ejecuta el recorrido
   Playwright sin interceptar la API contra PostgreSQL real en Chromium y
   Firefox.
6. Verifica ambos receptores de outbox en staging: firma sobre raw body,
   frescura, deduplicación de reintentos y aceptación durable antes de 2xx.
7. Aplica migraciones productivas como paso único. Despliega primero una versión
   compatible con el esquema existente y luego API/web; evita que varias
   réplicas intenten DDL incompatible simultáneamente.
8. Comprueba `/health`, registro/verificación/login, creación y cambio de
   organización, trial/entitlement, un save CAS, reapertura, archivo >1 MB,
   versión, export DXF y entrega de outbox.

## TLS, cookies y proxy

Termina TLS en un proxy confiable que sobrescriba `X-Forwarded-Proto=https` y
`X-Forwarded-For`. El API confía en un salto. Si `req.secure` resulta falso en
producción, la emisión de `__Host-valle_session` falla cerrada. No relajes la
cookie para ocultar una configuración de proxy incorrecta.

Usa TLS verificable para PostgreSQL cuando el proveedor ofrezca una CA y activa
`DB_SSL_STRICT=true`. La configuración relajada puede ser necesaria en algunos
PaaS con certificados internos, pero debe quedar como riesgo explícito.

## Outbox en producción

El worker vive en el proceso API. Varias réplicas son compatibles porque
PostgreSQL asigna leases con `SKIP LOCKED`. El receptor de email y el receptor
de eventos pueden usar la misma URL, pero ambas variables son obligatorias. La
entrega es at-least-once; la deduplicación downstream por `Idempotency-Key` es
parte del contrato operativo, no una optimización opcional.

Monitorea backlog por cola/estado, edad del pendiente más antiguo, reintentos,
filas `dead`, leases perdidos y latencia del receptor sin exportar PII.

## Rollback

Un rollback de aplicación sólo es seguro mientras la versión anterior sea
compatible con el esquema ya aplicado. Prefiere expandir/migrar/contraer en
releases separados. Si una migración nueva tiene un `down` probado y no hubo
escrituras incompatibles, ejecútalo durante una ventana controlada; de lo
contrario corrige hacia delante.

Para restaurar datos, detén escrituras, conserva un snapshot forense, restaura
el dump completo en una base nueva, valida identidad, organizaciones, blobs,
versiones, CAS y outboxes y conmuta la conexión. No mezcles una base con blobs
de otro instante ni restaures sobre producción activa. Sigue
`docs/guides/backup-restore.md` y `RUNBOOK.md`.

`docker-compose.yml` es sólo infraestructura local: tiene credenciales
conocidas y levanta MinIO, aunque el runtime actual almacena blobs en
PostgreSQL. No es una receta productiva.
