# Inventario: Kernel B-rep y Geometría

**Fecha:** 2026-09-19
**Área:** apps/web/src/lib/brep/, solid3d*, pick3d, curvas, fillet/chamfer
**Archivos leídos:** 65 archivos fuente (sin contar .spec.ts de pruebas)

---

## 1. QUÉ EXISTE

### 1.1 Kernel B-rep (pps/web/src/lib/brep/)

El kernel es un modelador de sólidos por representación de fronteras (B-rep) escrito desde cero, sin dependencias externas, con 42 archivos fuente.

#### Tipos clave

| Tipo | Archivo:Linea | Descripción |
|------|--------------|-------------|
| BrepBody | topology.ts:95-102 | Cuerpo B-rep: arrays de vértices, medias-aristas, aristas, lazos, caras, cáscaras |
| BrepVertex | topology.ts:36-40 | Vértice: punto 3D + índice de una media-arista saliente |
| BrepHalfEdge | topology.ts:42-51 | Media-arista: origin, edge, loop, next, prev, twin |
| BrepEdge | topology.ts:53-57 | Arista: dos medias-aristas (a, b); b = NO_INDEX si es de borde |
| BrepLoop | topology.ts:61-66 | Lazo: face, first half-edge, kind (outer/inner) |
| BrepFace | topology.ts:68-81 | Cara: loops[], surface portadora, reversed, shell |
| BrepShell | topology.ts:83-87 | Cáscara: faces[], closed |
| BrepSolid | topology.ts:105 | Alias de BrepBody para cuerpos cerrados |
| BrepSurface | surfaces.ts:94-100 | Union: Plane \| Cylinder \| Cone \| Sphere \| Torus \| Nurbs |
| NurbsSurface | nurbs.ts:32-43 | Superficie NURBS racional con nudos clamped |
| NurbsCurve | nurbs.ts:22-30 | Curva NURBS racional |
| BrepMesh | tessellate.ts:32-39 | Malla de render: positions[], normals[], indices[] |
| Profile | profile.ts:23-28 | Perfil 2D: outer (CCW) + inners (CW) |

#### Álgebra vectorial (vec3.ts, 259 líneas)

- Tipos: Vec3, Aabb3
- Operaciones: add, sub, scale, dot, cross, normalize, lerp, rotateAroundAxis (Rodrigues)
- AABB: empty, expand, union, diagonal, center, overlaps, containsPoint
- Base ortonormal 3Basis con selección determinista de eje auxiliar
- Inmutabilidad declarada como convenio

#### Tolerancias (tolerance.ts, 78 líneas)

- BrepTolerance: linear (1e-7), angular (1e-9), parametric (1e-9)
- scaledLinearTolerance: escala al tamaño del modelo
- 	olerantSign, 	olerantEquals: primitivas con banda muerta

#### Topología (topology.ts, 480 líneas)

- Recorridos O(1): halfEdgeDestination, halfEdgeSegment, loopHalfEdges, loopVertices, loopPoints
- Consultas: faceOuterLoop, faceInnerLoops, edgeFaces, edgeIsBoundary, vertexOutgoingHalfEdges, vertexEdges
- Geometría derivada: newellNormal (Newell no los 2 primeros vértices), faceGeometricNormal, faceCentroid, facePlanarity, planarFaceArea, planarBodyVolume (divergencia), planarBodyArea
- Euler-Poincaré: eulerCounts con anillos interiores R = loops − faces
- Conectividad: faceComponents, connectedComponentCount
- Utilidades: cloneBody, translateBody (incluye superficies portadoras), edgeDihedralAngle

#### Construcción de cuerpos (body-builder.ts, 279 líneas)

- uildBody: construye B-rep desde puntos + FaceSpecs, cose gemelas, detecta aristas repetidas
- BodyBuilder: constructor incremental con soldadura de vértices por rejilla espacial (27 celdas vecinas)
- ssignShells: reparte caras en cáscaras por conectividad real
- everseBody: invierte todas las normales
- odyToFaceSpecs: descompone cuerpo en specs reconstruibles

