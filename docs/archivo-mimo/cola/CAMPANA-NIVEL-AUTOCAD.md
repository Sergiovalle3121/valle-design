# CAMPAÑA NIVEL AUTOCAD — que un profesional mexicano la use (18-sep-2026)

Escrita por el supervisor (Claude) a partir de tres fuentes medidas: un recorrido conducido en el
navegador (una casa de 6000 × 4000 mm de punta a punta, tres corridas), la auditoría por dominios
(`NIVEL-AUTOCAD-MEDIDO.md`) y el juicio de tres profesionales: un arquitecto con AutoCAD LT, un
corresponsable estructural y un dibujante de maquila. Toda la evidencia del recorrido está en
`.mimocode/recorrido-casa/`: `pasos.json`, `plano.pdf`, `plano-plot.pdf`, `casa-perez.dxf`, el spec
que lo conduce (`recorrido-casa.spec.ts.txt`) y las sondas (`sondas/*.mts|ts`), que sirven de
plantilla para los specs de cada tarea.

## Cómo usar este fichero (MiMo, léelo una vez)

- **Esta campaña manda sobre el orden del frente 1** de `MISION-48H.md` (líneas 11-15).
- **No lo leas entero cada vuelta.** Busca la tarea que toca y lee sólo esa:
  `grep -n "^### T" .mimocode/CAMPANA-NIVEL-AUTOCAD.md` y luego `sed -n 'A,Bp'`.
- **Una tarea, un commit.** Si la tarea trae «Corte», cada corte es un commit.
- **La prueba va primero.** Escribe el spec o el golden, córrelo y mira que falle POR EL DEFECTO.
  Arregla. Mira que pase. Commitea las dos cosas juntas. Nunca se commitea una prueba roja.
- **Mensaje:** `fix(NIVEL/T7): RECTANG 0,0 @6000,4000 dibuja 6000x4000`.
- **Bitácora:** una línea en `docs/execution/CAMPANA_MIMO_20260915.md` con la tarea, la prueba
  que lo demuestra y su resultado.
- **Al cerrar cada ola** corre el marcador (T1) y escribe en la bitácora:
  `RECORRIDO 2026-09-18 HH:MM · limpios N/21 · a medias N · rotos N · imposibles N`.
  Hoy: **5 limpios · 9 a medias · 5 rotos · 2 imposibles.** Ese número es el que hay que mover.
- **Si un spec que ya existe afirma el defecto** (la tarea te dice cuál), cambia el valor esperado
  en el MISMO commit y añade al mensaje una línea `test:` que diga por qué la propiedad sigue
  cubierta. La aserción se queda; cambia su valor. Nunca la borres.
- **Si una afirmación de este fichero resulta falsa al mirarla**, anótalo en la bitácora y pasa a
  la siguiente tarea. No inventes un arreglo.
- **Minas del monolito:** `Layout3DEditor.tsx` tiene 16894 líneas y su techo es 16896
  (`scripts/cad/monolith-budget.json`). Todo cambio ahí resta líneas o extrae a un módulo nuevo.
  `command-engine-host.ts` va por 784 de 800 y `entity-commands.ts` por 794 de 800: extrae antes
  de añadir. Comprueba con `node scripts/cad/check-monolith-budget.mjs`.
- Siguen vigentes todas las reglas de `MISION-48H.md` y `cola-vallecad.md`: `package.json`
  intocable, cero gates aflojados, no regenerar `docs/cad/evidence/` ni `docs/dwg/` salvo que la
  tarea lo nombre, árbol limpio.

---

## 1. El veredicto en cinco líneas

1. VALLECAD dibuja exacto tecleando: `MURO 2000,2000 @6000,0 @0,4000 @-6000,0 C` da ejes de 6000 y 4000 con esquinas limpias (recorrido a1), y LINE con `@d<a`, ANGBASE y pies-pulgadas está probado (goldens 44 y 124).
2. No entrega un plano: en el recorrido de la casa salieron **5 pasos limpios de 21** (9 a medias, 5 rotos, 2 imposibles), y la escala en papel es exacta (6000 mm = 120,00 mm a 1:50), pero lo que va encima no se lee.
3. «Publicar PDF» imprime las cotas a 0,70 mm (`sheet-set-pdf.ts:143`), PLOT imprime los muros en blanco sobre blanco (`plot-job.ts:162`) y cada cota nace «6000.00 mm» con flecha, no con la norma mexicana (`dimension-support.ts:143-171`).
4. RECTANG y PLINE rechazan `@` en el minuto uno (`command-engine.ts:507-513`), la planta se ve espejada (`cad-view.ts:65-70`), en producción sólo abren DWG de AutoCAD 2000-2006 y no se puede devolver ningún DWG (`dwg-export-flag.ts:28`).
5. Los tres profesionales dicen lo mismo: hoy no lo usarían en un trabajo cobrado, y **ninguno de sus bloqueos es un comando que falte**; hay 321 comandos y 165 con efecto verificado (`docs/cad/evidence/command-integrity.json`).

---

## 2. Los bloqueos, por lo que le cuestan al dibujante

Primero los que nombran los tres; dentro de cada grupo, el que más cuesta va antes.
«3 de 3» quiere decir que los tres profesionales lo pusieron entre sus bloqueos reales.
(La lista del tercero, el dibujante de maquila, llegó cortada después de su bloqueo 3: donde no
se ve su voto, no se cuenta.)

### B1 · El papel no se lee — 3 de 3
- **Le cuesta:** la factura y la licencia. El dibujante cobra contra la lámina; el DRO firma el PDF.
- **Evidencia:**
  - «Publicar PDF» crea jsPDF en mm (`sheet-set-pdf.ts:53`) y le pasa mm de papel a `setFontSize`, que espera puntos (`:143`). Medido en `plano.pdf`: la cota mide 1,98 pt = 0,70 mm; «RECÁMARA 1» mide 4 pt = 1,41 mm cuando debía medir 4,00 mm.
  - La altura de la cota impresa no sale del estilo: `paper-space-render.ts:319` la calcula como `arrowSize · escala · 0,55` recortada a [1,5; 8] mm e ignora DIMTXT. El texto se recorta a [1,5; 12] mm en `:282`. El estilo mexicano ni siquiera fija `textHeight` (`standards/mexican-annotation.ts:238-250`), aunque la norma del producto dice 2,5 mm (`:48-50`).
  - PLOT en monocromo pasa los trazos a gris por luma (`plot-job.ts:162`, `plot/aci-palette.ts:144-150`): el blanco sigue blanco. La capa 0 nace `#ffffff` (`cad-layer-manager.ts:21`). En `plano-plot.pdf` hay 101 trazos `1 G`: los muros no salen. El texto sí se fuerza a negro (`plot-job.ts:144`).
  - El cajetín imprime «Architecture / Engineering» (`Layout3DEditor.tsx:1355`) y la ventana sale rotulada «Model».
  - Ningún golden de ploteo lleva una sola cota (`NIVEL-AUTOCAD-MEDIDO.md:226`). Por eso nada de esto estaba en rojo.
- **Tareas:** T3, T4, T5, T6 y, después, T21 a T24.

