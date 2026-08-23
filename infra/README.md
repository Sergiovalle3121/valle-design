# Infraestructura de despliegue (VPS único)

Producción de Valle Design en un VPS con Docker Compose + Caddy: la
arquitectura más pequeña que cumple los invariantes del producto (HTTPS con
`X-Forwarded-Proto` para la cookie `__Host-`, PostgreSQL 16, worker de
outbox, receptor de correo en la misma API). Piezas:

| Archivo               | Qué es                                                        |
| --------------------- | ------------------------------------------------------------- |
| `compose.prod.yml`    | postgres16 + api + web + caddy; imágenes por variable/digest   |
| `Caddyfile`           | TLS automático; `api.DOMAIN`, `app.DOMAIN` (+ `-staging`)      |
| `compose.staging.yml` | proyecto aparte: BD propia, Stripe test, colgado del mismo Caddy |

El procedimiento de despliegue (orden, migraciones, rollback) es
`DEPLOYMENT.md` en la raíz del repo; este README cubre lo que el VPS
necesita tener puesto ANTES.

## Preparar el VPS (una vez)

```bash
# Docker + compose plugin (Debian/Ubuntu)
curl -fsSL https://get.docker.com | sh

# Estructura
sudo mkdir -p /srv/valle/backups /srv/valle/staging
cd /srv/valle

# Copia compose.prod.yml y Caddyfile de este directorio a /srv/valle/
# (y compose.staging.yml si se usa staging), p. ej.:
#   scp infra/compose.prod.yml infra/Caddyfile usuario@vps:/srv/valle/

# El repo (o al menos scripts/ops/) para backups y replay — necesitan
# Node 20+ y cliente PostgreSQL 16 en el host:
git clone https://github.com/<org>/valle-design.git /srv/valle/repo
sudo apt-get install -y nodejs postgresql-client-16   # o Node por nvm/nodesource

# GHCR: sólo si las imágenes son privadas
docker login ghcr.io -u <usuario> -p <token-solo-read:packages>
```

DNS antes de arrancar: `api.DOMAIN` y `app.DOMAIN` (y los `-staging` si se
usan) apuntando a la IP del VPS. Sin DNS no hay certificado TLS, y sin TLS
la API no emite sesión — falla cerrada, a propósito.

## Checklist COMPLETO de variables de producción (`/srv/valle/.env`)

Ocho grupos. Los seis primeros los consume `compose.prod.yml` (las
obligatorias con `:?`: si falta una, compose falla con su nombre); el grupo
del web se consume EN EL BUILD de la imagen, y el de CFDI se queda vacío a
propósito. Copia, rellena y guarda como `/srv/valle/.env` con `chmod 600`
— este archivo es el gestor de secretos de un VPS de una persona: nunca se
versiona, nunca se copia a la imagen.

