# AXOS CAD Next — Execution & Wiring Audit

> Programa interno: **AXOS CAD Next**. Producto en código/UI: **AXOS CAD**.
> Referente competitivo interno: AutoCAD (benchmark, no copia). Este documento es
> el tracker vivo de la ejecución: auditoría de verdad, matriz de cableado,
> compatibilidad, decisiones, riesgos y estado local/remoto/PR.

## 0. Estado base verificado

| Campo | Valor |
|---|---|
| `origin/main` SHA base | `c257cc35f3949a90fea8603246e4b71b1f314c62` |
| `origin/main` mensaje | `feat(cad): DIVIDE y MEASURE — puntos a lo largo de una curva (AXOS-CAD-DEPTH-B6) (#1372)` |
| Rama de trabajo | `claude/axos-cad-next-multiindustry` (creada limpia desde `origin/main`) |
| Identidad de commits | `Claude <noreply@anthropic.com>` |
| Fecha auditoría | 2026-07-23 |

`origin/main` ya incluye, mergeadas: geometría real A1–A10 (círculo/arco, empalme/
chaflán/desfase, cotas, achurado, tipos de línea, cuartos poligonales,
intersecciones, TRIM/EXTEND/BREAK, OSNAP, splines), B1–B6 (bloques, elipses,
arrays, capas, formato de unidades, DIVIDE/MEASURE) y **WIRE-001** (el adaptador
de exportación emite `CIRCLE` real para objetos redondos).

### PRs CAD concurrentes

| PR | Título | Estado | Decisión |
|---|---|---|---|
| #1373 | `feat(cad): rastreo polar y ortogonal POLAR/ORTHO (AXOS-CAD-DEPTH-B7)` | **draft, CI** | Se deja abierto; **no se fusiona** dentro de este programa (regla del owner: no merge por cuenta propia). Es un módulo puro más. |
| (sin PR) | `text-metrics` (MTEXT, AXOS-CAD-DEPTH-B8) | pre-verificado local, **no pusheado** | No se incluye en esta rama; queda como candidato a cablear, no a acumular. |

Este programa abre **un solo draft PR** desde `claude/axos-cad-next-multiindustry`
y **no lo mergea** (owner decide). Cada merge a `main` despliega producción.

## 1. Diagnóstico central (por qué existe este programa)

`AGENTS.md §6.3` ya documenta el problema, con estas palabras del propio repo:

> *"Several CAD modules … exist and are tested but are only re-exported from
> `apps/web/src/lib/cad/index.ts` and never mounted in the editor. A feature is
> not 'done' until it is reachable by a user. Prefer finishing/wiring an existing
> module over starting a new one."*

Conteo objetivo del barrel:

- `apps/web/src/lib/cad/*.ts` no-spec: **51 módulos**.
- Exportados por el barrel `index.ts`: **26**.
- **~25 módulos ni siquiera están en el barrel** — incluidos TODOS los de
  geometría reciente (`primitives`, `primitive-edit`, `dimension`, `hatch`,
  `linetype`, `polygon-room`, `intersect`, `geom-trim`, `osnap`, `spline`,
  `block`, `ellipse`, `array`, `layer`, `unit-format`, `divide-measure`,
  `polar-tracking`). Son kernel puro sin ningún caller de UI.

**Regla de cableado adoptada** (definición de "hecho" a partir de ahora): una
capacidad CAD no está terminada hasta recorrer

```
modelo → comando/herramienta → preview → render → selección/edición
      → undo/redo → persistencia → reload → import/export → pruebas
```

No se acumulan más módulos huérfanos. Por cada pieza nueva, primero se conecta al
menos una capacidad existente de extremo a extremo.

## 2. Arquitectura encontrada

- Monorepo Turborepo. `apps/web` (Next.js App Router, React, Three.js),
  `apps/api` (NestJS, TypeORM, Postgres), `packages/contracts`.
- Editor CAD: `apps/web/src/components/line-engineering/Layout3DEditor.tsx`
  (~6900 líneas, Three.js). Modelo histórico = **caja alineada a ejes**
  (`Asset`/`CadBox`), render por `buildAssetGroup`/`rebuildAssets`.
- Motor de comandos de dibujo: `apps/web/src/components/line-engineering/cad-command.ts`.
- Geometría pura y utilidades: `apps/web/src/lib/cad/*` (51 módulos).
- Sin sistema de feature-flags en el editor: el mecanismo de seguridad para
  cablear es **campo opcional aditivo** (retrocompatible), como en WIRE-001
  (`CadExportBox.shape?`).

### Dirección objetivo (gradual, sin big-bang)

