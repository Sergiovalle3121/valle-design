# Despliegue en Railway — la ruta exacta

Este documento es un **procedimiento**, no una descripción. Cada paso lleva su
valor exacto y la comprobación que dice si funcionó. Está escrito para el
lanzamiento gratuito: tres meses de prueba, sin tarjeta, en
`vallecad.com` + `api.vallecad.com`.

`DEPLOYMENT.md` es la referencia general (artefactos, rollback ensayado,
timeouts y por qué esos números). Este archivo es la bajada concreta a Railway
y **no repite** lo que allí está: lo enlaza.

Para el inventario verificado de variables y límites actuales, lee también
[`VARIABLES-LANZAMIENTO.md`](VARIABLES-LANZAMIENTO.md). Railway ya no permite
activar `railway.json` en servicios nuevos: configura sus Dockerfiles, comandos
y healthchecks en la plataforma o usa Infrastructure as Code. Tampoco se ha
verificado desde el repositorio qué valores están puestos en la cuenta.

> **Lo que sólo Sergio puede hacer** está marcado con 🔑. Son los pasos que
> exigen una cuenta, un dominio o un secreto, y ninguna automatización los
> puede tomar por él.

---

## 0 · Antes de empezar: la decisión que hay que tomar una sola vez

**Los dos servicios tienen que vivir en el mismo sitio de cookies.**

La sesión es una cookie `SameSite=Lax` de primera parte. Con la web en
`vallecad.com` y el API en `valle-api.up.railway.app`, el navegador considera
que son sitios distintos y **no manda la cookie**: el usuario se registra, la
API responde 200, y la siguiente petición llega sin sesión. No es un fallo que
se vea en local ni en un preview — se ve el día del lanzamiento, con gente
mirando.

Por eso:

| Servicio | Dominio |
| --- | --- |
| web | `vallecad.com` |
| api | `api.vallecad.com` |

Los dos cuelgan de `vallecad.com`, así que son el **mismo sitio** y `Lax`
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
| `PORT` | No fijarlo manualmente | Railway lo inyecta en el servicio |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | referencia al plugin |
| `SYNCHRONIZE` | `false` | fijo, EXACTO |
| `MIGRATIONS_RUN` | `false` tras predespliegue comprobado; `true` sin él y con una sola réplica | ver §4 |
| `ALLOWED_ORIGIN` | `https://vallecad.com` | sin barra final, sin path |
| `CSRF_COOKIE_DOMAIN` | `.vallecad.com` | la web en el ápice debe leer `valle_csrf` que emite `api.` |
| `IDENTITY_RATE_LIMIT_KEY_SECRET` | 🔑 ≥32 caracteres | `openssl rand -base64 48` |
| `IDENTITY_MFA_ENCRYPTION_KEY` | 🔑 ≥32 caracteres, distinto del anterior | cifra secretos de MFA; sin él la API productiva no arranca |
| `OUTBOX_DISPATCHER_ENABLED` | `true` | fijo |
| `OUTBOX_EMAIL_WEBHOOK_URL` | `https://api.vallecad.com/v1/outbox/email` | la propia API |
| `OUTBOX_DOMAIN_WEBHOOK_URL` | `https://api.vallecad.com/v1/outbox/domain` | la propia API |
| `OUTBOX_WEBHOOK_SECRET` | 🔑 ≥32 caracteres | `openssl rand -base64 48` |
| `OUTBOX_EMAIL_LINK_BASE_URL` | `https://vallecad.com` | los enlaces de verificación |
| `EMAIL_SENDER_PROVIDER` | `resend` | fijo |
| `EMAIL_SENDER_API_KEY` | 🔑 `re_…` | panel de Resend |
| `EMAIL_SENDER_FROM` | 🔑 `VALLECAD <no-reply@vallecad.com>` | **dominio verificado en Resend**. Admite `correo@dominio` o `Nombre <correo@dominio>`: el nombre visible es lo que el cliente ve como remitente en su bandeja; sin él verá sólo la dirección. |
| `DB_SSL_STRICT` | `true` | ver §2.3 |
| `SUPPORT_EMAIL` | `soporte@vallecad.com` | Buzón del botón «algo salió mal» del estudio. **Nunca un correo personal**: es el que se enseña como soporte en el pie de los correos si `BRAND_SUPPORT_EMAIL` no está. **Sin él el endpoint responde 503 y lo dice**, en vez de aceptar reportes que nadie leería: un 202 sin buzón configurado es el peor de los mundos, porque la persona cree que reportó. Es la única forma de enterarse de lo que rompen los primeros arquitectos. |

### 2.1b · Marca visible (lo que firma los correos y el MFA)

La API no escribe el nombre del producto en ninguna plantilla: lo resuelve del
manifiesto de marca de `@valle-design/contracts` con estas variables (mismo
manifiesto que el web, **sin** el prefijo `NEXT_PUBLIC_`). Sin ellas los
correos salen firmados con el nombre por defecto del manifiesto («VALLE
Design»), y ningún cliente de VALLECAD debe ver ese nombre.

