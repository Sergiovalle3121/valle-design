# Auditoría 09 · Toolsets Map 3D y Raster Design

**Fecha:** 2026-09-05
**Quién escribe:** arquitecto de despacho, veinte años, suscripción completa de
AutoCAD (modelo + presentaciones + los siete toolsets). Uso Map 3D para meter
el catastro y la ortofoto debajo del plano de conjunto, para temar el predio
por uso de suelo antes de una reunión con el municipio, para limpiar la
cartografía que me manda el topógrafo y para consultar por atributo cuando el
polígono trae cien parcelas. Uso Raster Design para el escaneo del plano
antiguo: lo inserto, lo calibro contra una cota conocida, lo despunteo, lo
atenúo y calco encima. Abro Valle Design por primera vez con intención honesta
de cambiarme, y estoy juzgando si el lunes puedo entregar desde aquí.

**Alcance de esta auditoría (el que me dieron):**
· *Map 3D* — sistemas de coordenadas, conexión a datos GIS, temas y estilos
por atributo, consultas espaciales, limpieza de dibujo, topología.
· *Raster Design* — insertar y georreferenciar imágenes, vectorizar, quitar
manchas, ajuste de imagen, recorte, transparencia.

**Método:** leí primero `docs/competitive/rubric.json` (filas
`toolset-map3d`, `toolset-raster` y `geo`),
`docs/competitive/autocad-2027-gap-matrix.md` (líneas 173, 194 y 195),
`docs/parity/ESCALERA.md` §«El mapa (Ola G)», §«El plano escaneado (Ola H)» y
las dos filas de la Ola I, `docs/execution/BACKLOG.md` y `AGENTS.md`. Después
bajé al árbol: los cinco comandos del frente
(`geo-location.ts`, `map-import.ts`, `raster-image.ts`, `vectorize-raster.ts`,
`geo-cogo.ts`), los módulos de cálculo (`lib/geo/*`, `georeference.ts`,
`geo-import-plan.ts`, `raster-decode.ts`, `raster-vectorize.ts`,
`raster-text-recognize.ts`), el visor (`render/image-layer-three.ts`), la
lámina (`paper-space-image.ts`), la ruta DXF (`dxf-schema4-primitives.ts`,
`dxf-export-loss-manifest.ts`), el filtro de selección
(`selection/selection-filter.ts`), la paleta de propiedades
(`palettes/property-model.ts`) y los goldens 82 y 83.
**No se ha modificado ni una línea de producto.** Lo único que escribí es este
fichero.

---

## 0. Veredicto

**4 / 10 contra AutoCAD completo con Map 3D y Raster Design.**

La frase corta: **con un escaneo y un predio en la mano esto compite, y en dos
puntos concretos gana a Autodesk; en cuanto el trabajo necesita DATOS —una
ortofoto de fondo, una consulta por atributo, una topología, una limpieza de
cartografía— aquí no hay absolutamente nada, y ésos son justo los flujos por
los que uno paga el toolset.**

El 4 no es desprecio y lo justifico entero antes de pegar.

**Lo que hay está construido de verdad, no simulado.** No es un menú con
nombres de AutoCAD colgando de un `TODO`. `GEOGRAPHICLOCATION` georreferencia
con cuentas propias verificadas contra cuadraturas (`lib/geo/crs.spec.ts`,
21 KB de spec); `MAPIMPORT` lee un shapefile de cuatro archivos, lo
reproyecta, decide entre CUATRO situaciones distintas y **enseña el plan antes
de escribir** (`geo-import-plan.ts:66-176`); `IMAGEATTACH` mete el PNG dentro
del documento y los píxeles **se ven de verdad** en el visor, en la lámina y
en el PDF (`render/image-layer-three.ts`, `paper-space-image.ts`, golden 83);
`VECTORIZE` hace Otsu, despeckle por componentes conexas, adelgazamiento de
Zhang-Suen, recorrido de esqueleto y Douglas-Peucker
(`raster-vectorize.ts:11-59`). Eso es oficio.

**Y hay dos cosas objetivamente mejores que AutoCAD.**

1. **El reconocimiento de texto del escaneo.** AutoCAD Raster Design **no
   tiene OCR**. Ninguno. Vectoriza líneas y te deja el rótulo como un montón
   de polilíneas que luego borras y reescribes a mano. Aquí
   `raster-text-recognize.ts` (34 KB) compara los trazos por PLANTILLA contra
   las mismas fuentes Hershey con las que el producto dibuja su `TEXT`, saca
   una entidad `TEXT` con la altura, la inserción y el giro **medidos en el
   renglón**, y **quita del calco los trazos que ya salieron como letra** para
   que no aparezcan dos veces
   (`engine/commands/vectorize-raster.ts:180-196`). Eso no lo hace Autodesk y
   es lo que más tiempo me quita cuando calco un plano viejo.

2. **`COGO` + `CUADROCONSTRUCCION`.** AutoCAD sin Civil 3D no dibuja una
   poligonal por rumbos y distancias ni emite el cuadro de construcción de
   siete columnas que lee el Registro Público. Aquí sí
   (`engine/commands/geo-cogo.ts:1-40`), con el error de cierre declarado, la
   precisión 1:N, la compensación por regla del compás **opcional** y las
   columnas X/Y en Este/Norte de verdad cuando el dibujo está
   georreferenciado. Y las distancias se leen **en metros**, dicho en el
   prompt, para que un cuadro pegado no levante un predio de diez centímetros
   (`geo-cogo.ts:27-33`). Eso es entender el oficio mexicano mejor que
   Autodesk.

