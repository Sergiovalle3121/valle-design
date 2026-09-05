# Auditoría 13 · Backend: API, datos, escalabilidad

**Dimensión**: `apps/api` (NestJS) — modelo de datos, migraciones, transacciones,
N+1, índices, colas y trabajos largos, límites de tamaño y de tasa, versionado de
API, manejo de errores, observabilidad, salud y arranque, copias de seguridad.

**Pregunta de examen**: ¿aguanta un despacho de 30 personas con planos de 100 MB?

**Método**: lectura del árbol real (`apps/api/src`, 395 ficheros, 71 927 líneas),
de la rúbrica (`docs/competitive/rubric.json`, filas `persistence`, `review`,
`api-sdk`, `events`, `object-storage`, `growth`, `performance`) y de los
artefactos de evidencia (`docs/cad/evidence/api-load-tests.json`,
`review-concurrency.json`, `document-limits.json`). Ningún hallazgo de este
informe se afirma sin fichero y línea.

---

## 0 · Veredicto

**Nota: 5,5 / 10 contra AutoCAD completo en esta dimensión.**

La comparación es asimétrica y hay que decirlo antes de nada: **AutoCAD no tiene
backend**. AutoCAD es un `.exe` que escribe un `.dwg` en un disco de red o en
Autodesk Docs; su «escalabilidad» es la del SMB del despacho y su «modelo de
datos» es un fichero binario con bloqueo por fichero. Todo lo que Valle tiene
aquí —CAS con 409 explícito, historial de versiones, auditoría, outbox
transaccional, RLS, métricas Prometheus, respaldo verificado— AutoCAD sencilla-
mente no lo ofrece, y Autodesk lo vende aparte (Docs/Vault) por más dinero.

Dicho eso, la nota es un 5,5 y no un 8 porque **el backend está construido para
un documento a la vez y medido hasta 20 000 entidades, no para treinta personas
con planos de 100 000**. El camino de guardado recorre el documento entero cinco
veces por autosave, dentro de una transacción de PostgreSQL, en el hilo único de
Node, y no hay ninguna cola, ni ningún worker aparte, ni ningún límite agregado
que lo contenga. El techo declarado del documento (32 MiB descomprimidos,
100 000 entidades) es honesto; lo que no está medido es qué pasa cuando treinta
de esos techos empujan a la vez.

**En una frase**: el andamiaje de producción (salud, apagado, migraciones,
outbox, RLS, respaldos, contrato OpenAPI) está por encima de lo que se ve en
productos comparables y muy por encima de lo que AutoCAD ofrece, pero el camino
caliente del CAD —guardar y abrir el documento— es de un solo inquilino, de un
solo documento y de un solo hilo, y por ahí es por donde se rompe un despacho de
treinta.

---

## 1 · Lo que ya está construido y está bien

Esto no es cortesía: es la mitad del informe, y si no se dice, el lector se
queda con la impresión de que aquí no hay nada. Hay mucho.

### 1.1 · Arranque, salud y apagado (`src/main.ts`, `src/health/`, `src/bootstrap/`)

- `GET /health` nunca toca la base (`src/health/health.controller.ts:39`): un
  parpadeo de PostgreSQL no mete la plataforma en restart-loop. `GET
  /health/ready` verifica `SELECT 1` **y** que no queden migraciones pendientes
  (`health.controller.ts:59-70`). Esa segunda comprobación es rara de ver y es
  la que evita servir peticiones contra un esquema a medio migrar.
- `readiness.isDraining` responde 503 en readiness y **200 en liveness** durante
  el drenaje (`health.controller.ts:47-56`). El comentario de `main.ts:171-179`
  explica por qué NO se usa `enableShutdownHooks()`: añadiría un segundo
  listener de SIGTERM que cierra el socket antes de que el balanceador observe
  el 503. Es el nivel de detalle que sólo se escribe después de haber visto la
  ráfaga de 502 en un despliegue real.
- Timeouts de servidor aplicados **después** de `listen`
  (`main.ts:225`, `bootstrap/production-hardening.ts:50-54`):
  `keepAlive=65 s`, `headers=70 s`, `request=120 s`. `headersTimeout` se fuerza
  a `keepAlive + 1 s` (`production-hardening.ts:81`), que es exactamente la
  regla que evita los 502 esporádicos.

### 1.2 · Configuración de base de datos (`src/orm.options.ts`)

Es el mejor fichero de la aplicación.

- `synchronize` **prohibido** en producción con dos errores distintos según
  cómo se equivoque el operador (`orm.options.ts:63-77`).
- SQLite **prohibido** en producción, con la razón escrita (`orm.options.ts:44-48`).
- Presupuestos de conexión completos (`orm.options.ts:113-122`):
  `statement_timeout` 30 s, `idle_in_transaction_session_timeout` 30 s,
  `lock_timeout` 10 s, `max` 20. La mayoría de los NestJS que he auditado no
  tienen ninguno de los tres últimos.
- SSL estricto por defecto en producción con válvula de escape **explícita**
  (`DB_SSL_STRICT=false`), no un `rejectUnauthorized:false` escondido
  (`orm.options.ts:98-112`).
- `positiveIntFromEnv` **lanza** ante `DB_POOL_SIZE=2O` en vez de caer al
  default (`orm.options.ts:9-19`). Una configuración que miente es peor que un
  arranque que no llega.

### 1.3 · Outbox transaccional (`src/modules/commercial/outbox-dispatcher.service.ts`, 788 líneas)

- `FOR UPDATE SKIP LOCKED` real (`outbox-dispatcher.service.ts:394` y `:443`),
  leases con renovación por heartbeat (`:480`), backoff exponencial con jitter,
  `maxAttempts` y cola muerta.
- `UnsupportedOutboxDriverError` (`:113-121`) **rechaza arrancar** el dispatcher
  sobre SQLite en vez de fingir semántica multi-worker.
- El worker exige `OUTBOX_DISPATCHER_ENABLED=true` en producción y **lanza** si
  falta (`outbox-worker.service.ts:46-52`): un correo de verificación varado es
  un usuario que no puede entrar, y eso no puede depender de una variable
  olvidada.
- Cada pasada auxiliar (recordatorios de renovación, fin de prueba, CFDI) va en
  su propio `try/catch` (`outbox-worker.service.ts:92-119`): un PAC caído no
  tumba el correo.
- Las observaciones de telemetría **excluyen deliberadamente** destinatario,
  payload, tenant e idempotency key (`outbox-dispatcher.service.ts:81-84`).

### 1.4 · Aislamiento por inquilino (`src/common/tenant/tenant-scoped.repository.ts`)

El repositorio scoped inyecta `WHERE tenant_id` en siete métodos de lectura, y
—esto es lo notable— **su propia cabecera declara qué NO cubre**
(`tenant-scoped.repository.ts:22-34`): `update`, `delete`, `softDelete`,
`createQueryBuilder`, `findOneOrFail`… y confiesa que la cabecera llegó a
prometer dos helpers (`withTenantScope()`, `applyScope()`) que nunca existieron.
`withManager()` (`:80-93`) resuelve el agujero clásico de participar en una
transacción ajena perdiendo el filtro. El modo `strict` (fail-closed al carril
de sistema) está activado en las ocho entidades CAD
(`cad-documents.module.ts:74-81`).

### 1.5 · Límite de tasa compartido entre réplicas (`src/modules/identity/postgres-identity-rate-limit.store.ts`)

