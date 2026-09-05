# 14 · Frontend: arquitectura, estado, monolitos

**Dimensión:** `apps/web` — arquitectura de componentes, gestión de estado, renders,
memoización, code splitting, Server vs Client Components, hidratación, manejo de
errores en la interfaz, formularios y atajos de teclado.
**Fecha de la auditoría:** 2026-09-05 · **Árbol medido:** `/home/user/valle-design`
**Auditor:** ingeniero senior externo, criterio de inversión.

> Todo lo que se afirma aquí se midió sobre el árbol. Cada hallazgo lleva
> fichero y línea. Donde digo «falta», fui a mirar si estaba; donde encontré
> que la propia documentación del repo dice que falta algo que **ya está**,
> también lo digo.

---

## 1. Veredicto en una frase

La arquitectura del frontend tiene una dirección correcta y unos gates que la
mayoría de los equipos no tienen — pero el producto entero sigue colgando de un
solo componente de 18 453 líneas con **131 `useState` y 129 `useRef` en una sola
función**, y dentro de ese componente hay una función muerta de 190 líneas que
deja al copiloto de lenguaje natural anunciando en un toast un panel que **no
existe en ninguna parte del árbol**.

**Nota contra AutoCAD completo en esta dimensión: 5,5 / 10.**

Por qué ese número y no otro:

- **+** El patrón de descomposición existe, funciona y está probado: 21 módulos
  con `useSyncExternalStore` fuera del monolito, presupuesto de líneas con
  trinquete, presupuesto de estado con trinquete, presupuesto de bundle por ruta,
  presupuesto de latencia de interacción, gate de axe, gate de teclado.
- **+** Server Components bien usados: 39 de 44 páginas del App Router son
  servidor; el estudio entra por `next/dynamic` con `ssr:false` y una carcasa
  que evita el salto de layout.
- **−** El monolito no baja al ritmo que su propio documento se comprometió:
  el registro de `DEUDA-MONOLITO.md` lleva **cinco días y nueve olas sin una
  sola fila nueva**, y sus referencias de línea ya apuntan a otro código.
- **−** El único gate que mide trabajo de React en el estudio corre sobre **400
  entidades** y sobre la ruta **`/legacy/studio`**. La clase de defecto que
  importa a 100 000 —trabajo O(n) por render— es invisible para él, y la hay:
  **62 ms de churn puro por render** medidos.
- **−** Hay una **falsa señal de éxito visible al usuario** en la paleta Ctrl+K,
  40 entradas afectadas, sin una sola prueba que cubra el fichero que la produce.

AutoCAD lleva cuarenta años de arquitectura de aplicación de escritorio: su
«render» no compite con React porque no tiene React. La comparación justa no es
«¿es más rápido el DOM que MFC?» sino «¿la arquitectura de este cliente permite
seguir añadiendo funcionalidad al ritmo de hoy dentro de tres años?». Hoy la
respuesta es «con un archivo menos, sí».

---

## 2. Qué miré, y con qué

| Fuente | Qué saqué |
| --- | --- |
| `docs/competitive/rubric.json` | Filas `recognition` (13/14), `performance` (11/12), `growth` (8/8), `integrity` (13/13) y sus campos `gap`. |
| `scripts/cad/monolith-budget.json` + `check-monolith-budget.mjs` | Techo real: 18 454 líneas / 131 `useState`. Gate corrido: **verde**. |
| `docs/execution/DEUDA-MONOLITO.md` | Meta declarada (<8 000 líneas), método por costuras, registro por campaña. |
| `npx eslint Layout3DEditor.tsx -f json` | 148 `react-hooks/refs`, 11 `no-unused-vars`, 4 `set-state-in-effect`, 3 `immutability`, 1 `purity`. |
| `scripts/lint-budget.json` | Presupuesto que permite 164 `refs` y 14 `no-unused-vars` en `apps/web`. |
| `src/lib/cad/benchmark/frontend-load-baseline.json` | Estudio: 3 354,6 KB de JS distinto. Landing: 826,2 KB. |
| `src/lib/cad/benchmark/interaction-latency-baseline.json` | p95 224 ms en suite, techo 320 ms — **sobre 400 entidades**. |
| `docs/cad/evidence/browser-slo-100k.json` | 20 perfiles. `architecture@10k/next`: 1 907 ms · 59,5 fps. `architecture@100k/next`: 25 340 ms · 8,57 fps. |
| `src/app/(sw)/offline-capability-matrix.ts` | 7 flujos sin red · 4 degradan · **23 requieren backend**. |
| Micro-benchmark propio (Node 22.22.2, este contenedor) | El coste por render de las dos derivaciones no memoizadas del monolito. |

**Cifras estructurales medidas hoy:**

```
Layout3DEditor.tsx      18 453 líneas · 721 487 bytes · 178 imports
  useState  131          useRef 129          useCallback 128
  useMemo     7          useEffect 55        useReducer 0
  Cuerpo de hooks:   1140 → 13 735   (12 595 líneas)
  Derivación:       13 736 → 14 658   (   923 líneas)
  JSX (createPortal): 14 659 → 18 453 ( 3 794 líneas)

apps/web/src            1 714 ficheros TS/TSX · 437 846 líneas
  "use client"          134 de 188 .tsx
  React.memo             13 en todo el árbol
  useSyncExternalStore   21 módulos (el patrón bueno)
  <button> a mano       319 (114 en el monolito) · 231 sin type=
  clases de paleta cruda 438 (100 en el monolito)
```

**258 ranuras de estado mutable en una sola función.** Ése es el número que
resume la dimensión.

---

## 3. Lo que ya está construido y está bien

No lo digo por cortesía: son piezas que un comprador debe saber que no tiene que
pagar dos veces.

### 3.1 El patrón de anfitrión con `useSyncExternalStore` — existe y funciona

21 módulos ya están fuera del monolito con estado propio y suscripción externa:

```
components/cad/command-line/command-engine-host.ts   (793 líneas)
components/cad/command-line/navigation-host.ts
components/cad/palettes/paper-spaces-host.ts
components/cad/palettes/layer-manager-host.ts
components/cad/palettes/draft-settings-host.ts
components/cad/palettes/style-manager-host.ts
components/cad/palettes/palette-host.ts
components/cad/viewport/render-pipeline-host.ts
components/cad/viewport/pointer-router.ts
components/cad/onboarding/tour-host.ts
components/cad/calls/use-call-session.ts
components/cad/lisp/lisp-runtime.ts
lib/cad/system-variables.ts
lib/cad/view/view-navigation.ts
…
```

Esto importa mucho más de lo que parece. `CadCommandLineDock.tsx` tiene **70
líneas y cero `useState`**: teclear en la línea de comandos —el gesto más
frecuente de un dibujante de AutoCAD— **no re-renderiza el monolito**. Ese es el
diseño correcto y ya está demostrado dentro de este repo. El trabajo pendiente
no es inventarlo: es repetirlo.

### 3.2 Server Components donde tocan

39 de 44 `page.tsx` son de servidor. Sólo cinco son cliente y las cinco tienen
razón (`dashboard`, `studio/[documentId]`, `legacy/studio`, `revision`,
`logout`). El estudio entra por `next/dynamic` con `ssr:false` y **una carcasa
que pinta la misma retícula** (`CadStudioSkeleton`), no un spinner
— `app/studio/[documentId]/page.tsx:11-18`. Eso es CLS cero por diseño, no por
suerte.

### 3.3 Presupuestos con trinquete, todos

`bundle-budget.json` (14 rutas, KB gzip), `frontend-load-baseline.json` (JS
distinto hasta usable), `interaction-latency-baseline.json` (p95/peor),
`etapas-100k-budget.json` (por etapa del pipeline), `monolith-budget.json`
(líneas + `useState`), `lint-budget.json` (por regla). **Todos sólo bajan**, y
subir uno exige editar JSON a mano. No conozco muchos repos con esto.

