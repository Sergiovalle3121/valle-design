# Auditoría 06 · Toolset Architecture

**Fecha:** 2026-09-05
**Quién escribe:** arquitecto con veinte años de despacho, suscripción completa
de AutoCAD (modelo + presentaciones + los siete toolsets), uso diario de
AutoCAD Architecture: muros con estilo, puertas de catálogo, escaleras,
rejilla de ejes, locales con su etiqueta, cuadro de superficies, cortes y
alzados generados del modelo, y el DWG que le mando al estructurista.
Abro Valle Design por primera vez con intención honesta de cambiarme y estoy
juzgando si puedo hacer el trabajo del lunes aquí.
**Alcance:** muros, puertas y ventanas con catálogo, escaleras, techos y
cubiertas, rejillas de columnas, etiquetas de local, cuadros de superficies y
carpintería, secciones y alzados generados, renovación (existente / demoler /
nuevo) y estilos.
**Método:** `docs/competitive/rubric.json` (fila `toolset-architecture`),
`docs/competitive/autocad-2027-gap-matrix.md` (línea 192),
`docs/parity/ESCALERA.md` §«La arquitectura (Ola E)», `docs/execution/BACKLOG.md`
(P1-6), `AGENTS.md`, y después el árbol real con Grep/Glob/Read. **No se ha
modificado ni una línea de producto.**

---

## 0. Veredicto

**3 / 10 contra AutoCAD Architecture completo.**

La frase corta: **el muro está bien pensado y bien construido; el edificio no
llega a la lámina.**

Voy a ser específico, porque la nota de 3 puede leerse como desprecio y no lo
es. El `wall` del esquema 6 y el `opening` del esquema 7 son de las mejores
piezas de este repositorio: el muro persiste su RECETA (eje, grosor, altura) y
no su contorno, las uniones en L / T / colineal se DERIVAN cada vez que alguien
dibuja (`wall-joins.ts`) en vez de guardarse, y el hueco no tiene coordenadas
propias — vive a una distancia sobre el eje de su anfitrión, así que mover el
muro mueve la puerta sin una línea de código que sincronice nada y borrar el
muro cierra el vano solo. Eso es exactamente el diseño de AutoCAD Architecture
y está argumentado mejor que en la documentación de Autodesk. La detección de
locales por recorrido de caras del grafo plano de los ejes
(`bim-schedule.ts:384-…`), con las TRES áreas —a ejes, útil y construida, y la
construida medida a paño exterior en el perímetro y al eje en el medianero para
que los locales SUMEN la huella— **es mejor que lo que hace AutoCAD
Architecture**, y lo digo en serio: en ACA hay que colocar objetos `Space`,
mantenerlos, y actualizarlos cuando el muro se mueve; aquí no hay nada que se
pueda quedar viejo porque no hay nada guardado.

Lo que me impide trabajar el lunes no es ninguna de esas cosas. Es esto:

1. **No puedo sacar un corte ni un alzado de la planta que acabo de dibujar.**
   `FLATSHOT`, `SECTION` y `SLICE` no saben qué es un `wall`. El golden 92
   —«el alzado del arquitecto»— dibuja sus muros como `type: 'box', kind:
   'wall'`, que es el objeto de planta HEREDADO de la etapa industrial, no la
   entidad que emite la orden `WALL`. Existe `wallSolidBodyLocal`, existe el
   cuerpo B-rep del muro con los huecos restados de verdad, y **no está
   conectado al aplanado**. Es lo primero que hago cada semana y aquí no se
   puede hacer.
2. **Los tres cuadros de arquitectura mienten por un factor de 1.000, 1.000.000
   o 1.000.000.000 en cualquier documento que no esté en milímetros**, sin un
   aviso. Un muro de 6 m sale «0,006 m»; una recámara de 16 m² sale «0,00 m²»;
   y todas las puertas del plano colapsan en una sola fila llamada `P-000x000`.
3. **El DXF que le mando al estructurista sale sin puertas ni ventanas** (la
   entidad `opening` no tiene exportador y cae por el descarte genérico) **y con
   las esquinas de los muros sucias** (el exportador escribe el contorno SIN
   uniones, mientras la pantalla dibuja el contorno CON uniones).
4. **La escalera, la cubierta y la losa se explotan al colocarse.** No hay
   entidad `stair`, `roof` ni `slab`: salen como líneas + `SOLID3D`. Cambiar la
   altura de planta significa borrar la escalera y volver a teclearla.
5. **No hay rejilla de ejes de columnas.** Ninguna. Un plano de arquitectura
   mexicano empieza por los ejes A-B-C / 1-2-3 con sus globos, y aquí sólo hay
   una CAPA llamada `EJES`.

### Qué le doy a la casilla de la rúbrica

| Fila | Rúbrica hoy | Mi lectura |
|---|---|---|
| `toolset-architecture.envolvente` (2 pt) | otorgado | **Lo doy.** WALL, DOOR y WINDOW se teclean (`command-manifest.ts:106,107,116`), alojan huecos de verdad y el hueco recorta el sólido. El criterio dice lo que hace y lo hace. |
| `toolset-architecture.interiores` (2 pt) | otorgado | **Doy 1 de 2.** «Escaleras, techos y cubiertas PARAMÉTRICOS»: STAIR/ROOF/SLAB calculan con reglamento y emiten geometría correcta, pero lo emitido **no es paramétrico** —se explota, no hay entidad reeditable, y la propia ESCALERA lo declara en peldaño 0—. «Tablas … que salen en la lámina»: salen, y son incorrectas fuera de milímetros. |

**El gap escrito de la rúbrica está caduco en un punto y es incompleto en
otro.** Dice: *«Lo que queda —escaleras de varios tramos, cubiertas sobre
polígonos, huecos en losas— está en ESCALERA»*. Las escaleras de varios tramos
YA están (`architecture-stair.ts`, formas `Recto`/`Ele`/`U` con descansos por
reglamento, 2026-09-04): ese trozo del gap sobra. Y lo que falta de verdad no
son esos tres detalles de geometría, sino los cinco huecos de arriba, ninguno
de los cuales aparece en el campo `gap`.

**Un aviso de método, porque este repositorio lo exige:** todo lo que digo que
«no existe» lo he buscado con Grep sobre `apps/web/src` completo, no sobre una
carpeta. `COLUMNGRID`, `CEILINGGRID`, `wallStyle`, `MASSELEM`, `AECDIM`,
`BLDGSECTIONLINE`: cero coincidencias en todo el árbol. Lo que digo que existe
lo he leído.

---

## 1. Lo que ya está construido y funciona

Lo pongo primero porque es mucho más de lo que esperaba.

### 1.1 El muro paramétrico, y su modelo de datos

`apps/web/src/lib/cad/cad-entities-v6.ts:55-66` — `CadWallEntity` guarda
`start`, `end`, `thickness`, `height`, `material?`. Nada de contorno. La
cabecera del módulo explica por qué, y el argumento es correcto:

> Un contorno no se puede REEDITAR como muro. Cambiar el grosor de un polígono
> de cuatro puntos exige adivinar cuál era el eje, y esa adivinanza falla en
> cuanto alguien movió una esquina.

Eso significa que en el panel de propiedades tecleo `thickness: 250` y el muro
se rehace entero, con sus uniones y sus huecos, sin regenerador
(`wall-entity-adapter.ts:329-349`).

### 1.2 Las uniones automáticas, derivadas y no persistidas

`apps/web/src/lib/cad/wall-joins.ts` (469 líneas) resuelve el inglete en L, el
empalme en T y la continuación colineal como función pura de las recetas. Tiene
tope de inglete (`CAD_WALL_MITER_LIMIT_RATIO = 4`, el `miterlimit` de SVG) y
cuando lo topa **degrada a bisel y DIBUJA el testero**, en vez de fingir una
esquina limpia que quedó abierta. La tolerancia de soldadura es `1e-6` a
propósito, con el razonamiento escrito de por qué no se sueldan muros a 5 mm.
Esto es mejor que los *cleanup groups* de ACA, que son un objeto más que
mantener y que se rompen cuando dos muros están en grupos distintos.

### 1.3 El hueco alojado

