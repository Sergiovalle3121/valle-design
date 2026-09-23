# Despliegue en Railway — configuración y operación

> Estado: **configuración autorada y verificada localmente; el despliegue real
> requiere la cuenta Railway del titular** (`OWNER ACTION: RAILWAY`). Nada de
> este documento sustituye a `DEPLOYMENT.md` (imágenes, digests, orden de
> despliegue) ni a `RUNBOOK.md` (operación día a día); esto es el mapa de esos
> mismos artefactos sobre la plataforma Railway.

## Aviso de vigencia (revisado 2026-09-23 contra la documentación oficial)

Railway declara **deprecado** el config-as-code (`railway.json`/`railway.toml`):
los archivos existentes siguen funcionando para servicios que **ya los usaban**
hasta el 2026-12-01, pero **un servicio nuevo ya no puede optar por Config as
Code**. Railway recomienda *Infrastructure as Code* (`.railway/railway.ts`).
Este repositorio aún conserva los dos `railway.json`; para un servicio nuevo,
reproduce su configuración en el panel de Railway o prepara una migración
revisada a la vía actual. No supongas que Railway leyó esos archivos ni que
ejecutó las migraciones: compruébalo en el detalle del despliegue. Fuente:
[Railway Config as Code](https://docs.railway.com/config-as-code).

## Topología de servicios

| Servicio | Imagen | Config | Puerto | Health |
| --- | --- | --- | --- | --- |
| `valle-api` | `apps/api/Dockerfile` (multi-stage, non-root, dumb-init) | `apps/api/railway.json` | 4000 (`PORT` lo inyecta Railway) | `GET /health` |
| `valle-web` | `apps/web/Dockerfile` (Next standalone, non-root) | `apps/web/railway.json` | 3000 (`PORT`) | `GET /` |
| `postgres` | Plugin PostgreSQL 16 de Railway | — | — | del plugin |

En Railway ambos servicios apuntan al MISMO repositorio; el «Root Directory»
queda en `/` (las imágenes se construyen desde la raíz del monorepo — los
Dockerfiles ya esperan ese contexto). **Sólo si el servicio existente sigue
usando Config as Code**, su «Config File Path» apunta a
`/apps/api/railway.json` o `/apps/web/railway.json`; Railway no resuelve esa
ruta relativa al root directory. En servicios nuevos, configura en Railway los
mismos Dockerfile, comandos y healthchecks o usa Infrastructure as Code.

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
`preDeployCommand: ["node apps/api/dist/scripts/run-migrations.js"]` para
servicios existentes que aún lo aplican. En un servicio nuevo, establece ese
comando en la configuración de Railway. El
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
- `IDENTITY_MFA_ENCRYPTION_KEY` (secreto ≥32 chars) — cifra en reposo el
  secreto del segundo factor; el arranque muere sin ella
  (`apps/api/src/modules/identity/identity-mfa.ts`, verificado en
  `scripts/deploy/production-startup-smoke.mjs`).
- `OUTBOX_DISPATCHER_ENABLED=true` + `OUTBOX_*_WEBHOOK_URL`/`SECRET`
  (transporte firmado del correo transaccional)
- `ALLOWED_ORIGIN=https://<dominio-web>`
- `CSRF_COOKIE_DOMAIN=.<dominio-base>` cuando web y API usan subdominios
  distintos (ejemplo: `.vallecad.com` para `vallecad.com` y
  `api.vallecad.com`); sin ella el navegador no deja al web leer
  `valle_csrf` y las mutaciones responden `csrf_invalid`.
- Stripe (si se activa cobro): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_CHECKOUT_SUCCESS_URL` y `STRIPE_CHECKOUT_CANCEL_URL`. Los precios
  viven en `plan_prices`, no en variables de Stripe.
- Correo transaccional (**obligatorio en producción**): `EMAIL_SENDER_PROVIDER`,
  `EMAIL_SENDER_API_KEY`, `EMAIL_SENDER_FROM`, `OUTBOX_EMAIL_LINK_BASE_URL` —
  sin ellas la API no arranca; fuera de producción el receptor responde 503 y
  el correo espera en el outbox
  (`apps/api/src/modules/outbox-receiver/email-sender.config.ts`).
- Sentry/observabilidad: `SENTRY_DSN` (si el titular la contrata).

Para `valle-web` (en BUILD, porque Next las inlinea): `NEXT_PUBLIC_API_URL`
apuntando al dominio de la API y las `NEXT_PUBLIC_BRAND_*`. En Railway estas
van como variables del servicio **antes** del primer build.

Los secretos viven en Railway (variables cifradas), nunca en git — el gate de
gitleaks del CI vigila el historial completo.

## Staging y producción

La topología **prevista**, pendiente de comprobar en la cuenta del titular, es
dos *environments* de Railway (`staging` y `production`) con variables y bases
separadas. No se ha verificado desde el repositorio qué rama despliega ni si
hay aprobación manual. Para VALLECAD, los dominios objetivo son
`vallecad.com` (web) y `api.vallecad.com` (API). Railway indica registros de
ruta **y un TXT de verificación** para cada dominio; el ápice requiere CNAME
flattening/ALIAS/ANAME según el proveedor DNS, no una IP A fija. Ver
[dominios Railway](https://docs.railway.com/networking/domains/working-with-domains).

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
   servicios con Dockerfiles y comandos adecuados para servicios nuevos,
   añadir PostgreSQL 16 y las variables de arriba. Sin esto no existe URL que
   probar.
2. `OWNER ACTION: DNS` — apuntar el ápice y `api.` con los registros de ruta y
   TXT que Railway muestre; confirmar HTTPS en ambos.
3. `OWNER ACTION: RESEND` — dominio verificado y `EMAIL_SENDER_API_KEY`; el
   receptor es `/v1/outbox/*` de la propia API (ADR-0008).
4. `OWNER ACTION: SENTRY` — DSN si se contrata observabilidad externa.
5. `OWNER ACTION: STRIPE LIVE` — claves live y autorización de cobro real.

Lista de nombres, lectores, ejemplos y pruebas sin secretos:
[`docs/onboarding/VARIABLES-LANZAMIENTO.md`](../onboarding/VARIABLES-LANZAMIENTO.md).

## Inventario de variables de marca (2026-09-16)

### GitHub Actions

Verificado contra `gh api repos/Sergiovalle3121/valle-design/actions/variables`
sobre main (6ae2ad62): `{"variables":[],"total_count":0}`. El owner es
`"type":"User"` (no hay variables de organización). El job `release` de
`.github/workflows/release.yml:58` no declara `environment:`, así que el
environment `honest-possibility / production` no aporta `vars` a los
build-args.

**Conclusión GitHub:** todas las `vars.RELEASE_BRAND_*` resuelven a vacío →
el default del código manda en los builds de CI.

### Railway (OWNER ACTION: RAILWAY pendiente)

Las 17 variables `NEXT_PUBLIC_BRAND_*` que `resolveBrandManifest` acepta
(como ARG en `apps/web/Dockerfile:90,105`):

| Clave | GitHub | Railway staging | Railway production |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_BRAND_NAME` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_LEGAL_ENTITY` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_FOUNDER` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_DESCRIPTOR` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_TAGLINE_EN` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_TAGLINE_ES` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_SUPPORT_EMAIL` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_SALES_EMAIL` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_PRIVACY_EMAIL` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_WEBSITE_URL` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_COPYRIGHT` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_COPYRIGHT_YEAR` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_TRADEMARK_STATUS` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_TRADEMARK_SYMBOL` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_LOGO_MARK` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_LOGO_ICON` | vacía | **PENDIENTE** | **PENDIENTE** |
| `NEXT_PUBLIC_BRAND_PRODUCT_NAME_DESIGN` | vacía | **PENDIENTE** | **PENDIENTE** |

**Conclusión provisional:** en GitHub ninguna variable pisa el default. En
Railway falta verificar; si alguna `NEXT_PUBLIC_BRAND_*` fija «Valle Design»,
el default del código NO manda en producción. **No cambiar variables hasta
tener el inventario completo.**
