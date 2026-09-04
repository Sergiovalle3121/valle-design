# F4 · Express y universal

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/engine/commands/express*|compare*|units*|clipboard*|pdf*`
- `apps/web/src/lib/cad/units*`
- `apps/web/src/lib/cad/compare*`
- `apps/web/src/lib/cad/pdf*`
- `sus specs y goldens`

## Cola

1. Las quince Express Tools que un veterano usa sin pensar: BREAKLINE, TXTEXP, FLATTEN, LAYWALK, ALIASEDIT, ARCTEXT, TCOUNT, TXT2MTXT, BURST, EXTRIM, MOCORO, DIMEX, DIMIM, SUPERHATCH, y las que el registro no tenga de LAYMRG/LAYDEL. Verifica primero cuáles existen ya (NCOPY existe).

2. DWG COMPARE / XREF COMPARE entre dos archivos cualesquiera, con nubes de revisión de las diferencias. La fila «Compare» actual compara versiones propias.

3. Unidades imperiales y arquitectónicas de punta a punta — pies-pulgadas fraccionarios, UNITS Architectural/Engineering — en entrada, cota, DXF y PDF.

4. PDF como underlay con snap, y PDFIMPORT de vectores a entidades: verificar el alcance actual y cerrar lo que falte.

5. Portapapeles del SISTEMA: PASTESPEC y pegar entre pestañas (hoy es interno al editor).

6. CTB/STB: que un `.ctb` real importado gobierne el PDF; completar STB.

## Cierre

Cada comando nuevo en el registro con veredicto del arnés de integridad (`npm run check:command-integrity`); goldens; unidades verificadas en `verification/`.

## Lo que hay que tener presente

Un comando que no es alcanzable con ratón no cuenta: la campaña mantiene 243/243. Fix-or-hide.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/express-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-express` sobre la rama `campana/superar/express`. Commits sí;
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
cd /home/user/vd-express
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### C1 · Reconocimiento del territorio (2026-09-04)

Medido, no supuesto. El registro real (`CAD_COMMAND_DESCRIPTORS`) tiene **274 comandos** y
`node scripts/cad/ui-command-reach.mjs` da **274/274 alcanzables con el ratón** — la cinta se
genera del propio registro (`ribbon.ts` recorre los descriptores), así que un comando nuevo
nace con botón. Lo que cuesta registrar un comando son cuatro archivos FUERA de mi territorio:
`engine/index.ts`, `engine/command-summaries.ts` (contrato fail-closed, un comando mudo rompe
CI), `engine/alias-table.ts` (el pipeline de entrada resuelve por ESTA tabla, no por el
descriptor) y `docs/cad/evidence/ui-command-reach.json` (regenerado). Todo eso va por petición.

**De la cola 1 (Express Tools), lo que YA existe en el registro:** `LAYWALK`, `LAYMRG`,
`BURST`, `NCOPY`, `TEXTALIGN`, `QDIM`, `QLEADER`, `XPLODE`, `OVERKILL`, `SETBYLAYER`, `CHPROP`.
**Lo que NO existe:** `BREAKLINE`, `TXTEXP`, `FLATTEN`, `ALIASEDIT`, `ARCTEXT`, `TCOUNT`,
`TXT2MTXT`, `EXTRIM`, `MOCORO`, `DIMEX`, `DIMIM`, `SUPERHATCH`, `LAYDEL`.

**Cola 4 (PDF) — el hallazgo caro.** `apps/web/src/lib/cad/pdf/` son ~250 KB de motor
TERMINADO y probado contra corpus real: `importCadPdf`, `readCadPdfPageList`,
`cadPdfAttachCommands`, `cadPdfClipCommands`, `cadPdfUnderlayFadeCommands`,
`cadPdfScaleToDistanceCommands`, `cadPdfUnderlayPageCommands`, informe de pérdidas, y
`check:pdf-corpus` de gate. **Ningún comando lo alcanza.** `grep PDFATTACH|PDFIMPORT` en
`engine/` da cero; el único consumidor del subsistema fuera de sí mismo es `cadPdfInflate`
desde `session-catalogs.ts`, para descomprimir `.ctb`. Por la regla 1 de la campaña de
cimientos, hoy PDF **no está implementado**: es un subsistema sin importador.

**Cola 2 (COMPARE).** No hay diff de entidades en ningún sitio. Lo único que existe es
`snapshots.ts`: `diffCadSnapshots` compara dos HASHES y devuelve `changed: true|false`. No
hay añadido/borrado/modificado, no hay nubes de revisión, no hay comparar dos archivos.
Greenfield entero, y entero dentro de mi territorio (`compare*`). `revcloudVertices` y
`REVCLOUD_BULGE` ya existen exportados en `engine/commands/draw-rings.ts`.

**Cola 3 (unidades imperiales).** Existe la mitad de SALIDA: `unit-format.ts` formatea
`architectural`/`engineering`/`fractional`, `system-variables.ts` mapea `LUNITS`→sistema y
`inquiry/reports.ts` lo consume. Falta lo demás, y está medido con sonda:

- **Entrada: imposible.** `parseCoordinate` usa `Number(s)`. Medido hoy — `1'-6 1/2"`, `12'`,
  `6"`, `6 1/2`, `1'6` → `{ok:false,"No se pudo interpretar la entrada"}`; `@1'-0",0` →
  `{ok:false,"Coordenada inválida"}`.
- **Cota: métrica y nada más.** `dimension-format.ts` declara
  `type LengthUnit = 'mm' | 'cm' | 'm'`. No hay pulgada ni pie en el rótulo de una cota.
- **DXF: no viaja.** `dxf-export.ts` escribe `$INSUNITS` desde `options.units` (mm/cm/m) y
  **no escribe `$LUNITS` ni `$LUPREC`**: el ajuste arquitectónico del dibujo no sobrevive al
  archivo.

