# Paquete de firma · encendido de DWG en el producto

> **Fecha de corte: 2026-09-04.** Frente F1 · DWG dentro del producto, campaña
> «Superar a AutoCAD completo».
>
> **Este documento no enciende nada.** Describe qué habría que encender, con qué
> queda respaldado, con qué límites, y qué falta antes de que encenderlo sea
> honesto. Las dos banderas siguen apagadas, y
> `node scripts/dwg/check-firma-package.mjs` falla si alguien publica esta página
> con alguna de ellas ya encendida: un paquete de firma escrito después del
> encendido no es un paquete de firma, es una justificación.

## Cómo leer esta página

Casi todo lo que aquí lleva un número está dentro de un **bloque generado**,
marcado con comentarios HTML y producido por
`node scripts/dwg/check-firma-package.mjs --write` a partir de los artefactos de
evidencia y de las fuentes del producto. `--check` los regenera y exige igualdad
exacta, así que **ninguna cifra de esta página puede quedarse atrás sin que un
gate lo diga**. Es la regla 4 de la campaña de cimientos —«ninguna cifra vive en
dos lugares; los informes enlazan, no copian»— aplicada al documento que más
tentación da de copiarlas.

La prosa que rodea los bloques explica **qué significan** y **qué no**. Si una
cifra cambia, la prosa que la rodea puede haber dejado de ser cierta: eso es
trabajo de quien regenere, no del gate.

## 1. Qué se encendería, y qué NO basta con encender

<!-- generado:banderas · lo produce scripts/dwg/check-firma-package.mjs --write; no se edita a mano -->
| Bandera | Valor hoy | Perfil autorizado | Fuente |
| --- | --- | --- | --- |
| `DWG_IMPORT_FLAG` | `false` | `AC1015_MODELSPACE_2D_V3` | `apps/web/src/lib/cad/dwg-interop-flag.ts` |
| `DWG_EXPORT_FLAG` | `false` | `AC1015_EXPORT_2D_V1` | `apps/web/src/lib/cad/dwg-export-flag.ts` |

Encender la bandera no abre la puerta: las dos son condición NECESARIA y nunca
suficiente, y la conjunción se evalúa contra estos gates declarados.

| Gate de importación (`DWG_PROMOTION_GATES`) | Declarado |
| --- | --- |
| `promotionAdrSigned` | `false` |
| `legalReviewCleared` | `false` |
| `securityReviewCleared` | `false` |
| `admittedCorpusBundles` | `0` |
| `independentValidations` | `0` |
| `labEntityImportSupported` | `false` |
| `canonicalMappingVerified` | `false` |

| Gate de exportación (`DWG_EXPORT_GATES`) | Declarado |
| --- | --- |
| `publicWriterExists` | `true` |
| `externalOracleVerified` | `false` |
<!-- /generado:banderas -->

Las dos banderas son **condición necesaria y nunca suficiente**. `dwgImportIsEnabled`
exige la bandera **y** cero bloqueos en `DWG_PROMOTION_GATES`; `dwgBetaExportIsEnabled`
exige la bandera **y** la firma del titular **y** cero bloqueos en `DWG_EXPORT_GATES`.
Poner las dos banderas en `true` hoy no abre ninguna puerta: el producto seguiría
rechazando `.dwg` a la entrada y exportando sólo DXF y PDF a la salida, porque los
gates siguen declarando lo que declaran. Eso es deliberado y no se toca: una bandera
que por sí sola abre la puerta es una bandera que alguien enciende «un momento, para
probar».

El **commit del encendido** es, por tanto, más de una línea. Está escrito exacto en
la sección 9.

## 2. Lo que la evidencia mide hoy

<!-- generado:veredicto · lo produce scripts/dwg/check-firma-package.mjs --write; no se edita a mano -->
**El lector, sobre material ajeno** — `docs/cad/evidence/dwg-corpus-validation.json`:

