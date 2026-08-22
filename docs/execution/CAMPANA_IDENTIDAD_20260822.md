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
