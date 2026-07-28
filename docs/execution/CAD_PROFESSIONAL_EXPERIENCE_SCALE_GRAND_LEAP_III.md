# CAD Professional Experience, Scale & Reliability — Grand Leap III

## Control de ejecución

| Campo | Valor |
| --- | --- |
| Inicio | 2026-07-28 00:41:25 -06:00 |
| Objetivo de ventana | 2026-07-28 08:41:25 -06:00 |
| Repositorio | `Sergiovalle3121/axos-os` |
| Base | `06a35ff1a84b089636de0f168d4d9592d857f557` (`origin/main`) |
| Rama | `codex/cad-professional-grand-leap-iii` |
| Worktree | `D:\\Codex\\Projects\\axos-os-cad-grand-leap-iii` |
| Integración | Commits focales, push y PR draft; sin auto-merge |

El checkout `D:\\Codex\\Projects\\axos-os-active` contenía trabajo local no
relacionado de la vertical de IA. Se preservó sin alteraciones y esta misión se
aisló en un worktree limpio desde el `origin/main` más reciente.

## Frontera y plan

Esta misión extiende el editor, `CadDocument` v3, el command bus, el índice
espacial, el guardado CAS y el publicador existentes. No crea un segundo editor,
documento canónico, command bus, índice espacial o subsistema de blobs.

Orden de ejecución:

1. Auditar y cerrar el núcleo de interacción profesional sobre los contratos
   existentes.
2. Cerrar un paquete nativo de documentación y precisión de extremo a extremo.
3. Eliminar el límite monolítico de persistencia para dibujos grandes y añadir
   recuperación operativa.
4. Probar el recorrido comercial y medir 10k/100k en Chromium real.
5. Ejecutar gates, revisar tenancy/licencias/diff y publicar un PR draft.

## Baseline remoto

- `origin/main` se actualizó de `75a87680` a `06a35ff1` antes de crear la rama.
- PR CAD abierto: ninguno.
- PRs concurrentes preservados: ERP #1402 y PDF #1398.
- Base CAD reutilizada: PR #1399 (documento canónico v3), PR #1405 (curvas
  nativas y edición revision-safe) y PR #1409 (layouts/publicación gobernada).
- GitHub CLI 2.95.0 autenticado como el contribuidor configurado.

## Matriz inicial de verdad

| Área | Estado inicial | Evidencia / brecha abierta |
| --- | --- | --- |
| Documento canónico | `tested` | `CadDocument` v3, CAS SQL y proyección incremental |
| Curvas ARC/ELLIPSE/SPLINE | `browser-proven` | render, selección, grips, save/reload y E2E Chromium |
| Layouts/publicación | `tested` | paper spaces, sheet set y PDF vectorial; UI multi-viewport parcial |
| Interacción profesional | `wired` | command line, atajos y snaps existen; ciclo uniforme aún por auditar |
| Documentación nativa P1 | `wired` parcial | HATCH/INSERT/MTEXT/DIMENSION/MLEADER requieren ciclo completo |
| Persistencia 100k | `missing` | payload JSON monolítico limitado a 8 MB; corpus previo ~20 MB |
| Recuperación | `missing` | autosave/recovery multi-tenant no demostrado |
| Rendimiento navegador 100k | `kernel-only` | índice medido; frame time y memoria Chromium pendientes |
| DXF | `tested` parcial | subconjunto semántico con loss manifest |
| DWG | `provider-required` | no se añade parser improvisado ni claim de compatibilidad |

## Bitácora de checkpoints

### 2026-07-28 00:41–00:55 — Preflight

- Commit: base `06a35ff1`.
- Vertical: preflight/baseline.
- Cambios: worktree limpio, rama aislada y registro de ejecución.
- Evidencia: remoto, permisos, PRs, worktrees y reglas `AGENTS.md` verificados.
- Bloqueos: la API de esta sesión no expone la acción de UI `Make primary`;
  todas las operaciones Git se ejecutan desde `D:` y el clic queda como ajuste
  manual del proyecto en la app.
- Siguiente acción: ejecutar baseline CAD y puntuar las brechas reales antes de
  implementar.

### 2026-07-28 00:55–01:04 — Baseline verde y selección de verticales

- Commit: base `06a35ff1` (sin mutaciones funcionales).
- Vertical: preflight/baseline.
- Cambios: `npm ci` completado sin modificar dependencias; auditoría del editor
  de 8,158 líneas, `CadDocument` v3, command bus, runtime de entidades, DXF,
  paper space, guardado CAS y límites del API.
