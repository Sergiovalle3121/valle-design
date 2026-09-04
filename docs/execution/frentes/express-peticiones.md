# Peticiones de F4 · Express y universal

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-express-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

La numeración sigue el plan de la campaña, no el orden en que se escriben: un número sin
petición todavía es un hueco reservado, no un descuido.

## Peticiones

### P-express-01 · Canal `pdf-file` del anfitrión para PDFATTACH y PDFIMPORT

- **Archivos:**
  - `apps/web/src/lib/cad/engine/command-types.ts` (unión `CadUiTarget`)
  - `apps/web/src/components/cad/command-line/session-catalogs.ts` (manejador)
  - `apps/web/src/components/cad/command-line/use-command-engine.ts` (reentrada por `feedFile`)
- **Por qué:** cola 4. Las diez órdenes de PDF ya están construidas y probadas
  (`engine/commands/pdf-underlay-commands.ts` y su spec), y el sobre del archivo con su tope y
  su comprobación de extensión ya está en `lib/cad/pdf/pdf-attach-payload.ts`. Lo único que
  falta para que el usuario pueda elegir un PDF con el ratón son estas tres piezas, todas
  fuera de mi territorio. Hoy `PDFATTACH` con la opción `Archivo` DECLARA el límite («el
  selector de archivos para PDF todavía no está conectado en este espacio de trabajo») en vez
  de abrir un cuadro inexistente; con esta petición aplicada, esa rama pasa a devolver la
  petición de interfaz.
- **Cambio exacto:**

  1. En `command-types.ts`, añadir a la unión `CadUiTarget`, junto a `image-file`:

     ```ts
       /**
        * Selector de archivo de `PDFATTACH` y `PDFIMPORT`: el levantamiento del
        * topógrafo o la lámina del municipio. Llega en BYTES —un PDF no es texto—
        * y el anfitrión lo empaqueta como `data:` con
        * `cadPdfAttachPayloadFor` (`lib/cad/pdf/pdf-attach-payload.ts`). A
        * diferencia de `image-file`, el sobre NO declara páginas ni tamaños: el
        * lector de PDF vive dentro del motor y los deduce él.
        */
       | "pdf-file"
     ```

  2. En `session-catalogs.ts`, `useCadFileCommandHandlers` gana un parámetro `onPdf: (name:
     string, text: string) => void` (después de `onImage`, y añadido a las dependencias del
     `useEffect`), y un manejador junto a los otros:

     ```ts
       registerCadUiHandler("pdf-file", () => {
         // El PDF entra en bytes y sale como sobre `data:`. No hace falta
         // decodificar nada aquí: las páginas las cuenta el motor.
         void pickCadFiles(CAD_PDF_ATTACH_ACCEPT).then((files) => {
           const file = files[0];
           if (!file) return;
           onPdf(file.name, cadPdfAttachPayloadFor(file));
         });
         return true;
       }),
     ```

     con `import { CAD_PDF_ATTACH_ACCEPT, cadPdfAttachPayloadFor } from
     "@/lib/cad/pdf/pdf-attach-payload";` (o la ruta relativa que use el archivo para el resto
     de imports de `lib/cad`).

  3. En `use-command-engine.ts`, un quinto `useCallback` en la llamada a
     `useCadFileCommandHandlers`, calcado del de IMAGEATTACH. La orden que se reinvoca depende
     de cuál pidió el archivo, y el motor no lo dice, así que se toma la que esté viva y, si no
     hay ninguna, se arranca `PDFATTACH` (que es el caso mayoritario: el escaneo):

     ```ts
     // PDF (F4, 2026-09-04): ídem, con el sobre del PDF.
     useCallback(
       (name: string, text: string) => {
         if (!engine.busy) engine.invoke("PDFATTACH");
         engine.feedFile(name, text);
       },
       [engine],
     ),
     ```

  4. Con (1) aplicado, y **sólo entonces**, en mi territorio sustituyo las dos ramas
     `say(state, "PDFATTACH: " + FILE_PICKER_PENDING)` y su gemela de PDFIMPORT por la
     petición de interfaz, con su `unavailable` ya escrito. Eso lo hago yo; queda anotado aquí
     para que se sepa que la petición no está completa hasta ese último paso.

- **Cómo se comprueba:** `npx tsx src/lib/cad/pdf/pdf-attach-payload.spec.ts` ya demuestra que
  el sobre lleva un PDF de tres páginas ida y vuelta byte a byte y que el motor le sigue
  contando tres páginas; tras (4), la spec de órdenes cambia la comprobación «la opción Archivo
  DECLARA su límite» por «Archivo pide el archivo por el canal `pdf-file`», que es la misma
  comprobación que `raster-image.spec.ts` hace para `image-file`.
- **Estado:** pendiente

### P-express-03 · Registrar las diez órdenes de PDF

- **Archivos:**
  - `apps/web/src/lib/cad/engine/index.ts`
  - `apps/web/src/lib/cad/engine/command-summaries.ts`
  - `apps/web/src/lib/cad/engine/alias-table.ts`
  - `apps/web/src/lib/cad/ribbon.ts`
  - `docs/cad/evidence/ui-command-reach.json` (regenerado, no escrito a mano)
- **Por qué:** cola 4. Las diez órdenes existen, están probadas contra PDF reales del corpus y
  aplican sus lotes por `executeCadEntityCommandBatch`, pero **no están en el registro**, así
  que nadie las puede teclear ni pulsar. Mientras no se registren, la regla 1 de cimientos
  sigue diciendo que PDF no está implementado, y con razón.