`cad-entities-v7.ts:70-95` + `wall-openings.ts` (427) + `opening-entity-adapter.ts`
(328). El reparto de quién dibuja qué está bien pensado: **el muro parte sus
caras** por el intervalo del hueco, **el hueco dibuja las jambas y el símbolo**.
Borrar la puerta devuelve la cara continua sin código que la cierre. El GC
transaccional retira los huecos cuyo anfitrión se borra en el MISMO lote
(`entity-commands.ts`). El hueco se niega a colocarse si no cabe, con los dos
números delante, en vez de recortarlo en silencio (`draw-opening.ts:11-16`).

### 1.4 El catálogo de carpintería por clave de despacho

`architecture-openings-catalog.ts` (208): nueve tipos —P-060 … P-100,
V-060x040 … V-180x120— con su uso («baño», «acceso principal»). El default de
cada orden **es** una entrada del catálogo por referencia, no una copia de sus
números, así que no puede despegarse de la tabla. Un tipo inventado se niega
nombrando los que hay. La marca se DERIVA de las medidas y no se persiste, así
que ninguna puerta puede decir «P-090» midiendo 850.

### 1.5 El cuadro de superficies con las TRES áreas y el nombre del local

`bim-schedule.ts` (641) + `bim-areas.ts` (193). El local sale del recorrido de
caras del grafo plano de los ejes, con las aristas PARTIDAS donde acaba otro
muro (sin ese partido una T no une nada). El nombre sale del `TEXT`/`MTEXT` que
cae dentro del anillo — que es como se rotula en un despacho de verdad. Cuando
dos lados consecutivos son paralelos no hay esquina y el área se declara
**ausente con su motivo**, en vez de aproximarse. La invariante de la
construida (suma de locales = huella de la planta) está argumentada y es
exactamente la que pide una ventanilla de licencias.

### 1.6 STAIR con reglamento mexicano de verdad

`engine/commands/architecture-stair.ts` (728). Blondel (`2c + h = 630`), límites
del RCDMX y sus NTC (contrahuella ≤ 180, huella ≥ 250), y **la orden se NIEGA a
fabricar una escalera fuera de reglamento diciendo el número**. Formas recta, en
L y en U con descansos cuyo fondo es al menos el ancho de la escalera, «como
exige el reglamento». El volumen se contrasta contra la fórmula en papel. No he
visto ningún CAD, AutoCAD Architecture incluido, que se niegue a dibujar una
escalera ilegal: ACA la dibuja y te deja el problema.

### 1.7 El resto

- `architecture-roof.ts` (490): cubierta a cuatro / dos / un agua con alero y
  pendiente, flechas de pendiente rotuladas en % como se rotula un plano de
  cubiertas, y volumen contrastado. `SLAB` por contorno cerrado con la cara
  superior a la cota, que es como se acota un forjado.
- `standards/mexican-layers.ts:260-295`: `MURO-EXI` gris continuo, `MURO-DEM`
  amarillo a trazos, `MURO-NUE` rojo continuo, **con la nota de que el código
  amarillo/rojo es convención y no regla y que hay que confirmarlo antes de
  entregar**. Es el nivel de honestidad que uno quiere de una norma de capas.
- `symbols-architecture.ts`: 35 símbolos de despacho (WC, regadera, cama king,
  clóset, cisterna, elevador, rampa, columna cuadrada y redonda…).
- `wall-solid.ts` + `room-solid.ts`: el visor 3D levanta muros con sus vanos
  recortados por booleana real, y piso / cielorraso / cubierta desde el anillo
  exterior del MISMO recorrido que produce el cuadro de áreas — para que la losa
  3D y la tabla 2D no puedan discrepar sobre dónde está el edificio.
- `dxf-export-loss-manifest.ts:179-201`: cuando exporto un muro, el manifiesto
  me dice con su nombre que el eje, el grosor editable y la altura no viajan.

---

## 2. Los huecos, por lo que más duele

### H-01 · No puedo sacar un corte ni un alzado de la planta que dibujé (BLOQUEANTE)

**AutoCAD Architecture:** `BLDGSECTIONLINE` + `AECCREATESECTION` genera un corte
2D/3D vivo del modelo; `AECCREATEELEVATION` hace lo mismo con el alzado. Los
regenero con `AECREFRESHSECTIONELEVATION` cuando muevo un muro. Los muros
aparecen con su corte de componentes, las puertas y ventanas con su dintel y su
antepecho, y la escalera con su línea de corte.

**Valle hoy:** `apps/web/src/lib/cad/flatshot-solids.ts:172-200`,
`cadFlatshotBodies`, acepta exactamente tres cosas:

```ts
if (entity.type === "solid3d") { bodies.push(solid3dBody(entity)); continue; }
if (entity.type !== "box" && entity.type !== "station") {
  skipped.push({ entityId: entity.id,
    reason: `${entity.type.toUpperCase()} no tiene volumen: no proyecta ocultas.` });
  continue;
}
```

`wall` no está. `opening` tampoco. Una planta dibujada con la orden `WALL`
—la entidad BIM, la que aloja huecos, la que sale en el cuadro— produce, al
teclear `FLATSHOT`, tantos «WALL no tiene volumen: no proyecta ocultas» como
muros haya y **ni un trazo de alzado**. Lo mismo con `SECTION` y `SLICE`:
`engine/commands/solids-support.ts:49` filtra `entity.type === "solid3d"` y ya.

El golden 92 (`e2e/golden/92-cad-alzado-del-arquitecto.spec.ts:33-46`) que
respalda la fila de la ESCALERA construye sus muros así:

```ts
const muro = (id, x, y, w, h) => ({
  id, type: 'box', kind: 'wall', x, y, w, h, rotation: 0, layer: '0', shape: 'rect',
});
```

Eso es el objeto de planta HEREDADO (`box` con `kind`, altura del catálogo de
arquetipos del visor), no la entidad `wall`. La evidencia es real y el golden
pasa; lo que no es cierto es la lectura de que «el modelo del arquitecto» ya
aplana, porque el arquitecto que teclea `WALL` produce otra cosa.

**Por qué duele:** el lunes recibo el plano estructural, dibujo la planta
arquitectónica sobre él, y lo primero que necesito entregar es el corte A-A' por
la escalera y el alzado de fachada. Es literalmente el trabajo. Aquí tengo que
volver a dibujar el alzado a mano, con lo cual el modelo 3D deja de servirme
para nada y sólo me estorba.

**Cuánto cuesta:** varios días. **La pieza que falta ya existe**:
`wall-solid.ts:143` `wallSolidBodyLocalWithDiagnostics` devuelve el `BrepBody`
del muro con sus vanos restados y sus uniones aplicadas, y hoy sólo lo consumen
`wall-solid-three.ts` (el visor) y `validation-report.ts`.

**Cómo se construye:**
1. En `flatshot-solids.ts`, antes del bucle, indexar los `opening` por `hostId`
   y los `wall` por `id`. Para cada `wall`, llamar a
   `wallSolidBodyLocalWithDiagnostics(wall, hostedOpenings, wallJoins(wall, otros))`
   y trasladar el cuerpo local al mundo con `wallAxisPoint` + `wall.start.z`
   (la misma transformada que ya hace `wall-solid-three.ts:105-136`, que se
   extrae a una función `wallSolidBodyWorld` compartida para no tener dos
   verdades sobre dónde está un muro).
2. Los `opening` NO entran como cuerpos ni como huecos: ya vienen restados
   dentro del cuerpo del muro. Se marcan como «consumidos por su anfitrión» y
   NO se cuentan en `skipped` — un hueco contado como excluido sería un aviso
   falso.
3. Cada diagnóstico de `CadWallOpeningCutDiagnostic` que vuelva (booleana
   fallida, vano que no cabe) se traduce a una entrada de `skipped` con el id
   del hueco, para no perder la doctrina de «lo roto se nombra».
4. Lo mismo en `solids-support.ts` para `SECTION`/`SLICE`: aceptar `wall` por
   la misma función.

**Cómo se verifica:** una spec `flatshot-walls.spec.ts` que monte dos `wall` en
L de 3.000 de altura con una `opening` puerta de 900×2.100, ejecute
`cadFlatshotBodies`, y afirme (a) dos cuerpos, (b) `openings: 0` y ningún
`skipped` —los vanos ya están dentro—, (c) que el alzado resultante tiene
vértices a la cota 2.100 (el dintel) que un muro entero no tendría. Y un golden
nuevo, 92-bis, que repita el 92 **con entidades `wall` de verdad**, tecleando
`WALL` + `DOOR` + `UCS X 90` + `FLATSHOT` y afirmando lo que recibe el servidor.

