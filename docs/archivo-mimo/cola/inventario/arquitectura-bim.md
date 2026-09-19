# Inventario: Arquitectura y BIM

> Fecha: 2026-09-07 | Area: `apps/web/src/lib/cad/ | Archivos leidos: 31

---

## 1. Que existe

### 1.1 Muro parametrico (wall)

| Componente | Archivo | Lineas | Estado |
|---|---|---:|---|
| Definicion de entidad (esquema 6) | cad-entities-v6.ts | 73 | **Completo** |
| Geometria derivada de planta | wall-geometry.ts | 99 | **Completo** |
| Uniones automaticas L/T/colineal | wall-joins.ts | 469 | **Completo** |
| Huecos alojados (vanos) | wall-openings.ts | 448 | **Completo** |
| Volumen 3D (B-rep) | wall-solid.ts | 226 | **Completo** |
| Visualizacion Three.js | wall-solid-three.ts | 311 | **Completo** |
| Diagnostico de vanos | wall-solid-diagnostics.ts | 57 | **Completo** |
| Adaptador de entidad | wall-entity-adapter.ts | 373 | **Completo** |
| Materiales (5 acabados) | wall-materials.ts | 71 | **Completo** |
| Solape de union (descuento cantidades) | wall-junction-overlap.ts | 144 | **Completo** |

**Entidad parametrica:** Si, plenamente. CadWallEntity persiste un eje (start/end), 	hickness y height. El contorno de planta se deriva en wall-geometry.ts, el volumen 3D en wall-solid.ts, las uniones en wall-joins.ts. Nunca se persiste el poligono.

**Evidencia de funcionalidad:**
- wall-geometry.ts:34-48 — wallFootprint() calcula las 4 esquinas del contorno en planta a partir del eje y grosor, en sentido antihorario.
- wall-joins.ts:325-341 — wallJoins() calcula uniones L (inglete), T (empalme) y colineal como funcion pura de las recetas.
- wall-solid.ts:122-128 — wallSolidBodyLocal() genera el cuerpo B-rep con vanos recortados por booleana (ooleanDifference del kernel B-rep).
- wall-entity-adapter.ts:236-372 — Adaptador completo: paths, hit-test, grips (start/end/midpoint), snaps, propiedades (lectura/escritura), transformaciones.

**Test coverage (10 spec files):**
- wall-solid.spec.ts (494 lineas) — Volumen exacto, ray-tracing de vanos, vanos invalidos.
- wall-geometry.spec.ts (152 lineas) — Contorno, area, rayado.
- wall-joins.spec.ts (297 lineas) — L, T, colineal, miter limit.
- wall-openings.spec.ts (491 lineas) — Alojamiento, mover muro, borrar muro, GC transaccional.
- wall-entity-adapter.spec.ts (99 lineas) — Propiedades, material.
- wall-materials.spec.ts (74 lineas) — Paleta, generic fallback.
- wall-solid-three.spec.ts (348 lineas) — Escena Three.js, rayo en diagonal.
- wall-takeoff-solid-parity.spec.ts (165 lineas) — Paridad cantidades vs. solido real.

---

### 1.2 Huecos alojados (opening: puertas y ventanas)

| Componente | Archivo | Lineas | Estado |
|---|---|---:|---|
| Definicion de entidad (esquema 7) | cad-entities-v7.ts | 103 | **Completo** |
| Adaptador de entidad | opening-entity-adapter.ts | 328 | **Completo** |
| Geometria derivada (jambas, simbolos) | wall-openings.ts | 448 | **Completo** (compartido con wall) |
| Catalogo de medidas normalizadas | `rchitecture-openings-catalog.ts | 205 | **Completo** |

**Entidad:** CadOpeningEntity (cad-entities-v7.ts:70-95). No tiene coordenadas propias: vive en el marco del eje de su muro anfitrión (hostId + position). Persiste kind (door/window), width, height, sill, swing, hinge, symbolBlock?.

