# Auditoría Fable · Dimensión 10 — Interoperabilidad

**DWG, DXF, PDF, IFC, nubes de puntos, imágenes, SHX, referencias externas**

Fecha de la revisión: 2026-09-05
Método: lectura del árbol real (`apps/web/src`, `apps/api/src`, `packages/`),
de la rúbrica (`docs/competitive/rubric.json`), de la ESCALERA
(`docs/parity/ESCALERA.md`), del contrato de interoperabilidad
(`docs/interop/CONTRATO-INTEROP.md`) y de las 12 evidencias medidas de
`docs/cad/evidence/` que tocan esta dimensión.
Quien firma: un arquitecto con veinte años de despacho que paga AutoCAD
completo y lo usa entero.

---

## 0. Veredicto en una frase

El aparato de honestidad de este producto —el manifiesto de pérdidas, la matriz
por entidad, la jornada contra dos oráculos ajenos— es mejor que el de AutoCAD;
pero el lunes por la mañana el estructurista me manda `EST-CIM-R3.dwg` y no
puedo abrirlo, y cuando el mismo plano me llega en DXF entra sin sus
presentaciones, sin sus directrices y vuelve engordado en un dialecto más
viejo: no compite todavía.

**Nota contra AutoCAD completo en esta dimensión: 3,5 / 10.**

Desglose de esa nota, porque el promedio esconde lo que importa:

| Frente | Nota | Por qué |
|---|---|---|
| DWG lectura/escritura | 0 / 10 | La bandera está apagada a propósito y el gate exige firmas que no existen |
| DXF (modelo) | 7 / 10 | Genuinamente bueno; medido contra ezdxf y dxf-parser, 0 pérdidas silenciosas |
| DXF (presentaciones) | 0 / 10 | Ni entran ni salen: no hay noción de espacio papel en el formato de intercambio |
| Preservación de lo no entendido | 1 / 10 | El contrato lo promete; el importador DXF nunca escribe `unsupportedEntities` |
| PDF (importar + subyacente) | 6 / 10 | Cadena propia completa y honesta; corpus sintético, sin capas OCG, tope 8 MB |
| Imágenes / raster | 5 / 10 | Se ven en visor, lámina y PDF; viven DENTRO del documento, sin almacén |
| Referencias externas | 3 / 10 | Sólo activos del propio inquilino; el xref del remitente es `unknown_block` |
| Nubes de puntos | 1 / 10 | El lector LAS existe y es bueno; ninguna puerta del producto lo llama |
| IFC / RVT / NWD / DGN / RCP / E57 | 0 / 10 | Nada, y el proyecto lo dice sin fingir |
| Declaración de pérdidas | **10 / 10** | **Mejor que AutoCAD.** AutoCAD no te dice nunca qué tiró |

---

## 1. Lo que ya está construido y está bien

No es poco, y hay que decirlo antes de la lista de agravios, porque el error
más caro en un repositorio de 1.714 ficheros es declarar que falta algo que ya
está.

### 1.1 El lector DXF es de verdad

`apps/web/src/lib/cad/dxf-import.ts` (1.069 líneas) más la familia
`dxf-read-*.ts` leen LINE, LWPOLYLINE con bulge, POLYLINE 2D/3D, CIRCLE, ARC,
ELLIPSE, SPLINE, TEXT, MTEXT con formato, HATCH con islas, DIMENSION con su
bloque `*D`, INSERT anidado con atributos, capas con tipo de línea y grosor.
Está medido, no supuesto:

- `docs/cad/evidence/dxf-corpus-terceros-matrix.json` — **19 archivos reales
  que este proyecto no escribió** (ficheros de prueba de `bjnortier/dxf` y de
  `dxf-parser`, MIT), 35 filas, **cero pérdidas silenciosas**, y dos oráculos
  independientes (`dxf-parser` en CI, `ezdxf 1.4.4` congelado) con **cero
  discrepancias entre ellos** en las 28 filas donde los dos opinan.
- `docs/cad/evidence/jornada-plano-ajeno.json` — la jornada entera sobre
  `floorplan.dxf` (1,1 MB, AC1018, 961 entidades): abrir, medir **3.065
  magnitudes contra ezdxf sobre los mismos bytes** (desviación < 1e-12),
  MOVE/LINE/ERASE con el registro de comandos real, exportar y releer con los
  dos oráculos. Eso no lo tiene casi nadie.
- `docs/cad/evidence/dxf-external-corpus-matrix.json` — 15 dialectos
  sintéticos (AC1009 a AC1032, CRLF, notación científica, códigos con relleno,
  secciones reordenadas, capas en UTF-8): todos legibles.

### 1.2 El manifiesto de pérdidas es la mejor pieza del producto

`apps/web/src/lib/cad/dxf-export-loss-manifest.ts` clasifica trece códigos de
pérdida con severidad, y `Layout3DEditor.tsx:12940-12975` implementa un
**preflight de dos pulsaciones**: un DXF con degradaciones se enseña antes de
descargar; uno que ELIMINA geometría exige aceptación explícita ligada a un
token del documento, la selección y las opciones. AutoCAD no hace nada
parecido: exporta y calla.

En el sentido de entrada, `dxf-import-report.ts` traduce catorce códigos
(`unsupported_entity`, `unknown_block`, `anisotropic_insert`,
`foreign_dimension_detached`, `linetype_complejo`, `layer_table_pruned`,
`entity_in_block_definition`, `flattened_to_ground`,
`dxf_paper_space_excluded`…) a español llano con conteo y capa.

### 1.3 La importación de PDF vectorial existe y es una cadena completa

`apps/web/src/lib/cad/pdf/` son 10.247 líneas de cadena propia: objetos →
páginas → flujo de contenido → curvas → entidades, con su propio `inflate`
(`pdf-inflate.ts`, verificado contra `node:zlib`), fuentes con `ToUnicode`,
XObjects de formulario, MediaBox desplazado, páginas giradas 90°, y flujos de
objetos comprimidos 1.5. Un escaneo se RECHAZA con su motivo y remite a
`PDFATTACH` en vez de devolver un documento vacío
(`pdf-import.ts:76`, código `scanned_image`).
Comandos tecleables: `PDFATTACH`, `PDFIMPORT`, `PDFCLIP`, `PDFADJUST`,
`PDFPAGE`, `PDFSCALE`, `PDFDETACH`, `PDFUNLOAD`, `PDFRELOAD`, `PDFLIST`
(`engine/command-manifest.ts:221-223`,
`engine/commands/pdf-underlay-commands.ts`), con alias en español
(`ADJUNTARPDF`, `IMPORTARPDF`, `RECORTARPDF`), y **snap sobre la geometría del
subyacente** (`pdf/pdf-snap-geometry.ts`, 654 líneas) — que es exactamente lo
que uno hace con el PDF que le manda el cliente.
`docs/cad/evidence/pdf-import-corpus-matrix.json`: 14 archivos, 47 tipos, 27
intactos, 14 degradados, 6 perdidos declarados, **0 perdidos en silencio**.

### 1.4 El rechazo honesto está construido como mecanismo, no como frase

- `components/cad/interop/cad-format-detect.ts` reconoce DWG por el código de
  versión del byte 0, DXF por `SECTION`/`$ACADVER`, glTF binario por su firma,
  COLLADA por su raíz, STL binario por aritmética de tamaño.
- `interop/skp-reject.ts` detecta `.skp` por extensión Y por la cadena
  `SketchUp Model` de la cabecera, y **lanza siempre** con un mensaje que dice
  qué exportar en su lugar. No hay ninguna llamada que «intente» leerlo.
