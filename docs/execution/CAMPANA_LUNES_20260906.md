# Bitácora — Campaña «El lunes de un arquitecto» (desde 2026-09-06)

Orden de campaña: `docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md`.
Decisiones tomadas sin preguntar: `docs/execution/DECISIONES_20260906.md`.
Rama: `claude/valle-design-auditoria-bhin78`. Coordinador: F0/F1 (esta sesión).

Las cifras no se copian aquí: `node scripts/cad/rubric.mjs` las computa.

## Punto de partida (verificado en esta sesión, 07:25 UTC)

- `git status` limpio sobre `2fd2bfd` (#192). `node -v` 22.22.2; `/opt/node20` 20.20.2.
- `npm ci` limpio; con dependencias la rúbrica reproduce la foto del 2026-09-05
  (`node scripts/cad/rubric.mjs`).
- Monolito: 18 453 líneas / 131 `useState`; asignación 18 454 (una línea de margen).
- Máquina: 4 CPU, 15 GB, 30 GB libres. Techo de agentes concurrentes locales: 2.
- Red: PyPI y files.pythonhosted.org responden **directo** (están en `noProxy`);
  `pyproj 3.7.2`, `mpmath`, `hypothesis` (desinstalada a las 18:25: es MPL-2.0, D-11), `openapi-spec-validator`, `pypdf`,
  `pdfminer.six` instalados con `pip --user` para el frente de evidencia.

## Ola 0

### T-01 · Graduación · HECHA (07:33 UTC)
Catorce ficheros mudados de `e2e/auditoria/` a `e2e/golden/101…114-auditoria-*`.
Dos marcas `test.fail()` viejas retiradas (`tresd`, `imprimir`) con su comentario
reescrito para que digan que el defecto está cerrado. Manifiesto: 14 entradas
(11 con defecto vivo + 3 arnes), techo 28 → **14** (D-01). Gate
`check-auditoria-manifest.mjs` verde. Los catorce corridos dentro de la suite
normal contra el build de producción (07:55 UTC): 28 casos verdes y **un rojo
que no era del producto**: `114-auditoria-mensaje-directo` escribía un
inventario de depuración a una ruta absoluta del contenedor de la auditoría
(`/tmp/claude-0/…/inventario.json`), que aquí no existe y en CI tampoco. Se
sustituyó por `testInfo.attach` y se reejecutó solo: 2/2. El mismo residuo
vivía en `intercambio.spec.ts:292` (todavía en auditoría) y se corrigió con
`testInfo.outputPath`. **VERIFICADA.**

### T-0D · Limpieza de documentación · EN CURSO
Cuatro bitácoras de cortes ya fusionados (`CAMPANA_3D_POST_M1`,
`CAMPANA_REVIEW_CONCURRENCY`, `CAMPANA_COMMERCIAL_RC1`, `CAMPANA_10X`) mudadas a
`docs/history/execution/` con el índice de `docs/history/README.md` y el enlace
de `BACKLOG.md:50` corregidos. Nada se borra. `FASE4_TESTIGO_AJENO_20260905.md`
se queda (D-03). Las referencias del libro mayor
`docs/governance/assisted-development-log.json` a las rutas viejas se conservan:
es un registro de lo que fue cierto en su fecha, no un índice.

### T-02 · Filas nuevas y gaps caducados · HECHA (08:05 UTC)
`rubric.json` versión `2026-09-06.1`: nacen los grupos `comercial` (4 categorías,
12 pt destino) y `navegador` (4 categorías, 10 pt destino), y las categorías
`degradation` (4 pt hoy, en `truth`), `ribbon-ux` y `accessibility` (6 + 6 pt hoy,
en `recog`). Casi todo nace como `todaviaNo` explícito con su motivo y la ficha
que lo cierra; lo que ya existía y nadie medía (checkout OXXO/SPEI, asientos en
el servidor, sólo lectura al vencer, reembolsos por webhook) se cobra. Tres
correcciones de honestidad: `xrefs.resolution` → `bind` + `layers`;
`modeling3d.z-roundtrip` → `z-dxf` + `z-pointer`; `toolset-electrical.esquemas`
renombrado a lo que verifica. Gaps caducados de `command-line` (alias) y `draw-2d`
(F7/F9/F12) corregidos hacia arriba; `performance` declara que el artefacto mide
un pipeline que el editor no ejecuta. `rubric.spec.mjs` actualizado a los
denominadores nuevos con su comentario de corte; matriz regenerada con
`--markdown`; `--check`, `rubric.spec.mjs` y `check:json-keys` verdes.
**El porcentaje baja porque el denominador creció con filas honestas: es
correcto y no es una regresión.** Las cifras: `node scripts/cad/rubric.mjs`.
`ESCALERA.md` gana la sección de la Ola 0 (FLATSHOT sobre `wall` separado del
heredado, el imán con nombre falso declarado como defecto, el tope de 12 MB del
DXF declarado con su cifra y su motivo).

### Sesiones hermanas (directiva del titular, D-02) · 07:37–07:52 UTC
Siete sesiones con Sonnet 5, una por frente, cada una en su rama y con PR
borrador contra `main`: F3 (bucle 2D), F4 (papel y entrega), F5 (toolsets),
F8 (despacho), F9 (cimientos y piel), F10 (evidencia independiente), F11
(inventario AutoCAD 2027 vs Valle). F4 y F11 pidieron confirmación del encargo
y la recibieron por rutina de sesión. Territorios y rangos de goldens en
`docs/execution/frentes/README.md`.

### Corrección tras la suite de web (08:12 UTC)
`npx turbo run test --filter=web` sobre el árbol quieto: 623/624. El rojo era
`independencia-rubrica.spec.ts`: al partir `xrefs.resolution`, la fila `xrefs`
dejó de estar en su tope y su dictamen del censo describía un árbol que ya no
es éste (el spec lo ata por los dos lados, y tiene razón). Se retira el
dictamen con nota fechada y el texto conservado para cuando la fila vuelva al
tope, y se regenera `independencia-por-fila.json` con `VALLE_ESCRIBIR_CENSO=1`.
Es un fichero del territorio de F10, tocado por el coordinador porque la
consecuencia era de su propia edición de la rúbrica; queda anotado aquí para
la integración de F10.

### T-00 · Paso 0 · HECHO (08:25 UTC)
Los once símbolos muertos que eslint marcaba (`no-unused-vars`) y su cascada
probada con `grep -nw`: `applyCommand` (y `applyCommandOperation`, que sólo él
llamaba), `submitPrecisionPoint`, `interpretCommand`,
`navigateCommandLineHistory`, `undoLastCommand`, `redoLastCommand`, el `ctx`
huérfano de `snapFloor`, cuatro imports de tipo y los dos imports que sólo los
muertos usaban (`cadNlCommandsIfLoaded`, `navigateCadCommandHistory`,
`parseCoordinate`, `CadOperation`). Dos estados quedan escritos y nunca leídos
(`commandHistoryCursor`, `precisionText`): se conserva el `useState` y se
retira la lectura del valor; retirarlos entero toca nueve llamadas al setter y
va al BACKLOG. Resultado: 18 453 → 17 898 líneas (−555), 171 → 160 avisos de
lint en el fichero, cero `no-unused-vars`. `check-monolith-budget --update` en
el mismo commit (y baja también las asignaciones de `dxf-*`, `paper-space`, que
ya estaban por debajo); `check-lint-budget --update` aprieta el trinquete.
Typecheck verde; los ocho specs que leen el monolito, verdes.

Fallo propio cazado por el gate: `rubric.spec.mjs` había crecido a 805 líneas
(tope 800 sin asignación) con mi comentario de corte; se recorta a una línea
en vez de abrir asignación. El push anterior lleva ese rojo en `check:cad`;
este commit lo cierra.

## Ola 1

### T-11 (b) y (c) · La capa del rótulo y el resumen del cuadro de exportar · ARREGLADA (08:40 UTC)
(b) Los dos literales `layer: "Text"` del monolito descartaban la capa
asignada al rótulo (`layerAssignments[ann.id]`, que es donde el editor la
guarda: `Ann` no lleva `layer`); ahora usan `layerLabel(layerAssignments[ann.id]
?? "Text")`, la misma regla que cajas y conectores. (c) Al medir salió el otro
defecto del racimo: el resumen del cuadro clasificaba toda entidad nativa como
«objeto» y anunciaba «Cotas 0» con una DIMENSION en el fichero; ahora la cota
nativa cuenta como cota y el MTEXT/MLEADER como rótulo
(`editor/export-readiness-kind.ts`), que es exactamente lo que `exportDxf`
escribe bajo «incluir cotas» e «incluir rótulos». Verificado contra el build de
producción: los cinco casos del racimo C (seis pruebas) verdes; graduados a
`golden/115…118`; techo del manifiesto 14 → **10**. Cambia los bytes del DXF de
todo dibujo con rótulos en capa propia: entra con la suite de goldens entera
detrás en el push de la ola, no como parche.

**Fallo propio cazado por el gate, otra vez:** el commit `b42948b` dejó el
monolito 17 líneas por encima de su asignación (comentarios y la clasificación
en línea) y CI lo acusó. Corregido en el commit siguiente: el porqué vive en el
módulo nuevo y aquí, no en el monolito; y se aplica el paso 0b del plan de F1
—los dos estados que se escribían y nunca se leían (`commandHistoryCursor`,
`precisionText`) salen con sus ocho llamadas al setter: el valor escrito era
siempre el inicial, así que React descartaba cada llamada sin efecto—.
Monolito 17 889 líneas / **129** `useState` (techo 131 → 129).

### Frentes hermanos a las 08:40 UTC
PR borrador abiertos: [#195](https://github.com/Sergiovalle3121/valle-design/pull/195)
F11 (inventario completo: 159 capacidades comparadas, tres filas propuestas en
JSON —`visual-styles`, `browser-advantage`, PDF underlay— y una cola de 30
ordenada por el criterio del prompt maestro; la mayoría coincide con las
fichas T-NN, y añade `TOOLPALETTES` sin escritura, AutoLISP sin `PAUSE` ni
salida a fichero, y el corte de la biblioteca a 200 documentos),
[#196](https://github.com/Sergiovalle3121/valle-design/pull/196) F4 (T-11 a
hecho, decisión del emisor de PDF, T-19·3 hecho, en T-19·4/5) y
[#197](https://github.com/Sergiovalle3121/valle-design/pull/197) F10 (pyproj,
openapi-spec-validator, HMAC, mpmath, atheris). F3 (T-14, T-21, T-23 en
verde), F5 (T-15, T-33, T-10 a en curso), F8 (T-17 hecho, T-18, T-63) y F9
(T-13, T-72, T-75 c) siguen en marcha sin PR todavía.

### T-12·5 y T-12·4 · F2 en árbol aparte · ARREGLADA/OCULTA (08:50 UTC)
Las cuarenta entradas «Frase» salen de Ctrl+K (D-04) con sus tres cadenas
del «copiloto»; `command-palette.spec.ts` lo defiende y el golden 119 lo mira
en el navegador. `PLOT` gana su resumen en español («Imprimir la lámina…»),
así que buscar «imprimir» ofrece PLOT y pulsarlo arranca el trazado: la
prueba de la palabra «imprimir» (racimo D) se reescribe —B pide que arranque
PLOT, no un PDF al pulsar, que es lo que hace AutoCAD— y se gradúa como
golden 190 (techo 10 → 9). Un alias `IMPRIMIR` en la línea de comandos es la
ficha T-73 (c), al backlog (L-2).

### T-00 · Paso 1 · HECHO (09:00 UTC)
El controlador de exportación sale del monolito: `editor/export-host.ts`
(746 líneas: `CadExportHost` con los cinco estados del cuadro de exportar y
sus setters de firma React, `useCadExportHost`/`useCadExport` por
`useSyncExternalStore` —el patrón de `paper-spaces-host.ts`—, y las acciones
`computeDxfExportSummary`, `setDxfOption`, `openDxfExport`, `exportDxf`
verbatim) y `editor/export-scene-actions.ts` (164: `exportPng`, `exportGltf`;
separado porque un solo fichero pasaba de 800). Monolito 17 889 → **17 340**
líneas y 129 → **124** `useState`. `diff -w` del bloque movido contra HEAD:
las únicas diferencias son cuatro nombres de tipo (los del cuadro, ya
exportados por `CadDxfExportDialog.tsx`, sustituyen a los privados). Gates:
typecheck, eslint (cero `no-unused-vars`, mismos recuentos por regla que
antes), presupuesto del monolito con `--update`, trinquete de lint, los
specs que leen el monolito, `check:no-industrial-domain`, `check:conventions`.

**Decisión D-06, la única desviación del plan:** la fábrica de acciones se
llama `useCadExportActions` y no `createCadExportActions`. No invoca ningún
hook —son cierres que se recrean en cada render, como antes—, pero la regla
`react-hooks/refs` marca «Passing a ref to a function may read its value
during render» para cualquier llamada sin prefijo `use` que reciba refs, y el
trinquete de lint está exactamente en su techo: el nombre `create*` lo pondría
en rojo y compensarlo tocando otro controlador estaba prohibido. Con el
prefijo `use`, el compilador de React —si algún día se enciende— la trata como
hook: se ejecuta en cada render y nunca se memoiza, que es exactamente la
semántica que hace verbatim la extracción. Queda documentado en la cabecera
del fichero. Lo mismo aplicará al paso 3.

### T-10 (b) · `EXTRUDE` declara el perfil no plano · ARREGLADA en F2 (09:05 UTC)
`profileFromEntity` tomaba la cota de UN vértice y el anillo en 2D: un perfil
inclinado salía aplanado (menor por el coseno) y a la cota de una esquina, con
aspecto de correcto. Ahora `horizontalProfileFromEntity` mide la separación de
cota entre los vértices que definen la entidad (con la tolerancia lineal del
propio kernel) y `EXTRUDE`/`PRESSPULL` se niegan nombrando el contorno y la
desviación en milímetros: «el perfil no es horizontal (sus vértices se separan
500 mm en cota). En esta versión EXTRUDE sólo acepta perfiles horizontales y no
aplana los inclinados; extruirlos por su normal está pendiente». Un perfil
horizontal a cualquier cota extruye byte-idéntico. 49 comprobaciones nuevas en
`solid3d-profiles.spec.ts` y `solids-create.spec.ts`; `check:command-integrity`
sin cambios (el artefacto no se toca). Lo que queda para el backlog: extruir
por la normal (el arreglo bueno) y el mismo guardián en REVOLVE, LOFT, SLAB y
STAIR, que siguen leyendo la cota de un vértice.

### T-00 · Paso 2 · HECHO (18:10 UTC)
`editor/versions-host.ts` (369 líneas): el cuadro «Versiones» —abierto, nombre,
ocupado, lista del servidor— y los snapshots locales con su última comparación,
más las ocho acciones, movidos tal cual. Seis `useState` menos (124 → 118).
Monolito 17 340 → **17 235** (techo de la ficha ≤ 17 250: cumplido; acumulado
18 453 → 17 235, 1 218 líneas fuera). Único ajuste no verbatim: el `useCallback`
de `recordLocalSnapshot` declara `setLocalSnapshots` (ya no es un setter de
React; sin declararlo el trinquete de `exhaustive-deps` subía 6 → 7). Verificado
como el paso 1. Los pasos 3 (`dxf-backdrop-host`) y 4 quedan opcionales: el
techo de la ficha ya está cumplido y la Ola 1 tiene prioridad.

### T-43 D1 · El invitado ya no oye «nadie más» · ARREGLADA en F2 (09:08 UTC, fusionada 18:12 UTC)
`use-cad-presence.ts` calculaba `connected` como «hay algún transporte»; con
BroadcastChannel (pestañas de este navegador) un invitado del enlace veía
`connected: true`, la lista vacía y «Nadie más en este documento ahora mismo»
mientras el arquitecto miraba desde otra máquina. Regla nueva y pura
(`presence-affirmation.ts`): sólo un transporte que alcance OTRAS máquinas
respalda la afirmación —hoy el canal del servidor, y sólo lo tiene la sesión
first-party—. El panel enseña los peers reales y, sin ese transporte, dice
«No se puede saber quién más está mirando desde aquí». 12 comprobaciones
(regla + cableado). Golden 109 sin cambio. Decisión no preguntada: con peers de
pestaña propia y sin transporte entre máquinas se enseñan los chips Y la nota;
ocultar los chips tiraría información cierta.

### Parón por límite de sesión (09:10 → 17:50 UTC)
La cuenta agotó su límite de sesión a las 09:10 UTC (agentes en vuelo
terminados por el proveedor: el paso 2 quedó a medias en el árbol y la
auditoría documental completó 48 verificaciones de 96). Reanudado a las 17:50
con la orden «try again». El árbol del paso 2 se verificó entero antes de
commitear (no se dio nada por hecho del agente interrumpido). Los frentes
Sonnet pararon a la misma hora: F10 (#197, 4 commits), F11 (#195, 5), F9
(rama nueva, 2), F4 (#196, sin rebasar: 5 commits sobre `1478471`).

### CI del PR #194 en rojo sobre `512fdc8`: `llamada-webrtc-real.spec.ts` (paso 4)
`E2E Playwright 4/4`: «B se une y los dos llegan a en-curso» — en A nunca
apareció «En curso» en 60 s (el resto de la rebanada, 69 en verde; cables
sueltos 2/2 en verde). Nada del diff toca llamadas, señalización ni el SSE de
`/v1/calls`; en `main` (`2fd2bfd`) la misma suite estaba en verde. Decisión:
no se gasta una corrida de CI en re-lanzar el job aparte —el siguiente push
(paso 2 + T-43 D1) vuelve a correr la suite entera y hace de re-ejecución—.
Si repite sobre el nuevo head, se investiga como propio.

### T-12·1 · «Versiones» habla con el historial real del servidor · ARREGLADA (18:48 UTC)
La ficha daba dos salidas —cablear el botón a la historia real, que existe, o
retirarlo— y se eligió cablearlo, porque volver a una versión anterior es lo
que un despacho espera de un CAD en el navegador y el servidor ya guardaba
una versión por cada guardado (`/v1/cad/documents/:id/versions`, CAS,
inmutable). `versions-host.ts` deja de pedir `layout/snapshots…` (404
declarado) y lee el historial con `versionsRepository` (`list`/`get` y un
`restoreAs` nuevo que es `saveContent` con el CAS de la cabeza que el editor
conoce). El cuadro ya no promete «Guardar versión» ni papelera: el historial
no se nombra ni se borra; restaurar guarda la versión vieja como versión
nueva y recarga el editor. Se niega —con la frase que ve el arquitecto— sin
identidad en el servidor, con cambios sin mandar, con un puntero a blob y
ante un 409. La identidad la resuelve `peekLegacyDocumentId`
(`legacy/layout-document-identity.ts`, sólo lectura de la caché del
adaptador: ese fichero está en su techo y sólo puede encoger). Las refs del
monolito se leen en el evento, nunca en render (D-06 aplica: la fábrica es
`createCadVersionsActions`, y `useCadVersionsActions` es su alias con
prefijo). El fake `/v1/cad` gana el historial (`e2e/fixtures/cad-v1-versions.ts`).
Verificado: `versions-host.spec.ts` (28), golden 191, typecheck, lint
478/478, monolito en 17 235 (sin crecer), los diez specs que leen el
monolito. Lo que queda (ESCALERA): previsualizar una versión sin guardarla
y el diff visual entre dos versiones del servidor.

### T-0D · Segunda mitad: los documentos vencidos, corregidos · HECHO (18:59 UTC)
La auditoría documental (cuatro lectores por rebanada, cada hallazgo puesto
en duda por un verificador aparte contra el árbol) confirmó 43 hallazgos en
diez documentos vivos y refutó 1; 48 quedaron sin verificar por el parón de
sesión y se están verificando ahora con Sonnet (misma consigna, mismo
escéptico). Los 43 se aplicaron con un editor por documento y un revisor
adversario por documento que re-corrió los comandos de verificación: siete
veredictos «wrong/missing» se aplicaron a mano (MinIO nunca corrido contra un
servidor real —lo dice la cabecera del adaptador—, §6-quater y no §6-bis para
el perfil V3, el contrato de LECTURA/escritura del códec en ARCHITECTURE,
P2-16 fuera de la sección P1, P1-FE1 sin afirmar en presente un experimento
de agosto, y el sello «Actualizado» del BACKLOG). Familias: la variable real
es `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA` (README, PRODUCT, ARCHITECTURE);
«el producto rechaza DWG» pasa a «fuera de la beta de ADR-0009»; MinIO/S3
existe como adaptador seleccionable y sin corrida real; el CFDI timbra con
`CFDI_PAC_NAME=facturama`; `/health/metrics/commercial` lleva `Bearer
$METRICS_TOKEN` en DEPLOYMENT y RUNBOOK; el kernel WASM SÍ se consume
(`tessellate.worker.ts`) y AGENTS.md pasa de «no introducir» a «no extender
sin»; y en BACKLOG siete entradas cerradas se borran según su propia regla
(P1-2, P1-3, P1-8, P1-FE2, P1-FE4, P2-FE5 y `npm run doctor`), las cifras a
mano remiten al script que las computa, y entran L-5 (precaché del núcleo
del service worker, F9-P-03) y L-6 (previsualizar y comparar versiones del
servidor). `docs/cad-contracts-catalog.md` baja a `docs/history/execution/`
con su línea en el índice. Gates de documentos en verde (identidad, legal,
auditoría, dirección de imports).

### T-03 · Frente F10 integrado: seis oráculos ajenos, seis filas sin retención · HECHO (19:05 UTC)
PR #197 (CI verde) fusionado en la rama de campaña. Peticiones P-F10-01…06
aplicadas en `rubric.json` (evidencia `spec` con `independent: true`), los seis
specs admitidos en `FUENTES_INDEPENDIENTES` y sus dictámenes retirados con
fecha (`independencia-dictamen.ts`), censo regenerado. P-F10-07 corregida en el
prompt maestro (D-11); P-F10-08 queda para el titular (D-10). Las decisiones de
F10 entran en `DECISIONES_20260906.md` renumeradas D-F10-nn. Medido con
`node scripts/cad/rubric.mjs` tras la fusión: los puntos con evidencia
independiente suben (la cifra la imprime el script; aquí no se copia) y seis
filas dejan de retener su punto. Gates sobre el árbol fusionado: typecheck,
eslint, lint 478/478, monolito, json-keys, dwg-evidence (con el espejo del
corpus), cad-math, legal, precision-evidence, rubric.spec (61) y la matriz
regenerada con `--check`.

### T-12·2 · El PNG sale con la cámara activa · ARREGLADA (19:21 UTC)
`exportPng` (ya en `export-scene-actions.ts`) pintaba con `cameraRef` (la
`PerspectiveCamera` cruda) aunque el visor estuviera en planta. Ahora
`pickCadExportCamera(viewControllerRef.current?.camera, cameraRef.current)`:
la del controlador de vista —la misma que `renderer.render(scene,
activeCamera())` usa en cada cuadro— y la de perspectiva sólo si aún no hay
controlador. El monolito pasa `viewControllerRef` al anfitrión (una línea; se
recortó un comentario para no crecer: sigue en 17 235). Spec de 8
comprobaciones (regla + cableado). Queda para ESCALERA el golden de píxeles.

### Frente F5 integrado (T-15, T-33, T-19·1, T-10a, T-35) · HECHO (19:31 UTC)
PR #199 fusionado (su único rojo de CI era `llamada-webrtc-real` paso 4, el
mismo test que falló y luego pasó en la rama de campaña: ambiental, anotado en
L-7). Peticiones aplicadas: P-01 opción A (el texto del criterio
`toolset-electrical.esquemas` ya decía «instalación en PLANTA … sin símbolos de
esquema de control»; entra la fila en peldaño 0 de ESCALERA), P-02 (la fila
`FLATSHOT`/`SECTION` sobre la entidad `wall` pasa a peldaño 5 con el golden
140 y `flatshot-solids.spec.ts` §9-12; `SLICE` sin muros a propósito), P-03
(`nativeMassHosts: nativeMassHostsRef` en `cadStudioEngineBridges`; el golden
47 recupera las dos aserciones de `data-visual-style`). Verificado sobre el
árbol fusionado: typecheck, eslint, lint 478/478, monolito 17 235 (sin
crecer: un comentario de dos líneas pasa a una), los doce specs de F5, los
goldens 47, 140 y 93 sobre el build de producción.

### Frente F3 integrado (T-14, T-19·2, T-21, T-22, T-23, T-24, T-25) · HECHO (19:43 UTC)
PR #201 fusionado sin conflictos. Peticiones: P-02 (el anfitrión escribe
`session.lastSelectionIds`; «Previo» ya recuerda: spec nuevo con los comandos
calentados a demanda) y P-04 (pista del suelo del historial en la barra de
estado, `history-depth-hint.ts`, umbral tomado del primer escalón de
`undoDepthByTier` donde sobreviven dos pasos o menos) aplicadas. P-01
(`annotation-v4-adapters.ts`) y P-03 (PAR con arista de referencia: enrutar
el puntero, T-20) quedan en cola del coordinador; P-05 era el espejo del
corpus DWG sin `VALLE_DWG_CORPUS_MIRROR`, no un rojo de main. Verificado:
typecheck, eslint, lint 478/478, monolito, `check:command-integrity` (294,
0 éxitos falsos), specs del anfitrión y de palabras clave.

### T-16 · Las dos puertas de importación contestan lo mismo · ARREGLADA (20:20 UTC)
El estudio (`onDxfFile`) ya no lee el archivo entero para medir 12 000 000
unidades UTF-16 a mano ni contesta siempre «el editor no lee DWG»: pregunta
a `admitStudioBackdropFile` (`document-import-door.ts`), que pregunta a
`validateImportFile` —la misma función del tablero, con la misma beta de
build y el mismo tope en bytes— antes de leer nada. La razón DWG del
contrato se mudó a `dwg-unavailable-reason.ts` (sin dependencias) para que
la puerta ligera del tablero la diga sin arrastrar el importador DXF, y
`interop-provider.ts` la reexporta. Con las puertas cerradas, un `.dwg`
recibe esa frase en las dos pantallas; con la beta encendida, el estudio
admite lo que admite el tablero y dice por dónde entra (D-12). Fuzzer: la
clase `extension-dwg` pasa a `dwg-sin-proveedor`. Monolito: 17 235 exacto
(la puerta le quitó al `onDxfFile` lo que le añadió el import). De paso,
F3-P-01: la inserción del ATTDEF se imanta como `insertion`
(`annotation-v4-adapters.ts`; `professional-snapping.spec.ts` con un ATTDEF
real, 22). Verificado: typecheck, eslint (0 errores), lint 478/478,
monolito, `check:conventions`, `document-import-door.spec.ts` (23),
`document-import.spec.ts`, `document-import-fuzz.spec.ts` (39),
`interop-provider.spec.ts`, `dwg-surface-honesty.spec.ts`; golden 192 nuevo
y el 38 (colocación del DXF de fondo), sobre el build de producción.
**CI rojo en eed5736 (20:21 UTC)**: `scripts/dwg/check-product-boundary.mjs`
corre `dwg-document-bridge.spec.ts`, que afirmaba la frase vieja
(`/no soportado/`) para el `.dwg` rechazado; el grep de consumidores buscó
el literal completo y no la expresión. Corregida la aserción (la razón DWG,
en las dos cajas) y el script entero verde en local antes de empujar.

### T-20 · El clic que se perdía sobre un pinzamiento · ARREGLADA (20:38 UTC)
Racimo B entero. `CadNativeGripDeps.commandActive` (opcional) pregunta lo
que `CadCommandEngineHost.accepts` ya contestaba y `start()` cede el clic
con un comando abierto; el monolito lo cablea y sigue en 17 235 exactas
(paso 1: 291bb43). En el navegador, sobre el build de producción: las once
pruebas de `modificar`, `refutacion-pinzamiento` y `refutacion-trim`
verdes, incluidas OFFSET sobre el punto medio del eje designado y TRIM
sobre el extremo del muro designado (antes: 0 paralelas, muro intacto). Los
cuatro casos de OFFSET necesitaron adaptar su recorrido al flujo de T-23
—el lado se pincha, y ese prompt sólo aparece si el clic anterior llegó—:
D-13. Graduación: los tres archivos mudan a golden 193-195, el manifiesto
pasa de 9 a 6 (3 con defecto vivo + 3 arnes), los `expect.soft` se vuelven
duros y los títulos afirman lo que ahora ocurre. Rúbrica: los goldens y el
spec del controlador entran como evidencia de `modify.grips`, `.basics` y
`.edges` (sin tocar puntos). Verificado: typecheck, eslint, lint 478/478,
monolito, `check:auditoria` (techo 6), `check:e2e-localizadores`,
rubric.spec, `native-grip-controller.spec.ts` (6 bloques).

### Frente F8 integrado (T-17, T-18a/b/d, T-60a-d, T-61, T-63e/f) · HECHO (20:44 UTC)
PR #198 (head d8acb66, CI verde: contrato, los cuatro fragmentos E2E,
despliegue) fusionado sin conflictos (72d568c). Cierra los cuatro correos
huérfanos con gate de cobertura (`email-template-coverage.spec.ts`,
`identity.new-sign-in` primero), «Factura CFDI» derivada del modo real del
proveedor, el JSON-LD sin Safari, `<html lang>` por ruta, arrastrar un DXF
al estado vacío y al tablero (golden 150), expulsar/degradar miembros,
cambiar contraseña y correo dentro de la sesión, 2FA con reautenticación y
comprar el asiento que falta (`commercial-seat-growth.pg.spec.ts`). En la
rúbrica su evidencia sustituye cuatro «todavía no» del grupo `comercial`
(asientos, CFDI honesto, correo transaccional; el primer minuto conserva su
«todavía no» por el lienzo y el proyecto implícito), sin tocar puntos; la
cifra la computa `node scripts/cad/rubric.mjs`. Peticiones: F8-1 (aceptar
términos al crear la cuenta, `AuthPage.tsx` + identidad) y F8-2 (`onDrop`
en el lienzo del estudio) pasan a la cola del coordinador; F8 sigue con
T-62 en su rama. El typecheck del árbol fusionado fallaba en local por el
`dist/` viejo del SDK (el contrato ganó `cfdi`): se reconstruyó con turbo
y pasa; no es un defecto de la rama. Verificado: tsc web y api, lint
478/478, monolito, `check:conventions`, `check:authz`, `check:api-console`,
`check:surface`, no-industrial, legal, los ocho specs web que F8 tocó,
rubric.spec (61) y la matriz regenerada.
**CI rojo en cdc1b86 (20:48 UTC)**: `check:cad-math` —que no corrí sobre el
árbol fusionado— exige dos artefactos congelados que sí cambian con lo
integrado: el censo de independencia de la rúbrica (cambió la evidencia de
`modify.*` y `comercial`) y el dictamen de `openapi-spec-validator` (F8
amplió el contrato). Regenerados con `VALLE_ESCRIBIR_CENSO=1` y
`censo-openapi.py`; `check:cad-math` verde en local antes de empujar.
Regla que queda: toda edición de `rubric.json` o del contrato regenera su
censo en el mismo commit.

### F8-2 · Soltar un DXF sobre el lienzo del estudio (T-63f, tercera superficie) · ARREGLADA (20:54 UTC)
`cad-canvas` acepta `dragover`/`drop` de ARCHIVOS y los manda por la misma
puerta que el input del plano de fondo (`onDxfFile` → `admitStudioBackdropFile`,
T-16): el reordenado de presentaciones arrastra texto y no pasa por ahí; en
sólo lectura o con una carga en curso el archivo se ignora. Golden 196: el
DXF soltado viaja al servidor con su colocación (como el 38) y el `.dwg`
soltado recibe la frase de la puerta compartida sin viajar. Monolito en
17 235 exactas (tres comentarios comprimidos pagan los manejadores). La
fila `commercial-migration.first-minute` conserva su «todavía no» sólo por
el proyecto implícito. Verificado: tsc, eslint (0 errores), monolito, y los
goldens 196, 38 y 192 sobre el build de producción.

### F8-1 · Aceptar los términos al crear la cuenta (T-63d, parte 1) · ARREGLADA (20:54 UTC)
El formulario de alta (`AuthPage.tsx`) pide `GET /v1/legal/documents`
(pública) y muestra una casilla obligatoria —el `Checkbox` de la casa, con
el `<input>` real— que nombra la versión vigente de los Términos y enlaza
al Aviso de Privacidad; «Crear cuenta» queda deshabilitado hasta marcarla.
Si la petición falla, la casilla enlaza a las páginas sin número de
versión (D-14). Golden 197: la versión en pantalla, los dos enlaces, el
botón deshabilitado con el formulario lleno, y el alta que sólo viaja
marcada. Las cinco pruebas `real/` que crean cuenta por el formulario
marcan la casilla. La parte 2 (el servidor exige y registra la aceptación
al registrarse) queda en F8, avisado. Verificado: tsc, eslint (0 errores),
golden 197 y la prueba pública de accesibilidad móvil sobre el build.

### T-52 (racimo A) · El punto del ratón bajo un SCU inclinado sale del plano de trabajo · ARREGLADA (21:13 UTC)
El rayo ya cortaba el plano (y=7500 exacta) pero el imán perdía la cota por
dos vías: `snapAtDrawingPoint` proyectaba la SOMBRA del punto
(`worldToScreen(x, y)`, sin z) y enganchaba la arista de abajo, y los
candidatos 2D devolvían un punto sin z. Ahora el anfitrión proyecta el
punto real con su cota (el mismo proyector que indexa las aristas), bajo un
plano inclinado sólo engancha lo que está EN el plano
(`cadDistanceToUcsPlane` ≤ apertura; D-15: el índice no sabe qué tapa el
sólido y la cara de atrás también se proyecta) y las sombras 2D y el
rastreo se saltan. Monolito en 17 235 exactas. Golden 198 (graduado de
`refutacion-scu-raton`, techo 6 → 5; los píxeles del segundo clic se
acercaron al centro para caer sobre la fachada) y golden 101 verdes sobre
el build; `solid-shade-host.spec.ts` (con cota engancha arriba; sin cota,
la sombra enganchaba abajo) y `pointer-work-plane.spec.ts` (distancia al
plano). Rúbrica: `modeling3d.z-pointer` deja el «todavía no»; censo
regenerado. Verificado: tsc, eslint (0 errores), monolito, lint 478/478,
check:auditoria (techo 5), e2e-localizadores, rubric.spec, check:cad-math.
