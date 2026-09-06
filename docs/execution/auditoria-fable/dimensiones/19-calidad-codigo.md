# 19 · Calidad del código: deuda, duplicación, tipos, pruebas débiles

Auditoría externa · 2026-09-05 · árbol en `/home/user/valle-design`
Dimensión: deuda técnica, duplicación, laxitud de tipos, manejo de errores,
código muerto, ciclos, nombres que mienten y pruebas que no prueban.

Todo lo que sigue está medido sobre el árbol real con scripts de sólo lectura.
Ninguna afirmación de «falta X» se escribió sin buscar X antes.

---

## Veredicto

**Compite, y en varias medidas gana.** Esta base de código está mejor gobernada
que la mayoría de los monorepos de este tamaño: veinte `any` explícitos en
510 000 líneas, duplicación cruzada prácticamente nula, cero `TODO`/`FIXME`
reales, cero errores de lint, y siete trinquetes distintos que impiden que las
cifras empeoren en silencio. Lo que la separa de «excelente» no es desorden
repartido: es **concentración** — un archivo con el 4,2 % de las líneas del
producto y el 87 % de sus avisos de lint — y **tres huecos de instrumentación**
que hacen que los propios gates midan menos de lo que su nombre promete.

**Nota: 7 / 10.**

Los tres puntos que faltan tienen nombre:

1. `Layout3DEditor.tsx`: **una sola función React de ~17 300 líneas**
   (`:1140` → `:18453`) con 131 `useState`, 55 `useEffect` y 148 lecturas de
   `ref` durante el render.
2. **Cero medición de cobertura** en todo el repositorio, y **cero lint con
   tipos** en `apps/web` — que es donde viven las 438 000 líneas del producto.
3. **47 módulos con spec y sin ningún importador de producción**, de los cuales
   al menos dos puntúan hoy en la rúbrica.

---

## 1 · Lo que ya está construido y está bien

Empiezo por aquí porque un auditor que sólo enumera defectos miente por
omisión, y porque varias de estas cosas son mejores que lo que se ve en
empresas mucho más grandes.

### 1.1 · Disciplina de tipos: casi perfecta

| Medida | apps/web | apps/api | packages |
| --- | ---: | ---: | ---: |
| `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` | **0** | **0** | **0** |
| `any` explícito (token `: any`, `<any>`, `as any`) | 18 | 1 | 1 |
| `as any` | 3 en todo el repo | | |
| `eslint-disable` | 14 | 1 | 0 |

`strict: true` en los dos workspaces (`apps/web/tsconfig.json:8`,
`apps/api/tsconfig.json`). El API además tiene
`'@typescript-eslint/no-explicit-any': 'error'`
(`apps/api/eslint.config.mjs:31`) con la razón escrita al lado, y la única
excepción es un `.d.ts` local de `pg`.

Los 20 `any` que quedan están concentrados en tres archivos —
`lib/cad/dxf-import.ts`, `lib/cad/dxf-read-core.ts`,
`components/cad/interop/dxf.ts` — todos con `/* eslint-disable
@typescript-eslint/no-explicit-any */` en la línea 1, todos por la misma causa
real: el paquete `dxf-parser` de npm no trae tipos utilizables. Es una deuda
localizada y justificada, no dispersión.

**Esto es mejor que AutoCAD.** No es una figura retórica: una base C++ de cuatro
décadas con ObjectARX no puede ofrecer esta garantía sobre su superficie de
extensión.

### 1.2 · Duplicación: prácticamente inexistente

Detector propio de bloques repetidos (hash de ventanas deslizantes sobre líneas
normalizadas, excluyendo comentarios y llaves sueltas), sólo código de
producción:

| Ventana | Grupos duplicados distintos |
| ---: | ---: |
| 25 líneas significativas | **2** |
| 12 líneas significativas | 55 (casi todos: cabeceras de controlador Nest, `main.ts` de sondas de carga, y los cinco comandos hermanos `delete/duplicate/mirror/move/resize`) |

Los dos únicos a 25 líneas:

- `lib/cad/engine/commands/annotate-dimension-chains.ts:34-58` ↔
  `annotate-dimensions.ts:26-50`
- `packages/dwg-codec/src/objects/entities-core.ts:281-305` ↔
  `reader/database-assembly.ts:127-151`

Para 510 000 líneas eso es ruido. La factorización es real, no aparente.

### 1.3 · Los trinquetes, que son lo que de verdad protege el activo

Siete gates que sólo permiten que los números bajen. No conozco muchos repos
que tengan uno; éste tiene siete:

| Gate | Qué congela | Estado hoy |
| --- | --- | --- |
| `scripts/cad/check-monolith-budget.mjs` | líneas por archivo + `useState` del monolito | 18 453 líneas / 131 `useState`, verde |
| `scripts/check-lint-budget.mjs` | avisos de lint por regla y workspace | 197 avisos web + 292 API |
| `scripts/cad/check-command-integrity.mjs` | «hecho» vacío | 294 comandos, **0 ROJO** |
| `scripts/cad/check-handler-authorization.mjs` | handler HTTP sin barrera declarada | 24 exenciones nombradas |
| `apps/web/e2e/auditoria/manifiesto.json` | specs rojas a propósito | techo 28, sólo baja |
| `scripts/dwg/corpus-pin.json` | corpus externo anclado por hash | fail-closed |
| `docs/cad/corpus/manifest.json` + `oraculos/` | sha256 en tres artefactos a la vez | `terceros-filas.ts:128-140` |

Y el detalle que revela madurez: `check-monolith-budget.mjs` falla **también
cuando un archivo adelgaza 200 líneas y nadie baja el techo**
(`ratchetSlack: 200`), para que el manifiesto no mienta a la baja. Es la
diferencia entre un gate y un adorno.

### 1.4 · Los specs no se pueden colgar en verde

`apps/web/scripts/run-specs.mjs` corrige el fallo clásico de los specs
script-style: un `await` que nunca resuelve deja el event loop vacío, Node sale
con 0 y el runner lo daba por verde. El runner exige **imprimir algo** (`:68-74`)
y **terminar antes de 120 s** (`:33`). Además, `lib/brep/spec-support.ts:71`
introduce un piso de aserciones (`report(name, minChecks)`), con la razón
escrita: «una propiedad que no se ejecuta no prueba nada».

### 1.5 · Cero deuda anotada

`grep -rnE "(TODO:|FIXME|HACK:)"` sobre `apps/web/src`, `apps/api/src` y
`packages/*/src` devuelve **3 coincidencias**, y las tres son la *palabra* TODO
en español dentro de un comentario o el propio regex del gate
(`apps/web/src/config/production-readiness.ts:50`, que existe precisamente para
prohibir `TODO|FIXME|PENDIENTE|PLACEHOLDER|XXX` en un build de release).

### 1.6 · Ciclos de importación: dos, y los dos localizados

Grafo de imports de valor (excluyendo `import type`, que no crea ciclo en
tiempo de ejecución) sobre los 997 módulos de producción de `apps/web/src`:

```
lib/cad/document-import.ts -> lib/cad/dwg-document-bridge.ts -> lib/cad/document-import.ts
lib/cad/dwg-document-bridge.ts -> lib/cad/dwg-document-bridge-layers.ts -> lib/cad/dwg-document-bridge.ts
```

Dos, ambos en el puente DWG, ambos con arreglo de una línea (§ D-6).

### 1.7 · Manejo de errores: los `catch` mudos están contados y razonados