**Ahora el 4.** Map 3D no es «georreferenciar un dibujo». Map 3D es una capa
de DATOS: te conectas a un origen (SHP, SDF, Oracle Spatial, PostGIS, WFS),
el dibujo lee sin importar, temas por atributo desde el Display Manager,
consultas por localización y por propiedad, construyes topologías de nodo,
red y polígono, y limpias la cartografía con las ocho acciones de `MAPCLEAN`.
De todo eso, en este árbol hay **cero**. Lo verifiqué comando por comando:

```
IMAGEFRAME: 0   TRANSPARENCY: 0   IMAGEQUALITY: 0   REM: 0    DESKEW: 0
MAPCLEAN: 0     MAPTOPO: 0        MAPQUERY: 0       MAPEXPORT: 0
MAPCONNECT: 0   DATACONNECT: 0    GEOMAP: 0         ADEDEFDATA: 0
```
(grep de nombres de orden sobre `apps/web/src`, 2026-09-05.)

Y hay algo peor que la ausencia: **los atributos que MAPIMPORT sí importa son
datos muertos**. Entran en `context.metadata` de cada entidad —eso funciona,
lo comprobé en `geo-import-plan.ts:143`— pero el motor de filtro sólo lee
propiedades del adaptador de entidad
(`selection/selection-filter.ts:104-117`): `QSELECT` y `FILTER` **no ven los
metadatos**. Así que importo cien predios con su `CLAVE` y su `USO`, y no
puedo seleccionar los habitacionales, ni colorearlos, ni rotularlos, ni
sacarlos a una tabla. Puedo verlos de uno en uno con `LIST`
(`inquiry/reports.ts:282-285`). Cien predios, uno por uno. Eso no es una capa
GIS: es un dibujo con notas al pie.

En Raster la mitad útil está, y está bien. Falta la otra mitad: calibrar,
enderezar, transparencia, marco, y —lo que más duele— **el formato de los
escaneos de verdad**.

---

## 1. Lo que ya existe y funciona (verificado en el árbol)

| Qué | Dónde lo miré | Juicio de un usuario |
|---|---|---|
| `GEOGRAPHICLOCATION` (alias `GEO`, `MAPCSASSIGN`, `GEORREFERENCIAR`): punto del dibujo + Este/Norte UTM o lat/lon, con `Zona`, `Datum`, `Geográfica` e `Informe` | `lib/cad/engine/commands/geo-location.ts` (206 líneas); golden 82 | Hace lo que dice. El diálogo es el de AutoCAD sin serlo. `Informe` lee sin escribir, que es la opción que yo uso el 80 % de las veces. |
| Aritmética de proyección propia: UTM ↔ geodésicas, Transverse Mercator método 9807, elipsoides WGS84/GRS80 | `lib/geo/crs.ts` (27 KB) + `crs.spec.ts` (21 KB) | Verificada contra cuadraturas, ida y vuelta a ±2,4e-9 m. No es una librería copiada: está escrita y probada. |
| Rechazo honesto de NAD27/NAD83 **por su nombre** | `lib/geo/crs.ts:31-33`, `lib/geo/crs-prj.ts:20-25` | **Esto vale un punto entero.** Un `.prj` NAD27 entrando como WGS84 pone el predio a cientos de metros con toda la geometría interna correcta: el error invisible más caro de esta disciplina. Aquí se para. |
| `MAPIMPORT` con las cuatro situaciones (dibujo georreferenciado o no × archivo con `.prj` o no), reproyección al sistema del dibujo, plan a la vista antes de escribir | `lib/cad/geo-import-plan.ts:66-176`; `engine/commands/map-import.ts` | El plan antes de escribir es mejor UX que el cuadro de Map 3D. Y la situación B —georreferenciado + sin `.prj` → **se rechaza**— es la decisión correcta y la que Autodesk no toma. |
| Lector de shapefile + DBF + PRJ + CPG y de GeoJSON RFC 7946, con unión posicional verificada por recuento | `lib/geo/shapefile.ts` (26 KB), `dbf.ts`, `geojson.ts`, `index.ts:173-207` | El `geoAssert` de `index.ts:195` —tantas filas como geometrías o se rechaza— evita que cada predio salga con los datos del vecino. Bien pensado. |
| `IMAGEATTACH` / `IMAGECLIP` / `IMAGEADJUST` (alias `IAT`/`ICL`/`IAD`, los de `acad.pgp`) | `engine/commands/raster-image.ts` (416 líneas); golden 83 | El recorte poligonal cóncavo funciona porque **la malla ES el polígono** triangulado, sin stencil (`render/image-layer-three.ts:19-22`). Es más limpio que lo que hace AutoCAD. |
| Los píxeles en el visor, en la lámina y en el PDF | `render/image-layer-three.ts` (367 líneas), `paper-space-image.ts`, `pdf` plot | La imagen entra al fondo del orden de dibujo por defecto (`raster-image.ts:148-150`): es el calco, no algo que tape. Detalle de alguien que ha calcado planos. |
| `VECTORIZE` con Otsu, despeckle, Zhang-Suen, esqueleto, Douglas-Peucker, **plan con recuentos antes de escribir** y opciones `Tolerancia`/`Mancha`/`Umbral`/`teXto` | `raster-vectorize.ts` (22 KB), `engine/commands/vectorize-raster.ts` (413 líneas) | El plan que dice «5 manchas de menos de 12 px fuera, 340 trazos» antes de tocar el dibujo es cómo se afina un escaneo de verdad. AutoCAD te hace vectorizar, mirar el desastre y deshacer. |
| Reconocimiento de rótulos por plantilla contra fuentes de trazos, con supresión de los trazos ya leídos | `raster-text-recognize.ts` (34 KB), `vectorize-raster.ts:180-208` | **Superior a AutoCAD Raster Design, que no tiene OCR.** |
| `COGO` y `CUADROCONSTRUCCION` | `engine/commands/geo-cogo.ts` (518 líneas), `lib/cad/geo-cogo.ts` | **Superior a AutoCAD sin Civil 3D.** |
| Todo tecleable y en la cinta, pestaña Insertar, paneles «Referencias» y «Ubicación» | `lib/cad/ribbon.ts:100,171,174`; `engine/command-manifest.ts:160,241-243,318`; `ribbon/command-icons.ts:322-327,490-491` | Ninguna de estas órdenes está escondida. Comprobado uno a uno. |

