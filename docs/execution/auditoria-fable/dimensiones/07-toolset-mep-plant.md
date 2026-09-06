# Auditoría 07 · Toolsets MEP y Plant 3D

**Quién escribe:** arquitecto/ingeniero de despacho, veinte años, suscripción AutoCAD
completa, uso diario del toolset MEP y de Plant 3D. Abro Valle Design con la intención
honesta de mudarme y juzgo si podría hacer mi lunes aquí.

**Fecha:** 2026-09-05 · **Árbol leído:** `/home/user/valle-design` en su estado de hoy.

**Método:** leí las filas `toolset-mep`, `toolset-plant3d` y `toolset-electrical` de
`docs/competitive/rubric.json`, la tabla de `docs/parity/ESCALERA.md` (Olas F, 5 y 6),
`docs/history/execution/frentes-superar-20260904/mep-plant-peticiones.md` y después bajé
al código: `apps/web/src/lib/cad/plant/` (13 archivos), `apps/web/src/lib/cad/electrical/`
(9 archivos), `mep-runs.ts`, `mep-schedule.ts`, `mep-symbols.ts`,
`engine/commands/mep-*.ts`, `engine/commands/plant-*.ts`,
`data-extraction/mep-schedule-table.ts`, `data-extraction/circuit-schedule-table.ts`,
`ribbon.ts`, `entity-runtime.ts`, `blocks/positioned-attributes.ts`, `dxf-export.ts` y
`dxf-export-loss-manifest.ts`. Todo lo que afirmo abajo lo miré; donde no pude mirar
—goldens de Playwright, que aquí no tienen navegador— lo digo.

---

## 0. Veredicto

> Hay un esqueleto de tubería 3D mejor pensado que el de Plant 3D en tres cosas
> concretas —el metrado sale de la geometría, los accesorios se deducen en vez de
> colocarse, y el choque se mide por distancia exacta en el mismo aliento en que se
> tiende la corrida—, pero **no puedo entregar un plano**: el número de línea y la
> etiqueta del equipo no se dibujan en la lámina, y al exportar el DXF se pierden.

**Nota contra AutoCAD completo en esta dimensión: 3/10.**

El 3 no es despectivo. Un 0 sería «no hay nada», y hay bastante: siete órdenes PID, tres
de trazado MEP, ocho símbolos de bloque, un cuadro de instalaciones que sale en la
lámina, un análisis de choques con matemática exacta y specs serias, y un isométrico con
hoja. Contra AutoCAD MEP + Plant 3D —dos productos con veinte años, catálogos de
fabricante, gestor de proyecto, especificaciones, conectividad y salida a ISOGEN— eso es
el primer 25 % del camino, y el 25 % que falta para poder *entregar* está justo delante.

Lo que este árbol tiene de bueno es que casi todo lo que falta es **contenido y una
capa de anotación**, no motor. El motor está.

---

## 1. Mi lunes: qué pasa cuando lo intento de verdad

Cuento el flujo real, porque una lista de funciones no dice si se puede trabajar.

### 1.1 Lunes por la mañana: la hidráulica de una casa

Tecleo `PIPE`. Sale un prompt honesto: `Agua fría Ø19 mm en IH-AF. Precise el punto
inicial de la tubería, a la cota 0 mm`. Elijo `agua Caliente`, pongo `Diámetro 25`, dos
clics, `Elevación 2400`, tres clics más, `Elevación 900`, Intro. Y el mensaje que
devuelve es de las cosas mejor hechas que he visto en un CAD de navegador:

```
PIPE: 5 tramo(s) de agua caliente Ø25 mm, 11.400 mm en la capa IH-AC.
2 montante(s), 3.000 mm verticales. CHOQUE contra w-12 con 60 de calado. …
```

Me dice cuánto tubo hay, cuánto es vertical, y que acabo de atravesar una trabe. En
AutoCAD MEP tendría que lanzar Navisworks o el `INTERFERE` designando piezas. Aquí sale
solo. Esto está **mejor que AutoCAD**, y hay que decirlo (`mep-tracing.ts:180-201`,
`plant/clash.ts`).

Dos cosas me frenan en seco el mismo lunes:

- **El drenaje sanitario no tiene pendiente.** Toda mi bajante de 4" con 2 % de caída se
  dibuja plana. La orden ofrece `Elevación`, que mete un **montante vertical en el
  sitio** (`mep-tracing.ts:295-303`, `elevar()`), no un tramo en pendiente. Reviso
  `cadMepRisers` en `engine/commands/mep-support.ts:150-163` y lo confirma por su propia
  definición: «un tramo inclinado —una bajante con pendiente sanitaria, por ejemplo—
  tiene componente vertical y **NO** es un montante». O sea: el código sabe que la
  pendiente existe y no hay forma de teclearla. Un plano sanitario sin pendientes ni
  cotas de invertido no se sella.
- **No veo la instalación.** Tiendo a +2.400 y a +900 y en pantalla se superponen.
  `CadRenderPath` es explícitamente 2D (`entity-runtime.ts:62-65`,
  `points: CadPoint2[]`), y lo único que sube al visor 3D son los `solid3d`. La corrida
  MEP no genera ninguno: `cadPipeSolidEntity` sólo lo llama `plant-route.ts:245`
  (comprobado con `grep` sobre todo `apps/web/src`). Así que en el toolset MEP la cota
  existe en el número y no en la pantalla.

### 1.2 Lunes por la tarde: el P&ID de la planta

`PIDLINE`, diámetro `6"`, servicio `P`, especificación `CS150`, tres clics, Intro:
`PIDLINE: 6"-P-1001-CS150, 3 punto(s) en TU-PROC`. Perfecto. `PIDEQUIP B`: la bomba nace
con su `P-101`.

Trazo el cajetín, mando a lámina, imprimo… y **el P&ID sale con las líneas y los equipos
sin nombre**. No es una impresión: es lo que dice el código.

- El número de línea vive **sólo** en `context.metadata['pl:linea']`
  (`plant/line-numbers.ts:46`, `cadPlantLineMetadata` en :223). `plant-line.ts:145-165`
  emite **una polilínea y nada más**: ni MTEXT, ni directriz, ni bloque de rótulo.
  Comprobado con `grep -n "mtext|type: \"text\"|leader"` sobre `plant-line.ts` y
  `plant-route.ts`: **cero coincidencias**.
- La etiqueta del equipo sí va en `attributes.TAG` (`plant-equipment.ts:145-157`), pero
  el atributo **tampoco se dibuja**, y esto es un defecto de código, no una decisión.
  `pid-symbols.ts:192` declara `attributes: { TAG: { prompt: …, default: "" } }` y
  `cadResolvePositionedAttributes` (`blocks/positioned-attributes.ts:108-110`) filtra a
  propósito: *«Un atributo SIN posición no tiene dónde dibujarse. Se queda fuera de esta
  lista»*. Como `TAG` no lleva `position`, `cadInsertBlockCommands`
  (`blocks/block-workflow.ts:379-393`) no emite `positionedAttributes`, y **la bomba
  llega a la lámina anónima**. El golden 94 afirma que el `TAG` está en el documento
  persistido —y lo está—, no que se vea.

