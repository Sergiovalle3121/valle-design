# Peticiones de F8 · Toolsets Map 3D y Raster Design

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-map-raster-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Peticiones

### P-map-raster-01 · Registrar VECTORIZE en el registro de comandos

- **Archivo:** `apps/web/src/lib/cad/engine/index.ts`
- **Por qué:** la entrega de vectorización (`toolset-raster.vectorizacion`, criterio ABIERTO de
  2 pt) construye el comando `VECTORIZE` en
  `apps/web/src/lib/cad/engine/commands/vectorize-raster.ts`, que SÍ está en mi territorio; el
  registro no lo está. Hasta que se aplique esta petición el comando existe, está probado
  (`vectorize-raster.spec.ts`, 68 comprobaciones, que lo conduce por su descriptor exportado) y
  **no se puede teclear**. Fix-or-hide: nada en la interfaz lo anuncia todavía.
- **Cambio exacto:** dos líneas.
  1. Junto a los demás imports de comandos (a la altura de la línea 55, donde ya están
     `CAD_GEO_LOCATION_COMMANDS`, `CAD_MAP_IMPORT_COMMANDS` y `CAD_RASTER_IMAGE_COMMANDS`):

     ```ts
     import { CAD_VECTORIZE_RASTER_COMMANDS } from "./commands/vectorize-raster";
     ```

  2. En la lista de descriptores, inmediatamente DESPUÉS de `...CAD_RASTER_IMAGE_COMMANDS,`:

     ```ts
     // Ola I (Raster): del escaneo a polilíneas. Lee la IMAGE que IMAGEATTACH
     // ya metió dentro del dibujo; no abre archivos ni sale a la red.
     ...CAD_VECTORIZE_RASTER_COMMANDS,
     ```

- **Cómo se comprueba:** `npx tsx src/lib/cad/engine/commands/vectorize-raster.spec.ts` sigue en
  verde, y `CAD_COMMAND_REGISTRY_V2.get("VECTORIZE")` deja de ser `undefined`.
  `npm run check:command-integrity` tiene que seguir verde: ver P-map-raster-05.
- **Estado:** pendiente

### P-map-raster-02 · Los alias de VECTORIZE en la tabla de entrada

- **Archivo:** `apps/web/src/lib/cad/engine/alias-table.ts`
- **Por qué:** el pipeline de entrada resuelve por ESTA tabla y no por el descriptor (medido en
  la Ola E con `DX`, y anotado en el propio archivo): sin estas líneas, `VECTORIZAR` y `VEC`
  tecleados no llegan aunque el descriptor los declare.
- **Cambio exacto:** después del bloque «Raster (Ola H)», donde están `IAT`, `ICL` y `IAD`:

  ```ts
  // Raster (Ola I): la vectorización del escaneo. `VEC` es la abreviatura y
  // `VECTORIZAR` la memoria muscular en español.
  VEC: "VECTORIZE",
  VECTORIZAR: "VECTORIZE",
  ```

- **Cómo se comprueba:** `resolveCadCommandAlias("vec", known)` y
  `resolveCadCommandAlias("vectorizar", known)` devuelven `"VECTORIZE"` una vez registrado
  (P-map-raster-01). La comprobación entra en `vectorize-raster.spec.ts` en la ventana de
  integración; hoy no está porque afirmaría algo que todavía no es cierto.
- **Estado:** pendiente

### P-map-raster-03 · El resumen de VECTORIZE

- **Archivo:** `apps/web/src/lib/cad/engine/command-summaries.ts`
- **Por qué:** `command-summaries.spec.ts` exige un resumen por comando registrado; sin él, la
  P-map-raster-01 deja el gate en rojo.
- **Cambio exacto:** junto a `IMAGEADJUST`, en el mismo bloque de raster:

  ```ts
  VECTORIZE: "Convierte una imagen escaneada en geometría del dibujo: polilíneas por umbral, limpieza y ajuste, y los rótulos trazados con una fuente de trazos como TEXT.",
  ```

  **Actualizado el 2026-09-04 (2º entregable):** el resumen anterior decía sólo «polilíneas»;
  desde que VECTORIZE reconoce el texto por plantilla contra las fuentes Hershey, quedarse en
  polilíneas sería un resumen que miente por omisión. Si el coordinador ya aplicó la versión
  anterior, basta con sustituir esa línea.

