# Valle Design — Ola 2: 10 sesiones de trabajo en paralelo

Corte: `main` en `8be49a5`. DWG sigue fuera (lo hace Codex).

**Cómo usarlo:** NEW → pega el PREÁMBULO + el prompt de una sesión → deja que
trabaje hasta que fusione → NEW → siguiente.

---

## Qué pasó en la ola 1, medido

Nueve fusiones entraron en `main` en unas horas. Esto es lo que dejaron, y lo
que NO dejaron. Todo comprobado contra el árbol actual.

**Lo que sí se ganó:**

- El motor pasó de 19 a **63 comandos**. `engine/index.spec.ts` lo imprime en
  cada corrida: quedan **80 de 125 alias de acad.pgp sin implementar** (eran 104).
- Esquema 4 vivo: `point`, `xline`, `ray`, `solid`, `wipeout`, `image`,
  `attdef`, `table`, con adaptador cada uno.
- Reflexión cerrada en los cuatro caminos, con anclas absolutas.
- Un kernel B-rep completo bajo `lib/brep/` (34 archivos: topología, NURBS,
  booleanas, STEP/IGES).
- Un intérprete AutoLISP completo bajo `lib/lisp/` (sandbox, DCL, plugins).
- Un pipeline de render por tiles bajo `lib/cad/render/` (21 archivos).
- Paletas de propiedades, capas, estilos y DSETTINGS.

**Lo que NO se ganó, y es el titular de esta ola:**

> **Tres subsistemas enteros se construyeron y NINGUNO es alcanzable por un
> usuario.** `grep` sobre todo `apps/web/src`: nada fuera de `lib/cad/render/`
> importa el pipeline nuevo; nada fuera de `lib/lisp/` importa el intérprete;
> nada fuera de `lib/brep/` importa el kernel. Se han unido a la lista de
> módulos huérfanos que la ola 1 venía a vaciar.

Consecuencia concreta y comprobable: **el editor sigue renderizando con el
pipeline viejo.** `Layout3DEditor.tsx` importa `entity-three`, no `render/scene`.
El zoom de 29 segundos a 100k sigue siendo lo que ve un cliente. El benchmark
que dice 23 ms mide un camino que el producto no ejecuta.

**El estado honesto, con números de hoy:**

| Medida | Valor | Cómo se comprueba |
| --- | --- | --- |
| Comandos en el motor | 63 | `npx tsx apps/web/src/lib/cad/engine/index.spec.ts` |
| Alias de acad.pgp pendientes | 80 de 125 | idem |
| Monolito | 23.316 líneas, 153 `useState` | `node scripts/cad/check-monolith-budget.mjs` |
| Puntero por el motor | NO | `Layout3DEditor.tsx:134` importa `./cad-command` |
| Pipeline de render enchufado | NO | nadie importa `lib/cad/render/` |
| AutoLISP enchufado | NO | nadie importa `lib/lisp/` |
| B-rep enchufado | NO | nadie importa `lib/brep/` |
| Esquema 4 en DXF | NO | `dxf-export.ts` no menciona ninguno de los 8 tipos |
| Benchmark de render | Node, `report-only` | `docs/cad/evidence/cad-render-benchmark-100k.json` |
| i18n del editor | 1 de 58 `.tsx` usa `useTranslations`; el monolito, 0 | `grep -c useTranslations` |
| Archivos golden | 42, con TRES numerados 45 y huecos en 46-48 | `ls apps/web/e2e/golden/` |
| Matriz de brechas | Desactualizada: dice B-rep y AutoLISP «Ausente» | `docs/competitive/autocad-2027-gap-matrix.md` |

**Los 69 comandos que un dibujante teclea y aquí no existen** (derivado de
`alias-table.ts` menos el registro): ADCENTER, AREA, ATTEDIT, BEDIT, BLEND,
BLOCK, BOUNDARY, COLOR, DDEDIT, DIM, DIMALIGNED, DIMANGULAR, DIMARC,
DIMBASELINE, DIMCONTINUE, DIMDIAMETER, DIMEDIT, DIMLINEAR, DIMORDINATE,
DIMRADIUS, DIMSTYLE, DIST, DRAWORDER, DSETTINGS, DXFIN, DXFOUT, EXPORT,
GRADIENT, GROUP, HATCH, IMPORT, INSERT, LAYER, LAYOUT, LEADER, LINETYPE, LIST,
LTSCALE, LWEIGHT, MASSPROP, MLEADER, MLEADERSTYLE, MSPACE, MTEXT, MVIEW,
OPTIONS, OSNAP, OVERKILL, PAGESETUP, PAN, PLOT, PROPERTIES, PSPACE, PURGE,
REGEN, REGENALL, REGION, STYLE, TABLESTYLE, TEXT, TOLERANCE, TOOLPALETTES,
UCSMAN, UNGROUP, UNITS, VIEW, WBLOCK, XATTACH, XBIND, XCLIP, XREF, ZOOM.

Léelo despacio: **HATCH, MTEXT, TEXT, INSERT, BLOCK, LAYER, PLOT, ZOOM y las
nueve cotas no se pueden teclear.** Las entidades existen en el modelo y se
dibujan por botones del monolito; lo que no existe es la puerta por la línea de
comandos, que es como trabaja un profesional.

---

## Reparto por dueño de archivo

Es lo único que evita que se pisen. **T1 es la única con permiso sobre
`Layout3DEditor.tsx`. T7 es la única con permiso sobre `cad-document.ts`.
T5 es la única con permiso sobre `packages/contracts` y la regeneración del SDK.**

| Sesión | Rama | Dueña de | Prohibido |
| --- | --- | --- | --- |
| T1 Encendido | `claude/cad-encendido-editor` | `Layout3DEditor.tsx`, `entity-three.ts`, `cad-command.ts`, `components/line-engineering/*` | `engine/commands/*`, `dxf-*`, `cad-document.ts` |
| T2 Anotación | `claude/cad-anotacion` | `engine/commands/annotate-*`, `dimension-*.ts`, `hatch-*.ts` | monolito, `dxf-*`, `cad-document.ts` |
| T3 Bloques | `claude/cad-bloques-xref` | `block.ts`, `cad-xrefs.ts`, `engine/commands/block-*` | monolito, `dxf-*`, `cad-document.ts` |
| T4 DXF | `claude/cad-dxf-esquema4` | `dxf-*.ts` | monolito, `engine/*`, `cad-document.ts` |
| T5 Trazado | `claude/cad-trazado` | `paper-space.ts`, `engine/commands/view-*`, `plot/*`, **`packages/contracts` + SDK** | monolito, `dxf-*`, `cad-document.ts` |
| T6 LISP | `claude/cad-lisp-enchufado` | `lib/lisp/*`, `components/cad/lisp/*` | monolito, `lib/cad/*` |
| T7 Sólidos | `claude/cad-solidos` | `lib/brep/*`, **`cad-document.ts`**, `solid3d-*adapter.ts`, `engine/commands/solid-*` | monolito, `dxf-*`, `lib/cad/render/*` |
| T8 Rendimiento | `claude/cad-rendimiento` | `e2e/performance/*`, `render-benchmark.ts`, `benchmark/corpus.ts` | todo lo demás |
| T9 Rúbrica | `claude/cad-rubrica` | `docs/competitive/*`, `scripts/cad/rubric*` | código de producto |
| T10 Utilidades | `claude/cad-utilidades` | `engine/commands/inquiry-*`, `engine/commands/script-*`, `unit-format.ts` | monolito, `dxf-*`, `cad-document.ts` |

**Roce previsto, todo mecánico:**
- `engine/index.ts` (72 líneas) — T2, T3, T5, T7 y T10 añaden una línea de
  descriptor cada una. Conflictos de una línea.
- `scripts/cad/monolith-budget.json` — cualquiera que extraiga.
- `entity-three.ts` — T7 necesita un gancho de ≤20 líneas para `solid3d`.
  T1 es la dueña; T7 lo pide en el PR y T1 lo mete, o T7 lo deja tras bandera.

---
---

# PREÁMBULO — va al principio de CADA prompt

