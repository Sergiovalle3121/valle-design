# STATE — Migración CAD: valle-enterprise → valle-design

> **Documento vivo.** Toda sesión que trabaje en la migración DEBE leer este archivo primero
> y actualizarlo antes de pausar. El prompt canónico de la misión vive en el historial de la
> sesión; este archivo es el puente entre sesiones.

## Fase actual

**FASE 1 y FASE 2 (contratos) — COMPLETAS (2026-08-01)** → siguiente: FASE 3 (extracción).

Cierre WP7 con 14/14 gates verdes: build, typecheck, lint api/web, specs web **137/137**
(baseline 136 +1 del seam; 107 en lib/cad), api unit **374 suites/2,509 tests** (baseline
363/2,468 — nada perdido, +41), test:pg **8/21** (baseline 7/17), tenant-safety 879/879,
capabilities, canonical-posting, brand, nav y bootstrap-smoke. FILTER-REPO-PATHS.txt SELLADA.

Progreso Fase 1:
- ✅ WP1 (f25fd886): circularidad documents↔CAD rota — BlobReferenceRegistry en documents,
  CadBlobReferencesProvider en line-engineering. 44 suites/261 tests verdes.
- ✅ WP4 (0e28dc4f): capa invertida corregida (snap-engine, geom-edit, geom-measure, cad-array,
  dimension-format viven en lib/cad con wrappers de compatibilidad en components) y los 10
  archivos industriales fuera de lib/cad → lib/line-engineering/.
- ✅ WP4b (8169d66e + 060576a6): últimos 2 imports lib/cad→industrial eliminados vía
  lib/cad/analysis-extensions.ts (contrato + registro inyectable; degradación con aviso
  analysis_pack_missing sin paquete industrial). lib/cad = 0 imports de producción hacia
  components o line-engineering (solo 2 imports test-only documentados en specs MIXED).
  137/137 specs web (136 baseline + 1 nuevo del seam), next build verde.
- ✅ WP2a (2bebf134): modules/cad-documents/ con los 17 archivos CAD-puros (git mv),
  CadDocumentsModule, cad-drawing-shapes.ts (LayoutAsset y cía. viven en CAD; línea los
  re-exporta). 44 suites/261 tests.
- ✅ WP2b (910cc7b4): CadDocumentsService (534 líneas) con la lógica de dominio CAD;
  line-engineering.service de 4,120→~3,880 líneas con delegados finos + tabla legacy.
- ✅ WP5 (0914e7f7): editor sin globals; Layout3DEditorHost adaptador enterprise.
- ✅ WP6 (2d23c8c0): 17 paneles industriales → industrial-analysis-panels.tsx inyectados
  por el Host vía prop analysisPanels; editor CAD sin conocimiento industrial.
- ✅ Gobernanza (c8fca331): capability design.cad-documents registrada; tenant-safety
  879/879. LECCIÓN: regenerar audit SOLO con árbol limpio (el audit escanea filesystem —
  regenerarlo con ediciones en vuelo produce baseline "stale" en CI).
- ✅ WP3 (a678625b): 6 entidades/tablas cad_* + migración aditiva CreateCadDocumentsFoundation
  + CadLegacyProjectionService (upsert idempotente, monotónico, fail-soft desde el guardado
  legacy). Suite completa 369/2,496 + pg 8/21 + bootstrap-smoke OK.
- ✅ WP2c (bf266802+94db5238): 5 puertos + 5 adaptadores; IA opcional (D-007); binding de
  tenant conservado en contexto autenticado (D-008); entitlements fail-closed real.
- ✅ Fase 2 contratos (66ad04ba): design-api.v1.yaml (redocly 0/0), design-events.v1.yaml
  (asyncapi 0/0), platform-api.v1.yaml draft, design-contracts.ts tipado. SDK generado y
  compat-tests → repo design (Fase 3).
- ✅ WP7: 14/14 gates verdes (detalle arriba).

PR de integración: #1446 (draft) — rama claude/migrate-cad-valle-design-6nle2k → main.
CI falló en 8169d66e (campo warnings faltante en contrato); corregido en 060576a6.

## Estado por repositorio

