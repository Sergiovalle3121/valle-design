# Despliegue

Este documento es un PROCEDIMIENTO, no una descripción. Cada paso lleva su
comando exacto y la comprobación que dice si funcionó. Si un paso no se puede
verificar, no está en esta lista.

Regla que gobierna todo lo demás: **lo que se despliega es una imagen
identificada por su digest, construida desde un commit**. No una rama, no un
`git pull` en un servidor, no un `npm run build` en producción.

---

## 1 · Artefactos

| Artefacto | Origen                | Cómo se construye                                            |
| --------- | --------------------- | ------------------------------------------------------------ |
| Imagen API | `apps/api/Dockerfile` | multistage, runtime `node:20-bookworm-slim`, usuario `node`  |
| Imagen web | `apps/web/Dockerfile` | Next.js `standalone`, usuario `node`                         |
| SBOM       | `npm run sbom`        | CycloneDX del árbol de PRODUCCIÓN (sin dev)                  |
| Manifiesto | `.github/workflows/release.yml` | versión, commit, digests y última migración        |

Las dos imágenes cumplen invariantes verificados en CI
(`scripts/deploy/validate-dockerfiles.mjs`, job `deploy-readiness`): usuario no
root, `NODE_ENV=production`, `HEALTHCHECK`, `npm ci` contra el lockfile, init
real como PID 1, versión de Node igual a `.nvmrc` y **cero secretos
embebidos**.

```bash
# Verificación local, sin red y en segundos
node scripts/deploy/validate-dockerfiles.mjs
```

### La imagen del web es específica del entorno

TODA variable `NEXT_PUBLIC_*` (API, marca, enlaces comerciales, URL del
sitio) **se incrusta en el bundle durante el build**. No es configuración de
runtime: cambiarla en el proceso no reescribe el JavaScript ya emitido.
Consecuencia operativa: la imagen de web de staging **no sirve** para
producción. Si se despliega igualmente, el navegador del cliente llamará al
host equivocado (o mostrará la marca/contacto equivocados) y **no habrá
ninguna traza en los logs del servidor**.

```bash
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.tu-dominio.com \
  --build-arg NEXT_PUBLIC_BRAND_WEBSITE_URL=https://tu-dominio.com \
  --build-arg NEXT_PUBLIC_BRAND_SUPPORT_EMAIL=soporte@tu-dominio.com \
  --build-arg NEXT_PUBLIC_BRAND_SALES_EMAIL=ventas@tu-dominio.com \
  --build-arg NEXT_PUBLIC_BRAND_PRIVACY_EMAIL=privacidad@tu-dominio.com \
  -t valle-design/web:$VERSION .
```

Las cuatro variables de marca del ejemplo son **obligatorias**: el build
corre `npm run check:production-config --workspace=web` con
`NODE_ENV=production` ya fijado y revienta si alguna sigue en su default de
desarrollo (`*.invalid`) o lleva un marcador de plantilla sin completar. El
resto de `NEXT_PUBLIC_BRAND_*` y de los enlaces comerciales
(`NEXT_PUBLIC_SALES_URL`, `..._DOCUMENTATION_URL`, etc. — ver
`apps/web/Dockerfile` para la lista completa) es opcional y cae a un default
seguro.

### Construir el release completo

```bash
# Con etiqueta (release de verdad): dispara .github/workflows/release.yml
git tag v0.2.0 && git push origin v0.2.0

# Ensayo sin publicar imágenes:
gh workflow run release.yml \
  -f publicar_imagenes=false \
  -f api_url=https://api.tu-dominio.com
```

El workflow produce `release-manifest.json` (versión, commit, **digests** y
última migración) y `sbom.cdx.json`. Guarda ambos: son la respuesta a «¿qué
está corriendo exactamente?».

---

## 2 · Variables obligatorias

Sin estas, **el proceso no arranca**, y eso es deliberado: un servicio que
arranca mal es peor que uno que no arranca, porque nadie recibe una alerta.
El smoke `scripts/deploy/production-startup-smoke.mjs` lo comprueba en CI.

