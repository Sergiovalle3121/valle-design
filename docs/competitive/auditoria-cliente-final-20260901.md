# Auditoría de cliente final — 1 de septiembre de 2026

Diez recorridos de despacho reales, ejecutados **en el navegador** contra el estudio, no
leyendo código. Cada FALLA pasó después por un refutador adversario cuyo encargo era
tumbarla; **22 de 26 sobrevivieron** y son las que se listan aquí.

Veredicto por recorrido: **3 «sirve», 7 «sirve con reservas», 0 «no sirve»**.

> Método y límites. Los recorridos corrieron en un contenedor de 4 núcleos con otras
> suites en paralelo; lo que no se pudo separar de la carga de la máquina está marcado
> NO_PUDE_MEDIR y **no** se cuenta como defecto. La evidencia de cada fila es una
> medición sobre el DOCUMENTO GUARDADO o sobre `document.elementFromPoint`, no una
> captura de pantalla.

## Los 22 defectos confirmados


### Bloquea el trabajo

**Con el plano de trabajo apoyado en la fachada, dibujo una línea con DOS CLICS y el trazo se va al suelo, sin decir nada**

SCU apoyado en la fachada (origen (6000, 7500, 1500), eje Z (0,1,0)). Dos clics del ratón sobre la fachada. Línea guardada: {"start":{"x":6000,"y":5000,"z":0},"end":{"x":5613.691918022726,"y":7500,"z":0}}. El primer punto es el CENTRO DE LA HUELLA EN EL SUELO —ni siquiera está sobre el sólido—, los dos tienen z=0, y ninguno está en el plano y=7500 del plano de trabajo. No hay aviso, ni error, ni marca: la geometría queda mal y el usuario se entera al exportar. Agrava el fallo que el propio producto acaba de escribir «SCU inclinado: LINE conserva la cota; las demás órdenes de dibujo se negarán hasta que la conserven», que dirige al usuario justo al camino que falla en silencio.

**Imprimí a 1:50, cambié la escala a 1:100 y volví a imprimir: el segundo PDF no sale, y encima el dibujo se queda sin poder guardarse**

«2ª publicación · pdf=NO · estado de guardado="Conflicto CAS · servidor v2 · autosave detenido" · avisos=["Guardado — Layout 3D guardado.","Hojas — 1 hojas vectoriales publicadas · SHA-256 6ac52671b653…","Conflicto CAS — El documento cambió en el servidor. Recarga o resuelve el conflicto antes de guardar."] · red=["PUT /v1/cad/documents/…/content -> 409"]». Publicar avanza la versión del documento en el servidor (el recibo de publicación es server-managed y suma uno); publishSheetSetPdf refresca data.cadDocumentVersion con la versión del recibo pero NO el token CAS que el guardado usa de verdad (versionByDocumentRef, en persistCanonicalSave de Layout3DEditor.tsx), así que el siguiente guardado viaja con una versión caducada. Detalle importante: publicar dos veces SIN tocar nada sí funciona (el segundo guardado no llega a viajar); hace falta una edición por el medio, que es lo que hace cualquiera. Se sale recargando la página. Aislado en el test «imprimir, cambiar la escala y volver a imprimir», marcado test.fail() para que avise el día que se arregle.

**Redefino la silla dibujando el recambio al lado del plano, como se dibuja de verdad, y las tres sillas se van nueve metros**

Recambio dibujado en [9000..9600]×[8000..8600] (un hueco libre de la lámina). Tras pulsar «Redefinir», las tres instancias dibujan aquí: insert en (3000,2000) → [12000..12600]×[10000..10600]; insert en (4000,2700) → [13000..13600]×[10700..11300]; insert en (5000,2700) → [14000..14600]×[10700..11300]. Es decir, cada una se desplaza exactamente (+9000, +8000) mm respecto de su punto de inserción: el vector que va del punto base del bloque (0,0) a donde uno dibujó el recambio. El botón «Redefinir» del panel no pregunta el punto base en ningún momento (a diferencia de BLOCK, que sí lo pide al crear). Testigo que lo aísla: repitiendo la redefinición con el recambio dibujado alrededor del origen, las tres quedan clavadas en su punto de inserción. Luego no falla la propagación: falta preguntar el punto base.


### Molesta mucho

**Acoto un tabique dibujado con polilínea, lo muevo, y la cota se queda atrás acotando el aire — y sigue diciendo 4.000 con la misma pinta que las buenas**