```bash
# ── 0 · Dominio e imágenes ──────────────────────────────────────────────────
DOMAIN=valledesign.mx
ACME_EMAIL=tu-correo@valledesign.mx
# Del release-manifest.json del release desplegado — digest, no tag:
API_IMAGE=ghcr.io/<org>/valle-design/api@sha256:<digest>
WEB_IMAGE=ghcr.io/<org>/valle-design/web@sha256:<digest>
RELEASE_VERSION=v0.2.0

# ── 1 · Base de datos (PostgreSQL 16 del propio compose) ────────────────────
POSTGRES_DB=valle_design
POSTGRES_USER=valle
POSTGRES_PASSWORD=<openssl rand -hex 24>
# DATABASE_URL la compone compose.prod.yml a partir de estas tres.
# SYNCHRONIZE=false ya lo fija el compose: no es opinable.

# ── 2 · Identidad ───────────────────────────────────────────────────────────
# ≥32 caracteres, IGUAL en todas las réplicas (aquí hay una):
IDENTITY_RATE_LIMIT_KEY_SECRET=<openssl rand -hex 32>

# ── 3 · CORS ────────────────────────────────────────────────────────────────
# ALLOWED_ORIGIN lo compone el compose: https://app.${DOMAIN}, exacto y sin
# path. Si el web vive en otro origen, edita compose.prod.yml — es la única
# variable de este grupo y va atada al dominio.

# ── 4 · Outbox (worker + receptor en la misma API, ADR-0008) ────────────────
# Las URLs las compone el compose (https://api.${DOMAIN}/v1/outbox/...).
# El secreto firma cada entrega; ≥32 caracteres:
OUTBOX_WEBHOOK_SECRET=<openssl rand -hex 32>

# ── 5 · Correo saliente (Resend) — o las 4 o ninguna ────────────────────────
EMAIL_SENDER_PROVIDER=resend
EMAIL_SENDER_API_KEY=re_<clave>
EMAIL_SENDER_FROM=Valle Design <no-responder@valledesign.mx>
# OUTBOX_EMAIL_LINK_BASE_URL la compone el compose: https://app.${DOMAIN}.
# El dominio del FROM debe estar VERIFICADO en Resend antes del primer envío.

# ── 6 · Stripe — o las 4 o NINGUNA (vacías = cobro asistido, válido) ────────
STRIPE_SECRET_KEY=sk_live_<clave>
STRIPE_WEBHOOK_SECRET=whsec_<del endpoint apuntando a https://api.DOMAIN/v1/commercial/webhooks/stripe>
STRIPE_CHECKOUT_SUCCESS_URL=https://app.valledesign.mx/cuenta/facturacion/retorno
STRIPE_CHECKOUT_CANCEL_URL=https://app.valledesign.mx/precios
# En el dashboard además: activar OXXO y SPEI (cuenta MX), configurar el
# Customer Portal, y suscribir los 8 eventos que lista
# docs/guides/environment-variables.md § «Pasarela de pagos».

# ── 7 · Web: TODO NEXT_PUBLIC_* va INCRUSTADO en la imagen ──────────────────
# NINGUNA de estas es una variable de este .env: se fijan al CONSTRUIR la
# imagen del web (release.yml → repository variables `vars.RELEASE_*`). Una
# imagen construida con otro valor llama al host equivocado, o publica la
# marca/contacto equivocados, desde el navegador del cliente — y no deja
# traza en ningún log del servidor.
#
# NEXT_PUBLIC_API_URL           → vars.RELEASE_API_URL
#
# Obligatorias — el build corre check:production-config y revienta si
# quedan en su default de desarrollo (dominio *.invalid):
# NEXT_PUBLIC_BRAND_WEBSITE_URL   → vars.RELEASE_BRAND_WEBSITE_URL
# NEXT_PUBLIC_BRAND_SUPPORT_EMAIL → vars.RELEASE_BRAND_SUPPORT_EMAIL
# NEXT_PUBLIC_BRAND_SALES_EMAIL   → vars.RELEASE_BRAND_SALES_EMAIL
# NEXT_PUBLIC_BRAND_PRIVACY_EMAIL → vars.RELEASE_BRAND_PRIVACY_EMAIL
#
# Opcionales, con default seguro (nombre, fundador, descriptor, taglines,
# copyright, estado marcario, logos, nombre de producto, enlaces comerciales
# y URL del sitio): ver el bloque `build-args` de release.yml para la lista
# completa de repository variables `vars.RELEASE_*` que las alimentan.

# ── 8 · CFDI: VACÍAS a propósito (emisión manual al inicio) ─────────────────
CFDI_PAC_NAME=
CFDI_PAC_API_KEY=
CFDI_ISSUER_RFC=
CFDI_ISSUER_TAX_REGIME=
# Con las 4 puestas el arranque FALLA hasta que exista adaptador de PAC:
# credenciales puestas sin adaptador harían creer que el producto ya timbra.

# ── Opcionales que conviene poner el día 1 ──────────────────────────────────
# Sin METRICS_TOKEN, /metrics responde 404 y monitor.yml no puede medir:
METRICS_TOKEN=<openssl rand -hex 24>
SENTRY_DSN=
```

Comprobación en frío, sin arrancar nada:

```bash
cd /srv/valle && docker compose -f compose.prod.yml config >/dev/null \
  && echo "variables completas"
```

## Primer arranque

```bash
cd /srv/valle
docker compose -f compose.prod.yml pull
# Migraciones como paso explícito, con la MISMA imagen (DEPLOYMENT.md §3.2):
docker compose -f compose.prod.yml run --rm api \
  npx typeorm migration:run -d apps/api/dist/typeorm-cli.datasource.js
docker compose -f compose.prod.yml up -d
curl -fsS https://api.$DOMAIN/health/ready   # 200 {"migrations":"up-to-date"}
```

Después del primer arranque: programar el cron de backups
(`RUNBOOK.md` § «Backups programados») y poner los secrets
`MONITOR_METRICS_URL`/`MONITOR_METRICS_TOKEN` en GitHub para que
`monitor.yml` vigile los umbrales del SLA.

## Staging (mismo VPS, proyecto aparte)

`/srv/valle/staging/.env` con la MISMA estructura y estas diferencias, que
son la razón de que staging exista:

- `POSTGRES_DB=valle_design_staging` + secretos PROPIOS (rate-limit y
  outbox distintos de producción);
- Stripe en modo TEST: `sk_test_…` y el `whsec_` de un endpoint de webhook
  de test apuntando a `https://api-staging.DOMAIN/...`;
- `WEB_IMAGE` construida con `NEXT_PUBLIC_API_URL=https://api-staging.DOMAIN`
  (la imagen de producción llamaría a la API real desde el navegador);
- sin puertos del host: cuelga del Caddy de producción por la red
  compartida `valle-edge` (los bloques `-staging` ya están en el Caddyfile).

```bash
cd /srv/valle/staging
docker compose -f ../compose.staging.yml pull
docker compose -f ../compose.staging.yml run --rm api \
  npx typeorm migration:run -d apps/api/dist/typeorm-cli.datasource.js
docker compose -f ../compose.staging.yml up -d
curl -fsS https://api-staging.$DOMAIN/health/ready
```

## Qué NO hay aquí, y por qué

- **Kubernetes/multi-nodo:** los ejemplos de `DEPLOYMENT.md` §3.3 con
  `kubectl` describen la forma general; este directorio es la instancia
  mínima real. Migrar a un orquestador es cambiar la instancia, no el
  procedimiento.
- **Secretos en archivos versionados:** ninguno. `/srv/valle/.env` vive
  sólo en el VPS con `chmod 600`.
- **Réplica de PostgreSQL:** el SLA declara sin réplica en caliente (§6);
  la protección real es el cron de backups VERIFICADOS + subida a R2.
