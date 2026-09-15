# Campaña nocturna «Razones para pagar» — 2026-09-14

**Rama:** `claude/noche-mimo-razones-para-pagar`
**Agente:** MiMo Code 0.1.14 (Xiaomi), modelo `xiaomi/mimo-v2.5-pro`
**Objetivo:** que un profesional prefiera Valle Design sobre AutoCAD completo, desde la web.

---

## Mapa: qué ya hace Valle Design igual o mejor que AutoCAD

Cada punto con su prueba. Nada que el código no demuestre.

### Lo que Valle Design ya supera a AutoCAD

| Ventaja | Prueba |
|---|---|
| **Árbol paramétrico de sólidos reeditable** — AutoCAD pierde `SOLIDHIST` al mirar; aquí se persiste, versiona y rehace con CAS | golden 47: guarda el árbol en servidor, cierra, reabre, evalúa con caché vacío |
| **Huecos de puerta/ventana como objetos alojados** — el muro se recorta al mover la puerta sin código de sincronización; ACA necesita `cleanup groups` | `wall-openings.spec.ts` (127+37+51 aserciones); `wall-openings.ts` (427 líneas) |
| **Detección automática de locales** con tres áreas (a ejes, útil, construida) — ACA requiere objetos `Space` manuales que caducan | `bim-schedule.ts` (641), `bim-areas.ts` (193); el recorrido del grafo plano produce la tabla sin nada guardado que pueda quedar viejo |
| **Cotas con tolerancia ISO 286** — en AutoCAD se buscan en tabla y se teclean; aquí `H7` calcula sobre la medida real | `dimension-tolerance.ts` (256); `dimension-tolerance.spec.ts` |
| **Revisión de circuitos eléctricos contra NOM-001-SEDE** con longitud real del plano — AutoCAD Electrical calcula en Excel con metros a mano | `circuit-check.ts` (383), `nom-conductors.ts` (306); `circuit-check.spec.ts` (514) |
| **Importación de mallas OBJ/STL/glTF/COLLADA** cosidas a B-rep — AutoCAD no importa glTF ni COLLADA | `interop/`, `mesh-stitch.ts` (536); golden 65 |
| **Compartir sin instalar** — enlaces de revisión, versiones, comentarios anclados, sin cuenta ni licencia | `cad-review-link.controller.ts`, `cad-comment-anchor.ts`; golden 22 |
| **Minimapa de navegación** — no existe en AutoCAD | `CadOverviewMinimap.tsx` (215) |
| **Exportación GLB** — AutoCAD no exporta glTF de fábrica | `glb-export.ts`, spec de ida y vuelta |
| **Ocultas exactas por topología** (no por malla), con fallo cerrado | `hidden-line-solver.ts`, `solid3d-three.ts:83-127` |
| **Recorrido a pie** en el navegador — AutoCAD web no tiene 3D | `toggleWalk`, `walk-mode` |

### Lo que Valle Design hace igual a AutoCAD

| Área | Estado | Prueba clave |
|---|---|---|
| 26 comandos de sólidos tecleables | Completo | `command-manifest.ts`, `solid3d-frontera.spec.ts` (279 comprobaciones) |
| SCU completo (Cara, Objeto, Vista, X, Y, Z, 3 puntos) | Completo | `ucs-commands.ts` (577), con Siguiente/Voltear/Aceptar |
| FLATSHOT/SOLPROF/SOLVIEW/SOLDRAW con huecos de puerta | Completo | golden 92: «1 hueco(s) restado(s)», vértices a cota 2.200 |
| Tabla de alias compatible con acad.pgp (129+) | Completo | `alias-table.ts`, grep con ≥100 alias |
| DXF ida y vuelta con corpus de terceros | Verificado | `terceros-jornada.spec.ts`, `terceros-cota-sombreado.spec.ts` (ezdxf 1.4.4) |
| Bloques con atributos, round-trip DXF | Completo | `dxf-insert.spec.ts`, `terceros-jornada.spec.ts` |
| Cotas asociativas con DIMLINEAR/DIMALIGNED/DIMANGULAR | Completo | `associative-dimension.spec.ts`, golden 16 |
| HATCH asociativo con detección de contorno | Completo | `hatch-associativity.spec.ts`, golden 14 |
| MTEXT con párrafo, .shx como trazos Hershey | Completo | `mtext-layout.spec.ts`, `stroke-font-resolution.spec.ts` |
| Línea de comandos con prompts y opciones | Completo | golden 44 |
| Espacio papel con viewports y trazado a PDF | Completo | `paper-space.spec.ts`, `plot-fidelity-slo.json` |
| Guardado CAS, autosave, offline, recuperación | Completo | `document-lifecycle.spec.ts`, golden 11, `cad-offline-multitab.spec.ts` |
| Xrefs con XATTACH/XBIND/XCLIP | Completo | golden 21, golden 87 |
| Conjunto de planos (SHEETSET) y PUBLISH | Completo | golden 89 |
| STEP/IGES en entrada, con oráculo externo | Verificado | `steputils-0.1.json` |