### 3.4 Las decisiones de arquitectura están medidas, no opinadas

`next.config.ts:88-104` deja el React Compiler tras flag y **apagado**, con los
números en `INFORME_CAMPANA_FRONTEND_20260829.md`: +58 KB en el estudio, +66 %
de compilación, **0 ms de mejora en p50/p75/p95**. Y explica por qué:
164 avisos `react-hooks/refs` desactivan el compilador componente a componente.
Esa es exactamente la forma correcta de rechazar una herramienta de moda.

Lo mismo con `next/font` (`app/layout.tsx:14-41`): rechazado con la medida
delante (1 486 KB precargados, LCP 95 % render delay) y sustituido por
`@font-face` manual con subconjuntos generados.

### 3.5 El manejo de errores tiene frontera *donde el dato es ajeno*

`CadStudioHost.tsx:146,163,178` envuelve colaboración, mensajería y llamada en
`ErrorBoundary` separados, con el porqué escrito: «un comentario con una forma
inesperada tumbaba hasta aquí el estudio entero, dibujo incluido». `app/error.tsx`
y `app/global-error.tsx` existen y usan `reset()` y `digest`. Eso está bien
pensado. (Lo que falta es la frontera del propio editor — §4.3.)

### 3.6 La matriz de capacidades sin red es ejecutable

`app/(sw)/offline-capability-matrix.ts` (773 líneas) clasifica **34 flujos** con
tres veredictos y su spec los contrasta contra el contrato OpenAPI y contra
`legacy/layout-http-adapter.ts`. Un documento no puede hacer eso. Es la pieza
más honesta del repositorio y es también la que señala la apuesta ganadora (§6).

### 3.7 Higiene de ciclo de vida en el monolito

`addEventListener` 14 / `removeEventListener` 15 · `requestAnimationFrame` 1 /
`cancelAnimationFrame` 2 · `setInterval` 1 / `clearInterval` 1. Balanceado, con
`e2e/performance/cad-editor-memory-cycles.spec.ts` vigilándolo. El bucle de
cuadro lo conducen refs, no estado (comentarios en `Layout3DEditor.tsx:1922` y
`:1946`). El teclado global se registra una vez con `[open]` y se lee por ref
(`:13698-13707`), que es el patrón correcto.

---

## 4. Los defectos del código, con fichero y línea

### 4.1 · BLOQUEANTE — El copiloto de frases anuncia un panel que no existe

**Dónde:** `apps/web/src/components/cad/palette-actions.ts:105-134` ·
`apps/web/src/components/cad/editor/Layout3DEditor.tsx:11676`

La paleta Ctrl+K, para las **40 entradas de tipo «Frase»** (`CAD_COMMAND_REGISTRY`,
`lib/cad/commands/registry.ts:366`), hace esto:

```ts
// palette-actions.ts:110-124
host.openNlCommand(example);
const { parseCadCommand, previewCadCommand } = await loadCadNlCommands();
const parsed = parseCadCommand(example);
if (parsed.ok && parsed.input) {
  const preview = previewCadCommand(parsed.input, host.nlCommandContext());
  host.setNlCommandPreview({ input: parsed.input, preview, rawInput: example });
  host.appendNlCommandHistory(…);
  host.toastSuccess("Preview listo en el Copiloto CAD.", "Cmd-K CAD");
}
```

Tres hechos verificados sobre el árbol:

1. **«Copiloto CAD» aparece UNA sola vez en todo `apps/web/src`: en ese propio
   toast.** No existe ningún panel, componente, `data-testid` ni ruta con ese
   nombre.

   ```
   $ grep -rn "Copiloto" src --include=*.tsx --include=*.ts | grep -v spec
   src/components/cad/palette-actions.ts:124: host.toastSuccess("Preview listo en el Copiloto CAD.", "Cmd-K CAD");
   ```

2. **`commandPreview` no se pinta en ninguna parte.** El estado se declara en
   `Layout3DEditor.tsx:1523`, se espeja a un ref en `:1739`, y sus únicos
   lectores son `applyCommand` (`:11677-11849`) y el flag
   `commandPreviewOpen` del intérprete de teclado (`:13687`). **Cero usos en el
   JSX** (líneas 14 659–18 453).

3. **`applyCommand` está muerto.** ESLint lo confirma:
   `8241 'submitPrecisionPoint' … 11676 'applyCommand' is assigned a value but
   never used`. Es la **única** llamada de `cadNlCommandsIfLoaded()` del árbol
   (`lib/cad/commands/lazy.ts:29`, cuyo comentario dice literalmente «existe para
   el `apply` síncrono del editor»).

**Qué ve el usuario:** abre Ctrl+K, escribe «haz un pasillo», elige la entrada,
la paleta se cierra, sale un toast verde que dice que el preview está listo en un
panel — y no pasa absolutamente nada más. El dibujo no cambia, no hay panel, no
hay botón de aplicar.

**Y hay un segundo efecto, peor, porque es silencioso.** `editor-keyboard.ts:325-337`
consume Escape en cascada:

```ts
: ctx.paletteOpen        ? "close-palette"
: ctx.commandPreviewOpen ? "clear-preview"        // ← estado invisible
: ctx.commandTextPending ? "clear-command-text"   // ← estado invisible
: ctx.drawCommandActive  ? "cancel-draw"
```

`commandText` (`Layout3DEditor.tsx:1522`) tampoco se renderiza en ningún sitio
—la línea de comandos viva es `CadCommandLineDock host={commandEngine}`, con su
propio estado en el anfitrión— y `openNlCommand` lo rellena
(`Layout3DEditor.tsx:12206-12209`). Resultado: después de usar una entrada
«Frase», **las dos primeras pulsaciones de Escape del usuario no hacen nada
visible**. En AutoCAD, Escape siempre cancela. Ésta es la clase de detalle que un
dibujante nota en el primer minuto y no perdona.

**Esto viola tres reglas de la casa a la vez:** la regla 2 de la campaña de
cimientos («ningún comando responde éxito sin efecto verificado»), la regla 3
(«ninguna capacidad se anuncia sin evidencia del límite») y el `fix-or-hide`.
`check:command-integrity` no lo caza porque recorre los ~192/291 comandos del
**registro del motor**, y esto es una entrada de **paleta** de otra familia.

**Y `palette-actions.ts` no tiene ni un solo test:**

```
$ grep -rln "palette-actions|useCadPaletteActions" src e2e
src/components/cad/editor/Layout3DEditor.tsx
src/components/cad/palette-actions.ts
```

160 líneas de despachador de la paleta insignia, cero specs, cero goldens.

**Arreglo (dos opciones, ambas honestas):**
- *Cerrar el circuito*: montar el panel de preview (existe el estado y existe
  `applyCommand`; falta el JSX y llamar a `applyCommand`), con un golden que
  afirme sobre el documento del servidor tras aplicar una frase.
- *Declarar el límite*: si el copiloto no entra en esta versión, quitar las 40
  entradas «Frase» de `buildCadPaletteEntries` (`lib/cad/command-palette.ts:59-70`),
  borrar `applyCommand`, `commandPreview` y `commandText` del monolito
  (−≈250 líneas, −3 `useState`, y baja el trinquete) y quitar las dos ramas
  muertas del cascada de Escape.

Cualquiera de las dos es correcta. La que hay hoy —anunciar y no hacer— no.

---

### 4.2 · ALTA — Dos (tres) recorridos O(n) sobre TODAS las entidades en cada render

**Dónde:** `Layout3DEditor.tsx:13736-13741` y
`components/cad/palettes/CadNativeEntityList.tsx:54`

Justo después del `return null` de editor cerrado, **sin memoizar**:

```ts
// Layout3DEditor.tsx:13736-13741
const allNativeEntities = nativeEntities;
const nativeById = new Map(
  allNativeEntities.map((entity) => [entity.id, entity]),
);
const nativeEntityLabels = cadEntityLabels(allNativeEntities); // «Muro 3»
```

`nativeEntities` (`:1541`) es el **documento entero** filtrado por el registro
(`:2820-2825`: `loadedCadDocumentRef.current?.entities ?? []`). Con el corpus
`architecture@100k` son 100 000 elementos.

`cadEntityLabels` (`lib/cad/entity-labels.ts:110-121`) recorre todo y **asigna
una plantilla de cadena por entidad**. Se construye entero para consultar 20
etiquetas en `:16470`. `nativeById` se construye entero para consultar la
selección (`:13743`, normalmente <10 ids) y el MTEXT en edición (`:13820`).

Y **hay un tercer recorrido**: `CadNativeEntityList.tsx:54` vuelve a llamar
`cadEntityLabels(entities)` sobre el mismo array completo —no recibe el mapa que
el monolito acaba de construir— para pintar 20 filas (`limit = 20`, `:55`).
El componente **no es `memo`**, así que se ejecuta en cada render del padre.

**Medido en este contenedor (Node 22.22.2, 100 000 entidades, media de 20 pasadas):**

| Derivación | ms/render |
| --- | ---: |
| `new Map(entities.map(…))` | 16,22 |
| `cadEntityLabels(entities)` (monolito) | 22,84 |
| `cadEntityLabels(entities)` (lista, otra vez) | ≈22,8 |
| **Total por render** | **≈61,9 ms** |

Más la basura: ~200 000 entradas de `Map` y ~200 000 cadenas por render.

**Cuándo pasa:** en cada uno de los 131 `setState` del componente. Un clic de
designación (`selectNative`, `:3129-3148`) dispara cuatro (`setNativeSelectionIds`,
`setSelList`, `setSelSnap`, `setSelSummary`) → un render → 62 ms de churn puro
antes de que React empiece a reconciliar el JSX. Abrir la paleta Ctrl+K, teclear
en su buscador (`paletteQuery`, `:1517`), cambiar de pestaña, tocar cualquier
conmutador: lo mismo.

**Nota adicional:** `selectNative:3143` hace `setSelList([])` con un array
literal nuevo. `Object.is([], [])` es `false`, así que **designar sobre el vacío
fuerza un render aunque no cambie nada**.

**Arreglo:** un `useMemo` con dependencia `[nativeEntities]` para las dos
derivaciones, y pasar `nativeEntityLabels` a `CadNativeEntityList` por prop en
lugar de recalcularlo (o `memo` en el componente). Es una tarde. El coste pasa de
62 ms **por render** a 39 ms **por cambio de documento**.

---

### 4.3 · ALTA — El editor es lo único del estudio sin `ErrorBoundary`

**Dónde:** `components/cad/CadStudioHost.tsx:117-130`

```tsx
return (
  <>
    <Layout3DEditor {…props} … />           {/* ← 18 453 líneas, SIN frontera */}
    {documentId && withCollaboration ? (
      <ErrorBoundary zona="Colaboración" …>  {/* ← 300 líneas, CON frontera */}
    …
    <ErrorBoundary zona="Mensajería" …>
    <ErrorBoundary zona="Llamada" …>
```

La colaboración, la mensajería y la barra de llamada —tres superficies pequeñas
que consumen datos ajenos— tienen cada una su frontera, con el porqué escrito.
El componente que tiene **3 794 líneas de JSX y el dibujo del usuario en memoria**
no tiene ninguna. Cualquier excepción de render en esas 3 794 líneas sube a
`app/error.tsx`, que desmonta la ruta entera.

La página de error dice: *«Tus documentos guardados están intactos: esto sólo
afectó a lo que se estaba pintando en pantalla»* (`app/error.tsx:57-59`). Es
cierto a medias — el diario de recuperación (`lib/cad/cad-recovery-journal.ts`,
IndexedDB) conserva el trabajo, y eso es un mérito real. Pero **la pila de
deshacer en memoria (`CanonicalHistory`, `maxEntries: 80`) se pierde**, y el
`reset()` remonta la ruta desde cero, lo que en el estudio significa volver a
descargar y reconstruir la escena.

**Arreglo:** envolver `<Layout3DEditor>` en su propio `ErrorBoundary
zona="Editor"` que, antes de pintar el fallback, fuerce un checkpoint del diario
y ofrezca «reintentar sin perder lo recuperable». No es difícil: la pieza de
recuperación ya existe.

---

### 4.4 · MEDIA — Tema del estudio: primer fotograma en oscuro y botones que no persisten

**Dónde:** `Layout3DEditor.tsx:1605`, `:2059-2061`, `:15146-15155`

```ts
:1153   theme: resolvedScheme = "light",        // prop de plataforma, default claro
:1605   const [theme, setTheme] = useState<Theme3D>("dark");   // estado inicial OSCURO
:2059   useEffect(() => {
:2060     setTheme(resolvedScheme === "light" ? "light" : "dark");
:2061   }, [resolvedScheme]);
```

Dos defectos en seis líneas:

1. **Prop espejada en estado por efecto.** ESLint lo marca
   (`react-hooks/set-state-in-effect @2060`). El estado inicial es `"dark"` y el
   prop por defecto es `"light"`: un usuario en tema claro ve **un fotograma de
   la escena 3D en oscuro** (fondo, niebla, suelo y rejilla los pinta
   `applyTheme`, `:2384`) antes de que el efecto lo corrija. Es el mismo tipo de
   parpadeo que `app/layout.tsx:115` se toma la molestia de evitar con un script
   anti-flash — el estudio lo reintroduce después.

2. **Un tercer mecanismo de tema.** `:15146-15155` pinta botones de tema propios
   del estudio que llaman `setTheme(t)` **local**, sin tocar
   `ThemeContext.setColorScheme`. La elección no se persiste, no cambia el resto
   del producto, y el efecto de `:2059` la revierte en cuanto `resolvedScheme`
   se re-resuelve. AGENTS.md pide explícitamente no añadir un tercer mecanismo
   para `prefers-reduced-motion`; el mismo criterio aplica aquí.

**Arreglo:** inicializar `useState<Theme3D>(resolvedScheme === "light" ? "light" : "dark")`
y hacer que los botones de `:15146` llamen a `onNotify`/al `ThemeContext` a
través de una prop de plataforma, o retirarlos.

---

### 4.5 · MEDIA — Código muerto en el monolito: 11 símbolos, ≈330 líneas

`npx eslint src/components/cad/editor/Layout3DEditor.tsx`:

```
   96  'AssetArchetype' is defined but never used
  181  'PlotLayout' is defined but never used
  425  'attachCadXref' is defined but never used
  654  'CadLayerFilterProperty' is defined but never used
 6486  'ctx' is assigned a value but never used
 8241  'submitPrecisionPoint' is assigned a value but never used     ← 74 líneas
11388  'interpretCommand' is assigned a value but never used
11393  'navigateCommandLineHistory' is assigned a value but never used
11676  'applyCommand' is assigned a value but never used             ← ≈190 líneas
11868  'undoLastCommand' is assigned a value but never used
11877  'redoLastCommand' is assigned a value but never used
```

Un caso merece nombre propio. **`precisionText` (`:2052`) es demostrablemente
siempre la cadena vacía**: sus diez asignaciones (`:8255, 8279, 8286, 8299, 8315,
8324, 8341, 13564, 16142`) pasan todas `""`. Su único lector es
`submitPrecisionPoint:8242` (`const raw = precisionText.trim()`), que **nunca se
llama**. Es decir: un `useState` que sólo existe para ser vaciado, alimentando
74 líneas de aritmética de coordenadas heredada que ninguna ruta alcanza. Y ese
`useState` **cuenta contra el techo de 131** que la casa se comprometió a bajar.

