/**
 * Entidades del esquema 4 del documento canónico.
 *
 * Ocho tipos que un CAD 2D necesita para dejar de ser una demo: POINT, XLINE,
 * RAY, SOLID, WIPEOUT, IMAGE, ATTDEF y TABLE. Se declaran aquí y no en
 * `cad-document.ts` por dos razones, y la segunda es la que importa:
 *
 *  1. `cad-document.ts` está en el trinquete de tamaño.
 *  2. Su único import es `import type`, que se borra al compilar, así que este
 *     módulo es una HOJA del grafo de carga. Puede importarlo cualquiera —
 *     incluido `cad-document.ts`— sin que se cierre un ciclo. Y los ciclos aquí
 *     no son teóricos: `tsc --noEmit` no los ve y el producto revienta al
 *     cargar con «Cannot access X before initialization».
 *
 * ## Aditivo, y qué significa eso exactamente
 *
 * Ningún campo existente cambia de forma ni de significado. Un documento v3
 * cargado con este esquema es byte a byte el mismo documento salvo por
 * `meta.schema`, que pasa de 3 a 4 — la migración vive en
 * `cad-document-migrate.ts` y tiene su propio spec con anclas absolutas.
 *
 * ## Convenios que estos tipos comparten con DXF
 *
 * Se eligen las mismas magnitudes que guarda DXF, no unas propias que luego
 * habría que convertir en cada exportación:
 *
 *  · IMAGE guarda `uVector`/`vVector` —el tamaño de UN píxel en unidades de
 *    dibujo, con la rotación dentro— y el tamaño en píxeles, igual que los
 *    grupos 11/12/13. De ahí sale el rectángulo sin trigonometría extra.
 *  · XLINE y RAY guardan punto base y DIRECCIÓN, igual que los grupos 10/11.
 *  · SOLID guarda sus vértices en orden de CONTORNO, no en el orden 1-2-4-3
 *    en corbatín del DXF. Esa rareza es del formato y le toca resolverla al
 *    exportador, no al modelo: un polígono cuyo array no es un polígono es una
 *    trampa permanente para todo el que lo lea.
 */
import type { CadEntityContext, CadPoint3 } from "./cad-document";

/**
 * Alineación de un contenido de texto respecto de su punto de inserción. Es el
 * mismo vocabulario que usa MTEXT; se nombra aquí para que ATTDEF y TABLE no
 * lo repitan literal.
 */
export type CadTextAnchor =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "middle-center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

/**
 * Definición de imagen referenciada. Vive en `document.imageDefinitions` y no
 * dentro de la entidad porque N inserciones comparten un mismo archivo, igual
 * que N INSERT comparten un bloque.
 *
 * `uri` es SIEMPRE un URI de asset del tenant. Una ruta local del navegador no
 * se persiste jamás: el documento viaja al servidor y a otros usuarios, y una
 * ruta `C:\...` es a la vez una filtración y una referencia rota.
 */
export interface CadImageDefinition {
  id: string;
  name: string;
  uri: string;
  /** Tamaño real del archivo, en píxeles. */
  pixelWidth: number;
  pixelHeight: number;
  loaded?: boolean;
  contentHash?: string;
  tenantId?: string;
  assetId?: string;
}

/** POINT — el nodo del dibujo: referencia, marca de DIVIDE/MEASURE, cota base. */
export interface CadPointEntity {
  id: string;
  type: "point";
  position: CadPoint3;
  /**
   * Estilo de marca, con los MISMOS códigos que `PDMODE` de DXF (0 punto,
   * 1 nada, 2 cruz, 3 aspa, 4 tick, +32 círculo, +64 cuadrado).
   *
   * En AutoCAD `PDMODE` es una variable de dibujo y DDPTYPE la cambia para
   * TODO el documento, incluido lo ya dibujado. Aquí es por entidad, que es
   * estrictamente más expresivo y no pierde nada: un documento donde todos los
   * puntos comparten estilo se comporta igual. La diferencia sale a la luz al
   * exportar a DXF, y ahí es el exportador quien decide.
   */
  style?: number;
  /** Tamaño de la marca. Negativo = porcentaje del viewport, como `PDSIZE`. */
  size?: number;
  layer: string;
  context?: CadEntityContext;
}

/**
 * XLINE — recta de construcción INFINITA en ambos sentidos.
 *
 * `direction` no hace falta normalizarla; los adaptadores lo hacen. Una
 * dirección nula no define recta alguna y se trata como degenerada en vez de
 * propagar `NaN`.
 */
export interface CadXLineEntity {
  id: string;
  type: "xline";
  basePoint: CadPoint3;
  direction: CadPoint3;
  layer: string;
  context?: CadEntityContext;
}

/** RAY — semirrecta: nace en `basePoint` y es infinita en UN sentido. */
export interface CadRayEntity {
  id: string;
  type: "ray";
  basePoint: CadPoint3;
  direction: CadPoint3;
  layer: string;
  context?: CadEntityContext;
}

/**
 * SOLID — triángulo o cuadrilátero RELLENO.
 *
 * `points` va en orden de contorno y tiene 3 o 4 elementos. La validación del
 * servidor lo exige; el adaptador tolera lo que llegue sin reventar.
 */
