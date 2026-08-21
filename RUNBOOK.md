# Runbook operativo

## Cómo se usa este documento

Cada incidente de abajo trae **comandos exactos**. Si un procedimiento no se
puede ejecutar copiando y pegando a las 3 de la mañana, no sirve.

Variables que se asumen exportadas:

```bash
export API=https://api.tu-dominio.com
export DATABASE_URL=postgres://...            # base productiva
export METRICS_TOKEN=...                      # bearer de /metrics
export PG_BIN=/usr/lib/postgresql/16/bin      # o D:/dev/pg16/pgsql/bin
```

Primer comando de cualquier incidente, siempre el mismo:

```bash
curl -fsS $API/health        # ¿vive el proceso?
curl -sS  $API/health/ready  # ¿puede atender? (200 ok / 503 degraded|draining)
curl -sS -H "Authorization: Bearer $METRICS_TOKEN" \
  $API/health/metrics/commercial | jq '.outbox, .dispatcher'
```

## Señales mínimas

Monitorea por separado disponibilidad web/API, conexión y saturación de
PostgreSQL, latencia/error por ruta, 401/403/409/429, backlog y edad del outbox,
filas `dead`, latencia del webhook, conflictos CAS y tiempos de apertura,
serialización y escena. Las métricas y logs no deben contener correos, tokens,
cuerpos CAD, tenant IDs, firmas ni respuestas del proveedor.

`GET /health/metrics/commercial` expone — con el mismo bearer que `/metrics`
(`METRICS_TOKEN`; sin token configurado responde 404, sin bearer 401; los
probes de vida `/health` y `/health/ready` sí siguen públicos) — el
subconjunto comercial de estas señales listo para consultar:
backlog y edad por cola del outbox, filas `dead`, contadores y latencia
`claimed→sent` del dispatcher por clase de error, y 401/403/409/429 por PATRÓN
de ruta. Todo son agregados: sin URLs reales, payloads ni identificadores. Los
contadores viven en memoria del proceso y se reinician con cada despliegue; el
backlog sale de la base y es consistente entre réplicas.

`GET /metrics` expone lo MISMO en formato Prometheus para un scrapper, más
latencia por ruta como histograma y el estado del pool de PostgreSQL. Exige
`Authorization: Bearer $METRICS_TOKEN` y, **sin `METRICS_TOKEN` configurado,
responde 404**: la observabilidad se enciende a propósito, no por omisión.

```bash
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" $API/metrics | grep -E \
  '^valle_(outbox_backlog|outbox_oldest_pending_age_seconds|db_pool_connections)'
```

Consultas PromQL de guardia:

```promql
# p95 de latencia por ruta. Se agregan BUCKETS, no percentiles: un percentil
# calculado dentro de cada proceso no se puede promediar entre réplicas y daría
# un número que no corresponde a ningún usuario real.
histogram_quantile(0.95,
  sum by (route, le) (rate(valle_http_request_duration_seconds_bucket[5m])))

# tasa de 5xx por ruta
sum by (route) (rate(valle_http_requests_total{status=~"5.."}[5m]))

# lag del outbox: edad del mensaje sin enviar más antiguo
max by (queue) (valle_outbox_oldest_pending_age_seconds)

# saturación del pool: si `waiting` crece sostenido, el cuello es el pool y
# ninguna métrica de latencia por ruta lo dice por sí sola
max_over_time(valle_db_pool_connections{state="waiting"}[5m])
```

## Triage inicial

1. `curl -fsS https://API/health` separa indisponibilidad del API de un fallo
   del web. Si falla, conserva el log de arranque completo.
2. Comprueba conexión PostgreSQL, migraciones aplicadas y
   `SYNCHRONIZE=false`. No habilites SQLite o synchronize para recuperar
   producción.
3. Comprueba que el proxy entrega HTTPS al API y que `ALLOWED_ORIGIN` contiene
   el origen exacto del web.
4. Revisa backlog de outbox por estado y edad, sin consultar payloads:

```sql
SELECT 'email' AS queue, status, count(*) FROM email_outbox GROUP BY status
UNION ALL
SELECT 'domain', status, count(*) FROM domain_outbox GROUP BY status;

SELECT 'email' AS queue, min(created_at) AS oldest
FROM email_outbox WHERE status IN ('pending', 'failed')
UNION ALL
SELECT 'domain', min(created_at)
FROM domain_outbox WHERE status IN ('pending', 'failed');
```

5. Correlaciona la regresión con versión, migración y despliegue; no edites
   filas manualmente antes de conocer el alcance y tomar un snapshot.

