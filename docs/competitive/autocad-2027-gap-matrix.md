# Matriz de brechas y rúbrica frente a AutoCAD 2027

La puntuación y la tabla fila a fila de este documento las calcula
`scripts/cad/rubric.mjs` leyendo `docs/competitive/rubric.json` y verificando
cada evidencia contra el árbol; se regeneran con
`node scripts/cad/rubric.mjs --markdown` (lo hace `npm run check:cad`).
AutoCAD 2027 se usa sólo como referencia de categorías; no existe afiliación,
certificación ni claim de paridad.

## Por qué este documento cambió de forma (dos veces)

La primera versión era honesta y estaba desactualizada, que son cosas
compatibles. Decía que el modelador B-rep no existía —existía—, decía que los
plugins AutoLISP estaban «Ausente» —había un intérprete completo— y citaba
25.275 ms de primer detalle cuando el benchmark versionado ya reportaba 750 ms.
De ahí salió la rúbrica con denominador publicado y el script que la calcula.

La segunda lección llegó el 2026-08-20 y fue en la dirección contraria: **la
rúbrica se estaba inflando**. El script imprimía 189/200 con 21 de 25 filas en
su tope, violando su propia regla de que ninguna fila toca el máximo mientras
exista un gap. El mecanismo del inflado era concreto: criterios que cobraban
por la EXISTENCIA de un artefacto sin leer su contenido. El caso más grave:
`performance.browser-slo` concedía 2 puntos porque `browser-slo-100k.json`
existía, cuando ese mismo archivo medía **48,2 segundos** hasta el detalle
completo y **1,4 fps** de paneo. El artefacto desmentía el punto que concedía.

La corrección fue estructural, no cosmética:

1. La evidencia de existencia se re-basó a **contenido** (checker `jsonValue`
   y `metric` sobre las cifras del propio artefacto). Un criterio de ≥2 puntos
   cuya única evidencia sea que un archivo existe es ahora un **error de
   definición** que `rubric.spec.mjs` bloquea en CI.
2. Los gaps documentados que no puntuaban se volvieron **criterios que
   fallan**: capas sin `frozen` en el documento canónico, PAGESETUP que no
   recoloca la ventana gráfica, sombreado sin patrón en el PDF, BEDIT
   inexistente, F7/F9/F12 ausentes, ninguna `.shx` resuelta, y el kernel WASM
   que nadie importa.
3. La prosa fila a fila de este documento pasó a ser **generada** entre los
   marcadores de abajo, porque envejeció dos veces y en las dos direcciones.

## Criterio

- **Completa:** todos los criterios declarados para la fila —incluidos los que
  nombran gaps— verifican contra el árbol.
- **Parcial:** hay implementación real, pero al menos un criterio no verifica.
- **Ausente:** ningún criterio de la fila verifica.

Reglas que el documento se dio a sí mismo y que no se negocian:

1. Una fila sólo llega a su tope si **todos** sus criterios verifican, y los
   gaps conocidos se declaran como criterios que fallan, no como notas al pie.
   La coletilla de «filas en su tope» la calcula el script; no es una frase
   fija que pueda quedarse mintiendo.
2. Que un golden, un unit test o un endpoint pase **no compensa** un criterio
   faltante.
3. Nunca se redondea al tope mientras exista un gap declarado.
4. Si se cita un número de rendimiento, **se cita también la máquina**.
5. Sin evidencia, cero. No hay puntos de oficio.
6. **Un módulo que nadie importa no cuenta como implementado.**
7. **La existencia de un artefacto no es evidencia de su contenido.** Si el
   criterio cita cifras, el script lee las cifras.

La sexta regla no es teórica: la ola 1 entregó el pipeline de render, el
intérprete AutoLISP y el kernel B-rep terminados, probados y sin un solo
importador. Hoy los tres están enchufados y sus filas lo reflejan; el que
sigue huérfano es el kernel Rust/WASM, y su fila lo dice. La séptima tampoco:
es la regla que faltó para impedir el 189 inflado.

## Los 200 puntos, y por qué están repartidos así

El reparto es por **peso comercial**, no por esfuerzo de implementación. Es una
decisión discutible y por eso está escrita: un kernel B-rep es muchísimo más
caro de construir que un comando `HATCH`, y aun así vale menos puntos, porque un
delineante no compra un kernel B-rep si no puede acotar. La pregunta que ordena
la tabla no es «¿qué nos ha costado más?», sino «¿qué impide firmar el pedido?».

| Grupo                        | Puntos | Qué representa                                                                      |
| ---------------------------- | -----: | ----------------------------------------------------------------------------------- |
| Núcleo del plano entregable  |    110 | Dibujar, anotar, organizar y entregar una lámina. Sin esto no hay producto.         |
| Productividad profesional    |     44 | Lo que separa «se puede hacer» de «se hace rápido»: línea de comandos, 100k, xrefs  |
| Extensibilidad e integración |     26 | API, SDK, plugins, eventos, almacenamiento                                          |
| Frontera avanzada            |     20 | DWG, sólidos, WASM, GIS                                                             |
| **Total**                    |    200 |                                                                                      |

