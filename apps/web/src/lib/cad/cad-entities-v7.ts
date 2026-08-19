/**
 * Entidades del esquema 7 del documento canónico: el HUECO alojado en un muro.
 *
 * Se declara aquí y no en `cad-document.ts` por las mismas dos razones que el
 * esquema 4, el 5 y el 6:
 *
 *  1. `cad-document.ts` está en el trinquete de tamaño.
 *  2. Su único import es `import type`, que se borra al compilar, así que este
 *     módulo es una HOJA del grafo de carga y no puede cerrar ningún ciclo.
 *
 * ## Un OPENING no tiene coordenadas propias, y eso es todo el diseño
 *
 * El esquema 6 dijo que el muro es «la primera entidad HOSPEDANTE del producto:
 * puertas y ventanas se colgarán de él». Ésta es esa entidad, y la decisión que
 * la define es que **no persiste ni un punto del mundo**: guarda a QUÉ muro
 * pertenece y a qué distancia del arranque de su eje está su centro. Todo lo
 * demás —dónde cae, hacia dónde mira, qué trozo de cara del muro desaparece—
 * se deriva del anfitrión cada vez que alguien dibuja, igual que el contorno
 * del muro (`wall-geometry.ts`) y sus uniones (`wall-joins.ts`).
 *
 * Las tres consecuencias son EXACTAMENTE lo que se le pide a un hueco alojado,
 * y ninguna necesita código que las mantenga sincronizadas:
 *
 *  - **Mover el muro mueve la puerta.** No hay nada que actualizar: la puerta
 *    se dibuja leyendo el eje del muro, que ya está en su sitio nuevo. Un
 *    diseño con la puerta en coordenadas de mundo habría necesitado un
 *    regenerador, y un regenerador tiene casos en los que no se dispara.
 *  - **Girar o escalar la planta la lleva consigo**, por lo mismo.
 *  - **Borrar el muro cierra el hueco.** Sin anfitrión, el hueco no existe: se
 *    retira en el MISMO lote (véase el GC transaccional de `entity-commands.ts`)
 *    y la cara del muro vuelve a ser continua porque ya no hay nada que la
 *    corte. No queda una puerta flotando en el aire ni un agujero sin dueño.
 *
 * El precio, dicho: una puerta NO se mueve con MOVE por su cuenta. Se desliza
 * por su grip sobre el eje o se teclea su `position` en propiedades. Es lo
 * mismo que hace AutoCAD Architecture y es la única lectura coherente: un hueco
 * fuera de su muro no es un hueco, es un dibujo de una puerta.
 *
 * ## El SÍMBOLO es sustituible; el ALOJAMIENTO no
 *
 * `symbolBlock` deja que el hueco se dibuje con un bloque del estudio —la hoja,
 * el barrido, la carpintería que cada despacho tiene normalizada— en vez del
 * símbolo de fábrica. El bloque se escala a la anchura del hueco y gira con el
 * muro; lo que NO cambia es el alojamiento, que es de la entidad y no del
 * bloque. Así la biblioteca de bloques arquitectónicos puede crecer sin tocar
 * este esquema, y un hueco sigue siendo un hueco aunque su bloque no exista
 * todavía: se dibuja el símbolo de fábrica y la referencia rota se rechaza en
 * la frontera, no se dibuja a medias.
 */
import type { CadEntityContext } from "./cad-document";

/** Qué es el hueco. Cambia el símbolo y el antepecho, no el alojamiento. */
export type CadOpeningKind = "door" | "window";

/**
 * OPENING — puerta o ventana ALOJADA en un muro.
 *
 * `hostId` es el muro anfitrión y `position` la distancia, medida SOBRE el eje
 * desde `start`, hasta el centro del hueco. Las dos son la dirección de este
 * esquema: sin `hostId` la entidad no se puede situar, y `position` es lo único
 * que la mueve dentro de su anfitrión.
 *
 * `width` y `height` son el hueco de obra (no la hoja), y `sill` el antepecho
 * medido desde el suelo: 0 en una puerta, ~900 mm en una ventana corriente. Los
 * tres van en unidades del documento y los invariantes del servidor rechazan lo
 * no positivo y lo que no cabe en el muro, porque un hueco más largo que su
 * anfitrión no es un hueco grande: es una cara partida en dos trozos que no se
 * tocan.
 */
export interface CadOpeningEntity {
  id: string;
  type: "opening";
  kind: CadOpeningKind;
  /** Muro anfitrión. Sin él la entidad no tiene coordenadas. */
  hostId: string;
  /** Distancia sobre el eje del anfitrión, desde `start`, al centro del hueco. */
  position: number;
  /** Anchura del hueco de obra, medida a lo largo del eje. */
  width: number;
  /** Altura del hueco de obra. */
  height: number;
  /** Antepecho sobre el suelo. 0 en una puerta. */
  sill: number;
  /**
   * A qué lado del eje barre la hoja, mirando de `start` a `end`. Sólo dibuja
   * en una puerta; una ventana lo ignora y no se le pide.
   */
  swing: "left" | "right";
  /** De qué jamba cuelga la hoja: la del arranque del eje o la del final. */
  hinge: "start" | "end";
  /** Bloque que dibuja el símbolo. Ausente: el símbolo de fábrica. */
  symbolBlock?: string;
  layer: string;
  context?: CadEntityContext;
}

/** Unión de los tipos que estrena el esquema 7. */
export type CadSchema7Entity = CadOpeningEntity;

/** Nombres de los tipos nuevos, para inventarios y validación. */
export const CAD_SCHEMA_7_ENTITY_TYPES = [
  "opening",
] as const satisfies readonly CadSchema7Entity["type"][];
