# Peticiones de F2 · Velocidad sentida

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-velocidad-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Peticiones

### P-velocidad-01 · Encadenar el spec del artefacto de ganancia del kernel a `check:cad`

- **Archivo:** `package.json` (raíz) — archivo compartido, R2.
- **Por qué:** entrega 2 de la cola («la evidencia de la ganancia»). El artefacto
  `docs/cad/evidence/curve-kernel-render-100k.json` ya existe y su verificador ya corre, pero
  hoy hay que invocarlo a mano. Sin encadenarlo, el día que alguien edite el artefacto a mano
  —o que el enrutador deje de mandar curvas al kernel y la ganancia se evapore— ningún gate se
  mueve. Es exactamente el fallo que la regla 4 de la campaña de cimientos vino a cerrar: una
  cifra publicada que nadie vuelve a comprobar.
- **Cambio exacto:** añadir a `scripts` de `package.json` (raíz):

  ```json
  "check:curve-kernel-render": "node scripts/perf/curve-kernel-render-bench.spec.mjs && node scripts/perf/curve-kernel-render-bench.mjs --check"
  ```

  y encadenarlo dentro de `check:cad`, justo después de `node scripts/wasm/build-kernel.mjs --check`
  (que es su vecino natural: comprueba el binario, y esto comprueba lo que el binario ahorra):

  ```
  … && node scripts/wasm/build-kernel.mjs --check && npm run check:curve-kernel-render && node scripts/cad/mexican-drafting-standards-evidence.mjs --check && …
  ```

  El orden importa: `build-kernel.mjs --check` falla antes si el `.wasm` del árbol no es el de
  su manifiesto, y entonces el mensaje que ve quien corre el gate es el útil («recompila el
  kernel») y no el derivado.

  **Ni el spec ni `--check` regeneran nada**: los dos leen el artefacto publicado y tardan
  milisegundos. La REGENERACIÓN (`node scripts/perf/curve-kernel-render-bench.mjs`, minutos)
  se queda fuera de todo gate a propósito, por el mismo motivo por el que
  `wasm-parity-evidence.mjs` tampoco está encadenado: los tiempos se miden en máquinas con
  vecinos y convertirlos en umbral produce un gate que falla por contención y no por una
  regresión del producto.
- **Cómo se comprueba:** `npm run check:curve-kernel-render` en verde imprime
  `curve-kernel-render-bench: N comprobaciones — …` y
  `docs/cad/evidence/curve-kernel-render-100k.json: PASA`. Para ver que el gate MUERDE, basta
  cambiar a mano `environment.gpu` a `true` en el artefacto: el spec lo rechaza citando `gpu`.
- **Estado:** pendiente

### P-velocidad-02 · Regenerar la matriz competitiva: lleva desactualizada desde el cableado del kernel

- **Archivo:** `docs/competitive/autocad-2027-gap-matrix.md` — fuera del territorio de este
  frente (R1) y vecino directo de la rúbrica, que es archivo compartido (R2).
- **Por qué:** `npm run check:cad` está ROJO en este árbol por esto. Su último paso,
  `node scripts/cad/rubric.mjs --markdown --check`, dice literalmente «La matriz versionada está
  DESACTUALIZADA respecto al script». La causa es el commit `ff82c85` de este mismo frente (el
  cableado del kernel al teselado): al pasar a verde el criterio
  `wasm.toolchain`, la fila «Kernel Rust/WASM» dejó de tener criterios pendientes y entró en el
  conjunto de filas que retienen 1 pt por falta de evidencia independiente. Ese commit no
  regeneró la matriz y este frente no puede hacerlo sin salirse de su territorio.
