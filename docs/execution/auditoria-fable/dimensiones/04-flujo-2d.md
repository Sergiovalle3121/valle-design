# Auditoría 04 · El flujo diario de dibujo 2D

**Fecha:** 2026-09-05
**Quién escribe:** arquitecto/proyectista con veinte años de oficio, suscripción
completa de AutoCAD, uso diario del modelo, las presentaciones y los toolsets.
Abro Valle Design por primera vez con intención honesta de cambiarme.
**Alcance:** dibujar y editar (precisión, referencias a objetos, rastreo,
entrada de coordenadas, selección, pinzamientos, matrices, propiedades,
igualar propiedades, calculadora) y anotar (texto, cotas, directrices, tablas,
escala anotativa).
**Método:** lectura de `docs/competitive/rubric.json`, de la matriz en prosa y
del árbol real con Grep/Glob/Read. No se ha modificado ni una línea de producto.

---

## 0. Veredicto

**7,5 / 10 contra AutoCAD completo en esta dimensión.**

El armazón es de verdad: 288 comandos en el registro, la línea de comandos se
comporta como la de AutoCAD (alias, transparentes, palabras clave, override de
OSNAP que no consume el paso), la asociatividad de cotas y directrices se
regenera en cada lote, hay QSELECT y FILTER de verdad, hay grips
multifuncionales, hay ARRAY en sus tres formas, hay doble clic con verbo por
tipo. Eso no es una maqueta: es un CAD.

Lo que me frena el lunes no es el catálogo de comandos. Es que **cuatro de los
catorce modos de referencia a objetos que el propio cuadro DSETTINGS me ofrece
—Punto medio sobre polilínea, Punto (nodo), Inserción y Centro geométrico— no
tienen quién les dé un candidato sobre las entidades canónicas**, y que **no
existen `DESDE`, `M2P`, `TT` ni `PAR`**, que son la mitad de mis capturas del
día. Se dibuja rápido cuando la geometría es una línea o un arco; en cuanto el
plano es de polilíneas —o sea, siempre— la precisión se cae al modo `Cercano` y
a teclear coordenadas.

La frase corta: **compite en el catálogo y en la línea de comandos; todavía no
compite en el imán.**

### Qué le doy a cada casilla de la rúbrica que toca esta dimensión

| Fila | Rúbrica hoy | Mi lectura |
|---|---|---|
| Dibujo 2D y precisión | 16/16 «Completa» | 12/16. Los ocho criterios verifican, pero `draw-2d.osnap` mide que la CONSULTA esté indexada y publicada, no que los catorce modos RESUELVAN sobre los once tipos de entidad. Ver §2 y D-03. |
| Selección y modificación | 13/14 | 11/14. Falta el estrés denso (ya declarado) y falta la forma de la orden: OFFSET sin lado, TRIM sin valla, BREAK sólo sobre línea. |
| Cotas asociativas | 12/12 «Completa» | 10/12. El núcleo es sólido; falta el aparato de acabado (DIMSPACE, DIMBREAK, DIMJOGGED, marcas de centro, DIMREASSOCIATE). |
| MTEXT y texto | 9/9 «Completa» | 8/9. Muy bueno. Falta FIND/reemplazar en todo el dibujo. |
| MLEADER y tablas | 4/5 | 3/5. La tabla es una rejilla de texto sin relleno, sin borde por celda, sin fórmula. |

**Nota sobre la rúbrica: dos gaps escritos están caducos.** `draw-2d.gap` dice
que faltan F7/F9/F12; existen y están cableadas
(`apps/web/src/lib/cad/keyboard-shortcuts.ts:180-200`,
`apps/web/src/lib/cad/editor-keyboard.ts:272-277`). `command-line.gap` dice que
quedan «2 de 129 alias sin resolver: BE→BEDIT y BLE→BLEND»; los dos resuelven
hoy en `command-manifest.ts` (`BEDIT` con alias `BE`, `BLEND` con alias `BLE`).
Cobrarlos es un cambio de texto, no de código.

---

## 1. Lo que ya está construido y funciona (lo digo primero, porque es mucho)

1. **Registro de 288 comandos con manifiesto generado y verificado por gate.**
   `apps/web/src/lib/cad/engine/command-manifest.ts` (334 líneas, generado por
   `scripts/cad/build-command-manifest.mjs`, con `--check` en `npm run check:cad`).
   Los alias de `acad.pgp` están: `L`, `PL`, `C`, `A`, `E`, `M`, `CO`, `O`, `TR`,
   `EX`, `F`, `CHA`, `MI`, `S`, `RO`, `SC`, `X`, `J`, `PE`, `H`, `T`, `MT`, `DT`,
   `DLI`, `DAL`, `DAN`, `DRA`, `DDI`, `D`, `MA`, `AR`, `G`, `LA`, `PR`, `OS`, `DS`.

2. **La línea de comandos se comporta como la de AutoCAD.**
   `apps/web/src/lib/cad/engine/input-pipeline.ts:1-27` documenta y respeta el
   orden canónico de interpretación: transparente → palabra clave → override de
   OSNAP → coordenada → distancia/entrada directa → ángulo → texto → invocación.
   Que «la palabra clave gane a la coordenada» y que «el override no consuma el
   paso» son las dos decisiones correctas y están tomadas.

3. **Override de OSNAP de una sola captura, con las siglas de AutoCAD.**
   `input-pipeline.ts:62-81`: `END/ENDP, MID, CEN, GCE, NOD, QUA/QUAD, INT,
   APP/APPINT, INS, PER/PERP, TAN, NEA/NEAR, EXT, NON/NONE`.

4. **OSMODE bit a bit, con la codificación de AutoCAD.**
   `apps/web/src/lib/cad/osnap-bits.ts` — los dieciséis bits, `SETVAR OSMODE 35`
   significa lo mismo aquí que en un `.scr` de despacho. Esto es oficio de verdad.

5. **Coordenadas absolutas, relativas `@`, polares `<`, entrada directa,
   tercera componente `z` y pies-pulgadas compuestos.**
   `apps/web/src/lib/cad/precision-input.ts:103-197`; el comentario de
   `normalizeCoordinateInput` (líneas 58-68) sobre por qué NO se borran todos los
   espacios (`1'-6 1/2"`) es el tipo de detalle que sólo escribe quien ha visto
   el error en un plano.

6. **Selección profesional completa en el índice espacial.** Ventana, cruce,
   polígono, valla y lazo, con `intersecting()` y `path()` SIN tope silencioso
   —el comentario de `native-selection-index.ts:245-256` cuenta que el tope 300
   truncaba y se eliminó, no se declaró—. Más QSELECT y FILTER con operadores
   `= != > < >= <= ~` sobre propiedades que salen del registro de adaptadores
   (`selection/selection-filter.ts:1-22`), no de una lista escrita a mano.

