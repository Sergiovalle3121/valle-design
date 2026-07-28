# CAD Professional Parity — Grand Leap IV

## Control de misión

| Campo | Valor |
| --- | --- |
| `MISSION_STARTED_AT` | 2026-07-28 12:08:49 -06:00 |
| `MISSION_TARGET_END` | 2026-07-28 22:08:49 -06:00 |
| `MISSION_CURRENT_PHASE` | P1-A — HATCH asociativo y regiones arbitrarias |
| `MISSION_COMPLETED_GATES` | viewport 100k; recovery worker/journal; blob GC bifásico y tenant-safe; selección profesional; precisión dinámica y tracking |
| `MISSION_NEXT_ACTION` | cerrar boundary/pick-point/islands/asociatividad/regeneración de HATCH con persistencia y round-trip |
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
| Precisión, input y snaps | 10 | 9 | `browser-proven` | dynamic input, snaps derivados, POLAR/ORTHO/OTRACK y tolerancia por zoom; falta preferencia persistida por usuario |
| Selección y modificación | 10 | 9 | `browser-proven` | controlador unificado, geometrías profesionales, cycling y quick select; falta stress E2E de trazos 100k |
| Entidades de documentación | 10 | 4 | `tested` parcial | HATCH poligonal nativo; MTEXT/DIM/MLEADER incompletos |
| Rendimiento 10k/100k | 15 | 10 | `browser-proven` parcial | viewport real, lotes cancelables y arnés 100k; aún no 60 FPS ni memoria estabilizada |
| Persistencia/recovery/versionado | 10 | 9 | `browser-proven` | worker/journal/cuota y lifecycle de blobs; falta delta journal nativo |
| Capas, bloques y referencias | 10 | 5 | `tested` parcial | capas/bloques presentes; xrefs parciales |
| Layouts, viewports y publicación | 10 | 6 | `tested` | paper space/PDF/recibos; UI multi-viewport parcial |
| Interoperabilidad/extensibilidad | 5 | 3 | `tested` | DXF semántico acotado; DWG `provider-required` |
| Calidad enterprise/seguridad/pruebas | 10 | 9 | `tested` | CI/tenant/brand/smokes verdes; falta arnés perf bloqueante |
| **Total** | **100** | **69** |  | Sin claim de paridad general |

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

### 2026-07-28 12:28–12:38 — P0-C / recovery durable

- Recovery v2 usa un Web Worker real para `JSON.stringify`, SHA-256, gzip,
  descompresión y parseo; el fallback cede el event loop y queda identificado.
- IndexedDB conserva un journal append-only de tres checkpoints por scope
  tenant/usuario/workspace/dibujo y hasta 24 globales; expira a siete días.
- Cada registro guarda Blob comprimido, tamaños, SHA, secuencia y encoder; no
  duplica el documento completo inline. La carga intenta de nuevo hacia atrás
  si el checkpoint más nuevo está vencido o corrupto.
- La cuota se estima, poda antes de escribir, reintenta una vez tras
  `QuotaExceededError` y muestra riesgo visible si persiste.
- Los checkpoints no se solapan; se disparan tras 3 s, cada 15 s, al ocultarse
  la pestaña y antes de descargar/cerrar. El último checkpoint de cierre
  también forma parte del journal.
- Chromium real: journal [2,3,4], `encoder=worker`, gzip, Blob sin documento
  inline, reload/restore de la última geometría y cuota del origen forzada a
  1 byte con aviso visible — 2/2 verde.
- Codec 7/7, scope isolation 2/2, TypeScript y lint focal verdes.

### 2026-07-28 12:38–12:44 — P0-D / lifecycle de blobs

- `DocumentBlobLifecycleService` inventaría referencias desde versiones PDF,
  assets del autor, documento CAD actual y snapshots CAD; toda consulta pasa
  por repositorios tenant-scoped estrictos.
- GC bifásico: blob viejo no referenciado se marca; sólo un barrido posterior,
  tras la gracia y una nueva comprobación, puede borrarlo. Una referencia o un
  `put` deduplicado limpia la marca.
