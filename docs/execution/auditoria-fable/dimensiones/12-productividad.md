# Auditoría 12 — Automatización y productividad del despacho

**Quién firma:** arquitecto con veinte años de oficio, suscripción completa de
AutoCAD, la usa entera todos los días. Abrió Valle Design con la intención
honesta de cambiarse y está juzgando si podría hacer el trabajo del lunes aquí.

**Fecha:** 2026-09-05
**Dimensión:** AutoLISP, scripts, macros de acción, campos, atributos y
extracción de datos, bloques dinámicos, bloques anotativos, tablas vinculadas,
estándares CAD, purgar y auditar, plantillas.
**Método:** lectura del árbol real (`Grep`/`Glob`/`Read`), rúbrica
`docs/competitive/rubric.json`, `docs/parity/ESCALERA.md`,
`docs/execution/BACKLOG.md`, `AGENTS.md`. Ninguna afirmación de este informe se
escribió sin abrir antes el fichero que la sostiene. Cero cambios en código de
producto.

**Nota:** 4,5 / 10 contra AutoCAD completo en esta dimensión.

**Veredicto de una frase:** el motor de automatización está construido con una
seriedad que no he visto en ningún competidor de AutoCAD —intérprete AutoLISP de
verdad, ejecutor de guiones que falla cerrado, grabador que escribe `.scr`
legible—, pero **nada de lo que un despacho configura se comparte entre las
personas del despacho**, y la rutina típica que traigo de casa no corre porque
AutoLISP aquí no ve los atributos de un bloque.

---

## 0. El resumen que le daría a mi socio en el pasillo

> «El LISP es real. Cargué un `.lsp` y corrió. Pero mi biblioteca de veinte años
> no arranca: mis rutinas leen los atributos de los bloques del cajetín y de los
> muebles, y aquí `(entget)` sobre un `INSERT` no devuelve ni un atributo.
> Y aunque arrancaran, mis rutinas quedarían guardadas en MI navegador: el
> delineante no las tendría. Eso no es un despacho, son cinco personas con cinco
> AutoCAD distintos.»

Todo lo demás del informe es el detalle de esas dos frases y de lo que sí gana.

---

## 1. Lo que ya está construido y funciona (lo digo primero, porque es mucho)

Vine a buscar huecos y me encontré con que la mitad de lo que iba a reclamar ya
está. Lo enumero con el sitio en el árbol para que nadie tenga que fiarse de mí.

### 1.1 AutoLISP es un intérprete de verdad, y está enchufado

- `apps/web/src/lib/lisp/` — lector, evaluador, entorno, errores, presupuesto,
  DCL, puente VLA. **258 funciones catalogadas** con su estado publicado en
  `docs/api/autolisp-cobertura.json`: 188 implementadas, 40 con límite escrito y
  30 declaradas «todavía no». No es un catálogo de marketing: lo genera un
  script desde el código y `cobertura.spec.ts` lo compara.
- Está **enchufado** al editor: `apps/web/src/components/cad/lisp/` monta la
  consola, `APPLOAD` (y sus alias `AP`, `VLIDE`, `LSP`) la abre
  (`lisp-commands.ts:381-392`), la biblioteca se autocarga en cada invocación
  (`lisp-runtime.ts:312-327`) y los `c:` se teclean como si fueran nativos con
  un registro compuesto que **nunca deja que una rutina pise un comando del
  producto** (`lisp-registry.ts:1-30`).
- El golden `apps/web/e2e/golden/47-cad-lisp-appload.spec.ts` recorre el gesto
  entero contra NestJS y PostgreSQL y afirma sobre el **documento persistido**,
  no sobre la pantalla. Eso es exactamente lo que yo habría pedido.
- Vienen **cuatro rutinas de fábrica** (`lib/lisp/factory/`: cuadro de áreas,
  tabla de carpintería, recuento de bloques, numeración de ejes) escritas en
  LISP idiomático con `ssget`/`entget`/`assoc`/`subst` —el patrón con el que
  está escrita media biblioteca de despacho— **a propósito, como plantilla de
  migración**. Es la decisión de producto más inteligente de todo el subsistema.
- El sandbox no es decorativo: `sandbox-surface.spec.ts` lee el código fuente de
  `lib/lisp/` y falla si aparece red, DOM o almacenamiento. Por eso el adaptador
  de `localStorage` vive fuera, en `components/cad/lisp/library-storage.ts`.
  Esa disciplina es la razón por la que me creería que la rutina de un
  proveedor no llega a ningún sitio.

**Esto solo ya vale más que lo que ofrece cualquier CAD de navegador que haya
probado.** Ninguno tiene AutoLISP.

### 1.2 Los guiones, y una decisión mejor que la de AutoCAD

- `SCRIPT` y `RSCRIPT` existen (`engine/commands/automation-script.ts`) y están
  servidos: `components/cad/command-line/session-catalogs.ts:220` abre el
  selector de `.scr` y lo mete por `runCadScript`.
- Y hay un **segundo ejecutor, sin interfaz**, en
  `apps/web/src/lib/cad/engine/script-runner.ts` (364 líneas) que **falla
  cerrado**: se para en el primer renglón que el motor rechaza y dice en cuál.
  AutoCAD no hace eso — sigue empujando renglones y la entrada del comando
  siguiente se cuela en el anterior. Su comentario de cabecera lo explica mejor
  de lo que yo lo diría (`script-runner.ts:6-19`). **Esto es superior a
  AutoCAD.** (Con una pega grande: ver §3.11.)
- Un solo analizador (`parseCadScript`) para los dos ejecutores, y una spec que
  corre el mismo guión por los dos caminos y compara el documento resultante.

### 1.3 El grabador de acciones, que graba un `.scr` y no un formato opaco

`ACTRECORD` / `ACTSTOP` / `ACTMANAGER`
(`engine/commands/automation-actions.ts`, motor en
`lib/cad/automation/action-recorder.ts`, anfitrión en
`command-line/use-command-engine.ts:557-628`, golden 97).

Cuatro decisiones que están bien tomadas y las firmo:

1. Los puntos se graban **tecleados** (`1000,2000`), no como clics.
2. Una orden **cancelada no se graba** — nadie quiere repetir un intento fallido.
3. `ACTRECORD`/`ACTSTOP` no se graban a sí mismos.
4. El resultado es un `.scr` **legible y editable**, no un `.actm` binario.

La cuarta es mejor que AutoCAD: yo puedo abrir el macro, corregirle una
coordenada y volver a lanzarlo con `SCRIPT`.

### 1.4 Purgar y auditar — mejor que AutoCAD

`PURGE` (`engine/commands/groups.ts:209-280`) y `AUDIT`
(`engine/commands/manage-audit.ts`, informe en `lib/cad/audit/report.ts`)
**cuentan, muestran, PREGUNTAN y sólo entonces tocan**, con la opción por
defecto en «No». El `AUDIT` de AutoCAD arregla y te enteras después. Aquí no.
Golden `61-cad-audit-repair.spec.ts`. También hay `RECOVER` y `OVERKILL`.

### 1.5 QSELECT filtra por bloque y por valor de atributo

`engine/commands/select-query.ts` + `lib/cad/selection/selection-filter.ts`. Las
propiedades filtrables salen de `properties.read` del registro de adaptadores,
no de una lista escrita a mano. Y el adaptador de `INSERT`
(`block-text-adapters.ts:461-467`) publica `block`, `attributeCount` y
**`attribute:<TAG>` por cada atributo**.

Es decir: **puedo pedir «todas las inserciones del bloque LUM-01 cuyo atributo
CIRCUITO sea C-3»**. El QSELECT de AutoCAD no filtra por valor de atributo; hay
que irse a `FILTER` o a una rutina. **Esto es mejor que AutoCAD** y es de las
cosas que más me sorprendieron. `FILTER` además guarda la consulta con nombre y
comparte motor con `QSELECT`, así que no pueden divergir.

