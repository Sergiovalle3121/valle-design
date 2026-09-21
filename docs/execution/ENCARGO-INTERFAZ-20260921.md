# Encargo para Codex — VALLECAD: de «saturado» a CAD

## El problema de fondo

Cada función de este editor está pintada en todos los sitios donde podría estar, en vez de en uno: 31 iconos mudos en la fila superior, 5 inquilinos peleándose por la banda central del lienzo, 4 textos de prompt simultáneos, 2 entradas dinámicas a la vez, 3 botones para «terminar» y 365 clases de color escritas a mano — lo que el dueño llama «saturado» es duplicación medible, no estética.

---

## LO QUE NO HAY QUE TOCAR (ya está hecho en la PR #224)

No rehagas, no re-propongas y no «mejores» nada de esto; parte de que ya está en el árbol:

- Los dos muelles laterales nacen plegados a un riel de 44 px; el lienzo pasa de 42 % a 72,95 % (`cadShellCanvasBox({width:1280,height:720,leftOpen:false,rightOpen:false,ribbonCollapsed:false})` = 1192×564).
- La columna flotante de 17 botones que duplicaba la cinta: borrada.
- La línea de comandos acoplada abajo de lado a lado, fila de 26 px (`CAD_SHELL_METRICS.commandRow`).
- La barra de estado en UNA fila de 26 px (`CAD_SHELL_METRICS.statusRow = 26`, `shell/cad-shell-layout.ts:38`, fijado en `cad-shell-layout.spec.ts:20`).
- La cinta enseña 16 comandos con rótulo a 1280, 19 a 1366 y 40 a 1908, y `planCadRibbonLayout` pliega paneles de derecha a izquierda.
- La tarjeta del recorrido guiado y el auto-despliegue del panel de propiedades al designar.

Todas las líneas que se citan abajo son de ESTA rama (`D:\dev\vc-ola3`), no de `main`. `grep -c "" apps/web/src/components/cad/editor/Layout3DEditor.tsx` = **16.858** hoy.

---

## Tanda 1 — El marco: que quepan las 10 pestañas y que «Guardar» esté dentro de la ventana

### Qué se cambia

**1.1 Partir la fila superior en dos bloques.** Hoy `trailing` y `quickAccess` son `shrink-0` (`ribbon/CadRibbon.tsx:320` y `:343`) y el único elástico es el tablist con `min-w-0 flex-1` (`:341`): base 0, así que absorbe TODO el recorte y llega a 0 px; lo que sobra se cae por un `overflow-x-auto` con la barra oculta (`:316`). Restaura la partición: zona elástica que desplaza + bloque final `shrink-0` corto (estado de aprobación + Guardar + Cerrar editor).

**1.2 Mudar 24 de los 31 iconos, no borrarlos.** Arriba quedan 7: Guardar, Deshacer, Rehacer, Publicar PDF, Cerrar, el selector de estado de aprobación y el par 2D/3D. «Revisión de diseño», «Cantidades», «Paquete de entrega», «Versiones», «Celdas» y «Cargar/Exportar DXF» tienen que aparecer **con rótulo** en un panel de la cinta o en el riel derecho, conservando el mismo `title`, y **en un solo sitio**: si un título queda en dos lugares, el modo estricto de Playwright revienta (es el fallo que `scripts/cad/check-e2e-localizadores.mjs` ya documenta para los presets de cámara). Además, `field-controls.tsx:53-60`: el botón no lleva `aria-label` ni `type="button"`; su único nombre es el `title`.

**1.3 Las seis ayudas de dibujo, juntas y abajo.** `Layout3DEditor.tsx:13611-13616` tiene un `T3Btn` de OSNAP (`Magnet`, `draftSettingsHost.toggleOsnap()`) que es el MISMO interruptor que `CadDraftStatusBar.tsx:80-88` (`Magnet`, «Referencia a objetos», F3): mismo estado, mismo glifo, dos bandas, dos nombres. Borra los tres `T3Btn` de ayudas de la fila superior y añade `grid` (F7) y `snap` (F9) al array `toggles` de `CadDraftStatusBar.tsx:70-112`. Ojo al cableado: `layers.grid` y `snap` son `useState` locales de `Layout3DEditor`, no viven en `draftSettings`, así que `CadDraftStatusBar` necesita dos props nuevas y `CadStatusBar` tiene que pasarlas.

