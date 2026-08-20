/**
 * Herencia RESUELTA: qué tipo de línea y qué grosor le tocan de verdad a una
 * entidad, después de aplicar BYLAYER, BYBLOCK y DEFAULT.
 *
 * ## Por qué esto no puede estar en el lector ni en el visor
 *
 * Un DXF no dice cómo se dibuja una entidad: dice de quién lo hereda. El código
 * 6 puede traer un nombre, `BYLAYER` o `BYBLOCK`; el 370 puede traer un número
 * o −1, −2 o −3. Resolver esa cadena es una regla del FORMATO, y hay tres
 * consumidores que tienen que aplicar la misma: el visor cuando dibuja, el
 * trazador cuando imprime y el escritor cuando devuelve el fichero. Con la
 * regla escrita tres veces, el plano se ve de una manera, se imprime de otra y
 * se devuelve de una tercera, y ninguna de las tres está mal por su cuenta.
 *
 * ## Las dos unidades, dichas donde duele
 *
 * El grosor viaja en CENTÉSIMAS de milímetro en el fichero, en la presentación
 * de la entidad y en todo lo que sale de aquí — es la unidad del formato y la
 * que ya documentaba el estilo de trazo. `CadLayerDef.lineweight`, en cambio,
 * está en MILÍMETROS desde que existe la paleta de capas, con −1 como «por
 * defecto». La conversión ocurre en un único sitio, `layerLineweight`, y esa es
 * toda la razón de que exista esa función: dos unidades en un documento son un
 * error esperando su turno, y lo único que lo evita es que haya un solo cruce.
 *
 * ## Fallo cerrado
 *
 * Cuando no hay de dónde heredar —una entidad BYBLOCK que no está dentro de
 * ningún bloque, una capa que no existe— el resultado es el valor por defecto
 * DECLARADO del formato (continua, DEFAULT), no un número inventado que parezca
 * razonable.
 *
 * Módulo puro: sin THREE, sin DOM, sin estado.
 */
import type {
  CadDocument,
  CadEntity,
  CadEntityPresentation,
  CadLayerDef,
} from "./cad-document";

/** El tipo de línea sin patrón. En DXF se llama así y no se traduce. */
export const CAD_CONTINUOUS = "CONTINUOUS";

/** Grosor «lo que diga el trazador». Es −3 en el fichero y aquí también. */
export const CAD_LINEWEIGHT_DEFAULT = -3;

export interface CadResolvedStyle {
  /** Nombre del tipo de línea ya resuelto. Nunca `BYLAYER` ni `BYBLOCK`. */
  linetype: string;
  /** Escala del guion: la global del dibujo por la propia de la entidad. */
  linetypeScale: number;
  /** Grosor en centésimas de milímetro. −3 significa DEFAULT, no cero. */
  lineweight: number;
}

/** Lo mínimo que hace falta leer para resolver. Un `CadDocument` lo satisface. */
export type CadStyleSource = Pick<CadDocument, "layers" | "blocks" | "entities" | "meta">;

/**
 * Catálogo de tipos de línea del documento: nombre → patrón .lin.
 *
 * Vive en `styles.linetype` y es OPCIONAL, porque un documento que nunca abrió
 * un DXF con tabla LTYPE no tiene por qué llevarlo. Se lee por nombre para no
 * obligar a todo el que resuelve un estilo a conocer la forma de `CadStyleTable`.
 */
export interface CadLinetypeCatalogEntry {
  pattern: number[];
  description?: string;
}

export function cadLinetypeCatalog(
  document: Pick<CadDocument, "styles">,
): Record<string, CadLinetypeCatalogEntry> {
  const catalog = (document.styles as { linetype?: Record<string, CadLinetypeCatalogEntry> }).linetype;
  return catalog ?? {};
}

/**
 * El grosor de una capa, traducido a centésimas de milímetro.
 *
 * ÚNICO cruce entre las dos unidades del documento. La paleta de capas guarda
 * milímetros y usa −1 para «por defecto»; el formato usa centésimas y −3. Que
 * la traducción esté aquí y sólo aquí es lo que impide que el visor y el
 * escritor discrepen en un factor de cien sin que nada falle.
 */
export function layerLineweight(layer: CadLayerDef | undefined): number {
  const millimetres = layer?.lineweight;
  if (typeof millimetres !== "number" || millimetres < 0) return CAD_LINEWEIGHT_DEFAULT;
  return Math.round(millimetres * 100);
}

function presentationOf(entity: CadEntity | undefined): CadEntityPresentation | undefined {
  return (entity as { context?: { presentation?: CadEntityPresentation } } | undefined)?.context
    ?.presentation;
}

/** El INSERT vivo que instancia el bloque donde vive `entity`, si lo hay. */
function owningInsert(
  document: CadStyleSource,
  entity: CadEntity,
): CadEntity | undefined {
  const holder = document.blocks.find((block) =>
    block.entities.some((candidate) => candidate.id === entity.id),
  );
  if (!holder) return undefined;
  return document.entities.find(
    (candidate) => candidate.type === "insert" && candidate.block === holder.id,
  );
}

/**
 * Resuelve el estilo de trazo de una entidad.
 *
 * `BYBLOCK` mira a la INSERCIÓN, no a la capa de la geometría: es lo que hace
 * que un símbolo de biblioteca se dibuje distinto en cada plano sin duplicar el
 * bloque. Resolverlo contra la capa no falla — dibuja mal, que es peor.
 */