### B2 · DWG: el del cliente actual no abre en producción, no se devuelve ninguno y el DXF de puente congela las cotas — 3 de 3
- **Le cuesta:** el cliente. «Mándame el DWG» cierra la conversación. El estructurista no puede ni empezar: su trabajo arranca en el DWG del arquitecto.
- **Evidencia:**
  - La lectura de AutoCAD 2010-2026 (AC1024/AC1027/AC1032) ya está firmada en ESTA rama (`dwg-interop-flag.ts:365`, `ownerSigned: true`, tarea T10 de `cola-vallecad.md:715-730`), pero en `origin/main` sigue `ownerSigned: false` (línea 371). La rama va **317 commits por delante de `origin/main`**. En producción sólo entra AutoCAD 2000-2006 (`cola-vallecad.md:684-689`).
  - No se puede devolver un DWG: `DWG_EXPORT_FLAG = false` (`dwg-export-flag.ts:28`) y `externalOracleVerified: false` (`:45`), que es OWNER ACTION con ODA File Converter. Aunque se encienda, el escritor sólo sabe siete tipos: sin cotas, sin sombreados, sin atributos (`packages/dwg-codec/CAPABILITIES.md:86` y `:376`).
  - El DXF que sí sale congela la cota: el grupo 1 lleva el rótulo medido (`dxf-write-dimensions.ts:181`; en `casa-perez.dxf`, `1|6000.00 mm`). En AutoCAD esa cota ya no se actualiza.
  - El muro viaja como contorno cerrado que cruza la puerta (`dxf-entity-primitives.ts:114-135`; en `casa-perez.dxf` la polilínea 0 cruza el vano en x 3053-3953), al revés que en el PDF.
- **Tareas:** T0, T10, T11 y T31 a T35.

### B3 · RECTANG y PLINE no entienden `@` — 3 de 3
- **Le cuesta:** el minuto uno. Es lo primero que teclea alguien de AutoCAD. Lo rodea con LINE, pero pierde la polilínea cerrada (área, desfase, sombreado por objeto).
- **Evidencia:** `command-engine.ts:507-513`: `lastPointOf` sólo lee `state.points`. RECTANG guarda `first` (`draw-rectang.ts:80-81`) y PLINE guarda `vertices` (`draw-pline.ts:81-82`). Recorrido a2: «Sin punto previo para coordenada relativa (@)». Sonda del estructurista: `PLINE 0,0 @300,0` falla igual (`sondas/probe-estructural-pline.mts`).
- **Tareas:** T7.

### B4 · La cota no nace como cota de plano mexicano — 2 de 3 (arquitecto, estructurista)
- **Le cuesta:** un plano lleva de 150 a 200 cotas, casi todas en cadena. Reestilarlas a mano en cada lámina no es trabajo: es castigo.
- **Evidencia:**
  - No existe un estilo de cota vigente. `cadDimensionEntity` sólo escribe `style` si el borrador lo trae (`engine/commands/dimension-support.ts:161`) y ninguna de las órdenes de cota lo pasa. No hay variable DIMSTYLE en `system-variables.ts`.
  - El rótulo lleva la unidad pegada: `associative-dimension.ts:112` escribe `${body} ${unit}`. Por eso sale «6000.00 mm»; la precisión por defecto es 2 (`dimension-style.ts:149`).
  - La cadena no hereda el estilo de su base: sonda `sondas/probe-chain.ts`, base «3.45 m» con garrapata y eslabón «1200.00 mm» con flecha (`annotate-dimension-chains.ts:138-175`). La separación de línea base es `arrowSize × 2` e ignora DIMDLI (`:68-70`).
  - El golden 46 da por buena la cota mal formateada: `46-cad-annotation-commands.spec.ts:160` espera «2000.00 mm».
- **Tareas:** T12, T13, T14.

### B5 · La planta se ve espejada — 2 de 3 (arquitecto, estructurista)
- **Le cuesta:** errores de lado en abatimientos, escaleras y colindancias. Y la confianza: lo que ve en pantalla no es lo que imprime.
- **Evidencia:** `view/cad-view.ts:65-70` dice que `1` es «el comportamiento actual» y `-1` «la convención de AutoCAD». `Layout3DEditor.tsx:5940-5946`: «voltearla es un cambio con su propio PR». La raíz está en `entity-three.ts:78-82`: la Y del dibujo va a +Z de la escena. Recorrido a0: la puerta del muro y=2000 sale arriba en pantalla y abajo en `plano.pdf`.
- **Tareas:** T19, T20.

### B6 · Cambiar el plano lo hace mentir o tira trabajo sin avisar — 1 de 3 como bloqueo; los otros dos: «graves, de horas»
- **Le cuesta:** la mayoría de las horas del arquitecto son cambios. Una cota que dice 4000 en un cuarto de 4500 llega a obra.
- **Evidencia:**
  - STRETCH mueve la cota entera o no la toca; nunca estira sus puntos (`stretch-anchor.ts:28`). Las cotas importadas llegan desasociadas (`dxf-cad-document.ts:225`, `:368`, `:456`).
  - Mover una cota junto con lo que mide la desasocia (`dimension-entity-adapter.ts:127`; `NIVEL-AUTOCAD-MEDIDO.md` ANOTACION-2). El sombreado no lo hace (`hatch-entity-adapter.ts:290-324`): el patrón bueno ya existe.
  - Esc tira el lote: el motor cancela sin pasar por el paso (`engine/command-engine.ts:395-400`) y TRIM vacía lo hecho a propósito (`modify-edges.ts:259-260`). Sonda con el anfitrión real (`sondas/probe-host.mts`): COPY con 3 destinos + Esc = 0 cambios.
  - TRIM dos veces sobre la misma línea deshace el primer recorte: el segundo se calcula contra el original (`modify-edges.ts:332`). Sonda: sale 0→900 en vez de 100→900.
- **Tareas:** T15 a T18.

### B7 · No se imanta nada dentro de bloques ni de referencias — 1 de 3 (estructurista); el arquitecto lo cita como agravante
- **Le cuesta:** el estructurista y el instalador dibujan sobre el plano del arquitecto. Sin imán a sus columnas y jambas, tienen que descomponerlo y pierden cada revisión.
- **Evidencia:** un INSERT sólo aporta su punto de inserción (`block-text-adapters.ts:459`) y deja una cruz fantasma de 50 mm que da capturas falsas (`:287-293`). El estudio llama al imán sin documento (`Layout3DEditor.tsx:6393`). El muro sólo imanta su eje (`wall-entity-adapter.ts:286-296`) y un hueco no aporta nada (`opening-entity-adapter.ts:265`). Sonda `sondas/probe-block-snap.ts`: el extremo se resuelve como «extension» o «nearest».
- **Tareas:** T25, T26, T27.

### S1 · Sospecha: el texto y los rótulos de cota no se ven en pantalla
- Sólo se vio en Chromium headless con SwiftShader: tres capturas sin ningún texto, y en el PDF sí aparecen. `NIVEL-AUTOCAD-MEDIDO.md` ANOTACION-1 dice que el lienzo usa `entity.textHeight` (`entity-three.ts:571`). **Si se confirma en un navegador real, es el bloqueo 0**: nadie revisa un plano cuyas cotas no ve. Tarea T2.

### Lo que los tres dijeron que NO les bloquea (no lo subas de prioridad)
Muros BIM que no se editan, puertas paramétricas, rumbos con °, CAL, SCU y rejilla girada, isométrico,
TEXT que crea MTEXT, «Paquete premium» en pantalla, gestor de capas con rótulos en inglés. Son
fricción o son el argumento de venta del MURO, no la razón por la que se quedan en AutoCAD.

---

## 3. La campaña

Olas de medio día como máximo. Dentro de cada ola, en orden. Una ola no se abre hasta que la
anterior está commiteada y el marcador (T1) corrido.

### OLA 0 · El terreno (antes de tocar nada)

### T0 · La rama llega a main y el DWG de AutoCAD actual se enciende en producción
- **Entrega:** la rama integrada en `main`. Con eso, la firma T10 que ya está aquí hace que `NEXT_PUBLIC_DWG_MODERN_IMPORT_BETA=true` (ya puesta en Railway, `cola-vallecad.md:729`) deje de ser un no-op: vallecad.com abre DWG de AutoCAD 2010-2026.
- **Se comprueba:** `git fetch origin && git show origin/main:apps/web/src/lib/cad/dwg-interop-flag.ts | grep -c "ownerSigned: true"` da **6** (hoy da 4). O el lanzador escribe «Integrado en main».
- **Toca:** lo que diga `.mimocode/ci-fallo.md` (a las 01:47 era un `no-unused-vars` en `engine/commands/surfaces.ts`). Nada más.
- **Va antes porque:** es la única mejora de DWG que no cuesta código, y sin merge nada de esta campaña llega a vallecad.com. No es trabajo nuevo: es la regla de siempre (rojo abierto primero).

