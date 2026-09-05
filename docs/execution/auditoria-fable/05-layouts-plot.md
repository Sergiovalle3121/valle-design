# Auditoría · Espacio papel, láminas y publicación

**Dimensión:** presentaciones, ventanas gráficas, cajetines, campos, conjuntos de
planos, estilos de trazado CTB/STB, publicar por lotes, PDF/DWF, trazado 3D.
**Quién firma:** arquitecto con veinte años de AutoCAD completo, suscripción
cara, siete toolsets, uso diario. Primer día en Valle Design.
**Fecha:** 2026-09-05.
**Método:** lectura del árbol real (`apps/web/src/lib/cad/{paper-space*,plot,layout,sheet-set,fields}`,
`apps/web/src/components/cad/{command-line,palettes,editor}`), de la rúbrica
(`docs/competitive/rubric.json`, fila `layouts`, 10 pts), de
`docs/parity/ESCALERA.md`, de `docs/execution/BACKLOG.md` y del artefacto
`docs/cad/evidence/plot-fidelity-slo.json`. No se modificó código de producto.

---

## 0. Veredicto

> **El PDF sale, sale a escala y sale con cajetín. Lo que no existe todavía es
> la LÁMINA como sitio donde se trabaja: no puedo escribir una nota sobre el
> papel, la ventana gráfica no recorta en el PDF que entrego, y la mitad de las
> opciones que PLOT me ofrece por el teclado no llegan a los bytes del archivo.**

**Nota: 5/10** contra AutoCAD completo en esta dimensión.

Es una nota de aprobado justo, y quiero ser preciso sobre por qué no es más baja
y por qué no es más alta.

No es más baja porque la **tubería de trazado es de verdad**. Hay un
`CadPageSetup` con área, escala, centrado, desfase y tabla de plumas; hay un
lector/escritor de `.ctb` que descomprime el zlib detrás de `PIAFILEVERSION`;
hay un cajetín paramétrico ISO **y** mexicano con la responsiva del DRO; hay
conjuntos de planos que cruzan varios dibujos con numeración automática, portada
y campos; hay un PDF vectorial cuyo error de escala está **medido en 2,8·10⁻¹⁴
mm** contra una tolerancia de 0,001 mm; hay rótulos `.shx` dibujados a trazos
Hershey dentro del archivo; hay sombreado con patrón real con guarda de densidad
honesta. Eso no es una maqueta. Alguien que sabe de trazar planos escribió esto.

No es más alta por tres cosas, y las tres duelen el lunes por la mañana:

1. **No puedo anotar sobre la hoja.** `CadPaperSpace.entityIds` existe en el
   esquema desde hace tiempo y `buildCadPublishPlan` **no lo lee nunca**
   (`paper-space.ts:823` recorre sólo `document.modelSpace.entityIds`). Una
   nota, una leyenda, un norte, una escala gráfica, una nube de revisión o un
   bocadillo de detalle escritos sobre el papel no llegan al PDF. El propio
   BACKLOG lo tiene catalogado como hueco latente (P2-14).
2. **La ventana gráfica no recorta.** `CadPublishViewport.clip` se calcula
   (`paper-space.ts:846`) y `plot-pdf.ts` lo **ignora**: el bucle de
   `plot-pdf.ts:306-315` dibuja cada comando sin `pdf.clip()`. Lo que sobra de
   una ventana se pinta encima del cajetín y de la ventana de al lado. Y peor:
   `paper-space.ts:817-822` emite el aviso `viewport_model_clipped` cuyo texto
   dice *«geometry is clipped to paper bounds»* — una afirmación que el PDF
   entregado no cumple.
3. **Media consola de PLOT es decorativa.** `computeCadPlotPlacement` y
   `cadPlotProject` —las dos funciones que colocan el área trazada sobre la
   hoja— **sólo se usan en una spec**. Producción no las llama nunca. Elegir
   `EXtensión`, `Ventana`, `LÍmites` o `ESCala 1:50` no cambia un solo byte del
   PDF; y tres de esas cuatro opciones además **impiden trazar**, porque
   `plot-job.ts:286` pasa `extents = null` y la comprobación previa devuelve
   `unknown_area` con severidad `error`.

Un despacho entrega la lámina. Estas tres cosas están en el camino de la lámina.

---

## 1. Lo que ya está construido y funciona (y hay mucho)

Antes de la lista de agravios, lo que me hizo tomarme en serio el producto.

### 1.1 El modelo de presentación es el correcto

`apps/web/src/lib/cad/cad-paper-viewport.ts` define `CadPaperSpace` y
`CadPaperViewport` con lo que hace falta y con las razones escritas:

- `paperBounds` / `modelBounds` / `scale` / `locked` — la ventana bloqueada, que
  es lo primero que hago tras encuadrar.
- `annotationScale` **independiente** de `scale`.
- `layerVisibility: Record<string, boolean>` — VP-freeze de verdad, y con la
  semántica correcta: `false` congela en esta ventana, `true` **descongela** en
  esta ventana una capa congelada globalmente (`paper-space.ts:396-403`).
- `layerOverrides` con color y grosor por ventana.
- `view: CadViewportView` — cámara por valor (proyección paralela, `kind`
  `plan`/`elevation`/`section`/`detail`, `sectionPlane`), con una justificación
  de por qué **no** se reutiliza `namedView` que firmaría cualquier arquitecto de
  formatos.
- `derivation` con `sourceDigest` — frescura de vista derivada que falla
  **cerrada**. Es mejor diseño que el `dirty` de AutoCAD.

`CAD_SHEET_PAPERS` cubre A4–A0, letter y tabloid. `CAD_LAYOUT_TEMPLATES`
(`layout/layout-operations.ts:57`) trae los márgenes ISO 5457 con los 20 mm de
archivado a la izquierda — un detalle que sólo pone quien ha visto un plano
perforado encima del dibujo.

### 1.2 El cajetín paramétrico, y el mexicano

`plot/title-block.ts` es la mejor pieza de esta dimensión. 180 mm fijos por
ISO 7200 (y explicado por qué no crece con la hoja: el plano se archiva doblado
a A4). Dos variantes cerradas: `iso` y `mexicano`, y la mexicana existe porque
una lámina que entra a una alcaldía necesita la responsiva del Director
Responsable de Obra con su registro y su firma — 50 mm en vez de 30. Los campos
se **leen** del documento, de la presentación y de la serie, con precedencia
declarada: lo inyectado gana a lo calculado, lo calculado (número de lámina,
escala desde la ventana) gana al atributo guardado.

Esto es mejor que AutoCAD de fábrica, donde el cajetín es un bloque con atributos
que cada uno se dibuja y donde el `%<SheetNumber>%` hay que colocarlo a mano.

### 1.3 El conjunto de planos cruza documentos y vive en el servidor

