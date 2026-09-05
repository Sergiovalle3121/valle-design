# Auditoría 17 · Rendimiento: bundle, render, 100k entidades, memoria

**Dimensión:** Rendimiento (tamaño de bundle y presupuestos, tiempo hasta interactivo, render
de 10k y 100k, fps de paneo y zoom, memoria y fugas, WASM, hilo principal, workers,
virtualización, caché).
**Fecha de la auditoría:** 2026-09-05.
**Método:** lectura del árbol real (`apps/web/src`, `apps/api/src`, `scripts/perf`,
`docs/cad/evidence`). Ninguna afirmación de este informe se hace sin fichero y línea, o sin un
número leído de un artefacto versionado. No se modificó código de producto.

**Veredicto en una frase:** el motor de render por lotes y tiles es trabajo de verdad —convierte
un camino que hacía 0,03 fps en uno que hace 30–60 fps sobre la mayoría de las mezclas a
100.000 entidades— pero la cifra que el propio proyecto declaró como su SLO **falla en la mezcla
que un despacho de arquitectura dibuja de verdad**, y no hay ni un solo gate automático de
navegador que impida que vuelva a empeorar.

**Nota: 6/10** contra AutoCAD 2027 completo en esta dimensión.

---

## 0 · Cómo se leyó la rúbrica y qué se comprobó

La fila `performance` de `docs/competitive/rubric.json` vale 12 puntos y el propio proyecto se
concede 11 (`node scripts/cad/rubric.mjs`). El punto que no se cobra es
`performance.architecture-100k`, con `kind: "todaviaNo"` y este motivo textual:

> «La corrida vigente de architecture@100k mide 25.3 s de detalle completo y 8.57 fps: el SLO NO
> se cumple sobre la mezcla pesada.»

Se comprobó cada uno de los siete criterios contra el árbol. Resultado:

| Criterio | Lo que dice | Lo que encontré |
| --- | --- | --- |
| `performance.index` | índice espacial + LOD + presupuesto | **Cierto.** `render/tile-index.ts`, `render/tessellation-cache.ts`, `render/render-scheduler.ts` existen, están probados y se usan. |
| `performance.corpus` | corpus determinista por sha256 | **Cierto**, y además hay CINCO mezclas (`benchmark/corpus-mixes-manifest.json`), cada una con su sha256. |
| `performance.playwright` | spec a 100k con artefacto por corrida | **Cierto**, `e2e/performance/cad-viewport-100k.spec.ts` — pero **no corre en CI** (§4.2). |
| `performance.pipeline-measured` | primer detalle <1 s, zoom <100 ms a 100k | **Cierto pero engañoso**: se mide sobre un corpus de sólo línea/círculo/arco (H4). |
| `performance.pipeline-wired` | «el editor USA ese pipeline» | **Cierto y ya no es el hueco que la evidencia dice que es** (§1.2). |
| `performance.browser-slo` | ≤5 s, ≥30 fps, zoom ≤500 ms en `architecture@10k` | **Cumplido** (1.907 ms / 59,5 fps / 33 ms), pero el gate lo lee **por posición de array** (§4.3). |
| `performance.architecture-100k` | lo mismo a 100k | **Falla**: 25.339,8 ms y 8,569 fps. |

Dos textos de la rúbrica y de la evidencia están **caducos** y hay que corregirlos:

1. El campo `gap` de la categoría `performance` sigue diciendo «48,2 s hasta el detalle completo y
   1,4 fps de paneo (corpus architecture, 10k, GPU por software)». La corrida vigente
   (`docs/cad/evidence/browser-slo-100k.json`, `profiles[0]`) mide **1.907,3 ms y 59,524 fps**
   sobre ese mismo perfil. El texto describe una realidad de hace dos campañas.
2. El `gap` de la categoría `wasm` dice «NADIE lo importa fuera de `lib/cad/wasm`». Falso hoy:
   `apps/web/src/lib/cad/render/tessellate.worker.ts:31` y
   `apps/web/src/lib/cad/render/curve-kernel-tessellation.ts:75` lo importan, y el worker lo
   calienta a propósito. Lo que sigue siendo verdad —y es otra cosa— es que el kernel **sólo llega
   a las entidades que viajan al worker** (H1, §3).

---

## 1 · Lo que ya está construido y funciona

No es poco, y hay que decirlo antes de las quejas.

### 1.1 El pipeline por lotes y tiles

`apps/web/src/lib/cad/render/pipeline.ts` (798 líneas) orquesta cinco piezas que están todas
escritas, probadas y en producción:

- **Índice de tiles con rejilla laxa** (`tile-index.ts`): cada entidad vive en UN tile —el que
  contiene el centro de su caja— y el tile recuerda la caja unión de su contenido. Eso evita que
  una línea a caballo de cuatro tiles se dibuje cuatro veces, que es un artefacto visible con
  mezcla alfa. El tamaño de tile se deriva del documento (`suggestCadTileSize`, tile-index.ts:317)
  apuntando a ~256 entidades por tile.
- **Caché LRU por (entidad × escalón de LOD)** (`tessellation-cache.ts`) con tres escalones
  (`CAD_RENDER_LOD_SEGMENTS = [8, 32, 128]`) y umbrales en píxeles aparentes (24 px y 320 px).
- **Planificador con presupuesto adaptativo** (`render-scheduler.ts`): montículo binario ordenado
  por distancia al centro de la vista, presupuesto = 25 % del cuadro OBSERVADO con techo de 250 ms.
  La cabecera del módulo explica por qué la constante de 4 ms era destructiva en un rasterizador
  por software (200 cuadros × 1,16 s = casi cuatro minutos), y la medida está publicada. Es de las
  mejores decisiones de ingeniería del repositorio.
- **Teselado fuera de hilo** con un pool de hasta 4 workers
  (`tessellate-worker-client.ts:79`, `Math.min(4, max(1, hardwareConcurrency - 1))`), con
  arrays tipados **transferibles** (no copiados) y reserva síncrona limpia si el worker no arranca.
- **Doble búfer del cambio de octava** (`pipeline.ts:212`, campo `staging`): el tile de la octava
  vieja sigue sirviendo mientras el relevo se construye, y el relevo es un swap atómico. Sin esto
  el usuario miraba huecos durante toda la reconstrucción.

### 1.2 El pipeline SÍ está enchufado al editor

Esto importa porque la evidencia publicada dice lo contrario y ya no es verdad.
`docs/cad/evidence/browser-slo-100k.json`, campo `scope.notMeasured`, primera entrada:

> «el editor: el pipeline nuevo todavía no está enchufado a `Layout3DEditor.tsx`, así que esto
> mide los módulos, no el recorrido de interfaz»

Y la cabecera de `apps/web/e2e/performance/cad-render-browser.spec.ts:8-15` reproduce el grep que
lo demostraba. **Hoy ese grep ya no sale vacío.** El cableado existe:

- `apps/web/src/components/cad/viewport/render-pipeline-host.ts` (606 líneas) construye
  `CadRenderScene` y expone `frame()`, `replace()`, `invalidate()`, `setSelection()`.
- `apps/web/src/components/cad/editor/Layout3DEditor.tsx:568` importa
  `@/lib/cad/render-pipeline-preference`, y `:3114` llama `setSelection` sobre el anfitrión.
- `apps/web/src/lib/cad/render-pipeline-preference.ts:33`:
  `CAD_RENDER_PIPELINE_DEFAULT = "batched"`. El defecto es el camino nuevo.

Consecuencia práctica **importante para leer los números**: el arnés de medida
(`apps/web/src/lib/cad/benchmark/browser-harness.ts:362-370`) llama `renderScene.sync()` en CADA
cuadro sin condición, mientras el producto lo llama sólo con `this.dirty`
(`render-pipeline-host.ts:452-455`). Los fps publicados son por tanto **pesimistas en reposo** y
realistas durante paneo (donde los tiles cambian y `dirty` se enciende igual). Es una diferencia
que la evidencia debería declarar y no declara.

### 1.3 La comparación contra el camino anterior es demoledora, a favor

`docs/cad/evidence/browser-slo-100k.json`, mismas corridas, misma máquina (AMD Ryzen 5 5500U con
GPU real, ANGLE D3D11), mismo corpus:

| Mezcla @100k | `next` fps p95 paneo | `legacy` fps p95 paneo | `next` GPU bytes | `legacy` GPU bytes |
| --- | ---: | ---: | ---: | ---: |
| baseline-line-circle-arc | 30,03 | 0,411 | 280 KB | 6,7 MB |
| mechanical | 30,03 | 0,049 | 577 KB | 29,1 MB |
| cartography | 20,12 | 0,074 | 456 KB | 41,2 MB |
| text-hostile | 8,562 | 0,220 | 1,13 MB | 97,1 MB (truncado) |
| architecture | 8,569 | 0,037 | 1,90 MB | 124,5 MB (truncado) |

El camino anterior **se truncaba a sí mismo** para no matar el navegador: `truncationReason` de
`architecture@10k` legacy dice literalmente «superó 384 MB de textura tras construir 1.415 de
10.000 entidades planificadas». El atlas de glifos (`render/text-atlas.ts`) sustituye un `<canvas>`
por rótulo —2 MB de RGBA cada uno— por UNA textura y un quad instanciado por glifo. Es la
diferencia entre 124 MB y 1,9 MB de GPU. Ese trabajo está hecho y está bien hecho.

### 1.4 Presupuestos de bundle con trinquete

- `scripts/perf/bundle-budget.json`: techo de JS de primera carga por ruta, en KB gzip, 14 rutas,
  con la regla escrita («`--write` sólo BAJA techos»). `/studio/demo-123` está en 288,8 KB gzip.
- `apps/web/e2e/performance/frontend-load-budget.spec.ts` mide lo otro y más difícil: **los bytes
  de JS que el navegador ACABA descargando hasta que el editor es usable**, deduplicados por URL
  (la cabecera explica por qué: los tres workers de teselado inflaban el chunk de 197 a 592 KB).
  Techo en `frontend-load-baseline.json`: `estudioJsKB: 3488.8`, medido 3.354,6.
  Esta spec **no lleva la guarda `CAD_PERF_E2E`** a propósito, así que sí corre en PR. Correcto.
- La campaña de fuentes está **cerrada**: `apps/web/public/fonts/` sirve 552 KB de subconjuntos
  woff2 con hash de contenido, frente a los 1.093 KB de TTF completos que el BACKLOG documentaba;
  `apps/web/src/app/layout.tsx:137-147` precarga **dos** caras, no cinco. El móvil pasó de 73 a
  81/85/87 de Lighthouse con LCP de 4,1–5,0 s (`scripts/perf/lighthouserc.mobile.json`).
- Gates de Lighthouse **bloqueantes** en CI (`.github/workflows/ci.yml:290`): escritorio ≥0,95,
  móvil ≥0,78, con la historia de la calibración escrita al lado.

### 1.5 Reparto por etapa con trinquete y candado anti-trampa

`scripts/perf/check-etapas-100k.mjs` + `scripts/perf/etapas-100k-budget.json` presupuestan cinco
etapas (`tessellate`, `batchPush`, `spatialIndex`, `insertExpand`, `tileEnqueue`) MÁS dos totales.
El segundo total es `segmentsAtRest`, y su razón está escrita:

> «un techo por etapa a solas se esquiva sin querer… el reloj de una etapa baja también cuando se
> dibuja menos, y "más rápido porque dibuja menos" es un plano mal dibujado, no una optimización».

Además fija invariantes (`detailedAtRest: 414`, `visibleAtRest: 414`, `callsTessellateMax: 91175`).
Es un diseño de gate mejor que el de la mayoría de productos comerciales. Su problema es otro y
está en §4.4.

### 1.6 Límites del documento publicados, no adivinados

`packages/contracts/src/design-contracts.ts:176-209` es la fuente única (el API los importa,
`apps/api/src/modules/cad-documents/cad-document-validation.ts:58`), y
`docs/cad/evidence/document-limits.json` publica la corrida que los sostiene: 100.000 entidades,
24,7 MB de documento, 197 MB de heap, checkpoint de 1.865 ms, ventana de pérdida peor caso de
16,9 s, con la máquina declarada. Eso es más honestidad de la que da AutoCAD sobre sus propios
límites.

### 1.7 Tres workers, no uno

`tessellate.worker.ts` (teselado), `cad-recovery.worker.ts` (codificación de checkpoints) y
`document-import.worker.ts` (importación). El hilo principal no codifica gzip ni parsea DXF.

---

## 2 · Root-cause del SLO que falla: `architecture@100k`

**El número:** `docs/cad/evidence/browser-slo-100k.json`, perfil `architecture` / 100000 / `next`:
`fullDetailMs: 25339.8` (objetivo ≤5.000), `pan.fpsP95: 8.569` (objetivo ≥30),
`zoomSettleMs: 302.9` (objetivo ≤500, **este sí cumple**).
`fullDetailCpuMs: 22727.4` de 25.339,8: el **90 % del tiempo es CPU del hilo principal**, no
presentación. No es un problema de GPU: `gpu.gpuBytesEstimate` es 1,9 MB y `drawCallsP95` 151.

Hay **tres causas independientes** y todas se pueden aislar con los datos publicados.

### 2.1 Causa A — el 34 % del corpus NO puede salir del hilo principal

`architecture@100k` (`benchmark/corpus-mixes-manifest.json`) es:

| tipo | entidades |
| --- | ---: |
| insert | **34.000** |
| polyline | 18.000 |
| dimension | 17.000 |
| hatch | 14.000 |
| mtext | 10.000 |
| line | 7.000 |

El carril fuera de hilo excluye por diseño las entidades cuyo adaptador declara
`renderer.needsDocument`:

```ts
// apps/web/src/lib/cad/render/pipeline-offthread.ts:103-107
export function cadEntityTessellatesWithoutDocument(entity: CadNativeEntity): boolean {
  return CAD_ENTITY_REGISTRY.adapter(entity).renderer.needsDocument !== true;
}
```

Y las tres marcas están aquí:

- `apps/web/src/lib/cad/block-text-adapters.ts:382` → **INSERT**
- `apps/web/src/lib/cad/wall-entity-adapter.ts:248` → WALL
- `apps/web/src/lib/cad/opening-entity-adapter.ts:248` → OPENING

O sea: **34.000 de 100.000 entidades de esta mezcla —los INSERT— se teselan en el hilo principal,
síncronamente, dentro del bucle de `buildTileChunk`** (`pipeline.ts:550`, la guarda
`this.offThread.active && cadEntityTessellatesWithoutDocument(entity)`), y además **jamás tocan el
kernel WASM**, que sólo vive dentro del worker (`tessellate.worker.ts:31`).

La correlación lo confirma: `mechanical@100k` (cero inserts, cero hatch, cero mtext) asienta en
5.177 ms y panea a 30 fps. `architecture@100k` (34.000 inserts) asienta en 25.339 ms. Mismo
tamaño, mismo pipeline, misma máquina, **4,9× más lento**.

La causa raíz es de contrato, no de aritmética: el worker no recibe el documento («el documento
nunca viaja», `pipeline-offthread.ts`, cabecera de `request`), así que cualquier entidad que
resuelva su geometría contra el documento queda fuera. Un INSERT sólo necesita **su definición de
bloque**, no el documento entero. Esa es la palanca (§3.1).

### 2.2 Causa B — el texto se reconstruye ENTERO en cada reconciliación

`apps/web/src/lib/cad/render/scene.ts:262-289`:

```ts
const requests = this.pipeline.visibleTextRequests();   // array nuevo, O(rótulos visibles)
...
if (this.textMesh) {                                     // :265
  this.textMesh.geometry.dispose();
  this.textMesh.removeFromParent();
  this.textMesh = null;
}
if (requests.length > 0) {
  const quads = buildCadTextQuads(requests, ...);        // 5 Float32Array nuevos, O(glifos)
  ...
  this.textMesh = buildCadTextAtlasMesh(quads, this.textMaterial);   // :285 geometría nueva
}
```

`buildCadTextQuads` (`text-atlas.ts:235-251`) reserva **cinco `Float32Array` dimensionados al total
de glifos** y recorre carácter a carácter pidiendo métricas. En `architecture@100k` eso son
**2.073 glifos** (`textObjects` del perfil) reconstruidos y resubidos a la GPU en cada `sync()`.

El propio arnés lo instrumentó para poder afirmarlo con una cifra y no con una lectura de código
(`browser-harness.ts:352-357`), y el resultado está publicado:
`restSync: { idleFrames: 8, glyphRebuildFrames: 8, glyphsPerRebuild: 1811 }`. **Ocho de ocho.**
El mismo 8/8 aparece en `architecture@10k` (528 glifos), `text-hostile`, `cartography` y
`mechanical`. Nadie lo ha arreglado.

La correlación con los fps es exacta:

| Mezcla @100k | mtext en el corpus | fps p95 paneo |
| --- | ---: | ---: |
| baseline | 0 | 30,03 |
| mechanical | 0 | 30,03 |
| cartography | 3.000 | 20,12 |
| text-hostile | 20.000 | 8,562 |
| architecture | 10.000 (+17.000 cotas con rótulo) | 8,569 |

En el producto el `dirty` de `render-pipeline-host.ts:452` evita el coste **en reposo**, pero
durante un paneo los tiles entran y salen en cada cuadro, `dirty` se enciende y se paga entero.
Los 8,5 fps de paneo son, en buena parte, esto.

### 2.3 Causa C — la caché de teselado es más pequeña que el conjunto de trabajo

```ts
// apps/web/src/lib/cad/render/tessellation-cache.ts:166
export const CAD_TESSELLATION_CACHE_DEFAULT_MAX_POINTS = 1_500_000;
```

Y el conjunto residente medido de esa misma mezcla:

```json
// docs/cad/evidence/render-stage-architecture-100k.json · reparto.segmentsAtRest
{ "min": 2199624, "mediana": 2199624, "max": 2199624 }
```

**2,2 millones de segmentos residentes contra un techo de 1,5 millones de puntos.** La caché no
puede sostener ni una sola vista completa de esta mezcla: `evictWhileOverBudget()`
(`tessellation-cache.ts:236`) desaloja desde el más antiguo mientras se llena, así que cada tile
que sale y vuelve a entrar de la vista —lo que pasa constantemente al panear— vuelve a teselarse
desde cero. Nadie sembró ese número contra este corpus; 1.500.000 es un valor por defecto de
cuando el corpus era línea/círculo/arco.

### 2.4 El acantilado de LOD del sombreado, y una nota de código que la evidencia desmiente

`apps/web/src/lib/cad/hatch-entity-adapter.ts:77-135` define DOS escalones útiles, no tres:

```ts
const CAD_HATCH_LOD_OUTLINE_ONLY_MAX_SEGMENTS = 8;   // :77 → sólo contorno
const CAD_HATCH_LOD_MEDIUM_SEGMENTS = 32;            // :89 → sólo colapsa guiones
```

Por encima de 8 segmentos el espaciado del patrón es **el exacto**. Medido, en el artefacto de
etapas (`render-stage-architecture-100k.json`, `lod.porTipo`):

| tipo | tier 0 | tier 1 | tier 2 | salto 0→1 |
| --- | ---: | ---: | ---: | ---: |
| **hatch** | 4 | **13.790,8** | 13.790,8 | **×3.447,7** |
| insert | 5,3 | 12,3 | 40,1 | ×2,3 |
| dimension | 5 | 5 | 5 | ×1 |

Un salto de ×3.447 entre dos escalones consecutivos no es un LOD, es un interruptor. El comentario
del adaptador lo justifica así (hatch-entity-adapter.ts:122-127):

> «en `architecture@100k` los 14 000 sombreados están por debajo de los 24 px, o sea en tier 0…
> El tier medio sólo aparece cuando se ha hecho zoom lo bastante como para que quepan pocos
> sombreados en pantalla — justo cuando el rendimiento no era el problema.»

**La evidencia versionada dice lo contrario.** El censo de la parada de zoom del mismo recorrido
que produce el reparto (`render-stage-architecture-100k.json`,
`lod.censoEnLaParadaDeZoom.porTipo`) da:

```json
{ "tipo": "hatch", "tier0": 0, "tier1": 14000, "tier2": 0 }
```