```
CadDocument (versionado, serializable determinista)
  ├── ModelSpace / PaperSpaces
  ├── Layers / Linetypes / Styles
  ├── Blocks / References
  ├── Entities / SmartObjects        (Line, Polyline, Circle, Arc, Ellipse, Spline, Hatch, Text/MText, Dimension, Leader, BlockRef, …)
  ├── Constraints
  ├── ExternalReferences
  ├── ChangeHistory
  └── BusinessObjectLinks            (link por ID estable a registros AXOS; NO copia la entidad canónica)

CadCommand: validate → preview → commit(txn) → render incremental → persist/version → undo/redo → audited event
```

Con **adaptadores bidireccionales** al modelo histórico de cajas/assets: lectura
compatible, escritura versionada, sin duplicar fuente de verdad ni romper
layouts existentes.

> **Estado (CAD-NEXT-010 ✓):** el esqueleto ya existe en `lib/cad/cad-document.ts`
> — `CadDocument` (meta versionada · capas · entidades box/text/dimension/connector
> · historial) con adaptador bidireccional **sin pérdida** al modelo histórico y
> serialización **determinista** (golden round-trip en CI). Bloques, paper spaces,
> restricciones y enlaces a objetos de negocio se añaden encima, no en paralelo.

## 3. Inventario de módulos y matriz de cableado

> Estados objetivos: `missing` · `kernel-only` · `partial` · `wired` ·
> `production-ready`. (Sin porcentajes subjetivos.)

_(Poblada desde el escaneo de imports del repositorio — ver §3.1.)_

### 3.1a Inventario de módulos (escaneo de imports reales)

50 módulos no-spec en `apps/web/src/lib/cad/`. Callers reales = imports desde
componentes/hooks/páginas, **excluyendo** el spec propio y el barrel `index.ts`.
Hecho estructural clave: **nadie importa el barrel a secas** (`@/lib/cad`); todo
import externo usa subpath explícito, así que estar "sólo en el barrel" da cero
alcance de UI. Puntos de entrada de UI reales: `Layout3DEditor.tsx`,
`ScaleBar.tsx`, `LineBalancePanel.tsx`, `PlantMinimap.tsx`, shim
`precision-input.ts`.

| Estado | # | Módulos |
|---|---|---|
| **wired** | 26 | architecture, collisions, command-line-assist, command-palette, dxf-export-readiness, dxf-import, flow-optimization, keyboard-shortcuts, layers, layout-export-adapter, line-balance, measurements, minimap, object-properties, plot-sheet, precision-input, safety-zones, snapping, snapshots, symbols, templates, toolbar, validation-report, viewport-bookmarks, warehouse-generators, world-scale |
| **partial** | 2 | dxf-export (vía layout-export-adapter), material-flow-route (vía commands/registry) |
| **kernel-only (huérfano)** | 22 | **primitives, primitive-edit, dimension, hatch, linetype, polygon-room, intersect, geom-trim, osnap, spline, block, ellipse, array, layer, unit-format, divide-measure, polar-tracking** (17 del clúster nuevo) · annotations, copilot-contract, line-balance-metrics, line-balance-assignment, text-metrics (5 previos) |

Los **17 módulos de geometría recientes son todos huérfanos**: ninguno está en el
barrel ni lo importa ningún componente. Forman un clúster autocontenido cuya raíz
es `primitives.ts`, importado sólo por sus hermanos huérfanos.

**Solapamientos detectados** (regla AGENTS.md §6.2 "un sistema por concern" — hay
que reconciliar, no cablear un duplicado):

| Concern | Huérfano nuevo | Wired existente | Acción |
|---|---|---|---|
| Capas | `layer.ts` | `layers.ts` (Layout3DEditor:65) | reconciliar; no cablear duplicado |
| OSNAP/snap | `osnap.ts` | `snapping.ts` (:50) | reconciliar |
| Cotas/anotación | `dimension.ts` | `measurements.ts` (:49) + `annotations.ts` | reconciliar |
| Precisión/entrada | `polar-tracking.ts` | `precision-input.ts` (shim) + `snapping` | reconciliar |

El primer cable debe ser una capacidad **genuinamente ausente** (no un duplicado).

### 3.1b Matriz de cableado por capacidad

> Columnas: Kernel · UI · Preview · Undo · Persist · Reload · DXF-in · DXF-out ·
> Tests · Estado. (✓ = presente, ✕ = ausente, ~ = degradado/parcial.)

