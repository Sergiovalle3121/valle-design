# El listón: qué es AutoCAD completo

Documento de referencia escrito **sin abrir el repositorio**, a propósito: define contra qué
se compite antes de mirar qué hay.

# EL LISTÓN: AutoCAD completo, trabajo 2D

Documento de referencia. Escrito **sin abrir el repositorio**, a propósito: define contra qué se compite antes de mirar qué hay.

## Cómo leer esto

Marcadores por ítem:

- **[I] IMPRESCINDIBLE** — sin esto un despacho no puede *entregar*. Su ausencia no es una carencia de feature, es que el trabajo no sale.
- **[A] AVANZADO** — diferenciador. Es, en buena medida, la razón por la que un despacho paga AutoCAD completo en vez de LT. Aquí es donde se gana o se pierde el argumento "prefiéranlo a AutoCAD completo".
- **[?]** — dato que **no afirmo con seguridad**. Puede ser el nombre exacto del comando, la versión en que apareció, o si es núcleo o Express Tools. Tratar como hipótesis a verificar, no como listón.

Cada área cierra con una **PRUEBA DE DESPACHO**: una tarea concreta y real. Si esa tarea no sale de principio a fin, el área está *a medias* aunque la lista de comandos esté completa.

Aclaración de alcance: esto es el **AutoCAD base 2D**, no los siete toolsets. El toolset (Architecture, Mechanical, Electrical, MEP, Map 3D, Plant 3D, Raster Design) es otro listón, más alto y más estrecho. Nadie llega al toolset sin dominar antes todo lo que sigue.

---

## 0. Base transversal: precisión y entrada

No es un área de la lista pedida, pero va primero porque **atraviesa todas las demás** y porque es literalmente lo que un dibujante siente en los dedos. Si esto falla, ninguna de las ocho áreas siguientes se salva.

**[I] Entrada de coordenadas**
- Absolutas `x,y`; relativas `@dx,dy`; polares `@dist<ángulo`.
- *Direct distance entry*: apuntar con el ratón y teclear sólo la distancia.
- Entrada dinámica (`DYNMODE`) con campos editables y `TAB` para saltar entre distancia y ángulo.

**[I] Referencias a objetos (`OSNAP`)** — el juego completo, no tres de ellas: Endpoint, Midpoint, Center, Geometric Center [?] (creo que se añadió hacia 2016), Node, Quadrant, Intersection, Extension, Insertion, Perpendicular, Tangent, Nearest, Apparent Intersection, Parallel. Con: osnap permanente vs. de una vez (override por menú `Shift`+clic derecho), marcador visual + tooltip, y `F3` para conmutar.

**[I] Rastreo**: Object Snap Tracking (`OTRACK`, `F11`), Polar Tracking (`POLAR`, `F10`) con incrementos y ángulos adicionales, Ortho (`F8`), Snap/Grid (`F9`/`F7`).

**[I] Selección profesional**: ventana vs. captura (colores azul/verde, borde sólido vs. discontinuo), `F` fence, `WP`/`CP` polígono, `L` last, `P` previous, `ALL`, `R`/`A` remove/add, selección por ciclo cuando hay objetos encimados, `Shift`+clic para quitar.

**[I] Pinzamientos (grips)**: estirar, mover, rotar, escalar, simetría por barra espaciadora sobre un pinzamiento; **grips multifuncionales** (en una polilínea: estirar, añadir vértice, quitar vértice, convertir a arco) — esto último es lo que un dibujante usa el 60% del tiempo y casi nadie clona bien.

**[I] Línea de comandos real**: teclear el comando, ver las opciones entre corchetes, elegir por letra clave, `Enter`/`Espacio` para repetir el último, `Esc` para abortar, historial con `F2`, comandos transparentes (`'ZOOM`, `'PAN` dentro de otro comando).
- Autocompletado, autocorrección y sugerencias adaptativas (los comandos más usados suben en la lista). [?] La búsqueda dentro de la línea de comandos también encuentra capas, bloques y patrones de sombreado, no sólo comandos — creo que sí, marcar como a verificar.

**[I] `UCS` / `UCSICON` / `PLAN`** — dibujar sobre un eje girado (una fachada en diagonal, una crujía a 27°) es rutina, no exotismo.

**[I] `UNITS`**: unidades y precisión de longitud y ángulo, dirección del ángulo base, sentido horario/antihorario, `INSUNITS` para que los bloques entren a la escala correcta.

**[A] `ISODRAFT`** — modo isométrico 2D (planos isométricos de instalaciones, muy usado en tubería y sanitario).

**[A] `QUICKCALC` / `CAL`** — calculadora transparente que devuelve un valor o un punto dentro de un comando en curso.

**[A] Restricciones paramétricas 2D**: geométricas (`GEOMCONSTRAINT`: coincidente, colineal, concéntrica, fija, paralela, perpendicular, horizontal, vertical, tangente, suave, simétrica, igual), dimensionales (`DIMCONSTRAINT`), `AUTOCONSTRAIN`, administrador de parámetros con fórmulas. Existe en AutoCAD completo desde 2010 [?] y es la base de los bloques dinámicos avanzados.

> **PRUEBA DE DESPACHO**: dibujar un muro de 3.47 m a 27° desde el punto medio de otro muro, sin tocar el ratón más que para señalar el punto medio, y que la línea quede exactamente ahí. Después, mover su extremo con un pinzamiento hasta la intersección aparente de otras dos líneas.

---

## 1. DIBUJO

**[I] Primitivas**: `LINE`, `PLINE` (con anchura, tramos de arco, cierre), `CIRCLE` (centro-radio, 2P, 3P, TTR, TTT), `ARC` (los ~11 métodos, y en la práctica al menos 3P, inicio-centro-fin, inicio-fin-radio), `RECTANG` (con chaflán, empalme, anchura, área, rotación), `POLYGON` (inscrito/circunscrito/por lado), `ELLIPSE` (+ arco elíptico), `POINT` con `DDPTYPE` (estilo y tamaño de punto), `XLINE` y `RAY` (líneas de construcción), `DONUT`.

**[I] `SPLINE`** (ajuste y puntos de control) + `SPLINEDIT`. Curvas de nivel, jardinería, viales.

**[I] `HATCH`** — y esto es más grande de lo que parece:
- Patrones predefinidos ANSI/ISO/otros, definidos por el usuario (líneas a ángulo y separación), y **patrones personalizados `.pat`**.
- Escala y ángulo por patrón; origen del sombreado controlable (crítico para que el aparejo de un muro empiece donde debe).
- Detección de islas (normal / exterior / ignorar), selección por punto interior o por objetos.
- **Sombreado asociativo** (sigue al contorno cuando el contorno cambia) y anotativo.
- Tolerancia de huecos (`HPGAPTOL`) para contornos que no cierran perfectamente.
- Sombreados separados vs. uno solo; transparencia y orden de visualización.
- `GRADIENT`, `HATCHEDIT`, `BOUNDARY` (genera polilínea o región del área cerrada).
- [?] `SUPERHATCH` (sombrear con un bloque o imagen como patrón) — creo que es Express Tools, no núcleo.

**[I] `REVCLOUD`** con modos rectangular, poligonal, a mano alzada y desde objeto, más la opción de modificar una nube existente.

**[I] `WIPEOUT`** (máscara opaca) con control de marco visible/imprimible. Un plano de arquitectura sin wipeouts se entrega sucio.

**[I] `TABLE`** como objeto de dibujo (detalle en el área 6).

**[I] `MTEXT` y `TEXT`** (detalle en el área 3).

**[A] `REGION`** y booleanas 2D (`UNION`, `SUBTRACT`, `INTERSECT` sobre regiones) — la vía correcta para calcular áreas netas complejas (superficie menos huecos) y para `MASSPROP` (centroides, momentos de inercia). Muy usado por estructuristas.

**[A] `MLINE` / `MLSTYLE` / `MLEDIT`** — multilíneas para muros. Herencia legada y con edición pobre; lo digo con franqueza: existe pero casi nadie lo usa en AutoCAD base porque los despachos serios usan polilíneas o el toolset de Architecture. **No lo pondría en el listón imprescindible.**

**[A] `SKETCH`, `TRACE`, `SOLID` (2D relleno)** — legados. Mencionados para completitud; no son listón.

> **PRUEBA DE DESPACHO**: rayar el corte de un muro de tabique con un patrón a 45°, escala coherente con la escala de impresión, con el origen del rayado alineado a la esquina del muro, y que al estirar el muro el rayado siga. Luego calcular el área neta de un departamento (perímetro menos ductos) y que el número sea confiable.

---

## 2. MODIFICACIÓN

**[I] El núcleo diario**: `ERASE`, `COPY` (con modo múltiple y opción array), `MOVE`, `ROTATE` (con opción Referencia), `SCALE` (con opción Referencia — escalar por dos puntos conocidos), `MIRROR` (con `MIRRTEXT`), `OFFSET` (distancia, punto de paso, borrar origen, capa origen/actual), `STRETCH` (con captura), `TRIM` y `EXTEND` (con selección de contornos, opción borde extendido, y el modo rápido moderno donde todo es contorno), `BREAK`, `BREAKATPOINT`, `JOIN`, `FILLET` (radio 0 = esquina en L), `CHAMFER`, `EXPLODE`, `ALIGN`, `LENGTHEN`.

**[I] `PEDIT`** — editar polilínea: unir múltiples segmentos en una sola polilínea (con tolerancia de holgura), cambiar anchura, ajustar/spline, abrir/cerrar, editar vértices. Sin un `PEDIT` que **una de verdad** no hay forma de obtener perímetros ni áreas fiables.

**[I] `ARRAY` asociativo**: `ARRAYRECT`, `ARRAYPOLAR`, `ARRAYPATH`, con edición posterior (`ARRAYEDIT`), sustitución de elemento (`ARRAYEDIT` → Replace) y edición de un elemento suelto sin romper la matriz. La matriz **asociativa y editable** es el listón; una matriz que sólo copia y se olvida es la mitad.

**[I] `MATCHPROP`** (igualar propiedades, con configuración de qué propiedades incluye: capa, color, tipo de línea, escala, grosor, transparencia, estilo de texto, cota, sombreado, tabla, multidirectriz).

**[I] Paleta `PROPERTIES`** (`Ctrl+1`) — edición de cualquier propiedad de cualquier objeto, y edición **de selección múltiple heterogénea**. Es el segundo pilar de la interfaz después de la línea de comandos.

**[I] `QSELECT`** (selección rápida por propiedad) y **`SELECTSIMILAR`**. Sin ellos, "cambia todo el texto de 2.5 a 3.0 mm" es una tarde de trabajo en vez de 20 segundos.

**[I] `DIVIDE` / `MEASURE`** (con inserción de bloque en cada punto).

**[I] Orden de visualización**: `DRAWORDER`, `TEXTTOFRONT`, `HATCHTOBACK`.