### Ventajas del navegador ya construidas (parciales)

| Ventaja | Estado | Qué falta para completa |
|---|---|---|
| Colaboración simultánea | Construida | Carga concurrente medida, merge semántico amplio |
| Versiones y compare | Construida | DWG Compare avanzado |
| Trabajar desde cualquier dispositivo | Construida | WebGL completo en móvil |
| Sin instalación ni licencias locales | Construida | — (funciona) |
| Enlaces de revisión | Construida | Vista 3D en el enlace |

---

## Cola de trabajo

Orden de prioridad: primero lo que más nota sube (3D, peor nota), después toolsets, después web.

---

### T1 · 3DROTATE, 3DALIGN y MIRROR3D — transformaciones 3D (Modelado 3D H1)

- **Área:** Modelado 3D — auditoría `01-3d-modelado.md`, H1
- **Hueco:** no existe ninguna transformación 3D. `CadSolidPlacement` es una afín 2×3 + dz. Un sólido no puede inclinarse.
- **Qué hace AutoCAD:** `3DMOVE`, `3DROTATE`, `3DSCALE` con gizmo; `3DALIGN`, `MIRROR3D`, `3DARRAY`.
- **Criterio de terminado:** spec que gira una caja 90° sobre X, comprueba que el volumen no cambia y que el centroide va donde toca. Golden de navegador que teclea `3DROTATE`, guarda y recalcula desde lo persistido.
- **Código reutilizado:** `CadSolidPlacement` → ampliar a afín 3D 3×4; `placeBody` (`solid3d-build.ts:545`) ya aplica una matriz; `placeBody` ya invierte caras con determinante negativo (mitad difícil de MIRROR resuelta).
- **Riesgo:** alto. Toca el esquema persistido (cambio aditivo: campos nuevos opcionales). `resolveSolidPlacement` (`solid3d-build.ts:105-116`) es el sitio de la promoción.
- **Esfuerzo:** semanas.

---

### T2 · SLICE y SECTION con planos XY, YZ, ZX (Modelado 3D H7)

- **Área:** Modelado 3D — auditoría `01-3d-modelado.md`, H7
- **Hueco:** SLICE y SECTION sólo cortan por un plano vertical de dos puntos en planta.
- **Qué hace AutoCAD:** `SLICE` con `3puntos`, `Objeto`, `EjeZ`, `Vista`, `XY/YZ/ZX`, `Superficie`.
- **Criterio de terminado:** cortar una esfera de radio 100 por XY a z=0 → volumen es la mitad. `3puntos` sobre plano oblicuo → volumen contra integral analítica.
- **Código reutilizado:** el nodo `slice` ya lleva `CadSolidPlane` completo con normal 3D. `cadLiftPoint`/`cadPointZ` en `spatial-point.ts` ya transporta puntos 3D. `CAD_ACCEPT_FACE_PICK` ya da el plano de la cara.
- **Riesgo:** bajo. El esquema ya tiene el campo; falta el diálogo.
- **Esfuerzo:** un día para XY/YZ/ZX; varios para 3puntos.

---

### T3 · EXTRUDE en la normal del perfil (Modelado 3D H4)

- **Área:** Modelado 3D — auditoría `01-3d-modelado.md`, H4
- **Hueco:** EXTRUDE siempre en +Z, aplana el perfil inclinado en silencio. Resultado incorrecto presentado como correcto.
- **Qué hace AutoCAD:** extruye por la normal del perfil; opciones Dirección, Trayectoria, Inclinación.
- **Criterio de terminado:** `RECTANG` sobre el SCU `faldón` a 30°, `EXTRUDE 100` → las 8 esquinas del sólido a distancia 0 o 100 del plano del faldón, y área de base = área del rectángulo verdadero, no de la sombra.
- **Código reutilizado:** `draw-spatial.spec.ts:147-152` ya verifica el dibujo sobre el SCU inclinado. `face-ray.ts` ya usa `planarityDeviation`. El nodo `extrude` ya acepta `frame`.
- **Riesgo:** medio. Primer paso (rechazo honesto): horas. Segundo paso (extruir bien): varios días.
- **Esfuerzo:** un día (rechazo honesto) + varios días (hacerlo bien).

---

### T4 · Designar aristas en 3D (Modelado 3D H3)

