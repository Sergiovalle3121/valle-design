# Pipeline de render por lotes y por tiles

Estado: **construido, probado y ENCHUFADO por defecto**. Los módulos viven en
`apps/web/src/lib/cad/render/`; el anfitrión que los conecta al editor —
`CadViewportRenderHost`, fuera del monolito a propósito— vive en
`apps/web/src/components/cad/viewport/render-pipeline-host.ts` y lo construye
`Layout3DEditor.tsx` cuando el pipeline elegido es `batched`, que es el
defecto (`apps/web/src/lib/cad/render-pipeline-preference.ts`). Este documento
decía "NO enchufado" desde la ola en que el pipeline era sólo un módulo
probado en Node; quedó desactualizado en cuanto el cableado aterrizó y nadie
lo corrigió — exactamente el tipo de cifra-viva-en-dos-lugares que las reglas
de la campaña de cimientos prohíben. Se corrige aquí, con la evidencia
regenerada desde el arnés en la misma campaña que este cambio.

Hay un camino de vuelta explícito: `?cadRenderPipeline=legacy` en la URL, o lo
guardado en `localStorage` bajo `valle_cad_render_pipeline`, fuerzan el camino
anterior (`planCadNativeRenderBudget`, con su muestreo). Es un interruptor,
no un silencio: `CadRenderPipelineBadge` publica en la barra de estado (tras
`?cadDiag=1`) qué camino dibuja, y cuando el legado muestrea, `Viewport
{rendered}/{visible} visibles · {total} total` se lee en el propio DOM —
16 goldens lo comprueban por `data-testid="cad-native-render-stats"`. El
defecto de producción nunca pasa por ese muestreo: `batched` dibuja SIEMPRE
la vista entera, sin techo.

## El problema que se vino a resolver

El editor creaba un `THREE.Line` **por entidad** y un elemento `<canvas>` **por
MTEXT**. A 100.000 entidades eso son 100.000 objetos de escena y otras tantas
llamadas de dibujo, más una textura RGBA propia por rótulo.

Y `planCadNativeRenderBudget` lo disimulaba **muestreando**: de 100.000
entidades visibles proyectaba 2.500 repartidas uniformemente. Eso no es
lentitud. Es que **el dibujo que ves no es el documento que tienes**, y nada en
pantalla te lo dice.

## Las piezas

| Módulo | Qué hace |
| --- | --- |
| `tile-index.ts` | Rejilla LAXA: cada entidad pertenece al tile que contiene el centro de su caja, y cada tile recuerda la caja union de su contenido. Nada se dibuja dos veces ni se pierde. Panear es una diferencia de conjuntos. |
| `tessellation-cache.ts` | Memoización por (entidad × escalón de LOD) con tope LRU contado en PUNTOS. Se invalida con los `affectedEntityIds` del ejecutor de comandos. |
| `line-batch.ts` | Una instancia por SEGMENTO: `instanceStart`, `instanceEnd`, `instanceStyle` (color, medio grosor px, tipo de línea, profundidad), `instanceArc` (fase de guionado, longitud). |
| `line-batch-three.ts` | Un `InstancedBufferGeometry` por (tile × cubo de estilo) y **un solo material** para todos. |
| `text-atlas.ts` / `text-atlas-three.ts` | Atlas de glifos compartido con quads instanciados, en vez de un canvas por rótulo. |
| `render-scheduler.ts` | Presupuesto de 4 ms por cuadro, prioridad por distancia al centro de la vista, abortable al cambiar la vista. |
| `tessellate.worker.ts` | Teselado fuera del hilo principal, con resultados en búferes cedidos. |
| `pipeline.ts` | Orquestador. Sostiene la propiedad central: en reposo, detalladas == visibles. |
| `scene.ts` | Superficie de enchufe: reconcilia mallas THREE con los lotes visibles. |

## Decisiones que conviene conocer antes de tocar nada

**No se usa `Line2` de three.** Su técnica —expansión del quad en el vertex
shader— sí; su unidad de trabajo no. `Line2` crea un objeto por polilínea, que es
exactamente el problema del que se viene.

**El orden de dibujo viaja como profundidad NDC por instancia** y el shader la
escribe en `gl_Position.z`. `modelSpace.entityIds` es semántica —es lo que hace
que un sombreado quede debajo y un wipeout encima—, así que no puede depender
del orden de las llamadas de dibujo cuando ya no hay un objeto por entidad. A
100.000 posiciones el paso es 1,8e-5 en NDC: ~150 escalones de un búfer de 24
bits por posición. Por eso el material enciende `depthTest`/`depthWrite` y
resuelve el borde con descarte por cobertura en vez de mezcla alfa.