7. **Grips multifuncionales con ciclo por Espacio, cableados.**
   `apps/web/src/lib/cad/grip-actions.ts` + `components/cad/viewport/native-grip-controller.ts`,
   instanciado en `Layout3DEditor.tsx:6726`. Añadir vértice, quitarlo, convertir
   tramo en arco y volverlo recto — con la insignia que anuncia la acción ciclada.

8. **Doble clic con verbo por tipo, y con lo que NO abre declarado.**
   `apps/web/src/lib/cad/double-click-verb.ts`: MTEXT abre el editor de párrafo,
   TEXT/MLEADER/cota/ATTDEF abren DDEDIT, INSERT abre ATTEDIT, polilínea abre
   PEDIT, tabla abre TABLEDIT. Y hatch/xref/imagen devuelven `null` a propósito
   con el motivo escrito. Esto está mejor pensado que en AutoCAD.

**Y una cosa que está MEJOR que en AutoCAD:** el override de OSNAP y la máquina
de comandos están desacopladas del motor de captura por diseño explícito, y el
manifiesto de comandos es GENERADO y verificado por gate. En AutoCAD, añadir un
modo de captura toca el núcleo; aquí toca una tabla. Eso no se ve el lunes, pero
se nota al año.

---

## 2. La prueba del lunes: cinco cosas que hago antes de comer

Las he seguido paso a paso contra el árbol.

### 2.1 Recibo la planta del estructurista y le saco el eje de un muro

Los muros del otro despacho vienen como **polilíneas**. Enciendo `MED` y voy al
centro de un tramo para arrancar el eje.

**No imanta.** El adaptador de polilínea emite el punto medio de cada tramo con
`kind: "control"` (`apps/web/src/lib/cad/polyline-entity-adapter.ts:325-329`), y
`cadSnapSceneAddEntities` encamina `"control"` a `scene.nodes`
(`snap-scene.ts:199-206`), es decir al modo **PUNto (nodo)**, no a **Punto
medio**. Si tengo `NOD` encendido, imanta pero el rótulo dice «nodo»; si lo he
apagado —y lo apago siempre, porque los nodos de una topografía me estorban—,
el punto medio de una polilínea **no existe**.

Lo mismo, y peor, en `snap-scene.ts:178-190`: sólo una entidad de tipo `line`
con dos puntos aporta `midpoints` y `perpendicularSegments`. Consecuencia
medida leyendo el código:

- **MED** funciona sobre `line` y sobre las cajas del editor. No sobre polilínea,
  arco, círculo, elipse, spline, muro ni cota.
- **PER** funciona sobre `line` y cajas. **No puedo bajar una perpendicular a un
  muro dibujado como polilínea.** Eso es la mitad de mi día.

### 2.2 Coloco una columna en el centro geométrico de un local cerrado

`GCE` está en el cuadro (`CadDraftSettingsDialog.tsx:24-39`, «Centro
geométrico») y en `OSMODE` (bit 8192). Ningún adaptador emite jamás un
candidato de centro geométrico: `scene.geometricCenters` sólo se llena desde
`cadSnapSceneFromBoxes` con el centro de las cajas del editor
(`snap-scene.ts:97`). Sobre una polilínea cerrada del dibujo, **la casilla está
encendida y no hay imán detrás**.

### 2.3 DIVIDE la fachada en 7 y coloco luminarias en los nodos

`DIVIDE` emite entidades `point` (`engine/commands/draw-points.ts:4,59`), que es
correcto. Enciendo sólo `NOD` para no coger la línea. **Nada.** El adaptador de
`point` declara su punto como `kind: "endpoint"` con etiqueta `"Nodo"`
(`point-line-adapters.ts:165`). Se imanta con `END`, no con `NOD`. El rótulo
del HUD dirá «extremo» sobre un punto.

Y la opción `Bloque` de DIVIDE (colocar el símbolo en cada marca) está declarada
como ausente en la cabecera del propio módulo (`draw-points.ts:25`) — bien
declarada, pero ausente.

### 2.4 Engancho un bloque por su punto de inserción

Enciendo sólo `INS` para pinchar la referencia de un bloque de mobiliario.
**Nada.** El adaptador de INSERT devuelve su inserción como
`kind: "endpoint"` (`block-text-adapters.ts:459`). `scene.insertions` sólo se
llena desde las cajas del editor. `INS` sobre un bloque real del documento no
resuelve nunca.

### 2.5 Trazo una tangente al círculo de un tanque

`TAN` funciona **sobre un arco** —el adaptador de arco calcula las dos tangencias
desde el cursor, y bien (`curve-entity-adapters.ts:186-203`)—. **Sobre un
CÍRCULO no**: el adaptador de círculo emite centro y cuadrantes y nada más
(`basic-native-adapters.ts:89-92`). El caso frecuente es el círculo.

### El resumen del lunes

De los catorce modos que el producto ofrece en su cuadro de ajustes, sobre la
geometría canónica de un plano real resuelven de verdad: `END`, `CEN` (de
círculo/arco/elipse), `CUA`, `INT`, `INTAP`, `EXT`, `CER`, `PER` (sólo líneas),
`MED` (sólo líneas), `TAN` (sólo arcos). No resuelven: `NOD`, `INS`, `CENG`, y
`MED`/`PER` sobre todo lo que no sea una línea suelta.

**Y el golden que sostiene la fila lo prueba exactamente donde funciona:**
`apps/web/e2e/golden/28-cad-osnap-pointer.spec.ts:76-80` mide extremo, medio,
intersección, perpendicular y tangente sobre **dos líneas y un arco**. Ninguna
polilínea, ningún círculo, ningún punto, ningún bloque. La evidencia es honesta;
el corpus es demasiado amable.

---

## 3. Lo que falta, ordenado por lo que más me duele

### H-01 · Los cuatro modos de captura que el cuadro promete y nadie sirve · BLOQUEANTE

**AutoCAD:** los catorce modos de `OSMODE` resuelven sobre todos los tipos de
objeto que tienen ese punto. `MED` sobre cada tramo de una polilínea y sobre el
arco de una LWPOLYLINE con bulge; `NOD` sobre un POINT; `INS` sobre un INSERT,
un TEXT y un ATTDEF; `CENG` sobre cualquier contorno cerrado.

**Valle hoy:** `CadSnapKind` tiene **cinco** valores —`center | endpoint |
quadrant | tangent | control`— (`entity-runtime.ts:81-86`). No existen `midpoint`,
`node`, `insertion` ni `geometric-center` como tipos que un adaptador pueda
emitir, así que las cinco cocinas de `snap-scene.ts:199-206` encaminan mal:
el punto medio de una línea sale como `center`
(`basic-native-adapters.ts:54`), el de un muro también
(`wall-entity-adapter.ts:290`), el de un tramo de polilínea como `control`, un
POINT como `endpoint`, la inserción de un bloque como `endpoint`.

