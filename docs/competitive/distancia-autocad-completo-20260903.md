# La distancia real contra AutoCAD completo — 3 de septiembre de 2026

Re-medición del informe del 1 de septiembre
(`distancia-autocad-completo-20260901.md`) **con el mismo método y sobre el
mismo eje**: contra AutoCAD completo (no LT) y sus siete toolsets, contando
por lo que FALTA. Entre las dos mediciones se fusionó el PR #176 (Tarea 0 +
Olas A–I), así que casi todo lo que cambia aquí lo cambió ese trabajo.

Lo que sí cambia respecto del 1 de septiembre es el INSTRUMENTO. Aquella
medición fue a mano, leyendo código y ejecutando comandos en una consola: era
correcta y no se podía repetir. Ahora la parte mecánica —qué comandos existen
de verdad, qué ofrece de verdad el primer prompt de los que el informe citó,
cuántos sombreados producen trazados distintos, cuántas ranuras admite un tipo
de línea, y los cinco reflejos de navegador— la produce
`scripts/cad/distancia-probe.mts`, que se corre así:

```
node --import tsx scripts/cad/distancia-probe.mts --resumen
```

El JUICIO sigue siendo humano: el porcentaje de un área no es su cobertura de
comandos. Lo que la sonda garantiza es que la ola siguiente juzgue sobre el
mismo inventario, y que un número que se mueva se pueda atribuir al producto y
no a la generosidad de quien mide.

## Los nueve números, HOY contra el 1 de septiembre

| Área | 2026-09-01 | 2026-09-03 | Δ |
| --- | ---: | ---: | ---: |
| Dibujo y modificación 2D — el trabajo diario | 55 % | **78 %** | +23 |
| Anotación: cotas, textos, tablas, cuadros de cantidades | 30 % | **60 %** | +30 |
| Capas, estilos, plantillas y estándares de despacho | 45 % | **65 %** | +20 |
| Bloques, atributos, referencias externas y datos | 30 % | **42 %** | +12 |
| Publicación: láminas, impresión a escala, PDF, intercambio DWG/DXF | 40 % | **52 %** | +12 |
| Modelado 3D: sólidos, superficies, edición de caras | 20 % | **40 %** | +20 |
| De 3D a documentación: secciones, vistas y plantas derivadas | 30 % | **33 %** | +3 |
| Los siete toolsets especializados | 6 % | **29 %** | +23 |
| Automatización, personalización y API | 30 % | **40 %** | +10 |

Y la rúbrica del repo, que mide otra cosa y hay que citar con su etiqueta:
**HOY 175/197 (88,8 %)** —flujo diario de dibujo 2D técnico— y **DESTINO
225/271 (83 %)** —AutoCAD completo—, `node scripts/cad/rubric.mjs`. El
«88,6 %» heredado se midió con la rúbrica ANTERIOR, de denominador 197 y sin
las filas de toolsets; citarlo sin decirlo es la trampa que el informe del 1
de septiembre puso por escrito y que aquí se respeta.

## Lo que la sonda mide, sin interpretar

Registro: **243 comandos**, 183 alias, 0 alias sin resolver. Tres comandos más
(`APPLOAD`, `LISPCON`, `VLIDE`) los fabrica el runtime LISP al montar el
estudio y no están en el registro estático; la sonda los declara para no
cantarlos como ausentes.

| Área | Vocabulario de referencia | Presentes | Cobertura |
| --- | ---: | ---: | ---: |
| Dibujo y modificación 2D | 50 | 43 | 86,0 % |
| Anotación | 38 | 27 | 71,1 % |
| Capas, estilos y estándares | 31 | 27 | 87,1 % |
| Bloques, atributos y referencias | 32 | 21 | 65,6 % |
| Publicación | 22 | 14 | 63,6 % |
| Modelado 3D | 35 | 28 | 80,0 % |
| De 3D a documentación | 11 | 4 | 36,4 % |
| Toolsets | 42 | 21 | 50,0 % |
| Automatización y personalización | 12 | 5 | 41,7 % |

Sombreado: **24 patrones, 23 trazados distintos**. Tipos de línea: **16
definiciones, hasta 6 ranuras, 7 con texto**. Los prompts citados el 1 de
septiembre, tal y como salen hoy de `begin()`:

```
CIRCLE     [3P/2P]              OFFSET   []          DIVIDE  []
ARC        [Centro]             MEASURE  []          EXPLODE []
HATCH      [Objetos/Patrón/ánGulo/Escala/Islas/Sólido/Tolerancia]
PLOT       [Presentación/EXtensión/Ventana/LÍmites/ESCala/Previa/Trazar]
SOLIDEDIT  [Cara/Arista/cUerpo/Salir]  TRIM [Todos]
PEDIT []   ARRAY []   EXTRUDE []   PUBLISH []   BEDIT []   XATTACH []
```

Y los cinco reflejos, contados sobre `apps/web/src/components/cad`:

| Reflejo | Medido |
| --- | --- |
| Zoom hacia el cursor (`zoomToCursor`) | **0 apariciones** — sigue en el defecto `false` de OrbitControls |
| Inercia de cámara (`enableDamping = true`) | **1** — sigue encendida |
| Doble clic para editar | **0 manejadores** |
| Selector de escala de anotación en la barra de estado | **0** |
| Icono por comando en la cinta | **0** — hay uno por PANEL (`ribbon-icons.ts`), no por comando |

Los cinco son el encargo de la Ola 1 y siguen exactamente donde el informe
anterior los dejó.

## Área por área: qué se movió y qué no

### Dibujo y modificación 2D — 55 % → 78 %

Se conservan las cuatro cubetas del 1 de septiembre y sus pesos (45 / 20 / 20 /
15), para que la comparación signifique algo.

**(1) Geometría propia, 85 % → 86 %.** Casi nada se movió y se dice: `CIRCLE`
sigue ofreciendo sólo `[3P/2P]` (sin Ttr ni Ttt), `OFFSET` sigue saliendo con
`[]`, `DIVIDE` y `MEASURE` siguen sin la opción Bloque, `MLINE` y `SKETCH`
siguen sin existir, y `EXPLODE` sigue tratando cuatro tipos —polilínea,
inserción, cota y directriz (`modify-join.ts:409-490`)— y dejando fuera HATCH,
MTEXT, TABLE, REGION y WIPEOUT.

**(2) Que el dibujo SE LEA como un plano, 35 % → 80 %.** Es el salto grande, y
es medible: donde todos los patrones de sombreado producían el mismo trazado,
hoy hay 24 patrones con 23 firmas de familia distintas
(`hatch-pattern-table.ts`); donde los tipos de línea eran un par trazo/hueco,
hoy hay 16 definiciones de hasta 6 ranuras y 7 con TEXTO incrustado
(`linetype-lin.ts`, `linetype-complex.ts`); y donde la pantalla sólo rotulaba
el MTEXT, hoy `render/text-requests.ts` produce rótulos para seis clases
—mtext, text, attdef, dimension, mleader y table—, que era el defecto que hacía
que 200 rótulos de local se dibujaran como 200 rectángulos vacíos. Lo que
falta para cerrar la cubeta es la letra IMPRESA: las cinco `.shx` comunes se
mapean a trazos Hershey de dominio público (`fonts/hershey-fonts.ts`), pero
`cadHersheyTextStrokes` sólo lo consume el camino heredado
(`entity-three.ts:108`) — el pipeline por lotes rasteriza por atlas y el PDF
sigue con las base-14.

**(3) Trabajo ajeno, 15 % → 85 %.** La Ola D lo cerró y está probado por
navegador: HPGAPTOL y `Tolerancia` en HATCH/BOUNDARY/JOIN, la distancia de
aproximación en PEDIT Juntar, el portapapeles canónico completo, SELECTSIMILAR,
ADDSELECTED, XPLODE, SETBYLAYER, CHPROP y NCOPY. La prueba de despacho que
fallaba en el primer paso es hoy el golden 74, con oráculo en papel
(92.840.000 mm² y 46.297 mm).

**(4) Reflejos de la línea de comandos, 45 % → 45 %.** Sin cambio, y es el que
más se nota: `U`, `UNDO`, `REDO` y `OOPS` **siguen sin estar en el registro**
(medido). El renglón 10 de la prueba de los diez segundos sigue reprobado.

`0,45×86 + 0,20×80 + 0,20×85 + 0,15×45 ≈ 78 %`.

### Anotación — 30 % → 60 %

Lo que bajaba el número era el acto central: acotar y no ver la cota. Eso está
resuelto en pantalla —las seis clases de arriba— y ya estaba resuelto en la
lámina. Se suman DIMSTYLE con subestilos por familia y DIMTOLERANCE con
ajustes ISO 286 (Ola I).

