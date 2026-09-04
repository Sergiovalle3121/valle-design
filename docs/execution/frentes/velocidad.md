# F2 · Velocidad sentida

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
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
  NO lo tocas: lo escribes en `docs/execution/frentes/velocidad-peticiones.md` y el coordinador
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
`docs/execution/frentes/velocidad-peticiones.md`: regenerar la matriz cae fuera del territorio
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
`docs/execution/frentes/velocidad-peticiones.md` como **P-velocidad-01**. Hasta que el coordinador
lo aplique, este artefacto se comprueba a mano.
