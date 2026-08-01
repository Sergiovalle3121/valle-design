# IMPORT-GRAPH — Grafo de imports en las fronteras CAD ↔ resto (Fase 0)

---

# Grafo de imports del frontend en la frontera CAD (Fase 0 — solo lectura)

## Hechos verificados

| Afirmación | Verificación |
|---|---|
| ~227 archivos / ~53k líneas en `apps/web/src/lib/cad` | **Confirmado exacto**: 227 archivos, 53.269 líneas |
| ~72 archivos de UI CAD | **Matizado**: `components/line-engineering` tiene 72 archivos (59 planos + 13 en `cad-workbench/`), pero **NO todos son CAD**: ~47 son CAD y 25 son paneles/algoritmos industriales enterprise |
| Identificadores `AXOS-CAD-STUDIO` / `UNIVERSAL` | Confirmado en `apps/web/src/app/dashboard/cad/page.tsx` (líneas 15–16) |
| El editor CAD importa auth/tenant/workspace/marca/temas globales | Confirmado (detalle abajo) |
| IA CAD depende de CIDE | En frontend **no hay import directo de `lib/cide`**: el acoplamiento es vía endpoints backend (`/line-engineering/layout/cad-intent`, `/layout/vision`, `/layout/optimize-copilot`) y vía el contrato de tools formato OpenAI-compatible declarado en `components/line-engineering/cad-intent.ts` ("CIDE/Ollama por CIDE_BASE_URL") |

## 1. ENTRANTES — quién importa código CAD desde fuera

| Archivo importador | Import CAD | Naturaleza |
|---|---|---|
| `apps/web/src/app/dashboard/cad/page.tsx` | `dynamic(() => import('@/components/line-engineering/Layout3DEditor'))` | Shell standalone del producto design (va con el CAD) |
| `apps/web/src/app/dashboard/line-engineering/page.tsx` (línea 24 y montaje línea 271, pestaña `view === 'cad3d'`) | `dynamic(() => import('@/components/line-engineering/Layout3DEditor'))` | **Host enterprise** que embebe el editor CAD — frontera crítica |
| `apps/web/src/components/line-engineering/LineBalancePanel.tsx` | `@/lib/cad/line-balance` | Panel **enterprise** (balanceo) importando un módulo enterprise mal ubicado dentro de `lib/cad` |
| `apps/web/src/components/line-engineering/PlantMinimap.tsx` | `@/lib/cad/minimap` | Widget de viewport CAD (design) |
| `apps/web/src/components/line-engineering/ScaleBar.tsx` | `@/lib/cad/world-scale` | Widget de escala CAD (design) |
| `apps/web/src/components/line-engineering/precision-input.ts` | re-export completo de `../../lib/cad/precision-input` | Wrapper de compatibilidad (design) |
| `apps/web/scripts/cad-perf-scale.mts` | `../src/lib/cad/perf-baseline` | Script de performance CAD |
| `apps/web/e2e/golden/10-cad-*.spec.ts` … `28-cad-*.spec.ts` (19 specs) | `../../src/lib/cad/cad-document`, `dxf-import`, etc. + mock de `/line-engineering/layout**` vía `context.route` | Corpus dorado E2E CAD |
| `apps/web/e2e/performance/cad-viewport-100k.spec.ts` | `lib/cad/*` | Perf E2E CAD |

**Acoplamientos suaves (por string de ruta, sin import de código CAD)**: `lib/entitlementNav.ts` (`{ prefix: "/dashboard/cad", product: "design" }`), `lib/dashboardAreas.ts` (área "/dashboard/cad"), `components/SearchPalette.tsx` (entrada de búsqueda), `lib/routeChrome.ts` y `lib/operatorChrome.ts` (comentarios + flag workbench), `config/productCatalog.ts` (catálogo de productos).

**Conclusión clave**: fuera de `components/line-engineering`, **nadie** en `apps/web/src` importa `lib/cad`. Los únicos puntos de entrada de producción son las 2 páginas que montan `Layout3DEditor`.

## 2. SALIENTES — qué importa el código CAD del resto del monorepo

### 2a. `apps/web/src/lib/cad` (núcleo, 227 archivos) — extraordinariamente limpio

