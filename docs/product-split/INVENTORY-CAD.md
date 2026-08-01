# INVENTORY-CAD — Inventario exhaustivo del producto CAD (Fase 0)

Generado por 8 lectores paralelos verificando el código real en BASELINE_SHA `4cf045a`.
Secciones: frontend, backend, pruebas/fixtures/dorados, base de datos/migraciones,
configuración/dependencias/catálogo.

---



<!-- ══════════ SECCIÓN: FRONTEND (apps/web) ══════════ -->

# Inventario CAD del Frontend (apps/web) — Fase 0

## 1. apps/web/src/lib/cad — hechos verificados

**Conteo exacto: 227 archivos / 53.269 líneas** (coincide con la hipótesis "~227 archivos/53k líneas"). Estructura casi plana: 188 archivos en la raíz + 39 en `commands/`. 106 de los 227 son pruebas (`*.spec.ts`): 94 en raíz + 12 en commands. La cobertura de pruebas viaja junto al código (misma carpeta), lo que simplifica la extracción.

### Desglose por subsistema (suma exacta = 227 / 53.269)

| Subsistema | Archivos | Líneas | Contenido representativo | Clasificación |
|---|---|---|---|---|
| Comandos de dibujo (`commands/`) | 39 | 13.134 | parser, executor, registry, history, transform, mirror, move, duplicate, delete, select, label, place-symbol, wall-edit, geometry-cleanup, validators, targets, audit, esquemas de tools OpenAI-compatible | DESIGN |
| Kernel geométrico y entidades | 54 | 6.579 | primitives, ellipse, spline, hatch(+asociatividad), mtext-layout, mleader, dimension(+asociativas), block, annotations, curve-tessellate, geom-constraints, geom-trim, intersect, collisions, live-constraints, fillet, array, divide-measure, measurements, unit-format, world-scale | DESIGN |
| Layouts, paper space, plot, viewports | 16 | 7.696 | cad-layout-manager, paper-space, plot-sheet (tamaños de papel), layout-export-adapter, templates, viewport-bookmarks, native-viewport, minimap | DESIGN |
| Comandos raíz y UX (palette/toolbar/bloques) | 15 | 4.199 | command-palette, command-session, command-line-assist, keyboard-shortcuts, toolbar, symbols (biblioteca), professional-blocks (atributos), index | DESIGN |
| Interop DXF/DWG | 17 | 4.446 | dxf-import/export, dxf-export-readiness (manifiesto de pérdida), dxf-cad-document, dxf-layer-map, specs de roundtrip/hatch/insert/dimension/block, interop-provider (DWG no disponible) | DESIGN |
| Documento CAD, snapshots y recovery | 20 | 3.994 | cad-document (documento canónico), editor-snapshot, snapshots (diff), large-document-transport, cad-recovery (+codec, +worker, +worker-client), validation-report, rule-engine, object-properties | DESIGN |
| Render nativo y performance | 12 | 3.732 | entity-runtime, entity-three, basic-native-adapters, native-render-budget, perf-baseline, benchmarks (entity-runtime, snap-query, progressive-scene-sync) | DESIGN |
| Industry packs (arquitectura/almacén/seguridad) | 12 | 3.918 | industry-pack (framework CAD-NEXT-090), industry-rollup (CSV), architecture, polygon-room, warehouse-generators (racks/docks), safety-zones (pasillos, ESD, salidas de emergencia — a nivel dibujo) | DESIGN |
| Snapping y precisión | 11 | 1.191 | snapping, osnap, polar-tracking, precision-input, precision-tracking, dynamic-input | DESIGN |
| Xrefs, colaboración, workspace, copiloto | 8 | 1.202 | cad-xrefs, cad-collaboration (review/compare), cad-workspace, copilot-contract (contexto seguro con redacciones para IA) | DESIGN |
| Capas, estilos, linetypes | 8 | 905 | layer, layers (capas canónicas), cad-layer-manager, linetype | DESIGN |
| Selección | 5 | 644 | selection-controller, selection-shapes (polígono/fence), native-selection-index | DESIGN |
| **Industrial infiltrado en lib/cad** | **10** | **1.629** | line-balance (takt, cuellos de botella), line-balance-assignment (RPW/LCR), line-balance-metrics (yamazumi local), flow-optimization (cruces/backtracking), material-flow-route | **ENTERPRISE — sacar de lib/cad en Fase 1** |

Veredicto: `lib/cad` es 217/227 archivos (51.640 líneas) DESIGN_OWNED puro; los 10 archivos industriales (1.629 líneas) son algoritmos de balanceo/flujo autocontenidos (solo `material-flow-route` importa `flow-optimization`; ninguno importa el kernel CAD salvo `safety-zones→collisions`, que sí es design) — se extraen limpio hacia enterprise.

## 2. UI CAD — conteo real

**El claim "~72 archivos de UI CAD" es impreciso**: `apps/web/src/components/line-engineering/` tiene exactamente 72 archivos (59 al tope + 13 en `cad-workbench/`), pero es un directorio MIXTO. Desglose verificado:

| Grupo | Archivos | Líneas | Clasificación |
|---|---|---|---|
| `cad-workbench/` (paletas CAD: bloques, cotas, hatch, mtext, mleader, xrefs, colaboración, layouts, selección, dynamic input, command dock, workspace dock) | 13 | (incl. abajo) | DESIGN |
| Libs y vistas CAD al tope (dxf.ts, dxf-walls, dxf-snap, snap-engine, geom-edit/measure, plot-scale/sheet, precision-input, dimension-format, auto-dimensions, cad-command/array/intent/vision/format-detect, asset-catalog, PlantMinimap, ScaleBar, Minimap, professional-snapping.spec) | 34 | 4.975 (junto con workbench) | DESIGN |
| Paneles industriales (YamazumiChart, LineBalancePanel, CostEstimator, OperatorLoops, BufferPlanner, StandardWork, WhatIfSimulator, ScenarioCompare, SensitivityChart, FlexLine, LineCohesion/Continuity/Density, LayoutScorecard, ChangeoverMatrix, ClearanceAnalysis, LayoutHistory, DossierExport, Layout3D) + libs de línea (arrange-line, connect-line, flow-metrics) | 22 | 3.580 | ENTERPRISE |
| Mixtos: **Layout3DEditor.tsx (10.562 líneas)**, LayoutEditor.tsx (2.388, huérfano), design-checks.ts (140) | 3 | 13.090 | MIXED_SPLIT_REQUIRED |

**Conteo real de UI CAD: 48 archivos DESIGN puros (13 workbench + 34 top-level + 1 página) + 3 mixtos a dividir.** Los otros 22 del directorio son industriales puros.

### Rutas Next.js
- `/dashboard/cad` (`app/dashboard/cad/page.tsx`, 63 líneas) — **CAD Studio standalone**. Monta `Layout3DEditor` con `standalone` y los identificadores persistidos **`AXOS-CAD-STUDIO` / `UNIVERSAL`** hardcodeados (hecho confirmado). DESIGN_OWNED.
- `/dashboard/line-engineering` (page.tsx 984 + error.tsx 77) — página industrial (work elements, importar estaciones, capa IE, llama `POST /line-engineering/work-elements/import-from-stations`) que monta el mismo editor en modo línea. ENTERPRISE_OWNED.
- `/dashboard/engineering` (363 líneas) — hub de ingeniería enterprise (modelos, visual aids, takt/yamazumi links). ENTERPRISE_OWNED.
- No existen rutas `design/`, `studio/` ni `line-design/`. `entitlementNav.ts` mapea además `/dashboard/bay-layout` al producto design, pero **esa ruta no existe** (entrada fantasma).

### Hooks y contextos
**No existe ningún hook ni contexto CAD-específico.** El editor CAD importa directamente el chrome global: `AuthContext`, `WorkspaceContext` (tenant), `ThemeContext`, `ToastContext`, `lib/apiFetch`, `lib/glass`, `lib/operatorChrome`, `config/brand` (PRODUCT_LABEL.design) — confirma el acoplamiento auth/tenant/workspace/marca/temas descrito en la misión. El repo design necesitará shims/equivalentes de plataforma.

### apps/web/src/lib/design/ — NO es CAD
`lib/design/domains.ts` (93 líneas, único archivo) es el sistema de diseño VISUAL del dashboard enterprise (paleta de colores por departamento: planeación, almacén, MES, calidad...). Nombre engañoso. ENTERPRISE_OWNED.

## 3. UI industrial cargada en modo CAD standalone (hallazgo clave)

`Layout3DEditor.tsx` define el registro `ANALYSIS_PANELS` (línea 324) con **17 paneles industriales** (Yamazumi, balance local, simulador de capacidad, WIP/buffers, bucles de operador, holguras, continuidad/cohesión/densidad, costo por unidad, sensibilidad a demanda, comparar escenarios, trabajo estándar, línea flexible, dossier, bitácora) cargados vía `dynamic()`. El menú "Análisis" que los monta (líneas 8634-8641 y 10452+) **NO está condicionado por `standalone`** — solo 6 usos de `standalone` en 10.562 líneas, todos cosméticos (pestaña Puntos/Estaciones, título, ocultar botones acomodar/conectar línea). Es decir: **el CAD Studio "universal" en `/dashboard/cad` ofrece Yamazumi, costos, operadores y balanceo**, y esos paneles llaman endpoints `line-engineering/*` (clearance, history, dossier, heatmap, copilot). Los paneles en sí son ENTERPRISE_OWNED; `Layout3DEditor.tsx` es el MIXED_SPLIT_REQUIRED central de la Fase 1: núcleo CAD (~todo lo que importa de `lib/cad`, 60+ imports) → design; registro `ANALYSIS_PANELS`, `arrange/connectLine`, `flowMetrics`, endpoints `line-engineering/*` → enterprise (o inyección por plugin).

Otros dos mixtos: `LayoutEditor.tsx` (editor 2D fabric.js legado, importa DXF + los mismos 18 paneles industriales; **huérfano — nadie lo importa**) y `design-checks.ts` (validación pura: solapes/fuera-de-huella = CAD; estaciones-sin-colocar/fuera-de-flujo = línea).

