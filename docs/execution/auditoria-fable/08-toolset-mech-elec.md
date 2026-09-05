# Auditoría 08 · Toolsets Mechanical y Electrical

**Fecha:** 2026-09-05
**Quién escribe:** ingeniero de despacho, veinte años, suscripción completa de
AutoCAD (modelo + presentaciones + los siete toolsets). Uso diario de AutoCAD
Mechanical para planos de fabricación —conjuntos atornillados, estructura
metálica ligera, ejes de transmisión, chapa— y de AutoCAD Electrical para
esquemas de control y planos de instalación: escalerilla, numeración de hilos
por proyecto, referencias cruzadas, E/S de PLC, regleta de bornes, plano de
gabinete y los informes que se le mandan al tablerista. Abro Valle Design por
primera vez con intención honesta de cambiarme, y estoy juzgando si el lunes
puedo entregar desde aquí.

**Alcance de esta auditoría (el que me dieron):**
· *Mechanical* — tornillería normalizada, perfiles de acero, listas de
materiales, globos, símbolos de soldadura y acabado, tolerancias, cadenas de
cota, ejes y ejes de simetría.
· *Electrical* — numeración de hilos, etiquetado de componentes, listas de
cables, esquemas de PLC, informes, catálogos de fabricante.

**Método:** leí primero `docs/competitive/rubric.json` (filas
`toolset-mechanical` y `toolset-electrical`),
`docs/competitive/autocad-2027-gap-matrix.md` (líneas 196 y 197),
`docs/parity/ESCALERA.md` §«El plano de fabricación (Ola I)» y §«La instalación
eléctrica (Ola 5)», `docs/execution/BACKLOG.md` y `AGENTS.md`. Después bajé al
árbol con Grep/Glob/Read: el manifiesto completo de 288 órdenes
(`apps/web/src/lib/cad/engine/command-manifest.ts`), los nueve módulos
mecánicos, los seis eléctricos, la cinta, el catálogo de símbolos, la ruta de
exportación DXF y los goldens 84 y 93. **No se ha modificado ni una línea de
producto.** Lo único que escribí es este fichero.

---

## 0. Veredicto

**2 / 10 contra AutoCAD completo con Mechanical y Electrical.**

La frase corta, y la voy a defender entera: **lo que existe está mejor
argumentado que lo de Autodesk y hay dos cosas que son objetivamente mejores;
pero de las dos disciplinas que me tocan sólo puedo entregar media —el detalle
de una pieza mecánica sencilla— y del esquema eléctrico no puedo entregar
nada, porque no hay con qué dibujarlo.**

Digo primero lo bueno, porque un 2 se lee como desprecio y no lo es.

**`DIMTOLERANCE` con ajuste ISO 286 es mejor que lo que hace AutoCAD.** En
AutoCAD yo abro el estilo de cota, activo DIMTOL y tecleo a mano la desviación
superior e inferior que acabo de buscar en una tabla en papel. Aquí tecleo
`H7` y `dimension-tolerance.ts` calcula las desviaciones **sobre lo que esa
cota mide de verdad** (Ø40 → +0,025/0), rechazando con motivo los agujeros
K/M/N/P porque les falta la corrección Δ en vez de calcularlos mal. Eso es
menos trabajo y menos error que en AutoCAD, y el rechazo honesto vale tanto
como el cálculo.

**`AECHECK` hace algo que AutoCAD Electrical NO PUEDE HACER, y el módulo lo
argumenta bien** (`electrical/circuit-check.ts:1-40`): los conductores de
AutoCAD Electrical son *esquemáticos*, no están a escala, así que el dibujo no
sabe cuánto mide un recorrido y la caída de tensión se calcula en Excel con
metros medidos a mano. Aquí el conductor es una polilínea a escala, la
longitud sale del plano, y la revisión contra la NOM-001-SEDE —ampacidad, tope
del conductor pequeño del Art. 240-4(D), Art. 240-6(A), Tabla 250-122 y caída
resistiva— sale de la propia geometría, con el límite escrito en el mismo
renglón y en el título del cuadro. Eso, tal cual, es un argumento de venta
contra Autodesk. No es una promesa: está en `nom-conductors.ts` (306 líneas) y
en `circuit-check.spec.ts` (514 líneas cotejadas contra cuentas a mano).

Y **el catálogo de normalizados está dibujado por alguien que sabe.** El
rodamiento sale con la representación simplificada general de ISO 8826-1 —y el
módulo explica por qué un plano de conjunto no dibuja pistas ni bolas—, la
chaveta se indexa por el **diámetro del eje** y no por la chaveta (que es lo
que uno tiene delante) con el intervalo `>` / `<=` bien puesto, y arrastra `t1`
y `t2` a la denominación porque son las cotas que se mecanizan y las que faltan
en el 90 % de los planos que llegan al taller
(`mechanical-parts-catalog.ts:96-135`). Eso lo escribió un proyectista, no un
programador copiando una tabla.

Ahora lo que me impide trabajar el lunes.

1. **No puedo dibujar un esquema de mando.** No existe ni un solo símbolo de
   esquema: no hay bobina, no hay contacto NA, no hay contacto NC, no hay
   relevador, no hay guardamotor, no hay fusible, no hay borne, no hay
   seccionador. Lo único eléctrico del catálogo son cuatro símbolos de
   **planta** —luminaria, contacto, apagador, tablero— en `mep-symbols.ts:86-134`.
   Un tablero de control de tres arrancadores es lo primero que hago cada
   semana y aquí no hay con qué empezarlo. Grep de `bobina|relevador|fusible|
   guardamotor|borne|regleta|ladder|PLC` en todo `apps/web/src/lib/cad`: cero
   aciertos en código de producto (sólo aparecen en la prosa de los comentarios
   que dicen que no existen).

2. **El número de conductor no se imprime.** `AEWIRE` calcula el número del
   dibujo, lo dice en el renglón de la orden y lo guarda en
   `context.metadata['ie:numero']` — y ahí se queda. `wireCommands`
   (`engine/commands/electrical-wire.ts:141-171`) inserta **la capa y la
   polilínea, nada más**. Grepeé `CAD_IE_NUMBER` en todo `apps/web/src`: sólo
   aparece dentro de `wire-numbering.ts`. En el plano trazado, en el PDF y en
   el DXF **no hay ningún «14»**. Un plano eléctrico cuya única razón de ser es
   que el electricista lea el número del hilo, y el número no se ve.

3. **No hay ejes ni marcas de centro.** No existe `CENTERLINE` ni `CENTERMARK`
   en el manifiesto de 288 órdenes. Ningún plano de fabricación mío sale sin
   ellos: el eje del barreno, el eje del árbol, el eje de simetría de la
   pieza. Hoy los tengo que dibujar con `LINE` y un tipo de línea eje-punto, y
   no siguen al círculo cuando lo muevo. El propio catálogo lo dice de pasada:
   «El eje de simetría no va dentro del bloque» (`mechanical-parts.ts:205`) —
   correcto como decisión de la pieza, pero entonces tiene que existir la orden
   que lo dibuja, y no existe.

4. **No hay despiece de estructura metálica.** `STEELSHAPE` dibuja la
   **sección** del PTR y dice su peso lineal en el renglón… que se pierde en
   cuanto el renglón se va: no hay prompt de longitud
   (`engine/commands/mechanical-parts.ts:287-338`), y `areaMm2` no se persiste
   en ninguna parte —`cadMechanicalBlockDefinition` guarda `nombre · norma` y
   nada más (`mechanical-parts.ts:483-492`)—, así que **la lista de materiales
   no puede dar ni metros ni kilos**. El entregable mexicano más común del
   toolset Mechanical es la lista de despiece con pesos, y aquí no sale.

La nota. Contra el toolset Mechanical completo doy **3/10**: hay catálogo,
globo, lista, soldadura, acabado, tolerancia y marco de control, todo real y
todo verificado; falta el eje, el datum, el peso, el agujero y todo lo
paramétrico. Contra el toolset Electrical completo doy **1,5/10**: hay
numeración, etiquetado y una revisión normativa que AutoCAD no tiene, pero
sobre un plano de **instalación**, no de **control**, y con el número
invisible. Promedio ponderado de la dimensión: **2/10**.

