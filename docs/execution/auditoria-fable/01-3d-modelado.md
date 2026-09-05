# Auditoría — Modelado 3D: sólidos, superficies, mallas, SCU

**Quién escribe.** Arquitecto/ingeniero con veinte años de oficio, suscripción completa
de AutoCAD, la uso entera: modelo, layouts, toolsets, cinta, atajos, y el plano que me
manda el estructurista. Abro Valle Design por primera vez con la intención honesta de
cambiarme y pregunto una sola cosa: **¿puedo hacer mi trabajo del lunes aquí?**

**Fecha de la revisión.** 2026-09-05, sobre el árbol tal como está en
`/home/user/valle-design`.

**Método.** Leí `docs/competitive/rubric.json` (filas `brep`, `modeling3d`, `wasm`),
`docs/competitive/autocad-2027-gap-matrix.md`, `docs/parity/ESCALERA.md` y `AGENTS.md`.
Después fui al código: `apps/web/src/lib/brep/` (43 ficheros, 11.839 líneas),
`apps/web/src/lib/cad/solid3d-*.ts`, `apps/web/src/lib/cad/pick3d/`,
`apps/web/src/lib/cad/engine/commands/solids-*.ts` y `ucs-*.ts` (7.299 líneas),
`apps/web/src/lib/cad/layout/solview-model.ts`, el manifiesto de los 294 comandos
(`apps/web/src/lib/cad/engine/command-manifest.ts`) y los goldens 47, 60, 65, 73 y 92.

---

## 0. Veredicto

> **Hay un modelador de sólidos de verdad debajo —árbol paramétrico persistido, B-rep de
> media arista con invariantes, booleanas, y un camino a la lámina con ocultas exactas—
> pero es un modelador al que le falta la MANO: no puedo girar una pieza fuera del plano,
> no puedo pinchar una arista, y no puedo cambiar el 30 por un 35 en el árbol que el
> propio formato guarda para eso.**

**Nota: 3,5 / 10** contra AutoCAD completo en esta dimensión.

Y quiero ser explícito con una cosa antes de seguir, porque es la observación más
incómoda del informe:

La rúbrica da hoy **7/7 a `brep`** y **5/5 a `modeling3d`**, las dos «Completa», las dos
con «Nada pendiente: todos los criterios declarados verifican»
(`docs/competitive/autocad-2027-gap-matrix.md`, líneas 170-171). Los criterios que se
declararon están efectivamente verificados: lo comprobé uno a uno y no encontré ninguno
que mienta. Lo que pasa es otra cosa, y no es un defecto de honestidad sino de
**denominador**: las tres filas de 3D suman **14 puntos de 271** (`brep` 7, `modeling3d`
5, `wasm` 2), o sea el 5 % del alcance de destino, para una dimensión que en AutoCAD
completo es un entorno entero —sólidos, superficies NURBS, mallas de subdivisión,
subobjetos, gizmos, materiales, render— y el motivo por el que mucha gente paga la
suscripción cara en vez de la LT. Un 12/12 en esas dos filas es verdad y **no significa
paridad de modelado 3D**. La rúbrica lo dice a su manera en el `gap` de `brep` («el 3D
exacto es "todavía no" de etapa»), pero la fila puntúa al tope y en un tablero de 36
filas eso se lee como «resuelto».

Mi recomendación de gobierno —no toco la rúbrica, sólo lo señalo— es que la fila `brep`
lleve en su NOMBRE lo que ya lleva en su gap («FACETADO» ya está, bien) y que exista una
fila más, con puntos propios, para **transformaciones y edición 3D**, que es donde vive
el 100 % de lo que me impide trabajar. Hoy no hay ninguna fila que pueda bajar de nota
por no poder girar un sólido.

---

## 1. Lo que ya está construido y es bueno

No voy a pasar por encima de esto porque es mucho más de lo que esperaba encontrar.

### 1.1 El kernel B-rep es real, y su cabecera es la mejor documentación técnica del repo

`apps/web/src/lib/brep/index.ts` abre con «QUÉ ES ESTO», «DECISIÓN DE FONDO Y SUS
CONSECUENCIAS» y —esto es lo raro— una sección **«LO QUE NO HAY, en un solo sitio para no
tener que buscarlo»** con ocho límites nombrados: sin intersección exacta
superficie-superficie, sin transición esférica en vértice, sin radio variable, sin
redondeo cóncavo, sin cerrar anillo al fundir coplanarias (con la cifra medida: una placa
de 100×100×20 con agujero baja de 36 caras a 12 en vez de a 10), sin transformadas
generales de cuerpos (sólo traslación), sin vaciar cóncavos, sin cáscara abierta.

Yo llevo veinte años leyendo documentación de CAD que promete y no cumple. Esta hace lo
contrario. Vale la pena decirlo.

La topología es media-arista con adyacencias en O(1) (`topology.ts`, 480 líneas), hay un
validador de invariantes con su spec (`invariants.ts` + `invariants.spec.ts`, 746 líneas
entre los dos), tolerancia relativa al tamaño del cuerpo (`tolerance.ts`), y el volumen se
calcula por DOS caminos —integrando sobre caras y sumando triángulos de la malla— que se
comparan entre sí (`mass-properties.ts:108`, `compareMassProperties`). Eso último es
buena ingeniería: convierte la coincidencia de los dos caminos en una prueba de verdad.

### 1.2 El esquema persistido es un árbol de construcción, no una malla

`apps/web/src/lib/cad/cad-entities-v5.ts:141-239` define `CadSolidNode` con **trece
operaciones**: seis hojas (`box`, `extrude`, `revolve`, `sweep`, `loft`, `brep`) y siete
operaciones (`union`, `subtract`, `intersect`, `fillet`, `chamfer`, `slice`, `push`).

Un `solid3d` guarda `nodes[]` + `root`, y `solid3d-build.ts:317` evalúa desde la raíz.
Las booleanas **no hornean**: `solids-modify.ts` funde los dos árboles de entrada
renombrando los nodos con prefijo (`prefixNodes` en `solids-support.ts:78`) y añade un
nodo `subtract` encima. El golden 47 lo afirma end-to-end: teclea `EXTRUDE`, guarda,
comprueba que **al servidor llegó el árbol y no una malla**, cierra la página, la reabre,
y recalcula el volumen con el caché de evaluación vaciado.

Esto es mejor que AutoCAD. El historial de sólidos de AutoCAD (`SOLIDHIST`) es superficial
y en la práctica nadie lo usa; aquí el formato guarda la receta completa y reeditable.
Vuelvo sobre ello en §5, porque es la apuesta ganadora y está a medio cobrar.

### 1.3 La designación de CARA en 3D funciona, con un rayo de verdad

`apps/web/src/lib/cad/pick3d/face-ray.ts` (289 líneas + 260 de spec) resuelve el rayo de
cámara contra las caras teseladas, con descarte de caras traseras y tolerancias escaladas
al tamaño del cuerpo. Su cabecera explica exactamente qué había antes y por qué no valía:
`ucs-solid.ts` miraba a lo largo de la Z del mundo y se quedaba con la cara más alta, lo
cual «es correcto en planta y sólo en planta».