**Evidencia de funcionalidad:**
- opening-entity-adapter.ts:200-217 — Paths derivados: jambas del vano + simbolo (puerta con hoja/arco, ventana con vidrio/carpinteria) o bloque del estudio.
- opening-entity-adapter.ts:297-323 — Transformacion: MOVE no mueve el hueco (viaja con el muro), escala si escala, reflexion cambia la mano.
- wall-openings.ts:110-134 — wallOpeningFit(): valida que el hueco cabe horizontalmente en el anfitrion.
- wall-openings.ts:156-169 — wallOpeningVerticalFit(): valida encaje vertical.
- wall-openings.ts:298-339 — wallOpeningSymbolPaths(): simbolo de fabrica (puerta con arco de barrido, ventana con carpinteria).
- wall-openings.ts:419-427 — orphanedOpeningIds(): GC transaccional — borra huecos huerfanos en el mismo lote.

**Catalogo normalizado** (`rchitecture-openings-catalog.ts):
- 5 puertas (P-060 a P-100), 4 ventanas (V-060x040 a V-180x120).
- Medidas en milimetros, conversion a unidad del documento.
- Marca compartida con im-schedule.ts via openingMark() — una sola marca, no dos vocabularios.
- Clave cerrada: lo que no esta se rechaza nombrando los validos (cadOpeningTypeRefusal, linea 196).

**Test coverage:**
- wall-openings.spec.ts (491 lineas) — Alojamiento, GC, simbolo, bloques.
- `rchitecture-openings-catalog.spec.ts (362 lineas) — Marca unificada, equivalencia elegir/teclear, unidades, rechazo.

---

### 1.3 Deteccion de locales y cuadro de areas

| Componente | Archivo | Lineas | Estado |
|---|---|---:|---|
| Deteccion de locales (grafo plano) | im-schedule.ts | 645 | **Completo** |
| Areas util/construida/por muro | im-areas.ts | 193 | **Completo** |
| Cuartos poligonales (geometria pura) | polygon-room.ts | 131 | **Completo** |
| Volumen de piso/cielorraso/cubierta | oom-solid.ts | 72 | **Completo** |
| Visualizacion Three.js de losas | oom-solid-three.ts | 147 | **Completo** |

**Deteccion de locales** (im-schedule.ts:407-600): algoritmo de recorrido de caras de grafo plano. Los ejes de muro se particionan en nudos (puntos donde otro muro termina sobre el eje), se construyen semi-aristas salientes por angulo, y cada ciclo cerrado es una cara. Areas positivas = locales, area negativa = contorno exterior.

**Tres areas por local** (im-areas.ts):
- **A ejes**: area del anillo sin desplazar.
- **Util** (cadRoomClearArea, linea 166): cada lado entra medio grosor hacia dentro.
- **Construida** (cadRoomBuiltArea, linea 183): perimetricos salen medio grosor hacia fuera, medianeros se quedan en el eje. La suma de construidas = huella construida de la planta (propiedad verificada en specs).

**Evidencia:**
- im-schedule.ts:537-558 — Cada local lleva su anillo (ing), wallIds, area a ejes, area util, area construida, area de muro.
- im-schedule.ts:352-365 — 
ameCadRoom(): el nombre del local sale del TEXT/MTEXT que cae dentro de su anillo (rótulo existente en el plano).
- im-schedule.ts:581-583 — Numeracion geometrica (de mayor a menor area), estable.
- im-areas.ts:124 — Paralelos consecutivos detectados: area declarada ausente, no aproximada.
- oom-solid.ts:45-56 — `architecturalSlabBodyLocal(): extrusion de anillo para piso/cielorraso/cubierta.
- oom-solid.ts:67-72 — conservativeWallTop(): altura de apoyo = la menor entre los muros (nunca atraviesa un muro corto).

**Test coverage:**
- im-schedule.spec.ts (578 lineas) — Areas de locales, marcas, problemas, huella.
- im-areas.spec.ts (316 lineas) — Util/construida vs. numeros a mano, identidad de huella, planta en L.
- polygon-room.spec.ts (75 lineas) — Area, perimetro, centroide, convexidad, orientacion.
- oom-solid.spec.ts (176 lineas) — Volumen exacto, anillo exterior, entradas degeneradas.
- oom-solid-three.spec.ts (230 lineas) — Escena Three.js, permutacion de ejes.

---

### 1.4 Tabla de cantidades (take-off)

| Componente | Archivo | Lineas | Estado |
|---|---|---:|---|
| Cuadro de areas + tabla de carpinteria | im-schedule.ts | 645 | **Completo** |
| Descuento de solapes de union | wall-junction-overlap.ts | 144 | **Completo** |

**uildCadBimSchedule()** (im-schedule.ts:194-324): produce en una sola pasada:
- **Cantidades de muro** agrupadas por capa+grosor: longitud de eje, superficie de paramento (con descuento de huecos), volumen (con descuento de solapes de union).
- **Tabla de puertas y ventanas** agrupadas por marca+antepecho: tipo, dimensiones, cantidad.
- **Cuadro de areas**: cada local con sus tres areas, perimetro y muros.
- **Contorno exterior** (exteriorRing) y **huella construida** (uiltArea).
- **Problemas**: huecos huerfanos, que no caben, areas no calculables.

**Descuento de solapes** (wall-junction-overlap.ts:92-144): cadWallJunctionOverlaps() calcula el volumen compartido en L/T/X con clipping convexo (Sutherland-Hodgman) y lo reparte a partes iguales. Evita doble cobro (~0.6 m3 en una vivienda de 4 esquinas).

**Test coverage:**
- wall-takeoff-solid-parity.spec.ts (165 lineas) — Gate de paridad: volumen del cuadro vs. volumen del solido 3D real. Brecha medida: 1.39% (documentada, con techo).

---

### 1.5 Clasificacion de locales (arquitectura)

| Componente | Archivo | Lineas | Estado |
|---|---|---:|---|
| Clasificador de uso de local | `rchitecture.ts | 580 | **Completo** |
| Resumen de take-off arquitectonico | `rchitecture.ts | 580 | **Completo** |

**CadRoomUseType** (`rchitecture.ts:33-62): 25 tipos de uso — 16 arquitectonicos mexicanos (recamara, bano, cocina, sala, comedor, cochera, etc.) + 9 heredados de industrial (smt, assembly, warehouse, etc.). Los industriales se conservan por compatibilidad con documentos existentes.