`sheet-set/sheet-set.ts` toma la decisión correcta y la razona: el conjunto **no**
vive dentro de `CadDocument` porque agrupa hojas de varios dibujos. Trae
numeración (`prefix`/`start`/`step`/`padding`/`suffix`), `numberLocked` para el
plano cuyo número es contractual, subconjuntos, y una `version` monótona con
`expectedVersion` para el 409. `sheet-set-publish.ts` numera **sobre lo que de
verdad se entrega**, no sobre lo que el conjunto contiene, y lo argumenta: rotular
«1/4 … 3/4» en un juego de tres es una mentira que llega a obra.

Frente al `.dst` de AutoCAD —un archivo local que se rompe en cuanto alguien
mueve una carpeta— esto es **mejor**, no equivalente.

### 1.4 CTB de verdad

`plot/plot-style-table.ts` lee y escribe la lista de propiedades del `.ctb`/`.stb`
con el vocabulario real (`plot_style`, `color`, `screen`, `lineweight`,
`custom_lineweight_table`), detecta la cabecera `PIAFILEVERSION_2.0,CTBVER1,compress`
y descomprime el zlib con el códec inyectado (`node:zlib` o
`DecompressionStream`). Aplica `screen` como atenuación de color y
`convertToGrayscale`. Y `cadPlotStyleTableNameMatches` resuelve `Monochrome.CTB`
≡ `monochrome`, que es cómo la gente escribe el nombre.

### 1.5 El PDF está medido contra sus bytes

`docs/cad/evidence/plot-fidelity-slo.json` publica `worstScaleErrorMm =
2.8e-14` contra `toleranceMm = 0.001`, con la razón de la tolerancia escrita
(dos órdenes por debajo del escalímetro). El golden
`e2e/golden/46-cad-layout-plot.spec.ts` teclea `LAYOUT`/`MVIEW`/`PSET`/`PLOT`
contra el producto real, descarga el PDF y afirma sobre `inspectCadPdf`: 1 página,
420×297 mm ±0,1, fuentes declaradas. Y afirma también que **trazar no sube la
versión del documento**.

### 1.6 Cortes y alzados llegan a la lámina

`layout/solview.ts` + `soldraw.ts` + `solview-annotations.ts` derivan planta,
alzado, sección y detalle desde el modelo 3D a «placas» 2D en espacio modelo, con
capas `-VIS/-HID/-HAT/-DIM/-ROT`, rótulo de vista con su escala, marca de corte y
globo de detalle. Es el camino por el que un corte por un muro **sí** llega hoy a
una lámina y se puede acotar. No es una ventana 3D (ver hueco 12), pero resuelve
el flujo.

### 1.7 Publicaciones auditadas

`lib/cad/repositories/publications.ts` + el flujo de `publishSheetSetPdf`
(`Layout3DEditor.tsx:13366`) calcula el SHA-256 del PDF, lo registra en el
servidor con `expectedCadDocumentVersion`, y **no descarga el archivo si el
recibo falla**. Esa es la trazabilidad de emisión que en AutoCAD hay que comprar
aparte.

---

## 2. Los huecos, por lo que más duele

### H1 · No se puede dibujar ni escribir sobre el papel · **BLOQUEANTE**

**AutoCAD:** pulso la pestaña `Layout1`, el lienzo se convierte en la hoja, y
dibujo encima: nota, leyenda, escala gráfica, norte, tabla de acabados, nube de
revisión, referencia cruzada. Es donde vive el 30 % de la tinta de una lámina.

**Valle hoy:** el esquema tiene el bolsillo —`CadPaperSpace.entityIds`— y nadie
lo llena ni lo lee.

- `paper-space.ts:823`: `const commands = document.modelSpace.entityIds.map(...)`.
  El plan de publicación **sólo** proyecta espacio modelo por cada ventana.
- El único escritor de `space.entityIds` en todo el árbol es
  `layout/viewport-operations.ts:308`, que mete ahí el contorno de una ventana
  poligonal. Ese contorno tampoco se dibuja.
- No hay ningún camino de comando que cree una entidad en una hoja. El propio
  BACKLOG P2-14 lo dice: *«investigado sin encontrar HOY un camino de comando que
  cree una entidad exclusivamente en `paperSpaces[i].entityIds`»*.

**Por qué duele:** el lunes abro la lámina A-101 y necesito escribir «VER DETALLE
3/A-501» junto a la ventana. No hay dónde. Tampoco puedo poner el cuadro de
simbología, ni la escala gráfica que el municipio pide, ni la nube de la revisión
B. Todo eso tendría que dibujarlo en espacio modelo, a la escala de la ventana,
donde estorba al dibujo y donde se descoloca en cuanto cambio la escala.

**Cuánto cuesta:** varios días.

**Cómo se construye:**
1. Un `space` activo en el contexto de comandos: `CadCommandContext` ya conoce
   `activeLayout`; falta un `activeSpace: "model" | "paper"` que el motor
   consulte al insertar. La orden `insert` de `entity-commands.ts` gana un campo
   `space?: { paperSpaceId: string }` y, cuando viene, empuja el id a
   `paperSpaces[i].entityIds` en vez de a `modelSpace.entityIds`.
2. `buildCadPublishPlan` gana un tercer bloque de comandos por hoja —después de
   las ventanas y antes del cajetín— que recorre `space.entityIds` con la matriz
   **identidad** (el papel ya está en milímetros) y el mismo `renderEntity`.
   `CadPublishSheet` gana `paperCommands: CadVectorCommand[]`.
3. `plot-pdf.ts` los dibuja tras las ventanas, sin recorte.
4. Los cuatro hosts 3D de P2-14 escopan por `modelSpace.entityIds`, o la nota se
   cuela a la escena 3D.

**Cómo se verifica:** una spec que meta un `mtext` sólo en
`paperSpaces[0].entityIds` y afirme (a) que `measureCadPdf` lo lee en los bytes
del PDF, (b) que `buildCadPublishPlan` no lo proyecta dentro de ninguna ventana,
y (c) el control negativo de P2-14: `wall-solid-host` no lo materializa en 3D.
Golden: `CHSPACE`/`MTEXT` sobre la hoja y el texto en el PDF.

---

### H2 · La ventana gráfica no recorta en el PDF, y el aviso dice que sí · **BLOQUEANTE**

**AutoCAD:** una ventana gráfica recorta. Siempre. Es la definición de ventana.

**Valle hoy:** no recorta en el camino canónico, y sí en el legado.

- `paper-space.ts:846` calcula `clip: { ...viewport.paperBounds }`.
- `plot/plot-pdf.ts:306-315` recorre `sheet.viewports` y llama a `drawCommand`
  **sin** `saveGraphicsState`/`clip`. El único `pdf.clip()` de todo el archivo
  está en `drawImageCommand` (`plot-pdf.ts:454-461`), para imágenes.
- El camino LEGADO sí recorta: `components/cad/editor/sheet-set-pdf.ts:74-81`
  hace `pdf.rect(viewport.clip...); pdf.clip(); pdf.discardPath();`.
  **El botón de publicar produce un PDF recortado y el comando `PLOT` produce
  uno sin recortar.** Es una regresión del camino nuevo respecto del viejo.
- Y `paper-space.ts:817-822` empuja el aviso `viewport_model_clipped` cuyo
  `detail` afirma *«geometry is clipped to paper bounds»*. Es un claim sin
  evidencia dentro del propio producto.

