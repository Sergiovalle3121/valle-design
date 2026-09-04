# La escalera de paridad

Escrito 2026-08-27, campaña Paridad (OLA 2). Generado desde
`docs/execution/CAMPANA_PARIDAD_20260827.md` — la ola 0/1 de esa misma
campaña cerró tres defectos de confianza reales (ángulos DWG, fuga de
espacio papel DXF, escala GLB) y construyó dos gates de regresión nuevos.
Ese trabajo es el material con el que esta escalera está hecha: cada
peldaño cita un ejemplo real del repositorio, no un caso hipotético.

## Por qué un bit no alcanza

`docs/competitive/rubric.json` ya sabe que "soportado" no es una sola
pregunta: cada criterio de la rúbrica clasifica su evidencia en **propia**
(el laboratorio se verifica a sí mismo) o **independiente** (un oráculo
externo, un archivo de verdad ajeno, un revisor que no escribió el código
lo confirma), y una categoría sin NINGUNA fila independiente no puede
llegar a su tope aunque toda su evidencia propia pase — se retiene 1 punto
con nota (`scripts/cad/rubric.mjs:569-613`). Hoy el corte es 185 pt con
evidencia propia contra 5 pt con evidencia independiente, de 190/220.

Esa distinción de dos niveles es correcta pero angosta: no dice CUÁL de
las muchas formas de "propia" tiene una fila (¿ni siquiera tiene una spec
que la ejercite? ¿tiene spec pero nunca corre en CI? ¿corre pero nadie
audita que el número no se infle?), ni qué hace falta para subir un
peldaño, ni qué se le puede decir a un cliente en cada uno. Esta escalera
generaliza el mismo criterio del `dwg-decoder-matrix.json` — que YA exige
`estadoLaboratorio: "supported"` **Y** ≥1 bundle admitido **Y** ≥2
validaciones independientes autorizadas antes de marcar una capacidad
`promovida: true` (`scripts/dwg/dwg-evidence.mjs`) — al resto del
producto, no sólo a DWG.

## Los siete peldaños

Cada capacidad del producto —una fila de la rúbrica, un comando, un
formato de importación/exportación— vive en UNO de estos siete peldaños
HOY, y sólo en uno: el peldaño es el MÁS ALTO que cumple TODAS sus
condiciones, nunca el más alto que cumple alguna.

### 0 · No existe
**Condición:** no hay código, o el código no hace lo que el nombre promete.
**Qué se puede prometer:** nada. Ni "en beta", ni "pronto" sin fecha.
**Ejemplo real:** el puente .NET/VBA para rutinas heredadas de despacho —
la rúbrica lo dice explícito: "no hay runtime .NET ni VBA y no se finge."

