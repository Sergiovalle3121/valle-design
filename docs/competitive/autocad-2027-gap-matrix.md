# Matriz de brechas y rúbrica frente a AutoCAD 2027

Fecha de corte: **2026-08-18** (UTC, la del artefacto), sobre el árbol de `main` en `986176b`.
AutoCAD 2027 se usa sólo como referencia de categorías; no existe afiliación,
certificación ni claim de paridad.

**Puntuación de este corte: 166 / 200 (83 %).** El desglose lo calcula
`scripts/cad/rubric.mjs` leyendo `docs/competitive/rubric.json` y yendo a mirar
el árbol; no se escribe a mano. Correr `npm run check:rubric` lo reproduce.

> **La prosa de abajo es del corte del 2026-08-09 y la nota de arriba es de
> hoy.** Durante ocho días este documento afirmó 131/200 mientras su propio
> script devolvía 166/200: el análisis por filas envejeció y el encabezado se
> quedó con él. Se corrige el número, no se reescribe el análisis fila a fila,
> porque volvería a envejecer igual. **La autoridad es el script**: ante
> cualquier discrepancia entre esta prosa y `npm run check:rubric`, gana el
> script. Lo que la prosa sigue explicando bien es el PORQUÉ de los pesos, y eso
> no ha cambiado.

## Por qué este documento cambió de forma

La versión anterior era honesta y estaba desactualizada, que son cosas
compatibles. Decía que el modelador B-rep no existía —existe, `apps/web/src/lib/brep/`,
36 archivos y 9.407 líneas—, decía que los plugins AutoLISP estaban «Ausente»
—hay un intérprete completo en `apps/web/src/lib/lisp/`, 46 archivos y 9.205
líneas— y citaba 25.275 ms de primer detalle cuando el benchmark versionado ya
reportaba 750 ms.

Un documento que sólo se actualiza cuando alguien se acuerda no sirve para
responderle a un cliente «¿cuánto os falta para AutoCAD?». Por eso ahora la
matriz tiene tres partes que antes no tenía: una **rúbrica con denominador
publicado**, un **script que la calcula** contra el árbol de hoy, y un
**histórico** para responder «¿cuánto hemos avanzado este mes?».

## Criterio

- **Completa:** UI, motor, persistencia, interoperabilidad y pruebas del límite
  relevante cumplen todos los criterios publicados para esa fila.
- **Parcial:** hay implementación real, pero falta al menos uno de esos límites,
  fidelidad, corpus, rendimiento o evidencia full-stack.
- **Ausente:** el repositorio no contiene una implementación comprobable.

Reglas que el documento se dio a sí mismo y que no se negocian:

1. Ninguna fila recibe «Completa» ni su puntuación máxima en este corte.
2. Que un golden, un unit test o un endpoint pase **no compensa** un criterio
   faltante.
3. Nunca se redondea al tope mientras exista un gap.
4. Si se cita un número de rendimiento, **se cita también la máquina**.
5. Sin evidencia, cero. No hay puntos de oficio.

Y la regla que hizo falta añadir después de la ola 1:

6. **Un módulo que nadie importa no cuenta como implementado.**

La sexta regla no es teórica. La ola 1 entregó tres subsistemas terminados,
probados y sin un solo importador: el pipeline de render (`lib/cad/render/`), el
intérprete AutoLISP (`lib/lisp/`) y el kernel B-rep (`lib/brep/`). Si la rúbrica
los hubiera contado como capacidades del producto, habría dicho que un usuario
puede cargar un `.lsp` —y no puede—, y habría atribuido al editor un
rendimiento que el editor no tiene, porque el pipeline medido no es el que
dibuja. El script lo comprueba de oficio y sin contar las specs del propio
módulo: una suite verde demuestra que el código funciona, no que el producto lo
use.

> Corte de las tres comprobaciones de huérfanos a **2026-08-09**. Hay sesiones
> de la ola 2 enchufando estos subsistemas ahora mismo (T1 el render, T6 el
> LISP, T7 el B-rep). Cuando aterricen, `npm run check:rubric` moverá los seis
> puntos correspondientes sin que nadie edite este archivo.

## Los 200 puntos, y por qué están repartidos así