Tabique = polilínea (7000,8000)→(11000,8000). DIMLINEAR sobre sus dos extremos da measurement="4000", correcto. Pero nace SUELTA: associationStatus="detached", referenceCount="0". Tras MOVE de 1.000 mm al norte, el documento guardado tiene la polilínea en vertices[0]={x:7000,y:9000} y la cota SIN MOVERSE:

    Error: Y de los puntos de definición de la cota tras mover el tabique a Y=9000
    Expected: { a: 9000, b: 9000 }
    Received: { a: 8000, b: 8000 }

Y el producto NO AVISA en ningún momento: el diálogo de la línea de comandos registra «> DIMLINEAR / Precise el origen de la primera línea de referencia / > 7000,8000 / Precise el origen de la segunda línea de referencia / > 11000,8000 / Precise la ubicación de la línea de cota / > 9000,7000» y ni una palabra sobre que esa cota no queda enganchada (aserción expect(cad-command-line-log).not.toContainText(/asociat/i), verde). La única forma de enterarse es designar la cota y leer un campo de sólo lectura llamado «associationStatus» que pone «detached».

Por qué es caro y no marginal: RECT escribe una POLILÍNEA cerrada (lo fija el golden 32), así que cualquier lado de un rectángulo acotado así nace suelto igual. La misma cota sobre una LÍNEA sí sigue al objeto —comprobado en el primer test del mismo archivo—, o sea que el usuario ve dos comportamientos opuestos para el mismo gesto sin nada que se lo explique. Test 3, marcado test.fail() con la medida pegada en el comentario: afirma lo que el producto DEBE hacer, y avisará el día que se arregle.

**Arrastro una ventana de selección empezando en la esquina inferior derecha del área de dibujo y no designa nada: ni marco, ni error, ni objetos**

Medido con el mismo dibujo y la misma cámara, variando sólo el tamaño del recuadro desde el centro del lienzo: 60px->1 sel, 100px->1 sel, 140px->3 sel, 180px->3 sel, 220px->0 sel, 260px->0 sel, 300px->0 sel; y al volver a 100px->1 sel. El HUD del cursor da 6000,4998.83711642679 antes y después de CADA arrastre, así que la cámara no se mueve: el gesto simplemente no llega. document.elementFromPoint en el punto de arranque lo explica: a 180px responde <canvas>; a 200px responde span[testid=cad-save-status] dentro de div.cad-status-bar.absolute; a 210 y 240px responde div.cad-status-bar. La barra de estado está montada ENCIMA del lienzo (dentro de cad-canvas, absolute abajo a la derecha) y se come el pointerdown. El golden 67 comprueba que nada flotante tapa un CONTROL; el lienzo no es un control, así que este caso se le escapa. Un recuadro MAYOR que contiene al menor designa menos que él, que es imposible en cualquier CAD.

**Busco mis bloques donde dice «Mis bloques» y el botón está muerto**

El panel de la izquierda tiene una sección «Mis bloques (2)» con «+ Guardar selección como bloque» que lista las MISMAS piezas del catálogo, pero contadas como «Silla 0 obj» (la silla tiene dos entidades). Al pulsar esa fila no pasa absolutamente nada: el contador cad-native-document-count no se mueve y no aparece ningún aviso —ni el «insertado como grupo» que sale cuando sí inserta, ni un motivo—. Afirmado en el paso 8a del spec: expect(contador).toHaveText(antes) y toHaveCount(0) sobre /insertado como grupo/i. Es el sitio con el nombre más obvio para buscar un bloque y es el único de los tres que no funciona.

**Busco «silla» en la caja de buscar del estudio y la que me ofrece no es mi bloque**

La caja «Buscar comando, herramienta o símbolo…» (Cmd-K) con «silla» ofrece exactamente tres piezas, las tres con la etiqueta SYMBOL: «Silla», «Silla de estilista» y «Silla de oficina». Ninguna es el bloque de la biblioteca, aunque la primera se llama IGUAL que él y tiene sus mismas medidas (450×500) y sus mismas palabras clave — es el símbolo dining-chair de src/lib/cad/symbols-architecture.ts:381. Al colocarla, el documento gana una entidad type «box» y el número de inserts NO cambia: no hay referencia, no hay definición, no hay nada que redefinir después. Dos objetos con el mismo nombre y el mismo tamaño, uno reutilizable y otro no, y el buscador sólo enseña el que no lo es.

