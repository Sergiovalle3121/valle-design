# F1 · DWG dentro del producto

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `packages/dwg-codec/**`
- `apps/web/src/lib/cad/dwg-*`
- `apps/web/src/lib/cad/interop*`
- `scripts/dwg/**`
- `docs/cad/evidence/dwg-*`
- `el repo valle-design-dwg-conformance completo`

## Cola

1. Writer público: de 9 clases a las de un plano de despacho — INSERT con ATTRIB, DIMENSION con su bloque anónimo, LEADER/MLEADER, HATCH de patrón (hoy sólo sólido), SPLINE, TABLE, VIEWPORT y espacio papel. Cada clase verificada por el oráculo externo antes de darla por buena.

2. Escritura de la familia moderna (AC1024/AC1027/AC1032): un cliente pedirá «guárdalo en 2018».

3. Preservación opaca en round-trip DENTRO del producto: proxies, objetos AEC y ACIS viajan intactos de entrada a salida, con su manifiesto de pérdida visible.

4. Segundo oráculo externo como binario (dwg2dxf de LibreDWG o equivalente) cableado al arnés, para que «doble validación» deje de ser una etiqueta. Si no se puede instalar en este entorno, se declara con el intento y el motivo.

5. Paquete de firma: ADR-0009 §encendido con matriz de soporte, límites, riesgos y checklist, listo para que el titular encienda DWG_IMPORT_FLAG y DWG_EXPORT_FLAG con un solo commit.

## Cierre

Corpus completo en cero discrepancias con las clases nuevas; `dwg-oda-roundtrip.json` con ≥20 casos sobre el writer público; documento de firma en `docs/adr/`.

## Lo que hay que tener presente

Las dos banderas NO se encienden en esta campaña. Clean-room: la ODS pública y el corpus propio son las únicas fuentes; los oráculos sólo como binarios; cada hecho nuevo al SOURCE_REGISTER ANTES de tocar código.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/dwg-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-dwg` sobre la rama `campana/superar/dwg`. Commits sí;
  **push a origin no** (el coordinador hace un push por ventana).
- **R6 Las reglas de la casa, intactas.** Prohibido relajar gates, umbrales, goldens o
  presupuestos. Prohibido tocar identificadores persistidos (IDENTITY.md, ADR-0010).
  Prohibido renombrar `data-testid`. Fix-or-hide: lo que no gana su evidencia no es visible.
  Ningún claim sin evidencia; lo parcial se declara «todavía no» en tu bitácora, con fecha.
  Las banderas `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` NO se encienden en esta campaña.
- **R7 Bitácora.** Este archivo es tu memoria. Si tu contexto se compacta, lo relees primero.
  Nunca se pregunta al titular: se decide, se anota y se sigue.

## Cómo se valida antes de dar algo por hecho

```
cd /home/user/vd-dwg
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### 2026-09-04 · Entregable 1/5 — arnés de re-escritura del corpus

**Qué se construyó.** `scripts/dwg/corpus-rewrite.mjs` (+ `corpus-rewrite-compare.mjs`,
partido por el presupuesto de 800 líneas) y su spec. Por cada uno de los 57 fixtures
ADMITIDOS: decodificar → ofrecer cada entidad al writer → armar un archivo propio →
releerlo → cotejar CAMPO A CAMPO → anclar los valores contra el DXF del oráculo con los
helpers de `dxf-oracle.mjs` importados sin modificar. Evidencia en
`docs/cad/evidence/dwg-corpus-rewrite.json`, regenerable y determinista.

**La cifra de partida, tal como salió.** De **327 entidades ajenas el writer regraba 269
(82,3 %)** y rechaza 58. Las 269 vuelven **idénticas campo a campo** (cero diferencias) y
212 quedan ancladas al DXF del oráculo sin un solo valor distinto.

| Estado | Clases |
| --- | --- |
| `regrabada-integra` (8) | `arc`, `circle`, `ellipse`, `line`, `lwpolyline`, `mtext`, `point`, `text` |
| `regrabada-con-perdida-declarada` (2) | `hatch` (2 de 4: el patrón falla cerrado), `insert` (30 de 34: con ATTRIBs falla cerrado) |
| `no-escribible` (17) | `attdef`, `attrib`, `dimension`, `face3d`, `leader`, `mline`, `polyfaceMesh`, `polyline2d`, `polyline3d`, `polymesh`, `ray`, `solid`, `spline`, `tolerance`, `trace`, `viewport`, `xline` |

**Tres hechos que el arnés encontró y no se sabían con este detalle.**

1. La frontera del INSERT con atributos NO es «se escribe sin los ATTRIBs»: es un fallo
   CERRADO en `validateEntity` (`DWG_INPUT_INVALID: Writing insert attributes is not
   implemented by the phase-D4 laboratory`). Un INSERT con atributos hoy no se escribe en
   absoluto — 4 de 34 en el corpus. Lo mismo el HATCH de patrón: 2 de 4.
2. **62 de 74 capas cambian el nombre de su tipo de línea al re-escribirse**: el corpus
   ajeno lo deletrea `CONTINUOUS` y nuestro writer emite `Continuous`. No es pérdida de
   información (la capa sigue siendo continua) y no se ha tocado nada: queda REGISTRADO en
   `resumenDeObservacionesDeCapa`. Si un lector ajeno distingue mayúsculas ahí, esto sería
   un defecto real; que lo distinga o no NO está medido en este entorno.
3. Ninguna de las 269 entidades regrabadas movió un solo campo, y ninguna se apartó del
   DXF del oráculo. Color de capa, congelada/bloqueada y patrón de LTYPE propio también
   sobreviven exactos.

**El límite, escrito en el propio informe (`limiteDeclarado`).** El cotejo enfrenta
NUESTRO writer con NUESTRO lector: un error SIMÉTRICO seguiría oculto. El anclaje al DXF
del oráculo lo estrecha —esos valores los escribió otro— pero no lo cierra. Sólo un
conversor ajeno leyendo NUESTRO archivo lo cierra, y eso es `oda-roundtrip.mjs`, acción
del titular con su binario con licencia.

**Cómo se corre** (el prefijo de entorno tiene que estar EXPORTADO: `--check` sin corpus
falla cerrado a propósito, y no inventa una ruta por defecto — esa atadura a una máquina
es la que `oda-roundtrip.mjs` se quitó el 2026-09-02):

```
export VALLE_DWG_CORPUS_MIRROR=/home/user/valle-design-dwg-conformance
node scripts/dwg/corpus-rewrite.spec.mjs && node scripts/dwg/corpus-rewrite.mjs --check
```

**Esto es el patrón de medida de 2, 3 y 4.** Cada clase que el writer aprenda se ve como
una fila que cambia de estado en `matrizPorClase`, y el porcentaje del veredicto sube
solo. No hace falta un informe nuevo por clase.

### 2026-09-04 · Entregable 2/5 — el achurado de patrón deja de desaparecer del DWG

