# F8 · Toolsets Map 3D y Raster Design

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/geo*`
- `apps/web/src/lib/cad/map*`
- `apps/web/src/lib/cad/raster*`
- `apps/web/src/lib/cad/image*`
- `apps/web/src/lib/cad/engine/commands/geo*|map*|image*|vector*`
- `specs y goldens`

## Cola

1. Map: más sistemas de coordenadas (todo México y los EPSG comunes de LATAM); COGO (rumbos y distancias, cuadro de construcción); topología y consultas espaciales; edición de atributos GIS en tabla; exportar shapefile y GeoJSON (hoy sólo se importa).

2. Raster: **vectorización de líneas y textos de un escaneo** — es un criterio ABIERTO de la rúbrica que vale 2 pt, es tu entrega de mayor valor; IMAGEFRAME y transparencia; corrección de deformación y limpieza (deskew, despeckle).

## Cierre

Filas Map y Raster a 4/4 salvo evidencia independiente; el criterio de vectorización otorgado por la rúbrica.

## Lo que hay que tener presente

Fondos de mapa en línea sólo con permiso de uso escrito; si no lo hay, no se pone.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/map-raster-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-map-raster` sobre la rama `campana/superar/map-raster`. Commits sí;
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
cd /home/user/vd-map-raster
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### 2026-09-04 · VECTORIZE, primera mitad: del escaneo a polilíneas

Lo que existe ahora y antes no:

- `apps/web/src/lib/cad/raster-decode.ts` — decodificador de imagen PURO en el motor, sin
  navegador y sin red. PNG (profundidades 1, 2, 4, 8 y 16; los cinco tipos de color; los cinco
  filtros; `PLTE` y `tRNS`) y BMP sin comprimir (1, 4, 8, 24 y 32 bits, de abajo arriba y de
  arriba abajo, cabecera CORE de 12 e INFO de 40+). El IDAT lo infla `cadPdfInflate`, que ya
  existía con spec propia desde el importador de PDF: la pieza cara no se reescribió.
  JPEG, GIF, WebP y TIFF se RECHAZAN diciendo el límite y la salida; el PNG entrelazado y el BMP
  con RLE también. Un archivo cortado o con un CRC tocado falla CERRADO.
- `apps/web/src/lib/cad/raster-vectorize.ts` — la tubería: umbral de Otsu, despeckle por
  componentes conexas con su recuento, adelgazamiento de Zhang-Suen, recorrido del esqueleto por
  nodos y extremos (con el descarte de enlaces diagonales redundantes, sin el cual las esquinas
  de un rectángulo parecen nodos y el contorno sale en cuatro trozos) y ajuste con
  Douglas-Peucker más fusión de tramos colineales. Sale una polilínea canónica por trazo, en
  píxeles con la Y hacia arriba: el sistema que come `cadImagePixelToWorld`.
- `apps/web/src/lib/cad/engine/commands/vectorize-raster.ts` — el comando VECTORIZE: designa una
  IMAGE ya adjunta, enseña el plan con el manifiesto (umbral, manchas descartadas y sus píxeles,
  tolerancia, trazos) y sólo escribe al confirmar, igual que MAPIMPORT. Tolerancia, Mancha y
  Umbral rehacen el plan sin tocar el dibujo.
- `apps/web/src/lib/cad/image-fixtures.ts` — se le añadieron `cadPngTypedFixture` (los cinco
  tipos de color y las profundidades por debajo de 8) y `cadBmpFixture`. Un decodificador sin
  archivos de los cuatro tipos no está probado: está escrito.

Evidencia, con las tres órdenes que la producen:

```
cd /home/user/vd-map-raster/apps/web
npx tsx src/lib/cad/raster-decode.spec.ts                       # 61 comprobaciones
npx tsx src/lib/cad/raster-vectorize.spec.ts                    # 43 comprobaciones
npx tsx src/lib/cad/engine/commands/vectorize-raster.spec.ts    # 68 comprobaciones
```

El número que cierra la entrega: un PNG de 40 × 30 con un rectángulo de (5, 5) a (34, 24) y una
diagonal de (10, 10) a (22, 22), adjuntado con IMAGEATTACH en (1000, 500) a 1 px = 100 mm y
girado 90°, vuelve como dos polilíneas cuyos seis vértices caen a menos de **una micra** —el
criterio pedía menos de 1 px, que son 100 mm— del vértice de origen en coordenadas del dibujo.
El polvo sembrado a propósito (cinco motas) no produce ni una entidad y el manifiesto dice que
quitó cinco manchas de cinco píxeles.

Decisiones que conviene no volver a discutir:

- **Se decodifica en el motor, no en el anfitrión.** El navegador ya decodifica la imagen una
  vez para saber su tamaño; volver a pedírselo para vectorizar habría atado la entrega a un
  `canvas` y la habría hecho improbable fuera del navegador. El motor es puro y se prueba con
  `tsx`, sin abrir nada.
- **La colocación no se repite.** La vectorización no sabe nada de la escala ni del giro: saca
  píxeles y los pasa por `cadImagePixelToWorld`, donde la escala y la rotación ya viven dentro
  de `uVector`/`vVector`. Por eso el giro de 90° no desplaza un solo vértice.
- **Se rechaza en vez de adivinar.** Un JPEG no se lee «como se pueda»: se dice que el motor no
  lleva descodificador JPEG y que hay que volver a guardar en PNG o BMP.

Registrar el comando cae FUERA del territorio (`engine/index.ts`, `alias-table.ts`,
`command-summaries.ts`, `ribbon.ts`): las seis peticiones están escritas con su diseño completo
en `map-raster-peticiones.md`. Hasta que el coordinador las aplique, VECTORIZE existe, está
probado por su descriptor exportado y **no se puede teclear** — que es lo que manda fix-or-hide.

El árbol compila (`npm run typecheck`, 8 de 8) y los vecinos siguen verdes
(`image-geometry.spec.ts` 44, `raster-image.spec.ts` 75, `paper-space-image.spec.ts` 29,
`pdf/pdf-inflate.spec.ts` 73).

## «Todavía no»

### 2026-09-04 · Lo que VECTORIZE no reconoce

Declarado en el propio plan del comando y en el aviso que queda registrado, no sólo aquí:

- **Arcos y círculos.** Todo trazo sale como polilínea de tramos rectos. Reconocerlos es ajustar
  primitivas a la cadena por mínimos cuadrados; no es de esta entrega.
- **Sombreados y zonas macizas.** Salen como su contorno, no como HATCH.
- **Texto.** Las letras salen como trazos. El reconocimiento por plantilla contra los glifos
  Hershey de `lib/cad/fonts/` es viable —se traza con el mismo juego de trazos— y es la segunda
  mitad del criterio.

### 2026-09-04 · Lo que el decodificador no lee

- **JPEG, GIF, WebP y TIFF.** Cada uno se rechaza con su motivo y con la salida (volver a
  guardar en PNG o BMP). IMAGEATTACH sigue aceptándolos para VER la imagen: es el navegador quien
  los pinta. Lo que no se puede es vectorizarlos.
- **PNG entrelazado (Adam7)** y **BMP comprimido** (RLE, BITFIELDS).
- **Más de 24 Mpx.** El tope está declarado en `CAD_RASTER_MAX_PIXELS` y se dice antes de
  reservar memoria.
- **Zhang-Suen come dos píxeles en cada punta** de un trazo romo (una barra de 24 × 3 px da una
  línea media de 20 px). Es la cifra real, medida en el spec, no una holgura: corregir el
  extremo pide una reconstrucción del final del trazo que no está hecha.
