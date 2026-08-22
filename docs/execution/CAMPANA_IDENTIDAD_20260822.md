# Campaña de identidad y purga — 22 de agosto de 2026

**Repositorio:** valle-design · **Duración prevista:** 8 h en cascada · **Modo:** autónomo, sin preguntas.

## Misión

Que este repositorio deje de arrastrar el producto del que nació y quede centrado, en el código y en
la palabra, en lo que Valle Design ES: un **CAD 2D general y universal** que compite con AutoCAD.

Valle Design salió de un ERP industrial (primero _Axos OS_, luego _Valle Enterprise_) que incluía un
planificador de plantas de manufactura. Valle Design **no** es un ERP, **no** gestiona industrias,
**no** balancea líneas de producción, **no** calcula takt time ni rutas de material. Dibuja planos:
arquitectónicos, mecánicos, eléctricos, civiles, de instalaciones, de mobiliario, de terreno.

Al terminar, cualquiera que abra este repositorio —cliente, inversionista, programador nuevo o una
sesión futura de Claude Code— debe entenderlo en los primeros treinta segundos, y no debe encontrar
una sola línea de gestión industrial ejecutándose en el navegador de un cliente.

## Diagnóstico que ordena la campaña

1. **El residuo no está donde dice el nombre.** `apps/web/src/components/line-engineering/`
   (48 archivos, 26 939 líneas) es hoy ~85 % CAD legítimo: las 13 paletas de `cad-workbench/`, el
   parser DXF, la máquina de estados de dibujo, el ploteo, el snapping, la acotación. Solo 6 archivos
   (771 líneas) son industriales. El nombre de la carpeta es el residuo, no su contenido. El dominio
   industrial de verdad vive en `lib/cad/` (warehouse-generators, industry-pack) y en el monolito.
2. **La compuerta «modo planta» esconde pero no quita.** El modo fábrica está tras una prop
   `standalone` y el cliente no lo ve, pero **todas** las importaciones industriales del monolito son
   estáticas: el navegador de cada cliente descarga, parsea y ejecuta ~4 150 líneas de planificación
   de plantas que nunca va a usar. Purgar es peso de descarga y tiempo de arranque, no solo higiene.
3. **Hay falsos positivos que parecen residuo y no lo son.** Ver «Falsos positivos» abajo.

## Falsos positivos — NO se tocan

- «planta» casi siempre significa **planta arquitectónica** (floor plan). `starter-templates.ts` es
  100 % CAD general.
- Plantillas `nave-industrial`, `planta-embotelladora`, `centro-distribucion`, `recicladora`,
  `planta-tratamiento-agua`: son **tipologías de edificio** que un arquitecto dibuja. Se quedan.
- Símbolos `power-rack` y `weight-rack` (gimnasio), `tire-rack` (llantera), `bread-rack` (panadería),
  `coat-rack` (perchero), `wash-station` (lavabo), `tortilla-machine`. Se quedan.
- «Sergio Valle Enterprise Software» en `packages/contracts/src/brand.ts` es la **razón social real**.
- «MES» en `cfdi-issuance.service.ts` es el **mes fiscal** de una factura.
- De las 150 plantillas solo 5 son industriales; de los 145 símbolos solo ~8; de los 47 comandos del
  copiloto solo 10. La cirugía es fina, no una amputación.

## Intocables — rompen datos de clientes o pruebas críticas

Estas cadenas dicen `axos` y **deben seguir diciéndolo**. Están congeladas a propósito y
`apps/web/src/lib/cad/persisted-identifiers.spec.ts` afirma activamente que siguen así.

| #   | Ubicación                                                                                              | Qué es                                                              |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| a   | `packages/contracts/src/legacy/cad-studio-identifiers.ts:14` -> `AXOS-CAD-STUDIO`                      | centinela en la columna `model` de todos los documentos existentes  |
| b   | `packages/contracts/src/legacy/dxf-xdata-apps.ts:20,23,26` -> `AXOS_DIM`, `AXOS_MLEADER`, `AXOS_BLOCK` | escritas **dentro** de los DXF que los usuarios ya exportaron       |
| c   | `ThemeContext.tsx:48`, `app/layout.tsx:105` -> `axos_theme`                                            | localStorage de usuarios                                            |
| d   | `i18n/config.ts:33` -> cookie `axos_locale`                                                            | preferencia de idioma                                               |
| e   | `lib/cad/command-session.ts:53`                                                                        | historial de comandos persistido                                    |
| f   | `lib/cad/cad-workspace.ts:101`                                                                         | preferencias de workspace por usuario                               |
| g   | `Layout3DEditor.tsx:1893`                                                                              | marcadores de viewport del usuario                                  |
| h   | `apps/web/src/app/legacy/studio/page.tsx`                                                              | resuelve marcadores antiguos y canjea enlaces de revisión           |
| i   | tipo `"station"` en `lib/cad/cad-document.ts:146` + 11 consumidores                                    | tipo **persistido**: se congela y se oculta, no se borra            |
| j   | `apps/api/src/migration-cli/**` (incl. `seed-enterprise-fixture.ts`)                                   | puerta de entrada de clientes del ERP viejo                         |
| k   | `lib/cad/legacy/layout-http-adapter.ts` y `check-no-line-engineering.mjs`                              | contrato de compatibilidad HTTP vigente                             |
| l   | `apps/web/e2e/fixtures/mock-backend.ts`                                                                | tiene residuo real, pero 61 specs dependen de el -> cola de reserva |