- **Cambio exacto:**

  1. `engine/index.ts`: junto a los otros imports de `./commands/*`,

     ```ts
     import { CAD_PDF_UNDERLAY_COMMANDS } from "./commands/pdf-underlay-commands";
     ```

     y en la lista de descriptores, junto a `...CAD_RASTER_IMAGE_COMMANDS`,

     ```ts
       ...CAD_PDF_UNDERLAY_COMMANDS,
     ```

     Son diez descriptores y arrastran `pdf-underlay-edit-commands.ts` y
     `pdf-underlay-support.ts` por importación; no hay que registrar nada más.

  2. `engine/command-summaries.ts`: diez entradas nuevas, en el orden alfabético del objeto.

     ```ts
       PDFADJUST: "Desvanecido y bloqueo de un sustrato de PDF (0 opaco a 100 invisible).",
       PDFATTACH: "Adjunta una página de un PDF como sustrato para calcar encima: página, inserción, escala y bloqueo.",
       PDFCLIP: "Recorta un sustrato de PDF por rectángulo o polígono, o quita el recorte.",
       PDFDETACH: "Desadjunta un sustrato de PDF y retira su capa.",
       PDFIMPORT: "Importa los VECTORES de un PDF como entidades editables, con su informe de pérdidas.",
       PDFLIST: "Lista los sustratos de PDF del dibujo: página, tamaño, escala, estado y recorte.",
       PDFPAGE: "Cambia la página de un sustrato de PDF sin volver a adjuntarlo.",
       PDFRELOAD: "Vuelve a mostrar un sustrato de PDF descargado.",
       PDFSCALE: "Escala un sustrato de PDF a medida conocida: dos puntos y cuánto miden de verdad.",
       PDFUNLOAD: "Descarga un sustrato de PDF conservando su sitio, su escala y su ruta.",
     ```

  3. `engine/alias-table.ts`: los alias en español que ya declaran los descriptores. Van en el
     bloque de referencias/importación, junto a `ADJUNTARIMAGEN` e `IMPORTARGIS`.

     ```ts
       ADJUNTARPDF: "PDFATTACH",
       IMPORTARPDF: "PDFIMPORT",
       RECORTARPDF: "PDFCLIP",
       AJUSTARPDF: "PDFADJUST",
       PAGINAPDF: "PDFPAGE",
       ESCALARPDF: "PDFSCALE",
       DESADJUNTARPDF: "PDFDETACH",
       DESCARGARPDF: "PDFUNLOAD",
       RECARGARPDF: "PDFRELOAD",
       LISTARPDF: "PDFLIST",
     ```

  4. `lib/cad/ribbon.ts`: sin esto los diez aparecen igual (el panel de reposo de su pestaña los
     recoge, así que la cobertura no se rompe), pero caen dispersos por su `kind`. Dos patrones
     los dejan donde AutoCAD los pone, en Insertar › Referencias:

     - en `CAD_TAB_NAME_PATTERNS`, dentro del patrón de la pestaña `insertar`, añadir
       `|PDFATTACH|PDFIMPORT|PDFCLIP|PDFADJUST|PDFPAGE|PDFSCALE|PDFDETACH|PDFUNLOAD|PDFRELOAD|PDFLIST`;
     - en `CAD_PANEL_NAME_PATTERNS`, en la línea del panel `"Referencias"`, la misma adición.

  5. `docs/cad/evidence/ui-command-reach.json`: **no se edita**, se regenera con
     `node scripts/cad/ui-command-reach.mjs --write`. Con los diez registrados la cifra pasa de
     274/274 a 284/284.

- **Cómo se comprueba:** `npm run check:command-integrity` da veredicto sobre los diez (todos
  terminan con efecto verificado o con su límite declarado: `PDFATTACH` y `PDFIMPORT` sin sobre
  contestan por qué un PDF no se pega, y ninguno responde «hecho» vacío);
  `node scripts/cad/check-ribbon-coverage.mjs` y `node scripts/cad/ui-command-reach.mjs --check`
  cierran el alcance con ratón; `apps/web/src/lib/cad/engine/command-summaries.spec.ts` cierra el
  contrato fail-closed de los resúmenes.
- **Estado:** pendiente

### P-express-04 · Petición de anfitrión `compare-fetch` para COMPARE sin biblioteca precargada

- **Archivos:**
  - `apps/web/src/lib/cad/engine/host-requests.ts` (unión `CadHostRequest`)
  - `apps/web/src/components/cad/command-line/session-catalogs.ts` (manejador)
- **Por qué:** cola 2. `COMPARE` ya está construido y probado
  (`engine/commands/compare-drawings.ts` y su spec) y compara **sin salir del motor**
  cuando `context.xrefCatalog()` trae el activo CON su `snapshot`. Sin biblioteca —o con el
  activo listado pero sin contenido— la orden hoy declara el límite en vez de comparar. Es el
  mismo agujero que `XATTACH` tenía antes de la Ola 2 y se cierra igual: el motor dice QUÉ
  dibujo quiere, el anfitrión lo trae. Traer el contenido de un activo es I/O y este motor es
  síncrono y puro.
- **Cambio exacto:**

  1. En `host-requests.ts`, junto a `{ kind: "xref-attach" }`:

     ```ts
       /**
        * Trae OTRO dibujo del inquilino para compararlo con el abierto.
        *
        * Es el mismo reparto que `xref-attach` y por la misma razón: el motor
        * decide qué comparar, el anfitrión lo descarga. La diferencia es que
        * aquí NO se proyecta nada en el documento — el dibujo traído se compara
        * y se tira, y lo único que se escribe son las nubes de revisión.
        */
       | {
           kind: "compare-fetch";
           /** Lo que el usuario tecleó: id del activo o su nombre. */
           assetId: string;
           /** Revisión pedida; `UNIVERSAL` es la vigente. */
           revision: string;
           /** Qué hacer al recibirlo: marcar con nubes o sólo informar. */
           mode: "clouds" | "report";
         }
     ```

  2. En `session-catalogs.ts`, el manejador descarga el activo con la misma vía que el panel de
     referencias externas y **reentra** en la orden por la puerta de texto, exactamente como
     hace `xref-attach`: al volver, el activo ya está en `xrefCatalog()` CON su `snapshot`, y
     `COMPARE` sigue solo desde el paso de «¿nubes o informe?». No hace falta ninguna función
     nueva del lado del motor: `cadCompareDocuments` y `cadCompareRevisionClouds` ya trabajan
     sobre `CadDocument`.

  3. En `engine/commands/compare-drawings.ts` (territorio del frente, se aplica aquí en cuanto
     exista la unión): la rama `noContent(entry)` y la rama `NO_CATALOG` pasan a devolver
     `{ kind: "host", request: { kind: "compare-fetch", … }, label: "COMPARE" }` en vez del
     mensaje que declara el límite. El mensaje se conserva como respuesta cuando el anfitrión
     no atiende la petición.