## Respuestas comunes

- **API no arranca:** valida PostgreSQL, `SYNCHRONIZE=false`, secreto de rate
  limit y todas las variables `OUTBOX_*`. En producción, desactivar el worker
  no es una mitigación: dejaría verificación, reset e invitaciones varadas.
- **Login no crea cookie:** confirma TLS y `X-Forwarded-Proto=https`. El API
  falla si no puede emitir la cookie `__Host-` segura.
- **401:** confirma que la cookie se envía con `credentials: include`, no
  expiró ni fue revocada y el usuario verificó el correo. No extraigas ni
  copies tokens a `localStorage` para depurar.
- **CSRF inválido:** la cookie `valle_csrf` y `X-CSRF-Token` deben coincidir con
  la sesión actual. Tras login, rotación, logout o reset vuelve a leer las
  cookies; no reutilices un CSRF antiguo.
- **403 al abrir CAD:** consulta la organización activa, membresía/rol y el
  estado comercial. Deben coincidir `organizationId` y tenant, el plan debe
  estar activo y la suscripción ser `active` o un trial vigente.
- **404 de otro tenant:** es comportamiento fail-closed. No cambies la consulta
  a global para verificar; reproduce con dos cuentas/organizaciones en un
  entorno aislado.
- **429:** respeta `retryAfterSeconds`. Verifica hora PostgreSQL, conexión
  compartida y el mismo `IDENTITY_RATE_LIMIT_KEY_SECRET` en todas las réplicas.
- **Outbox crece:** comprueba worker habilitado, PostgreSQL, DNS/TLS y latencia
  del receptor. Valida firma/dedup con un mensaje de prueba en staging. No
  marques filas `sent`, reinicies intentos o reenvíes payloads a mano.
- **Filas `dead`:** corrige primero el receptor y reinyecta después con
  `node scripts/ops/outbox-replay.mjs` (ver INC-2): imprime un JSON auditable
  de lo tocado y sólo acepta filas `dead`. No edites filas con UPDATE suelto.
- **409/CAS:** preserva el estado local, abre la versión actual, compara y
  reintenta desde esa versión. Nunca incrementes el contador ni sobreescribas
  directamente la fila.
- **Autosave pendiente/offline:** evita cerrar o cambiar de documento, recupera
  conectividad y ejecuta guardado manual. Un flush de `pagehide` es best effort,
  no una garantía de red.
- **Documento grande no abre:** preserva documento, puntero y blob; verifica
  tenant, SHA-256, bytes comprimidos/expandidos y límites antes de cualquier GC.
- **Importación falla:** admite sólo `.dxf` de texto y `.json` canónico. Revisa
  límites, timeout, corrupción y warnings; no cambies extensión de DWG.
- **CIDE `available:false`:** valida URL/modelo/red o acepta la degradación. No
  habilites `AI_MOCK` en producción.
- **CORS:** reconstruir el web no corrige el API; ajusta `ALLOWED_ORIGIN` exacto.
  Si el web llama un host viejo, reconstruye con `NEXT_PUBLIC_API_URL` correcto.

## Backups programados

El día del incidente, el backup que salva es el que un cron tomó y VERIFICÓ
anoche. `scripts/ops/backup-cron.sh` hace la pasada completa — crear →
restaurar en base temporal y comprobar recuentos → subir fuera de la máquina
(si `RCLONE_REMOTE` está definido) → rotar — y falla ruidoso en cualquier
paso. La línea de cron exacta del VPS (diaria, plan Piloto):

```cron
MAILTO=tu-correo@dominio.mx
15 3 * * * DATABASE_URL=postgres://... RCLONE_REMOTE=r2:valle-backups /srv/valle/repo/scripts/ops/backup-cron.sh >> /var/log/valle-backup.log 2>&1
```

`MAILTO` no es decoración: es el canal por el que un backup fallido se
ENTERA. La retención por plan (SLA.md §2) manda sobre el default de 14 días
locales — Profesional exige cada 6 h y 30 días. Verificación puntual y
procedimiento completo de restauración: `docs/guides/backup-restore.md`.

---

## Incidentes con procedimiento

Cuatro incidentes concretos, con sus comandos. El resto de la sección
«Incidentes» de más abajo cubre los casos de seguridad y datos.

### INC-1 · Base de datos caída

**Síntoma:** `/health` 200, `/health/ready` 503 con `"db":"down"`. Los 5xx
suben en todas las rutas que escriben.