**El grosor entra en PÍXELES** y el shader lo divide por `pixelsPerUnit`. Eso es
LWT: un trazo que mide lo mismo en pantalla a cualquier zoom, imposible con
`LineBasicMaterial` porque `linewidth` se ignora en casi todos los WebGL.
`cadLineVertexWorldPosition` es la especificación ejecutable que el GLSL
transcribe, y el spec comprueba sobre ella que el trazo mide 6 px exactos con el
zoom variando cinco órdenes de magnitud.

**El átomo de trabajo es un TROZO, no un tile.** Un tile con 256 arcos en el
escalón fino son ~33.000 puntos y más de 20 ms: la garantía de progreso del
planificador lo convertiría en un cuadro de 25 ms por bien afinado que estuviera
el presupuesto. El tope va en SEGMENTOS (2.048) porque el coste depende del
nivel de detalle.

## Lo que NO hace, dicho en claro

- **No hay campo de distancia en el texto.** Ni SDF ni MSDF. Los glifos se
  rasterizan a un em fijo de 48 px y se magnifican con filtrado bilineal: por
  encima de ~3× ese tamaño el borde se ablanda. El hueco es sustituible sin
  tocar geometría, empaquetado ni atributos.
- ~~No está enchufado.~~ Corregido: `CadViewportRenderHost` construye
  `CadRenderScene` desde `Layout3DEditor.tsx` cuando el pipeline es `batched`
  (el defecto). Ver "Estado" arriba y `render-pipeline-host.ts` para el
  cableado — profundidad, selección por color de instancia, diagnóstico
  publicado con `useSyncExternalStore`.
- **Los INSERT siguen por `buildCadInsertBatches`**, que ya era la arquitectura
  correcta y sobrevive intacto.
- **La selección sigue usando `CadSpatialIndex`**, cuyo gate pasa. Este pipeline
  no lo toca.

## Números

`npm run benchmark:cad:render --workspace=web`. Los dos caminos, mismo corpus
determinista, mismo guion de vistas, mismo proceso. Evidencia completa en
`evidence/cad-render-benchmark-100k.json`.

**Es trabajo de CPU medido en Node.** No es GPU, ni composición del navegador, ni
cuadros por segundo. Los números de navegador viven en
`apps/web/e2e/performance/cad-viewport-100k.spec.ts` (tras `CAD_PERF_E2E=1`) y
en `evidence/browser-slo-100k.json`; esa evidencia de navegador es la corrida
real más reciente que existe en el repositorio (2026-08-21, `next`/`legacy` en
Chromium con GPU) y no se ha vuelto a regenerar en esta campaña — se declara
así en vez de omitirlo.

A 100.000 entidades, 12 paradas de paneo, vista completa al final. Regenerado
con `npm run benchmark:cad:render --workspace=web -- --output
docs/cad/evidence/cad-render-benchmark-100k.json`; la máquina de esta corrida
es un contenedor de CI/agente (Intel Xeon 4 hilos lógicos, no la máquina de
desarrollo del párrafo del plano real de abajo) — `evidence.environment` lo
declara, no hace falta creer esta tabla:

| Métrica (vista completa) | Nuevo | Anterior | Objetivo |
| --- | --- | --- | --- |
| Detalladas en reposo | **100.000** | 2.500 de 100.000 | todas las visibles |
| `firstDetailMs` | 950,7 | 27,0 | — |
| `zoomSettleMs` | 0,48 | 27,5 | — |
| `panFrameP95Ms` (n=34, paneo parcial) | 7,8 | 36,5 (n=12) | ≤ 16,7 |
| Peor cuadro al panear | 8,1 | 36,5 | — |
| `heapGrowthMb` (3 ciclos, gc forzado) | −2,0 | — | ≤ 8 |

Tres lecturas que no hay que saltarse:

1. **`firstDetailMs` sigue siendo PEOR en el camino nuevo a vista completa, y
   sigue estando bien que lo sea.** El anterior tarda 27 ms porque sólo
   materializa 2.500 entidades de 100.000; el nuevo hace el trabajo entero.
   Comparar los dos tiempos sin mirar la primera fila es comparar dibujar con
   no dibujar.
2. **`panFrameP95Ms` es la fila que importa para "se siente fluido"**: 7,8 ms
   frente a 36,5 ms, con 34 muestras de un paneo parcial (12 paradas) — ambos
   caminos muy por debajo del techo de 16,7 ms de un cuadro a 60 Hz salvo el
   anterior, que ya lo rompe.
