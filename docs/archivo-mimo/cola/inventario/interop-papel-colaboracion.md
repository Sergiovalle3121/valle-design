# Inventario: Interoperabilidad, Espacio Papel y Colaboracion

> Fecha: 2026-09-04
> Alcance: `apps/web/src/lib/cad/`
> Metodologia: busqueda glob de 18 patrones + lectura de cada archivo fuente (no spec).

---

## 1. GIS, Raster e Interoperabilidad

### 1.1 DXF — Importacion

**Que existe:** Importador completo sobre la libreria `dxf-parser`, con lectura
manual de HATCH, MTEXT, DIMENSION, MLEADER y los 8 tipos del esquema 4
(XLINE, RAY, WIPEOUT, IMAGE, POINT, ATTDEF, SOLID, TABLE) sobre pares
codigo/valor crudos.

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `dxf-import.ts` | 1069 | `importDxfPrimitives`: punto de entrada unico |
| `dxf-read-core.ts` | 175 | Tokenizador raw, normalizacion de booleanos de cabecera |
| `dxf-read-annotations.ts` | — | MTEXT, DIMENSION y MLEADER raw |
| `dxf-read-hatch.ts` | — | HATCH raw |
| `dxf-read-properties.ts` | — | Tabla LAYER, LTYPE, DIMSTYLE, \ |
| `dxf-read-schema4.ts` | — | 8 tipos del esquema 4 |
| `dxf-read-foreign-dimensions.ts` | — | Cotas de otros CAD (familia codigo 70) |
| `dxf-import-cota.ts` | — | Extrusion y elevacion Z |
| `dxf-import-declaraciones.ts` | — | Bloques huerfanos, capas declaradas sin uso |
| `dxf-import-report.ts` | — | Informe legible para el usuario |
| `dxf-insert-transform.ts` | — | Expansion de INSERT con transformacion |
| `dxf-block-xdata.ts` | — | XDATA de bloques (metadatos Valle) |
| `dxf-layer-map.ts` | — | Mapeo de capas ACI a hex |
| `dxf-entity-primitives.ts` | — | Entidad canonica a primitiva DXF |
| `dxf-cad-document.ts` | — | Documento canonica a primitivas DXF |
| `dxf-model-space-scope.ts` | — | Filtrado a espacio modelo |
| `dxf-nurbs-knots.ts` | — | Vector de nudos NURBS |

**Entidades leidas:** LINE, POLYLINE, LWPOLYLINE, CIRCLE, ARC, ELLIPSE,
SPLINE (escenario 1), TEXT, MTEXT, INSERT, DIMENSION (6/7 variantes),
HATCH (contorno poligonal), IMAGE, WIPEOUT, XLINE, RAY, POINT, SOLID,
ATTDEF, TABLE (degradada a geometria), MLEADER.

**Estado real:**
- `dxf-import.ts:290` — `MAX_DXF_ENTITIES = 50000` (tope duro).
- `dxf-import.ts:608` — `MAX_INSERT_DEPTH = 4`.
- `dxf-import.ts:300-308` — Tipos que se leen fuera del tokenizador y no cuentan como ausencias.
- `dxf-import.ts:325-349` — `rawEntityTypeCounts`: cuenta lo que el tokenizador tiro SIN aviso (3DSOLID, MESH, REGION, LEADER).
- `dxf-read-core.ts:90-106` — `normalizeDxfHeaderBooleans`: `\ 2` ya no tumba el archivo.
- `dxf-read-core.ts:57-70` — `dxfPairsInEntitiesSection`: impide que MTEXT dentro de BLOCK salga como entidad suelta.

### 1.2 DXF — Exportacion