```bash
# 1 · Confirmar el alcance: ¿es la base o es la red del API?
curl -sS $API/health/ready | jq                     # ¿"db":"down"?
$PG_BIN/pg_isready -h $DB_HOST -p 5432 -U $DB_USER  # ¿responde el servidor?

# 2 · ¿Es saturación del pool y no caída? (waiting alto, total en el techo)
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" $API/metrics \
  | grep valle_db_pool_connections

# 3 · Si el servidor vive: conexiones y bloqueos
psql "$DATABASE_URL" -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state"
psql "$DATABASE_URL" -c "SELECT pid, wait_event_type, wait_event, left(query,80) \
  FROM pg_stat_activity WHERE wait_event_type = 'Lock'"
```

**Qué NO hacer:** apuntar el health check del balanceador a `/health` para
«que deje de dar rojo». Liveness dice que el proceso vive; readiness dice que
puede atender. Confundirlos hace que el balanceador mande tráfico a réplicas
que no pueden servirlo.

**Qué NO hacer, segunda:** encender `synchronize` o caer a SQLite para
«recuperar». El arranque lo prohíbe en producción precisamente porque esa
recuperación pierde datos en el siguiente despliegue.

**Recuperación:** el API **no necesita reinicio**. `/health/ready` vuelve a 200
en cuanto la base responde, y el balanceador reintroduce la réplica sola. Si el
supervisor las ha estado matando, es que el liveness probe apunta al sitio
equivocado: corrígelo antes de seguir.

---

### INC-2 · Outbox atascado

**Síntoma:** correos de verificación/reset que no llegan; `dead` creciendo;
`valle_outbox_oldest_pending_age_seconds` en aumento monótono.

```bash
# 1 · ¿Cuánto y desde cuándo?
curl -sS $API/health/metrics/commercial | jq '.outbox, .dispatcher'

# 2 · Mismo dato desde la base (consistente entre réplicas)
psql "$DATABASE_URL" -c "
  SELECT 'email' AS queue, status, count(*), min(created_at) AS mas_antiguo
  FROM email_outbox GROUP BY status
  UNION ALL
  SELECT 'domain', status, count(*), min(created_at)
  FROM domain_outbox GROUP BY status;"

# 3 · ¿El worker está vivo? Sin `claimed` creciendo, no está tomando lotes.
curl -sS $API/health/metrics/commercial | jq '.dispatcher.email.claimed'
sleep 10
curl -sS $API/health/metrics/commercial | jq '.dispatcher.email.claimed'

# 4 · ¿Por qué falla? La CLASE de error, nunca el payload.
curl -sS $API/health/metrics/commercial | jq '.dispatcher.email.retriesByKind, .dispatcher.email.deadByKind'
```

Árbol de decisión según la clase de fallo:

| `retriesByKind` predominante | Causa habitual                 | Acción                                             |
| ---------------------------- | ------------------------------ | -------------------------------------------------- |
| `TimeoutError`               | receptor lento o caído         | mirar el receptor; subir `OUTBOX_WEBHOOK_TIMEOUT_MS` sólo si el receptor es lento POR DISEÑO |
| `HTTP_401` / `HTTP_403`      | `OUTBOX_WEBHOOK_SECRET` distinto entre API y receptor | rotar el secreto **en ambos a la vez** |
| `HTTP_404`                   | URL de webhook equivocada      | corregir `OUTBOX_*_WEBHOOK_URL` y reiniciar         |
| `ENOTFOUND` / `ECONNREFUSED` | DNS o red                      | red; el outbox se drenará solo al restablecerse     |
| `lease_lost` alto            | réplicas peleándose o reloj desincronizado | comprobar hora de los nodos              |

**Qué NO hacer:** marcar filas como `sent`, reiniciar `attempts` o reenviar
payloads a mano. La entrega es at-least-once y el receptor deduplica por
`Idempotency-Key`; tocar las filas rompe esa garantía en ambos sentidos.

**Recuperación:** arreglado el receptor, el worker drena solo. Comprueba que
baja:

```bash
watch -n 10 "curl -sS $API/health/metrics/commercial | jq '.outbox.email.oldestUnsentAgeSeconds'"
```

Las filas `dead` NO se reintentan solas — es deliberado: ocho intentos
fallidos son un diagnóstico, no mala suerte. El replay es un paso EXPLÍCITO,
con herramienta propia, y SIEMPRE después de corregir la causa (reinyectar
contra un receptor roto sólo fabrica ocho fallos más):

