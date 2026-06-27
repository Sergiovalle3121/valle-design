# Catálogo de contratos CAD (Fases 66–73) — referencia para Codex

Índice único de todo lo que el carril de **Claude** entregó a `main` para el CAD.
Cada entrada: qué da, firma/endpoint, archivo, cómo lo cablea **Codex** en el editor,
y cómo correr sus tests. Todo es **puro/aditivo**; nada está aún importado por
`Layout3DEditor.tsx` — ese cableado es el trabajo de Codex.

> Convención de tests del web: scripts `npx tsx <archivo>.spec.ts`. Backend: `npx jest <patrón>`.

---

## Frontend — módulos puros (`apps/web/src/components/line-engineering/`)

### `precision-input.ts` — entrada numérica (Fase 66)
`parseCoordinate(raw, {last?, lockedAngleDeg?})` → `{ok,point,mode}|{ok:false,error}`
(`10,20` abs · `@5,-3` rel · `30<45` polar abs · `@10<90` polar rel · `25` directa) ·
`constrainPoint(last, cursor, {ortho?, polarIncrementDeg?})` → `{point, angleDeg, snapped}` ·
`polarPoint` · `angleDeg` · `distance` · `normalizeDeg`.
**Codex:** barra de comandos (teclear coords), toggles ortho/polar (F8/F10).

### `snap-engine.ts` — OSNAP (Fase 66)
`snap(cursor, scene, {modes?, tolerance, from?})` → `{point, type, distance}|null` ·
`rectGeometry({x,y,w,h,rotation})` → `{corners, edges, center}` · `segmentIntersection` ·
`perpendicularFoot` · `nearestOnSegment`. Tipos: endpoint|intersection|center|midpoint|perpendicular|node|nearest|grid.
**Codex:** construir `SnapScene` desde estaciones/assets/muros (con `rectGeometry`) + vértices DXF; dibujar glifo por `type`.

### `cad-command.ts` — comandos multi-paso (Fase 66/67)
`startCommand(id)` · `feedPoint(state,p)` · `feedDistance(state,d)` · `commit` · `cancel` · `previewGeometry(state,cursor)`.
Comandos: line|polyline|rect|circle|move|copy|offset. Emite `DrawAction[]`.
**Codex:** resolver click→`feedPoint`; aplicar `state.emitted`; rubber-band con `previewGeometry`.

### `geom-edit.ts` — edición geométrica (Fase 67)
`offsetSegment` · `offsetPolyline` · `extendToLine` · `trimAtCutter` · `chamferCorner` · `filletCorner` · `lineLineIntersection`.
**Codex:** herramientas trim/extend/offset/fillet/chamfer.

### `geom-measure.ts` — geometría de polígonos (Fase 67/72)
`polygonArea` · `polygonPerimeter` · `polygonCentroid` · `pointInPolygon` (cóncavos) · `boundingBox` · `convexHull`.
**Codex:** zonas/keep-out (área en take-off), "¿en qué zona cae?", envolver estaciones.

### `cad-intent.ts` — NL→CAD (Fase 69/72)
`CAD_TOOLS` (function-calling) · `normalizeToolCall(name, args)` · `normalizeToolCalls(calls)` → `CadIntent[]`.
Intents: setFootprint|placeAsset|draw|arrangeLine|connectLine|moveStation.
**Codex:** barra de chat-comando; aplicar cada `CadIntent`.

### `cad-vision.ts` — vision→CAD (Fase 71)
`VISION_SYSTEM_PROMPT` · `normalizeVision(raw, footprint)` → `{walls, zones, unitHint?, errors}`.
**Codex:** subir imagen → llamar `/layout/vision` → `normalizeVision` → previsualizar/insertar muros y zonas.

### `plot-scale.ts` — plot a escala (Fase 70)
`PAPER_SIZES` · `fitScale(footprint, paper, {margin, titleBlockH})` · `worldToPaper(p, footprint, layout)` · `scaleBar(layout, unit)` · `niceRound`.
**Codex:** lámina + cajetín + escalímetro → export PDF vectorial a escala.

### `dimension-format.ts` — estilos de cota (Fase 73)
`convertLength` · `formatLength` · `formatWithTolerance` (± y +x/−y) · `formatArea` · `formatAngle`.
**Codex:** etiquetas de cota y del escalímetro.

### `cad-array.ts` — patrones (Fase 73)
`rectangularArray` · `polarArray` · `pathArray` → `{point, rotationDeg}[]`.
**Codex:** comando ARRAY (rectangular/polar/ruta) al duplicar.

---

## Backend (`apps/api/src/modules/line-engineering/`, bajo `/api/line-engineering`)

### Capas CAD (Fase 66)
Columna aditiva `layers` en `sf_line_layouts` + `layer?` en assets/annotations.
`GET/PUT /layout` exponen/persisten `layers: LayoutLayer[]` (`{id,name,color,visible,locked}`).

### DXF de alta fidelidad (Fase 68)
`line-dxf.ts` `buildDxf` ahora emite **CIRCLE/ARC** (flip-Y correcto) y registra **capas CAD** (`layerDefs`) con color.

### NL→CAD (Fase 69)
`POST /layout/cad-intent` `{model, revision?, prompt}` → `{available, toolCalls:[{name,arguments}], message?}`.
Llama a CIDE (`CIDE_BASE_URL`, OpenAI-compatible) con `CAD_INTENT_TOOLS`. **El frontend valida con `normalizeToolCalls`.**

### Copiloto de optimización (Fase 72)
`GET /layout/optimize-copilot?model&revision` → mismas tool-calls; el modelo propone un reacomodo que baja el recorrido (incluye `moveStation`). Sugerencia, no auto-aplica.

### Vision→CAD (Fase 71)
`POST /layout/vision` `{model, revision?, imageDataUrl}` → `{available, raw, message?}`.
Manda la imagen (solo `data:` URLs, anti-SSRF) al modelo multimodal (`CIDE_VISION_MODEL`); el frontend valida `raw` con `normalizeVision`.

---

## Pendiente / decisiones

- **DWG** (lectura/escritura nativa): requiere una **librería de terceros pesada** → decisión del dueño. Mientras, el DXF de alta fidelidad cubre el round-trip más común.
- **Wiring del editor**: todo lo de arriba lo consume Codex en `Layout3DEditor.tsx` + componentes UI nuevos. Ese es el siguiente gran bloque.
- **Variables de entorno backend**: `CIDE_BASE_URL`, `CIDE_API_KEY`, `CIDE_MODEL`, `CIDE_VISION_MODEL`. Sin motor, los endpoints de IA responden `available:false` con gracia.
