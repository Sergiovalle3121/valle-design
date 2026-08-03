# Matriz de brechas frente a AutoCAD 2027

Fecha de corte: 2026-08-02. AutoCAD 2027 se usa sólo como referencia de
categorías; no existe afiliación, certificación ni claim de paridad.

## Criterio

- **Completa:** UI, motor, persistencia, interoperabilidad y pruebas del límite
  relevante cumplen todos los criterios publicados para esa fila.
- **Parcial:** hay implementación real, pero falta al menos uno de esos límites,
  fidelidad, corpus, rendimiento o evidencia full-stack.
- **Ausente:** el repositorio no contiene una implementación comprobable.

Ninguna fila recibe “Completa” ni una puntuación 10/10 en este corte. Que un
golden, unit test o endpoint pase no compensa un criterio faltante. Si en el
futuro se usa una puntuación, deberá publicar denominador, criterios y evidencia
de cada punto; nunca se redondea a 10/10 mientras exista un gap.

## Capacidades

| Categoría                                                         | Estado      | Evidencia actual                                                                                      | Brecha que impide completarla                                                                                   | Prioridad                  |
| ----------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Dibujo 2D y precisión (línea, polilínea, círculo, arco)           | Parcial     | Herramientas, entrada dinámica, snaps/ortho y documento canónico; goldens 13, 26 y 28                 | Casos geométricos límite, fidelidad DXF por entidad y SLO interactivo profesional no están cerrados             | P0                         |
| Selección y modificación (grips, move/copy, fillet, trim, extend) | Parcial     | Controlador/índice de selección y goldens 12, 23 y 25                                                 | Falta estrés browser de trazos densos/100k y un corpus de degenerados con UX completa                           | P0                         |
| Capas y propiedades                                               | Parcial     | Capa canónica, panel y golden 24; mapa DXF probado                                                    | Propiedades/estilos DXF no cubren el universo del formato ni standards manager                                  | P0                         |
| Bloques y atributos                                               | Parcial     | Biblioteca, BLOCK/INSERT, XDATA histórica y golden 18                                                 | Atributos dinámicos, annotative behavior y round-trip amplio no están demostrados                               | P1                         |
| HATCH asociativo                                                  | Parcial     | Motor poligonal, associativity, DXF focal y golden 14                                                 | Boundaries curvas/islas complejas y corpus externo amplio pendientes                                            | P1                         |
| MTEXT                                                             | Parcial     | Entidad/layout y golden 15                                                                            | Fuentes, formato rico, códigos de control y fidelidad DXF parcial                                               | P1                         |
| Cotas asociativas                                                 | Parcial     | Entidad DIMENSION, XDATA y golden 16                                                                  | Cobertura de estilos/tipos y lectores externos no es universal                                                  | P1                         |
| MLEADER                                                           | Parcial     | Entidad canónica, XDATA y golden 17                                                                   | Estilos/contenido y degradación en otros lectores siguen abiertos                                               | P2                         |
| Modelo 3D/sólidos                                                 | Parcial     | Viewport Three.js y activos 3D en el editor                                                           | No hay modelador sólido B-rep, operaciones ACIS ni STEP/IGES/IFC                                                | P1                         |
| Layouts, viewports y publicación PDF                              | Parcial     | Paper spaces, publicaciones versionadas, jsPDF y golden 20                                            | Fidelidad de fuentes/plot, sheet sets y SLO de publicación no cerrados                                          | P1                         |
| Xrefs                                                             | Parcial     | Referencias en documento y golden 21                                                                  | Bind, resolución de recursos y round-trip universal no demostrados                                              | P1                         |
| Compare, comentarios y review links                               | Parcial     | Sesiones hash/TTL/revocación, comentarios, aislamiento API y golden 22                                | Carga concurrente, merge semántico amplio y recorrido de todos los roles pendientes                             | P0                         |
| Guardado CAS, autosave, historia y versiones                      | Parcial     | Cola single-writer, CAS 409, historia acotada, versiones, gzip/blob y E2E real de logout/reopen/>1 MB | Offline/multi-tab, recovery bajo cierre forzado y presupuesto/SLO de documentos extremos no cerrados            | P0                         |
| Importación de JSON canónico                                      | Parcial     | Web Worker, progreso/cancelación, límites, persistencia y E2E real                                    | Corpus hostil/fuzzing de navegador y UX de merge/reemplazo más amplia pendientes                                | P1                         |
| Import/export DXF de texto                                        | Parcial     | Parser/exportador TS, XDATA, loss manifest, goldens 27 y round-trip E2E real                          | Falta corpus autorizado diverso y fidelidad completa; el round-trip masivo no está demostrado                   | P0                         |
| Import/export DWG                                                 | **Ausente** | UI rechaza formato y ADR-0004 declara el límite                                                       | No hay parser/SDK/licencia/proveedor/corpus/pruebas                                                             | P0 si el producto lo exige |
| API y SDK de automatización                                       | Parcial     | OpenAPI `/v1`, SDK generado, byte gate y router gate                                                  | No hay consola, rate/load tests públicos ni política de extensiones de terceros                                 | P1                         |
| Asistencia NL→CAD/Vision→CAD                                      | Parcial     | Puerto CIDE opcional, validación/preview y specs deterministas                                        | Sin benchmark de calidad/modelo, evaluación adversarial ni garantía de disponibilidad                           | P2                         |
| Eventos e integración asíncrona                                   | Parcial     | Outbox transaccional, leases PG, retries/dead, webhook HMAC e idempotencia                            | Receptor/proveedor externo no vive aquí; falta evidencia operacional sostenida y replay auditado                | P1                         |
| Rendimiento 10k/100k                                              | Parcial     | Índices, LOD, selección fuera de viewport y spec Playwright con artefactos                            | Los umbrales son guardas de regresión amplias; no prueban 60 FPS, memoria estabilizada ni UX profesional a 100k | P0                         |
| Object storage S3                                                 | **Ausente** | Blob store BYTEA tenant-scoped en `design_blobs`                                                      | MinIO de Compose no está cableado; falta adapter, migración y operación                                         | P1                         |
| Kernel Rust/WASM                                                  | **Ausente** | Kernel TypeScript y ADR-0003                                                                          | No hay manifest/toolchain/paridad/fallback/benchmarks WASM                                                      | P2 condicionado            |
| Plugins AutoLISP/.NET/VBA                                         | **Ausente** | Ningún runtime o manifest                                                                             | Falta modelo de extensiones, sandbox y compatibilidad                                                           | P3                         |
| Nubes de puntos, raster georreferenciado y GIS                    | **Ausente** | Formatos y motores no aparecen en contratos/runtime                                                   | Sin LAS/LAZ/GeoTIFF/SHP, CRS, índices ni pruebas                                                                | P3                         |

