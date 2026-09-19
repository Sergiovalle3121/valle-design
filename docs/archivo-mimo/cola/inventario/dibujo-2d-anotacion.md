# Inventario: Dibujo 2D y anotacion

> Area: dimensiones, textos (TEXT/MTEXT), achurados (HATCH), bloques (BLOCK/INSERT), capas (LAYER), tipos de linea (LTYPE), directrices (MLEADER), tablas, tolerancias
> Directorio: pps/web/src/lib/cad/
> Fecha: 2026-09-15

---

## 1. DIMENSIONES (COTAS)

### 1.1 Tipos de cota implementados

| Tipo | Tipo canónico | Estado | Evidencia |
|------|--------------|--------|-----------|
| Alineada | ligned | **Funciona** | ssociative-dimension.ts:153-158 — lignedDimension calcula geometría completa |
| Lineal (X/Y) | linear | **Funciona** | dimension.ts:162-181 — linearDimension proyección sobre eje |
| Angular (3 puntos) | ngular | **Funciona** | ssociative-dimension.ts:159-193 — arco con flechas y texto |
| Radio | adius | **Funciona** | ssociative-dimension.ts:194-213 — linea diametral + flecha + prefijo R |
| Diametro | diameter | **Funciona** | ssociative-dimension.ts:194-213 — doble flecha + prefijo Ø |
| Coordenada | ordinate | **Funciona** | ssociative-dimension.ts:214-233 — codo + cola horizontal |
| Longitud de arco | rc-length | **Funciona** | ssociative-dimension.ts:159-193 — comparte camino con angular, mide *sweep |

### 1.2 Estilos de dimension (DIMSTYLE)

- **Archivo principal:** dimension-style.ts (501 lineas)
- **Estado:** Funciona completo. Define CadDimensionStyleDefinition con ~30 DIMVARs:
  - Texto: 	extStyle, 	extHeight, 	extGap, 	extVertical, 	extJustification, 	extInsideHorizontal, 	extOutsideHorizontal, 	extColor
  - Flechas: rrowhead (closed-filled, open, architectural-tick, dot), rrowheadFirst/Second, separateArrowheads, rrowSize
  - Lineas: extensionOvershoot, extensionGap, aselineSpacing, dimLineColor, extensionLineColor, dimLineWeight, extensionLineWeight, orceLineInside, orceTextInside
  - Ajuste: overallScale (DIMSCALE), linearFactor (DIMLFAC)
  - Unidades: precision, zeroSuppression, oundTo, prefix, suffix, units
- **Resolucion:** esolveCadDimensionStyle — defaults ← Standard ← nombre ← subestilo de familia
- **Códec DXF:** cadDimensionStyleToEntries/FromEntries (XDATA) + cadDimensionStyleStandardPairs/FromStandardPairs (DIMVARs estándar)
- **Comparar estilos:** cadCompareDimensionStyles — lista diferencias campo a campo

### 1.3 Subestilos por familia (DIMSTYLE)

- **Archivo:** dimension-family.ts (108 lineas)
- **Estado:** Funciona. Codigos 0 (lineal), 2 (angular), 3 (diametro), 4 (radio), 6 (coordenada), 7 (directriz)
- **Resolucion:** cadDimensionFamilyStyle — padre + subestilo $n encima
- **Evidencia:** dimension-family.spec.ts existe con tests

### 1.4 Tolerancias de cota

- **Archivo:** dimension-tolerance.ts (256 lineas)
- **Estado:** Funciona. Tres modos: symmetric (±), deviation (+p/-m), limits (max/min)
- **Ajustes ISO 286:** cadIsoFit(nominalMm, code) — calcula desviaciones para IT5-IT11, nominales 0-500mm
  - Agujeros: D, E, F, G, H, JS
  - Ejes: d, e, f, g, h, js, k, m, n, p
  - **Limite declarado:** K, M, N, P (agujeros) requieren correccion Delta que NO esta implementada; se rechaza diciendolo
