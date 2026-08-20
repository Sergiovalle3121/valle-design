# Backup y restore

## Procedimiento PROBADO (empieza por aquí)

Dos scripts. El primero produce un backup; **el segundo es el que lo convierte
en un backup**, porque un archivo que nunca se restauró no lo es.

```bash
export PG_BIN=/usr/lib/postgresql/16/bin      # o D:/dev/pg16/pgsql/bin
export DATABASE_URL=postgres://usuario:clave@host:5432/valle_design

# 1 · Crear el backup + su inventario verificable
node scripts/ops/backup.mjs --url "$DATABASE_URL" --out backups/

# 2 · Restaurar en una base TEMPORAL, verificar y borrarla
node scripts/ops/restore-verify.mjs \
  --dump backups/valle-design-<sello>.dump \
  --url "$DATABASE_URL"
```

`backup.mjs` emite cuatro artefactos, y el tercero y el cuarto son los que
hacen la diferencia:

| Artefacto | Contenido |
| --------- | --------- |
| `<nombre>.dump` | copia en formato custom (`pg_dump --format=custom --no-owner --no-acl`) |
| `<nombre>.dump.sha256` | integridad del archivo |
| `<nombre>.contents` | `pg_restore --list`: el índice de objetos |
| `<nombre>.manifest.json` | **recuentos por tabla**, migración más reciente, versión del servidor e instante UTC |

Sin el manifiesto no se puede responder la única pregunta que importa el día
del incidente: *¿lo que restauré es lo que había?* `pg_restore` puede terminar
en 0 habiendo omitido objetos, y una restauración parcial **parece exitosa**.

`restore-verify.mjs` comprueba, en este orden, y **borra siempre la base
temporal**, también si falla:

1. **SHA-256** contra el `.sha256` — un archivo corrupto no merece más pasos;
2. **`pg_restore --exit-on-error`** sobre una base recién creada y vaciada
   (se elimina su esquema `public`, porque el dump lo recrea);
3. **tablas críticas presentes** — identidad, organizaciones, comercial, CAD,
   `design_blobs` y la tabla de migraciones;
4. **cadena de migraciones** — mismo recuento y misma última migración que el
   origen: un esquema restaurado en otro punto no es compatible con el binario
   que se va a desplegar;
5. **recuentos fila a fila** contra el manifiesto — es la única comprobación
   que detecta una restauración parcial silenciosa.

### Salida real de un ejercicio (2026-08-15, PostgreSQL 16.9)

```
  [1/5] sha256 OK  c6e7030176a55d11540286e7f4ec0fe078a83a99c6f9088af857ef6d8b6163ed
  [2/5] base temporal creada y vaciada: valle_restore_verify_7d07f537
  [2/5] pg_restore --exit-on-error OK (1.98 s)
  [3/5] 30 tablas restauradas, incluidas las 14 críticas
  [4/5] migraciones: 18 (última: LegalAcceptances20260815140000)
  [5/5] recuentos idénticos al origen en 30 tablas (23 filas)

  tamaño del dump : 77.3 KiB
  RTO medido      : 6.86 s (crear + restaurar + verificar)
  RPO del artefacto: instantánea de 2026-08-15T17:46:59.491Z
  limpieza: base temporal valle_restore_verify_7d07f537 eliminada

BACKUP VALIDADO: restaurado, verificado y base temporal eliminada.
```

Y las dos comprobaciones negativas, ejecutadas para demostrar que el gate tiene
dientes:

```
# Manifiesto alterado (simula una restauración parcial)
BACKUP NO VALIDADO:
  - Recuentos distintos del origen (restauración PARCIAL): identity_users: 0 != 7.

# Un byte del dump cambiado
BACKUP NO VALIDADO:
  - SHA-256 no coincide: el archivo se corrompió o no es el que se registró
    (esperado 0c5f7d01..., obtenido 6a339a26...).
```

Tras cuatro ejecuciones consecutivas, `SELECT datname FROM pg_database WHERE
datname LIKE 'valle_restore_verify%'` devolvió **cero filas**: la limpieza no
deja bases huérfanas llenando el disco del servidor.

### Programarlo: el cron del VPS

Los dos scripts sólo cuentan si alguien los ejecuta cada noche.
`scripts/ops/backup-cron.sh` encadena la pasada completa — backup →
`restore-verify` (si no imprime «BACKUP VALIDADO», el script muere y el cron
avisa) → subida opcional a R2/S3 vía `rclone` → rotación local — y falla
ruidoso en cualquier paso. La línea exacta:

```cron
MAILTO=tu-correo@dominio.mx
15 3 * * * DATABASE_URL=postgres://... RCLONE_REMOTE=r2:valle-backups /srv/valle/repo/scripts/ops/backup-cron.sh >> /var/log/valle-backup.log 2>&1
```