**Qué estaba mal.** `emitHatch` fijaba el bit de relleno sólido a 1 y `validateEntity`
rechazaba cerrado cualquier otro sombreado (`DWG_VERSION_DECODER_UNSUPPORTED`), así que
todo achurado con trama se descartaba con la pérdida `hatch-pattern-not-writable`. El
motivo escrito —«el canónico lleva el NOMBRE del patrón pero no su definición»— había
dejado de ser cierto: `apps/web/src/lib/cad/hatch-pattern-table.ts` es una tabla PROPIA
con ángulo, separación, desfase, corrimiento y trazos por familia, y ya alimenta la
pantalla, el papel y el DXF. Lo único que faltaba era llevarla al DWG.

**Qué se construyó.**

- `emitHatch` abre la rama SIN relleno sólido exactamente como la registra el hecho de
  HATCH R2000: ángulo BD, escala BD, bit de doble trama, recuento BS de líneas de
  definición con ángulo BD, punto base 2BD, desfase 2BD y recuento BS de trazos con sus
  longitudes BD. El bit de sólido sale del modelo en vez de estar clavado. De paso,
  `pixelSize` se emite cuando algún camino trae el bit DERIVADO —la MISMA condición con la
  que el decodificador decide leerlo—: antes no se emitía nunca y un camino derivado habría
  desincronizado el cuerpo entero.
- `validateEntity` acepta el sombreado de trama cuando la definición viaja con él y sigue
  fallando cerrado cuando no viaja. Se añadió `validateHatch`, que NO existía: el HATCH
  salía del primer `switch` sin pasar por el segundo y su geometría no se validaba.
- El lado del producto (`dwg-native-writer.ts`) resuelve nombre + ángulo + escala contra la
  tabla propia y manda la definición ya resuelta en `patternDefinition`. Reutiliza
  `cadHatchPatternDxfLines`, que es la MISMA función que escribe las líneas del DXF: el
  mismo sombreado exportado a DXF y a DWG lleva la misma trama, sin una segunda
  trigonometría que pudiera separarse.
- `canonical-to-dwg.ts` valida esa definición (entera o ninguna: media línea no da una
  trama fea, da un recuento que desincroniza el cuerpo) y conserva la pérdida CON CÓDIGO
  NUEVO —`hatch-pattern-definition-missing`— para el nombre que la tabla no conoce. No se
  le pone el respaldo ANSI31: un archivo que dice llevar tu trama y lleva otra es peor que
  uno que dice que no la lleva.
- `canonical.ts` (DWG → canónico) copia la trama MEDIDA del archivo en la misma forma. Sin
  eso, el gemelo público del caso del oráculo perdía el sombreado: verificado corriendo la
  cadena `writeAc1015MinimalFile → readDwg → dwgDatabaseToCanonicalDocument →
  writeCanonicalDwg → readDwg` sobre los diez casos.

**La cifra, tal como salió** (`node scripts/dwg/corpus-rewrite.mjs`, mismo arnés que el
entregable 1, mismo corpus fijado):

| | antes | ahora |
| --- | --- | --- |
| entidades ajenas regrabadas | 269/327 (82,3 %) | **271/327 (82,9 %)** |
| ancladas al DXF del oráculo | 212 | **214** |
| fila `hatch` | `regrabada-con-perdida-declarada` 4/2 | **`regrabada-integra` 4/4/4/4** |
| clases íntegras | 8 | **9** |

Los dos sombreados con trama del corpus ajeno (`11-hatch` y `21-hatch-islands`) vuelven
IDÉNTICOS campo a campo —incluidas sus líneas de definición— y quedan anclados al DXF del
oráculo de su bundle. `insert` queda como la ÚNICA clase con pérdida declarada.

**El hecho que hubo que medir, y está registrado.** `VALLE-CORPUS-HATCH-TRAMA` en
`SOURCE_REGISTER.json`: la disposición del bloque ya estaba en la ODS, pero no sus
UNIDADES. Medido en los dos sombreados con trama del corpus: la línea de definición del
ANSI31 guarda `0.7853981633974483` y el DXF del oráculo del mismo bundle escribe `53 =
45.0` — el DWG va en RADIANES donde el DXF va en GRADOS. El desfase es el MISMO vector en
los dos formatos, ya girado al dibujo: `45/46 = (-0.0883883476483184, 0.0883883476483184)`,
que es girar `(0, 0.125)` 45°. Y el ángulo de arriba es el GIRO del patrón, no el de sus
rayas: vale 0 mientras la raya vale 45.

**Ante el oráculo externo.** Caso `sombreado-patron` añadido a `CASES` (trama de DOS
familias CON trazos: una familia continua no distinguiría un recuento bien puesto de uno
que el lector interpreta de casualidad). `npm run check:dwg-oraculo` lo cuenta ya como
PENDIENTE junto a su gemelo `-publico`: 20 casos exigidos, 4 cubiertos. Sigue siendo
acción del titular con su binario con licencia.

**Cómo se comprueba** (todo corrido hasta verlo verde):

```
npx tsx --test packages/dwg-codec/tests/unit/hatch-pattern-write.spec.ts   # 8 pruebas
cd apps/web && npx tsx src/lib/cad/dwg-native-writer.spec.ts
export VALLE_DWG_CORPUS_MIRROR=/home/user/valle-design-dwg-conformance
node scripts/dwg/corpus-rewrite.spec.mjs && node scripts/dwg/corpus-rewrite.mjs --check
npm run check --workspace=@valle-design/dwg-codec && npm run typecheck
```

La spec del códec se verificó por MUTACIÓN: intercambiar el punto base y el desfase en el
emisor la pone roja en 3 de 8.

### 2026-09-04 · Entregable 3/5 — el cuadro de rótulo llega con su texto

**Qué estaba roto, medido.** No era una pérdida parcial. `emitInsert` fijaba el bit de
ATTRIBs a 0 y `validateEntity` fallaba CERRADO ante un INSERT que dijera llevarlos
(`Writing insert attributes is not implemented by the phase-D4 laboratory`): de las 34
referencias a bloque del corpus ajeno, **4 no se escribían en absoluto** — el bloque
entero desaparecía del archivo, no sólo su texto. Un plano exportado perdía su cajetín.

**Qué se construyó.**

- `ac1015-entity-emitters.ts`: `emitAttrib` (los trece campos de TEXT por la MISMA función
  que `emitText` —el ATTRIB no es «como un TEXT», ES un TEXT más tres campos— seguidos de
  tag TV, longitud de campo BS y banderas RC), y el bit de ATTRIBs del INSERT sale del
  modelo en vez de estar clavado a 0.
- `ac1015-entity-writer.ts`: acepta `attrib` y `seqend`; el SEQEND no emite un solo bit de
  dato de tipo (medido: en los cuatro SEQEND del corpus el tamaño declarado cae EXACTAMENTE
  donde termina el común). `validatedAttributeHandles` exige que la bandera y los tres
  handles del grupo viajen JUNTOS: prometer atributos que el archivo no lleva y escribir
  objetos que la bandera no anuncia fallan los dos.
