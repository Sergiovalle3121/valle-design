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

## «Todavía no»

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
- **2026-09-04 · `npm run check:cad` ya estaba ROJO al cortar la rama, y no por este
  frente.** `check:dwg-evidence` compara `docs/cad/evidence/dwg-decoder-matrix.json` y
  `dwg-roundtrip.json` con lo que el árbol genera hoy, y esos dos artefactos guardan el
  campo `origen` con la RUTA LOCAL del espejo del corpus. Committeados sin espejo dicen
  `estado: "unavailable"`, `bundlesAdmitidos: 0` y la URL del repositorio; regenerados con
  espejo dicen `verified`, `7` y `/home/user/valle-design-dwg-conformance`. Ninguna de las
  dos formas pasa el gate en las dos máquinas: el artefacto es dependiente del entorno por
  construcción. Verificado con `git stash -u` que el rojo existe sin mis cambios
  (`typecheck` sigue verde). **Diseño del arreglo, para la tarea siguiente de este frente:**
  que `dwg-evidence.mjs` grabe el TIPO de transporte (`local-mirror` / `git-fetch`), como ya
  hace `corpus-rewrite.mjs`, y nunca la ruta; y que la comparación del spec ignore el bloque
  de corpus cuando no hay espejo, en vez de exigir el estado de cero. No se toca en este
  entregable para no mezclar dos cosas en un commit. **Trampa que costó un susto:**
  `dwg-evidence.mjs` NO respeta `--out` — correrlo para inspeccionar su salida REESCRIBE los
  dos artefactos committeados con la ruta de la máquina dentro. `corpus-rewrite.mjs` sí lo
  respeta, y el arreglo de arriba debería incluirlo.
- **2026-09-04 · El anclaje no cubre los bloques anónimos `*D`.** El DXF del oráculo es la
  fuente de autoría propia y no los tiene (los genera el conversor al producir el DWG), así
  que las 57 entidades escritas que viven dentro de ellos (4 `arc`, 21 `line`, 8 `mtext`,
  24 `point`) se re-escriben y se cotejan campo a campo,
  pero NO se anclan contra nadie. Por eso `ancladasAlOraculo` es menor que `escritas` en
  `line`, `point`, `mtext` y `arc`. Está declarado en el informe; cerrarlo exigiría un
  oráculo que describa el bloque anónimo, que hoy no existe.