| Capacidad | Kernel | UI | Preview | Undo | Persist | Reload | DXF-in | DXF-out | Tests | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| Línea / polilínea | ✓ | ✓ | ✕ (previewGeometry muerto) | ✓ | ~ (como cajas de muro) | ✓ | ✕ (backdrop) | ✓ line/polyline | ~ | **wired (degradado a cajas)** |
| Rectángulo / zona | ✓ | ✓ | ✕ | ✓ | ✓ | ✓ | ✕ | ✓ polyline | ~ | **wired** |
| **Círculo** | ✓ (cad-command) | ✓ (herramienta dibuja círculo real) | ✕ (previewGeometry muerto) | ✓ (`shape` en snapshot) | ✓ (`shape` en body + entidad/DTO/servicio) | ✓ (rehidrata redondo) | ✕ (backdrop) | ✓ (CIRCLE real por el adaptador) | ✓ round-trip | **wired (CAD-NEXT-020)** |
| Mover/copiar/desfasar (reducer A) | ✓ | ✓ | ✕ | ✓ | ✓ | ✓ | — | — | ~ | **wired** |
| Comandos B (move/array/mirror/align, ~50) | ✓ | ✓ (palette/NL/línea) | ✓ (previewCadCommand) | ✓ (1 snapshot/cadena) | ✓ | ✓ | — | — | ✓ | **wired** |
| Cotas / anotaciones | ✓ (measurements) | ✓ | ~ | ✓ | ✓ | ✓ | ✕ | ~ (líneas) | ✓ | **wired** |
| Capas — asignación por asset | ✓ (layers) | ✓ | — | ✓ (en snapshot desde CAD-NEXT-021) | ✓ | ✓ | — | ✓ (layer table) | ~ | **wired** |
| Capas — definiciones (vis/lock/color) | ✓ | ✓ | — | ✕ | **✕ (editor no envía `layers`)** | ✕ | — | ~ | ~ | **partial** |
| `objectTags` | ✓ | ✓ | — | ✓ (en snapshot desde CAD-NEXT-021) | **✕ (nunca en el body de save)** | ✕ | — | — | ✕ | **partial (se pierde al recargar)** |
| OSNAP / snap | ✓ (snapping) | ✓ | ✓ (markers) | — | — | — | — | — | ✓ | **wired** |
| DXF export | ✓ production-ready (LINE/POLYLINE/CIRCLE/ARC/TEXT) | ~ (editor aplana a rect) | — | — | — | — | — | ✓ | ✓ round-trip | **partial (kernel listo, UI degrada)** |
| DXF import | ✓ (parser fiel) | ✓ (backdrop + "Convertir entidades" → assets editables) | — | ✓ | ~ (dxf_data crudo) | ~ | ✓ | — | ✓ | **wired (líneas/rect/texto/círculo; falta ARC)** |
| **Geometría nueva** (ellipse, spline, hatch, linetype, fillet/chamfer/offset, trim/extend/break, intersect, block, array, polygon-room, divide-measure, polar-tracking, unit-format, layer, osnap, dimension) | ✓ | **✕** | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ | ✓ (unit) | **kernel-only (huérfano)** |

**Gap crítico de undo (bug real) — RESUELTO en CAD-NEXT-021:** `snapshot()` sólo
capturaba placements/assets/annotations/connectors, pero un dibujo asigna capa y
tags fuera del snapshot (`createRectAssetFromBox`). Al deshacer, el asset se
revertía pero el mapa de capa/tag quedaba **colgando**. Ahora `snapshot()` incluye
`layers`+`tags` y `restore()` los reaplica (fija ref y estado), de forma simétrica
al resto de colecciones — deshacer un dibujo recién creado ya no deja capa/tag
huérfanos. (`objectTags` sigue perdiéndose al **recargar** por otra razón: nunca
entra en el body de `save()`; eso es CAD-NEXT-060, no undo.)

### 3.2 Compatibilidad DXF (round-trip)

Hay **dos capas** de DXF que no coinciden: el **kernel** (`lib/cad/dxf-export.ts`
+ `dxf-import.ts`, con specs de CI) sabe leer y escribir entidades nativas con
fidelidad; el **editor** (`Layout3DEditor.tsx`) sólo usa una fracción de ese
kernel. El gap DXF de AXOS CAD **no es de kernel, es de cableado**.

> Columnas: Export-kernel (`exportCadDxf`) · Export-editor (ruta real
> `exportDxf`→`layout-export-adapter`) · Import-kernel (`importDxfPrimitives`) ·
> Import-editable (¿el editor lo vuelve un asset editable?) · Round-trip test.
> (✓ presente · ✕ ausente · ~ parcial.)