#### Primitivas (primitives.ts, 203 líneas)

- makeBox: caja AABB, V=8, E=12, F=6
- makeBoxWithThroughHole: caja con agujero pasante rectangular, V=16, E=24, F=10, G=1
- makeTetrahedron, makePrism: prisma con agujeros opcionales
- ttachPlanarSurfaces: adjunta plano portador a cada cara plana

#### Superficies (surfaces.ts, 577 líneas)

- Cinco superficies analíticas: plane, cylinder, cone, sphere, torus
- Parametrizaciones documentadas con fórmulas explícitas
- Evaluación: surfacePoint, surfaceNormal, surfaceDerivatives (1ª y 2ª derivada)
- Proyección: surfaceProject — cerrada para analíticas, Newton con rejilla de arranque para NURBS
- Intersección recta-superficie: surfaceLineIntersect — cerrada para analíticas (cuadrática/cuártica), Newton 3x3 para NURBS
- Periodicidad: surfaceIsPeriodicU (cyl/cone/sphere/torus), surfaceIsPeriodicV (solo toro)

#### NURBS (nurbs.ts, 348 líneas)

- indSpan (A2.1), asisFunsDerivatives (A2.3), racionalización (A4.4) — siguiendo Piegl & Tiller
- 
urbsCurveDerivatives, 
urbsSurfaceDerivatives hasta orden arbitrario
- 
urbsPlanePatch: parche bilineal (1x1)
- makeNurbsSurface: constructor con validación de dimensiones
- **Estado:** Evaluación, normales, derivadas, proyección e intersección con recta — todo implementado y probado

#### Perfiles 2D (profile.ts, 251 líneas)

- 
ormalizeProfile: convención CCW exterior, CW agujeros, limpia repetidos
- offsetPolygon con uniones a inglete y detección de colapso
- pointInPolygon (cruce de rayo), pointInProfile
- circleProfile con corrección de área sqrt(theta/sin(theta))
- egularPolygon, ectangle

#### Triangulación (triangulate2d.ts, 223 líneas)

- Ear clipping con puentes para agujeros (algoritmo de Eberly)
- Degradación graceful: corta el vértice "menos malo" si no hay orejas

#### Operaciones de modelado

**Extrusión** (extrude.ts, 220 líneas):
- extrudeProfile: con ángulo de desmoldeo, marco opcional
- evolveProfile: con ángulo parcial, segmentos configurables, corrección de lateralidad
- Volúmenes exactos: extrudeVolume (Simpson), evolveVolume (factor sinΔ/Δ)

**Barrido y solevado** (sweep.ts, 271 líneas, sweep-core.ts, 232 líneas):
- sweepProfile: marcos de mínima rotación (Wang et al. 2008), corrección de torsión en caminos cerrados
- loftProfiles: remuestreo por longitud de arco, alineación de inicio de anillo, subdivisiones intermedias
- stitchSections: cosido común de las 4 operaciones, splitting de quads alabeados
- esampleRing, lignRingStart: utilidades de secciones

**Booleanas** (boolean.ts, 339 líneas, csg-bsp.ts, 300 líneas):
- ooleanUnion, ooleanDifference, ooleanIntersection, 	ryBoolean
- Pipeline: triangulación → BSP → soldadura → curación de uniones en T → validación
- BSP: Naylor/csg.js, manejo de coplanarios por orientación, epsilon escalado al modelo
- **Limitación declarada:** Solo caras planas. Rechaza caras curvas con mensaje explícito.

**Filleteado y chaflán** (fillet.ts, 299 líneas):
- chamferEdges: prisma cortante extruido a lo largo de la arista, una booleana por arista
- illetEdges: wrapper con segments=8
- chamferCutter, chamferCrossSection, chamferRemovedVolume: oráculo de volumen
- Verificación post-corte: volumen retirado vs. predicho por la sección
- **Limitaciones:** Solo aristas convexas. Rechaza aristas que comparten vértice (no hay transición esférica). Sin radio variable.