- **Cómo se comprueba:** `npx tsx src/lib/cad/engine/command-summaries.spec.ts`.
- **Estado:** pendiente

### P-map-raster-04 · VECTORIZE en la cinta

- **Archivo:** `apps/web/src/lib/cad/ribbon.ts`
- **Por qué:** `scripts/cad/check-ribbon-coverage.mjs` exige que todo comando registrado tenga
  pestaña y grupo. VECTORIZE es una orden de raster y va donde ya están IMAGEATTACH, IMAGECLIP e
  IMAGEADJUST.
- **Cambio exacto:** dos expresiones regulares, añadiendo `|VECTORIZE` justo detrás de
  `IMAGEADJUST` en cada una.
  1. Pestaña (≈ línea 100), la lista que termina en `"insertar"`:
     `…|IMAGE|IMAGEATTACH|IMAGECLIP|IMAGEADJUST|VECTORIZE|IMPORT|DATAEXTRACTION|…`
  2. Grupo (≈ línea 171), la lista que termina en `"Referencias"`:
     `…|IMAGE|IMAGEATTACH|IMAGECLIP|IMAGEADJUST|VECTORIZE|PDFATTACH|…`
- **Cómo se comprueba:** `node scripts/cad/check-ribbon-coverage.mjs` y
  `node scripts/cad/ui-command-reach.mjs`.
- **Estado:** pendiente

### P-map-raster-05 · Declarar VECTORIZE como no-concluyente en la sonda de integridad, si lo es

- **Archivo:** `scripts/cad/command-integrity-exemptions.json`
- **Por qué:** VECTORIZE arranca pidiendo que se DESIGNE una entidad `image` cuya definición
  traiga un `data:image/png` decodificable. El auto-respondedor de
  `apps/web/scripts/command-integrity-probe.mts` no fabrica esa situación, así que es probable
  que el comando salga `no-concluyente` — que el gate tolera SÓLO si está declarado.
  **No se aplica a ciegas:** primero se corre el gate; si sale verde, esta petición se cierra
  como innecesaria y no se toca el archivo.
- **Cambio exacto:** si y sólo si `npm run check:command-integrity` marca VECTORIZE como
  no-concluyente, añadir a `noConcluyentes`:

  ```json
  "VECTORIZE": "Necesita una entidad image cuya definición traiga un data:image/png legible; la sonda no fabrica esa situación. Cubierto por vectorize-raster.spec.ts, que lo conduce hasta escribir 2 polilíneas y, con un rótulo trazado, hasta escribir un TEXT."
  ```

- **Cómo se comprueba:** `npm run check:command-integrity`.
- **Estado:** pendiente

### P-map-raster-06 · La fila de vectorización de la rúbrica, cuando haya evidencia

- **Archivo:** `docs/competitive/rubric.json`
- **Por qué:** `toolset-raster.vectorizacion` está hoy en ⬜ con la evidencia «No hay
  vectorización». Con esta entrega deja de ser cierto: hay decodificador
  (`raster-decode.ts`), tubería (`raster-vectorize.ts`) y comando
  (`vectorize-raster.ts`), los tres con spec propia. **La rúbrica no la toca el frente** (R2),
  y el criterio además está ABIERTO: lo otorga quien lo evalúa, no quien lo construye. Se deja
  aquí la evidencia medida para que el coordinador decida.