- **Cómo se comprueba:** `apps/web/src/lib/cad/engine/commands/compare-drawings.spec.ts`
  (sección 4) hoy exige que las dos ramas DIGAN por qué no pueden comparar; con la petición
  aplicada la spec exige la petición de anfitrión con su `assetId`, su `revision` y su `mode`,
  y conserva el mensaje como la respuesta al anfitrión ausente.
- **Estado:** pendiente

### P-express-05 · Registrar COMPARE

- **Archivos:** `apps/web/src/lib/cad/engine/index.ts`, `engine/command-summaries.ts`,
  `engine/alias-table.ts`, `apps/web/src/lib/cad/ribbon.ts`,
  `docs/cad/evidence/ui-command-reach.json`
- **Por qué:** cola 2. La orden está construida y probada
  (`engine/commands/compare-drawings.ts`, 46 comprobaciones), pero los cuatro archivos del
  registro están fuera del territorio del frente. Hasta que se aplique, el registro sigue en
  274 y, por la regla 1 de cimientos, COMPARE **no cuenta como implementado**.
- **Cambio exacto:**

  1. `engine/index.ts`: junto a los demás imports de `./commands/…`,

     ```ts
     import { CAD_COMPARE_COMMANDS } from "./commands/compare-drawings";
     ```

     y en la lista de descriptores, junto a `...CAD_XREF_COMMANDS`,

     ```ts
       ...CAD_COMPARE_COMMANDS,
     ```

     Es UN descriptor y arrastra `lib/cad/compare-documents.ts` y
     `lib/cad/compare-revision-clouds.ts` por importación.

  2. `engine/command-summaries.ts`: una entrada, en el orden alfabético del objeto.

     ```ts
       COMPARE: "Compara el dibujo abierto con otro dibujo del inquilino y marca las diferencias con nubes de revisión.",
     ```

  3. `engine/alias-table.ts`: los dos alias que ya declara el descriptor, en el bloque de
     gestión junto a `AUDITORIA`/`PURGAR`.

     ```ts
       COMPARAR: "COMPARE",
       DWGCOMPARE: "COMPARE",
     ```

  4. `lib/cad/ribbon.ts`: sin esto COMPARE aparece igual (cae en el panel de reposo de
     «Administrar», que es la pestaña de su `kind`), pero disperso. Dos patrones lo dejan donde
     AutoCAD lo pone —su pestaña Colaborar no existe aquí; Administrar es la equivalente—:

     - en `CAD_TAB_NAME_PATTERNS`, dentro del patrón de la pestaña `administrar`, añadir
       `|COMPARE` a la alternancia;
     - en `CAD_PANEL_NAME_PATTERNS`, una línea nueva antes de la de `Utilidades`:

       ```ts
         [/^COMPARE$/, "Comparar"],
       ```

  5. `docs/cad/evidence/ui-command-reach.json`: **no se edita**, se regenera con
     `node scripts/cad/ui-command-reach.mjs --write`. Con COMPARE registrado la cifra pasa de
     274/274 a 275/275 (y a 285/285 si P-express-03 se aplica en la misma ventana).

- **Cómo se comprueba:** `npm run check:command-integrity` da veredicto sobre COMPARE —termina
  con efecto verificado cuando hay biblioteca con contenido, y declara su límite cuando no la
  hay, sin «hecho» vacío—; `node scripts/cad/check-ribbon-coverage.mjs` y
  `node scripts/cad/ui-command-reach.mjs --check` cierran el alcance con ratón;
  `apps/web/src/lib/cad/engine/command-summaries.spec.ts` cierra el contrato fail-closed.
- **Estado:** pendiente

### P-express-06 · Registrar las cinco Express Tools puras

- **Archivos:** `apps/web/src/lib/cad/engine/index.ts`,
  `apps/web/src/lib/cad/engine/command-summaries.ts`,
  `apps/web/src/lib/cad/engine/alias-table.ts`, `apps/web/src/lib/cad/ribbon.ts`,
  `docs/cad/evidence/ui-command-reach.json`
- **Por qué:** cola 1. `BREAKLINE`, `TCOUNT`, `TXT2MTXT`, `FLATTEN` y `LAYDEL` están
  construidas y probadas (`engine/commands/express-tools.ts`, `express-tools-text.ts`,
  `express-tools-support.ts`, 99 comprobaciones con el lote aplicado), pero los cuatro archivos
  del registro están fuera del territorio del frente. Hasta que se aplique, el registro sigue
  en 274 y, por la regla 1 de cimientos, las cinco **no cuentan como implementadas**.