### 1.6 Bloques: el ciclo completo, incluida la sincronización

`BLOCK`, `INSERT`, `WBLOCK`, `BASE`, `ATTDEF`, `ATTEDIT`, `BURST`, `XPLODE`,
`NCOPY`, `ADCENTER` (DesignCenter), y sobre todo:

- **`ATTSYNC`** (`lib/cad/blocks/attribute-sync.ts`, golden 90): redefino el
  cajetín y las cuarenta láminas que ya estaban se ponen al día — conserva lo
  escrito, añade lo nuevo, retira la huérfana, fija el constante y recalcula la
  geometría desde la definición. Es la orden que más falta hace en la vida real
  y está bien hecha, con las cuatro reglas escritas en el encabezado.
- **`BEDIT`/`REFEDIT`/`REFSET`/`REFCLOSE`** (`blocks/reference-edit.ts`): edición
  en sitio conservando los atributos, que es lo que explotar perdía.
- **Bloques dinámicos**: `BLOQUEDIN`, `BLOQUEDINSET`, `BLOQUEDINDEF`
  (`lib/cad/dynamic-blocks.ts` + `blocks/user-dynamic-family.ts`, golden 96).
  La materialización en bloque anónimo con nombre determinista
  (`valle:din:puerta-abatible:apertura=90:claro=900:...`) es exactamente lo que
  hace AutoCAD por dentro y está razonada.
- **Anotativos**: `lib/cad/layout/annotative-scale.ts` con
  `CANNOSCALE`. La marca de nivel declara 3 mm de papel y se sella al `INSERT`.

### 1.7 Campos, extracción, normas, plantillas y entrega

- `FIELD` / `UPDATEFIELD` (`engine/commands/drawing-fields.ts` +
  `lib/cad/fields/drawing-fields.ts`, golden 98). El campo **nace con su valor
  puesto** para que el plano se pueda imprimir tal cual, y lo que no se puede
  resolver **conserva su último valor y se cuenta** en vez de vaciarse a cero.
  Ese detalle —«un cero silencioso en una tabla de superficies es un error que
  se imprime»— es de alguien que ha entregado planos.
- `DATAEXTRACTION` (`engine/commands/data-extraction-commands.ts`): cinco cuadros
  del modelo (muros, superficies, carpintería, instalaciones, circuitos) a tabla
  en la lámina o a CSV, con el matiz de sub-facturación del volumen de muro
  viajando **dentro** de la tabla y del CSV
  (`CAD_DATA_EXTRACTION_VOLUME_CAVEAT`, ver BACKLOG P1-7). Goldens 61, 77, 81.
- `CHECKSTANDARDS` / `LAYTRANS` (`lib/cad/standards/`), goldens 88 y 99.
- **149 plantillas** de arranque con documento completo, capas, estilos, escala
  y cajetín (`lib/cad/templates.ts`, `starter-templates.ts`, evidencia en
  `docs/cad/evidence/template-gallery.json`).
- `SHEETSET`, `PUBLISH`, `ETRANSMIT`, `REVISA` (`delivery-review.ts`) y campos
  de conjunto `%<SheetNumber>%` (`lib/cad/sheet-set/sheet-set-fields.ts`) que
  se resuelven al publicar, con el conjunto **guardado en el servidor**
  (`/v1/cad/sheet-sets`).
- Paletas de herramientas (`lib/cad/tool-palettes.ts`, `-TOOLPALETTES`),
  estados de capa (`LAYERSTATE`), seis Express Tools (`BREAKLINE`, `FLATTEN`,
  `LAYDEL`, `TCOUNT`, `TXT2MTXT`, `BURST`).
- **294 comandos** en el registro, **100 % alcanzables con el ratón** por la
  cinta (`docs/cad/evidence/ui-command-reach.json`, verificado por
  `scripts/cad/check-ribbon-coverage.mjs`) y **129/129 alias de `acad.pgp`**
  resolviendo (comprobado: `BE→BEDIT` en `alias-table.ts:201` con `BEDIT` en
  `blocks-edit.ts:148`, y `BLE→BLEND` en `alias-table.ts:156` con `BLEND` en
  `modify-blend.ts:266`).

---

## 2. El juicio

**¿Compite esta dimensión con AutoCAD completo? Todavía no. 4,5 / 10.**

El desglose honesto, porque la nota media esconde una varianza enorme:

| Sub-dimensión | Nota | Por qué |
|---|---|---|
| Intérprete AutoLISP como lenguaje | 7/10 | 188 funciones reales, sandbox, autocarga, consola. Le faltan atributos, tablas de símbolos, XDATA, E/S. |
| Portar MI biblioteca de despacho | **3/10** | Sin atributos ni `tblnext "BLOCK"` ni XDATA ni `PAUSE`, la mayoría de mis rutinas no arrancan. |
| Guiones `.scr` | 7/10 | Mejor semántica que AutoCAD. Sin lote sobre varios dibujos. |
| Macros de acción | 4/10 | Formato mejor que AutoCAD, pero mueren con la sesión y no pausan. |
| Campos | 3/10 | Cuatro clases, sólo texto entero, se pierden al exportar. |
| Atributos y extracción de datos | **2/10** | No hay asistente de extracción, ni `ATTEXT`, ni `ATTOUT`/`ATTIN`, ni `GATTE`, ni `BATTMAN`. |
| Bloques dinámicos | 3/10 | Sin grip, sin visibilidad, sin consulta; en los del usuario sólo estirar. |
| Tablas vinculadas | **1/10** | Sin fórmulas, sin `DATALINK`, sin `TABLEEXPORT`. |
| Normas CAD | 3/10 | Norma cableada en el programa; el despacho no puede declarar la suya. |
| Purgar / auditar | **8/10** | Mejor que AutoCAD. |
| Plantillas | 4/10 | 149 de fábrica, cero del usuario. |
| **Que el despacho no repita trabajo** | **2/10** | Nada de la configuración se comparte entre personas. |

Los dos números en negrita de arriba y de abajo son la historia entera: la
ingeniería es de primera, el **efecto de despacho** todavía no existe.

Y una cosa que hay que decirle a favor: **la honestidad de este repositorio en
esta dimensión es ejemplar**. `docs/parity/ESCALERA.md:445-452` declara la
familia de automatización «en 4 de 36» y pone un cero explícito a la pausa de
usuario y a persistir los macros. `lib/lisp/builtins/unavailable.ts` reúne toda
la frontera del lenguaje en una pantalla, con el motivo, y el motivo que se lee
en la matriz publicada **es la misma cadena** que lanza el intérprete. No he
encontrado ni una promesa inflada. Lo que hay, hay; lo que no, lo dice.

---

## 3. Los huecos, por lo que más duele

### 3.1 [BLOQUEANTE] Nada de lo que configura el despacho se comparte: todo vive en el navegador de cada quien

**AutoCAD:** un despacho pone su carpeta de red en la ruta de soporte. Ahí van
`*.lsp`, `acaddoc.lsp`, `*.dwt`, `*.dws`, `*.ctb`, `*.cuix`, las paletas de
herramientas y el `acad.pgp`. El delineante que entra el lunes teclea `NUMEJES`
y funciona porque el CAD lee de la misma carpeta que el mío.

**Valle hoy:** miré uno por uno. **Todo lo de despacho es `localStorage`.**

- Biblioteca `.lsp`: `components/cad/lisp/library-storage.ts` — clave
  `valle.cad.lisp.v1:<tenantId>`, tope 1,5 MB. Su propio encabezado (líneas
  15-35) lo dice sin maquillaje: *«Es persistencia de verdad… y es persistencia
  LOCAL: quien abra el mismo dibujo en otro ordenador no las tiene»*, y explica
  que el endpoint `/v1/cad/lisp/*` no se hizo porque el contrato estaba
  asignado a otra sesión.
