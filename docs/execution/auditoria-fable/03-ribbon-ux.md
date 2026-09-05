# Auditoría — La cinta y cómo se usa de verdad

**Quién escribe.** Arquitecto/ingeniero con veinte años de oficio. Pago la suscripción
completa de AutoCAD y la uso entera todos los días: el modelo, los layouts, los toolsets,
la cinta, los atajos, el plano que me manda el estructurista. Abro Valle Design por
primera vez con la intención honesta de cambiarme y pregunto una sola cosa: **¿podría
hacer mi trabajo del lunes aquí sin reaprender la herramienta?**

**Fecha de la revisión.** 2026-09-05, sobre el árbol tal como está en
`/home/user/valle-design`.

**Método.** Leí `docs/competitive/rubric.json` (filas `recognition` y `command-line`, que
son las que tocan esta dimensión, más los criterios de `draw-2d` sobre conmutadores),
`docs/competitive/autocad-2027-gap-matrix.md`, `docs/competitive/distancia-autocad-completo-20260903.md`,
`docs/parity/ESCALERA.md`, `docs/execution/BACKLOG.md` y `AGENTS.md`. Después bajé al
código:

- `apps/web/src/lib/cad/ribbon.ts` (340 líneas) y `ribbon-order.ts` (95).
- `apps/web/src/components/cad/ribbon/` (`CadRibbon.tsx` 101, `CadRibbonPanel.tsx` 38,
  `CadRibbonButton.tsx` 61, `command-icons.ts` 552, `ribbon-icons.ts` 103).
- `apps/web/src/components/cad/command-line/CadCommandLine.tsx` (226) y
  `command-engine-host.ts`.
- `apps/web/src/lib/cad/engine/` (registry, alias-table, command-engine, command-manifest).
- `apps/web/src/lib/cad/editor-keyboard.ts`, `keyboard-shortcuts.ts`, `cad-workspace.ts`,
  `toolbar.ts`, `command-palette.ts`.
- `apps/web/src/components/cad/studio/CadStatusBar.tsx` (399),
  `palettes/CadDraftStatusBar.tsx` (150), `palettes/CadDynamicInput.tsx` (202),
  `viewport/live-cursor.ts`, `viewport/pointer-router.ts`,
  `palettes/palette-command-bus.ts`, `palettes/CadWorkspaceDock.tsx`,
  `editor/CadToolPalette.tsx`.
- `apps/web/src/components/cad/editor/Layout3DEditor.tsx` (18.453 líneas), la zona de la
  barra superior (14.660-15.460), el menú contextual (15.877-15.945) y el montaje de la
  cinta (15.459).
- Goldens 44 (línea de comandos), 61 (cinta sólo con ratón), 67/68 (nada tapa), 86
  (reconocimiento).
- Sondas propias con `tsx` sobre `ribbon.ts`, `engine/index.ts` y `alias-table.ts` para
  contar botones por panel, comandos del registro y alias sin resolver. No modifiqué
  nada del producto.

---

## 0. Veredicto

> **El teclado de AutoCAD ya está aquí y funciona: escribo `TR`, `O`, `DLI`, `'Z`, Espacio
> repite, y no tengo que pulsar ninguna caja para teclear. La CINTA, en cambio, no es una
> cinta: es un cajón de 159 botones en una tira que se desplaza a lo ancho sin barra de
> desplazamiento, sin desplegables, sin galerías y —lo que más duele— sin una sola pestaña
> contextual. Y `PR` ⏎, el comando que más veces tecleo al día, me contesta con un aviso
> en rojo.**

**Nota: 5,5 / 10** contra AutoCAD completo en esta dimensión.

El desglose honesto de esa nota:

- **La línea de comandos y los alias: 8,5/10.** Los 209 alias de la tabla resuelven,
  TODOS, medido. Los transparentes con `'` funcionan. La cascada de Escape es la de
  AutoCAD. Esto es mejor de lo que esperaba y mejor que cualquier CAD de navegador que
  haya probado. Le falta el autocompletado, que es una de las tres cosas que más veces
  toco al día.
- **La entrada dinámica y la barra de estado: 7/10.** El cursor vivo con distancia/ángulo
  y Tab es de verdad; las teclas F3/F7/F8/F9/F10/F11/F12 están todas; falta el botón de
  rejilla y forzado en la barra, F2 y la mitad de los conmutadores de AutoCAD 2027.
- **La cinta: 3,5/10.** Cubre el registro entero (eso está gateado y es real) pero no
  hace ninguna de las cosas por las que una cinta existe: agrupar, esconder lo que no
  toca ahora, y aparecer cuando designo algo.
- **Espacios de trabajo, paletas de herramientas y personalización: 2/10.** `WORKSPACE`,
  `WSSAVE`, `CUI` no existen (el propio informe del 3 de septiembre ya lo tiene en la
  cola, punto 3). La paleta de herramientas es un destino declarado que nadie monta.
- **Menús de botón derecho: 2,5/10.** Cinco entradas fijas, iguales tenga designado un
  sombreado, una cota o nada.

Y una observación de gobierno antes de seguir. La rúbrica da **14/14 a `recognition`** y
**12/12 a `command-line`**, las dos al tope. Comprobé los criterios uno a uno y **ninguno
miente**: la cinta abre en Inicio con el orden correcto, LINE es el primer botón, existe
Paramétrico, teclear en el lienzo escribe en la línea, ninguna letra suelta roba un alias,
arrastrar designa, nada tapa el lienzo, el eje CENTER se ve. Todo eso es cierto y está
medido. Lo que pasa es que **esos ocho criterios describen los primeros cinco minutos, no
la jornada**. Ninguna fila de la rúbrica de hoy puede bajar de nota porque no exista una
pestaña contextual, porque `PR` conteste con un error, porque la cuarta lámina no tenga
pestaña o porque no haya `WSSAVE`. Mi recomendación —no toco la rúbrica, sólo lo señalo—
es que `recognition` (o una fila hermana, «La cinta en la jornada») lleve criterios de
segundo día: pestaña contextual, desplegable de panel, menú contextual por objeto y
espacio de trabajo guardado. Hoy la superficie que más se toca es la que menos se puntúa.

---

## 1. Lo que ya está construido y es bueno

No paso por encima de esto, porque es bastante más de lo que esperaba.

### 1.1 Un solo registro, y la cinta es una FUNCIÓN sobre él

`apps/web/src/lib/cad/ribbon.ts` no es una lista de botones escrita a mano: clasifica los
294 descriptores de `CAD_COMMAND_DESCRIPTORS` por patrones de nombre anclados y cae al
`kind` cuando ninguno reclama. Lo verifiqué con una sonda:

```
294 descriptores
fallbacks de panel: []      ← ningún comando cae en la red de seguridad
huecos de cobertura: []     ← ningún comando se queda sin botón
```

Eso significa que un comando nuevo aparece en su pestaña sin que nadie edite cuatro
ficheros. Y lo vigila `scripts/cad/check-ribbon-coverage.mjs` en CI, con la MISMA función
que exporta el módulo (`cadRibbonCoverageGaps`), no una reimplementación paralela. Es la
arquitectura correcta y lo digo sin reservas: en AutoCAD la cinta y el CUI se
desincronizan del comando real cada versión.

### 1.2 Los 209 alias de acad.pgp resuelven. Todos.

El `gap` de la fila `command-line` de la rúbrica dice: *«Quedan exactamente 2 de 129 alias
de acad.pgp sin resolver: BE→BEDIT y BLE→BLEND»*. **Eso ya no es verdad y la rúbrica está
atrasada.** Sonda sobre el árbol de hoy:

```
alias en tabla: 209
alias sin resolver: []
BE  → BEDIT     BLE → BLEND    PR → PROPERTIES   TR → TRIM
L   → LINE      M   → MOVE     CO → COPY         DLI → DIMLINEAR
```

Esto es el argumento de venta entero. Veinte años de memoria muscular sirven aquí. Si
alguien tiene que actualizar una cifra en la rúbrica, que sea ésta, y hacia arriba.

### 1.3 La línea de comandos se comporta como una línea de comandos

`CadCommandLine.tsx` hace las cinco cosas que la memoria muscular exige y que la mayoría
de los clones se saltan:

- **Enter/Espacio con la caja vacía repite el último comando** (líneas 110-119). Es el
  gesto más usado del oficio.
- **Esc en cascada**: con texto escrito lo borra; sin texto cancela el comando y **devuelve
  el foco al lienzo** (líneas 82-96), para que Supr y Ctrl+Z vuelvan a ser del dibujo.
- **Flechas arriba/abajo recuperan lo tecleado**, y sólo lo tecleado por el usuario, no el
  eco del programa (`typed`, línea 68).
- **Las opciones del prompt son PULSABLES** (`cad-command-keyword-*`), no texto muerto.
- **Comandos transparentes con `'`**: `'ZOOM` dentro de un LINE encuadra y devuelve el
  prompt (`command-engine.ts:153-200`, `command-engine-host.ts:559-561`). Con pila de
  suspendidos y tope de anidamiento. Esto es de verdad.

Y lo que cierra el círculo: **teclear con el lienzo enfocado escribe en la caja sin
pulsarla** (`editor-keyboard.ts:79-92`, `isCommandLineCharacter`), con el detalle medido
de que `key.length === 1` deja fuera Enter, F3, Dead y Process, y que Espacio no es un
carácter sino un Intro. Eso es exactamente el comportamiento de AutoCAD y está escrito con
la razón al lado.

### 1.4 La entrada dinámica sigue al cursor de verdad, sin pasar por React

