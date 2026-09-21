# Inventario: Eléctrico, Mecánico, MEP y Plant

> Fecha: 2026-09-05 · Área: `apps/web/src/lib/cad/`
> Método: lectura directa de todos los archivos coincidentes con los patrones solicitados (56 archivos leídos).
> Todo en español (México).

---

## 1. ELÉCTRICO

### 1.1 Qué existe

| Capacidad | Archivos | Estado |
|-----------|----------|--------|
| **Símbolos IEC 60617** (12 símbolos: contacto NA/NC, bobina, fusible, seccionador, guardamotor, borne, piloto, motor) | `electrical/schematic-symbols.ts` (266 líneas) | **Funciona** — geometría completa desde primitivas, familias IEC (K, F, M, Q, X, H), capa `IE-ESQ` |
| **Orden AESYMBOL** (coloca símbolo de esquema) | `engine/commands/electrical-schematic-symbol.ts` (104 líneas) | **Funciona** — flujo completo keyword → punto → rotación |
| **Numeración de conductores (AEWIRE)** | `electrical/wire-numbering.ts` (212 líneas), `engine/commands/electrical-wire.ts` (413 líneas) | **Funciona** — numeración desde el dibujo, detección de repetidos, rótulo visible en plano (`electrical-wire.ts:171-208`) |
| **Conexiones DE/A** (de qué componente a qué componente) | `electrical/wire-connections.ts` (337 líneas) | **Funciona** — tolerancia derivada de 10 mm ISO 128, medición en planta, declaración explícita del criterio |
| **Tabla de conductores NOM-001-SEDE** (ampacidad, resistencia, caída de tensión, conductor pequeño Art. 240-4(D), Tabla 250-122) | `electrical/nom-conductors.ts` (306 líneas) | **Funciona** — 13 calibres AWG, fórmulas monofásica/trifásica, capacidades estándar Art. 240-6(A), tierra de equipos completa |
| **Revisión contra NOM (AECHECK)** | `electrical/circuit-check.ts` (401 líneas), `engine/commands/electrical-circuit.ts` (263 líneas) | **Funciona** — verifica ampacidad, caída de tensión, protección estándar, tierra física; límites declarados |
| **Datos de circuito (AECIRCUIT)** | `engine/commands/electrical-circuit.ts` | **Funciona** — estampa protección/tensión/fases en todos los conductores de un circuito |
| **Etiquetas de componente (AETAG)** | `electrical/device-tags.ts` (172 líneas), `engine/commands/electrical-tag.ts` (278 líneas) | **Funciona** — 8 familias (M, PB, LT, CT, SW, TB, TR, SN), etiquetado individual o masivo |
| **Cuadro de cargas** | `data-extraction/circuit-schedule-table.ts` (102 líneas) | **Funciona** — 11 columnas incluyendo tierra mínima y veredicto NOM |
| **Evidencia de atributos en DXF y PDF** | `electrical/electrical-attributes-dxf.spec.ts` (106 líneas), `electrical/electrical-attributes-plot.spec.ts` (143 líneas) | **Funciona** — ATTDEF/ATTRIB en bytes del DXF, etiqueta en bytes del PDF |

### 1.2 Estado real (detalle)

- **Código muerto**: Ninguno detectado. Todos los módulos tienen importadores verificables.
- **Huecos documentados por el propio código**: `nom-conductors.ts:42-58` declara explícitamente que no es memorial de cálculo: sin corrección por temperatura, sin factor de agrupamiento, sin 125 % de carga continua, sin llenado de tubo. La tierra se calcula de la protección (Tabla 250-122), no se coteja contra conductor de tierra dibujado.
- **Conductores como polilíneas**: Diseño deliberado (`wire-numbering.ts:17-29`). No hay entidad nueva `wire`; el conductor es una POLYLINE con metadatos (`context.metadata`). Esto permite que MOVE, TRIM, COPY y PLOT funcionen sin adaptación.
- **Tablas de la NOM transcritas de acceso público**: `nom-conductors.ts:17-58` declara procedencia y pide cotejo contra norma impresa.

