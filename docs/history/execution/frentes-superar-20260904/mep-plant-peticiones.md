# Peticiones de F6 · Toolsets MEP y Plant 3D

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-mep-plant-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Ventana de integración 2 · 2026-09-04 (aplicada por el coordinador)

Tres de las seis se aplicaron (P-01, P-04 y la mitad de ESCALERA de P-06). Las otras
tres NO, y por motivos distintos que conviene no mezclar:

- **La rúbrica no se toca en esta ventana, por ninguna razón.** P-03 y la mitad de
  `rubric.json` de P-06 piden mover el `gap` de dos filas y añadir evidencias. Un
  criterio abierto lo otorga **quien lo evalúa**, no quien lo construye ni quien lo
  integra: queda para la pasada de evaluación del coordinador, con las dos mitades
  ya verdes y medidas aquí (`clash.spec.ts` 56, `pipe-solid.spec.ts` 77,
  `mep-tracing.spec.ts` 127, `plant-route.spec.ts` 49).
- **P-02 la decide el titular, no el coordinador.** PIDCLASH, PIDSOLID y MEPRISER
  **no existen en el árbol**: `grep` sólo los encuentra en prosa (esta petición, la
  bitácora del frente y la cabecera de `plant-route.ts`). Meterlos en el patrón del
  panel «Instalaciones» pondría en la cinta tres nombres que ningún registro
  responde. La cola de F6 eligió a propósito colgar de PIDROUTE, PIDMTO, PIPE, DUCT
  y CABLETRAY, y con esa decisión entrega igual.
- **P-05 se comprobó y el diagnóstico salió AL REVÉS**, así que se declara corregido
  y sigue sin arreglarse (ver su Estado).

Lo que estas peticiones no podían saber, porque se escribieron antes:

- **«Ola G» no es la ola de MEP en ESCALERA.** P-06 fecha la cota de PIPE/DUCT/
  CABLETRAY «desde la Ola G»; en `ESCALERA.md` la Ola G es **el mapa** (línea 157) y
  las instalaciones son la Ola F. Se escribió «desde la ventana 2 de la campaña
  (2026-09-04)», que es cuando ocurrió de verdad.
- **El catálogo del PROYECTO tampoco existe.** P-03, P-04 y P-06 dan por hecho que
  «lo que sí hay es el catálogo del proyecto, que la organización escribe y amplía».
  No lo hay: es la T4 de la cola y **no se entregó** —no hay ningún módulo de
  catálogo bajo `lib/cad/plant/`, y la propia bitácora del frente lo declara tres
  veces como «se cierra el día que exista»—. Escribir esa frase habría sido meter en
  ESCALERA justo el claim sin evidencia que la campaña existe para cerrar, así que en
  las tres filas se dice que el catálogo del proyecto **es el camino elegido y
  todavía no existe**.
- **Dos de los tres «todavía no» de P-04 ya tenían fila.** El catálogo de fabricante
  y la salida ISOGEN ya estaban declarados en la tabla de la Ola 6; lo que les
  faltaba era el **motivo**. Se ampliaron esas filas en vez de añadir renglones
  duplicados. El tercero —el volumen derivado— sí es nuevo y entra como fila propia.
- **Aplicar P-04 obligó a corregir una frase que se volvió falsa.** La fila «Ruteo de
  tubería 3D» de la Ola 6 decía «lo que falta es el SÓLIDO de tubería… **Todavía
  no.**», y el sólido existe desde el T2. Añadir límites del sólido dejando en pie
  una fila que niega el sólido habría dejado el documento contradiciéndose. Fuera de
  petición, forzado por P-04.
- **Ningún peldaño se movió.** Las cinco filas tocadas siguen en el que tenían (5, 5,
  5, 5 y 0) y la fila nueva nace en 0. Lo que se movió es prosa que había dejado de
  ser cierta o que no daba su motivo. La prohibición de la ventana es editar ESCALERA
  «para que algo pase»: aquí no pasa nada por editarla —ningún gate ni ninguna spec
  la lee— y lo que se añade son MÁS límites declarados, no menos.
