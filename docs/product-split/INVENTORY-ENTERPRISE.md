# INVENTORY-ENTERPRISE — Lo que se queda y sus puntos de contacto con el CAD (Fase 0)

Módulos que permanecen en valle-enterprise y cómo tocan hoy al CAD. El detalle archivo-por-
archivo de las fronteras está en IMPORT-GRAPH.md; la clasificación completa en CLASSIFICATION.md.

## Módulos ENTERPRISE_OWNED (se quedan)

ERP completo (`erp-core`, finanzas, compras, ventas, inventario, MRP, calidad, mantenimiento,
HCM/people), MES (`mes-execution`, señales, quality holds, `material-staging`, work orders,
`production-plan`, `npi`, `operator-terminal`, `cost-intelligence`, `oee`, `genealogy`…),
ingeniería industrial (`line-engineering` menos su núcleo CAD: estaciones, takt, balanceo,
yamazumi, estudios de tiempos, staffing, capacidad), `engineering` (EngineeringDocument
CAD-lite legado para Visual Aids — D-004), `bay-layout`, infraestructura neutral de archivos
(`documents` → blob/CAS tras la división de Fase 1), IA general (`ai`/CIDE), y Platform
(`auth`, `users`, `entitlements`, `licensing`, `billing` — PLATFORM_OWNED, consumido por
Design vía API en Fase 2).

---

# Inventario: Subsistema DOCUMENTOS / ALMACENAMIENTO y su circularidad con CAD

## 1. `apps/api/src/modules/documents/` — estructura completa

18 archivos. El módulo cumple TRES roles distintos que la Fase 1 debe separar conceptualmente:
(a) infraestructura NEUTRAL de blobs, (b) backend editorial de PDF Studio (Office), (c) ref-counting de GC que conoce CAD y Office (la circularidad).

### Estructura y tablas

| Archivo | Rol | Tabla |
|---|---|---|
| `documents.module.ts` | Wiring NestJS. **Importa la entidad CAD `SfLineLayout` (línea 20)** y la Office `AuthoringAsset` (línea 19) | — |
| `documents.controller.ts` | REST `/documents`: upload, list, detail, trash/restore, operaciones PDF (rotate/delete/reorder/watermark/add_text/organize), imágenes, forms inspect/diff/fill, propuestas NCR, anotaciones, links a `visual_aid`, descarga de contenido, audit, y `POST /documents/blobs/gc` (GC bifásico, líneas 80-102) | — |
| `documents.service.ts` | Dominio documental PDF: versiones, dedup por sha256, idempotencia, anotaciones, links, propuestas NCR (EventLedger dominio ENGINEERING) | — |
| `documents.service.spec.ts` | Tests del servicio (usa `DatabaseDocumentBlobStore` real) | — |
| `dto/document.dto.ts` | DTOs | — |
| `pdf/pdf-engine.service.ts` (+`.spec`) | Motor de manipulación PDF (pdf-lib + sharp). Consumido por DocumentsService, document-authoring y ai-knowledge. **NO lo usa CAD** | — |
| `entities/document.entity.ts` | Documento PDF | `doc_documents` |
| `entities/document-version.entity.ts` | Versión inmutable; `blob_key` → doc_blobs; sha256, pageCount, idempotencyKey, malwareScanState | `doc_document_versions` |
| `entities/document-blob.entity.ts` | **NEUTRAL**: blob content-addressed; PK `blob_key`, unique (tenant_id, sha256), `data` BINARIO EN BD, `gc_marked_at` | `doc_blobs` |
| `entities/document-annotation.entity.ts` | Anotaciones PDF | `doc_document_annotations` |
| `entities/document-link.entity.ts` | Links documento→negocio (hoy solo `visual_aid`) | `doc_document_links` |
| `entities/document-action-proposal.entity.ts` | Propuestas NCR desde AcroForms (puente PDF→Calidad) | `doc_action_proposals` |
| `blob/document-blob-store.ts` | **NEUTRAL**: contrato `DocumentBlobStore` (put/get/getRange/head/delete), `StreamingDocumentBlobStore` (S3 futuro, sin adaptador), símbolo `DOCUMENT_BLOB_STORE` | — |
| `blob/database-document-blob.store.ts` | **NEUTRAL**: adaptador DB (dedup sha256, colisión→409, desmarca GC al re-put, delete solo con marca GC; acotado a 20 MiB) | `doc_blobs` |
| `blob/document-blob-lifecycle.service.ts` | **MIXTO/CIRCULAR**: GC mark-and-sweep bifásico que escanea referencias de PDF + Office + **CAD** | — |
| `blob/document-blob-lifecycle.service.spec.ts` | Tests del GC **con fixtures CAD** | — |