Ventana fija atómica en **una sola sentencia SQL** con `ON CONFLICT DO UPDATE`,
purga oportunista de hasta 1000 filas caducadas en el mismo CTE, y claves HMAC
opacas (`identity-security.ts:86-91`) para que la tabla no guarde identificadores
en claro. Funciona entre réplicas sin Redis. Es una solución elegante.

### 1.6 · Bus de presencia entre réplicas (`src/modules/cad/cad-presence.bus.ts`)

`LISTEN`/`NOTIFY` de PostgreSQL como canal entre procesos, con cliente `pg`
dedicado, reconexión y apagado limpio; se **desactiva solo** en SQLite. El
payload es mínimo y cada réplica relee el estado real. Esta pieza demuestra que
el repo **ya sabe** hacer fan-out multi-réplica sin infraestructura nueva — lo
cual hace más llamativo que mensajería y llamadas no lo usen (§3.7).

### 1.7 · Respaldos verificados (`scripts/ops/backup.mjs`, `restore-verify.mjs`, `backup-cron.sh`)

No es «corremos `pg_dump`»: es crear → **restaurar en una base desechable** →
verificar → rotar, con `MAILTO` en el cron para que un respaldo fallido avise
(`RUNBOOK.md:140-156`). `docs/guides/backup-restore.md` documenta que
`design_blobs` vive en PostgreSQL y que restaurar tablas de instantes distintos
rompe punteros. Esto es mejor que lo que tienen la mayoría de las SaaS pequeñas.

### 1.8 · Contrato y observabilidad

- `packages/contracts/specs/design-api.v1.yaml`: 5 806 líneas, 73 operaciones,
  con gate anti-deriva (`scripts/cad/check-design-contract.mjs`) y SDK generado
  de 5 974 líneas (`packages/design-sdk/src/generated/design-api.ts`).
- Política de versionado escrita con ventana de deprecación de 90 días
  (`docs/api/POLITICA-API-PUBLICA.md:29-33`).
- Métricas Prometheus con **histogramas, no percentiles precocinados**, y la
  razón escrita (`src/observability/metrics.registry.ts:14-19`): un p95
  calculado por réplica no es agregable. Tope de cardinalidad con cubeta de
  desborde (`metrics.registry.ts:41-42`).
- `AllExceptionsFilter` asigna `x-request-id`, nunca filtra stacks al cliente y
  reporta 5xx por un puerto neutral (`common/filters/all-exceptions.filter.ts`).
- `ErrorReportingLogger` engancha el **logger**, no sólo el filtro, para cubrir
  al worker de outbox que falla sin petición HTTP
  (`observability/error-reporting.logger.ts:5-18`).

---

## 2 · Dónde discrepo de la rúbrica

Tres filas relevantes para esta dimensión tienen el campo `gap` **desactualizado
o más generoso de lo que sostiene el código**. Lo digo porque la cultura de la
casa lo pide.

### 2.1 · `object-storage` — el `gap` está obsoleto (a favor del proyecto)

El `gap` dice: *«El MinIO del Compose no está cableado; no hay adaptador S3 ni
migración.»* **Eso ya no es cierto.** Existe
`apps/api/src/modules/blob-store/s3-blob.store.ts` (565 líneas, firma AWS SigV4
propia sin dependencia nueva, `redirect:'error'`, verificación de integridad en
lectura), existe `selectCadBlobStore`
(`cad-documents/design-blob-store.adapter.ts:48-55`) probado sin arrancar Nest,
y existe `blob-store-migration.ts` con `migrateBlobsToObjectStore` reanudable y
con verificación en origen. Hay que actualizar ese `gap`.

### 2.2 · `object-storage.s3` — el criterio dice «con migración» y no hay comando

El criterio pide *«Adaptador S3/MinIO cableado, **con migración** y operación
documentadas»*, y su única evidencia es la EXISTENCIA del fichero
`s3-blob.store.ts`. Pero:

- `migrateBlobsToObjectStore` (`blob-store-migration.ts:100`) **no tiene ningún
  llamador fuera de su propia spec**. Verificado:
  `grep -rn "blob-store-migration" apps scripts package.json` sólo devuelve
  `s3-blob.store.spec.ts:43`.
- `S3BlobStore.putAtKey` (`s3-blob.store.ts:441`), que existe exclusivamente
  para la migración, **tampoco tiene llamador**.
- No hay script npm (`apps/api/package.json:8-33`) ni subcomando del
  `migration-cli` (`src/migration-cli/main.ts:159-314`, que sólo conoce
  `export`/`import`/`verify`/`rollback`).

`docs/cad/blob-store-s3-migration-and-operations.md:78` le dice al operador
«`migrateBlobsToObjectStore` con `dryRun:true` recorre `design_blobs`». El
operador no tiene forma de invocarlo. **La migración es una biblioteca, no un
procedimiento.** El criterio debería exigir el punto de entrada, no el fichero.

### 2.3 · `api-sdk.public` — «429 con Retry-After» no es lo que hace el código

El `rationale` del criterio concede el punto en parte porque *«la carga [se
verifica] por el límite de tasa OBSERVADO (429 con Retry-After)»*.
`ApiRateLimitService.enforce` (`identity/api-rate-limit.service.ts:36-56`)
devuelve `retryAfterSeconds` **en el cuerpo JSON**. La cabecera HTTP
`Retry-After` **no se emite en ningún punto de `apps/api`**:

```
$ grep -rn "Retry-After\|retry-after" apps/api/src --include=*.ts
(sin resultados)
```

Un integrador con `axios-retry`, `got`, `urllib3.Retry` o cualquier cliente que
respete el estándar no ve nada. El artefacto
`docs/cad/evidence/api-load-tests.json` dice `"retryAfterSeconds": 60`, que es el
campo del cuerpo — la evidencia es correcta, el `rationale` de la rúbrica es el
que sobre-promete. Es una línea de código arreglarlo (§4.9).

### 2.4 · `review.concurrency` — pasa, pero la escala es de cinco actores

`docs/cad/evidence/review-concurrency.json` tiene `verdict.passed = true` con
criterios exigentes (cero 5xx, fronteras de rol, un ganador por carrera CAS,
conteos íntegros). Es evidencia buena. Pero la escala real es:
**816–996 peticiones por corrida, 5 roles, 2 escritores CAS simultáneos**, en un
portátil Ryzen 5 5500U con 7,4 GB y «agentes vecinos» declarados. Eso no es «un
despacho de 30 personas»; es una prueba de corrección concurrente, que es otra
cosa (y muy valiosa). La fila cobra sus 2 puntos legítimamente por lo que su
texto dice; el lector no debe leer ahí una prueba de capacidad.

### 2.5 · La evidencia de carga contradice el contrato vigente

`docs/cad/evidence/api-load-tests.json` declara
`largeDocuments.archiveLimitBytes = 134217728` (128 MiB). El contrato lo bajó a
32 MiB el 2026-08-20
(`packages/contracts/src/design-contracts.ts:196-204`) y la corrida es del
2026-08-19. El artefacto quedó **un día por delante del cambio** y hoy publica
un límite que ya no existe. No es un fraude —es deriva— pero un integrador que
lea ese JSON creerá que puede subir 128 MiB.

---

## 3 · Los huecos, por lo que más duelen

### 3.1 · [BLOQUEANTE] El guardado recorre el documento CINCO veces, en el hilo único, dentro de la transacción

Éste es **el** hueco de la dimensión. Todo lo demás es secundario.

Camino de `PUT /v1/cad/documents/:id/content`:

1. `express.json({limit:'16mb'})` (`main.ts:66`, `production-hardening.ts:119`)
   bufferiza el cuerpo y hace `JSON.parse` — pasada 1 sobre 25 MB.
2. `ValidationPipe({transform:true})` (`main.ts:78-85`) ejecuta
   `plainToInstance` sobre `SaveCadContentDto`, cuyo `cadDocument` es un
   `@IsObject()` sin tipo anidado (`cad/dto/cad.dto.ts:156-159`): clon profundo —
   pasada 2.
3. `CadDocumentsRepository.saveContent` llama a `getDocument(id)`
   (`cad-documents.repository.ts:235`), que es un `findOne` **sin `select`**:
   trae la fila COMPLETA, incluidos el `cadDocument` jsonb anterior y
   `dxfData` (columna `text`, sin techo declarado).
4. `prepareCadDocumentSave` hace
   `await this.hydrateCadDocument(input.storedDocument)`
   (`cad-documents.service.ts:290-292`) **incondicionalmente**: GET del blob,
   `gunzip` de 25 MB, `JSON.parse`, `validateCadDocumentPayload` completo —
   pasadas 3 y 4. Y lo hace **para comparar el array `publications`**, que en
   el 99,9 % de los autosaves está vacío o idéntico. La comprobación que lo
   necesita está veinte líneas más abajo (`:322-338`) y está guardada por
   `publicationMutationRequested`; la hidratación no lo está.
5. `validateCadDocumentPayload` termina con `JSON.stringify(document)` para
   comprobar el tamaño (`cad-document-validation.ts:725-727`) — pasada 5.
6. `storeCadDocument` (`cad-documents.service.ts:220-226`) hace **otro**
   `JSON.stringify` para decidir inline vs. blob, y luego `gzip` — pasada 6.
7. Todo lo anterior a partir del punto 3 ocurre **dentro de**
   `this.dataSource.transaction(...)` (`cad-documents.repository.ts:412`).

**Números medidos, no estimados.** `document-limits.json` mide un documento de
100 000 entidades en 24 669 745 bytes de JSON y 197 MB de heap.
`api-load-tests.json` mide el guardado real por HTTP:

| entidades | bytes | `saveMs` (mediana) |
|---|---|---|
| 500 | 62 827 | 105 |
| 5 000 | 647 963 | 581 |
| 20 000 | 2 641 588 | **1 200** |

La escala es superlineal, y la corrida **se para en 20 000**. Extrapolando la
pendiente 5k→20k (×4 bytes → ×2,06 tiempo) hasta los 24,7 MB de 100 000
entidades salen **del orden de 6–12 s de CPU por guardado**, en un solo hilo.

**Lo que le pasa al despacho de 30 personas.** El intervalo de checkpoint del
editor es de 15 s (`document-limits.json → scenario.checkpointIntervalMs`).
Treinta personas con documentos vivos ⇒ ~120 guardados/minuto. A 6 s de CPU por
guardado son **12 minutos de CPU por minuto de reloj**, en un proceso Node de
un solo hilo. No hay forma de que quepa. Y antes de eso:

- `statement_timeout = 30 s` e `idle_in_transaction_session_timeout = 30 s`
  (`orm.options.ts:114-120`) empiezan a **abortar transacciones** en cuanto la
  cola de eventos hace esperar a la transacción abierta.
- El pool es de 20 conexiones (`orm.options.ts:114`) y **cada guardado retiene
  una durante todo el gzip y, en modo S3, durante el PUT HTTP al bucket**
  (§3.2).
- El cuerpo de 16 MB × N concurrentes es heap puro: el propio proyecto midió
  197 MB de heap por documento de 100k.

**El límite de tasa no protege de esto.** `cadContentWritePerDocument: 120`
(`api-rate-limit.service.ts:63`) es **por documento**. Treinta documentos
distintos pueden empujar 3 600 guardados/minuto sin que ningún techo se active.
No existe ningún límite por organización ni global, ni ningún semáforo de
concurrencia.

**Qué falta**: no es un ajuste, es una pieza que no existe — el guardado pesado
no tiene cola ni worker.

**Cómo se construye** (por orden de retorno):

1. **Quitar la hidratación innecesaria** (horas, ganancia inmediata del 40 %):
   en `cad-documents.service.ts:290`, envolver
   `input.storedDocument ? await this.hydrateCadDocument(...) : null` en
   `publicationMutationRequested || <el puntero declara publications>`. El
   puntero a blob ya lleva `summary` (`cad-document-storage.ts:29-33`); ampliar
   ese `summary` con `publicationsSignature: string` (hash del array) resuelve
   la comprobación **sin descomprimir nada**. Migración aditiva: un puntero sin
   el campo cae al camino actual.
2. **Sacar el blob de la transacción** (§3.2).
3. **Proyección en `getDocument`**: añadir un
   `getDocumentHeader(id)` con `select` de las columnas del CAS
   (`id, tenant_id, organization_id, plant_id, cadDocumentVersion, cadDocument`)
   y dejar el `findOne` completo sólo para `openDocument`. Hoy `saveContent`,
   `listVersions`, `listPublications`, `clearDxf` y `getVersion` arrastran el
   jsonb entero sin usarlo.
4. **Semáforo de guardados pesados**: un `CadHeavyWriteGate` (módulo
   `cad-documents`) con `maxConcurrent = ceil(cpus/2)` que responde
   `503 + Retry-After` cuando está lleno, en vez de dejar que la cola de eventos
   crezca sin techo. Es diez líneas y convierte un colapso en un rechazo
   honesto — que es exactamente la doctrina «fix-or-hide» de la casa.
5. **Worker aparte para el camino pesado** (semanas): el proceso que sirve HTTP
   no debe ser el que gzipea 25 MB. `PUT .../archive` ya recibe el gzip **hecho
   por el navegador** (`cad.controller.ts:207-217`): promoverlo a camino
   PRINCIPAL para documentos grandes elimina el gzip del servidor por completo.

**Cómo se verifica**: extender
`apps/api/src/load-probe/main.ts` con una fase `cad-document-save-concurrent`
que abra 30 documentos de 100 000 entidades y los guarde en paralelo durante
60 s, y publicar en `api-load-tests.json` `p95`, `statusCounts` (incluidos 503 y
los abortos de `statement_timeout`) y `heapUsed` máximo. Umbral de producto:
cero 5xx no declarados y `p95 ≤ 5 s`. Hoy ese número no existe.

---

### 3.2 · [BLOQUEANTE] La transacción de PostgreSQL sostiene una llamada HTTP al bucket

`saveContent` abre `this.dataSource.transaction(...)`
(`cad-documents.repository.ts:412`) y dentro llama a `storeCadDocument`
(`:364`), que llama a `this.requireCadBlobs().put(...)`
(`cad-documents.service.ts:229`). Cuando `selectCadBlobStore`
(`design-blob-store.adapter.ts:52`) resuelve a `S3BlobStore`, ese `put` es un
`HEAD` + un `PUT` HTTP con timeout de **30 000 ms**
(`s3-blob.store.ts:167`, `:400-416`).

Es decir: **una conexión de PostgreSQL y una transacción abierta esperan hasta
30 s a que responda un bucket**. Con `max: 20` y
`idle_in_transaction_session_timeout: 30_000`, un bucket lento no degrada el
guardado: **agota el pool y aborta transacciones de todo el mundo**, incluido el
login y las métricas. Un incidente de red en S3 se convierte en una caída total
de la API.

