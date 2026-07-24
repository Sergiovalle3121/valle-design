# AXOS CAD Grand Leap — ejecución y evidencia

> Tracker verificable del corte `CAD-GL-000/010/020/030/050/070`. El referente
> competitivo es interno; no se declara paridad total ni compatibilidad DWG.

## 0. Estado operativo

| Campo                   | Evidencia                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `origin/main` resuelto  | `74546077b9675dcfc26ad718b63a4a59cf5c83cc`                                                                    |
| Mensaje base            | `feat(enterprise): build AXOS ERP + MES commercialization program (#1375)`                                    |
| Rama                    | `feat/axos-cad-grand-leap`, creada desde ese SHA                                                              |
| Worktree                | limpio al iniciar; cambios de este programa aislados en `work/axos-os`                                        |
| PRs abiertos al iniciar | ninguno                                                                                                       |
| Cambios CAD observados  | `b23c154d7a91f0b0595758bb416fd4e5fb2e61d2` ya era ancestro de `main`                                          |
| Cambio PDF observado    | `0ef433cfa6396a9ee0e13320dbf1d9af8eb948e3` ya era ancestro de `main`                                          |
| Ramas CAD antiguas      | inspeccionadas como referencias; no se continuó ninguna rama obsoleta                                         |
| Identidad               | no se fabricó autor local; la publicación usa el actor autenticado del repositorio                            |
| Política de entrega     | PR, gate `Build · Test · Lint · Smoke`, squash merge manual autorizado por la petición más reciente del owner |

Instrucciones leídas: `AGENTS.md`, `CONTRIBUTING.md`,
`apps/web/AGENTS.md`, `DECISIONS.md`, ADRs y trackers de ejecución/roadmap
aplicables. También se leyeron las guías locales de Next 16 para Client
Components antes de cerrar el cambio del editor.

## 1. Runtime y fuentes de verdad

| Superficie    | Implementación real                              | Papel en este corte                               |
| ------------- | ------------------------------------------------ | ------------------------------------------------- |
| Web           | Next.js 16, React 19, Three.js                   | editor interactivo y proyección visual            |
| API           | NestJS 11, TypeORM, PostgreSQL/SQLite en pruebas | persistencia tenant-scoped y control de versión   |
| Documento     | `lib/cad/cad-document.ts`                        | fuente canónica versionada                        |
| Editor legado | refs de assets/stations/annotations/connectors   | proyección mutable transitoria del documento      |
| Comandos      | registry + parser + preview/execute              | cambio tipado y previsualizable                   |
| Undo/redo     | snapshots de `CadDocument`                       | rollback local y restauración                     |
| Reglas        | `rule-engine.ts`                                 | revisión determinista sobre documento             |
| Interop       | proveedores/adaptadores DXF/PDF existentes       | salida real; DWG sigue siendo placeholder honesto |

La duplicidad que permanece es explícita: `Layout3DEditor` todavía manipula
colecciones históricas para render y selección, pero al cargar, guardar,
deshacer y rehacer éstas se proyectan desde/hacia un único `CadDocument`. El
backend persiste el documento canónico además de las colecciones antiguas para
mantener compatibilidad. No se creó un segundo undo, sistema de capas o bus.

## 2. Auditoría de callers

Escaneo heurístico 2026-07-24: módulos `apps/web/src/lib/cad/*.ts`, excluyendo
specs y barrel, y referencias de producción por nombre. Los módulos modificados
en este corte (`cad-document`, `live-constraints`, `geometry-cleanup`,
`rule-engine`, `perf-baseline`) tienen caller de producto o gate explícito.

Módulos sin caller de producto detectado (pueden tener specs o exportación por
barrel): `copilot-contract`, `divide-measure`, `geom-trim`,
`line-balance-assignment`, `line-balance-metrics`, `perf-baseline`,
`polar-tracking`, `polygon-room`, `primitive-edit`, `unit-format`.
`perf-baseline` es deliberadamente un harness; los demás no se marcan como
terminados por existir en kernel.

## 3. CadDocument v3

### 3.1 Matriz de entidades