- **Deliberadamente NO se añadió fila positiva para la detección de choques**, que es
  la entrega más visible del frente (T1) y hoy no figura en ESCALERA. Otorgar un
  peldaño es evaluar, y evaluar es la otra pasada. ESCALERA queda reclamando de menos,
  que es el lado seguro.
- **El golden 81 no se pudo correr aquí.** No hay navegadores de Playwright
  (`~/.cache/ms-playwright` no existe). Lo que sí se comprobó: sus cuatro renglones
  exactos —la cabecera de siete columnas y las filas de ducto, tubería y válvula—
  están tecleados literalmente dentro de `mep-tracing.spec.ts`, que corre verde con
  127 comprobaciones; los montantes y los codos salen DESPUÉS de la fila 4, así que
  no tocan lo que el golden afirma. Queda declarado que no se ejecutó, en vez de
  insinuar que pasó.

Gates de esta ventana: `npm run typecheck` 8/8; los tres gates de comandos cuadrando
en **294** (manifiesto, integridad, alcance con el ratón y cinta); `npm run test:specs`
**604/604**. Ningún archivo de código cambió: esta ventana es documental de punta a
punta, porque el código de F6 ya se integró en `34a159c` y estaba verde.

## Peticiones

### P-mep-plant-01 · Aclarar que `plant-*` y `mep-schedule-table` son de F6
- **Archivo:** `docs/history/execution/frentes-superar-20260904/mep-plant.md` (sección «Territorio exclusivo»)
- **Por qué:** el glob de la ficha dice
  `apps/web/src/lib/cad/engine/commands/pipe*|duct*|cable*|mep*|pid*`, pero las órdenes
  PIDROUTE, PIDMTO, PIDISO, PIDLINE, PIDLIST, PIDEQUIP y PIDEQUIPLIST viven en archivos
  llamados `plant-route.ts`, `plant-iso.ts`, `plant-line.ts` y `plant-equipment.ts`, que
  ningún glob de ningún frente reclama. Igual pasa con
  `apps/web/src/lib/cad/data-extraction/mep-schedule-table.ts`, que es la tabla del cuadro
  de instalaciones. Toda la cola de F6 pasa por esos archivos.
- **Cambio exacto:** añadir a la lista de territorio de la ficha estas dos líneas:
  - `apps/web/src/lib/cad/engine/commands/plant-*`
  - `apps/web/src/lib/cad/data-extraction/mep-schedule-table.ts`
- **Cómo se comprueba:** ningún otro frente los reclama (F3 `solid*|3d*|section*|render*`,
  F5 `wall*|door*|window*|stair*|roof*|slab*|space*|elevation*|section*`,
  F7 `std*|balloon*|bom*|weld*|dimtol*|ae*`). Comprobado leyendo las tres fichas.
- **Estado:** **aplicada** (2026-09-04) tal cual: las dos líneas están en la lista de
  territorio de `mep-plant.md`, antes de `specs y goldens`. Recomprobado leyendo las
  ONCE fichas de frente y no sólo las tres que cita la petición: nadie más reclama
  `commands/plant-*` (lo más cerca, F3 con `section*` y F5 con `section*`, que no
  colisionan) ni `data-extraction/`, que no aparece en ningún territorio.

### P-mep-plant-02 · Cinta y alcance con el ratón, si se quieren órdenes nuevas
- **Archivos:** `apps/web/src/lib/cad/ribbon.ts` y `docs/cad/evidence/ui-command-reach.json`
- **Por qué:** una orden NUEVA obliga a los dos: `ribbon.ts` la coloca en su panel y
  `ui-command-reach.json` guarda el conteo del registro, que `npm run check:cad` compara
  (`scripts/cad/ui-command-reach.mjs --check`). Los dos están fuera del territorio de F6,
  así que **una orden nueva dejaría `check:cad` en rojo en este árbol hasta la ventana de
  integración**. Por eso la cola de F6 NO añade órdenes: cuelga todo de PIDROUTE, PIDMTO,
  PIDLIST, PIPE, DUCT y CABLETRAY, que ya tienen botón. Esta petición queda escrita por si
  el titular prefiere órdenes propias (PIDCLASH, PIDSOLID, MEPRISER).