Está **cableado de verdad**: `components/cad/viewport/pointer-router.ts:331` mira
`CAD_ACCEPT_FACE_PICK` **antes** que la designación de entidad —con el motivo escrito: «un
sólido es también una entidad, así que preguntar primero por entidad haría que PRESSPULL
designara el sólido entero»— y `Layout3DEditor.tsx:6705` monta el `cadFacePickerFor`.
Tres comandos lo consumen: `PRESSPULL` (`solids-push-face.ts:83`), `UCS Cara`
(`ucs-commands.ts:343`) y `SOLIDEDIT Cara Extruir` (`solids-edit.ts:179`).

Y la política de cámara lo acompaña: `camera-policy.ts` documenta que en modo 3D un dedo
sigue orbitando **mientras no haya un comando activo**, y que con un comando esperando
designación el dedo designa y la órbita se muda al botón derecho.

### 1.4 El camino de 3D a la lámina es sorprendentemente fuerte

Esto me lo esperaba peor y es donde más me sorprendió el repo. `FLATSHOT`, `SOLPROF`,
`SOLVIEW` y `SOLDRAW` existen los cuatro. `apps/web/src/lib/cad/layout/solview-model.ts`
resuelve la visibilidad con un **solucionador analítico de ocultas** —`view/hidden-line-solver.ts`,
el mismo que usa FLATSHOT— corriendo **toda la escena junta**, no cuerpo a cuerpo. Su
cabecera cuenta el defecto que lo motivó: en un alzado con dos muros paralelos, el de
atrás salía con sus cuatro aristas vistas, en la capa `-VIS`, encima del de delante, «y el
informe de SOLDRAW decía `exact: true`».

Y hay más: el **muro** se convierte en prisma derivado para entrar en la vista (con las
uniones L/T ya resueltas por `wall-joins.ts`), el hueco de puerta se resta (golden 92: «1
hueco(s) restado(s)» y vértices a la cota 2.200, el dintel), y las capas salen con la
convención de AutoCAD: `<base>-VIS`, `-HID`, `-HAT`, `-DIM`, `-ROT`
(`layout/solview.ts:89-94`), con **el sombreado del corte en su capa `-HAT`**
(`solview-golden.spec.ts:313-320`).

O sea: **mi flujo de «corte por el muro y acótalo en la lámina» SÍ se puede hacer aquí**,
y con ocultas mejor resueltas que las que da SOLPROF cuando se le atraviesa un bloque.

### 1.5 Entra un modelo ajeno de malla, y sale cosido como sólido

`apps/web/src/lib/cad/interop/` lee **OBJ, STL, glTF y COLLADA** y los cose a un cuerpo
B-rep con `stitchMeshToBody` (`lib/brep/mesh-stitch.ts`, 536 líneas), con presupuestos
declarados (`mesh-import-limits.ts`) y rechazo explícito de SKP (`skp-reject.ts`, con su
`sketchup-migration-matrix.ts`). Golden 65 lo cubre.

AutoCAD base no importa glTF ni COLLADA. Aquí entra en el navegador sin instalar nada.
Esto está **mejor que en AutoCAD**.

### 1.6 STEP e IGES en los dos sentidos, con oráculo de terceros

`lib/brep/step-export.ts`, `step-import.ts`, `iges.ts` (1.026 líneas entre los tres) más
`interop.spec.ts`, y —esto es lo que le da valor— un oráculo independiente:
`lib/cad/verification/oraculos-externos.spec.ts` con `docs/cad/corpus/oraculos/steputils-0.1.json`.
El registro dice literalmente: «hasta hoy el único lector que había leído nuestro STEP era
el nuestro». Que alguien se haya molestado en cerrar ese bucle es una señal muy buena.

### 1.7 El SCU es un comando de verdad

`ucs-commands.ts` (577 líneas) ofrece **Cara, NOmbrado, OBjeto, Previo, Vista, Universal,
X, Y, Z, EjeZ y 3 puntos**, con `Siguiente`/`Voltear`/`Aceptar` dentro de la rama Cara,
que es exactamente el diálogo de AutoCAD. Declara honestamente que `Previo` recuerda UNO y
no diez, y que por eso el segundo `Previo` alterna en vez de retroceder.

### 1.8 Y hay 26 comandos de sólidos tecleables, en la cinta

Del manifiesto: `BOX WEDGE CYLINDER CONE SPHERE TORUS PYRAMID POLYSOLID EXTRUDE REVOLVE
SWEEP LOFT PRESSPULL UNION SUBTRACT INTERSECT FILLETEDGE CHAMFEREDGE SLICE SECTION
INTERFERE MASSPROP SOLIDEDIT FLATSHOT SOLPROF SOLVIEW SOLDRAW`, más `3DORBIT 3DFORBIT
3DPAN 3DZOOM VPOINT PLAN VSCURRENT UCS UCSICON UCSMAN`. Todos con su panel en la cinta
(`lib/cad/ribbon.ts:159`, panel «Sólidos»; `:177` «Vistas 3D»; `:180` «SCU»).

Y hay un candado que me gustó especialmente: `solid3d-frontera.spec.ts` (279
comprobaciones) recorre **las dieciséis ramas de SOLIDEDIT y los 52 modos de las ocho
primitivas** y exige que cada una haga una de tres cosas —`escribe`, `responde` o
`ausente`— **cotejando las palabras clave que la máquina de estados ofrece contra los
nombres que el propio prompt declara «todavía no»**, en los dos sentidos. Una opción no
puede desaparecer, aparecer a medias ni quedarse muda sin romper el gate. Eso es
disciplina de producto, no de código.

---

## 2. Lo que se rompe: el lunes por la mañana

Ahora la parte dura. Voy a contar tres trabajos reales de mi despacho y dónde se paran.

### Trabajo 1 — La ménsula de acero del estructurista

Me mandan un STEP con una ménsula: placa base, alma, cartela a 45°, cuatro barrenos.
Tengo que modelar el ala que falta y devolvérsela.

Importo el STEP. Bien, entra. Ahora tengo que **girar la cartela 45°** para apoyarla.
No puedo. `3DROTATE` no existe. `3DALIGN` tampoco. `MIRROR3D` tampoco. Y no es que falte
el comando: `CadSolidPlacement` (`cad-entities-v5.ts:265-279`) es **la misma afín 2×3 del
resto del documento más un `dz`**. Seis números y un desplazamiento vertical. Con eso se
gira alrededor de Z y nada más. **Un sólido de Valle Design no puede inclinarse. Nunca.
No hay dónde escribirlo.**

`ESCALERA.md:376` lo dice con todas las letras: «Las seis transformaciones 3D (`3DMOVE`,
`3DROTATE`, `3DALIGN`, `MIRROR3D`, `3DARRAY`, `3DSCALE`) | 0 | ninguna |
`CadEntityTransform` es estrictamente 2D».

Sigo. Quiero redondear la arista superior del alma, R=6. Tecleo `FILLETEDGE`, designo el
sólido, y el prompt me dice: «Precise el radio del redondeo **(se aplica al juego de
aristas compatibles)**». No me deja pinchar la arista. `preferredFeatureEdges`
(`solid3d-build.ts:442`) elige por mí: prioriza las **verticales** y va cogiendo aristas
que no compartan vértice. En una caja eso son las cuatro esquinas verticales y punto. La
arista de arriba que yo quiero **no es alcanzable de ninguna manera**.

