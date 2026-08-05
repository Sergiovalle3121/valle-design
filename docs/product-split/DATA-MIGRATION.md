# DATA-MIGRATION — Fase 4: migración de datos enterprise → design

> Herramienta de exportación/importación de los datos CAD históricos de
> `valle-enterprise` (`sf_line_layouts`, `sf_cad_blocks`, `doc_blobs`) hacia el
> modelo propio de `valle-design` (`cad_projects`, `cad_documents`,
> `cad_document_versions`, `cad_publications`, `sf_cad_blocks`, `design_blobs`).
> Hoy NO hay datos productivos: la herramienta quedó validada punta a punta con
> fixtures representativos (resultados exactos al final de este documento) y
> lista para el corte real.

## 1. CLI

Código: `apps/api/src/migration-cli/` (workspace `valle-design-api`). Parsing
de argv a mano (mismo patrón sin dependencias que `seed`/`scripts/*.js`).

```bash
# Desde apps/api (o con --workspace=valle-design-api desde la raíz):
npm run migrate:from-enterprise -- <comando> [flags]
```

Conexiones por variable de entorno (override con flag):

| Variable | Flag | Rol |
|---|---|---|
| `DATABASE_URL_SOURCE` | `--source <url>` | BD enterprise (origen). **Solo SELECTs, estructural** (§5). |
| `DATABASE_URL_TARGET` | `--target <url>` | BD design (destino). |

### Comandos

```bash
# EXPORT — produce el archivo de exportación versionado (directorio)
npm run migrate:from-enterprise -- export --out /ruta/export \
    [--tenant <id>]...      # alcance por tenant; omitir = todos los tenants
    [--dry-run]             # solo reporta conteos, no escribe nada
    [--delta-base /ruta/export-anterior/manifest.json]   # export DELTA

# IMPORT — escribe el archivo en la BD design (idempotente)
npm run migrate:from-enterprise -- import --archive /ruta/export \
    [--tenant <id>]...      # importa solo esos tenants del archivo
    [--project-id <uuid>]   # usa ese proyecto (requiere alcance de UN tenant)
    [--dry-run]             # valida integridad + reporta qué haría
    [--resume]              # salta lo ya importado sin re-verificar bytes

# VERIFY — paridad origen vs destino; exit 1 ante CUALQUIER discrepancia
npm run migrate:from-enterprise -- verify [--tenant <id>]...

# ROLLBACK — borra del destino EXACTAMENTE lo del manifiesto importado
npm run migrate:from-enterprise -- rollback --archive /ruta/export \
    [--tenant <id>]... [--dry-run]
```

Exit codes: `0` éxito/paridad limpia · `1` error de datos o discrepancias ·
`2` error de uso (flags inválidas).

Smoke integrado: `npm run smoke:migration` (siempre valida el arranque de la
CLI; con `DATABASE_URL_SOURCE`+`DATABASE_URL_TARGET` corre el ciclo real
export→import→verify y exige verify limpio).

Utilidades de prueba (NO operativas): `npm run migrate:fixture:seed [-- bump]`
siembra la BD fixture desechable / simula un guardado nuevo en el origen;
`src/migration-cli/fixtures/make-truncated-archive.ts` fabrica un archivo "a la
mitad" para ensayar interrupciones.

## 2. Archivo de exportación (formato v1)

Directorio autocontenido; `manifest.json` lleva el sha256 y el conteo de CADA
NDJSON — `import` y `rollback` verifican TODO antes de tocar el destino (un
archivo truncado/alterado se rechaza completo, exit 1):

```
export/
  manifest.json        archiveFormat=1, alcance, conteos totales y por tenant,
                       sha256+registros por NDJSON, huellas por documento/bloque
                       (para delta y rollback) y lista de blobs
  documents.ndjson     1 documento por línea (canónico TAL CUAL: inline o puntero)
  versions.ndjson      versiones CAS (canónica + derivadas de snapshots, etiquetadas)
  publications.ndjson  recibos de publicación extraídos del documento hidratado
  blocks.ndjson        bloques sf_cad_blocks
  blobs.ndjson         metadata de blobs (tenant, sha256, size, blobKey origen)
  blobs/<sha256>       bytes crudos (gzip) por contenido; nombre = sha256
```

Todo registro lleva `legacySourceId` (+ `tenantId`, lane `NULL` = sistema).
Los blobs se verifican **al leer del origen** (sha256 de los bytes vs fila) y
**al escribir en destino** (sha256 del archivo vs nombre y vs manifiesto):
cualquier corrupción detiene el comando con exit 1.

## 3. Semántica del mapeo (enterprise → design)