> El decoder abre los 57 DWG del corpus SIN discrepancias: AC1015 25/25 abiertos con 0 discrepancia(s); AC1018 8/8 abiertos con 0 discrepancia(s); AC1024 8/8 abiertos con 0 discrepancia(s); AC1027 8/8 abiertos con 0 discrepancia(s); AC1032 8/8 abiertos con 0 discrepancia(s).

**El writer, sobre el mismo material ajeno** — `docs/cad/evidence/dwg-corpus-rewrite.json`:

> De 327 entidades ajenas, el writer regraba 284 (86.9%) y rechaza 43; 284 vuelven idénticas campo a campo y 227 quedan ancladas al DXF del oráculo. Íntegras: arc, attrib, circle, ellipse, hatch, insert, line, lwpolyline, mtext, point, text, viewport. Con pérdida declarada: ninguna. No escribibles: attdef, dimension, face3d, leader, mline, polyfaceMesh, polyline2d, polyline3d, polymesh, ray, solid, spline, tolerance, trace, xline.

**El corpus sobre el que se midieron las dos cosas**, fijado por su commit y el
hash de su índice, no por su ruta en una máquina:

- commit: `0688fb9c395b9cac4169d1ee9c23a7370cc28cf3`
- `indexSha256`: `59c69c1ba3a9524a5ca5fb246c7b0226e9980e0c3b9cdbdc2d6e2180d49ee07a`
- transporte: `local-mirror`
- bundles admitidos: `entity-wave-2-ac1015` (AC1015), `foundational-entities-ac1015` (AC1015), `valle.fundacional.ac1015.001` (AC1015), `valle.fundacional.ac1018.001` (AC1018), `valle.fundacional.ac1024.001` (AC1024), `valle.fundacional.ac1027.001` (AC1027), `valle.fundacional.ac1032.001` (AC1032)

**El límite que las dos mediciones declaran de sí mismas**:

> Esta medición NO cierra el hueco del oráculo externo. El cotejo campo a campo enfrenta NUESTRO writer con NUESTRO lector: un error SIMÉTRICO —escribir mal un campo y leerlo mal igual— seguiría oculto. El anclaje contra el DXF del oráculo lo estrecha, porque esos valores los escribió otro, pero sigue siendo nuestro decoder el que lee nuestro archivo. Sólo un conversor AJENO leyendo NUESTRO archivo cierra el hueco: eso es scripts/dwg/oda-roundtrip.mjs y exige el binario con licencia del titular, que no corre en este entorno.
<!-- /generado:veredicto -->

Las dos mediciones se corren sobre **material que no escribió este repositorio**: los
fixtures del repositorio de conformidad los produjo una implementación independiente
(ODA), y el DXF oráculo de cada bundle es la fuente de autoría propia congelada junto
a ellos. Por eso son las únicas dos cifras de este documento que sirven para decidir:
una prueba propia contra un archivo propio sólo demuestra que el código es coherente
consigo mismo.

## 3. Matriz de soporte por clase

Qué viaja de entrada, qué deja pasar el perfil del producto, qué viaja de salida y
con qué límite. Las columnas salen de sitios **distintos a propósito**: dos
artefactos medidos y una fuente de producto.