Y peor: si mi perfil es una **L** —una cartela, una zapata, casi cualquier pieza de
estructura— hay una arista vertical **cóncava**, `preferredFeatureEdges` la mete en el
juego porque sólo mira verticalidad y disyunción de vértices, y `filletEdges`
(`lib/brep/fillet.ts:213-216`) la rechaza: *«La arista N es CÓNCAVA … Redondear un rincón
entrante exige AÑADIR material, y esta implementación sólo resta»*. **El comando entero
falla por una arista que yo no pedí.**

Exporto. `EXPORT` me pide formato, elijo STEP… y **me devuelve el fichero como un mensaje
en la línea de comandos**. No hay descarga. El propio módulo lo dice
(`solids-interop.ts:14-16`): «EXPORT devuelve el archivo COMO MENSAJE. Es la única salida
que el contrato del motor permite hoy … el botón de descarga es un cambio del anfitrión».
Busqué el anfitrión: `grep -rn "exportSolidEntity|exportStep" components/ app/` no
devuelve **nada**. La ménsula no sale del navegador.

**Trabajo 1: no se puede hacer.**

### Trabajo 2 — La cubierta a dos aguas con el lucernario

Planta rectangular, cubierta a dos aguas, y hay que abrir un lucernario de 1,20 × 1,20 en
el faldón.

`ROOF` me da el volumen bajo cubierta (bien, golden 79). Ahora el hueco. En AutoCAD:
`UCS` → `Cara`, pincho el faldón, dibujo el rectángulo, `PRESSPULL` hacia dentro. Treinta
segundos.

Aquí: `UCS Cara` funciona —es la opción que, dice su cabecera, «paga la ola»—. `RECTANG`
sobre el SCU inclinado **también** funciona: `draw-spatial.spec.ts:147-152` verifica que
«las cuatro esquinas están SOBRE el faldón», con un SCU `FALDON` a 30°.

Y entonces tecleo `EXTRUDE` y **el resultado es silenciosamente falso**.

`profileFromEntity` (`solid3d-profiles.ts:84-128`) saca el perfil llamando a
`pathPoints`, que devuelve `CadPoint2` —la proyección en planta— y toma como elevación
**la z del PRIMER vértice** (`:108`, `elevation: entity.vertices[0]?.z ?? 0`). Luego
`extrudeResult` (`solids-create.ts:138`) le pone
`frame: planeFrameAt(extracted.elevation)`, y `planeFrameAt` (`:140-146`) devuelve
**siempre** `zAxis: {0,0,1}`.

Traducido: mi rectángulo sobre un faldón a 30° se convierte en **su sombra en planta**
—más pequeña que el rectángulo real por el coseno— **colocada a la cota de una esquina** y
**extruida en vertical**. Sin mensaje. Sin aviso. Sin rechazo. Un sólido plausible en el
sitio equivocado y con el tamaño equivocado.

Esto es lo que la casa llama, con razón, lo peor que puede pasar: «una ausencia silenciosa
es peor que una limitación declarada». Aquí ni siquiera es ausencia: es un resultado
**incorrecto** presentado como correcto. Y el propio `ESCALERA.md:172` presume, con
razón, de que «LINE, PLINE y RECTANG dibujan EN el plano del SCU inclinado» — pero nadie
midió qué pasa cuando eso llega a EXTRUDE.

**Trabajo 2: se puede empezar y produce un resultado equivocado, que es peor que no
poder.**

### Trabajo 3 — Le cambio la altura al pretil

El cliente me dice que el pretil sube de 90 a 110. En AutoCAD abro Propiedades del sólido
y… bueno, en AutoCAD tampoco puedo, porque el historial de sólidos no es editable así.
**Aquí sí debería poder**, porque el formato guarda `{op: "extrude", height: 900}`.

`solids-push-face.ts:34-37` lo promete explícitamente:

> *«A cambio se gana algo que SketchUp no tiene: si empujaste 30 cm y te equivocaste, no
> deshaces — cambias el 30 en propiedades y el sólido se reconstruye.»*

Fui a comprobarlo. `solid3d-adapter.ts`, `properties.write` (líneas 277-290, con el comentario en 271-276), con su
comentario:

> *«Sólo se escriben la capa, el nombre y la COLOCACIÓN. El árbol de construcción no se
> edita desde el bolsillo de propiedades…»*

Y `properties.read` (línea 240) expone `nodes: entity.nodes.length` —**un número**— y
`root: entity.root` —**una cadena**—. Ni un solo parámetro de un nodo. El panel
(`CadEntityPropertiesPanel.tsx:87`) lee del adaptador, así que no hay otra vía. Y en los
294 comandos del manifiesto no hay ninguno que edite un nodo.

**La promesa central del esquema 5 —la reeditabilidad— está persistida y es
inalcanzable.** El árbol se guarda, se valida, se evalúa, se versiona en CAS… y no hay
manera humana de tocarlo. La única forma de cambiar el 900 por el 1100 es deshacer hasta
antes de la extrusión y volver a hacerlo todo.

**Trabajo 3: no se puede hacer, y el código dice que sí.**

---

## 3. Los huecos, por lo que más duelen

Los quince que encontré, ordenados. Cada uno con lo que miré.

### H1 · No existe ninguna transformación 3D. Un sólido no se puede inclinar. [BLOQUEANTE]

- **AutoCAD:** `3DMOVE`, `3DROTATE`, `3DSCALE` con gizmo; `3DALIGN`, `MIRROR3D`, `3DARRAY`.
- **Valle hoy:** ninguno de los seis está en `command-manifest.ts`. `CadSolidPlacement`
  (`cad-entities-v5.ts:265-279`) es una afín **2×3** más `dz`; `solid3d-adapter.ts:305-317`
  compone la transformada 2D en esa colocación y **conserva `dz` sin tocarlo** — o sea que
  ni siquiera `MOVE` sube un sólido. La elevación sólo se cambia escribiendo un número en
  el panel de propiedades.
- **Dolor real:** una diagonal de celosía, un tirante, una viga inclinada, un panel solar,
  una rampa, la cartela a 45°. Cualquier pieza que no sea un prisma vertical.
- **Esfuerzo:** semanas. Es lo que ESCALERA llama bien: «no es añadir comandos: es
  ensanchar el transporte de transformaciones».
- **Cómo se construye:** ampliar `CadSolidPlacement` a una afín 3D de 3×4 (doce números)
  **manteniendo la lectura de la forma 2×3+dz** para los documentos ya guardados —el
  resolvedor `resolveSolidPlacement` (`solid3d-build.ts:105-116`) es exactamente el sitio
  donde cabe esa promoción sin tocar identificadores persistidos—; `placeBody`
  (`:545`) ya aplica una matriz y sólo necesita las tres filas. Encima, un
  `CadEntityTransform3d` opcional que los adaptadores declaren soportar o no
  (`solid3d` sí; `wall` y `opening` no, que es la frontera de AGENTS.md), y seis
  descriptores nuevos en `commands/transform-3d.ts`.
- **Cómo se verifica:** spec que gira una caja 90° sobre X y comprueba que el volumen no
  cambia y que el centroide va donde toca; que el determinante negativo de `MIRROR3D`
  invierte las caras (`placeBody` ya lo hace); golden de navegador que teclea `3DROTATE`,
  guarda y recalcula desde lo persistido, como el 47.

### H2 · El árbol paramétrico no se puede editar: la reeditabilidad está persistida y es inalcanzable [BLOQUEANTE]