**Por qué duele:** tengo dos ventanas en la A-101: la planta a 1:100 arriba y el
detalle del núcleo a 1:20 abajo. El modelo se sale por los cuatro lados de las
dos. En pantalla la vista previa SVG lo recorta (el `<clipPath>` de
`CadLayoutManager.tsx:318`); en el PDF que entrego, la planta entera se dibuja
encima del detalle y encima del cajetín. Lo descubro en la impresora.

**Cuánto cuesta:** horas.

**Cómo se construye:** en `plot-pdf.ts`, envolver el bucle de cada viewport:
`pdf.saveGraphicsState()`, camino rectangular con `pdf.lines(..., null, true)` o
`pdf.rect`, `pdf.clip()`, `pdf.discardPath()`, dibujar, `pdf.restoreGraphicsState()`
— exactamente el patrón que ya usa `drawImageCommand` y que usa
`sheet-set-pdf.ts`. Cuando `CadPublishViewport` gane el contorno poligonal (H4),
el mismo camino sirve.

**Cómo se verifica:** una spec que coloque una línea que cruza el borde de la
ventana y lea con `measureCadPdf` que el segmento dibujado termina en el borde,
no fuera. Y un control negativo: la misma escena sin la ventana da un segmento
más largo. Además, corregir el texto del aviso `viewport_model_clipped` para que
diga lo que hace.

---

### H3 · Área y escala de trazado son inertes; tres de cinco áreas además bloquean · **ALTA**

**AutoCAD:** `PLOT` → «Qué trazar: Extensión / Ventana / Límites / Presentación /
Pantalla», «Escala 1:50», «Centrar en la hoja», «Desfase X/Y». Trazo la ventana
que acabo de encuadrar y sale.

**Valle hoy:** el modelo está completo y **no está enchufado**.

- `plot/page-setup.ts` define `CadPlotArea` (5 clases), `CadPlotScale`,
  `centered`, `offset`, y las funciones `resolveCadPlotArea`,
  `computeCadPlotPlacement` y `cadPlotProject` que hacen la aritmética.
- `grep` sobre todo `apps/web/src`: `computeCadPlotPlacement` y `cadPlotProject`
  aparecen **sólo** en `plot/plot-output.spec.ts`. Producción no los llama.
  `buildCadPlotJob` (`plot-job.ts:196-295`) no proyecta nada: emite las hojas con
  la geometría en las coordenadas de papel que ya traía la presentación.
- `plot-job.ts:284-288` llama a `preflightCadPageSetup` con
  `cadPlotAreaSources(input.pageSetup, null)` — **extents siempre `null`, display
  siempre `null`**. `resolveCadPlotArea` devuelve `null` para `extents`, `limits`
  y `display`, y la comprobación previa emite `unknown_area` con severidad
  `error`. `plot-host.ts:311-313` corta: `No se puede trazar: El área de trazado
  «extents» no está definida en este dibujo.`
- Y `cadPlotExtents` —la función que existe justamente para rellenar ese hueco—
  está exportada en `plot-host.ts:486` y **no la llama nadie**.
- Remate: `plot-commands.ts:358`, la opción `Ventana` asigna
  `area: { kind: "display" }` como marcador de posición. Si el usuario elige
  `Ventana` y pulsa `Trazar` sin picar dos puntos, traza «Pantalla» → `null` →
  bloqueado. Y el renglón de estado le dice «Área Pantalla» cuando eligió
  «Ventana».

**Por qué duele:** «traza esto a extensión» es el trazado más común que hay en un
despacho para una comprobación rápida. Aquí devuelve un error. Y «1:50» tecleado
en `PLOT ESCala` no cambia nada, lo cual es peor que el error: sale un PDF que
parece correcto y no lo es.

**Cuánto cuesta:** un día.

**Cómo se construye:**
1. `CadPlotJobInput` gana `extents` y `display` (bounds en unidades de dibujo).
   `plot-host.ts` los rellena con `cadDocumentExtents(document)` —ya importado— y
   con el encuadre vivo del visor.
2. `buildCadPlotJob` calcula `resolution = resolveCadPlotArea(...)` y
   `placement = computeCadPlotPlacement(setup, resolution, unitFactorMm)`, y
   aplica la afín resultante a **todos** los comandos de la hoja (incluidos los
   de papel de H1 y el cajetín) antes de emitir. Es una composición de matrices,
   no un camino nuevo.
3. `plot-commands.ts:358`: `Ventana` no cambia `area` hasta tener las dos
   esquinas; mientras tanto pide el primer punto explícitamente.

**Cómo se verifica:** `plot-output.spec.ts` ya prueba la aritmética; falta la
spec de integración: mismo documento trazado a `layout` y a `extents 1:100`, y
`measureCadPdf` midiendo que la distancia entre dos puntos conocidos del PDF está
en la razón 1:2 exacta. Golden: `PLOT EX T` produce archivo en vez de error.

---

### H4 · La ventana poligonal degrada al rectángulo, callando · **ALTA**

**AutoCAD:** `MVIEW Poligonal` y `VPCLIP` recortan la ventana por un contorno
libre. Lo uso en cada plano de conjunto para que el detalle no enseñe el vecino.

**Valle hoy:** `layout/viewport-operations.ts:279-317` construye la ventana
poligonal correctamente: guarda la polilínea de contorno como entidad con
`context.metadata.viewportClipFor = viewport.id` y la mete en
`space.entityIds`. Pero:

- `paper-space.ts:846` emite `clip` como el **rectángulo envolvente**
  (`paperBounds`, calculado en `viewport-operations.ts:284-290`).
- `cadViewportClipEntity` existe y no la consulta ni el plan ni el PDF.
- No hay aviso de degradación. La lámina enseña de más, sin decirlo.
- `VPCLIP` no existe en el manifiesto de comandos (295 comandos, cero
  coincidencias).

**Por qué duele:** el detalle de la escalera enseña medio pasillo del vecino.
Es exactamente el problema que la ventana poligonal existe para resolver.

**Cuánto cuesta:** un día (con H2 hecho, medio).

**Cómo se construye:** `CadPublishViewport.clip` pasa a ser
`{ rect } | { polygon: CadPoint2[] }`. `buildCadPublishPlan` consulta
`cadViewportClipEntity(document, viewport.id)` y, si existe, publica el polígono
en milímetros de papel. `plot-pdf.ts` recorta con el camino poligonal (mismo
`pdf.lines(..., null, true) + clip()` del `drawImageCommand`). Añadir `VPCLIP` al
manifiesto reusando `cadBoundaryFromEntity`, que ya está escrito.

**Cómo se verifica:** spec que compare el número de segmentos dentro del PDF con
recorte rectangular y con recorte poligonal sobre la misma escena; el polígono
debe dejar fuera segmentos que el rectángulo deja dentro.

---

### H5 · Un conjunto de planos con dos hojas homónimas se autodestruye · **ALTA**

**AutoCAD:** el `.dst` referencia `(archivo, layout)`; dos «Planta baja» de dos
archivos distintos son dos hojas distintas.