**Creé la hoja y fui a elegir la escala: el desplegable estaba apagado y nada explicaba por qué**

El selector «Standard scale» sale disabled en una hoja recién creada porque la ventana gráfica nace locked: true (cadPlanViewport, src/lib/cad/cad-paper-viewport.ts). No hay mensaje, ni tooltip, ni texto de ayuda. El único indicio es un candado de 14 px junto al nombre de la ventana, y ese botón no tiene NADA con lo que reconocerlo: getAttribute('title') === null, getAttribute('aria-label') === null e innerText vacío (comprobado en el paso 3 del primer test). Tuve que leer el código para saber cómo desbloquearlo, que es justo lo que la auditoría cuenta como hallazgo. Súmese que ese panel está en inglés («Standard scale», «Custom scale», «Annotation scale», «Model width») dentro de una interfaz en español.

**Desfasar otra vez el mismo eje, al otro lado: tecleo OFFSET, tecleo -600, pincho el eje… y no pasa nada**

Prueba «el clic con el que se designa se PIERDE si cae sobre un pinzamiento», paso 2:
  Error: MISMO comando, MISMO objeto, sólo cambia el píxel: el clic sobre el pinzamiento del punto medio no llega al comando y no se crea nada, sin ningún aviso al usuario
  expect(received).toHaveLength(expected)
  Expected length: 1 / Received length: 0 / Received array: []
CONTROL del paso 1, verde: el MISMO comando, sobre el MISMO eje, pinchando a 2000 mm del punto medio, SÍ crea la paralela. Lo único que cambia es el píxel.
El registro de órdenes no dice absolutamente nada: «> OFFSET  Precise la distancia de desfase  > 600  Designe el objeto a desplazar  > OFFSET  Precise la distancia de desfase  > 600  Designe el objeto a desplazar».
Causa aislada con seis recorridos: una orden que designa con el ratón deja el objeto SELECCIONADO al acabar (comprobado: el panel de propiedades se abre solo), un objeto seleccionado enseña sus pinzamientos, y un clic sobre un pinzamiento se lo come el gestor de pinzamientos antes de llegar al comando.
Descartadas midiendo, no opinando: el signo negativo NO es el problema (-600 a la primera sí crea la paralela en y=6400); OFFSET no se agota (desfasar la paralela recién creada sí funciona, y=8200); no es un guardarraíl anti-duplicados (con distancia 800, geometría nueva, tampoco hace nada); y mover el ratón y volver al mismo punto no lo arregla.

**El cuadro de exportar me prometió que la capa NOTAS iba dentro, y el fichero no la llevaba.**

Primera pasada (el plano tenía SÓLO un TEXT en NOTAS, sin MTEXT): el «Paquete de capas» del cuadro decía «COTAS · MUROS · NOTAS · Text» con la fila «NOTAS 1/1 incl.», y la tabla LAYER del fichero descargado era ["0","COTAS","MUROS","Text"] — NOTAS no existe en el fichero. El receptor guardó capas ["0","COTAS","MUROS","Text"] y la aserción falló con: «la capa NOTAS no llegó al otro despacho» Expected "NOTAS" / Received ["0","COTAS","MUROS","Text"]. Misma raíz que el hallazgo anterior: si en esa capa sólo hay TEXT, la capa entera se evapora del intercambio sin una palabra.

**Intento redefinir como en AutoCAD, tecleando BLOCK con el mismo nombre, y el producto me manda a un sitio que no existe**

Teclear «B» ⏎ y luego «Silla» responde literalmente: «El bloque Silla ya existe. Use otro nombre o redefínalo.» No hay ningún comando con el que redefinir: BEDIT no redefine, sólo abre el panel; el resto del catálogo de 204 no tiene ninguno. El propio texto de BEDIT cuando el panel no está montado dice «BLOCK con el mismo nombre redefine la definición y los INSERT se actualizan solos», que es justo lo que BLOCK acaba de negarse a hacer. Al delineante se le manda a un camino cerrado.

**No veo qué cara voy a empujar: la cara que miro no está pintada y designarla no la resalta**

