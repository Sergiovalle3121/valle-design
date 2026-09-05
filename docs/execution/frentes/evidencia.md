# F11 · Evidencia independiente

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `valle-design-dwg-conformance/** (repo entero)`
- `docs/cad/evidence/**`
- `docs/cad/corpus/** (nuevo)`
- `apps/web/src/lib/cad/verification/** (sólo specs nuevas)`

## Cola

1. Corpus DXF/DWG de terceros con licencia permisiva o dominio público — **criterio ABIERTO de la rúbrica, 2 pt**. La red sólo alcanza `raw.githubusercontent.com`: sirven repositorios de ejemplo con licencia clara. Cada archivo con su procedencia y sus derechos registrados, y la matriz de fidelidad corriendo contra ellos.

2. Oráculos binarios adicionales (dwg2dxf, lectores IFC/STEP de terceros) instalados y cableados a los arneses. Si el entorno no los sostiene, se declara con el intento y el motivo.

3. Por cada fila que retiene 1 punto por «evidencia propia» (29 filas hoy), la spec que compara contra material ajeno, de modo que la rúbrica lo reconozca sola.

## Cierre

Los 5 puntos de evidencia independiente suben; cada archivo del corpus con sus derechos escritos.

## Lo que hay que tener presente

NO tocas código de producto. Un archivo sin licencia clara no entra: el corpus prefiere estar vacío a estar sucio.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/evidencia-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-evidencia` sobre la rama `campana/superar/evidencia`. Commits sí;
  **push a origin no** (el coordinador hace un push por ventana).
- **R6 Las reglas de la casa, intactas.** Prohibido relajar gates, umbrales, goldens o
  presupuestos. Prohibido tocar identificadores persistidos (IDENTITY.md, ADR-0010).
  Prohibido renombrar `data-testid`. Fix-or-hide: lo que no gana su evidencia no es visible.
  Ningún claim sin evidencia; lo parcial se declara «todavía no» en tu bitácora, con fecha.
  Las banderas `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` NO se encienden en esta campaña.
- **R7 Bitácora.** Este archivo es tu memoria. Si tu contexto se compacta, lo relees primero.
  Nunca se pregunta al titular: se decide, se anota y se sigue.

## Cómo se valida antes de dar algo por hecho

```
cd /home/user/vd-evidencia
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### 2026-09-04 · Reconocimiento: dos suposiciones del corte eran falsas

Antes de tocar nada, dos cosas que la bitácora de campaña daba por sabidas y no lo eran.

**La red alcanza más de lo declarado.** El corte dice «sólo `raw.githubusercontent.com`».
Es cierto para GitHub —`api.github.com`, `codeload` y `github.com` devuelven 403, así que
no se puede listar un repositorio, sólo pedir rutas exactas— pero **PyPI, crates.io y el
registro de npm SÍ responden**: `pip3 download ezdxf` bajó 5.8 MB y `cargo search` contestó.
Eso cambia la cola: el oráculo binario de terceros del punto 2 dejó de ser imposible.

**El corpus ajeno existía y no se había buscado.** Dos bibliotecas DXF con licencia MIT
publican dibujos DXF completos como ficheros de prueba: `bjnortier/dxf` y
`gdsestimating/dxf-parser`. La segunda ya era dependencia declarada de `apps/web` y ya se
usaba como oráculo en `verification/dxf-roundtrip.spec.ts`; nadie había mirado que además
traía material.

**Lo que ya estaba construido en el territorio, y que casi se rehace por no mirar:**
`docs/cad/evidence/` tiene 48 artefactos, entre ellos `dxf-external-corpus-matrix.json`,
que YA es una matriz por entidad con el vocabulario de veredictos bien resuelto
(intacto / degradado / perdido declarado / **perdido en silencio**). Lo que le pasa no es
que falte: es que su primera línea dice `"corpusSintetico": true` y lo explica sin
adornos. La matriz nueva no lo sustituye por mejor escrita, lo sustituye por tener detrás
archivos que este proyecto no escribió; y hereda su vocabulario de veredictos, que está
bien pensado. `verification/` ya tenía 13 suites con su regla de oráculo independiente
escrita en el README.

**La mecánica real del tope de independencia** (leída en `scripts/cad/rubric.mjs`, no
supuesta): una fila pierde 1 punto sólo si `earned === points && independentEarned === 0`.
El punto vuelve en cuanto UN criterio ya concedido lleve una evidencia con
`independent: true` **que verifique**. Hoy son 31 filas, no 29. Y `docs/competitive/rubric.json`
es archivo del coordinador (R2): este frente produce la evidencia y escribe el parche
exacto en `evidencia-peticiones.md`, nunca lo aplica.