### (a) Infraestructura neutral (queda en enterprise)
- `blob/document-blob-store.ts`, `blob/database-document-blob.store.ts`, `entities/document-blob.entity.ts` (tabla `doc_blobs`).
- Nota: los nombres "ManagedFiles"/"BlobStorage" del brief **no existen en el código** — la infraestructura neutral real se llama `DocumentBlobStore`/`DatabaseDocumentBlobStore`/`DocumentBlob` (`doc_blobs`). Las listas de filter-repo deben usar estos nombres.
- Consumidores del store neutral: DocumentsService (PDF Studio), DocumentAuthoringModule (Office; re-provee el símbolo `DOCUMENT_BLOB_STORE` él mismo, `document-authoring.module.ts:36-41`), LineEngineeringService (CAD), y ai-knowledge (IA, vía `DocumentsService` con `moduleRef.get`, `ai-knowledge.service.ts:252,304`). Sheets/presentations/visual-aids **no** lo usan.

### (b) Funciones editoriales Office dentro de documents
`documents.controller.ts` + `documents.service.ts` + `pdf/pdf-engine.service.ts` + DTOs + entidades no-blob = backend de **PDF Studio**. Sus únicos consumidores frontend son `apps/web/src/app/dashboard/pdf-studio/page.tsx` (19 referencias) y `apps/web/src/components/document-authoring/*`. También tiene ganchos enterprise (propuestas NCR→Calidad, links a visual-aids/MES, ai-knowledge) — queda físicamente en enterprise en cualquier caso; NO TOCAR salvo lo listado en (c).

### (c) Puntos EXACTOS donde documents importa CAD (circularidad a romper)

| # | Archivo | Línea | Qué importa/hace |
|---|---|---|---|
| 1 | `apps/api/src/modules/documents/documents.module.ts` | **20** | `import { SfLineLayout } from '../line-engineering/entities/sf-line-layout.entity';` |
| 2 | ídem | **34** | Registra `SfLineLayout` en `TypeOrmModule.forFeature` |
| 3 | ídem | **58** | `provideTenantScopedRepository(SfLineLayout, { strict: true })` |
| 4 | `apps/api/src/modules/documents/blob/document-blob-lifecycle.service.ts` | **7** | `import { SfLineLayout } from '../../line-engineering/entities/sf-line-layout.entity';` |
| 5 | ídem | **32-41** | `cadBlobKeyFromStoredDocument()` — conoce el formato de puntero CAD `_storage.kind === 'document_blob'` |
| 6 | ídem | **52-53** | Inyecta `TenantScopedRepository<SfLineLayout>` |
| 7 | ídem | **56-75** | `referencedBlobKeys()` lee `layout.cadDocument` y `snapshot.cadDocument` de cada `sf_line_layouts` para proteger blobs CAD del GC |
| 8 | `apps/api/src/modules/documents/blob/document-blob-lifecycle.service.spec.ts` | **5** | Importa `SfLineLayout`; fixtures CAD en líneas 23, 33, 71, 89-90, 141-159, 216-223 |

El ciclo a nivel de directorios: `documents` → `line-engineering/entities` (solo entidad, no módulo) y `line-engineering` → `documents` (módulo completo + símbolo del store). No hay ciclo NestJS en runtime, pero sí acoplamiento circular de paquete que bloquea la extracción.

(Import Office análogo, no circular con CAD: `documents.module.ts:19` y `document-blob-lifecycle.service.ts:6` importan `AuthoringAsset` de document-authoring.)

## 2. Cómo usa el CAD este almacenamiento

### Backend (única vía real)
- `line-engineering.module.ts:16,70` importa `DocumentsModule` **exclusivamente** para obtener `DOCUMENT_BLOB_STORE`.
- `line-engineering.service.ts:68-69` importa el símbolo y el tipo; `391-392` inyección opcional `cadBlobs?: DocumentBlobStore`; `463-469` `requireCadBlobs()`.
- `hydrateCadDocument()` (~472-485): si `cad_document` es puntero → `get(blobKey)` + `decodeCadDocumentArchive` + validación.
- `storeCadDocument()` (~487-509): CadDocument JSON > **1 000 000 bytes** (`CAD_DOCUMENT_BLOB_THRESHOLD_BYTES`) → gzip nivel 6 → `put(compressed, sha256)` → guarda puntero; ≤ umbral → JSON inline en la columna.
- Sitios de uso: guardado de layout (~2124), restauración de snapshots (~2428), publicación de sheet sets (~1449), y `saveLayoutArchive()` (~1881-1917) que recibe el gzip del cliente.
- `cad-document-storage.ts` (100% CAD, va a design): formato del puntero `_storage: { kind:'document_blob', version:1, blobKey, sha256, encoding:'gzip', compressedBytes, uncompressedBytes }` + `summary`; encode/decode gzip acotado (20 MiB comprimido / `CAD_DOCUMENT_MAX_ARCHIVE_BYTES` descomprimido, verificación de integridad sha256).
- Publicación PDF CAD: `recordCadPublication()` (~1377-1476) guarda **solo el recibo** (fileName, sha256, bytes, paperSpaceIds, publishedBy/At) dentro de `cadDocument.publications`; el PDF se genera en el cliente y NO se almacena en doc_blobs.

