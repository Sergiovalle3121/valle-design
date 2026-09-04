# F5 · Toolset Architecture a 4/4

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/architecture*`
- `apps/web/src/lib/cad/bim-*`
- `apps/web/src/lib/cad/engine/commands/wall*|door*|window*|stair*|roof*|slab*|space*|elevation*|section*`
- `apps/web/src/lib/cad/ifc* (nuevo)`
- `specs y goldens`

## Cola

1. Estilos de muro compuestos multicapa con prioridad de limpieza en las uniones; puertas y ventanas por catálogo con estilo.

2. Espacios/zonas con etiqueta y cuadros automáticos de superficies (útil y construida) por norma mexicana.

3. Cortes y alzados que se ACTUALIZAN al cambiar el modelo (hoy se generan una vez y no se refrescan).

4. Fases existente/demolición/nuevo con su representación.

5. Escaleras por norma con descansos, y cubiertas a varias aguas.

6. IFC 4 básico de exportación (muros, huecos, losas, niveles), verificado con un lector IFC de terceros como binario; si no se puede instalar, se declara.

## Cierre

Fila Architecture 4/4 salvo el punto de evidencia independiente; ESCALERA Ola E cerrada.

## Lo que hay que tener presente

Modelar volúmenes NO hace de esto BIM: `bim-claim-boundary.spec.ts` sigue mandando. `wall` y `opening` siguen paramétricos.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/architecture-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-architecture` sobre la rama `campana/superar/architecture`. Commits sí;
  **push a origin no** (el coordinador hace un push por ventana).
- **R6 Las reglas de la casa, intactas.** Prohibido relajar gates, umbrales, goldens o
  presupuestos. Prohibido tocar identificadores persistidos (IDENTITY.md, ADR-0010).
  Prohibido renombrar `data-testid`. Fix-or-hide: lo que no gana su evidencia no es visible.
  Ningún claim sin evidencia; lo parcial se declara «todavía no» en tu bitácora, con fecha.
  Las banderas `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` NO se encienden en esta campaña.
- **R7 Bitácora.** Este archivo es tu memoria. Si tu contexto se compacta, lo relees primero.
  Nunca se pregunta al titular: se decide, se anota y se sigue.

## Cómo se valida antes de dar algo por hecho