- `lib/geo/index.ts:113` distingue un `.laz` de un `.las` **por el bit 0x80 del
  byte 104**, no por el nombre — precisamente porque renombrar la extensión es
  lo que hace un usuario cuando un programa se queja.
- `dwg-interop-flag.ts` es un modelo de disciplina: cinco autorizaciones
  separadas (AC1015, AC1018, 3D heredado, familia moderna, exportación), cada
  una con su bandera y su firma, y `DWG_IMPORT_FLAG` tipado `boolean` y no
  `false` **para que la spec que lo vigila falle en vez de dejar de compilar**
  si alguien lo cambia a mano. Eso es artesanía.

### 1.5 El laboratorio DWG está mucho más adelantado que el producto

`docs/cad/evidence/dwg-decoder-matrix.json`: **65 tipos decodificados**, 51
verificados independientemente, cinco versiones (AC1015, AC1018, AC1024,
AC1027, AC1032 — la última es el formato de guardado por defecto de AutoCAD
2018-2026), 7 bundles admitidos, 14 validaciones independientes, 71 oráculos.
`dwg-roundtrip.json`: 4 round-trips verificados contra ODA File Converter 27.1.
Y `disponibilidadEnProducto: false`.

### 1.6 Geo, imagen y mallas

- `lib/geo/` lee shapefile completo (`.shp`+`.shx`+`.dbf`+`.prj`+`.cpg`), LAS
  1.0-1.4 sin comprimir (formatos 0,1,2,3,6,7,8) y GeoJSON RFC 7946, sin una
  sola dependencia copyleft, con reproyección UTM 11N-16N y **origen local
  declarado y reversible** — que es la solución correcta al problema de
  precisión de coordenadas grandes, la misma que usa AutoCAD Map.
- `IMAGEATTACH`/`IMAGECLIP`/`IMAGEADJUST` meten el escaneo en el dibujo y lo
  pintan en el visor, en la lámina y en los bytes del PDF
  (`paper-space-image.spec.ts` lee el XObject y el operador `Do` del archivo).
- `lib/cad/interop/` importa OBJ, STL, glTF/GLB y COLLADA con
  `TextDecoder` estricto (rechaza bytes inválidos en vez de sustituirlos).

---

## 2. Los huecos, por lo que más duele

### H-1 · No puedo abrir el `.dwg` que me mandan. Ninguno. (BLOQUEANTE)

**AutoCAD:** DWG es su formato nativo. Abre, edita y guarda R14 a 2018 sin
pensarlo.

**Valle hoy:** `apps/web/src/lib/cad/dwg-interop-flag.ts:38` —
`DWG_IMPORT_FLAG: boolean = false`, y `dwgImportIsEnabled()` exige además siete
gates que están todos en `false`/`0` (`DWG_PROMOTION_GATES`, líneas 72-80).
`document-import-validation.ts:118-124` no admite la extensión salvo por esos
gates. El selector del estudio ofrece `.dwg`
(`Layout3DEditor.tsx:15314`, `accept=".dxf,.dwg"`) y lo único que pasa al
elegirlo es un `toast.error` con `DWG_UNAVAILABLE_REASON`
(`Layout3DEditor.tsx:10417`).

**Por qué duele:** el 100 % del correo de un despacho mexicano es DWG. El
estructurista, el instalador, el proveedor de aluminio y la dependencia mandan
DWG. Pedirle a un tercero «expórtamelo a DXF» es pedirle un favor cada semana,
y la mitad de las veces te manda un DXF R12 que ya perdió las cotas asociativas
y los MTEXT con formato. Este hueco no es «una función menos»: es el motivo por
el que el cambio no ocurre.

**La parte honesta:** esto **no es deuda de ingeniería**. El laboratorio ya lee
65 tipos en cinco versiones con oráculo ODA. Lo que falta es la firma del
titular (ADR de promoción, revisión jurídica, revisión de seguridad del límite
binario). Decir «faltan 60 días de código» sería mentir; faltan tres firmas y
el cableado de conexión, que ya existe.

**Lo que SÍ se puede construir sin esa firma** — y es lo que propongo como
apuesta ganadora, §4: el **acuse de recibo del DWG**. El laboratorio ya
decodifica la cabecera, las tablas de símbolos y el censo de entidades.
Con la bandera de importación cerrada se puede, sin convertir ni dibujar nada,
leer el archivo y responder: «Es un AC1032 de AutoCAD 2018-2026, 4.312
entidades, 38 capas, 3 presentaciones, 6 xrefs colgando de rutas que no me
mandaste, 2 fuentes `.shx` que no tengo». Eso ya es más de lo que cualquier
visor gratuito te dice, y no requiere convertir un solo byte a geometría.

**Verificación:** una spec que corra el censo del laboratorio sobre los 57
fixtures del corpus admitido con `DWG_IMPORT_FLAG=false` y afirme que no se
construye ninguna entidad canónica; un golden que suelte un `.dwg` en el
estudio y lea el acuse del servidor.

---

### H-2 · El espacio papel no entra ni sale: recibo el modelo sin sus láminas y devuelvo las mías sin cajetín (BLOQUEANTE)

**AutoCAD:** las presentaciones son parte del DWG y del DXF. Abres el plano del
estructurista y ahí están sus siete láminas con sus ventanas gráficas a 1:50 y
su cajetín. Le devuelves el archivo y él ve las tuyas.

**Valle hoy, en los dos sentidos:**

- **Entrada.** `apps/web/src/lib/cad/dxf-model-space-scope.ts:59`,
  `scopeDxfImportToModelSpace`, filtra por el código de grupo 67 y **descarta**
  toda entidad de papel, contándolas para declararlas
  (`dxf_paper_space_excluded`). El comentario del propio módulo lo dice: «Este
  módulo NO construye layouts de papel: las entidades de papel se EXCLUYEN».
  Medido: `jornada-plano-ajeno.json` → «El espacio papel: el lector lo excluye
  a propósito y este plano tiene un Layout1 con 3 VIEWPORT».
- **Salida.** `dxf-document-export.ts:132-149` filtra las entidades de los
  `paperSpaces` y emite `dxf_export_paper_space_excluded`. Y
  `apps/web/src/lib/cad/dxf-export.ts` **no tiene sección OBJECTS con objetos
  `LAYOUT`, ni bloque `*Paper_Space`, ni entidad `VIEWPORT`**: las únicas
  tablas que escribe son LTYPE, LAYER, STYLE, DIMSTYLE y APPID
  (`dxf-write-tables.ts:83-187`), y la sección OBJECTS sólo nace si hay
  imágenes o enmascaramientos (`dxf-export.ts:955`).

`ESCALERA.md` lo puntúa **0 de 5** y lo llama «una ola entera».

**Por qué duele:** el trabajo entregable de un despacho ES la lámina. Un
intercambio en el que el modelo viaja y la lámina no es un intercambio a medias
que obliga a rehacer el cajetín, las escalas de ventana y las anotaciones de
papel en cada ida y vuelta. Y el aviso, por honesto que sea, no rehace nada.

**Cómo se construye:**
1. `dxf-export.ts` — emitir la sección `OBJECTS` con el diccionario
   `ACAD_LAYOUT` y un objeto `LAYOUT` (código 100 `AcDbLayout`) por cada
   `document.paperSpaces[i]`, con `$PEXTMIN/$PEXTMAX`, nombre, número de
   pestaña, y su `330` al *Block Record* correspondiente.
2. `dxf-write-tables.ts` — añadir la tabla `BLOCK_RECORD` (hoy no existe), con
   `*Model_Space`, `*Paper_Space` y `*Paper_Space0..n`.
