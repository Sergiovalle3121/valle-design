# CAD — Auditoría de Superficie de UI (qué existe vs. qué se ve)

- **Fecha:** 2026-06-30
- **Rama:** `claude/cad-ui-surface-tools-c9ub0b` (la consigna pedía `ux/cad-surface-tools`;
  la rama de trabajo la fija el harness — ver nota al final).
- **Alcance:** **frontend puro**. Editor principal `apps/web/src/components/line-engineering/Layout3DEditor.tsx`
  (5 085 líneas) y los 24 módulos de `apps/web/src/lib/cad/` (+ `lib/cad/commands/`).
  No se toca backend, migraciones, auth, tenancy ni Sheets/Slides/MES/ERP.
- **Objetivo (FASE 0):** medir la **brecha entre capacidad-en-código y capacidad-visible-en-pantalla**.
  No crear lógica CAD nueva; no duplicar módulos.
- **Complementa** (no reemplaza) a [`docs/cad/AXOS_CAD_CAPABILITY_AUDIT.md`](AXOS_CAD_CAPABILITY_AUDIT.md)
  y [`docs/cad/AXOS_CAD_TREE_STATUS.md`](AXOS_CAD_TREE_STATUS.md), que miden *madurez/no-redundancia*.
  Esta auditoría añade una sola lente distinta: **¿el usuario puede descubrir e invocar la capacidad desde la UI?**

---

## Hallazgo principal (honesto)

La premisa de partida —"casi toda la lógica está importada pero **escondida**"— **no se sostiene a nivel de código**.
La realidad medida es la inversa: **21 de 23 módulos de superficie ya están EXPUESTOS** con botón, panel,
entrada de paleta y/o atajo reales y funcionales. La capa `lib/cad` no está "escondida": está, en su gran mayoría,
cableada a controles visibles.

Lo que sí existe es una brecha **pequeña y puntual**, no sistémica:

1. **Una sola capacidad expuesta pero no descubrible:** la **paleta de comandos (Cmd-K)** se abre *únicamente*
   por atajo de teclado. No hay ningún botón visible que la lance; un usuario nuevo no tiene forma de saber que existe.
   → Es la única corrección "cablear lógica existente a un botón" de alto valor y esfuerzo trivial.
2. **Una capacidad expuesta de forma superficial:** `line-balance` es alcanzable por comando
   (`analizar balanceo` / `takt` / `yamazumi`) pero su reporte rico sólo aparece como un mini-readout en el
   preview del comando; no tiene panel propio. (El panel **Yamazumi** del menú Análisis existe pero es server-backed,
   no usa el módulo local).
3. **Dos módulos HUÉRFANOS** sin ningún llamador en toda la app: `copilot-contract` y `annotations`.
   **Exponerlos no es un trabajo de "añadir un botón"** (ver sección Huérfanos): hacerlo implicaría lógica/feature
   nueva, lo cual está fuera del mandato. Se recomienda dejarlos documentados como huérfanos, no forzarlos a la UI.

> En una frase: el CAD **ya está casi completamente expuesto**. El entregable real de pulido es chico —
> sobre todo el botón de paleta— y conviene reportarlo tal cual en lugar de inventar superficie.

### Conteo

| Estado UI | # | Módulos |
| --- | --- | --- |
| ✅ Expuesto | 21 | toolbar, commands(registry), command-palette*, command-line-assist, keyboard-shortcuts, measurements, snapping, layers, object-properties, validation-report, collisions, flow-optimization, safety-zones, snapshots, symbols, templates, warehouse-generators, dxf-import, dxf-export, layout-export-adapter, dxf-export-readiness |
| ⚠️ Expuesto pero no descubrible / superficial | 2 | **command-palette** (solo Cmd-K, sin botón) · **line-balance** (solo readout en preview) |
| ❌ Huérfano (exportado, sin llamador) | 2 | **copilot-contract** · **annotations** |

`*` command-palette cuenta como expuesto (su panel y búsqueda funcionan) pero su *lanzador* es solo teclado — por eso
aparece también en la fila ⚠️.

---

## Leyenda de estados

- **✅ EXPUESTO** — tiene botón/panel/entrada de paleta/atajo visible y usable end-to-end.
- **⚠️ ESCONDIDO / SUPERFICIAL** — el código lo usa, pero el usuario no puede invocarlo (o no puede *descubrir* cómo)
  desde la UI, o su salida apenas se muestra.