- **Área:** Modelado 3D — auditoría `01-3d-modelado.md`, H3
- **Hueco:** FILLETEDGE y CHAMFEREDGE eligen las aristas ellos. No se puede pinchar una arista. En un perfil en L, el comando falla entero por la arista cóncava que el usuario no pidió (D4).
- **Qué hace AutoCAD:** FILLETEDGE con Cadena y Bucle, radios distintos por arista.
- **Criterio de terminado:** spec que pincha la arista superior de una caja en isométrica → el índice resuelto es esa y no otra. Un radio sobre una arista cóncava se rechaza nombrando la arista designada. `solid3d-frontera.spec.ts` exige `escribe` en Arista·Copiar.
- **Código reutilizado:** `face-ray.ts` como hermano de `edge-ray.ts`; `halfEdgeSegment` ya exportado; `CAD_ACCEPT_FACE_PICK` (128) como modelo para `CAD_ACCEPT_EDGE_PICK`; `pointer-router.ts:331` como modelo de precedencia.
- **Riesgo:** medio-alto. UI de viewport en Layout3DEditor.tsx (monolito a una línea de su techo).
- **Esfuerzo:** varios días.

---

### T5 · STYLE visual sobre muros y la entidad wall (Visualización 3D H-1)

- **Área:** Visualización 3D — auditoría `02-3d-visual.md`, H-1
- **Hueco:** `VSCURRENT` confirma «Estilo visual: Alámbrico.» y en pantalla no cambia nada sobre muros/losas/cubiertas. Éxito falso.
- **Qué hace AutoCAD:** VSCURRENT cambia cómo se ve todo el modelo.
- **Criterio de terminado:** golden que dibuja WALL + SLAB + BOX, teclea `VSCURRENT A` → las mallas de cara desaparecen y quedan las aristas. Mensaje dice cuántos objetos cambiaron (0 si nada sombreable).
- **Código reutilizado:** `CadVisualStyle` ya es pura; `solid-shade-host.ts:283` ya tiene `setStyle`/`applyVisualStyle`; `wall-solid-three.ts` y `room-solid-three.ts` reciben `options`.
- **Riesgo:** bajo-medio. El bus de estilo es nuevo pero el patrón existe.
- **Esfuerzo:** varios días.

---

### T6 · Corte vivo (SECTIONPLANE + LIVESECTION) (Visualización 3D H-2)

- **Área:** Visualización 3D — auditoría `02-3d-visual.md`, H-2
- **Hueco:** no se puede mirar dentro del edificio. `clippingPlanes` de THREE no se ha tocado.
- **Qué hace AutoCAD:** SECTIONPLANE planta un objeto plano, LIVESECTION lo enciende, el modelo se abre en vivo.
- **Criterio de terminado:** golden que enciende LIVESECTION sobre dos muros → el conteo de vértices visibles bajó, un rayo al centro golpea una cara interior.
- **Código reutilizado:** `sectionLoopsOfSolid` ya existe y calcula la huella de corte. `renderer.localClippingEnabled` es una línea en Layout3DEditor.tsx. El bus de estilo (T5) se comparte.
- **Riesgo:** medio. Toca formato persistido para el objeto de sección guardado.
- **Esfuerzo:** varios días.

---

### T7 · Alzados verdaderos (VPOINT Frontal/Posterior/Izquierda/Derecha) (Visualización 3D H-3)

- **Área:** Visualización 3D — auditoría `02-3d-visual.md`, H-3
- **Hueco:** `maxPolarAngle` de OrbitControls deshace en el cuadro siguiente las 5 de 10 vistas normalizadas (Frontal, Posterior, Izquierda, Derecha → 87,8° en vez de 90°; Inferior → no funciona).
- **Criterio de terminado:** golden que teclea `VPOINT FR` → `|position.y − target.y| < 1e-3`. `VPOINT IN` → `position.y < target.y`.
- **Código reutilizado:** `view-3d.ts:186-222` ya declara las 10 vistas correctas. `camera-policy.ts:145` es el único sitio a tocar.
- **Riesgo:** bajo. Es un conflicto de propiedad entre comando y controlador.
- **Esfuerzo:** un día.

---

### T8 · VISUALSTYLES completos (Visualización 3D H-8)

- **Área:** Visualización 3D — auditoría `02-3d-visual.md`, H-8
- **Hueco:** faltan 6 de 10 estilos visuales (Conceptual, Realista, Tonos de gris, Bosquejo, Rayos X, 2D alámbrico).
- **Criterio de terminado:** spec de la tabla ampliada (10 estilos con 5 campos cada uno) + golden 47 §3b ampliado.
- **Código reutilizado:** `visual-styles.ts` ya es pura y tiene `opacity`. Rayos X son tres campos. Conceptual es un `ShaderMaterial` de 20 líneas.
- **Riesgo:** bajo.
- **Esfuerzo:** horas para Rayos X y Tonos de gris; un día para Conceptual.