3. `dxf-export.ts` §BLOCKS — un bloque por presentación.
4. Entidades de papel con `67 = 1` y `410 = <nombre de la presentación>`, y la
   entidad `VIEWPORT` (`100 AcDbViewport`) con centro, ancho/alto en papel,
   `40/41` de la vista de modelo, `68` de estado y `69` de id.
5. Simétrico en `dxf-import.ts`: en vez de descartar por el 67, agrupar por
   `410` y construir `document.paperSpaces` — la estructura ya existe en el
   documento canónico (`cad-document.ts`, `paperSpaces: CadPaperSpace[]`), no
   hay campo nuevo que inventar.

**Verificación:** ida y vuelta sobre `floorplan.dxf` afirmando que las 3
`VIEWPORT` de su `Layout1` llegan al documento y vuelven al fichero; ezdxf
abriendo el resultado y contando 3 viewports en `msp`/`psp`; golden que exporte
un dibujo con dos láminas, lo reimporte y compruebe los dos cajetines.

**Esfuerzo:** semanas.

---

### H-3 · Lo que el lector no entiende, lo TIRA — y el contrato de la casa promete lo contrario (ALTA)

**AutoCAD:** una entidad de una vertical que no tienes instalada entra como
objeto proxy: se dibuja, no se edita, y **sale intacta** cuando reenvías el
archivo.

**Valle hoy:** `docs/interop/CONTRATO-INTEROP.md`, garantía 2, dice literal:
«**Lo no entendido se PRESERVA, no se tira.** Entidades desconocidas viajan
opacas (`unsupportedEntities`) y vuelven a salir intactas al reexportar al
mismo formato», y añade que «este contrato no inventa un segundo modelo —
declara el que el DXF propio ya practica».

**El DXF propio no lo practica.** Un grep sobre toda la familia de importación
—`dxf-import.ts`, `dxf-cad-document.ts`, `document-import.ts`,
`engine/commands/interop-dxf.ts`— **no encuentra una sola escritura de
`unsupportedEntities`**. El único módulo que llena esa sección es el puente DWG
(`dwg-document-bridge.ts:340`). En el camino DXF, una entidad no soportada
produce un aviso (`dxf-import.ts:596`, `unsupported_entity`) y **se pierde**.

Lo que se pierde en un plano real, medido: `jornada-plano-ajeno.json` sobre
`floorplan.dxf` declara `unsupported_entity: 9` — **6 LEADER y 3 VIEWPORT** — y
el fichero que devolvemos, releído por los dos oráculos, no trae ni un LEADER.
La matriz de terceros añade la familia completa de lo que muere:
`3DFACE, 3DSOLID, LEADER, MESH, REGION` (`foreign-unsupported-zoo`), y en la
práctica también MLINE, TOLERANCE, ACAD_TABLE, WIPEOUT, ATTDEF suelto, XLINE de
otras disciplinas.

`dxf-export-loss-manifest.ts:353` sí declara `dxf_export_opaque_entity_dropped`
con severidad `error` — pero sobre una sección que en la ruta DXF **siempre
está vacía**. Es un guardia apostado en una puerta por la que nadie pasa.

**Por qué duele:** el flujo es «me llega el plano del estructurista, muevo un
muro, se lo devuelvo». Si sus seis directrices y sus tres sólidos desaparecen
del archivo que le devuelvo, él tiene que rehacerlos y yo pierdo la relación
profesional. El aviso de importación me lo dijo; eso no me exime.

**Cómo se construye:** el trozo de DXF de una entidad no reconocida es una
lista de pares (código, valor) contigua entre dos `0`. `dxf-import.ts` ya
recorre esa lista. Basta con: (a) capturar los pares crudos de la entidad no
mapeada en un `CadOpaqueEntity { id, sourceType, sourceFormat: "dxf",
groupPairs }`; (b) empujarlo a `document.unsupportedEntities` en
`dxf-cad-document.ts`; (c) en `dxf-export.ts`, reemitir esos pares tal cual
cuando el formato de salida sea el mismo del que vinieron, y sólo entonces —
reescribirlos en otro dialecto sería fingir una conversión.
Hay que respetar el tope de entidades y declarar un límite de bytes por entidad
opaca, y hay que decidir el criterio de invalidación: si el usuario mueve todo
el dibujo, las opacas no se mueven con él, así que **una entidad opaca en un
documento trasladado debe declararse como pérdida al exportar**, no salir en el
sitio equivocado.

**Verificación:** ida-vuelta de `foreign-unsupported-zoo` afirmando 3DFACE,
3DSOLID, LEADER, MESH y REGION presentes en el fichero de salida con los mismos
pares; ezdxf contando los cinco; y una spec que afirme que la garantía 2 del
contrato tiene por fin evidencia en la ruta DXF.

**Esfuerzo:** varios días.

---

### H-4 · El API público entrega un DXF R12 mutilado y SIN manifiesto — y es la salida de datos del cliente que dejó de pagar (ALTA)

**AutoCAD:** no aplica (no tiene API web), pero sí aplica la promesa que este
proyecto se hizo a sí mismo.

**Valle hoy:** hay **dos exportadores DXF**, y sólo uno es bueno.

- El del navegador, `lib/cad/dxf-export.ts` (960 líneas), AC1015, con hatch,
  cotas con DIMSTYLE, bloques con atributos, splines, elipses, imágenes,
  XDATA y **preflight con manifiesto de pérdidas**.
- El del servidor, `apps/api/src/modules/cad/cad-dxf-export.ts` (291 líneas),
  que alimenta `GET /v1/cad/documents/{documentId}/export/dxf`
  (`cad.controller.ts:331-352`) y el escritor R12 heredado
  `cad-documents/line-dxf.ts`. Este segundo camino:
  - sólo entiende `line`, `polyline`, `circle`, `arc`, `dim`, `text`, `mtext`
    y «cualquier cosa con una caja x/y/w/h» (`cad-dxf-export.ts:59-76`);
  - **descarta en silencio** hatch, insert/bloques, splines, elipses,
    imágenes, tablas, mleaders, wipeouts, sólidos: no hay una sola línea de
    `loss`, `manifest` ni `warning` en todo el fichero;
  - normaliza los nombres de capa a `[A-Za-z0-9_$-]` y los corta a 31
    caracteres (`layerOf`, líneas 210-215), así que `MURO-DIVISORIO-TABLARROCA
    Ñ` vuelve como `MURO-DIVISORIO-TABLARROCA_`, sin avisar;
  - trunca todo texto a 240 caracteres (`cad-dxf-export.ts:167`), sin avisar;
  - convierte cualquier entidad con caja en un rectángulo «EQUIPO» etiquetado
    con su `type` — es decir, produce **geometría que no estaba en el dibujo**.

Esto viola las dos primeras garantías de `CONTRATO-INTEROP.md` («pérdida
declarada o pérdida prohibida», «el original es sagrado») y el criterio
`integrity.no-silent-loss` de la rúbrica, cuya evidencia mira sólo la ruta web
(`dxf-export-losses.spec.ts`, `plot-host.ts`) y no toca este endpoint.

Y hay un agravante que lo convierte en un problema comercial: la documentación
del propio SDK (`packages/design-sdk/src/generated/design-api.ts:2506`) declara
que ese endpoint es **la regla de oro** — el tenant cuyo entitlement venció
conserva `cad:view` y «`GET .../export/dxf` sigue respondiendo 200» para que
«los datos del usuario nunca queden rehenes de un cobro». El cliente que se va
recibe un fichero R12 sin sus sombreados, sin sus bloques y sin saberlo.

