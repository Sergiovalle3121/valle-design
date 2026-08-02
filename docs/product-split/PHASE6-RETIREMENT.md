# PHASE6-RETIREMENT — Retiro del runtime CAD embebido de enterprise

Fecha: 2026-08-02 · Rama: `claude/migrate-cad-valle-design-6nle2k` (sobre `main` = `b550e84c`).
Precondición cumplida: gates 1–8 de la matriz de aceptación en PASS (ver ACCEPTANCE-MATRIX.md).

## Reglas supremas respetadas

- **NADA de datos se borró**: `sf_line_layouts` y sus columnas CAD (`cad_document`,
  `cad_document_version`, `dxf_*`, snapshots con `cadDocument`) quedan EXACTAMENTE como
  están, en modo **read-only** durante el periodo de rollback. Ninguna migración se
  eliminó ni se creó migración destructiva (las migraciones `*Cad*` históricas siguen en
  `apps/api/src/migrations/`, incluida `CreateCadDocumentsFoundation` y su spec).
- **Ninguna funcionalidad enterprise se perdió**: los 18 análisis industriales (Yamazumi,
  balanceo local, costos, buffers, holguras, SMED, expediente, bitácora…) siguen usables
  desde la nueva pestaña **Análisis** de `/dashboard/line-engineering`, y TODOS los
  endpoints industriales `/line-engineering/*` que los alimentan siguen vivos.

## Qué se retiró (por grupo, con conteos)

### WEB (apps/web)

| Grupo | Qué | Conteo |
|---|---|---|
| `src/lib/cad/` | Kernel CAD completo (editor, geometría, snaps, DXF, comandos, colaboración, recovery, seam analysis-extensions) | 229 archivos (incl. **107 specs**: 95 en lib/cad + 12 en lib/cad/commands) |
| `src/components/line-engineering/` CAD-only | `Layout3DEditor.tsx` (10.6k líneas), `Layout3DEditorHost.tsx`, `LayoutEditor.tsx` + `Layout3D.tsx` (código muerto), `cad-workbench/` (13 archivos), `PlantMinimap/ScaleBar/Minimap`, `dxf.ts/dxf-snap.ts/dxf-walls.ts`, wrappers (`snap-engine/geom-edit/geom-measure/cad-array/dimension-format/precision-input`), `plot-scale/plot-sheet`, `cad-command/cad-intent/cad-vision/cad-format-detect`, `asset-catalog`, `auto-dimensions`, `professional-snapping.spec`, `arrange-line/connect-line`, `design-checks.ts` y `flow-metrics.ts` (solo el editor los usaba — ningún panel re-hospedado los importa) | 50 archivos (incl. **10 specs**) |
| `src/lib/line-engineering/register-cad-analysis.ts` | El seam de extensiones se va con lib/cad | 1 archivo |
| E2E CAD | goldens `10-cad`…`28-cad` (19), `cad-acceptance-journey.ts/.check.ts`, `e2e/performance/cad-viewport-100k.spec.ts` | 22 archivos |
| `scripts/cad-perf-scale.mts` | Corría sobre lib/cad/perf-baseline | 1 archivo |

Todo esto **vive en valle-design** (extraído en Fase 3 con historial; goldens 10–28 y
performance verdes allá — criterios 5–8 de la matriz).

### API (apps/api)