export function resolveCadEntityStyle(
  entity: CadEntity,
  document: CadStyleSource,
): CadResolvedStyle {
  const own = presentationOf(entity);
  const layer = document.layers.find((candidate) => candidate.name === entity.layer);
  const globalScale = (document.meta as { linetypeScale?: number }).linetypeScale ?? 1;

  const linetypeSource = own?.linetype?.source;
  const inherited = linetypeSource === "byBlock" || own?.lineweight?.source === "byBlock"
    ? presentationOf(owningInsert(document, entity))
    : undefined;

  const linetype =
    linetypeSource === "explicit"
      ? (own?.linetype?.value ?? CAD_CONTINUOUS)
      : linetypeSource === "byBlock"
        ? (inherited?.linetype?.value ?? CAD_CONTINUOUS)
        : (layer?.linetype ?? CAD_CONTINUOUS);

  const lineweightSource = own?.lineweight?.source;
  const lineweight =
    lineweightSource === "explicit"
      ? (own?.lineweight?.value ?? CAD_LINEWEIGHT_DEFAULT)
      : lineweightSource === "byBlock"
        ? (inherited?.lineweight?.value ?? CAD_LINEWEIGHT_DEFAULT)
        : layerLineweight(layer);

  return {
    linetype: linetype.toUpperCase() === CAD_CONTINUOUS ? CAD_CONTINUOUS : linetype,
    // La escala propia MULTIPLICA a la global: son dos factores, no dos
    // candidatos. Quedarse con uno da un guion del tamaño equivocado, que es
    // indistinguible de un patrón mal leído y se diagnostica fatal.
    linetypeScale: globalScale * (own?.linetype?.scale ?? 1),
    lineweight,
  };
}

/** Máximo de patrones que el shader del lote instanciado sabe descodificar. */
export const CAD_LINETYPE_SLOT_LIMIT = 8;

export interface CadLinetypeSlots {
  /** Nombre en mayúsculas → ranura. La continua no está: es la ranura 0. */
  slots: ReadonlyMap<string, number>;
  /** Patrón (trazo, hueco) por ranura, en unidades de dibujo. */
  patterns: ReadonlyArray<readonly [number, number]>;
  /**
   * Tipos que no cupieron. Se dibujan continuos, y quien construya la tabla
   * tiene la lista para decirlo: siete patrones a la vez es un límite del
   * shader, no una propiedad del dibujo, y callarlo lo haría parecer lo segundo.
   */
  overflow: readonly string[];
  /**
   * Tipos cuyo patrón se SIMPLIFICÓ a un par (trazo, hueco). CENTER lleva
   * cuatro longitudes y el shader admite dos: se conserva el primer trazo y el
   * primer hueco, que es lo que hace que se lea como eje, y se declara.
   */
  simplified: readonly string[];
}

/**
 * Tabla de ranuras del visor a partir del catálogo del documento.
 *
 * Determinista y ordenada por nombre: la misma escena tiene que producir las
 * mismas ranuras entre cuadros, o el lote instanciado se invalida entero cada
 * vez que alguien añade una entidad.
 */
/**
 * Caché por tabla de estilos.
 *
 * El visor pide la ranura UNA VEZ POR ENTIDAD y por cuadro. Recorrer y ordenar
 * el catálogo cada vez convierte una tabla de ocho patrones en trabajo
 * cuadrático sobre un dibujo de cien mil entidades, que es justo el tamaño en
 * el que este producto se juega el rendimiento. La clave es el objeto `styles`:
 * el documento es inmutable por cambio, así que una tabla nueva es un
 * documento nuevo y la caché no puede quedarse rancia.
 */
const SLOT_CACHE = new WeakMap<object, CadLinetypeSlots>();

export function buildCadLinetypeSlots(
  document: Pick<CadDocument, "styles">,
): CadLinetypeSlots {
  const cached = document.styles ? SLOT_CACHE.get(document.styles) : undefined;
  if (cached) return cached;
  const built = computeCadLinetypeSlots(document);
  if (document.styles) SLOT_CACHE.set(document.styles, built);
  return built;
}

function computeCadLinetypeSlots(
  document: Pick<CadDocument, "styles">,
): CadLinetypeSlots {
  const catalog = cadLinetypeCatalog(document);
  const slots = new Map<string, number>();
  const patterns: Array<readonly [number, number]> = [[0, 0]];
  const overflow: string[] = [];
  const simplified: string[] = [];
  for (const name of Object.keys(catalog).sort()) {
    const upper = name.toUpperCase();
    if (upper === CAD_CONTINUOUS) continue;
    const pattern = catalog[name]?.pattern ?? [];
    const dash = pattern.find((value) => value > 0);
    const gap = pattern.find((value) => value < 0);
    if (dash === undefined || gap === undefined) continue;
    if (patterns.length >= CAD_LINETYPE_SLOT_LIMIT) {
      overflow.push(upper);
      continue;
    }
    if (pattern.length > 2) simplified.push(upper);
    slots.set(upper, patterns.length);
    patterns.push([dash, Math.abs(gap)]);
  }
  return { slots, patterns, overflow, simplified };
}

/** Medio grosor en píxeles para el lote instanciado. */
export const CAD_RENDER_DEFAULT_HALF_WIDTH_PX = 0.5;

/**
 * Grosor en centésimas de milímetro → medio grosor en píxeles.
 *
 * La convención —0,25 mm es un trazo de 1 px— viene del estilo de trazo
 * original y se conserva para no cambiar cómo se ve un documento que ya
 * existía. DEFAULT y los valores no positivos caen al trazo fino, que es lo que
 * hace AutoCAD con el grosor por defecto de un trazador sin configurar.
 */
export function cadLineweightHalfWidthPx(lineweight: number): number {
  return lineweight > 0
    ? Math.max(CAD_RENDER_DEFAULT_HALF_WIDTH_PX, lineweight / 50)
    : CAD_RENDER_DEFAULT_HALF_WIDTH_PX;
}