**Cómo se construye:** hay dos caminos y hay que elegir el primero.
(a) Portar `lib/cad/dxf-export.ts` a un paquete compartido (`packages/`
ya existe y `@valle-design/contracts` ya se importa desde el web) y que el
controlador llame al MISMO planificador, devolviendo `{ dxf, losses }`.
(b) Si por peso no se puede, entonces el endpoint debe devolver el manifiesto
de lo que su escritor R12 no representa, y el `README`/OpenAPI debe decir
«R12, geometría básica» en vez de «export/dxf» a secas.
Mientras tanto, mínimo indispensable: emitir `losses` contando por tipo lo que
cae en el `for` sin `continue`, y `x-visibility: internal` en la operación.

**Verificación:** una spec de API que guarde un documento con hatch, insert,
spline y tabla, llame al endpoint y afirme que el manifiesto los nombra;
extender `dxf-export-losses.spec.ts` para que cubra los dos escritores.

**Esfuerzo:** varios días (a) / un día (b).

---

### H-5 · La polilínea del remitente vuelve engordada, en un dialecto más viejo, y no puedo elegir versión (ALTA)

**AutoCAD:** `DXFOUT` te pregunta la versión (R12, 2000, 2004, 2007, 2010,
2013, 2018), texto o binario, y precisión decimal. Y escribe `LWPOLYLINE` desde
R14.

**Valle hoy:**
- `dxf-export.ts:278-279` escribe `$ACADVER = AC1015` fijo. No hay opción.
- `dxf-export.ts:345-354` escribe siempre `POLYLINE` con sus `VERTEX`, nunca
  `LWPOLYLINE`.
- `engine/commands/interop-dxf.ts:400-470` — `DXFOUT` pregunta ámbito
  (todo/designado) y nombre. Ni versión, ni binario, ni precisión.

Medido en `jornada-plano-ajeno.json`, sección `exportar`, con estas dos notas
del propio artefacto: «El plano ajeno es AC1018 (R2004) y sale como AC1015
(R2000)… el fichero devuelto ya no es del dialecto en el que llegó» y «Las 124
LWPOLYLINE del plano ajeno salen como POLYLINE (la pesada, con sus VERTEX)…
ocupa más y es de un dialecto más viejo. El documento canónico no distingue las
dos, así que hoy no hay dónde recordar cuál era».

**Por qué duele:** el intercambio profesional tiene protocolo. El
estructurista te pide «mándamelo en 2013». Le mandas un R2000 con polilíneas
pesadas y su dibujo de 400 KB vuelve de 2 MB con las entidades cambiadas de
tipo. No se rompe nada, pero se nota, y lo que se nota en un intercambio es la
diferencia entre un proveedor serio y uno raro.

**Cómo se construye:** un campo `flavor: "lwpolyline" | "polyline"` en la
entidad canónica de polilínea (o, sin tocar el formato persistido, un
`exportHint` en el manifiesto de importación que el exportador consulte);
`planCadDxfExport(options.version)` con las cinco cabeceras y las diferencias
reales por versión (ELLIPSE y LWPOLYLINE no existen en AC1009 — el manifiesto
ya sabe declararlo); y una fase más en `DXFOUT` con palabra clave
`Versión` y opciones `R12/2000/2004/2007/2010/2013/2018`.

**Verificación:** matriz de export por versión leída por ezdxf; la spec de la
jornada exigiendo que `floorplan.dxf` (AC1018) salga AC1018 y con 124
`LWPOLYLINE`, no 124 `POLYLINE`.

**Esfuerzo:** varios días.

---

### H-6 · `ETRANSMIT` empaqueta un `.json` que sólo abre Valle Design (ALTA)

**AutoCAD:** `ETRANSMIT` produce un ZIP o carpeta con el DWG, sus xrefs
(opcionalmente enlazadas), las fuentes SHX/TTF usadas, las tablas de plumas
`.ctb`, el conjunto de planos y un informe. Se lo mandas a cualquiera.

**Valle hoy:** `apps/web/src/lib/cad/etransmit/etransmit.ts:144` —
`const documentFileName = \`${sanitize(input.documentName)}.json\`` y
`zipEntries.push({ path: documentFileName, bytes: JSON.stringify(document) })`.
El paquete lleva el documento canónico, `manifiesto.json`, `REVISION.txt` y
—cuando el anfitrión resolvió sus bytes— las xrefs e imágenes. **No lleva DXF,
no lleva PDF, no lleva fuentes ni tabla de plumas.**

El manifiesto es excelente (declara por nombre lo que no pudo empaquetar y por
qué), y el golden 88 lo afirma sobre los bytes del ZIP. Pero el destinatario del
paquete es alguien que no tiene Valle Design: si abre el ZIP encuentra un JSON
que no sabe qué es.

**Por qué duele:** el paquete de entrega es el producto final del despacho. El
viernes a las seis mandas la entrega a la constructora y a la DRO. Si dentro va
un `.json`, te llaman el lunes.

**Cómo se construye:** `buildCadTransmittalPackage` ya recibe el documento;
añadir dos entradas más al ZIP —`<nombre>.dxf` desde `planCadDxfExport` con su
manifiesto, y `<nombre>.pdf` desde `buildCadPublishPlan` para las
presentaciones marcadas— y una carpeta `fuentes/` con las Hershey que se
usaron, más el `.ctb` activo desde `CadPlotStyleCatalog`. El manifiesto ya tiene
la forma para declarar cada uno con su `included`/`reason`.

**Verificación:** extender `etransmit.spec.ts` para leer el `.dxf` del ZIP con
`dxf-parser` y contar las entidades; golden 88 afirmando tres entradas y no una.

**Esfuerzo:** varios días.

---

### H-7 · Las referencias externas sólo apuntan a activos de mi propio inquilino (ALTA)

**AutoCAD:** `XATTACH` toma un archivo del disco o de la red, guarda rutas
relativa y absoluta, y `XREF` te lista lo que hay colgando con su estado.

**Valle hoy:** `lib/cad/xref/xref-paths.ts` implementa las tres estrategias de
resolución (relativa → absoluta → búsqueda por nombre) muy bien, y declara
cuál se usó y qué se intentó — mejor que la caja negra de AutoCAD. Pero
resuelve sobre `CadXrefCatalogEntry` con `uri` = `tenant-layout://<assetId>/<revision>`:
**sólo dibujos que ya viven dentro de este inquilino**. `xref-host.ts` habla de
«traer el activo del inquilino» y no tiene otra puerta.

Consecuencias medidas: en el corpus de terceros, `arch-xref-attach` (un BLOCK
con la bandera de xref, código 70 bit 4) importa con aviso `unknown_block` —
es decir, el bloque referenciado por el remitente **no se resuelve y no se
dibuja**. Y `ESCALERA.md:339` declara que ni siquiera hay catálogo en el motor:
«`?` no puede listar los dibujos disponibles y pide que se escriba el activo».

**Por qué duele:** un proyecto de despacho es EJES-BASE + ARQ + EST + INST,
cuatro archivos que se referencian entre sí. Si lo que me llega por correo son
cuatro DWG con xrefs relativas y aquí sólo puedo referenciar lo que ya subí, el
proyecto no se reconstruye: se aplasta en un solo dibujo y se pierde la razón
de ser de las xrefs.

**Cómo se construye:** (1) publicar `context.xrefCatalog` desde el estudio —
está identificado como `P1-8`/`P0-4` en el BACKLOG y es una línea desde el
monolito; (2) una ruta de **ingesta**: al importar un conjunto de ficheros,
crear un activo por cada uno y traducir las rutas del DXF (`XREF path`, código
1 del BLOCK de xref) a `relativePath` del catálogo, para que la resolución por
ruta relativa que ya está escrita tenga algo sobre lo que trabajar; (3)
`XREF ?` listando.