Lo que sigue abierto, medido contra el registro: SPELL, SCALETEXT,
JUSTIFYTEXT, DIMJOGGED, DIMSPACE, DIMBREAK, DIMTEDIT, TABLEDIT, FIELD,
HATCHEDIT, ANNOTATIVE, FIND, MLEADEREDIT, OBJECTSCALE, ANNORESET,
SCALELISTEDIT, DIMREASSOCIATE, TINSERT, TABLEXPORT y DATALINK. Y sigue la
prueba de despacho textual del área: `layout/annotative-scale.ts` marca cada
entidad como `decided` en la PRIMERA ventana que la ve, así que el mismo
rótulo no puede salir a 1:50 y a 1:100 en la misma hoja. Ésa es la
anotatividad que la Ola 1 desbloquea con el selector de escala.

### Capas, estilos, plantillas y estándares — 45 % → 65 %

De los tres frenos del 1 de septiembre, uno cayó entero: los tipos de línea se
dibujan y se imprimen (16 definiciones, `plot-linetype-pattern.spec.ts`), así
que un plano ya distingue un eje de un muro. Los otros dos siguen:

- El despacho todavía no puede cargar su `.ctb`: el puente
  `plotStyleTables?()` existe en `components/cad/command-line/plot-host.ts:42`
  y **sólo lo aportan las specs** — ningún anfitrión del estudio lo pasa.
- El estándar PROPIO sigue sin poder definirse: 149 plantillas, todas de
  fábrica y ninguna guardable. Faltan además LAYLCK, LAYULK, LAYDEL y LAYCUR.

### Bloques, atributos, referencias externas y datos — 30 % → 42 %

Se movió por dos cosas: IMAGEATTACH/IMAGECLIP/IMAGEADJUST hacen que se pueda
referenciar algo que no es un documento Valle (Ola H), y DATAEXTRACTION dejó de
contar sólo muros y huecos. Sigue todo lo demás, verificado:

- El DWG no entra: `DWG_IMPORT_FLAG = false` (`dwg-interop-flag.ts:38`).
- `XATTACH` sigue sin poder adjuntar: **ningún componente aporta
  `xrefCatalog`** (cero apariciones en `.tsx`). Es P1-2 del BACKLOG.
- `BEDIT` sigue siendo una puerta al panel, no un editor en sitio (P1-3).
- Los bloques dinámicos siguen sin parámetros: **0 apariciones** de
  BPARAMETER, BACTION o BTABLE en todo `apps/web/src`.
- Siguen ausentes REFEDIT, BATTMAN, ATTSYNC, ATTDISP, MINSERT, ATTEXT,
  DESIGNCENTER, PDFATTACH, COUNT, BCOUNT, ATTIN, ATTOUT, XOPEN y la paleta de
  bloques.

### Publicación — 40 % → 52 %

Sube por lo que la lámina ahora IMPRIME bien (sombreados distintos, tipos de
línea con y sin texto). No sube más porque los tres frenos de la entrega
siguen intactos y los tres están medidos:

- `PUBLISH` y `SHEETSET` siguen sin conjunto: el puente `sheetSet()` de
  `plot-host.ts` sólo aparece en su spec (P1-8).
- El `.ctb` sigue desconectado (arriba).
- Una lámina sigue sin poder llevar dos escalas de anotación.
- El DXF exportado sigue sin llevar presentaciones; el DWG ni entra ni sale.

### Modelado 3D — 20 % → 40 %

La Ola C puso las ocho primitivas como nodo reeditable, SOLIDEDIT con tres de
sus catorce ramas, y —lo más caro— la cota del punto: ya no todo vive en z=0.
La sonda ve 28 de 35 nombres de referencia.

Los techos siguen, y son de sustancia, no de lista: el kernel sigue siendo
FACETADO (todo constructor termina en `attachPlanarSurfaces`; las superficies
analíticas de `brep/surfaces.ts` no las produce nadie), no hay designación de
ARISTAS (**0 apariciones** de `CAD_ACCEPT_EDGE_PICK`), faltan las seis
transformadas 3D (3DMOVE, 3DROTATE, 3DALIGN, MIRROR3D, 3DARRAY, 3DSCALE), el
mundo de superficies entero, la malla, SECTIONPLANE, THICKEN y
CONVTOSOLID/CONVTOSURFACE. FILLETEDGE y CHAMFEREDGE sí están.

### De 3D a documentación — 30 % → 33 %

Casi sin movimiento, y es deliberado: la Ola C dio 3D que documentar, no
documentación del 3D. Siguen SOLVIEW, SOLDRAW, SOLPROF y FLATSHOT (4 de 11) y
sigue ausente la familia moderna entera: VIEWBASE, VIEWPROJ, VIEWSECTION,
VIEWDETAIL, VIEWEDIT, VIEWUPDATE y SECTIONPLANETOBLOCK. Los ocho defectos
(a)–(h) del informe anterior no los tocó nadie. Es el encargo de la Ola 4.

### Los siete toolsets — 6 % → 29 %

El cambio de fondo: donde había cuatro nombres verticales en el registro, hoy
hay 21 de los 42 del vocabulario de referencia, y `docs/parity/ESCALERA.md`
sitúa cinco toolsets en el peldaño 5 con evidencia de navegador. Por toolset,
contando lo que falta:

| Toolset | 09-01 | 09-03 | Qué lo sostiene / qué falta |
| --- | ---: | ---: | --- |
| Architecture | 20 % | 55 % | WALL/DOOR/WINDOW, STAIR, ROOF, SLAB y los cuadros en la lámina. Faltan escaleras de varios tramos y de caracol, huecos en losa, espacio como objeto, cotas AEC |
| MEP (mitad 2D) | ~5 % | 40 % | PIPE, DUCT, CABLETRAY, MEPSYMBOL y el cuadro de instalaciones. La mitad 3D —ruteo, accesorios, diámetros por especificación— no existe |
| Map 3D | ~5 % | 35 % | GEOGRAPHICLOCATION y MAPIMPORT. Faltan MAPEXPORT, MAPCLEAN, NAD27/NAD83 y todas las zonas UTM de México |
| Raster Design | ~2 % | 35 % | IMAGEATTACH, IMAGECLIP, IMAGEADJUST. Faltan IMAGEFRAME, TRANSPARENCY y la vectorización |
| Mechanical | ~2 % | 40 % | STDPART, STEELSHAPE, BALLOON, BOM, WELDSYMBOL, SURFACESYMBOL, DIMTOLERANCE ISO 286. Faltan AMPOWERDIM, agujeros y su cuadro, cajetines ISO/ANSI/DIN |
| Electrical | 0 % | 0 % | Fuera de alcance hasta hoy. **Entra en la Ola 5** |
| Plant 3D | 0 % | 0 % | Fuera de alcance hasta hoy. **Entra en la Ola 6** |

Media de los siete: **29 %**.

### Automatización, personalización y API — 30 % → 40 %

AutoLISP con consola (APPLOAD, LISPCON), SCRIPT, plugins JS con manifiesto,
TOOLPALETTES y SETVAR. Falta la personalización que un despacho espera y que
hoy no se persiste: CUI y MENU (teclado, cinta y paletas por usuario), MACRO,
DIESEL y la familia ACTRECORD. El puente .NET/VBA sigue declarado fuera con su
razón, en la rúbrica y en la ESCALERA.

## Lo que este informe NO re-midió

Se dice para que nadie lo lea como si lo dijera. No se volvieron a ejecutar
las sondas de: el pipeline de publicación byte a byte (el 1 de septiembre midió
70,000000 mm para un muro de 3,5 m a 1:50), el error de facetado del kernel
(0,161 % sobre un cilindro Ø300), ni las ocho carencias (a)–(h) de «de 3D a
documentación». Se dan por vigentes porque **ningún archivo que las produce
cambió** entre `11fc202` y esta medición, y donde cambió se re-midió y se dice
arriba.

## La prueba de los diez segundos, hoy

El instrumento A del informe anterior, con lo que hoy se puede afirmar sin
ejecutarlo: los renglones 1, 4 y 5 (teclear una orden con el lienzo enfocado)
los desbloqueó `isCommandLineCharacter` (`editor-keyboard.ts:89`), los 6 y 7
(ventana y cruce con arrastre simple) los cerró el golden 72, y los 8, 9 y 10
—doble clic, zoom al cursor, `U`— siguen reprobados por lo medido arriba. Los
renglones 2 y 3 (Espacio termina y repite) están escritos en el intérprete y
**no hay ningún golden que los afirme sobre el DOM**.

Eso es exactamente lo que la Ola 1 va a construir: un golden «diez segundos»
con los diez renglones, aprobado/reprobado, para que este párrafo deje de ser
una deducción y pase a ser una medida.