El reparto es por **peso comercial**, no por esfuerzo de implementación. Es una
decisión discutible y por eso está escrita: un kernel B-rep es muchísimo más
caro de construir que un comando `HATCH`, y aun así vale menos puntos, porque un
delineante no compra un kernel B-rep si no puede acotar. La pregunta que ordena
la tabla no es «¿qué nos ha costado más?», sino «¿qué impide firmar el pedido?».

| Grupo                        | Puntos | En este corte | Qué representa                                                                     |
| ---------------------------- | -----: | ------------: | ---------------------------------------------------------------------------------- |
| Núcleo del plano entregable  |    110 |            96 | Dibujar, anotar, organizar y entregar una lámina. Sin esto no hay producto.        |
| Productividad profesional    |     44 |            39 | Lo que separa «se puede hacer» de «se hace rápido»: línea de comandos, 100k, xrefs |
| Extensibilidad e integración |     26 |            21 | API, SDK, plugins, eventos, almacenamiento                                         |
| Frontera avanzada            |     20 |            10 | DWG, sólidos, WASM, GIS                                                            |
| **Total**                    |    200 |       **166** |                                                                                    |

El argumento del 55 % al núcleo: un CAD 2D se compra para producir una lámina
que alguien firma. Todo lo que ocurre entre abrir el archivo y entregar el PDF o
el DXF es el producto; lo demás es diferenciación. Dentro del núcleo, las cotas
(12) pesan más que HATCH (10) y HATCH más que MTEXT (9) porque ése es el orden
en que un plano deja de ser entregable: una lámina sin cotas no se puede
fabricar, una sin sombreado se lee peor, y una con texto pobre se entrega
igualmente.

El argumento del 22 % a productividad: la fila más gorda del grupo es la línea
de comandos (12), y es una fila **nueva** en este corte. La ola 1 construyó un
motor de comandos con registro único y tabla de alias `acad.pgp`
(`apps/web/src/lib/cad/engine/`), y la matriz anterior no tenía dónde ponerlo.
Vale 12 puntos porque la memoria muscular de un dibujante veterano tiene décadas
y es intransferible: si `TR` no recorta, el producto se siente ajeno por
completo que esté el resto. Hoy 80 de los 125 alias no resuelven a nada.

El argumento del 13 % a extensibilidad: es lo que decide si un cliente grande
puede automatizar, y su fila más gorda son los plugins (8) porque un despacho
con veinte años de rutinas LISP no migra sin ellas.

El argumento del 10 % a la frontera: DWG (8) es la única de las cuatro con
demanda comercial real y directa. B-rep (7) la tiene indirecta —vende en el
comparativo, no en el uso diario—. WASM (2) es una optimización condicionada y
GIS (3) es otro producto.

Ninguna categoría llega a su tope. Las tres que más lejos están de él —Xrefs
2/6, DWG 2/8, GIS 0/3— son también las que menos sorprenden.

## Capacidades: las 25 filas al día

Las columnas «Puntos» y «Estado» las calcula el script; las de evidencia y
brecha las mantiene quien toca la fila. Cada evidencia está declarada como una
comprobación automática en `docs/competitive/rubric.json`, así que una ruta que
se mueva rompe la fila en la siguiente corrida en vez de envejecer callando.

### Núcleo del plano entregable — 96/110