- El primitivo directo `delete` del adaptador de base rechaza blobs sin marca
  de lifecycle; el endpoint operativo es dry-run por defecto y exige
  `confirm="collect-unreferenced-blobs"` para mutar.
- Migración agrega `gc_marked_at` e índice tenant/GC/edad. El resultado reporta
  escaneados, referenciados, recientes, marcados, borrados y bytes recuperados.
- El contrato `StreamingDocumentBlobStore` define `putStream/getStream` para un
  adaptador S3-compatible sin fingir que el adaptador DB actual hace streaming.
- Evidencia SQLite/Jest: referencias de cuatro consumidores preservadas,
  orphan marcado y luego eliminado, 512 bytes recuperados, tenant B aislado;
  2/2 lifecycle + 5/5 DocumentsService, API typecheck y lint focal verdes.

### 2026-07-28 12:44–12:58 — P0-E / selección profesional

- `selection-controller` mantiene selección actual/anterior/última y operaciones
  replace/add/remove/toggle sin acoplarlas a React ni a Three.js. `all` e
  `invert` operan contra el universo canónico completo.
- `Quick Select` combina tipo, capa, texto e inspección de propiedades para
  estaciones, activos y ARC/ELLIPSE/SPLINE/HATCH nativos.
- La paleta expone pick, window, crossing, polygon, fence y lasso; los tres
  trazos libres usan geometría real para contención/intersección. Window y
  crossing conservan semántica direccional en modo pick.
- Los point picks repetidos consultan hasta 16 candidatos del índice canónico y
  ciclan de forma determinista, incluso si la entidad está omitida del detalle
  por LOD. Selecciones mixtas ya no requieren dos estados mutuamente excluyentes.
- Evidencia: reducer/filtros/geometría e índice focales verdes; TypeScript verde;
  ESLint focal sin errores; Chromium completa quick → add → previous → last →
  all → invert en 10.1 s, 1/1 verde.

### 2026-07-28 12:58–13:14 — P0-F / precisión, snaps y tracking

- Entrada dinámica accesible y sin mutación hasta `Aplicar`: ABS, REL y POLAR;
  distancia/ángulo; radio/diámetro; offset; Tab entre campos, bloqueo,
  defaults, error inline, locale decimal y unidades mm/cm/m/in/ft.
- CIRCLE y OFFSET dejaron de ser estados internos inaccesibles: están en el
  dock/toolbar y tienen shortcuts C / Shift+O. CIRCLE consume centro exacto y
  radio o diámetro desde el mismo command reducer existente.
- OSNAP conserva endpoint/midpoint/center/node y cablea quadrant, intersection,
  apparent intersection, extension, perpendicular, tangent, nearest,
  insertion y geometric center. Curvas nativas aportan paths y semántica sin
  depender de su proyección detallada.
- La apertura de snap ahora representa 12 px en mundo y cambia con cámara/zoom;
  mantiene clamps de seguridad. Cada query espacial limita 48 entidades y 96
  segmentos derivados.
- POLAR configurable 15/30/45/90 y ORTHO se resuelven sobre el rubber-band;
  OTRACK conserva hasta ocho puntos OSNAP adquiridos, combina ejes X/Y, dibuja
  extension lines y permite limpiar el conjunto. Status bar y F10/F11 exponen
  estado y toggles.
- Benchmark Node sobre 100,000 ARC: query OSNAP profesional indexada p50 2.30 ms,
  p95 5.27 ms (gate <12 ms). Specs de snaps/input/tracking/shortcuts/toolbar,
  TypeScript y lint focal verdes. Chromium crea un círculo por centro absoluto,
  Tab, diámetro con unidad, lock de campo y toggles F10/F11: 1/1 verde.

## Claims

Permitido inicialmente: capacidades exactas demostradas en #1416 y documentos
anteriores. Prohibido: “100/100”, equivalencia general con AutoCAD, 60 FPS,
memoria no medida, DWG nativo o production-proven sin evidencia operativa.