`interpretCommand`, `navigateCommandLineHistory`, `undoLastCommand` y
`redoLastCommand` son el residuo de la línea de comandos anterior a
`CadCommandLineDock`: la extracción se hizo bien y **la retirada no se completó**.

**Por qué el gate no lo caza:** `scripts/lint-budget.json` permite **14**
`@typescript-eslint/no-unused-vars` en `apps/web` y hoy hay 11 sólo en este
fichero. El presupuesto de lint es un trinquete de **cantidad**, no de
**identidad**: mientras el número no suba, código muerto nuevo entra sin ruido.

---

### 4.6 · MEDIA — `setNativeRenderStats` sin salida de identidad en uno de tres sitios

**Dónde:** `Layout3DEditor.tsx:3370-3373`

Los autores conocen el patrón y lo aplican bien dos veces —`:3266-3277` y
`:3345-3358` devuelven `current` cuando nada cambió, evitando el render—. En el
tercero, no:

```ts
:3370  setNativeRenderStats((current) => ({
:3371    ...current,
:3372    batching: false,
:3373  }));
```

Siempre devuelve un objeto nuevo. Cada final de `syncProgressive` fuerza un
render aunque `batching` ya fuera `false` — y ese render arrastra los 62 ms de
§4.2. **Arreglo:** `current.batching === false ? current : {…current, batching:false}`.
Una línea.

---

### 4.7 · MEDIA — Un conmutador de idioma dentro del estudio que no traduce nada

**Dónde:** `components/cad/palettes/CadWorkspaceDock.tsx:302`

```tsx
<LanguageSwitcher variant="compact" />
```

`LanguageSwitcher` (`components/ui/LanguageSwitcher.tsx`) fija la cookie por
Server Action y hace `router.refresh()`. Pero en todo `apps/web/src` sólo
**tres ficheros** consumen traducciones:

```
$ grep -rln "useTranslations" src --include=*.tsx
src/components/ui/LanguageSwitcher.tsx
src/app/(sw)/ServiceWorkerRegistrar.tsx
src/app/(sw)/sin-conexion/page.tsx
```

Los mensajes son 48 KB en tres espacios de nombres (`appUpdate`, `language`,
`offline`). El estudio entero —cinta, línea de comandos, los 291 comandos, los
prompts, las paletas, los diálogos— está en español codificado a mano.

**Qué ve el usuario:** pulsa «EN» dentro del CAD, la página se refresca, y todo
sigue en español menos el propio conmutador y la pantalla de sin conexión. Es
exactamente lo que AGENTS.md prohíbe: *«No button … may be shown unless the
backing behavior and relevant boundary are tested»*.

**Arreglo inmediato:** retirar el `LanguageSwitcher` del dock del estudio (donde
promete traducir el producto) y dejarlo, si acaso, en el embudo público, donde
hoy tampoco traduce. Mejor: declararlo en ESCALERA como «todavía no» y ocultarlo.

---

### 4.8 · MEDIA — El sistema de diseño gobierna el sitio de marketing, no el producto

AGENTS.md declara tres no-negociables: primitivas desde `@/components/ui`, color
desde tokens, tipografía desde la escala. Medido hoy:

| Regla declarada | Medido en `apps/web/src/**/*.tsx` | ¿Lo ve el gate? |
| --- | ---: | --- |
| «nunca hagas un botón a mano» | **319** `<button>` (114 en el monolito, 231 sin `type=`) | **No** |
| «el color sale de tokens» | **438** clases de paleta cruda (`bg-indigo-*` 84, `text-gray-*` 64, `bg-amber-*` 37…) | Sólo `cyan/sky/teal` |
| «el tamaño sale de la escala» | **117** tamaños Tailwind crudos (`text-sm` 71, `text-xs` 30…) | **No** |
| «tres radios: control/card/surface» | **333** radios crudos (`rounded-lg` 145, `rounded-xl` 61…) | **No** |
| «`shadow-2xl` es salirse del sistema» | **26** sombras crudas, **18** de ellas `shadow-2xl` | **No** |

`src/components/ui/design-system.spec.ts` tiene siete reglas: piso de 11 px
sobre la **definición** CSS de la escala (no sobre su uso), veto de
`cyan|sky|teal`, veto de hex **sólo** en `components/ui/` y `components/brand/`,
la barrica de primitivas, la geometría de marca, y la regla 5 —la que el propio
AGENTS.md llama «la que importa»— que sólo comprueba que cada token aparezca
**al menos una vez** en algún fichero.

Con esa forma, el gate está satisfecho hoy mientras el estudio pinta a mano.
Ejemplos concretos, todos dentro del producto:

```
Layout3DEditor.tsx:16252  "… rounded-2xl border border-indigo-400/20 bg-surface/80 p-3 shadow-2xl backdrop-blur"
Layout3DEditor.tsx:16019  "… rounded-2xl border border-amber-400/20 bg-surface/80 p-3 shadow-2xl backdrop-blur"
Layout3DEditor.tsx:15465  "flex-1 grid place-items-center text-amber-400 text-sm"
Layout3DEditor.tsx:15150  "px-2 py-1 rounded-md type-caption …"           (botón a mano)
CadDynamicInput.tsx:112   "rounded px-2 py-0.5 type-micro … bg-amber-300 text-gray-950"
```

AGENTS.md dice que se partió de «329 botones a mano»; hoy hay **319**. En seis
semanas de campañas, el número bajó un 3 %. Eso no es un sistema de diseño
adoptado: es un sistema de diseño con dos consumidores (el embudo público, 54
ficheros importan de `@/components/ui`) y un no-consumidor (el CAD).

*Matiz justo:* AGENTS.md exceptúa los colores ACI del dibujo y la paleta
categórica de celdas, que **son dato del plano**. Los 84 `bg-indigo-*` y los
`text-gray-950` de un botón no lo son.

---

### 4.9 · BAJA — El registro del monolito lleva cinco días y nueve olas sin una fila

**Dónde:** `docs/execution/DEUDA-MONOLITO.md:52-55`

La última fila del registro dice **2026-08-31 · 19 002 líneas · 135 `useState`**.
El árbol de hoy mide **18 453 y 131**. Entre medias han pasado, según los propios
informes, las olas A–I del encargo «AutoCAD completo», las olas 2–7, la ventana 2
de MEP y la ola de superación. **Ninguna añadió fila**, pese a que el documento
lo exige por escrito:

> *«Ritmo mínimo: el trinquete baja AL MENOS un escalón declarado por campaña.
> Una campaña que toca el editor y deja el presupuesto igual debe decir por qué
> en su informe.»*

Y el mapa que ese documento deja para la siguiente campaña **ya apunta a otro
código**:

| El documento dice | Hoy está en |
| --- | --- |
| «las paletas ya montadas como hijos — `14944`…`15148`» | `CadSelectionPalette` en **14444**, `CadHatchPalette` **14489**, `CadDimensionPalette` **14511** |
| «la barra de estado y los conmutadores — `15193`…`15987`, ~790 líneas» | Ya **extraída**: `components/cad/studio/CadStatusBar.tsx` (399 líneas), montada en **16338** |
| «Los 140 `useState`… el techo está en 140» | El techo está en **131** |

La extracción de la barra de estado **se hizo** y nadie la registró. Es
exactamente la regla 4 de la campaña de cimientos («ninguna cifra vive en dos
lugares») incumplida contra el propio documento de deuda — y esto ya pasó una
vez: la fila de 2026-08-30 se reconstruyó a posteriori por el mismo motivo.

**Consecuencia comercial:** el criterio `growth.monolith-curve` de la rúbrica
vale su punto entero con esta evidencia:

```json
{"kind":"grep","path":"docs/execution/DEUDA-MONOLITO.md","pattern":"8,000","min":1},
{"kind":"file","path":"scripts/cad/check-monolith-budget.mjs","minLines":20}
```