### T1 · El marcador: el recorrido de la casa corre en local
- **Entrega:** `.mimocode/recorrido-casa/salida/pasos.json` regenerado y la línea `RECORRIDO … limpios 5/21 …` en la bitácora como línea base.
- **Se comprueba:**
  ```
  cp .mimocode/recorrido-casa/recorrido-casa.spec.ts.txt apps/web/e2e/zz-recorrido-casa.spec.ts
  cd apps/web && npx playwright test e2e/zz-recorrido-casa.spec.ts --project=chromium --reporter=line
  ```
  El prefijo `zz-` está en `.gitignore:97`: el fichero nunca se commitea. Tarda de 6 a 8 minutos. Se corre al cerrar cada ola, no en cada commit.
- **Toca:** sólo la copia local. Si un paso se clasifica mal porque el producto ya cambió, corrige la detección del spec (su texto vive en `.mimocode/recorrido-casa/`), nunca el producto para contentar al spec.
- **Va antes porque:** es la vara. Sin él, «hecho» vuelve a significar «registrado».

### T2 · Confirmar o descartar la sospecha S1 (texto invisible)
- **Entrega:** una línea en la bitácora: «S1 confirmada» o «S1 descartada», con la prueba.
- **Se comprueba:** corre T1 con GPU real: `CAD_PERF_REAL_GPU=1 npx playwright test e2e/zz-recorrido-casa.spec.ts --project=chromium` (`playwright.config.ts:83` usa el Chromium completo). Para que no dependa de mirar una imagen, añade a TU copia `zz-` una medida: captura la zona del texto justo antes y justo después de crearlo y cuenta los píxeles distintos. Menos de 50 = no se ve.
- **Si se confirma:** abre T2b antes que T3. Entrega: el texto se ve. Prueba: un golden nuevo `219-cad-texto-se-ve.spec.ts` con esa misma medida de píxeles. Mira primero `render/text-atlas.ts:244` y `render/text-requests.ts`.
- **Va antes porque:** si se confirma, es el bloqueo más grave de todos.

### OLA 1 · El papel se lee (B1)

### T3 · «Publicar PDF»: el texto a su tamaño
- **Entrega:** en el PDF de «Publicar PDF», un texto de 4 mm de papel mide 11,34 pt y una cota de 2,5 mm mide 7,09 pt.
- **Se comprueba:** caso nuevo en `apps/web/src/components/cad/editor/sheet-set-pdf.spec.ts`: renderiza una hoja con un comando de texto de `size: 4`, con `compress: false` (la opción existe, `sheet-set-pdf.ts:55`), busca `/F\d+ ([\d.]+) Tf/` en el flujo y exige 11,34 ± 0,01.
  `cd apps/web && npx tsx src/components/cad/editor/sheet-set-pdf.spec.ts`
- **Toca:** `sheet-set-pdf.ts:143` → `pdf.setFontSize(command.size * 72 / 25.4)`. Revisa que `maxWidth` siga en mm.
- **Va antes porque:** es una línea y es el botón que la gente encuentra.

### T4 · PLOT: lo blanco sale negro en el papel
- **Entrega:** en monocromo, todo trazo sale `#000000`, como `monochrome.ctb` de AutoCAD. En color, el blanco (`#ffffff`, ACI 7) sale negro sobre papel.
- **Se comprueba:** caso nuevo en `apps/web/src/lib/cad/plot/plot-job.spec.ts`: línea en capa 0 `#ffffff` → trazo `#000000` en monocromo y en color; línea amarilla en monocromo → `#000000` (hoy `#e2e2e2`). Plantilla: `.mimocode/recorrido-casa/sondas/probe-mono.mts`.
  `cd apps/web && npx tsx src/lib/cad/plot/plot-job.spec.ts`
- **Toca:** `plot/plot-job.ts:162` (y deja `:143-144` coherente). `toGrayscaleHex` (`plot/aci-palette.ts:144-150`) se queda para un modo «escala de grises» explícito, no para monocromo. Si algún spec afirma el gris en monocromo, afirma el defecto: cambia su valor esperado según las reglas de arriba.
- **Va antes porque:** el segundo camino de impresión también tiene que servir; hoy es blanco sobre blanco.

### T5 · La cota y el texto se imprimen a la altura de su estilo
- **Entrega:** a 1:50 y a 1:100, la cota de un estilo mexicano se imprime a 2,5 mm. Un MTEXT de altura 200 a 1:50 sale a 4,0 mm. A 1:20, un texto de 15 mm sale a 15 mm (hoy 12).
- **Se comprueba:** spec nuevo `apps/web/src/lib/cad/paper-space-render-altura.spec.ts` sobre `buildCadPublishPlan` (plantilla: `sondas/probe-print.ts`): mide `size` de cada comando de texto para 1:20, 1:50 y 1:100.
  `cd apps/web && npx tsx src/lib/cad/paper-space-render-altura.spec.ts`
- **Toca:** `paper-space-render.ts:319` (usa `textHeight` del estilo horneado × escala; sin recorte silencioso) y `:282` (quita el techo de 12). `standards/mexican-annotation.ts:238-250`: añade `textHeight: cadAnnotativeModelHeight(CAD_MEXICAN_TEXT_MM.rotulo, scale.denominator, unit)`. Si el gate de fidelidad de trazado protesta porque el defecto declarado `text-height-clamped` de `docs/cad/evidence/plot-fidelity-slo.json` ya no existe, quita SÓLO esa entrada: esta tarea te lo permite con nombre y apellido.
- **Va antes porque:** con T3 el tamaño llega bien al PDF, pero el tamaño que llega sigue saliendo de una fórmula y no del estilo.

### T6 · Golden: el plano acotado impreso se lee
- **Entrega:** `apps/web/e2e/golden/220-cad-plano-acotado-se-lee.spec.ts`. Semilla: cuatro líneas de 6000 × 4000 en capa 0 `#ffffff`, dos cotas asociativas con estilo `COTA 1:50` y un MTEXT «RECÁMARA 1» de altura 200. Crea la hoja A3 a 1:50 con «Paquete de entrega → + Hoja». Saca el PDF por «Publicar PDF» y por PLOT tecleado. Exige:
  1. 6000 mm miden 120,00 mm de papel (± 0,05).
  2. Toda cota mide al menos 7,0 pt.
  3. «RECÁMARA 1» mide 11,34 pt (± 0,1).
  4. Ningún trazo del dibujo usa `1 G` ni `1 1 1 RG`.
- **Se comprueba:** `cd apps/web && npx playwright test e2e/golden/220-cad-plano-acotado-se-lee.spec.ts --project=chromium --reporter=line`. Copia `PT_POR_MM`, `flujosDelPdf`, `tamanosDeTexto` y `tramosMm` de `recorrido-casa.spec.ts.txt:186-237` (y `dxfPares` de `:240-245` para T10 y T11).
- **Toca:** sólo el golden nuevo.
- **Va antes porque:** cierra la ola. Es la primera prueba de punta a punta de un plano acotado impreso; desde hoy, si alguien rompe el papel, se pone rojo.

### OLA 2 · El `@` y el minuto uno (B3)