| Origen | Destino | Clave de idempotencia |
|---|---|---|
| `sf_line_layouts` (con `cad_document`, `deleted_at IS NULL`) | `cad_documents` | (tenant, `legacy_source_id` = id del layout) |
| canónico + `snapshots[].cadDocument` | `cad_document_versions` | (document_id, version) — índice único |
| `publications[]` del documento canónico hidratado | `cad_publications` | (tenant, document, `legacy_source_id` = id del recibo) |
| `sf_cad_blocks` | `sf_cad_blocks` | (tenant, `legacy_source_id` = id del bloque) |
| `doc_blobs` referenciados por punteros | `design_blobs` | (tenant, sha256) — content-addressed |
| — | `cad_projects` | 1 por tenant: «Importado de Enterprise» (`legacy_source_id='enterprise-import'`) o `--project-id` |

Detalles:

- **Documento canónico**: se copia TAL CUAL vive en el origen (JSON inline o
  puntero `_storage.kind='document_blob'`), preservando `cad_document_version`
  (token CAS). Nombre derivado `modelo revisión` (mismo criterio que la
  proyección WP3). `layers` y las 8 columnas `dxf_*` (plano + colocación) van a
  sus columnas propias.
- **Metadata industrial sin columna en Design** (connectors, assets,
  annotations, cells, aprobación status/by/at/note, footprint y el RESUMEN de
  snapshots) viaja en `cad_documents.legacy_metadata` (jsonb, NULL en
  documentos nativos) — evidencia de la copia, no contrato del editor.
- **Versiones etiquetadas**: la canónica ocupa su slot CAS con `label NULL` y
  `legacy_source_id = <layoutId>:v<version>`; cada snapshot con `cadDocument` y
  token CAS válido crea su versión con `label` = nombre del snapshot y
  `legacy_source_id` = id del snapshot. Conflictos: la canónica GANA su slot;
  duplicados idénticos se colapsan; un snapshot con contenido DISTINTO en un
  slot tomado se descarta con aviso (jamás se inventa un número de versión que
  el CAS legacy no vivió). El historial en destino es INMUTABLE: si una versión
  ya existe con otro contenido, se reporta discrepancia y no se pisa.
- **Blobs**: dedup content-addressed en destino por (tenant, sha256). Si el
  contenido ya existe (incluso de otro import o nativo) se REUTILIZA su
  `blob_key` (resucitando la marca de GC si la tenía) y el puntero importado se
  RE-ESCRIBE a esa clave (`_storage.blobKey`; el sha jamás cambia). Si no
  existe, se inserta conservando la blobKey del origen (los punteros quedan
  válidos sin re-escritura); colisión de PK global → clave nueva + re-escritura.
  Mismo sha con tamaño distinto = colisión → alto con exit 1.
- **Monotonía**: el upsert de documentos/bloques NUNCA retrocede el destino
  (un archivo viejo contra un destino ya avanzado reporta
  `destino_mas_nuevo` como discrepancia). Mismo espíritu que la proyección WP3.
- **Timestamps**: `created_at` del origen se preserva al insertar;
  `updated_at` es del destino.

### Delta (re-export solo de lo cambiado)

`export --delta-base <manifest.json anterior>` compara por documento
(`cad_document_version` **y** `updated_at` — cubre cambios de snapshots/dxf/
metadata sin bump del CAS) y por bloque (`version` + `updated_at`), y solo
empaqueta lo cambiado. Los blobs ya empaquetados en el base no se re-empaquetan;
el import los resuelve contra el destino por sha (un delta requiere el import
del base — si falta un blob, el registro se rechaza con error explícito). El
manifiesto delta conserva las huellas ACUMULADAS de documentos para poder
encadenar deltas; para blobs usa como base el último manifiesto pasado
(recomendación operativa: usar siempre el manifiesto del último export
aplicado).

### Idempotencia y `--resume`

Re-ejecutar `import` con el mismo archivo produce **0 duplicados**: cada
registro idéntico reporta `sin_cambios` (los índices únicos parciales
`uq_*_tenant_legacy` + (document_id, version) respaldan la garantía a nivel
SQL). `--resume` además salta la re-verificación de bytes de blobs ya
presentes (reanudación rápida tras una interrupción). El import escribe con
autocommit por registro: un corte deja un estado parcial VÁLIDO que la
siguiente pasada completa.

## 4. Esquema nuevo en design (migración `20260802090000-MigrationLegacyImport`)

Aditiva pura (guards `IF NOT EXISTS`; `down` exacto):

