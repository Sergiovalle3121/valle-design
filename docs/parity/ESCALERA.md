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
la campaña; dos quedan fuera de alcance y se dice.

| Toolset | Peldaño hoy | Objetivo | Qué hay y qué falta |
| --- | --- | --- | --- |
| Architecture | 3 | 5 | WALL, DOOR y WINDOW existen con goldens propios (53); faltan escaleras, techos, cubiertas y las tablas de superficies y carpintería en la lámina (Ola E). |
| MEP (mitad 2D) | 0 | 3 | Nada: conductos, tuberías y bandejas en planta con sus tablas. Segundo de la campaña. |
| Map 3D | 0 | 3 | Nada: sistema de coordenadas georreferenciado y capas GIS. Tercero. |
| Raster Design (mitad útil) | 1 | 3 | IMAGE inserta un escaneo; falta el recorte por polígono, el ajuste de imagen y la vectorización. Cuarto. |
| Mechanical | 0 | 3 | Nada: normalizados y cotas de fabricación con tolerancia. Quinto. |
| Electrical | 0 | — | **Fuera de alcance** de la campaña: esquemas y numeración de hilos son otro producto. La fila existe para que el denominador sea honesto. |
| Plant 3D | 0 | — | **Fuera de alcance** de la campaña: P&ID y tubería 3D por especificación. Ídem. |

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