**Cola 6 (CTB/STB).** Está mucho más avanzado de lo que la cola sugiere:
`plot/plot-style-table.ts` lee un `.ctb` real (detecta `PIAFILEVERSION`, localiza el flujo
zlib y lo descomprime con el códec inyectado), tiene CTB y STB, y `session-catalogs.ts` ya
enchufa `importCadPlotStyleTable` + `cadPdfInflate` en la sesión. Queda por medir si la tabla
GOBIERNA el PDF de salida; `plot/` no es territorio mío.

**Cola 5 (portapapeles).** `COPYCLIP/CUTCLIP/COPYBASE/PASTECLIP/PASTEORIG` existen y viajan
por la petición de anfitrión `clipboard`. `PASTESPEC` no existe, y lo copiado vive dentro de la pestaña: no llega al portapapeles del sistema.

**Frontera que este reconocimiento deja escrita:** `lib/cad/clipboard.ts`,
`lib/cad/precision-input.ts`, `lib/cad/dimension-format.ts`, `lib/cad/dxf-export.ts`,
`lib/cad/snap-engine.ts`, `engine/command-types.ts` y `lib/cad/plot/` están FUERA de mi
territorio aunque la cola los toque. Todo lo que necesiten va a `express-peticiones.md` con
el diseño completo.

### C2 · El PDF alcanzable (2026-09-04)

**Lo que había.** El reconocimiento (C1) lo dejó medido: `lib/cad/pdf/` era un motor terminado
—`importCadPdf`, `readCadPdfPageList`, `cadPdfAttachCommands`, recorte, desvanecido, escalado a
distancia conocida, cambio de página, informe de pérdidas, gate `check:pdf-corpus`— sin ningún
comando que lo alcanzara. Este entregable es el importador que faltaba, no motor nuevo: **ni una
línea de geometría de PDF se ha escrito ni se ha tocado**.

**Lo que hay ahora.** Diez órdenes construidas y probadas:

| Orden | Qué hace |
| --- | --- |
| `PDFATTACH` | Adjunta una página como sustrato: página, inserción, escala y bloqueo |
| `PDFIMPORT` | Vectores a entidades, con el informe de pérdidas antes y después de escribir |
| `PDFCLIP` | Recorte rectangular o poligonal, y su eliminación |
| `PDFADJUST` | Desvanecido 0–100 y bloqueo de la capa |
| `PDFPAGE` | Cambia de página leyendo la lista del propio dibujo |
| `PDFSCALE` | Escala a medida conocida por dos puntos |
| `PDFDETACH` / `PDFUNLOAD` / `PDFRELOAD` | La ceremonia del xref |
| `PDFLIST` | El gestor: archivo, página, tamaño, escala, estado y recorte |

Archivos: `lib/cad/pdf/pdf-attach-payload.ts` (+ spec), `engine/commands/pdf-underlay-commands.ts`,
`pdf-underlay-edit-commands.ts`, `pdf-underlay-support.ts` (+ spec de las diez órdenes). El sobre
del archivo es el reparto de `image-attach-payload.ts` con UNA diferencia deliberada: **no declara
páginas ni tamaños**, porque el lector de PDF vive dentro del motor y los deduce él. Un sobre que
declarase «3 páginas» y un lector que encontrase 2 dejarían al usuario eligiendo una página
inexistente.

Se partió en tres archivos por el presupuesto de 800 líneas de `check:monolith-budget` (el archivo
único daba 1 069). Quedan en 452 / 559 / 192.

**Evidencia medida, no adjetivos.**

```
cd apps/web
npx tsx src/lib/cad/pdf/pdf-attach-payload.spec.ts          → 28 comprobaciones
npx tsx src/lib/cad/engine/commands/pdf-underlay-commands.spec.ts → 118 comprobaciones
```

Cada descriptor arranca con un PDF REAL de `cadPdfCorpus()` y su lote se APLICA con
`executeCadEntityCommandBatch`, como hace `pdf-underlay.spec.ts`. Con anclas absolutas:

- una lámina Carta a tamaño de papel queda de **215,9 × 279,4 mm** en el dibujo;
- `PDFSCALE` sobre dos puntos que distan 100 unidades y en la realidad miden **5 m** deja la
  lámina en **10 795** (factor 50), y el primer punto designado no se mueve;
- `PDFCLIP` de media lámina cae en **306 × 396 PUNTOS de página**;
- `PDFIMPORT` de `scanned-image-only` falla con el nombre del archivo y remite a `PDFATTACH`
  («calca encima»), y el dibujo no cambia;
- el informe de pérdidas viaja en el aviso: `text-glyph-indices` publica «1 cosa(s) NO entraron»
  y el detalle de los índices de glifo, y `optional-content-groups` declara la capa apagada.

Un defecto que la spec cierra y que no se veía: desvanecer y (des)bloquear SUSTITUYEN la entidad
entera, así que construir la segunda orden sobre el documento viejo devolvía el desvanecido a 0
sin avisar. `PDFADJUST` compone la segunda sobre el resultado de la primera, y la spec lo exige.

Gates sobre el árbol: `npm run typecheck` (8/8), `eslint` de los seis archivos sin avisos,
`check:monolith-budget`, `check:pdf-corpus`, `check:lint-budget`, `check:no-industrial-domain`,
`check:command-integrity` (274, sin cambio: todavía no están registradas).

**Peticiones abiertas:** `P-express-01` (canal `pdf-file` del anfitrión) y `P-express-03`
(registrar las diez), ambas con el diseño completo en `express-peticiones.md`.


### C3 · COMPARE entre dos archivos cualesquiera, con nubes de revisión (2026-09-04)

**Lo que había.** El reconocimiento (C1) lo dejó medido: `diffCadSnapshots` compara dos HASHES de
instantáneas del MISMO dibujo y contesta `changed: true|false`. No había diff de entidades, no
había nubes de revisión y no había forma de comparar dos archivos. Greenfield entero, y entero
dentro de `compare*`.

**Lo que hay ahora.** Tres módulos y su orden:

| Archivo | Qué es |
| --- | --- |
| `lib/cad/compare-documents.ts` (495) | El diff. Empareja por id y, lo que quede suelto, por firma geométrica normalizada; clasifica en añadido, borrado, modificado e igual, y separa el cambio de GEOMETRÍA del de PROPIEDAD |
| `lib/cad/compare-revision-clouds.ts` (391) | Agrupa las diferencias por vecindad, calcula la envolvente de cada grupo y emite la nube con `revcloudVertices` en tres capas dedicadas |
| `engine/commands/compare-drawings.ts` (302) | La orden `COMPARE`, que toma el segundo dibujo por su identificador de activo igual que XATTACH |

**Las cinco decisiones que este entregable tomó, y por qué.**

1. **Dos pasadas de emparejamiento.** Un dibujo que pasó por un DXF de ida y vuelta trae los
   mismos objetos con ids nuevos: sin la segunda pasada daría «todo borrado y todo añadido»,
   que es literalmente cierto mirando los ids e inútil mirando el plano.
2. **Rejilla, no representante.** La firma redondea a rejilla de tolerancia en vez de agrupar
   por representante como hace OVERKILL. El representante depende del ORDEN en que llegan las
   entidades, y comparando dos documentos eso significa parejas distintas en cada pasada. La
   rejilla tiene frontera y su frontera produce una diferencia DE MÁS, que se ve.
3. **La partición es exhaustiva.** Seis propiedades con nombre —capa, color, tipo de línea,
   grosor, estilo y texto— y TODO lo demás en la firma geométrica. Un campo que no estuviera en
   ninguna de las dos mitades cambiaría sin que el diff lo viese.
4. **El cuadre es `añadidos + borrados + 2·(modificados + iguales)`,** no la suma llana: una
   entidad modificada ocupa un sitio en cada documento. Sumando llanamente, comparar un dibujo
   de 10 objetos consigo mismo daría 10 frente a 20 y parecería que faltan diez.
5. **El calco de colores es el de DWG Compare, con una salvedad escrita.** Verde lo que sólo
   está en el dibujo abierto, rojo lo que sólo está en el comparado — de ahí que la orden pase
   el dibujo ajeno como BASE. La tercera capa NO es el gris de AutoCAD: el gris marca lo
   idéntico y lo idéntico no lleva nube; la entidad que existe en los dos lados y cambió no
   tiene equivalente allí (AutoCAD la parte en una verde y una roja) y va en amarillo.

**Evidencia medida, no adjetivos.**

```
cd apps/web
npx tsx src/lib/cad/compare-documents.spec.ts               → 65 comprobaciones
npx tsx src/lib/cad/compare-revision-clouds.spec.ts         → 68 comprobaciones
npx tsx src/lib/cad/engine/commands/compare-drawings.spec.ts → 46 comprobaciones
```

Con anclas absolutas y pieza por pieza, no con recuentos:

- el par de documentos del diff lleva **una línea añadida, un círculo borrado, un muro movido
  250 mm y un texto que sólo cambia de capa**, más una línea dibujada al revés con otro id que
  tiene que salir IGUAL; cada una se comprueba por separado y el cuadre cierra en 10 = 10;
- las nubes: dos añadidos que distan 200 unidades comparten nube y el que dista 19 000 tiene la
  suya; la nube CONTIENE la envolvente de lo suyo (`minX = −250`, `maxX = 1750` sobre un grupo
  ceñido de 0 a 1500) y **no** la de la vecina; el círculo borrado se solapa con las líneas
  nuevas y aun así cada uno va a su capa;
- cada vértice lleva `|bulge| = REVCLOUD_BULGE = 0,5` y signo negativo (el contorno se recorre
  antihorario, donde el positivo combaría hacia dentro);
- las tres capas salen con `#00ff00`, `#ff0000` y `#ffff00`, y sólo las de las clases que hubo:
  sin borrados no se crea la capa de borrados;
- el lote pasa por `executeCadEntityCommandBatch` y sube la versión **una** vez: un Ctrl+Z
  devuelve el dibujo sin nubes y sin capas;
- comparar un dibujo consigo mismo devuelve un MENSAJE, deja el documento como el mismo objeto
  (`meta.version` intacta), no crea ninguna capa y lo dice con esas palabras.

Gates sobre el árbol: `npm run typecheck` (8/8), `eslint` de los seis archivos sin avisos,
`check:monolith-budget` (ninguno pasa de 800), `check:lint-budget` (488/492, sin cambio),
`check:no-industrial-domain`, `check:conventions`, `check:ribbon-coverage`,
`ui-command-reach` (274/274) y `check:command-integrity` (274, sin cambio: COMPARE todavía no
está registrada).

**Peticiones abiertas:** `P-express-04` (petición de anfitrión `compare-fetch`) y `P-express-05`
(registrar COMPARE), las dos con el diseño completo en `express-peticiones.md`.


### C4 · Las cinco Express Tools puras que faltaban (2026-09-04)

**Lo que había.** El reconocimiento (C1) lo dejó medido: de las quince de la cola 1 ya estaban
`LAYWALK`, `LAYMRG`, `BURST`, `NCOPY`, `TEXTALIGN`, `QDIM`, `QLEADER`, `XPLODE` y `OVERKILL`, y
faltaban trece. Cinco de esas trece son PURAS —geometría y documento, sin fuente vectorizada,
sin esquema nuevo, sin anfitrión— y son las de esta entrega. `grep` sobre `engine/` da cero para
las cinco antes de hoy.

**Lo que hay ahora.** Tres módulos y su spec:

| Archivo | Qué es |
| --- | --- |
| `engine/commands/express-tools.ts` (617) | `BREAKLINE`, `FLATTEN`, `LAYDEL` y el array de los cinco descriptores |
| `engine/commands/express-tools-text.ts` (434) | `TCOUNT` y `TXT2MTXT`: las dos que trabajan sobre el texto ya escrito |
| `engine/commands/express-tools-support.ts` (285) | El aplastado como función pura, los nombres en español de cada tipo de entidad y los tres remates de paso |
| `engine/commands/express-tools.spec.ts` (646) | 99 comprobaciones, todas sobre el documento resultante |

Se partió en tres porque el archivo único pasaba de 800 líneas y `check:monolith-budget` da 800
a un archivo nuevo; el corte no es arbitrario: geometría y tablas por un lado, documento escrito
por otro, y lo que se prueba solo —el aplastado— fuera del diálogo.