### T7 · `@` y distancia directa en todo comando
- **Entrega:** `RECTANG 0,0 @6000,4000` dibuja 6000 × 4000. `PLINE 0,0 @1000,0 @0,500` dibuja sus vértices. `PLINE 0,0` y luego `1125` con el cursor apuntando dibuja un tramo de 1125. LINE y MURO siguen igual.
- **Se comprueba:**
  1. Casos nuevos en `apps/web/src/lib/cad/engine/command-engine.spec.ts` con `cadCommandEngineReduce` (plantilla: `sondas/probe-estructural-pline.mts`).
  2. Barrido nuevo `apps/web/src/lib/cad/engine/relative-point-sweep.spec.ts`: para CADA comando del registro, `begin`, teclea `0,0` y, si el paso siguiente acepta punto, `@100,0`. Falla si algún mensaje dice «Sin punto previo». Este barrido protege a los comandos que nazcan mañana.
  3. Golden `221-cad-rectang-pline-arroba.spec.ts`: RECTANG tecleado en el navegador guarda los vértices (0,0), (6000,0), (6000,4000), (0,4000).
  `cd apps/web && npx tsx src/lib/cad/engine/relative-point-sweep.spec.ts`
- **Toca:** `engine/command-engine.ts:507-513`. Que el paso pueda declarar su último punto (campo opcional en `engine/command-types.ts`) y que `points` quede como respaldo. Declararlo en `draw-rectang.ts` y `draw-pline.ts`; el barrido te dirá cuáles más.
- **Va antes porque:** son horas, lo nombran los tres y es lo primero que teclea un dibujante de AutoCAD.

### T8 · ORTHO manda sobre OTRACK
- **Entrega:** con ORTHO encendido, ninguna línea sale fuera de 0° o 90°, aunque OTRACK haya adquirido un punto. Hoy sale una línea a 1,06°.
- **Se comprueba:** extrae `Layout3DEditor.tsx:6470-6528` a una función pura `apps/web/src/components/cad/editor/draft-point-resolver.ts` y pruébala en `draft-point-resolver.spec.ts`: ancla (0,0), cursor (2005,37), punto adquirido con x=2000 y ORTHO encendido → y = 0. Con ORTHO apagado, el rastreo sigue dando (2000,37). Plantilla: `sondas/probe-otrack.ts`.
  `cd apps/web && npx tsx src/components/cad/editor/draft-point-resolver.spec.ts && cd ../.. && node scripts/cad/check-monolith-budget.mjs`
- **Toca:** el fichero nuevo. `Layout3DEditor.tsx` BAJA de líneas. Orden nuevo: primero la restricción ORTHO/POLAR; OTRACK sólo si su punto cae sobre el rayo restringido.
- **Va antes porque:** es un error silencioso: nadie lo ve hasta que la obra no cuadra.

### T9 · Las ayudas al dibujo se recuerdan entre sesiones
- **Entrega:** los modos OSNAP, ORTHO, POLAR y su incremento, OTRACK y el forzado a rejilla sobreviven a una recarga. Quien apaga «Cercano» lo apaga una vez.
- **Se comprueba:** spec nuevo en `apps/web/src/components/cad/palettes/`: fija modos en un `CadDraftSettingsHost`, guárdalos por el mismo camino que `cad-workspace.ts` usa para la apertura y el pickbox, crea otro anfitrión desde lo guardado y compara las dos fotos.
- **Toca:** `components/cad/palettes/draft-settings-host.ts:108-118` y `lib/cad/cad-workspace.ts`. Toda lectura y escritura de almacenamiento, dentro de try/catch.
- **Va antes porque:** con T8 y T9, la ola deja el dibujo con ratón tan fiable como el tecleado.

### OLA 3 · Entregar por DXF hoy, mientras llega el DWG (B2)

### T10 · DXF: la cota viaja viva
- **Entrega:** el DXF no escribe el rótulo medido en el grupo 1 de DIMENSION. Sólo lo escribe si el usuario sobrescribió el texto de la cota (`entity.text`). En AutoCAD la cota vuelve a medir.
- **Se comprueba:** spec `apps/web/src/lib/cad/dxf-write-dimensions.spec.ts` (créalo si no existe): exporta una cota de 6000 y exige que su DIMENSION no tenga grupo 1 con «6000»; con `text: "VAR."` exige grupo 1 = «VAR.». Después corre el golden de ida y vuelta: `cd apps/web && npx playwright test e2e/golden/16-cad-associative-dimensions.spec.ts --project=chromium --reporter=line`.
- **Toca:** `dxf-write-dimensions.ts:181`. Comprueba que el lector propio no necesita el grupo 1 para reconstruir la cota (usa el 42).
- **Va antes porque:** es una línea y convierte el DXF en un puente de verdad: el cliente lo abre en AutoCAD y lo guarda como DWG.

### T11 · DXF: el muro sale cortado en sus vanos
- **Entrega:** el muro se exporta como sus caras dibujadas, cortadas por los vanos, igual que en pantalla y en el PDF. Ninguna línea cruza la puerta.
- **Se comprueba:** spec nuevo junto a `dxf-entity-primitives.ts` con la casa del recorrido (muro (2000,2000)→(8000,2000), grosor 200, puerta P-090 en 1500): ningún tramo exportado sobre y=1900 o y=2100 tiene x entre 3053 y 3953 (son las cifras de `casa-perez.dxf`).
- **Toca:** `dxf-entity-primitives.ts:114-135`. Reutiliza lo que ya pinta el muro cortado: `wall-entity-adapter.ts:156-189` (`splitFaceByIntervals`). Actualiza el aviso del manifiesto de pérdidas para que diga lo que viaja.
- **Va antes porque:** sin esto, el arquitecto que use MURO manda un DXF que en AutoCAD tiene las puertas tapiadas.

### OLA 4 · La cota nace como plano mexicano (B4)

### T12 · Estilo de cota vigente
- **Entrega:** existe la variable `DIMSTYLE` (estilo de cota actual). La plantilla «Planta arquitectónica» la fija a su estilo (`cadStarterDimensionStyleName`, `starter-templates.ts:306`). DLI, DAL, DAN, DRA, DDI, DOR, QDIM, DIMBASELINE y DIMCONTINUE crean la cota con ese estilo horneado. Los eslabones de una cadena heredan el estilo de su base. DIMSTYLE puede fijar el estilo actual.
- **Se comprueba:** spec nuevo `apps/web/src/lib/cad/engine/commands/estilo-de-cota-vigente.spec.ts` (plantilla: `sondas/probe-chain.ts`): `createCadStarterDocument` con la planta arquitectónica, DLI sobre una línea de 3450 → `style === "COTA 1:50"`, remate `architectural-tick`. DIMCONTINUE → el mismo estilo. QDIM → el mismo.
  `cd apps/web && npx tsx src/lib/cad/engine/commands/estilo-de-cota-vigente.spec.ts`
- **Toca:** `system-variables.ts`, `engine/commands/dimension-support.ts:143-171`, `annotate-dimensions*.ts`, `annotate-dimension-chains.ts:138-175`, `annotate-quick.ts`, `annotate-styles.ts:110-135`, `starter-templates.ts`. El horneado ya existe (`cadDimensionStyleBake`, `dimension-style.ts`) y la paleta lo usa (`Layout3DEditor.tsx:5661-5694`): reutilízalo, no lo copies.
- **Va antes porque:** sin estilo vigente, T13 no tiene de dónde leer el formato.

### T13 · El rótulo sin «mm» pegado y con supresión de ceros
- **Entrega:** la cota rotula el número y lo que diga su estilo (DIMPOST), nada más. Plantilla mexicana: «3.45». Documento en blanco en mm: «6000» (como ISO-25 de AutoCAD: dos decimales con ceros finales suprimidos).
- **Se comprueba:** el spec de T12 exige «3.45». `46-cad-annotation-commands.spec.ts:160` y `:221` pasan a «2000» y «2500». Hay 39 expectativas «… mm» en 12 ficheros (`grep -rln "[0-9]\.[0-9][0-9] mm[\"'\`]" apps/web --include=*.spec.ts`): cambia SÓLO las que son rótulo de cota; las de DIST y medida se quedan.
  `cd apps/web && npx tsx src/lib/cad/engine/commands/annotate-dimensions.spec.ts && npx playwright test e2e/golden/46-cad-annotation-commands.spec.ts --project=chromium --reporter=line`
