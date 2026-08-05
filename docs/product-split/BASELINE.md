# BASELINE — Línea de comparación de paridad (Fase 0)

Fecha: 2026-08-01 · Autor: sesión de migración CAD → valle-design

## BASELINE_SHA

```
4cf045ad48485b9a4467465b727f5e977592666b  (tip de origin/main al iniciar)
fix(erp): el control de crédito cuenta los pedidos EMBARCADOS no facturados (O2C) (#1444)
```

- Historial completo: **2,128 commits** en `main` (el clon del entorno era shallow con 222;
  se ejecutó `git fetch --unshallow` antes de decidir nada).
- Árbol de trabajo limpio al iniciar (`git status` sin cambios, rama de trabajo
  `claude/migrate-cad-valle-design-6nle2k` creada desde este SHA).

## Ramas y PRs abiertos (Regla 1)

| Ref | Tipo | Contenido | Clasificación |
|---|---|---|---|
| `main` | rama | baseline | — |
| (rama del repositorio anterior) | rama de PR #1445 | fix ERP O2C | EXCLUIDO |
| PR **#1445** (draft) | PR abierto | `invoiceSO` exactamente-una-vez: 2 archivos, ambos `apps/api/src/modules/erp-core/services/` (fix + spec pg) | **EXCLUIDO / NO BLOQUEANTE** — cero rutas CAD; no toca rutas que la Fase 1 refactoriza; permanece en enterprise y se fusiona por su flujo normal. Detalle en DECISIONS.md D-001 |

No existen otras ramas ni PRs abiertos. No hay trabajo CAD sin fusionar fuera de `main`.

## Respaldos (Regla 3)

| Artefacto | Ubicación | Estado |
|---|---|---|
| Tag inmutable `pre-cad-split-20260801` @ BASELINE_SHA | local en clon | ⚠️ creado; el proxy git del entorno no confirma push de tags. **Usuario**: `git push origin pre-cad-split-20260801` y verificar con `git ls-remote origin 'refs/tags/*'` |
| Mirror completo | `/home/user/backups/valle-enterprise-mirror.git` (88 MB) | ✅ creado (contenedor efímero: conservar copia offline) |
| Bundle completo | `/home/user/backups/valle-enterprise-full-20260801.bundle` (81 MB) | ✅ `git bundle verify`: "records a complete history" |

## Resultados baseline (ANTES de tocar nada)

Entorno: Node v22.22.2, npm 10.9.7, PostgreSQL 16.13 local, 4 vCPU.
`npm ci` desde lockfile: **exit 0**.

| Paso | Comando | Resultado | Detalle |
|---|---|---|---|
| Build monorepo | `npm run build` (turbo: api+web+packages) | ✅ exit 0 | 05:51–05:53 UTC |
| Typecheck API | `apps/api: npm run typecheck` | ✅ exit 0 | |
| Lint API | `apps/api: npm run lint:check` | ✅ exit 0 | |
| Lint Web | `apps/web: npm run lint` | ✅ exit 0 | |
| Specs Web | `apps/web: npm run test:specs` | ✅ **136/136 verdes** | de ellas **106 en `src/lib/cad/`** (los "~106 specs del kernel" de la misión, confirmado exacto) |
| Unit API | `apps/api: npm test` | ✅ **2,468 passed / 17 skipped** (363 suites passed, 7 skipped) | las 7 suites saltadas son `*.pg.spec.ts` (exigen PostgreSQL; ver abajo) |
| Tenant safety | `npm run test:tenant-safety` | ✅ 0 fail | |
| Suites PostgreSQL | `apps/api: npm run test:pg` con PG 16 local (`TEST_DATABASE_URL` a BD `valle_test`) | ✅ **7 suites / 17 tests passed** | cubre exactamente las 7 suites/17 tests saltados en `npm test` → cobertura unit+pg completa |

Logs completos del baseline: `scratchpad/baseline/*.log` de la sesión (efímeros); los conteos
de arriba son el contrato de paridad. Toda fase posterior debe reproducir **estos números o
mejores**, con explicación documentada de cualquier diferencia.

## Suites NO ejecutadas en el baseline (documentado, no ocultado)

- `apps/web: npm run e2e` (Playwright full-stack): requiere app+api+DB orquestados; se
  ejecutará como gate en Fase 3/6 con la misma receta en ambos repos. El baseline de paridad
  E2E se establecerá en la primera corrida completa (misma máquina, misma receta, ambos lados).
- `apps/api: npm run test:e2e`: ídem.
- Benchmark 100k (`e2e/performance/cad-viewport-100k.spec.ts`): forma parte de la corrida
  Playwright; su baseline numérico se capturará en esa corrida (Fase 3) sobre esta misma
  máquina para que la comparación Design-vs-Enterprise sea manzanas con manzanas.