Los 14.000 sombreados están en tier 1 en la parada de zoom, cada uno pagando ~13.790 segmentos.
Eso, y no otra cosa, es lo que llevó `segmentsAtRest` de 15.250 (agosto) a 2.199.624 (septiembre):
**×144,24**, publicado por el propio proyecto en `contraste.segmentsAtRest.cociente`. La spec
`render/hatch-lod-volume.spec.ts` es honesta y avisa («Lo que esta prueba protege es la SESIÓN DE
TRABAJO… no el número del SLO»), pero el comentario del adaptador se quedó con la afirmación
contraria y hay que corregirlo o el próximo que optimice esto lo descartará por el comentario.

### 2.5 Resumen del root-cause

El SLO no falla por un cuello: falla por tres, y en este orden de peso:

1. **34.000 INSERT teselados en el hilo principal**, sin worker y sin WASM (causa del 25 s).
2. **Reconstrucción íntegra de la malla de texto en cada reconciliación** (causa dominante de los
   8,5 fps de paneo).
3. **Caché de teselado dimensionada por debajo del conjunto de trabajo** (multiplica las dos
   anteriores durante el paneo).

Y una cuarta que sólo aparece en sesión de trabajo con zoom: **el acantilado de LOD del sombreado**.

---

## 3 · Los huecos, por lo que más duele

### H1 · Los INSERT (y los muros) no salen del hilo principal ni tocan el kernel WASM

- **AutoCAD:** un bloque se resuelve una vez y se dibuja por instancia con transformación; el
  regen de 34.000 referencias de bloque no bloquea la interfaz.
- **Valle hoy:** `pipeline-offthread.ts:103` excluye del worker todo adaptador con
  `renderer.needsDocument`, y `block-text-adapters.ts:382` marca INSERT así. El kernel WASM
  —3,11× medido, `docs/cad/evidence/wasm-parity.json` `benchmark[0].speedupMedian`— vive dentro
  del worker (`tessellate.worker.ts:31`), así que los INSERT tampoco lo ven.
- **Duele en:** abrir una planta arquitectónica normal. 25 s con el ratón a tirones frente a los
  ≤5 s prometidos.
- **Cómo se construye:** el worker no necesita el documento, necesita **las definiciones de
  bloque referenciadas por el lote**. Añadir al mensaje del worker un `blockDefs: Record<string,
  CadBlockDefinition>` recortado a los bloques citados (que es un puñado, no 34.000), extender
  `CadTessellateWorkerRequest` (`tessellate.worker.ts:34-43`) y sustituir el predicado binario
  `needsDocument` por un `renderer.documentScope: "none" | "blocks" | "neighborhood"` en
  `entity-runtime.ts:126`. WALL/OPENING se quedan en `"neighborhood"` y siguen en el hilo
  principal; INSERT pasa a `"blocks"` y viaja.
- **Cómo se verifica:** re-medir `architecture@100k` con `scripts/perf/slo-navegador.mjs` y exigir
  `fullDetailMs ≤ 5000`; y un spec de paridad coordenada a coordenada entre el INSERT teselado en
  worker y en hilo principal, del estilo del que ya existe en `tessellate-worker.spec.ts`.
- **Esfuerzo:** varios días.
- **Severidad: bloqueante.**

### H2 · La malla de texto se reconstruye entera en cada `sync()`

- **AutoCAD:** el texto es geometría cacheada; regenerarla no es función de mover la vista.
- **Valle hoy:** `scene.ts:265-289`. Medido y publicado: `glyphRebuildFrames == idleFrames` en
  todos los perfiles (`browser-slo-100k.json`, campo `restSync`).
- **Duele en:** panear cualquier plano con rótulos. Los 8,5 fps de `architecture@100k` y
  `text-hostile@100k` son esto.
- **Cómo se construye:** dar identidad a los quads de texto POR TILE, igual que ya la tienen los
  lotes de línea. Hoy `pipeline.visibleTextRequests()` (pipeline.ts:754) concatena y
  `CadRenderScene` construye una sola malla; el cambio es (a) memorizar los quads en el
  `ResidentTile` junto a `batches` y anularlos con la misma regla («escribir instancias es lo único
  que invalida»), y (b) mantener un `Map<CadTileId, THREE.Mesh>` de texto en `scene.ts` con la
  misma reconciliación crear/retener/liberar que ya hace para `this.meshes` (scene.ts:220-255). El
  atlas de glifos es global y no cambia.
- **Cómo se verifica:** el arnés YA tiene el contador. Convertir `restSync.glyphRebuildFrames` en
  aserción: con `idleFrames > 0`, `glyphRebuildFrames` debe ser 0. Y un techo de fps de paneo sobre
  `text-hostile@100k`.
- **Esfuerzo:** varios días.
- **Severidad: bloqueante.**

### H3 · No hay ni un gate automático de rendimiento de navegador

- **AutoCAD:** no aplica; Autodesk no publica gates. Pero el punto es competitivo: aquí la
  ausencia significa que un PR puede devolver los fps a la mitad y CI seguirá verde.
- **Valle hoy:** `.github/workflows/ci.yml:1102` corre **una sola** spec de
  `e2e/performance/`: `cad-dense-editing-100k`. Y esa spec **no asierta ni un milisegundo**: sus
  `expect` (líneas 628-653) son sobre conteos, profundidad de historia y ausencia de errores de
  consola, con `SETTLE_BUDGET_MS = 900_000` (línea 90). El comentario del workflow lo declara:
  «Los otros tres specs de e2e/performance (viewport-100k, render-browser, import-fuzzing) …
  siguen siendo corridas MANUALES documentadas». `cad-editor-memory-cycles` tampoco corre.
- **Duele en:** todo. La evidencia de navegador sólo existe cuando el titular la corre a mano en su
  portátil (`scripts/perf/slo-navegador.mjs`, cabecera: «la medida sólo existe en la máquina del
  titular»).
- **Cómo se construye:** un escalón `smoke` de `cad-render-browser.spec.ts` con **una** mezcla
  (`text-hostile@10k`, la que separa mejor los caminos) y aserciones **relativas**, no absolutas:
  `glyphRebuildFrames === 0`, `detailedAtRest === visibleAtRest`, `drawCallsP95 ≤ techo` y
  `pan.cpuMsP95 ≤ techo` — CPU del pipeline, no fps, porque el fps de SwiftShader mide al
  rasterizador. Los techos van en un JSON con trinquete, como los otros.
- **Cómo se verifica:** el propio job. Se calibra con tres corridas del runner y margen por
  dispersión, exactamente la fórmula de `etapas-100k-budget.json`.
- **Esfuerzo:** varios días.
- **Severidad: bloqueante.**

### H4 · El benchmark BLOQUEANTE mide un corpus sin texto, sin sombreado, sin cotas y sin bloques

- **Valle hoy:** `docs/cad/evidence/cad-render-benchmark-100k.json` es el único perfil con
  `"enforcement": "blocking"` y su `corpus.entityMix` es:
  `line: 49870, circle: 24966, arc: 25164` y **cero** de polyline, hatch, text, mtext, dimension,
  insert, ellipse, spline, table, image. Es decir: el gate que bloquea excluye exactamente los
  cuatro tipos que hacen fallar el SLO. Además corre en Node —sin GPU, sin canvas— y su propio
  `scope.notMeasured` lo dice: «rasterizado de glifos: en Node no hay canvas, así que el atlas de
  texto no entra en esta corrida».