Un P&ID cuyas líneas y equipos no llevan su rótulo impreso no es un P&ID: es un dibujo
de tuberías. Este es, con diferencia, el hueco que más duele.

### 1.3 Lunes de tarde-noche: mandarlo

Exporto DXF para el estructurista y para el contratista. Reviso `dxf-export.ts`: la
XDATA sólo se escribe para dos aplicaciones, `DXF_XDATA_APP_MLEADER` (:769) y
`DXF_XDATA_APP_BLOCK` (:805, :845). No hay ningún camino que escriba
`context.metadata`; la única mención de metadatos en todo el exportador es la tolerancia
de fabricación (`dxf-export.ts:131`).

Consecuencia medida: **al exportar se pierden `pl:linea`, `pl:servicio`,
`pl:especificacion`, `pl:ruta`, el `service`/`size` de las corridas MEP y
`ie:proteccion`/`ie:tension`/`ie:fases` de los circuitos.** Y peor: no aparecen en
`dxf-export-loss-manifest.ts`, cuya propia cabecera fija la regla de oro del módulo:

> «Todo lo que el fichero no va a contener aparece aquí con su entidad, su tipo de
> origen, su severidad y una frase que dice qué se pierde exactamente. **Una entidad que
> el exportador ignora sin más línea en el manifiesto es un fallo del producto**, no una
> limitación conocida.»

Es el propio repositorio quien lo llama fallo. Con `DWG_IMPORT_FLAG`/`DWG_EXPORT_FLAG`
en `false` a propósito, el DXF es la única puerta de salida, así que hoy la ingeniería de
la planta **no sale del navegador**.

---

## 2. Lo que ya está construido y está bien

No cometo el error de pedir lo que ya existe. Esto lo miré y funciona:

| Qué | Dónde | Comentario de oficio |
| --- | --- | --- |
| `PIPE`, `DUCT`, `CABLETRAY` por servicio, con capa, color y tipo de línea con texto | `engine/commands/mep-tracing.ts` (370 líneas), `mep-support.ts` (10 servicios) | El ducto y la charola salen a **doble línea con esquinas a inglete** calculadas de verdad (`cadDoubleLineOutline`, `mep-support.ts:206-247`), no dos offsets sueltos. Mejor que lo que hace media plantilla de despacho a mano. |
| Cota y montante en las tres órdenes | `mep-tracing.ts:295-303`; longitud 3D en `cadPathLength` (`mep-support.ts:129-138`) | El comentario dice el defecto que cerró: un montante de 2 m sumaba cero metros. Es exactamente el error que yo he cazado en obra. |
| Un único lector de corridas MEP | `mep-runs.ts` (158 líneas) | Que el cuadro y el análisis de choques lean por el **mismo** lector es la decisión correcta; en AutoCAD MEP el take-off y el clash no siempre coinciden. |
| Cuadro de instalaciones en la lámina, con montantes y codos | `mep-schedule.ts`, `data-extraction/mep-schedule-table.ts`, `DATAEXTRACTION Instalaciones` | Siete columnas, longitud en metros, montantes y codos deducidos. Sale como `TABLE` del documento, no como una imagen. |
| Análisis de choques por **distancia exacta** segmento-caja, con vanos restados | `plant/clash.ts` (31 KB, spec de 421 líneas) | Esto es serio: la matemática está deducida (convexa a trozos, quiebres en planos de cara y planos medios) y contrasta contra un muestreo denso en la spec. Distingue `choque-duro`, `holgura-insuficiente` y `paso-por-hueco`. AutoCAD te da booleanos; esto te da milímetros. |
| Ruteo 3D con número de línea, accesorios **deducidos** y hallazgos | `plant/pipe-route.ts` (16 KB) | Codo, te y reducción salen de la geometría y no se desincronizan. Y `cadPipeRouteFindings` caza codo a medida, especificación partida, tramo nulo y ruta plana. Plant 3D no te avisa de un codo de 37°. |
| Lista de materiales medida sobre el modelo, con su límite **en el título del cuadro** | `plant/pipe-mto.ts` | Que `CAD_PL_MTO_LIMITS` viaje impreso dentro de la tabla es más honesto que cualquier MTO que yo haya firmado. |
| Isométrico con longitudes VERDADERAS, norte proyectado y HOJA en un solo deshacer | `plant/isometric.ts`, `engine/commands/plant-iso.ts` | Entendió lo que es un isométrico: sin escala, con el número rotulado como texto porque una cota mediría el trazo proyectado. Y crea la lámina con la ventana encuadrando dibujo + cuadro. |
| Tubo facetado de 16 lados **de área equivalente**, densificado a ±100 mm de cada codo | `plant/pipe-solid.ts` | El análisis del pellizco del barrido (−12,7 % de volumen sin densificar, −0,33 % con) está medido y fijado en la spec. Es ingeniería de verdad. |
| Revisión eléctrica contra la NOM-001-SEDE con la longitud REAL de la polilínea | `electrical/circuit-check.ts`, `nom-conductors.ts`, `AECHECK` | **Esto está mejor que AutoCAD Electrical**, y su cabecera lo argumenta bien: los conductores de AutoCAD Electrical son esquemáticos y no saben cuánto miden. Aquí la caída de tensión sale del plano. |
| Cuadro de cargas como `TABLE` con veredicto y con su límite en el título | `data-extraction/circuit-schedule-table.ts` | El mismo módulo que `AECHECK`, no una segunda cuenta. |

Y un mérito de gobierno que no es técnico pero pesa: cada módulo declara en su cabecera
qué **no** hace y por qué. `CAD_PL_CLASH_LIMITS`, `CAD_PL_MTO_LIMITS`,
`CAD_PL_SOLID_LIMITS`, `CAD_NOM_CHECK_LIMITS`. Después de veinte años firmando planos,
un programa que me dice dónde no me cubre vale más que uno que promete de más.

---

## 3. Los huecos, por lo que más duele

### H1 · El número de línea y la etiqueta del equipo no se dibujan en la lámina — **BLOQUEANTE**

- **AutoCAD:** Plant 3D anota la línea con su rótulo (con directriz, con marca de rotura,
  con formato configurable por proyecto) y el equipo con su etiqueta posicionada por la
  regla de anotación. El P&ID impreso es legible sin abrir el fichero.
- **Valle hoy:** `plant-line.ts:145-165` y `plant-route.ts:218-238` insertan **sólo** una
  polilínea con metadatos; ninguna orden emite texto. El `TAG` del equipo existe en
  `attributes` pero `pid-symbols.ts:192` lo declara sin `position`, y
  `positioned-attributes.ts:108-110` filtra explícitamente los atributos sin posición.
- **Por qué duele:** imprimo el P&ID y no se puede leer. La información existe en el
  fichero y no en el papel, que es donde vive un P&ID.
