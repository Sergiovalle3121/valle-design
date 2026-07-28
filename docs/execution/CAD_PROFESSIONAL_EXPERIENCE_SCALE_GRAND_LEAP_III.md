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

- Commit: `de59a1dc` (`feat(cad): make hatch native and DXF round-trip safe`).
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

### 2026-07-28 01:16–01:41 — Large Drawing Durability & Recovery

- Commit: `41e99718` (`feat(cad): scale persistence and add scoped recovery`).
- Vertical: persistencia grande y recuperación operativa.
- Cambios:
  - transporte automático multipart/gzip para `CadDocument` mayor a 6 MB;
  - presupuesto archivado de 128 MiB sin relajar el endpoint JSON de 8 MB;
  - manifiesto compacto content-addressed en `cad_document`, con SHA-256,
    tamaños comprimido/no comprimido y resumen de schema/versión/entidades;
  - reutilización de `DOCUMENT_BLOB_STORE` y su aislamiento tenant-scoped, sin
    crear otro blob store ni una tabla/migración paralela;
  - rehidratación transparente en lectura, publicación y restore, conservando
    el compare-and-swap SQL y los recibos de publicación server-managed;
  - snapshots guardan el manifiesto compacto en vez de duplicar el dibujo;
  - checkpoints IndexedDB a los 3 s y cada 15 s mientras hay cambios, segregados
    por tenant, usuario, building, project, modelo y revisión, con TTL de 7 días;
  - la UI sólo ofrece restaurar si el checkpoint conserva la misma versión CAS;
    un save exitoso lo elimina.
- Evidencia exacta:
  - integración API con documento de 8.1 MB: manifiesto persistido, documento
    completo hidratado y rechazo de la ruta JSON sin avanzar CAS;
  - Jest focal API: 3/3 suites, 57/57 tests, 17.06 s;
  - `npm run test:specs --workspace apps/web`: 110/110 specs, 119.3 s;
  - TypeScript API: exit 0, 22.8 s; TypeScript web: exit 0, 39.8 s;
  - ESLint API tocado: exit 0; web tocado: cero errores y sólo 19 warnings
    históricos del editor monolítico; módulos nuevos sin warnings;
  - `git diff --check`: limpio.
- Límites honestos: el adapter actual mantiene el límite comprimido de
  20 MiB y carga un blob por vez; el contrato permite sustituirlo por object
  storage streaming sin tocar el dominio. Una carrera CAS puede dejar un blob
  content-addressed no referenciado; no se inventó refcount/GC en este cambio.
- Riesgo/rollback: no hay migración nueva. Los documentos pequeños siguen inline;
  los grandes requieren que el lector de manifiestos permanezca desplegado. Un
  rollback de código no borra el blob, pero debe conservar/reponer este reader
  antes de volver a editar esos documentos.
- Siguiente acción: medir corpus 10k/100k y frame/memoria en Chromium real,
  después recorrer load→edit→save/reload→undo/redo→DXF/PDF.

### 2026-07-28 01:41–02:13 — Browser scale, LOD y save/reload real

- Commit: `45bbd470` (`feat(cad): keep 100k drawings responsive with explicit LOD`).
- Vertical: rendimiento y degradación controlada para dibujos grandes.
- Hallazgo reproducido antes del cambio: 100,000 ARC canónicos intentaban crear
  100,000 `Object3D`; el hilo principal dejó de responder y Chromium cerró la
  pestaña. Se registró como fallo en vez de declarar éxito por el benchmark de
  kernel.
- Cambios:
  - planificador puro y determinista para la proyección visual desechable;
  - hasta 10,000 entidades se proyectan completas; por encima de 50,000 se usa
    una muestra uniforme de 2,500 que siempre prioriza la selección activa;
  - la lista de entidades, serialización, edición, CAS, DXF y recuperación siguen
    usando el documento canónico completo;
  - la barra declara `LOD renderizadas/total` y la cantidad omitida, sin ocultar
    la degradación ni prometer fidelidad visual total a 100k.
- Evidencia Chromium real en build de desarrollo local, con instrumentación de
  DOM incluida en los tiempos (por tanto son límites superiores, no SLA):