- **Cambio exacto:** correr, sin editar nada a mano,

  ```
  node scripts/cad/rubric.mjs --markdown
  ```

  y committear el fichero que escribe. El diff comprobado en este árbol es de **3 líneas
  añadidas y 4 quitadas**, todas dentro del bloque `<!-- rubric:begin -->…<!-- rubric:end -->`:

  1. «29 fila(s) retienen 1 pt» → «30 fila(s) retienen 1 pt»;
  2. la fila `Kernel Rust/WASM` pasa de listar el criterio del cableado como pendiente a
     listarlo entre los verificados, con «Nada pendiente: todos los criterios declarados
     verifican» en la columna de pendientes (**la fila sigue en 1/2**: el techo por evidencia
     propia no se mueve, ver el «Todavía no» del 2026-09-04 en `velocidad.md`);
  3. la tabla de prioridades pierde su fila 6 (el criterio del kernel, ya cumplido) y la que era
     la 7 pasa a ser la 6.

  **La puntuación NO cambia**: sigue siendo 176/197 hoy y 232/271 destino. No hay que tocar
  `docs/competitive/rubric.json` para nada.
- **Cómo se comprueba:** `node scripts/cad/rubric.mjs --markdown --check` pasa en silencio, y con
  él el último tramo de `npm run check:cad`.
- **Ojo al correrlo:** `--markdown` **escribe el fichero en el disco**; no imprime el markdown por
  stdout. Correrlo desde un árbol de frente ensucia un archivo fuera de su territorio.
- **Recomprobado al cierre del frente (2026-09-04):** el diff sigue siendo exactamente el descrito
  —3 líneas añadidas, 4 quitadas, `29 fila(s)` → `30 fila(s)`, puntuación intacta en 176/197 y
  232/271—. Nada que actualizar en esta petición.
- **Estado:** pendiente

### P-velocidad-03 · Aviso: `check:dwg-evidence` falla en este contenedor por entorno, no por código

- **Archivo:** ninguno. Es un aviso para la ventana de integración, no un cambio.
- **Por qué:** `npm run check:cad` se detiene antes de llegar a la matriz, en
  `node scripts/dwg/dwg-evidence.spec.mjs`, con «el artefacto del disco coincide con lo que el
  árbol sostiene hoy». El artefacto versionado declara 7 bundles admitidos y 14 validaciones
  independientes; regenerado AQUÍ declara 0, porque `VALLE_DWG_CORPUS_MIRROR` no está definida en
  este contenedor y el espejo del corpus DWG no existe. Es exactamente el fallo por entorno contra
  el que avisa `AGENTS.md` («o los gates DWG mienten por entorno»).
- **Cambio exacto:** ninguno por parte de este frente. **Concretamente: NO regenerar el artefacto
  desde aquí.** Hacerlo bajaría la evidencia DWG publicada de 7 bundles a 0, que es relajar un
  gate (R6) y además falsearía a la baja el estado del producto. La corrida de verdad se hace en
  una máquina con `VALLE_DWG_CORPUS_MIRROR` apuntando al clon de
  `valle-design-dwg-conformance`.
- **Cómo se comprueba:** `git diff HEAD~1 --name-only` desde el commit de la entrega 2 no toca
  ningún archivo DWG; el fallo es anterior a este frente y ajeno a él.
- **Recomprobado al cierre del frente (2026-09-04):** `git diff --name-only 646b969..HEAD` —el
  frente ENTERO, no sólo una entrega— no toca ni un archivo DWG, y `VALLE_DWG_CORPUS_MIRROR`
  sigue sin definir en este contenedor. El fallo se reproduce idéntico.
- **Estado:** pendiente


### P-velocidad-04 · Dar comando propio al runner de GPU real y encadenar su spec

- **Archivo:** `package.json` (raíz) — archivo compartido, R2.
- **Por qué:** entrega 4 de la cola («medición en GPU real reproducible por el titular con un
  solo comando»). El runner ya existe y funciona
  (`node scripts/perf/slo-navegador.mjs`), pero un comando que hay que recordar por su ruta no
  es «un solo comando»: el titular lo va a correr una vez cada varias semanas, justo el intervalo
  en el que se olvida una ruta. Y su spec —que es lo que garantiza que el runner SE NIEGA— hoy
  hay que invocarlo a mano, igual que el de P-velocidad-01.