- Paletas de herramientas: `lib/cad/tool-palettes.ts:58-64`, clave
  `valle_cad_toolpalettes:<tenant>:<user>`.
- Preferencias del espacio de trabajo y atajos: `lib/cad/cad-workspace.ts`, leído
  desde `Layout3DEditor.tsx:2072`.
- Historial de la línea de comandos: `Layout3DEditor.tsx:1756-1813`.

Y el contrato lo confirma por ausencia: en
`packages/contracts/specs/design-api.v1.yaml` el **único** almacén compartido por
organización que existe es `/v1/cad/blocks`. No hay endpoint de rutinas, ni de
plantillas, ni de normas, ni de paletas, ni de macros, ni de alias.

**Por qué duele:** somos seis. Escribo `NUMEJES.LSP` y lo pruebo. Para que lo
tenga el delineante tengo que mandarle el fichero por correo y decirle que haga
`APPLOAD`. Cada vez que lo cambie. Es exactamente el problema que un CAD en la
nube tendría que haber resuelto por construcción, y hoy está **peor** que
AutoCAD, que al menos tiene una carpeta de red.

**Coste:** semanas.
**Cómo se construye:** ver §5, «la apuesta ganadora». En corto: un recurso
`/v1/cad/office-standard` versionado por organización, con
`ApiLispLibraryStore` implementando el mismo puerto `LispLibraryStore` que ya
existe —el encabezado de `library-storage.ts:36-40` ya lo dejó preparado: *«El
día que exista el endpoint, se escribe un `ApiLispLibraryStore` con las mismas
dos funciones y nada de lo que está encima se entera»*.
**Cómo se verifica:** golden con dos sesiones de distinto usuario de la misma
organización: A sube la rutina, B recarga y teclea su `c:` sin haber tocado
nada; se afirma sobre el documento que recibe el servidor.

---

### 3.2 [BLOQUEANTE] AutoLISP no ve los atributos de un bloque: mi biblioteca no arranca

**AutoCAD:** `(entget insert)` trae `(66 . 1)`, y `(entnext)` recorre los
`ATTRIB` con su `(2 . "TAG")` y su `(1 . "valor")`. Sobre eso está escrita la
mitad de la biblioteca de cualquier despacho: leer el cajetín, sacar el cuadro
de luminarias, renumerar equipos, exportar la carpintería a Excel.

**Valle hoy:** el traductor `CadEntity → códigos DXF` que es *«la superficie por
la que TODA rutina ve el dibujo»* (su propio encabezado,
`lib/lisp/dxf/from-entity.ts:1-8`) emite para un `insert`, en las líneas
237-247, exactamente esto: `2` (nombre de bloque), `10`, `41/42/43`, `50`. **Ni
un `66`, ni un `ATTRIB`, ni un `attributes`.** Grep confirmado: no aparece la
palabra `ATTRIB` ni `attributes` en todo `lib/lisp/dxf/`.

La ironía: el adaptador de entidades **sí** publica `attribute:<TAG>`
(`block-text-adapters.ts:465`) y `QSELECT` filtra por él. El dato está; el
puente LISP no lo cruza.

**Por qué duele:** mi rutina `CUENTA-LUM.LSP` recorre la selección, lee el
atributo `CIRCUITO` de cada luminaria y escribe el cuadro de cargas. Aquí
devuelve nil y escribe una tabla vacía. No falla: escribe basura plausible, que
es la peor de las tres maneras de fallar que el propio `unavailable.ts:1-22`
enumera. Fíjense en que la rutina de fábrica `cuenta-bloques.lsp` cuenta por
**nombre de bloque** y no toca atributos: la biblioteca de fábrica está escrita
esquivando este hueco.

**Coste:** varios días.
**Cómo se construye:** en `from-entity.ts`, caso `insert`, emitir `(66 . 1)`
cuando haya atributos y registrar los `ATTRIB` como entidades hijas alcanzables
por `entnext` (el cursor de `entnext` ya existe,
`builtins/entities.ts:160-170`); usar `CadPositionedAttribute`
(`cad-entities-v4.ts:241-263`), que ya lleva `insertion`, `height`, `rotation`,
`style` e `invisible` resueltos en coordenadas de mundo. En `to-entity.ts`,
aceptar `entmod` sobre un `ATTRIB` para escribir el valor, encauzándolo por la
misma orden canónica que usa `ATTEDIT`.
**Cómo se verifica:** spec que hace `(entget (entnext insert))` sobre un bloque
con tres atributos y comprueba tag y valor; golden que carga una rutina de
recuento por atributo y afirma la tabla sobre el documento persistido.

---

### 3.3 [ALTA] `tblnext "BLOCK"` no existe: no se puede inventariar el dibujo desde una rutina

**AutoCAD:** `(tblnext "BLOCK")`, `"STYLE"`, `"DIMSTYLE"`, `"LTYPE"`, `"UCS"`,
`"VIEW"`, `"APPID"`. Es el gesto de la primera pantalla de media biblioteca:
comprobar qué hay antes de crear.

**Valle hoy:** `lib/lisp/builtins/tables.ts:41-50` —`requireLayerTable`— rechaza
todo lo que no sea `LAYER`, por su nombre y con el motivo. Está **bien
declarado** (es lo correcto frente a inventarse la tabla), pero el hueco es
real.

Y le acompaña otro: **no hay XDATA ni diccionarios**. Grep sobre `lib/lisp/`:
cero apariciones de `1001`, `xdata`, `regapp`, `namedobjdict`, `dictsearch`,
`dictadd`. Una rutina que guarda datos del proyecto en el dibujo —lo que hace
cualquier herramienta de despacho seria— no tiene dónde ponerlos.

**Por qué duele:** mi rutina de norma recorre las 40 capas y los 22 bloques del
plano que me manda el estructurista y dice cuáles no son míos. Aquí puedo hacer
la mitad: las capas sí, los bloques no.

**Coste:** varios días (tablas), un día más (XDATA sobre el bolsillo
`context.metadata` que ya existe).
**Cómo se construye:** ampliar `requireLayerTable` a un mapa de proyectores
—`BLOCK` desde `document.blocks`, `STYLE` desde `document.styles.text`,
`DIMSTYLE` desde `styles.dimension`, `LTYPE` desde la tabla de tipos de línea—,
cada uno con su serializador a códigos DXF junto a `dxf/layer-record.ts`.
Para XDATA, exponer `context.metadata` como `(-3 ("VALLE" (1000 . "…")))` en
`entget` con el segundo argumento de aplicaciones, y aceptarlo en `entmod`.
**Cómo se verifica:** spec que recorre `(tblnext "BLOCK" T)` sobre un documento
con tres bloques y compara nombres y `basePoint`; spec de ida y vuelta de XDATA.

---

### 3.4 [ALTA] No hay extracción de datos de verdad: `DATAEXTRACTION` es cinco cuadros cableados

**AutoCAD:** `DATAEXTRACTION` es un asistente: elijo qué objetos, elijo qué
propiedades **incluidos los atributos de bloque**, filtro, agrupo, cuento,
ordeno, y saco a tabla en la lámina o a `.xls`/`.csv`. Y **guarda la
configuración en un `.dxe`** que vuelvo a lanzar el mes que viene sobre el plano
actualizado. `ATTEXT`/`EATTEXT` hacen la variante de atributos; `BCOUNT` cuenta
bloques.

**Valle hoy:** `engine/commands/data-extraction-commands.ts` ofrece exactamente
seis palabras clave —Tabla, Superficies, carPintería, Instalaciones,
circUitos, CSV— y cada una llama a un constructor **cableado en el programa**
(`buildCadBimSchedule`, `buildCadMepSchedule`, `cadCheckCircuits`,
`data-extraction/*.ts`). No hay forma de pedir «cuenta los bloques `MOB-*` y
sácame su atributo `CLAVE`».