**1.4 Vaciar la bandeja de SaaS de la barra de estado.** `CadStatusBar.tsx:639-642` monta `cad-status-tray` con cuatro anfitriones: `CadIncidentReporter.tsx:102-137`, `StudioCollaborationLayer.tsx:136`+`:278-286`, `TeamMessagingHost.tsx:77`+`:127-135` y `CallBar.tsx:183-215`. Los cuatro se mudan al item `collaboration` que el riel derecho YA tiene (`shell/cad-shell-rail-items.tsx:82-87`, icono `GitMerge`): así no se toca la cinta ni su gate de cobertura. En la bandeja queda como mucho 1 botón.

**1.5 Un solo riel.** `cad-shell-rail-items.tsx:34-41`: `CAD_LEFT_RAIL_ITEMS` tiene UNA entrada («Biblioteca»), y esa columna de 44×564 px se reserva siempre (`CadShellFrame.tsx:98-119`). «Biblioteca» pasa a ser el noveno item del riel derecho con icono propio (hoy usa `Boxes`, el mismo que «Bloques y xrefs» en `:80`). `CadShellCanvasBoxInput` gana una entrada `leftRailVisible` — hoy la firma no admite el caso, el cambio de firma es parte del trabajo.

### Por qué duele hoy

A 1280 px la fila pide 1.607 px: las 10 pestañas se quedan en 16 px (cero rótulos) y el borde derecho de «Guardar» cae en x=1.533, 253 px fuera de la ventana. En 3D pide 1.845 (desborde 565). A 1908 en 2D las pestañas reciben 317 px = 4 de 10; en 3D, 79 px = 1 de 10. Las 10 no caben hasta ~2.320 px, y no hay barra de scroll que avise. La bandeja sola mide 476 px (37 % de la fila) y hace desbordar la barra de estado sin scroll visible (`CadStatusBar.tsx:387`).

### Criterio de aceptación

1. Golden nuevo a 1280×720, 1366×768 y 1908×1080, en 2D y 3D: `cad-top-toolbar` cumple `scrollWidth === clientWidth`, y cada uno de los 10 `cad-ribbon-tab-*` tiene `boundingBox().width > 0` con su texto sin truncar.
2. El bloque final `shrink-0` mide ≤ 340 px medidos, de modo que 157 + 730 + 340 + 44 ≤ 1.280.
3. `e2e/golden/215-cad-cola-barra-superior-dentro-del-viewport.spec.ts` verde. **Su tercera prueba (líneas 90-105) hay que REESCRIBIRLA**: exige `toolbar.locator("> div").first()` con `scrollWidth > clientWidth`, es decir codifica la banda scrollable que la #224 abolió, y hoy está roja pase lo que pase. Las dos primeras (Guardar, selector de estado y Cerrar editor dentro del viewport a 1280 y 1024) se mantienen intactas.
4. Guard nuevo en `npm run check:cad`: cuenta los `<T3Btn` dentro de `trailingContent` y falla por encima de **8**.
5. Golden: `cad-top-toolbar button:not([data-testid^="cad-ribbon-tab-"])` ≤ 10 a 1280 px en 2D y en 3D.
6. La suite `e2e/golden` que localiza por título (`getByTitle(/Exportar a DXF/)` y compañía) sigue verde **sin editar sus localizadores**, y `docs/cad/evidence/ui-command-reach.json` no pierde ni un comando.
7. Existen `cad-draft-status-grid` y `cad-draft-status-snap`, con `aria-label` terminado en «· F7» y «· F9». Spec sin navegador: ningún botón de `trailingContent` escribe `draftSettings`, `layers.grid` ni `snap`. Golden: pulsar `cad-draft-status-osnap` cambia el estado y no existe ningún otro control con `data-active` ligado a ese booleano.
8. Golden a 1280×720 con sesión iniciada: `.cad-status-bar` cumple `scrollWidth === clientWidth`; `cad-status-tray` tiene ≤ 1 hijo directo; `cad-cursor-coordinate`, `cad-save-status`, la capa activa y los seis conmutadores de ayudas están con `boundingBox` dentro del viewport.
9. `cad-shell-layout.spec.ts`: `cadShellCanvasBox({width:1280,height:720,leftOpen:false,rightOpen:false,ribbonCollapsed:false,leftRailVisible:false}).ratio >= 0.755`. Golden: `cad-shell-left-dock` (que se renderiza siempre) tiene `boundingBox().width === 0` con el panel izquierdo cerrado, y `cad-canvas` mide ≥ 1236 px.

---

## Tanda 2 — El plano: una sola capa flotante, y el centro y el pie libres

### Qué se cambia