---

## Nota fechada — Ola 1 (2026-09-03): el reconocimiento, medido y cerrado

Esta ola construyó el instrumento A del informe anterior y lo corrió antes de
tocar nada. **La prueba de los diez segundos marcaba 7 de 10**
(`apps/web/e2e/golden/85-cad-diez-segundos.spec.ts`, con `expect.soft` para que
un renglón rojo no tape los nueve siguientes):

| # | Renglón | Antes | Después |
| --- | --- | --- | --- |
| 1 | `L` ⏎ con el lienzo enfocado empieza LINE | ✅ | ✅ |
| 2 | Clic, clic, Espacio termina el comando | ✅ | ✅ |
| 3 | Espacio otra vez repite LINE | ✅ | ✅ |
| 4 | `M` ⏎ es MOVE, no la herramienta de medir | ✅ | ✅ |
| 5 | `E` ⏎ es ERASE, no exportar DXF | ✅ | ✅ |
| 6 | Arrastre izq→der designa por ventana | ✅ | ✅ |
| 7 | Arrastre der→izq designa por cruce | ✅ | ✅ |
| 8 | Doble clic sobre un MTEXT abre su editor | ❌ | ✅ |
| 9 | La rueda acerca hacia el cursor | ❌ | ✅ |
| 10 | `U` ⏎ deshace | ❌ | ✅ |

**Corrección al informe de arriba, y se dice donde se dijo lo contrario.** Este
documento afirmaba que los renglones 2 y 3 «están escritos en el intérprete y
no hay ningún golden que los afirme sobre el DOM». Es falso:
`44-cad-command-line.spec.ts` los afirma desde la campaña anterior —pulsa
Espacio sobre el lienzo y comprueba que el prompt se cierra y que reaparece al
repetir—. La deducción era mía y estaba mal hecha; el golden 85 los vuelve a
medir de todos modos, que es como esto deja de ser una opinión.

### Qué se movió, con su número

- **Renglón 9.** Sin `zoomToCursor`, el punto de mundo bajo el puntero se
  desplazaba **1.394 unidades** tras cuatro muescas a 216 px del centro. Con
  `zoomToCursor = true` bajaba a **523**, y ahí se quedó: dos hipótesis
  (inclinación de la cámara de plano, derivación del encuadre desde el suelo)
  se probaron, no movieron el número y **se revirtieron**. La causa real la dio
  una sonda de diagnóstico en el navegador: la vista 2D se DERIVA de la cámara
  en perspectiva por el camino `change` → `adoptPerspectiveFraming`, y ese
  cambio llega DESPUÉS del oyente de la rueda y del `requestAnimationFrame`
  siguiente. El anclaje ahora es por EVENTO
  (`components/cad/viewport/plan-wheel-anchor.ts`): la rueda anota el punto y
  corrige el primer cambio de vista que traiga un zoom distinto. Medido después:
  **1,7 · 0,1 · 0,4 unidades** de deriva en las muescas 2, 3 y 4.
- **Renglón 10.** `U`, `UNDO` y `REDO` entran al registro (247 comandos, antes
  244). `OOPS` no, y su motivo está en la ESCALERA.
- **Renglón 8.** Ocho tipos de objeto responden al doble clic. `HATCHEDIT` y
  `REFEDIT` siguen sin existir y el gesto NO se cae a un panel de consuelo.
- **Iconos por comando:** de 0 a **247 comandos con 175 dibujos distintos**
  (`command-icons.spec.ts`). Antes había uno por PANEL: las veintiséis órdenes
  de «Modificar» compartían la misma llave inglesa.
- **Selector de escala de anotación:** de 0 a un `<select>` en la barra de
  estado que reescala las anotativas del espacio modelo (2,5 mm de papel → 125
  unidades a 1:50, 250 a 1:100, afirmado sobre el documento que recibe el
  servidor en el golden 86).
- **Ctrl+2 y Ctrl+3** despachan ADCENTER y TOOLPALETTES por su nombre.
- **F3, F7, F8, F9, F10, F11 y F12**: ya estaban. Se re-midió antes de
  escribir una línea (`keyboard-shortcuts.ts`, siete entradas) y no se tocaron.

### Los cinco reflejos, hoy

| Reflejo | 2026-09-03 (mañana) | 2026-09-03 (Ola 1) |
| --- | --- | --- |
| Zoom hacia el cursor | 0 apariciones | ✅ anclado por evento, deriva ≈ 0 |
| Inercia de cámara | encendida | ✅ apagada en los dos modos |
| Doble clic para editar | 0 manejadores | ✅ ocho tipos |
| Selector de escala de anotación | 0 | ✅ en la barra de estado |
| Icono por comando | 0 (uno por panel) | ✅ 247 filas, 175 dibujos |

### Lo que esta ola NO cerró, y por qué

Una lámina sigue sin poder llevar **dos escalas de anotación**
(`layout/annotative-scale.ts` decide en la primera ventana que ve la entidad).
Y la escala elegida en la barra de estado **se pierde al recargar**. Las dos
cosas piden lo mismo: campos nuevos en el formato persistido. Es decisión del
titular y está propuesta abajo.

### Decisión del titular pendiente — CANNOSCALE y la anotatividad por escala

Dos campos, y la propuesta concreta de cada uno:

1. **`CadDocumentMeta.annotationScale?: number`** — el denominador vigente
   (50 = 1:50). Es lo que AutoCAD guarda en `CANNOSCALE`, viaja con el dibujo y
   hace que abrirlo dos días después no reinicie la escala. Coste: un campo
   opcional en `meta`, que cualquier consumidor que no lo conozca ignora.
2. **`context.metadata.annotativeScales?: Record<string, number>`** — por
   entidad, la altura de modelo para cada escala en la que se ve («50»: 125,
   «100»: 250). Es lo que permite que el MISMO rótulo salga a 2,5 mm en la
   ventana general a 1:100 y en el detalle a 1:5 de la misma hoja. Vive en el
   bolsillo de metadatos que ya existe, así que no es una entidad nueva ni un
   campo del esquema — pero sí es formato que se persiste, y por eso se
   pregunta.

Sin (1) la escala es de sesión; sin (2) una hoja sólo puede tener una escala de
anotación por rótulo. Mientras no haya respuesta, las dos limitaciones están
dichas aquí, en la ESCALERA y en el prompt del propio selector.

## Nota fechada — Ola 2 (2026-09-03): la primera hora con un plano ajeno

El área del trabajo ajeno se mide por lo que pasa en la primera hora de un
encargo: llega el dibujo de otro, hay que traerlo, ver qué trae roto, tirar lo
que sobra, traducir sus capas, comprobar el estándar y devolverlo entregado. Lo
que esta ola encontró **medido, antes de tocar nada**, fueron tres cosas.

### 1 · `XATTACH` no adjuntaba, y el producto sí sabía adjuntar

`BACKLOG` P1-2 y el informe de arriba lo decían igual. La orden estaba entera
—dibujo, adjuntar o superponer, punto, escala, giro— y terminaba explicando
que el editor no le pasaba la biblioteca del inquilino. Honesto e inútil: el
panel de referencias externas adjunta desde hace campañas.

Ahora la orden tiene **dos caminos**: con `context.xrefCatalog` y contenido
cargado adjunta sin salir del motor; sin ellos termina en una petición de
anfitrión `{kind:"xref-attach"}` con **todo** resuelto —activo, revisión, modo,
punto, escala y giro— que el estudio ejecuta por el mismo camino que el panel.
Ninguno de los dos rechaza un nombre por su cuenta: quien sabe si el activo
existe es quien va a buscarlo. Lo fija `87-cad-xattach-tecleado.spec.ts` sobre
el documento **que recibe el servidor**, no sobre una captura.

### 2 · La cadena de reparación no tenía prueba como cadena

`AUDIT`, `PURGE`, `LAYTRANS`, `CHECKSTANDARDS` y `ETRANSMIT` tenían prueba cada
una por su lado; lo que no tenía prueba era usarlas **seguidas sobre el mismo
dibujo**, que es la única forma en que se usan.
`88-cad-primera-hora-plano-ajeno.spec.ts` teclea las cinco de principio a fin y
afirma sobre el documento del servidor y sobre los **bytes** del paquete
descargado.

### 3 · El plano impreso no era el plano dibujado: dos defectos, los dos medidos

**a) Una `.shx` salía como una fuente de contorno.** Las cinco `.shx` comunes ya
se dibujaban con los trazos Hershey de dominio público en el VISOR desde la
campaña de fuentes, pero ese camino lo consumía sólo `entity-three.ts`. En la
lámina y en el PDF el rótulo pedía una de las catorce estándar. La sustitución
se declaraba con honradez —y aun así lo entregado no era lo dibujado: una
`.shx` es un trazo de un solo grosor y una Helvetica es un contorno relleno.