**Clasificador** (oomUseTypeFromTags, linea 304): acepta etiquetas explicitas (use:recamara, oom-use:bano) y adivinanza por texto. Pliega acentos (ecámara = ecamara, año = ano). Los aliases cubren sinonimos (dormitorio, habitacion, garaje, WC, etc.).

**uildCadArchitectureTakeoff()** (linea 472): resumen de areas por capa, por uso de local, por departamento.

**Test coverage:** `rchitecture.spec.ts (240 lineas) — Capas, clasificacion en ambos idiomas, vocabulario arquitectonico vs. industrial, take-off.

---

### 1.6 Importacion de puertas desde estudio

| Componente | Archivo | Lineas | Estado |
|---|---|---:|---|
| Puerta de importacion unificada | document-import-door.ts | 71 | **Completo** |

**T-16**: el estudio y el tablero usan la misma funcion de validacion (alidateImportFile). Antes el estudio tenia su propia validacion que SIEMPRE rechazaba DWG aunque la beta estuviera encendida. Ahora ambos dan el mismo veredicto. El fondo del estudio solo pinta DXF de texto; formatos admitidos por el tablero pero no pintables dicen por donde entran.

**Test coverage:** document-import-door.spec.ts (115 lineas) — Tabla de casos con beta encendida/apagada.

---

### 1.7 Guardian de frontera BIM

| Componente | Archivo | Lineas | Estado |
|---|---|---:|---|
| Spec guardian | im-claim-boundary.spec.ts | 106 | **Completo (guardian activo)** |

Vigila que ninguna orden, alias, funcion LISP ni rutina entregada use la palabra "BIM" en superficie visible al usuario. Los nombres de archivo y comentarios pueden decir BIM; lo que el usuario ve o teclea, no. Razon: el producto tiene cuadros de areas y tablas de cantidades derivados del modelo, pero NO es un modelo de informacion de construccion (sin IFC, sin disciplinas coordinadas, sin deteccion de interferencias).

---

### 1.8 Cuadro MEP (instalaciones)

| Componente | Archivo | Lineas | Estado |
|---|---|---:|---|
| Cuadro de instalaciones | mep-schedule.ts | 95 | **Completo** |

Mide longitudes 3D de tuberias/cableado por servicio y tamano, cuenta montantes y codos, y agrupa equipos por simbolo. No es de esta area exactamente (es MEP, no arquitectura), pero alimenta la superficie de cantidades del modelo.

---

## 2. Estado real: resumen por componente

| Componente | Estado | Evidencia |
|---|---|---|
| Muro parametrico (planta) | **Funciona, probado** | 99-494 lineas de specs, geometria analitica |
| Muro parametrico (3D + vanos) | **Funciona, probado** | Ray-tracing, volumen exacto, B-rep booleano |
| Uniones L/T/colineal | **Funciona, probado** | Inglemite, empalme, continuacion; miter limit |
| Huecos alojados | **Funciona, probado** | GC transaccional, mover/borrar muro, simbolos |
| Catalogo de puertas/ventanas | **Funciona, probado** | Marca unificada, 9 tipos, rechazo explicito |
| Materiales de muro | **Funciona, probado** | 5 acabados + generic fallback bit-exacto |
| Deteccion de locales | **Funciona, probado** | Grafo plano, 3 areas, paralelos detectados |
| Cuadro de areas + cantidades | **Funciona, probado** | 578 lineas de specs, identidad de huella |
| Descuento de solapes | **Funciona, probado** | Sutherland-Hodgman, paridad con solido 3D |
| Clasificacion de locales | **Funciona, probado** | 25 usos, acentos, aliases, industrial conservado |
| Losas 3D (piso/cubierta) | **Funciona, probado** | B-rep prism, ray-tracking, escena Three.js |
| Guardian frontera BIM | **Funciona, probado** | Activo, vigila ordenes, aliases, LISP, rutinas |

No se encontro codigo muerto ni componentes rotos. Todos los archivos producidos tienen al menos un importador fuera de si mismos.

---

## 3. Huecos frente a AutoCAD Architecture

| Capacidad ACA | Estado en Valle Design | Notas |
|---|---|---|
| **Muro parametrico por eje** | **Implementado** | Eje + grosor + altura, contorno derivado |
| **Union automatica L/T** | **Implementado** | Inglete, empalme, colineal; solo 4 vertices por contorno |
| **Hueco alojado (puerta/ventana)** | **Implementado** | Sin coordenadas propias, viaja con el muro |
| **Simbolo de puerta/arco** | **Implementado** | Fabrica + bloques del estudio |
| **Cuadro de areas automatico** | **Implementado** | Grafo plano, 3 tipos de area |
| **Tabla de cantidades de muro** | **Implementado** | Capa+grosor, descuento de huecos y solapes |
| **Tabla de carpinteria** | **Implementado** | Marca P-xxx/V-xxx, agrupada |
| **Catalogo normalizado** | **Implementado** | 5 puertas, 4 ventanas |
| **Clasificacion de locales** | **Implementado** | 25 usos, mexicano + industrial |
| Grosor asimetrico (izq/der/cara) | **No implementado** | cad-entities-v6.ts:25-27: "llegara como campo opcional" |
| Estilos de muro | **No implementado** | cad-entities-v6.ts:34-36: altura explicita sera override |
| Muro con desfase del eje | **No implementado** | Solo reparto simetrico |
| Union con mas de 4 vertices | **No implementado** | wall-joins.ts:20-22: "ola 1, los casos que pedirian vertices extra degradan" |
| Union X (cruce de 4 muros) | **No implementado** | wall-joins.ts:286: "tres o mas muros en el mismo punto... ola 2" |
| T con rotura de cara del pasante | **No implementado** | wall-joins.ts:233: solo el que llega se recorta; el pasante no se toca |
| Puertas de dos hojas/corredizas | **No implementado** | `rchitecture-openings-catalog.ts:45-46: "no hay puertas de dos hojas" |
| Ventanales piso a techo (sill=0) | **No implementado** | `rchitecture-openings-catalog.ts:47 |
| Muro cortado por plano (seccion) | **No implementado** | Solo planta y 3D, sin secciones automaticas |
| Etiquetas automaticas de muro | **No implementado** | Los locales se nombran por rótulos existentes, no se generan |
| Schedule personalizable/parametrico | **No implementado** | Tabla fija, no hay interfaz de usuario para configurar |
| Tags/propiedades BIM (IFC) | **No implementado** | Guardian activo: no se anuncia como BIM |
| Muro inclinado/curvo | **No implementado** | wall-solid.ts:23: "un muro nunca se inclina" |
| Muro compuesto (capas de material) | **No implementado** | Solo un material? discreto, no un sandwich |
| Grip para deslizar hueco por eje | **No implementado** | opening-entity-adapter.ts:264: grips vacios; falta firma con documento |

---

## 4. Redundancias y deudas tecnicas

### 4.1 Brecha de paridad volumetrica (documentada, con techo)

wall-takeoff-solid-parity.spec.ts:11-23 documenta que el volumen del cuadro de cantidades sub-factura ~1.39% respecto al solido 3D real. Causa: el inglete de esquina extiende la cara exterior pero im-schedule.ts solo resta el solape interior sin sumar la extension exterior equivalente. Es una **decision de negocio** (que extension se cobra), no un bug; el gate existe para que la brecha nunca crezca en silencio. Backlog P1.

### 4.2 `rchitecture.ts conserva vocabulario industrial