export interface CadSolidEntity {
  id: string;
  type: "solid";
  points: CadPoint3[];
  layer: string;
  context?: CadEntityContext;
}

/**
 * WIPEOUT — polígono que TAPA lo que hay debajo.
 *
 * No es un sombreado blanco: su sitio en `modelSpace.entityIds` es lo que
 * decide qué oculta, así que un WIPEOUT nace normalmente con
 * `drawOrder: "front"`. `frame` dice si se dibuja su borde (`WIPEOUTFRAME`).
 */
export interface CadWipeoutEntity {
  id: string;
  type: "wipeout";
  boundary: CadPoint3[];
  frame?: boolean;
  layer: string;
  context?: CadEntityContext;
}

/**
 * IMAGE — inserción de una imagen ráster definida en `imageDefinitions`.
 *
 * `insertion` es la esquina INFERIOR IZQUIERDA. `uVector` y `vVector` miden UN
 * píxel en unidades de dibujo y llevan dentro la rotación y la escala, así que
 * la esquina opuesta es `insertion + u·size.width + v·size.height` sin más
 * trigonometría. Son VECTORES: bajo una transformada van por la parte LINEAL,
 * y por eso reflejar una imagen la deja realmente espejada.
 */
export interface CadImageEntity {
  id: string;
  type: "image";
  /** `id` de la entrada de `document.imageDefinitions`. */
  definition: string;
  insertion: CadPoint3;
  uVector: CadPoint3;
  vVector: CadPoint3;
  /** Tamaño en PÍXELES de la porción mostrada. */
  size: { width: number; height: number };
  brightness?: number;
  contrast?: number;
  fade?: number;
  showImage?: boolean;
  /** Recorte en coordenadas de píxel de la definición. */
  clipBoundary?: CadPoint3[];
  layer: string;
  context?: CadEntityContext;
}

/**
 * ATTDEF — definición de atributo.
 *
 * Vive dentro de la definición de un bloque (o suelta, hasta que BLOCK la
 * recoge). `tag` es el nombre invariante; `defaultValue` el texto propuesto al
 * insertar. Se comporta como un MTEXT a efectos de transformada: tiene
 * rotación de texto y bajo reflexión se RE-ORIENTA restando, no sumando.
 */
export interface CadAttdefEntity {
  id: string;
  type: "attdef";
  tag: string;
  prompt?: string;
  defaultValue?: string;
  insertion: CadPoint3;
  height?: number;
  rotation?: number;
  style?: string;
  alignment?: CadTextAnchor;
  invisible?: boolean;
  constant?: boolean;
  verify?: boolean;
  preset?: boolean;
  lockPosition?: boolean;
  layer: string;
  context?: CadEntityContext;
}

/** Una celda de TABLE. `row`/`column` son índices base 0. */
export interface CadTableCell {
  row: number;
  column: number;
  text: string;
  /** Celdas fusionadas. Ausente = 1. */
  rowSpan?: number;
  columnSpan?: number;
  alignment?: CadTextAnchor;
  textHeight?: number;
  textStyle?: string;
}

/**
 * TABLE — rejilla de celdas con texto.
 *
 * `insertion` es la esquina SUPERIOR IZQUIERDA y las filas crecen hacia abajo,
 * que es la convención de AutoCAD y la que hace que una tabla añadida a un
 * cajetín no se salga por arriba.
 */
export interface CadTableEntity {
  id: string;
  type: "table";
  insertion: CadPoint3;
  rows: number;
  columns: number;
  /** Alto de cada fila y ancho de cada columna, en unidades de dibujo. */
  rowHeights: number[];
  columnWidths: number[];
  cells: CadTableCell[];
  rotation?: number;
  style?: string;
  layer: string;
  context?: CadEntityContext;
}

/**
 * Atributo POSICIONADO de un INSERT.
 *
 * Hasta el esquema 3 los atributos de un INSERT eran un `Record<string,string>`
 * sin geometría: se sabía QUÉ decía cada uno y no DÓNDE. Eso convierte un
 * cajetín en una lista de pares clave/valor invisible — no se puede dibujar el
 * texto, ni seleccionarlo, ni acotarlo, ni exportarlo como ATTRIB.
 *
 * `insertion` va en coordenadas del MUNDO, ya resuelta la transformada del
 * INSERT, para que dibujarla no exija recomponer la matriz del bloque.
 * `attributes` sigue existiendo y no cambia: los dos conviven, y el mapa plano
 * se mantiene como la vía de consulta por etiqueta.
 */
export interface CadPositionedAttribute {
  tag: string;
  value: string;
  insertion: CadPoint3;
  height?: number;
  rotation?: number;
  alignment?: CadTextAnchor;
  style?: string;
  invisible?: boolean;
}

/** Unión de los tipos que estrena el esquema 4. */
export type CadSchema4Entity =
  | CadPointEntity
  | CadXLineEntity
  | CadRayEntity
  | CadSolidEntity
  | CadWipeoutEntity
  | CadImageEntity
  | CadAttdefEntity
  | CadTableEntity;

/** Nombres de los tipos nuevos, para inventarios y validación. */
export const CAD_SCHEMA_4_ENTITY_TYPES = [
  "point",
  "xline",
  "ray",
  "solid",
  "wipeout",
  "image",
  "attdef",
  "table",
] as const satisfies readonly CadSchema4Entity["type"][];