### 1.3 Huecos frente a AutoCAD Electrical

| AutoCAD Electrical | Valle Design | Gap |
|-------------------|-------------|-----|
| Bibliotecas de símbolos industriales (AB, Siemens, etc.) | 12 símbolos IEC 60617 para control | **Parcial**: catálogo mínimo para tablero de control; falta PLC, variador, termopar, sensor analógico |
| Listas de cables (cable routing) | No existe | **Ausente**: no hay canalización cableada ni rutas de cable como objetos |
| Paneles de alambre (wire harness) | No existe | **Ausente** |
| Reportes de BOM eléctrico | Cuadro de cargas NOM funciona | **Parcial**: falta BOM de materiales eléctricos (canalización, charola, cajas de registro) |
| Escaleras lógicas (ladder) | No existe | **Ausente**: los símbolos están pero no hay editor de ladder |
| Integración con PLC/IO | No existe | **Ausente** |

---

## 2. MECÁNICO

### 2.1 Qué existe

| Capacidad | Archivos | Estado |
|-----------|----------|--------|
| **Tornillería ISO** (M6–M24: tornillo ISO 4017, tuerca ISO 4032, rondana ISO 7089) | `mechanical-parts.ts:72-186` | **Funciona** — geometría en alzado/planta, escalado a unidad del documento |
| **Rodamientos ISO 15** (series 62xx y 63xx, 26 designaciones) | `mechanical-parts.ts:188-255`, `mechanical-parts-catalog.ts:37-91` | **Funciona** — representación simplificada ISO 8826-1 |
| **Chavetas ISO 773 / DIN 6885** (forma A, 16 anchos de eje) | `mechanical-parts.ts:257-297`, `mechanical-parts-catalog.ts:93-180` | **Funciona** — t1/t2 del cuñero en denominación, longitudes de serie con aviso |
| **Perfiles de acero** (PTR, OC, LI, CPS, IPR — designación IMCA) | `mechanical-parts.ts:299-475` | **Funciona** — secciones paramétricas, área mm², peso lineal |
| **Orden STDPART** (coloca normalizado) | `engine/commands/mechanical-parts.ts:108-280` | **Funciona** — 5 familias, validación de métrica, escalado a unidad |
| **Orden STEELSHAPE** (coloca perfil) | `engine/commands/mechanical-parts.ts:282-358` | **Funciona** — sección + longitud opcional, peso calculado |
| **Símbolo de soldadura** (ISO 2553 / AWS A2.4 — 9 tipos, 3 lados) | `mechanical-symbols.ts:115-247` | **Funciona** — geometría completa con flecha, línea de referencia, símbolo, tamaño, longitud, "todo alrededor", "en obra", cola |
| **Símbolo de acabado superficial** (ISO 1302) | `mechanical-symbols.ts:253-316` | **Funciona** — básico/mecanizado/prohibido, Ra, 7 direcciones de estrías |
| **Globo (BALLOON)** | `mechanical-symbols.ts:78-113`, `engine/commands/mechanical-annotate.ts:87-173` | **Funciona** — flecha, directriz, círculo, número, asociación a bloque |
| **Lista de materiales (BOM)** | `mechanical-bom.ts` (174 líneas), `engine/commands/mechanical-annotate.ts:175-288` | **Funciona** — cuenta INSERTs MECH- y globos, tabla con marca, Actualizar con mismo id |
| **Tolerancia de cota** (simétrica, desviación, límites, ajuste ISO 286) | `dimension-tolerance.ts` (256 líneas), `engine/commands/dimension-tolerance.ts` (203 líneas) | **Funciona** — IT5–IT11, 13 escalones nominales, letras D–H (agujero) y d–p (eje), sin Δ para K/M/N/P (rechaza diciéndolo) |
| **Marco GD&T (TOLERANCE)** | `engine/commands/annotate-tolerance.ts` (323 líneas) | **Funciona** — 14 características, modificadores M/L/RFS, datums, medidas con `measureCadMText` |

