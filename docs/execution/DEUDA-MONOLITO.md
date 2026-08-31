# La deuda del monolito, con número y método

`apps/web/src/components/cad/editor/Layout3DEditor.tsx` — hoy (2026-08-22):
**20,248 líneas y 141 `useState`**, medidos por `check:monolith-budget`, que
es trinquete: el número sólo puede bajar.

## Por qué es LA deuda y no una molestia

Cada función de los próximos años —objetos de arquitectura, colaboración en
vivo, la primera vertical— pasa por este archivo y cuesta más que la
anterior. Es el impuesto compuesto del producto: no pagarlo hoy es pagarlo
triplicado mañana, y llega el día en que ninguna sesión (humana o asistida)
puede razonar sobre el archivo completo.

## La meta, publicada como compromiso y no como aspiración

- **Objetivo: menos de 8,000 líneas.**
- **Ritmo mínimo: el trinquete baja AL MENOS un escalón declarado por
  campaña.** Una campaña que toca el editor y deja el presupuesto igual debe
  decir por qué en su informe.
- Fecha de esta declaración: 2026-08-22 (campaña de cimientos, por directiva
  del anexo de crecimiento). Registro del avance: la tabla de abajo, una fila
  por campaña.

## El método: costuras reales, no bloques arbitrarios

Extraer por lo que YA no depende del estado del editor, en este orden de
menor a mayor riesgo:

1. **Lo que ya es puro y está atrapado**: funciones de cálculo definidas
   dentro del componente que no leen refs ni estado → a `lib/`.
2. **Los anfitriones ya modelados**: el patrón existe y funciona
   (CadCommandEngineHost, CadNavigationHost, CadPlotHost viven FUERA con
   `useSyncExternalStore`): cada subsistema del monolito que hable con el
   motor sale como anfitrión propio (selección, capas, xrefs, colaboración).
3. **Los paneles con frontera de props limpia**: JSX de paneles que sólo
   reciben datos y callbacks → componentes propios (el dock de librería y la
   paleta de bloques ya muestran el patrón).
4. **Al final, el efecto de escena**: el cableado THREE/cámara, que es lo que
   más refs cruza, se va cuando los anfitriones de arriba le hayan quitado
   todo lo demás.

Reglas del método: cada extracción con spec en Node (si es lógica) o golden
(si es visible); el presupuesto se baja con `--update` EN el mismo commit; los
163 avisos `react-hooks/refs` del archivo bajan con cada pieza que sale (el
trinquete de lint lo registra).

## Registro

| Fecha | Campaña | Líneas | useState | Qué salió |
| --- | --- | --- | --- | --- |
| 2026-08-22 | cimientos (declaración) | 20,248 | 141 | — (esta declaración; la campaña paralela de pulido retira imports muertos hoy mismo) |
| 2026-08-29 | ingeniería frontend | 19,107 | 140 | Siete cuadros modales y los formateadores de unidad → `components/cad/dialogs/` y `components/cad/studio/format-units.ts`. **−1 113 líneas.** `useState` NO baja: los cuadros extraídos pintaban estado ajeno, no eran dueños de ninguno. Ver el mapa medido de abajo. |
| 2026-08-30 | pipeline de render por lotes | 19,002 | 135 | El anfitrión que enchufa `lib/cad/render/` al editor (reemplaza al `THREE.Line`-por-entidad y el muestreo silencioso de `planCadNativeRenderBudget` como camino por defecto) sale entero como `CadViewportRenderHost` en `components/cad/viewport/render-pipeline-host.ts`, con su propio spec — patrón del punto 2 del método: "los anfitriones ya modelados". **−105 líneas, −5 `useState`** (los cinco que vivían sólo para orquestar la sincronización de mallas por entidad, ahora dueños del anfitrión). Esta fila no se registró cuando la extracción aterrizó; se reconstruye aquí el 2026-08-31 al regenerar la evidencia del pipeline y notar que el registro no coincidía con `monolith-budget.json` — la regla 4 de la campaña de cimientos ("ninguna cifra vive en dos lugares") aplicada contra el propio registro. |
| 2026-08-31 | verificación + evidencia del pipeline de render | 19,002 | 135 | Sin extracción nueva — se explica por qué: el trabajo de esta campaña fue confirmar que la extracción de arriba funciona de verdad (specs de `render/`, `render-pipeline-host.spec.ts` y `render-pipeline-preference.spec.ts` verdes), regenerar `evidence/cad-render-benchmark-100k.json` y `evidence/cad-plan-benchmark-20k.json` desde el arnés, corregir un `declaredMachine` escrito a mano en `cad-plan-benchmark.mts` que seguía declarando el portátil de calibración en cualquier máquina, y poner `CAD_RENDER_PIPELINE.md` al día con lo que el código ya hacía. El candidato para la próxima extracción sigue siendo el mismo de la fila de "Lo que queda dentro" de abajo: la barra de estado y conmutadores (`15193`…`15987`), acoplamiento medio, ya con varias lecturas en `editor-presentation.ts`. |

