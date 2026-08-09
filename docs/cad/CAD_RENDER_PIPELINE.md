# Pipeline de render por lotes y por tiles

Estado: **construido y probado, NO enchufado**. Los módulos viven en
`apps/web/src/lib/cad/render/`. `Layout3DEditor.tsx` sigue usando el camino
anterior; el cableado va en un PR posterior y aislado.

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
- **No está enchufado.** Ningún componente construye `CadRenderScene`.
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
`apps/web/e2e/performance/cad-viewport-100k.spec.ts` y sólo se moverán cuando el
pipeline esté enchufado.

A 100.000 entidades, 12 paradas de paneo y un zoom de 4×:

| Métrica | Nuevo | Anterior | Objetivo |
| --- | --- | --- | --- |
| Detalladas en reposo (vista completa) | **100.000** | 2.500 | todas las visibles |
| `firstDetailMs` | 750,5 | 73,4 | ≤ 2.000 |
| `zoomSettleMs` | 23,3 | 39,1 | ≤ 250 |
| `panFrameP95Ms` (n=42) | 7,2 | 64,1 | ≤ 16,7 |
| `zoomFrameP95Ms` (n=3) | 15,4 | 39,1 | ≤ 16,7 |
| Peor cuadro al panear | 11,9 | 64,1 | — |
| `heapGrowthMb` (3 ciclos, gc forzado) | 0,01 | — | ≤ 15 |

Tres lecturas que no hay que saltarse:

1. **`firstDetailMs` es PEOR en el camino nuevo, y está bien que lo sea.** El
   anterior tarda 73 ms porque sólo materializa 2.500 entidades de 100.000. Hacer
   el trabajo entero cuesta más que no hacerlo. Comparar los dos tiempos sin
   mirar la primera fila de la tabla es comparar dibujar con no dibujar.
2. **`zoomFrameP95Ms` NO se puede dar por cumplido.** Sale de tres muestras, así
   que es prácticamente el peor cuadro, y entre corridas se mueve entre 15,4 y
   17,6 ms — a caballo del objetivo de 16,7. Queda pendiente de una medida con
   más muestras.
3. **El resto de la escena del `p95` sí es sólido**: 42 muestras en el paneo,
   7,2 ms frente a 64,1.

## Escenificación de la métrica

`scripts/cad-render-benchmark.mts` vive **aparte** de
`cad-corpus-benchmark.mts` y **no tiene presupuestos**: sólo mide y publica.
Aquel script tiene presupuestos bloqueantes, `peakRssBytes` entre ellos, y
meterle dentro una corrida de 100k los apretaría de rebote. La regla es
explícita: una métrica nueva entra registrada y no bloqueante hasta tener una
línea base versionada debajo, y nunca en el mismo cambio que aprieta una vieja.
Ningún presupuesto existente se movió.
