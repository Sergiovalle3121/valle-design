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
  VECTORIZE: "Convierte los trazos de una imagen escaneada en polilíneas del dibujo: umbral, limpieza de manchas y ajuste.",
  ```

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
  "VECTORIZE": "Necesita una entidad image cuya definición traiga un data:image/png legible; la sonda no fabrica esa situación. Cubierto por vectorize-raster.spec.ts, que lo conduce hasta escribir 2 polilíneas."
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
  - `npx tsx src/lib/cad/engine/commands/vectorize-raster.spec.ts` → 68 comprobaciones: el PNG
    entra por IMAGEATTACH y vuelve como 2 polilíneas a menos de una micra del original.
  - Lo que TODAVÍA NO hace, declarado en el propio aviso del comando: arcos, círculos,
    sombreados y texto.
- **Estado:** pendiente