La rúbrica hoy da 3/4 y 3/4 = **6/8** a estas dos filas
(`autocad-2027-gap-matrix.md:196-197`), reteniendo un punto en cada una por
falta de evidencia independiente. **No discuto la rúbrica: sus criterios
declarados verifican de verdad.** Discuto lo que los criterios declaran. Dos
puntos por «biblioteca de tornillería y perfiles normalizados insertables» y
dos por «esquemas eléctricos: símbolos normalizados, numeración de conductores
y etiquetado» son criterios que este árbol cumple; AutoCAD Mechanical trae más
de 700 000 piezas normalizadas con agujero automático, y AutoCAD Electrical más
de 650 000 símbolos de fabricante con su número de parte. El 6/8 mide
honradamente lo que la rúbrica preguntó; no mide la distancia. Por eso este
informe pone 2/10 y no 7,5.

---

## 1. Lo que hay, mirado uno por uno

### 1.1 Mechanical — el inventario real

| Qué | Dónde | Estado leído en el árbol |
| --- | --- | --- |
| `STDPART` (alias `AMCONTENTLIB`, `NORMALIZADO`, `TORNILLO`) | `engine/commands/mechanical-parts.ts:211-278`, manifiesto línea 163 | Tornillo ISO 4017, tuerca ISO 4032, rondana ISO 7089, rodamiento ISO 15, chaveta ISO 773. Se insertan como bloques `MECH-…` escalados a la unidad del documento (`scale = 1 / cadMillimetresPerUnit`, línea 76). |
| `STEELSHAPE` (alias `AMSTLSHAP2D`, `PERFIL`) | `engine/commands/mechanical-parts.ts:287-338` | PTR, OC, LI, CPS, IPR **por medidas tecleadas**; secciones y áreas correctas (verifiqué las cinco fórmulas a mano en `mechanical-parts.ts:407-478`). |
| `BALLOON` (alias `AMBALLOON`, `GLOBO`) | `engine/commands/mechanical-annotate.ts:79-120` | Cuatro entidades con marca `context.metadata.mechanical = "balloon"`; numera solo con el mayor + 1; se queda con el id del bloque designado. |
| `BOM` (alias `AMBOM`, `LISTAMATERIALES`) | `mechanical-bom.ts` + `mechanical-annotate.ts:200-250` | TABLE marcada `mechanical = "bom"` con **«Actualizar»** que la reescribe por `replace` conservando el id. Esta pieza es de las mejores del repositorio. |
| `WELDSYMBOL` / `SURFACESYMBOL` | `mechanical-symbols.ts` (316 líneas), `engine/commands/mechanical-symbols.ts` | ISO 2553/AWS A2.4 con nueve tipos, lado flecha/otro/ambos, todo alrededor, en obra y cola; ISO 1302 con Ra, arranque obligatorio/prohibido y dirección de estrías. Geometría suelta con marca, no entidad. |
| `DIMTOLERANCE` (alias `TOLERANCIA`, `DTOL`) | `dimension-tolerance.ts` (256 líneas) | Simétrica, desviaciones, límites y `Ajuste` ISO 286 (D–H, JS; d–h, js, k, m, n, p; IT5–IT11; ≤ 500 mm). Rotula en visor, lámina y DXF. |
| `TOLERANCE` (marco de control ISO 1101) | `engine/commands/annotate-tolerance.ts` (323 líneas) | Las catorce características con su símbolo Unicode, Ⓜ/Ⓛ, datums por letra, casillas dibujadas. |
| Subestilos de cota por familia `ISO-25$4` | `dimension-family.ts` | Existe, con el nombre exacto de AutoCAD. |
| Cadenas de cota | manifiesto líneas 40-41, `engine/commands/annotate-dimension-chains.ts` | `DIMBASELINE` (DBA) y `DIMCONTINUE` (DCO) existen y son tecleables. También `QDIM`, `DIMORDINATE`, `DIMARC`, `DIMEDIT`. |
| Vistas del sólido | manifiesto: `SOLVIEW`, `SOLDRAW`, `SOLPROF`, `FLATSHOT`, `SECTION`, `SLICE` | Existen. |
| Catálogo de medidas | `mechanical-parts-catalog.ts` (180 líneas) | 26 rodamientos (62xx/63xx) y 16 filas de chaveta con `t1`/`t2` y la serie de longitudes de ISO 773, con aviso de vecinas. |

**Cobertura del catálogo de tornillería, medida:** `CAD_METRIC_SIZES`
(`mechanical-parts.ts:87-95`) tiene **siete** métricas: M6, M8, M10, M12, M16,
M20, M24. Sólo paso grueso. Sólo cabeza hexagonal. Sólo rosca completa (ISO
4017). Ni M5, ni M14, ni M30, ni paso fino, ni ISO 4762 (allen), ni ISO 10642
(avellanado), ni rondana de presión, ni tuerca de seguridad, ni nada en
pulgadas — y una parte grande de la tornillería que compro en México es en
pulgadas.

### 1.2 Electrical — el inventario real

| Qué | Dónde | Estado leído en el árbol |
| --- | --- | --- |
| `AEWIRE` / `AEWIRELIST` | `engine/commands/electrical-wire.ts` (377 líneas), `electrical/wire-numbering.ts` (212) | Polilínea con `ie:circuito`, `ie:numero`, `ie:calibre` en metadatos, capa `IE-CIR` dada de alta sola. Detecta números repetidos vengan de donde vengan. |
| DE/A y sueltos | `electrical/wire-connections.ts` (337 líneas) | Cruza los extremos del recorrido con los componentes etiquetados por cercanía, **declara el criterio y la tolerancia en el propio renglón**, y caza el conductor que «parece» llegar al motor y muere a dos centímetros. Muy bien hecho. |
| `AETAG` / `AETAGLIST` | `engine/commands/electrical-tag.ts` (270 líneas), `electrical/device-tags.ts` (172) | Etiqueta `-M1` en los **atributos** del bloque, no en metadatos, con el argumento correcto: un atributo se dibuja y viaja al DXF como `ATTRIB`. `Todos` etiqueta el plano en un solo paso de deshacer. |
| `AECIRCUIT` / `AECHECK` | `engine/commands/electrical-circuit.ts` (263 líneas), `electrical/circuit-check.ts` (383) | Estampa protección/tensión/fases en todos los conductores del circuito en un lote; revisa contra la NOM. |
| Cuadro de cargas | `data-extraction/circuit-schedule-table.ts` (102 líneas), `DATAEXTRACTION` → `circUitos` | TABLE de once columnas con veredicto y el límite **en el título**, que es lo que se imprime. |
| Símbolos | `mep-symbols.ts:86-134` | Cuatro: luminaria, contacto, apagador, tablero. |
| Tabla de conductores NOM | `electrical/nom-conductors.ts` (306 líneas) | Ampacidad, Ω/km, tope del conductor pequeño, capacidades estándar del 240-6(A) incluidas las de sólo fusible, Tabla 250-122 con la trampa de «sin exceder de» bien codificada. |

Seis órdenes, todas en el panel **«Instalaciones»** de la cinta junto a PIPE,
DUCT y las de Plant (`ribbon.ts:146`). No hay pestaña Electrical.

---

## 2. Los huecos, por lo que más me duele

### H-1 · No existe el esquema: no hay un solo símbolo de control (BLOQUEANTE)

**AutoCAD.** AutoCAD Electrical trae la biblioteca JIC/IEC completa —contacto
NA, contacto NC, bobina de contactor, relevador, temporizador, guardamotor,
fusible, seccionador, interruptor de límite, presostato, piloto, borne— y más
de 650 000 símbolos de fabricante con su número de parte. Con eso dibujo el
esquema de mando de un arrancador estrella-triángulo en veinte minutos.

**Valle hoy.** `mep-symbols.ts` tiene ocho símbolos totales y **cuatro
eléctricos**: `MEP-LUMINARIA`, `MEP-CONTACTO`, `MEP-APAGADOR`, `MEP-TABLERO`
(líneas 86-134). Los cuatro son símbolos de **planta de instalación**, no de
esquema. `familyForBlock` en `engine/commands/electrical-tag.ts:76-83` sólo
reconoce esas cuatro, así que de las ocho familias declaradas en
`CAD_IE_FAMILIES` (`device-tags.ts:49-58`) **cuatro son inalcanzables por
`AETAG Todos`**: `M` (motor), `PB` (botón), `TR` (transformador), `SN`
(sensor). No hay motor. En un toolset eléctrico no hay motor.