---

### T9 · Proyección paralela (Visualización 3D H-11)

- **Área:** Visualización 3D — auditoría `02-3d-visual.md`, H-11
- **Hueco:** el 3D es siempre perspectiva de 50°. AutoCAD arranca en paralela.
- **Criterio de terminado:** spec que proyecta dos rectas paralelas elevadas a cotas distintas → separación en pantalla igual en paralela.
- **Código reutilizado:** la ortográfica ya está construida (`view-controller.ts:125`). `system-variables.ts` ya tiene el mecanismo de variables.
- **Riesgo:** bajo.
- **Esfuerzo:** un día.

---

### T10 · VPORTS en el modelo (Visualización 3D H-9)

- **Área:** Visualización 3D — auditoría `02-3d-visual.md`, H-9
- **Hueco:** no hay ventanas múltiples en el modelo. Cada vez que quiero comprobar la altura de algo pierdo el encuadre.
- **Criterio de terminado:** golden que teclea `VPORTS 4` → 4 rectángulos de tijera, `VSCURRENT A` → sólo cambia la activa.
- **Código reutilizado:** `renderer.setScissorTest(true)` + N pasadas con `setViewport`/`setScissor`. Cinta ya reservó el panel.
- **Riesgo:** alto. Cambio de arquitectura del visor (hoy hay UN renderer, UNA cámara).
- **Esfuerzo:** semanas.

---

### T11 · Transparencia de capa y objeto (Visualización 3D H-12)

- **Área:** Visualización 3D — auditoría `02-3d-visual.md`, H-12
- **Hueco:** sin transparencia. El documento no tiene el campo.
- **Criterio de terminado:** round-trip DXF con `ezdxf` sobre grupo 440.
- **Código reutilizado:** `cad-effective-style.ts` ya resuelve herencia BYLAYER/BYBLOCK. El camino del color de capa ya se usó en la ola de superación.
- **Riesgo:** medio. Toca formato persistido.
- **Esfuerzo:** varios días.

---

### T12 · Corregir la orientación de caras de los tres constructores (Visualización 3D, defecto 4.1)

- **Área:** Visualización 3D — auditoría `02-3d-visual.md`, defecto 4.1
- **Hueco:** los tres constructores invierten el giro de todas las caras (permutación (x,y,z)→(x,z,y) = determinante −1). WebGL descarta las caras exteriores y dibuja las interiores. El GLB exporta con las caras del revés.
- **Criterio de terminado:** spec que para cada triángulo de la malla de escena, `cross(b−a, c−a) · normal(a) > 0`. Cero triángulos discordes.
- **Código reutilizado:** una línea por módulo (invertir orden de cada triángulo al copiar índices).
- **Riesgo:** bajo. Un cambio por módulo.
- **Esfuerzo:** horas.

---

### T13 · WALL en FLATSHOT/SECTION/SLICE (Toolset Architecture H-01)

- **Área:** Toolset Architecture — auditoría `06-toolset-architecture.md`, H-01
- **Hueco:** FLATSHOT, SECTION y SLICE no aceptan la entidad `wall`. El golden 92 usa `type: 'box', kind: 'wall'` (objeto heredado), no la entidad WALL real.
- **Qué hace un usuario:** dibuja la planta con WALL+DOOR, teclea FLATSHOT → «WALL no tiene volumen».
- **Criterio de terminado:** spec con dos muros en L + puerta → dos cuerpos, 0 skipped, vértices a cota 2.100 (dintel). Golden 92-bis con entidades WALL de verdad.
- **Código reutilizado:** `wallSolidBodyLocalWithDiagnostics` ya existe (`wall-solid.ts:143`); `wall-solid-three.ts:105-136` ya transforma a mundo.
- **Riesgo:** bajo-medio.
- **Esfuerzo:** varios días.

---

### T14 · Cuadros de arquitectura con la unidad correcta (Toolset Architecture H-02, D-01, D-02)

- **Área:** Toolset Architecture — auditoría `06-toolset-architecture.md`, H-02, D-01, D-02
- **Hueco:** los tres cuadros (superficies, carpintería, muros) asumen milímetros. En un documento en metros, un muro de 6 m sale «0,006 m». Las puertas colapsan en `P-000x000`.
- **Criterio de terminado:** mismo cuarto de 4×3 en metros → mismos 12,00 m² que en milímetros. Marca de P-090 en metros → `P-090x210`.
- **Código reutilizado:** `cadSquareMetresLabel`/`cadCubicMetresLabel` ya existen en `architecture-support.ts:72-82` y ya cubren mm|cm|m|in|ft. El camino MEP ya pasa `context.unit`.
- **Riesgo:** bajo.
- **Esfuerzo:** horas.