**Que existe:** Escritor DXF R2000 (AC1015) completo con primitivas, sombreados,
textos (TEXT + MTEXT), cotas (heredadas + semánticas), directrices (MLEADER),
bloques + INSERT con atributos, IMAGE, WIPEOUT, SOLID, XLINE, POINT, ATTDEF,
TABLE degradada, y manifiesto de perdidas calculado ANTES de escribir.

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `dxf-export.ts` | 960 | `exportCadDxf`: escritor generico |
| `dxf-document-export.ts` | 250 | `exportCadDocumentDxf`: documento canónico a DXF |
| `dxf-export-loss-manifest.ts` | 418 | `cadDocumentDxfExportLosses`: manifiesto previo |
| `dxf-export-readiness.ts` | 220 | Evaluacion de factibilidad (UI) |
| `dxf-export-hatch.ts` | — | HATCH DXF |
| `dxf-write-core.ts` | 86 | Primitivas de escritura (pares, formato) |
| `dxf-write-tables.ts` | — | Tabla LAYER (nombre, color ACI, LTYPE, grosor, frozen) |
| `dxf-write-schema4.ts` | — | 8 tipos del esquema 4 |
| `dxf-write-dimensions.ts` | — | Cotas y bloques anónimos *D |
| `dxf-text-entities.ts` | — | TEXT/MTEXT desde documento canónico |
| `layout-export-adapter.ts` | 222 | Adaptador de cajas del editor a DXF |
| `dwg-export-flag.ts` | 106 | Bandera M5: exportacion DWG (OFF, oraculo pendiente) |

**Estado real:**
- `dxf-export.ts:279` — Version declarada: `AC1015`.
- `dxf-document-export.ts:56-61` — Entidades de espacio papel se EXCLUYEN y se declaran.
- `dxf-export-loss-manifest.ts:97-251` — Reglas de fidelidad por tipo (TABLE degrada, POINT es global, IMAGE solo ruta, WALL como contorno, OPENING sin bloque propio).
- `dxf-export-readiness.ts:86-219` — Evaluacion de factibilidad con blockers, warnings y contadores.

### 1.3 DWG — Solo importacion (beta)

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `dwg-native-reader.ts` | 543 | Unico punto de entrada del codec DWG en runtime |
| `dwg-neutral-model.ts` | — | Modelo neutral (laboratorio -> producto) |
| `dwg-document-bridge.ts` | — | Puente neutral -> documento canónico |
| `dwg-document-bridge-layers.ts` | — | Capas DWG |
| `dwg-document-bridge-primitives.ts` | — | Primitivas DWG |
| `dwg-import-limits.ts` | — | Limites declarados |
| `dwg-interop-flag.ts` | — | Flags de habilitacion (AC1018, 3D wireframe, modern) |
| `dwg-export-flag.ts` | 106 | Exportacion: flag OFF, `externalOracleVerified: false` |

**Perfil V3 (AC1015):** LINE, POINT, CIRCLE, ARC, LWPOLYLINE, TEXT, INSERT,
ELLIPSE, SPLINE (no racional, escenario 1), MTEXT, DIMENSION (excepto
angular de dos lineas), HATCH (contorno poligonal).

**Perfil propuesto (sin firma):** AC1015_3D_WIREFRAME_V1: 3DFACE, POLYLINE 3D,
POLYLINE MESH, POLYLINE PFACE. `dwg3dWireframeBetaImportIsEnabled` siempre
devuelve false (ADR-0009 S9).

**Versiones modernas:** AC1024/AC1027/AC1032: `dwgModernBetaImportIsEnabled`
siempre devuelve false.

**Estado real:**
- `dwg-native-reader.ts:60-73` — `BETA_PROFILE_ENTITY_KINDS`: 12 tipos.
- `dwg-native-reader.ts:114` — SPLINE: solo escenario 1, no racional.
- `dwg-native-reader.ts:116` — DIMENSION: excepto angular de dos lineas.
- `dwg-native-reader.ts:372-384` — `MODERN_VERSION_CODES`: AC1024, AC1027, AC1032.
- `dwg-export-flag.ts:28` — `DWG_EXPORT_FLAG: boolean = false`.
- `dwg-export-flag.ts:43-46` — `externalOracleVerified: false` (OWNER ACTION).

### 1.4 GLB — Exportacion 3D

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `glb-export.ts` | 181 | `serializeCadGlbBlob`: THREE.js a GLB binario |
| `glb-export.spec.ts` | — | Specs |