Es decir: **puntúa que la cadena «8,000» aparezca en un fichero**, no que la
curva baje. Un inversionista que lea «8/8 en capacidad de crecer» no está viendo
que la meta está a 10 453 líneas de distancia y que el registro que la vigila
lleva cinco días parado.

*Proyección honesta con lo medido:* 20 248 → 18 453 en 14 días = 128 líneas/día.
Al mismo ritmo, 8 000 llega hacia **finales de noviembre de 2026**. Es alcanzable.
Lo que falta no es capacidad: es que cada campaña pague su escalón.

---

### 4.10 · BAJA — Dos textos de `gap` de la rúbrica contradicen el árbol

La casa prohíbe que una cifra viva en dos sitios. Estos dos `gap` son prosa a
mano que ya no dice la verdad:

1. **`rubric.json:2030` (`performance`)**: *«el SLO … registra 48,2 s hasta el
   detalle completo y 1,4 fps de paneo (corpus architecture, 10k)»*. El artefacto
   que el criterio **lee de verdad** dice otra cosa:

   ```
   docs/cad/evidence/browser-slo-100k.json → profiles[0]
     architecture · 10 000 · next
     fullDetailMs 1907.3   pan.fpsP95 59.524   zoomSettleMs 33.2
   ```

   El criterio `performance.browser-slo` **se concede** (≤5 000 ms, ≥30 fps,
   ≤500 ms) y el texto que lo acompaña sigue diciendo que falla. Lo mismo repetido
   en `autocad-2027-gap-matrix.md:24, 263, 337`.

   *Y hay un matiz que sí importa:* el artefacto vigente se midió en un **portátil
   con GPU real** (`AMD Radeon … ANGLE D3D11`, Chromium 141 **headed**). El texto
   del `gap` describe una corrida con **GPU por software**. Las dos son
   verdaderas en su máquina; publicar sólo la buena, con el `gap` señalando la
   mala, deja al lector sin saber cuál manda. Un despacho con máquinas de oficina
   bloqueadas (VDI, sin aceleración) está en el escenario del 48,2 s.

2. **`rubric.json` (`draw-2d`)**: *«faltan los conmutadores estándar F7 (rejilla),
   F9 (forzado) y F12 (entrada dinámica)»*. **Ya están**, en
   `lib/cad/keyboard-shortcuts.ts:183-198`, con su comentario de aterrizaje. La
   fila puntúa 16/16 igualmente, pero el texto que un inversionista lee para
   entender el hueco describe un producto de hace dos semanas.

**Un hueco real que sí queda ahí, y que nadie declara:** **F11 y F12 son teclas
del navegador.** En Chrome, F11 alterna pantalla completa y F12 abre DevTools, y
ninguna de las dos se puede cancelar desde la página. El repo las promete en la
ayuda de atajos (`components/cad/studio/editor-presentation.ts:129-135`) y en el
cuadro DSETTINGS (`CadDraftSettingsDialog.tsx:260, 288`). Sólo hay goldens para
**F3** (`e2e/golden/52-cad-draft-settings.spec.ts:168`) y **F11**
(`e2e/golden/13-cad-dynamic-input.spec.ts:93`) — y este último pasa en
Playwright headless justamente porque ahí no hay chrome de navegador que las
robe. Es un límite estructural de un CAD en el navegador y **no está escrito en
ESCALERA**.

---

### 4.11 · BAJA — La cinta se re-renderiza entera en cada `setState` del monolito

**Dónde:** `Layout3DEditor.tsx:15459-15462` · `components/cad/ribbon/CadRibbon.tsx`

```tsx
<CadRibbon
  dispatch={(name) => commandEngineRef.current.invoke(name)}   // ← flecha nueva por render
  readOnly={drawingReadOnly}
/>
```

`CadRibbon` **no está memoizado** y, aunque lo estuviera, la flecha inline
rompería la memo. De los 29 componentes `Cad*` que el monolito monta en su JSX,
**sólo 4 son `memo`**:

```
MEMO   CadEditorLayerToggles · CadEntityPropertiesPanel · CadLayerManagerPalette · CadPaletteOverlays
plain  CadRibbon · CadStatusBar · CadNativeEntityList · CadToolPalette · CadViewCube
       CadNavigationBar · CadOverviewMinimap · CadCommandLineDock · CadDraftToolbar
       CadTakeoffDialog · CadVersionsDialog · CadDxfExportDialog · CadDesignReportDialog
       CadLayoutManager · CadMTextEditor · … (25 en total)
```

Ahí está el sentido de los **128 `useCallback`** del monolito: con cuatro hijos
memoizados y las props inline que hay, la inmensa mayoría de esos `useCallback`
**no ahorra un solo render** — sólo cuesta memoria y un array de dependencias
que mantener. El propio código lo reconoce en un sitio
(`Layout3DEditor.tsx:8345-8350`: *«Sin `useCallback`: … su identidad no viaja a
ningún hijo memoizado y envolverlo no ahorra un render»*). La conclusión correcta
se sacó una vez y no se generalizó.

*Lo bueno:* `Tabs`/`TabPanel` (`components/ui/Tabs.tsx:146`) devuelve `null` para
la pestaña inactiva, así que sólo se pinta la pestaña activa. La cinta no es un
desastre; es trabajo repetido sin necesidad.

---

### 4.12 · Observaciones menores, con sitio

- **`react-hooks/immutability @6952` y `@7484`**: `expandGroupMembers` y
  `feedDraftPoint` se usan antes de declararse dentro del componente. Funciona por
  izado, pero el compilador de React lo marca como valor que no se actualizará.
- **`react-hooks/purity @1167`**: `performance.now()` llamado durante el render
  (dentro del `useMemo` del `documentLifecycle`). Inocuo hoy; es el tipo de cosa
  que desactiva el compilador para todo el componente.
- **Dos portapapeles conviviendo**: el heredado a nivel de módulo
  (`Layout3DEditor.tsx:783-796`, `CAD_CLIPBOARD`, sólo «assets») y el canónico
  (`lib/cad/clipboard.ts`). El despacho está escrito y comentado
  (`:13621-13638`), así que es deuda declarada, no bug — pero son dos modelos de
  documento vivos en el mismo componente (`assetsRef` 102 usos ·
  `loadedCadDocumentRef` 71 usos), y ésa es la raíz de la mitad del tamaño.
- **Trampa de foco ausente en los cuadros**: ya está anotada en
  `DEUDA-MONOLITO.md` («Deuda anotada que NO es de tamaño»). `CadDialogShell` da
  `role="dialog"`, `aria-modal` y Escape, pero **no mueve el foco al abrir ni lo
  devuelve al cerrar**. Con el gate `e2e/a11y/teclado-embudo.spec.ts` cubriendo el
  embudo público y no el estudio, esto no lo ve nadie.
- **El script anti-flash del tema y `ThemeContext` declaran el default por
  separado** (`app/layout.tsx:115` y `contexts/ThemeContext.tsx:76`). El
  comentario lo reconoce y describe el síntoma («un parpadeo de tema en la primera
  carga») pero **no hay gate** que los ate.

---

## 5. Los huecos, ordenados por lo que más duele

Cada uno con lo que hace AutoCAD, lo que hace Valle hoy (con el fichero que
miré), el flujo real que se rompe, cómo se construye y cómo se verifica.

### H1 · El gate de latencia mide 400 entidades sobre la ruta legacy

- **AutoCAD:** no tiene «trabajo de framework» que medir; su latencia de
  designación es del orden del milisegundo con planos de cientos de miles de
  objetos.