| Destino | Archivos CAD que lo importan |
|---|---|
| `three` (npm) | `entity-three.ts` y render nativo (4 imports) |
| `dxf-parser` (npm) | `dxf-import.ts` |
| `@/config/brand` (`PRODUCT_LABEL`) | **solo** `lib/cad/interop-provider.ts:25` |
| `components/line-engineering/*` (**capa invertida**) | `commands/create-patterns.ts` → `cad-array`, `geom-edit`, `precision-input`; `commands/wall-edit.ts` → `geom-edit`, `precision-input`, `snap-engine`; `commands/measure-region.ts` → `geom-measure`, `dimension-format`, `snap-engine`; `commands/mirror.ts`, `commands/place-symbol.ts`, `commands/transform.ts` → `precision-input`; `professional-snap-query-benchmark.spec.ts` → `snap-engine` |
| node builtins (`node:assert`, `node:test`, `node:perf_hooks`) | specs |

Cero imports de auth, tenant, apiFetch, i18n, CIDE, chat o componentes globales desde el núcleo.

### 2b. `components/line-engineering/cad-workbench` (13 archivos UI CAD)

| Destino externo | Archivo CAD |
|---|---|
| `@/contexts/ThemeContext` (`useTheme`) | `CadWorkspaceDock.tsx:4` |
| `@/components/ui/LanguageSwitcher` | `CadWorkspaceDock.tsx:5` (render línea 91) |
| `next-intl` (`useLocale`) | `CadWorkspaceDock.tsx:3` |
| `../cad-intent` | `CadCommandDock.tsx` |
| `react`, `lucide-react` | todos |

### 2c. `Layout3DEditor.tsx` (10.562 líneas — el gran mezclador)

| Destino | Detalle |
|---|---|
| `@/lib/apiFetch` | ~21 llamadas, **todas** a `${API_BASE}/line-engineering/...`: `layout`, `layout/dxf`, `layout/density`, `layout/clearance`, `layout/optimize`, `layout/optimize-copilot`, `layout/cad-intent`, `layout/vision`, `layout/snapshots(+restore/delete)`, `layout/clone`, `layout/approval`, `layout/publications`, `layout/cad-archive`, `cad-blocks(+id)` |
| `@/contexts/AuthContext` (`useAuth`) | línea 985: `user.id`, `tenantId` → clave de storage del workspace CAD (línea 1390), scope de biblioteca de bloques tenant, businessLink |
| `@/contexts/WorkspaceContext` (`useWorkspace`) | línea 987: `buildingId`, `projectId` → scoping de snapshots |
| `@/contexts/ThemeContext` (`useTheme`) | línea 986: `resolvedScheme` → mapeado a `setTheme` interno del editor (línea 1387) |
| `@/contexts/ToastContext` (`useToast`) | notificaciones de error/éxito |
| `@/lib/operatorChrome` | `setWorkbenchChrome(open)` (líneas 1443–1444): oculta dock/widgets globales mientras el editor está abierto |
| `@/config/brand` | `BRAND.legalEntityName`/`brandName` en cajetín PDF (7338, 7374, 7443); `PRODUCT_LABEL.design` en títulos, comentario de archivo DXF (7696) y pie de sheets PDF |
| `jspdf` (dinámico), `three` + `OrbitControls`, `react-dom` (portal), `lucide-react`, `next/dynamic` | render/publicación |
| Módulos CAD colocalizados (`./`) | `dxf`, `dxf-walls`, `dxf-snap`, `auto-dimensions`, `asset-catalog`, `cad-intent`, `cad-command`, `cad-vision`, `cad-format-detect`, `precision-input`, `snap-engine`, `plot-scale`, `plot-sheet` |
| Módulos **enterprise** colocalizados | `arrange-line`, `connect-line`, `design-checks`, `flow-metrics` + 17 paneles industriales por `dynamic()` (líneas 302–321): WhatIfSimulator, YamazumiChart, LayoutHistory, BufferPlanner, OperatorLoops, ClearanceAnalysis, LayoutScorecard, LineContinuity, LineCohesion, LineDensity, CostEstimator, SensitivityChart, ScenarioCompare, StandardWork, DossierExport, FlexLine, LineBalancePanel |
| ~63 imports de `@/lib/cad/*` | prácticamente todo el núcleo |