La IA CAD frontend (`cad-intent.ts`, `cad-vision.ts`, `copilot-contract.ts` — normalizadores puros, DESIGN) invoca al backend en `${API_BASE}/line-engineering/layout/copilot` y `/layout/optimize-copilot` (proveedor CIDE general, ADR §215) — dependencia confirmada, vía rutas con prefijo line-engineering.

## 4. i18n, estilos, assets, pruebas y scripts

- **i18n**: no existe namespace CAD. Las cadenas del editor están **hardcodeadas en español dentro de los componentes**. En `apps/web/messages/` solo hay claves de marketing: `landing.json` (tarjeta de módulo `"cad"`, stack "ERP · MES · CAD · AI"), `products.json` (bloque `"design"`), `pricing.json` (SKU `"design"`, línea 115 en/es) — archivos compartidos, split a nivel de clave (MIXED). Los matches en auth/commercial son falsos positivos ("cada", "caducan").
- **Estilos**: sin CSS CAD. `globals.css` no tiene reglas CAD; `styles/tiptap.css` es del editor Office (no tocar).
- **Public assets**: `public/` solo tiene icon.svg, manifest, sw.js — nada CAD. **No hay ningún `.dxf` en apps/web** (el corpus DXF dorado vive en el backend).
- **Pruebas e2e**: `e2e/golden/` tiene 19 specs CAD (`10-cad-native-entities` … `28-cad-osnap-pointer`) + `cad-acceptance-journey.ts/.check.ts` → DESIGN (21 archivos). `e2e/performance/cad-viewport-100k.spec.ts` → DESIGN. Golden 01–09 son enterprise; `10-axos-sheets-professional-core` es Office. `e2e/fixtures/` (constants, mock-backend, session) es arnés compartido sin contenido CAD (los specs CAD lo consumen — copiar al repo design). `e2e/visual-sweep/` incluye checks interactivos CAD ("Salir del CAD", botón Cerrar) dentro de barridos de toda la app → MIXED.
- **Scripts**: `scripts/cad-perf-scale.mts` → DESIGN; `check-nav.mjs` y `run-specs.mjs` son arnés compartido (run-specs ejecuta también los specs de lib/cad) → ENTERPRISE con ajuste.
- **Config plataforma**: `lib/entitlementNav.ts` mapea `/dashboard/cad`, `/dashboard/line-engineering` y `/dashboard/bay-layout` (inexistente) al producto `design`; `config/brand.ts` define `productNames.design` / `%PRODUCT_DESIGN%` → PLATFORM_OWNED (design lo consumirá por API/config propia).

## 5. Totales para la extracción frontend

| Bloque | Archivos | Líneas aprox. |
|---|---|---|
| lib/cad DESIGN puro | 217 | 51.640 |
| lib/cad industrial (queda) | 10 | 1.629 |
| UI CAD DESIGN pura (workbench + libs + página) | 48 | ~5.040 |
| UI mixta a dividir (Layout3DEditor, LayoutEditor, design-checks) | 3 | 13.090 |
| UI industrial del mismo directorio (queda) | 22 | 3.580 |
| Pruebas e2e + script perf CAD | 23 | — |


<!-- ══════════ SECCIÓN: BACKEND (apps/api — line-engineering) ══════════ -->

# Inventario BACKEND — apps/api/src/modules/line-engineering/ (Fase 0)

**85 archivos, ~19,040 líneas.** El módulo es el caso central de la separación: contiene el producto CAD (documento canónico, bloques, DXF, publicaciones, IA) incrustado dentro del módulo de Ingeniería Industrial (balanceo, takt, estaciones, staffing, WIP, MES). Confirmados los hechos a verificar: `LineEngineeringService` (4,120 líneas) mezcla ambos mundos; `DocumentsModule` importa `SfLineLayout` (circularidad); la IA CAD depende del proveedor general CIDE (`../ai/cide-provider`).

## 1. Clasificación por archivo

### DESIGN_OWNED (15 archivos — CAD puro)

| Archivo | Qué es |
|---|---|
| `cad-document-storage.ts` (+`.spec.ts`) | Almacenamiento del CadDocument: gzip nivel 6, SHA-256, puntero a blob CAS (`StoredCadDocumentBlobPointer`), límites 1 MB inline / 20 MB comprimido / 128 MB expandido, gunzip acotado anti-zip-bomb |
| `cad-document-validation.ts` (+`.spec.ts`) | Validación del CadDocument schema v1–v3: entities (≤100k), blocks (≤2k), constraints (≤250k), paperSpaces (≤500), viewports (≤32/hoja), publications (≤1k), versiones CAD (≤12), review threads (≤500), auditoría de colaboración (≤500) — vocabulario 100% CAD |
| `cad-blocks.service.ts` (+`.spec.ts`) | Biblioteca de bloques CAD del tenant (ADR §224): CRUD sobre `sf_cad_blocks`, `CadBlockDefinition` canónica (id/name/entities/basePoint), versionado monotónico al redefinir |
| `entities/sf-cad-block.entity.ts` | Entidad TypeORM `sf_cad_blocks` — block definitions estilo AutoCAD |
| `cad-intent.service.ts` | NL→CAD (Fase 69) + copiloto de optimización (Fase 72): llama a CIDE con las CAD tools y devuelve tool-calls crudas. IA CAD opcional; degrada con gracia |
| `cad-intent-tools.ts` (+`.spec.ts`) | Especificación de herramientas CAD para el modelo (setFootprint, placeAsset, drawWall, addDimension, arrangeLine, connectLine, moveStation, cleanupGeometry) + system prompts. Importa `CideToolSpec` de `../ai/cide-provider` |
| `cad-vision.service.ts` | Vision→CAD (Fase 71): vectoriza imagen de plano a JSON de muros/zonas vía CIDE multimodal (cliente fetch propio) |
| `cad-vision-prompt.ts` (+`.spec.ts`) | Prompt de visión, validación anti-SSRF (solo data URLs), armado de mensajes multimodales |
| `line-dxf.ts` (+`.spec.ts`) | Escritor DXF R12 ASCII puro (Fase 53/66/68): capas nombradas con AutoCAD Color Index, cajas rotadas, segmentos, textos, círculos, arcos, flip de eje Y. Serialización CAD sin lógica industrial — su consumidor `getLayoutDxf` queda del lado enterprise y en Fase 1 debe consumir esto como lib compartida o API de design |

### ENTERPRISE_OWNED (64 archivos — industrial puro)

| Archivo(s) | Qué es |
|---|---|
| `entities/ie-balance.entities.ts` | 10 entidades IE: work elements, estudios de tiempos, observaciones, allowances, escenarios/asignaciones de balance, skills, recursos, constraints, templates de proceso |
| `entities/sf-line-station.entity.ts` | `sf_line_stations`: ruteo, NP esperado, factor de uso, tiempo estándar, CTQ + columnas aditivas `layout_x/y/w/h/rotation` (colocación física — se queda: es el plano de planta industrial) |
| `entities/sf-model-line.entity.ts` | `sf_model_lines`: calificación modelo↔línea, changeover SMED, takt objetivo |
| `line-balance.ts/.spec.ts`, `line-balance-solver.ts/.spec.ts`, `line-time-study.ts/.spec.ts`, `line-process-templates.ts/.spec.ts` | Matemática de balanceo/takt, solver de asignación IE, tiempo estándar con IQR, templates EMS por industria (usa `IndustryId` de `@axos/contracts` → SHARED_PROTOCOL) |
| `line-staffing`, `line-buffer`, `line-loops`, `line-stdwork`, `line-cost`, `line-sensitivity`, `line-compare`, `line-flexline`, `line-changeover`, `line-capacity`(en service), `line-dossier`, `line-review`, `line-scorecard`, `line-approval` (todos `.ts`+`.spec.ts`) | Manning, WIP/ley de Little, bucles de operador, SWCT, costo unitario, sensibilidad a demanda, comparación A/B, línea flexible multi-modelo, matriz SMED, expediente CSV, revisión consolidada, scorecard de salud, formato de eventos de aprobación del layout industrial |
| `line-flow`, `line-flowdir`, `line-cellflow`, `line-continuity`, `line-cohesion`, `line-collision`, `line-clearance`, `line-density`, `line-takeoff`, `line-autoarrange`, `line-optimize` (todos `.ts`+`.spec.ts`) + `line-completeness.spec.ts` | Análisis espaciales del layout de planta (spaghetti, retrocesos, flujo inter-celda, topología, cohesión, SAT/colisiones, pasillos, densidad, take-off de materiales, serpentina, 2-opt). Son geometría, pero su propósito es ingeniería de planta (facility layout), no el motor de documento CAD — se quedan |
| `station-status.service.ts/.spec.ts` | Overlay MES en vivo: deriva luz por estación de `SfFloorEvent`/`SfQualityHold`/`SfReplenishCall`/`SfWorkOrder` (read-only sobre tablas de otros módulos) |
| `station-bay.service.ts/.spec.ts` | Puente a Material Staging: bahía 1–6 por estación cruzando NP con `bay_layouts` |

### MIXED_SPLIT_REQUIRED (6 archivos)

**`entities/sf-line-layout.entity.ts`** — tabla `sf_line_layouts`:
- → DESIGN: `cad_document` (documento canónico v3), `cad_document_version` (token CAS), `layers` (capas CAD Fase 66), `dxf_data/dxf_name` + 6 columnas de colocación DXF, el campo `cadDocument`/`cadDocumentVersion` dentro de `LayoutSnapshot`, interfaces `LayoutLayer` y la parte de dibujo de `LayoutAnnotation` (cotas/texto)
- → ENTERPRISE: scope modelo/revisión, footprint/unit/gridSize, ciclo de aprobación (`approval_*`), `connectors` (flujo de material), `assets` (equipos — alimentan takeoff/clearance/density), `cells` (celdas de manufactura), `snapshots` (posiciones/footprint)
- Interfaces `LayoutAsset`/`LayoutConnector` las consumen ambos lados (también `sf-cad-block.entity` importa `LayoutAsset`) → candidatas a contrato compartido.