**El flujo que se rompe.** Llega el lunes el pedido: tablero de control de tres
bombas con alternancia. Abro Valle, tecleo `MEPSYMBOL`, y la lista de opciones
que me ofrece es válvula, difusor, rejilla, luminaria, contacto, apagador,
tablero y extractor. No puedo poner una bobina. No puedo poner un contacto
auxiliar. Cierro Valle y abro AutoCAD. **Esto solo ya decide el lunes**, y por
eso la nota de Electrical es 1,5 y no 4: lo construido —numeración, etiquetas,
NOM— sirve para el plano de instalación de una casa, que es media disciplina.

**Cómo se construye.** Un módulo nuevo `lib/cad/electrical/schematic-symbols.ts`
hermano exacto de `mep-symbols.ts` y de `plant/pid-symbols.ts` —que ya
demostraron el patrón dos veces—: `CadElectricalSymbol { id: "IEC-…",
entities(prefix): CadEntity[], keyword, label, family }` con **doce** símbolos
IEC 60617 dibujados desde primitivas (no copiados de ninguna biblioteca ajena:
son formas geométricas descritas en una norma pública, igual que el difusor y
la bomba que ya se dibujan). Doce y se dice doce: contacto NA, contacto NC,
contacto NA temporizado, bobina, bobina temporizada, relevador térmico,
fusible, seccionador, guardamotor, borne, piloto, motor. Orden `AESYMBOL`
gemela de `MEPSYMBOL`, con `family` prellenada para que `AETAG` deduzca el
prefijo sin preguntar — que es el mecanismo que ya existe. La capa: `IE-ESQ`,
hermana de `IE-CIR`.
**Coste: varios días.** El dibujo de cada símbolo es media hora; el patrón
está hecho dos veces.
**Verificación:** un `schematic-symbols.spec.ts` que afirme que los doce
devuelven geometría de verdad (no un rectángulo con texto: es el control que
`plant-equipment.spec.ts` ya aplica a los seis equipos), y un golden que
teclee `AESYMBOL` → `AETAG Todos` → `AEWIRELIST` y afirme sobre el documento
persistido que los doce llevan su `-K1`, `-F1`, `-M1`.

---

### H-2 · El número de conductor no se dibuja: el plano impreso no lo lleva (BLOQUEANTE)

**AutoCAD.** El número de hilo es un bloque con atributo que AutoCAD Electrical
coloca **sobre** el conductor, alineado con él, con la opción de arriba/encima
o en línea con corte del hilo. Se ve en pantalla, se traza en el PDF y viaja al
DXF. Es el objeto entero del toolset.

**Valle hoy.** `wireCommands` (`engine/commands/electrical-wire.ts:135-172`)
emite exactamente dos comandos: `{type:"layer", op:"upsert"}` para `IE-CIR` y
`{type:"insert"}` de la polilínea con `cadWireMetadata(...)`. **No hay MTEXT.
No hay bloque. No hay atributo.** El número vive sólo en
`context.metadata['ie:numero']`; grepeando `CAD_IE_NUMBER` en todo
`apps/web/src` los únicos cuatro aciertos están dentro de
`electrical/wire-numbering.ts` (líneas 49, 92, 173, 207).

**El flujo que se rompe.** Trazo doce conductores, `AEWIRELIST` me dice
«C-1: 1, 2, 3…», el número está bien calculado y bien cazado si se repite,
imprimo el plano y se lo doy al electricista: **el plano no tiene números.** El
sistema entero de numeración es correcto y es invisible. Es el hueco más barato
de cerrar de todo este informe y el que más ridículo deja el resto.

**Cómo se construye.** En `wireCommands`, después del `insert` de la
polilínea, añadir un `insert` de MTEXT en el punto medio del tramo más largo
del recorrido, rotado con el ángulo de ese tramo (normalizado a ±90° para que
nunca salga cabeza abajo), altura la del estilo de cota Standard —
`cadMechanicalTextHeight` ya resuelve exactamente eso en
`mechanical-annotate.ts:58-61` y es reutilizable—, con
`context.metadata = { ...cadWireMetadata(...), ieRotulo: "numero" }` para poder
volver a encontrarlo. Todo en el **mismo lote de deshacer**, que es la regla de
la casa y que `AETAG Todos` y `PIDEQUIP` ya cumplen. Y una orden `AEWIRELABEL`
que reponga los rótulos que falten en un dibujo que viene de un DXF ajeno —el
mismo patrón que `BOM Actualizar`.
**Coste: un día.**
**Verificación:** ampliar el golden 93 —que hoy afirma sobre las dos
polilíneas persistidas (`93-cad-circuito-nom.spec.ts:180-190`)— para que
afirme también que el documento del servidor contiene un MTEXT «1» y un «2» en
`IE-CIR`, y una prueba de que mover el conductor no deja el rótulo huérfano (o,
si se deja, que se diga en el módulo).

---

### H-3 · No hay ejes ni marcas de centro (BLOQUEANTE para Mechanical)

**AutoCAD.** `CENTERLINE` traza el eje entre dos rectas y `CENTERMARK` pone la
cruz del centro de un círculo o arco; los dos son **asociativos** desde 2017:
si muevo el barreno, el eje va detrás; si borro el círculo, el eje se va.
`CENTEREXE`, `CENTERLTYPE` y `CENTERCROSSSIZE` los gobiernan.

**Valle hoy.** Grep de `CENTERLINE|CENTERMARK` en el manifiesto de 288
órdenes: **cero**. Los únicos aciertos de «eje de simetría» en todo `lib/cad`
son el prompt de `MIRROR` (`engine/commands/modify-mirror.ts:62`) y el de la
restricción de simetría (`parametric-geometry.ts:123`). En
`create-patterns.ts:301` hay una variable local llamada `centerline` que es
otra cosa (el eje de una matriz de camino).

**El flujo que se rompe.** Placa con cuatro barrenos M12. Los inserto, los
acoto por coordenadas, y ahora tengo que poner las cruces de centro y los ejes
de la placa: los dibujo a mano con `LINE`, les cambio el tipo de línea a
eje-punto, calculo el sobresaliente de 3 mm a ojo, y cuando el cliente me
mueve un barreno 5 mm los cuatro trazos se quedan donde estaban. En un plano
de veinte barrenos eso son cuarenta trazos que mantengo a mano. Es exactamente
el trabajo que un CAD existe para no hacer.

**Cómo se construye.** No hace falta entidad nueva ni tocar el formato: el
patrón del globo y del símbolo de soldadura vale igual. `lib/cad/center-marks.ts`
con `cadCenterMarkEntities(circle, overshoot, layer, newId)` → dos `line` con
`linetype: "CENTER"` y `context.metadata.mechanical = "centermark"` +
`centerTarget: <id del círculo>`; `cadCenterlineEntities(a, b, …)` para el eje
entre dos rectas paralelas o entre dos círculos. Órdenes `CENTERMARK` (alias
`MARCACENTRO`) y `CENTERLINE` (alias `EJE`), kind `annotate`, en el panel
«Mecánica» de la cinta que ya existe (`ribbon.ts:149`). La asociatividad se
consigue como la del globo: se guarda el id del anfitrión en `centerTarget`, y
una orden `CENTERREGEN` —o el gancho que ya usa `BOM Actualizar`— rehace los
que apuntan a geometría movida. Declarar en el módulo que **no** se regeneran
solos todavía, que es la regla de la casa.
**Coste: varios días** (el eje entre dos rectas cualesquiera tiene su
geometría; la cruz del círculo son dos horas).
**Verificación:** `center-marks.spec.ts` con el sobresaliente medido y el caso
del arco (la cruz sólo se dibuja donde hay material); un golden que teclee
`CIRCLE` → `CENTERMARK` y afirme las dos líneas en `CENTER` sobre el documento
del servidor.

---

### H-4 · No hay despiece: la lista no da metros, ni kilos, ni material (ALTA)

**AutoCAD.** `AMPARTLIST` saca la lista con columnas configurables —cantidad,
denominación, norma, **material**, **medida en bruto**, **peso**— y
`AMSTLSHAP2D` coloca el perfil **con su longitud**, que es lo que alimenta el
peso. Es el entregable con el que se cotiza una estructura.

**Valle hoy.** Tres cosas leídas:
· `STEELSHAPE` no pregunta la longitud. Sus parámetros son sólo los de la
  sección (`mechanical-parts.ts:325-380`) y el prompt final es «Ángulo de
  rotación» (`engine/commands/mechanical-parts.ts:296-301`).