### 2d. E2E CAD
Los 19 specs dorados importan `apps/web/e2e/fixtures/session.ts` (forja la cookie de plataforma `axos_session` HMAC-SHA256 + JWT en localStorage, replicando `src/lib/session.ts`) y `fixtures/constants.ts` — dependencia de la identidad de plataforma en tests.

### 2e. Lo que el CAD **NO** importa
`lib/cide`, `lib/chatApi`, `components/ChatWidget`, `lib/entitlementNav`, `lib/session`, `hooks/*` — cero imports. `@/lib/glass` solo en el shell `dashboard/cad/page.tsx` (y en los paneles enterprise, no en el CAD).

## 3. Facilidad de inversión de los salientes

| Import | Dificultad | Mecanismo |
|---|---|---|
| `useToast` | **Fácil** | prop `onNotify(level, msg, title)` |
| `useTheme` | **Fácil** | prop `theme: 'light'|'dark'` — ya se traduce a estado interno en una sola línea (1387) |
| `useWorkspace` | **Fácil** | prop `scope: { buildingId?, projectId? }` — solo scoping de snapshots |
| `useAuth` | **Fácil** | props `userId`/`tenantId` — solo storage-key y scoping de biblioteca (identidad real queda en plataforma vía API) |
| `setWorkbenchChrome` | **Fácil** | callback `onFullscreenChange(open)`; en valle-design ni siquiera hace falta (no hay chrome enterprise) |
| `@/config/brand` | **Fácil** | prop/config `branding: { name, legalEntity, productLabel }` inyectada al cajetín/exports |
| `LanguageSwitcher` + `useLocale` (CadWorkspaceDock) | **Fácil** | prop `locale` + slot `languageSlot?: ReactNode` |
| `@/lib/glass` (shell) | **Fácil** | copiar el token CSS |
| `apiFetch` + `API_BASE` | **Media** | definir interfaz `CadPersistenceAdapter` (~14 operaciones); todas las llamadas están concentradas en Layout3DEditor, pero los endpoints se llaman `/line-engineering/*` y deben renombrarse en el backend design |
| Mezcla interna de `Layout3DEditor` | **Profunda** | 10.562 líneas entrelazan editor CAD con pestañas estaciones/acomodar-línea/conectar-línea, 17 paneles industriales y endpoints density/clearance/optimize. El flag `standalone` ya marca la costura (gatea `arrange-line`, `connect-line`, pestaña "Estaciones"→"Puntos"). Requiere partirlo en `CadEditorShell` (design, con slots de extensión) + workbench enterprise que inyecta sus paneles |
| Capa invertida `lib/cad/commands → components/line-engineering` | **Profunda** (estructural, no semántica) | mover los 6 módulos (`precision-input`, `snap-engine`, `geom-edit`, `geom-measure`, `cad-array`, `dimension-format`) dentro de `lib/cad`; toca decenas de imports pero es mecánico |
| `lib/cad/index.ts` re-exporta `line-balance` | **Media** | podar el barrel; `LineBalancePanel` (enterprise) debe importar de un módulo enterprise |
| fixtures E2E de sesión | **Media** | valle-design necesita stub de identidad propio (o modo API-key contra plataforma) |

## 4. Shell del editor CAD

- **Página raíz standalone**: `apps/web/src/app/dashboard/cad/page.tsx` (`CadStudioPage`) — monta `Layout3DEditor` con `model='AXOS-CAD-STUDIO'`, `revision='UNIVERSAL'`, `standalone`, `title={PRODUCT_LABEL.design}`. Globals que monta hoy: `@/lib/glass`, `@/config/brand`, `next/link`, `lucide-react`. Es delgada (63 líneas) — trasplantable casi entera.
- **Componente raíz real**: `components/line-engineering/Layout3DEditor.tsx` — globals montados hoy: AuthContext, WorkspaceContext, ThemeContext, ToastContext, flag imperativo de `operatorChrome` (porque el chrome global del DashboardShell sigue montado encima y hay que ocultarlo), brand, apiFetch, jspdf, three. Renderiza por `createPortal` a pantalla completa.
- **Segundo host (enterprise)**: `app/dashboard/line-engineering/page.tsx` monta el mismo editor en la pestaña `cad3d` con `model/revision` de línea reales y sin `standalone` (activa estaciones/balanceo).
- **Código muerto**: `LayoutEditor.tsx` (2D fabric, 2.388 líneas), `Layout3D.tsx` y `Minimap.tsx` no los importa nadie — no llevar al repo design.

