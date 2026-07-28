# CAD Professional Parity — Grand Leap IV

## Control de misión

| Campo | Valor |
| --- | --- |
| `MISSION_STARTED_AT` | 2026-07-28 12:08:49 -06:00 |
| `MISSION_TARGET_END` | 2026-07-28 22:08:49 -06:00 |
| `MISSION_CURRENT_PHASE` | P0-C — recovery, compresión y cuotas fuera del hilo principal |
| `MISSION_COMPLETED_GATES` | dock extraído; render dirigido por viewport y progresivo; Chromium 100k verde |
| `MISSION_NEXT_ACTION` | mover serialización/compresión de recovery a worker y probar IndexedDB/cuota real |
| Repositorio | `Sergiovalle3121/axos-os` |
| Base | `1625ba26a07876943b821586c46b02c9f47f6bac` (`origin/main`) |
| Rama / PR | `codex/cad-professional-grand-leap-iii` / #1416 |
| Head inicial | `8c840c92c529888de3e72e6cbcef41bff18d79a5` |
| Worktree | `D:\Codex\Projects\axos-os-cad-grand-leap-iii` |

La misión continúa desde el HEAD exacto de #1416 porque el PR sigue abierto. El
worktree histórico de IA permanece intacto. La instrucción directa más reciente
del propietario pide integrar al final todos los PRs abiertos; se hará como
squash merge manual, nunca automerge, sólo tras verificar head SHA, CI,
revisiones y mergeabilidad inmediatamente antes de cada merge.

## Baseline autoritativo

- `Layout3DEditor.tsx`: 8,761 líneas.
- Fuente canónica: `CadDocument` v3.
- Un solo command bus, registry de entidades e índice espacial canónico.
- #1416 añadió point/window/OSNAP sobre las 100,000 entidades y materialización
  bajo demanda; por tanto la brecha “97,500 no seleccionables” ya está cerrada.
- La proyección detallada aún usa una muestra uniforme fija de 2,500 por encima
  de 50,000; no consulta el viewport visible.
- El overview completo usa un `LineSegments`, slots fijos y un draw call, con
  geometría simplificada de hasta ocho segmentos por entidad.
- Recovery aún serializa snapshots completos periódicos desde el hilo principal.
- El blob store conserva una frontera reutilizable, pero carece de lifecycle/GC
  y su adaptador de base carga blobs completos.
- HATCH poligonal es nativo y round-trip; asociatividad/pick-point arbitrario y
  varios ciclos de documentación siguen incompletos.

## Rúbrica inicial de CAD 2D profesional

Sólo se conceden puntos por evidencia actual del repositorio y navegador.

| Área | Máximo | Inicial | Estado dominante | Evidencia / brecha |
| --- | ---: | ---: | --- | --- |
| Workbench y arquitectura | 10 | 5 | `tested` parcial | dock aislado; editor aún monolítico y por encima de 8k líneas |
| Precisión, input y snaps | 10 | 5 | `tested` | coordenadas/OSNAP base; falta dynamic input y tracking completo |
| Selección y modificación | 10 | 5 | `browser-proven` parcial | pick/window canónico; faltan fence/lasso/cycling/quick select |
| Entidades de documentación | 10 | 4 | `tested` parcial | HATCH poligonal nativo; MTEXT/DIM/MLEADER incompletos |
| Rendimiento 10k/100k | 15 | 10 | `browser-proven` parcial | viewport real, lotes cancelables y arnés 100k; aún no 60 FPS ni memoria estabilizada |
| Persistencia/recovery/versionado | 10 | 6 | `tested` | gzip/blob/CAS/recovery; snapshot pesado y lifecycle incompleto |
| Capas, bloques y referencias | 10 | 5 | `tested` parcial | capas/bloques presentes; xrefs parciales |
| Layouts, viewports y publicación | 10 | 6 | `tested` | paper space/PDF/recibos; UI multi-viewport parcial |
| Interoperabilidad/extensibilidad | 5 | 3 | `tested` | DXF semántico acotado; DWG `provider-required` |
| Calidad enterprise/seguridad/pruebas | 10 | 9 | `tested` | CI/tenant/brand/smokes verdes; falta arnés perf bloqueante |
| **Total** | **100** | **58** |  | Sin claim de paridad general |