| Categoría                        | Puntos | Estado  | Qué existe hoy y dónde                                                                                                                                                      | Qué falta exactamente                                                                                          |
| -------------------------------- | -----: | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Dibujo 2D y precisión            |  14/16 | Parcial | Documento canónico; LINE/PLINE/CIRCLE/ARC/RECTANG/POLYGON/ELLIPSE/SPLINE tecleables; XLINE, RAY, DIVIDE, MEASURE, DONUT, REVCLOUD; OSNAP indexado; goldens 13, 28 y 52      | Corpus de geometría degenerada (tangencias, radio cero, autointersección) con criterio publicado por caso      |
| Selección y modificación         |  12/14 | Parcial | Índice de selección, grips, ERASE/MOVE/COPY/ROTATE/SCALE/MIRROR/OFFSET, TRIM/EXTEND/FILLET/CHAMFER/BREAK/JOIN, ARRAY+ARRAYEDIT, STRETCH/ALIGN/PEDIT; goldens 12, 23, 25, 43 | GROUP/UNGROUP, OVERKILL y DRAWORDER no existen; falta estrés de navegador con trazos densos a 100k             |
| Cotas asociativas                |   7/12 | Parcial | Entidad DIMENSION con asociatividad, formato de cota, round-trip DXF con XDATA; golden 16                                                                                   | **Ningún comando DIM\* es tecleable** (`DLI`, `DAL`, `DAN`, `DRA`, `DDI` no resuelven). Sin DIMSTYLE           |
| Import/export DXF de texto       |   9/12 | Parcial | Importador y exportador TS, manifiesto de pérdidas, preflight, round-trip por entidad —incluidos los ocho tipos del esquema 4 (POINT, XLINE, RAY, SOLID, WIPEOUT, IMAGE, ATTDEF; TABLE como geometría declarada)—, XDATA registrada, corpus propio de 3.400 entidades con ida y vuelta de punto fijo; goldens 27, 34 y 46 | Corpus de terceros autorizado con matriz por entidad; DXFIN/DXFOUT no son tecleables; ACAD_TABLE editable, OCS/extrusión y anchos siguen fuera |
| Capas y propiedades              |   8/10 | Parcial | Capa canónica y mapa DXF, gestor de capas, paleta de propiedades multi-objeto, tipos de línea; goldens 24, 49, 50                                                           | LAYER, LINETYPE, LWEIGHT, COLOR y PROPERTIES no son tecleables (`LA`, `LT`, `CH` no resuelven)                 |
| HATCH asociativo                 |   5/10 | Parcial | Motor poligonal con asociatividad al contorno y round-trip DXF; golden 14                                                                                                   | **No hay comando HATCH**: el motor existe y no se puede invocar escribiendo `H`. Sin islas ni contornos curvos |
| Layouts, viewports y publicación |   6/10 | Parcial | Paper space y viewports múltiples, hoja de ploteo, adaptador de exportación, publicaciones versionadas; golden 20                                                           | LAYOUT/MVIEW/PLOT/PAGESETUP no tecleables; sin fidelidad de fuentes ni SLO de publicación                      |
| Bloques y atributos              |    6/9 | Parcial | Biblioteca y definición/inserción, ATTDEF tecleable, round-trip DXF de INSERT y de la tabla de bloques; golden 18                                                           | BLOCK/INSERT/WBLOCK/BEDIT no tecleables; sin bloques dinámicos ni comportamiento anotativo                     |
| MTEXT y texto                    |    5/9 | Parcial | Entidad MTEXT con maquetación de párrafo y viaje por DXF en los dos sentidos; golden 15                                                                                     | MTEXT/TEXT/STYLE no tecleables; sin códigos de control ni fuentes SHX/TTF                                      |
| Guardado CAS, autosave, historia |    6/8 | Parcial | Cola de un escritor con CAS 409, journal de recuperación con integridad, E2E real de logout/reapertura/>1 MB; golden 11                                                     | Offline, multi-pestaña y cierre forzado; límites de documento y memoria sin publicar                           |

### Productividad profesional — 39/44

| Categoría                            | Puntos | Estado  | Qué existe hoy y dónde                                                                                                                                                                         | Qué falta exactamente                                                                             |
| ------------------------------------ | -----: | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Rendimiento 10k/100k                 |   8/12 | Parcial | Índice espacial y presupuesto de render usados por el editor; corpus determinista con sha256; spec Playwright 100k; pipeline por lotes/tiles medido a 750 ms de primer detalle y 23 ms de zoom | **El editor no usa ese pipeline**: nadie importa `lib/cad/render`. Sin SLO de navegador publicado |
| Línea de comandos, alias y scripting |   7/12 | Parcial | Registro único (`engine/index.ts:71`) consumido por el editor, tabla de 125 alias `acad.pgp`, motor con estados y pipeline de entrada; golden 44                                               | **80 de 125 alias no resuelven**; no hay SCRIPT ni variantes `-COMANDO`                           |
| MLEADER y tablas                     |    3/5 | Parcial | MLEADER canónico con asociatividad; TABLE tecleable; golden 17                                                                                                                                 | MLEADER, MLEADERSTYLE y TABLESTYLE no tecleables; sin estilos aplicables                          |
| Compare, comentarios y enlaces       |    3/5 | Parcial | Enlaces con hash/caducidad/revocación y aislamiento por organización, comentarios anclados; golden 22                                                                                          | Carga concurrente medida y merge semántico con recorrido de todos los roles                       |
| Importación de JSON canónico         |    3/4 | Parcial | Worker con progreso, cancelación y límites; transporte de documentos grandes                                                                                                                   | Corpus hostil y fuzzing ejecutados en navegador, no sólo en Node                                  |
| Xrefs                                |    2/6 | Parcial | Referencias externas en el documento canónico; golden 21                                                                                                                                       | Sin bind ni resolución de recursos; XREF/XATTACH/XBIND/XCLIP no tecleables                        |