## Resumen de la frontera para filter-repo (frontend)

| Zona | Veredicto |
|---|---|
| `lib/cad/**` | design, **excepto** `line-balance{,-assignment,-metrics}` (+specs) que son enterprise |
| `components/line-engineering` | 47 archivos CAD (incl. `cad-workbench/**` y las 6 libs que usa `lib/cad/commands`) → design; 25 paneles/algoritmos industriales → enterprise; `Layout3DEditor.tsx` → dividir |
| `app/dashboard/cad/**` | design |
| `app/dashboard/line-engineering/**` | enterprise (la pestaña CAD se reemplaza por embed/link al producto design) |
| E2E golden 10–28 CAD + performance + `cad-acceptance-journey` + `scripts/cad-perf-scale.mts` | design |
| Contextos/infra global (Auth/Entitlements=plataforma; Theme/Toast/Workspace/apiFetch/glass/operatorChrome=enterprise) | se quedan; el CAD los recibirá por props/adapter |


---

# Grafo de imports del backend en la frontera CAD (apps/api)

Hecho verificado: `apps/api/src/modules/line-engineering` tiene **85 archivos .ts** (47 fuente + 38 spec), coincidiendo con el "~85" esperado. El módulo mezcla el producto CAD (documento CAD canónico, bloques, DXF, publicaciones, IA CAD) con ingeniería industrial (balanceo, estudios de tiempos, takt, capacidad, staffing, ruteo, señales MES).

## 1. Quién importa desde `modules/line-engineering` (entrantes)

Todos los consumidores de producción usan EXCLUSIVAMENTE la superficie industrial de `LineEngineeringService` (`capacity`, `balance`, `routing`, `stationRequirements`, `createStation`, `listStations`). **Ningún módulo externo importa los servicios `cad-*` ni `SfCadBlock`** (verificado por grep exhaustivo). La única fuga CAD hacia afuera es `SfLineLayout` hacia DocumentsModule.

