# La distancia real contra AutoCAD completo — 1 de septiembre de 2026

Medida contra **AutoCAD completo** (no LT) y contra sus **siete toolsets**, contando
por lo que FALTA y no por lo que hay. Cada porcentaje va con su justificación medida.

| Área | Medido |
| --- | ---: |
| Dibujo y modificación 2D — el trabajo diario | **55 %** |
| Anotación: cotas, textos, tablas, cuadros de cantidades | **30 %** |
| Capas, estilos, plantillas y estándares de despacho | **45 %** |
| Bloques, atributos, referencias externas y datos | **30 %** |
| Publicación: láminas, impresión a escala, PDF, intercambio DWG/DXF | **40 %** |
| Modelado 3D: sólidos, superficies, edición de caras | **20 %** |
| De 3D a documentación: secciones, vistas y plantas derivadas (SOLVIEW/SOLDRAW, FLATSHOT/SOLPROF, SLICE/SECTION) | **30 %** |
| Los siete toolsets especializados (Architecture, Mechanical, Electrical, MEP, Map 3D, Plant 3D, Raster Design) | **6 %** |
| Automatización, personalización y API | **30 %** |

## Justificación de cada número

### Dibujo y modificación 2D — el trabajo diario — 55 %

55% del trabajo real, no del listado de comandos. Justificado por lo que FALTA, que se agrupa en cuatro cosas y no en cuarenta:

(1) Dibujar y modificar geometría PROPIA sale bien (~85%): faltan CIRCLE por TTR/TTT (el prompt sólo ofrece [3P/2P], verificado ejecutando `CIRCLE.begin()`), 8 de las ~11 variantes de ARC (el propio `draw-curves.ts:105-118` lo declara), OFFSET sin ninguna opción (ni Punto de paso, ni Borrar, ni Capa, ni Múltiple: el prompt sale con `[]`), DIVIDE/MEASURE sin la opción Bloque, MLINE, y EXPLODE que sólo trata POLYLINE / INSERT / DIMENSION / MLEADER (`modify-join.ts:362-418`) y deja fuera HATCH, MTEXT, TABLE, REGION y WIPEOUT. Todo eso tiene rodeo.

(2) Que el dibujo SE LEA como un plano falla (~35%): todos los patrones de sombreado producen el mismo trazado (lo medí) y los tipos de línea se reducen a un par trazo/hueco con tope de 8 ranuras. No hay rodeo: es el resultado impreso.

(3) Trabajar con un dibujo AJENO está prácticamente cerrado (~15%): no hay tolerancia de holgura para cerrar contornos, JOIN/PEDIT no rellena huecos, no hay portapapeles de geometría canónica entre dibujos, y faltan SELECTSIMILAR, XPLODE, SETBYLAYER, CHPROP y NCOPY. La PRUEBA DE DESPACHO del área 2 del listón —recibir un DWG, unir 34 líneas mal empatadas y obtener perímetro y superficie— falla en el primer paso, medido.

(4) Los reflejos de la línea de comandos faltan (~45%): `U`, `UNDO`, `REDO`, `OOPS` responden «Comando desconocido», y en «Designe objetos» ninguna palabra clave de designación es válida.

Ponderación aproximada: 45% del tiempo en (1), 20% en (2), 20% en (3), 15% en (4) → ≈55%.

AVISO SOBRE LA CIFRA CONTRARIA: la rúbrica del repo es AUTOEVALUACIÓN y en esta área daría casi 100%. `draw-2d` vale 16 pt, `modify` 14 pt y `hatch` 10 pt, y sus filas se validan con `scripts/cad/rubric.mjs`, donde `command(item)` sólo comprueba «el nombre está en el registro» (línea 383-390), `golden(item)` sólo comprueba «el archivo existe en e2e/» (línea 374-380) y `spec(item)` sólo comprueba que el archivo esté bajo `src/` y acabe en `.spec.ts` (línea 359-364). `modify.advanced` (2 pt) y `modify.housekeeping` (1 pt) se puntúan SÓLO con `kind: "command"`. `hatch.command` (3 pt) sólo con `alias` + `command`. Es decir: `hatch` se lleva sus 10/10 mientras cada nombre de patrón dibuja exactamente las mismas rayas. Ahí está, en esta área, el mecanismo exacto de la divergencia entre «88,6%» y «no se parece en lo absoluto a AutoCAD»: la rúbrica mide el REGISTRO y la EXISTENCIA DE ARCHIVOS, nunca el resultado dibujado.

CORRECCIÓN AL INVENTARIO DEL EQUIPO: los grips multifuncionales SÍ están cableados, al contrario de lo que sugiere la cabecera de `grip-actions.ts` («No cablea nada en la interfaz»), que quedó rancia. La cadena es `grip-actions.ts` → `components/cad/viewport/native-grip-controller.ts` → `Layout3DEditor.tsx:531, 6637, 6704, 6829, 7026, 7206, 13716`. Añadir vértice, quitarlo y convertir tramo en arco con Espacio funcionan. Eso es lo que el listón llama «el 60% del tiempo de un dibujante» y aquí está bien hecho.

### Anotación: cotas, textos, tablas, cuadros de cantidades — 30 %

30 %, y lo que lo baja no es la lista de comandos —hay 31 órdenes de anotación tecleables y un DIMSTYLE con 34 DIMVARs— sino que el acto central del área no se puede ejecutar: ACOTAR Y VER LA COTA. Corrí yo el pipeline por defecto (`batched`, `render-pipeline-preference.ts:33`) con cinco entidades de anotación —una cota de 4000, un TEXT «SALA COMEDOR», un MTEXT «PLANTA», una TABLE con 4 celdas llenas y un MLEADER «MURO 15 CM»— y salió: `peticiones de texto: 1 ["PLANTA"]`. Sólo el MTEXT se rotula (`render/pipeline.ts:523` es la única rama que produce texto). Peor: pedí las rutas de dibujo de TEXT y ATTDEF al registro y devuelven `1 ruta, 4 puntos, cerrada` — la CAJA. Un plano con 200 rótulos de local dibuja 200 RECTÁNGULOS VACÍOS. Eso, y no una lista de features, es «no se parece en lo absoluto a AutoCAD».

Lo que SÍ sirve, y es mucho: el modelo es correcto (cotas asociativas de verdad, golden 16) y la LÁMINA es correcta. Corrí `buildCadPublishPlan` con línea + cota + TEXT + tabla llena y el PDF recibió `d1:"200.00 mm"` y `t1:"SALA COMEDOR"`. Es decir: el entregable sale bien, el taller de trabajo no. Un dibujante acota a ciegas y sólo se entera de lo que puso al publicar.

Lo que no sale ni en la lámina: el CUADRO. La misma corrida no emitió NI UNA de las 4 celdas llenas de la tabla, y `warnings: []` — se pierde en silencio, sin el aviso `entity_not_plottable` que el módulo sí sabe dar, porque la tabla sí se traza (la rejilla) y la guarda no dispara.

Y falla la PRUEBA DE DESPACHO textual del área (mismo plano a 1:50 y a 1:100 en dos ventanas): corrí `cadAnnotativeRescaleCommands` con un rótulo anotativo de 2,5 mm y dos ventanas a 1:50 y 1:100 → **0 órdenes**. Decide en la primera ventana y cierra (`layout/annotative-scale.ts:199`). El rótulo sale a 2,5 mm en una y a 1,25 mm en la otra.

Faltan además, verificado contra los 204 nombres del registro: DIMSPACE, DIMBREAK, DIMJOGGED, DIMJOGLINE, DIMTEDIT, DIMREASSOCIATE/DIMDISASSOCIATE, MLEADEREDIT/ALIGN/COLLECT, TEXTEDIT, FIND, SPELL, SCALETEXT, JUSTIFYTEXT, FIELD, TABLEDIT, TINSERT, TABLEXPORT, DATALINK, OBJECTSCALE, ANNORESET, SCALELISTEDIT. DIMSTYLE no tiene subestilos por familia (cero apariciones de «family»/«subestilo» en `dimension-style.ts`), así que una cota radial no puede llevar flecha propia sin crear otro estilo.

Aviso sobre la rúbrica: es AUTOEVALUACIÓN y aquí se ve por qué diverge. `docs/competitive/rubric.json` da 1 punto a `annotation-extras.table` con el texto «TABLE tecleable como descriptor del motor» y la evidencia `{kind:"command", name:"TABLE"}`. El criterio es que el comando esté en el registro, no que una tabla enseñe su contenido. Los 2 puntos de MLEADER se apoyan en la entidad, la asociatividad y el golden 17 — ninguno mira si la nota se dibuja.

### Capas, estilos, plantillas y estándares de despacho — 45 %

45 % — se puede TRABAJAR con capas, no se puede ENTREGAR con ellas. Lo que falta, no lo que hay: (1) ningún tipo de línea se dibuja ni se imprime, así que un plano no distingue un eje de un muro ni un cimiento oculto de una proyección; verificado corriendo las 6 plantillas de arranque — todas declaran capas «Ejes»=CENTER, «Plafones»=DASHED, «Cimentación»=HIDDEN y el documento sale con «catálogo de tipos de línea: 0, ranuras de dibujo: 0». (2) El despacho no puede cargar su .ctb: el motor CTB/STB está escrito y completo, pero el estudio nunca aporta el puente `plotStyleTables()`, así que o se traza sin tabla de plumas o PLOT se niega. (3) No hay forma de definir, traer ni verificar el estándar PROPIO: 149 plantillas, todas de fábrica y ninguna guardable; CHECKSTANDARDS sólo compara contra la norma mexicana escrita en el código; LAYTRANS son pares tecleados sin diálogo ni mapa reutilizable; ADCENTER sólo ve xrefs ya adjuntos y XATTACH no puede adjuntar ninguno. Lo que SÍ está y es sólido —gestor de capas con tipo de línea, grosor, plot, congelada global y por ventana, filtros por nombre y por propiedad, estados de capa persistidos en el documento, familia LAY* casi entera, PURGE/AUDIT/RECOVER con evidencia medida, y overrides de capa por ventana que llegan al PDF— cubre las horas del día a día, que son la mitad del área. La otra mitad, la que decide cómo se VE la lámina, está rota y rota en silencio. Advertencia de método: la rúbrica es autoevaluación; nada de lo que afirmo arriba sale de ella — lo comprobé leyendo el código y ejecutando el repo.

### Bloques, atributos, referencias externas y datos — 30 %

Lo que un despacho hace DENTRO de su propio dibujo funciona: definir, insertar, anidar, escalar con espejo, redefinir, purgar, agrupar, estallar (BURST conserva el valor como texto real) y adjuntar una referencia a OTRO documento Valle del mismo inquilino con descarga/recarga/desligar/enlazar/recortar. Eso está probado de verdad en navegador (`apps/web/e2e/golden/18-cad-professional-blocks.spec.ts`, `46-cad-blocks-insert.spec.ts`, `21-cad-xrefs.spec.ts`, `47-cad-xref-manager.spec.ts`). Falta lo que convierte esta área en el eje de un despacho, y por eso el número es bajo, no por el tamaño de la lista: (1) NO SE PUEDE RECIBIR EL DIBUJO DE OTRO — la importación DWG está apagada por política (`apps/web/src/lib/cad/dwg-interop-flag.ts:38`, `DWG_IMPORT_FLAG = false` más gates cerrados) y el DXF, que es el único camino, pierde EN SILENCIO los valores de atributo y el contenido de los bloques anónimos (lo medí, ver huecos); (2) NO SE PUEDE REFERENCIAR NADA QUE NO SEA UN DOCUMENTO VALLE — no hay PDFATTACH ni IMAGEATTACH en el registro, y `XATTACH` tecleado nunca puede adjuntar porque `context.xrefCatalog` no lo aporta ningún anfitrión (grep exhaustivo sobre `apps`, `packages`, `scripts`: sólo aparece en `command-types.ts:244`, en el propio comando y en su spec); (3) EL BLOQUE NO ES UN DATO — `DATAEXTRACTION` sólo cuenta `wall` y `opening` (`engine/commands/data-extraction-commands.ts` → `bim-schedule.ts`, que no menciona ni una vez `insert`, `block` ni `attribute`), no existen COUNT/BCOUNT/ATTIN/ATTOUT/FIELD, y ni siquiera el escape de AutoLISP sirve: `entget` sobre un INSERT devuelve nombre, punto, escala y giro y NINGÚN atributo (`apps/web/src/lib/lisp/dxf/from-entity.ts:237-247`); (4) los bloques dinámicos son dos recetas escritas en el código (`dynamic-blocks.ts:558` puerta, `:642` marca de nivel, `:669` la lista entera), sin BPARAMETER/BACTION/BTABLE ni estados de visibilidad — cero apariciones en todo `apps/web/src`; (5) faltan REFEDIT, BATTMAN, ATTSYNC, ATTDISP, MINSERT, XOPEN y la paleta de bloques tipo BLOCKSPALETTE (comprobado fila a fila contra `engine/command-summaries.ts`). Sobre la rúbrica: se autopuntúa y en esta área la evidencia es débil de una forma concreta — `xrefs.commands` concede 2 puntos con evidencia `{"kind":"command","name":"XATTACH"}`, y el verificador de ese tipo de evidencia sólo comprueba que el nombre esté en el registro (`scripts/cad/rubric.mjs:383-389`), no que la orden pueda adjuntar algo; `xrefs.resolution` concede 2 puntos por «capas de xref» y las capas se aplastan a una (medido). `blocks.bedit` y `blocks.dynamic` sí están declarados «todavía no», con honestidad.

### Publicación: láminas, impresión a escala, PDF, intercambio DWG/DXF — 40 %