<!-- generado:matriz-por-clase · lo produce scripts/dwg/check-firma-package.mjs --write; no se edita a mano -->
| Clase | Lectura (lab, material ajeno) | ¿En el perfil de importación? | Escritura (writer, material ajeno) | Anclada al DXF del oráculo | Límite declarado |
| --- | --- | --- | --- | --- | --- |
| `arc` | 10/10 | sí | regrabada-integra · 14/14 | 10/10 | — |
| `attdef` | 5/5 | no | no-escribible · 0/5 | 0/5 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `attrib` | 7/7 | no | regrabada-integra · 7/7 | 7/7 | — |
| `circle` | 18/18 | sí | regrabada-integra · 18/18 | 18/18 | — |
| `dimension` | 8/8 | sí | no-escribible · 0/8 | 0/8 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `ellipse` | 2/2 | sí | regrabada-integra · 2/2 | 2/2 | — |
| `face3d` | 2/2 | no | no-escribible · 0/2 | 0/2 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `hatch` | 4/4 | sí | regrabada-integra · 4/4 | 4/4 | — |
| `insert` | 34/34 | sí | regrabada-integra · 34/34 | 34/34 | — |
| `leader` | 2/2 | no | no-escribible · 0/2 | 0/2 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `line` | 99/99 | sí | regrabada-integra · 120/120 | 99/99 | — |
| `lwpolyline` | 17/17 | sí | regrabada-integra · 15/15 | 15/17 | — |
| `mline` | 2/2 | no | no-escribible · 0/2 | 0/2 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `mtext` | 5/5 | sí | regrabada-integra · 13/13 | 5/5 | — |
| `point` | 5/5 | sí | regrabada-integra · 29/29 | 5/5 | — |
| `polyfaceMesh` | 1/1 | no | no-escribible · 0/1 | 0/1 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `polyline2d` | — | no | no-escribible · 0/2 | 0/0 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `polyline3d` | 1/1 | no | no-escribible · 0/1 | 0/1 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `polymesh` | 1/1 | no | no-escribible · 0/1 | 0/1 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `ray` | 2/2 | no | no-escribible · 0/2 | 0/2 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `solid` | 2/2 | no | no-escribible · 0/12 | 0/2 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `spline` | 1/1 | sí | no-escribible · 0/1 | 0/1 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `text` | 26/26 | sí | regrabada-integra · 26/26 | 26/26 | — |
| `tolerance` | 1/1 | no | no-escribible · 0/1 | 0/1 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `trace` | 1/1 | no | no-escribible · 0/1 | 0/1 | `DWG_VERSION_DECODER_UNSUPPORTED` |
| `viewport` | 2/2 | no | regrabada-integra · 2/2 | 2/2 | — |
| `xline` | 2/2 | no | no-escribible · 0/2 | 0/2 | `DWG_VERSION_DECODER_UNSUPPORTED` |

«¿En el perfil de importación?» sale de `BETA_PROFILE_ENTITY_KINDS` en
`apps/web/src/lib/cad/dwg-native-reader.ts`: un `no` con lectura completa es una clase que el
laboratorio SÍ decodifica y que el producto descarta a propósito, con su pérdida
declarada — no un defecto del lector.
<!-- /generado:matriz-por-clase -->

**Los denominadores de las dos columnas medidas no son el mismo conjunto, y hay que
saberlo antes de restarlas.** La columna de lectura cuenta lo que el DXF oráculo
declara para cada fixture; la de escritura cuenta **cada entidad que el decodificador
produjo y le ofreció al writer**, incluidas las que viven dentro de los bloques
anónimos `*D` que el conversor genera al producir el DWG y que el DXF oráculo no
describe. De ahí que una clase pueda tener más entidades escritas que leídas sin que
nada esté mal, y que su anclaje al oráculo sea menor que su recuento de escritas.

**Una clase con lectura completa y `no` en el perfil no es un defecto del lector.**
Es una clase que el laboratorio decodifica y que el producto descarta a propósito,
con su pérdida declarada en el manifiesto que viaja con el archivo. La frontera del
perfil se mueve con una ampliación de ADR, no con una edición de este documento.

## 4. Límites declarados

Lo que **no** viaja, dicho antes de que un cliente lo descubra. Ninguno de estos es
un «nunca»: son «todavía no» con su motivo, y la bitácora del frente
(`docs/history/execution/frentes-superar-20260904/dwg.md`) lleva cada uno con su fecha y su condición de
reapertura.