El propio adaptador lo sabe a medias: `S3BlobStore.put` **omite deliberadamente**
el tercer parámetro de transacción y lo explica (`s3-blob.store.ts:392-397`), y
`docs/cad/blob-store-s3-migration-and-operations.md:135-142` documenta los
objetos huérfanos. Lo que nadie documenta es que la transacción sigue **abierta**
mientras el PUT viaja.

**Cómo se construye** (un día): invertir el orden. `storeCadDocument` se ejecuta
**antes** de abrir la transacción (los bytes son content-addressed, escribirlos
de más es idempotente y barato), y la transacción sólo contiene el CAS
(`compareAndSwapCadDocument`), la fila de historial, el `UsageMeter` y el
`CadEventPublisher`. Para el adaptador de base (`DatabaseBlobStore`, que sí es
transaccional) se mantiene el camino actual con una bandera del puerto:
`CadBlobStore.participatesInTransaction: boolean`.

**Cómo se verifica**: spec en `apps/api/src/modules/cad/` con un
`CadBlobStore` doble que tarda 2 s, midiendo con
`SELECT count(*) FROM pg_stat_activity WHERE state='idle in transaction'` que el
contador se queda en 0 durante el put. Y una spec de contrato que falle si
`storeCadDocument` se invoca con un `manager` cuando el puerto declara
`participatesInTransaction: false`.

---

### 3.3 · [ALTA] Los blobs y las versiones crecen sin fin: no hay recolector, y la documentación dice que sí lo hay

`DatabaseBlobStore.markForGc` existe (`design-blob.store.ts:155-162`) y está
probado (`design-blob.store.spec.ts:147`). **No lo llama nadie en producción.**
Verificado en todo el repo:

```
$ grep -rn "markForGc" apps packages scripts | grep -v spec | grep -v /dist/
apps/api/src/modules/blob-store/design-blob.store.ts:43   (comentario)
apps/api/src/modules/blob-store/design-blob.store.ts:155  (definición)
apps/api/src/modules/blob-store/design-blob.store.ts:170  (mensaje de error)
```

Y `docs/cad/blob-store-s3-migration-and-operations.md:157-161` le dice al
operador: *«El barrido de recolección los retira; no es un incidente»* y *«El
recolector de dos barridos vive en PostgreSQL»*. **Ese recolector no existe.**
En un repositorio cuya fila `integrity` vale 13 puntos y cuyo lema es «ningún
claim sin evidencia», una guía de operación que promete un barrido inexistente
es exactamente la clase de defecto que la rúbrica dice cazar.

Consecuencia acumulativa, con los números del propio proyecto:

- Cada guardado de un documento >1 MiB crea **un blob nuevo** (el contenido
  cambió, luego el sha256 cambia, luego `findBlobBySha` no deduplica). Archivo
  de un documento de 100k: **3,27 MB** (`document-limits.json →
  largestSustainedArchiveBytes`).
- Checkpoint cada 15 s ⇒ 4 blobs/min por documento activo ⇒ **13 MB/min**.
- Una persona dibujando 6 h: **4,7 GB**. Treinta personas: **141 GB/día**, en
  `bytea` dentro de PostgreSQL, sin que nada los borre nunca.

Lo mismo, en paralelo, con `cad_document_versions`:
`recordVersion` (`cad-documents.repository.ts:711-737`) escribe **una fila con
el documento completo por cada versión** (inline hasta 8 MB, o el puntero si es
blob). No hay poda:
`grep -rn "CadDocumentVersion" src | grep -i "delete|prune|retention"` → vacío.
`listVersions` pagina a 200 (`:679`), pero la tabla no tiene techo.

**Contraste**: el barrido de presencia SÍ existe y está bien hecho
(`cad/cad-presence-cleanup.service.ts`, cada 30 s, idempotente, corre en todas
las réplicas por diseño y lo explica). El molde ya está en el repo; falta
aplicarlo al recurso caro.

**Cómo se construye** (varios días):

1. `CadBlobGcService` en `modules/blob-store`, mismo patrón que
   `CadPresenceCleanupService` (temporizador + `unref` +
   `onApplicationShutdown`), pero con lease `FOR UPDATE SKIP LOCKED` sobre una
   tabla `design_blob_gc_leases` porque el barrido **sí** debe correr una vez.
2. Primer barrido: `SELECT blob_key FROM design_blobs WHERE gc_marked_at IS NULL
   AND created_at < now() - interval '24 hours'` y, para cada uno, comprobar la
   referencia viva con `cadBlobKeyFromStoredDocument`
   (`cad-document-storage.ts:63`, ya escrita y deliberadamente laxa **para este
   uso**) contra `cad_documents.cad_document` y
   `cad_document_versions.cad_document`. La forma barata: índice funcional
   `CREATE INDEX ON cad_documents ((cad_document->'_storage'->>'blobKey'))` y
   el simétrico en versiones.
3. Segundo barrido: borrar lo marcado hace más de 7 días y aún huérfano.
4. **Política de retención de versiones**, que es una decisión de producto, no
   técnica: propongo «todas las de las últimas 24 h + una por hora de los
   últimos 7 días + una por día de los últimos 90 + todas las publicadas», con
   el número publicado en `docs/cad/` y una columna `pinned` para que una
   publicación nunca se pode.
5. Métricas: `valle_blob_bytes_total{tenant}` y
   `valle_blob_orphans_total` en `metrics-gauges.provider.ts`. Sin gauge, el
   operador descubre el problema cuando el disco se llena.

**Cómo se verifica**: `design-blob-gc.pg.spec.ts` contra PostgreSQL real que
(a) marca un blob huérfano, (b) NO marca uno referenciado desde una versión
antigua, (c) resucita la marca al re-subir el contenido
(`design-blob.store.ts:76-79` ya lo hace), (d) rechaza borrar sin marca previa
(`:168-172`). Y un gate en `check:cad` que falle si
`docs/cad/blob-store-s3-migration-and-operations.md` menciona un recolector que
`grep` no encuentra llamado.

---

### 3.4 · [ALTA] RLS está en la base pero la aplicación nunca fija `app.tenant_id`

Nueve tablas tienen `ENABLE ROW LEVEL SECURITY` con política
`tenant_id = current_setting('app.tenant_id', true)`
(`migrations/20260820120000-TenantIntegrityRls.ts`,
`20260823120000-TenantRuntimeRoleAndDesignBlobsRls.ts`,
`20260831093000-CadPresenceBeatsRls.ts`). Existe el rol `valle_app` sin
`BYPASSRLS`. Y sin embargo:

```
$ grep -rn "app.tenant_id\|SET LOCAL\|set_config" apps/api/src --include=*.ts | grep -v migrations/
(sin resultados)
```

Es decir: **hoy RLS no protege nada**, porque la app corre como el rol DUEÑO
—que no queda sujeto a sus políticas sin `FORCE`— y ninguna ruta ejecuta
`SET LOCAL app.tenant_id`. Todo el aislamiento real es el `WHERE` de
`TenantScopedRepository`, cuya propia cabecera admite que `update`, `delete`,
`softDelete` y `createQueryBuilder` **salen sin filtro**
(`tenant-scoped.repository.ts:22-34`).

**El proyecto es totalmente honesto sobre esto**: ADR-0013
(`docs/adr/0013-rol-runtime-valle-app-no-dueno.md:21-45`) documenta las dos
verificaciones exactas que yo acabo de repetir. No es un descuido oculto; es un
«todavía no» declarado. Pero es un «todavía no» con **una trampa cargada**: el
día que un operador siga el camino del ADR y apunte `DATABASE_URL` a `valle_app`
sin haber implementado el `SET LOCAL`, **toda consulta legítima devuelve cero
filas** — un apagón total, no un endurecimiento. El propio ADR lo dice
(`:38-42`), pero está a un `kubectl set env` de distancia.