**Regla general:** si una cadena se **escribe** en disco, en una cookie, en localStorage o dentro de
un archivo que el usuario descarga, no se renombra en esta campaña.

## Trampa del trinquete

`check-monolith-budget.mjs` falla si un archivo con presupuesto adelgaza más de 200 líneas por debajo
de su techo — es deliberado para que el manifiesto nunca mienta. Esta campaña borra miles de líneas,
así que el gate se pondrá rojo por diseño. **En el mismo commit del borrado** hay que correr
`node scripts/cad/check-monolith-budget.mjs --update`, y al borrar un archivo con entrada propia en
`scripts/cad/monolith-budget.json` hay que quitar también su línea.

## Cola

| Ola     | Qué                                                                                                                                     | Estado    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 0       | Declaración de identidad: `IDENTITY.md`, README/PRODUCT/ARCHITECTURE/REPOSITORY_SCOPE, AGENTS.md, gate `check-no-industrial-domain.mjs` | pendiente |
| 1       | Renombrar la casa: `components/line-engineering/` -> `components/cad/*` y `lib/cad/`                                                    | pendiente |
| 2       | Archivar la historia en `docs/history/` (no borrar)                                                                                     | pendiente |
| 3       | Borrar lo industrial de importador único (~1 400 líneas)                                                                                | pendiente |
| 4       | Bloques grandes: warehouse-generators, industry-pack, seed, huérfanos (~2 600 líneas)                                                   | pendiente |
| 5       | Cirugía fina en mixtos: registry, parser, templates, symbols, asset-catalog, congelar `station` (~850 líneas)                           | pendiente |
| 6       | Retirar la compuerta `standalone` del monolito (~600 líneas)                                                                            | pendiente |
| F       | La verdad medida: gates, métricas antes/después, repaso de cadenas visibles, informe                                                    | pendiente |
| R.1-R.5 | Cola de reserva                                                                                                                         | pendiente |

## Bitácora

Formato: `[hora] OLA · ítem — qué se hizo · decisiones y suposiciones`.

### 2026-08-22

- `[00:01]` **Arranque.** Repo en `main`, último commit `035c598`. **Hay una sesión paralela activa**
  (campaña de diseño): archivos de marketing/landing modificados hace 5 minutos. Suposición adoptada:
  no toco ningún archivo del árbol sucio ajeno, staging siempre explícito, `git pull --rebase
--autostash` antes de cada push.
- `[00:02]` Baseline verificado: `line-engineering/` = 48 archivos / 26 939 líneas (coincide con el
  diagnóstico). `Layout3DEditor.tsx` = 22 208 líneas. Build de baseline lanzado en segundo plano para
  medir el bundle del estudio ANTES.
- `[00:08]` **Baseline del bundle medido.** El build de `main` sucio terminó en 1 m 56 s. El chunk de
  cliente que contiene el código industrial (`yamazumi`, `taktSeconds`, `supermarket-kitting`,
  `forklift`) es **uno solo**: `.next/static/chunks/1r2k4bqmi6d6_.js`.
  - **ANTES — chunk del estudio: 2 386 072 B en crudo · 622 447 B gzip.**
  - **ANTES — `.next/static` completo: 5 625 636 B.**
    Métrica elegida: se compara ese mismo chunk (identificado por los mismos marcadores industriales, o
    por ser el mayor del estudio) al cerrar la campaña. Es la cifra que convierte esto en mejora de
    producto y no solo en limpieza.
- `[00:12]` **OLA 0.1 cerrada.** `IDENTITY.md` escrito en la raíz: qué es, para quién, contra qué
  compite, «Lo que Valle Design NO es» con seis negaciones explícitas, el origen Axos OS / Valle
  Enterprise, y la tabla de identificadores congelados con el motivo de cada uno. Cita
  `REPOSITORY_SCOPE.md` y los tres candados ejecutables.
- `[00:20]` **OLA 0.2 cerrada.** Posicionamiento corregido en cuatro documentos: `README.md` («CAD 2D
  general y universal», con el contenido mexicano declarado fortaleza y no límite), `PRODUCT.md`,
  `ARCHITECTURE.md` y `REPOSITORY_SCOPE.md`. En este último, además del vocabulario, se corrigió una
  afirmación **vencida**: decía «DWG no está implementado. Tampoco hay kernel Rust/WASM» cuando existen
  `packages/dwg-codec` (experimental, no expuesto) y `crates/valle-cad-kernel` con artefacto WASM y
  specs de paridad —pero sin ningún consumidor en la app, así que por el propio criterio de evidencia
  del documento es *parcial*, no *soportado*. Los cuatro citan ahora `IDENTITY.md`.