**2.1 Una capa, no tres.** El glifo `Expand` aparece dos veces y `MousePointer2` dos veces para el mismo comando: `Layout3DEditor.tsx:13533-13539` («Seleccionar / mover»), `:13634-13639` y `:13646-13652` («Ajustar a…»), `CadNavigationBar.tsx:30-47` y `CadToolPalette.tsx:40-44`,`:65`. Lo que sobra son los de la FILA SUPERIOR: quítalos de `trailingContent` (ya están en la cinta, Vista › «Encuadre y zoom») y **fusiona** `cad-navigation-corner` y `cad-toolbar` en una sola capa en la esquina superior derecha, **conservando `data-testid="cad-toolbar"`** y los nombres accesibles «Seleccionar» / «Encuadre» / «Ajustar todo», para que la fixture y sus quince specs no se enteren. Aparte: icono propio para «Biblioteca» (p. ej. `LibraryBig`) y para DSETTINGS (hoy `Settings2` designa a la vez «Workspace profesional» y «Ajustes de dibujo»).

**2.2 Vaciar la banda superior central.** Cinco elementos resuelven a la misma caja (`top: 12px; left: 50%; translateX(-50%)`): `studio/viewport-hints.tsx:44` (`cad-live-prompt`), `Layout3DEditor.tsx:14527` (píldora HATCH), `:14533` (píldora Recorrido), `:14608` (`cad-engine-command-finish`) y `viewport/collab-overlay.ts:98` (`z-40`, gana a todos); 36 px más abajo, `studio/draft-toolbar.tsx:96`. La exclusión mutua está escrita a mano: la condición del botón de terminar (`Layout3DEditor.tsx:14606`) lleva TRES negaciones sólo para no chocar con dos de los otros cuatro. El prompt vivo se va a la fila de prompt de la línea acoplada (`CadCommandLine.tsx:310-331`, que ya lleva las palabras clave pulsables) y al tooltip del cursor; HATCH y Recorrido pasan a ser **iconos o píldoras cortas** en la barra de estado — cabe en el `overflow-x-auto` de `CadStatusBar.tsx:387`, pero la fila es de 26 px: no entran las dos frases largas de hoy.

**2.3 Los dos botones «Terminar».** Borra el bloque `Layout3DEditor.tsx:14596-14619` entero (incluido su comentario de 13 líneas) y el `cad-draft-finish` de `studio/draft-toolbar.tsx:109-124`. El comentario que acompaña al botón afirma que «sin este botón no había ninguna forma de cerrarlo sin teclado»: **es falso hoy** — `viewport/pointer-router.ts:436-446` ya llama a `this.accept()` con el botón derecho sin palabras clave, `:447` abre el menú del paso pegado al cursor, y el menú contextual del lienzo (`Layout3DEditor.tsx:14329`) ya tiene «Enter / terminar». Ésa es la razón escrita por la que nadie lo ha borrado; queda desmentida.

**2.4 El borde inferior.** `studio/viewport-hints.tsx:115` lleva `@container` (`container-type: inline-size`) en una caja `absolute` de ancho automático: la contención en el eje en línea calcula el ancho IGNORANDO el contenido, así que `[data-testid="cad-viewport-hint"]` se pinta **25×193 px** (medido en vallecad.com/demo a 1440×825) — una columna de una letra por línea. Además se monta sin condición (`Layout3DEditor.tsx:14727`), y su variante «select» tiene 152 caracteres: la más larga de las cinco de `HINTS`, y la que ve un profesional el 90 % del tiempo. Bórrala junto con `ScaleBar` del lienzo (la escala ya está en la barra de estado). Dato para no repetir el error: `@max-[50rem]:hidden` **nunca se aplica**, porque una consulta de contenedor no consulta a su propio elemento y no hay ningún ancestro con `container-type` (los únicos `@container` del árbol CAD son éste y `CadStatusBar.tsx:387`). La leyenda de holguras (`viewport-hints.tsx:88`) sólo aparece con esa capa encendida: no es inquilino permanente, se queda o se muda a la barra de estado.

**2.5 Las dos tarjetas de 320 px.** `Layout3DEditor.tsx:14373` (`cad-recovery-panel`, `absolute left-3 top-16 z-30 w-80`) y `:14509` (importación DXF, `absolute right-3 top-16 z-20 w-80`, con lista `max-h-44`). Cada una es el 27 % del ancho del lienzo (1192 px con los muelles plegados) y su único gesto es «Ocultar». Pasan a ser paneles de riel (recuperación a la izquierda, importación a la derecha) con insignia numérica en el icono; el resumen de la importación se escribe ADEMÁS en el diálogo de la línea de comandos.