· El peso lineal se calcula **sólo para el renglón** que se lleva el viento:
  `` `, sección ${(area/100).toFixed(2)} cm², ${cadSteelKgPerMetre(area).toFixed(2)} kg/m` ``
  (`engine/commands/mechanical-parts.ts:338`).
· `areaMm2` **no se persiste**: `cadMechanicalBlockDefinition` guarda
  `description: nombre · norma` y `keywords: ["MECH", family]`
  (`mechanical-parts.ts:483-492`), y `cadMechanicalPartOf` sólo recupera esas
  dos cadenas (líneas 495-501). Después de guardar, nadie puede volver a saber
  cuánto pesa ese PTR.
· `BOM_HEADERS` son cinco: `Pos., Cant., Denominación, Norma, Bloque`
  (`mechanical-bom.ts:86`). Ni material, ni medida, ni peso, ni total.

**El flujo que se rompe.** Escalera metálica: 14 m de PTR 50,8 × 50,8 × 3,
6 m de LI 50,8 × 6,4, 22 tornillos M12 × 40. El cliente quiere el peso para
cotizar el galvanizado. Valle me dice «Pos. 1 · Cant. 1 · Perfil tubular
rectangular PTR 50.8 × 50.8 × 3». Cantidad **uno**, porque conté secciones
insertadas, no metros. Vuelvo a Excel — que es exactamente de lo que este
producto presume haber sacado al ingeniero eléctrico.

**Cómo se construye.** Tres pasos encadenados y ninguno toca el formato:
1. Añadir `Precise la longitud del tramo (mm), Intro para sólo la sección` al
   flujo de `STEELSHAPE`. Con longitud, el bloque se llama
   `MECH-PTR-50.8x50.8x3` igual que hoy (**el id no cambia**: es persistido) y
   la longitud viaja en `context.metadata.mechLength` del INSERT, no en el
   bloque — dos tramos distintos del mismo perfil son el mismo bloque, y eso es
   lo correcto.
2. Guardar `areaMm2` en la `description` del bloque como tercer campo tras el
   segundo `·` — `cadMechanicalPartOf` ya parte por el primer separador con
   `indexOf`, así que **añadir un tercer campo no rompe a los bloques viejos**;
   los que no lo traen devuelven `null` en área y la fila dice «—», que es el
   criterio de `dash()` del cuadro de cargas.
3. `BOM_HEADERS` pasa a ocho: `Pos., Cant., Denominación, Norma, Material,
   Medida, Peso unit. (kg), Peso total (kg)`, con fila de TOTAL. Y la palabra
   clave `CSV` en `BOM`, calcada de `DATAEXTRACTION → CSV`
   (`data-extraction-commands.ts:101-116`), que ya existe con su
   `host-request`.
**Coste: varios días.**
**Verificación:** `mechanical.spec.ts` amplía con el caso de la escalera
—14 m de PTR a 4,50 kg/m = 63,0 kg— cotejado a mano; el golden 84 afirma la
columna de peso en la TABLE que recibe el servidor; y un caso explícito de
bloque **viejo** sin área que sale con «—» y no rompe la tabla.

---

### H-5 · No hay identificador de datum: el marco de control referencia letras que no existen en la pieza (ALTA)

**AutoCAD.** `TOLERANCE` pone el marco, y `AMDATUMID` pone el identificador
—el recuadro con la letra y el triángulo relleno apoyado en la superficie— y
`AMDATUMTGT` los objetivos de datum. Sin el identificador, el marco es una
referencia colgada.

**Valle hoy.** `annotate-tolerance.ts` pide «Escriba las referencias (datums),
separadas por coma» (línea 103), las mayúsculiza y las mete en su casilla
(línea 288-293). Perfecto. Pero grep de `datumid|identificador de datum|datum
target` en `apps/web/src`: los únicos aciertos son de `lib/geo` —datum
geodésico, WGS84— y ninguno de dibujo mecánico. **No hay forma de poner la A en
la pieza.**

**El flujo que se rompe.** Brida: la cara de apoyo es el datum A, el barreno
piloto es B, y los ocho barrenos llevan `⌖ | Ø0.2 Ⓜ | A | B`. Escribo el
marco, sale perfecto… y el plano dice «respecto de A y B» sin decir en ninguna
parte qué es A y qué es B. Ese plano el taller me lo devuelve, y con razón: no
es un plano cotado, es un plano ambiguo. Es un fallo de **norma**, no de
comodidad — ISO 5459 exige el identificador.

**Cómo se construye.** `mechanical-symbols.ts` ya tiene el `Pen`, el
`arrowhead`, el `polyline` y el `mtext` que hacen falta. Añadir
`cadDatumIdEntities({ letter, target, box, layer, height })` → triángulo
relleno (polilínea cerrada) en el punto de la superficie + directriz + recuadro
con la letra, todo con `context.metadata.mechanical = "datum"` y
`datumLetter`. Orden `DATUMID` (alias `AMDATUMID`, `DATUM`) en el panel
«Mecánica». Y una comprobación que el marco de control ya puede hacer y hoy no
hace: al insertar un `TOLERANCE` que referencia `A`, avisar en el renglón si no
hay ningún datum `A` en el dibujo — el mismo criterio con el que `AEWIRELIST`
dice «no hay ningún componente etiquetado» en vez de callarse.
**Coste: un día** el símbolo; **horas** el aviso.
**Verificación:** `mechanical.spec.ts` con la geometría del triángulo y el
recuadro; una prueba de que `TOLERANCE` con datum `A` sin `DATUMID A` avisa; y
el aviso al revés (con el datum puesto, no avisa) como control negativo.

---

### H-6 · La numeración eléctrica es de un dibujo, no de un proyecto; y no hay referencias cruzadas (ALTA)

**AutoCAD.** El Project Manager de AutoCAD Electrical numera hilos y
componentes **a través de todas las láminas del proyecto**, y las referencias
cruzadas dicen «bobina en 3/L12, contactos en 5/C4 y 7/A2» y se **regeneran**
al mover el componente. En un tablero de 40 láminas eso es la mitad del valor
del toolset.

**Valle hoy.** `cadNextWireNumber` y `cadNextDeviceNumber` leen
`document.entities` — **un** documento (`wire-numbering.ts:110-121`,
`device-tags.ts:104-113`). Existe `SHEETSET` en el manifiesto y existe el
conjunto de planos (golden 89), pero ninguna de las dos funciones lo consulta.
La ESCALERA lo declara honestamente: «Referencias cruzadas entre hojas |
peldaño 0 | ninguna» (`ESCALERA.md:397`).

**El flujo que se rompe.** El tablero va en cuatro láminas. Empiezo la lámina
2 y `AEWIRE` me dice «C-1-1»: acabo de crear un segundo conductor 1 del
circuito C-1, y **`AEWIRELIST` no lo caza porque sólo mira su propio
documento**. Justo el error que el módulo presume de cazar, cometido por el
propio sistema en cuanto el proyecto pasa de una lámina. Y no puedo poner
«viene de la lámina 1».

**Cómo se construye.** Dos piezas, la segunda depende de la primera:
1. Ensanchar `CadCommandContext` con un `projectEntities?()` que devuelva las
   entidades de las demás láminas del conjunto de planos abierto (el conjunto
   ya existe), y hacer que `cadNextWireNumber`, `cadWireClashes` y
   `cadNextDeviceNumber` lo usen **cuando exista**, cayendo al documento solo
   cuando no —el mismo patrón de `context.entity` que ya se degrada con
   elegancia en `documentView()` (`electrical-wire.ts:71-78`).
2. `AEXREF`: para un componente etiquetado, buscar en el proyecto las demás
   apariciones de la misma etiqueta y estampar bajo el símbolo un MTEXT
   `3/L12` con marca `ieXref`, regenerable con `AEXREF Actualizar` — el patrón
   exacto de `BOM Actualizar`, que es la mejor pieza de este árbol y merece un
   segundo cliente.
**Coste: semanas** (la 1 es días; la 2, días encima).
**Verificación:** un spec con dos documentos donde el segundo continúa la
numeración del primero y caza la repetición cruzada, con **control negativo**:
sobre el código de hoy, la prueba muere.

---

### H-7 · Sin E/S de PLC, sin regleta de bornes y sin plano de gabinete (ALTA)

**AutoCAD.** Módulo de PLC insertado desde una base de datos de fabricante con
sus direcciones (`%I0.0`), la regleta generada del esquema (cada hilo que cruza
la frontera del gabinete es un borne, numerado), y el plano de gabinete con la
huella real del componente ligado al símbolo del esquema: cambio el
guardamotor y la huella cambia.