- Evidencia exacta:
  - `npm run test:specs --workspace=web`: 107/107 specs, 157.2 s.
  - `npx tsc --noEmit -p apps/web/tsconfig.json`: exit 0, 128.3 s.
  - `npm run typecheck --workspace=axos-os-backend`: exit 0, 77.8 s.
  - Jest CAD API focal (`cad-document-validation` + `line-engineering.service`):
    2/2 suites, 52/52 tests, 29.1 s.
- Hallazgos: HATCH se publica pero se pierde al importar DXF; la consola no
  persiste historial y Escape puede cerrar el editor; el documento canónico se
  envía completo y está limitado a 8 MB aunque admite 100k entidades.
- Siguiente acción: Interaction Core sobre el command bus existente, después
  HATCH nativo y persistencia grande reutilizando el blob store documental.

### 2026-07-28 01:04–01:10 — Professional Interaction Core

- Commit: `40778d50` (`feat(cad): harden professional command interaction`).
- Vertical: interacción profesional.
- Cambios:
  - línea de comandos visible y enfocable desde la barra;
  - historial persistente de 50 entradas con navegación `↑`/`↓` y repetición
    segura con `Enter`/`Espacio`;
  - clave de almacenamiento segregada por tenant, usuario, building, project,
    modelo y revisión; sin previews geométricos persistidos;
  - auditoría por comando con estado, duración, fecha y objetos afectados;
  - `Ctrl/Cmd+S`, `F3` OSNAP, `F8` ORTHO y estado de guardado/conectividad/CAS;
  - `Escape` cancela preview/texto/dibujo/herramienta y después limpia selección,
    pero ya no cierra accidentalmente el editor.
- Evidencia exacta:
  - `npm run test:specs --workspace=web`: 108/108 specs, 116.4 s.
  - `npx tsc --noEmit -p apps/web/tsconfig.json`: exit 0, 31.8 s.
  - ESLint de los módulos nuevos de sesión: exit 0, cero warnings.
  - ESLint del conjunto tocado: exit 0; sólo reportó warnings históricos del
    editor monolítico, sin errores.
  - `git diff --check`: limpio.
- Riesgo/rollback: el historial es local, acotado y puede desactivarse borrando
  la clave `axos:cad:command-history:v1:*`; ninguna geometría canónica depende
  de él. Los atajos llaman las rutas de guardado/precisión existentes.
- Siguiente acción: cerrar HATCH nativo en runtime, propiedades y DXF sin crear
  un segundo motor geométrico.

### 2026-07-28 01:10–01:16 — Native HATCH end-to-end

- Commit: pendiente al cerrar este checkpoint.
- Vertical: documentación nativa y precisión P1.
- Cambios:
  - `HATCH` se añadió al registry/synchronizer/índice espacial canónicos;
  - render de patrón recortado, relleno SOLID real, huecos, hit-test, grips,
    snaps, bounds, propiedades, transform/copy/delete y undo/redo;
  - creación ANSI31 o SOLID desde contornos de assets seleccionados;
  - propiedades editables de patrón, sólido, escala, ángulo y capa;
  - parser ASCII de HATCH poligonal porque `dxf-parser` lo descarta;
  - export/import preservan sólido, patrón, escala, ángulo y varios contornos;
  - import DXF convierte HATCH a entidad canónica y export DXF consume la misma
    entidad, sin aplanarla a líneas persistidas.
- Evidencia exacta:
  - `npm run test:specs --workspace=web`: 108/108 specs, 119.6 s.
  - `npx tsc --noEmit -p apps/web/tsconfig.json`: exit 0, 36.2 s.
  - ESLint de runtime/Three/DXF/adaptadores tocados: exit 0, cero warnings.
  - Specs focales: runtime, renderer Three.js, bridge DXF y HATCH, 4/4 verdes.
  - `git diff --check`: limpio.
- Límite honesto: contornos DXF poligonales son lossless; edge paths curvos de
  HATCH todavía generan `hatch_edge_path_partial`/`hatch_unsupported_boundary`
  en vez de inventar geometría. DWG sigue requiriendo proveedor licenciado.
- Riesgo/rollback: la proyección Three es desechable; quitar el adapter HATCH
  vuelve al comportamiento previo sin migración de base. El documento v3 ya
  soportaba la entidad, por lo que no se añadió schema paralelo.
- Siguiente acción: eliminar el límite monolítico de 8 MB reutilizando el blob
  store documental con CAS y recuperación segura.

## Evidencia acumulada

Se completará con commits, comandos, resultados exactos, métricas, entorno,
riesgos, rollback, matrices antes/después y claims permitidos/prohibidos.