El obstáculo técnico que el ADR identifica es real: `TenantInterceptor` abre el
contexto por `AsyncLocalStorage`, no por transacción, y `SET LOCAL` sólo dura la
transacción actual.

**Cómo se construye** (varios días): la salida no es envolver cada petición en
una transacción. Es interceptar la **adquisición de conexión** del pool:

1. Un `TenantAwareDataSource` que envuelva `DataSource.createQueryRunner()` y,
   en `connect()`, ejecute
   `SELECT set_config('app.tenant_id', $1, false)` con el tenant del
   `AsyncLocalStorage` — `false` = ámbito de sesión, luego sobrevive fuera de
   transacción.
2. Al **devolver** la conexión al pool (`release()`),
   `SELECT set_config('app.tenant_id', '', false)`, para que ninguna conexión
   reciclada arrastre el tenant anterior. Ése es el único punto peligroso y hay
   que probarlo explícitamente.
3. Sólo entonces: migración que añade `FORCE ROW LEVEL SECURITY`, y sólo
   entonces el corte de `DATABASE_URL` a `valle_app`.
4. Mientras tanto, y esto es de hoy: extender `TenantScopedRepository` para que
   `update`/`delete`/`softDelete` **lancen** si el `where` no incluye el tenant,
   en vez de pasar de largo. Hoy el patrón correcto existe
   (`mutationScope()`, `cad-documents.repository.ts:661-668`) pero es voluntario.

**Cómo se verifica**: `tenant-rls-coverage.pg.spec.ts` ya existe; ampliarlo para
que, corriendo **como `valle_app`**, (a) una lectura sin `app.tenant_id` devuelva
0 filas, (b) con el tenant correcto devuelva las suyas, (c) una conexión
reciclada tras un `release()` no vea nada. Y un gate que falle si
`FORCE ROW LEVEL SECURITY` aparece en una migración sin que exista el
`set_config` en el runtime.

---

### 3.5 · [ALTA] No hay cuota ni presupuesto por organización

`UsageMeter.record` escribe `design.document.saved` y `design.document.published`
con idempotencia (`cad-documents.repository.ts:377-388`), y el criterio
`growth.metering` lo cobra correctamente. Pero **medir no es limitar**:
`grep -rn "quota|cuota|storageBytes|maxDocuments"` sobre
`modules/commercial/ports/commercial.ports.ts` y `modules/cad/` no devuelve nada.

Los únicos techos que existen son:
`MAX_BLOCKS_PER_TENANT = 200` (`cad-blocks.service.ts:33`) y los límites por
documento del contrato. **No hay techo de número de documentos, ni de bytes
almacenados, ni de versiones.** Combinado con §3.3 (sin recolector), una
organización en el plan base puede almacenar terabytes por 0 € marginales, y
—peor para el operador— **no hay forma de saber cuánto ocupa cada inquilino**:
no existe la métrica.

AutoCAD no tiene este problema porque los bytes son del cliente. Un CAD en el
navegador que se cobra por asiento y almacena sin techo es un negocio con el
coste marginal descontrolado.

**Cómo se construye** (varios días): tabla `tenant_storage_usage`
(`tenant_id, bytes_documents, bytes_blobs, documents, versions, updated_at`)
mantenida por el mismo barrido del §3.3 (una pasada agregada por noche, no un
trigger por escritura), un `entitlement` nuevo `design.storage.bytes` en
`PlanEntitlement` con valor por plan, y un `StorageQuotaGuard` que consulte el
agregado —no un `SUM` en caliente— y responda
`402 quota_exceeded` en `PUT .../content` cuando el plan se supera. Con margen
de gracia y aviso por el outbox de correo, que ya existe.

**Cómo se verifica**: `storage-quota.pg.spec.ts` (guardar por encima del techo →
402 con el código contractual, y el documento **anterior intacto**: nunca se
pierde lo ya guardado por una cuota) y un gauge
`valle_tenant_storage_bytes{organization}` en `/metrics`.

---

### 3.6 · [ALTA] `GET /v1/cad/blocks` carga hasta 400 bloques con su jsonb y filtra en JavaScript

`CadBlocksService.list` (`cad-blocks.service.ts:125-172`):

```ts
const own = await this.blocks.find({ where: this.tenantWhere(), take: MAX_BLOCKS_PER_TENANT });   // 200 filas COMPLETAS
const system = ... await this.blocks.find({ where: this.systemLaneWhere(), take: MAX_SYSTEM_BLOCKS }); // 200 más
const rows = [...system, ...own].sort(...);
// y el término de búsqueda se aplica AQUÍ, en el proceso:
.filter((row) => { ... JSON.stringify(definition.businessLink ?? {}) ... })
```

Cada fila puede llevar una `definition` de hasta **1 MB**
(`MAX_CANONICAL_DEFINITION_BYTES`, `cad-blocks.service.ts:37`). El peor caso de
una sola petición es **400 MB de jsonb** leídos de PostgreSQL, deserializados,
ordenados y filtrados en el hilo único — y el filtro además hace un
`JSON.stringify` por fila. Sin paginación, sin `select`, sin techo de respuesta.

Es exactamente lo contrario de lo que el mismo repositorio hace bien treinta
líneas más allá: `listDocuments` (`cad-documents.repository.ts:167-199`) tiene un
comentario que presume —con razón— de que el filtro, la búsqueda y el conteo van
**en SQL** y de que ninguna fila arrastra el jsonb. La disciplina existe; no se
aplicó aquí.

Y peor, en el controlador:

```ts
// cad.controller.ts:370-374
const row = (await this.blocks.list()).find((b) => b.id === blockId);
```

**`GET /v1/cad/blocks/:id` carga la biblioteca entera para devolver un bloque.**

**Cómo se construye** (horas): mover `q` a SQL con el mismo `nameContains`
(`cad-list-query.ts:66-72`) más un `to_tsvector` sobre
`definition->>'description'` y `definition->'keywords'`; proyectar
`id,name,version,created_at` en el listado y servir `definition` sólo en
`GET /blocks/:id`, que pasa a ser un `findOne` por id con los dos carriles
(`findForMutation` ya tiene el patrón, `cad-blocks.service.ts:87-99`); añadir
`PageQueryDto` al listado. Además: `create()` tiene un TOCTOU entre `count()`
(`:200`) y `save()` (`:222`) — dos peticiones simultáneas pueden pasar de 200;
se cierra con un índice parcial o aceptando el desliz explícitamente.

**Cómo se verifica**: spec que crea 200 bloques con `definition` de 1 MB y
afirma que `GET /blocks` devuelve <256 KB y que `GET /blocks/:id` ejecuta
exactamente una consulta (contador de queries en el `DataSource` de prueba).

---

### 3.7 · [MEDIA] Mensajería y llamadas no cruzan de réplica; presencia sí

Tres funciones «en vivo», tres arquitecturas distintas:

| función | fan-out | ¿multi-réplica? |
|---|---|---|
| presencia CAD | `pg_notify` + cliente `LISTEN` dedicado (`cad-presence.bus.ts`) | **sí** |
| mensajería de equipo | `Subject` de RxJS en proceso (`messaging-event-bus.ts:27`) | no |
| llamadas WebRTC | `Map` en memoria (`call-room-store.ts:88-89`) | no |