### 2026-09-04 · Entregable 1: corpus de terceros con derechos (commit `8b58869`)

Diecinueve DXF ajenos, dos fuentes MIT, cinco dialectos (R12, R2004, R2007, R2010, R2013),
diecisiete tipos de entidad, 2.6 MB. Puerta fail-closed con 137 comprobaciones:
biyección árbol ↔ manifiesto, sha256 y tamaño byte a byte, licencia dentro de una lista
permisiva con el aviso de copyright comprobado DENTRO del texto descargado, motivo escrito
por archivo, mínimo cuatro dialectos y mínimo dos fuentes.

Rechazado `Ceco.NET-Architecture-Tm-53.dxf` (536 KB, el más «de despacho» de todos): el
MIT del repositorio que lo aloja no puede conceder derechos sobre el dibujo de un tercero.
Anotado en `EXCLUIDOS.md` con su motivo.

Congelado el veredicto del segundo oráculo, `ezdxf` 1.4.4 (MIT, Python, Manfred Moitzi):
ve HATCH, LEADER y VIEWPORT —que `dxf-parser` no emite— y **rechaza 2 de los 19 archivos**
que el lector de Valle sí abre. No está en CI; su ausencia se declara, no se finge.

De paso, `cad-math-cases.json` volvió a decir la verdad: decía 761 casos en 10 suites,
estado de otra campaña; medido hoy son **1038 en 14**. Eso destapó que
`apps/web/src/lib/marketing/use-cases.ts` tiene el 761 escrito a mano en la superficie
pública — defecto de la regla 4, fuera de territorio, en `P-evidencia-01`.

### 2026-09-04 · Entregable 2: matriz de fidelidad a tres bandas contra el corpus ajeno

`docs/cad/evidence/dxf-corpus-terceros-matrix.json`: **40 filas de 19 archivos ajenos** —29
intactas, 4 degradadas, 7 perdidas declaradas y **0 perdidas en silencio**—, verificada por
`apps/web/src/lib/cad/verification/dxf-fidelidad-terceros.spec.ts` con **80 comprobaciones**. La
spec RECALCULA la matriz entera en memoria y afirma que es idéntica a la comprometida (el
`--check` de los generadores de `scripts/`, sin poder tocar `scripts/`), y fija
`perdidosEnSilencio` en 0 como techo que sólo puede bajar. `check:cad-math` la recoge sola: el
total pasó de 1038 a **1118** casos en 15 suites.

**Las tres bandas, y por qué ninguna sobra.** Se mide lo que declara el oráculo A (`dxf-parser`,
en CI), lo que declara el oráculo B (`ezdxf` 1.4.4, congelado) y lo que el lector de producción
obtuvo. En las 30 filas donde los dos oráculos opinan **coinciden en las 30**: eso convierte «dos
lecturas» en «una medición». Y ninguna banda domina a las otras — abren el corpus: oráculo A
18/19, oráculo B 17/19, lector 18/19.

**El límite del oráculo A, escrito en la propia matriz.** `apps/web/src/lib/cad/dxf-import.ts`
**importa `dxf-parser`**: el oráculo A comparte motor de análisis con el lector. Contra él no se
mide el análisis, se mide la conversión a entidades canónicas. Se ve en un caso real:
`blocks2.dxf` lo rechazan a la vez el oráculo A y el lector, y el oráculo B lo lee entero —y aun
así los 3 MTEXT del archivo llegan, porque el lector tiene un camino de pares crudos que no
depende del motor. La independencia de análisis la aporta sólo el oráculo B, que no corre en CI.

**El punto ciego del oráculo A no se declara: se demuestra.** HATCH, LEADER y VIEWPORT no tienen
manejador en `dxf-parser`; la spec comprueba que en todo archivo donde el oráculo B los ve, el A
emite exactamente cero. La fila que lo paga entera es `floorplan.dxf · HATCH`: el A no opina, el
B cuenta 13 en modelo y 13 en bloques, y el lector devuelve los **26 intactos**.

**Los dos ámbitos de conteo, con su limitación dicha.** El conteo comparable filtra
`primitiveSources === "entity"` y descarta el espacio papel; con ese filtro `floorplan.dxf` cuadra
EXACTO en las tres bandas en LINE 624, TEXT 89, CIRCLE 9, ARC 20, LWPOLYLINE 124 y DIMENSION 63
(fijadas a mano en la spec, precisamente para que el filtro no pueda ser una conveniencia). MTEXT
y HATCH no pueden: el lector los devuelve **sin dueño**, así que su ámbito es el archivo entero.
Es una limitación real del lector y está escrita en el artefacto, no escondida eligiendo el
ámbito que cuadre.