| Variable                         | Valor                          | Qué pasa si falta                                |
| -------------------------------- | ------------------------------ | ------------------------------------------------ |
| `NODE_ENV`                       | `production`                   | cookies inseguras, guards desactivados           |
| `DATABASE_URL`                   | URL PostgreSQL 16              | **el arranque muere** (no hay respaldo a SQLite) |
| `SYNCHRONIZE`                    | `false` EXACTO                 | **el arranque muere** (no se asume por omisión)  |
| `IDENTITY_RATE_LIMIT_KEY_SECRET` | ≥32 chars, igual en réplicas   | **el arranque muere**                            |
| `ALLOWED_ORIGIN`                 | origen web exacto, sin path    | todo cross-origin se rechaza                     |
| `OUTBOX_DISPATCHER_ENABLED`      | `true`                         | **el arranque muere**                            |
| `OUTBOX_EMAIL_WEBHOOK_URL`       | HTTPS absoluta (puede ser esta misma API: `/v1/outbox/email`) | el worker no puede entregar |
| `OUTBOX_DOMAIN_WEBHOOK_URL`      | HTTPS absoluta (ídem: `/v1/outbox/domain`) | ídem                                 |
| `OUTBOX_WEBHOOK_SECRET`          | ≥32 chars, igual en receptores | firmas inválidas                                 |
| `EMAIL_SENDER_PROVIDER`          | `resend` (o ninguna de las 4)  | receptor de email responde 503; el correo espera en el outbox |
| `EMAIL_SENDER_API_KEY`           | clave del proveedor            | ídem — **a medias, el arranque muere**           |
| `EMAIL_SENDER_FROM`              | remitente con dominio verificado | ídem — **a medias, el arranque muere**         |
| `OUTBOX_EMAIL_LINK_BASE_URL`     | origen web público HTTPS       | ídem — **a medias, el arranque muere**           |
| `NEXT_PUBLIC_API_URL` (build web)| origen público del API         | el web llama al host equivocado                  |
| `NEXT_PUBLIC_BRAND_WEBSITE_URL` (build web) | URL real del sitio | `check:production-config` revienta el build (dominio de plantilla) |
| `NEXT_PUBLIC_BRAND_SUPPORT_EMAIL` (build web) | correo real de soporte | ídem |
| `NEXT_PUBLIC_BRAND_SALES_EMAIL` (build web) | correo real de ventas | ídem |
| `NEXT_PUBLIC_BRAND_PRIVACY_EMAIL` (build web) | correo real de privacidad | ídem |

Opcionales que cambian el comportamiento operativo:

| Variable                     | Default  | Efecto                                                     |
| ---------------------------- | -------- | ---------------------------------------------------------- |
| `METRICS_TOKEN`              | *(sin)*  | sin él, `GET /metrics` **y** `GET /health/metrics/commercial` responden **404** (desactivados); ambos usan el mismo bearer |
| `SENTRY_DSN`                 | *(sin)*  | sin él, el reporte de errores es **inerte** (sin red)       |
| `CFDI_PAC_NAME` (+3 vars)    | *(sin)*  | sin PAC: emisión manual honesta. `facturama` timbra vía el job del outbox (exige además `CFDI_ISSUER_POSTAL_CODE`); PAC desconocido **no arranca**. Sandbox de Facturama por default: producción real exige `CFDI_PAC_BASE_URL=https://api.facturama.mx`. Verificación sandbox del adaptador: pendiente de credenciales del dueño |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | `65000`  | debe superar el idle del balanceador (ver §6)               |
| `HTTP_HEADERS_TIMEOUT_MS`    | `70000`  | se fuerza siempre > keep-alive                              |
| `HTTP_REQUEST_TIMEOUT_MS`    | `120000` | techo de una petición                                       |
| `SHUTDOWN_DRAIN_DELAY_MS`    | `5000`   | espera con readiness en 503 antes de cerrar                 |
| `SHUTDOWN_GRACE_MS`          | `25000`  | techo del apagado; por debajo del `stopTimeout` del orquestador |
| `DB_SSL_STRICT`              | `true` en producción | la validación del certificado es el **default productivo**; `false` es la válvula de escape explícita para hosts sin CA verificable |
| `DB_POOL_SIZE`               | `20`     | tamaño del pool PostgreSQL por réplica                      |
| `DB_STATEMENT_TIMEOUT_MS`    | `30000`  | mata la query degenerada con error acotado                  |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | `30000` | mata la transacción ociosa que retiene locks          |
| `DB_LOCK_TIMEOUT_MS`         | `10000`  | techo de espera por un lock                                 |

