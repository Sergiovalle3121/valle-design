# Despliegue en Railway — la ruta exacta

Este documento es un **procedimiento**, no una descripción. Cada paso lleva su
valor exacto y la comprobación que dice si funcionó. Está escrito para el
lanzamiento gratuito: tres meses de prueba, sin tarjeta, en
`valledesign.mx` + `api.valledesign.mx`.

`DEPLOYMENT.md` es la referencia general (artefactos, rollback ensayado,
timeouts y por qué esos números). Este archivo es la bajada concreta a Railway
y **no repite** lo que allí está: lo enlaza.

> **Lo que sólo Sergio puede hacer** está marcado con 🔑. Son los pasos que
> exigen una cuenta, un dominio o un secreto, y ninguna automatización los
> puede tomar por él.

---

## 0 · Antes de empezar: la decisión que hay que tomar una sola vez

**Los dos servicios tienen que vivir en el mismo sitio de cookies.**

La sesión es una cookie `SameSite=Lax` de primera parte. Con la web en
`valledesign.mx` y el API en `valle-api.up.railway.app`, el navegador considera
que son sitios distintos y **no manda la cookie**: el usuario se registra, la
API responde 200, y la siguiente petición llega sin sesión. No es un fallo que
se vea en local ni en un preview — se ve el día del lanzamiento, con gente
mirando.

Por eso:

| Servicio | Dominio |
| --- | --- |
| web | `valledesign.mx` |
| api | `api.valledesign.mx` |

Los dos cuelgan de `valledesign.mx`, así que son el **mismo sitio** y `Lax`
funciona. Cualquier otra combinación exigiría `SameSite=None`, que a su vez
exige repensar CSRF: no es una alternativa, es otro producto.

---

## 1 · Los tres servicios

En un proyecto de Railway:

| Servicio | Qué es | Origen |
| --- | --- | --- |
| **PostgreSQL** | base de datos | plugin de Railway, PostgreSQL **16** |
| **api** | NestJS | este repositorio, `apps/api/Dockerfile` |
| **web** | Next.js | este repositorio, `apps/web/Dockerfile` |

Railway construye desde el Dockerfile si se lo indicas en *Settings → Build*.
Las dos imágenes ya cumplen los invariantes que verifica
`node scripts/deploy/validate-dockerfiles.mjs` (usuario no root, `NODE_ENV=production`,
`HEALTHCHECK`, `npm ci` contra el lockfile, cero secretos embebidos).

---

## 2 · Variables del servicio **api**

Sin las obligatorias, **el proceso no arranca**. Es deliberado: un servicio que
arranca mal es peor que uno que no arranca, porque nadie recibe una alerta.

### 2.1 · Obligatorias

| Variable | Valor en Railway | Origen |
| --- | --- | --- |
| `NODE_ENV` | `production` | fijo |
| `PORT` | `${{PORT}}` | Railway lo inyecta |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | referencia al plugin |
| `SYNCHRONIZE` | `false` | fijo, EXACTO |
| `MIGRATIONS_RUN` | `true` | ver §4 |
| `ALLOWED_ORIGIN` | `https://valledesign.mx` | sin barra final, sin path |
| `IDENTITY_RATE_LIMIT_KEY_SECRET` | 🔑 ≥32 caracteres | `openssl rand -base64 48` |
| `OUTBOX_DISPATCHER_ENABLED` | `true` | fijo |
| `OUTBOX_EMAIL_WEBHOOK_URL` | `https://api.valledesign.mx/v1/outbox/email` | la propia API |
| `OUTBOX_DOMAIN_WEBHOOK_URL` | `https://api.valledesign.mx/v1/outbox/domain` | la propia API |
| `OUTBOX_WEBHOOK_SECRET` | 🔑 ≥32 caracteres | `openssl rand -base64 48` |
| `OUTBOX_EMAIL_LINK_BASE_URL` | `https://valledesign.mx` | los enlaces de verificación |
| `EMAIL_SENDER_PROVIDER` | `resend` | fijo |
| `EMAIL_SENDER_API_KEY` | 🔑 `re_…` | panel de Resend |
| `EMAIL_SENDER_FROM` | 🔑 `Valle Design <hola@valledesign.mx>` | **dominio verificado en Resend** |
| `DB_SSL_STRICT` | `true` | ver §2.3 |

