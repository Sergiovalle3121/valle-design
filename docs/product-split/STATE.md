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