- **AutoCAD:** no lo tiene bien tampoco (`SOLIDHIST` es casi inservible). Aquí la
  comparación no es AutoCAD, es la promesa del propio repositorio.
- **Valle hoy:** `solid3d-adapter.ts` `properties.read:240` publica sólo el **número** de
  nodos y el nombre de la raíz; `properties.write:277-290` escribe capa, nombre y
  colocación. Ningún comando del manifiesto edita un nodo. El comentario de
  `solids-push-face.ts:36` promete lo contrario.
- **Dolor real:** el cliente cambia una cota. Hoy: deshacer hasta antes de la operación y
  rehacer toda la cadena. Con veinte nodos, no se hace: se vuelve a modelar.
- **Esfuerzo:** varios días.
- **Cómo se construye:** ver §5. Es la apuesta.
- **Cómo se verifica:** spec que carga un `solid3d` de tres nodos, cambia `height` del
  nodo hoja y comprueba que el volumen del resultado es el nuevo y que los nodos
  posteriores (una resta, un redondeo) siguen aplicándose; golden de navegador que abre
  el panel, edita el número, guarda y reabre.

### H3 · No se puede designar una ARISTA. FILLETEDGE y CHAMFEREDGE eligen ellos. [ALTA]

- **AutoCAD:** `FILLETEDGE` con `Cadena` y `Bucle`, radios distintos por arista, vista
  previa.
- **Valle hoy:** `solids-modify.ts:168-231`, `edgeFeatureDescriptor`, prompt «se aplica al
  juego de aristas compatibles»; `edges: []` en el nodo y
  `preferredFeatureEdges` (`solid3d-build.ts:442-467`) resuelve. `solids-edit.ts:204` dice
  lo mismo para `SOLIDEDIT Arista Copiar`: «salen todas: el visor todavía no designa una
  arista suelta». **El nodo ya guarda `edges: number[]`; el esquema no cambia.**
- **Dolor real:** redondear el canto superior de una losa, achaflanar el borde de una
  placa, matar la esquina de un dintel. Y en un perfil en L el comando falla entero (ver
  D4).
- **Esfuerzo:** varios días.
- **Cómo se construye:** un `edge-ray.ts` hermano de `face-ray.ts` en `lib/cad/pick3d/`:
  el rayo de cámara contra los **segmentos de media arista** (`halfEdgeSegment` ya está
  exportado), con umbral en píxeles y desempate por profundidad. Un
  `CadSolidEdgeRef` con huella —dos extremos cuantizados y el diedro— igual que
  `CadSolidFaceRef` hace con el plano y el área, y su resolvedor en
  `pick3d/solid-edge-ref.ts`. Un bit `CAD_ACCEPT_EDGE_PICK` en `command-types.ts` (el 128
  ya es cara; el siguiente es libre) y su rama en `pointer-router.ts` **antes** que la de
  cara, con la misma lógica de precedencia que ya está escrita. `FILLETEDGE` pasa a
  acumular referencias, con `Cadena` recorriendo por tangencia y `Bucle` por cara.
- **Cómo se verifica:** spec que pincha la arista superior de una caja en isométrica y
  comprueba que el índice resuelto es esa y no otra; spec de que un radio sobre una arista
  cóncava se rechaza **nombrando la arista designada**, no el juego entero; el candado
  de `solid3d-frontera.spec.ts` pasa a exigir `escribe` en `Arista·Copiar`.

### H4 · EXTRUDE siempre en +Z del mundo, y aplana el perfil inclinado en silencio [ALTA]

- **AutoCAD:** extruye por la normal del perfil; opciones `Dirección`, `Trayectoria`,
  `Inclinación`.
- **Valle hoy:** `solids-create.ts:138` fija `frame: planeFrameAt(extracted.elevation)` y
  `planeFrameAt` (`solid3d-profiles.ts:140-146`) devuelve siempre `zAxis {0,0,1}`.
  `profileFromEntity` (`:84-128`) descarta la z de todos los vértices menos el primero.
  Sólo existe `Inclinación` (desmoldeo), que sí está bien hecha.
- **Dolor real:** todo lo del Trabajo 2. Y el SCU Cara —la funcionalidad que la ola
  declaró como la que la paga— no lleva a ninguna parte: puedo apoyarme en el faldón y
  dibujar, pero lo que dibujo no se puede convertir en volumen ahí.
- **Esfuerzo:** un día para el rechazo honesto; varios días para hacerlo bien.
- **Cómo se construye:** dos pasos. **(a) Hoy mismo:** que `profileFromEntity` mida la
  desviación de planaridad de los vértices respecto del plano horizontal y, si pasa de la
  tolerancia, **devuelva el motivo en vez del perfil aplanado** —el patrón exacto que
  `face-ray.ts` ya usa con `planarityDeviation`—; `EXTRUDE` termina con mensaje y no
  escribe. **(b) Después:** `CadExtractedProfile` lleva un `CadSolidFrame` derivado del
  plano de mínimos cuadrados de sus vértices (o del SCU activo, que ya llega por
  `context.variables` y `cadActiveUcs`), y los vértices se expresan **en ese marco**. El
  nodo `extrude` ya acepta `frame`, así que el esquema persistido no se toca.
- **Cómo se verifica:** el `faldon` de `draw-spatial.spec.ts:88` reutilizado: `RECTANG`
  sobre él, `EXTRUDE 100`, y se comprueba que las ocho esquinas del sólido están a
  distancia 0 o 100 del plano del faldón, y que el área de la base es la del rectángulo
  **verdadero**, no la de su sombra. Hoy ese spec fallaría, que es la prueba de que el
  defecto es real.

### H5 · El 3D no cruza el DXF en ninguna dirección [ALTA]

- **AutoCAD:** DWG/DXF llevan 3DSOLID (ACIS), MESH, REGION, POLYFACEMESH nativamente.
- **Valle hoy — entrada:** `dxf-import.ts:314` lo declara: «un 3DSOLID, un MESH, una
  REGION o un LEADER los descarta `dxf-parser` ANTES de llegar al mapeador». Se **cuentan**
  y se avisan (`rawEntityTypeCounts`), que es lo correcto y honesto, pero no entran.
  **Salida:** `solid3d` no tiene primitiva DXF; cae en la rama de
  `dxf-export-loss-manifest.ts:295-309` como `dxf_export_entity_dropped`, severidad
  `error`: «no tiene representación en la exportación DXF y se omitirá del fichero».
- **Dolor real:** el estructurista me manda su modelo en DWG con los perfiles como
  sólidos. Aquí llegan **cero**. Y lo que yo modele no vuelve. Trabajar 3D en Valle
  Design es trabajar en una isla.
- **Esfuerzo:** semanas para ACIS de verdad; **varios días** para la mitad útil.
- **Cómo se construye:** la mitad útil es **POLYFACEMESH** (`POLYLINE` con bit 64 +
  `VERTEX` con bit 128), que es DXF de texto puro, lo escribe cualquiera y lo lee todo el
  mundo. Salida: `tessellateBody` ya da posiciones e índices; un `dxf-write-mesh.ts` que
  emita el polyface, y el manifiesto de pérdidas cambia de «se omitirá» a «viaja como
  malla: pierde la receta paramétrica y las caras curvas se facetan a N lados». Entrada:
  `stitchMeshToBody` (`lib/brep/mesh-stitch.ts`) **ya sabe** coser una malla a un cuerpo —
  es lo que hace con el OBJ—, así que un `POLYFACEMESH` o un `3DFACE` entrantes se cosen y
  entran como nodo `brep` con `source`. El 3DSOLID de ACIS sigue siendo «todavía no», y se
  dice.