| Entidad/tabla                         |     Modelo v3 |       Proyección editor histórica | Persistencia/reload | Observación                                                                      |
| ------------------------------------- | ------------: | --------------------------------: | ------------------: | -------------------------------------------------------------------------------- |
| box / station                         |            sí |                                sí |                  sí | compatibilidad v1/v2                                                             |
| text / dimension / connector          |            sí |                                sí |                  sí | proyección existente                                                             |
| line / polyline                       |            sí |                        no general |                  sí | solver cubre `line`; renderer general pendiente                                  |
| circle                                |            sí |            círculos históricos sí |                  sí | círculo histórico se promueve con adaptador reversible                           |
| arc / ellipse / spline                |            sí |                        no general |                  sí | kernel/interop existentes, sin edición v3 completa                               |
| mtext / hatch / mleader               |            sí |                        no general |                  sí | primera clase en schema; adapters DXF completos pendientes                       |
| blockDefinition / insert / attributes |            sí | inserciones históricas son copias |                  sí | definición canónica preservada                                                   |
| ModelSpace                            |            sí |                          derivado |                  sí | IDs estables                                                                     |
| PaperSpaces                           |       base v3 |                                no |                  sí | layout/viewports todavía pendientes                                              |
| layers / style tables                 |            sí |        capas históricas parciales |                  sí | capas arbitrarias en documento; UI conserva unión histórica                      |
| constraint graph                      |            sí |                 muros/line subset |                  sí | solver vivo incremental                                                          |
| xrefs                                 | contrato base |                                no |                  sí | resolución/recarga/ciclos pendientes                                             |
| opaque entities / loss manifest       |            sí |                       no editable |                  sí | evita pérdida silenciosa dentro del documento                                    |
| contexto                              |            sí |                           parcial |                  sí | ByLayer/ByBlock/explicit, handle, Z/normal, metadata, provenance y business link |

La migración v1/v2→v3 es aditiva y determinista. Los adaptadores históricos se
mantienen. La serialización ordena entidades, capas, bloques y restricciones;
rechaza valores no finitos e IDs duplicados.

### 3.2 Persistencia y pérdida al reload

| Dato                         | Guarda | Recarga | Pérdida conocida                                           |
| ---------------------------- | -----: | ------: | ---------------------------------------------------------- |
| geometría histórica          |     sí |      sí | ninguna en golden round-trip                               |
| tags por asset               |     sí |      sí | corregido en este corte                                    |
| entidades v3 no proyectables |     sí |      sí | no se renderizan/editan todavía; no se eliminan al guardar |
| estilos/bloques/xrefs        |     sí |      sí | kernel-only para varias operaciones                        |
| constraints                  |     sí |      sí | propagación limitada a muro/line                           |
| opaque payload/loss manifest |     sí |      sí | no editable                                                |
| revisión de servidor         |     sí |      sí | token entero; escritura stale responde `409`               |

La API valida tamaño (8 MB), profundidad, números finitos, schema, cardinalidad
e IDs antes de persistir. La migración agrega `cad_document` y
`cad_document_version`. Snapshots/restores incluyen el documento.

## 4. Bus, transacciones, IA y undo

`cleanup_geometry` entra al registry único y por ello alimenta parser,
command-line, paleta, preview, execute e historial. Detecta de forma
determinista duplicados, muros casi ortogonales y segmentos muy cortos; la
eliminación de segmentos pequeños requiere una opción explícita.

La materialización del editor ahora:

1. calcula el preview sin mutar;
2. pre-valida referencias y locks;
3. toma un solo snapshot por comando/cadena;
4. aplica el change set completo;
5. ejecuta restricciones persistentes;
6. revierte al checkpoint si una operación falla o el solver no converge;
7. deja un único paso de undo/redo.

El copiloto declara `cleanupGeometry` con schema validado. Antes de aplicar, la
UI muestra resumen y evidencia calculados por el mismo command registry. La
salida del modelo no toca geometría directamente: se normaliza a intentos, se
convierte a comandos/operaciones y toda la propuesta se confirma o revierte
como una transacción.

| Entrada                        | Registry/operaciones comunes |           Preview |           Atómica | Undo |
| ------------------------------ | ---------------------------: | ----------------: | ----------------: | ---: |
| command line/paleta            |                           sí |                sí |                sí |   sí |
| toolbar/propiedades históricas |                      parcial | según herramienta |           parcial |   sí |
| copiloto cleanup               |                           sí | sí, con evidencia | sí, por propuesta |   sí |
| otros intents IA históricos    |          operaciones comunes |       explicación | sí, por propuesta |   sí |

## 5. Restricciones vivas

Cobertura del solver incremental: horizontal, vertical, distancia, ángulo,
paralelo, perpendicular, igual longitud, colineal y coincidente para líneas y
muros históricos. Las rotaciones del editor se normalizan correctamente en
grados.