- **Cambio exacto:**

  1. `engine/index.ts`: junto a los demás imports de `./commands/…`,

     ```ts
     import { CAD_EXPRESS_TOOL_COMMANDS } from "./commands/express-tools";
     ```

     y en la lista de descriptores, junto a `...CAD_BURST_COMMANDS`,

     ```ts
       ...CAD_EXPRESS_TOOL_COMMANDS,
     ```

     Son CINCO descriptores en un solo array: `express-tools.ts` ya concatena los dos de
     `express-tools-text.ts`, así que no hay un segundo import que olvidar.

  2. `engine/command-summaries.ts`: cinco entradas, cada una en su sitio del orden alfabético
     del objeto.

     ```ts
       BREAKLINE: "Dibuja la línea de rotura entre dos puntos, con el símbolo a la escala del dibujo (DIMSCALE).",
       FLATTEN: "Aplasta los objetos designados a Z=0 y declara lo que no pudo aplastar.",
       LAYDEL: "Borra una capa y todos sus objetos, con confirmación; se niega sobre la 0, la actual y las bloqueadas.",
       TCOUNT: "Numera los textos designados por X, por Y o por orden de designación, con prefijo, sufijo e incremento.",
       TXT2MTXT: "Funde varios TEXT en un solo MTEXT en orden de lectura y borra los originales.",
     ```

  3. `engine/alias-table.ts`: los cinco alias en español que ya declaran los descriptores. El
     pipeline de entrada resuelve por ESTA tabla, no por el descriptor, así que sin esto los
     alias no llegan a ninguna parte (es el defecto medido del golden 77 con `DX`).

     ```ts
       ROTURA: "BREAKLINE",
       APLANAR: "FLATTEN",
       CAPABORRAR: "LAYDEL",
       NUMTEXTO: "TCOUNT",
       TEXTOAMTEXTO: "TXT2MTXT",
     ```

  4. `lib/cad/ribbon.ts`: sin esto las cinco aparecen igual —caen en el panel de reposo de la
     pestaña de su `kind`—, pero dispersas. `LAYDEL` **no necesita nada**: el patrón
     `LAY(?!OUT|TRANS)[A-Z]+` ya lo lleva a la pestaña Inicio y al panel «Capas», junto a
     LAYMRG y LAYISO, que es donde AutoCAD lo pone. Las otras cuatro son cuatro alternancias
     dentro de `CAD_PANEL_NAME_PATTERNS`, sin patrones nuevos:

     - panel «Dibujo»: añadir `|BREAKLINE` a la alternancia que hoy termina en `|WIPEOUT`;
     - panel «Modificar»: añadir `|FLATTEN` a la alternancia que hoy termina en `|DRAWORDER`
       (la primera de las dos entradas de «Modificar», la que empieza en `MOVE`);
     - panel «Texto y tablas»: añadir `|TCOUNT|TXT2MTXT` a la alternancia que hoy termina en
       `|UPDATEFIELD`.

     No hace falta tocar `CAD_TAB_NAME_PATTERNS`: `BREAKLINE` (`draw`) y `FLATTEN` (`modify`)
     caen en Inicio por su `kind`, `TCOUNT` y `TXT2MTXT` (`annotate`) en Anotar, y `LAYDEL` ya
     lo resuelve el patrón de la familia LAY.

  5. `docs/cad/evidence/ui-command-reach.json`: **no se edita**, se regenera con
     `node scripts/cad/ui-command-reach.mjs --write`. Con las cinco registradas la cifra pasa de
     274/274 a 279/279 (y a 290/290 si `P-express-03` y `P-express-05` entran en la misma
     ventana).

- **Cómo se comprueba:** `npm run check:command-integrity` da veredicto sobre las cinco —las
  cinco MUTAN y las cinco terminan con efecto verificado; ninguna es exenta ni «declara su
  límite»—; `node scripts/cad/check-ribbon-coverage.mjs` y
  `node scripts/cad/ui-command-reach.mjs --check` cierran el alcance con ratón;
  `apps/web/src/lib/cad/engine/command-summaries.spec.ts` cierra el contrato fail-closed;
  `npx tsx apps/web/src/lib/cad/engine/commands/express-tools.spec.ts` sigue en 99.
- **Estado:** pendiente

### P-express-07 · Dos defectos de `unit-format.ts` que la ida y vuelta destapó

- **Archivo:** `apps/web/src/lib/cad/unit-format.ts`
- **Por qué:** cola 3. Al cerrar la ida y vuelta `formatLength` → `parseImperialLength`
  (`units-imperial.spec.ts`, 324 idas y vueltas: tres sistemas × `LUPREC` 0..8 × doce
  valores) aparecieron **siete** casos en los que formatear el valor releído da una cadena
  distinta de la original. No son ruido de coma flotante: son dos defectos con nombre, los dos
  medidos el 2026-09-04.

  1. **El acarreo de ingeniería (4 casos).** `architectural` acarrea las pulgadas al pie
     cuando el redondeo de la fracción llega a doce; `engineering` **no**, porque parte en
     pies ANTES de redondear. Medido:
     `formatLength(23.6, { system: "engineering", precision: 0 })` → `1'-12"`, y
     `formatLength(143.7, …)` → `11'-12"`. Ningún plano lleva doce pulgadas en el campo de las
     pulgadas, y además rompe la idempotencia: `1'-12"` se relee 24 y se reescribe `2'-0"`.
  2. **El menos cero (3 casos).** El signo se decide antes de redondear, así que un valor que
     redondea a cero se escribe con menos: `formatLength(-0.4, { system: "architectural",
     denominator: 1 })` → `-0'-0"`. Al releerlo da `-0`, y al reescribirlo el menos
     desaparece. `dimension-format.ts` ya tropezó con lo mismo y lo tapó por su cuenta con
     `Math.abs(value) < 1e-12 ? 0 : value`; aquí falta.

  `units-label.ts` —el rótulo por el que el producto escribe— ya hace las dos cosas bien por
  su cuenta (`units-label.spec.ts`: 324 idas y vueltas, **cero** inestables), así que esto no
  bloquea el entregable. Se pide porque `inquiry/reports.ts` sigue llamando a `unit-format.ts`
  directamente y DIST puede imprimir `1'-12"` hoy.

