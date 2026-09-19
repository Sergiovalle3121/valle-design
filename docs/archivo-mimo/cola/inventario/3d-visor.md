# Inventario: 3D y Visor — Valle Design

> Fecha: 2026-09-04
> Archivos leídos: 46 (23 viewport/, 23 lib/cad/view/, Layout3DEditor.tsx parcial)
> Layout3DEditor.tsx: 16,909 líneas; ~125 useState; usa createPortal, OrbitControls

---

## 1. Qué existe

### 1.1 Controles de cámara (orbit, pan, zoom)

| Capa | Archivo | Estado |
|------|---------|--------|
| OrbitControls (Three.js) | Layout3DEditor.tsx:12, 6063, 732 | **Funciona.** Singleton por montaje; controlsRef en monolito. |
| Política de cámara | iewport/camera-policy.ts (263 líneas) | **Funciona.** pplyCadCameraPolicy() fija zoomToCursor=true, enableDamping=false, botón medio=PAN, reparto 2D/3D con modo designación. |
| Enmarcado inicial | camera-policy.ts:215-242 | **Funciona.** pplyInitialCameraFraming() restaura pose guardada o encuadra huella. |
| Alineación norte en planta | camera-policy.ts:84-93 | **Funciona.** lignCadPlanAzimuth() corrige el azimut heredado de la pose 3D. |
| Desbloqueo polar para comandos | camera-policy.ts:257-263 | **Funciona.** unlockPolarAngleForCommand() permite vistas cenitales exactas. |
| Controlador de vista dual | lib/cad/view/view-controller.ts (733 líneas) | **Funciona.** CadViewController maneja perspectiva + ortográfica; screenToWorld, 	oleranceWorld, orbitPerspective, panPerspective, zoomPerspective, pplyStandardView. |
| Vistas predefinidas (10) | lib/cad/view/view-3d.ts:175-259 | **Funciona.** Top/Bottom/Front/Back/Left/Right + 4 isométricas, con vectores explícitos. |
| Órbita libre (3DFORBIT) | lib/cad/view/view-3d.ts:306-398 | **Funciona.** reeOrbitStep() rota por ejes de cámara; re-ortogonalización defensiva. |
| Presets de cámara (visor) | iewport/camera-view-presets.ts (106 líneas) | **Funciona.** 6 presets: iso/top/front/back/left/right. Con soporte para contenido UTM fuera del footprint. |
| Ancla de rueda en planta | iewport/plan-wheel-anchor.ts (150 líneas) | **Funciona.** Corrige el desfase entre zoom perspectivo y vista ortográfica derivada. |
| Navegación tecleada (ZOOM/PAN/VIEW/REGEN) | lib/cad/view/view-navigation.ts (569 líneas) | **Funciona.** Pila de 10 vistas previas; ZOOM All/Extents/Previous/Center/Window/Object/Scale/Dynamic; VIEW save/restore/delete; REGEN/REGENALL. |
| Continuidad de cámara entre remontajes | lib/cad/view/camera-continuity.ts (42 líneas) | **Funciona.** snapshotCadCamera() conserva encuadre al re-montar por autosave. |

### 1.2 Modos de vista (2D / 3D)

| Capa | Archivo | Estado |
|------|---------|--------|
| Modo 2D (ortográfico) | iew-controller.ts:561-598 | **Funciona.** Cámara ortográfica derivada de perspectiva; pplyOrthographic() con volteo vertical. |
| Modo 3D (perspectiva) | iew-controller.ts:148-150 | **Funciona.** Alterna mode entre "2d" y "3d". |
| Proyección 3D: perspectiva/paralela | iew-controller.ts:201-205 | **Funciona.** setProjection("perspective" \| "parallel") — conmuta cámara sin mover posición. |
| Walkthrough (primera persona) | Layout3DEditor.tsx:1482, 2408-2506, 7500-7637 | **Funciona.** WASD + ratón para mirar; altura de ojo; pitch acotado; sale con Escape o toggle. ~150 líneas dentro del monolito. |
| Conmutación modo | camera-policy.ts:95-182 | **Funciona.** pplyCadCameraPolicy() reconfigura controles: en 2D pan=izquierdo, rotate desactivado; en 3D rotate=izquierdo, o modo designación con comando activo. |