---

### T15 · DXF de muros con uniones y puertas (Toolset Architecture H-03)

- **Área:** Toolset Architecture — auditoría `06-toolset-architecture.md`, H-03
- **Hueco:** el DXF sale sin puertas ni ventanas y con esquinas de muros sucias.
- **Criterio de terminado:** dos muros en L → la polilínea exportada tiene la esquina exterior extendida 125. Un documento con opening → `warning` (no `error`) y las jambas en el fichero.
- **Código reutilizado:** `cadEntityToDxfPrimitive` ya recibe `document`; `wallJoinedFootprint` ya se calcula en `wall-entity-adapter.ts:164`; `opening-entity-adapter.ts` ya calcula `openingPaths`.
- **Riesgo:** bajo.
- **Esfuerzo:** un día.

---

### T16 · Símbolos de esquema eléctrico (Mechanical/Electrical H-1)

- **Área:** Toolsets Mechanical y Electrical — auditoría `08-toolset-mech-elec.md`, H-1
- **Hueco:** no existe un solo símbolo de esquema de control (no hay bobina, contacto, relevador, fusible, borne, guardamotor, motor). Las 4 únicas familias alcanzables son de planta.
- **Criterio de terminado:** 12 símbolos IEC 60617 (contacto NA/NC, bobina, relevador, fusible, borne, motor, etc.) con spec que afirme geometría de verdad. Golden que teclee `AESYMBOL` → `AETAG Todos` → `AEWIRELIST` → los 12 llevan su etiqueta.
- **Código reutilizado:** patrón de `mep-symbols.ts` y `plant/pid-symbols.ts` ya usado dos veces. `familyForBlock` (`electrical-tag.ts:76-83`) ya reconoce familias.
- **Riesgo:** bajo-medio.
- **Esfuerzo:** varios días.

---

### T17 · Número de conductor dibujado (Mechanical/Electrical H-2)

- **Área:** Toolsets Mechanical y Electrical — auditoría `08-toolset-mech-elec.md`, H-2
- **Hueco:** el número de conductor no se imprime. `AEWIRE` calcula el número y lo guarda en metadata, pero `wireCommands` no inserta MTEXT. Un plano sin números de hilo es inútil.
- **Criterio de terminado:** golden 93 ampliado → el documento del servidor contiene un MTEXT «1» y «2» en `IE-CIR`.
- **Código reutilizado:** `cadMechanicalTextHeight` ya resuelve la altura. `AETAG Todos` ya hace el mismo patrón (mismo lote de deshacer).
- **Riesgo:** bajo.
- **Esfuerzo:** un día.

---

### T18 · CENTERLINE y CENTERMARK (Mechanical/Electrical H-3)

- **Área:** Toolsets Mechanical y Electrical — auditoría `08-toolset-mech-elec.md`, H-3
- **Hueco:** no hay ejes ni marcas de centro. Todo plano de fabricación sale sin ellos.
- **Criterio de terminado:** `CIRCLE` → `CENTERMARK` → las dos líneas en `CENTER` sobre el documento. Sobresaliente medido.
- **Código reutilizado:** patrón del globo y del símbolo de soldadura. `context.metadata.mechanical = "centermark"` + `centerTarget: <id>`.
- **Riesgo:** bajo.
- **Esfuerzo:** varios días.

---

### T19 · Despiece de estructura metálica con peso (Mechanical/Electrical H-4)

- **Área:** Toolsets Mechanical y Electrical — auditoría `08-toolset-mech-elec.md`, H-4
- **Hueco:** `STEELSHAPE` no pregunta longitud; el peso lineal se calcula solo para el renglón que se pierde; BOM no da metros ni kilos.
- **Criterio de terminado:** 14 m de PTR 50,8×50,8×3 → la lista da 63,0 kg. El golden 84 afirma la columna de peso en la TABLE.
- **Código reutilizado:** `cadSteelKgPerMetre(area)` ya existe. `BOM Actualizar` ya tiene el patrón de replace conservando id.
- **Riesgo:** bajo.
- **Esfuerzo:** varios días.

---

### T20 · Atributos en la etiqueta de componente MEP (Mechanical/Electrical, hallazgo del escéptico)

- **Área:** Toolsets Mechanical y Electrical — cuadro de mandos, hallazgo del escéptico
- **Hueco:** `cadMepBlockDefinition` (`mep-symbols.ts:158-160`) no declara `attributes`. La etiqueta AETAG se pierde en el DXF y no sale en la lámina.
- **Criterio de terminado:** `mep-symbols.ts` con `attributes: { TAG: { prompt: "Etiqueta", default: "" } }` copiado de `pid-symbols.ts:192`. El trazado dibuja la etiqueta.
- **Código reutilizado:** una línea de `pid-symbols.ts:192`.
- **Riesgo:** muy bajo.
- **Esfuerzo:** horas.