- **Cambio exacto:** ninguno que proponga el frente. La evidencia disponible, verificable con
  tres órdenes, es:
  - `npx tsx src/lib/cad/raster-decode.spec.ts` → 61 comprobaciones: el mismo píxel por PNG
    gris/RGB/paleta/RGBA y BMP 24; los cinco filtros; 1 y 4 bits; cortado, CRC tocado, Adam7,
    RLE y 36 Mpx fallan CERRADO; JPEG, GIF, WebP y TIFF rechazados con su motivo.
  - `npx tsx src/lib/cad/raster-vectorize.spec.ts` → 43 comprobaciones: umbral de Otsu en 50;
    5 motas fuera con su recuento; rectángulo cerrado de 4 vértices y diagonal de 2; los 6
    vértices caen EXACTOS en coordenadas del dibujo a 1 px = 100 mm girado 90°; sólo polvo →
    0 entidades.
  - `npx tsx src/lib/cad/engine/commands/vectorize-raster.spec.ts` → 98 comprobaciones: el PNG
    entra por IMAGEATTACH y vuelve como 2 polilíneas a menos de una micra del original, y el
    rótulo trazado vuelve como UNA entidad TEXT en su sitio.
  - **Añadido el 2026-09-04 (2º entregable, texto):**
    `npx tsx src/lib/cad/raster-text-recognize.spec.ts` → 94 comprobaciones. El criterio de la
    fila dice «líneas y **textos**», así que sin esto la fila no estaba entera. «PREDIO 4-A ·
    1 240.50 m2» trazado con `cadHersheyTextStrokes` a 24 px y rasterizado vuelve carácter a
    carácter, con la altura EXACTA (se pedía < 5 %) y la inserción en el píxel exacto (se pedía
    < 1 px); lo mismo con el trazo engrosado y un 2 % de ruido; un garabato a mano queda a
    0,065 de su mejor plantilla —corte 0,04—, sale como geometría y el aviso lo cuenta, sin
    inventar una letra parecida. De punta a punta: TEXT de altura 240 mm en (245, 235) y sus 36
    trazos NO duplicados.
  - Lo que TODAVÍA NO hace, declarado en el propio aviso del comando: arcos, círculos y
    sombreados. Y del texto: manuscrito, tipografías de contorno relleno, letras que se tocan,
    más de 3° de inclinación y MTEXT.
- **Estado:** pendiente

### P-map-raster-07 · Registrar COGO y CUADROCONSTRUCCION en el registro de comandos

- **Archivo:** `apps/web/src/lib/cad/engine/index.ts`
- **Por qué:** el 3er entregable de la Ola I construye las dos órdenes de topografía en
  `apps/web/src/lib/cad/engine/commands/geo-cogo.ts`, que SÍ está en mi territorio; el registro
  no lo está. Hasta que se aplique, las órdenes existen, están probadas
  (`engine/commands/geo-cogo.spec.ts`, 86 comprobaciones, que las conduce por el array
  exportado) y **no se pueden teclear**. Fix-or-hide: nada en la interfaz las anuncia todavía.
- **Cambio exacto:** dos líneas.
  1. Junto a los demás imports de comandos (línea 53-55, donde ya están
     `CAD_GEO_LOCATION_COMMANDS`, `CAD_MAP_IMPORT_COMMANDS` y `CAD_RASTER_IMAGE_COMMANDS`):

     ```ts
     import { CAD_GEO_COGO_COMMANDS } from "./commands/geo-cogo";
     ```

  2. En la lista de descriptores, inmediatamente DESPUÉS de `...CAD_GEO_LOCATION_COMMANDS,`
     (línea 236):

     ```ts
     // Ola I (Map 3D): la aritmética del levantamiento. COGO levanta la
     // poligonal desde rumbos y distancias y declara su cierre;
     // CUADROCONSTRUCCION emite la TABLE que pide el Registro Público.
     ...CAD_GEO_COGO_COMMANDS,
     ```

- **Cómo se comprueba:** `npx tsx src/lib/cad/engine/commands/geo-cogo.spec.ts` sigue en verde y
  `CAD_COMMAND_REGISTRY_V2.get("COGO")` deja de ser `undefined`. Arrastra P-08, P-09 y P-10:
  aplicar sólo ésta deja `command-summaries.spec.ts` y `check:ribbon-coverage` en rojo.
- **Estado:** pendiente

### P-map-raster-08 · Los alias de COGO y CUADROCONSTRUCCION en la tabla de entrada