- `cad_documents.legacy_metadata` jsonb NULL;
- `cad_document_versions.label` varchar(120) NULL y
  `cad_document_versions.legacy_source_id` varchar(96) NULL;
- `sf_cad_blocks.legacy_source_id` varchar(64) NULL + índices únicos parciales
  `uq_sf_cad_block_tenant_legacy` / `uq_sf_cad_block_legacy_lane` (patrón
  `erp_bank_transactions`, igual que cad_projects/cad_documents).

## 5. READ-ONLY del origen

**Estructural en la herramienta** (no por convención): la conexión origen
(`SourceReader`) fija `default_transaction_read_only = on` al conectar y corre
TODO dentro de una única transacción `REPEATABLE READ READ ONLY` — cualquier
escritura accidental muere con SQLSTATE `25006` (probado:
`cannot execute UPDATE in a read-only transaction`) y el export ve un snapshot
consistente aunque haya escritores concurrentes. `verify` usa la misma
conexión. `import`/`rollback` NI SIQUIERA se conectan al origen.

**Procedimiento operativo para el corte real** (mandato: los datos viejos
quedan read-only durante el periodo de rollback; decisión del operador, dos
mecanismos complementarios):

1. **Usuario de solo lectura para la migración** (recomendado SIEMPRE):
   ```sql
   CREATE ROLE valle_migracion LOGIN PASSWORD '…';
   GRANT CONNECT ON DATABASE valle_design TO valle_migracion;
   GRANT USAGE ON SCHEMA public TO valle_migracion;
   GRANT SELECT ON sf_line_layouts, sf_cad_blocks, doc_blobs TO valle_migracion;
   ```
   y usar ese usuario en `DATABASE_URL_SOURCE`.
2. **Congelar la escritura CAD en enterprise tras la copia** (elegir una):
   - *REVOKE a nivel base* (duro, recomendado si enterprise ya no debe escribir
     CAD):
     ```sql
     REVOKE INSERT, UPDATE, DELETE ON sf_line_layouts FROM <rol_app_enterprise>;
     REVOKE INSERT, UPDATE, DELETE ON sf_cad_blocks   FROM <rol_app_enterprise>;
     REVOKE INSERT, UPDATE, DELETE ON doc_blobs       FROM <rol_app_enterprise>;
     ```
     Reversible con `GRANT` si hay que abortar el corte.
   - *Flag de aplicación* (suave): desplegar enterprise con el guardado CAD en
     solo-lectura (rechazar PUT/CAS de layouts) manteniendo la lectura viva.
     Menos invasivo, pero depende del despliegue — documentar cuál se eligió.

   La ventana de rollback termina cuando `verify` lleva N días limpio y el
   negocio firma; hasta entonces NO se borra nada del origen y el archivo de
   exportación se conserva (es el insumo del `rollback`).

## 6. Rollback (documentado + implementado)

`rollback --archive <dir>` borra del destino **exactamente** lo declarado por
ese archivo (tras verificar su integridad):

1. `cad_documents` por (tenant, `legacy_source_id`) de `documents.ndjson`; el
   FK `ON DELETE CASCADE` arrastra SUS `cad_document_versions` y
   `cad_publications`. ⚠️ Si tras el import hubo ediciones NATIVAS sobre un
   documento importado, viven en esa misma fila y se van con ella — el reporte
   imprime cuántas versiones/publicaciones arrastró cada borrado.
2. `sf_cad_blocks` por (tenant, `legacy_source_id`).
3. `design_blobs` de los sha del manifiesto SOLO si tras el borrado ningún
   puntero vivo (`cad_documents`/`cad_document_versions`) los referencia; un
   blob aún referenciado se conserva y se reporta.
4. El proyecto «Importado de Enterprise» del lane SOLO si quedó sin documentos.

Filas SIN `legacy_source_id` (nativas de Design) son intocables por
construcción: todo DELETE filtra por los ids del manifiesto. `--dry-run`
simula el estado post-borrado (mismos números que el borrado real, 0
escrituras). `--tenant` restringe el rollback a esos lanes.

## 7. Casos del modelo legacy que NO se migran (decisión + razón)