El argumento del 55 % al núcleo: un CAD 2D se compra para producir una lámina
que alguien firma. Todo lo que ocurre entre abrir el archivo y entregar el PDF o
el DXF es el producto; lo demás es diferenciación. Dentro del núcleo, las cotas
(12) pesan más que HATCH (10) y HATCH más que MTEXT (9) porque ése es el orden
en que un plano deja de ser entregable: una lámina sin cotas no se puede
fabricar, una sin sombreado se lee peor, y una con texto pobre se entrega
igualmente.

El argumento del 22 % a productividad: la fila más gorda del grupo es la línea
de comandos (12), porque la memoria muscular de un dibujante veterano tiene
décadas y es intransferible: si `TR` no recorta, el producto se siente ajeno
por completo que esté el resto.

El argumento del 13 % a extensibilidad: es lo que decide si un cliente grande
puede automatizar, y su fila más gorda son los plugins (8) porque un despacho
con veinte años de rutinas LISP no migra sin ellas.

El argumento del 10 % a la frontera: DWG (8) es la única de las cuatro con
demanda comercial real y directa. B-rep (7) la tiene indirecta —vende en el
comparativo, no en el uso diario—. WASM (2) es una optimización condicionada y
GIS (3) es otro producto.

Desde el corte 2026-09-02 el denominador de DESTINO suma dos grupos más y por
eso los repartos de arriba (55/22/13/10 %) se leen sobre 216, la base anterior:
**reconocimiento** (14 pt, alcance de HOY) mide en pantalla lo que un dibujante
de AutoCAD reconoce en cinco minutos —el texto se ve, la cinta está donde la
espera, teclea sin pulsar la caja, arrastra para designar, nada le tapa el
plano y los ejes se ven a trazo y punto—, y **los siete toolsets** (28 pt, alcance de DESTINO) declaran una fila
por vertical aunque hoy valgan cero, con Electrical y Plant 3D fuera de alcance
por escrito. Una nota de la auditoría del 2026-09-01 lo dejó medido: el
producto sumaba 88,6 % del alcance de HOY y «no se parecía en nada» a AutoCAD,
porque el instrumento no tenía ni una fila para el reconocimiento.

## Capacidades: las 25 filas al día

<!-- rubric:begin -->

> Esta sección la genera `node scripts/cad/rubric.mjs --markdown` desde
> `docs/competitive/rubric.json` verificando cada evidencia contra el árbol.
> Editarla a mano es reintroducir el defecto que motivó el script: la prosa
> manual envejeció dos veces y en las dos direcciones.

**Puntuación (rúbrica 2026-09-02.1).** **Alcance de HOY: 175/197 (88.8 %)** — el flujo diario de dibujo 2D técnico, la cifra que se enseña a un cliente. **Alcance de DESTINO: 225/271 (83 %)** — AutoCAD completo con sus verticales, la cifra que mide el camino; lo excluido de hoy es «todavía no», nunca «nunca». 5 pt provienen de evidencia INDEPENDIENTE y 220 pt sólo de evidencia propia; 25 fila(s) retienen 1 pt hasta tener evidencia independiente. 0 de 36 filas están en su tope. Una fila sólo llega a su tope cuando TODOS sus criterios verifican, incluidos los que nombran gaps documentados; un gap conocido se declara como criterio que falla, no como nota al pie.

### Núcleo del plano entregable — 105/118

