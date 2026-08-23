# Campaña: Beta Pagada Verificable — Agosto 2026

Coordinador: sesión Claude Code (rol Principal Engineer / Release Captain), instrucciones del dueño Sergio Valle Zárate.
Fecha de arranque: 2026-08-23.

## 0. Contrato de la campaña

- Autorizado: inspeccionar, crear ramas/worktrees, escribir código/tests/migraciones/docs, preparar PRs draft.
- NO autorizado (requiere aprobación explícita de Sergio, no se ejecuta desde esta campaña): desplegar producción, fusionar a `main`, cambiar visibilidad de repos, comprar licencias/servicios, cobrar de verdad, aceptar condiciones jurídicas, activar Stripe live, promover DWG.
- Métrica de éxito: invariantes cerrados y verificados, no cantidad de commits/LOC.

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

## 4. Estado de gates (actualizar cada vez que cambie)

| Comando | Resultado | Evidencia |
|---|---|---|
| `npm run typecheck` | EN PROGRESO (background) | `D:\dev\.cache\tmp\baseline-campaign0.log` |
| `npm run lint` | EN PROGRESO (background) | idem |
| `npm run build` | EN PROGRESO (background) | idem |
| `npm run test` | EN PROGRESO (background) | idem |
| `npm run check:cad` (con `VALLE_DWG_CORPUS_MIRROR`) | EN PROGRESO (background) | idem |
| `npm run check:dwg` | EN PROGRESO (background) | idem |
| `npm run sbom` / `check:licenses` | EN PROGRESO (background) | idem |
| `npm run check:deploy` | EN PROGRESO (background) | idem |
| PostgreSQL real / `test:pg` | NOT RUN — pendiente de confirmar disponibilidad de instancia aislada | — |
| E2E navegador real | NOT RUN | — |
| Docker build/smoke de imágenes finales | NOT RUN | — |

No se declara ningún número previo (85/87 goldens, 664 tests, etc.) como vigente sin volver a correrlo en este SHA — se está corriendo ahora, ver log referenciado.

## 5. Matriz de ownership — Ola P0 (en curso)

| Frente | Worktree | Rama | Ownership | SHA base | Estado |
|---|---|---|---|---|---|
| Coordinador | `D:\dev\valle-design` | `claude/pulido-ola0` | bitácora, runbooks, integración, archivos transversales | f5e36ca | activo |
| A — Billing y Entitlements | `D:\dev\wt-p0-billing` | `claude/p0-billing-entitlements` | `apps/api/src/modules/commercial/**` | f5e36ca | agente lanzado (workflow `wf_67c109b8-263`) |
| B — Tenant/RLS/Storage | `D:\dev\wt-p0-rls` | `claude/p0-tenant-rls` | migraciones RLS, repos/adapters tenant, ADR nuevo | f5e36ca | agente lanzado |
| C — Contenedores/Deploy | `D:\dev\wt-p0-deploy` | `claude/p0-deploy-release` | Dockerfiles, `scripts/deploy/**` | f5e36ca | agente lanzado |
| D — Config comercial / fronteras públicas | `D:\dev\wt-p0-commercial` | `claude/p0-commercial-surface` | validación config producción, plantillas legales, checklist | f5e36ca | agente lanzado |
| H — Red team / verificador | (por frente, mismo worktree del frente, solo lectura+tests) | — | revisión adversarial independiente de A–D | — | agente lanzado por frente, en el mismo workflow |

Sesiones activas: 5/8 (coordinador + 4 frentes; los 4 verificadores H corren en pipeline después de cada implementación, no simultáneos con el límite).

## 6. Rojos nuevos

(pendiente — se llena cuando el workflow y el baseline reporten)

## 7. Decisiones para Sergio (acumulando, ver también `docs/campaigns/decisiones-pendientes-sergio.md`)

- [ ] P0-A: ¿el "checkout asistido" (owner interno confirma pago externo) se conserva con un principal interno nuevo, o se retira el endpoint hasta tener Stripe real? Costo/riesgo: retirarlo bloquea cualquier venta asistida hoy; conservarlo mal diseñado reabre el hueco.
- [ ] P0-C: activar el rol runtime `valle_app` no-dueño es el fix correcto pero de mayor riesgo operativo de la ola — requiere revisión humana antes de aplicarse a cualquier entorno con datos reales.
- [ ] Repos públicos → privados (P0-G): ver runbook en `docs/ops/runbook-repo-protection.md`. No ejecutado por esta campaña, solo preparado.

## 8. Próxima integración

- Pendiente: resultados del workflow `wf_67c109b8-263` (implementación + verificación adversarial de A–D).
- Pendiente: resultado completo de Campaña 0 (`baseline-campaign0.log`).
- Después: coordinador revisa diffs de los 4 frentes, decide orden de integración a una rama de campaña, corre gates sobre árbol quieto, prepara PR drafts (sin fusionar a main).