Capturas del recorrido (scratchpad: 2-frontal.png, 3-cursor-sobre-la-cara.png, 4-cara-designada.png). (a) En alzado frontal, una caja de 6000×5000×3000 se ve HUECA: se ve el interior de la pared del fondo, sin fachada delante y sin techo — el sólido se pinta con las caras que miran a la cámara descartadas. (b) Con PRESSPULL activo y el cursor sobre la cara, el pickbox queda sobre lo que parece suelo vacío y NADA se resalta. (c) Al pinchar se ilumina en cian EL SÓLIDO ENTERO, no la cara designada; la única forma de saber cuál se cogió es leer «cara 5 de 6» en el registro. En SketchUp la cara bajo el cursor se sombrea antes de tocarla, y ahí está media usabilidad del gesto.

**Pedí «PLOT → Extensión → Trazar», que es la forma normal de sacar un dibujo en AutoCAD**

La línea de comandos responde: «No se puede trazar: El área de trazado «extents» no está definida en este dibujo.» — con cuatro líneas dibujadas en el modelo. No es un caso raro del documento: buildCadPlotJob construye las fuentes de área con cadPlotAreaSources(input.pageSetup, null) en src/lib/cad/plot/plot-job.ts:271 y :359, con la envolvente FIJADA a null, y la función que la calcularía, cadPlotExtents (src/components/cad/command-line/plot-host.ts:397), está exportada y no la llama nadie en todo el repo. Como «limits» reutiliza «extents», «PLOT LÍmites» cae por lo mismo: dos de las seis opciones del prompt no pueden trazar nunca. Aviso a favor del producto: lo dice claro en vez de sacar un PDF vacío.

**Quiero marcar el hueco de una ventana en la fachada: un rectángulo. No se puede — sólo LINE dibuja fuera del plano del suelo**

Ejecutado con el SCU apoyado en la cara, tecleando cada orden y luego «0,0». Respuesta literal, idéntica para las tres: «RECTANG todavía no sabe dibujar fuera del plano XY del mundo, y el SCU activo está inclinado: el trazo se guardaría a cota cero, donde no lo puso usted. Vuelva al SCU universal con UCS Universal, o use LINE, que sí conserva la cota.» — y lo mismo palabra por palabra para CIRCLE y para PLINE. El aviso es honesto y falla cerrado (eso es bueno), pero el resultado práctico es que sobre una fachada sólo se pueden trazar segmentos sueltos, y sólo tecleando coordenadas.

**Recortar pinchando el sobrante por su extremo, con el muro seleccionado: tampoco recorta**

Mismos pasos 3 y 4 de esa prueba, y aquí el control aísla UNA sola variable —la selección— porque el clic es el mismo píxel en los dos casos:
  [auditoría] tras RECORTAR pinchando el extremo, el muro acaba en x=9000   (muro SELECCIONADO)
  [auditoría] CONTROL sin selección: el muro acaba en x=6000                (nada seleccionado)
  Expected: 6000 / Received: 9000
O sea: no es del comando OFFSET ni del punto elegido. Con pinzamientos en pantalla el clic desaparece; sin ellos, el mismo clic recorta bien. Afecta por igual a desfasar y a recortar, que son dos de las cinco órdenes que se usan todo el día.

**Todos mis rótulos TEXT llegaron al otro despacho en una capa «Text» que yo nunca creé, en vez de en mi capa NOTAS.**

El fichero exportado lleva 'TEXT · capa=Text · «SALA DE JUNTAS»' mientras el MTEXT de la MISMA capa sale bien ('MTEXT · capa=NOTAS'). Documento del receptor: la entidad text vuelve con layer='Text'. Aserciones: «el TEXT sale en una capa inventada en vez de la suya» Expected: "NOTAS" / Received: "Text" (spec:320) y «el rótulo volvió en otra capa» Expected: "NOTAS" / Received: "Text" (spec:421). Y nadie lo declara: el preflight muestra «DXF listo para descargar» con 0 filas de pérdida, y el receptor lee «Entró completo: 7 entidad(es) y 0 bloque(s), sin pérdidas»; manifiesto de pérdidas del receptor: [].


### Molesta poco

**Antes de mandar el fichero, el resumen del cuadro me dijo que llevaba 0 cotas; llevaba una.**

Texto del cuadro: «RESUMEN / Objetos 7 / Conectores 0 / Cotas 0 / Notas 1 / Capas 4». El fichero descargado contiene 1 entidad DIMENSION (capa COTAS) que sí viaja y sí vuelve. Aserción: «el cuadro anuncia «Cotas 0» y el fichero lleva 1 DIMENSION» (spec:336). Además el «Paquete de capas» inventa una fila «Text 1/1 incl.» junto a «NOTAS 2/2 incl.»: 3 filas para 2 rótulos, o sea el mismo TEXT contado dos veces.

