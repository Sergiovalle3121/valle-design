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

### E2 · Área CONSTRUIDA por local, y la huella de la planta (2026-09-04)

El cuadro de superficies ya daba área a ejes y área ÚTIL. Faltaba la que pide una
licencia: la CONSTRUIDA. Sale del MISMO recorrido de caras que las otras dos —no
de una segunda medición que pudiera discrepar—, desplazando cada lado antes de
volver a cerrar las esquinas por intersección:

- si la semi-arista GEMELA del lado pertenece a otra cara-local, el muro es
  medianero y el lado **no se mueve**: se mide al eje, medio para cada local;
- si no, el muro es perimetral y el lado **sale medio grosor a paño exterior**.

Esa asimetría no es un detalle de gusto: es lo único que hace que la suma de las
construidas de todos los locales sea EXACTAMENTE la huella construida de la
planta. Con el medianero a paño por los dos lados cada tabique se contaría dos
veces y el cuadro sumaría más metros de los que tiene el predio.

Lo entregado, con su ruta:

- `apps/web/src/lib/cad/bim-areas.ts` (nuevo, 193 líneas): la geometría —
  `cadOffsetRingArea` (el anillo desplazado, esquinas por intersección) y las dos
  lecturas con nombre, `cadRoomClearArea` y `cadRoomBuiltArea`. Vive aparte para
  no engordar `bim-schedule.ts`, que pasa de 612 a 641 líneas (tope 800) porque
  la vieja `clearArea` se fue con ella.
- `CadRoomAreaRow.builtArea` y `CadRoomAreaRow.wallShareArea` (la fábrica que le
  toca al local: construida − útil, expuesta para poder auditar la diferencia).
- `CadBimSchedule.builtArea`: la huella de la planta, ya sumada, `null` si a
  algún local le falta la suya. Un total incompleto se presenta igual que uno
  completo, y ahí está el error caro.
- `apps/web/src/lib/cad/bim-areas.spec.ts` (nueva, 41 aserciones, 0,79 s):
  rectángulo de 5.000 × 4.000 con muros de 250 partido por un tabique de 150 —
  12,00 / 10,50 / 13,28 m² y 8,00 / 6,75 / 9,03 m², a mano— y la IDENTIDAD
  medida por un camino distinto del que la produce: la huella se calcula desde el
  anillo EXTERIOR desplazado 125 hacia fuera (5.250 × 4.250 = 22.312.500 mm²) y
  se contrasta con la suma de los locales, a 1e-9. Y otra vez sobre una planta en
  L con esquina entrante (26.812.500 mm²), para que no fuera un artefacto del
  rectángulo. Partir un cuarto con un tabique NO cambia la huella: la misma cifra
  con y sin él.
- `bim-schedule.spec.ts` pasa de 57 a 66 aserciones (0,94 s) y sigue verde
  entera: fija que los tres campos llegan por `buildCadBimSchedule`, que es la
  puerta de DATAEXTRACTION, del CSV y de las funciones LISP.

Un hallazgo que no estaba en la entrega y se arregló porque el número acaba en
una licencia: la vieja `clearArea` sólo miraba el SIGNO del área para detectar
que un local es más estrecho que sus propios muros, y en un local CUADRADO el
pliegue es simétrico y el área vuelve a salir positiva — un cuarto de 1,00 × 1,00
con muros de 1,20 declaraba 0,04 m² de superficie útil en vez de decir que no
tiene. `cadOffsetRingArea` comprueba además que ningún lado desplazado acabe
recorrido al revés que el original. Los tres motivos de ausencia se nombran por
separado en `problems` (`parallel`, `degenerate`, `collapsed`): «lados paralelos»
y «más estrecho que sus muros» son averías distintas del dibujo y se arreglan
distinto.

Fuera del territorio: la columna «Área construida» del cuadro y del CSV vive en
`data-extraction.ts`, que es de otro frente. Ya estaba escrita como
**P-architecture-01** con las tres ediciones exactas, y el diseño que se entregó
encaja con ella sin tocar una coma: `builtArea` es opcional, así que ese archivo
compila igual antes y después. Hasta que el coordinador la aplique, el número
existe y está probado pero **no lo ve nadie** — fix-or-hide, dicho aquí.