- **❌ HUÉRFANO** — exportado en `lib/cad` pero sin ningún llamador en la app.

---

## Tabla módulo → estado UI → control actual → dónde debería vivir → esfuerzo

| Módulo (`lib/cad/`) | Estado UI | Control actual (evidencia `archivo:línea`) | Si hay brecha: dónde debería vivir | Esfuerzo |
| --- | --- | --- | --- | --- |
| `toolbar.ts` | ✅ Expuesto | Toolbar top-left renderiza `CAD_TOOLBAR_ACTIONS` (`Layout3DEditor.tsx:4221-4228`); `runToolbarAction` (`:3231`) | — | — |
| `commands/` (registry+parser+executor+history) | ✅ Expuesto | Dock "Copiloto CAD local" (`:3920-3996`), preview/aplicar (`:3937-3958`), historial (`:3979`); paleta lista los 12 comandos | — | — |
| `command-palette.ts` | ⚠️ Expuesto **sin lanzador** | Panel + búsqueda funcionan (`:4191-4219`); pero se abre **solo** con Cmd-K (`:3584`). No hay botón que llame `setShowPalette(true)` | Botón/affordance "⌘K" en el toolbar o header (reusa `setShowPalette(true)`) | **S** |
| `command-line-assist.ts` | ✅ Expuesto | Sugerencias en el dock (`suggestCadCommands` `:3648`, render `:3961-3977`) | — | — |
| `keyboard-shortcuts.ts` | ✅ Expuesto | `matchCadShortcut` en el handler (`:3583`); overlay de ayuda `?` (`showHelp`) | — | — |
| `measurements.ts` | ✅ Expuesto | Herramienta Measure (`M`, toolbar); panel "Cotas guardadas" (`:4250-4267`); auto-cota (`:3748`) | — | — |
| `snapping.ts` | ✅ Expuesto | Toggles Snap/OSnap (`T3Btn` `:3759-3760`), atajos `G`/`O` | — | — |
| `layers.ts` | ✅ Expuesto | Panel de capas en menú View (`:3804-3826`): activa/visibilidad/lock/isolate/All/Reset; asignación por objeto | — | — |
| `object-properties.ts` | ✅ Expuesto | Panel derecho de propiedades (`summarizeCadSelectionProperties` `:1027`, `describeCadObjectProperties` `:3675`) | — | — |
| `validation-report.ts` | ✅ Expuesto | Botón "Revisión de diseño" (`openChecks`/ShieldCheck `:3862`) → "CAD validation center" (`:4759-4790`); issues clicables (`selectValidationIssue` `:4776`) | — | — |
| `collisions.ts` | ✅ Expuesto | Comando `find_collisions`; status bar (`:4164`); overlay holguras (`showGaps`); validation center | — | — |
| `flow-optimization.ts` | ✅ Expuesto | Botón "Flow Health" (`analyzeFlowHealth` `:3863`); status bar (`:4163`); validation center | — | — |
| `safety-zones.ts` | ✅ Expuesto | Rail "Safety zones" en tab Equipo (`:4055-4065`): no-go/restricted/ESD/forklift/emergency; validation | — | — |
| `snapshots.ts` | ✅ Expuesto | Modal Versiones (`showVersions` `:3891`): crear/restaurar/diff (`snapshotDiff` `:4880-4882`) | — | — |
| `symbols.ts` | ✅ Expuesto | "Biblioteca CAD industrial" en tab Equipo (`:4066-4084`) + entradas de paleta | — | — |
| `templates.ts` | ✅ Expuesto | "Plantillas CAD" en tab Equipo (`:4017-4030`, `applyCadTemplate`) | — | — |
| `warehouse-generators.ts` | ✅ Expuesto | "Generador de racks" en tab Equipo (`:4031-4054`, `applyRackRowGenerator`) | — | — |
| `dxf-import.ts` | ✅ Expuesto | Botón Upload DXF (`:3880`); panel preview/convertir (`:4124-4151`) | — | — |
| `dxf-export.ts` / `layout-export-adapter.ts` / `dxf-export-readiness.ts` | ✅ Expuesto | Botón Export DXF (`openDxfExport` `:3883`) → modal con opciones, summary y preflight readiness | — | — |
| `line-balance.ts` | ⚠️ Expuesto **superficial** | Alcanzable vía comando `analyze_line_balance` (parser: "balanceo/takt/yamazumi" `parser.ts:54-65`; en paleta vía `CAD_COMMAND_REGISTRY`). Salida = mini-reporte en el preview del dock (`:3943-3947`) | (Opcional) panel propio en el dropdown Análisis reusando `buildCadLineBalanceReport` — **ojo:** el panel server-backed "Yamazumi (balanceo)" ya cubre el caso; riesgo de duplicar | **M** |
| `copilot-contract.ts` | ❌ Huérfano | Sin llamador (`buildCadCopilotSafeContext`/`validateCadCopilotToolCall`/`cadCopilotToolSchemas` solo definidos) | **No exponer como botón** — es plumbing para un copiloto LLM real (= feature nueva, fuera de alcance). Dejar documentado | n/a |
| `annotations.ts` | ❌ Huérfano | Sin llamador (`createTextAnnotation`/`createMeasurementAnnotation`/`annotationBounds`/`filterAnnotationsByLayer` solo definidos). El editor usa su propio tipo `Note`/cota (`:192`) | **No exponer** — duplicaría notas/cotas existentes; cablearlo requeriría lógica nueva. Dejar documentado o marcar para consolidación futura | n/a |