`rchitecture.ts:51-61 conserva 9 tipos de uso industrial (smt, `ssembly, warehouse, etc.) por compatibilidad con documentos guardados. Esto **no es deuda** — esta explicitamente justificado (lineas 26-31). El check scripts/cad/check-no-industrial-domain.mjs impide que el vocabulario industrial se expanda.

### 4.3 Funcion signedArea duplicada

polygon-room.ts:20-29 y im-schedule.ts:624-635 ambas implementan signedArea con la formula del cordador. Son para tipos distintos (CadVec2[] vs GraphEdge[]) y no comparten interfaz, pero la logica es identica.

### 4.4 Snaps de contorno unido ocultos

wall-entity-adapter.ts:292-296 — Los snaps de las esquinas del contorno unido estan comentados (ocultos) porque CadSnapProvider no recibe document?. Sin documento no se pueden calcular las uniones, y las esquinas del contorno base no coinciden con las dibujadas (error de ~125 mm en esquinas). Marcado como "fix-or-hide".

### 4.5 Sin grips para huecos alojados

opening-entity-adapter.ts:264 — grips: () => []. Los grips requieren documento para situar el hueco, pero CadGripProvider no lo recibe. Se edita por propiedades (position, width). La cabecera del archivo lo documenta como limite conocido.