- **Cómo se verifica:** ida y vuelta contra el corpus externo
  (`dxf-external-corpus.spec.ts`) con un lector de terceros de oráculo, como ya se hace
  con la cota en `z-frontiers.spec.ts`; volumen del cuerpo antes de exportar = volumen del
  cuerpo cosido al reimportar, dentro de la tolerancia del facetado.

### H6 · SOLIDEDIT: ocho de dieciséis ramas. Faltan Mover, Girar e Inclinar cara. [ALTA]

- **AutoCAD:** dieciséis operaciones entre Cara, Arista y Cuerpo.
- **Valle hoy:** ocho existen, ocho se declaran ausentes **en el propio prompt**
  (`solids-edit.ts:115-117`): Cara·Mover, Girar, Inclinar, Borrar, Color y Material;
  Arista·Color; Cuerpo·Estampar. Es exactamente lo que quiero de un producto honesto, y
  aun así son las tres primeras las que uso a diario.
- **Dolor real:** «este muro sale 5 cm» → mover la cara. «Este talud va a 3:1 y no a 2:1»
  → inclinar la cara. Hoy: rehacer el sólido.
- **Esfuerzo:** varios días (Mover); semanas (Girar e Inclinar, que recomponen caras).
- **Cómo se construye:** `Cara·Mover` es el hermano barato de `push`: un nodo nuevo
  `faceMove {operand, face: CadSolidFaceRef, delta: CadPoint3}` y, en `pick3d/face-push.ts`
  —que ya sabe desplazar una cara por su normal y recalcular los vértices como
  intersección de planos—, generalizar el desplazamiento a un vector cualquiera. Girar e
  Inclinar son el mismo motor con la cara girada, más la cirugía de las caras laterales que
  el propio `solids-edit.ts:57` dice que no existe en `lib/brep/`.
- **Cómo se verifica:** el candado de `solid3d-frontera.spec.ts` ya está montado para
  esto: cambiar el renglón de `Cara·Mover` de `ausente` a `escribe` **y quitar su nombre
  del prompt**; el spec falla si sólo se hace una de las dos cosas.

### H7 · SLICE y SECTION sólo cortan por un plano VERTICAL de dos puntos en planta [ALTA]

- **AutoCAD:** `SLICE` con `3puntos`, `Objeto`, `EjeZ`, `Vista`, `XY/YZ/ZX`, `Superficie`.
- **Valle hoy:** `solids-modify.ts:247-256`, `verticalPlane(first, second)` — «el único
  plano de corte que un viewport 2D puede precisar sin inventar una tercera coordenada».
  La honestidad está bien, pero el corte **horizontal** —seccionar un depósito por su
  eje, quitarle la tapa a una pieza, sacar la huella de una cubierta a la cota 3,00— es
  imposible.
- **Dolor real:** un corte por planta de un edificio a 1,20 m; medio depósito para ver el
  interior; comprobar que la viga entra bajo el forjado.
- **Esfuerzo:** un día para `XY/YZ/ZX` a una cota tecleada; varios días para `3puntos`.
- **Cómo se construye:** el nodo `slice` **ya lleva un `CadSolidPlane` completo** con
  normal 3D. Sólo falta el diálogo: tres palabras clave `XY`/`YZ`/`ZX` que piden una cota
  y arman la normal, y `3puntos` que acepta tres puntos con z (el motor ya transporta
  puntos 3D, `cadLiftPoint`/`cadPointZ` en `engine/spatial-point.ts`). `Cara` reutiliza
  `CAD_ACCEPT_FACE_PICK` y toma el plano de la cara designada, que es un `nx,ny,nz,d` que
  `CadSolidFaceRef` ya guarda.
- **Cómo se verifica:** cortar una esfera de radio 100 por `XY` a z=0 y comprobar que el
  volumen es la mitad; `3puntos` sobre un plano oblicuo y comprobar el volumen contra la
  integral analítica.

### H8 · STEP e IGES no se pueden descargar: el exportador escupe el fichero en la línea de comandos [ALTA]

- **AutoCAD:** `EXPORT` abre un diálogo de guardado.
- **Valle hoy:** `solids-interop.ts:14-16` lo declara. Confirmado con
  `grep -rn "exportSolidEntity|exportStep|IGES" components/ app/`: **cero coincidencias**.
  El anfitrión no lo ha cableado.
- **Dolor real:** modelo una pieza y no la puedo mandar a nadie. Y la fila `brep.interop`
  de la rúbrica cobra su punto por el códec, que existe y está probado — pero por la regla
  de la casa («un módulo que nadie importa no es una capacidad del producto», la lección
  del kernel WASM, escrita en el `rationale` de `wasm.toolchain`), **esto es exactamente el
  mismo caso y no está marcado como tal**.
- **Esfuerzo:** horas.
- **Cómo se construye:** el estudio ya sabe descargar: `DXFOUT` y `PLOT` bajan ficheros.
  Un `result: {kind: "download", filename, mime, text}` en `command-types.ts` y su rama en
  `command-engine-host.ts`, que es el mismo sitio donde `facePick` se despacha
  (`:382`). `EXPORT` lo emite en vez de `message`.
- **Cómo se verifica:** golden de navegador que teclea `EXPORT` `STEP`, intercepta la
  descarga de Playwright y comprueba que la cabecera es `ISO-10303-21;` y que el volumen
  reimportado coincide.

### H9 · Sin gizmos y sin designación de subobjeto fuera de un comando [ALTA]

- **AutoCAD:** Ctrl+clic designa cara, arista o vértice; el gizmo de mover/girar/escalar
  aparece solo y se arrastra por ejes o planos.
- **Valle hoy:** `grep -rn "gizmo|TransformControls"` → **nada**. El pick de cara sólo
  existe **dentro** de un comando que lo pida (`accepts & CAD_ACCEPT_FACE_PICK`). Los
  grips del sólido (`solid3d-adapter.ts:184-216`) son cinco y son **2D**: un punto base
  que mueve en XY y cuatro esquinas que escalan en XY respecto de la opuesta.
- **Dolor real:** el modelado directo se hace con la mano, no con la línea de comandos.
  Sin gizmo, cada empujón son cuatro pasos tecleados.
- **Esfuerzo:** semanas — y hay un blocante estructural, ver H15.
- **Cómo se construye:** con H1 y H3 hechos, el gizmo es una capa de presentación:
  tres ejes y tres arcos dibujados en la escena three, con el rayo resolviéndose contra
  cilindros de captura; el arrastre emite el mismo `CadEntityTransform3d` que teclear
  `3DMOVE`, de modo que **no hay una segunda vía de mutación** (la regla que
  `entity-commands.ts` declara en su cabecera).
- **Cómo se verifica:** spec del resolvedor de ejes del gizmo (puro, sin DOM); golden que
  arrastra el eje Z y comprueba el `dz` persistido.

### H10 · No hay mallas ni superficies como objetos [MEDIA-ALTA]