- **Toca:** `associative-dimension.ts:112`; `dimension-style.ts:150` (`zeroSuppression`, que hoy nadie lee: ANOTACION-3). Los estilos mexicanos llevan supresión `none` («3.00», como se acota en México).
- **Va antes porque:** con T12 y T13 la cota nace lista para la constructora.

### T14 · DIMBASELINE separa con DIMDLI; la paleta de cotas en español y con el estilo vigente
- **Entrega:** la separación de línea base sale de `baselineSpacing` del estilo (380 por defecto, `dimension-style.ts:144`). La paleta propone el estilo vigente, no el primero de la lista («COTA 1:200» en un plano a 1:50). Sus tipos se llaman Lineal, Alineada, Angular, Radio, Diámetro, Coordenada, Longitud de arco, y el campo «Offset» se llama «Desfase».
- **Se comprueba:** caso en `annotate-dimension-chains.spec.ts` (separación = la del estilo) y golden nuevo `222-cad-paleta-cotas-en-espanol.spec.ts` (los rótulos visibles y el estilo propuesto).
- **Toca:** `annotate-dimension-chains.ts:68-70`, `components/cad/palettes/CadDimensionPalette.tsx:45` y `:69-113`, y el valor por defecto que le pasa `Layout3DEditor.tsx:13277-13279` (sin sumar líneas).
- **Va antes porque:** cierra la cota antes de tocar la edición.

### OLA 5 · Cambiar sin que el plano mienta (B6)

### T15 · Esc conserva lo ya hecho en COPY, OFFSET, TRIM, EXTEND y MATCHPROP
- **Entrega:** como en AutoCAD: Esc termina la orden y lo hecho se queda.
- **Se comprueba:** spec nuevo `apps/web/src/components/cad/command-line/esc-conserva.spec.ts` con el `CadCommandEngineHost` real (plantilla: `sondas/probe-host.mts`): COPY con 3 destinos + cancelar → `apply()` recibe 3 copias. TRIM con 2 recortes + cancelar → 2. OFFSET con 2 desfases + cancelar → 2.
- **Toca:** `engine/command-engine.ts:395-400`: que el motor entregue la cancelación al paso cuando el comando lo declare. `modify-basics.ts:283-293` y `:372-376`, `modify-edges.ts:259-260` (deja de vaciar `commands`), `modify-align.ts:392-398`. En `command-engine-host.ts` (784/800) no añadas líneas.
- **Va antes porque:** es la pérdida de trabajo más frecuente y son horas.

### T16 · TRIM dos veces sobre el mismo objeto
- **Entrega:** el segundo recorte se calcula sobre la geometría que dejó el primero.
- **Se comprueba:** caso en `engine/commands/modify-edges.spec.ts`: línea 0→1000, bordes en x=100 y x=900, recortar en 50 y en 950 → queda 100→900 (hoy 0→900). Plantilla: `sondas/probe-modify.mts`.
  `cd apps/web && npx tsx src/lib/cad/engine/commands/modify-edges.spec.ts`
- **Toca:** `modify-edges.ts:332`: antes de calcular, aplica al objetivo los parches ya acumulados en `state.commands` (y resuelve los trozos nuevos de un corte por el medio).
- **Va antes porque:** «limpiar una línea que sobresale de dos muros» es el TRIM más común que existe.

### T17 · Mover la geometría con su cota no la desasocia
- **Entrega:** si lo que la cota mide va en la misma transformación, la cota sigue asociada. Mover un baño entero y luego estirar un muro actualiza sus cotas.
- **Se comprueba:** spec nuevo con `executeCadEntityCommandBatch`: mover línea + cota en un lote → `associationStatus === "associated"`. Estirar la línea a 8000 → rótulo 8000. Después: `cd apps/web && E2E_AUDITORIA=1 npx playwright test e2e/auditoria/acotar.spec.ts --project=chromium`. Si pasa, gradúala según `e2e/auditoria/README.md`: se muda a `e2e/golden/`, sale de `manifiesto.json` y el techo baja de 5 a 4.
- **Toca:** `dimension-entity-adapter.ts:127` y `mleader-entity-adapter.ts:132`, con el patrón de `hatch-entity-adapter.ts:290-324`.
- **Va antes porque:** el primer MOVE del día hoy deja cotas muertas que parecen vivas.

### T18 · STRETCH estira las cotas por sus puntos de definición
- **Entrega:** STRETCH mueve cada punto de definición de la cota que cae dentro de la ventana, sea asociativa o no. La cota dice la medida nueva. Los vértices del sombreado que caen dentro también se mueven.
- **Se comprueba:** caso en `engine/commands/modify-stretch.spec.ts`: cuarto de líneas de 4000 con una cota desasociada a=(0,0) b=(4000,0); ventana sobre x∈[3900,4100], desplazamiento 500 → b=(4500,0) y rótulo 4500. Plantilla: `sondas/probe-modify.mts`.
- **Toca:** `stretch-anchor.ts:28` y `:30`, `modify-stretch.ts:88-146`.
- **Va antes porque:** cierra el agujero que más cuesta en obra: la cota que dice 4000 en un cuarto de 4500.

### OLA 6 · La planta con el norte arriba (B5) — dos medias olas

### T19 · Un solo sitio para el paso dibujo → escena
- **Entrega:** un módulo `apps/web/src/lib/cad/view/plan-axis.ts` con el signo del eje Y y las dos conversiones (dibujo → escena, escena → dibujo). Todo el que hoy decide el signo lo lee de ahí. **Sin cambiar nada de lo que se ve.**
- **Se comprueba:** spec `plan-axis.spec.ts` (ida y vuelta exacta). `grep -rn "yScreenSign: 1" apps/web/src` sólo devuelve `plan-axis.ts`. Todos los specs de `view/` y los goldens de puntero (`28`, `46-cad-pointer-engine`, `120`) siguen verdes.
- **Toca:** `entity-three.ts:69-83`, `render/text-atlas.ts:244`, `view/cad-view.ts:96`, `view/view-controller.ts`, `components/cad/viewport/render-pipeline-host.ts`, la inversa del puntero en `Layout3DEditor.tsx` (sin sumar líneas). Son 13 ficheros con `yScreenSign`: lista cada uno en la bitácora.
- **Va antes porque:** voltear el signo en 13 sitios a la vez es la forma segura de romperlo todo. En uno, es un cambio.

### T20 · Voltear el signo: la +Y hacia arriba, como AutoCAD y como el PDF
- **Entrega:** en pantalla la +Y del dibujo va hacia arriba. La puerta que el PDF pone abajo, la pantalla la pone abajo. El texto se lee derecho.
- **Se comprueba:** golden nuevo `223-cad-norte-arriba.spec.ts`: línea (0,0)→(0,1000); la y de pantalla del extremo es menor que la del inicio. Y la puerta del muro y=2000 queda por debajo del muro opuesto tanto en pantalla como en el PDF. Después, la suite dorada entera (de noche): `cd apps/web && npx playwright test e2e/golden --project=chromium --reporter=line`.
- **Toca:** `plan-axis.ts` y lo que dependa del signo; el fixture `e2e/fixtures/world-point.ts`.
- **Corte:** (a) 2D: encuadre, zoom y designación; (b) texto y arcos; (c) 3D. Sospecha que tienes que medir en (c): si la Y del dibujo va a +Z, la maqueta 3D también está reflejada; comprueba con un muro sobre +Y y una puerta a su derecha, y anota el resultado.
- **Va antes porque:** lo pidieron dos de tres y cuesta la confianza en todo lo demás.