### Extensibilidad e integración — 21/26

| Categoría                       | Puntos | Estado  | Qué existe hoy y dónde                                                                                                                                     | Qué falta exactamente                                                           |
| ------------------------------- | -----: | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Plugins AutoLISP / .NET / VBA   |    6/8 | Parcial | Intérprete completo: lector, evaluador, entorno, errores, builtins de CAD, entidades por códigos DXF, sandbox con presupuesto, DCL y manifiesto de plugins | **Nadie importa `lib/lisp`**: un usuario no puede cargar un `.lsp`              |
| API y SDK de automatización     |    5/7 | Parcial | OpenAPI 3.1 con gate de contrato, SDK generado con test de compatibilidad, repositorios tipados usados por el web                                          | Consola pública, pruebas de límite y carga, política de extensiones de terceros |
| Eventos e integración asíncrona |    3/4 | Parcial | Outbox transaccional con leases, reintentos y cola muerta; contrato de eventos versionado                                                                  | Evidencia operacional sostenida y replay auditado contra receptor externo       |
| Asistencia NL→CAD y Vision→CAD  |    3/4 | Parcial | Puerto de proveedor opcional con validación y previsualización; contrato del copiloto con specs deterministas                                              | Benchmark de calidad por modelo y evaluación adversarial                        |
| Almacenamiento de objetos       |    2/3 | Parcial | Puerto desacoplado y adaptador BYTEA con aislamiento por organización                                                                                      | El MinIO del Compose sigue sin cablear: no hay adaptador S3 ni migración        |

### Frontera avanzada — 10/20

| Categoría                     | Puntos | Estado  | Qué existe hoy y dónde                                                                                                    | Qué falta exactamente                                                                   |
| ----------------------------- | -----: | ------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Modelo 3D y sólidos B-rep     |    5/7 | Parcial | Topología, tolerancia e invariantes; extrusión, barrido, booleanas y redondeo; NURBS, superficies y teselado; STEP e IGES | **Nadie importa `lib/brep`**: el kernel no llega al editor                              |
| Import/export DWG             |    2/8 | Ausente | ADR-0004 y ADR-0007 publicados; la interfaz detecta y rechaza el formato en vez de fingir soporte                         | Sin decoder productivo, sin corpus independiente, sin export, sin round-trip, sin gates |
| Kernel Rust/WASM              |    1/2 | Ausente | ADR-0003 con la puerta de entrada y su condición de activación                                                            | Toolchain, manifiesto, paridad numérica, fallback y benchmarks                          |
| Nubes de puntos, raster y GIS |    0/3 | Ausente | Nada                                                                                                                      | LAS/LAZ, GeoTIFF, SHP, CRS, índices y pruebas a escala                                  |

Los dos puntos que DWG sí obtiene merecen una nota, porque parecen caridad y no
lo son: un producto que **detecta el DWG y lo rechaza con un mensaje claro** es
materialmente mejor que uno que lo acepta y produce basura, y la decisión de no
entrar sin proveedor autorizado está documentada en un ADR. Puntuar eso es
puntuar honestidad de producto, no funcionalidad.

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

`legacy` es el modelo en Node del camino que hoy usa el editor, no el editor
medido en navegador. Sirve para comparar los dos caminos con el mismo guion, no
para afirmar qué siente un usuario.

