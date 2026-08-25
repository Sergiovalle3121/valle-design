# Concurrencia de review: cierra P1-7 del backlog / `review.concurrency` de la rúbrica (25 de agosto de 2026)

Continuación directa de la campaña post-3D-M1, por la misma directiva del
titular ("dale con la siguiente fase, aún falta mucho para construir para
competir contra AutoCAD"). Mismo entorno de sesión remota (rama dedicada +
PR en vez de push directo a `main`).

## Elección de esta fase

`node scripts/cad/rubric.mjs --priorities` señala **BEDIT en sitio**
(`blocks.bedit`) como el punto más barato de toda la rúbrica (1pt/4 días).
Investigado antes de tocar código: **ya tiene fase 1 fusionada hoy mismo**
(PR #103, `block-edit-session.ts`, documento de sesión aislado + guardado),
por OTRA sesión con autorización explícita y ya en fases (2 y 3 declaradas
"todavía no iniciadas" por esa misma sesión). Construir una versión propia
de esas fases habría sido exactamente el tipo de trabajo descoordinado y de
laboratorio que el titular pidió evitar — se deja intacto, sin tocar un solo
archivo de esa área.

Siguiente prioridad real de `--priorities` sin riesgo de colisión:
`review.concurrency` (2pt/8 días, el segundo criterio de mayor valor de toda
la rúbrica), que además es el mismo defecto que `docs/execution/BACKLOG.md`
ya documentaba como **P1-7**: `evidence:review-concurrency` mide ~50 4xx
inesperados por corrida bajo 10 clientes concurrentes, con el diagnóstico
explícitamente pendiente ("identificar la ruta... no investigado todavía").
Subsistema de API/backend, sin relación alguna con CAD/bloques — cero riesgo
de solapar con la sesión de BEDIT.

## El diagnóstico, antes de tocar código

`docs/cad/evidence/review-concurrency.json` no clasificaba los 4xx por
código/endpoint — el primer paso real, no adivinar. Leyendo el artefacto
directamente (`concurrentLoad.perRole`, campo por campo): los ~50 errores
por corrida son **exactamente** `429` en `link.comment` — cero en cualquier
otro rol u operación.

`apps/api/src/modules/cad/cad-review-link.controller.ts` confirma la causa:
`createComment` aplica `rateLimits.enforce('cad.review.comment',
[access.sessionId], API_RATE_LIMITS.reviewCommentsPerSession)` —
**`reviewCommentsPerSession: 30`, ventana fija de 60s, keyed SÓLO por
`sessionId`**. El propio comentario del código lo explica: "la superficie
anónima-con-token es la más expuesta: el techo por SESIÓN acota lo que un
token filtrado puede inundar" — un control anti-abuso deliberado, no un bug.
`ApiRateLimitService`'s propio doc además declara la filosofía: "los techos
son GENEROSOS a propósito: no miden uso legítimo... un dibujante guardando
frenéticamente no debe conocer este servicio."

La contradicción real: el probe de concurrencia (`review-concurrency.main.ts`)
lanza 2 `linkWorker` en bucle apretado (sin pausa) durante 8 segundos —
una tormenta sintética que agota el presupuesto de 30/60s legítimamente.
Y ni el probe ni, más importante, **el cliente real del navegador**
reintentaban nada: `use-cad-comments.ts` (el hook compartido por el autor y
por el invitado del review link) hacía UN solo intento y mostraba
"No pudimos guardar el comentario" ante cualquier error, incluido un 429 que
el propio diseño del rate limiter espera que un cliente correcto absorba.

**Decisión de diseño, y por qué NO se tocó el valor del techo:** subir
`reviewCommentsPerSession` habría sido tratar el síntoma. El propio código
ya declara que el techo es deliberadamente generoso y no debe afectar uso
legítimo — la respuesta correcta a un 429 con `retryAfterSeconds` es que el
cliente reintente, no que el servidor deje de proteger la superficie más
expuesta de la API. Esto también evita reabrir una decisión de seguridad
(VD-RL-001) sin la evidencia que la justificaría cambiar.

## El arreglo, por capas

1. **Contrato** (`packages/contracts/specs/design-api.v1.yaml`): nuevo
   schema `RateLimitedError` (`allOf` sobre `ApiError`, `code: rate_limited`
   const, `retryAfterSeconds` entero ≥1 requerido) — aditivo, sin bump de
   versión, mismo patrón que `EntitlementRequiredError`/
   `CadDocumentVersionConflictError` ya establecidos. `rate_limited` añadido
   al catálogo documentado de `code`. SDK regenerado
   (`npm run generate --workspace=@valle/design-sdk`); `check:cad-contract`
   verde.
2. **SDK** (`packages/design-sdk/src/client.ts`): `DesignApiError.isRateLimited()`,
   mismo patrón que `isVersionConflict()` (type guard sobre `this.code`).
3. **Frontend** (`apps/web/src/components/cad/collab/use-cad-comments.ts`,
   compartido por el estudio del autor y la página del invitado — "los dos
   lados se comportan igual" es la razón de ser de este archivo):
   `createWithRateLimitRetry` reintenta UNA vez pasado `retryAfterSeconds`,
   con un aviso visible ("Mucha actividad en esta sesión ahora mismo —
   reintentando en Ns…") en vez de un fallo opaco. El borrador del
   comentario no se pierde durante la espera: `ReviewLinkClient.tsx` sólo
   limpia el campo si `create()` devuelve `true`, así que esto salió gratis
   de cómo ya estaba escrito el componente, sin tocarlo. Exportada como
   función pura (sin React) para probarla sin montar el hook: 10/10
   aserciones nuevas (`use-cad-comments.spec.ts`) cubren reintento exitoso,
   un segundo 429 que no reintenta de nuevo (sin bucle), un error ajeno que
   no dispara reintento, y el camino feliz sin aviso.
4. **Load-probe** (`apps/api/src/load-probe/review-concurrency.main.ts`):
   `timedWithRateLimitRetry` — mismo criterio que el frontend, pero acotado
   a 5 reintentos (es un probe de fondo, no una interfaz interactiva) y
   registra sólo el desenlace FINAL de cada comentario, no cada intento
   HTTP intermedio: a la integridad de la corrida le importa si el
   comentario se creó, no cuántas peticiones hicieron falta. Contador
   `rateLimitRetries` nuevo, propagado por el orquestador
   (`scripts/cad/review-concurrency-evidence.mjs`, `rateLimitRetriesPerRun`)
   para que el artefacto pruebe que el techo se EJERCIÓ de verdad bajo la
   tormenta, no que se esquivó silenciosamente.

## Verificación

- `npm run typecheck` en el monorepo completo (contracts, dwg-codec, design-sdk,
  api, web) — limpio.
- `check:cad-contract` — verde tras regenerar el SDK.
- `use-cad-comments.spec.ts` — 10/10.
- `node scripts/run-specs.mjs` (apps/web) — 410/410 verdes (incluye trabajo
  fusionado de otras sesiones vía el merge de `main`, no sólo lo de esta fase).
- `npm test` (apps/api) — 688/688 verdes.
- **`npm run evidence:review-concurrency` contra PostgreSQL 16 real, 3
  corridas, DOS pasadas** (la segunda sólo para propagar
  `rateLimitRetriesPerRun` al artefacto — ningún cambio de lógica entre
  ambas): **`verdict.passed: true` en las dos**.
  `unexpectedClientErrorsPerRun: [0,0,0]`, `serverErrorsPerRun: [0,0,0]`,
  `rateLimitRetriesPerRun: [2,2,2]` — el techo se disparó y el cliente lo
  absorbió, en las tres corridas, de forma estable.
- `node scripts/cad/rubric.mjs` — confirmado de forma independiente (el
  script lee `verdict/passed` del artefacto, no confía en esta bitácora):
  `review.concurrency` pasa de `✗ verdict/passed = false` a
  `✅ 2 pt · verdict/passed = true`. Rúbrica total: **189/220 → 190/220
  (85.9% → 86.4%)**; alcance de hoy 154/175 → 155/175 (88% → 88.6%).

## Efecto colateral encontrado y corregido: gobernanza duplicada

Al fusionar `origin/main` (que había avanzado con trabajo de otra sesión,
PR #106/#107, ninguno relacionado con esto) apareció un conflicto mecánico
en `docs/governance/assisted-development-log.json` (dos sesiones apendiendo
al mismo array — mismo patrón ya visto y resuelto en la fase anterior). Al
resolverlo por unión por `id` se encontró que `origin/main` YA traía una
entrada duplicada por accidente (`DWG-GAP-MATRIX-STALE-PROSE-2026-08-25`,
dos copias byte-idénticas, preexistente a este merge, ajena a esta fase). Se
corrigió como parte natural de la misma resolución en vez de perpetuarlo.

## Qué queda abierto, declarado y no escondido

- El valor de `reviewCommentsPerSession` (30/60s) no se tocó — sigue siendo
  una decisión de seguridad (VD-RL-001) fuera del alcance de esta fase.
- BEDIT en sitio (fases 2/3) sigue perteneciendo a la sesión que ya lo tiene
  en curso; no se tocó ni se investigó más allá de confirmar que existe.
- Los otros criterios `TODAVÍA NO` de la rúbrica (SLO de navegador a 100k,
  kernel WASM huérfano, corpus DXF de terceros, etc.) siguen exactamente
  donde estaban — esta fase cerró un único criterio, con evidencia real.