---

## 2. Los huecos, por lo que más duele

Numerados por dolor real de despacho, no por tamaño de código.

### H-1 · No hay ortofoto ni mapa de fondo. Ni siquiera GeoTIFF.
**AutoCAD:** `GEOMAP` pone la ortofoto de Bing debajo del dibujo en cuanto
georreferencias; `MAPIINSERT`/`MAPCONNECT` mete un GeoTIFF o una ECW del
municipio. Es lo PRIMERO que hago después de georreferenciar: ver que el
predio cae donde tiene que caer.
**Valle hoy:** el detector reconoce el TIFF y **lo rechaza**
(`lib/geo/index.spec.ts:65-79`, `detectGeoFormat` → `"geotiff"` y
`readGeoDataset` lanza). `IMAGEATTACH` acepta PNG/JPEG/GIF/WebP/BMP
(`image-attach-payload.ts:31`) pero **no lee mundo**: no hay `.tfw`, no hay
claves GeoTIFF, no hay «insertar en sus coordenadas». La ortofoto hay que
colocarla a ojo. Y `ESCALERA.md:251` lo declara «todavía no» con un argumento
—«el producto no llama a servicios externos desde el lienzo»— que es
razonable para las teselas **pero no cubre el GeoTIFF local**, que es un
archivo que el usuario ya tiene.
**Por qué duele:** georreferencio el predio, no tengo nada contra qué
comprobarlo, y la única verificación posible es exportar y abrir otra cosa.
El primer minuto del flujo se queda sin cerrar.

### H-2 · Los atributos importados no se pueden consultar, temar ni rotular.
**AutoCAD:** Display Manager: estilo por rango o por valor de un campo, mapa
temático en tres clics; `MAPQUERY` por propiedad; etiquetas desde el atributo.
**Valle hoy:** los atributos entran (`geo-import-plan.ts:143`,
`attributesAsMetadata: true`) y ahí mueren. `readCadFilterProperty`
(`selection/selection-filter.ts:104-117`) lee `type`, `color`, `linetype`,
`lineweight`, `layer` y lo que devuelva `registry.adapter(entity)
.properties.read(entity)` — **nunca `context.metadata`**. Los cuatro tipos de
`FIELD` son `area`, `longitud`, `fecha`, `variable`
(`fields/drawing-fields.ts:42`): no hay campo de objeto/propiedad.
**Por qué duele:** el municipio me pide el plano con los predios coloreados
por uso de suelo. Con cien predios, en AutoCAD son tres clics; aquí es
imposible sin explotar la capa a mano.

### H-3 · Los metadatos —atributos GIS **y la georreferencia entera**— se caen del DXF EN SILENCIO.
**AutoCAD:** los datos de objeto de Map 3D viajan en el DWG; la georreferencia
es un objeto `GEODATA` que sobrevive; los `.shp` se reexportan con
`MAPEXPORT`.
**Valle hoy:** el escritor de XDATA sólo emite dos aplicaciones
(`dxf-export.ts:769,805,845`: `DXF_XDATA_APP_MLEADER` y
`DXF_XDATA_APP_BLOCK`). El primitivo `point` sólo escribe `style` y `size`
(`dxf-schema4-primitives.ts:45-49`). Y el manifiesto de pérdidas tiene doce
códigos (`dxf-export-loss-manifest.ts`) y **ninguno menciona metadatos**.
Consecuencia doble y comprobada:
· la `CLAVE` catastral de cada predio desaparece al exportar, sin aviso;
· **el marcador de georreferencia sale como un POINT pelado**: el dibujo que
mando al estructurista y me devuelve **ha perdido dónde está en el mundo**, y
nadie lo dice.
**Por qué duele:** viola de frente la regla de la casa —«pérdidas nunca
silenciosas», la fila `integrity` de la rúbrica— en el flujo más común que
existe: mandar el DXF y recibirlo de vuelta.