---

### H-02 · Los tres cuadros mienten por 10³ fuera de milímetros (BLOQUEANTE)

**AutoCAD Architecture:** la unidad del cuadro sale de la *Property Data Format*
del *Property Set Definition*, que sabe la unidad del dibujo y la de
presentación, y la cambio por estilo.

**Valle hoy:** `apps/web/src/lib/cad/data-extraction/data-extraction.ts:34-63`.
Las tres cabeceras y las tres funciones de fila tienen la unidad **cableada a
milímetros**:

```ts
const WALL_HEADERS = ["Capa", "Espesor (mm)", "Cant.", "Longitud (m)", "Área paramento (m²)", "Volumen (m³)"];
const ROOM_HEADERS = ["Local", "Uso", "Área a ejes (m²)", …];
…
fmt(row.length / 1000, 3),          // línea 43
fmt(row.axisArea / 1_000_000, 2),   // línea 59
fmt(row.volume / 1_000_000_000, 4), // línea 45
```

`buildCadBimSchedule(document: Pick<CadDocument, "entities">)`
(`bim-schedule.ts:190`) **ni siquiera recibe la unidad**. Y
`buildCadRoomScheduleTable` / `buildCadOpeningScheduleTable` /
`buildCadDataExtractionTable` tampoco (`data-extraction.ts:167-189`).

Que no es una decisión, sino un olvido, lo prueba la línea de al lado. En
`engine/commands/data-extraction-commands.ts`, el cuadro de instalaciones SÍ
recibe la unidad y los tres de arquitectura no:

```ts
const table = buildCadMepScheduleTable(mep, input.point, context.activeLayer, context.newEntityId, context.unit);
…
const table = buildCadRoomScheduleTable(schedule, input.point, context.activeLayer, context.newEntityId);
```

Y lo prueba también que las herramientas correctas ya existen y las usa STAIR:
`engine/commands/architecture-support.ts:72-82` tiene `cadSquareMetresLabel` y
`cadCubicMetresLabel`, que convierten «sea cual sea la unidad del documento».

Un documento en metros no es un caso raro: `CAD_MM_PER_UNIT` acepta
`mm | cm | m | in | ft`, `paper-space-style.ts` convierte para el trazado,
`lib/lisp/document-host.ts:181` mapea `meta.unit` a INSUNITS, y **cada orden de
arquitectura convierte sus defaults con `cadFromMillimetres(…, context.unit)`
precisamente porque el documento puede no estar en milímetros**. Muchos
despachos mexicanos dibujan arquitectura en metros, y un DXF que me llega del
estructurista en metros trae su unidad puesta.

**Por qué duele:** abro el DXF del estructurista (en metros), levanto la
arquitectura encima, teclo `DATAEXTRACTION` → `Superficies`, y la tabla que
inserto en la lámina dice `RECÁMARA · Recámara · 0,00 · 0,00 · 0,00 · 0,01`. La
lámina se traza, se firma y se entrega. En la carpintería es peor: la marca
también asume milímetros (§3, D-02), así que P-060, P-080 y P-090 colapsan en
**una sola fila** que dice `P-000x000 · Puerta · 1 · 2 · 0 · 9`, y compro nueve
puertas de un tamaño que no existe.

Y hay una contradicción interna que lo hace inaceptable: el CAMPO de área
(`fields/drawing-fields.ts:125`) SÍ convierte con `unitsPerMetre(meta.unit)`.
En el mismo plano, el `%<Area>%` del rótulo dice **16,00 m²** y el cuadro de la
lámina dice **0,00 m²**. Dos números del mismo dibujo que se contradicen.

**Cuánto cuesta:** horas.

**Cómo se construye:** pasar `unit: string | undefined` a
`buildCadBimSchedule` y a las cuatro funciones de tabla de `data-extraction.ts`;
sustituir las tres divisiones cableadas por `cadSquareMetresLabel`,
`cadCubicMetresLabel` y `cadMillimetresLabel` de `architecture-support.ts` (que
ya existen, ya están probadas por STAIR/ROOF y ya cubren `in`/`ft`); y arreglar
`openingMark` (§3, D-02) tomando la unidad. Las cabeceras se quedan en «(mm)» y
«(m²)» porque el VALOR pasa a estar siempre en esa unidad — que es lo que la
cabecera prometía.

**Cómo se verifica:** ampliar `data-extraction.spec.ts` con el mismo cuarto de
4 × 3 con muros de 200 **en metros** (`meta.unit: "m"`, muros de 0,2 y 2,4) y
exigir los mismos 12,00 / 10,64 / 13,44 m² que hoy da en milímetros. Un
`assert` de que las dos corridas dan cadenas idénticas es el gate: la unidad del
documento no puede cambiar lo que dice el cuadro. Y una spec de que la marca de
una P-090 en un documento en metros es `P-090x210` y no `P-000x000`.

---

### H-03 · El DXF que le mando al estructurista sale sin puertas y con las esquinas sucias (BLOQUEANTE)

**AutoCAD Architecture:** `EXPORTTOAUTOCAD` explota los objetos AEC a geometría
2D que se ve exactamente igual; y el DWG con objetos AEC, abierto en AutoCAD
plano, los enseña como *proxy graphics*, correctos.

**Valle hoy:** dos problemas en el mismo camino.

1. **La puerta y la ventana no se exportan.** No hay ninguna rama para
   `opening` en `dxf-entity-primitives.ts` ni en `dxf-export-loss-manifest.ts`;
   `opening` no está en `DXF_NON_PRIMITIVE_TYPES`
   (`dxf-export-loss-manifest.ts:50-63`), así que cae por el descarte genérico
   de la línea 296-308 con severidad `error`:
   *«La entidad opening no tiene representación en la exportación DXF y se
   omitirá del fichero»*. Se DECLARA —eso está bien y es la cultura de la
   casa— pero el fichero sale sin ni una puerta.
2. **El muro se exporta con el contorno equivocado.**
   `dxf-entity-primitives.ts:111-124` usa `wallFootprint(entity)`, el contorno
   BASE, y su propio comentario afirma que es *«la misma que deriva
   `wallFootprint` para el dibujo, así que lo exportado coincide con lo que el
   usuario ve»*. **No coincide.** `wall-entity-adapter.ts:164` dibuja
   `wallJoinedFootprint(entity, joins)`. En una esquina de dos muros de 250 el
   inglete extiende la cara exterior 125 mm y recorta la interior otros 125
   (`wall-joins.spec.ts:67-68`, `122-123`), y además absorbe testeros que no se
   trazan. El DXF sale con las cajas cruzándose y con las diagonales de testero
   que la pantalla no enseña.

**Por qué duele:** el flujo del despacho es plano ida y vuelta. Le mando el DXF
al estructurista para que replantee castillos; lo abre y ve muros solapados sin
un solo hueco, así que replantea contra un plano que no es el mío. Y el que
recibe no tiene manera de saberlo: el manifiesto de pérdidas se queda en mi
pantalla, no viaja dentro del `.dxf`.

**Cuánto cuesta:** un día.

**Cómo se construye:**
1. `cadEntityToDxfPrimitive` **ya recibe `document`** (se llama así en
   `dxf-cad-document.ts:471`). Cambiar la rama `wall` para calcular
   `wallJoins(entity, murosDelDocumento)` y emitir `wallJoinedFootprint`; con
   testeros absorbidos, emitir las una o dos polilíneas ABIERTAS que devuelve
   `wallJoinBoundaryPaths` en vez de un anillo cerrado.
2. Añadir la rama `opening`: emitir sus jambas y su símbolo como las
   polilíneas que ya calcula `opening-entity-adapter.ts` (`openingPaths`), y
   declarar en el manifiesto un `dxf_export_opening_geometry_only` de severidad
   `warning`: la geometría viaja, el alojamiento no.
3. Añadir `wall` y `opening` al escritor de rayado si el relleno de planta ha
   de viajar (hoy son trazos sueltos, §H-14).

**Cómo se verifica:** ampliar `dxf-export-losses.spec.ts` —que hoy prueba un
muro SUELTO (`línea 160-198`)— con dos muros en L y afirmar que la polilínea
exportada del primero tiene su esquina exterior extendida 125 y no en el
vértice base; y una spec nueva de que un documento con una `opening` produce
`warning`, no `error`, y que el fichero contiene las dos jambas. Un golden que
haga `WALL` + `DOOR` + `DXFOUT` y vuelva a importar el fichero, comprobando que
el plano reimportado tiene el hueco donde estaba.