**Shell (vaciar)** (shell.ts, 640 líneas):
- shellBody: desfase de planos hacia dentro, cuerpo interior = booleanDifference(exterior, interior)
- shellLimit: espesor máximo exacto (función afín del espesor)
- odyConvexity: detección de cóncavas por diedro
- **Limitaciones:** Solo convexos. Sin cáscara abierta (remover caras). Sin espesor negativo.

**Fusión de coplanarias** (coplanar-merge.ts, 520 líneas):
- Agrupamiento por plano canónico con rejilla cuantizada
- Fusión de pares adyacentes con cadena contigua de aristas compartidas
- Disolución de vértices de grado 2 colineales
- **Limitación:** No funde por lazo interior, ni por dos cadenas separadas, ni caras curvas

**Propiedades másicas** (mass-properties.ts, 126 líneas):
- Dos caminos independientes: integración sobre caras (topología) y suma sobre malla (triangulada)
- compareMassProperties: discrepancia relativa como diagnóstico
- meshVolume, meshArea, meshCentroid por tetraedros con el origen

#### Validador de invariantes (invariants.ts, 380 líneas)

Siete familias: referencias, lazos cerrados, dos caras por arista, sentidos opuestos, normales salientes, Euler-Poincaré, caras sanas.
- alidateBody no lanza; devuelve parte completo
- ssertValidBody lanza (usado internamente por operaciones)
- Validación post-booleana en pplyBoolean

#### Teselado (tessellate.ts, 262 líneas)

- 	essellateBody: triangulación por cara con normales suavizadas (creaseAngle)
- 	essellateSurface: teselado de superficies analíticas con tolerancia de cuerda real
- segmentsForChordTolerance: fórmula de flecha (1-cos(Δ/2))

#### Interoperabilidad

| Formato | Export | Import | Archivo |
|---------|--------|--------|---------|
| STEP AP203/AP214 | exportStep | importStep (solo PLANE) | step-export.ts (246 líneas), step-import.ts (399 líneas) |
| IGES 5.3 | exportIges | importIges (solo Tipo 190) | iges.ts (381 líneas) |

- STEP: cadena completa de entidades, aristas emitidas una sola vez
- IGES: Tipo 144/190/142/102/110
- Importación: solo caras planas con aristas rectas. Rechaza superficies curvas con mensaje.

#### Cosedor de malla (mesh-stitch.ts, 536 líneas)

- Soldadura con unión-find + centroide por racimo
- Fusión de coplanarias por BFS sobre adyacencia real
- Diseño de borde para agujeros
- Manifiesto de pérdidas

#### Raíces de polinomios (poly.ts, 268 líneas)

- Cuadrática (forma estable), cúbica (trigonométrica/Viète), cuártica (Ferrari)
- Pulido Newton sobre polinomio original
- Red de seguridad numérica: muestreo + bisección + Cauchy bound

### 1.2 Solid3d (pps/web/src/lib/cad/solid3d-*.ts)

| Archivo | Líneas | Responsabilidad |
|---------|--------|-----------------|
| solid3d-build.ts | 736 | Evaluador del árbol de construcción, memoización, colocación |
| solid3d-adapter.ts | 501 | Adaptador para CAD_ENTITY_REGISTRY (2D paths, grips, snaps, propiedades) |
| solid3d-three.ts | 283 | Renderizador THREE.js (geometría, estilos visuales, líneas ocultas) |
| solid3d-section.ts | 175 | Sección plana de un sólido (SECTION) |
| solid3d-plane.ts | 61 | Transformación de plano mundo→local para corte |
| solid3d-interop.ts | 160 | Import/export STEP/IGES como entidad del documento |
| solid3d-profiles.ts | 367 | Extracción de perfiles 2D → perfil del kernel |

**Tipos de nodo soportados:** box, extrude, revolve, sweep, loft, brep, union, subtract, intersect, fillet, chamfer, slice, push

### 1.3 Pick3d (pps/web/src/lib/cad/pick3d/)