### Por qué duele hoy

El centro superior del plano es la zona donde el arquitecto mira al encuadrar, y tiene 5 inquilinos y ningún árbitro. El pie tiene 3 cajas justo encima de la línea acoplada. Y la chuleta de ayuda es una columna de 25 px de ancho, sin cerrar, sobre el dibujo.

### Criterio de aceptación

1. Golden a 1280×720, **en reposo** (sin diálogo, sin paleta, sin editor MTEXT, sin menú contextual): dentro de `[data-testid="cad-canvas"]`, exactamente **1** descendiente posicionado que contenga un `<button>`: la capa fusionada `cad-toolbar`.
2. Golden a 1280×720: **0** elementos posicionados cuya caja mida menos del 90 % del ancho del lienzo con `boundingBox.y - canvas.y < 48`, excluyendo `cad-toolbar`. Hoy son 5 (6 contando `top-12`). No cuentan los hijos a pantalla completa: el div de montaje de THREE (`Layout3DEditor.tsx:14211`, `absolute inset-0`), el panel «sin WebGL» y `cad-crosshair` (`left-0 top-0 size-0`).
3. Golden a 1280×720: **0** elementos dentro de `cad-canvas` con `boundingBox.bottom` a menos de 48 px del borde inferior del lienzo, **excluyendo `cad-toolbar`** — que `e2e/golden/68-cad-nada-tapa-el-lienzo.spec.ts` admite a propósito y por escrito en `CAPAS_ADMITIDAS`. Hoy son 2 visibles + 1 tapada.
4. `page.getByTestId('cad-engine-command-finish')` y `cad-draft-finish` devuelven 0 en todo el árbol. **`e2e/golden/61-cad-ribbon-mouse-only.spec.ts` no puede pasar a teclado**: su cabecera dice que ningún `page.keyboard.*` aparece ahí a propósito. Su ayudante `finishCommand` (y los dos usos del golden 103) se sustituyen por `page.mouse.click(x, y, { button: 'right' })`, que `contextMenu` convierte en aceptar — que es además el gesto de AutoCAD. El golden nuevo cubre los DOS caminos: con enrutador activo (clic derecho = Intro) y sin enrutador (clic derecho = menú con «Enter / terminar»).
5. Spec sin navegador: no hay dos entradas con el mismo componente de icono entre `CAD_LEFT_RAIL_ITEMS`, `CAD_RIGHT_RAIL_ITEMS`, los toggles de `CadDraftStatusBar` y los iconos de la capa fusionada.
6. Golden: con un borrador recuperable forzado y un DXF con advertencias soltado, ni `cad-recovery-panel` ni el panel DXF tienen caja que interseque `cad-canvas`; los iconos de riel llevan insignia; el diálogo de comandos contiene la línea de resumen de la importación.
7. `ui-command-reach.json` mantiene ZOOM, PAN y los modos de selección.

---

## Tanda 3 — Dibujar: UNA entrada dinámica, pegada a la mira

### Qué se cambia

Hoy hay dos a la vez: `pointer-router.ts:313` enciende el cursor vivo en cada `invoke()`, y en paralelo `Layout3DEditor.tsx:14552` monta `CadDraftToolbar`, que monta `CadDynamicInput` en `absolute top-12 left-1/2` (`draft-toolbar.tsx:96`). Nada apaga una cuando aparece la otra. La losa tiene rótulo DYN, tres botones ABS/REL/POLAR (`CadDynamicInput.tsx:104-119`), dos campos, una previsualización y un botón «Aplicar» (`:190-198`); mide 76 px de alto con puntero grueso (medido en `pointer-router.ts:143-146`).

**El orden importa. Antes de borrar nada:**

**3.1 Dar salida a los tres caminos que hoy dependen de la losa.** `appendWallTo` (`Layout3DEditor.tsx:8062`) tiene UN SOLO invocador en todo el archivo: `commitDynamicInput:8112`. La herramienta «Muro» no está en `CAD_ENGINE_POINTER_COMMANDS` (`pointer-router.ts:106-121`: LINE, PLINE, RECTANG, CIRCLE, MOVE, COPY, OFFSET), así que nunca enciende el cursor vivo; lo mismo la máquina heredada (`feedDistance`/`drawCommandRef`). Enruta «wall» y la máquina heredada al motor, o como mínimo al camino de la línea de comandos. **Y decide ANTES, no en la PR, el caso sin WebGL**: el editor lo contempla a mano en `:14559` conservándole la losa; sin WebGL no hay enrutador ni cursor vivo, así que o se acepta explícitamente que ahí se teclea en la línea de comandos (como DYNMODE 0) o se conserva la losa **sólo** para ese caso.