- **AutoCAD:** `MESH`, `MESHSMOOTH`, `MESHREFINE`, `MESHCREASE`, `3DFACE`, `PFACE`,
  `REVSURF`, `RULESURF`, `TABSURF`, `EDGESURF`; y las superficies NURBS con
  `PLANESURF`, `SURFBLEND`, `SURFPATCH`, `SURFNETWORK`, `SURFOFFSET`, `SURFTRIM`,
  `THICKEN`, `CONVTOSOLID`, `CONVTOSURFACE`, `CONVTOMESH`, `XEDGES`.
- **Valle hoy:** **ninguno de los veintiuno** está en el manifiesto. `lib/brep/nurbs.ts`
  (348 líneas) y `surfaces.ts` (577) existen y están probados —evaluación, normal,
  derivadas, proyección de punto, intersección con recta— pero, como dice
  `index.ts:31-33`, «viajan como PORTADORAS de las caras … el día que la topología deje de
  facetar, ya están». Ningún comando las crea.
- **Dolor real:** una topografía, un faldón alabeado, una carrocería, una tapa embutida.
  Y `THICKEN` sobre una superficie es como se hace la mitad de la chapa.
- **Esfuerzo:** semanas.
- **Cómo se construye:** el primer peldaño barato es **`PLANESURF` + `THICKEN`**: una
  superficie plana no necesita SSI, es una región con espesor, y `extrudeProfile` ya la
  hace. `CONVTOSOLID` sobre una polilínea con grosor es lo mismo. Las de verdad
  (`SURFBLEND`, `SURFPATCH`) piden intersección superficie-superficie, que `index.ts`
  declara ausente, y son otra etapa.
- **Cómo se verifica:** volumen de la placa engrosada = área × espesor; y la frontera se
  declara en el prompt como ya hace SOLIDEDIT.

### H11 · Sin SCU dinámico (DUCS) [MEDIA]

- **AutoCAD:** paso el cursor por una cara, el retículo se alinea solo, dibujo. F6 lo
  conmuta.
- **Valle hoy:** `grep -rn "DUCS|UCSDETECT|dynamicUcs"` → sólo el alias `DDUCS` de
  `UCSMAN`, que es el cuadro de diálogo, no el SCU dinámico. Hay que teclear `UCS` `Cara`
  y pinchar, para cada cara, y devolver el SCU al mundo después.
- **Dolor real:** cinco caras de una pieza son cinco diálogos.
- **Esfuerzo:** varios días.
- **Cómo se construye:** `hitFace` ya está en el `pointer-router` y ya resuelve la cara
  bajo el cursor en 3D. Un `hover` que, con `DUCS=1`, publique un SCU **efímero** —no
  guardado en el catálogo— en el store de variables mientras el puntero está sobre la
  cara, y lo retire al salir. El resaltado de la cara es el mismo material que el pick.
- **Cómo se verifica:** spec del resolvedor (dado un rayo y un cuerpo, el SCU efímero
  tiene la normal de la cara); golden que dibuja una línea sobre una cara inclinada sin
  teclear `UCS`.

### H12 · SWEEP aplana el camino; LOFT sólo entre secciones horizontales [MEDIA]

- **AutoCAD:** `SWEEP` con `Alineación`, `Punto base`, `Escala`, `Torsión`; `LOFT` con
  `Guías`, `Trayectoria`, secciones en cualquier plano.
- **Valle hoy:** `pathOfEntity` (`solid3d-profiles.ts:247-259`) toma la elevación del
  **primer** vértice y aplana todo el camino; sólo `line` conserva sus dos puntos 3D.
  `LOFT` (`solids-inquiry.ts:143-176`) ordena las secciones por cota, exige cotas
  distintas —bien pensado, y el comentario lo explica— y monta cada una con
  `planeFrameAt(elevation)`, o sea **horizontal**. `steps: 4` fijo, sin opción.
- **Dolor real:** un pasamanos que sube con la escalera; un conducto que cambia de sección
  y de dirección; un cordón de cimentación en pendiente. Y otra vez: **se aplana en
  silencio**.
- **Esfuerzo:** varios días.
- **Cómo se construye:** `pathOfEntity` devuelve los `CadPoint3` reales (la polilínea 3D
  ya existe en el formato: `ESCALERA.md:176` habla del bit 8 del DXF). El nodo `sweep` ya
  acepta `path: CadPoint3[]` y `upHint`, y `lib/brep/sweep.ts` ya coloca el perfil en el
  plano bisector de cada vértice (lo usa `plant/pipe-solid.ts` con caminos 3D de verdad —
  o sea que **el kernel ya sabe y el comando es el que tira la información**). Para LOFT,
  el marco de cada sección sale del plano de sus propios vértices, igual que en H4.
- **Cómo se verifica:** barrer un círculo de r=50 por una polilínea 3D de 3.000 mm de
  longitud verdadera y comprobar el volumen contra π·r²·L; el mismo camino en planta mide
  menos y hoy da el número equivocado.

### H13 · MASSPROP sin momentos de inercia [MEDIA-BAJA]

- **AutoCAD:** masa, volumen, caja límite, centroide, **momentos de inercia, productos de
  inercia, radios de giro, momentos principales y ejes** respecto del centroide.
- **Valle hoy:** `lib/brep/mass-properties.ts:27-31`, `MassProperties` = `{volume, area,
  centroid}`. Y punto.
- **Dolor real:** comprobar un perfil armado, calcular la inercia de una sección compuesta.
  Es el único motivo por el que muchos mecánicos abren MASSPROP.
- **Esfuerzo:** un día.
- **Cómo se construye:** el tensor de inercia de un poliedro se integra sobre los
  triángulos con las fórmulas cerradas de Mirtich; el bucle de `meshVolume` (`:41`) ya
  recorre exactamente esos triángulos y sólo hay que acumular diez momentos en vez de uno.
  Diagonalizar el tensor 3×3 da los principales; `lib/brep/poly.ts` ya trae
  `cubicRoots`.
- **Cómo se verifica:** contra los valores analíticos de una caja (`m·(b²+c²)/12`), un
  cilindro y una esfera; el facetado del cilindro da el error esperado y se acota.

### H14 · Cuatro estilos visuales, sin materiales, sin render, sin sol [BAJA]

- **AutoCAD:** diez estilos visuales editables, materiales, `RENDER`, `SUNPROPERTIES`,
  sombras.
- **Valle hoy:** `lib/cad/view/visual-styles.ts:69-108`: `wireframe`, `hidden`, `shaded`,
  `shaded-edges`. Es lo justo para modelar, y para modelar basta.
- **Dolor real:** poco, honestamente. Un render no se hace en el CAD ni en AutoCAD. Lo
  pongo por completitud y como el hueco de menor prioridad de la lista.
- **Esfuerzo:** semanas, y yo no lo haría.
- **Cómo se construye:** si algún día: un estilo `conceptual` con un gooch shading, que en
  three son diez líneas, y color por capa en las caras.
- **Cómo se verifica:** captura del golden contra huella.

### H15 · El sitio donde tendría que vivir toda la UI 3D está a UNA línea de su techo [ALTA · deuda]

- **AutoCAD:** no aplica; es deuda nuestra.
- **Valle hoy:** `components/cad/editor/Layout3DEditor.tsx` = **18.453 líneas**. El
  presupuesto de `scripts/cad/check-monolith-budget.mjs` es de trinquete y `ESCALERA.md:520`
  lo dice: «queda a UNA línea de su asignación (18.453 de 18.454)». Ahí dentro está el
  ciclo de vida de la escena three, `cadFacePickerFor` (`:6705`) y todo el puente al motor.