| Archivo | Líneas | Responsabilidad |
|---------|--------|-----------------|
| scene-ray.ts | 170 | Conversión rayo de escena THREE → coordenadas de dibujo |
| face-ray.ts | 289 | Rayo contra caras de un cuerpo B-rep (point-in-polygon 3D) |
| face-push.ts | 220 | Empujar cara por su normal (modelado directo) |
| edge-ray.ts | 166 | Distancia mínima rayo-segmento para designación de arista |
| solid-face-ref.ts | 250 | Huella geométrica de cara para persistencia estable |
| solid-edge-ref.ts | 136 | Huella geométrica de arista para persistencia estable |
| document-face-pick.ts | 134 | Resolución de cara/arista en todo el documento |

**Estado:** Completo y funcional. La designación de caras trabaja con rayo real (no solo Z del mundo). Las huellas geométricas con cuantización garantizan estabilidad entre evaluaciones.

### 1.4 Curvas CAD (pps/web/src/lib/cad/curve-*.ts)

| Archivo | Líneas | Responsabilidad |
|---------|--------|-----------------|
| curve-model.ts | 624 | Curva acotada canónica (segment/arc/ellipse), intersecciones parametrizadas |
| curve-edit.ts | 658 | TRIM, EXTEND, LENGTHEN sobre cualquier curva |
| curve-tessellate.ts | 205 | Teselado de arcos, elipses y splines (De Boor) |
| curve-entity-adapters.ts | 530 | Adaptadores ARC y ELLIPSE con reflexión correcta |

**Tipos de curva:** segment, arc, ellipse. NURBS/SPLINE no modelado en curve-model (null de cadEntityCurves).

### 1.5 Fillet/Chamfer 2D CAD (pps/web/src/lib/cad/cad-fillet.ts, cad-chamfer.ts)

- cad-fillet.ts (170 líneas): FILLET entre dos LINE (arco tangente)
- cad-chamfer.ts (125 líneas): CHAMFER entre dos LINE (segmento recto)
- Comparten intersectInfiniteLines y etainedRay para consistencia

---

## 2. ESTADO REAL

### Funciona completamente

| Capa | Evidencia |
|------|-----------|
| Topología half-edge | topology.ts completo, validador en invariants.ts con 7 familias |
| Vec3 / AABB | vec3.ts, vec3.spec.ts |
| Tolerancias | tolerance.ts con escala relativa |
| Superficies analíticas | surfaces.ts: evaluación, derivadas, proyección, intersección |
| NURBS | nurbs.ts: evaluación, derivadas, racionalización (Piegl & Tiller) |
| Perfiles 2D | profile.ts: normalización, offset, point-in-polygon |
| Triangulación | triangulate2d.ts: ear clipping con agujeros |
| Extrusión y revolución | extrude.ts: con desmoldeo, ángulo parcial, volúmenes exactos |
| Barrido y solevado | sweep.ts + sweep-core.ts: RMF, torsión cerrada, remuestreo |
| Booleanas (BSP) | boolean.ts + csg-bsp.ts: union/difference/intersection |
| Fillet/Chamfer 3D | fillet.ts: prisma cortante, verificación de volumen |
| Shell (convexos) | shell.ts: desfase de planos, espesor máximo exacto |
| Fusión de coplanarias | coplanar-merge.ts: agrupamiento + disolución de vértices grado 2 |
| Propiedades másicas | mass-properties.ts: dos caminos independientes |
| Validador | invariants.ts: 7 familias, no lanza, parte completo |
| STEP export/import | step-export.ts, step-import.ts |
| IGES export/import | iges.ts |
| Cosedor de malla | mesh-stitch.ts: unión-find + coplanarias |
| Evaluador de árbol solid3d | solid3d-build.ts: memoización, colocación 3D, reflexión |
| Pick3d completo | pick3d/: rayo real, huellas estables, empujón de cara |
| Curvas CAD (TRIM/EXTEND) | curve-model.ts + curve-edit.ts: segment/arc/ellipse |
| Fillet/Chamfer 2D | cad-fillet.ts, cad-chamfer.ts: solo LINE |

### Parcial / Con limitaciones declaradas