Máquina: **Node v22.22.2 sobre Linux x64, Intel Xeon a 2,80 GHz, 4 CPU lógicas,
16,8 GB de RAM, límite de montón 4,3 GB**, corrida del 2026-08-09T07:30Z, corpus
de 100.000 entidades con sha256 `1ba7300d…`.

Tres advertencias que hacen que estos números **no** sean un SLA:

1. Son de **Node, no de navegador**. El propio artefacto declara que no mide GPU,
   llamadas de dibujo, composición ni cuadros por segundo, y que el atlas de
   texto no entra porque en Node no hay canvas.
2. El artefacto entra como `report-only`: es una métrica nueva sin línea base
   versionada debajo.
3. **Miden un pipeline que el editor no usa.** Es la razón de que la fila de
   rendimiento se quede en 8/12 en vez de subir entera: 750 ms de primer detalle
   es una mejora real de 33× sobre los 25.275 ms que citaba la versión anterior
   de este documento, y hoy ningún usuario la nota.

**Los presupuestos que sí corren contra navegador** siguen en
`apps/web/e2e/performance/cad-viewport-100k.spec.ts`: canónico 10k <30 s,
canónico 100k <60 s, detalle <90 s, cuadro <1 s, zoom <30 s, máximo 2.500
detalles iniciales y 10.000 tras zoom. Detectan regresiones y caídas. Un zoom de
29,14 s pasa el gate y sigue siendo una brecha P0 de experiencia: el presupuesto
no es el objetivo de producto, y confundirlos es exactamente cómo una tabla como
ésta se vuelve marketing.

**El benchmark Node de OSNAP profesional**
(`apps/web/src/lib/cad/professional-snap-query-benchmark.spec.ts:51`) usa 100.000
entidades y un gate p95 <12 ms. La corrida de este corte, en la misma máquina
declarada arriba, dio **p50 1,45 ms y p95 3,03 ms**. Mide consulta indexada, no
latencia end-to-end del puntero, del render ni del comando.

La CI ejecuta Chromium y Firefox contra API y PostgreSQL reales. Los números
históricos son de Chromium; que pasen los dos navegadores es gate de release, no
evidencia de igualdad de rendimiento entre ellos.

## Defectos encontrados al recorrer las filas

Recorrer las 25 filas con `grep` en la mano destapa cosas que ninguna fila
pedía. Van aquí con su evidencia porque son el subproducto útil del ejercicio.

1. **Tres subsistemas completos e inalcanzables.** `lib/cad/render` (5.283
   líneas), `lib/lisp` (9.205) y `lib/brep` (9.407) no tienen un solo importador
   fuera de sí mismos. Son 24.000 líneas probadas que no llegan al usuario.
   Comprobado con la evidencia `imported` de la rúbrica; reproducible con
   `grep -rln "lib/brep" apps/web/src --include=*.ts | grep -v "^apps/web/src/lib/brep"`.

2. **La dependencia va al revés en LISP.** `lib/lisp/builtins/interaction.ts:49`
   y `lib/lisp/plugins/api.ts:42` importan `lib/cad/engine`. El intérprete conoce
   al motor de comandos; el motor no conoce al intérprete y nadie los une. Quien
   enchufe el LISP (ola 2, T6) no tiene que construir el puente, sólo el punto de
   entrada.

3. **El PDF sólo existe dentro del monolito.** `jspdf` se importa únicamente
   desde `Layout3DEditor.tsx:14742` y `:15892`, no desde `plot-sheet.ts` ni desde
   `layout-export-adapter.ts`. La capacidad de publicar está acoplada a un
   componente de 23.316 líneas con 153 `useState` —las dos cifras las reporta
   `npm run check:monolith-budget`—, que es además el único consumidor de
   `planCadNativeRenderBudget` (`:236`, usado en `:4428`). Cualquier plan de sacar
   el ploteo del monolito empieza aquí.