```bash
# 1 · Ver qué hay, sin tocar nada (JSON auditable: id, intentos, clase de error)
node scripts/ops/outbox-replay.mjs --queue email --all-dead --dry-run

# 2 · Reinyectar UNA fila concreta…
node scripts/ops/outbox-replay.mjs --queue email --id <uuid>

# 3 · …o todas las dead de la cola, arreglada la causa
node scripts/ops/outbox-replay.mjs --queue email --all-dead
node scripts/ops/outbox-replay.mjs --queue domain --all-dead

# 4 · Pega el JSON que imprime en el informe del incidente y vigila el drenaje
watch -n 10 "curl -sS $API/health/metrics/commercial | jq '.outbox'"
```

El script devuelve las filas a `pending` con `attempt_count=0` y conserva
`last_error` como rastro. Reinyectar es seguro porque el receptor deduplica
de forma durable por `Idempotency-Key` (`webhook_receipts` + la clave nativa
del proveedor de correo): una fila cuyo efecto ya ocurrió produce un 200 sin
efecto nuevo. Lo que sigue prohibido: marcar filas `sent`, cambiar claves de
idempotencia o reenviar payloads a mano.

---

### INC-3 · Disco lleno

**Síntoma:** escrituras que fallan con `could not extend file` o
`No space left on device`; el API responde 500 en todo lo que guarda.

```bash
# 1 · ¿Dónde está el espacio? (el candidato #1 son los blobs CAD en la base)
psql "$DATABASE_URL" -c "
  SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS tamano
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;"

psql "$DATABASE_URL" -c "SELECT pg_size_pretty(pg_database_size(current_database()))"

# 2 · WAL retenido por un slot de replicación abandonado: causa clásica de
#     «el disco crece y nadie escribe tanto».
psql "$DATABASE_URL" -c "
  SELECT slot_name, active, pg_size_pretty(
    pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_retenido
  FROM pg_replication_slots;"

# 3 · Tuplas muertas sin recoger: el espacio existe pero está inutilizable.
psql "$DATABASE_URL" -c "
  SELECT relname, n_dead_tup, last_autovacuum
  FROM pg_stat_user_tables WHERE n_dead_tup > 10000 ORDER BY n_dead_tup DESC;"
```

Orden de actuación, del más seguro al más invasivo:

1. **Ampliar el volumen.** Es lo primero: con el disco lleno, cualquier otra
   operación (incluido `VACUUM FULL`) puede necesitar espacio y fallar.
2. **Liberar backups y logs antiguos** del host, nunca datos de la base.
3. **Soltar un slot de replicación abandonado** — `pg_drop_replication_slot` —
   sólo tras confirmar que su consumidor ya no existe. Soltarlo con un consumidor
   vivo rompe la réplica.
4. `VACUUM (ANALYZE)` sobre las tablas con más `n_dead_tup`. `VACUUM FULL`
   **bloquea la tabla entera** y necesita espacio equivalente a su tamaño: es
   una operación de ventana de mantenimiento, no de incidente.

**Qué NO hacer:** borrar filas de `design_blobs` para hacer sitio. Los punteros
desde documentos y versiones son JSON, no una FK: la base seguirá pareciendo
íntegra y el dibujo dejará de abrirse.

---

### INC-4 · Despliegue malo → rollback

**Síntoma:** tras un rollout, 5xx en rutas que antes funcionaban, o readiness
que no llega a 200.

```bash
# 1 · ¿Qué está corriendo? El digest, no el tag.
kubectl get deployment valle-api -o jsonpath='{.spec.template.spec.containers[0].image}'

# 2 · ¿Es el esquema o es el código?
curl -sS $API/health/ready | jq
#   "migrations":"pending" → falta aplicar la cadena; NO es un caso de rollback
#   "db":"down"            → INC-1
#   200 y aun así 5xx      → es el código: rollback de aplicación

# 3 · ¿Dónde se rompe? Ruta y tasa.
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" $API/metrics \
  | grep 'valle_http_requests_total{.*status="5'

# 4 · ROLLBACK DE APLICACIÓN (esquema compatible: el caso normal)
kubectl rollout undo deployment/valle-api
kubectl rollout status deployment/valle-api --timeout=120s
curl -fsS $API/health/ready | jq '.status'      # → "ok"
```

Si la versión nueva aplicó una migración **incompatible** con la anterior, el
paso 4 no basta: sigue `DEPLOYMENT.md` §4.2 (rollback de esquema), que exige
parar escrituras y tomar un backup verificado ANTES de revertir nada.

**Criterio para elegir:** ¿la versión anterior sabe leer el esquema actual?

- **Sí** → rollback de aplicación (segundos, sin tocar datos).
- **No** → o se corrige hacia delante, o se revierte la migración con su `down`
  probado. Restaurar un backup es el **último** recurso: pierde todo lo escrito
  desde el snapshot.