| Archivo consumidor | Símbolo importado | Uso real (leído) | Clasificación |
|---|---|---|---|
| `apps/api/src/modules/production-plan/production-plan.service.ts` (L20, L83, L455-456) | `LineEngineeringService` (`@Optional()`) | `lineEng.capacity({model, revision, line, availableMinutes, demandUnits})` para carga de línea (runMinutes/changeoverMinutes) en el plan de producción | ENTERPRISE_OWNED (consumidor industrial) |
| `apps/api/src/modules/production-plan/production-plan.module.ts` (L9) | `LineEngineeringModule` | lo agrega a `imports` para DI | ENTERPRISE_OWNED |
| `apps/api/src/modules/npi/npi.service.ts` (L27, L140, L553, L570) | `LineEngineeringService` | `balance()` → balancePct/completeness y `routing()` → verificación de std time en readiness NPI (read-only, fail-soft) | ENTERPRISE_OWNED (consumidor industrial) |
| `apps/api/src/modules/npi/npi.module.ts` (L18) | `LineEngineeringModule` | import de módulo | ENTERPRISE_OWNED |
| `apps/api/src/modules/operator-terminal/operator-terminal.service.ts` (L20, L124, L192/206/277) | `LineEngineeringService` | `stationRequirements(wo.model, wo.revision)` para poka-yoke (`verifyScan` compara NP escaneado vs `npExpected`) y `workContext` de estación | ENTERPRISE_OWNED (consumidor industrial) |
| `apps/api/src/modules/operator-terminal/operator-terminal.module.ts` (L9) | `LineEngineeringModule` | import de módulo | ENTERPRISE_OWNED |
| `apps/api/src/modules/operator-terminal/operator-terminal.service.spec.ts` (L7-9) | `LineEngineeringService`, `SfLineStation`, `SfModelLine` | construye el servicio posicionalmente para tests | ENTERPRISE_OWNED |
| `apps/api/src/modules/cost-intelligence/cost-intelligence.service.ts` (L17, L128, L270, L373) | `LineEngineeringService` | `stationRequirements()` → `stdTimeSec` por estación para horas estándar de mano de obra en COGS por WO (`.catch(()=>[])` fail-soft) | ENTERPRISE_OWNED (consumidor industrial) |
| `apps/api/src/modules/cost-intelligence/cost-intelligence.module.ts` (L11) + `.spec.ts` (L8-9, L16) | `LineEngineeringModule` / servicio + entidades | DI y tests | ENTERPRISE_OWNED |
| `apps/api/src/modules/material-staging/material-staging.service.ts` (L24, L64, L96, L161) | `LineEngineeringService` | `stationRequirements()` para surtido por estación (fallback si no hay ProcessRouting); bloquea liberación a piso si no hay materiales | ENTERPRISE_OWNED (consumidor industrial) |
| `apps/api/src/modules/material-staging/material-staging.module.ts` (L8) + `.spec.ts` (L5-7) | `LineEngineeringModule` / servicio + entidades | DI y tests | ENTERPRISE_OWNED |
| `apps/api/src/modules/planning-orders/planning-order-staging.spec.ts` (L8-10, L196-210) | `LineEngineeringService`, `SfLineStation`, `SfModelLine` | instancia el servicio con constructor posicional para probar staging | ENTERPRISE_OWNED |
| `apps/api/src/modules/documents/documents.module.ts` (L20, L34, L58) | `SfLineLayout` (entidad CAD) | la registra en `TypeOrmModule.forFeature` + repo tenant-scoped para el GC de blobs | MIXED_SPLIT_REQUIRED (**circularidad**: Documents→entidad CAD, LineEngineering→DocumentsModule) |
| `apps/api/src/modules/documents/blob/document-blob-lifecycle.service.ts` (L7, L52-53, L60, L66-73) | `SfLineLayout` | `referencedBlobKeys()` escanea `layout.cadDocument` y `layout.snapshots[].cadDocument` con `cadBlobKeyFromStoredDocument()` (conoce el formato `_storage.kind==='document_blob'` del puntero CAD) para NO recolectar blobs CAD vivos | MIXED_SPLIT_REQUIRED |
| `apps/api/src/app.module.ts` (L36, L152) | `LineEngineeringModule` | registro raíz | ENTERPRISE_OWNED (composición raíz; se edita en Fase 1) |
| `apps/api/src/seed/seed-demo.ts` (L62-63, L1355-1376) | `LineEngineeringService`, `SfLineStation` | `listStations`/`createStation` (ruteo rev 'A' para surtido demo) — solo superficie industrial | ENTERPRISE_OWNED |
| `apps/api/src/seed/seed-verify.ts` (L29, L376-380) | `LineEngineeringService` | `stationRequirements()` para verificar seed | ENTERPRISE_OWNED |
| `apps/api/src/seed/seed-demo-clear.ts` (L43, L336) / `seed-legacy-purge.ts` (L38, L383) | `SfLineStation` | purga de repositorio | ENTERPRISE_OWNED |

No hay referencias a line-engineering en `mes-execution`, `plans`, `bay-layout`, ni en el módulo `ai` (verificado).

## 2. Qué importa `line-engineering` desde otros módulos (salientes)