### 1 · Prototipo sin enchufar
**Condición:** el código existe y funciona en aislamiento, pero ningún
comando, botón o ruta del producto lo alcanza. Un usuario no puede
activarlo pase lo que pase.
**Qué se puede prometer:** nada al cliente. Internamente, "está escrito,
falta cablear."
**Ejemplo real:** el kernel Rust/WASM — paridad numérica verde, pero
`apps/web/src/lib/cad/wasm` no lo importa nadie fuera de sus propios specs
(regla 6 de la rúbrica, criterio explícito: "Kernel WASM con paridad
verde Y enchufado").

### 2 · Enchufado, sin prueba automática
**Condición:** un comando o ruta real del producto lo alcanza, pero
ningún `.spec.ts`/golden lo ejercita. Que siga funcionando mañana depende
de que nadie lo rompa por accidente, no de que algo lo detecte.
**Qué se puede prometer:** nada más allá de "existe en el producto." Un
cliente que lo pruebe puede encontrar que dejó de funcionar sin que el
equipo se entere hasta el reporte.
**Ejemplo real:** el estado de los cuatro anfitriones 3D de sólidos
(`wall-solid-host.ts`/`room-solid-host.ts`/`solid-shade-host.ts`/
`solid-snap-host.ts`) frente al invariante "sólo `modelSpace.entityIds`"
antes de esta campaña — funcionan, nada los prueba contra ese invariante
específico (BACKLOG P2-14).

### 3 · Probado con datos propios
**Condición:** hay `.spec.ts`/golden que corre en `npm test`/CI y pasa,
pero TODA la evidencia la genera el propio laboratorio — fixtures que el
producto mismo construyó, comparadas contra lo que el propio producto
calcula. Prueba consistencia interna, no compatibilidad con nada externo.
**Qué se puede prometer:** "lo probamos" y "tiene cobertura automática."
NUNCA "es compatible con [software ajeno]" ni "un tercero lo validó."
**Ejemplo real:** la inmensa mayoría del producto — 185/220 puntos de la
rúbrica hoy. El decodificador DWG del laboratorio decodifica 65 tipos de
entidad verificados contra fixtures propias
(`docs/cad/evidence/dwg-decoder-matrix.json`,
`tiposDecodificadosEnLaboratorio: 65`) — sin corpus ajeno admitido, es
peldaño 3, no más.

### 4 · Verificado con oráculo independiente
**Condición:** al menos una prueba compara contra algo que el laboratorio
NO generó — un archivo real donado con procedencia, un decodificador de
terceros con licencia (ODA/RealDWG), un visor externo que relee lo
exportado. Corresponde exactamente a `independent: true` en
`rubric.json` y a `verificadoIndependientemente: true` en
`dwg-decoder-matrix.json`.
**Qué se puede prometer:** "verificado contra [oráculo nombrado]," con
el nombre del oráculo. Sigue sin ser garantía de producción — un oráculo
que corrió una vez no es un gate que corre siempre (ver peldaño 5).
**Ejemplo real:** `glb-export.spec.ts` — no compara el GLB EXPORTADO
contra un cálculo propio; lo vuelve a LEER con `GLTFLoader` (un
consumidor real, no el mismo código que lo escribió) y mide la malla
releída. Igual `dxf-roundtrip.spec.ts`, que reimporta con el tokenizador
real de `dxf-parser` (librería de terceros), no con un parser propio.

### 5 · Gate de regresión activo
**Condición:** la verificación del peldaño 3 o 4 no es una prueba que
alguien corrió una vez — es un gate que corre en CADA cambio (`npm test`,
`check:cad`) y FALLA el build si el número empeora. Regenerar-y-comparar
contra un artefacto comprometido (`check-command-integrity.mjs`,
`check-precision-evidence.mjs`, `dwg-evidence.mjs --check`) o un techo de
ratchet (`check-lint-budget.mjs`, `check-monolith-budget.mjs`,
`wall-takeoff-solid-parity.spec.ts` de esta misma campaña) cuentan aquí.
**Qué se puede prometer:** "esto no se puede romper en silencio" — la
promesa más fuerte que la ingeniería sola puede dar. Sigue sin ser
promesa legal/comercial (peldaño 6).
**Ejemplo real:** `wall-takeoff-solid-parity.spec.ts` (esta campaña,
OLA 0.5/1.3) — mide la brecha REAL entre el cuadro de cantidades y el
sólido 3D (1,45%) y falla si crece más allá de un techo, aunque nadie
haya decidido todavía CORREGIR la brecha (eso es BACKLOG P1-6, una
decisión de negocio separada de que el gate exista).

### 6 · Legal y autorizado para producción
**Condición:** además de peldaño 5, la exposición legal/de licencia está
resuelta y un titular firmó autorización explícita — no basta que el
código sea correcto si escribirlo/leerlo infringe una licencia de
terceros o expone al negocio (D5 "DWG honesto": nunca ingeniería inversa
del formato, nunca importación/exportación DWG sin proveedor licenciado o
gate firmado).
**Qué se puede prometer:** se puede VENDER activamente, con el alcance
exacto que la firma cubrió — no más.
**Ejemplo real:** la exportación DWG beta (`dwg-native-writer.ts`) —
código completo, round-trip probado (peldaño 5 cumplido), pero
`dwgBetaExportIsEnabled` se queda en `false` en producción hasta que el
oráculo externo ODA corra (§8.2 de ADR-0009) — una OWNER ACTION explícita,
no un TODO técnico.

### 7 · En producción, medido en vivo
**Condición:** clientes reales lo usan hoy, y el producto MIDE que sigue
funcionando para ellos (telemetría/outbox de errores, no sólo ausencia de
quejas) — la verificación no depende ya de un entorno de pruebas.
**Qué se puede prometer:** todo lo del peldaño 6, con el respaldo de uso
real medido — la base para un caso de estudio o una garantía de SLA.
**Ejemplo real:** ninguna fila del producto está aquí todavía de forma
medida — el canal "algo salió mal" vía outbox (OLA 3.2 de esta misma
campaña) es la pieza de instrumentación que falta para que una fila
pueda subir a este peldaño alguna vez.

## Las filas de los siete toolsets

La campaña «Valle Design → AutoCAD completo» (2026-09-02) mide el producto
contra AutoCAD **con sus siete toolsets**, no sólo contra AutoCAD LT. Cada
toolset tiene su fila en `docs/competitive/rubric.json` (grupo `toolsets`,
alcance DESTINO) aunque hoy valga cero, y su peldaño aquí. El orden es el de
la campaña. Electrical y Plant 3D estuvieron marcados **fuera de alcance**
hasta el 3 de septiembre de 2026, cuando el titular retiró la marca: entran
con objetivo 4/4 y su peldaño de hoy está más abajo, en sus secciones (Olas 5
y 6).

| Toolset | Peldaño hoy | Objetivo | Qué hay y qué falta |
| --- | --- | --- | --- |
| Architecture | 5 | 5 | WALL, DOOR y WINDOW (golden 53); STAIR (78); ROOF y SLAB (79); los cuadros de superficies —con el nombre del local— y de carpintería salen en la lámina (77, `paper-space-table.spec.ts` leyendo los bytes del PDF). La rúbrica retiene 1 pt hasta que haya evidencia independiente. Lo que sigue en «todavía no» está en su sección (Ola E). |
| MEP (mitad 2D) | 5 | 3 | PIPE, DUCT, CABLETRAY y MEPSYMBOL sobre el mismo motor (polilíneas, capas de servicio con tipo de línea con texto, bloques MEP-…), y el cuadro de instalaciones por DATAEXTRACTION Instalaciones en la lámina (golden 81; `mep-tracing.spec.ts`). La mitad 3D —ruteo con colisiones, diámetros por especificación— queda fuera y se dice. |
| Map 3D | 5 | 3 | GEOGRAPHICLOCATION georreferencia el dibujo con un marcador POINT en GEO (UTM 11N–16N, WGS84/ITRF; o latitud y longitud), ID informa el este/norte y la lat/lon, y MAPIMPORT mete un shapefile o GeoJSON en el plano abierto reproyectado al sistema del dibujo con los atributos en metadatos (golden 82; `geo-location.spec.ts`, `map-import.spec.ts`, `geojson.spec.ts`). La rúbrica retiene 1 pt hasta evidencia independiente. Lo que sigue en «todavía no» está en su sección (Ola G). |
| Raster Design (mitad útil) | 5 | 3 | IMAGEATTACH mete el escaneo dentro del dibujo y por primera vez SE VE (visor, lámina, PDF); IMAGECLIP recorta por polígono o rectángulo; IMAGEADJUST ajusta brillo, contraste y atenuación (golden 83; `raster-image.spec.ts`, `image-layer-three.spec.ts`, `paper-space-image.spec.ts`). La rúbrica retiene 1 pt hasta evidencia independiente. La vectorización, IMAGEFRAME y TRANSPARENCY siguen en «todavía no» (Ola H). |
| Mechanical | 5 | 3 | STDPART (tornillería ISO 4017/4032/7089) y STEELSHAPE (PTR, OC, LI, CPS, IPR por medidas) como bloques MECH-…; BALLOON y BOM; WELDSYMBOL y SURFACESYMBOL como geometría con marca; DIMTOLERANCE con ajustes ISO 286 sobre la cota, que rotula en visor, lámina y DXF; DIMSTYLE Familia (`ISO-25$4`) (golden 84; `mechanical.spec.ts`, `engine/commands/mechanical.spec.ts`, `dimension-tolerance.spec.ts`, `dimension-family.spec.ts`). La rúbrica retiene 1 pt hasta evidencia independiente. Lo que sigue en «todavía no» está en su sección (Ola I). |
| Electrical | 5 | 5 | **EN ALCANCE desde la Ola 5 (2026-09-03).** AEWIRE numera conductores desde el dibujo, AECIRCUIT estampa los datos del circuito en un paso, AECHECK revisa contra la NOM-001-SEDE con la longitud REAL de la polilínea, AETAG etiqueta componentes —uno a uno o todos de golpe— y DATAEXTRACTION Circuitos saca el cuadro de cargas como TABLE (golden 93; `wire-numbering.spec.ts`, `nom-conductors.spec.ts`, `circuit-check.spec.ts`, `device-tags.spec.ts`). La rúbrica da 3/4 y retiene 1 pt hasta que un tercero autorizado verifique la transcripción de la tabla. Lo que sigue en «todavía no» está en su sección (Ola 5). |
| Plant 3D | 5 | 5 | **EN ALCANCE desde la Ola 6 (2026-09-03).** PIDLINE numera la línea `6"-P-1001-CS150` con el correlativo del dibujo, PIDEQUIP coloca y etiqueta el equipo en un solo paso desde un catálogo de seis símbolos dibujados aquí, y PIDLIST da el METRADO medido sobre el plano —lo que un P&ID de AutoCAD no puede dar— más las comprobaciones que no piden el catálogo de nadie (golden 94; `line-numbers.spec.ts`, `plant-line.spec.ts`, `plant-equipment.spec.ts`). PIDROUTE tiende la tubería EN 3D —cambiar de elevación mete el montante solo—, PIDMTO saca la lista de materiales del modelo y PIDISO entrega el isométrico con longitudes verdaderas, cuadro de materiales y HOJA, todo en un paso (goldens 94 y 95). La rúbrica da 3/4 y retiene 1 pt como las demás filas de evidencia propia; falta catálogo de fabricante, sólido de tubería en el visor 3D y detección de choques. Su sección está más abajo (Ola 6). |

## La cota y el plano inclinado (Ola C, 2026-09-02)

La campaña midió antes que «todo punto que el usuario señala vive en z=0»
y que la cota moría en cuatro fronteras del DXF. Cada fila de abajo dice
en qué peldaño queda HOY y qué la subiría; lo que sigue en «todavía no» se
dice aquí y en el prompt de la orden, no se aplana en silencio.

| Capacidad | Peldaño hoy | Evidencia | Qué falta para subir |
| --- | --- | --- | --- |
| LINE, PLINE y RECTANG dibujan EN el plano del SCU inclinado | 3 | `draw-spatial.spec.ts` (25), `ucs-3d.spec.ts` (68): vértices sobre el plano a 1e-6 mm | Un golden de navegador pinchando sobre una cara (peldaño 5). PLINE Arco y RECTANG Empalme se rechazan sobre un plano inclinado: el bulge es un arco en planta. |
| CIRCLE, ARC y las ocho primitivas sobre la planta ELEVADA | 3 | `draw-spatial.spec.ts`, `solids-primitives.spec.ts` (60) | Sobre un plano INCLINADO el motor las rechaza con su motivo: el documento no guarda un círculo fuera del plano horizontal ni un `box` con marco. **Todavía no.** |
| Las ocho primitivas de sólido | 5 | golden 73 (BOX y CYLINDER tecleados, volumen recalculado por el kernel sobre lo que recibió el servidor) | Nada de peldaño; los modos 3P/2P/Ttr/Elíptico de CYLINDER y CONE, Arista de PYRAMID y Arco de POLYSOLID no se ofrecen. |
| SOLIDEDIT · Cara Extruir, Cuerpo Comprobar, Cuerpo Separar | 3 | `solids-edit.spec.ts` (24) | Las otras once ramas (Mover/Girar/Desfasar/Inclinar/Borrar/Copiar/Color de cara, Copiar/Color de arista, Estampar/Vaciar/Limpiar de cuerpo): piden recomponer caras o designar aristas. **Todavía no**, dicho en el diálogo. |
| La cota en el DXF: 30/31, elevación (38 y cabecera), polilínea 3D (bit 8), SCU reflejado (0,0,−1) | 5 | `verification/z-frontiers.spec.ts` (39) con `dxf-parser` de oráculo independiente, en el gate `check:cad-math`; `dxf-import-cota.spec.ts` | Nada de peldaño; la polilínea con ARCOS y cotas distintas no cabe en el formato y se declara en el manifiesto de pérdidas. |
| El plano INCLINADO al importar DXF (extrusión distinta de ±Z) | 0 | `flattened_to_ground` sigue declarándose por entidad y capa | Que la entidad canónica guarde su normal y el visor la dibuje. **Todavía no.** |
| Ver la cota en pantalla | 0 | el render (`CadRenderPath.points: CadPoint2[]`) dibuja en planta | El visor 3D representa la geometría 2D sobre el suelo; los sólidos sí van a su cota. **Todavía no.** |

## El trabajo ajeno (Ola D, 2026-09-02)

La campaña midió antes que la prueba de despacho del área 2 —recibir un
DWG, unir 34 líneas mal empatadas y obtener perímetro y superficie— fallaba
en el primer paso, que Ctrl+C duplicaba en el sitio y que seis órdenes del
plano ajeno no existían. Cada fila dice en qué peldaño queda HOY y qué la
subiría; lo que sigue en «todavía no» se dice aquí y en el prompt.

| Capacidad | Peldaño hoy | Evidencia | Qué falta para subir |
| --- | --- | --- | --- |
| HPGAPTOL y `Tolerancia` en HATCH, BOUNDARY y JOIN; distancia de aproximación en PEDIT Juntar | 5 | golden 74 (la prueba de despacho entera), `verification/prueba-de-despacho.spec.ts` (72, oráculo en papel: 92.840.000 mm² y 46.297 mm), `modify-pedit.spec.ts` | Nada de peldaño. La tolerancia no se guarda en el sombreado: nace NO asociativo y el prompt lo dice; guardarla es tocar el formato persistido, decisión del titular. |
| Portapapeles de geometría canónica: COPYCLIP, CUTCLIP, COPYBASE, PASTECLIP, PASTEORIG y Ctrl+C/X/V | 5 | golden 75; `clipboard.spec.ts` (33), `engine/commands/clipboard.spec.ts` (48), anfitrión con dos editores que comparten el almacén | No toca el portapapeles del SISTEMA: no hay PASTESPEC ni PASTEBLOCK, ni pegar en otra pestaña del navegador. **Todavía no.** |
| SELECTSIMILAR y ADDSELECTED | 5 | golden 76; `select-similar.spec.ts` (24); anfitrión que encadena la orden y devuelve CLAYER/CECOLOR/CELTYPE | SELECTSIMILARMODE no existe: siempre tipo, capa y bloque. ADDSELECTED de un tipo sin orden (muro heredado, tabla de activos) lo dice con su nombre. |
| XPLODE, SETBYLAYER, CHPROP y NCOPY | 5 | golden 76; `modify-foreign.spec.ts` (54) | XPLODE Heredar da lo mismo que Explotar (la resolución del bloque ya coloca capa 0 y PorBloque con lo de la inserción, medido; la etiqueta lo dice) y no ofrece Grosor. NCOPY sólo copia desde inserciones. |
| CECOLOR, CELTYPE y CELWEIGHT llegan a lo que se dibuja | 3 | `engine/current-presentation.spec.ts` (15) contra el motor: LINE con COLOR 1 sale con color 1, COPY no lo hereda | Un golden que teclee COLOR y dibuje (peldaño 5). Sólo órdenes de dibujo y anotación: lo copiado y lo pegado conservan lo suyo, como en AutoCAD. |
| Ver la cota en pantalla; la cota que sigue a la polilínea al moverla | 0 | `auditoria/acotar.spec.ts` sigue en el manifiesto (28) | Sigue de la Ola C. **Todavía no.** |

## La arquitectura (Ola E, 2026-09-02)

La campaña midió antes que un cuadro de superficies llegaba a la lámina
como una rejilla vacía (3 caminos, 0 textos, sin advertencia), que el local
se llamaba `L-03` porque `bim-schedule.ts` no tenía campo de nombre, y que
no existían escaleras, cubiertas ni losas. Cada fila dice en qué peldaño
queda HOY y qué la subiría; lo que sigue en «todavía no» se dice aquí y en
el prompt de la orden.

| Capacidad | Peldaño hoy | Evidencia | Qué falta para subir |
| --- | --- | --- | --- |
| El texto de las celdas de una TABLE sale en la lámina (plan, vista previa y PDF) | 5 | `paper-space-table.spec.ts` (14): la ancla de la celda coincide a 1e-6 con un MTEXT colocado a mano, y `measureCadPdf` lee «Local», «12.50» y «Rec…» de los bytes; golden 77 guarda los dos cuadros | Nada de peldaño. El tamaño del texto en papel se acota a [1,5; 12] mm como un MTEXT: una tabla a escala 1:500 se lee, no desaparece. |
| Cuadro de superficies con el NOMBRE del local (el rótulo TEXT/MTEXT dentro del anillo) y su uso | 5 | `bim-schedule.spec.ts` (57), `data-extraction.spec.ts` (24), `data-extraction-commands.spec.ts` (20); golden 77: RECÁMARA 16,00 m², BAÑO 8,00 m² | Un local sin rótulo sigue llamándose por su `L-nn`. El uso sale del clasificador de `architecture.ts`; un nombre que no reconoce da «—». |
| Cuadro de carpintería: marca, tipo, ancho, alto, antepecho, cantidad | 5 | golden 77 (P-090x210 y V-120x120 con antepecho 900); `bim-schedule.spec.ts` | Sin material ni herraje: la entidad `opening` no los guarda y añadirlos es formato persistido (decisión del titular). |
| STAIR: escalera recta paramétrica (Blondel y reglamento; planta y sólido) | 5 | golden 78; `architecture-stair.spec.ts` (78): 2400 → 14 × 171,4 / 287,1; 3000 con Huella 280 → 17 × 176,5 / 280; volumen del dentado en papel | Sólo un tramo recto: sin descansos, tramos en L o U, compensadas ni de caracol; sin Justificación (el arranque es la esquina izquierda); el sólido es macizo, no una zanca con canto. **Todavía no.** |
| ROOF: cubierta a cuatro, dos o un agua sobre un rectángulo, con alero y pendiente | 5 | golden 79; `architecture-roof.spec.ts` (109): V = h·W·((L−W)/2 + W/3) a cuatro aguas, L·W·h/2 a dos y a una, pirámide sobre cuadrado, girado 30° | Sólo rectángulos: sobre un polígono en L se rechaza diciéndolo. Sin faldones de pendiente distinta, buhardillas ni limahoyas; el sólido es el volumen bajo cubierta, no una losa inclinada con espesor. **Todavía no.** |
| SLAB: losa por contorno cerrado, cara superior a la cota | 5 | golden 79; `architecture-roof.spec.ts`: 24 m² × 150 = 3,6 m³, círculo como 64-gono | Sin huecos tecleados (entran como REGION con interiores), sin pendiente ni cantos. |
| Una entidad `stair`, `roof` o `slab` persistida y reeditable desde el panel | 0 | Las tres se descomponen en planta + SOLID3D con la receta en el nombre | Añadir tipos de entidad es tocar el formato persistido: decisión del titular, no tomada por la sesión. |

## Las instalaciones y el tipo de línea con texto (Ola F, 2026-09-02)

La campaña midió antes que el bloqueo de un plano de instalaciones no era
MEP sino los tipos de línea con texto incrustado, que el lector `.lin`
declaraba imposibles, y que no existía ninguna orden MEP. Cada fila dice en
qué peldaño queda HOY y qué la subiría; lo que sigue en «todavía no» se
dice aquí y en el prompt de la orden.

| Capacidad | Peldaño hoy | Evidencia | Qué falta para subir |
| --- | --- | --- | --- |
| Tipos de línea con TEXTO (GAS_LINE, HOT_WATER_SUPPLY, AGUA_FRIA, AGUA_CALIENTE, SANITARIO, PLUVIAL, CONTRA_INCENDIO) en pantalla, lámina, PDF y DXF | 5 | golden 80 (30 glifos a LTSCALE 1000, 60 a 500, el DXF con 74 = 2); `linetype-complex.spec.ts` (37): rótulos cada 950 desde 600, el PDF leído de sus bytes, el LTYPE de ida y vuelta | Son de FÁBRICA y por nombre: un `.lin` propio con texto sigue sin cargarse porque el documento sólo guarda trazos (formato: decisión del titular) y el lector lo dice nombrando la familia. Las FORMAS (.shx: FENCELINE, TRACKS, ZIGZAG, BATTING) no están. Los arcos llevan los trazos, no el texto. La lectura del 74 = 2 por AutoCAD queda sin oráculo (el corpus no trae ninguno). **Todavía no.** |
| LTSCALE tecleado mueve el dibujo | 5 | golden 80: LTSCALE 500 duplica los rótulos en vivo y el DXF sale con $LTSCALE 500 | Nada de peldaño. La escala se lee en unidades de dibujo en pantalla y en mm sobre el papel (PSLTSCALE/MSLTSCALE no existen): **todavía no.** |
| El diálogo «Exportar a DXF» escribe las capas con su tipo de línea y grosor, la tabla LTYPE y $LTSCALE | 5 | golden 80; `layout-export-adapter.spec.ts` | Medido antes: GAS = GAS_LINE salía como `6 CONTINUOUS` sin aviso. El color de la capa sigue saliendo de la tabla fija por nombre (ACI), no del color CSS del documento. |
| PIPE por servicio (agua Fría, agua Caliente, Sanitario, Pluvial, Gas, contra Incendio) con Diámetro | 5 | golden 81; `mep-tracing.spec.ts` (71) | Sin accesorios automáticos (codos, tes, reducciones), sin pendientes ni tramos curvos, sin ruteo 3D ni diámetros por especificación (la mitad 3D de MEP, fuera de alcance). |
| DUCT y CABLETRAY a doble línea con esquinas a inglete y eje CENTER | 5 | golden 81; codo 300 × (2.000 + 2.000) = 1.200.000 en papel | Sin transiciones ni derivaciones como piezas; una te son dos tramos. |
| MEPSYMBOL: ocho símbolos como BLOQUES con geometría (válvula, difusor, rejilla, luminaria, contacto, apagador, tablero, extractor) | 5 | golden 81 (el bloque se define una vez y se inserta); `mep-tracing.spec.ts` | Ocho, no el catálogo entero de un despacho; sin atributos (marca, modelo). Se amplía por contenido, no por motor. |
| Cuadro de instalaciones (longitudes por servicio y tamaño, equipos por símbolo) en la lámina | 5 | golden 81 (7,00 m Ø19, 4,00 m de ducto, 1 válvula); `paper-space-table.spec.ts` para la lámina | Una tubería dibujada a mano en la capa del servicio cuenta sin diámetro («-»); el CSV sigue siendo el de muros. |
| Una entidad `pipe`/`duct` persistida y reeditable desde el panel | 0 | Todo son polilíneas, capas y `context.metadata`, que el formato ya tiene | Añadir tipos de entidad es tocar el formato persistido: decisión del titular, no tomada por la sesión. |

## El mapa (Ola G, 2026-09-02)

La campaña midió antes que `lib/geo` sabía leer shapefiles, datums y zonas
UTM y que ningún dibujo sabía dónde estaba: el `.shp` entraba sólo como
documento nuevo, a un origen local propio, sin atributos. Cada fila dice en
qué peldaño queda HOY y qué la subiría; lo que sigue en «todavía no» se dice
aquí y en el prompt de la orden.

| Capacidad | Peldaño hoy | Evidencia | Qué falta para subir |
| --- | --- | --- | --- |
| GEOGRAPHICLOCATION: un punto del dibujo y su Este/Norte UTM (zona 11N–16N, datum WGS84/ITRF92/ITRF2008/ITRF2020) o su latitud y longitud, guardados como marcador POINT en la capa GEO con `{geo, crs, east, north}` en `context.metadata`; `Informe` lee sin escribir | 5 | golden 82 ((0,0) = E 660 000 N 2 140 000 en 14N); `geo-location.spec.ts` (44): Guadalajara por `Geográfica` → EPSG:32613 E 671 873,00 contra `crs.spec.ts` | Sólo el hemisferio norte y las zonas 11N a 16N (lo que `crs.ts` verifica); sin NAD27/NAD83 (rechazados por nombre, a propósito); sin giro de cuadrícula (convergencia) ni escala de proyección aplicados al dibujo; sin tabla de georreferencia persistida —sería tocar el formato: decisión del titular, no tomada—. **Todavía no.** |
| ID en un dibujo georreferenciado informa el este/norte y la latitud/longitud del punto | 5 | golden 82 («E 660,001.00 N 2,140,001.00 · 19.3477° N, 97.4767° O»); `geo-location.spec.ts` | Sólo ID; LIST, DIST y las cotas siguen en unidades de dibujo. Sin coordenadas geográficas en la barra de estado. |
| MAPIMPORT: `.shp` con `.shx`/`.dbf`/`.prj`/`.cpg` o `.geojson` por el selector del navegador (varios a la vez, en un sobre base64 por la puerta de texto del motor) o un GeoJSON pegado, con el plan a la vista antes de escribir | 5 | golden 82 (el predio 14N cae en (10 000, 10 000) mm con su CLAVE); `map-import.spec.ts` (46): las cuatro situaciones | Sin exportar a SHP/GeoJSON; sin GeoPackage, KML ni GML; el tope de vértices es el del lector. Un LAS se lee pero no entra al plano (sigue siendo así, y se dice). |
| Reproyección al sistema del dibujo (UTM ↔ UTM entre zonas 11N–16N, WGS 84 geográfico → UTM) vértice a vértice, declarada en el manifiesto (`geo_reprojected`) | 5 | `map-import.spec.ts`: la mojonera en grados cae a < 1 mm del marcador; `crs.spec.ts` (ida y vuelta ±2,36e-9 m) | Sin desplazamiento de datum (WGS84 ↔ ITRF se tratan como una familia, ±0,1 m, como `crs.ts` declara); sin NAD27. |
| Los atributos del DBF/GeoJSON llegan al dibujo: la fila de cada registro en `context.metadata` de su entidad, por posición, y si la tabla no cuadra se declara (`geo_attributes_unaligned`) en vez de heredar los del vecino | 5 | golden 82 (`{CLAVE, USO}` en el servidor); `map-import.spec.ts`; `geojson.spec.ts` (34) | Sin rotular por atributo ni simbolizar por valor (color/tipo de línea según USO); sin consulta ni filtro por atributo (QSELECT no mira metadatos); sin tabla de atributos en la lámina. |
| GeoJSON (RFC 7946) leído a la misma forma que el shapefile: Feature, FeatureCollection, las seis geometrías simples, rasgo sin geometría como nulo con su fila; el cuadro «Importar» admite `.geojson` proyectado a su zona UTM | 5 | `geojson.spec.ts` (34): 8 rechazos con código; `readGeoDataset` lo reconoce por sus bytes | GeometryCollection se rechaza diciéndolo; un `crs` antiguo del archivo se ignora (la especificación lo manda). |
| Mapa de fondo (ortofoto, teselas en línea), topología, limpieza de dibujo, clasificación de entidades, COGO | 0 | — | No es de esta ola: un marcador y un predio en su sitio no son un servidor de mapas, y el producto no llama a servicios externos desde el lienzo. **Todavía no.** |

## El plano escaneado (Ola H, 2026-09-02)

La campaña midió antes que IMAGE insertaba una entidad que sólo se veía
como MARCO, exigía un `asset://` que nadie resolvía, y que no había
recorte ni ajuste: calcar encima era imposible. Cada fila dice en qué
peldaño queda HOY y qué la subiría; lo que sigue en «todavía no» se dice
aquí y en el prompt de la orden.

| Capacidad | Peldaño hoy | Evidencia | Qué falta para subir |
| --- | --- | --- | --- |
| IMAGEATTACH: el archivo (PNG, JPEG, GIF, WebP, BMP; hasta 8 MB) por el selector del navegador, decodificado una vez para su tamaño y metido DENTRO del dibujo como `data:` en `uri` (cadena que el formato ya admite); inserción, ancho en unidades y giro | 5 | golden 83 (8 × 4 px a 500 mm por píxel, el `data:image/png` en el servidor); `raster-image.spec.ts` (75) | Sin almacén de activos ni API: la imagen pesa en el documento (base64, ×1,33) y el tope es 8 MB por archivo; un `asset://` sigue sin resolverse. Un almacén con su API es la evolución natural. **Todavía no.** |
| Los píxeles en el visor: una malla por imagen bajo los lotes de líneas, con la MISMA convención de origen flotante y lámina de profundidad; recorte como polígono triangulado; brillo, contraste y atenuación en el shader | 5 | golden 83 (`data-images="1"` en el indicador del pipeline); `image-layer-three.spec.ts` (22): UV en píxeles/tamaño, textura pedida una vez por URI, `asset://` y `showImage` apagado se saltan, capa oculta | Sólo el pipeline por lotes (el heredado no la dibuja); sin mipmaps ni submuestreo para escaneos enormes; TRANSPARENCY (el canal alfa siempre se honra, no se puede apagar) e IMAGEFRAME (el marco siempre se dibuja) no existen. |
| IMAGECLIP Nuevo Poligonal/Rectangular y Eliminar, con el contorno en píxeles de la imagen (`clipBoundary`, que ya existía) | 5 | golden 83 (recorte rectangular exacto en píxeles); `raster-image.spec.ts` | Sin Activar/Desactivar (el recorte se elimina, no se apaga); sin invertir el recorte; sin recorte por polilínea designada. |
| IMAGEADJUST brillo, contraste y atenuación 0–100 con Restablecer, con la fórmula de AutoCAD (50/50 neutro) compartida por visor y lámina | 5 | golden 83 (atenuación 40 en el servidor); `image-geometry.spec.ts` (44): los extremos del ajuste | El brillo y el contraste no se aplican en el PDF (jsPDF incrusta los píxeles originales; el aviso lo dice); la atenuación sí, como opacidad. |
| La imagen en la lámina y en el PDF: comando `image` del plan con esquinas y recorte en papel, `addImage` girada, recorte `W n`, atenuación como estado gráfico; `rasterCommandCount` deja de ser un 0 literal | 5 | `paper-space-image.spec.ts` (29): el XObject 4 × 2 y el `Do` leídos de los bytes del PDF con `measureCadPdf` | Una imagen sesgada o reflejada sale sólo como marco (jsPDF no refleja); un `http(s)` no se descarga al trazar; la vista previa SVG del gestor de láminas no la pinta. |
| DXF: la imagen embebida sale con su NOMBRE en IMAGEDEF y el manifiesto dice qué archivo dejar al lado | 5 | `dxf-export-losses.spec.ts`; `dxf_export_image_embedded_pixels` | El DXF nunca lleva píxeles (formato); exportar el archivo junto al DXF es del usuario. |
| Vectorizar líneas y textos de un escaneo (REM), calibrar/enderezar (deskew), cuatro puntos de control | 0 | — | Fuera de alcance de la campaña: es procesamiento de imagen, no CAD, y se dice. **Todavía no.** |

## El plano de fabricación (Ola I, 2026-09-02)

La campaña midió antes que `dimension-style.ts` no tenía subestilos por
familia, que ninguna cota podía llevar tolerancia y que no había un solo
normalizado insertable: el toolset Mechanical valía cero. Cada fila dice en
qué peldaño queda HOY y qué la subiría; lo que sigue en «todavía no» se dice
aquí y en el prompt de la orden.

| Capacidad | Peldaño hoy | Evidencia | Qué falta para subir |
| --- | --- | --- | --- |
| Subestilos de cota por familia: `PADRE$n` en la misma tabla (`$0` lineal y alineada, `$2` angular, `$3` diámetro, `$4` radio, `$6` coordenada), resueltos encima del padre al crear la cota desde la paleta y en DIMSTYLE → Aplicar; DIMSTYLE → Familia los crea declarando sólo lo que cambia | 3 | `dimension-family.spec.ts` (38), `engine/commands/mechanical.spec.ts` (Familia, Aplicar, Suprimir con subestilos) | Un golden que teclee el subestilo y mida la flecha en pantalla (peldaño 5). Las cotas tecleadas por DIMLINEAR/DIMRADIUS no nombran estilo (como antes); la longitud de arco no tiene familia. Sin oráculo de AutoCAD leyendo `ISO-25$4` del DXF (el nombre es el suyo; no se ha comprobado con el corpus). |
| DIMTOLERANCE: simétrica, por desviaciones, por límites, `Ajuste` ISO 286 (agujeros D–H y JS, ejes d–h, js, k, m, n, p; IT5–IT11; nominal ≤ 500 mm) calculado sobre lo que mide ESA cota, y `Quitar`; en `context.metadata`, sin campo nuevo | 5 | golden 84 (40H7 → «40.00 +0.025/0 mm» en el servidor); `dimension-tolerance.spec.ts` (71: dieciséis ajustes contra la tabla de la norma, los rechazos con motivo, el rótulo, la ida y vuelta por DXF) | Los agujeros K, M, N y P (corrección Δ) y los grados IT01–IT4 y IT12+ se rechazan diciéndolo. El DXF lleva la tolerancia en la XDATA propia y en el rótulo del grupo 1; los DIMVARs DIMTOL/DIMTP/DIMTM no se escriben como override DSTYLE, así que AutoCAD ve el texto con tolerancia, no una cota «tolerada» editable. |
| El rótulo con tolerancia en visor, lámina y DXF: un solo formateador (`formatCadDimensionMeasurement`) que los tres consumen | 3 | `dimension-tolerance.spec.ts` (`buildCadDimensionGeometry`, el grupo 1 del DXF, la reimportación) | El rótulo va en una línea («40.00 +0.025/0 mm»); las desviaciones apiladas de AutoCAD (DIMTFAC) no existen. |
| STDPART: tornillo hexagonal ISO 4017 (M6–M24, alzado con cabeza, chaflán y rosca en d3), tuerca ISO 4032 y rondana ISO 7089 (planta), como bloques `MECH-…` con denominación y norma en `description`; la inserción se escala a la unidad del documento | 5 | golden 84 (el bloque con sus 6 entidades y su `description` en el servidor); `mechanical.spec.ts` (84) | Sin M14, M30+, roscas finas, cabezas cilíndricas ni tornillería en pulgadas; sin vistas alternativas (planta del tornillo, alzado de la tuerca); sin agujero pasante ni roscado automáticos en la pieza. |
| STEELSHAPE: la sección de PTR, OC, LI, CPS e IPR por sus medidas tecleadas, con sección y peso lineal en el aviso | 3 | `mechanical.spec.ts` (573,6 mm² y 4,50 kg/m del PTR 50,8 × 50,8 × 3, en papel) | Sin catálogo IMCA con designaciones cerradas (el usuario teclea las medidas; los defaults son comerciales redondos), sin radios de acuerdo ni de esquina, sin perfiles en alzado ni 3D. |
| BALLOON y BOM: el globo numera solo, se queda con el bloque designado (o con la designación previa) y la lista da a cada normalizado la posición de su globo y a cada inserción su cantidad, como TABLE en la lámina | 5 | golden 84 (la TABLE con «1 · 1 · Tornillo hexagonal M10 × 40 · ISO 4017» en el servidor); `mechanical.spec.ts` (la lista con globo, sin globo y sobre un objeto sin normalizado) | El globo no es una entidad: son cuatro con la misma marca y no se mueven como un objeto (como el marco de TOLERANCE). Sin renumerar, sin globos apilados, sin material ni peso por fila, sin exportar la lista a CSV. |
| WELDSYMBOL (ISO 2553 / AWS A2.4: nueve tipos, lado, tamaño, longitud, todo alrededor, en obra, cola) y SURFACESYMBOL (ISO 1302: básico, con o sin arranque de material, Ra, dirección de estrías, giro) como geometría con marca | 5 | golden 84 (cinco piezas cada uno con su marca en el servidor); `mechanical.spec.ts` (la disposición del símbolo con la flecha a cada lado, la bandera, la cola; las patas a 60°, la barra, el círculo, el giro) | Símbolos compuestos (dos tipos en el mismo lado), contorno del cordón, intermitencia (paso), símbolos de acabado con Rz/Rmax o valor máximo y mínimo: todavía no. Tampoco son entidades: mismas consecuencias que el globo. |
| Cajetines ISO/ANSI/DIN/JIS, AMPOWERDIM, referencias cruzadas de piezas, centros de agujero y chaveteros paramétricos, cálculo de tornillería | 0 | — | Fuera de esta ola y dicho: el cajetín es una plantilla de lámina (Frente 1), el resto es contenido paramétrico sobre lo que ya existe. **Todavía no.** |

## El veredicto de Firefox y el instrumento de la distancia (Ola 0, 2026-09-03)

La campaña «Valle Design → mejor que AutoCAD completo» midió antes, sobre
`main` @11fc202 y leyendo el resumen de Playwright de los cuatro fragmentos de
la corrida 33689365758: 502 pruebas pasadas entre los dos navegadores, **dos**
rojos y uno intermitente. Los dos rojos eran de Firefox y ninguno era del
producto. Y una premisa del encargo quedó corregida por la medida: los goldens
heredados 10, 19, 46 y 53, que se daban por rojos en Firefox, **pasan** — viven
en los fragmentos 1 y 2, que salieron sin un solo fallo.

| Capacidad | Peldaño hoy | Evidencia | Qué falta para subir |
| --- | --- | --- | --- |
| El barrido de cables sueltos aguanta que un control NAVEGUE (Firefox aborta el `goto` que le cae encima; Chromium se lo traga) | 5 | rebanada 3/4 verde en local con la API real bajo Xvfb: 145 de 582 controles, 141 con efecto, 0 sin efecto, 2 no localizables — las mismas cifras que CI | Nada de peldaño. La espera es de la PRUEBA, no del producto: que un control navegue sigue siendo legítimo y por eso no se convierte en fallo. |
| El reparto de dos dedos = encuadre / un dedo = designación | 5 en Chromium · **no aplicable** en Firefox | golden 72 apartado (d); el motivo viaja en `test.info().annotations` y se ve en el informe | Playwright sólo puede inyectar contactos múltiples por `Input.dispatchTouchEvent`, que es del protocolo de Chromium. No es una carencia del producto ni de Firefox: es una puerta que la herramienta no abre. El día que la abra, el `if` se cae. Mismo trato que el golden 56 de la tableta. |
| Una rama puede verificar Firefox ANTES de fusionar | 5 | `.github/workflows/ci.yml`: `[firefox]` en el mensaje del commit o en el título del PR; en `main` sigue siendo obligatorio y no se puede quitar | Nada de peldaño. Sigue sin correrse por defecto en rama, y el motivo es el de siempre: duplica ~30 min de runner. |
| La distancia contra AutoCAD completo se mide con un instrumento repetible | 3 | `scripts/cad/distancia-probe.mts` (`npm run probe:distancia`): ejecuta `begin()` contra el registro real, cuenta trazados de sombreado y ranuras de tipo de línea, y mira los cinco reflejos | Peldaño 4 exige un oráculo ajeno: hoy la lista de referencia son nombres del manual público de AutoCAD y quien juzga el porcentaje es una persona. La prueba de los cinco minutos con cinco arquitectos (Ola 11) es esa evidencia independiente. |

## El reconocimiento en los diez segundos (Ola 1, 2026-09-03)

La campaña midió antes, con el instrumento A del informe de distancia
convertido en golden (`apps/web/e2e/golden/85-cad-diez-segundos.spec.ts`, diez
renglones con `expect.soft` para que un rojo no tape los nueve siguientes):
**7 de 10**. Reprobaban el 8 (doble clic), el 9 (rueda al cursor: el punto de
mundo bajo el puntero se iba 1.394 unidades) y el 10 (`U` respondía «Comando
desconocido»). Después de esta ola: **10 de 10**.

| Capacidad | Peldaño hoy | Evidencia | Qué falta para subir |
| --- | --- | --- | --- |
| La prueba de los diez segundos, entera | 5 | golden 85: teclear con el lienzo enfocado, Espacio termina y repite, `M`→MOVE y `E`→ERASE afirmados por su EFECTO, ventana y cruce, doble clic, rueda y `U` | Peldaño 6 es la prueba de los cinco minutos con cinco arquitectos (Ola 11): un golden mide gestos, no desconcierto. |
| `U`, `UNDO` y `REDO` como órdenes del registro | 5 | golden 85 renglón 10; `history-host.spec.ts` (9 comprobaciones: cuenta los pasos que DIO, no dice «Hecho») | `OOPS` no está y se dice: restituir lo último BORRADO sin deshacer lo demás exige saber QUÉ hizo cada entrada del historial, y `CanonicalHistory` guarda snapshots sin etiqueta. Las opciones de control de `UNDO` (Auto, Marca, Retorno) piden la misma estructura. **Todavía no.** |
| La rueda acerca al punto que hay bajo el cursor | 5 | golden 85 renglón 9 (deriva < 10 % de lo que la vista mide en 200 px); `plan-wheel-anchor.spec.ts` (12 comprobaciones de la aritmética pura); `camera-policy.spec.ts` (23) | Nada de peldaño. El anclaje CORRIGE después de OrbitControls en vez de sustituirlo: el día que el modo plano tenga controles propios, esta corrección se cae sola. |
| La cámara no planea al soltar | 5 | `camera-policy.spec.ts`: `enableDamping = false` en los dos modos | Nada de peldaño. |
| El doble clic abre el editor del objeto | 5 | golden 85 (MTEXT) y golden 86 (TEXT → DDEDIT con el objeto ya designado); `double-click-verb.spec.ts` (22, contra el registro real) | Ocho tipos responden (mtext, text, mleader, cota, atributo, tabla, inserción, polilínea). El sombreado y la referencia externa NO, y no se finge: `HATCHEDIT` y `REFEDIT` no existen todavía. La imagen tampoco: `IMAGEADJUST` pide sus valores por la línea y abrirlo a ciegas con dos clics sería más sorpresa que ayuda. |
| `TABLEDIT`: cambiar lo que dice una celda | 3 | `command-integrity` (247 comandos, 0 éxitos falsos); el doble clic sobre una tabla lo arranca con la tabla designada | La celda se pide por FILA y COLUMNA porque el motor no ve la pantalla. Insertar y borrar filas, fusionar celdas y `DATALINK` no están: son órdenes propias en AutoCAD y prometerlas dentro de ésta sería un éxito falso. |
| Un icono por comando en la cinta | 5 | `command-icons.spec.ts` (247 comandos, 175 dibujos distintos, 0 mudos); golden 86 compara LINE/CIRCLE/ARC y las cinco de Modificar | Los dibujos son de **lucide** (ISC, ya en el árbol); lo propio es la ASIGNACIÓN. 175 para 247 significa que unas cuantas familias comparten dibujo — las trece restricciones geométricas no, que era el caso que importaba. |
| Ctrl+2 y Ctrl+3 | 5 | `editor-keyboard.spec.ts` (122); golden 86 los teclea y lee el diálogo | Los dos despachan la ORDEN por su nombre, así que el atajo y teclearla son la misma acción. |
| El selector de escala de anotación (CANNOSCALE) | 3 | `annotative-scale.spec.ts` (el reescalado del espacio modelo, 2,5 mm → 125 unidades a 1:50 y 250 a 1:100); golden 86 lo mueve y lee el documento que recibe el servidor | La escala vive en la SESIÓN y se pierde al recargar: `CadDocumentMeta` no tiene campo para ella y añadirlo es tocar el formato persistido. **Decisión del titular**, con su propuesta en el informe de la ola. Y una lámina sigue sin poder llevar DOS escalas de anotación: eso pide representaciones por escala en cada objeto, que es formato nuevo también. |

## La primera hora con un plano ajeno (Ola 2, 2026-09-03)

La campaña midió antes, con el informe de distancia y con el propio árbol:
`XATTACH` figuraba en `command-integrity.json` como **honesto-limitado** —la
orden entera terminando en «el editor no me pasa la biblioteca»— y el mismo
dibujo con un estilo `ISOCP.shx` salía al PDF con **13** segmentos de camino y
un `(PLANTA BAJA)` escrito en helvetica. Después: `XATTACH` es **delegado** y el
mismo PDF lleva **69** segmentos y ni un rótulo de esa familia como texto.

| Capacidad | Peldaño hoy | Evidencia | Qué falta para subir |
| --- | --- | --- | --- |
| `XATTACH` adjunta un dibujo ajeno tecleado | 5 | golden 87 sobre el documento que recibe el SERVIDOR; `xref-host.spec.ts` (8); `xrefs.spec.ts` (49) | Nada de peldaño para adjuntar. Lo que no hay es **catálogo del inquilino en el motor**: sin él la orden no puede listar («?» dice que escriba el activo). Enseñar una lista pide que el estudio publique la biblioteca en `context.xrefCatalog`, y eso vive en el monolito. **Todavía no.** |
| La cadena de reparación de un plano ajeno, seguida | 5 | golden 88: `AUDIT`·`PURGE`·`LAYTRANS`·`CHECKSTANDARDS`·`ETRANSMIT` tecleadas sobre el mismo dibujo, afirmando sobre el documento del servidor y sobre los BYTES del paquete | Peldaño 6 pide archivos ajenos REALES con permiso para redistribuirlos: hoy el dibujo de la prueba lo siembra la propia prueba. Es la decisión del titular del informe de la ola. |
| Una `.shx` se imprime como trazos en la lámina y en el PDF | 5 | `plot-shx-pdf.spec.ts` contra los bytes del archivo, con Arial de contraste; `plot-stroke-text.spec.ts` (26); `paper-space-stroke-text.spec.ts` (32) | Los trazos son de **Hershey** (dominio público, gobierno de EE. UU.), no del binario `.shx`: las anchuras no son las mismas y `mtext-fonts.ts` lo declara con `metricsDiffer: true`. Interpretar el formato `.shx` no está y no se finge. Un rótulo con **máscara de fondo** se queda como texto: la máscara es una caja rellena y el PDF de trazado dibuja todo camino con `"S"`. Y la rúbrica **retiene 1 pt** en la fila MTEXT porque toda su evidencia es propia: el oráculo ajeno que falta es cotejar la transcripción de la tabla Hershey contra la publicación original, no una prueba más escrita aquí. **Todavía no.** |
| El giro de un rótulo en el papel es el del dibujo | 5 | `plot-text-rotation.spec.ts` sobre la matriz `Tm` del archivo: a 90° el coeficiente `b` pasa de −1 a +1, y a −90° se invierte | Nada de peldaño. Quedó alineado con `sheet-set-pdf.ts`, que ya usaba el signo correcto, y con `cadImagePlotPlacement`, que ya lo documentaba. |
| El corpus de dibujos ajenos | 3 | el corpus DXF sintético que ya existía (`build-dxf-external-corpus.mjs`) | Peldaño 4 exige oráculo ajeno: archivos de terceros con procedencia y permiso, y una matriz de entidades por archivo con las pérdidas declaradas. **Decisión del titular**, con su propuesta en el informe de la ola. |

## Bloques y publicación (Ola 3, 2026-09-03)

La campaña midió antes con el propio árbol y encontró **el mismo defecto tres
veces**: un subsistema entero escrito, probado y sin un cable. `PUBLISH` y
`SHEETSET` respondían siempre «el conjunto no está cargado en este estudio»
(`P1-8`); elegir una tabla de plumas con `PAGESETUP Estilos` dejaba la hoja SIN
PODER TRAZARSE, porque no había ninguna cargada; y `ATTSYNC` no existía, así
que redefinir un bloque dejaba desfasadas todas sus referencias.

| Capacidad | Peldaño hoy | Evidencia | Qué falta para subir |
| --- | --- | --- | --- |
| Publicar un CONJUNTO de planos tecleado | 5 | golden 89: `SHEETSET Índice` lista lo que vino del servidor, `Renumerar` deja `A-101, A-102` en el cuerpo del PUT con su `expectedVersion`, y `PUBLISH` entrega un PDF de 3 páginas contadas sobre el archivo; `sheet-set-host.spec.ts` (31) | No hay INTERFAZ de conjuntos: se opera por la línea de comandos y el conjunto se nombra por su id. Un panel que los liste es trabajo de otra ola. **Todavía no.** |
| El conjunto se guarda con CAS y un 409 no se reintenta | 5 | `sheet-set-host.spec.ts`: el conflicto se cuenta, se olvida la copia en la mano y la orden siguiente lee del servidor | Nada de peldaño. Es la misma disciplina que el documento. |
| Trazar con una tabla de plumas | 5 | golden 46 (`PSET Estilos Monochrome.ctb` y la hoja SE TRAZA) y golden 91 (el `.ctb` del despacho, cargado desde un archivo de verdad y usado); `plot-style-catalog.spec.ts` (22) | Las tablas viven en la SESIÓN y se pierden al recargar. Persistirlas por inquilino es formato nuevo —**decisión del titular**— o un endpoint nuevo; mientras tanto se cargan cuando hacen falta. Y no hay EXPORTAR una tabla comprimida: el camino sólo importa, y lo dice. |
| `ATTSYNC` | 5 | golden 90 sobre el documento que recibe el servidor: conserva lo escrito, añade lo nuevo, retira la huérfana, fija el constante y recalcula la geometría desde la definición; `attribute-sync.spec.ts` (26) | Nada de peldaño para sincronizar. `BATTMAN` —gestionar el orden y las propiedades de los atributos— no está, y no se finge. |
| Las presentaciones viajan en el DXF | 0 | ninguna: `dxf-export.ts` no tiene noción de espacio papel | Peldaño 1 exige escribir los bloques `*Paper_Space`, los objetos `LAYOUT` de la sección OBJECTS y las entidades `VIEWPORT`, y leerlos de vuelta. Es una ola entera y está medida en el informe. **Todavía no.** |

## De 3D a documentación (Ola 4, 2026-09-03)

| Capacidad | Peldaño | Evidencia | Qué falta para el siguiente |
| --- | --- | --- | --- |
| `FLATSHOT`/`SOLPROF` sobre el modelo del ARQUITECTO (muros, columnas, mobiliario), no sólo sobre `solid3d` | 5 | golden 92 sobre el documento que recibe el servidor: `UCS X 90` + `FLATSHOT` sobre dos muros en L deja el alzado con la altura del muro y cuenta lo excluido con su motivo; `flatshot-solids.spec.ts` (30) | Nada de peldaño para lo que hace. La altura sale del catálogo de arquetipos del visor: un `kind` que no está en él se queda fuera Y se cuenta, en vez de salir con la altura de otra cosa. |
| El HUECO se resta del muro: alzados y cortes con sus puertas | 5 | golden 92: «1 hueco(s) restado(s)» y vértices a la cota 2.200 —el dintel— que un muro entero no tendría; `flatshot-solids.spec.ts` | Hoy sólo la PUERTA es hueco, que es el único arquetipo del catálogo que atraviesa un muro. Una ventana sería la siguiente y bastará con marcarla ahí. |
| Qué tapa a qué ENTRE cuerpos distintos en la vista que llega a la lámina | 5 | `solview-model.spec.ts` (23) con control negativo: la clasificación por cuerpo daba 4 aristas vistas del muro tapado y se declaraba exacta; ahora da 0 | Nada de peldaño. Cuando el solucionador rechaza la escena se cae a la clasificación por cuerpo Y se declara `exact: false`: no se inventa exactitud. |
| Rótulo de vista con su escala, marca de corte y globo de detalle | 5 | `solview-annotations.spec.ts` (27) tecleando: «PLANTA BAJA», «CORTE A-A», `ESC. 1:N` en sus capas `-ROT`; la marca deja 7 líneas y 2 letras sobre la PLANTA; el globo mide el radio de lo ampliado | Sin marca de corte cuando la lámina no tiene una única planta: se crea igual y se AVISA, en vez de ponerla en la planta que no es. |
| La ampliación de un DEtalle se teclea | 5 | `solview-commands.spec.ts`: ×10 tecleado, ×2 con Intro, ilegible rechazada con motivo | Nada de peldaño. Era un ×2 fijo. |
| La PLANTA como corte horizontal a la altura del antepecho | 5 | `solview-model.spec.ts` con control negativo (la planta cortada tiene huella de corte, la cenital cero) y `solview-commands.spec.ts` tecleando `SOLVIEW PL 1200` | Sin campo nuevo: `sectionPlane` ya era opcional en cualquier vista. |
| Corte QUEBRADO y control de PROFUNDIDAD | 0 | ninguna | Piden dos campos nuevos en `CadViewportSectionPlane` (`path?: CadPoint3[]` y `depth?: number`). **Decisión del titular**, con propuesta concreta en el informe de distancia. **Todavía no.** |
| Una ventana de presentación que enseñe una cámara 3D | 0 | ninguna: `viewportTransform` es una afín 2D | El camino que hoy llega a la lámina y al trazado es aplanar a una placa. La ventana orientada en 3D es otra ola. **Todavía no.** |
| La familia `SECTIONPLANE`/`LIVESECTION` y `VIEWBASE`/`VIEWSECTION`/`VIEWDETAIL`/`VIEWUPDATE` por su nombre | 0 | ninguna | La capacidad está bajo `SOLVIEW`/`SOLDRAW`; los nombres no. **Todavía no.** |
| Un modelo 3D AJENO que entra (3DSOLID, MESH, REGION en DXF) | 0 | ninguna: `dxf-import.ts` los descarta antes del mapeador | **Todavía no.** |
| Las seis transformaciones 3D (`3DMOVE`, `3DROTATE`, `3DALIGN`, `MIRROR3D`, `3DARRAY`, `3DSCALE`) | 0 | ninguna | `CadEntityTransform` es estrictamente 2D. No es añadir comandos: es ensanchar el transporte de transformaciones y decidir, adaptador por adaptador, qué entidad sabe moverse en Z. No toca el formato persistido. **Todavía no.** |
| Las señales de una llamada se atienden en fila y ningún candidato ICE se tira | 5 | `call-session-host.spec.ts` (11) con control negativo: sobre el código anterior muere con el `InvalidStateError` de verdad | Queda un residual medido —tras un cruce de ofertas ninguno de los dos extremos llega a `iceConnectionState=checking`— anotado con su traza. La llamada de dos navegadores pasó 4 de 5 corridas. |

## La instalación eléctrica (Ola 5, 2026-09-03)

Electrical estaba marcado **fuera de alcance** en la tabla de los siete
toolsets. El titular retiró esa marca para esta campaña, con objetivo 4/4. Hoy
la fila de la rúbrica está en **3/4** —retiene 1 punto por tener sólo evidencia
propia— y lo que falta para el cuarto está abajo, con su motivo.

| Capacidad | Peldaño | Evidencia | Qué falta para el siguiente |
| --- | --- | --- | --- |
| Conductor con circuito, número y calibre, sin entidad nueva | 5 | golden 93 sobre el documento que recibe el servidor: dos POLILÍNEAS en `IE-CIR` con `ie:circuito`, `ie:numero` y `ie:calibre`; `wire-numbering.spec.ts` (25) y `electrical-wire.spec.ts` (26) | Nada de peldaño. La marca vive en `context.metadata`: no se añadió ningún tipo de entidad ni campo persistido. |
| El número lo pone el DIBUJO, no un contador | 5 | `wire-numbering.spec.ts` con control: sin el 7, el siguiente es 2 — el hueco queda libre y a la vista | Reutilizar un hueco sería peor: el «7» del plano entregado y el nuevo serían conductores distintos con el mismo nombre. Es una decisión, no una carencia. |
| Números repetidos cazados, vengan de donde vengan | 5 | `electrical-wire.spec.ts`: se copia el conductor con el ejecutor real y `AEWIRELIST` responde «REPETIDOS: C-1-1 en … y copia»; `AEWIRE` avisa ANTES de escribir | Nada de peldaño. Detecta también lo que entró por DXF ajeno o por fusionar dibujos, porque lee el documento. |
| Revisión contra la NOM-001-SEDE con la longitud REAL del plano | 5 | golden 93 y `circuit-check.spec.ts` (42) contra cuentas hechas a mano: 2 × 30 m × 20 A × 6,5 Ω/km / 1000 = 7,8 V = 6,1 % sobre 127 V | **Evidencia independiente**: los valores están transcritos de la norma y nadie externo los ha cotejado. Para el peldaño 4 hace falta que un tercero autorizado verifique la transcripción contra el texto oficial. |
| El tope del conductor pequeño (Art. 240-4(D)) manda sobre la ampacidad | 5 | `circuit-check.spec.ts`: el 12 AWG tiene 25 A de tabla y no pasa de 20 A de protección | Nada de peldaño. Sin esa regla la revisión aprobaría lo que la norma prohíbe. |
| Cuadro de cargas como TABLE del dibujo, con veredicto y límite | 5 | `data-extraction-commands.spec.ts`: la tabla lleva «Cuadro de cargas», el AVISO, los 30.0 m y «No sustituye el memorial de cálculo» | Nada de peldaño para lo que hace. No trae precios ni claves de compra: eso pide catálogo de fabricante. |
| Etiquetado de componentes: `-M1`, `-PB2`, `-LT3` en los ATRIBUTOS del bloque | 5 | `device-tags.spec.ts` (31) y `electrical-tag.spec.ts` (25): seis componentes etiquetados en UN paso de deshacer, la familia deducida del símbolo, la cuenta continuada desde la `-LT7` que ya estaba, y la repetida cazada aunque se escriba «m1» en vez de «-M1» | Va en atributos y no en metadatos a propósito: un atributo se DIBUJA, viaja al DXF como `ATTRIB` y `ATTSYNC` ya lo mantiene. Un metadato no se ve, y una etiqueta existe para verse. |
| Un símbolo cuya familia el catálogo no conoce se deja SIN TOCAR | 5 | `electrical-tag.spec.ts`: se cuenta con su id y no se etiqueta | Suponer la familia dejaría el componente mal para siempre; sin etiquetar al menos se ve. |
| Referencias cruzadas entre hojas (dónde continúa este componente) | 0 | ninguna | La etiqueta ya existe y es única; falta el vínculo entre láminas. **Todavía no.** |
| Escalerilla (ladder) y E/S de PLC | 0 | ninguna | Maquinaria de esquema unifilar de control, que no existe. **Todavía no.** |
| Plano de gabinete atado al esquema | 0 | ninguna | La huella del componente en el tablero y su vínculo con el símbolo. **Todavía no.** |
| Catálogo de fabricante | 0 | ninguna | Sin él, el cuadro de cargas no puede traer precios ni claves. **Todavía no.** |

## La planta de proceso (Ola 6, 2026-09-03)

Plant 3D estaba marcado **fuera de alcance**. El titular retiró la marca. La
fila de la rúbrica pasa de 0/4 a **2/4**: se otorga el criterio de P&ID y no el
de tubería 3D e isométricos, que no existe.

| Capacidad | Peldaño | Evidencia | Qué falta para el siguiente |
| --- | --- | --- | --- |
| El número de línea `6"-P-1001-CS150`, leído como lo escribe un proyectista | 5 | `plant/line-numbers.spec.ts` (29): comilla tipográfica, minúsculas, espacios y fracciones como `1-1/2"`; y las formas que NO son un número de línea | Nada de peldaño. El correlativo sale del dibujo y arranca en 1001, que es la convención: los de tres cifras se confunden con los de equipo. |
| Las cuatro comprobaciones que no piden el catálogo de nadie | 5 | `plant/line-numbers.spec.ts` y `plant-line.spec.ts` (28): número repetido, un servicio con dos especificaciones, diámetro no comercial y número ilegible contado con lo que se escribió | **No** se comprueba contra la especificación del proyecto, y el renglón lo dice: ése lo aprueba la ingeniería. Traer una especificación ajena sería un problema de derechos y un estorbo. |
| El METRADO de cada línea, medido sobre el plano | 5 | `plant-line.spec.ts`: `6"-P-1001-CS150 (12.0 m)` sobre una polilínea de 12.000 unidades en un dibujo en milímetros | Es lo que un P&ID de AutoCAD no puede dar: no está a escala. Aquí la línea sí lo está. |
| Catálogo de SEIS equipos dibujados desde primitivas | 5 | `plant-equipment.spec.ts` (34): los seis con geometría de verdad, no un rectángulo con nombre | Seis, y se dice el número en vez de prometer «todos». Añadir uno es añadir una entrada. Ninguna biblioteca ajena copiada, trazada ni adaptada. |
| El equipo nace CON su etiqueta, en un paso de deshacer | 5 | `plant-equipment.spec.ts`: `PIDEQUIP B` deja `P-101` en los ATRIBUTOS, la capa dada de alta sola y el bloque definido | Nadie coloca una bomba para dejarla sin nombre. El correlativo arranca en 101 y cada prefijo lleva el suyo. |
| El prefijo de etiqueta lo decide el PROYECTO | 5 | `plant-equipment.spec.ts`: se admite `BA` y se rechaza `BOMBAS` con motivo | La nomenclatura la fija la ingeniería; el programa no está para discutirla, sólo para que sea legible. |
| El P&ID entero, TECLEADO y afirmado sobre el documento del servidor | 5 | golden `94-cad-pid-planta.spec.ts`: tres líneas, la bomba, `PIDLIST` y `PIDEQUIPLIST` tecleados; después se afirma sobre lo PERSISTIDO —polilíneas con su marca, `INSERT` con `TAG` en atributos, definición de bloque en el documento, `TU-PROC` y `TU-EQ` en la tabla de capas— y se vuelve a medir el metrado sobre la geometría guardada | Nada de peldaño: es el tope de esta escala. Lo que falta es capacidad, no evidencia. |
| Ruteo de tubería 3D con cota y especificación | 5 | `pipe-route.spec.ts` (26) y `plant-route.spec.ts` (26): la longitud es la de TRES dimensiones —un montante de 3 m no es cero metros de tubo—, cambiar de elevación mete el vértice del montante, y la ruta llega al documento con z en cada vértice; golden 95 lo afirma sobre lo persistido | El comando se declara `spatial: true` porque conserva la cota de punta a punta. Lo que falta es el SÓLIDO de tubería con su diámetro real en el visor 3D: la ruta es el eje, y el exterior lo da un catálogo con dueño. **Todavía no.** |
| Accesorios deducidos de la geometría: codo, te y reducción | 5 | `pipe-route.spec.ts`: el codo sale del vértice que gira y con sus grados, la te del ramal que muere sobre el cabezal —y NO de un cruce a otra cota—, y la reducción de dos diámetros punta con punta | Se deducen, no se guardan: mover el vértice mueve el codo. Brida, válvula y soporte no los implica la geometría y **no se inventan**, y está dicho en el módulo. |
| Lista de materiales sacada del modelo | 5 | `plant-route.spec.ts`: `24.00 m de tubo` medidos en 3D (21 en planta) y `Codo 90° 6" CS150: 2 pz`; golden 95 la lee como TABLE del documento | Sin espesor, diámetro exterior, peso, clave de compra ni precio: eso es catálogo con dueño y no se transcribe. El límite va en el TÍTULO del cuadro, que es lo que se imprime. |
| Isométrico con longitudes VERDADERAS, norte y hoja | 5 | `isometric.spec.ts` (26): ejes a 30°/150°/vertical, el codo recto dibujado de 120°, y la diagonal que se dibuja de 1.000 midiendo 1.414 —el caso donde una cota mentiría—; `plant-iso.spec.ts` (22): dibujo, cuadro y HOJA en un paso, con la ventana encuadrando los dos; golden 95 | Por eso la longitud va como TEXTO y el título declara `SIN ESCALA`. Falta la salida en el formato de ISOGEN: la hoja es del documento. **Todavía no.** |
| Isométricos | 0 | ninguna | Sin ruteo 3D no hay de dónde sacarlos. **Todavía no.** |
| Catálogo de fabricante con claves y precios | 0 | ninguna | El metrado sale; la requisición valorada no. **Todavía no.** |
| Instrumento de panel y de programa | 0 | ninguna | Entra el de campo, que es el que más se dibuja, y está dicho en el módulo. **Todavía no.** |

## Los bloques dinámicos (Ola 7, 2026-09-03)

`blocks.dynamic` estaba en «todavía no» con este motivo: *«No hay bloques
dinámicos como tales (parámetros/acciones editables por grip).»* Se re-midió y
la mitad de la frase era peor de lo que decía: el MOTOR existía —683 líneas y su
spec verde— y **no lo importaba ni un comando ni un panel**.

| Capacidad | Peldaño | Evidencia | Qué falta para el siguiente |
| --- | --- | --- | --- |
| Colocar una familia dinámica tecleando, con sus parámetros | 5 | `dynamic-block.spec.ts` (40) y golden 96: la puerta llega al servidor con `din:familia` y `din:claro` encima, así que sigue siendo paramétrica después de guardar | Nada de peldaño. Los valores que no son comerciales se ajustan y **se dice** que se ajustaron: un claro de 0,873 sale 0,90 con su aviso. |
| Cambiar un parámetro sin mover ni volver a insertar el bloque | 5 | golden 96 sobre el documento persistido: mismo id, misma inserción, otra definición materializada, y el barrido de la hoja pasa de 900 a 1.000 | Es lo que distingue un bloque dinámico de borrar y poner otro. **Falta el GRIP**: hoy se cambia por orden sobre la selección, no arrastrando un tirador, porque el puntero no está enrutado al motor. **Todavía no.** |
| Volver dinámico un bloque DEL USUARIO | 5 | `user-dynamic-family.spec.ts` (33): el parámetro es una línea marcada DENTRO de la definición; estirar mueve lo de la punta, deja lo de la base y el círculo de la pata sigue siendo un círculo | Sin campo nuevo en el formato: la línea viaja al DXF y se apaga por capa. Sólo parámetro LINEAL con acción de estirar; girar y reflejar geometría cualquiera se rechaza **por su nombre**, con el motivo. |
| Comportamiento anotativo de un bloque | 5 | `dynamic-blocks.spec.ts`: la marca de nivel declara 3 mm de papel y la inserción los sella; `layout/annotative-scale.ts` los aplica | Entra por la misma puerta que el resto: `BLOQUEDIN` lo sella al colocar. |
| Estados de visibilidad y tablas de consulta | 0 | ninguna | Un bloque con estados —puerta de una hoja / de dos— no existe. **Todavía no.** |
| BEDIT abre la referencia EN SITIO, no el panel | 5 | `blocks-edit.spec.ts` v2: con una referencia designada o seleccionada, BEDIT saca la geometría sobre su punto de inserción; sin geometría, girada o por nombre cae al panel **y dice por qué** | Con esto la fila `blocks` llega a su tope de capacidad y sólo retiene 1 pt por evidencia propia. Falta editar en sitio una referencia GIRADA o ESCALADA. **Todavía no.** |
| Editar una referencia EN SITIO, sin explotarla | 5 | `reference-edit.spec.ts` (33): la geometría sale ENCIMA de la referencia designada, se edita con las órdenes de siempre, REFSET decide qué entra, REFCLOSE la devuelve a coordenadas del bloque conservando los ATRIBUTOS —lo que explotar perdía— y descartar deja la definición byte a byte igual | Los nombres son los de AutoCAD porque el gesto es el mismo. **Falta** que BEDIT sea ese editor (hoy abre el panel) y editar en sitio una referencia GIRADA o ESCALADA, que se niega por su nombre: devolver geometría girada no es trasladarla. **Todavía no.** |

## El grabador de acciones (Ola 8, 2026-09-04)

La familia de grabación de AutoCAD estaba en 0 de 5. La superficie entera de
automatización, en 4 de 36.

| Capacidad | Peldaño | Evidencia | Qué falta para el siguiente |
| --- | --- | --- | --- |
| Grabar lo tecleado como macro | 5 | `action-recorder.spec.ts` (25) y `action-recorder-host.spec.ts` (19); golden 97 teclea el circuito entero y afirma sobre el documento persistido | Los puntos se guardan como COORDENADAS y lo cancelado no entra. El macro es un `.scr` legible, no un formato propio. |
| Repetir un macro | 5 | golden 97: tras repetir, hay **dos** muros en el documento del servidor, los dos de 0 a 4.000 | Se repite por la MISMA puerta que un `.scr` (`runCadScript`), así que no hay dos intérpretes que diverjan. |
| Pausa para pedir datos a mitad de la repetición | 0 | ninguna | Es ACTUSERINPUT. Un macro de hoy repite exactamente lo grabado. **Todavía no.** |
| Guardar los macros entre sesiones | 0 | ninguna | Hoy viven en la sesión y se copian a un `.scr` desde el diálogo. Persistirlos pide un sitio nuevo en el formato: **decisión del titular**. |

## La revisión de entrega (Ola 9, 2026-09-04)

Sondeados **26 nombres de revisión contra el registro COMPUESTO** que usa el
estudio —el nativo más lo que aportan las rutinas `.lsp` y la consola, que es la
lección de la Ola 8—: existen 13 y son de dos clases. Los de AutoCAD miran el
ARCHIVO (`AUDIT`, `RECOVER`, `PURGE`) o las CAPAS (`CHECKSTANDARDS`,
`LAYTRANS`); los de esta campaña miran UNA disciplina cada uno (`AECHECK`,
`PIDLIST`, `PIDMTO`, `AETAGLIST`, `PIDEQUIPLIST`, `UPDATEFIELD`,
`BLOQUEDINLIST`). `REVISA`, `ENTREGA`, `PREFLIGHT`, `QAQC`, `VALIDATE`,
`DWGCHECK` y siete más: **cero**. Nadie pasaba el plano entero por todos sus
filtros de una vez.

| Capacidad | Peldaño | Evidencia | Qué falta para el siguiente |
| --- | --- | --- | --- |
| Una orden revisa el plano ENTERO antes de entregar | 5 | `delivery-review.spec.ts` (29) y golden 99: un plano sucio en DOS disciplinas a la vez —protección que no cabe en su conductor y un área que dejó de ser cierta al agrandar el local— y **una** orden que encuentra las dos, con el arreglo comprobado en el documento que recibe el servidor | Nada de peldaño. Lo que falta es ALCANCE: hoy mira eléctrico, planta, campos y sesión de trabajo, no capas contra el estándar (eso es `CHECKSTANDARDS`) ni la integridad del archivo (eso es `AUDIT`). |
| El informe dice QUÉ MIRÓ, no sólo qué encontró | 5 | `delivery-review.spec.ts` caso 1: un dibujo vacío no dice «limpio», declara las áreas que no aplican; el caso 8 es el negativo de control —un dibujo correcto no inventa ni un hallazgo— sin el cual los otros siete los pasaría un módulo que dijera «todo mal» | Es la diferencia entre un informe y un certificado. `limits` viaja SIEMPRE con el reporte, con hallazgos o sin ellos. |
| Clasificar por a quién le toca, no por gravedad sentida | 5 | golden 99: lo que **BLOQUEA** lo arregla el proyectista antes de firmar; el **aviso** lo decide la ingeniería. Arreglado el bloqueo de verdad, el veredicto pasa a entregable **sin tocar ningún umbral** | El criterio de cada hallazgo sale del módulo de dominio que ya lo publica: aquí no se implementa ni una regla. Si `AECHECK` cambia de criterio, `REVISA` cambia con él el mismo día. |
| Detectar una edición de referencia abierta al entregar | 5 | `delivery-review.spec.ts` caso 6: el dibujo lleva ENCIMA una copia de trabajo de un bloque y entregarlo así duplica esa geometría | **Este hallazgo AutoCAD no lo tiene** porque su REFEDIT es modal: no se puede guardar con una sesión abierta. Aquí sí, y por eso hay que decirlo. |
| Firmar el informe y archivarlo con la entrega | 0 | ninguna | Un informe que se archiva con el plano necesita un sitio en el formato persistido: **decisión del titular**. Hoy el informe se lee en la línea de comandos y se vuelve a producir tecleando `REVISA`. **Todavía no.** |

## Cómo se usa

- **Al añadir una entrada nueva a `BACKLOG.md`:** decir el peldaño ACTUAL
  y el peldaño OBJETIVO. "Cerrar" una entrada sin subir de peldaño (por
  ejemplo, arreglar un bug en un código que sigue en peldaño 2) sigue
  dejando la fila en peldaño 2 — el peldaño no lo cambia haber arreglado
  un defecto, lo cambia haber sumado la evidencia del peldaño siguiente.
- **Al escribir una frase de marketing/ventas:** el peldaño MÍNIMO para
  "lo probamos" es 3; para "compatible con X" es 4; para venderlo
  activamente es 6. Una frase que promete más que el peldaño real de su
  fila es exactamente la clase de mentira que la campaña Paridad completa
  existe para cerrar.
- **Al revisar la rúbrica:** `propia`/`independiente` en el reporte de
  `rubric.mjs` es el corte 3-vs-4 de esta escalera, no toda ella —
  `rubric.mjs --markdown` enlaza aquí para el resto del criterio.
- **Este documento NO se audita solo:** no hay gate automático que
  confirme que el peldaño declarado de cada fila sigue siendo cierto. Es
  la misma clase de honestidad manual que exige `docs/execution/BACKLOG.md`
  cerrando entradas con su commit — se mantiene actualizándolo cada vez
  que una fila real sube o baja, no de una vez y para siempre.