- **Cambio exacto:**

  1. En `formatLength`, sustituir el `case "engineering"` entero por:

     ```ts
       case "engineering": {
         // El acarreo se hace ANTES de partir en pies. Partir primero y
         // redondear después emite `1'-12"` para 23.6" con precisión 0: doce
         // pulgadas en el campo de las pulgadas, que además se relee como 24 y
         // se reescribe `2'-0"` (medido, F4 2026-09-04).
         const rounded = Number(abs.toFixed(precision));
         if (rounded === 0) return `0'-${(0).toFixed(precision)}"`;
         const feet = Math.floor(rounded / 12 + 1e-9);
         const remInches = Math.max(0, rounded - feet * 12);
         return `${sign}${feet}'-${remInches.toFixed(precision)}"`;
       }
     ```

     (`sign` y `abs` ya existen arriba, en el cuerpo de la función.)

  2. Para el menos cero, una guarda al calcular el signo. Sustituir

     ```ts
       const sign = value < 0 ? "-" : "";
       const abs = Math.abs(value);
     ```

     por

     ```ts
       const abs = Math.abs(value);
       // Un valor que REDONDEA a cero no lleva signo: `-0'-0"` no es una
       // longitud, es el orden de las operaciones asomando. El paso depende del
       // sistema —el denominador en los fraccionarios, la potencia de diez en
       // los decimales— y sólo se aplica cuando el número cabe sin perder
       // dígitos al escalarlo.
       const step = options.system === "architectural" || options.system === "fractional" ? denom : 10 ** precision;
       const scaled = abs * step;
       const roundsToZero = scaled < Number.MAX_SAFE_INTEGER && Math.round(scaled) === 0;
       const sign = value < 0 && !roundsToZero ? "-" : "";
     ```

     `denom` y `precision` ya están calculados encima de esas dos líneas; sólo hay que mover
     el bloque del signo por debajo de ellos.

- **Cómo se comprueba:** `npx tsx src/lib/cad/unit-format.spec.ts` sigue verde (ninguna de sus
  aserciones toca los dos casos). En `units-imperial.spec.ts` hay que actualizar, en el mismo
  commit, las dos aserciones que hoy declaran la cifra REAL —están juntas y comentadas—:
  `formatLength(23.6, …)` pasa de `1'-12"` a `2'-0"`, `formatLength(-0.4, …)` pasa de `-0'-0"`
  a `0'-0"`, y los dos `ok(familias.* > 0)` pasan a `eq(familias.*, 0)` con `inestables` en 0.
  Están escritas así a propósito: el arreglo no puede entrar en silencio.
- **Estado:** pendiente

### P-express-08 · La cota rotula en pies y pulgadas (sitio 2 de 3)

- **Archivos:** `apps/web/src/lib/cad/associative-dimension.ts`
- **Por qué:** cola 3, «unidades imperiales … en entrada, cota, DXF y PDF». Medido: la cota
  puede declarar `units: 'in'` o `'ft'` (el esquema canónico ya los admite) pero
  `formatCadDimensionMeasurement` escribe `converted.toFixed(precision)`, así que un plano
  arquitectónico en pulgadas rotula `126.0000 in` donde lleva `10'-6"`. Con `LUNITS` no tiene
  nada que ver: la cota no lo mira. `verification/units-imperial.spec.ts` lo deja medido en su
  renglón final.

  El rótulo ya existe y está probado: `cadLengthLabel` de `lib/cad/units-label.ts`. Esta
  petición sólo hace que la cota lo llame.

- **Cambio exacto:** en `associative-dimension.ts`, dentro de
  `formatCadDimensionMeasurement`, sustituir el tramo lineal (desde `const sourceUnit` hasta
  el `return label`) por:

  ```ts
    const sourceUnit = entity.sourceUnit ?? 'mm';
    const unit = entity.units ?? sourceUnit;
    const converted = (measurement * UNIT_TO_MM[sourceUnit]) / UNIT_TO_MM[unit];
    // Una cota en PIES es una cota arquitectónica: en un plano nadie escribe
    // «10.5000 ft», se escribe «10'-6"». Es la única unidad del enum que
    // cambia de comportamiento, y cambia porque su nombre ya lo pedía; `in`
    // sigue en decimal, que es lo que un plano mecánico quiere leer.
    //
    // La tolerancia se queda en el camino decimal a propósito: «10'-6" ± 1/8"»
    // no es una forma que ISO 129-1 ni la práctica americana usen sobre una
    // cota arquitectónica, y hornear una aquí sería inventarse una norma.
    if (unit === 'ft' && !tolerance) {
      const label = cadLengthLabel(measurement, {
        drawingUnit: sourceUnit,
        // `precision` de la cota es el exponente del denominador, igual que
        // LUPREC: 4 → 1/16, que es la precisión con la que se dibuja en pies.
        lunits: 4,
        luprec: precision,
      });
      return `${entity.prefix ?? ''}${label}${entity.suffix ?? ''}`;
    }
    const body = tolerance ? cadDimensionToleranceText(converted, precision, tolerance, 1 / UNIT_TO_MM[unit]) : converted.toFixed(precision);
    let label = `${entity.prefix ?? ''}${body} ${unit}${entity.suffix ?? ''}`;
    if (entity.alternateUnits) {
      const alternate = (measurement * UNIT_TO_MM[sourceUnit]) / UNIT_TO_MM[entity.alternateUnits];
      label += ` [${alternate.toFixed(precision)} ${entity.alternateUnits}]`;
    }
    return label;
  ```

  con `import { cadLengthLabel } from './units-label';` junto a los demás imports del archivo.

  **Y una limpieza que va en el mismo commit, o no va:** `UNIT_TO_MM` de
  `associative-dimension.ts` (línea 22) y `TO_MM` de `dimension-format.ts` son la misma tabla
  escrita dos veces, y ahora tres con `CAD_DRAWING_UNIT_TO_MM` de `units-imperial.ts`. La
  regla 4 de cimientos prohíbe exactamente eso. Sustituir las dos por
  `import { CAD_DRAWING_UNIT_TO_MM as UNIT_TO_MM } from './units-imperial';` en
  `associative-dimension.ts`, y en `dimension-format.ts` por
  `const TO_MM = CAD_DRAWING_UNIT_TO_MM;` (su `LengthUnit` es un subconjunto de
  `CadDrawingUnit`, así que el tipo sigue cuadrando sin tocar la firma pública de
  `convertLength`).

- **Cómo se comprueba:** `npx tsx src/lib/cad/verification/units-and-scale.spec.ts` sigue en
  verde con su golden `«3.50 m»` intacto —el camino métrico no cambia ni un carácter—;
  `npx tsx src/lib/cad/verification/units-imperial.spec.ts` imprime en su último renglón
  «la cota dice …» y ahí tiene que aparecer `10'-6"`;
  `npx tsx src/lib/cad/associative-dimension.spec.ts`,
  `npx tsx src/lib/cad/dimension-format.spec.ts` y
  `npx tsx src/lib/cad/dimension-tolerance.spec.ts` cierran lo que ya existía.