534 bloques `catch` en el árbol. De ellos, 118 en código de producción no hacen
nada o devuelven un valor mudo. **No es descuido**: la mayoría lleva la razón
escrita encima. El ejemplo canónico es
`apps/web/src/lib/cad/xref/xclip.ts:67-72`:

```ts
} catch {
  // Un recorte ilegible NO puede ocultar el dibujo: se ignora y se ve todo.
  // Al revés —tratarlo como «recorta todo»— haría desaparecer geometría por
  // un JSON corrupto, que es la peor forma de fallar que tiene esta orden.
  return null;
}
```

Eso no es tragar un error: es una decisión de diseño con su justificación al
lado. 27 de los 118 están dentro del monolito, que es donde sí conviene
revisarlos uno a uno.

---

## 2 · Los huecos, por lo que más duele

### H-1 · Una función React de 17 300 líneas · BLOQUEANTE

**Qué hace AutoCAD.** No aplica directamente: AutoCAD es C++ nativo. Pero la
comparación honesta sí aplica — Autodesk puede meter una función nueva en el
comando de acotar sin que nadie relea el editor entero. Aquí no.

**Qué hace Valle hoy.** `apps/web/src/components/cad/editor/Layout3DEditor.tsx`
tiene 18 453 líneas y **el componente ocupa de la 1140 a la 18453**: una sola
función. Dentro:

| Métrica | Valor |
| --- | ---: |
| `useState` (medido por el propio gate) | **131** |
| `useEffect` | 55 |
| `useCallback` | 128 |
| `useRef` | 28 |
| `import` | 178 |
| avisos de lint | **171 de los 197 del workspace (87 %)** |

El presupuesto (`scripts/cad/monolith-budget.json`) lo permite explícitamente:
`"apps/web/src/components/cad/editor/Layout3DEditor.tsx": 18454`.

**Por qué le duele al usuario.** Indirectamente pero de forma medible: el 87 %
de los avisos de lint del producto están en el archivo que dibuja. De ellos,
**148 son `react-hooks/refs`: lectura o escritura de un `ref` durante el
render.** El patrón dominante está en `:1239`:

```ts
const drawingReadOnly = readOnly || cadReviewReadOnly;
const drawingReadOnlyRef = useRef(drawingReadOnly);
drawingReadOnlyRef.current = drawingReadOnly;   // ← durante el render
```

Es el «ref espejo» usado ~148 veces para colar props y estado actuales dentro de
las devoluciones de llamada imperativas de THREE.js. Bajo React 19 con render
concurrente o `StrictMode`, un render abortado deja el ref con un valor que
**nunca se comprometió**, y la escena de THREE se dibuja con un estado que el
usuario no vio. En un CAD eso no es un parpadeo: es una entidad en el sitio
equivocado.

El progreso es real pero lento. `docs/execution/DEUDA-MONOLITO.md` registra
20 248 → 19 107 → 19 002 → 18 453 líneas en cinco campañas. La meta declarada es
**< 8 000**. Al ritmo observado (~360 líneas por campaña de media) faltan
~29 campañas.

**Cómo se construye.** El método ya está escrito en `DEUDA-MONOLITO.md` y
funciona (`CadCommandEngineHost`, `CadNavigationHost`, `CadPlotHost`,
`CadViewportRenderHost`, `palettes/paper-spaces-host.ts`). Lo que falta es
**cambiar el orden**: el registro va extrayendo *vistas* y el techo de `useState`
no baja porque las vistas no eran dueñas del estado. Hay que atacar los cuatro
controladores que el propio documento identifica (exportación DXF 4, espacios
papel ~8, versiones ~5, validación ~6 = 23 `useState` de golpe) y, al mismo
tiempo, **sustituir el patrón «ref espejo» por `useSyncExternalStore`** — el
monolito hoy tiene 0 usos de ese hook mientras sus tres anfitriones ya extraídos
lo usan.

**Cómo se verifica.** El trinquete existente, más un gate nuevo de **longitud de
función**: hoy `check-monolith-budget.mjs` mide *archivos*, y una vez el archivo
está en `allowances` la función de 17 300 líneas es invisible. Añadir a ese
mismo script un tope de líneas por función (p. ej. 400, con su propia lista de
asignaciones) hace visible la métrica que de verdad importa.

**Esfuerzo:** semanas (es la campaña permanente, no un ticket).

---

### H-2 · Cero medición de cobertura en 510 000 líneas · ALTA

**Qué hace el estándar.** Cualquier base de este tamaño publica cobertura por
línea y rama, con umbral en CI.

**Qué hace Valle hoy.** Nada, en ninguno de los tres workspaces:

- `apps/web` corre 624 specs con `node scripts/run-specs.mjs` → `tsx <spec>`.
  **No hay instrumentación de cobertura de ningún tipo.** No hay `c8`, ni `nyc`,
  ni `istanbul` en ninguna `package.json` del repo.
- `apps/api` tiene `"test:cov": "jest --coverage"` (`apps/api/package.json:23`)
  pero **sin `coverageThreshold`** y **sin aparecer en ningún job de CI**.
- `packages/*` idem.

Proxy medido a falta de cobertura real (módulo con spec hermano del mismo
nombre):

| Carpeta | módulos prod | con spec hermano | % |
| --- | ---: | ---: | ---: |
| `apps/web/src` completo | 1090 | 456 | **41,8 %** |
| `lib/cad` | 670 | 367 | 55 % |
| `components/cad` | 152 | 46 | 30 % |
| `lib/lisp` | 47 | 5 | **11 %** |
| `components/ui` | 16 | 0 | **0 %** |

**Por qué le duele al usuario.** El flujo real: alguien arregla el enganche a
punto medio en `snap-engine.ts`, todos los gates pasan, y la rama de código que
maneja polilíneas cerradas nunca se ejecutó en ningún test. Sin cobertura nadie
puede decir si eso pasó. `lib/lisp` al 11 % es el caso más caro: es la
superficie de extensión que la rúbrica puntúa con 8 puntos (`plugins`), y es
código que ejecuta guiones de terceros.

**Cómo se construye.** No hace falta cambiar de runner. `run-specs.mjs` ya
invoca `tsx` por spec; basta envolverlo:

```js
// scripts/run-specs.mjs — sustituir execFileSync(process.execPath, [tsxCli, spec])
// por execFileSync(process.execPath, [c8Cli, "--reporter=json", "--report-dir",
//   `.coverage/${slug}`, tsxCli, spec])
// y un paso final `c8 report --merge-async` sobre .coverage/*.
```

Después, un trinquete idéntico al de lint: `scripts/coverage-budget.json` con la
cobertura por carpeta, que **sólo puede subir**. Nunca un umbral global — un
umbral global se cumple probando lo fácil.

**Cómo se verifica.** `npm run check:coverage-budget` en `check:cad`; el PR que
baja la cobertura de `lib/cad/engine/` falla con el nombre de la carpeta.

**Esfuerzo:** un día para la instrumentación, varios días para poblar el
presupuesto honestamente.

---

### H-3 · `apps/web` no tiene lint con tipos: 438 000 líneas sin `no-floating-promises` · ALTA

**Qué hace el estándar.** `typescript-eslint` con `projectService` y
`recommendedTypeChecked`.

**Qué hace Valle hoy.** Asimetría exacta y verificable:

- `apps/api/eslint.config.mjs:11` → `...tseslint.configs.recommendedTypeChecked`
  con `projectService: true`. Resultado: 292 avisos `no-unsafe-*` presupuestados,
  `no-floating-promises` en `warn` y **en cero**.
- `apps/web/eslint.config.mjs` → sólo `eslint-config-next/core-web-vitals` y
  `eslint-config-next/typescript`. **Ninguna regla con tipos.** La prueba está en
  `scripts/lint-budget.json`: la sección `apps/web` no contiene ni una sola regla
  `@typescript-eslint/no-unsafe-*` ni `no-floating-promises` — porque no corren.

Lo demostré con el compilador de TypeScript directamente (programa sobre los 869
módulos de `lib/cad/`, `components/cad/` y `lib/lisp/`, buscando
`ExpressionStatement` cuyo tipo tiene `.then`). **15 promesas flotantes**, 11 de
ellas en el monolito:

```
lib/cad/render/pipeline-offthread.ts:252   tessellator(...)            ← tiene .catch, falso positivo
lib/cad/render/image-layer-three.ts:232    this.loader(...)
components/cad/dialogs/CadTakeoffDialog.tsx:336  navigator.clipboard?.writeText(csv).then(...)  ← sin catch
components/cad/editor/Layout3DEditor.tsx:3523    loadGaps()
components/cad/editor/Layout3DEditor.tsx:10524   loadVersions()
components/cad/editor/Layout3DEditor.tsx:10594   loadVersions()
components/cad/editor/Layout3DEditor.tsx:11390   repeatLastCommand()
components/cad/editor/Layout3DEditor.tsx:11391   previewCommandText(commandText)
components/cad/editor/Layout3DEditor.tsx:11410   previewCommandText(suggestion.example)
components/cad/editor/Layout3DEditor.tsx:13908   repeatLastCommand()
components/cad/editor/Layout3DEditor.tsx:13915   repeatLastCommand()
components/cad/editor/Layout3DEditor.tsx:15318   onDxfFile(f)
components/cad/editor/Layout3DEditor.tsx:15888   repeatLastCommand()
```

**Por qué le duele al usuario.** Ver D-1: `repeatLastCommand` es la acción del
botón derecho y del menú contextual, y si el `import()` dinámico del parser
falla (despliegue nuevo, chunk 404, red caída) el clic derecho no hace **nada**
y no aparece ningún aviso.

Además, `react-hooks/refs`, `set-state-in-effect`, `purity`, `immutability` y
`preserve-manual-memoization` están degradadas a `warn` en
`apps/web/eslint.config.mjs:33-38` con la razón escrita («el editor CAD extraído
del origen es anterior a ellas»). Es honesto, pero significa que las cinco
reglas del React Compiler no bloquean nada en el workspace del producto.

**Cómo se construye.** Añadir un segundo bloque al config de web con
`projectService` y las reglas con tipos en `warn`, correr
`node scripts/check-lint-budget.mjs --update` para congelar el número que salga,
y bajarlo por campaña. Es exactamente el procedimiento que ya funcionó en el
API. `no-floating-promises` en cambio debe entrar directamente en `error`: hoy
son 14 sitios reales y arreglarlos cabe en una tarde.

**Cómo se verifica.** `check:lint-budget` ya existe; la sección `apps/web` pasa
de 6 reglas a ~12.

**Esfuerzo:** un día para el config y el presupuesto; horas para las 14 promesas.

---

### H-4 · 47 módulos probados y no cableados; dos de ellos puntúan en la rúbrica · ALTA

**Qué dice la casa.** `AGENTS.md`, regla 1 de la campaña de cimientos:

> Ningún módulo cuenta por existir. […] un subsistema sin importador fuera de sí
> mismo no está implementado.

**Qué hace Valle hoy.** Grafo de imports completo de `apps/web/src` (997 módulos
de producción, excluyendo `app/` y ficheros de ruta). **47 módulos no tienen
ningún importador de producción, sólo specs.** Los que no son arnés de
evidencia:

| Módulo | Líneas | Qué es |
| --- | ---: | --- |
| `lib/cad/engine/script-runner.ts` | 365 | ejecutor `.scr` **sin interfaz**, fail-closed |
| `lib/cad/plot-sheet.ts` | 175 | hoja de ploteo (tamaños de papel + escalas) |
| `components/cad/plot/plot-sheet.ts` | 220 | *otra* hoja de ploteo |
| `lib/cad/cad-conflict-resolution.ts` | 200 | resolución de conflicto CAS |
| `lib/cad/block-edit-session.ts` | 197 | sesión de edición de bloque (BEDIT) |
| `lib/cad/primitive-edit.ts` | 180 | edición de primitivas |
| `lib/cad/layer.ts` | 149 | capas (`lib/cad/layers.ts` es el vivo) |
| `lib/cad/linetype.ts` | 124 | tipos de línea |
| `lib/cad/ellipse.ts` | 121 | elipse |
| `lib/cad/polygon-room.ts` | 132 | habitación poligonal |
| `lib/cad/annotations.ts` | 86 | anotaciones |
| `lib/qr/qr-decode.ts` | 407 | decodificación QR |
| `lib/geo/point-index.ts` | 513 | índice de puntos |

(Comprobado también contra `apps/web/scripts/`, `scripts/` y `apps/web/e2e/`:
para `block-edit-session`, `script-runner` de engine, `primitive-edit`,
`polygon-room`, los dos `plot-sheet`, `layer`, `linetype`, `ellipse`,
`annotations` y `qr-decode` el resultado es **cero importadores** en todo el
repositorio fuera de sus propios specs.)

**Los dos casos que puntúan:**

1. `command-line.scripting` [**2 puntos**] — *«SCRIPT (.scr) y variantes
   -COMANDO ejecutables **sin interfaz gráfica**»*. Su evidencia es
   `{kind:"command", name:"SCRIPT"}` + `{kind:"spec", path:
   "…/engine/script-runner.spec.ts"}`. Pero `executeCadScript`
   (`lib/cad/engine/script-runner.ts:162`) — el ejecutor *sin anfitrión*,
   el que la propia cabecera describe como «lo que convierte "se puede teclear
   un script" en "un guión de despacho se puede ejecutar en un lote"» — sólo lo
   importa `script-runner.spec.ts`. Lo que el producto ejecuta es
   `lib/cad/script-runner.ts` (`runCadScript`), que empuja renglones por la
   línea de comandos del editor: **exactamente lo que la cabecera del módulo
   huérfano dice que NO sirve**, porque un rechazo sale como mensaje y el
   ejecutor sigue empujando.
2. `layouts.plot-sheet` [**1 punto**] — *«Hoja de ploteo y adaptador de
   exportación del layout»*. Evidencia:
   `{kind:"file", path:"apps/web/src/lib/cad/plot-sheet.ts"}` + su spec. Ese
   archivo no lo importa nadie en producción (§ D-3).

**El agujero es sistémico, y es medible.** La rúbrica tiene un tipo de evidencia
`imported` que hace exactamente esta comprobación
(`scripts/cad/rubric.mjs:404-418`, «NADIE lo importa desde … (sin contar
specs)»). Se usa en **10 de 155 criterios**. Y **39 criterios (≈63 de los 271
puntos) tienen como única prueba de vida `file` + `spec`**, sin `imported`, sin
`golden` y sin `command`:

```
draw-2d.canonical[3] draw-2d.degenerate[2] modify.grips[2] dimensions.format[2]
dimensions.dxf[2] hatch.dxf[2] hatch.islands[2] hatch.pattern-table[2] mtext.dxf[2]
mtext.rich[1] layers.linetype[2] blocks.dxf[2] dxf.import[2] dxf.roundtrip[3]
dxf.xdata[1] dxf.corpus-own[1] layouts.plot-sheet[1] layouts.hatch-pattern-pdf[1]
persistence.cas[2] command-line.engine[2] xrefs.resolution[2] performance.corpus[2]
json-import.worker[2] json-import.transport[1] plugins.interpreter[1]
plugins.cad-builtins[1] plugins.sandbox[1] plugins.dcl[1] brep.topology[1]
brep.operations[2] brep.surfaces[1] brep.interop[1] modeling3d.z-roundtrip[2]
geo.crs[1] integrity.honest-rejection[1] integrity.no-silent-loss[4]
growth.additive-migration[2] recognition.no-alias-collisions[2]
recognition.linetype-shape[2]
```

**Por qué le duele al usuario.** Un despacho compra por la rúbrica y teclea
`SCRIPT` esperando el comportamiento fail-closed que el criterio promete; lo que
obtiene es el ejecutor que sigue empujando renglones tras un rechazo — el modo
de fallo que la cabecera del módulo huérfano describe como «el peor de los
posibles: la entrada del comando siguiente se cuela en el comando anterior y el
dibujo que sale no es el que nadie escribió».

**Cómo se construye.** Dos movimientos, ninguno caro:

1. **Un gate de alcanzabilidad.** `scripts/cad/check-reachability.mjs`: construye
   el grafo de imports de `apps/web/src` (resolviendo `@/`, relativos, `index.ts`
   y `new Worker(new URL(…))`), y falla si un módulo de `lib/` o `components/`
   sin spec-only-allowance carece de importador de producción. Con su
   `reachability-allowances.json` — arneses de evidencia y benchmarks declarados
   con razón, como ya se hace en `command-integrity-exemptions.json`.
2. **Aplicar `imported` a los 39 criterios.** Es un cambio de datos en
   `rubric.json`, cero código: el verificador ya existe.

Y para los dos casos concretos: o se cablea `executeCadScript` detrás de un
comando (`SCRIPTBATCH`, o `-SCRIPT` como AutoCAD), o el criterio pierde la
frase «sin interfaz gráfica».

**Cómo se verifica.** `npm run check:cad` ejecuta el gate nuevo; `rubric.mjs`
pone en rojo el criterio cuyo módulo nadie importa.

**Esfuerzo:** un día el gate, horas el cambio de rúbrica, varios días cablear o
retirar los 13 módulos huérfanos de producto.

---

### H-5 · Tres tablas de tamaños de papel, divergentes, y la que puntúa es la huérfana · ALTA

**Qué hace AutoCAD.** Una tabla de papeles por dispositivo de trazado, con las
medidas ISO/ANSI exactas.

**Qué hace Valle hoy.** Tres tablas independientes:

| Papel | `lib/cad/paper-space.ts:24` (**viva**) | `lib/cad/plot-sheet.ts:20` (huérfana, **puntúa**) | `components/cad/plot/plot-scale.ts:16` |
| --- | --- | --- | --- |
| A4 | 210 × 297 | 210 × 297 | 297 × 210 (apaisado) |
| letter | 215.9 × 279.4 | **216 × 279** | `Letter` 279.4 × 215.9 |
| tabloid | 279.4 × 431.8 | **279 × 432** | — |
| ArchD | — | — | 914.4 × 609.6 |
| escalas | 18 valores (`CAD_SHEET_SCALES`, incluye 150/750/1500/2000/5000) | **13** (`CAD_STANDARD_SCALES`, sin ésos) | 15 (`NICE_SCALES`) |

Tres vocabularios distintos para lo mismo (`width/height` vs `w/h` vs `w/h`),
dos convenciones de orientación, dos capitalizaciones de `letter`/`Letter`, y
**errores de precisión reales**: 216 ≠ 215.9 mm y 432 ≠ 431.8 mm. En un CAD, 0.2
mm en el borde de la lámina es la diferencia entre un cajetín que cabe y uno que
el trazador recorta.

De las tres, `components/cad/plot/plot-scale.ts` sólo se toca por su *tipo*:
`Layout3DEditor.tsx:181` importa `type PlotLayout` y nada más. Y
`lib/cad/plot-sheet.ts` no la importa nadie.

**Por qué le duele al usuario.** Hoy, poco: la tabla viva es la correcta. Mañana,
mucho: la próxima persona que necesite «los tamaños de papel» encontrará tres
y elegirá una al azar, o peor, extenderá la equivocada — que es la que el
criterio de la rúbrica señala como evidencia.

**Cómo se construye.** Un módulo `lib/cad/paper/sizes.ts` con **una** tabla en
milímetros exactos, orientación *portrait* canónica y un helper
`paperSize(id, orientation)`. `paper-space.ts` lo consume, `plot-sheet.ts` se
borra o se reduce a un re-export, `plot-scale.ts` se queda sólo con
`PlotLayout` y `NICE_SCALES` (o también consume la tabla). El criterio
`layouts.plot-sheet` apunta al módulo nuevo y le añade `imported`.

**Cómo se verifica.** Spec que afirma A0–A4 + letter + tabloid contra ISO 216 /
ANSI, y un gate de una línea: `grep -c "PAPER_SIZES\|CAD_PAPER_SIZES\|CAD_SHEET_PAPERS"`
debe dar 1 definición.

**Esfuerzo:** horas.

---

### H-6 · El gate del sistema de diseño mide presencia, no adopción, y ve el 9 % del árbol · MEDIA

**Qué dice la casa.** `AGENTS.md`: *«La regla de oro: ningún hex fuera de
`globals.css`. Ningún tamaño fuera de la escala.»* Y: *«La [regla] que importa no
es una prohibición: asserta que los tokens están **en uso**.»*

**Qué hace Valle hoy.** `apps/web/src/components/ui/design-system.spec.ts` tiene
siete reglas. Dos fallan en decir lo que su nombre promete:

- **Regla 4 (ningún hex en un componente), `:102-108`** — se aplica sólo a
  `components/ui/` y `components/brand/`. Eso son **18 de los 192 `.tsx`** del
  producto: el 9 %. Fuera del ámbito, `components/cad/` tiene **41 hex sueltos**
  (`Layout3DEditor.tsx:1011-1013` define `ROSE = 0xf43f5e`, `AMBER = 0xf59e0b`,
  `SELECT = 0x22d3ee` — colores de interfaz, no ACI de dibujo) más 61 literales
  `0x……` de THREE.js. El comentario de la regla justifica la exclusión diciendo
  que los ACI del dibujo son «datos del plano»; eso es cierto para `#ff0000`,
  pero `#f43f5e` es rose-500 de Tailwind, y `CadDesignReportDialog` conserva
  `#34d399 / #fbbf24 / #f87171` — deuda que el propio `DEUDA-MONOLITO.md`
  reconoce por escrito.
- **Regla 5 (el sistema se consume), `:124-151`** — la aserción es
  `mustBeUsed.filter((token) => !all.includes(token))` sobre la concatenación de
  todo el árbol. **Un solo uso de cada token pasa la regla.** Es una prueba de
  presencia disfrazada de prueba de adopción, y es justo la regla que la
  cabecera del archivo declara como «la que de verdad importa».

La adopción real, medida:

| Token del sistema | usos | Escape equivalente | usos |
| --- | ---: | --- | ---: |
| `rounded-control` + `rounded-card` | 239 | `rounded-xl/lg/md` | **254** |
| `shadow-floating` | 12 | `shadow-2xl` / `shadow-xl` | **25** |
| `border-border` | 366 | — | |
| `text-muted-foreground` | 646 | — | |

Es decir: el sistema **sí se consume** (la campaña de diseño funcionó), pero
convive con más escapes de radio que usos de token, y el gate no puede verlo.

**Por qué le duele al usuario.** Radios y elevaciones inconsistentes en la misma
paleta; y sobre todo, el gate da una falsa sensación de seguridad al siguiente
que edite `components/cad/`.

**Cómo se construye.**

1. Regla 4: ampliar el ámbito a **todo `src/**/*.tsx`** con una lista de
   exenciones nominal para los módulos que sí pintan color de plano
   (`entity-three.ts`, `render/`, minimapa), igual que
   `handler-authorization-exemptions.json`.
2. Regla 5: cambiar `!all.includes(token)` por un **umbral por token**
   (`usos(token) >= N`) congelado en un JSON que sólo sube — el mismo trinquete
   que lint y monolito.
3. Regla nueva: `rounded-(xl|lg|md|full)` y `shadow-(sm|md|lg|xl|2xl)` en
   `.tsx` con presupuesto que sólo baja, hoy 254 y 25.

**Cómo se verifica.** El propio spec, que ya corre en `npm test`.

**Esfuerzo:** un día para las reglas; varios días para bajar los presupuestos.

---

### H-7 · Los 105 «goldens» no son evidencia de sistema · MEDIA

**Qué hace AutoCAD.** No aplica; AutoCAD no tiene backend.

**Qué hace Valle hoy.** `apps/web/playwright.config.ts:10-21` lo dice sin
adornos:

> GOLDENS (default): […] los fixtures de `e2e/fixtures/cad-v1-backend.ts` la
> stubbean en la frontera de red. Hermético: sin NestJS ni base de datos.

Son **105 archivos, 2184 aserciones, contra un stub de 759 líneas**. El
full-stack real es `e2e/real/`: **16 archivos**. Y `AGENTS.md` ya avisa: *«Los
goldens con mock son caracterización, no evidencia full-stack.»*

Es honesto y está declarado, pero la proporción importa para quien invierte:
**87 % del esfuerzo de e2e prueba el navegador contra un contrato congelado a
mano.** Si el stub y el Nest real divergen, los 105 siguen verdes.

**Por qué le duele al usuario.** El modo de fallo típico: el API cambia la forma
de un `409` de CAS, el stub no, y el editor pierde el trabajo del usuario en un
conflicto que los goldens no ven. CI sí corre `e2e/real/` contra PostgreSQL
(`.github/workflows/ci.yml:883-893`), lo cual mitiga mucho — pero sólo para los
16 recorridos que existen ahí.

**Cómo se construye.** Un **spec de contrato del stub**: recorrer las rutas que
`cad-v1-backend.ts` intercepta y validarlas contra el OpenAPI autoritativo de
`packages/contracts/specs/design-api.v1.yaml` (forma de request y de response,
códigos de estado). Si el stub responde algo que el contrato no permite, falla.
Eso convierte 105 caracterizaciones en 105 pruebas con red de seguridad, sin
tocar una sola de ellas.

**Cómo se verifica.** `npm run check:e2e-stub-contract` en `check:cad`.

**Esfuerzo:** un día.

---

### H-8 · 28 defectos confirmados aparcados en rojo, 2 «bloquean el trabajo» · MEDIA

**Qué hace Valle hoy.** Esto es, otra vez, una **buena práctica**: `e2e/auditoria/`
contiene 28 specs que reproducen defectos confirmados, están excluidas de la
suite a propósito (`playwright.config.ts:47`), y su lista sólo puede encoger
(`manifiesto.json: "techo": 28`), vigilada por
`scripts/cad/check-auditoria-manifest.mjs`. Cuando un defecto se arregla, la
prueba **se gradúa a `e2e/golden/`**. No conozco otro repositorio que gestione
así su backlog de defectos.

El problema es el número. Distribución por impacto declarado:

| impacto | nº |
| --- | ---: |
| `bloquea_el_trabajo` | **2** |
| `molesta_mucho` | 15 |
| `molesta_poco` | 8 |
| `arnes` (no reproducen defecto) | 3 |

Los dos bloqueantes, citados del manifiesto:

- `tresd.spec.ts` — *«Con el SCU apoyado en la fachada, una línea de dos clics se
  va al suelo sin decir nada […]. Y no se puede dibujar un rectángulo en la
  fachada: sólo LINE se declara espacial.»*
- `refutacion-scu-raton.spec.ts` — *«el punto del ratón bajo un SCU inclinado sale
  del plano del suelo y no del plano de trabajo.»*

**Por qué le duele al usuario.** Un SCU sobre una fachada es el flujo normal para
dibujar alzados; que la línea se vaya al suelo *sin decir nada* es el modo de
fallo silencioso que la regla 3 de la casa prohíbe.

**Cómo se construye.** No es un hueco de calidad de código: es trabajo de
producto con la prueba ya escrita. Lo que sí falta como **calidad**: el
manifiesto no tiene fecha de compromiso por entrada. Añadir un campo
`campanaObjetivo` y hacer que `check-auditoria-manifest.mjs` avise (no falle)
cuando una entrada `bloquea_el_trabajo` lleva más de N campañas sin graduarse.

**Cómo se verifica.** El gate existente, con el campo nuevo.

**Esfuerzo:** horas para el campo; varios días por defecto de los 17 graves.

---

### H-9 · El artefacto de integridad de comandos guarda sólo agregados · MEDIA

**Qué hace Valle hoy.** `scripts/cad/check-command-integrity.mjs` corre los 294
comandos del registro y da **0 ROJO**. Excelente. Pero el artefacto que se
comprometió en el árbol (`scripts/…:95-100`) es:

```js
const payload = {
  generatedBy: "…",
  total: report.total,
  verdicts: report.verdicts,          // agregados
  exemptions: [...],
};
```

y su contenido real es:

```json
{"total":294,"verdicts":{"muta":83,"delegado":48,"informa":22,
 "honesto-limitado":132,"no-concluyente":9,"ROJO":0}}
```

Dos consecuencias:

1. **Un intercambio pasa desapercibido.** Si `TRIM` deja de mutar y pasa a
   «honesto-limitado» mientras `FILLET` hace el camino inverso, los totales no
   cambian y el gate queda verde. El diff no nombra ningún comando.
2. **132 de 294 comandos (45 %) pasan declarando su límite, no produciendo
   efecto.** Es legítimo bajo la regla 2 de la casa («o termina con efecto, o
   declara su límite»), y es infinitamente mejor que fingir. Pero es la cifra
   que un comprador debe conocer, y hoy sólo se puede ver corriendo la sonda.

**Cómo se construye.** Añadir `outcomes: report.outcomes.map(o => ({command:
o.command, verdict: o.verdict}))` al payload — 294 líneas de JSON ordenadas
alfabéticamente. El diff entonces dice *qué* comando cambió de veredicto.

**Cómo se verifica.** El propio `--check` del script, que ya compara con
`JSON.stringify`.

**Esfuerzo:** horas.

---

