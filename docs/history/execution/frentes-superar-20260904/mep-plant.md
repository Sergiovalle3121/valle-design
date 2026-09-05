# F6 · Toolsets MEP y Plant 3D

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/history/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/mep*`
- `apps/web/src/lib/cad/plant*`
- `apps/web/src/lib/cad/pid*`
- `apps/web/src/lib/cad/engine/commands/pipe*|duct*|cable*|mep*|pid*`
- `apps/web/src/lib/cad/engine/commands/plant-*`
- `apps/web/src/lib/cad/data-extraction/mep-schedule-table.ts`
- `specs y goldens`

## Cola

1. MEP 3D: ruteo con conectores y elevación, accesorios deducidos por especificación, detección de interferencias con arquitectura, esquemas verticales, y cuantificación con longitudes reales del 3D.

2. Plant: specs de tubería, sólido de tubería en el visor 3D, detección de choques, ortográficos desde el modelo, P&ID↔3D bidireccional, y catálogo ampliable por la organización.

## Cierre

Filas MEP y Plant a 4/4 salvo evidencia independiente.

## Lo que hay que tener presente

Catálogo de FABRICANTE no se finge: el catálogo es propio y ampliable por la organización, y se dice así. Nada de vocabulario ERP/MES (`check:no-industrial-domain`).

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/history/execution/frentes-superar-20260904/mep-plant-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-mep-plant` sobre la rama `campana/superar/mep-plant`. Commits sí;
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
cd /home/user/vd-mep-plant
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### R0 · Reconocimiento del territorio (2026-09-04)

Leí la ficha, el corte de campaña y AGENTS.md, y **medí lo que ya existe** antes de
planear nada. Lo construido, con su tamaño:

- **MEP (Ola F, 2026-09-02)** — `mep-support.ts` (diez servicios con capa, color y tipo de
  línea; doble línea a inglete), `mep-symbols.ts` (ocho bloques dibujados),
  `mep-schedule.ts` (cuadro de instalaciones), órdenes `PIPE`/`DUCT`/`CABLETRAY`
  (`mep-tracing.ts`, 195 líneas) y `MEPSYMBOL` (`mep-symbol.ts`). **Todo en planta, z = 0**:
  `lift()` de `mep-tracing.ts` escribe `z: 0` en cada vértice y `cadPathLength` mide en 2D.
- **Plant (Ola 6, 2026-09-03)** — `plant/line-numbers.ts` (número de línea
  `6"-P-1001-CS150` con sus cuatro hallazgos), `plant/equipment-tags.ts`,
  `plant/pid-symbols.ts`, `plant/pipe-route.ts` (346 líneas: rutas 3D con cota, accesorios
  DEDUCIDOS —codo, te, reducción— y cuatro hallazgos), `plant/pipe-mto.ts` (lista de
  materiales del modelo, con su límite escrito en el título del cuadro),
  `plant/isometric.ts` (isométrico con longitudes verdaderas). Órdenes: `PIDLINE`,
  `PIDLIST`, `PIDEQUIP`, `PIDEQUIPLIST`, `PIDROUTE`, `PIDMTO`, `PIDISO`, todas en la cinta
  (panel «Instalaciones», `ribbon.ts:146`).

Lo que **falta de verdad**, y coincide con lo que la propia rúbrica declara en el `gap` de
`toolset-plant3d`: sólido de tubería con diámetro en el visor 3D, detección de choques
contra estructura, y —de mi cola— la mitad 3D de MEP (cota, metros reales, interferencias),
el catálogo de especificación ampliable por la organización y la conciliación P&ID ↔ 3D.

Tres restricciones que descubrí midiendo, y que deciden la forma de la cola:

1. **Una orden NUEVA cuesta dos archivos fuera de mi territorio.** `ribbon.ts` y
   `docs/cad/evidence/ui-command-reach.json` (que `npm run check:cad` compara contra el
   registro). Una orden nueva dejaría `check:cad` en rojo en este árbol hasta la ventana de
   integración. **Decisión: la cola no añade órdenes**; cuelga de PIDROUTE, PIDMTO, PIDLIST,
   PIPE, DUCT y CABLETRAY, que ya tienen botón. Queda escrito como P-mep-plant-02 por si el
   titular prefiere PIDCLASH/PIDSOLID propios.