**Las seis decisiones que este entregable tomó, y por qué.**

1. **BREAKLINE dibuja el símbolo como GEOMETRÍA de la misma polilínea, no como bloque.** En
   AutoCAD es `BRKLINE.DWG` insertado y recortado. Un bloque exige una definición en el
   documento, un nombre que puede chocar con el del cliente y un INSERT que hay que explotar
   antes de exportar; una sola polilínea se estira, se recorta, se acota y viaja a DXF sin nada
   detrás.
2. **La escala del símbolo es `DIMSCALE`, no una variable propia.** Una rotura es un símbolo de
   ANOTACIÓN, igual que una flecha de cota, y en AutoCAD todo lo anotativo se escala por la
   misma variable. El tamaño base sale del UNIDAD del documento —cinco milímetros de papel, que
   es lo que hace que la rotura se lea impresa— y no del `0.1` de fábrica de AutoCAD, que está
   en pulgadas: en un dibujo en metros ese `0.1` da una rotura de diez centímetros y en uno en
   milímetros la da de una décima de milímetro.
3. **El orden de lectura de un montón de textos sueltos es el de un plano, no el de un array.**
   De arriba abajo y, a la misma altura, de izquierda a derecha; y los empates se rompen hasta
   por el identificador. Un orden que dependiera de en qué orden llegaron las entidades daría
   una numeración distinta cada vez que se abre el dibujo, y eso no es numerar.
4. **FLATTEN sustituye con `replace`, no borra y crea.** La entidad conserva su identificador,
   su sitio en el orden de dibujo y las cotas y sombreados que la apuntan: aplastar una línea no
   puede romper la cota que la mide.
5. **La lista de campos aplastables es EXPLÍCITA, no un recorrido ciego.** `insert.scale` es un
   `{x,y,z}` y no es un punto: un aplastado genérico le pondría `z: 0` y convertiría un bloque
   escalado en uno de altura nula — un defecto que no se ve en planta y aparece al exportar. Los
   VECTORES sí entran (`ellipse.majorAxis`, `image.uVector`), porque proyectarlos es exactamente
   lo que se pide.
6. **LAYDEL no es LAYMRG con otro nombre.** LAYMRG reasigna y no pierde nada, así que se
   resuelve con una orden de tabla y sin preguntar. LAYDEL BORRA, y por eso hace las dos cosas
   que hace AutoCAD: contar en voz alta cuántos objetos van a desaparecer y exigir un «Sí»
   explícito, con «No» por defecto.

**Evidencia medida, no adjetivos.**

```
cd apps/web
npx tsx src/lib/cad/engine/commands/express-tools.spec.ts   → 99 comprobaciones
```

Cada orden se conduce entera desde su descriptor y su lote se APLICA con
`executeCadEntityCommandBatch`; lo que se comprueba es el documento, con números absolutos:

- **BREAKLINE.** Con `DIMSCALE 20` y tamaño base 10, la polilínea que queda tiene seis vértices
  y su excursión perpendicular va de `−100` a `+100`: **200 exactos**, que es 10 × 20, y la
  etiqueta lo dice («símbolo de 200 (tamaño 10 × DIMSCALE 20)»). El gesto cae en el punto medio
  con Enter y en la abscisa 800 cuando se pide ahí. La prolongación por defecto sigue al tamaño
  mientras nadie la fije, así que la polilínea arranca en `−100` y termina en `1100` sobre un
  tramo de 0 a 1000. Con `DIMSCALE 50` sobre un tramo de 30 se NIEGA («no cabe») y el documento
  se queda vacío.
- **TCOUNT.** Tres textos desordenados en Y —designados medio, alto, bajo— dan `1COCINA`,
  `2SALA`, `3BAÑO` por Y, y `1SALA`, `2COCINA`, `3BAÑO` por designación: **el mismo conjunto
  numerado distinto según el orden pedido**, que es la prueba de que el orden se obedece. Por X
  con `10,5` y afijos `(,)` y Sustituir da `(10)`, `(15)`, `(20)`. Un incremento de 0 se rechaza
  con su motivo y la orden sigue.
- **TXT2MTXT.** Tres TEXT dejan **1 MTEXT y 0 TEXT**, con `modelSpace.entityIds` de longitud 1
  —sin identificadores fantasma—, el texto `primera\nsegunda\ntercera` en orden de lectura,
  altura 250, estilo `ROTULO`, capa `NOTAS`, anclaje `top-left` e inserción en (100, 900), que
  es la esquina superior izquierda del conjunto. Con un color explícito y dos alturas distintas,
  el aviso las declara.
- **FLATTEN.** Sobre siete objetos: la etiqueta dice «5 objetos aplastados a Z=0 (2 líneas, 1
  círculo, 1 polilínea, 1 muro), 10 puntos bajados» y el aviso «ya estaban en Z=0: 1 texto»,
  el motivo del sólido 3D con su salida (FLATSHOT) y que el muro CONSERVA su altura. En el
  documento: cada z de cada punto de los cinco vale 0, el muro sigue con `height: 2400`, el
  sólido sigue con su volumen y siguen siendo siete entidades. Todo ya plano no escribe lote:
  lo dice.
- **LAYDEL.** Sobre la capa `0` contesta «La capa 0 no se puede borrar: es la que define el
  formato PorBloque…» y la tabla sigue con sus cuatro capas; sobre la actual y sobre una
  bloqueada, lo mismo con su motivo y su salida. Sobre `AUXILIAR` la confirmación dice «Se
  borrarán 2 objetos de la capa "AUXILIAR"» y **Enter no borra** (el defecto es No); con «Sí»
  quedan `l0` y `m1`, la capa desaparece de la tabla y el orden de dibujo tampoco guarda
  fantasmas. Designando un objeto en vez de teclear el nombre, igual.

