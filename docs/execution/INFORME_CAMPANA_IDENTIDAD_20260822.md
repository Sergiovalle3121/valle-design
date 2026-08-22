# Informe de campaña — identidad y purga, 2026-08-22

Ocho horas en cascada con un solo objetivo: que este repositorio deje de arrastrar el producto del
que nació y quede centrado, en el código y en la palabra, en lo que Valle Design es — un **CAD 2D
general y universal** que compite con AutoCAD.

Bitácora operativa completa en [`CAMPANA_IDENTIDAD_20260822.md`](CAMPANA_IDENTIDAD_20260822.md).
La declaración de identidad que ordena todo esto vive ahora en la raíz: [`IDENTITY.md`](../../IDENTITY.md).

---

## Lo que cambió, en una pantalla

|                                      | Antes                                        | Después                                                               |
| ------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------- |
| Lo primero que se lee en `README.md` | «sistema de diseño arquitectónico 2D»        | «CAD 2D general y universal»                                          |
| Carpeta que contiene el CAD          | `components/line-engineering/` (48 archivos) | `components/cad/{editor,palettes,interop,plot,viewport}` y `lib/cad/` |
| Modo fábrica                         | escondido tras la prop `standalone`          | **no existe**                                                         |
| Comandos del copiloto                | 47, diez de ellos industriales               | 40, ninguno industrial                                                |
| Plantillas                           | 150, cinco industriales                      | 145, ninguna industrial                                               |
| Símbolos                             | 171                                          | 161, sin «estaciones» de línea                                        |
| Chunk del estudio                    | 2 386 072 B · 622 447 B gzip                 | **2 267 892 B · 592 742 B gzip**                                      |
| Gate de dominio industrial           | no existía                                   | verde, **con backlog en cero**                                        |
| Primer nivel de `docs/`              | la separación del ERP                        | la documentación viva; la historia en `docs/history/`                 |

---

## Métricas

### Código borrado

**20 archivos eliminados por completo**, 4 023 líneas, más los 6 shims de dos líneas que sobraban:

| Archivo                                                  | Líneas | Qué era                                              |
| -------------------------------------------------------- | -----: | ---------------------------------------------------- |
| `lib/cad/warehouse-generators.ts` + spec                 |  1 492 | andenes, filas de racks, supermercados de kitting    |
| `lib/cad/industry-pack.ts` + spec                        |  1 179 | objetos «inteligentes» con métricas de inventario    |
| `components/line-engineering/station-overlays.ts` + spec |    403 | capas MES, calor de ciclo contra takt                |
| `lib/cad/analysis-extensions.ts` + spec                  |    255 | contrato de balanceo / ruta de material / flujo      |
| `lib/cad/industry-rollup.ts` + spec                      |    246 | BOM de objetos de pack                               |
| `lib/line-engineering/flow-optimization.ts` + spec       |    223 | score de flujo, cruces, backtracking, reordenamiento |
| `components/line-engineering/arrange-line.ts`            |    111 | acomodo de la línea de producción                    |
| `components/line-engineering/connect-line.ts`            |     61 | cadena de flujo entre estaciones                     |
| `components/line-engineering/flow-metrics.ts`            |     53 | distancia de recorrido de material                   |

### Reducción neta por archivo

| Archivo                            |  Antes |    Después |          Δ |
| ---------------------------------- | -----: | ---------: | ---------: |
| `Layout3DEditor.tsx` (el monolito) | 22 208 | **20 248** | **−1 960** |
| `commands/registry.ts`             |  2 953 |      2 052 |       −901 |
| `lib/cad/templates.ts`             |  5 150 |      4 976 |       −174 |
| `lib/cad/symbols.ts`               |  1 650 |      1 547 |       −103 |
| `commands/parser.ts`               |  1 620 |      1 517 |       −103 |

El monolito además baja de **153 a 141 `useState`**.

### Bundle del cliente — la cifra que convierte esto en mejora de producto

Medido sobre el chunk de cliente que contiene el estudio, identificado por sus marcadores
industriales antes y por ser el mayor después:

|                                  |                    Crudo |                    Gzip |
| -------------------------------- | -----------------------: | ----------------------: |
| **Antes** (`1r2k4bqmi6d6_.js`)   |              2 386 072 B |               622 447 B |
| **Después** (`3t8yvbcuc9ge0.js`) |          **2 267 892 B** |           **592 742 B** |
| Diferencia                       | **−118 180 B (−4.95 %)** | **−29 705 B (−4.77 %)** |

Cada cliente de Valle Design descargaba y parseaba ~29 KB comprimidos de planificación de plantas
que nunca iba a usar. Ya no.

