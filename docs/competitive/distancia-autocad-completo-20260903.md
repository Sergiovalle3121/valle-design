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