Gates sobre el árbol: `npm run typecheck` (8/8), `eslint` de los cuatro archivos sin avisos,
`check:monolith-budget` (ninguno pasa de 800), `check:no-industrial-domain`,
`check:command-integrity` (274, sin cambio: las cinco todavía no están registradas).
`check:cad` completo NO pasa, y no por esto: `check:dwg-evidence` falla también con el árbol
limpio (comprobado con `git stash`), y `dwg/` no es territorio de este frente.

**Petición abierta:** `P-express-06` (registrar las cinco), con el diseño completo en
`express-peticiones.md`.


## «Todavía no»

### El PDF, al 2026-09-04

- **No están registradas.** Las diez órdenes existen y pasan sus specs, pero `engine/index.ts`,
  `command-summaries.ts`, `alias-table.ts` y `ribbon.ts` están fuera de mi territorio: hasta que
  se aplique `P-express-03`, el registro sigue en 274 y `ui-command-reach` en 274/274. Por la
  regla 1 de cimientos, mientras tanto **PDF sigue sin contar como implementado**, y así se
  declara.
- **El selector de archivo no abre.** `PDFATTACH`/`PDFIMPORT` con la opción `Archivo` declaran el
  límite con esas palabras; el archivo entra por la puerta de texto del anfitrión. Se cierra con
  `P-express-01`, que son diez líneas fuera y cuatro dentro.
- **El sustrato no tiene referencia a objeto propia.** ~~La cola pide «PDF como underlay con
  snap».~~ **Corregido a medias el 2026-09-04 (C6):** la geometría enganchable ya existe, es
  pura y está probada con anclas absolutas (`lib/cad/pdf/pdf-snap-geometry.ts`). Lo que sigue
  faltando es el CABLEADO: `Layout3DEditor.tsx` está fuera de mi territorio y es quien arma la
  `SnapScene` en cada `pointermove`. Hasta que se aplique `P-express-11`, el sustrato se ve y no
  imanta, y **«calcar con snap» no cuenta como implementado**.
- **PDFIMPORT entra a tamaño de papel y lo dice.** No hay ajuste por dos puntos como el de
  `PDFSCALE`: para geometría ya importada se usa `SCALE`. El aviso lo declara.

### COMPARE, al 2026-09-04

- **No está registrada.** `COMPARE` existe y pasa su spec, pero `engine/index.ts`,
  `command-summaries.ts`, `alias-table.ts` y `ribbon.ts` están fuera de mi territorio: hasta
  que se aplique `P-express-05`, el registro sigue en 274 y `ui-command-reach` en 274/274. Por
  la regla 1 de cimientos, mientras tanto **COMPARE no cuenta como implementada**, y así se
  declara.
- **Sólo compara contra la biblioteca ya cargada.** Con `context.xrefCatalog()` y contenido
  cargado, la orden compara entera sin salir del motor. Sin biblioteca —o con el activo listado
  y sin contenido— DECLARA el límite y no compara; cerrar ese camino necesita la petición de
  anfitrión `compare-fetch` (`P-express-04`), que vive en `engine/host-requests.ts`.
- **La nube es siempre un RECTÁNGULO festoneado.** AutoCAD también nubla por envolvente, así que
  no hay pérdida frente a él, pero una nube que siguiera el contorno real de un grupo disperso
  marcaría menos plano en blanco. Está sin hacer, no descartado.
- **No se comparan las TABLAS del documento.** El diff es de entidades: una capa renombrada, un
  estilo de cota retocado o un bloque redefinido no aparecen como diferencia salvo que muevan
  alguna entidad. Es el mismo alcance que DWG Compare, y se dice.

### Las Express Tools, al 2026-09-04

- **No están registradas.** Las cinco existen y pasan su spec, pero `engine/index.ts`,
  `command-summaries.ts`, `alias-table.ts` y `ribbon.ts` están fuera de mi territorio: hasta que
  se aplique `P-express-06`, el registro sigue en 274 y `ui-command-reach` en 274/274. Por la
  regla 1 de cimientos, mientras tanto **las cinco no cuentan como implementadas**, y así se
  declara.
- **Faltan ocho de las trece.** De la cola 1 siguen sin existir `TXTEXP`, `ARCTEXT`, `EXTRIM`,
  `MOCORO`, `SUPERHATCH`, `ALIASEDIT`, `DIMEX` y `DIMIM`. No son puras y por eso no entraron en
  esta entrega: `TXTEXP` y `ARCTEXT` necesitan la geometría de los glifos de la fuente (el motor
  no tiene métricas: el rótulo se dibuja en el atlas del pipeline, no en el documento);
  `SUPERHATCH` necesita un bloque o una imagen como patrón; `ALIASEDIT` escribe `alias-table.ts`,
  que es del registro; `DIMEX`/`DIMIM` son archivo de ida y vuelta, o sea anfitrión. `EXTRIM` y
  `MOCORO` sí son puras y sólo les faltó ventana en esta entrega.
- **LAYDEL no entra en las definiciones de bloque.** La geometría que vive dentro de un bloque
  no está en `document.entities`, así que un bloque que dibuje en la capa borrada sigue
  insertándola y la capa renace al insertarlo. AutoCAD entra en las definiciones; esto todavía
  no, y el aviso de la orden lo dice con esas palabras.
- **TXT2MTXT no reajusta líneas.** El MTEXT nace SIN ancho de columna, así que conserva
  exactamente los saltos de los TEXT originales. Poner un ancho exigiría medir el avance de cada
  glifo y el motor no tiene métricas de fuente: un ancho por promedio partiría párrafos donde no
  toca.
- **FLATTEN no proyecta sólidos.** Se niega sobre un `solid3d` y manda a FLATSHOT/SOLPROF, que
  es donde vive la línea oculta. AutoCAD sí lo proyecta desde FLATTEN; aquí sería una segunda
  implementación de lo mismo, peor.
- **TCOUNT numera TEXT y MTEXT, no atributos de bloque.** Un atributo se edita con ATTEDIT y su
  texto no es una entidad del espacio modelo; numerarlos exigiría entrar por
  `positionedAttributes`, que es otro camino de escritura.

### C5 · Pies y pulgadas: el analizador de entrada y el sitio único del rótulo (2026-09-04)