### H-4 · La georreferencia vive en un POINT borrable de una capa borrable.
**AutoCAD:** `GEODATA` es un objeto del diccionario del dibujo. No se
selecciona, no se borra por accidente, no se explota.
**Valle hoy:** es un `POINT` con `style: 34` en la capa `GEO`
(`georeference.ts:76-86`). La cabecera del módulo explica bien la decisión
—el formato no tiene tabla y tocarlo es del titular
(`georeference.ts:27-37`)— y la respeto. Pero las consecuencias no están
tapadas: un `ERASE` con ventana de cruce, un `PURGE` de la capa, un
`SELECT ALL` + borrar, y la georreferencia se va sin un aviso. La capa se crea
`locked: false` (`geo-location.ts:107`). Y `cadGeoreferenceOf` devuelve el
**primero** que encuentra recorriendo entidades en orden de documento
(`georeference.ts:49-70`) — la cabecera promete «si hay más de uno manda el
primero **y se dice**» (`georeference.ts:16`) y en el código **no se dice
nada**.
**Por qué duele:** el dato más caro del dibujo es el más fácil de perder, y su
pérdida es invisible hasta que `MAPIMPORT` coloca el siguiente predio en el
sitio equivocado.

### H-5 · `VECTORIZE` no puede leer un escaneo de verdad: sólo PNG y BMP.
**AutoCAD Raster Design:** lee TIFF (incluido CCITT G4, que es CÓMO viene un
plano escaneado en A1), JPEG, ECW, MrSID, PDF rasterizado.
**Valle hoy:** `raster-decode.ts:27-31` lo dice sin pestañear: «JPEG, WebP,
GIF y TIFF se RECHAZAN con su motivo». Y aquí está la contradicción del
producto consigo mismo: **`IMAGEATTACH` acepta JPEG** —está en
`CAD_IMAGE_ATTACH_ACCEPT` (`image-attach-payload.ts:31`)— **y `VECTORIZE`
después no lo sabe leer**. El usuario adjunta su escaneo, lo ve en pantalla,
lo recorta, lo atenúa, teclea `VECTORIZE` y se come un «no se pudo leer».
Sumado al tope de 8 MB (`image-attach-payload.ts:28`) y a los 24 Mpx del
decodificador (`raster-decode.ts:43`): un A1 a 300 dpi en gris son 35 Mpx y
no entra ni por tamaño ni por formato.
**Por qué duele:** el escaneo que me manda el cliente es un JPEG o un TIFF.
Siempre. La capacidad mejor construida de este frente no se puede usar con el
archivo real.

### H-6 · No puedo calibrar ni enderezar el escaneo.
**AutoCAD Raster Design:** `IRESCALE` / calibración por dos puntos conocidos,
`DESKEW` por dos puntos que deberían ser horizontales, `RUBBERSHEET` con
cuatro puntos de control para el papel deformado.
**Valle hoy:** el ancho se teclea UNA VEZ al insertar
(`raster-image.ts:118-121`) y ya. Lo llamativo: **para el sustrato PDF sí
existe** — `PDFSCALE` designa, pide dos puntos, dice «entre esos dos puntos
hay N unidades, precise cuánto miden DE VERDAD» y reescala
(`engine/commands/pdf-underlay-edit-commands.ts:410-470`). Para la IMAGE, no.
La asimetría no tiene defensa técnica: la entidad `image` ya admite
`transform` (`fill-entity-adapters.ts:324-330`).
**Por qué duele:** ningún escaneo llega a escala. Insertar «a 4000 mm de
ancho» es una adivinanza; lo que yo hago siempre es medir la cota de 5,00 m
que trae el plano y calibrar contra ella. Sin eso todo lo que calque está mal
de escala, y eso NO se ve.

### H-7 · La imagen viaja dentro del documento y no hay forma de sacarla.
**AutoCAD:** la imagen es un archivo tuyo; se lo mandas al de al lado.
**Valle hoy:** la decisión de meterla como `data:` está bien argumentada
(`image-attach-payload.ts:22-33`) y resuelve el problema clásico del enlace
roto. Pero el DXF exporta sólo el NOMBRE
(`dxf-schema4-primitives.ts:100-104`) y el manifiesto dice literalmente
«**guarda el archivo con ese nombre junto al DXF**»
(`dxf-export-loss-manifest.ts:151-157`) — y **no existe ninguna orden ni botón
que entregue ese archivo**. Lo busqué: cero resultados para descarga de
`imageDefinitions`.
**Por qué duele:** el manifiesto me manda hacer algo que el producto no me
deja hacer. Mando el DXF y el que lo abre ve el marco vacío, sin remedio.