- **Estado:** pendiente

### P-express-09 · `$LUNITS` y `$LUPREC` viajan en el DXF (sitio 3 de 3)

- **Archivos:** `apps/web/src/lib/cad/dxf-export.ts`,
  `apps/web/src/lib/cad/dxf-document-export.ts`
- **Por qué:** cola 3. Medido: `pushHeader` escribe `$ACADVER`, `$INSUNITS`, `$LTSCALE`,
  `$PDMODE` y `$PDSIZE`, y **no escribe `$LUNITS` ni `$LUPREC`**. Un despacho que deja el
  dibujo en arquitectónico a 1/16 y lo manda a un colega ve el fichero abrirse en decimal:
  el ajuste no está en ninguna parte del archivo. Es la misma clase de pérdida silenciosa que
  el comentario de `$LTSCALE` ya explica dos líneas más abajo, y se arregla igual.
- **Cambio exacto:**

  1. En `dxf-export.ts`, ampliar `CadDxfExportOptions`:

     ```ts
     export interface CadDxfExportOptions {
       units?: CadDxfExportUnit;
       fileComment?: string;
       /**
        * Cómo se ESCRIBEN las longitudes en el dibujo: `$LUNITS` (1 científico,
        * 2 decimal, 3 ingeniería, 4 arquitectónico, 5 fraccionario) y `$LUPREC`
        * (decimales, o exponente del denominador en los fraccionarios). Sin
        * ellas, el ajuste arquitectónico del dibujo no sobrevive al fichero.
        */
       lengthUnits?: { lunits: number; luprec: number };
     }
     ```

  2. En `pushHeader`, justo después del par de `$INSUNITS`:

     ```ts
       // El FORMATO de las longitudes es del dibujo, igual que su unidad. Sin
       // estos dos pares, un plano dejado en pies y pulgadas se abre en decimal
       // en el otro extremo y nadie puede saber que estaba en otra cosa.
       if (options.lengthUnits) {
         pushPair(lines, 9, "$LUNITS");
         pushPair(lines, 70, Math.max(1, Math.min(5, Math.trunc(options.lengthUnits.lunits))));
         pushPair(lines, 9, "$LUPREC");
         pushPair(lines, 70, Math.max(0, Math.min(8, Math.trunc(options.lengthUnits.luprec))));
       }
     ```

  3. En `dxf-document-export.ts`, `exportCadDocumentDxf` pasa `options ?? {}` tal cual a
     `exportCadDxf`, así que no hay que tocar nada más ahí: quien exporta (el comando `DXFOUT`
     y la sesión) es quien tiene las variables vivas y quien compone
     `{ lengthUnits: { lunits: Number(variables.get("LUNITS") ?? 2), luprec: Number(variables.get("LUPREC") ?? 4) } }`.
     Si se prefiere que el documento lo lleve, `CadDxfDocumentExportSource.meta` ya tiene el
     precedente de `linetypeScale` y se replicaría igual (`meta?.lengthUnits`).

- **Cómo se comprueba:** `npx tsx src/lib/cad/verification/units-imperial.spec.ts` — ya lleva
  escrita la comprobación condicional: **si** el DXF escribe `$LUNITS`, tiene que decir 4 en
  el caso arquitectónico, y su último renglón deja de imprimir «NO viaja».
  `npm run check:dxf-corpus` y `npx tsx src/lib/cad/dxf-export.spec.ts` cierran que la
  cabecera sigue siendo legible.
- **Estado:** pendiente

### P-express-10 · La ENTRADA acepta pies y pulgadas (sitio 1 de 3, el que más pesa)

- **Archivos:** `apps/web/src/lib/cad/precision-input.ts`,
  `apps/web/src/lib/cad/engine/input-pipeline.ts`, `apps/web/src/lib/cad/engine/command-engine.ts`
- **Por qué:** cola 3. Es el agujero grande y está medido dos veces (bitácora C1 y otra vez el
  2026-09-04 dentro de `units-imperial.spec.ts`, que lo vuelve a medir en cada corrida):
  **quince de las dieciocho formas** que un dibujante teclea devuelven hoy `{ok:false}`, y las
  tres que pasan son las que no llevan ni marca ni fracción. `parseCoordinate` analiza con
  `Number(s)`. La gramática ya está construida y probada en `lib/cad/units-imperial.ts`
  (`parseImperialLength`, `parseCadLengthInDrawingUnits`, 788 comprobaciones); esta petición
  la enchufa.
