# CAD Professional Parity — Grand Leap IV

## Control de misión

| Campo | Valor |
| --- | --- |
| `MISSION_STARTED_AT` | 2026-07-28 12:08:49 -06:00 |
| `MISSION_TARGET_END` | 2026-07-28 22:08:49 -06:00 |
| `MISSION_CURRENT_PHASE` | P2-B — Xrefs |
| `MISSION_COMPLETED_GATES` | viewport 100k; recovery worker/journal; blob GC bifásico y tenant-safe; selección profesional; precisión dinámica y tracking; HATCH asociativo; MTEXT nativo; DIMENSION asociativa; MLEADER canónico; BLOCK/INSERT profesional; workbench profesional; layouts y publicación multi-viewport browser-proven |
| `MISSION_NEXT_ACTION` | cerrar el ciclo Xref tenant-safe: attach/overlay/reload/unload/detach/bind, hash/version/stale/missing, grafo/ciclos/profundidad, permisos y publish/DXF |
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
- HATCH, MTEXT, siete clases de DIMENSION y MLEADER son nativos; HATCH,
  DIMENSION y MLEADER son asociativos y regenerables, y sus ciclos de
  edición/publicación/DXF están demostrados.

## Rúbrica inicial de CAD 2D profesional

Sólo se conceden puntos por evidencia actual del repositorio y navegador.

| Área | Máximo | Inicial | Estado dominante | Evidencia / brecha |
| --- | ---: | ---: | --- | --- |
| Workbench y arquitectura | 10 | 8 | `browser-proven` parcial | docks sin overlay, workspace persistido, ribbon, status, command/search, temas/locale y matriz 1366–4K; monolito aún por encima de 9k líneas |
| Precisión, input y snaps | 10 | 10 | `browser-proven` | dynamic input, snaps derivados, POLAR/ORTHO/OTRACK, tolerancia por zoom y crosshair/pickbox/aperture persistidos por usuario |
| Selección y modificación | 10 | 9 | `browser-proven` | controlador unificado, geometrías profesionales, cycling y quick select; falta stress E2E de trazos 100k |
| Entidades de documentación | 10 | 10 | `browser-proven` | HATCH, MTEXT, siete DIM y MLEADER completan su ciclo canónico |
| Rendimiento 10k/100k | 15 | 10 | `browser-proven` parcial | viewport real, lotes cancelables y arnés 100k; aún no 60 FPS ni memoria estabilizada |
| Persistencia/recovery/versionado | 10 | 9 | `browser-proven` | worker/journal/cuota y lifecycle de blobs; falta delta journal nativo |
| Capas, bloques y referencias | 10 | 9 | `browser-proven` parcial | BLOCK/INSERT nativo, anidado, atribuible, tenant-safe e instanciado; xrefs aún parciales |
| Layouts, viewports y publicación | 10 | 9 | `browser-proven` | multi-viewport editable, freeze/overrides, page setup, orden, preflight, preview exacto, PDF multihoja y recibo auditado; el cajetín custom referenciado aún no sustituye su geometría en PDF |
| Interoperabilidad/extensibilidad | 5 | 4 | `browser-proven` parcial | BLOCK/INSERT, HATCH, MTEXT, DIM y MLEADER completan DXF semántico; DWG `provider-required` |
| Calidad enterprise/seguridad/pruebas | 10 | 9 | `tested` | CI/tenant/brand/smokes verdes; falta arnés perf bloqueante |
| **Total** | **100** | **87** |  | Sin claim de paridad general |

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

### 2026-07-28 13:14–13:29 — P1-A / HATCH asociativo

- Boundary builder cose segmentos abiertos con tolerancia, conserva ids fuente
  por loop y resuelve región por pick point con islas `normal`, `outer` e
  `ignore`; hit-test y render respetan la misma regla par-impar.
- HATCH creado desde una selección nativa conserva referencias a sus límites;
  los creados desde activos heredados quedan explícitamente `detached`. El
  command bus central regenera boundaries tras propiedades, grips o transforms
  de la fuente y marca `broken` si una referencia se abre o desaparece.
- La paleta expone ANSI31/SOLID, selección, pick point e islands. Pick point usa
  el índice espacial en dos pasos —punto y bounds del contorno exterior— en vez
  de recorrer las 100,000 entidades canónicas; el popover se cierra al crear.