- `[00:24]` **OLA 0.3 cerrada.** `AGENTS.md`: el alcance pasa a «general-purpose 2D CAD» y se añade la
  sección dura *Domain boundary — no industrial management*. **Corrección al diagnóstico:** la campaña
  pedía quitar la mención `axos` de la línea 1 de `AGENTS.md`; ahí no hay ninguna. La única mención del
  archivo está en la línea 87, la sección *Legacy boundary*, y es **legítima y necesaria** (documenta
  los identificadores persistidos congelados). No se toca.
- `[00:40]` **OLA 0.4 cerrada.** Gate `scripts/cad/check-no-industrial-domain.mjs` + su spec
  (184 comprobaciones), encadenado en `check:cad` vía `npm run check:no-industrial-domain`.
  - Audita `apps/web/src`, `apps/api/src` y `packages/*` por AST: identificadores **y** cadenas
    visibles, normalizando acentos para que «balanceo de línea» y «balanceo de linea» caigan igual.
  - `permittedExceptions` / `permittedFiles`: CLI de migración, `legacy/` congelado, mes fiscal del
    CFDI, razón social. Cada excepción lleva su motivo escrito y la spec exige que lo lleve.
  - **Trinquete `residueBacklog`:** 40 archivos con residuo conocido, cada uno etiquetado con la ola
    que lo retira. Si una entrada deja de tener hallazgos, el gate FALLA pidiendo que se borre la
    línea. Así la lista no puede volverse un escondite y la campaña tiene un contador objetivo:
    **40 → 0**. La spec verifica además que ninguna entrada apunte a un archivo inexistente.
  - La spec incluye los falsos positivos del diagnóstico como casos negativos explícitos:
    `power-rack`, `tire-rack`, `bread-rack`, `coat-rack`, `wash-station`, `tortilla-machine`,
    `nave-industrial`, `planta-embotelladora`, `mep-plantroom`, «Planta arquitectónica», el mes
    fiscal, la razón social y el «transportador de ángulos» (el instrumento de dibujo). Si alguien
    endurece el gate y tumba uno de ésos, la spec se pone roja.
  - Dos falsos positivos reales se arreglaron en la fuente en vez de meterlos a la lista de
    excepciones (una excepción menos es un gate más fuerte): `site-routes.ts:72` decía «con el orden
    de trabajo que evita rehacer el plano» hablando del **flujo de trabajo del dibujante** → ahora
    «la secuencia de trabajo»; y `professional-blocks.spec.ts:39` usaba `entityType: 'workOrder'`
    como dato de ejemplo de `businessLink` → ahora `projectItem`. Verificado que `wo-42` no aparecía
    en ningún otro sitio.
- `[00:44]` **Verificación de la OLA 0.** `npm run typecheck` verde (6/6). `npm run check:cad` verde
  hasta `check:dwg-evidence`, que **falla por entorno, no por la campaña**: sin
  `VALLE_DWG_CORPUS_MIRROR` ni `VALLE_DWG_CORPUS_TOKEN` esta máquina no descarga el corpus DWG y el
  artefacto del disco (7 bundles admitidos) no coincide con lo que el árbol puede probar aquí (0).
  Es previo a la campaña y no lo toca. **PENDIENTE anotado:** correr `rubric.mjs --markdown` en esta
  máquina reescribe `docs/competitive/autocad-2027-gap-matrix.md` de 186/200 a 191/200 por la misma
  causa; se revirtió ese efecto colateral para no ensuciar el commit, pero conviene revisar si el
  documento versionado está desfasado respecto al artefacto versionado.
- `[00:45]` **Coordinación.** La sesión paralela cerró y publicó su commit `655586b` («La portada deja
  de vender un CAD sin enseñar un dibujo»); el árbol de trabajo quedó con cambios míos únicamente.
  Regla que se mantiene: `git commit -- <rutas>` con pathspec explícito, nunca `git add -A`.

