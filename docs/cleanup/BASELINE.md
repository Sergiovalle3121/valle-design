# BASELINE — Fase 0 de purificación (valle-design)

Fecha: 2026-08-02 · Commit medido: **`d71cc3a54e498012301df072a9777e14a198a099`** (tip de `main`)
Método: **clon limpio desde el remoto**, `npm ci` desde lockfile, sin estado local reutilizado.

> Registro del estado **ANTES** de la purificación. Los fallos se reportan tal cual.

## Referencias verificadas

| Ref | Valor |
|---|---|
| `valle-design/main` | `d71cc3a54e498012301df072a9777e14a198a099` ✅ coincide con el esperado |
| PR #2 | abierto, draft — bitácora del split |
| Ancla remota de respaldo | rama `backup/design-split-v1-d71cc3a` @ `d71cc3a5` (creada vía API, SHA verificado) |
| Tag local `design-split-v1-d71cc3a` | creado; **push bloqueado por el proxy del entorno** (ver BASELINE de enterprise §Respaldos para el comando de publicación) |
| Bundle | `valle-design-d71cc3a-20260802.bundle` — 2.4 MB, 6 refs, `git bundle verify`: *records a complete history* |

## Entorno

| | Declarado | Usado | Nota |
|---|---|---|---|
| Node | **20** (`.nvmrc`) | **v22.22.2** | ⚠️ discrepancia real: el entorno solo ofrece Node 22. El CI de GitHub sí usa 20. |
| PostgreSQL | 16 | 16.13 | ok |

## Resultados (clon limpio)

| Paso | Exit | Detalle medido |
|---|---|---|
| `npm ci` | ✅ 0 | |
| `turbo run build` | ✅ 0 | 4 workspaces |
| `turbo run typecheck` | ✅ 0 | |
| lint API / lint web | ✅ 0 | 0 errores |
| specs web | ✅ 0 | **118/118** |
| unit API | ✅ 0 | **27 suites / 165 tests** (2 suites / 8 tests saltados = `*.pg.spec.ts`) |
| PostgreSQL tests | ✅ 0 | **2 suites / 8 tests** (incluye aislamiento entre tenants) |
| SDK compat | ✅ 0 | |
| migraciones desde base VACÍA | ✅ 0 | **9 migraciones** limpias |
| bootstrap smoke | ✅ 0 | |
| OpenAPI (redocly lint) | ✅ 0 | 0 errores / 0 warnings |
| SBOM + licencias | ✅ 0 | |
| **gitleaks (historial completo)** | ✅ 0 | **sin hallazgos** con el `.gitleaks.toml` del repo |
| **`npm audit`** | ❌ 1 | **4 vulnerabilidades: 3 high, 1 moderate** — ver abajo |
| E2E Playwright | ⬜ no ejecutado en este baseline | La suite existe (27 specs) y corre en el CI del repo; se ejecuta aparte por costo. |

## Dependencias vulnerables

| Paquete | Severidad | Directo | Análisis |
|---|---|---|---|
| `next` | high | sí | Deriva de `postcss`/`sharp`. Verificar si la versión instalada ya está parcheada antes de tocar. |
| `postcss` | high | no (vía next) | |
| `sharp` | high | no (vía next) | CVEs de libvips; hay versión posterior. |
| `next-intl` | moderate | sí | Deriva de `next`. |

Todas reportan "fix available", pero npm propone **downgrades destructivos**. Se resolverán
con upgrades dirigidos u `overrides`, con verificación, nunca con `audit fix --force`.

## Deuda conocida que la purificación debe atacar

Estos puntos **no** son fallos del baseline (todo lo medible está verde) sino deuda
estructural que el mandato de purificación exige corregir. Se listan aquí para que el
"verde" no se lea como "limpio":

1. **Contratos contaminados**: `packages/contracts` conserva superficie heredada de
   ERP/MES/Office/pricing corporativo y se llama `@axos/contracts`.
2. **Adaptador de rutas legacy**: `apps/web/src/lib/cad-api.ts` traduce `/line-engineering/*`
   a `/v1/cad/*`, y varios controles de la UI terminan deliberadamente en 404.
3. **Divergencia de ruta canónica**: la API monta `/v1/cad/*` mientras el OpenAPI declara
   `/v1/*`; el rewrite del adaptador oculta la divergencia.
4. **Editor monolítico**: `Layout3DEditor.tsx` supera las 10,500 líneas y el undo/redo copia
   documentos completos.
5. **Plataforma operativa incompleta**: `NoopCadEventPublisher` y `NoopUsageMeter`; blobs en
   `BYTEA` de PostgreSQL en vez de object storage; falta UI real de proyectos, documentos,
   versiones, publicaciones y revisiones (el flujo principal está anclado al documento único
   `AXOS-CAD-STUDIO`).
6. **Thresholds de performance no profesionales**: los umbrales actuales admiten decenas de
   segundos y frames de hasta 1,000 ms.
7. **Documentación faltante**: `REPOSITORY_SCOPE.md`, `ARCHITECTURE.md`, `PRODUCT.md`,
   `SECURITY.md`, `DEPLOYMENT.md`, `RUNBOOK.md`, `CONTRIBUTING.md`, `THIRD_PARTY_NOTICES.md`.

## Conclusión

El repositorio **arranca, construye y pasa sus pruebas desde un clon limpio**, con secretos
limpios y migraciones reproducibles. **No está purificado**: conserva contaminación heredada,
divergencias de contrato y deuda arquitectónica que las siguientes fases deben eliminar.