| Repo | Rama de trabajo | Último commit relevante | Estado |
|---|---|---|---|
| valle-enterprise | `claude/migrate-cad-valle-design-6nle2k` | `2d23c8c0` (WP1/2a/2b/4/4b/5/6 + gobernanza) | limpio; PR #1446 abierto a main |
| valle-design | — | **vacío (0 commits)**, verificado 2026-08-01 | esperando historial filtrado (Fase 3) |

## Hechos establecidos

- **BASELINE_SHA**: `4cf045ad48485b9a4467465b727f5e977592666b` (tip de `origin/main`, 2026-08-01).
- **PRs abiertos**: solo #1445 (draft, fix ERP O2C `invoiceSO`, 2 archivos en `erp-core`) —
  clasificado **EXCLUIDO/NO BLOQUEANTE**: cero rutas CAD, no toca rutas que la Fase 1
  refactoriza; se fusionará por su flujo normal y permanece en enterprise. Ver BASELINE.md.
- **Respaldos (Regla 3)**:
  - Tag local `pre-cad-split-20260801` @ BASELINE_SHA (el proxy git bloquea push de tags).
    ✅ **Ancla remota durable**: rama `backup/pre-cad-split-20260801` creada vía API de GitHub
    apuntando exactamente a `4cf045ad` (verificado en la respuesta del API). El tag remoto
    sigue siendo deseable cuando el usuario tenga terminal; la rama cumple la función.
  - Mirror: `/home/user/backups/valle-enterprise-mirror.git` (88 MB) — **local al contenedor
    efímero**; recomendación: el usuario debe conservar su propio mirror offline.
  - Bundle: `/home/user/backups/valle-enterprise-full-20260801.bundle` (81 MB, `git bundle verify`
    OK: historial completo). Misma advertencia de efimeridad.
  - Protección durable real: `main` de valle-enterprise nunca se reescribe (Regla 4) y GitHub
    retiene todo el historial.
- Clon des-shallow completado (era shallow con 222 commits; ahora 2,128).
- Confirmado en código: 227 archivos / 53,269 líneas en `apps/web/src/lib/cad`; 85 archivos en
  `apps/api/src/modules/line-engineering`.

## Hecho