- `ac1015-entity-validators.ts` (NUEVO): los criterios de entrada de cada clase, partidos
  del writer por el presupuesto de 800 líneas — la misma costura que ya separó los
  emisores. `validateText` pasa a `validateTextFields` sobre `DwgTextFields` para que
  ATTRIB y TEXT se validen por el mismo camino.
- `ac1015-minimal-file-entities.ts` (NUEVO): el reparto de una lista de entidades con su
  cadena, y el grupo ATTRIB+SEQEND de un INSERT con rótulo.
- `ac1015-minimal-file-plan.ts` / `-support.ts`: el plan reparte los handles del grupo
  DESPUÉS de todas las entidades de su espacio. No es comodidad: las posiciones
  `first`/`middle`/`last` usan los códigos relativos ±1 ya medidos, que exigen handles
  consecutivos. Intercalarlos rompería la cadena del espacio en silencio.
- `canonical.ts` / `canonical-to-dwg.ts` / `write.ts`: el camino DWG→canónico proyecta
  ahora `positionedAttributes` (antes sólo el mapa plano tag→valor, y la vuelta no podía
  escribir nada), y el canónico→DWG escribe los ATTRIB desde ahí.
- `apps/web/src/lib/cad/dwg-native-writer.ts`: `toCanonicalInsert` convierte la rotación de
  cada atributo de GRADOS a RADIANES, la misma trampa que ya pagaron ARC, INSERT, ELLIPSE,
  MTEXT y el HATCH.

**Lo que NO se dibuja al azar.** Un `attributes` plano sin su gemelo `positionedAttributes`
se declara como pérdida `insert-attributes-without-geometry`: el mapa dice qué vale cada
etiqueta y no dónde se dibuja, y deducir la posición desde la definición del bloque pondría
el texto en un sitio distinto del que el usuario ve —que es exactamente lo que el
exportador DXF ya documenta—.

**El hecho que hubo que medir, y está registrado.** `VALLE-CORPUS-INSERT-ATRIBUTOS` en
`SOURCE_REGISTER.json`. La ODS ya registraba QUÉ handles lleva un INSERT con ATTRIBs; no
sus CÓDIGOS ni de quién es la propiedad. Medido bit a bit en los cuatro INSERT con
atributos del corpus (`12-attrib`, `22-nested-attribs`):

- flujo del INSERT: `[5:bloque 4:primerATTRIB 4:últimoATTRIB 3:SEQEND]` — primero y último
  son punteros BLANDOS y el SEQEND es propietario DURO;
- con UN solo atributo, primero y último son el MISMO handle (`4:280 4:280 3:281`);
- cada ATTRIB y el SEQEND van en modo 0 con el INSERT como propietario, no el bloque —
  también cuando el INSERT vive dentro de otro bloque;
- los ATTRIB forman su PROPIA cadena (`4:0 6:0` el primero, `8:0 4:0` el último);
- cada ATTRIB cierra con el hard pointer a su STYLE, como un TEXT; el SEQEND no;
- las banderas del atributo y su longitud de campo están a CERO en los siete ATTRIB del
  corpus: la semántica de «invisible» no está ejercida por material ajeno, así que se
  escriben ceros y se DECLARA (`attrib-flags-not-measured`).

**La cifra sobre material ajeno** (mismo arnés del entregable 1, mismo corpus fijado):

| | antes | ahora |
| --- | --- | --- |
| entidades regrabadas | 271/327 (82,9 %) | **282/327 (86,2 %)** |
| ancladas al DXF del oráculo | 214 | **225** |
| clases `regrabada-integra` | 10 | **11** (entra `attrib`) |
| clases con pérdida declarada | 1 (`insert`) | **0** |
| fila `insert` | 34/30 con pérdida | **34/34/34/34 íntegra** |
| fila `attrib` | no escribible 7/0 | **regrabada-integra 7/7/7/7** |

`12-attrib` y `22-nested-attribs` pasan de perder sus INSERT a re-escribirlos enteros, con
sus siete atributos volviendo campo a campo y anclados al DXF del oráculo.

**Ante el oráculo externo.** Caso `bloque-con-atributos` en `CASES`, con DOS atributos a
propósito: con uno solo, primero y último apuntan al mismo handle y no se ejercita ni el
enlace ±1 entre atributos ni la distinción entre primero y último.
`npm run check:dwg-oraculo` lo cuenta ya como PENDIENTE junto a su gemelo `-publico`: 22
casos exigidos, 4 cubiertos. Sigue siendo acción del titular con su binario con licencia.

**Cómo se comprueba** (todo corrido hasta verlo verde):

```
npx tsx --test packages/dwg-codec/tests/unit/insert-attrib-write.spec.ts   # 11 pruebas
cd apps/web && npx tsx src/lib/cad/dwg-native-writer.spec.ts               # sección 5.D
export VALLE_DWG_CORPUS_MIRROR=/home/user/valle-design-dwg-conformance
node scripts/dwg/corpus-rewrite.spec.mjs && node scripts/dwg/corpus-rewrite.mjs --check
npm run check --workspace=@valle-design/dwg-codec && npm run typecheck
```

El comparador nuevo del arnés se verificó por MUTACIÓN: quitar la etiqueta de
`projectForOracle` pone roja su spec.

### 2026-09-04 · Entregable 4/5 — el espacio papel con una ventana: la hoja sale como hoja

**Qué estaba roto, y no era lo que la ficha suponía.** El archivo mínimo ya escribía el
BLOCK_RECORD `*Paper_Space`, su BLOCK/ENDBLK y el LAYOUT «Layout1» desde la ola 3 — los
andamios de la hoja llevaban semanas puestos. Lo que no había era **por dónde entrar**: la
cadena de entidades del archivo era UNA y era la del modelo, así que `*Paper_Space`
apuntaba a primera y última entidad NULAS por construcción y ninguna entidad podía caer
ahí. En el camino público el efecto era doble y silencioso: el adaptador del producto
vaciaba `paperSpaces` con una sola pérdida general, y `CanonicalCadDocumentJson.paperSpaces`
era literalmente `never[]` — el tipo decía «aquí no cabe nada». Un plano con lámina se
exportaba con el cajetín y el marco **encima del dibujo, en model space**, o sin ellos. Y
`viewport` era una de las 17 clases que el arnés del entregable 1 marcaba `no-escribible`.

**El hecho, medido ANTES de tocar código (ADR-0007).** `VALLE-CORPUS-VIEWPORT-PAPEL` en
`packages/dwg-codec/SOURCE_REGISTER.json` (22/22 fuentes, provenance verde), sobre los dos
VIEWPORT y los tres VPORT ENTITY HEADER de `23-layout-viewport`:

1. una entidad de hoja viaja en **modo 1** y sin propietario en el flujo, igual que una de
   model space viaja en modo 2 — no en modo 0 con `*Paper_Space` de dueño;
