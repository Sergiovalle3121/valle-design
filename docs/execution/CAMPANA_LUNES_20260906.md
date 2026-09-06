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