- **Dolor real:** el gizmo (H9), el resaltado de subobjeto (H3), el panel del árbol (H2) y
  el resaltado de DUCS (H11) son **todos** UI de viewport. Con este techo, **ninguno cabe**.
  Es el blocante que hay debajo de la mitad de esta lista.
- **Esfuerzo:** varios días por extracción.
- **Cómo se construye:** extraer por anfitrión, que es el patrón que el repo ya usa y que
  funciona: `viewport/` ya tiene `wall-solid-host.ts`, `room-solid-host.ts`,
  `solid-shade-host.ts`, `solid-snap-host.ts`, `render-pipeline-host.ts`,
  `native-grip-controller.ts`. Falta sacar el ciclo de vida de la escena a un
  `scene-lifecycle-host.ts` y el puente de comandos a un `command-bridge-host.ts`, cada uno
  con su spec, y bajar el techo del monolito en la misma cantidad — **bajarlo, nunca
  subirlo**.
- **Cómo se verifica:** `check:monolith-budget` verde con el techo **menor** que hoy; los
  goldens 47, 60, 65, 73 y 92 sin tocar.

---

## 4. Defectos concretos, con fichero y línea

Estos no son huecos: son cosas que están mal escritas hoy.

### D1 · Las booleanas tiran la colocación de todos los operandos menos el primero

**`apps/web/src/lib/cad/engine/commands/solids-modify.ts:160`**

```ts
const placed = solids[0].placement ? { ...solid, placement: solids[0].placement } : solid;
```

`booleanDescriptor.execute` funde los árboles con `prefixNodes` —que copia nodos y
renombra referencias, y **no hornea ninguna colocación** (`solids-support.ts:78-92`)— y
después aplica **sólo** `solids[0].placement`. La colocación de `solids[1..n]` se pierde
sin más. El comentario de las líneas 149-153 dice «los demás operandos ya traen su
colocación horneada en sus nodos… salvo que la tuvieran, y por eso se aplica», que es una
frase que se contradice a sí misma y que el código no cumple.

`placement` **sí** cambia con el uso normal: `solid3d-adapter.ts:305-317` compone en él
toda transformada 2D, o sea que **`MOVE` lo escribe**.

**Cómo falla, con números:** dibujo una caja A de 1000³ en el origen y una caja B de 200³
también en el origen. `MOVE` B 500 a la derecha. `SUBTRACT`, A primero. Resultado: el
agujero sale **en el origen**, no a 500. Sin ningún error. Y en `SLICE` (`:332`) y en
`FILLETEDGE` (`:220`) el mismo patrón sí está bien resuelto, lo que confirma que en la
booleana es un olvido y no una decisión.

**Cobertura:** `grep -rn placement engine/commands/solids.spec.ts solid3d.spec.ts` →
**cero**. Nadie lo prueba.

**Arreglo:** hornear la colocación de cada operando en su subárbol antes de fundir —o,
mejor, envolver cada operando en un nodo de transformación cuando el esquema tenga uno
(H1)—. Mientras tanto, lo mínimo honesto: si algún operando distinto del primero trae
`placement` no identidad, terminar con mensaje en vez de escribir.

### D2 · `profileFromEntity` aplana en silencio un perfil que no es horizontal

**`apps/web/src/lib/cad/solid3d-profiles.ts:84-128`** (elevaciones en `:88`, `:100`,
`:108`, `:117`, `:125`)

Toma la `z` de **un solo vértice** como elevación de todo el perfil y el resto de la
geometría de `pathPoints`, que devuelve `CadPoint2` (la proyección en planta). Una
polilínea cerrada sobre un SCU inclinado —que `draw-spatial.spec.ts:147-152` verifica que
se dibuja correctamente sobre el plano— se convierte en su sombra, colocada a la cota de
una esquina. Sin rechazo y sin aviso.

Es un **resultado incorrecto presentado como correcto**, que por la doctrina de la casa es
peor que una limitación declarada. Ver H4 para el arreglo.

### D3 · `pathOfEntity` aplana el camino del barrido

**`apps/web/src/lib/cad/solid3d-profiles.ts:247-259`**

```ts
const elevation = entity.type === "polyline" ? entity.vertices[0]?.z ?? 0 : ...;
return pathPoints(entity, segments).map((point) => ({ x: point.x, y: point.y, z: elevation }));
```

El mismo defecto que D2 en el camino de `SWEEP`. Sólo `line` (`:248`) conserva sus dos
puntos 3D. Y lo agrava que el kernel **sí sabe**: `lib/brep/sweep.ts` coloca el perfil en
el plano bisector de cada vértice y `lib/cad/plant/pipe-solid.ts` lo usa con caminos 3D
verdaderos —`plant-route.spec.ts` mide «24,00 m de tubo» en 3D contra 21 en planta—. Es
el comando `SWEEP` el que tira la cota que ya tenía.

### D4 · El juego de aristas por defecto puede contener una arista que el kernel garantiza que va a rechazar

**`apps/web/src/lib/cad/solid3d-build.ts:442-467`** y
**`apps/web/src/lib/brep/fillet.ts:213-216`**

`preferredFeatureEdges` clasifica por **verticalidad** (`Math.abs(dz)/length > 0.999`) y
por disyunción de vértices. **No mira el diedro.** `filletEdges` lanza en cuanto una
arista del juego es cóncava:

```ts
if (geometry.dihedralRad > Math.PI + 1e-9) {
  throw new Error(`La arista ${edge} es CÓNCAVA (diedro …). Redondear un rincón entrante exige AÑADIR material, y esta implementación sólo resta.`);
}
```

Un perfil en **L** extruido —una cartela, una zapata, un muro con retranqueo— tiene una
arista vertical cóncava, entra en el juego «preferido», y `FILLETEDGE` **falla entero**
citando una arista que el usuario nunca designó. La orden no escribe (bien: es atómica),
pero el usuario no tiene forma de excluirla porque no puede designar aristas (H3).

**Arreglo inmediato y barato:** filtrar por `edgeDihedralAngle(body, index) < Math.PI` en
el candidato, que es una llamada que el módulo ya importa. El mismo filtro sirve para
`chamfer`.

### D5 · La altura de EXTRUDE por punto es siempre positiva, y el comentario dice otra cosa que el código

**`apps/web/src/lib/cad/engine/commands/solids-create.ts:193-194` y `:205-213`**

El comentario dice: *«Un punto marca la altura por su distancia al plano del perfil medida
en Y»*. El código hace:

```ts
return Math.hypot(point.x - centre.x, point.y - centre.y);
```

Distancia **radial** al centroide en planta, no «en Y», y **siempre positiva**. Dos
consecuencias: mover el ratón en X cambia la altura de la extrusión, y **no hay forma de
extruir hacia abajo señalando** (hay que teclear un número negativo). En AutoCAD la
extrusión sigue la dirección del arrastre.

### D6 · `solids-push-face.ts` promete una capacidad que el adaptador de propiedades niega explícitamente

**`apps/web/src/lib/cad/engine/commands/solids-push-face.ts:34-37`** dice:

> *«si empujaste 30 cm y te equivocaste, no deshaces — cambias el 30 en propiedades y el
> sólido se reconstruye»*