- **Persistencia:** en context.metadata de la cota (5 claves: tolerance, toleranceUpper, toleranceLower, toleranceDecimals, toleranceFit)
- **Rotulacion:** cadDimensionToleranceText genera etiqueta segun modo
- **Evidencia:** dimension-tolerance.spec.ts existe

### 1.5 Formato de cotas

- **Archivo:** dimension-format.ts (154 lineas)
- **Estado:** Funciona. convertLength, ormatLength, ormatWithTolerance, ormatArea, ormatAngle
- **Overrides de estilo:** cadDimensionStyleOverrides — el estilo manda sobre el borrador

### 1.6 Cotas asociativas

- **Archivo:** ssociative-dimension.ts (314 lineas)
- **Estado:** Funciona. egenerateAssociativeDimensions recalcula cuando cambian entidades referenciadas
- **Anclajes:** cadEntityAssociationAnchor — soporta insertion, start, end, center, arc-start/end, major-start/end, control
- **Desasociacion al transformar:** dimension-entity-adapter.ts:105-129 — transformar una cota la desasocia

### 1.7 Cotas de otros CAD (importacion DXF)

- **Archivo:** dxf-read-foreign-dimensions.ts (314 lineas)
- **Estado:** Funciona parcialmente.
  - **Reconstruye:** aligned, linear (solo X/Y puro, NO girada), radius, diameter, angular (solo 3 puntos, NO 2 lineas), ordinate
  - **NO reconstruye:** lineal girada a angulo no cardinal, angular de 2 lineas (tipo 2)
  - **Cotas reconstruidas entran DESLIGADAS** (sin asociatividad a geometria), declarado con aviso
  - **Evidencia:** avisos oreign_dimension_detached y oreign_dimension_unsupported

### 1.8 Auto-dimensionado

- **Archivo:** uto-dimensions.ts (155 lineas)
- **Estado:** Funciona. Genera cotas overall + encadenadas centro-a-centro para layouts de planta.

### 1.9 Escritura DXF de cotas

- **Archivo:** dxf-write-dimensions.ts (226 lineas)
- **Estado:** Funciona. Escribe entidad DIMENSION + bloque anonimo *D{n} + XDATA completa (kind, axis, units, tolerancias, DIMVARs horneados, anotativo)

### 1.10 Huecos frente a AutoCAD

- Cotas de LEADER (sin texto) — no existe tipo independiente; se usa MLEADER
- Cotas TOLERANCIA geometrica (GD&T) — no hay entidad de marco de tolerancia
- DIMJOGBY (radio con codo) — no implementado
- Cotas STACKED (apiladas automaticamente) — no implementado
- Cotas de AREA — ormatArea existe pero no como tipo de entidad cota
- Re-horneado al DIMSTYLE Apply — la logica existe (cadDimensionStyleBake) pero falta el comando que la ejecute

---

## 2. TEXTOS (TEXT y MTEXT)

### 2.1 TEXT (linea unica)

- **Archivo:** 	ext-entity-adapter.ts (220 lineas)
- **Estado:** Funciona. Sintetiza un MTEXT de una linea (sMText) y reutiliza layoutCadMText para maqueta, caja, esquinas
- **Adaptador completo:** renderer, bounds, hitTest, grips (insercion, altura, rotacion), snaps, properties (read/write), transform
- **Anclaje:** top-left, igual que las conversiones DXF existentes
- **Medida del ancho:** measureCadMText (no heuristica — mide de verdad)
- **Evidencia:** 	ext-entity-adapter.spec.ts, 	ext-connector-fidelity.spec.ts

### 2.2 MTEXT (texto multilinea)

- **Archivos:**
  - lock-text-adapters.ts:92-260 — adaptador MTEXT (renderer, bounds, hitTest, grips, snaps, properties, transform)
  - mtext-layout.ts (240 lineas) — maqueta: ajuste de linea, columnas, alineacion, esquinas, bounds
  - mtext-codes.ts (471 lineas) — parser de codigos de control MTEXT
  - mtext-fonts.ts (410 lineas) — resolucion de fuentes