2. **El barrido del kernel se estrecha en las esquinas, y se mide.** Prototipé el sólido de
   tubería con un nodo `sweep` de `solid3d` (6", camino de 5 m + montante de 3 m, perfil de
   16 lados) y medí con `solid3dMassProperties`: sin densificar el camino el cuerpo pierde
   **13,6 %** de volumen contra el cilindro teórico (122 931 071 vs 142 209 817), porque el
   perfil se coloca en el plano bisector y la sección se interpola desde el arranque. Con
   puntos extra a ±200 mm del vértice queda en 0,73 % y a ±100 mm en **0,37 %**. Ésa es la
   cifra que la spec de T2 va a fijar, y por eso T2 no es «llamar a sweep».
3. **El sólido `solid3d` ya se ve y ya se corta.** `flatshot-solids.ts:183` recoge
   `entity.type === "solid3d"`, así que emitir el tubo como `solid3d` lo pone en el visor 3D
   **y** en FLATSHOT sin tocar nada de F3 — los ortográficos desde el modelo salen de
   propina, no como entrega aparte.

### T1 · Choques de tubería contra la estructura del propio dibujo (2026-09-04)

`apps/web/src/lib/cad/plant/clash.ts` mide cada ruta 3D contra lo que el dibujo tiene
LEVANTADO, sin que nadie designe nada: muros como caja orientada con su altura y **con los
vanos restados**, sólidos por su envolvente, y las demás rutas. Tres severidades —choque
duro con su profundidad, holgura insuficiente y paso por hueco, que se **informa** y no se
acusa— y todo por DISTANCIA, no por un booleano.

Cuatro decisiones que valen más que el código:

1. **Un vano no es un choque, y ésa es la mitad del valor.** El muro se descompone en las
   cajas macizas que quedan tras restar los huecos que encajan —`wallOpeningFit` +
   `wallOpeningVerticalFit`, exactamente los que usan la planta 2D y `wall-solid.ts`—, por
   franjas verticales cuyos límites son los cantos de los vanos. La misma tubería a la cota
   2500 atraviesa el muro con 176,2 de calado y a la cota 1000, por el vano de la puerta, no
   choca y sale informada. Un hueco que NO encaja en su anfitrión no resta: fallo cerrado,
   el mismo criterio que el sólido del muro, y con su prueba.
2. **Distancia exacta segmento-caja, resuelta y no muestreada.** La distancia con signo a
   una caja es convexa y a lo largo de un segmento es convexa a trozos, con los quiebres en
   los cruces con los seis planos de cara y los tres planos medios; entre dos quiebres el
   conjunto activo es fijo —cuadrática fuera, máximo de tres lineales dentro— y su mínimo se
   resuelve. La spec lo contrasta contra un muestreo de 4001 puntos en 400 casos
   pseudoaleatorios: la fórmula cerrada **nunca** da más que el muestreo y en algún caso da
   menos, que es justo lo que distingue resolver de probar.
3. **Esto NO es INTERFERE, y la cabecera lo dice.** `INTERFERE` corta de verdad los sólidos
   que se DESIGNAN; esto lee el modelo entero y contesta *cuánto* falta, incluso sobre muros
   y huecos, que no son `solid3d` y por tanto `INTERFERE` no ve. El precio es que un
   `solid3d` se mide por su caja envolvente: acusa de más en una pieza con forma de L, nunca
   de menos, y para el corte exacto está `INTERFERE`.
4. **Sin orden nueva.** Cuelga de PIDMTO —que lista los choques junto a los hallazgos que ya
   daba— y de PIDROUTE —que al cerrar la ruta dice contra qué acaba de chocar—, por la
   restricción 1 del R0. El diseño de `PIDCLASH` sigue escrito en P-mep-plant-02 por si el
   titular la quiere.