- **Cambio exacto:** en `apps/web/src/lib/cad/ribbon.ts`, línea 146, sustituir el patrón
  del panel «Instalaciones»
  `/^(PIPE|DUCT|CABLETRAY|MEPSYMBOL|AEWIRE|AEWIRELIST|AECIRCUIT|AECHECK|AETAG|AETAGLIST|PIDLINE|PIDLIST|PIDEQUIP|PIDEQUIPLIST|PIDROUTE|PIDMTO|PIDISO)$/`
  por el mismo con `|PIDCLASH|PIDSOLID|MEPRISER` añadido antes del `)$`; después correr
  `node scripts/cad/ui-command-reach.mjs --write` y committear el JSON regenerado.
- **Cómo se comprueba:** `node scripts/cad/check-ribbon-coverage.mjs` y
  `node scripts/cad/ui-command-reach.mjs` (modo `--check`, el de `npm run check:cad`).
- **Estado:** **rechazada** (2026-09-04) — la decide el titular, no el coordinador, y su
  premisa no se cumple. PIDCLASH, PIDSOLID y MEPRISER **no existen**: `grep` sobre `.ts`,
  `.mjs`, `.json` y `.md` sólo los encuentra en prosa (esta petición, la bitácora de F6 y
  la cabecera de `plant-route.ts`). Con el mecanismo de HOY una orden nueva ya no cuesta
  dos archivos sino cuatro pasos —thunk en `engine/lazy-commands.ts`, manifiesto
  regenerado con `build-command-manifest.mjs --write`, icono en `command-icons.ts` (falla
  cerrado) y resumen de ≤ 110 caracteres—, y ninguno de los tres tiene implementación que
  registrar. Añadir su nombre al patrón del panel «Instalaciones» pondría en la cinta tres
  botones que nada responde. Los tres gates de comandos cuadran hoy en 294 y siguen en 294.

### P-mep-plant-03 · Rúbrica: la brecha de `toolset-plant3d` cuando bajen T1 y T2
- **Archivo:** `docs/competitive/rubric.json` (fila `toolset-plant3d`, campo `gap` y las
  evidencias de `toolset-plant3d.tuberia`) — **archivo de coordinador, F6 no lo toca (R2)**
- **Por qué:** el `gap` de hoy nombra tres ausencias que las entregas T1 y T2 de esta cola
  cierran: *«sólido de tubería con su diámetro real en el visor 3D —la ruta es el eje—,
  detección de choques contra estructura»*. Cuando estén verdes, esa frase deja de ser
  cierta y una cifra que no se corrige es un defecto (regla 4 de la campaña de cimientos).
- **Cambio exacto:** en `gap`, sustituir el trozo
  «sólido de tubería con su diámetro real en el visor 3D —la ruta es el eje—, detección de
  choques contra estructura, y salida en el formato de ISOGEN»
  por
  «salida en el formato de ISOGEN (formato propietario, sin especificación pública con la
  que comprobar una salida) y catálogo de fabricante. El sólido FACETADO de la tubería sale
  de la ruta con su diámetro NOMINAL y se ve en el visor 3D como cualquier `solid3d` —el
  exterior real lo da el catálogo del proyecto—, y los choques contra muros, huecos y
  sólidos del propio dibujo se miden por distancia exacta segmento-caja».
  Y añadir a las evidencias de `toolset-plant3d.tuberia`:
  `{ "kind": "spec", "path": "apps/web/src/lib/cad/plant/clash.spec.ts" }` y
  `{ "kind": "spec", "path": "apps/web/src/lib/cad/plant/pipe-solid.spec.ts" }`.
- **Cómo se comprueba:** `node scripts/cad/rubric.spec.mjs` y
  `node scripts/cad/rubric.mjs --markdown --check`.
- **Estado:** **pendiente — la decide el coordinador en su pasada de evaluación**
  (2026-09-04). `docs/competitive/rubric.json` no se edita en esta ventana por ninguna
  razón: un criterio abierto lo otorga quien lo EVALÚA, no quien lo construye ni quien lo
  integra. Lo que esta ventana sí deja hecho para esa pasada es **medir** las dos mitades
  en el árbol integrado, no releerlas del informe: `npx tsx src/lib/cad/plant/clash.spec.ts`
  → 56 verdes, `pipe-solid.spec.ts` → 77 verdes (volumen dentro del 0,33 % de `π r² L` en
  el montante de 90°, contra el −12,73 % que costaría quitar el densificado). Aviso para
  quien la aplique: **la frase propuesta dice «el exterior real lo da el catálogo del
  proyecto» y ese catálogo NO existe** (T4 de la cola, sin entregar), así que hay que
  reescribir esa mitad antes de pegarla. El matiz NOMINAL/FACETADO sí es correcto y está
  ya escrito así en la ESCALERA.