- **Estado:** Funciona. Capacidades:
  - Ajuste de linea con espacio DURO (\~)
  - Multiples columnas (1-8)
  - Alineacion: 9 posiciones (top-left a bottom-right) + paragraphAlignment (left, center, right, justify)
  - Fondo enmascarado (ackgroundMask, ackgroundColor, ackgroundPadding)
  - **Codigos reconocidos:** \P (parrafo), \L/l (subrayado), \O/o (sobrerrayado), \S (apilado: tolerancia, fraccion, diagonal), \f (fuente), \C (color ACI), \H (altura), \W (anchura), \Q (oblicuidad), \A (alineacion vertical), \~ (espacio duro), {} (grupo)
  - **Codigos NO reconocidos (declarado):** \T (espaciado entre caracteres), \p (sangrias y tabuladores) — se conservan literales
  - Font stack CSS con sustitucion declarada

### 2.3 Fuentes

- **Archivo:** mtext-fonts.ts (410 lineas)
- **Estado:** Funciona con limites declarados.
  - **SHX:** Ninguna .shx se INTERPRETA. Las 5 comunes (txt, simplex, romans, isocp, monotxt) se sustituyen por familia Hershey de trazos (strokeFamily). Otras se sustituyen por Arial/Times/Courier.
  - **TTF:** 9 familias resueltas (Arial, Helvetica, Times, Times New Roman, Courier, Courier New, Verdana, Georgia, Tahoma). Resto sustituido por la estandar mas cercana.
  - **Hershey:** 5 familias de trazos compiladas (onts/hershey-fonts.ts), dominio publico.
  - **Tres disposiciones:** esolved, substituted, symbols-lost
  - Informe de fuentes: describeCadMTextFont, esolveCadMTextFonts

### 2.4 Exportacion TEXT/MTEXT a DXF

- **TEXT:** dxf-text-entities.ts (93 lineas) — cadDocumentNativeDxfTexts + cadDxfTextPrimitiveToEntity
- **MTEXT:** existe camino de exportacion completo (en dxf-export.ts y dxf-write-core.ts)

### 2.5 Huecos frente a AutoCAD

- FIELD (campos automaticos: fecha, nombre archivo, area, etc.) — no implementado
- MTEXT con tabuladores (\p) — se conservan literales
- \T (espaciado entre caracteres/kerning) — se conserva literal
- SHX: no se INTERPRETAN, solo sustituyen

---

## 3. ACHURADOS (HATCH)

### 3.1 Motor de achurado

- **Archivo:** hatch.ts (110 lineas)
- **Estado:** Funciona. hatchPolygon (lineas de barrido recortadas) + crossHatchPolygon (dos pasadas)

### 3.2 Tabla de patrones

- **Archivo:** hatch-pattern-table.ts (164 lineas)
- **Estado:** Funciona. 25 patrones definidos:
  - ANSI: 31-38, CROSS
  - Arquitectura: AR-B816, AR-BRSTD, BRICK, AR-CONC, AR-SAND
  - Otros: DOTS, EARTH, GRAVEL, HEX, HONEY, LINE, NET, NET3, STEEL, MUDST
  - Cada uno con familias de lineas (angulo, separacion, desfase, corrimiento, secuencia de trazos)
- **Patrones importados:** cad-hatch-imported-pattern.ts — campo opcional patternDefinition para trama de archivos ajenos

### 3.3 Trazos del patron

- **Archivo:** hatch-pattern-strokes.ts (172 lineas)
- **Estado:** Funciona. cadHatchPatternStrokes — genera trazos con guiones, puntos y filtro de islas. cadHatchDashChord para secuencias de trazos.
- **LOD:** guiones se colapsan cuando miden subpixel (collapseDashes)

### 3.4 Adaptador de entidad

- **Archivo:** hatch-entity-adapter.ts (327 lineas)
- **Estado:** Funciona. Renderer con LOD (tier 0 = solo contorno, tier completo = patron), hitTest (contencion + borde), grips (centro + vertices), snaps (centro geometrico), properties (pattern, solid, scale, angle, islandStyle, associative), transform (angulo se refleja, no suma)

### 3.5 Asociatividad