Evidencia: `npx tsx src/lib/cad/plant/clash.spec.ts` (56 verdes) y
`npx tsx src/lib/cad/engine/commands/plant-route.spec.ts` (36 verdes, 26 antes);
`npm run typecheck` verde en los ocho paquetes; `npm run check:command-integrity` verde
(290 comandos, 0 éxitos falsos).

### T2 · El tubo como sólido FACETADO, visible en el visor 3D y en FLATSHOT (2026-09-04)

`apps/web/src/lib/cad/plant/pipe-solid.ts` barre la ruta 3D y produce el cuerpo del tubo: un
nodo `sweep` de `solid3d` —el esquema ya lo tenía, no se tocó el formato— con un perfil
POLIGONAL de 16 lados al diámetro NOMINAL. PIDROUTE gana la palabra clave `Sólido` y emite
la polilínea y el cuerpo en el MISMO lote de deshacer, en `TU-RUTA` y `TU-SOLIDO`.

Cuatro decisiones que valen más que el código:

1. **El camino se densifica a ±100 mm de cada vértice, y no es cosmético.**
   `lib/brep/sweep.ts` coloca el perfil en el plano bisector del vértice y —lo dice su
   propia cabecera— no lo estira por `1/cos(θ/2)`. Sin puntos intermedios ese
   estrechamiento se INTERPOLA a lo largo de metros de tubo. Medido con
   `solid3dMassProperties` sobre una 6" con montante de 90° (6 000 + 3 000, `π r² L` =
   164 173 223): **143 270 359 crudo (−12,73 %)** frente a **163 638 943 densificado
   (−0,33 %)**. `pipe-solid.spec.ts` fija las DOS cifras a propósito: quitar el densificado
   es perder el 12 % del metrado, y nadie debería poder hacerlo sin verlo romperse.
2. **El polígono es de ÁREA EQUIVALENTE, no inscrito.** Un 16-gono inscrito en el círculo
   nominal tiene 2,55 % menos de sección, y ese 2,55 % viaja al volumen y a cualquier
   metrado que salga del sólido. El circunradio es `r·√(2π/(n·sen(2π/n)))` = `1,013·r`, así
   que la sección vale exactamente `π r²` y el tramo recto sale EXACTO. Consecuencia dicha
   en voz alta y probada: entre caras el tubo mide 0,65 % menos que el nominal y entre
   aristas 1,3 % más. Es una faceta, no un cilindro.
3. **El sólido se PERSISTE, y la deuda se cobra a la vista.** `pipe-route.ts` deduce los
   accesorios en vez de colocarlos, justamente para no mantener dos verdades. Aquí no hay
   alternativa —el visor 3D y `FLATSHOT` leen entidades, no derivaciones—, así que el
   cuerpo lleva una HUELLA de la geometría de la ruta (`pl:huella`, FNV-1a de las
   coordenadas cuantizadas a milésimas, más el diámetro) y PIDMTO la compara con la ruta de
   hoy: «el sólido de 6"-P-1001-CS150 quedó viejo», o «huérfano» si se borró la ruta. Un
   sólido que miente en silencio sería peor que no tenerlo.
4. **Un tubo no choca contra su propio cuerpo.** `clash.ts` deja de contar como obstáculo
   los `solid3d` que declaran su ruta: contarlos acusaría a cada línea de chocar consigo
   misma con el radio entero de calado, y el choque entre tuberías ya lo mide la pasada de
   ruta contra ruta, que además perdona los empalmes.

De propina, sin tocar a F3 ni a `flatshot-solids.ts`: ese módulo ya recoge cualquier
`solid3d`, y `components/cad/viewport/solid-shade-host.ts` ya sombrea los `solid3d` del
documento. El spec lo COMPRUEBA en vez de afirmarlo —`cadFlatshotBodies` devuelve el tubo
con su envolvente exacta—, porque una propina sin evidencia es un claim.