| Entidad DXF | Export-kernel | Export-editor | Import-kernel | Import-editable | Round-trip test |
|---|---|---|---|---|---|
| `LINE` | ✓ | ✓ | ✓ | ✓ (→ muro) | ✓ (`dxf-roundtrip.spec`) |
| `LWPOLYLINE`/`POLYLINE` | ✓ | ✓ (cajas→polilínea) | ✓ (rect si cerrada AA) | ✓ (→ muros / zona) | ✓ (`dxf-import.spec`) |
| `CIRCLE` | ✓ (código 40 = radio) | ✓ (**el editor ya emite `shape:"circle"` — CAD-NEXT-020**) | ✓ (centro+radio) | ✓ (**→ asset redondo — CAD-NEXT-060**) | ✓ (`dxf-roundtrip.spec` + `layout-export-adapter.spec`) |
| `ARC` | ✓ (códigos 50/51) | ✕ (editor no tiene arcos) | ✓ (centro+radio+ángulos) | ✓ (**teselado → muros — CAD-NEXT-062**) | ✓ (`dxf-roundtrip.spec`) |
| `TEXT`/`MTEXT` | ✓ | ~ (etiquetas de asset) | ✓ (mapea contenido) | ✓ (→ nota) | ✓ (`dxf-import.spec`) |
| Tabla `LAYER` (+color) | ✓ | ~ (nombre de capa por caja) | ✓ (recoge capas) | ~ (tag `dxf-layer:`) | — |
| `ELLIPSE` | ✓ (11/21 eje mayor, 40 razón, 41/42 params — **CAD-NEXT-061**) | ✕ (editor no tiene elipses) | ✓ (centro+eje+razón, params→grados) | ✓ (**teselado → muros — CAD-NEXT-062**) | ✓ (`dxf-roundtrip.spec`) |
| `SPLINE` | ✓ (70/71/72/73, nudos 40, control 10/20 — **CAD-NEXT-061**) | ✕ (editor no tiene splines) | ✓ (control+grado+nudos) | ✓ (**De Boor teselado → muros, la CURVA real — CAD-NEXT-062**) | ✓ (`dxf-roundtrip.spec`) |
| `HATCH` | ✕ | ✕ | ✕ | ✕ | — |
| `INSERT`/bloques | ✓ (**sección BLOCKS + INSERT con rotación/escala — CAD-NEXT-064**) | ✕ (el editor aún no emite bloques) | ✓ (**expansión con posición+rotación+escala, anidado ≤4 — CAD-NEXT-063**) | ✓ (vía las primitivas expandidas) | ✓ (`dxf-insert.spec`: export propio → parser real → expansión propia) |
| `DIMENSION` (nativa) | ✓ (**entidad alineada 70=33 + bloque anónimo `*D{n}` con la geometría renderizada — CAD-NEXT-066**) | ✓ (**las cotas del editor salen como DIMENSION vía `measurements`**) | ✓ (**expansión del bloque `*D`; sin bloque → texto de la cota + aviso**) | ✓ (vía las primitivas expandidas) | ✓ (`dxf-dimension.spec`: export propio → parser real → expansión propia + fallback) |

**Lecturas clave:**

1. **Round-trip kernel verificado.** `dxf-roundtrip.spec.ts` exporta un modelo con
   círculo (r=12.5), arco (r=20) y línea, lo reimporta con `importDxfPrimitives` y
   comprueba que **cada entidad sobrevive como su tipo** (círculo→círculo,
   arco→arco) sin warnings `unsupported_entity`. El kernel DXF es
   *production-ready* para LINE/POLYLINE/CIRCLE/ARC/TEXT.
2. **Export del editor — RESUELTO (CAD-NEXT-020).** `exportDxf` ahora propaga
   `shape` al adaptador, así que un objeto redondo sale como `CIRCLE` real (antes
   se aplanaba a cuadrado).
3. **Import editable — corrección de la auditoría.** El editor **sí** materializa
   entidades importadas como assets editables: `convertDxfPrimitivesToEditable`
   (botón "Convertir entidades soportadas", `:5829`) mapea LINE/POLYLINE→muros,
   rect→zona y TEXT→nota; además la Fase 58 (`dxfToWalls`, botón muro) convierte el
   backdrop en muros. Lo que **faltaba** era el círculo: como su primitiva tiene un
   único punto (el centro), caía por el bucle de segmentos y se **descartaba en
   silencio**. **CAD-NEXT-060 (esta iteración)** lo arregla: un `CIRCLE` importado
   se materializa como asset redondo (`shape:"circle"`, centro proyectado + radio
   ×escala), cerrando el round-trip dibujo→export→reimport→objeto editable. El
   `dxfImportPreview` sigue alimentando el panel de conteo; el backdrop
   (`parseDxf`) sigue disponible como fondo de calco.