- **Esfuerzo:** un día.
- **Cómo se construye:** (a) en `pid-symbols.ts`, añadir a cada símbolo
  `attributes: { TAG: { defaultValue: "", prompt: …, position: { x: 0, y: -altura, z: 0 },
  height: 200 } }` — corrigiendo de paso `default` → `defaultValue` y quitando el
  `as unknown as CadBlockDefinition` que lo tapa; (b) nuevo módulo
  `plant/line-annotation.ts` con `cadPlantLineLabelEntities(route, options)` que devuelva
  un `mtext` en el punto medio del tramo más largo, alineado con él, en una capa
  `TU-ROT`, más su directriz opcional; llamarlo desde `plant-line.ts` y `plant-route.ts`
  en el **mismo lote** que la polilínea. El rótulo se marca con
  `metadata['pl:rotulo-de'] = entityId` para poder rehacerlo sin duplicarlo.
- **Cómo se verifica:** spec que afirma un `mtext` con el texto exacto
  `6"-P-1001-CS150` en el lote de `PIDLINE`; spec de `cadResolvePositionedAttributes`
  con el bloque `PID-BOMBA` devolviendo un atributo posicionado; golden 94 ampliado para
  leer el texto sobre el documento del servidor.

### H2 · Los metadatos de planta, MEP y circuito se pierden al exportar DXF, en silencio — **BLOQUEANTE**

- **AutoCAD:** Plant 3D guarda los datos en el propio DWG (objetos personalizados) y,
  para terceros, exporta a PCF/XLS. AutoCAD MEP lleva propiedades de sistema y tamaño en
  la entidad.
- **Valle hoy:** `dxf-export.ts` escribe XDATA sólo para MLEADER (:769) y BLOCK (:805,
  :845); `context.metadata` no tiene camino. `dxf-export-loss-manifest.ts` (364 líneas)
  no declara la pérdida, contra su propia regla de oro.
- **Por qué duele:** mando el DXF al contratista de tubería y le llega geometría muda:
  ni número de línea, ni especificación, ni diámetro. Si me lo devuelve corregido y lo
  reimporto, he perdido el proyecto entero. Con las banderas DWG en `false`, el DXF es la
  única salida.
- **Esfuerzo:** varios días (el manifiesto, un día).
- **Cómo se construye:** registrar un `APPID` propio (`VALLE_META`) en la tabla APPID del
  DXF y escribir la XDATA por entidad con las claves de `context.metadata` filtradas a
  una lista blanca declarada (`pl:*`, `mep`, `service`, `size`, `ie:*`), troceando a 255
  caracteres por par 1000 como ya hace `dxf-write-dimensions.ts:225`; en el lector,
  reconstruir `context.metadata` desde ese APPID. **Mientras no exista**, la corrección
  barata y obligatoria es la otra mitad: añadir a `dxf-export-loss-manifest.ts` una
  entrada `dxf_export_metadata_dropped` por entidad con metadatos, con severidad alta y
  la frase «se pierden el número de línea / el servicio / los datos de circuito».
- **Cómo se verifica:** ida y vuelta en `verification/dxf-roundtrip.spec.ts` con una
  ruta `6"-P-1001-CS150` y un conductor con `ie:proteccion`, afirmando la igualdad de
  metadatos; y una spec del manifiesto que afirme la entrada nueva **antes** de que la
  XDATA exista, para que la pérdida deje de ser silenciosa hoy.

### H3 · No hay pendiente ni cota de invertido: el drenaje no se puede proyectar — **ALTA**

- **AutoCAD:** AutoCAD MEP rutea con pendiente declarada (%, o cota de invertido en dos
  puntos), la mantiene al editar y la rotula.
- **Valle hoy:** `mep-tracing.ts` sólo ofrece `Diámetro`/`aNcho`, `Elevación` y
  `desHacer`; `elevar()` (:295-303) mete siempre un **tramo vertical en el sitio**.
  `cadMepRisers` (`mep-support.ts:150-163`) separa explícitamente el montante del tramo
  inclinado, así que el modelo de datos ya distingue lo que la orden no deja teclear.
- **Por qué duele:** todo mi sanitario y mi pluvial son planos. Ni pendientes, ni cotas
  de invertido en pozos, ni comprobación de mínimo reglamentario. Es la mitad del trabajo
  de instalaciones de una casa, y no se puede hacer.
- **Esfuerzo:** un día.
- **Cómo se construye:** palabra clave `Pendiente` (atajo `PE`, que `EL` y `E` ya están
  cogidos) en `tracingCommand`, con estado `slopePercent: number` en `TracingState`; al
  aceptar un punto, `z = zAnterior − distanciaPlana * slope/100` en vez de
  `state.elevation`. Añadir a `mep-runs.ts` un `cadMepRunSlopes(run)` que devuelva la
  pendiente de cada tramo, y una comprobación nueva en el aviso de cierre: «pendiente
  0,4 % en el tramo 3: por debajo del mínimo del proyecto», con el mínimo como parámetro
  del proyecto y **sin transcribir ninguna norma**.
- **Cómo se verifica:** spec en `mep-tracing.spec.ts` con `PIPE S`, `Pendiente 2`, dos
  puntos a 10.000 en planta, afirmando `z = −200` en el segundo vértice y la longitud 3D
  de 10.002,0; una segunda spec afirmando que sin `Pendiente` el lote es **idéntico** al
  de hoy (la condición para no tocar el golden 81).

### H4 · La instalación MEP no tiene volumen: no se ve en 3D y no sale en ortográficos — **ALTA**

- **AutoCAD:** en AutoCAD MEP la tubería y el ducto son objetos 3D con su sección; se ven
  en el modelo, se cortan, se secciona el plafón, se hace un plano de plafón reflejado.
- **Valle hoy:** sólo `PIDROUTE Sólido` produce un `solid3d`
  (`plant-route.ts:245`, `plant/pipe-solid.ts`). `PIPE`, `DUCT` y `CABLETRAY` no llaman a
  `cadPipeSolidEntity` (verificado por `grep` en todo `apps/web/src`), y `CadRenderPath`
  es 2D (`entity-runtime.ts:62`), así que la polilínea con cota se pinta en el suelo.
  `ESCALERA.md:178` lo declara con estas palabras: «Ver la cota en pantalla | 0».
- **Por qué duele:** ruteo a +2.400 y no lo veo a +2.400. No puedo enseñarle al cliente
  el plafón, no puedo hacer `FLATSHOT` de la instalación, y la coordinación entre
  disciplinas se queda en el renglón de texto del choque.
- **Esfuerzo:** varios días.
- **Cómo se construye:** generalizar `pipe-solid.ts` a `mep-solid.ts`: para `kind:"pipe"`,
  el mismo prisma de 16 lados con el diámetro en mm; para `kind:"duct"` y `"tray"`, un
  perfil **rectangular** que exige el hueco H10 (canto). Palabra clave `Sólido` en las
  tres órdenes, con la misma huella `pl:huella` y el mismo aviso de «quedó viejo» que ya
  cobra `cadPipeSolidsStale`.
- **Cómo se verifica:** spec que afirme volumen `π r² L` a 0,5 % para el tubo y
  `ancho × canto × L` exacto para el ducto, medidos con `solid3dMassProperties`; y el
  aviso de sólido viejo al mover un vértice, como ya hace `pipe-solid.spec.ts`.