Medido sobre el mismo dibujo (un muro y el rótulo «PLANTA BAJA», estilo
`ISOCP.shx`, A1 a 1:50), leyendo los bytes del PDF:

| | Antes (texto) | Ahora (trazos) |
| --- | --- | --- |
| `(PLANTA BAJA)` en el flujo de contenido | sí | **no** |
| Segmentos de camino en la página | 13 | **69** |
| Tamaño del archivo | 6.354 B | 10.742 B |
| Informe de fuentes | «SUSTITUIDA por helvetica» | **`stroked` · dibujada con Hershey ISO** |
| Avisos de sustitución | 1 | **0** |

Lo fija `plot-shx-pdf.spec.ts` contra el archivo, con Arial como contraste: sin
él, un emisor que se comiera todos los rótulos pasaría la prueba. Se convierte
en el TRABAJO de trazado y **después** de contar las familias, para que el
informe de fuentes siga rindiendo cuentas de la que el dibujo pedía; y la previa
de la hoja sale del mismo plan, así que enseña lo mismo que el papel.

Lo que NO se convierte, y se dice: una Arial (pasarla a trazos dejaría el PDF
sin texto que buscar ni copiar) y un rótulo con **máscara de fondo** (la máscara
es una caja rellena y el comando `path` no se rellena en ningún emisor de hoy;
se pierde el trazo antes que perder la máscara, y su familia se sigue
declarando sustituida). Las anchuras son las de Hershey, no las del binario que
el dibujo nombraba: `mtext-fonts.ts` lo declara con `metricsDiffer: true`.

**b) Un rótulo vertical se leía hacia abajo.** Al medir (a) apareció otro:
`rotation` en el plan es el giro del DIBUJO —antihorario con la Y hacia arriba,
como lo guarda DXF— y el emisor de PDF lo negaba, así que un rótulo a 90° salía
leyéndose hacia abajo. La previa SVG hacía lo mismo, mientras el PDF del
conjunto de planos (`sheet-set-pdf.ts`) usaba el signo correcto: **dos caminos y
dos resultados para el mismo dibujo**. Y el propio repositorio ya lo tenía
resuelto al lado: `cadImagePlotPlacement` documenta que jsPDF gira en sentido
antihorario sobre el papel.

`plot-text-rotation.spec.ts` lo mide sobre la matriz `Tm` que el archivo lleva
escrita: a 90° el coeficiente `b` pasa de **−1 (se leía hacia abajo)** a **+1**,
y a −90° el signo se invierte. Comprueba además que un segmento que sube en el
plan sube en la página, que es lo que hace que papel y dibujo miren igual.

### Lo que esta ola NO cerró, y por qué

- **El corpus DXF de terceros** sigue siendo el que había: falta la matriz de
  entidades por archivo con las pérdidas declaradas. Ampliarlo con archivos
  reales autorizados es acción del titular (abajo).
- **DWG sigue en beta** y esta ola no lo movió.
- Un `hatch` sólido y una máscara de fondo **no se rellenan** en el PDF de
  trazado: `drawCommand` dibuja todo camino con `"S"`. Es anterior a esta ola y
  está fuera de su alcance; queda anotado aquí porque se encontró midiendo.

### Decisión del titular pendiente — el corpus de dibujos ajenos

Para medir el trabajo ajeno con archivos de verdad hacen falta DXF/DWG de
terceros **con permiso para redistribuirlos** dentro del repositorio o del
espejo de conformidad. Propuesta concreta: usar sólo dibujos de procedencia
limpia —publicados por organismos públicos bajo licencia que permita
redistribuir, o dibujados aquí— y declarar en la matriz, archivo por archivo,
de dónde salió cada uno y su versión. Nada de contenido de Autodesk ni de
material de terceros con licencia restrictiva. Mientras no haya archivos
autorizados, el corpus sigue siendo el sintético que ya existe y esta
limitación queda dicha aquí y en la ESCALERA.

## Nota fechada — Ola 3 (2026-09-03): bloques y publicación

Esta ola encontró **el mismo defecto tres veces**, y merece nombre porque es el
patrón más caro que arrastra el producto: **un subsistema entero escrito,
probado y sin un cable**. El trabajo estaba hecho; nadie lo había enchufado.

### 1 · `PUBLISH` y `SHEETSET` no publicaban nada

Medido con el propio árbol:

```
$ grep -rn "sheetSet" apps/web/src --include=*.ts --include=*.tsx
plot-host.ts:67    sheetSet?(sheetSetId: string): { … } | null;
plot-host.ts:191   const loaded = this.bridge.sheetSet?.(…) ?? null;
plot-host.spec.ts  …
```

El puente lo declaraba su interfaz, lo consumía su anfitrión y lo probaba su
spec. Nadie lo aportaba. Así que `lib/cad/sheet-set/` —1.632 líneas con
numeración automática, campos resueltos y publicación por lotes a un único PDF
paginado con portada—, más los comandos en el registro real, daban entre todos
exactamente esto al teclearlos: **«El conjunto de planos set:nave no está
cargado en este estudio.»** Es el `P1-8` del BACKLOG.

Ahora el conjunto se TRAE: `sheetSet()` sigue respondiendo sólo por lo que está
en la mano y lo que no lo está se pide —«Trayendo…» al instante, el veredicto
cuando llega—, que es el reparto que la Ola 2 estrenó con `XATTACH`. Medido
después, sobre lo que recibe el servidor y sobre el archivo (golden 89):
`SHEETSET Índice` lista las hojas que vinieron del servidor; `Renumerar` deja
`sh-1:A-101, sh-2:A-102` en el cuerpo del PUT **con su `expectedVersion`**; y
`PUBLISH` entrega un PDF de **3 páginas** —portada del juego más una por hoja—
contadas sobre el archivo.

### 2 · Elegir una tabla de plumas impedía trazar la hoja

Peor que «no está». `PAGESETUP Estilos monochrome` sí escribía el nombre en la
presentación —en los atributos del cajetín, formato que ya existía— y a partir
de ese momento `PLOT` se negaba:

```
No se puede trazar: La tabla de plumas «monochrome» no está cargada;
los grosores saldrían por defecto.
```

La negativa era correcta: sin la tabla, el plano saldría con los grosores
equivocados. Lo que faltaba era la tabla. Ahora el estudio publica las tres que
el producto ya sabía construir —`acad.ctb`, `monochrome.ctb` (ISO 128: 0,13
ejes · 0,25 general · 0,35 contornos · 0,50 secciones) y `acad.stb`— y
**`STYLESMANAGER`** carga el `.ctb` del despacho desde un archivo de verdad,
con el mismo inflador que ya descomprime los flujos de un PDF.

Al medirlo apareció un tercer defecto de la misma familia: la comprobación
previa de la configuración de página comparaba el nombre **cadena a cadena**, así
que escribir `Monochrome.CTB` en vez de `monochrome` bastaba para que la hoja
dejara de trazarse. La regla de nombre —sin distinguir caja ni extensión, como
el archivo en Windows— vive ahora con el modelo y la comparten los TRES que
decidían por su cuenta: el trazado, la comprobación previa y el publicador de
conjuntos.

### 3 · Redefinir un bloque dejaba las referencias desfasadas

`ATTSYNC` no estaba. Un despacho define su cajetín con seis atributos, lo
inserta en cuarenta láminas, a media obra añade `REVISION` y quita una etiqueta
que ya no usa… y las cuarenta referencias se quedan como estaban: sin la
etiqueta nueva y con la vieja dentro, que viaja en el archivo guardado y sale
en las extracciones de datos. Basura que parece dato.

Medido después, sobre el documento que recibe el servidor (golden 90):
`PROYECTO` conserva lo escrito, `REVISION` entra con su valor por defecto,
`OBSOLETO` desaparece, el atributo constante queda con el valor de la
definición aunque la referencia tuviera otro, y la geometría del rótulo se
recalcula desde la definición —que es justo la mitad que un `ATTEDIT` no puede
arreglar—. Correrlo dos veces responde «ya estaban al día» y **no sube la
versión del documento**.

### La lección, y qué se hizo con ella

La rúbrica daba por buena la fila de publicación porque su criterio pedía que
los comandos fueran **tecleables**, y lo eran. Un comando que llega al registro
y no llega a hacer nada no es un comando tecleable: el criterio pasa a exigir
que cada uno produzca su efecto **en el documento que recibe el servidor o en
los bytes del archivo entregado**, y lo sostienen los goldens 46 y 89. La
puntuación no sube por esta ola; el criterio se endurece, que es lo que
corresponde cuando lo que se descubre es que se estaba midiendo poco.

