# F2 · Velocidad sentida

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/history/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/render/**`
- `apps/web/src/lib/cad/wasm/**`
- `crates/**`
- `apps/web/src/lib/cad/*index*`
- `apps/web/e2e/performance/**`
- `docs/cad/evidence/*100k*`
- `scripts/perf/**`

## Cola

1. `architecture@100k` a SLO: ≤5 s de detalle completo y ≥30 fps de paneo p95. Hoy 25.3 s y 8.57 fps. El índice ya dio ×6.75; el perfil señala teselado y subida por lotes.

2. Kernel WASM enchufado: la paridad numérica está verde y nadie lo importa desde el producto. Que el teselado caliente pase por él con fallback, y la evidencia de la ganancia. **Criterio de rúbrica: alguien fuera de `lib/cad/wasm` debe importarlo** (sin contar specs).

3. Estrés de edición densa a 100k (selección y modificación sobre trazos densos) con artefacto versionado por corrida.

4. Medición en GPU real reproducible por el titular con un solo comando, con la máquina declarada en el artefacto.

## Cierre

Las filas de rendimiento de la rúbrica sin criterios abiertos; evidencia con máquina declarada.

## Lo que hay que tener presente

Prohibido relajar el SLO. Si la cifra no llega, se declara la cifra real y el siguiente cuello, no se mueve el umbral.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/history/execution/frentes-superar-20260904/velocidad-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-velocidad` sobre la rama `campana/superar/velocidad`. Commits sí;
  **push a origin no** (el coordinador hace un push por ventana).
- **R6 Las reglas de la casa, intactas.** Prohibido relajar gates, umbrales, goldens o
  presupuestos. Prohibido tocar identificadores persistidos (IDENTITY.md, ADR-0010).
  Prohibido renombrar `data-testid`. Fix-or-hide: lo que no gana su evidencia no es visible.
  Ningún claim sin evidencia; lo parcial se declara «todavía no» en tu bitácora, con fecha.
  Las banderas `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` NO se encienden en esta campaña.
- **R7 Bitácora.** Este archivo es tu memoria. Si tu contexto se compacta, lo relees primero.
  Nunca se pregunta al titular: se decide, se anota y se sigue.

## Cómo se valida antes de dar algo por hecho

```
cd /home/user/vd-velocidad
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### 2026-09-04 · Cola 2 · El kernel WASM, enchufado al teselado caliente

Qué existe ahora que antes no: `apps/web/src/lib/cad/render/curve-kernel-tessellation.ts`
enruta **arcos, círculos, elipses y splines** al kernel de curvas y deja todo lo demás en el
carril de adaptadores. Arcos y elipses cruzan la frontera **por lotes**, agrupados por
(tipo × pasos) —y «pasos» es el escalón de LOD que ya resolvía `cadRenderSegmentBudget`—, así
que `mechanical@10k` entero cruza en **6 llamadas** para sus 5.600 arcos/círculos/elipses. La
spline cruza una vez por curva: la ABI v1 del binario no tiene entrada de lote para ella
porque cada una trae su vector de nudos de longitud propia, y el crate no se toca en esta
entrega.

El punto de inserción es `tessellate.worker.ts`: su núcleo `tessellateCadEntityBatch` delega
en el módulo nuevo, de modo que el carril fuera de hilo del pipeline (activo por defecto en el
navegador, `resolveCadOffThreadTessellator`) y su reserva síncrona pasan los dos por el kernel
sin cambiar ni una firma. El **binario se calienta desde el worker**, no desde el hilo
principal: `warmCadRenderCurveKernel()` se lanza sin esperarla al arrancar el worker y, hasta
que llega, el motor JavaScript sirve los lotes.

Evidencia (`npx tsx src/lib/cad/render/curve-kernel-tessellation.spec.ts`, 12 s, 28
comprobaciones): **7.530.200 coordenadas EXACTAS** —igualdad de bits, no tolerancia— entre el
carril del kernel y el de adaptadores sobre `mechanical@10k` y `plano-real@10k` (8.200 curvas
desviadas); las mismas 7.530.200 con el **binario del árbol instalado**, con peor desviación
relativa medida **0,000e+0**, es decir que el empaquetado a `Float32Array` absorbe entera la
diferencia entre los dos motores; y las mismas 7.530.200 idénticas **sin binario**, tras
calentar contra una URL que no existe.

Regresión verde: los 18 specs de `render/`, `wasm/curve-kernel-parity`,
`wasm/curve-kernel-fallback`, `curve-tessellate`, `npm run typecheck` del árbol entero y
`npm run check:cad`.

Rúbrica: el criterio `wasm.toolchain` pasa de ✖ «NADIE lo importa» a ✅ citando
`apps/web/src/lib/cad/render/curve-kernel-tessellation.ts`. Ver el «Todavía no» de abajo sobre
por qué la FILA sigue mostrando 1/2.

### 2026-09-04 · Cola 2 (2/2) · La ganancia del kernel, medida sobre el corpus del producto

Qué existe ahora que antes no: `docs/cad/evidence/curve-kernel-render-100k.json`, generado por
`node scripts/perf/curve-kernel-render-bench.mjs` (15 min en este contenedor) y verificado por
`node scripts/perf/curve-kernel-render-bench.spec.mjs` (50 comprobaciones, milisegundos). La
REGLA por la que el artefacto se acepta o se rechaza vive en un archivo aparte
—`scripts/perf/curve-kernel-render-contract.mjs`— y el spec la importa de ahí, no del generador:
un verificador enterrado dentro del programa que produce lo verificado invita a que los dos se
aflojen juntos el día que el número no pase. (El presupuesto de monolito obligó al corte a 800
líneas; el corte salió mejor que el archivo único, así que se queda.)
**La fuente de toda cifra de abajo es ese archivo**: esta bitácora la cita para contar qué pasó,
y si alguna vez discrepan, el que tiene razón es el artefacto y esta entrada está caduca.

Qué mide: la MISMA etapa de teselado dos veces sobre el mismo corpus versionado, cambiando sólo
el kernel inyectado —binario `.wasm` del árbol contra motor JavaScript—. La función cronometrada
es `tessellateCadEntitiesWithCurveKernel`, que es el cuerpo de `tessellateCadEntityBatch`, y la
sonda lo demuestra en cada corrida: llama a la puerta del worker y exige los mismos recuentos
antes de publicar (`workerGate.sameCountsAsTimedFunction`). El lote se trocea con la regla de
tamaño del carril fuera de hilo (≤512 entidades o ≤16.384 segmentos, de `pipeline-offthread.ts`),
que es el mensaje que un worker recibe de verdad: 341 lotes por mezcla.

Lo medido, en una frase por mezcla:

- **`mechanical@100k`** —70.000 curvas, el 70 % de las entidades— la etapa entera baja de 658,8 ms
  a 493,4 ms: **×1,286 en la peor de tres corridas** (×1,303 mediana). El sublote de curvas solo,
  ×1,582 en la peor. Las curvas son el **80,7 %** del coste de esa etapa, así que el ×1,6 del motor
  se convierte en el ×1,29 de la etapa: Amdahl, medido y no supuesto.
- **`plano-real@100k`** —12.000 curvas, el 12 %— la etapa **NO mejora**: ×0,954 en la peor corrida,
  ×0,986 mediana. No es un fallo del binario: en esta mezcla las curvas son el **0,24 %** del coste
  de la etapa (54 ms de 22,4 s), y el sublote de curvas sí gana ×1,262. **El binario no puede mover
  lo que no calcula.** El 99,8 % restante es sombreado, INSERT expandiendo su definición, cota y
  polilínea, todos por el carril de adaptadores. Ahí está el siguiente cable, no en el kernel.
- **`architecture@100k`** se publica en **CERO por construcción** y se dice por qué: la mezcla no
  emite arco, círculo, elipse ni spline de primer nivel, y los arcos que un plano así tiene de
  verdad —el barrido de una puerta— viven dentro de la definición del bloque, donde los tesela
  `insertRenderPaths` sin pasar por el enrutador. Callarla habría insinuado una ganancia que ahí
  no existe.

La condición sin la cual nada de lo anterior se publica: **paridad exacta de puntos por entidad**.
La sonda compara los recuentos índice a índice y sale con error si uno solo difiere; el artefacto
lleva además la huella FNV-1a de la secuencia, porque dos motores pueden sumar el mismo total
repartiéndolo distinto. Cero descuadres en las tres mezclas, sobre 2.315.764 · 34.489.174 ·
237.614.966 puntos. **Un artefacto con ganancia y sin paridad lo rechaza el spec**, y eso está
probado en las dos direcciones: el spec fabrica un artefacto con ×3,2 y 200.000 puntos de menos
y exige que sea rechazado citando el total de puntos.

El spec también exige lo que este contenedor NO puede medir: `environment.gpu === false`,
`environment.browser === false`, `measurementKind === "cpu-node"` y una máquina descrita. Un
artefacto de este generador que declarara GPU o navegador estaría mintiendo por construcción.
Y ata la cifra al binario: `kernel.binarySha256` tiene que ser el de
`crates/valle-cad-kernel/kernel-manifest.json`, así que una recompilación del crate deja el
artefacto caduco en voz alta en vez de en silencio.

Regresión verde: `npm run typecheck` (8/8), `npm run check:json-keys`, `check:doctor`,
`check:fonts`, `check:contrast`, `check:surface`, `check:conventions`, el contrato de diseño, el
candado legacy, `check:no-industrial-domain`, el **presupuesto de monolito**, la cobertura de
cinta, el alcance de comandos, `build-kernel.mjs --check` (sha 09ad4f6e…), las normas mexicanas,
`check:lint-budget` (487/492, sin mover el techo), `check:precision-evidence`, `check:cad-math`,
`check:legal`, `check:e2e-localizadores`, `check:auditoria`, `check:authz`, `rubric.spec.mjs`,
`check:template-gallery`, `check:dxf-corpus`, `check:pdf-corpus`, `check:dxf-props` y
`check:api-console`. `node scripts/cad/rubric.mjs` sigue en 232/271, sin cambio: la fila del
kernel retiene 1 pt por falta de oráculo externo, como ya decía el «Todavía no» de esta fecha.

`npm run check:cad` entero NO pasa en este árbol, y por dos motivos **ajenos a esta entrega**;
los dos están medidos y con petición escrita, no escondidos: `check:dwg-evidence` falla por
entorno (`VALLE_DWG_CORPUS_MIRROR` sin definir en este contenedor, justo el fallo contra el que
avisa `AGENTS.md`) y la matriz competitiva está desactualizada desde `ff82c85`, el commit
ANTERIOR de este mismo frente. `git diff HEAD~1 --name-only` de esta entrega no toca ni un
archivo DWG ni la matriz. Ver **P-velocidad-02** y **P-velocidad-03** en
`docs/history/execution/frentes-superar-20260904/velocidad-peticiones.md`: regenerar la matriz cae fuera del territorio
(R1) y regenerar la evidencia DWG desde aquí la bajaría de 7 bundles a 0, que sería relajar un
gate (R6).

## «Todavía no»

### 2026-09-04 · La fila «Kernel Rust/WASM» sigue en 1/2 pese a tener sus dos criterios verdes

Con el cable puesto, `node scripts/cad/rubric.mjs --verbose` muestra los **dos** criterios de
la fila en ✅ (2 pt ganados) y cita el importador. La fila sigue leyéndose `1/2` por una regla
distinta y anterior: `rubric.mjs` aplica un techo a toda categoría cuyos puntos ganados vengan
**íntegramente de evidencia propia** (`earned === category.points && independentEarned === 0`
→ `points − 1`), que es la regla 1 de la campaña de cimientos. Para llegar a 2/2 hace falta un
**oráculo externo** para el kernel: un teselado de referencia de un tercero, o la medida en
hardware de un usuario real. Marcar la evidencia como `independent: true` en
`docs/competitive/rubric.json` sería a la vez tocar un archivo compartido (R2) y relajar un
gate (R6): no se hace.

### 2026-09-04 · Qué motor sirvió cada lote no llega al hilo principal

`tessellateCadEntitiesWithCurveKernel` devuelve `stats.backend` (`wasm` | `javascript`) y su
`fallbackReason`, pero el worker no los devuelve en su respuesta, así que el pipeline no puede
publicarlos junto a `tessellation: source` ni un golden de navegador puede afirmar «el binario
CORRIÓ aquí». Es exactamente el silencio contra el que ya avisa `pipeline-offthread.ts` para
`source`. El diseño está claro y cabe entero en `render/`: `backend?` opcional en
`CadTessellateWorkerResponse`, la promesa del pool resolviendo `{results, backend}`,
`CadTessellateOffThreadResult.backend`, el carril guardándolo y `CadRenderPipelineStats`
publicándolo. No entra en esta entrega para no ampliarla; queda como primera tarea de la
siguiente.

### 2026-09-04 · La ganancia del kernel no se puede MEDIR en este contenedor

Con el motor por defecto (JavaScript) el carril del kernel hace el mismo trabajo que el de
adaptadores más el empaquetado plano: no es más rápido y no se afirma que lo sea. La ganancia
la trae el binario, y medirla como la ve un usuario exige navegador: aquí **no hay navegadores
de Playwright y no se pueden instalar** (`npx playwright install chromium` sale por egreso
denegado, `/root/.cache/ms-playwright` no existe) ni hay GPU. Lo que sí está medido aquí es la
PARIDAD con el binario cargado en Node, que es lo que autoriza a encenderlo.

**Actualización del mismo día, después de la entrega 2/5.** La mitad de CPU de esta entrada ya
NO es cierta y conviene tacharla en vez de dejarla contradiciendo la evidencia: la ganancia con
el binario cargado en Node **sí** está medida sobre el corpus del producto y publicada en
`docs/cad/evidence/curve-kernel-render-100k.json`. Lo que sigue siendo verdad, entero, es la
mitad de navegador: **fotogramas, fps y tiempo hasta detalle completo no se pueden medir aquí**,
y el propio artefacto lo declara en `environment.whatThisIsNot` y en `scope.notMeasured` para
que nadie lo lea como si fuera evidencia de navegador.

### 2026-09-04 · El siguiente cuello no es el kernel: es el carril de adaptadores

Medido, no supuesto (`measurements[].amdahl` del artefacto de la ganancia): en `plano-real@100k`
las curvas son el **0,24 %** del coste de la etapa de teselado y en `architecture@100k` son el
**0 %**. Una pasada del lote entero cuesta ahí **22,4 s** y **147 s** respectivamente, contra
0,66 s de `mechanical@100k`. El coste está en sombreados, INSERT expandiendo su definición, cotas
y polilíneas — y `architecture@100k` produce **237,6 millones de puntos** en una pasada completa,
que es por lo que la llamada monolítica (sin trocear en lotes de worker) mata el proceso por falta
de memoria en este contenedor. Ninguna mejora del binario puede moverlo. Optimizar eso es otra
entrega y no cabía en ésta; queda medido y con su artefacto para que la siguiente empiece por el
número y no por la sospecha.

### 2026-09-04 · Las curvas dentro de las definiciones de bloque no pasan por el kernel

`cadCurveKernelRouteFor` clasifica ENTIDADES DE PRIMER NIVEL. Un arco dentro de la definición de
un bloque lo tesela `insertRenderPaths` al expandir la instancia, por su propio camino, y por eso
`architecture@100k` —34.000 INSERT— llega al kernel con cero curvas. Es correcto hoy (el enrutador
recibe el lote que el worker recibe, y ahí una instancia es una entidad), pero deja fuera del
kernel justo la mezcla más pesada. Enrutar la expansión de bloques exigiría meter el kernel dentro
de `insertRenderPaths` o teselar la definición una vez y transformar sus puntos, que es un cambio
de diseño con su propia paridad que probar. No entra aquí; queda declarado en el artefacto
(`zeroByConstruction.reason`) para que el cero no se lea como una medida fallida.

### 2026-09-04 · El spec del artefacto no está encadenado a ningún gate

`node scripts/perf/curve-kernel-render-bench.spec.mjs` y
`node scripts/perf/curve-kernel-render-bench.mjs --check` corren en milisegundos y muerden —se
comprobó cambiando `environment.gpu` a `true` en una copia: FALLA citando `gpu`—, pero hoy hay que
invocarlos a mano porque encadenarlos exige tocar `package.json`, que es archivo compartido (R2).
El diseño completo, con el punto exacto de la cadena de `check:cad` y el porqué del orden, está en
`docs/history/execution/frentes-superar-20260904/velocidad-peticiones.md` como **P-velocidad-01**. Hasta que el coordinador
lo aplique, este artefacto se comprueba a mano.

### 2026-09-04 · Cierre del frente: el árbol entra en VERDE de typecheck y ROJO de `check:cad`

`npm run typecheck` pasa entero (8/8 tareas) y los 19 specs de `render/` pasan, así que lo que
este frente escribió puede integrarse. `npm run check:cad` NO pasa en este árbol, y ninguna de
las dos causas la produce este frente: `check:dwg-evidence` falla por entorno
(**P-velocidad-03**) y la matriz competitiva está por regenerar desde `ff82c85`
(**P-velocidad-02**, diff recomprobado hoy: 3 líneas +, 4 −, puntuación sin cambio). El detalle
de todo lo corrido, con su salida literal, está en la entrada de cierre de la Bitácora.

### 2026-09-04 · Cola 4 · Un solo comando para medir en la GPU del titular

Qué existe ahora que antes no: `node scripts/perf/slo-navegador.mjs`. En UNA invocación
comprueba, mide y publica, y —sobre todo— **se niega**.

**Comprueba antes de medir**, y lo hace lanzando el navegador de verdad en vez de mirar rutas:
que el binario de Playwright exista (lo dice el propio lanzador, no una heurística), que lo que
rasteriza sea una GPU y no SwiftShader/llvmpipe, y que haya build de producción o un servidor de
producción ya en marcha. Esa última comprobación tiene una razón concreta: `playwright.config.ts`
REUTILIZA un servidor ya levantado fuera de CI, así que un `npm run dev` olvidado en el puerto
3000 haría que la corrida midiera React en modo desarrollo sin minificar y publicara esos
milisegundos como los del producto. Se detecta por los marcadores que Next inyecta sólo en dev.

**Mide** el SLO de navegador en el escalón `full` (`CAD_RENDER_BROWSER_TIER=full`, que es el que
trae los 100k) y el estrés de edición densa a 100k tantas veces como el cruce exige (tres), con
`CAD_PERF_REAL_GPU=1` —el canal `chromium` completo, no el `headless-shell`, que rasteriza por
software aunque la máquina tenga tarjeta— y `E2E_PROD=1`.

**Publica** `docs/cad/evidence/browser-slo-100k.json` y `docs/cad/evidence/cad-dense-editing-100k.json`
con `environment.declaredMachine` COMPUESTO de datos reales: modelo de CPU, hilos, RAM, sistema
operativo, navegador con su versión y el rasterizador que WebGL declaró. Los dos specs de
`e2e/performance/` lo reciben por `CAD_PERF_DECLARED_MACHINE`. El de edición densa traía escrito
a mano «portátil de desarrollo CON CARGA VECINA: otros agentes trabajando en el mismo equipo»,
que era cierto donde nació el spec y es **falso** en la máquina del titular: una evidencia que
describe otra máquina es peor que una sin describir. Ahora la declara quien la conoce, y sin
runner se declara lo poco que se ve desde dentro diciendo que no consta ni navegador ni
rasterizador. El cruce denso no se reimplementa: se invoca `scripts/cad/dense-editing-evidence.mjs`,
que ya se niega con menos de tres corridas, y si lo que escribe no pasa el contrato se **restaura
byte a byte** el fichero anterior.

**Se niega** —y esto es la mitad del entregable— si la comprobación previa falla, si Playwright
sale con código distinto de cero, si el artefacto trae `run.complete: false` (campo nuevo, junto a
`plannedProfiles`/`producedProfiles`: sin ellos «doce perfiles» y «veinte perfiles» se leen igual
de completos), si `declaredMachine` saldría vacía o genérica, o si la corrida **ENCOGE** la
cobertura publicada. Esa última regla es la que impide el daño peor: medir dos perfiles con GPU
real y perder los veinte que ya había. Para explorar está `--output <dir>`.

La regla vive aparte del runner (`slo-navegador-contract.mjs`), como en la entrega 2 y por el
mismo motivo. El spec (`node scripts/perf/slo-navegador.spec.mjs`, **74 comprobaciones**, 20 s)
la ejercita en las dos direcciones y **con el negativo REAL de este contenedor**: invoca el runner
con el registro de navegadores apuntando a un directorio vacío (falla el lanzador de Playwright,
no una bandera de prueba) y lo invoca otra vez con esta máquina tal cual es. En los dos casos:
código distinto de cero, cero bytes escritos y el `browser-slo-100k.json` vigente
(sha `558948ba3b3a…`) intacto.

Cableado comprobado de punta a punta aquí, con la corrida más barata que existe
(`baseline-line-circle-arc@10000`, 15 s): el artefacto crudo salió con `complete: true`,
`plannedProfiles: 2`, `producedProfiles: 2`, la máquina en `declaredMachine` y las nueve mezclas
no medidas listadas en `skipped`. Y al ofrecérselo al escritor, RECHAZADO por sus dos motivos
reales: rasterizado por SwiftShader y encogería la evidencia en 18 perfiles.

#### Todavía no (2026-09-04)

- **Aquí no se puede medir, y esta entrega no lo disimula.** Este contenedor no tiene GPU:
  Chromium rasteriza con `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)),
  SwiftShader driver)`. Ninguna cifra de fps, detalle completo o memoria de GPU sale de aquí, y
  el runner se niega a producirla. `performance.architecture-100k` y el artefacto de la edición
  densa quedan desbloqueados **para cuando el titular corra el comando**, no cumplidos.
- **Corrección a la bitácora del reconocimiento.** La entrada anterior decía «no hay navegadores
  de Playwright y no se pueden instalar». La primera mitad es FALSA en este contenedor:
  `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` y Chromium 141.0.7390.37 está instalado y arranca
  (canal `chromium` incluido). Lo que no está es **Firefox** (`/opt/pw-browsers/firefox-1495/`
  no existe) ni WebKit, y lo que sigue siendo cierto es que no hay GPU y que el egreso para
  descargar más navegadores está denegado. El negativo del spec usa las dos cosas reales.
- **El cruce denso sólo se publica sobre `docs/cad/evidence`.** `scripts/cad/dense-editing-evidence.mjs`
  no toma destino y está fuera del territorio de este frente (R1), así que con `--output <dir>`
  el runner deja las corridas copiadas en `<dir>/corridas-densas/` y lo dice, en vez de escribir
  donde no toca. Cambiarlo pide una petición al coordinador; no hacía falta para el entregable.
- **El spec de este runner tampoco está encadenado a ningún gate**, por lo mismo que
  P-velocidad-01: encadenarlo exige `package.json`. Diseño completo en **P-velocidad-04**.
- **La corrida de 100k con GPU no se ha cronometrado nunca en la máquina del titular con este
  runner.** El plan estima con el dato que hay —la corrida publicada tardó 7,8 min de punta a
  punta— y NO inventa una estimación para las tres corridas densas, que en CI rozaron los 35 min
  cada una sin GPU.

### 2026-09-04 · Cola 1 · Trinquete sobre el reparto por etapa, y lo que encontró al ponerlo

Qué existe ahora que antes no: el ×6,75 de `architecture@100k` tiene **techo**, y quien lo pase
se pone rojo con nombre y apellido.

**NUEVOS (territorio propio, `scripts/perf/**` y `docs/cad/evidence/*100k*`):**

- `scripts/perf/etapas-100k-budget.json` — techo por etapa (`tessellate`, `batchPush`,
  `spatialIndex`, `insertExpand`, `tileEnqueue`) más dos totales, `stageTotalMs` y
  `segmentsAtRest`. Los dos totales no son adorno: sin el primero, mover coste a una etapa sin
  techo (`textRequest`, `offThreadSeed`) pasaría en verde; sin el segundo, bajar el reloj
  dibujando menos también. Ningún número está elegido a mano: salen de tres corridas medidas
  aquí, y el fichero declara su máquina, su carga (`loadavg1m` 3,88 / 3,46 / 3,71 sobre cuatro
  hilos), su dispersión por etapa y su margen.
- `scripts/perf/check-etapas-100k.mjs` — la REGLA, aparte del programa que produce lo juzgado,
  por la misma cicatriz de la entrega 2. Juzga **las tres** corridas, no la mejor. Se niega si
  falta `environment` (no declara máquina), si `declaredMachine` sale corta o con «desconocido»,
  si el artefacto se declara con GPU o navegador, si no trae identificador de publicación o de
  corrida, si el corpus no es el sha versionado del presupuesto, o si la vista al reposo cambió
  —`detailedAtRest`, `visibleAtRest`, llamadas a `tessellate`—, que es el candado contra «más
  rápido porque dibuja menos». `--bajar` recalcula techos y **sólo baja**.
- `scripts/perf/etapas-100k-medir.mjs` — el productor. Tres corridas en procesos separados (una
  repetición dentro del mismo proceso mediría una V8 ya caliente), comprueba que las tres salen
  de la misma CPU y el mismo Node antes de agregarlas, compone la máquina desde `os` en vez de
  escribirla —la constante del perfilador decía «Xeon a 2.10GHz» y esta máquina es un Xeon a
  2.80GHz— y **arrastra verbatim** el `comparisonWithinThisSession` de agosto: es la única copia
  de esa medición y republicar encima la habría borrado sin ruido.
- `scripts/perf/etapas-100k-lod-probe.mts` — la sonda que ata el corpus a su sha del manifiesto
  y explica de dónde sale el coste: segmentos por tipo y por escalón, y el censo de qué escalón
  se paga **en la parada de zoom** del recorrido que se mide.
- `scripts/perf/check-etapas-100k.spec.mjs` — **117 comprobaciones**, medio segundo. Degrada etapa por
  etapa rotando la corrida degradada (un verificador que sólo mirara la primera lo delataría),
  prueba el techo justo por encima y justo encima, mete presupuestos rotos, artefactos sin
  máquina y corridas más rápidas dibujando menos, y ejerce el trinquete en las dos direcciones.
  Comprobado con cinco mutaciones al verificador: cada una tumba el spec.

**Y lo que el trinquete encontró el primer día, que es la mitad de esta entrega.** El artefacto
publicado el 2026-08-31 declaraba `tessellate` 477,8 ms y 15.250 instancias residentes. Medido
hoy sobre el MISMO corpus (sha `2029d760…`), el MISMO escenario y con las MISMAS 91.175 llamadas:
**3.818,9 ms y 2.199.624 instancias** — ×7,99 y ×144,2. No lo explica la máquina: en las mismas
corridas `spatialIndex` va ×1,12 y `insertExpand` ×1,36 contra agosto. Es trabajo nuevo, no
lentitud.

La causa está medida, no supuesta, y la publica la sonda dentro del artefacto: un HATCH devuelve
**4** segmentos a tier 0 y **13.790,8** a tier 1 —y tier 1 y tier 2 son idénticos desde que
`11fc202` retiró el escalón intermedio, por una razón de corrección del dibujo que sigue siendo
buena—; y en la parada de zoom de este recorrido (0,08970 px/unidad, 24 px = 267,6 unidades)
**los 14.000 sombreados están en tier 1, ninguno en tier 0**. El comentario del adaptador dice
lo contrario («están por debajo de los 24 px»), y es cierto en la vista inicial y falso en el
zoom del mismo recorrido. Petición **P-velocidad-06** con el diseño; el adaptador no es
territorio de este frente y no se toca.

No se relajó nada para que esto pasara: los techos son los que esta máquina mide HOY, y el
presupuesto lo dice en su bloque `deuda`, con el cociente contra agosto etapa por etapa. Un techo
que se presenta como meta sería peor que no tener techo.

#### Todavía no (2026-09-04)

- **El ×6,75 publicado no es lo que el árbol entrega hoy, y esta entrega no lo arregla: lo hace
  visible.** Bajar `tessellate` de 3,8 s a los 477 ms de agosto es trabajo de quien gobierna el
  LOD del sombreado (P-velocidad-06), no del trinquete. Lo que el trinquete garantiza es que a
  partir de ahora el siguiente resbalón sale en rojo el mismo día.
- **Los techos están calibrados bajo carga 3,5–3,9 sobre cuatro hilos**, con otro agente
  trabajando en el mismo contenedor: son entre un 10 % y un 15 % más flojos que el suelo de esta
  máquina en silencio (una calibración anterior, con carga 0,5–1,0, dio `tessellate` 3.610 ms
  frente a los 4.200 de ahora). No se eligió la corrida favorable a propósito. Se aprieta solo:
  `node scripts/perf/check-etapas-100k.mjs --bajar` en una máquina tranquila baja los techos y
  nunca los sube.
- **El trinquete no está encadenado a ningún gate**, por lo mismo que P-velocidad-01 y
  P-velocidad-04: encadenarlo exige `package.json`, que es R2. Diseño completo en
  **P-velocidad-05**. Hasta entonces se invoca a mano.
- **`firstDetailMs` no tiene techo.** Se mide y se publica (mediana 1.061 ms), pero no se
  presupuesta: es el reloj de pared del recorrido entero y su dispersión mezcla el coste del
  pipeline con el bucle de eventos. Presupuestarlo hoy sería un gate que falla por el vecino.
  La etapa a la que ese milisegundo pertenece sí tiene techo.
- **El escenario juzgado es uno solo** (`sync · sin reconciliar · reloj real`). Los otros dos que
  el perfilador mide —`sync · reconcilia` y `offthread`— se publican enteros en cada corrida pero
  no se juzgan: `offthread` paga `offThreadSeed`, que en este contenedor sin hilos libres mide el
  planificador de Node más que el producto.

### 2026-09-04 · Cola 1 · Bajar la subida por lotes: el bucle de empaquetado y la reserva de sus cubos

Qué existe ahora que antes no: `batchPush` —el segundo cuello que el perfil señalaba— baja de
**646,3 ms a 521,4 ms de mediana** en `architecture@100k`, con la geometría comprobada **bit a
bit** contra el empaquetado anterior sobre 1.167.126 instancias del corpus del producto, y el
techo del trinquete baja detrás: **732,068 → 646,534 ms**.

**Lo primero fue medir dónde se va la etapa, porque la respuesta no era la esperada.**
Instrumentando el constructor durante una corrida del perfilador: 91.175 empaquetados,
**2.600.624 segmentos repartidos en 2.413.213 CAMINOS**, de los cuales **2.346.349 (el 97,2 %)
son caminos abiertos de dos puntos**. El coste de esta etapa no está en el segmento sino en el
camino: a un segmento por camino, todo lo que se hace «una vez por camino» se paga una vez por
segmento. Y no es casualidad del corpus — es la otra cara de P-velocidad-06: un sombreado emite
una línea del patrón por camino y en la parada de zoom son ~13.790 por entidad.

**MODIFICADO `apps/web/src/lib/cad/render/line-batch.ts`:**

- **El bucle de `push` reescrito**, con las tres decisiones que la forma medida justifica: los
  cuatro arrays y el cursor en LOCALES (escribir por `this.start[…]` son diez cargas de campo por
  segmento que V8 no puede hundir); el vértice final de un segmento **arrastrado** como inicial
  del siguiente, lo que deja el `%` fuera —sólo existía para el segmento de cierre, que ahora se
  escribe aparte—; y **atajo del camino de dos puntos**, sin bucle interior, sin fase acumulada y
  sin cierre. Medido en la sonda pareada sobre el corpus del producto, máquina en silencio
  (loadavg 0,83): **91,4 → 78,5 ns por segmento, ×1,164**. Bajo carga la diferencia crece hasta
  ×1,72 porque el bucle viejo sufre más la contención, y por eso lo que se publica es el suelo.
- **`reserve(segments)` público** y `buildCadLineBatches` reservando **una vez por lote**: cuenta
  los segmentos de cada cubo en una primera pasada —reutilizando la clave, que es una cadena por
  entidad y hacerla dos veces se comería lo ahorrado— y reserva el total exacto. Ese camino pasa
  de ~N segmentos copiados y ~2N reservados a N reservados y **cero copiados**.
- **`CAD_LINE_BATCH_BLOCK_SEGMENTS` (65.536)**, que es la respuesta al caso que sí está en el
  camino caliente y que la reserva exacta no puede resolver: el pipeline llena sus cubos a trozos
  y no sabe el total hasta haber teselado el tile entero.

**MODIFICADO `apps/web/src/lib/cad/render/pipeline.ts`:** cada cubo de estilo de un tile pasa de
un constructor a una **lista de bloques**. El bloque lleno se cierra y se abre otro reservado de
una vez con su tamaño entero, así que **lo ya escrito no se vuelve a copiar nunca**. Contadores
sobre la misma corrida: las duplicaciones copiaban **120,8 MB** y reservaban **274,7 MB** para
104 MB de contenido; con bloques copian **12,6 MB** (×9,6 menos) y reservan **130,6 MB** (×2,1
menos), a cambio de 37 constructores más en toda la vista. Medido con un A/B pareado a nivel de
proceso, alternando las dos políticas: **×1,19 en el suelo y ×1,25 en la mediana pareada**.

Y una consecuencia que conviene decir: `pipeline.ts` estaba a **797 líneas de las 800** que el
presupuesto de monolito permite a un archivo sin asignación, así que el cambio no cabía. No se
tocó `scripts/cad/monolith-budget.json` —ese fichero sólo baja—: se movieron a `line-batch.ts` la
**política de bloques** (`cadLineBatchBlockFor`) y el **armado de los lotes de un tile**
(`cadTileLineBatches`), que es donde pertenecían desde el principio. Quién decide cuándo un cubo
deja de duplicarse es lo mismo que decide cómo crece un constructor, y la regla de la clave de un
lote pertenece a los lotes. `pipeline.ts` queda en 798 líneas.

Un cubo con varios bloques emite un lote por bloque: el primero conserva la clave de siempre y
los siguientes llevan su número detrás (`…#estilo@2`), porque la escena indexa sus mallas por esa
clave. Un cubo de 665.000 segmentos pasa de una llamada de dibujo a diez, cada una un
`drawElementsInstanced` de 65.536 instancias — frente a las 100.000 llamadas del pipeline
anterior, no es una cifra que se discuta. `stats().batches` ahora cuenta bloques y no cubos,
que es lo que `visibleBatches()` devuelve de verdad.

**La condición sin la cual nada de esto se publica: PARIDAD BIT A BIT.**

- `line-batch.spec.ts` (+7 comprobaciones, 24 en total) lleva el **bucle anterior escrito a mano**
  —no importado, para que reescribir el módulo no reescriba también la referencia— y compara las
  cuatro salidas elemento a elemento con `Object.is`, más una huella FNV-1a de la secuencia
  entera. Corpus determinista con las formas que el perfilado encontró y las que no: caminos de
  dos puntos, polilíneas largas, cerrados, un punto suelto y un camino vacío (que se omiten),
  coordenadas de 280.000 unidades con incrementos de 0,05 y segmentos degenerados. Y comprueba que
  **85.041 segmentos repartidos en dos bloques dan los mismos bytes** que un cubo de una pieza.
  Comprobado que MUERDE: quitar el segmento de cierre, desviar la longitud en 1e-7 y encadenar los
  bloques al revés tumban el spec, cada uno por su aserción.
- `scripts/perf/batchpush-empaquetado-probe.mts` (nuevo) lo comprueba sobre **el corpus del
  producto**: **0 descuadres sobre 1.167.126 instancias**, huella `1d5cc389` idéntica, y sale 1 si
  hay uno solo. Publica `docs/cad/evidence/batchpush-empaquetado-100k.json`.

**Y lo que NO se hizo, con su medida al lado.** `Math.hypot` sigue donde estaba. Sustituirla por
`Math.sqrt(dx*dx + dy*dy)` es **×16,3 más rápida** (41,0 ns contra 2,5) y son ~37 de los 78,5 ns
por segmento del bucle, casi la mitad. No se hace porque los dos resultados **difieren en el
último bit del double el 35,3 % de las veces** (medido sobre 3.000.000 de pares de float32), y esa
diferencia entra en la fase de guionado acumulada. Que en float32 coincidan siempre en las
muestras probadas no es prueba: el propio spec de paridad de esta entrega **pasa en verde con la
sustitución puesta**, lo que demuestra que es un riesgo que no se puede probar ausente, no uno que
se haya medido ausente.

#### Todavía no (2026-09-04)

- **La reserva EXACTA del pipeline sigue sin existir.** Los bloques acotan la copia a 12,6 MB pero
  no la eliminan: el primer bloque de cada cubo sigue duplicándose desde 256 hasta tamaño de
  bloque. Reservar el total exige conocerlo, y el tile sólo lo conoce cuando ya ha teselado todo
  lo que contiene; estimarlo desde las entidades que le quedan sobreestima ×12 en el caso medido
  (8,4 M de segmentos proyectados contra 665.000 reales) y multiplicado por los ~2.000 cubos de
  una vista es memoria que un CAD en el navegador no tiene.
- **`batchPush` es ahora el 10,8 % del reparto y `tessellate` el 73,6 %.** Esta entrega no toca el
  cuello principal: los 2,4 millones de caminos que el empaquetado recorre los emite el LOD del
  sombreado, que es **P-velocidad-06** y no es territorio de este frente. Con ese defecto
  resuelto, esta etapa cae sola: son ~78,5 ns por segmento sobre los segmentos que haya.
- **Sólo se bajó el techo de `batchPush`.** Las otras cuatro etapas siguen con los techos
  calibrados bajo carga 3,5–3,9; la corrida republicada hoy se midió con carga 0,78–1,29 y
  apretarlas a esa marca dejaría el trinquete en rojo cada vez que el vecino trabaja, por etapas
  que esta entrega no tocó. El fichero lo dice en `porQueSoloEstaBajo`.
- **La sonda pareada no tiene comando propio** (`package.json` es R2): se invoca a mano. Diseño
  completo en **P-velocidad-07**.
- **La sonda reproduce el flujo, no el planificador.** Empaqueta 1.167.126 segmentos —las 90.000
  entidades de la vista inicial más las 236 que la parada de zoom cambia de escalón—, no los
  2.600.624 que el pipeline empaqueta contando relevos de octava y trozos. La forma es la misma
  (93,3 % de caminos de dos puntos contra 97,2 %) y la paridad vale igual; el reloj de la etapa
  entera se sigue midiendo donde se medía.

### 2026-09-04 · Cierre del frente · Lo que se corrió al cerrar, y lo que salió

Esta entrada no añade producto: verifica. La escribe el cierre del frente después de correr, no
de leer, todo lo que las cinco entregas afirmaron. Salidas literales.

**La condición de integración: `npm run typecheck` — VERDE.**

```
 Tasks:    8 successful, 8 total
Cached:    3 cached, 8 total
  Time:    14.084s
```

**Los 19 specs de `apps/web/src/lib/cad/render/` — los 19 verdes**, incluidos los dos módulos que
esta campaña reescribió (`line-batch.ts`, `pipeline.ts`) y los ocho consumidores de
`tessellateCadEntityBatch`. Ninguna regresión.

**`npm run check:command-integrity` — VERDE:**

```
Integridad de comandos OK: 274 comandos · 82 mutan verificado · 48 delegan · 21 informan ·
115 declaran su límite · 8 exentos declarados · 0 éxitos falsos.
```

**`npm run check:cad` — ROJO, `EXIT=1`, y por nada que este frente haya tocado.** Se detiene en
`check:dwg-evidence` con `AssertionError: el artefacto del disco coincide con lo que el árbol
sostiene hoy`: el artefacto versionado declara 7 bundles admitidos y regenerado aquí declara 0,
porque `VALLE_DWG_CORPUS_MIRROR` está SIN DEFINIR en este contenedor. Comprobado que es ajeno:
`git diff --name-only 646b969..HEAD` no toca ni un archivo DWG (las 26 rutas del frente están
todas en `apps/web/src/lib/cad/render/`, `apps/web/e2e/performance/`, `scripts/perf/`,
`docs/cad/evidence/*100k*` y `docs/history/execution/frentes-superar-20260904/`). No se regeneró: bajar la evidencia DWG
publicada de 7 bundles a 0 sería relajar un gate (R6). Es **P-velocidad-03**.
Verificado también que el frente no tocó **ningún** archivo compartido prohibido: ni
`package.json`, ni `turbo.json`, ni `.github/workflows/*`, ni `rubric.json`, ni
`lint-budget.json`, ni el esquema del documento canónico.

**Los pasos que la cadena ya no alcanza, corridos sueltos.** `node scripts/cad/rubric.mjs
--markdown --check` sigue en `EXIT=1` con «La matriz versionada está DESACTUALIZADA respecto al
script» (**P-velocidad-02**). Se recomprobó el diff exacto y coincide con lo que la petición
promete: **3 líneas añadidas, 4 quitadas**, `29 fila(s) retienen 1 pt` → `30`, y la puntuación
SIN CAMBIO (176/197 hoy, 232/271 destino).

#### Las dos afirmaciones que se eligieron para verificar, y qué pasó

**1) «`render/` es ahora importador NO-spec de `lib/cad/wasm`, que es lo que la regla 6 exigía y
hoy fallaba» — SE SOSTIENE, y lo dice el propio instrumento, no el frente.** En el diff de la
matriz regenerada, la fila `Kernel Rust/WASM` mueve el criterio «Kernel WASM con paridad numérica
verde Y enchufado: alguien fuera de lib/cad/wasm lo importa (regla 6)» de la columna de
PENDIENTES a la de verificados, y su pendiente pasa a «Nada pendiente: todos los criterios
declarados verifican». Y se sostiene también la parte incómoda: **la fila sigue en 1/2**, porque
el conteo de filas capadas sube de 29 a 30 — el techo por evidencia propia se aplicó exactamente
como el «Todavía no» de arriba anticipó. La entrega no infló nada.
`curve-kernel-tessellation.spec.ts`: **28 comprobaciones verdes**, 7.530.200 coordenadas exactas
contra el carril de adaptadores, peor desviación relativa `0.000e+0`, con el binario instalado y
sin él.

**2) «`batchPush` baja de 646,341 a 521,356 ms de mediana y el techo del trinquete baja detrás» —
SE SOSTIENE CON UN MATIZ QUE HAY QUE DECIR.** Lo que se comprobó corriendo:
`node scripts/perf/check-etapas-100k.mjs` sale **VERDE juzgando las TRES corridas publicadas**,
con `batchPush` en 521,356 / 539,243 / 414,091 ms contra un techo de **646,534 ms** que
efectivamente bajó desde 732,068 (el trinquete sólo baja, nunca sube: es más estricto, no menos).
`line-batch.spec.ts`: **24 comprobaciones verdes**, 9.449 segmentos empaquetados BIT A BIT como
antes (huella `1d4ff37f`) y 85.041 en dos bloques con los mismos bytes. Y la sonda pareada,
re-corrida hoy contra salida en scratch para no pisar la evidencia versionada, reprodujo
**0 descuadres sobre 1.167.126 instancias con la MISMA huella `1d5cc389`** que el artefacto
publicado, y la ganancia en la misma dirección (×1,356 con 3 pasadas, contra el ×1,164
publicado con 9 — el publicado es el conservador, que es el que se debe publicar).
**El matiz:** el titular «de 646,341 a 521,356 ms de mediana» compara medianas de dos conjuntos de
corridas medidos con CARGA DISTINTA de la máquina (3,5–3,9 la de agosto-septiembre de la entrega 4,
0,78–1,29 la republicada). Parte de esa diferencia es la máquina, no el código. La evidencia que
sí aísla el código es la **sonda pareada** —los dos bucles alternados en el mismo proceso, mismo
corpus, arrays ya reservados: 91,39 → 78,52 ns por segmento, ×1,164 en el suelo—, y ésa es la que
hay que citar cuando se cite la ganancia. El número de la mediana es el del trinquete, no el de la
ganancia.

#### Todavía no (2026-09-04)

- **El ×7,99 del titular de la entrega 4 ya no es el número del árbol: hoy publica ×7,465.** La
  regresión de `tessellate` contra el 2026-08-31 es real y sigue siendo enorme, pero la
  republicación de la entrega 5 la volvió a medir y el artefacto vigente dice
  `tessellate: agostoMs 477,828 · hoyMedianaMs 3.566,856 · cociente 7,465` (era 3.818,924 /
  7,992). Las dos son medidas honestas de días y cargas distintas; **la del artefacto es la
  autoridad**, y cualquier resumen que siga citando ×7,99 está citando una corrida superada.
  Se deja escrito para que nadie lo lea como dos hechos en conflicto.
- **`npm run check:cad` entero sigue rojo** por P-velocidad-02 y P-velocidad-03, ninguna de las
  dos de este frente y ninguna arreglable desde su territorio.
- **Ningún spec de este frente está encadenado a un gate.** Los cinco
  (`curve-kernel-render-bench.spec.mjs`, `slo-navegador.spec.mjs`, `check-etapas-100k.spec.mjs`,
  y las dos comprobaciones de artefacto `--check`) muerden y corren en segundos, pero encadenarlos
  exige `package.json` (R2). Diseños completos en **P-velocidad-01, -04, -05 y -07**. Hasta que el
  coordinador los aplique se invocan a mano, y por tanto **pueden pudrirse sin que nadie se entere**:
  ése es el riesgo real de dejarlos fuera, dicho aquí en vez de insinuado.
- **Sigue sin haber una sola cifra de GPU ni de navegador de este frente.** El contenedor rasteriza
  con SwiftShader y el runner de la cola 4 se NIEGA a publicar por eso —comprobado hoy: su spec de
  74 comprobaciones enseña el negativo real, «ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device…))
  es rasterizado POR SOFTWARE: sus fps no son los de ningún usuario»—. La fila del SLO sigue
  diciendo 25,3 s y 8,57 fps del 2026-08-21 hasta que el titular corra
  `node scripts/perf/slo-navegador.mjs` en su máquina.
- **Aviso operativo para quien trabaje en este árbol:** `node scripts/cad/rubric.mjs --markdown`
  **escribe** `docs/competitive/autocad-2027-gap-matrix.md` en el disco; no imprime el markdown por
  stdout. Correrlo «sólo para mirar» ensucia un archivo fuera del territorio de este frente. Se
  corrió al verificar P-velocidad-02 y se revirtió con `git checkout --` en el acto; queda dicho
  para que el siguiente no lo committee sin darse cuenta.