`components/cad/viewport/live-cursor.ts` dibuja el marcador de captura OSNAP, las cajas de
distancia y ángulo y el menú de palabras clave **en DOM imperativo**, escribiendo
`style.transform` sobre nodos ya creados. La cabecera explica por qué (un `setState` por
`pointermove` sería un render del JSX de 6.000 líneas del editor por muestra del ratón), y
tiene dos detalles que sólo se le ocurren a alguien que ha mirado el problema:

- Escribir en una caja la **congela** para que el cursor deje de sobrescribirla (`frozen`,
  líneas 100-106). Sin eso teclear `1500` es imposible.
- Las cajas son `pointer-events-none` a propósito, con la medición del golden 46 al lado:
  el cuadro se colocaba bajo el siguiente salto del ratón y el lienzo dejaba de ver
  `pointermove`. Se teclea en ellas por Tab.
- El desplazamiento de la insignia cambia con **dedo** (arriba y a 40 px, fuera de la
  huella de la mano) frente a **ratón** (14 px abajo a la derecha).

Eso es oficio. En AutoCAD la entrada dinámica en una tableta es exactamente igual de mala
que el primer día.

### 1.5 Las teclas de función están TODAS, y el gap de la rúbrica está atrasado

El `gap` de `draw-2d` dice: *«faltan los conmutadores estándar F7 (rejilla), F9 (forzado) y
F12 (entrada dinámica)»*. **Ya no faltan.** `lib/cad/keyboard-shortcuts.ts:176-198`
declara `grid_toggle` en `f7`, `grid_snap_toggle` en `f9` y `dynamic_input_toggle` en
`f12`, y `editor-keyboard.ts:271-285` los despacha. Junto con F3 (OSNAP), F8 (ORTHO), F10
(POLAR) y F11 (OTRACK) tengo las siete que pulso sin mirar.

También están **Ctrl+1** (propiedades), **Ctrl+2** (ADCENTER), **Ctrl+3** (paletas),
**Ctrl+8** (estilos) y **Ctrl+9** (DSETTINGS) — `editor-keyboard.ts:238-253` — con la
elegancia de que Ctrl+2 y Ctrl+3 **despachan la orden por su nombre**, así que el atajo y
teclearla son la misma acción, no dos caminos.

### 1.6 La letra suelta es de la línea de comandos, y eso está gateado

`keyboard-shortcuts.ts:47-68` documenta la medición del 2026-09-02: trece letras sueltas
del registro robaban alias de una letra (M=MOVE, E=ERASE, O=OFFSET, F=FILLET…) y el lienzo
se las quedaba, así que teclear `M` abría la medición. Se retiraron, conservando el `id`
para que sigan siendo reasignables, y `keyboard-alias-collisions.spec.ts` vigila la
intersección. Es exactamente la decisión correcta y la razón está escrita.

### 1.7 El botón derecho es configurable, como `SHORTCUTMENU`

`cad-workspace.ts:11` declara `CadRightClickAction = 'context' | 'enter' | 'repeat'` y
`Layout3DEditor.tsx:13906-13917` lo aplica. Un dibujante de AutoCAD que tiene el botón
derecho puesto en «Intro» lo encuentra aquí. Poca gente se acuerda de esto; aquí está.

### 1.8 Un icono por comando, y la paleta Ctrl+K

`components/cad/ribbon/command-icons.ts` (552 líneas) da un dibujo distinto por comando,
con su gate (`command-icons.spec.ts`), y las trece restricciones geométricas —el caso que
de verdad importaba— no comparten. Y `lib/cad/command-palette.ts` indexa la UNIÓN del
registro del motor, las frases heredadas, las herramientas y los símbolos, con los alias
como palabras clave: quien busca «TR» encuentra TRIM.

**Ctrl+K es, sin más, mejor que AutoCAD.** AutoCAD no tiene un buscador de comandos por
descripción; tiene `HELP`. Esto lo digo como elogio y volveré a ello en la apuesta.

---

## 2. Los huecos, por lo que más duele

### HUECO 1 — No hay ni una sola pestaña contextual

**AutoCAD.** Designo un sombreado y aparece la pestaña **Editor de sombreado** con el
patrón, la escala, el ángulo, el origen y «Asociativo», y desaparece al deseleccionar.
Designo una referencia de bloque y aparece **Referencia de bloque** con Editar, Editar
atributos, Contar. Entro en una lámina y la cinta cambia. Selecciono una polilínea y sale
**Polilínea** con Editar, Cerrar, Adaptar spline. Esto es *la* función de una cinta: la
cinta de AutoCAD no está para tener todos los botones, está para **enseñar los seis que
importan ahora mismo y esconder los otros 1.500**.

**Valle hoy.** `lib/cad/ribbon.ts:52-69` declara siete pestañas en un array constante y
`CAD_RIBBON_DATA` se calcula **una vez al cargar el módulo** (línea 296). `CadRibbon.tsx`
recibe exactamente tres props —`dispatch`, `readOnly`, `disabledCommands`— y en su único
montaje (`Layout3DEditor.tsx:15459-15461`) sólo se le pasan las dos primeras. **La cinta
no sabe qué hay designado.** No puede saberlo: no llega hasta ella.

**Por qué me duele.** Recibo el DXF del estructurista un lunes. Lo primero que hago es
pinchar un sombreado del muro de contención para ver con qué patrón y a qué escala está,
porque el mío es otro. En AutoCAD: un clic, la pestaña aparece, leo, cambio la escala,
sigo. Aquí: pincho, no pasa nada en la cinta, y tengo que acordarme de que existe
`HATCHEDIT`… que no está en el registro (`H` y `BH` sí, `HATCHEDIT` no aparece en los 294).
Termino abriendo la paleta de sombreado por el icono de la barra superior, que está en un
sitio que no es donde mi mano lo busca.

**Severidad: bloqueante** de la sensación «se maneja como AutoCAD». **Esfuerzo: varios días.**

**Cómo se construye.**
1. En `ribbon.ts`, añadir `CAD_RIBBON_CONTEXT_TABS: readonly CadRibbonContextTab[]`, donde
   `CadRibbonContextTab = { id, label, match(kinds: ReadonlySet<CadEntityKind>): boolean,
   panels: readonly { label: string; commands: readonly string[] }[] }`. Los `commands`
   son NOMBRES del registro y se resuelven contra `byName` al construir, con el mismo
   `throw` que ya usa `CAD_RIBBON_INICIO_ESPEJOS` para que un cadáver no se esconda.
2. Cinco de arranque, que cubren el 90 % de mis clics: `hatch` (HATCH, GRADIENT, BOUNDARY,
   SETBYLAYER, DRAWORDER), `blockref` (BEDIT, ATTEDIT, ATTSYNC, BURST, XPLODE, ADDSELECTED),
   `dimension` (DIMEDIT, DIMSTYLE, DIMTOLERANCE, DIMCONTINUE, DIMBASELINE), `pline`
   (PEDIT, JOIN, OFFSET, EXPLODE, FLATTEN), `xref` (XCLIP, XBIND, XREF, REFEDIT).
3. `CadRibbon` recibe `selectionKinds: ReadonlySet<string>` desde el monolito (ya existe
   `nativeSelectionIds` y `selection-universe.ts` sabe resolver los tipos). Cuando una
   contextual case, se antepone a `tabs`, se activa sola y se recuerda la pestaña previa
   para volver a ella al deseleccionar.
4. Etiqueta con el acento de marca, como AutoCAD las pinta en verde/azul.

**Cómo se verifica.** Un golden nuevo en `e2e/golden/` hermano del 61: sembrar un
documento con un HATCH y una INSERT; pinchar el sombreado y afirmar que existe
`cad-ribbon-tab-ctx-hatch` y que está activa; pinchar el bloque y afirmar que la de
sombreado desapareció y salió `cad-ribbon-tab-ctx-blockref`; Esc y afirmar que vuelve
`inicio`. Más una spec de Node sobre `ribbon.ts` que exija que todo nombre citado en una
pestaña contextual exista en el registro (mismo contrato que los espejos).

---

### HUECO 2 — La línea de comandos no sugiere nada mientras escribo

**AutoCAD.** Desde 2014, escribo `REC` y baja una lista con RECTANG, RECTANGLE, RECOVER,
RECOVERALL, cada uno con su icono, y con las variables de sistema aparte. `AUTOCOMPLETEMODE`
controla si añade, si lista, si muestra iconos y si incluye variables. Escribo tres letras
de un comando que uso una vez al mes y lo encuentro sin acordarme del nombre entero.

**Valle hoy.** `CadCommandLine.tsx` es un `<input>` con `autoComplete="off"` (línea 210) y
**cero** sugerencias. El buscador existe —`searchCadPalette` en `lib/cad/command-palette.ts:88`,
con puntuación 3/2/1 por prefijo, id y heno— pero está cableado **sólo a Ctrl+K**
(`Layout3DEditor.tsx:13976`, `paletteResults`). El motor incluso publica
`knownCommands: registry.names()` al analizador de tokens (`command-engine.ts:280`) y no
lo usa nadie para sugerir.

**Por qué me duele.** No es el comando que uso cien veces; es el que uso una vez al mes.
`OVERKILL`. `TXT2MTXT`. `LAYMRG`. Aquí sé que existen porque leí el manifiesto; un usuario
normal no. Y la alternativa —Ctrl+K— rompe el flujo: es una ventana modal encima del
dibujo, no una lista debajo de la caja donde ya tengo la mano.

**Severidad: alta.** **Esfuerzo: un día.**