**Corregido un defecto del entregable anterior.** El censo del oráculo B publicaba un único
`archivoEntero` que contaba DOS VECES cada entidad de espacio modelo, porque `doc.blocks` de
ezdxf incluye `*Model_Space` y `*Paper_Space` (`lines.dxf` salía con 22 líneas y tiene 11). La
cifra estaba mal y la matriz se habría construido encima. Regenerado con cuatro ámbitos separados
por `docs/cad/corpus/oraculos/censo-ezdxf.py` —que ahora existe, así que el artefacto deja de ser
huérfano— y la corrección va escrita dentro del propio JSON.

**Lo que la matriz destapó de paso.** `flattened_to_ground` no tiene fila en
`WARNING_RULES` de `dxf-import-report.ts`, así que el informe le enseña al arquitecto «2
entidad(es) con una incidencia todavía sin describir» y la clasifica como `lost` cuando la
geometría SÍ entró. Defecto de superficie de usuario, fuera de territorio: `P-evidencia-06` con
el parche exacto.

### 2026-09-04 · Entregable 3: la jornada completa sobre el plano de otro

`apps/web/src/lib/cad/verification/terceros-jornada.spec.ts` — **3.168 comprobaciones, de ellas
3.065 magnitudes del dibujo comparadas una a una contra un oráculo que no es este producto**. El
plano es `bjnortier-dxf/floorplan.dxf`: 1,1 MB, R2004, 24 capas en tabla, 16 estilos de cota,
1109 entidades. Lo publica una biblioteca MIT y no lo escribió nadie de aquí. Los cinco actos, y
los cinco por el camino de producción:

1. **Abrir** con `importDocumentText` —la misma puerta que usa el estudio al soltar un fichero—:
   1109 entidades, 17 bloques, 63 cotas, 26 sombreados, 144 MTEXT.
2. **Medir** contra `ezdxf` 1.4.4 sobre LOS MISMOS BYTES: 624 longitudes de línea, 9 radios de
   círculo, 20 radios y 20 longitudes de arco, 124 longitudes de polilínea (cuatro con bulge),
   **las 63 medidas de cota** y la extensión del dibujo. Cada magnitud viaja con la CLAVE de su
   geometría, así que la comparación es entidad por entidad y no un total que puede cuadrar por
   compensación. Peor desviación: **por debajo de 1e-12**, con tolerancia declarada de 1e-9 y su
   razón (las dos lecturas parten del mismo ASCII; el resto es el orden de las operaciones).
3. **Modificar** con MOVE, LINE y ERASE conducidos desde `CAD_COMMAND_REGISTRY_V2`: el plano
   entero al origen —el vector lo dicta la extensión que midió ezdxf, no la que medimos nosotros—,
   una línea nueva de 500 en una capa del revisor, y los nueve círculos borrados.
4. **Exportar** con `exportCadDocumentDxf`, el mismo que entrega DXFOUT: 1101 entidades, cero
   pérdidas declaradas.
5. **Releer**. El oráculo A (`dxf-parser`, en CI) abre nuestro fichero y vuelve a encontrar
   **las mismas longitudes del plano ajeno** —625 líneas, 20 radios de arco, 124 polilíneas y las
   63 medidas de cota escritas en el código 42— con tolerancia de 1,5e-6 **por segmento**, que es
   exactamente lo que valen los seis decimales que escribe `fmt()`.

Esto cierra el «todavía no» del entregable anterior: la ida y vuelta contra material ajeno ya
está medida, y con oráculos a los dos lados.

**Lo que la jornada destapó, que es lo más valioso que trae.** `ezdxf` **NO abre lo que
exportamos**: MTEXT y HATCH salen sin sus marcadores de subclase (`100 AcDbEntity`,
`100 AcDbMText` / `100 AcDbHatch`) aunque la cabecera declare AC1015, dialecto donde son
obligatorios; la biblioteca revienta al cargarlos, incluso en modo `recover`. Los otros siete
tipos —LINE, POLYLINE, CIRCLE, ARC, TEXT, DIMENSION, INSERT— sí los abre, con **cero errores de
auditoría**. El oráculo A no lo veía porque es tolerante: hizo falta el segundo. Y el arreglo no
se pide a ciegas — `docs/cad/corpus/oraculos/medidas-floorplan.py` inserta esas parejas sobre el
texto ya exportado y vuelve a leerlo: con 170 entidades parcheadas, ezdxf abre el fichero entero
y audita cero errores. `P-evidencia-07` con el diseño completo.