| Variable | Valor en Railway | Efecto |
| --- | --- | --- |
| `BRAND_PRODUCT_NAME_DESIGN` | `VALLECAD` | Asunto, intro, botón «Abrir …» y pie de TODOS los correos («Confirma tu correo — VALLECAD»). |
| `BRAND_NAME` | `VALLECAD` | Marca matriz del manifiesto (respaldo del nombre de producto). |
| `BRAND_SUPPORT_EMAIL` | `soporte@vallecad.com` | Buzón que se enseña en el pie de los correos («VALLECAD · soporte@vallecad.com»). Si falta, se usa `SUPPORT_EMAIL`; un `*.invalid` nunca se enseña. |
| `IDENTITY_MFA_ISSUER` | `VALLECAD` | Emisor que ve el usuario en su aplicación de autenticación. Sin ella toma `BRAND_PRODUCT_NAME_DESIGN`. |

Son variables de **runtime**: cambiarlas y reiniciar la api basta. El nombre
visible del remitente (`VALLECAD <no-reply@vallecad.com>`) va en
`EMAIL_SENDER_FROM` (§2.1) y exige el dominio verificado en Resend.

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
| `NEXT_PUBLIC_API_URL` | `https://api.vallecad.com` | **se incrusta al compilar** |
| `NEXT_PUBLIC_BRAND_WEBSITE_URL` | `https://vallecad.com` | `check:production-config` revienta el build con el dominio de plantilla |
| `NEXT_PUBLIC_BRAND_SUPPORT_EMAIL` | `soporte@vallecad.com` | ídem. Es el «Contacta con soporte» de /login y /register y la página /support: **nunca un correo personal**. Cambiarla exige **reconstruir** el web. |
| `NEXT_PUBLIC_BRAND_SALES_EMAIL` | `ventas@vallecad.com` | ídem |
| `NEXT_PUBLIC_BRAND_PRIVACY_EMAIL` | `privacidad@vallecad.com` | ídem |
| `NEXT_PUBLIC_BRAND_PRODUCT_NAME_DESIGN` | `VALLECAD` | Nombre visible del producto en toda la superficie web (mismo valor que `BRAND_PRODUCT_NAME_DESIGN` en la api, o el correo y la pantalla se llamarán distinto). Se incrusta al compilar. |
| `NEXT_PUBLIC_BRAND_NAME` | `VALLECAD` | Marca matriz visible. Se incrusta al compilar. |
| `NEXT_PUBLIC_LAUNCH_MODE` | `free` | Es el **default**. El Dockerfile la pasa al build; `commercial` hace visible Checkout sólo después de un build nuevo. Mantén `free` hasta validar pagos de prueba y operación real. |
| `NEXT_PUBLIC_APP_VERSION` | la fecha o el SHA del despliegue | El Dockerfile la pasa al build; si falta, los reportes dicen «desarrollo». Cambiarla exige un build nuevo. |
| `PORT` | No fijarlo manualmente | Railway lo inyecta en el servicio |

El modo `free` por defecto mantiene el checkout fuera de la superficie. El
código de Stripe tiene pruebas locales, pero para cobrar hay que reconstruir el
web con `commercial`, conectar las credenciales y webhooks reales, y verificar
un pago de prueba de extremo a extremo. Cambiar sólo la variable en Railway sin
un build nuevo ni esas comprobaciones no completa el lanzamiento comercial.

---

## 4 · Orden de arranque y migraciones

El orden importa y no es negociable:

1. **PostgreSQL primero.** Espera a que el plugin esté sano.
2. **api después.** Configura y comprueba el predespliegue
   `node apps/api/dist/scripts/run-migrations.js` que el `railway.json` del repo
   declara para servicios existentes. Para un servicio nuevo hay que ponerlo en
   Railway: no se aplica solo desde ese archivo. Con ese paso verificado puedes
   usar `MIGRATIONS_RUN=false`; sin predespliegue, `true` aplica la cadena al
   arranque con una sola réplica.
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
curl -sf https://api.vallecad.com/health/ready
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
| web | `vallecad.com` | CNAME flattening/ALIAS/ANAME según el DNS, más TXT de verificación indicados por Railway; no una IP A fija |
| api | `api.vallecad.com` | CNAME al host indicado por Railway, más TXT de verificación |

Después, y **antes** de anunciar nada:

```bash
# Los dos resuelven y sirven HTTPS válido:
curl -sSI https://vallecad.com        | head -1
curl -sSI https://api.vallecad.com/health | head -1
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
  --web https://vallecad.com \
  --api https://api.vallecad.com
```

Comprueba salud y readiness del API, que el catálogo público publica la oferta
con su `trialDays`, que la portada y `/precios` cargan y no piden tarjeta, y que
la ruta del estudio responde. **No** abre un documento ni exporta un plano.

Con `--email tu-correo@dominio.mx` hace el registro de verdad y comprueba HTTP
202 (o 409 si esa cuenta ya existe); **no espera ni verifica la entrega del
correo**. Comprueba manualmente la bandeja y abre el enlace de verificación.
Sin `--email`, el script omite ese bloque y lo indica.

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