**Estado real:**
- `glb-export.ts:26-34` — `CadGlbExportGroups`: legacy + architecture.
- `glb-export.ts:87-96` — `planCadGlbExport`: empty / architecture-missing / ready.
- `glb-export.ts:134-163` — `serializeCadGlbBlob`: escala de ajuste de camara corregida.

### 1.5 STEP/IGES/PDF — No existen como importadores/exportadores

No se encontro ningun archivo `*step*`, `*iges*`, `*pdf*` dentro de
`apps/web/src/lib/cad/`. La referencia a PDF vive en `pdf/pdf-inflate.ts`
(solo inflate para raster) y la exportacion a PDF es a traves del plan de
publicacion + renderizado vectorial, no un escritor PDF propio.

### 1.6 Shapefile / GeoJSON / GIS

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `geo-cad-document.ts` | 372 | `shapefileToCadEntities`: shapefile -> entidades canonicas |
| `geo-import-bundle.ts` | — | Bundle de importacion geoespacial |
| `geo-import-plan.ts` | — | Plan de importacion |
| `geo-cogo.ts` | — | COGO (coordenadas geodesicas) |
| `georeference.ts` | 140 | Marcador GEO, CRS, UTM <-> dibujo |

**Estado real:**
- `geo-cad-document.ts:19-38` — Decision: traslado a origen local + conversion de unidades.
- `georeference.ts:15-23` — Georreferencia como marcador POINT en capa GEO.
- `georeference.ts:48-66` — `cadGeoreferenceOf`: busca primer marcador valido.
- `georeference.ts:97-105` — `cadGeoreferencePlacement`: colocacion para importar.
- `georeference.ts:108-111` — `cadGeoreferenceWorld`: punto del dibujo a coordenadas del mundo.
- `georeference.ts:114-118` — `cadGeoreferenceGeographic`: punto a lat/lon.

### 1.7 Raster (imagenes)

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `raster-decode.ts` | 495 | Decodificador PNG/BMP (sin navegador) |
| `raster-vectorize.ts` | 538 | Otsu, despeckle, Zhang-Suen, Douglas-Peucker |
| `raster-text-recognize.ts` | 764 | Reconocimiento por plantilla Hershey |
| `raster-text-templates.ts` | — | Plantillas de glifos |
| `image-geometry.ts` | 223 | Geometria de IMAGE: pixel a mundo, clip, ajuste |
| `image-attach-payload.ts` | — | IMAGEATTACH (incrustar imagen) |
| `image-fixtures.ts` | — | Imagenes de prueba |
| `paper-space-image.ts` | — | Imagen en trazado de papel |

**Estado real:**
- `raster-decode.ts:44-53` — Lee PNG (1/2/4/8/16 bits, 5 tipos de color) y BMP (BI_RGB, 1/4/8/24/32 bits).
- `raster-decode.ts:92-101` — RECHAZA JPEG, GIF, WebP, TIFF con motivo.
- `raster-decode.ts:43` — `CAD_RASTER_MAX_PIXELS = 24_000_000` (tope).
- `raster-vectorize.ts:71-75` — `CAD_RASTER_NOT_YET`: arcos/circulos como polilineas, sombreados como contorno.
- `raster-text-recognize.ts:10-14` — Lee texto CAD trazado con fuente Hershey; NO lee manuscrito ni tipografias de contorno relleno.
- `image-geometry.ts:14-31` — Convencion: `insertion` es esquina inferior izquierda; `uVector`/`vVector` miden un pixel en unidades de dibujo.

### 1.8 Document Import (punto de entrada)

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `document-import.ts` | 511 | `importDocumentText`, `importDocumentBytes` |
| `document-import-validation.ts` | — | Validacion sin lectura |
| `document-import-worker.ts` | — | Worker de importacion |
| `document-import-client.ts` | — | Cliente del worker |
| `document-import-fuzz.ts` | — | Fuzzing |
| `document-import-door.ts` | — | Puerta de entrada |

**Formatos soportados:** DXF, JSON (canonico), Shapefile (.shp+.dbf+.prj),
GeoJSON, DWG (beta, con flags). Mesh (GLB/OBJ/STEP? via `interop/mesh-document-import`).