### 1.3 Estilos visuales (VSCURRENT/SHADEMODE)

| Capa | Archivo | Estado |
|------|---------|--------|
| Definición de estilos (5) | lib/cad/view/visual-styles.ts:69-115 | **Funciona.** Wireframe, Hidden, Shaded, Shaded+Edges, X-Ray. Tabla pura con aces/edges/occludes/removesHiddenEdges/opacity. |
| Aplicación a geometría | lib/cad/view/visual-style-mesh.ts (89 líneas) | **Funciona.** pplyCadVisualStyleToGroup() construye Mesh+Edges con el estilo. Factoriza el camino de SOLID3D para que wall/room lo compartan. |
| SOLID3D sombreado | iewport/solid-shade-host.ts (393 líneas) | **Funciona.** CadSolidShadeHost reconcilia sólidos; estilo, selección, hidden-line refresh por umbral angular (5°). |
| Muros volumétricos | iewport/wall-solid-host.ts (303 líneas) | **Funciona.** CadWallSolidHost — reconcilia por firma (eje+grosor+altura+vanos+uniones); recolorea sin reteselar. |
| Piso/cielorraso/cubierta | iewport/room-solid-host.ts (186 líneas) | **Funciona.** CadArchitecturalMassHost — tres losas derivadas del grafo de muros. |
| Facada unificada de masas | iewport/native-mass-hosts.ts (110 líneas) | **Funciona.** CadNativeMassHosts — fachada que expone pplyVisualStyle() a los dos anfitriones (T-10a). |
| Resolución por nombre/id | isual-styles.ts:126-133 | **Funciona.** esolveCadVisualStyle() — sin acentos, sin mayúsculas. |

### 1.4 Pipeline de render

| Capa | Archivo | Estado |
|------|---------|--------|
| Anfitrión del pipeline por lotes | iewport/render-pipeline-host.ts (635 líneas) | **Funciona.** CadViewportRenderHost — reemplazo, invalidación, selección, capas ocultas, fondo, diagnósticos. Lámina de profundidad NDC para convivir con la escena. |
| Indicador de pipeline | iewport/RenderPipelineBadge.tsx (122 líneas) | **Funciona.** CadRenderPipelineBadge y CadRenderPipelineStats — useSyncExternalStore sin setState. |
| Ranura estable para React | ender-pipeline-host.ts:608-635 | **Funciona.** CadRenderHostSlot — existe antes del montaje de THREE. |
| Diagnóstico de sólidos 3D | iewport/Cad3DSolidDiagnostics.tsx (78 líneas) | **Funciona.** Publica data-mesh-count, data-vertex-count, data-visual-style — evidencia REAL, no botones. |
| Guardián WebGL | iewport/webgl-context-guard.ts (65 líneas) | **Funciona.** Escucha webglcontextlost/restored; preventDefault() es lo que permite la restauración. |

### 1.5 Picking 3D y designación

| Capa | Archivo | Estado |
|------|---------|--------|
| Enrutador de puntero al motor | iewport/pointer-router.ts (575 líneas) | **Funciona.** CadEnginePointerRouter — prioridad: edge > face > entity > point; banda elástica, cursor vivo, entrada dinámica, menú contextual. |
| Geometría de puntero | iewport/pointer-geometry.ts (39 líneas) | **Funciona.** Conversión local px y tolerancia pickbox. |
| Punto de trabajo bajo puntero | lib/cad/view/pointer-work-plane.ts (156 líneas) | **Funciona.** Intersección con SCU inclinado o plano del suelo. |
| Enganche 3D sobre sólidos | lib/cad/view/solid-snap.ts (694 líneas) | **Funciona.** CadSolidSnapIndex — rejilla de pantalla O(V) por cámara, O(1) por consulta; 6 modos snap (endpoint, midpoint, geometric-center, perpendicular, nearest, apparent-intersection); corrección de perspectiva. |
| Anfitrión del enganche 3D | iewport/solid-snap-host.ts (186 líneas) | **Funciona.** CadSolidSnapHost — reproyecta al mover la cámara; se apaga por tope o por capa. |
| Double-click → comando | iewport/double-click-edit.ts (74 líneas) | **Funciona.** Verbos por tipo de entidad; designa automáticamente el objeto. |
| Política de arrastre de fondo | iewport/background-drag-policy.ts (65 líneas) | **Funciona.** Central=camera, Shift+arrastre=marquee, fondo=marquee o clear según preferencia. |