---

# El mapa medido (2026-08-29)

Lo de arriba es el compromiso; lo de abajo es el terreno, medido bloque por
bloque para que la campaña siguiente no tenga que redescubrirlo.

## Cómo se mide una costura

Un bloque es extraíble cuando se puede describir con un **contrato explícito** — datos que entran,
devoluciones de llamada que salen — y nada más. El número que decide no es «cuántas líneas ocupa»
sino **cuántas variables del cierre del componente toca**. Se mide así:

```bash
# identificadores del cierre que usa un bloque de JSX, excluyendo props de hijos
python3 - <<'PY'
import re
lineas = open('apps/web/src/components/cad/editor/Layout3DEditor.tsx').read().split('\n')
ini = next(i for i,l in enumerate(lineas) if l == '      {showSheetPackage && (')
fin = next(i for i in range(ini, len(lineas)) if lineas[i] == '      )}')
txt = '\n'.join(lineas[ini:fin+1])
print(sorted(set(re.findall(r'(?<![.\w"\'$])([a-zA-Z_][A-Za-z0-9_]*)\s*[({]', txt))))
PY
```

Regla práctica, calibrada con las cinco extracciones de esta campaña: **por debajo de ~20
dependencias el contrato se lee**; por encima de ~35 el componente resultante tiene tantas props que
no es un componente, es el monolito con otra sintaxis. Ese caso no se extrae: primero se saca el
**controlador** (el estado y sus acciones, como un hook o un objeto anfitrión) y sólo después la
vista.

---

## Lo que ya salió, y el patrón que dejó

| Extraído en | Destino | Líneas | Dependencias |
| --- | --- | ---: | ---: |
| Marco común de los cuadros | `components/cad/dialogs/CadDialogShell.tsx` | — | 0 |
| Ayuda / atajos | `dialogs/CadStudioDialogs.tsx` | 57 | 2 |
| Clonar desde plantilla | `dialogs/CadStudioDialogs.tsx` | 66 | 8 |
| Celdas / zonas | `dialogs/CadStudioDialogs.tsx` | 96 | 9 |
| Cantidades (take-off) | `dialogs/CadTakeoffDialog.tsx` | 298 | 5 |
| Versiones y snapshots | `dialogs/CadVersionsDialog.tsx` | 149 | 17 |
| Exportar DXF | `dialogs/CadDxfExportDialog.tsx` | 263 | 10 |
| Revisión de diseño | `dialogs/CadDesignReportDialog.tsx` | 293 | 22 |
| Formateadores de unidad | `components/cad/studio/format-units.ts` | 10 | 0 |

**El patrón, en cuatro pasos:**

1. Localizar el bloque por su condición de nivel superior (`{showX && (`) y su `)}`.
2. Medir las dependencias con el comando de arriba. Si pasan de ~35, parar y extraer el controlador.
3. Mover el **cuerpo** (lo de dentro de `<div className="p-4">`), reindentar seis espacios menos, y
   envolverlo en `CadDialogShell`. El marco aporta `role="dialog"`, título anunciado y cierre con
   Escape, que ninguno de los ocho cuadros tenía.
4. Sustituir cada referencia al cierre por una prop nombrada. Nunca pasar el objeto del editor
   entero: eso conserva el acoplamiento y sólo lo esconde.

**Invariantes de cualquier extracción:** ningún `data-testid` se mueve, ningún texto cambia, la
estructura visible es idéntica, y el trinquete de `monolith-budget.json` baja **en el mismo commit**.

---

## Lo que queda dentro, en orden de salida

### 1 · Paquete premium de entrega — `{showSheetPackage}` · 525 líneas · ~40 dependencias