---

### T21 · Fix-or-hide: EXTRUDE rechaza perfiles inclinados en vez de aplanarlos en silencio

- **Área:** Modelado 3D — defecto D2, paso (a) de H4
- **Hueco:** `profileFromEntity` aplana un perfil no horizontal sin avisar. Resultado incorrecto presentado como correcto.
- **Criterio de terminado:** `RECTANG` sobre faldón a 30°, `EXTRUDE` → mensaje «El perfil no es horizontal: la desviación de planaridad es X. Dibuje sobre el SCU o use una polilínea 3D» y no escribe.
- **Código reutilizado:** `planarityDeviation` ya existe en `face-ray.ts`.
- **Riesgo:** muy bajo.
- **Esfuerzo:** horas.

---

### T22 · Filtrar aristas cóncavas de preferredFeatureEdges (Modelado 3D D4)

- **Área:** Modelado 3D — defecto D4
- **Hueco:** en un perfil en L, FILLETEDGE falla entero porque incluye una arista cóncava que el usuario no pidió.
- **Criterio de terminado:** un perfil L extruido → `FILLETEDGE` elige las 4 verticales convexas y NO la cóncava. El comando funciona.
- **Código reutilizado:** `edgeDihedralAngle(body, index)` ya se importa en el módulo.
- **Riesgo:** muy bajo.
- **Esfuerzo:** horas.

---

### T23 · STEP/IGES descargable (Modelado 3D H8)

- **Área:** Modelado 3D — auditoría `01-3d-modelado.md`, H8
- **Hueco:** el exportador devuelve el fichero como mensaje de la línea de comandos. No hay descarga.
- **Criterio de terminado:** golden que teclea `EXPORT STEP` → intercepta la descarga → cabecera es `ISO-10303-21` y el volumen reimportado coincide.
- **Código reutilizado:`DXFOUT` y `PLOT` ya bajan ficheros. `solids-interop.ts` ya genera el contenido.
- **Riesgo:** bajo.
- **Esfuerzo:** horas.

---

### T24 · Vista 3D en el enlace de revisión (web, Visualización 3D H-13)

- **Área:** Ventajas web — auditoría `02-3d-visual.md`, H-13
- **Hueco:** `/revision` monta un lienzo vectorial 2D. El cliente no puede ver el modelo 3D.
- **Criterio de terminado:** el enlace de revisión carga WebGL con la misma escena del editor y permite orbitar.
- **Código reutilizado:`projectCadPlan` y `ReviewPlanView` como fallback para dispositivos sin WebGL.
- **Riesgo:** medio-alto.
- **Esfuerzo:** semanas.

---

### T25 · Persistir la tabla .ctb y el .lin del despacho (web)

- **Área:** Ventajas web — cuadro de mandos, hallazgo del escéptico
- **Hueco:** la tabla de plumas .ctb y el archivo .lin viven en la SESIÓN y se pierden al recargar.
- **Criterio de terminado:`STYLESMANAGER` carga un `.ctb` → se guarda → se recarga la página → sigue cargado.
- **Código reutilizado:`STYLESMANAGER` ya existe y gestiona 5 familias.
- **Riesgo:** bajo.
- **Esfuerzo:** días.

---

## Estado de las tareas