- **Duele en:** falsa seguridad. `performance.pipeline-measured` cobra 2 puntos por «primer detalle
  <1 s a 100k» leyendo `measurements/next/firstDetailMs = 510.079` de un corpus que ningún
  arquitecto dibuja.
- **Cómo se construye:** añadir un perfil `reference-100k-mezcla` al mismo benchmark que use
  `createCadCorpusMix({ mix: "plano-real", entities: 100000 })` —la mezcla que el propio repo
  declara como «lo que un despacho mexicano dibuja de verdad»
  (`document-limits.json`, `scenario.corpusRationale`)— y presupuestarlo por separado. El corpus
  actual se conserva como línea base histórica.
- **Cómo se verifica:** `render-benchmark.ts` ya acepta el corpus por parámetro; sólo hay que
  publicar el segundo perfil y darle techos calibrados.
- **Esfuerzo:** un día.
- **Severidad: alta.**

### H5 · La caché de teselado no cabe en una vista

- **Valle hoy:** `tessellation-cache.ts:166` fija 1.500.000 puntos; el conjunto residente medido de
  `architecture@100k` es 2.199.624 segmentos.
- **Duele en:** panear. Cada tile que sale y vuelve se retesela desde cero, y como los INSERT no
  van al worker (H1), esa reteselación se paga en el hilo del ratón.
- **Cómo se construye:** dimensionar el techo con el documento, no con una constante:
  `maxPoints = clamp(segmentosEstimadosDeLaVista × 3, 1.5e6, presupuestoDeMemoria)`. El presupuesto
  de memoria sale del `deviceMemory` cuando el navegador lo expone y de un defecto conservador
  cuando no. Publicar `cache.evictions` (ya está en `CadTessellationCacheStats`) en el indicador de
  diagnóstico y en el artefacto: hoy se calcula y no se mira.
- **Cómo se verifica:** invariante nueva en `etapas-100k-budget.json`: `cacheEvictions` durante el
  recorrido de paneo debe ser 0 sobre `architecture@100k`. Es exactamente la clase de candado que
  ese fichero ya sabe poner.
- **Esfuerzo:** un día.
- **Severidad: alta.**

### H6 · Designar re-tesela la geometría; designar todo re-tesela el dibujo entero

- **AutoCAD:** la designación es un estado de dibujo (realce), no una regeneración. Seleccionar
  100.000 objetos con Ctrl+A es instantáneo.
- **Valle hoy:** el color de selección entra por `styleOf`
  (`render-pipeline-host.ts:275-283`), el color forma parte de la **clave de cubo**
  (`line-batch.ts:226-227`, `cadLineStyleKey` incluye `packCadColor(style.color)`), así que cambiar
  la selección obliga a `invalidate()` → `this.cache.invalidate(affected)` y a expulsar **todos los
  tiles residentes que contengan algo tocado** (`pipeline.ts:403-408`). Un Ctrl+A sobre 100k expulsa
  todos los tiles visibles y vuelve a pagar los 25 s.
- **Duele en:** «designar todo y cambiar de capa», que es el gesto más común al recibir un plano
  ajeno. Y en la ventana de designación por arrastre, donde el conjunto cambia en cada cuadro.
- **Cómo se construye:** sacar la selección de la geometría. Un atributo por instancia
  `cadSelected` (0/1) fuera de la clave de cubo, con el color de realce como **uniform** en
  `line-batch-three.ts`; `setSelection` pasa a escribir ese atributo in situ
  (`geometry.attributes.cadStyle.needsUpdate = true` sobre el rango tocado) sin invalidar caché ni
  expulsar tiles. Es un cambio de shader y de empaquetado, contenido en `line-batch.ts` +
  `line-batch-three.ts` + `render-pipeline-host.setSelection`.
- **Cómo se verifica:** un spec que designe las 100.000 entidades y afirme `evicted === 0` y
  `cache.invalidations === 0`; y un golden que compruebe que el realce sigue viéndose. La spec de
  edición densa ya tiene el gesto (`massiveSelected === ENTITY_COUNT`, línea 637); sólo le falta el
  techo de tiempo.
- **Esfuerzo:** varios días.
- **Severidad: alta.**

### H7 · No hay artefacto versionado del estrés denso, que es la única spec de perf que CI corre

- **Valle hoy:** `scripts/perf/slo-navegador.mjs` publica
  `docs/cad/evidence/cad-dense-editing-100k.json`. **Ese fichero no existe en el árbol.**
  El `gap` de la fila `modify.dense-stress` de la rúbrica lo admite: «el golden corre y nadie guardó
  su artefacto en `docs/cad/evidence/`».
- **Duele en:** no se puede saber si seleccionar, mover o borrar a 100k mejoró o empeoró.
- **Cómo se construye:** correr `scripts/cad/dense-editing-evidence.mjs` (que ya existe y ya se
  niega con menos de tres corridas) y versionar la salida; luego un juez al estilo
  `check-etapas-100k.mjs` con techos por gesto.
- **Cómo se verifica:** el juez.
- **Esfuerzo:** un día.
- **Severidad: alta.**

### H8 · El techo del reparto por etapa se recalibró SOBRE una regresión de ×8

- **Valle hoy:** `scripts/perf/etapas-100k-budget.json`, bloque `deuda.cocientesContraAgosto`:
  `tessellate: 7.992`, `batchPush: 4.169`, `tileEnqueue: 5.651`, `segmentsAtRest: 144.24`.
  El techo de `tessellate` está en 4.200,751 ms cuando el mismo escenario medía 477,828 ms el
  2026-08-31 (`render-stage-architecture-100k.json`,
  `comparisonWithinThisSession.afterThisPr.stagesMs.tessellate`).
- **Lo que hay que reconocerle a la casa:** lo declara, no lo esconde, y explica por qué (el LOD
  real del hatch dejó de ignorar `segments`, así que se dibuja MÁS y por eso cuesta más). Eso es
  cultura correcta.
- **Lo que sigue siendo un riesgo:** un trinquete calibrado 8× por encima de una medida buena
  conocida ya no protege nada en ese rango. Cualquier regresión de hasta ×8 en teselado pasa en
  verde.
- **Cómo se construye:** dos techos, no uno: el vigente (que impide empeorar) y una **meta**
  (`objetivoMs`) con el número de agosto, que el juez reporta como deuda pendiente sin bloquear.
  Y separar el techo por TIPO de entidad, que es lo que el `lod.porTipo` ya calcula.
- **Cómo se verifica:** `check-etapas-100k.mjs --json` imprime el cociente contra la meta en cada
  corrida.
- **Esfuerzo:** horas.
- **Severidad: media.**