---

## 2. Espacio Papel y Trazado

### 2.1 Paper Space

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `paper-space.ts` | 522 | `createCadPaperSpace`, `buildCadPublishPlan` |
| `paper-space-render.ts` | 485 | `renderEntity`: entidad -> comandos vectoriales |
| `paper-space-affine.ts` | 44 | Transformacion afín 2D |
| `paper-space-style.ts` | — | Estilos de trazado (color, grosor, dash) |
| `paper-space-table.ts` | — | Texto de celdas TABLE |
| `paper-space-stroke-text.ts` | — | Texto como trazos |
| `paper-space-linetype-text.ts` | — | Texto de tipos de linea complejos |
| `paper-space-image.ts` | — | Imagen adjunta en trazado |
| `paper-space-registry-fallback.ts` | — | Respaldo de registro (muro, hueco, etc.) |
| `dxf-paper-space-scope.spec.ts` | — | Espec de alcance de espacio papel |

**Papeles soportados:** A4, A3, A2, A1, A0, letter, tabloid.
(`paper-space.ts:16-23` — `CAD_SHEET_PAPERS`).

**Escalas:** 1, 2, 5, 10, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750,
1000, 1500, 2000, 5000. (`paper-space.ts:27-30`).

**Estado real:**
- `paper-space.ts:188-246` — `createCadPaperSpace`: crea hoja con viewport de planta, cajetin y metadatos.
- `paper-space.ts:341-522` — `buildCadPublishPlan`: genera plan de publicacion completo con manifest, hojas, ventanas y comandos vectoriales.
- `paper-space.ts:451-482` — Entidades de papel: `paperCommands` dibujados directamente sobre el papel (T-30).
- `paper-space.ts:398-404` — Ventana apagada respetada: `layerVisibility['*'] !== false` (T-31).
- `paper-space-render.ts:171-484` — `renderEntity`: cubre line, polyline, circle, arc, ellipse, spline, text, mtext, dimension, hatch, mleader, connector, insert, image, table, wall, opening (via registro).

### 2.2 Viewports

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `cad-paper-viewport.ts` | 299 | `CadPaperViewport`, `CadViewportView`, `CadViewportDerivation` |
| `cad-layout-manager.ts` | 146 | CRUD de viewports + preflight |
| `viewport-bookmarks.ts` | 201 | Marcadores de vista (guardar/restaurar camara) |
| `native-viewport.ts` | 86 | Limites visibles 2D/3D |
| `cad-schema8-viewport-census.spec.ts` | — | Censo del esquema 8 |

**Estado real:**
- `cad-paper-viewport.ts:60-77` — `CadViewportViewKind`: plan, elevation, section, detail.
- `cad-paper-viewport.ts:87-90` — `CadViewportSectionPlane`: punto + normal.
- `cad-paper-viewport.ts:106-117` — `CadViewportView`: proyeccion paralela, target, direction, up, sectionPlane.
- `cad-paper-viewport.ts:181-216` — `CadViewportDerivation`: SOLDRAW (capas VIS/HID/HAT/DIM/ROT, huella sourceDigest, status fresh/stale).
- `cad-paper-viewport.ts:222-245` — `CadPaperViewport`: view, derivation, layerVisibility, layerOverrides, clipPolygon.
- `cad-layout-manager.ts:40-66` — `createCadPaperViewport`: nueva ventana en cuadricula.
- `cad-layout-manager.ts:125-146` — `preflightCadPaperSpace`: sin ventanas, fuera de area, traslapadas, sin bloquear, todas las capas congeladas.

### 2.3 Plot / Trazado

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `plot-sheet.ts` | 174 | `buildPlotSheet`: plano a escala con cajetin |
| `plot-linetype-pattern.spec.ts` | — | Espec de patron de tipo de linea |
| `plot-hatch-pattern.spec.ts` | — | Espec de patron de sombreado |