Ambas limitaciones están **declaradas por escrito**
(`messaging-event-bus.ts:9-16`, `call-room-store.ts:81-86`), lo cual honra la
cultura de la casa. Pero el efecto para un despacho de 30 personas con 3
réplicas (`DEPLOYMENT.md:364` escala a `--replicas=3`) es concreto: dos
compañeros que caen en réplicas distintas **no se ven en una llamada** y **no
reciben los mensajes del otro por SSE hasta recargar**. Para el usuario eso no
es «una limitación declarada»: es «el chat está roto».

Y el remedio ya está construido en el mismo módulo, cincuenta ficheros más allá.

**Cómo se construye** (un día para mensajería): extraer `CadPresenceBus` a un
`PgNotifyBus<T>` genérico en `common/` (canal parametrizable, misma reconexión,
mismo apagado en SQLite) y hacer que `MessagingEventBus.publish` emita
`pg_notify('valle_messaging', {tenantId, channelId, messageId})`, releyendo la
fila en cada réplica. Las llamadas son más caras (semanas) porque el buzón de
señales SDP/ICE tendría que persistirse; mientras tanto lo correcto es **sesión
pegajosa por documento** en el balanceador, documentado en `DEPLOYMENT.md`, no
callar.

**Cómo se verifica**: spec de dos instancias de `AppModule` contra la misma
PostgreSQL que publica en la A y afirma la recepción por SSE en la B — el patrón
ya existirá al extraer el bus de presencia.

---

### 3.8 · [MEDIA] El fan-out de presencia es cuadrático y se entrega dos veces

`CadPresenceService.beat` (`cad-presence.service.ts:76-82`) hace
`bus.publishLocal(...)` **y** `pg_notify(...)`. El cliente `LISTEN` de la misma
réplica es una conexión `pg` distinta, así que **recibe su propio NOTIFY** y
vuelve a empujar al mismo `Subject`. La cabecera del bus lo asume
(`cad-presence.bus.ts:50-54`: *«una notificación duplicada sólo repite un SELECT
barato»*). Pero cada suscriptor del stream ejecuta
`this.repository.findLivePeer(...)` por evento (`cad-presence.service.ts:131`).

Con `CAD_PRESENCE_BEAT_MS = 4_000` (`:18`) y N peers en el mismo documento:

`consultas/s = N latidos/4 s × N suscriptores × 2 entregas = N² / 2`

Para N = 30 en un mismo plano: **450 consultas por segundo** sólo de presencia,
contra un pool de 20 conexiones. Y con 3 réplicas el `pg_notify` se difunde a
las tres.

**Cómo se construye** (horas): (a) suprimir el eco local — comparar un
`originId` del proceso en la notificación y descartar la que vuelve por
`LISTEN`; (b) sustituir `findLivePeer` por-suscriptor por **una** lectura por
notificación cacheada 1 s en el `Subject` (`shareReplay({bufferSize:1,
refCount:true, windowTime:1000})` por `documentId`), de forma que N suscriptores
compartan una consulta. Coste pasa de N²/2 a N/4.

**Cómo se verifica**: spec que cuenta consultas en el `DataSource` con 30 peers
simulados durante 10 s y afirma `< 100` consultas totales. Y un gauge
`valle_presence_queries_total`.

---

### 3.9 · [MEDIA] Cuatro a seis viajes a la base por petición autenticada, sin caché

Por cada petición con sesión, en serie:

1. `IdentityService.authenticate` → `sessions.findOneBy({id})`
   (`identity.service.ts:283`)
2. …y `users.findOneBy({id})` (`identity.service.ts:297`)
3. `OrganizationAccessService.resolve` → `memberships.findOneBy(...)`
   (`organization-access.service.ts:18`)
4. …y `organizations.findOneBy(...)` (`:23`)
5. `PermissionsGuard` → `hasEntitlement` con dos `innerJoin`
   (`commercial/adapters/postgres.adapters.ts:101-155`)
6. En rutas de escritura CAD, además el `consume` del limitador
   (`postgres-identity-rate-limit.store.ts`)

`grep -n "cache" organization-access.service.ts permissions.guard.ts` → vacío.
Y se nota en la evidencia: `api-load-tests.json` mide `health` en p50 = 46 ms y
`cad-projects-list` en p50 = **122 ms** — **76 ms** de esa diferencia es la
cadena de autenticación, no el trabajo útil. Con 30 personas eso son ~180
consultas/s de puro peaje, contra un pool de 20.

No es un bloqueante (la corrección es impecable: el entitlement compara
`currentPeriodEnd` contra el reloj y falla cerrado,
`postgres.adapters.ts:134-150`), pero es el impuesto que paga cada llamada.

**Cómo se construye** (un día): una caché en proceso de 5–10 s con clave
`sessionId` que guarde `{user, membership, organization, entitlements}`,
invalidada explícitamente por `revoke`/`revokeAll`
(`identity.service.ts:301-320`) y por el cambio de plan. Cinco segundos de
retraso en un cambio de rol es aceptable y está en la mano del producto
declararlo; cinco consultas por petición no lo es. La caché debe ser **por
proceso y acotada** (`Map` con LRU de 5 000 entradas), no Redis.

**Cómo se verifica**: la fase `cad-projects-list` de `api-load-tests.json` debe
bajar su p50 por debajo de 70 ms sin cambiar nada más, y una spec que afirme que
tras `revoke` la siguiente petición es 401 **inmediatamente**.

---

### 3.10 · [MEDIA] `cad_documents` no tiene índice para su propio listado

`listDocuments` (`cad-documents.repository.ts:194-199`) hace
`WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`.
Los índices existentes son
`idx_cad_document_scope (tenant_id, plant_id)` e
`idx_cad_document_project (tenant_id, project_id)`
(`entities/cad-document.entity.ts:23-24`). **Ninguno cubre el orden.**
PostgreSQL leerá todas las filas del inquilino y las ordenará en memoria en cada
listado. Con 200 documentos da igual; un despacho a tres años con 50 000
documentos lo nota en cada apertura de la pantalla inicial.

Igual `cad_document_versions`: `idx_cad_document_version_scope
(tenant_id, document_id)` sin `version`, mientras `listVersions` ordena
`version DESC` (`cad-documents.repository.ts:676`).

Y la búsqueda `q` es `LOWER(name) LIKE '%term%'`
(`cad-list-query.ts:66-72`) — correcta y portable, pero **imposible de indexar**
sin `pg_trgm`.

**Cómo se construye** (horas): migración aditiva con
`CREATE INDEX CONCURRENTLY idx_cad_document_recent ON cad_documents
(tenant_id, created_at DESC) WHERE deleted_at IS NULL`, el simétrico
`(document_id, version DESC)` en versiones, y —cuando la búsqueda pese—
`CREATE EXTENSION pg_trgm` + índice GIN sobre `lower(name)`.
`CONCURRENTLY` no cabe en una transacción de TypeORM: la migración tiene que
declararlo (`transaction = false`), y eso hay que probarlo.

**Cómo se verifica**: `migration-chain.pg.spec.ts` ya corre la cadena; añadir una
spec que siembre 20 000 documentos y afirme por `EXPLAIN` que el plan usa
`Index Scan` y no `Sort`.

---

### 3.11 · [MEDIA] El asiento de auditoría del guardado es «best effort» y va fuera de la transacción

`recordAudit` (`cad-documents.repository.ts:745-757`) delega en
`DesignCadAuditPublisher.record`, que **se traga cualquier error con un `warn`**
(`design-audit-publisher.adapter.ts:37-41`). Y en `saveContent` se llama
**después** de cerrar la transacción (`cad-documents.repository.ts:415-422`):