**Por qué duele:** el lunes tengo que entregar el cuadro de mobiliario del
proyecto: 340 bloques, ocho tipos, cada uno con su clave de catálogo en un
atributo. En AutoCAD son cuatro minutos y un `.dxe` que reutilizo. Aquí no hay
camino: ni por comando, ni por LISP (§3.2), ni por API.

**Coste:** varios días.
**Cómo se construye:** un `lib/cad/data-extraction/query.ts` con un descriptor
serializable `{ tipos[], capas[], propiedades[], agruparPor[], contar, orden }`
que reutilice **el mismo motor de filtro que ya tiene `QSELECT`**
(`selection/selection-filter.ts`, que ya lee `attribute:<TAG>` — el trabajo duro
está hecho). `DATAEXTRACTION` gana una opción `Consulta` que pide los campos por
la línea; el descriptor se guarda en `document.meta` con un nombre, y una
opción `Repetir <nombre>` lo vuelve a lanzar. Salida a `CadTableEntity` o al
mismo `host-request` `data-extraction-csv` que ya está servido
(`command-line/data-extraction-host.ts`).
**Cómo se verifica:** spec en Node comparando la cadena CSV, como ya hace
`data-extraction-commands.spec.ts`; golden que extrae por atributo y afirma la
tabla sobre el documento persistido.

---

### 3.5 [ALTA] Las tablas no calculan, no se vinculan y no se exportan

**AutoCAD:** una celda lleva fórmula (`=SUM(B2:B12)`), una tabla se **vincula a
un rango de Excel** con `DATALINK` y se actualiza con `DATALINKUPDATE`, y
`TABLEEXPORT` la saca a `.csv`. El presupuesto vive en la hoja del despacho y la
lámina lo refleja.

**Valle hoy:** `CadTableEntity` (`lib/cad/cad-entities-v4.ts:225-238`) es una
rejilla de celdas de **texto plano**: `{ row, column, text, rowSpan,
columnSpan, alignment, textHeight, textStyle }`. No hay tipo de celda, no hay
fórmula, no hay origen de datos. Grep confirmado: `DATALINK`, `DATALINKUPDATE`
y `TABLEEXPORT` no existen en todo `apps/web/src`. Y la propia rúbrica lo
declara en la fila `annotation-extras`: *«Falta que el estilo de TABLA gobierne
bordes/filas al render»*.

Nótese además que la rutina de fábrica `cuenta-bloques.lsp` **no crea una
tabla**: escribe columnas de `MTEXT` sueltos, porque `ENTMAKE_SUPPORTED`
(`lib/lisp/dxf/to-entity.ts:41-51`) no incluye `TABLE`. Ni siquiera desde LISP
se puede fabricar una tabla.

**Por qué duele:** el total del cuadro de superficies lo tecleo a mano. Se
mueve un muro, actualizo el cuadro, y el total sigue diciendo lo de ayer.

**Coste:** varios días (fórmulas) + varios días (vínculo).
**Cómo se construye:** añadir `kind?: "text" | "formula"` y `formula?: string` a
`CadTableCell` (campo opcional, no rompe el formato persistido), un evaluador
puro `lib/cad/tables/formula.ts` con `SUM/AVG/COUNT/MAX/MIN` y referencias
`A1:B7`, resuelto en el mismo momento que `UPDATEFIELD` resuelve los campos.
`TABLEEXPORT` reutiliza `buildCadDataExtractionCsv` y el host-request que ya
existe. El vínculo a hoja de cálculo entra por importación de `.csv` pegado a la
tabla con su huella, no por COM.
**Cómo se verifica:** spec del evaluador con referencia circular rechazada por
su nombre; golden que suma una columna y afirma el total sobre el documento
guardado.

---

### 3.6 [ALTA] La norma CAD está cableada al estándar mexicano y a la escala 1:50

**AutoCAD:** `STANDARDS` asocia uno o varios `.dws` al dibujo,
`CHECKSTANDARDS` compara y **corrige de uno en uno**, el comprobador por lotes
revisa una carpeta entera y `LAYTRANS` traduce capas con su mapa guardado.

**Valle hoy:** `CHECKSTANDARDS` compara contra `CAD_MEXICAN_LAYERS` y
`cadMexicanTextStyles`, es decir, **contra una norma escrita en el programa**
(`lib/cad/standards/office-standard.ts`, `mexican-layers.ts`). No hay `.dws`,
no hay forma de que el despacho declare su tabla de capas ni la del cliente. La
propia orden sólo informa; corregir no está (dicho en su cabecera,
`manage-standards.ts:1-9`).

Y hay un defecto duro dentro: `manage-standards.ts:33` fija
`const scaleDenominator = 50;`. La orden **no pregunta la escala ni la lee de la
lámina**. Ver §4.1.

**Por qué duele:** mi cliente institucional exige su propia nomenclatura de
capas. Aquí no la puedo declarar, así que `CHECKSTANDARDS` me dice que mis capas
—correctas para el contrato— se desvían de una norma que no es la del encargo.

**Coste:** varios días.
**Cómo se construye:** extraer el estándar a un dato:
`interface CadOfficeStandard { capas: CadLayerDef[]; estilosTexto; estiloCota;
escalas: number[] }`, con la norma mexicana como **una instancia más** en vez
de como el código. `STANDARDS` asocia una al documento (en `document.meta`), y
`CHECKSTANDARDS` toma la escala de la presentación activa o la pregunta.
La corrección en sitio reutiliza el diálogo de confirmación de `PURGE`/`AUDIT`,
que ya está probado.
**Cómo se verifica:** spec con dos estándares distintos sobre el mismo documento
dando desviaciones distintas; spec que falla hoy: un documento correcto a 1:100
que `CHECKSTANDARDS` reporta como desviado.

---

### 3.7 [ALTA] Los campos: cuatro clases, sólo el texto entero, dos motores que no se conocen y se pierden al exportar

**AutoCAD:** un campo va **dentro** de cualquier texto: `"Superficie: %<Area>%
m²"` en un MTEXT, en un atributo, en una celda de tabla, en el sufijo de una
cota. Hay decenas de clases: propiedad de objeto, nombre de archivo, número de
lámina, autor, fecha de trazado, marcador, fórmula. `FIELDEVAL` decide cuándo se
refrescan, y **se refrescan al trazar**.

**Valle hoy, tres cosas medidas:**

1. **Sólo cuatro clases**: área, longitud, fecha, variable de sistema
   (`fields/drawing-fields.ts:43`). Está declarado en la cabecera del comando.
2. **Sólo el texto entero.** La expresión se reconoce con
   `/^%<...>%$/u` **anclada** (`fields/drawing-fields.ts:39`) y `FIELD` inserta
   un MTEXT nuevo cuyo `text` **es** el valor
   (`engine/commands/drawing-fields.ts:163-180`). No puedo escribir
   `"ÁREA: %<Area:e12>% m²"`: o el texto es el campo, o no hay campo. Y no hay
   campo posible dentro de un atributo, de una celda ni de una cota.
3. **Hay dos motores de campo que no se conocen.**
   `lib/cad/sheet-set/sheet-set-fields.ts` usa la MISMA sintaxis
   `%<Nombre>%` con una regex **global y no anclada** (línea 23) y resuelve
   `SheetNumber`, `SheetTitle`, `SheetRevision`… **al publicar**. Los dos
   vocabularios son disjuntos y ninguno ve al otro: `UPDATEFIELD` no toca un
   `%<SheetNumber>%`, y publicar no resuelve un `%<Area:e12>%`. Es la misma idea
   implementada dos veces con dos reglas distintas — justo lo que la regla 4 de
   la casa prohíbe («ninguna cifra vive en dos lugares»), aplicado a un
   mecanismo.