**Busqué la palabra «Imprimir» en el estudio, como haría cualquiera**

El único texto «Imprimir» que hay en el estudio es «Imprimir hoja» dentro de la ayuda de atajos (src/components/cad/dialogs/CadStudioDialogs.tsx:99), y lo que imprime es la chuleta de atajos para pegar junto al monitor, no el plano. El botón que de verdad imprime no lleva rótulo: es un icono de impresora en la barra superior cuyo title es «Publicar conjunto PDF vectorial — hojas, viewports y cajetines» (Layout3DEditor.tsx:15332). El camino que funciona pasa por otro icono sin rótulo, «Paquete de entrega», donde sí hay un botón con texto: «Publicar PDF (1)».

**Leo el aviso de por qué no me deja dibujar y está en inglés, con el verbo equivocado y un identificador que no he visto nunca**

Texto literal capturado del toast fresco: «Layer EJES is locked. Unlock it before editing cad_mtid3ya2_lm2w.» Tres cosas para un producto que habla español: (1) el idioma; (2) el verbo — yo estaba DIBUJANDO, no editando, y el propio producto tiene la frase correcta («Unlock it before drawing on it») para el camino del ratón, pero el camino tecleado cae en el mensaje genérico de edición; (3) el identificador cad_mtid3ya2_lm2w, cuando el resto del estudio se esfuerza en decir «Línea 3» y esconder el id técnico en el title.

**Para saber si una cota está viva o muerta tengo que designarla y leer «associationStatus: detached», en inglés, en un panel lateral**

El estado se lee en cad-native-property-associationStatus ("associated" / "detached" / "broken") y los anclajes en cad-native-property-referenceCount, ambos campos de sólo lectura y con el nombre técnico en inglés, en una interfaz que por lo demás está en español («Precise el origen de la primera línea de referencia», «Designe el objeto a acotar»). En el lienzo las dos cotas se dibujan idénticas: nada distingue a simple vista la que seguirá al muro de la que no.

**Quiero clavar un MENSAJE del chat de equipo en un punto del plano y no hay manera**

En team-messaging-panel, los botones con nombre /anclar|ancla|plano|punto/i son 0. El mensaje enviado llega al servidor con anchor: null, aunque el contrato MessagingMessage/MessagingMessageCreate SÍ lleva el campo `anchor` («mismo contrato JSON que CadComment.anchor»). Aserción: {botonesDeAncla: 0, anclaDelMensaje: null}. Anclar sólo existe en los comentarios de revisión (cad-collab-place), que es otra superficie y otro muelle.

**Quiero escribirle sólo a mi socia, no al canal del proyecto, y no hay por dónde**

Inventario completo de botones dentro de team-messaging-panel: ["General", "Enviar"]. Ni uno para abrir una conversación con una persona. El contrato de la API sí soporta canales `direct` (MessagingChannelCreate con memberUserId), así que lo que falta es el mando, no el servidor.


## Recorridos, uno por uno

### [sirve] Levantar la planta de un departamento sencillo: contorno exterior de 6000×4000 mm, un muro divisorio, comprobar que las esquinas CIERRAN (no que casi se tocan) y medir una pared con la herramienta de distancia esperando 6000. Spec: /home/user/valle-design/apps/web/e2e/auditoria/planta.spec.ts, corrido tres veces en verde (1,7 / 2,0 / 1,9 min).

La tarea número uno de un despacho SALE, y sale bien: dibujé el contorno de 6000×4000 tecleando, cerré con C y las cuatro esquinas quedan con holgura CERO exacta —no «casi cero»—, el muro divisorio toca ambos muros largos con distancia 0, y al medir con la herramienta de «Distancia» el producto dice 6,000 mm, corroborado por DIST con «Distancia = 6000.0000». Lo más convincente no es que el número salga, sino cómo: mis clics cayeron 11,8 y 8,5 mm fuera de la esquina y el enganche a objetos los llevó al extremo real, que es exactamente lo que un arquitecto necesita para fiarse de lo que mide. Dos peros, ninguno bloqueante: la fixture compartida worldPoint no aguanta esta máquina y aborta con «la vista no se asentó en planta ortográfica» aunque la vista está perfecta (la medí a mano: a=d=24,8082, b=c=0), lo cual explica el rojo del golden 61 y es coste de entorno, no de producto; y averiguar dónde queda escrita la medida me obligó a abrir el monolito, porque el panel «Cotas guardadas» no tiene identificador y su texto vacío te manda a otra función distinta.