4. **La brecha de comandos es de anotación, no de dibujo.** De los 80 alias sin
   resolver, el bloque más caro comercialmente es homogéneo: `H` (HATCH), `T`/`MT`
   (MTEXT), `DLI`/`DAL`/`DAN`/`DRA`/`DDI` (cotas), `LA` (capas), `I`/`B`
   (bloques). El motor de dibujo está razonablemente cubierto y el de **anotación
   y organización no tiene puerta de entrada por teclado**, aunque el motor
   subyacente exista y tenga golden. Es el patrón que explica por qué HATCH
   puntúa 5/10 teniendo motor y asociatividad.

5. **El número más impresionante del repositorio no lo nota nadie.** Ver la
   tercera advertencia de la sección de benchmarks.

Los cinco anteriores no rompen ningún gate: pasan todos hoy. Son fallos que sólo
se ven mirando el conjunto, que es precisamente lo que una rúbrica hace. El
sexto sí rompe un gate, y estaba antes de este corte:

6. **El autoguardado se cuela por delante del guardado explícito.** Nueve
   goldens afirman `expect.poll(() => backend.snapshot().version).toBe(...)` tras
   pulsar «Guardar»; ocho de ellos esperan la versión 1. En una máquina cargada
   el debounce del autoguardado (`components/cad/document-lifecycle/autosave.ts:29`
   y `:81`) vence antes que el clic y el backend llega a la versión 2, así que el
   golden falla con `Expected: 1 / Received: 2`. Medido el 2026-08-09 sobre
   `8be49a5` en Chromium, con el árbol de `main` limpio: `17-cad-native-mleader`
   (`:71`) y `24-cad-canonical-layers` (`:67`) fallan de forma reproducible, y
   `19-cad-professional-workbench` falla o no según la carga.

   No es un fallo del test: el aserto es correcto y lo que expone es real. Un
   usuario que edita y guarda a mano produce **dos** versiones en el historial
   donde debería producir una, y el número de versión de un documento es dato de
   producto —lo consumen historia, versiones y el CAS—. El punto
   `persistence.cas` sigue otorgado porque la cola de un solo escritor y el 409
   existen y funcionan; lo que falta es que un guardado manual **supersede** al
   debounce pendiente en vez de sumarse a él. El propio `autosave.ts:3` dice que
   ésa es la intención («supersedes a pending debounce»), así que el defecto está
   entre la intención declarada y lo que se observa, no en el diseño.

## Prioridad: los diez puntos más baratos por valor comercial

Sale de los datos, no de la intuición: entre los criterios no otorgados, ordena
por puntos entre días declarados en `costDays`. Reproducible con
`node scripts/cad/rubric.mjs --priorities`.

|   # | Puntos | Días | Categoría           | Criterio                                                         |
| --: | -----: | ---: | ------------------- | ---------------------------------------------------------------- |
|   1 |      3 |    4 | MTEXT y texto       | MTEXT, TEXT y STYLE tecleables                                   |
|   2 |      3 |    5 | HATCH asociativo    | HATCH tecleable con contorno por punto interior                  |
|   3 |      3 |    6 | Cotas asociativas   | DIMLINEAR/DIMALIGNED/DIMANGULAR/DIMRADIUS/DIMDIAMETER tecleables |
|   4 |      2 |    4 | Dibujo 2D           | Corpus de geometría degenerada con criterio por caso             |
|   5 |      1 |    2 | DXF                 | DXFIN y DXFOUT tecleables                                        |
|   6 |      2 |    4 | Capas y propiedades | LAYER/LINETYPE/LWEIGHT/COLOR/PROPERTIES tecleables               |
|   7 |      2 |    4 | Xrefs               | XREF/XATTACH/XBIND/XCLIP tecleables                              |
|   8 |      2 |    5 | MLEADER y tablas    | MLEADER/MLEADERSTYLE/TABLESTYLE tecleables con estilos           |
|   9 |      2 |    5 | Bloques             | BLOCK/INSERT/WBLOCK/BEDIT tecleables                             |
|  10 |      2 |    5 | Cotas asociativas   | DIMSTYLE aplicable                                               |

Nueve de los diez son comandos que no se pueden teclear sobre motores que ya
existen. Eso es lo que dicen los datos, y coincide con el defecto 4: **la ola 3
es una ola de puertas de entrada, no de motores**. 22 puntos por unos 44 días
declarados, frente a los 6 puntos que le faltan a DWG por 120 días.