**Lo que había.** La mitad de SALIDA, y sólo ella: `unit-format.ts` sabe escribir
arquitectónico, ingeniería y fraccionario desde VD-CAD-DEPTH-B5, y `inquiry/reports.ts` lo
consume con las variables vivas. Lo demás estaba roto o partido, y esta vez se volvió a medir
en vez de citar C1:

- **La entrada, medida el 2026-09-04 sobre `parseCoordinate`:** de las dieciocho formas que un
  dibujante teclea, **quince devuelven `{ok:false}`**. Las tres que pasan (`6.5`, `.5`, `18.5`)
  son las únicas sin marca ni fracción. El analizador usa `Number(s)`.
- **El rótulo, partido en dos módulos que no se hablan:** `unit-format.ts` sabe de pulgadas y
  no sabe del documento (interpreta su argumento en pulgadas SIEMPRE, así que un muro de
  3200.4 mm le sale `266'-8 3/8"`); `dimension-format.ts` sabe del documento y su
  `LengthUnit` es `'mm' | 'cm' | 'm'`. Resultado medido: el ajuste arquitectónico se ve en
  DIST y en LIST y NO se ve en la cota, que es donde el cliente lo lee.

**Lo que hay ahora.** Dos módulos puros y tres specs, 1 456 líneas:

| Archivo | Qué es |
| --- | --- |
| `lib/cad/units-imperial.ts` (341) | La gramática (`parseImperialLength` → PULGADAS), la conversión a unidad de dibujo (`parseCadLengthInDrawingUnits` → lo que se GUARDA), `CAD_DRAWING_UNIT_TO_MM` y el mapa de `$INSUNITS` |
| `lib/cad/units-label.ts` (206) | El sitio ÚNICO donde una longitud se vuelve texto: valor en unidades de dibujo + unidad del documento + `LUNITS`/`LUPREC`/`INSUNITS` → rótulo |
| `lib/cad/units-imperial.spec.ts` (344) | 788 comprobaciones: la tabla de 18 formas, 12 negativas razonadas y 324 idas y vueltas contra `unit-format.ts` |
| `lib/cad/units-label.spec.ts` (285) | 1 037 comprobaciones: un número por cinco unidades y cinco `LUNITS`, y 324 idas y vueltas **sin una sola inestabilidad** |
| `lib/cad/verification/units-imperial.spec.ts` (280) | 22 comprobaciones: el gemelo imperial de `units-and-scale.spec.ts` |

**El número de la campaña, cruzado:** `10'-6"` tecleado son **3200.4 mm** de dibujo, se rotulan
`10'-6"` con LUNITS 4 y LUPREC 4, y ocupan **64.008 mm** de papel a 1:50 con `buildPlotSheet`.
Y la cadena cierra hacia atrás: el rótulo se vuelve a teclear y da el mismo número.

**Las cuatro decisiones, cada una escrita junto a su código.**

1. **La marca manda, y nunca se adivina.** `6"` son seis pulgadas se teclee donde se teclee;
   `6` a secas son seis unidades de dibujo. Un `6` interpretado como pulgada en un plano en
   milímetros mete 152.4 donde iban 6, y nadie lo ve hasta que la pieza no entra. La única
   forma de que un número desnudo signifique pulgadas es que el DIBUJO lo diga (`LUNITS` 3 o
   4, que es como AutoCAD se comporta), y eso viaja explícito en `assumeInches`.
2. **La desviación deliberada respecto de AutoCAD, en el rótulo.** AutoCAD asume que una unidad
   de dibujo es una pulgada cuando `LUNITS` está en arquitectónico o ingeniería. El nuestro lee
   `INSUNITS`, así que 3200.4 mm con LUNITS 4 se rotulan `10'-6"` y no `266'-8 3/8"`. La
   comilla ya declara «esto son pulgadas»: escribir la otra cifra sería mentir en el
   vocabulario del propio formato. El FRACCIONARIO no se convierte, y también a propósito: no
   lleva marca de unidad, es sólo una manera de escribir un número.
3. **La negativa razonada es parte del entregable, no un resto.** `1'2'` no se lee y se dice por
   qué. Un analizador que ante lo ambiguo devuelve un número es peor que uno que no lee nada,
   porque el número equivocado llega al plano.
4. **El pie se escribe `304.8` y no `25.4 * 12`.** En coma flotante binaria ese producto da
   304.79999999999995, y una tabla de factores con error en el último bit contamina todas las
   conversiones que pasan por ella.

**Dos defectos que la ida y vuelta destapó, medidos y no supuestos.** De las 324 idas y vueltas
contra `unit-format.ts`, **siete** no vuelven a la misma cadena, y son dos familias con nombre:

- **el acarreo de ingeniería (4):** `formatLength(23.6, { system: "engineering", precision: 0 })`
  da `1'-12"` porque parte en pies ANTES de redondear (`architectural` sí acarrea);
- **el menos cero (3):** `formatLength(-0.4, { system: "architectural", denominator: 1 })` da
  `-0'-0"` porque decide el signo antes de redondear.

`units-label.ts` hace las dos cosas bien por su cuenta —sus 324 idas y vueltas dan **cero**
inestables— así que el producto ya rotula bien por el camino nuevo. El arreglo de
`unit-format.ts` va en `P-express-07` con el parche exacto, porque ese archivo está fuera del
territorio del frente.

**Las cuatro peticiones que este entregable deja escritas** (`express-peticiones.md`), las tres
primeras son los tres sitios que deben delegar:

| Petición | Sitio | Qué cambia |
| --- | --- | --- |
| `P-express-07` | `unit-format.ts` | El acarreo de ingeniería y el menos cero |
| `P-express-08` | la COTA (`associative-dimension.ts`) | `units: 'ft'` rotula `10'-6"` en vez de `10.5000 ft`, delegando en `cadLengthLabel`; y las tres copias de la tabla mm-por-unidad pasan a ser una |
| `P-express-09` | el DXF (`dxf-export.ts`) | `$LUNITS` y `$LUPREC` viajan en la cabecera |
| `P-express-10` | la ENTRADA (`precision-input.ts`, `input-pipeline.ts`, `command-engine.ts`) | Las quince formas rotas pasan a leerse, con la unidad del documento |