**`line-engineering.service.ts`** (4,120 líneas) — ver §3.

**`line-engineering.controller.ts`** (73 endpoints) — ver §2.

**`line-engineering.module.ts`** — ver §5.

**`dto/line-engineering.dto.ts`** (1,122 líneas, 27 clases):
- → DESIGN: `CreateCadBlockDto`, `UpdateCadBlockDto`, `CadIntentDto`, `CadVisionDto`, `RecordCadPublicationDto` (sha256, paperSpaceIds, expectedCadDocumentVersion), `DxfMetaDto`, `UploadDxfDto`, `LayoutLayerDto`, y en `SaveLayoutDto` los campos `cadDocument` + `expectedCadDocumentVersion`
- → ENTERPRISE: `CreateStationDto`, `UpdateStationDto`, `QualifyModelLineDto`, `UpdateModelLineDto`, `CreateIeTimeStudyDto`, `CreateIeTimeObservationDto`, `ProposeIeBalanceScenarioDto`, `CreateIeWorkElementDto`, `ImportIeProcessTemplateDto`, `LayoutFootprintDto`, `LayoutPositionDto`, `LayoutConnectorDto`, `LayoutCellDto`, `CloneLayoutDto`, `CreateSnapshotDto`, `SetApprovalDto`, resto de `SaveLayoutDto`
- Ambiguos/compartidos: `LayoutAssetDto`, `LayoutAnnotationDto` (los usan el editor CAD y los análisis industriales)

**`line-engineering.service.spec.ts`** (1,511 líneas, ~50 tests): mezcla tests industriales (balance, staffing, SWCT, calificaciones) con tests CAD (persistencia del documento canónico, rechazo de escrituras stale/CAS, `encodeCadDocumentArchive`, blob pointers, publications server-managed).

## 2. Controller: 73 endpoints (prefijo `/line-engineering`, guards JwtAuthGuard+PermissionsGuard, permisos `engineering:read|write`)

### CAD (14)
| Método+Ruta | Nota |
|---|---|
| POST `/layout/cad-intent` | NL→CAD vía CIDE (IA opcional) |
| GET `/layout/optimize-copilot` | Copiloto IA (Fase 72) — servido por CadIntentService; semántica industrial (recorrido), motor CAD-IA |
| POST `/layout/vision` | Vision→CAD vectoriza plano |
| GET/POST `/cad-blocks`, PATCH/DELETE `/cad-blocks/:id` | Biblioteca de bloques (4 endpoints) |
| PUT `/layout/cad-archive` | Guardado atómico layout + CadDocument gzip vía CAS (multipart, 20 MB) |
| POST `/layout/publications` | Recibo inmutable de publicación PDF vectorial (hash+hojas+actor) |
| GET `/layout/dxf`, PUT `/layout/dxf`, DELETE `/layout/dxf` | DXF de fondo (raw/carga/quita) |
| GET `/layout/dxf-export` | Exporta layout como DXF R12 |

### MIXED (7)
| Método+Ruta | Split |
|---|---|
| GET `/layout` | Devuelve layout industrial + `cadDocument` hidratado desde blob + `cadDocumentVersion` |
| PUT `/layout` | Guarda posiciones/footprint industrial y, opcionalmente, el CadDocument con CAS |
| POST `/layout/clone` | Clona footprint/equipos/posiciones (industrial) pero también `dxf_data` crudo (CAD) |
| GET/POST `/layout/snapshots`, POST `/layout/snapshots/:id/restore`, DELETE `/layout/snapshots/:id` | Los snapshots embeben `cadDocument` (o su blob pointer); restore re-almacena el blob e incrementa la versión CAS |
| GET `/layout/history` | Timeline que mezcla eventos industriales (`SF_LINE_LAYOUT_*`) con eventos CAD (`SF_CAD_DOCUMENT_REVISION_SAVED`, `SF_CAD_SHEET_SET_PUBLISHED`, `SF_LINE_LAYOUT_DXF_*`) |

### INDUSTRIAL (52)
- **IE balance/tiempos (13):** POST `/balance-scenarios/:id/apply`, GET `/balance-scenarios/:id`, POST `/balance-scenarios/propose`, GET `/balance-scenarios`, GET `/process-templates/defaults`, POST/GET `/time-studies`, POST `/time-studies/:id/observations`, POST `/time-studies/:id/calculate-standard-time`, POST/GET `/work-elements`, POST `/work-elements/import-from-template`, POST `/work-elements/import-from-stations`
- **Estaciones/ruteo/calificación (12):** GET `/stations`, GET `/stations/:id`, POST `/stations`, PATCH `/stations/:id`, GET `/routing`, GET `/requirements`, GET `/qualifications`, POST `/qualifications`, PATCH `/qualifications/:id`, GET `/balance`, GET `/capacity`, GET `/kpis`
- **Análisis de layout (27):** GET `/layout/takeoff|clearance|scorecard|continuity|cohesion|density|cells|status|quality|bays|heatmap|staffing|buffers|operator-loops|cost|sensitivity|compare|standard-work|dossier|flex-line|changeover|completeness|flow|flow-direction|cell-flow|collisions|auto-arrange|optimize|report`, PUT `/layout/approval`, GET `/layout/snapshots/:id/diff` (solo geometría)

## 3. LineEngineeringService — estructura y responsabilidades mezcladas

Secciones internas (marcadores `── ... ──`): Scope multitenant → IE work elements/time studies → Stations (routing+layout) → Model↔Line qualification → Layout 2D → Snapshots → Calculations → Ledger. El constructor inyecta 13 dependencias opcionales, incluida `DOCUMENT_BLOB_STORE` (`cadBlobs`) del DocumentsModule.

**Métodos CAD (→ DESIGN):** `requireCadBlobs`, `hydrateCadDocument` (blob→gunzip→validate), `storeCadDocument` (umbral 1 MB → gzip+CAS con verificación de integridad sha256/size), `compareAndSwapCadDocument` (CAS SQL sobre `cad_document_version`, 409 `cad_document_version_conflict`), `recordCadPublication` (recibos server-managed, valida paperSpaces publicables, bump de `meta.version` + history), `saveLayoutArchive` (multipart gzip, prohíbe `cadDocument` inline), la rama CAD de `saveLayout` (validación, guard `cad_publications_server_managed`, CAS, evento `SF_CAD_DOCUMENT_REVISION_SAVED`), `toDxf`/`applyDxfMeta`/`setDxf`/`getDxf`/`clearDxf` (DXF de fondo), `getLayoutDxf` (export DXF — usa `buildDxf` de line-dxf), la porción `cadDocument` de `createSnapshot`/`restoreSnapshot`, y la hidratación CAD dentro de `getLayout` (parámetro `includeCadDocument=true` ya existe como vía de escape).

**Métodos industriales (→ ENTERPRISE):** IE (`getBalanceScenario`, `applyBalanceScenario`, `proposeBalanceScenario`, `listBalanceScenarios`, `createTimeStudy`, `listTimeStudies`, `addTimeObservation`, `calculateTimeStudyStandardTime`, `createWorkElement`, `importWorkElementsFromTemplate`, `importWorkElementsFromStations`, `listWorkElements`, `listDefaultProcessTemplates`, `tenantIndustry`); estaciones (`createStation`, `listStations`, `getStation`, `updateStation`, `routing`, `stationRequirements` — puente exportado a Material Staging/Operator Terminal); calificaciones (`qualify`, `listQualifications`, `updateQualification`); cálculo (`balance`, `capacity`, `kpis`, `getHeatmap`, `getCompleteness`, `getStaffing`, `getBufferPlan`, `getOperatorLoops`, `getCostModel`, `getSensitivity`, `layoutKpis`, `getComparison`, `getStandardWork`, `getDossier`, `getFlexLine`, `getChangeover`, `getFlowAnalysis`, `getFlowDirection`, `getCellFlow`, `getCollisions`, `autoArrangeLayout`, `optimizeLayout`, `getLayoutReport`, `getTakeoff`, `getClearance`, `getScorecard`, `getContinuity`, `getCohesion`, `getDensity`, `getCellMetrics`); layout industrial (`findLayout`, `ensureLayout`, `layoutMutationScope`, rama no-CAD de `saveLayout`, `cloneLayout`, `setApproval`, `getLayoutHistory`, `listSnapshots`, `deleteSnapshot`, `diffSnapshot`); ledger (`record` → dominio ENGINEERING, referenceType `SF_LINE_ENGINEERING`; helpers `toHistoryEntry`/`describeLayoutEvent` mapean también los eventos CAD/DXF).

## 4. Entidades TypeORM del módulo

| Entidad | Tabla | Clasificación |
|---|---|---|
| `SfLineLayout` | `sf_line_layouts` | **MIXED** (columnas CAD: cad_document, cad_document_version, layers, dxf_* / columnas industriales: footprint, approval, connectors, assets, cells, snapshots) |
| `SfCadBlock` | `sf_cad_blocks` | **DESIGN** (block definitions CAD) |
| `SfLineStation` | `sf_line_stations` | ENTERPRISE (ruteo + colocación física) |
| `SfModelLine` | `sf_model_lines` | ENTERPRISE |
| `IeWorkElement` | `ie_work_elements` | ENTERPRISE |
| `IeTimeStudy` | `ie_time_studies` | ENTERPRISE |
| `IeTimeObservation` | `ie_time_observations` | ENTERPRISE |
| `IeAllowanceProfile` | `ie_allowance_profiles` | ENTERPRISE |
| `IeBalanceScenario` | `ie_balance_scenarios` | ENTERPRISE |
| `IeBalanceAssignment` | `ie_balance_assignments` | ENTERPRISE |
| `IeOperatorSkill` | `ie_operator_skills` | ENTERPRISE |
| `IeLineResource` | `ie_line_resources` | ENTERPRISE |
| `IeProcessConstraint` | `ie_process_constraints` | ENTERPRISE |
| `IeProcessTemplate` | `ie_process_templates` | ENTERPRISE |