- Origen de patrón, estilo de islas y estado de asociación viven en el documento
  canónico. DXF preserva origen/seed e island style; una importación DXF queda
  honestamente `detached` porque no se inventan handles fuente inexistentes.
- Evidencia: stitch/islands/regeneración, runtime, patrón y round-trip DXF verdes;
  TypeScript y ESLint focal verdes. Chromium crea ANSI31 sobre ELLIPSE, prueba
  detach/reattach, regenera al editar el eje, guarda y marca `broken` al borrar
  la fuente: 1/1 verde en 16.8 s.

### 2026-07-28 13:29–13:45 — P1-B / MTEXT nativo

- MTEXT entró al registry/command bus/índice espacial nativos con hit-test de su
  caja rotada, selección, snaps, grips de inserción/ancho/altura/rotación,
  transforms, propiedades, undo/redo y persistencia completa en `CadDocument`.
- Editor dentro del lienzo: contenido multilínea hasta 16 KiB, width, text
  height, rotación, nueve attachment points, alineación left/center/right/
  justify, estilo, familia con fallback, interlineado, bold/italic/underline,
  máscara con padding y hasta ocho columnas. El panel de propiedades usa
  `textarea`, por lo que no destruye saltos de línea.
- `mtext-layout` mide y envuelve texto sin DOM, con caché acotada de 4,096
  entradas apta para worker. El renderer usa CanvasTexture sólo como proyección
  desechable y mantiene la semántica en el documento; justify distribuye gaps.
- Publicación PDF conserva texto vectorial, alineación, max-width, énfasis,
  subrayado y máscara. DXF emite MTEXT real con chunks 1/3, attachment, STYLE,
  font fallback, line spacing, background y columnas 75/76/48/49; import raw
  reconstruye la entidad semántica y evita duplicarla como TEXT plano.
- Evidencia: layout/cache, runtime, paper-space y round-trip DXF verdes;
  TypeScript y ESLint focal verdes. Chromium crea, formatea, edita, undo/redo,
  guarda, recarga, descarga y reimporta el MTEXT: 1/1 verde en 16.7 s.
- Deuda visible: `Layout3DEditor.tsx` llegó a 9,445 líneas; la extracción por
  controladores/paneles sigue siendo un gate pendiente y no se oculta.

### 2026-07-28 13:45–14:04 — P1-C / DIMENSION asociativa

- Entidad canónica para linear, aligned, angular, radius, diameter, ordinate y
  arc length, con estilos, precisión 0–8, unidades/alternas, prefijo/sufijo,
  override, extension lines y cuatro arrowheads. Una sola geometría pura nutre
  render, hit-test, bounds, grips, propiedades, PDF vectorial y bloque DXF.
- Las referencias tipadas resuelven endpoints, centros, extremos de arco, ejes
  de elipse, controles de spline e inserciones. El command bus regenera después
  de propiedades/grips/transforms y marca `broken` si la fuente desaparece;
  detach/reassociate preserva las referencias sin aplanar la cota.
- LINE y CIRCLE entraron al registry nativo para que una edición real de la
  línea o círculo alimente el mismo ciclo asociativo. El sincronizador de escena
  recibe también todos los ids regenerados, evitando una vista obsoleta.
- DXF emite DIMENSION real con bloque anónimo `*D` compatible y XDATA registrada
  `AXOS_DIM`; el import reconoce esa semántica, evita duplicar la geometría del
  bloque y transforma escala/reflexión antes de crear una cota `detached`. Los
  siete tipos completan round-trip. PDF conserva paths, texto y orientación.
- Evidencia: geometría de siete tipos, asociación/broken, registry y round-trip
  DXF verdes; TypeScript y ESLint focal sin errores. Chromium crea la cota sobre
  LINE, prueba detach/reassociate, cambia 200→260, undo/redo, guarda, recarga,
  descarga/reimporta DXF y marca `broken` al borrar la fuente: 1/1 verde en
  24.1 s.
- Deuda visible: `Layout3DEditor.tsx` llegó a 9,549 líneas; la siguiente
  extracción por controladores/paneles continúa pendiente.

### 2026-07-28 14:04–14:19 — P1-D / MLEADER canónico

- MLEADER es una entidad única con múltiples líneas, tip/arrow, elbow, landing
  y dogleg; el mismo modelo conserva contenido Text/MTEXT, estilo tipográfico,
  máscara, alineación y cinco arrowheads. Registry, índice, selección unitaria,
  grips, snaps, propiedades, transforms y undo/redo operan sobre esa entidad.