---

### H-04 · La escalera, la cubierta y la losa se explotan al colocarse (ALTA)

**AutoCAD Architecture:** la escalera es un objeto. La pincho, arrastro su
pinzamiento de altura, cambio de estilo, le pongo barandal y zanca, y la planta,
el corte y el 3D se rehacen. Cuando el estructurista me sube el forjado 12 cm,
cambio un número.

**Valle hoy:** la propia ESCALERA lo dice en peldaño **0**: *«Una entidad
`stair`, `roof` o `slab` persistida y reeditable desde el panel — 0 — Las tres
se descomponen en planta + SOLID3D con la receta en el nombre»*. El código lo
confirma: `architecture-stair.ts:88-91` («No hay entidad `stair` persistida: la
escalera se descompone en planta + sólidos … la receta viaja en el nombre de
cada sólido») y `architecture-roof.ts:46-48` igual.

**Por qué duele:** el flujo de proyecto ejecutivo es iterativo por definición.
La altura de entrepiso cambia dos o tres veces antes del ejecutivo, y cada
cambio significa: seleccionar 40 líneas de peldaño + 3 sólidos, borrarlas, y
volver a teclear `STAIR` con los mismos parámetros que ya no recuerdo porque no
están guardados en ningún campo — están en el NOMBRE de un sólido.

**Cuánto cuesta:** semanas, y no por el algoritmo (ya está escrito y probado
con 656 comprobaciones) sino porque tocar el formato persistido es decisión del
titular, y así lo dice el código.

**Cómo se construye:** esquema 11 con `CadStairEntity` /
`CadRoofEntity` / `CadSlabEntity`, cada una guardando **sólo la receta** —
exactamente la doctrina del esquema 6:
- `stair`: `{ origin, direction, riseHeight, maxRiser?, tread?, width, form: "recta"|"ele"|"u", landingDepth? }`.
- `roof`: `{ ring: CadPoint2[], slopePercent, overhang, form, baseZ }`.
- `slab`: `{ ring, holes?: CadPoint2[][], thickness, topZ }`.
Los adaptadores del registro derivan planta y cuerpo llamando a las MISMAS
funciones que hoy usan las órdenes, movidas de `engine/commands/*` a
`lib/cad/stair-geometry.ts` / `roof-geometry.ts` (hoja del grafo, como
`wall-geometry.ts`). Las órdenes pasan a emitir UNA entidad en vez de N. El
panel de propiedades escribe la receta y la geometría se rederiva sola, igual
que el grosor del muro.

**Cómo se verifica:** las specs actuales (`architecture-stair.spec.ts`,
`architecture-roof.spec.ts`) se conservan tal cual contra las funciones
extraídas — misma huella SHA-256 de los cinco lotes. Encima, una spec nueva:
escribir `riseHeight` en propiedades y afirmar que el número de contrahuellas y
el desarrollo cambian y que el sólido derivado mide el volumen de la fórmula.
Y `persisted-identifiers.spec.ts` + el censo de entidades para el esquema
nuevo.

---

### H-05 · La puerta no tiene pinzamientos ni referencias a objeto (ALTA)

**AutoCAD Architecture:** arrastro la puerta por el muro con su pinzamiento de
posición, con cotas dinámicas al canto del muro; y `ENDpoint` engancha en las
jambas, que es a lo que acoto una fachada.

**Valle hoy:** `opening-entity-adapter.ts:264`, literal:

```ts
grips: { grips: () => [], moveGrip: (entity) => entity },
snaps: { snaps: () => [] },
```

El motivo está escrito y es honesto (líneas 30-38): `CadGripProvider` y
`CadSnapProvider` reciben la entidad **sin documento**, y un hueco sin
documento no se puede situar, así que devolver puntos sería inventarlos.
«Ampliar esas dos firmas toca `Layout3DEditor.tsx`, que es de otra sesión;
queda pedido.» El esquema 7 (`cad-entities-v7.ts:34`) sin embargo ya prometía
lo contrario: *«se desliza por su grip sobre el eje»*. La promesa está escrita y
no está cumplida.

**Por qué duele, en el flujo real:** acoto la fachada. Necesito la cadena
`esquina → jamba → jamba → esquina → jamba…`. No hay ni un punto de referencia
en las jambas, así que acoto a ojo con `Cercano` sobre el trazo, y una cota de
fachada a ojo es una cota falsa. Y para mover la ventana 30 cm no la arrastro:
abro propiedades y teclo `position`, que es la distancia desde el ARRANQUE del
eje del muro — un número que nadie tiene en la cabeza y que cambia de signo
según hacia dónde dibujé el muro.

**Cuánto cuesta:** un día para los snaps, varios días si se hace bien con
pinzamiento y cota dinámica.

**Cómo se construye:** ampliar `CadSnapProvider` y `CadGripProvider` con un
tercer argumento `document?: CadDocument` — la misma firma que ya tienen render,
caja y hit-test, con lo cual no se inventa un patrón nuevo. `opening-entity-adapter`
devuelve entonces: dos `endpoint` en las jambas (ya las calcula
`wallOpeningJambs`), un `midpoint` en el centro del hueco, y un grip
`position` que al moverse proyecta el punto sobre el eje del anfitrión con
`wallAxisParameter` y respeta `wallOpeningFit` (se niega a salirse en vez de
recortar). El `wall` gana además los cuatro puntos del contorno UNIDO (§3, D-03).

**Cómo se verifica:** spec de que un `opening` de 900 en un muro de 4.000
ofrece dos `endpoint` separados exactamente 900; spec de que arrastrar el grip
más allá de la jamba del muro deja `position` intacta y produce el aviso; y un
golden que acote de jamba a jamba con `DIMLINEAR` + `F3` y afirme que la cota
que recibe el servidor mide 900.

---

### H-06 · No hay rejilla de ejes de columnas (ALTA)

**AutoCAD Architecture:** `COLUMNGRID` / `AECLAYOUTGRIDADD` coloca la rejilla
rectangular o radial, con espaciamientos por vano, globos numerados A-B-C /
1-2-3 en los cuatro extremos, y `AECDIMADD` acota entre ejes de un tirón.
Además ancla columnas a las intersecciones.

**Valle hoy:** cero coincidencias de `COLUMNGRID`, `GRIDLINE` o `AXISGRID` en
todo `apps/web/src`. Lo único que hay es una CAPA llamada `EJES` en el estándar
mexicano y dos símbolos de columna (`column-square`, `column-round`) en
`symbols-architecture.ts:311-321`, que son bloques sueltos.

**Por qué duele:** el orden real de un plano arquitectónico mexicano es: ejes →
columnas → muros → huecos. Los ejes son el sistema de referencia con el que el
estructurista y yo hablamos («el castillo del cruce B-3»). Sin ellos, tengo que
dibujar 14 líneas de eje con `LINE`, colocar 14 globos con `INSERT`, numerarlos
a mano, y volver a hacerlo entero si el vano cambia de 4,50 a 4,80. Es media
mañana, cada vez.

**Cuánto cuesta:** varios días.

**Cómo se construye:** entidad `grid` del esquema 11 (o, si el formato no se
toca todavía, una orden `COLUMNGRID`/`EJES` que emita un GRUPO nombrado, que
`groups.ts` ya soporta). Receta: `{ origin, angle, xSpacings: number[],
ySpacings: number[], xLabels: "alpha"|"num", yLabels, extension, bubbleRadius }`.
Deriva: una `line` por eje extendida `extension` más allá del último cruce, un
`insert` del bloque `EJE-GLOBO` (bloque de fábrica con un atributo `CLAVE`, que
`professional-blocks.ts` ya sabe hacer) en cada extremo, y el texto de la clave
generado con la secuencia alfabética saltándose Ñ / I / O como manda la
costumbre. La orden acepta espaciamientos por lista (`4500,4500,3000`) y
también «n vanos de d». Un `Acotar` opcional que emita la cadena de cotas entre
ejes reusando `annotate-dimension-chains.ts`, que ya existe.

**Cómo se verifica:** spec de que `3 vanos de 4500` × `2 de 6000` produce 5 + 4
líneas, 18 globos, y que las claves son `A B C D` y `1 2 3`; spec de que el
globo no repite clave y de que la Ñ no sale; golden que teclee la orden y
afirme lo que recibe el servidor, más la cadena de cotas entre ejes.