(Registradas además en `forFeature` pero propiedad de otros módulos: `Tenant` [auth→PLATFORM], `SfFloorEvent` [operator-terminal], `SfQualityHold` [floor-quality], `SfReplenishCall` [material-staging], `SfWorkOrder` [production-plan], `BayLayout` [bay-layout] — todas ENTERPRISE, solo lectura aquí.)

## 5. line-engineering.module.ts

- **imports:** `TypeOrmModule.forFeature([...20 entidades])`, `EventLedgerModule` (auditoría), **`DocumentsModule`** (para `DOCUMENT_BLOB_STORE` — la infraestructura NEUTRAL de blobs que el CAD usa como CAS; ENTERPRISE_OWNED por regla)
- **controllers:** `LineEngineeringController`
- **providers:** `LineEngineeringService`, `StationStatusService`, `StationBayService` (industriales) + `CadIntentService`, `CadVisionService`, `CadBlocksService` (CAD) + 16 repos tenant-scoped estrictos
- **exports:** `LineEngineeringService` — consumido por Material Staging (C) y Operator Terminal (D) para `stationRequirements`; por eso el servicio NO puede moverse entero
- **Circularidad confirmada:** `documents/documents.module.ts:20` y `documents/blob/document-blob-lifecycle.service.ts:7` importan `SfLineLayout` desde line-engineering (el ciclo de vida de blobs escanea los punteros CAD en `sf_line_layouts`), mientras este módulo importa `DocumentsModule`. Romperla es prerrequisito de la Fase 1.


<!-- ══════════ SECCIÓN: PRUEBAS, FIXTURES Y CORPUS DORADO ══════════ -->

# Fase 0 — Inventario de PRUEBAS, FIXTURES y CORPUS DORADO del CAD

Repo: `/home/user/valle-enterprise` (solo lectura; nada modificado).

## 0. Verificación de hechos declarados

| Hecho a verificar | Resultado |
|---|---|
| ~106 specs en `apps/web/src/lib/cad` | **Exactamente 106** (94 en raíz + 12 en `commands/`) |
| ~85 archivos backend en `modules/line-engineering` | **Exactamente 85** (de ellos **38 son specs**) |
| "E2E CAD 10–28" | **Confirmado**: 19 specs `e2e/golden/10-cad-*.spec.ts` … `28-cad-*.spec.ts`. OJO: **no existe `04-*.spec.ts`** (hueco de numeración) y el prefijo `10-` está **duplicado** (`10-axos-sheets-professional-core` = Office, `10-cad-native-entities` = CAD) |
| Benchmark 100k entidades | **Confirmado**: `e2e/performance/cad-viewport-100k.spec.ts` (10.000 y 100.000 arcos **generados en memoria**, sin fixture en disco) |
| Acceptance journey | **Confirmado**: `e2e/golden/cad-acceptance-journey.ts` (mapa canónico de 50 pasos → evidencia) + `cad-acceptance-journey.check.ts` (verifica 50/50, unicidad y **existencia física** de cada evidencia con rutas repo-relativas `apps/web/e2e/...`) |
| Golden corpus DXF/PDF (archivos) | **NO EXISTE como archivos**: cero `.dxf`, `.dwg`, `.pdf` committeados fuera de `node_modules`. El corpus DXF vive **inline** en los specs (p.ej. `27-cad-dxf-loss-manifest.spec.ts` construye `neutral-loss.dxf` como string; los `dxf-*.spec.ts` del kernel usan objetos JS; `line-dxf.spec.ts` del backend asserta sobre el R12 generado). Los PDFs de test se generan en runtime con `pdf-lib` |
| Tests de integración Postgres CAD (`*.pg.spec.ts`) | **No hay ninguno CAD**. Solo 7 pg-specs: 5 en `erp-core`, 1 en `outbound`, 1 en `common/testing` (entity-graph) |
| `apps/api/test` | Solo `jest-e2e.json` (config muerta: **0** archivos `*.e2e-spec.ts` en el repo) |
| Specs que mezclan CAD con industrial | Sí — ver §5 |

## 1. Specs del kernel CAD — `apps/web/src/lib/cad` (106)

Estilo: script-style `node:assert`, ejecutados uno a uno con `tsx` por `scripts/run-specs.mjs` (gate de CI "Web specs (tsx)").

| Clasificación | Cant. | Archivos |
|---|---|---|
| DESIGN_OWNED | **100** | Todos, salvo las 6 excepciones de abajo. Incluye DXF (10: `dxf-import`, `dxf-export`, `dxf-roundtrip`, `dxf-export-readiness`, `dxf-hatch`, `dxf-insert`, `dxf-dimension`, `dxf-layer-map`, `dxf-block-document`, `dxf-cad-document`), recovery (`cad-recovery`, `cad-recovery-codec`), colaboración (`cad-collaboration`, `snapshots`), benchmarks (`entity-runtime-benchmark`, `professional-snap-query-benchmark`, `perf-baseline`, `native-render-budget`), industry packs (`industry-pack`, `industry-rollup`, `warehouse-generators`, `templates` — plantillas con carriles kanban = contenido de pack, `safety-zones`, `architecture`, `polygon-room`, `rule-engine`), transporte (`large-document-transport`, `progressive-scene-sync`), y 11 de 12 `commands/*` |
| ENTERPRISE_OWNED | **5** | `line-balance.spec.ts`, `line-balance-assignment.spec.ts`, `line-balance-metrics.spec.ts` (balanceo/takt/cycle-time), `flow-optimization.spec.ts` (backtracking, distancia de flujo), `material-flow-route.spec.ts` (rutas de material receiving→supermarket→SMT→pack). Lógica industrial alojada dentro de `lib/cad`; reubicar junto con sus módulos homónimos en Fase 1 |
| MIXED_SPLIT_REQUIRED | **1** | `commands/registry.spec.ts`: el registro de comandos CAD (design) incluye y prueba el comando `analyze_line_balance` con `taktTimeSec`/`line_balance_over_takt` (enterprise). Split: registro+parser → design; entradas de balanceo → enterprise o plugin |

⚠️ Consecuencia para `git filter-repo`: **`apps/web/src/lib/cad` NO puede extraerse por directorio completo** — hay que excluir los 5 specs enterprise (y sus módulos `.ts` homónimos) y partir `commands/registry.*`.

## 2. Specs de UI CAD — `apps/web/src/components/line-engineering` (15)

Todos DESIGN_OWNED (mismo estilo script + `tsx`): `asset-catalog.spec.ts` (catálogo de activos de planta usado por LayoutEditor/Layout3DEditor/cad-intent), `cad-array`, `cad-command`, `cad-format-detect` (detección DWG/versiones ACAD), `cad-intent`, `cad-vision`, `cad-workbench/CadCommandDock`, `dimension-format`, `geom-edit` (trim/extend/fillet/chamfer/offset), `geom-measure`, `plot-scale` (escalas de ploteo/tamaños de papel), `plot-sheet`, `precision-input`, `professional-snapping`, `snap-engine`.

## 3. E2E — `apps/web/e2e` (Playwright 1.56.0 pineado, Chromium 141)

| Grupo | Archivos | Clasificación |
|---|---|---|
| Golden enterprise | `golden/01-login-hub`, `02-npi-model`, `03-planning-muro`, `05-quality-ncr`, `06-materials-shortage`, `07-quality-hold-disposition`, `08-operator-station`, `09-flow-end-to-end` (8; no hay 04) | ENTERPRISE_OWNED (01 ejercita login/identidad de plataforma pero es del shell enterprise) |
| Golden Office | `golden/10-axos-sheets-professional-core.spec.ts`, `document-authoring.spec.ts` | OFFICE_NO_TOCAR |
| **Golden CAD (10–28)** | 19 specs: `10-cad-native-entities`, `11-cad-recovery-journal`, `12-cad-professional-selection`, `13-cad-dynamic-input`, `14-cad-associative-hatch`, `15-cad-native-mtext`, `16-cad-associative-dimensions`, `17-cad-native-mleader`, `18-cad-professional-blocks`, `19-cad-professional-workbench`, `20-cad-multiple-viewports`, `21-cad-xrefs`, `22-cad-compare-collaboration`, `23-cad-native-fillet`, `24-cad-canonical-layers`, `25-cad-trim-extend`, `26-cad-precision-polyline`, `27-cad-dxf-loss-manifest`, `28-cad-osnap-pointer` | DESIGN_OWNED. Puramente CAD, pero: payload persistido usa el shape del layout de line-engineering (`stations: []`, `dxf`, `connectors`, `assets`, `cells`) y endpoints `/line-engineering/layout/*` — dependencia de esquema/namespace a resolver en Fase 1, no lógica industrial |
| Acceptance journey | `golden/cad-acceptance-journey.ts` (50 pasos, 45 browser-proven + 5 performance) + `cad-acceptance-journey.check.ts` (checker con rutas hardcodeadas `apps/web/e2e/...`) | DESIGN_OWNED |
| Benchmark | `performance/cad-viewport-100k.spec.ts` (10k/100k arcos en memoria) | DESIGN_OWNED |
| Harness compartido | `fixtures/constants.ts`, `fixtures/session.ts` (cookie HMAC + JWT del owner), `fixtures/mock-backend.ts` (746 líneas, fake enterprise en memoria; **sin handlers CAD** — los specs CAD añaden sus propios stubs de ruta) | MIXED_SPLIT_REQUIRED — usado por los 8 journeys enterprise Y por los 22 archivos CAD; valle-design necesita copia/extracto |
| Visual sweep | `visual-sweep.spec.ts` + `visual-sweep/{README.md, sweep-lib.ts, evidence.spec.ts, evidence2.spec.ts, evidence3.spec.ts}` (opt-in `SWEEP=1`, barrido de TODAS las rutas estáticas) | ENTERPRISE_OWNED — no existe un sweep CAD dedicado; CAD aparece solo como rutas barridas y 2 capturas de evidencia |
| Evidencia visual committeada | `__visual__/report/*.png` (6) y `__visual__/report2/*.png` (5) | ENTERPRISE_OWNED — 2 son de CAD (`after-cad-exit-visible.png`, `cad-cerrar.png`; candidatas a COPIA, no a extracción) |
| Infra | `README.md`, `.gitignore`, `__visual__/.gitignore` | ENTERPRISE_OWNED |