### 1.6 ViewCube y ayudas de navegación

| Capa | Archivo | Estado |
|------|---------|--------|
| ViewCube CSS | iewport/CadViewCube.tsx (145 líneas) | **Funciona.** Cubo CSS con 3 caras visibles + 3 botones satélite. NO se orienta con la cámara (es estático). |
| Barra de navegación | iewport/CadNavigationBar.tsx (57 líneas) | **Funciona.** Encuadrar todo + encuadrar selección. |
| Minimapa (overview) | iewport/CadOverviewMinimap.tsx (215 líneas) | **Funciona.** SVG con contornos, activos, posición de cámara; clic para recentrar. |

### 1.7 Gestos táctiles

| Capa | Archivo | Estado |
|------|---------|--------|
| Reconocedor táctil | iewport/touch-gestures.ts (402 líneas) | **Funciona.** Un dedo designa, dos dedos cámara; pulsación larga=contextmenu; tolerancias medidas. |

### 1.8 Líneas ocultas (CPU)

| Capa | Archivo | Estado |
|------|---------|--------|
| Clasificación por caras traseras | lib/cad/view/hidden-lines.ts (355 líneas) | **Funciona.** O(V+E+F), exacta sobre convexos; flag exact. |
| Solucionador analítico multi-cuerpo | lib/cad/view/hidden-line-solver.ts (732 líneas) | **Funciona.** Aplanar → cortar por contorno y plano de cara → punto medio → re-unir. Adecuado para FLATSHOT/SOLPROF. |
| Plano de imagen | lib/cad/view/image-plane.ts (345 líneas) | **Funciona.** Base ortonormal, proyección paralela/perspectiva, rejilla uniforme, punto en polígono. |

### 1.9 Otros componentes del viewport

| Capa | Archivo | Estado |
|------|---------|--------|
| Banda elástica del motor | iewport/engine-preview.ts (139 líneas) | **Funciona.** CadEnginePreview — reutiliza un búfer; renderOrder 995. |
| Cursor vivo (DOM imperativo) | iewport/live-cursor.ts (330 líneas) | **Funciona.** Badge de snap, entrada dinámica (distancia/ángulo), menú contextual de keywords — cero React por pointermove. |
| Menú de grip caliente | iewport/grip-menu-host.ts (97 líneas) | **Funciona.** DOM imperativo con menú de acciones y badge de acción activa. |
| Controlador de grips nativos | iewport/native-grip-controller.ts (436 líneas) | **Funciona.** Espacio cicla acción; clic sin arrastre abre menú; commit por embudo canónico. |
| Overlay de colaboración | iewport/collab-overlay.ts (388 líneas) | **Funciona.** Chinchetas de comentario + cursores de pares; modo colocar; equestAnimationFrame batched. |
| Objetos de escena (rótulos, activos, cotas) | iewport/scene-objects.ts (295 líneas) | **Funciona.** Sprites canvas, grupos de activos por arquetipo. |
| Catálogo de activos | iewport/asset-catalog.ts (460 líneas) | **Funciona.** Definiciones canónicas compartidas 2D/3D. |

### 1.10 Proyección 2D ortográfica

| Capa | Archivo | Estado |
|------|---------|--------|
| Modelo de vista 2D | lib/cad/view/cad-view.ts (267 líneas) | **Funciona.** CadView con pixelsPerUnit como zoom; world↔screen, bounds, tolerancia, zoom-at-cursor, zoom-to-bounds, pan-by-pixels, plot-scale. |
| Envolvente de documento | lib/cad/view/document-extents.ts (87 líneas) | **Funciona.** cadDocumentExtents() — excluye capas apagadas/congeladas. |