**Valle hoy:** los ids de presentación son **slugs deterministas del nombre**:
`cadLayoutId` (`layout/layout-operations.ts:292-305`) devuelve
`layout:planta-baja`. Dos documentos distintos del mismo conjunto que tengan
ambos una presentación «Planta baja» producen **el mismo id**. Y entonces:

- `sheet-set-publish.ts:165-170` construye
  `indexBySheetId` y `numbersBySheetId` **keyed por `sheet.layoutId`**. La
  segunda hoja pisa a la primera: las dos imprimen el mismo número y el mismo
  «n de N».
- `plot-pdf.ts:279-281`: `const titleBlocks = new Map(options.titleBlocks.map(l => [l.sheetId, l]))`.
  Colisión otra vez: **las dos páginas salen con el mismo cajetín entero** —
  mismo título, mismo número, misma revisión.
- `publishSheets.push(...job.sheets)` acumula dos hojas con el mismo `id`.

Y no es un caso raro: en un despacho la primera presentación de todos los
archivos se llama igual («Lámina 1», «Planta», «A-101»). Es el caso normal.

**Por qué duele:** publico el juego de ocho, lo mando al cliente, y dos láminas
llevan el mismo número y el mismo título. Esto no es un defecto cosmético: es un
juego de planos falsificado.

**Cuánto cuesta:** horas.

**Cómo se construye:** la clave de serie deja de ser `layoutId` y pasa a ser
`${documentId}::${layoutId}` —o directamente `sheet.id`, que ya es único—, y
`CadPublishSheet.id` que sale de `buildCadPlotJob` dentro de
`buildCadSheetSetPublishPlan` se reescribe con esa clave compuesta antes de
acumularse. `plot-pdf.ts` indexa por esa misma clave.

**Cómo se verifica:** spec con dos documentos, cada uno con una presentación
llamada «Planta baja», en el mismo conjunto: el PDF de dos páginas tiene dos
números distintos y dos títulos distintos leídos de sus bytes con
`measureCadPdf`. Hoy esa spec falla.

---

### H6 · No hay vista previa de trazado · **ALTA**

**AutoCAD:** `PREVIEW`. Es lo que pulso **siempre** antes de mandar veinte
láminas a la trazadora, porque una lámina mal centrada cuesta papel de A0.

**Valle hoy:** el cálculo existe y la superficie no.

- `plot-host.ts:291-308` sabe hacer `buildCadPlotPreview(input)` y entregarlo a
  `this.bridge.preview`.
- `use-command-engine.ts:296-320` construye `new CadPlotHost({...})` **sin la
  clave `preview`**. Por diseño (`plot-host.ts:297`), sin puente el anfitrión
  responde honestamente: *«La vista previa de trazado no está disponible en esta
  versión; PLOT sí produce el PDF»*.
- El comando `PLOT` sigue ofreciendo la opción `Previa` en su menú
  (`plot-commands.ts:241`), que siempre responde eso. Fix-or-hide dice que una
  opción que no gana su evidencia no debería estar visible.

**Por qué duele:** el ciclo es «trazo → descargo → abro el visor → veo que la
ventana está descolocada → repito». Con H2 y H3 sin arreglar, ese ciclo es la
única forma de saber qué va a salir.

**Cuánto cuesta:** un día.

**Cómo se construye:** `CadPlotPreview` ya trae hojas con sus comandos.
`CadLayoutManager` ya sabe pintar una hoja en SVG (`CadExactPrintPreview`,
`CadLayoutManager.tsx:50-120`). Sacar ese componente a
`components/cad/plot/CadPlotPreviewDialog.tsx`, alimentarlo con
`CadPlotPreviewSheet`, y pasar `preview: (p) => setPlotPreview(p)` al
`CadPlotHost` en `use-command-engine.ts`. Añadir `PREVIEW` al manifiesto como
alias de `PLOT Previa`.

**Cómo se verifica:** golden que teclee `PLOT PR` y afirme que el diálogo
`data-testid="cad-plot-preview"` enseña N hojas con las medidas de papel
correctas; y que los problemas de la comprobación previa se listan ahí.

---

### H7 · No hay diálogo de configuración de página, y `PAGESETUP Diálogo` miente · **ALTA**

**AutoCAD:** el Administrador de configuraciones de página con setups **con
nombre**, reutilizables entre presentaciones e **importables desde otro dibujo**.
Es como un despacho normaliza que las veinte láminas salgan iguales.

**Valle hoy:**

- `CadPageSetup.name` existe y `cadPageSetupFromLayout` lo rellena con el nombre
  de la presentación (`page-setup.ts:392`). No hay tabla de setups con nombre en
  ningún sitio.
- `applyCadPageSetupToLayout` (`page-setup.ts:424-467`) persiste **sólo** papel,
  márgenes, modo de color y escala de grosores. `area`, `scale`, `centered`,
  `offset`, `plotLineweights` y `plotTransparency` **no se guardan** — están
  documentados como «decisión de trazado», lo cual es defendible mientras H3 esté
  sin enchufar y deja de serlo en cuanto se enchufe.
- La tabla de plumas se guarda en un atributo reservado del cajetín
  (`PLOT_STYLE_TABLE`). Es un apaño consciente y declarado, pero significa que la
  tabla de plumas de una lámina viaja en el mismo diccionario que el nombre del
  cliente.
- `PAGESETUP Diálogo` emite `{kind:"page-setup"}` → `plot-host.ts:198-201` →
  `bridge.openPageSetup(layoutId)` → `studio-engine-bridges.ts:160-165`, que
  **sólo hace `setActivePaperSpaceId(layoutId)`** y no abre nada. El anfitrión
  responde *«Configuración de página abierta.»* — un éxito falso, del tipo que
  esta casa acaba de arreglar en `setSpace`.

**Por qué duele:** cada lámina se configura a mano. Veinte láminas, veinte veces,
y la número 14 sale en color porque alguien se distrajo.

**Cuánto cuesta:** varios días.

**Cómo se construye:**
1. `CadDocument` gana `pageSetups?: Record<string, CadPageSetup>` (formato nuevo
   → decisión del titular) o, si se prefiere no tocar el formato, una tabla por
   inquilino en la API, como las tablas de plumas.
2. `CadPaperSpace.pageSetup` gana `named?: string` que apunta a esa tabla, y
   `cadPageSetupFromLayout` resuelve por nombre antes de caer al implícito.
3. Diálogo real montado sobre `defaultCadPageSetup` + `preflightCadPageSetup`
   (que ya devuelve los cinco problemas con su severidad) y `openPageSetup`
   abriéndolo de verdad.
4. `PAGESETUP Importar <documentId>` copia los setups de otro dibujo.

**Cómo se verifica:** golden que cree un setup «DESPACHO-A1-MONO», lo aplique a
tres presentaciones, guarde, recargue y afirme sobre el documento del servidor
que las tres lo llevan; y que el PDF de las tres tiene el mismo papel.

---

### H8 · El PDF de trazado no rellena nada: sombreado sólido, máscara y wipeout salen huecos · **ALTA**