| Archivo | Import externo | Propósito |
|---|---|---|
| `line-engineering.module.ts` | `Tenant` (auth), `EventLedgerModule`, `DocumentsModule`, `provideTenantScopedRepository` (common/tenant), `SfFloorEvent` (operator-terminal), `SfQualityHold` (floor-quality), `SfReplenishCall` (material-staging), `SfWorkOrder` (production-plan), `BayLayout` (bay-layout) | DI: DocumentsModule provee `DOCUMENT_BLOB_STORE` (blobs CAD); las 4 entidades MES son lectura para el overlay vivo; exporta SOLO `LineEngineeringService` |
| `line-engineering.service.ts` (L34-35, L40-44, L68-69) | `Tenant` (auth), `TenantContextService`, `TenantScopedRepository` (common/tenant), `EventLedgerService` + `EventDomain`/`LedgerEvent` (event-ledger), `DOCUMENT_BLOB_STORE`/`DocumentBlobStore` (documents/blob) | tenant/plant scoping; auditoría (`record()` → `EventDomain.ENGINEERING`, referenceType `SF_LINE_ENGINEERING`, y `getLayoutHistory` LEE el ledger); blob store para `storeCadDocument`/`hydrateCadDocument` (gzip+CAS sobre umbral `CAD_DOCUMENT_BLOB_THRESHOLD_BYTES`); `tenantIndustry()` para industry packs de plantillas |
| `line-engineering.controller.ts` (L25-27) | `JwtAuthGuard`, `PermissionsGuard`, `RequirePermissions` (auth) | TODOS los endpoints (CAD e industriales) protegidos solo con RBAC `engineering:read/write`; sin guard de entitlements de producto |
| `station-status.service.ts` (L3, L9-12) | `TenantContextService`, `SfFloorEvent`, `SfQualityHold`, `SfReplenishCall`, `SfWorkOrder` | overlay MES vivo (semáforo down/warn/ok/idle por estación) — read-only sobre señales de piso; es ENTERPRISE aunque viva en line-engineering |
| `station-bay.service.ts` (L4-5) | `BayLayout` (bay-layout) | join read-only estación→bahía (1-6) por `npExpected` para material staging |
| `cad-intent.service.ts` (L14) | `CideProvider`, `CideEngineError` de `../ai/cide-provider` | IA CAD NL→tool-calls (ver §3) |
| `cad-intent-tools.ts` (L13) | `CideToolSpec` (type-only) de `../ai/cide-provider` | declara las CAD tools en formato OpenAI function |
| `cad-blocks.service.ts` (L10) | `TenantContextService` | scoping de biblioteca de bloques |
| `entities/*` | `TenantBaseEntity` (common/entities), `JSON_COLUMN_TYPE`/`DATE_COLUMN_TYPE` (common/database) | infraestructura de columnas |
| specs (`line-engineering.service.spec.ts`, `station-*.spec.ts`, `cad-blocks.service.spec.ts`) | common/tenant, `EventLedgerService`, `DocumentBlobStore` (type), `BayLayout`, entidades MES | fixtures de test |

**No importa**: notifications, entitlements, licensing, billing, mrp, erp-core — la frontera saliente es estrecha: auth/tenant (platform), event-ledger, documents/blob, ai/cide-provider, y 5 entidades industriales de solo lectura.

## 3. IA CAD (cad-intent, cad-vision) y el proveedor CIDE

- **Proveedor**: `apps/api/src/modules/ai/cide-provider.ts` (401 líneas) — cliente OpenAI-compatible sin dependencias (fetch nativo) contra un motor auto-hospedado (Ollama/vLLM/llama.cpp/TGI). Es el proveedor GENERAL del módulo de IA (`ai.service.ts`, `ai-tools.service.ts` también lo usan).
- **cad-intent.service.ts**: hace `new CideProvider({baseUrl: CIDE_BASE_URL, model: CIDE_MODEL, apiKey: CIDE_API_KEY})` DIRECTAMENTE (no inyección DI) y llama `provider.chat({messages, tools: CAD_INTENT_TOOLS, maxTokens, temperature: 0})`. Devuelve tool-calls crudas; la validación vive en el frontend (`cad-intent.ts` → `normalizeToolCalls`). Degrada con gracia (`available:false`) si CIDE no responde; `AI_MOCK=1` lo apaga en CI.
- **cad-vision.service.ts**: NO usa `CideProvider` (que es solo-texto); hace `fetch` propio a `${CIDE_BASE_URL}/chat/completions` con `CIDE_VISION_MODEL` y `buildVisionMessages` (cad-vision-prompt.ts). Cero imports de otros módulos.
- **Interfaz a extraer para hacerla opcional**: lo único compartido son los TIPOS `CideToolSpec`/`CideMessage`/`CideCompletion`/`CideToolCall` y el método `chat(args): Promise<CideCompletion>` + `CideEngineError`. Basta definir en valle-design una interfaz `ChatCompletionProvider { chat(...) }` con esos tipos (o copiar el cliente, que es dependency-free) y el contrato de entorno: `CIDE_BASE_URL`, `CIDE_API_KEY`, `CIDE_MODEL`, `CIDE_VISION_MODEL`, `CIDE_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`, `AI_MOCK`. Al no haber DI del provider, la extracción no toca el módulo `ai` de enterprise.

## 4. Registro en app.module.ts

`apps/api/src/app.module.ts`: `LineEngineeringModule` importado en L36 y registrado en L152; `DocumentsModule` L112/L222; `AiModule` L103/L213; `EventLedgerModule` L81/L191; `EntitlementsModule` L14/L226. Ambos módulos son imports directos y planos del root module (sin `forRoot`/config dinámica). `LineEngineeringModule.exports = [LineEngineeringService]` (única superficie pública); `DocumentsModule.exports = [DocumentsService, DOCUMENT_BLOB_STORE, DocumentBlobLifecycleService]`.