Gates a la hora de cerrar: `npm run typecheck` verde sobre el árbol entero;
`node scripts/cad/check-monolith-budget.mjs` verde (2.533 archivos); verdes
también los seis specs que consumen el cuadro (`data-extraction` 24,
`room-solid` 20, `wall-openings` 123, `wall-takeoff-solid-parity`,
`appload` 44, `room-solid-host`) y `bim-claim-boundary`. `npm run check:cad`
llega hasta `check:dwg-evidence` y ahí falla por ENTORNO, no por este cambio:
`VALLE_DWG_CORPUS_MIRROR` no está definido en este árbol y el mismo gate falla
igual con los cambios guardados (`git stash` → `EXIT=1`).

Lo que esta entrega NO trajo, con su motivo:

- **Descuento del hueco de escalera y de los patios.** Un patio cerrado por
  muros sale hoy como un local más, así que entra en la huella. Es coherente —
  los locales siguen tapizando el contorno— pero un cuadro de licencia
  distingue superficie cubierta de descubierta, y eso exige saber qué cara
  TIENE techo, que hoy nadie declara.
- **Área construida por NIVEL.** Hay una planta, no un edificio: sin campo
  persistido de nivel (esquema prohibido, R2) sumar plantas sería inventarse el
  dato.
- **Muros compuestos multicapa.** El desplazamiento es medio grosor TOTAL. El
  día que el muro tenga capas, la construida se medirá a la cara del acabado
  exterior y este módulo tendrá que preguntárselo al estilo, no al grosor.

### E3 · Puertas y ventanas por catálogo, con la marca del cuadro (2026-09-04)

DOOR y WINDOW sabían de tres números sueltos y nada más: cada hueco del plano se
tecleaba a mano. Un despacho no pide «900 × 2.100», pide «una P-090» — y teclear
los números uno a uno es la manera fiable de acabar con `P-090x210` y `P-090x211`
en la misma planta, es decir con dos filas del cuadro de carpintería donde hay
una sola pieza.

Ahora las dos órdenes tienen la palabra clave `TIpo` (atajo `I`, porque la `T` ya
es la de `alTura` y dos atajos iguales dejan de servir para los DOS) y ofrecen un
catálogo CERRADO: cinco puertas de 2.100 de alto —P-060 baño, P-070 servicio,
P-080 recámara, P-090 acceso, P-100 acceso principal— y cuatro ventanas con su
antepecho de norma —V-060x040 a 1.800 (la alta de baño, la altura a la que deja
de verse desde fuera), V-120x120, V-150x120 y V-180x120 a 900—.

Lo entregado, con su ruta:

- `apps/web/src/lib/cad/architecture-openings-catalog.ts` (nuevo, 208 líneas): la
  tabla cerrada. Es cerrada por la misma razón que `wall-materials.ts` —una clave
  que no resuelve no debe cruzar la frontera del servidor— y aquí el motivo es
  más directo todavía, porque de la clave salen MEDIDAS: un `Tipo` inventado que
  cayera a un default en silencio colocaría un hueco que nadie pidió y el plano y
  la tabla de cantidades lo darían por bueno. `cadOpeningTypeRefusal` lo niega
  nombrando las claves válidas de su clase.
- `engine/commands/draw-opening.ts` (255 → 366 líneas): el paso del tipo, que
  acepta palabra clave Y texto libre a propósito —sin el texto, un tipo que no
  existe moriría en el analizador con un «Entrada no válida» genérico y el
  usuario no sabría cuáles existen—. El rechazo NO devuelve al paso de designar:
  se queda en el prompt del tipo, así que el siguiente clic sobre el muro no
  coloca nada. Y el prompt principal dice qué se va a colocar («…alojar la puerta
  P-090») y deja de decirlo en cuanto una medida tecleada a mano saca al hueco
  del catálogo: un renglón que siguiera diciendo P-090 sobre una puerta de 850
  sería la mentira más barata de todas.
- `architecture-openings-catalog.spec.ts` (nueva, 336 aserciones, 1,5 s).

Las tres propiedades que hacen que el catálogo sirva para algo, y que se miden:

1. **Una sola marca.** Cada entrada nombra la suya con `openingMark`, la MISMA
   función con la que `bim-schedule.ts` agrupa el cuadro de carpintería, y la
   spec la contrasta carácter a carácter contra la marca que sale de la entidad
   `opening` REALMENTE colocada por la orden. No hay tabla de marcas aquí y otra
   allá.