## 4. Backend — specs en `apps/api` (38 en line-engineering; 7 pg-specs; 0 e2e-spec)

| Clasificación | Cant. | Specs |
|---|---|---|
| DESIGN_OWNED | 5 | `cad-blocks.service.spec.ts` (SfCadBlock multi-tenant), `cad-document-storage.spec.ts` (archive gzip/blob pointer), `cad-document-validation.spec.ts` (límite bytes/esquema), `cad-intent-tools.spec.ts` y `cad-vision-prompt.spec.ts` (IA CAD opcional; asumen tool-specs "OpenAI-compatible" del proveedor CIDE general) |
| MIXED_SPLIT_REQUIRED | 3 | `line-engineering.service.spec.ts` (1511 líneas: persistencia canónica de CadDocument + versión optimista + `DocumentBlobStore` de DocumentsModule **mezclado con** takt/cadence, stdwork, estaciones, event-ledger); `line-dxf.spec.ts` (emisor R12 ASCII genérico → design; serialización de estaciones/footprint → enterprise); `line-approval.spec.ts` (ciclo de aprobación del layout/documento → design; sello de scorecard industrial grade/score/blockers → enterprise) |
| ENTERPRISE_OWNED | 30 | `line-autoarrange`, `line-balance-solver`, `line-balance`, `line-buffer`, `line-cellflow`, `line-changeover`, `line-clearance`, `line-cohesion`, `line-collision`, `line-compare` (KPIs industriales), `line-completeness`, `line-continuity`, `line-cost`, `line-density`, `line-dossier` (CSV de estaciones), `line-flexline`, `line-flow`, `line-flowdir`, `line-loops`, `line-optimize`, `line-process-templates`, `line-review` (**verificado**: review industrial de release — balance/circulación/densidad, NO review CAD), `line-scorecard`, `line-sensitivity`, `line-staffing`, `line-stdwork`, `line-takeoff` (cuantificación del layout industrial), `line-time-study`, `station-bay.service`, `station-status.service` |

- `*.pg.spec.ts` (7): **ninguno CAD** — `erp-core` (5), `outbound` (1), `common/testing/entity-graph.pg.spec.ts` (1, ENTERPRISE; probablemente carga el grafo completo de entidades → cambiará al retirar entidades CAD; verificar en Fase 1).
- `apps/api/test/jest-e2e.json`: config muerta (0 `*.e2e-spec.ts`).
- Smokes de CI (`bootstrap-smoke.js`, `golden-flow-smoke.js`): ERP puro, sin CAD (los matches "cad" eran falsos positivos de "duplicado/explicado/embarcado").
- No hay ningún spec con `CadDocument`/`SfCadBlock` fuera de line-engineering (la circularidad DocumentsModule↔CAD no tiene tests dedicados).

## 5. Specs que MEZCLAN CAD con industrial (todos los encontrados)

| Archivo | Qué mezcla |
|---|---|
| `apps/web/src/lib/cad/commands/registry.spec.ts` | comandos CAD + `analyze_line_balance`/takt |
| `apps/api/.../line-engineering.service.spec.ts` | persistencia CadDocument + takt/stdwork/estaciones/ledger |
| `apps/api/.../line-dxf.spec.ts` | emisor DXF R12 + serialización de estaciones |
| `apps/api/.../line-approval.spec.ts` | aprobación de layout + scorecard industrial |
| `apps/web/e2e/fixtures/*` (3) | harness único para journeys enterprise y CAD |
| (relocalización, no split interno) `lib/cad/line-balance*.spec.ts` ×3, `flow-optimization.spec.ts`, `material-flow-route.spec.ts` | specs 100% industriales viviendo dentro del directorio CAD |

No existe ningún test con "Yamazumi" en el repo; ningún e2e enterprise (01–09) toca CAD.

## 6. Fixtures/binarios para el manifiesto SHA-256

**Único inventario de binarios committeados relevante** (no hay DXF/DWG/PDF/`.gz`/`.bin`/`.b64`/`.snap` en todo el repo fuera de node_modules):

| Archivo | Clasificación |
|---|---|
| `apps/web/e2e/__visual__/report/{after-breadcrumb-menu-opaque, after-cad-exit-visible, after-home-desktop-dark, after-home-desktop-light, after-home-mobile-light, after-mobile-nav-sheet}.png` (6) | ENTERPRISE (1 de CAD: `after-cad-exit-visible.png`) |
| `apps/web/e2e/__visual__/report2/{cad-cerrar, chat-fullscreen, home-fullscreen, nav-drawer-open, search-simplified}.png` (5) | ENTERPRISE (1 de CAD: `cad-cerrar.png`) |
| `apps/api/src/modules/ai/evals/ai-fabric-golden.v1.json` | ENTERPRISE (evals de IA fabric, no CAD) |
| `scripts/test-fixtures/**` | ENTERPRISE (fixtures del analizador tenant-safety) |

El "corpus DXF dorado" real está **embebido como strings/objetos** en: `lib/cad/dxf-*.spec.ts` (10), `e2e/golden/27-cad-dxf-loss-manifest.spec.ts` (`neutral-loss.dxf` inline, manifiesto de pérdida `dxf_import:unsupported_entity`) y `api/.../line-dxf.spec.ts` — viaja con los propios specs, no requiere manifiesto binario aparte.

## 7. Cómo se ejecutan

| Comando | Config | Qué corre |
|---|---|---|
| `npm run test:specs -w web` | `apps/web/scripts/run-specs.mjs` | glob `src/**/*.spec.ts` (**136** archivos: 106 lib/cad + 15 UI CAD + 15 otros) uno a uno con `tsx`; exit≠0 = fallo. Gate de CI "Web specs (tsx)" |
| `npm run e2e -w web` | `apps/web/playwright.config.ts` (`testDir: ./e2e`, chromium, `workers: 1`, `webServer: next dev` con `NEXT_PUBLIC_API_URL=http://localhost:4010`, `AXOS_SHEETS_ENABLED`) | toda la suite e2e (enterprise + CAD + Office). **No corre en ci.yml** — es local/nocturna (`NIGHT_LOG_E2E.md`). Pin `@playwright/test@1.56.0`/Chromium 141 por restricción de egress |
| `SWEEP=1 npx playwright test visual-sweep.spec.ts` | ídem | barrido visual opt-in |
| `npm test` (workspace `axos-os-backend`) | `apps/api/scripts/jest.js` + bloque `jest` de `apps/api/package.json` (`testRegex .*\.spec\.ts$`, ts-jest, rootDir src) | 38 specs de line-engineering + resto del API; los `.pg.spec.ts` se saltan sin DB |
| `TEST_DATABASE_URL=... npm run test:pg` | `apps/api/scripts/jest-postgres.js` (`--testRegex .*\.pg\.spec\.ts$`, `REQUIRE_POSTGRES_TESTS=true`) | 7 pg-specs (ninguno CAD) |
| `npm run test:e2e` (api) | `apps/api/test/jest-e2e.json` | 0 tests (config muerta) |
| `turbo.json` | — | **no define tarea `test`**; los gates viven en `.github/workflows/ci.yml` (build API, `npm test`, `test:pg`, web `test:specs`, `check:nav`, smokes ERP vs Postgres, tenant-safety) |


<!-- ══════════ SECCIÓN: BASE DE DATOS Y MIGRACIONES ══════════ -->

# Inventario Fase 0 — Base de Datos y Migraciones (apps/api)

## 1. Resumen ejecutivo

- **Cadena activa de migraciones**: 75 migraciones ejecutables + 15 `.spec.ts` en `apps/api/src/migrations/` (el glob `migrations/!(*.spec).{ts,js}` excluye specs y el subdirectorio `legacy/`).
- **Cadena legacy**: 96 archivos en `apps/api/src/migrations/legacy/` — **archivados e inertes** (nunca ejecutados en prod/CI según el header de la Baseline; ADR §208). 8 de ellos son la historia del CAD (`AddLineLayout`, `AddLayoutDxf/Connectors/Assets/Annotations/Snapshots/Cells/Approval`).
- **Solo 3 migraciones activas son exclusivamente CAD**; 1 (la Baseline) es mixta; el resto es ERP/MES/HR/AI/Platform/Office.
- **NO existen tablas `cad_projects` / `cad_documents` / `cad_document_versions` / `cad_publications` / `cad_review_sessions` / `cad_comments`** — hay que crearlas en Fase 1. Hoy el documento CAD canónico vive EMBEBIDO en `sf_line_layouts` (columna `cad_document` jsonb + `cad_document_version` int), con offload gzip a `doc_blobs` mediante puntero JSON.
- **Cero FKs físicas** entre tablas CAD y el resto — todo el acoplamiento es lógico (ids varchar, JSON), lo cual facilita la separación de BD pero exige disciplina en Fase 1.
- **Ningún seed toca tablas CAD** — los seeds CAD tendrán que nacer en valle-design.

## 2. Migraciones activas — clasificación

### 2.1 Exclusivamente CAD → DESIGN_OWNED (3)

| Migración | Qué hace |
|---|---|
| `20260706180000-AddCadBlocks.ts` | `CREATE TABLE sf_cad_blocks` (id uuid, tenant_id/organization_id/plant_id varchar(36), name varchar(80), assets jsonb, auditoría TenantBaseEntity) + índice `idx_sf_cad_block_scope(tenant_id, plant_id)` |
| `20260724010000-AddCanonicalCadDocument.ts` | Añade a `sf_line_layouts`: `cad_document` (jsonb, documento CAD canónico v3) y `cad_document_version` (integer, token CAS de concurrencia optimista). `down()` no-op deliberado (no descartar dibujos) |
| `20260728110000-ProfessionalCadBlockLibrary.ts` | Añade a `sf_cad_blocks`: `definition` (jsonb, CadBlockDefinition canónica) y `version` (integer, versión monótona de biblioteca). `down()` no-op (datos CAD de usuario) |

