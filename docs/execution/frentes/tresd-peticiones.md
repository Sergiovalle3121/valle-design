# Peticiones de F3 · El 3D honesto (dueño del monolito)

Lo que este frente necesita **fuera de su territorio** (R1) o en un **archivo compartido**
(R2). El coordinador las aplica en la ventana de integración; el frente **no** las toca.

Formato de cada petición:

```
### P-tresd-NN · <título>
- **Archivo:** <ruta exacta>
- **Por qué:** <qué entrega de la cola lo necesita>
- **Cambio exacto:** <diseño completo — el coordinador no adivina>
- **Cómo se comprueba:** <la spec o el gate que lo demuestra>
- **Estado:** pendiente | aplicada | rechazada (<motivo>)
```

## Peticiones

### P-tresd-01 · El resumen de SOLIDEDIT nombra tres ramas que ya no son todas
- **Archivo:** `apps/web/src/lib/cad/engine/command-summaries.ts` (línea 248)
- **Por qué:** entrega 1 de la cola («SOLIDEDIT: tres ramas más»). El resumen que
  ve el usuario en la paleta y en la ayuda dice hoy sólo lo que SOLIDEDIT hacía
  antes del 2026-09-04. Desde esta ventana también desfasa una cara, copia una
  cara como REGION y copia las aristas de un sólido como líneas. Dejarlo como
  está no es un error de código: es un claim corto de más, y el criterio de la
  casa es que lo que gana su evidencia se dice.
- **Cambio exacto:** sustituir

  ```ts
  SOLIDEDIT: "Edición de sólidos: extruir una cara, comprobar un cuerpo o separar una unión.",
  ```

  por

  ```ts
  SOLIDEDIT: "Edición de sólidos: extruir, desfasar o copiar una cara, copiar las aristas, comprobar un cuerpo o separar una unión.",
  ```

  Nada más de ese archivo. No hay comando nuevo, así que ni el registro, ni la
  cinta, ni `docs/cad/evidence/ui-command-reach.json` cambian.
- **Cómo se comprueba:** `npm run check:command-integrity` (SOLIDEDIT sigue en
  «informa», ni ROJO ni no-concluyente) y
  `cd apps/web && npx tsx src/lib/cad/engine/commands/solids-edit.spec.ts`
  (60 comprobaciones, las seis ramas construidas y las ocho declaradas ausentes).
- **Estado:** pendiente

### P-tresd-02 · `CAD_ACCEPT_EDGE_PICK`: designar UNA arista
- **Archivo:** `apps/web/src/lib/cad/engine/command-types.ts`
- **Por qué:** entrega 1 de la cola. `SOLIDEDIT Arista Copiar` ya existe, pero
  copia TODAS las aristas del sólido designado porque el motor de comandos no
  tiene forma de pedir una arista: `CAD_ACCEPT_EDGE_PICK` tiene cero apariciones
  en el árbol y `command-types.ts` está fuera del territorio de este frente. La
  rama lo dice en su propio prompt en vez de fingir una designación fina, y aquí
  queda pedido el gesto que la completaría (y que también le haría falta a
  `FILLETEDGE`/`CHAMFEREDGE`, que hoy reciben índices crudos de arista).
- **Cambio exacto:** tres añadidos, todos ADITIVOS:

  1. La bandera, junto a las que ya hay (`CAD_ACCEPT_FACE_PICK = 128`):

     ```ts
     /** El anfitrión puede designar UNA arista del sólido bajo el cursor. */
     export const CAD_ACCEPT_EDGE_PICK = 256;
     ```

  2. La entrada, en la unión `CadCommandInput`, con la MISMA forma que
     `facePick` —índice más huella— para que una arista designada sobreviva a
     una reevaluación del árbol igual que lo hace una cara:

     ```ts
     | {
         kind: "edgePick";
         entityId: string;
         /** Índice de la arista en el cuerpo evaluado, como vía rápida. */
         edge: number;
         /** Los dos extremos en coordenadas del mundo: la huella que se comprueba. */
         from: CadPoint3;
         to: CadPoint3;
         /** Punto tocado sobre la arista, para el enganche. */
         point: CadPoint2;
       }
     ```

  3. Nada más. El resolutor de aristas (rayo de cámara contra los segmentos
     teselados) y el consumo en `SOLIDEDIT Arista` los construye este frente en
     su territorio (`lib/cad/pick3d/`, `lib/cad/engine/commands/solid*`) en
     cuanto la bandera y la entrada existan.
- **Cómo se comprueba:** con la bandera aplicada, este frente añade a
  `solids-edit.spec.ts` el caso «designar la arista superior de una caja emite
  UNA línea, la de esa arista» y a `pick3d` su spec de rayo-contra-arista. Sin
  ella el gate actual sigue verde: la rama copia todas y lo dice.
- **Estado:** pendiente

### P-tresd-03 · El resumen de POLYSOLID/CYLINDER y el renglón de la ESCALERA
- **Archivos:** `apps/web/src/lib/cad/engine/command-summaries.ts` y
  `docs/parity/ESCALERA.md` (este segundo, además, en la lista de archivos
  compartidos prohibidos: lo aplica sólo el coordinador).
- **Por qué:** entrega 2 de la cola. Desde el 2026-09-04 CYLINDER y CONE aceptan
  2Puntos, 3Puntos y Elíptico; PYRAMID acepta Arista; POLYSOLID traza tramos de
  Arco y engrosa una polilínea con `bulge`. Los dos textos siguen describiendo
  el estado anterior, y uno de ellos —la ESCALERA— lo declara como ausencia.
  Dejarlo así no es un error de código: es evidencia que envejeció, y el
  criterio de la casa es que lo que gana su evidencia se dice.
- **Cambio exacto (1/2):** en `command-summaries.ts`, sustituir

  ```ts
  POLYSOLID: "Muro al vuelo: recorrido de tramos rectos con ancho y altura, o desde una línea.",
  ```

  por

  ```ts
  POLYSOLID: "Muro al vuelo: recorrido de tramos rectos y de arco con ancho y altura, o desde una línea o polilínea.",
  ```

  Nada más de ese archivo: los resúmenes de CYLINDER, CONE y PYRAMID no nombran
  hoy ningún modo, así que no dicen nada que haya dejado de ser cierto.
- **Cambio exacto (2/2):** en `docs/parity/ESCALERA.md`, línea 174, la celda de
  «Las ocho primitivas de sólido» dice hoy

  ```
  | Nada de peldaño; los modos 3P/2P/Ttr/Elíptico de CYLINDER y CONE, Arista de PYRAMID y Arco de POLYSOLID no se ofrecen. |
  ```

  y debe decir

  ```
  | Nada de peldaño; CYLINDER y CONE aceptan 2P, 3P y Elíptico, PYRAMID acepta Arista y POLYSOLID traza tramos de arco (105 comprobaciones en `solids-primitives.spec.ts`, 2026-09-04). Ttr sigue fuera: pide resolver tangencias contra dos entidades designadas y estas órdenes no designan objetos. |
  ```
- **Cómo se comprueba:** `cd apps/web && npx tsx
  src/lib/cad/engine/commands/solids-primitives.spec.ts` (105 comprobaciones,
  con el volumen de cada modo contra papel y la corrección de faceta en número)
  y `npm run check:command-integrity`. No hay comando nuevo: ni el registro, ni
  la cinta, ni `docs/cad/evidence/ui-command-reach.json` cambian.
- **Estado:** pendiente