### P-mep-plant-04 · ESCALERA: los «todavía no» de MEP y Plant
- **Archivo:** `docs/parity/ESCALERA.md` — **archivo de coordinador, F6 no lo toca (R2)**
- **Por qué:** fix-or-hide. Lo que esta cola NO alcanza tiene que estar declarado con fecha
  en el sitio donde se declara, no sólo en la bitácora del frente.
- **Cambio exacto:** añadir, con fecha 2026-09-04, tres renglones de «todavía no»:
  1. «Catálogo de FABRICANTE de tubería (espesor de pared, diámetro exterior, peso, clave de
     compra, precio): está en normas y catálogos con dueño y no se transcribe ninguno. Lo que
     sí hay es el catálogo del PROYECTO, que la organización escribe y amplía.»
  2. «Salida en formato ISOGEN: formato propietario, sin especificación pública ni oráculo
     con el que comprobar una salida. El isométrico propio sí existe (PIDISO).»
  3. «Volumen de tubería DERIVADO en el visor, como el del muro: hoy el sólido de tubería se
     emite como `solid3d` con su receta de barrido, no se deriva de la polilínea en cada
     dibujado. Mover la ruta no mueve el sólido; PIDMTO avisa de que el sólido quedó viejo.»
- **Cómo se comprueba:** lectura; ESCALERA no tiene gate propio.
- **Estado:** **aplicada con su intención, no al pie de la letra** (2026-09-04), en la
  tabla de la Ola 6 («La planta de proceso»), que es donde viven estas capacidades:
  1. El catálogo de FABRICANTE ya tenía fila («Catálogo de fabricante con claves y
     precios», peldaño 0). Se amplió esa fila en vez de duplicarla: ahora nombra las cinco
     cosas que faltan (espesor de pared, diámetro exterior, peso, clave de compra, precio),
     dice que no se transcribe ninguno y —**corrigiendo la petición**— que el catálogo del
     PROYECTO es el camino elegido y **tampoco existe todavía**, con su consecuencia: la
     holgura sale optimista y el tubo se modela macizo.
  2. ISOGEN ya estaba declarado en la fila del isométrico, pero **sin decir por qué**. Se
     le añadió el motivo (formato propietario, sin especificación pública ni oráculo con
     el que comprobar una salida) y que el isométrico propio sí existe.
  3. El volumen DERIVADO sí es nuevo: entra como fila propia en peldaño 0, con la
     evidencia de lo que sí está probado —el aviso— citando `pipe-solid.spec.ts` (77) y
     `plant-route.spec.ts` (49), medidos aquí.
  Los tres llevan la fecha 2026-09-04 en el texto. Ningún peldaño se movió.

### P-mep-plant-05 · Aviso: `check:cad` está en rojo por `check:dwg-evidence`, y no lo causó F6
- **Archivos:** `docs/cad/evidence/dwg-decoder-matrix.json` y `packages/dwg-codec/` —
  **territorio del frente DWG, F6 no los toca (R2)**
- **Por qué:** al correr `npm run check:cad` sobre el árbol QUIETO de
  `campana/superar/mep-plant` (commit del T2), la cadena se para en
  `npm run check:dwg-evidence` con
  `AssertionError: el artefacto del disco coincide con lo que el árbol sostiene hoy`. El
  artefacto committeado declara «CERO BUNDLES ADMITIDOS, CERO CAPACIDADES PROMOVIDAS» y lo
  que el laboratorio regenera hoy dice `bundlesAdmitidos: 7`,
  `validacionesIndependientes: 14`, `capacidadesPromovidas: 2`. Es decir: el corpus llegó al
  árbol y el artefacto no se regeneró con él.
