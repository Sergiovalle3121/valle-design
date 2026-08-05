# Valle Design CAD native core — ejecución y evidencia

> Corte P0 de entidades nativas y confiabilidad. Este documento registra lo
> que está conectado al producto y distingue la evidencia de kernel de la
> evidencia interactiva; no declara paridad CAD general ni compatibilidad DWG.

## Estado operativo

| Campo | Valor |
| --- | --- |
| Base | `3529ce2ff2f31c78509f97ea7e361ea030dd90ce` (`origin/main`) |
| Rama | `agent/valle-cad-native-core` |
| Superficies | Next.js/Three.js, NestJS/TypeORM, DXF, Playwright |
| Fuente de verdad | `CadDocument` v3 |
| Entidades P0 | `ARC`, `ELLIPSE`, `SPLINE` |
| Publicación | PR con gates verdes; squash merge por instrucción directa del owner |

## Resultado funcional

Las tres entidades P0 dejan de ser sólo datos preservados o segmentos
teselados. El editor proyecta directamente el `CadDocument` a Three.js y ofrece:

- render desechable, bounds, hit-test puntual y selección por ventana;
- grips editables y OSNAP de centro, extremos, cuadrantes, control y tangencia
  donde aplica;
- propiedades numéricas, mover, rotar, escalar, copiar y borrar;
- un único checkpoint de undo/redo por comando y por arrastre de grip;
- IDs, capa, contexto y `businessLink` conservados por transformaciones/copias;
- importación y exportación DXF semántica sin persistir polilíneas aproximadas;
- guardado, recarga y restauración desde el documento canónico.

La teselación existe únicamente en la proyección visual/hit-test. No sustituye
la geometría canónica.

## Contratos añadidos

El registry de entidades expone contratos explícitos para renderer, hit-test,
grips, snaps, propiedades, bounds y comandos. `CadSceneSynchronizer` mantiene
una proyección por ID y un índice espacial uniforme incremental:

- `sync(document, sink)` reconcilia una carga, undo/redo o recuperación completa;
- `applyPatch({ upsert, remove }, sink)` actualiza sólo el delta conocido de un
  comando o pointermove;
- el índice limita entidades de bounds extremos mediante un conjunto overflow
  para evitar explosión de buckets.

El editor usa parches incrementales en comandos nativos y arrastre de grips.
Carga, undo y redo conservan la reconciliación completa como ruta segura.

## Persistencia y concurrencia

El guardado canónico requiere `expectedCadDocumentVersion`. La API ejecuta un
único `UPDATE` condicionado por:

- `id`;
- `tenant_id`;
- `plant_id`;
- `deleted_at IS NULL`;
- `cad_document_version = expected`.

El mismo compare-and-swap escribe el documento, incrementa la revisión SQL y
aplica las proyecciones compatibles. Por ello un escritor perdedor no puede
sobrescribir ni el documento ni sus campos laterales. Un `affected !== 1`
produce `409 cad_document_version_conflict` con revisiones esperada y actual.

El evento `SF_CAD_DOCUMENT_REVISION_SAVED` registra modelo, revisión base,
revisión resultante y número de entidades. No copia el payload completo al
audit log.

## Interoperabilidad P0

| Entidad | Import DXF | Export DXF | Round-trip semántico | Edición nativa |
| --- | ---: | ---: | ---: | ---: |
| ARC | sí | sí | sí | sí |
| ELLIPSE | sí | sí | sí | sí |
| SPLINE | sí | sí | sí | sí |

Las pruebas cubren reflexión/orientación, capas, parámetros de elipse, grado,
nudos y puntos de control. El E2E exporta el dibujo editado, lo reimporta con el
parser real y verifica invariantes geométricas.

## Benchmark determinista

Corrida local Node, 2026-07-25. Es evidencia del índice y sincronizador, no un
SLA de frames del navegador.

| Entidades | Construcción índice | Query p50 | Query p95 |
| ---: | ---: | ---: | ---: |
| 1,000 | 9.02 ms | 0.057 ms | 0.162 ms |
| 10,000 | 44.23 ms | 0.196 ms | 0.368 ms |
| 100,000 | 436.36 ms | 0.671 ms | 0.988 ms |

Para 100,000 entidades, la proyección inicial desechable tardó 1,715.08 ms y
un parche de 100 entidades 3.17 ms. El harness se ejecuta dentro de los specs
web para detectar regresiones estructurales; no fija umbrales dependientes del
hardware.

## Evidencia

| Gate | Resultado |
| --- | --- |
| Web TypeScript | verde |
| API TypeScript | verde |
| Build Next.js / NestJS | verde / verde |
| Lint web / API focal | 0 errores, 25 warnings baseline / verde |
| Web specs | 103/103 |
| Line Engineering API | 46/46 |
| Playwright Chromium P0 | 2/2 |
| Tenant safety | 40/40; inventario 1,001/1,001 |
| Capability registry | 21 capacidades, verde |
| Carrera concurrente | un writer exitoso, un `409`, revisión final única |
| E2E round-trip | editar → undo/redo → guardar → recargar → DXF → reimportar |

El E2E usa la aplicación Next real y Chromium real, con una frontera HTTP
stateful controlada para hacer determinista la sesión. La semántica SQL se
verifica por separado en la suite de integración del servicio.

## Brechas siguientes

1. Medir primer render, memoria, pan/zoom y frame p95 en navegador con datasets
   de 10K/100K; el benchmark actual no autoriza prometer 60 fps.
2. Llevar el pipeline nativo a las entidades P1 (`HATCH`, `INSERT`, `MTEXT`,
   `DIMENSION` y `MLEADER`) y eliminar más colecciones históricas del editor.
3. Añadir selección avanzada y snaps derivados entre entidades (intersección,
   perpendicular y nearest) sobre el índice común.
4. Resolver el límite actual de payload de persistencia para dibujos cuyo
   documento serializado supere 8 MB.
5. Ejecutar una prueba de carrera PostgreSQL en CI además de la integración
   TypeORM local.

Estas brechas permanecen abiertas de forma explícita; no hay UI simulada ni
claims de soporte que no estén conectados a producto y pruebas.
