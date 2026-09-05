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

## Ventana de integración 2 · 2026-09-04 (aplicada por el coordinador)

Dos de las tres se aplicaron. **P-02 queda PENDIENTE a propósito**: no pide
código, pide que el TITULAR decida si el producto pasa a exportar IFC y, con
ello, qué dice `IDENTITY.md` sobre sí mismo. Un coordinador integra lo que los
frentes construyeron; no decide qué ES el producto. Su rama de «sí» toca además
`docs/competitive/rubric.json`, que en esta ventana no se edita por ninguna
razón.

Lo que estas peticiones no podían saber, porque se escribieron antes:

- **P-01 no podía quedar verde sin tocar su spec.** La petición decía que
  `data-extraction.spec.ts` «debe seguir verde y su cuadro pasa de 5 a 6
  columnas», pero esa spec fija `rooms.columns === 5` como literal: no hay
  manera de que las dos cosas sean ciertas a la vez. La aserción pasó a 6 y se
  añadió una que MIDE la columna nueva en vez de contarla —10,64 de útil y
  13,44 de construida en el cuarto de 4 × 3 con muros de 200, que son
  3,80 × 2,80 y 4,20 × 3,20—, de 24 a 25 comprobaciones. El golden 77 compara la
  cabecera ENTERA con `toEqual`, así que su arreglo esperado lleva ahora «Área
  construida (m²)». Ningún test se saltó ni se puso en cuarentena: lo que cambió
  es lo esperado, que es exactamente el cambio pedido.
- **El golden 77 no se pudo correr aquí.** No hay navegadores de Playwright
  (`~/.cache/ms-playwright` no existe) y la descarga no pasa la política de
  egreso. La cabecera se sincronizó a mano y queda DECLARADO que no se ejecutó,
  en vez de insinuar que pasó. Las filas del golden miran `slice(0, 3)`, así que
  la columna nueva —que entra en el índice 4, antes del perímetro— no las toca.
- **P-03 se aplicó leyendo la prohibición por su motivo.** La ventana prohíbe
  editar `docs/parity/ESCALERA.md` «para que algo pase». Aquí no pasa nada por
  editarla: ningún gate ni ninguna spec la lee, y el **peldaño de la fila no se
  movió** (sigue en 5). Lo que se movió es una frontera escrita que dejó de ser
  cierta cuando la escalera en L y en U se integró, y una frontera falsa se cita
  como evidencia. Antes de escribirla se corrió
  `architecture-stair.spec.ts`: 656 comprobaciones, recta 2400 → 14 × 171,4 /
  287,1 con desarrollo 3.732,9, L 7 + 7 con descanso de 1.000 (4.445,7), U
  5 + 5 + 4 (5.158,6), y los CINCO lotes de la escalera recta contra su huella
  SHA-256 intacta —por eso el golden 78, que sólo dibuja escaleras rectas, sigue
  citándose sin tocarlo—. La fila nueva declara MÁS límites de los que
  declaraba: sin compensados, sin caracol, la U de dos cuartos de vuelta y no de
  media, el tope de peraltes de las NTC sin comprobar, y nada modelado bajo los
  tramos altos.
- **Fuera de petición, forzado por P-01:** la fila del cuadro de superficies de
  la ESCALERA (línea 209) citaba `data-extraction.spec.ts` (24) y hablaba de dos
  áreas. Con la columna aplicada esa cita quedó vieja por mi propia mano, así que
  se puso al día con las cifras medidas aquí —`bim-schedule.spec.ts` (66),
  `bim-areas.spec.ts` (41), `data-extraction.spec.ts` (25),
  `data-extraction-commands.spec.ts` (27)— y con los dos límites que el frente
  declaró en su bitácora: la construida no descuenta patios ni hueco de escalera,
  y no se suma por nivel. El peldaño tampoco se movió.

Gates de esta ventana: `npm run typecheck` 8/8; los tres gates de comandos
cuadrando en **294** (manifiesto, integridad, alcance y cinta); `npm run
test:specs` **604/604 verdes**. `npm test` deja en rojo `valle-design-api`, que
falla por ENTORNO —`better-sqlite3` no carga su binario nativo— y falla igual con
el árbol limpio (`git stash` → mismo error): no lo trajo este cambio.

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
- **Estado:** **aplicada** (ventana 2, 2026-09-04). Las tres ediciones, tal cual.
  Dos añadidos que la petición no previó, porque el cuadro no lo miran sólo sus
  ojos: `data-extraction.spec.ts` fijaba `rooms.columns === 5` como literal —pasa
  a 6 y gana una comprobación que MIDE la columna, 10,64 y 13,44 m² en el cuarto
  de 4 × 3 con muros de 200 (24 → 25)—, y el golden 77 compara la cabecera entera
  con `toEqual` —su arreglo esperado lleva ahora «Área construida (m²)»—. El
  golden NO se pudo ejecutar: no hay navegadores en este entorno.

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
- **Estado:** **pendiente — la decide el titular, no el coordinador.** La
  petición no pide código: pide que se decida si el producto pasa a exportar IFC
  y, con ello, qué dice `IDENTITY.md` sobre sí mismo. Integrar no es decidir qué
  ES el producto, así que el coordinador no la resuelve por su cuenta ni en un
  sentido ni en el otro. Se añade lo que esta ventana sí puede aportar a la
  decisión: la rama de «sí» toca además `docs/competitive/rubric.json`, que en
  esta ventana no se edita por ninguna razón, y la evidencia independiente que el
  punto 6 de la cola exigía —un lector IFC de terceros como binario— sigue sin
  poder conseguirse aquí. Hasta que el titular decida, lo que rige es lo escrito:
  «no hay IFC», con `bim-claim-boundary.spec.ts` de candado.

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
- **Estado:** **aplicada** (ventana 2, 2026-09-04), con la fila tal cual la
  escribió el frente y el peldaño quieto en 5. Comprobado antes de escribirla, no
  después: `architecture-stair.spec.ts` imprime **656 comprobaciones** con las
  tres escaleras y sus desarrollos (3.732,9 / 4.445,7 / 5.158,6) y los CINCO
  lotes de la recta contra su huella SHA-256 intacta, que es lo que deja en pie
  la cita del golden 78. El gate de integridad va hoy por **294** comandos, no
  290: la petición se escribió antes de tres registros posteriores y esa cifra es
  del día en que se redactó, no un desacuerdo. Fuera de petición y por
  consecuencia de P-01, la fila del cuadro de superficies (línea 209) se puso al
  día con las cuatro cifras medidas en esta ventana; su peldaño tampoco se movió.