## Paridad completa separada

No entra en la puntuación 2D anterior: modelado 3D paramétrico, superficies,
render fotorrealista, siete toolsets verticales, ecosistema de complementos,
RealDWG u otras tecnologías propietarias. Esas áreas permanecen
`missing` o `provider-required` y no se usarán como claim comercial.

## Ledger inicial de integración

| PR | Área | Estado inicial | Regla de salida |
| ---: | --- | --- | --- |
| #1417 | comercial | draft, mergeable | revisar CI/head y squash manual al final |
| #1416 | CAD | draft, mergeable, CI verde | actualizar con Grand Leap IV, gates y squash manual |
| #1402 | ERP | ready, no mergeable | actualizar sobre main sin perder trabajo; CI verde |
| #1398 | PDF | draft, no mergeable | actualizar sobre main sin perder trabajo; CI verde |

No se editan ramas comerciales, ERP o PDF durante la construcción CAD.

## Checkpoints

### 2026-07-28 12:08–12:15 — Reanudación

- GitHub: cuatro PRs abiertos inventariados; #1416 sigue en
  `8c840c92`, mergeable y con CI verde.
- Git: head local/remoto idénticos; `origin/main=1625ba26`; worktree limpio.
- Reglas: `AGENTS.md`, guía web/Next y arquitectura/ejecuciones CAD leídas.
- Decisión: continuar en la rama/PR existente, medir antes de optimizar y
  comenzar por una extracción que habilite selección/render sin duplicación.
- Siguiente: baseline focal, benchmark y primera extracción P0-A.

### 2026-07-28 12:15–12:16 — P0-A / primer corte

- `CadCommandDock` separa UI, preview, sugerencias, IA e historial del editor;
  el componente padre conserva las mutaciones y el command bus existentes.
- `describeCadPreviewOperation` cubre todas las variantes del contrato y evita
  previews vacíos para guardar, exportar, vistas e historial.
- `Layout3DEditor.tsx`: 8,761 → 8,682 líneas, sin mover lógica a ciegas.
- Evidencia: prueba focal 4/4; `tsc --noEmit` verde; ESLint 0 errores y 19
  advertencias heredadas del monolito; `git diff --check` verde.
- Baseline medido: escena inicial 100k 858.8 ms; índice 100k 236.0 ms;
  hit-test p95 0.221 ms; overview 274.9 ms, 19.2 MB y un draw call.

### 2026-07-28 12:16–12:28 — P0-B / viewport y progresividad

- El detalle ya consulta el índice canónico con bounds derivados de la cámara;
  la selección conserva prioridad aunque quede fuera del viewport.
- Los viewports densos mantienen un máximo de 2,500 objetos detallados; al
  acercarse, el presupuesto puede materializar hasta 10,000 visibles.
- `CadSceneSynchronizer.syncProgressive` preserva proyecciones compartidas,
  elimina las obsoletas de inmediato y crea/actualiza en lotes cancelables de
  160 para ceder el hilo entre lotes.
- Hallazgo del gate: las consultas espaciales de más de 4,096 celdas devolvían
  vacío. Se corrigió con full scan acotado y regresión, sin alterar el guard de
  overflow usado para entidades gigantes.
- Chromium real, corpus 100,000 ARC / payload 14,690,240 bytes: canónico listo
  11,466 ms; detalle listo 27,186 ms; frame de control 85.2 ms; zoom/replan
  27,735 ms; visibles 100,000 → 72,500; detalle 2,500 en ambos niveles.
- Gate: `CAD_PERF_E2E=1 npx playwright test
  e2e/performance/cad-viewport-100k.spec.ts --project=chromium` — 1/1 verde.
- Specs focales: viewport 5/5, sync progresivo 9/9, runtime/selección/render
  verdes; TypeScript y lint focal verdes.

## Claims

Permitido inicialmente: capacidades exactas demostradas en #1416 y documentos
anteriores. Prohibido: “100/100”, equivalencia general con AutoCAD, 60 FPS,
memoria no medida, DWG nativo o production-proven sin evidencia operativa.