| Categoría | Puntos | Estado | Qué verifica hoy | Qué falta exactamente |
| --- | ---: | --- | --- | --- |
| Dibujo 2D y precisión | 15/16 | Parcial | Entidades canónicas (línea, polilínea, círculo, arco, elipse, spline) en el documento, con specs; LINE, PLINE, CIRCLE, ARC, RECTANG, POLYGON, ELLIPSE y SPLINE son tecleables; Coordenadas absolutas, relativas (@) y polares (<) con entrada dinámica; OSNAP sobre el puntero con consulta indexada medida (p95 publicado); ORTHO, rastreo polar y ajustes de dibujo con diálogo aplicable; Conmutadores estándar por tecla de función: F7 (rejilla), F9 (forzado a rejilla) y F12 (entrada dinámica) — F3, F8, F10 y F11 ya existen; Construcción y reparto: XLINE, RAY, DIVIDE, MEASURE, DONUT y REVCLOUD tecleables; Corpus de geometría degenerada (tangencias, radio cero, autointersección, colineales) con criterio publicado por caso | Nada pendiente: todos los criterios declarados verifican |
| Selección y modificación | 13/14 | Parcial | Selección por ventana y captura con índice espacial; Grips con edición directa sobre entidades canónicas; ERASE, MOVE, COPY, ROTATE, SCALE, MIRROR y OFFSET tecleables y respetando la selección previa; TRIM, EXTEND, FILLET, CHAMFER, BREAK y JOIN tecleables, con goldens de recorte y empalme; ARRAY rectangular y polar con ARRAYEDIT posterior; STRETCH, LENGTHEN, ALIGN, PEDIT, SPLINEDIT y EXPLODE tecleables; MATCHPROP, GROUP/UNGROUP, OVERKILL y DRAWORDER tecleables | Estrés de navegador con trazos densos (100k) sobre selección y modificación, con artefacto versionado por corrida (1 pt) |
| Trabajo ajeno: tomar el plano de otro y trabajar sobre él | 5/6 | Parcial | HPGAPTOL y la palabra Tolerancia en HATCH, BOUNDARY y JOIN, y la distancia de aproximación en PEDIT Juntar: la planta de 34 tramos con huecos de hasta 0,92 mm se sombrea, se contornea, se une y se mide contra el papel (92.840.000 mm², 46.297 mm); COPYCLIP, CUTCLIP, COPYBASE, PASTECLIP y PASTEORIG con Ctrl+C/X/V: geometría canónica que viaja entre editores con su punto base, ids nuevos, el bloque que falta definido y lo asociativo desligado; SELECTSIMILAR, ADDSELECTED (con CECOLOR/CELTYPE/CELWEIGHT llegando por fin a lo que se dibuja), XPLODE, SETBYLAYER, CHPROP y NCOPY, tecleados sobre un plano ajeno | Nada pendiente: todos los criterios declarados verifican |
| Cotas asociativas | 11/12 | Parcial | Entidad DIMENSION canónica con asociatividad al geométrico medido; Formato de cota: unidades, precisión y presentación del valor; Round-trip DXF de DIMENSION con XDATA propietaria; DIMLINEAR, DIMALIGNED, DIMANGULAR, DIMRADIUS y DIMDIAMETER tecleables (DLI, DAL, DAN, DRA, DDI resuelven); DIMSTYLE aplicable: núcleo de ~30 DIMVARs con nombre, aplicación retroactiva, comparación y round-trip DXF de la tabla | Nada pendiente: todos los criterios declarados verifican |
| HATCH asociativo | 11/12 | Parcial | Motor de sombreado poligonal con asociatividad al contorno; Round-trip DXF de HATCH; HATCH tecleable con detección de contorno por punto interior (H y BH resuelven); Contornos curvos e islas anidadas con corpus de casos y criterio por caso; Una tabla de patrones (ANSI31–38, AR-B816, AR-BRSTD, AR-CONC, AR-SAND, BRICK, DOTS, EARTH, GRAVEL, HEX, HONEY, LINE, NET, NET3, STEEL, MUDST) con familias, trazos y puntos, consumida por pantalla, papel y DXF: ocho nombres dan ocho trazados y ANSI31 sigue byte a byte | Nada pendiente: todos los criterios declarados verifican |
| MTEXT y texto | 8/9 | Parcial | Entidad MTEXT con maquetación de párrafo; MTEXT viaja por DXF en los dos sentidos; MTEXT, TEXT y STYLE tecleables (T, MT, DT y ST resuelven); Códigos de control (\P, apilado, cambio de fuente) con sustitución de fuentes declarada | Una fuente de trazos (SHX o equivalente de dominio público) resuelve glifos de verdad en vez de sustituirse (1 pt) |
| Capas y propiedades | 9/10 | Parcial | Capa canónica con mapa DXF probado; Gestor de capas con bloquear y visibilidad; Congelar de verdad: `frozen` en la capa del documento canónico (CadLayerDef), distinto de apagar, persistido y con viaje DXF del bit 1 del código 70; Paleta de propiedades multi-objeto; Tipos de línea y escala aplicables a la entidad, resueltos por capa (BYLAYER) con respaldo de fábrica; LAYER, LINETYPE, LWEIGHT, COLOR y PROPERTIES tecleables (LA, LT, LW, COL, CH resuelven) | Nada pendiente: todos los criterios declarados verifican |
| Bloques y atributos | 7/9 | Parcial | Definición e inserción de bloques con biblioteca profesional; ATTDEF tecleable con atributos persistidos en el documento; Round-trip DXF de INSERT con transformación y de la tabla de bloques; BLOCK, INSERT y WBLOCK tecleables (B, I, W resuelven) | Editor de bloques EN SITIO (BEDIT como editor real, no como puerta al panel) (1 pt); Bloques dinámicos (parámetros y acciones de AutoCAD) y comportamiento anotativo (1 pt) |
| Import/export DXF de texto | 10/12 | Parcial | Importador DXF en TypeScript con specs; Exportador con manifiesto de pérdidas y preflight antes de entregar; Round-trip por entidad: polilínea con bulge, polilínea cerrada, hatch, cota e insert; XDATA con nombres de aplicación registrados y estables; Corpus propio versionado con round-trip completo; DXFIN y DXFOUT tecleables | Corpus DXF de terceros, autorizado y diverso, con matriz por entidad y pérdidas aceptadas (2 pt) |
| Layouts, viewports y publicación | 9/10 | Parcial | Paper space con múltiples viewports; Hoja de ploteo y adaptador de exportación del layout; Publicaciones versionadas y consultables desde el cliente; LAYOUT, MVIEW, MSPACE, PSPACE, PLOT y PAGESETUP tecleables; Fidelidad geométrica de publicación MEDIDA sobre los bytes del PDF: error de escala bajo la tolerancia de 0,001 mm y veredicto verde, con máquina declarada; PAGESETUP recoloca la ventana gráfica al cambiar el papel: cero segmentos fuera del área imprimible en el caso medido A1→A3; El sombreado llega al PDF publicado con su patrón, no sólo el contorno | Nada pendiente: todos los criterios declarados verifican |
| Guardado CAS, autosave, historia y versiones | 7/8 | Parcial | Cola de un solo escritor con CAS y conflicto 409 explícito; Journal de recuperación con códec e integridad verificada; Recorrido real contra API y PostgreSQL: logout, reapertura y documento >1 MB; Offline, multi-pestaña y cierre forzado sin pérdida, con presupuesto de documento y memoria publicado | Nada pendiente: todos los criterios declarados verifican |