- **Que no lo causó F6, medido:** el commit del T2 toca ocho archivos y ninguno está bajo
  `packages/dwg-codec/`, `docs/cad/evidence/` ni `scripts/dwg/`
  (`git diff --name-only HEAD~1 HEAD -- packages/dwg-codec docs/cad/evidence scripts/dwg`
  devuelve 0 líneas, y `git status --porcelain` sobre esas rutas también). El generador no
  lee nada de `lib/cad/plant/`, así que su salida no puede haber cambiado por este frente.
- **Cambio exacto:** quien tenga el territorio DWG corre
  `node scripts/dwg/dwg-evidence.mjs --write` y committea el artefacto regenerado, **o**
  comprueba que `VALLE_DWG_CORPUS_MIRROR` apunta a donde debe (AGENTS.md: «o los gates DWG
  mienten por entorno»; aquí está SIN DEFINIR, y aun así el laboratorio encuentra siete
  bundles admitidos, que es lo que hay que explicar antes de regenerar nada).
- **Cómo se comprueba:** `npm run check:dwg-evidence` y después `npm run check:cad` entero.
- **Estado:** **rechazada como arreglo, y el diagnóstico CORREGIDO** (2026-09-04). El rojo
  sigue vivo en el árbol integrado —`npm run check:dwg-evidence` para en el mismo
  `AssertionError`—, pero **va en el sentido contrario al que describe la petición**, y eso
  cambia lo que hay que hacer:
  - El artefacto **del disco** dice `bundlesAdmitidos: 7`, `validacionesIndependientes: 14`,
    `capacidadesPromovidas: 2` y `corpus.estado: "verified"`. Lo que el laboratorio
    **regenera hoy** son ceros: `node scripts/dwg/dwg-evidence.mjs` imprime «0 capacidades
    promovidas, 4 round-trips externos, **0 bundles admitidos**». La petición lo leyó al
    revés (creyó que el disco era el de «CERO BUNDLES»), probablemente porque el `+` del
    diff de `assert` es el ACTUAL, es decir el disco.
  - Por qué salen ceros, medido: el artefacto fija
    `corpus.commitFijado = 0688fb9c395b9cac4169d1ee9c23a7370cc28cf3` y el corpus que hay en
    esta máquina (`/home/user/valle-design-dwg-conformance`, que **sí existe**) está en
    `aa2f561b0e52921737de6ff179d3d9e2c59e6518`. `VALLE_DWG_CORPUS_MIRROR` sigue sin definir.
    Es el caso exacto que AGENTS.md avisa: los gates DWG mienten por entorno.
  - **Consecuencia que obliga a NO tocarlo:** correr `--write` aquí no «pondría el artefacto
    al día», lo **degradaría** —borraría siete bundles admitidos y dos capacidades
    promovidas— y publicaría como evidencia una ausencia causada por el entorno. Se queda
    rojo y declarado. Lo arregla quien tenga el territorio DWG (`docs/cad/evidence/dwg-*`,
    `packages/dwg-codec/**`, `scripts/dwg/**`), fijando el corpus al commit que el artefacto
    declara o volviendo a fijar el artefacto al corpus, con la firma correcta.
  - No lo causó ningún frente de la tanda 2: los seis commits de la ventana no tocan
    `packages/dwg-codec/`, `scripts/dwg/` ni `docs/cad/evidence/dwg-*` (sólo
    `command-integrity.json` y `ui-command-reach.json`).

### P-mep-plant-06 · Rúbrica y ESCALERA: la mitad 3D de MEP dejó de estar fuera
- **Archivos:** `docs/competitive/rubric.json` (fila `toolset-mep`, campo `gap` y evidencias
  de `toolset-mep.trazado` y `toolset-mep.tablas`) y `docs/parity/ESCALERA.md` (línea 156 y
  línea 229) — **archivos de coordinador, F6 no los toca (R2)**