| Grupo | Qué | Conteo |
|---|---|---|
| `src/modules/cad-documents/` | Módulo entero: CadDocumentsService (dominio del documento canónico), storage gzip/CAS, validación v1–v3, CadBlocks/CadIntent/CadVision, line-dxf, CadLegacyProjectionService, adaptadores (blob store, audit, eventos, CIDE, platform), puertos y 7 entidades `cad_*` | 43 archivos (incl. **14 specs**; las tablas `cad_*` en BD NO se tocan) |
| Endpoints CAD del controller `line-engineering` | `POST layout/cad-intent`, `GET layout/optimize-copilot`, `POST layout/vision`, `GET/POST/PATCH/DELETE cad-blocks`, `PUT layout/cad-archive`, `POST layout/publications`, `GET/PUT/DELETE layout/dxf`, `GET layout/dxf-export` | **13 endpoints** (el controller queda solo industrial) |
| Delegados CAD en `line-engineering.service` | hidratación/almacenamiento del documento, CAS `compareAndSwapCadDocument`, `recordCadPublication`, `saveLayoutArchive`, `getLayoutDxf`, `getDxf/setDxf/clearDxf`, proyección a tablas `cad_*`, rama `cadDocument`/`dxf` de `saveLayout`, restauración del `cadDocument` en `restoreSnapshot` | ~350 líneas |
| DTOs CAD | `CadIntentDto`, `CadVisionDto`, `Create/UpdateCadBlockDto`, `RecordCadPublicationDto`, `UploadDxfDto`, `DxfMetaDto`, campos `cadDocument`/`expectedCadDocumentVersion`/`dxf` de `SaveLayoutDto` | 6 clases + 3 campos |
| `line-engineering-cad-projection.spec.ts` y 5 tests CAD de `line-engineering.service.spec.ts` | Probaban escrituras CAD que ya no existen | 1 suite + 5 tests |

### Semántica que cambió deliberadamente (documentada)

- `GET /line-engineering/layout` **ya no hidrata `cadDocument`** (devuelve `null` en ese
  campo; `cadDocumentVersion` sigue reportando el token persistido). El único consumidor
  era el editor retirado.
- `POST layout/snapshots` sigue copiando el valor almacenado de `cad_document` VERBATIM
  (copia de datos pura, sin lógica CAD) para fidelidad del rollback; **restore ya no toca**
  `cad_document`/`cad_document_version` (columnas read-only) pero restaura fielmente todo
  lo industrial (posiciones, footprint, flujo, equipo, anotaciones, colocación del plano).
- `cloneLayout` sigue copiando `dxf_data` (copia de datos, no runtime CAD).

## Qué se CONSERVA y por qué

1. **`CadBlobReferencesProvider`** (line-engineering) — protege los blobs CAD legados del
   GC de documents mientras dure el periodo read-only. Ahora es **autosuficiente**: el
   extractor laxo `cadBlobKeyFromStoredDocument` es util local
   (`line-engineering/cad-blob-pointer.ts`, con spec propia de 4 tests); cero imports a
   cad-documents.
2. **Datos CAD legados read-only** — `sf_line_layouts.cad_document(+version)`, `dxf_*` y
   los `cadDocument` dentro de `snapshots`: ventana de rollback. Ningún código enterprise
   los escribe ya.
3. **Los 18 paneles industriales** — re-hospedados (ver abajo).
4. **`/dashboard/cad`** — la ruta se conserva como página de TRASPASO (deep links
   históricos): explica el cambio y redirige a `NEXT_PUBLIC_VALLE_DESIGN_URL` + `/studio`.
5. **`LayoutAsset` y demás vocabulario del layout** — vuelven a ser locales de
   `sf-line-layout.entity.ts` (el re-export desde cad-documents se invirtió).

## Paneles industriales — decisión (punto 3 del mandato)

Inspección de props: **17 de los 18 paneles se auto-alimentan por API** con
`model/revision` (`/line-engineering/layout/*`: scorecard, heatmap, staffing, buffers,
operator-loops, clearance, continuity, cohesion, density, cost, sensitivity, compare,
standard-work, dossier, flex-line, changeover, history; WhatIfSimulator usa
balance+staffing). El único que dependía de datos internos del editor era
**LineBalancePanel** (`placedStations` de la geometría en vivo): se le dio la **vía API
equivalente** — las estaciones del ruteo (`/line-engineering/stations`, con `stdTimeSec`
como ciclo), la MISMA fuente con la que el servidor calcula el resto de la analítica.
**Ningún panel quedó fuera.** Además se RESCATÓ `ChangeoverMatrix` (SMED), que había
quedado huérfano cuando murió el editor 2D legado y funciona por API.