- **Cambio exacto:** añadir a `scripts` de `package.json` (raíz):

  ```json
  "perf:slo-navegador": "node scripts/perf/slo-navegador.mjs",
  "check:slo-navegador": "node scripts/perf/slo-navegador.spec.mjs"
  ```

  y encadenar **sólo el segundo** dentro de `check:cad`, junto a `check:curve-kernel-render` de
  P-velocidad-01:

  ```
  … && npm run check:curve-kernel-render && npm run check:slo-navegador && …
  ```

  `perf:slo-navegador` NO se encadena a ningún gate y no debe encadenarse nunca: lanza
  Playwright en el escalón `full` más tres corridas del estrés denso, que son horas de máquina,
  y exige GPU real. En un runner de CI (sin GPU) se negaría siempre, que es precisamente lo que
  tiene que hacer.

  El spec sí es barato y no depende de la máquina en un sentido y sí en el otro, que conviene
  saber leer: **corre en cualquier parte** (20 s; lanza Chromium unos segundos para observar el
  rasterizador) y **se adapta al entorno sin relajarse**. Si la máquina NO puede medir con GPU
  real —CI, este contenedor— exige que el runner aborte con código distinto de cero sin escribir
  nada; si SÍ puede —la máquina del titular— comprueba el plan con `--dry-run` y no lanza la
  corrida larga. Las otras 70 comprobaciones (contrato, parseo, rechazo de máquina vacía o
  genérica, corrida parcial, corrida que encoge) son idénticas en las dos.
- **Cómo se comprueba:** `npm run check:slo-navegador` imprime
  `slo-navegador: 74 comprobaciones — …` y termina en 0. Para ver que MUERDE: quitar la regla
  del rasterizador por software del contrato hace fallar tres comprobaciones citando
  SwiftShader, y borrar el `run.complete` del artefacto sintético hace fallar la de la corrida
  parcial.
- **Estado:** pendiente

### P-velocidad-05 · Encadenar el trinquete del reparto por etapa a `check:cad`

- **Archivo:** `package.json` (raíz) — archivo compartido, R2.
- **Por qué:** entrega 4 de la cola 1. El trinquete existe y muerde
  (`node scripts/perf/check-etapas-100k.mjs`), pero un gate que hay que acordarse de invocar no
  es un gate: es documentación. El ×6,75 de `architecture@100k` ya se perdió una vez sin que
  nadie se enterara —ver la entrada del 2026-09-04 en `velocidad.md`— justamente porque el
  artefacto estaba publicado y no lo vigilaba ningún comando.
- **Cambio exacto:** añadir a `scripts` de `package.json` (raíz):

  ```json
  "check:etapas-100k": "node scripts/perf/check-etapas-100k.spec.mjs && node scripts/perf/check-etapas-100k.mjs",
  "perf:etapas-100k": "node scripts/perf/etapas-100k-medir.mjs"
  ```

  y encadenar **sólo el primero** dentro de `check:cad`, junto a `check:curve-kernel-render`
  (P-velocidad-01) y `check:slo-navegador` (P-velocidad-04):

  ```
  … && npm run check:curve-kernel-render && npm run check:slo-navegador && npm run check:etapas-100k && …
  ```

  `check:etapas-100k` es barato y **no mide nada**: lee el artefacto publicado y el presupuesto y
  los compara (medio segundo en total, spec incluida). No lanza el perfilador, así que no depende de la
  velocidad del runner ni de su carga — sólo del contenido de dos ficheros versionados. Por eso
  puede vivir dentro de `check:cad` sin volverlo lento ni intermitente.

  `perf:etapas-100k` NO se encadena a ningún gate y no debe encadenarse: son tres corridas del
  perfilador (~80 s aquí) y su resultado depende de la carga de la máquina. Es el comando que se
  invoca a mano cuando se quiere republicar el reparto, y después `--bajar` para apretar techos.