| Corpus | Recorrido verificado | Resultado observado |
| --- | --- | --- |
| 10k ARC | load, command preview/execute, select, edit, undo, redo, save CAS | carga ≤19.93 s sin LOD; preview 2.04 s; execute 1.12 s; edit 3.99 s; undo 11.11 s; redo 10.00 s; save/re-render ≤45.46 s, CAS v1→v2 |
| 100k ARC | load LOD, 2D, select, edit, multipart/gzip save, reload, inspect geometry | carga respondiente ≤27.04 s; cambio 2D 0.84 s; edit 5.07 s; save/re-render ≤26.90 s, CAS v1→v2; reload respondiente ≤46.08 s; ARC persistió de 0°–90° a 15°–105° |

- Evidencia automatizada:
  - spec de 100k valida tamaño exacto, muestreo uniforme/determinista, unicidad,
    prioridad de selección, overflow de selección y ruta completa a 10k;
  - gate final web: 111/111 specs, 178.6 s; TypeScript exit 0, 69.3 s;
  - gate final API: TypeScript exit 0, 109.9 s; 3/3 suites y 57/57 tests,
    18.794 s de Jest;
  - ESLint focal: cero errores; 19 warnings históricos del editor monolítico;
  - `git diff --check`: limpio; worktree sin arnés/logs temporales;
  - el arnés HTTP separa corpus 10k/100k, aplica CAS y sólo descomprime la ruta
    `/layout/cad-archive`; el save 100k avanzó CAS y sobrevivió al reload.
- Límites honestos: `performance.memory` y `requestAnimationFrame` no estaban
  expuestos por el sandbox de automatización, por lo que no se inventa memoria
  ni frame time. A 100k la edición existe pero selección/reload siguen en decenas
  de segundos; las 97,500 entidades no detalladas no son pickables directamente
  hasta entrar en la muestra. El siguiente salto debe ser batching/viewport
  culling con selección respaldada por el índice espacial, no aumentar objetos.
- Riesgo/rollback: el LOD sólo afecta la proyección Three.js. Eliminar el
  planificador restaura el comportamiento anterior sin migrar datos, pero vuelve
  a exponer el crash de 100k. El umbral está centralizado y cubierto por spec.
- Siguiente acción: gates completos, revisión del diff/tenancy, commit, sincronía
  con `origin/main`, push y PR draft.

### 2026-07-28 02:13–02:18 — Hardening final

- Commits CAD: `40778d50`, `de59a1dc`, `41e99718` y `45bbd470`.
- `origin/main` permaneció en `06a35ff1` después del fetch final; no fue necesario
  rebase ni mezclar trabajo concurrente.
- Los listeners y pestañas del arnés se cerraron, y sus scripts/logs/sqlite se
  eliminaron de `work/`; no forman parte del diff.
- Resultado: cuatro verticales funcionales cerradas sobre la arquitectura
  existente, con gates verdes y límites operativos documentados.
- Siguiente acción: publicar la rama y abrir PR draft; no hacer auto-merge porque
  el merge a `main` despliega producción.

## Evidencia acumulada

| Capacidad | Antes | Después de esta rama |
| --- | --- | --- |
| Interacción | consola volátil; Escape podía cerrar | historial segregado/auditable, repetición y atajos profesionales |
| HATCH | se perdía al importar DXF | entidad nativa editable y round-trip poligonal |
| Persistencia >8 MB | rechazada por JSON | gzip/blob content-addressed hasta presupuesto de 128 MiB |
| Recuperación | sin checkpoint | IndexedDB segregado, TTL y guard CAS-compatible |
| Navegador 100k | cierre de pestaña | documento completo con LOD explícito y save/reload CAS |

Claims permitidos: los recorridos y límites exactos anteriores, DXF del
subconjunto soportado, persistencia/recovery multi-tenant conforme a los
contratos probados y degradación LOD explícita. Claims prohibidos: paridad DWG,
60 FPS/tiempo real a 100k, fidelidad visual simultánea de las 100k entidades,
memoria no medida o equivalencia general con AutoCAD.