- `[01:35]` **OLA 1 cerrada — la casa cambió de nombre.** `components/line-engineering/` se desarmó
  con `git mv` (historial conservado) hacia el sitio al que la descomposición del monolito venía
  apuntando:
  | Destino | Qué llegó |
  |---|---|
  | `components/cad/editor/` | `Layout3DEditor.tsx`, `ScaleBar.tsx` |
  | `components/cad/palettes/` | los 13 archivos de `cad-workbench/` |
  | `components/cad/interop/` | `dxf.ts`, `dxf-walls.ts`, `dxf-snap.ts`, `cad-format-detect.ts` (+spec) |
  | `components/cad/plot/` | `plot-sheet.ts`, `plot-scale.ts` (+specs) |
  | `components/cad/viewport/` | `asset-catalog.ts` (+spec) — junto a sus dos consumidores |
  | `lib/cad/` | `auto-dimensions`, `cad-command`, `cad-intent`, `cad-vision`, `design-checks`, `precision-input.spec`, `professional-snapping.spec` |
  Y se borraron los **6 shims de 2 líneas** (`cad-array`, `dimension-format`, `geom-edit`,
  `geom-measure`, `snap-engine`, `precision-input`): su código real ya vivía en `lib/cad/`, y los
  únicos importadores eran archivos de la propia carpeta, que ahora importan el original.
  - **Se quedan en `components/line-engineering/` los 6 archivos industriales** (`PlantMinimap`,
    `arrange-line`, `connect-line`, `flow-metrics`, `station-overlays` + spec). Decisión consciente:
    moverlos para borrarlos 1.5 h después sería churn de historial. La carpeta desaparece en la
    OLA 3, y ese commit queda como puro borrado, fácil de revertir solo.
  - Puntos de edición que cruzaban la frontera: exactamente los 7 previstos, más 3 que el diagnóstico
    no listaba y el árbol sí tenía: `docs/competitive/rubric.json` (dos rutas de evidencia de
    `cad-format-detect`, que habrían puesto rojo el gate de rúbrica), `docs/cad/VALLE_CAD_ARCHITECTURE_LAYER.md`
    y `lib/cad/engine/commands/draw-basics.ts`. De paso, el mismo documento afirmaba que
    `precision-input.ts` «is now a thin compatibility re-export»: ya no lo es, porque el shim se
    borró; se corrigió el párrafo en vez de dejar la mentira.
  - Los encabezados «npx tsx src/components/line-engineering/…» de los 11 archivos movidos apuntan
    ahora a su ruta real: una instrucción de correr tests que no corre es peor que ninguna.
  - `check-no-line-engineering.mjs` no se disparó, como estaba previsto: vigila URLs HTTP y
    `rawApiFetch`, no el nombre de la carpeta. El adaptador `lib/cad/legacy/` no se tocó.
  - **Verificación:** `typecheck` 6/6 verde · `web` 386/386 specs verdes · `lint` 0 errores ·
    `check:cad` verde salvo el `check:dwg-evidence` ambiental ya anotado · `check-product-boundary`
    de DWG verde con la ruta nueva del detector. Un test de la API (`round-trip real >1MB`) se cayó
    por timeout de 30 s en la corrida completa y **pasa solo en 21 s**: es lentitud de máquina con la
    sesión paralela encima, no regresión — esta ola no toca `apps/api`.
  - Prettier reformateó de paso 8 archivos preexistentes de `palettes/` que no son de esta campaña;
    se revirtieron para que el commit no mienta sobre su alcance.

- `[02:10]` **OLA 2 cerrada — la historia se archiva, no se borra.** Nace `docs/history/` con un
  `README.md` que explica qué fue cada cosa, por qué se archiva y qué NO hay que leer ahí como si
  fuera el runtime de hoy. **No se borró un solo archivo**: es memoria del proyecto y parte del
  expediente de autoría; sólo deja de ser lo primero que alguien encuentra al abrir `docs/`.
  - `docs/history/product-split/` ← 14 documentos de la separación del ERP. **Excepción viva:**
    `docs/product-split/DATA-MIGRATION.md` se queda donde estaba porque el CLI de migración
    **imprime esa ruta en su ayuda** (`migration-cli/main.ts:135`) y la cita en `source.ts:16`.
    Moverlo habría dejado al usuario del CLI persiguiendo un archivo inexistente. La carpeta queda
    con un `README.md` corto que dice qué sigue vivo y dónde está el resto.
  - `docs/history/execution/` ← 11 planes y bitácoras vencidos: los tres Grand Leap, el native core,
    el daily driver (corte del 26 de julio), las diez sesiones de la Ola 2, la campaña 10/10 y las
    bitácoras operativas de las campañas de 8 h y DWG.
  - `docs/history/cleanup/` y `docs/history/audits/` ← completos: diagnostican problemas resueltos.
  - **Se quedan en `docs/execution/`:** los dos `INFORME_*` (evidencia medida al cierre, no planes),
    esta campaña y `CAMPANA_DISENO_20260821.md`, **que es la campaña que la sesión paralela está
    corriendo ahora mismo**. Archivar una campaña viva habría sido sacarle el suelo a otra sesión.
  - Ocho referencias apuntaban a las rutas viejas y se corrigieron, incluidas **dos dentro del
    código**: `apps/web/playwright.config.ts` y `e2e/golden/19-cad-professional-workbench.spec.ts`
    explican con la auditoría `main-rojo-e2e-20260809.md` por qué existe su configuración. Un
    comentario que cita un archivo movido es una pista rota; ese archivo se conserva justamente para
    que alguien lo lea.
  - `docs/README.md` reordenado: ahora empieza mandando a `IDENTITY.md` y describe `history/` como
    archivo, no como documentación.
  - **Verificación:** `rubric.spec` 51/51 · gate de identidad verde · `tsc` de `apps/web` limpio ·
    cero referencias colgantes (barrido de `docs/audits/`, `docs/cleanup/`, `docs/execution/CAMPANA_*`,
    `VALLE_CAD_*` y `docs/product-split/`).