La mitad GEOMÉTRICA está hecha y la comprobé yo: presentación desde plantilla (LAYOUT Nueva/COpiar/Renombrar/Suprimir/PLantilla/Definir/LIstar), ventanas rectangular/poligonal/por objeto, escala fijada CON bloqueo, congelar capas por ventana, cajetín con sus diez atributos impresos, y un PDF a escala exacta — publiqué un juego con `publishCadSheetSet` y medí los bytes: el muro de 3,5 m a 1:50 mide 70,000000 mm (error 5,7e-14 mm), y en mi propia corrida las cotas, los TEXT, los MLEADER y los atributos de bloque SÍ salen rotulados en el PDF (el camino del papel es MEJOR que el de pantalla: rotula lo que la pantalla no rotula).

El 60% que falta es todo lo demás de la ENTREGA, no de la lista de comandos: (1) no se puede publicar el JUEGO — PUBLISH y SHEETSET están en el registro, tienen botón de cinta y motor medido, y el estudio no les pasa ningún conjunto; (2) el PDF no sale con la letra ni los grosores del despacho — el lector de `.ctb` es completo y tiene CERO llamadores, nadie incrusta fuentes (todo sale en Helvetica base-14), ninguna `.shx` se resuelve, las alturas de texto en papel están recortadas a [1,5; 12] mm y la de cota se deriva de `arrowSize` ignorando DIMTXT, el MTEXT imprime sus códigos literales (`PLANTA BAJA\Pescala`), la tabla sale como rejilla vacía y todos los patrones de sombreado salvo CROSS se dibujan iguales; (3) una lámina no puede llevar dos escalas de anotación (lo medí: 2,500 mm y 1,500 mm para el MISMO rótulo en la misma hoja); (4) el DXF exportado no lleva ninguna presentación —cero registros LAYOUT/VIEWPORT/PLOTSETTINGS, sin sección OBJECTS— y no lo declara; el DWG no entra (bandera apagada por defecto en el release) ni sale (gate `externalOracleVerified:false` que ni encendiendo la bandera se abre); (5) no hay vista previa de trazado («no está disponible en esta versión», dicho por el propio anfitrión), ni tamaño de papel personalizado (7 nombrados: A0–A4, letter, tabloid; sin serie ARCH/ANSI ni 60×90), ni VPCLIP, VPORTS, SPACETRANS, PSLTSCALE/MSLTSCALE, PLOTSTAMP, LIMITS o MVSETUP; y EXPORT no es el EXPORT de AutoCAD (es STEP/IGES de sólidos y devuelve el archivo como mensaje de texto, sin descarga).

### Modelado 3D: sólidos, superficies, edición de caras — 20 %

Medido contra el AutoCAD completo (no LT), y contado por lo que FALTA. Corrí una sonda contra el registro real (`CAD_COMMAND_REGISTRY_V2`) preguntando por 69 órdenes de esta área: están 24 y faltan 45. Faltan LAS OCHO primitivas de sólido (BOX, CYLINDER, CONE, SPHERE, WEDGE, TORUS, PYRAMID, POLYSOLID) — el nodo `box` existe en el esquema (`cad-entities-v5.ts:143`) y ningún comando lo crea. Falta SOLIDEDIT ENTERO, que en AutoCAD son del orden de catorce operaciones de cara, arista y cuerpo (extruir/mover/girar/desfasar/inclinar/borrar/copiar cara, copiar/colorear arista, estampar/separar/vaciar/limpiar/comprobar cuerpo — la lista exacta la doy como aproximada). Faltan las SEIS transformadas 3D (3DMOVE, 3DROTATE, 3DSCALE, 3DALIGN, MIRROR3D, 3DARRAY). Falta el mundo de SUPERFICIES COMPLETO: PLANESURF, SURFNETWORK/PATCH/BLEND/OFFSET/FILLET/TRIM/EXTEND/SCULPT, CONVTOSOLID/SURFACE/NURBS, THICKEN — cero de cero. Falta el modelado de malla entero, 3DPOLY, HELIX, SECTIONPLANE, IMPRINT, XEDGES, ELEV.