Inventario completo: `docs/guides/environment-variables.md`. Los secretos
llegan del gestor de secretos del entorno, **nunca** de una imagen, un archivo
versionado ni argumentos visibles del proceso.

---

## 3 · Orden de despliegue

El orden importa porque el esquema y el código cambian por separado.

### 3.0 · Despliegue automático desde CI (opcional, mismo orden)

`release.yml` trae un job `deploy` que ejecuta ESTE MISMO procedimiento por
SSH contra el VPS al publicar una etiqueta: migraciones con la imagen nueva
(§3.2) → `docker compose pull` + `up -d` en `/srv/valle` (infra/README.md)
→ gate de readiness con reintentos, interno y —si `vars.RELEASE_API_URL`
está definida— externo a través de Caddy/TLS. Se despliega por **digest**
del job de release, nunca por tag.

- Se activa poniendo `DEPLOY_SSH_KEY`, `DEPLOY_HOST` y `DEPLOY_USER` en el
  environment `production` de GitHub (`DEPLOY_KNOWN_HOSTS` opcional para
  fijar la huella del host). **Sin esos secrets el job termina en verde con
  un aviso y el despliegue sigue siendo manual** — este documento no deja de
  ser el procedimiento, pasa a ser también lo que CI ejecuta.
- Si el environment `production` tiene *required reviewers*, GitHub pide
  aprobación humana antes de tocar el VPS. Configurarlo se recomienda: es la
  diferencia entre «un tag despliega» y «un tag propone desplegar».
- `deploy-staging` existe bajo `workflow_dispatch` (casillas
  `publicar_imagenes` + `desplegar_staging`) contra el proyecto compose de
  staging del mismo VPS.

### 3.1 · Antes de tocar producción

```bash
# 1 · BACKUP VERIFICADO (no vale «pg_dump terminó»)
node scripts/ops/backup.mjs --url "$DATABASE_URL" --out backups/
node scripts/ops/restore-verify.mjs --dump backups/<archivo>.dump --url "$DATABASE_URL"
# Debe imprimir: «BACKUP VALIDADO». Si no, PARA.

# 2 · Gates locales sobre el commit a desplegar
npm ci
npx redocly lint packages/contracts/specs/design-api.v1.yaml
npm run check:cad && npm run check:dwg
npm run sbom && npm run check:licenses
npx turbo run build
npm run typecheck --workspace=valle-design-api
npm test --workspace=valle-design-api
TEST_DATABASE_URL=postgres://... npm run test:pg --workspace=valle-design-api
npm run lint:check --workspace=valle-design-api

# 3 · Puertas de despliegue
node scripts/deploy/validate-dockerfiles.mjs
DATABASE_URL=postgres://... node scripts/deploy/production-startup-smoke.mjs
```

### 3.2 · Migraciones

Las migraciones se aplican **como paso único y observable**, ANTES de rotar las
réplicas. El runtime también las aplica al arrancar (`SYNCHRONIZE=false` +
`MIGRATIONS_RUN` por defecto), pero depender de eso significa que N réplicas
compiten por hacer DDL a la vez.

La imagen lleva el CLI de TypeORM (es dependencia de producción) y el
DataSource compilado, así que el paso se ejecuta con la MISMA imagen que se va
a desplegar — no con un checkout del repo en el servidor:

```bash
# Paso explícito, un solo proceso, con la imagen NUEVA
docker run --rm \
  -e DATABASE_URL="$DATABASE_URL" \
  ghcr.io/<org>/valle-design/api:$VERSION \
  npx typeorm migration:run -d apps/api/dist/typeorm-cli.datasource.js

# Comprobación: la cadena está al día
docker run --rm -e DATABASE_URL="$DATABASE_URL" \
  ghcr.io/<org>/valle-design/api:$VERSION \
  npx typeorm migration:show -d apps/api/dist/typeorm-cli.datasource.js
# Toda línea debe empezar por [X]. Una [ ] es una migración pendiente.
```