Dos defectos más, medidos de paso y fuera de territorio: el informe de importación declara
**perdidas 63 cotas que SÍ entraron** (`P-evidencia-08`) y **siete de las 24 capas** de la tabla
LAYER no llegan al documento sin que ningún aviso lo diga (`P-evidencia-09`). La segunda, con el
número exacto que la jornada permitió medir y que corrige a la baja el susto: el fichero que
devolvemos declara **23** capas —el exportador escribe también las que usan las entidades dentro
de los bloques—, así que al remitente le vuelven 22 de sus 24 más la del revisor; las que no
vuelven son `Defpoints` (378 entidades dentro de bloques que no entraron) y `View Port` (sólo
espacio papel). El dibujo no cambia; el silencio sigue siendo el defecto.

**La rúbrica, medida sobre una copia** (el archivo compartido no se tocó): la fila `foreign-work`
pasa de **5/6 a 6/6**, el total de 233/271 (86 %) a **234/271 (86,3 %)**, los puntos con evidencia
independiente de 5 a **7** y las filas con tope de 31 a **30**. El diseño exacto —qué evidencia se
añade a qué criterio y qué frase del `gap` se sustituye— está en `P-evidencia-10`.

**Cifra de `check:cad-math`.** Pasó de 1118 casos en 15 suites a **4286 en 16**. El salto lo
explica una sola suite y conviene decirlo antes de que alguien lo cite: 3.065 de esos casos son
las magnitudes del plano ajeno comparadas una a una contra ezdxf y dxf-parser. Son casos legítimos
—cada uno es una medida del dibujo contra un oráculo externo— pero quien publique la cifra debe
saber de qué está hecha; la propia suite la desglosa en su salida.

### 2026-09-04 · Entregable 4: el censo de las 31 filas con tope, generado y con su parche

`apps/web/src/lib/cad/verification/independencia-rubrica.spec.ts` +
`docs/cad/evidence/independencia-por-fila.json`. La línea final de
`node scripts/cad/rubric.mjs` —«31 fila(s) retienen 1 pt por carecer de evidencia
independiente»— era verdadera y no accionable: no decía cuáles, ni qué criterio de cada una
podría cargar la evidencia, ni qué haría falta para conseguirla. Quien quisiera atacarlas tenía
que abrir un JSON de 3.812 líneas y rehacer a mano la aritmética del tope.

**Las 31 filas no se listan a mano.** El spec importa `scripts/cad/rubric.mjs`, puntúa el árbol
de hoy y saca del resultado qué filas tienen tope, cuánto valen, qué criterios tienen concedidos
y con qué clase de evidencia. Lo único escrito a mano es el DICTAMEN, porque es juicio; y está
atado por los dos lados: una fila con tope sin dictamen falla, y un dictamen de una fila que ya
no tiene tope, también. Es la regla 4 aplicada a un censo: la cifra vive en la rúbrica y aquí se
lee, nunca se copia.

**El reparto, con el vocabulario que exigió la honestidad.** Seis filas se pueden servir HOY
(`draw-2d`, `foreign-work`, `dimensions`, `blocks`, `modeling3d`, `growth`). Cuatro están
**bloqueadas por un defecto que el propio testigo ajeno midió** y son las más valiosas del censo:
en las cuatro hay oráculo externo, corre, y **dice que no**. Quince no las alcanza el material
ajeno del árbol pero tienen camino nombrado y alcanzable. Seis necesitan la tercera pata de la
regla —un usuario real— y decirlo es más honesto que inventarles un fichero.

**Lo que este entregable se negó a hacer, que es la mitad de su valor.** `hatch` y `mtext` no
cobran su punto porque `ezdxf` no abre nuestros MTEXT ni nuestros HATCH (P-evidencia-07);
`layers` no lo cobra porque la tabla de capas se poda en silencio (P-evidencia-09); e `integrity`
—la fila que se llama «el producto hace lo que dice»— tampoco, por lo mismo: la matriz mide 0
pérdidas en silencio POR TIPO DE ENTIDAD, y la jornada encontró una fuera de ese ámbito. Conceder
el tope de esa fila mientras este frente publica una pérdida silenciosa medida habría sido la
contradicción más cara del censo.