```
## El producto

Valle Design es un CAD 2D web que compite con AutoCAD. Monorepo npm workspaces +
turbo en /home/user/valle-design:

- apps/web — Next.js 16, React 19, three.js. El editor.
- apps/api — NestJS 11 + TypeORM + PostgreSQL 16.
- packages/contracts — OpenAPI 3.1.
- packages/design-sdk — GENERADO desde el OpenAPI. No se edita a mano JAMÁS.

Estado real a día de hoy, medido, sin adornos: 63 comandos tecleables, 80 de 125
alias de acad.pgp todavía sin implementar, 42 archivos golden de Playwright que
corren en Chromium y Firefox contra NestJS + PostgreSQL reales, un componente de
23.316 líneas con 153 `useState`, y TRES subsistemas completos —el pipeline de
render, el intérprete AutoLISP y el kernel B-rep— que están construidos, probados
y que NADIE IMPORTA. El editor sigue renderizando con el pipeline viejo y el
puntero sigue yendo a la máquina heredada de `cad-command.ts`.

## Arquitectura que tienes que conocer antes de tocar nada

**El documento canónico.** `apps/web/src/lib/cad/cad-document.ts` (esquema 4)
define la unión `CadEntity`: line, polyline (con `bulge`), circle, arc, ellipse,
spline NURBS, mtext, hatch asociativo, dimension (7 tipos), mleader, insert,
point, xline, ray, solid, wipeout, image, attdef, table. Más entidades heredadas
(box, station, connector, text) que conviven y que NO debes romper.

**El registro de adaptadores.** `entity-runtime.ts` expone `CAD_ENTITY_REGISTRY`
con un adaptador por entidad: renderer, hitTester, grips, snaps, properties,
bounds, commands.transform. Añadir una entidad significa añadir su adaptador.

**Una sola ruta de mutación.** Todo cambio va como `CadEntityCommand[]` y se
aplica con `commitNativeCommands`: un lote, un `commitChange`, UN paso de
deshacer. Si escribes una segunda ruta que llame a `commitChange` por su cuenta,
estás rompiendo la propiedad central del producto.

**El motor de comandos.** `lib/cad/engine/`. Un comando es una máquina de estados
PURA: `begin(context)` devuelve el primer paso, `step(state, input, context)` el
siguiente, y cuando termina emite `CadEntityCommand[]`. No toca React ni three.
Lee `engine/command-types.ts` y `engine/commands/draw-basics.ts` antes de
escribir un comando. El registro es `CAD_COMMAND_REGISTRY_V2` en `engine/index.ts`.

**La transformada afín.** `transform2d.ts` tiene la afín 2x3 canónica.
`CadEntityTransform` admite `translation`/`rotationDeg`/`scale`/`origin` (el
vocabulario histórico, con comportamiento congelado BIT A BIT) más `mirror`,
`scaleXY` y `affine`. Helpers: `cadTransformPoint3`, `cadTransformVector3`,
`cadTransformIsReflecting`, `cadTransformAngleBase`, `cadTransformScaleFactor`.
Todo adaptador nuevo debe preguntarse qué hace bajo `cadTransformIsReflecting`.

## Los gates. Todos verdes antes de abrir el PR

npm ci
npm run check:cad          # contrato OpenAPI=SDK=Nest + frontera legacy + presupuesto
npm run typecheck --workspace=web
npm test                   # API jest + runner tsx de web + SDK
npm run lint --workspace=web && npm run lint:check --workspace=valle-design-api
npx turbo run build
npm run benchmark:cad:smoke --workspace=web
npx tsx apps/web/e2e/golden/cad-acceptance-journey.check.ts
cd apps/web && npx playwright test e2e/golden --project=chromium

## Nueve cosas que este repositorio te va a hacer si no las sabes

1. TODA spec nueva debe imprimir algo por stdout. `apps/web/scripts/run-specs.mjs`
   trata una spec silenciosa como FALLIDA. Termina siempre con un `console.log`
   que diga qué se verificó.

2. Hay un TRINQUETE de tamaño: `scripts/cad/check-monolith-budget.mjs`. Un archivo
   nuevo no puede pasar de 800 líneas; los presupuestados SÓLO pueden encoger.
   También vigila el número de `useState` del monolito (techo actual: 153). Si tu
   cambio engorda un archivo, la salida correcta es EXTRAER, no subir el techo.
   `--allow-growth` existe, pero si lo usas explícalo en el PR.

3. `tsc --noEmit` NO detecta ciclos de importación, y ya rompieron el producto.
   `entity-runtime` importa los adaptadores; un adaptador que le pida de vuelta un
   VALOR (no un tipo) revienta al cargar con «Cannot access X before
   initialization». Los tipos se borran al compilar y no cuentan. Quien lo cazó
   fue `benchmark:cad:smoke`, porque ejecuta código en vez de mirarlo. CÓRRELO.

4. Los goldens con `expect(backend.snapshot().version).toBe(1)` son sensibles a la
   carga: el autosave tiene debounce de 2 s. Si fallan tests DISTINTOS en cada
   corrida y todos pasan con `--workers=1`, es carga de máquina, no tu cambio. No
   "arregles" nada sin confirmarlo primero en serie, y contrastando contra main.

5. Una propiedad de ida y vuelta SE CUMPLE DE FORMA VACÍA si el código nunca toca
   el campo: aplicar la identidad dos veces también devuelve el original. Una spec
   de reflexión de este repo estuvo verde con CERO reglas implementadas. Toda
   propiedad necesita además ANCLAS ABSOLUTAS que digan qué valor concreto sale.

6. **Construir un módulo no es entregarlo.** La ola 1 dejó tres subsistemas
   completos que nadie importa. Antes de dar una fase por terminada, corre
   `grep -rn "tu-modulo" apps/web/src --include=*.ts --include=*.tsx` y comprueba
   que alguien FUERA de tu carpeta lo llama. Si no, no lo has entregado.

7. Disciplina CAS: toda escritura lleva `expectedCadDocumentVersion`; >1 MB va por
   la ruta gzip/blob; un 409 se resuelve, jamás se sobrescribe.

8. Nunca escribas la cadena `/line-engineering` ni el identificador `rawApiFetch`
   fuera de `apps/web/src/lib/cad/legacy/` y `apps/web/src/lib/apiFetch.ts`. Hay un
   gate que falla si lo haces.

9. Ningún endpoint `/v1/cad/*` nuevo, SALVO que tu prompt te lo autorice
   explícitamente. El gate de contrato exige igualdad de conjuntos entre OpenAPI,
   SDK generado y router Nest, y regenerar el SDK produce diffs enormes que
   bloquean a las otras nueve sesiones.

## Módulos ya escritos, probados, y sin llamar

Antes de escribir nada nuevo, busca si ya existe: `lib/cad/render/*` (pipeline
por tiles completo), `lib/lisp/*` (AutoLISP completo), `lib/brep/*` (kernel
B-rep completo), `array.ts`, `divide-measure.ts`, `geom-trim.ts`, `spline.ts`,
`ellipse.ts`, `linetype.ts`, `block.ts`, `layer.ts`, `unit-format.ts`,
`primitive-edit.ts`, `polygon-room.ts`, `cad-conflict-resolution.ts`.

## Numeración de goldens

Hay TRES archivos numerados 45 y huecos en 46, 47 y 48. Antes de numerar el tuyo,
haz `ls apps/web/e2e/golden/` y coge un hueco. Si arreglas la colisión, dilo.

## Cómo trabajar

Ve en INCREMENTOS COMMITEABLES. No acumules seis horas de cambios sin commitear:
si algo se tuerce pierdes el rastro de qué lo rompió. Commit por pieza coherente,
con los gates en verde en cada uno.

Cuando encuentres un defecto que no venías a arreglar, decide: si es del camino
que tocas, arréglalo y dilo; si no, anótalo en el PR. No lo dejes mudo.

Si algo queda a medias, dilo EN EL CÓDIGO, en el commit y en el PR. Es preferible
un rechazo explícito («sólo se admiten LINE por ahora; se designó ARC») a un
silencio que parece que funcionó.

## Protocolo de fusión — tu trabajo no termina hasta que esté en main

1. Crea tu rama desde `main` actualizado:
   `git fetch origin main && git checkout -B <RAMA> origin/main`
2. Trabaja en incrementos, commiteando.
3. Antes de abrir el PR: `git fetch origin main` y rebasa o mergea main encima.
   Hay otras 9 sesiones fusionando; si tu rama es vieja, el PR nace con conflictos.
4. Vuelve a correr TODOS los gates después de rebasar.
5. Abre el PR (draft) con cuerpo que explique QUÉ cambia y POR QUÉ, no un listado
   de archivos. Si hay una decisión no obvia, argúmentala.
6. Espera CI. Son 4 checks; el E2E tarda ~25 min y corre Chromium y Firefox.
7. Si CI falla: diagnostica y arregla. No lo dejes rojo.
8. Con CI en verde: quita el draft y fusiona con squash.
9. Si al fusionar hay conflicto con otra sesión, resuélvelo tú y vuelve a correr
   los gates.
```

---
---

# T1 — El editor usa por fin lo que ya construimos

```
[PEGA AQUÍ EL PREÁMBULO COMPLETO]
Rama: claude/cad-encendido-editor

## Tu misión

Eres la sesión más importante de esta ola, y la única con permiso sobre
`apps/web/src/components/line-engineering/Layout3DEditor.tsx`.

Hay un pipeline de render por tiles COMPLETO y probado en `lib/cad/render/`
—21 archivos: `tile-index.ts`, `line-batch.ts`, `text-atlas.ts`,
`tessellation-cache.ts`, `render-scheduler.ts`, `tessellate.worker.ts`,
`scene.ts`, `pipeline.ts`— y **nadie lo importa**. Compruébalo tú:

    grep -rn "cad/render/" apps/web/src --include=*.ts --include=*.tsx | grep -v "^apps/web/src/lib/cad/render/"

Devuelve vacío. El editor sigue usando `entity-three.ts`. O sea: el zoom de 29
segundos a 100k que el benchmark dice haber arreglado SIGUE VIVO en el producto,
porque el camino que se midió no es el que se ejecuta.

Y el puntero sigue yendo a la máquina heredada. `Layout3DEditor.tsx:134` importa
`./cad-command`, y el comentario de `:6133-6142` lo dice con todas las letras:
«De momento sólo por teclado: el puntero sigue yendo a la máquina heredada de
`cad-command.ts`. Es deliberado y no un a medias — enrutar el puntero exige la
banda elástica y el cursor vivo». Esa deuda te toca a ti.

## FASE 1 — Enciende el pipeline nuevo

Cablea `lib/cad/render/scene.ts` al viewport, detrás de una bandera de
preferencia con el pipeline viejo como respaldo. La bandera existe para poder
volver atrás en producción, no para dejarlo apagado: **el valor por defecto al
terminar tu trabajo tiene que ser el pipeline nuevo.**

Lo que se conserva intacto: `buildCadInsertBatches` y su shader instanciado,
`CadSpatialIndex` para selección, y `scenePoint` con el mapeo del mundo a XZ
(`y` es elevación). NO reestructures eso.

Lo que tienes que comprobar y que el benchmark de Node NO comprobó —lo dice él
mismo en su campo `notMeasured` de
`docs/cad/evidence/cad-render-benchmark-100k.json`:

- GPU, llamadas de dibujo reales, composición del navegador y FPS.
- El coste de subir atributos a la GPU.
- **El atlas de texto no entró en la corrida**, porque en Node no hay canvas.
  O sea que `text-atlas.ts` NUNCA se ha ejecutado de verdad. Espera bugs ahí.

El corpus del benchmark tampoco ayuda: su `entityMix` es 49.870 líneas, 24.966
círculos y 25.164 arcos, y **cero** polilíneas, hatches, mtext, cotas e inserts.
Si tu cableado se cae con un MTEXT, nadie lo habría sabido.

El orden de dibujo es semántico: `modelSpace.entityIds` determina qué tapa a qué.
Se preserva escribiendo la profundidad en `gl_Position.z`. Si lo pierdes, los
sombreados empiezan a tapar la geometría que rellenan y no lo verás en un dibujo
pequeño.

## FASE 2 — El puntero entra en el motor

Hoy los 63 comandos son sólo de teclado. Con el ratón manda `cad-command.ts`
(162 líneas). Es el mayor salto de percepción que le queda al producto: un CAD en
el que dibujar con el ratón y dibujar con el teclado son dos motores distintos se
siente roto aunque los dos funcionen.

Enruta los eventos de puntero a `CadCommandEngineHost` como `CadCommandInput`.
Necesitas, y no son opcionales:

- **Banda elástica**: la previsualización viva entre el último punto confirmado y
  la posición del cursor, con la geometría real del comando (no una línea
  genérica: un ARC en curso muestra el arco).
- **Cursor vivo**: mira `snap-engine.ts`, los 14 modos OSNAP ya funcionan. El
  marcador del snap y su tooltip tienen que seguir al cursor a 60 FPS sin pasar
  por React en cada movimiento.
- **Entrada dinámica**: las cajas de coordenadas junto al cursor, con Tab para
  saltar entre campo de distancia y de ángulo.
- **Menú contextual del botón derecho** con las palabras clave del paso actual.
  El motor ya las expone en su `prompt`.

Regla dura: cuando el motor tenga un comando activo, `cad-command.ts` no recibe
nada. Nada de dos máquinas escuchando el mismo clic. Si un comando heredado no
tiene equivalente en el motor, enrútalo al viejo EXPLÍCITAMENTE y con una lista
blanca que se pueda leer, no por omisión.

## FASE 3 — Baja el monolito

23.316 líneas y 153 `useState`. El trinquete sólo deja que bajen.

Mientras cableas, extrae. El patrón está probado cuatro veces: mira
`components/cad/studio/viewport-hints.tsx` y `draft-toolbar.tsx`. Y para el
estado, `components/cad/command-line/use-command-engine.ts` +
`command-engine-host.ts`: controlador imperativo fuera de React con
`useSyncExternalStore` y una instantánea estable por identidad — si devuelves un
objeto nuevo en cada lectura, entra en bucle infinito de renders.

Objetivo declarado: bajar de 22.000 líneas y de 140 `useState`. Si no llegas,
dilo en el PR con el número al que llegaste.

## Cómo se prueba

- Los 42 archivos golden siguen verdes. Varios hacen clic en coordenadas y
  esperan tocar algo: si el render o el picking cambian, se enteran.
- Golden nuevo: dibujar una polilínea CON EL RATÓN, con snap a un extremo
  existente, cerrar con la palabra clave, y afirmar el DOCUMENTO resultante.
  Es la prueba de que las dos entradas producen la misma geometría.
- Golden nuevo: abrir un documento con MTEXT, hatch e inserts y afirmar que se
  dibujan con el pipeline nuevo (expón un contador de diagnóstico por
  `data-testid`, como hace `cad-native-document-count`).
- Una prueba de que la bandera vuelve al pipeline viejo y el dibujo sigue siendo
  el mismo.

## Prohibido

`lib/cad/engine/commands/*`, `dxf-*.ts`, `cad-document.ts`, `lib/cad/render/*`
(eres su consumidora, no su dueña: si necesitas un cambio ahí, hazlo mínimo y
dilo en el PR).
```

---
---

# T2 — La anotación se puede teclear

```
[PEGA AQUÍ EL PREÁMBULO COMPLETO]
Rama: claude/cad-anotacion

## Tu misión

El modelo tiene `hatch` asociativo, `mtext`, `dimension` con 7 tipos y `mleader`,
con sus adaptadores. Lo que no existe es **la puerta**: ninguno de estos se puede
teclear. Compruébalo corriendo el inventario:

    npx tsx apps/web/src/lib/cad/engine/index.spec.ts

De los 80 alias pendientes, estos son tuyos: HATCH, GRADIENT, BOUNDARY, TEXT,
MTEXT, DDEDIT, STYLE, DIM, DIMLINEAR, DIMALIGNED, DIMANGULAR, DIMRADIUS,
DIMDIAMETER, DIMARC, DIMORDINATE, DIMBASELINE, DIMCONTINUE, DIMEDIT, DIMSTYLE,
LEADER, MLEADER, MLEADERSTYLE, TOLERANCE, TABLESTYLE.

Son veinticuatro, y son los que separan un dibujo de un plano. Un plano sin
cotas no se puede construir.

## FASE 1 — Texto

TEXT (una línea) y MTEXT (párrafo con el editor en sitio). DDEDIT para reeditar.
STYLE para los estilos de texto — el documento ya tiene la sección `styles` con
las cinco familias, y la ola 1 dejó el gestor de estilos en
`components/cad/palettes/`. Tú pones el comando; la paleta ya existe.

MTEXT necesita códigos de control (`\P` salto, `\L`/`\l` subrayado, `\S` apilado
para fracciones y tolerancias, `\f` fuente, `\C` color, `\H` altura). Sin `\S` no
se puede escribir una tolerancia, que es la mitad del texto de un plano mecánico.

## FASE 2 — Las nueve cotas

DIMLINEAR, DIMALIGNED, DIMANGULAR, DIMRADIUS, DIMDIAMETER, DIMARC, DIMORDINATE,
DIMBASELINE, DIMCONTINUE. Más DIMEDIT y DIMSTYLE.

Todas ASOCIATIVAS: `associative-dimension.ts` ya existe y funciona. La cota
guarda a qué geometría se enganchó y se recalcula cuando esa geometría se mueve.
Una cota que no se actualiza al estirar la pieza es peor que no tener cota,
porque miente con autoridad.

BASELINE y CONTINUE encadenan desde la cota anterior: necesitan saber cuál fue la
última, que es estado de sesión, no del documento. Ponlo en el contexto del
motor, no en un módulo global.

**Trampa de reflexión:** una cota espejada NO invierte su texto. El valor medido
es una magnitud. Pero su `textRotation` y el lado del que sale la línea de
referencia SÍ cambian. La ola 1 arregló esto en `dimension-entity-adapter.ts`;
lee cómo lo hizo antes de emitir cotas nuevas, y escribe anclas absolutas.

## FASE 3 — Sombreado

HATCH con selección de contorno por punto interior Y por selección de objetos.
GRADIENT y BOUNDARY. Detección de islas con las cuatro reglas de AutoCAD (Normal,
Exterior, Ignorar, Ninguna).

El motor poligonal ya existe. Lo que falta y es lo difícil: **contornos con
curvas**. Un contorno con arcos y splines hay que teselarlo con una tolerancia
que dependa de la escala, y la asociatividad tiene que sobrevivir a que el arco
cambie de radio.

Los valores por defecto correctos son ángulo 45 y el espaciado del renderizador,
no 0 y 1. Si emites otra cosa, materializas un patrón que no se parece al que se
dibuja.

## FASE 4 — Directrices y tolerancias

LEADER, MLEADER, MLEADERSTYLE, TOLERANCE (el marco de control geométrico, con sus
símbolos GD&T). TABLESTYLE para el estilo de tabla, cuya entidad ya entró con el
esquema 4.

## Cómo se prueba

Cada comando con specs en Node: camino feliz Y rechazos. Un DIMANGULAR sobre dos
líneas paralelas tiene que decir por qué no puede, no callarse.

Para las asociativas: mueve la geometría de referencia y afirma que la cota
cambió su valor medido. Con anclas absolutas: qué número exacto sale.

Golden nuevo (coge un hueco: 46, 47 o 48): teclear DIMLINEAR sobre dos extremos,
guardar, reabrir, mover uno de los extremos, y afirmar que el texto de la cota
cambió. Afirma el DOCUMENTO, no el aspecto.

## Límite de alcance

NO toques `cad-document.ts` (T7 es su dueña), ni los `dxf-*.ts` (T4), ni el
monolito (T1). Tus comandos se alcanzan tecleándolos, que es justamente lo que
vienes a arreglar.

Roce previsto: `engine/index.ts`, una línea.
```

---
---

# T3 — Bloques que se comportan como bloques, y referencias externas

```
[PEGA AQUÍ EL PREÁMBULO COMPLETO]
Rama: claude/cad-bloques-xref

## Tu misión

`block.ts` existe, probado y sin llamar. `cad-xrefs.ts` existe. `professional-
blocks.ts` resuelve inserts y la ola 1 le arregló la reflexión. Lo que no existe
es el flujo de trabajo: BLOCK, WBLOCK, INSERT, ATTEDIT, XREF, XATTACH, XBIND,
XCLIP, ADCENTER, GROUP, UNGROUP, PURGE. Once de los 80 alias pendientes.

Un bloque es la unidad de reutilización de un CAD. Sin BLOCK e INSERT tecleables,
cada puerta de un plano se dibuja a mano otra vez.

## FASE 1 — Bloques estáticos, bien hechos

BLOCK (define desde una selección, con punto base), INSERT (con escala X/Y/Z,
rotación y matriz), WBLOCK (exporta la definición), y BASE.

INSERT tiene que aceptar escala NEGATIVA. La ola 1 arregló que el espejo llegara
al contenido de los bloques y que el signo sobreviviera a DXF; tu comando no
puede volver a perderlo. Escribe una spec con ancla absoluta para
`scale: {x:-1, y:1, z:1}`.

ATTDEF ya es una entidad del esquema 4. Lo que falta es ATTEDIT y el diálogo de
atributos al insertar: cuando un bloque con atributos se inserta, hay que pedir
sus valores. Y los atributos POSICIONADOS (no el `Record<string,string>` viejo)
tienen que moverse con el bloque.

## FASE 2 — Grupos y limpieza

GROUP, UNGROUP, y la selección por grupo. PURGE (definiciones sin usar, capas
vacías, estilos huérfanos), con su previsualización de qué se va a borrar.
OVERKILL lo hace T10; no lo toques.

## FASE 3 — Referencias externas

XREF, XATTACH (attach vs overlay, que se comportan distinto al anidar), XBIND
(insert vs bind), XCLIP (con contorno rectangular y poligonal, e inversión),
y el gestor de xrefs con recarga, descarga y resolución de rutas.

Ruta relativa vs absoluta vs «buscar»: es lo que hace que un proyecto abra en
otra máquina o no. Guarda las tres y resuelve en ese orden, y **di en la interfaz
cuál se usó**, porque cuando falla, el dibujante necesita saber por qué.

Xrefs anidadas: un xref que referencia otro xref. Detecta ciclos ANTES de
resolver, o cuelgas el editor.

## FASE 4 — DesignCenter

ADCENTER: navegar por bloques, capas, estilos y layouts de OTROS documentos de la
organización y arrastrarlos al actual. Es un lector, no un editor: sólo copia
definiciones.

## Lo que NO entra, y dilo en el PR

**Bloques dinámicos (BEDIT, parámetros y acciones) quedan fuera de esta ola.**
Necesitan una extensión del esquema del documento, y `cad-document.ts` es de otra
sesión en esta ronda. Un bloque dinámico a medias es peor que uno estático
honesto: el usuario tira de un grip esperando que la puerta cambie de anchura y
no pasa nada. Deja BEDIT sin registrar y anota en el PR que es la siguiente ola.

## Cómo se prueba

- Definir un bloque, insertarlo tres veces con escalas y rotaciones distintas,
  guardar, reabrir, y afirmar que las tres instancias resuelven a la geometría
  correcta. Con anclas absolutas, no sólo con «hay tres inserts».
- Un xref con ruta relativa que se resuelve, otro con ruta rota que falla
  DICIÉNDOLO, y uno cíclico que se rechaza sin colgarse.
- PURGE que no borra lo que sí se usa. Ésta es la que evita un desastre.

## Límite de alcance

NO toques `cad-document.ts` (T7), `dxf-*.ts` (T4), ni el monolito (T1).
Roce previsto: `engine/index.ts`, una línea.
```

---
---

# T4 — El DXF deja de perder la mitad del esquema 4

```
[PEGA AQUÍ EL PREÁMBULO COMPLETO]
Rama: claude/cad-dxf-esquema4

## Tu misión

La ola 1 metió ocho tipos nuevos en el documento —`point`, `xline`, `ray`,
`solid`, `wipeout`, `image`, `attdef`, `table`— y **ninguno se exporta a DXF**.
Compruébalo:

    grep -c "xline\|wipeout\|attdef\|\"point\"" apps/web/src/lib/cad/dxf-export.ts

Devuelve cero. Y `dxf-export.ts` tampoco menciona `lossManifest` ni
`unsupportedEntities`, así que lo primero que tienes que averiguar y DECIR en el
PR es si esos tipos se pierden en silencio o si algo los declara. Si se pierden
callando, eso es lo más grave de tu sesión: el `lossManifest` es una
característica de primera clase de este producto precisamente para que exportar
nunca mienta.

Es una regresión de confianza: un dibujante pone una directriz de referencia
(XLINE), un enmascaramiento (WIPEOUT) y una imagen de fondo, exporta a DXF para
mandárselo al cliente, y llegan tres cosas menos sin que nadie avise.

## FASE 1 — Di la verdad antes de arreglar nada

Primer commit, y va solo: que exportar un documento con los ocho tipos produzca
un `lossManifest` completo y honesto. Con su spec. Aunque todavía no exportes
nada, el usuario tiene que saber qué se queda fuera.

Esto es entregable por sí mismo y no depende del resto.

## FASE 2 — Los ocho tipos, por su código DXF real

- `point` → POINT (10/20/30), con PDMODE/PDSIZE para el estilo.
- `xline` → XLINE (10 punto base, 11 vector director).
- `ray` → RAY (10 origen, 11 vector).
- `solid` → SOLID (10-13, y OJO: el cuarto vértice va en orden de reloj de arena,
  no en orden de polígono; es la trampa clásica de esta entidad).
- `wipeout` → WIPEOUT, que es un IMAGE degenerado con su definición de
  contorno. Necesita su entrada en la tabla de objetos.
- `image` → IMAGE + IMAGEDEF + IMAGEDEF_REACTOR + la variable ACAD_IMAGE_DICT.
  Es la más laboriosa: la imagen vive en un diccionario, no suelta.
- `attdef` → ATTDEF (con sus banderas 70: invisible, constante, verificable,
  preestablecido) y ATTRIB al resolver un insert.
- `table` → ACAD_TABLE. Si el coste es desproporcionado, decláralo en el
  `lossManifest` con su razón y NO lo dejes mudo.

## FASE 3 — La importación, simétrica

Cada tipo que exportas tiene que volver a entrar. Y la ida y vuelta se prueba
con ANCLAS ABSOLUTAS: exportar → importar → afirmar coordenadas concretas.
Recuerda la lección de la ola 1: una prueba de ida y vuelta pasa de forma vacía
si el código no toca el campo.

Al comparar ángulos, hazlo MÓDULO 360: el importador devuelve (-180,180] vía
`projectedAngle` y el runtime normaliza a [0,360), así que un 270 vuelve como
-90 sin que nada esté mal.

## FASE 4 — Fidelidad de lo que ya existía

Con el esquema 4 cerrado, ataca lo que la matriz de brechas marca P0:
`docs/competitive/autocad-2027-gap-matrix.md` dice que falta corpus autorizado
diverso y que el round-trip masivo no está demostrado. Monta un corpus de
documentos grandes y comprueba que la ida y vuelta es estable, no sólo posible.

## OJO CON EL PRESUPUESTO

`dxf-cad-document.ts` está en 1.141 líneas, `dxf-export.ts` en 1.002 y
`dxf-import.ts` en 1.086 — los tres con asignación exacta en el trinquete, y el
trinquete sólo deja que bajen. Vas a añadir ocho tipos: **planifica la extracción
desde el primer commit**, por ejemplo un módulo por familia de entidad. Si
descubres esto a mitad, reescribes.

## Límite de alcance

NO toques `cad-document.ts` (T7), `engine/*` (T2, T3, T5, T7, T10) ni el
monolito (T1). Tú lees el documento y escribes DXF; no cambias ni el uno ni los
comandos.
```

---
---

# T5 — De la pantalla al papel

```
[PEGA AQUÍ EL PREÁMBULO COMPLETO]
Rama: claude/cad-trazado

## Tu misión

`paper-space.ts` existe (916 líneas) y hay publicación PDF con jsPDF. Lo que no
existe es el camino que recorre un dibujante todos los días: ZOOM, PAN, VIEW,
REGEN, REGENALL, LAYOUT, MVIEW, MSPACE, PSPACE, PAGESETUP, PLOT. Once de los 80
alias pendientes, y son los últimos cinco minutos de cada jornada de trabajo.

**Eres la única sesión autorizada a tocar `packages/contracts` y a regenerar el
SDK.** Úsalo con cabeza: cada endpoint nuevo produce un diff enorme en
`packages/design-sdk/src/generated/`, y el gate exige igualdad de conjuntos entre
OpenAPI, SDK y router Nest. Si lo rompes, bloqueas a las otras nueve.

## FASE 1 — Navegación tecleable

ZOOM con todas sus opciones (Todo, Centro, Dinámico, Extensión, Previo, Escala,
Ventana, Objeto), PAN, VIEW (guardar y restaurar vistas con nombre), REGEN y
REGENALL.

`lib/cad/view/view-controller.ts` ya gestiona las dos cámaras y expone
`pixelsPerUnit`. No escribas una segunda noción de vista: enchúfate a ésa.

ZOOM Previo necesita una pila de vistas. Acótala (diez es lo habitual) o es una
fuga con otro nombre.

## FASE 2 — Presentaciones y ventanas gráficas

LAYOUT (crear, copiar, renombrar, borrar, plantilla), MVIEW (rectangular,
poligonal, desde objeto, activar/desactivar), MSPACE y PSPACE.

Lo que hace que esto sirva de verdad: **escala de ventana bloqueable** (1:50,
1:100…) y **congelar capas por ventana**. La paleta de capas de la ola 1 ya tiene
el congelado por viewport; tú pones el comando y la ventana que lo consume.

Escala anotativa: un texto de 2,5 mm tiene que medir 2,5 mm en el papel sea cual
sea la escala de la ventana. Sin eso, cada cambio de escala obliga a reescribir
todas las alturas de texto a mano.

## FASE 3 — Trazado

PAGESETUP y PLOT. Tamaño y orientación del papel, área de trazado (Presentación,
Extensión, Ventana, Límites), escala, centrado, y **tablas de estilos de trazado
CTB y STB**.

CTB/STB es lo que traduce «color 7» a «pluma de 0,25 mm negra». Un plano trazado
sin su CTB sale con los grosores equivocados y es papel tirado. Impórtalas y
expórtalas: los estudios tienen las suyas desde hace veinte años.

Vista previa antes de trazar. Y salida a PDF con las fuentes incrustadas.

## FASE 4 — Conjuntos de planos

Un conjunto de planos con numeración automática, campos que se rellenan solos
(nombre del plano, número, escala, fecha, revisión) y publicación por lotes a un
único PDF paginado.

**Decisión de arquitectura, y es deliberada:** el conjunto de planos NO va dentro
de `CadDocument`. En AutoCAD es un archivo aparte (`.dst`) y aquí también: su
propio módulo y su propia tabla. Así no tocas `cad-document.ts`, que es de T7, y
además es lo correcto — un conjunto agrupa varios documentos, no vive dentro de
uno.

Aquí es donde probablemente necesites endpoints nuevos. Es tu permiso; úsalo.

## Cómo se prueba

- ZOOM Extensión sobre un documento conocido y afirmar la ventana resultante con
  números concretos.
- Una ventana a escala 1:50 con una capa congelada sólo ahí: afirmar que la capa
  se ve en la otra ventana y no en ésa.
- Trazar a PDF y afirmar sobre el PDF generado (tamaño de página, número de
  páginas, presencia de las fuentes), no sobre una captura.
- Golden nuevo (coge un hueco: 46, 47 o 48): crear presentación, ventana,
  escala, trazar, y afirmar el DOCUMENTO y el artefacto.

## Límite de alcance

NO toques `cad-document.ts` (T7), `dxf-*.ts` (T4) ni el monolito (T1).
Roce previsto: `engine/index.ts`, una línea.
```

---
---

# T6 — AutoLISP deja de ser una isla

```
[PEGA AQUÍ EL PREÁMBULO COMPLETO]
Rama: claude/cad-lisp-enchufado

## Tu misión

Hay un intérprete AutoLISP completo bajo `lib/lisp/` —lector, evaluador,
funciones de entidad por códigos DXF, sandbox con presupuesto, DCL, plugins— y
**nadie lo importa**. Compruébalo:

    grep -rln "lib/lisp" apps/web/src --include=*.ts --include=*.tsx | grep -v "^apps/web/src/lib/lisp"

Vacío. Un veterano de AutoCAD no puede cargar ni ejecutar una sola rutina.

Esto es el gancho comercial del producto: traen rutinas `.lsp` escritas a lo
largo de años —cajetines, numeración de ejes, exportadores, comprobaciones de
norma— y no cambian de herramienta si las pierden. Un intérprete que nadie puede
invocar vale exactamente cero.

## FASE 1 — La puerta

APPLOAD: cargar un `.lsp` desde el disco del usuario o desde la biblioteca de la
organización. LOAD desde LISP. Y la ejecución directa: escribir `(+ 1 2)` en la
línea de comandos y ver `3`.

La línea de comandos ya está montada en `components/cad/command-line/` con un
anfitrión con suscripción (`command-engine-host.ts`). Engánchate ahí. No inventes
otra caja de texto.

Cuando una rutina define `(defun c:MICOMANDO ...)`, ese nombre tiene que quedar
tecleable como un comando más, en el MISMO registro que los 63 nativos. Ése es el
momento en que el subsistema deja de ser una isla.

## FASE 2 — La consola

Una paleta de LISP bajo `components/cad/lisp/`: histórico de evaluación,
inspección de variables, la lista de rutinas cargadas y de comandos que aportan,
y los errores con su traza.

**Ojo con el monolito:** `Layout3DEditor.tsx` es de T1 y no lo puedes tocar. Tu
paleta se registra por el registro de paletas que dejó la ola 1
(`components/cad/palettes/use-palettes.ts`). Si descubres que registrar una
paleta exige una línea en el monolito, PÍDESELA a T1 en tu PR y deja tu paleta
alcanzable por la línea de comandos mientras tanto. No la toques tú.

## FASE 3 — Persistencia por organización

Guardar rutinas `.lsp` por organización, versionadas, con quién las subió y
cuándo. Usa el blob store que ya existe (`apps/api/src/modules/blob-store`).

**NO añadas endpoints nuevos**: T5 es la única autorizada a tocar
`packages/contracts` en esta ola. Si de verdad no puedes hacerlo con lo que hay,
dilo en el PR y deja la carga como «sólo desde el disco del usuario» — un límite
declarado es mejor que romper el gate de contrato de las otras nueve sesiones.

## FASE 4 — Que las rutinas de verdad funcionen

Aquí es donde se ve si el traductor entre `CadEntity` y las listas de códigos DXF
miente. Coge el corpus de `lib/lisp/corpus/` y súbele la exigencia:

- Una rutina que dibuje un cajetín parametrizado y lo inserte como bloque.
- Una que recorra la selección con `ssget` y vuelque una tabla.
- Una que compruebe que ninguna cota está desasociada.
- Una que use `command` para invocar comandos nativos encadenados.

Toda mutación por `commitNativeCommands`. Una rutina LISP no puede saltarse el
historial ni el CAS. Verifícalo con una spec que cuente los pasos de deshacer.

Pruebas ADVERSARIALES, no sólo felices: recursión infinita, lista de diez
millones de elementos, `entmake` con datos inválidos, y una rutina que redefine
una función del sistema. El sandbox tiene que aguantar; y si no aguanta, tiene
que fallar DICIÉNDOLO, no dejando el editor en un estado raro.

## Cómo se prueba

Golden nuevo (coge un hueco: 46, 47 o 48): cargar un `.lsp`, invocar su comando
`c:` desde la línea de comandos, y afirmar que la geometría que produjo está en
el documento GUARDADO. Es la prueba de punta a punta de que la isla se conectó.

## Prohibido

`lib/cad/*` (cuatro sesiones ahí), `Layout3DEditor.tsx` (T1), `packages/contracts`
(T5). Todo lo demás fuera de `lib/lisp/` y `components/cad/lisp/`, sólo para leer.
```

---
---

# T7 — Los sólidos entran en el documento

```
[PEGA AQUÍ EL PREÁMBULO COMPLETO]
Rama: claude/cad-solidos

## Tu misión

Hay un kernel B-rep completo bajo `lib/brep/` —topología con invariantes,
superficies analíticas y NURBS, extrusión, revolución, barrido, solevado,
booleanas, redondeos, teselado, STEP y IGES: 34 archivos— y **nadie lo importa**.

    grep -rln "lib/brep" apps/web/src --include=*.ts --include=*.tsx | grep -v "^apps/web/src/lib/brep"

Vacío. No se puede crear un sólido, no se puede guardar y no se puede ver.

**Eres la única sesión con permiso sobre `cad-document.ts` en esta ola.** Con ese
permiso viene la responsabilidad: la migración de esquema es tuya y sólo tuya.

## FASE 1 — Esquema 5, y que persista

`cad-document.ts` gana `solid3d` y `region`. Un `solid3d` guarda su ÁRBOL DE
CONSTRUCCIÓN (primitivas y operaciones), no la malla: así se puede reeditar y así
el archivo no pesa cien megas. La malla se deriva al abrir.

Migración en `migrateCadDocument` del esquema 4 al 5 sin pérdida, con su spec.

Adaptador completo en `CAD_ENTITY_REGISTRY`: renderer, hitTester, grips, snaps,
properties, bounds y `commands.transform`. Bajo `cadTransformIsReflecting`, un
sólido espejado invierte la orientación de sus caras: si no lo tratas, las
normales apuntan hacia dentro y el sólido se ve del revés. Ancla absoluta, no
sólo ida y vuelta.

`bounds()` de un sólido es su caja envolvente en 3D proyectada al plano; no
devuelvas infinito ni reviente la rejilla de `CadSpatialIndex`.

Validación en el servidor: `apps/api/src/modules/cad-documents/cad-document-
validation.ts`, en el mismo estilo fail-closed. Un árbol de construcción con una
referencia rota se rechaza, no se «arregla». NO añadas endpoints.

## FASE 2 — Los comandos

EXTRUDE, REVOLVE, SWEEP, LOFT, PRESSPULL, UNION, SUBTRACT, INTERSECT,
FILLETEDGE, CHAMFEREDGE, SLICE, SECTION, INTERFERE. Más REGION y MASSPROP
(MASSPROP también está en la lista de T10; es tuyo para sólidos, suyo para
regiones 2D — coordinaos en el PR).

Cada operación valida los invariantes de `invariants.ts` DESPUÉS de ejecutarse.
Ese validador es lo mejor que tiene el kernel; sería absurdo no usarlo en el
único sitio donde puede salvarte.

## FASE 3 — Verlo

Teselado al viewport 3D. `entity-three.ts` es de T1 en esta ola: tu gancho debe
ser de ≤20 líneas y lo pides en tu PR, o lo dejas tras bandera y lo cableas en un
PR posterior. Dilo claramente, no lo dejes ambiguo.

Estilos visuales (Alámbrico, Oculto, Sombreado, Sombreado con aristas) y 3DORBIT.
`lib/cad/view/view-controller.ts` ya gestiona la cámara en perspectiva.

## FASE 4 — Interoperabilidad

STEP AP203/AP214 e IGES ya están escritos en `lib/brep/`. Enchúfalos: comandos
IMPORT y EXPORT para sólidos, con su ida y vuelta probada — exportar, importar,
y que los invariantes Y el volumen se conserven.

## Cómo se prueba

- Euler-Poincaré tras CADA operación. Un cubo: V=8, E=12, F=6, característica 2.
  Un cubo con agujero pasante: género 1, característica 0.
- Volumen y área por DOS caminos que tienen que coincidir: integración sobre las
  caras analíticas frente a suma sobre la malla teselada.
- Corpus adversarial: booleanas entre sólidos que se tocan exactamente en una
  cara (el caso que rompe las implementaciones ingenuas), coplanares, y caras
  curvas tangentes.
- **Y la que demuestra que ya no es una isla:** crear un sólido por comando,
  guardarlo, cerrar, reabrir, y afirmar que el árbol de construcción y el volumen
  sobrevivieron. Golden nuevo, hueco 46, 47 o 48.

## Prohibido

`Layout3DEditor.tsx` (T1), `dxf-*.ts` (T4), `lib/cad/render/*` (T1 la consume).
```

---
---

# T8 — Rendimiento medido donde el usuario lo sufre

```
[PEGA AQUÍ EL PREÁMBULO COMPLETO]
Rama: claude/cad-rendimiento

## Tu misión

El benchmark del pipeline nuevo dice cosas magníficas —`firstDetailMs` 750,
`zoomSettleMs` 23, `panFrameP95Ms` 7,17, 100.000 entidades detalladas frente a
2.500 del camino viejo, y 0,01 MB de crecimiento de montón en tres ciclos— y
**está midiendo en Node**. Lo confesa él mismo. Abre
`docs/cad/evidence/cad-render-benchmark-100k.json` y lee su campo `notMeasured`:

- «GPU, llamadas de dibujo reales, composición del navegador y cuadros por segundo»
- «coste de subir atributos a la GPU»
- «rasterizado de glifos: en Node no hay canvas, así que el atlas de texto no
  entra en esta corrida»

Y su `corpus.entityMix`: 49.870 líneas, 24.966 círculos, 25.164 arcos. **Cero**
polilíneas, hatches, mtext, cotas, elipses, splines e inserts. O sea que el
`text-atlas.ts` nunca se ha ejecutado y el camino instanciado de INSERT no se ha
medido con el pipeline nuevo.

Tu trabajo es convertir esa promesa en una medida que se pueda defender.

## FASE 1 — Un corpus que se parezca a un plano

Extiende `lib/cad/benchmark/corpus.ts` con mezclas realistas y deterministas,
versionadas por SHA como ya hace el actual:

- **Arquitectura**: muros como polilíneas, puertas y ventanas como inserts
  repetidos, sombreados de suelo, cotas y textos. Muchos inserts, pocas
  definiciones.
- **Mecánico**: splines y elipses, cotas con tolerancias, muchos arcos pequeños.
- **Cartográfico**: cientos de miles de segmentos de polilínea, poco texto.
- **Hostil**: un dibujo con 20.000 MTEXT, que es lo que reventaba el heap con los
  sprites por canvas.

Cada mezcla en 10k y 100k. El corpus actual sólo prueba lo fácil.

## FASE 2 — Medir en el navegador

Un spec de Playwright que mida lo que Node no puede:

- **FPS reales** durante paneo y zoom guionados, con percentil 95 y máximo.
- **Llamadas de dibujo por frame** (`WEBGL_debug_renderer_info` y contadores de
  three).
- **Memoria de GPU** aproximada por geometrías y texturas vivas.
- **Tiempo hasta el primer píxel** y hasta el detalle completo.
- **Memoria del proceso** tras tres ciclos completos de abrir/panear/zoom/cerrar.

Corre Chromium y Firefox, como los goldens. Guarda el JSON por corrida con el
mismo esquema de evidencia que ya existe
(`apps/web/src/lib/cad/benchmark/evidence.schema.json`).

## FASE 3 — Hacer bloqueante lo que hoy sólo se registra

El benchmark actual entra con `"enforcement": "report-only"` y su propia
justificación dice por qué: métrica nueva, sin línea base versionada debajo.

Ya tiene una corrida. Tu trabajo es darle la línea base y volverlo bloqueante,
respetando las reglas de escenificación que el propio repositorio se dio:

- Toda métrica nueva entra registrada y no bloqueante durante una versión.
- **NUNCA aprietes un presupuesto existente en el mismo PR que añade uno nuevo.**
  Si ambos se mueven a la vez, nadie sabe cuál regresionó.
- Publica la línea base con su entorno (CPU, memoria, navegador) al lado. Un
  número sin su máquina no es una línea base, es una anécdota.

Ojo con el ruido: los goldens ya son sensibles a la carga de máquina. Un gate de
FPS mal calibrado va a fallar de forma intermitente y la gente lo va a desactivar,
que es peor que no tenerlo. Calibra con márgenes y con varias corridas.

## FASE 4 — El presupuesto viejo, que sigue mintiendo

`apps/web/e2e/performance/cad-viewport-100k.spec.ts` exige, entre otros, «zoom
<30 s» y «máximo 2.500 detalles iniciales». La matriz de brechas lo dice sin
rodeos: «un zoom de 29,14 s pasa el gate y sigue siendo una brecha P0 de
experiencia», y el tope de 2.500 detalles **codifica el muestreo como si fuera lo
correcto**.

Reescribe esos presupuestos para que expresen la experiencia que quieres, no la
que había. Y hazlo en un PR aparte del que añade las métricas nuevas.

## Dependencia, y hay que decirla

Si T1 todavía no ha encendido el pipeline nuevo en el editor, tus medidas de
navegador estarán midiendo el camino VIEJO. Comprueba primero:

    grep -rn "cad/render/" apps/web/src --include=*.tsx | grep -v "^apps/web/src/lib/cad/render/"

Si sale vacío, mide los dos caminos por separado con el corpus nuevo y dilo en el
PR. No des por hecho lo que no puedas comprobar.

## Prohibido

Todo lo que no sea `e2e/performance/*`, `lib/cad/benchmark/*`,
`lib/cad/render/render-benchmark.ts` y los scripts de benchmark. Si encuentras un
bug de rendimiento en código ajeno, anótalo en el PR con su medida: eso vale más
que arreglarlo mal.
```

---
---

# T9 — La rúbrica que dice cuánto falta de verdad

```
[PEGA AQUÍ EL PREÁMBULO COMPLETO]
Rama: claude/cad-rubrica

## Tu misión

Existe `docs/competitive/autocad-2027-gap-matrix.md`, y es un documento honesto:
24 categorías, criterio explícito, y la frase que lo salva de ser marketing
—«Ninguna fila recibe Completa ni una puntuación 10/10 en este corte».

Y está DESACTUALIZADO. Dice que el modelador B-rep no existe, y existe (`lib/brep/`,
34 archivos). Dice que los plugins AutoLISP están «Ausente», y hay un intérprete
completo (`lib/lisp/`). Sus benchmarks son los de antes de la ola 1: cita 25.275
ms de primer detalle y 29.140 ms de zoom.

Tu trabajo es convertirlo en algo que se pueda responder sin mentir cuando un
cliente pregunta «¿cuánto os falta para AutoCAD?».

## FASE 1 — Ponerlo al día, con evidencia

Recorre las 24 filas y actualiza cada una contra el árbol de HOY. Para cada fila:
qué existe, dónde (archivo y línea, o spec, o golden), y qué falta exactamente.

Reglas que no se negocian, y que el documento ya se dio a sí mismo:
- Que un golden pase no compensa un criterio faltante.
- Nada se redondea a 10/10 mientras exista un gap.
- Si citas un número de rendimiento, cita también la máquina.

Y la que hay que añadir después de la ola 1: **un módulo que nadie importa no
cuenta como implementado.** Comprueba con `grep` quién llama a cada subsistema
antes de moverle el estado. La ola 1 dejó tres subsistemas completos e
inalcanzables; si la rúbrica los hubiera contado como «Completa», habría mentido.

## FASE 2 — Los 200 puntos

Convierte la matriz en una rúbrica puntuada. Denominador publicado, criterios por
punto, y evidencia obligatoria por punto. Sin evidencia, cero: no hay puntos «de
oficio».

Reparte los 200 puntos por PESO COMERCIAL, no por esfuerzo de implementación. Un
dibujante no compra un kernel B-rep si no puede acotar; HATCH y las cotas valen
más que las booleanas. Argumenta el reparto en el propio documento: alguien lo va
a discutir y el argumento tiene que estar escrito.

## FASE 3 — Que se calcule sola

`scripts/cad/rubric.mjs`: lee la evidencia declarada, comprueba lo comprobable
automáticamente (existe el archivo, pasa la spec, el comando está en el registro,
alguien importa el módulo) y emite la puntuación con su desglose.

Lo que no se pueda automatizar se declara MANUAL con fecha y firma de quién lo
comprobó. Una rúbrica que se autoevalúa sin evidencia es peor que ninguna.

Añádelo a `npm run check:cad` como INFORMATIVO. No como gate: una rúbrica que
bloquea el CI se convierte en algo que la gente infla para poder mergear.

## FASE 4 — El histórico

Guarda cada cálculo con su fecha y su commit en `docs/competitive/history/`.
La pregunta que hay que poder responder es «¿cuánto hemos avanzado este mes?», y
sin serie temporal no se responde.

Y una tabla de PRIORIDAD: los diez puntos más baratos por unidad de valor
comercial. Ése es el orden de la ola 3, y sale de tus datos, no de una intuición.

## Cómo se prueba

Spec del script: dado un documento de evidencia de prueba, la puntuación sale
como se espera; y con evidencia faltante, el punto NO se otorga. Esa segunda es
la que evita que la rúbrica se degrade en autobombo.

Recuerda que toda spec debe imprimir por stdout o el runner la da por fallida.

## Prohibido

Código de producto. Tocas `docs/` y `scripts/cad/rubric*`. Si al recorrer las
filas encuentras un defecto, ANÓTALO en la rúbrica con su evidencia — ése es
justamente tu producto.
```

---
---

# T10 — Las utilidades del día a día, y los scripts

```
[PEGA AQUÍ EL PREÁMBULO COMPLETO]
Rama: claude/cad-utilidades

## Tu misión

Quedan los comandos que no salen en los folletos y que se usan cincuenta veces al
día: consultar, seleccionar, limpiar y automatizar. De los 80 alias pendientes
son tuyos: AREA, DIST, LIST, MASSPROP (regiones 2D), UNITS, LTSCALE, LWEIGHT,
COLOR, LINETYPE, LAYER, OSNAP, DSETTINGS, OPTIONS, DRAWORDER, OVERKILL, GROUP no
(es de T3), TOOLPALETTES, ADCENTER no (T3), UCSMAN, REGION.

Más los que no tienen alias y hacen falta igual: QSELECT, FILTER, SCRIPT,
LAYERSTATE, ID, SETVAR/GETVAR.

## FASE 1 — Consulta

DIST (con delta X, Y, Z y ángulos), AREA (por puntos, por objeto, con suma y
resta acumulativas), LIST (el volcado completo de propiedades de lo designado),
ID, y MASSPROP para regiones 2D. REGION para crear regiones desde contornos
cerrados.

`unit-format.ts` ya existe, probado y sin llamar: es exactamente el formateo que
necesitas. UNITS configura tipo (decimal, ingeniería, arquitectónico, fraccional,
científico), precisión, y unidades angulares. Un CAD que muestra 3.5 donde el
usuario espera 3'-6" es un CAD que no se usa en Estados Unidos.

## FASE 2 — Selección avanzada

QSELECT (seleccionar por tipo, capa, color, y cualquier propiedad, con operadores
y con «añadir a la selección actual») y FILTER con filtros guardables.

Los adaptadores ya exponen `properties.read`, así que la propiedad por la que
filtras sale del registro, no de una lista escrita a mano. Hazlo así y QSELECT
funcionará automáticamente con los tipos que añadan T7 y las olas siguientes.

## FASE 3 — Propiedades globales y limpieza

COLOR, LINETYPE (con carga de `.lin`), LWEIGHT, LTSCALE, DRAWORDER (al frente,
al fondo, encima de, debajo de), LAYERSTATE (guardar y restaurar estados de capa),
y las puertas tecleables a lo que la ola 1 dejó en paletas: LAYER, OSNAP,
DSETTINGS, OPTIONS, PROPERTIES.

Esas cinco son la parte más barata de tu sesión y de las más visibles: la paleta
ya existe y funciona, sólo le falta que teclear su nombre la abra.

OVERKILL: borrar duplicados y unir segmentos colineales solapados, con tolerancia
configurable. Ojo: tiene que emitir UN lote de `CadEntityCommand[]`, no uno por
objeto. Si emite uno por objeto, Ctrl+Z deshace sólo el último y quien pulsó una
vez cree que lo deshizo todo.

## FASE 4 — Automatización

SCRIPT: ejecutar un `.scr`, que es una lista de comandos separados por saltos de
línea. Es la automatización más vieja y más usada de AutoCAD, y aquí sale casi
gratis porque el motor ya acepta entrada tecleada: un `.scr` es exactamente eso.

Por eso `alias-table.ts` documenta las variantes con guion (`-LAYER`, `-INSERT`,
`-PLOT`): resuelven al mismo comando pero pidiendo sus opciones por la línea en
vez de abrir un diálogo. Sin ellas un `.scr` se queda colgado esperando un clic.
Impleméntalas para los comandos que tengan diálogo.

SETVAR y GETVAR con las variables de sistema. Y TOOLPALETTES: paletas de
herramientas personalizables con bloques y comandos, guardadas por organización.

## Cómo se prueba

Cada comando con specs en Node: camino feliz Y rechazos. Un AREA sobre una
polilínea abierta tiene que decir que la va a cerrar para calcular, no dar un
número silenciosamente.

Para UNITS: una tabla de anclas absolutas por cada tipo de unidad. 3.5 unidades
en arquitectónico son 3'-6"; escríbelo como aserción, no como comentario.

Para OVERKILL: afirmar que sale UN lote.

Para SCRIPT: un `.scr` que dibuje tres cosas y afirmar el documento resultante.
Ésa es la prueba de que la automatización sirve.

## Límite de alcance

NO toques `cad-document.ts` (T7), `dxf-*.ts` (T4), ni el monolito (T1). Las
paletas de la ola 1 son tuyas sólo para ABRIRLAS por comando; su contenido no se
toca.

Roce previsto: `engine/index.ts`, una línea.
```

---
---

# Orden sugerido

1. **T1 primero y sola si puedes.** Es la que convierte tres subsistemas
   huérfanos en producto y la que desbloquea a T8. Además es la dueña del
   monolito: cuanto antes acabe, antes deja de ser un cuello de botella.
2. **T2, T3, T4, T5, T10 en paralelo** — son el grueso de los 80 alias
   pendientes y no se pisan.
3. **T6 y T7** cuando quieras: son islas que se conectan. T7 lleva
   `cad-document.ts`, así que si va tarde no bloquea a nadie de esta ola.
4. **T8 después de T1**, o midiendo los dos caminos y diciéndolo.
5. **T9 al final**, para que la rúbrica retrate la ola completa.

# Lo que sigue sin hacer nadie, y hay que decirlo

- **Bloques dinámicos (BEDIT).** Excluidos a propósito de T3: necesitan esquema
  propio y son una ola entera. Es la funcionalidad más echada de menos por quien
  viene de AutoCAD después de LISP.
- **i18n ES/EN/PT.** Hay 5 claves traducidas y **1 de 58 archivos `.tsx` usa
  `useTranslations`; el monolito, ninguna**. Toca todos los archivos, así que
  paraleliza fatal: hazla sola, de una vez, y después de que T1 haya terminado de
  mover el monolito.
- **Object storage S3.** La matriz lo marca «Ausente»: el MinIO de Compose no
  está cableado y los blobs viven en BYTEA. Es una bomba de escalado.
- **Kernel Rust/WASM.** ADR-0003 lo condiciona. Sigue sin manifest ni benchmarks.
- **Los tres goldens numerados 45** y los huecos 46-48. Trivial, y nadie lo ha
  arreglado.