### 2.2 Estado real (detalle)

- **No hay perfiles de acero catalogados (steel shapes)**: Los perfiles son PARAMÉTRICOS — el usuario teclea las medidas. No hay tabla de perfiles comerciales por peso ni designación IMCA de catálogo. `mechanical-parts.ts:324-381` define la forma y los defaults pero no una tabla de perfiles disponibles.
- **BOM con Actualizar**: `mechanical-bom.ts:89-97` marca la tabla con `CAD_BOM_MARK = "bom"` para poder encontrarla y reconstruirla con `replace` manteniendo el id. Primera tabla en el producto que se corrige sola.
- **Deuda honesta del sólido persistido**: Documentada en `pipe-solid.ts:59-71`.

### 2.3 Huecos frente a AutoCAD Mechanical

| AutoCAD Mechanical | Valle Design | Gap |
|-------------------|-------------|-----|
| Content library (millares de piezas) | 6 familias: tornillo, tuerca, rondana, perfil, rodamiento, chaveta | **Parcial**: catálogo funcional pero çerçano (7 métricas, 26 rodamientos, 16 chavetas, 5 perfiles) |
| Shaft generator (árboles de transmisión) | No existe | **Ausente** |
| Gear/belt/chain design | No existe | **Ausente** |
| FEA integrado | No existe | **Ausente** |
| Power dimensioning | No existe | **Ausente** |
| GD&T completo | TOLERANCE funciona con 14 características | **Parcial**: falta datum target, composite tolerance, projected tolerance zone |
| Sheet metal | No existe | **Ausente** |
| Welding symbols | WELDSYMBOL funciona (9 tipos) | **Funciona** — pero çerçano a tipos más comunes |

---

## 3. MEP (Instalaciones)

### 3.1 Qué existe

| Capacidad | Archivos | Estado |
|-----------|----------|--------|
| **Símbolos MEP** (8: válvula, difusor, rejilla, luminaria, contacto, apagador, tablero, extractor) | `mep-symbols.ts` (172 líneas) | **Funciona** — bloques con geometría, atributo TAG declarado (T-15) |
| **Orden MEPSYMBOL** | `engine/commands/mep-symbol.ts` (105 líneas) | **Funciona** — keyword → punto → rotación |
| **Servicios MEP** (10: AF, AC, SAN, PLU, GAS, CI, INY, RET, EXT, CHAROLA) | `engine/commands/mep-support.ts:48-59` | **Funciona** — capas con color y tipo de línea propios |
| **Trazado PIPE** (tubería en planta con servicio y diámetro nominal) | `engine/commands/mep-tracing.ts` (370 líneas) | **Funciona** — con elevación/3D, montantes automáticos, detección de choques al cerrar |
| **Trazado DUCT** (ducto a doble línea con eje CENTER) | `engine/commands/mep-tracing.ts` | **Funciona** — contorno a inglete, eje con tipo de línea |
| **Trazado CABLETRAY** (charola) | `engine/commands/mep-tracing.ts` | **Funciona** — igual mecanismo que DUCT |
| **Lector de corridas MEP** (único lector para cuadro y choques) | `mep-runs.ts` (158 líneas) | **Funciona** — lectura desde capa o metadatos, salto de contornos a doble línea |
| **Cuadro de instalaciones** (longitudes 3D, montantes, codos, equipos) | `mep-schedule.ts` (95 líneas), `data-extraction/mep-schedule-table.ts` (59 líneas) | **Funciona** — medición 3D desde Ola G, 7 columnas |
| **Detección de choques MEP** | `plant/clash.ts:610-720` (integración) | **Funciona** — las corridas MEP se convierten a `CadPipeRoute` y se miden contra muros/sólidos/rutas |

### 3.2 Estado real (detalle)