**Por qué duele:** no puedo empezar una línea en el medio de un muro. Es el
primer gesto de cualquier sección, de cualquier eje, de cualquier cota de
distribución.

**Coste:** un día. **Cómo se construye:**
1. Ampliar `CadSnapKind` en `entity-runtime.ts` a los ocho: `endpoint, midpoint,
   center, geometric-center, node, quadrant, insertion, tangent, control`
   (`control` se queda para lo que no es un modo de OSNAP: las asas de anchura,
   altura y rotación).
2. Ampliar el `switch` de `snap-scene.ts:199-206` a un mapa `kind → cubo de la
   escena`, con un `default` que empuje a `endpoints` como hoy y un `console`
   NO: un contador que el spec pueda leer.
3. Corregir once adaptadores, todos de una línea:
   `basic-native-adapters.ts:54` (`center`→`midpoint`), `:89-92` (añadir tangente
   desde el cursor, copiando el bloque del arco), `polyline-entity-adapter.ts:314-329`
   (`control`→`midpoint`, y `center` del arco se queda), `point-line-adapters.ts:165`
   (`endpoint`→`node`), `block-text-adapters.ts:139,170,443,459`
   (`endpoint`→`insertion`), `wall-entity-adapter.ts:290` (`center`→`midpoint`),
   `annotation-v4-adapters.ts:116,143,303` (`endpoint`→`insertion`).
4. Añadir `geometric-center` en los adaptadores de contorno cerrado: polilínea
   cerrada, hatch, región, muro. El centroide de un polígono simple es diez
   líneas de aritmética que ya vive en `geom-measure.ts`.
5. `snap-scene.ts:178-190`: dejar que **cualquier** tramo recto de una polilínea
   —no sólo una `line`— aporte `perpendicularSegments`. El motivo escrito ahí
   («las cuerdas con que se tesela un arco no son aristas del dibujo») es
   correcto para los ARCOS y equivocado para los TRAMOS RECTOS de una polilínea:
   ésos sí son aristas del dibujo. La distinción ya la sabe el adaptador, que
   conoce el `bulge` de cada tramo.

**Cómo se verifica:** un spec de matriz —`professional-snapping-matrix.spec.ts`—
con **una fila por (modo × tipo de entidad)**, 14 × 11 casillas, cada una
`resuelve` / `no aplica` / `todavía no`, y el gate falla si una casilla marcada
`resuelve` deja de resolver. Más una ampliación del golden 28 con polilínea,
círculo, punto y bloque. Y —esto es lo importante para la casa— **el cuadro
DSETTINGS deshabilita, con motivo visible, la casilla de un modo que hoy no
tiene servidor**: fix-or-hide aplicado al imán.

---

### H-02 · `DESDE`, `M2P`, `TT` y `PAR` no existen · ALTA

**AutoCAD:** en cualquier petición de punto tecleo `DESDE` (`FROM`), pincho una
esquina y escribo `@300,0`. O `M2P` y pincho dos puntos para caer en su mitad. O
`TT` para dejar un punto de rastreo temporal. O `PAR` para arrastrar paralelo a
una arista.

**Valle hoy:** `CAD_OSNAP_OVERRIDES` (`input-pipeline.ts:62-81`) tiene los
catorce modos y **ninguno de los cuatro modificadores**. Grep de `"FROM"`,
`"DESDE"`, `"M2P"`, `"MTP"`, `"TT"`, `"PAR"` en `apps/web/src`: cero
coincidencias fuera de un prefijo de bomba en `plant/pid-symbols.ts`.

**Por qué duele:** es como coloco puertas, ventanas, ejes de columnas y
arranques de escalera. Sin `DESDE` tengo que dibujar una línea auxiliar, medirla,
usarla y borrarla. Cuatro pasos por hueco, treinta huecos por planta.

**Coste:** varios días (2-3). **Cómo se construye:** son **modificadores de
punto**, no comandos, y por tanto viven donde ya vive el override: en
`input-pipeline.ts` como un cuarto tipo de `CadResolvedToken`,
`{ kind: "pointModifier"; modifier: "from" | "m2p" | "tt" | "par" }`. El anfitrión
(`command-engine-host.ts`) abre una **sub-captura**: guarda el paso actual, pide
uno o dos puntos con su propio prompt, calcula el ancla y devuelve al paso
original con `context.lastPoint` sustituido (`from`, `m2p`, `tt`) o con un ángulo
bloqueado (`par`). El motor de comandos no se entera de nada, que es exactamente
la propiedad que su cabecera ya se propone conservar.

**Cómo se verifica:** spec de la tubería (`input-pipeline.spec.ts`) para el
token; spec de anfitrión para la sub-captura; golden en Chromium: `LINE` →
`DESDE` → clic en una esquina → teclear `@300,0` → afirmar la coordenada del
primer vértice del documento del servidor.

---

### H-03 · La entrada dinámica sólo aparece en 7 de 288 comandos · ALTA

**AutoCAD:** el cuadro de entrada dinámica sigue al cursor en **cualquier**
petición de punto, distancia o ángulo, y `Tab` salta entre casillas. Es el único
sitio donde miro mientras dibujo: no bajo la vista a la línea de comandos.

**Valle hoy:** `CadDraftToolbar` —que es quien monta la entrada dinámica— se
renderiza sólo si `tool === "wall" || isCadDrawTool(tool)`
(`Layout3DEditor.tsx:16128`), y `CAD_DRAW_TOOLS` son siete:
`line, polyline, rect, circle, move, copy, offset`
(`Layout3DEditor.tsx:1018-1026`). Un comando invocado desde la cinta o tecleado
—`ARC`, `ELLIPSE`, `POLYGON`, `XLINE`, `ROTATE`, `SCALE`, `STRETCH`, `TRIM`,
`DIMLINEAR`— deja `engineCommand` activo **sin cambiar `tool`**, y no hay
entrada dinámica. El propio comentario de `Layout3DEditor.tsx:16165-16175` lo
reconoce al explicar por qué existe un botón «Terminar comando» separado.

Además, **la entrada dinámica no sabe de unidades imperiales ni de cm**:
`CadDynamicInputContext.documentUnit` es `'mm' | 'm'` (`dynamic-input.ts:19`) y
el editor colapsa todo lo demás a milímetros
(`Layout3DEditor.tsx:16137`: `data?.footprint.unit === "m" ? "m" : "mm"`).
En un dibujo en pulgadas, `parseCoordinate` interpreta `10'6"` correctamente por
la línea de comandos y la casilla dinámica lo rechaza. Dos analizadores, dos
verdades.