### H5 · Una línea de proceso no puede tener dos tramos: la reducción parte la línea en dos — **ALTA**

- **AutoCAD:** una línea `1001` puede tener N tramos, cambiar de diámetro con su
  reducción y seguir siendo una sola línea en la lista, en el isométrico y en la
  requisición.
- **Valle hoy:** `PIDROUTE` y `PIDLINE` llaman siempre a `cadNextPlantLineNumber`
  (`line-numbers.ts:125-136`), que devuelve `mayor + 1`. No hay forma de teclear un
  número existente ni de continuar una línea. Y el árbol se contradice consigo mismo:
  `pipe-route.ts:78-84` afirma que *«`6"-P-1001` y `4"-P-1001` son la MISMA línea en dos
  tramos»* y comprueba la especificación contra esa identidad, mientras
  `cadPlantFindings` (`line-numbers.ts:188-195`) declara ese mismo dibujo defectuoso con
  `numero-repetido`. Además, `plant-iso.ts:95` y `pipe-mto.ts:80` filtran por la **cadena
  completa** (`6"-P-1001-CS150`), así que los dos tramos producen dos isométricos y dos
  listas, cada una con la mitad del material.
- **Por qué duele:** la reducción es lo más común del mundo. Hoy no la puedo modelar sin
  que PIDLIST me acuse de un error y sin que el isométrico se parta.
- **Esfuerzo:** un día.
- **Cómo se construye:** (a) en `PIDROUTE`/`PIDLINE`, aceptar en el paso del servicio la
  forma `P-1001` (servicio + correlativo) para **continuar** una línea existente, con el
  diámetro y la especificación tomados de ella y sólo el diámetro sobrescribible;
  (b) en `cadPlantFindings`, degradar `numero-repetido` a defecto **sólo** cuando los
  tramos con la misma identidad tengan **especificaciones distintas** o **no se toquen**
  (usar `seEmpalman` de `clash.ts`); (c) en `plant-iso.ts` y `pipe-mto.ts`, filtrar por
  **identidad** (`servicio-correlativo`) y no por la cadena completa, y titular el
  isométrico con `P-1001` y el rango de diámetros.
- **Cómo se verifica:** spec con dos rutas `6"-P-1001-CS150` y `4"-P-1001-CS150` unidas
  punta con punta: `PIDLIST` no informa `numero-repetido`, `PIDMTO` da los metros de las
  dos y una `Reducción 6" × 4"`, y `PIDISO P-1001` dibuja **un** isométrico con los dos
  tramos.

### H6 · No hay gestor de datos ni forma de ver o editar las propiedades de una línea — **ALTA**

- **AutoCAD:** el Data Manager de Plant 3D es una hoja editable de todas las líneas,
  equipos, boquillas e instrumentos del proyecto; se filtra, se edita en bloque y se
  exporta a Excel. La paleta de Propiedades muestra las propiedades del objeto de tubería.
- **Valle hoy:** todo vive en `context.metadata` y **la paleta de propiedades no lo
  expone**: `grep -rn "metadata" apps/web/src/components/cad/palettes/` no devuelve nada,
  y `grep -rn "pl:linea|CAD_PL_LINE|ie:circuito" apps/web/src/components/` tampoco.
  `PIDLIST` (alias `PLANTDATAMANAGER`) escribe un renglón en la línea de órdenes; no es
  una tabla y no se edita. Ninguna orden re-etiqueta geometría ya dibujada — a diferencia
  del lado eléctrico, donde `AETAG` y `AECIRCUIT` sí estampan sobre lo existente.
- **Por qué duele:** me equivoco al teclear `CS150` en la primera línea y no tengo forma
  de corregirlo salvo borrar y volver a trazar. Un plano heredado por DXF no se puede
  etiquetar. Y con el alias `PLANTDATAMANAGER` puesto en el manifiesto
  (`command-manifest.ts:235`) prometemos un nombre que no entrega lo que ese nombre
  significa en AutoCAD.
- **Esfuerzo:** varios días.
- **Cómo se construye:** dos mitades independientes. (1) `PIDEDIT`, orden `modify` con
  `selection: "required"`, que lee la línea seleccionada, pregunta diámetro / servicio /
  correlativo / especificación con los valores actuales por defecto y emite un
  `{type:"update"}` de metadatos **más** el rehacer del rótulo de H1. (2) Una sección
  «Datos» en `CadEntityPropertiesPanel.tsx` que muestre, en modo lectura primero, las
  claves con espacio de nombres conocido (`pl:`, `ie:`, `mep`) con su etiqueta en
  castellano. Nota de proceso: la orden nueva obliga a tocar `ribbon.ts` y
  `docs/cad/evidence/ui-command-reach.json`, exactamente lo que ya avisa P-mep-plant-02.
- **Cómo se verifica:** spec de `PIDEDIT` que cambia `CS150` por `SS300` en una ruta y
  afirma que `PIDLIST` deja de informar `servicio-con-dos-especificaciones`; spec del
  modelo de la paleta que afirme las filas de datos para una entidad con `pl:linea`.

### H7 · El catálogo P&ID no tiene válvulas ni instrumentación: seis equipos no son un P&ID — **ALTA**

- **AutoCAD:** cientos de símbolos ISA/ISO: válvula de compuerta, globo, retención,
  mariposa, de control con su actuador, de seguridad, filtros, trampas, reductoras,
  bridas, líneas de señal (neumática, eléctrica, capilar, de software), conectores de
  fuera de hoja, roturas de línea, globos de instrumento por tipo (campo, panel,
  compartido, programa) con numeración de lazo.
- **Valle hoy:** `plant/pid-symbols.ts` tiene **seis**: recipiente, bomba, intercambiador,
  tanque, compresor e instrumento de campo. Cero válvulas —hay una `MEP-VALVULA` en
  `mep-symbols.ts:44-58`, pero es de agua fría y no entra en el catálogo PID ni en
  `cadIsPidInsert`, que exige prefijo `PID-` (`equipment-tags.ts:118-120`). No hay líneas
  de señal, ni conector de fuera de hoja, ni rotura de línea, ni numeración de lazo.
- **Por qué duele:** no puedo dibujar el P&ID más simple de una casa de bombas: una
  succión con su válvula de compuerta, una descarga con retención y control, y un `PIC`
  con su lazo. Y sin válvulas la lista de materiales del isométrico **no las puede
  contar**, cosa que `pipe-route.ts:36-40` reconoce: «Las válvulas se cuentan por sus
  símbolos, que es de donde salen» — y esos símbolos no existen.
- **Esfuerzo:** varios días.
- **Cómo se construye:** ampliar `CAD_PID_SYMBOLS` con las formas de dominio común
  (dos triángulos enfrentados para la compuerta, con círculo para el globo, con arco para
  la retención, con actuador de diafragma para la de control), todas con
  `prefix: "V"`/`"FV"` y con `position` de atributo desde el primer día (H1). Añadir un
  segundo catálogo `CAD_PID_ANNOTATIONS` para conector de fuera de hoja y rotura de
  línea. Numeración de lazo: reutilizar `cadNextEquipmentNumber` con prefijo de tres
  letras, que ya lo admite (`equipment-tags.ts:52-59`).