- **Sin exportación de cota.** `dimension` se lee completa y el perfil de importación
  la admite; el writer la rechaza cerrado. Un plano exportado a DWG saldría sin sus
  cotas, y eso es exactamente lo que un despacho notaría primero. El bloqueo no es el
  cuerpo de la entidad —está medido y registrado, con su puntero al bloque anónimo—
  sino que una cota sin su bloque anónimo coherente es peor que una cota ausente.
- **Sin directriz.** `leader` se lee y no se escribe. El producto sí modela la
  directriz (`mleader`), así que el hueco está entero del lado del writer.
- **Sin TABLE.** La entidad TABLE no existe en AC1015 —es clase R2005+— y el corpus
  admitido no la ejercita. Un cuadro de acabados sale como líneas y textos, no como
  tabla.
- **Sin familia moderna en escritura.** El writer emite AC1015 siempre. Un fixture
  AC1018 o posterior se mide como **bajada de versión**, no como round-trip: se lee
  con el lector de su versión y se re-escribe en AC1015. «Guárdalo en 2018» no existe
  todavía.
- **Sin xrefs.** Ni de entrada ni de salida. Una referencia externa no se resuelve,
  no se incrusta y no se reescribe.
- **Sin SPLINE, sin ATTDEF, y sin las mallas y sólidos heredados.** La matriz de la
  sección 3 los enumera con su código de error exacto; todos fallan **cerrado**
  (`DWG_VERSION_DECODER_UNSUPPORTED`), nunca en silencio.
- **Una sola ventana por lámina y una sola lámina.** El espacio papel escribe la
  primera hoja con su primera ventana; el resto se declara como pérdida con código
  propio.
- **Un solo oráculo externo.** Es el límite que la sección 6 desarrolla, y el que
  más pesa: «interoperable con ODA, no verificado contra AutoCAD real» se traslada
  íntegro a cualquier texto de producto que describa esta capacidad, como ya exige
  ADR-0009 §6-bis.3.

## 5. Riesgos legales y de seguridad, y qué los cubre HOY

No es una lista de buenas intenciones: cada fila nombra el gate ejecutable que la
sostiene y, cuando no hay gate, lo dice.

### 5.1 Que el códec se cuele en el producto por la puerta de atrás

**Riesgo.** El laboratorio clean-room vive en `packages/dwg-codec/` y ADR-0007 le
prohíbe alcanzar el runtime salvo por el punto que una ADR autorice. Un `import`
puesto por comodidad en un componente convierte una investigación en un producto sin
que nadie lo firme.

**Qué lo cubre.** `node scripts/dwg/check-product-boundary.mjs`, encadenado en
`npm run check:dwg`. Recorre **todo** el árbol runtime de `apps/` y `packages/`,
prohíbe cualquier referencia al códec fuera de una lista blanca corta y explícita
—hoy: el adaptador de lectura, el de escritura y sus specs—, y exige que el único
importador del adaptador de lectura sea el worker de importación. El manifiesto
autorizado a declarar la dependencia también es uno solo. Cuando el botón del
producto se cablee, ese día la lista crece con el módulo de interfaz, y **nunca
antes**: el gate falla si crece sin su ADR.

### 5.2 Que un archivo hostil tumbe el navegador del cliente

**Riesgo.** Leer un DWG es parsear bytes de origen desconocido. Un archivo
construido a propósito puede pedir memoria sin fin, recursión sin fondo o un bucle
que no termina.

**Qué lo cubre.** Dos piezas que ya existen y ya fallan cerrado:

- **El presupuesto de recursos** (`packages/dwg-codec/src/security/resource-budget.ts`,
  sobre `DEFAULT_DWG_LIMITS` en `api/limits.ts`): topes inmutables de bytes, secciones,
  objetos, handles, referencias, profundidad, longitud de cadena, unidades de trabajo,
  tiempo de pared y bytes expandidos. `DWG_LIMIT_BOUNDS` permite **bajarlos y nunca
  subirlos**: un consumidor puede endurecerlos, jamás aflojarlos. El tope de bytes de
  la interfaz (`DWG_MAX_IMPORT_BYTES`) es un espejo verificado del del códec, con su
  prueba cruzada, precisamente porque una vez divergieron y el usuario recibía el
  mensaje equivocado.