**Coste:** varios días. **Cómo se construye:** desacoplar `CadDraftToolbar` del
`tool` heredado y montarla cuando `engineCommand` esté activo **y** el paso
actual acepte `CAD_ACCEPT_POINT | CAD_ACCEPT_DISTANCE | CAD_ACCEPT_ANGLE` —esa
máscara ya viaja en el `CadCommandStep`—. El `kind` de la casilla se deriva de
la máscara, no de una lista de siete ids. Y hacer que `parseCadDynamicScalar`
delegue en `parseCadLengthInDrawingUnits` de `units-imperial.ts`, que es el
analizador bueno, en vez de tener el suyo.

**Cómo se verifica:** spec que recorra los 288 comandos del manifiesto y afirme
que todo paso con máscara de punto ofrece casilla dinámica; golden que teclee
`ARC` desde la línea de comandos y escriba el radio en la casilla flotante.

---

### H-04 · OFFSET no pregunta de qué lado · ALTA

**AutoCAD:** `OFFSET` → distancia → designar objeto → **«Precise punto en lado
de desplazamiento»**. Y tiene `Múltiple`, `Punto de paso`, `Borrar` y `Capa`.

**Valle hoy:** `engine/commands/modify-basics.ts:208-220`: pide distancia, pide
objeto, y aplica `offsetCanonicalEntity(source, state.distance, …)`. **El lado
lo decide el SIGNO de la distancia.** No hay tercera pregunta, no hay opciones.
Peor todavía: `draw-action-entities.ts:307-308` rechaza cualquier polilínea con
un tramo en arco (`bulge-unsupported`), y el mensaje lo dice bien
(`:243-245`) — pero una fachada curva, un cordón de banqueta o un muro con
esquina redondeada no se pueden desplazar en absoluto.

**Por qué duele:** OFFSET es, después de LINE y TRIM, el comando que más pulso.
Que me obligue a adivinar el signo de la perpendicular de una polilínea de
diecisiete vértices —y a deshacer cuando fallo— es fricción en el gesto más
repetido del día.

**Coste:** un día para el lado y las opciones; varios días para el arco.
**Cómo se construye:** añadir un tercer estado a `OffsetState` (`side: null`)
con `accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD` y las palabras
`Múltiple/Salir`; el signo se calcula proyectando el punto sobre la normal del
tramo más cercano —`nearestOnSegment` de `snap-engine.ts` ya lo da—. Para el
arco: `offsetPath` recibe los `bulge` y desplaza cada arco como concéntrico
(el caso ya está resuelto para la entidad `arc` en `:359-375`); las esquinas
arco-recta se resuelven con la misma intersección que ya usa `offsetPath`.

**Cómo se verifica:** spec con una polilínea en U desplazada hacia dentro y
hacia fuera **por el punto**, no por el signo; spec de polilínea con `bulge`
midiendo el radio resultante contra `r ± d`; golden de recorrido.

---

### H-05 · La escala anotativa es destructiva y sólo vale para una ventana · ALTA

**AutoCAD:** un objeto anotativo lleva una **lista** de escalas. El mismo rótulo
de local mide 2,5 mm de papel en la ventana general a 1:100 **y** en el detalle
a 1:20 de la misma lámina, cada una con su posición propia.

**Valle hoy:** `layout/annotative-scale.ts` guarda **una** altura de papel en
`context.metadata.annotativeHeightMm` y **reescribe la altura real de la
entidad** cuando cambia la escala. Con dos ventanas a escalas distintas manda
«la de la primera que la muestra en el orden de la hoja» (`:167-171`, y el
propio comentario lo dice). Es decir: **una lámina con general y detalle sale
con un texto correcto y otro no.** Además `HEIGHT_BEARING_TYPES` son
`mtext, text, attdef` más `dimension` (`:113-118`): una **directriz** marcada
anotativa cae en `skippedEntityIds` — y la directriz es lo más anotativo que hay
en un plano. Un hatch anotativo tampoco escala su patrón.

**Por qué duele:** la lámina de albañilería lleva siempre una general y dos o
tres detalles. Hoy tendría que tener el texto duplicado en capas distintas, que
es exactamente el vicio que la anotatividad vino a matar.

**Coste:** semanas (toca el formato persistido: decisión del titular).
**Cómo se construye:** el bolsillo pasa de escalar a lista:
`context.metadata.annotativeScales = [{ denominator, heightMm, offset? }]` y la
altura EFECTIVA se resuelve **en el render y en el trazado**, por ventana, no
mutando la entidad. El paso intermedio barato y no destructivo, que se puede
hacer ya: `cadAnnotativeRescaleCommands` deja de emitir `properties/replace` y
pasa a devolver una **tabla de alturas por (ventana × entidad)** que
`paper-space.ts` consume al componer la lámina; el modelo no se toca. Añadir
`mleader` y `hatch` a los tipos con altura anotativa es una línea y su spec.

**Cómo se verifica:** golden de una lámina con dos ventanas (1:100 y 1:20) que
muestran el MISMO rótulo, midiendo su altura en el PDF en milímetros de papel
—dos veces 2,5, no 2,5 y 12,5—.

---

### H-06 · El rastreo desde puntos adquiridos sólo sigue X e Y · ALTA

**AutoCAD:** F11 adquiere un punto y a partir de ahí puedo rastrear **por
cualquiera de los ángulos polares** (0, 30, 45, 90…), y puedo cruzar dos
vectores de rastreo para caer en su intersección. Con `POLARMODE` puedo además
medir el ángulo **relativo al último segmento**.

**Valle hoy:** `precision-tracking.ts:44-72` alinea el cursor a la `x` o a la
`y` de los puntos adquiridos. Nada más. No hay rayo a 30°, no hay cruce de dos
rayos, no hay ángulos polares adicionales (`draft-settings-host.ts:113` guarda
**un** `polarStep`), no hay medida relativa al último tramo.

**Por qué duele:** una cubierta a dos aguas, una escalera compensada, un
estacionamiento a 60°: todo lo que no es ortogonal se dibuja con auxiliares.

**Coste:** varios días. **Cómo se construye:** `trackFromAcquiredPoints` recibe
la lista de ángulos activos y, por cada punto adquirido y cada ángulo, propone
un rayo; el candidato es el pie de la perpendicular del cursor sobre el rayo más
cercano dentro de tolerancia. Con dos rayos dentro de tolerancia, el candidato
es su intersección (que es exactamente `apparentIntersection` de
`snap-engine.ts:126-136`, ya escrita). Los ángulos adicionales son un
`readonly number[]` en `CadDraftSettingsSnapshot` y su fila en el cuadro
DSETTINGS. `POLARMODE` ya existe como variable de sistema
(`system-variables.ts`), sólo falta que alguien la lea.

**Cómo se verifica:** spec puro con un punto adquirido, ángulo 30, cursor a 29,4°
→ engancha; a 34° → libre. Golden con la guía visible y el punto resultante
afirmado en el documento.