Dos de las specs están escritas para FALLAR cuando su petición se aplique, a propósito y con el
aviso dentro: `units-imperial.spec.ts` vuelve a medir `parseCoordinate` renglón a renglón contra
la columna «roto», y declara con su cifra exacta los dos defectos de `unit-format.ts`. Un arreglo
que entrara en silencio dejaría la evidencia mintiendo, que es peor que el defecto.

### Las unidades imperiales, al 2026-09-04

- **La entrada todavía no llega al teclado del usuario.** `parseImperialLength` y
  `parseCadLengthInDrawingUnits` existen, están probadas y son puras, pero `precision-input.ts`,
  `input-pipeline.ts` y `command-engine.ts` están fuera de mi territorio: hasta que se aplique
  `P-express-10`, el dibujante sigue sin poder teclear `1'-6 1/2"`. Por la regla 1 de cimientos,
  mientras tanto **la entrada imperial no cuenta como implementada**, y así se declara.
- **La cota sigue rotulando en decimal.** `verification/units-imperial.spec.ts` lo imprime en su
  último renglón: dice «126.0000 in» donde el plano lleva «10'-6"». Lo cierra `P-express-08`.
- **El DXF sigue sin llevar `$LUNITS`/`$LUPREC`.** Medido en la misma spec. Lo cierra
  `P-express-09`. La comprobación ya está escrita en forma condicional, así que el día que
  viajen se validan solos.
- **El PDF no entra en este entregable.** La cola 3 dice «entrada, cota, DXF y PDF»; el rótulo
  de la hoja (`plot-sheet.ts`, cajetín y barra de escala) vive en `lib/cad/plot*`, que no es
  territorio del frente. Lo que sí se comprueba es la ARITMÉTICA del papel: 64.008 mm a 1:50,
  con `buildPlotSheet` real. El cajetín en pies y pulgadas queda sin hacer, no descartado.
- **No hay `UNITS` interactivo.** El ajuste se cambia con `SETVAR LUNITS`/`LUPREC`, que ya
  existe y ya gobierna el rótulo. El cuadro de diálogo de AutoCAD (`UNITS`) no está; sería una
  orden nueva en el registro y por tanto cuatro archivos fuera del territorio.
- **Las unidades de agrimensor (`1234'-5"` con separador de miles) no se leen ni se escriben.**
  AutoCAD tampoco las escribe por defecto; se menciona porque un topógrafo americano las teclea.
- **El sufijo de `INSUNITS` desconocido no se traduce.** Millas, yardas, angstroms y las demás
  quince entradas de la tabla del DXF devuelven `null` en vez de caer en milímetros: quien
  pregunta merece saber que el fichero declaró una unidad que no entendemos.

### C6 · Calcar de verdad: la geometría del sustrato a la que el cursor se engancha (2026-09-04)

**Lo que faltaba, dicho sin adornos.** C2 dejó diez órdenes de PDF alcanzables y su propia
sección «todavía no» decía que el sustrato **se ve pero no imanta**: una lámina colocada es una
entidad `image`, y una imagen no tiene extremos. Calcar sobre un fondo sin referencias a objeto
es dibujar a pulso mirando un gris: la esquina que se ve en la pantalla no es la que queda en el
documento, y el error de dos píxeles aparece al acotar. Eso es lo que este entregable cierra.

**Dos archivos nuevos, 1 244 líneas, y NI UNA de lectura de PDF.**

1. `apps/web/src/lib/cad/pdf/pdf-snap-geometry.ts` (639) — el módulo puro. Dado el sustrato ya
   adjunto y los bytes del archivo, devuelve `Segment[]` y `Point[]` **ya en coordenadas del
   dibujo**, en la forma exacta que `snap-engine.ts` consume: tramos con `pathId`/`ordinal`,
   extremos, puntos medios, centros de arco y orígenes de rótulo.
2. `apps/web/src/lib/cad/pdf/pdf-snap-geometry.spec.ts` (605) — **91 comprobaciones**, todas
   sobre el documento resultante de aplicar el lote con `executeCadEntityCommandBatch`.

**No hay lector nuevo, y ése era el punto.** La cadena
`pdf-objects → pdf-pages → pdf-content → pdf-curves → pdf-import` ya está probada contra el
corpus real y contra `check:pdf-corpus`, y es la que se llama. Lo que se construye es lo otro:
la **traducción de página a mundo** y los **dos filtros** que deciden qué se ofrece.

**Seis decisiones, cada una escrita junto a su código.**

1. **`importCadPdf` se llama con `unitsPerPoint: 1` e inserción en el origen.** Así devuelve la
   página en PUNTOS con la esquina del papel en (0,0) —el mismo sistema en el que viven
   `clipBoundary` y `worldToPage`— y la colocación se aplica UNA vez, al final, en un solo
   sitio. Pedirle a `importCadPdf` que ya escale pondría la escala en dos sitios, y dos verdades
   sobre lo mismo discrepan en cuanto alguien usa `PDFSCALE`.
2. **La colocación sale de los VECTORES de la entidad, no de la ficha.** `uVector`/`vVector` son
   lo que el render usa; la ficha guarda el mismo número por comodidad del gestor. Una copia que
   se consulta es una copia que algún día miente, y la spec lo mide: tras
   `cadPdfScaleToDistanceCommands` los mismos puntos se mueven con la lámina.
3. **`curveMode: "spline"`, y la teselación se hace aquí.** Una Bézier cúbica ES una NURBS de
   grado 3: error cero por álgebra. Aproximar después permite dos cosas que el modo polilínea no
   permitiría: saber qué tramos son CUERDAS de una curva —para no ofrecerlos como punto medio ni
   como pie de perpendicular, exactamente como hace `snap-scene.ts`— y recuperar el CENTRO del
   arco cuando la curva de verdad lo es.