### H9 · `reprioritize` es código muerto: el paneo tira la cola entera en cada cuadro

- **Valle hoy:** `pipeline.ts:449-451`:

  ```ts
  this.scheduler.abort();                              // :449  vacía this.tasks
  this.scheduler.reprioritize(centerX, centerY);       // :450  reconstruye el montículo… vacío
  this.enqueueMissingTiles();                          // :451  vuelve a encolar desde cero
  ```

  `abort()` (`render-scheduler.ts:209-216`) hace `this.tasks.clear()`. `reprioritize()`
  (`:195-203`) itera `this.tasks.values()`. Su único llamador de producción es la línea 450, justo
  después del `abort`. Su documentación —«Reordena la cola alrededor de un centro nuevo SIN
  descartarla. Es lo que se hace en un paneo pequeño»— describe un comportamiento que **el producto
  nunca ejecuta**. Su spec (`render-scheduler.spec.ts:56-60`) lo prueba aislado, así que pasa en
  verde y la contradicción es invisible.
- **Duele en:** el paneo. La cabecera de `render-pipeline-host.ts:297-300` ya sabe el precio:
  «`setView` aborta la cola del planificador y vuelve a encolar los tiles visibles; con cientos de
  tiles eso es trabajo por cuadro que NO cuenta contra el presupuesto de teselado —ocurre antes de
  `runFrame`— y se lo come entero». El paliativo es `VIEW_CHANGE_TOLERANCE = 0.004`
  (`:150`), que no ayuda durante un arrastre real, donde la vista se mueve mucho más que el 0,4 %.
- **Cómo se construye:** distinguir el paneo del salto. Si el conjunto visible de tiles conserva
  ≥50 % (dato que `diffCadTiles` ya devuelve en `retained`), **no abortar**: sólo
  `reprioritize` + encolar los `added`. Abortar sólo cuando `retained` sea pequeño o cambie la
  octava. Es un `if` sobre el `diff` que ya está calculado en `pipeline.ts:435`.
- **Cómo se verifica:** un spec sobre `CadRenderPipeline` que panee 12 paradas y afirme que
  `scheduler.abortedTotal` (ya existe el contador) queda por debajo de un techo; y el reparto por
  etapa, donde `tileEnqueue` debería bajar de 4,46 ms.
- **Esfuerzo:** un día.
- **Severidad: media.**

### H10 · `setSelection` construye un `Map` del documento entero en cada cambio de selección

- **Valle hoy:** `render-pipeline-host.ts:393-397`:

  ```ts
  const byId = new Map(
    (document?.entities ?? [])
      .filter((entity): entity is CadNativeEntity => CAD_ENTITY_REGISTRY.supports(entity))
      .map((entity) => [entity.id, entity] as const),
  );
  ```

  Sobre un documento de 100.000 entidades eso son dos arrays intermedios de 100.000 y un `Map` de
  100.000 entradas **por cada clic**, para encontrar una entidad. Su llamador
  (`Layout3DEditor.tsx:3114`) se invoca desde `refreshNativeSelectionVisuals`, que corre en cada
  refresco de selección.
- **Duele en:** clic simple sobre un plano grande, y sobre todo en la ventana de designación por
  arrastre, donde el conjunto cambia cuadro a cuadro.
- **Cómo se construye:** el anfitrión ya guarda `this.document`; mantener un
  `Map<string, CadNativeEntity>` como campo, reconstruido sólo en `replace()` e `invalidate()`, y
  consultarlo. Cinco líneas.
- **Cómo se verifica:** spec que designe 1 de 100.000 y cuente llamadas a `CAD_ENTITY_REGISTRY.supports`.
- **Esfuerzo:** horas.
- **Severidad: media.**

### H11 · El acantilado de LOD del sombreado (y el comentario que lo niega)

- **AutoCAD:** `HPMAXLINES` acota el número de líneas de un sombreado y el visor degrada a sólido.
- **Valle hoy:** dos escalones útiles, salto de ×3.447 (§2.4), y un comentario en
  `hatch-entity-adapter.ts:122-127` que afirma lo contrario de lo que mide
  `render-stage-architecture-100k.json` → `lod.censoEnLaParadaDeZoom`.
- **Duele en:** la SESIÓN de trabajo, no en la apertura: en cuanto el dibujante hace zoom a una
  planta con acabados, los 14.000 sombreados cruzan a tier 1 y el paneo se cae.
- **Cómo se construye:** un escalón intermedio **por densidad de trazos en pantalla**, no por
  espaciado: si `strokes.length × longitudMedia` supera N píxeles de tinta por unidad de pantalla,
  se dibuja el patrón con espaciado ×k y se declara. La spec `hatch-lod-volume.spec.ts` explica por
  qué el ×4 ciego se retiró (golden 47) — la corrección es hacerlo dependiente de la densidad
  medida, no del tier. Y **corregir el comentario del adaptador**, que hoy es una trampa para el
  siguiente.
- **Cómo se verifica:** `hatch-lod-volume.spec.ts` ya tiene el andamio; añadir un caso que fije el
  volumen del tier 1 por debajo de N puntos, y el golden 47 sigue guardando la apariencia.
- **Esfuerzo:** varios días.
- **Severidad: media.**

### H12 · Tiempo hasta interactivo del estudio: medido, publicado, NO presupuestado

- **AutoCAD:** arranca en 10–25 s en frío, así que aquí Valle gana con holgura. Pero el número no
  está defendido.
- **Valle hoy:** `frontend-load-baseline.json` registra `estudioUsableMs: 2876` y su propia nota
  dice «lo que esta medida gobierna son los KB». El gate es de bytes
  (`estudioJsKB: 3488.8`), no de tiempo. Lighthouse sólo mide `/`, `/register` y `/precios`
  (`scripts/perf/lighthouserc.json`): **el editor nunca pasa por Lighthouse**.
- **Duele en:** una regresión de hidratación (60 `useState` y 55 `useEffect` en
  `Layout3DEditor.tsx`) puede duplicar el tiempo hasta poder dibujar sin que nada lo diga.
- **Cómo se construye:** `frontend-load-budget.spec.ts` ya mide `estudioUsableMs`; falta el techo
  en el mismo JSON con la misma regla de trinquete y margen del +4 %.
- **Cómo se verifica:** la spec, que ya corre en PR sin la guarda `CAD_PERF_E2E`.
- **Esfuerzo:** horas.
- **Severidad: media.**

### H13 · La prueba de fuga cubre un corpus de 10k y ninguno de 100k

- **Valle hoy:** `browser-slo-100k.json` → `leakCycles` tiene **una sola entrada**:
  `text-hostile@10000`, 3 ciclos, crecimiento 0 MB. `cad-editor-memory-cycles.spec.ts` hace 20
  ciclos con 10.000 entidades y presupuesto `max(25 MB, 10 %)` — bien diseñado, pero **no corre en
  CI** (§H3) y no toca 100k. Los perfiles a 100k llegan a `usedJsHeapBytes: 364.000.000`
  (cartography) sin que nadie compruebe que ese heap se devuelve al cerrar.