- **Cómo se comprueba:** `npm run check:etapas-100k` imprime
  `check-etapas-100k.spec.mjs · 117 comprobaciones · OK` y luego la tabla del trinquete con
  `VERDE`, y termina en 0. Para ver que MUERDE, sin tocar nada versionado:

  ```
  node -e "const f='docs/cad/evidence/render-stage-architecture-100k.json';const a=require('./'+f);a.corridas[0].runs[0].stages.ms.tessellate*=2;require('fs').writeFileSync('/tmp/roto.json',JSON.stringify(a))"
  node scripts/perf/check-etapas-100k.mjs --evidencia /tmp/roto.json   # sale 1 y cita tessellate
  ```
- **Estado:** pendiente

### P-velocidad-06 · El LOD del sombreado cuesta ×3.448 en cuanto pasa de 24 px, y en el recorrido medido pasa siempre

- **Archivo:** `apps/web/src/lib/cad/hatch-entity-adapter.ts` (y su spec) — **fuera del territorio
  de F2** (R1). Este frente no lo toca; lo mide y lo entrega medido.
- **Por qué:** es la deuda que el trinquete del reparto por etapa dejó al descubierto, y hoy vale
  ×7,99 de `tessellate` en `architecture@100k`. Todo lo que sigue está medido en este contenedor
  y publicado en `docs/cad/evidence/render-stage-architecture-100k.json` (bloque `lod`):

  1. Un HATCH devuelve **4** segmentos a tier 0 y **13.790,8** a tier 1: un salto de **×3.447,7**
     en el primer escalón por encima de los 24 px aparentes.
  2. **Tier 1 y tier 2 son idénticos** (13.790,8 los dos). El escalón intermedio ya no ahorra
     nada desde que `11fc202` retiró el ensanchado ×4 del espaciado — retirada correcta: el
     golden 47 la cazó y a ~300 px el usuario ve la diferencia. El problema no es esa retirada,
     es que no quedó nada en su lugar.
  3. El comentario del adaptador («en `architecture@100k` los 14.000 sombreados están por debajo
     de los 24 px, o sea en tier 0») es cierto en la vista inicial y **falso en la parada de zoom
     del mismo recorrido** que mide el reparto: a 0,08970 px/unidad, 24 px son 267,6 unidades y
     **los 14.000 sombreados caen en tier 1, ninguno en tier 0**. El censo por escalón lo publica
     la sonda en cada corrida.
  4. Consecuencia medida: 414 entidades detalladas al reposo producen **2.199.624** instancias
     residentes, frente a las 15.250 de agosto (×144,2), y `tessellate` pasa de 477,8 ms a
     3.818,9 ms sobre el mismo corpus y las mismas 91.175 llamadas.
- **Cambio exacto (propuesta; la decisión es de quien gobierna el adaptador):** el coste de un
  sombreado a tier 1 **no depende de su tamaño aparente**, y ahí está la avería. `spacing` sale de
  `max(entity.scale ?? diagonal/40, diagonal/256, 1e-6)`, que es geometría del modelo: un
  sombreado de 25 px aparentes emite los mismos ~13.790 segmentos que uno de 300 px, es decir
  ~550 segmentos por píxel. Ensanchar el espaciado por un factor fijo ya se probó y cambia el
  dibujo. Lo que no lo cambia es dejar de emitir lo que **no cabe en un píxel**, que es el mismo
  criterio de sagita que `cadRenderSegmentsForSagitta` ya aplica a las curvas:

  - Hoy `renderer.paths(entity, segments)` sólo recibe el escalón, y un escalón es una BANDA
    (tier 1 = 24…320 px), no un tamaño. Con la banda no se puede decidir si un trazo cae por
    debajo del píxel; con el tamaño aparente, sí.
  - La forma mínima de darle ese dato sin tocar la firma del registro es derivarlo del propio
    escalón por su cota superior: a tier 1 el sombreado mide **como mucho** 320 px, así que más
    de ~320 trazos por familia no los puede resolver ninguna pantalla. Recortar a esa cota es
    conservador por construcción —nunca quita un trazo que el usuario podría distinguir— y
    corta el caso de los ~13.790.
  - La forma correcta, si se quiere hacer bien, es pasar el tamaño aparente (o los px/unidad) a
    `paths()` como ya se pasa `segments`, y decidir con él. Eso toca `CadEntityRenderer` y a
    todos los adaptadores, así que es un cambio de diseño con dueño y ADR, no un parche.
  - Sea cual sea el camino, la condición de aceptación NO es un número de milisegundos: es que
    el golden 47 siga verde y que `hatch-entity-adapter.spec.ts` siga fijando que tier completo
    es bit a bit el cálculo de siempre. Un ahorro que cambia el dibujo no vale.