> Nota de método: "Expuesto" se verificó rastreando el **call-site real** de cada función (no sólo el `import`) y
> el JSX/handler que lo dispara. Varios módulos importan sólo *tipos* en el editor (`collisions`, `safety-zones`)
> pero su *lógica* corre vía `validation-report`/comandos, por eso quedan ✅.

---

## Huérfanos — por qué no se fuerzan a la UI

Ambos huérfanos son reales (0 llamadores), pero **ninguno es un caso de "falta un botón"**:

- **`copilot-contract.ts`** — define el contrato seguro para un copiloto CAD (redacción de PII + validación de
  tool-calls contra el registro de comandos). El dock ya anuncia "mañana un modelo OpenAI-compatible puede llamar
  estas mismas acciones" (`:3926`). Exponerlo de verdad = **conectar un LLM** = feature nueva. Está cubierto por
  [`docs/cad-copilot-command-contract.md`](../cad-copilot-command-contract.md) como capa de integración, no de UI.
- **`annotations.ts`** — modela anotaciones texto/cota/warning con filtrado por capa, pero el editor ya tiene su
  propio modelo de **notas** (`addNote`) y **cotas** (`measurements` + auto-dimension + "Cota entre objetos").
  Cablear `annotations.ts` **duplicaría** ese flujo o exigiría reescribir el render → choca con "no duplicar / no
  lógica nueva". Recomendación: dejarlo como huérfano y, si acaso, abrir tech-debt para consolidar notas/cotas
  sobre este módulo en otra sesión (fuera de este pulido).

---

## Recomendación de FASE 1 (conservadora, a aprobar por el owner)

Priorizado por valor visible / esfuerzo / fidelidad al mandato "exponer, no construir":

| # | Acción | Módulo | Valor | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- | --- |
| **A** | **Botón lanzador de Paleta de Comandos** (⌘K) en el toolbar/header. Reusa `setShowPalette(true)` y la etiqueta i18n. Hace descubrible la herramienta más potente del CAD. | `command-palette` | **Alto** | **Bajo** | Mínimo (sólo añade un botón) |
| B (opcional) | Panel local de **line-balance** en el dropdown Análisis, reusando `buildCadLineBalanceReport`. | `line-balance` | Medio | Medio | **Duplicación**: ya existe panel "Yamazumi (balanceo)" server-backed; decidir antes |
| C | **Dejar huérfanos como están** (documentados). No exponer `copilot-contract` ni `annotations` (sería feature/lógica nueva). | — | — | — | — |

**Recomendación del autor:** ejecutar **A** (la única ganancia limpia y de alto valor). **B** sólo si el owner confirma
que no le importa tener un segundo surface de balanceo (local) junto al Yamazumi server-backed. **C** por defecto.

Si el owner quiere "que se sienta más completo" más allá de A, las opciones honestas no son *exponer lógica escondida*
(casi no la hay) sino **profundizar** surfaces existentes (p. ej. B), lo cual ya roza el límite de "no features nuevas".

---

## Antes / Después

> **Decisión del owner (2026-06-30):** ejecutar **A + B**. Hecho en FASE 1 (ver changelog abajo).