### Productividad profesional — 38/44

| Categoría | Puntos | Estado | Qué verifica hoy | Qué falta exactamente |
| --- | ---: | --- | --- | --- |
| Línea de comandos, alias y scripting | 11/12 | Parcial | Registro único de comandos: paleta, línea, barra y scripts leen del mismo sitio; Tabla de alias compatible con acad.pgp, invariante entre idiomas; Línea de comandos en el editor con prompts, opciones y eco; Motor de comandos con estados y pipeline de entrada (punto, distancia, palabra clave, selección); Los alias de anotación, capa, consulta y vista resuelven: H, LA, DLI, T, Z, P, I y B; La tabla acad.pgp resuelve COMPLETA: los 129 alias, incluidos BE→BEDIT y BLE→BLEND, que hoy cuelgan; SCRIPT (.scr) y variantes -COMANDO ejecutables sin interfaz gráfica | Nada pendiente: todos los criterios declarados verifican |
| MLEADER y tablas | 4/5 | Parcial | MLEADER canónico con asociatividad; TABLE tecleable como descriptor del motor; MLEADER, MLEADERSTYLE y TABLESTYLE tecleables con estilos aplicables | Nada pendiente: todos los criterios declarados verifican |
| Xrefs | 5/6 | Parcial | Referencias externas declaradas en el documento canónico; Resolución de recursos, capas de xref y bind con round-trip; XREF, XATTACH, XBIND y XCLIP tecleables | Nada pendiente: todos los criterios declarados verifican |
| Rendimiento 10k/100k | 11/12 | Parcial | Índice espacial, nivel de detalle y presupuesto de render en el editor; Corpus determinista versionado por sha256 y benchmark reproducible; Spec Playwright a 100k con artefacto JSON por corrida; Pipeline por lotes y tiles medido: primer detalle <1 s y asentado del zoom <100 ms sobre 100k, con máquina declarada; El editor USA ese pipeline: algo fuera de lib/cad/render lo importa; SLO de navegador CUMPLIDO, no sólo publicado: detalle completo ≤5 s, paneo ≥30 fps p95 y zoom asentado ≤500 ms sobre el corpus architecture (perfil next, 10k), con hardware y navegador declarados | La mezcla architecture@100k cumple el mismo SLO: detalle completo ≤5 s y paneo ≥30 fps p95 (1 pt) |
| Compare, comentarios y enlaces de revisión | 4/5 | Parcial | Enlaces de revisión con hash, caducidad, revocación y aislamiento por organización; Comentarios anclados a la geometría, con spec de anclaje; Carga concurrente medida y merge semántico con recorrido de todos los roles, con veredicto verde en el artefacto | Nada pendiente: todos los criterios declarados verifican |
| Importación de JSON canónico | 3/4 | Parcial | Worker con progreso, cancelación y límites declarados; Transporte de documentos grandes con gzip y blobs; Corpus hostil y fuzzing ejecutados en navegador, no sólo en Node | Nada pendiente: todos los criterios declarados verifican |

### Extensibilidad e integración — 17/22

| Categoría | Puntos | Estado | Qué verifica hoy | Qué falta exactamente |
| --- | ---: | --- | --- | --- |
| API y SDK de automatización | 6/7 | Parcial | OpenAPI 3.1 versionado con gate de contrato en CI; SDK generado desde el contrato con test de compatibilidad; El web consume el SDK a través de repositorios tipados; Consola pública en /docs/api, pruebas de límite y carga publicadas con máquina declarada, y política de extensiones de terceros | Nada pendiente: todos los criterios declarados verifican |
| Automatización: AutoLISP y plugins JS | 6/8 | Parcial | Intérprete AutoLISP: lector, evaluador, entorno y errores; Funciones de CAD y de entidad por códigos DXF; Sandbox con presupuesto de ejecución y superficie declarada; DCL y manifiesto de plugins; El editor puede cargar y ejecutar un .lsp: algo fuera de lib/lisp lo importa | Puente .NET/VBA para rutinas heredadas de despacho (2 pt) |
| Eventos e integración asíncrona | 3/4 | Parcial | Outbox transaccional con leases, reintentos y cola muerta; Contrato de eventos versionado; Evidencia operacional sostenida y replay auditado con receptor externo | Nada pendiente: todos los criterios declarados verifican |
| Almacenamiento de objetos | 2/3 | Parcial | Puerto de blob store desacoplado del almacenamiento concreto; Adaptador BYTEA con aislamiento por organización y specs; Adaptador S3/MinIO cableado, con migración y operación documentadas | Nada pendiente: todos los criterios declarados verifican |