- [x] Verificación de repos: enterprise completo, valle-design vacío.
- [x] Inspección de ramas (solo `main` + rama del PR #1445) y PRs abiertos (solo #1445).
- [x] Clasificación del PR abierto → no bloqueante.
- [x] Elección de BASELINE_SHA.
- [x] Tag + mirror + bundle de respaldo (con salvedad del push del tag, ver arriba).
- [x] Instalación de git-filter-repo.

## En curso

- [ ] Fase 3: fusión del PR #1446 a main (squash, flujo del repo) → clon fresco del SHA de
  fusión → filter-repo con FILTER-REPO-PATHS.txt → gitleaks historial completo → verificar
  valle-design vacío → push como main de valle-design.

## R1 — apps/api de valle-design ARRANCA (hecho en esta rama)

- [x] Raíz: package.json (workspaces + turbo), turbo.json, .nvmrc, .gitignore,
  .gitattributes, README, LICENSE, .env.example, docker-compose (PostgreSQL 16 + MinIO;
  MinIO reservado para blobs S3 futuros — hoy los blobs viven en BD), .gitleaks.toml con
  allowlist EXACTA del fixture `0123456789abcdef` (FP documentado en PHASE3-EXTRACTION.md;
  gitleaks historial completo = 0 hallazgos con la config, 1 FP sin ella).
- [x] apps/api NestJS real: common/ (tenant, database, entities, testing, filters, config)
  copiado/adaptado del origen; scaffolding (tsconfig, nest-cli, jest + harness, scripts
  build/bootstrap-smoke/jest-postgres) del origen.
- [x] Adaptadores enterprise SUSTITUIDOS: `design_blobs` (DatabaseBlobStore content-addressed,
  dedup sha256, GC dos barridos) ← CAD_BLOB_STORE; `design_audit_log` (DesignAuditLog)
  ← CAD_AUDIT_PUBLISHER; ConfigEntitlementClient (ENTITLEMENTS_MODE=allow-all|platform-api,
  allow-all default en dev, platform-api default fail-closed en prod) ← ENTITLEMENT_CLIENT.
- [x] Auth server-side real: CadAuthGuard valida JWT de Platform (secreto compartido
  JWT_SECRET/SESSION_SECRET) + PermissionsGuard cad:* (mapeo engineering:*→cad:* de
  @axos/contracts) + entitlement design.cad; TenantInterceptor → TenantContextService.
- [x] Superficie /v1/cad/*: projects CRUD, documents (open/meta/archive suave), content CAS
  inline + archive gzip multipart, versions, publications, dxf get/put/delete/export,
  blocks CRUD, intent/vision. 2 migraciones nuevas (design_blobs; design_audit_log +
  columnas dxf_* en cad_documents). Seed demo real e idempotente.
- [x] Verificación: typecheck limpio; `npm test` 19 suites/101 tests verdes (+1 suite pg
  aparte: 4 tests verdes con TEST_DATABASE_URL); migraciones limpias en BD virgen
  (4 CAD + 2 nuevas); bootstrap-smoke OK; boot real + smoke HTTP autenticado OK.
- **TODO-R3 (imposición comercial real)**: sustituir ConfigEntitlementClient por el cliente
  HTTP de la API de Platform (`specs/platform-api.v1.yaml`). El modo `platform-api` HOY
  niega fail-closed con warn; el TODO está anotado en
  `apps/api/src/modules/cad-documents/platform-client.adapter.ts`. **Sigue pendiente tras
  R3 (Fase 5).**
- Pendiente R2: web re-scaffolding (apps/web sin package.json aún), SDK generado desde los
  YAML, alias 1:1 de rutas del YAML (/v1/projects…) vs prefijo actual /v1/cad/*, endpoints
  de review-sessions/comments, publicador real de eventos design.* y optimize NL→CAD.

## R2 — apps/web ARRANCA (commit b77464f; resumen — R2 no actualizó este archivo)

- [x] Scaffolding Next.js real (tailwind v4, next-intl EN/ES, tsconfig estricto que
  typechequea también e2e/). Plataforma Design: sesión por token de Platform
  (`axos_access_token`, handoff `#access_token`), providers DesignAuth/Theme/Toast,
  `CadStudioHost` (Host Design sin `analysisPanels` — los comandos de análisis degradan
  con `analysis_pack_missing`).
- [x] `src/lib/cad-api.ts`: adaptador legacy→v1 con el mapa documentado de los 21 call
  sites `/line-engineering/*` → `/v1/cad/*`. Rutas: `/` (landing), `/studio` (estudio
  AXOS-CAD-STUDIO/UNIVERSAL), `/dashboard/cad` → redirect `/studio`.
- [x] Verificación R2: 118/118 specs web; typecheck/eslint 0 errores; smoke E2E real de
  11 etapas contra la API R1; gitleaks 0.
- Hueco anotado por R2: documentos >1MB (puntero a blob) sin descarga en v1 → 502
  defensivo del adaptador. **Cerrado en R3 (hidratación).**

## R3 — cierre de la reestructura (esta rama)

- [x] **HIDRATACIÓN (cierra el hueco de R2)**: `GET /v1/cad/documents/:id` (y
  `GET .../versions/:version`) devuelven el documento canónico HIDRATADO — la semántica
  del `getLayout` del origen (`includeCadDocument=true`): un documento >1MB persiste como
  puntero a blob (`_storage`), pero el servidor lo rehidrata desde `design_blobs` al abrir
  y responde el JSON inline. Cambio ADITIVO documentado en `design-api.v1.yaml` (redocly
  0/0). Extra aditivo de paridad legacy: la apertura incluye la COLOCACIÓN del DXF de
  fondo (`dxf: DxfPlacement|null`) — el adaptador ya no sondea `GET .../dxf` a ciegas
  (adiós 404 de ruido en consola). El 502 defensivo del adaptador web queda como red de
  seguridad anti-API-pre-R3 (con la hidratación nunca dispara); el clone de documentos
  grandes funciona. Specs: round-trip REAL >1MB por blob en `cad.controller.spec.ts`
  (10/10) y en el navegador (e2e/real).
- [x] **Corrección de contrato (transporte)**: el YAML decía que las respuestas viajaban
  en el sobre `ApiSuccessEnvelope` de enterprise — FALSO respecto de la API R1 real
  (cuerpos directos; errores = cuerpo Nest + `code`/`details`/`requestId`; el 409 CAS con
  `expected`/`current` al nivel superior). El spec ahora describe la realidad; `ApiError`
  y `CadDocumentVersionConflictError` corregidos. El SDK y su compat-test dependen de esto.
- [x] **E2E dorados migrados a la superficie Design**: fixture nuevo
  `e2e/fixtures/cad-v1-backend.ts` (fake in-memory de `/v1/cad/*` con las formas REALES
  de la API: {items}, CAS 409 contractual, blocks, publications server-managed, dxf,
  multi-documento) — los intercepts legacy `/line-engineering/*` desaparecen; página
  objetivo `/studio`. Aserciones y flujos intactos, con 3 adaptaciones documentadas en
  los propios specs: (1) spec 21 — el mensaje del xref 'missing' pasa a la semántica de
  producción real («no canonical CAD document»: el GET del layout legacy nunca 404ea; el
  mock 404 del origen era sintético) y los seeds reflejan la revisión real que envía el
  palette tras cada remount; (2) spec 26 — los `assets` ya no viajan por la red (v1 solo
  persiste el documento canónico): el snapshot los DERIVA con la misma proyección del
  editor (`cadDocumentToEditorSnapshot`), mismos conteos; (3) perf 100k — el corpus se
  siembra bajo AXOS-CAD-STUDIO@UNIVERSAL (la etiqueta AXOS-CAD-PERF del mock legacy era
  cosmética). Ningún golden ejercitaba paneles industriales (WP6 los dejó en enterprise;
  la degradación `analysis_pack_missing` está cubierta por specs unitarios del seam).
- [x] **E2E full-stack REAL nuevo** (`e2e/real/studio-real-api.spec.ts`, gate
  `E2E_REAL_API=1`): /studio contra la API NestJS real SIN mocks — abrir/editar/guardar
  CAS desde el navegador, 409 contractual, y el corpus >1MB al blob store y de vuelta
  HIDRATADO al editor (antes de R3 esa apertura era el 502). JWT firmado real
  (`signedPlatformJwt`, secreto dev compartido).
- [x] **SDK** `packages/design-sdk` (@valle/design-sdk): tipos generados con
  openapi-typescript 7.9.1 (pineado, generado versionado — build sin red) + cliente fetch
  fino tipado (`createDesignClient`; mapeo de montaje `/v1/*`→`/v1/cad/*` en un solo
  lugar; `DesignApiError` con el 409 tipado) + README + compat-test de contrato
  (tipos generados vs `@axos/contracts`: códigos de error, permisos cad:*, entitlement,
  puntero a blob, límites y eventos — `node --test`, 6/6). Integrado al build turbo.
- [x] **CI propio** `.github/workflows/ci.yml` (modelado en el del origen, recortado):
  quality-gates (npm ci → redocly → sbom+licencias → build turbo → typecheck api/web →
  unit api → test:pg con service container postgres:16 → lint api/web → test:specs web →
  compat SDK → checker del acceptance journey → bootstrap-smoke vs Postgres), e2e
  full-stack (next build prod + API real + next start + playwright con goldens
  moqueados-en-frontera + e2e/real sin mocks + perf), gitleaks (binario 8.24.3, historial
  completo, `.gitleaks.toml`), sbom CycloneDX como evidencia. `scripts/
  check-dependency-licenses.mjs` portado del origen (131 componentes: 0 bloqueadas,
  2 LGPL en revisión — sharp-libvips, misma postura del origen). El workflow NO se pudo
  ejecutar en GitHub desde este entorno: YAML validado con parser y cada comando probado
  localmente en el mismo orden.
- [x] **Verificación R3 (números exactos de esta máquina)**: api 19 suites/102 tests
  (+1 suite pg aparte 4/4 contra PostgreSQL 16; el controller 10/10 incluye el round-trip
  >1MB) + typecheck/lint 0 errores; web 118/118 specs + typecheck 0 + eslint 0 errores;
  SDK compat 6/6; **E2E 27/27** (23 goldens + 2 performance + 2 full-stack real) contra
  `next build`+`next start` (prod) + API NestJS real; redocly 0/0; gitleaks 405 commits →
  0 hallazgos (y scan de filesystem: hallazgos SOLO en artefactos git-ignored).
  **BASELINE 100k de Design en esta máquina** (spec cad-viewport-100k): 10k →
  canonicalReady 1 141 ms, frameLatency 4.1 ms (payload apertura v1: 1 459 978 bytes);
  100k → canonicalReady 6 431 ms, detailReady 25 275 ms, frameLatency 28.8 ms,
  zoomSettle 29 140 ms, rendered inicial 2 500/100 000 visibles, zoom 68 200 visibles /
  2 500 rendered, heap 225 MB (payload apertura v1: 14 690 028 bytes).
  **Arranque desde clon limpio** (export git del árbol → dir virgen): npm ci OK, turbo
  build 4/4, migraciones sobre BD virgen `valle_design_clean` (6 migraciones → 10
  tablas), turbo test 4/4 (api 102 + web 118 + sdk 6), test:pg 4/4, smoke E2E golden 10
  2/2, bootstrap-smoke OK.

### Estado REAL del repo valle-design tras R3

**Corre hoy**: API NestJS completa `/v1/cad/*` (auth JWT Platform + RBAC cad:* +
entitlement configurable, CAS, blob store con hidratación, DXF, blocks, publicaciones,
intent/vision AI_MOCK, migraciones PG + SQLite dev), web Next.js con el editor CAD
completo en `/studio` (standalone, degradación industrial limpia), SDK tipado, suite E2E
dorada + full-stack real, CI declarado.

**Falta (por fase)**:
- **Fase 4 — datos**: exportador/importador enterprise→design (los documentos
  AXOS-CAD-STUDIO reales viven en `sf_line_layouts` del origen; el `legacySourceId` de
  las tablas cad_* ya está previsto). Sin datos migrados, Design nace vacío.
- **Fase 5 — seguridad/comercialización total**: cliente HTTP real de entitlements
  contra platform-api (`platform-client.adapter.ts` sigue config-only, fail-closed en
  modo platform-api); endpoints review-sessions/comments del contrato (la API aún no los
  sirve) + UI de review links; publicador real de eventos `design.*` (hoy noop);
  optimize NL→CAD (fuera del contrato v1; candidato v1.1); rate limiting/hardening de
  prod; alias 1:1 opcional de rutas del YAML.
- **Fase 6-7**: retiro del CAD de enterprise (gates 1-8) y CI/CD final con la matriz de
  criterios — sin cambios respecto del plan.

## Pendiente (orden)

1. Fase 3 reestructura en valle-design (apps/packages, arranque limpio, CI propio).
2. Fase 4 exportador/importador de datos. Fase 5 seguridad/comercialización.
3. Fase 6 retiro del CAD de enterprise (SOLO con gates 1-8 demostrados).
4. Fase 7 CI/CD y evidencia final (matriz 18 criterios).

## Decisiones tomadas (resumen; detalle en DECISIONS.md)

- D-001: PR #1445 excluido del baseline (ERP puro, no bloqueante).
- D-004: modules/engineering (CAD-lite legado) se queda en enterprise.
- D-005: migraciones legacy de sf_line_layout quedan; design nace con migraciones cad_* propias.
- D-006: infra de pruebas compartida se duplica en ambos repos.
- D-002: Todo el trabajo de enterprise va en la rama designada
  `claude/migrate-cad-valle-design-6nle2k` con commits pequeños, integrable por PR a `main`.

## Riesgos abiertos

- Push de tags bloqueado por el proxy del entorno (mitigado: main nunca se reescribe; comando
  documentado para el usuario).
- Respaldos mirror/bundle viven en contenedor efímero (mitigado: instrucciones para el usuario).
- El contenedor se reinicia con frecuencia matando agentes/verificaciones en background:
  commitear pequeño y temprano; specs corren en foreground; PostgreSQL hay que re-arrancarlo
  (`service postgresql start`) tras cada reinicio.
- tsx (runner de specs) no hace typecheck: todo cambio de tipos exige `next build`/tsc antes
  del push (el CI del PR lo atrapó en 8169d66e).

## Cómo retomar en una sesión nueva

1. Leer este archivo y `docs/product-split/DECISIONS.md`.
2. `git -C /home/user/valle-enterprise status` — la rama de trabajo es
   `claude/migrate-cad-valle-design-6nle2k`.
3. Continuar con la primera casilla no marcada de "Pendiente".