**Pendiente DXF (deuda honesta):** HATCH nativo no se soporta en el kernel
(el achurado propio de `hatch.ts` sigue sin viajar por DXF); la capa importada
viaja como tag, no como definición de capa real. ARC/ELLIPSE/SPLINE importados
se materializan por teselado (CAD-NEXT-062), no como entidades curvas editables.

### 3.3 Baseline de rendimiento (CAD-NEXT-050)

`lib/cad/perf-baseline.ts`: plano sintético **determinista** (LCG con semilla;
misma semilla ⇒ mismo plano byte a byte) + medición de las operaciones canónicas.
Números medidos en CI/local (Node 22, 1500 entidades, plano limpio por
construcción):

| Operación | O(n²) inicial | con índice espacial (CAD-NEXT-102) |
|---|---|---|
| `layoutToCadDocument` (adaptar) | ~1.7 ms | ~1.4 ms |
| `serializeCadDocument` (266 KiB) | ~1.9 ms | ~3.4 ms |
| Motor de reglas (solape + holgura + límites + ids) | **~83 ms** | **~18 ms (4.6×)** |
| DXF export (1500 entidades) | ~16 ms | ~23 ms |
| DXF import (parser real) | ~20 ms | ~24 ms |
| **Total** | ~124 ms | **~69 ms** |

Lecturas: el documento canónico y su serialización son despreciables incluso a
1500 entidades. El costo dominante era el barrido O(n²) del motor de reglas; el
baseline lo señaló y **CAD-NEXT-102** lo resolvió con un **grid hash** (broad
phase): sólo los pares que comparten celda pasan a la comparación exacta, con
**equivalencia probada contra la fuerza bruta** (250 cajas con 20+ solapes
reales → hallazgos idénticos). El barrido ahora escala ~O(n): listo para planos
de decenas de miles de entidades. El spec corre el baseline en cada CI y deja
los números en la salida (cotas holgadas anti-flaky; las fases DXF fluctúan por
ruido de máquina).

## 4. Primer cable de extremo a extremo (CAD-NEXT-020)

**Capacidad elegida: el círculo real.** Cumple las tres condiciones que fija la
directiva para el primer cable:

- **Genuinamente ausente, no un duplicado.** Ningún módulo wired dibuja círculos
  como entidad; la herramienta de círculo existe pero **coacciona el círculo a un
  cuadrado** al confirmar (`Layout3DEditor.tsx:2322`,
  `createRectAssetFromBox(cx-r, cy-r, r*2, r*2, 'zone', …)`). No choca con ningún
  solapamiento de §3.1a (capas/OSNAP/cotas/precisión).
- **Recorre todo el pipeline** modelo→…→pruebas con cambios pequeños y aditivos.
- **Desbloquea DXF de verdad.** El kernel de export ya emite `CIRCLE` (WIRE-001) y
  el round-trip ya está testeado (§3.2); sólo falta que el editor **propague la
  forma**. Cerrar este cable convierte la fila `CIRCLE` de la matriz DXF de `~` a
  `✓` de punta a punta.

### Recorrido y anclas exactas

| Paso | Estado hoy | Cambio (aditivo, retrocompatible) | Ancla |
|---|---|---|---|
| **modelo** | `Asset` sin forma | `shape?: "circle" \| "rect"` (default rect) | `Layout3DEditor.tsx:247` |
| **comando/herramienta** | círculo→cuadrado | el commit del círculo crea asset con `shape:"circle"` en vez de coaccionar | `:2322` (createRect… en la rama círculo) |
| **preview** | ✕ (previewGeometry muerto) | fuera de alcance del primer cable; se anota como deuda | — |
| **render** | sólo caja | `buildArchetype`/`buildAssetGroup` dibujan geometría redonda si `shape==="circle"` | `:495-731` |
| **selección/edición** | por asset (ya) | el redimensionado conserva círculo (w=h) | reutiliza selección existente |
| **undo/redo** | snapshot de assets (ya) | `shape` viaja en el asset; **sin** tocar el gap de capa/tag de §3.1b | `:271, 1665-1707` |
| **persistencia** | body sin forma | `save()` incluye `shape`; entidad + DTO lo aceptan | web `:4972-4978`; api `sf-line-layout.entity.ts:14-25`, `dto/line-engineering.dto.ts:353-406`, `service:1656-1668` |
| **reload** | rebuild como caja | assets con `shape:"circle"` reconstruyen como círculo | `rebuildAssets :1394-1406` |
| **import/export** | export aplana | `exportDxf` pasa `shape` al adaptador → `CIRCLE` real | web `:4932-4948`; adaptador ya soporta (WIRE-001) |
| **pruebas** | adapter-only | test asset→export propaga forma; el round-trip del kernel ya cubre CIRCLE | `layout-export-adapter.spec.ts`, `dxf-roundtrip.spec.ts` |