### Frontera avanzada — 19/24

| Categoría | Puntos | Estado | Qué verifica hoy | Qué falta exactamente |
| --- | ---: | --- | --- | --- |
| Import/export DWG | 6/7 | Parcial | Decisión de arquitectura publicada sobre DWG y el laboratorio clean-room; Decoder productivo con corpus independiente y matriz de entidades; Exportación DWG con round-trip verificado por lector externo | Integración en runtime con gates legal, de seguridad y de fidelidad superados (1 pt) |
| Modelo 3D y sólidos B-rep FACETADO | 6/7 | Parcial | Topología, tolerancia e invariantes verificadas; Extrusión, barrido, booleanas y redondeo con specs; NURBS, superficies y teselado; STEP e IGES en los dos sentidos; El editor lo usa: algo fuera de lib/brep lo importa | Nada pendiente: todos los criterios declarados verifican |
| Modelado 3D: primitivas, SOLIDEDIT y la cota | 4/5 | Parcial | BOX, WEDGE, CYLINDER, CONE, SPHERE, TORUS, PYRAMID y POLYSOLID tecleables, como UN nodo reeditable cada una, con el volumen medido en papel; SOLIDEDIT con Cara Extruir (nodo push), Cuerpo Comprobar y Cuerpo Separar, y sus otras once ramas declaradas en el propio diálogo; La cota cruza todas las fronteras: PLINE y RECTANG dibujan en el plano del SCU inclinado, CIRCLE y ARC en la planta elevada, y el DXF conserva 30/31, elevación, polilínea 3D y SCU reflejado (lector de terceros como oráculo) | Nada pendiente: todos los criterios declarados verifican |
| Kernel Rust/WASM | 1/2 | Parcial | Puerta de entrada publicada con condición de activación explícita | Kernel WASM con paridad numérica verde Y enchufado: alguien fuera de lib/cad/wasm lo importa (regla 6) (1 pt) |
| Nubes de puntos, raster georreferenciado y GIS | 2/3 | Parcial | LAS/LAZ, GeoTIFF o SHP leídos en el runtime: el importador de documentos usa lib/geo de verdad; Sistemas de referencia y reproyección, con spec; Índices espaciales y pruebas a escala real: el nivel mayor del artefacto indexa millones de puntos con presupuesto de bytes por punto | Nada pendiente: todos los criterios declarados verifican |

### Integridad y capacidad de crecer — 19/21

| Categoría | Puntos | Estado | Qué verifica hoy | Qué falta exactamente |
| --- | ---: | --- | --- | --- |
| Integridad: el producto hace lo que dice | 12/13 | Parcial | Cada comando del registro hace lo que dice: el arnés de veracidad corre en check:cad con CERO éxitos falsos y exenciones declaradas; La interfaz detecta y rechaza el formato en vez de fingir soporte; Ninguna pérdida es silenciosa: el manifiesto de pérdidas viaja con el documento, con el DXF exportado y con la publicación por lotes; Los límites se declaran donde el usuario y el lector los ven: README con límites explícitos, CAPABILITIES del laboratorio con columna de límites, y los anfitriones responden «no disponible» en vez de fingir | Nada pendiente: todos los criterios declarados verifican |
| Capacidad de crecer: las puertas que no se cierran | 7/8 | Parcial | La migración aditiva es invariante escrita (ADR-0011) y probada: documentos de esquemas anteriores abren con cero pérdida; La API pública tiene política de versionado y el manifiesto de plugins es formato con versión; El mecanismo de niveles existe: guard genérico por capacidad y catálogo con N entitlements por plan (aunque hoy se venda UNA); El uso por organización se registra desde ya (documentos guardados y publicados, con idempotencia); La puerta única de interoperabilidad está escrita: bytes → neutral → canónico con pérdidas en ambos sentidos; La deuda del monolito está publicada con meta (<8,000 líneas), método por costuras y registro por campaña; el trinquete existe; El mecanismo de corpus independiente está montado: consumo fail-closed con pin y procedimiento de donación publicado en el repo de conformidad | Nada pendiente: todos los criterios declarados verifican |

### Reconocimiento: se ve y se maneja como AutoCAD — 13/14

| Categoría | Puntos | Estado | Qué verifica hoy | Qué falta exactamente |
| --- | ---: | --- | --- | --- |
| Reconocimiento en pantalla | 13/14 | Parcial | TEXT, la etiqueta de la cota, el texto de la directriz y las celdas de la tabla se dibujan en el espacio modelo (atlas de texto: ≥56 glifos rasterizados en el golden); La cinta abre en Inicio con Dibujo · Modificar · Anotación · Capas · Bloque · Propiedades, LINE es el primer botón y existe la pestaña Paramétrico; Teclear con el lienzo enfocado escribe en la línea de comandos sin pulsarla, Intro devuelve el foco y Espacio vale por Intro; Ninguna letra suelta del lienzo roba un alias de una letra de acad.pgp (M, E, O, P, Z, A, B, F, G, V, W, S, X): la letra suelta es de la línea de comandos; Arrastrar sobre el fondo designa por ventana (izq→der) o cruce (der→izq), el botón central encuadra y dos dedos siguen encuadrando; Ningún panel tapa el área de dibujo ni un control: cada punto de una rejilla del lienzo responde <canvas> y cada control recibe su clic; Un eje en capa CENTER se ve, se imprime y se exporta con su forma completa (trazo largo · hueco · trazo corto · hueco): la ranura llega al lote, el PDF lleva el operador d con esos milímetros y el DXF escribe el patrón de fábrica | Nada pendiente: todos los criterios declarados verifican |