**[I] `GROUP`** con conmutador de selección de grupo (`PICKSTYLE`, `Ctrl+Shift+A`).

**[A] `OVERKILL`** — eliminar duplicados y fundir segmentos colineales. Es *el* comando de limpieza antes de entregar o de calcular áreas. [?] Creo que hoy es comando de núcleo (nació en Express Tools); verificar.

**[A] `BLEND` (`BLENDCURVE`)**, `REVERSE`, `CHSPACE` [?] (mover objetos entre espacio modelo y papel ajustando la escala; creo que se promovió a núcleo).

**[A] `FILTER`** (filtro de selección con operadores lógicos y filtros guardados) — más potente y menos usado que `QSELECT`.

**[A] Aislar/ocultar objetos**: `ISOLATEOBJECTS`, `HIDEOBJECTS`, `UNISOLATEOBJECTS`.

**[A] Express Tools de modificación** [?] (creo que estos son Express, no núcleo): `NCOPY` (copiar objetos anidados dentro de un xref o bloque sin explotarlo — enormemente usado), `BURST` (explotar bloque conservando los atributos como texto), `FLATTEN` (aplanar a Z=0), `MSTRETCH` (estirar con múltiples ventanas de captura), `MOCORO` (mover-copiar-rotar-escalar en un comando), `EXTRIM` (recortar todo lo que cruza una línea), `BREAKLINE`, `COPYM`.

> **PRUEBA DE DESPACHO**: recibir un DWG ajeno, unir en una sola polilínea el contorno de un predio dibujado con 34 líneas sueltas mal empatadas, limpiar duplicados, y obtener perímetro y superficie que coincidan con la escritura. Después, cambiar de capa las 400 cotas del plano sin tocar nada más.

---

## 3. ANOTACIÓN

Ésta es el área donde un CAD "se ve como CAD" o se ve como un dibujo de programador. Y es donde más se subestima el listón.

**[I] Texto**
- `STYLE`: estilos de texto con fuente TrueType **y `.shx`** (importa: `romans.shx`, `simplex.shx`, `isocpeur` son la firma visual de un plano de AutoCAD), altura fija o variable, factor de anchura, oblicuidad, anotativo.
- `TEXT` (una línea, con justificaciones: izquierda, centro, derecha, medio, ajustar, alinear, TL/TC/TR/ML/MC/MR/BL/BC/BR).
- `MTEXT`: párrafos, columnas, viñetas y numeración, tabuladores y sangrías, fracciones apiladas (`1/2`, `1#2`, `1^2`), sub/superíndice, mayúsculas/minúsculas, **máscara de fondo**, insertar símbolo (Ø, °, ±, ℄), insertar **campo**, corrector ortográfico (`SPELL`), buscar y reemplazar (`FIND`) en todo el dibujo.
- `TEXTEDIT`, `TEXTALIGN` (alinear textos dispersos), `DDEDIT` (legado).
- [?] `ARCTEXT` (texto sobre arco), `TXTEXP` (texto a geometría), `TCASE`, `TCOUNT` (numeración secuencial de textos) — creo que todos son Express Tools.

**[I] Cotas** — el listón completo, no cuatro comandos:
- `DIM` (comando unificado y contextual: reconoce si señalas una línea, un arco o un círculo y coloca la cota correspondiente) [?] creo que desde 2016.
- `DIMLINEAR`, `DIMALIGNED`, `DIMANGULAR`, `DIMRADIUS`, `DIMDIAMETER`, `DIMJOGGED` (radio con quiebre, para radios grandes), `DIMARC` (longitud de arco), `DIMORDINATE` (coordenadas, indispensable en topografía y en placas), `DIMBASELINE`, `DIMCONTINUE`, `QDIM` (acotación rápida de muchos puntos).
- `DIMSPACE` (igualar separación entre líneas de cota), `DIMBREAK` (corte de línea de cota al cruzar otra), `DIMJOGLINE` (quiebre en cota de medida no a escala), `DIMEDIT` / `DIMTEDIT` (mover y girar el texto de cota).
- **`DIMSTYLE`**: administrador de estilos de cota con **subestilos por familia** (lineal, angular, radial, diametral, ordenada, directriz) — esto es lo que permite que las cotas radiales lleven "R" y flecha distinta sin crear otro estilo. Control de: líneas, símbolos y flechas (tipo y tamaño de marca), texto (estilo, altura, posición, alineación ISO vs. sobre la línea), ajuste (qué se mueve cuando no cabe), unidades principales (precisión, separador decimal, supresión de ceros, **factor de escala de medida** — el truco de acotar en unidades distintas), unidades alternas, tolerancias.
- **Asociatividad** (`DIMASSOC=2`): la cota sigue a la geometría. Sin esto, acotar es dibujar números. `DIMREASSOCIATE`.
- `TOLERANCE` — marcos de control de característica GD&T. [A] para arquitectura, [I] para mecánica.

**[I] Directrices**: `MLEADER` con estilo (`MLEADERSTYLE`), contenido de texto o **de bloque** (globos de referencia numerados), múltiples segmentos, landing, `MLEADEREDIT` (añadir/quitar directrices a una nota), `MLEADERALIGN`, `MLEADERCOLLECT`. Legados `LEADER`/`QLEADER` [?] siguen existiendo, creo.

**[I] Anotación anotativa (annotative)** — probablemente el concepto más importante de esta área y el más difícil de clonar: un objeto (texto, cota, sombreado, bloque, directriz) lleva **una o varias escalas de anotación** y se dibuja al tamaño de papel correcto en cada viewport, con posición independiente por escala. Comandos y variables: `ANNOALLVISIBLE`, `OBJECTSCALE`, `ANNORESET`, `SCALELISTEDIT`, `CANNOSCALE`, `ANNOAUTOSCALE`. La alternativa manual (una capa de texto por escala) es exactamente el trabajo que un profesional ya no acepta hacer.

**[I] Símbolos y control de escala del dibujo anotado**: `LTSCALE`, `PSLTSCALE`, `MSLTSCALE`.

**[A] Campos (`FIELD`)** — se detallan en el área 6, pero son anotación: texto que se calcula solo (área de una polilínea, nombre de archivo, fecha de trazado, número de hoja, propiedad de un bloque, fórmula).

> **PRUEBA DE DESPACHO**: el mismo plano de planta visto a 1:50 y a 1:100 en dos viewports del mismo layout, con las mismas cotas y textos, legibles y del mismo tamaño en papel en ambos, sin duplicar la anotación. Si eso no sale, el área está a medias por muy larga que sea la lista de comandos de cota.

---

## 4. CAPAS Y ESTÁNDARES

**[I] `LAYER`** — el administrador completo: nombre, activa/desactivada, inutilizada/reutilizada (freeze), bloqueada (con **atenuación** de capas bloqueadas, `LAYLOCKFADECTL`), color (256 índices + True Color + libros de color), tipo de línea, **grosor de línea**, **transparencia**, estilo de trazado, imprimible/no imprimible, descripción.
- **Filtros de capa** por propiedades y por grupo, filtro invertido.
- **Estados de capa** (`LAYERSTATE`): guardar, restaurar, **exportar/importar `.las`** entre dibujos. Es como un despacho conmuta entre "plano de albañilería", "plano de acabados" y "plano de instalaciones" sobre el mismo modelo.
- `LAYERP` (deshacer el último cambio de capas).

**[I] Herramientas de capa** [?] (creo que hoy son núcleo, nacieron en Express): `LAYISO` / `LAYUNISO`, `LAYOFF`, `LAYON`, `LAYFRZ`, `LAYTHW`, `LAYLCK`, `LAYULK`, `LAYMCH` (pasar objeto a la capa de otro), `LAYCUR` (traer a la capa actual), `LAYMRG` (fundir una capa en otra y borrarla), `LAYDEL`, `LAYWALK`, `LAYVPI` (inutilizar en todos los viewports menos el actual).

**[I] Tipos de línea**: `LINETYPE`, carga desde `.lin`, escala global y por objeto. Y en particular **tipos de línea complejos** — los que llevan texto o formas embebidas (`----GAS----GAS----`, línea de predio, cerca, drenaje). Requieren archivos `.shx` de formas. Un CAD que sólo hace guiones y puntos no puede dibujar un plano de instalaciones normativo.

**[I] Grosores de línea**: `LWEIGHT`, visualización de grosor en pantalla, y la relación con las tablas de estilos de trazado.

**[I] Estilos de trazado**: `.ctb` (dependiente de color — el modelo clásico "color 1 = 0.13 mm") y `.stb` (nombrados). `STYLESMANAGER`, `CONVERTPSTYLES`, `PLOTSTYLE`. **Esto es el listón real de la calidad de entrega en México y en casi todo el mundo hispanohablante**: el despacho tiene su `.ctb` heredado y no lo va a soltar.

**[I] Plantillas `.dwt`** con capas, estilos, layouts, cajetín y configuraciones de página ya cargadas. `SAVEAS` a `.dwt`, `QNEW` con plantilla por defecto.

**[I] Higiene de archivo**: `PURGE` (con purga anidada, elementos huérfanos, geometría de longitud cero y texto vacío), `AUDIT`, `RECOVER`, administrador de recuperación de dibujos, `.bak` y autoguardado.

**[A] `ADCENTER` (DesignCenter)** — arrastrar capas, estilos de cota, estilos de texto, bloques y layouts **desde otro DWG** al actual. Es la vía práctica por la que un estándar se propaga en un despacho.

**[A] Estándares CAD formales**: `STANDARDS` (asociar archivos `.dws`), `CHECKSTANDARDS` (auditar y corregir desviaciones de capa/texto/cota/tipo de línea), `LAYTRANS` (traductor de capas: mapear las capas de un DWG recibido a las del estándar propio, con reglas guardables `.dws`), y el verificador por lotes [?] (creo que es una utilidad externa, "Batch Standards Checker"). **Esto no está en LT** [?] y es exactamente lo que compra una empresa que coordina a diez colaboradores externos.

**[A] Normas de nomenclatura**: soporte práctico para AIA, ISO 13567, BS1192/uniclass, NCS — no como feature, sino porque las plantillas y el traductor de capas lo hacen posible.

> **PRUEBA DE DESPACHO**: llega un DWG de un consultor con 180 capas con nombres del consultor. Traducirlas al estándar del despacho, verificar que no queden desviaciones, guardar un estado de capas "entrega ejecutivo" y otro "presentación cliente", y conmutar entre ambos en un clic.

---

## 5. BLOQUES Y REFERENCIAS

**[I] Bloques básicos**: `BLOCK` (con punto base, unidades, comportamiento de escala uniforme, permitir descomposición), `INSERT`, `WBLOCK` (exportar a DWG), `BEDIT` (editor de bloques), `EXPLODE`, `REFEDIT` (edición en contexto), `BASE`, redefinición de bloque (redefinir actualiza todas las instancias — comportamiento imprescindible).
- **Paleta de Bloques** (`BLOCKSPALETTE`) [?] creo que desde 2020: pestañas Actual / Recientes / Favoritos / Bibliotecas, con miniaturas y arrastrar-soltar desde una carpeta o un DWG-biblioteca.