**Cómo se construye.**
1. `CadCommandLine` gana una prop `suggest?: (query: string) => readonly CadCommandSuggestion[]`
   —`{ name, alias, summary }`— para que el componente siga siendo presentacional y
   probable sin motor, que es su contrato actual.
2. El anfitrión (`use-command-engine.ts` / `studio-engine-bridges.ts`) la sirve con
   `searchCadPalette` filtrado a `kind === "engine"` y `slice(0, 8)`. Ya existe todo.
3. La lista se dibuja **encima** de la caja (el muelle vive abajo), con el mismo
   `pointer-events-auto` que ya usan las palabras clave. Flecha abajo/arriba recorre, Tab
   completa el nombre, Intro ejecuta, Esc cierra la lista sin cancelar el comando.
4. Sólo con la caja vacía de comando activo: durante un prompt, la caja pide coordenadas y
   una lista de comandos ahí sería ruido. Y respetando la regla de la casa: la sugerencia
   NO se muestra si `prompt !== null`.
5. Variable `AUTOCOMPLETEMODE` en `system-variables.ts` para poder apagarla, que es lo que
   AutoCAD ofrece y algunos dibujantes usan.

**Cómo se verifica.** Ampliar el golden 44: teclear `REC` sin Intro y afirmar que aparece
`cad-command-suggestion-RECTANG`; pulsar Tab y afirmar que la caja dice `RECTANG`; Intro y
afirmar que el prompt pide la primera esquina. Más spec de Node sobre el orden de la lista
(prefijo antes que subcadena) y sobre que con prompt activo la lista está vacía.

---

### HUECO 3 — `PR` ⏎, `OP` ⏎, `TP` ⏎ y `UC` ⏎ contestan con un aviso en rojo

**AutoCAD.** `PR` abre Propiedades. Es, con `L` y `M`, uno de los tres comandos que más
tecleo al día.

**Valle hoy.** Comparé los destinos declarados con los registrados:

```
declarados (command-types.ts:406-470):  action-recorder block-editor draft-settings
  dxf-file filter geo-file image-file layer-manager layer-states linetype-file
  options osnap plot-style-file properties quick-select script-file styles
  tool-palettes ucs-manager
registrados (registerCadUiHandler en todo el árbol): action-recorder block-editor
  draft-settings dxf-file geo-file image-file layer-manager linetype-file osnap
  pdf-file plot-style-file script-file styles
```

**Sin manejador: `properties`, `options`, `tool-palettes`, `ucs-manager`** (y `filter`,
`layer-states`, `quick-select`, que nadie pide hoy). Y el camino está claro:
`settings-palettes.ts:538-547` declara `PROPERTIES` con `target: "properties"`;
`command-engine-host.ts:769-773` hace `if (!this.bridge.ui?.(effect.request))
this.log(effect.request.unavailable, "error")`. Resultado literal en la línea, en rojo:

> *La paleta de propiedades no está montada en este espacio de trabajo. Use LIST para ver
> las propiedades de lo designado.*

**Y la paleta SÍ está montada.** `Layout3DEditor.tsx:2122` define `revealPropertiesPalette`
y `editor-keyboard.ts` la abre con **Ctrl+1** (caso `reveal-properties`, línea 13489). Es
decir: el atajo funciona y el comando miente sobre su propio límite. Lo mismo con
`OPTIONS`/`OP` (el dock de workspace está montado, `Layout3DEditor.tsx:14648`) y con
`UCSMAN`/`UC`.

**Esto ya se detectó y se arregló una vez, para el gestor de capas.** El comentario de
`Layout3DEditor.tsx:12430-12437` lo dice con todas las letras: *«Antes nadie se apuntaba a
"layer-manager": el propio comando ya avisaba con honestidad, pero el panel SÍ está montado
aquí, así que el aviso era un límite falso, no uno real»*. Son cuatro líneas por destino y
quedaron cuatro sin hacer.

**Por qué me duele.** Designo un muro, tecleo `PR`, y el programa me dice que no puede. Ese
único renglón rojo me enseña, el primer día, que el producto «no está terminado» — y es
mentira, porque la paleta está ahí y Ctrl+1 la abre. Es el peor tipo de hueco: barato de
cerrar y caro de sufrir.

**Severidad: bloqueante.** **Esfuerzo: horas.**

**Cómo se construye.** Un `useEffect` por destino, copiado del de `layer-manager`:

```ts
useEffect(() => registerCadUiHandler("properties", () => {
  revealPropertiesPalette();
  return true;
}), []);
useEffect(() => registerCadUiHandler("options", () => {
  closeProfessionalDocks(); setShowWorkspaceDock(true); return true;
}), []);
useEffect(() => registerCadUiHandler("ucs-manager", () => { /* abrir el panel SCU */ }), []);
```

Para `tool-palettes` hace falta antes el HUECO 5 (no hay paleta que abrir); mientras tanto
su aviso es honesto y debe quedarse.

**Cómo se verifica.** Golden: teclear `PR` ⏎ con un muro designado y afirmar que
`cad-entity-properties` es visible y que el log **no** contiene la palabra «montada».
Y una spec de Node que compare `cadUiHandlerTargets()` con la lista de destinos que algún
comando usa, exigiendo que la diferencia esté declarada con razón escrita —el mismo patrón
que `CAD_RIBBON_UNEXPOSED`— en vez de ser un hueco silencioso.

---

### HUECO 4 — La pestaña Inicio tiene 159 botones en UNA tira de ~10.500 px con la barra de desplazamiento oculta

**AutoCAD.** El panel Modificar de Inicio enseña ocho botones grandes y un desplegable con
los otros doce. Cuando la ventana estrecha, un panel entero **colapsa a un icono** con su
menú; nunca se desplaza a lo ancho. Y el panel Dibujo tiene botones partidos: Círculo
despliega seis variantes, Matriz tres, Arco once.

**Valle hoy.** Sonda sobre `CAD_RIBBON_DATA`:

```
Inicio — 159 botones, 13 paneles
   19 Dibujo · 30 Modificar · 6 Anotación · 14 Capas · 16 Bloque · 10 Propiedades
    2 Grupos · 8 Utilidades · 5 Portapapeles · 3 Sombreado · 6 Arquitectura
   17 Instalaciones · 23 Sólidos
Insertar 29 · Anotar 35 · Paramétrico 21 · Vista 20 · Salida 14 · Administrar 22
```

Cada botón es `w-16` (64 px) más `gap-0.5` (`CadRibbonButton.tsx:44`), cada panel añade
`px-2` (`CadRibbonPanel.tsx:22`). El contenedor de paneles es
`flex items-stretch overflow-x-auto` (`CadRibbon.tsx:85`) **sin altura acotada**, así que
el `flex-wrap` del panel nunca envuelve: cada panel es UNA fila. Cuenta: 159 × 66 + 13 × 18
≈ **10.500 px** de tira en una ventana de 1.280 px. Son ocho pantallas y media a la
derecha para llegar a «Sólidos».

Y el desplazamiento **no se ve**: la misma línea 86 pone
`[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`. No hay
barra, no hay flechas de desplazamiento, no hay gradiente de borde. Nada le dice al usuario
que a la derecha hay 130 botones más.

**Por qué me duele.** El lunes por la mañana busco `PRESSPULL`. Sé que está en la cinta
porque el producto promete que todos los comandos están. Miro «Inicio», veo Dibujo y
Modificar, no lo encuentro, y no tengo ninguna pista de que hay que arrastrar la tira. En
AutoCAD, si un panel no cabe, lo veo colapsado y lo abro.

**Severidad: alta.** **Esfuerzo: varios días.**

**Cómo se construye.**
1. **Desplegables de panel.** `ribbon-order.ts` gana
   `CAD_RIBBON_PANEL_PRIMARY: Record<string, readonly string[]>` — los N nombres que se ven
   siempre. El resto va a un menú del propio panel, abierto por el rótulo del panel (que
   hoy es un `<div>` muerto, `CadRibbonPanel.tsx:31-33`, y que en AutoCAD es precisamente el
   tirador). Lo no declarado sigue apareciendo: en el menú, no perdido.
2. **Botones partidos** para las familias que en AutoCAD lo son: CIRCLE, ARC, ARRAY, DIM*,
   los cuatro pegados del portapapeles. Una tabla `CAD_RIBBON_SPLIT: Record<string,
   readonly string[]>` en `ribbon-order.ts`; el botón principal despacha el primero y la
   flechita abre el resto. Cero cambios en el registro.
3. **Colapso responsivo.** Con `ResizeObserver` sobre la fila, cuando la suma de anchos
   supere el disponible, colapsar paneles **de derecha a izquierda** al icono del panel
   (`CAD_RIBBON_PANEL_ICONS` ya existe, `ribbon-icons.ts`) con su menú. Es lo que hace
   AutoCAD y lo que hace que la cinta nunca se desplace.
4. Mientras 1-3 no estén: **enseñar la barra de desplazamiento**, o al menos dos flechas.
   Media hora, y quita el peor de los daños.
5. Y una revisión de reparto: «Sólidos» (23) e «Instalaciones» (17) no son de Inicio en
   ningún AutoCAD. `Sólidos` merece su propia pestaña (AutoCAD tiene «Sólido» en el espacio
   3D) e `Instalaciones` una pestaña de toolset. Eso solo baja Inicio de 159 a 119.

**Cómo se verifica.** Spec de Node sobre `CAD_RIBBON_DATA`: ningún panel de una pestaña
puede exponer más de N botones primarios; el resto tiene que estar en el desplegable, y la
unión sigue siendo el registro entero (la cobertura no se relaja: se reparte). Golden: a
1.280×720, medir el `scrollWidth` de `cad-ribbon-panels-inicio` y exigir que no supere el
`clientWidth` × 1,0 — es decir, que la cinta **no se desplace**. Ese golden es el que hoy
fallaría con un factor de 8.