## Benchmarks que sí existen

El último baseline Chromium versionado para el mismo spec reporta:

| Corpus   | Payload de apertura | Canónico listo | Detalle listo | Frame de control | Zoom/replan | Heap observado |
| -------- | ------------------: | -------------: | ------------: | ---------------: | ----------: | -------------: |
| 10k ARC  |     1,459,978 bytes |       1,141 ms |             — |           4.1 ms |           — |              — |
| 100k ARC |    14,690,028 bytes |       6,431 ms |     25,275 ms |          28.8 ms |   29,140 ms |         225 MB |

En 100k el LOD renderizó inicialmente 2,500 de 100,000 entidades visibles; tras
zoom había 68,200 visibles y 2,500 detalladas. Son números de una corrida local
registrada en `docs/product-split/STATE.md`, no una garantía para otra máquina.
No hay metadata suficiente para convertirlos en un SLA cross-browser.

El spec actual `apps/web/e2e/performance/cad-viewport-100k.spec.ts` guarda JSON
por corrida y exige, entre otros límites, canónico 10k <30 s; canónico 100k <60
s; detalle <90 s; frame <1 s; zoom <30 s; máximo 2,500 detalles iniciales y
10,000 tras zoom. Esos presupuestos detectan regresiones/crashes; un zoom de
29.14 s pasa el gate y sigue siendo una brecha P0 de experiencia.

El benchmark Node de OSNAP profesional usa 100,000 entidades, 200 consultas y
un gate p95 <12 ms. Una corrida versionada reportó p50 2.30 ms y p95 5.27 ms.
Eso mide query indexada, no latencia end-to-end del puntero, render o comando.

La CI configura proyectos Chromium y Firefox y ejecuta el recorrido full-stack
contra API/PostgreSQL real. Los números históricos anteriores son de Chromium;
un pass en ambos navegadores es gate de release, no evidencia de igualdad de
rendimiento entre ellos.

## Gaps P0 que bloquean claims superiores

1. Definir y cumplir SLO profesionales para apertura, interacción, zoom,
   guardado y memoria a 10k/100k con hardware y navegador documentados. El
   presupuesto actual de casi 30 s para zoom no es un objetivo de producto.
2. Ampliar selección/modificación/precisión con corpus de geometría degenerada
   y estrés browser denso, manteniendo CAS/autosave/undo/redo.
3. Construir un corpus DXF autorizado y diverso con matriz por entidad,
   round-trip y pérdidas aceptadas. No promover DXF por un único archivo feliz.
4. Cerrar recuperación offline, cierre forzado y edición multi-tab sin perder
   trabajo ni eludir conflictos; publicar límites de documento y memoria.
5. Si DWG es requisito comercial, seleccionar proveedor autorizado y completar
   el gate legal/seguridad/fidelidad de ADR-0004. Hasta entonces sigue ausente.
6. Mantener como gate bloqueante identidad→organización→trial→documento→CAS→
   logout/login/reset→aislamiento A/B→archivo grande→DXF con API y PostgreSQL
   reales en Chromium y Firefox, sin interceptar `/v1`.

## Regla de actualización

Toda promoción enlaza código, prueba y artefacto del límite relevante. No se
aceptan como única evidencia documentos de ejecución, mocks de toda la API,
tests unitarios o microbenchmarks. Una regresión baja el estado; no se relajan
umbrales ni se reescribe un golden sólo para conservar una etiqueta.