**Estado real:**
- `plot-sheet.ts:16-28` — `CAD_PAPER_SIZES`: A4 a tabloid.
- `plot-sheet.ts:31-33` — `CAD_STANDARD_SCALES`: 1 a 1000.
- `plot-sheet.ts:85-94` — `niceScaleBarSegment`: tramo redondo 1/2/5 x 10^n.
- `plot-sheet.ts:99-174` — `buildPlotSheet`: papel, escala, colocacion, cajetin, barra de escala.

### 2.4 Layout Export Adapter

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `layout-export-adapter.ts` | 222 | Adaptador de cajas/conectores/etiquetas del editor a DXF |

**Estado real:**
- `layout-export-adapter.ts:1-13` — Importa de `dxf-export.ts` y `dxf-document-export.ts`.
- `layout-export-adapter.ts:17-39` — `CadExportBox`: con shape (circle/rect) y hatch opcional.

---

## 3. Colaboracion

### 3.1 Versiones, Revisión, Markup

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `cad-collaboration.ts` | 585 | `diffCadDocuments`, `mergeCadDocuments`, versiones, hilos, review links, auditoria |
| `cad-document-collaboration.ts` | 91 | Tipos: `CadReviewThread`, `CadReviewLink`, `CadVersionSnapshot`, `CadCollaborationState` |

**Estado real:**
- `cad-document-collaboration.ts:21-36` — `CadReviewThread`: id, entityId, body, author, assignedTo, status (open/resolved), markup (note/arrow/cloud).
- `cad-document-collaboration.ts:49-58` — `CadReviewLink`: id, label, readOnly, createdAt, createdBy, expiresAt, revokedAt. Token NUNCA vive aqui.
- `cad-document-collaboration.ts:60-73` — `CadCollaborationAuditEvent`: version_created, merge_applied, comment_added, comment_resolved, review_link_created, review_link_revoked.
- `cad-document-collaboration.ts:75-83` — `CadVersionSnapshot`: documento completo (sin recursion de collaboration), contentHash.
- `cad-collaboration.ts:162-180` — `diffCadDocuments`: diff a nivel de entidad con rutas de cambio (geometria vs propiedades).
- `cad-collaboration.ts:206-424` — `mergeCadDocuments`: fusion a tres vias con colisiones (both_added, both_modified, delete_modify), resoluciones (mine, theirs, manual), dependencias por capa/bloque, secciones no-entidad, referencias colgantes.
- `cad-collaboration.ts:449-451` — `hashCadVersion`: FNV-1a sobre serializacion sin collaboration.
- `cad-collaboration.ts:463-481` — `createCadVersion`: hasta 12 snapshots.
- `cad-collaboration.ts:489-498` — `addCadReviewThread`: hasta 500 hilos.
- `cad-collaboration.ts:529-538` — `createCadReviewLink`: hasta 20 links, sin token en claro.
- `cad-collaboration.ts:576-584` — `cadReviewLinkIsActive` ELIMINADO: la vigencia la resuelve el backend.

---

## 4. Huecos vs AutoCAD

| Area | Hueco | Severidad |
|------|-------|-----------|
| **DWG exportacion** | OFF. `externalOracleVerified: false`. Solo DXF de salida. | Alto |
| **DWG versiones modernas** | AC1024/1027/1032: codec lee, flag siempre OFF | Medio |
| **DWG 3D wireframe** | Perfil propuesto, sin firma del titular | Medio |
| **PDF escritura** | No hay escritor PDF propio. Publicacion via plan vectorial + renderizado. | Bajo (funcional) |
| **PDF importacion** | No existe (`pdf/pdf-inflate.ts` es solo inflate para raster) | Alto |
| **STEP/IGES** | No existen como formatos de intercambio CAD | Alto |
| **Raster: JPEG/WebP/GIF/TIFF** | Decodificados como formato reconocido pero rechazados con motivo | Medio |
| **Raster: arcos/circulos** | Vectorizacion: salen como polilineas, no como ARC/CIRCLE | Medio |
| **Raster: sombreados** | Vectorizacion: salen como contorno, no como HATCH | Medio |
| **Raster: texto relleno** | Solo reconoce fuente de trazos Hershey, no Arial ni manuscrito | Medio |
| **Espacio papel: DXF export** | Entidades de papel se EXCLUYEN del DXF (solo modelo) | Medio |
| **Espacio papel: DWG import** | Layouts de papel no se importan desde DWG | Medio |
| **SOLDRAW** | `CadViewportDerivation` existe como contrato pero SOLDRAW real no esta cableado | Alto |
| **MVIEW poligonal** | `clipPolygon` declarado en tipo, implementacion parcial | Bajo |
| **Colaboracion: token** | Token de review link ya NO vive en documento; vigencia en backend | N/A (resuelto) |
| **Colaboracion: merge** | Tres vias completo con 12 secciones, falta CRDT | Bajo |

