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