### 2.2 Mixtas (CAD + otra cosa) → MIXED_SPLIT_REQUIRED

| Migración | Parte CAD | Parte no-CAD |
|---|---|---|
| `20260101000000-Baseline.ts` (2104 líneas, squash del esquema completo, no-op si la BD ya existe) | `CREATE TABLE sf_line_layouts` completo (dxf_*, connectors, assets, annotations, snapshots, cells, layers — SIN cad_document, que llega después); columnas `layout_x/y/w/h/rotation` dentro del CREATE de `sf_line_stations`; enum `PLANT_LAYOUT` y tabla `engineering_documents` (editor de layout v1, content.layers/objects/geometry) | ~200 tablas ERP/MES/HR/AI/Platform/Office (`erp_*`, `sf_*` industriales, `ie_*`, `visual_aids` con pdf_data bytea, `bay_layouts`, users/tenants/roles, mensajería, etc.) — **En Fase 1 valle-design necesita su propia baseline; esta no se puede reutilizar** |

Nota: la Baseline NO declara ninguna FK sobre `sf_line_layouts` ni sobre tablas `doc_*` (verificado: todas las `ADD CONSTRAINT` de la Baseline tocan tablas no-CAD).

### 2.3 Infraestructura neutral de archivos que el CAD consume → ENTERPRISE_OWNED (se queda; design la consumirá o replicará)

| Migración | Qué hace | Relación con CAD |
|---|---|---|
| `20260723040000-CreateDocumentPlatform.ts` | Crea `doc_documents`, `doc_blobs`, `doc_document_versions`, `doc_document_annotations`, `doc_document_links` | `doc_blobs` es el CAS (blob_key PK, sha256 dedupe por tenant, bytea) donde el CAD guarda documentos gzip > umbral inline (tope 20 MB comprimido, `cad-document-storage.ts`) |
| `20260728100000-AddDocumentBlobLifecycle.ts` | Añade `gc_marked_at` + índice `idx_doc_blobs_gc` a `doc_blobs` (GC de dos barridos) | El GC (`DocumentBlobLifecycleService`) escanea `sf_line_layouts.cad_document` y `snapshots[].cadDocument` para proteger blobs CAD referenciados — **acoplamiento crítico para la separación** |

### 2.4 No-CAD (resto de la cadena activa)

- **PLATFORM_OWNED** (identidad/tenancy/entitlements/billing): `AddAuthHardening`, `AddTenantProvisioningColumns`, `AddEmailVerificationColumns`, `AddTenantPlanTierColumn`, `AddPasswordResetColumns`, `AddTenantBillingColumns`, `CreateTenantOnboardingStates`(+spec), `TenantSpineIndexes`(+spec), `CreateProductEntitlements` (crea `tenant_product_grants.product_code` varchar(32) — aquí se persiste el código de producto `design` declarado en `packages/contracts/src/product-catalog.ts`), `MigrateLegacyPlanTiersToGrants`(+spec), `AddBundleProvenanceAndMarket`, `CreateIntelligenceMetering`, `CreateFoundingPartnerAgreements`, `AddFoundingPartnerCoupon`, `AddFoundingPartnerCouponWithdrawal`.
- **OFFICE_NO_TOCAR**: `CreateSheetsFoundation`(+spec), `CreatePresentationsFoundation`(+spec), `CreateDocumentAuthoring`(+spec).
- **ENTERPRISE_OWNED**: todo lo demás — Erp\* (P2P, O2C, tesorería, activos fijos, presupuesto, CRM, RFQ, valoración, folios tenant-scoped, journal, períodos, bancos, commitments), Hr\*/Payroll, `CreatePeopleCloudWorkforceCore`, `CreateIntegrationCloudFoundation`(+spec), `AddMaintenance`, `AddProdLog`, `AddGenericIeProcessTypes` (tipos de proceso IE — industrial), `DropInertBayTables`, backfills MM/PO, `DropInventoryPositionsMaterialFk`, IA general (`SecureAiTenantActions`, `CreateAiRunsTracing`, `AiActionExactlyOnce`, `AiDurableRuns`, `CreateAiKnowledge`, `AiRunLeaseFencing`, `ActionIdempotencyKeys`, `CreateDocumentActionProposals`), `SecureDecisionIntelligenceTenant`, `FinancePostingSpine`, `CreateMigrationCenter`.

### 2.5 Migraciones legacy con contenido CAD (archivadas, fuera del glob — valor solo histórico/referencial)

| Migración legacy | Contenido |
|---|---|
| `20260622150000-AddLineLayout.ts` | **MIXTA**: crea `sf_line_layouts` (v1: footprint/unit/grid) Y añade `layout_x/y/w/h/rotation` a `sf_line_stations` (tabla industrial) |
| `20260622160000-AddLayoutDxf.ts` | dxf_data/name/offset/scale/rotation/visible/opacity en `sf_line_layouts` |
| `20260622170000-AddLayoutConnectors.ts` | connectors jsonb |
| `20260622180000-AddLayoutAssets.ts` | assets jsonb |
| `20260622190000-AddLayoutAnnotations.ts` | annotations jsonb |
| `20260622200000-AddLayoutSnapshots.ts` | snapshots jsonb |
| `20260623100000-AddLayoutCells.ts` | cells jsonb |
| `20260623110000-AddLayoutApproval.ts` | approval_status/approved_by/approved_at/approval_note |

Los otros 88 archivos legacy son ERP/MES/chat/NPI/etc. (no-CAD). `CreateLineEngineering` (legacy) crea `sf_line_stations`/`sf_model_lines` — industrial, no CAD.

## 3. Entidades TypeORM que persisten datos CAD (todo apps/api)

285 `@Entity` en 271 archivos revisados por grep. Las que persisten CAD:

| Clase | Tabla | Columnas clave | Clasificación |
|---|---|---|---|
| `SfLineLayout` (`modules/line-engineering/entities/sf-line-layout.entity.ts`) | `sf_line_layouts` | `id` uuid PK; `tenant_id/organization_id/plant_id` varchar(36) (TenantBaseEntity, sin FK); **identidad por `model`+`revision`** (claves industriales); `footprint_w/h`, `unit`, `grid_size`; `approval_status/approved_by/approved_at/approval_note` (ciclo de aprobación CAD); `dxf_data` **text inline** + `dxf_name/offset_x/offset_y/scale/rotation/visible/opacity`; jsonb: `connectors`, `assets`, `annotations`, `snapshots` (versiones con nombre, incl. `cadDocument` por snapshot), `cells`, `layers`; **`cad_document` jsonb** (doc canónico v3 inline O puntero `_storage:{kind:'document_blob', blobKey, encoding:'gzip', sha256…}` a `doc_blobs`); **`cad_document_version` int** (CAS) | DESIGN_OWNED |
| `SfCadBlock` (`modules/line-engineering/entities/sf-cad-block.entity.ts`) | `sf_cad_blocks` | `id` uuid PK; tenant/org/plant; `name` varchar(80); `assets` jsonb (legacy); `definition` jsonb (CadBlockDefinition canónica); `version` int | DESIGN_OWNED |
| `SfLineStation` (`modules/line-engineering/entities/sf-line-station.entity.ts`) | `sf_line_stations` | Tabla de ruteo industrial (model/revision/line/station/sequence/np_expected/std_time_sec/ctq…) **+ columnas CAD de colocación `layout_x/y/w/h/rotation`** | MIXED_SPLIT_REQUIRED: tabla queda en enterprise; columnas `layout_*` y su lectura/escritura pasan al lado design (o export) |
| `EngineeringDocument` (`modules/engineering/entities/engineering-document.entity.ts`) | `engineering_documents` | enum `VISUAL_AID`/`PLANT_LAYOUT`; `content` jsonb `{layers, objects, geometry}`, `viewport`, `units`, `schemaVersion` — editor de layout v1 (predecesor del CAD) | MIXED_SPLIT_REQUIRED: `PLANT_LAYOUT` es CAD legacy; `VISUAL_AID` es enterprise |
| `DocumentBlob` (`modules/documents/entities/document-blob.entity.ts`) | `doc_blobs` | `blob_key` varchar(64) PK; `tenant_id`; `sha256` (unique con tenant → CAS dedupe); `size`; `data` bytea (select:false); `gc_marked_at` | ENTERPRISE_OWNED (infra neutral que el CAD usa para el dibujo gzip) |
| `DocumentVersion` (`modules/documents/entities/document-version.entity.ts`) | `doc_document_versions` | referencia `blob_key` (soft) | ENTERPRISE_OWNED |

Resto de entidades de `line-engineering` (`ie-balance.entities.ts` con 10 entidades `ie_*`, `sf-model-line.entity.ts`) = industriales, ENTERPRISE_OWNED.

## 4. ¿Existen tablas cad_projects / cad_documents / cad_document_versions / cad_publications / cad_review_sessions / cad_comments?

**NO. Ninguna existe** (grep exhaustivo en migraciones + entidades). Hay que crearlas en Fase 1. Sus equivalentes actuales:

| Tabla futura | Equivalente hoy |
|---|---|
| cad_projects | no existe — el "proyecto" es implícito (`model`+`revision` en `sf_line_layouts`) |
| cad_documents | `sf_line_layouts.cad_document` (jsonb inline o puntero gzip a `doc_blobs`) |
| cad_document_versions | `sf_line_layouts.cad_document_version` (int CAS) + `snapshots` jsonb (versiones nombradas, cada una con su propio `cadDocument`) |
| cad_publications | recibos de publicación DENTRO del JSON `cadDocument.publications`, server-managed (guard `cad_publications_server_managed` en `line-engineering.service.ts:2105`) |
| cad_review_sessions / cad_comments | no existen como tablas; la aprobación vive en columnas `approval_*` de `sf_line_layouts` |