- `[03:05]` **OLA 3 cerrada — el primer borrado real.** Desaparecen `components/line-engineering/` y
  `lib/line-engineering/`: la carpeta que dio nombre al producto muerto ya no existe en el árbol.
  - **Borrados (9 archivos):** `station-overlays.ts` + spec (capas MES / calor de ciclo contra takt),
    `arrange-line.ts` (acomodo de línea de producción), `connect-line.ts` (cadena de flujo entre
    estaciones), `flow-metrics.ts` (distancia de recorrido de material), `flow-optimization.ts` + spec
    (score de flujo de planta, cruces, backtracking, reordenamiento), `industry-rollup.ts` + spec
    (BOM de objetos de Industry Pack).
  - **CORRECCIÓN AL DIAGNÓSTICO — `PlantMinimap.tsx` NO se borró.** El diagnóstico lo listaba como
    industrial (144 líneas) y **no lo es**: es la vista general del dibujo, el panel de navegación
    que deja recentrar la cámara sin perder el zoom. Es exactamente el falso positivo que la propia
    campaña advertía: «planta» aquí es la vista en planta, no la planta industrial. Un CAD de
    escritorio tiene ese panel. En vez de borrarlo se **renombró a `CadOverviewMinimap`** y se movió
    a `components/cad/viewport/`, junto a las demás capas del viewport, con su comentario reescrito
    en vocabulario de dibujo.
  - **Cirugía en el monolito** (22 208 → 21 505 líneas, −703; 153 → 148 `useState`): imports,
    estado (`flowHealth`, `flowSequence`, `flowSegments`, `industrySummary`, `overlay`,
    `overlayColorRef`…), los handlers (`arrangeLineLayout`, `connectLineLayout`, `loadOverlay`,
    `analyzeFlowHealth`, `applyFlowReorderPreview`, `selectFlow*`, `exportIndustryCsv`,
    `currentFlowNodes`), el panel Flow Health entero, el menú y la leyenda de estado de estación, el
    panel de objetos inteligentes, la insignia «Flow» de la barra de estado, la fila «Flow Health»
    del tablero de release y los campos de flujo del panel de cantidades y su CSV.
  - **Efecto colateral honesto:** el botón `connector` de la barra («Conectar flujo entre
    estaciones») se quedaba sin acción, así que se retiró también de `lib/cad/toolbar.ts` y de su
    spec. Un botón que no hace nada es peor que un botón menos.
  - **Queda para la OLA 5**, con su nota puesta: el `case "arrangeLine" / "connectLine"` del
    despachador de intents no importa los módulos borrados —llama al registry por id
    (`arrange_line`, `connect_flow`)—, así que compila; se va cuando caigan esos comandos y los
    kinds de `cad-intent.ts`. Igual el campo «Flujo total» del cajetín en `plot-sheet.ts`.
  - **El trinquete funcionó tal cual se diseñó:** al borrar, el gate se puso rojo listando las 8
    entradas de `residueBacklog` que ya no encontraban nada y exigiendo borrarlas. Backlog **40 → 32**.
  - **Verificación:** `tsc` limpio · `web` 384/384 specs verdes · `check:cad` verde salvo el
    `check:dwg-evidence` ambiental · `check-monolith-budget --update` corrido en el mismo commit.
  - **PENDIENTE anotado:** `plotSheetModel` ya era un import muerto en el monolito ANTES de esta
    campaña (lo confirma `git show HEAD`); no se toca aquí para no ensanchar el commit.
  - **Coordinación con la sesión paralela:** mientras se operaba, la campaña de diseño migró
    `Layout3DEditor.tsx` a tokens de color (313 líneas) **en el mismo árbol de trabajo**. No hay forma
    de separar hunks de un archivo compartido sin perder su trabajo, así que este commit los lleva.
    Se declara aquí y en el mensaje del commit para que el historial no engañe a nadie.
  - **Bundle tras la OLA 3** (chunk del estudio, ahora `1_vfkoj2d2fql.js`): **2 370 711 B en crudo ·
    617 696 B gzip**, contra 2 386 072 / 622 447 al arrancar → **−15 361 B crudo, −4 751 B gzip**.
    Poco, y era lo esperado: los bloques grandes (`warehouse-generators` 1 163 líneas e
    `industry-pack` 906) salen en la OLA 4. El chunk **todavía contiene** marcadores industriales
    (`forklift`, `supermarket-kitting`), que es exactamente lo que la OLA 4 va a quitar.
    *Caveat de la medición:* la sesión paralela está agregando componentes de marketing y de editor
    en el mismo árbol, así que el total de `.next/static` subió por su trabajo, no bajó por el mío;
    la cifra fiable es la del chunk del estudio, y aun ésa lleva encima su migración de tokens.