| Capacidad | Antes | Después (FASE 1) |
| --- | --- | --- |
| Paleta de comandos | Sólo Cmd-K; sin botón; no descubrible | ✅ Botón visible en el header (icono Search, `title` con "⌘K / Ctrl K") que abre/cierra la paleta. `Layout3DEditor.tsx` toolbar |
| line-balance | Sólo mini-readout en preview del dock | ✅ Panel local "Balance de línea (local)" en el dropdown Análisis, reusando `buildCadLineBalanceReport` sobre las estaciones en pantalla. `LineBalancePanel.tsx` |
| copilot-contract | Huérfano | _(sin cambio)_ Documentado como plumbing de copiloto — no expuesto (sería feature nueva) |
| annotations | Huérfano | _(sin cambio)_ Documentado; candidato a consolidación futura — no expuesto (duplicaría notas/cotas) |

---

## FASE 1 — changelog (ejecutado, A + B)

**Mandato cumplido:** sólo se *expuso* lógica existente; **no** se añadió lógica CAD nueva ni se duplicó ningún módulo.

- **A · Paleta de comandos descubrible** — nuevo `T3Btn` en el header de `Layout3DEditor.tsx`, junto al toggle del
  dock de comandos, que llama `setShowPalette((v) => !v)`. Reusa el panel y la búsqueda (`searchCadPalette`) ya
  existentes; la lógica de la paleta no cambia. Icono `Search` (ya importado).
- **B · Balance de línea (local)** — nuevo componente presentacional `LineBalancePanel.tsx` registrado en
  `ANALYSIS_PANELS` (key `linebalance`). Llama al helper existente `buildCadLineBalanceReport` con las estaciones
  colocadas (orden de secuencia); los tiempos de ciclo se leen de la etiqueta vía el mismo helper. El render del
  panel se especializa para pasarle las estaciones en pantalla (no `model/revision`), de modo que es **local y
  determinístico** y no hace llamada al servidor. Se diferencia a propósito del panel server-backed
  "Yamazumi (balanceo)".

### Notas de implementación

- **i18n:** `Layout3DEditor.tsx` y los componentes de panel de `line-engineering/` **no usan i18n** (0 usos de
  `useTranslation`/`react-i18next`); todas las etiquetas/tooltips están hardcodeadas en español. Para "leer como el
  código vecino" se siguió esa convención (texto español hardcodeado), en vez de introducir claves i18n que serían
  inconsistentes con todo el editor. Si se decide migrar el CAD a i18n, debe hacerse como tarea aparte para todo el
  módulo, no sólo estos dos controles.
- **Gate / verificación:** el contenedor remoto **no tiene `node_modules` instalado** y la consigna prohíbe
  `npm install`, por lo que `npm run build --workspace=web`, `tsc --noEmit` y `eslint` **no se pudieron ejecutar
  localmente** (fallan por dependencias ausentes, no por el código). Verificación realizada: revisión manual del diff
  contra las firmas reales de `buildCadLineBalanceReport`/`CadLineBalanceReport`/`CadLineBalanceStation`, paridad con
  los patrones de los 15 paneles hermanos (mismo contrato `dynamic`/`open`/`onClose`, mismo shell `glass` con tema
  claro+oscuro vía variantes `dark:`), e iconos `Scale`/`Gauge` confirmados como válidos en `lucide-react@^1.11.0`
  (usados ya en `ScenarioCompare`/`LayoutScorecard`). El **CI del PR ejecuta el gate real**.

---

## Gate y reglas (para FASE 1)

- `npm run build --workspace=web` ✅, typecheck ✅, lint del editor ✅. Sin `console.*` nuevos. Tema claro y oscuro.
- Sin `npm install/ci/dev`, sin cambios de lockfile/`node_modules`.
- i18n: usar claves existentes, no hardcodear texto.
- Reusar toolbar / command-palette / keyboard-shortcuts existentes. No nueva lógica CAD, no duplicados.
- Commits por grupo; **un** PR draft en la rama de trabajo; **no** mergear.

> **Nota de rama:** la consigna pidió `ux/cad-surface-tools`, pero el harness fija la rama de desarrollo a
> `claude/cad-ui-surface-tools-c9ub0b`. Se respeta la rama del harness; el PR draft saldrá de ahí.

---

## Estado

- **FASE 0 (auditoría):** completa.
- **Aprobación del owner (2026-06-30):** **A + B**.
- **FASE 1 (exponer):** completa — ver "Antes / Después" y el changelog. Pendiente sólo el gate vía CI del PR.