**Valle hoy.** Nada de las tres. `ESCALERA.md:398-400` lo dice sin adornos:
«Escalerilla (ladder) y E/S de PLC | 0 | ninguna», «Plano de gabinete atado al
esquema | 0 | ninguna». Lo confirmé con grep: `PLC`, `ladder`, `escalerilla`,
`borne`, `regleta`, `gabinete` no aparecen en código de producto.

**El flujo que se rompe.** El tablerista me pide la regleta. En AutoCAD la saco
del esquema en una orden. Aquí no tengo esquema (H-1), así que la pregunta ni
se plantea. **Este hueco está bloqueado detrás de H-1** y por eso va aquí y no
más arriba: sin símbolos de esquema no hay de dónde deducir un borne.

**Cómo se construye.** Después de H-1, y con la escalerilla como pieza
intermedia: `AELADDER` dibuja los dos raíles y numera los renglones (es
geometría trivial + una convención); un borne es un símbolo más del catálogo de
H-1 con `family: "X"`; y `AETERMINAL` recorre los conductores que tocan un
símbolo de borne y saca la regleta como TABLE con `De / Borne / A / Calibre` —
usando `cadWireConnectionReport` (`wire-connections.ts`), que **ya hace el
trabajo duro** de cruzar extremos con componentes y ya declara su criterio.
El plano de gabinete es la pieza cara y la dejaría para después.
**Coste: semanas.**
**Verificación:** golden que teclee `AELADDER` → `AESYMBOL` bornes →
`AETERMINAL` y afirme la TABLE sobre el documento persistido, con el criterio
de deducción **en el título de la tabla**, como el cuadro de cargas.

---

### H-8 · El globo, la soldadura, el acabado y el marco no son objetos (ALTA)

**AutoCAD.** `AMBALLOON`, `AMWELDSYM` y `AMSURFSYM` son objetos: agarro el
símbolo y se mueve entero con su directriz; agarro la pieza y el globo la
sigue; `AMBALLOON Renumerar` reordena la lista entera; los globos se apilan
solos cuando se tocan.

**Valle hoy.** El módulo lo declara y explica por qué
(`mechanical-symbols.ts:6-12`): una entidad `weld` o `balloon` sería tocar el
formato persistido, decisión del titular. La consecuencia real, en el árbol:
`cadBalloonEntities` devuelve **cuatro** entidades (línea, flecha, círculo,
mtext) con la misma marca; `cadWeldSymbolEntities` devuelve cinco o más; el
marco de `TOLERANCE`, otras tantas.

**El flujo que se duele.** Muevo el conjunto 200 mm a la derecha con una
ventana de captura: los globos vienen. Muevo **una pieza** y su globo se queda
apuntando al aire. Y no hay `Renumerar`: si intercalo la pieza 3 en un conjunto
de once, renumero once globos a mano borrando y rehaciendo, y la lista de
materiales —que sí se actualiza sola, bien por ella— reflejará fielmente el
desorden.

**Cómo se construye.** Sin tocar el formato, hay dos escalones baratos:
1. **`BALLOON Renumerar`**: recorre los globos ordenados por posición (arriba a
   abajo, izquierda a derecha, que es la convención), reescribe el número en su
   MTEXT y el `balloon` de los cuatro metadatos por `replace` —conservando ids—
   y llama detrás a la misma reconstrucción que ya usa `BOM Actualizar`
   (`mechanical-annotate.ts:200-250`). Un solo paso de deshacer.
2. **Selección solidaria por marca**: cuando el usuario designa una entidad con
   `context.metadata.mechanical`, extender la selección a las hermanas con la
   misma marca y el mismo `balloon`/`weldId`. Es una regla del selector, no del
   formato, y arregla el 80 % del dolor: el símbolo se mueve entero.
3. **Detección de globos repetidos** — hoy no existe (ver D-5), aunque los
   conductores sí la tienen.
**Coste: varios días** los tres.
**Verificación:** spec de `Renumerar` con globos desordenados y control de que
la lista queda coherente después; spec de selección solidaria con las cinco
entidades de un símbolo de soldadura.

---

### H-9 · El DXF pierde toda la inteligencia mecánica y eléctrica, y el manifiesto de pérdidas no lo declara (ALTA)

**AutoCAD.** El DWG lleva sus objetos propios; el DXF de AutoCAD Electrical
lleva la XDATA `VIA_WD_*` con el número de hilo y la etiqueta, y otro AutoCAD
Electrical la recupera entera.

**Valle hoy.** Grepeé `metadata` en toda la ruta de exportación
(`dxf-export.ts`, `dxf-document-export.ts`, `dxf-cad-document.ts`,
`dxf-entity-primitives.ts`). Los únicos dos usos de `context.metadata` que
suben al DXF son **la altura anotativa** (`dxf-cad-document.ts:555`) y **la
tolerancia de la cota** (`dxf-export.ts:131`). `ie:circuito`, `ie:numero`,
`ie:calibre`, `ie:proteccion`, `mechanical: "balloon"`, `mechanical: "bom"` —
ninguno viaja. Y `dxf-export-loss-manifest.ts` **no lo declara**: grepeando
`metadata` en ese fichero no hay un solo acierto (los dos aciertos de «marca»
son de `$PDMODE`).

**El flujo que se rompe.** Le mando el DXF al tablerista para que meta su
detalle. Me lo devuelve. Lo abro: los conductores son polilíneas amarillas en
`IE-CIR` sin circuito y sin número. `AECHECK` responde «No hay ningún circuito
que revisar». `AEWIRE` empieza a numerar **desde el 1**, y ahora tengo dos
conductores 1 en el mismo circuito — el error exacto que `cadWireClashes`
existe para cazar, provocado por el propio producto. Igual del lado mecánico:
los globos siguen dibujados, pero `BOM Actualizar` ya no los ve y la lista se
queda muda.

Y lo que más me molesta: **el manifiesto de pérdidas no lo dice.** Este
repositorio presume, con razón, de que lo que se pierde se declara. Aquí se
pierde la mitad del valor de dos toolsets en silencio.

**Cómo se construye.** Dos partes, y la primera es obligatoria aunque la
segunda no se haga:
1. **Declararlo hoy** en `dxf-export-loss-manifest.ts`: una entrada por
   familia de marca presente en el documento —«N conductor(es) con circuito,
   número y calibre: la marca no viaja al DXF y no se recupera al reimportar»—
   contada sobre el documento real, como las demás entradas. Horas.
2. **Escribirlo como XDATA propia**, con el mismo aplicativo y el mismo
   codificador que ya usan los bloques (`dxf-block-xdata.ts`) y la tolerancia:
   grupos 1000 con `clave=valor`, y en la importación reponer
   `context.metadata`. El transporte ya está resuelto dos veces en este árbol;
   es conectarlo al caso general.
**Coste: horas** la declaración; **varios días** el transporte.
**Verificación:** una prueba de ida y vuelta —documento con dos conductores y
un globo → DXF → reimportación— que afirme que el circuito, el número y la
marca sobreviven; y, mientras no exista, un spec que afirme que el manifiesto
**menciona** la pérdida (eso es fix-or-hide aplicado a la evidencia).

---

### H-10 · `STDPART` no perfora la pieza, y el catálogo es de siete métricas (MEDIA)

**AutoCAD.** Inserto un tornillo y AutoCAD Mechanical **hace el agujero** en
las chapas que atraviesa, con su holgura normalizada, y me pregunta si quiero
avellanado o caja. Suelto el tornillo y el agujero se cierra.

**Valle hoy.** `finishPart` (`engine/commands/mechanical-parts.ts:60-100`)
define el bloque y lo inserta. Nada más. Y el catálogo son siete métricas de
paso grueso, cabeza hexagonal, rosca completa
(`CAD_METRIC_SIZES`, `mechanical-parts.ts:87-95`). La ESCALERA ya lo dice:
«Sin M14, M30+, roscas finas, cabezas cilíndricas ni tornillería en pulgadas»
(`ESCALERA.md:284`).

**El flujo que se duele.** Unión atornillada de dos placas: pongo el tornillo,
y después dibujo a mano los dos agujeros Ø13 en las dos placas, con `CIRCLE` y
midiendo. Con dieciséis tornillos son treinta y dos círculos a mano y treinta y
dos oportunidades de equivocarse de holgura.