- **Cómo se verifica:** spec por símbolo que afirme la geometría (no un rectángulo con
  nombre), como ya hace `plant-equipment.spec.ts`; y una spec de MTO que cuente
  `Válvula de compuerta 6": 2 pz` a partir de dos inserciones sobre la línea.

### H8 · No hay especificación de tubería del proyecto: sin ella, ni diámetro exterior, ni espesor, ni aislamiento, ni holgura fiable — **ALTA**

- **AutoCAD:** la spec (`.pspx`) es el corazón de Plant 3D: por diámetro y clase da
  material, cédula, espesor, diámetro exterior, extremos, peso, tornillería y junta, y
  el ruteo **sólo** deja poner lo que la spec permite.
- **Valle hoy:** declarado y ausente. `line-numbers.ts:26-36` explica por qué no se
  transcribe una ajena, y la petición P-mep-plant del 04-09 confirma que **el catálogo
  del proyecto tampoco existe** («no hay ningún módulo de catálogo bajo
  `lib/cad/plant/`»). Consecuencias medidas y declaradas: la holgura del choque es
  **optimista** porque usa el nominal (`clash.ts:44-54`), el sólido usa el nominal
  (`pipe-solid.ts:20-34`), el MTO no lleva peso ni clave de compra
  (`pipe-mto.ts:113-118`) y nada impide rutear un 5" (sólo `PIDLIST` lo regaña después).
- **Por qué duele:** compro por el MTO y me faltan el peso, la cédula y las bridas. Y la
  holgura del choque es la del nominal: una 6" aislada con 25 mm ocupa 40 mm más de radio
  que lo que el programa está midiendo, así que un «pasa con 55 mm» real es un choque.
- **Esfuerzo:** semanas (y ver §5: aquí está la apuesta ganadora).
- **Cómo se construye:** `plant/pipe-spec.ts` con un tipo
  `CadPipeSpec { id, description, items: { nps, od, wallMm, insulationMm?, weightKgM?, ends, purchaseCode? }[] }`
  **vacío de contenido** —lo llena la organización— guardado con el documento o en el
  proyecto; `cadPipeSpecLookup(spec, nps)` como único punto de consulta; y tres
  consumidores: `radioDe` en `clash.ts` (od/2 + aislamiento en vez de nominal/2),
  `cadPipeSolidRadius` en `pipe-solid.ts`, y una columna de peso y clave en
  `pipe-mto.ts`. Cuando la spec no está, todo sigue funcionando exactamente como hoy y el
  límite se sigue diciendo — degradación honesta, no fallo.
- **Cómo se verifica:** spec que con una spec de proyecto de tres renglones afirme
  radio de choque `od/2 + aislamiento`, y control negativo: sin spec, los números son
  **idénticos** a los de hoy (condición para no mover ningún golden).

### H9 · El ducto sólo tiene ancho: sin canto, sin accesorios y sin dimensionado — **ALTA**

- **AutoCAD:** duct rectangular con ancho × canto, transiciones, codos con radio, tes,
  reducciones, compuertas, y un dimensionador por caudal (fricción constante /
  recuperación estática).
- **Valle hoy:** `DUCT` guarda un solo número, el ancho
  (`mep-tracing.ts:229-268`); `clash.ts:108` lo dice sin adornos: «un ducto o una charola
  como un cilindro de su **ANCHO**: el canto no lo guarda el dibujo». No hay accesorios,
  no hay caudal, no hay pérdida de carga (`grep` de `caudal`, `CFM`, `ASHRAE` sobre
  `lib/cad/plant`, `mep-*.ts`: cero).
- **Por qué duele:** el ducto de 600 × 300 se mide contra la trabe **como si fuera de 600
  de alto**: acusa de más en el plano vertical y, si lo declaro por el canto, acusa de
  menos. En cualquiera de los dos casos el informe de choques del aire no es de fiar. Y no
  puedo justificar un tamaño ante nadie.
- **Esfuerzo:** varios días.
- **Cómo se construye:** añadir `aLto` (`L`) al estado de `DUCT`/`CABLETRAY` y guardarlo
  en `metadata.height`; en `mep-runs.ts`, propagarlo a un campo nuevo `heightMm` de
  `CadPipeRoute`; en `clash.ts`, medir la conducción rectangular por **caja orientada**
  (ancho × canto) y no por cilindro — la función de distancia caja-caja se resuelve con
  el mismo `cadSegmentBoxDistance` llevando el segmento al marco. El dimensionado por
  caudal es contenido posterior y **no** se debe prometer con esto.
- **Cómo se verifica:** spec que con un ducto de 600 × 300 bajo una trabe a 320 de
  holgura diga «sin choque», y con la misma geometría medida como cilindro de 600 dijera
  choque (control negativo explícito).

### H10 · El isométrico es de una sola hoja, sin spools, sin soldaduras y sin tornillería — **MEDIA**

- **AutoCAD:** ISOGEN parte la línea en hojas por longitud, numera soldaduras de taller y
  de campo, separa spools, lista tornillería y juntas, dibuja cotas de coordenadas
  norte/este/elevación y pone las banderas de continuación entre hojas.
- **Valle hoy:** `isometric.ts` dibuja un solo cuadro con longitudes de tramo y marcas de
  accesorio. `cadIsoTextHeight` (:96-104) encoge la letra hasta 60 en un dibujo grande:
  una línea de 200 m entra entera en una hoja y se lee mal. No hay soldaduras, ni spools,
  ni tornillería, ni coordenadas, ni continuación.
- **Por qué duele:** el isométrico existe para que el taller corte y suelde. Sin
  soldaduras numeradas ni longitudes de corte, es un croquis bonito.
- **Esfuerzo:** semanas.
- **Cómo se construye:** en `pipe-route.ts`, `cadPipeWelds(routes)` que ponga una
  soldadura en cada accesorio deducido y en cada empalme punta-punta, numeradas por
  línea; en `isometric.ts`, una función de partición que corte el recorrido acumulado en
  tramos de `maxLongitud` y emita N `CadIsoDrawing` con banderas de continuación
  (`CONT. HOJA 2/3`); y una columna de longitudes de corte en el MTO. Todo derivado, nada
  persistido, como el resto del módulo.
- **Cómo se verifica:** spec que sobre una línea de 120 m con `maxLongitud` de 40 m
  produzca tres hojas con banderas coherentes y la suma de longitudes rotuladas igual a
  la longitud 3D total.

### H11 · No hay soportes ni colgantes — **MEDIA**

- **AutoCAD:** Plant 3D coloca soportes de catálogo con su etiqueta y los cuenta;
  AutoCAD MEP tiene colgantes paramétricos.
- **Valle hoy:** nada. `grep -ril "soporte|hanger"` sobre `lib/cad/plant` y `mep-*.ts`
  sólo encuentra la palabra en **prosa** (`isometric.ts:130`, «se le añade un soporte»;
  `pipe-route.ts:38`, que dice explícitamente que no se inventan). Cuidado con el nombre:
  `engine/commands/mep-support.ts` **no** es de soportes, son piezas compartidas.