- **Duele en:** la jornada larga. Abrir y cerrar seis planos grandes en una mañana es el caso que
  destapa una retención, y es exactamente el que no se prueba.
- **Cómo se construye:** extender el bucle de `leakCycles` del arnés a `architecture@100k` con 3
  ciclos, y meter `cad-editor-memory-cycles` en el job de perf con 5 ciclos en vez de 20 (el
  presupuesto de tiempo del job lo permite).
- **Cómo se verifica:** el propio invariante, que ya es bloqueante en la spec.
- **Esfuerzo:** un día.
- **Severidad: media.**

### H14 · Techo duro de 100.000 entidades

- **AutoCAD:** no tiene tope de entidades; un plano de levantamiento topográfico o un modelo de
  planta pasan del millón sin discusión.
- **Valle hoy:** `packages/contracts/src/design-contracts.ts:180` `maxEntities: 100_000`, aplicado
  por el API en `cad-document-validation.ts:58`. `benchmark/corpus-manifest.json` tiene perfiles
  `scale-500k` y `scale-1m` pero en `report-only` y sólo de índice/serialización, no de render.
- **Duele en:** el primer cliente que arrastre un DWG de verdad grande recibe un rechazo, no un
  aviso de rendimiento.
- **Cómo se construye:** no es «subir el número». Es (a) paginar la carga por tiles desde el
  servidor en vez de traer el documento entero, y (b) un modo de sólo-lectura por encima del techo
  actual que no cargue el índice de selección. La escalera lo trata como decisión de etapa y me
  parece bien; lo que falta es **decirlo en la interfaz** con el número y el motivo, no con un 4xx.
- **Cómo se verifica:** un golden que suba 100.001 entidades y afirme que el mensaje nombra el
  límite.
- **Esfuerzo:** semanas (la versión buena); horas (el mensaje honesto).
- **Severidad: baja** hoy, **alta** el día de la primera venta grande.

### H15 · Sin virtualización en las listas de paletas

- **AutoCAD:** el Administrador de capas de un DWG con 900 capas se desplaza sin problema.
- **Valle hoy:** `CadLayerManagerPalette.tsx:413` hace `rows.map(...)` sin ventana; cada fila lleva
  dos `<select>`. `CadNativeEntityList.tsx:55` no virtualiza: **trunca** a 20
  (`entities.slice(0, limit)`), que es honesto pero no es una lista.
- **Duele en:** abrir el gestor de capas de un plano ajeno con cientos de capas.
- **Cómo se construye:** ventana de renderizado propia (no hace falta dependencia: altura de fila
  fija + `scrollTop`), aplicada a las dos listas.
- **Cómo se verifica:** un golden con 800 capas que afirme que el DOM tiene <60 filas y que el
  desplazamiento llega a la última.
- **Esfuerzo:** un día.
- **Severidad: baja.**

---

## 4 · Defectos concretos del código y del andamiaje

### 4.1 `reprioritize` no hace nada en producción
`apps/web/src/lib/cad/render/pipeline.ts:450`, precedido de `abort()` en `:449`.
Ver H9. Es el defecto de código con mejor relación hallazgo/esfuerzo del informe.

### 4.2 Sólo una de las cinco specs de `e2e/performance/` corre en CI, y no mide tiempo
`.github/workflows/ci.yml:1102` corre `cad-dense-editing-100k`. Sus `expect`
(`apps/web/e2e/performance/cad-dense-editing-100k.spec.ts:628-653`) son de conteo, con
`SETTLE_BUDGET_MS = 900_000` (línea 90). No hay ninguna aserción de latencia en todo el fichero.

### 4.3 El gate del SLO de navegador lee el perfil **por índice de array**
`docs/competitive/rubric.json`, criterio `performance.browser-slo`, punteros
`profiles/0/fullDetailMs`, `profiles/0/pan/fpsP95`, `profiles/0/zoomSettleMs`. Hoy `profiles[0]` es
`architecture / 10000 / next` por el orden en que `CORPORA` está escrito en
`cad-render-browser.spec.ts:76`. Reordenar esa lista —o añadir un corpus delante— hace que el gate
juzgue **otra mezcla** sin que nada avise, y el criterio dice explícitamente «corpus architecture,
perfil next, 10k». Debe seleccionarse por `corpusId`+`entities`+`pipeline`, no por posición.

### 4.4 El techo de `tessellate` se calibró 8,0× por encima de una medida buena conocida
`scripts/perf/etapas-100k-budget.json` → `etapas.tessellate.ms: 4200.751` frente a los 477,828 ms
de `render-stage-architecture-100k.json` → `comparisonWithinThisSession.afterThisPr`. Declarado
como `deuda` en el propio fichero. Ver H8.

### 4.5 Contradicción entre un comentario de código y la evidencia versionada
`apps/web/src/lib/cad/hatch-entity-adapter.ts:122-127` afirma que los 14.000 sombreados de
`architecture@100k` están en tier 0; `docs/cad/evidence/render-stage-architecture-100k.json` →
`lod.censoEnLaParadaDeZoom.porTipo` mide `{"tipo":"hatch","tier0":0,"tier1":14000,"tier2":0}` en la
parada de zoom del mismo recorrido. El comentario no es falso en la vista inicial y sí lo es en la
que produce el reparto: hay que acotarlo o retirarlo.

### 4.6 `setSelection(ids, null)` da de BAJA las entidades designadas
`render-pipeline-host.ts:393` construye `byId` desde el **parámetro** `document`, no desde
`this.document`. Con `document === null`, `byId` queda vacío, `upserts` queda vacío y
`CadRenderPipeline.invalidate` aplica su contrato documentado —«un id afectado que no venga en
`upserts` se trata como una BAJA» (`pipeline.ts:338-341`)— y **borra del pipeline** las entidades
designadas. Hoy no explota porque `Layout3DEditor.tsx:2616` limpia
`nativeSelectionIdsRef.current = []` ocho líneas antes de poner
`loadedCadDocumentRef.current = null` (`:2624`), y el `if (touched.length === 0) return` corta. Es
decir: la corrección del dibujo depende del orden de dos líneas dentro de un fichero de 18.453
líneas. La defensa correcta es un `?? this.document` en la línea 393, o rechazar la llamada con
`document` nulo.

### 4.7 La evidencia publicada declara un hueco que ya está cerrado
`docs/cad/evidence/browser-slo-100k.json` → `scope.notMeasured[0]` sigue diciendo que el pipeline
«no está enchufado a `Layout3DEditor.tsx`». Lo está (§1.2). Una evidencia que se equivoca a la baja
sobre sí misma es menos grave que una que se equivoca al alza, pero sigue siendo una evidencia que
miente, y el arnés SIGUE construyendo la escena a mano en vez de medir el recorrido de interfaz:
lo que hay que corregir no es sólo el texto, es que el arnés mida por donde pasa el usuario.