### H-8 · `VECTORIZE` ignora el recorte, no acepta ventana y congela el navegador.
**AutoCAD Raster Design:** vectorizas por selección —una línea, una polilínea,
un contorno—, o dentro de una región, con `VECTORIZE`/REM.
**Valle hoy:** `planCadVectorize`
(`engine/commands/vectorize-raster.ts:124-232`) recibe la imagen decodificada
entera y **no mira `entity.clipBoundary` en ninguna línea** — lo comprobé con
grep sobre el fichero: `clipBoundary` no aparece. Es decir: recorto el
cajetín, `IMAGECLIP` lo esconde, `VECTORIZE` lo devuelve como polilíneas.
Además `cadRasterDecodeDataUri` + Zhang-Suen + OCR corren **síncronos en el
paso del comando** (`vectorize-raster.ts:312-317`), sin worker, sin barra, sin
cancelar; y `replan` (`vectorize-raster.ts:322-326`) **repite la tubería
entera cada vez que toco `Tolerancia`**, aunque la cabecera prometa «sin
volver a inflar el archivo» (verdad a medias: no se re-infla, pero se
re-adelgaza y se re-reconoce, que es lo caro).
**Por qué duele:** afinar el umbral en un plano real sería un ciclo de
segundos de UI congelada por tecla.

### H-9 · Cero limpieza de dibujo.
**AutoCAD:** `MAPCLEAN` con sus ocho acciones —borrar objetos cortos, romper
objetos que se cruzan, extender subcortes, unir sobrecortes, agrupar nodos
próximos, disolver pseudonodos, borrar duplicados, longitud cero— con vista
previa y marcadores por error.
**Valle hoy:** sólo `OVERKILL` (`lib/cad/overkill.ts`), que es duplicados y
colineales solapados: **una** de las ocho. Está bien hecha —un solo lote de
deshacer, argumentado en la cabecera— pero es una de ocho.
**Por qué duele:** la cartografía del topógrafo llega SIEMPRE con
subcortes y nodos sueltos, y sin `MAPCLEAN` no cierra ningún polígono. Es lo
que impide construir área encima.

### H-10 · Cero topología y cero consulta espacial.
**AutoCAD:** topologías de nodo, red y polígono; superposición, disolución,
áreas de influencia (buffer), análisis de ruta, consulta por localización.
**Valle hoy:** no hay ninguna librería de booleanas de polígono en el árbol
(busqué `clipper`, `martinez`, `buffer`, unión/intersección de polígonos: cero
en `lib/cad`). No hay `MAPTOPO` ni `MAPQUERY`.
**Por qué duele:** «dame la superficie de la parte del predio que cae dentro
de la zona federal» es una pregunta de martes por la mañana, y aquí no se
puede responder.

### H-11 · La cobertura de sistemas de coordenadas es de seis zonas de un país.
**AutoCAD:** biblioteca de miles de definiciones (EPSG, ESRI, state plane,
Lambert, Gauss-Krüger), con transformaciones de datum por rejilla.
**Valle hoy:** `GEO_MEXICO_UTM_ZONES = [11,12,13,14,15,16]`
(`lib/geo/crs.ts:185`) y WGS84 geográfico. Sólo Transverse Mercator, sólo
hemisferio norte, sólo familia WGS84/ITRF. Un shapefile ETRS89/UTM 30N de
España, uno NAD83 de Texas o cualquier Lambert se rechazan
(`crs-prj.ts:94-102,166-171`).
**El rechazo es correcto.** Lo que sobra es el techo: el producto se vende
como CAD general y aquí es un CAD mexicano. Y falta lo que un topógrafo
pregunta siempre: **convergencia de meridianos y factor de escala de la
proyección**, declarados fuera de alcance en `geo-location.ts:22-26`. Sin
ellos, «Norte» en el dibujo es el de cuadrícula y nadie lo rotula.

### H-12 · No hay salida GIS. Lo que entra no vuelve a salir.
**AutoCAD:** `MAPEXPORT` a SHP, SDF, GML, GeoJSON, con mapeo de atributos.
**Valle hoy:** `MAPIMPORT` existe; `MAPEXPORT` no (grep: 0). `ESCALERA.md:247`
lo declara.
**Por qué duele:** el municipio me pide el polígono en `.shp`. Yo se lo mando
en DXF y que se apañe — y sin atributos (H-3).

### H-13 · `TRANSPARENCY`, `IMAGEFRAME` y el ajuste en el PDF.
**AutoCAD:** `TRANSPARENCY` hace transparente el fondo de un bitonal —es lo
que permite que el escaneo no tape la trama de abajo—; `IMAGEFRAME 0` quita el
marco para trazar; el brillo/contraste sí se trazan.
**Valle hoy:** los tres faltan y están declarados
(`ESCALERA.md:264,266,267`): el alfa siempre se honra y no se puede apagar, el
marco siempre se dibuja, y en el PDF **el brillo y el contraste no se aplican**
—jsPDF incrusta los píxeles originales— aunque en pantalla sí. Sólo la
atenuación llega al papel, como opacidad.
**Por qué duele:** lo que veo en pantalla no es lo que sale impreso. El
escaneo que atenué al 70 % para poder calcar encima sale con otro contraste en
la lámina del cliente.

---

## 3. Defectos concretos encontrados leyendo el código

### D-1 · La paleta de propiedades ofrece seis campos editables de la IMAGE que no escriben nada
`apps/web/src/lib/cad/fill-entity-adapters.ts:297-330` y
`apps/web/src/components/cad/palettes/property-model.ts:213-219`.