3. **La comparación a vista completa (100.000 visibles) es la que demuestra
   la fidelidad**: `detailedAtRest` 100.000/100.000 en el nuevo camino frente
   a 2.500/100.000 en el anterior — el número que importa de este documento
   entero.

## Escenificación de la métrica

`scripts/cad-render-benchmark.mts` vive **aparte** de `cad-corpus-benchmark.mts`
y ya no es report-only para el perfil `reference-100k`: **es bloqueante**, con
una línea base calibrada el 2026-08-10 (`baseline.calibratedOn`, con margen
×2,5) que la corrida de este documento cumple sin violaciones
(`verdict.violations: []`). El resto de perfiles del script sigue entrando
registrado antes de tener línea base propia — la regla no cambió, sólo el
perfil de 100k ya cruzó de "mide y publica" a "bloquea si empeora".
`peakRssBytes` y los presupuestos del corpus general siguen en
`cad-corpus-benchmark.mts`, sin tocar.

## El perfil «plano real»: 20.000 entidades, que es el tamaño que importa

Los números de arriba son de 100.000 entidades de LINE/CIRCLE/ARC. Es una cifra
elegida para enseñar escala, y no contesta la pregunta que decide si el primer
cliente se queda. Un plano de arquitectura real de un despacho mexicano tiene
entre 5.000 y 30.000 entidades y **otra composición**: muros por caras, cadenas
de cotas, hatch de acabados, rótulos y bloques repetidos. En el corpus de
100.000 esos tipos están literalmente a cero.

`npm run benchmark:cad:plan --workspace=web`. Evidencia en
`evidence/cad-plan-benchmark-20k.json`; el corpus es la mezcla `plano-real`, y
la derivación de cada proporción —con sus supuestos declarados— está en la
cabecera de `apps/web/src/lib/cad/benchmark/corpus-plano-real-builders.ts`.

Composición exacta a 20.000: 5.800 LINE · 3.000 LWPOLYLINE · 2.800 INSERT sobre
4 definiciones · 2.600 DIMENSION · 2.000 MTEXT · 1.400 HATCH · 1.200 CIRCLE ·
1.200 ARC, en 11 capas.

Regenerado con `npm run benchmark:cad:plan --workspace=web -- --output
docs/cad/evidence/cad-plan-benchmark-20k.json`, mediana de tres corridas.
`evidence.environment.declaredMachine` ya no es un literal fijo del portátil
de calibración — se deriva de lo que Node detecta en cada corrida, así que
esta tabla lleva la máquina real al lado en vez de heredar la de otra
persona:

| Operación | p50 | p95 | Máx |
| --- | --- | --- | --- |
| Cuadro al panear | 4,14 | 6,25 | 6,62 |
| Cuadro al hacer zoom | 1,52 | 4,50 | 4,50 |
| Selección por ventana (7 ent.) | 0,06 | 0,13 | 1,49 |
| Selección por captura (11 ent.) | 0,04 | 0,08 | 0,14 |
| OSNAP (181/200 enganchan) | 0,03 | 0,93 | 1,73 |
| MOVE de grupo, commit→asentado | 2,58 | 4,45 | 6,05 |
| BORRAR grupo, commit→asentado | 1,61 | 3,61 | 4,50 |

Apertura 482,2 ms en 91 cuadros; índice de selección del documento 180,4 ms.
Estos absolutos son más rápidos que los del portátil de calibración citados en
corridas previas de este documento — la máquina de este contenedor tiene
menos núcleos pero sin la "carga vecina" que declaraba la corrida anterior; el
número que importa no es el absoluto sino que las siete operaciones sigan
cabiendo en un cuadro de 60 Hz, y siguen.

**Las siete operaciones de gesto caben en un cuadro de 60 Hz**, con holgura
amplia. No se tocó el motor por esto, y la razón está medida: el reparto por
etapa de la apertura dice que **el 80,8 % es teselar y el 14,8 % escribir
instancias** —trabajo que impone el contenido del plano— mientras que la
contabilidad del propio orquestador (recalcular la vista y encolar tiles) es
**0,4 %**. No hay desperdicio estructural que quitar; una optimización sin
problema medido sólo habría añadido riesgo.

El trinquete vive en `apps/web/src/lib/cad/benchmark/plan-budget.spec.ts` y sus
presupuestos están calibrados **para la máquina de desarrollo original**
(Ryzen 5 5500U, ver la cabecera de ese archivo), no para el runner de CI ni
para el contenedor que produjo la tabla de arriba — por eso el gate se evalúa
ejecutando el benchmark de nuevo en cada corrida, no comparando contra esta
tabla.