### [sirve] Dibujar por coordenadas exactas como haría un ingeniero: LINE por coordenada absoluta y relativa (0,0 → @3500,0), LINE por coordenada polar (1000,5000 → @3500<30), medir con DIST, engancharse con OSNAP al extremo de la primera línea para arrancar la segunda, y sacar el dibujo a DXF — comprobando en cada paso el DOCUMENTO GUARDADO dígito a dígito, no el lienzo.

El producto acierta el número exacto, que es lo que estaba en duda. Una cota tecleada de 3500 mm se guarda como 3500 clavado (igualdad estricta de dobles, no «casi»), la polar sale con el largo y el ángulo pedidos, DIST devuelve el mismo número, el enganche a extremo entrega la coordenada EXACTA del vértice —4031,0889132455354— y no la del ratón, y el DXF exportado sigue midiendo 3500 al reimportarlo. No encontré ni un solo redondeo indebido: para dibujar por coordenadas y fiarse de la medida, hoy sirve. Lo único que me frenó fue del arnés, no del producto: la fixture compartida `world-point.ts` necesita 13-17 s por llamada en esta máquina y su propio plazo es de 15 s, así que el camino de ratón se cae a cara o cruz; medí la causa y la dejo apuntada porque explica el «61 falla en worldPoint» que ya tenía el equipo.

### [sirve] Delineante que impone su estándar de capas sobre un plano recibido con todo en la capa 0: crea MUROS/EJES/COTAS con su color, reparte los tres objetos, cambia el color de una capa ya en uso, bloquea EJES y comprueba que no puede ni tocarla ni dibujar encima, congela COTAS y comprueba que desaparece del dibujo, guarda, recarga y verifica que todo sigue igual. Ejercido de punta a punta en apps/web/e2e/auditoria/capas.spec.ts, VERDE dos veces seguidas (1,7 min cada una).

Para lo que se le pidió, el estándar de capas del producto está sano: crear capas con color, repartir objetos, recolorear, bloquear y congelar funcionan, y —lo difícil— sobreviven enteros a guardar y recargar, no sólo como dibujo del panel sino mandando de verdad sobre el plano (tras recargar, la capa congelada sigue sin designarse). El candado además protege en los dos frentes que importan: ni deja tocar lo que ya está en la capa, ni deja dibujar encima; lo verifiqué con un control positivo para no confundir «me lo impidió el candado» con «teclear no dibuja». Dos pegas: el aviso de rechazo está en inglés, dice «editing» cuando yo estaba dibujando y suelta un id técnico; y, fuera ya del tema de capas pero tropezado por el camino, la barra de estado está montada encima del lienzo y se traga el arrastre — una ventana de selección iniciada en la esquina inferior derecha del área de dibujo no designa nada, sin decir por qué, y un recuadro grande llega a designar menos que uno pequeño contenido en él.

### [sirve_con_reservas] Acotar un plano para obra en /legacy/studio: poner cotas lineales, alineadas y de radio sobre un muro (línea), un faldón en diagonal 3-4-5 y un pilar redondo; comprobar que cada cota DICE la medida real del objeto, y que al mover o alargar el objeto la cota se actualiza sola. Hecho por los dos caminos que usaría un arquitecto: tecleando la orden y los orígenes en la línea de comandos, y señalando el muro con el ratón (DIMLINEAR → opción «Objeto» → un clic). Spec en apps/web/e2e/auditoria/acotar.spec.ts, corrido de verdad: 3 pruebas, 3,4 m.

Sí se puede acotar un plano hoy, y bien: lineal, alineada y de radio dan el número exacto (4.000 el muro, 5.000 el largo real de la diagonal, R750 el pilar), la alineada y la lineal se distinguen de verdad, y sobre líneas y círculos la asociatividad funciona de punta a punta — muevo el muro y la cota va con él, lo alargo a 4.500 y el número cambia solo, ensancho el pilar a R900 y la cota de radio también. Y funciona igual tecleando que señalando el muro con el ratón, que es el gesto real. La reserva es una y pesa: una cota puesta sobre una POLILÍNEA nace suelta, el producto no lo dice en ningún sitio, y al mover la pieza la cota se queda atrás diciendo el mismo número con la misma pinta que las buenas — y como RECT dibuja polilíneas, le va a pasar a cualquiera que acote el lado de un rectángulo. Mientras eso no avise, yo no firmaría un plano acotado sobre polilíneas sin repasarlo a mano.

