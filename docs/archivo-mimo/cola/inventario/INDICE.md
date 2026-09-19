# ÍNDICE DEL INVENTARIO — Valle Design (VALLECAD)

Fecha: 2026-09-15 · Medido contra el árbol en `claude/noche-mimo-razones-para-pagar`

## Mapa del repositorio

| Área | Archivos | Estado general | Archivo inventario |
|---|---|---|---|
| Motor de comandos | 231 | FUNCIONAL (300 cmds, 112 módulos, lazy load) | motor-comandos.md |
| Kernel B-rep y geometría | 65 | FUNCIONAL (kernel faceted, booleanas planar, fillet convexo) | brep-geometria.md |
| 3D y visor | 46 | FUNCIONAL (OrbitControls,5 estilos, picking, walkthrough) | 3d-visor.md |
| Dibujo 2D y anotación | 54 | FUNCIONAL (7 tipos cota, HATCH, bloques, capas, mleader) | dibujo-2d-anotacion.md |
| Arquitectura y BIM | 31 | FUNCIONAL (muro paramétrico, huecos, locales, cuadros) | arquitectura-bim.md |
| Eléctrico/Mecánico/MEP/Plant | 56 | FUNCIONAL (IEC 60617, ISO 286, NOM-001, 10 servicios MEP) | electrico-mecanico-mep.md |
| GIS, raster, interop, papel | 67 | FUNCIONAL (DXF completo, DWG beta, paper space, shapefile) | interop-papel-colaboracion.md |
| UI del estudio, API, paquetes | 65+ | FUNCIONAL (ribbon 300 cmds, i18n,15 primitivas UI, API NestJS) | ui-api-paquetes.md |
| Scripts, E2E, gobernanza | 108 scripts | FUNCIONAL (13 gates CAD,182 E2E, rúbrica309 pts) | scripts-e2e-gobernanza.md |

## Qué está hecho por toolset

### 3D (base)
- ✅ B-rep kernel faceted con half-edge topology
- ✅ Booleanas (UNION/SUBTRACT/INTERSECT) — solo planar
- ✅ Extrude/Revolve/Sweep/Loft
- ✅ Fillet/Chamfer — solo aristas convexas
- ✅ Shell/Offset — solo cuerpos convexos
- ✅ STEP/IGES import/export (solo planar)
- ✅ GLB export
- ✅ 5 estilos visuales (wireframe, hidden, shaded, shaded+edges, xray)
- ✅ Picking 3D (cara/arista/entidad)
- ✅ Walkthrough WASD
- ⚠️ 3DMOVE/3DROTATE registrados, specs corregidos
- ❌ 3DSCALE, 3DALIGN, MIRROR3D, 3DARRAY
- ❌ SECTIONPLANE, LIVESECTION
- ❌ ViewCube interactivo, NavWheel
- ❌ PBR, sombras, luces
- ❌ Superficies NURBS como caras (solo como portadores)
- ❌ SSI (surface-surface intersection)

### Architecture
- ✅ Muro paramétrico (eje+grosor+altura, uniones L/T, vanos booleanos)
- ✅ Huecos alojados (puertas/ventanas, catálogo mexicano, GC transaccional)
- ✅ Detección de locales (grafo plano,3 áreas)
- ✅ Cuadros de cantidades (muros, huecos, locales)
- ⚠️ Grosor asimétrico no implementado
- ❌ Estilos de muro, muros curvos/inclinados, muros compuestos
- ❌ Secciones automáticas desde modelo

### Mechanical
- ✅6 familias de normalizados (tornillería, rodamientos, chavetas, perfiles)
- ✅ BOM auto-actualizable
- ✅ Símbolos de soldadura ISO 2553, acabado ISO 1302
- ✅ Tolerancias ISO 286 (IT5-IT11)
- ✅ Marcos GD&T con14 características
- ❌ Shaft generator, gear design, FEA, sheet metal

### Electrical
- ✅12 símbolos IEC 60617
- ✅ Numeración de conductores
- ✅ Revisión contra NOM-001-SEDE
- ✅ Etiquetado de componentes
- ❌ Cable routing, harness, PLC/ladder, panel schedule

### MEP
- ✅10 servicios con capas propias
- ✅ Trazado 3D con montantes automáticos
- ✅ Cuadro de instalaciones con medición 3D
- ✅ Detección de choques contra estructura
- ❌ Routing automático, accesorios como objetos, cálculo de cargas térmicas

### Map 3D / GIS
- ✅ Shapefile/GeoJSON import con georreferencia
- ✅ Reproyección CRS/UTM
- ❌ WMS/WFS, análisis espacial, DEM

### Plant 3D
- ✅ Números de línea, rutas 3D con sólido facetado
- ✅ Isométricos con lista de materiales
- ✅ Detección de choques exacta segmento-caja
- ❌ Catálogos ASME/API, spec editor, nozzle management, ortométricos

### Raster Design
- ✅ Decodificador PNG/BMP
- ✅ Vectorización con Otsu/Zhang-Suen/Douglas-Peucker
- ❌ JPEG/WebP/GIF/TIFF, OCR real, edición raster

## Huecos priorizados (top 20)

1. **SSI (surface-surface intersection)** — bloquea booleanas curvas
2. **Variable-radius fillet** — operación 3D diaria
3. **BREAK @punto** — comando2D más usado en AutoCAD
4. **Dynamic Input** — productividad en línea
5. **ViewCube interactivo** — navegación3D estándar
6. **3DSCALE/3DALIGN/MIRROR3D/3DARRAY** — operaciones3D básicas
7. **SECTIONPLANE/LIVESECTION** — documentación arquitectónica
8. **PBR + luces** — presentación para arquitectos
9. **FIELD (campos automáticos)** — textos dinámicos
10. **GD&T completo** — mecánica
11. **Cable routing** — eléctrico
12. **Routing automático MEP** — instalaciones
13. **Concave edge fillet** — booleanas reales
14. **VIEWBASE/VIEWSECTION** — documentación desde3D
15. **Patrones .pat de usuario** — hachurados
16. **Gradient hatch** — presentación
17. **Filtros de capa** — organización
18. **NavWheel/SteeringWheel** — navegación3D
19. **RENDER a imagen** — salida
20. **STLOUT/3DPRINT** — fabricación

## Contradicciones con la bitácora

| Tarea | Bitácora decía | Código muestra |
|---|---|---|
| T4 | HECHA | Parcial: edge picking existe pero FILLETEDGE/CHAMFEREDGE con aristas designadas no está conectado |
| T5/T14 | HECHA | CSV sin unidad estaba roto (corregido esta sesión) |
| T7 | HECHA | Tope polar se restaura antes de update() (vista-1 abierto) |
| T9 | YA ESTABA | PERSPECTIVE sin lectores (corregido icono+summary, pero cámara no cambia) |
| T22 | HECHA | Aristas planas filtradas pero sin spec (geometria-3 abierto) |

## Archivos de inventario

- `motor-comandos.md` — 195 líneas
- `brep-geometria.md` — 21,575 bytes
- `3d-visor.md` — 231 líneas
- `dibujo-2d-anotacion.md` — 23,259 bytes
- `arquitectura-bim.md` — 281 líneas
- `electrico-mecanico-mep.md` — 258 líneas
- `interop-papel-colaboracion.md` — 374 líneas
- `ui-api-paquetes.md` — 401 líneas
- `scripts-e2e-gobernanza.md` — 382 líneas