**Honestidad de la medición:** la cifra «después» incluye también los componentes de marketing y de
editor que una sesión paralela agregó en el mismo árbol durante estas ocho horas, así que la
reducción real atribuible a esta campaña es **mayor** que la publicada. El total de
`.next/static` (5 625 636 → 5 615 932 B) no sirve como métrica por esa misma razón.

**Verificación independiente:** ningún chunk del build contiene ya `yamazumi`, `taktSeconds`,
`supermarket-kitting`, `analyze_line_balance` ni `trace_material_route`. Los dos únicos rastros que
quedan son `forklift` (el símbolo dibujable) y `forklift_path` (el valor persistido congelado), ambos
deliberados y documentados abajo.

### Documentación

**29 archivos archivados** en `docs/history/` con un README que explica qué fue cada cosa: 14 de la
separación del ERP, 11 planes y bitácoras vencidos, 1 de limpieza y 2 auditorías. **No se borró
ninguno**: son la memoria del proyecto y parte del expediente de autoría.

### El trinquete

El gate `check-no-industrial-domain` nació con **40 archivos** en su lista de residuo conocido, cada
uno etiquetado con la ola que lo retiraría. Terminó en **0**, y su spec ahora **afirma que la lista
está vacía**: volver a usarla como escondite pone la spec roja.

---

## Lo que se conservó a propósito — la parte que evita el próximo accidente

Esta sección es la más importante del informe. Si dentro de tres meses alguien —o alguna sesión de
IA— decide «terminar la limpieza», esto es lo que NO debe tocar.

### Identificadores persistidos congelados

| Qué                                           | Dónde                                                | Por qué no se renombra                                                                        |
| --------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `AXOS-CAD-STUDIO` / `UNIVERSAL`               | columna `model`/`revision` de todos los documentos   | renombrarlo no es un renombre: es migrar los datos de todos los clientes                      |
| `AXOS_DIM`, `AXOS_MLEADER`, `AXOS_BLOCK`      | **dentro de los DXF que los usuarios ya exportaron** | esos archivos viven en discos de clientes y de terceros; el importador debe seguir leyéndolos |
| `axos_theme`, `axos_locale`                   | `localStorage` y cookie de cada usuario              | renombrarlos pierde las preferencias de todo el mundo                                         |
| claves de `command-session` y `cad-workspace` | historial de comandos y preferencias guardadas       | igual                                                                                         |
| tipo `"station"` del esquema                  | documentos de clientes ya guardados                  | **congelado y oculto**, no borrado: ver abajo                                                 |
| tipo de zona `"forklift_path"`                | documentos de clientes ya guardados                  | **congelado y oculto**, no borrado                                                            |
| capa `flow` de `DEFAULT_CAD_LAYERS`           | objetos colocados en esa capa dentro de documentos   | su id viaja en el documento                                                                   |
| `apps/api/src/migration-cli/**`               | —                                                    | es la puerta por la que un cliente del ERP viejo trae sus datos: adquisición, no deuda        |
| `docs/product-split/DATA-MIGRATION.md`        | —                                                    | el CLI **imprime esa ruta** en su ayuda                                                       |

**Regla general, y es la que evita el accidente:** si una cadena se escribe en disco, en una cookie,
en `localStorage` o dentro de un archivo que el usuario descarga, no se renombra por estética. Se
migra —con versión de esquema y plan— o se deja quieta.

Congelar no es esconder debajo de la alfombra: `station` y `forklift_path` siguen en el esquema, con
un comentario que dice por qué y apunta a `IDENTITY.md`, **pero ninguna superficie del producto crea
uno nuevo**. La interfaz dice «Punto» y «Pasillo de circulación». El golden
`35-cad-legacy-mutation-boundary.spec.ts`, que afirma a propósito el comportamiento del tipo
congelado, sigue verde: 4/4.

### Falsos positivos que parecen residuo y no lo son

Verificados uno por uno y **congelados como casos negativos en la spec del gate**, para que quien
endurezca el gate en el futuro lo descubra en rojo y no en producción:

- `power-rack` y `weight-rack` son de gimnasio, `tire-rack` de llantera, `bread-rack` de panadería,
  `coat-rack` es un perchero, `wash-station` un lavabo y `tortilla-machine` hace tortillas.
- «planta» casi siempre es la **planta arquitectónica**. Las plantillas `nave-industrial`,
  `planta-embotelladora`, `centro-distribucion`, `recicladora` y `planta-tratamiento-agua` son
  **tipologías de edificio** que un arquitecto dibuja; se quedan las 145.
- «Sergio Valle Enterprise Software» es la **razón social real** de la empresa.
- «MES» en el servicio de CFDI es el **mes fiscal** de una factura.
- «Transportador» puede ser el instrumento de dibujo, no una banda.