La única aparición de `cad_publications` en el código es el código de error, no una tabla.

## 5. Seeds (apps/api/src/seed + apps/api/src/seed.ts)

- **Ningún seed escribe en `sf_line_layouts` ni `sf_cad_blocks`** (grep de SfLineLayout/SfCadBlock/cadDocument en seed/: 0 resultados). No hay seeds CAD → crear en valle-design en Fase 1.
- `seed-demo.ts`: siembra `SfLineStation` vía `LineEngineeringService.createStation` (solo campos industriales: station/sequence/npExpected/useFactor/stdTimeSec…, sin `layout_*`), `BayLayout` (bahías, enterprise), y todo el resto de dominios ERP/MES.
- `seed-demo-clear.ts` / `seed-legacy-purge.ts`: purgan `sf_line_stations` y `bay_layouts` (no tocan layouts CAD).
- `forbidden-scan.ts`: metadata-driven sobre TODAS las entidades registradas — barre incidentalmente las tablas CAD mientras convivan en la misma BD (patrón a replicar en valle-design).
- `synthetic-demo-data-guard.spec.ts`: solo menciona "AutoCAD" como marca permitida en texto.
- `seed.ts` (raíz): bootstrap del usuario admin (PLATFORM).

## 6. FKs entre tablas CAD y tablas industriales/ERP

**No hay ninguna FK física** desde/hacia `sf_line_layouts`, `sf_cad_blocks`, `doc_blobs` (verificado en Baseline, en todas las migraciones y en entidades: cero `ManyToOne/OneToMany/JoinColumn` en line-engineering y documents). `tenant_id` es varchar simple sin `REFERENCES`. El riesgo de separación es **acoplamiento lógico**, no referencial:

1. `sf_line_layouts.model/revision` ≡ identidad compartida con `sf_line_stations.model/revision` (el CAD se selecciona por el mismo par que el ruteo industrial).
2. `sf_line_layouts.connectors[].from/to`, `cells[].stationIds[]`, `snapshots[].positions[].id` almacenan **ids de `sf_line_stations`** dentro de JSON.
3. `sf_line_layouts.cad_document._storage.blobKey` → `doc_blobs.blob_key` (puntero soft al CAS compartido con PDF/authoring).
4. `DocumentBlobLifecycleService` (enterprise) decide qué blobs viven **leyendo la tabla CAD** — si la BD se separa sin separar el blob store, el GC borraría blobs CAD aún referenciados.
5. `DocumentsModule` importa la entidad `SfLineLayout` y registra su repositorio (circularidad módulo neutral → entidad CAD); `LineEngineeringModule` importa `DocumentsModule` (para el blob store).
6. `sf_line_stations.layout_x/y/w/h/rotation`: columnas CAD sobre tabla industrial.

## 7. Configuración de conexión

- **Runtime**: `apps/api/src/orm.options.ts` (`ormOptions()`, consumido en `app.module.ts` → `TypeOrmModule.forRoot`). Estrategia: (a) `DATABASE_URL` ⇒ Postgres por URL (synchronize true por defecto salvo `SYNCHRONIZE=false`; SSL si `sslmode=require` o prod); (b) `DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD`/`DB_DATABASE` ⇒ Postgres dev/staging; (c) sin vars ⇒ SQLite `better-sqlite3` (`SQLITE_PATH`, solo dev; en prod lanza error). En producción `SYNCHRONIZE` debe ser explícitamente `"false"` (true prohibido, lanza); `migrationsRun` se activa con `!synchronize && (prod || MIGRATIONS_RUN==='true')`. `DB_SSL_STRICT=true` endurece TLS.
- **CLI de migraciones**: `apps/api/src/typeorm-cli.datasource.ts` — exige Postgres (`DATABASE_URL` o `DB_*`), `synchronize:false`, entities glob `modules/**/*.entity.{ts,js}`, migrations glob `migrations/!(*.spec).{ts,js}` (excluye `legacy/`).
- **Env vars DB**: `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `SYNCHRONIZE`, `MIGRATIONS_RUN`, `DB_SSL_STRICT`, `SQLITE_PATH`, `NODE_ENV` (documentadas en `apps/api/.env.example`).
- Implicación Fase 1: valle-design necesita su propio datasource/orm.options + baseline propia; no puede heredar la cadena de migraciones de enterprise.


<!-- ══════════ SECCIÓN: CONFIGURACIÓN, DEPENDENCIAS Y CATÁLOGO ══════════ -->

# Fase 0 — Inventario: configuración, dependencias y catálogo de producto

Verificado en `/home/user/valle-enterprise` (solo lectura). Hechos confirmados: `apps/web/src/lib/cad` = **227 archivos / 53,269 líneas**; `apps/web/src/components/line-engineering` = **72 archivos** (13 en `cad-workbench/`); `apps/api/src/modules/line-engineering` = **85 archivos**; `DocumentsModule` importa la entidad CAD `SfLineLayout` (circularidad confirmada).

## 1. Catálogo de producto y contratos (`packages/contracts`) — SHARED_PROTOCOL

`packages/contracts/src/product-catalog.ts` es la fuente canónica:

| Elemento | Valor |
|---|---|
| Productos declarados | `platform-core` (foundation, no se vende), `erp`, `mes`, `design`, `documents`, `spreadsheets`, `presentations`, `intelligence`, `integrations` |
| Capacidades design | `design.cad`, `design.viewer` (únicas cad*) |
| Ofertas design | `design-saas-monthly` y `design-saas-annual` (standard, `author_seat`, self-service elegible, trial 14 días), `design-private-cloud` (enterprise, min 10 asientos, + `platform.governance`, venta asistida) |
| Dependencias comerciales | `design.requiresAnyOf = []` (independiente); `intelligence` lista `design` entre sus requisitos |
| Flag autoservicio | `SELF_SERVICE_PRODUCTS` (parseado por `parseSelfServiceProducts`); espejo web `NEXT_PUBLIC_SELF_SERVICE_PRODUCTS` |

`packages/contracts/src/entitlements.ts`: máquina de estados (`requested…expired`), solo `active`/`trialing` conceden acceso, `grantIsActive`/`hasCapability`/`denialReasonFor` puras compartidas API↔web, códigos `PRODUCT_NOT_ENTITLED` y `BILLING_PAYMENT_REQUIRED`. Otros archivos del paquete: `brand.ts`, `pricing.ts`, `price-book-mx.ts` (mapea offerCode→`priceEnvVar`), `bundles.ts`, `licence.ts`, `public-catalog.ts`, más contratos office (`sheets.ts`, `presentations.ts`, `document-authoring.ts`). El paquete queda físicamente en enterprise; valle-design lo consume como paquete/subset publicado.

## 2. Variables de entorno que necesita el CAD

### Backend CAD (leídas en `apps/api/src/modules/line-engineering`)
| Variable | Uso | Archivo |
|---|---|---|
| `CIDE_BASE_URL` | URL del motor OpenAI-compatible (default `http://localhost:11434/v1`) | `cad-intent.service.ts:22`, `cad-vision.service.ts:13` |
| `CIDE_API_KEY` | Bearer opcional del motor | ambos |
| `CIDE_MODEL` | Modelo NL→CAD (default `qwen2.5:7b`). **OJO: distinto de `CIDE_DEFAULT_MODEL` del módulo ai; `.env.example` NO documenta `CIDE_MODEL`** | `cad-intent.service.ts:24` |
| `CIDE_VISION_MODEL` | Modelo visión (fallback `CIDE_MODEL`, default `qwen2.5vl:7b`) | `cad-vision.service.ts:15-16` |
| `CIDE_TIMEOUT_MS` | Timeout visión (default 60000) | `cad-vision.service.ts:17` |
| `AI_MAX_OUTPUT_TOKENS` | Tope tokens intent (default 700) | `cad-intent.service.ts:25` |
| `AI_MOCK` | `'1'` = modo demo sin motor (compartida con módulo ai) | ambos |

### Plataforma que el backend CAD hereda (`apps/api/.env.example`, CI)
`DATABASE_URL` (o `DB_HOST/PORT/USERNAME/PASSWORD/DATABASE`), `JWT_SECRET`, `PORT`, `NODE_ENV`, `ALLOWED_ORIGIN`, `FRONTEND_SHARED_KEY`, `BACKEND_SERVICE_EMAIL/PASSWORD` (fail-closed en prod), `SYNCHRONIZE`/`MIGRATIONS_RUN`, `OWNER_ADMIN_*`/`MASTER_ADMIN_*`/`OWNER_EMAILS`.

### Frontend CAD (`apps/web`)
- `NEXT_PUBLIC_API_URL` — **20 usos directos** en `src/components/line-engineering/**` (todo el fetch del workbench CAD). `src/lib/cad/**` tiene **cero** `process.env` (motor puro, extracción limpia).
- Plataforma heredada: `BACKEND_INTERNAL_URL`, `FRONTEND_SHARED_KEY`, `AXOS_SESSION_SECRET`, `BACKEND_SERVICE_EMAIL/PASSWORD`.
- gzip: navegador usa `CompressionStream` nativo (`lib/cad/cad-recovery-codec.ts`, `large-document-transport.ts`); backend usa `node:zlib` (`cad-document-storage.ts`) — **no hay dependencia pako**.

### Comerciales de design que SE QUEDAN en enterprise (PLATFORM_OWNED)
`BILLING_PRICE_MX_DESIGN_SAAS_MONTHLY/_ANNUAL` (resueltas por `apps/api/src/modules/billing/price-resolver.ts` vía `priceEnvVar` de `price-book-mx.ts`), `SELF_SERVICE_PRODUCTS`, `NEXT_PUBLIC_SELF_SERVICE_PRODUCTS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_BASE_URL`, `DEFAULT_MARKET`.

## 3. Proveedor de IA (CIDE)