**`apps/web/src/lib/cad/solid3d-adapter.ts:271-296`** dice:

> *«Sólo se escriben la capa, el nombre y la COLOCACIÓN. El árbol de construcción no se
> edita desde el bolsillo de propiedades»*

Las dos frases están en el mismo repositorio y se contradicen. La segunda es la que
manda, porque es el código que corre. Es el caso de H2, y la documentación es la única
que hoy afirma que existe.

### D7 · La cabecera del kernel dice que nadie lo importa, y eso dejó de ser verdad hace olas

**`apps/web/src/lib/brep/index.ts:11-15`**

> *«QUÉ NO ESTÁ CONECTADO. Nada de esto toca el visor todavía, y es deliberado … conectarlo
> es un cambio de una función, el día que se decida.»*

Ya se decidió. Lo importan hoy, entre otros: `lib/cad/solid3d-three.ts:58`,
`lib/cad/room-solid-three.ts:13`, `lib/cad/flatshot-solids.ts:47`,
`lib/cad/layout/solview-model.ts:82`, `lib/cad/pick3d/solid-face-ref.ts:74`,
`components/cad/viewport/solid-snap-host.ts:30`. Y la fila `brep.wired` de la rúbrica cobra
precisamente por eso. Una cabecera que miente sobre el estado de integración es la que
hace que la siguiente persona no busque el gancho que ya existe.

### D8 · La cinta declara un comando que no existe

**`apps/web/src/lib/cad/ribbon.ts:159`**: el regex del panel «Sólidos» incluye `SHELL`.
`SHELL` **no está** en los 294 nombres de `command-manifest.ts`; el vaciado es la rama
`SOLIDEDIT Cuerpo Vaciar`. Es inocuo (un regex que nunca casa) pero es un renglón muerto
en una tabla que tres gates recorren.

---

## 5. La apuesta ganadora

> **El árbol de construcción, editable, en el panel — y compartible por enlace.**

De todo lo que he mirado, ésta es la única cosa que haría que yo, que pago AutoCAD
completo, prefiera abrir Valle Design.

**Por qué gana.** AutoCAD no puede hacer esto. Un sólido 3D de AutoCAD tiene historial,
pero `SOLIDHIST` es un vestigio: se pierde en cuanto haces casi cualquier cosa, no expone
parámetros, y el flujo real de un despacho es que **rehaces la pieza** cuando cambia una
cota. Todo el mundo con quien trabajo lo sabe y lo asume. Es una de las quejas más viejas
del producto.

Y Valle Design **ya tiene lo difícil hecho**. Lo comprobé línea a línea:

- El árbol se **persiste**: `CadSolid3dEntity {nodes, root}` con trece operaciones
  (`cad-entities-v5.ts:141-239`), y el golden 47 afirma sobre lo que recibió el servidor
  que es el árbol y no una malla.
- Las booleanas **funden árboles en vez de hornear** (`solids-modify.ts:1-20`), así que la
  historia sobrevive a una resta — que es exactamente donde AutoCAD la pierde.
- El empujón de cara es **un nodo**, no un horneado, y la cabecera explica las dos razones
  (el tope de 200.000 puntos del servidor, y la reeditabilidad).
- Hay un **validador** que corre entre la operación y la escritura
  (`solids-support.ts:104-120`): un árbol que no evalúa no llega al documento.
- Y el documento vive en un CAS con historia, versiones, comentarios y enlaces de revisión
  (fila `persistence`, fila `review` de la rúbrica).

Lo único que falta es **la ventana**. Y la ventana es barata comparada con todo lo demás.

**Qué se construye, en concreto.**

1. **`solid3d-adapter.ts` publica el árbol.** `properties.read` deja de devolver
   `nodes: 3` y devuelve, además de lo que ya da, la lista de nodos con su `id`, su `op`,
   si es el `root`, y **sus parámetros escalares editables**: `height` y `draftAngleRad`
   de `extrude`; `angleRad` y `segments` de `revolve`; `radius`/`segments` de `fillet`;
   `distance` de `chamfer`; `distance` de `push`; `steps` de `loft`. Nada de perfiles ni
   de mallas: **sólo los números**, que es lo que se cambia el 95 % de las veces.
2. **`properties.write` acepta un parche por nodo**, valida con `validateSolidTree` +
   `evaluateSolidTree` **antes** de devolver la entidad —el mismo embudo que
   `finishedSolid` ya usa— y si no evalúa devuelve la entidad intacta con su motivo. La
   regla de la casa se respeta: no hay una segunda vía de mutación, todo pasa por
   `executeCadEntityCommand`.
3. **Un comando `SOLIDPARAM`** (nombre a decidir por el titular) para que lo mismo se
   pueda teclear, guionizar y hacer desde AutoLISP y desde el SDK, que es como el resto
   del motor está construido y lo que hace que sea probable sin navegador.
4. **El panel** en `CadEntityPropertiesPanel.tsx`: la lista de nodos como un árbol, el
   nodo raíz marcado, cada parámetro un campo, y el volumen recalculándose debajo — que ya
   está ahí (`properties.read` publica `volume`, `area` y el centroide).

**Por qué es la apuesta y no otra cosa.** Porque es lo único de esta dimensión donde
Valle Design no está persiguiendo a AutoCAD: **está delante**. Todo lo demás de mi lista
—girar un sólido, pinchar una arista, un gizmo, mallas— es alcanzar. Esto es adelantar. Y
tiene el multiplicador del navegador encima: yo le mando al cliente **un enlace**, él abre
la pieza en el móvil, ve el árbol, comenta «el pretil a 110» sobre el nodo, y yo cambio un
número y republico. Eso en AutoCAD son tres programas, una licencia de visor y un correo
con adjuntos.

Con H1 (transformaciones 3D) y H3 (designar arista) detrás, esto deja de ser una
curiosidad y se convierte en el motivo por el que alguien se cambia.

---

## 6. Resumen de la nota

| Qué mide | Cómo está |
|---|---|
| Kernel de sólidos (topología, booleanas, redondeo, teselado, invariantes) | **8/10** — facetado y honesto sobre serlo |
| Crear geometría (8 primitivas, EXTRUDE, REVOLVE, SWEEP, LOFT, PRESSPULL) | **6/10** — están los comandos, se aplana lo inclinado |
| **Editar** geometría (transformaciones 3D, subobjetos, SOLIDEDIT, empalmes) | **2/10** — es el agujero |
| SCU | **6/10** — completo salvo el dinámico, y no manda en EXTRUDE |
| Superficies y mallas como objetos | **0/10** — el kernel las tiene, el producto no las ofrece |
| Intercambio 3D (STEP/IGES/OBJ/STL/glTF entrando; DXF; descarga) | **4/10** — entra bien, no sale |
| De 3D a la lámina (FLATSHOT, SOLPROF, SOLVIEW, SOLDRAW, ocultas exactas) | **8/10** — lo mejor de la dimensión |
| Visualización (órbita, estilos, osnap 3D) | **5/10** — suficiente para modelar |
| **Global contra AutoCAD completo** | **3,5/10** |

Un modelador con un kernel excelente, un formato mejor que el de AutoCAD, un camino a la
lámina que me sorprendió, y **sin manos**. El día que pueda girar una pieza y pinchar una
arista, esta nota se dobla sin tocar el kernel.