### El principio que ordenó las decisiones difíciles

> **Dibujar una máquina no es operar una fábrica.**

Quedó escrito dentro del propio gate. Bajo ese principio:

- **se borró** toda la funcionalidad —takt, balanceo, ruta de material, optimización de flujo,
  generación de racks y andenes, métricas de recorrido, capas MES—;
- **se conservó** todo el contenido dibujable: los símbolos `conveyor` («Banda transportadora»),
  `forklift` («Montacargas»), `assembly-line` («Línea de producción»), `ict-tester` y
  `functional-test-bench`, porque una nave industrial dibujada los necesita, igual que la panadería
  necesita su `bread-rack`.

Los dos catálogos de contenido dibujable (`symbols.ts`, `templates.ts`) son **excepciones
permanentes del gate, con su motivo escrito** y una condición explícita: son datos puros; si alguien
mete lógica ahí, salen de la lista.

---

## Desviaciones del plan, y por qué

La campaña llegó con un diagnóstico preciso. Tres de sus indicaciones se corrigieron sobre la
marcha, y las tres quedan aquí para que se discutan, no para que se descubran leyendo el diff.

1. **`PlantMinimap.tsx` NO se borró.** El diagnóstico lo listaba como industrial (144 líneas). No lo
   es: es la **vista general del dibujo**, el panel que deja recentrar la cámara sin perder el zoom
   —cualquier CAD de escritorio tiene uno—. Era exactamente el falso positivo que la propia campaña
   advertía: «planta» ahí es la vista en planta. Se renombró a `CadOverviewMinimap` y se movió a
   `components/cad/viewport/`.
2. **`create_clearance_aisle` NO se borró.** Estaba en la lista de diez comandos a retirar, pero
   «separa dos objetos para crear una holgura medible» es dibujo general: la holgura entre un mueble
   y un muro, el paso libre de una circulación, las distancias de accesibilidad. El propio
   diagnóstico pedía **conservar** «holgura/clearance» en el parser, cosa que sólo tiene sentido si
   el comando sobrevive. Lo industrial era su ejemplo, y ése se reescribió.
3. **El recorrido a pie en primera persona NO se borró.** La OLA 6 pedía que el modo fábrica dejara
   de existir, y el paseo estaba clasificado como «recorrido de fábrica». Caminar por dentro de un
   edificio que acabas de dibujar es visualización arquitectónica —lo hacen Revit y SketchUp—. Se
   dejó siempre visible y se le cambió el título. Además su implementación toca doce puntos del
   manejo de puntero y cámara: arrancarla en la última hora habría sido riesgo de regresión en el
   viewport a cambio de nada.

Y una corrección menor al diagnóstico: **`AGENTS.md` no tenía ninguna mención de `axos` en su línea
1**. Su única mención está en la sección _Legacy boundary_ y es legítima y necesaria.

---

## Lo que el trabajo encontró de paso

Cosas que no estaban en el plan y que la campaña destapó al pasar:

- **`docs/competitive/rubric.json` apuntaba a `cad-format-detect` en su ruta vieja.** El renombrado
  habría puesto rojo el gate de rúbrica sin que nadie entendiera por qué.
- **`VALLE_CAD_ARCHITECTURE_LAYER.md` afirmaba que `precision-input.ts` «is now a thin compatibility
  re-export»**. Ya no lo era: el shim se acababa de borrar. Se corrigió el párrafo.
- **`REPOSITORY_SCOPE.md` decía «Tampoco hay kernel Rust/WASM»** cuando existen crate, artefacto y
  specs de paridad. Se corrigió declarándolo _parcial_ —nadie lo importa todavía— por el propio
  criterio de evidencia del documento.
- **`check-product-boundary.mjs` (gate de DWG) leía el registro de versiones con un regex que exigía
  comilla simple.** En cuanto prettier tocó el detector, el gate se cayó con «the product detector
  version registry is empty». Se hizo insensible al estilo de comillas: el registro es un dato, no un
  formato.
- **El runner de specs exige que todo spec anuncie su final por stdout.** Al reescribir
  `templates.spec.ts` se perdió su `console.log` y lo marcó rojo. Es exactamente el gate que evita un
  spec que «pasa» sin correr.
- **`plotSheetModel` ya era un import muerto en el monolito antes de esta campaña** (lo confirma
  `git show`). No se tocó para no ensanchar el commit.

---

## Verificación al cierre

