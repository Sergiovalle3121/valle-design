# PHASE1-PLAN — Frontera interna dentro de valle-enterprise

Objetivo: al cerrar esta fase, las rutas CAD del monorepo quedan desacopladas de modo que el
filtrado por rutas de la Fase 3 sea limpio, sin romper ninguna ruta existente (adaptadores de
compatibilidad temporales) y con TODAS las suites verdes contra el baseline.

Basado en los hallazgos de IMPORT-GRAPH.md e INVENTORY-CAD.md. Cada WP es un commit pequeño;
verificación (typecheck + suites afectadas) entre WPs; suite completa al cerrar la fase.

## WP1 — Backend: romper la circularidad documents ↔ line-engineering

Hoy: `documents.module.ts:20,34,58` y `blob/document-blob-lifecycle.service.ts:7,32-75`
importan `SfLineLayout` para que el GC de blobs no recolecte blobs CAD vivos; a la vez
`line-engineering.module.ts` importa `DocumentsModule` (por `DOCUMENT_BLOB_STORE`).

Mecanismo: **registro de proveedores de referencias de blobs** (inversión de dependencia):
- `documents/blob/blob-reference-registry.ts`: `BlobReferenceProvider { name; referencedBlobKeys(): Promise<Iterable<string>> }`
  + `BlobReferenceRegistry` (register/all), proveído y exportado por `DocumentsModule`.
- `DocumentBlobLifecycleService` deja de conocer CAD: escanea PDF (doc_document_versions) y
  Office (doc_authoring_assets) como hoy —cero cambio funcional Office— y además consulta los
  providers registrados.
- `line-engineering/cad-blob-references.provider.ts` (nuevo): escanea `sf_line_layouts.cad_document`
  y `snapshots[].cadDocument` usando los helpers de `cad-document-storage.ts` (el conocimiento
  del formato de puntero vuelve a su dueño). Se registra en el arranque del módulo.
- La dirección permitida queda: CAD → documents(neutral). La prohibida (documents → CAD) muere.
- Specs: fixtures CAD del GC se mueven a spec del provider; el spec del lifecycle usa un
  provider falso.

## WP2 — Backend: separar CadDocumentsModule de line-engineering

- Nuevo `apps/api/src/modules/cad-documents/` (**CadDocumentsModule**) con lo CAD-puro:
  `cad-document-storage`, `cad-document-validation`, `cad-blocks.service`, `cad-intent.service`,
  `cad-intent-tools`, `cad-vision.service`, `cad-vision-prompt`, `line-dxf` (escritor DXF),
  `entities/sf-cad-block.entity`, el provider de WP1, y `CadDocumentsService` con los métodos
  CAD extraídos de `LineEngineeringService` (hydrate/store/CAS del CadDocument,
  recordCadPublication, saveLayoutArchive, rama CAD de saveLayout/snapshots, DXF get/set/clear/
  export). Los specs CAD se mueven con su código.
- `line-engineering` queda como **IndustrialEngineeringModule** (los 64 archivos industriales +
  puentes MES). Compatibilidad: alias de export (`LineEngineeringModule`/`LineEngineeringService`
  siguen existiendo como alias deprecados) para no tocar a los 5 consumidores industriales ni a
  los seeds en este WP; el controller mantiene el prefijo `/line-engineering` y delega la parte
  CAD en `CadDocumentsService` (adaptador temporal — las rutas nuevas `/v1/cad/*` llegan en
  Fase 2/3).
- Puertos neutrales en `cad-documents/ports/`: `CadBlobStore` (adaptador sobre
  `DOCUMENT_BLOB_STORE`), `CadAuditPublisher` (adaptador sobre EventLedger), `CadEventPublisher`
  (no-op inicial; eventos design.* en Fase 2), `CadAiProvider` (chat+visión, OPCIONAL — adaptador
  que construye CideProvider si hay `CIDE_BASE_URL`; ausencia ⇒ `available:false`),
  `PlatformIdentityClient`/`EntitlementClient`/`UsageMeter` (adaptadores in-proc sobre
  TenantContext/entitlements hoy; clientes HTTP reales en Fase 2). El código CAD importa SOLO
  puertos.