### 4.6 openingMark asume milimetros

`rchitecture-openings-catalog.spec.ts:26-31 — La marca literal del catalogo solo coincide en documentos en milimetros; en metros o pies la marca del cuadro sale como P-000x000. Defecto documentado de im-schedule.ts, anterior al catalogo.

---

## 5. Observaciones de diseno

1. **Todo es derivado, nada se persiste doble.** El contorno de planta, las uniones, los vanos, el volumen 3D, los locales y las areas se calculan cada vez de la receta. El documento canonical no cambia de esquema. Esto es coherente y bien ejecutado.

2. **Fail-closed consistente.** Vanos que no caben no cortan (en planta ni en 3D), locales con lados paralelos declaran area ausente, huecos huerfanos se retiran en el mismo lote, materiales desconocidos caen al generico. No hay perdida silenciosa.

3. **Separacion limpia wall/opening.** El muro parte sus caras; el hueco dibuja las jambas y el simbolo. Borrar el hueco devuelve la cara continua sin codigo. Borrar el muro se lleva el hueco via GC transaccional. El contrato esta bien dibujado.

4. **Una sola marca.** El catalogo y el cuadro de cantidades usan la misma funcion openingMark(). No hay dos vocabularios para la misma puerta.

5. **3D como extension natural.** Piso, cielorraso y cubierta son la misma primitiva (`architecturalSlabBodyLocal) con distinto anillo y distinta cota. El anillo exterior del cuadro de areas alimenta la cubierta. Los muros con vanos recortados generan B-rep con booleana del kernel.