---

## 2. Estado real detallado

### 2.1 Funciona completamente

- **Controles de cámara**: OrbitControls + camera-policy + plan-wheel-anchor. Cubren orbit, pan, zoom, zoom-to-cursor, damping off, botón medio=PAN.
- **Pipeline de render por lotes**: Con tiles, LOD, atlas de texto, lámina de profundidad, diagnósticos en DOM.
- **Estilos visuales 5**: Wireframe, Hidden, Shaded, Shaded+Edges, X-Ray — aplicados a SOLID3D, muros y masas.
- **Enganche 3D**: 6 modos OSNAP sobre sólidos con corrección de perspectiva.
- **Picking 3D**: Cara, arista, entidad bajo rayo de cámara; prioridad arista > cara > entidad > punto.
- **Líneas ocultas**: Clasificación simple (convexos) + solucionador analítico multi-cuerpo (cóncavos).
- **Gestos táctiles**: Un dedo designa, dos dedos cámara, pulsación larga=contextmenu.
- **Walkthrough**: WASD + ratón, altura de ojo, pitch acotado.

### 2.2 Parcial / con limitaciones declaradas

- **ViewCube**: Es estático (CSS con perspectiva fija). No se orienta con la cámara ni es arrastrable. Ver comentario CadViewCube.tsx:18-23: *"Un ViewCube de verdad se orienta con la cámara y se arrastra; eso exige llevar el azimut/elevación vivos hasta aquí..."*

### 2.3 Código muerto

No se detectó código muerto en los archivos del inventario. Todos los módulos están importados y consumidos por Layout3DEditor.tsx o por otros módulos del viewport.

---

## 3. Huecos frente a AutoCAD 3D

### 3.1 Walkthrough / Cámara

| Funcionalidad AutoCAD | Estado Valle Design | Evidencia |
|------------------------|---------------------|-----------|
| WALK / 3DWALK | **Implementado** como toggle walk en Layout3DEditor.tsx:1482. WASD + mouse look. | Líneas 2408-2506, 7500-7637 |
| 3DFLY | **No implementado.** No hay modo de vuelo libre. | — |
| Cámara con lente específica (3DCAMERALens) | **No implementado.** FOV fijo a 50°. | — |
| Animación de cámara (3DCAMERA / ANIPATH) | **No implementado.** Sin trayectorias de cámara ni animación. | — |
| Vista desde punto (VPOINT con rotación interactiva) | **Parcial:** setOrbit() existe (iew-controller.ts:337), pero no hay comando interactivo tipo "rotar con ratón la rosa". | — |
| Cámara de perspectiva paralela en 3D | **Implementado.** setProjection("parallel") en iew-controller.ts:201. | — |

### 3.2 ViewCube

| Funcionalidad AutoCAD | Estado Valle Design | Evidencia |
|------------------------|---------------------|-----------|
| ViewCube interactivo (orientación con cámara) | **No implementado.** ViewCube es estático CSS. | CadViewCube.tsx:18-23 lo declara explícitamente |
| Arrastrar ViewCube para orbitar | **No implementado.** | — |
| Home button en ViewCube | **Implementado** como botón "Iso" en satélites. | CadViewCube.tsx:123 |

### 3.3 NavWheel (SteeringWheel)

| Funcionalidad AutoCAD | Estado Valle Design | Evidencia |
|------------------------|---------------------|-----------|
| SteeringWheels (Full/Mini/2D) | **No implementado.** | — |
| Centro de órbita | **Implícito** via OrbitControls 	arget. | controlsRef en Layout3DEditor |
| Rewind (deshacer navegación) | **Parcial:** ZOOM Previo con pila de 10 vistas existe. | iew-navigation.ts:44 |

### 3.4 Estilos visuales completos