**3.2 Ampliar el cursor vivo.** Hoy sólo tiene distancia y ángulo (`live-cursor.ts:128-135`). Hay que añadirle X/Y absolutos y los modos radio/diámetro (`CadDynamicInput.tsx:121-133`). El tooltip ya existe (`FIELD_CLASS`, `live-cursor.ts:66-67`), `dynamicVisible` y Tab ya están (`pointer-router.ts:459`).

**3.3 Borrar la losa.** `palettes/CadDynamicInput.tsx` y el hueco de `studio/draft-toolbar.tsx`. Con ella caen: `commitDynamicInput` (`Layout3DEditor.tsx:8099-8135`), el bloque `dynamicInputKind`/`dynamicAnchor`/`dynamicGridDefault`/`dynamicInputDefaults` (`12721-12751`), el JSX de `CadDraftToolbar` (`14552-14586`) y los imports de `278`, `474` y `524`. `CadDraftToolbar` no muere sola: ORTO vive ahí (`draft-toolbar.tsx:99-106`) y hay que confirmar antes que el conmutador de la barra de estado es el mismo estado. Los 5 goldens que usan `applyDynamicInput` (26, 31, 32, 33, 40; 18 llamadas) se reescriben tecleando en `cad-command-input` — en el 31 no hay WebGL, así que la coordenada va completa por la línea (`4000,0`), no por entrada directa.

**3.4 Que teclear un número vaya al cursor.** `editor-keyboard.ts:260` desvía a la línea de comandos ANTES de ofrecer la tecla al enrutador (`pointer-router.ts:452`), y `commandLineOpen` es `useState(true)` por defecto (`Layout3DEditor.tsx:1384`): con LINE en curso, pulsar «4» escribe al pie de la ventana. Añade en la fase 0 una acción `{ type: "dynamic-field", char }` cuando `cursor.dynamicVisible` y la tecla es **`[0-9]` o `.` y nada más**: `,`, `-`, `@` y `<` son sintaxis de coordenada de la línea de comandos (`4000,0`, `-500`) y el cursor vivo no tiene dónde recogerlas. Refleja además lo tecleado en la línea de comandos. Los goldens actuales usan `locator.fill()`, que no pasa por esta fase: ninguno se cae.

**3.5 Que F12 apague de verdad.** `dynamic_input_toggle` (`keyboard-shortcuts.ts:196-200`) llega a `draftSettingsHost.toggleDynamicInput()` (`Layout3DEditor.tsx:12260-12261`) y ese valor sólo alimenta la losa. `setDynamicVisible(true)` tiene UNA llamada en todo el repo (`pointer-router.ts:313`) y no consulta ningún ajuste. Pásale `draftSettings.dynamicInput` al puente y condiciona esa llamada, con conmutación en caliente (apagar ya descongela y vacía: `live-cursor.ts:194-199`). Corrige de paso la descripción del atajo en `keyboard-shortcuts.ts:199` («Mostrar u ocultar la entrada dinámica junto al cursor»), que hoy describe justo lo único que NO hace. Si se ejecuta 3.3, este interruptor pasa de mentir a medias a no hacer absolutamente nada: es orden de ejecución, no alternativa.

**3.6 Un solo analizador.** `live-cursor.ts:325-330` es `Number(text)` con la coma cambiada por punto: `4m`, `10'-6"` o `4 1/2"` dan NaN → `commitMeasurements` devuelve `false` (`pointer-router.ts:487-489`) y no pasa nada, sin renglón de error. Peor: `live-cursor.ts:311-312` llama a `clearFields()` ANTES de `callbacks.commit(values)`, así que además **borra lo escrito**. Que `live-cursor.ts` reciba la unidad del documento y use `parseCadLengthInDrawingUnits` (`input-pipeline.ts:206-212`, el mismo import que ya usa) y `parseUserAngle` para el ángulo.

**Motivo de correctitud, no ítem aparte:** `Layout3DEditor.tsx:12703-12712` pasa a `defaultCadDynamicValues` un «cursor» que es el ancla + un paso de rejilla en X, constante, no el ratón; como `rawOrDefault` (`dynamic-input.ts:67-75`) usa el default con el campo vacío, `resolveCadDynamicInput({}, ctx)` devuelve `ok: true` y «Aplicar» queda habilitado sin haber tecleado nada, y la previsualización imprime ese `@100, 0` inventado con el estilo de un valor medido. Eso no es feo: es un vértice falso en un plano que va a obra. Muere al borrar la losa.