### 7.1 · Probado, no supuesto

Los dos scripts se ejecutaron de verdad contra PostgreSQL 16 durante la campaña
de lanzamiento, y esto es lo que dieron:

```
[1/5] sha256 OK
[2/5] pg_restore --exit-on-error OK (0.46 s)
[3/5] 35 tablas restauradas, incluidas las 14 críticas
[4/5] migraciones: 26 (última: TenantRuntimeRoleAndDesignBlobsRls20260823120000)
[5/5] recuentos idénticos al origen en 35 tablas (885 filas)
RTO medido: 1.15 s (crear + restaurar + verificar)
```

El paso [5] es el que de verdad importa: compara **fila a fila** contra el
manifiesto que el respaldo grabó en su momento. Es la única comprobación que
detecta una restauración parcial silenciosa —`pg_restore` puede terminar en 0
habiendo omitido objetos— y la única que responde la pregunta del día del
incidente: *¿lo que restauré es lo que había?*

> ⚠️ Si tu base comparte servidor con suites de prueba que crean esquemas
> efímeros, el respaldo avisa de los esquemas que NO incluyó. El runtime
> materializa todo en `public`; los demás son ajenos y quedarse con `public` es
> correcto, no una economía.

### 7.2 · Cómo se programa EN RAILWAY

Railway no tiene cron del sistema: tiene **servicios con horario**. La receta,
en cuatro pasos:

1. **Un servicio nuevo** en el mismo proyecto, desde este mismo repositorio.
   Comparte red privada con el plugin de PostgreSQL, así que no hace falta
   exponer la base a internet.
2. **Variables**: `DATABASE_URL = ${{Postgres.DATABASE_URL}}` (referencia al
   plugin, igual que la api) y, si quieres que la copia salga de Railway,
   `RCLONE_REMOTE` apuntando a un bucket. Un respaldo que vive en el mismo
   disco que la base comparte destino con ella.
3. **Comando de arranque**: `bash scripts/ops/backup-cron.sh`. Crea, verifica,
   sube y rota —en ese orden—, y **falla ruidoso**: si la restauración de prueba
   no cuadra, el servicio termina en error y Railway lo marca en rojo. Un cron
   que falla en silencio es peor que no tenerlo, porque mantiene la sensación
   de tener copia.
4. **Horario**: en la pestaña *Settings → Cron Schedule*, `0 8 * * *` (03:00 en
   Ciudad de México; Railway programa en UTC). Un servicio con horario arranca,
   hace su trabajo y se apaga: no consume mientras duerme.

Desde una máquina propia, con la URL pública del plugin (*Connect → Public
Network*), el mismo par de comandos sirve para una restauración manual de
prueba. **Restaura uno al mes a mano**: la fecha de la última restauración
verificada vale más que el número de respaldos que tengas.

---

## 7bis · Sentry y monitor de uptime 🔑

Dos cosas que no son opcionales el día que el sitio es público, y que se ponen
en diez minutos.

**Sentry.** Crea el proyecto (plataforma *Node.js* para la api) y pega su DSN en
`SENTRY_DSN` del servicio **api**. Sin esa variable el reporte de errores es
inerte —no falla, no avisa: simplemente no existe—, así que compruébalo
provocando un error a propósito la primera vez. Un Sentry que nadie ha visto
recibir un evento es un Sentry que no sabes si funciona.

**Monitor de uptime.** Cualquiera sirve (UptimeRobot, Better Stack, Cronitor).
Lo que importa es **qué se vigila**:

| Vigila | NO vigiles |
| --- | --- |
| `https://api.vallecad.com/health/ready` cada 5 min | `/health` a secas |
| `https://vallecad.com/` cada 5 min | una página con sesión |

`/health` sólo dice que el proceso arrancó. **`/health/ready` es el que
distingue «el proceso vive» de «el producto sirve»**: responde en verde sólo con
la base contestando y la cadena de migraciones al día, que son las dos formas
en que esto se cae de verdad. Manda las alertas al mismo correo que
`SUPPORT_EMAIL` para no tener dos buzones que revisar.

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
3. 🔑 Generar secretos distintos para `IDENTITY_RATE_LIMIT_KEY_SECRET`,
   `IDENTITY_MFA_ENCRYPTION_KEY` y `OUTBOX_WEBHOOK_SECRET` (≥32 caracteres
   cada uno). `METRICS_TOKEN` es recomendado si se van a consultar métricas.
4. 🔑 Verificar el dominio en **Resend** y obtener la clave `re_…`.
5. Poner las variables de §2 y §3. **`TRIAL_DAYS=90`.**
6. 🔑 Apuntar el DNS de `vallecad.com` y `api.vallecad.com` (§5).
7. Desplegar en el orden de §4 y comprobar `/health/ready`.
8. Correr el smoke de §6 con un correo real.
9. 🔑 Poner los repositorios **en privado**.
10. 🔑 Mandar el enlace a los primeros cinco arquitectos, con el guion de sesión
    que ya existe en `docs/onboarding/`.