**Verificación:** golden que suba `ARQ.dxf` + `EJES.dxf` juntos y afirme que el
INSERT de xref de `ARQ` resuelve a `EJES` con `via: "relative"`; spec de
`xref-paths` sobre las rutas que escribe un DXF real.

**Esfuerzo:** varios días.

---

### H-8 · Ninguna `.shx` se interpreta: mi cajetín cambia de anchura (MEDIA)

**AutoCAD:** interpreta el formato `.shx` (fuente de formas compilada) y dibuja
`txt`, `romans`, `isocp`, `gdt`, `ltypeshp` con sus métricas exactas.

**Valle hoy:** `lib/cad/mtext-fonts.ts:33-46` lo declara sin adornos:
«**Ninguna `.shx` se INTERPRETA.**» Las cinco más comunes —txt, simplex,
romans, isocp, monotxt— se sustituyen por su familia **Hershey** (dominio
público) y se dibujan como trazos en visor, lámina y PDF
(`fonts/hershey-fonts.ts`, `plot-shx-pdf.spec.ts` mide 69 segmentos de camino
en los bytes del PDF, 0 avisos de sustitución). Es un trabajo excelente. Pero
`metricsDiffer: true` viaja declarado rótulo a rótulo, y las demás `.shx`
—`gdt.shx`, `ltypeshp.shx`, las de estudio— salen `substituted` o
`symbols-lost`.

**Por qué duele:** el cajetín del despacho está calculado al milímetro con
`ROMANS.shx` a 2,5 mm. Si las anchuras cambian, «PROYECTO ARQUITECTÓNICO
EJECUTIVO» deja de caber en su casilla, y eso se ve impreso. Además, las formas
de tipo de línea (`ltypeshp.shx`: FENCELINE, TRACKS, BATTING) desaparecen de
los ejes y los muros de un plano ajeno.

**Cómo se construye:** el intérprete `.shx` es acotado y conocido: cabecera
`AutoCAD-86 shapes 1.1`, tabla de índices, y un bytecode de ~15 opcodes
(pen up/down, vector corto empaquetado en un byte, vector largo, arcos octantes
y fraccionarios, subshape, escala push/pop). Cabe en un módulo
`lib/cad/fonts/shx-interpreter.ts` de unas 600 líneas, consumiendo el mismo
contrato `strokeFamily` que ya usan las Hershey — **sin tocar nada aguas
abajo**. El fichero `.shx` lo aporta el usuario por el mismo canal de
`pickCadFiles` que ya carga los `.lin` y los `.ctb`
(`components/cad/command-line/session-catalogs.ts:197-204`), con su límite de
bytes y su declaración de licencia («la fuente la aporta el despacho, no la
distribuimos»).

**Verificación:** una spec que, con una `.shx` de dominio público, compare la
anchura de una cadena contra la del binario, y `plot-shx-pdf.spec.ts` afirmando
que ya no se emite `metricsDiffer`.

**Esfuerzo:** semanas.

---

### H-9 · La nube de puntos se lee de maravilla y no entra al plano (MEDIA)

**AutoCAD:** `POINTCLOUDATTACH` con RCP/RCS (y conversión desde LAS/E57/PTS con
ReCap), recorte, secciones, y snap sobre los puntos.

**Valle hoy:** `lib/geo/las.ts` lee LAS 1.0-1.4 completo y `lib/geo/point-index.ts`
indexa millones de puntos con presupuesto de bytes por punto medido
(`docs/cad/evidence/point-cloud-scale.json`: 4 millones de puntos, 4,5
bytes/punto). Y **ninguna puerta del producto lo llama**:
`document-import-validation.ts:118-124` no admite `.las` en `admitted`;
`isBinaryImportFormat` (línea 78) no lo incluye; el manifiesto de comandos no
tiene `POINTCLOUDATTACH`; `ESCALERA.md:247` lo dice: «Un LAS se lee pero no
entra al plano (sigue siendo así, y se dice)». LAZ, RCP y E57 no existen.

**Por qué duele:** el levantamiento con escáner es hoy el punto de partida de
casi toda remodelación y de todo peritaje. Llega en `.rcp` o en `.e57`, a veces
en `.las`. Si no entra, ese encargo entero se queda en AutoCAD.

**Cómo se construye:** entidad canónica `pointcloud` que guarde referencia
(nunca los puntos: son gigas), origen local declarado —el mecanismo ya existe
en `lib/geo`— y caja envolvente; un `POINTCLOUDATTACH` que pida el `.las` por
el selector, lo indexe en un worker y lo dibuje como nube decimada por LOD con
el mismo pipeline por lotes que ya pinta las imágenes
(`render/image-layer-three.ts` como plantilla); snap a punto sobre el índice
que ya está escrito.
E57 es un formato abierto (ASTM E2807) con cabecera XML: es el siguiente
razonable. RCP es propietario de Autodesk y **debe declararse «no» como se
declara `.skp`**, no dejarse en silencio.

**Verificación:** golden que adjunte un `.las` de 1 M de puntos y afirme la caja
envolvente en el documento del servidor y el conteo de puntos dibujados; spec
que rechace `.rcp` y `.e57` por nombre con su motivo, hasta que lleguen.

**Esfuerzo:** semanas.

---

### H-10 · El PDF importado pierde las capas del emisor, los rellenos y los degradados (MEDIA)

**AutoCAD 2017+:** `PDFIMPORT` trae capas del PDF como capas del dibujo,
rellenos sólidos como sombreados, y reconoce texto SHX.

**Valle hoy**, medido en `pdf-import-corpus-matrix.json`:
- `OCG_LAYER_OFF` → `perdido_declarado`: un PDF con capas opcionales pierde las
  apagadas, y las encendidas **no se convierten en capas del dibujo**: todo cae
  en una sola. (`optional-content-groups`: 2 de 3 trazos.)
- `PATH_FILL` → degradado «el CONTORNO de la zona rellena, sin nada dentro: hay
  que rehacer el relleno con un sombreado».
- `SHADING` → `perdido_declarado`.
- `TEXT_GLYPH_INDICES` → `perdido_declarado`: el texto de un PDF sin `ToUnicode`
  no se puede leer (correcto, pero es la mitad de los PDF que salen de un CAD
  con fuentes subconjuntadas).
- `PATH_CURVE` → degradado a polilínea con desviación medida de 0,035 unidades
  en modo `polyline`; exacto en modo `spline`.
- El corpus es **sintético**: 14 ficheros construidos byte a byte por
  `pdf/pdf-corpus.ts`, y el artefacto lo dice él mismo: «Imitar una forma NO es
  haberla recibido».
- `CAD_PDF_ATTACH_MAX_BYTES = 8_000_000` (`pdf/pdf-attach-payload.ts:46`) y el
  PDF viaja **dentro del documento** como `data:` — ver H-11.
- No hay ningún golden de Playwright para PDF (`e2e/golden/` no tiene ninguno):
  los 420 + 431 casos son unitarios.

**Cómo se construye:** (1) leer el árbol `/OCProperties` → `/OCGs` que
`pdf-objects.ts` ya sabe recorrer y colgar cada `BDC /OC` del flujo de
contenido en una capa `PDF-<nombre>`; (2) los operadores `f`/`f*`/`B` ya se
detectan (por eso se emite el degradado): convertirlos en un `hatch` sólido con
el camino como contorno en vez de sólo el contorno; (3) un golden que suelte un
PDF real en el estudio.