---

### H-07 · TRIM sin valla, BREAK sólo sobre línea · ALTA

**AutoCAD:** `TRIM` acepta `Valla` (arrastro una línea y recorto todo lo que
cruza), `Captura`, y el modo `Arista → Extender` para recortar contra un límite
que no llega. `BREAK` parte cualquier curva, y `BREAKATPOINT` la parte sin hueco.

**Valle hoy:** `engine/commands/modify-edges.ts` ofrece **una** palabra clave:
`Todos` (`:59`). Sin valla, sin captura, sin modo arista. El propio módulo
declara que `BREAK` «sigue admitiendo sólo LINE» (`:30-33`) y que SPLINE se
rechaza por su nombre.

**Por qué duele:** limpiar los cruces de una retícula de ejes son treinta clics
en vez de una valla. Y partir el círculo de un tanque para meter la acometida
—o partir la polilínea de un muro para el hueco de una puerta— no se puede.

**Coste:** un día la valla; varios días BREAK general.
**Cómo se construye:** la valla ya está: `native-selection-index.path(points,
"fence")` existe y funciona. Sólo hay que añadir la palabra clave `Valla` al
paso de recorte, recoger dos o más puntos y aplicar `computeCadCurveTrim` a cada
entidad que devuelva la valla, con el punto de corte = el cruce valla-entidad.
`BREAK` sobre curva: `curve-edit.ts` ya sabe cortar por parámetro; partir un
círculo produce **un arco**, y eso es exactamente lo que hay que devolver
—decidido, no disimulado—.

**Cómo se verifica:** golden que dibuje una retícula 5×5, arrastre una valla y
afirme que el documento del servidor tiene los cinco tramos recortados **en un
solo paso de deshacer**.

---

### H-08 · No hay calculadora, ni aritmética en la casilla de entrada · MEDIA

**AutoCAD:** `QUICKCALC` (o `'CAL` transparente) me da distancia entre dos
puntos, conversión de unidades, y sobre todo **aritmética dentro de una petición
de punto**: `@(3.60/2),0`.

**Valle hoy:** grep de `QUICKCALC` y `CAL` en `apps/web/src`: cero.
`parseCoordinate` acepta números y medidas, no expresiones
(`precision-input.ts:83-93`); `parseCadDynamicScalar` tampoco
(`dynamic-input.ts:49-64`).

**Por qué duele:** «la mitad del claro», «el paño menos el recubrimiento», «tres
tramos de 0,28». Hoy saco la calculadora del teléfono y escribo el resultado, y
cuando el claro cambia no queda ni rastro de de dónde salió el número.

**Coste:** un día para la aritmética; varios días para la paleta.
**Cómo se construye:** un evaluador puro
`lib/cad/calc/expression.ts` — `+ - * / ( ) ^`, sin identificadores ni acceso al
ámbito, con las medidas de `units-imperial.ts` como literales— llamado por
`num()` de `precision-input.ts` y por `parseCadDynamicScalar` **antes** de
rendirse. Con eso `@(3600/2),0` funciona en los dos analizadores a la vez. La
paleta `QUICKCALC` es después: un comando transparente que abre un panel y cuyo
botón «pegar en el comando» escribe en la línea.

**Cómo se verifica:** spec del evaluador con corpus hostil (división por cero,
paréntesis desbalanceados, `1/0`, inyección `constructor`); spec de la tubería
con `@(10+5)<45`.

---

### H-09 · El aparato de acabado de la acotación · MEDIA

**AutoCAD:** `DIMSPACE` (igualar separación de una cadena), `DIMBREAK` (cortar
la línea de cota donde cruza otra), `DIMJOGGED` (radio quebrado para un radio
grande), `DIMREASSOCIATE`/`DIMDISASSOCIATE`, `DIMTEDIT` (mover el rótulo con
Inicio/Fin/Ángulo), `DIMOVERRIDE`, `DIMCENTER`/`CENTERMARK`/`CENTERLINE`.

**Valle hoy:** de todos ellos existen `DIMEDIT` y, en el panel,
`cad-dimension-reassociate` (`Layout3DEditor.tsx:16777`). Grep de `DIMSPACE`,
`DIMBREAK`, `DIMJOGGED`, `DIMTEDIT`, `DIMOVERRIDE`, `DIMCENTER`, `CENTERMARK`,
`CENTERLINE`, `DIMREASSOCIATE`: **cero**. `dimensionKind` no contempla `jogged`
(`cad-document.ts:177`) y no hay entidad ni campo de marca de centro.

**Por qué duele:** una cadena de cotas de fachada sale con los rótulos pisándose
y las líneas cruzándose. Lo arreglo a mano moviendo cada `textPosition` con un
grip, cota por cota. En AutoCAD son dos comandos.

**Coste:** varios días. **Cómo se construye:** `DIMSPACE` y `DIMBREAK` son puros:
`buildCadDimensionGeometry` ya devuelve la geometría de cada cota, así que
igualar `offset` en una cadena es aritmética sobre el conjunto designado, y
cortar es una lista de huecos (`gaps?: Array<[number, number]>`) en el esquema
de la cota, consumida por el mismo constructor. La marca de centro es una
entidad nueva o —más barato y sin tocar el formato— dos líneas en la capa
`DEFPOINTS` emitidas por `DIMCENTER` con su metadato de origen.

**Cómo se verifica:** spec que mida la separación de las tres cotas de una
cadena antes y después de `DIMSPACE`; golden que cruce dos cotas y afirme el
hueco en la geometría que llega al render.

---

### H-10 · La tabla es una rejilla de texto · MEDIA

**AutoCAD:** una TABLE tiene estilos de fila (título, encabezado, datos), relleno
por celda, grosor y color de borde por lado, tipo de celda (texto, bloque,
campo), fórmulas `=SUM(A1:A5)` y vínculo de datos.

**Valle hoy:** `CadTableEntity` (`cad-entities-v4.ts:224-238`) tiene
`rows, columns, rowHeights, columnWidths, cells, rotation, style`, y
`CadTableCell` (`:205-216`) tiene `text, rowSpan, columnSpan, alignment,
textHeight, textStyle`. **Sin relleno, sin borde, sin tipo de celda, sin
fórmula.** La rúbrica ya declara que el estilo de tabla no gobierna el render.

**Por qué duele:** el cuadro de puertas y ventanas y el de acabados salen sin
sombreado de encabezado y sin totales. Los sumo a mano y quedan desfasados en
cuanto cambia una fila.