| Funcionalidad | Estado | Evidencia |
|---------------|--------|-----------|
| Booleanas con caras curvas | **Rechazadas explícitamente** | boolean.ts:84-87 — mensaje: «las booleanas de este kernel sólo operan sobre caras PLANAS» |
| Shell de cóncavos | **Rechazado explícitamente** | shell.ts:576-583 — «Desfasar los planos de un cuerpo cóncavo hacia dentro no da un cuerpo interior; todavía no está disponible» |
| Shell abierto (remover caras) | **No implementado** | shell.ts:73-76 — «cirugía topológica, no una resta booleana» |
| Fusión de coplanarias: lazos separados | **Descartado, contado** | coplanar-merge.ts:83 — «dos cadenas separadas» |
| STEP import: superficies curvas | **Solo PLANE** | step-import.ts:329-332 — rechaza B_SPLINE_SURFACE con mensaje |
| IGES import: solo Tipo 190 | **Solo planos** | iges.ts:365-367 — rechaza otros tipos con mensaje |
| Transición esférica en vértices | **No implementado** | fillet.ts:226-235 — rechaza aristas que comparten vértice |
| Redondeo de radio variable | **No implementado** | fillet.ts:28 — declarado en cabecera |
| Redondeo de aristas cóncavas | **No implementado** | fillet.ts:28, fillet.ts:213-216 — rechaza diedro > π |
| Superficies curvas portadoras en operaciones | **Solo para normales/exportación** | index.ts:30-34 — «el día que la topología deje de facetar, ya están» |
| Curvas NURBS (SPLINE) en curve-model | **No modelado** | curve-model.ts:43-45 — devuelve 
ull |
| Transformadas generales (rotación, escala) de cuerpos | **Solo traslación directa** | topology.ts:450-454 — «Una transformada general tiene que decidir qué hace con una superficie de revolución bajo escalado no uniforme» |

### Código muerto / Huecos detectados

| Hallazgo | Archivo:Linea | Detalle |
|----------|--------------|---------|
| solid3d-three.ts sin consumidor en el visor | solid3d-three.ts:36-43 | Comentario: «Hasta que ese cambio exista, este módulo queda cubierto por su spec pero sin consumidor en el visor.» |
| Reexportación deliberadamente omitida | index.ts:177-194 | coplanar-merge y shell NO se reexportan del barrel para no meter 1160 líneas en el chunk de marketing |

---

## 3. HUECOS FRENTE A AUTOCAD

### 3D — Modelado de sólidos

| Hueco | Estado actual | Complejidad estimada |
|-------|---------------|---------------------|
| Intersección exacta superficie-superficie (SSI) | No implementado. Booleanas trabajan sobre facetado. | Alta — requiere curvas de intersección exactas |
| Booleanas sobre superficies curvas | Rechazadas | Alta — depende de SSI |
| Redondeo de radio variable | No implementado | Media — el prisma cortante se adapta |
| Transición esférica (corner blend) | No implementado | Alta — geometría de blending |
| Redondeo de aristas cóncavas (añadir material) | No implementado | Media — booleana con prisma añadido |
| Shell abierto (remover caras) | No implementado | Media — cirugía topológica |
| Shell de cóncavos | No implementado | Alta — offset con recorte |
| Vaciar hacia fuera (espesor negativo) | No implementado | Baja — booleana complementaria |
| Operación PRESSPULL con caras no prismáticas | Solo prismas exactos | Alta — reconstrucción general |
| Transformadas generales de cuerpos (rotación, escala no uniforme) | Solo traslación + colocación afín | Media — destruye superficies de revolución |
| Estampar (EMBOSS) | No implementado | Alta |
| Malla booleana directa (STL ↔ B-rep) | mesh-stitch.ts existe como importación | Ya parcialmente cubierto |

### 3D — Superficies

| Hueco | Estado |
|-------|--------|
| Superficies NURBS como portadoras de caras | Evaluación completa, NO usadas en booleanas |
| Superficies de revolución exactas | Facetadas; superficies analíticas existen pero no se usan en topología |
| Superficies extruidas exactas | Facetadas |
| Superficies B-spline (loft) | Facetadas |

### Formatos de intercambio