Propiedades demostradas:

- grafo persistido en `CadDocument`;
- edición de la referencia propaga al dependiente;
- iteraciones y tolerancia acotadas;
- geometría degenerada falla cerrada;
- conflicto horizontal+vertical se clasifica `over_constrained`;
- estado `under_constrained`, `fully_constrained`, `over_constrained` o
  `inconsistent`;
- no convergencia devuelve el documento original;
- drag, comandos y propuesta IA llaman el mismo solver.

Límites honestos: no cubre tangencia, radio/diámetro ni un sistema algebraico
general; la heurística de “fully constrained” es del subconjunto, no una prueba
de grados de libertad globales.

## 6. Interoperabilidad

| Elemento DXF                    |           Import actual |           Export actual |              v3 round-trip de este corte | Pérdida/deuda                                |
| ------------------------------- | ----------------------: | ----------------------: | ---------------------------------------: | -------------------------------------------- |
| LINE / LWPOLYLINE               |                      sí |                      sí | modelo listo; adapter integral pendiente | propiedades avanzadas parciales              |
| CIRCLE / ARC / ELLIPSE / SPLINE |              sí/parcial |                      sí |             círculo histórico verificado | estilos/contexto parciales                   |
| TEXT / MTEXT                    |              sí/parcial |              sí/parcial |                          schema v3 listo | MTEXT integral pendiente                     |
| DIMENSION                       |                 parcial |                      sí |                          schema v3 listo | estilos/import incompletos                   |
| HATCH                           | parser informa descarte |        sólido de salida |                                       no | debe conservarse opaco en el próximo adapter |
| BLOCK / INSERT / atributos      |                 parcial |                      sí |                          schema v3 listo | round-trip completo pendiente                |
| MLEADER                         |                simulado |              primitivas |                                       no | entidad v3 existe; adapter real pendiente    |
| capas                           |             sí, parcial |                      sí |                       persistencia v3 sí | UI histórica sigue unión cerrada             |
| paper space/layouts             |              no general | PDF vectorial existente |                                       no | pendiente                                    |
| desconocida                     |             no editable |                      no |               passthrough canónico listo | ingestión desde parser pendiente             |
| DWG                             |                      no |                      no |                                       no | requiere proveedor legal/licenciado          |

Este corte no declara `CAD-GL-040` terminado: fortalece el modelo de fidelidad y
passthrough, pero no reemplaza el parser ni fabrica soporte DWG.

## 7. Scorecard sin porcentajes

### Paridad profesional

| Eje                | Estado            | Evidencia / siguiente brecha                                        |
| ------------------ | ----------------- | ------------------------------------------------------------------- |
| precisión          | wired             | coordenadas, OSNAP/ORTHO existentes; solver subset vivo             |
| documento          | persisted         | schema v3 amplio; renderer/editor v3 general pendiente              |
| edición            | wired en vertical | cleanup y restricciones; grips por entidad v3 pendientes            |
| interoperabilidad  | partial           | DXF real existente; matriz de pérdidas todavía abierta              |
| documentación/plot | wired parcial     | PDF vectorial a escala existente; paper space/sheet sets pendientes |
| rendimiento        | measured kernel   | 1k/10k/100k se registran abajo; render interactivo no medido        |
| confiabilidad      | tested vertical   | specs/typecheck; e2e interactivo todavía insuficiente               |
| 3D                 | partial histórico | layout Three.js; sin kernel sólido/superficie profesional           |
| SDK                | missing estable   | registry/provider contracts existen, no SDK público versionado      |

### Ventaja AXOS

| Eje                   | Estado               | Evidencia / siguiente brecha                                        |
| --------------------- | -------------------- | ------------------------------------------------------------------- |
| IA gobernada          | wired en cleanup     | schema→preview/evidencia→confirmación→txn→undo                      |
| navegador             | wired                | editor cliente real; falta worker/render incremental masivo         |
| colaboración          | partial              | snapshots/diff/approval existentes; comentarios anclados pendientes |
| objetos empresariales | wired                | tags, business links y stations                                     |
| Industry Packs        | wired existentes     | no se agregó otro pack superficial                                  |
| reglas                | wired                | motor canónico y broad phase                                        |
| auditoría             | partial              | historial/versión; evento por entidad/comando aún incompleto        |
| ERP/MES               | wired por plataforma | links y routing; semántica CAD más profunda pendiente               |