---

### H-07 · El local no tiene etiqueta anclada en el plano (ALTA)

**AutoCAD Architecture:** el `Space` lleva su *Space Tag* anclada. La etiqueta
enseña nombre + número + superficie, sigue al local cuando cambia, y si borro
el local se va con él.

**Valle hoy:** el local se DETECTA (bien, y mejor que en ACA), pero para que
salga con su nombre hay que haber escrito un `TEXT` a mano dentro del anillo
(`bim-schedule.ts:348`, «el rótulo del local es el TEXT/MTEXT más cercano al
centro»). Ese `TEXT` es texto muerto: **no lleva la superficie**, no se mueve
con el local, y si agrando la recámara el rótulo sigue diciendo lo que decía.

El campo de área (`fields/drawing-fields.ts`) sí existe y sí se actualiza, pero
se ancla a una ENTIDAD por id — una polilínea cerrada o una región que yo tengo
que dibujar encima del local. Es decir: para tener un rótulo vivo tengo que
duplicar a mano el contorno que el motor ya calculó. Y `REVISA`
(`review/delivery-review.ts:220-226`) me avisará de que el campo caducó, pero
sólo si me acordé de crear la polilínea.

**Por qué duele:** en una casa de 9 locales pongo 9 rótulos con su superficie.
Al cliente le muevo un tabique. Los 9 rótulos siguen ahí, con 9 superficies de
antes, y el cuadro de la lámina —que sí se recalcula al insertarlo de nuevo—
dice otra cosa. El plano se contradice a sí mismo dentro de la misma hoja.

**Cuánto cuesta:** varios días.

**Cómo se construye:** orden `ROOMTAG` / `ETIQUETALOCAL`: se señala un punto
dentro de un local; se busca su anillo con `detectCadRooms`; se emite un `mtext`
cuyo `context.metadata` guarda **la firma del anillo** (los ejes de los muros
que lo cierran, ordenados, cuantizados a `CAD_ROOM_NODE_TOLERANCE`) y no un id
de entidad, más un campo `%<AreaLocal>%` nuevo en `CadFieldKind`. `cadResolveField`
gana la rama `area-local`: recalcula el cuadro de áreas, busca el local cuya
firma coincide, y devuelve su superficie ya convertida con `meta.unit`. Si el
local desapareció, el campo devuelve `null` —que ya es su contrato— y `REVISA`
lo señala. La etiqueta se recoloca al centroide con `polygonCentroid`
(`polygon-room.ts`, ya existe).

**Cómo se verifica:** spec de que mover un muro cambia el valor del campo del
rótulo sin tocar el rótulo; spec de que borrar un muro deja el campo en `null` y
`REVISA` lo reporta; golden que coloque dos rótulos, mueva el tabique, ejecute
`UPDATEFIELD` y afirme las dos superficies nuevas en el documento del servidor.

---

### H-08 · El cuadro insertado es una foto que no sabe que caducó (ALTA)

**AutoCAD Architecture:** la *Schedule Table* está enlazada a los objetos que
cuenta, se marca con una X cuando está desfasada, y `SCHEDULEUPDATENOW` la
rehace. `AECEXPORTSCHEDULETABLE` la saca a Excel.

**Valle hoy:** `engine/commands/data-extraction-commands.ts:130-155` calcula el
`schedule` en el momento del clic y escribe una `table` con los textos ya
cocidos. Nada guarda de dónde salieron. Muevo un muro y la tabla no cambia, no
se marca, y `REVISA` no la mira: `delivery-review.ts` revisa campos, circuitos,
etiquetas y ediciones de referencia, **no tablas**.

**Por qué duele:** es peor que no tener cuadro. Un cuadro que no puede estar mal
enseña a leerlo; uno que puede estar mal en silencio enseña a no confiar en
ninguno, y entonces el despacho vuelve a medir con `DIST` y apuntar en una hoja
— que es exactamente el problema que `bim-schedule.ts` dice en su cabecera que
existe para resolver.

**Cuánto cuesta:** un día (marcar y avisar), varios días (recalcular en sitio).

**Cómo se construye:** al insertar, sellar en `context.metadata` de la `table`
un `{ source: "bim-schedule", variant: "rooms"|"openings"|"walls", signature }`
donde `signature` es un hash estable de las recetas contadas (ids + números,
ordenados). Una orden `TABLEUPDATE` recalcula y reescribe las celdas
conservando el id de la tabla. Y una regla nueva en `delivery-review.ts`, área
«planta»: recalcular la firma y, si difiere, hallazgo bloqueante *«el cuadro de
superficies dice números que ya no son; ejecute TABLEUPDATE»* — que es la misma
doctrina que la regla de campos desfasados que ya está en la línea 220.

**Cómo se verifica:** spec de que insertar, mover un muro y recalcular la firma
da distinto; spec de que `TABLEUPDATE` deja las celdas con los números nuevos y
el MISMO id de tabla (no se puede romper la referencia desde la lámina); golden
que reproduce el ciclo entero y afirma el hallazgo de `REVISA`.

---

### H-09 · No hay estilos: ni de muro, ni de puerta, ni de local (ALTA)

**AutoCAD Architecture:** el *Style Manager* es el corazón del toolset. Un
estilo de muro tiene COMPONENTES —tabique 140 + cámara 20 + block 120 +
aplanado 20—, cada uno con su ancho, su desplazamiento respecto al eje, su
rayado en planta y su material. Cambio el estilo y cambian los 300 muros del
proyecto. Los estilos viajan en el `.dwg` y se comparten por *Project
Standards*.

**Valle hoy:** `STYLESMANAGER` existe (golden 91) y gestiona exactamente cinco
familias: `"text" | "dimension" | "mleader" | "table" | "plot"`
(`components/cad/palettes/style-manager-model.ts:26`). Ni muro, ni hueco, ni
local, ni escalera. Lo más cercano a un estilo de muro es
`wall-materials.ts`: cinco ids cerrados (`concrete`, `brick`, `drywall`, `wood`,
`stucco`) que son **un color de 24 bits para el visor 3D** y nada más. El
esquema 6 ya lo anticipa: *«Cuando lleguen los estilos de muro, la altura
explícita seguirá siendo el override»*. No han llegado.

**Por qué duele:** en un proyecto real tengo tres muros: exterior de 25, interior
de 15 y tabique de 10, cada uno con su rayado y su acabado. Aquí los distingo
por `thickness` y por capa, uno a uno. Y cuando la constructora me pide cambiar
el exterior de 25 a 30, es `QSELECT` por espesor + teclear en propiedades — que
funciona, pero no es un estilo: es un reemplazo masivo que no deja rastro y que
no puedo llevarme al siguiente proyecto.

**Cuánto cuesta:** semanas, y sobre todo porque el multicomponente cambia la
geometría del muro (deja de ser un rectángulo).

**Cómo se construye:** por etapas, y la primera es barata.
- *Etapa 1 (un día):* `CadWallStyle` en `cad-symbol-tables.ts` —donde ya viven
  las tablas de estilos del documento— con `{ id, name, thickness, material,
  hatchPattern, hatchScale, layer }`, y `CadWallEntity.styleId?` opcional y
  aditivo (el mismo camino que `material`). El estilo fija el default y la
  entidad conserva el override, como las cotas. `STYLESMANAGER` gana la
  familia `wall` con esas cinco filas.
- *Etapa 2:* componentes. `components: { name, width, offset, hatch }[]`, y
  `wallFootprint` pasa a devolver N anillos en vez de uno; `wall-joins.ts`
  resuelve el inglete por componente igual que hoy lo resuelve por cara (la
  matemática es la misma repetida). El sólido 3D extruye el componente
  estructural; los de acabado, opcionales por representación.
- Lo mismo, más barato, para `opening`: un `CadOpeningStyle` que sustituya al
  catálogo cerrado (§H-13).

**Cómo se verifica:** spec de que cambiar el `thickness` del estilo mueve todos
los muros sin `styleId` propio y no mueve los que lo tienen; spec de que el
estilo va y vuelve del documento guardado; golden por `STYLESMANAGER`.

---

### H-10 · Hay una planta, no un edificio (ALTA)