### Los siete toolsets de AutoCAD — 14/28

| Categoría | Puntos | Estado | Qué verifica hoy | Qué falta exactamente |
| --- | ---: | --- | --- | --- |
| Toolset Architecture | 3/4 | Parcial | WALL, DOOR y WINDOW son tecleables y alojan huecos en el muro; Escaleras, techos y cubiertas paramétricos, y tablas de superficies y carpintería que salen en la lámina | Nada pendiente: todos los criterios declarados verifican |
| Toolset MEP (mitad 2D) | 3/4 | Parcial | Conductos, tuberías y bandejas de cables en planta con uniones y símbolos; Tablas de equipos y longitudes que salen en la lámina | Nada pendiente: todos los criterios declarados verifican |
| Toolset Map 3D | 3/4 | Parcial | Sistema de coordenadas del dibujo (EPSG) y transformación entre sistemas; Importar capas GIS (SHP/GeoJSON) como objetos con atributos | Nada pendiente: todos los criterios declarados verifican |
| Toolset Raster Design (mitad útil) | 2/4 | Parcial | Insertar, recortar por polígono y ajustar (brillo/contraste/transparencia) un plano escaneado | Vectorizar líneas y textos de un escaneo a entidades (2 pt) |
| Toolset Mechanical | 3/4 | Parcial | Biblioteca de tornillería y perfiles normalizados insertables; Cotas de fabricación con tolerancias y símbolos de acabado | Nada pendiente: todos los criterios declarados verifican |
| Toolset Electrical (fuera de alcance) | 0/4 | Ausente | Nada verificado | Esquemas eléctricos con símbolos normalizados y numeración de hilos (2 pt); Informes de cableado y listas de materiales (2 pt) |
| Toolset Plant 3D (fuera de alcance) | 0/4 | Ausente | Nada verificado | Diagramas P&ID con catálogo de equipos y líneas (2 pt); Tubería 3D por especificación e isométricos (2 pt) |

### Prioridad: los diez puntos más baratos por valor comercial

Entre los criterios NO otorgados, ordenados por puntos entre `costDays`
declarados. Reproducible con `node scripts/cad/rubric.mjs --priorities`.

| # | Puntos | Días | Categoría | Criterio |
| ---: | ---: | ---: | --- | --- |
| 1 | 1 | 4 | Bloques y atributos | Editor de bloques EN SITIO (BEDIT como editor real, no como puerta al panel) |
| 2 | 2 | 10 | Import/export DXF de texto | Corpus DXF de terceros, autorizado y diverso, con matriz por entidad y pérdidas aceptadas |
| 3 | 1 | 5 | Selección y modificación | Estrés de navegador con trazos densos (100k) sobre selección y modificación, con artefacto versionado por corrida |
| 4 | 1 | 6 | MTEXT y texto | Una fuente de trazos (SHX o equivalente de dominio público) resuelve glifos de verdad en vez de sustituirse |
| 5 | 1 | 8 | Rendimiento 10k/100k | La mezcla architecture@100k cumple el mismo SLO: detalle completo ≤5 s y paneo ≥30 fps p95 |
| 6 | 1 | 12 | Bloques y atributos | Bloques dinámicos (parámetros y acciones de AutoCAD) y comportamiento anotativo |
| 7 | 1 | 20 | Import/export DWG | Integración en runtime con gates legal, de seguridad y de fidelidad superados |
| 8 | 2 | 60 | Automatización: AutoLISP y plugins JS | Puente .NET/VBA para rutinas heredadas de despacho |
| 9 | 1 | 30 | Kernel Rust/WASM | Kernel WASM con paridad numérica verde Y enchufado: alguien fuera de lib/cad/wasm lo importa (regla 6) |
| 10 | 2 | ? | Toolset Electrical (fuera de alcance) | Esquemas eléctricos con símbolos normalizados y numeración de hilos |

<!-- rubric:end -->

