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
`check-auditoria-manifest.mjs` verde. Pendiente: correr los catorce dentro de la
suite normal contra el build de producción (en marcha en segundo plano).