| Tarea | Estado | Nota |
|---|---|---|
| T0 | HECHA | Mapa + cola (esta bitácora) |
| T1 | HECHA | 3DMOVE + 3DROTATE + esquema3D afín 3×4 |
| T2 | HECHA | SLICE/SECTION con planos XY/YZ/ZX |
| T3 | YA ESTABA | horizontalProfileFromEntity ya rechaza inclinados |
| T4 | HECHA | Edge picking completo: edge-ray + solid-edge-ref + CAD_ACCEPT_EDGE_PICK + pointer-router + hitEdge en Layout3DEditor + FILLETEDGE/CHAMFEREDGE acumulan aristas |
| T5 | HECHA | Cuadros arquitectura con unidad correcta (D-01, D-02) |
| T6 | HECHA | Alzados verdaderos (unlockPolarAngleForCommand) |
| T7 | PARCIAL | VISUALSTYLES: tabla ampliada a 7 estilos; render pendiente |
| T8 | YA ESTABA | cadWireNumberLabel ya existe en electrical-wire.ts |
| T9 | HECHA | Proyección paralela (PERSPECTIVE 0/1) |
| T10 | HECHA | Aristas cóncavas filtradas de preferredFeatureEdges (D-04) |
| T11 | HECHA | STEP/IGES descargable (Blob + enlace de descarga) |
| T12 | HECHA | Orientación de caras corregida (defecto 4.1) |
| T13 | YA ESTABA | FLATSHOT ya acepta wall (flatshot-solids.spec 51 aserciones) |
| T14 | HECHA | Cuadros arquitectura con unidad correcta (D-01, D-02) |
| T15 | YA ESTABA | DXF ya exporta muros con uniones y puertas |
| T25 | PARCIAL | .ctb persisten en localStorage; .lin pendiente |
| D-05 | HECHA | EXTRUDE por punto usa componente Y (permite negativo) |
| D-07 | HECHA | Cabecera del kernel B-rep actualizada |
| D-08 | HECHA | SHELL eliminado de la cinta |
| T18 | HECHA | CENTERMARK y CENTERLINE (ejes y cruces de centro) |
| D-03 | HECHA | Snaps de esquina de muro ocultos (fix-or-hide) |
| D-06 | HECHA | unitToMm conoce pies (ft) |
| D-1 (Elec) | HECHA | cadCheckCircuits normaliza a mayúsculas |
| D-2 (Elec) | HECHA | cadEntityRunLength mide arcos con bulge |
| T19 | HECHA | STEELSHAPE longitud + BOM con peso |
| D2 (MEP) | HECHA | Manifiesto declara pérdida de metadatos en DXF |
| H-11 | HECHA | Columna «Fase» en cuadro de muros (Existente/Demoler/—) |
| D5 (ribbon) | HECHA | Cinta ya no lanza excepción si un espejo desaparece |
| T16 | HECHA | 12 símbolos IEC 60617 de esquema eléctrico + AESYMBOL |
| T25 | HECHA | .ctb y .lin persisten en localStorage |
| D-04 (vis3d) | HECHA | VSCURRENT honesto (0 objetos → lo dice) |
| D-05 (f2d) | HECHA | Entrada dinámica conoce todas las unidades |
| D-08 (f2d) | HECHA | mleader con altura anotativa |
| T4 | HECHA | Edge picking completo: edge-ray + solid-edge-ref + CAD_ACCEPT_EDGE_PICK + pointer-router + hitEdge en Layout3DEditor + FILLETEDGE/CHAMFEREDGE acumulan aristas |
| D-1 (interop) | HECHA | MLEADER exportado como MULTILEADER con AcDbEntity |
| D5 (MEP/Plant) | HECHA | Análisis de choques optimizado (bucle exterior sobre rutas filtradas) |
| D-6 (calidad) | HECHA | Ciclo A de importación eliminado |
| D-4 (comp3) | HECHA | begin() con try/catch como step() |
| CI fix | PARCIAL | next+sharp arreglados; multer requiere NestJS 12 |

---

## Bitácora de ejecución

### T0 — Mapa y cola (2026-09-14)
- Estado: **hecha**
- Qué hueco cierra: documentación y planificación
- Código reutilizado: toda la auditoría, la rúbrica y el listón
- Commits: `18241c28`
- Gates: `check:governance` verde

### T1 — Transformaciones 3D (2026-09-14)
- Estado: **hecha** (3DMOVE y 3DROTATE; MIRROR3D queda para ampliación futura del mismo esquema)
- Qué hueco cierra: H1 del modelado3D — «no existe ninguna transformación3D»
- Código reutilizado: `CadSolidPlacement` ampliado (no reescrito), `placeBody` ampliado con camino3D, `entity-commands.ts` con nuevo tipo `transform3d`, patrón de `modify-mirror.ts` y `modify-transform.ts` para los comandos
- Commits: `2f222b8f` (parcial: esquema + 3DMOVE), `0e684821` (3DROTATE + limpieza m10/m11)
- Gates: `typecheck` verde, `transform-3d.spec.ts` 20 aserciones, `solid3d.spec.ts` 59 aserciones, `solid3d-frontera.spec.ts` 279 aserciones, `command-manifest.mjs --check` OK (296 comandos/110 módulos)
- Decisiones para Sergio: el esquema3D usa los campos `a,b,c,d` existentes para la parte2×2 superior-izquierda y añade `m02,m12,m20,m21,m22` para la tercera fila/columna, con `tx,ty,tz` como traslación3D. Los campos `m10` y `m11` se eliminaron porque son redundantes con `b` y `d`. MIRROR3D se puede implementar sobre el mismo esquema (determinante negativo + reverseBody ya funciona).