> Verificado el 2026-08-15 contra PostgreSQL 16.9 local con este comando exacto
> (`migration:show` → 17 aplicadas, `migration:run` → aplicó
> `LegalAcceptances20260815140000` y confirmó COMMIT).

Regla de compatibilidad: **expandir → migrar → contraer**, en releases
separados. Una migración que borra o renombra una columna que la versión
anterior aún lee hace que el rollback de aplicación deje de ser posible.

#### Row-Level Security por tenant (desde `TenantIntegrityRls`, 2026-08-20)

Las 8 tablas CAD tienen RLS activo con política
`tenant_id = current_setting('app.tenant_id', true)` (y en `sf_cad_blocks`,
lectura adicional del carril de sistema `tenant_id IS NULL`). Tres cosas que
el operador debe saber:

1. **El pre-check de la migración aborta si hay filas con `tenant_id NULL`**
   en las 7 tablas endurecidas — sin mutar nada. Adóptalas
   (`UPDATE … SET tenant_id = …`) o elimínalas y vuelve a desplegar. Las
   importaciones enterprise por el carril NULL de `cad_projects`/
   `cad_documents` ya no existen: toda importación asigna tenant.
2. **La política aplica hoy a todo rol NO dueño de las tablas.** La
   aplicación corre como el rol que migró (dueño) y no queda sujeta — su
   aislamiento sigue siendo el scoping de aplicación. Cualquier credencial
   secundaria (soporte, analítica, un `psql` suelto) que consulte sin
   `SET app.tenant_id` no ve NINGUNA fila: cerrado por defecto.
3. **Para que la póliza cubra también a la aplicación** (el paso de
   endurecimiento siguiente): crea un rol runtime no-dueño y despliega la API
   con él, dejando las migraciones al rol dueño —

   ```sql
   CREATE ROLE valle_app LOGIN PASSWORD '…';
   GRANT USAGE ON SCHEMA public TO valle_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO valle_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO valle_app;
   ```

   Con `DATABASE_URL` apuntando a `valle_app` y `MIGRATIONS_RUN=false` (las
   migraciones van en el paso explícito de arriba, con el rol dueño), la API
   queda sujeta a las políticas; ese cambio requiere que la capa de datos
   fije `app.tenant_id` por transacción y está pendiente de cablear — no lo
   actives sin esa pieza.

### 3.3 · Rotación de réplicas

```bash
# 1 · API primero (el web depende del contrato del API, no al revés)
kubectl set image deployment/valle-api api=ghcr.io/<org>/valle-design/api@sha256:<digest>

# 2 · Comprobar readiness ANTES de seguir
curl -fsS https://api.tu-dominio.com/health        # 200 {"status":"ok"}
curl -fsS https://api.tu-dominio.com/health/ready  # 200 {"migrations":"up-to-date"}

# 3 · Web después
kubectl set image deployment/valle-web web=ghcr.io/<org>/valle-design/web@sha256:<digest>
```

Configuración del balanceador que hace que el rollout sea invisible:

- health check apuntando a **`/health/ready`**, NO a `/health`;
- intervalo ≤ 3 s, para que 5 s de drenaje cubran al menos un ciclo;
- `terminationGracePeriodSeconds` ≥ 30 (por encima de `SHUTDOWN_GRACE_MS`).

### 3.4 · Verificación post-despliegue

```bash
curl -fsS https://api.tu-dominio.com/health/ready | jq
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" \
  https://api.tu-dominio.com/metrics | grep -E '^valle_(outbox_backlog|db_pool)'
curl -fsS https://api.tu-dominio.com/health/metrics/commercial | jq '.outbox'
```

Recorrido funcional mínimo: registro → verificación → login → crear
organización → abrir un documento CAD → guardar (CAS) → exportar DXF → una
entrega de outbox confirmada por el receptor.

---

## 4 · Rollback ENSAYADO

Tres escenarios distintos. Elegir el equivocado convierte una incidencia en
una pérdida de datos.

### 4.1 · Rollback de APLICACIÓN (el esquema sirve para ambas versiones)

Es el caso normal y el único rápido. Válido **sólo** si la versión anterior es
compatible con el esquema ya aplicado — lo cual se garantiza con
expandir/migrar/contraer, no con optimismo.