El adaptador de `image` **lee** `definition`, `pixelWidth`, `pixelHeight`,
`drawnWidth`, `drawnHeight` y `rotation` (líneas 298-305) y su `write`
(línea 312) sólo atiende `insertionX/Y`, `brightness`, `contrast`, `fade`,
`showImage` y `layer`. `READONLY_KEYS` contiene exactamente
`{length, measurement, label, associationStatus, block}` más lo que termine en
`Count`. Ninguna de las seis claves derivadas de la imagen está ahí, así que
`editorKindOf` (línea 250) las pinta como `number`/`text` editables.

Resultado: en la paleta tecleo `drawnWidth = 12500` sobre el escaneo, pulso
Intro, el valor **vuelve solo a lo que estaba** y parece que el producto perdió
mi cambio. Es exactamente el fallo que la cabecera del propio módulo declara
inaceptable: *«Ofrecer un campo editable que no escribe nada es peor que no
ofrecerlo»* (`property-model.ts:204-212`). La regla está escrita y probada
para `LINE.length` y para `INSERT.block`
(`property-model.spec.ts:150-170,208-211`), y a la imagen no se le aplicó.

**Arreglo:** añadir `definition`, `pixelWidth`, `pixelHeight`, `drawnWidth`,
`drawnHeight` a `READONLY_KEYS` (o mejor: que el adaptador declare sus claves
derivadas, para que la lista deje de ser global por nombre — `rotation` SÍ es
escribible en `insert` y no lo es en `image`, y una lista por nombre no sabe
distinguirlas). Y una spec en `property-model.spec.ts` con un sujeto `image`.
**Nota:** `drawnWidth` y `rotation` deberían acabar siendo escribibles de
verdad (es la mitad de H-6); mientras no lo sean, en sólo lectura.

### D-2 · La georreferencia y los atributos GIS se pierden en el DXF sin aparecer en el manifiesto
`apps/web/src/lib/cad/dxf-export-loss-manifest.ts` (los doce `code:` del
fichero) y `apps/web/src/lib/cad/dxf-schema4-primitives.ts:45-49`.

Ningún camino escribe `context.metadata` al DXF —el único XDATA que se emite
es el de MLEADER y el de bloque (`dxf-export.ts:769,805,845`)— y ningún
declarante de pérdidas lo menciona. Un dibujo georreferenciado exportado a DXF
**deja de estarlo**, y sus predios pierden la clave catastral, sin una línea de
aviso. Contradice la garantía de la fila `integrity` («pérdidas nunca
silenciosas»).

**Arreglo mínimo (una tarde):** un declarante `metadata` en
`dxf-export-loss-manifest.ts` que cuente entidades con `context.metadata` no
vacío y emita `severity: "warning"`, con un caso especial `severity: "error"`
para el marcador de georreferencia («el dibujo está georreferenciado en X y el
DXF no lo lleva»).
**Arreglo bueno:** XDATA propia (`VALLE_META`) escrita y releída, como ya se
hace con los bloques en `dxf-block-xdata.ts`.

### D-3 · `VECTORIZE` vectoriza los píxeles que `IMAGECLIP` escondió
`apps/web/src/lib/cad/engine/commands/vectorize-raster.ts:124-232`.

`planCadVectorize` no consulta `entity.clipBoundary` en ninguna línea. Flujo
que rompe: adjunto el escaneo entero, recorto con `ICL` para quedarme sólo con
la planta y quitar el cajetín, `VECTORIZE`, y el cajetín vuelve al dibujo como
polilíneas —incluida su rotulación, ahora como entidades `TEXT`. El plan que
se enseña antes de confirmar tampoco lo advierte.

**Arreglo:** pasar el `clipBoundary` (ya está en píxeles de imagen, que es el
mismo sistema que come `cadRasterVectorize`) como máscara de tinta, y decirlo
en el plan: «recorte activo: se vectorizan N de M píxeles».

### D-4 · La cabecera de `geo-import-plan.ts` promete un `DATAEXTRACTION` que no existe
`apps/web/src/lib/cad/geo-import-plan.ts:28`: *«la clave catastral viaja con
el polígono y DATAEXTRACTION o LIST la leen sin tabla aparte»*.

`LIST` sí (`inquiry/reports.ts:282-285`). `DATAEXTRACTION` **no**: sus cinco
salidas son muros, superficies, carpintería, instalaciones y circuitos
(`engine/commands/data-extraction-commands.ts:45-56`), todas de
`bim-schedule`/`mep-schedule`, y no toca `context.metadata` en ninguna línea.
Es un claim sin evidencia dentro del propio código.

**Arreglo:** o se quita la frase, o —mucho mejor— se añade la salida
`Atributos` a `DATAEXTRACTION`, que es la mitad barata de H-2.

### D-5 · `cadGeoreferenceOf` promete decir que hay más de un marcador y no lo dice
`apps/web/src/lib/cad/georeference.ts:16` (cabecera) frente a
`georeference.ts:49-70` (implementación).

La cabecera: *«Se lee buscándolo; si hay más de uno manda el primero y se
dice»*. La función devuelve en el primer `return` del bucle y no cuenta, no
avisa, no registra. Con dos marcadores —un copiar-pegar entre dibujos, un
`MAPIMPORT` en modo `created` sobre un dibujo cuyo marcador estaba en una capa
apagada— el que manda depende del **orden de las entidades en el documento**,
que no es un criterio que el usuario controle ni vea.

