# Despliegue en Railway — configuración y operación

> Estado: **configuración autorada y verificada localmente; el despliegue real
> requiere la cuenta Railway del titular** (`OWNER ACTION: RAILWAY`). Nada de
> este documento sustituye a `DEPLOYMENT.md` (imágenes, digests, orden de
> despliegue) ni a `RUNBOOK.md` (operación día a día); esto es el mapa de esos
> mismos artefactos sobre la plataforma Railway.

## Aviso de vigencia (verificado 2026-08-26 contra la documentación oficial)

Railway declara **deprecado** el config-as-code (`railway.json`/`railway.toml`):
los archivos existentes siguen funcionando para servicios ya creados **hasta el
2026-12-01**, y la vía recomendada pasa a ser *Infrastructure as Code*
(`.railway/railway.ts`, TypeScript, evaluado por la CLI de Railway, hoy
experimental). Decisión de esta campaña:

- Se autoran los `railway.json` por servicio (esquema publicado en
  `https://railway.com/railway.schema.json`), que es la vía **estable** hoy y
  documentada, y funcionan al crear los servicios antes de la fecha límite.
- La migración a `.railway/railway.ts` exige añadir el SDK de TypeScript de
  Railway como dependencia (revisión de licencia + SBOM) y una CLI autenticada
  con la cuenta del titular: se registra como trabajo futuro explícito, no se
  hace a medias aquí.

## Topología de servicios

| Servicio | Imagen | Config | Puerto | Health |
| --- | --- | --- | --- | --- |
| `valle-api` | `apps/api/Dockerfile` (multi-stage, non-root, dumb-init) | `apps/api/railway.json` | 4000 (`PORT` lo inyecta Railway) | `GET /health` |
| `valle-web` | `apps/web/Dockerfile` (Next standalone, non-root) | `apps/web/railway.json` | 3000 (`PORT`) | `GET /` |
| `postgres` | Plugin PostgreSQL 16 de Railway | — | — | del plugin |

En Railway ambos servicios apuntan al MISMO repositorio; el «Root Directory»
queda en `/` (las imágenes se construyen desde la raíz del monorepo — los
Dockerfiles ya esperan ese contexto) y el «Config File Path» de cada servicio
apunta a su `railway.json` con ruta absoluta del repo
(`/apps/api/railway.json`, `/apps/web/railway.json`), porque Railway NO
resuelve el config relativo al root directory.

### Worker / outbox

El dispatcher del outbox corre **dentro del proceso de la API**
(`OUTBOX_DISPATCHER_ENABLED=true`), con leases anti-doble-entrega en
PostgreSQL — por diseño admite múltiples réplicas sin duplicar entregas
(`apps/api/src/modules/commercial/outbox-worker.service.ts`). No hace falta un
servicio aparte para operarlo; si el volumen de correo lo pidiera, un segundo
servicio con la misma imagen y `startCommand` idéntico escala el drenaje sin
cambio de código. La API **se niega a arrancar** en producción sin la
configuración de outbox completa (webhooks firmados + secreto), así que un
despliegue a medias no envía correo en silencio: no arranca.

## Migraciones: pre-deploy, fail-closed

`apps/api/railway.json` declara
`preDeployCommand: ["node apps/api/dist/scripts/run-migrations.js"]`. El
script (`apps/api/src/scripts/run-migrations.ts`) reusa `ormOptions()` — misma
URL, mismo SSL, misma lista de migraciones que el arranque — y:

- aplica cada migración pendiente en su propia transacción,
- sale `0` sólo si todas aplicaron; cualquier error sale `1` y **aborta el
  despliegue con el servicio anterior intacto**,
- es idempotente (segunda corrida: «nada pendiente»).

Verificado localmente contra PostgreSQL 16.13 (2026-08-26): base vacía → 26
migraciones aplicadas, exit 0; re-corrida → exit 0 sin cambios; base
inalcanzable → exit 1.