Los 6/7 puntos que DWG obtiene hoy merecen una nota, porque no son ya los 2 de
«detecta y rechaza» de una versión anterior de esta matriz — esa nota quedó
desactualizada cuando el laboratorio pasó de detectar DWG a decodificarlo de
verdad. Hoy el decoder propio lee AC1015 (AutoCAD 2000) y AC1018 (2004) con
cero discrepancias contra un corpus independiente, y el writer propio escribe
archivos que un lector externo (ODA File Converter, nunca el propio código
como oráculo) acepta en round-trip — ambos con evidencia real, no fabricada
(`docs/cad/evidence/dwg-decoder-matrix.json`, `dwg-roundtrip.json`). El único
punto que falta, `dwg.gates`, no es trabajo de laboratorio pendiente: exige
una revisión jurídica externa que el dueño aún no ha encargado (ADR-0009 §5) y
que es, por diseño, una decisión suya, no de ingeniería. Dos cosas concretas
siguen SIN autorizar por el propio dueño, aun con toda esa evidencia en
verde: disponibilidad general del import (hoy vive apagado por defecto detrás
de dos flags de beta, `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA` y
`NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA`) y la exportación DWG en el producto (el
writer y su verificación externa existen íntegros en el laboratorio; nadie
los ha conectado a una ruta que un usuario pueda tocar) — ver ADR-0009
§6-bis, línea «Lo que esta firma NO autoriza». Puntuar 6/7 es puntuar
progreso real y verificado; el 1/7 que falta puntúa una firma pendiente, no
una carencia de código.

## Benchmarks que sí existen, y qué máquina los produjo

**El pipeline de render por lotes y tiles**, medido por
`apps/web/scripts/cad-render-benchmark.mts` y versionado en
`docs/cad/evidence/cad-render-benchmark-100k.json`:

| Métrica sobre 100.000 entidades   | Pipeline nuevo (`next`) | Camino heredado (`legacy`) |
| --------------------------------- | ----------------------: | -------------------------: |
| Primer detalle                    |                750,5 ms |                    73,4 ms |
| Asentado del zoom                 |                 23,3 ms |                    39,1 ms |
| Cuadro de paneo p95               |                  7,2 ms |                    64,1 ms |
| Entidades detalladas en reposo    |                 100.000 |                      2.500 |
| Crecimiento del montón (3 ciclos) |                 0,01 MB |                          — |

Máquina: **Node v22.22.2 sobre Linux x64, Intel Xeon a 2,80 GHz, 4 CPU lógicas,
16,8 GB de RAM, límite de montón 4,3 GB**, corrida del 2026-08-09T07:30Z, corpus
de 100.000 entidades con sha256 `1ba7300d…`.

Tres advertencias que hacen que estos números **no** sean un SLA:

1. Son de **Node, no de navegador**. El propio artefacto declara que no mide GPU,
   llamadas de dibujo, composición ni cuadros por segundo.
2. El artefacto entra como `report-only`: es una métrica sin línea base
   versionada debajo.
3. El pipeline ya está enchufado al editor (la fila de rendimiento lo verifica
   con la regla 6), pero **la experiencia medida EN NAVEGADOR sigue sin cumplir
   el SLO**: la corrida versionada de `browser-slo-100k.json` (2026-08-09,
   Chromium con GPU por software SwiftShader) registra 48,2 s hasta el detalle
   completo y 1,4 fps de paneo sobre el corpus `architecture`. Por eso
   `performance.browser-slo` **falla y debe fallar**: la fila de rendimiento no
   toca su tope mientras esa cifra sea la vigente. Nota del corte 2026-08-20:
   la evidencia es ANTERIOR al presupuesto adaptativo del scheduler
   (2026-08-16); la primera acción es re-medir, no optimizar a ciegas —
   `fullDetailCpuMs` es 539 ms sobre 48 s de reloj, así que el cuello es la
   cadencia de cuadros en GPU-software, no el cómputo.

**El benchmark Node de OSNAP profesional**
(`apps/web/src/lib/cad/professional-snap-query-benchmark.spec.ts`) usa 100.000
entidades y un gate p95 <12 ms. La corrida del corte 2026-08-09, en la máquina
declarada arriba, dio **p50 1,45 ms y p95 3,03 ms**. Mide consulta indexada, no
latencia end-to-end del puntero, del render ni del comando.

La CI ejecuta Chromium y Firefox contra API y PostgreSQL reales. Los números
históricos son de Chromium; que pasen los dos navegadores es gate de release, no
evidencia de igualdad de rendimiento entre ellos.

## Cómo se calcula, y por qué no es un gate

```
npm run check:rubric               # informe con el desglose
npm run check:rubric:spec          # la spec del script (ésta SÍ bloquea)
node scripts/cad/rubric.mjs --verbose --priorities --history
node scripts/cad/rubric.mjs --run-specs   # además EJECUTA las specs citadas
node scripts/cad/rubric.mjs --markdown    # regenera la sección fila a fila
```

`npm run check:cad` ejecuta las dos cosas: la spec del script como gate (es un
test, y un test roto es un fallo) y el informe como **informativo**, regenerando
de paso la sección fila a fila de este documento. El informe sale siempre con
código 0 aunque la nota baje. Una rúbrica que bloquea el merge se convierte, en
dos semanas, en una rúbrica que la gente infla para poder mergear; el día que la
nota sea la diferencia entre desplegar y no desplegar, alguien encontrará el
modo de subirla sin escribir una línea de producto. Ya pasó una vez con la
evidencia de existencia, y por eso el lint que la prohíbe vive en la spec, que
sí bloquea.