- **Archivo:** `apps/web/src/lib/cad/engine/alias-table.ts`
- **Por qué:** el pipeline de entrada resuelve por ESTA tabla y no por el descriptor (medido en
  la Ola E con `DX`, y anotado en el propio archivo): sin estas líneas, `POLIGONAL` o `CUADRO`
  tecleados no llegan aunque el descriptor los declare.
- **Cambio exacto:** después del bloque «Map 3D (Ola G)», donde están `GEO` y `GEORREFERENCIAR`:

  ```ts
  // Map 3D (Ola I): la topografía. `CUADRO` es como se pide la lámina en un
  // despacho mexicano, y `RUMBOS` es la memoria muscular de quien teclea la
  // libreta de campo.
  POLIGONAL: "COGO",
  RUMBOS: "COGO",
  MAPCOGO: "COGO",
  CUADRO: "CUADROCONSTRUCCION",
  CUADRODECONSTRUCCION: "CUADROCONSTRUCCION",
  COGOTABLE: "CUADROCONSTRUCCION",
  MAPCOGOTABLE: "CUADROCONSTRUCCION",
  ```

- **Cómo se comprueba:** `resolveCadCommandAlias("poligonal", known)` devuelve `"COGO"` y
  `resolveCadCommandAlias("cuadro", known)` devuelve `"CUADROCONSTRUCCION"` una vez registrados
  (P-07). La comprobación entra en `engine/commands/geo-cogo.spec.ts` en la ventana de
  integración; hoy no está porque afirmaría algo que todavía no es cierto.
- **Estado:** pendiente

### P-map-raster-09 · Los resúmenes de COGO y CUADROCONSTRUCCION

- **Archivo:** `apps/web/src/lib/cad/engine/command-summaries.ts`
- **Por qué:** `command-summaries.spec.ts` exige un resumen por comando registrado; sin él, la
  P-07 deja el gate en rojo.
- **Cambio exacto:** junto a `GEOGRAPHICLOCATION` y `MAPIMPORT` (línea 188-189), en el mismo
  bloque de Map 3D:

  ```ts
  COGO: "Levanta una poligonal desde rumbos y distancias tecleados o pegados, y declara su error de cierre, su precisión 1:N y su superficie por Gauss.",
  CUADROCONSTRUCCION: "Emite el cuadro de construcción de una polilínea cerrada como TABLE: EST, PV, RUMBO, DISTANCIA, V, X, Y y la superficie; con el dibujo georreferenciado, X e Y son el este y el norte UTM.",
  ```

- **Cómo se comprueba:** `npx tsx src/lib/cad/engine/command-summaries.spec.ts`.
- **Estado:** pendiente

### P-map-raster-10 · COGO y CUADROCONSTRUCCION en la cinta

- **Archivo:** `apps/web/src/lib/cad/ribbon.ts`
- **Por qué:** `scripts/cad/check-ribbon-coverage.mjs` exige que todo comando registrado tenga
  pestaña y grupo, y `ui-command-reach.mjs` que se alcance con el ratón. Las dos órdenes son de
  Map 3D y van donde ya están GEOGRAPHICLOCATION y MAPIMPORT: pestaña «Insertar», grupo
  «Ubicación», que es el panel equivalente de AutoCAD.
- **Cambio exacto:** dos expresiones regulares.
  1. Pestaña (≈ línea 100), la lista que termina en `"insertar"`: añadir
     `|COGO|CUADROCONSTRUCCION` justo detrás de `MAPIMPORT`.
  2. Grupo (≈ línea 173), la lista que hoy dice
     `[/^(GEOGRAPHICLOCATION|MAPIMPORT)$/, "Ubicación"]`, pasa a decir
     `[/^(GEOGRAPHICLOCATION|MAPIMPORT|COGO|CUADROCONSTRUCCION)$/, "Ubicación"]`.
- **Cómo se comprueba:** `node scripts/cad/check-ribbon-coverage.mjs` y
  `node scripts/cad/ui-command-reach.mjs`.
- **Estado:** pendiente

### P-map-raster-11 · Declarar COGO y CUADROCONSTRUCCION en la sonda de integridad, si toca