Evidencia: `npx tsx src/lib/cad/plant/pipe-solid.spec.ts` (77 verdes) y
`npx tsx src/lib/cad/engine/commands/plant-route.spec.ts` (49 verdes, 36 antes);
`clash.spec.ts` sigue en 56; `npm run typecheck` verde en los ocho paquetes;
`npm run check:command-integrity` verde (290 comandos, 0 éxitos falsos); la suite completa
del web, 592/593 verdes. **`npm run check:cad` está en ROJO en este árbol y no por T2**: se
para en `check:dwg-evidence`, cuyo artefacto de disco no cuadra con lo que el laboratorio DWG
regenera hoy. El commit de T2 no toca `packages/dwg-codec/`, `docs/cad/evidence/` ni
`scripts/dwg/` —`git diff --name-only HEAD~1 HEAD` sobre esas rutas devuelve cero líneas—,
así que la salida del generador no puede haber cambiado por este frente; queda declarado en
`P-mep-plant-05` para quien tenga ese territorio. El único rojo de la suite,
`lib/lisp/sandbox-surface.spec.ts`, tampoco es de T2: pasa al correrlo con el `tsx` de este
árbol y sólo falla cuando el runner resuelve `tsx` desde el checkout vecino y acaba leyendo
el `builtins/interaction.ts` de allí (el de aquí no tiene ningún `import(`).

### T3 · MEP con cota: el montante se dibuja y se cuenta (2026-09-04)

PIPE, DUCT y CABLETRAY ganan `Elevación` y el montante, `mep-schedule.ts` mide en TRES
dimensiones y las corridas MEP entran por el mismo análisis de choques que la tubería de
proceso. El defecto que cierra estaba medido en el R0 y era de CANTIDAD, no de estilo:
`lift()` escribía `z: 0` en cada vértice y `cadPathLength` medía en planta, así que **un
montante de 2 m contaba cero metros** en el cuadro de instalaciones. Un número que falta y
no deja hueco es peor que un número mal: sale redondo y nadie lo revisa.

Cinco decisiones que valen más que el código:

1. **La cota no se pregunta al arrancar, se teclea a mitad de trazo.** PIDROUTE pregunta la
   elevación de arranque antes del primer punto; PIPE **no puede**, porque el golden
   `81-cad-instalaciones` teclea `PIPE ⏎ · 0,0 ⏎` y una pregunta nueva se comería ese `0,0`
   como si fuera una distancia. Así que la cota arranca en el suelo y `Elevación` la mueve
   cuando alguien la quiere: sin cota, la orden se comporta EXACTAMENTE como antes, y con
   ella mete el tramo vertical en el sitio. La restricción del golden acabó dando la mejor
   interacción de las dos.
2. **`Elevación` lleva atajo de DOS letras (`EL`).** En DUCT la `E` ya es de `Extracción`, y
   `matchCadKeyword` no resuelve un empate —devuelve `null` a propósito, para no adivinar—.
   Una `E` nueva habría dejado mudo un servicio que hoy funciona: la capacidad nueva no
   puede cobrarse rompiendo la vieja.
3. **`spatial` no es el mismo grado en las tres.** PIPE es `spatial: true` —su única entidad
   es la polilínea de los puntos tal como llegan, así que dibuja en el plano del SCU—; DUCT
   y CABLETRAY son `spatial: "elevation"`, porque su contorno a doble línea es una
   convención de PLANTA y se dibuja a la cota de arranque: sobre un faldón saldría plano
   bajo un eje que no lo está. Declararlos `true` mentiría exactamente ahí.
4. **El filtro de puntos coincidentes pasa a medir en 3D.** Dos puntos iguales en planta y
   distintos en cota SON un montante; el filtro de 2D lo habría borrado justo después de
   trazarlo. Es el defecto que habría convertido toda la entrega en una cota que no llega.
5. **Un lector, no dos.** `mep-runs.ts` es ahora el único sitio que sabe qué es una corrida
   MEP (LINE o POLYLINE en capa de servicio, con su receta; el contorno del ducto NO lo es),
   y de ahí beben el cuadro y `plant/clash.ts`. La segunda copia de esa lectura habría sido
   la que se queda sin arreglar.