### Frontend
El editor CAD **nunca llama a `/documents/*`**. Persiste vía line-engineering:
- `apps/web/src/components/line-engineering/Layout3DEditor.tsx`: `GET/PUT /line-engineering/layout`, `PUT /line-engineering/layout/cad-archive` (línea 7743; multipart con gzip generado por `gzipCadDocumentJson` de `apps/web/src/lib/cad/large-document-transport.ts` usando `CompressionStream`), más `/layout/dxf`, `/layout/snapshots`, `/layout/publications`, `/cad-blocks`, `/layout/cad-intent`, `/layout/vision`.
- Los únicos consumidores web de `/documents` son PDF Studio y document-authoring (Office).

**Conclusión**: la dependencia CAD→almacenamiento es 100% server-side y se reduce a la interfaz `DocumentBlobStore.put/get`. El repo design solo necesita esa abstracción (o su propio store), no el API REST de documents.

## 3. document-authoring y document-authoring-engine — confirmación Office

- `apps/api/src/modules/document-authoring/` (13 archivos: servicio, controller, feature-guard, entidades `AuthoringDocument`/`AuthoringRevision`/`AuthoringAsset` (`doc_authoring_assets`, blob_key→doc_blobs), interop docx-import y document-render): **cero referencias a CAD** (grep de `cad|CadDocument|line-engineering|sf_line` sin resultados). → OFFICE_NO_TOCAR.
- Acoplamiento con almacenamiento neutral: `document-authoring.module.ts:5-8,25,36-41,45` (importa DocumentsModule, DatabaseDocumentBlobStore, DOCUMENT_BLOB_STORE, entidad DocumentBlob y re-provee el símbolo); `document-authoring.service.ts:36-37,90-91` e `interop/document-render.service.ts:57-58,181-182` inyectan el store. Todo queda en enterprise; sin impacto en la extracción CAD.
- `packages/document-authoring-engine/` (commands, layout, migration, patch, serialize, validation): motor puro Word-like, **cero referencias a CAD ni al almacenamiento**. → OFFICE_NO_TOCAR.

## 4. Dónde viven físicamente los blobs

- **En la base de datos, no en filesystem ni S3**: tabla `doc_blobs`, columna `data` (`BINARY_COLUMN_TYPE` = bytea/blob), PK `blob_key` (UUID), dedup por `(tenant_id, sha256)` (`uq_doc_blob_tenant_hash`), `gc_marked_at` + índice `idx_doc_blobs_gc`. S3/streaming es solo una interfaz (`StreamingDocumentBlobStore`) sin adaptador; el adaptador DB está acotado a 20 MiB por el límite del upload.
- Tablas de almacenamiento: `doc_blobs` (bytes), `doc_documents`, `doc_document_versions` (blob_key), `doc_authoring_assets` (blob_key), y del lado CAD `sf_line_layouts.cad_document` (JSON inline O puntero a doc_blobs) + `sf_line_layouts.snapshots[].cadDocument` (ídem) + `sf_line_layouts.dxf_data` (**DXF crudo TEXT inline en la fila**, nunca en doc_blobs; migración legacy `20260622160000-AddLayoutDxf.ts`).
- Migraciones: `20260723040000-CreateDocumentPlatform.ts` crea `doc_documents/doc_blobs/doc_document_versions/doc_document_annotations/doc_document_links`; `20260728100000-AddDocumentBlobLifecycle.ts` añade `gc_marked_at`; `20260724010000-AddCanonicalCadDocument.ts` añade `cad_document`/`cad_document_version` a `sf_line_layouts` (exclusivamente CAD); `20260726120000-CreateDocumentAuthoring.ts` (Office); `20260724030000-CreateDocumentActionProposals.ts` (PDF Studio→NCR); `20260706180000-AddCadBlocks.ts` y `20260728110000-ProfessionalCadBlockLibrary.ts` (CAD).

## Estrategia sugerida para romper la circularidad (Fase 1, informativa)
1. Extraer de `document-blob-lifecycle.service.ts` el conocimiento CAD (`cadBlobKeyFromStoredDocument` + escaneo de `SfLineLayout`) hacia un mecanismo de proveedores de referencias (interfaz `BlobReferenceProvider` que cada producto registra) o una tabla de refs explícita — documents deja de importar entidades ajenas.
2. Eliminar `SfLineLayout` de `documents.module.ts` (líneas 20/34/58).
3. En valle-design: store de blobs propio para archivos CAD gzip (el formato de puntero y encode/decode ya viven en `cad-document-storage.ts`, que se va entero) + migración de los blobs CAD referenciados desde `doc_blobs`.