- **Cambio exacto:** son tres capas y la primera vale por sí sola.

  **Capa A — `precision-input.ts`.** Dos cambios y un import.

  ```ts
  import {
    cadTextLooksImperial,
    parseCadLengthInDrawingUnits,
    type CadDrawingUnit,
  } from "./units-imperial";
  ```

  1. `ParseContext` gana dos campos:

     ```ts
     export interface ParseContext {
       last?: Point | null;
       lockedAngleDeg?: number | null;
       /**
        * Unidad del documento. `10'-6"` son 3200.4 en un dibujo en milímetros y
        * 126 en uno en pulgadas. Sin declararla se supone la pulgada, que es lo
        * que AutoCAD hace cuando el dibujo no dice su unidad.
        */
       drawingUnit?: CadDrawingUnit;
       /** Si un número DESNUDO se lee en pulgadas (`LUNITS` 3 o 4). */
       assumeInches?: boolean;
     }
     ```

  2. Los espacios se NORMALIZAN en vez de borrarse. Sustituir

     ```ts
       const input = raw.trim().replace(/\s+/g, "");
     ```

     por

     ```ts
       const input = normalizeCoordinateInput(raw);
     ```

     con esta función junto a `num`:

     ```ts
     /**
      * Borrar TODOS los espacios rompe las fracciones, y las rompe en silencio:
      * `1'-6 1/2"` queda `1'-61/2"`, que también se lee —`61/2` es una fracción
      * impropia legal— y da 42.5" en vez de 18.5". Un número equivocado que
      * nadie ve es peor que un rechazo. Se colapsan los espacios a uno y se
      * quitan sólo los que rodean a los separadores estructurales, que es lo
      * único que el borrado conseguía de útil (`1 , 2`, `30 < 45`, `@ 10,20`).
      */
     function normalizeCoordinateInput(raw: string): string {
       return raw.trim().replace(/\s+/gu, " ").replace(/\s*([,<@*])\s*/gu, "$1");
     }
     ```

  3. `num` deja de ser `Number` para las LONGITUDES —y sólo para ellas—:

     ```ts
     /** Una LONGITUD tecleada, en unidades de dibujo. Acepta pies y pulgadas. */
     function num(s: string, ctx: ParseContext = {}): number | null {
       const parsed = parseCadLengthInDrawingUnits(s, {
         // Sin unidad declarada, una unidad de dibujo es una pulgada: es la
         // suposición de AutoCAD y deja `6"` valiendo 6, no 152.4.
         drawingUnit: ctx.drawingUnit ?? "in",
         assumeInches: ctx.assumeInches,
       });
       return parsed.ok ? parsed.value : null;
     }

     /** Un ÁNGULO tecleado. En grados, y por tanto sin unidades de dibujo. */
     function angleNum(s: string): number | null {
       if (s.trim() === "") return null;
       const n = Number(s.trim());
       return Number.isFinite(n) ? n : null;
     }
     ```

     y en el cuerpo de `parseCoordinate`: en la rama polar, `const d = num(dStr, ctx);` y
     `const a = angleNum(aStr);` — **el ángulo no pasa por el analizador de longitudes**, que
     es el error fácil de esta petición: `30<45` son treinta unidades a cuarenta y cinco
     GRADOS, y convertir el 45 a unidades de dibujo giraría la línea. En la rama de la
     coordenada, `num(xStr, ctx)`, `num(yStr, ctx)`, `num(zStr, ctx)`. En la entrada directa,
     `num(body, ctx)`.

  4. `cadTextLooksImperial` no se usa en el cuerpo: se importa para el mensaje de error, que
     conviene que deje de ser mudo cuando el texto SÍ parecía una medida imperial. Si se
     prefiere no tocar los mensajes, quítese del import.

  **Capa B — `input-pipeline.ts`.** El guardián `NUMBER` (línea 115) rechaza `1'-6"` antes de
  llegar a nada, así que la entrada directa de distancia seguiría rota. Dos cambios:

  1. `CadTokenContext` gana los mismos dos campos que `ParseContext`
     (`drawingUnit?: CadDrawingUnit; assumeInches?: boolean`), documentados igual.
  2. En el paso 5 («Número suelto»), sustituir

     ```ts
       if (NUMBER.test(token)) {
         const value = Number(token);
     ```

     por

     ```ts
       // La distancia se lee con el analizador de longitudes, no con `Number`:
       // `3000` y `10'-6"` son las dos formas de teclear la misma distancia, y
       // la segunda es la única que un despacho americano usa.
       const typedLength = parseCadLengthInDrawingUnits(token, {
         drawingUnit: context.drawingUnit ?? "in",
         assumeInches: context.assumeInches,
       });
       if (typedLength.ok) {
         const value = typedLength.value;
     ```

     (el `NUMBER` deja de tener consumidores; bórrese la constante). El resto del bloque no
     cambia. Y en el paso 4, la llamada a `parseCoordinate` pasa el contexto:

     ```ts
       const parsed = parseCoordinate(body, {
         last: last ?? null,
         ...(context.drawingUnit ? { drawingUnit: context.drawingUnit } : {}),
         ...(context.assumeInches ? { assumeInches: true } : {}),
       });
     ```

  **Capa C — `command-engine.ts`.** Rellenar los dos campos desde las variables vivas, en el
  mismo `tokenContext` donde ya se calcula el SCU (línea 274):

  ```ts
    ...(context.variables
      ? {
          ucs: cadActiveUcs(context.variables),
          // La unidad del documento y el ajuste de UNITS llegan hasta el
          // teclado: `10'-6"` se guarda como 3200.4 en un dibujo en milímetros,
          // y con LUNITS arquitectónico un `6` desnudo son seis pulgadas.
          ...(cadDrawingUnitFromInsunits(Number(context.variables.get("INSUNITS") ?? 4))
            ? { drawingUnit: cadDrawingUnitFromInsunits(Number(context.variables.get("INSUNITS") ?? 4))! }
            : {}),
          ...([3, 4].includes(Number(context.variables.get("LUNITS") ?? 2)) ? { assumeInches: true } : {}),
        }
      : {}),
  ```

  con `import { cadDrawingUnitFromInsunits } from "../units-imperial";`.

- **El único cambio de comportamiento que esta petición trae, dicho antes de aplicarla:** hoy
  `parseCoordinate("1 2")` devuelve 12, porque borra el espacio y concatena los dígitos.
  Después devolverá un error. Es deliberado: `1 2` no es una medida y el 12 que salía era un
  accidente del borrado. `precision-input.spec.ts` no tiene ningún caso con espacio interior
  (comprobado el 2026-09-04), así que la suite no lo cubre ni a favor ni en contra.
- **Cómo se comprueba:** `npx tsx src/lib/cad/units-imperial.spec.ts` lleva la comprobación que
  cierra esto: vuelve a medir `parseCoordinate` renglón a renglón contra la columna «roto» de
  la tabla, así que **fallará en cuanto la petición se aplique** y hay que actualizar los
  quince `roto: true` en el mismo commit — está escrita así a propósito, para que el arreglo
  no pueda entrar sin que la evidencia lo diga. Además:
  `npx tsx src/lib/cad/precision-input.spec.ts`,
  `npx tsx src/lib/cad/engine/command-engine.spec.ts`,
  `npx tsx src/lib/cad/verification/units-imperial.spec.ts` y
  `npm run check:command-integrity`.
- **Estado:** pendiente

### P-express-11 · El sustrato de PDF entra en la escena de referencias a objeto

- **Archivo:** `apps/web/src/components/cad/editor/Layout3DEditor.tsx` (un import, un `ref` y
  ocho líneas dentro de `resolvePointer`, junto a la llamada a `cadSnapSceneAddEntities` de la
  línea ~6505)
- **Por qué:** cola 4, la mitad que faltaba para poder decir «con snap». La geometría enganchable
  del sustrato ya está construida y probada
  (`apps/web/src/lib/cad/pdf/pdf-snap-geometry.ts`, 86 comprobaciones con anclas absolutas), y
  devuelve exactamente `Segment[]` y `Point[]` en coordenadas del dibujo, que es lo que
  `snap-engine.ts` consume. Lo único que falta es volcarla en la escena que el editor arma en
  cada `pointermove`. Ese archivo está fuera del territorio del frente. Hasta que se aplique,
  el sustrato se ve pero **no imanta**, y por la regla 1 de cimientos «calcar con snap» **no
  cuenta como implementado**.
- **Cambio exacto:**

  1. Junto a los demás imports de `@/lib/cad/…`:

     ```ts
     import { cadPdfBytesFromDataUri } from "@/lib/cad/pdf/pdf-attach-payload";
     import { cadPdfUnderlayOf } from "@/lib/cad/pdf/pdf-underlay";
     import {
       cadPdfSnapGeometry,
       cadPdfSnapSceneAdd,
       type CadPdfSnapGeometryResult,
     } from "@/lib/cad/pdf/pdf-snap-geometry";
     ```

  2. Junto a los demás `useRef` del componente, la memoria de la extracción. **Es obligatoria,
     no una optimización:** leer el PDF entero cuesta milisegundos y esto corre en cada
     movimiento del ratón; sin memoria, arrastrar sobre un sustrato bloquearía el hilo.

     ```ts
     /**
      * La geometría enganchable de cada sustrato de PDF, ya extraída.
      *
      * La clave es la firma de la LÁMINA —colocación, vectores, tamaño, recorte
      * y estado—, no el id: así, mover el sustrato con PDFSCALE o recortarlo con
      * PDFCLIP invalida la entrada por sí solo, sin que nadie tenga que acordarse
      * de vaciarla desde el manejador de esas órdenes.
      */
     const pdfSnapGeometryRef = useRef(new Map<string, { firma: string; geometria: CadPdfSnapGeometryResult }>());
     ```

  3. Dentro de `resolvePointer`, **justo después** de la llamada a `cadSnapSceneAddEntities`
     (línea ~6505) y **antes** de `resolveOsnap`:

     ```ts
     // El sustrato de PDF: se calca encima, así que sus esquinas y sus puntos
     // medios tienen que imantar igual que los de una polilínea del documento.
     // Un sustrato descargado o recortado no aporta nada y lo declara él mismo.
     const documentoVivo = loadedCadDocumentRef.current;
     for (const entidad of documentoVivo?.entities ?? []) {
       if (entidad.type !== "image") continue;
       const ficha = cadPdfUnderlayOf(entidad);
       if (!ficha || ficha.status !== "loaded") continue;
       const bytes = cadPdfBytesFromDataUri(ficha.uri);
       if (!bytes) continue; // ruta que el anfitrión aún no resuelve; ver P-express-01
       const firma = JSON.stringify([
         entidad.insertion, entidad.uVector, entidad.vVector,
         entidad.size, entidad.clipBoundary ?? null, entidad.showImage !== false, ficha.page,
       ]);
       const guardado = pdfSnapGeometryRef.current.get(entidad.id);
       const geometria =
         guardado?.firma === firma
           ? guardado.geometria
           : cadPdfSnapGeometry(documentoVivo!, entidad.id, bytes);
       if (guardado?.firma !== firma)
         pdfSnapGeometryRef.current.set(entidad.id, { firma, geometria });
       // La ventana por cursor no es adorno: `resolveOsnap` cruza los tramos
       // entre sí buscando intersecciones, que es O(n²), y una lámina de
       // arquitectura tiene miles.
       cadPdfSnapSceneAdd(scene, geometria, { cursor: { x: wx, y: wy }, radius: tol * 8 });
     }
     ```

     `loadedCadDocumentRef` es el ref del documento canónico vivo que el componente ya mantiene
     (declarado en la línea ~1891); es el mismo que alimenta a `syncCadLayerState` y al índice de
     designación, y por eso la geometría del sustrato se recalcula sola cuando `PDFCLIP` o
     `PDFSCALE` cambian la lámina.

  4. Al desadjuntar (`PDFDETACH`) la entrada de la memoria queda huérfana. Una línea en el mismo
     bucle la retira sin manejador nuevo: antes del `for`, si el mapa tiene más entradas que
     entidades `image` del documento, `pdfSnapGeometryRef.current.clear()`. Es un mapa de
     unidades, no de miles: vaciarlo entero cuesta menos que llevar la cuenta.

- **Lo que esta petición NO incluye, y por qué:** el sustrato cuya ruta no es un `data:`
  —`tenant-asset://`, el día que haya almacén— se salta con `continue` en vez de leerse. No es
  un olvido: resolver una ruta remota es una petición de anfitrión, la misma de `P-express-01`,
  y hacerlo dentro de `resolvePointer` metería una lectura asíncrona en el camino del ratón.
  Cuando ese canal exista, la memoria se llena desde él al adjuntar y este bucle sólo lee.
- **Cómo se comprueba:** `npx tsx src/lib/cad/pdf/pdf-snap-geometry.spec.ts` ya demuestra la
  aritmética de punta a punta —incluido el enganche real con `snap()` del motor sobre una
  escena construida con `cadPdfSnapSceneAdd`—; lo que la petición añade es el cableado, y se
  ve con `npm run typecheck` y con la E2E de calcado si se escribe. `npm test` cierra el resto.
- **Estado:** pendiente