| Gate                                                          | Resultado                                     |
| ------------------------------------------------------------- | --------------------------------------------- |
| `npm run typecheck` (web + api + contracts + sdk + dwg-codec) | **verde**, 6/6                                |
| `npm test`                                                    | **verde**, 6/6 tareas · web **381/381** specs |
| `npm run lint`                                                | **verde**, 0 errores                          |
| `npm run check:cad`                                           | verde hasta `check:dwg-evidence` (ver abajo)  |
| `check-no-industrial-domain` + spec                           | **verde, 113 comprobaciones, backlog en 0**   |
| `check-no-line-engineering`                                   | verde, 1 684 fuentes                          |
| `check-monolith-budget`                                       | verde, 13 asignaciones                        |
| `npm run check:dwg`                                           | **verde**                                     |
| Golden 35 (frontera del tipo congelado)                       | **4/4 verde**                                 |

**Falla ambiental conocida, previa a la campaña:** `check:dwg-evidence` no pasa en esta máquina
porque sin `VALLE_DWG_CORPUS_MIRROR` ni `VALLE_DWG_CORPUS_TOKEN` no se descarga el corpus DWG, y el
artefacto versionado (7 bundles admitidos) no coincide con lo que el árbol puede probar aquí (0). No
tiene relación con esta campaña y no se tocó.

---

## Pendientes

1. **`apps/web/e2e/fixtures/mock-backend.ts` (739 líneas)** sigue con un mock completo de ERP/MES:
   órdenes de trabajo, operadores autorizados, estados de surtido, llamadas de reabasto, takt
   objetivo. Es residuo real, pero **61 specs lo importan**. Recortarlo campo por campo, verificando
   qué consume cada spec, en un commit aparte y con la suite corriendo entre paso y paso.
2. **Barrido de nombres internos** que sobrevivieron: variables y funciones con `station`, `asset` o
   `flow` en el monolito y en `lib/cad`, sin tocar nada persistido.
3. **`docs/competitive/autocad-2027-gap-matrix.md` puede estar desfasado** respecto al artefacto
   versionado: correr `rubric.mjs --markdown` en esta máquina lo reescribe de 186/200 a 191/200. La
   causa es la misma falta de corpus DWG; conviene verificar cuál de los dos dice la verdad.
4. **Churn de formato introducido por la campaña:** `asset-catalog.ts` (135 → 437 líneas) y
   `design-checks.ts` (140 → 177) se inflaron al pasarles prettier durante el renombrado. El
   contenido no cambió; el diff sí. Los archivos grandes con presupuesto (`templates.ts`,
   `symbols.ts`, `parser.ts`) se dejaron **sin formatear a propósito**: el lint no lo exige y
   reformatearlos rompería su techo, que sólo permite encoger.
5. **El mapa de calor de ocupación se borró entero**, incluida su matemática de teselas. Si algún día
   hace falta una densidad de ocupación para un plano (aforo, mobiliario), se reescribe desde el
   documento canónico, no desde un endpoint de planta.
6. **`plotSheetModel`, `worldToPaper`, `buildPlotSheet`, `CAD_TOOLBAR_ACTIONS` y otros imports
   muertos** del monolito, previos a esta campaña.
7. **El campo «Flujo total» del cajetín** (`plot-sheet.ts`) sigue existiendo; ya nadie lo alimenta,
   así que imprime `---`. Quitarlo cambia la lámina y tiene spec propia: merece su propio commit.

## Los diez siguientes pasos

1. Recortar `mock-backend.ts` con auditoría spec por spec (pendiente 1).
2. Quitar el campo «Flujo total» del cajetín y actualizar su spec y sus goldens.
3. Ampliar las plantillas hacia el CAD universal, que es la prueba visible del posicionamiento
   nuevo: **una mecánica** (pieza con cortes y tolerancias), **una eléctrica** (diagrama unifilar),
   **una civil/topográfica** (levantamiento de predio con cuadro de construcción) y **una de
   mobiliario** (despiece de carpintería).
4. Escribir el ADR que documente la decisión de congelar los identificadores `axos`, el tipo
   `station` y el tipo de zona `forklift_path`, con el plan de migración para el día que se decida
   subir la versión del esquema.
5. Revisar la landing y las guías con el posicionamiento corregido: que hablen de «planos» y «dibujo
   técnico», no sólo de arquitectura.
6. Resolver la discrepancia de la matriz competitiva (pendiente 3).
7. Barrido de nombres internos (pendiente 2).
8. Limpiar los imports muertos previos del monolito (pendiente 6).
9. Configurar el corpus DWG en la máquina de desarrollo, o documentar en el RUNBOOK que
   `check:dwg-evidence` sólo pasa con el mirror configurado.
10. Encadenar `check-no-industrial-domain` también en CI sobre PRs de fork, para que el trinquete
    proteja las contribuciones externas el día que las haya.