**Seguridad del cambio:** todo es campo opcional con default retrocompatible
(`shape` ausente ⇒ comportamiento actual de caja). No hay DROP/rename ni columnas
`NOT NULL` sin default en la entidad (regla aditiva de `AGENTS.md`), y la persistencia
es tenant-scoped por la ruta existente (R3). El cambio de servidor es aceptar y
devolver un campo más en `LayoutAsset`; nada se migra de forma irreversible.

**Fuera de alcance explícito del primer cable** (deuda anotada, no silenciada):
preview en vivo del círculo (previewGeometry sigue muerto), y el gap de undo de
capa/tag de §3.1b — se abordan como unidades propias, no se mezclan aquí.

### Resultado (CAD-NEXT-020 ✓ implementado)

El cable está cerrado de extremo a extremo. Cambios (todos aditivos):

| Capa | Archivo | Cambio |
|---|---|---|
| modelo | `Layout3DEditor.tsx:247` | `Asset.shape?: 'rect' \| 'circle'` |
| comando | `Layout3DEditor.tsx:2305,2322` | `createRectAssetFromBox(...,'circle')` mantiene la caja cuadrada y marca `shape` |
| render | `Layout3DEditor.tsx:495-731` | `buildArchetype(...,shape)` dibuja disco (`ShapeGeometry` + `LineLoop`) |
| undo/persist/reload | `Layout3DEditor.tsx:1683,1285,4988` | `shape` viaja en cada spread `...a` (snapshot, carga, save) |
| export | `Layout3DEditor.tsx:4958` | el asset redondo pasa `shape:'circle'` al adaptador → `CIRCLE` real |
| servidor | `sf-line-layout.entity.ts`, `line-engineering.dto.ts`, `line-engineering.service.ts` | `LayoutAsset.shape` aceptado/validado (`IsIn`)/persistido (aditivo, sin migración destructiva) |
| pruebas | `layout-export-adapter.spec.ts` | round-trip por `exportCadLayoutDxf` → `importDxfPrimitives`: el círculo vuelve como círculo con centro y radio intactos |

Gates verdes: `tsc` (web+api), `eslint`, `test:specs` (81/81), `check:nav`,
`build` (EXIT 0), `check:tenant-safety` (1106/1106, sólo desplazamiento de líneas).

## 5. Decisiones

- **D1 — No merge en este programa.** Un solo draft PR; el owner decide la
  fusión. Cada merge a `main` despliega producción.
- **D2 — Wiring-first.** Se prioriza conectar módulos huérfanos de alto valor
  sobre añadir geometría nueva. Definición de "hecho" = recorrido completo (§1).
- **D3 — Aditivo y retrocompatible.** Cambios al modelo `Asset`/`CadExportBox` y
  al documento son campos opcionales; el código existente que no los usa se
  comporta igual. No se migran todos los layouts en una operación irreversible.
- **D4 — Adaptadores, no reescritura.** No hay big-bang del editor; se introduce
  el `CadDocument` canónico detrás de adaptadores.
- **D5 — DWG honesto.** No reverse-engineering. Se define el contrato
  `CadInteroperabilityProvider`; sin licencia/credenciales válidas no se declara
  importación DWG funcionando. **Implementado (CAD-NEXT-061):**
  `lib/cad/interop-provider.ts` — contrato + registro + proveedor DXF nativo
  funcional + placeholder DWG que responde `available:false` con la razón exacta
  (licencia ODA/RealDWG) y cuyo import/export **falla explícitamente**; un
  proveedor real con el mismo id lo sustituye sin tocar callers (spec lo prueba).
- **D6 — IA/optimización gobernada.** La IA propone con preview, límites y
  auditoría; nunca autoaplica sobre un diseño aprobado.

## 6. Riesgos y deuda

- **R1 — Editor grande sin specs de CI.** `Layout3DEditor.tsx` (~6900 líneas) no
  está cubierto por los specs de CI (todos son de `lib/cad`). Todo cableado al
  editor se hace en cambios pequeños, aditivos y reversibles, apoyados en `tsc` +
  `build` + specs de las capas puras que sí testea CI.
- **R2 — Pérdida en persistencia/exportación.** Riesgo de que estado (shape,
  layer, tags, grupos) se pierda al guardar/recargar o degrade al exportar. Se
  audita en §3.2 y §4 antes de cablear.