**Coste:** varios días. **Cómo se construye:** ampliar `CadTableCell` con
`fill?: string` y `borders?: { top?, right?, bottom?, left? }` (opcionales:
ausencia = lo que dicte el estilo), y `TABLESTYLE` pasa a llevar los tres
`rowStyles`. La fórmula es un campo `formula?: string` evaluado por el mismo
evaluador de H-08 con referencias `A1` resueltas contra `cells` — y guardando el
**resultado** en `text`, para que un consumidor que no sepa de fórmulas siga
leyendo el número.

**Cómo se verifica:** spec de evaluación con referencia circular declarada;
golden que afirme el relleno del encabezado en los bytes del PDF.

---

### H-11 · No hay propiedades rápidas ni FIND · MEDIA

**AutoCAD:** `Ctrl+1` es la paleta completa, pero lo que uso al vuelo son las
**propiedades rápidas** (un cuadrito junto al cursor con las cuatro propiedades
del objeto designado) y `FIND` (buscar y reemplazar texto en todo el dibujo, con
opción de reemplazar en atributos y cotas).

**Valle hoy:** grep de `quick-propert`, `QuickProperties`, `propiedades rápidas`:
cero. Grep de `FIND`, `SPELL`, `SCALETEXT`, `JUSTIFYTEXT`: cero (sí existen
`TEXTALIGN` y `TCOUNT` de Express Tools).

**Por qué duele:** cambiar la capa de un objeto son cuatro clics hasta la paleta
lateral. Y cuando el cliente cambia el nombre del proyecto, tengo que abrir cada
rótulo a mano.

**Coste:** un día `FIND`; un día las propiedades rápidas.
**Cómo se construye:** `FIND` es un comando de motor que recorre `entities`,
lee el texto de los tipos que lo tienen —`text`, `mtext`, `mleader`, `dimension`
(el override), `table.cells`, atributos de `insert`— y emite un lote de
`properties`. Un solo paso de deshacer. Las propiedades rápidas son el panel que
ya existe (`CadEntityPropertiesPanel`) montado como popover anclado al último
punto designado, con las cuatro claves que el adaptador marque como rápidas.

**Cómo se verifica:** golden que reemplace «ANTEPROYECTO» por «EJECUTIVO» en un
plano con el texto en un rótulo, un atributo y una celda, y afirme los tres en
el documento del servidor con **un** Ctrl+Z de vuelta.

---

### H-12 · Los pinzamientos no giran, no escalan, no reflejan, no copian · MEDIA

**AutoCAD:** designo un objeto, pincho un grip (queda caliente) y la barra
espaciadora cicla **ESTIRAR → DESPLAZAR → GIRAR → ESCALA → SIMETRÍA**, cada uno
con `Punto base`, `Copiar` y `Referencia`. Con Mayús pincho varios grips y los
estiro juntos.

**Valle hoy:** `CadGripActionKind` es `stretch | move | add-vertex |
remove-vertex | to-arc | to-line | radius` (`grip-actions.ts:43-50`). No hay
girar, escalar, reflejar, ni `Copiar`, ni `Punto base`, ni varios grips calientes
a la vez. La barra espaciadora cicla el menú multifuncional, que es una función
DISTINTA y también buena — pero ocupa el gesto de la otra.

**Por qué duele:** girar un bloque de mobiliario 15° sin salir a `RO`, o estirar
tres vértices de un muro a la vez.

**Coste:** varios días. **Cómo se construye:** el menú multifuncional se queda
en `Ctrl` (que es donde AutoCAD lo puso) y la barra espaciadora recupera el
ciclo de modos. Los cinco modos son transformaciones que `entity-commands.ts` ya
sabe aplicar (`transform`), así que el trabajo está en el controlador
(`native-grip-controller.ts`), no en el dominio. Varios grips calientes = un
`Set<string>` en vez de un `gripId` en el estado del controlador.

---

### H-13 · Los conmutadores de la barra de estado son tres de nueve · MEDIA

**AutoCAD:** la barra de estado lleva `FORZC · REJILLA · ORTO · POLAR · REFENT ·
RASTREO · SCU DIN · DIN · GLN · TRANSPARENCIA · PROPIEDADES RÁPIDAS · escala de
anotación`, todos a un clic, todos con su estado visible.

**Valle hoy:** `CadDraftStatusBar.tsx:57-76` muestra **tres**: `OSNAP`, `ORTHO`
y `POLAR`, más el selector de incremento polar. `F7`, `F9`, `F11` y `F12`
funcionan por teclado (`keyboard-shortcuts.ts:180-200`) pero **no tienen botón**:
la rejilla y el forzado viven dentro del cuadro DSETTINGS
(`CadDraftSettingsDialog.tsx:282-298`) y la entrada dinámica y el OTRACK no
tienen indicador ninguno. Un usuario de ratón no ve si el rastreo está
encendido. El selector de escala de anotación **sí** está en la barra
(`CadStatusBar.tsx:304`), y eso está bien.

**Coste:** horas. **Cómo se construye:** cuatro entradas más en el array
`toggles` de `CadDraftStatusBar.tsx`, con el mismo `data-testid` por familia y
`aria-pressed`. No toca dominio.

**Cómo se verifica:** ampliar el golden 61 (cinta sólo con ratón) para que
encienda rejilla, forzado, OTRACK y entrada dinámica desde la barra y afirme el
estado.

---

### H-14 · Teclear un ángulo ignora ANGBASE, ANGDIR y AUNITS · MEDIA

**AutoCAD:** si `UNITS` está en topográfico, `DIST` me informa `N 45d0'0" E` y
puedo **teclear** eso mismo. `ANGBASE` y `ANGDIR` valen para leer y para
escribir.

**Valle hoy:** `unit-angle.ts:52-113` convierte el ángulo del mundo al sistema
del usuario con `ANGBASE` y `ANGDIR` **para informar** (`inquiry/reports.ts:12`
lo dice). Pero `parseCoordinate` no recibe ninguna de las dos: `angleNum` es un
`Number()` seco (`precision-input.ts:95-98`) y `ParseContext` no tiene campo para
ellas. Con `ANGDIR 1` en un plano de topografía, lo que `DIST` me dice y lo que
puedo teclear son dos cosas distintas — y el punto cae en el sitio equivocado
**sin ningún aviso**.

**Por qué duele:** es una pérdida silenciosa de precisión, que es justo lo que
la fila de integridad no tolera.

**Coste:** un día. **Cómo se construye:** `ParseContext` gana `angleBase`,
`angleDirection` y `angleUnits`; `angleNum` delega en un
`parseUserAngle(texto, sistema)` que es el inverso de `formatAngle` y que sabe
leer `45d30'`, `45.5g`, `1.2r` y `N 45d0'0" E`. `input-pipeline.ts:228` los
pasa desde `context`, igual que ya pasa `drawingUnit`.

**Cómo se verifica:** spec de ida y vuelta: para cada sistema de `AUNITS`,
`parseUserAngle(formatAngle(θ)) === θ` a 1e-9. Es un spec de propiedad, no de
casos.