## Variables por servicio

La API falla cerrada si falta configuración productiva (ver
`scripts/deploy/production-startup-smoke.mjs`, que CI ejecuta contra el dist
compilado). Mínimo para `valle-api`:

- `DATABASE_URL` = referencia al plugin (`${{Postgres.DATABASE_URL}}`)
- `NODE_ENV=production`, `SYNCHRONIZE=false` (explícito, obligatorio)
- `IDENTITY_RATE_LIMIT_KEY_SECRET` (secreto ≥32 chars)
- `OUTBOX_DISPATCHER_ENABLED=true` + `OUTBOX_*_WEBHOOK_URL`/`SECRET`
  (transporte firmado del correo transaccional)
- `ALLOWED_ORIGIN=https://<dominio-web>`
- Stripe (si se activa cobro): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  precios — sin ellas el checkout degrada declarado (`checkout_unavailable`).
- Sentry/observabilidad: `SENTRY_DSN` (si el titular la contrata).

Para `valle-web` (en BUILD, porque Next las inlinea): `NEXT_PUBLIC_API_URL`
apuntando al dominio de la API y las `NEXT_PUBLIC_BRAND_*`. En Railway estas
van como variables del servicio **antes** del primer build.

Los secretos viven en Railway (variables cifradas), nunca en git — el gate de
gitleaks del CI vigila el historial completo.

## Staging y producción

Dos *environments* de Railway sobre el mismo proyecto (`staging`,
`production`) con variables separadas y bases separadas. `staging` despliega
de la rama `main` en automático; `production` con aprobación manual del
titular. Dominios: `app.<dominio>` (web) y `api.<dominio>` (API) — TLS lo
emite Railway al verificar el CNAME (`OWNER ACTION: DNS`).

## Seguridad HTTP del frontend

Las cabeceras (CSP compatible con Next, HSTS, `frame-ancestors 'none'`,
`Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`) las sirve
el propio servidor web del producto (`apps/web/next.config.ts`, `headers()`),
de modo que no dependen de configurar un proxy de Railway y la suite E2E
navega con ellas puestas — un permiso de CSP que faltara rompería los goldens
que exigen cero errores de consola. La API sirve las suyas en
`apps/api/src/bootstrap/production-hardening.ts` (con spec propio).

## Backups, restore y rollback

- **Backup**: el plugin PostgreSQL de Railway hace snapshots; ADEMÁS
  `npm run ops:backup` (pg_dump lógico verificado) se programa como servicio
  cron de Railway o desde fuera. El doble carril es deliberado: el snapshot
  restaura la plataforma; el dump lógico restaura los DATOS en cualquier otra
  parte.
- **Restore ensayado**: `npm run ops:restore-verify` restaura el dump en una
  base limpia y verifica invariantes. Ensayado localmente contra PostgreSQL
  16.13 como parte de esta campaña (ver bitácora COMMERCIAL-RC1).
- **Rollback**: Railway conserva despliegues anteriores — «Redeploy» del
  despliegue previo revierte la aplicación; el esquema sigue la política de
  `DEPLOYMENT.md` (migraciones hacia delante; las incompatibles exigen la
  pareja expand/contract documentada ahí).

## OWNER ACTIONS (Railway)

1. `OWNER ACTION: RAILWAY` — crear proyecto, conectar el repo, crear los dos
   servicios con sus Config File Paths, añadir el plugin PostgreSQL 16 y las
   variables de arriba. Sin esto no existe URL que probar.
2. `OWNER ACTION: DNS` — CNAMEs de `app.` y `api.` al dominio del titular.
3. `OWNER ACTION: SMTP/CORREO` — credenciales del transporte real de correo
   transaccional (el outbox firma y entrega a un receptor HTTPS del titular).
4. `OWNER ACTION: SENTRY` — DSN si se contrata observabilidad externa.
5. `OWNER ACTION: STRIPE LIVE` — claves live y autorización de cobro real.