### 2.2 · La variable del lanzamiento

| Variable | Valor | Por qué |
| --- | --- | --- |
| `TRIAL_DAYS` | `90` | Es la oferta. La superficie pública **lee** este número (`trialDays` del catálogo público) y construye con él el titular «3 meses gratis»: nadie escribe «90» en una plantilla. Si aquí pusieras `30`, la portada diría «1 mes gratis» sola, y seguiría siendo verdad. |

El máximo que el producto acepta son 90 días
(`organization-commercial.configuration.ts`); un valor fuera de rango **mata el
arranque** en vez de degradar la oferta en silencio.

### 2.3 · `DB_SSL_STRICT` en Railway

El default productivo es `true` y así debe quedarse: valida el certificado del
servidor. Railway presenta un certificado verificable en su red privada.

Si el arranque falla con un error de cadena de certificados, la válvula de
escape es `DB_SSL_STRICT=false` — pero **anótalo como deuda**, no como
configuración normal: sin validación, una conexión a la base es interceptable
por quien esté en la ruta.

### 2.4 · Recomendadas

| Variable | Valor | Efecto |
| --- | --- | --- |
| `METRICS_TOKEN` | 🔑 ≥32 caracteres | sin él, `/metrics` responde **404** y no hay observabilidad |
| `SENTRY_DSN` | 🔑 del proyecto Sentry | sin él, el reporte de errores es inerte |
| `DB_POOL_SIZE` | `10` | Railway limita conexiones; 20 por réplica agota el plugin con dos réplicas |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | `65000` | debe superar el idle del balanceador de Railway |

---

## 3 · Variables del servicio **web**

> ⚠️ **Todas las `NEXT_PUBLIC_*` se incrustan AL COMPILAR.** No son
> configuración de runtime: cambiarlas en el panel **no reescribe** el
> JavaScript ya emitido. Cambiar cualquiera de estas exige **reconstruir** el
> servicio web, no reiniciarlo. Es la causa número uno de «lo cambié y no pasó
> nada».

| Variable | Valor | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://api.valledesign.mx` | **se incrusta al compilar** |
| `NEXT_PUBLIC_BRAND_WEBSITE_URL` | `https://valledesign.mx` | `check:production-config` revienta el build con el dominio de plantilla |
| `NEXT_PUBLIC_BRAND_SUPPORT_EMAIL` | 🔑 correo real de soporte | ídem |
| `NEXT_PUBLIC_BRAND_SALES_EMAIL` | 🔑 correo real de ventas | ídem |
| `NEXT_PUBLIC_BRAND_PRIVACY_EMAIL` | 🔑 correo real de privacidad | ídem |
| `NEXT_PUBLIC_LAUNCH_MODE` | `free` | es el **default**; ponerlo explícito documenta la intención |
| `PORT` | `${{PORT}}` | Railway lo inyecta |

`NEXT_PUBLIC_LAUNCH_MODE=free` es lo que mantiene el checkout fuera de la
superficie durante el lanzamiento. El código de Stripe sigue intacto y probado;
lo que se apaga es la **visibilidad**. Para volver a cobrar: `commercial` y
**reconstruir**.

---

## 4 · Orden de arranque y migraciones

El orden importa y no es negociable:

1. **PostgreSQL primero.** Espera a que el plugin esté sano.
2. **api después.** Con `MIGRATIONS_RUN=true`, el arranque aplica la cadena de
   migraciones antes de aceptar tráfico.
3. **web al final.** Su build necesita `NEXT_PUBLIC_API_URL` apuntando a un
   dominio que ya exista, aunque el API todavía no responda.

### Sobre `MIGRATIONS_RUN=true` con varias réplicas

Con **una** réplica es correcto y es lo que este lanzamiento necesita. Con
varias, dos procesos podrían intentar migrar a la vez; la cadena de migraciones
es transaccional y la segunda fallaría, pero el arranque de esa réplica moriría
con ella. Si algún día hay más de una réplica, migra como paso previo separado
(`DEPLOYMENT.md` §3.2) y deja `MIGRATIONS_RUN=false`.

### Comprobar que la base quedó bien