4. **El centro de arco se comprueba, no se supone.** Se toma el circuncentro de la curva en
   t = 0, ½ y 1, y después se VERIFICA en t = ¼ y ¾ contra el 2 % del radio. Sin la
   comprobación cualquier curva daría centro —por tres puntos no alineados siempre pasa una
   circunferencia— y un centro falso es peor que ninguno: el cursor se pega a él con la misma
   confianza que a uno real. Medido: la Bézier del corpus (controles en 216/252) se desvía un
   9,86 % y se rechaza; el cuarto de círculo canónico se desvía un 0,026 % —medido en t = ¼ y ¾,
   que es donde se comprueba— y da su centro exacto.
5. **Las intersecciones NO se precalculan.** `snap-engine.ts` cruza los tramos de la escena y
   saca la real y la aparente. Precalcularlas aquí sería hacerlo sin saber contra qué: lo
   interesante al calcar es la intersección entre el muro NUEVO y la línea de la lámina, y eso
   sólo lo sabe el motor cuando tiene las dos.
6. **El papel es el primer recorte y siempre está.** Lo que el PDF dibuja fuera del `MediaBox`
   no aparece en la lámina, así que tampoco puede imantar. `PDFCLIP` es el segundo. Los tramos
   se CORTAN con `cadClipPath` de `xclip.ts` —la función que ya recorta xrefs— y los puntos
   notables se FILTRAN; los cabos de un tramo cortado no se ofrecen como extremos, porque el
   borde del recorte no es una esquina del dibujo.

**Las anclas absolutas de la spec, con su aritmética escrita.** La lámina del corpus es Carta,
612 × 792 puntos, y su contenido está en coordenadas conocidas:

| Ancla | Qué se exige |
| --- | --- |
| esquina inferior izquierda | `cadPdfPageToWorld(entidad)({0,0})` cae en el punto de inserción |
| esquina opuesta | 612 pt = **215,9 mm** y 792 pt = **279,4 mm**, escrito con el número |
| extremo conocido | (72,72) pt del rectángulo exterior cae a **25,4 mm** —una pulgada— del papel |
| punto medio | (180,72) pt, el de la línea de abajo |
| tras `PDFSCALE` | el punto designado se queda quieto y el otro queda a **5 000 mm** exactos |
| giro | la lámina girada 90° manda (72,72) pt a (−25,4 ; 25,4) |

Y los recuentos se exigen con su cifra: **12** extremos (4 del rectángulo exterior + 4 del `re`
+ 2 cabos de la Bézier + 2 de la línea azul, contados a mano sobre el flujo del corpus, con los
repetidos fundidos) y **9** puntos medios.

**Los dos casos que devuelven cero, con su motivo.** Un sustrato pasado por
`cadPdfUnloadCommands` da `status: "unloaded"`, cero candidatos y una nota que dice `PDFRELOAD`;
un recorte sobre papel en blanco da `status: "clipped_out"` y dice que la culpa es del recorte.
Un escaneo da `status: "raster"` y remite a calcar a pulso. Preguntar por un sustrato que no
está es `no_underlay`, no una excepción: desadjuntar y volver a preguntar es lo más normal.

**El atajo del recorte se toma sólo donde vale.** «Todos los vértices dentro, luego el camino
entero está dentro» es un teorema en un contorno CONVEXO y una mentira en uno cóncavo: entre dos
vértices de dentro, el tramo puede salirse por la escotadura y volver. El papel y el rectángulo
de `PDFCLIP` son convexos, así que el atajo se toma casi siempre; la convexidad se comprueba una
vez por sustrato y, cuando falla, se recorta de verdad.

**Las dos pruebas de que los filtros son de verdad, por mutación.** Se mutó el módulo quitando el
filtro por recorte: la spec **falló**. Se mutó forzando el atajo a `true` con un recorte en «L»:
la spec **falló** en el renglón de la escotadura. Restaurados los dos, vuelve a pasar. Un filtro
que no se puede romper no estaba filtrando.

**El enganche de punta a punta ya está medido.** La sección 10 de la spec construye una
`SnapScene` con `cadPdfSnapSceneAdd` y llama al `snap()` real del motor: devuelve `endpoint` en
la esquina del plano de fondo, al micrómetro. Con ventana por cursor y sin ella, el mismo punto.
Sobre un sustrato descargado, `null`.

### El enganche al sustrato, al 2026-09-04

- **No está cableado al editor.** `Layout3DEditor.tsx` es quien arma la `SnapScene` en cada
  `pointermove` (línea ~6505) y está fuera de mi territorio. `P-express-11` lleva el diseño
  completo: un import, un `ref` de memoria con firma de la lámina y ocho líneas en
  `resolvePointer`. Hasta que se aplique, **el sustrato se ve y no imanta**, y por la regla 1 de
  cimientos «calcar con snap» **no cuenta como implementado**.
- **Sólo se leen los sustratos con ruta `data:`.** Es lo que `PDFATTACH` produce hoy desde el
  navegador y lo que `PDFPAGE` ya usa para cambiar de página. Un `tenant-asset://` necesita el
  canal de anfitrión de `P-express-01`; leerlo dentro de `resolvePointer` metería una lectura
  asíncrona en el camino del ratón, y eso no se hace.
- **No hay CUADRANTE ni NODO del sustrato.** El centro del arco sí sale; sus cuatro cuadrantes,
  no. Se podrían derivar del centro y del radio, pero habría que comprobar que cada uno cae
  DENTRO del arco dibujado —un cuarto de círculo tiene un cuadrante, no cuatro— y eso es otro
  entregable. Nodo no aplica: el PDF no tiene entidad de punto.
- **El texto sólo aporta su ORIGEN, no su caja.** `insertions` lleva el arranque de la línea
  base de cada rótulo. La caja envolvente exigiría medir la fuente, que es lo que `pdf-fonts.ts`
  hace a medias y sólo para traducir caracteres.
- **La extracción no está en caché dentro del módulo, a propósito.** Es una función pura: leer
  el PDF cuesta milisegundos y quien la llama decide cuándo. La memoria con firma de la lámina
  va en el editor y su diseño está en `P-express-11`; ponerla aquí escondería un estado global
  en un módulo que hoy se puede probar sin montar nada.