**AutoCAD Architecture:** el *Project Navigator* tiene Niveles con su cota y su
altura de entrepiso; los `Constructs` se cuelgan de un nivel; el cuadro de
superficies suma por nivel y da la total del edificio.

**Valle hoy:** `CadDocumentMeta` (`cad-document.ts:66-89`) tiene `version`,
`schema`, `unit`, huella, rejilla y `linetypeScale`. No hay niveles. Y la orden
`WALL` fija la cota a cero, cableada
(`engine/commands/draw-wall.ts:76-77`):

```ts
start: { x: a.x, y: a.y, z: 0 },
end:   { x: b.x, y: b.y, z: 0 },
```

El sólido 3D SÍ respeta `wall.start.z` (`wall-solid-three.ts:115`,
`const baseZ = wall.start.z`), así que la capacidad está en el modelo y la
orden no la ofrece: no hay palabra clave `Cota`/`Elevación` en el prompt, y
`command-manifest.ts:116` no le da `spatial: "elevation"` (STAIR sí lo tiene, en
la línea 70). La propia ESCALERA lo dice: *«ni se suma por NIVEL: hay una
planta, no un edificio»*.

**Por qué duele:** la casa que dibujo el lunes tiene planta baja y planta alta.
Hoy son dos documentos, y el cuadro de superficies de la licencia —que pide la
construida TOTAL— lo sumo a mano en una calculadora, que es exactamente lo que
`bim-schedule.ts` existe para impedir.

**Cuánto cuesta:** semanas para el modelo de niveles; **horas** para el primer
escalón, que ya vale mucho.

**Cómo se construye:** *escalón 1*: dar a `WALL` la palabra clave
`Cota` (como `Grosor` y `Altura`), guardarla en `start.z`/`end.z` —campos que
ya existen y que el 3D ya usa— y `spatial: "elevation"` en el manifiesto.
*Escalón 2*: `meta.levels: { id, name, elevation, storeyHeight }[]` y un
`context.level` en las entidades; el cuadro de superficies agrupa por nivel y
da la suma. *Escalón 3*: `LEVELS` para conmutar el nivel activo, con los otros
en gris (que es lo que hace ACA con los *xref* de nivel y lo que aquí puede
hacer el filtro de capa que ya existe).

**Cómo se verifica:** spec de que `WALL` con `Cota 3000` produce un muro con
`start.z = 3000` y que su sólido arranca ahí; spec de que el cuadro agrupa por
nivel y que la construida total es la suma; golden de dos niveles con su cuadro.

---

### H-11 · La renovación son tres capas, no una fase (MEDIA)

**AutoCAD Architecture:** el objeto lleva su fase (*Existing* / *Demo* / *New*),
la representación de visualización la dibuja distinto sin tocar capas, y las
cantidades salen por fase: cuánto demuelo, cuánto construyo.

**Valle hoy:** el estándar tiene `MURO-EXI`, `MURO-DEM` y `MURO-NUE`
(`standards/mexican-layers.ts:260-295`) con sus colores y tipos de línea, y hay
una plantilla `planta-de-demolicion` (`starter-templates.ts:209-217`). Está
bien y es más de lo que esperaba. Lo que no hay es la fase como PROPIEDAD: es
la capa, y sólo la capa. Como el cuadro de cantidades agrupa por capa
(`bim-schedule.ts:263`, `wallRows` con clave capa + grosor), en la práctica sí
obtengo tres filas separadas — que es la mitad de la respuesta, y hay que
decirlo: **funciona hoy, por accidente feliz del agrupamiento por capa**.

**Lo que no funciona:** la capa no sabe si es demolición, así que no puedo pedir
«los metros cúbicos que demuelo» sin leer nombres de capa a ojo; el hueco de una
puerta que se tapia no tiene manera de decirse; y un muro nuevo dibujado por
descuido en `MURO` (sin sufijo) se cuenta como si fuera existente sin que nadie
avise.

**Cuánto cuesta:** horas para la parte útil.

**Cómo se construye:** `CadRenovationPhase = "existente" | "demoler" | "nuevo"`
derivada del sufijo de la capa, en `standards/mexican-layers.ts` (que ya
clasifica por `category: "demolicion"`); el cuadro de cantidades gana la
columna «Fase» y tres totales al pie; y `REVISA` gana una regla: si el dibujo
tiene alguna capa `-DEM` o `-NUE`, un muro en una capa sin sufijo es un
hallazgo *«el plano es de demolición y este muro no dice de qué fase es»*.

**Cómo se verifica:** spec de las tres fases con sus tres totales; spec de que
un plano sin capas de demolición NO produce el hallazgo (no molestar a quien no
hace obra); golden sobre la plantilla `planta-de-demolicion`.

---

### H-12 · Sin muro curvo y sin justificación (MEDIA)

**AutoCAD Architecture:** el muro es un arco cuando quiero (`WALLADD` → `Arco`)
y su justificación es Izquierda / Centro / Derecha / Línea base, que es cómo se
replantea de verdad: el muro se traza por su cara exterior, no por su eje.

**Valle hoy:** `CadWallEntity` tiene `start` y `end`, dos puntos, y ya. El
esquema 6 lo declara: *«El grosor se reparte SIMÉTRICAMENTE a ambos lados del
eje. Las justificaciones de AutoCAD Architecture … llegarán como un campo
opcional cuando haya un comando que las pida»*. El prompt de `WALL`
(`draw-wall.ts:42-45`) ofrece `Grosor`, `Altura`, `desHacer`, `Cerrar` — no hay
`Justificación`.

**Por qué duele:** trazo la fachada sobre el levantamiento, que me da la CARA
exterior. Con justificación al eje tengo que desplazar mentalmente medio grosor
en cada tramo, o dibujar por el eje y luego mover — y en una esquina el error se
duplica. El muro curvo aparece en una de cada cinco casas (un muro de escalera
de caracol, un frente redondeado) y hoy se dibuja con dos arcos sueltos, que no
son muro: no cuentan, no alojan puerta y no salen en el cuadro.

**Cuánto cuesta:** un día la justificación; semanas el muro curvo (toca
`wall-geometry`, `wall-joins`, `wall-openings` y `wall-solid`).

**Cómo se construye:** justificación primero, porque es barata y aditiva:
`justification?: "left"|"center"|"right"` en el esquema 6 y un desplazamiento de
±grosor/2 aplicado **al derivar** el contorno (`wallFootprint`), nunca al eje
guardado — para que cambiar la justificación de un muro colocado no lo mueva de
sitio, que es el fallo clásico de este campo. La palabra clave `Justificación`
en el prompt de `WALL`, con su valor pegajoso entre tramos como `Grosor`.

**Cómo se verifica:** spec de que un muro justificado a la izquierda tiene su
cara izquierda sobre el eje tecleado; spec de que cambiar la justificación en
propiedades NO cambia `start`/`end`; spec de que la unión en L entre un muro
justificado y otro al eje sigue cerrando.

---

### H-13 · El catálogo de carpintería es cerrado en tiempo de compilación (MEDIA)

**AutoCAD Architecture:** los estilos de puerta y ventana están en el dibujo y
en el *Content Browser*; el despacho tiene los suyos y los arrastra al plano.

**Valle hoy:** `architecture-openings-catalog.ts:62-71` es un tipo de unión
literal de nueve claves, con las medidas en constantes del módulo. La cabecera
explica por qué es cerrado y el argumento es bueno (una clave que no resuelve no
debe cruzar la frontera del servidor). Pero la consecuencia es que **el catálogo
de un despacho no se puede añadir sin recompilar el producto**, y las nueve
entradas no cubren lo corriente: no hay puerta de dos hojas, ni corrediza, ni
cancelería de piso a techo (antepecho 0) — lo dice la propia cabecera, líneas
44-49. Y hay una incoherencia visible: `symbols-architecture.ts` sí tiene
`double-door-180`, `sliding-door-90` y `closet-door-200` como BLOQUES, así que
puedo dibujar una puerta de dos hojas… que no es un hueco, no corta el muro y
no sale en el cuadro de carpintería.

**Cuánto cuesta:** varios días.

