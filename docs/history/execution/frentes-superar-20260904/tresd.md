# F3 · El 3D honesto (dueño del monolito)

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/history/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/brep/**`
- `apps/web/src/lib/cad/solid*`
- `apps/web/src/lib/cad/wall-*`
- `apps/web/src/components/cad/viewport/**`
- `apps/web/src/components/cad/editor/**`
- `apps/web/src/lib/cad/engine/commands/solid*|3d*|section*|render*`

## Cola

1. Entidad con normal: círculo, arco y polilínea con bulge en plano inclinado, guardados y dibujados. El cambio de esquema (`cad-entities-v*.ts`, `cad-document*.ts`) es de archivo compartido: se PIDE al coordinador con el diseño completo por `tresd-peticiones.md`; migración ADITIVA, nunca destructiva.

2. Cota Z visible: la geometría 2D deja de aplastarse al suelo en el visor 3D (los sólidos ya van a su altura; la contradicción se ve en cualquier planta con niveles).

3. SOLIDEDIT completo: las once ramas restantes (mover/girar/desfasar/inclinar/borrar/copiar/color de cara; copiar/color de arista; estampar/vaciar/limpiar de cuerpo).

4. Modos de las primitivas: CYLINDER 3P/2P/Ttr/Elíptico, CONE, PYRAMID Arista, POLYSOLID Arco.

5. SECTIONPLANE con bloque 2D/3D generado y sección viva (LIVESECTION). FLATSHOT ya existe: completar la familia.

6. Materiales por objeto, luces y cámaras con nombre, y un render presentable en el navegador (PBR + sombras + entorno con three.js, exportable a imagen). No es fotorrealismo de trazado de rayos y se dice así.

7. ANIPATH: grabar el recorrido a video.

## Cierre

Goldens por capacidad; ESCALERA con los «todavía no» de la Ola C cerrados o re-declarados con fecha.

## Lo que hay que tener presente

Eres el ÚNICO frente autorizado a tocar `Layout3DEditor.tsx` en esta ventana (R4). El presupuesto del monolito sólo puede BAJAR: si extraes, corre `node scripts/cad/check-monolith-budget.mjs --update`. El 3D es FACETADO y se dice así; nada de fingir kernel exacto.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/history/execution/frentes-superar-20260904/tresd-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-tresd` sobre la rama `campana/superar/tresd`. Commits sí;
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
cd /home/user/vd-tresd
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### 2026-09-04 · Cierre del frente: lo que se verificó antes de darlo por bueno

Esta entrada no añade código. Es el acta de la comprobación de cierre, escrita
porque las cinco entregas de arriba se declararon hechas y la campaña integra
**ramas enteras**: si algo de esto no se sostuviera, es más barato saberlo aquí
que en `main`.

**Lo que hay de verdad en la rama.** Cinco commits sobre `646b969` y sólo
dieciséis archivos, todos dentro del territorio de la ficha
(`lib/brep/`, `lib/cad/engine/commands/`, `lib/cad/` y esta bitácora). Nada del
registro, de la cinta, del esquema del documento ni de ningún archivo
compartido prohibido; comprobado con `git diff --name-only 646b969..HEAD` y no
con la memoria de lo que se hizo.

**Los gates, con su salida literal.**

| Gate | Resultado |
| --- | --- |
| `npm run typecheck` | `Tasks: 8 successful, 8 total` (10,3 s) |
| `npm run check:command-integrity` | `Integridad de comandos OK: 274 comandos · 82 mutan verificado · 48 delegan · 21 informan · 115 declaran su límite · 8 exentos declarados · 0 éxitos falsos.` |
| `npm run check:cad` | **se detiene en `check:dwg-evidence`** (ver abajo). Los 15 pasos anteriores, verdes; los 13 posteriores, corridos uno por uno, verdes |
| `npm test` | `579/579 specs verdes` · `Tasks: 7 successful, 7 total` (6 m 14 s), código 0 |

Los cinco specs del frente, corridos uno por uno, con la cifra que cada uno
imprime al terminar: `solid3d-frontera.spec.ts` **279** comprobaciones y 54
sólidos cerrados; `solids-edit.spec.ts` **119**; `solids-primitives.spec.ts`
**105**; `shell.spec.ts` **89**; `coplanar-merge.spec.ts` **76**. Las cifras
coinciden con las que las entregas declararon, que es lo que se estaba
comprobando.

**El candado se probó rompiéndolo, no leyéndolo.** La entrega 5/5 afirma que
`solid3d-frontera.spec.ts` es un candado y no una lista. Una afirmación así no
se verifica corriéndola en verde —un spec que no comprueba nada también sale
verde—, sino mutando la fuente y exigiendo que se ponga rojo *nombrando la
causa*. Dos mutaciones, las dos sobre `solids-edit.ts`, las dos revertidas con
`git checkout --` y con el árbol comprobado limpio después:

| Mutación | Lo que dijo el spec |
| --- | --- |
| Quitar `y Material` del renglón de ausencias del prompt de Cara | `SOLIDEDIT Cara Material: y lo que dice la nombra` |
| Quitar `CLEAN` de las opciones de la rama Cuerpo | `rama cUerpo: toda operación declarada como existente se ofrece de verdad` |

Las dos rompen el spec y las dos dicen por qué. El candado sostiene lo que dice
sostener: una rama no puede desaparecer en silencio, y una ausencia no puede
dejar de nombrarse donde el dibujante la lee.

**La corrección al encargo, medida otra vez y por fuera.** La entrega 2/5
corrige la fórmula del encargo para el cilindro elíptico. Como es una
afirmación que *contradice* lo que se le pidió al frente, no basta con que su
propio spec la respalde: se volvió a medir con un script aparte, que no reusa
los ayudantes de ese spec y que construye la entidad y la evalúa por el camino
real (`solid3dBody` + `planarBodyVolume`):

```
cilindro elíptico  medido=47123.889803847  pi*a*b*h=47123.889803847  err.rel=0.000e+0
  a=b=30            medido=70685.834705770  pi*r^2*h=70685.834705770
cono elíptico      medido=15663.143066406  pi*a*b*h/3=15707.963267949
  factor medido=0.997146657350  sen(2pi/48)/(2pi/48)=0.997146657350
  contraste: sen(pi/48)/(pi/48)=0.999286205823 (el del encargo)
```

Queda confirmado, y en número: el cilindro elíptico mide **π·a·b·h exacto**
(error relativo 0), con `a=b` coincide con el cilindro circular del mismo radio,
y el factor de faceta que sí existe —el del cono elíptico— es
**sen(2π/48)/(2π/48) = 0,99714666**, no el `sen(π/48)/(π/48) = 0,99928621` que
pedía el enunciado. El encargo tenía mal el ángulo: θ es la vuelta entera
partida por N, no la mitad. El script de medición no se deja en el árbol: lo
que mide ya está asertado en `solids-primitives.spec.ts:206-207`, y un segundo
spec que compruebe lo mismo es peso muerto que envejece.

**Las cifras de papel de las peticiones, comprobadas donde se asertan.** Las
cifras que P-tresd-04 le ofrece al coordinador están medidas y no redactadas:
`shell.spec.ts:59` aserta `1_000_000 - 512_000` (la caja de 100³ vaciada 10 deja
**488 000**) y `shell.spec.ts:254` aserta `200*100*50 - 180*80*30` = **568 000**,
que es la que sostiene que Vaciar funciona sobre un cuerpo fragmentado *después*
de `Cuerpo·Limpiar`.

**Las cuatro peticiones aplican limpio.** De poco sirve una petición que cita un
renglón que ya se movió, así que se verificaron los cuatro destinos uno por uno,
sin tocarlos: `command-summaries.ts:248` sigue diciendo palabra por palabra
`"Edición de sólidos: extruir una cara, comprobar un cuerpo o separar una
unión."` (P-tresd-01) y `:214` el `"recorrido de tramos rectos"` de POLYSOLID
(P-tresd-03); `docs/parity/ESCALERA.md:174` conserva íntegra la celda que
P-tresd-03 cita como sustituible, y `:175` el renglón de SOLIDEDIT de tres ramas
que corrige P-tresd-04. Los cuatro textos citados son subcadena exacta de su
archivo: el coordinador puede sustituir sin adivinar.

**El presupuesto no se movió y el archivo grande encogió.**
`solids-primitives.ts` pasó de **767 a 745** líneas (comprobado contra
`git show 646b969:`), que era la condición del encargo: que el archivo grande
encogiera de verdad y no sólo se repartiera. `Layout3DEditor.tsx` sigue en
**18 388** líneas sobre una asignación de 18 454; ninguna entrega lo tocó y
`check:monolith-budget` sale verde sin `--update`.

### 2026-09-04 · Entrega 5/5 · La frontera del 3D, ejecutable

Nuevo `apps/web/src/lib/cad/solid3d-frontera.spec.ts` (764 líneas, **279
comprobaciones**). No mide geometría —eso ya lo hacen `solids-edit.spec.ts`
(119), `solids-primitives.spec.ts` (105), `coplanar-merge.spec.ts` (76) y
`shell.spec.ts` (89)—: mide la **frontera**. Recorre una por una las ramas de
SOLIDEDIT y los caminos de las ocho primitivas y exige de cada una que haga UNA
de tres cosas, nunca otra —y de paso comprueba **54 sólidos cerrados** sobre el
árbol persistido, el contador que impide que el veredicto se vuelva un sello de
goma—:

- `escribe`: conducida hasta el final termina en `result.kind === "document"` con
  al menos una orden, y todo sólido que inserte o sustituya es un cuerpo
  **cerrado** (`bodyIsClosed` sobre el árbol persistido). Es la única forma de
  decir «esto existe».
- `responde`: existe y no toca el documento —una consulta, o un límite que se
  rechaza a tiempo—, y termina en `message` con texto **no vacío** que contiene
  su motivo. Un «Hecho» vacío no cuenta.
- `ausente`: no se ofrece como palabra clave, su nombre aparece donde el
  dibujante lo lee, y forzarla no escribe **nada**.

#### Por qué es un candado y no una lista

Las dos tablas se cotejan **en los dos sentidos** contra lo que el propio diálogo
anuncia, y ninguna de las dos fuentes se copia a mano:

1. Las palabras clave se **descubren** recorriendo la máquina de estados de cada
   orden en anchura (`teclasOfrecidas`), con las opciones de cada prompt más un
   alfabeto fijo de puntos, distancia e Intro. Toda clave descubierta tiene que
   estar declarada; toda clave declarada tiene que ser ofrecida.
2. Los nombres que cada prompt declara «todavía no» se **parsean del mensaje** y
   se cotejan con los renglones `ausente` de esa rama, en los dos sentidos.

Probado con tres mutaciones, y las tres rompen el spec:

| Mutación                                          | Lo que dice el fallo                                          |
| ------------------------------------------------- | ------------------------------------------------------------- |
| quitar `Material` del renglón del prompt de Cara  | «SOLIDEDIT Cara Material: y lo que dice la nombra»            |
| quitar `CLEAN` de las opciones de Cuerpo          | «rama cUerpo: toda operación declarada como existente se ofrece de verdad» |
| añadir `CUBE` a las opciones de POLYSOLID         | «POLYSOLID: toda opción que la orden ofrece está declarada como modo (sobran Cubo)» |

#### La cifra real: no son catorce, son DIECISÉIS

La cabecera de `solids-edit.ts` decía «unas catorce operaciones» y la cola de
este frente hablaba de «las once ramas restantes». Enumerarlas una por una para
la tabla obligó a contarlas: SOLIDEDIT reparte **dieciséis** operaciones entre
sus tres ramas —nueve de Cara (Extruir, Mover, Girar, Desfasar, Inclinar,
Borrar, Copiar, Color, **Material**), dos de Arista (Copiar, Color) y cinco de
Cuerpo (Estampar, Separar, Vaciar, Limpiar, Comprobar)—, sin contar Deshacer y
Salir, que son navegación y no editan nada. `Material` faltaba en el recuento y
en el prompt: se añadió al renglón de ausencias de Cara (mismo motivo que Color,
el esquema no guarda atributos por cara) y la cabecera pasó de la aproximación a
la enumeración.

| Rama   | Operación   | Estado    | Cómo termina                                             |
| ------ | ----------- | --------- | -------------------------------------------------------- |
| Cara   | Extruir     | escribe   | nodo `push` reeditable                                    |
| Cara   | Desfasar    | escribe   | nodo `push` con el signo de AutoCAD                       |
| Cara   | Copiar      | escribe   | una REGION en coordenadas del mundo                       |
| Cara   | Mover       | ausente   | el kernel no rehace una cara movida                       |
| Cara   | Girar       | ausente   | ídem                                                      |
| Cara   | Inclinar    | ausente   | ídem, y el ángulo puede invalidar el sólido               |
| Cara   | Borrar      | ausente   | coser el hueco es cirugía topológica que no existe        |
| Cara   | Color       | ausente   | no hay atributo por cara en el esquema                    |
| Cara   | Material    | ausente   | ídem                                                      |
| Arista | Copiar      | escribe   | todas las aristas como entidades `line`                   |
| Arista | Color       | ausente   | no hay atributo por arista en el esquema                  |
| Cuerpo | Separar     | escribe   | un sólido por operando de la unión                        |
| Cuerpo | Vaciar      | escribe   | interior `brep` + nodo `subtract`, sólo convexos          |
| Cuerpo | Limpiar     | escribe   | funde coplanarias y hornea                                |
| Cuerpo | Comprobar   | responde  | caras, aristas y volumen, sin tocar el documento          |
| Cuerpo | Estampar    | ausente   | partir una cara por una curva no existe en `lib/brep/`    |

Ocho existen (siete escriben, una responde) y ocho no. Más un **modo** ausente
—la cáscara abierta de Vaciar—, declarado en el prompt del espesor y comprobado
aparte.

#### Los modos de las ocho primitivas: 52 caminos

Cincuenta y dos renglones, cada uno conducido de verdad: 48 escriben un sólido
cerrado, 1 responde su límite (el toro cuyo tubo es mayor que el toro, que se
cortaría a sí mismo) y 3 están declarados ausentes por escrito en la cabecera
del módulo (Ttr de CYLINDER, Ttr de CONE y los submodos del Arco de POLYSOLID).

| Orden     | Caminos | Detalle                                                            |
| --------- | ------- | ------------------------------------------------------------------ |
| BOX       | 5       | esquinas, Centro, Cubo, Longitud, altura por 2Puntos                |
| WEDGE     | 5       | los mismos cinco                                                    |
| CYLINDER  | 7       | centro+radio, Diámetro, 2Puntos, 3Puntos, Elíptico, altura 2Puntos, **Ttr ausente** |
| CONE      | 8       | los seis de CYLINDER + radio Superior, **Ttr ausente**              |
| SPHERE    | 2       | centro+radio, Diámetro                                              |
| TORUS     | 4       | centro+radios, Diámetro del toro, Diámetro del tubo, **límite del tubo** |
| PYRAMID   | 8       | centro+radio, Lados, Inscrito, Circunscrito, Diámetro, Arista, radio Superior, altura 2Puntos |
| POLYSOLID | 13      | al vuelo, Objeto (línea y polilínea), Altura, Ancho, tres Justificaciones, Cerrar, desHacer, Arco, Línea, **submodos del Arco ausentes** |

Además: `Arco` **no** se ofrece con un solo punto —no hay tangente de entrada— y
sí en cuanto hay un tramo del que salir; las dos cosas se comprueban.

### 2026-09-04 · SHELL: vaciar un sólido convexo, y SOLIDEDIT Cuerpo·Vaciar (entrega 4/5)

`solids-edit.ts` lo declaraba con todas sus letras: *«Cuerpo · Estampar y Vaciar
(SHELL): sin operación de kernel … Vaciar pide desfasar TODAS las caras a la vez
hacia dentro resolviendo sus intersecciones; ninguna de las dos existe en
`lib/brep/`»*. Vaciar es lo que convierte una caja en un **recipiente**, y hasta
esta entrega el kernel no sabía hacerlo.

**NUEVO** `apps/web/src/lib/brep/shell.ts` (640 líneas): `shellBody(body, thickness)`.

1. **Desfasar el plano de cada cara** hacia dentro el espesor pedido: `n·x = d`
   pasa a `n·x = d − t`, con `n` la normal SALIENTE.
2. **Recalcular cada vértice** como intersección de los planos desfasados de sus
   caras incidentes. Es el paso que hace honesto el resultado: mover cada
   vértice a lo largo de «su» normal —el atajo que se escribe primero— sacaría
   la esquina de una caja de los tres planos a la vez. Con **tres** planos el
   punto es único y sale por Cramer (exacto); con **cuatro o más** —el ápice de
   una pirámide, el de un cono facetado— por mínimos cuadrados sobre las
   ecuaciones normales, y **entonces se comprueba el residuo**: si los planos
   desfasados de ese vértice no concurren, el interior tendría que partirlo en
   varios, es decir, OTRA topología, y eso se rechaza nombrándolo.
3. La **topología se conserva tal cual** —mismas caras, mismos lazos, mismos
   índices de vértice; sólo cambian las coordenadas—, así que el interior lo
   cose el mismo `buildBody` con los mismos `FaceSpec` y nace válido.
4. El hueco sale de **`booleanDifference(exterior, interior)`**, camino ya
   probado en este árbol.

**Sólo convexos, y la convexidad se COMPRUEBA de verdad** con `edgeDihedralAngle`
sobre TODAS las aristas, con el convenio que ya usaba el chaflán (diedro interior
< π convexo, > π cóncavo). En un rincón entrante los planos desfasados se cruzan
del lado equivocado y el «interior» se sale del sólido; vaciar un cóncavo pide
offset con RECORTE, que es otro algoritmo. Un cóncavo se rechaza nombrando su
peor arista y su ángulo.

**El límite del espesor se CALCULA, no se busca a tientas.** El vértice desfasado
es una función afín del espesor —`p(t) = base − t·rate`, porque resolver
`A·p = d − t·1` es resolver `A·base = d` y `A·rate = 1` y restar—, así que la
holgura de cada par (vértice, cara) es afín en `t` y el mayor espesor admisible
es `mín s₀/(1 − n·rate)` sobre los pares con pendiente positiva. Exacto, sin una
sola bisección. En una caja de 100 sale **50**: la mitad de su espesor mínimo.

**NUEVO** `shell.spec.ts` (89 comprobaciones). Las cifras:

| caso | espesor | volumen | cáscaras | Euler |
| --- | --- | --- | --- | --- |
| caja 100³ | 10 | **488 000** = 10⁶ − 80³ | **2** | V=36 E=76 F=44 χ=4 S=2 G=0 |
| prisma de 48 lados (R=50, h=100) | 5 | resta de los dos prismas, **Δ relativo 1.4e-16** | **2** | 96 vértices, todos exactos |
| pirámide cuadrada 100×100×120 | 8 | V·(1 − ((r−t)/r)³) con r = 100/3 | **2** | 4 exactos + **1 por mínimos cuadrados** (el ápice) |
| tetraedro (planos oblicuos) | r/4 | el tetraedro semejante de razón (r−t)/r, Δ < 1e-12 | **2** | r = 1/√3, 4 vértices exactos |
| caja 100³ | 50 | rechazado: «se come la pieza», admite menos de 50 | — | sin escritura |
| L de dos cajas (cóncava) | 5 | rechazado: 2 aristas a 270°, «todavía no está disponible» | — | sin escritura |
| pirámide 100×**60**×120 | 5 | rechazado: los 4 planos del ápice no concurren | — | sin escritura |
| unión fragmentada de dos cajas | 10 | rechazado, y **nombra el remedio**: cUerpo Limpiar | — | sin escritura |
| la misma, tras `mergeCoplanarFaces` | 10 | **568 000** = 200·100·50 − 180·80·30 | **2** | válido |

El último par es el que ata esta entrega con la 3/5: un cuerpo **convexo pero
fragmentado** (la unión de dos cajas contiguas, que es una caja de 200×100×50 con
20 caras) tiene cuatro vértices en T que tocan sólo DOS planos distintos. Un
vértice así no es una esquina y desfasar no dice adónde debe ir: se rechaza
**nombrando la orden que lo arregla**, que existe en este mismo árbol.

**MODIFICADO** `lib/brep/index.ts`: exporta `shellBody`, `offsetInnerBody`,
`shellLimit`, `maxShellThickness`, `bodyConvexity` y sus tipos. Su lista de «LO
QUE NO HAY» gana tres renglones con lo que de verdad queda fuera: el cóncavo, la
cáscara ABIERTA y el vértice de cuatro planos que no concurren.

**MODIFICADO** `solids-edit-branches.ts` (403 → 541 líneas): `shellSolid`. Y aquí
está la decisión que lo separa de `cleanBody`: **no se hornea nada del exterior**.
El árbol original sobrevive intacto y sólo se le añaden DOS nodos —un `brep` con
el interior y un `subtract` que lo resta—, así que el sólido se sigue editando
por su rama de siempre: cambiar el 100 de la caja en propiedades reconstruye la
pieza y el hueco se resta de la caja nueva. El interior sí es geometría
explícita, porque no es la receta de nada: es el desfase de una topología
concreta.

El cuerpo se evalúa **sin su colocación** (`placement`). No es un detalle: el
nodo `brep` del interior vive en el sistema de los nodos y la colocación se
aplica después al árbol entero; calcularlo sobre el cuerpo ya colocado aplicaría
la colocación dos veces y el hueco aparecería desplazado del sólido que lo
contiene.

**MODIFICADO** `solids-edit.ts` (380 → 417 líneas): sólo el diálogo. La rama
Cuerpo pasa de «Separar, Limpiar, Comprobar, Salir» a «Separar, **Vaciar**,
Limpiar, Comprobar, Salir», y su renglón de ausencias baja de dos nombres a uno
(«Estampar todavía no»). PICKFIRST en Vaciar **no ejecuta**: adelanta al espesor,
porque designar no es toda la orden cuando falta el número que decide la pared.

**MODIFICADO** `solids-edit.spec.ts` (303 → 409 líneas, 81 → 119 comprobaciones).

Cierre: `npm run typecheck` verde (8 workspaces),
`npm run check:command-integrity` verde (274 comandos · 0 éxitos falsos),
`node scripts/cad/check-monolith-budget.mjs` verde, `check:no-industrial-domain`
verde (2 204 fuentes), `check:lint-budget` verde (487 avisos de 492) y `eslint`
limpio sobre los seis archivos tocados. `npx tsx src/lib/brep/shell.spec.ts` da
**89** aserciones verdes y `solids-edit.spec.ts` **119** comprobaciones. La suite
entera del web: **578/578 specs verdes**.

**Observación, y no es de este frente:** `npm run check:cad` sale en ROJO en esta
rama por `check:dwg-evidence` —el artefacto `docs/cad/evidence/` no coincide con
lo que sostiene `packages/dwg-codec/` (7 bundles admitidos y 2 capacidades
promovidas en el disco contra 0 y 0 en el árbol)—. **Comprobado que es
PREEXISTENTE**: con esta entrega guardada en `git stash`, sobre el árbol limpio,
`npm run check:dwg-evidence` sigue saliendo con código 1. Ni `packages/dwg-codec/`
ni `docs/cad/evidence/` están en el diff de esta entrega, y los dos flags DWG
siguen apagados. Se deja anotado para que el coordinador no lo lea como daño de
esta ventana.

### 2026-09-04 · Fusión de caras coplanarias, y SOLIDEDIT Cuerpo·Limpiar (entrega 3/5)

El índice de `lib/brep/` confesaba por escrito un hueco: «Fusión de caras
coplanarias tras una booleana: el resultado es correcto pero queda fragmentado
en triángulos». Estaba medido en este árbol: la unión de dos cajas de
100×100×50 **contiguas** devolvía **20 caras y 30 aristas** repartidas sobre
**seis** planos, cuando el sólido resultante es una caja de 200×100×50 con 6 y
12. Eso se paga en el STEP exportado, en la designación de caras —designar «la
tapa» designaba un triángulo— y en los segmentos que proyectan FLATSHOT y
SOLPROF.

**NUEVO** `apps/web/src/lib/brep/coplanar-merge.ts` (508 líneas, la mitad de ellas el porqué):
`mergeCoplanarFaces(body, tolerance)` en cuatro pasos.

1. **Agrupar por plano canónico**: normal unitaria SALIENTE más distancia con
   signo. La normal NO se canonicaliza a un semiespacio: dos caras sobre el
   mismo plano geométrico con normales opuestas son los dos lados de una pared
   delgada y fundirlas sería inventar material. La rejilla cuantizada registra
   cada grupo en sus 81 celdas (3⁴: tres componentes y la distancia) por el
   mismo motivo por el que `BodyBuilder` mira las 27 vecinas al soldar
   vértices: una clave redondeada parte en dos los valores que caen a ambos
   lados de un borde de celda. La pertenencia se decide con la tolerancia de
   verdad contra el representante, no con la clave.
2. **Fundir pares adyacentes** cuyas aristas compartidas formen UNA cadena
   contigua en el lazo exterior de las dos, iterando hasta punto fijo. Los lazos
   interiores viajan tal cual como agujeros de la cara fundida. Una fusión que
   dejaría un lazo exterior no simple —o que iría por un lazo interior, o por
   dos cadenas separadas— se DESCARTA y se cuenta.
3. **Disolver los vértices de grado dos**: fundir cuatro triángulos en un
   rectángulo deja puntos a mitad de un lado, y un vértice de grado dos no es
   legal en un sólido cerrado. Sin este paso el resultado tendría 6 caras y
   **16** aristas en vez de 6 y 12, y `validateBody` lo denunciaría. Sólo se
   disuelve el que cae ESTRICTAMENTE entre sus dos vecinos y sólo si la arista
   sustituta no existía ya (sería dejar de ser una variedad).
4. **Reconstruir** con `buildBody`, que es quien caza cualquier incoherencia. Se
   prefiere lanzar a devolver un cuerpo dudoso.

Cuando no hay nada que fundir devuelve el MISMO objeto (`changed: false`), para
que quien la llama pueda decir «no hay nada que limpiar» sin tocar el documento.

**NUEVO** `coplanar-merge.spec.ts` (248 líneas, 76 comprobaciones). Las cifras exactas:

| caso | caras | aristas | vértices | volumen |
| --- | --- | --- | --- | --- |
| unión de dos cajas contiguas | 20 → **6** | 30 → **12** | 12 → **8** | 1 000 000 → 1 000 000 (idéntico bit a bit) |
| cilindro de 48 lados | 50 → **50** | 144 → 144 | 96 → 96 | sin tocar (`changed: false`) |
| sólido hueco (caja − caja interior) | 44 → **12** | 76 → **24** | 36 → **16** | 875 000, **S = 2** conservado |
| placa partida con agujero pasante | 14 → **10** | — | — | R = 2, χ = 0, **G = 1** |
| L de tres cajas | 28 → **8** | 42 → **18** | — | 1 500 000 |
| tres cajas en fila | 28 → **6** | 42 → **12** | 16 → **8** | 3 000 |

`validateBody(requireClosed, requirePlanarFaces, expectedGenus, expectedShells)`
verde en todos. Fundir dos veces no encuentra nada: la operación es idempotente.

**MODIFICADO** `solids-edit-branches.ts` (307 → 403 líneas): `cleanBody`. Evalúa
el sólido designado, funde, y hornea el resultado como nodo `brep` —geometría
explícita, que es lo que el esquema 5 declara para «un cuerpo que no se puede
describir como receta de nada»—. Se emite un `replace` que CONSERVA el id, para
que las cotas y la designación que apuntaban al sólido sigan apuntando al mismo.
La colocación viaja ya aplicada en los puntos (`solid3dBody` la aplica antes de
devolver el cuerpo), así que el sólido horneado queda exactamente donde estaba.

**MODIFICADO** `solids-edit.ts` (359 → 380 líneas): la rama Cuerpo pasa de
`Separar, Comprobar, Salir` a `Separar, Limpiar, Comprobar, Salir`, y su renglón
de ausencias baja de tres nombres a dos («Estampar y Vaciar todavía no»).

**MODIFICADO** `solids-edit.spec.ts` (252 → 303 líneas, 60 → **81**
comprobaciones).

**MODIFICADO** `lib/brep/index.ts`: exporta `mergeCoplanarFaces`,
`canonicalPlane` y sus tipos, y su lista de «lo que no hay» sustituye el renglón
de la fusión coplanaria por lo que de verdad queda fuera (cerrar un anillo), con
su coste medido.

**MODIFICADO** `solids-modify.ts`: la cabecera de FILLETEDGE/CHAMFEREDGE decía
«sin fusión de caras coplanarias»; ahora nombra el remedio y explica por qué NO
se aplica sola (hornearía el árbol paramétrico sin que nadie lo pidiera).

Evidencia: `cd apps/web && npx tsx src/lib/brep/coplanar-merge.spec.ts` → 76
comprobaciones verdes. `npx tsx src/lib/cad/engine/commands/solids-edit.spec.ts`
→ 81 comprobaciones. `npm run typecheck` → 8/8. `npm run
check:command-integrity` → OK, 274 comandos, SOLIDEDIT sigue en «informa».

No se tocó el registro, ni la cinta, ni el esquema, ni ningún archivo compartido.

**Gate ajeno en rojo, medido y NO causado aquí.** `npm run check:dwg-evidence`
falla en este árbol *antes* de esta ventana: comprobado guardando los cambios
(`git stash`) y volviéndolo a correr sobre el árbol limpio, con el mismo fallo
(`el artefacto del disco coincide con lo que el árbol sostiene hoy` — la
`declaracion` de `dwg-decoder-matrix` habla de capacidades promovidas y el
generador dice cero bundles admitidos). Es territorio del frente DWG y de un
archivo de evidencia que este frente no toca; queda dicho para que la
integración no lo atribuya a esta entrega. Todo lo demás de `check:cad`
—identidad, presupuesto de monolito (2478 archivos), trinquete de lint (488 de
492), cinta (274 comandos), alcance con el ratón— sale verde.

### 2026-09-04 · Los modos de las primitivas (entrega 2/5)

La cabecera de `solids-primitives.ts` declaraba ausentes, uno por uno, los modos
de designación de AutoCAD. Estaban ausentes **por diálogo, no por kernel**: un
cilindro por dos puntos es el mismo nodo `extrude` con el centro puesto en otro
sitio. Lo que faltaba era la aritmética entre lo que se DESIGNA y lo que la
receta pide, y ahora existe y está medida.

NUEVO: `solids-primitive-modes.ts` (413 líneas) — la aritmética de los modos:

- **2Puntos**: los dos puntos son el DIÁMETRO de la base. Medido: CYLINDER 2P
  entre (0,0) y (100,0) con altura 40 produce el **mismo nodo, bit a bit** que
  CYLINDER centro (50,0) radio 50 altura 40 (`JSON.stringify` de los nodos
  idéntico), y mide π·50²·40 exacto. Dos modos de la misma orden no pueden dar
  dos sólidos para la misma pieza.
- **3Puntos**: circuncentro. Por (0,0), (100,0) y (50,50) pasa la circunferencia
  de centro (50,0) y radio 50. Tres puntos COLINEALES se rechazan con esa
  palabra —el determinante se compara contra el tamaño del triángulo, no contra
  un absoluto— en vez de dibujar un cilindro a kilómetros.
- **Elíptico**: perfil de elipse de 48 lados. Para CYLINDER es un nodo `extrude`
  con el giro en el `xAxis` del marco; para CONE es el MISMO abanico `brep`
  base→vértice que ya usaba PYRAMID (`ringSolidNode`), así que no se estrenó
  maquinaria.
- **Arista** (PYRAMID): R = L/(2·sen(π/n)) entra por `vertexRadius` sin tocarla,
  y el GIRO va con él: prometer «esta arista» y dibujar otra sería peor que no
  ofrecer el modo. Medido: L = 100 con 6 lados da R = 100, la arista designada
  queda en (0,0)-(100,0) y los seis lados miden 100.
- **Arco** (POLYSOLID): el recorrido pasa a ser una POLILÍNEA (vértices con
  `bulge`) y se tesela ANTES de `offsetPath`, que sigue engrosando sólo rectas.
  El arco sale tangente al tramo anterior (`bulge = tan(ang/2)`), la aritmética
  se pide a `curve-model` en vez de copiarla por tercera vez, y `desHacer` quita
  el arco ENTERO. La rama Objeto deja de rechazar una polilínea con `bulge`.

### La faceta, en números y no en adjetivos

`ellipseProfile` tiene el mismo interruptor `matchArea` que `circleProfile`, y
cada primitiva usa el que la deja CONTINUA con su hermana circular:

| pieza             | perfil            | volumen                      | con a = b                          |
| ----------------- | ----------------- | ---------------------------- | ---------------------------------- |
| cilindro elíptico | elipse corregida  | π·a·b·h **exacto**           | el cilindro circular, bit a bit    |
| cono elíptico     | elipse inscrita   | π·a·b·h/3 × sen θ/θ          | el cono circular facetado, exacto  |

con θ = 2π/48 = π/24 y sen θ/θ = **0,99714666**. Es la corrección que
`circleProfile` ya documentaba; queda medida en el spec en las dos direcciones
(el área del polígono corregido es π·a·b, la del inscrito es sen θ/θ de ella).

MODIFICADO: `solids-primitives.ts` **767 → 745 líneas**: ENCOGE aunque gana cinco
modos, porque salieron de él `offsetPath`/`polysolidFootprint` (al módulo de
modos) y las recetas de las ocho primitivas (a `solids-primitive-shapes.ts`, 180
líneas, nuevo). La línea de corte no es de conveniencia: allí se PREGUNTA y aquí
se ESCRIBE la receta. Los tres archivos quedan por debajo del techo de 800.

MODIFICADO: `solids-primitives.spec.ts` (230 → 358 líneas, 60 → 105
comprobaciones).

Evidencia: `npx tsx src/lib/cad/engine/commands/solids-primitives.spec.ts` → 105
comprobaciones. `node scripts/cad/check-monolith-budget.mjs` → OK (745 / 413 /
180, ninguno con asignación). `npm run check:command-integrity` → OK, 274
comandos, 0 éxitos falsos. `npm run typecheck` → 8/8. `node
apps/web/scripts/run-specs.mjs` → 575/576 (el que falla, `plan-budget.spec.ts`,
es un benchmark de máquina y falla IGUAL en el árbol limpio: 45,2 ms de
`zoomFrameP95Ms` contra 22 de presupuesto, sin nada mío en medio).

No se tocó el registro, ni la cinta, ni el esquema, ni ningún archivo compartido.

### 2026-09-04 · SOLIDEDIT gana tres ramas (entrega 1/5)

De tres operaciones a **seis**. Lo nuevo, y por qué el kernel ya lo sostenía:

- **Cara · Desfasar** — el nodo `push` de PRESSPULL con el signo de AutoCAD
  (positivo hacia fuera). Reutiliza `withPushedFace` entero; no hay una segunda
  versión que se pueda desincronizar. Se ofrece por su nombre porque la Desfasar
  de AutoCAD es EXACTAMENTE esto y aquí está completa, mientras que su Extruir
  admite además trayectoria y ángulo de inclinación que este nodo no lleva.
  Medido: caja 100×100×50 con d = +20 → 700 000; con d = −20 → 300 000; UN solo
  nodo `push` y la caja sigue debajo (reeditable, no horneado).
- **Cara · Copiar** — los lazos de la cara resueltos con `cadResolveFaceRef` +
  `faceOuterLoop`/`faceInnerLoops`/`loopPoints` salen como una entidad `region`
  en coordenadas del mundo con su z real. Mismo camino que SECTION
  (`solids-modify.ts`), no se inventó transporte. Medido: la tapa de esa caja da
  UNA región de 4 puntos con z = 50, sin `inners`, y el sólido no se toca.
- **Arista · Copiar** — las aristas del sólido designado salen como entidades
  `line` con `start`/`end` en `CadPoint3`. Medido: 12 líneas por caja, ninguna
  repetida (par de vértices normalizado y cuantizado), 8 de 100 y 4 de 50.

El diálogo deja de anunciar como ausentes las tres que ya existen y **nombra una
por una** las que no, en el renglón del prompt de su rama y nunca como opción
pulsable: el analizador sólo reconoce las palabras clave que el prompt ofrece,
así que ofrecer «Mover» para responder «todavía no» sería fabricar una opción
que no hace nada.

No se tocó el registro, ni la cinta, ni el esquema. Las operaciones viven en
`solids-edit-branches.ts` (nuevo, 307 líneas) y `solids-edit.ts` se queda con el
diálogo (359).

Evidencia: `npx tsx src/lib/cad/engine/commands/solids-edit.spec.ts` → 60
comprobaciones (eran 24). `npm run check:command-integrity` → OK, 274 comandos,
SOLIDEDIT sigue en «informa». `npm run typecheck` → 8/8. Presupuesto de monolito
intacto.


## «Todavía no»

### 2026-09-04 · La cáscara ABIERTA de SHELL

`SOLIDEDIT Cuerpo Vaciar` deja el recipiente **cerrado**. La cáscara abierta de
AutoCAD —vaciar retirando las caras designadas, que es lo que deja la caja sin
tapa— no está: pide quitar caras del exterior y coser el interior con el
exterior por el borde del hueco, es decir, cirugía topológica, no una resta
booleana. Se declara **en el propio prompt del espesor** («vaciar retirando las
caras designadas todavía no»), donde lo lee quien esperaba designarlas, y no en
un aviso posterior.

### 2026-09-04 · Vaciar un cuerpo CÓNCAVO, y el vértice que no concurre

Dos límites de `shellBody`, los dos comprobados y los dos con su motivo:

- **Cóncavo.** Desfasar los planos de un cuerpo cóncavo hacia dentro no da un
  cuerpo interior: en un rincón entrante los planos se cruzan del lado
  equivocado. La forma correcta es el offset con RECORTE —decidir qué trozo de
  cada plano desfasado sobrevive—, y eso es otro algoritmo, no un parche. La
  convexidad se mide con `edgeDihedralAngle` sobre todas las aristas y el
  rechazo nombra la peor y su ángulo.
- **Vértice de cuatro planos o más que no concurren al desfasarlos.** El ápice
  de una pirámide de base rectangular: sus dos parejas de caras laterales tienen
  inclinaciones distintas, así que no hay punto equidistante de las cuatro.
  Vaciarlo pediría partir el vértice en varios, es decir, cambiar la topología, y
  este desfase la conserva. Se detecta por el residuo del sistema y se rechaza.

Y uno más, que no es un límite sino un **encadenamiento**: un cuerpo convexo pero
FRAGMENTADO (el que deja una booleana) tiene vértices en T que tocan sólo dos
planos distintos. No son esquinas. El rechazo nombra `SOLIDEDIT cUerpo Limpiar`,
que los funde, y tras esa orden Vaciar funciona — medido en la spec.

### 2026-09-04 · Vaciar hacia FUERA

AutoCAD admite un espesor negativo en SHELL para engordar la pieza. Aquí se
rechaza: el desfase saldría, pero el sólido resultante sería el engordado menos
el original, y eso es otra orden con otro nombre y otro prompt, no un signo.

### 2026-09-04 · Cerrar un ANILLO al fundir coplanarias

`mergeCoplanarFaces` funde pares que comparten **una** cadena contigua de
aristas. Cuando dos caras coplanarias se tocan por **dos** cadenas separadas
—las dos mitades en C de la tapa de una placa agujereada— fundirlas produciría
una cara con un lazo interior NUEVO, y decidir cuál de los dos lazos resultantes
es el exterior pide un criterio que este paso no tiene todavía. Se descarta, se
CUENTA, y el aviso de `SOLIDEDIT Cuerpo Limpiar` lo dice.

Medido: una placa de 100×100×20 con agujero pasante de 40×40 baja de **36 caras
a 12**, no a las **10** canónicas, porque cada tapa se queda en dos mitades en C.
El sólido resultante es correcto —volumen 168 000, género 1, `validateBody`
verde—; sólo está a medio fundir. Está escrito en la cabecera de
`coplanar-merge.ts`, en la lista de «lo que no hay» de `lib/brep/index.ts` y
probado como caso propio en `coplanar-merge.spec.ts`.

Lo mismo con la fusión **por un lazo interior** (una cara que rellena el agujero
de otra): se detecta y se descarta en vez de forzarse.

### 2026-09-04 · Limpiar HORNEA: la historia paramétrica se pierde

`SOLIDEDIT Cuerpo Limpiar` sustituye el árbol del sólido por un único nodo
`brep`. No hay alternativa honesta —el árbol decía «unión de dos cajas» y el
cuerpo fundido ya no es eso—, pero es una pérdida real y la orden la ANUNCIA en
su aviso en vez de dejar que se descubra al reabrir el sólido. Por el mismo
motivo la fusión **no** se aplica sola tras cada booleana ni dentro de
FILLETEDGE: una orden que además borrase el árbol sin que nadie lo pidiera haría
dos cosas.

### 2026-09-04 · Ttr de CYLINDER y CONE, y los submodos del arco

**Ttr** (tangente-tangente-radio) sigue fuera y el prompt no lo anuncia. Motivo:
no es aritmética de puntos designados —pide resolver tangencias contra DOS
entidades del dibujo— y ninguna de las ocho primitivas designa objetos salvo
POLYSOLID Objeto. Construirlo pide un paso de designación en el diálogo y el
solucionador de tangencias de `intersect.ts`; es trabajo de otra ventana, no un
renglón.

Del **Arco** de POLYSOLID está el modo por defecto —tangente al tramo anterior—
y no sus submodos (Dirección, Radio, Ángulo, Segundo punto), ni el arco como
PRIMER tramo, que no tiene dirección de entrada a la que ser tangente: la opción
no aparece hasta que la hay, en vez de ofrecerse y no poder contestarse.

### 2026-09-04 · El resumen de la paleta y la ESCALERA hablan del ayer

`engine/command-summaries.ts:214` sigue diciendo que POLYSOLID es un «recorrido
de tramos rectos», y `docs/parity/ESCALERA.md:174` que «los modos 3P/2P/Ttr/
Elíptico de CYLINDER y CONE, Arista de PYRAMID y Arco de POLYSOLID no se
ofrecen». Los dos son archivos FUERA del territorio de este frente (la ESCALERA
está además en la lista de prohibidos). Pedidos con su texto exacto en
`tresd-peticiones.md` (**P-tresd-03**).

### 2026-09-04 · Designar UNA arista suelta

`SOLIDEDIT Arista Copiar` copia **todas** las aristas del sólido designado, no
la que se señale. Motivo escrito: `CAD_ACCEPT_EDGE_PICK` no existe (cero
apariciones en el árbol) y crearlo obliga a tocar
`apps/web/src/lib/cad/engine/command-types.ts`, que está **fuera** del territorio
de este frente. Pedido con su diseño completo en `tresd-peticiones.md`
(**P-tresd-02**); la rama lo dice en su propio prompt en vez de fingir una
designación fina.

### 2026-09-04 · Las ocho ramas de SOLIDEDIT que siguen fuera

Nombradas una por una en el prompt de su rama, con su motivo en la cabecera de
`solids-edit.ts`. Son ocho operaciones distintas y nueve renglones, porque Color
aparece en dos ramas por el mismo motivo:

| Rama                                    | Motivo                                                        |
| --------------------------------------- | ------------------------------------------------------------- |
| Cara · Mover, Girar, Inclinar, Borrar   | piden recomponer las caras adyacentes; el kernel no rehace una cara movida |
| Color (de cara y de arista)             | el esquema no guarda un atributo por cara ni por arista       |
| Cuerpo · Estampar y Vaciar (SHELL)      | sin operación de kernel: Estampar pide partir una cara por una curva del dibujo, Vaciar pide desfasar todas las caras a la vez resolviendo sus intersecciones |

**Actualización 2026-09-04 (entrega 3/5):** `Cuerpo · Limpiar` YA NO está en esta
tabla. Existe, tiene kernel (`mergeCoplanarFaces`) y tiene spec. Las ausentes
bajan de ocho operaciones a **siete** y de nueve renglones a **ocho**.

**Actualización 2026-09-04 (entrega 4/5):** `Cuerpo · Vaciar` tampoco está ya.
Existe, tiene kernel (`shellBody`) y tiene spec, sobre cuerpos convexos y
declarando en el prompt lo que no cubre. Las ausentes bajan a **seis**
operaciones y **siete** renglones: Cara·Mover, Cara·Girar, Cara·Inclinar,
Cara·Borrar, Color (dos renglones, una razón) y Cuerpo·Estampar. Se le suma un
MODO ausente —la cáscara abierta de Vaciar—, declarado en su propio prompt.

### 2026-09-04 · El resumen de la paleta se quedó corto

`engine/command-summaries.ts:248` sigue describiendo el SOLIDEDIT de tres ramas.
Es archivo fuera de territorio; pedido en `tresd-peticiones.md` (**P-tresd-01**)
con el renglón exacto de sustitución. Con la entrega 3/5 el renglón pedido cambia
otra vez —ahora son siete ramas, con Limpiar—: **P-tresd-01** queda actualizado
con el texto definitivo.

### 2026-09-04 · «Todavía no» de la entrega 5/5, con fecha

- **El recorrido de descubrimiento es ACOTADO** (profundidad 10, 3000 nodos) y el
  spec lo dice en su cabecera. Una palabra clave escondida más allá de esa
  profundidad no la vería. Con los diálogos de hoy sobra —el más hondo,
  POLYSOLID, cierra en 13 estados—, pero es un límite real del candado, no una
  garantía absoluta.
- **Las ocho ramas ausentes de SOLIDEDIT siguen ausentes** tras esta ventana:
  Cara·Mover, Cara·Girar, Cara·Inclinar, Cara·Borrar, Cara·Color, Cara·Material,
  Arista·Color y Cuerpo·Estampar. Son siete operaciones distintas y ocho
  renglones (Color aparece en dos ramas por el mismo motivo). Ninguna se insinúa
  como próxima y ninguna es pulsable: el spec lo comprueba renglón a renglón.
- **La cáscara ABIERTA de Vaciar** (retirar las caras designadas) sigue fuera,
  declarada en el prompt del espesor.
- **Ttr de CYLINDER y CONE** sigue fuera: pide un solucionador de tangencias
  contra DOS entidades del dibujo y un paso de designación que estos diálogos no
  tienen.
- **Los submodos del Arco de POLYSOLID** (Dirección, Radio, Ángulo, Segundo
  punto) siguen fuera; entra sólo el arco tangente, que es el modo por defecto de
  PLINE.
- **Designar UNA arista suelta** sigue fuera (`CAD_ACCEPT_EDGE_PICK` no existe;
  P-tresd-02).
- **La cota Z del visor** sigue fuera de este territorio: `scenePoint` de
  `entity-three.ts` ignora la z del punto y el arreglo no es mío.
- **De la cola de este frente quedan sin abrir** los puntos 1 (entidad con
  normal: pide cambio de esquema, archivo compartido), 5 (SECTIONPLANE /
  LIVESECTION / SECTIONPLANETOBLOCK), 6 (materiales, luces, cámaras y render) y
  7 (ANIPATH). Ninguno se ha insinuado como hecho en ningún sitio.

### 2026-09-04 · Lo que queda pedido al coordinador

Cuatro peticiones, todas con su diseño completo en `tresd-peticiones.md` y todas
**pendientes** al cierre de la ventana:

| Petición    | Archivo fuera de territorio                    | Qué pide                                                     |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------ |
| P-tresd-01  | `engine/command-summaries.ts`                  | el resumen de SOLIDEDIT nombra las ocho ramas construidas     |
| P-tresd-02  | `engine/command-types.ts`                      | `CAD_ACCEPT_EDGE_PICK`, para designar UNA arista              |
| P-tresd-03  | `engine/command-summaries.ts`, `ESCALERA.md`   | POLYSOLID ya no es «sólo tramos rectos»; los modos existen    |
| P-tresd-04  | `docs/parity/ESCALERA.md`                       | el renglón de SOLIDEDIT, la fusión coplanaria y SHELL         |

Ninguna se aplicó desde aquí: son archivos compartidos o fuera del territorio del
frente, y la regla R1 no se negocia.

### 2026-09-04 · Un gate ROJO que no es mío, declarado

`npm run check:cad` se detiene en `check:dwg-evidence` con
«el artefacto del disco coincide con lo que el árbol sostiene hoy» —el artefacto
de evidencia DWG ha quedado desfasado del árbol—. **Falla igual en HEAD sin
ninguno de mis cambios**, comprobado con `git stash -u` sobre este mismo árbol:
no lo causó esta ventana. Es territorio del frente DWG y de
`packages/dwg-codec/` + `docs/dwg/`, y las banderas `DWG_IMPORT_FLAG` y
`DWG_EXPORT_FLAG` no se tocan en esta campaña. Los **veintiocho** pasos restantes
de `check:cad` se corrieron uno por uno y están en verde, igual que
`npm run typecheck`, `npm test` (579/579 specs) y
`npm run check:command-integrity` (274 comandos, 0 éxitos falsos).

### 2026-09-04 · Cierre · Lo que sigue fuera, y una afirmación propia que se corrige

**El gate ajeno, ahora con una prueba que no depende de la máquina.** Las
entregas anteriores demostraron que `check:dwg-evidence` es preexistente
guardando los cambios con `git stash` y volviendo a correrlo. Sirve, pero es una
prueba que hay que repetir y creer. En el cierre se sustituye por una que se
comprueba leyendo: el gate lee **exactamente dos** raíces
(`scripts/dwg/dwg-evidence.mjs:43-44`: `packages/dwg-codec/` y
`docs/cad/evidence/`) y esta rama **no toca ninguna de las dos** —
`git diff --stat 646b969..HEAD -- packages/dwg-codec docs/cad/evidence scripts/dwg`
sale **vacío**—. Si ninguna de las dos entradas del gate cambió, su veredicto no
pudo cambiarlo esta ventana. Queda dicho así para que la integración no tenga
que fiarse de un `stash` que ya no puede repetir. Sigue siendo del frente DWG y
las banderas siguen apagadas.

**Una afirmación propia que NO se reproduce, y se corrige.** La entrega 2/5
anotó que `apps/web/src/lib/cad/benchmark/plan-budget.spec.ts` fallaba en esta
máquina (45,2 ms de `zoomFrameP95Ms` contra 22 de presupuesto). En el cierre se
volvió a correr y sale **verde**: `zoom p95 19.006 ms`, dentro del presupuesto,
con el spec terminando en código 0. No era un fallo del árbol ni de la rama: es
un banco de **velocidad de máquina** y su resultado depende de la carga del
momento. Se deja escrito porque una nota que declara roto algo que está sano
envejece igual de mal que la contraria, y porque el presupuesto **no se tocó**
en ningún momento para conseguirlo.

**Lo que sigue fuera, sin cambios respecto a lo declarado arriba.** Ninguna de
las ausencias que las cinco entregas declararon se cerró en el cierre, y ninguna
se insinúa como hecha: las **ocho** ramas de SOLIDEDIT (Cara·Mover, Girar,
Inclinar, Borrar, Color y Material; Arista·Color; Cuerpo·Estampar — siete
operaciones en ocho renglones), la cáscara **abierta** de Vaciar, el vaciado de
cuerpos **cóncavos**, el vértice de cuatro planos que no concurren, cerrar un
**anillo** al fundir coplanarias, **Ttr** de CYLINDER y CONE, los submodos del
**Arco** de POLYSOLID y designar **UNA** arista suelta. Cada una está declarada
en el prompt de su rama —donde la lee quien esperaba usarla— y candada por
`solid3d-frontera.spec.ts`, que exige que no sean pulsables y que su nombre
aparezca donde toca.

**De la cola quedan sin abrir** los puntos 1 (entidad con normal: cambio del
esquema del documento canónico, archivo compartido), 5 (SECTIONPLANE,
LIVESECTION, SECTIONPLANETOBLOCK: comandos nuevos, y su plomería
—`command-summaries.ts` y `ui-command-reach.json`— está fuera del territorio),
6 (materiales, luces, cámaras y render PBR: esquema compartido, y la evidencia
sería una imagen de GPU que este entorno no puede producir) y 7 (ANIPATH:
necesita `MediaRecorder`, códec y GPU). Ninguno se ha insinuado como hecho en
ningún sitio. La extracción del monolito `Layout3DEditor.tsx` tampoco se abrió:
su verificación real vive en los goldens de `apps/web/e2e/`, fuera del
territorio, y aquí sólo se podría demostrar `typecheck`; el presupuesto queda
intacto en 18 388 sobre 18 454.

**Las cuatro peticiones siguen PENDIENTES** y se verificó en el cierre que sus
cuatro destinos siguen diciendo palabra por palabra lo que ellas citan, de modo
que aplican sin adivinar: P-tresd-01 y P-tresd-03
(`engine/command-summaries.ts`, líneas 248 y 214), P-tresd-02
(`engine/command-types.ts`, `CAD_ACCEPT_EDGE_PICK`) y P-tresd-04
(`docs/parity/ESCALERA.md`, líneas 174 y 175). No se aplicaron desde aquí por
R1, y `ESCALERA.md` está además en la lista de prohibidos.