- **Valle hoy:** `e2e/performance/interaccion-estudio.spec.ts:103` siembra
  `documentoDenso(400)` y navega a **`/legacy/studio`** (`:112`). El techo
  (`interaction-latency-baseline.json`: p95 320 ms) se calibró con eso. El único
  spec que sí llega a 100 000 en navegador
  (`e2e/performance/cad-dense-editing-100k.spec.ts`) declara explícitamente
  *«aquí NO hay gate de tiempo»* (`:37-48`), es opt-in (`CAD_PERF_E2E=1`) y **su
  artefacto no existe en `docs/cad/evidence/`** — lo dice el propio `gap` de la
  fila `modify` de la rúbrica.
- **Duele porque:** los 62 ms/render de §4.2 son ~0,25 ms a 400 entidades. El
  gate que existe para *«cazar la regresión gruesa —el render en cascada que
  alguien reintroduce»* es ciego a la clase de regresión que este editor
  realmente sufre, y lo mide sobre una ruta que no es la del producto.
- **Esfuerzo:** un día.
- **Cómo se construye:** parametrizar el spec por tamaño (`400 | 10 000 | 100 000`)
  usando el corpus versionado de `lib/cad/benchmark/corpus.ts` (ya existe, con
  `corpus-manifest.json` y sha256), navegar a `/studio/[documentId]` con el
  backend `cad-v1` en vez de `/legacy/studio`, y publicar **tres** techos en
  `interaction-latency-baseline.json` con la máquina declarada, siguiendo el
  patrón de `etapas-100k-budget.json` (mediana × (1+dispersión), nunca por debajo
  de la peor × 1,05).
- **Cómo se verifica:** el techo de 10 000 debe **fallar hoy** con las
  derivaciones sin memoizar y **pasar** tras el arreglo de §4.2. Si pasa antes y
  después, el gate no mide lo que dice medir.
- **Ficheros:** `e2e/performance/interaccion-estudio.spec.ts`,
  `src/lib/cad/benchmark/interaction-latency-baseline.json`,
  `e2e/fixtures/cad-v1-backend.ts`.
- **Severidad: bloqueante** (es el gate que debería haber cazado §4.2).

### H2 · Cerrar o retirar el copiloto de frases

- **AutoCAD:** no tiene copiloto de lenguaje natural en el producto base; aquí
  Valle *podría* estar por delante. Lo que AutoCAD sí garantiza es que **cada
  entrada de su paleta hace algo**.
- **Valle hoy:** §4.1. 40 entradas «Frase» → toast verde → nada.
- **Duele porque:** es la primera cosa que prueba quien abre Ctrl+K, y es una
  mentira visible. Además roba dos Escapes.
- **Esfuerzo:** horas (retirar) · varios días (cerrar el circuito bien).
- **Cómo se construye (opción cerrar):** un componente
  `components/cad/command-line/CadNlPreviewPanel.tsx` alimentado por un anfitrión
  `nl-preview-host.ts` con `useSyncExternalStore` —el patrón que ya usan los otros
  21— que sea dueño de `commandPreview`; el monolito pierde dos `useState` y el
  panel expone «Aplicar» → `applyCommand`, que se mueve al anfitrión con
  `commitNativeCommands` por parámetro.
- **Cómo se verifica:** un golden que abra Ctrl+K, elija una entrada «Frase»,
  afirme que el panel es visible con `data-testid` nuevo, pulse Aplicar y
  **afirme sobre el documento que recibe el servidor** (el patrón del golden 88).
  Más una entrada en `command-integrity-exemptions.json` si se decide retirar.
- **Ficheros:** `src/components/cad/palette-actions.ts`,
  `src/lib/cad/command-palette.ts`, `Layout3DEditor.tsx:11676-11866`,
  `src/lib/cad/editor-keyboard.ts:325-337`.
- **Severidad: bloqueante.**

### H3 · Memoizar las derivaciones O(n) y romper el render monolítico

- **AutoCAD:** designar un objeto en un plano de 100 000 no cuesta recorrer el
  plano.
- **Valle hoy:** §4.2 — 62 ms/render medidos, en cada uno de los 131 `setState`.
- **Duele porque:** es el «va lento» que un arquitecto reporta y que ningún
  benchmark del repo enseña, porque los benchmarks miden el pipeline de escena
  (que está bien: 59,5 fps a 10k) y no el trabajo de React encima.
- **Esfuerzo:** horas para el parche; varios días para la costura buena.
- **Cómo se construye:** (a) `useMemo([nativeEntities])` en `:13738` y `:13741`;
  (b) pasar `nativeEntityLabels` a `CadNativeEntityList` por prop y `memo`arlo;
  (c) el paso de verdad: un `selection-host.ts` con `useSyncExternalStore` dueño
  de `nativeSelectionIds`, `selList`, `selSnap`, `selSummary`,
  `nativeSelectionIndexRef` y el índice `id→entidad`, construido **una vez por
  revisión de documento**. Se lleva 4-6 `useState` del monolito y hace que
  designar no re-renderice la cinta.
- **Cómo se verifica:** el gate de H1 a 10 000 y 100 000; más un spec Node del
  anfitrión (como `render-pipeline-host.spec.ts`).
- **Ficheros:** `Layout3DEditor.tsx:3129-3158, 13736-13745`,
  `components/cad/palettes/CadNativeEntityList.tsx`, nuevo
  `components/cad/viewport/selection-host.ts`.
- **Severidad: alta.**

### H4 · Frontera de error propia del editor, con checkpoint

- **AutoCAD:** un cuelgue deja `.sv$` y ofrece recuperar al reabrir. La sesión se
  pierde, pero el usuario sabe qué pasó.
- **Valle hoy:** §4.3. El editor no tiene `ErrorBoundary`; la colaboración sí.
- **Duele porque:** una excepción de render en 3 794 líneas de JSX manda al
  usuario a una pantalla de disculpa y le hace recargar el estudio entero.
- **Esfuerzo:** un día.
- **Cómo se construye:** `<ErrorBoundary zona="Editor" documentId=… onError={…}>`
  en `CadStudioHost.tsx:117`, con `onError` forzando
  `cadRecoveryJournal.checkpoint()` antes de pintar el fallback, y un fallback
  que ofrezca «Recuperar el dibujo» leyendo el diario en vez de sólo «Reintentar».
- **Cómo se verifica:** un golden que inyecte un `throw` en un panel del editor
  (por `window.__valleForzarFalloEditor`, sólo en test) y afirme que (a) sale el
  fallback del editor y no `app/error.tsx`, (b) el diario tiene checkpoint
  posterior al fallo, (c) recuperar devuelve las entidades.
- **Ficheros:** `components/cad/CadStudioHost.tsx`, `components/ui/ErrorBoundary.tsx`,
  `lib/cad/cad-recovery-journal.ts`.
- **Severidad: alta.**

### H5 · Abrir el dibujo sin red

- **AutoCAD:** abre el `.dwg` del disco sin pedir permiso a nadie. AutoCAD **web**,
  no.
- **Valle hoy:** `app/(sw)/offline-capability-matrix.ts:200-218` —
  `abrir-el-dibujo` = **`requiere-backend`**, y el propio módulo lo llama *«la
  frontera que más incomoda, porque el borrador SÍ está en la máquina»*. El
  efecto de recuperación arranca con `if (!open || !data || …) return`: sólo corre
  **después** de que el GET del servidor haya cargado.
- **Duele porque:** es el flujo entero de la tableta en obra. Un residente llega
  a la obra sin cobertura, abre `/studio/…`, y ve `/sin-conexion`. El plano que
  vio hace veinte minutos está en IndexedDB y no se le enseña. Dibujar sin red
  funciona; **abrir lo que ya tenía, no**.
- **Esfuerzo:** semanas (es la apuesta, §6).
- **Cómo se construye:** ver §6.
- **Cómo se verifica:** ver §6.
- **Severidad: alta** (y es la mayor oportunidad, no sólo el mayor hueco).

### H6 · Bajar el monolito por controladores, no por vistas