Lo que entrega, con sus números:

- **El montante se cuenta.** La misma traza de 3.000 en planta, con una cota de 2.000
  tecleada a mitad, mide 5.000 en el cuadro: **2.000 mm más**, los que valían cero. Medida
  en planta seguiría dando 3.000, y la spec lo comprueba con las dos medidas sobre la misma
  tubería.
- **El cuadro suma montantes y CODOS por servicio y tamaño**, deducidos de la geometría con
  la misma trigonometría de `plant/pipe-route.ts` (importada, no copiada). Salen en dos
  secciones nuevas de la TABLE, **después** de las corridas y los equipos y en las mismas
  siete columnas: el golden 81 fija la cabecera y los tres primeros renglones con igualdad
  exacta, así que una columna nueva habría roto el cuadro de todo el mundo para meter dos
  números que caben en «Tipo» y «Cantidad».
- **La interferencia con la arquitectura sale también para las instalaciones.** La misma
  tubería de agua fría a la cota 1.500 atraviesa un muro de 3 m —`CHOQUE contra w1 con 109.5
  de calado`, dicho al tenderla— y a la cota 3.500 pasa por encima sin decir nada. Antes de
  esta ola ese aviso sólo existía para la tubería de proceso.
- **Un trazo a cota cero sale idéntico**: los mismos vértices, los mismos tres metadatos y
  el mismo aviso palabra por palabra. Es la condición para no romper el golden, y está
  fijada con igualdad exacta, no con «contiene».

NUEVO — `apps/web/src/lib/cad/mep-runs.ts` (158 líneas): `cadMepRunsOf`, `cadMepRunLabel` y
`cadMepRunsAsRoutes`, que viste las corridas con la forma de `CadPipeRoute` para el análisis
de choques (con `nominalMm` ya resuelto: una corrida MEP no rotula pulgadas).

MODIFICADO — `engine/commands/mep-tracing.ts` (`Elevación`, montante, vértices con su `z`,
`spatial` por grados, aviso de montantes y de choques); `engine/commands/mep-support.ts`
(`cadPathLength` en 3D, `cadMepRisers`, `cadMepElbows`); `mep-schedule.ts` (lee por
`mep-runs.ts`; cada renglón lleva `rise`, `risers` y `elbows`);
`data-extraction/mep-schedule-table.ts` (secciones de montantes y codos al final);
`plant/clash.ts` (las corridas MEP entran en el mismo informe; `radioDe` acepta el nominal ya
resuelto); `plant/pipe-route.ts` (`nominalMm` opcional en `CadPipeRoute`).

SPEC — `engine/commands/mep-tracing.spec.ts`: **127 comprobaciones** (71 antes), con el
golden 81 tecleado entero contra el registro real —sus cuatro cadenas exactas y sus cuatro
renglones de tabla— porque en este entorno no hay navegador con el que correrlo. Verde
también `npm run typecheck`, `npm run check:command-integrity` (290 comandos, 0 éxitos
falsos), el presupuesto de monolito y los 86 specs de `engine/`.

## «Todavía no»

- **El diámetro es el NOMINAL, no el exterior** (2026-09-04). La holgura se mide con
  `pulgadas × 25,4 / 2`. En las medidas comerciales el exterior real es MAYOR —una `6"` mide
  más de 152,4 mm por fuera— y cuánto más lo dice el catálogo del proyecto, que este
  repositorio no transcribe. Consecuencia declarada en `CAD_PL_CLASH_LIMITS` y en el renglón
  de las dos órdenes: **la holgura que sale es optimista** por el grosor de pared y por el
  aislamiento. Se cierra cuando exista el catálogo ampliable por la organización (T4 de la
  cola), no antes.
- **Un `solid3d` se mide por su caja envolvente** (2026-09-04). Una pieza con forma de L
  acusa de más. Está dicho en el límite y la salida remite a `INTERFERE` para el corte
  exacto. Se cierra el día que haya un índice de caras con el que preguntar la distancia
  real sin evaluar la booleana; hoy no lo hay.