- **Archivo:** hatch-associativity.ts (332 lineas)
- **Estado:** Funciona. stitchCadBoundaryPaths une caminos en bucles. esolveCadHatchRegion con estilos de isla (normal, outer, ignore). egenerateAssociativeHatches recalcula al cambiar entidades. Deteccion de autointerseccion (cadBoundarySelfIntersects) y cruces entre anillos.

### 3.6 Isocurvas (islas)

- **Archivo:** hatch-islands-corpus.spec.ts — tests de islas
- **Estado:** Tests existen

### 3.7 Publicacion (PDF/lamina)

- **Archivo:** hatch-publish-strokes.ts (124 lineas)
- **Estado:** Funciona. Guarda de densidad (minimo 0.3mm en papel, maximo 4000 trazos). Degradacion a contorno con aviso.

### 3.8 Importacion/Exportacion DXF

- **Importacion:** dxf-read-hatch.ts (168 lineas) — parser crudo de HATCH. Lee polilineas y rutas de aristas rectas. Aristas curvas se omiten con aviso.
- **Exportacion:** dxf-export-hatch.ts (90 lineas) — escribe HATCH con definicion por familia (53/43/44/45/46/79/49)

### 3.9 Huecos frente a AutoCAD

- Patrones definidos por usuario (.pat) — no se cargan; tabla cerrada en codigo
- Islas con puntos semilla multiples — parcial
- Gradient hatch — no implementado
- Rutas de aristas con curvas en importacion DXF — se omiten

---

## 4. BLOQUES (BLOCK / INSERT)

### 4.1 Motor de bloques

- **Archivo:** professional-blocks.ts (550 lineas)
- **Estado:** Funciona completo.
  - defineCadBlock, insertCadBlock, edefineCadBlock, explodeCadInsert, eplaceCadBlock, purgeUnusedCadBlocks, searchCadBlocks
  - esolveCadInsert — resolucion recursiva con deteccion de ciclos, profundidad maxima (16), atributos, XCLIP
  - Matrices afines: insertMatrix con T(ins)·R(rot)·S(scale)·T(-base). Manejo correcto de reflexion.
  - Transformacion de entidades anidadas: todas las entidades canonicas incluyendo hatch (angulo se refleja), dimension, mleader, text/mtext
  - Thumbnails SVG: uildCadBlockThumbnail

### 4.2 Cache de bloques

- **Archivo:** lock-cache.ts (191 lineas)
- **Estado:** Funciona. Cache por (definicion, version, segments). O(1) por instancia para bounds. Sin desalojo (acotada por tabla de bloques).

### 4.3 Bloques dinamicos

- **Archivo:** dynamic-blocks.ts (703 lineas)
- **Estado:** Funciona. Dos familias implementadas:
  - puerta-abatible — parametrica: claro (600-1200mm, pasos comerciales), apertura (0-180°), muro (100-400mm), espejo (flip). Normas Tecnicas CDMX.
  - 
ivel — simbolo anotativo de nivel de piso (3mm en papel), con flip
- Materializacion en bloques anonimos con nombre determinista
- Parametros en context.metadata del INSERT
- Re-estirar: cadDynamicRestretchCommands
- Bloques anotativos: cadAnnotativeBlockScale, cadAnnotativeBlockRescaleCommands

### 4.4 Sesion BEDIT

- **Archivo:** lock-edit-session.ts (196 lineas)
- **Estado:** Funciona v1. Edicion en lienzo de definicion de bloque con historial propio. Reutiliza executeCadEntityCommand. Limites declarados: sin ATTDEF, sin bloques anidados editables, sin tabla de capas propia.

### 4.5 Adaptador INSERT

- **Archivo:** lock-text-adapters.ts:271-528 — insertAdapter
- **Estado:** Funciona. Renderer (resuelve bloque o cruz de referencia), bounds (O(1) con cache), hitTest, grips (insercion, rotacion, escala), snaps, properties, transform (reflexion correcta con resta de angulo y signo de escala)

### 4.6 Bloques profesionales

- **Archivo:** professional-blocks.ts — busqueda, diagnostico (nalyzeCadBlocks), batch rendering (uildCadInsertBatches)
- **Biblioteca sembrada:** existe en otro archivo (no en este inventario)