2. los dos espacios tienen **cadenas separadas**, con las mismas cuatro formas de puntero
   (`4:0` / `6:0` / `8:0`) ya medidas para la del modelo;
3. la **cola del flujo de un VIEWPORT son cuatro punteros duros** detrás de la capa:
   `[5:0 5:<VPORT ENT HDR> 5:0 5:0]` — contorno de recorte nulo, la entrada de la ventana, y
   los dos UCS nulos;
4. el **cuerpo del VPORT ENTITY HEADER**: común de tabla, nombre VACÍO, la cabeza de entrada
   ya conocida y UN bit de bandera (1 en los dos que cuelgan de una ventana, 0 en el que no),
   con flujo `H(4,control) H(3,0) H(5,0) H(4,ventana) H(5,0)`;
5. los valores que un productor real escribe en una ventana de planta a escala 1 (lente 50,
   snap y grid (10,10), zoom de círculo 100, UCS por ventana 1…), y que **la altura de vista
   es la del MODELO**: la escala sale de altura-de-papel entre altura-de-vista, no de un
   número aparte.

**Qué se construyó.**

- `writer/ac1015-entity-writer.ts`: `space?: "model" | "paper"` en las opciones de entidad
  (modo 1 frente a modo 2, y prohibido junto a `ownerBlockHandle`), `viewportEntityHeaderHandle`
  obligatorio para un VIEWPORT y prohibido para el resto, y `emitAc1015ViewportTailHandles`
  con los cuatro punteros medidos — una sola función porque la escriben DOS composiciones.
- `writer/ac1015-entity-emitters.ts` / `-validators.ts`: `emitViewport` (espejo campo a campo
  de `decodeViewport`, cola de R2000+ incluida) y `validateViewport`, que **falla cerrado**
  con capas congeladas (su recuento va en el cuerpo y sus handles en el flujo: escribir el
  primero sin los segundos desincroniza todo) y con una ventana de área cero.
- `writer/ac1015-minimal-file-plan.ts` y `-support.ts`: `space` en el spec de entidad, la
  partición por espacio hecha **una sola vez** en la validación (dos filtros gemelos podrían
  separarse y dejar una cadena apuntando al otro espacio), y handles para las entradas VPORT
  ENTITY HEADER repartidos DESPUÉS de los dos espacios.
- `writer/ac1015-minimal-file-entities.ts`: `pushAc1015DynamicScopes` — bloques de usuario,
  model space, la HOJA, las entradas de las ventanas y los cuatro marcadores, en el orden de
  handle que el plan reparte. `cadenaDelEspacio` es la MISMA función para los tres.
- `writer/ac1015-structure-writers.ts`: `writeAc1015VportEntityHeaderBody`, y el control de
  la tabla (0x0B) ya lista sus entradas en vez de declarar cero.
- `reader/`: el lector **REPORTA** el espacio de cada entidad (`space: "model" | "paper" |
  undefined`). No mueve nada —una entidad de papel sigue en `modelSpaceEntities` con su
  diagnóstico— pero el dato deja de perderse: sin él, re-escribir un archivo ajeno mandaba
  su hoja al modelo en silencio.
- `api/canonical-paper.ts` (NUEVO): la traducción de la hoja en las dos direcciones, con la
  inversión de la dirección de mirada en UN solo sitio. `api/canonical.ts` deja de declarar
  `paperSpaces: never[]`; `api/write.ts` pasa el espacio al archivo.
- `apps/web/src/lib/cad/dwg-native-writer.ts`: `toCanonicalPaperSpaces` proyecta la lámina y
  declara lo que no viaja con código propio.

**La cifra sobre material ajeno** (mismo arnés, mismo corpus fijado): de **282/327 (86,2 %)
a 284/327 (86,9 %)**; ancladas al DXF del oráculo de 225 a 227; `viewport` pasa de
`no-escribible` a `regrabada-integra` 2/2/2/2; clases íntegras de 11 a 12; clases no
escribibles de 17 a 15 (`viewport` sale, y `attrib` ya había salido).

**Cómo se demuestra.**

```
npx tsx --test packages/dwg-codec/tests/unit/paper-space-viewport-write.spec.ts   # 17
cd apps/web && npx tsx src/lib/cad/dwg-native-writer.spec.ts                      # sección 5.E
export VALLE_DWG_CORPUS_MIRROR=/home/user/valle-design-dwg-conformance
node scripts/dwg/corpus-rewrite.spec.mjs && node scripts/dwg/corpus-rewrite.mjs --check
npm run typecheck && npm test
```

La prueba que importa **no** es que la ventana «vuelva»: es que el spec lee el flujo de
handles del BLOCK_RECORD `*Paper_Space` **del archivo producido** y exige que su primera y
su última entidad sean las de la hoja y que ninguna del modelo esté ahí. Un round-trip por
el modelo neutral no puede decir eso, porque el lector todavía coloca las entidades de papel
en `modelSpaceEntities`.

Caso `hoja-con-ventana` en `scripts/dwg/oda-roundtrip-cases.mjs` (12 casos, 24 con sus
gemelos públicos), con DOS entidades en la hoja y una en el modelo a propósito: con una sola
por espacio las dos posiciones de cadena serían «isolated» y no se ejercitaría la separación.

`corpus-rewrite.spec.mjs` baja de 155 a 153 comprobaciones y NO es una spec debilitada: el
recuento es dependiente de los datos —dos de sus asertos son condicionales a que una fila
esté en `no-escribible` o fuera de `regrabada-integra`— y `viewport` dejó de estar en las
dos. Es la misma aritmética que ya movió el número cuando entraron el HATCH de trama y el
ATTRIB.

### 2026-09-04 · Entregable 5/5 — el paquete de firma del encendido, con sus cifras atadas

**Qué se construyó.** `docs/cad/evidence/dwg-firma-encendido-20260904.md`: el documento
que el titular lee ANTES de encender las dos banderas, y `scripts/dwg/check-firma-package.mjs`
(+ su spec) que impide que envejezca. Las banderas siguen apagadas y
`npm run check:dwg-oraculo` sigue diciendo `false`: el paquete explica qué falta, no lo
declara hecho.

**El problema que resuelve, que es de forma y no de contenido.** Un paquete de firma
falla siempre de las dos mismas maneras, y las dos son silenciosas. **Envejece**: se
escribe con las cifras del día y seis semanas después el writer aprendió dos clases y el
documento sigue diciendo la cifra vieja, sin que nada la compare con nada. Y **miente
sobre la lista de pasos**: si copia a mano los casos del arnés, el día que `CASES` crece
el titular corre una lista incompleta, cree que terminó, y la evidencia queda con un
hueco que ningún gate ve — que es EXACTAMENTE lo que le pasó a `dwg-oda-roundtrip.json`,
committeado con cuatro casos mientras el arnés ya definía muchos más.