- `industrial-analysis-panels.tsx` — REESCRITO: descriptor local
  (`AnalysisPanelDescriptor`/`AnalysisPanelContext`, sin tipos del editor), 18 paneles.
- `AnalysisWorkbench.tsx` — NUEVO host simple (selector + monta el panel elegido) usado
  por la nueva pestaña **Análisis** de `/dashboard/line-engineering` (sustituye a `cad3d`,
  que además ofrece el deep link a Valle Design).

## design-integration — el adaptador del mandato (API)

Nuevo módulo `apps/api/src/modules/design-integration/` (registrado en AppModule,
exportado para consumo MES futuro):

- **`DesignLinkService`** — config `VALLE_DESIGN_URL`; deep link `/studio` del contrato;
  builder de `DesignDocumentReference` (@axos/contracts) que persiste EXACTAMENTE lo
  permitido por la regla de frontera: `cadProjectId`/`cadDocumentId`/`cadPublicationId` +
  `deepLink` (opaco, se guarda tal cual) + snapshot read-only. Spec: 6 tests.
- **`DesignSnapshotService`** — cliente HTTP fino contra `GET /v1/cad/documents/:id`
  (contrato design-api.v1) con token de servicio `DESIGN_SERVICE_TOKEN` (Bearer);
  `VALLE_DESIGN_API_URL` con fallback a `VALLE_DESIGN_URL`; **fail-soft integral** (sin
  config, red caída, HTTP no-2xx o payload corrupto ⇒ `null` + warn, jamás rompe).
  Proyecta el `CadDocumentResource` (inline o puntero a blob con `summary`) al
  `DesignDocumentSnapshot` permitido (name/contentVersion/entityCount). Spec: **7 tests
  contra un servidor HTTP real** que sirve la forma del contrato (200 inline/blob/null,
  401, 404, corrupto, conexión rechazada).
- Sin caché persistente por ahora (mínimo honesto): si MES lo necesita, el caché será
  columna/tabla NO destructiva en el módulo consumidor.
- Envs documentadas en `apps/api/.env.example` y `apps/web/.env.example`
  (`NEXT_PUBLIC_VALLE_DESIGN_URL`).

## Gobernanza

- `docs/enterprise/capabilities.json`: `design.cad-documents` → **status `deprecated`**
  (retirado/externo), `canonicalOwner: design-integration`, evidencia de tests nueva. Se
  decidió NO eliminar la capability: el validador lo permitiría, pero el registro
  documenta la ventana de rollback y la superficie de integración (`deprecated` es el
  estado del validador que expresa "retirado"). `check:capabilities` verde (26).
- tenant-safety regenerado con el árbol final (`audit --write-baseline` + `--write`):
  **879/879**, `check:tenant-safety` y `test:tenant-safety` (40/40) verdes.

## Evidencia ANTES (2026-08-02, pre-retiro, mismo entorno)

| Gate | Resultado |
|---|---|
| `smoke:bootstrap` (axos_smoke) | OK — application graph initialized cleanly |
| `npm test` (api) | Suites **374 passed / 8 skipped / 382**; Tests **2509 passed / 21 skipped / 2530** |
| `test:specs` (web) | **137/137** (95 lib/cad + 12 lib/cad/commands + 10 CAD en components/line-engineering + 20 no-CAD) |
| `check:nav` | 86 áreas + 9 prefijos OK |
| `smoke:golden` (axos_smoke, dist reconstruido) | **OK** — cadena canónica completa fases 1–6 |

## Evidencia DESPUÉS (mismos comandos + suite completa)