- **Por qué duele:** el soporte es partida de obra, se cotiza aparte y hay que
  coordinarlo con la estructura. Y en el cuadro de instalaciones se cuentan montantes
  —que llevan soporte— pero no soportes.
- **Esfuerzo:** varios días.
- **Cómo se construye:** símbolos `PL-SOP-*` y `MEP-SOP-*` como bloques con atributo de
  tipo y carga, insertables por una orden que además **sugiera** la separación a partir
  de la geometría (cada N metros de tramo horizontal y uno por montante), con N como dato
  del proyecto y sin transcribir ninguna tabla. Contarlos en `pipe-mto.ts` y en
  `mep-schedule.ts` como una sección más.
- **Cómo se verifica:** spec que sobre una corrida de 24 m con separación de 3 m proponga
  8 soportes, y que el cuadro los liste.

### H12 · Los símbolos MEP no llevan atributos: la luminaria no tiene etiqueta, ni carga, ni circuito — **MEDIA**

- **AutoCAD:** en AutoCAD MEP el dispositivo tiene propiedades de sistema y de carga, se
  conecta a un circuito y el cuadro de cargas **suma la carga conectada**.
- **Valle hoy:** `cadMepBlockDefinition` (`mep-symbols.ts:157-159`) devuelve el bloque
  **sin `attributes`** —al contrario que `cadPidBlockDefinition`, que sí los declara—. Y
  `CIRCUIT_HEADERS` (`data-extraction/circuit-schedule-table.ts:37-50`) tiene protección,
  tensión, fases, longitud y caída, pero **ninguna columna de carga en VA ni de
  descripción**. `cadCheckCircuits` calcula con la protección a propósito y lo argumenta
  bien (`circuit-check.ts:25-33`), pero eso es porque el dibujo no sabe la carga.
- **Por qué duele:** el cuadro de cargas mexicano lleva carga conectada, demanda y
  descripción por circuito. El de aquí no las puede tener porque las luminarias y los
  contactos son dibujos anónimos.
- **Esfuerzo:** varios días.
- **Cómo se construye:** dar a cada `CadMepSymbol` un bloque de atributos posicionados
  (`TAG`, `CIRCUITO`, `VA`) con `position` y `height`; extender `AETAG` para admitir
  también estos bloques; en `mep-schedule.ts`, agrupar los dispositivos por circuito; y
  añadir a `CIRCUIT_HEADERS` una columna `Carga (VA)` sumada desde los dispositivos, con
  su límite declarado («la carga es la anotada en el dispositivo; el factor de demanda lo
  aplica el proyectista»).
- **Cómo se verifica:** spec que con cuatro luminarias de 60 VA en `C-1` afirme
  `240 VA` en la fila del circuito, y control negativo con un dispositivo sin `VA`
  contado como «sin declarar» en vez de como cero.

### H13 · No hay proyecto ni conectividad: el P&ID y el modelo 3D no se hablan — **MEDIA**

- **AutoCAD:** el Project Manager de Plant 3D agrupa P&ID, modelos, isos, specs e
  informes; y valida el modelo 3D **contra** el P&ID (línea que existe en el esquema y no
  en el modelo, diámetro discrepante, equipo sin boquilla).
- **Valle hoy:** un documento es un dibujo. La única relación P&ID ↔ 3D que existe es la
  frase de `plant-iso.ts:100-103`: si la línea sólo tiene esquema, avisa de que la tienda
  con `PIDROUTE`. No hay boquillas (`nozzle` aparece sólo en un comentario de
  `line-numbers.ts`), ni conectividad, ni comprobación cruzada. La cinta mete las 17
  órdenes de tres disciplinas en un solo panel «Instalaciones» de la pestaña Inicio
  (`ribbon.ts:146`, `CAD_KIND_TAB.draw = "inicio"`), sin espacio de trabajo por toolset.
- **Por qué duele:** la pregunta que hago cada semana —«¿el modelo tiene todas las líneas
  del P&ID, y con el diámetro que dice el P&ID?»— no se puede contestar aquí.
- **Esfuerzo:** semanas.
- **Cómo se construye:** empezar por lo barato y que ya cabe: `PIDLIST` amplía sus
  hallazgos con `linea-sin-ruta` (existe `pl:linea` sin `pl:ruta` con la misma identidad)
  y `ruta-sin-esquema`, comparando por identidad (H5). El proyecto multi-documento es
  otra conversación y **no** debe prometerse con esto.
- **Cómo se verifica:** spec con un P&ID de tres líneas y dos rutas, afirmando el
  hallazgo `linea-sin-ruta` con el número exacto de la que falta.

### H14 · Sin aislamiento en ninguna parte — **MEDIA**

- **AutoCAD:** el aislamiento es una propiedad de la línea; se ve, se mide y entra en la
  holgura y en el metrado.
- **Valle hoy:** aparece sólo como límite declarado, tres veces (`clash.ts:52`,
  `clash.ts:108`, `pipe-solid.ts:23`). No hay dato, no hay geometría, no hay metrado.
- **Por qué duele:** en agua caliente, vapor y aire acondicionado el aislamiento es lo que
  decide si el tubo cabe en el plafón. La holgura optimista de hoy aprueba montajes
  imposibles.
- **Esfuerzo:** un día, encima de H8.
- **Cómo se construye:** `insulationMm` en la spec del proyecto (H8) y, como puente,
  palabra clave `Aislamiento` en `PIDROUTE`/`PIPE` que lo guarde en
  `metadata['pl:aislamiento']`; `radioDe` en `clash.ts:541-548` suma
  `nominal/2 + espesor`; `pipe-mto.ts` añade un renglón de metros de aislamiento por
  espesor. El texto de `CAD_PL_CLASH_LIMITS` deja de decir «optimista» **sólo** cuando
  hay dato.
- **Cómo se verifica:** spec que con 25 mm de aislamiento convierta una holgura de 55 mm
  en un choque de 20, y que sin dato dé exactamente el número de hoy.

### H15 · Sin salida a ISOGEN/PCF, y el motivo declarado es discutible — **BAJA**

- **AutoCAD:** exporta PCF, que es lo que consume ISOGEN y media docena de herramientas
  de taller.
- **Valle hoy:** no existe. `PIDISO` lleva el alias `ISOGEN` (`command-manifest.ts:233`),
  que es más de lo que entrega. La rúbrica declara el motivo: formato «propietario, sin
  especificación pública ni oráculo con el que comprobar una salida».
- **Mi opinión de oficio, dicha con cuidado:** el motivo del oráculo es sólido —sin
  ISOGEN delante no se puede verificar una salida—, pero llamar al PCF «sin
  especificación pública» me parece más fuerte de lo que el propio repositorio puede
  sostener: es un formato de texto plano documentado en manuales de proveedor y escrito
  por varias herramientas de terceros. Lo digo como discrepancia, no como hecho
  comprobado en este árbol: no lo he verificado aquí y no traigo el documento.