**Qué NO hacer:** desplegar el web viejo contra el API nuevo sin comprobar el
contrato, ni reconstruir el web «para arreglar CORS». El origen permitido es
`ALLOWED_ORIGIN` **en el API**; reconstruir el web no lo cambia.

---

### Disputas y reembolsos

El producto NO tiene endpoint de reembolso, a propósito: devolver dinero es
una decisión humana con contexto. La división de trabajo exacta:

**Qué hace el sistema (automático, por webhook):**

- `charge.refunded` → la factura espejo pasa a **`refunded`** y se publica
  `commercial.invoice.refunded` en el outbox de dominio. **La suscripción no
  se toca**: reembolsar y dar de baja son dos decisiones distintas, y acoplar
  ambas convertiría un reembolso parcial de cortesía en una baja accidental.
- `charge.dispute.created` (contracargo) → la suscripción pasa a
  **`suspended`** — fallo cerrado: un cobro en disputa no puede seguir
  contando como bueno — y se publica `commercial.subscription.disputed`.
- Ambos eventos son idempotentes por `event.id` (`payment_events`): una
  reentrega no repite el efecto.

**Qué hace el humano, en el dashboard de Stripe:**

1. **Reembolso:** Pagos → localizar el cargo → *Reembolsar* (total o parcial).
   El webhook hace el resto. Si además procede cortar el servicio, cancela la
   suscripción en el proveedor (o desde el portal): llegará
   `customer.subscription.deleted` y el producto la cerrará por su camino
   normal. Si fue pago único (OXXO/SPEI), no hay suscripción del proveedor
   que cancelar: valora si el acceso debe seguir hasta `current_period_end`.
2. **Disputa:** Pagos → Disputas → revisar motivo y fecha límite de
   evidencia. Decidir: **aceptar** (se pierde el importe + comisión de
   disputa; valorar cancelar la suscripción) o **responder** con evidencia
   (facturas espejo, fechas de acceso del `design_audit_log`, correos).
   Responde SIEMPRE antes de la fecha límite: una disputa sin respuesta se
   pierde sola.
3. **Si se gana la disputa:** Stripe libera el dinero. La reactivación del
   acceso es manual y deliberada — verifica con el cliente antes de mover
   `suspended` → `active` (el siguiente `invoice.paid` también reactiva por
   sí solo las suscripciones recurrentes).
4. Deja constancia (fecha, cargo, decisión, resultado) donde el equipo
   registre incidentes: `payment_events.outcome` guarda lo que hizo el
   sistema, no por qué lo decidió el humano.

**Qué NO hacer:** editar `invoices.status` o `subscriptions.status` a mano
para «adelantar» al webhook. Si el evento no llegó, es un problema del
webhook (verifica el endpoint y los eventos suscritos en el proveedor), no
de los datos.

---

## Incidentes

### Sospecha de acceso cross-tenant

Detén escrituras si existe exposición activa, preserva logs y snapshot, revoca
sesiones afectadas y reproduce con las suites PostgreSQL de aislamiento. Acota
tablas, blobs, versiones, outboxes y receptores externos. No repares filas hasta
tener una consulta y rollback revisados.

### Token o secreto expuesto

Revoca sesiones/tokens relacionados, rota el secreto afectado en API y receptor
de forma coordinada, inspecciona outbox/logs sin divulgar payloads y ejecuta
gitleaks sobre historial completo. Si el secreto llegó a Git, una eliminación
del archivo actual no basta.

### Pérdida o corrupción

Pon el servicio en mantenimiento, toma snapshot forense, restaura el último dump
en una base nueva y valida hashes, hidratación >1 MB, versiones, CAS, identidad,
organizaciones y outbox antes de conmutar. Sigue
`docs/guides/backup-restore.md`.

### Migración fallida

Detén el rollout y nuevas escrituras. Conserva error SQL, versión y backup.
Usa `down` sólo si fue probado para esa migración y no hubo escrituras
incompatibles; de lo contrario corrige hacia delante. Nunca enciendas
`synchronize` para “arreglar” el esquema.

## Gates antes de cerrar un incidente

Ejecuta contrato/SDK, typecheck, tests, lint, build, PostgreSQL/migraciones,
bootstrap compilado, audit/SBOM/licencias/gitleaks y el recorrido full-stack con
PostgreSQL real en Chromium y Firefox. Documenta cualquier gate no ejecutado;
un golden con backend simulado no demuestra recuperación operativa.

Diagnóstico ampliado: `docs/guides/troubleshooting.md`.