### [sirve_con_reservas] Editar un plano que ya existe: MOVER y COPIAR una columna, DESFASAR un eje de replanteo, RECORTAR un muro contra un tabique, ALARGAR una viga hasta un pilar, y después DESHACER las cinco órdenes una a una comprobando cada estado intermedio, y REHACERLAS. Corrido con: E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000 npx playwright test e2e/auditoria/modificar.spec.ts --project=chromium --reporter=line (desde apps/web). Resultado: 2 pruebas verdes, 1 roja, y la roja es del producto.

Las cinco órdenes del día a día funcionan y el deshacer es FIEL: cinco deshaceres seguidos devuelven el dibujo exactamente al estado anterior a cada orden —comparación profunda de todas las entidades y del orden de dibujo, no del número de objetos— y los cinco rehaceres lo devuelven exactamente al final. Eso es lo difícil y está bien hecho. Pero hay un defecto que muerde en la primera hora: en cuanto un objeto queda seleccionado (y una orden lo deja seleccionado sola, al designarlo), un clic que caiga sobre uno de sus pinzamientos —extremos o punto medio— NO llega al comando: no dibuja nada, no recorta nada y no dice nada. Como el punto medio de una línea es justo donde uno pincha, el usuario ve «a veces el desfase no hace nada» y no tiene forma de saber por qué; sólo se salva pinchando en otro sitio del mismo objeto, cosa que nadie va a adivinar.

### [sirve_con_reservas] Jefe de obra que necesita el plano en papel: abrir el estudio con una nave sembrada de 10.000 × 8.000 mm, buscar la impresión, crear la hoja, elegir escala (1:50 y 1:100), publicar el PDF y MEDIR DENTRO del archivo descargado si la escala se respeta. También el camino de siempre: teclear PLOT. Spec en /home/user/valle-design/apps/web/e2e/auditoria/imprimir.spec.ts, 3 tests, corridos de verdad (1,2 min, los 3 pasan; el segundo es un test.fail() que documenta un defecto).

El plano SÍ sale en papel y la escala es exacta, no aproximada: a 1:50 la nave de 10.000 × 8.000 mm mide 200,00 × 160,00 mm dentro del PDF, y a 1:100 mide 100,00 × 80,00. Eso es lo difícil y está bien hecho, por dos caminos independientes (el botón «Publicar conjunto PDF» y teclear PLOT). Lo que rompe el día de trabajo es la segunda impresión: si imprimes, cambias algo (la escala, el cajetín) y vuelves a imprimir, el guardado choca con un conflicto CAS, no sale PDF y el dibujo se queda sin poder guardarse hasta recargar la página. Con ese defecto arreglado yo firmaría el plano; hoy hay que recargar entre impresión e impresión y saberlo de antemano.

### [sirve_con_reservas] Intercambio con otro despacho: abrí un plano con geometría (línea, contorno cerrado, círculo, arco) en capa MUROS, un rótulo TEXT y un MTEXT en capa NOTAS y una cota lineal en capa COTAS; lo exporté a DXF por la barra del estudio («Exportar a DXF» → cuadro → Descargar DXF), y ese MISMO fichero lo abrí desde el tablero con «Importar como documento», que es lo que hace quien lo recibe. Comprobé qué sobrevive midiendo el documento que el receptor acaba guardando, y contrasté lo perdido contra lo que el producto declara en las dos puntas (preflight de exportación e informe de importación).

El viaje de ida y vuelta funciona mejor de lo que esperaba: geometría exacta al milímetro, capas de verdad, MTEXT con su capa, y —lo más difícil— la cota lineal vuelve como COTA editable, no como líneas sueltas. Pero cada entidad TEXT sale del producto en una capa llamada «Text» que el arquitecto nunca creó, y su capa real (NOTAS) puede desaparecer entera del fichero; lo grave no es la degradación sino que las dos puntas dicen «sin pérdidas»: el preflight declara CERO y el informe de importación dice «Entró completo… sin pérdidas». Eso es exactamente la pérdida muda que rompe la confianza con el cliente, y encima el resumen del cuadro de exportar anuncia «Cotas 0» cuando el fichero sí lleva la cota.