Lo que el script comprueba solo: que el archivo exista y tenga cuerpo, que la
spec esté dentro del glob del runner (y con `--run-specs`, que pase y que
imprima algo), que el golden exista, que el comando esté en el registro real
—arrancando el registro con `tsx`, no con `grep`—, que el alias resuelva, que
alguien importe el módulo, que un texto aparezca en la fuente, que un número
medido esté dentro de su umbral **y venga con la máquina declarada**, y —desde
el corte 2026-08-20— que un valor leído de DENTRO del artefacto (`jsonValue`)
cumpla lo que el criterio afirma.

Lo que no se puede automatizar se declara `manual` con `verifiedBy` y
`verifiedAt`, y **caduca a los 180 días**. Hoy hay dos evidencias manuales
declaradas y ninguna firmada, así que ninguna concede puntos:
`dxf.corpus-external` y `dwg.gates`.

Cuando algo no se puede verificar en el entorno —por ejemplo, sin `npm ci` el
registro de comandos no arranca— el criterio se marca `no-verificable` y **no se
concede**. Preferimos una nota baja y explicada a una nota alta y falsa.

## Histórico

Cada corrida con `--history` deja `docs/competitive/history/<fecha>-<commit>.json`
con el total y el desglose por categoría, incluyendo qué criterios quedaron sin
otorgar. Guardar el desglose y no sólo el total importa: un total plano puede
esconder que una categoría subió cuatro puntos y otra se cayó cuatro.

| Fecha      | Commit    |    Nota |      % | Nota                              |
| ---------- | --------- | ------: | -----: | --------------------------------- |
| 2026-08-09 | `8be49a5` | 131/200 | 65,5 % | Primer corte con rúbrica puntuada |
| 2026-08-18 | `986176b` | 166/200 |   83 % | Olas 1-7 y embudo comercial. Núcleo 96/110, productividad 39/44, extensibilidad 21/26, frontera 10/20 |
| 2026-08-19 | `702bc68` | 171/200 | 85,5 % | Olas A, B, C y la red de seguridad offline. Núcleo 101/110, productividad 39/44, extensibilidad 21/26, frontera 10/20 |
| 2026-08-20 | —         | 189/200 | 94,5 % | **Nota inflada, nunca publicada como válida**: 21/25 filas al tope por evidencia de sólo-existencia. Es el motivo de la re-base de este mismo día |
| 2026-08-20 | `545a70d` | 178/200 |   89 % | Re-base de integridad: evidencia de contenido (`jsonValue`), lint de existencia, y los gaps documentados como criterios que fallan (SLO navegador, frozen, PAGESETUP, hatch-PDF, BEDIT, F7/F9/F12, .shx, WASM huérfano, artefacto denso sin versionar). Núcleo 101/110, productividad 39/44, extensibilidad 25/26, frontera 13/20 |

## Gaps P0 que bloquean claims superiores

1. **Cumplir el SLO de navegador**, no sólo publicarlo: 48,2 s de detalle
   completo y 1,4 fps de paneo en la corrida versionada. Re-medir primero (la
   evidencia es anterior al presupuesto adaptativo del scheduler) y optimizar
   la cadencia de presentación después.
2. Enchufar el kernel Rust/WASM o dejar de contarlo: paridad verde y cero
   importadores es exactamente el patrón que la regla 6 existe para detectar.
3. `frozen` en el documento canónico, PAGESETUP que recoloque la ventana
   gráfica y el patrón de sombreado en el PDF: los tres están medidos o
   declarados por los propios artefactos de evidencia.
4. BEDIT y BLEND: los 2 alias colgantes de la tabla acad.pgp.
5. Construir un corpus DXF autorizado y diverso de terceros con matriz por
   entidad, round-trip y pérdidas aceptadas. No promover DXF por un único
   archivo feliz.
6. Si DWG es requisito comercial, validar la implementación clean-room contra
   ADR-0007 (corpus independiente primero) o seleccionar un proveedor
   autorizado y completar los gates legal, de seguridad y de fidelidad. Sin ADR
   posterior de promoción, sigue ausente del producto.
7. Mantener como gate bloqueante identidad→organización→trial→documento→CAS→
   logout/login/reset→aislamiento A/B→archivo grande→DXF con API y PostgreSQL
   reales en Chromium y Firefox, sin interceptar `/v1`.

## Regla de actualización

Toda promoción enlaza código, prueba y artefacto del límite relevante, **y se
declara como evidencia comprobable en `rubric.json`**. No se aceptan como única
evidencia documentos de ejecución, mocks de toda la API, tests unitarios o
microbenchmarks. Una regresión baja el estado; no se relajan umbrales ni se
reescribe un golden sólo para conservar una etiqueta.

Dos reglas nuevas, aprendidas por las malas:

- **La evidencia se declara en el JSON, no en la prosa.** La prosa de este
  archivo puede envejecer; la sección generada no puede, porque la escribe el
  mismo script que puntúa.
- **Si el criterio cita un artefacto, la evidencia lee el artefacto.** Un
  criterio de ≥2 puntos cuya única evidencia sea la existencia de un archivo es
  un error de definición y `check:cad` lo bloquea. La existencia de
  `browser-slo-100k.json` valió 2 puntos durante once días mientras su contenido
  medía 48 segundos; que no vuelva a pasar no depende de la memoria de nadie.