- **Por qué:** las dos afirman hoy que *«la mitad 3D —ruteo con colisiones, diámetros por
  especificación— queda fuera»*. Con el T3 (2026-09-04) la mitad de esa frase dejó de ser
  cierta: PIPE, DUCT y CABLETRAY tienen `Elevación` y montante, cada vértice escribe su `z`,
  el cuadro mide en tres dimensiones —un montante de 2 m sumaba cero metros y ahora suma los
  suyos— y las corridas MEP entran en el mismo análisis de choques que la tubería de
  proceso, con muros, huecos y sólidos. Lo que sigue fuera es el **diámetro por
  especificación** (el catálogo es del proyecto y no se transcribe) y el **canto del ducto**
  (el formato guarda el ancho, no el alto). Una cifra que no se corrige es un defecto.
- **Cambio exacto, `rubric.json` — `toolset-mep.gap`:** sustituir el trozo final
  «La mitad 3D —ruteo con colisiones, diámetros por especificación— queda fuera y se dice en
  ESCALERA.»
  por
  «La cota está en las tres órdenes desde la Ola G (2026-09-04): `Elevación` mete el
  montante en el sitio, cada vértice lleva su `z`, el cuadro mide en TRES dimensiones —un
  montante de 2 m sumaba cero metros— y suma montantes y codos deducidos de la geometría, y
  las corridas MEP se miden contra muros, huecos y sólidos del propio dibujo por distancia
  exacta. Queda fuera el diámetro por especificación —el catálogo es del proyecto y no se
  transcribe— y el canto del ducto, que el formato no guarda: la holgura vertical de un
  ducto es la de su ancho, y se dice.»
- **Cambio exacto, `rubric.json` — evidencias:** ninguna que añadir en `toolset-mep.trazado`
  ni en `toolset-mep.tablas`: la spec que las sostiene es la misma
  (`apps/web/src/lib/cad/engine/commands/mep-tracing.spec.ts`) y pasó de 71 a 127
  comprobaciones. Si se quiere una segunda fuente para el choque de las corridas MEP, la
  hay: `{ "kind": "spec", "path": "apps/web/src/lib/cad/plant/clash.spec.ts" }`.
- **Cambio exacto, `ESCALERA.md`:** en la línea 156 (fila «MEP (mitad 2D)») sustituir
  «La mitad 3D —ruteo con colisiones, diámetros por especificación— queda fuera y se dice.»
  por
  «Con cota desde la Ola G: `Elevación` y montante en las tres órdenes, longitudes en tres
  dimensiones y choques contra muros, huecos y sólidos (`mep-tracing.spec.ts`, 127). Queda
  fuera el diámetro por especificación y el canto del ducto.»
  Y en la línea 229 (fila de PIPE) sustituir
  «sin ruteo 3D ni diámetros por especificación (la mitad 3D de MEP, fuera de alcance)»
  por
  «con ruteo 3D por cota y montante, sin diámetros por especificación (el catálogo es del
  proyecto)»; el «(71)» de la columna de evidencia pasa a «(127)».
- **Cómo se comprueba:** `node scripts/cad/rubric.spec.mjs` y
  `node scripts/cad/rubric.mjs --markdown --check`.
- **Estado:** **partida en dos** (2026-09-04).
  - **`rubric.json`: pendiente — la decide el coordinador** en su pasada de evaluación,
    igual que P-03 y por el mismo motivo. En esta ventana la rúbrica no se edita.
  - **`ESCALERA.md`: aplicada**, las dos líneas, con dos correcciones que la petición no
    podía prever:
    1. **«desde la Ola G» es falso en este documento**: la Ola G de `ESCALERA.md` es *el
       mapa* (línea 157) y las instalaciones son la Ola F. Se escribió «desde la ventana 2
       de la campaña (2026-09-04)».
    2. **«el catálogo es del proyecto» insinúa que existe**, y no existe (ver la cabecera
       de esta ventana). En la fila de PIPE se escribió «no se transcribe ningún catálogo y
       el del proyecto sigue en la cola, sin entregar».
    La cifra `(71)` → `(127)` se aplicó tras MEDIRLA:
    `npx tsx src/lib/cad/engine/commands/mep-tracing.spec.ts` imprime 127. Se añadió la
    segunda fuente que la propia petición ofrecía (`plant/clash.spec.ts`, 56, medida
    también) a la fila de MEP, y se conservó entera la mitad que declara lo que sigue
    FUERA: diámetro por especificación y canto del ducto. Los peldaños de las dos filas
    siguen en 5.