**AutoCAD:** el muro en corte va con sombreado SOLID negro. La cota sobre la
trama lleva máscara de fondo. El bocadillo tapa lo que hay debajo.

**Valle hoy:** `plot-pdf.ts:409` — `pdf.lines(deltas, x, y, [1,1], "S", false)`.
**Todo camino se traza con `"S"` (stroke) y nunca con `"F"` ni `"B"`.**

- El plan **sí** calcula el relleno: `paper-space.ts:613-624` construye el camino
  del sombreado sólido con `fill` (`#d1d5db` en monocromo, el color en color), y
  `CadVectorStyle.fill` existe. `drawCommand` lo tira.
- `hatch-publish-strokes.ts:71` — `if (entity.solid || !boundaries[0]) return { strokes: [] }` —
  un HATCH sólido no genera trazos de patrón, correctamente, porque debería
  rellenarse. No se rellena.
- El comando de texto lleva `backgroundMask` y `backgroundColor`
  (`paper-space.ts:658-659`); `drawCommand` no los mira. La ESCALERA ya lo
  declara: *«Un rótulo con máscara de fondo se queda como texto: la máscara es
  una caja rellena y el PDF de trazado dibuja todo camino con "S"»*.
- `WIPEOUT` cae por `plotEntityFromRegistry` (`paper-space-registry-fallback.ts`)
  y sale como **contorno**: no tapa nada. Un enmascaramiento que no enmascara es
  peor que no tenerlo, porque en pantalla sí tapa.
- `SOLID` (2D) igual: triángulo hueco.

**Por qué duele:** el corte constructivo, que es el dibujo que más define a un
despacho, sale con los muros en blanco. En pantalla se ve bien. En el PDF, no.

**Cuánto cuesta:** un día.

**Cómo se construye:** `drawCommand` mira `command.style.fill`: si existe,
`pdf.setFillColor(...)` y estilo `"B"` (rellenar y trazar) o `"F"` si el contorno
va con el mismo color. Para la máscara de texto, dibujar antes del `pdf.text` un
rectángulo `"F"` del ancho medido (`pdf.getTextWidth`) más el factor de margen de
AutoCAD (1,5 por defecto). Para `WIPEOUT`, que el adaptador del registro emita el
camino con `fill: "#ffffff"` y `drawOrder` ya lo coloca detrás. Cuidado con el
orden: hoy `plot-pdf.ts` dibuja **todas** las ventanas y luego el cajetín; los
rellenos exigen respetar `modelSpace.entityIds` como orden de dibujo, que
`buildCadPublishPlan` ya respeta.

**Cómo se verifica:** `plot-hatch-pattern.spec.ts` ya lee patrones de los bytes;
la hermana mide operadores `f`/`B` en el flujo de contenido del PDF para un HATCH
sólido, y que el número de operadores `re…f` es 1 por sombreado. Control
negativo: un HATCH ANSI31 no produce ningún `f`.

---

### H9 · El DXF que entrego no lleva mis láminas · **ALTA**

**AutoCAD:** guardo como DXF y el estructurista recibe el modelo **y** las
presentaciones, con sus `LAYOUT`, su `*Paper_Space` y sus `VIEWPORT`.

**Valle hoy:** declarado y honesto, pero es un agujero.
`dxf-document-export.ts:88-95` **excluye siempre** las entidades de espacio papel
y añade la pérdida `dxf_export_paper_space_excluded` con el conteo. No se escribe
ningún objeto `LAYOUT`, ningún bloque `*Paper_Space`, ninguna entidad `VIEWPORT`.
La fila `layouts` de la rúbrica lo dice con estas palabras: *«un despacho que
recibe el DXF recibe el modelo sin sus láminas»*.

**Por qué duele:** el intercambio con el estructurista es de ida **y vuelta**. Él
me manda su DWG/DXF con sus láminas; yo le devuelvo el mío sin ellas. La
asimetría se nota y me deja mal.

**Cuánto cuesta:** varios días.

**Cómo se construye:** en el escritor DXF, (a) tabla `BLOCK_RECORD` con
`*Paper_Space` y `*Paper_Space0…n`, (b) objetos `LAYOUT` en la sección `OBJECTS`
con `PLOTSETTINGS` embebido (papel, márgenes, escala — todo lo que `CadPageSetup`
ya tiene), (c) una entidad `VIEWPORT` por ventana en el bloque de papel con
grupos 40/41 (ancho/alto en papel), 12/13 (centro de vista), 45 (altura de vista)
y 331 (capas congeladas por ventana → `layerVisibility`), (d) las entidades de
`space.entityIds` (H1) escritas en su bloque de papel con el bit 67=1. La lectura
inversa ya existe parcialmente (`dxf-paper-space-scope.spec.ts` cuida la fuga).

**Cómo se verifica:** ida y vuelta: exportar un documento con dos presentaciones,
reimportarlo y afirmar que `paperSpaces` tiene dos con sus papeles, sus ventanas
y sus escalas. Y el corpus externo: abrir el DXF resultante con el lector propio
y con el oráculo del corpus.

---

### H10 · Publicar por lotes se limita a un conjunto de planos cargado por id · **MEDIA**

**AutoCAD:** `PUBLISH` con lista de hojas arrastrables, `BATCHPLOT`, publicar a
PDF **o** a la trazadora, un PDF por hoja **o** uno paginado, en segundo plano.

**Valle hoy:**

- `PUBLISH` (`sheet-set-commands.ts:67`) pide el id del conjunto y publica todo o
  un subconjunto. Sólo produce **un** PDF paginado
  (`sheet-set-publish.ts:260`); no hay «un archivo por hoja».
- No hay interfaz: la ESCALERA lo dice —*«No hay INTERFAZ de conjuntos: se opera
  por la línea de comandos y el conjunto se nombra por su id»*—. El único
  `grep` de `SheetSet` en `.tsx` es `Layout3DEditor.tsx`, y lo que hace ahí es
  **otra cosa**: publicar las presentaciones del documento actual.
- `BATCHPLOT`, `PLOTTERMANAGER`, `EXPORTLAYOUT`, `PLOTSTAMP`, `-PUBLISH` con
  lista de archivos: no existen (0 coincidencias en `command-manifest.ts`).
- No hay salida a **DWF/DWFx** en ninguna parte del árbol (`grep -i dwf` sobre
  `apps/web/src` da cero; sólo aparece en un documento competitivo). Es
  defendible —el DWF está en retirada— pero hay que decirlo, no callarlo.

**Cuánto cuesta:** varios días para el panel; horas para «un PDF por hoja».

**Cómo se construye:** panel `CadSheetSetPalette` con el árbol de subconjuntos
—que el modelo ya tiene—, casillas `includeInPublish`, arrastrar para reordenar
(`moveCadSheet` ya existe) y botón publicar. `publishCadSheetSet` gana
`output: "single" | "per-sheet"` y devuelve `Array<{fileName, bytes}>`.

**Cómo se verifica:** golden que abra el panel, desmarque una hoja de seis,
publique y lea 5 páginas de los bytes; y la variante por hoja, 5 descargas.