**Cómo se construye.** Escalón barato primero: la palabra clave `Agujero` en
`STDPART`, que además del INSERT emita, **en el mismo lote**, un `circle` de
diámetro de la serie media de ISO 273 (M10 → Ø11, M12 → Ø13, M16 → Ø17) en la
capa activa, en el punto de inserción. No es booleana sobre la chapa —eso pide
2D asociativo que no existe— pero quita el 80 % del trabajo y no miente: el
renglón dice «agujero Ø13 de holgura media, ISO 273; no se ha recortado
ninguna geometría». Escalón siguiente: ampliar `CAD_METRIC_SIZES` a M5, M14,
M30, M36 y añadir ISO 4762 (allen) como una familia más —es una tabla y una
función de dibujo, exactamente el trabajo que ya se hizo cinco veces.
**Coste: un día** el agujero; **un día** cada familia nueva.
**Verificación:** `mechanical.spec.ts` con los diámetros de ISO 273 cotejados
a mano y la afirmación de que el círculo y el INSERT salen en **un** lote.

---

### H-11 · El cuadro de cargas no se marca ni se actualiza — a diferencia de la lista de materiales (MEDIA)

**AutoCAD.** El panel schedule de AutoCAD Electrical se regenera del proyecto.

**Valle hoy.** Aquí hay una asimetría dentro del propio producto que salta a la
vista. `buildCadMechanicalBomTable` marca su tabla con
`mechanical: CAD_BOM_MARK` y `mechanical-bom.ts:126-134` la sabe reencontrar,
lo que permite `BOM Actualizar` con `replace` conservando el id — y el
comentario de cabecera explica muy bien por qué («insertar un tornillo más
dejaba el cuadro del plano diciendo dos donde había tres, y nadie avisaba»,
líneas 14-21). **`buildCadCircuitScheduleTable` no marca nada**
(`data-extraction/circuit-schedule-table.ts:70-101`): devuelve el
`scheduleTable` pelado. `DATAEXTRACTION → circUitos` hace `insert` a secas
(`data-extraction-commands.ts:141-148`).

**El flujo que se rompe.** Inserto el cuadro de cargas. Cambio el calibre de un
ramal. Vuelvo a teclear `DATAEXTRACTION → circUitos` y ahora tengo **dos**
cuadros de cargas superpuestos en el plano, y el viejo miente. En un documento
de seguridad eléctrica firmado por alguien, eso es peor que en la lista de
tornillos.

**Cómo se construye.** Literalmente copiar lo de al lado: `CAD_CIRCUIT_MARK =
"circuitos"` en el `context.metadata` de la tabla, `findCadCircuitTables`,
parámetro `entityId?` en el constructor para forzar el id, y la palabra clave
`Actualizar` en `DATAEXTRACTION`. Y de paso el mismo trato para el cuadro de
instalaciones, el de superficies y el de carpintería, que están igual.
**Coste: un día.**
**Verificación:** el spec que ya existe (`data-extraction-commands.spec.ts`
afirma «Cuadro de cargas», el AVISO y los 30,0 m) más un caso nuevo: cambiar
el calibre, actualizar y afirmar que la tabla es **la misma entidad** con
números nuevos, y que actualizar dos veces no escribe nada la segunda.

---

### H-12 · No hay tabla de barrenos ni cajetín normalizado (MEDIA)

**AutoCAD.** `AMHOLECHART` saca la tabla de barrenos con X, Y y diámetro
respecto de un origen, que es como se le manda una placa a una CNC. Y AutoCAD
Mechanical trae los cajetines de ISO 7200, DIN 6771, ANSI y JIS.

**Valle hoy.** Grep de `hole chart|holechart|tabla de barrenos`: cero.
Existe `DIMORDINATE` (manifiesto línea 50), que da la cota por coordenadas una
a una, pero no la tabla. Del cajetín, la ESCALERA lo declara fuera de la ola
(`ESCALERA.md:288`) y remite a la plantilla de lámina.

**El flujo que se duele.** Placa con veintidós barrenos de tres diámetros. En
AutoCAD: designo los círculos, elijo el origen, sale la tabla. Aquí: veintidós
`DIMORDINATE` en X, veintidós en Y, y el plano queda ilegible; o me lo llevo a
Excel.

**Cómo se construye.** Es de lo más barato de este informe porque la
infraestructura está toda: `lib/cad/mechanical-holes.ts` con
`buildCadHoleChart(view, origin)` que recoge los `circle` designados, los
ordena por Y descendente y X ascendente, les da letra por diámetro (A = Ø11,
B = Ø13…) y devuelve filas `[Marca, X, Y, Ø, Cant.]`; la tabla sale con
`scheduleTable`, la misma función que usan la lista de materiales y el cuadro
de cargas, con su marca `mechanical: "holechart"` para poder actualizarla.
Orden `HOLECHART` (alias `AMHOLECHART`, `BARRENOS`) en el panel «Mecánica».
**Coste: un día.**
**Verificación:** spec con nueve barrenos de tres diámetros comprobando el
orden, el agrupado por letra y el origen relativo; golden que la afirme como
TABLE en el documento del servidor.

---

### H-13 · Nada paramétrico: ni eje escalonado, ni engrane, ni resorte, ni cálculo de unión (MEDIA)

**AutoCAD.** `AMSHAFT` genera el árbol escalonado con sus chaflanes, sus
ranuras de anillo, sus cuñeros y sus rodamientos colocados; los generadores de
engrane, resorte, leva y correa; y los cálculos de unión atornillada, de eje y
de rodamiento con su informe.

**Valle hoy.** Nada. Declarado en `ESCALERA.md:288` («AMPOWERDIM, referencias
cruzadas de piezas, centros de agujero y chaveteros paramétricos, cálculo de
tornillería | 0 | — | **Todavía no**»). Lo comprobé: ningún acierto en el
manifiesto.

**El flujo que se duele.** El árbol de transmisión es el plano mecánico que más
repito. Aquí lo dibujo entero a mano — y con el rodamiento y la chaveta ya
resueltos (que están muy bien), lo que falta es el árbol que los sostiene.

**Cómo se construye.** El eje escalonado es el que más devuelve y el más
barato de los cuatro, porque las dos piezas difíciles ya están: `AMSHAFT`
pediría una lista de tramos `Ø × longitud` y emitiría el alzado —dos
polilíneas simétricas y las líneas de cambio de sección—, con `Chaflán`,
`Cuñero` (que llama a `cadKeySizeFor`, ya escrito) y `Rodamiento` (que llama a
`cadMechanicalBearing`, ya escrito) como palabras clave, y con el eje de
simetría de H-3. Todo en un lote. Los engranes y los resortes van detrás,
si acaso.
**Coste: semanas.**
**Verificación:** spec del árbol de tres tramos con el cuñero en su sitio y la
línea de eje; golden que lo teclee y lo afirme persistido.

---

### H-14 · `DIMSPACE`, `DIMBREAK` y las capas normalizadas (BAJA, pero se nota todos los días)

**AutoCAD.** `DIMSPACE` reparte las cadenas paralelas a distancia igual;
`DIMBREAK` corta la línea de cota donde cruza otra. Y AutoCAD Mechanical manda
cada cosa a su capa `AM_*` sola: el usuario no elige capa nunca.

**Valle hoy.** `DIMBASELINE` y `DIMCONTINUE` existen y funcionan, pero
`DIMSPACE` y `DIMBREAK` no están en el manifiesto. Y todos los símbolos
mecánicos van a `context.activeLayer`: el globo
(`mechanical-annotate.ts:105`), la soldadura, el acabado. En cambio el mundo
eléctrico **sí** tiene su convención de capas y la da de alta solo (`IE-CIR`
en `electrical-wire.ts:141-153`) — otra asimetría interna.

**Cómo se construye.** `DIMSPACE` es aritmética sobre cotas ya seleccionadas y
un `replace` por cota. Las capas: constantes `MECH-GLOBO`, `MECH-SIMB`,
`MECH-EJE` con `upsert` en el lote, exactamente como hace `AEWIRE` con
`IE-CIR`, y una opción de `OPTIONS` para desactivarlo.
**Coste: un día** las capas; **varios días** `DIMSPACE`/`DIMBREAK`.
**Verificación:** spec de reparto con tres cadenas y spec de que el globo nace
en `MECH-GLOBO` aunque la capa activa sea otra.

---

## 3. Defectos que encontré mirando el código

### D-1 · `cadCheckCircuits` agrupa por circuito **sensible a mayúsculas**; el resto del sistema no

`apps/web/src/lib/cad/electrical/circuit-check.ts:207` y `:215`