```ts
const persisted = this.dataSource ? await this.dataSource.transaction(...) : await persist();
await this.recordAudit('cad_document_saved', ...);   // ← fuera, y fail-soft
```

Un fallo de la base entre ambas líneas, o un reinicio, deja **un guardado sin
rastro en la bitácora**. Para el 90 % de los productos eso es aceptable. Para
éste no: `design_audit_log` es el registro que sostiene la promesa de
trazabilidad, y `cad_dxf_exported` —que se audita porque «la exportación entrega
el dibujo COMPLETO», `cad-documents.repository.ts:632-636`— es exactamente el
evento que un despacho necesitaría en una disputa. Un registro de cumplimiento
que puede perderse en silencio no es un registro de cumplimiento.

Es, además, la única «pérdida silenciosa» que he encontrado en el backend, en un
repositorio que dedica 4 puntos de rúbrica a que no las haya.

**Cómo se construye** (horas): meter `recordAudit` **dentro** de la transacción
del `persist()`, pasándole el `manager` como ya hacen `UsageMeter` y
`CadEventPublisher` (`:377-402`), que sí exigen transacción activa y **lanzan**
si no la hay (`:369-372`). El puerto ya admite el patrón; sólo hay que aplicarlo.
Mantener el `catch` fail-soft únicamente para las acciones no sensibles.

**Cómo se verifica**: spec con un `CadAuditPublisher` que lanza, afirmando que
el guardado **entero** revierte (versión sin avanzar, sin fila de historial) para
las acciones declaradas sensibles, y que las no sensibles siguen tolerando el
fallo.

---

### 3.12 · [BAJA] `x-request-id` del cliente entra sin sanear en el log

`AllExceptionsFilter` (`common/filters/all-exceptions.filter.ts:61-64`) toma
`req.headers['x-request-id']`, le hace `.trim()` y lo interpola directamente:

```ts
this.logger.error(`[${requestId}] ${req.method} ${req.originalUrl} -> ${status}: ${message}`, ...)
```

Sin tope de longitud, sin filtro de caracteres. Un cliente puede meter saltos de
línea y escapes ANSI en la bitácora del servidor (inyección de log), y
`req.originalUrl` viaja igual de crudo.

Lo llamativo es que **el mismo repositorio ya resolvió este problema exacto**
cincuenta ficheros antes: el callback de CORS sanea el `Origin` a imprimibles y
200 caracteres, y explica por qué (`main.ts:127-141`). La regla existe; no se
aplicó aquí.

**Cómo se construye** (horas): reutilizar `sanitizeOrigin` de `main.ts` como
`sanitizeHeaderValue` en `observability/scrub.ts` (donde ya viven `scrubText` y
`scrubStack`) y aplicarlo al `requestId` y a `originalUrl`; validar el
`x-request-id` entrante contra `/^[A-Za-z0-9._-]{1,64}$/` y generar un UUID si
no cumple.

**Cómo se verifica**: ampliar `observability/scrub.spec.ts` con un caso de
`x-request-id` con `\n[31m` que afirme que la línea del log sale en una
sola línea y sin escapes.

---

### 3.13 · [BAJA] `DatabaseBlobStore.put` lee el `bytea` completo dos veces sólo para deduplicar

`put` llama a `findBlobBySha` (`design-blob.store.ts:73`) y, tras el
`INSERT … orIgnore`, **otra vez** (`:107`). `findBlobBySha`
(`design-blob.store.ts:186-201`) selecciona `data: true` **a propósito**, y
`assertBlobIntegrity` recalcula el sha256 sobre esos bytes. Es decir: cada
guardado de un documento grande transfiere de PostgreSQL y rehashea **hasta
40 MiB** que ya tiene en memoria.

La intención está escrita (comprobar que la fila content-addressed no está
corrupta) y es defendible como higiene, pero el precio se paga en el camino
caliente descrito en §3.1. La comprobación de integridad pertenece al barrido de
fondo (§3.3), no al `PUT` del usuario.

**Cómo se construye** (horas): `findBlobBySha` con `select` sin `data`; la
comprobación de integridad pasa a comparar `size` y `sha256` de la fila —que es
lo que el direccionamiento por contenido garantiza— y el rehash completo se mueve
a `CadBlobGcService` con muestreo. La segunda llamada tras el `orIgnore` se
sustituye por `RETURNING` del propio `INSERT`.

**Cómo se verifica**: la spec existente
(`design-blob.store.spec.ts`) más un contador de bytes leídos; y una spec del
barrido que detecte un blob corrompido a mano.

---

### 3.14 · [BAJA] Sin trazas distribuidas y sin log estructurado

- `grep -rn "opentelemetry|traceparent" apps/api/src` → vacío. Hay métricas
  (`/metrics`) y reporte de errores compatible con Sentry
  (`observability/adapters/sentry-http.error-reporter.ts`), pero **ninguna traza**.
- `ErrorReportingLogger` extiende `ConsoleLogger`
  (`error-reporting.logger.ts:24-30`) y declara explícitamente que no cambia el
  formato: la salida es **texto plano**, no JSON.
- El `x-request-id` sólo aparece en los logs de 5xx
  (`all-exceptions.filter.ts:73-77`). Una petición lenta pero exitosa no deja
  correlación en ninguna parte.

Para depurar «¿por qué el guardado de Rosa tardó 9 s el martes?» —que es
exactamente la pregunta del §3.1— no hay herramienta.

**Cómo se construye** (un día): un `RequestContextMiddleware` que meta
`requestId` en el `AsyncLocalStorage` que ya usa `TenantContextService`, un
`JsonConsoleLogger` que emita `{ts, level, msg, requestId, tenantId, route}` bajo
`LOG_FORMAT=json`, y propagar `traceparent` en el `HttpMetricsMiddleware`. La
instrumentación OTel completa puede esperar; la correlación no.

**Cómo se verifica**: spec que afirma que una petición con `x-request-id`
conocido produce ese id en el log de acceso **y** en el de error, y un gate que
falle si `LOG_FORMAT=json` produce una línea que no parsea como JSON.

---

### 3.15 · [BAJA] Todas las réplicas aplican migraciones al arrancar

`migrationsRun` es `true` por defecto cuando hay `DATABASE_URL`
(`orm.options.ts:94-98`). Con `--replicas=3` (`DEPLOYMENT.md:364`), las tres
instancias intentan aplicar la cadena a la vez. TypeORM envuelve cada migración
en una transacción y la tabla `migrations` da algo de protección, pero las
migraciones **con DDL no transaccional** (`CREATE INDEX CONCURRENTLY`, que §3.10
va a necesitar) y las que crean roles globales del clúster no la tienen — de
hecho `TenantRuntimeRoleAndDesignBlobsRls` ya tuvo que añadir un
`pg_advisory_lock` propio precisamente por esta carrera
(`migrations/20260823120000-…ts:54-64`, con el razonamiento escrito).

El patrón correcto ya está inventado dentro de la casa; falta subirlo un nivel.

**Cómo se construye** (horas): envolver el arranque de migraciones en
`pg_advisory_lock(hashtext('valle_migrations'))` global, o —mejor para
Kubernetes— desactivar `migrationsRun` y correr la cadena en un
`initContainer`/job previo, que es lo que `DEPLOYMENT.md` ya describe
manualmente.

**Cómo se verifica**: `migration-chain.pg.spec.ts` ampliada con dos procesos que
arrancan simultáneamente contra el mismo esquema y afirman una sola aplicación.