---

### HUECO 5 — La paleta de herramientas no existe: `TOOLPALETTES` (Ctrl+3) abre una disculpa

**AutoCAD.** Ctrl+3 abre las paletas de herramientas: mis bloques del despacho, mis
sombreados con su escala ya puesta, mis comandos con sus opciones precargadas, todo
arrastrable al dibujo. Es donde vive el estándar del despacho.

**Valle hoy.** El destino `tool-palettes` está declarado (`command-types.ts:414`) y
**nadie lo registra**. `settings-palettes.ts:583-590` responde:

> *La paleta de herramientas no está montada en este espacio de trabajo. Use -TOOLPALETTES
> para ver qué contiene cada una.*

Y `-TOOLPALETTES` (línea 286) sólo LISTA los nombres de las herramientas de una paleta en
texto (`toolPaletteCliCommand.step`). El catálogo existe y persiste en `localStorage`
(`session-catalogs.ts:100-105`, `loadCadToolPalettes`/`saveCadToolPalettes`), o sea que
**el modelo de datos ya está construido y no tiene interfaz**. Es exactamente la regla 1
de la campaña de cimientos: un subsistema sin consumidor fuera de sí mismo.

Lo que sí existe es `components/cad/editor/CadToolPalette.tsx`, que **no es esto**: es una
barra flotante fija de 17 herramientas cableadas en `lib/cad/toolbar.ts`, sin relación con
el catálogo del usuario.

**Por qué me duele.** El despacho tiene 40 bloques propios y 6 sombreados con la escala del
estándar. Sin paletas, cada inserción es `I` ⏎ + acordarse del nombre. Es la diferencia
entre un CAD que uso y un CAD que pruebo.

**Severidad: alta.** **Esfuerzo: varios días.**

**Cómo se construye.**
1. `components/cad/palettes/CadToolPalettesDock.tsx`, columna de pestañas a la izquierda
   (una por paleta) y rejilla de fichas, montado en la columna derecha del estudio junto a
   las demás paletas, **fuera del monolito** (respeta el trinquete).
2. `registerCadUiHandler("tool-palettes", …)` — cierra además el HUECO 3 para Ctrl+3.
3. Cada ficha despacha `cadToolCommandLine(tool)` por `commandEngineRef.invoke`, que es la
   función que ya existe y que `-TOOLPALETTES` usa para imprimir. Cero semántica nueva.
4. Arrastrar una ficha al lienzo = despachar el comando y meter el punto de soltada como
   primer `pickPoint`. El enrutador ya sabe hacerlo.
5. «Añadir a paleta» desde el menú contextual de un bloque designado (ver HUECO 8), que es
   como se llenan de verdad.

**Cómo se verifica.** Golden: crear una paleta con `-TOOLPALETTES`, pulsar Ctrl+3, afirmar
que el dock es visible con la ficha, pulsarla y afirmar que el documento del servidor
recibió la entidad. Y **corregir la aserción del golden 86**, que hoy miente por debilidad
(ver §3, defecto D1).

---

### HUECO 6 — El menú del botón derecho es el mismo tenga designado un muro, una cota o nada

**AutoCAD.** El botón derecho es el segundo teclado. Con una polilínea designada me da:
Repetir, **Entrada reciente** (los últimos seis comandos), Portapapeles ▸, **Aislar** ▸,
Borrar, Mover, Copiar selección, Escala, Girar, Orden de objetos ▸, Grupo ▸, **Añadir
seleccionado**, **Seleccionar similar**, Anular selección, Propiedades rápidas,
Propiedades, y **Polilínea ▸** con Editar/Cerrar/Adaptar. Con un sombreado, un menú
distinto. Con nada designado, el corto.

**Valle hoy.** `Layout3DEditor.tsx:15877-15943`. Cinco entradas fijas, en todos los casos:

```
Repetir último comando · Enter / terminar · Seleccionar todo ·
Eliminar selección · Mostrar propiedades
```

No mira `nativeSelectionIds` para decidir el menú (sólo para deshabilitar «Eliminar»). No
hay entrada reciente, no hay portapapeles, no hay aislar, no hay
`SELECTSIMILAR`/`ADDSELECTED` **aunque los dos comandos existan en el registro**.

**Por qué me duele.** Trabajando el plano ajeno, mi gesto de las 9:05 es: pincho un muro,
botón derecho, «Seleccionar similar», y ya tengo los 300 muros para cambiarles la capa. Aquí
tengo que soltar el ratón, ir al teclado, escribir `SELECTSIMILAR`. Cada vez.

**Severidad: alta.** **Esfuerzo: un día.**

**Cómo se construye.**
1. Sacar el menú del monolito a `components/cad/studio/CadContextMenu.tsx` (el monolito
   sólo puede encoger; esto es un candidato de manual).
2. `lib/cad/context-menu.ts` **puro**: `cadContextMenuItems(ctx: { selectionKinds, hasSelection,
   commandActive, recentCommands }): readonly CadMenuItem[]`, donde cada `CadMenuItem` es
   `{ label, command }` o `{ label, submenu }`. Probable en Node, rama a rama, como
   `editor-keyboard.ts`. Ése es el patrón que la casa ya usa.
3. Secciones: comunes (Repetir, **Entrada reciente** con los últimos seis de
   `command-engine-host`), sobre selección (ERASE, MOVE, COPY, ROTATE, SCALE, COPYCLIP,
   CUTCLIP, DRAWORDER, SELECTSIMILAR, ADDSELECTED, PROPERTIES), y **por tipo**: `hatch` →
   HATCH; `insert` → BEDIT/ATTEDIT/BURST; `dimension` → DIMEDIT/DIMSTYLE; `pline` →
   PEDIT/JOIN.
4. `commandActive` sigue mandando: con un comando abierto el botón derecho ofrece las
   palabras clave del paso, que es lo que ya hace bien `live-cursor.ts` y no hay que tocar.

**Cómo se verifica.** Specs de Node sobre `cadContextMenuItems` (una por tipo, más el caso
vacío y el de comando activo). Golden: dibujar dos líneas en la misma capa, pinchar una,
botón derecho, pulsar «Seleccionar similar» y afirmar `cad-selection-status-count` = 2.

---

### HUECO 7 — Sólo hay pestaña para las tres primeras láminas, están arriba, y dicen «Model»

**AutoCAD.** Las pestañas Modelo/Presentación1/Presentación2… viven **abajo a la
izquierda**, todas, con desplazamiento cuando no caben, con botón derecho (Nueva, Del
conjunto, Renombrar, Mover o copiar, Configurar página, Publicar) y con **Ctrl+RePág /
Ctrl+AvPág** para pasar de una a otra.

**Valle hoy.** `Layout3DEditor.tsx:14764-14795`, dentro de la **barra superior**:

```tsx
{orderedPaperSpaces.slice(0, 3).map((space) => ( … ))}
```

Tres. Un proyecto de vivienda unifamiliar tiene doce láminas; uno de nave, cuarenta. De la
cuarta en adelante **no hay pestaña**: hay que abrir el panel «Layout · N». Además:

- El rótulo dice **`Model`**, en inglés, en un producto cuya regla de casa es «es-MX en
  copy nuevo» (`AGENTS.md`, sección de diseño).
- Están **arriba**, junto al botón de cerrar y el 2D/3D. Mi mano las busca abajo.
- No hay botón derecho sobre la pestaña.
- No hay `Ctrl+PageUp` / `Ctrl+PageDown`: busqué `PageUp`/`PageDown` en todo
  `components/cad` y `lib/cad` y no aparecen.

**Por qué me duele.** El jueves entrego. Tengo doce láminas y voy saltando de la de plantas
a la de detalles veinte veces por hora. Aquí sólo tres tienen pestaña y el salto de la 9 a
la 2 es: abrir panel, buscar, pinchar, cerrar panel.

**Severidad: alta.** **Esfuerzo: un día.**

**Cómo se construye.**
1. `components/cad/studio/CadLayoutTabs.tsx`: franja propia **entre el lienzo y la barra de
   estado** (`cad-shell` es `flex flex-col`; un hijo nuevo ahí sólo empuja, que es
   exactamente lo que dice el comentario de `CadRibbon.tsx:11-14`). Alto 22 px.
2. **Todas** las láminas, con `overflow-x-auto` y barra visible, más un `+` al final.
3. `Modelo` en español. Nuevo `data-testid` para la franja; **`cad-space-tabs` se conserva
   tal cual** donde está mientras las dos convivan (no se toca un identificador que un
   golden lee).
4. Menú contextual sobre pestaña con LAYOUT/PAGESETUP/PLOT/PUBLISH, que ya son comandos.
5. `Ctrl+PageUp`/`Ctrl+PageDown` en `editor-keyboard.ts` como acciones nuevas
   `{ type: "layout-prev" | "layout-next" }`, con su spec de Node.
6. Presupuesto vertical: la franja de 22 px sale de la barra superior, que con las láminas
   fuera pierde el grupo `cad-space-tabs`. Neto ≈ 0. El golden 19 (lienzo ≥ 520 px a 720 de
   alto) no se relaja: se respeta.

**Cómo se verifica.** Golden: sembrar cinco láminas, afirmar cinco pestañas con su nombre,
pulsar la quinta y afirmar que la vista es la de esa lámina; `Ctrl+PageDown` desde la
primera y afirmar que la activa es la segunda. Más el golden 19 corriendo verde sin tocar
su umbral.