**[I] Atributos**: `ATTDEF` (etiqueta, solicitud, valor por defecto, modos: invisible, constante, verificar, preestablecido, bloquear posición, múltiples líneas), `EATTEDIT` (editar valores de una instancia), `BATTMAN` (administrador: reordenar solicitudes, cambiar propiedades en todas las instancias), `ATTSYNC` (sincronizar instancias tras redefinir), `ATTDIA`/`ATTREQ`. Sin atributos no hay cajetín, ni marca de puerta, ni número de columna, ni globo de nivel.
- [?] `ATTIN` / `ATTOUT` (exportar todos los atributos a texto, editar en Excel, reimportar) — creo que son Express Tools; es el atajo que usa medio gremio.

**[I] Referencias externas (`XREF`)** — este es el pilar de la coordinación:
- `XATTACH` con **Attach vs. Overlay** (la diferencia importa: overlay evita referencias circulares al referenciar en cadena), ruta **relativa vs. absoluta vs. sin ruta**.
- Descargar / recargar / **enlazar (bind: Bind vs. Insert)** / desenlazar, con notificación automática cuando el xref cambia en disco.
- `XCLIP` (recortar la referencia, con inversión del recorte [?] creo que existe en versiones recientes), `XOPEN` (abrir el xref para editar), `VISRETAIN` (conservar las propiedades de capa del xref en el dibujo padre — sin esto la coordinación no funciona), `XLOADCTL` (carga por demanda), atenuación de xref (`XDWGFADECTL`).
- Paleta `EXTERNALREFERENCES` con estado, ruta, tamaño, fecha; reparación de rutas rotas en lote.
- **Referenciar no sólo DWG**: `PDFATTACH` (subyacente PDF **con referencia a objetos sobre su geometría vectorial** — un profesional espera poder "snapear" a un PDF), `IMAGEATTACH` (raster, con transparencia, brillo, contraste, recorte), `DGNATTACH`, subyacentes DWF.

**[A] Bloques dinámicos** — el diferenciador más citado de AutoCAD completo frente a todo lo demás. En `BEDIT`:
- Parámetros: punto, lineal, polar, XY, rotación, alineación, simetría (flip), **visibilidad**, **consulta (lookup)**, punto base.
- Acciones: mover, escalar, estirar, estirar polar, girar, simetría, matriz, consulta.
- **Estados de visibilidad** (una sola puerta que cambia entre abatible/corrediza/doble).
- Restricciones geométricas y dimensionales dentro del bloque + **tablas de bloque (`BTABLE`)**: un bloque de perfil IPR donde eliges "IPR 305×102" y toda la geometría se ajusta. Esto es lo que sustituye a tener 200 bloques.
- Pinzamientos personalizados, cadena de acciones, lista de valores permitidos, incrementos.
- **LT puede insertar y usar bloques dinámicos pero no crearlos** [?] — creo que sigue siendo así; si es cierto, es un argumento de venta directo.

**[A] Bloques anotativos** (el símbolo de nivel o el norte que se dibuja al mismo tamaño en papel a cualquier escala).

**[A] `COUNT`** — contar y resaltar instancias de bloque, con paleta de conteo e inserción del conteo en una tabla. [?] Creo que apareció hacia 2022 y que sí está también en LT.

**[A] Smart Blocks** (Autodesk AI, versiones 2024-2026): colocación sugerida por patrón de uso, sustitución de bloques, **Search and Convert** y **Detect and Convert** (detectar geometría repetida y convertirla en bloques). Verificado como existente en 2026. Es la clase de cosa donde un producto nuevo puede *superar* a AutoCAD, no sólo igualarlo.

**[A] Paletas de herramientas (`TOOLPALETTES`)** con bloques, sombreados y comandos preconfigurados, agrupadas y **compartidas en red** — así distribuye un despacho su biblioteca.

**[A] `SHEETSET` (Administrador de conjuntos de planos)** — ver área 7; toca aquí porque las propiedades del conjunto alimentan los cajetines por campo.

**[A] `GEOGRAPHICLOCATION`** — georreferenciar el dibujo e insertar imagen de mapa en línea como fondo [?] (la disponibilidad del servicio de mapas ha cambiado entre versiones; verificar). Muy usado para plano de localización.

> **PRUEBA DE DESPACHO**: el estructurista referencia el DWG del arquitecto como overlay con ruta relativa, apaga las capas de mobiliario **sólo en su archivo**, dibuja su estructura, y cuando el arquitecto mueve un muro y guarda, el estructurista recibe el aviso y recarga. Todo eso sin que se le desconfiguren las capas del xref al reabrir mañana.

---

## 6. TABLAS Y DATOS

Área subestimada y, sospecho, **la que más peso tiene en la percepción de "esto no es un CAD profesional"**, porque es donde vive el entregable que el cliente pide primero.

**[I] `TABLE` / `TABLESTYLE`**: estilos con celdas de título, encabezado y datos independientes; dirección de la tabla (abajo o arriba); formato por celda (tipo de dato: texto, entero, decimal, ángulo, moneda, porcentaje, fecha, punto); alineación, márgenes, bordes por lado, color de relleno; combinar celdas; ajustar anchura de columna; **romper la tabla en tramos** (`TABLEBREAK`, para que un cuadro largo se reparta en el papel).

**[I] Fórmulas en celdas**: `=SUM(A1:A10)`, `AVERAGE`, `COUNT`, referencias entre celdas, autorrelleno arrastrando. Un cuadro de superficies que no suma solo no es un cuadro de superficies.

**[I] `FIELD` (campos)** — texto vivo:
- Campo de **propiedad de objeto**: el área o el perímetro de una polilínea, la longitud de una línea, el valor de un atributo.
- Campos de documento: nombre de archivo, ruta, fecha de creación/guardado/trazado, autor, título.
- Campos de hoja/conjunto de planos: número de hoja, título, total de hojas, nombre del proyecto.
- Campos de fórmula y campos que apuntan a celdas de tabla.
- Actualización automática (`FIELDEVAL`) y `UPDATEFIELD`.
- **Combinado: una celda de tabla que contiene un campo al área de una polilínea es, literalmente, el cuadro de superficies automático.** Esto es la funcionalidad, no una lista de tres features.

**[I] Medición**: `MEASUREGEOM` (distancia, radio, ángulo, área — con suma y resta de áreas —, volumen), `AREA`, `DIST`, `ID`, `LIST`, `MASSPROP` (sobre regiones). **Quick Measure** [?] (creo que 2020, ampliado a áreas en 2021): pasar el cursor y ver medidas de todo lo circundante al vuelo.

**[A] `DATAEXTRACTION`** — el asistente de extracción de datos: recorre el dibujo actual, varios dibujos o un conjunto de planos; selecciona qué objetos y qué propiedades; filtra; agrupa y cuenta instancias; **fusiona con datos externos de Excel**; y vuelca el resultado a **una tabla dentro del dibujo (vinculada y actualizable) y/o a `.csv` / `.xls`** [?] (creo que también `.mdb`, probablemente obsoleto). Guarda la plantilla `.dxe` para repetirlo en la siguiente revisión.
  Es el motor del despiece de carpintería, el conteo de luminarias, el catálogo de conceptos, el cuadro de puertas y ventanas. **No está en LT** [?] — creo que es exclusivo de AutoCAD completo, lo cual lo vuelve un argumento de venta central.

**[A] `DATALINK` / `DATALINKUPDATE`** — vincular un rango de un `.xlsx` a una tabla del dibujo, con actualización en ambos sentidos (bajar del Excel al DWG y subir del DWG al Excel), conservando o no el formato de origen. Es como el arquitecto y el que hace el presupuesto dejan de pelearse.

**[A] `TABLEEXPORT`** a `.csv`.

**[A] Insertar bloque dentro de una celda de tabla** (tablas de simbología, leyendas con el símbolo real al lado de su descripción).

**[A] `DBCONNECT`** — enlazar objetos del dibujo con registros de una base de datos externa vía ODBC. [?] **Incierto si sigue presente en las versiones actuales**; es tecnología antigua. No lo pondría en el listón.

**[A] Hipervínculos** (`HYPERLINK`) en objetos, que sobreviven a la exportación a PDF/DWF.

> **PRUEBA DE DESPACHO — la más importante de todo el documento**: entregar un cuadro de superficies. Polilíneas cerradas por local, cada una con su área como campo dentro de una tabla, sumas por nivel, total del proyecto, tipos de dato y decimales correctos, y **que al mover un muro las cifras se actualicen solas**. Segunda prueba: el despiece de las 87 puertas del proyecto, sacado de los atributos de sus bloques, agrupado por tipo, exportado a Excel para el presupuesto. Si esas dos tareas no salen completas, no importa qué diga ninguna rúbrica: el producto no cubre la primera media hora del trabajo real de un despacho.

---

## 7. PUBLICACIÓN E INTERCAMBIO

**[I] Espacio papel y layouts**:
- Múltiples layouts por dibujo, pestañas Modelo/Layout, `LAYOUT` (nuevo, copiar, renombrar, mover, desde plantilla), `EXPORTLAYOUT` (convertir un layout en un DWG de espacio modelo, para entregar a quien no quiere layouts).
- **Configuraciones de página** (`PAGESETUP` + Administrador): impresora/plotter, tamaño de papel, área de trazado, escala, offset, tabla de estilos de trazado, orientación; **importar configuraciones de página de otro dibujo**. Con configuraciones nombradas reutilizables.
- **Ventanas gráficas (viewports)**: `MVIEW` (rectangular, poligonal, **desde objeto** — un viewport con forma de polilínea), `VPCLIP`, bloqueo de la ventana (`Lock`), escala de la ventana por lista estándar, `VPMAX`/`VPMIN` (maximizar para editar), giro de la vista (`DVIEW`/`MVSETUP` [?] o la propiedad "twist"), `SPACETRANS`.
- **Congelar capa por ventana** (VP Freeze) y, sobre todo, **anulaciones de propiedades de capa por ventana** (color, tipo de línea, grosor y transparencia distintos en cada viewport, mostrados en el administrador de capas con fondo resaltado). Es como se hace que el mismo modelo se vea distinto en el plano arquitectónico y en el de instalaciones. **Sin esto no se maquetan planos de verdad.**

**[I] Trazado**: `PLOT` con vista preliminar; `PLOTTERMANAGER` y configuraciones `.pc3`; tamaños de papel personalizados; `PLOTSTAMP`; trazado en segundo plano; `PLOTTRANSPARENCYOVERRIDE` (imprimir transparencias); `-PLOT` para scripts.