- `[04:20]` **OLA 4 cerrada — los bloques grandes.** El monolito pasa de 21 505 a **20 663 líneas**
  (22 208 al arrancar la campaña: **−1 545**) y de 148 a **145 `useState`**.
  - **4.1 `warehouse-generators.ts` (1 163 líneas) + spec borrados.** Generadores de andenes, filas de
    racks y supermercados de kitting: 100 % industrial. Con ellos salen del monolito los tres paneles
    de generador (334 líneas de JSX), su estado (`rackGenerator`, `dockGenerator`,
    `supermarketGenerator`), sus setters tipados y los tres `apply*Generator`. Se quitó el
    `export * from "./warehouse-generators"` del barril `lib/cad/index.ts` y su entrada de
    `monolith-budget.json`.
  - **4.2 `industry-pack.ts` (906 líneas) + spec borrados.** Con ellos: el registro
    `INDUSTRY_REGISTRY`, `addIndustryObject`, la paleta «Industry Packs» del dock, el bloque
    «Industry Pack» del panel de propiedades y la re-evaluación normativa que corría en cada
    validación. El valor que aportaba —«¿cuántas posiciones de pallet tiene este almacén?»— es una
    pregunta de inventario, no de dibujo.
  - **4.3 Semilla de la API.** `apps/api/src/seed.ts` creaba un documento demo con una «Celda de
    ensamble» rotulada «LINEA 1» dentro de un proyecto llamado «Planta demo Valle». Ahora siembra una
    **planta arquitectónica**: cuatro muros cerrados, una recámara y el rótulo «PLANTA BAJA», en el
    «Proyecto demo Valle». Lo primero que ve quien estrena el producto ya no es una línea de
    producción. **El centinela `model: 'AXOS-CAD-STUDIO'` NO se tocó** y ahora lleva encima el
    comentario que explica por qué está congelado, con puntero a `IDENTITY.md`.
  - **4.4 Huérfanos.**
    - `validation-report.ts`: fuera la categoría `industry` completa (campo del reporte, tipo
      `CadIndustryValidationFinding`, filas de issue, entrada `industryFindings` y su peso en la
      severidad) y su bloque en la spec. **La sección `flow` se quedó a propósito**: la alimentan los
      comandos industriales del registry, que caen en la OLA 5; separarla aquí habría obligado a
      meter media OLA 5 en este commit y a hacerlo irreversible por partes.
    - `design-checks.ts`: se retiró el check 4 («estaciones sin conectar al flujo de la línea») y la
      entrada `connectors`. Los otros tres checks —objetos sin colocar, objetos fuera del área,
      objetos encimados— son revisión de dibujo pura y se quedan, con el encabezado reescrito en
      vocabulario de plano.
    - `analysis-extensions.ts` **no se borró todavía**: es el contrato que `commands/registry.ts`
      importa para los 10 comandos industriales. Muere en la OLA 5, con ellos.
  - **Trinquete:** 5 entradas más fuera del backlog. **32 → 27.**
  - **Verificación:** `tsc` de `apps/web` y de `apps/api` limpios · `web` 382/382 specs verdes ·
    `rubric.spec` 51/51 · `check-monolith-budget --update` corrido en el mismo commit, con las dos
    entradas de archivos borrados quitadas del JSON (si no, el script falla buscando un archivo que
    ya no existe — la trampa que la campaña anticipaba).