**Cómo se resolvió.** El documento no escribe cifras: lleva CINCO BLOQUES GENERADOS
—`banderas`, `veredicto`, `matriz-por-clase`, `pasos-del-titular`, `cobertura-del-oraculo`—
delimitados por comentarios HTML, que el gate produce desde los artefactos de evidencia y
desde las fuentes del producto. `--check` los regenera y exige igualdad exacta; `--write`
los reescribe. Es el mismo reparto que ya usa `scripts/cad/rubric.mjs --markdown --check`
para la matriz competitiva, y es la regla 4 de la campaña de cimientos aplicada al
documento que más tentación da de copiar sus números.

Las tres columnas de la matriz por clase salen de sitios DISTINTOS a propósito: la
lectura de `dwg-corpus-validation.json`, la escritura de `dwg-corpus-rewrite.json` y el
perfil de importación PARSEADO de `BETA_PROFILE_ENTITY_KINDS` en `dwg-native-reader.ts`.
El hueco interesante está justo entre ellas: una clase que el lector lee y el perfil no
admite es una pérdida del PRODUCTO, no del laboratorio, y hasta ahora eso no se veía
junto en ningún sitio.

**Y una cosa que el propio documento tiene que declarar y declara**: los denominadores de
las dos columnas medidas NO son el mismo conjunto. La lectura cuenta lo que el DXF oráculo
declara por fixture; la escritura cuenta cada entidad que el decodificador le ofreció al
writer, incluidas las que viven dentro de los bloques anónimos `*D` que el DXF oráculo no
describe. Restarlas sin saberlo daría un número falso.

**Las cuatro reglas del gate, y por qué cada una existe.**

1. **Bloques regenerados y comparados** — ninguna cifra se queda atrás sin que el gate lo
   diga, y un bloque cuya clave nadie genera se DENUNCIA en vez de reescribirse en
   silencio (si se reescribiera, un bloque huérfano parecería verificado).
2. **Los casos se derivan del arnés.** La forma es `caso ‹nombre›` entre acentos graves:
   cualquier caso nombrado así tiene que existir en `CASES`, y todo caso de `CASES` tiene
   que aparecer nombrado al menos una vez. Inventar uno y saltarse uno fallan los dos. La
   forma es EXPLÍCITA y no adivinada: en este documento conviven `no-escribible`,
   `local-mirror` y `dwg-corpus-rewrite.json` entre acentos graves, y ninguno es un caso.
3. **Ninguna cifra de cobertura a mano fuera de un bloque.** Un porcentaje, una fracción
   `N/M`, un «N de M» o un «N entidades/casos/clases…». Lo que NO persigue está probado
   con la misma dureza: una fecha, `ADR-0009 §8.2`, `AC1015`, la versión `27.1` del
   conversor y «16 MiB» no disparan nada. Un gate ruidoso se acaba apagando.
4. **Las dos banderas siguen apagadas.** Un paquete de firma publicado después del
   encendido deja de ser el documento que se lee antes de firmar y pasa a ser la
   explicación de por qué se firmó.

**La declaración honesta del segundo oráculo (§6 del paquete), que es lo que la cola 4
del frente pedía.** Se intentó, en este orden: `apt-cache search libredwg` con
`main universe restricted multiverse` habilitados → **vacío**, LibreDWG no está
empaquetado para Ubuntu 24.04 (verificado: un paquete de universe cualquiera sí resuelve);
`snap` y `flatpak` no existen en la imagen; y preguntar a la API de GitHub por la LISTA de
artefactos publicados —no por el código— devuelve `HTTP 403` del proxy de la sesión, así
que desde aquí no se puede ni averiguar si existe un binario precompilado. Quedaba
compilar el fuente, y **eso no se hizo a propósito**: la regla de la campaña dice que los
oráculos valen sólo como binarios, y el propio arnés la lleva escrita en el reporte que
produce («sólo el BINARIO es oráculo permitido; su código ni se consulta ni se
descompila»). Poner el fuente de otra implementación de DWG en la misma máquina donde se
escribe una reimplementación clean-room es la contaminación que ADR-0007 existe para
evitar, y un oráculo obtenido poniéndole el código delante a quien implementa deja de ser
evidencia independiente. Qué haría falta, concreto: el binario llegado de fuera (paquete
de distribución, o compilación en una máquina que no sea la de implementación); su entrada
en `SOURCE_REGISTER.json` como oráculo BINARIO con su procedencia; un transporte de
conversor en `oda-roundtrip.mjs` —hoy la línea de órdenes de ODA está escrita fija y
`dwg2dxf` tiene otra forma, archivo a archivo con `-o`—; y que `check-oracle-evidence.mjs`
exija CUÁL de los dos respalda cada caso.

**Un arreglo de camino: la lista de casos exigidos deja de derivarse dos veces.**
`check-oracle-evidence.mjs` exporta ahora `casosExigidos()` y `coberturaDelOraculo()`, y
sólo corre su `main()` cuando se le invoca directamente. El paquete de firma consume esas
dos funciones en vez de repetir la derivación: una segunda copia, aunque hoy diera el
mismo resultado, es la cifra viviendo en dos lugares que la regla 4 prohíbe. La salida de
`npm run check:dwg-oraculo` es idéntica byte a byte antes y después.

**Cómo se demuestra** (todo corrido hasta verlo verde, y sin necesitar el espejo del
corpus — el gate lee sólo artefactos committeados):

```
node scripts/dwg/check-firma-package.spec.mjs   # 50 comprobaciones
node scripts/dwg/check-firma-package.mjs        # la página no afirma de más
npm run check:dwg-oraculo                       # y sigue diciendo false
npm run typecheck
```

La spec está **verificada por mutación**, las tres reglas que importan: neutralizar el
detector de cifras, el de casos inventados o la comparación de bloques la pone roja cada
una por su lado. Cinco de sus comprobaciones toman el documento REAL, lo estropean a
propósito —caso inventado, caso saltado, fila editada a mano, bloque borrado, porcentaje
escrito a mano— y exigen que el gate lo note; ninguna escribe en el documento.

**Lo que queda fuera y va como petición.** `docs/adr/` no es territorio de este frente:
el injerto de la sección 10 en ADR-0009, con su texto completo, es `P-dwg-02` en
`dwg-peticiones.md`. Y encadenar `check:dwg-firma` dentro de `check:dwg` toca el
`package.json` de la raíz, archivo compartido: es `P-dwg-03`. **Hasta que el coordinador
aplique P-dwg-03, este gate no lo corre nadie automáticamente** — está escrito, pasa, y
espera su cable.

### 2026-09-04 · Cierre del frente — verificación de lo afirmado

No entra código nuevo. Se corrieron los gates y se comprobaron las afirmaciones de los
cinco entregables antes de dar el frente por cerrado. **Una no se sostuvo y está retirada**
(ver la entrada corregida sobre `check:cad` en «Todavía no»).

**Gates, con su salida literal.**