```bash
# 1 · Volver al digest anterior (guardado en el release-manifest.json previo)
kubectl set image deployment/valle-api api=ghcr.io/<org>/valle-design/api@sha256:<digest-anterior>
kubectl rollout status deployment/valle-api --timeout=120s

# 2 · Comprobar
curl -fsS https://api.tu-dominio.com/health/ready | jq '.migrations'
# → "up-to-date"  (las migraciones NUEVAS siguen aplicadas: es correcto)

# 3 · Web, si su bundle cambió
kubectl set image deployment/valle-web web=ghcr.io/<org>/valle-design/web@sha256:<digest-anterior>
```

RTO típico: el de un rollout (`kubectl rollout status`), decenas de segundos.
**No se toca la base de datos.**

### 4.2 · Rollback de ESQUEMA (revertir una migración)

Sólo si esa migración tiene `down` PROBADO y **no ha habido escrituras
incompatibles** desde que se aplicó. Si hay dudas, se corrige hacia delante.

```bash
# 1 · Parar escrituras: escalar el API a 0 réplicas
kubectl scale deployment/valle-api --replicas=0

# 2 · Backup del estado ACTUAL (antes de revertir nada)
node scripts/ops/backup.mjs --url "$DATABASE_URL" --out backups/pre-rollback/
node scripts/ops/restore-verify.mjs --dump backups/pre-rollback/<archivo>.dump

# 3 · Revertir UNA migración
docker run --rm -e DATABASE_URL="$DATABASE_URL" \
  ghcr.io/<org>/valle-design/api:$VERSION \
  npx typeorm migration:revert -d apps/api/dist/typeorm-cli.datasource.js

# 4 · Comprobar que la cadena bajó exactamente un escalón
docker run --rm -e DATABASE_URL="$DATABASE_URL" \
  ghcr.io/<org>/valle-design/api:$VERSION \
  npx typeorm migration:show -d apps/api/dist/typeorm-cli.datasource.js | tail -3
# La última debe aparecer ahora como [ ]

# 5 · Desplegar la versión anterior y restaurar réplicas
kubectl set image deployment/valle-api api=...@sha256:<digest-anterior>
kubectl scale deployment/valle-api --replicas=3
```

Ensayo de `down` verificado en este repo: la migración
`20260815140000-LegalAcceptances` se aplica, se revierte y se vuelve a aplicar
dentro de `modules/legal/legal-acceptances.pg.spec.ts`, contra PostgreSQL real.
**Una migración cuyo `down` no está en una spec no tiene `down`.**

### 4.3 · Rollback de DATOS (restaurar un backup)

Es el último recurso: **se pierde todo lo escrito desde el backup**. Ver
`RUNBOOK.md` § «Pérdida o corrupción» y `docs/guides/backup-restore.md`. Nunca
se restaura sobre la base activa; se restaura en una base **nueva** y se
conmuta la conexión.

---

## 5 · TLS, cookies y proxy

TLS termina en un proxy confiable que sobrescribe `X-Forwarded-Proto=https` y
`X-Forwarded-For`. El API confía en **un** salto (`trust proxy = 1`). Si
`req.secure` resulta falso en producción, la emisión de
`__Host-valle_session` **falla cerrada**: no se relaja la cookie para tapar un
proxy mal configurado.

Cabeceras que emite el API (`bootstrap/production-hardening.ts`):