**El más grande y el que NO se debe extraer todavía.** Toca `paperSpaces`, `orderedPaperSpaces`,
`activePaperSpace`, `activePaperViewportId`, `sheetPackageDraft`, `sheetPackageChecks`,
`sheetPackageManifest`, `sheetPackageReadyPct`, `publicationWarnings`, `layoutPreviewSheet`,
`activeLayoutLayers`, `activeLayoutPreflight`, `professionalBlockDefinitions`, más once acciones
(`addPaperSpace`, `movePaperSpace`, `reorderCadPaperSpaces`, `selectPaperSpace`,
`changeActivePaper`, `changeActiveOrientation`, `updateActivePaperSpace`, `updateActivePageMargin`,
`commitPaperSpaces`, `publishSheetSetPdf`, `applyActiveTitleBlock`…).

Un componente con cuarenta props no es una extracción, es el monolito con otra sintaxis.

**Lo que hacía falta primero — HECHO (campaña de sitio 2026-08-29):** el anfitrión existe
(`palettes/paper-spaces-host.ts`) y es dueño de los CINCO estados (paperSpaces, activo, viewport
activo, cuadro abierto, previsualización) con setters de firma React — los ~120 usos del monolito
no cambiaron. Turno siguiente: migrar las ACCIONES una a una al anfitrión (recibiendo historia y
borrador por parámetro) y entonces el cuadro del juego de láminas sale con dos props.

### 2 · La barra de estado y los conmutadores — dentro del bloque `15193`…`15987`

Unas 790 líneas de cromo inferior: modo de vista, pipeline de render, profundidad de historial,
indicadores. Acoplamiento medio; varias de sus lecturas ya viven en
`components/cad/studio/editor-presentation.ts`. Candidato natural al siguiente turno de vista pura.

### 3 · Las paletas ya montadas como hijos — `14944`…`15148`

`CadSelectionPalette`, `CadHatchPalette`, `CadDimensionPalette`, `CadMLeaderPalette`,
`CadCollaborationPalette`, `CadWorkspaceDock` ya son componentes. Lo que queda dentro del monolito
son sus **listas de props**, algunas de treinta líneas. No es extracción: es agrupar props en
objetos con nombre (`selection`, `draft`, `styles`), lo mismo que ya hizo `CadPaletteOverlays`.

### 4 · Los 140 `useState`

El techo está en 140 y el fichero está exactamente en 140. **Extraer cuadros no baja este número**:
los cuadros extraídos no eran dueños de su estado, sólo lo pintaban. Bajarlo exige mover la
PROPIEDAD del estado, no la presentación — es decir, los controladores del punto 1 y 2.

Agrupaciones evidentes al leer las declaraciones (líneas 1500-1800): el estado de exportación DXF
(4 `useState`), el de espacios-papel y paquete de entrega (~8), el de versiones y snapshots (~5), el
de validación y colisiones (~6). Cuatro controladores se llevarían ~23 de golpe.

---

## Deuda anotada que NO es de tamaño

- **Trampa de foco en los cuadros.** `CadDialogShell` da `role="dialog"`, `aria-modal`,
  `aria-labelledby` y cierre con Escape. **No** mueve el foco al abrir ni lo devuelve al cerrar.
  Hacerlo a medias es peor que no hacerlo —un foco que salta a un sitio equivocado deja al usuario
  de teclado perdido— así que queda como trabajo con nombre: mover el foco al primer control del
  cuadro, atrapar el Tab dentro, y devolverlo al elemento que lo abrió.
- **Colores de semáforo en línea.** `CadDesignReportDialog` conserva `#34d399` / `#fbbf24` /
  `#f87171` en el icono, tal cual estaban en el monolito. Moverlos a tokens es un cambio del sistema
  de diseño, no de una extracción; mezclarlo escondería un cambio visual dentro de un refactor que
  promete no tener ninguno.
- **`templates.ts` no se puede diferir desde la paleta.** 4 982 líneas de datos que parecían un
  import dinámico fácil. No lo son: `lib/cad/engine/index.ts` importa `CAD_LAYOUT_COMMANDS`, que
  importa `CAD_LAYOUT_TEMPLATES`, y el motor de comandos es núcleo del estudio. Diferir las
  plantillas exige diferir los **manejadores de comandos pesados**, uno por uno, detrás de un
  `import()` en su `run`. Es una campaña propia.