---

### H11 · Los campos son cuatro, y los del conjunto no llegan al dibujo · **MEDIA**

**AutoCAD:** `FIELD` con ~50 tipos en siete categorías; en el cajetín uso
`SheetNumber`, `SheetTitle`, `SheetSetProjectNumber`, `PlotDate`, `Filename`,
`CurrentSheetCustom`, `DeviceName`, `PageSetupName`.

**Valle hoy:** dos vocabularios separados y ninguno completo.

- `fields/drawing-fields.ts:42` — `CadFieldKind = "area" | "longitud" | "fecha" | "variable"`.
  Cuatro. Con `FIELD` y `UPDATEFIELD` tecleables y con la sintaxis de AutoCAD
  (`%<Area:id>%`), y con la decisión correcta de conservar el último valor cuando
  el objeto desaparece.
- `sheet-set/sheet-set-fields.ts:45` — trece campos de conjunto (`sheetnumber`,
  `sheettitle`, `sheetof`, `scale`, `date`…) que **sólo** se resuelven sobre los
  **atributos del cajetín** al publicar (`resolveCadSheetTitleBlock`). Un
  `%<SheetNumber>%` escrito dentro de un MTEXT del dibujo no se resuelve nunca.
- Faltan los campos de trazado: `PlotDate`, `PaperSize`, `PageSetupName`,
  `LoginName`, `Filename`, `SaveDate`.

**Por qué duele:** la nota «Lámina %<SheetNumber>% de %<SheetCount>%» que quiero
poner al pie de la leyenda no se rellena. Y con H1 sin resolver, ni siquiera hay
dónde escribirla.

**Cuánto cuesta:** un día.

**Cómo se construye:** unificar: `cadResolveField` gana un `CadFieldContext`
extendido con el conjunto y la hoja activos, y `cadSheetFieldValues` pasa a ser
una de sus fuentes. Añadir las clases `plotdate`, `papersize`, `pagesetup`,
`filename`. `UPDATEFIELD` ya cuenta lo que no pudo resolver.

**Cómo se verifica:** spec que meta `%<SheetNumber>%` en un MTEXT del dibujo,
publique el conjunto y lea «A-102» en los bytes del PDF de la segunda página.

---

### H12 · La ventana gráfica no sabe mirar en 3D: no hay trazado 3D ni SHADEPLOT · **MEDIA**

**AutoCAD:** una ventana en `SW Isometric` con `Shadeplot = Rendered` u `Oculto`.
Es como sale la lámina de presentación.

**Valle hoy:** `paper-space.ts:373-390` — `viewportTransform` devuelve una
`Affine` 2D: `{a: factor, b: 0, c: 0, d: -factor, e, f}`. Sin rotación, sin
dirección de vista. El campo `viewport.view` que `cad-paper-viewport.ts` define
con tanto cuidado **no se lee en la publicación**. La ESCALERA lo declara sin
adornos: *«Una ventana de presentación que enseñe una cámara 3D | 0 | ninguna:
`viewportTransform` es una afín 2D»*.

Consecuencias medibles:
- Una ventana marcada `kind: "section"` traza la **planta**.
- No hay **giro de ventana** (VP twist). Un plano de un solar orientado a 30° no
  se puede enderezar sobre el papel; hay que girar el modelo.
- `SHADEPLOT`, `VSCURRENT` por ventana, estilos visuales por ventana: no existen.

El paliativo es bueno (SOLVIEW/SOLDRAW, §1.6), y por eso esto es «media» y no
«alta»: el corte llega a la lámina por otra puerta.

**Cuánto cuesta:** semanas para 3D completo; **un día** para el giro de ventana,
que es lo que más se echa de menos.

**Cómo se construye (el giro, primero):** `viewportTransform` compone la afín con
una rotación derivada de `view.up` proyectado en el plano XY; `paperBounds` no
cambia. Es una multiplicación de matrices en un módulo puro. Para el 3D real:
`buildCadPublishPlan` derivaría por ventana usando el mismo aplanado que
`soldraw.ts` ya sabe hacer, cacheado por `sourceDigest`.

**Cómo se verifica:** el giro, con la spec que ya existe de fidelidad: un
rectángulo conocido girado 30° tiene sus cuatro vértices donde dice el coseno,
leídos del PDF. El 3D, con el control negativo de `solview-model.spec.ts`.

---

### H13 · La lámina es un cuadro de diálogo, no un sitio donde se está · **ALTA**

**AutoCAD:** las pestañas `Modelo | Layout1 | Layout2 …` al pie del lienzo. Pulso
una y **estoy** en la hoja: veo el papel, el margen, el cajetín y el modelo por
la ventana. Doble clic dentro de la ventana y encuadro.

**Valle hoy:**

- Hay una tira `data-testid="cad-space-tabs"` (`Layout3DEditor.tsx:14764-14795`)
  con `Model` y **`orderedPaperSpaces.slice(0, 3)`** — sólo las tres primeras
  presentaciones. Un juego de veinte enseña tres.
- Pulsar una llama a `selectPaperSpace(space)` **y `setShowSheetPackage(true)`**:
  abre un **modal** (`Layout3DEditor.tsx:17779`, «Paquete premium de entrega
  CAD») con campos numéricos, un `<select>` de cajetín y una vista previa SVG
  arrastrable de 460 px de alto (`CadLayoutManager.tsx:50-180`). El lienzo
  principal sigue enseñando el modelo.
- Tecleando es peor: `PSPACE` → `plot-host.ts:180-193` → `bridge.setSpace` →
  `studio-engine-bridges.ts:147-158`, que hace `setActivePaperSpaceId(target.id)`
  y devuelve `true`. El anfitrión responde **«Espacio papel: layout:planta-baja.»**
  y en la pantalla **no cambia nada**: `setShowSheetPackage` no se llama desde
  ningún puente de comandos (sólo desde botones, líneas 14770, 14780, 14788,
  15289, 17783, 17805). Otro éxito falso, hermano del de H7.

**Por qué duele:** componer una lámina es un trabajo visual: mover la ventana
hasta que el cajetín respire, comprobar que la nota no pisa la cota. Aquí se hace
tecleando `x`, `y`, `ancho`, `alto` en un formulario y mirando una miniatura.
Es la diferencia entre maquetar y rellenar un parte.

**Cuánto cuesta:** semanas (es lo más caro de la lista y lo que más cambia el
producto).

**Cómo se construye:** el lienzo gana un modo `paper`: la cámara pasa a
ortográfica en milímetros de papel, se dibuja la hoja, el borde imprimible y el
cajetín (`layoutCadTitleBlock` ya devuelve rectángulos y rótulos en mm), y cada
ventana se dibuja como el `CadPublishViewport` recortado que H2 y H4 producen.
`MSPACE` entra a la ventana activa (la cámara pasa a modelo con la afín de la
ventana), `PSPACE` sale. La tira de pestañas deja de cortar a tres y se hace
desplazable.