- **AutoCAD:** irrelevante como comparación directa; lo que se compara es la
  velocidad a la que Valle puede seguir añadiendo funciones.
- **Valle hoy:** 18 453 líneas, 131 `useState`, 129 `useRef`, meta 8 000. El
  método está escrito y es correcto (`DEUDA-MONOLITO.md`, «El método: costuras
  reales»), y el propio documento diagnostica bien por qué extraer cuadros no baja
  el `useState`: *«los cuadros extraídos no eran dueños de su estado, sólo lo
  pintaban»*.
- **Duele porque:** cada función nueva cuesta más que la anterior, y ya hay
  síntomas medibles de que nadie puede razonar sobre el archivo completo:
  código muerto que sobrevive campañas (§4.5), un panel prometido que no existe
  (§4.1), un mapa de deuda con líneas equivocadas (§4.9).
- **Esfuerzo:** semanas, por olas.
- **Cómo se construye:** cuatro controladores, en este orden por relación
  ganancia/riesgo (las agrupaciones ya están identificadas en el propio
  documento, líneas 1500-1800 del monolito):
  1. `selection-host.ts` → ~6 `useState` (y arregla H3).
  2. `dxf-export-host.ts` → 4 `useState` (`dxfExportOptions`, `dxfExportSummary`,
     `dxfPreflight`, `dxfPreflightAccepted`) + el cuadro ya extraído queda con
     2 props.
  3. `versions-host.ts` → 5 `useState` (`versions`, `versName`, `versBusy`,
     `localSnapshots`, `snapshotDiff`).
  4. `validation-host.ts` → 6 `useState` (`collisionHits`, `clearanceIssues`,
     `safetyIssues`, `validationReport`, `validationHighlightIds`, `report`).

  Y **antes de nada**, la limpieza gratis: borrar los 11 símbolos muertos de §4.5
  (≈330 líneas, ≥1 `useState`) y bajar el trinquete en el mismo commit.
- **Cómo se verifica:** `node scripts/cad/check-monolith-budget.mjs --update` en
  el mismo commit, spec Node por anfitrión, y **una fila nueva en el registro de
  `DEUDA-MONOLITO.md` por campaña** — que es lo que hoy no está pasando.
- **Severidad: alta** (es deuda, no defecto, pero compone).

### H7 · Un gate que cuente los botones a mano y el color crudo

- **AutoCAD:** su interfaz es consistente porque la pinta un solo toolkit.
- **Valle hoy:** §4.8. 319 botones a mano, 438 clases de paleta cruda, 117
  tamaños fuera de escala, y un gate de siete reglas que no mide ninguna de esas
  cuatro cosas.
- **Duele porque:** el estudio y la web parecen dos productos. Y el gate, tal
  como está, **bendice el estado**: la regla 5 se satisface con un uso de cada
  token en cualquier fichero.
- **Esfuerzo:** un día.
- **Cómo se construye:** tres reglas nuevas en `design-system.spec.ts`, cada una
  **con techo numérico en un JSON de trinquete** (`scripts/design-drift-budget.json`,
  mismo patrón que `lint-budget.json`), para no romper el árbol de golpe:
  `botonesAMano: 319`, `paletaCruda: 438`, `tamañosFueraDeEscala: 117`,
  `radiosFueraDeEscala: 333`, `sombrasFueraDeSistema: 26`. Sólo bajan.
  Excluir explícitamente los colores ACI y la paleta categórica por ruta de
  fichero, como ya hace la regla 4 con `components/ui`.
- **Cómo se verifica:** el propio gate; y el número en el JSON es la métrica que
  cada campaña de diseño baja.
- **Severidad: media.**

### H8 · Retirar o cumplir la promesa de idioma

- **AutoCAD:** se instala en 14 idiomas; los comandos tienen alias localizados y
  la interfaz completa traducida.
- **Valle hoy:** §4.7. Tres ficheros con `useTranslations`, un conmutador EN/ES
  dentro del CAD, 48 KB de mensajes, el resto codificado en español.
- **Duele porque:** hoy es una promesa falsa dentro del producto. Y a medio
  plazo es un techo comercial: el contenido mexicano es «la fuerza de salida, no
  el techo» (AGENTS.md), pero salir de México con toda la copia a mano es una
  campaña entera.
- **Esfuerzo:** horas (retirar) · semanas (cumplir).
- **Cómo se construye (retirar hoy):** quitar `<LanguageSwitcher>` de
  `CadWorkspaceDock.tsx:302`, y una fila en ESCALERA que diga «la interfaz está
  en es-MX; el inglés es todavía no».
- **Cómo se construye (cumplir después):** un gate
  `scripts/i18n/check-hardcoded-copy.mjs` que cuente literales en español fuera
  de `messages/` con techo de trinquete, y migrar por zonas empezando por la
  cinta (que se genera de `lib/cad/ribbon.ts`, así que es una tabla, no 300
  cadenas sueltas).
- **Severidad: media.**

### H9 · Declarar el límite de F11/F12 y probar F7/F8/F9/F10

- **AutoCAD:** F1–F12 son suyas. En un navegador, no.
- **Valle hoy:** §4.10. Las teclas existen en
  `lib/cad/keyboard-shortcuts.ts:183-198` y se anuncian en la ayuda
  (`editor-presentation.ts:129-135`) y en DSETTINGS. Sólo hay golden para F3 y
  F11, y el de F11 pasa por estar en headless.
- **Duele porque:** un dibujante pulsa F12 esperando entrada dinámica y le abre
  DevTools. Es el momento exacto en que «CAD en el navegador» deja de sonar a
  ventaja.
- **Esfuerzo:** horas.
- **Cómo se construye:** (a) goldens para F7/F8/F9/F10 en el mismo patrón que
  `52-cad-draft-settings.spec.ts:168`; (b) una alternativa **no robada** para las
  dos que el navegador se queda —el candidato natural es `Ctrl+Shift+F12` o el
  conmutador `DYN` de la barra de estado, que ya existe
  (`CadDraftStatusBar.tsx`)—; (c) la fila en ESCALERA que diga que F11 y F12 las
  reserva el navegador y cuál es el sustituto.
- **Cómo se verifica:** golden + `check:normas-mx`-style: un spec que afirme que
  cada tecla anunciada en `editor-presentation.ts` tiene golden **o** una fila de
  límite declarado. Cero excepciones sin nombre.
- **Severidad: media.**

### H10 · Foco atrapado en los cuadros del estudio

- **AutoCAD:** sus diálogos son modales del sistema; el foco está atrapado por el
  sistema operativo.
- **Valle hoy:** `CadDialogShell` da `role="dialog"`, `aria-modal`,
  `aria-labelledby` y Escape, y **no mueve el foco**. Está anotado en
  `DEUDA-MONOLITO.md` («Deuda anotada que NO es de tamaño») con el criterio
  correcto: hacerlo a medias es peor.
- **Duele porque:** `e2e/a11y/teclado-embudo.spec.ts` cubre el embudo público, no
  el estudio: quien dibuja con teclado abre DXF Export y su Tab se va a la cinta
  de detrás.
- **Esfuerzo:** un día.
- **Cómo se construye:** en `CadDialogShell`, `useEffect` que guarde
  `document.activeElement`, enfoque el primer control focusable del cuadro,
  atrape Tab/Shift+Tab dentro con `querySelectorAll` del selector estándar, y
  restaure al desmontar.
- **Cómo se verifica:** extender `e2e/a11y/teclado-embudo.spec.ts` con el estudio
  y sus ocho cuadros, afirmando que Tab 30 veces nunca sale del `role="dialog"`.
- **Severidad: media.**

### H11 · El registro de deuda y sus cifras

- **Valle hoy:** §4.9. Cinco días, nueve olas, cero filas; mapa de líneas
  caducado; criterio de rúbrica que puntúa una cadena de texto.