- **Esfuerzo:** semanas, y **no lo pondría antes que nada de lo anterior**. Con el
  isométrico propio ya entregando, esto es interoperabilidad, no capacidad. Lo que sí
  haría hoy, en horas: quitar el alias `ISOGEN` de `PIDISO` o dejar que responda «PIDISO
  dibuja el isométrico propio; la salida en formato ISOGEN todavía no existe». Un alias
  que responde con otra cosa es exactamente lo que la casa llama un claim sin evidencia.

---

## 4. Defectos de código encontrados

### D1 · El atributo `TAG` de los equipos P&ID nunca se dibuja, y un `as unknown` lo tapa

`apps/web/src/lib/cad/plant/pid-symbols.ts:190-193`

```ts
    attributes: { TAG: { prompt: "Etiqueta del equipo", default: "" } },
  } as unknown as CadBlockDefinition;
```

Dos defectos en dos líneas:

1. La clave correcta del esquema es `defaultValue`, no `default`
   (`cad-document.ts:452-461`). El `as unknown as CadBlockDefinition` es precisamente lo
   que impide que el compilador lo cace.
2. Falta `position` (y `height`). `cadResolvePositionedAttributes`
   (`blocks/positioned-attributes.ts:108-110`) **filtra** los atributos sin posición, así
   que `cadInsertBlockCommands` (`blocks/block-workflow.ts:379-393`) no emite
   `positionedAttributes` y el `P-101` no se pinta en ningún sitio.

**Escenario:** `PIDEQUIP B` → bomba con `attributes.TAG = "P-101"` en el documento →
`PIDEQUIPLIST` la lista → la lámina impresa muestra una bomba sin nombre.
**Arreglo:** `defaultValue: ""`, `position: { x: 0, y: -700, z: 0 }`, `height: 200`, y
quitar el `as unknown`.

### D2 · `context.metadata` no viaja al DXF y la pérdida no está en el manifiesto

`apps/web/src/lib/cad/dxf-export.ts` (XDATA sólo en :769, :805, :845) y
`apps/web/src/lib/cad/dxf-export-loss-manifest.ts` (sin entrada para metadatos).

**Escenario:** exporto un P&ID con tres líneas y un plano eléctrico con seis circuitos;
el DXF que sale no lleva ni un número de línea ni una protección, y el producto no me
avisa. La cabecera del propio manifiesto llama a esto «un fallo del producto».
**Arreglo:** ver H2. La mitad barata —la entrada del manifiesto— cabe en un día y
convierte una pérdida silenciosa en una declarada.

### D3 · El isométrico y su propia lista de materiales no cuentan las mismas tes

`apps/web/src/lib/cad/plant/isometric.ts:138` deduce los accesorios sobre las rutas que
recibe:

```ts
const fittings = cadPipeFittings(routes).filter((fitting) => fitting.line === line);
```

y `plant-iso.ts:113` le pasa **sólo** las rutas de esa línea (`routes: mias`). En cambio
`pipe-mto.ts:101` los deduce sobre **todas** las rutas del dibujo, y su propia cabecera
explica por qué es lo correcto: «una te que une el ramal 4" con el cabezal 6" existe por
las dos, y calcularla sólo con las rutas de una las perdería justo donde importa».

**Escenario:** ramal `4"-P-1002` que muere sobre el cabezal `6"-P-1001`. `PIDISO
6"-P-1001-CS150` **cuenta** la te en el cuadro de materiales (porque `header.line` es la
1001) y **no la dibuja** sobre el isométrico. El dibujo y su cuadro se contradicen, que
es justo lo que `CadIsoDrawing.fittings` promete evitar («para que la lista y el dibujo
digan lo mismo», `isometric.ts:120`).
**Arreglo:** pasar a `cadIsoDrawing` un campo `allRoutes` y deducir sobre él, filtrando
después por línea — exactamente el patrón de `pipe-mto.ts`.

### D4 · Dos conducciones que se tocan en un punto quedan exentas de choque en TODA su longitud

`apps/web/src/lib/cad/plant/clash.ts:558-580` (`seEmpalman`) y `:710`
(`if (seEmpalman(a, b)) continue;`).

`seEmpalman` devuelve `true` si **cualquier** punta de una cae a menos de
`CAD_PL_JOIN_TOLERANCE` (1 unidad) de **cualquier** tramo de la otra, y el bucle
descarta el par entero.

**Escenario real y frecuente:** el agua fría y el agua caliente salen del mismo punto del
calentador —o dos ramales nacen del mismo cabezal— y después corren 20 m por el plafón.
Si más adelante se cruzan o se pegan por debajo de la holgura, **el informe no dice
nada**, porque el par se descartó en el primer punto. Es un falso negativo en el análisis
que más se usa.
**Arreglo:** no exentar el par, exentar la **vecindad del empalme**: al comparar dos
tramos, saltar sólo si el punto donde ocurre el mínimo está a menos de, digamos,
`2 × (ra + rb)` del punto de empalme. La información ya está: `distanciaSegmentoSegmento`
devuelve el punto.

### D5 · El análisis de choques es O(N²) sobre TODAS las conducciones y se dispara en cada trazo

`apps/web/src/lib/cad/plant/clash.ts:611` construye `todas` (rutas de proceso + corridas
MEP) y `:701-703` recorre **todos los pares** aunque `options.routeIds` filtre a una sola
ruta:

```ts
for (let i = 0; i < todas.length; i += 1)
  for (let j = i + 1; j < todas.length; j += 1) {
    …
    if (options.routeIds && !options.routeIds.includes(a.entityId) && !options.routeIds.includes(b.entityId)) continue;
```

El `continue` está **dentro** del par, no fuera del bucle. Y esto se llama al cerrar cada
corrida: `mep-tracing.ts:185` (`choquesDe`, en `PIPE`, `DUCT` y `CABLETRAY`),
`plant-route.ts:297` y `plant-route.ts:456`. Además `cadPipeClashObstacles`
(`clash.ts:439-489`) evalúa `solid3dBody(entity)` para **cada** `solid3d` del documento
en **cada** llamada, sin caché y sin índice espacial.

**Escenario:** un plano de instalaciones de un edificio con 1.500 corridas MEP de 5
tramos. Cada vez que el dibujante termina un tramo de tubería, el producto recorre
~1,1 M de pares × 25 comparaciones segmento-segmento, más el montaje de todos los
sólidos. La orden se cuelga en el peor momento posible: al cerrar. No encontré ningún
presupuesto de rendimiento que cubra esto (`grep` de `cadPipeClashReport` fuera de
`plant/`: sólo las tres llamadas de órdenes).
**Arreglo (dos, independientes):** (a) cuando hay `routeIds`, iterar el bucle exterior
**sólo** sobre las rutas filtradas y el interior sobre `todas`; (b) rejilla uniforme o
AABB por ruta y por obstáculo antes de medir, con el tamaño de celda derivado de la
holgura. Y un caso de `native-render-budget`-style para 1.000 corridas.

### D6 · `PIDISO` encuadra por identidad laxa y cuesta por igualdad estricta