**Arreglo:** contar los marcadores y devolver el recuento; que
`GEOGRAPHICLOCATION Informe` e `ID` lo digan cuando sea > 1.

### D-6 · El texto del criterio `toolset-raster.imagen` cobra por una transparencia que no existe
`docs/competitive/rubric.json`, criterio `toolset-raster.imagen`: *«Insertar,
recortar por polígono y ajustar (brillo/contraste/**transparencia**) un plano
escaneado»* — 2 puntos, concedidos.

Lo construido es brillo, contraste y **atenuación** (`fade`), que en AutoCAD
son las tres de `IMAGEADJUST`. `TRANSPARENCY` es otra orden y hace otra cosa
—hacer transparente el fondo de un bitonal— y el propio `ESCALERA.md:264`
dice que **no existe** («TRANSPARENCY (el canal alfa siempre se honra, no se
puede apagar) e IMAGEFRAME (el marco siempre se dibuja) no existen»). La
rúbrica y la escalera se contradicen, y la que cobra puntos es la rúbrica.

**Arreglo:** cambiar la palabra del criterio a «atenuación». Es un cambio de
texto, no de nota: los 2 puntos los gana lo construido.

### D-7 · `VECTORIZE` es la única fila de 2 pt de los toolsets sin golden de navegador
`docs/competitive/rubric.json`, `toolset-raster.vectorizacion`: la evidencia
son cuatro specs y tres ficheros con `minLines: 400`. Las otras seis filas de
toolset y la propia `toolset-raster.imagen` llevan su golden
(82, 83, 84, 93, 94, 95, 96). No hay ningún `VECTORIZE` en `apps/web/e2e/`
(grep: cero). `ESCALERA.md:531` lo reconoce y lo pone en peldaño 3.
La evidencia con `minLines` es justo el tipo que la nota de corte 2026-08-20
de la propia rúbrica llama error de definición para criterios de ≥2 pt.
No propongo bajar la nota: propongo el golden, que es una tarde
(`83-cad-plano-escaneado.spec.ts` ya deja el PNG adjuntado; sigue con
`VECTORIZE ⏎ · ⏎` y afirma polilíneas y un `TEXT` en el documento del
servidor).

---

## 4. Cómo se construyen los huecos (diseño concreto)

Sólo los que recomiendo de verdad, con módulo, estructura y verificación.

**H-3 / D-2 — XDATA de metadatos (1 día).** `dxf-write-core.ts`: aplicación
`VALLE_META`, un grupo 1000 por par `clave=valor` con troceado a 200 caracteres
(el mismo patrón que ya usa el MLEADER en `dxf-export.ts:783-785`). Lectura
simétrica en `dxf-read-properties.ts`. Declarante nuevo en
`dxf-export-loss-manifest.ts` para lo que no quepa. Verificación: caso en
`dxf-schema4-roundtrip.spec.ts` — georreferenciar, `MAPIMPORT`, exportar,
reimportar, `cadGeoreferenceOf` devuelve el mismo CRS y el mismo `east/north`,
y la `CLAVE` del predio sobrevive.

**H-2 — atributos vivos (2-3 días, en tres trozos independientes).**
· *Filtro:* en `readCadFilterProperty`
(`selection/selection-filter.ts:104-117`), reconocer el prefijo `dato:` →
`entity.context?.metadata?.[nombre]`; en `cadFilterableProperties`, ofrecer las
claves de metadatos presentes en la selección, igual que ya hace con las del
adaptador. Con eso `QSELECT` y `FILTER` funcionan sin tocar el motor de reglas.
· *Campo:* quinta clase en `fields/drawing-fields.ts:42`, `dato`, con
expresión `%<Dato:id.CLAVE>%`. Rotular cien predios pasa a ser un `COPY` del
texto de campo.
· *Tema:* orden `MAPTHEME` que, dada una capa y una clave, reparte colores por
valor o por rango y emite **un lote** de `replace` con
`context.presentation.color`. Nada de campo nuevo en el formato.
Verificación: spec del filtro con dos predios de `USO` distinto; golden que
importa el GeoJSON de `map-import.spec.ts`, teclea `QSELECT`, `Dato:USO`, `=`,
`HABITACIONAL` y afirma la selección.

**H-6 — `IMAGESCALE` / `IMAGEDESKEW` (1 día).** Es `PDFSCALE` con otra
entidad: `engine/commands/pdf-underlay-edit-commands.ts:410-470` ya tiene el
diálogo entero (designar, dos puntos, «cuánto miden DE VERDAD»). Se calca sobre
`image`, escalando `uVector`/`vVector` por el factor; `DESKEW` es lo mismo
girando por el ángulo de los dos puntos contra la horizontal. La entidad ya
admite `transform` (`fill-entity-adapters.ts:324-330`), así que no hace falta
nada nuevo en el formato. Verificación: spec que inserta una imagen a ancho
arbitrario, calibra contra 5000 mm y afirma `drawnWidth`; golden que encadena
`IMAGEATTACH` → `IMAGESCALE` → `DIST`.

**H-5 — decodificar JPEG (varios días) o pedirlo al anfitrión (horas).** La
salida barata y correcta: el navegador YA decodifica el JPEG (el anfitrión lo
hace en `command-line/session-catalogs.ts:157` para saber el tamaño). Ampliar
ese sobre para que, cuando el motor lo pida, el anfitrión devuelva el RGBA por
`<canvas>.getImageData` — mismo reparto motor/anfitrión que ya se usa para
`geo-file` e `image-file`, y `raster-decode.ts` sigue siendo la ruta pura para
las specs en Node. Mientras tanto, **lo urgente es no mentir**: que
`IMAGEATTACH` avise al adjuntar un JPEG de que `VECTORIZE` no lo va a poder
leer. Eso son minutos.

**H-1 — GeoTIFF local con sus claves (varios días).** No es el mapa de teselas
—que está bien dejado fuera— sino leer el TIFF que ya reconoce
(`lib/geo/index.ts`, `detectGeoFormat`): IFD, `ModelTiepointTag`,
`ModelPixelScaleTag`, `GeoKeyDirectoryTag` → EPSG, y de ahí a un
`IMAGEATTACH` que coloca **en sus coordenadas** usando la georreferencia del
dibujo. El deflate ya está (`pdf/pdf-inflate.ts`); falta LZW y el
desempaquetado de tiras/teselas. Verificación: `lib/geo/fixtures.ts:204-243`
**ya sabe fabricar claves GeoTIFF** para las specs — la mitad del andamio
está puesta.

**H-9 — `MAPCLEAN` con las tres acciones que importan (2-3 días).**
Sobre `geom-trim.ts`/`geom-edit.ts`, que ya tienen la intersección de
segmentos: extender subcortes por debajo de una tolerancia, recortar
sobrecortes, agrupar nodos próximos. Mismo patrón que `OVERKILL`: devolver
`CadEntityCommand[]` y **un solo lote**, con el plan a la vista antes de
escribir, como `MAPIMPORT` y `VECTORIZE`. Verificación: corpus con subcortes y
sobrecortes sembrados a distancias conocidas, y el recuento del plan.

---

## 5. La apuesta ganadora

De todo lo mío, si sólo se pudiera construir una cosa: **«dónde estoy», el
calco georreferenciado abierto en el móvil, en la obra, sobre el escaneo.**

El razonamiento. AutoCAD no puede perder contra Valle en topología ni en
conexiones FDO: lleva veinte años y un equipo entero de ventaja, y ese
concurso está perdido. Donde AutoCAD **estructuralmente no puede jugar** es
donde el navegador es el producto:

· El escaneo **ya viaja dentro del documento** (`image-attach-payload.ts:22-33`).
  No hay ruta rota, no hay carpeta de imágenes que se te olvida, no hay
  `IMAGEDEF` apuntando al disco de otro. Ése era el problema clásico de Raster
  Design y aquí está resuelto por diseño, no por parche.
· El dibujo **ya sabe dónde está en el mundo** (`georeference.ts`), y
  `cadGeoreferenceGeographic` **ya convierte un punto del dibujo a latitud y
  longitud** (`georeference.ts:114-118`). Falta el camino inverso, que son
  quince líneas del mismo módulo.
· El navegador **ya sabe dónde estoy**: `navigator.geolocation` es una API del
  cliente, no un servicio externo — no rompe la regla de `ESCALERA.md:251` de
  no llamar a servicios ajenos desde el lienzo.
· Y el producto **ya sabe abrir un dibujo por un enlace** (fila `review` de la
  rúbrica: comentarios y enlaces de revisión).

Junta las cuatro y sale algo que Autodesk no tiene en ningún toolset ni en su
app móvil: **abro el enlace en el teléfono, de pie en el predio, y veo el
plano escaneado del levantamiento antiguo, georreferenciado, con una cruz
donde estoy yo y su precisión declarada en metros.** Camino hasta la esquina
que no cuadra y leo directamente si el lindero del escaneo pasa por donde
está la barda. Sin instalar nada, sin exportar nada, sin Civil 3D, sin señal
de datos si la página ya cargó.

Es barato, y por eso lo propongo: `GEOWHEREAMI` (o mejor, la cruz siempre
visible con un interruptor en la barra de estado) es una petición al
anfitrión —el mismo reparto motor/anfitrión que ya usan `geo-file` e
`image-file`—, `geodeticToUtm` que ya está probada contra cuadraturas
(`crs.ts:401`), la inversa de `cadGeoreferenceWorld`, y una entidad efímera de
visor que no toca el documento. Días, no semanas. Y **hay que dibujar el
círculo de precisión del GPS**, no sólo el punto: un GPS de teléfono da entre
3 y 10 m, y un CAD que finge precisión que no tiene rompe la regla de la casa
igual que un dato NAD27 disfrazado de WGS84.

Y encima cierra el círculo con lo que ya es mejor que AutoCAD: `COGO` levanta
la poligonal del cuaderno de campo, `CUADROCONSTRUCCION` emite las siete
columnas que lee el Registro, `MAPIMPORT` mete el predio catastral, `VECTORIZE`
lee el rótulo del plano viejo, y la cruz en el móvil dice si todo eso coincide
con el mundo. Ése sí es un motivo para dejar la suscripción cara: no porque
Valle tenga más botones, sino porque hace en obra lo que AutoCAD sólo hace en
la oficina.
