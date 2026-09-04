# Peticiones de F5 · Toolset Architecture a 4/4

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-architecture-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Peticiones

### P-architecture-01 · La columna «Área construida» en el cuadro de superficies
- **Archivo:** `apps/web/src/lib/cad/data-extraction/data-extraction.ts`
- **Por qué:** entrega `schedule-area-construida`. `bim-schedule.ts` (mi territorio)
  pasa a calcular `CadRoomAreaRow.builtArea` —el área del local medida a la CARA
  EXTERIOR de los muros perimetrales y al EJE de los medianeros, que es la
  superficie construida que pide una licencia mexicana y la única cuyos locales
  SUMAN la huella construida de la planta—. El número existirá y estará probado,
  pero el cuadro que llega a la lámina y al CSV se arma en este archivo, que es
  de otro frente: sin este cambio el número no lo ve nadie (fix-or-hide).
- **Cambio exacto:** tres ediciones, todas en `data-extraction.ts`:
  1. Línea 36, cabecera de locales — insertar la columna DESPUÉS de «Área útil»:
     ```ts
     const ROOM_HEADERS = ["Local", "Uso", "Área a ejes (m²)", "Área útil (m²)", "Área construida (m²)", "Perímetro (m)"];
     ```
  2. `roomRowValues` (línea 53) — una entrada nueva en la MISMA posición, con el
     guion largo cuando el área no está definida, igual que `clearArea`:
     ```ts
     row.clearArea === undefined ? "—" : fmt(row.clearArea / 1_000_000, 2),
     row.builtArea === undefined ? "—" : fmt(row.builtArea / 1_000_000, 2),
     fmt(row.perimeter / 1000, 2),
     ```
  3. Título de `buildCadRoomScheduleTable` (línea ~148) — que diga las TRES
     medidas, porque confundirlas cuesta dinero:
     ```ts
     "Cuadro de superficies — a ejes de muro; útil con los lados metidos medio grosor; construida a cara exterior del muro perimetral",
     ```
  Nada más: `columnWidth` sigue en 1 600 y la tabla crece una columna sola.
  `builtArea` es OPCIONAL en el tipo, así que este archivo compila igual antes y
  después de que la mitad de `bim-schedule.ts` aterrice.
- **Cómo se comprueba:** `apps/web/src/lib/cad/bim-areas.spec.ts` (mía) fija los
  números contra valores calculados a mano; tras aplicar esto,
  `apps/web/src/lib/cad/data-extraction/data-extraction.spec.ts` debe seguir verde
  y su cuadro pasa de 5 a 6 columnas. `npx tsx src/lib/cad/data-extraction/data-extraction.spec.ts`.
- **Estado:** pendiente

### P-architecture-02 · IFC: decisión del titular antes que código
- **Archivo:** `IDENTITY.md` (y, si se decidiera que sí, `docs/competitive/rubric.json`)
- **Por qué:** el punto 6 de mi cola pide «IFC 4 básico de exportación». No lo
  escribo, y no por falta de tiempo: `IDENTITY.md` §«Lo que Valle Design NO es»
  dice literalmente que el producto **no es BIM** y que «no hay IFC», y
  `bim-claim-boundary.spec.ts` es el candado ejecutable de esa frase. Entregar un
  exportador IFC es cambiar lo que el producto DICE SER, y eso vive en un archivo
  compartido que sólo el titular toca (R2). Un frente no se auto-autoriza a
  contradecir la identidad del producto.
- **Cambio exacto:** ninguno que yo proponga aplicar a ciegas. Lo que el titular
  tiene que decidir, en este orden:
  1. ¿Se abre IFC como **exportación de intercambio** sin reclamar BIM? Si sí,
     la frase de `IDENTITY.md` pasa de «no hay IFC» a algo como «exporta un
     subconjunto IFC 4 de muros, huecos, losas y niveles como intercambio
     geométrico; no hay disciplinas coordinadas, ni detección de interferencias,
     ni ciclo de vida del activo: no es BIM», y `bim-claim-boundary.spec.ts` se
     amplía para vigilar que la palabra BIM siga sin aparecer en órdenes, alias
     ni rutinas aunque exista IFCEXPORT.
  2. Si se abre, el alcance que yo entregaría es: `IfcProject` / `IfcSite` /
     `IfcBuilding` / `IfcBuildingStorey`, `IfcWallStandardCase` desde la receta
     del muro, `IfcOpeningElement` + `IfcRelVoidsElement` desde `opening`, y
     `IfcSlab` desde los sólidos de SLAB; STEP físico (ISO 10303-21), unidades
     del documento, sin materiales ni propiedades Psets.
  3. Si NO se abre, queda escrito en la ESCALERA como «todavía no» con su
     condición de reapertura, que es donde está hoy.
- **Cómo se comprueba:** hoy, por nada: la verificación que el punto de la cola
  pedía —un lector IFC de terceros como BINARIO— no se puede montar en este
  entorno (la política de egreso sólo deja pasar GitHub; no hay IfcOpenShell ni
  equivalente instalable). Aunque se autorizara, la fila retendría su punto de
  evidencia independiente hasta que F11 consiga el oráculo ajeno. Eso también es
  parte de la decisión: se estaría comprando código, no evidencia.
- **Estado:** pendiente