---

### HUECO 8 — No hay espacios de trabajo: ni `WORKSPACE`, ni `WSSAVE`, ni `CUI`

**AutoCAD.** Un espacio de trabajo es **qué pestañas, qué paneles, qué paletas y qué barras
se ven**. Lo guardo con `WSSAVE`, lo cambio desde la barra de estado, viaja con mi perfil.
Y `CUI` me deja atar cualquier comando a cualquier tecla y meter mi propio panel en la
cinta.

**Valle hoy.** Ninguno de los tres está en los 294 comandos. Lo comprobé nombre a nombre:
`WORKSPACE`, `WSSAVE`, `WSCURRENT`, `WSSETTINGS`, `CUI`, `CUILOAD`, `MENU` → cero.

Lo que hay es `lib/cad/cad-workspace.ts`: cuatro perfiles (`drafting`, `review`,
`presentation`, `focus`) que sólo mueven cinco banderas —`leftDock`, `rightDock`,
`commandDock`, `minimap`, `toolbarDensity`— y **no tocan la cinta**. Con el perfil
`presentation` sigo teniendo los 159 botones de Inicio delante.

Los atajos sí son reasignables, pero: (a) sólo **12 de los 30** ids salen en el dock
(`CadWorkspaceDock.tsx:25-37`, `SHORTCUT_IDS`), y (b) sólo se pueden reasignar **esos ids**,
no un comando cualquiera del registro. No puedo poner `Ctrl+Shift+M` = `MATCHPROP`.

Y todo vive en `localStorage` con clave por inquilino y usuario
(`cadWorkspaceStorageKey`). **Cambio de máquina y pierdo mi configuración.** En un producto
de navegador eso es especialmente doloroso, porque el navegador es justamente la promesa de
«entra desde cualquier sitio».

El informe del 3 de septiembre ya lo tiene en la cola («3. CUI/WSSAVE, la personalización
de la cinta y del espacio de trabajo»), así que esto no es un descubrimiento: es una
confirmación con el detalle de qué falta exactamente.

**Severidad: media** para el primer día, **alta** para el mes tres. **Esfuerzo: semanas.**

**Cómo se construye (por partes, cobrando pronto).**
1. **`WSCURRENT`, `WORKSPACE`, `WSSAVE` sobre lo que YA existe** (horas): tres comandos que
   leen y escriben `CadWorkspacePreferences`. `WSSAVE <nombre>` guarda una copia con
   nombre; `WORKSPACE <nombre>` la aplica. Cero formato nuevo.
2. **La cinta entra en el espacio de trabajo** (días): `CadWorkspacePreferences` gana
   `ribbonTabs?: readonly CadRibbonTabId[]` y `ribbonCollapsed?: boolean`. `CadRibbon`
   filtra `CAD_RIBBON_DATA` por esa lista. Un espacio «Anotación» sin Paramétrico ni
   Sólidos, y uno «3D» sin Instalaciones.
3. **Atajo a comando arbitrario** (días): `shortcutOverrides` gana un segundo mapa
   `commandBindings: Record<string /*binding*/, string /*comando*/>`, resuelto en
   `interpretEditorKeyBeforeEngine` **después** de `matchCadShortcut` y **antes** de la
   fase 0, con la misma guarda de colisión con alias que ya tiene
   `cadShortcutAliasCollision`. Eso es el 80 % de lo que un despacho pide del CUI.
4. **Persistir en el servidor** (días): las preferencias son del usuario y hay identidad
   de primera parte. Un `PUT /v1/cad/workspace` con el mismo objeto normalizado.
   `localStorage` se queda como caché y como respaldo sin conexión.

**Cómo se verifica.** `check:command-integrity` corre los comandos nuevos y exige efecto.
Spec de Node: `WSSAVE` + `WORKSPACE` sobre un objeto de preferencias devuelve el mismo
objeto normalizado. Golden: guardar un espacio con Paramétrico apagado, recargar la página
y afirmar que `cad-ribbon-tab-parametrico` no existe.

---

### HUECO 9 — Hay tres barras de comandos encima del dibujo, y no se hablan entre sí

**AutoCAD.** Una cinta. Debajo, el dibujo. Y una barra de acceso rápido de seis iconos.

**Valle hoy.**

| Franja | Qué es | Dónde |
| --- | --- | --- |
| 1 | Barra superior heredada, ~50 iconos, 48 px | `Layout3DEditor.tsx:14679` |
| 2 | La cinta, 7 pestañas, ~80-116 px | `Layout3DEditor.tsx:15459` |
| 3 | Paleta flotante izquierda, 17 herramientas | `CadToolPalette.tsx`, `absolute top-3 left-3` |
| 4 | Ctrl+K | `command-palette.ts` |
| 5 | La línea de comandos | `CadCommandLine.tsx` |

Las tres primeras **compiten**, y su vocabulario no coincide. La barra superior dice
«Dibujar muros — clic en puntos, Esc termina» donde la cinta dice `LINE`. La paleta
izquierda tiene, en `lib/cad/toolbar.ts` y en `keyboard-shortcuts.ts:9-13`, las acciones
`aisle` («Corridor», *«Preparar un pasillo o una holgura»*), `zone` («Area») y `equipment`
(«Symbols») — vocabulario del producto industrial del que salió este editor, que
`AGENTS.md` prohíbe expresamente reintroducir y que aquí sobrevive **en la superficie que
el usuario ve el primer minuto**. Y las etiquetas de esa tabla están en inglés con
descripciones sin acentos: `"Modo seleccion."`, `"Herramienta de medicion."`, `"Ejecutar
revision de diseno del layout."`.

Hay además una asimetría real de comportamiento, que trato como defecto en §3 (D2): la
paleta izquierda despacha por `enginePointerRouterRef.current?.invoke()`, que **resetea** el
enrutador; la cinta y Ctrl+K despachan por `commandEngineRef.current.invoke()`, que **no**.

**Por qué me duele.** Los primeros cinco minutos no sé cuál de las tres es «la buena». Y
como cada una llama a las cosas por un nombre distinto, no puedo aprender una y deducir las
otras dos.

**Severidad: media** (funciona, pero enseña que hay dos productos superpuestos).
**Esfuerzo: varios días.**

**Cómo se construye.**
1. La barra superior se queda **sólo con el chrome del documento**: cerrar, título, guardar,
   estado, 2D/3D, workspace, ayuda. Todo lo que sea un comando del registro se va a la
   cinta, donde ya está.
2. Los seis primeros iconos pasan a ser una **barra de acceso rápido de verdad** (Nuevo,
   Abrir, Guardar, Deshacer, Rehacer, Trazar) con su desplegable de personalización — el
   QAT de AutoCAD, que hoy no existe como tal.
3. `aisle`, `zone` y `equipment` se retiran de `CAD_TOOLBAR_ACTIONS` y de
   `CadKeyboardShortcutId`, o se renombran a vocabulario de dibujo (`offset` ya existe;
   «Area» es `RECTANG`; «Symbols» es `INSERT`, y de hecho su tecla `i` ya es el alias de
   `INSERT`). **Ojo con `keyboard-shortcuts.ts`**: los ids se persisten en
   `shortcutOverrides`, así que retirarlos exige el lector bidireccional que la casa exige
   para identificadores persistidos, o dejarlos como valores de compatibilidad.
4. Traducir las etiquetas y descripciones de `toolbar.ts`/`keyboard-shortcuts.ts` a es-MX
   con acentos.

**Cómo se verifica.** `npm run check:cad` ya corre
`scripts/cad/check-no-industrial-domain.mjs`; ampliar su vocabulario con `aisle`/`pasillo`
**en la capa de interfaz** lo convierte en un gate. Golden 55 (primeros cinco minutos):
afirmar que la barra superior no expone ningún `data-testid` de comando del registro.

---

### HUECO 10 — F2 no existe: no hay ventana de historial de comandos

**AutoCAD.** F2 abre la ventana de texto con TODO el historial de la sesión. Es donde leo
el resultado de `LIST` sobre veinte objetos, o el informe de `AUDIT`, o lo que `PURGE` me
acaba de decir. `TEXTSCR` y `GRAPHSCR` la abren y la cierran.

**Valle hoy.** El log de la línea de comandos es `max-h-24` (`CadCommandLine.tsx:145`) —
seis renglones— con `overflow-y-auto` y `pointer-events-none` en el propio contenedor
(línea 144), es decir: **no puedo desplazarlo con el ratón**. Y no hay `F2`, `TEXTSCR` ni
`GRAPHSCR` en los 294 comandos ni en `keyboard-shortcuts.ts`.

Cuando `-TOOLPALETTES` imprime una paleta de doce herramientas, o `LIST` una polilínea de
treinta vértices, veo los últimos seis renglones y el resto se pierde.

**Por qué me duele.** `AUDIT` sobre el plano del estructurista me da veinte líneas. Necesito
leerlas todas para saber qué me llegó roto. Aquí veo seis y no puedo subir.

**Severidad: media.** **Esfuerzo: un día.**

**Cómo se construye.** `TEXTSCR`/`GRAPHSCR` como comandos (destino nuevo
`command-history`), F2 como atajo en `keyboard-shortcuts.ts`, y un panel modal
`CadCommandHistory` que lea el mismo array `history` que ya alimenta `CadCommandLine`,
con copiar al portapapeles. El array ya existe; falta la ventana. Y de paso: quitar el
`pointer-events-none` del log cuando el muelle esté enfocado, para poder desplazarlo con
la rueda.

**Cómo se verifica.** Golden: ejecutar `AUDIT`, pulsar F2, afirmar que el panel contiene
más renglones que los seis visibles y que incluye el primero.