| Gate | Resultado |
| --- | --- |
| `npm run typecheck` | `Tasks: 8 successful, 8 total` · EXIT=0 |
| `npm run check:cad` **con** `VALLE_DWG_CORPUS_MIRROR` | EXIT=0, entero y verde |
| `npm run check:cad` **sin** la variable | EXIT=1 en `check:dwg-evidence` — falta el espejo, no una regresión |
| `npm test` de `packages/dwg-codec` | `# pass 512  # fail 0` · EXIT=0 |
| `node scripts/dwg/check-product-boundary.mjs` | `9 signatures, 8 product specs, 5 authorized runtime import site(s), 0 unauthorized` |
| `npm run check:dwg-oraculo` | `casos exigidos: 24 · casos respaldados: 4 · externalOracleVerified = false` |
| `node scripts/dwg/check-firma-package.mjs --check` | `✔ El paquete de firma no afirma nada que su evidencia no sostenga.` |

**Afirmaciones comprobadas corriendo su spec, no releyendo el informe.**

1. **La cifra de cobertura sobre material ajeno: CONFIRMADA exacta.**
   `VALLE_DWG_CORPUS_MIRROR=… node scripts/dwg/corpus-rewrite.spec.mjs` imprime
   `153 comprobaciones · corpus: 57 archivos ajenos · 284/327 entidades regrabadas (86.9%) ·
   12 clases íntegras, 0 con pérdida declarada, 15 no escribibles`. Coincide con lo que el
   entregable 4 declaró (284/327, 86,9 %, 12 íntegras, 15 no escribibles). Y
   `corpus-rewrite.mjs --check` responde `la evidencia coincide con una corrida fresca
   (57 archivos ajenos, 327 entidades)`: la evidencia committeada es de verdad regenerable.
   **Corrección menor de conteo:** el entregable 1 dijo «156 comprobaciones» y son **153**;
   sin el espejo el mismo spec corre 32 y lo DICE (`sin VALLE_DWG_CORPUS_MIRROR: la parte de
   corpus no corrió`), que es la mitad no-corpus prometida.
2. **Los tres entregables de escritura: CONFIRMADOS.**
   `npx tsx --test tests/unit/insert-attrib-write.spec.ts paper-space-viewport-write.spec.ts
   hatch-pattern-write.spec.ts` da `# pass 36  # fail 0` — exactamente los 8 + 11 + 17 que
   los entregables 2, 3 y 4 declararon, ni uno de menos.
3. **Las dos banderas siguen APAGADAS**, comprobado en el código y no en el informe:
   `DWG_EXPORT_FLAG: boolean = false` en `dwg-export-flag.ts` y
   `DWG_IMPORT_FLAG: boolean = false` en `dwg-interop-flag.ts`.

**Lo que este cierre NO hace:** no corrige el writer, no toca archivos compartidos y no
enciende nada. El límite de método que arrastran los cinco entregables sigue en pie y sin
suavizar — **ningún lector ajeno ha abierto todavía un archivo escrito por este writer**;
todo lo medido enfrenta nuestro writer con nuestro lector, estrechado por el anclaje al DXF
del oráculo, y `externalOracleVerified` sigue en `false` con 4 de 24 casos respaldados.


## «Todavía no»

- **2026-09-04 · Varias ventanas por hoja.** El archivo escribe UNA por lámina. No es un
  límite del formato ni del writer —la cadena de la hoja admite tantas como se le den— sino
  del alcance declarado de este entregable: cada ventana adicional necesita su propia entrada
  VPORT ENTITY HEADER y el corpus sólo enseña DOS ventanas en un archivo, las dos de la misma
  hoja, sin solapes. La segunda y siguientes se declaran como
  `paper-space-extra-viewport-not-written`.
- **2026-09-04 · Varias HOJAS.** El archivo mínimo escribe UN «Layout1» —su handle es fijo en
  el esquema canónico (0x1C) y el diccionario de layouts lo lista solo—. La segunda lámina se
  declara entera como `paper-space-beyond-first-not-written`. Abrirlo exige repartir
  BLOCK_RECORD, BLOCK/ENDBLK y LAYOUT por hoja en el tramo dinámico, que es trabajo del mismo
  tamaño que este entregable.
- **2026-09-04 · Ventana recortada por contorno.** El primer puntero de la cola del VIEWPORT
  es el contorno de recorte y este writer lo escribe NULO: las dos ventanas del corpus son
  rectangulares y ninguna lo usa. Escribirlo sin material ajeno que lo ejerza sería estrenar
  una forma no medida.
- **2026-09-04 · Capas congeladas por ventana.** El recuento viaja en el CUERPO y los handles
  de esas capas en el FLUJO FINAL. `validateViewport` **falla cerrado** con cualquier recuento
  distinto de cero en vez de redondearlo a cero, que escribiría una hoja donde todas las capas
  se ven — un dibujo distinto del pedido. Las dos ventanas del corpus traen cero, así que no
  hay material ajeno que lo ejerza.
- **2026-09-04 · La ventana va siempre en la capa "0".** Es donde la ponen las dos del corpus
  y donde la deja el camino público: el documento canónico no le da capa propia a una ventana.
  El `CadPaperViewport` del producto tampoco tiene ese campo, y añadírselo tocaría el esquema
  del documento canónico, que es archivo COMPARTIDO (R2).
- **2026-09-04 · La lectura sigue metiendo la hoja en model space.** `readAc1015Database`
  coloca las entidades de papel en `modelSpaceEntities` con el diagnóstico
  `database-paper-space-entity`, como antes; lo único que cambió es que ahora DICE de qué
  espacio son. Modelar la hoja en la base neutral movería entidades de lista y cambiaría los
  recuentos de `dwg-corpus-validation.json`, que es la medición del LECTOR y de otro
  entregable: se declara en vez de mezclarse.
- **2026-09-04 · El LAYOUT no apunta a su ventana activa.** El flujo del LAYOUT lleva un
  puntero a «último viewport activo» y sigue escribiéndose nulo: qué escribe ahí un productor
  real no está medido en este corpus y no se adivina.
- **2026-09-04 · El ancho del rectángulo de modelo se DERIVA en la vuelta.** El VIEWPORT
  guarda el centro y la ALTURA de vista, no el ancho: el ancho lo fija la proporción del hueco
  de papel. `canonicalPaperSpaceFromDwg` lo reconstruye de esa proporción, que devuelve el
  mismo rectángulo cuando entró por la ida de este mismo módulo, pero una ventana ajena cuyo
  `modelBounds` no guardara la proporción de su papel volvería con otro ancho.

- **2026-09-04 · El ATTDEF sigue sin escribirse, y con él la DEFINICIÓN del rótulo.** Un
  ATTRIB dice qué vale una etiqueta en UNA inserción; el ATTDEF, dentro del bloque, dice
  qué etiquetas EXISTEN, con su texto de aviso y su valor por defecto. El corpus trae 5 y
  siguen en `no-escribible`. El cuerpo es el del ATTRIB más un prompt TV —el emisor sería
  de tres líneas— pero el bloqueo real está en el otro extremo: el documento canónico
  guarda las definiciones en `blocks[].attributes` como un mapa `tag → {defaultValue,
  prompt, position, height}`, y `write.ts` hoy no lo lee al armar el contenido del bloque.
  Cerrarlo es un entregable con su propia medición, no un apéndice de éste: un bloque cuyo
  ATTDEF diga una cosa y cuyos ATTRIB digan otra es peor que un bloque sin definiciones.