Los `costDays` los declara quien escribe el criterio y no afectan a la nota; si
una estimación es mala, lo que sale mal es el orden de la ola, no la puntuación.

## Cómo se calcula, y por qué no es un gate

```
npm run check:rubric          # informe con el desglose
npm run check:rubric:spec     # la spec del script
node scripts/cad/rubric.mjs --verbose --priorities --history
node scripts/cad/rubric.mjs --run-specs   # además EJECUTA las specs citadas
```

`npm run check:cad` ejecuta las dos cosas: la spec del script como gate (es un
test, y un test roto es un fallo) y el informe como **informativo**. El informe
sale siempre con código 0 aunque la nota baje. Una rúbrica que bloquea el merge
se convierte, en dos semanas, en una rúbrica que la gente infla para poder
mergear; el día que 166/200 sea la diferencia entre desplegar y no desplegar,
alguien encontrará el modo de que sean 190 sin escribir una línea de producto.

Lo que el script comprueba solo: que el archivo exista y tenga cuerpo, que la
spec esté dentro del glob del runner (y con `--run-specs`, que pase y que imprima
algo), que el golden exista, que el comando esté en el registro real —arrancando
el registro con `tsx`, no con `grep`, porque los descriptores de restricciones se
generan en bucle y un `grep` los cuenta mal—, que el alias resuelva, que alguien
importe el módulo, que un texto aparezca en la fuente, y que un número medido
esté dentro de su umbral **y venga con la máquina declarada**.

Lo que no se puede automatizar se declara `manual` con `verifiedBy` y
`verifiedAt`, y **caduca a los 180 días**. Un «lo comprobé yo» de hace un año no
dice nada del árbol de hoy. Hoy hay dos evidencias manuales declaradas y ninguna
firmada, así que ninguna concede puntos: `dxf.corpus-external` y `dwg.gates`.

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

## Gaps P0 que bloquean claims superiores

1. Definir y cumplir SLO profesionales de navegador para apertura, interacción,
   zoom, guardado y memoria a 10k/100k con hardware y navegador documentados. El
   presupuesto actual de casi 30 s para zoom no es un objetivo de producto.
2. Enchufar el pipeline de render medido. Mientras no lo use el editor, los
   750 ms son un dato de laboratorio.
3. Dar puerta de entrada por teclado a la anotación y la organización: HATCH,
   MTEXT, las cotas, LAYER y los bloques. Son 12 de los 200 puntos sobre motores
   que ya están escritos y probados.
4. Ampliar selección, modificación y precisión con corpus de geometría degenerada
   y estrés de navegador denso, manteniendo CAS, autosave y deshacer/rehacer.
5. Construir un corpus DXF autorizado y diverso con matriz por entidad,
   round-trip y pérdidas aceptadas. No promover DXF por un único archivo feliz.
6. Cerrar recuperación offline, cierre forzado y edición multi-pestaña sin perder
   trabajo ni eludir conflictos; publicar límites de documento y memoria.
7. Si DWG es requisito comercial, validar la implementación clean-room contra
   ADR-0007 o seleccionar un proveedor autorizado y completar los gates legal,
   de seguridad y de fidelidad. Sin ADR posterior de promoción, corpus
   independiente e integración real, sigue ausente.
8. Mantener como gate bloqueante identidad→organización→trial→documento→CAS→
   logout/login/reset→aislamiento A/B→archivo grande→DXF con API y PostgreSQL
   reales en Chromium y Firefox, sin interceptar `/v1`.

## Regla de actualización

Toda promoción enlaza código, prueba y artefacto del límite relevante, **y se
declara como evidencia comprobable en `rubric.json`**. No se aceptan como única
evidencia documentos de ejecución, mocks de toda la API, tests unitarios o
microbenchmarks. Una regresión baja el estado; no se relajan umbrales ni se
reescribe un golden sólo para conservar una etiqueta.

Y la regla nueva, que es la que sostiene a las demás: **la evidencia se declara
en el JSON, no en la prosa**. La prosa de este archivo puede envejecer; la
próxima vez que envejezca, el script lo dirá.