### H-10 · El piso de aserciones existe en `lib/brep/` y en ningún otro sitio · MEDIA

**Qué hace Valle hoy.** 624 specs en `apps/web`, escritos en tres estilos:

| Estilo | nº de specs |
| --- | ---: |
| `node:assert` directo | 573 |
| arnés propio (`const ok = (cond, m) => …` declarado en el propio archivo) | **246** |
| `lib/brep/spec-support.ts` (con `report(name, minChecks)`) | 31 |

Es decir, **246 specs reimplementan el mismo contador de aserciones de tres
líneas**. Es la única duplicación masiva que encontré en el árbol, y no es
inocente: cada copia decide por su cuenta si cuenta, si acumula fallos, y si
exige un mínimo. Sólo el arnés de `brep` exige un mínimo, y de los ~30
`report(...)` sólo 30 pasan un `minChecks` explícito; el resto usa el **default
de 1**, que no protege de nada.

El riesgo concreto: un spec cuyo cuerpo queda detrás de una guarda que hoy es
falsa (`if (!fixture) { console.log("ok"); }`) ejecuta cero aserciones, imprime,
sale con 0 y `run-specs.mjs` lo da por **verde** — el runner sólo exige salida y
terminación (`:68-74`).

**Cómo se construye.** Promover `lib/brep/spec-support.ts` a
`apps/web/src/lib/testing/spec-support.ts` (mismo código, ya probado) y hacer
que `run-specs.mjs` exija que **la línea final del spec declare el número de
aserciones ejecutadas** con un formato reconocible (p. ej.
`✔ <nombre>: <N> aserciones verdes`), fallando si `N === 0`. Los 246 arneses
locales se migran uno a uno, o simplemente se les exige emitir esa línea.

**Cómo se verifica.** El propio runner: `status: "sin-aserciones"` junto a los
tres estados que ya distingue (`failed`, `timeout`, `silent`).

**Esfuerzo:** un día el runner + el arnés compartido; varios días la migración.

---

### H-11 · La frontera de aislamiento por tenant no está en el tipo ni en un gate · MEDIA

**Qué hace Valle hoy.** `apps/api/src/common/tenant/tenant-scoped.repository.ts`
tiene una cabecera ejemplarmente honesta (`:16-34`):

> NO cubiertos (delegan a Repository y salen SIN filtro de tenant):
> `findOneOrFail`, `findOneByOrFail`, `existsBy`, `countBy`, `findAndCountBy`,
> `update`, `delete`, `softDelete`, `restore`, `increment`, `decrement`, `sum`,
> `average`, `maximum`, `minimum` y todo `createQueryBuilder`.

Y añade: *«esta cabecera llegó a prometer dos [helpers] que nunca existieron»*.
Eso es integridad.

El problema es de **tipos y de gate**, no de intención:

- `TenantScopedRepository<T> extends Repository<T>` tiene **exactamente la misma
  firma** que `Repository<T>`. Nada en el compilador distingue una lectura
  scopeada de un `update` sin scope.
- `tenantFilter()` (`:112-124`) **falla abierto** cuando la entidad no tiene
  columna de tenant (`if (!prop) return null`) y cuando el modo no es `strict`.
- `mergeWhere(where: unknown): unknown` (`:126`) tira los tipos justo en el punto
  donde importan.
- Existe `check:authz` para handlers HTTP (24 exenciones nombradas), pero **no
  existe ningún gate equivalente para la capa de repositorio**. Hay **31
  `createQueryBuilder`** en `apps/api/src` fuera de specs.

Hoy la disciplina se cumple: `cad-documents.repository.ts:311` y `:690` escriben
`tenant_id` a mano en el `where` del `update`. Pero nada obliga al siguiente.

**Cómo se construye.**

1. **Tipo de marca.** `type TenantScoped<T> = Repository<T> & { readonly __tenantScoped: unique symbol }`,
   y sobreescribir los 15 métodos no cubiertos con una firma que exija
   `where` incluyendo la propiedad de tenant (o que devuelva `never` y obligue a
   pasar por `unsafeUnscoped()` con nombre explícito).
2. **Gate.** `scripts/api/check-tenant-scope.mjs`: cada `createQueryBuilder` y
   cada `update|delete|softDelete` sobre un repositorio de entidad con columna
   `tenant_id` debe tener `tenant_id` en el mismo bloque, o estar en
   `tenant-scope-exemptions.json` con razón — copia literal del patrón de
   `check-handler-authorization.mjs`, que ya funciona.

**Cómo se verifica.** `npm run check:cad` (que ya llama a `check:authz`).

**Esfuerzo:** un día el gate; varios días el tipo de marca.

---

### H-12 · Los 39 criterios de rúbrica que se prueban contra sí mismos · MEDIA

**Qué hace Valle hoy.** El caso mejor construido del repo es
`lib/cad/verification/terceros-*.spec.ts`: cuatro suites que miden capas,
bloques, texto y cota/sombreado sobre ficheros DXF que este proyecto no escribió
(`bjnortier/dxf`, MIT), contrastando contra `ezdxf 1.4.4` congelado y anclado por
sha256 en **tres artefactos a la vez** (`terceros-filas.ts:128-140`). Eso es un
oráculo externo de verdad, y es la mejor pieza de verificación del árbol.

Pero el mecanismo que la publica (`publicaRenglon`, `:188-224`) termina en:

```ts
eq(renglon, comprometido!, "el renglón […] recalculado no es el comprometido");
```

Es decir, **la mitad del renglón es caracterización**: el `veredicto`, el
`porQueEseVeredicto` y el `loQueNoSeMide` son prosa que se compara consigo misma.
Un comportamiento equivocado pero estable pasa para siempre. Los números sí
están anclados a ezdxf; los juicios no lo están a nada.

Medida global: **50 specs** de `apps/web` leen un artefacto comprometido de
`docs/`; **13** se apoyan en un oráculo independiente (`ezdxf`,
`verification/oracle.ts`, fuerza bruta). La proporción es 4:1 a favor de la
caracterización.

**Por qué le duele al usuario.** No hoy — la disciplina de anclaje es fuerte.
Pero es la deuda que se cobra a los tres años: cuando nadie recuerde por qué el
veredicto decía `servible_hoy`, y el artefacto siga diciéndolo.

**Cómo se construye.** Separar el renglón en dos objetos: `medido` (números
contra el oráculo, comparados con `deepStrictEqual`) y `dictamen` (prosa, con
`fecha` y `firmadoPor`), y hacer que el gate **exija refrescar el dictamen**
cuando `medido` cambie o cuando pasen N días — el mismo `manualMaxAgeDays` que
`rubric.json` ya define para la evidencia `manual`.

**Cómo se verifica.** El propio spec, más una fila en `rubric.spec.mjs`.

**Esfuerzo:** un día.

---

### H-13 · `templates.ts`: 4 982 líneas de datos en el camino crítico · BAJA

**Qué hace Valle hoy.** `apps/web/src/lib/cad/templates.ts` son 4 982 líneas de
datos de plantilla que no se pueden diferir porque
`lib/cad/engine/index.ts → CAD_LAYOUT_COMMANDS → CAD_LAYOUT_TEMPLATES`, y el
motor de comandos es núcleo del estudio. Está diagnosticado en
`DEUDA-MONOLITO.md` con el detalle exacto de por qué el `import()` fácil no
funciona.

**Cómo se construye.** Lo que el documento ya dice: diferir los **manejadores
pesados**, uno a uno, detrás de un `import()` en su `run`. Nada que añadir; lo
menciono para que no se pierda del inventario.