- **2026-09-04 · La bandera de «invisible» de un atributo no viaja.** El producto la
  modela (`CadPositionedAttribute.invisible`) y el formato la guarda en el RC de banderas,
  pero los siete ATTRIB del corpus admitido lo traen a CERO: no hay material ajeno que
  permita comprobar qué número significa invisible. Se escribe 0 y se declara con el código
  `attrib-flags-not-measured`; traducirlo a ojo sería inventar una semántica. Lo mismo con
  la alineación del texto del atributo. Reabre cuando haya un archivo ajeno con un atributo
  invisible que medir.
- **2026-09-04 · Los handles del grupo se reparten DESPUÉS del espacio, no intercalados.**
  Los archivos ajenos los intercalan y por eso su INSERT necesita punteros de cadena con
  desplazamiento arbitrario (`H(10,4)` = propio+4). Este writer conserva los códigos
  relativos ±1 ya medidos y reparte el grupo al final del espacio: el archivo resultante es
  válido y la cadena queda intacta, pero NO reproduce byte a byte la disposición ajena.
  Está registrado en `VALLE-CORPUS-INSERT-ATRIBUTOS` como observación, no como defecto:
  estrenar un puntero con desplazamiento que el corpus sólo muestra en un sitio sería
  adivinar.
- **2026-09-04 · El anclaje del ATTRIB al oráculo no compara la CAPA propia.** El corpus
  pone los atributos en una capa distinta de la de su INSERT y el arnés lo respeta al
  escribir (`layerIndex` por atributo), pero el camino público los manda todos a la capa
  del INSERT porque es lo que el producto modela: un atributo posicionado no tiene capa
  propia en el documento. No es pérdida de material ajeno —el arnés sí la conserva— sino
  un límite del esquema del producto, y cambiarlo tocaría archivo COMPARTIDO (R2).

- **2026-09-04 · La trama que ENTRA por el producto se sigue perdiendo.** El camino
  `DWG → canónico` ya copia la definición del patrón, pero el importador del producto
  (`dwg-native-reader.ts` → `dwg-document-bridge-*`) no pasa por ese camino: construye la
  entidad del documento por su cuenta, y el documento del producto no tiene dónde guardar
  las líneas de definición de un patrón ajeno —sólo `pattern`, `angle` y `scale`—. Un
  ANSI31 importado se redibuja con NUESTRA tabla, que a escala 1 separa 1 unidad donde el
  archivo ajeno separaba 0.125. Cerrarlo exige un campo nuevo en el esquema del documento
  canónico, que es archivo COMPARTIDO (R2): va como petición, no como parche.
- **2026-09-04 · El anclaje al oráculo NO compara las líneas de definición.** El proyector
  DXF de `dxf-oracle.mjs` saca del HATCH el nombre, el bit de sólido, el recuento de
  caminos y los vértices; la trama no. Ampliarlo tocaría el instrumento de medida que
  comparte `validate-corpus.mjs` (la medición del LECTOR, de otro entregable), así que se
  declara en vez de tocarse. Que las líneas vuelvan idénticas lo mide el round-trip propio;
  que otro programa las DIBUJE, el caso `sombreado-patron` cuando el titular lo corra.
- **2026-09-04 · Tipo de patrón 0 contra 1, REGISTRADO y no corregido.** Los dos archivos
  ajenos con trama llevan tipo de patrón 1 (`76 = 1` en su DXF) y el camino público de este
  repositorio escribe 0, tanto en el sólido como en el de trama; nuestro propio exportador
  DXF escribe 1. Qué hace un lector ajeno con ese número no lo dice ningún hecho medido, y
  ADR-0007 manda registrar antes de tocar. Queda en `factsConsulted` de
  `VALLE-CORPUS-HATCH-TRAMA`.
- **2026-09-04 · Trazos y varias familias, sin material ajeno que los ejerza.** El corpus
  admitido trae UN patrón (ANSI31), UNA familia, SIN trazos y SIN caminos derivados. La
  secuencia trazo/hueco, las tramas de varias familias y el tamaño de píxel los espeja el
  writer del decodificador y los mide el round-trip propio: no hay medición ajena de ellos
  y no se afirma que la haya.
- **2026-09-04 · CORREGIDO EN EL CIERRE — lo que este frente dijo cuatro veces sobre
  `check:cad` era FALSO.** Los entregables 1, 3 y 4 declararon que `npm run check:cad`
  «ya estaba rojo al cortar la rama», que la causa era el campo `origen` con la RUTA LOCAL
  del espejo dentro de `dwg-decoder-matrix.json` / `dwg-roundtrip.json`, y que «ninguna de
  las dos formas pasa el gate en las dos máquinas: el artefacto es dependiente del entorno
  por construcción». **Las tres afirmaciones son incorrectas y se retiran.** Medido en el
  cierre:

  1. `VALLE_DWG_CORPUS_MIRROR=/home/user/valle-design-dwg-conformance npm run check:cad`
     termina en **EXIT=0, entero y verde**, con los artefactos committeados TAL CUAL están.
     El gate no es irreparable: estaba rojo porque la variable no se exportó en la sesión.
  2. La causa señalada era la equivocada. `dwg-evidence.mjs` ya declara
     `VOLATILE_KEYS = {generadoEn, environment, corpus}` y `stable()` los BORRA antes de
     comparar: el bloque `corpus` —con `origen` y la ruta local dentro— **nunca se compara**,
     así que no podía ser la causa de nada. Lo que sí se compara son las cifras DERIVADAS del
     corpus, que viven fuera de ese bloque: `resumen.bundlesAdmitidos` (7 con espejo, 0 sin
     él), `validacionesIndependientes` (14 / 0), `capacidadesPromovidas` (2 / 0),
     `capacidades[].promovida`, `capacidades[].bloqueos` y `versionesCubiertas`
     (cinco versiones / lista vacía). El diff completo son 346 líneas y **todas** salen de
     ese único factor.
  3. Los artefactos committeados son la forma CON espejo y coinciden exactamente con una
     corrida fresca con espejo. No hay nada que arreglar en ellos, y el «diseño del arreglo»
     que este frente dejó escrito para la tarea siguiente —grabar el tipo de transporte en
     vez de la ruta— **no habría arreglado el gate**, porque la ruta ya estaba excluida de
     la comparación.
  4. **CI ya está configurado para esto y siempre lo estuvo.** `.github/workflows/ci.yml`
     clona el espejo y hace `echo "VALLE_DWG_CORPUS_MIRROR=$GITHUB_WORKSPACE/.dwg-corpus-mirror"
     >> "$GITHUB_ENV"` ANTES de `npm run check:cad` (y otra vez en el job de e2e, que es otro
     runner y no hereda la variable). Es decir: la forma committeada es exactamente la que CI
     espera, y la máquina que decide si esto entra en `main` ve el gate VERDE. No hace falta
     ninguna petición al coordinador por este asunto.

  De dónde salió el error: se corrió `git stash -u` con el árbol ya limpio (los cinco
  entregables estaban committeados), así que el stash no revirtió nada y el rojo observado
  «sin mis cambios» era el mismo rojo de siempre — la ausencia de la variable, no una
  regresión y tampoco un defecto del artefacto. La lección, que es la razón de que esta
  entrada exista: `git stash -u` sólo prueba algo cuando hay algo sin committear que quitar.

  **Lo que sí queda como fragilidad real, mucho más pequeña que la declarada:** sin la
  variable, el gate no dice «falta el espejo», dice «no coincide con lo que el árbol genera
  hoy; corre npm run evidence:dwg» — y obedecer ese consejo sin espejo REESCRIBE los dos
  artefactos con ceros y borra evidencia buena. Es un problema de diagnosticabilidad del
  mensaje, no de corrección del artefacto. Candidato barato para la ventana siguiente: que
  `readAdmittedCorpus` distinga «sin espejo configurado» de «espejo con cero bundles» y que
  el gate lo diga con esas palabras. **Trampa relacionada, esta sí verificada y en pie:**
  `dwg-evidence.mjs` NO respeta `--out` — su punto de entrada sólo distingue `--check` de
  escribir, así que correrlo para inspeccionar su salida reescribe los artefactos
  committeados. `corpus-rewrite.mjs` sí lo respeta.