```
cd /home/user/vd-architecture
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### R0 · Reconocimiento del territorio (2026-09-04)

Antes de escribir una línea se midió qué de la cola YA existe. Tres de los seis
puntos estaban construidos, entero o a medias, y darlos por ausentes habría sido
el error caro:

- **Cortes y alzados que se actualizan: YA ESTÁ, y bien.** `layout/solview-associativity.ts`
  no usa un `dirty` que se marca (falla abierto y en silencio): guarda la HUELLA
  de lo que alimentó la vista y la recalcula al preguntar, así que una edición
  por una ruta imprevista ensucia igual. `layout/soldraw.ts` la redibuja y ADOPTA
  el trazo que el usuario retocó en vez de pisarlo. Y `solview-model.ts` toma el
  MURO como fuente (`cadSolviewIsSourceEntity`: `wall` y `solid3d`), extruyendo
  su contorno ya unido. El punto 3 de la cola está hecho; además vive fuera de mi
  territorio (`lib/cad/layout/`), así que ni se toca.
- **Cuadro de áreas: existe con área a ejes y área ÚTIL** (`bim-schedule.ts`,
  `CadRoomAreaRow.clearArea`), con el nombre del local leído del rótulo y el uso
  del clasificador de `architecture.ts`. Falta el área CONSTRUIDA, que es la que
  pide la licencia. La mitad de «espacios/zonas con etiqueta» ya está.
- **Escaleras y cubiertas: existen, con su límite escrito.** STAIR es recta de un
  tramo (Blondel + reglamento, se niega fuera de norma con el número); ROOF hace
  cuatro, dos y un agua pero SÓLO sobre rectángulos; SLAB acepta contornos con
  interiores vía REGION. Lo que falta es exactamente lo que ESCALERA (Ola E) ya
  declara «todavía no»: varios tramos, cubierta sobre polígono, hueco tecleado.
- **Muro compuesto multicapa: NO existe.** `wall-materials.ts` es una paleta
  CERRADA de cinco acabados de UNA capa (`concrete|brick|drywall|wood|stucco`)
  y sólo pinta color en el visor 3D. Ni estilos, ni capas, ni prioridad de
  limpieza. Punto 1 de la cola, virgen.
- **Fases e IFC: NO existen.** De fases sólo hay la plantilla de arranque
  `planta-de-demolicion` (capas, no fases). De IFC, cero — y ver «Todavía no».

Lo que impone el entorno, medido aquí: los specs de `apps/web` corren con `tsx`
en segundos (`architecture-stair.spec.ts` 3,1 s / 78 comprobaciones;
`bim-schedule.spec.ts` 0,9 s / 57). `check:command-integrity` sale verde con
**290 comandos**. Los goldens de navegador **no se pueden correr**: no hay
navegadores de Playwright instalados (`~/.cache/ms-playwright` no existe) y la
descarga no pasa la política de egreso. Todo lo que se cierre aquí se cierra con
spec de nodo y gates, y el golden se declara pendiente en vez de insinuarse.

Consecuencia de diseño para toda la cola: el esquema del documento canónico está
prohibido (R2), así que **ninguna entrega añade campo persistido**. Lo compuesto
se deriva de `material`, que ya se persiste; el área construida se deriva del
grafo de ejes; la escalera de varios tramos se descompone en planta + sólidos
como ya hacen STAIR, ROOF y SLAB.

### E1 · STAIR en L y en U con descanso por reglamento (2026-09-04)

`Forma` (Recto / Ele / U) reparte las N contrahuellas que ya calculaba la receta
entre uno, dos o tres tramos, y `Descanso` mide el fondo del descanso. El reparto
es el más parejo que permite la división entera con la contrahuella de más en los
primeros tramos —14 → 7 + 7 en L, 5 + 5 + 4 en U— y se NIEGA con el número
cuando un tramo caería por debajo de tres contrahuellas, igual que ya se negaba
una contrahuella de 200 mm; el descanso arranca con fondo = ancho, que es lo que
pide el RCDMX («el ancho de los descansos será cuando menos igual al ancho de la
escalera»), y un fondo menor se niega con las dos cifras — también al ensanchar
la escalera DESPUÉS de teclearlo.

Emite en el mismo lote el contorno de cada tramo y el rectángulo de cada descanso
en orden de subida, las contrahuellas interiores, la línea de subida QUEBRADA por
el centro de cada descanso con su flecha en el último tramo, el SUBE girado con el
primero, y un SOLID3D por pieza: `extrude` de canto por tramo, prisma del
rectángulo por descanso.

Medido: `architecture-stair.spec.ts` pasa de 78 a **656 comprobaciones** en 1,4 s
(117 de ellas son el reparto de N entre 1, 2 y 3 tramos, que tiene que sumar N
exacto). El desarrollo total se mide sobre las COORDENADAS EMITIDAS —la suma de
los primeros lados de los contornos— y cuadra con el que dice el aviso: 4.445,7
en L, 5.158,6 en U. Los volúmenes los da el kernel B-rep sobre el árbol
persistido y se contrastan contra `ancho·h·c·(n−1)·n/2` por tramo y
`ancho·fondo·c·k` por descanso. Y la escalera RECTA se compara contra la huella
SHA-256 de cinco lotes capturados del árbol ANTES del cambio: mismos ids, mismo
orden, mismos vértices hasta la última cifra, mismo aviso.

Fuera del territorio queda P-architecture-03: la fila de STAIR en
`docs/parity/ESCALERA.md` sigue declarando «sólo un tramo recto», y la ESCALERA
es archivo del coordinador.

Lo que esta entrega NO trajo, con su motivo:

- **Peldaños compensados en el giro y escalera de caracol.** Los giros son
  siempre por descanso. Compensar exige repartir el ángulo entre peldaños de
  huella variable, que no es el mismo dentado y no cabía en esta entrega.
- **La U de media vuelta** (dos tramos y un descanso de doble fondo). La U que
  entra es la de dos cuartos de vuelta, tres tramos, como pedía la entrega.
- **El máximo de peraltes por tramo de las NTC.** El reparto se niega por defecto
  de tramo, nunca por exceso: añadir el tope cambiaría lo que hoy emite una
  escalera recta alta, y esta entrega se comprometió a no mover la recta.
- **Giro a la derecha.** El giro es siempre a la izquierda; una palabra clave
  `Giro` es el siguiente paso natural y no está.

## «Todavía no»

- **IFC 4 de exportación (punto 6 de la cola) — 2026-09-04.** No se abre en esta
  sesión y la razón no es de tiempo: `IDENTITY.md` dice con todas sus letras que
  el producto **no es BIM** y que «no hay IFC», y `bim-claim-boundary.spec.ts` es
  el candado ejecutable de esa frase. Escribir un exportador IFC contradice un
  archivo compartido que sólo el titular cambia (R2). Va como petición
  P-architecture-02, no como código. Añadido: la evidencia que el punto pedía
  —un lector IFC de terceros como binario— tampoco se puede conseguir aquí (la
  red sólo alcanza GitHub), así que aunque se escribiera, la verificación
  independiente seguiría siendo «todavía no».
- **Fases existente / demolición / nuevo (punto 4) — 2026-09-04.** Sin campo
  persistido de fase, la única representación honesta es por CAPA, y el estándar
  de capas (`lib/cad/standards/mexican-layers.ts`) está fuera de mi territorio.
  Queda fuera de esta cola en vez de entregarse a medias.
- **Golden de navegador de lo que se entregue — 2026-09-04.** No hay navegador
  en este entorno. Las entregas se cierran con spec de nodo y `check:cad`; el
  golden queda pendiente de la ventana de integración.