- **El supervisor del worker** (`packages/dwg-codec/src/security/worker-supervisor.ts`):
  `readDwg` es puro y worker-compatible, y `superviseWorker` lo corre con plazo y
  terminación forzada. El hilo de interfaz **no toca bytes hostiles** en ningún camino.

Encima de eso, el fuzzing determinista y estructural (`scripts/dwg/fuzz-structural.mjs`,
con sus regresiones congeladas) y el error tipado: todo lo que el códec no entiende
sale como `DwgError` con su código, nunca como excepción suelta ni como valor a medias.

**Lo que NO cubre.** El fuzzing corre sobre mutaciones del corpus admitido. Un corpus
adversarial de verdad —proxies, verticales AEC, objetos custom, archivos
deliberadamente malformados por un tercero— sigue siendo la cola de reserva R.5 de
ADR-0009, sin fecha.

### 5.3 Que se entregue un archivo que dice ser DWG y no lo es del todo

**Riesgo.** El de escribir, y es distinto del de leer. Un archivo mal escrito no
tumba nada aquí: se lo lleva el cliente y lo abre en otro programa, tres semanas
después, delante de su propio cliente.

**Qué lo cubre.** `check-oracle-evidence.mjs`, y hoy lo cubre **diciendo que no**.
El booleano `externalOracleVerified` es el único paso entre el laboratorio y el botón
«Exportar DWG», y hasta que la evidencia del conversor ajeno lo respalde entero, el
gate impide ponerlo en `true`. Sobreafirmar es imposible por construcción: el gate
falla si el producto declara más de lo que la evidencia sostiene. Infraafirmar no
falla —un gate conservador nunca es peligroso— pero dice exactamente cuánto falta.

### 5.4 El riesgo legal, que sigue abierto

**No hay gate que lo cierre, y no lo va a haber.** `legalReviewCleared` está en
`false` sin fecha, y ADR-0009 §6-bis.2 dejó escrito que el dictamen jurídico externo
se encarga **en paralelo** a la construcción, no antes. Lo que este repositorio sí
sostiene es la disciplina clean-room: la especificación pública y el corpus propio
como únicas fuentes, cada hecho medido registrado en
`packages/dwg-codec/SOURCE_REGISTER.json` **antes** de tocar código (ADR-0007), y los
oráculos **sólo como binarios** — su código ni se consulta ni se descompila, y el
watermark del conversor se ignora y jamás se imita.

Encender las banderas no cambia el estado jurídico ni un bit. Lo que cambia es la
superficie expuesta, y por eso el encendido de la sección 8 lleva rollout por
organización y no una activación global.

## 6. El segundo oráculo: qué se intentó, qué lo impidió y qué haría falta

La política de este códec pide **dos validaciones independientes**
(`DWG_REQUIRED_INDEPENDENT_VALIDATIONS`), y hoy hay una: el ODA File Converter. La
cola del frente pedía cablear un segundo binario —`dwg2dxf` de LibreDWG o
equivalente— «y si no se puede instalar en este entorno, se declara con el intento y
el motivo». Esto es esa declaración.

**Qué se intentó, en este orden y en esta máquina** (Ubuntu 24.04, contenedor del
frente):

1. `apt-get update` y `apt-cache search libredwg`. El índice se descarga bien y la
   búsqueda vuelve **vacía**. No es un repositorio faltante: `/etc/apt/sources.list.d/ubuntu.sources`
   tiene habilitados `main universe restricted multiverse`, y un paquete de universe
   cualquiera sí resuelve. **LibreDWG no está empaquetado para esta distribución.**