### Lo que esta ola NO cerró, y por qué

- **El DXF exportado sigue sin llevar presentaciones.** `dxf-export.ts` no
  tiene ni una aparición de espacio papel: ni bloques `*Paper_Space`, ni objetos
  `LAYOUT` en la sección OBJECTS, ni entidades `VIEWPORT`. Un despacho que
  recibe nuestro DXF recibe el modelo sin sus láminas. Es trabajo de una ola
  entera —el DXF de ida y el de vuelta— y queda medido aquí.
- **`BEDIT` en sitio y los bloques dinámicos** siguen sin estar, con su motivo
  de siempre: el editor dentro del lienzo y los parámetros/acciones por pinzas
  son diseño nuevo, no un cable que falte.
- Siguen ausentes `BATTMAN`, `ATTDISP`, `MINSERT`, `ATTEXT`, `COUNT`, `XOPEN` y
  `REFEDIT`.

## Nota fechada — Ola 4 (2026-09-03): de 3D a documentación

**Lo que se midió antes de tocar nada.** El área «de 3D a documentación» del
informe del 1 de septiembre daba **30 %** y su diagnóstico era literal: *«El
70 % que falta no es lista de comandos, es que lo que sale no se entrega»*, con
ocho defectos numerados. Esta ola cierra cuatro de ellos —(a), (b), (c) y el
grueso de (e)— y deja escrito, con su motivo, qué falta de los otros.

### (c) El único camino con oculta exacta rechazaba los muros

`FLATSHOT` recogía sólo `entity.type === "solid3d"`, y una planta de
arquitectura no tiene ni uno: sus muros, columnas y mobiliario son objetos de
planta a los que el visor 3D ya da altura desde su catálogo de arquetipos. La
orden respondía «no hay ningún sólido que aplanar» sobre un modelo lleno de
ellos.

Ahora un objeto de planta con altura levanta su prisma —con su giro y con su
cota, que sale de `context.elevation`, campo que ya existía—; un objeto redondo
se aproxima con un polígono de 24 lados, y el número se declara con su error de
flecha (0,86 % del radio: una columna de 40 cm se sale 1,7 mm). La altura se
PIDE al anfitrión (`context.objectVolume`) desde el MISMO catálogo con el que el
visor extruye: cablear una tabla dentro del motor sería tener dos verdades sobre
lo que mide un muro.

**Y al medirlo apareció un defecto que no estaba en ninguna lista:** cuando
FLATSHOT sí funcionaba, **no decía nada**. Un resultado `document` lleva
`label` —que va al historial de deshacer— y el anfitrión no la imprime; sin el
campo `notice`, una orden que escribe es MUDA. Lo mismo SOLPROF. Corregido.

### (b) Los huecos no existían en la vista derivada

Con los muros dentro, la puerta también entraba —como CUERPO—. El alzado salía
con un tapón macizo donde va la puerta: un plano plausible y equivocado, que es
la peor clase de plano porque nadie lo mira dos veces.

Una puerta no es un bloque de 2,20 m plantado en el muro: es la parte del muro
que NO está. Ahora se resta con una booleana, al final y no sobre la marcha
—restar según llegan las entidades dependería del ORDEN de dibujo, que no dice
nada sobre qué atraviesa qué—, y las tres formas de salir mal se cuentan con su
identificador y su motivo: la booleana falla (el muro sale entero, sin su
hueco), el hueco no toca ningún cuerpo (casi siempre un objeto mal colocado), o
el hueco se come el cuerpo entero (legítimo: una puerta más ancha que su
tabique).

### (a) La vista que llegaba a la lámina no resolvía qué tapa a qué

Medido sobre el árbol: un muro ENTERAMENTE detrás de otro salía con **4 aristas
VISTAS** —a la capa `-VIS`, encima del muro de delante— y el informe de SOLDRAW
declaraba `exact: true`.

```
ANTES  detras: 4 vistas, 8 ocultas, exact=true
AHORA  detras: 0 vistas, 8 ocultas, exact=true
```

No era una bandera mal puesta: la clasificación por caras traseras pregunta por
la arista y su PROPIO cuerpo, y no puede mirar a los demás ni en principio. La
vista se resuelve ahora ENTERA con el solucionador analítico que FLATSHOT ya
usaba. La proyección no cambia —se le toman los extremos en el mundo y su
veredicto, y el papel lo sigue poniendo la cámara de la ventana—, así que el
encuadre no se mueve y lo único que cambia es qué capa recibe cada trazo.

Coste medido, no estimado: una planta de oficinas de diez crujías (40 muros) se
resuelve en **20 ms**, mediana de cinco corridas. Asumible porque SOLDRAW es una
orden y no un gesto por cuadro.

### (d) Ni marca de corte, ni rótulo con escala, ni globo de detalle

Medido tecleando: la lámina salía con sus ventanas dibujadas y **cero entidades
de texto**. Cuatro dibujos sin nombre, sin escala, y un corte del que no había
forma de saber por dónde pasa — que es la única información que un corte no
puede llevar dentro de sí mismo.

Entra una quinta capa por vista, `<base>-ROT`, con el rótulo (título, subrayado
y `ESC. 1:N`), la marca de corte sobre la planta —línea, rabillo, flecha y
letra en los dos extremos— y el globo de detalle, que mide exactamente lo
ampliado. Los tamaños son de PAPEL multiplicados por la escala de la ventana: 5
mm el título, 3 mm la escala. Y el DETALLE deja de ser un ×2 fijo: se pregunta
la ampliación.

La marca vive en la capa `-ROT` DEL PADRE aunque la genere el hijo, y no es un
descuido: cada ventana congela las capas de las demás vistas, así que una marca
en la capa del corte sería invisible justo en la ventana donde tiene que verse.

### (e) La sección sólo podía ser un plano vertical de dos puntos

El corte que más se dibuja en una obra no se podía pedir. Y no es un corte
cualquiera: **una planta de arquitectura ES un corte horizontal** a ~1,20 m con
el techo retirado. Por eso enseña el hueco de la ventana y no su alféizar. Lo
que había —proyectar el edificio entero desde arriba— da un dibujo que parece
una planta y enseña la cubierta.

Se resuelve **sin campo nuevo**: `sectionPlane` ya era opcional en cualquier
vista, y quien corta pasa a decidir por la PRESENCIA del plano y no por el
nombre de la vista. Medido con control negativo: la planta cortada a 1.200
produce huella de corte —lo que se sombrea— y la planta cenital del mismo muro
produce cero.

### Lo que esta ola NO cerró, y por qué

- **Corte QUEBRADO y control de PROFUNDIDAD** (resto del defecto (e)). Los dos
  piden campos nuevos en `CadViewportSectionPlane` —una polilínea de corte y una
  distancia—, y esta campaña no añade campos persistidos sin decisión del dueño.
  **Propuesta concreta para el dueño**: añadir a `CadViewportSectionPlane` dos
  campos opcionales, `path?: CadPoint3[]` (los vértices del corte quebrado, en
  el mundo; ausente = plano infinito, que es lo de hoy) y `depth?: number`
  (cuánto se dibuja por detrás del corte; ausente = todo). Los dos son
  opcionales y ausentes por omisión, así que ningún documento existente cambia
  de bytes y la migración es la identidad.
- **(f) Una ventana de presentación no puede enseñar una cámara 3D.** Sigue
  igual: `paper-space.ts:viewportTransform` es una afín 2D. El camino que esta
  ola refuerza —aplanar a una placa— es el que hoy llega a la lámina y al
  trazado; la ventana flotante orientada en 3D es trabajo de otra ola.
- **(g) La familia SECTIONPLANE/LIVESECTION/SECTIONPLANETOBLOCK y
  VIEWBASE/VIEWSECTION/VIEWDETAIL/VIEWUPDATE** sigue ausente por su nombre. La
  capacidad está (SOLVIEW/SOLDRAW), los nombres no.
- **(h) Un modelo 3D ajeno no entra.** `dxf-import.ts` sigue descartando
  3DSOLID, MESH y REGION antes del mapeador.
- **Las seis transformaciones 3D** (3DMOVE, 3DROTATE, 3DALIGN, MIRROR3D,
  3DARRAY, 3DSCALE) siguen sin estar, y ahora se sabe por qué cuesta:
  `CadEntityTransform` es estrictamente 2D —traslación `CadPoint2`, espejo por
  un eje del plano—, así que no es «añadir cuatro comandos», es ensanchar el
  transporte de transformaciones y decidir, adaptador por adaptador, qué
  entidad sabe moverse en Z. No cambia el formato persistido: los puntos ya son
  `CadPoint3`.