### 4.8 Peso estático del monolito
`node scripts/perf/module-weight.mjs apps/web/src/components/cad/editor/Layout3DEditor.tsx` →
**5.673,4 KB en 544 ficheros** de alcance transitivo por imports de valor. 60 `useState`, 55
`useEffect`, 128 `useCallback` y 178 `import` en 18.453 líneas. El pointermove está bien resuelto
(refs y escritura directa al DOM, `Layout3DEditor.tsx:7139-7180`, sin `setState`), así que el
riesgo no es el ratón: es que cualquiera de esos 60 estados vuelva a renderizar el árbol entero y
a reconstruir 128 closures. `check:monolith-budget` existe; no vi que presupuestara hooks.

### 4.9 `storeCadRenderPipeline` no tiene llamador de producción
`apps/web/src/lib/cad/render-pipeline-preference.ts:92`; los únicos llamadores están en su spec. La
preferencia sólo se puede fijar por `?cadRenderPipeline=legacy`, que no persiste. No es un bug
—es exportación muerta— pero deja el camino `legacy` (`entity-three.ts`, 1.051 KB de alcance
transitivo, 0,037 fps a 100k) vivo en el bundle sin una puerta de usuario que lo justifique.

---

## 5 · El juicio contra AutoCAD

**Dónde Valle Design ya está por delante:**

- **Primer píxel.** `firstPixelMs` de 20,5 a 194,6 ms en todos los perfiles `next`, incluido
  `architecture@100k` (141,9 ms). AutoCAD no enseña nada útil de un plano grande en 142 ms.
- **Honestidad del culling.** `detailedAtRest === visibleAtRest` en los 20 perfiles publicados.
  El camino anterior de este mismo producto muestreaba 2.500 de 100.000 y enseñaba un plano falso;
  el nuevo dibuja todo lo que cae en la vista. AutoCAD también, pero AutoCAD no publica la cifra.
- **Memoria de GPU del texto.** 1,9 MB frente a 124,5 MB del camino de sprites, con **una** textura
  y una llamada de dibujo. Es un atlas correcto.
- **Instrumentación.** El repertorio de artefactos (`browser-slo-100k`,
  `render-stage-architecture-100k`, `cad-render-benchmark-100k`, `document-limits`,
  `wasm-parity`, `curve-kernel-render-100k`, `batchpush-empaquetado-100k`) con máquina declarada,
  dispersión entre corridas, `notMeasured` explícito y trinquetes con candado anti-«más rápido
  porque dibuja menos» es **mejor que lo que publica cualquier CAD comercial**. Esto no es una
  cortesía: es lo que permite auditar esta dimensión en una tarde.
- **Cero instalación, cero licencia, y un bundle que cabe.** 288,8 KB gzip de primera carga y
  3.354,6 KB de JS total hasta editar. AutoCAD son ~10 GB y un arranque de decenas de segundos.

**Dónde AutoCAD gana, y no de poco:**

- **Un plano de arquitectura de 100.000 objetos.** AutoCAD lo panea a 60 fps con aceleración de
  hardware; Valle lo panea a 8,57 y tarda 25,3 s en materializarlo. Y esa mezcla —muros, carpintería
  repetida, sombreados, cotas y rótulos— **es** el caso de uso, no un caso hostil.
- **Designar.** Ctrl+A en AutoCAD es instantáneo; aquí re-tesela (H6).
- **Sin tope de entidades.** 100.000 es un techo duro del contrato (H14).
- **Regeneración con caché de bloques.** 34.000 INSERT es un caso rutinario que AutoCAD resuelve
  con una definición y una matriz por instancia; aquí bloquean el hilo principal (H1).

**Nota: 6/10.** El motor está bien pensado y bien medido —las decisiones del presupuesto adaptativo,
del doble búfer de octava, del atlas de glifos y del trinquete con invariantes son de nivel alto—
pero la promesa central de la dimensión no se cumple sobre la mezcla que define al producto, y no
existe ningún gate automático que impida que empeore. Un 8 sería el mismo motor con H1, H2 y H3
cerrados.

---

## 6 · La apuesta ganadora

De todo lo anterior, la única cosa que haría que alguien **prefiera Valle Design sobre AutoCAD** por
rendimiento no es igualar los fps de AutoCAD. Es esto:

> **El plano se abre por el enlace, y el primer píxel útil llega antes de que AutoCAD haya
> terminado de comprobar la licencia. Y se puede DEMOSTRAR, en la máquina de quien duda,
> con un botón.**

La pieza técnica que lo hace posible ya está construida a medias y nadie la ha convertido en
producto: el pipeline por tiles **es un pipeline de streaming**. `firstPixelMs` de 141,9 ms sobre
100.000 entidades no es un accidente del benchmark: es la consecuencia de que el tile más cercano
al centro de la vista se materializa primero (`render-scheduler.ts`, prioridad por distancia) y de
que el resto llega por trozos de presupuesto. Falta el otro extremo del tubo: **hoy el documento
entero se descarga y se valida antes de que el pipeline vea nada**
(`render-pipeline-host.replace()` recibe un `CadDocument` completo, `:328`).

La apuesta es cerrar ese tubo de punta a punta:

1. **Servir el documento por tiles desde el API**, en el mismo orden de prioridad que el
   planificador ya usa: primero el tile bajo el cursor de apertura, luego los vecinos. El índice de
   tiles y la caja de contenido ya existen del lado del cliente (`tile-index.ts`); del lado del
   servidor es un índice espacial sobre la misma partición.
2. **Abrir un plano de 100.000 entidades con el primer trazo en pantalla antes del segundo**, y que
   el resto entre mientras el usuario ya está encuadrando. AutoCAD no puede hacer eso: su formato
   no es incremental sobre la red y su arranque no es progresivo.
3. **Publicarlo como una demostración pública auditable**: una URL con un plano real, un contador
   de `firstPixelMs` visible en la propia página (el `RenderPipelineBadge` ya publica
   `data-rendered` / `data-visible` / `data-glyphs` en el DOM, `RenderPipelineBadge.tsx:53-60`) y
   el artefacto JSON de la corrida al lado. El competidor no puede replicar el gesto: no hay una
   URL donde AutoCAD se abra.

Eso convierte la debilidad actual —25 s hasta el detalle **completo**— en irrelevante para la
decisión de compra, porque nadie espera el detalle completo: espera poder trabajar. Y convierte la
fortaleza que ya está medida —142 ms hasta el primer píxel útil, con evidencia versionada y máquina
declarada— en la única cifra que AutoCAD no puede igualar por construcción.

Las tres piezas necesarias son las mismas que ya hacen falta para el SLO: sacar los INSERT al
worker (H1), dejar de reconstruir el texto (H2) y no abortar la cola en cada cuadro de paneo (H9).
Es decir: **el trabajo que arregla el número que falla es exactamente el trabajo que construye la
apuesta.** No hay que elegir.