2. `snap` y `flatpak`: ninguno de los dos existe en la imagen.
3. Preguntar por los artefactos publicados del proyecto —sólo la **lista** de
   binarios, no el código— a la API de GitHub. La respuesta es `HTTP 403` del proxy
   de la sesión: los repositorios que no están adjuntos a la sesión no son
   consultables. Desde aquí **no se puede ni averiguar si existe un binario
   precompilado**, mucho menos traerlo.

**Qué lo impidió de verdad, y no es la red.** Quedaba una vía: clonar el código
fuente y compilarlo. No se hizo, y la razón no es que no compilaría. La regla de la
campaña dice, con todas sus letras, que **los oráculos valen sólo como binarios**, y
el propio arnés la lleva escrita en el reporte que produce: «sólo el BINARIO es
oráculo permitido; su código ni se consulta ni se descompila». Poner el fuente de
otra implementación de DWG en la misma máquina donde se escribe una reimplementación
clean-room es exactamente la contaminación que ADR-0007 existe para evitar. Y el
valor entero de un segundo oráculo está en que sea **independiente**: uno obtenido
poniéndole el código delante a quien implementa deja de ser evidencia independiente y
pasa a ser un problema legal. Habría costado más de lo que compra.

**Qué haría falta, concreto:**

1. **El binario, llegado de fuera.** O un paquete `libredwg-tools` en una
   distribución que la imagen de CI pueda instalar, o una compilación hecha en una
   máquina que **no** sea la de implementación, por alguien que no esté escribiendo
   este códec, cruzando sólo el ejecutable y su salida DXF.
2. **Su declaración como fuente.** Una entrada en
   `packages/dwg-codec/SOURCE_REGISTER.json` que lo declare oráculo **binario**, con
   herramienta, versión y procedencia de la compilación, exactamente como está
   declarado hoy el ODA File Converter.
3. **Un transporte de conversor en el arnés.** `scripts/dwg/oda-roundtrip.mjs` invoca
   hoy el conversor con la línea de órdenes de ODA, escrita fija: un directorio de
   entrada, uno de salida, versión de destino, formato y dos banderas. `dwg2dxf` tiene
   otra forma —archivo a archivo, con `-o`—, así que el arnés necesita separar «qué
   conversor» de «cómo se invoca», con el nombre del oráculo dentro de cada caso del
   reporte para que la evidencia diga **cuál** de los dos lo respaldó. Ese es el
   trabajo real, y es pequeño: la comparación campo a campo contra el DXF ya está
   escrita y no cambia.
4. **Que el gate cuente dos.** `check-oracle-evidence.mjs` hoy sólo pregunta si el
   caso está respaldado; con dos oráculos tiene que exigir cuáles, y
   `independentValidations` en `DWG_PROMOTION_GATES` deja de ser cero.

Mientras tanto, y hasta que eso exista, **este documento no afirma doble validación**.
La sección 3 mide contra un DXF oráculo de autoría propia congelado en el corpus, que
estrecha el hueco porque esos valores los escribió otro programa, pero no lo cierra:
sigue siendo nuestro decodificador el que lee nuestro archivo.

## 7. Lo que el titular corre en su máquina

Los pasos exactos, con el conversor con licencia que aquí no existe. La lista de
casos **se deriva del arnés**: si mañana el writer aprende una clase y el arnés gana
un caso, esta tabla lo trae sola y `check-firma-package.mjs` falla hasta que se
regenere. Copiarla a mano fue precisamente lo que dejó la evidencia del oráculo
cubriendo menos de lo que el arnés ya definía.

