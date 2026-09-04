# F3 · El 3D honesto (dueño del monolito)

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
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
  NO lo tocas: lo escribes en `docs/execution/frentes/tresd-peticiones.md` y el coordinador
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

### 2026-09-04 · El resumen de la paleta se quedó corto

`engine/command-summaries.ts:248` sigue describiendo el SOLIDEDIT de tres ramas.
Es archivo fuera de territorio; pedido en `tresd-peticiones.md` (**P-tresd-01**)
con el renglón exacto de sustitución. Con la entrega 3/5 el renglón pedido cambia
otra vez —ahora son siete ramas, con Limpiar—: **P-tresd-01** queda actualizado
con el texto definitivo.