### Criterio de aceptación

1. `cad-dynamic-input` no existe en el DOM en ningún golden; durante LINE con un punto ya designado, `cad-live-dynamic-input` es visible y el centro de su caja está a menos de 120 px del cursor.
2. `grep -c "" apps/web/src/components/cad/editor/Layout3DEditor.tsx` ≤ **16.742** (hoy 16.858).
3. `appendWallTo` no tiene invocadores → se borra también; si los tiene, el camino nuevo está probado.
4. Spec en `editor-keyboard.spec.ts`: dígito con `dynamicVisible: true` devuelve `dynamic-field`; con `false`, `command-line`; `,`, `-`, `@` y `<` devuelven `command-line` en ambos casos. e2e: LINE, clic, teclear `4000` sin Tab → `cad-live-distance` vale `4000`.
5. Spec en `pointer-router.spec.ts`: con el ajuste en `false`, `invoke()` NO llama a `setDynamicVisible(true)`. e2e: LINE en curso, F12 → `cad-live-dynamic-input` oculto; F12 otra vez → vuelve.
6. Spec: con el documento en mm, `4m` en `cad-live-distance` produce 4000 y `10'-6"` produce 3200,4; `xx` produce un renglón `error` en `cad-command-line-log` **y el campo conserva el texto** — lo que no puede es vaciarse en silencio.
7. Prueba escrita ANTES del borrado, que hoy puede estar roja y debe quedar verde: LINE, primer punto, confirmar `@4000,0`, pulsar Intro otra vez → el documento tiene UNA entidad LINE con dos vértices, no tres. (`CadDynamicInput.tsx:83-86` no vacía `values` ni suelta el foco, y la `key` de remontaje `Layout3DEditor.tsx:14556` no cambia entre dos puntos encadenados.) Si resultara verde ya hoy, no pasa nada: nada del resto depende de ella.
8. Si se conserva algún resto del control: `dynamic-input.spec.ts` — `resolveCadDynamicInput({}, ctx)` con `defaults` presentes devuelve `ok: false`.

---

## Tanda 4 — Color: el plano deja de ser azul y el cromo deja de gritar

### Qué se cambia

**4.1 El fondo del lienzo.** `Layout3DEditor.tsx:1473` arranca el estudio en el preset «dark», definido en `studio/editor-presentation.ts:23-30`: fondo `#0a0f1e`, suelo `#14203a`, retícula `#2a3a5c`, gridB S 41 %. El acento del cromo es H251 (`globals.css:309`, `--primary: 251 96% 72%`): 26 grados de tono de separación, así que lienzo y paneles se funden en una mancha azul-violeta y cada pieza por separado sigue pasando 4,5:1. El preset «Estudio» del mismo archivo (`:45-51`) ya mide `#202329` y `#3c424d` y nadie lo usa. Cambia el arranque a `"studio"` y baja el propio preset «dark»; conserva el azul actual como un quinto preset opcional llamado «Azul». **Toca también `render-style.ts:50` (`DEFAULT_BACKGROUND_COLOR`) y `render-style.spec.ts:104`**, que rompen si se mueve `THEMES.dark` sin tocarlos.

**4.2 La tinta del cromo.** 365 clases de color crudas de Tailwind en 36 archivos de `apps/web/src/components/cad` (indigo 135, amber 63, rose 44, violet 40, gray 28, emerald 24, slate 19, cyan 8, red 2, orange 2); en `apps/web/src/components/ui`: **0**. Las opacas son 47 rellenos y 71 textos crudos, más 130 textos con token violeta (`text-primary-ink` ×126, C 0,169). Empieza por donde duele: los 126 `text-primary-ink` y los 28 rellenos `indigo-500`/`indigo-600`/`violet-500` (C 0,23). Los tintes con alfa baja se QUEDAN: `bg-indigo-400/15` compuesto sobre `--card` da C baja y ya está dentro de un techo sano; `rose-100`, `violet-100`, `gray-950` son cosmética de token, no ruido. Los `text-primary-foreground` (17) son blanco puro: fuera de la lista. Parte la PR por carpeta (`palettes/`, `dialogs/`, `editor/`) para no hacer una de 45 archivos.

**4.3 Cromo neutro DENTRO del lienzo.** Toda capa que se pinte sobre `cad-canvas` usa `bg-popover/95` + `border-border` + `text-popover-foreground`, como ya hace `CadCommandLine.tsx:295`. **El color se reserva a designación, pinzamientos, marcadores de captura y el estado de los pines de colaboración** (`collab-overlay.ts:89-90`: ámbar = comentario abierto, esmeralda = resuelto — ahí el color ES información). No borres esa señal por cumplir un gate.