**Cómo se construye:** mover el catálogo a la tabla de estilos del documento
(`cad-symbol-tables.ts`), que es donde ya viven las cosas cerradas-pero-editables
y que YA cruza la frontera del servidor validada. `CadOpeningStyle = { key,
kind, widthMm, heightMm, sillMm, use, leaves: 1|2, operation: "abatible"|
"corrediza"|"fija", symbolBlock? }`. El documento arranca con las nueve de
fábrica sembradas (`starter-templates.ts` ya siembra bloques y capas). La
frontera sigue rechazando lo que no resuelve — sólo que ahora «lo que resuelve»
es una tabla del documento, no del binario. `openingMark` toma `leaves` y
`operation` para escribir `P2-160x210` cuando toque.

**Cómo se verifica:** spec de que una clave que no está en la tabla del
documento se rechaza nombrando las que sí; spec de round-trip de la tabla por
guardado; spec de que una P de dos hojas produce su marca propia y su fila
propia; golden que dé de alta un tipo y lo coloque.

---

### H-14 · El rayado del muro en planta es fijo y depende del grosor (BAJA)

**AutoCAD Architecture:** el rayado en planta lo pone el COMPONENTE del estilo,
con su patrón y su escala, y sale igual en un tabique que en un muro de carga.

**Valle hoy:** `wall-geometry.ts:62-86`, `wallFillSegments`, dibuja trazos a 45°
con paso `step = wall.thickness * 2` y longitud `thickness`. O sea: **la densidad
del rayado depende del grosor del muro**. Un tabique de 100 sale con líneas cada
200 mm y un muro de 400 con líneas cada 800 — el mismo plano, dos densidades
distintas, ninguna configurable. Y no es una `hatch`: son `CadRenderPath`
sueltos, así que no se pueden asociar, ni cambiar de patrón, ni exportar como
HATCH al DXF.

**Cuánto cuesta:** horas para el paso fijo; un día para el patrón real.

**Cómo se construye:** el paso pasa a ser una constante en unidades de dibujo
(o mm convertidos con `cadFromMillimetres`) y no un múltiplo del grosor —el
mismo criterio que ya se usa para la altura del texto en papel—; después, cuando
haya estilos de muro (§H-09), el patrón sale del componente y se emite con la
maquinaria de `hatch-pattern-strokes.ts`, que ya existe y ya llega al PDF.

**Cómo se verifica:** spec de que dos muros de 100 y 400 tienen el MISMO paso
de rayado; el golden de trazado que ya mide patrones de sombreado
(`plot-hatch-pattern.spec.ts`) cubre la salida.

---

### H-15 · No hay plano de plafón ni rejilla de plafón (BAJA)

**AutoCAD Architecture:** `CEILINGGRID` coloca la retícula de plafón con su
paso, la recorta al local, y la *Reflected* display representation dibuja la
planta de plafones sin que yo cambie de dibujo.

**Valle hoy:** cero coincidencias de `CEILINGGRID`. Lo que hay es
`room-solid.ts`, que levanta un cielorraso como cuerpo 3D derivado del anillo
exterior — visible en el visor, invisible en planta. No hay representaciones de
visualización (el gran mecanismo de ACA: plan / reflected / model por objeto),
así que un plano de plafones se dibuja hoy como se dibujaba en 1995: líneas en
una capa.

**Cuánto cuesta:** varios días.

**Cómo se construye:** orden `CEILINGGRID` que tome un local (por punto, con
`detectCadRooms`), un paso (`610×610` o `600×600`), un origen y un giro, y
emita las líneas recortadas al anillo con el recortador que
`geom-trim.ts` ya tiene, todo en un grupo nombrado. Es la versión honesta y
barata; la representación reflejada es otra ola y se dice.

**Cómo se verifica:** spec de que la retícula se recorta al anillo del local y
no se sale; spec del conteo de placas (que es el dato que se pide); golden.

---

## 3. Defectos que encontré mirando el código

Los ordeno por daño. Todos verificados leyendo el fichero.

### D-01 · Los tres cuadros de arquitectura asumen milímetros y no reciben la unidad
`apps/web/src/lib/cad/data-extraction/data-extraction.ts:34-63`
Cabeceras cableadas a `(mm)`/`(m²)`/`(m³)` y divisiones cableadas a `/1000`,
`/1_000_000`, `/1_000_000_000`. `buildCadBimSchedule` (`bim-schedule.ts:190`) ni
siquiera acepta la unidad. En un documento en metros, un muro de 6 m sale
«0,006 m» y una recámara de 16 m² sale «0,00 m²». **En el mismo plano, el campo
`%<Area>%` sí convierte** (`fields/drawing-fields.ts:125`), así que el rótulo y
el cuadro se contradicen. El camino MEP de al lado ya pasa `context.unit`
(`data-extraction-commands.ts`, `buildCadMepScheduleTable(..., context.unit)`),
lo que confirma que es un olvido y no una decisión.
**Arreglo:** pasar `unit` y usar `cadSquareMetresLabel`/`cadCubicMetresLabel`/
`cadMillimetresLabel` de `engine/commands/architecture-support.ts:68-82`, que ya
existen y ya cubren `mm|cm|m|in|ft`.

### D-02 · `openingMark` colapsa todas las puertas en una sola fila fuera de milímetros
`apps/web/src/lib/cad/bim-schedule.ts:366-371`
```ts
const cm = (value: number) => String(Math.round(value / 10)).padStart(3, "0");
return `${opening.kind === "door" ? "P" : "V"}-${cm(opening.width)}x${cm(opening.height)}`;
```
En un documento en metros, una puerta de 0,9 × 2,1 da `round(0.09) = 0` →
`P-000x000`. Y como la clave de fila es `mark + sill` (`línea 235`), **P-060,
P-080 y P-090 con antepecho 0 se agrupan en la MISMA fila**: el cuadro de
carpintería dice «9 piezas de P-000x000» donde había tres tipos. Es la
diferencia entre pedir mal y no poder pedir.
**Arreglo:** `openingMark(opening, unit)` con `cadToMillimetres`. Está
declarado en la cabecera de `architecture-openings-catalog.ts:49-54` como
límite conocido; sigue siendo un defecto, porque el resultado no es «no sale»
sino «sale otro número», que es la clase de fallo que este repositorio persigue.

### D-03 · La referencia a objeto «Esquina del muro» cae donde el muro NO está dibujado
`apps/web/src/lib/cad/wall-entity-adapter.ts:291-297`
```ts
...(wallFootprint(entity) ?? []).map((corner) => ({
  kind: "endpoint" as const, point: corner, label: "Esquina del muro",
})),
```
`wallFootprint` es el contorno BASE. El render usa `wallJoinedFootprint`
(`línea 164`). En una esquina de dos muros de 250, el inglete desplaza la
esquina exterior **125 mm** (`wall-joins.spec.ts:67-68`). Es decir: engancho
`ENDpoint` en la esquina de la fachada, el imán me lleva a un punto que no está
sobre ninguna línea del dibujo, y la cota de fachada sale 125 mm corta o larga.
No es aproximación: es un punto que no pertenece al dibujo.
**Arreglo:** el mismo tercer argumento `document?` que pide §H-05 para el hueco;
con él, `wallJoins(entity, vecinos)` + `wallJoinedFootprint`. Mientras no exista,
lo honesto sería **no ofrecer las esquinas** y dejar sólo eje y punto medio —
fix-or-hide.

### D-04 · El exportador DXF escribe el muro sin uniones, y su comentario afirma lo contrario
`apps/web/src/lib/cad/dxf-entity-primitives.ts:111-124`
```ts
// … la misma que deriva `wallFootprint` para el dibujo, así que lo exportado
// coincide con lo que el usuario ve.
const footprint = wallFootprint(entity);
```
No coincide: el dibujo usa `wallJoinedFootprint` y omite los testeros
absorbidos. La función **ya recibe `document`** (`dxf-cad-document.ts:471`), así
que el arreglo no tiene obstáculo de diseño. La spec que lo cubre
(`dxf-export-losses.spec.ts:160-198`) usa un muro SUELTO, que es justo el caso
donde no hay diferencia.

### D-05 · `opening` no tiene exportador DXF y cae por el descarte genérico
`apps/web/src/lib/cad/dxf-export-loss-manifest.ts:50-63` y `296-308`
`opening` no está en `DXF_NON_PRIMITIVE_TYPES` ni tiene regla declarada, y
`cadEntityToDxfPrimitive` no lo trata: se emite
`dxf_export_entity_dropped` con severidad `error` y **el DXF sale sin ni una
puerta ni una ventana**. Está declarado, que es lo correcto; pero el resultado
es que el camino de intercambio del toolset de arquitectura no entrega
arquitectura.