- `Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` — la API sólo sirve JSON, así que admite la política más estricta que existe;
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` **sólo en producción** (en desarrollo fijaría localhost en el navegador durante un año); `preload` NO se activa: es una decisión de dominio con vuelta atrás de meses;
- `Cross-Origin-Resource-Policy: cross-origin` — el web es otro origen;
- `Referrer-Policy: no-referrer`.

Para PostgreSQL, usa TLS verificable y `DB_SSL_STRICT=true` cuando el proveedor
ofrezca una CA. La configuración relajada puede ser necesaria en PaaS con
certificados internos, pero queda como riesgo explícito.

---

## 6 · Timeouts: por qué esos números

| Parámetro         | Valor    | Razón                                                                                       |
| ----------------- | -------- | ------------------------------------------------------------------------------------------- |
| `keepAliveTimeout`| 65 s     | **Debe superar el idle del balanceador** (60 s en ALB/nginx). Si el servidor cierra primero, el proxy manda una petición por una conexión recién cerrada, no puede saber si se ejecutó, no la reintenta y devuelve **502**. Es la causa de los «502 esporádicos sin nada en los logs». |
| `headersTimeout`  | 70 s     | Node cuenta el plazo desde que se establece la conexión: por debajo del keep-alive mataría conexiones sanas que aún no mandaron su siguiente petición. Se fuerza siempre por encima. |
| `requestTimeout`  | 120 s    | Techo, no objetivo. Una petición colgada retiene socket, memoria y una conexión del pool.    |
| `drainDelay`      | 5 s      | Cubre al menos un ciclo de health check: es lo que tarda el balanceador en ENTERARSE del 503. |
| `shutdownGrace`   | 25 s     | Por debajo del `stopTimeout` habitual (30 s), para terminar por decisión propia y no por SIGKILL, que dejaría el pool sin cerrar. |

Secuencia real de apagado (`bootstrap/graceful-shutdown.ts`), en este orden:

1. SIGTERM → `readiness` pasa a **draining**; `/health/ready` devuelve 503 y
   `/health` **sigue en 200** (un 503 aquí mataría el contenedor a mitad);
2. espera `SHUTDOWN_DRAIN_DELAY_MS` — el balanceador saca la réplica;
3. `app.close()`: deja de aceptar, drena lo que está en vuelo, ejecuta los
   `onApplicationShutdown` (el worker de outbox termina su lote y suelta los
   leases) y cierra el pool;
4. `exit(0)`. Si el paso 3 excede `SHUTDOWN_GRACE_MS`, `exit(1)` con el motivo
   escrito.

Una segunda señal durante el apagado se **ignora**: forzar la salida abortaría
el drenaje que la primera puso en marcha.

---

## 7 · Observabilidad del despliegue

| Superficie                        | Autenticación             | Para qué                                  |
| --------------------------------- | ------------------------- | ------------------------------------------ |
| `GET /health`                     | pública                   | liveness del supervisor                    |
| `GET /health/ready`               | pública                   | readiness del balanceador                  |
| `GET /health/metrics/commercial`  | pública (sólo agregados)  | runbook con `curl`, para una persona       |
| `GET /metrics`                    | `Bearer $METRICS_TOKEN`   | scrapper Prometheus                        |

`GET /metrics` está **desactivado por defecto**: sin `METRICS_TOKEN` responde
404, no 401. Un 401 confirmaría que el endpoint existe y que hay algo detrás.

Reporte de errores: puerto `ErrorReporter` con adaptador **inerte** por
defecto. Con `SENTRY_DSN` se activa un adaptador HTTP compatible con Sentry
(sin dependencia nueva) que sanea PII y secretos antes de enviar nada. Un DSN
ilegible **no tumba el arranque**: registra el motivo y cae al inerte.

### Monitoreo mínimo (sin Prometheus desplegado)

`.github/workflows/monitor.yml` ejecuta cada 15 minutos (y bajo
`workflow_dispatch`) `scripts/ops/check-alerts.mjs`, que descarga `/metrics`
y evalúa los umbrales de `docs/ops/SLA.md` §4: outbox sin drenar más de
900 s, filas `dead` > 0, o endpoint que no responde. Si algo viola el
umbral, **el workflow falla y GitHub manda el correo de fallo al dueño: ese
correo es la alerta**. Para activarlo, dos secrets del repositorio:

| Secret                  | Valor                                    |
| ----------------------- | ---------------------------------------- |
| `MONITOR_METRICS_URL`   | `https://api.tu-dominio.com/metrics`     |
| `MONITOR_METRICS_TOKEN` | el mismo `METRICS_TOKEN` del despliegue  |

Sin los secrets, el workflow termina en verde con el aviso «monitoreo sin
configurar» — verde que significa «no se midió nada», no «todo bien» (es la
regla de SLA.md §6). El cron de GitHub es best-effort: para detectar la
caída total del API súmale un monitor externo gratuito (p. ej. UptimeRobot)
contra `/health/ready`.

`docker-compose.yml` es sólo infraestructura local: tiene credenciales
conocidas y levanta MinIO, aunque el runtime actual almacena blobs en
PostgreSQL. **No es una receta productiva.**