- **2026-09-04 · El anclaje no cubre los bloques anónimos `*D`.** El DXF del oráculo es la
  fuente de autoría propia y no los tiene (los genera el conversor al producir el DWG), así
  que las 57 entidades escritas que viven dentro de ellos (4 `arc`, 21 `line`, 8 `mtext`,
  24 `point`) se re-escriben y se cotejan campo a campo,
  pero NO se anclan contra nadie. Por eso `ancladasAlOraculo` es menor que `escritas` en
  `line`, `point`, `mtext` y `arc`. Está declarado en el informe; cerrarlo exigiría un
  oráculo que describa el bloque anónimo, que hoy no existe.

- **2026-09-04 · El paquete de firma no lo corre ningún gate encadenado.** Vive en
  `scripts/dwg/check-firma-package.mjs` y pasa, pero `check:dwg` no lo llama porque
  encadenarlo toca el `package.json` de la raíz (R2). Va como `P-dwg-03`. Mientras tanto
  hay que correrlo a mano, que es exactamente la fragilidad que el gate existe para
  quitar — sólo que un nivel más arriba.
- **2026-09-04 · La ADR todavía no apunta al paquete.** `docs/adr/0009-dwg-promotion-package.md`
  no menciona `dwg-firma-encendido-20260904.md`: el injerto es `P-dwg-02` y lo aplica el
  coordinador. En cuanto la sección exista, el gate puede ganar un aserto de tres líneas
  que exija esa mención — hoy no puede exigirla porque exigiría algo que no está.
- **2026-09-04 · El segundo oráculo sigue sin existir, y no por falta de intento.** El
  detalle completo está en §6 del paquete y en la entrada de arriba: no está empaquetado
  para esta distribución, la API que diría si hay binario precompilado está bloqueada por
  el proxy de la sesión, y compilar el fuente aquí rompería la disciplina clean-room que
  hace valioso al oráculo. `independentValidations` sigue en cero y el documento NO afirma
  doble validación en ningún sitio.
- **2026-09-04 · El detector de cifras persigue una FORMA, no un significado.** Un
  porcentaje, una fracción, un «N de M» y un recuento de material medido. Una cifra de
  cobertura escrita en palabras («ocho de cada diez entidades») pasaría, y una tabla
  inventada con recuentos también si evitara esas cuatro formas. Cerrar eso de verdad
  exigiría entender la frase, no reconocerla; lo que el gate sí garantiza es que las
  cifras que SÍ hay salen de su artefacto. Se declara en vez de insinuar que cubre más.
- **2026-09-04 · El paquete no mide la interfaz, porque todavía no hay interfaz.** §9
  describe el commit del encendido incluida la entrada del módulo de interfaz en la lista
  blanca de `check-product-boundary.mjs`, pero ese módulo no existe: el botón «Exportar
  DWG» se cablea el día que el oráculo respalde los casos, y hasta entonces lo único
  honesto es describir el paso, no fingir que está dado.

### Del cierre del frente (2026-09-04)

- **2026-09-04 · El mensaje del gate del corpus no distingue «sin espejo» de «cero
  bundles», y el consejo que da destruye evidencia.** Sin
  `VALLE_DWG_CORPUS_MIRROR`, `check:dwg-evidence` dice «no coincide con lo que el árbol
  genera hoy; corre `npm run evidence:dwg`» — y obedecerlo sin espejo REESCRIBE
  `dwg-decoder-matrix.json` y `dwg-roundtrip.json` con ceros, borrando evidencia buena.
  No se arregló aquí porque el cierre no mete código: es la primera candidata de la ventana
  siguiente y es barata (que `readAdmittedCorpus` separe los dos casos y que
  `dwg-evidence.mjs` respete `--out`). **Motivo de que no fuera antes:** este frente pasó
  cuatro entregables creyendo que el artefacto era irreparable, y no lo es.
- **2026-09-04 · `npm test` completo del monorepo NO se corrió en el cierre.** Se corrieron
  `typecheck` (árbol entero), `check:cad` (entero, con espejo), la suite completa de
  `packages/dwg-codec` (512 pruebas) y los cuatro gates DWG. La suite de `apps/web` es lenta
  y este frente no tocó su runner, pero eso es una razón para no correrla, no una prueba de
  que pase: **no está verificada en el cierre y no se afirma que lo esté.**
- **2026-09-04 · El conteo de comprobaciones de `corpus-rewrite.spec.mjs` estaba mal
  declarado.** El entregable 1 dijo 156 y son 153. Corregido en la bitácora. Ninguna cifra
  de COBERTURA estaba afectada — las de cobertura salen del artefacto y se verificaron
  exactas—, pero una cifra escrita de memoria en un informe es exactamente lo que el gate
  del paquete de firma existe para impedir, y aquí se coló en la bitácora, que no tiene gate.
- **2026-09-04 · Sigue sin haber un solo lector ajeno que haya abierto un archivo de este
  writer.** Es el límite que no se movió en toda la campaña y el que decide si algo de esto
  vale para encender la bandera. `externalOracleVerified = false`, 4 de 24 casos
  respaldados, y los 12 casos del harness escritos y esperando el ODA File Converter con
  licencia del titular. Ninguna de las mediciones de los cinco entregables lo sustituye.