```ts
const entrada = porCircuito.get(wire.circuit) ?? { … };   // 207
…
porCircuito.set(wire.circuit, entrada);                    // 215
```

Todo el resto del subsistema normaliza a mayúsculas: `cadNextWireNumber`
(`wire-numbering.ts:118`, `circuit.trim().toUpperCase()`), `cadWireClashes`
(`:138`, clave `${wire.circuit.toUpperCase()} ${wire.number}`) y el filtro de
`AECIRCUIT` (`electrical-circuit.ts:126-128`, `wire.circuit.toUpperCase() === clave`).
Sólo la revisión agrupa por la cadena cruda.

**Cómo falla, concreto.** Trazo el primer tramo tecleando `C-1` (30 m) y el
segundo tecleando `c-1` (30 m) — el mismo circuito, escrito con la prisa del
segundo día. `AEWIRE` los numera 1 y 2 en la misma serie, así que **nada me
avisa de que he escrito dos cosas distintas**. `AECIRCUIT C-1` estampa los dos,
porque filtra en mayúsculas. Y `AECHECK` me devuelve **dos circuitos de 30 m**
en vez de uno de 60: la caída sale del 6,1 % en cada uno —bajo el tope— cuando
la real es del 12,3 %. **La revisión aprueba un circuito que no cumple, y el
cuadro de cargas imprime la mentira con veredicto «cumple».**

**Arreglo.** Normalizar la clave del `Map` a `wire.circuit.trim().toUpperCase()`
y conservar la primera grafía vista como etiqueta a imprimir (igual que
`cadWireClashes` guarda `circuit` sin normalizar dentro de la entrada). Es un
cambio de dos líneas. Y añadir el aviso: si el mismo circuito aparece con dos
grafías, decirlo, porque es un dedazo que el dibujante querrá corregir.

---

### D-2 · `cadEntityRunLength` ignora el `bulge`: mide la cuerda, no el arco

`apps/web/src/lib/cad/electrical/circuit-check.ts:132-147`

```ts
export function cadEntityRunLength(entity: CadEntity): number {
  const puntos: CadPoint3[] = entity.type === "polyline" ? entity.vertices : …;
  let total = 0;
  for (let i = 1; i < puntos.length; i += 1)
    total += Math.hypot(dx, dy, dz);
  return total;
}
```

El vértice de una polilínea de este documento lleva `bulge` —está declarado en
`cad-document.ts:229-238` con la convención DXF `tan(θ/4)`— y esta función lo
descarta. Un tramo con `bulge` se mide **por su cuerda**, siempre menos que el
arco: para un semicírculo, 2R en vez de πR, un **36 % de menos**.

**Cómo falla, concreto.** El conductor rodea una columna con un tramo curvo, o
—más probable— la polilínea entró por DXF desde el plano del arquitecto, donde
los arcos vienen con bulge. La longitud sale corta, la caída de tensión sale
proporcionalmente corta, y un circuito que está al 7 % se informa al 5,5 % y
**se aprueba**. La caída es lineal en la longitud: el error se traslada
íntegro. Y el argumento de venta entero de este módulo es «la longitud REAL del
plano».

**Arreglo.** Ya existe la pieza correcta en el árbol y con arco exacto:
`cadEntityCurves(entity)` (`curve-model.ts:138`) descompone la polilínea con
sus bulges y `curveLength(curve)` (`:339`) da la longitud exacta del arco.
Sustituir el bucle por `cadEntityCurves(entity)?.reduce((t,c)=>t+curveLength(c),0)`
y **conservar la suma en Z** para los tramos rectos (`curveLength` es 2D):
mezclar las dos es el único cuidado. Añadir el caso al spec con el semicírculo
medido a mano (πR) y control negativo sobre el código de hoy.

Nota: `cadEntityRunLength` es `export`, así que conviene comprobar quién más lo
consume antes de tocarlo.

---

### D-3 · El número de conductor nunca se dibuja

`apps/web/src/lib/cad/engine/commands/electrical-wire.ts:135-172`

`wireCommands` emite el `upsert` de capa (línea 141) y el `insert` de la
polilínea (línea 154). No hay ninguna entidad de texto. El número vive sólo en
`context.metadata['ie:numero']`, y ese metadato no lo lee ni el visor, ni la
lámina, ni el trazador, ni la exportación (ver D-7). Detallado como hueco en
H-2 porque es más carencia que error, pero lo anoto también aquí porque el
efecto —un plano eléctrico sin números de hilo— se lee como un defecto desde
el primer minuto de uso.

---

### D-4 · El cuadro de cargas no lleva marca: se duplica y no se puede actualizar

`apps/web/src/lib/cad/data-extraction/circuit-schedule-table.ts:70-101`

`buildCadCircuitScheduleTable` devuelve el `scheduleTable(...)` tal cual, sin
el `context.metadata` que su hermana `buildCadMechanicalBomTable` sí pone
(`mechanical-bom.ts:113-123`, la marca en la línea 122). Consecuencia doble: (a) no hay
`findCadCircuitTables`, así que no puede existir «Actualizar»; (b)
`DATAEXTRACTION → circUitos` dos veces deja **dos tablas** en el plano, y la
primera miente en silencio a partir del siguiente cambio de calibre. Es la
misma clase de fallo que el propio `mechanical-bom.ts` describe en su cabecera
como «exactamente la clase de mentira que se imprime y llega al taller», ya
resuelta a diez ficheros de distancia. Arreglo en H-11.

---

### D-5 · La lista de materiales no caza globos repetidos y puede tragarse una fila

`apps/web/src/lib/cad/mechanical-bom.ts:76-81`

```ts
for (const balloon of balloons) {
  if (balloon.part && parts.has(balloon.part)) continue;
  if (rows.some((row) => row.item === balloon.item)) continue;   // 79
  rows.push({ item: balloon.item, count: 1, name: balloon.part || "Objeto designado…", … });
}
```

Dos cosas. **Primera:** no existe ninguna detección de números de globo
repetidos, cuando el sistema eléctrico hermano sí tiene `cadWireClashes` y el
de planta tiene la suya, y el mecanismo de entrada del error es idéntico:
copiar y pegar una pieza ya globada duplica sus cuatro entidades con el mismo
`balloon`. La lista sale con **una** fila donde el plano enseña **dos** globos
con el mismo número sobre piezas distintas.

**Segunda:** la línea 79 **descarta en silencio** un globo cuyo número ya lo
tenga una fila de normalizado. Es alcanzable: globo 3 sobre una placa soldada
(sin normalizado) y globo 3 sobre un tornillo `MECH-…`. La fila del tornillo
entra primero por el bucle de `parts`, y la placa —que alguien numeró a
propósito— **desaparece de la lista de materiales**. Silenciosamente, en el
cuadro que va al taller.

**Arreglo.** Añadir `cadBalloonClashes(view)` gemela de `cadWireClashes`, que
`BOM` reporte en su `notice` («OJO: el globo 3 está en dos piezas») y que la
fila conflictiva salga marcada en vez de desaparecer.

---

### D-6 · `AETAG Todos` pisa una etiqueta existente sin decir cuál era

`apps/web/src/lib/cad/engine/commands/electrical-tag.ts:135-160`

`cadUntaggedDevices` (`device-tags.ts:152-165`, línea 161) considera «sin etiqueta»
también a los que **tienen** una que no encaja en `/^([A-Z]{1,3})(\d{1,4})$/`
— por ejemplo `-M1A`, `TAB-GRAL` o `LUM-COCINA`, que es exactamente lo que
trae un plano heredado o el DXF de otro despacho. `finishAll` los reetiqueta y
su renglón sólo enumera las etiquetas **nuevas** (línea 160, `puestas.push(tag)`).
La ruta de uno en uno sí lo dice —`finishOne` compone `` `(antes «${previa}»)` ``
(línea 118)— y la de golpe no.

**Cómo falla, concreto.** Recibo el plano del proyectista con sus tableros
rotulados `TAB-GRAL`, `TAB-COCINA`, `TAB-SERV`. Tecleo `AETAG Todos` para
etiquetar las luminarias nuevas y me los renombra a `-TB1`, `-TB2`, `-TB3` sin
mencionar qué se llevó por delante. Un solo Ctrl+Z lo deshace —está bien
hecho, es un lote— pero sólo si me doy cuenta.