- Cada línea puede asociarse mediante una referencia tipada. El command bus
  regenera los tips al editar una fuente y marca `broken` al eliminarla;
  detach/reassociate preserva la semántica y la UI expone el estado explícito.
- La migración sólo pliega la composición histórica DIM + dogleg + TEXT cuando
  los ids y la geometría la hacen inequívoca. Las composiciones ambiguas se
  conservan y reciben `legacy_mleader_ambiguous`, sin pérdida silenciosa.
- PDF conserva paths y texto vectorial. DXF emite MLEADER real con context,
  múltiples `LEADER_LINE` y XDATA `AXOS_MLEADER`; el import reconstruye líneas,
  contenido, formato y transformación como una entidad `detached` sin duplicar
  las primitivas internas.
- Evidencia: migración, geometría, asociación/broken, registry, paper-space y
  round-trip DXF verdes; TypeScript y ESLint focal sin errores. Chromium crea
  dos líneas asociadas, cambia arrow, detach/reassociate, edita contenido
  multilínea, prueba undo/redo, guarda/recarga, descarga/reimporta DXF y marca
  `broken` al borrar la fuente: 1/1 verde en 26.5 s.
- Deuda visible: `Layout3DEditor.tsx` queda en 9,465 líneas; se mantiene el gate
  explícito de extraer más controladores/paneles durante la misión.

### 2026-07-28 14:19–14:56 — P1-E / BLOCK e INSERT profesional

- `CadBlockDefinition` conserva base point, geometría canónica, ATTDEF completos,
  metadata, keywords, versión, thumbnail, alcance document/tenant y vínculo de
  negocio. INSERT sigue siendo una entidad única con matriz, capa, atributos y
  presentación; el resolver aplana sólo como proyección desechable.
- Anidación y ciclos se analizan con profundidad acotada. Transformaciones
  anisotrópicas conservan círculos como elipses y aproximan arcos cuando ya no
  pueden representarse exactamente; ByLayer y ByBlock se resuelven desde la
  instancia. Define, Insert, Redefine, Replace, Explode y Purge usan el mismo
  documento canónico, selección, propiedades, grips, undo/redo y guardado.
- La paleta busca nombre/keywords/negocio, genera thumbnail determinista y
  publica/recupera definiciones versionadas. La API valida payloads de hasta
  1 MB y 500 entidades, incrementa versión al redefinir y aplica scope tenant;
  migración agrega `definition` y `version` sin destruir la biblioteca legacy.
- DXF emite y recupera BLOCK/ENDBLK, INSERT, ATTDEF, ATTRIB/SEQEND y metadata
  AXOS, incluidas definiciones anidadas y valores por instancia. PDF conserva
  geometría/texto vectorial, posiciones/altura ATTDEF y herencia ByBlock bajo
  plot color o monocromo. La importación mantiene expansión compatible pero el
  editor omite duplicados cuando existe semántica INSERT.
- Repeticiones usan `InstancedBufferGeometry`: prueba estructural con 1,000
  símbolos confirma un buffer de dos vértices base, 1,000 matrices y un draw
  call por estilo. El índice canónico mantiene picks unitarios y la instancia
  seleccionada recibe overlay/grips sin desactivar el batch.
- Evidencia: runtime/índice/Three.js, definición/ciclos/operaciones, paper-space
  y round-trip DXF verdes; SQLite/Jest 2/2 tenant/search/version/validación;
  TypeScript y ESLint focal sin errores. Chromium define, publica tenant,
  inserta dos instancias, cambia transform/atributo, undo/redo, guarda/recarga,
  descarga/reimporta DXF y explota sólo la seleccionada: 1/1 en 26.4 s.
- La rúbrica sube 75 → 80 por bloques e interoperabilidad demostrados. No se
  concede el punto restante de capas/referencias porque Xrefs continúa parcial.
  Deuda visible: `Layout3DEditor.tsx` queda en 9,810 líneas; P1-F debe reducir
  acoplamiento y evitar panels que oculten el canvas.

### 2026-07-28 14:56–15:33 — P1-F / Workbench profesional

- Las cinco paletas profesionales (selección, HATCH, DIMENSION, MLEADER y
  BLOCK/XREF) dejaron de ser popovers absolutos: comparten un dock derecho de
  hasta 560 px que participa en el layout flex y nunca cubre el canvas. El dock
  de propiedades vuelve al cerrar la herramienta; el E2E de BLOCK fue adaptado
  a ese flujo explícito y su ciclo funcional permanece verde.