**Esfuerzo:** varios días.

---

### H-11 · Todo lo adjunto vive DENTRO del documento: no hay almacén de activos (MEDIA)

**AutoCAD:** la imagen, el PDF y la xref son referencias a ficheros. El DWG pesa
lo que pesa el dibujo.

**Valle hoy:** `IMAGEATTACH` mete la imagen como `data:` hasta 8 MB
(`image-attach-payload.ts:28`) y `PDFATTACH` igual
(`pdf/pdf-attach-payload.ts:46`). `ESCALERA.md:263` lo declara: «Sin almacén de
activos ni API: la imagen pesa en el documento (base64, ×1,33) y el tope es 8 MB
por archivo; un `asset://` sigue sin resolverse».

La aritmética preocupa: 8 MB de escaneo son **10,7 MB en base64** dentro de un
JSON cuyo tope inline en el API es `maxInlineBytes: 8_000_000`
(`packages/contracts/src/design-contracts.ts:194`) y cuyo archivo comprimido
tope es 32 MiB (`maxArchiveBytes`). Dos escaneos y el cajetín, y el documento
deja de guardarse; y cada versión CAS reescribe esos megas enteros.

**Por qué duele:** el flujo real es «el cliente me manda 12 fotos del predio y
el levantamiento escaneado». En AutoCAD eso son referencias. Aquí es el peso
del dibujo, multiplicado por cada guardado.

**Cómo se construye:** un `POST /v1/cad/assets` con multipart, un `assetId`
opaco, y `asset://<id>` resoluble desde el visor (`image-layer-three.ts` ya
tiene la rama que se salta los `asset://`), desde la lámina y desde
`ETRANSMIT` (`resolvedAssets` ya es el parámetro previsto). El documento guarda
la referencia y el hash; los bytes viven fuera.

**Verificación:** guardar un documento con tres imágenes de 8 MB y afirmar que
el `cadDocument` pesa kilobytes; spec de `etransmit` empaquetando los bytes
resueltos.

**Esfuerzo:** semanas.

---

### H-12 · La Z se aplasta: el plano inclinado del remitente cambia de sitio (MEDIA)

**AutoCAD:** una entidad con extrusión (`210`) distinta de ±Z se dibuja en su
plano; un SCU guardado la devuelve a su sitio.

**Valle hoy:** `flattened_to_ground` — las entidades fuera del plano del suelo
«entran aplanadas contra el suelo: cambian de sitio». Medido en
`bjnortier-dxf/splines` (2 SPLINE degradadas) y declarado en `ESCALERA.md:177`
con puntuación **0**: «Que la entidad canónica guarde su normal y el visor la
dibuje. **Todavía no.**»

**Por qué duele:** un alzado o una sección que el estructurista dibujó en un SCU
girado entra tumbado sobre la planta, encima del resto del dibujo. No es una
pérdida sutil: es geometría en el sitio equivocado, y el aviso no la mueve.

**Cómo se construye:** `normal?: CadVec3` en la entidad canónica (campo
aditivo, migración por `cad-document-migrate.ts`, que ya tiene el mecanismo);
`entity-three.ts` aplicando la matriz de rotación del SCU de entidad; el
exportador reescribiendo el `210`. El importador ya lee el 210 — sólo lo usa
para decidir el aplanado.

**Esfuerzo:** varios días.

---

### H-13 · No hay IFC, RVT, NWD, DGN ni SAT/STEP — y de los cinco, el que falta de verdad es DGN (BAJA)

**AutoCAD completo:** importa/exporta DGN (V7 y V8), adjunta DGN como
subyacente, importa 3DS/SAT/STEP/IGES/JT/Rhino/Inventor/SolidWorks, enlaza
Navisworks e IFC (via toolsets y Design Review).

**Valle hoy:** nada de eso, y **se dice sin fingir**:
`lib/cad/verification/oraculos-externos-registro.ts:201-213` declara que «ningún
superficie del producto emite ni consume IFC» y que un oráculo IFC «no es un
pendiente, es una confusión de alcance», con `bim-claim-boundary.spec.ts` como
gate que lo sostiene. Eso es exactamente la cultura de la casa y merece
respeto.

**Por qué el que duele es DGN y no IFC:** en México, obra pública, CFE, SCT y
buena parte de la infraestructura entregan en MicroStation. Un despacho que
toca infraestructura recibe `.dgn` varias veces al año. IFC, en cambio, es BIM
y este producto declara que no es BIM: es coherente dejarlo fuera.

**Cómo se construye (DGN V8, sólo lectura como subyacente):** V8 es un
contenedor OLE2/CFB con elementos de tamaño fijo; leer las líneas, arcos, texto
y celdas para pintarlos como **subyacente** —no como geometría editable— entra
en el mismo patrón que el subyacente PDF que ya existe (`pdf-underlay.ts`, 690
líneas, con recorte, ajuste y snap). Sería `DGNATTACH`.

**Esfuerzo:** semanas.

---

### H-14 · Los selectores de archivo ofrecen menos formatos de los que el validador acepta (BAJA)

**Valle hoy:** `document-import-validation.ts:118-124` admite `.dxf`, `.json`,
`.shp`, `.geojson`, `.obj`, `.stl`, `.gltf`, `.glb`, `.dae` y (con gate)
`.dwg`, y su mensaje de error los enumera. Pero:

- `apps/web/src/app/dashboard/page.tsx:691-693` —
  `accept=".dxf,.json,.shp,.shx,.dbf,.prj,.cpg,.obj,.stl,.gltf,.glb,.dae"`:
  **falta `.geojson`**.
- `apps/web/src/app/dashboard/FirstMinute.tsx:156` —
  `accept=".dxf,.json,.shp,.shx,.dbf,.prj,.cpg"`: **faltan `.geojson` y los
  cuatro formatos de malla**. Y éste es el panel del **primer minuto**, la
  pantalla vacía que ve un usuario nuevo.

El usuario que llega con `predio.geojson` del catastro abre el diálogo del
sistema y su fichero sale gris. No es un error grave; es la clase de detalle
que hace que alguien decida que el producto «todavía no está».

**Cómo se construye:** una constante compartida
`DOCUMENT_IMPORT_ACCEPT` derivada del mismo sitio que `admitted`, consumida por
los dos selectores, con la variante DWG resuelta por la bandera.
**Verificación:** una spec que compare el `accept` de los dos selectores contra
la lista de `admitted` y falle si divergen.

**Esfuerzo:** horas.

---

### H-15 · Ningún fichero del corpus lo guardó AutoCAD (ALTA, y es meta)

Los 19 ficheros de terceros son de dos bibliotecas JavaScript
(`docs/cad/corpus/manifest.json`) y el propio manifiesto lo declara: «Que estos
archivos los guardó AutoCAD… **no se afirma**». Los oráculos son `dxf-parser` y
`ezdxf`; ninguno es AutoCAD. La firma humana del dictamen de derechos está
vacía (`firmadoPor: ""`). `ESCALERA.md:343` lo puntúa 3 de 5 y dice que el
peldaño 4 es **decisión del titular**.

**Por qué duele:** todo lo bueno de §1 acredita interoperabilidad con dos
implementaciones libres, no compatibilidad con AutoCAD. Y compatibilidad con
AutoCAD es literalmente lo que se vende. Un solo DXF guardado por AutoCAD 2024
—con su `$HANDSEED`, sus handles, sus `AcDbEntity` en todas partes, su
`ACAD_TABLE`, sus `MULTILEADER` y sus estilos anotativos— probablemente destape
media docena de defectos como los cuatro que la jornada acaba de destapar.