## 8. Benchmarks

Harness determinista: adaptador → serialización → reglas → DXF export → DXF
reimport. Hardware local de desarrollo, Node 22.18.0; los números no son un SLA.

|  Assets | Entidades doc |      Bytes |     Adapt |   Serialize |       Rules |     DXF out |      DXF in |        Total |
| ------: | ------------: | ---------: | --------: | ----------: | ----------: | ----------: | ----------: | -----------: |
|   1,000 |         1,149 |    201,266 |   3.18 ms |    49.51 ms |    33.14 ms |    30.26 ms |    66.13 ms |    182.23 ms |
|  10,000 |        11,499 |  2,056,823 |  20.19 ms |   114.27 ms |   149.85 ms |   198.35 ms |   450.71 ms |    933.38 ms |
| 100,000 |       114,999 | 21,021,739 | 177.95 ms | 1,851.80 ms | 2,550.88 ms | 2,495.57 ms | 5,992.56 ms | 13,068.76 ms |

Memoria heap aproximada incremental: 3.9 MiB, 53.2 MiB y 231.6 MiB. El DXF
emitió 1k/10k/100k entidades, pero el reimportador recuperó 1k/10k/**50k**:
existe un límite de seguridad de 50,000 primitivas. Es degradación controlada,
pero impide declarar round-trip de 100k; queda registrada, no ocultada.
Además, el documento sintético de 100k ocupa ~20.0 MiB y supera el límite
actual de persistencia (8 MB); la prueba demuestra kernel batch, no que un
dibujo de ese tamaño ya pueda guardarse o editarse de forma interactiva.

No se midieron primer render, frame time, pan/zoom o memoria del navegador en
este corte; por tanto no se promete 60 fps ni “100k interactivo”.

## 9. Pruebas y gates

| Gate                                              | Estado antes de PR                           |
| ------------------------------------------------- | -------------------------------------------- |
| specs focalizados documento/solver/cleanup/intent | verde                                        |
| API validación/intent/persistencia/concurrencia   | 55/55 verde                                  |
| web TypeScript                                    | verde                                        |
| API TypeScript                                    | verde                                        |
| web specs completos                               | 98/98 verde                                  |
| build web/API                                     | verde                                        |
| lint de archivos API modificados                  | verde                                        |
| lint web completo                                 | 0 errores; 25 warnings preexistentes         |
| API specs completos                               | 253 suites / 1,632 tests, verde              |
| e2e del editor con navegador                      | no añadido; deuda explícita                  |
| capability/nav checks                             | 21 capacidades / 80 áreas, verde             |
| tenant-safety                                     | 39/39 specs y 1,078 hallazgos baseline verde |

El lint API completo local detecta finales CRLF introducidos por el checkout
Windows en archivos no modificados; el lint focalizado de todos los archivos
API de este corte está verde. No se hizo un reformateo masivo ajeno al alcance;
el gate Linux remoto sobre los blobs LF publicados es la autoridad final.

Casos nuevos: migración y serialización v3, passthrough opaco, números no
finitos, propagación/rollback/conflicto del solver, limpieza con evidencia,
schema IA, payload API acotado, tags, reload y conflicto de versión stale.

## 10. Estado de entrega

| Estado    | Valor                                                            |
| --------- | ---------------------------------------------------------------- |
| LOCAL     | cambios implementados y gates locales verdes                     |
| COMMITTED | `1fb54182c3226dc413a3f1b1b6784739b0af5c89`                     |
| PUSHED    | `feat/axos-cad-grand-leap`                                       |
| PR        | [#1399](https://github.com/Sergiovalle3121/axos-os/pull/1399)     |
| MERGED    | pendiente del gate remoto `Build · Test · Lint · Smoke`           |

## 11. Deuda priorizada

1. Adapter DXF integral v3 con fixtures legales, unknown passthrough y loss
   manifest desde el parser.
2. Renderer/selección/propiedades para entidades v3 sin degradarlas a cajas.
3. Restricciones de tangencia/radio y solver por grados de libertad.
4. Persistencia verdaderamente condicional a nivel SQL para carreras
   simultáneas extremas; el token actual detecta writers stale secuenciales.
5. Benchmarks de navegador, memoria, selección/snapping y workers.
6. E2E del recorrido import→edit→cleanup→undo→save→reload→export.
7. Paper spaces/viewports/plot styles y revisión asíncrona por entidad.
