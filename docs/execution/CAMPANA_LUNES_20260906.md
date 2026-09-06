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
  `pyproj 3.7.2`, `mpmath`, `hypothesis`, `openapi-spec-validator`, `pypdf`,
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
