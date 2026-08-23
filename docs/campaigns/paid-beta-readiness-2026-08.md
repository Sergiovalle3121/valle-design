# Campaña: Beta Pagada Verificable — Agosto 2026

Coordinador: sesión Claude Code (rol Principal Engineer / Release Captain), instrucciones del dueño Sergio Valle Zárate.
Fecha de arranque: 2026-08-23.

## 0. Contrato de la campaña

- Autorizado: inspeccionar, crear ramas/worktrees, escribir código/tests/migraciones/docs, preparar PRs draft.
- NO autorizado (requiere aprobación explícita de Sergio, no se ejecuta desde esta campaña): desplegar producción, fusionar a `main`, cambiar visibilidad de repos, comprar licencias/servicios, cobrar de verdad, aceptar condiciones jurídicas, activar Stripe live, promover DWG.
- Métrica de éxito: invariantes cerrados y verificados, no cantidad de commits/LOC.

## 0bis. Correcciones a la línea base tras verificar con GitHub (2026-08-23, tarde)

- **`origin/main` en GitHub YA está en `f5e36ca4`** (confirmado con `git fetch origin main`). La afirmación anterior de "`claude/pulido-ola0` 5 commits adelante de `main`, sin fusionar" se basaba en una rama local `main` desactualizada (nunca se había hecho `fetch`) — el `main` real de GitHub coincide con el SHA auditado. No cambia ningún hallazgo P0-A/B/C/D, sólo corrige el estado de la rama.
- **CI remoto en `main` lleva en rojo al menos ~10 pushes seguidos** (desde 2026-08-23T07:41Z), incluido el commit `f5e36ca4` mismo, en el job requerido "Contrato · Build · Test · Lint · Smoke", paso `check:cad` → `check:dwg-evidence`. Causa raíz confirmada: `docs/cad/evidence/dwg-decoder-matrix.json` fue regenerado y commiteado (commit `5995288`, previo a esta campaña) usando un mirror local del corpus DWG, y ahora declara `"Capacidades promovidas con corpus independiente admitido"` (7 bundles admitidos) — pero `.github/workflows/ci.yml` **nunca configura `VALLE_DWG_CORPUS_MIRROR` ni ningún token de corpus** (confirmado por grep), así que en CI el script recalcula "cero bundles, cero capacidades" y el `deepStrictEqual` contra el archivo commiteado falla. **No es uno de los 2 goldens rojos ya conocidos de la campaña de pulido — es un tercer rojo distinto, de reproducibilidad CI vs. local, fuera del alcance de esta ola P0** (toca gobernanza DWG/corpus, terreno de Frente G). Reportado a la otra sesión que corre la campaña DWG en paralelo; ninguna de las dos lo va a arreglar sin decisión explícita, porque cualquiera de las dos correcciones posibles (regenerar el archivo a "cero" o cablear un corpus real en CI) es una decisión de gobernanza DWG, no un bug de código. **Efecto sobre esta campaña:** la rama de integración P0 (`claude/p0-integration`) va a heredar este mismo rojo en CI aunque ninguno de los cuatro frentes lo causó — no lo confundas con una regresión de P0 si aparece en un PR real.

## 1. Línea base confirmada (Campaña 0, parcial — ver §4)

| Repo | Rama | SHA HEAD | Árbol |
|---|---|---|---|
| valle-design | claude/pulido-ola0 | `f5e36ca4afdf8413b56eb1eafbc2ab464fadc7dd` | limpio, coincide con el SHA auditado del prompt |
| valle-design-dwg-conformance | main | `3c456d7efb1017517ddf6996255a957262dacc90` | limpio, coincide con el SHA auditado del prompt |

`claude/pulido-ola0` está 5 commits adelante de `main` (0 detrás) — es la punta de trabajo, no fusionada.

Node v22.18.0, npm 10.9.3. `node_modules` ya presente en el worktree principal (no requirió `npm ci` para empezar).