**4.4 El desenfoque.** `grep backdrop-blur` en `components/cad`: 25 usos, 2 en `CadToolPalette.tsx` que la #224 retira, quedan 23 en 17 archivos. Los que se solapan con el visor: `studio/viewport-hints.tsx:88` y `:115`, `viewport/CadOverviewMinimap.tsx:145`, `palettes/CadDynamicInput.tsx:97`, `editor/CadCommandPalette.tsx:99` (`CadCommandLine.tsx:267` lo resuelve la #224 al acoplarla). Y los 5 de `Layout3DEditor.tsx`: `13415`, `13418`, `14371`, `14440`, `14509`. Opaca toda superficie que se solape con el visor; deja el desenfoque sólo en el telón de fondo de un modal. AutoCAD permite atenuar paletas y su línea de comandos flotante es translúcida por defecto, pero nada de su interfaz desenfoca el espacio modelo: la transparencia deja las líneas nítidas, el desenfoque las destruye — y cuesta GPU en cada cuadro justo mientras se encuadra.

### Criterio de aceptación

1. Cromaticidad OKLCH del fondo, el suelo y las dos retículas del preset por defecto ≤ **0,015** (hoy 0,032 / 0,053 / …), es decir por debajo del gris del espacio modelo de AutoCAD (C ≈ 0,018). `render-style.spec.ts` verde.
2. Tinta opaca con C > 0,08 compuesta sobre su sustrato en `apps/web/src/components/cad`: de la cuenta de hoy a ≤ **8**, y esas 8 nominadas una a una en la lista de excepciones del gate de la Tanda 5, con la razón escrita al lado (anillo de foco, herramienta activa, botón principal de diálogo).
3. Clases de color crudas de Tailwind en `components/cad`: de **365 a 0**.
4. `backdrop-blur` en elementos posicionados sobre el visor: de **5 a 0**; total en `components/cad`: de **23 a ≤ 2** (sólo telones de modal). Golden: ninguna superficie flotante con alfa < 1 dentro del rectángulo del lienzo, medido por estilo computado en el DOM.
5. `npm run check:contrast` verde en tema claro y oscuro. **No hay goldens de imagen que regenerar**: `toHaveScreenshot` no aparece en ningún spec de `apps/web/e2e`.
6. El presupuesto de líneas de `Layout3DEditor.tsx` no sube: esto es sustitución, no añadido.

---

## Tanda 5 — Los gates que impiden que todo esto vuelva en el siguiente sprint

### Qué se cambia

**5.1 `scripts/design/check-chroma.mjs` + `check-chroma.spec.mjs`.** Mismo patrón que el par de contraste: variable de entorno `VALLE_CHROMA_SRC` para que la prueba demuestre que el gate sale con código 1 sin tocar el árbol de trabajo, tabla congelada de la paleta Tailwind v4 **en OKLCH** dentro del propio script (v4 ya viene en `oklch()`: no hay que convertir nada), y lista de excepciones con la razón escrita. Regla: toda clase de color de `apps/web/src/components/cad/**/*.{ts,tsx}`, resuelta y compuesta sobre su sustrato declarado, con **C ≤ 0,04 para superficies grandes y C ≤ 0,08 para tinta**. El presupuesto de excepciones se cuenta **por nombre de token** (`--primary`, `--success-ink`, `--warning-ink`, `--danger-ink`, el anillo de foco), ≤ 8 entradas y SÓLO puede bajar — si se contara por usos, los 400+ usos legítimos de los tres colores de estado lo revientan al arrancar. Cuélgalo de `check:cad` en `package.json:60`, inmediatamente detrás de `check:contrast`. Hoy `scripts/design/check-contrast.mjs:86-90` declara 4,5:1, 3:1 y 1,3:1 y nada más: mide legibilidad, no intensidad, por eso un `#615fff` pasa limpio y aun así grita. `scripts/design/contrast.mjs` ya exporta `hslChannelsToRgb` (:22) y `composite` (:67).

**El veto NO puede ser un veto plano de hex sobre los archivos CAD.** La regla 4 del gate existente exime a propósito los módulos CAD porque los colores ACI (`#ff0000`, `#00ff00`) son DATOS del plano, y `viewport-hints.tsx:96-103` pinta muestras con `style={{background:'#f59e0b'}}` inline, que ninguna regex de clases va a ver. Limita el veto a clases de paleta Tailwind y a `text-[Npx]` en los archivos concretos: `editor/Layout3DEditor.tsx`, `viewport/live-cursor.ts`, `viewport/grip-menu-host.ts`, `viewport/collab-overlay.ts`, `studio/draft-toolbar.tsx`, `studio/viewport-hints.tsx`, `palettes/CadDynamicInput.tsx`.

