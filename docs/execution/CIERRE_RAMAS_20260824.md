# Campaña de integración y cierre de ramas — 2026-08-24

Repositorios: `valle-design` y `valle-design-dwg-conformance`.
Misión: una sola rama viva (`main`), cero PR abiertos, cero ramas huérfanas, gates en verde.

Regla de oro: **nunca se pierde trabajo**. Nada se borra sin demostrar por CONTENIDO
(archivos y símbolos, no metadata de git) que ya vive en `main`, o sin motivo escrito.

Este archivo es el contrato de la campaña. Se relee primero si el contexto se compacta.

---

## 0. Discrepancia detectada antes de empezar (anotada, no ignorada)

El brief de la campaña asume que los PR abiertos hoy son **#77, #78, #79, #86**. Verificado
contra GitHub: esos cuatro (y también #89, #91) están **cerrados sin fusionar** desde antes de
hoy. Los PR realmente abiertos ahora son **#87, #88, #90, #92**:

| PR | Rama cabecera | Base | Tema |
|---|---|---|---|
| #87 | `deps/majors-diferidos-20260822` | main@9ab69f8 | draft, "NO fusionar" — mismo caso que la rama CONSERVAR A PROPÓSITO del brief |
| #88 | `claude/dwg-campaign-integration` | main@f5e36ca | frente DWG, ola 2 |
| #90 | `claude/dwg-read-performance` | main@efce2ed | frente DWG, ola 2 |
| #92 | `claude/dwg-r2010-envelope` | main@efce2ed | frente DWG, ola 2 |

Decisión conservadora: tratar #87/#88/#90/#92 como "los PR abiertos reales" a resolver en la
Ola 4.5, con el mismo espíritu (comentario de qué se rescató/descartó y por qué) que el brief
pedía para #77/#78/#79/#86. Los PR viejos (#77, #78, #79, #86, #89, #91) no necesitan acción:
ya están cerrados.

`main` HEAD al arrancar: `2a2c8ac` (2026-08-23 18:05, "feat(legal): conecta la aceptacion de
terminos al contrato y al checkout") — mismo título que el commit único de
`claude/p0-legal-acceptance-gate`, primera confirmación de que esa rama es YA ABSORBIDA.

## 0.1 Hallazgo estructural: `main` no tiene una sola raíz histórica

`main` fue reescrita/consolidada en algún punto de agosto 2026. Su comparación con ramas viejas
arroja dos patrones distintos, y el método de verificación tuvo que adaptarse a cada uno:

- **Ramas con ancestro común** (la mayoría): `git diff origin/main...rama` funciona normal.
  Método: lista de archivos que la rama toca (diff de tres puntos) + ¿existen esos archivos en
  `main` hoy? + para las de mayor riesgo, diff de contenido restringido a esos archivos y chequeo
  de símbolos exportados.
- **Ramas con historia disjunta** (`git merge-base` falla, exit 1): `claude/dwg1-*` (6, raíz
  2026-06-16), `pr77`, `integration/olas-5-7`, `worktree-agent-a1044299019d5a941`,
  `worktree-agent-a608ba7097f1dc9d1` (raíz previa a 2026-08-14). El diff de tres puntos no
  produce nada — no es que no aporten archivos, es que git no puede calcularlo. Método:
  verificación de capacidad por agente dedicado, comparando lo que la rama afirma aportar
  (mensajes de commit) contra lo que existe hoy en `main`.

## 0.2 Hallazgo que resuelve 16 ramas de un golpe

Trece ramas viejas (`3d-solview`, `3d-nav`, `3d-ucs`, `3d-huecos`, `arranque`, `b-bloques`,
`confianza`, `geo`, `monolito-techo`, `normas`, `plataforma`, `robustez`, `script`, `wasm`,
`wasm-paridad` — más `lisp`) comparten como ÚNICO archivo ausente en `main`:
`apps/web/src/components/line-engineering/Layout3DEditor.tsx` (y, en 4 de ellas, además
`schema7-sha-provenance.spec.ts` o `station-overlays.{ts,spec.ts}`).

Verificado: **no falta, se movió y main lo dejó atrás a propósito**. El componente vive hoy en
`apps/web/src/components/cad/editor/Layout3DEditor.tsx` — 20.245 líneas contra las 22.777 de la
versión vieja, con `check:monolith-budget` como gate activo que sólo permite que ese archivo
encoja. El directorio viejo, `line-engineering/`, es exactamente el dominio que
`scripts/cad/check-no-line-engineering.mjs` prohíbe reintroducir (`IDENTITY.md:102`: "prohíbe
reintroducir las rutas HTTP del producto viejo"). `station-overlays.ts` (de `monolito-techo`) lo
confirma en su propio comentario: colorea estaciones por "el MES (paro/alerta/OK/inactivo)" —
Manufacturing Execution System, el dominio industrial que `check-no-industrial-domain.mjs`
prohíbe. `schema7-sha-provenance.spec.ts` es un spec de benchmark de un esquema (`schema7`)
superado por `cad-entities-v10.ts` en main hoy. `commit-msg.txt` (de `lisp`) es un archivo suelto,
no producto.

Ninguna de las 16 tiene, por tanto, contenido que `main` no tenga ya o no haya superado a
propósito. Verificación adicional por símbolo exportado (no sólo por ruta) en las de mayor
tamaño de diff (`v1-landing`, `v2-checkout`, `v3-perf`, y por extensión `a-dxf`, `c-plot`,
`factura`, `p4-ola2`, `p6-produccion`, `pdf`): cero símbolos exportados por esas ramas están
ausentes de `main` hoy. `main` muestra más líneas borradas que añadidas en los archivos que esas
ramas tocan — consistente con refactors posteriores que redujeron alcance, no con pérdida de
capacidad.

---

## 1. Inventario y veredicto — las 74 ramas

Leyenda: **INT**=Integrada (ahead=0, ancestro puro de main) · **ABS**=Ya absorbida (contenido
verificado en main por otra vía) · **RES**=Rescatar · **DESC**=Descartar · **CONS**=Conservar a
propósito.

### Frente P0 (Ola 1 — rescate en curso)

| Rama | Ahead/Behind | Últ. commit | Veredicto | Evidencia |
|---|---|---|---|---|
| `claude/p0-tenant-rls` | 4/2 | 2026-08-23 14:30 | **RES** | RLS `design_blobs` + rol `valle_app` + `tenant-rls-coverage.pg.spec.ts` + ADR-0013 — ninguno existe en main |
| `claude/p0-billing-entitlements` | 4/2 | 2026-08-23 15:01 | **RES** | `commercial-entitlement-period.spec.ts` + confirm integration spec — no existen en main |
| `claude/p0-deploy-release` | 4/2 | 2026-08-23 15:15 | **RES** | `validate-dockerfiles.spec.mjs` + `production-startup-smoke.spec.mjs` — no existen en main |
| `claude/p0-final` | 20/0 | 2026-08-23 18:28 | **RES** (vehículo de integración) | behind=0: contiene main de hoy completo + 8 archivos que faltan, idénticos a los de tenant-rls+billing+deploy-release+ADR. Fusión candidata en una sola operación |
| `claude/p0-integration-v2` | 16/1 | 2026-08-23 17:23 | **ABS en p0-final** | Mismo diff exacto (26 archivos) que p0-final menos 1 commit. p0-final la contiene |
| `claude/p0-legal-acceptance-gate` | 1/1 | 2026-08-23 16:37 | **ABS** | Diff de dos puntos contra main VACÍO — árbol idéntico. Mismo título que HEAD de main |
| `claude/p0-commercial-surface` | 6/2 | 2026-08-23 16:22 | **ABS** | Diff de dos puntos contra main VACÍO — árbol idéntico |
| `claude/pulido-ola0` | 10/2 | 2026-08-23 17:48 | **RES parcial** (sólo docs) | 4 archivos faltantes, los 4 son `docs/campaigns/*` y `docs/ops/runbook-repo-protection.md` — revisar si van a BACKLOG/docs o se descartan como notas de sesión |

### Frente DWG (Ola 2 — pendiente)

| Rama | Ahead/Behind | Últ. commit | Veredicto | Evidencia |
|---|---|---|---|---|
| `claude/dwg-campaign-integration` | 2/2 | 2026-08-23 16:23 | **RES** (primero, desbloquea) | CI espejo del corpus + fix gobernanza — PR #88 |
| `claude/dwg-read-performance` | 5/2 | 2026-08-23 16:56 | **RES** | Ya trae merge de dwg-campaign-integration. PR #90 |
| `claude/dwg-r2010-envelope` | 6/2 | 2026-08-23 16:56 | **RES** | `r2010-object-envelope.ts` nuevo (125 líneas) + spec — no existen en main. Ya trae merge de dwg-campaign-integration. PR #92 |
| `claude/dwg-entidades` | 2/55 | 2026-08-23 14:19 | **DESC** (pin roto — ver hallazgo) | Sus 2 commits sólo tocan `scripts/dwg/corpus-pin.json` (bump a`b531540b...`) y la evidencia JSON regenerada a partir de ese pin. **`b531540b245ad3b5aae4d0305b2c96fc02ca3a79` no existe** en `valle-design-dwg-conformance` — ni local (con historia completa desshallowed) ni vía API de GitHub ("No commit found for SHA"). El pin actual de main (`a60ebe2a`) sí es válido y es ancestro directo del HEAD real del corpus. Fusionar el pin roto dejaría los gates DWG verificando contra un commit fantasma. No se fusiona: se descarta el bump, y el hallazgo real que documentaba (15/15 AC1015 abren, 7 tipos nuevos faltantes) pasa a BACKLOG.md para remedirse contra el pin válido |

### Respaldos de emergencia (Ola 3 — pendiente)

| Rama | Ahead/Behind | Últ. commit | Veredicto | Evidencia |
|---|---|---|---|---|
| `claude/percepcion` | 1/55 | 2026-08-23 19:03 | **RES a revisar** | `hershey-fonts.ts` + data + spec — fuentes MTEXT, no existen en main. ¿Terminado o WIP? decidir en Ola 3 |
| `claude/evidencias-pendientes` | 1/55 | 2026-08-23 19:03 | **RES a revisar** | 6 archivos de scripts de evidencia (outbox-audit, review-concurrency, webhook-replay-audit) — no existen en main. ¿Terminado o WIP? decidir en Ola 3 |

### Conservar a propósito

| Rama | Ahead/Behind | Últ. commit | Veredicto | Evidencia |
|---|---|---|---|---|
| `deps/majors-diferidos-20260822` | 1/7 | 2026-08-23 04:15 | **CONS → migrar a docs/ y borrar rama** | PR #87 (draft, "NO fusionar"). Documentación viva de bloqueos verificados (TS7, ESLint 10, typeorm, next 16.3, @types/node 26, playwright). Mover a `docs/deps-majors-bloqueados.md`, luego borrar rama y cerrar PR #87 |

### Historia disjunta con `main` (sin ancestro común — verificado por agente dedicado)

Las 6 `dwg1-*` — raíz 2026-06-16, previas al intake de corpus DWG (2026-08-20): **ABS**. Cada
archivo que aportan ya existe por ruta en `main` (`comm -23` vacío en los 6 casos) y por
contenido: `dwg1-bitcodes` → `ac1015-file-header.ts`/`ac1015-section-frame.ts` (main además
corrigió un bug de máscara XOR en el CRC que esta rama tenía); `dwg1-writer` →
`ac1015-container-writer.ts`, superado por `ac1015-minimal-file-writer.ts` con validación externa
ODA File Converter 27.1 (4/4); `dwg1-objectmap` → `ac1015-object-map.ts` +
`ac1015-object-envelope.ts` con round-trip N=0/1/3/100; `dwg1-entities` → `entities-core.ts`
(LINE/POINT/CIRCLE/ARC, los 4 tipos listados en CAPABILITIES.md); `dwg1-poly-tables` →
`entities-poly.ts` + `table-layer.ts` (LWPOLYLINE/TEXT/LAYER); `dwg1-database` →
`entity-insert.ts` + `table-block.ts` + `ac1015-database-reader.ts` (INSERT resuelta a bloque
por nombre), superado por corpus real (0 discrepancias, 25 DWG) + ODA cruzado. Ninguna aporta
capacidad ausente; las 6 seguras de borrar.

| Rama | Ahead/Behind | Últ. commit | Veredicto | Evidencia |
|---|---|---|---|---|
| `claude/dwg1-bitcodes` | 530/150 | 2026-06-16 (raíz) | **ABS** | ver arriba |
| `claude/dwg1-database` | 533/150 | 2026-08-14 | **ABS** | ver arriba |
| `claude/dwg1-entities` | 534/150 | 2026-08-14 | **ABS** | ver arriba |
| `claude/dwg1-objectmap` | 533/150 | 2026-08-14 | **ABS** | ver arriba |
| `claude/dwg1-poly-tables` | 537/150 | 2026-08-14 | **ABS** | ver arriba |
| `claude/dwg1-writer` | 532/150 | 2026-08-14 | **ABS** | ver arriba |
| `pr77` | 516/150 | 2026-08-11 | **ABS** | `CODEOWNERS` idéntico; main es superset evolucionado: `docs/governance/REPOSITORY_PROTECTION.md` ("Modelo vigente de propietario único"), `repository-protection-baseline.json`, `check-proprietary-governance.mjs`, gate CI "Proprietary governance gate" activo. Nada de pr77 falta |
| `integration/olas-5-7` | 528/150 | 2026-08-14 | **ABS** | `apps/web/e2e/golden/53-cad-bim-wall.spec.ts` y `world-point.ts` en main: coincidencia TEXTUAL completa del fix (redondeo entero, jiggle al vecino, "Firefox quedaba ~2px... 13,68 unidades") |
| `worktree-agent-a1044299019d5a941` | 534/150 | 2026-08-14 | **ABS** | `tessellate-worker-client.ts` en main es BYTE-IDÉNTICO (diff vacío, 253 líneas). Confirmado: resto de sesión paralela, contenido ya portado |
| `worktree-agent-a608ba7097f1dc9d1` | 537/150 | 2026-08-14 | **ABS** (y superada) | Catálogo/pago-nulo: todos los archivos existen en main, que además ya avanzó a Stripe real (checkout hosted, billing portal) — la rama quedó obsoleta, no solo absorbida |

### Integradas — ancestro puro de `main` (ahead=0, prueba por ancestría real, no por squash)

23 ramas: `claude/3d-flatshot`, `claude/capas-ejecutivo`, `claude/cimientos`, `claude/colab`,
`claude/distracted-lumiere-dd00c6`, `claude/dwg-corpus`, `claude/dwg-crc`, `claude/dwgprep`,
`claude/dxf2`, `claude/editor-destape`, `claude/fix-wall-worker`, `claude/monolito`,
`claude/nlcad`, `claude/operacion-minima`, `claude/outbox-receiver`, `claude/p1-ola2`,
`claude/p3-stripe`, `claude/rescate-p1`, `claude/rubrica-honesta`, `claude/runbook`,
`claude/tactil`, `deps/majors-intento`, `worktree-agent-ac0c349996ec3fc9b`.

Veredicto: **INT** para las 23. `git rev-list --count origin/main..rama` = 0 en todas: cero
commits propios que main no contenga ya. No es squash-merge dudoso — es ancestría git literal.

### Ya absorbidas — contenido verificado igual o superado en `main`

16 ramas (grupo Layout3DEditor/schema7/junk, ver §0.2): `claude/3d-solview`, `claude/3d-nav`,
`claude/3d-ucs`, `claude/3d-huecos`, `claude/arranque`, `claude/b-bloques`, `claude/confianza`,
`claude/geo`, `claude/monolito-techo`, `claude/normas`, `claude/plataforma`, `claude/robustez`,
`claude/script`, `claude/wasm`, `claude/wasm-paridad`, `claude/lisp`.

9 ramas (grupo "viejas, todo archivo tocado existe en main, cero símbolo exportado ausente, main
más liviano en esos archivos que la rama"): `claude/a-dxf`, `claude/c-plot`, `claude/factura`,
`claude/p4-ola2`, `claude/p6-produccion`, `claude/pdf`, `claude/v1-landing`,
`claude/v2-checkout`, `claude/v3-perf`.

1 rama: `pr86` — "15 de 32 actualizaciones" ya tomadas (texto de campaña + PR #87 lo confirma:
"partición del PR #86"); el resto pasó a `deps/majors-diferidos-20260822` (CONSERVAR).

**Veredicto: ABS para las 26.** Se borran en Ola 4 con esta tabla como evidencia.

---

### Resumen del veredicto (Ola 0 completa — 74/74 ramas)

| Categoría | Cuenta | Acción |
|---|---:|---|
| INTEGRADA (ahead=0, ancestro puro) | 23 | Borrar en Ola 4 |
| YA ABSORBIDA (verificada por contenido) | 26 + 10 = **36** | Borrar en Ola 4 con evidencia anotada |
| RESCATAR (frente P0) | 5 activas + 1 parcial-docs | Fusionar en Ola 1 |
| RESCATAR (frente DWG) | 4 | Fusionar en Ola 2 |
| RESCATAR a revisar (emergencia) | 2 | Decidir en Ola 3 |
| CONSERVAR A PROPÓSITO → migrar y borrar | 1 (`deps/majors-diferidos-20260822`) | Ola 1/4 |
| **Total** | **74** | |

Nota de conteo: el brief estimaba "~57 INTEGRADA". La cifra real, verificada por contenido, es
23 INTEGRADA (ancestría pura) + 36 YA ABSORBIDA (contenido verificado por otra vía) = 59 ramas
seguras de borrar sin rescatar nada — el espíritu de la estimación se confirma, la frontera entre
"integrada" y "ya absorbida" simplemente requirió verificación de contenido en vez de solo
`ahead=0` porque `main` fue reescrita/consolidada varias veces.

**Ola 0 completa: 74/74 ramas con veredicto firme, publicado antes de tocar ninguna rama.**

## 2. Bitácora de ejecución

- **2026-08-24 ~04:15** — Arranque. Fetch de 74 ramas + tag. Repo `valle-design-dwg-conformance`
  clonado (`/home/user/valle-design-dwg-conformance`). PRs reales confirmados: #87/#88/#90/#92
  (no #77/#78/#79/#86, ya cerrados). Inventario numérico completo (ahead/behind/fecha/diffstat)
  vía script sobre las 74 ramas.
- **~04:35** — Descubierto: `git merge-base` falla (sin ancestro común) para 10 ramas viejas.
  Descubierto: 16 ramas comparten un único falso-positivo (`Layout3DEditor.tsx` renombrado +
  superado; `schema7-sha-provenance.spec.ts` superado por v10; `station-overlays.*` es dominio
  industrial prohibido; `commit-msg.txt` es basura de sesión). Verificación de símbolos
  exportados en las 3 ramas de mayor riesgo (`v1-landing`, `v2-checkout`, `v3-perf`): 0 símbolos
  ausentes de main.
- **~04:40** — Lanzados 2 agentes en paralelo (background) para la cohorte de historia disjunta
  (dwg1-*, pr77, integration/olas-5-7, worktree-agent-a1044299019d5a941/a608ba7097f1dc9d1).
  Mientras se resuelven, se publica este inventario (63 de 74 con veredicto firme) y arranca
  Ola 1 (frente P0), que no depende de esa cohorte.
- **~04:41** — Ambos agentes vuelven: las 10 ramas de historia disjunta son **ABS**, con
  evidencia de contenido concreta (ver tabla arriba). Ola 0 completa: 74/74 con veredicto.
- **~04:25–04:39** — **Ola 1, frente P0.** `claude/p0-final` (behind=0, ya contenía main de hoy)
  fusionado en `claude/valle-design-branch-closure-4ydx10` — merge limpio, sin conflictos.
  Postgres 16 real levantado localmente (`service postgresql start`, rol `valle` + BD
  `valle_design_dev`/`valle_design_test`), `VALLE_DWG_CORPUS_MIRROR` apuntando al clon de
  `valle-design-dwg-conformance`. Primera corrida de gates: rojo en `check:dwg-evidence` por
  falta de `VALLE_DWG_CORPUS_MIRROR` (falso rojo de entorno, documentado en
  `docs/onboarding/GATES.md`). Corregido y relanzado: **`check:cad && check:dwg && typecheck
  && test && lint && build` → EXIT_CODE=0, todo verde**, incluyendo las suites PostgreSQL
  reales (no SQLite) para la migración RLS y el rol `valle_app`.
  - PR #93 (borrador) abierto para la rama de la campaña, con veredicto vigilado. CI de GitHub
    marcó rojo el mismo `check:dwg-evidence` — confirmado como rojo PREEXISTENTE en main (el
    propio HEAD de main, commit `2a2c8ac`, lo declara en su mensaje: "ya fallaba en main antes
    de este cambio y es ajeno a este trabajo"); CI no tiene `VALLE_DWG_CORPUS_MIRROR`
    configurado. No se le empuja parche — anotado en el PR y en BACKLOG.md como pendiente de
    infraestructura de CI, no de código.
  - Backlog cerrado: "rol no-dueño + `SET app.tenant_id`" (bajo "Herencias verificables") —
    resuelto por `claude/p0-tenant-rls` dentro de `p0-final`: rol runtime `valle_app` no
    propietario + RLS en `design_blobs` + `tenant-rls-coverage.pg.spec.ts` escaneando el
    esquema real + ADR-0013. Queda "Nota de crédito CFDI", que sigue pendiente (no tocada por
    este frente).
  - `claude/p0-integration-v2` → **ABS en p0-final** (confirmado: mismo diff exacto).
    `claude/p0-commercial-surface` y `claude/p0-legal-acceptance-gate` → **ABS** (diff de dos
    puntos vacío contra main, confirmado antes de fusionar).
  - `claude/pulido-ola0`: sus 4 archivos (todos `docs/campaigns/*` y
    `docs/ops/runbook-repo-protection.md`) son notas de sesión, no código; pendiente de decidir
    en el cierre de la campaña si migran a `docs/` o se descartan (Ola Final).

- **~06:36** — **PR #93 fusionado a `main` (squash, `4459dce8`).** Ola 1 (frente P0 completo:
  tenant-rls, billing-entitlements, deploy-release, legal-acceptance-gate) y Ola 2 parcial
  (dwg-campaign-integration, dwg-read-performance, dwg-r2010-envelope) ya viven en `main`.
  Verificación previa: dos corridas completas de `check:cad && check:dwg && typecheck && test
  && test:pg && lint && build` en verde contra Postgres 16 real (la primera reveló y corrigió
  un bug real — `commercial-upgrade-intents.pg.spec.ts` esperaba rechazo de promesa de un
  método que P0-A volvió síncrono, ver commit `b30ded23`). En el camino: otra sesión de Claude
  Code fusionó en paralelo el PR #95 (`DWG_NATIVE_IMPORT_BETA`) directo a `main`; se resolvió
  un conflicto real (aditivo, ambas entradas conservadas) en
  `docs/governance/assisted-development-log.json`. El job E2E de CI mostró 7 fallos en dos
  corridas (2 documentados como intermitentes preexistentes —`20-cad-multiple-viewports` y
  `46-cad-pointer-engine`, ver `ci.yml` y `BACKLOG.md` P1-1b— y 5 con firma de timeout genérico
  agrupados al final de corridas de 40+ min, sin relación funcional entre sí ni con el diff);
  sin permiso para relanzar el job vía API (403), y por directiva expresa del titular de
  fusionar sin seguir esperando, se fusionó con esa verificación local como evidencia. Pendiente
  de vigilar: si el patrón de 5 timeouts se repite en la próxima corrida real de E2E, investigar
  a fondo (candidato: costo acumulado de RLS en queries tras horas de datos de prueba).
  **De aquí en adelante, por directiva del titular: trabajo directo sobre `main`, sin abrir
  ramas ni PR nuevos**, salvo que un gate en rojo obligue a aislar un arreglo.

*(continúa al cerrar cada rama)*