---

### H-15 · Detalles que se notan pero no bloquean · BAJA

- **`TEXT` tiene tres justificaciones** —Izquierda, Centro, Derecha
  (`annotate-text.ts:66-68`)— de las quince de AutoCAD. Falta sobre todo
  `Ajustar` (el rótulo que se aprieta entre dos paños) y `Medio`.
- **La matriz no es un objeto.** `ARRAY` guarda su parentesco en
  `context.metadata` y `ARRAYEDIT` rehace las copias
  (`modify-array.ts:1-23`), lo cual está bien pensado y bien declarado; lo que
  no hay es grips sobre la matriz para cambiar filas y columnas arrastrando, ni
  regeneración al editar el original —el propio módulo lo dice—.
- **`MLEADER` no admite contenido de bloque.** `contentType` es `"text" |
  "mtext"` (`cad-document.ts:332`), así que la burbuja de detalle con su número
  dentro de un símbolo no sale por esta puerta (sale por `BALLOON`, que es del
  toolset mecánico). Tampoco hay `MLEADEREDIT`, `MLEADERALIGN` ni
  `MLEADERCOLLECT`, aunque el esquema **ya** guarda varias `leaderLines`.
- **`LAYMCUR` («hacer actual la capa del objeto») no existe.** Hay `LAYMCH`,
  `LAYISO`, `LAYFRZ`, `LAYWALK` y ocho más, pero no el botón que más se pulsa.
  Tampoco `ISOLATEOBJECTS`/`HIDEOBJECTS`, que son de 2011 y ya no se sueltan.
- **`MLINE`/`MLSTYLE`/`MLEDIT` no existen.** Aquí lo perdono: `WALL` cubre el
  caso real mejor que MLINE, y eso está bien decidido.

---

## 4. Defectos del código, con fichero y línea

### D-01 · `snap-engine.ts:183` — el tope de segmentos recorta los PRIMEROS, no los más cercanos

```ts
const segs = (scene.segments ?? []).slice(0, maxSeg);
```

El anfitrión pasa `maxSegments: 96` (`Layout3DEditor.tsx:6578`). La escena se
construye en dos tandas: primero las aristas de hasta 48 cajas del editor
(`cadSnapSceneFromBoxes`, `snap-scene.ts:90` — **4 aristas por caja, hasta 192
segmentos**), y sólo después los tramos de las entidades canónicas
(`cadSnapSceneAddEntities`). Con 24 o más cajas cerca del cursor, el `slice(0,
96)` **consume el presupuesto entero en cajas** y ni un solo tramo de geometría
real llega a `nearest`, `intersection`, `apparent-intersection` ni `extension`.
Sin cajas ninguna, cinco polilíneas de veinte vértices ya lo agotan.

No es el tope lo que está mal —el coste O(n²) es real y está bien razonado en
`snap-scene.ts:41-48`— es que el recorte **no está ordenado por distancia al
cursor**. El `BACKLOG` lo tiene como P2-1 («techos silenciosos de snap») pero lo
clasifica como técnico y no como mentira al usuario; leído el orden de
construcción, sí lo es: el imán deja de existir sin decirlo.

**Arreglo:** ordenar los candidatos por distancia mínima al cursor antes de
recortar (`segs.sort` sobre el punto más cercano del tramo, que ya lo calcula
`nearestOnSegment`), y —o— pasar el recorte a `cadSnapSceneAddEntities`, que sí
sabe la distancia. Coste: horas.

### D-02 · `native-selection-index.ts:201-214` — `search(bounds, 48)` devuelve las 48 primeras del R-tree, no las 48 más cercanas

```ts
for (const id of this.spatialIndex.search(bounds)) {
  ...
  if (result.length >= limit) break;
}
```

`hitTest` sí ordena por distancia (`:237-241`); `search` no. El llamador del
OSNAP (`Layout3DEditor.tsx:6510-6520`) pide `search(±4·tol, 48, "snap")`, así
que en una zona densa **las 48 entidades que alimentan el motor de captura son
arbitrarias**, en orden de índice espacial. La entidad que está justo bajo el
cursor puede quedar fuera. Mismo arreglo que D-01: ordenar antes de recortar, o
recortar por radio y no por conteo.

### D-03 · `entity-runtime.ts:81-86` — `CadSnapKind` no tiene `midpoint`, `node`, `insertion` ni `geometric-center`

Causa raíz de todo el §2. El tipo tiene cinco valores y el motor de captura
tiene catorce modos; el puente de `snap-scene.ts:199-206` sólo puede repartir lo
que le llega. Consecuencias medidas, cada una con su línea:
`basic-native-adapters.ts:54` (medio de línea → `center`),
`basic-native-adapters.ts:89-92` (círculo sin tangente),
`polyline-entity-adapter.ts:325-329` (medio de tramo → `control` → nodo),
`point-line-adapters.ts:165` (POINT → `endpoint`),
`block-text-adapters.ts:459` (inserción de INSERT → `endpoint`),
`wall-entity-adapter.ts:290` (medio del eje de muro → `center`),
`annotation-v4-adapters.ts:116,143,303` (inserciones → `endpoint`).

**Riesgo de integridad, no sólo de comodidad:** `CadDraftSettingsDialog.tsx:24-39`
ofrece las catorce casillas y `defaultCadOsnapModes()`
(`draft-settings-host.ts:71-75`) las enciende todas menos `grid`. El producto
promete un imán que no tiene servidor. Eso es lo que fix-or-hide prohíbe.

### D-04 · `snap-engine.ts:205-207` — la perpendicular diferida no existe

```ts
if (enabled(modes, 'perpendicular') && opts.from) { … }
```

Sin `from` no hay candidato. En AutoCAD, `PER` como **primer** punto de una
línea es legal: se difiere hasta conocer el segundo. Aquí el modo simplemente no
aparece hasta que hay ancla. No es un error de cálculo, es una funcionalidad
ausente en el sitio donde se vería.

### D-05 · `dynamic-input.ts:19` + `Layout3DEditor.tsx:16137` — la entrada dinámica pierde la unidad del dibujo

`CadDynamicInputContext.documentUnit` sólo admite `'mm' | 'm'`, y el editor
colapsa todo lo demás a `"mm"`. El documento sí sabe de `cm`, `in` y `ft`
(la cota los declara: `cad-document.ts:186`). Resultado: en un dibujo en
pulgadas, la casilla flotante interpreta `24` como 24 mm mientras la línea de
comandos lo interpreta como 24 unidades de dibujo. **Dos analizadores para la
misma pregunta**, con `parseCadDynamicScalar` (`dynamic-input.ts:49-64`)
duplicando —y empeorando— lo que `units-imperial.ts` ya resuelve bien.