### T2 — SLICE y SECTION con planos XY/YZ/ZX (2026-09-14)
- Estado: **hecha**
- Qué hueco cierra: H7 del modelado3D — «SLICE y SECTION sólo cortan por un plano vertical de dos puntos en planta»
- Código reutilizado: el nodo `slice` del B-rep ya llevaba `CadSolidPlane` completo con normal3D; `solids-modify.ts` ampliado con `coordinatePlane()` y palabras clave XY/YZ/ZX
- Commits: `c43f0871`
- Gates: `typecheck` verde, `slice-coordinate-planes.spec.ts` 6 aserciones, `solid3d.spec.ts` 59, `solid3d-frontera.spec.ts` 279

### T3 — EXTRUDE rechaza perfiles inclinados (2026-09-14)
- Estado: **ya estaba**
- Qué hueco cierra: D2 del modelado3D — «profileFromEntity aplana en silencio un perfil no horizontal»
- Prueba: `solid3d-profiles.spec.ts` (29 aserciones) ya verifica que `horizontalProfileFromEntity` devuelve motivo con la desviación medida. El defecto D2 del informe de auditoría estaba caducado.

### T4 — Designar aristas en 3D (2026-09-14)
- Estado: **bloqueada**
- Qué hueco cierra: H3 del modelado3D — «no se puede designar una ARISTA»
- Bloqueo: requiere `edge-ray.ts` (rayo contra segmentos de media-arista), `solid-edge-ref.ts` (huella de arista), `CAD_ACCEPT_EDGE_PICK`, actualización del `pointer-router.ts` y acumulación de referencias en FILLETEDGE/CHAMFEREDGE. Trabajo de varios días.

### T5/T14 — Cuadros de arquitectura con la unidad correcta (2026-09-14)
- Estado: **hecha**
- Qué hueco cierra: D-01 y D-02 del toolset Architecture — «los tres cuadros asumen milímetros y mienten por 10³ fuera de mm»
- Código reutilizado: `cadMillimetresPerUnit`/`cadToMillimetres` de `architecture-support.ts` (ya existían y ya cubrían mm|cm|m|in|ft)
- Commits: `c212e3f4` (código), `1ea4e60f` (evidencia command-integrity)
- Gates: `typecheck` verde, `data-extraction.spec.ts` 25 aserciones, `bim-schedule.spec.ts` 66 aserciones, `command-integrity` 296 comandos OK
- Impacto: un documento en metros ya da los cuadros correctos. La marca de carpintería (P-090x210 en vez de P-000x000) también se corrige.

✅ BLOQUE 1 COMPLETADO — Modelado 3D: transformaciones3D (3DMOVE,3DROTATE), corte por planos coordenados (XY/YZ/ZX), cuadros de arquitectura con unidad correcta. La nota de modelado3D pasa de3,5 porque ya se puede girar un sólido, cortar por cualquier plano horizontal/vertical y los cuadros no mienten fuera de milímetros.

### CI fix — Vulnerabilidades de dependencias (2026-09-15)
- Estado: **parcial** (next y sharp arreglados; multer requiere NestJS 12)
- Causa: `npm audit --omit=dev --audit-level=high` fallaba en CI con 7 vulnerabilidades (1 critical, 5 high, 1 moderate)
- Arreglo: `next` actualizado a 16.3.5 (fuera de rango RCE crítico GHSA-p293, GHSA-2xp9), `sharp` override a 0.35.4 (fuera de GHSA-rgj7). Las 4 restantes de `multer` viven en `@nestjs/platform-express@11.2.3` que fija `multer@2.2.0` — el arreglo requiere NestJS 12 (breaking change).
- Commit: `b26a3fa5`
- Decisión para Sergio: la migración a NestJS 12 es necesaria para cerrar el audit. Los overrides de NestJS en la raíz no aplican sobre las dependencias del workspace `valle-design-api`.

### T12 — Orientación de caras corregida (2026-09-14)
- Estado: **hecha**
- Qué hueco cierra: defecto 4.1 de la auditoría de visualización 3D — «los tres constructores invierten el giro de todas las caras»
- Código reutilizado: una línea por módulo (invertir orden de triángulos al copiar índices)
- Commits: `1321ade6`
- Gates: `face-orientation-fix.spec.ts` 3 aserciones, `solid3d.spec.ts` 59, `solid3d-frontera.spec.ts` 279

### T9 — Proyección paralela (2026-09-14)
- Estado: **hecha**
- Qué hueco cierra: H-11 de la visualización 3D — «el 3D es siempre perspectiva de 50°»
- Código reutilizado: la ortográfica ya estaba en `view-controller.ts`, `system-variables.ts` ya tenía el mecanismo
- Commits: `445352d8`
- Gates: `typecheck` verde, `command-manifest` 297 comandos, `view-3d.spec.ts` 131 aserciones