**Esfuerzo:** varios días (campaña propia).

---

## 3 · Defectos concretos, con fichero y línea

### D-1 · `repeatLastCommand` devuelve `false | Promise<void>` y nadie lo espera

`apps/web/src/components/cad/editor/Layout3DEditor.tsx:11378-11387`

```ts
const repeatLastCommand = () => {
  const raw = repeatableCadCommand(commandLog);
  if (!raw) {
    toast.error("No hay un comando aplicado para repetir.", "Comando CAD");
    return false;                       // ← síncrono
  }
  setCommandText(raw);
  setCommandHistoryCursor(-1);
  return previewCommandText(raw);       // ← Promise<void>  (previewCommandText es async, :11307)
};
```

Los cuatro llamantes lo ignoran como si fuera síncrono: `:11390`
(`interpretCommand`), `:13908` y `:13915` (menú del botón derecho, acciones
`repeat` y `enter`), `:15888` (ítem «Repetir último comando» del menú
contextual).

`previewCommandText` empieza con
`const { parseCadCommand, … } = await loadCadNlCommands();` (`:11311`), un
`import()` dinámico. Si ese chunk no llega —despliegue nuevo con hash de chunk
cambiado, red caída, CSP— la promesa **rechaza sin manejador**: el clic derecho
no repite nada y **no aparece ningún toast**. El usuario concluye que el botón
derecho no funciona.

**Arreglo:** declarar `const repeatLastCommand = async (): Promise<boolean> =>`,
devolver `false` en el camino corto, y en los cuatro llamantes
`void repeatLastCommand().catch(() => toast.error("No se pudo repetir el
comando.", "Comando CAD"))`. Un `no-floating-promises` en `error` (H-3) lo
habría impedido.

---

### D-2 · El plano de fondo DXF se trunca en silencio y luego dice «cargado»

`apps/web/src/components/cad/interop/dxf.ts:86` y
`apps/web/src/components/cad/editor/Layout3DEditor.tsx:10432-10479`

```ts
const MAX_ENTITIES = 40000; // guardrail against pathological files     (:21)
…
for (const e of entities) {
  const pts = entityToPoints(e);
  if (pts) raw.push(pts);
  if (raw.length >= MAX_ENTITIES) break;      // ← corta y no cuenta nada   (:86)
}
```

Y `entityToPoints` sólo entiende `LINE`, `LWPOLYLINE`, `POLYLINE`, `CIRCLE` y
`ARC`; todo lo demás cae en `default: return null` (`:69-70`) — `TEXT`, `MTEXT`,
`INSERT`, `SPLINE`, `ELLIPSE`, `HATCH`, `DIMENSION`, es decir, la mayor parte de
un plano real. **Ninguna de las dos pérdidas se cuenta ni se declara.**

El llamante, tras eso, muestra: `toast.success("Plano DXF cargado de fondo.",
"Plano DXF")` (`:10478`). Las advertencias que sí se muestran (`:10426-10431`)
vienen de `importDxfPrimitives`, que es la **importación editable**, no el
fondo.

Peor: `dxfSnapRef.current = dxfSnapPoints(dxfModel, meta)` (`:10476`) construye
los puntos de enganche **a partir del modelo truncado**. Un dibujante que calca
el plano del cliente pierde el OSNAP sobre todo lo que quedó fuera de las 40 000
polilíneas, sin saberlo.

Esto contradice directamente la regla 3 de `AGENTS.md` («ninguna capacidad se
anuncia sin evidencia del límite […] manifiesto de pérdidas») y el criterio
`integrity.no-silent-loss` [4 puntos].

**Arreglo:** que `parseDxf` devuelva
`{ polylines, width, height, truncated: number, skippedByType: Record<string, number> }`
y que el llamante emita un aviso con el conteo, además de añadir el renglón al
manifiesto de pérdidas que ya existe (`lib/cad/dxf-export-loss-manifest.ts`).

---

### D-3 · `lib/cad/plot-sheet.ts` puntúa un criterio y no lo importa nadie

`docs/competitive/rubric.json` · criterio `layouts.plot-sheet` [1 punto]:

```json
"evidence":[{"kind":"file","path":"apps/web/src/lib/cad/plot-sheet.ts"},
            {"kind":"file","path":"apps/web/src/lib/cad/layout-export-adapter.ts"},
            {"kind":"spec","path":"apps/web/src/lib/cad/plot-sheet.spec.ts"}]
```

`grep -rn "cad/plot-sheet\|from \"./plot-sheet\"" apps/web/src apps/web/e2e
apps/web/scripts scripts apps/api` devuelve **exactamente dos líneas**, y las
dos son specs:

```
apps/web/src/components/cad/plot/plot-sheet.spec.ts:1: import { plotSheetModel } from "./plot-sheet";
apps/web/src/lib/cad/plot-sheet.spec.ts:10: } from "./plot-sheet";
```

(`layout-export-adapter.ts`, el otro fichero del criterio, **sí** está cableado
—`Layout3DEditor.tsx` y `dxf-document-export.ts`—; el defecto es del primero.)

**Arreglo:** ver H-5 (una sola tabla) + añadir `{"kind":"imported"}` al criterio.

---

### D-4 · `executeCadScript`: el ejecutor fail-closed que nadie llama

`apps/web/src/lib/cad/engine/script-runner.ts:162`

Único consumidor en todo el repositorio: `engine/script-runner.spec.ts`
(13 llamadas). El criterio `command-line.scripting` [2 puntos] promete «SCRIPT
(.scr) y variantes -COMANDO ejecutables **sin interfaz gráfica**» y no comprueba
alcanzabilidad.

La cabecera del propio módulo (`:6-13`) explica exactamente por qué el ejecutor
que **sí** está cableado (`lib/cad/script-runner.ts`) no cumple esa promesa:

> Si el motor rechaza un renglón […] el rechazo sale como un MENSAJE al diálogo,
> no como una excepción, y el ejecutor sigue empujando renglones. El resultado es
> el peor de los posibles: la entrada del comando siguiente se cuela en el
> comando anterior y el dibujo que sale no es el que nadie escribió.

**Arreglo:** cablear `executeCadScript` detrás de un comando (`-SCRIPT`, como el
prefijo `-` de AutoCAD para las variantes sin diálogo) o retirar la frase «sin
interfaz gráfica» del criterio. Cualquiera de las dos, pero no ninguna.

---

### D-5 · La regla 5 del sistema de diseño es una tautología en la práctica

`apps/web/src/components/ui/design-system.spec.ts:139-151`

```ts
const all = withText.map(({ text }) => text).join("\n");
const unused = mustBeUsed.filter((token) => !all.includes(token));
assert.deepEqual(unused, [], "Hay tokens del sistema con CERO usos…");
```

**Un solo uso** de cada uno de los 12 tokens en cualquiera de los 192 `.tsx` deja
la regla verde. La cabecera del archivo la presenta como *«la aserción que de
verdad importa, y la única que no es una prohibición»*. Hoy afirma presencia, no
adopción. (Ver H-6 para el arreglo y las cifras reales de adopción, que por
suerte son buenas.)

---

### D-6 · Dos ciclos de importación en el puente DWG, ambos con arreglo de una línea

**Ciclo A** — `apps/web/src/lib/cad/dwg-document-bridge.ts:54-57`:

```ts
import {
  MAX_DWG_IMPORT_BYTES,
  type DocumentImportReport,
} from "./document-import";
```

`MAX_DWG_IMPORT_BYTES` **no es de** `document-import.ts`: se define en
`document-import-validation.ts:49` y `document-import.ts:47` sólo la re-exporta.
Y `document-import.ts:25` importa `dwgNeutralDatabaseToCadDocument` del puente.
El ciclo es gratuito.

**Arreglo:** `import { MAX_DWG_IMPORT_BYTES } from "./document-import-validation";`
Una línea, ciclo eliminado.

**Ciclo B** — `dwg-document-bridge.ts:61` importa `mapLayers` de
`dwg-document-bridge-layers.ts`, que en su `:20` importa
`DWG_BRIDGE_LOSS_CODES` de vuelta (definido en `dwg-document-bridge.ts:107`).
Hoy no revienta porque el uso es dentro de funciones, pero es una TDZ latente si
el bundler aplana a CJS.

**Arreglo:** mover `DWG_BRIDGE_LOSS_CODES` a
`lib/cad/dwg-bridge-loss-codes.ts` y que los dos lo importen de ahí.

---

### D-7 · `tenantFilter()` falla abierto por diseño y `mergeWhere` es `unknown`

`apps/api/src/common/tenant/tenant-scoped.repository.ts:112-129`

```ts
private tenantFilter(): FindOptionsWhere<T> | null {
  const tenant = this.tenantCtx?.getTenantId() ?? null;
  const prop = this.tenantProp();
  if (!prop) return null;                       // ← entidad sin tenant_id: sin filtro
  if (!tenant) {
    return this.strict
      ? ({ [prop]: IsNull() } as unknown as FindOptionsWhere<T>)
      : null;                                    // ← modo legacy: sin filtro
  }
  return { [prop]: tenant } as unknown as FindOptionsWhere<T>;
}

private mergeWhere(where: unknown): unknown {   // ← los tipos se caen aquí
```

`strict` es `false` por defecto (`:57`, `this.strict = options.strict === true`).
Con `strict` desactivado y sin tenant en contexto, la lectura sale **sin
filtro**. La cabecera lo declara («DEFAULT (legacy) mode»), y hay una razón de
adopción aditiva; pero es un fallo-abierto por defecto en el punto más caro del
sistema y no hay ningún gate que impida que un provider nuevo se olvide de
`{ strict: true }`. Ver H-11.

---

### D-8 · Aviso menor: efecto que se vuelve a registrar en cada autosave

`apps/web/src/components/cad/editor/Layout3DEditor.tsx:12437-12442`

```ts
useEffect(() => {
  return registerCadUiHandler("layer-manager", () => { openViewMenu(); return true; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [data]);
```

`data` cambia de referencia en cada autosave (el propio código lo dice en
`:7785-7789`: *«autosave cambia la referencia sin cambiar el plano»*). Este
efecto por tanto des-registra y re-registra el manejador del gestor de capas en
cada guardado automático. No es un fallo visible, pero el `eslint-disable`
oculta que la dependencia correcta es ninguna: el manejador no lee `data`.

**Arreglo:** `}, []);` con `openViewMenu` estabilizado (ya es una función del
cierre; envolverla en `useCallback` o moverla a un ref de evento).

---

## 4 · La apuesta ganadora

> **La ficha de veracidad por comando, publicada dentro del producto y
> verificada en cada commit.**

AutoCAD tiene ~1 200 comandos y ningún usuario puede saber cuáles de ellos
fallan en silencio sobre su geometría concreta. Se descubre perdiendo una tarde.
Autodesk no puede cambiar eso: envía una versión al año, su código es cerrado, y
su suite de pruebas nunca será un artefacto público.

Valle **ya tiene el 80 % de la máquina construida** y no la está usando como
producto:

- `scripts/cad/check-command-integrity.mjs` ejecuta los **294 comandos reales**
  del registro en cada `check:cad` y hoy da **0 éxitos falsos**, con 9 exenciones
  nombradas y razonadas.
- El registro ya distingue cinco veredictos: `muta` (83), `delegado` (48),
  `informa` (22), `honesto-limitado` (132), `no-concluyente` (9).
- `rubric.mjs` ya sabe comprobar que un módulo tiene importador
  (`imported`, `:404-418`).
- `check-ribbon-coverage.mjs` y `ui-command-reach.mjs` ya comprueban que cada
  comando es alcanzable desde la interfaz.

La apuesta es cerrar el círculo en tres pasos:

1. **Persistir el veredicto por comando** (H-9): 294 filas en el artefacto en vez
   de seis agregados.
2. **Añadir el gate de alcanzabilidad** (H-4) y aplicar `imported` a los 39
   criterios que hoy sólo se prueban con `file` + `spec`. Eso convierte «lo
   escribimos» en «se puede llegar».
3. **Enseñarlo en el producto.** En el estudio, `?` sobre cualquier comando abre
   su ficha: *qué hace, qué NO hace, cuándo se verificó por última vez, y contra
   qué*. Generada del mismo JSON que el gate, con el sha del commit al lado.
   Y una página pública `/veracidad` con las 294 filas.

Por qué eso hace que alguien prefiera Valle:

- Un dibujante que ha perdido un plano por un comando que dijo «Hecho» sin hacer
  nada entiende inmediatamente el valor de «este comando declara su límite y aquí
  está el límite».
- Un despacho que evalúa la migración deja de tener que creerse un folleto: lee
  294 filas verificadas hoy.
- Y para el propio equipo es el gate que impide la regresión que más caro sale:
  el módulo escrito, probado, y nunca conectado — de la que este informe
  documenta **47 casos**, dos de ellos cobrando puntos.

Es la única cosa de esta dimensión que un CAD de navegador puede hacer y un CAD
de escritorio no: **publicar su propia verdad, recalculada en cada despliegue.**

---

## 5 · Resumen de cifras medidas

| Métrica | Valor |
| --- | ---: |
| Líneas TS/TSX totales (web + api + packages) | ~576 000 |
| `apps/web/src` producción / specs | 292 558 / 145 288 |
| Módulos de producción en `apps/web/src` | 1 090 |
| Specs: web / api / packages / e2e goldens / e2e real | 624 / 130 / 47 / 105 / 16 |
| Módulos con spec hermano | 41,8 % |
| `any` explícitos en todo el repo | **20** |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | **0** |
| `eslint-disable` | 17 |
| `as unknown as` (prod / spec) | 48 ficheros / 130 ficheros |
| Errores de lint (web + api) | **0** |
| Avisos de lint web / api | 197 / 292 |
| … de los cuales en `Layout3DEditor.tsx` | **171 (87 %)** |
| `react-hooks/refs` en el monolito | **148** |
| Bloques `catch` / que tragan en prod | 534 / 118 |
| `TODO:` / `FIXME` / `HACK:` reales | **3** (dos son el regex del gate) |
| Ciclos de importación en tiempo de ejecución | **2** |
| Grupos duplicados ≥25 líneas (prod) | **2** |
| Módulos probados y no cableados | **47** |
| Criterios de rúbrica probados sólo con `file`+`spec` | **39 de 155 (≈63 pts)** |
| Comandos ejecutados por el arnés de integridad / ROJO | 294 / **0** |
| … que pasan declarando su límite | **132 (45 %)** |
| Specs e2e aparcadas en rojo (techo) | **28** |
| Cobertura de código medida | **ninguna** |