### OLA 7 · La hoja que se entrega (B1, segunda mitad)

### T21 · Un solo emisor de PDF: «Publicar PDF» usa el trazado bueno
- **Entrega:** «Publicar PDF» genera sus páginas con `plot/plot-job.ts` y `plot/plot-pdf.ts`: tabla de plumas, grosores y cajetín ISO o mexicano (`plot/title-block.ts:36-49`). El cajetín escrito a mano de `sheet-set-pdf.ts:211-227` se retira. Una página por presentación, como hoy (`sheet-set-pdf.ts:66-70`).
- **Se comprueba:** el golden 220 pasa por los dos botones, y el PDF con la variante mexicana contiene «D.R.O.». `plot-output.spec.ts` (vista previa igual al PDF) sigue verde.
- **Toca:** `sheet-set-pdf.ts`, la llamada de `Layout3DEditor.tsx:578` (sin sumar líneas).
- **Corte:** (a) las páginas por `plot-job`; (b) el cajetín por `title-block`.
- **Va antes porque:** dos emisores significan dos papeles distintos para el mismo dibujo (hoy dicen TÍTULO / NO. DE PLANO y LÁMINA / Nº DE PLANO).

### T22 · Cajetín, paquete y ventana en español
- **Entrega:** ni «Drawing No.», ni «Prepared by», «Checked by», «Approved by», ni «premium», «Demo 3 hojas», «Margen top/right/bottom/left», «Lineweight», «Architecture / Engineering», ni una ventana rotulada «Model».
- **Se comprueba:** golden nuevo `224-cad-paquete-en-espanol.spec.ts`: abre «Paquete de entrega» y exige que ningún texto visible case con `/Drawing No\.|Prepared by|Checked by|Approved by|premium|Demo 3 hojas|Margen (top|right|bottom|left)|Lineweight/`; y que el PDF no contenga «Architecture / Engineering» ni «Model ·».
- **Toca:** `Layout3DEditor.tsx:1355`, `:16235`, `:16292`, `:16377`, `:16433`, `:16596-16604` (sólo textos: cero líneas netas); `cad-paper-viewport.ts:267` («Model» → «Modelo»).
- **Va antes porque:** es lo que el DRO y la ventanilla leen.

### T23 · Ctrl+P traza y PLOT Extensión funciona
- **Entrega:** Ctrl+P abre PLOT (hoy imprime una hoja en blanco: `app/globals.css:768-775`). PLOT → Extensión traza lo dibujado.
- **Se comprueba:** golden nuevo `225-cad-ctrl-p-traza.spec.ts`: Ctrl+P deja visible el diálogo o el prompt de PLOT, y PLOT Extensión da un PDF con trazos. El golden `104-auditoria-plot-extension.spec.ts` afirma hoy el defecto: cambia su valor esperado según las reglas.
- **Toca:** `lib/cad/keyboard-shortcuts.ts`, `plot/plot-job.ts:312` (pásale las extensiones: `cadPlotExtents` existe en `components/cad/command-line/plot-host.ts` y no lo llama nadie).
- **Va antes porque:** «esto no imprime» en los primeros diez segundos.

### T24 · Una línea de TEXT no se parte en el papel
- **Entrega:** «RECÁMARA 1» sale en una línea en los dos PDF (hoy PLOT la parte en «RECÁMAR / A 1»).
- **Se comprueba:** añade al golden 220 que «RECÁMARA 1» aparece como un solo texto, y un caso en `annotate-text.spec.ts`.
- **Toca:** `engine/commands/annotate-text.ts:84-88` y `:152-156`. Sospecha de la causa: el ancho del MTEXT es exactamente el medido y la fuente del PDF es algo más ancha, así que ajusta la línea. Una sola línea de TEXT no debe tener ancho de ajuste.
- **Va antes porque:** cierra el papel.

### OLA 8 · Imán en bloques y referencias (B7)

### T25 · El proveedor de imanes recibe el documento
- **Entrega:** `cadSnapSceneAddEntities` recibe el documento desde el estudio. La cruz fantasma de 50 mm deja de producir capturas.
- **Se comprueba:** caso en `snap-scene.spec.ts` (plantilla: `sondas/probe-block-snap.ts`): INSERT de un bloque con una línea; con el cursor a 20 mm de su extremo ya no sale «extension» en (4980,1000).
- **Toca:** `snap-scene.ts`, el tipo del proveedor de imanes, `block-text-adapters.ts:287-293`, `Layout3DEditor.tsx:6393` (un argumento más, cero líneas netas).
- **Va antes porque:** T26 y T27 necesitan el documento. El comentario de `wall-entity-adapter.ts:291-295` lo espera.

### T26 · Extremo, medio, centro e intersección dentro de un INSERT y de un xref
- **Entrega:** el imán ve la geometría del bloque con su transformación (inserción, escala, giro), por lo menos un nivel de anidamiento. Los xref, que se proyectan como INSERT (`xref/xref-workflow.ts:193`), heredan lo mismo.
- **Se comprueba:** caso en `block-text-adapters.spec.ts`: extremo exacto (5000,1000). Golden nuevo `226-cad-iman-dentro-de-bloque.spec.ts`: LINE que arranca imantada al extremo de una línea de un bloque guarda el vértice EXACTO (la coordenada guardada, no la etiqueta del HUD).
- **Toca:** `block-text-adapters.ts:459`.
- **Corte:** (a) extremo, medio y centro; (b) intersección con geometría suelta.
- **Va antes porque:** es el minuto cero del estructurista.

### T27 · Imán a paños de muro y a jambas
- **Entrega:** con documento, el muro imanta las esquinas de su contorno unido y los puntos medios de sus caras; el hueco imanta sus cuatro esquinas de jamba.
- **Se comprueba:** spec: muro de 4000 y 200 de grosor → imanes en las caras a ±100 del eje (ajustados por las uniones); puerta P-090 en 1500 → cuatro esquinas de jamba.
- **Toca:** `wall-entity-adapter.ts:286-296`, `opening-entity-adapter.ts:265`.
- **Va antes porque:** en México se acota «a paños»; hoy sólo hay ejes.

### OLA 9 · Horas que ahorran minutos

### T28 · FILLET, CHAMFER y OFFSET recuerdan su valor; fuera un falso verde
- **Entrega:** repetir FILLET con Espacio mantiene el radio (hoy vuelve a 0). CHAMFER mantiene sus distancias. OFFSET propone la última distancia.
- **Se comprueba:** spec que llama a `begin` dos veces a través del motor: la segunda vez el prompt dice «Radio actual = 50». El caso de `modify-transform.spec.ts:338-354` es un falso verde (reutiliza un estado ya terminado, cosa que el motor nunca hace): reescríbelo para que pase por el motor.
- **Toca:** `engine/commands/modify-transform.ts:610-626`, `system-variables.ts:169-170` (FILLETRAD, CHAMFERA) y una variable OFFSETDIST nueva; `modify-basics.ts:388`.
- **Va antes porque:** son horas y quitan una fricción de cada esquina.

### T29 · «Previo» devuelve lo que usó la orden anterior; fuera el otro falso verde
- **Entrega:** después de MOVE, COPY o ROTATE, «P» designa lo mismo. ROTATE, SCALE y MIRROR aceptan «P».
- **Se comprueba:** reescribe `components/cad/command-line/command-engine-host-previo.spec.ts:54` para que NO llame a `host.select()` (camino que la interfaz nunca toma): MOVE con preselección [l1,l2] y después COPY P → [l1,l2].
- **Toca:** `command-engine-host.ts:367-370` (extrae antes de añadir: va por 784 de 800).
- **Va antes porque:** «mover esto y luego girar lo mismo» es diario.