- `CadWorkspacePreferences` persiste por tenant/usuario perfiles drafting,
  review, presentation y focus; visibilidad de biblioteca/propiedades/command/
  minimapa; densidad; crosshair; pick box; apertura OSNAP; clic derecho y
  overrides de atajos. Parser, normalización, clamps y conflictos tienen spec.
- El motor usa esos valores, no sólo controles: apertura y pick tolerance se
  convierten de píxeles a mundo según zoom; el crosshair DOM sigue al pointer
  sin estado React por frame; shortcuts personalizados alimentan el dispatcher
  real; clic derecho ofrece menú contextual o Enter/repeat configurables.
- Ribbon horizontal de 48 px sin wrap ni scrollbar visible, cierre sticky,
  command line/search accesibles, status bar, Model/Layout tabs y focus visible.
  Tema claro cambia canvas/cinta y conserva docks técnicos oscuros de alto
  contraste; tema oscuro, inglés/español y DPR 2 se verificaron en navegador.
- Evidencia Chromium: 1366×768, 1440×900, 1920×1080, 2560×1440 y 3840×2160,
  persistencia/reload, Q→LINE, context menu, medidas 14/18 px, docking sin
  solape, perfiles y screenshots claro/oscuro EN/ES: 1/1 verde en 3.0 min.
  Regresión CAD 12–18: 7/7 verde; spec workspace, TypeScript y diff-check
  verdes; ESLint focal 0 errores.
- La rúbrica sube 80 → 84. No se conceden los dos puntos restantes de
  arquitectura: `Layout3DEditor.tsx` queda en 9,833 líneas y todavía requiere
  extraer viewport/status/properties. El siguiente bloque es P2-A.

### 2026-07-28 15:33–16:02 — P2-A / Layouts y múltiples viewports

- `CadLayoutManager` extrae la superficie de papel y ofrece create, activate,
  drag-move, grip-resize, lock, duplicate y delete sobre los `CadPaperViewport`
  canónicos. `cad-layout-manager` centraliza normalización contra márgenes,
  escala fit, freeze/override por capa y preflight de área, escala, lock,
  solapes y todas las capas congeladas; no crea otro documento ni command bus.
- Cada viewport conserva bounds de papel/modelo, escala estándar o custom,
  escala anotativa, vista nombrada, visibilidad y color/linetype/lineweight por
  capa. Las capas proceden del `CadDocument` real y sobreviven undo/redo,
  recovery, guardado y reload. Cambiar papel, orientación o márgenes normaliza
  todos los viewports, no sólo el primario.
- Page setup expone A0–A4, Letter/Tabloid, orientación, cuatro márgenes, modo de
  color y factor de lineweight. El cajetín conserva campos/numeración y una
  referencia de biblioteca; las hojas se incluyen/excluyen y reordenan por
  drag/drop o botones. La geometría custom del bloque aún no reemplaza el
  cajetín vectorial estándar en el PDF, por lo que no se concede 10/10.
- El preview exacto consume `buildCadPublishPlan`, la misma fuente vectorial que
  el publicador: clipping rectangular por viewport, escalas y overrides. El
  flujo probado guarda, recarga, publica tres hojas en un PDF, calcula SHA-256
  y registra el recibo CAS antes de descargar.
- Evidencia: specs `cad-layout-manager` y `paper-space`, TypeScript, diff-check y
  ESLint focal verdes. Chromium #20 edita dos viewports, mueve/redimensiona,
  congela `CURVES`, aplica override, bloquea, preflight/preview, reordena tres
  hojas, guarda/recarga y publica/audita PDF: 1/1 en 30.4 s. Regresión CAD
  #12–#20: 9/9 verde en 5.9 min; captura visual inspeccionada.
- La rúbrica sube 84 → 87. `Layout3DEditor.tsx` queda en 10,125 líneas pese a
  extraer 162 líneas de UI y 146 de lógica pura: el wiring añadido vuelve a
  evidenciar la deuda arquitectónica y no se oculta. El siguiente bloque es
  P2-B, Xrefs tenant-safe.

## Claims

Permitido inicialmente: capacidades exactas demostradas en #1416 y documentos
anteriores. Prohibido: “100/100”, equivalencia general con AutoCAD, 60 FPS,
memoria no medida, DWG nativo o production-proven sin evidencia operativa.