## WP3 — Backend: tablas cad_* propias con proyección de compatibilidad

- Nuevas entidades + migración ADITIVA: `cad_projects`, `cad_documents`,
  `cad_document_versions`, `cad_publications`, `cad_review_sessions`, `cad_comments` — todas
  con `tenant_id`, `legacy_source_id` (→ `sf_line_layouts.id` cuando aplica) y columnas del
  modelo canónico.
- `SfLineLayout` NO se toca ni se borra. Proyección de compatibilidad: el guardado CAD legacy
  (vía `/line-engineering/layout*`) sigue escribiendo `sf_line_layouts` Y proyecta upsert a
  `cad_documents`/`cad_document_versions` (idempotente por `legacy_source_id`+versión CAS).
  Lectura sigue sirviéndose de la fuente legacy (cero riesgo de regresión); la fuente nueva
  toma el mando en valle-design (Fase 3/4).
- Los datos históricos se copian con el exportador de Fase 4, no aquí.

## WP4 — Frontend: corregir la capa invertida y sacar lo industrial de lib/cad

- Mover a `lib/cad/` los módulos reales que hoy viven en `components/line-engineering` y que
  `lib/cad/commands` importa: `snap-engine`, `geom-edit`, `geom-measure`, `cad-array`,
  `dimension-format` (verificar archivo por archivo; `precision-input` ya vive en lib/cad y el
  wrapper está al revés). Wrappers de re-export en las rutas viejas (compatibilidad temporal).
- Mover fuera de `lib/cad/` los 10 archivos industriales: `line-balance{,.spec}`,
  `line-balance-assignment{,.spec}`, `line-balance-metrics{,.spec}`, `flow-optimization{,.spec}`,
  `material-flow-route{,.spec}` → `apps/web/src/lib/line-engineering/`. Actualizar importadores
  (`LineBalancePanel`, barrel `lib/cad/index.ts`, etc.). El barrel deja de exportar industrial.

## WP5 — Frontend: desacoplar Layout3DEditor de los globals

- El editor deja de importar `AuthContext`/`WorkspaceContext`/`ThemeContext`/`ToastContext`/
  `operatorChrome`/`brand` directamente: recibe `identity {userId, tenantId}`,
  `scope {buildingId?, projectId?}`, `theme`, `onNotify`, `onFullscreenChange`, `branding` por
  props con un wrapper `Layout3DEditorHost` (enterprise) que inyecta los contextos actuales.
  Las 2 páginas host montan el Host → cero cambio de comportamiento.

## WP6 — Frontend: paneles industriales como extensiones inyectadas

- `ANALYSIS_PANELS` (17 paneles industriales) sale del editor a un registro inyectable
  (`extensionPanels` prop). El host de line-engineering (enterprise) inyecta los 17; el host
  standalone `/dashboard/cad` deja de cargarlos (quedan ENTERPRISE_OWNED; la variante
  "industry pack" para Design se decide en Fase 3 con los packs de lib/cad). ⚠️ Verificar E2E
  dorados: si algún spec CAD standalone ejercita paneles industriales, ajustar el spec al host
  enterprise SIN debilitar la cobertura (Regla 6) y documentarlo.

## WP7 — Cierre de fase

- Suite completa (build, typecheck, lint api/web, specs web 136, unit api 2,468+pg 17,
  tenant-safety) comparada contra BASELINE.md. Actualizar STATE.md, DECISIONS.md,
  CLASSIFICATION.md (rutas nuevas post-split) y congelar `FILTER-REPO-PATHS.txt` (insumo
  Fase 3).

## Orden y paralelismo

WP1 ∥ WP4 (backend vs web, cero solape de archivos) → verificar+commit → WP2 → WP3 → commit →
WP5 → WP6 → WP7. Cada WP es reversible con `git revert`.