| Caso | Decisión | Razón |
|---|---|---|
| Layout sin `cad_document` | No genera `cad_documents` (contado como `sin_documento`) | No hay documento CAD que abrir en Design; su dxf/assets son estado industrial de enterprise, no un documento del editor. Mandato explícito de la misión. |
| Layout con `deleted_at` | No se exporta | Borrado suave legacy: no es parte del corpus vivo. |
| Snapshot con `cadDocument` pero SIN token CAS válido (`cadDocumentVersion` ausente/0) | No genera versión (aviso `snapshot_sin_version`); su resumen queda en `legacy_metadata.snapshots` | `cad_document_versions` exige un slot CAS entero real; inventar números corrompería la monotonía del historial. |
| Snapshot que reclama un slot CAS ya tomado con contenido DISTINTO | Se descarta con aviso `conflicto_version_snapshot` (gana la canónica/primera) | El mismo token CAS con dos contenidos es una inconsistencia del origen; el historial destino es inmutable y determinista. |
| `cad_document` presente con `cad_document_version = 0` | El documento se copia; no genera fila de historial (aviso) | CAS 0 = «sin guardar» en ambos modelos; el historial arranca en v1. |
| Recibo de publicación malformado (sin sha256 hex/bytes/hojas) | Se descarta con aviso `publicacion_invalida` | `cad_publications` exige el recibo íntegro; el documento viaja igual (el recibo embebido sigue dentro del JSON). |
| Publicaciones embebidas en versiones HISTÓRICAS | Solo se extraen las del canónico | Los recibos históricos son copias del arreglo server-managed; extraerlos duplicaría recibos. Siguen visibles dentro del JSON de cada versión. |
| Estado industrial puro: `sf_line_stations`, cells como flujo de balanceo, `bay_layouts`, event ledger | Fuera del alcance | Pertenecen al producto industrial (D-004/D-005); Design solo recibe el documento CAD y su metadata como evidencia. |
| Filas de `doc_blobs` no referenciadas por ningún puntero exportado | No se exportan | El blob store es content-addressed por referencia; copiar huérfanos re-importaría basura pendiente de GC. |

## 8. Resultados de la VALIDACIÓN punta a punta (2026-08-02, esta máquina)

Fixtures: BDs desechables locales (PostgreSQL 16.13). Archivo completo:
`documents=5, versions=9, publications=4, blocks=3, blobs=2` (412,887 bytes en
blobs; sha `7047c2cf…` 206,445 B tenant-alfa y `f737bb92…` 206,442 B
tenant-beta).

**4.a — BD fixture del origen**: `valle_enterprise_fixture` creada;
`npm run migration:run` del repo enterprise (su árbol intacto) → exit 0, **76
migraciones ejecutadas**, 274 tablas.

**4.b — Fixtures sembrados** (`migrate:fixture:seed`, exit 0): 2 tenants; 6
layouts (5 con `cad_document`: inline con unicode «Línea Ñandú 🏭», >1 MB como
puntero gzip real por tenant, DOS documentos de tenant-alfa compartiendo EL
MISMO blob por dedup, 1 sin documento), snapshots embebidos + con puntero + sin
token CAS (borde), publicaciones dentro del documento (inline y dentro del
blob), aprobación, dxf con colocación, capas, connectors/assets/annotations/
cells; 3 bloques con versiones; 2 blobs gzip con sha256 correcto.

**4.c — Ciclo completo** (todos los exit codes verificados):

| Paso | Resultado | Exit |
|---|---|---|
| `export --dry-run` | documentos=5 versiones=9 publicaciones=4 bloques=3 blobs=2; `sin_documento=1`; 1 aviso `snapshot_sin_version` | 0 |
| `export` real | mismos conteos; por tenant: alfa 3/6/3/2/1, beta 2/3/1/1/1 | 0 |
| `import --dry-run` | 5/9/4/3/2 «insertados» previstos, 0 escrituras | 0 |
| `import` real | insertados 5/9/4/3/2; paridad archivo=destino OK en las 5 entidades | 0 |
| `verify` | paridad LIMPIA, 0 discrepancias (ambos tenants) | 0 |
| `import` de nuevo (idempotencia) | **0 duplicados**: sin_cambios 5/9/4/3/2; conteos de BD idénticos (5/9/4/3/2 + 2 proyectos) | 0 |
| `bump` en origen (layout inline alfa v3→v4) + `export --delta-base` | **solo 1 documento** (3 versiones, 1 publicación, 0 bloques, 0 blobs); `sin_cambios(delta)=7` | 0 |
| `import` delta + `verify` | 1 actualizado + 1 versión nueva (v4); paridad LIMPIA | 0 |
| Interrupción simulada: archivo truncado a la mitad (3/5 docs, 6/9 versiones, 3/4 pubs, 2/3 bloques, 1/2 blobs) → `import` | estado parcial válido (paridad del archivo truncado OK) | 0 |
| `import` archivo completo `--resume` | completa lo faltante: insertados 2/3/1/1/1, resto sin_cambios; + delta → `verify` LIMPIO | 0 |
| NDJSON truncado SIN manifiesto recalculado | rechazado por integridad («sha256 ≠ manifiesto»), destino intacto | 1 (probado en spec) |
| `rollback --dry-run` | reporta EXACTO lo que borraría (5 docs/10 versiones/4 pubs/3 bloques/2 blobs/2 proyectos), 0 escrituras | 0 |
| `rollback` real | borra 5/10/4/3/2/2 (las 10 versiones = 9 importadas + v4 del delta); BD destino en 0 en las 6 tablas | 0 |
| `verify` post-rollback | muestra el destino LIMPIO de lo importado: destino=0 en todo, 14 discrepancias «ausente en destino» | **1** (paridad rota a propósito) |
| Re-import completo final (full + delta) + `verify` | paridad LIMPIA, 0 discrepancias | 0 |