Estado previo del árbol de trabajo (preexistente, preservado, no tocado por esta campaña):
- ~30 ramas `claude/*` antiguas, todas ya fusionadas en `claude/pulido-ola0` salvo `claude/dwg-entidades` (pin de corpus, 1 línea), `pr77`, `pr86`, `deps/majors-diferidos-20260822` (bloqueada explícitamente, "NO fusionar").
- ~20 worktrees `wt-*` activos en `D:\dev\` de campañas anteriores (3D, monolito, plataforma, robustez, táctil, wasm, etc.) — no tocados.
- Un worktree huérfano en `.claude/worktrees/distracted-lumiere-dd00c6` (HEAD desprendido en `873439d`) — preexistente, no tocado, posible sesión que no cerró limpio.
- No existía `docs/campaigns/` antes de esta campaña.

## 2. Hallazgos confirmados por lectura directa de código (no solo por el prompt maestro)

Verificados con evidencia (quotes de código) antes de tocar nada, ver también §3 gobernanza:

- **P0-A** (`apps/api/src/modules/commercial/controllers/commercial.controller.ts`, `confirmUpgradeIntent()`): un owner/admin de la organización CLIENTE puede confirmar su propio upgrade-intent y activar la suscripción sin evidencia de pago real. El propio comentario del código lo admite como "checkout asistido" para orgs sin proveedor de pago — es diseño intencional, no un bug accidental. Requiere decidir: ¿matar la ruta legacy, o darle un principal interno separado?
- **P0-B** (`apps/api/src/modules/commercial/adapters/postgres.adapters.ts:90-127`, `PostgresEntitlementService`): concede `design.cad` a cualquier suscripción `status='active'` sin comparar `currentPeriodEnd`. `trialing` sí se compara contra `trialEndsAt`; `active` no tiene equivalente.
- **P0-C** (`apps/api/src/migrations/20260820120000-TenantIntegrityRls.ts`): RLS cubre 8 tablas pero **no** `design_blobs` (bytes del plano, creada en `20260801120000-CreateDesignBlobs.ts`). Además `DEPLOYMENT.md` ya documenta —como conocido, no oculto— que la app corre como el rol dueño de la migración, por lo que ninguna política RLS existente aplica hoy en runtime; el rol no-dueño `valle_app` está diseñado pero nunca cableado.
- **P0-D** (`apps/web/Dockerfile`): la etapa runtime copia `.next/standalone` y `.next/static` pero no `apps/web/public` → 404 esperable para `wasm/valle-cad-kernel.wasm` y logos en producción.

Ninguna de las ~30 ramas antiguas contiene un fix sin fusionar para estos cuatro puntos — se confirmó con `git merge-base --is-ancestor` para cada una. Se arranca limpio desde HEAD, no se hizo cherry-pick de nada.

## 3. Gobernanza ya existente en el repo (no hay que reinventarla)

El repo ya tiene una gobernanza más rica que la resumida en el prompt maestro: ADR-0001 a ADR-0012 (incluye ADR-0009 "paquete de promoción DWG", **PROPUESTA, NO firmada por el dueño** — el estado real sigue siendo `productionAvailable:false`; y ADR-0012 "DWG dual-track" con la regla de las dos llaves). `AGENTS.md`, `SECURITY.md`, `DEPLOYMENT.md`, `RUNBOOK.md`, `docs/ops/SLA.md`, `packages/dwg-codec/{AGENTS.md,CLEAN_ROOM_POLICY.md,THREAT_MODEL.md}` cubren exactamente las reglas de tenant fail-closed, webhooks firmados, monolith budget, DWG clean-room, y operación. Se usó esa gobernanza como fuente de verdad para los prompts de cada frente, no se le pidió a los agentes que la reinventaran.

Repo DWG conformance: 57 DWG + 57 DXF, 100% sintéticos vía ODA File Converter 27.1 (no AutoCAD real, `CORPUS_POLICY.md` lo declara explícitamente), 7 bundles admitidos, sin ninguna rama sin fusionar.

## 4. Estado de gates — Campaña 0 completa (2026-08-23, SHA f5e36ca4, log completo en `D:\dev\.cache\tmp\baseline-campaign0.log`)

| Comando | Resultado | Duración | Notas |
|---|---|---|---|
| `npm run typecheck` | **PASS** | 103s | 6/6 paquetes, sin errores |
| `npm run lint` | **PASS** | 5s | warnings dentro del techo (`check:lint-budget` incluido en `check:cad`, también PASS) |
| `npm run build` | **PASS** | 4s | (cacheado por turbo) |
| `npm run test` | **FAIL** (exit 1) | 905s | ver desglose abajo — un solo rojo, no funcional |
| `npm run check:cad` (con `VALLE_DWG_CORPUS_MIRROR=D:\dev\valle-design-dwg-conformance`) | **PASS** | 783s | incluye rubric, monolith-budget, dwg-evidence, command-integrity |
| `npm run check:dwg` | **PASS** | 123s | dwg-codec suite completa + boundary + corpus check |
| `npm run sbom` | **PASS** | 18s | |
| `npm run check:licenses` | **PASS** | 3s | |
| `npm run check:deploy` | **PASS** | 2s | `scripts/deploy/validate-dockerfiles.mjs` — nota: este script YA pasaba pese al bug de P0-D, no lo detecta hoy (el Frente C debe ampliarlo, ver su tarea) |
| PostgreSQL real / `test:pg` | NOT RUN — pendiente de confirmar instancia aislada por frente | — | ver §5, cada frente usa su propia DB de test si la necesita |
| E2E navegador real | NOT RUN | — | pendiente de Ola de staging Railway (sección 7 del prompt maestro) |
| Docker build/smoke de imágenes finales | NOT RUN | — | Frente C lo intentará si Docker está disponible en el entorno |

### Desglose de `npm run test`

- **API** (`valle-design-api:test`): 78/107 suites, 664/811 tests — **PASS**, 147 tests skipped (mayormente por falta de Postgres/entorno externo, consistente con lo esperado). Coincide exacto con la cifra que traía el prompt maestro como referencia, **re-verificada en este SHA**, no asumida.
- **dwg-codec** (`@valle-design/dwg-codec:test`): `fail 0` en el runner nativo de node:test — **PASS** completo (unitarios + adversariales).
- **web** (`web:test`): **386 de 387 archivos de spec en verde** — coincide exacto con la cifra de referencia del prompt. El único rojo es `apps/web/src/lib/cad/benchmark/plan-budget.spec.ts`: un `AssertionError` de presupuesto de rendimiento — *"El perfil «plano real» de 20.000 entidades se salió de presupuesto en esta máquina: zoomFrameP95Ms: 41.388 ms supera 22 ms"* — no es el fallo de socket IPC de `tsx` que anticipaba el prompt maestro (ese no se reprodujo), es un assert de rendimiento dependiente del hardware de esta máquina. Ya estaba anotado en memoria de sesiones previas como métrica ruidosa que requiere control sobre `main` antes de culpar a una rama — se trata como **ROJO PREEXISTENTE, no funcional, no atribuible a esta campaña**. Ningún frente P0 debe tocar `CAD_PLAN_BUDGETS` ni el benchmark — eso es alcance de CAD-5 (Ola 2), no de esta ola.

**Conclusión de Campaña 0:** línea base reproducible confirmada, con un solo rojo preexistente ya explicado y fuera de alcance de P0. Ningún número se declaró vigente sin volver a correrlo en este SHA exacto.

## 5. Matriz de ownership — Ola P0 (en curso)

| Frente | Worktree | Rama | Ownership | SHA base | Estado |
|---|---|---|---|---|---|
| Coordinador | `D:\dev\valle-design` | `claude/pulido-ola0` | bitácora, runbooks, integración, archivos transversales | f5e36ca | activo |
| A — Billing y Entitlements | `D:\dev\wt-p0-billing` | `claude/p0-billing-entitlements` | `apps/api/src/modules/commercial/**` | f5e36ca+3 commits | **PARTIAL** — P0-A/B cerrados y verificados sin bypass; rompe 24 tests ajenos (fixture compartida), ver §6. Pendiente: fix de fixture antes de integrar. |
| B — Tenant/RLS/Storage | `D:\dev\wt-p0-rls` | `claude/p0-tenant-rls` | migraciones RLS, repos/adapters tenant, ADR nuevo | f5e36ca+4 commits | **PARTIAL** — brecha de `design_blobs` cerrada y verificada; riesgo real de fondo (app corre como dueño) sigue abierto por diseño explícito, documentado en ADR-0013. Sin bloqueos para integrar. |
| C — Contenedores/Deploy | `D:\dev\wt-p0-deploy` | `claude/p0-deploy-release` | Dockerfiles, `scripts/deploy/**` | f5e36ca+3 commits | **PARTIAL** — P0-D cerrado y verificado en vivo; chequeo nuevo de `NEXT_PUBLIC_API_URL` en el smoke está roto (falso negativo), ver §6. Pendiente: fix del chequeo. |
| D — Config comercial / fronteras públicas | `D:\dev\wt-p0-commercial` | `claude/p0-commercial-surface` | validación config producción, plantillas legales, checklist | f5e36ca+4 commits | **FAIL** — validador correcto pero no conectado al pipeline real; P0-F sigue explotable end-to-end. Pendiente: wiring Dockerfile+release.yml (toma coordinador, cruza con Frente C). |
| H — Red team / verificador | (por frente, mismo worktree del frente, solo lectura+tests) | — | revisión adversarial independiente de A–D | — | completado, 4/4 veredictos entregados |

Workflow `wf_67c109b8-263` completo: 8/8 agentes, 0 errores, 1.46M tokens, 840 tool calls, ~54 min. Ningún frente encontró bypass de la lógica de seguridad central que se le encargó — los rojos son de integración/wiring (ver §6), no reaperturas de las vulnerabilidades P0-A/B/C, excepto D donde el wiring faltante ES la vulnerabilidad.

**Ronda de cierre completada** (workflow `wf_a6cee6ca-353`, 4/4 agentes, 0 errores):
- Frente A: fixture compartida arreglada (commit `3d4fe42`) — suite completa de `apps/api` pasó de 24 tests rotos a 0, confirmado por revisor independiente reconstruyendo la corrida (`675/823 passed, 148 skipped, 0 failed`). **A queda PASS, 4 commits, sin bloqueos.**
- Frente C: chequeo de `NEXT_PUBLIC_API_URL` reescrito para escanear todos los chunks de `.next/static` en vez de depender de qué referencia la landing (commit `e1fcbff`) — verificado por el revisor reconstruyendo dos servidores reales desde cero (con y sin la variable), mismos resultados que el autor. **C queda PASS, 4 commits, sin bloqueos.**
- Frente D sigue **FAIL**: el wiring Dockerfile/release.yml no se ha hecho todavía — lo toma el coordinador ahora, después de integrar los cuatro frentes (necesita ver el Dockerfile ya corregido de C y el script de D juntos).

**Próximo paso:** merge de A, B, C, D a `claude/p0-integration` (worktree `D:\dev\wt-p0-integration`), luego wiring de D sobre esa rama, luego gates completos sobre árbol quieto.

## 6. Rojos

**Preexistentes (Campaña 0, no atribuibles a esta ola):**
- `apps/web/src/lib/cad/benchmark/plan-budget.spec.ts` — perf budget dependiente de máquina (zoomFrameP95Ms 41.39ms > 22ms). Fuera de alcance P0, ver §4.

**Nuevos (introducidos por los frentes de esta ola, cada uno con verificación adversarial independiente real — workflow `wf_67c109b8-263`, journal completo en `subagents/workflows/wf_67c109b8-263/journal.jsonl`):**

- **Frente A rompe 24 tests ajenos.** El fix de P0-B (exigir `currentPeriodEnd` vigente) hace que `apps/api/src/common/testing/first-party-cad-auth.ts` (fixture compartida usada por 5 suites de CAD) y `organizations.integration.spec.ts` fallen, porque sembraban `status:'active'` sin `currentPeriodEnd`. Confirmado por el propio autor Y por el verificador ejecutando la suite completa (`npx jest` en apps/api: 24/24 fallan con el fix, 0/0 sin él). Diagnóstico exacto disponible; requiere fix en la fixture compartida antes de integrar A solo.
- **Frente C: chequeo roto en el smoke nuevo.** El sub-chequeo de `NEXT_PUBLIC_API_URL` embebida en `production-startup-smoke.mjs` sólo mira los `<script src>` que sirve `/` (la landing), pero esa variable sólo la usan rutas de dashboard/CAD/comercial — el chequeo falla SIEMPRE, incluso contra un servidor correctamente construido. Falso negativo permanente, no reabre P0-D (los chequeos de assets WASM/SVG sí funcionan) pero bloquearía cualquier corrida real de `smoke:deploy`.
- **Frente D: el fix no está conectado al pipeline real (hallazgo original sigue abierto).** `apps/web/Dockerfile` y `.github/workflows/release.yml` sólo reenvían `NEXT_PUBLIC_API_URL` al build (y `release.yml` cae a `https://api.example.com` si no hay valor — el mismo tipo de placeholder que P0-F prohíbe). Ninguna `NEXT_PUBLIC_BRAND_*` llega nunca al build, y nada invoca `check:production-config` en el Dockerfile ni en `release.yml`. Un `git tag v1.2.3 && git push --tags` hoy mismo publicaría una imagen con marca/contacto placeholder sin bloqueo alguno — el hallazgo P0-F sigue explotable end-to-end pese al validador nuevo.

Ningún frente encontró un bypass de la lógica de seguridad central que se le encargó (A: ni P0-A ni P0-B tienen bypass conocido; B: el mecanismo RLS+valle_app en sí resistió todos los intentos del revisor). Los tres rojos de arriba son de integración/wiring, no reaperturas de las vulnerabilidades originales — excepto D, donde el wiring faltante ES la vulnerabilidad original.

## 7. Decisiones para Sergio (acumulando, ver también `docs/campaigns/decisiones-pendientes-sergio.md`)

- [ ] P0-A: ¿el "checkout asistido" (owner interno confirma pago externo) se conserva con un principal interno nuevo, o se retira el endpoint hasta tener Stripe real? Costo/riesgo: retirarlo bloquea cualquier venta asistida hoy; conservarlo mal diseñado reabre el hueco.
- [ ] P0-C: activar el rol runtime `valle_app` no-dueño es el fix correcto pero de mayor riesgo operativo de la ola — requiere revisión humana antes de aplicarse a cualquier entorno con datos reales.
- [ ] Repos públicos → privados (P0-G): ver runbook en `docs/ops/runbook-repo-protection.md`. No ejecutado por esta campaña, solo preparado.

## 8. Próxima integración

- Pendiente: resultados del workflow `wf_67c109b8-263` (implementación + verificación adversarial de A–D).
- Pendiente: resultado completo de Campaña 0 (`baseline-campaign0.log`).
- Después: coordinador revisa diffs de los 4 frentes, decide orden de integración a una rama de campaña, corre gates sobre árbol quieto, prepara PR drafts (sin fusionar a main).