### 4.7 Huecos frente a AutoCAD

- Dynamic blocks de AutoCAD (parameters/visibility states del .dwg) — no importan; los propios son diferentes
- WBLOCK (write block a archivo externo) — no implementado
- ATTDEF en BEDIT — declarado como limite v1
- Nested block editing en BEDIT — declarado como limite v1

---

## 5. CAPAS (LAYER)

### 5.1 Modelo de capas del documento

- **Archivo:** cad-layer-manager.ts (89 lineas)
- **Estado:** Funciona. CRUD completo: createCadDocumentLayer, updateCadDocumentLayer, deleteCadDocumentLayer (con reasignacion de entidades). Validacion de nombres DXF. Propiedades: name, color (hex), visible, locked, linetype, lineweight, plot.

### 5.2 Capas legacy (sistema de layout)

- **Archivo:** layers.ts (233 lineas) — interfaz simplificada CadLayer con id, label, color, visible, locked
- **Archivo:** layer.ts (148 lineas) — modelo DXF-classico con CadLayer, LayerTable, funciones makeLayer, layerVisible, layerEditable, effectiveColor, effectiveLinetype, effectiveLineweight
- **Estado:** Ambos existen. layers.ts es legacy del planificador de plantas; layer.ts es el modelo DXF.

### 5.3 Visibilidad de capas

- **Archivo:** cad-layer-visibility.ts (77 lineas)
- **Estado:** Funciona. Regla unica: cadLayerShown (visible AND NOT frozen). Conjuntos: cadHiddenLayerIds, cadFrozenLayerIds, cadUnsnappableLayerIds, cadUnselectableLayerIds

### 5.4 Estados de capa (LAYERSTATE)

- **Archivo:** layer-states.ts (247 lineas)
- **Estado:** Funciona. Persistidos en documento (document.layerStates). captureCadLayerState, planCadLayerStateRestore, upsertCadDocumentLayerState, deleteCadDocumentLayerState, estoreCadDocumentLayerState. Alcance configurable (visibility, locking, color, linetype, lineweight, plot). Catalogo de sesion para LAYISO/LAYWALK.

### 5.5 Guardia de capas bloqueadas

- **Archivo:** locked-layer-guard.ts (69 lineas)
- **Estado:** Funciona. ssertCadLockedLayerInvariant — compara checkpoint contra resultado, impide modificar/borrar entidades en capa bloqueada. Crear en capa bloqueada SÍ se permite.

### 5.6 Mapeo DXF

- **Archivo:** dxf-layer-map.ts — mapeo de capas en importacion/exportacion DXF
- **Archivo:** dwg-document-bridge-layers.ts — capas en importacion DWG

### 5.7 Huecos frente a AutoCAD

- Filtros de capa (Layer Filter) — no implementado
- Propiedades por viewport (VP Freeze, VP Color, VP Linetype) — parcial (layerOverrides en viewport)
- LAYWALK — memoria de sesion existe pero el comando interactivo no esta verificado
- LAYMRG (merge layers) — no implementado
- LAYMCH (match layer) — no implementado

---

## 6. TIPOS DE LINEA (LTYPE)

### 6.1 Motor de tipos de linea

- **Archivo:** linetype.ts (123 lineas)
- **Estado:** Funciona. pplyLinetype — aplica patron a polilinea, fase continua entre aristas. 6 tipos de fábrica: CONTINUOUS, DASHED, HIDDEN, CENTER, DASHDOT, DOTTED.

### 6.2 Tipos de linea complejos (con texto)

- **Archivo:** linetype-complex.ts (173 lineas)
- **Estado:** Funciona. 7 tipos con texto: GAS_LINE, HOT_WATER_SUPPLY, AGUA_FRIA, AGUA_CALIENTE, SANITARIO, PLUVIAL, CONTRA_INCENDIO. Tabla en codigo (no persistida). cadLinetypeTextPlacements calcula posiciones de rótulos a lo largo de camino.

### 6.3 Lector de archivos .lin