- **Archivo:** `scripts/cad/command-integrity-exemptions.json`
- **Por qué:** COGO pide un punto y luego TEXTO con un rumbo y una distancia
  («N 45°30'20" E 25.40»); CUADROCONSTRUCCION pide que se DESIGNE una polilínea cerrada de tres
  o más vértices. El auto-respondedor de `apps/web/scripts/command-integrity-probe.mts` puede no
  fabricar ninguna de las dos situaciones, y entonces salen `no-concluyente` — que el gate
  tolera SÓLO si está declarado. **No se aplica a ciegas:** primero se corre el gate; si sale
  verde, esta petición se cierra como innecesaria y no se toca el archivo.
- **Cambio exacto:** si y sólo si `npm run check:command-integrity` las marca no-concluyentes,
  añadir a `noConcluyentes`:

  ```json
  "COGO": "Necesita texto con un rumbo y una distancia («N 45°30'20\" E 25.40»); la sonda no lo fabrica. Cubierto por engine/commands/geo-cogo.spec.ts, que lo conduce hasta escribir la polilínea de 6 vértices y su versión compensada.",
  "CUADROCONSTRUCCION": "Necesita una polilínea CERRADA de tres o más vértices designada; la sonda no la fabrica. Cubierto por engine/commands/geo-cogo.spec.ts, que lo conduce hasta emitir la TABLE de 8 filas y 45 celdas."
  ```

- **Cómo se comprueba:** `npm run check:command-integrity`.
- **Estado:** pendiente

### P-map-raster-12 · La evidencia de COGO para la fila de Map 3D de la rúbrica

- **Archivo:** `docs/competitive/rubric.json`
- **Por qué:** la cola de este frente pedía «COGO (rumbos y distancias, cuadro de
  construcción)» dentro de Map 3D. La fila `toolset-map3d` ya está en 4/4 desde la Ola G, así
  que **el frente no propone ningún cambio** (R2: la rúbrica no la toca el frente). Se deja
  aquí la evidencia medida por si el evaluador quiere reforzar la fila o abrir un criterio
  nuevo de topografía.
- **Cambio exacto:** ninguno que proponga el frente. La evidencia, con las dos órdenes que la
  producen:
  - `npx tsx src/lib/cad/geo-cogo.spec.ts` → 200 comprobaciones. Rumbo ↔ azimut ↔ radianes en
    los cuatro cuadrantes y en los cuatro límites (0°, 90°, 180°, 270°); los DMS van y vuelven
    campo a campo y el redondeo acarrea en vez de escribir `60"`; siete escrituras de rumbo mal
    formado se rechazan CON MOTIVO y ninguna degrada a 0. La poligonal de cinco lados del cuadro
    —rumbos a segundo entero, distancias al milímetro— cierra a **0.401 mm** con precisión
    **1:348 787** y su superficie, **1 231.53 m²**, coincide con la de Gauss calculada en la
    propia spec sobre los vértices. 20" mal leídos en una estación salen como 20" de cierre
    angular y abren el cierre lineal a 5.66 mm. La regla del compás cierra exacto moviendo como
    mucho 0.335 mm.
  - `npx tsx src/lib/cad/engine/commands/geo-cogo.spec.ts` → 86 comprobaciones. El cuadro se
    PEGA en COGO y sale una polilínea de 6 vértices en milímetros del dibujo, abierta y con el
    cierre declarado; `Compensar` da la cerrada de 5. CUADROCONSTRUCCION emite una TABLE de 8
    filas × 7 columnas y 45 celdas con `EST · PV · RUMBO · DISTANCIA · V · X · Y` y el renglón
    de superficie; **con el marcador GEO de la zona 14N puesto en el origen, la X del vértice 1
    es `660,000.000` y la del vértice 2 `660,042.150`** — el este UTM de verdad, vía
    `cadGeoreferenceWorld`.
  - Lo que TODAVÍA NO hace, declarado en los dos avisos: no aplica el factor de escala de la
    proyección ni la reducción al nivel del mar (distancia de cuadrícula ≠ distancia en el
    terreno), no compensa por mínimos cuadrados y no publica lados en ARCO con su radio y su
    desarrollo — una polilínea con `bulge` se rechaza diciéndolo.
- **Estado:** pendiente