**[I] Salida a PDF de calidad de entrega**: `EXPORTPDF` / plotter DWG To PDF, con **capas del DWG conservadas como capas del PDF**, texto TrueType como texto buscable, [?] texto `.shx` exportado como comentarios buscables (creo que así funciona), hipervínculos, resolución configurable, fusión de líneas superpuestas. Un PDF que sale como imagen rasterizada es un entregable de segunda y los clientes lo notan.

**[I] `PUBLISH`** — trazado por lotes de muchos layouts/hojas a un solo PDF multipágina, a plotter o a DWF, con lista de hojas guardable (`.dsd`) y en segundo plano.

**[I] Intercambio DWG/DXF**:
- `SAVEAS` a formatos DWG antiguos (2018, 2013, 2010, 2007, 2004, 2000) — sin esto no se puede colaborar con quien no actualizó.
- `DXFOUT`/`DXFIN` (ASCII y binario, con versión y precisión).
- **Y lo que no es un comando: fidelidad real de ida y vuelta.** El listón no es "exporta DWG", es "el DWG que exportas se abre en AutoCAD sin proxies, sin capas rotas, sin cotas explotadas y sin sombreados perdidos".

**[I] `ETRANSMIT`** — empaquetar el dibujo con todos sus xrefs, imágenes, fuentes, `.ctb` y plantillas, con reporte y opción de reorganizar rutas. Es la forma estándar de mandar un proyecto.

**[A] `SHEETSET` (Sheet Set Manager)** — conjunto de planos: lista jerárquica de hojas de varios DWG, numeración automática, propiedades de conjunto/subconjunto/hoja que alimentan campos en el cajetín, **tabla de índice de hojas generada y actualizable**, vistas nombradas y etiquetas/callouts que se renumeran solos, publicación y `ARCHIVE` (empaquetado) de todo el conjunto de una vez, anulación de configuración de página al publicar. [?] Incierto si existe hoy en LT; en cualquier caso, en AutoCAD completo es el instrumento que convierte 60 planos sueltos en un proyecto.

**[A] `COMPARE` (DWG Compare)** — comparar dos DWG resaltando lo añadido/quitado/sin cambios, y [?] comparación de xrefs (creo que 2021) para ver qué cambió el consultor entre revisiones. Es de las cosas que un despacho valora desproporcionadamente.

**[A] Importación de PDF a geometría**: `PDFIMPORT` [?] (creo 2017) — convierte vectores del PDF en líneas/polilíneas/sólidos, texto TrueType en texto, patrones en sombreados; y `PDFSHXTEXT` [?] (creo 2018) que reconoce texto `.shx` rasterizado y lo vuelve texto editable. Muy usado cuando el cliente sólo tiene el PDF del levantamiento.

**[A] Otros formatos**: `DGNIMPORT`/`DGNEXPORT` (obligatorio con dependencias de gobierno que usan MicroStation), `WMFOUT`/`WMFIN`, exportación a `.bmp`/imagen, DWF/DWFx.

**[A] Colaboración moderna** (todas verificadas como existentes en 2026):
- **Trace** — capa de calca sobre el DWG para marcar sin alterar el dibujo, sincronizada entre escritorio, web y móvil.
- **Markup Import / Markup Assist** — importar un PDF o foto con correcciones a mano y que se identifiquen los cambios y se apliquen semiautomáticamente; en 2026 con soporte de *Issues* de Autodesk Docs.
- **Activity Insights** — bitácora de eventos del DWG, historial de versiones y "What's Changed" por sesión de edición entre colaboradores.
- **Share** / vistas compartidas — enviar un enlace a una copia revisable en el navegador.
- AutoCAD web y móvil sobre el mismo archivo.
- **Aquí es donde un CAD web nace con ventaja estructural**: es lo único de esta lista donde AutoCAD está incómodo y un producto nativo de navegador no.

> **PRUEBA DE DESPACHO**: entregar un juego de 24 planos. Un solo PDF, portada e índice generados del conjunto, cada hoja con su cajetín rellenado desde las propiedades del proyecto, escalas correctas por viewport, grosores de línea conforme al `.ctb` del despacho, capas conservadas dentro del PDF, y el paquete DWG con xrefs para el consultor. En una operación, no en 24.

---

## 8. PERSONALIZACIÓN Y AUTOMATIZACIÓN

Ésta es el área que separa "un usuario" de "un despacho". Y es donde AutoCAD tiene su foso más profundo: 40 años de LISP acumulado en los discos duros de la industria.

**[I] Alias de comandos** — `acad.pgp`: `L`=LINE, `C`=CIRCLE, `CO`=COPY, `M`=MOVE, `TR`=TRIM, `E`=ERASE, `Z`=ZOOM, `PL`=PLINE, `H`=HATCH, `DI`=DIST, `X`=EXPLODE... **Un dibujante teclea alias, no hace clic en iconos.** Esto no es personalización opcional: es cómo se opera el programa. Editable y `REINIT` para recargar.

**[I] Teclas de función y modificadores**: `F1` ayuda, `F2` historial, `F3` osnap, `F7` rejilla, `F8` orto, `F9` snap, `F10` polar, `F11` otrack, `F12` entrada dinámica; `Ctrl+1` propiedades, `Ctrl+2` DesignCenter, `Ctrl+3` paletas, `Ctrl+8` calculadora, `Ctrl+9` línea de comandos, `Ctrl+0` limpiar pantalla. La memoria muscular está en estas teclas.

**[I] Variables de sistema** — `SETVAR`, cientos de variables (`OSMODE`, `PICKBOX`, `CURSORSIZE`, `FILLETRAD`, `DIMSCALE`, `LTSCALE`, `PICKFIRST`, `SELECTIONPREVIEW`, `HPNAME`...), guardadas en dibujo o en perfil, y `SYSVARMONITOR` para detectar cuando algo se las cambia.

**[I] Perfiles de usuario y espacios de trabajo**: `OPTIONS` con perfiles exportables (`.arg`), `WSCURRENT` / guardar espacio de trabajo, rutas de soporte (dónde busca fuentes, bloques, plantillas, LISP).

**[A] `CUI` / `CUILOAD`** — el editor de personalización: crear comandos propios con macro, pestañas y paneles de cinta, barras de herramientas, menús, **atajos de teclado**, acciones de doble clic, botones del ratón, menús contextuales, y CUIx parcial y **empresarial** (el estándar del despacho, en red, de sólo lectura para el usuario). Con expresiones DIESEL para etiquetas y estados condicionales.

**[A] Scripts `.scr`** (`SCRIPT`, `SCRIPTCALL`) — automatización por reproducción de comandos, la forma más simple y más usada de procesar 200 archivos.

**[A] AutoLISP / Visual LISP** — el foso. `APPLOAD`, autocarga vía `acad.lsp` / `acaddoc.lsp` / conjunto de aplicaciones de inicio, acceso a la base de datos del dibujo, cuadros de diálogo DCL, ActiveX. [?] El editor VLIDE fue retirado y sustituido por una extensión de AutoLISP para VS Code (creo que en 2021). [?] Además creo que AutoCAD LT recibió soporte de AutoLISP en una versión reciente (¿2024?) — verificar, porque cambia el argumento comercial.
  **Lo que importa para el producto**: no es "tener un lenguaje de script". Es que existen decenas de miles de rutinas LISP escritas por terceros que un despacho ya usa y considera suyas. Cualquier CAD que aspire a sustituir AutoCAD choca contra eso. Hay dos estrategias posibles y hay que elegir conscientemente: **interpretar AutoLISP** (caro, defendible) o **ofrecer algo tan superior que el despacho acepte reescribir** (barato de construir, difícil de vender).