### D-06 · `precision-input.ts:95-98` — el ángulo tecleado ignora el sistema angular del dibujo

`angleNum` es `Number(s.trim())`. `ANGBASE`, `ANGDIR` y `AUNITS` existen como
variables (`system-variables.ts:107-108`) y `unit-angle.ts` las respeta al
FORMATEAR. Al LEER, no. Ver H-14: es una pérdida silenciosa.

### D-07 · `snap-scene.ts:178-190` — sólo `line` aporta punto medio y pie de perpendicular

El comentario justifica la restricción por las cuerdas de teselado de un arco, y
para los arcos tiene razón. Pero se aplica también a los **tramos rectos de una
polilínea**, que sí son aristas del dibujo y que el adaptador sabe distinguir
por su `bulge`. La condición correcta no es `entity.type === "line"` sino
«el tramo no procede de teselar una curva».

### D-08 · `annotative-scale.ts:113` — `mleader` no está entre los tipos con altura anotativa

```ts
const HEIGHT_BEARING_TYPES = new Set(["mtext", "text", "attdef"]);
```

Una directriz marcada anotativa cae en `skippedEntityIds`. El módulo lo declara
honradamente («se dicen, no se ocultan»), así que no es una mentira — pero es el
tipo más anotativo del plano y el esquema ya tiene `textHeight`
(`cad-document.ts:334`). Una línea y su spec.

### D-09 · `snap-engine.ts:213-231` — doble bucle O(n²) por movimiento de ratón, dos veces

`intersection` y `apparent-intersection` recorren cada uno los ~4.600 pares de
96 segmentos, en cada `pointermove`. Sumado a la reconstrucción completa de la
escena por movimiento (`Layout3DEditor.tsx:6498-6535`), es el candidato natural
del 1,4 fps de paneo que la fila de rendimiento ya registra. Un barrido de línea
o simplemente indexar los tramos en una rejilla del tamaño de la tolerancia
—que ya existe: `native-selection-index`— lo baja a lineal.

---

## 5. La apuesta ganadora

**La matriz de captura viva: los catorce modos × los once tipos de entidad,
publicada en el producto, medida por un gate, y visible para el usuario.**

Es la única cosa de esta dimensión que, bien hecha, hace que alguien PREFIERA
Valle Design a AutoCAD en vez de tolerarlo.

Y no es un capricho de auditor. Es lo que un CAD de navegador puede hacer y
AutoCAD no:

En AutoCAD, cuando `MED` no imanta sobre un objeto, no hay forma de saber si es
porque el modo está apagado, porque el objeto es un proxy de un vertical que no
tengo instalado, porque está en una capa bloqueada, porque `APERTURE` es
demasiado pequeña o porque ese tipo simplemente no tiene punto medio. Llevo
veinte años adivinando. La respuesta oficial de Autodesk es «regenera y prueba».

Aquí, el adaptador de cada entidad **ya declara** qué puntos ofrece
(`entity-runtime.ts:163`, `snaps(entity, cursor)`), y ese registro ya es la
fuente única para QSELECT (`selection/selection-filter.ts:1-22`), para las
propiedades y para el render. Eso significa que la matriz **se puede generar**,
no escribir: 14 × 11 casillas, cada una `resuelve` / `no aplica` / `todavía no`,
igual que `build-command-manifest.mjs` genera el manifiesto de comandos y
`--check` lo verifica. De ahí salen tres cosas a la vez, y las tres son
producto, no documentación:

1. **El cuadro DSETTINGS deja de ofrecer lo que no sirve.** Una casilla de un
   modo sin servidor sale deshabilitada con su motivo. Fix-or-hide aplicado al
   imán.
2. **El HUD dice por qué NO imantó.** Cuando el cursor está sobre una entidad y
   ningún candidato cae dentro de la apertura, el rótulo dice «polilínea ·
   MED apagado» o «polilínea · MED todavía no sobre este tipo» en vez de callarse.
   Ningún CAD de escritorio hace esto, y es trivial cuando el motor es puro y la
   escena se reconstruye cada frame.
3. **El gate no deja retroceder.** Una casilla que pasa de `resuelve` a `no` sin
   tocar la matriz rompe la corrida. La precisión deja de ser una promesa de la
   documentación y pasa a ser un invariante ejecutable — que es exactamente lo
   que este repositorio ya hace con los comandos, con los alias y con las
   pérdidas de DXF, y que a la captura todavía no se le ha aplicado.

El día que esa matriz esté verde en las catorce filas, **el imán de Valle Design
es demostrablemente más completo que el de AutoCAD, y además se puede auditar**.
Ese día el argumento de venta deja de ser «también tenemos OSNAP» y pasa a ser
«el nuestro está probado casilla por casilla y el suyo no».

Lo que hoy está a un día de distancia (D-03, once líneas y su spec) es lo que
sostiene esa apuesta. Empezaría por ahí.

---

## 6. Orden en que yo lo haría

| # | Trabajo | Coste | Desbloquea |
|---|---|---|---|
| 1 | D-03 · Ampliar `CadSnapKind` y corregir los once adaptadores | 1 día | H-01, la matriz, el §2 entero |
| 2 | D-01 + D-02 · Ordenar por distancia antes de recortar | horas | Que el imán no desaparezca en zona densa |
| 3 | H-02 · `DESDE`, `M2P`, `TT`, `PAR` | 2-3 días | La mitad de las capturas del día |
| 4 | H-04 · OFFSET con lado y con arcos | 1 + 3 días | El tercer comando más usado |
| 5 | H-03 · Entrada dinámica en todos los comandos | 2-3 días | Dejar de mirar abajo |
| 6 | H-13 · Los conmutadores que faltan en la barra | horas | Reconocimiento a los cinco minutos |
| 7 | H-08 · Aritmética en los dos analizadores | 1 día | La mitad de `QUICKCALC`, gratis |
| 8 | H-06 · Rastreo polar desde puntos adquiridos | 2-3 días | Todo lo que no es ortogonal |
| 9 | H-07 · Valla en TRIM, BREAK sobre curva | 1 + 3 días | Limpiar una retícula |
| 10 | H-05 · Anotativa por lista de escalas | semanas (toca formato) | La lámina con general y detalle |

Y una tarea de cero código: **refrescar los dos gaps caducos de la rúbrica**
(F7/F9/F12 en `draw-2d`, `BE`/`BLE` en `command-line`) y **afilar el criterio
`draw-2d.osnap`** para que mida los catorce modos sobre los once tipos y no sólo
que la consulta esté indexada. Hoy la fila vale 16/16 con `MED` muerto sobre
polilínea; con el criterio afilado valdría 12/16, que es la verdad, y volvería a
16 cuando la matriz esté verde. Bajar una nota para poder subirla con evidencia
es más honesto que mantenerla alta con un criterio que no mira donde duele.