---

### HUECO 11 — La barra de estado tiene cuatro de los quince conmutadores, y rejilla/forzado no se pueden pulsar

**AutoCAD 2027.** La barra de estado tiene, de izquierda a derecha: coordenadas, espacio
modelo/papel, rejilla, forzado, entrada dinámica, orto, polar, isoplano, referencia a
objetos, 3D osnap, rastreo, SCU dinámico, grosores de línea, transparencia, **ciclo de
selección**, **aislar objetos**, escala de anotación, visibilidad anotativa, espacio de
trabajo, bloqueo de interfaz, **limpiar pantalla**, y el engranaje que deja elegir cuáles
se ven.

**Valle hoy.** `CadStatusBar.tsx` + `CadDraftStatusBar.tsx`: coordenadas (X e Y, sin Z),
unidad, guardado, conexión con la API, capa activa, **rejilla y forzado como TEXTO**, escala
de anotación, y los cuatro conmutadores pulsables OSNAP/ORTHO/POLAR/OTRACK con su tecla F.

Lo concreto y sangrante:

```tsx
// CadStatusBar.tsx, ~línea 300
<span className="@max-[40rem]:hidden">
  Grilla {layersInfo.gridOn ? "on" : "off"} / Snap {layersInfo.snapOn ? "grid" : "free"}
</span>
```

Es un `<span>`. **F7 y F9 no tienen botón**, aunque sus hermanas F3, F8, F10 y F11 sí. Y
bajo 40 rem (que es lo que mide el lienzo con el panel de bloques abierto) el renglón
**desaparece entero**: no puedo ni siquiera LEER si la rejilla está puesta.

Faltan además: entrada dinámica (F12 existe como tecla y no como botón), grosores de línea
(`LWDISPLAY` existe como variable en `system-variables.ts:130`, sin botón), ciclo de
selección, aislar objetos, espacio de trabajo, limpiar pantalla, y el engranaje de
personalización. Las coordenadas no llevan Z ni respetan `LUNITS`: son siempre
`X 1234.00 · Y 567.00` (`Layout3DEditor.tsx:7099-7101`), aunque el dibujo esté en pies y
pulgadas y el resto del producto sepa formatearlo (`units-imperial.ts`).

Y hay una mezcla de idiomas que en la barra que más se mira duele: `Layer`, `Grilla`,
`Snap grid`, `Release`, `Highlights`, `Clearance`, `Safety`, `Instantáneas`, `API online`.

**Severidad: media.** **Esfuerzo: un día** para lo importante.

**Cómo se construye.** `CadDraftStatusBar` ya tiene el `map` de conmutadores; añadir
`grid` (F7), `gridSnap` (F9), `dyn` (F12) y `lwt` (`LWDISPLAY`) es literalmente cuatro
entradas más en ese array y cuatro callbacks que el editor ya tiene cableados a las teclas.
La visibilidad bajo 40 rem se resuelve por prioridad declarada, no por «los primeros»:
`CAD_STATUS_PRIORITY` con los conmutadores arriba. Y traducir: `Capa`, `Rejilla`, `Forzado`.

**Cómo se verifica.** Golden 52 (ajustes de dibujo) ampliado: pulsar
`cad-draft-status-grid` y afirmar `data-active` cambia y que el estado coincide con el que
F7 deja. Golden 67 (nada tapa un control) ya mide que cada control recibe su clic: los
nuevos entran en esa rejilla sin relajar nada.

---

### HUECO 12 — No hay teclas rápidas de cinta (Alt), ni tiradores de cuadro de diálogo, ni memoria de pestaña

**AutoCAD.** Pulso `Alt` y aparecen letras sobre las pestañas y los paneles; `Alt+H+L` es
línea sin tocar el ratón. Y cada panel con un cuadro asociado tiene la flechita en su
esquina: la de Cotas abre `DIMSTYLE`, la de Texto abre `STYLE`.

**Valle hoy.** No hay `altKey` en ningún fichero de `components/cad/ribbon/`. El rótulo del
panel (`CadRibbonPanel.tsx:31-33`) es un `<div>` sin acción. Y la pestaña activa
(`useState<CadRibbonTabId>("inicio")`) y el estado plegado (`useState(false)`) son estado
local: **cada recarga vuelve a Inicio y despliega la cinta**, aunque yo la trabaje plegada.

**Severidad: baja** (bloqueada por el HUECO 4: sin desplegables, las teclas Alt no tienen a
qué apuntar). **Esfuerzo: un día** una vez hecho el 4.

**Cómo se construye.** Persistir `activeTab`/`collapsed` en `CadWorkspacePreferences`
(HUECO 8) es media hora y quita el peor de los tres. Las teclas Alt: una capa de `keytips`
sobre la cinta, con letras derivadas de `CAD_RIBBON_PANEL_ORDER` (declaradas, no
calculadas, para que no bailen al añadir un panel). Los tiradores: `CAD_RIBBON_PANEL_DIALOG:
Record<string, string>` con el comando que abre cada uno (`Cotas → DIMSTYLE`, `Texto y
tablas → STYLE`, `Capas → LAYER`, `Propiedades → PROPERTIES`), pintado en el rótulo del
panel, que hoy está muerto.

**Cómo se verifica.** Spec de Node: toda letra de `keytips` es única dentro de su nivel, y
todo comando de `CAD_RIBBON_PANEL_DIALOG` existe en el registro. Golden: `Alt`, `H`, `L`
traza una línea sin ratón.

---

### HUECO 13 — No hay `ISOLATEOBJECTS`, `MULTIPLE`, `QUICKPROPERTIES` ni `SELECTIONCYCLING`

Cuatro comandos pequeños que uso a diario y que no están en los 294 (comprobado nombre a
nombre):

- **`ISOLATEOBJECTS`/`HIDEOBJECTS`/`UNISOLATEOBJECTS`**. Aislar *objetos*, no capas. Con el
  plano ajeno, pincho los seis muros que me importan y aíslo; el resto desaparece sin tocar
  ninguna capa del remitente —que es la clave: **no quiero tocar sus capas**. `LAYISO`
  existe y no sirve para esto. Es la función que uso más veces al día después de `PR`.
- **`MULTIPLE`**. `MULTIPLE CIRCLE` repite el comando hasta Esc. Para meter veinte símbolos.
- **`QUICKPROPERTIES` / `QPMODE`**. El cuadrito flotante junto a la selección con capa,
  color y las dos propiedades del tipo. Es lo que evita abrir la paleta entera.
- **`SELECTIONCYCLING`**. Dos líneas superpuestas —y en un plano ajeno hay muchas—: sin
  ciclo, siempre pincho la misma.

**Severidad: alta** para `ISOLATEOBJECTS`, media el resto. **Esfuerzo: un día** los cuatro.

**Cómo se construye.** `ISOLATEOBJECTS` no pide formato nuevo si se implementa como estado
de sesión: un `Set<entityId>` en el editor que el pipeline de render consulta, más el aviso
en la barra de estado (la bombilla de AutoCAD) para que nadie se quede con medio dibujo
oculto sin saberlo. `MULTIPLE` es un envoltorio del motor: `begin` guarda el nombre y
`finish` vuelve a `begin` hasta un `cancel` — el motor ya tiene la pila de suspendidos.
`QPMODE` es la paleta de propiedades que ya existe, montada junto a la selección con dos
campos. `SELECTIONCYCLING` es una lista en el enrutador cuando el `pickBox` toca más de una
entidad; `pointer-router.ts` ya resuelve el conjunto.

**Cómo se verifica.** `check:command-integrity` (ninguno puede responder «hecho» vacío) más
un golden por comando. Para `ISOLATEOBJECTS`, afirmar que el documento del servidor **no
cambió** —aislar no es borrar— y que el contador de render bajó.

---

### HUECO 14 — El `ADCENTER` es un diálogo de texto, no un navegador

**AutoCAD.** Ctrl+2 abre un árbol con carpetas, dibujos, y dentro de cada uno bloques,
capas, estilos y tipos de línea, con **miniaturas**, y arrastro lo que quiera a mi dibujo.

**Valle hoy.** `lib/cad/engine/commands/design-center.ts` es un comando de tres pasos por
la línea: elegir origen, listar, copiar. Es honesto —la cabecera lo explica— y funciona,
pero es un flujo de teclado para una tarea que es visual: no sé cómo es el bloque `BLK-047`
hasta que lo inserto.

Además el origen son **sólo las referencias externas ya adjuntadas**
(`blocks/design-center.ts`), no un catálogo del inquilino. Es el mismo agujero que la
rúbrica declara para `XREF` (*«el motor no tiene CATÁLOGO del inquilino»*), así que van
juntos.

**Severidad: media.** **Esfuerzo: varios días.**

**Cómo se construye.** Panel con árbol de dos niveles (origen → tipo de contenido) y
rejilla de fichas. Las miniaturas: el pipeline de render ya sabe dibujar un bloque a un
canvas; una miniatura de 64×64 por definición, cacheada en `block-cache.ts`, que ya existe.
El catálogo del inquilino es una llamada al API de documentos que ya existe, publicada en
`context.xrefCatalog` — el mismo puente que el gap de `xrefs` pide.

**Cómo se verifica.** Golden: Ctrl+2, afirmar árbol con el xref adjunto, arrastrar una ficha
al lienzo y afirmar la INSERT en el documento del servidor.

---

## 3. Defectos del código

Cosas que miré y que están mal hoy, con fichero y línea.

### D1 · El golden 86 afirma «abren sus paletas» sobre el texto que dice que NO se abren