- **Archivo:** linetype-lin.ts (236 lineas)
- **Estado:** Funciona. parseCadLinetypeLibrary — lee definiciones simples. Definiciones complejas (con texto/formas) se saltan con aviso detallado. CadLinetypeCatalog con persistencia en localStorage.

### 6.4 Resolucion de tipos de linea

- **Archivo:** linetype-resolve.ts (51 lineas)
- **Estado:** Funciona. cadLinetypePatternFor — busca en documento + fabrica. cadLinetypeDashArray para PDF/SVG.

### 6.5 Texto de tipos de linea en lamina

- **Archivo:** paper-space-linetype-text.ts (50 lineas)
- **Estado:** Funciona. cadLinetypeTextCommands — genera comandos de texto para los rotulos de tipos complejos en coordenadas de papel.

### 6.6 Huecos frente a AutoCAD

- Carga de .lin propios con texto/formas — solo se cargan los simples; los complejos se declaran
- .shx para formas (FENCELINE, TRACKS, etc.) — no hay interprete de formas
- PLINEGEN (patron continuo vs. reinicio por vertice) — siempre reinicia (PLINEGEN=0)

---

## 7. DIRECTRICES (MLEADER)

### 7.1 Motor de directrices

- **Archivo:** mleader.ts (86 lineas) — geometria pura
- **Archivo:** ssociative-mleader.ts (162 lineas) — geometria completa del documento
- **Estado:** Funciona. Flecha + linea directriz + landing + caja de texto. Tipos de flecha: closed-filled, open, architectural-tick, dot, none.

### 7.2 Adaptador de entidad

- **Archivo:** mleader-entity-adapter.ts (136 lineas)
- **Estado:** Funciona. Renderer, bounds, hitTest, grips (vertices + text position), snaps, properties (text, contentType, style, landing, doglegLength, arrowhead, arrowSize, textWidth/Height/Rotation/Alignment, font, bold/italic/underline, backgroundMask, associative), transform (reflexion correcta)

### 7.3 Asociatividad

- **Archivo:** ssociative-mleader.ts:91-162
- **Estado:** Funciona. egenerateAssociativeMleaders — recalcula al cambiar entidades. Anclajes: corner-ne, insertion, start, end, control, center, arc-start/end, major-start/end.

### 7.4 Multi-leader

- **Estado:** Funciona. cadMleaderLines soporta multiples lineas de directriz (entity.leaderLines)

### 7.5 Huecos frente a AutoCAD

- MLEADER con bloque como contenido (contentType: "block") — solo texto
- MLEADER con colectores (landing con multiple directrices convergiendo) — parcial
- Estilos de MLEADER (MLEADERSTYLE) como tabla — solo campos inline

---

## 8. TABLAS (TABLE)

### 8.1 Entidad TABLE

- **Estado:** Existe como tipo de entidad (	ype: "table") en el esquema
- **Archivo de frame:** nnotation-v4-adapters.ts — cadTableFrame
- **Publicacion en lamina:** paper-space-table.ts (102 lineas) — cadTableCellTextCommands genera comandos de texto por celda con anclas y alineacion
- **Exportacion DXF:** dxf-schema4-table.ts — escribe TABLE

### 8.2 Huecos frente a AutoCAD

- Edicion interactiva de celdas — no verificado
- Formulas en celdas — no implementado
- Estilos de tabla — no implementado como tabla
- Insercion de bloques en celdas — no implementado

---

## 9. REDUNDANCIAS Y DEUDAS TECNICAS

### 9.1 Dos modelos de capa

- layers.ts (legacy del planificador: id, label, color string) y layer.ts (DXF-classico: name, color number ACI, linetype, lineweight, on, frozen, locked) coexisten. cad-layer-manager.ts usa CadLayerDef del documento. La deuda es que layers.ts sigue exportando DEFAULT_CAD_LAYERS con id/label mientras el documento usa 
ame/color hex.

### 9.2 dimension.ts vs ssociative-dimension.ts

- dimension.ts define DimensionStyle (4 campos geometricos) y produce DimensionGeometry. ssociative-dimension.ts produce CadDimensionGeometry con paths. Ambos calculan geometria de cotas pero con interfaces distintas. La coexistencia esta justificada: dimension.ts es puro y alimenta DXF legacy; ssociative-dimension.ts es el modelo del documento.