---

## 4 · Defectos concretos del código

| # | Fichero:línea | Qué |
|---|---|---|
| D1 | `apps/api/src/modules/cad-documents/cad-documents.service.ts:290` | `hydrateCadDocument` del documento anterior en **cada** guardado: gunzip + parse + validación de hasta 25 MB para comparar un array de publicaciones que casi siempre está vacío. |
| D2 | `apps/api/src/modules/cad/cad-documents.repository.ts:412` + `:364` | La transacción de PostgreSQL sostiene el `PUT` HTTP al bucket S3 (timeout 30 s, `s3-blob.store.ts:167`), con pool de 20 e `idle_in_transaction_session_timeout` de 30 s. |
| D3 | `apps/api/src/modules/blob-store/design-blob.store.ts:155` | `markForGc` no tiene ningún llamador en producción; `docs/cad/blob-store-s3-migration-and-operations.md:157` afirma al operador que el recolector existe. |
| D4 | `apps/api/src/modules/cad/cad.controller.ts:372` | `GET /blocks/:id` carga la biblioteca entera (`this.blocks.list()`) y filtra en memoria para devolver un bloque. |
| D5 | `apps/api/src/modules/cad-documents/cad-blocks.service.ts:125-172` | `list()` trae 400 filas con `definition` de hasta 1 MB y aplica el término de búsqueda en JavaScript, con un `JSON.stringify` por fila. |
| D6 | `apps/api/src/modules/cad/cad-documents.repository.ts:235` | `getDocument` es un `findOne` sin `select`: arrastra `cad_document` (jsonb) y `dxf_data` (`text`) en `saveContent`, `listVersions`, `listPublications`, `clearDxf` y `getVersion`, que no los usan. |
| D7 | `apps/api/src/modules/cad/cad-documents.repository.ts:415` | El asiento de auditoría del guardado va **fuera** de la transacción y es fail-soft (`design-audit-publisher.adapter.ts:37`): un guardado puede quedar sin rastro en silencio. |
| D8 | `apps/api/src/modules/identity/api-rate-limit.service.ts:40-56` | El 429 no emite la cabecera HTTP `Retry-After`; sólo `retryAfterSeconds` en el cuerpo. Verificado: cero coincidencias de `Retry-After` en todo `apps/api/src`. |
| D9 | `apps/api/src/common/filters/all-exceptions.filter.ts:61-77` | `x-request-id` y `originalUrl` del cliente entran sin sanear en `logger.error` (inyección de log), pese a que `main.ts:127-141` ya resolvió el mismo problema para `Origin`. |
| D10 | `apps/api/src/modules/blob-store/design-blob.store.ts:73` y `:107` | Dos lecturas del `bytea` completo (hasta 20 MiB cada una) más dos rehashes sha256 por cada `put`, en el camino caliente del guardado. |
| D11 | `apps/api/src/modules/cad-documents/cad-blocks.service.ts:200-222` | TOCTOU entre `count()` y `save()`: dos creaciones simultáneas pueden superar `MAX_BLOCKS_PER_TENANT`. |
| D12 | `apps/api/src/modules/cad/cad-presence.service.ts:76-82` + `cad-presence.bus.ts:50` | Doble entrega del latido en la réplica de origen (`publishLocal` + su propio `NOTIFY`), y una consulta `findLivePeer` por suscriptor y por evento ⇒ N²/2 consultas/s. |
| D13 | `apps/api/src/modules/blob-store/blob-store-migration.ts:100` y `s3-blob.store.ts:441` | `migrateBlobsToObjectStore` y `putAtKey` sin ningún punto de entrada: la migración documentada no se puede ejecutar. |
| D14 | `apps/api/src/orm.options.ts:94` | `migrationsRun` activo en todas las réplicas simultáneamente; el `pg_advisory_lock` sólo lo tiene una migración concreta (`20260823120000`), no el arranque. |
| D15 | `docs/cad/evidence/api-load-tests.json` (`largeDocuments.archiveLimitBytes`) | Declara 128 MiB; el contrato vigente son 32 MiB (`packages/contracts/src/design-contracts.ts:204`). El artefacto es un día anterior al cambio. |

---

## 5 · La apuesta ganadora

**Un CAD donde el plano nunca es un fichero de nadie: historial completo,
comparación entre versiones y auditoría, servidos desde una API con contrato
público — y con un presupuesto de guardado que se cumple con treinta personas
dentro.**

La primera mitad ya existe y es lo que AutoCAD estructuralmente no puede dar. En
AutoCAD el plano es un `.dwg` en una carpeta: el «historial» es
`plano_rev_C_FINAL_bueno.dwg`, el «bloqueo» es un `.dwg.lck` que se queda
huérfano cuando a alguien se le cuelga el portátil, y la «auditoría» no existe.
Autodesk vende el remedio aparte (Docs, Vault) por una suscripción más. Valle ya
tiene, **hoy, en el repositorio**: CAS con 409 tipado y ganador único
(`compareAndSwapCadDocument`, `cad-documents.repository.ts:681-708`), historial
inmutable con sha256 por versión (`recordVersion`, `:711`), publicaciones como
recibos server-managed que un cliente **no puede falsificar**
(`cad-documents.service.ts:322-338`), auditoría por actor y acción, enlaces de
revisión con caducidad y revocación, outbox transaccional firmado hacia el ERP
del cliente, y un OpenAPI 3.1 de 5 806 líneas con SDK generado y gate anti-deriva.
Eso es Vault, y viene incluido, y se integra por HTTP en vez de por un
`ObjectARX` compilado.

Y la evidencia de que la parte difícil funciona ya está publicada:
`review-concurrency.json` demuestra, contra la API real, que **dos personas
guardando el mismo plano a la vez producen exactamente un ganador y un 409, y
que el perdedor fusiona con la función real del editor hasta un 200 con ambos
trabajos presentes** — cinco rondas por corrida, tres corridas, cero 5xx. Eso es
literalmente lo que un `.dwg` en una carpeta compartida no puede hacer: allí el
segundo en guardar pisa al primero, o no puede abrir.

La segunda mitad —«con treinta personas dentro»— es lo que falta, y es la única
razón por la que esta dimensión no saca un 8. La apuesta, entonces, es
**convertir el guardado en la operación medida y presupuestada del producto**:
publicar un `docs/cad/evidence/api-save-concurrency.json` con 30 escritores
concurrentes sobre documentos de 100 000 entidades y un veredicto verde contra un
umbral de producto (`p95 ≤ 5 s`, cero 5xx no declarados, cero abortos por
`statement_timeout`), exactamente con el mismo rigor con el que ya se publica
`browser-slo-100k.json` —incluida la disposición a que el artefacto **desmienta**
el punto que concede, que es lo que hace creíble a toda la rúbrica.

Si dentro de seis meses un despacho puede decir *«somos treinta, trabajamos sobre
los mismos planos a la vez, nadie ha pisado a nadie nunca, y puedo ver quién
cambió qué en marzo»*, eso no es una versión más barata de AutoCAD: es algo que
AutoCAD no vende. Y el camino para llegar ahí son los cuatro arreglos de §3.1 y
§3.2 —quitar la hidratación, sacar el blob de la transacción, proyectar el
`SELECT`, poner el semáforo—, que suman menos de dos semanas y son la diferencia
entre un backend correcto y un backend que aguanta.

---

*Informe escrito en español. Auditor: ingeniero senior externo. Ningún fichero de
producto fue modificado.*
