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
  SOLIDEDIT: "Edición de sólidos: extruir, desfasar o copiar una cara, copiar las aristas, comprobar, separar, limpiar o vaciar un cuerpo.",
  ```

  Nada más de ese archivo. No hay comando nuevo, así que ni el registro, ni la
  cinta, ni `docs/cad/evidence/ui-command-reach.json` cambian.

  **Actualizado el 2026-09-04 (entrega 4/5).** El renglón pedido incluye ahora
  `Cuerpo · Vaciar` (SHELL), que existe desde esa entrega: deja una pared del
  espesor pedido sobre cuerpos convexos, con el interior como nodo `brep` y un
  nodo `subtract`, de modo que el árbol del exterior sobrevive intacto. Ésta es
  la **tercera** redacción de esta petición y el motivo es sano —la ventana ha
  seguido construyendo—: **este** es el texto definitivo de la ventana, y cubre
  las ocho ramas.
- **Cómo se comprueba:** `npm run check:command-integrity` (SOLIDEDIT sigue en
  «informa», ni ROJO ni no-concluyente) y
  `cd apps/web && npx tsx src/lib/cad/engine/commands/solids-edit.spec.ts`
  (119 comprobaciones, las ocho ramas construidas y las ocho declaradas
  ausentes), y `npx tsx src/lib/cad/solid3d-frontera.spec.ts` (279
  comprobaciones: las dieciséis ramas de SOLIDEDIT y los 52 caminos de las ocho
  primitivas, cada uno conducido hasta su efecto o hasta su límite).
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

### P-tresd-04 · La ESCALERA declara ausente un SOLIDEDIT que ya tiene ocho ramas
- **Archivo:** `docs/parity/ESCALERA.md` (archivo compartido prohibido: lo aplica
  sólo el coordinador).
- **Por qué:** entregas 3 y 4 de la cola. Desde el 2026-09-04 `SOLIDEDIT` tiene
  ocho ramas construidas —Cara·Extruir, Cara·Desfasar, Cara·Copiar,
  Arista·Copiar, Cuerpo·Comprobar, Cuerpo·Separar, Cuerpo·Limpiar y
  Cuerpo·Vaciar— y siete operaciones declaradas ausentes con su motivo, en ocho
  renglones (Color aparece en dos ramas por la misma razón). El
  renglón de la ESCALERA describe el estado anterior. Es evidencia que
  envejeció; el criterio de la casa es que lo que gana su evidencia se dice, y lo
  que no, se declara con su cifra.
- **Cambio exacto:** en la celda de SOLIDEDIT, sustituir la descripción actual
  por

  ```
  Ocho ramas construidas y con spec (119 comprobaciones en `solids-edit.spec.ts`, 2026-09-04): Cara·Extruir, Cara·Desfasar, Cara·Copiar, Arista·Copiar, Cuerpo·Comprobar, Cuerpo·Separar, Cuerpo·Limpiar (fusión de caras coplanarias: la unión de dos cajas contiguas pasa de 20 caras y 30 aristas a 6 y 12, con el volumen intacto) y Cuerpo·Vaciar (SHELL sobre cuerpos convexos: la caja de 100³ vaciada 10 deja 488 000 = 10⁶ − 80³, cerrada y con dos cáscaras; el interior entra como nodo `brep` y un nodo `subtract`, así que el árbol del exterior sobrevive intacto). Siguen fuera, nombradas una por una en el prompt de su rama: Cara·Mover, Girar, Inclinar y Borrar (piden recomponer las caras adyacentes), Color de cara y de arista y Material de cara (el esquema no guarda atributos por cara ni por arista) y Cuerpo·Estampar (sin operación de kernel). Son ocho de las DIECISÉIS operaciones que SOLIDEDIT reparte entre sus tres ramas, y las dieciséis se recorren una por una en `solid3d-frontera.spec.ts` (279 comprobaciones, 2026-09-04): cada una termina escribiendo en el documento, respondiendo su motivo, o declarada ausente sin ser pulsable. De Vaciar falta el MODO abierto —retirar las caras designadas—, declarado en el propio prompt del espesor; y vaciar un cuerpo cóncavo se rechaza nombrándolo, con la convexidad comprobada arista por arista. Designar UNA arista suelta sigue fuera: `CAD_ACCEPT_EDGE_PICK` no existe (P-tresd-02).
  ```

  Si la ESCALERA lleva además un renglón para la fusión de caras coplanarias del
  kernel, debe pasar de ausente a presente con esta cifra: `mergeCoplanarFaces`
  en `apps/web/src/lib/brep/coplanar-merge.ts`, 76 comprobaciones en
  `coplanar-merge.spec.ts`; queda fuera cerrar un ANILLO (dos cadenas
  compartidas), medido: una placa agujereada baja de 36 caras a 12 y no a 10.

  Y si lleva un renglón para SHELL / vaciado de sólidos, debe pasar de ausente a
  presente con esta cifra: `shellBody` en `apps/web/src/lib/brep/shell.ts`, 89
  comprobaciones en `shell.spec.ts`. Sólo cuerpos CONVEXOS, con la convexidad
  comprobada sobre todas las aristas; queda fuera la cáscara abierta (retirar
  caras designadas), el vaciado hacia fuera y el vértice de cuatro planos que no
  concurren al desfasarlos (el ápice de una pirámide de base rectangular).
- **Cómo se comprueba:** `cd apps/web && npx tsx
  src/lib/brep/coplanar-merge.spec.ts` (76 comprobaciones), `npx tsx
  src/lib/brep/shell.spec.ts` (89), `npx tsx
  src/lib/cad/engine/commands/solids-edit.spec.ts` (119) y `npx tsx
  src/lib/cad/solid3d-frontera.spec.ts` (279). No hay comando nuevo:
  ni el registro, ni la cinta, ni `docs/cad/evidence/ui-command-reach.json`
  cambian.
- **Estado:** pendiente