| Hueco | Estado |
|-------|--------|
| STEP: superficies curvas en importación | Solo PLANE |
| STEP: export solo planas (sin CYLINDRICAL_SURFACE etc.) | Solo planas |
| IGES: solo Tipo 190 en importación | Solo planos |
| DWG export | No implementado (ADR-0009, import beta limitado) |

---

## 4. REDUNDANCIAS Y DEUDAS

### Redundancias

| Descripción | Archivos involucrados |
|-------------|----------------------|
| Fillet 2D (cad-fillet.ts) y fillet 3D (brep/fillet.ts) comparten lógica conceptual pero son implementaciones completamente distintas. El 2D trabaja sobre LINE del documento; el 3D sobre aristas del B-rep. | cad-fillet.ts vs brep/fillet.ts |
| intersectInfiniteLines compartida entre cad-fillet.ts y cad-chamfer.ts — buena decisión, no redundante. | cad-fillet.ts:29, cad-chamfer.ts:15 |
| Rejilla espacial para soldadura de vértices implementada tres veces: BodyBuilder.addVertex, weldPolygons en boolean.ts, y weldMeshVertices en mesh-stitch.ts. Las tres son variantes con distinto grado de transitividad. | body-builder.ts:173-208, boolean.ts:126-166, mesh-stitch.ts:188-268 |
| circleProfile en profile.ts y 	essellateArc en curve-tessellate.ts generan polígonos de círculo de formas distintas (una corrige área, otra no). | profile.ts:246, curve-tessellate.ts:33 |

### Deudas técnicas

| Deuda | Evidencia | Impacto |
|-------|-----------|---------|
| Booleanas triangulan todo el resultado | boolean.ts:33-38 — «las caras del resultado son triángulos. La cara superior de un cubo al que se le ha restado algo deja de ser "una cara"» | STEP export innecesariamente verboso, PRESSPULL designa triángulos no caras |
| Coplanar merge no cierra anillos | coplanar-merge.ts:44-47 — placa 100x100x20 con agujero baja a 12 caras en vez de 10 | Cuerpo correcto pero subóptimo |
| solid3d-three.ts sin enchufar al visor | solid3d-three.ts:36-43 | Módulo probado pero sin consumidor en producción |
| Índices de arista en nodos fillet/chamfer persistidos | solid-face-ref.ts:11-16 — «esos índices YA se están persistiendo… Basta con que alguien edite el operando para que esos números apunten a OTRA arista» | Mitigado por solid-edge-ref.ts con huellas geométricas, pero la migración completa está pendiente |
| STEP import solo entiende PLANE | step-import.ts:329-332 | No puede reimportar lo que exporta con superficies curvas (cuando se implementen) |
| NURBS como portadoras existen pero no participan en booleanas | index.ts:37-38 — «Intersección exacta superficie-superficie (SSI)» | Las superficies analíticas están completas pero inutilizadas para modelado |

---

## 5. RESUMEN EJECUTIVO

El kernel B-rep de Valle Design es un modelador **facetado** completo y bien documentado, con:

- **Topología half-edge** robusta con validador de 7 familias de invariantes
- **5 superficies analíticas** + NURBS completas como portadoras (evaluación, derivadas, proyección, intersección con recta)
- **Operaciones de modelado**: extrusión, revolución, barrido, solevado, booleanas, fillet/chamfer, shell, fusión de coplanarias
- **Interoperabilidad**: STEP e IGES (import/export de caras planas)
- **Modelado directo**: empujón de cara con rayo real, huellas geométricas estables
- **Curvas CAD**: TRIM/EXTEND/LENGTHEN unificado sobre segment/arc/ellipse

**La decisión arquitectónica central** —facetas en vez de superficies exactas— permite booleanas sobre todo el catálogo a costa de no tener superficies curvas exactas en el resultado. Las superficies analíticas y NURBS están completas como portadoras, esperando el día que la topología deje de facetar.

**El hueco más grande frente a AutoCAD** es la intersección exacta superficie-superficie (SSI), que bloquea booleanas sobre superficies curvas y, por extensión, la mayoría de las operaciones avanzadas que distinguen un modelador de sólidos profesional.