**Cómo se construye:** no es código. Es (a) la firma del dictamen de derechos
que ya está hasheado; (b) conseguir permiso de redistribución de tres o cuatro
planos reales, o generarlos con una licencia de AutoCAD propia y publicar el
procedimiento; (c) volver a correr `dxf-fidelidad-terceros.spec.ts`.

**Esfuerzo:** un día de trabajo técnico, semanas de gestión.

---

## 3. Defectos concretos encontrados leyendo el código

### D-1 · `MLEADER` se exporta con nombre de entidad no estándar y sin marcador de subclase — el mismo defecto que P-evidencia-07 acaba de arreglar en MTEXT y HATCH

`apps/web/src/lib/cad/dxf-export.ts:749-752`:

```ts
pushPair(lines, 0, "MLEADER");
pushPair(lines, 8, layer);
pushPair(lines, 100, "AcDbMLeader");
```

Dos problemas:

1. **El nombre.** En DXF la entidad se llama `MULTILEADER`, no `MLEADER`
   (`MLEADERSTYLE` es el objeto de estilo). Un lector estricto no la reconoce.
2. **Falta `100 AcDbEntity`** antes del `8`. Es exactamente el defecto que la
   ola del 2026-09-05 arregló para MTEXT (`dxf-export.ts:485-493`, con un
   comentario de siete líneas explicando que sin él **ezdxf no abre el fichero
   entero, ni en modo recover**) y para HATCH
   (`dxf-export-hatch.ts:38-43`). El MLEADER quedó fuera del arreglo porque
   ninguno de los 19 ficheros del corpus de terceros trae uno, así que el
   oráculo nunca lo vio.

Además no se emite `MLEADERSTYLE` en OBJECTS ni el `340` que lo apunta, y el
`CONTEXT_DATA` está incompleto (faltan `10/20/30` del punto de la flecha,
`11/21/31` de la dirección, `290`, `291`, `271`).

**Escenario de fallo:** dibujo con una directriz múltiple → `DXFOUT` → el
fichero se manda al estructurista → ezdxf/AutoCAD encuentran una entidad
`MLEADER` desconocida sin `AcDbEntity`; en el mejor caso la ignoran, en el peor
—que es el que se midió con MTEXT— rechazan el fichero completo. El manifiesto
de pérdidas **no lo declara**, porque el exportador cree que la escribió
(`dxf-export.ts:940`, `if (pushMleader(...)) entityCount += 1`).

**Arreglo:** emitir `0 MULTILEADER`, `100 AcDbEntity`, `8 <capa>`,
`100 AcDbMLeader`; escribir `MLEADERSTYLE` en OBJECTS; y —hasta que el
`CONTEXT_DATA` esté completo— declarar la degradación en el manifiesto. Añadir
un MLEADER al corpus sintético de `dxf-external-corpus.ts` para que el oráculo
lo vea.

---

### D-2 · El exportador DXF del API pierde en silencio y viola el contrato de interoperabilidad

`apps/api/src/modules/cad/cad-dxf-export.ts:55-170`. Ver H-4. En una sola
frase: el bucle recorre las entidades, atiende siete formas y **cae al final del
bucle sin `else`** para todo lo demás — hatch, insert, spline, ellipse, image,
table, mleader, wipeout, solid3d—, sin contar, sin avisar y sin manifiesto. El
fichero entero no contiene las cadenas `loss`, `manifest` ni `warning`.

**Escenario de fallo:** un tenant cuya suscripción venció ejerce «la regla de
oro» y llama `GET /v1/cad/documents/{id}/export/dxf` para llevarse sus datos.
Recibe 200 y un R12 sin sus sombreados, sin sus bloques y con los nombres de
capa acentuados mutilados (`layerOf`, línea 213: `replace(/[^A-Za-z0-9_$-]+/g, '_')`).
Cree que se llevó su trabajo.

---

### D-3 · `boxOf` convierte cualquier entidad con caja en un rectángulo «EQUIPO» — geometría inventada

`apps/api/src/modules/cad/cad-dxf-export.ts:59-76` y `251-261`. La comprobación
`boxOf(entity)` va **antes** que cualquier discriminación por `type`: toda
entidad que traiga `x`, `y`, `w`, `h` finitos y positivos —una imagen, un
wipeout, una tabla, una celda— sale como un rectángulo etiquetado con su
`type`. No es una pérdida: es una **adición**. El DXF resultante contiene
geometría que el dibujo no tenía.

**Arreglo:** discriminar por `type` primero y reservar `boxOf` para los tipos
del layout heredado que lo esperan.

---

### D-4 · `onDxfFile` decodifica un binario como UTF-8 y comprueba el tamaño después de leerlo entero

`apps/web/src/components/cad/editor/Layout3DEditor.tsx:10408-10410`:

```ts
const text = await file.text();
if (text.length > 12_000_000) { toast.error("El DXF supera 12 MB."); return; }
const fmt = detectCadFormat(text);
```

Tres cosas mal, en un selector cuyo `accept` es `".dxf,.dwg"`
(línea 15314), es decir **que invita a elegir un binario**:

1. `File.text()` sobre un DWG decodifica como UTF-8 y sustituye cada byte
   inválido — exactamente el error que `document-import-validation.ts:70-80`
   documenta con esmero para el shapefile («lo que llega al lector ya no son los
   bytes del archivo»). Aquí sobrevive por casualidad: la firma `AC10xx` es
   ASCII. Un DWG con una firma exótica o un fichero cuyo primer byte no sea
   ASCII se clasificaría mal.
2. El tope se comprueba **después** de materializar el fichero entero en
   memoria como cadena. Un `.dwg` de 300 MB se decodifica completo antes de que
   nadie diga que es demasiado grande — en el hilo principal, con la pestaña
   congelada.
3. `text.length` son **unidades UTF-16, no bytes**. `MAX_DXF_IMPORT_BYTES` es
   12.000.000 **bytes** (`document-import-validation.ts:26`). Un DXF con capas
   acentuadas y MTEXT en español pasa este filtro estando por encima del límite
   real, y viceversa. Dos topes con el mismo número y distinta unidad.

**Arreglo:** comprobar `file.size` antes de leer; leer `await file.arrayBuffer()`
y pasar el `Uint8Array` a `detectCadFormat` (que ya acepta `Uint8Array`);
decodificar a texto sólo cuando el formato resultó ser `dxf`; y reutilizar
`validateImportFile` en vez de un tope propio.

---

### D-5 · Los `accept` de los dos selectores de importación divergen del validador

`apps/web/src/app/dashboard/FirstMinute.tsx:156` y
`apps/web/src/app/dashboard/page.tsx:691-693`. Ver H-14. El mensaje de error de
`validateImportFile` promete GeoJSON y mallas; el diálogo del sistema no las
deja elegir. En `FirstMinute` —la pantalla del primer minuto— faltan cinco de
los nueve formatos admitidos.

---

### D-6 · El manifiesto de pérdidas de entidades opacas vigila una sección que la ruta DXF nunca llena

`apps/web/src/lib/cad/dxf-export-loss-manifest.ts:344-361`. El comentario dice
«Es la pérdida más traicionera de todas —el usuario cree que están porque las
importó— y hasta ahora no la declaraba nadie». Correcto, pero el importador DXF
nunca escribe en `document.unsupportedEntities` (ver H-3), así que este bucle
sólo se ejecuta para documentos que vinieron del puente DWG —que está apagado—
o de una spec. Es un guardia en una puerta tapiada. No es un bug de este
fichero; es la mitad visible de que la garantía 2 del contrato no está
implementada en el adaptador de referencia.