**El candado contra la inflación es ejecutable, no una promesa.** El spec tiene una lista CERRADA
de fuentes admitidas como independientes, cada una con su razón, y rechaza cualquier parche que
marque `independent: true` sobre una ruta que no esté en ella. `verification/oracle.ts` está en
la lista de lo que NO lo es, con su razón escrita: verifica de verdad y lo escribimos nosotros.
Probado en negativo: cambiar el parche de `draw-2d` para que apunte al corpus SINTÉTICO pone el
spec en rojo con el mensaje que corresponde.

**El efecto está MEDIDO, no estimado**, y sin tocar el archivo compartido: el spec clona la
rúbrica en memoria, le aplica los seis parches y vuelve a llamar a `scoreRubric()`. Total
233/271 (86 %) → **239/271 (88,2 %)**; alcance de hoy 176/197 → **181/197**; puntos con evidencia
independiente 5 → **17**; filas con tope 31 → **25**. Además comprueba que ninguna OTRA fila se
mueve: el parche es quirúrgico o no es un parche.

**El trinquete.** `TECHO_FILAS_CON_TOPE = 31` sólo puede bajar. Si una fila pierde su evidencia
independiente —se borra el corpus ajeno, se mueve un artefacto— el número sube y el gate se pone
rojo en vez de dejarlo pasar.

**Un hallazgo dentro del archivo compartido.** La única marca `independent: true` del lado DXF de
la rúbrica de hoy está en `dxf.corpus-external` y apunta a `dxf-external-corpus-matrix.json`,
cuyo propio encabezado dice `corpusSintetico: true`. Hoy no infla la cuenta porque ese criterio
no se concede (falta la firma de derechos), pero el día que la firma llegue sin P-evidencia-04
concedería 2 pt de «independencia» a un corpus que generó este proyecto. Queda escrito en el
censo y en P-evidencia-05: **P-evidencia-04 antes que P-evidencia-03**.

**El diseño completo, fila por fila, en `P-evidencia-05`**: los seis bloques JSON exactos con su
criterio, su límite declarado y qué dice el testigo, más las tres tablas de las veinticinco que
hoy no se sirven con lo que a cada una le falta.

**Deuda pagada del entregable anterior: `check:cad` estaba en ROJO.** El presupuesto de monolito
rechazaba `terceros-jornada.spec.ts` —1273 líneas contra un máximo de 800 para un archivo no
presupuestado— desde el commit `eed83fa`, o sea desde este mismo frente. Un gate del núcleo en
rojo revierte el frente entero en la integración, así que se arregló aquí. La jornada se repartió
en cuatro archivos siguiendo la costura que la propia jornada ya tenía: el spec conduce los cuatro
primeros actos (el producto trabajando, 798 líneas), `terceros-jornada-medicion.ts` es el
instrumento de medida —los dos contadores, la comparación por bolsa, las claves geométricas—,
`terceros-jornada-comandos.ts` el conductor del registro de comandos, y
`terceros-jornada-relectura.ts` el quinto acto, donde el producto ya no hace nada y hablan los dos
lectores ajenos. La separación se paga sola: los dos actos del quinto pasan de leer el alcance del
script a declarar sus entradas una a una, así que ya no pueden mirar del plano nada que no se les
haya dado. **Que el reparto no cambió NADA de lo medido está probado, no supuesto**: la suite
sigue diciendo 3168 comprobaciones y 3065 magnitudes, y su `deepStrictEqual` contra
`jornada-plano-ajeno.json` —el artefacto congelado con sus sha256— sigue en verde sin tocar una
cifra. El censo de este entregable también se repartió por lo mismo: el juicio fila por fila vive
en `independencia-dictamen.ts` y el motor en el spec.

**Cifra de `check:cad-math`: sigue en 4286 casos, y a propósito.** Este censo corre en el gate
—vive en `verification/`, así que no se puede olvidar de correrlo— pero **aporta cero** a ese
total y lo dice en su propia salida: sus 247 afirmaciones son estructurales sobre la rúbrica, no
medidas del dibujo contra un oráculo externo. Sumarlas a una cifra que se publica como «casos
numéricos verificados contra oráculo independiente» habría sido el mismo defecto que este frente
existe para cazar. El artefacto pasa de 16 a 17 suites; `totalCases`, que es lo único que la
superficie pública lee, no se mueve.

### 2026-09-05 · Entregable 5: cuatro filas afirmadas sobre el fichero ajeno más pequeño

**Qué se construyó.** Cuatro suites, una por capacidad, cada una sobre el fichero de terceros más
pequeño que la atestigua, más su fontanería común y su artefacto compartido:

- `apps/web/src/lib/cad/verification/terceros-filas.ts` — el anclaje y la publicación. Cada
  fichero se abre exigiendo su `sha256` **en tres artefactos a la vez** (el manifiesto de
  derechos, el censo del oráculo B y las medidas nuevas): son tres cosas escritas en días
  distintos y sólo hablan del mismo fichero si coinciden.
- `terceros-capas.spec.ts` (96 comprobaciones, 34 magnitudes) — `layers.dxf` y la tabla de
  `floorplan.dxf`.
- `terceros-bloques.spec.ts` (122, 59) — `blocks1.dxf`, `blocks2.dxf` y el recuento de ámbito
  de MTEXT del plano ajeno.
- `terceros-texto.spec.ts` (214, 25) — `texts.dxf` y las cadenas con códigos del plano ajeno.
- `terceros-cota-sombreado.spec.ts` (88, 37) — `dimensions.dxf` y `hatches.dxf`.
- `docs/cad/evidence/independencia-terceros.json` — un renglón por fila, que cada suite RECALCULA
  y compara con `deepStrictEqual`. Se escribe sólo a mano, con `VALLE_ESCRIBIR_TERCEROS=1`.
- `docs/cad/corpus/oraculos/medidas-cuatro-filas.py` + `medidas-cuatro-filas-ezdxf.json` — el
  oráculo B por capacidad, hermano del censo y de las medidas del plano.

**Por qué un fichero pequeño por fila, teniendo ya la jornada.** La jornada prueba que el
producto aguanta 1,1 MB. Lo que no prueba es de quién es cada defecto: en 1109 entidades y 24
capas, una capa mal pintada no se ve. `layers.dxf` tiene nueve entidades y tres capas y cabe en
una pantalla; lo que le pase no se puede discutir. Los cuatro defectos de abajo salieron de ahí,
y ninguno lo había visto la jornada.

**Los cuatro hallazgos, medidos.**

1. **El color de capa del remitente se descarta y se sustituye** (P-evidencia-12). `buildLayers`
   reparte una paleta de cinco por POSICIÓN ALFABÉTICA y tira el código 62 —que ya viene leído en
   `colorIndex`—; el exportador escribe `62 7` en todas, así que el dibujo vuelve MONOCROMO. Y el
   informe dice «Entró completo, sin pérdidas». En `layers.dxf` la rotación cae de forma que
   PARECE bien, que es lo peligroso; con las 24 capas de `floorplan.dxf` se ve en las dos
   direcciones: 4 índices ACI que el remitente usó en varias capas salen de colores distintos, y
   los 5 colores de la paleta juntan cada uno capas de índices distintos. El arreglo va probado:
   `aciToHex`/`hexToAci` ya están en el árbol y los doce índices del corpus vuelven idénticos.
2. **El MTEXT de dentro de un bloque sale a espacio modelo** (P-evidencia-11). El escaneo crudo
   de MTEXT no sabe en qué sección está. En `blocks2.dxf` dos rótulos caen 175 mm a la izquierda
   y 25 abajo (la transformación acumulada que les falta); en `dimensions.dxf` el número de cada
   cota queda escrito **dos veces**, uno encima del otro. Nueve entidades donde ezdxf cuenta
   siete. Sin un aviso. **El tamaño lo pone el plano grande**: el remitente puso 9 MTEXT en el
   espacio modelo de `floorplan.dxf` y el lector entrega 144, así que **135 rótulos cambian de
   dueño en silencio**.
3. **`blocks2.dxf` se rechaza entero por `$XCLIPFRAME` = 2** (P-evidencia-13), un valor legítimo
   desde AutoCAD 2010, y con el mensaje «El DXF está corrupto», que **acusa al remitente de algo
   que no hizo**. Normalizando ese único par en una copia en memoria —el árbol no se toca—, el
   fichero entra completo: 6 entidades, 3 bloques, 0 avisos, con el anidado de dos niveles, el
   ARC y la ELLIPSE medidos uno a uno. El lector y el oráculo A caen por el mismo sitio, que es
   la prueba en vivo de que comparten analizador y de por qué hacía falta un segundo oráculo.
4. **Un contorno de HATCH de cuatro aristas RECTAS se descarta por «no poligonal»**
   (P-evidencia-14). La pérdida se DECLARA —eso está bien— pero las cuatro `LINE` que el
   remitente dibujó encima sí entran y son el mismo cuadrado: el documento tiene la forma y no
   tiene el relleno. Y aquí sólo hay un testigo: `dxf-parser` es CIEGO al HATCH.