### [sirve_con_reservas] Arquitecto que quiere ver el edificio en tres dimensiones: levantar la planta dibujada (EXTRUDE), pasar a 3D isométrica, EMPUJAR UNA FACHADA con el ratón (PRESSPULL) y comprobar que el volumen cambia, y después apoyar el plano de trabajo en esa fachada (UCS > Cara) y dibujar encima. Spec ejecutado: /home/user/valle-design/apps/web/e2e/auditoria/tresd.spec.ts (3 pruebas, 3 verdes en 1,0 min; la tercera es un test.fail() que documenta un defecto vivo). Corrido con E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000 npx playwright test e2e/auditoria/tresd.spec.ts --project=chromium --reporter=line

El núcleo de modelado 3D funciona de verdad y funciona bien: la planta se levanta, la fachada se empuja con un clic del ratón y el volumen crece con el número exacto, y todo se persiste como árbol reeditable en vez de como malla horneada. Apoyar el plano de trabajo en una cara vertical también funciona, y dibujar sobre ella TECLEANDO coordenadas deja la geometría en la cara, con su cota. Lo que no funciona es justo el gesto por el que se elige SketchUp: dibujar sobre esa cara CON EL RATÓN manda el trazo al suelo (z=0) sin decir nada, y en el visor no se ve qué cara vas a empujar porque las caras que miran a la cámara ni siquiera se pintan. Hoy compite con SketchUp para quien teclea coordenadas; no para quien dibuja con el ratón.

### [sirve_con_reservas] Delineante que reutiliza mobiliario: abrir el estudio, buscar la biblioteca de bloques, insertar una silla del catálogo dos veces, moverla con MOVE, copiarla con COPY, y editar la definición para ver si cambian todas las copias. Además, comprobar los otros dos sitios del estudio que dicen «bloque» o «símbolo». Todo verificado en apps/web/e2e/auditoria/bloques.spec.ts, que pasa en verde tres veces seguidas (~57 s) con E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000.

El núcleo de bloques es sólido de verdad: la biblioteca del inquilino llega sembrada, se busca por nombre y por palabra clave, lo insertado es una REFERENCIA con sus atributos (no líneas copiadas), MOVE y COPY la tratan como una pieza y redefinir la definición propaga a las tres copias al milímetro. Pero el gesto de redefinir no pregunta el punto base: si el recambio no se dibujó justo encima del origen, las tres sillas se van tantos metros como haya del origen al recambio (medido: 9.000 mm en X y 8.000 en Y), y ése es el único camino que hay, porque teclear BLOCK con el mismo nombre contesta «redefínalo» y no existe ningún comando con el que redefinir. A eso se suma que el estudio tiene tres sitios que dicen «bloque» y sólo uno funciona: «Mis bloques» lista la silla como «0 obj» y al pincharla no hace nada ni dice por qué, y la caja de buscar ofrece una «Silla» que es un símbolo viejo y al colocarla nace un box, no una referencia. Un despacho puede trabajar con esto, pero el día que el cliente cambie la silla el delineante va a tirar el plano al monte sin enterarse.

### [sirve_con_reservas] Socio de un despacho de dos personas: abrir el mismo plano que mi socia, ver quién está dentro y dónde mira, dejarle una nota clavada en un punto del dibujo, escribirle por la mensajería del estudio y llamarla por vídeo. Todo desde /studio/<documentId>, con dobles de servidor que contestan el contrato publicado de /v1/messaging/*, /v1/calls/* y /v1/cad/documents/:id/presence*. Spec: apps/web/e2e/auditoria/equipo.spec.ts — 9 pruebas, las 9 en verde (1,3 min).

El diferenciador está VIVO, no es decorado: presencia, comentario anclado al plano, chat de equipo y videollamada existen, responden y en tres momentos distintos dicen la verdad en vez de fingir. Lo mejor con diferencia es el comentario anclado: la chincheta cae a menos de 24 px de donde pinché y sigue ahí al día siguiente. Las reservas son tres y todas de la mensajería, no del dibujo: un mensaje de chat NO se puede clavar en un punto (sólo los comentarios de revisión), no hay forma de escribirle en privado a una persona, y un plano que no cuelga de un proyecto deja el panel de equipo sin un solo botón que pulsar. Del vídeo verifiqué la sala, el listado, los mandos y el colgado; NO pude verificar que la imagen y el sonido lleguen de verdad entre dos participantes.

