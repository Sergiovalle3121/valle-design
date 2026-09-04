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

## Peticiones

### P-mep-plant-01 · Aclarar que `plant-*` y `mep-schedule-table` son de F6
- **Archivo:** `docs/execution/frentes/mep-plant.md` (sección «Territorio exclusivo»)
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
- **Estado:** pendiente — F6 trabaja sobre ellos asumiendo que son suyos y lo declara aquí.

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
- **Estado:** pendiente — sólo si el titular quiere órdenes propias. Sin ella F6 entrega igual.

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
- **Estado:** pendiente — **las dos mitades ya están verdes y committeadas**
  (`apps/web/src/lib/cad/plant/clash.spec.ts`, 56 comprobaciones, y
  `apps/web/src/lib/cad/plant/pipe-solid.spec.ts`, 77 comprobaciones, ambas 2026-09-04). El
  cambio exacto de arriba se puede aplicar entero. Matiz que el texto ya recoge y conviene
  no perder al copiarlo: el diámetro del sólido es el **NOMINAL** y el cuerpo es
  **FACETADO** (prisma de 16 lados de área equivalente); llamarlo «diámetro real» sería
  justo el claim sin evidencia que la regla 3 prohíbe.

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
- **Estado:** pendiente.

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
- **Estado:** pendiente — F6 lo declara en vez de callarlo, y **no lo arregla**: regenerar
  ese artefacto desde este frente sería promover capacidades DWG con la firma equivocada.

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
- **Estado:** pendiente — la capacidad ya está verde y committeada
  (`apps/web/src/lib/cad/engine/commands/mep-tracing.spec.ts`, 127 comprobaciones,
  2026-09-04). F6 no toca ninguno de los dos archivos.