**Lo que esto le costó al censo de ayer, y por qué se paga.** La fila `dimensions` estaba en
`servible_hoy` con su parche escrito. Con el rótulo duplicado medido, baja a
`bloqueado_por_defecto_medido`: **238/271 en vez de 239**, alcance de hoy 180/197, pt
independientes 15, filas con tope 26, cinco parches en vez de seis. La medida de las cotas sigue
siendo correcta y sigue publicada; lo que no se puede es cobrar el tope de una fila con un
defecto silencioso medido sobre su propio objeto, que es justo lo que este censo le negó a
`layers` y a `integrity`. Corregido en el dictamen, regenerado el JSON y corregida P-evidencia-05
con la nota de por qué cambió.

**Lo que NO se hizo.** No se tocó `docs/competitive/rubric.json` (compartido), ni ningún archivo
de producción: los cuatro arreglos van escritos enteros y probados en
`docs/execution/frentes/evidencia-peticiones.md`.

**Cifras.** `check:cad-math` pasa de 4286 a **4806** casos y de 17 a **21** suites.
`npm run typecheck` y `npm run check:cad` en verde.

## «Todavía no»

- **2026-09-04 · `check:dwg-evidence` sigue en rojo en esta máquina, y no es de este frente.**
  `scripts/dwg/dwg-evidence.spec.mjs` falla porque `VALLE_DWG_CORPUS_MIRROR` no apunta a ningún
  clon de `valle-design-dwg-conformance`: sin el espejo, el generador computa cero bundles
  admitidos y el artefacto comprometido dice siete. Es exactamente el fallo por entorno que
  AGENTS.md advierte. Comprobado que falla igual en `HEAD` sin ninguno de los cambios de este
  entregable. No se toca: el corpus DWG y sus banderas están fuera de territorio y la campaña
  prohíbe encenderlas.
- **2026-09-04 · Veinticinco filas de la rúbrica siguen sin testigo ajeno.** El censo las lista
  con su candidato y con lo que a cada una le falta, pero listarlas no es servirlas. Las cuatro
  bloqueadas dependen de P-evidencia-07 y P-evidencia-09, que son código de producción y no son
  territorio de este frente; las otras veintiuna dependen de trabajo que todavía no se ha hecho
  o de una persona que todavía no está.
- **2026-09-04 · El dictamen del censo es juicio, y por eso caduca distinto que sus cifras.**
  Las cifras las regenera el spec desde la rúbrica; el dictamen —qué criterio es el candidato,
  si el material ajeno lo alcanza— lo escribió este frente el 2026-09-04 leyendo la matriz y la
  jornada. Si mañana entra material ajeno nuevo, el spec seguirá verde con un dictamen viejo:
  el trinquete vigila las filas, no la vigencia del juicio. Revisar el dictamen cada vez que el
  corpus crezca.
- **2026-09-04 · Los seis parches no los aplica este frente.** `docs/competitive/rubric.json` es
  archivo compartido (R2). Están medidos sobre una copia en memoria y escritos enteros en
  P-evidencia-05; hasta que el coordinador los aplique, la rúbrica publicada sigue diciendo
  233/271 y 31 filas con tope, que es lo que hoy es verdad.
- **2026-09-04 · Firma humana de derechos del corpus.** El dictamen automático está
  completo y hasheado; falta que una persona lo lea y lo firme. Sin esa firma, el criterio
  `dxf.corpus-external` (2 pt) **no se concede**, y así se queda. Petición `P-evidencia-03`.
- **2026-09-04 · Planos de despacho reales.** Ninguno de los diecinueve archivos lo guardó
  AutoCAD ni salió de un despacho. Son ficheros de prueba de dos bibliotecas libres: mejor
  que material propio, peor que producción. El procedimiento de donación existe
  (`docs/DONACIONES.md` del repositorio de conformidad); el donante no.
- **2026-09-04 · Bundle ajeno en `valle-design-dwg-conformance`.** `CORPUS_POLICY.md` exige
  **dos revisores humanos** para el origen `licensed-third-party`. Un agente no es ninguno
  de los dos. El corpus DXF ajeno vive por eso en `docs/cad/corpus/` del repo principal,
  donde la política que lo gobierna se escribió aquí y es la que este frente puede cumplir.
- **2026-09-04 · MTEXT y HATCH sin dueño en el lector.** `importDxfPrimitives` devuelve
  `result.mtexts` y `result.hatches` sin decir si venían del espacio modelo, del papel o de dentro
  de un bloque. Por eso esos dos tipos sólo se pueden comparar sobre el ARCHIVO ENTERO, y la
  matriz lo declara en `ambitosDeConteo`. Arreglarlo es tocar el lector de producción, que no es
  territorio de este frente. Mientras tanto la matriz mide lo que puede y dice lo que no.