**5.2 El glob del gate de diseño.** `apps/web/src/components/ui/design-system.spec.ts:26` hace `globSync("src/**/*.tsx")`. Su regla 3 (`:87-93`) prohíbe cyan/sky/teal con el mensaje «El acento de VALLECAD es índigo», y sin embargo hay 8 clases cyan vivas en archivos `.ts` que el glob no ve: `viewport/live-cursor.ts:58`, `:67`, `:71`; `viewport/grip-menu-host.ts:24`, `:26`; `viewport/collab-overlay.ts:249`. En total 21 clases crudas escapan por ese hueco. La regla 7 del MISMO archivo (`:191`) ya usa `globSync("src/**/*.{ts,tsx}")`: el repo conoce la forma correcta. Corre el gate con el glob ampliado UNA VEZ antes de tocar nada, para ver la lista completa de lo que despierta.

### Criterio de aceptación

1. `check-chroma.mjs` ejecutado contra `main` sale con código 1 y lista los infractores con `archivo:línea`; **el número se escribe en el archivo después de correrlo, no antes** — un número inventado en el encargo es el que acabaría citado en el PR. Con el cromo de la Tanda 4 arreglado sale con código 0. Su `.spec.mjs` comprueba que pasa con un cromo desaturado de prueba y que falla con uno saturado, sin mutar ningún archivo real.
2. Con el glob ampliado, `node --test` sobre `design-system.spec.ts` falla **hoy por la regla 1**, con 8 tamaños arbitrarios en `live-cursor.ts`, `grip-menu-host.ts` y `collab-overlay.ts`. El encargo incluye mover esos 8 a la escala `type-*` (ojo: `text-[10px]` sube a 11 px, el piso declarado) ADEMÁS de sustituir las 8 clases cyan. Tras las dos cosas, pasa. La regla 4 no se despierta (filtra por ruta, `:103-108`), así que los dos `bg-[#0b1020]` se quedan.
3. Recuento de cyan en `components/cad`: **8 → 0**. Clases crudas en archivos `.ts` de `components/cad`: **21 → 0**.
4. El guard de `<T3Btn` en `trailingContent` (Tanda 1, criterio 4) vive en `check:cad` y su tope de 8 sólo puede bajar.

---

## Las tres reglas de este repo

1. **Los gates que hay que correr antes de abrir la PR, todos:** `npm run check:cad` (que ya arrastra `check:contrast` y arrastrará `check:chroma`), `node --test` sobre `design-system.spec.ts`, `render-style.spec.ts`, `cad-shell-layout.spec.ts`, `dynamic-input.spec.ts`, `editor-keyboard.spec.ts` y `pointer-router.spec.ts`, el trinquete de lint, la cobertura de cinta (`docs/cad/evidence/ui-command-reach.json`), `scripts/cad/check-e2e-localizadores.mjs` y la suite `e2e/golden` entera. Un gate que empieza a fallar por un cambio tuyo se arregla en la misma PR o se declara en la descripción; no se descubre en CI.
2. **El monolito sólo puede encoger.** `apps/web/src/components/cad/editor/Layout3DEditor.tsx` está en 16.858 líneas (`grep -c ""`). Cada tanda de arriba tiene que dejarlo más corto: la Tanda 3 lo lleva a ≤ 16.742, la 1 y la 2 retiran JSX, la 4 sustituye clases sin añadir líneas. Si una PR lo hace crecer, el trabajo estaba mal planteado.
3. **El juez es un golden que mide geometría, no una opinión.** En este repo no hay ni una captura de imagen (`toHaveScreenshot` sólo aparece dentro del HTML del reporte): los goldens miden DOM — `boundingBox()`, `scrollWidth === clientWidth`, estilo computado, conteo de nodos. Todo hallazgo de arriba trae su aserción; escríbela primero, mírala roja, y luego haz el cambio. Y no borres un golden viejo para que pase el nuevo: si chocan (215 tercera prueba, 68 `CAPAS_ADMITIDAS`, 61 sin teclado, 214 `cad-viewport-hint`, 28 `cad-live-prompt`, 103), la reescritura va **declarada en la descripción de la PR**, con el motivo, no descubierta en CI.