### T30 · Capas: la nueva no se activa sola y apagar la actual avisa
- **Entrega:** crear una capa no la vuelve actual. Apagar la capa actual muestra un aviso. Los rótulos del gestor en español («Encendida», «Bloqueada», «Congelar en ventana», «Trazar»); el nombre del tipo de línea `CONTINUOUS` se queda (es un nombre de DXF).
- **Se comprueba:** golden nuevo `227-cad-capa-nueva-no-se-activa.spec.ts`: crear A-COTAS deja la barra de estado en «Capa 0»; apagar la capa actual hace visible un aviso.
- **Toca:** `Layout3DEditor.tsx:11171` (se quita una línea), `components/cad/palettes/CadLayerManagerPalette.tsx:175` y `:253`.
- **Va antes porque:** en el recorrido, el texto y el sombreado nacieron invisibles sin un solo aviso (paso d3).

### OLA 10 · DWG, la parte técnica (B2) — una tarea por media ola

### T31 · Qué entra de verdad de un DWG de AutoCAD actual
- **Entrega:** un spec que importa un DWG AC1024/AC1027/AC1032 real por `document-import.ts` con las tres banderas encendidas, cuenta lo que entra por tipo (LINE, INSERT, ATTRIB, MTEXT, DIMENSION, HATCH) y exige que cada pérdida esté declarada. La tabla va a la bitácora.
- **Se comprueba:** `cd apps/web && npx tsx src/lib/cad/document-import-dwg-moderno.spec.ts`.
- **Bloqueo de entorno:** los DWG modernos del repo son sintéticos de cabecera (`packages/dwg-codec/fixtures/synthetic/recognized/ac1024.dwg` y hermanos). Los reales están en el espejo del corpus. Si `echo $VALLE_DWG_CORPUS_MIRROR` sale vacío, anótalo como «bloqueado por entorno» y salta a T32. **Nunca regeneres `docs/dwg/` ni `docs/cad/evidence/` sin el espejo** (`cola-vallecad.md:651-671`).
- **Va antes porque:** hay que saber qué abre el arquitecto antes de prometerle nada.

### T32 · El escritor DWG escribe MTEXT y ELLIPSE desde el documento
- **Entrega:** `writeCanonicalDwg` mapea MTEXT y ELLIPSE. El escritor de bajo nivel ya los sabe escribir (`packages/dwg-codec/CAPABILITIES.md:376`); falta el mapeo de `api/canonical.ts`.
- **Se comprueba:** ida y vuelta con el lector propio en `packages/dwg-codec/tests/unit/write-canonical-dwg.spec.ts`: geometría y texto exactos.
- **Va antes porque:** es lo más barato del escritor y el texto está en toda lámina.

### T33 · El escritor DWG escribe HATCH
- **Entrega:** sombreado de contorno poligonal con su patrón. **Se comprueba:** ida y vuelta con el lector propio (el lector ya decodifica HATCH con islas, `CAPABILITIES.md:82`). **Corte:** (a) relleno sólido; (b) patrón.
- **Va antes porque:** sin sombreado, un plano arquitectónico sale incompleto.

### T34 · El escritor DWG escribe DIMENSION
- **Entrega:** cota lineal y alineada con su bloque anónimo y su medida, sin texto forzado (la misma regla que T10). **Se comprueba:** ida y vuelta con el lector propio, que ya decodifica las siete DIMENSION (`CAPABILITIES.md:82`). **Corte:** (a) bloque anónimo; (b) entidad y estilo.
- **Va antes porque:** un DWG sin cotas no se entrega.

### T35 · La salida DWG cableada detrás de su bandera
- **Entrega:** el camino de exportación llama a `exportCadDocumentToDwg` (hoy sólo lo llama su spec, `NIVEL-AUTOCAD-MEDIDO.md` INTEROP-2) detrás de `DWG_EXPORT_FLAG`. Con la bandera apagada no aparece en la cinta, ni en el manifiesto, ni en ningún texto: no se anuncia lo que no está encendido.
- **Se comprueba:** spec con la bandera forzada a `true` en la prueba: exporta la casa del recorrido, relee el DWG con el lector propio y compara capas y entidades.
- **Va antes porque:** cuando el dueño verifique con ODA, encender la bandera tiene que bastar.

### OLA 11 · El MURO como argumento de venta

### T36 · Sombrear un cuarto por punto interior entre muros
- **Entrega:** `H` con un punto dentro de los cuatro muros sombrea el cuarto, limitado por las caras interiores.
- **Se comprueba:** caso en `engine/commands/annotate-hatch.spec.ts` con los cuatro muros del recorrido: H en (2800,2800) → contorno de 2100..7900 × 2100..5900.
- **Toca:** `engine/commands/hatch-support.ts:74-86`: los muros aportan sus caras dibujadas (cortadas por vanos), no su huella cerrada. La región la busca `cadHatchRegionAtPoint` (`annotate-hatch.ts:240`).
- **Va antes porque:** es el primer gesto con muros que falla (recorrido e2).

### T37 · Colocar la puerta tecleando dónde va
- **Entrega:** PUERTA acepta un punto tecleado sobre el muro y una opción «Distancia» desde el inicio del muro. Hoy sólo acepta designar (`engine/commands/draw-opening.ts:190`).
- **Se comprueba:** spec: muro (2000,2000)→(8000,2000); `PUERTA` y `3500,2000` → `position === 1500` exacto. Designar el muro y dar «Distancia 1500» → 1500.
- **Toca:** `draw-opening.ts:178-190`.
- **Va antes porque:** hoy la puerta queda donde cayó el clic: 1503,27 mm.

### T38 · STRETCH de muros: la casa 500 mm más larga
- **Entrega:** STRETCH mueve los extremos de muro dentro de la ventana; los muros unidos le siguen; las cotas asociativas dicen la medida nueva.
- **Se comprueba:** el paso c2 del recorrido como spec: casa de 6000 × 4000 con sus dos cotas; ventana de captura sobre el lado derecho, `@500,0` → muros de 6500 y cota 6500.
- **Toca:** `stretch-anchor.ts`, `modify-stretch.ts:88-146`.
- **Corte:** (a) extremos; (b) huecos alojados que conservan su distancia.
- **Va antes porque:** es la edición más común de un arquitecto.

### OLA 12 · Designar y ver lo que se edita — una tarea por media ola

### T39 · Dentro de la orden, los clics se suman y la ventana también
- **Entrega:** `M`, clic en a, clic en b, ventana sobre c, Intro → a, b y c designados. ROTATE, SCALE y MIRROR designan igual que MOVE.
- **Se comprueba:** golden nuevo `228-cad-designar-dentro-de-la-orden.spec.ts` con ese recorrido exacto.
- **Toca:** `modify-basics.ts:251-254`, `modify-transform.ts:124-135`, `modify-mirror.ts:55-65`, `components/cad/viewport/pointer-router.ts:384-391`, `background-drag-policy.ts:61`, `command-engine-host.ts:367-370`.
- **Corte:** (a) clics y palabras clave; (b) ventana implícita.

### T40 · Vista previa fantasma de MOVE, COPY, ROTATE, SCALE y MIRROR
- **Entrega:** el objeto transformado se ve pegado al cursor antes de confirmar. MIRROR enseña su eje (hoy es un segmento de longitud cero, `modify-mirror.ts:71-72`).
- **Se comprueba:** spec por orden: con el punto base fijado y el cursor en (x,y), el efecto `preview` trae la geometría transformada (compara su caja).
- **Toca:** los pasos de cada orden. El canal ya existe (`command-engine-host.ts:739`).
- **Corte:** una familia por media ola.