`apps/web/e2e/golden/86-cad-reconocimiento.spec.ts:120-121`

```ts
await page.keyboard.press('Control+3');
await expect(log, 'Ctrl+3 arranca las paletas de herramientas').toContainText(/paleta/i);
```

El texto que Ctrl+3 produce hoy es *«La **paleta** de herramientas no está montada en este
espacio de trabajo…»* (§HUECO 5). La expresión `/paleta/i` casa con la disculpa. El título
del test —«Ctrl+2/3 **abren** sus paletas»— y `ESCALERA.md:325` («golden 86 los teclea y lee
el diálogo») describen una capacidad que la aserción no comprueba. Es exactamente la clase
de aserción débil que la regla 3 de la campaña de cimientos existe para evitar: la evidencia
tiene que morder.

**Arreglo.** Mientras no exista la paleta, afirmar el LÍMITE explícitamente
(`toContainText('no está montada')`) y renombrar el test. Cuando exista, afirmar el
`data-testid` del dock. En ningún caso una expresión que pasa en los dos mundos.

### D2 · Un botón de la cinta pulsado a media orden deja el enrutador con el ancla del comando anterior

`apps/web/src/components/cad/editor/Layout3DEditor.tsx:15459-15461`

```tsx
<CadRibbon dispatch={(name) => commandEngineRef.current.invoke(name)} readOnly={drawingReadOnly} />
```

La paleta izquierda **no** hace esto: pasa por el enrutador (línea 7847,
`enginePointerRouterRef.current?.invoke(engineCommand)`), y `CadEnginePointerRouter.invoke`
(`pointer-router.ts:260-266`) llama a `this.reset()` **antes** de despachar, que vacía
`bridge.session.current` —y con él el ancla, porque `anchorPoint` está respaldado ahí
(líneas 230-239)—, `lastPoint` y `lastSnap`.

La cinta y Ctrl+K (`Layout3DEditor.tsx:12204`, `invokeEngineCommand`) despachan directo al
motor, saltándose ese reset.

**Escenario de fallo concreto.** Pulso `LINE` en la cinta. Pincho un punto (ancla = P1,
`pointerStarted = true`). Cambio de idea y pulso `CIRCLE` en la cinta. El motor arranca
CIRCLE y pide el CENTRO, pero el enrutador conserva P1. Entonces, en el render:

```ts
// Layout3DEditor.tsx:13934-13950
const engineAnchor = engineCommand ? (enginePointerRouterRef.current?.anchor ?? null) : null;
const dynamicInputKind = engineCommand
  ? engineCommand === "OFFSET" ? "offset"
  : engineCommand === "CIRCLE" && engineAnchor ? "radius"
  : "point"
  : …;
```

`engineAnchor` es P1, así que `dynamicInputKind` sale **`"radius"`**: la entrada dinámica me
pide **R / Ø antes de que yo haya designado el centro**. Y como `dynamicInputKey`
(línea 16132) sólo distingue `anchored`/`origin` y no *qué* ancla, el control tampoco se
remonta. Además, la banda elástica de LINE sigue pintada, porque `bridge.preview.clear()`
vive en `end()` y tampoco se llamó.

**Arreglo.** Que la cinta y las acciones de la paleta usen el mismo despacho que la barra:

```tsx
dispatch={(name) => {
  if (enginePointerRouterRef.current?.invoke(name) !== true)
    commandEngineRef.current.invoke(name);
}}
```

**Verificación.** Golden: LINE desde la cinta, un clic, CIRCLE desde la cinta, y afirmar
que `cad-dynamic-field-x` existe y `cad-dynamic-field-radius` no.

### D3 · El tooltip de los botones de la cinta se recorta contra el propio contenedor

`apps/web/src/components/cad/ribbon/CadRibbonButton.tsx:36` pide `side="bottom"`, que en
`components/ui/Feedback.tsx:76` es `top-full left-1/2 -translate-x-1/2 mt-2`: el globo se
dibuja **debajo** del botón, en posición absoluta.

Su antepasado en el DOM es la fila de paneles,
`apps/web/src/components/cad/ribbon/CadRibbon.tsx:85-87`:

```tsx
className={cx("flex items-stretch overflow-x-auto px-1 py-0",
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", …)}
```

`overflow-x: auto` con `overflow-y: visible` **computa a `auto` en los dos ejes** (CSS
Overflow 3, §3.3). O sea que la fila recorta verticalmente. Y debajo del botón sólo queda el
rótulo del panel (`type-micro`, ~15 px) antes del borde inferior de la fila, con `pb-0`
(`CadRibbonPanel.tsx:22`) y `py-0` en la fila: **el globo, que mide ~40 px, se recorta casi
entero**, y la barra de desplazamiento que lo revelaría está ocultada por las mismas clases.

Esto se lleva por delante justo lo que `CadToolPalette.tsx:37-43` llama «el argumento de
venta del producto»: enseñarle al usuario que su alias de AutoCAD sirve aquí. Se salva sólo
porque el botón conserva además el `title` nativo (línea 40), que es otro texto y aparece
tras un segundo.

**Arreglo.** `side="top"` no vale (arriba está la fila de pestañas). Lo correcto es lo que
ya hace `CadToolPalette`: no depender del recorte del contenedor. O bien un `portal` para
el globo, o bien reservar `pb-10` en la fila (cuesta píxeles verticales que el golden 19
vigila), o bien mover el tooltip a la banda alta del lienzo, que está vacía. Yo elegiría el
portal.

**Verificación.** Golden: pasar el ratón por `cad-ribbon-command-LINE` y afirmar
`toBeInViewport()` sobre el `role="tooltip"`.

### D4 · Hexadecimal suelto y tamaños fuera de la escala en el cursor vivo

`apps/web/src/components/cad/viewport/live-cursor.ts:58, 67, 69`

```ts
const BADGE_CLASS = "rounded bg-cyan-500/90 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-950 shadow";
const FIELD_CLASS = "… border-cyan-300/60 bg-gray-950/95 … text-[11px] text-cyan-100 …";
const MENU_CLASS  = "… border-white/15 bg-[#0b1020]/97 p-1 text-[12px] shadow-xl backdrop-blur";
```

`AGENTS.md` es explícito: *«No hex outside `globals.css`. No size outside the scale»*, y el
menú de palabras clave lleva `bg-[#0b1020]/97`. Es **el mismo hexadecimal** que
`CadCommandLine.tsx:127-136` documenta haber quitado por producir «letra oscura sobre panel
oscuro en tema claro». El cursor vivo, la entrada dinámica junto al puntero y el menú de
palabras clave —las tres superficies que un dibujante mira mientras dibuja— **no giran con
el tema**. En tema claro son tres manchas negras sobre un plano blanco.

Ya de paso: `text-[11px]`/`text-[12px]` en vez de `type-micro`/`type-caption`, `shadow-xl`
en vez de `shadow-floating`, `bg-cyan-500`/`text-gray-950` en vez de tokens. Y `shadow-2xl`
—que `AGENTS.md` cita textualmente como «señal de haber salido del sistema»— aparece en
`CadDynamicInput.tsx:97` y en cinco sitios de `Layout3DEditor.tsx` (15030, 15881, 15950,
16019, 16252, 17786), uno de ellos el propio menú contextual.

**Por qué importa aquí y no es cosmética.** `design-system.spec.ts` afirma que los tokens
están EN USO; no caza un fichero que se los salta. El resultado es que la parte del producto
que más se mira es la que peor obedece al sistema, y en tema claro **se lee mal de verdad**.

**Arreglo.** Tokens: `bg-popover`, `text-popover-foreground`, `border-border`,
`shadow-floating`, `type-micro`. Si el cian del marcador OSNAP es dato de dibujo y no marca
—defendible, es el color de captura de AutoCAD—, entonces que sea un token nombrado en
`globals.css` con la razón al lado, como manda la regla.

### D5 · La cinta lanza una excepción en tiempo de carga de módulo si un espejo desaparece

`apps/web/src/lib/cad/ribbon.ts:274`

```ts
const original = byName.get(name);
if (!original) throw new Error(`ribbon: el espejo «${name}» no existe en el registro`);
```

dentro de `buildRibbonTabs()`, que corre en `CAD_RIBBON_DATA` (línea 296), **en el cuerpo
del módulo**. `ribbon.ts` lo importa `CadRibbon.tsx`, que importa el editor. Si alguien
renombra `TABLE` o `DIMALIGNED`, el estudio entero deja de cargar con una pantalla en
blanco, en vez de con una cinta sin ese botón.

La intención es buena y la comparto (un cadáver en la tabla no debe esconderse). Pero el
sitio no: eso es trabajo de `scripts/cad/check-ribbon-coverage.mjs`, que ya corre en CI y ya
importa este módulo. En producción, la degradación correcta es dejar fuera el espejo y
publicarlo en `cadRibbonPanelFallbacks()`, que ya es el canal de «esto no cuadró».

**Escenario de fallo.** Un cambio de registro con el gate no corrido (o corrido sobre otro
árbol) = estudio caído para todos, no botón faltante para uno.

### D6 · El atajo que enseña el botón de la cinta es el primer alias declarado, no el que la gente teclea

`apps/web/src/components/cad/ribbon/CadRibbonButton.tsx:36`

```ts
const shortcut = command.aliases[0];
```

Para `PROPERTIES` los alias son `["CH", "MO", "PR", "DDMODIFY"]`, así que el tooltip y el
`title` enseñan **`CH`**. Nadie teclea `CH`; se teclea `PR` o `MO`. Igual con `ADCENTER`
(`["AC","ADC","DC"]` → enseña `AC`) y con `-OSNAP` (`["-OS"]`, correcto por casualidad).