- ~~**2026-09-04 · Ida y vuelta contra el corpus ajeno.**~~ **CERRADO el 2026-09-04** por
  `terceros-jornada.spec.ts`: `floorplan.dxf` se abre, se mide, se modifica, se exporta con
  nuestro escritor y se relee con los dos oráculos. Lo que la ida y vuelta enseñó —que ezdxf no
  abre nuestros MTEXT ni nuestros HATCH— está en `P-evidencia-07`.
- **2026-09-04 · Lo que exportamos no lo abre un lector estricto.** `ezdxf` 1.4.4 rechaza el DXF
  que escribimos en cuanto lleva un MTEXT o un HATCH. No es teoría: está medido sobre el fichero
  exportado del plano ajeno, con el error exacto de la biblioteca y con el arreglo probado. Es
  código de producción (`dxf-export.ts`, `dxf-export-hatch.ts`), o sea fuera de territorio:
  `P-evidencia-07`. Mientras no se aplique, la jornada se publica con esa mitad en rojo.
- **2026-09-04 · La medición del oráculo B sobre lo exportado es un artefacto congelado.**
  `ezdxf` no está en CI, así que las lecturas de nuestros ficheros exportados viven en
  `medidas-floorplan-ezdxf.json` ancladas al `sha256` de esos bytes. Cualquier cambio en el
  camino importar→modificar→exportar pone el spec en rojo hasta que alguien con
  `pip install ezdxf==1.4.4` lo refresque en dos pasos (el propio spec y después el script). Es
  deliberado: la alternativa era citar la lectura de unos bytes que ya no producimos.
- **2026-09-04 · La jornada mide números, no aspecto.** Que las 63 cotas midan lo mismo no dice
  que se vean igual. El espacio papel del plano (un Layout1 con 3 VIEWPORT) y el contenido de los
  17 bloques quedan fuera de la comparación, y el artefacto lo declara en `loQueNoSeMide`.
- **2026-09-05 · El color de capa del remitente no llega, y el informe dice que sí.** Es la
  pérdida silenciosa más grande medida por este frente: no es una entidad, es una PROPIEDAD de
  todas las capas de todo DXF que entra, y el dibujo vuelve monocromo al remitente. No contradice
  el techo de cero pérdidas silenciosas de la matriz porque aquella cuenta ENTIDADES, y decirlo
  importa para que las dos cifras no parezcan reñidas. `P-evidencia-12`; el arreglo está probado
  y es código de producción, o sea fuera de territorio.
- **2026-09-05 · Un fichero ajeno legítimo de cada diecinueve no se abre, y se le echa la culpa
  al remitente.** `blocks2.dxf`. La causa es una sola y está medida; el arreglo barato es una
  línea (dejar de decir «corrupto»). `P-evidencia-13`.
- **2026-09-05 · Los cuatro renglones del artefacto se comparan, no se firman.** Cada suite
  recalcula el suyo y hace `deepStrictEqual`; si el producto cambia, la diferencia sale en el
  árbol y hay que mirarla. Lo que NO vigila nadie es que el JUICIO de cada renglón siga vigente:
  «veredicto» y «porQueEseVeredicto» los escribió este frente el 2026-09-05 leyendo lo que los
  oráculos dijeron ese día. Misma caducidad que el dictamen del censo.
- **2026-09-05 · Los atributos de bloque no los atestigua nadie de fuera.** La fila se llama
  «Bloques y atributos» y ninguno de los diecinueve ficheros ajenos trae un ATTDEF ni un ATTRIB.
  La mitad del nombre de esa fila sigue sin testigo ajeno, y el renglón lo dice en
  `loQueNoSeMide`.
- **2026-09-05 · Dónde acaban los 135 rótulos del plano ajeno.** Está medido que se salen de su
  bloque y que llegan con coordenadas locales; NO está medido cuánto se desplaza cada uno, porque
  eso exige componer la transformación acumulada de los 17 bloques de `floorplan.dxf`. La
  composición sólo se hace para el anidado de dos niveles de `blocks2.dxf`, donde cabe a ojo. Lo
  que se afirma es el ámbito, no el desplazamiento.
- **2026-09-05 · El intérprete de códigos MTEXT es nuestro.** Las 129 cadenas con formato que se
  resuelven vienen del plano ajeno, pero quien las entiende es `mtext-codes.ts`. Eso acredita que
  entendemos lo que otro escribió; no acredita que lo dibujemos como AutoCAD. Sin un tercer
  lector que rasterice, esa mitad no se puede afirmar.