### Un rojo del CI que NO era de esta campaña, medido

El fragmento 2/4 de E2E falló en `e2e/real/llamada-webrtc-real.spec.ts`. El
diagnóstico honesto exigía descartar primero que fuera nuestro:

```
git diff origin/main <cabeza> -- apps/web/src/components/cad/calls \
    apps/web/src/lib/cad/calls apps/api/src/modules/calls \
    apps/web/e2e/real/llamada-webrtc-real.spec.ts
(vacío)
```

Pila de llamadas idéntica a `main`. Reproducido en local con PostgreSQL 16 y la
API real: **1 fallo de cada 4 corridas sobre un mismo artefacto compilado**. No
es una regresión; es una carrera que el reparto en cuatro fragmentos ha hecho
salir a la luz.

La causa demostrada: las señales se atendían con `void handleIncomingSignal(...)`
sin esperar a la anterior, así que un `ice-candidate` que llega pisando los
talones a la oferta entraba en `addIceCandidate` con `setRemoteDescription` aún
en vuelo y **se perdía**, sin un solo error en consola. Arreglado con una fila
por participante y guardando los candidatos adelantados, con control negativo en
`call-session-host.spec.ts`. Queda un residual —tras un cruce de ofertas ninguno
de los dos extremos llega a `iceConnectionState=checking`— anotado con su traza
para su propia investigación.

## Nota fechada — Ola 5 (2026-09-03): Electrical entra en alcance

**La medida de partida, re-hecha hoy y no heredada.** El informe del 1 de
septiembre daba **Electrical ≈ 1 %**: *«Nada. Ni un comando, ni una entidad de
cable o componente, ni numeración de conductores, ni escalerilla, ni PLC, ni
base de catálogo, ni informes.»* Lo volví a medir sobre el árbol: sondeé catorce
nombres de la familia contra `engine/` —AEWIRE, AECOMPONENT, AEPANEL, AELADDER,
AEPLC, AEPOINT, AESCHEMATIC, AECONDUIT, CIRCUIT, WIRENUMBER, AEWIRENO, AEBOM,
AEREPORT, WIRE— y salieron **cero aciertos**; `conductor`, `canalización`,
`wireNumber` y `voltage` no aparecen en `lib/cad`. Lo único eléctrico eran
cuatro SÍMBOLOS —luminaria, contacto, apagador y tablero, con la NOM-001-SEDE
citada— colocables con `MEPSYMBOL`. **Símbolos sin conductores son iconos, no
una instalación.**

### Sin entidad nueva, y la razón no es sólo el esquema

Un conductor ES una polilínea: eso es lo que se dibuja, lo que se traza y lo que
viaja al DXF. Lo que lo convierte en conductor es lo que sabe de sí mismo
—circuito, número, calibre—, y eso cabe en `context.metadata`. La ventaja
práctica pesa más que la del formato: a una polilínea con metadatos la mueve
MOVE, la recorta TRIM, la copia COPY y la traza PLOT desde el primer día. Un
tipo de entidad nuevo habría empezado sin ninguna de las cuatro.

### El número sale del DIBUJO, y el repetido se caza

Un contador de sesión daría números distintos según quién abriera el archivo, y
dos personas del mismo despacho acabarían con dos «14» en el mismo circuito —en
obra, un empalme equivocado—. Se lee el documento. Los huecos no se reutilizan:
el «7» de un plano entregado y un «7» nuevo serían conductores distintos con el
mismo nombre.

Y se cazan los repetidos, que es la mitad del valor: es el error que no se ve en
pantalla —dos rayas idénticas— y que sí se ve en la obra. Como se detecta
leyendo el documento, también caza el que entró por copiar y pegar, por un DXF
ajeno o por fusionar dos dibujos. `AEWIRELIST` lo lista sin escribir nada.

### Lo que AutoCAD Electrical no puede hacer, y por qué

AutoCAD Electrical numera y saca listas. No comprueba si el calibre aguanta la
protección ni cuánta tensión se cae, y **no puede**: sus conductores son
esquemáticos, no están a escala, así que el dibujo no sabe cuánto mide un
recorrido. El ingeniero mexicano acaba midiendo el plano a mano y llevándose los
metros a una hoja de cálculo que miente en cuanto el plano cambia.

Aquí el conductor está a escala. `AECHECK` mide la longitud RECORRIDA de la
polilínea —no la recta entre extremos: un conductor que sube por un muro y baja
por otro mide lo que recorre— y revisa contra la **NOM-001-SEDE**:

```
C-1 AVISO: la caída es del 6.1 % en 30.0 m y la NOM recomienda 3 %;
           con 8 AWG bajaría del tope
C-1 NO CUMPLE: el calibre 12 AWG admite hasta 20 A y la protección es de
           30 A (tope del conductor pequeño, Art. 240-4(D); su ampacidad
           de tabla es 25 A)
```

Dos decisiones hacen que esto sea seguro y no plausible. La **corriente de
cálculo es la protección**, no la carga conectada: el dibujo no sabe cuánta
corriente pasará, y suponerla menor sería aprobar de más. Y **el límite va
siempre en el renglón y en el título del cuadro**, aprobado o no: sin corrección
por temperatura ni agrupamiento, sin el 125 % de carga continua, sin tierra ni
llenado de tubo, y la caída es resistiva. Una revisión que no dice lo que NO
mira se lee como un certificado. Quien firma sigue firmando.

### El cuadro de cargas, que es el entregable

`DATAEXTRACTION circUitos` inserta el cuadro como TABLE del documento, con el
veredicto DENTRO de la tabla y el límite en su título. Sale en la lámina por el
mismo camino que los demás cuadros y viaja al DXF. Rehacerlo después de mover un
conductor es volver a teclear la orden — hoy eso es rehacer una hoja de cálculo.

### Y se teclea entero, contra el documento que recibe el servidor

`apps/web/e2e/golden/94-cad-pid-planta.spec.ts` teclea la cadena completa
—tres líneas, la bomba, `PIDLIST` y `PIDEQUIPLIST`— con el lienzo enfocado y
después afirma sobre el DOCUMENTO PERSISTIDO: que las líneas son polilíneas con
su marca (ningún tipo de entidad nuevo), que los correlativos los puso el
dibujo y llevan uno por servicio, que la bomba viaja como `INSERT` con su
etiqueta en los ATRIBUTOS y su definición de bloque en el documento, que
`TU-PROC` y `TU-EQ` están en la TABLA de capas —no sólo en las entidades— y que
los 20 m que `PIDLIST` anunció se vuelven a medir sobre la geometría guardada.
Nada mira una captura.

### La rúbrica sube, y con qué

`toolset-electrical` deja de estar «fuera de alcance» y pasa de **0/4 a 3/4**,
reteniendo 1 punto por tener sólo evidencia propia, que es la regla de la casa.
El denominador NO cambia: la fila ya existía a cero.

**DESTINO pasa de 225/271 (83 %) a 228/271 (84,1 %).** HOY sigue en 175/197
(88,8 %): esta ola no toca el flujo diario de dibujo 2D.

### Lo que esta ola NO cerró, y por qué la fila no llega a 4/4

- **Etiquetado automático de componentes** con referencias cruzadas entre hojas
  (el `-M1`, `-PB2` de AutoCAD Electrical). El símbolo existe y el bloque admite
  atributos; falta la numeración y el cruce.
- **Escalerilla (ladder)** y **E/S de PLC**: son maquinaria de esquema unifilar
  de control, y no hay ninguna.
- **Plano de gabinete atado al esquema**: la huella del componente en el tablero
  y su vínculo con el símbolo del esquema.
- **Catálogo de fabricante**: sin él, el cuadro de cargas no puede traer
  precios ni claves de compra.

## Nota fechada — Ola 6 (2026-09-03): Plant 3D entra en alcance

**La medida de partida, re-hecha hoy.** El informe del 1 de septiembre daba
**Plant 3D = 0 %**: *«Cero aciertos de `p&id`, `isogen`, `piping`, `pipespec`.
No hay P&ID, ni especificación, ni catálogo, ni isométricos, ni gestor de
datos.»* Sondeé catorce nombres de la familia contra `engine/` —PLANTPROJECT,
PIPESPEC, ISOGEN, PLANTPID, PIDLINE, LINENUMBER, EQUIPMENT, NOZZLE, VALVEADD,
INSTRUMENT, SPECEDITOR, PLANTDATAMANAGER, ROUTEPIPE, ISOCONFIG— y salieron
**cero aciertos**. Lo único de tubería era `PIPE`, del paquete MEP.

### Se empieza por la clave, no por los isométricos