---

## 5. Redundancias y Deudas Tecnicas

### Redundancias

1. **Tablas de papel duplicadas.** `CAD_SHEET_PAPERS` en `paper-space.ts:16`
   y `CAD_PAPER_SIZES` en `plot-sheet.ts:20` definen los mismos papeles
   con nombres y formatos distintos. Tres constantes de escalas tambien:
   `CAD_SHEET_SCALES`, `CAD_STANDARD_SCALES`, y las de viewport.

2. **Capas DXF duplicadas.** `cadDocumentDxfLayerDefinitions` en
   `dxf-document-export.ts:168` y `layout-export-adapter.ts` montan la
   tabla LAYER por caminos distintos (senalado en `dxf-document-export.ts:163-167`).

3. **`paper-space-registry-fallback.ts`** es un respaldo explicito para 12
   tipos que `renderEntity` no cubre directamente (muro, hueco, etc.). Es
   un patron de deuda reconocida: la escalera principal deberia cubrirlos.

### Deudas Tecnicas

1. **DWG exportacion bloqueada.** `dwg-export-flag.ts:28`: flag OFF.
   `externalOracleVerified: false`. El writer existe pero nadie lo verifico
   contra ODA File Converter. OWNER ACTION registrada.

2. **SOLDRAW no cableado.** `CadViewportDerivation` en
   `cad-paper-viewport.ts:181` define `sourceDigest`, `generated`,
   `status`, `exactHiddenLines` — todo el contrato de SOLDRAW — pero
   el comando SOLDRAW real no esta implementado. Los alzados y cortes son
   manuales.

3. **MVIEW poligonal parcial.** `clipPolygon` esta en el tipo
   (`cad-paper-viewport.ts:244`) y se respeta en publicacion
   (`paper-space.ts:444`), pero el editor solo permite rectangulares.

4. **PDF como formato de intercambio.** No hay lector PDF para importar
   planos desde PDF. Solo se usa inflate para raster.

5. **STEP/IGES ausentes.** No hay codec de intercambio mecanico. El
   `interop/mesh-document-import` maneja mesh pero no B-rep.

6. **Vectorizacion: limites declarados.** `raster-vectorize.ts:71-75`:
   arcos como polilineas, sombreados como contorno. `raster-text-recognize.ts:10-14`:
   solo fuente Hershey.

7. **Espacio papel: DXF sin layouts.** `dxf-document-export.ts:56-61`:
   entidades de papel se excluyen. El DXF solo escribe espacio modelo.
   `dxf-export.ts` no tiene `LAYOUT` en la seccion OBJECTS.

8. **12 secciones de merge.** `mergeCadDocuments` en
   `cad-collaboration.ts:282-406` fusiona meta, layers, entities, history,
   modelSpace, paperSpaces, styles, blocks, constraints, externalReferences,
   unsupportedEntities, lossManifest, publications, collaboration, cells.
   Falta CRDT para tiempo real.

---

## 6. Resumen de Archivos Leidos

Total de archivos fuente (no spec) leidos o inspeccionados: **67**.

Principales:
- DXF import/export: 28 archivos
- DWG: 12 archivos
- Paper space/layout/plot: 14 archivos
- Raster/image: 8 archivos
- GIS/geo: 5 archivos
- Colaboracion: 2 archivos
- GLB: 1 archivo
- Document import: 6 archivos
