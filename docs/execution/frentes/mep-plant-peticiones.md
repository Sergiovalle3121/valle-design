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
- **Estado:** pendiente — se pide sólo cuando las dos specs estén verdes y committeadas.

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