- **Cómo se comprueba:** `node scripts/perf/etapas-100k-medir.mjs` republica el reparto y
  `node scripts/perf/check-etapas-100k.mjs --bajar` baja los techos con la ganancia que sea. El
  bloque `deuda` del presupuesto lleva el cociente contra agosto etapa por etapa: hoy
  `tessellate` ×7,99 y `segmentsAtRest` ×144,24, y bajan solos conforme la deuda se pague.
  Mientras tanto el trinquete impide que empeore más.
- **Estado:** pendiente

### P-velocidad-07 · Dar comando propio a la sonda pareada del empaquetado

- **Archivo:** `package.json` (raíz) — archivo compartido, R2.
- **Por qué:** entrega 5 de la cola 1. `scripts/perf/batchpush-empaquetado-probe.mts` es lo único
  que puede decidir si un cambio en el bucle de `line-batch.ts` gana o pierde en esta máquina: el
  perfilador por etapa reparte `batchPush` entre 414 y 539 ms sobre el MISMO árbol (dispersión del
  24 %), así que una ganancia del 16 % no se distingue del vecino. La sonda corre las dos
  versiones alternadas en el mismo proceso y publica el suelo, y además comprueba la **paridad bit
  a bit** sobre el corpus del producto: sale 1 si el empaquetado mueve un solo valor. Invocarla a
  mano con una ruta de siete segmentos garantiza que no se invoque.
- **Cambio exacto:** añadir a `scripts` de `package.json` (raíz):

  ```json
  "perf:batchpush": "cd apps/web && npx tsx ../../scripts/perf/batchpush-empaquetado-probe.mts --pasadas 9 --output ../../docs/cad/evidence/batchpush-empaquetado-100k.json"
  ```

  **No se encadena a ningún gate y no debe encadenarse.** Mide, y su resultado depende de la carga
  de la máquina: es el comando que se invoca a mano cuando se toca el empaquetado, igual que
  `perf:etapas-100k` (P-velocidad-05). El `cd apps/web` no es adorno: la sonda importa módulos de
  `src/` y necesita el `tsx` de ese workspace, que es como se invocan las demás sondas del frente.
- **Lo que NO se pide:** un `check:batchpush` que juzgue el artefacto. Todavía no existe la regla
  aparte —la sonda comprueba su propia paridad y se niega a publicar si falla, que es la mitad
  que importa—, y publicar un verificador de relojes sobre una máquina compartida sería un gate
  intermitente. Si algún día se quiere, la separación es la misma que en
  `check-etapas-100k.mjs`: regla en un fichero, productor en otro.
- **Cómo se comprueba:** `npm run perf:batchpush` imprime el flujo (90.236 empaquetados, 981.724
  caminos, 93,3 % de dos puntos), los tres relojes, la ganancia en el suelo y
  `paridad: 0 descuadres sobre 1.167.126 instancias`, publica el artefacto y termina en 0. Para
  ver que MUERDE, sin tocar nada versionado: cambiar `Math.hypot(x1 - x0, y1 - y0)` del atajo de
  dos puntos de `line-batch.ts` por `Math.hypot(x1 - x0, y1 - y0) * 1.0000001` y volver a
  invocarlo — sale 1, cita los primeros descuadres y **no publica**.
- **Estado:** pendiente