### 9.3 hatch.ts (scanline) vs hatch-pattern-strokes.ts (patron)

- hatch.ts genera achurado simple por scanline. hatch-pattern-strokes.ts genera trazos con familias, guiones y puntos. El primero alimenta el segundo (lo importa) y la separacion es limpia.

### 9.4 lock.ts (primitivo) vs professional-blocks.ts (completo)

- lock.ts (91 lineas) define BlockDefinition/BlockInsert con primitivas 2D. Es el modelo antiguo. professional-blocks.ts (550 lineas) es el bloque real del documento. Coexisten porque lock.ts es usado por rutas legacy.

### 9.5 Deuda de monolito

- entity-runtime.ts esta en presupuesto de monolito. Los adaptadores se extrajeron a archivos propios (dimension, hatch, text, mleader, polyline, spline, arc, ellipse). lock-text-adapters.ts contiene MTEXT + INSERT juntos (justificado: INSERT necesita dibujar MTEXT anidado).

---

## 10. ARCHIVOS LEIDOS

| # | Archivo | Lineas |
|---|---------|--------|
| 1 | dimension.ts | 181 |
| 2 | dimension-family.ts | 108 |
| 3 | dimension-style.ts | 501 |
| 4 | dimension-format.ts | 154 |
| 5 | dimension-tolerance.ts | 256 |
| 6 | dimension-text-context.ts | 23 |
| 7 | dimension-entity-adapter.ts | 130 |
| 8 | ssociative-dimension.ts | 314 |
| 9 | uto-dimensions.ts | 155 |
| 10 | dxf-write-dimensions.ts | 226 |
| 11 | dxf-read-foreign-dimensions.ts | 314 |
| 12 | 	ext-entity-adapter.ts | 220 |
| 13 | mtext-codes.ts | 471 |
| 14 | mtext-layout.ts | 240 |
| 15 | mtext-fonts.ts | 410 |
| 16 | dxf-text-entities.ts | 93 |
| 17 | lock-text-adapters.ts | 528 |
| 18 | paper-space-stroke-text.ts | 130 |
| 19 | paper-space-linetype-text.ts | 50 |
| 20 | aster-text-recognize.ts | 764 |
| 21 | aster-text-templates.ts | 317 |
| 22 | hatch.ts | 110 |
| 23 | hatch-entity-adapter.ts | 327 |
| 24 | hatch-pattern-table.ts | 164 |
| 25 | hatch-associativity.ts | 332 |
| 26 | hatch-pattern-strokes.ts | 172 |
| 27 | hatch-publish-strokes.ts | 124 |
| 28 | cad-hatch-imported-pattern.ts | 68 |
| 29 | dxf-read-hatch.ts | 168 |
| 30 | dxf-export-hatch.ts | 90 |
| 31 | lock.ts | 91 |
| 32 | lock-cache.ts | 191 |
| 33 | lock-edit-session.ts | 196 |
| 34 | professional-blocks.ts | 550 |
| 35 | dynamic-blocks.ts | 703 |
| 36 | layer.ts | 148 |
| 37 | layers.ts | 233 |
| 38 | cad-layer-manager.ts | 89 |
| 39 | cad-layer-visibility.ts | 77 |
| 40 | layer-states.ts | 247 |
| 41 | locked-layer-guard.ts | 69 |
| 42 | linetype.ts | 123 |
| 43 | linetype-complex.ts | 173 |
| 44 | linetype-lin.ts | 236 |
| 45 | linetype-resolve.ts | 51 |
| 46 | mleader.ts | 86 |
| 47 | mleader-entity-adapter.ts | 136 |
| 48 | ssociative-mleader.ts | 162 |
| 49 | paper-space-table.ts | 102 |
| 50 | entity-command-tables.ts | 152 |
| 51 | dxf-write-tables.ts | 200 |
| 52 | cad-symbol-tables.ts | 248 |
| 53 | dxf-block-primitive.ts | 62 |
| 54 | dxf-block-xdata.ts | 103 |