| Gate | Resultado |
|---|---|
| build turbo (raíz) | 6/6 tasks OK (incl. `next build` web y build api) |
| typecheck api | 0 errores |
| lint api / lint web | 0 errores (warnings pre-existentes intactos: 1967 api) |
| `test:specs` (web) | **20/20** |
| `npm test` (api) | Suites **363 passed / 7 skipped / 370**; Tests **2457 passed / 17 skipped / 2474** |
| `test:pg` | **7 suites / 17 tests** (antes 8/21) |
| tenant-safety | 879/879 + 40/40 tests del analizador |
| check:capabilities / canonical-posting / brand / nav | Todos verdes (nav: 86 áreas + 9 prefijos — `/dashboard/cad` sigue existiendo como traspaso) |
| `smoke:bootstrap` (axos_smoke) | OK |
| `smoke:golden` | **OK** en BD limpia `axos_smoke_f6` (cadena canónica completa fases 1–6). Nota: la re-corrida sobre la MISMA `axos_smoke` usada en ANTES falla por estado acumulado (la aserción "tenant B ve exactamente 1 entidad legal" encuentra la de la corrida anterior) — comportamiento pre-existente del smoke re-ejecutado, ajeno al retiro; en CI cada corrida usa BD fresca |

### Delta de tests — explicado al 100%

**Web: 137 → 20 = −117**, íntegramente los specs CAD retirados:
- 95 `src/lib/cad/*` + 12 `src/lib/cad/commands/*` = 107
- 10 CAD de `src/components/line-engineering/` (asset-catalog, cad-command,
  cad-format-detect, cad-intent, cad-vision, cad-workbench/CadCommandDock, plot-scale,
  plot-sheet, precision-input, professional-snapping)
- Los 20 restantes (industriales lib/line-engineering ×5, homePersona, industryNav, cide,
  config, app, hooks, pdf-studio, searchSources) pasan idénticos.

**API suites: 382 → 370 = −12** = −15 retiradas (14 de cad-documents — incl.
`line-dxf.spec` y `cad-legacy-projection.pg.spec`, la suite que corría "skipped" en
`npm test` — + `line-engineering-cad-projection.spec`) **+3 nuevas** (`cad-blob-pointer`,
`design-link.service`, `design-snapshot.service`).

**API tests: 2530 → 2474 = −56** = −68 de las 15 suites CAD (64 passed + 4 skipped del
pg-spec; verificado ejecutándolas aisladas en un worktree de HEAD) −5 tests CAD retirados
de `line-engineering.service.spec` (48 → 43; canonical CAD doc, gzip+CAS, escritor
concurrente, publicación, DXF de fondo) **+17 nuevos** (4 cad-blob-pointer + 6
design-link + 7 design-snapshot). Passed: −52 = −64 −5 +17 ✓ · Skipped: −4 ✓.

**test:pg: 8/21 → 7/17** = `cad-legacy-projection.pg.spec` (1 suite / 4 tests).

### Grep final de frontera

`grep -rn "cad-documents|lib/cad"` sobre `apps/ packages/ scripts/` (fuera de
node_modules/dist): **cero imports** — solo comentarios históricos que documentan el
retiro y las migraciones históricas intactas.

## Cómo revertir

Los commits de esta fase son puramente de código (ningún dato ni migración tocada), así
que `git revert` del rango de la Fase 6 restaura el runtime CAD embebido tal cual:
los datos read-only de `sf_line_layouts` siguen donde estaban y el editor los reabre.
Orden recomendado: revertir en bloque (revert del merge de la PR de Fase 6) y regenerar
el baseline de tenant-safety (`npm run audit:tenant-safety -- --write-baseline && --write`),
porque el audit escanea el filesystem. La ventana de rollback termina cuando el usuario
decida (decisión explícita futura); hasta entonces nadie borra `cad_*` ni columnas CAD.

## Pendientes que esta fase deja explícitos

- El caché opcional del snapshot Design (columna/tabla no destructiva) se hará cuando el
  primer consumidor MES real lo pida — `DesignSnapshotService` ya expone la lectura.
- El deep link a documento específico se guardará vía eventos de Design
  (`DesignDocumentReference.deepLink` opaco); hoy solo se construye el traspaso `/studio`.
- Actualizar la suite visual (visual-sweep) corre opt-in (EVIDENCE=1) — se reescribieron
  sus 2 tests CAD hacia la pestaña Análisis, pero no forman parte de los gates.
