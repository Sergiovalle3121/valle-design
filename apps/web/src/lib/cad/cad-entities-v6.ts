/**
 * Entidades del esquema 6 del documento canónico: el MURO paramétrico.
 *
 * Se declara aquí y no en `cad-document.ts` por las mismas dos razones que las
 * del esquema 4 y el 5, y la segunda sigue mandando:
 *
 *  1. `cad-document.ts` está en el trinquete de tamaño.
 *  2. Su único import es `import type`, que se borra al compilar, así que este
 *     módulo es una HOJA del grafo de carga y no puede cerrar ningún ciclo.
 *
 * ## Un WALL guarda su EJE, no su contorno
 *
 * Es la misma decisión que tomó el esquema 5 con los sólidos, aplicada a la
 * primera entidad BIM del producto: se persiste la RECETA —dos puntos de eje,
 * un grosor y una altura— y la planta de doble línea se deriva al dibujar.
 *
 * La alternativa (guardar las cuatro esquinas del contorno) parece inocente y
 * no lo es: un contorno no se puede REEDITAR como muro. Cambiar el grosor de
 * un polígono de cuatro puntos exige adivinar cuál era el eje, y esa
 * adivinanza falla en cuanto alguien movió una esquina. Con la receta, cambiar
 * el grosor es cambiar un número, y la geometría vuelve a salir de
 * `wall-geometry.ts` idéntica a como saldría al dibujarlo de nuevo.
 *
 * El grosor se reparte SIMÉTRICAMENTE a ambos lados del eje. Las
 * justificaciones de AutoCAD Architecture (izquierda/derecha/cara) llegarán
 * como un campo opcional cuando haya un comando que las pida; inventar el
 * campo hoy sería fijar un contrato que ningún código consume.
 *
 * ## Por qué `height` vive en la entidad y no en un estilo
 *
 * Un muro es la primera entidad HOSPEDANTE del producto: puertas y ventanas se
 * colgarán de él. Esa relación necesita que el muro sepa su altura sin
 * consultar tablas, porque el hueco de una puerta se recorta contra la cara
 * del muro, no contra un estilo. Cuando lleguen los estilos de muro, la altura
 * explícita seguirá siendo el override — el mismo camino que recorrieron los
 * estilos de cota.
 */
import type { CadEntityContext, CadPoint3 } from "./cad-document";
import type { CadWallMaterialId } from "./wall-materials";

/**
 * WALL — muro paramétrico definido por su eje.
 *
 * `start` y `end` son los extremos del EJE en coordenadas del mundo, con la
 * misma forma que una LINE para que los snaps y las cotas asociativas los
 * traten igual. `thickness` es el grosor TOTAL del muro y `height` su altura
 * de extrusión; ambos en unidades del documento y estrictamente positivos —
 * la validación del servidor rechaza lo demás, porque un muro de grosor cero
 * no es un muro delgado: es un contorno degenerado que rompe el hit-testing.
 *
 * `material` es OPCIONAL y aditivo (campo nuevo, sin bump de esquema: ver
 * `wall-materials.ts`). Ausente, el muro dibuja el gris genérico de siempre
 * — ningún documento existente cambia de aspecto por este campo.
 */
export interface CadWallEntity {
  id: string;
  type: "wall";
  start: CadPoint3;
  end: CadPoint3;
  thickness: number;
  height: number;
  material?: CadWallMaterialId;
  layer: string;
  context?: CadEntityContext;
}

/** Unión de los tipos que estrena el esquema 6. */
export type CadSchema6Entity = CadWallEntity;

/** Nombres de los tipos nuevos, para inventarios y validación. */
export const CAD_SCHEMA_6_ENTITY_TYPES = [
  "wall",
] as const satisfies readonly CadSchema6Entity["type"][];