| Estilo AutoCAD | Estado Valle Design | Evidencia |
|----------------|---------------------|-----------|
| 2D Wireframe | **No como estilo propio.** El modo 2D es ortográfico con pipeline de lotes. | — |
| 3D Wireframe | **Wireframe** (sí) | isual-styles.ts:70-78 |
| Hidden | **Sí** (con CPU hidden-line refresh) | isual-styles.ts:79-87 |
| Conceptual | **No implementado.** Estilo con caras coloreadas con iluminación estilizada. | — |
| Realistic | **No implementado.** Materiales PBR/texturizados. | — |
| Shaded | **Sí** | isual-styles.ts:88-96 |
| Shaded with Edges | **Sí** | isual-styles.ts:97-105 |
| X-Ray | **Sí** (agregado, no en AutoCAD nativamente) | isual-styles.ts:106-114 |
| Sketchy / Monochrome / etc. | **No implementado.** | — |

### 3.5 Otras capacidades 3D ausentes

| Funcionalidad | Estado |
|---------------|--------|
| 3DORBIT con centro de órbita visible | **No.** Centro es invisible. |
| 3DMOVE / 3DROTATE / 3DALIGN (sólidos) | **No implementado.** Grip de sólidos es 2D. |
| FILLETEDGE / CHAMFEREDGE (en motor) | **Parcial:** comandos existen pero operan sobre el B-rep canónico, no como operaciones directas en el viewport. |
| SECTIONPLANE / LIVESECTION | **No implementado.** |
| FLATSHOT | **No implementado** como comando, aunque hidden-line-solver.ts provee la infraestructura. |
| Render (RENDER, materiales, luces) | **No implementado.** Solo estilos visuales con MeshLambertMaterial básico. |
| Walkthrough con colisiones | **No.** Sin detección de colisiones con geometría. |
| Point Clouds | **No implementado.** |

---

## 4. Redundancias y deudas técnicas

### 4.1 Redundancias

1. **Cámara perspectiva usada como base del 2D.** El modo 2D deriva la vista ortográfica de la posición de la cámara en perspectiva (iew-controller.ts:239-255, doptPerspectiveFraming). Esto requiere plan-wheel-anchor.ts (150 líneas) para corregir el desfase de zoom — trabajo que no existiría si el 2D tuviera sus propios controles directos. El archivo cad-view.ts ya define la proyección ortográfica pura (cadViewScreenToWorld, etc.) pero OrbitControls sigue operando en perspectiva.

2. **Dos caminos de snap.** snap-engine.ts es 2D; solid-snap.ts es 3D. El bridge vive en solid-shade-host.ts:213-235 (snapAtDrawingPoint). No hay duplicación de lógica pero sí dos motores de snap activos.

### 4.2 Deudas técnicas

1. **Layout3DEditor.tsx sigue siendo un monolito de 16,909 líneas.** ~125 useState. Los anfitriones extraídos (render-pipeline, solid-shade, wall-solid, room-solid, native-grip, pointer-router, touch-gestures, collab-overlay, live-cursor, engine-preview, scene-objects, etc.) redujeron el monolito pero no lo eliminaron. El walkthrough (~150 líneas) y la configuración de OrbitControls (~100 líneas) aún viven dentro.

2. **ViewCube no interactivo.** CadViewCube.tsx lo declara explícitamente (línea 18-23): *"Un ViewCube de verdad se orienta con la cámara y se arrastra."* La implementación actual es CSS estático con 6 botones.

3. **Walkthrough sin colisiones.** El modo walkthrough (walkRef) mueve la cámara sin detectar si atraviesa muros o sólidos.

4. **FOV fijo a 50°.** No hay comando para cambiar la distancia focal / lente de cámara.

5. **Iluminación básica.** MeshLambertMaterial para sombreado; sin PBR, sin sombras de ray-tracing, sin materiales texturizados.

---

## 5. Estadísticas del inventario

| Métrica | Valor |
|---------|-------|
| Archivos en iewport/ (sin specs) | 23 |
| Archivos en lib/cad/view/ (sin specs) | 13 |
| Líneas totales (viewport/) | ~5,700 |
| Líneas totales (lib/cad/view/) | ~4,600 |
| Líneas de Layout3DEditor.tsx | 16,909 |
| useState en Layout3DEditor.tsx | ~125 |
| Archivos con spec | 19 de 46 |