---

## 4. La apuesta ganadora: **el acuse de recibo del plano ajeno, en un enlace**

No la que falta: la que gana.

### El problema real, contado como pasa

El estructurista me manda `EST-CIM-R3.dwg` un jueves a las once de la noche. El
viernes lo abro en AutoCAD y AutoCAD **no me dice nada**: abre, y ya. No me dice
que faltan dos xrefs. No me dice que la fuente `ARCHITXT.shx` no está y que
sustituyó anchuras. No me dice que hay 34 líneas que no cierran por 0,9 mm ni
que hay 378 entidades en la capa `Defpoints`. Lo descubro el martes, cuando el
sombreado no cierra y la superficie sale mal. Y cuando le escribo, discutimos
sobre qué mandó él y qué recibí yo, sin ninguna prueba.

Esa conversación —«¿qué me mandaste exactamente?»— ocurre en todos los
despachos del mundo, todas las semanas, y AutoCAD no la resuelve porque
**AutoCAD no tiene URL**. No hay forma de que el estructurista, que no va a
instalar nada, vea lo que yo veo.

### Lo que Valle Design puede hacer y AutoCAD no

Un enlace. Suelto el fichero —DWG, DXF o PDF— y sale una **página pública de
recepción**, sin instalar nada, que el remitente abre desde su teléfono:

> **EST-CIM-R3.dwg** · recibido el 5 de septiembre, 23:14 · sha256 `a3f9…`
> AutoCAD 2018-2026 (AC1032) · 4.312 entidades · 38 capas · 3 presentaciones
>
> **Lo que entra íntegro:** 2.104 LINE, 612 LWPOLYLINE, 63 DIMENSION (medidas
> comprobadas contra ezdxf: desviación < 1e-12), 13 HATCH, 89 TEXT.
> **Lo que entra degradado:** 63 cotas entran vivas pero desligadas (el archivo
> asocia por identificador y aquí se recalculan). 2 SPLINE venían fuera del
> plano del suelo y entran aplanadas.
> **Lo que NO puedo leer, y te lo digo por su nombre:** 6 LEADER · 3 VIEWPORT ·
> 1 tabla ACAD_TABLE.
> **Lo que no me mandaste:** `EJES-BASE.dwg` y `TOPO.dwg`, referenciadas desde
> este archivo. La fuente `ARCHITXT.shx`.
> **Lo que ya está mal en tu archivo, y no es culpa de nadie:** 34 tramos del
> perímetro del eje 4 no cierran; el mayor hueco es de 0,92 mm. Con la
> tolerancia puesta a 1 mm, el área cierra en 92.840.000 mm².
>
> *Medido con dos lectores independientes que este producto no escribió.*

Ese informe **ya está construido, casi entero, y disperso**:
`dxf-import-report.ts` (14 códigos en español), `dxf-corpus-terceros-matrix.json`
(la forma de la matriz por entidad), `terceros-jornada.spec.ts` (la medición
contra dos oráculos), `prueba-de-despacho.spec.ts` (`HPGAPTOL`, la costura de
los 34 tramos), `mtext-fonts.ts` (el informe de fuentes con
`metricsDiffer`), `xref-paths.ts` (`attempts`, qué se buscó y con qué),
`cad-review-link.controller.ts` + golden 56 (el enlace de revisión para
invitados que ya funciona). Lo que falta es **juntarlos en una página y
publicarla**.

### Por qué esto gana, y no otra cosa

1. **Convierte la debilidad en la ventaja.** Hoy el argumento contrario es «no
   lee DWG». El acuse de recibo funciona **con la bandera de importación
   cerrada**: el laboratorio ya decodifica cabecera, tablas de símbolos y censo
   de entidades en cinco versiones con oráculo ODA. Censar no es convertir.
   El día que la firma llegue, la misma página gana un botón «abrir».
2. **AutoCAD estructuralmente no puede hacerlo.** Es de escritorio. No tiene
   enlace que mandar, y el remitente no tiene licencia. Ni Autodesk Viewer ni
   Trimble Connect hacen esto: enseñan el dibujo, no el **diagnóstico del
   intercambio**.
3. **Es viral por su forma.** El acuse lo abre el estructurista, que no es
   cliente. Y lo que lee es útil para él: le estás diciendo que sus 34 tramos no
   cierran. La siguiente vez que mande un plano, va a querer el enlace.
4. **Es lo único de esta dimensión que ya está construido al 70 %.** Todas las
   demás apuestas de esta lista cuestan semanas de código nuevo. Ésta cuesta un
   agregador, una página y un endpoint público de sólo lectura.
5. **Es fiel a la cultura de la casa.** El producto ya prefiere decir la verdad
   sobre lo que pierde antes que fingir. Esta apuesta consiste en **cobrar por
   esa virtud** en vez de pagarla.

### Cómo se construye, concreto

- **Módulo:** `lib/cad/interop/acuse-de-recibo.ts` — puro, sin DOM. Entrada:
  bytes + nombre. Salida: `AcuseDeRecibo { identidad, censo, integro[],
  degradado[], noLegible[], faltante[], defectosDelArchivo[], oraculos[] }`.
  Un `CadFormatAdapter` por formato, exactamente como manda
  `CONTRATO-INTEROP.md` — el acuse es el `read()` del contrato **sin el
  `normalizar`**.
- **Comando:** `ACUSE` (alias `RECIBO`), tecleable, más el mismo panel al
  soltar un fichero en el tablero.
- **Endpoint:** `POST /v1/cad/acuses` → `{ id, url }`; `GET /acuse/{id}` público
  con el mismo mecanismo de expiración y capacidad que
  `review-link.service.ts` ya tiene.
- **DWG con la puerta cerrada:** el adaptador DWG del acuse llama al censo del
  laboratorio y **nunca** a `cadDocumentMapping`; una spec de frontera
  (`scripts/dwg/check-product-boundary.mjs` ya existe para esto) debe afirmar
  que el acuse no construye una sola entidad canónica mientras
  `DWG_IMPORT_FLAG` sea `false`.
- **Verificación:** golden que suba `floorplan.dxf`, abra el enlace **sin
  sesión** y lea del DOM los 6 LEADER, las 7 capas podadas y las 63 cotas
  desligadas; spec que corra el acuse sobre los 57 fixtures del corpus DWG
  admitido con la bandera apagada y afirme cero entidades canónicas creadas;
  y el gate de veracidad de comandos cubriendo `ACUSE`.

**Esfuerzo:** varios días para la primera versión útil (DXF + PDF), una semana
más para el censo DWG y el enlace público.

---

## 5. Resumen para quien decide

- Lo construido en DXF y en PDF es **serio y está medido contra terceros**. La
  declaración de pérdidas es la mejor pieza del producto y **supera a AutoCAD**.
- Tres huecos deciden la dimensión, y los tres son de flujo, no de función:
  **no abro el DWG** (firma, no código), **las láminas no viajan** (una ola
  entera) y **lo que no entiendo lo tiro** (varios días, y es una promesa
  incumplida del contrato propio).
- Hay un exportador DXF paralelo en el servidor que **pierde en silencio** y es
  la salida de datos del cliente que se va. Eso es lo más urgente de arreglar
  de todo el informe, porque es una mentira, no una carencia.
- El `MLEADER` exportado repite, sin que nadie lo haya visto, el defecto de
  subclase que la ola del 2026-09-05 arregló en MTEXT y HATCH.
- La apuesta que gana no es leer DWG mejor: es **contarle al remitente, en un
  enlace que él puede abrir, exactamente qué le pasó a su archivo**.
