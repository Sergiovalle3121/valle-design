# Backup y restore

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