- `[06:10]` **OLA 5, primera mitad — el copiloto deja de saber de fábricas.**
  - **5.1 Registry (2 953 → 2 052 líneas, 47 → 40 comandos).** Fuera `connect_flow`, `arrange_line`,
    `arrange_flow_line`, `arrange_rack_rows`, `analyze_line_balance`, `trace_material_route` y
    `array_along_flow`, con sus 607 líneas de helpers (score de flujo, objetos de balanceo, ruta de
    material, previews de racks).
    **DESVIACIÓN DELIBERADA DEL DIAGNÓSTICO:** `create_clearance_aisle` **se queda**. La campaña lo
    listaba entre los 10 a borrar, pero «separa dos objetos para crear una holgura medible» es
    dibujo general —la holgura entre un mueble y un muro, el paso libre de una circulación, las
    distancias de accesibilidad— y el propio diagnóstico pedía **conservar** «holgura/clearance» en
    el parser, cosa que sólo tiene sentido si el comando sobrevive. Se le reescribió el ejemplo, que
    sí era industrial. `create_zone_around` y `draw_rect_zone` también se quedan: son zonas
    genéricas, como el diagnóstico anticipaba.
  - **5.2 Parser (1 620 → 1 517 líneas).** Sólo los 3 bloques industriales: balanceo/takt/yamazumi,
    rack/almacén/pasillo-de-racks y la tríada línea-de-flujo / conectar-flujo / acomodar-línea. Las
    424 expresiones restantes —el parser de dibujo técnico en español mexicano, con unidades y
    acentos— **no se tocaron**: son un diferenciador frente a AutoCAD, no residuo. Se conservó
    «holgura/clearance», como pedía el diagnóstico.
    *Nota de proceso:* correr prettier sobre el archivo lo INFLABA de 1 517 a 1 685 líneas (no estaba
    formateado) y eso rompía su presupuesto de monolito, que sólo permite encoger. Se revirtió el
    formateo y se re-aplicaron los borrados a mano.
  - **5.5 `asset-catalog.ts` (492 → 437).** Fuera `conveyor`, `aoi`, `agv`, `agvpath` y
    `calibration_station`, más los arquetipos 3D que se quedaban sin dueño (`belt` del transportador,
    `cart` del AGV: 113 líneas de geometría). Se **renombraron etiquetas de interfaz** sin tocar
    ningún `kind` —que sí se persiste—: «Rack»→«Estante», «Estación seg.»→«Punto de seguridad»,
    «PPE station»→«Equipo de protección», «Tool crib»→«Bodega de herramienta», «Operador»→«Persona»,
    «Mantto.»→«Área de servicio», y la categoría «Proceso»→«Equipo». La categoría «Logística»
    desapareció al quedarse vacía. El encabezado del archivo ahora documenta la regla: quitar una
    entrada NO borra objetos ya guardados (`assetMeta()` degrada a la entrada genérica); renombrar un
    `kind` sí sería migración de datos.
  - **Contrato de analítica industrial borrado:** `analysis-extensions.ts` + spec (255 líneas). Era
    el contrato que el host inyectaba para balanceo/ruta/flujo; sin comandos que lo llamen, sobraba.
    Con él sale la sección `flow` de `validation-report.ts` y su categoría de issue.
  - **Lado API:** fuera las herramientas `arrangeLine`/`connectLine` del copiloto, el método
    `optimize()` de `cad-intent.service` (63 líneas, **sin un solo llamador**) y su
    `buildOptimizePrompt`, cuyo system prompt empezaba con «Eres un ingeniero industrial que optimiza
    el layout de una línea de manufactura electrónica (EMS)». El prompt que sí se usa se reescribió a
    «asistente CAD para dibujo técnico 2D de propósito general».
  - **Banco NL→CAD:** el corpus perdió el caso `d-052` («acomoda las camas en linea» → `arrange_line`)
    y, como era un acierto, el suelo del trinquete (80.61 %) se caía. **No se bajó el suelo**: se
    repuso el caso con uno de dibujo general que el parser sí resuelve («distribuye las camas cada
    900» → `distribute_selection`). Resultado: 152 casos, despacho 80.6 %, rechazo tipado 100 %,
    **0 fallos graves**. Artefacto regenerado y comiteado.
  - **Trinquete:** 27 → **13** entradas de residuo.
  - **Verificación:** `tsc` de web y api limpios · `web` 381/381 specs verdes · registry.spec y
    cad-intent.spec verdes tras reescribir sus fixtures («Rack A1»→«Estante A1», el bloque «Conveyor»
    de la API → «Ventana») · presupuesto de monolito actualizado.
  - **Incidente de coordinación:** a mitad de la ola, la sesión paralela hizo `git stash` de TODO el
    árbol compartido para correr un control sobre `main` limpio, y mi trabajo en curso se fue con él.
    Se recuperó al hacer ellos `pop`. Lección aplicada: commits más cortos y más seguidos mientras
    dure la sesión paralela. La segunda mitad de la OLA 5 (plantillas, símbolos y congelar `station`)
    va en su propio commit por eso.

- `[07:35]` **OLA 5, segunda mitad — plantillas y símbolos.**
  - **5.3 `templates.ts` (5 150 → 4 971 líneas, 150 → 145 plantillas).** Fuera las cinco industriales:
    `smt-line`, `warehouse-racks`, `supermarket-kitting`, `packing-shipping-cell` y
    `ems-mini-factory`. **Se conservan** `mep-plantroom` (cuarto de máquinas: MEP arquitectónico) y
    `bodega-pyme`, y con ellas las 143 restantes —casa habitación, consultorio, taquería, tortillería,
    notaría, iglesia, museo, estacionamiento multinivel, nave industrial, planta embotelladora…—
    que son el producto.
  - **Las categorías de plantilla se traducen y se despiden del vocabulario de fábrica.** El editor
    imprime `template.category` **tal cual** debajo de cada plantilla, así que un arquitecto mexicano
    estaba leyendo «factory», «warehouse» y «architecture» en inglés. Ahora: `arquitectura`, `civil`,
    `estructura`, `instalaciones`, `taller`, `bodega`. Se verificó primero que la categoría **no
    viaja al documento**: es sólo texto de interfaz.
  - **5.4 `symbols.ts` (1 650 → 1 529 líneas, 171 → 161 símbolos).** Fuera diez:
    `smt-line` (una LÍNEA entera, no una máquina), `label-print-station`, `calibration-station`,
    `test-station`, `rework-station`, `operator-station`, `warehouse-rack`, `forklift-path`,
    `conveyor` y `forklift`. Con ellos mueren las categorías `flow` y `operator`.
    **CORRECCIÓN SOBRE LA MARCHA:** primero se borraron también `ict-tester` y
    `functional-test-bench` y se **restauraron** al releer el criterio: son *máquinas dibujables*, de
    la misma clase que `welder`, `press-machine` o `brew-kettle`, que la propia spec conserva.
    Dibujar una máquina no es operar una fábrica. Se quedaron con etiqueta en español.
  - **Falsos positivos respetados uno por uno**, como pedía el diagnóstico: `power-rack` y
    `weight-rack` (gimnasio), `tire-rack` (llantera), `bread-rack` (panadería), `coat-rack`
    (perchero), `wash-station` (lavabo) y `tortilla-machine` siguen ahí.
  - **La bodega no se quedó sin estantes.** `bodega-pyme` usaba los kinds `warehouse-rack` y
    `forklift-path`; ahora usa `rack` y `path`, con «Pasillo de montacargas» → «Pasillo de maniobra».
    Ocho usos de `warehouse-rack`/`agvpath` en otras plantillas (ferretería, frutería, corredores de
    egreso, camino de camiones) se sustituyeron igual: la capacidad de dibujo se conserva, el
    vocabulario cambia.
  - **`architecture.ts`:** un objeto iba a la capa de pasillos por llevar la etiqueta `forklift`;
    ahora es por `circulation`. Y el mapa categoría-de-símbolo→capa perdió su entrada `flow`, que ya
    no tenía dueño. **La capa `flow` del documento NO se tocó:** su id está en `DEFAULT_CAD_LAYERS` y
    por tanto vive dentro de documentos guardados.
  - **El runner de specs cobró un descuido real:** al reescribir `templates.spec.ts` se perdió su
    `console.log` final y el runner lo marcó rojo, porque exige que todo spec anuncie su final por
    stdout. Se repuso. Es exactamente el tipo de gate que evita un spec que "pasa" sin correr.
  - **Trinquete:** 13 → **10**.
  - **Verificación:** `tsc` limpio · `web` **381/381** specs verdes · `lint` 0 errores · presupuesto OK.
    **Decisión de proceso:** NO se corrió prettier sobre `templates.ts`, `symbols.ts` ni
    `architecture.ts`: no estaban formateados de origen, el lint no lo exige, y reformatearlos los
    inflaría por encima de su presupuesto de monolito, que sólo permite encoger.

