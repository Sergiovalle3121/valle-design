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

### P-architecture-03 · La fila de STAIR en la ESCALERA ya no dice la verdad
- **Archivo:** `docs/parity/ESCALERA.md` (línea 211, la fila de STAIR)
- **Por qué:** entrega `stair-tramos-descansos`, ya construida y probada en mi
  territorio (`apps/web/src/lib/cad/engine/commands/architecture-stair.ts` y su
  spec). La fila declara hoy como límite «Sólo un tramo recto: sin descansos,
  tramos en L o U…», y eso dejó de ser cierto: STAIR reparte las N contrahuellas
  entre dos tramos (`Forma Ele`) o tres (`Forma U`) con descanso de fondo ≥ ancho.
  La ESCALERA es archivo compartido (R2) y no la toco; pero una frontera escrita
  que ya no corresponde es peor que una ausente, porque se cita como evidencia.
- **Cambio exacto:** sustituir la fila entera (línea 211) por esta, sin tocar
  ninguna otra fila ni el peldaño, que sigue en 5:

  ```markdown
  | STAIR: escalera paramétrica recta, en L y en U con descanso por reglamento (Blondel y RCDMX; planta y sólidos) | 5 | golden 78; `architecture-stair.spec.ts` (656): recta 2400 → 14 × 171,4 / 287,1 (desarrollo 3.732,9); en L 7 + 7 con descanso de 1.000 (desarrollo 4.445,7); en U 5 + 5 + 4 con dos descansos (5.158,6); volumen `ancho·h·c·(n−1)·n/2` por tramo y `ancho·fondo·c·k` por descanso, medido por el kernel sobre el árbol persistido; la escalera recta se contrasta contra la huella SHA-256 de cinco lotes capturados ANTES del cambio | Los giros son siempre por descanso y siempre a la izquierda: sin peldaños compensados en el giro, sin caracol, y la U es de dos cuartos de vuelta (tres tramos), no de media vuelta. El máximo de peraltes por tramo de las NTC no se comprueba: el reparto se niega por defecto de tramo (< 3 contrahuellas), nunca por exceso. Sin Justificación (el arranque es la esquina izquierda); el sólido es macizo, no una zanca con canto, y bajo los tramos por encima del primero no se modela nada. **Todavía no.** |
  ```

  El «golden 78» se queda como está: la escalera RECTA emite byte a byte el
  mismo lote que antes —lo fija la huella SHA-256 de la spec—, así que ningún
  golden que dibuje una escalera cambia.
- **Cómo se comprueba:** `cd apps/web && npx tsx src/lib/cad/engine/commands/architecture-stair.spec.ts`
  imprime «656 comprobaciones» en ~1,4 s; `npm run typecheck` y
  `npm run check:command-integrity` (290 comandos) siguen verdes.
- **Estado:** pendiente