- `apps/api/src/modules/ai/` (48 archivos): IA general self-hosted, motor OpenAI-compatible (Ollama/vLLM/llama.cpp), **sin vendors externos**. Env del módulo: `CIDE_BASE_URL`, `CIDE_API_KEY`, `CIDE_DEFAULT_MODEL`, `CIDE_ESCALATION_MODEL`, `CIDE_EXTRA_MODELS`, `CIDE_TIMEOUT_MS`, `CIDE_AUTO_ESCALATE`, `CIDE_BRIEF_PUSH_ENABLED/_CRON`, `AI_MOCK`, `AI_MAX_OUTPUT_TOKENS`, `AI_DEFAULT_MONTHLY_BUDGET_TOKENS`.
- Consumo por la IA CAD: `cad-intent.service.ts` hace `import { CideProvider, CideEngineError } from '../ai/cide-provider'` y lo instancia con `new CideProvider({...})` (línea 146) — **acoplamiento por import de código, no por DI de Nest**. `cide-provider.ts` es un cliente autocontenido sin dependencias (fetch de Node 20) → trivial de vendorizar en valle-design. `cad-vision.service.ts` NO usa CideProvider: trae su propio cliente HTTP. Ambos degradan con gracia (`available:false`) si el motor no está.
- `infra/cide/`: `docker-compose.yml` (Ollama CPU, `OLLAMA_KEEP_ALIVE`, `OLLAMA_HOST`), `docker-compose.gpu.yml` (vLLM, `CIDE_HF_MODEL`, `--served-model-name` alias), `Dockerfile` + `entrypoint.sh` + `railway.json` (despliegue Railway). Design lo reutiliza apuntando `CIDE_BASE_URL` a su propio motor.

## 4. Dependencias npm relevantes (versión instalada y licencia leídas de node_modules)

### apps/web
| Dependencia | Declarada | Instalada | Licencia | ¿Usada por CAD? |
|---|---|---|---|---|
| three | ^0.182.0 | 0.182.0 | MIT | **Sí** — `lib/cad/native-viewport.ts`, `entity-three.ts`, `Layout3DEditor` (+OrbitControls) |
| @types/three (dev) | ^0.182.0 | 0.182.0 | MIT | **Sí** |
| dxf-parser | ^1.1.2 | 1.1.2 | MIT | **Sí** — `lib/cad/dxf-import.ts`, `components/line-engineering/dxf.ts` |
| fabric | ^7.4.0 | 7.4.0 | MIT | **Sí** — editor 2D legacy (`LayoutEditor.tsx`, `Minimap.tsx`) |
| jspdf | ^4.2.1 | 4.2.1 | MIT | **Sí** — publicación PDF (`Layout3DEditor` + motor `lib/cad/plot-sheet.ts`); también `lib/kit-ticket.ts` (enterprise) → ambos repos la conservan |
| jspdf-autotable | ^5.0.7 | 5.0.7 | MIT | No (solo kit-ticket, enterprise) |
| pdfjs-dist | 4.10.38 | 4.10.38 | Apache-2.0 | No (pdf-studio, office) |
| file-saver | ^2.0.5 | 2.0.5 | MIT | No (ExportButton workspace) |
| socket.io-client | ^4.8.1 | 4.8.3 | MIT | No (chat/hooks MES; la colaboración CAD no lo usa) |
| next / react / react-dom | ^16.2.10 / 19.2.4 | — | MIT | Sí (shell de la app) |
| lucide-react | ^1.11.0 | 1.11.0 | ISC | Sí (iconos UI CAD) |
| pako | — | — | — | **No existe**: gzip nativo (CompressionStream / node:zlib) |

### apps/api
| Dependencia | Declarada | Instalada | Licencia | ¿Usada por CAD? |
|---|---|---|---|---|
| typeorm / @nestjs/* | ^0.3.25 / ^11 | — | MIT | Sí (entidades y módulo CAD; base compartida) |
| pdf-lib | 1.17.1 | 1.17.1 | MIT | No (documents/pdf engine, office) |
| pdfjs-dist | 4.10.38 | 4.10.38 | Apache-2.0 | No |
| sharp | ^0.34.5 | 0.34.5 | Apache-2.0 | No (document-authoring) |
| jszip | 3.10.1 | 3.10.1 | **(MIT OR GPL-3.0-or-later)** dual — pasa por la rama MIT | No (docx-import) |
| exceljs | ^4.4.0 | 4.4.0 | MIT | No (bom/sheets) |
| multer (override raíz ^2.2.0) | — | — | MIT | Sí (upload DXF en line-engineering.controller) |

El backend CAD **no tiene** dependencia npm de DXF: `dxf_data` se guarda como texto y se parsea en el frontend; `line-dxf.ts` es un writer R12 puro propio.

## 5. Identificadores persistidos (NO renombrar; documentar alias)

| Sitio | Identificador | Lee/Escribe |
|---|---|---|
| `apps/web/src/app/dashboard/cad/page.tsx:15-16,44-46` | `AXOS-CAD-STUDIO` + `UNIVERSAL` | Define las constantes y las pasa como `model`/`revision` al workbench → se ESCRIBEN vía API en las columnas `model`/`revision` |
| `apps/api/.../entities/sf-line-layout.entity.ts` (cols `model` varchar(64), `revision`, índice `idx_sf_layout_scope`) | ambos | Persistencia DB (filas del documento CAD universal) |
| `apps/api/.../entities/sf-line-station.entity.ts` (índice `idx_sf_station_scope`) | ambos | Persistencia DB |
| `components/line-engineering/cad-workbench/CadXrefPalette.tsx:41` | `UNIVERSAL` | Default de revisión al adjuntar Xref (escritura) |
| `components/line-engineering/Layout3DEditor.tsx:3078,3092` | `UNIVERSAL` | Fallback de revisión al resolver snapshots de Xref (lectura) |
| `apps/web/e2e/golden/*cad*.spec.ts` (19 specs, 10–28) | ambos | Fixtures/flujo E2E |
| `scripts/check-brand-surfaces.mjs:101,~112` | `AXOS-CAD-STUDIO`, `axos-dxf` | Allowlist del gate de marca (tokens legacy permitidos) |
| `apps/web/src/lib/cad/interop-provider.ts` | `axos-dxf` | Id del proveedor de interop **persistido dentro de los dibujos** |
| `docs/cad/AXOS_CAD_ARCHITECTURE_LAYER.md` | ambos | Documentación |

Los `AXOS-CAD-UNIVERSAL-###` en `lib/cad/symbols.ts`/`templates.ts` son IDs de journey en comentarios, no persistidos.

## 6. infra/ y scripts/ (CI, deploy, verificación)

- `infra/` contiene SOLO `infra/cide/` (ver §3). No hay docker-compose de la app.
- `scripts/` (ENTERPRISE_OWNED; valle-design necesitará equivalentes): `check-brand-surfaces.mjs` (`check:brand`; allowlista AXOS-CAD-STUDIO/axos-dxf), `check-dependency-licenses.mjs` (`check:licenses`; política: MIT/Apache-2.0/BSD/ISC… permitidas; GPL/AGPL/SSPL/desconocidas bloqueadas; LGPL/MPL a revisión legal; fuente = SBOM CycloneDX de `npm run sbom`), `check-tenant-safety.mjs` + `audit-tenant-safety.mjs` + `scripts/tenant-safety/` (+fixtures), `validate-capability-registry.mjs` (`check:capabilities`, valida `docs/enterprise/capabilities.json` contra módulos y rutas reales), `check-canonical-posting.mjs`, `check-legacy-entitlement-adapter.mjs`, `commercial-deploy.mjs` (predeploy exige `COMMERCIAL_BACKUP_PATH`/`COMMERCIAL_BACKUP_MAX_AGE_H`), `licence.mjs`, `qa-commercial-surfaces.mjs`, `convergence-*.sh`, `cleanup-stale-branches.sh`.
- `.github/workflows/ci.yml`: gates tenant-safety, brand, SBOM+licencias, lint, **"Web specs (tsx)" = `npm run test:specs` que corre las 47 suites script-style incluyendo el motor CAD (`lib/cad/*.spec.ts`)**, `check:nav`, build web, smoke de bootstrap y golden-flow contra Postgres (incl. SYNCHRONIZE=false solo-migraciones). `.github/workflows/sbom.yml`: SBOM CycloneDX en cada push a main.

## 7. Auth/RBAC/entitlements en endpoints CAD hoy (PLATFORM_OWNED)

- `line-engineering.controller.ts`: `@UseGuards(JwtAuthGuard, PermissionsGuard)` a nivel de clase + `@RequirePermissions('engineering:read')` (50 endpoints) / `('engineering:write')` (27). Los endpoints CAD (blocks, intent, vision, layouts, xrefs, DXF upload) van por ese MISMO guard RBAC.
- **`design.cad` NO se exige hoy en ningún endpoint CAD**: `@RequiresProductCapability` + `ProductCapabilityGuard` (`modules/entitlements/guards/product-capability.guard.ts`, fail-closed, backfill legacy con sunset 2026-12-31) solo está aplicado en `mes-execution`, `erp-core/*` y `migration-center`. `design.cad` aparece únicamente en specs.
- Identidad/tenant: `modules/auth` (JwtStrategy, tenant-provisioning que lee `SELF_SERVICE_PRODUCTS`), `modules/billing` (Stripe + price-resolver), `modules/entitlements`, `modules/licensing`, `modules/users` — todo PLATFORM_OWNED; valle-design lo consumirá por API.

## Migraciones DB tocadas por CAD
`20260706180000-AddCadBlocks.ts` y `20260728110000-ProfessionalCadBlockLibrary.ts` crean/pueblan `sf_cad_blocks` (exclusivamente CAD → DESIGN_OWNED). `20260724010000-AddCanonicalCadDocument.ts` y `legacy/20260622160000-AddLayoutDxf.ts` agregan columnas CAD (`cad_document`, `dxf_*`) a la tabla MIXTA `sf_line_layouts`. `20260101000000-Baseline.ts` contiene todo el esquema mezclado.