- **R3 — Multi-tenant.** Los documentos/bloques/revisiones deben ser
  tenant-scoped; ningún cruce de tenant. Se verifica en la ruta de guardado.
- **R4 — Concurrencia.** No se implementa edición multiusuario simultánea hasta
  definir modelo de conflictos; se prioriza revisión asíncrona.

## 7. Estado de entrega

| Estado | Detalle |
|---|---|
| LOCAL | rama `claude/axos-cad-next-multiindustry` desde `c257cc35` |
| PUSHED | ✓ `origin/claude/axos-cad-next-multiindustry` |
| DRAFT PR | ✓ #1374 (draft) — auditoría CAD-NEXT-000 |
| MERGED | NO — fuera del alcance de este programa; el owner decide la fusión |

## 8. Próximas unidades

1. ~~**CAD-NEXT-020** — primer cable de extremo a extremo.~~ **✓ Hecho:** el
   círculo real (§4 Resultado). Modelo→comando→render→undo→persistencia→reload→
   export→pruebas, todo aditivo y con gates verdes.
2. ~~**CAD-NEXT-010** — `CadDocument` canónico versionado + adaptador al layout
   histórico + golden tests.~~ **✓ Hecho:** `lib/cad/cad-document.ts` — documento
   único (meta versionada, capas, entidades tipadas box/text/dimension/connector,
   historial), adaptador **bidireccional sin pérdida** (`layoutToCadDocument` ↔
   `cadDocumentToLayout`, incluida `shape:"circle"`), serialización **determinista**
   (mismo contenido → mismo texto) y `commitChange` inmutable. Golden round-trip en
   `cad-document.spec.ts` (82/82). **Falta** cablear la persistencia/undo del editor
   sobre este documento (CAD-NEXT-011).
3. **CAD-NEXT-060/061** — DXF: **✓ círculo importado → asset editable**;
   **✓ ELLIPSE nativa** en el kernel (export con eje mayor/razón/params,
   import con normalización a grados, round-trip contra el parser real; header
   subido a `AC1015`, la versión mínima honesta para ELLIPSE); **✓ contrato
   `CadInteroperabilityProvider`** con proveedor DXF funcional y placeholder DWG
   honesto (D5). Queda: asset destino de ARC/ELLIPSE en el editor; SPLINE/HATCH/
   INSERT/DIMENSION nativas; golden fixtures adicionales.
4. **CAD-NEXT-021** — ~~cerrar el gap de undo de capa/tag de §3.1b~~ **✓ hecho**
   (capa/tags ahora en el snapshot). Queda: preview en vivo del círculo (revivir
   `previewGeometry`).
5. **CAD-NEXT-090 (primer vertical obligatorio)** — **✓ framework de Industry
   Packs** (`lib/cad/industry-pack.ts`): contrato de objeto inteligente
   (parámetros + `toEntities` al documento canónico + `calculate` de negocio +
   `validate` de dominio) y un registro. **Dos industrias contrastantes** sobre el
   MISMO documento/render: manufactura (**estación de trabajo**, caja rectangular,
   área + throughput) y proceso (**tanque**, **círculo real** vía `shape:"circle"`,
   volumen + capacidad). El spec prueba que ambas conviven en un solo `CadDocument`
   con round-trip. Falta: paleta en el editor + persistencia de instancias
   (CAD-NEXT-091) y motor de reglas transversal (CAD-NEXT-100).
6. **CAD-NEXT-100 (reglas)** — **✓ motor de reglas transversal**
   (`lib/cad/rule-engine.ts`): corre reglas sobre el `CadDocument` y devuelve
   hallazgos accionables con las entidades implicadas, ordenados por severidad;
   una regla que revienta no tumba el motor. Reglas universales incorporadas: ids
   duplicados, solape, fuera de límites (footprint) y holgura mínima (pasillos),
   sobre la AABB con rotación (círculos por caja envolvente). No muta el documento
   (propone, no aplica). Cubierto por `rule-engine.spec.ts` (84/84). Falta: panel
   de hallazgos en el editor + reglas normativas por Industry Pack (CAD-NEXT-101).
7. **CAD-NEXT-091 (paleta de Industry Packs en el editor)** — **✓ hecho**: la
   sección "Industry Packs" del panel de objetos lista los objetos registrados;
   soltar la **estación** crea una caja y el **tanque** un disco redondo
   (`shape:"circle"`), reutilizando `addAsset` → render → undo → persistencia →
   export. El toast muestra los cálculos del objeto (throughput / volumen). El
   primer vertical obligatorio queda **alcanzable por el usuario**. Ya son **tres
   industrias** en el registro (manufactura, proceso y **civil** — cajón de
   estacionamiento con regla normativa de accesibilidad), todas en la misma paleta
   sobre el mismo documento.
