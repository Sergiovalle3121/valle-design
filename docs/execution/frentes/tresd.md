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
| Cuerpo · Estampar, Vaciar (SHELL), Limpiar | sin operación de kernel                                    |

### 2026-09-04 · El resumen de la paleta se quedó corto

`engine/command-summaries.ts:248` sigue describiendo el SOLIDEDIT de tres ramas.
Es archivo fuera de territorio; pedido en `tresd-peticiones.md` (**P-tresd-01**)
con el renglón exacto de sustitución.
