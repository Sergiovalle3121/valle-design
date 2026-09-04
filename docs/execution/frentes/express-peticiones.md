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