**Cómo se verifica:** golden que teclee `PSPACE` y afirme que
`data-testid="cad-paper-canvas"` está visible con las medidas de la hoja; que
`MSPACE` con una ventana bloqueada no deja hacer zoom; que arrastrar la ventana
cambia `paperBounds` en el documento que recibe el servidor.

---

### H14 · La STB carga y no hace nada; la CTB pierde tipo de línea y remates · **MEDIA**

**AutoCAD:** con una STB, cada capa y cada objeto llevan un **nombre** de estilo
de trazado. Es la mitad de los despachos nuevos.

**Valle hoy:**

- `resolveCadPlotStyle` (`plot-style-table.ts:239-266`) acepta
  `query.styleName`, y **nadie se lo pasa**: `styleCommand`
  (`plot-job.ts:131-165`) llama con `{ color, lineweight }`. Así que una STB
  resuelve siempre el estilo `Normal` para toda entidad. Cargar una STB del
  despacho no cambia el plano.
- No hay dónde guardar el nombre: `grep plotStyleName` sobre `lib/cad` da cero.
  Ni `CadLayerDef` ni `CadEntityPresentation` lo tienen.
- La CTB también pierde: `resolved.linetype` se devuelve y `styleCommand` lo
  **descarta** (sólo usa `color` y `lineweight`). Una tabla que dice «color 3 →
  DASHED» no cambia el guion. `lineEndStyle`, `lineJoinStyle` y `fillStyle`
  tampoco se aplican.

**Cuánto cuesta:** un día para la CTB completa; varios para la STB (toca formato).

**Cómo se construye:** CTB — `styleCommand` propaga `resolved.linetype` al
`CadVectorStyle` recalculando el `dash` con `cadLinetypeDashArray`, y pasa
`lineEndStyle`/`lineJoinStyle` a `pdf.setLineCap`/`setLineJoin` por comando en vez
de una vez por hoja (`plot-pdf.ts:303-304`). STB — `CadLayerDef.plotStyle?: string`
y `CadEntityPresentation.plotStyle` (formato nuevo: decisión del titular);
`buildCadPublishPlan` lo propaga al comando; `styleCommand` lo pasa como
`styleName`.

**Cómo se verifica:** spec con una CTB que mande DASHED en el color 3: el PDF
lleva un `d` (dash array) no vacío para esa entidad. Y con una STB de dos estilos
asignados a dos capas: dos grosores distintos con el mismo color.

---

### H15 · Faltan las órdenes pequeñas que se usan sin pensar · **BAJA**

Sondeado el manifiesto (`engine/command-manifest.ts`, 295 comandos): **cero**
coincidencias para `VPCLIP`, `VPMAX`, `VPMIN`, `PLOTSTAMP`, `PREVIEW`,
`EXPORTPDF`, `DWFOUT`, `PLOTTERMANAGER`, `LAYOUTWIZARD`, `MVSETUP`, `PSLTSCALE`,
`CHSPACE`, `SPACETRANS`, `ANNORESET`, `ANNOUPDATE`, `VIEWPLOTDETAILS`,
`EXPORTLAYOUT`, `BATCHPLOT`, `MARKUP`.

Las tres que más echo de menos, por este orden:

1. **`CHSPACE`** — mover una nota del modelo a la hoja (o al revés) reescalándola
   por la escala de la ventana. Es la orden que hace habitable el espacio papel.
   Depende de H1.
2. **`VPMAX`/`VPMIN`** — maximizar la ventana para editar dentro y volver. Es el
   gesto que evita el doble clic accidental que descoloca el encuadre.
3. **`PLOTSTAMP`** — el pie con archivo, fecha, escala y hoja en cada trazado de
   trabajo. Media hora de trabajo (`plot-pdf.ts` ya sabe dibujar texto en el
   papel) y ahorra confusión en obra.

Además: `PSLTSCALE` no existe **y se asume 1** — está dicho en el encabezado de
`paper-space-style.ts`, que es lo correcto, pero significa que un dibujo cuyo
autor trabaja con `PSLTSCALE=0` sale con los guiones en otra medida.

**Cómo se verifica:** el mismo patrón del resto del repositorio — un descriptor
con su spec de motor y su presencia en `ribbon-order.ts`, panel «Trazar y
publicar» (que hoy existe en `CAD_RIBBON_PANEL_ORDER.salida` sin tabla de orden
propia, así que sus comandos salen alfabéticos).

---

## 3. Defectos concretos del código

| # | Fichero:línea | Qué | Severidad |
|---|---|---|---|
| D1 | `lib/cad/plot/plot-pdf.ts:306-315` | El bucle de viewports no recorta. `CadPublishViewport.clip` se ignora. El camino legado (`components/cad/editor/sheet-set-pdf.ts:74-81`) sí recorta → dos PDF distintos para la misma lámina. | Alta |
| D2 | `lib/cad/paper-space.ts:817-822` | El aviso `viewport_model_clipped` afirma *«geometry is clipped to paper bounds»*. Falso en el PDF de `PLOT`. | Alta |
| D3 | `lib/cad/sheet-set/sheet-set-publish.ts:165-170` + `lib/cad/plot/plot-pdf.ts:279-281` | Series y cajetines indexados por `layoutId`, que es un slug determinista del nombre (`layout/layout-operations.ts:292`). Dos hojas homónimas de documentos distintos colisionan: mismo número, mismo cajetín, en el mismo PDF. | Alta |
| D4 | `lib/cad/plot/plot-job.ts:284-288` | `cadPlotAreaSources(input.pageSetup, null)`: extents y display siempre nulos → `PLOT EXtensión`/`LÍmites`/`Pantalla` devuelven `unknown_area` severidad `error` y **bloquean el trazado**. `cadPlotExtents` (`components/cad/command-line/plot-host.ts:486`) existe para esto y no la llama nadie. | Alta |
| D5 | `lib/cad/plot/page-setup.ts` (`computeCadPlotPlacement`, `cadPlotProject`) | Ambas funciones sólo se referencian desde `plot-output.spec.ts`. La colocación, la escala de trazado, el centrado y el desfase nunca se aplican a la geometría entregada. | Alta |
| D6 | `lib/cad/engine/commands/plot-commands.ts:358` | `case "Ventana"` asigna `area: { kind: "display" }`. Elegir «Ventana» y trazar sin picar dos puntos traza «Pantalla» (que está bloqueada por D4) y el renglón de estado dice «Área Pantalla». | Media |
| D7 | `lib/cad/plot/plot-pdf.ts:409` | `pdf.lines(..., "S", false)`: todo camino se traza, ninguno se rellena. `CadVectorStyle.fill` (asignado en `paper-space.ts:632`) y `backgroundMask` se descartan. HATCH sólido, WIPEOUT, SOLID y máscara de fondo salen huecos. | Alta |
| D8 | `lib/cad/paper-space-style.ts:66-67` | `viewport.layerOverrides[layerId].linetype` no se consulta: `linetypeName` sale sólo de la presentación explícita o de la capa. El campo está en el esquema, en el tipo de la prop de `CadLayoutManager.tsx:33` y no tiene ni control ni efecto. | Baja |
| D9 | `lib/cad/plot/plot-job.ts:131-165` | `styleCommand` descarta `resolved.linetype` de la tabla de plumas y nunca pasa `styleName`, con lo que toda STB resuelve `Normal`. | Media |
| D10 | `components/cad/command-line/use-command-engine.ts:296-320` | El `CadPlotHost` se construye sin `preview`. La opción `Previa` de `PLOT` está visible y siempre responde «no disponible» — contra fix-or-hide. | Media |
| D11 | `components/cad/command-line/studio-engine-bridges.ts:160-165` | `openPageSetup` sólo hace `setActivePaperSpaceId`; el anfitrión responde «Configuración de página abierta.» sin que se abra nada. Éxito falso. | Media |
| D12 | `components/cad/command-line/studio-engine-bridges.ts:147-158` | `setSpace("paper")` devuelve `true` y no muestra la hoja: `setShowSheetPackage` no se invoca desde ningún puente de comandos. `PSPACE` afirma un cambio que el usuario no ve. | Media |
| D13 | `components/cad/editor/Layout3DEditor.tsx:14775` | `orderedPaperSpaces.slice(0, 3)`: la tira de pestañas de hoja corta a tres. Un juego de veinte láminas enseña tres y no hay indicación de que falten. | Baja |
| D14 | `lib/cad/layout/viewport-operations.ts:308` | La polilínea de recorte de una ventana poligonal se guarda en `space.entityIds`, que **nada** dibuja ni consume; `cadViewportClipEntity` no se llama desde el trazado. La ventana poligonal degrada al rectángulo envolvente sin aviso. | Alta |
| D15 | `lib/cad/plot/page-setup.ts:441-455` | `applyCadPageSetupToLayout` reescala `paperBounds` con factores **distintos por eje** (`scaleX`/`scaleY`). A1→A3 (razón 0,707 en un eje y 0,703 en el otro es casi igual, pero A1 apaisado → A4 vertical no) deforma la proporción de la ventana mientras `modelBounds` y `scale` no cambian: el encuadre se recorta por un lado. El comentario documenta la intención de conservar la composición relativa; conservar la razón de aspecto exigiría un factor único. | Baja |