En una planta una tubería no se llama «esa de allá»: se llama
`6"-P-1001-CS150`. Diámetro, servicio, correlativo y especificación en un solo
nombre, y ese nombre es la clave con la que la línea aparece en el P&ID, en el
isométrico, en la lista de líneas, en la requisición y en la prueba
hidrostática. Isométricos sin números de línea no son un entregable.

### La especificación es del cliente, y por eso no se trae ninguna

AutoCAD Plant 3D vende catálogos. Aquí no se transcribe ninguno: cada ingeniería
tiene el suyo y el ajeno además tiene dueño. Lo que se comprueba es lo
universal, que no pide el catálogo de nadie —número repetido, un servicio con
dos especificaciones, diámetro no comercial, número ilegible— y el renglón lo
declara: *«NO se comprueba contra el catálogo del proyecto: ése lo aprueba la
ingeniería.»*

### Lo que un P&ID de AutoCAD no puede dar

**El metrado.** Un P&ID no está a escala, así que los metros se miden a mano
sobre otro plano. Aquí la línea es una polilínea a escala y `PIDLIST` suma el
recorrido —con sus codos, no la recta entre puntas—:

```
PIDLIST — 2 línea(s): 6"-P-1001-CS150 (12.0 m) · 4"-P-1002-CS150 (8.0 m).
          sin hallazgos.
```

### El catálogo de equipos, dibujado desde cero

Seis símbolos —recipiente, bomba, intercambiador, tanque, compresor e
instrumento de campo— dibujados aquí con círculos, rectángulos y líneas a partir
de la forma esquemática que cualquier libro de proceso enseña. **No se copia,
traza ni adapta la biblioteca de nadie.** Y nacen CON su etiqueta: `PIDEQUIP`
coloca y numera en un solo paso de deshacer, porque nadie coloca una bomba para
dejarla sin nombre. El correlativo arranca en 101, que es la convención de
planta, y el prefijo lo decide el proyecto —se admite cualquiera de una a tres
letras—.

### La rúbrica sube, y con qué

`toolset-plant3d` deja de decir «(fuera de alcance)» y pasa de **0/4 a 2/4**: se
otorga el criterio de P&ID —catálogo de equipos etiquetados y líneas numeradas,
todo derivado del dibujo— y NO el de tubería 3D por especificación e
isométricos, que no existe. El denominador no cambia: la fila ya estaba.

**DESTINO pasa de 228/271 (84,1 %) a 230/271 (84,9 %).** HOY sigue en 175/197
(88,8 %).

### Lo que esta ola NO cerró

- **Ruteo de tubería 3D por especificación**: la línea está en 2D con su número,
  servicio y especificación. El 3D con accesorios y por especificación no está.
- **Isométricos**: sin ruteo 3D no hay de dónde sacarlos.
- **Un catálogo de fabricante con claves de compra y precios**: el metrado sale,
  la requisición valorada no.
- **Instrumentación completa**: entra el instrumento de campo, que es el que más
  se dibuja; el de panel y el de programa, no, y está dicho en el módulo.

## Nota fechada — Ola 6, segunda mitad (2026-09-03): la tubería sube, y de ahí sale un isométrico

Medido antes de tocar nada: DESTINO 230/271 (84,9 %), HOY 175/197 (88,8 %);
`toolset-plant3d` en 2/4 con el criterio de tubería marcado «todavía no».

### El montante, que es lo que hace que «3D» no sea una etiqueta

Una tubería no vive en el suelo: arranca a +2.000 y sube a +5.000 para pasar
sobre una viga. `PIDROUTE` pregunta la elevación de arranque y ofrece
`Elevación` en cada punto: cambiarla mete el **montante** —el tramo vertical—
en el sitio, sin que nadie lo dibuje. Sin eso, «ruteo 3D» habría sido una
polilínea plana con una etiqueta que dice 3D, y este producto tiene una regla
escrita contra exactamente eso.

Y se nota en el número que importa: la ruta del golden mide **24,00 m en 3D y
21 en planta**. La diferencia son los 3 m del montante, que es tubo que se
compra.

### Los accesorios se DEDUCEN, y por eso no mienten

AutoCAD Plant 3D coloca un codo como objeto cuando ruteas. Aquí el codo se
deduce de la geometría: si la ruta gira 90° en un vértice, ahí hay un codo de
90°, y si mañana se mueve el vértice el codo se mueve con él. Colocarlo como
entidad obligaría a mantener dos verdades sincronizadas —la geometría y el
objeto—, y la lista de materiales de un plano modificado es justo donde esa
desincronización se paga.

Se deducen tubo, codo, te y reducción. Una brida, una válvula o un soporte no
los implica la geometría, así que **no se inventan**, y está dicho en el módulo.

### El isométrico: por qué las longitudes van como TEXTO

La proyección es la isométrica del dibujante —ejes a 30°, 150° y vertical—, así
que un tramo paralelo a un eje conserva su longitud, pero uno oblicuo se dibuja
**más corto de lo que mide**: una diagonal de 1.414 sale de 1.000. Por eso la
longitud se rotula como texto con el valor 3D verdadero y **no** como cota del
dibujo: la cota mediría el trazo proyectado y diría 1,00 m donde hay 1,41. El
propio título de la hoja lo declara: `SIN ESCALA`.

### Y no es «unas líneas en diagonal»: es una hoja

`PIDISO` hace las tres cosas que hacen falta para montar una tubería, en **un
solo paso de deshacer**:

1. el dibujo isométrico con las longitudes verdaderas y los accesorios marcados;
2. la lista de materiales, como TABLE del documento, con su límite en el título;
3. la HOJA, con su ventana encuadrando el dibujo **y** el cuadro —una ventana
   que cortase la lista entregaría media requisición—.

### La rúbrica sube otra vez

`toolset-plant3d.tuberia` deja de estar en «todavía no» y la fila pasa de
**2/4 a 3/4**, reteniendo 1 pt como las otras 27 filas cuya evidencia es toda
propia. **DESTINO pasa de 230/271 (84,9 %) a 231/271 (85,2 %).** HOY sigue en
175/197 (88,8 %).

### Lo que esta mitad NO cerró, dicho aquí y en la rúbrica

- **Catálogo de fabricante**: espesor, diámetro exterior, peso, clave de compra
  y precio están en normas y catálogos con dueño. No se transcribe ninguno, y el
  cuadro lo dice en su título.
- **Sólido de tubería en el visor 3D**: la ruta es el EJE. Ver la tubería con su
  diámetro real pide el exterior, que es catálogo.
- **Choques contra estructura**: no hay detección de interferencias.
- **Formato ISOGEN**: la hoja es del documento, no un fichero en el formato de
  esa herramienta.

## Nota fechada — Ola 7 (2026-09-03): los bloques dinámicos existían y nadie podía alcanzarlos

Medido antes de tocar nada: HOY 175/197 (88,8 %), DESTINO 231/271 (85,2 %).

### La medición que no se hace con una sonda de nombres

Sondeando dieciocho nombres de la familia de bloques dinámicos de AutoCAD
—BEDIT, BSAVE, BCLOSE, BPARAMETER, BACTION, BACTIONTOOL, BVSTATE, BGRIPSET,
BAUTHORPALETTE, BCONSTRUCTION, BTESTBLOCK, BLOOKUPTABLE, BCOUNT, BCYCLEORDER,
PARAMETERS, ATTIPEDIT, BASSOCIATE, BREPLACE— contra el registro: **2 de 18**, y
una de las dos (PARAMETERS) es la de restricciones paramétricas, que es otra
cosa.

Pero el hallazgo grande fue otro:

```
grep -rl "dynamic-blocks|CadDynamicBlockFamily" src
→ dynamic-blocks.ts, dynamic-blocks.spec.ts, onboarding/tour-accuracy.spec.ts
```

`src/lib/cad/dynamic-blocks.ts` —683 líneas, dos familias, su spec verde— **no
lo importaba ni un comando ni un panel**. El motor estaba escrito, probado y sin
puerta. Una capacidad que nadie puede alcanzar no es una capacidad: es código, y
la rúbrica hacía bien en no otorgar la fila.

### Tres puertas, y después la que importa

`BLOQUEDIN` coloca, `BLOQUEDINSET` cambia un parámetro de la instancia ya
colocada y `BLOQUEDINLIST` dice qué hay. Pero eso sólo daba acceso a **nuestras**
dos familias. Un bloque dinámico de AutoCAD es lo contrario: es el bloque DEL
DESPACHO, con los parámetros que el despacho le pone.

`BLOQUEDINDEF` cierra eso. El parámetro se escribe **dentro de la definición,
como una línea marcada**: es lo que se ve en el editor de bloques de AutoCAD
—el parámetro se dibuja— y aquí además viaja al DXF como una línea normal, en
una capa que se puede apagar. Sin un campo nuevo en el formato persistido.