```bash
# Sano y con la cadena de migraciones al día:
curl -sf https://api.valledesign.mx/health/ready
# {"status":"ready", ...}
```

`/health` responde sin tocar la base (liveness). `/health/ready` sólo responde
cuando la base contesta **y** las migraciones están al día: es el que hay que
mirar tras un despliegue.

---

## 5 · Dominios y DNS 🔑

En Railway, *Settings → Networking → Custom Domain* de cada servicio:

| Servicio | Dominio | Registro DNS |
| --- | --- | --- |
| web | `valledesign.mx` | el que indique Railway (normalmente `CNAME` o `A` en el ápex) |
| api | `api.valledesign.mx` | `CNAME` → el host que indique Railway |

Después, y **antes** de anunciar nada:

```bash
# Los dos resuelven y sirven HTTPS válido:
curl -sSI https://valledesign.mx        | head -1
curl -sSI https://api.valledesign.mx/health | head -1
```

Si `ALLOWED_ORIGIN` no coincide EXACTAMENTE con el origen del web (protocolo,
host, sin barra final), todas las mutaciones se rechazan por CORS y el síntoma
que verás es «me registro y no pasa nada».

---

## 6 · Verificar que quedó bien: el smoke

No confíes en que las páginas cargan. Corre el smoke, que ejercita el embudo
real contra la URL de producción:

```bash
npm run smoke:railway -- \
  --web https://valledesign.mx \
  --api https://api.valledesign.mx
```

Comprueba, en dos minutos: salud y readiness del API, que el catálogo público
publica la oferta con su `trialDays`, que la portada y `/precios` cargan y NO
piden tarjeta, que el registro con un correo real llega hasta el correo de
verificación, y que un documento se puede abrir y exportar.

Con `--email tu-correo@dominio.mx` hace el registro de verdad y espera el
correo. Sin él, se salta ese bloque y **lo dice** en vez de dar por buena una
comprobación que no hizo.

---

## 7 · Respaldos 🔑

El plugin de PostgreSQL de Railway hace sus propios respaldos, pero un respaldo
que nunca se ha restaurado no es un respaldo. Los scripts de este repositorio
ya existen y corren contra cualquier `DATABASE_URL`:

```bash
# Respaldo (guarda en ./backups por defecto)
DATABASE_URL="postgres://…" npm run ops:backup

# Y la mitad que importa: RESTAURAR en una base desechable y verificar
DATABASE_URL="postgres://…" npm run ops:restore-verify
```

Programa el respaldo diario (`scripts/ops/backup-cron.sh`) y **restaura uno al
mes**. La fecha de la última restauración verificada vale más que el número de
respaldos que tengas.

---

## 8 · Qué mirar el primer día

| Señal | Dónde | Qué significa un rojo |
| --- | --- | --- |
| `/health/ready` | monitor de uptime | la base no responde o falta migrar |
| Correos en el outbox | `GET /health/metrics/commercial` (con `METRICS_TOKEN`) | si crecen y no bajan, el worker no entrega |
| Errores | Sentry | con `SENTRY_DSN` puesto |
| Registros que no completan | telemetría de activación | alguien llegó y no pudo dibujar |

---

## 9 · La lista de Sergio, en orden

1. 🔑 Crear el proyecto en Railway y añadir el plugin **PostgreSQL 16**.
2. 🔑 Crear los servicios **api** y **web** desde este repositorio.
3. 🔑 Generar los tres secretos:
   `IDENTITY_RATE_LIMIT_KEY_SECRET`, `OUTBOX_WEBHOOK_SECRET`, `METRICS_TOKEN`
   (`openssl rand -base64 48` cada uno).
4. 🔑 Verificar el dominio en **Resend** y obtener la clave `re_…`.
5. Poner las variables de §2 y §3. **`TRIAL_DAYS=90`.**
6. 🔑 Apuntar el DNS de `valledesign.mx` y `api.valledesign.mx` (§5).
7. Desplegar en el orden de §4 y comprobar `/health/ready`.
8. Correr el smoke de §6 con un correo real.
9. 🔑 Poner los repositorios **en privado**.
10. 🔑 Mandar el enlace a los primeros cinco arquitectos, con el guion de sesión
    que ya existe en `docs/onboarding/`.