> **Nota fechada 2026-09-02 (Ola C, PR #176).** De lo que faltaba arriba, ya están: LAS OCHO primitivas (BOX, WEDGE, CYLINDER, CONE, SPHERE, TORUS, PYRAMID, POLYSOLID) como un nodo reeditable cada una (`engine/commands/solids-primitives.ts`, 60 comprobaciones de volumen en papel, golden 73 tecleando BOX y CYLINDER); SOLIDEDIT con Cara Extruir (nodo `push`), Cuerpo Comprobar y Cuerpo Separar, y las otras once ramas dichas en el propio diálogo (`solids-edit.ts`); y el techo (2) —«todo punto que el usuario señala vive en z=0»— ya no es así: PLINE y RECTANG dibujan EN el plano del SCU inclinado, CIRCLE y ARC y las primitivas honran la planta elevada (`spatial: "elevation"`, el motor distingue elevado de inclinado), se teclea `x,y,z`, y el DXF conserva la cota en 30/31, la elevación, la polilínea 3D y devuelve al mundo el SCU reflejado (`verification/z-frontiers.spec.ts`, con `dxf-parser` de oráculo). Siguen faltando las seis transformadas 3D, las superficies, la malla, y el plano INCLINADO para círculos, arcos, primitivas y la importación DXF (normal ≠ ±Z), que la ESCALERA lista como «todavía no». La rúbrica gana la fila `modeling3d` (5 pt de DESTINO, denominador 265): sigue siendo autoevaluación y así hay que citarla.

Y lo que hay tiene tres techos que verifiqué ejecutando el código: (1) el kernel es FACETADO — extruí un círculo de Ø300 y el cuerpo salió con 66 caras, todas de tipo `plane` (`f.surface.kind`), volumen 211 717 023 contra πr²h = 212 057 504, 0,161 % de error; CylinderSurface/ConeSurface/SphereSurface/TorusSurface/NurbsSurface están declaradas en `brep/surfaces.ts` y `brep/nurbs.ts` y NADIE las produce, porque todo constructor termina en `attachPlanarSurfaces`, que pisa la superficie con un plano. Una columna es un prisma de 64 lados. (2) Todo punto que el usuario señala vive en z=0: `Layout3DEditor.tsx:6605` devuelve `{x, y}` de `floorWorld` y el motor entero come `CadPoint2`. (3) De edición de caras hay UN gesto —PRESSPULL sobre cara— y ninguna designación de aristas: el motor no tiene siquiera un bit `CAD_ACCEPT_EDGE_PICK` (`command-types.ts:92-113` sólo llega a FACE_PICK=128).

El 20 % que sí hay es real y no es poco: EXTRUDE con desmoldeo, REVOLVE, SWEEP, LOFT, las tres booleanas (fundiendo árboles, no horneando), SLICE, SECTION, INTERFERE, MASSPROP, PRESSPULL sobre cara verificado en navegador (golden 66), y sobre todo FLATSHOT/SOLPROF/SOLVIEW/SOLDRAW con eliminación de líneas ocultas gobernada por el SCU — el camino por el que el 3D se paga a sí mismo. Los specs de esos comandos los corrí y están verdes.

Aviso de rigor: la rúbrica del repo NO mide esta área. `docs/competitive/rubric.json` le asigna 7 puntos de 216 a la fila `brep`, en el grupo `frontier` y con alcance «destino», y su propio `gap` declara que el kernel es facetado. Cuatro de sus cinco criterios premian que el código exista con spec, no que un profesional pueda usarlo; el criterio «NURBS, superficies y teselado» vale 1 punto por código sin un solo productor. Es autoevaluación y así hay que citarla.

### De 3D a documentación: secciones, vistas y plantas derivadas (SOLVIEW/SOLDRAW, FLATSHOT/SOLPROF, SLICE/SECTION) — 30 %

La maquinaria está entera y es seria: SOLVIEW crea la ventana con sus cuatro capas -VIS/-HID/-HAT/-DIM, coloca una "placa" determinista en el modelo, elige escala normalizada y congela capas por ventana (`layout/solview.ts`); SOLDRAW dibuja el perfil y el sombreado del corte, es asociativo por huella y respeta lo editado a mano (`layout/soldraw.ts`); FLATSHOT y SOLPROF aplanan desde el SCU con eliminación de líneas ocultas ANALÍTICA y exacta (`flatshot.ts` → `view/hidden-line-solver.ts`); y todo llega a la lámina y al trabajo de trazado. Lo verifiqué corriendo `layout/solview-golden.spec.ts` (verde: 4 muros → planta + 2 alzados + corte en A3 con cajetín, y control negativo de la asociatividad), `engine/commands/solids-flatshot.spec.ts` (63 comprobaciones, el aplanado se acota a 3.000 mm con el motor de cotas de siempre) y `view/hidden-line-solver.spec.ts` (82 comprobaciones, mediana 79,6 ms sobre 500 de presupuesto).

El 70% que falta no es lista de comandos, es que lo que sale no se entrega. Medido por mí ejecutando el repo: (a) la vista que llega a la lámina no resuelve qué tapa a qué entre cuerpos distintos —y se declara exacta—; (b) los huecos no existen en la vista derivada: alzados y cortes salen sin puertas ni ventanas; (c) el único camino con oculta exacta (FLATSHOT) RECHAZA los muros, así que el modelo del arquitecto no puede usarlo; (d) no hay marca de corte, ni rótulo de vista con escala, ni corte quebrado, ni globo de detalle (el detalle es un ×2 fijo, `solview-commands.ts:DETAIL_ZOOM`); (e) la sección sólo puede ser un plano VERTICAL de dos puntos (`layout/viewport-view.ts:cadViewportSectionView`) — no hay corte horizontal, ni quebrado, ni control de profundidad; (f) una ventana de presentación no puede enseñar una cámara 3D: `paper-space.ts:viewportTransform` es una afín 2D de modelBounds→paperBounds y NADIE fuera de los módulos solview usa `cadViewportProjectPoint`, así que el flujo de AutoCAD "ventana flotante orientada a un alzado + trazado con ocultas" no existe; (g) no existe la familia SECTIONPLANE/LIVESECTION/SECTIONPLANETOBLOCK ni la moderna VIEWBASE/VIEWSECTION/VIEWDETAIL/VIEWUPDATE (comprobado contra `engine/command-summaries.ts`; sí están SOLVIEW, SOLDRAW, SOLPROF, FLATSHOT, SLICE, SECTION); (h) un modelo 3D ajeno no entra: `dxf-import.ts:307` declara que 3DSOLID, MESH y REGION los descarta el parser antes del mapeador, y `dwg-decoder-matrix.json` no lista 3DSOLID.

Dos avisos de rigor. Primero: esta área NO tiene ninguna fila en `docs/competitive/rubric.json` —revisé las 26 categorías, la única de 3D es `brep` (7 pt, ámbito "destino"), y las cadenas SOLVIEW/SOLDRAW/FLATSHOT/SOLPROF no aparecen en el archivo—, así que el 88,6% autoasignado no dice nada de aquí ni a favor ni en contra. Segundo: no hay ni un golden de navegador que toque esta área (`grep` en `apps/web/e2e/` por SOLVIEW/SOLDRAW/FLATSHOT/solview: cero). Está probada a nivel de módulo con fixtures propias (peldaño 3 de la ESCALERA); por la interfaz es peldaño 2, y el botón de cinta es el genérico que genera `ribbon.ts` por patrón de nombre, sin diálogo ni composición de juego de vistas.

### Los siete toolsets especializados (Architecture, Mechanical, Electrical, MEP, Map 3D, Plant 3D, Raster Design) — 6 %

Antes del número, el dato que ordena esta área: **la rúbrica no tiene ni una fila para ella**. Sus 26 categorías (`docs/competitive/rubric.json`, volcadas con python) son draw-2d, modify, dimensions, hatch, mtext, layers, blocks, dxf, layouts, persistence, command-line, annotation-extras, xrefs, performance, review, json-import, api-sdk, plugins, events, object-storage, dwg, brep, wasm, geo, integrity, growth. La única con sangre vertical es `geo` — 3 puntos de 216, el 1,4% — y cubre leer SHP/LAS, reproyectar e indexar, nada de lo que Map 3D realmente es. El propio documento lo declara: el alcance «destino» dice que «contra AutoCAD completo más toolsets el producto está hoy en torno a una fracción» sin poner cifra (rubric.json:2840), y `docs/history/execution/CAD_PROFESSIONAL_PARITY_GRAND_LEAP_IV.md:63` lista los «siete toolsets verticales» entre lo que permanece `missing` «y no se usará como claim comercial». Así que el 88,6% autoasignado y este 6% no se contradicen: **el 88,6% se mide con una regla que en esta área no tiene marcas**. Eso es honestidad del repo, no engaño — pero el listón que puso el dueño («que lo prefieran a AutoCAD con sus siete toolsets») sí cae aquí, y aquí no hay regla.

Mi medición, comprobada en el árbol (HEAD 5be9239):

**Lo único vertical que existe en el registro de comandos son cuatro nombres.** Extraje el registro de `apps/web/src/lib/cad/engine/command-summaries.ts`: 194 nombres, y de ellos sólo `WALL`, `DOOR`, `WINDOW` y `NORMAMX` no son AutoCAD base. Barrí 40 comandos característicos de toolset (AMBOM, AMBALLOON, AMPOWERDIM, AMSHAFT, AECWALLSTYLE, AECSPACE, MAPIMPORT, MAPCLEAN, ADEDEFDATA, PLANTPROJECT, PIPESPEC, AEWIRE, DUCTADD, VTOOLS, IMAGEADJUST, CENTERLINE, CENTERMARK…) contra `apps/web/src` y `apps/api/src`: cero aciertos salvo `SLICE` (que es 3D base) y `DOORADD` (que es un comentario). **Nombres de comando inciertos**: no afirmo que ésos sean los identificadores exactos de cada toolset; los di como sonda, y el resultado —cero— es el mismo con cualquier grafía.

**Y sólo dos tipos verticales de entidad.** La unión canónica completa (`cad-document.ts` + `cad-entities-v4/v5/v6/v7/v10.ts`) es: arc, attdef, box, circle, connector, dimension, ellipse, hatch, image, insert, line, mleader, mtext, opening, point, polyline, ray, region, solid, solid3d, spline, station, table, text, wall, wipeout, xline. `wall` y `opening` son todo. No hay escalera, cubierta, muro cortina, miembro estructural, local/espacio, ducto, tubería, charola, bandeja, accesorio, válvula, instrumento, cable, componente ni parcela. `station` y `connector` son legado congelado del planificador industrial.

Toolset por toolset:

· **Architecture ≈ 20%.** Es el único con sustancia. Hay `wall` paramétrico (eje+grosor+altura, con encadenado tipo LINE), `opening` alojado en muro que se NIEGA a colocarse si no cabe, uniones L/T/colineal derivadas (`wall-joins.ts`), cuerpo B-rep con vanos recortados (`wall-solid.ts`), losas (`room-solid.ts`), detección automática de locales del grafo de ejes y ~22 bloques arquitectónicos sembrados (`apps/api/src/migrations/seed/architectural-blocks/`: puertas, ventanas, baño, cocina, mobiliario, circulación). Falta: estilo de muro por COMPONENTES (un muro de Valle es una losa homogénea con uno de cinco colores, `wall-materials.ts`), muro cortina, escalera y cubierta como objeto, miembro estructural, espacio como objeto con nombre, conjuntos de propiedades, etiquetas, cotas AEC, sistema de visualización, niveles/plantas (busqué `nivel|level|storey|floor` en `cad-document.ts`: cero), y corte/alzado derivados del modelo.

· **Mechanical ≈ 3%.** Existen REGION, MASSPROP y las restricciones paramétricas (base de AutoCAD, no toolset). `TOLERANCE` no crea una entidad de tolerancia: emite polilínea + líneas + MTEXT marcados con metadatos (`engine/commands/annotate-tolerance.ts:186-230`), no se reedita y no vuelve como TOLERANCE. Sin catálogo de piezas normalizadas, sin lista de materiales, sin globos, sin acotación de potencia, sin símbolos de soldadura ni de acabado superficial, sin CENTERLINE/CENTERMARK, sin ejes ni cuadro de barrenos. La plantilla «Pieza mecánica» (`templates-disciplines.ts`) coloca sus barrenos como `kind: "zone"`, y en `template-document.ts` todo `kind` desconocido cae en `default: return [rect(idBase)]`: **son rectángulos rotulados, no una brida**.

· **Electrical ≈ 1%.** Nada. Ni un comando, ni una entidad de cable o componente, ni numeración de conductores, ni escalerilla, ni PLC, ni base de catálogo, ni informes. La plantilla «Diagrama unifilar» son ocho rectángulos (`power_panel`, `cabinet`, `network_drop` → `default` → `rect`).

· **MEP ≈ 0%.** Cero. `grep -iE '\bduct\b|\bpipe\b'` en `apps/web/src` da 2 y 1 aciertos, todos en un mapeo de nombres de capa DXF (`dxf-layer-map.ts:33`) que manda «HVAC-DUCT» a la capa `utilities`. No hay entidad de ducto/tubo/conduit, no hay conectividad, no hay sistemas, no hay cálculo de sección, no hay detección de interferencias (lo que hay —`collisions.ts`, `rule-engine.ts`— opera sobre cajas AABB del planificador industrial, no sobre sólidos).

· **Map 3D ≈ 8%, y ese 8% es calidad, no cobertura.** `apps/web/src/lib/geo/` es un subárbol serio: lector de shapefile con topes, lector DBF con codificación, LAS hasta 20 M de puntos, índice espacial, y `crs.ts` con la serie de Krüger validada contra tres oráculos independientes. Pero: **7 sistemas de referencia** (WGS84 + UTM 11N–16N), NAD27/NAD83 rechazados por su nombre a propósito — para un producto que dice ser universal y de cualquier país, eso es México y nada más. Y lo más caro: **los atributos del DBF no llegan al dibujo**. `shapefileToCadEntities` (`geo-cad-document.ts:73-131`) sólo emite point/polyline; `options.attributes` se usa exclusivamente para un aviso de codificación (línea 203), nunca para rotular, y **ninguna entrada del manifiesto de pérdidas declara que se tiraron**. La clave catastral y la superficie registrada desaparecen en silencio. Además la importación crea un documento NUEVO (`document-import.ts:373`, parte de `layoutToCadDocument({})`), no inserta el predio en el plano abierto — que es justo el caso de uso que la cabecera del módulo dice resolver. Y `lib/geo/las.ts` y `point-index.ts` no tienen ni un importador fuera de su spec (mismo patrón que el motor de inferencia). Sin clasificación de entidades, sin datos de objeto, sin topología ni análisis de red, sin limpieza de dibujo, sin simbolización temática, sin COGO, sin modelos de industria.

· **Plant 3D = 0%.** Cero aciertos de `p&id`, `isogen`, `piping`, `pipespec`. No hay P&ID, ni especificación, ni catálogo, ni isométricos, ni gestor de datos.

· **Raster Design ≈ 2%, y el 2% no se ve.** Hay entidad `image`, `IMAGE`/`IMAGEATTACH` (`draw-fills.ts:310-350`), recorte, tiradores, atenuación, y hasta un `PDFATTACH` completo (`pdf/pdf-underlay.ts`: escalado a distancia conocida, páginas, bloqueo, recorte, listado). **Y los píxeles no se pintan en ninguna parte.** `grep -rn "TextureLoader|CanvasTexture|DataTexture|drawImage|createImageBitmap"` sobre `apps/web/src` devuelve exactamente dos consumidores: el atlas de texto y helpers de escena. La palabra «image» no aparece **ni una vez** en todo `apps/web/src/lib/cad/render/`, ni en `entity-three.ts`, ni en `paper-space.ts`, ni en `plot/`. El único camino de dibujo es `imagePaths` (`fill-entity-adapters.ts:230-245`), que devuelve el rectángulo del marco y el contorno de recorte. Sin ver la imagen, la limpieza ráster, la manipulación de entidades ráster y la vectorización no tienen dónde apoyarse.

Ponderado por peso comercial de cada toolset (Architecture 30, Mechanical 20, Electrical 15, MEP 15, Map 3D 8, Plant 3D 7, Raster 5) sale 7,5%; a partes iguales sale 4,9%. **6%** es el punto honesto entre los dos. Con la advertencia de que el 6% se concentra casi entero en Architecture: para un ingeniero eléctrico, de instalaciones o de proceso, el número de esta área es cero, y ahí «arquitectos e ingenieros» se parte por la mitad.

### Automatización, personalización y API — 30 %

La rúbrica se autoasigna 23/27 en esta área (11/12 «Línea de comandos, alias y scripting» + 6/7 «API y SDK» + 6/8 «AutoLISP y plugins», docs/competitive/autocad-2027-gap-matrix.md:137,148,149) = 85%. Mi número es 30% porque la rúbrica mide que el intérprete EXISTE y yo medí qué CORRE.

Lo que falta, no lo que hay:

1. Ninguna rutina que un despacho YA TIENE arranca. Escribí una rutina de despacho típica (prólogo con CMDECHO/OSMODE, crear capa, RECTANG, epílogo) y la ejecuté con `runLispRoutine` sobre el árbol real: muere en la línea 2 con «getvar: la variable de sistema "CMDECHO" no existe en este producto. Sólo están CLAYER e INSUNITS», 0 entidades creadas. `setvar` lanza SIEMPRE (interaction.ts:275-279). No existen `entsel`, `nentsel`, `osnap`, `textbox`, `open`/`close`/`read-line`/`write-line`, `findfile`, `getfiled`, `grread`, `tblnext`, `namedobjdict`/`dictsearch`, ni nada de la familia `vl-load-com`/`vlax-*`/`vla-*`/`vlr-*` (0 apariciones en apps/web/src/lib/lisp/, comprobado). `entmake` no sabe construir TEXT, HATCH ni DIMENSION. Los 127 builtins que sí hay (defsubr/defgen contados) son el AutoLISP de 1990 sin Visual LISP y sin E/S.

2. Lo que se escriba aquí no sale del navegador. La biblioteca `.lsp` vive en localStorage por navegador (library-storage.ts, cabecera: «quien abra el mismo dibujo en otro ordenador no las tiene»); no hay endpoint `/v1/cad/lisp/*`. El ejecutor de guiones sin interfaz (`engine/script-runner.ts`, 300 líneas, escrito para «un lote, sin que nadie mire») NO TIENE UN SOLO LLAMADOR fuera de su spec. La API JS de plugins (`lisp/plugins/api.ts`) tampoco: ningún componente la importa. Ambos son peldaño 1 de vuestra propia ESCALERA.

3. La interfaz no se personaliza. No hay CUI/CUILOAD, no hay macros de botón, no hay ACTRECORD, no hay DIESEL (0 apariciones en todo apps/web/src). La cinta es GENERADA por patrón de nombre (ribbon.ts), no curada ni editable. Las paletas de herramientas existen como catálogo con `save`/`remove` pero nadie las llama fuera de specs y `-TOOLPALETTES` es `mutates: false` (settings-palettes.ts:292): sólo lista. No hay alias de usuario (alias-table.ts es un `const`).

4. La API no admite máquinas. 89 de 104 operaciones exigen `sessionCookie` (operations.generated.json); cero API keys o tokens de servicio; el SDK es `private: true`, UNLICENSED; y la política declara «TODO es internal salvo que la documentación pública lo nombre» (docs/api/POLITICA-API-PUBLICA.md). Un script en un servidor no puede autenticarse.

5. .NET/VBA/ObjectARX: no existen, y la rúbrica lo declara sin fingirlo (plugins.dotnet-vba, «todaviaNo»). Eso está bien dicho.

Lo que SÍ funciona y sostiene el 30%: intérprete real con sandbox de presupuesto y superficie declarada; `(command …)` conduce comandos nativos de verdad (probé LINE, CIRCLE, ERASE con ssget, TEXT: OK); `entmake`/`entget`/`entmod` por códigos DXF con LINE/ARC/LWPOLYLINE/MTEXT/INSERT; `ssget "X"` con filtros simples; 140 alias de acad.pgp; SCRIPT interactivo con selector de archivo; golden 47-cad-lisp-appload de extremo a extremo; 21 atajos de teclado reasignables con UI (CadWorkspaceDock.tsx:312).

> Corrección fechada 2026-09-02: eran 12 atajos reasignables, no 21 (`CadWorkspaceDock.tsx`, `SHORTCUT_IDS`, sin cambios desde 41df43a del 2026-08-30). La cifra de la frase anterior se conserva porque el informe está fechado.

> Nota fechada 2026-09-02 sobre el instrumento: la rúbrica (`rubric.json` 2026-09-02.1) publica los dos denominadores con su etiqueta —**Alcance de HOY** (flujo diario 2D, 191 pt) y **Alcance de DESTINO** (AutoCAD completo con sus siete toolsets, 260 pt)— y tiene desde hoy el eje de **reconocimiento** (14 pt, medidos en pantalla por goldens y por specs que leen bytes: texto dibujado, orden de la cinta, teclas a la línea de comandos, letras sin colisión con acad.pgp, ventana por arrastre, nada tapa el lienzo, tipos de línea con su forma) y las **siete filas de toolsets** (28 pt, a cero salvo la envolvente de Architecture). Toda cifra de este informe que diga «88,6 %» es la del alcance de HOY con la rúbrica 2026-08-22.1, y así debe citarse.

Nota de rigor: dos afirmaciones mías sobre AutoCAD las doy como probables, no ciertas — que `vl-load-com` ya se autocarga en versiones recientes (no cambia la conclusión: `vlax-*` no existe aquí de ninguna forma), y el alcance exacto del prefijo `_` para independencia de idioma en palabras clave.


---

# LA CONTRADICCIÓN ESTÁ RESUELTA, Y NO ES "LA RÚBRICA ESTÁ INFLADA"

**La rúbrica y el dueño miden ejes ortogonales. La rúbrica mide CAPACIDAD. El dueño midió RECONOCIMIENTO. Hoy nadie mide el segundo — literalmente nadie: no hay una sola fila, un solo gate ni un solo golden sobre él.**

La prueba es contable, no retórica. `docs/competitive/rubric.json` tiene **26 categorías** (`draw-2d`, `modify`, `dimensions`, `hatch`, `mtext`, `layers`, `blocks`, `dxf`, `layouts`, `persistence`, `command-line`, `annotation-extras`, `xrefs`, `performance`, `review`, `json-import`, `api-sdk`, `plugins`, `events`, `object-storage`, `dwg`, `brep`, `wasm`, `geo`, `integrity`, `growth`). **Ninguna es la interfaz, los gestos, el cursor, la cinta, la barra de estado ni la disposición.** Y sus 336 items de evidencia se reparten así (contados sobre el JSON):

| kind | nº | qué comprueba de verdad |
|---|---|---|
| `file` | 87 | que un archivo exista |
| `command` | 76 | que un nombre esté en el registro |
| `spec` | 71 | que exista un `.spec.ts` bajo `src/` |
| `alias` | 29 | que un alias resuelva |
| `golden` | 27 | que exista un archivo en `e2e/` |
| `grep` | 21 | que un patrón aparezca N veces |
| `metric`+`jsonValue`+`manual` | **22** | un VALOR medido |

**314 de 336 items son comprobaciones de existencia. 22 miran un valor. Cero miran la pantalla.**

El caso testigo es `command-line.ui`, **2 puntos**, texto *"Línea de comandos en el editor con prompts, opciones y eco"*. Su evidencia entera es: existe `CadCommandLine.tsx`, existe un `.spec.ts`, existe `44-cad-command-line.spec.ts`. Se lleva 2/2 — y como demuestro abajo, esa línea de comandos **nunca tiene el foco**, así que teclear `L` mirando el plano no escribe `L`: activa otra herramienta. La rúbrica no puede ver eso porque no pregunta por ello.

Así que las dos cifras son ambas ciertas. **88,6% de capacidad y ~0% de reconocimiento no se contradicen: son ejes distintos, y el producto se juega la venta en el que no tiene instrumento.**

---

# 1 · QUÉ VE ALGUIEN QUE ABRE AUTOCAD Y NO VE AQUÍ

Comprobado leyendo `apps/web/src/components/cad/`. Corrijo de entrada la hipótesis fácil: **"le falta la cinta" es FALSO**. Casi todo el mobiliario existe.

### EXISTE Y SIRVE — y es más de lo que esperaba

| Pieza | Dónde | Nota |
|---|---|---|
| **Cursor en cruz de verdad** | `Layout3DEditor.tsx:5986` `style.cursor="none"` + overlay `cad-crosshair:15862-15885` | Cruz + **pickbox** + **apertura de snap**, con `crosshairPercent` (32%), `pickBoxPx` (8), `aperturePx` (12) configurables. Esto es AutoCAD auténtico, mejor de lo que la rúbrica presume. |
| **Línea de comandos** | `command-line/CadCommandLine.tsx` | Prompt `Comando:`, monoespaciada, log, recuperación con ↑/↓, cascada de Esc, opciones pulsables, Espacio repite. Bien hecha. |
| **Cinta con 6 pestañas** | `ribbon/CadRibbon.tsx`, montada en `Layout3DEditor.tsx:15495` | Inicio/Insertar/Anotar/Vista/Salida/Administrar, generada del registro, minimizable, 204 comandos cubiertos. |
| **Conmutadores OSNAP/ORTHO/POLAR/OTRACK** | `palettes/CadDraftStatusBar.tsx` | Con sus F3/F8/F10/F11 y el incremento polar. |
| **Menú contextual con "Repetir último comando"** primero | `Layout3DEditor.tsx:15887-15952` | |
| **Paletas** | Capas, Propiedades, Estilos, Bloques, Xref, Sombreado, Selección, MText, MLeader, Layout | Reales y pobladas. |

### EXISTE, PERO NO SE PARECE

**(a) La cinta está ordenada ALFABÉTICAMENTE. Ejecuté `CAD_RIBBON_DATA` y la pestaña Inicio sale así:**

```
Inicio (74 comandos, 6 paneles)
orden de paneles: Capas y propiedades | Dibujo | Modificar | Sólidos | Sombreado | Utilidades
 - Capas y propiedades [2]: LAYMCH, MATCHPROP
 - Dibujo [31]: ARC, ATTEDIT, BURST, CHECKSTANDARDS, CIRCLE, DIVIDE, DONUT, DOOR,
                DRAWORDER, ELLIPSE, GETVAR, IMAGE, IMPORT, INTERFERE, LINE, ...
```

Tres roturas en una sola línea:

1. **Lo primero que se ve al abrir es un panel de DOS botones llamado "Capas y propiedades"**, porque `.sort(([a],[b]) => a.localeCompare(b,"es-MX"))` (`ribbon.ts:180`) ordena los paneles por nombre. En AutoCAD la pestaña Inicio empieza SIEMPRE por **Dibujo**, luego **Modificar**. Aquí Dibujo es el segundo.
2. **LINE es el botón número 15 del panel Dibujo**, detrás de `CHECKSTANDARDS` y `GETVAR`. El comando más tecleado del CAD, en el puesto 15, por orden alfabético.
3. **El panel "Dibujo" contiene GETVAR, CHECKSTANDARDS, IMPORT, DRAWORDER, ATTEDIT, BURST, INTERFERE, SECTION** — ninguno es un comando de dibujo. Es la papelera: `ribbonPanelForCommand` (`ribbon.ts:124-138`) manda a "Dibujo" todo lo que no case ningún patrón y caiga en la pestaña Inicio. Y "Administrar > Herramientas" es la papelera mayor, con **31 comandos** donde conviven `AUDIT`, `COLOR`, `ETRANSMIT`, `RENAME` y **las 11 restricciones geométricas GC\***.

**(b) Un icono por PANEL, no por comando.** `ribbon-icons.ts` lo declara sin rodeos: *"Un icono por PANEL, no por comando… Repetir el icono del panel en cada botón es honesto"*. Consecuencia: el panel Dibujo son **31 iconos `PenLine` idénticos** en fila, de 16 px (`h-4 w-4`, `CadRibbonButton.tsx:47`), con el nombre del comando debajo en `type-micro`. La cinta de AutoCAD se reconoce **por sus iconos**, memorizados durante veinte años. Un muro de 31 plumas iguales es exactamente lo contrario. *(La honestidad del comentario es real; el efecto sobre el reconocimiento, también.)*

**(c) La cinta hace scroll horizontal.** `overflow-x-auto` + paneles `shrink-0` (`CadRibbon.tsx:79`, `CadRibbonPanel.tsx:17`) y ningún tope de ancho: 74 botones × 64 px ≈ 4.700 px en Inicio. La cinta de AutoCAD **nunca** se desplaza en horizontal — colapsa paneles en desplegables. *(El scroll está en el código; el ancho exacto es mi cálculo, no una medición en pantalla.)*

**(d) Falta la pestaña PARAMÉTRICO**, y es la que más duele comercialmente: las restricciones 2D son lo que separa AutoCAD completo de LT, están implementadas (12 GC\* + 4 DC\*), y están repartidas entre "Administrar > Herramientas" (junto a AUDIT y RENAME) y "Anotar > Anotación". La única ventaja de gama alta del producto está enterrada en un cajón de sastre.

**(e) La barra de estado es una PÍLDORA FLOTANTE en la esquina, con telemetría de SaaS.** `CadStatusBar.tsx:130`: `absolute bottom-3 right-3 … rounded-xl … shadow-xl`. No cruza la pantalla; flota abajo a la derecha. Y lo que dice, en orden: unidad · coordenadas · `modelo · revisión · v37` · estado de guardado · `Recovery local activo` · **`API online`** · `Layer X` · `Grilla on / Snap grid` · OSNAP/ORTHO/POLAR/OTRACK · `DSETTINGS` · `ESTILOS` · **`Release <estado>`** · **`Validación warn`** · **`CAD critical`** · **`Clearance 3`** · **`Safety 1`** · `Highlights` · `DXF 4` · `Instantáneas 2`.

De esas ~20 casillas, **cuatro existen en AutoCAD**. Las coordenadas están a la **derecha** (en AutoCAD, abajo a la izquierda, lo primero). Y faltan los conmutadores que un dibujante busca con el dedo sin mirar: **rejilla (F7) y forzado (F9) como botones** (sólo hay un texto `Grilla on / Snap grid`), **entrada dinámica**, **grosor de línea**, **transparencia**, **ciclo de selección**, **espacio de trabajo**, **pantalla limpia**, y sobre todo **el selector de ESCALA DE ANOTACIÓN** — el desplegable `1:100` que en AutoCAD vive ahí y gobierna toda la anotatividad que el equipo ya midió rota.

**(f) Las pestañas Modelo/Presentación viven DENTRO DE UN MODAL.** Es el hallazgo que más me sorprendió. El único `cad-layout-tab-*` del repo está en `Layout3DEditor.tsx:17820`, dentro de `showSheetPackage`: `absolute inset-0 z-[82] … bg-black/55` — un diálogo a pantalla completa titulado **"Paquete premium de entrega CAD"**, con una insignia de `{n}% listo` y un botón "Demo 3 hojas". La franja de pestañas más reconocible de AutoCAD, siempre visible abajo a la izquierda, aquí hay que abrir un modal de marketing para verla. **Y no existe pestaña "Modelo"**: sólo espacios papel.

**(g) El ViewCube no aparece en 2D.** `Layout3DEditor.tsx:15817`: `{viewMode === "3d" && (…<CadViewCube/>…<CadNavigationBar/>…)}`, y el modo por defecto es `'2d'` (`cad-workspace.ts:58`). Así que en la vista por defecto no hay ViewCube ni barra de navegación. Además el propio componente declara que **no es un ViewCube**: *"Un ViewCube de verdad se orienta con la cámara y se arrastra; eso exige llevar el azimut/elevación vivos hasta aquí"* — son seis botones con forma de cubo isométrico fijo. *(Incierto por el lado de AutoCAD: no estoy seguro de si en estilo visual 2D Wireframe el ViewCube se muestra por defecto o en su variante de brújula. La barra de navegación sí se muestra en 2D, de eso sí estoy razonablemente seguro.)*

**(h) No se dibuja el icono SCU.** `engine/commands/ucs-view-commands.ts:14` lo dice él mismo: *"Ninguno de los dos DIBUJA nada aquí"*. `UCSICON` fija estado; no hay icono en pantalla. AutoCAD lo pinta siempre en el origen.

**(i) La barra superior es de un gestor documental, no un CAD.** Donde AutoCAD pone el acceso rápido (Nuevo/Abrir/Guardar/Trazar/Deshacer) y el nombre del dibujo, aquí hay ~15 iconos: *Revisión de diseño, Cantidades, **Paquete de entrega — readiness**, Publicar, PNG, .glb, DXF, muros, **Versiones/escenarios**, **Celdas/zonas**, **Clonar layout**, ayuda*; luego un desplegable de **estado de aprobación (Borrador / En revisión / Aprobado)**; y a la derecha un **botón "Guardar" grande en rojo carmesí** (`style={{background:"#e11d48"}}`, línea 15470). Más arriba, deslizadores de **azimut y altura solar** y un panel de "huella" Ancho/Largo/Rejilla con "Aplicar tamaño". Ese vocabulario —*readiness, escenarios, aprobación, clonar layout, sol/sombras*— es el que el dueño leyó en la captura, y no es de AutoCAD.

### NO EXISTE

Barra de menús (Archivo/Edición/…), acceso rápido, nombre del dibujo a la vista, **pestañas de documento** (varios dibujos abiertos a la vez), barras de herramientas clásicas acoplables, paletas anclables/plegables por el usuario, **ViewCube en 2D**, icono SCU, selector de escala de anotación, y el conmutador de espacio de trabajo.

---

# 2 · LOS GESTOS: LO QUE SE ROMPE EN LOS PRIMEROS DIEZ SEGUNDOS

Aquí está el corazón del "no se parece en lo absoluto". **No es la apariencia: es que el producto responde otra cosa.**

## 2.1 · La línea de comandos NUNCA tiene el foco, y está escrito a propósito

`Layout3DEditor.tsx:16279-16283`, comentario literal en el JSX:

> *"La línea de comandos. **No se enfoca sola**: robarle el teclado al lienzo rompería Supr, Ctrl+Z y las teclas de captura… Se pulsa y se escribe."*

Verificado: **no hay un solo `autoFocus` ni `.focus()` sobre `cad-command-input`** en todo el módulo (el único `.focus()` es tras pulsar una palabra clave, `CadCommandLine.tsx:187`). Y `interpretEditorKeyBeforeEngine` (`editor-keyboard.ts:157`) abre con `if (event.targetKind === "editable") return null` — es decir, el teclado tiene **dos dueños según dónde esté el foco**.

En AutoCAD la línea de comandos tiene el foco SIEMPRE; escribir en cualquier sitio escribe ahí. Ése es el modelo de interacción entero. Aquí hay que hacer clic en la caja, y **cada clic en el plano —o sea, cada punto que se designa— devuelve el foco al lienzo**.

**Lo confirma el propio golden del repo.** `apps/web/e2e/golden/44-cad-command-line.spec.ts`, líneas 48-51 y 100-102:
```js
const input = page.getByTestId('cad-command-input');
await input.click();          // ← clic OBLIGATORIO antes de cada comando
await input.fill(value);
await input.press('Enter');
```
La prueba tiene que hacer clic en la caja antes de cada orden y antes del Espacio. Nunca prueba teclear con el lienzo enfocado, porque eso no funciona.

## 2.2 · La misma tecla significa DOS cosas distintas

Lo medí ejecutando el código del repo: enfrenté `CAD_COMMAND_ALIASES` (`engine/alias-table.ts:20`) contra `interpretEditorKeyBeforeEngine`/`AfterEngine` con el registro real.

| Tecla | En la línea de comandos | Suelta sobre el lienzo |
|---|---|---|
| **A** | ARC | herramienta *pasillo* |
| **B** | BLOCK | rectángulo |
| **C** | CIRCLE | círculo ✓ |
| **E** | ERASE | **abre el diálogo de exportar DXF** |
| **F** | FILLET | zoom a extensión |
| **G** | GROUP | conmuta la rejilla |
| **I** | INSERT | biblioteca de símbolos ≈ |
| **L** | LINE | línea ✓ |
| **M** | **MOVE** | **herramienta de medir** |
| **O** | **OFFSET** | **conmuta OSNAP** |
| **P** | **PAN** | **polilínea** |
| **R** | — | rota la selección 15° |
| **T** | MTEXT | texto ✓ |
| **V** | VIEW | modo selección |
| **W** | WBLOCK | herramienta muro |
| **Z** | **ZOOM** | inserta un *área/zona* |

De 21 letras con alias, **cuatro coinciden** (L, C, T, I). Doce se contradicen, y entre ellas están MOVE, PAN, OFFSET, ERASE y ZOOM. Y hay una diferencia agravante: en AutoCAD `M` no hace nada hasta que pulsas Enter — tienes la oportunidad de corregir. Aquí **disparan en `keydown`, sin Enter**. Un usuario que teclea `M` para mover ya está en la herramienta de medir antes de tocar Enter. Uno que teclea `E` para borrar tiene encima un diálogo de exportación DXF.

**La rúbrica premia esto.** `command-line.alias-coverage` da **2 puntos** por que resuelvan *"H, LA, DLI, T, Z, P, I y B"* — con evidencia `{kind:"alias"}`, que sólo mira la tabla. `Z`, `P`, `I` y `B` cobran el punto en la tabla mientras el teclado hace otra cosa. Y `command-line.alias-complete` (1 pt) razona: *"La memoria muscular no distingue alias importantes de secundarios: un alias que cuelga rompe la confianza en todos."* El razonamiento es exactamente correcto y el instrumento no puede verlo.

*(Nota de rigor: `S` y `X` salieron "(nada)" en mi sonda contra el intérprete puro; están declarados en `keyboard-shortcuts.ts` como *escalar* y *espejo* pero no los resuelve ninguna de las dos fases, así que los ejecuta otro sitio del monolito o no se ejecutan. No los cuento.)*

Y el propio código cree lo contrario. `CadToolPalette.tsx:38-43`:
> *"El tooltip enseña el atajo, y ésa es la joya que estaba enterrada: `L` para línea, `C` para círculo, **`M` para medir**… Un usuario de AutoCAD que pasa el cursor sobre «Línea» y lee «L» acaba de descubrir que su memoria muscular de veinte años sirve aquí."*

`M` en AutoCAD es MOVE. El argumento de venta está construido sobre una coincidencia que en la mayoría de las teclas no se da.

## 2.3 · Los otros seis gestos

| Gesto | Estado | Prueba |
|---|---|---|
| **Ventana / captura con el ratón** | **ROTO por defecto** | `Layout3DEditor.tsx:6952`: `else if (e.button === 0 && e.shiftKey)` — *"Shift+arrastre en el fondo = marquee"*. El arrastre sin Shift **panea**, porque en plano `controls.mouseButtons.LEFT = THREE.MOUSE.PAN` (`camera-policy.ts:96`). El arrastre simple sólo designa si el usuario elige antes "Ventana" o "Cruce" en `CadSelectionPalette` (`:6710-6721`); el modo por defecto es `"pick"` (`:1550`). **El primer gesto de cualquier usuario de AutoCAD —arrastrar una ventana sobre unos objetos— mueve el plano.** La semántica der→izq = cruce sí está implementada (`:7223`), pero detrás de un Shift o de un modo que hay que elegir. |
| **Espacio = Enter** | **NO EXISTE en el lienzo** | Sólo dos manejadores de Espacio en todo el CAD: `CadCommandLine.tsx:103` (dentro de la caja) y `native-grip-controller.ts:243` (durante un arrastre de pinzamiento). Con el lienzo enfocado, Espacio no repite ni acepta. En AutoCAD es, con Enter, la tecla más pulsada del día. |
| **Escape para cancelar** | **EXISTE Y SIRVE** | Cascada de 7 pasos, `editor-keyboard.ts:236-252`: salir de pick de sombreado → cerrar paleta → limpiar previsualización → limpiar texto → cancelar dibujo → reponer herramienta → limpiar selección. Mejor especificado que el de AutoCAD. |
| **Botón derecho** | **EXISTE Y SIRVE** | Con comando activo ofrece las palabras clave del paso junto al cursor (`pointer-router.ts:306`); sin comando abre un menú cuyo primer elemento es "Repetir último comando" (`:15895`). Y es configurable a `repeat`/`enter` (`cad-workspace.ts:57`, defecto `'context'`). Esto sí es AutoCAD. |
| **Rueda para zoom** | **EXISTE A MEDIAS** | `zoomToCursor` no se fija en ningún sitio del repo, así que conserva su defecto `false` (`three@0.185.1`, `OrbitControls.js:306`), y la aplicación del desplazamiento al cursor está condicionada a él (`:806`): el zoom va al centro de la vista, no al puntero. En AutoCAD siempre va al cursor. Además `enableDamping = true; dampingFactor = 0.1` (`Layout3DEditor.tsx:6150-6151`): la cámara **planea por inercia** al soltar. AutoCAD es 1:1 e instantáneo; la inercia es la firma táctil de un visor 3D web. *(Lo de la rueda lo deduzco del código; merece 30 segundos de confirmación en el navegador antes de escribirlo en un plan.)* |
| **Doble clic para editar** | **NO EXISTE** | Cero coincidencias de `dblclick`, `detail === 2` o equivalente en `components/cad/` y `lib/cad/`. En AutoCAD el doble clic es un verbo universal: sobre MTEXT abre el editor, sobre bloque BEDIT/atributos, sobre polilínea PEDIT, sobre sombreado HATCHEDIT, sobre cota edita el texto; y el doble clic de la rueda es Zoom Extensión. Aquí el doble clic no hace nada en ningún objeto. |

---

# 3 · CÓMO MEDIR EL RECONOCIMIENTO, PORQUE HOY NADIE LO MIDE

La rúbrica no está inflada: está **incompleta en un eje entero**, y ese eje es el que el dueño usó. Añadir filas de reconocimiento a `rubric.json` sería el error: la misma maquinaria (`command(item)` = está en el registro, `golden(item)` = el archivo existe) volvería a puntuar la existencia. **El reconocimiento necesita otro instrumento.**

Propongo dos, y los dos son baratos porque el repo ya tiene la infraestructura.

### Instrumento A — LA PRUEBA DE LOS DIEZ SEGUNDOS (automatizable hoy)

Un golden nuevo que ejecute la secuencia que un dibujante hace sin pensar, **con el foco donde cae de forma natural** (el lienzo), y afirme el efecto. Cada renglón es aprobado/reprobado, sin puntos parciales:

1. Abrir. Teclear `L`, Enter → ¿empezó LINE? *(hoy: activa la herramienta línea sin Enter — parcial)*
2. Clic, clic. Pulsar **Espacio** → ¿terminó el comando? *(hoy: no)*
3. Pulsar **Espacio** otra vez → ¿repitió LINE? *(hoy: no)*
4. Teclear `M`, Enter → ¿es MOVE? *(hoy: es MEASURE)*
5. Teclear `E`, Enter → ¿es ERASE? *(hoy: abre exportar DXF)*
6. Arrastrar de izquierda a derecha sobre dos objetos → ¿los designó por ventana? *(hoy: panea)*
7. Arrastrar de derecha a izquierda → ¿los designó por cruce? *(hoy: panea)*
8. Doble clic sobre un MTEXT → ¿abrió su editor? *(hoy: nada)*
9. Rueda sobre una esquina → ¿se acercó a ESA esquina? *(hoy: al centro)*
10. `U`, Enter → ¿deshizo? *(hoy: "Comando desconocido")*

**Marcador de hoy, según lo que he verificado: 0 de 10 limpios.** Y la métrica es honesta porque es un guion de teclado y ratón contra el DOM real — la misma tecnología de los 72 goldens que ya corren, sin necesidad de comparar píxeles.

### Instrumento B — LOS CINCO MINUTOS DE UN EXTRAÑO (no automatizable, y por eso vale)

Cinco arquitectos que usen AutoCAD a diario, sentados delante sin explicación, con tres encargos: *dibuja un muro de 3 m, acótalo, cámbialo de capa*. Se cronometra y se anota **cada vez que la mano hace algo y el producto responde otra cosa**. La única cifra que se publica es **"desconciertos por minuto"**. Esa es la unidad en la que el dueño juzgó el producto mirando una captura, y `manualMaxAgeDays: 180` ya existe en el esquema de la rúbrica para caducar evidencia humana.

### Y ahora el argumento económico, que es la razón de todo esto

**Casi todo lo que rompe el reconocimiento son unas pocas líneas, no un mes de trabajo.** No hay que construir nada: hay que cambiar valores en código que ya funciona.

| Arreglo | Trabajo real |
|---|---|
| Colisión de teclas sueltas | Retirar las letras que chocan de `CAD_KEYBOARD_SHORTCUTS` (`keyboard-shortcuts.ts`) y enrutar la escritura al motor. Es una tabla. |
| Foco de la línea de comandos | Enfocar `cad-command-input` cuando el lienzo reciba una tecla imprimible. El guardián `targetKind === "editable"` ya protege lo demás. |
| Espacio = Enter | Añadir `" "` junto a `"Enter"` en `pointer-router.ts:390`. Una línea. |
| Ventana/cruce con arrastre simple | Cambiar el defecto de `selectionGeometryMode` y quitar la exigencia de Shift (`:1550`, `:6952`). |
| Inercia de cámara | `enableDamping = false` (`:6150`). Una línea. |
| Zoom al cursor | `controls.zoomToCursor = true`. Una línea. |
| Orden de la cinta | Sustituir `localeCompare` por un orden declarado (Dibujo, Modificar, Anotación, Capas, Bloque, Propiedades, Utilidades) en `ribbon.ts:180` y ordenar los comandos por frecuencia, no alfabéticamente. |
| Pestañas Modelo/Presentación | Sacar la franja de `cad-layout-tab-*` del modal `showSheetPackage` (`:17820`) al borde inferior, y añadir "Modelo". |
| Barra de estado | Mover la píldora al ancho completo, coordenadas a la izquierda, y esconder tras `?cadDiag=1` lo que ya se esconde en `CadDiagnosticsReadout` — `API online`, `Release`, `Validación`, `Clearance`, `Safety` no son de un CAD. |

Los caros de verdad son tres: **doble clic para editar**, **iconos por comando en la cinta** (unas 200 piezas) y el **selector de escala de anotación** (que además desbloquea la anotatividad que el equipo midió rota).

**La conclusión que ordena el gasto del mes:** el equipo midió tres huecos de capacidad muy reales y muy caros —tolerancia de holgura, tabla de patrones `.pat`, texto en el espacio modelo—. Ninguno de los tres cambia el veredicto que el dueño ya emitió. Los defectos de esta auditoría son **más baratos por un orden de magnitud** y son literalmente los que él vio. El texto que no se dibuja y los sombreados idénticos son la mitad visible del problema; **las teclas que hacen otra cosa y el arrastre que panea en vez de designar son la mitad que se siente**, y esa mitad se arregla en días, no en meses.

---

# PLAN PARA ACERCAR VALLE DESIGN A AUTOCAD COMPLETO

*Corte: 2026-09-01. Todas las cifras salen de mediciones ejecutadas contra el código del repositorio o de `docs/competitive/rubric.json`. Donde no hay medición, lo digo.*

---

## 1 · LA DISTANCIA REAL

Ordenada por lo que más aleja del listón, no por lo que más falta en una lista de comandos.

| # | Área | Cubierto hoy | El hueco que más duele | Evidencia de una línea |
|---|---|---|---|---|
| 1 | **Reconocimiento: que se vea y responda como AutoCAD** | **~0 %** | La línea de comandos **nunca tiene el foco**, y está escrito a propósito. Teclear `L` mirando el plano no escribe `L`. | `Layout3DEditor.tsx:16279-16283`, comentario literal: *"No se enfoca sola: robarle el teclado al lienzo rompería Supr, Ctrl+Z…"*. Y el propio golden `44-cad-command-line.spec.ts:48-51` **tiene que hacer `input.click()` antes de cada comando**. |
| 2 | **Anotación: cotas, textos, tablas, cuadros** | **30 %** | **El texto no se dibuja en el espacio modelo.** La cota no enseña su número; un TEXT sale como un rectángulo vacío. Un plano con 200 rótulos dibuja 200 rectángulos. | Corrida propia del pipeline por defecto (`batched`, `render-pipeline-preference.ts:33`) con 5 entidades de anotación → `peticiones de texto: 1 ["PLANTA"]`. La única rama que produce texto es `render/pipeline.ts:523`. `renderer.paths` de TEXT y ATTDEF devuelve `1 ruta, 4 puntos, cerrada`: la caja. |
| 3 | **Dibujo y modificación 2D: el trabajo diario** | **55 %** | **Un dibujo que llega de fuera no se puede cerrar, ni medir, ni ensamblar.** Falla la PRUEBA DE DESPACHO en el primer paso. | Contorno de 4 lados con 0,4 mm de desempate por `stitchCadBoundaryPaths` (`hatch-associativity.ts:94`): *"bucles cerrados: 0, abiertos: 4"*. El mismo contorno con `tolerance = 1`: 1 bucle. El parámetro existe y funciona; los dos únicos llamadores (`hatch-support.ts:96` y `:177`) lo llaman con un solo argumento. |
| 4 | **Los siete toolsets** | Sin medir con porcentaje | Ninguno está declarado como toolset. Hay material real disperso (símbolos, B-rep, geo) que nadie ha ensamblado como vertical. | La propia rúbrica lo dice en su alcance de destino: *"Contra AutoCAD completo más toolsets el producto está hoy en torno a una fracción"* (`rubric.json`, `scopes.destino`). |

**Sub-huecos que sostienen esos porcentajes** (todos medidos):

- **El plano no dice lo que significa.** Ejecuté `hatchAdapter.renderer.paths()` sobre el mismo contorno cambiando sólo el nombre del patrón: **ANSI31, ANSI37, AR-CONC, AR-B816, EARTH, GRAVEL, STEEL y NET dan 16 trazos y JSON byte-idéntico**. Sólo CROSS difiere. La causa está en `hatch-entity-adapter.ts:113-114`: `const angles = pattern === "CROSS" ? [ángulo, ángulo+90] : [ángulo]` — el nombre no se consulta contra ninguna tabla porque **no existe un lector de `.pat` en todo el repositorio**. El papel repite la decisión (`hatch-publish-strokes.ts:86`). *Nota del 2026-09-02:* cerrado en la Ola A (A6, segunda mitad): `hatch-pattern-table.ts` define 24 patrones por familias (ángulo, separación, desfase, corrimiento por fila y secuencia de trazos/puntos) y `hatch-pattern-strokes.ts` es el único generador para pantalla, papel y DXF; medido con `hatch-pattern-table.spec`: los ocho nombres dan ocho firmas distintas en pantalla y papel, ANSI31 conserva sus 45 trazos byte a byte, BRICK sale a soga y el DXF escribe una definición por familia con el giro correcto (52 = ángulo − base). Sigue fuera: cargar un `.pat` propio.
- **Los tipos de línea pierden su forma.** `computeCadLinetypeSlots` (`cad-effective-style.ts:207-227`) guarda un solo par trazo/hueco: CENTER pierde su trazo corto, DASHDOT pierde el punto, PHANTOM pierde los dos. `CAD_LINETYPE_SLOT_LIMIT = 8` (línea 157): del octavo tipo de línea del documento en adelante, `overflow`. Los tipos complejos (`----GAS----GAS----`) los declara imposibles el propio lector (`linetype-lin.ts`, lista `skipped`, cabecera líneas 22-27). *Nota del 2026-09-02:* cerrado en la Ola A (A6): las ranuras guardan la secuencia `.lin` completa (32 ranuras × 8 tramos, catálogo y detrás los nueve de fábrica en orden fijo), el shader recorre los tramos con índice dinámico (`#version 300 es`), la escena rellena el uniforme al llegar el documento, el anfitrión resuelve BYLAYER con `defaultCadRenderStyle`, el papel lleva `dash`, `plot-pdf.ts` emite `[…] 0 d` y el DXF escribe el patrón de fábrica de los tipos referenciados. Medido con `cad-effective-style.spec` (9), `line-batch.spec` (17), `render-pipeline-host.spec` (25), `plot-linetype-pattern.spec` y `dxf-linetype-table.spec`. Los tipos complejos con texto siguen fuera (lector `.lin`).
- **Los reflejos de la línea de comandos no existen.** `U`, `UNDO`, `REDO`, `OOPS` → *"Comando desconocido"*; ninguno está entre los 204 nombres del registro. En «Designe objetos», `ERASE.begin()` devuelve `accepts = 96` — sin `CAD_ACCEPT_KEYWORD` (=8): `ALL`, `TODO`, `L`, `P`, `F`, `WP`, `CP` y `R` devuelven los ocho *"Entrada no válida"*.
- **La misma tecla significa dos cosas.** De 21 letras con alias, **cuatro coinciden** (L, C, T, I) y **doce se contradicen**: `M` es MOVE en la línea y *medir* en el lienzo; `E` es ERASE y *abre el diálogo de exportar DXF*; `O` es OFFSET y *conmuta OSNAP*; `P` es PAN y *polilínea*; `Z` es ZOOM e *inserta una zona*. Y disparan en `keydown`, sin Enter: no hay oportunidad de corregir.
- **El primer gesto de cualquier usuario de AutoCAD panea el plano.** `Layout3DEditor.tsx:6952`: `else if (e.button === 0 && e.shiftKey)` — el marquee exige Shift; sin Shift, `controls.mouseButtons.LEFT = THREE.MOUSE.PAN` (`camera-policy.ts:96`).
- **El cuadro de cantidades no se imprime.** Corrida de `buildCadPublishPlan` con una tabla de 4 celdas llenas: el PDF recibe `d1:"200.00 mm"` y `t1:"SALA COMEDOR"` y **ninguna celda**, con `warnings: []`. Se pierde en silencio.
- **La anotatividad decide una sola vez.** Rótulo de 2,5 mm + dos ventanas a 1:50 y 1:100 → `cadAnnotativeRescaleCommands` emite **0 órdenes** (`layout/annotative-scale.ts:199`, `decided.add(entity.id)`).

---

## 2 · LA RESPUESTA A LA CONTRADICCIÓN

**La rúbrica dice 88,6 % y el dueño dice «no se parece en lo absoluto». Las dos son ciertas, y no porque la rúbrica esté inflada. Hay tres cosas distintas pasando, y conviene no confundirlas.**

### (a) El denominador del 88,6 % no es AutoCAD completo. Es AutoCAD LT, y la rúbrica lo dice por escrito.

`rubric.json` publica **dos** denominadores. El 155/175 = 88,6 % es el **alcance de HOY**, y su propia definición dice:

> *"Abrir o importar un plano, dibujar con precisión, anotar y acotar… publicar el PDF a escala… Sobre ESTO se exige el 10/10. **Se vende contra AutoCAD LT y contra la piratería.**"*

El otro es el **alcance de DESTINO** — 187/216 como meta — cuya definición dice:

> *"Contra AutoCAD completo más toolsets el producto está hoy en torno a una fracción, y no pasa nada."*

El dueño acaba de recordar que **el listón son los siete toolsets**. Es decir: comparó contra el denominador de destino y leyó la cifra del denominador de hoy. La rúbrica nunca prometió el 88,6 % contra AutoCAD completo; la cifra sólo se protegió a sí misma si se lee con su etiqueta pegada. **Corrección operativa inmediata: la cifra que se dice en voz alta es la de destino, siempre, con su nombre.**

### (b) El instrumento mide existencia, no resultado. Es aritmética, no opinión.

Los 336 items de evidencia de `rubric.json` se reparten así:

| kind | nº | qué comprueba de verdad |
|---|---|---|
| `file` | 87 | que un archivo exista |
| `command` | 76 | que un nombre esté en el registro |
| `spec` | 71 | que exista un `.spec.ts` bajo `src/` |
| `alias` | 29 | que un alias resuelva en la tabla |
| `golden` | 27 | que exista un archivo en `e2e/` |
| `grep` | 21 | que un patrón aparezca N veces |
| `metric` + `jsonValue` + `manual` | **22** | **un valor medido** |

**314 de 336 items comprueban existencia. 22 miran un valor.** Y las funciones que lo verifican son literalmente así: `command(item)` sólo comprueba que el nombre esté en el registro (`scripts/cad/rubric.mjs:383-390`), `golden(item)` sólo que el archivo exista en `e2e/` (`:374-380`), `spec(item)` sólo que el archivo esté bajo `src/` y acabe en `.spec.ts` (`:359-364`).

Dos casos testigo, ambos verificados:

- **`hatch` se lleva 10/10** mientras ANSI31, AR-CONC, EARTH y STEEL dibujan **el mismo JSON byte-idéntico**. `hatch.command` (3 pt) se puntúa sólo con `alias` + `command`.
- **`command-line.ui` se lleva 2/2** —texto: *"Línea de comandos en el editor con prompts, opciones y eco"*— con evidencia: existe `CadCommandLine.tsx`, existe un `.spec.ts`, existe `44-cad-command-line.spec.ts`. Y esa línea de comandos **nunca tiene el foco**.
- **`command-line.alias-coverage` da 2 puntos** por que resuelvan *"H, LA, DLI, T, Z, P, I y B"*, con evidencia `{kind:"alias"}`. `Z`, `P`, `I` y `B` cobran el punto en la tabla mientras el teclado hace otra cosa. El texto del criterio hermano (`alias-complete`) razona: *"La memoria muscular no distingue alias importantes de secundarios: un alias que cuelga rompe la confianza en todos."* El razonamiento es exactamente correcto; el instrumento no puede verlo.

**Esto no es un defecto moral del equipo: es un defecto de tipo de evidencia, y la rúbrica ya se corrigió a sí misma una vez por exactamente este motivo.** Sus propias notas dicen: *"Corte 2026-08-20: la evidencia de existencia se re-basó a contenido. El 189/200 del corte anterior concedía puntos por que un JSON existiera aunque su contenido desmintiera el criterio."* Lo que hay que hacer es el mismo movimiento otra vez, un nivel más adentro: **de contenido a resultado dibujado**.

### (c) Falta un eje entero, y no lo mide nadie.

Las 26 categorías son: `draw-2d`, `modify`, `dimensions`, `hatch`, `mtext`, `layers`, `blocks`, `dxf`, `layouts`, `persistence`, `command-line`, `annotation-extras`, `xrefs`, `performance`, `review`, `json-import`, `api-sdk`, `plugins`, `events`, `object-storage`, `dwg`, `brep`, `wasm`, `geo`, `integrity`, `growth`.

**Ninguna es la interfaz, los gestos, el cursor, la cinta, la barra de estado ni la disposición.** Y ningún golden compara píxeles: `grep -rn toHaveScreenshot apps/web/e2e/` sólo acierta dentro del informe HTML empaquetado de Playwright, en **cero specs**.

**Conclusión:** la rúbrica mide **capacidad**; el dueño midió **reconocimiento**. Son ejes ortogonales. 88,6 % de capacidad en el alcance de LT y ~0 % de reconocimiento no se contradicen. El producto se está jugando la venta en el eje que no tiene instrumento — y por eso cada uno de los tres frentes de abajo entrega **su propio gate**, no sólo su código.

---

## 3 · LOS TRES FRENTES DEL PRÓXIMO MES

**Por qué estos tres:** el juicio del dueño —«no se parece en lo absoluto»— se descompone exactamente en tres cosas y no en cuarenta: **lo que se ve dibujado**, **lo que responde cuando tocas el teclado**, y **lo que te deja tomar un trabajo ajeno**. Los tres se apoyan en cimientos que ya están construidos y medidos funcionando; ninguno pide un motor nuevo. Y los tres tienen efecto el primer día que se abre el producto.

---

### FRENTE 1 — QUE EL PLANO SE VEA (lo que el dueño juzga desde una captura)

**Qué se construye**

1. **Rotular en el espacio modelo.** Un solo cambio, en un archivo: en `render/pipeline.ts:523`, sustituir `if (entity.type === "mtext")` por «pídele al adaptador su(s) petición(es) de texto», con cuatro casos triviales: cota (`geometry.label` en `textAnchor`/`textAngle`), text (su cadena), mleader (`entity.text` en `geometry.textAnchor`) y table (una petición por celda de `entity.cells`). Añadir `maxWidth` + líneas a `CadTextQuadRequest` (`text-atlas.ts:159`) y hacer que `buildCadTextQuads` recorra las líneas que `layoutCadMText` ya sabe partir, en vez de `for (const character of request.text)` (`text-atlas.ts:259`).
2. **Tabla de patrones de sombreado.** Sustituir `angles = [entity.angle]` por `familias = tablaDePatrones(nombre)` y llamar al generador una vez por familia, en dos sitios: `hatch-entity-adapter.ts:113` y `hatch-publish-strokes.ts:86`. Veinte patrones cubren el 95 % de lo que se usa. *Hecho el 2026-09-02 (Ola A · A6): 24 patrones.*
3. **Tipos de línea con su forma completa.** Guardar el patrón entero en vez del primer par en `cad-effective-style.ts:207-227`, y subir `CAD_LINETYPE_SLOT_LIMIT` por encima de 8 — una plantilla de ejecutivo mexicano lleva más de ocho. *Hecho el 2026-09-02 (Ola A · A6).*
4. **La rama `table` en el papel:** un `{kind:"text"}` por celda en `paper-space.ts`, idéntica a la que ya emite para TEXT.

**Sobre qué cimiento ya existente se apoya**

- La etiqueta **ya se calcula**: `buildCadDimensionGeometry` devuelve `label`, `textAnchor` y `textAngle` resueltos (`associative-dimension.ts:78-113`).
- El camino de la lámina **ya lo emite bien y es sólo un `push`**: `paper-space.ts:637-654` (cota) y `:679-700` (mleader) construyen `{kind:"text", point, text, size, rotation, align}` — la plantilla exacta, ya probada contra los bytes del PDF (`d1:"200.00 mm"`, `t1:"SALA COMEDOR"`).
- El atlas de texto **ya funciona en navegador real**: golden 47 (`e2e/golden/47-cad-render-pipeline.spec.ts:206-211`) afirma `data-glyphs >= 10` y `data-dropped-glyphs == 0` sobre GPU de verdad.
- `buildCadNativeObject` (`entity-three.ts:543-660`) **ya rotula** cota, TEXT, MLEADER y atributos con la cadena DIMSTYLE → estilo de texto → familia; hoy sólo se le invoca para lo *seleccionado* (`Layout3DEditor.tsx:3263`).
- `hatchPolygon(contorno, {angle, spacing, origin})` **ya barre** con ángulo, separación y origen; el filtro de islas, el LOD, la guarda de densidad y la asociatividad no se tocan. Pantalla y papel se arreglan a la vez porque comparten el generador.

**Qué se nota el primer día**

Una cota enseña `4000`. Un rótulo de local dice «SALA COMEDOR» en vez de ser un rectángulo. Un corte constructivo distingue concreto de mampostería de tierra. Un eje se distingue de una línea oculta. **Dos planos distintos dejan de salir iguales** — que es la mitad visible del juicio del dueño.

**Cómo se sabrá que está hecho**

- **Gate de patrones:** renderiza los N patrones del catálogo y **falla si dos nombres distintos producen salida serializada idéntica**. Hoy ese gate reprueba con 8 nombres colisionando; el día que pase, el defecto no puede volver en silencio.
- **Gate de rotulado:** la misma corrida de 5 entidades de anotación debe dar `peticiones de texto: 5`, no 1.
- **Gate de tabla impresa:** `buildCadPublishPlan` con una tabla de 4 celdas llenas debe emitir 4 textos, no 0 con `warnings: []`.
- Extender el golden 47 con las cadenas reales rotuladas.

**Lo que NO entra este mes, dicho:** la anotatividad multi-escala (varias representaciones por objeto). Se queda como está y se declara. Lo único que sí entra por ser casi gratis: enchufar `cadAnnotativeBlockRescaleCommands` (`dynamic-blocks.ts:495`), que está construido, probado y **no tiene ni un importador fuera de su propio spec**.

---

### FRENTE 2 — QUE RESPONDA COMO AUTOCAD (los primeros diez segundos)

**Qué se construye**

1. **La línea de comandos recupera el foco por defecto.** Hoy la decisión está escrita a propósito (`Layout3DEditor.tsx:16279-16283`) y la razón dada es real —Supr, Ctrl+Z y las teclas de captura—, así que la solución no es un `autoFocus` a ciegas: es que el lienzo **reenvíe** las teclas imprimibles a la línea y se quede con las de control. `interpretEditorKeyBeforeEngine` (`editor-keyboard.ts:157`) ya es el punto único donde se decide, y ya abre con `if (event.targetKind === "editable") return null`.
2. **Se apagan las colisiones de teclas.** Las doce letras que contradicen su alias (`M`, `E`, `O`, `P`, `Z`, `A`, `B`, `F`, `G`, `V`, `W`, `R`) dejan de disparar herramientas en `keydown`. La memoria muscular gana; la paleta de herramientas se opera con el ratón o con teclas que no sean alias.
3. **`U`, `UNDO`, `REDO`, `OOPS` como comandos**, y las palabras clave de designación `TODO/ALL`, `P`, `L`, `F`, `WP`, `CP`, `R` en «Designe objetos» — hoy `accepts = 96`, falta el bit `CAD_ACCEPT_KEYWORD` (=8).
4. **Arrastrar sobre el fondo designa, no panea.** La semántica der→izq = cruce **ya está implementada** (`Layout3DEditor.tsx:7223-7225`); lo que falta es que sea el gesto por defecto en vez de exigir Shift (`:6952`) o elegir antes «Ventana» en la paleta (modo por defecto `"pick"`, `:1550`).
5. **Mobiliario, coste casi nulo, efecto alto:** ordenar los paneles de la cinta por convención en vez de `localeCompare` (`ribbon.ts:180`) — **Dibujo primero, Modificar segundo, LINE el primer botón, no el 15**; sacar de «Dibujo» los ocho comandos que no dibujan (`ribbonPanelForCommand`, `ribbon.ts:124-138`); **crear la pestaña PARAMÉTRICO**; sacar las pestañas Modelo/Presentación del modal «Paquete premium de entrega CAD» (`Layout3DEditor.tsx:17820`) a la franja de abajo a la izquierda donde vive en AutoCAD; mover coordenadas a la izquierda de la barra de estado y añadir rejilla (F7), forzado (F9) y **el selector de escala de anotación**.

**Sobre qué cimiento ya existente se apoya**

- La línea de comandos **está bien hecha**: prompt `Comando:`, monoespaciada, log, recuperación con ↑/↓, cascada de Esc, opciones pulsables, Espacio repite. No hay que escribirla.
- El **cursor en cruz es AutoCAD auténtico** y mejor de lo que la rúbrica presume: cruz + pickbox + apertura de snap, con `crosshairPercent` 32 %, `pickBoxPx` 8, `aperturePx` 12 configurables (`Layout3DEditor.tsx:5986` + `cad-crosshair:15862-15885`).
- La cinta ya se genera del registro, cubre los 204 comandos y es minimizable. **Reordenar no es reescribir.**
- Ventana, cruce, polígono, fence y lazo **ya están construidos** (`CadSelectionPalette.tsx:35-36`); lo que falta es el gesto por defecto y la vía tecleable.
- El deshacer **ya existe y su granularidad es un contrato probado**: `cadGripDragGroupKey` agrupa un arrastre entero en una entrada, con golden dedicado `39-cad-undo-granularity.spec.ts`. `U`/`UNDO`/`REDO` son nombres sobre una pila que ya funciona con Ctrl+Z (`keyboard-shortcuts.ts:134-160`), no una pila nueva.
- Las **restricciones paramétricas 2D** (12 GC* + 4 DC* + AUTOCONSTRAIN + PARAMETERS) están implementadas y hoy viven repartidas entre «Administrar > Herramientas» —junto a AUDIT y RENAME— y «Anotar». Es **lo que separa AutoCAD completo de LT**, es la única ventaja de gama alta del producto, y está enterrada en un cajón de sastre. Sacarla a su pestaña cuesta una entrada en la tabla de la cinta.

**Qué se nota el primer día**

Te sientas, tecleas `L`, Enter, y dibujas una línea sin haber tocado el ratón. Tecleas `M` y mueves. Tecleas `U` y deshaces. Arrastras una ventana y designas. Abres la cinta y lo primero que ves es **Dibujo**, con LINE al frente. Las pestañas Modelo/Presentación están donde tu dedo las busca. **Eso es el juicio del dueño, revertido, sin tocar una sola línea del motor de geometría.**

**Cómo se sabrá que está hecho**

- **Reescribir el golden 44 quitando los `input.click()` de las líneas 48-51 y 100-102.** Si el golden pasa sin el clic, el foco funciona. Es la prueba más limpia que existe y ya está escrita al revés.
- **Spec de colisiones:** la intersección entre `CAD_COMMAND_ALIASES` (`engine/alias-table.ts:20`) y las teclas del lienzo debe ser **vacía**. Hoy son 12 de 21.
- Spec que afirme que `resolveCadToken` acepta `U`, `UNDO`, `REDO`, `OOPS` sin comando activo, y que `ERASE.begin()` devuelve `accepts` con el bit de palabra clave.
- Golden que arrastre sobre el fondo sin Shift y verifique que designa.
- **Un golden de píxeles de la pantalla completa** — el primero del repositorio (hoy `toHaveScreenshot` está en cero specs). Ése es el instrumento del eje que falta.

---

### FRENTE 3 — QUE SE PUEDA TOMAR UN TRABAJO AJENO (la primera hora de cada encargo)

**Qué se construye**

1. **`HPGAPTOL` como variable de sistema.** Añadirla a `system-variables.ts` con la fábrica tipada `real(nombre, defecto, descripción, {min})` que ya usan CELTSCALE y LTSCALE, leerla en `hatch-support.ts:96` y `:177`, y ofrecerla como palabra clave `Tolerancia` en HATCH y BOUNDARY — exactamente el patrón que **OVERKILL ya implementa** con su keyword `Tolerancia` (`modify-cleanup.ts:54`). **Dos argumentos, una variable, una palabra clave.**
2. **Portapapeles de geometría canónica real:** `COPYCLIP` / `CUTCLIP` / `PASTECLIP` / `PASTESPEC`. Hoy `Ctrl+C` sobre geometría canónica **no copia: duplica en el sitio** con desplazamiento fijo de rejilla (`copyNativeSelection`, `Layout3DEditor.tsx:4923-4935`), y `copySelection` (`:9655`) sólo mete `type === "asset"` mientras las entidades CAD viajan como `native:<id>`. **La barra ya anuncia lo contrario** (`:17246`: *"Ctrl+C — copia al portapapeles CAD (pega aquí o en otro layout)"*): la promesa está en la interfaz y no se cumple.
3. **Las órdenes de dibujo ajeno que faltan del registro** (verificado: no están entre los 204): `SELECTSIMILAR`, `ADDSELECTED`, `XPLODE`, `SETBYLAYER`, `CHPROP`, `NCOPY`.
4. **Distancia de aproximación en JOIN/PEDIT.** Umbral hoy 1e-6 (`modify-join.ts:180`), y PEDIT «Juntar» delega en la misma función (`modify-pedit.ts:31` y `:237`).

**Sobre qué cimiento ya existente se apoya**

**El cimiento no hay que construirlo: ya está construido y medido funcionando.** `stitchCadBoundaryPaths(paths, tolerance)` (`hatch-associativity.ts:94`) ya acepta y ya honra una tolerancia; el encadenado, la limpieza de bucles, la detección de autointersección y la resolución de islas están escritos y probados. Su valor por defecto es `1e-4` y nadie pasa otro — en un documento en mm, **1e-4 mm es una décima de micra**.

Y el rendimiento es desproporcionado por una razón que conviene ver: **no hace falta arreglar JOIN para ganar la prueba de despacho.** `BOUNDARY` ya emite polilíneas cerradas a partir de esos mismos bucles (`annotate-hatch.spec.ts:324-332`: *"exterior e isla: dos contornos"*, *"polilíneas, no sombreados"*) — que es justo la vía que un dibujante usa en AutoCAD para sacar el contorno de un predio mal empatado. Por eso el punto 4 va el último de la lista: deja de ser el camino obligatorio.

**Qué se nota el primer día**

Llega el DWG del topógrafo. Clic dentro del predio: **se sombrea**. `BOUNDARY`: **sale la polilínea cerrada**. `AREA`: **perímetro y superficie** para cotejar contra la escritura. Y las piezas buenas de otro dibujo se traen con Ctrl+C / Ctrl+V de verdad. **Un despacho que no puede hacer la ENTRADA de un trabajo no puede tomar el trabajo, por bien que dibuje lo demás.**

**Cómo se sabrá que está hecho**

- **La PRUEBA DE DESPACHO del área 2, como golden:** recibir un DWG, unir 34 líneas mal empatadas, obtener perímetro y superficie. Hoy **falla en el primer paso, medido**.
- Spec que afirme que los dos llamadores de `stitchCadBoundaryPaths` pasan `HPGAPTOL` y no un solo argumento.
- Golden de portapapeles: copiar en un layout, pegar en otro, y que la entidad exista con su geometría — la promesa exacta que ya está escrita en el botón.
- Los seis comandos nuevos entran a `command-integrity.json` como cualquier otro: **hoy 0 rojos**, y ese contrato no se rompe por seis nombres nuevos.

> **Ola D (2026-09-02) — hecho, y medido.** `HPGAPTOL` existe (`system-variables.ts`, fábrica `real` con mínimo 0); los dos llamadores de `stitchCadBoundaryPaths` la pasan (`cadHatchGapTolerance` en `hatch-support.ts`, comprobado por comportamiento y por fuente en `verification/prueba-de-despacho.spec.ts`, 72 comprobaciones); HATCH, BOUNDARY y JOIN ofrecen `Tolerancia` y PEDIT Juntar acepta la distancia de aproximación. La prueba de despacho es el **golden 74**: 34 LINE con huecos de 0,2 a 0,92 mm → HATCH dice que no cierra con HPGAPTOL 0, cierra con 2 y no con 0,5 (un número, no un interruptor), BOUNDARY da una polilínea cerrada, JOIN Tolerancia una polilínea de 34 vértices y AREA Objeto 92.840.000 mm² y 46.297 mm ± lo que mueven los huecos. Un sombreado que sólo cierra con tolerancia nace **no asociativo** y el prompt lo dice: el regenerador cose con la de fábrica, y guardar la tolerancia por sombreado sería tocar el formato persistido, que es decisión del titular. El portapapeles de geometría canónica (`lib/cad/clipboard.ts`; COPYCLIP, CUTCLIP, COPYBASE, PASTECLIP, PASTEORIG; Ctrl+C/X/V) está en el **golden 75** y el botón ya dice lo que hace; PASTESPEC no: no hay portapapeles del sistema que pegar «como…», y queda en ESCALERA. Las seis órdenes están en el registro (**golden 76**) y `command-integrity.json` pasa de 213 a 224 comandos con 0 éxitos falsos. Por el camino, medido y arreglado: COLOR, LINETYPE y LWEIGHT escribían CECOLOR/CELTYPE/CELWEIGHT y ninguna orden de dibujo las leía; ahora llegan a lo que se dibuja (`engine/current-presentation.ts`), que es lo que ADDSELECTED promete.

---

## 4 · LOS SIETE TOOLSETS, ORDENADOS

**La tesis que ordena todo esto, y que evita convertir el producto en uno de nicho:** aquí un toolset **no es un producto aparte**. Es **contenido sobre el mismo motor** — un catálogo de símbolos, una familia de estilos de cota, unas plantillas de lámina, un cuadro de cantidades y media docena de órdenes — encima de los mismos 204 comandos, el mismo kernel B-rep y el mismo códec DWG. AutoCAD vende siete instalaciones distintas porque su arquitectura es de 1982; aquí un despacho de arquitectura y uno de instalaciones abren **el mismo producto** y ven catálogos distintos. Eso es más universal, no menos.

**Ninguno de los siete entra hasta que los tres frentes estén cerrados**, por una razón que la medición deja clara: un toolset es, en su mayoría, **símbolos, tablas y tipos de línea con significado**. Los tres se dibujan hoy como rectángulos vacíos, rejillas sin contenido y rayas idénticas. Construir toolsets antes del Frente 1 es construirlos invisibles.

### 1º — ARCHITECTURE. El primero, y no está a discusión.

Es el mercado declarado del producto y es donde hay más cimiento construido: `symbols-architecture.ts` (una familia de símbolos arquitectónicos ya separada del catálogo general y documentada como *"el mercado real del producto, el despacho que dibuja casas"*), `bim-schedule.ts` (detección de locales y cuadros), `architecture.ts` (el único módulo del repo que sabe **nombrar locales en español**), el grafo de muros y sus cuatro anfitriones 3D de sólidos.

**Su primera entrega es coser una costura medida, no inventar nada:** hoy hay **dos modelos de local que no se hablan**. `bim-schedule.ts:441` asigna `room.id = L-01, L-02…` por área descendente y **la fila no tiene campo de nombre**; `architecture.ts:419-430`, que sí clasifica por nombre en español, opera sobre los objetos rectangulares del planificador industrial y calcula el área como ancho × alto (`architecture.ts:196`), no sobre el grafo de muros. **Un cuadro que dice «L-03» en vez de «Recámara principal» no se entrega a nadie.** Cerrar esa costura + la rama `table` del Frente 1 convierte DATAEXTRACTION → Tabla (que **ya rellena las celdas con números reales**, `data-extraction/data-extraction.ts:105-130`) en un cuadro de superficies entregable.

Y es universal: muros, puertas, ventanas, locales y cuadro de superficies existen en todos los países y en todos los tipos de proyecto.

> **Ola E (2026-09-02) — hecho, y medido.** La costura está cosida: `bim-schedule.ts` nombra cada local por el rótulo TEXT/MTEXT que cae dentro de su anillo (el mayor, y a igualdad el más cercano al centroide) y le pone el uso con el clasificador de `architecture.ts`; DATAEXTRACTION ofrece `Superficies` y `carPintería` además de `Tabla` y `CSV`, y los dos cuadros llevan nombre, uso, área a ejes, área útil y perímetro, y marca, tipo, ancho, alto, antepecho y cantidad. La rama `table` del Frente 1 también: `paper-space-table.ts` emite un texto por celda con la MISMA ancla del visor (medida contra un MTEXT a 1e-6), y `paper-space-table.spec.ts` lee «Local», «12.50» y «Rec…» de los bytes del PDF con el lector de medición — antes, medido, un cuadro de 2 × 2 lleno llegaba como 3 caminos y 0 textos sin advertencia. El **golden 77** teclea los dos cuadros sobre una planta de dos locales y comprueba lo que recibió el servidor (RECÁMARA 16,00, BAÑO 8,00; P-090x210, V-120x120 con antepecho 900). Y lo que no había: **STAIR** (escalera recta con contrahuellas por reglamento —≤ 180— y huella por Blondel —2c + h = 630— o tecleada, se niega fuera de reglamento con el número, planta con SUBE y UN sólido `extrude` de canto cuyo volumen es `ancho · h · c · (N − 1) · N / 2`; golden 78), **ROOF** (cuatro, dos o un agua sobre un rectángulo, alero y pendiente, cumbrera y limatesas, flechas y rótulos en %, sólido `brep` con volumen en papel; golden 79) y **SLAB** (losa por contorno cerrado con la cara superior a la cota; golden 79). Las órdenes que escriben ahora pueden DECIR sus números (`notice` en el resultado `document`: «14 contrahuellas de 171,4 mm…»). La fila `toolset-architecture` pasa de 2 a 3 de 4 —retiene 1 pt hasta que haya evidencia independiente—; sin entidad `stair`/`roof`/`slab` persistida: sería tocar el formato, decisión del titular. Lo que sigue en «todavía no» (varios tramos, cubiertas sobre polígonos, huecos en losas) está en ESCALERA.

### 2º — MEP. Segundo, y más barato de lo que parece — pero sólo su mitad 2D.

El bloqueo de MEP **no es MEP**: son los **tipos de línea complejos**, los que llevan texto o forma (`----GAS----GAS----`, límite de predio, cerca), que hoy el propio lector declara imposibles y saca por su lista `skipped` (`linetype-lin.ts`, cabecera 22-27). Un plano de instalaciones distingue gas de drenaje de agua **sólo por el tipo de línea**. Cerrado eso en el Frente 1, MEP 2D es catálogo de símbolos + cuadro de cantidades + unas cuantas órdenes de trazado de red.

Universal: todo edificio tiene instalaciones, en cualquier país. **La mitad 3D —ruteo con colisiones, diámetros por spec— queda fuera y se declara.**

> **Ola F (2026-09-02) — hecho, y medido.** El bloqueo está cerrado por donde se podía sin tocar el formato: nace `linetype-complex.ts` con siete tipos de línea con TEXTO de fábrica (GAS_LINE y HOT_WATER_SUPPLY de acad.lin, y AGUA_FRIA, AGUA_CALIENTE, SANITARIO, PLUVIAL, CONTRA_INCENDIO como se rotulan aquí) referenciados por NOMBRE —el documento sigue persistiendo sólo trazos, y guardar el texto sería decisión del titular—, y el texto sale en las cuatro superficies: el visor lo pide al atlas como quads (`render/linetype-text-requests.ts`), la lámina lo emite por ciclo con la misma regla que el guion (`paper-space-linetype-text.ts`), el PDF lo lleva en sus bytes y el DXF escribe el LTYPE complejo (74 = 2, S/R/X/Y y el texto sobre su tramo). Por el camino, medido y arreglado: `LTSCALE 500` tecleado no movía un guion (la variable se quedaba en la sesión) y el diálogo «Exportar a DXF» devolvía GAS = GAS_LINE como `6 CONTINUOUS` sin tabla LTYPE ni $LTSCALE; la tabla del shader pasa de 32 a 48 ranuras (144 vectores, bajo los 224 de WebGL2). **Golden 80**: 10 «GAS» en 10 m a LTSCALE 1000 (30 glifos), 20 a LTSCALE 500, y el DXF descargado con su 74 = 2. Y MEP 2D como CONTENIDO sobre el mismo motor, como decía la tesis: **PIPE** (por servicio, con Diámetro en `context.metadata`), **DUCT** y **CABLETRAY** (doble línea a inglete y eje CENTER; el codo mide en papel ancho × (L₁ + L₂)), **MEPSYMBOL** (ocho bloques con geometría, definidos la primera vez que se insertan) y **DATAEXTRACTION Instalaciones** (longitudes por servicio y tamaño, equipos por símbolo, en la lámina). **Golden 81**. La fila `toolset-mep` pasa de 0 a 3 de 4 (retiene 1 pt hasta evidencia independiente). Lo que sigue en «todavía no» —`.lin` propio con texto, formas .shx, accesorios automáticos, la mitad 3D— está en ESCALERA.

### 3º — MAP 3D. Tercero, y el cimiento sorprende.

`apps/web/src/lib/geo/` ya tiene `shapefile.ts`, `dbf.ts`, `las.ts` (nubes de puntos), `crs.ts` / `crs-prj.ts` (sistemas de coordenadas) y `point-index.ts`; la rúbrica ya tiene la categoría `geo` («Nubes de puntos, raster georreferenciado y GIS»). Y conecta directamente con el Frente 3: **georreferenciar el predio y el levantamiento topográfico es la entrada del trabajo**, no un extra. Tercero y no primero porque el trabajo diario de un despacho no es GIS.

### 4º — RASTER DESIGN, sólo su mitad útil. Barato y universal.

Todo el mundo escanea un plano viejo y calca encima. `IMAGE` ya está en el registro y en la cinta. Entra la mitad de «insertar, escalar, atenuar, recortar, calcar encima»; **la vectorización automática y REM quedan fuera y se declaran.**

### 5º — MECHANICAL. Quinto, con el cimiento más fuerte y la dependencia más larga.

`apps/web/src/lib/brep/` tiene `step-import`/`step-export`, `iges`, `nurbs`, `boolean`, `fillet`, `mass-properties`, `sweep`. Es material real. Pero el toolset Mechanical **diario** no es sólido 3D: es detallado 2D con norma —cajetines ISO/ANSI/DIN/JIS, BOM con globos, símbolos de soldadura, tolerancias geométricas—, y eso depende de dos cosas que hoy faltan: la tabla impresa (Frente 1) y **los subestilos de cota por familia** — `dimension-style.ts` tiene **cero apariciones de «family»/«subestilo»**, así que una cota radial no puede llevar flecha propia sin crear otro estilo entero. Quinto por dependencia, no por falta de valor.

### FUERA DE ALCANCE POR AHORA, dicho en voz alta

**6º — ELECTRICAL (industrial: diagramas de control, numeración de hilos, referencias cruzadas, PLC). NO.** Es el más de nicho de los siete y su valor no está en el CAD: está en la base de datos de numeración de hilos, las referencias cruzadas y los catálogos de fabricante. Es un negocio de datos disfrazado de CAD. En el repo no hay nada (`grep` de electrical/eléctrico en `lib/cad`: sólo símbolos sueltos). Y no confundirlo con el eléctrico de edificio, que es MEP y sí entra en 2º.

**7º — PLANT 3D. NO, y es el que más claramente rompe la universalidad.** Exige un catálogo de especificaciones de tubería, P&ID con inteligencia de proceso, y generación de isométricos de clase ISOGEN. El kernel B-rep ayudaría, pero el valor está en las bases de especificaciones, no en la geometría. Es el único de los siete cuyo mercado es una sola industria (petroquímica). Decirlo ahora es más barato que fingirlo un año.

**Y una regla de honestidad para los cinco que sí entran:** cada uno declara su peldaño de `docs/parity/ESCALERA.md` al entrar y al salir. Nada se vende como «compatible con» sin peldaño 4 (oráculo independiente nombrado), ni se vende activamente sin peldaño 6. La escalera ya existe; usarla es gratis.

---

## 5 · LO QUE NO HAY QUE HACER

**Esto vale tanto como el plan.** Cada renuncia con su razón.

### 1. No añadir comandos al registro para subir la rúbrica.

Faltan más de veinte nombres de anotación (`DIMSPACE`, `DIMBREAK`, `DIMJOGGED`, `DIMTEDIT`, `MLEADEREDIT`, `TEXTEDIT`, `FIELD`, `TABLEDIT`, `TINSERT`, `TABLEXPORT`, `DATALINK`, `OBJECTSCALE`…). Registrarlos subiría la rúbrica —`command(item)` sólo comprueba que el nombre esté en el registro (`rubric.mjs:383-390`)— y **no movería el juicio del dueño un milímetro**, porque hoy ni siquiera se ve el texto que esos comandos editarían. **Regla dura: ningún comando nuevo entra al registro sin un gate de resultado.** Ése es exactamente el mecanismo que produjo la divergencia; repetirlo sería repetirla a sabiendas.

### 2. No perseguir AutoLISP heredado, .NET ni VBA.

La rúbrica ya lo declara con honestidad —*"no hay runtime .NET ni VBA y no se finge"*, citado como el ejemplo del **peldaño 0** en `ESCALERA.md`— y ésa es la postura correcta. En un producto web puro, .NET y VBA no son difíciles: son imposibles sin traicionar la arquitectura. Compra la cola de despachos con rutinas heredadas al costo del mes entero. **Se mantiene la vía de plugins JS**, que sí es del medio.

### 3. No perseguir la perfección del DWG nativo este mes.

`dwgBetaExportIsEnabled` se queda en `false` en producción hasta que corra el oráculo externo ODA (§8.2 de ADR-0009) — y `ESCALERA.md` lo cita como su ejemplo de **peldaño 6**: *"una OWNER ACTION explícita, no un TODO técnico"*. Es decir: **lo que bloquea DWG es una firma, no código.** Gastar el mes en el códec es gastarlo en el lado equivocado del bloqueo. DXF sigue siendo la vía honesta de interoperación, y ya está probada contra un tokenizador de terceros (`dxf-roundtrip.spec.ts`, peldaño 4).

### 4. No perseguir barras de herramientas clásicas acoplables ni el menú Archivo/Edición.

Exigen un sistema de acoplamiento entero. El propio AutoCAD las degradó hace más de una década a favor de la cinta, y **la cinta aquí ya existe, con 6 pestañas generadas del registro y 204 comandos cubiertos**. La ganancia de reconocimiento por peso de trabajo es la peor de toda la lista comparada con **reordenar los paneles** (`ribbon.ts:180`, un comparador) y **arreglar la barra de estado**.

### 5. No perseguir 3D de presentación: materiales, sol y sombras, estilos visuales, un ViewCube completo.

Y no sólo no perseguirlo: **quitarlo de la vista principal**. Los deslizadores de azimut y altura solar de la barra superior, el panel de huella con «Aplicar tamaño», el `.glb` — son parte de lo que el dueño leyó en la captura. Nadie compra AutoCAD por renderizar. Y sobre el ViewCube: el componente **declara él mismo que no es uno** (*"Un ViewCube de verdad se orienta con la cámara y se arrastra; eso exige llevar el azimut/elevación vivos hasta aquí"*), y no aparece en 2D, que es el modo por defecto (`cad-workspace.ts:58`). **Ocultar honestamente cuesta cero; perfeccionar cuesta el mes.**

### 6. No dejar en la barra superior el vocabulario de gestor documental.

*Readiness, escenarios, aprobación (Borrador / En revisión / Aprobado), clonar layout, paquete de entrega*, y un botón **«Guardar» grande en rojo carmesí** (`style={{background:"#e11d48"}}`, `Layout3DEditor.tsx:15470`). **Esas funciones no son malas — el problema es dónde están.** Ocupan exactamente el espacio donde AutoCAD pone el acceso rápido (Nuevo/Abrir/Guardar/Trazar/Deshacer) y el nombre del dibujo. Y la franja de pestañas Modelo/Presentación, la más reconocible de AutoCAD, hay que abrir un modal de marketing titulado «Paquete premium de entrega CAD» para verla (`:17820`). **Se degradan a un menú; no se borran.** Es el cambio de mayor reconocimiento por menor código de todo el plan.

### 7. No cambiar las dos ventajas reales por conteo de features.

Son contratos verificables, no impresiones, y **AutoCAD no tiene ni puede tener ninguno de los dos**:

- **Cuando no se puede, siempre dice por qué, y hay una puerta que lo obliga.** JOIN sobre un contorno mal empatado contesta *"L1 no es paralela a L0. Y tampoco se encadenan: L1, L2, L3, L4 no toca ningún extremo de los demás: JOIN no rellena huecos entre objetos distintos"* — tres hechos y el nombre de cada culpable, donde AutoCAD dice *"1 object was not joined to the source"*. Y no depende de la disciplina de nadie: `docs/cad/evidence/command-integrity.json` corre los 204 comandos contra un documento de prueba y clasifica el resultado — **hoy 0 rojos, con 83 clasificados «honesto-limitado»**.
- **Un arrastre de pinzamiento es exactamente un paso de deshacer, por contrato** (`cadGripDragGroupKey` + `CanonicalHistory`, golden `39-cad-undo-granularity.spec.ts`), donde la granularidad del `U` de AutoCAD es famosamente errática y no está documentada en ninguna parte.

**Ninguno de los tres frentes puede bajar `command-integrity.json` de 0 rojos.** Es la condición de entrada, no un extra.

### 8. Y una que no es del listón de AutoCAD sino de nosotros: no volver a decir «88,6 %» sin su etiqueta.

Esa cifra es el **alcance de HOY**, cuya definición dice literalmente *"Se vende contra AutoCAD LT y contra la piratería"*. La cifra contra el listón que el dueño tiene en la cabeza es la de **destino**, 187/216 como meta, y la rúbrica reconoce que hoy está *"en torno a una fracción"*. La rúbrica no mintió; se leyó sin su etiqueta. **De aquí en adelante se dice la de destino, con su nombre, y se le añade el eje que falta** — el de reconocimiento, que hoy no tiene ni una fila, ni un gate, ni un golden, y que es el eje donde el producto se está jugando la venta.