`apps/web/src/lib/cad/engine/commands/plant-iso.ts:95` selecciona las rutas con
`upperTidy(route.line) === upperTidy(line)` y `:122` pide la lista de materiales con
`{ line: mias[0].line }`, que `pipe-mto.ts:80` compara con `===` sin normalizar.

**Escenario:** un DXF de un socio trae `pl:linea` como `6"-p-1001-cs150` en un tramo y
`6"-P-1001-CS150` en otro (`cadPipeRoutesOf` guarda la cadena **cruda**,
`pipe-route.ts:110-124`: sólo hace `trim`). El isométrico dibuja los dos tramos y el
cuadro de materiales cuesta uno. Media requisición, sin aviso.
**Arreglo:** normalizar `line` en `cadPipeRoutesOf` con el mismo `tidy` de
`line-numbers.ts:79`, o comparar siempre con `upperTidy` en `pipe-mto.ts`.

### D7 · Una conducción sin diámetro desaparece del pase ruta-contra-ruta sin declararse

`apps/web/src/lib/cad/plant/clash.ts:707-709`:

```ts
const ra = radioDe(a, unit);
const rb = radioDe(b, unit);
if (ra === null || rb === null) continue;
```

En el pase contra obstáculos, una ruta sin diámetro **sí** se añade a `sinDiametro` con
su motivo (`:625-635`), fiel al principio del módulo: «una holgura que no se pudo
calcular no es una holgura que sobre» (`mep-runs.ts:33-36`). En el pase ruta-contra-ruta
se descarta en silencio.

**Escenario:** trazo una tubería nueva junto a una `LINE` que alguien dibujó a mano en
`IH-AF` sin diámetro. El aviso de cierre dice que no hay choques, y nadie dice que esa
corrida no se pudo medir contra la mía.
**Arreglo:** empujar a `sinDiametro` cuando el par se descarta por falta de radio, con el
`entityId` de la que falla.

---

## 5. La apuesta ganadora

**La especificación de tubería y el catálogo de instalaciones como dato VIVO y COMPARTIDO
de la organización, servido desde la nube, que rige el diámetro exterior, el espesor, el
aislamiento y la holgura de todos los dibujos abiertos — y que, cuando cambia, dice
inmediatamente qué planos se quedaron fuera de especificación.**

Por qué ésta y no otra:

1. **Es el hueco que el propio proyecto ya identificó como el que retiene los puntos**
   (H8), y es la pieza de la que cuelgan otras cuatro: sin ella no hay diámetro exterior
   (D del choque), ni espesor, ni aislamiento (H14), ni peso, ni clave de compra en el
   MTO, ni sólido con la medida real.

2. **Es exactamente lo que AutoCAD no puede hacer, por arquitectura y no por dejadez.**
   En Plant 3D la spec es un fichero `.pspx` que alguien edita en el Spec Editor, guarda
   en una carpeta de red y distribuye a mano. Yo he vivido esto: la ingeniería cambia la
   clase de la `CS150`, manda un correo, y tres proyectistas siguen ruteando con la spec
   del mes pasado durante dos semanas. AutoCAD **no tiene forma de saberlo**: sus dibujos
   son ficheros locales y su spec es otro fichero local. Un CAD de navegador tiene los
   dos lados en el mismo sitio: sabe qué documentos existen, sabe cuál usa qué spec, y
   puede recalcular.

3. **Este árbol ya tiene todo lo que hace falta para construirlo, menos el catálogo.**
   La consulta tiene un solo punto de entrada natural (`radioDe` en `clash.ts:541`,
   `cadPipeSolidRadius` en `pipe-solid.ts:150`, `cadPipeMto` en `pipe-mto.ts`); el
   análisis que responde «¿esto se puede construir?» ya está escrito y es exacto; el
   metrado ya sale de la geometría; y hay organizaciones, membresías y almacenamiento de
   objetos en el propio repositorio, con la API NestJS delante. La diferencia entre lo
   que hay y la apuesta es un tipo, un lector y un informe — no un motor nuevo.

4. **Y respeta la regla de la casa que hoy bloquea el avance.** No se transcribe el
   catálogo de nadie: el catálogo lo escribe **la organización que lo usa**, que es quien
   tiene el derecho y quien tiene la razón. El producto aporta el sitio donde vive, la
   propagación y la pregunta que nadie puede contestar hoy.

Cómo se ve en mi lunes: la ingeniería sube la revisión B de la `CS150` un martes. El
miércoles abro mi plano y el renglón de `PIDMTO` me dice: *«3 tramos de esta línea usan
un espesor que la CS150 rev. B ya no admite; la holgura del choque contra la trabe pasó
de 62 mm a 18 mm»*. Eso no lo hace AutoCAD, y no es que no quiera: es que no puede.

---

## 6. Cómo yo ordenaría el trabajo

Si mandara aquí, y sin relajar ningún gate:

| Orden | Qué | Por qué primero | Coste |
| --- | --- | --- | --- |
| 1 | H1 · rótulos de línea y etiqueta dibujada (+ D1) | Sin esto no hay lámina que entregar | 1 día |
| 2 | H2, mitad barata · declarar la pérdida de metadatos en el manifiesto DXF | Convierte un fallo silencioso en un límite declarado, hoy | 1 día |
| 3 | D3, D4, D5, D6, D7 | Cinco defectos reales en módulos que ya son evidencia de la rúbrica | 2 días |
| 4 | H3 · pendiente | Desbloquea el sanitario y el pluvial, que es medio proyecto de casa | 1 día |
| 5 | H5 · una línea con dos tramos | Quita una contradicción del propio árbol y arregla iso y MTO | 1 día |
| 6 | H2, mitad cara · XDATA propia en el DXF | Sin ella la planta no sale del navegador | varios días |
| 7 | H8 + H14 · la spec del proyecto y el aislamiento | La apuesta ganadora | semanas |
| 8 | H4, H6, H7, H9, H12 | Volumen, gestor de datos, catálogo, canto, atributos | semanas |

Lo que **no** movería: nada de lo que ya está verde. El análisis de choques, el metrado
3D, el isométrico y la revisión NOM son buen trabajo y no hay que tocarlos más allá de
los cinco defectos de arriba.

---

## 7. Nota sobre la rúbrica

No propongo mover ninguna puntuación —evaluar es otra pasada—, pero dejo dicho lo que
encontré, por si sirve a quien evalúe:

- El `gap` de `toolset-mep` y de `toolset-plant3d` describe con precisión lo que hay y
  declara honestamente el catálogo, el canto del ducto y el diámetro exterior. **No
  menciona** que el número de línea y la etiqueta del equipo no se dibujan (H1/D1), ni
  que los metadatos no sobreviven al DXF (H2/D2). Las dos cosas son de la clase que esta
  casa quiere ver declarada: no impiden que las órdenes funcionen, impiden que el
  resultado se entregue.
- El alias `ISOGEN` en `PIDISO` y el alias `PLANTDATAMANAGER` en `PIDLIST`
  (`command-manifest.ts:233` y `:235`) prometen dos nombres cuyo significado en AutoCAD
  el producto no entrega. No es un fallo de motor; es un claim en el vocabulario.
