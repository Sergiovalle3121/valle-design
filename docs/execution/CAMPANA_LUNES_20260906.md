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