### D-06 · `unitToMm` de espacio papel no conoce los pies
`apps/web/src/lib/cad/paper-space-style.ts:16-21`
```ts
if (unit === "m") return 1000;
if (unit === "cm") return 10;
if (unit === "in") return 25.4;
return 1;                       // ← "ft" cae aquí
```
`ft` es una unidad soportada del producto: está en `CAD_MM_PER_UNIT`
(`architecture-support.ts:24`, `ft: 304.8`) y la campaña de unidades imperiales
la cubre con 805 comprobaciones. Un dibujo en pies se traza a 1/304,8 de su
escala. Es la cuarta tabla de unidades divergente del repositorio, junto con
`CAD_MM_PER_UNIT`, `cadUnitsPerMetre` (`georeference.ts:88`, correcta porque
delega) y la de D-07.

### D-07 · `unitsPerMetre` de los campos no conoce pulgadas ni pies
`apps/web/src/lib/cad/fields/drawing-fields.ts:85-86`
```ts
const unitsPerMetre = (unit) => unit === "mm" ? 1_000 : unit === "cm" ? 100 : 1;
```
`in` y `ft` caen en el `1`, o sea se tratan como metros. Un campo de área en un
plano en pies imprime el número de pies² con el sufijo « m² ». **Arreglo:**
delegar en `cadUnitsPerMetre` de `georeference.ts:88`, que ya delega en la tabla
única.

### D-08 · La caja del muro no cubre lo que el muro dibuja
`apps/web/src/lib/cad/wall-entity-adapter.ts:227-234` (`wallBounds`) y
`256-260` (`hitTest`), ambas sobre `wallFootprint` sin uniones. Con inglete, la
púa de la esquina se dibuja fuera de la caja: pinchar sobre esa púa no
selecciona el muro, y una ventana de designación que la contenga no lo captura.
Es de bajo impacto (la púa es pequeña salvo en ángulos agudos, donde llega al
tope de 4× el grosor) pero es geometría dibujada que el ratón no encuentra.

### D-09 · `WALL` fija la cota a cero y no ofrece cambiarla
`apps/web/src/lib/cad/engine/commands/draw-wall.ts:76-77`, `89-90`, `98-99`
`z: 0` en cinco sitios. El modelo sí soporta base (`wall-solid-three.ts:115`
usa `wall.start.z`) y el manifiesto sabe declarar `spatial: "elevation"` (lo
hace con STAIR, `command-manifest.ts:70`). Es capacidad construida que la orden
no expone. Ver §H-10.

### D-10 · El hueco promete pinzamientos que no tiene
`apps/web/src/lib/cad/cad-entities-v7.ts:34` afirma *«se desliza por su grip
sobre el eje»*; `opening-entity-adapter.ts:264` devuelve `grips: () => []`. El
adaptador explica bien la causa y deja el pedido escrito; la contradicción está
en el esquema, que promete lo que no hay. Es deuda documental, y en este
repositorio eso cuenta.

---

## 4. La apuesta ganadora

Si sólo pudiera construir UNA cosa de esta dimensión, no sería el corte ni la
rejilla de ejes, aunque el corte sea lo que más me bloquea. Sería esto:

> **El cuadro que no puede mentir: la tabla de superficies y carpintería como
> entidad DERIVADA —no como foto— que se recalcula al dibujar, al trazar y al
> abrir el enlace de revisión, con la firma del documento del que salió impresa
> dentro de la propia tabla.**

Por qué ésta y no otra, y por qué un CAD en el navegador puede hacerla y
AutoCAD estructuralmente no:

**La mitad difícil ya está construida y es mejor que la de Autodesk.** El local
en Valle **no se guarda**: sale del recorrido de caras del grafo plano de los
ejes de muro cada vez que alguien pregunta (`bim-schedule.ts`). En AutoCAD
Architecture el local es un objeto `Space` que hay que colocar y mantener: se
queda viejo, y la *Schedule Table* enlazada se marca con una X que el 80 % de
los despachos ignora hasta que el cliente pregunta. Valle no puede tener ese
fallo porque no tiene ese objeto. Lo único que falta para cobrarlo es que la
tabla insertada deje de ser una foto (§H-08) y que los números estén en la
unidad correcta (§H-02). Eso son horas de trabajo, no meses.

**La otra mitad la da el navegador, y AutoCAD no puede.** Este producto ya
emite enlaces de revisión que se abren sin instalar nada
(`components/cad/collab/ReviewLinkIssuer.tsx`, golden 56). Cuando la tabla es
derivada, ese enlace deja de ser «una imagen del plano» y pasa a ser **el plano
con su cuadro recalculado delante del que lo abre**. Eso cambia tres
conversaciones del despacho:

1. **La ventanilla de licencias.** Declaro 213,45 m² construidos. Hoy el
   inspector tiene que creerme, o remedir en papel. Con el enlace, abre el plano
   y ve que los 213,45 salen de la geometría que tiene delante, con el criterio
   escrito («a paño exterior en el perímetro, al eje en el medianero») y con la
   invariante de que los locales suman la huella. Un número que se puede
   auditar en treinta segundos vale más que un número certificado.
2. **El cliente.** «Muéveme el tabique 40 cm». Lo muevo, guardo, y el enlace
   que ya tiene abierto le enseña la recámara nueva **y su superficie nueva**,
   sin que yo actualice nada ni le mande otro PDF. AutoCAD no puede: su cuadro
   es un objeto en caché dentro de un `.dwg` que hay que reenviar, y eTransmit
   manda una foto.
3. **El contratista.** El cuadro de carpintería con su marca, su cantidad y su
   antepecho, siempre igual a lo que hay dibujado, abierto en el teléfono en
   obra. Hoy compra contra un PDF de hace tres semanas.

**Por qué gana contra AutoCAD y no sólo lo iguala:** el argumento de venta de
AutoCAD Architecture es «los cuadros salen del modelo». El argumento de Valle
puede ser más fuerte y verificable: **«los cuadros no pueden separarse del
modelo, porque no existen aparte de él, y cualquiera puede comprobarlo desde un
enlace sin instalar nada»**. Es una promesa que un CAD de escritorio con formato
de archivo no puede hacer, y es exactamente la promesa que un despacho paga por
poder cumplir delante de una ventanilla.

El orden de ataque que yo seguiría: **§H-02 (horas) → §H-08 (un día) → §H-01
(varios días) → §H-07 (varios días)**. Los dos primeros hacen la apuesta cierta;
el tercero desbloquea el corte, que es lo que me deja trabajar el lunes; el
cuarto lleva la apuesta al plano y no sólo a la tabla.

---

## 5. Resumen de la nota

| Sub-dimensión | Nota | Por qué |
|---|---|---|
| Muro paramétrico (receta, uniones, huecos alojados) | 6/10 | Excelente diseño. Falta estilo con componentes, curvo, justificación, cota. |
| Puerta y ventana con catálogo | 5/10 | Alojamiento y catálogo bien; sin pinzamientos, sin referencias, catálogo cerrado en compilación. |
| Escaleras, cubiertas, losas | 2/10 | La geometría y el reglamento son correctos; se explotan al colocarse, y eso las vuelve dibujo, no objeto. |
| Rejillas de columnas y de plafón | 0/10 | No existen. |
| Etiquetas de local y cuadros | 5/10 | El motor de áreas es mejor que el de ACA; la tabla es una foto y miente fuera de milímetros. |
| Secciones y alzados generados | 0/10 | `FLATSHOT`/`SECTION` no ven el muro paramétrico. La pieza que falta ya existe sin conectar. |
| Renovación | 2/10 | Tres capas con su norma y su nota honesta; sin fase como propiedad. |
| Estilos | 0/10 | El gestor de estilos no conoce ningún objeto de arquitectura. |
| **Conjunto** | **3/10** | Los cimientos del muro son de calidad de producto; el edificio no llega a la lámina. |

**Lo que le diría al equipo:** no están a un año de AutoCAD Architecture en esta
dimensión. Están a **cuatro arreglos** de que un arquitecto pueda entregar un
juego de planos de una casa: la unidad de los cuadros, la tabla que se recalcula,
el aplanado que ve el muro, y los ejes. Tres de los cuatro son de horas o días
porque la maquinaria ya está escrita y sólo está desconectada. Eso no es una
crítica: es la mejor noticia de este informe.