### T41 · FILLET y CHAMFER sobre polilíneas
- **Entrega:** redondear o achaflanar la esquina de un rectángulo; opción «Polilínea» para todas sus esquinas.
- **Se comprueba:** spec: `RECTANG 0,0 @4000,3000`, FILLET R 50 sobre dos lados → la polilínea gana el arco de radio 50; opción P → cuatro esquinas.
- **Toca:** `modify-transform.ts:427`.

### T42 · OFFSET de polilíneas con arcos
- **Entrega:** se desfasa un contorno con tramos curvos; opción «Punto de paso».
- **Se comprueba:** spec: polilínea con un arco de 90° R1000, desfase 200 hacia fuera → arco R1200 y tramos rectos desfasados.
- **Toca:** `draw-action-entities.ts:243-244` y `:307-308`.

### Después de la ola 12
Sigue por `NIVEL-AUTOCAD-MEDIDO.md`, en este orden: ORGANIZACION-1 (el catálogo de dibujos para
XATTACH), ORGANIZACION-2 (guarda de REFEDIT contra xref), INTEROP-3 (presentaciones en DXF),
ENTREGA-1 (dibujar sobre la lámina), PRECISION-1 a 3. Con la misma forma: prueba primero, un commit.

### Lo que sólo puede hacer el dueño
1. **Confirmar S1 en 30 segundos:** abrir vallecad.com en su navegador, `TEXT`, escribir algo. ¿Se ve?
2. **DWG de salida:** reinstalar ODA File Converter (se borró el 23-ago), correr `node scripts/dwg/oda-roundtrip.mjs` y, si pasa, poner `externalOracleVerified: true` en `dwg-export-flag.ts:45`.
3. **Decidir sobre el reparto de frentes** (sección 4).

---

## 4. Lo que hay que dejar de hacer

**Los tres profesionales lo dijeron sin rodeos.** El arquitecto: «Es gastar el tiempo en lo que no
es». El estructurista, con las mismas palabras. El dibujante: «No cuento comandos. En un día uso
unos cuarenta.» Ninguno de sus bloqueos es un comando que falte.

**Los números lo confirman:**
- Desde el 16-sep a las 15:00 hay 27 commits `feat`. **25 son 3D o comandos nuevos** (superficies, mallas, render, VIEWBASE, 3DFACE, ViewCube). Ninguno toca un paso roto del recorrido. Los otros dos son un realce de la cinta y la firma del DWG moderno (T10), que todavía no llega a main.
- La auditoría del 17-sep encontró que **57 de 62 comandos de una noche eran relleno** (`cola-vallecad.md:262-268`).
- El contador de `MISION-48H.md:126` sube con cada nombre 3D mientras los siete bloqueos siguen en su sitio. «Muta» demuestra que el documento cambió, no que el plano salga bien.
- Cada comando nuevo que guarde su estado con otro nombre que `points` hereda el fallo del `@` (B3), y cada tipo de entidad nuevo necesita su imán, su impresión y su DXF: tres tuberías que hoy fallan con los tipos que ya existen.

**Qué se deja de hacer:**
1. Registrar comandos de superficies, mallas, render y visualización 3D mientras las olas 1 a 5 no estén cerradas.
2. Contar comandos como medida de avance. El contador pasa a ser `RECORRIDO … limpios N/21` y, después, láminas que salen: un golden de punta a punta por disciplina (el estructurista lo describió: DXF del arquitecto como xref, ejes y columnas imantados, cotas con el estilo vigente, hoja A1 con planta a 1:100 y detalle a 1:20, PDF con la cota medida a 2,5 mm y todo el trazo en negro, DXF reabierto).
3. Dar por bueno un spec que afirma un defecto: `46-cad-annotation-commands.spec.ts:160` («2000.00 mm»), `108-auditoria-escala-bloqueada.spec.ts:137` (el candado), `104-auditoria-plot-extension.spec.ts`, y los falsos verdes `modify-transform.spec.ts:338` y `command-engine-host-previo.spec.ts:54`. Cada uno tiene su tarea arriba.

**En qué se convierte esa energía.** La propia misión del dueño ya lo ordena: «dibujo 2D y
modificación → anotación y cotas → capas, bloques y referencias → presentación, láminas y trazado
→ sólidos, superficies y mallas» (`MISION-48H.md:55-58`). El 3D se saltó la fila. Esta campaña
es esa fila. En el turno del frente 2 («el millar, por familias completas»), cerrar una tarea
que arregla un comando que ya existe (PLINE, RECTANG, STRETCH, TRIM, FILLET, OFFSET, DIMSTYLE,
PLOT, DXFOUT) **es** completar la familia 2D; cuenta como turno del frente 2.

**La verdad para el dueño.** La campaña del millar la ordenó él, y la decisión es suya. La
recomendación es dar a esta campaña los turnos de los frentes 2 y 3 hasta cerrar la ola 5 (papel,
`@`, DXF de puente, cota mexicana, cambios que no mienten). Son unos tres días de MiMo. Ahí se
corre el marcador y se decide con el número delante. Mil nombres registrados no le quitan a un
arquitecto ni uno de sus seis bloqueos; seis arreglos sí.

---

## 5. Lo que ya está bien y no hay que tocar

Esto funciona y está probado. Al arreglar lo de arriba, que siga verde:

- **La línea de comandos.** Alias, absolutas, relativas y polares, Cerrar, Espacio para repetir, Esc y Ctrl+Z (golden 44). ANGBASE, ANGDIR y pies-pulgadas al teclear (goldens 124 y 46-cad-inquiry-and-utilities). El orden de interpretación de `engine/input-pipeline.ts:163-283` está bien pensado: la palabra clave gana a la coordenada y los overrides de imán no consumen el paso. **No cambies que `4,325` es el punto (4, 325)**: es AutoCAD (`NIVEL-AUTOCAD-MEDIDO.md:7-8`).
- **El motor de imanes.** 14 modos con la prioridad de AutoCAD (`snap-engine.ts:198-266`); el extremo guarda la coordenada exacta (golden 46-cad-pointer-engine).
- **La selección en reposo.** Ventana, captura, lazo, ciclo de superpuestos y sin tope de 300 (goldens 72, 12 y 59). Preseleccionar y luego teclear funciona (`use-command-engine.ts:489`).
- **El deshacer.** Igualdad estructural exacta tras deshacer y rehacer MOVE, COPY, OFFSET, TRIM y EXTEND (golden 193).
- **TRIM y EXTEND** con «Todos» por defecto y Valla (goldens 25, 41, 42, 123). **FILLET R0** cierra la esquina exacta (goldens 23 y 43).
- **Las cotas asociativas** a los extremos del muro, que sobreviven a guardar y reabrir (goldens 16 y 46-cad-annotation-commands:147-160).
- **La escala en papel.** 6000 mm = 120,00 mm a 1:50, y la hoja A3 elige 1:50 sola. Si T3, T5 o T21 la mueven una centésima, algo está mal.
- **El catálogo de huecos** (P-090, V-120x120) y el vano recortado en el PDF (`wall-entity-adapter.ts:156-189`): es lo que T11 y T36 reutilizan. No lo reescribas.
- **El DXF.** AC1015 con `$INSUNITS=4`, capas con su estado, DIMENSION con su bloque y el manifiesto de pérdidas honesto (goldens 27 y 34). T10 y T11 lo mejoran; no lo sustituyen.
- **El SCU al teclear** y en planos inclinados (golden 198).
- **Los rechazos honestos.** Cuando algo no se puede, el comando lo dice y nombra lo designado. Mejor eso que adivinar. No los cambies por éxitos que no lo son.
- **Los gates.** La sonda de integridad (0 rojos, 0 éxitos falsos), el manifiesto de `e2e/auditoria/` con techo que sólo baja y el presupuesto del monolito. No se tocan.
- **El signo de la Y** hasta T19 y T20: nada de voltearlo a trozos, porque `render/text-atlas.ts:244` compensa el signo actual y se rompe si sólo cambia una mitad.