- **Sin accesorios automáticos**: Los codos son la esquina a inglete del contorno; las tes se trazan como dos tramos. El cuadro los CUENTA deducidos de la geometría (`mep-support.ts:163-170`) pero nadie coloca una pieza.
- **Sin tramos curvos**: Un codo es una esquina. El ducto no guarda su canto, solo su ancho.
- **Medición 3D desde Ola G**: `mep-support.ts:103-126` mide en tres dimensiones. Los montantes que antes valían cero metros ahora cuentan su longitud vertical.
- **Choques al cerrar**: `mep-tracing.ts:180-198` ejecuta el análisis contra lo construido en el mismo aliento del trazado. No hay orden separada `PIDCLASH` (diseñada pero no implementada; ver `mep-tracing.ts:46`).

### 3.3 Huecos frente a AutoCAD MEP

| AutoCAD MEP | Valle Design | Gap |
|-------------|-------------|-----|
| Catálogo de equipos HVAC (AHU, fan coil, etc.) | 8 símbolos MEP | **Parcial**: mínimo para planos de instalaciones; falta AHU, fan coil, chiller, torre de enfriamiento |
| Routing automático de tubería | No existe | **Ausente**: el trazado es manual punto a punto |
| Cálculo de cargas térmicas | No existe | **Ausente** |
| Duct sizing automático | No existe | **Ausente**: el ancho se teclea |
| Conexiones automáticas (codos, tes, reducciones como objetos) | No existe | **Ausente**: los accesorios se deducen pero no se colocan como objetos |
| Panel schedule eléctrico | Cuadro de cargas funciona | **Parcial**: falta distribución por tablero/circuito |
| Pressure drop calculations | No existe | **Ausente** |
| Coordination / interference check | Clash detection funciona para conducciones | **Parcial**: mide distancias pero no resuelve automáticamente |

---

## 4. PLANT (Proceso / P&ID)

### 4.1 Qué existe