- **Esfuerzo:** horas.
- **Cómo se construye:** (a) poner la fila que falta con el estado real y las
  extracciones que sí ocurrieron (la barra de estado, entre ellas); (b) sustituir
  las referencias de línea del mapa por **anclas de código** (`{showSheetPackage &&`,
  `<CadStatusBar`) que no caduquen; (c) cambiar la evidencia de
  `growth.monolith-curve` de un `grep` de «8,000» a un `metric` que lea
  `scripts/cad/monolith-budget.json` y exija que el valor de
  `Layout3DEditor.tsx` sea **menor que el de la corrida anterior firmada**, con la
  serie publicada en un JSON de evidencia.
- **Cómo se verifica:** un spec que compare la última fila del registro con
  `monolith-budget.json` y falle si divergen — la regla 4 aplicada con código en
  vez de con disciplina.
- **Severidad: baja** (pero es la que hace que las demás no se pierdan).

### H12 · Sincronizar los dos textos de `gap` con su artefacto

- **Valle hoy:** §4.10.
- **Esfuerzo:** horas.
- **Cómo se construye:** los `gap` que citan cifras deben **derivarse** del
  artefacto, como ya hace `rubric.mjs` con la matriz. Un `gap` con número
  literal es un defecto por construcción; que hoy dos estén desfasados lo
  demuestra. Como mínimo, un spec `rubric.spec.mjs` que falle si un `gap`
  contiene un número que también aparece en un artefacto `metric` con otro valor.
- **Severidad: baja.**

---

## 6. La apuesta ganadora

> **El dibujo abre sin red. Con su nombre, su versión y su límite escritos al
> lado.**

Un CAD en el navegador tiene exactamente una ventaja que AutoCAD no puede
igualar sin dejar de ser AutoCAD, y no es «no instalar nada» —eso lo dice
cualquiera—: es que **el navegador ya es un almacén local con presupuesto,
transaccional y por origen**, y el producto ya tiene todas las piezas menos la
última.

Lo que ya está construido y pagado:

- Un **service worker** con política escrita y precacheo de la carcasa
  (`app/(sw)/service-worker-policy.ts`, `service-worker-source.ts`), con arnés de
  pruebas de 770 líneas.
- Un **diario de recuperación en IndexedDB** con códec, worker, cola de
  checkpoints y specs de integridad (`lib/cad/cad-recovery-journal.ts`,
  `cad-recovery-codec.ts`, `cad-recovery.worker.ts`,
  `recovery-checkpoint-queue.ts`).
- El **CAS con versiones** y una cola de un solo escritor que ya reintenta al
  volver la red (`components/cad/document-lifecycle/connectivity.ts`), con golden real
  (`e2e/real/cad-offline-multitab.spec.ts`).
- La **matriz honesta** que ya clasifica los 34 flujos y ya dice, en voz alta,
  que éste es el que falta.
- El **presupuesto de documento y memoria publicado**
  (`docs/cad/evidence/document-limits.json`).

Lo que falta es **una costura**: hoy el efecto de recuperación arranca con
`if (!open || !data || …) return`, es decir, sólo corre **después** de que el GET
del servidor haya devuelto el documento. Sin ese GET no hay contra qué comparar
el checkpoint, y el trabajo que está en la máquina no se llega a mirar.

**Qué hay que construir, concretamente:**

1. Un **caché de documentos** en IndexedDB —`lib/cad/offline/document-cache.ts`—
   con el mismo códec que el diario, que guarde el documento canónico completo +
   su `version` del CAS cada vez que una apertura o un guardado tienen éxito.
   Presupuesto declarado (p. ej. los 8 dibujos más recientes o 200 MB, lo que
   llegue antes), con desalojo LRU y el número publicado en
   `document-limits.json`.
2. Invertir el orden en `components/cad/document-lifecycle`: **primero el caché, después la
   red**. Abrir pinta el documento cacheado inmediatamente con una banda de
   estado —«Copia local del 5 de septiembre, 14:32 · versión 41 · sin conexión»—
   y la red, cuando llegue, resuelve como un `409` cualquiera: es el camino de
   CAS que **ya existe y ya está probado**, no una segunda aritmética.
3. Un **`documentPort` de sólo-caché** — la prop ya existe en
   `Layout3DEditorPlatformProps` y ya se usa para el modo demostración
   (`app/demo/DemoStudio.tsx`), así que la inyección está resuelta.
4. La **frontera visible**: mientras la copia sea local, publicar y compartir se
   deshabilitan **diciendo por qué**, y el manifiesto de la sesión offline viaja
   con el primer guardado. La matriz de capacidades cambia
   `abrir-el-dibujo` de `requiere-backend` a `degrada-y-reintenta` **y su spec lo
   obliga a demostrarlo**.

**Cómo se verifica, sin margen:** un golden en `e2e/real/` que (a) abra un
documento con API real y PostgreSQL, (b) `context.setOffline(true)`, (c) recargue
la página, (d) afirme que el lienzo pinta las mismas N entidades y que la banda
declara la fecha y la versión, (e) dibuje tres líneas, (f) vuelva la red, (g)
afirme que el servidor recibe exactamente esas tres líneas sobre la versión
correcta y que el CAS resolvió sin inventar versión. Y el número de dibujos
cacheados, medido, en `document-limits.json`.

**Por qué esto gana y no otra cosa.** AutoCAD de escritorio abre sin red pero
exige instalación, licencia y una máquina Windows: no lo abre el cliente al que
le enseñas el plano, ni el residente en su tableta, ni el proveedor. AutoCAD Web
abre desde cualquier sitio pero **exige red igual que Valle hoy**. La casilla
«abre desde cualquier navegador **y** funciona en un sótano sin señal» está
vacía en el mercado. Con las piezas que este repo ya tiene, Valle es quien menos
lejos está de llenarla — y es la única frase de esta dimensión que, dicha con su
evidencia al lado, hace que alguien elija Valle **sobre** AutoCAD en vez de
«además de».

Las otras ventajas candidatas no ganan solas: la colaboración en vivo es
paridad con AutoCAD Web; el copiloto de frases hoy ni siquiera se aplica (§4.1);
el rendimiento es una carrera que un canvas WebGL no gana contra un rasterizador
nativo de cuarenta años. Ésta sí.

---

## 7. Resumen para quien decide

| | |
| --- | --- |
| **Nota de la dimensión** | **5,5 / 10** contra AutoCAD completo |
| **Lo que está sólido** | Patrón de anfitrión (21 módulos), RSC bien usados, seis presupuestos con trinquete, decisiones medidas y no opinadas, matriz de offline ejecutable |
| **Lo que está roto hoy** | Un falso éxito visible al usuario en Ctrl+K (40 entradas), 62 ms/render de trabajo O(n), el editor sin frontera de error |
| **Lo que compone** | 18 453 líneas / 131 `useState` / 129 `useRef` en una función; registro de deuda parado cinco días; el gate de latencia mide 400 entidades |
| **Lo que ganaría** | Abrir el dibujo sin red — la única casilla del mercado que está vacía y que este repo casi tiene |

Lo primero que haría el lunes, en este orden: **(1)** cerrar o retirar el
copiloto de frases (§4.1, medio día si se retira); **(2)** memoizar las dos
derivaciones y pasar las etiquetas por prop (§4.2, dos horas, 62 ms → 0);
**(3)** subir el gate de latencia a 10 000 entidades sobre `/studio/[documentId]`
(§H1, un día) para que el punto 2 no vuelva; **(4)** borrar los 11 símbolos
muertos y bajar el trinquete en el mismo commit (§4.5). Los cuatro caben en una
semana y los cuatro dejan una cifra medida detrás.

---

*Informe escrito en español. Todas las rutas son relativas a la raíz del
monorepo. Ninguna línea de código de producto se modificó durante esta
auditoría.*