<!-- generado:pasos-del-titular · lo produce scripts/dwg/check-firma-package.mjs --write; no se edita a mano -->
```sh
# 1. El conversor con licencia del titular. En Windows, la ruta del .exe.
export ODA_FILE_CONVERTER=/ruta/a/ODAFileConverter

# 2. El clon local del repositorio de conformidad. Sin esto los gates DWG
#    mienten por entorno (AGENTS.md, costumbres operativas).
export VALLE_DWG_CORPUS_MIRROR=/ruta/al/repo/valle-design-dwg-conformance

# 3. El arnés: escribe cada caso con el writer INTERNO y con la API PÚBLICA,
#    los hace convertir a DXF por el conversor ajeno y coteja campo a campo.
node scripts/dwg/oda-roundtrip.mjs

# 4. El gate vuelve a contar. Con todo respaldado dice «LA EVIDENCIA YA ALCANZA».
npm run check:dwg-oraculo

# 5. Sólo entonces, el commit del encendido — la sección «El commit del
#    encendido, exacto» de esta misma página lo escribe paso por paso.
git add docs/cad/evidence/dwg-oda-roundtrip.json
```

El paso 3 escribe **24** archivos: cada caso del arnés y su gemelo
`-publico` —el que produce `writeCanonicalDwg`, la API que el producto usaría—.
Cotejar sólo el writer interno dejaría sin medir justamente el camino público, que
es el que ADR-0009 §8.2 exige.

| # | Caso | Qué ejercita |
| --- | --- | --- |
| 1 | caso `vacio` (+ `vacio-publico`) | sin entidades |
| 2 | caso `capa-linea` (+ `capa-linea-publico`) | entidades: line · capas propias: 1 |
| 3 | caso `figuras` (+ `figuras-publico`) | entidades: arc, circle, lwpolyline, point, text |
| 4 | caso `capa-tipo-de-linea` (+ `capa-tipo-de-linea-publico`) | entidades: line · capas propias: 1 (con tipo de línea) · tabla de tipos de línea propia |
| 5 | caso `sombreado-solido` (+ `sombreado-solido-publico`) | entidades: hatch · capas propias: 1 |
| 6 | caso `sombreado-patron` (+ `sombreado-patron-publico`) | entidades: hatch · capas propias: 1 |
| 7 | caso `parrafo-mtext` (+ `parrafo-mtext-publico`) | entidades: mtext · capas propias: 1 |
| 8 | caso `elipse` (+ `elipse-publico`) | entidades: ellipse · capas propias: 1 |
| 9 | caso `capa-estado` (+ `capa-estado-publico`) | entidades: line · capas propias: 2 (congelada, bloqueada) |
| 10 | caso `bloque-con-atributos` (+ `bloque-con-atributos-publico`) | entidades: insert · capas propias: 1 · bloques de usuario: 1 · atributos en la inserción: 2 |
| 11 | caso `hoja-con-ventana` (+ `hoja-con-ventana-publico`) | entidades: line, viewport · capas propias: 1 · en espacio papel: 2 |
| 12 | caso `bloque-insert` (+ `bloque-insert-publico`) | entidades: insert · bloques de usuario: 1 |
<!-- /generado:pasos-del-titular -->

Dos casos merecen una nota, porque su forma no es casual:

- El caso `bloque-con-atributos` lleva **dos** atributos a propósito. Con uno solo,
  el primero y el último apuntan al mismo handle y no se ejercita ni el enlace entre
  atributos ni la distinción entre primero y último.
- El caso `hoja-con-ventana` pone entidades en la hoja **y** en el modelo. Con una
  sola por espacio, las dos posiciones de cadena serían «aislada» y la separación
  entre los dos espacios no se ejercitaría.

## 8. Dónde está hoy el oráculo externo

<!-- generado:cobertura-del-oraculo · lo produce scripts/dwg/check-firma-package.mjs --write; no se edita a mano -->
- artefacto: `docs/cad/evidence/dwg-oda-roundtrip.json` (generado 2026-08-21T16:04:21.826Z)
- conversor: ODA File Converter 27.1
- casos exigidos: 24 · respaldados: 4 · sin respaldo: 20

Sin respaldo del conversor ajeno, con su motivo:

- `vacio-publico` — no está en el reporte
- `capa-linea-publico` — no está en el reporte
- `figuras-publico` — no está en el reporte
- `capa-tipo-de-linea` — no está en el reporte
- `capa-tipo-de-linea-publico` — no está en el reporte
- `sombreado-solido` — no está en el reporte
- `sombreado-solido-publico` — no está en el reporte
- `sombreado-patron` — no está en el reporte
- `sombreado-patron-publico` — no está en el reporte
- `parrafo-mtext` — no está en el reporte
- `parrafo-mtext-publico` — no está en el reporte
- `elipse` — no está en el reporte
- `elipse-publico` — no está en el reporte
- `capa-estado` — no está en el reporte
- `capa-estado-publico` — no está en el reporte
- `bloque-con-atributos` — no está en el reporte
- `bloque-con-atributos-publico` — no está en el reporte
- `hoja-con-ventana` — no está en el reporte
- `hoja-con-ventana-publico` — no está en el reporte
- `bloque-insert-publico` — no está en el reporte
<!-- /generado:cobertura-del-oraculo -->

Un caso cuenta **sólo** si el conversor ajeno lo convirtió **y** la comparación campo
a campo coincidió. Convertirlo sin cotejarlo no prueba nada: el conversor podría estar
escribiendo un DXF vacío con exit cero.

`npm run check:dwg-oraculo` dice hoy `false` y **tiene que seguir diciéndolo** hasta
que el paso 3 de la sección 7 corra entero. Este paquete explica qué falta; no lo
declara hecho.

## 9. El commit del encendido, exacto

Cuando —y sólo cuando— la sección 8 diga que todos los casos exigidos están
respaldados, el encendido es este cambio y ningún otro:

1. `docs/cad/evidence/dwg-oda-roundtrip.json` regenerado y committeado, con el reporte
   del conversor ajeno cubriendo cada caso del arnés y su gemelo `-publico`.
2. `apps/web/src/lib/cad/dwg-export-flag.ts`: `externalOracleVerified` a `true`. Es el
   único gate de exportación que falta, y `check-oracle-evidence.mjs` lo verifica
   contra la evidencia del punto anterior en la misma corrida.
3. `apps/web/src/lib/cad/dwg-interop-flag.ts`: los gates de `DWG_PROMOTION_GATES` que
   la evidencia ya sostiene —`admittedCorpusBundles`, `independentValidations`,
   `labEntityImportSupported`, `canonicalMappingVerified`— dejan de ser cero y falso.
   `promotionAdrSigned`, `legalReviewCleared` y `securityReviewCleared` **no los pone
   un programa**: los pone el titular firmando, y `legalReviewCleared` no se toca sin
   el dictamen externo en la mano.
4. Las dos banderas a `true`, con rollout por organización y no activación global.
5. El módulo de interfaz que cablea el botón entra en la lista blanca de
   `scripts/dwg/check-product-boundary.mjs` **en el mismo commit**, con la sección de
   ADR que lo autoriza citada al lado.
6. La ADR: una sección nueva en `docs/adr/0009-dwg-promotion-package.md` que **enlaza
   esta página** en vez de repetir sus cifras. Ese injerto lo aplica el coordinador —
   `docs/adr/` no es territorio de este frente; el diseño completo está en
   `docs/history/execution/frentes-superar-20260904/dwg-peticiones.md`.

Y lo que ese commit **no** hace: no declara disponibilidad general, no afirma
compatibilidad con AutoCAD real, y no cierra `legalReviewCleared`.

## 10. Cómo se verifica esta página

```sh
node scripts/dwg/check-firma-package.spec.mjs   # el gate sabe ver lo que persigue
node scripts/dwg/check-firma-package.mjs        # la página no afirma de más
npm run check:dwg-oraculo                       # y sigue diciendo false
```

El gate falla si esta página nombra un caso que el arnés no tiene, si se salta uno que
sí tiene, si un bloque generado quedó atrás respecto de su evidencia, si alguien
escribió a mano un porcentaje, una fracción o un recuento de material fuera de un
bloque, o si alguna de las dos banderas ya está encendida.