| Capacidad | Archivos | Estado |
|-----------|----------|--------|
| **Símbolos P&ID** (6: recipiente, bomba, intercambiador, tanque, compresor, instrumento) | `plant/pid-symbols.ts` (194 líneas) | **Funciona** — geometría desde primitivas, atributo TAG declarado |
| **Orden PIDEQUIP** (coloca equipo con etiqueta) | `engine/commands/plant-equipment.ts` (247 líneas) | **Funciona** — etiqueta automática desde dibujo, prefijo configurable |
| **Números de línea** (PIDLINE: 6"-P-1001-CS150) | `plant/line-numbers.ts` (252 líneas), `engine/commands/plant-line.ts` (280 líneas) | **Funciona** — parsing completo, validación, hallazgos (repetidos, doble spec, diámetro no comercial) |
| **Rutas 3D** (PIDROUTE: tubería con cota y montantes) | `plant/pipe-route.ts` (386 líneas), `engine/commands/plant-route.ts` (493 líneas) | **Funciona** — elevación por vértice, montantes automáticos, hallazgos de ruta |
| **Sólido facetado de tubería** (PIDROUTE con "Sólido") | `plant/pipe-solid.ts` (388 líneas) | **Funciona** — prisma 16 lados de área equivalente, densificado ±100 mm, huella para detección de antigüedad |
| **Detección de choques** (ruta vs. muros, sólidos, otras rutas) | `plant/clash.ts` (817 líneas) | **Funciona** — distancia exacta segmento-caja, vanos restados de muros, empalmes perdonados, 3 niveles de severidad |
| **Accesorios deducidos** (codos, tes, reducciones) | `plant/pipe-route.ts:227-304` | **Funciona** — codos por ángulo de giro, tes donde punta muere sobre cuerpo, reducciones punta-punta |
| **Lista de materiales** (PIDMTO) | `plant/pipe-mto.ts` (187 líneas) | **Funciona** — tubo en metros, accesorios en piezas, límites declarados |
| **Isométrico** (PIDISO) | `plant/isometric.ts` (305 líneas), `engine/commands/plant-iso.ts` (237 líneas) | **Funciona** — proyección isométrica, longitudes verdaderas rotuladas, flecha de norte, título con número de línea, lista de materiales al lado, hoja con ventana |
| **Lista de líneas como tabla** | `data-extraction/plant-schedule-table.ts` (109 líneas) | **Funciona** — metrado de tubería + lista de líneas como TABLE |
| **Verificación de hallazgos de ruta** | `plant/pipe-route.ts:306-386` | **Funciona** — especificación partida, codo a medida, ruta plana, tramo nulo |

### 4.2 Estado real (detalle)

- **Especificación del cliente, no transcrita**: El código declara explícitamente que no trae tablas de espesores, diámetros exteriores ni claves de compra (`line-numbers.ts:26-35`, `pipe-route.ts:39-47`, `pipe-mto.ts:13-20`).
- **Deuda honesta del sólido persistido**: `pipe-solid.ts:59-71` documenta que mover un vértice de la ruta deja el sólido viejo, y `cadPipeSolidsStale()` lo detecta. `PIDMTO` lo dice en su renglón.
- **Diámetro nominal vs. exterior real**: `clash.ts:42-48` declara que la holgura es optimista por el grosor de pared y aislamiento.
- **No hay catálogo de especificaciones de tubería**: `CAD_PL_NPS` en `line-numbers.ts:62-65` lista 16 diámetros comerciales, pero no hay tablas de schedule ni de espesores.
- **6 símbolos de equipo**: `pid-symbols.ts:57-62` dice «no pretenden ser un catálogo completo; son los que aparecen en casi todo diagrama».

### 4.3 Huecos frente a AutoCAD Plant 3D

| AutoCAD Plant 3D | Valle Design | Gap |
|------------------|-------------|-----|
| Catálogos y especificaciones de tubería (ASME, API) | No existe | **Ausente**: la spec es del cliente y no se trae ninguna |
| Spec editor | No existe | **Ausente** |
| Ruteo 3D por especificación | PIDROUTE funciona (manual, por punto) | **Parcial**: routing manual, no automático por spec |
| Isométricos automáticos (ISOGEN) | PIDISO funciona (genera dibujo, MTO y hoja) | **Funciona** — no es ISOGEN, es desde la geometría |
| Ortométricos / planos de fabricación | No existe | **Ausente** |
| Nozzle management | No existe | **Ausente**: los equipos no declaran boquillas |
| Data manager / reportes de proyecto | PIDLIST + PIDMTO + tablas como TABLE | **Parcial**: no hay base de datos centralizada de proyecto |
| 3D model viewer con walk-through | El visor 3D existe (Layout3DEditor) | **Existe en otro contexto**: no es específico de Plant |
| Integration with AVEVA / SmartPlant | No existe | **Ausente** |

---

## 5. REDUNDANCIAS Y DEUDAS

### 5.1 Redundancias

- **`cadPipeTurnAngle`** está definida en `pipe-route.ts:175-187` y reutilizada por `mep-support.ts:163-170` (via import). No hay duplicación: la función vive en un solo sitio.
- **`cadMepRunsAsRoutes`** (`mep-runs.ts:143-158`) convierte corridas MEP al formato de `CadPipeRoute` para reutilizar el análisis de choques de planta. Diseño deliberado de reutilización, no redundancia.
- **`equipment-tags.ts`** vs **`device-tags.ts`**: Dos módulos de etiquetado con formas distintas (planta: sin guion, correlativo desde 101; eléctrico: con guion, desde 1). `equipment-tags.ts:8-11` declara explícitamente por qué no comparten código.

### 5.2 Deudas declaradas

| Deuda | Dónde se declara | Impacto |
|-------|------------------|---------|
| Sólido de tubería persistido envejece | `pipe-solid.ts:59-71` | `cadPipeSolidsStale()` detecta y `PIDMTO` avisa |
| Sin accesorios MEP como objetos | `mep-tracing.ts:59-66` | Los codos se deducen de geometría |
| Sin catálogo de especificaciones | `line-numbers.ts:26-35`, `pipe-route.ts:39-47` | La spec es del proyecto |
| Holgura de choques optimista | `clash.ts:42-48` | Sin espesor de pared ni aislamiento |
| Ángulos K/M/N/P de ISO 286 no implementados | `dimension-tolerance.ts:33-35` | Rechaza con mensaje en vez de calcular mal |
| GD&T como geometría suelta (no entidad TOLERANCE) | `annotate-tolerance.ts:7-17` | No se mueve como objeto |

---

## 6. ARCHIVOS LEÍDOS (56 total)

### Eléctrico (12)
- `electrical/schematic-symbols.ts`
- `electrical/circuit-check.ts`
- `electrical/wire-numbering.ts`
- `electrical/wire-connections.ts`
- `electrical/nom-conductors.ts`
- `electrical/device-tags.ts`
- `electrical/electrical-attributes-plot.spec.ts`
- `electrical/electrical-attributes-dxf.spec.ts`
- `engine/commands/electrical-schematic-symbol.ts`
- `engine/commands/electrical-tag.ts`
- `engine/commands/electrical-wire.ts`
- `engine/commands/electrical-circuit.ts`

### Mecánico (11)
- `mechanical-parts.ts`
- `mechanical-bom.ts`
- `mechanical-symbols.ts`
- `mechanical-parts-catalog.ts`
- `dimension-tolerance.ts`
- `engine/commands/mechanical-annotate.ts`
- `engine/commands/mechanical-parts.ts`
- `engine/commands/mechanical-symbols.ts`
- `engine/commands/dimension-tolerance.ts`
- `engine/commands/annotate-tolerance.ts`
- `mechanical.spec.ts` (referenciado, no leído en detalle)

### MEP (8)
- `mep-schedule.ts`
- `mep-runs.ts`
- `mep-symbols.ts`
- `engine/commands/mep-tracing.ts`
- `engine/commands/mep-symbol.ts`
- `engine/commands/mep-support.ts`
- `data-extraction/mep-schedule-table.ts`
- `data-extraction/circuit-schedule-table.ts`

### Plant (14)
- `plant/pipe-solid.ts`
- `plant/pipe-route.ts`
- `plant/pipe-mto.ts`
- `plant/pid-symbols.ts`
- `plant/line-numbers.ts`
- `plant/equipment-tags.ts`
- `plant/clash.ts`
- `plant/isometric.ts`
- `engine/commands/plant-iso.ts`
- `engine/commands/plant-route.ts`
- `engine/commands/plant-line.ts`
- `engine/commands/plant-equipment.ts`
- `data-extraction/plant-schedule-table.ts`
- `verification/planta-mal-empatada.ts` (referenciado, no leído)

---

## 7. RESUMEN EJECUTIVO

**Lo que funciona de verdad (no es prosa)**:
- Eléctrico: numeración de conductores a escala, revisión NOM con longitudes medidas del plano, etiquetado de componentes con evidencia DXF/PDF, cuadro de cargas como TABLE
- Mecánico: 6 familias de normalizados, BOM con Actualizar, símbolos de soldadura ISO 2553 y acabado ISO 1302, tolerancias ISO 286 en cotas, marcos GD&T
- MEP: trazado 3D con montantes, cuadro de instalaciones con longitudes 3D, detección de choques contra estructura al cerrar
- Plant: números de línea, rutas 3D con sólido facetado, isométricos con lista de materiales y hoja, detección de choques exacta segmento-caja

**Lo que no existe (declarado, no escondido)**:
- Cable routing, harness, PLC/ladder, panel schedule eléctrico
- Shaft generator, gear design, FEA, sheet metal
- HVAC sizing, duct sizing, routing automático MEP
- Spec editor, catálogos ASME/API, nozzle management, ortométricos

**El patrón de diseño consistente**: Ningún dominio añade tipos de entidad al formato. Todo usa polilíneas, bloques INSERT y `context.metadata`. Los cuadros son TABLE del documento. Las comprobaciones son `kind: "inquiry"` que leen sin escribir. Los límites van en el propio renglón, no en documentación aparte.