**Arreglo.** Contar aparte los que traían texto y decirlo en el renglón: «…6
etiquetado(s); 3 tenían texto que no es una etiqueta y se sustituyó:
TAB-GRAL → -TB1, …». Es una línea de acumulador y el patrón ya está escrito
dos veces en el mismo fichero (`sinFamilia`, `puestas`).

---

### D-7 · La marca semántica no viaja al DXF y la pérdida no se declara

`apps/web/src/lib/cad/dxf-export.ts` (sólo la tolerancia, línea 131) ·
`apps/web/src/lib/cad/dxf-cad-document.ts:555` (sólo la altura anotativa) ·
`apps/web/src/lib/cad/dxf-export-loss-manifest.ts` (sin ninguna entrada al
respecto)

Detallado en H-9. Lo anoto como defecto y no sólo como hueco porque el
incumplimiento no es de capacidad sino **de la regla de la casa**: este
repositorio declara lo que pierde, y aquí pierde en silencio el circuito, el
número, el calibre, la protección y la marca de cada globo y cada símbolo. La
mitad barata —declararlo— son horas.

---

### D-8 · La longitud del circuito suma **todos** sus conductores, y el factor de retorno la vuelve a duplicar

`apps/web/src/lib/cad/electrical/circuit-check.ts:196-216` con
`nom-conductors.ts:139-148`

`cadNomVoltageDrop` documenta su entrada como «Longitud del recorrido en
METROS (**una sola dirección**)» y aplica `factor = 2` monofásico / `√3`
trifásico para la ida y vuelta. `cadCheckCircuits` alimenta ese parámetro con
`entrada.lengthM`, que es **la suma de las longitudes de todas las polilíneas
marcadas con ese circuito** (línea 214). El golden 93 y el spec fijan la
convención implícita: cada polilínea es un **tramo del mismo recorrido** (dos
tramos de 15 m = 30 m; `circuit-check.spec.ts:325`, «el recorrido del circuito
es la suma: 12 + 18»).

El problema es que **nada le dice eso al usuario, y la otra lectura es la
natural**. Un electricista que dibuja «los conductores» del circuito dibuja la
fase y el neutro: dos polilíneas de 30 m. La revisión suma 60, multiplica por 2
y **duplica la caída**, informando 12,3 % donde hay 6,1 % y mandando a cambiar
el calibre sin necesidad. Ni el prompt de `AEWIRE` («Precise el origen del
conductor»), ni el renglón, ni el título del cuadro de cargas dicen que hay que
dibujar **un solo hilo por recorrido**.

**Arreglo.** El barato: decirlo donde se lee —en el título del cuadro de cargas
y en el `notice` de `AECHECK`, que ya llevan su límite— y renombrar el campo a
`runLengthM` para que el contrato quede en el nombre. El bueno: distinguir el
papel del conductor (fase / neutro / tierra) con una clave más de metadato y
medir el recorrido como el máximo por papel, no como la suma; eso además abre
la puerta a cotejar la tierra dibujada contra la Tabla 250-122, que hoy el
módulo declara honestamente que no hace.

---

## 4. Lo que está mejor que en AutoCAD (y hay que decirlo)

1. **`DIMTOLERANCE Ajuste`** calcula las desviaciones de un ajuste ISO 286
   sobre lo que **esa cota mide**. En AutoCAD tecleo yo los números después de
   buscarlos. Y rechaza K/M/N/P con motivo en vez de calcularlos mal
   (`dimension-tolerance.ts:28-35`).
2. **`AECHECK`** revisa contra la NOM con la longitud medida sobre el plano.
   AutoCAD Electrical **no puede hacerlo** y el módulo argumenta exactamente
   por qué (`circuit-check.ts:4-16`). Es la mejor pieza de esta dimensión.
3. **`BOM Actualizar`** por `replace` conservando el id, el orden de dibujo y
   las referencias, con «si ya estaba al día no escribo nada» para no ensuciar
   el historial (`mechanical-annotate.ts:224`). `AMBOM` no es tan cuidadoso.
4. **El renglón que declara su criterio.** `AEWIRELIST` no dice «este
   conductor va de -M1 a -PB2»: dice de/a **y con qué tolerancia lo dedujo**
   (`wire-connections.ts:53-57`). Ningún informe de AutoCAD hace eso, y en un
   documento que alguien firma vale mucho.
5. **La chaveta indexada por el eje**, con `t1` y `t2` en la denominación y el
   intervalo `>` / `<=` bien puesto (`mechanical-parts-catalog.ts:96-147`). Es
   más útil que el generador de AutoCAD, que te deja elegir una chaveta que el
   eje no admite.

---

## 5. La apuesta ganadora

**El cuadro que no puede mentir: que ninguna tabla generada llegue al PDF
desactualizada, y que el plano se revise contra la norma y contra sí mismo en
cada cambio.**

Por qué ésta y no otra. El dolor diario del despacho, en las dos disciplinas
que me tocan, no es que falte un símbolo: es que **el papel y el modelo se
separan**. La lista de materiales dice once tornillos y hay trece. El cuadro de
cargas dice 12 AWG y el proyectista cambió a 10 la semana pasada. La regleta se
hizo en Excel en marzo. AutoCAD no puede resolverlo porque sus tablas son
fotografías: `AMBOM` y el panel schedule se regeneran **cuando uno se acuerda**,
y nadie se acuerda el jueves a las once de la noche antes de entregar.

Un CAD en el navegador sí puede, y este en concreto está a medio camino sin
haberse dado cuenta: **`BOM Actualizar` ya existe y es exactamente el patrón**
—marca en `context.metadata`, `findCadMechanicalBomTables`,
`readCadMechanicalBomTable` para saber qué dice hoy la tabla, `replace` con el
id forzado, y silencio si no cambió nada (`mechanical-bom.ts:86-158`)—. Sólo
tiene un cliente. Extenderlo a **todos** los cuadros del producto (cargas,
instalaciones, superficies, carpintería, materiales de tubería, la regleta
cuando exista), recalcularlos en el guardado y, sobre todo, **cerrar la puerta
del trazado**: `PLOT` y `PUBLISH` se niegan a producir un PDF cuyo dibujo
contradiga una tabla insertada, diciendo cuál y por cuánto —«el cuadro de
cargas dice 12 AWG en C-3 y el dibujo dice 10; actualícelo o quítelo».

Eso es fix-or-hide aplicado al entregable, es la doctrina que este repositorio
ya profesa en todo lo demás, y convierte una virtud interna en el argumento de
venta: **en Valle Design un plano no puede salir contradiciéndose.** Ningún CAD
de escritorio puede prometer eso, porque ninguno controla el momento de la
publicación como lo controla un producto que traza en el servidor. Y para el
ingeniero eléctrico mexicano la frase se vuelve más fuerte todavía: el cuadro
de cargas que firma **no puede estar desincronizado del plano que firma**,
porque el programa no lo deja imprimir.

Coste realista: el mecanismo son **varios días** (marcar las cinco tablas que
faltan y darles «Actualizar»); la puerta del trazado, **semanas**, porque hay
que decidir el fallo cerrado y no romper el flujo de nadie. Se verifica con un
golden que inserte un cuadro, cambie el dibujo, intente trazar y sea rechazado
con el motivo exacto; y con el control negativo obligatorio: sobre el código de
hoy, esa prueba pasa el PDF mentiroso sin rechistar.

---

## 6. Resumen para quien decida

| | Mechanical | Electrical |
| --- | --- | --- |
| Rúbrica hoy | 3/4 | 3/4 |
| Mi nota contra el toolset completo | 3/10 | 1,5/10 |
| ¿Entrego el lunes? | Sólo el detalle de una pieza sencilla | No |
| Lo que lo bloquea | ejes, datum, peso/despiece | no hay símbolos de esquema |
| Lo más barato con más retorno | tabla de barrenos (H-12), un día | rotular el número de hilo (H-2), un día |
| Lo mejor que hay | `DIMTOLERANCE Ajuste` ISO 286 | `AECHECK` con longitud del plano |
| El defecto que más me preocupa | globos repetidos que se tragan una fila (D-5) | el circuito que se parte por mayúsculas y aprueba de más (D-1) |

Los dos defectos que arreglaría **esta semana**, antes que cualquier
capacidad nueva, son **D-1** y **D-2**: los dos hacen que una revisión de
seguridad eléctrica apruebe un circuito que no cumple, los dos son de pocas
líneas, y los dos tienen ya en el árbol la pieza correcta con la que
sustituirlos.

*Ningún fichero de producto fue modificado durante esta auditoría.*