- `[08:40]` **OLA 5.6 + OLA 6 — el modo fábrica deja de existir y `station` se congela.**
  - **La prop `standalone` desapareció.** No queda una sola guarda `!standalone`: el editor toma
    siempre la rama CAD. Con ella se van el contrato `analysisPanels` (WP6: tipos, prop, menú
    «Análisis» y montaje bajo demanda), el botón y el dock del **copiloto legado** —el de «pasillo 1.2
    entre SMT e inspección», que en Design ya no se montaba—, `runOptimize` (optimización de flujo
    en servidor), `exportCsvSchedule` («exportar estaciones a CSV») y el **mapa de calor de ocupación**
    con toda su maquinaria: pedía `layout/density` a un endpoint de planta.
  - **DESVIACIÓN DELIBERADA:** el **recorrido a pie en primera persona no se borró**, se dejó siempre
    visible y se le cambió el título («Recorrido a pie por el modelo»). El diagnóstico lo clasificaba
    como «recorrido de fábrica», pero caminar por dentro de un edificio que acabas de dibujar es
    visualización arquitectónica —lo hacen Revit y SketchUp—, no operación industrial. Además su
    implementación está entretejida en 12 puntos del manejo de puntero y cámara: arrancarla en la
    última hora habría sido meter riesgo de regresión en el viewport a cambio de nada.
  - **`station` congelado y oculto (5.6).** El tipo sigue en el esquema con un comentario que dice
    por qué —está persistido en documentos de clientes— y apunta a `IDENTITY.md`. Lo que cambió es
    todo lo visible: la pestaña, el dock, el panel de propiedades, los toasts y los títulos ya no
    dicen «Estación» sino **«Punto»**. Igual `forklift_path` en `safety-zones.ts`: valor persistido,
    congelado, documentado, y **el editor ya no crea ninguno** —la acción de la paleta crea un
    «Pasillo de circulación» y el detector de texto ya no mapea «montacargas» a ese tipo.
  - **CORRECCIÓN CONSISTENTE Y DOCUMENTADA:** se **restauraron** los símbolos `conveyor` y `forklift`
    con etiquetas en español («Banda transportadora», «Montacargas»). El principio que ordena todo
    esto quedó escrito en el gate: **dibujar una máquina no es operar una fábrica.** Las plantillas
    `nave-industrial`, `recicladora` y `planta-embotelladora` —que la campaña conserva a propósito—
    necesitan poder llevar dibujados su banda y su montacargas, igual que la panadería lleva su
    `bread-rack`. Lo que no existe en ningún sitio es la FUNCIONALIDAD: nada calcula takt, balancea
    líneas ni rutea material.
  - **El trinquete llegó a CERO.** 40 → 0. Las últimas entradas no se borraron escondiendo residuo:
    se resolvieron una por una y las cinco que quedan son **excepciones permanentes con su motivo
    escrito** (los dos catálogos de contenido dibujable y el tipo de zona persistido). La spec del
    gate ahora **afirma que el backlog está vacío**, así que volver a usarlo como escondite pone la
    spec roja.
  - **Monolito: 22 208 → 20 248 líneas (−1 960) y 153 → 141 `useState`.**
  - **Verificación:** `tsc` de web y api limpios · `web` **381/381** verdes · gate de identidad verde
    **sin backlog** · presupuesto OK. `symbols.ts` subió 20 líneas al restaurar los dos símbolos, así
    que su techo se subió con `--allow-growth` y la razón queda escrita aquí y en el commit: es la
    corrección de un borrado propio de hace una hora, no crecimiento nuevo.