4. **El campo se pierde al exportar a DXF.** La expresión vive en
   `context.metadata.campo`, y `dxf-cad-document.ts:552-554` dice con todas las
   letras que *«`context` no viaja»*; sólo se asciende a campo del modelo de
   exportación lo que alguien subió a mano (la marca anotativa y la tolerancia).
   El manifiesto de pérdidas (`dxf-export-loss-manifest.ts`) **no tiene código
   para esto**: ver §4.3.

**Por qué duele:** el cuadro de superficies con «24,50 m²» donde el número es
campo y el «m²» es texto no se puede hacer. Y el plano que mando al
estructurista y me devuelve trae los campos convertidos en texto muerto sin que
nadie me haya avisado.

**Coste:** varios días.
**Cómo se construye:** unificar los dos motores en
`lib/cad/fields/` con un **resolvedor por sustitución** (regex global) y un
registro de proveedores de valor: uno de dibujo (área, longitud, fecha, sysvar,
propiedad de objeto) y otro de conjunto (`SheetNumber`…). `UPDATEFIELD` recorre
`text` de mtext, `text` de text, `value` de atributo posicionado y `text` de
celda. Al exportar, ascender `context.metadata.campo` a XDATA por el mismo
camino que ya usa `annotativeHeightMm`, y si se decide no transportarlo, emitir
su entrada en el manifiesto de pérdidas.
**Cómo se verifica:** golden que coloca `"ÁREA: %<Area:e12>% m²"`, mueve el
muro, ejecuta `UPDATEFIELD` y afirma la cadena completa sobre el documento
persistido; spec de ida y vuelta DXF del campo, o su entrada en el manifiesto.

---

### 3.8 [ALTA] Los macros mueren con la pestaña, no pausan y se repiten encima de sí mismos

**AutoCAD:** un macro grabado es un `.actm` que **queda guardado**, aparece en el
gestor de acciones de todas las sesiones, admite `ACTUSERINPUT` para pedir un
dato a mitad y `ACTBASEPOINT` para que la repetición no caiga en el mismo sitio.

**Valle hoy:** tres cosas, todas ya declaradas honestamente en
`ESCALERA.md:449-452`:

1. **Sesión.** `use-command-engine.ts:590-592` lo dice en un comentario: *«Los
   macros viven en la sesión; el archivo, no»*. `ACTMANAGER` responde «Macros de
   esta sesión». Cierro la pestaña y no está.
2. **Sin pausa.** `ACTUSERINPUT` no existe (grep: cero apariciones).
3. **Se repite en coordenadas absolutas.** El grabador convierte el punto
   señalado en su coordenada (`action-recorder.ts:79-87`), lo cual hace el macro
   portable **entre dibujos** y a la vez inútil **dentro del mismo**: el propio
   golden 97 afirma que tras repetir *«hay dos muros… los dos de 0 a 4.000»*.
   Dos muros superpuestos.

**Por qué duele:** grabé la secuencia de rotular un local (texto + área +
marco). Para el segundo local necesito que me pregunte dónde. No puede. Y si lo
lanzo, me pone el segundo rótulo encima del primero.