Requisitos del host: Node 20+, cliente PostgreSQL 16 (`PG_BIN` si no está en
PATH), el repo (o `scripts/ops/`) en `/srv/valle/repo`, y `rclone config`
hecho si se define `RCLONE_REMOTE`. Sin `RCLONE_REMOTE` el script avisa: un
backup en el mismo disco que la base muere con ella. Variables:
`BACKUP_DIR` (default `/srv/valle/backups`) y `BACKUP_RETENTION_DAYS`
(default 14; la retención del plan en `SLA.md` §2 manda — Profesional son
backups cada 6 h y 30 días: cuatro líneas de cron y
`BACKUP_RETENTION_DAYS=30`).

### RPO y RTO

El RPO **es** el intervalo entre backups verificados; el RTO se mide en cada
ejercicio y se registra. Los objetivos por plan están en `docs/ops/SLA.md` §5,
junto con la advertencia de que la medida de arriba —28 tablas, 20 filas— **no
se extrapola**: cada cliente con RTO comprometido necesita su propio ejercicio
sobre su volumen real.

### Dos cosas que este procedimiento aprendió a la primera

1. **`--schema=public` no es una economía, es correctitud.** El primer intento
   sobre una base compartida con suites de prueba falló: `pg_dump` bloquea la
   lista de tablas que vio al empezar y, para cuando llegó al `LOCK TABLE`, un
   esquema efímero de otra suite ya se había destruido
   (`ERROR: schema "organization_creation_..." does not exist`). El runtime
   materializa TODO su esquema en `public`; el script avisa de los esquemas
   que encuentra y no incluye, y admite `--schema=public,otro`.
   Corolario operativo: **un backup se toma de una base que no está sufriendo
   DDL concurrente.**
2. **Un `.dump` de cero bytes es peor que ningún archivo.** `pg_dump` crea el
   archivo antes de fallar; el script lo borra al fallar, porque la siguiente
   persona lo encontraría con fecha reciente y creería que hay copia.

---

## Unidad de consistencia

El backup productivo es un snapshot consistente de **toda** la base PostgreSQL,
no una selección de tablas. Una operación de identidad, organización, guardado
CAD o entrega externa puede actualizar varias tablas en la misma transacción.
Restaurarlas desde instantes distintos rompe FKs, CAS, punteros a blobs,
entitlements, auditoría e idempotencia.

El snapshot debe incluir, como mínimo:

- Identidad: `identity_users`, `identity_credentials`, `identity_sessions`,
  `identity_one_time_tokens`, `identity_audit_events` e
  `identity_rate_limits`.
- Organizaciones: `organizations`, `organization_memberships` y
  `organization_invitations`.
- Comercial: `plan_catalog`, `plan_entitlements`, `subscriptions`,
  `usage_ledger`, `domain_outbox` y `email_outbox`.
- CAD: `cad_projects`, `cad_documents`, `cad_document_versions`,
  `cad_publications`, `cad_review_sessions`, `cad_comments`, la biblioteca de
  bloques `sf_cad_blocks` y cualquier tabla de compatibilidad aún
  materializada.
- Datos propios: `design_blobs`, `design_audit_log` y la tabla de migraciones
  TypeORM.

`design_blobs` vive en PostgreSQL. Los punteros dentro de documentos/versiones
son JSON y no una FK, por lo que un restore parcial puede parecer válido hasta
que un usuario abra el dibujo. MinIO no contiene una copia recuperable del
runtime actual.

## Crear y validar el backup

Registra junto al artefacto: commit/versión de aplicación, versión de
PostgreSQL, instante UTC, migración más reciente, tamaño, checksum, cifrado,
retención y responsable. Ejecuta `pg_dump` con un usuario de backup de mínimo
privilegio y guarda el archivo fuera del host de base.

```bash
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=valle-design.dump \
  "$DATABASE_URL"

pg_restore --list valle-design.dump >valle-design.contents
sha256sum valle-design.dump >valle-design.dump.sha256
```

`pg_dump` usa un snapshot MVCC consistente. No ejecutes dumps separados por
módulo ni copies el directorio de datos mientras PostgreSQL está activo. Cifra
backup, checksum e inventario; contienen hashes de credenciales, sesiones,
PII, tokens pendientes y planos de clientes.

Un backup no está validado hasta completar una restauración aislada:

```bash
createdb valle_design_restore_test
pg_restore \
  --exit-on-error \
  --no-owner \
  --no-acl \
  --dbname=valle_design_restore_test \
  valle-design.dump
```

No conectes el restore de prueba a receptores de outbox, correo o CIDE. Arranca
el API con `OUTBOX_DISPATCHER_ENABLED=false` y `NODE_ENV` no productivo, en una
red aislada, para evitar efectos externos o reenvíos durante la validación.

## Verificación de restauración

Antes de considerar el restore utilizable:

1. Compara checksum e inventario y confirma que no hubo errores/objetos
   omitidos en `pg_restore`.
2. Confirma la versión de PostgreSQL y la tabla de migraciones. Ejecuta sólo
   migraciones compatibles con el commit que se va a desplegar; nunca uses
   `synchronize` para adaptar el snapshot.
3. Compara conteos por tabla y por tenant con un inventario capturado al crear
   el backup. Los conteos son una señal, no prueba suficiente de integridad.
4. Valida FKs y las invariantes first-party: cada organización tiene owner y
   membresía coherentes; una sesión activa apunta a una organización de la que
   el usuario es miembro; suscripciones, uso y outboxes conservan el par
   `organization_id = tenant_id`.
5. Comprueba que credenciales, sesiones, tokens e invitaciones siguen guardados
   por hash y que los timestamps de expiración/consumo/revocación no quedaron
   en estados imposibles. No muestres valores durante la inspección.
6. Revisa outboxes por estado, intentos, leases e idempotency keys. Conserva los
   IDs y claves originales: cambiarlos permite duplicar efectos downstream.
7. Para una muestra de al menos dos tenants, abre documentos inline y >1 MB,
   rehidrata cada blob, verifica SHA-256/tamaño/tenant, lista versiones y
   publicaciones y ejecuta un save CAS controlado y un export DXF.
8. Ejecuta las suites PostgreSQL de aislamiento/migraciones y el smoke del API
   compilado contra la base restaurada. La validación web final usa Chromium y
   Firefox, todavía sin habilitar efectos externos.

Consultas de sólo lectura útiles para la invariantes comercial/outbox:

```sql
SELECT count(*) AS mismatched_subscriptions
FROM subscriptions
WHERE organization_id <> tenant_id;

SELECT 'email' AS queue, status, count(*)
FROM email_outbox
GROUP BY status
UNION ALL
SELECT 'domain', status, count(*)
FROM domain_outbox
GROUP BY status;
```

No conviertas una diferencia de conteo o hash en una edición manual. Conserva
evidencia, identifica la transacción o migración responsable y prepara un fix
revisado y reversible.

## Outbox y efectos ya entregados

Restaurar un snapshot antiguo restaura también la visión histórica del outbox.
Un mensaje que estaba pendiente en el snapshot pudo haberse entregado después
del snapshot y antes del incidente. Al reactivar el worker puede enviarse otra
vez; por eso el receptor debe conservar deduplicación durable por
`Idempotency-Key` más allá del RPO máximo.

Antes de habilitar `OUTBOX_DISPATCHER_ENABLED=true`:

1. compara los IDs/idempotency keys restaurados con los registros del receptor;
2. confirma firma, secreto y ventana de timestamp actuales;
3. deja que leases restaurados expiren o sean recuperados por el worker; no
   cambies `processing`/`sent` a mano; y
4. monitorea backlog, reintentos y `dead` durante la reapertura gradual.

El restore de una base vieja también puede recuperar sesiones o tokens que se
revocaron después del snapshot. Evalúa el RPO de seguridad y, antes de abrir al
público, decide de forma explícita si se revocan todas las sesiones/tokens
restaurados o sólo los afectados. Documenta esa acción y comunica el impacto;
no asumas que el estado antiguo sigue siendo confiable.

## Archivo de migración legacy

El CLI legacy genera manifest, NDJSON y blobs con SHA-256. Conserva el
directorio completo: `import` verifica hashes antes de escribir y `rollback`
sólo corresponde al mismo manifiesto. El archivo de migración no incluye la
identidad, organizaciones ni estado operativo posterior y no sustituye un
backup general.

El origen debe permanecer read-only. Prueba dry-run, resume, verificación y
rollback en una base aislada antes de apuntar al destino.

## Restore de emergencia

1. Detén escrituras y dispatcher; preserva logs y toma un snapshot forense del
   estado fallido.
2. Verifica checksum y restaura el backup en una base **nueva**, nunca sobre la
   producción activa.
3. Ejecuta la verificación anterior con efectos externos bloqueados.
4. Aplica únicamente migraciones compatibles, despliega una versión de
   aplicación compatible y conmuta la conexión de forma atómica.
5. Revalida identidad, organización/trial/RBAC, aislamiento A/B, CAS, archivo
   > 1 MB y DXF en ambos navegadores.
6. Reconcilia sesiones/tokens y outboxes con sistemas externos; habilita el
   worker al final y observa el backlog.

Un rollback de aplicación no revierte automáticamente el esquema ni los datos.
Usa un `down` sólo si fue probado y no hubo escrituras incompatibles; de lo
contrario corrige hacia delante. Registra RPO/RTO reales de cada ejercicio y
repite restauraciones periódicamente.

SQLite (`dev.sqlite`) no es un backup productivo.