El tooltip existe precisamente para enseñar el alias que el usuario ya sabe; enseñar el
menos usado desperdicia la ocasión y, peor, le enseña uno nuevo que tendrá que memorizar.

**Arreglo.** Un campo `primaryAlias?: string` en el descriptor, o una tabla
`CAD_ALIAS_PREFERIDO: Record<string, string>` junto a `ribbon-order.ts`, con spec que exija
que el preferido esté en `aliases`. Barato y visible el primer día.

### D7 · Comentarios y cifras desactualizados que la regla 4 de la casa prohíbe

- `ribbon.ts:5` dice «los ~192 comandos reales»; `engine/index.ts:22` dice 294 y la sonda
  confirma 294.
- `Layout3DEditor.tsx:16171` dice «La cinta despacha los 192 comandos».
- El golden `61-cad-ribbon-mouse-only.spec.ts:13,74` cita «17 → 192 comandos alcanzables» y
  `docs/cad/evidence/ui-command-reach.json`.
- `ESCALERA.md:511` dice «291 comandos» en tres sitios.
- `command-icons.ts` se documenta como «247 filas» y `ESCALERA.md:324` repite 247.

Cuatro cifras distintas (192, 247, 291, 294) para la misma cosa, en cinco ficheros. La
regla 4 —«Ninguna cifra vive en dos lugares… Una cifra escrita a mano en un doc es un
defecto aunque hoy coincida»— aplica también a los comentarios de código y a los títulos de
los goldens, que es donde se leen. **Aquí ya ni coinciden.**

### D8 · Etiquetas heredadas y sin acentuar en la tabla que alimenta tres superficies

`apps/web/src/lib/cad/keyboard-shortcuts.ts:71-215` y `lib/cad/toolbar.ts`:
`"Command palette"`, `"Select"`, `"Measure"`, `"Corridor"`, `"Area"`, `"Symbols"`, y
descripciones sin acentos: `"Modo seleccion."`, `"Herramienta de medicion."`,
`"Insertar un area rectangular editable."`, `"Ejecutar revision de diseno del layout."`,
`"Abrir exportacion DXF profesional."`, `"Abrir la biblioteca de simbolos y bloques."`.

Esa tabla alimenta el tooltip de la paleta izquierda, el dock de workspace y el panel de
atajos: tres superficies que el usuario ve el primer día, en un producto cuya regla dice
«es-MX en copy nuevo». Y `aisle`/«Corridor»/«pasillo» es vocabulario que `AGENTS.md`
prohíbe reintroducir; sobrevive aquí porque el gate
(`scripts/cad/check-no-industrial-domain.mjs`) no lo alcanza en esta capa.

---

## 4. La apuesta ganadora

De todo lo mío, **una** cosa. Y no es ninguno de los catorce huecos, porque cerrarlos todos
sólo me da un AutoCAD igual. Un CAD en el navegador tiene que ganar por algo que AutoCAD no
puede hacer, y aquí hay una pieza construida que nadie está cobrando.

> **La cinta y la línea de comandos ya salen del MISMO registro de 294 comandos, con
> cobertura total gateada. Falta un paso: hacer ese registro EDITABLE por el usuario, en el
> navegador, y que el espacio de trabajo resultante viaje con su cuenta. Es decir: el CUI de
> AutoCAD, pero que se abre en cualquier máquina, se comparte con un enlace y se versiona
> con el proyecto.**

Por qué esto y no otra cosa:

1. **La mitad difícil ya está hecha.** `ribbon.ts` es una FUNCIÓN sobre el registro, no una
   lista. Cambiar la clasificación es cambiar datos, no código. `CAD_RIBBON_PANEL_ORDER`,
   `CAD_RIBBON_COMMAND_ORDER` y `CAD_RIBBON_INICIO_ESPEJOS` ya son las tres tablas que un
   editor de cinta necesitaría escribir. Nadie más puede decir eso: en AutoCAD la cinta vive
   en un XML binario-adyacente que se edita con un diálogo que da miedo tocar.
2. **AutoCAD no puede.** El CUI de AutoCAD es un fichero `.cuix` en `%APPDATA%` de UNA
   máquina. Cambiar de equipo es reconfigurar. Un despacho de doce personas no tiene forma
   sana de que las doce compartan la misma cinta: se pasan el `.cuix` por correo. Es un
   dolor real, viejo y reconocido, y es **estructuralmente insoluble** para una aplicación
   de escritorio con perfiles locales.
3. **En el navegador es natural.** El espacio de trabajo es un JSON pequeño. Ya hay
   identidad de primera parte, organizaciones y membresías (`AGENTS.md`). Un
   `PUT /v1/cad/workspace` y un `GET` lo hacen roamable el mismo día. Y como es un
   documento, se puede **compartir a nivel de organización**: el titular publica el espacio
   «Estándar del despacho» y los doce lo tienen al entrar, con los alias del despacho, los
   paneles que el despacho usa y las paletas de herramientas con los bloques del despacho.
4. **Es la puerta de entrada del que se cambia, no la del que empieza.** El que abre Valle
   Design por primera vez no viene vacío: viene con un `acad.pgp` que lleva quince años
   editando. **Importar un `acad.pgp`** —parsear `AL, *ALIGN` es trivial y la tabla ya tiene
   la forma exacta— y decirle «tus 47 alias propios funcionan aquí» es el argumento más
   fuerte que este producto puede hacer, y lo puede hacer **hoy**, porque los 209 alias
   estándar ya resuelven.

**La forma concreta que le daría, en tres entregas:**

- **E1 (un día).** `WSSAVE`, `WORKSPACE`, `WSCURRENT` sobre `CadWorkspacePreferences`, que ya
  existe y ya se normaliza. Persistencia en el servidor. Cobra: el espacio de trabajo deja
  de perderse al cambiar de máquina.
- **E2 (varios días).** `PGPIMPORT`: leer un `acad.pgp` del usuario y fusionar sus alias
  sobre `CAD_COMMAND_ALIASES`, resolviendo colisiones con el mismo `unresolvedAliases()` que
  ya existe y **diciendo cuáles no resuelven porque el comando no está** — que es
  exactamente la clase de límite declarado que esta casa exige. Cobra: la memoria muscular
  *personal*, no sólo la estándar.
- **E3 (semanas).** `CUI` como panel: reordenar paneles y botones de la cinta arrastrando,
  atar cualquier tecla a cualquier comando del registro, y **publicar el espacio a la
  organización**. Las tres tablas de `ribbon-order.ts` pasan a ser el valor de fábrica y el
  espacio del usuario las sustituye por completo o por delta.

Y la línea que lo vende, que es verdad y se puede demostrar en treinta segundos con la
pantalla compartida:

> *«Sube tu `acad.pgp`. Los doce del despacho entran a la misma cinta desde cualquier
> máquina, sin instalar nada. Cuando cambies un alias, cambia para los doce.»*

Eso AutoCAD no lo puede decir. Y aquí, casi todo lo caro está construido.

---

## 5. Resumen de una línea por hueco

| # | Hueco | Severidad | Esfuerzo |
| --- | --- | --- | --- |
| 1 | Ninguna pestaña contextual: la cinta no sabe qué hay designado | bloqueante | varios días |
| 3 | `PR`/`OP`/`TP`/`UC` responden «no está montada» con el panel montado | bloqueante | horas |
| 2 | La línea de comandos no autocompleta (el buscador existe, sólo en Ctrl+K) | alta | un día |
| 4 | Inicio: 159 botones en 10.500 px, sin desplegables ni barra visible | alta | varios días |
| 5 | La paleta de herramientas no tiene interfaz (catálogo construido, sin consumidor) | alta | varios días |
| 6 | Menú contextual de 5 entradas fijas, sin objeto ni entrada reciente | alta | un día |
| 7 | Sólo 3 pestañas de lámina, arriba, en inglés, sin Ctrl+RePág | alta | un día |
| 13 | Sin `ISOLATEOBJECTS`, `MULTIPLE`, `QPMODE`, `SELECTIONCYCLING` | alta | un día |
| 8 | Sin `WORKSPACE`/`WSSAVE`/`CUI`; preferencias sólo en `localStorage` | media | semanas |
| 9 | Tres barras de comandos compitiendo, con vocabulario heredado | media | varios días |
| 10 | Sin F2 ni ventana de historial; el log son seis renglones no desplazables | media | un día |
| 11 | Barra de estado: 4 de 15 conmutadores; rejilla y forzado no se pulsan | media | un día |
| 14 | `ADCENTER` es un diálogo de texto sin miniaturas ni catálogo del inquilino | media | varios días |
| 12 | Sin teclas Alt, sin tiradores de panel, la pestaña no se recuerda | baja | un día |

Defectos: **D1** (aserción del golden 86 que pasa sobre su propio fallo), **D2** (la cinta
no resetea el enrutador), **D3** (tooltip de la cinta recortado), **D4** (hex suelto y
tamaños fuera de escala en el cursor vivo), **D5** (`throw` en carga de módulo),
**D6** (alias equivocado en el tooltip), **D7** (192/247/291/294 en cinco sitios),
**D8** (etiquetas heredadas y sin acentos).

Y dos correcciones **a favor** del producto, que la rúbrica todavía no ha cobrado:

- El `gap` de `command-line` dice que quedan 2 alias sin resolver (`BE`, `BLE`). **Resuelven
  los 209.**
- El `gap` de `draw-2d` dice que faltan F7, F9 y F12. **Están las tres**, declaradas y
  despachadas.