## 5. Clasificación interna de `modules/line-engineering` (85 archivos)

| Grupo | Archivos | Clasificación |
|---|---|---|
| Núcleo CAD | `cad-document-storage.ts`, `cad-document-validation.ts`, `cad-blocks.service.ts`, `cad-intent.service.ts`, `cad-intent-tools.ts`, `cad-vision.service.ts`, `cad-vision-prompt.ts`, `entities/sf-cad-block.entity.ts`, `line-dxf.ts` (+ sus .spec) | DESIGN_OWNED |
| Analítica industrial pura | `line-balance`, `line-balance-solver`, `line-time-study`, `line-process-templates`, `line-staffing`, `line-buffer`, `line-loops`, `line-cost`, `line-stdwork`, `line-dossier`, `line-review`, `line-approval`, `line-scorecard`, `line-sensitivity`, `line-compare`, `line-changeover`, `line-flexline`, `line-continuity`, `line-cohesion`, `line-density`, `line-takeoff`, `line-clearance`, `line-flow`, `line-flowdir`, `line-cellflow`, `line-collision`, `line-autoarrange`, `line-optimize` (+ .spec, `line-completeness.spec.ts`) | ENTERPRISE_OWNED |
| Puentes MES | `station-status.service.ts`, `station-bay.service.ts` (+ .spec) | ENTERPRISE_OWNED |
| Entidades industriales | `entities/sf-line-station.entity.ts`, `entities/sf-model-line.entity.ts`, `entities/ie-balance.entities.ts` | ENTERPRISE_OWNED |
| Mezclados (dividir en Fase 1) | `line-engineering.service.ts` (4120 líneas: CAD = `hydrateCadDocument`/`storeCadDocument`/`compareAndSwapCadDocument`/`saveLayout`/`saveLayoutArchive`/`recordCadPublication`/snapshots/dxf/`getLayoutHistory`/`cloneLayout`/approval; ENTERPRISE = estaciones/ruteo/`stationRequirements`/calificaciones/escenarios de balanceo/estudios de tiempos/work elements/`capacity`/`kpis` y todas las analíticas), `line-engineering.controller.ts` (1163 líneas, misma mezcla bajo `/line-engineering`), `line-engineering.module.ts`, `dto/line-engineering.dto.ts`, `entities/sf-line-layout.entity.ts` (fila que porta a la vez `cadDocument`+snapshots+layers (design) y placement de estaciones+approval que consumen las analíticas enterprise) | MIXED_SPLIT_REQUIRED |

## 6. Migraciones y datos

- DESIGN: `20260706180000-AddCadBlocks.ts` (crea `sf_cad_blocks`), `20260728110000-ProfessionalCadBlockLibrary.ts`, `20260724010000-AddCanonicalCadDocument.ts` (agrega `cadDocument`/`cadDocumentVersion` a `sf_line_layouts`).
- ENTERPRISE: `legacy/20260607180000-CreateLineEngineering.ts` (`sf_line_stations`/`sf_model_lines`), `legacy/20260701120000-CreateIeLineBalance.ts` (tablas `ie_*`).
- MIXTAS: `20260101000000-Baseline.ts` y las legacy `AddLineLayout`/`AddLayoutDxf`/`AddLayoutConnectors`/`AddLayoutAssets`/`AddLayoutAnnotations`/`AddLayoutSnapshots`/`AddLayoutCells`/`AddLayoutApproval` — crean/extienden `sf_line_layouts`, la tabla físicamente compartida.
- Identificador persistido confirmado: `apps/web/src/app/dashboard/cad/page.tsx` L15 `const UNIVERSAL_CAD_MODEL = 'AXOS-CAD-STUDIO'` — el CAD Studio "universal" guarda sus documentos EN `sf_line_layouts` vía la API `/line-engineering/layout` con ese modelo centinela. `packages/contracts/src/product-catalog.ts` declara `PRODUCT_CODES = [platform-core, erp, mes, design, documents, spreadsheets, presentations, intelligence, integrations]` (SHARED_PROTOCOL).