2. **Elegir y teclear son el mismo camino.** `Tipo P-090` y `Anchura 900 ·
   alTura 2100` producen la misma entidad campo por campo, en las cinco unidades.
   Y el default de cada orden ES una entrada del catálogo por REFERENCIA (no una
   copia de sus números): `defaultOpeningSize` la lee de ahí, así que el hueco
   que sale sin tocar nada tampoco puede despegarse de la tabla.
3. **La unidad no cambia la pieza.** Las medidas viven en milímetros y se
   convierten con `cadFromMillimetres` —la misma tabla de WALL, STAIR, ROOF y
   SLAB; de paso desapareció el `MM_PER_UNIT` duplicado que `draw-opening.ts`
   tenía en privado—. Una P-090 en un plano en metros mide 0,9. El ida y vuelta a
   milímetros se comprueba en mm/cm/m/in/ft y la peor deriva se IMPRIME en vez de
   suponerse: 2,3 × 10⁻¹³ mm (el último bit del doble, en pies).

Ningún campo nuevo en el documento canónico (R2): la clave del catálogo no se
persiste. El hueco sigue guardando sus tres medidas y la marca se DERIVA de
ellas, de modo que no existe una clave guardada que pueda contradecir a la
geometría diciendo «P-090» sobre una puerta de 850.

Gates a la hora de cerrar: `npm run typecheck` verde sobre el árbol entero (8/8);
`npm run check:command-integrity` verde y SIN MOVER una cifra —290 comandos, 0
éxitos falsos, mismo reparto de veredictos—, porque el auto-respondedor designa
entidades antes que teclear palabras clave y nunca llega al paso del tipo;
`check:cad-contract`, `check:no-industrial-domain`, `check-import-direction`,
`check-monolith-budget` y el trinquete de lint (487/492, sin mover) verdes; y
verdes también los once specs vecinos que tocan el cuadro, el motor o los
candados de identidad (`bim-schedule`, `wall-openings`, `bim-areas`,
`wall-takeoff-solid-parity`, `bim-claim-boundary`, `no-ai-boundary`,
`persisted-identifiers`, `locale-es-mx`, `keyboard-alias-collisions`,
`command-engine`, `architecture-stair`).

La suite entera del web (`npm run test:specs`, 592 specs) queda en 591 verdes y
una roja: `benchmark/plan-budget.spec.ts`, que es un cronómetro de pared sobre un
plano de 20.000 entidades y en esta máquina compartida es INESTABLE. Se midió en
vez de suponerlo: ocho pasadas con los cambios (seis verdes; las dos rojas por
métricas DISTINTAS —`panFrameP95Ms` 27,47 sobre 27 y `zoomFrameP95Ms` 23,22 sobre
22, un 2 % y un 6 %—) y cinco con el árbol limpio por `git stash` (cinco verdes,
una de ellas rozando el techo con 26,46 sobre 27). El presupuesto NO se toca: la
regla dice que un umbral no se relaja para pasar. Lo que se declara es la cifra
real y que la métrica que falla —el tiempo de un cuadro de paneo, que sale del
índice espacial y del recorte de viewport— no tiene ninguna relación con una
tabla de datos y una palabra clave de comando.

Lo que esta entrega NO trajo, con su motivo:

- **La marca en un documento que no está en milímetros.** `openingMark` lee sus
  números como mm, así que en un plano en metros o en pies el cuadro de
  carpintería imprime `P-000x000` para todo. Es un defecto VIEJO de
  `bim-schedule.ts`, anterior a este catálogo, y sigue en pie: lo que la spec
  garantiza en las cinco unidades es que catálogo y medida a mano dan la misma
  entidad y por tanto la misma fila, sea cual sea esa fila. Arreglarlo pide que
  `buildCadBimSchedule` lea `meta.unit` y se lo pase a la marca; se deja escrito
  aquí en vez de mezclarlo con esta entrega.
- **Elegir el tipo desde la paleta de propiedades de un hueco ya colocado.**
  `components/cad/palettes/property-model.ts` está fuera del territorio. Hoy el
  catálogo se alcanza por la línea de comandos, que es su superficie legítima; no
  se anuncia en ninguna otra.
- **Puertas de dos hojas, corredizas y cancelería de piso a techo.** La anchura
  del catálogo es la del HUECO de obra y no hay hoja modelada: una de dos hojas
  de 1,60 se teclea a mano hasta que el símbolo sepa dibujarla.
- **Estilo del hueco (carpintería, herrería, marco).** El esquema 7 ya tiene
  `symbolBlock` para el símbolo, pero un «estilo» con material y despiece sería
  campo persistido nuevo (R2).

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