**4.d — Aislamiento de tenants**: BD destino fresca + `import --tenant
tenant-alfa` → llegan SOLO 3/6/3/2/1 de alfa; **0 filas de tenant-beta en las 6
tablas** (consulta directa). `verify --tenant tenant-alfa` detectó además, con
precisión, que el archivo era previo al bump (v3 vs v4 en origen, exit 1);
tras aplicar el delta del tenant → paridad LIMPIA (exit 0) y beta sigue en 0.

**4.e — Verificación cruzada con la API real**: `npm run build` + boot de
`dist/main.js` contra la BD destino (SYNCHRONIZE=false) y JWT real (HS256,
secreto dev, rol admin, tenant-alfa) contra `/v1/cad`:

- `GET /v1/cad/documents` → 200, 3 documentos de alfa;
- apertura del inline → 200, v4, unicode intacto («Línea Ñandú 🏭 — «alfa-uno»
  v4»), 1 publicación embebida, colocación DXF (`planta-alfa-ñ.dxf`, scale 2,
  rotation 90);
- **apertura del >1 MB → 200 HIDRATADO**: 11,001 entidades, 1,282,559 bytes
  inline en la respuesta, sin puntero (`_storage` ausente) — el editor podría
  abrirlo;
- `GET …/versions` → 200, 4 versiones (4,3,2,1: canónica delta + import +
  snapshots etiquetados); `GET …/publications` → 200 (recibo
  `plano-alfa-ñ.pdf`); `GET …/dxf` → 200; `GET /v1/cad/blocks` → 200 (2 bloques
  alfa);
- token de tenant-beta ve SOLO sus 2 documentos (aislamiento también en API).

**READ-ONLY estructural probado**: un `UPDATE` por la MISMA conexión del
export → `SQLSTATE 25006: cannot execute UPDATE in a read-only transaction`.

## 9. Pruebas y gates

- **Unitarias nuevas** (5 suites / 47 tests, `src/migration-cli/*.spec.ts`):
  parser de punteros y del modelo legacy (`extract.spec.ts` — 15: sin
  documento, versiones etiquetadas, conflictos de slot, snapshot sin CAS,
  publicaciones válidas/malformadas/sin id, dedup de blobKeys, delta);
  upsert idempotente y monótono + dedup/reescritura de punteros
  (`import-plan.spec.ts` — 15); integridad del archivo (`archive.spec.ts` — 6:
  round-trip, NDJSON truncado, blob corrupto/ausente, formato desconocido);
  hashes estables (`stable-json.spec.ts` — 5); parsing de argv
  (`main.spec.ts` — 3).
- **Suite api completa**: 24 suites passed / 149 tests passed (+1 suite pg
  aparte 4/4 con `TEST_DATABASE_URL`) — nada roto (baseline previa 19/102).
- `npm run typecheck` limpio; `npm run lint:check` 0 errores.
- `npm run smoke:migration` verde (ciclo real export→import→verify exit 0).
- **gitleaks 8.24.3**: historial completo (406 commits) → **0 hallazgos**;
  filesystem de todo lo nuevo (`migration-cli/`, migración, scripts, docs) →
  0 hallazgos.

## 10. Operación del corte real (runbook corto)

1. Congelar/anunciar ventana; crear usuario `valle_migracion` (solo SELECT).
2. `export --dry-run` (conteos esperados) → `export --out <dir>` → guardar el
   directorio (es el insumo de import, delta y rollback).
3. `import --dry-run` contra design → revisar reporte → `import`.
4. `verify` → debe salir 0. Si sale ≠0: investigar; `rollback --archive <dir>`
   restaura el destino exacto.
5. Aplicar §5.2 (REVOKE o flag) en enterprise; ventana de rollback abierta.
6. Cambios tardíos en origen → `export --delta-base <manifest>` → `import` →
   `verify`.
7. Cierre de ventana: firma de negocio + retiro del CAD enterprise (Fase 6).