8. **CAD-NEXT-101 (reconciliar reglas, NO duplicar)** — el editor ya tiene un
   sistema de validación cableado (`buildCadValidationReport`: colisiones,
   holguras, límites, seguridad). El motor de reglas de CAD-NEXT-100 **solapa** con
   él (regla AGENTS.md §6.2 "un sistema por concern"). **Decisión:** no se añade un
   panel de reglas paralelo; el motor sobre `CadDocument` es el sucesor y se
   reconcilia migrando `buildCadValidationReport` a correr sobre el documento
   canónico, no duplicándolo. Añade además reglas normativas por Industry Pack
   (ya hay una: accesibilidad del cajón, CAD-NEXT-090). **Pieza 1 hecha:**
   `collisions.ts` (el núcleo del REVISAR PLANO cableado) ya comparte el broad
   phase `gridPairCandidates` del motor de reglas — un solo núcleo geométrico y
   los dos barridos del editor dejan de ser O(n²), con **equivalencia probada**
   (300 cajas → resultados idénticos al doble bucle, mismo orden).
   **Pieza 2 hecha:** el motor canónico ALIMENTA el reporte cableado —
   `buildCadValidationReport` acepta el `CadDocument` del estado actual (el
   editor lo construye con una línea vía `editorSnapshotToCadDocument`) y corre
   las reglas que el barrido histórico no cubre: **ids duplicados** y **fuera
   del área de trabajo**, ahora TAMBIÉN sobre las estaciones (las reglas
   geométricas del motor cubren `box` y `station`). Los hallazgos entran al
   mismo panel de issues con severidad, selección y resaltado.
9. **CAD-NEXT-011** — persistencia/undo del editor sobre `CadDocument`.
   **Pieza 1 hecha (esquema v2):** el documento canónico ya sostiene TODO lo
   que lleva el snapshot de undo del editor — cajas con **`tags`** y la nueva
   entidad **`station`** (colocaciones de línea con geometría y rotación,
   capa estable `Stations`) — con round-trip sin pérdida, serialización
   determinista y compatibilidad con layouts v1 (sin tags/estaciones no se
   inventa nada). `CAD_DOCUMENT_SCHEMA` sube a 2 (aditivo).
   **Pieza 2 hecha (undo canónico):** las pilas de undo/redo del editor
   almacenan **`CadDocument`** — cada Ctrl+Z/Ctrl+Y convierte el estado por el
   adaptador puro `editor-snapshot.ts` (snapshot del editor ↔ documento, con
   capas asignadas y tags de assets Y estaciones, golden round-trip probado).
   El documento canónico deja de ser un modelo paralelo: es la memoria real
   del deshacer del editor. Falta la pieza 3: persistencia al API como
   documento serializado.
10. **CAD-NEXT-092/093 (verticales 4 y 5)** — **✓ hechos**: **Logística/Almacén**
    (rack de pallets con posiciones por nivel = `floor(frente / (1200+100))` ×
    niveles, aviso si el fondo no cubre un pallet; pasillo de montacargas con
    regla normativa de ancho ≥ 3500 mm) y **Retail/Comercio** (góndola con
    facings por nivel/totales y error si el frente no cabe un facing; línea de
    cajas que emite DOS entidades — el mueble y una **zona de fila** `id:queue`
    detrás — con aviso si la fila baja de 4000 mm y clientes estimados =
    `floor(fila/600)`). Ya son **cinco industrias** (manufactura, proceso,
    civil, logística, retail) sobre el MISMO documento, registro, paleta y
    motor de reglas; la zona de fila demuestra objetos inteligentes
    multi-entidad revisables por las reglas como cualquier caja.
11. **CAD-NEXT-066 (cotas DIMENSION nativas)** — **✓ hecho**: las mediciones
    dejan de aplanarse a línea+texto y viajan como entidad **DIMENSION real**
    (alineada, 70=33) que referencia un **bloque anónimo `*D{n}`** con la
    geometría renderizada por `dimension.ts` (extensiones, línea de cota,
    flechas, texto) — el mismo esquema que escribe AutoCAD. El import expande
    el bloque de vuelta a primitivas; una DIMENSION ajena sin bloque cae
    honestamente al texto de su medición con advertencia
    `dimension_without_block`, nunca geometría inventada. El cable del editor
    salió gratis: `measurements` del adaptador ahora emite DIMENSION, así que
    las cotas del editor llegan a AutoCAD como cotas. Round-trip probado con
    el parser real (`dxf-dimension.spec.ts`).