La línea dice dos cosas a la vez, y ninguna hay que inventarla: **de dónde a
dónde** (base, dirección y medida de referencia) y **qué mueve** (lo que quede
más allá de su punto medio). No hace falta que nadie dibuje además un marco de
estirado.

### Lo que un despacho gana, en una frase

Una mesa de 1.200 con cuatro patas deja de ser cinco bloques casi iguales. Se
estira a 1.800 y **las patas de la izquierda no se mueven, las de la derecha
acompañan, y el círculo de la pata sigue siendo un círculo** — no una elipse,
que es lo que sale de escalar el bloque entero.

### Cambiar un parámetro NO es borrar y volver a insertar

Es la propiedad que el golden 96 fija sobre el documento del servidor: tras
cambiar el claro de la puerta de 900 a 1.000, la entidad tiene **el mismo id y
la misma inserción**, apunta a otra definición materializada, y el barrido de la
hoja mide 1.000. Sigue habiendo UNA puerta, no dos.

### La rúbrica

`blocks.dynamic` deja «todavía no». **HOY pasa de 175/197 (88,8 %) a 176/197
(89,3 %)** —es la cifra de cliente, la que mide el trabajo diario— y **DESTINO
de 231/271 (85,2 %) a 232/271 (85,6 %)**.

### Lo que esta ola NO cerró, y por qué

- **Edición por GRIP**: el parámetro se cambia por orden, no arrastrando un
  tirador. El puntero todavía no está enrutado al motor —lo dice
  `Layout3DEditor.tsx` y lo mide el golden 45—, y por eso `BLOQUEDINSET` trabaja
  sobre la SELECCIÓN del editor: una orden que pidiera designar con el ratón
  sería una orden que nadie puede terminar en el navegador.
- **Estados de visibilidad y tablas de consulta**: no existen.
- **En las familias del USUARIO, sólo el parámetro lineal con acción de
  estirar.** Girar y reflejar geometría cualquiera —arcos, textos, sombreados—
  se puede hacer bien o se puede hacer «casi», y «casi» en un bloque que alguien
  imprime y construye no vale. Se rechazan POR SU NOMBRE, con el motivo.

## Nota fechada — Ola 7, segunda parte (2026-09-03): editar un bloque sin explotarlo

Medido antes de tocar nada: HOY 176/197 (89,3 %), DESTINO 232/271 (85,6 %).

### El gesto más caro de un dibujo con biblioteca propia

La fila `blocks` lo decía: *«Sin editor de bloques en sitio, redefinir un bloque
exige explotar y volver a definir.»* Y explotar **pierde los atributos**: el
`TAG` de cada referencia se va y hay que rellenarlo a mano, marca por marca.
Corregir el detalle de una puerta o ajustar el símbolo de un cajetín es un gesto
diario, y hasta hoy costaba eso.

### REFEDIT, REFSET y REFCLOSE — y esta vez los nombres SÍ son los de AutoCAD

Cuando el gesto es el mismo, el nombre tiene que ser el mismo: es memoria
muscular de veinte años. `REFEDIT` saca la geometría de la definición **encima
de la referencia designada** —no en el origen del mundo—, marcada en
`context.metadata`; se edita con las órdenes de siempre, porque el editor de un
bloque tiene que ser el editor y no uno más pequeño con la mitad de las
herramientas; `REFSET` añade lo que se dibujó nuevo o retira lo que sobra; y
`REFCLOSE` guarda en la definición —devolviendo la geometría a coordenadas del
bloque— o descarta sin tocarla.

Los atributos se conservan: es exactamente lo que explotar perdía.

### Dos sesiones a la vez se niegan

Guardar con dos ediciones abiertas mezclaría la geometría de dos bloques. Se
dice cuáles están abiertas y se pide cerrar una, en vez de resolverlo adivinando.

### La rúbrica NO se mueve, y es correcto

El criterio pide **«BEDIT como editor real, no como puerta al panel»**, y BEDIT
sigue abriendo el panel. La capacidad de editar en sitio existe hoy bajo los
nombres que AutoCAD usa para ella, pero otorgar el punto sería medir otra cosa
de la que se pidió. Queda escrito en el `todavía no` de la fila, con lo que falta:
que BEDIT sea ese editor, y editar en sitio una referencia **girada o escalada**
—que hoy se niega por su nombre, porque devolver geometría girada no es
trasladarla y hacerlo «casi» deja un bloque de biblioteca torcido para siempre—.

### Y BEDIT deja de ser una puerta

La misma nota de arriba decía que el criterio no se otorgaba porque pedía *«BEDIT
como editor real, no como puerta al panel»*. Ahora lo es: con una referencia
designada o seleccionada, **BEDIT abre la definición en sitio** sobre su punto de
inserción; con un nombre, con Intro, sobre un bloque sin geometría o sobre una
referencia girada o escalada sigue abriendo el panel **y dice por qué**, en vez
de dejar al usuario preguntándose por qué esta vez fue distinto.

`blocks.bedit` se otorga. La fila `blocks` llega así a su tope de capacidad y
queda en **8/9 reteniendo 1 pt** por la misma regla que otras veintiocho: toda su
evidencia es propia. Las cifras totales no se mueven —HOY 176/197 (89,3 %),
DESTINO 232/271 (85,6 %)— porque el punto ganado es exactamente el que la
retención descuenta. Se dice así, con el mecanismo a la vista, en vez de anunciar
una subida que la rúbrica no concede.

## Medición de arranque — Ola 8 (2026-09-04): automatización y personalización

Antes de tocar nada, y con dos sorpresas.

### La tabla de alias ya no cuelga

El criterio `command-line.alias-complete` decía: *«los 129 alias, incluidos
BE→BEDIT y BLE→BLEND, que hoy cuelgan»*. Sondeada la tabla entera contra el
registro real:

```
alias declarados: 183
sin resolver: 0
```

Ninguno cuelga. La fila ya está a su tope y sólo retiene 1 pt por evidencia
propia. **No hay trabajo aquí**, y decirlo es parte del trabajo: la alternativa
era «mejorar» algo que ya estaba y contarlo como avance.

### La superficie de automatización, en cambio, está en 4 de 36

Sondeados treinta y seis nombres de la familia contra el registro:

| Familia | Hay | Faltan |
| --- | --- | --- |
| AutoLISP y scripting | 2/9 (SCRIPT, RSCRIPT) | APPLOAD, VLIDE, LOAD, SCRIPTCALL, DELAY, RESUME, MACRO |
| Personalización de interfaz | 1/10 (TOOLPALETTES) | CUI, CUILOAD, CUIUNLOAD, CUIEXPORT, CUIIMPORT, CUSTOMIZE, WSSAVE, WSSETTINGS, MENU |
| Acciones y grabación | 0/5 | ACTRECORD, ACTSTOP, ACTMANAGER, ACTUSERINPUT, ACTUSERMESSAGE |
| Parámetros y campos | 1/5 (PARAMETERS) | FIELD, UPDATEFIELD, DATALINK, DATALINKUPDATE |
| Automatización externa | 0/7 | NETLOAD, VBALOAD, VBARUN, VBAIDE, OPENSHEETSET, JSLOAD, PLUGIN |
| **TOTAL** | **4/36** | |

La rúbrica no ve este hueco: la fila `Automatización: AutoLISP y plugins JS`
mide 6/8 y lo que le falta es el puente .NET/VBA, que en un navegador no
existe y se dice. Pero **4/36 es el número honesto de la superficie**, y hay
capacidades ahí que un despacho usa a diario.

### Lo que esta ola va a atacar, y por qué en este orden

1. **El grabador de acciones** (ACTRECORD / ACTSTOP / ACTMANAGER). Es el que más
   vale y el que este motor puede hacer mejor que nadie: las órdenes son
   máquinas de estados que se alimentan de tokens, así que grabar es guardar lo
   que el usuario tecleó y repetir es meterlo por la misma puerta —la de
   `parseCadScript`, que ya existe—. Un despacho graba una vez y lo repite en
   veinte planos.
2. **DELAY, RESUME y SCRIPTCALL**, que son lo que le falta al `.scr` para
   encadenar guiones.
3. **CUI/WSSAVE**, la personalización de la cinta y del espacio de trabajo.

Lo que NO se va a hacer, dicho ya: **NETLOAD, VBALOAD, VBARUN y VBAIDE**. No hay
runtime .NET ni VBA en un navegador y fingirlo con un comando que abre un aviso
sería exactamente la clase de puerta falsa que esta campaña rechaza. El camino
de extensión de este producto es AutoLISP más plugins JS con manifiesto
versionado, y está documentado.