**Coste:** un día (persistir) + varios días (pausa y punto base).
**Cómo se construye:** persistir es reusar `LispLibraryStore` — la misma forma
`{id, name, source, version, fingerprint, updatedAt, updatedBy}` sirve para un
`.scr`; el mismo `ApiLispLibraryStore` de §3.1 los comparte. La pausa es un
token nuevo del `.scr` (`\` es el de AutoCAD) que `parseCadScript` reconoce y
que el ejecutor traduce a «devuelve el control al usuario y reanuda» — el motor
ya es una máquina de estados que se alimenta de tokens, así que la suspensión ya
existe conceptualmente (es lo que hace `ssget` sin modo,
`builtins/selection.ts:174`).
**Cómo se verifica:** golden que graba con una pausa, cierra y reabre la
sesión, repite el macro respondiendo un punto distinto y afirma **dos muros en
sitios distintos** sobre el documento persistido.

---

### 3.9 [MEDIA] Bloques dinámicos: sin grip, sin visibilidad, sin consulta, y en los del usuario sólo estirar

**AutoCAD:** parámetros lineal, polar, rotación, simetría, alineación,
visibilidad, consulta y punto; acciones de estirar, mover, girar, reflejar,
escalar, matriz; tabla de consulta que elige el juego de valores por una clave;
y todo se maneja **arrastrando un tirador azul**.

**Valle hoy:** dos familias de fábrica cableadas (`dynamic-blocks.ts`) y, para
los bloques del usuario, `blocks/user-dynamic-family.ts`, cuyo propio encabezado
(líneas 31-37) declara: *«Sólo parámetros LINEALES con acción de estirar»*.
Girar y reflejar se rechazan por su nombre con el motivo — bien hecho.
Sin estados de visibilidad, sin tabla de consulta, y sin grip
(`ESCALERA.md:435`: *«Falta el GRIP… porque el puntero no está enrutado al
motor»*).

Añado un hallazgo que no está declarado: **la declaración del parámetro no viaja
al DXF**. Ver §4.4.

**Por qué duele:** el bloque dinámico que más uso es la puerta con estados de
visibilidad (abatible / corrediza / doble). Aquí serían tres bloques.

**Coste:** semanas para el conjunto; **el grip solo, varios días**, y es el que
cambia la sensación del producto.
**Cómo se construye:** para el grip, el enrutado del puntero al motor es la
pieza que falta; una vez ahí, un tirador es un punto derivado de la línea de
parámetro (`cadIsParameterCarrier`, `user-dynamic-family.ts:88`) y arrastrarlo
es el mismo `BLOQUEDINSET` que ya funciona, alimentado con la distancia
proyectada. Los estados de visibilidad son un parámetro `kind: "visibility"` con
una lista de nombres y, por cada entidad de la definición, la lista de estados
en los que se dibuja — materializado en el mismo bloque anónimo determinista que
ya existe.
**Cómo se verifica:** golden que arrastra el tirador y afirma el nuevo claro
sobre el documento persistido, no sobre la pantalla.

---

### 3.10 [MEDIA] No puedo guardar mi plano como plantilla del despacho

**AutoCAD:** `SAVEAS` a `.dwt`, `QNEW` arranca desde ahí. La plantilla del
despacho es el activo número uno de una oficina: capas, estilos, cajetín,
presentaciones, escalas.

**Valle hoy:** 149 plantillas, todas **escritas en el programa**
(`lib/cad/templates.ts` es una unión de literales de tipo;
`starter-templates.ts` construye el `CadDocument`). Grep confirmado: no existe
`.dwt`, ni «guardar como plantilla», ni ninguna plantilla de usuario en todo
`apps/web/src` ni en `apps/api/src`.

**Por qué duele:** mi plantilla lleva quince años afinándose. Aquí empiezo desde
la que trae el producto y le hago las mismas veinte correcciones en cada
proyecto nuevo.

**Coste:** un día si se apoya en §3.1, varios días si no.
**Cómo se construye:** una plantilla es un `CadDocument` sin entidades de
proyecto; el tipo de dato ya lo es. `SAVEAS Plantilla` guarda el documento
actual como recurso de plantilla de la organización (mismo endpoint de §3.1) y
el diálogo de nuevo documento lista «Plantillas del despacho» encima de las de
fábrica.
**Cómo se verifica:** golden con dos usuarios: A guarda plantilla, B crea
documento desde ella y el documento que llega al servidor trae las capas de A.

---

### 3.11 [MEDIA] El ejecutor de guiones sin interfaz no lo importa nadie: no hay lote

**AutoCAD:** ScriptPro / `PUBLISH` por lotes / `-PLOT` en script: aplico el mismo
guión a las 20 hojas del proyecto.

**Valle hoy:** el ejecutor sin interfaz existe y es bueno
(`lib/cad/engine/script-runner.ts`), pero **grep sobre todo el repositorio**
(`executeCadScript`, `cadCommandsNeedingInterface`) devuelve exactamente dos
consumidores: el propio módulo y `script-runner.spec.ts`. **Ningún camino de
producto lo alcanza.** Por la regla 1 de la casa —«un subsistema sin importador
fuera de sí mismo no está implementado»— la capacidad «ejecutar un guión sin
interfaz gráfica» está probada por una spec y no entregada.

Conviene decirlo con precisión, porque la fila `command-line.scripting` de la
rúbrica **no está inflada**: `SCRIPT` sí funciona por el camino vivo. Lo que no
existe es el uso que justifica un ejecutor sin interfaz: **el lote**.

**Por qué duele:** «pon la revisión C en las 20 láminas y vuelve a publicar» es
media mañana de clics.

**Coste:** varios días.
**Cómo se construye:** un comando `SCRIPTLOTE` (o una opción de `SHEETSET`) que
tome el conjunto de hojas ya guardado en el servidor, cargue cada documento por
el puerto de repositorios y llame a `executeCadScript` con su documento,
acumulando un informe por hoja: renglones ejecutados, error y renglón,
peticiones de anfitrión sin servir. El guardado sale por la CAS de siempre, una
hoja por transacción, y una hoja que falla **no** bloquea las demás pero sale en
el informe.
**Cómo se verifica:** spec en Node sobre tres documentos con un guión que falla
en el segundo: el primero y el tercero quedan escritos, el segundo intacto, y el
informe nombra el renglón.

---

### 3.12 [MEDIA] No hay edición masiva de atributos, ni `ATTOUT`/`ATTIN`, ni `BATTMAN`

**AutoCAD:** `GATTE` cambia un valor de atributo en todas las inserciones de un
bloque; `-ATTEDIT` con comodines hace lo mismo por la línea; `BATTMAN` gestiona
el orden y las propiedades; `ATTOUT`/`ATTIN` sacan los atributos a un `.txt`
tabulado, lo edito en Excel y lo vuelvo a meter; `ATTEXT` y `ATTDISP` completan
la familia.

**Valle hoy:** `ATTEDIT` edita **una** inserción
(`engine/commands/blocks.ts:449-500`, y por eso está exento en
`scripts/cad/command-integrity-exemptions.json`: *«pide atributos de una
inserción concreta»*). `CHPROP` (`modify-foreign.ts:474-520`) sólo toca color,
capa, tipo de línea, escala y grosor — **no atributos**. Grep confirmado:
`ATTOUT`, `ATTIN`, `GATTE`, `BATTMAN`, `ATTDISP`, `ATTEXT`, `BCOUNT`, `MINSERT`
no existen. `ESCALERA.md:359` ya declara la ausencia de `BATTMAN`.

**Por qué duele:** cambio la revisión en 40 cajetines a mano, uno por uno.

**Coste:** un día (`GATTE` sobre lo que ya hay) + un día (`ATTOUT`/`ATTIN`).
**Cómo se construye:** `GATTE` es casi gratis: el filtro por
`attribute:<TAG>` ya existe en `selection-filter.ts` y el escritor
`properties.write` del adaptador de `INSERT`
(`block-text-adapters.ts:468-476`) ya sabe escribir `attribute:<TAG>`. Falta el
comando que junte las dos cosas en un lote. `ATTOUT`/`ATTIN` reutilizan el
host-request `data-extraction-csv` que ya está servido y la validación de
`ATTSYNC` para el camino de vuelta.
**Cómo se verifica:** golden que cambia `REVISION` en las tres inserciones de un
cajetín en **un paso de deshacer** y lo afirma sobre el documento guardado.

---

### 3.13 [MEDIA] El SDK de plugins JS y el DCL están construidos y no se pueden usar

Dos piezas de la fila `plugins` de la rúbrica existen como biblioteca y **no
tienen camino de usuario**:

- **Plugins JS** (`lib/lisp/plugins/api.ts`, 628 líneas, con manifiesto,
  permisos, ciclo de vida y presupuesto compartido). Grep de
  `plugins/api`, `CadPluginRegistry`, `registerPlugin` fuera de
  `lib/lisp/plugins/`: **sólo** `lib/lisp/index.ts` (que reexporta),
  `builtins/interaction.ts` (que usa el tipo del permiso) y su propia spec.
  Nadie en `components/` crea un registro de plugins. **Un usuario no puede
  instalar un plugin.**
- **DCL**: el parser existe (`lib/lisp/dcl/parser.ts`) y las funciones
  `load_dialog`/`new_dialog`/`start_dialog` están instaladas
  (`builtins/dialogs.ts`), pero
  `components/cad/lisp/lisp-commands.ts:235-243` **contesta a todo diálogo que
  se canceló**, con un aviso en la consola: *«El diálogo DCL «X» todavía no se
  pinta en el editor»*. Además `load_dialog` recibe **el texto** del DCL, no una
  ruta (`dialogs.ts:88-93`), así que ninguna rutina portada que haga
  `(load_dialog "MIDIALOGO.DCL")` funciona sin reescribirla.

Está dicho en el código y no oculto, y la decisión de contestar «cancelado» en
vez de abortar es defendible. Pero la fila `plugins.dcl` de la rúbrica se cobra
con la existencia del parser, y el gesto —abrir mi diálogo— no ocurre.

**Coste:** varios días (pintar el DCL sobre los primitivos de `components/ui`) +
varios días (paleta de plugins con manifiesto y permisos).
**Cómo se verifica:** golden que carga una rutina con DCL, rellena el diálogo y
afirma la geometría resultante sobre el documento persistido.

---

### 3.14 [BAJA] Los alias no se pueden personalizar, y los atajos sólo doce

**AutoCAD:** edito `acad.pgp` y `MM` es `MOVE`. `CUI` reasigna cualquier tecla y
la carpeta de red reparte el `.cuix` a todo el despacho.

**Valle hoy:** `alias-table.ts` es un `Readonly<Record<string,string>>` en el
programa, con los 129 de `acad.pgp` (excelente cobertura). La personalización
que hay son **doce** identificadores fijos en
`components/cad/palettes/CadWorkspaceDock.tsx:25-38`, con detección de colisión
contra `acad.pgp` (bien pensado). No se puede añadir un alias propio.

**Coste:** horas.
**Cómo se construye:** un mapa de overrides por organización, resuelto **después**
de la tabla canónica y **antes** de fallar, con rechazo de cualquier nombre que
ya ocupe un comando nativo —la misma regla y el mismo mensaje que ya usa
`lisp-registry.ts` para las colisiones de `c:`—. Viaja por §3.1.
**Cómo se verifica:** spec que resuelve `MM → MOVE` con override y rechaza
`L → MOVE` por robar un alias de `acad.pgp`.

---

### 3.15 [BAJA] Express Tools: seis de un centenar, y faltan las de oficina

Están `BREAKLINE`, `FLATTEN`, `LAYDEL`, `TCOUNT`, `TXT2MTXT`, `BURST` (más
`OVERKILL` y `NCOPY`, que en AutoCAD 2027 ya son núcleo). Faltan las que un
despacho teclea a diario: `MOCORO`, `COPYM`, `EXTRIM`, `MPEDIT`, `TEXTMASK`,
`TEXTFIT`, `ARCTEXT`, `SUPERHATCH`, `ALIASEDIT` y las de atributos de §3.12.

**Coste:** horas cada una; es contenido sobre motor existente, no motor nuevo.
**Cómo se verifica:** el patrón ya está: cada una con su spec de familia y su
negativa bien redactada, como hacen las tres de `express-tools.ts`.

---

## 4. Defectos concretos encontrados leyendo el código

### 4.1 `CHECKSTANDARDS` revisa siempre contra la escala 1:50, la tenga el plano o no

`apps/web/src/lib/cad/engine/commands/manage-standards.ts:33`

```ts
const scaleDenominator = 50;
```

La orden tiene `selection: "none"` y su `begin` resuelve de inmediato: **no
pregunta la escala y no la lee de la presentación**. Aguas abajo,
`checkTextStyles` y `checkDimensionStyle`
(`standards/office-standard.ts:88-148`) comparan la altura de cada estilo contra
`cadMexicanTextStyles(scaleDenominator, …)`, que **depende de la escala**.

**Escenario de fallo:** abro un plano de conjunto rotulado correctamente a
1:100. `CHECKSTANDARDS` reporta `text_style_mismatch` en cada estilo de texto y
`missing_dimension_style` para el estilo de cota de 1:100, porque busca el de
1:50. El dibujante «corrige» según lo que dice la orden y deja el plano mal
rotulado. La orden es de las que se usan para **confiar**, y aquí miente en
cuanto la lámina no es 1:50.

**Arreglo:** tomar el denominador de la presentación activa
(`viewport.annotationScale ?? viewport.scale`) o pedirlo como palabra clave con
1:50 por defecto; propagar la escala usada al mensaje, que ya la imprime.

---

### 4.2 La fecha de los campos y de los informes es UTC: en México se estampa el día siguiente desde las 18:00

Seis sitios, todos con la misma forma:

- `engine/commands/drawing-fields.ts:150` (`FIELD`)
- `engine/commands/drawing-fields.ts:249` (`UPDATEFIELD`)
- `engine/commands/delivery-review.ts:95` (`REVISA`)
- `engine/commands/etransmit-commands.ts:76` y `:140` (`ETRANSMIT`)
- `lib/cad/automation/action-recorder.ts:156` (cabecera del `.scr`)

```ts
date: new Date().toISOString().slice(0, 10),
```

`toISOString()` es **UTC**. La CDMX está en UTC−6.

**Escenario de fallo:** el 5 de septiembre a las 19:00 en Ciudad de México
coloco un `FIELD Fecha` en el cajetín. El plano se imprime con **2026-09-06**.
Lo mismo el informe de `REVISA` y el manifiesto de `ETRANSMIT`, que son las
piezas con las que se documenta una entrega y a las que alguien puede acabar
mirando la fecha en una discusión contractual.

Es especialmente irónico porque `fields/drawing-fields.ts:81` inyecta la fecha
precisamente para no depender del reloj —*«se inyecta: `new Date()` haría los
planos irreproducibles»*— y los cinco llamadores de producto le pasan
`new Date()` en UTC.

**Arreglo:** una sola función `cadFechaLocalISO(date = new Date())` que use
`toLocaleDateString("en-CA")` con la zona del documento o del navegador, y que
los seis sitios la llamen. Un solo sitio, como manda la casa.

---

### 4.3 El manifiesto de pérdidas de DXF calla lo que más duele perder

`apps/web/src/lib/cad/dxf-export-loss-manifest.ts` tiene códigos para tabla
degradada, estilo de punto global, imagen sin definición, entidad descartada,
muro paramétrico degradado, Z aplanada, pesos de spline… y **ninguno** para lo
que vive en `context.metadata`, que `dxf-cad-document.ts:552-554` declara que
**no viaja**:

- la expresión de campo (`CAD_FIELD_METADATA = "campo"`),
- la familia y los parámetros de bloque dinámico (`din:familia`, `din:*`),
- la declaración de parámetro de una familia del usuario (`din:param`),
- la asociatividad de `ARRAY`.

**Escenario de fallo:** exporto a DXF para el estructurista. Mis cuadros de
superficie dejan de ser campos y mis bloques dinámicos dejan de ser dinámicos.
El manifiesto que viaja con el archivo —que existe precisamente para que nadie
se lleve una sorpresa, regla 3 de la casa— **no lo menciona**. Es un silencio,
que es justo lo que las reglas de la casa prohíben.

**Arreglo:** dos códigos nuevos, `dxf_export_field_expression_dropped` y
`dxf_export_dynamic_parameters_dropped`, emitidos por entidad al recorrer;
o, mejor, transportar los metadatos por XDATA con el mismo mecanismo que ya
usan `annotativeHeightMm` y la tolerancia de cota.

---

### 4.4 El comentario de `user-dynamic-family.ts` promete un viaje al DXF que la declaración no hace

`apps/web/src/lib/cad/blocks/user-dynamic-family.ts:18-20`

> *«aquí además viaja al DXF como una línea normal en una capa que se puede
> apagar»*

La **línea** viaja, cierto. Pero lo que la convierte en parámetro son las claves
`din:param`, `din:tipo`, `din:def`, `din:min`, `din:max`, `din:pasos`
(líneas 49-60), que viven en `context.metadata` y por §4.3 **no viajan**.
Grep confirmado: ningún camino de exportación DXF escribe `din:`.

**Escenario de fallo:** mando a un colaborador el DXF con mi familia dinámica.
Él la recibe como un bloque estático con una línea de más en la capa
`BLOQUE-PARAM`. Cuando me lo devuelve e importo, mi familia dejó de ser
dinámica. Como el `.dxf` es hoy el formato de intercambio del producto, esto
convierte la funcionalidad en «dinámica sólo mientras no salga de aquí» — y el
comentario del módulo hace pensar lo contrario. `ESCALERA.md:436` repite la
misma frase, así que la afirmación está en dos sitios.

**Arreglo:** o se transporta por XDATA (preferible: el mecanismo ya existe), o
se corrige la frase en los dos sitios y se emite la pérdida en el manifiesto.

---

### 4.5 Una entidad anotativa visible en dos ventanas de distinta escala se dimensiona para una y queda mal en la otra, y el documento se muta

`apps/web/src/lib/cad/layout/annotative-scale.ts:189-199`

```ts
const decided = new Set<string>();
…
      if (decided.has(entity.id)) continue;
      …
      decided.add(entity.id);
```

La regla —«manda la escala de la primera ventana que la muestra en el orden de
la hoja»— está escrita y es determinista, que es más de lo que hacen muchos. El
problema es lo que se hace después: se emite un `command` que **reescribe la
altura de la entidad en el modelo**.

**Escenario de fallo:** el rótulo «COCINA» se ve en la ventana general a 1:100 y
en la ventana de detalle a 1:20 de la misma lámina. La primera decide, así que
el rótulo mide 250 unidades. En el detalle sale cinco veces más grande de lo que
debería y no hay forma de arreglarlo sin sacar el rótulo de una de las dos
vistas. En AutoCAD ese mismo objeto lleva **una lista de escalas de anotación**
con una representación por escala, y sale bien en las dos.

No es un error de cálculo: es que el modelo de datos guarda **una** altura donde
AutoCAD guarda **una por escala**, y el efecto se paga mutando el documento.
Merece al menos figurar como límite declarado —el módulo declara con cuidado el
caso de `skippedEntityIds`, pero no éste.

**Arreglo (fuera de una campaña pequeña):** `annotativeHeightMm` pasa de número
a mapa `{ escala: altura }`, resuelto en el render por ventana en vez de
escribirse en la entidad. Mientras tanto: contar y avisar cuando una entidad
anotativa sea visible en dos ventanas de escala distinta.

---

### 4.6 La biblioteca `.lsp` pierde escrituras entre pestañas

`apps/web/src/components/cad/lisp/library-storage.ts:92-97` y `:104-118`

```ts
read(tenantId) { const cached = this.cache.get(tenantId); if (cached) return cached; … }
write(tenantId, files) { … this.cache.set(tenantId, next); this.storage.setItem(key, payload); }
```

La caché en memoria es autoritativa una vez poblada y **no hay ningún oyente del
evento `storage`** (grep confirmado en el módulo).

**Escenario de fallo:** tengo el estudio abierto en dos pestañas, que es lo
normal cuando comparo dos planos. En la pestaña A subo `NUMEJES.LSP`. En la
pestaña B —cuya caché se pobló antes— subo `CAJETIN.LSP`: `write` serializa la
lista **de B**, que no contiene `NUMEJES.LSP`, y lo pisa. `NUMEJES.LSP` sigue
funcionando en A hasta que recargue, y entonces desaparece sin ningún mensaje.

El repositorio ya sabe que esto pasa: `lib/cad/cad-recovery.ts:28` razona
explícitamente sobre «todas las pestañas» al elegir `localStorage`.

**Arreglo:** oír `window.addEventListener("storage", …)` e invalidar la caché de
ese inquilino; y en `write`, releer y fundir por `id` con la regla de mayor
`version`, que el registro ya lleva. Desaparece solo el día que la biblioteca
viva en el servidor (§3.1).

---

### 4.7 Ternario muerto en el formateador de puntos del grabador

`apps/web/src/lib/cad/automation/action-recorder.ts:81-84`

```ts
const redondo = (valor: number) => {
  const fijo = Math.round(valor * 1_000) / 1_000;
  return Number.isInteger(fijo) ? String(fijo) : String(fijo);
};
```

Las dos ramas son idénticas. No produce un fallo —`String(fijo)` es lo que se
quiere en ambos casos— pero es una condición que alguien escribió para hacer
algo (probablemente, forzar `1000` en vez de `1000.0`, que `String` ya hace) y
que hoy sólo confunde a quien la lee. Se colapsa a `String(fijo)`.

---

### 4.8 El texto `gap` de la fila `command-line` de la rúbrica está caducado

`docs/competitive/rubric.json`, fila `command-line`:

> *«Quedan exactamente 2 de 129 alias de acad.pgp sin resolver: BE→BEDIT y
> BLE→BLEND»*

Comprobado en el árbol: `BE: "BEDIT"` (`alias-table.ts:201`) resuelve a `BEDIT`
(`commands/blocks-edit.ts:148`, en el manifiesto en
`command-manifest.ts:83`), y `BLE: "BLEND"` (`alias-table.ts:156`) resuelve a
`BLEND` (`commands/modify-blend.ts:266`, manifiesto línea 179). **Los 129
resuelven.** Y el propio `scripts/cad/rubric.mjs` puntúa hoy
`command-line.alias-complete`, así que la prosa contradice a la cifra que el
script computa.

Por la regla 4 de la casa —«ninguna cifra vive en dos lugares… una cifra escrita
a mano en un doc es un defecto aunque hoy coincida»— un `gap` caducado es
deuda: es el texto que lee quien planifica la próxima ola y le manda a arreglar
algo que ya está.

---

## 5. La apuesta ganadora

> **El «Estándar del Despacho» como objeto del servidor, versionado, compartido
> por la organización y aplicable por lotes.**

Un solo recurso, `/v1/cad/office-standard`, que guarde en el servidor lo que hoy
está disperso en el `localStorage` de cada persona y en constantes del programa:

- la **tabla de capas** del despacho (y las de sus clientes, como variantes),
- los **estilos** de texto, cota y multidirectriz por escala,
- las **plantillas** del despacho (§3.10),
- la **biblioteca `.lsp`** (§3.1) y los **macros** grabados (§3.8),
- las **paletas de herramientas** y los **alias** propios (§3.14),
- las **consultas de extracción** guardadas (§3.4).

Y encima, dos verbos que sólo un CAD de servidor puede ofrecer:

1. **`CHECKSTANDARDS` contra el estándar de MI despacho**, no contra uno
   cableado — y con la corrección aplicable.
2. **Aplicarlo por lotes a los 40 planos del proyecto**, en el servidor, con un
   informe auditado por plano. La pieza pesada de esto **ya está construida**:
   `lib/cad/engine/script-runner.ts` ejecuta un guión sin interfaz y falla
   cerrado diciendo el renglón. Lo que falta es el llamador (§3.11) y el
   recurso del estándar.

**Por qué esto gana, y no otra cosa.** AutoCAD tiene la funcionalidad y no tiene
la arquitectura. Su equivalente es una carpeta de red con `.dws`, `.dwt`, `.lsp`
y `.cuix` que **cada puesto tiene que estar configurado para encontrar**, un
`STANDARDS` que se asocia dibujo a dibujo, y un comprobador por lotes que corre
en la máquina de alguien y hay que acordarse de lanzar. Cualquier despacho que
haya pasado de cinco personas conoce el resultado: tres versiones distintas de
la misma rutina, dos plantillas «buenas», y el delineante nuevo dibujando en
capas que nadie reconoce. **Ese desorden no es un defecto de AutoCAD: es
consecuencia inevitable de que la configuración viva en ficheros de escritorio.**

En un CAD de navegador con identidad, organización y CAS —que este producto ya
tiene, y bien: `AGENTS.md` es explícito sobre el aislamiento por
`organization.id`— el estándar no es una carpeta que hay que encontrar: **es un
objeto que el dibujo ya ve**, con versión, con autor, con historial y con la
misma resolución de conflictos que ya protege los documentos. Nadie lo instala.
Nadie se queda con la versión vieja. Y «pon la norma en los 40 planos del
proyecto» pasa de ser media mañana de clics a ser un trabajo con informe.

Es, además, la palanca más barata que existe aquí: los puertos ya están
diseñados para recibirla (`LispLibraryStore` con su comentario de «el día que
exista el endpoint…»), el ejecutor por lotes ya está escrito y probado, el motor
de filtros de `QSELECT` ya lee atributos, y el patrón de recurso por organización
ya funciona en `/v1/cad/blocks` y `/v1/cad/sheet-sets`. No hay que inventar
tecnología: hay que subir al servidor lo que hoy se guarda en el navegador y
darle un comando por encima.

Yo no cambio de CAD por una función. Cambio el día que abrir el producto en la
máquina del delineante nuevo signifique que ya está configurado como el
despacho. Eso AutoCAD no me lo puede dar, y aquí está a semanas de distancia.

---

## 6. Orden en el que yo lo haría

| # | Hueco | Severidad | Coste | Desbloquea |
|---|---|---|---|---|
| 1 | §3.2 Atributos en el puente LISP | bloqueante | varios días | portar la biblioteca del despacho |
| 2 | §3.1 Estándar del despacho en el servidor | bloqueante | semanas | la apuesta ganadora entera |
| 3 | §4.1 Escala cableada en `CHECKSTANDARDS` | alta | horas | que la orden deje de mentir |
| 4 | §4.2 Fecha UTC en campos e informes | alta | horas | fechas correctas en cajetín y entrega |
| 5 | §3.4 Extracción por consulta | alta | varios días | el cuadro de mobiliario del lunes |
| 6 | §3.3 `tblnext "BLOCK"` + XDATA | alta | varios días | rutinas de norma e inventario |
| 7 | §3.7 Un solo motor de campos, embebidos | alta | varios días | «ÁREA: 24,50 m²» |
| 8 | §4.3/§4.4 Pérdidas de DXF declaradas | alta | horas | dejar de callar |
| 9 | §3.8 Macros persistentes y con pausa | media | varios días | macros que sirven |
| 10 | §3.11 Guiones por lotes | media | varios días | el segundo verbo de la apuesta |
| 11 | §3.12 `GATTE` + `ATTOUT`/`ATTIN` | media | un día | 40 cajetines en un paso |
| 12 | §3.5 Fórmulas en tablas | media | varios días | totales que no mienten |
| 13 | §3.6 Estándar declarable | alta | varios días | clientes con su nomenclatura |
| 14 | §3.9 Grip en bloques dinámicos | media | varios días | la sensación de AutoCAD |
| 15 | §3.10 Plantillas del usuario | media | un día | el activo del despacho |

Los cuatro primeros son un mes bien invertido. Con el 1, el 3 y el 4 hechos yo
ya podría probar el producto una semana entera sin sentir que estoy peleando
contra él. Con el 2, me cambiaría.