**[A] APIs de programa**: ObjectARX (C++), .NET (C#/VB), VBA (módulo de descarga aparte [?] pero creo que sigue disponible), JavaScript API [?] (existe, alcance limitado; incierto). Ecosistema de plugins del Autodesk App Store.

**[A] Grabadora de acciones** (`ACTRECORD` / `ACTSTOP` / `ACTMANAGER`) — grabar una secuencia de comandos como macro reproducible sin programar. Exclusiva de AutoCAD completo.

**[A] `accoreconsole.exe`** — el núcleo de AutoCAD sin interfaz, para ejecutar scripts sobre lotes de archivos desde la línea de comandos del sistema. Es como se hacen las conversiones masivas y las auditorías nocturnas. [?] Windows, AutoCAD completo.

**[A] Express Tools** — ~90 utilidades que vienen con AutoCAD completo (no con LT [?]) y que muchos usuarios ni saben que son "extras": `NCOPY`, `BURST`, `FLATTEN`, `TCOUNT`, `TCASE`, `TXTEXP`, `ARCTEXT`, `MOCORO`, `MSTRETCH`, `EXTRIM`, `BREAKLINE`, `ALIASEDIT`, `LAYOUTMERGE`, `ATTIN`/`ATTOUT`, `SUPERHATCH`, `COPYM`, `CHURLS`... Verificado que la referencia de Express Tools sigue existiendo en AutoCAD 2026. **Marco como incierta la pertenencia exacta** de cada comando a Express vs. núcleo, porque varios se promovieron con los años.

**[A] Contenido personalizable como archivos**: patrones de sombreado `.pat`, tipos de línea `.lin`, **formas y fuentes `.shp`/`.shx`**, plantillas `.dwt`, tablas de trazado `.ctb`/`.stb`, `.pc3`, paletas de herramientas, bibliotecas de bloques en carpetas. Un despacho tiene todo esto en un servidor y lo considera un activo. Poder **importarlo tal cual** vale más que cualquier feature nueva.

> **PRUEBA DE DESPACHO**: el despacho tiene un LISP heredado que numera ejes y otro que rotula áreas, un `acad.pgp` con 60 alias propios, un `.ctb` de 2009 y una carpeta con 3,000 bloques. ¿Cuánto de eso sigue funcionando el primer día? La respuesta a esa pregunta es el costo de cambio, y el costo de cambio es el producto.

---

## 9. El eje que la lista de ocho áreas no contiene

Añadido deliberadamente, porque el dato que ordena este trabajo —"no se parece en lo absoluto a AutoCAD"— **no es un juicio sobre ninguna de las ocho áreas anteriores**. Una rúbrica funcional puede estar en 88% y esta frase seguir siendo verdad, sin contradicción, porque miden ejes distintos. Enumero el listón perceptual con la misma seriedad, porque es el que se evalúa en dos segundos:

- Fondo oscuro del espacio modelo; cursor de **mira en cruz de pantalla completa** con cuadro de mira (pickbox) en el centro, no una flecha de ratón.
- **Línea de comandos abajo**, con historial `F2` y opciones entre corchetes.
- **Barra de estado inferior** con conmutadores: rejilla, forzcursor, orto, polar, osnap, otrack, LWT, transparencia, ciclo de selección, **escala de anotación**, espacio modelo/papel.
- **Pestañas Modelo / Layout1 / Layout2** en la parte inferior izquierda; pestañas de archivo arriba.
- **Cinta (ribbon)** con las pestañas Inicio / Insertar / Anotar / Parametrizar / Vista / Administrar / Salida / Complementos / Colaborar, más la barra de acceso rápido arriba.
- **Paleta de Propiedades acoplada a la derecha**; paletas de herramientas.
- Pinzamientos azules que se ponen rojos/calientes al activarse; previsualización de selección al pasar el cursor; ventana azul vs. captura verde.
- Tooltips de entrada dinámica junto al cursor.
- Menú contextual del botón derecho dependiente del contexto; `Enter`/`Espacio` repite el último comando.
- Rueda del ratón: zoom; botón central: encuadre; doble clic en rueda: zoom extensión.
- ViewCube y barra de navegación en la esquina.

**Ninguno de estos ítems suma un punto en una rúbrica de capacidades y todos suman en el veredicto de dos segundos.** Sospecho —y es una hipótesis a comprobar contra el repositorio, no una conclusión— que ahí está el origen de la divergencia entre "88.6%" y "no se parece en lo absoluto".

---

## 10. Resumen ejecutivo del listón

**Los ocho imprescindibles sin los cuales no hay producto** (si falta uno, el resto no importa):

1. Precisión: osnap completo + entrada de coordenadas + rastreo polar.
2. Modificación con `TRIM`/`EXTEND`/`OFFSET`/`FILLET`/`STRETCH`/`PEDIT` que funcionen sobre dibujo real y sucio.
3. Cotas asociativas con estilos y subestilos, más texto con estilos `.shx`.
4. Escala de anotación (annotative) — o el equivalente que resuelva el mismo problema.
5. Capas completas con estados, y **anulaciones de propiedades por ventana gráfica**.
6. Bloques con atributos + xrefs con rutas relativas, overlay y `VISRETAIN`.
7. Tabla + campo → cuadro de superficies que se actualiza solo.
8. Layout → PDF/juego de planos con estilos de trazado y grosores respetados.

**Los seis diferenciadores que justifican pagar AutoCAD completo** (y por tanto, los seis contra los que hay que competir de verdad, no contra LT):

1. **Bloques dinámicos** con visibilidad, tablas de bloque y restricciones.
2. **`DATAEXTRACTION`** — el motor de despieces y conteos.
3. **Conjuntos de planos (`SHEETSET`)** — el proyecto como unidad, no el archivo.
4. **Estándares CAD** (`.dws`, `CHECKSTANDARDS`, `LAYTRANS`) — la coordinación multiempresa.
5. **AutoLISP + APIs + `accoreconsole` + grabadora de acciones + Express Tools** — el foso de automatización acumulada.
6. **Colaboración moderna** (Trace, Markup Assist, Activity Insights, Share) — el único de los seis donde AutoCAD está estructuralmente incómodo y un CAD web no.

**Dónde un CAD web puede ganar en vez de empatar**: el punto 6 completo, más la instalación cero, más la colaboración simultánea real, más la conversión asistida de PDF y de geometría a bloques. Igualar los puntos 1-5 es condición de entrada; ganar en el 6 es la tesis del producto.

---

## 11. Incertidumbres declaradas (no tratar como listón sin verificar)

1. Año exacto de introducción de: osnap Centro geométrico, comando `DIM` unificado, Quick Measure, paleta de Bloques, `COUNT`, DWG Compare, comparación de xrefs, `PDFIMPORT`, `PDFSHXTEXT`.
2. Qué comandos son **núcleo vs. Express Tools** hoy: `OVERKILL`, `CHSPACE`, la familia `LAY*`, `NCOPY`, `BURST`, `FLATTEN`, `SUPERHATCH`, `ARCTEXT`, `ATTIN`/`ATTOUT`.
3. Qué hay y qué no hay **en LT** actualmente: Sheet Set Manager, estándares CAD, AutoLISP (creo que se añadió hacia 2024), `DATAEXTRACTION`, autoría de bloques dinámicos. Confirmado por Autodesk que LT sí tiene `COUNT` y que no tiene AutoLISP/VBA/API — pero la fuente consultada es material comercial, no la referencia técnica.
4. Si `DBCONNECT` (enlace ODBC) sigue presente en versiones actuales.
5. Estado actual del servicio de imágenes de mapa en `GEOGRAPHICLOCATION`.
6. Formatos de salida exactos de `DATAEXTRACTION` en la versión actual (`.mdb` probablemente retirado).
7. Alcance real de la JavaScript API.
8. Si la búsqueda en la línea de comandos indexa contenido (capas, bloques, sombreados) además de comandos.

No pude verificar contra la ayuda oficial de Autodesk: `help.autodesk.com` y `cadforum.cz` están bloqueados por el proxy de red de este entorno. Todo lo anterior no marcado con [?] proviene de conocimiento propio con alta confianza; lo verificado por búsqueda se limita a lo que aparece en las fuentes de abajo.

**Fuentes consultadas:**
- [AutoCAD LT Features | 2026 New Features | Autodesk](https://www.autodesk.com/products/autocad-lt/features)
- [AutoCAD Features | 2026 New Features | Autodesk](https://www.autodesk.com/eu/products/autocad/features)
- [Introducing AutoCAD 2026 | AutoCAD Blog | Autodesk](https://www.autodesk.com/blogs/autocad/autocad-2026/)
- [AutoCAD 2026 Help | Express Tools Reference](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-CC626232-DC3A-45E1-B3C8-DF3F79186DE2.htm) (existencia confirmada por buscador; contenido no accesible desde este entorno)
- [AutoCAD vs AutoCAD LT: 20 Differences & Best Choice 2026 | cad4cad](https://cad4cad.com/guides/autodesk-guides/autocad-guide/autocad-vs-autocad-lt/)
- [What's New in AutoCAD 2026 | Symetri](https://www.symetri.co.uk/insights/blog/what-s-new-in-autocad-2026-a-guide-to-the-latest-features/)

═══════════════

# EL LISTÓN: AutoCAD base (full), 3D

Definido sin mirar el repositorio. Todo lo que sigue describe **AutoCAD full de escritorio (Windows)**, no LT, no los toolsets, no la app web. Marco explícitamente lo incierto y añado, en cada dimensión, una **prueba de suficiencia**: el test concreto que separa "EXISTE A MEDIAS" de "EXISTE Y SIRVE".

---

## 0. Encuadre: qué es y qué no es este listón

Tres delimitaciones que cambian el plan si se ignoran:

1. **AutoCAD LT no tiene 3D.** No modela, no orbita, no renderiza; abre y ve DWG con sólidos. Si el objetivo fuera empatar con LT, el capítulo 3D sería casi vacío. El dueño pide el listón de AutoCAD full, que es otra cosa.
2. **Los toolsets suben el listón por encima de esto.** El toolset Architecture aporta muros/puertas/ventanas como objetos AEC paramétricos con representación por escala y planos generados del modelo; Plant 3D aporta tubería con especificaciones e isométricos; MEP, ductos y charolas. Nada de eso está en AutoCAD base. **AutoCAD base modela un edificio como geometría, no como edificio**: un muro es un sólido, no un objeto que sabe que es muro. Esto es central: define el techo real del listón "base 3D" y también dónde un competidor puede saltar por encima barato.
3. **AutoCAD web no hace 3D.** Fuentes de Autodesk y de terceros coinciden en que la app web es 2D: muestra contenido 3D de un DWG pero no lo crea ni lo edita (EXTRUDE, 3DORBIT no implementados). **Consecuencia estratégica: en 3D web, el competidor real de Valle no es AutoCAD web — es AutoCAD escritorio o SketchUp/Onshape en navegador.** Es la única dimensión del producto donde Autodesk no ocupa el terreno.

---

## 1. Modelado de sólidos

**Lo que hay (seguro):** primitivas `BOX`, `WEDGE`, `CONE`, `SPHERE`, `CYLINDER`, `TORUS`, `PYRAMID`, y `POLYSOLID` (perfil tipo muro con ancho y altura, desde línea/polilínea/arco o dibujado al vuelo). Generación desde perfiles 2D: `EXTRUDE` (con altura, dirección, trayectoria, ángulo de conicidad), `REVOLVE`, `SWEEP` (con alineación, torsión y escala a lo largo de trayectoria), `LOFT` (secciones + guías o trayectoria, con control de tangencias). `PRESSPULL` sobre áreas cerradas y caras. Kernel ACIS: B-Rep exacto, con caras analíticas y NURBS, no malla.

**Imprescindible para un edificio:** `EXTRUDE`, `PRESSPULL`, `POLYSOLID`, primitivas de caja y cilindro. Con eso y booleanas se levanta un edificio entero.
**Avanzado:** `SWEEP` y `LOFT` con guías (cubiertas regladas, rampas helicoidales, cornisas), conicidad en extrusión.

**Prueba de suficiencia:** extruir una polilínea de planta de 300 vértices con un hueco interior y obtener **un** sólido válido (no 300 caras sueltas), y que `PRESSPULL` sobre una cara interior reconozca el contorno cerrado automáticamente sin que el usuario lo redibuje.

---

## 2. Superficies

**Lo que hay (seguro):** superficies procedimentales y NURBS. `PLANESURF`, `SURFNETWORK` (superficie desde red de curvas), `SURFPATCH` (tapar un contorno), `SURFBLEND` (transición entre dos bordes), `SURFOFFSET`, `SURFFILLET`, `SURFEXTEND`, `SURFTRIM`/`SURFUNTRIM`, `SURFSCULPT` (cerrar un conjunto de superficies y convertirlo en sólido). `CONVTOSURFACE` y `CONVTONURBS`. Edición NURBS por vértices de control: `CVSHOW`/`CVHIDE`, `CVADD`, `CVREMOVE`, `CVREBUILD`. **Asociatividad**: una superficie procedimental recuerda sus curvas generatrices y se actualiza al editarlas (controlado por una variable de sistema; *incierto el nombre exacto — creo `SURFACEASSOCIATIVITY` y `SURFACEMODELINGMODE` para procedimental vs NURBS*).

**Imprescindible para un edificio:** casi nada. Un edificio ortogonal se hace sin tocar superficies. Lo que sí se usa: `SURFTRIM` y `SURFPATCH` para resolver un encuentro de cubierta que las booleanas no cierran.
**Avanzado (todo lo demás):** NURBS con CVs es territorio de fachada libre, y ahí el profesional serio se va a Rhino, no a AutoCAD. Ojo a no sobreinvertir aquí: es la parte del 3D de AutoCAD que **menos** se usa en arquitectura corriente.

**Prueba de suficiencia:** que una superficie sirva para *recortar* un sólido y luego se pueda *engrosar* (`THICKEN`) a losa, es decir, que superficie y sólido convivan en un mismo flujo. Superficies que no pueden interoperar con sólidos son decorativas.

---

## 3. Mallas

**Lo que hay (seguro):** objetos malla con subdivisión y suavizado tipo SubD: `MESH` (primitivas con número de divisiones), `MESHSMOOTH`, `MESHSMOOTHMORE`/`MESHSMOOTHLESS` (niveles de suavizado), `MESHREFINE`, `MESHCREASE`/`MESHUNCREASE` (pliegues), `MESHSPLIT`. Conversión `CONVTOMESH` / `CONVTOSOLID`. Y la familia heredada de mallas poligonales: `3DFACE`, `PFACE`, `3DMESH`, `RULESURF`, `TABSURF`, `REVSURF`, `EDGESURF` con `SURFTAB1`/`SURFTAB2`. *Incierto:* existen operaciones de cara adicionales (collapse, cap, spin, merge) cuyos nombres exactos no confirmo.

**Imprescindible:** nada, salvo **poder importar y convivir con mallas ajenas** (un STL, un OBJ, un modelo descargado). La malla se sufre, no se busca.
**Avanzado:** todo el pipeline de suavizado/pliegue.

**Prueba de suficiencia:** que una malla importada se pueda **seccionar y ver seccionada** junto a los sólidos, y que `CONVTOSOLID` funcione sobre una malla cerrada. Un CAD que solo *muestra* mallas importadas está en "EXISTE A MEDIAS".

---

## 4. Operaciones booleanas

**Lo que hay (seguro):** `UNION`, `SUBTRACT`, `INTERSECT` sobre sólidos, superficies y regiones 2D. `INTERFERE` (comprobación de interferencias entre conjuntos, con sólido de interferencia y navegación por las colisiones). `SLICE` (cortar por plano, superficie, 3 puntos, objeto; conservar una o ambas mitades). `SECTION` heredado (produce una región).

**Imprescindible:** las tres booleanas y `SLICE`. **`SUBTRACT` es literalmente cómo se hace un vano de ventana.** Sin booleanas robustas no hay modelado de edificio, punto.
**Avanzado:** `INTERFERE` (coordinación estructura/instalaciones).

**Prueba de suficiencia — la más dura de todo el listón:** restar 40 cajas a un sólido de muro de 200 m de largo y que (a) no falle, (b) no tarde minutos, (c) el resultado siga siendo un sólido válido editable, y (d) coplanaridades exactas (cara contra cara) no generen caras degeneradas ni sólidos vacíos. Las booleanas coplanares son donde mueren los kernels débiles, y es exactamente el caso de un muro apoyado en una losa.

---

## 5. Edición de sólidos y de caras

**Lo que hay (seguro):** `SOLIDEDIT` con tres ramas — **cara** (extruir, desplazar, girar, desfasar, inclinar, borrar, copiar, colorear), **arista** (copiar, colorear) y **cuerpo** (imprimir/`IMPRINT`, separar, vaciar/`SHELL`, limpiar, comprobar). `FILLETEDGE` y `CHAMFEREDGE` (redondeo/chaflán por arista, con cadena y radio variable *— la variabilidad por arista es probable pero no la afirmo con certeza*). `XEDGES` (extraer aristas como wireframe), `THICKEN`. Selección de **subobjetos** con Ctrl+clic (cara, arista, vértice) y edición por pinzamientos. Gizmos `3DMOVE`, `3DROTATE`, `3DSCALE`. `3DALIGN`, `MIRROR3D`, matriz 3D (`ARRAY` con niveles). **Historial de sólidos** (`SOLIDHIST`, `SHOWHIST`): un sólido compuesto puede conservar sus primitivas originales y permitir reeditar el operando — historial limitado, no árbol paramétrico. `MASSPROP` (volumen, centroide, momentos de inercia).

**Imprescindible:** selección de subobjetos + desplazar/desfasar cara + pinzamientos. Es el 80% de la edición real: "sube esta losa 15 cm", "engorda este muro".
**Avanzado:** `SHELL`, redondeos encadenados, historial, `MASSPROP`.

**Prueba de suficiencia:** seleccionar una cara de un sólido que ya pasó por dos booleanas y moverla, con las caras adyacentes recalculándose. Si al mover una cara el sólido se rompe o hay que rehacer la booleana, es "EXISTE A MEDIAS".

---

## 6. Secciones y vistas derivadas

**Lo que hay (seguro):** `SECTIONPLANE` con **sección viva** (`LIVESECTION`): el plano corta la vista en pantalla en tiempo real, con estados plano / rebanada / contorno / volumen, `SECTIONPLANEJOG` para quiebres, ajustes de relleno y de aristas de corte, y `SECTIONPLANETOBLOCK` para congelar la sección como bloque 2D o 3D. Vistas guardadas (`VIEW`) que memorizan cámara, estilo visual y fondo. Ventanas múltiples en espacio modelo (`VPORTS`).

**Imprescindible en arquitectura:** el plano de sección vivo. Es la herramienta con la que un arquitecto *entiende* su propio modelo, y en la que descubre que el falso techo choca con el dintel.
**Avanzado:** quiebres, volúmenes de sección, relleno de corte configurable.

**Prueba de suficiencia:** mover el plano de sección con el ratón y ver el corte actualizarse continuamente, con **relleno sólido en las caras cortadas** (no solo aristas). Un corte que muestra el interior hueco no comunica una sección de arquitectura.

---

## 7. Coordenadas y planos de trabajo

**Lo que hay (seguro):** WCS + UCS. `UCS` con opciones 3 puntos, objeto, cara, vista, X/Y/Z, origen, previo; `UCSMAN` (UCS con nombre, UCS por ventana con `UCSVP`), `UCSICON`, **UCS dinámico** (`DUCS`: al pasar sobre una cara de un sólido, el plano de trabajo se alinea solo con esa cara mientras dibujas). `PLAN`. `ELEV` y grosor (thickness). Entrada de coordenadas absolutas/relativas, cilíndricas y esféricas. **Referencias a objetos 3D** (`3DOSNAP`: vértice, punto medio de arista, centro de cara, nudo, perpendicular a cara, cercano a cara), `OSNAPZ`, filtros de punto `.x .y .z`, rastreo polar y por referencia proyectados sobre el plano actual.

**Imprescindible: todo esto.** Es el cimiento. Sin un plano de trabajo controlable y snaps que enganchen a geometría 3D, cada operación posterior produce basura desalineada, y el usuario lo nota en el segundo minuto. **Si sólo se puede invertir en una dimensión de este listón, es ésta.**
**Avanzado:** UCS por ventana, coordenadas esféricas.

**Prueba de suficiencia:** dibujar un rectángulo directamente sobre la cara inclinada de una cubierta, sin definir nada a mano, y que quede exactamente sobre esa cara. Eso es UCS dinámico + 3D osnap funcionando juntos. Es la prueba que separa un CAD 3D de un visor 3D con extrusiones.

---

## 8. Visualización y render

**Lo que hay (seguro):** órbita (`3DORBIT`, libre, restringida, continua), **ViewCube**, SteeringWheels, `3DWALK`/`3DFLY`, `CAMERA`, proyección paralela y perspectiva, planos de recorte delantero/trasero. **Estilos visuales** (`VISUALSTYLES`): estructura alámbrica 2D y 3D, oculto, realista, conceptual, sombreado, sombreado con aristas, escala de grises, boceto, rayos X — con propiedades editables: estilo de cara, calidad de iluminación, sombras, opacidad, y **modificadores de arista** (siluetas, aristas de intersección, saliente y jitter tipo dibujo a mano). Iluminación: `POINTLIGHT`, `SPOTLIGHT`, `DISTANTLIGHT`, `WEBLIGHT` (fotométrica IES), `LIGHTLIST`, unidades fotométricas, y **sol + cielo** con ubicación geográfica, fecha y hora (`SUNPROPERTIES`, `GEOGRAPHICLOCATION`) — es decir, **estudio de sombras real**. Materiales: navegador y editor de materiales de la biblioteca Autodesk, asignación por capa u objeto, mapeo `MATERIALMAP` (plano, caja, cilíndrico, esférico). Render con el motor **ART / Autodesk Raytracer** (path tracer físicamente basado): `RENDER`, presets de calidad/tiempo, render en ventana, `RENDERCROP`, exposición y niebla/entorno.

**Imprescindible:** órbita fluida, ViewCube, estilos oculto y conceptual, y **sombras solares por fecha/hora**. El estudio de asoleamiento no es render: es un requisito normativo y de diseño en arquitectura, y lo pondría casi en el mismo escalón que las booleanas.
**Avanzado:** render fotorrealista, materiales con mapeo, luces fotométricas IES, recorridos. Nadie elige un CAD por su render — para eso ya usan otra cosa. Invertir en render aquí es de las peores relaciones esfuerzo/valor del listón.

**Prueba de suficiencia:** orbitar un modelo de un edificio completo a 30+ fps con estilo conceptual y sombras activas. La fluidez **es** la funcionalidad: un orbitador a 8 fps convierte todo lo demás en inusable.

---

## 9. De 3D a documentación 2D

Aquí se decide si el 3D es una herramienta de trabajo o una maqueta bonita.

**Lo que hay (seguro):** **Model Documentation**: `VIEWBASE` (vista base desde el modelo o desde un modelo de Inventor, colocada en una presentación/layout), `VIEWPROJ` (vistas proyectadas), `VIEWSECTION` (secciones completa, media, desfasada, alineada, o desde objeto), `VIEWDETAIL`, `VIEWEDIT`, `VIEWUPDATE`, `VIEWSTD` (normas de dibujo). **Estas vistas son asociativas: cambia el modelo, se actualizan.** Además `FLATSHOT` (bloque 2D de la vista actual, con aristas ocultas separadas), la familia heredada `SOLVIEW`/`SOLDRAW`/`SOLPROF`, y el control por ventana del **shade plot** (como se muestra / alámbrico / oculto / renderizado) para trazar plantas y alzados desde el modelo. Sobre eso, todo el aparato 2D de AutoCAD: layouts, escala anotativa, acotación, referencias externas, conjuntos de planos, publicación a PDF/DWF.

**Imprescindible: sí, entero, y es lo que más se subestima.** Un arquitecto o ingeniero no entrega un modelo: entrega planos, con carátula, escala, cotas y normas. Un 3D del que no sale un plano acotado no es un CAD de arquitectura — es un visualizador.
**Avanzado:** vistas de detalle, normas de dibujo configurables, cortes alineados.

**Prueba de suficiencia:** modificar el modelo y que la sección en la presentación se actualice al regenerar, **conservando las cotas que el usuario ya había puesto encima**. Si la actualización borra la anotación, el flujo no se usa en producción. Ése es el listón real.

---

## RESUMEN: el mínimo para "modela un edificio de verdad"

En orden estricto de dependencia — cada peldaño es inútil sin el anterior:

| # | Capacidad | Por qué (en términos de usuario, no de feature) |
|---|---|---|
| 1 | UCS + UCS dinámico + 3D osnap + entrada precisa | Sin esto todo lo demás produce geometría desalineada |
| 2 | Órbita/ViewCube/vistas guardadas fluidas | Si no puede mirar el modelo, no puede modelarlo |
| 3 | EXTRUDE / PRESSPULL / POLYSOLID | Levantar muros y losas desde la planta que ya dibujó |
| 4 | UNION / SUBTRACT / INTERSECT robustas y coplanares | Vanos de puertas y ventanas. No hay alternativa |
| 5 | Selección de subobjetos y edición de caras | Corregir sin rehacer. Determina si aguanta la 3ª revisión del cliente |
| 6 | Mover/copiar/matriz/alinear/espejo en 3D | Repetir niveles, ejes, ventanas |
| 7 | Capas, bloques 3D y xrefs con 3D | Un edificio no cabe en un archivo ni lo hace una persona |
| 8 | SECTIONPLANE con sección viva y relleno | Entender y comunicar el propio modelo |
| 9 | Sol/sombras por ubicación, fecha y hora | Asoleamiento: requisito de proyecto, no adorno |
| 10 | Planos derivados asociativos + layouts + cotas + PDF | El entregable. Sin esto, el 3D no es facturable |

**Avanzado (valioso, no bloqueante):** superficies NURBS, mallas/SubD, render fotorrealista con materiales, luces fotométricas, `MASSPROP` e `INTERFERE`, nubes de puntos RCS/RCP, modelos de coordinación NWD/NWC, importación MCAD (STEP, IGES, SAT, Rhino 3DM, Inventor, SolidWorks, CATIA, JT, NX, Parasolid — confirmado por documentación de Autodesk), exportación STL, recorridos animados.

## Lo que AutoCAD base 3D **NO** hace (para no inflar el listón)

Importa tanto como lo anterior, porque marca dónde el listón es **bajo** y un competidor puede pasarlo por encima:

- **No es paramétrico con árbol de operaciones.** El historial de sólidos es limitado; no hay features reeditables tipo Inventor/Fusion, ni restricciones geométricas en 3D (las restricciones paramétricas de AutoCAD son **2D**).
- **No hay objetos de edificio.** Un muro no sabe su composición ni se une con otro muro. No hay tablas de cantidades automáticas desde el 3D, ni cuadro de superficies derivado del modelo.
- **No hay IFC nativo** en AutoCAD base (*probable, no verificado en esta sesión*; el toolset Architecture es el que trae intercambio AEC).
- **No hay ensamblajes ni relaciones entre componentes.**
- **Modelado orgánico pobre** comparado con cualquier modelador de mallas.
- **No hay 3D en la app web.** Ver punto 0.

---

## En qué se diferencia del 3D de SketchUp — son DOS listones distintos

| Eje | AutoCAD full 3D | SketchUp (Pro) |
|---|---|---|
| Geometría | B-Rep exacto (ACIS): círculos y superficies analíticas y NURBS verdaderas | Mallas poligonales: todo curvo es facetado, un "círculo" es un polígono de N lados |
| "Sólido" | Sólido real del kernel | Grupo/componente **estanco**; las Solid Tools son de SketchUp Pro y operan sobre mallas cerradas |
| Booleanas | Robustas, resultado editable por caras | Funcionan, pero son frágiles ante caras coplanares y geometría "sucia" |
| Redondeo de aristas | Nativo (`FILLETEDGE`/`CHAMFEREDGE`) | No nativo; se resuelve con extensiones |
| Entrada | Comandos + coordenadas + UCS + osnaps 3D | **Motor de inferencia** + push/pull directo: mucho más rápido para masar |
| Reutilización | Bloques y xrefs | **Componentes con instancias**: editas uno, cambian todos. Aquí SketchUp es claramente mejor |
| Documentación 2D | En el mismo archivo: layouts, vistas asociativas, escala anotativa, normas | **LayOut**, aplicación aparte (solo Pro), basada en escenas; secciones con relleno |
| Ecosistema | Interoperabilidad MCAD, nubes de puntos, DWG nativo | 3D Warehouse + Extension Warehouse (API Ruby): ecosistema mucho mayor |
| Curva de aprendizaje | Alta | Muy baja — su principal ventaja competitiva |
| Entregable típico | DWG + juego de planos que toda la industria consume | Modelo/escenas/imágenes; DWG mediante exportación |

**Lo que esto significa para la estrategia:** SketchUp gana en **velocidad de idea** (masar en 20 minutos), AutoCAD gana en **precisión, robustez y entregable**. Son dos listones que se superan con inversiones distintas y que en parte se contradicen: la inferencia estilo SketchUp y la disciplina de UCS/comando de AutoCAD son filosofías de entrada opuestas. **Un producto que intente ser los dos sin decidir, se percibe como ninguno de los dos.** Si hay que elegir uno como identidad visible, el que el dueño nombra —"no se parece en lo absoluto a AutoCAD"— es AutoCAD.

---

## Nota sobre la divergencia rúbrica-vs-percepción (hipótesis, sin haber mirado el repo)

Repasando este listón, la mayoría de sus puntos **no son visibles en una captura de pantalla**. Lo que hace que un 3D "se parezca a AutoCAD" a simple vista es un conjunto pequeño y muy concreto: el ViewCube en la esquina superior derecha, el icono de UCS con X/Y/Z en el origen, la retícula con líneas mayores/menores que se desvanece hacia el horizonte, el fondo oscuro del espacio modelo, la mira de cruz con eje Z, la entrada dinámica junto al cursor, la línea de comandos con `Precise el primer punto o [...]:`, el gizmo de ejes de colores al seleccionar, los pinzamientos azules, la cinta del espacio de trabajo "Modelado 3D", las pestañas de presentación abajo y la barra de estado con los conmutadores OSNAP/DUCS/3DOSNAP. **Ninguno de esos trece elementos es una fila típica de una rúbrica de capacidades 3D.** Un producto puede puntuar 88,6% en capacidades y no compartir uno solo de ellos. Ofrezco esto como la hipótesis a verificar primero cuando se abra el repositorio, no como conclusión.

---

## Explícitamente INCIERTO (no lo afirmo)

- Nombres exactos de variables de asociatividad/modo de superficie (`SURFACEASSOCIATIVITY`, `SURFACEMODELINGMODE`).
- Nombres exactos de algunas operaciones de cara de malla (collapse, cap, spin, merge).
- Si `FILLETEDGE` admite radio variable por arista.
- Si `FBXIMPORT`/`FBXEXPORT` siguen presentes en 2025/2026: hay documentación que dice que se ejecutan escribiéndolos en la línea de comandos y reportes de usuarios de 2025 diciendo que no existen en 2026. **Genuinamente contradictorio.**
- Si AutoCAD publica **PDF 3D** de forma nativa (creo que no).
- Si el render en la nube sigue disponible (creo que se retiró y el render es local con ART).
- Si `ANIPATH` (animación por trayectoria) sigue en versiones actuales.
- Importación nativa de OBJ y de SKP (creo que requieren complemento).
- Ausencia de IFC nativo en AutoCAD base: probable, no verificado aquí.
- Qué funciones 3D faltan en AutoCAD para Mac (históricamente bastantes; la importación de Inventor sí está documentada como no disponible en Mac).

**Fuentes:** [Comandos de construcción de sólidos y superficies 3D (AutoCAD 2025 Help)](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-5E370560-999B-4D26-B6C7-A0E1BDC5D5F7) · [Comandos para trabajar con modelos 3D (2025)](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-6548456A-28BD-40CB-89BA-F19F5800C0ED) · [VIEWBASE (AutoCAD 2026 Help)](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-E0F79E2F-8838-4470-B8D0-8626343A22D2.htm) · [2D views from 3D models with VIEWBASE (AutoCAD Blog)](https://www.autodesk.com/blogs/autocad/2d-views-from-your-3d-models-with-viewbase-tuesday-tips-with-frank/) · [Formatos que AutoCAD puede importar](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/What-file-formats-can-AutoCAD-import.html) · [About Rendering (AutoCAD 2025 Help)](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-94CF8D57-8844-495B-AD85-003D1C32B406) · [ART Renderer (Autodesk Rendering Help)](https://help.autodesk.com/view/ARENDERING/ENU/?guid=GUID-B9CFFD61-D57E-4B30-8A18-EC56F15C2FC0) · [About Working With Point Clouds (2025)](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-C0C610D0-9784-4E87-A857-F17F1F7FEEBE) · [FBXIMPORT/FBXEXPORT en AutoCAD (soporte Autodesk)](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/fbximport-and-fbxexport-removed-from-autocad.html) · [AutoCAD Web App: features and limits](https://www.s15studio.com/post/autocad-web-app-explained)

═══════════════

## Por qué la rúbrica dice 88,6 % y el dueño dice "no se parece en lo absoluto"

Las dos cosas son ciertas porque **miden denominadores distintos**, y el más importante de los tres motivos es exactamente el tema de este encargo.

**1. Los siete toolsets no están en el denominador.** `docs/competitive/rubric.json` tiene 26 filas y ninguna es arquitectura, mecánica, eléctrico, MEP, planta, mapas ni raster como disciplina. La única adyacente es `geo` con **3 puntos de 216 (1,4 %)**, y esos 3 puntos mezclan nubes de puntos + raster georreferenciado + GIS. Consecuencia dura: **si los siete toolsets se entregaran mañana, la rúbrica no se movería ni un punto.** Un instrumento que no puede detectar lo que el dueño vio no puede contradecirlo. Peor, la línea que imprime `scripts/cad/rubric.mjs` dice *"ALCANCE DESTINO 187/216 — AutoCAD completo"*, y eso es falso como está escrito: 216 puntos son AutoCAD LT más DWG, B-rep, WASM, API y plugins. El propio `docs/competitive/autocad-2027-gap-matrix.md` lo confiesa en la tabla de reparto — *"GIS (3) es otro producto"* —; la decisión de excluir las verticales fue consciente, y luego el rótulo del total se quedó diciendo "completo". Ahí es donde la etiqueta se separó del contenido.

**2. "Se parece" es una pregunta visual y la rúbrica no tiene ninguna fila visual.** Y hay un dato de fecha que hay que verificar antes que nada: `docs/cad/evidence/ui-command-reach.json` registra el estado **"antes"** de la cinta con `"fecha": "2026-08-31"` — una paleta vertical de 17 botones **en inglés**, escrita a mano, con 8,3 % de alcance del registro, y dos de esos 17 botones ("Corridor", "Area") eran vocabulario del planificador industrial del que nació el producto. Hoy es 2026-09-01. **La cinta tiene un día.** Antes de gastar un mes en nada, confirma de qué fecha son las capturas que miró el dueño: es muy probable que juzgara la paleta de 17 botones, no la cinta. Aun con la cinta nueva, `apps/web/src/lib/cad/ribbon.ts:52` define **6 pestañas** (Inicio, Insertar, Anotar, Vista, Salida, Administrar) contra las ~10 de AutoCAD más las que cada toolset añade con su propio espacio de trabajo.

**3. Es autoevaluación, y ella misma lo dice.** 182 de 187 puntos con evidencia propia, 5 con evidencia independiente, 18 filas retienen 1 punto por eso, y 0 de 26 filas están en su tope. Según `docs/parity/ESCALERA.md` la inmensa mayoría del producto vive en el peldaño 3 de 7 ("probado con datos propios"). Y `docs/cad/evidence/command-integrity.json`: de 204 comandos, **83 son `honesto-limitado`** — el 41 % del registro son órdenes que admiten no hacer el trabajo completo. El usuario encuentra ese límite; la rúbrica no lo puntúa.

---

## EL LISTÓN: los siete toolsets

Los siete nombres son los reales y tengo **alta confianza** en ellos: Architecture, Mechanical, Electrical, MEP, Plant 3D, Map 3D y Raster Design. Marco `[?]` lo que no puedo afirmar con seguridad.

### 1 · AutoCAD Architecture
**Problema:** que la planta no sea líneas, sino un modelo del que salgan las cantidades y los cortes sin volver a dibujarlos. **Quién:** despachos de arquitectura, proyecto ejecutivo.
1. **Objetos AEC paramétricos:** muros que se limpian solos en las uniones, y puertas/ventanas *ancladas* que abren el hueco y viajan con el muro cuando se mueve.
2. **Property sets + tablas de carpintería y cuadro de áreas** leídos del objeto, no tecleados: cambia el muro, cambia la tabla.
3. **Cortes y alzados generados del modelo** y que se actualizan.
   *(El mecanismo que sostiene los tres es el Display System: un mismo objeto se dibuja distinto en planta, en plafón y en 3D. Es lo que hay que copiar antes que la lista de objetos.)*

**Valle hoy — EXISTE A MEDIAS, y es lo más avanzado que hay.** Real y comprobado: `WALL` con receta persistida (`engine/commands/draw-wall.ts:164`), uniones (`wall-joins.ts`), huecos alojados en el muro (`wall-openings.ts`), cuadro de áreas por recorrido del grafo de ejes con **área a ejes y área útil separadas y los locales rotos nombrados** (`bim-schedule.ts`), y `DATAEXTRACTION` inserta la tabla de muros como entidad en el dibujo (`data-extraction-commands.ts:106-107`). Falta lo que define al toolset: puerta/ventana como objeto con estilo (hoy `symbols-architecture.ts` es una **envolvente rectangular**, no geometría), property sets, display system y cortes/alzados. No verifiqué si la tabla insertada es asociativa; sospecho que es una foto.

### 2 · AutoCAD Electrical
**Problema:** el esquema de control y su tablero, con la numeración y los reportes hechos por la máquina. **Quién:** ingeniería de automatización, fabricantes de máquina, armadores de tablero.
1. **Biblioteca de símbolos normados** (JIC/IEC/NFPA/GB/JIS) con datos de catálogo detrás.
2. **Numeración de hilos y tagging automáticos, con referencias cruzadas** bobina↔contacto y esquema↔tablero.
3. **Reportes generados: lista de materiales, from/to de cableado, plan de bornes, E/S de PLC**, más verificación de errores eléctricos.

⚠️ **No lo confundas con la instalación eléctrica de un edificio: eso es MEP.** Este toolset atiende a otro comprador.

**Valle hoy — NO EXISTE.** Cero símbolos de categoría eléctrica (el catálogo es `equipment` 90, `furniture` 32, `architecture` 30, `commerce` 7, `safety` 6, `office` 5, `storage` 1). Aviso de rigor: hay cadenas `"MEP"`, `"ARQ"`, `"ESTRUCTURA"` en el árbol, pero al abrirlas son **fixtures dentro de `.spec.ts`**, no comandos. Es justo la trampa "aparece en el grep ≠ existe la capacidad".

### 3 · AutoCAD Mechanical
**Problema:** el plano de taller normado y su lista de piezas. **Quién:** diseño mecánico, maquila, fabricación.
1. **Biblioteca de piezas normalizadas** (tornillería, rodamientos, ejes) por ANSI/ISO/DIN/JIS/GB.
2. **Lista de materiales asociativa con globos** ligados a la referencia de pieza.
3. **Acotado mecánico con ajustes y tolerancias** (*power dimensioning*, listas de ajustes, tablas de barrenos).
   *(Cuarta digna de mención: supresión automática de línea oculta cuando una pieza tapa a otra. [?] no me consta la implementación exacta.)*

**Valle hoy — NO EXISTE como toolset.** Hay `TOLERANCE`, `MASSPROP`, `SECTION` y una plantilla `pieza-mecanica` en `templates-disciplines.ts`. Nada de biblioteca normalizada, LDM ni globos.

### 4 · AutoCAD MEP
**Problema:** rutear instalaciones que se conectan de verdad y no chocan. **Quién:** ingeniería de instalaciones (hidráulica, sanitaria, aire, eléctrica de edificio).
1. **Ductos, tubería, charola y conduit con conectores:** al rutear, el codo y la tee salen solos del catálogo.
2. **Definiciones de sistema y dimensionamiento** por caudal/pérdida. [?] no afirmo los métodos de cálculo exactos.
3. **Detección de interferencias** entre sistemas y contra la arquitectura, más tablas/etiquetas.
   *(Está construido sobre el mismo motor de objetos AEC que Architecture — por eso su costo marginal es bajo si Architecture se hace bien.)*

**Valle hoy — NO EXISTE.**

### 5 · AutoCAD Map 3D
**Problema:** dibujar sobre datos geográficos ajenos sin dejar de ser CAD. **Quién:** topografía, urbanismo, infraestructura, catastro, redes municipales.
1. **Conexión directa a fuentes GIS vía FDO** (SHP, SDF, PostGIS, Oracle Spatial, WMS/WFS, raster).
2. **Sistemas de coordenadas y reproyección** al vuelo.
3. **Limpieza y topología del dibujo** (deshacer cruces cortos/largos, duplicados; buffers, superposición, ruta) y **estilización/consulta por atributo**, con modelos de industria (agua, drenaje, eléctrico, gas). [?] moderada confianza en el alcance de los modelos de industria.

**Valle hoy — EXISTE A MEDIAS y muy delgado.** `lib/geo` está enchufado de verdad (regla 6 de la rúbrica: `document-import.ts` y `geo-cad-document.ts` lo importan), hay CRS con spec e índice de nube de puntos a 4 M de puntos. Pero `geo-cad-document.ts` declara explícitamente que **no reproyecta** al importar. El caso real que sí resuelve —meter el polígono del predio a escala para acotar el retranqueo contra el lindero— vale mucho para un arquitecto y es una rebanada estrecha de Map 3D.

### 6 · AutoCAD Raster Design
**Problema:** que un plano escaneado o un PDF entren al dibujo y se puedan usar. **Quién:** todo el que hereda obra existente.
1. **Vectorización raster→vector**, automática y semiautomática.
2. **Limpieza y ajuste del escaneo:** despeckle, deskew, recorte, máscara y *rubber sheeting* a puntos de control.
3. **Manipular el raster como entidad (REM)** —borrar/mover trozos del escaneo— y **OCR de texto raster a MTEXT**. [?] alta-media confianza en el OCR.

**Valle hoy — EXISTE A MEDIAS, apenas.** `IMAGE` adjunta una imagen al fondo como calco (`engine/commands/draw-fills.ts:307`) y el propio comentario admite que el motor es puro y la definición nace `loaded: false` con 1 píxel. Hay `pdf-import-corpus-matrix.json`. Nada de vectorizar, limpiar, ajustar ni OCR.

### 7 · AutoCAD Plant 3D
**Problema:** planta de proceso: del P&ID al isométrico. **Quién:** ingeniería de proceso, EPC, tubería industrial.
1. **P&ID inteligente:** símbolos con datos, numeración de línea y equipo, y validación P&ID↔modelo 3D.
2. **Ruteo 3D gobernado por especificación:** rutea y el accesorio lo elige la spec del catálogo.
3. **Isométricos y ortográficos generados del modelo** (vía ISOGEN) más reportes de línea y LDM.

**Valle hoy — NO EXISTE.**

---

## ORDEN, por lo que le importarían a ESTE producto

| # | Toolset | Por qué ahí | Estado Valle |
|---|---|---|---|
| **1** | **Architecture** | Sin él, esto es AutoCAD LT en el navegador. Es el único donde ya hay cimiento real, y su motor (objeto paramétrico + property sets + tablas del modelo) es el mismo que después necesitan MEP y las etiquetas de todo lo demás. Un peso invertido aquí se cobra dos veces. | A MEDIAS |
| **2** | **MEP** | El mismo comprador, el mismo archivo, la misma entrega. Un despacho mexicano entrega arquitectónico **e instalaciones**; si sólo tiene lo primero aquí, sigue abriendo AutoCAD y entonces no cambió de herramienta. Además hereda el motor del #1. | NO EXISTE |
| **3** | **Raster Design** | No es una disciplina, es **la puerta**. Los otros seis empiezan casi siempre en el papel de alguien más. Es la diferencia entre "puedo empezar dibujos nuevos aquí" y "puedo traer mi proyecto de verdad". Es el más barato de los siete y ya hay `IMAGE` y corpus de PDF sobre los que apoyarse. | A MEDIAS |
| **4** | **Mechanical** | Segunda vertical real y base manufacturera grande en México. Es casi todo **datos sobre 2D** —biblioteca, LDM, globos, tolerancias—: no exige kernel. Buen retorno por punto. | NO EXISTE |
| **5** | **Electrical** | El **mayor retorno por esfuerzo de los siete** (símbolos + tagging + reportes, sin geometría difícil), pero para **otro comprador**: automatización y tablero, no el arquitecto. Súbelo sólo si se decide entrar a ese mercado; no lo subas creyendo que resuelve la eléctrica del edificio, porque eso es el #2. | NO EXISTE |
| **6** | **Map 3D** | Sólo importa una rebanada delgada —predio, lindero, CRS, shapefile— y esa rebanada **ya casi existe**. Terminarla es barato y cierra el caso real. Map 3D completo (FDO, topología, modelos de industria) es otro producto, como el propio gap matrix admite. | A MEDIAS |
| **7** | **Plant 3D** | El más profundo, el más caro, la audiencia más chica y el más lejos de un navegador: exige kernel sólido serio más un motor de especificación más generación de isométricos. Último sin dudarlo. | NO EXISTE |

**Lo que hay que arreglar antes que cualquier toolset**, porque es lo que hizo posible la divergencia: la rúbrica necesita filas para las siete disciplinas y una fila para "se ve y se maneja como AutoCAD" (pestañas de cinta, espacios de trabajo por disciplina, paletas de herramientas). Mientras no las tenga, el número puede seguir subiendo mientras la distancia que el dueño ve se queda igual — y esta vez el rótulo del total tiene que dejar de decir "AutoCAD completo" para un denominador que es AutoCAD LT.