---

## 4. La apuesta ganadora

**El enlace de emisión: publicar un juego de planos no produce un archivo, produce
una DIRECCIÓN permanente y versionada que la obra abre en el móvil.**

Lo que hace un despacho hoy con AutoCAD: publica veinte PDF, los mete en un ZIP,
los sube a un Drive, manda un correo. Dos semanas después alguien en obra
construye con la revisión A porque es la que tiene en el móvil. Para arreglarlo,
Autodesk vende **otra** suscripción (Docs/BIM 360). Con AutoCAD a secas, no
existe.

Valle Design ya tiene las tres piezas y no las ha juntado:

1. **La publicación auditada.** `lib/cad/repositories/publications.ts` y el flujo
   de `Layout3DEditor.tsx:13400-13420` ya calculan el SHA-256 del PDF, lo
   registran en el servidor contra `expectedCadDocumentVersion` y **se niegan a
   descargar el archivo si el recibo falla**. Cada emisión es ya un hecho
   inmutable del servidor.
2. **El conjunto de planos que cruza documentos y vive en la nube.**
   `sheet-set/sheet-set.ts` con su `version` y su `expectedVersion`. Frente al
   `.dst` local de AutoCAD —que se rompe en cuanto alguien mueve una carpeta—
   esto ya es superior.
3. **La revisión y la comparación.** La rúbrica tiene la categoría `review`
   (Compare, comentarios y enlaces de revisión) con evidencia, y
   `components/cad/collab/ReviewPlanView.tsx` existe.

**La apuesta:** que `PUBLISH` devuelva, además del PDF, una **URL de emisión**:
`/emision/<sheetSetId>/<revision>`. Esa página es de sólo lectura, no pide cuenta
para verse (enlace firmado con caducidad opcional), enseña el índice del juego,
cada lámina como SVG vectorial —el plan de publicación **ya es** una lista de
comandos vectoriales, no hace falta rasterizar— y ofrece:

- el PDF con su SHA-256 visible, el mismo que registró el servidor;
- el **diff contra la emisión anterior**, lámina a lámina, con lo añadido en verde
  y lo borrado en rojo, apoyado en el `COMPARE` que ya existe;
- un **chincheta** que cualquiera pone sobre la lámina desde el móvil y que le
  llega al dibujante **anclada a la entidad**, no a un píxel, porque cada comando
  vectorial lleva su `entityId` (`CadVectorCommand.entityId`);
- la garantía de que la dirección de la revisión B nunca cambia lo que enseña, y
  que quien abra la A vieja verá un aviso de que hay una B.

Por qué esto gana y no otra cosa: **es lo único de esta dimensión que un CAD de
escritorio no puede hacer y un CAD de navegador hace casi gratis.** No es
«AutoCAD pero en la web»; es la lámina dejando de ser un archivo que se copia y
pasando a ser un hecho con dirección. Un arquitecto no cambia de CAD por una
función de dibujo más. Cambia el día que el maestro de obra deja de preguntarle
«¿ésta es la buena?».

Y tiene la propiedad que esta casa exige: se puede construir por peldaños, cada
uno con su evidencia. Peldaño 1 es la URL con el PDF y su hash —eso ya casi está
hecho—. Peldaño 2 es la lámina en SVG. Peldaño 3 es el diff. Peldaño 4 es la
chincheta anclada. Ninguno miente sobre el siguiente.

---

## 5. Qué haría yo primero, si mandara

Ordenado por daño evitado dividido por coste:

1. **D1 (recorte de ventana en el PDF)** — horas. Hoy entrego planos con geometría
   encima del cajetín, y el aviso del propio producto dice lo contrario.
2. **D3 (colisión de ids en el conjunto)** — horas. Hoy publico juegos con dos
   láminas que dicen ser la misma. Es el peor defecto de la lista.
3. **D4 + D6 (`PLOT EXtensión` bloqueado, `Ventana` mal cableada)** — horas.
4. **D7 (rellenos en el PDF)** — un día. El corte constructivo sale hueco.
5. **H3 completo (colocación, escala y centrado enchufados)** — un día. Hay que
   hacerlo antes de que alguien confíe en `PLOT ESCala`.
6. **H1 (dibujar sobre la hoja)** — varios días. Es el hueco que separa «genera
   PDF» de «tiene espacio papel».
7. **H6 (vista previa)** — un día, y quita mucho miedo.
8. **H13 (la hoja como lienzo)** — semanas. Es el que cambia el producto.

Con 1–5 hechos (una semana larga), la lámina que entrego es correcta. Con 6–7, es
una lámina que se compone aquí. Con 8, es un CAD con espacio papel.

---

*Este informe se escribió leyendo el árbol. Cada afirmación de ausencia se
comprobó con `grep`/`glob` sobre `apps/web/src` (1714 ficheros) antes de
escribirse; donde el propio proyecto ya declara el hueco —ESCALERA, BACKLOG,
`rubric.json`, `plot-fidelity-slo.json`— se cita en vez de reclamarlo como
hallazgo. No se tocó código de producto.*
