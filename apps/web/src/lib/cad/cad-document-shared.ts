/**
 * Constantes y ayudas COMPARTIDAS entre el documento canónico y su adaptador
 * heredado.
 *
 * Existe por una razón mecánica y una arquitectónica.
 *
 * La mecánica: `cad-document.ts` está en el trinquete de tamaño y sólo puede
 * encoger, así que el adaptador heredado (`layoutToCadDocument` /
 * `cadDocumentToLayout`) se mudó a su propio módulo. Ese módulo necesita las
 * mismas constantes de capa y los mismos ayudantes de orden.
 *
 * La arquitectónica, que es la que manda: el adaptador NO puede importar
 * VALORES de `cad-document.ts`, porque `cad-document.ts` reexporta el adaptador
 * y eso cerraría un ciclo de imports. `tsc --noEmit` no ve esos ciclos —los
 * tipos se borran al compilar— y el producto revienta al cargar con «Cannot
 * access X before initialization». Este módulo es la hoja del grafo: no importa
 * nada del CAD **en tiempo de ejecución**, así que ambos lados pueden depender
 * de él sin cerrar nada. El único import que tiene es `import type`, y eso se
 * borra al compilar.
 */
import type { CadStyleTable } from "./cad-document";

/** Prefijo de capa por defecto cuando un objeto no declara ninguna. */
export const DEFAULT_LAYER_ID = "0";

/**
 * v4 estrenó POINT, XLINE, RAY, SOLID, WIPEOUT, IMAGE, ATTDEF y TABLE, más la
 * sección `imageDefinitions`, los atributos POSICIONADOS de INSERT y el grosor
 * por tramo de una polilínea.
 *
 * v5 estrena SOLID3D y REGION: el modelado de sólidos B-rep. Un SOLID3D guarda
 * su ÁRBOL DE CONSTRUCCIÓN —primitivas y operaciones— y no su malla, de modo que
 * se puede reeditar y el archivo no engorda con decenas de miles de triángulos;
 * la malla se deriva al abrir.
 *
 * v6 estrena WALL: el muro paramétrico, primera entidad BIM. Igual que un
 * SOLID3D, persiste su RECETA —eje, grosor y altura— y la planta de doble
 * línea se deriva al dibujar, así que reeditar el grosor es cambiar un número.
 *
 * v7 estrena OPENING: el hueco —puerta o ventana— ALOJADO en un muro. Lleva la
 * misma idea un paso más allá: no persiste ni un punto del mundo, sólo a qué
 * muro pertenece y a qué distancia de su arranque. Por eso mover el anfitrión
 * lo mueve y borrarlo lo cierra, sin que haya un regenerador que mantener.
 *
 * v8 no estrena ninguna entidad: estrena una CÁMARA en la ventana gráfica. Es
 * la única subida que toca una sección del documento en vez de la lista de
 * entidades, y por eso es la única cuya migración ESCRIBE algo en documentos
 * que ya existían: cada ventana recibe su `view` de planta explícita. Es
 * aditivo en el sentido que importa —lo que la lámina enseña no cambia, y su
 * spec lo mide punto a punto—, pero no en el de «sólo sube el número»: después
 * de abrir, «esta ventana no dice desde dónde mira» deja de ser un estado
 * posible. El porqué está en la cabecera de `cad-paper-viewport.ts`.
 *
 * v9 vuelve a la forma puramente aditiva: `CadLayerDef` gana `frozen`
 * (opcional-ausente, como `plot`) y el documento gana la sección opcional
 * `layerStates` — los estados de capa con nombre, que hasta esta subida vivían
 * en la sesión y no sobrevivían a una recarga. Ningún documento existente
 * cambia un byte de serializado: lo único que sube es `meta.schema`.
 *
 * Todo aditivo, en las seis subidas: un documento v3…v8 migra sin perder un
 * campo y sin que se reinterprete ninguno de los que ya traía.
 */
export const CAD_DOCUMENT_SCHEMA = 9;

/** Capa estable de las colocaciones de estación. */
export const STATIONS_LAYER = "Stations";

/** Prefijo estable del id de conector (from→to) para round-trip determinista. */
export const CONNECTOR_PREFIX = "conn:";

/**
 * Capa que el adaptador heredado impone a todo conector, porque el modelo
 * histórico no la modela. Verla en una proyección significa "no lo sé", no
 * "quiero esta capa" — de ahí que la reproyección conserve la del documento.
 */
export const CONNECTOR_LAYER = "Flow";

export function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Los PARÁMETROS se identifican por nombre, no por id: su orden estable es el
 * alfabético por nombre. Vive junto a `byId` porque es la misma clase de
 * canonicalización — un catálogo que se resuelve por su clave, no un orden que
 * el usuario compuso.
 */
export function byName(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

export function point3(x: number, y: number, z = 0): { x: number; y: number; z: number } {
  return { x, y, z };
}

export function emptyStyles(): CadStyleTable {
  return { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} };
}

/**
 * Sustituye un conjunto de ids del orden de dibujo por otros, **en la posición
 * que ocupaban**, conservando el z-order del resto.
 *
 * Es lo que necesitan convertir geometría en bloque y explotar un bloque: si
 * el resultado se añade al final, la operación cambia lo que tapa a qué. Con
 * esto, definir un bloque y explotarlo vuelve a ser visualmente inocuo.
 *
 * La posición elegida es la del elemento sustituido MÁS ALTO (el índice mayor),
 * porque es el que determinaba qué cubría el conjunto.
 */
export function replaceEntityIdsAt(
  entityIds: string[],
  removed: ReadonlySet<string>,
  inserted: string[],
): string[] {
  const indices = entityIds
    .map((id, index) => (removed.has(id) ? index : -1))
    .filter((index) => index >= 0);
  const kept = entityIds.filter((id) => !removed.has(id));
  if (indices.length === 0) return [...kept, ...inserted];
  // Cuántos elementos conservados quedaban por debajo del más alto retirado.
  const anchor = indices[indices.length - 1];
  const below = entityIds
    .slice(0, anchor)
    .filter((id) => !removed.has(id)).length;
  return [...kept.slice(0, below), ...inserted, ...kept.slice(below)];
}

/**
 * Reconstruye el orden de dibujo CONSERVANDO el previo.
 *
 * Necesario cada vez que un camino recompone el documento a partir de una
 * colección de entidades: esa colección puede estar ordenada por id para
 * canonicalización, y derivar `entityIds` de ella **alfabetiza el z-order**.
 * Ése era el defecto que sobrevivía en `replaceEditorProjection` y en la
 * migración de MLEADER heredados: editar una propiedad convertía
 * `zeta, alfa` en `alfa, zeta`.
 *
 * Contrato: las entidades que ya tenían posición la conservan, en su orden
 * relativo; las nuevas se añaden AL FRENTE (final de la lista), en el orden en
 * que llegan; las desaparecidas se quitan.
 */
export function preserveDrawOrder(
  previousIds: readonly string[],
  presentIds: readonly string[],
): string[] {
  const present = new Set(presentIds);
  const kept = previousIds.filter((id) => present.has(id));
  const seen = new Set(kept);
  const appended = presentIds.filter((id) => !seen.has(id));
  return [...kept, ...appended];
}