- **Losas, cubiertas, escaleras y `box`/`station` no son obstáculos** (2026-09-04). Sólo
  `wall` (con sus `opening`) y `solid3d`. Los objetos de planta con volumen que
  `flatshot-solids.ts` sí levanta —`box`/`station` con altura de catálogo— quedan fuera
  porque su altura la resuelve un `CadObjectVolumeResolver` que el análisis no recibe. Está
  escrito en `CAD_PL_CLASH_LIMITS`.
- **La holgura por defecto son 50 mm y no salen de ninguna norma** (2026-09-04). No se
  transcribe ninguna; quien tenga la de su proyecto la pasa en `clearance` y la constante no
  interviene. Dicho en la constante, con su porqué.
- **El tubo es MACIZO: no hay espesor de pared** (2026-09-04). El barrido lleva un perfil sin
  agujero, así que el sólido ocupa el diámetro nominal entero. Para ver dónde estorba —que
  es para lo que se modela— es lo correcto y es más barato; para pesar el tubo NO sirve, y
  está dicho en `CAD_PL_SOLID_LIMITS`. Se cierra el día que exista el catálogo de
  especificación ampliable por la organización (T4 de la cola), que es quien tiene el
  espesor.
- **Los codos son a inglete, sin radio de curvatura** (2026-09-04). El vértice de la ruta se
  resuelve con el perfil en el plano bisector: geométricamente es un codo de gajo, no el
  radio 1,5 D de un codo de catálogo. El volumen coincide con `π r² L` dentro del 0,33 %
  —un corte oblicuo por el eje conserva el volumen— pero la FORMA del codo no es la del
  accesorio que se compra. Dicho en el límite.
- **Mover la ruta no rehace el sólido; sólo se avisa** (2026-09-04). No hay orden que
  regenere el cuerpo desde la ruta: PIDMTO declara el que quedó viejo y quien lo quiera al
  día borra el sólido y vuelve a tender con `Sólido`. Regenerar exigiría una orden nueva
  —`ribbon.ts` + `ui-command-reach.json`, fuera de este territorio— y está pedida por
  escrito en `mep-plant-peticiones.md`.

- **El ducto se mide como un cilindro de su ANCHO, sin canto** (2026-09-04). El dibujo
  guarda el ancho del ducto y su eje, no su alto: la orden traza el contorno en planta, que
  es una proyección y no una sección. En el análisis de choques eso hace la holgura
  conservadora en horizontal y **optimista en vertical**, y está dicho en
  `CAD_PL_CLASH_LIMITS`. Se cierra el día que el ducto guarde su canto, que es tocar el
  formato persistido: decisión del titular, no tomada.
- **El contorno a doble línea de un ducto con montante queda a la cota de ARRANQUE**
  (2026-09-04). Una proyección no tiene una sola cota cuando el eje sube. Se elige la del
  arranque, se declara en el aviso de la propia orden y el cuadro nunca lo cuenta: el que
  mide es el eje. Un contorno que siguiera la cota vértice a vértice sería una cinta que no
  es ni planta ni sección, y eso sí sería peor que decirlo.
- **El cuadro de instalaciones no gana columnas** (2026-09-04). Los montantes y los codos
  salen en renglones al final, no en columnas nuevas, porque `e2e/golden/81-cad-instalaciones.spec.ts`
  compara la cabecera y tres renglones con igualdad exacta y **ese golden no se puede correr
  en este entorno** (necesita navegador). La secuencia entera del golden está tecleada en
  `mep-tracing.spec.ts` contra el registro real, que es lo más cerca que se puede estar sin
  navegador; la vuelta completa la da el coordinador en la ventana de integración.
- **PIPE, DUCT y CABLETRAY no emiten sólido** (2026-09-04). La ruta de proceso sí lo hace
  con la palabra clave `Sólido` (T2); una corrida MEP no, porque el ducto no guarda su canto
  y barrer un cilindro del ancho sería dibujar un tubo donde hay un rectángulo. La tubería
  MEP sí podría, y queda para la cola.
