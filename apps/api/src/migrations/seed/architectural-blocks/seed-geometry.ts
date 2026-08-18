/**
 * Vocabulario geométrico del sembrado de bloques arquitectónicos.
 *
 * ## Por qué existe un tipo propio y no se importa el del editor
 *
 * El editor vive en `apps/web` y la API no puede depender de él. Copiar aquí
 * la unión completa de `CadEntity` tampoco serviría: un sembrado necesita
 * cuatro primitivas —recta, arco, círculo y polilínea— y declarar treinta
 * tipos que nadie usa sólo garantiza que el día que el esquema cambie haya que
 * tocar una migración YA APLICADA. Lo que se declara aquí es el subconjunto que
 * el sembrado escribe, con la misma FORMA que el documento canónico, de modo
 * que lo que sale de aquí entra en `sf_cad_blocks.definition` sin adaptador.
 *
 * ## Por qué la geometría no lleva id ni capa
 *
 * Las escribe el constructor. Un id de entidad tiene que ser único dentro del
 * documento que acabe conteniendo el bloque, así que se deriva del id del
 * bloque (`valle:arq:<slug>:e<n>`) y no del capricho de quien dibuja; y la capa
 * es una propiedad del bloque entero, no de cada línea. Dejarlas a mano en cada
 * primitiva era la vía rápida a dos entidades con el mismo id y a una puerta
 * con la mitad de sus líneas en la capa de equipos.
 *
 * ## Unidades: milímetros, siempre
 *
 * El documento canónico declara `unit: "mm"` y el editor mide en milímetros.
 * Una puerta de noventa centímetros son 900 aquí, no 90 ni 0,9. La spec de
 * PostgreSQL comprueba la caja envolvente de cada bloque contra la medida
 * declarada justamente porque un error de unidad no se ve en el código: se ve
 * cuando el arquitecto coloca una puerta del tamaño de un tornillo.
 */

import { SYSTEM_CAD_BLOCK_PREFIX } from '../../../modules/cad-documents/system-cad-blocks';

export interface SeedPoint {
  x: number;
  y: number;
  z: number;
}

/** Primitiva de dibujo SIN identidad ni capa: se las pone el constructor. */
export type SeedShape =
  | { type: 'line'; start: SeedPoint; end: SeedPoint }
  | {
      type: 'arc';
      center: SeedPoint;
      radius: number;
      startAngle: number;
      endAngle: number;
    }
  | { type: 'circle'; center: SeedPoint; radius: number }
  | { type: 'polyline'; vertices: SeedPoint[]; closed: boolean };

/**
 * Capa del bloque.
 *
 * Son las capas que el editor ya trae por defecto (`DEFAULT_CAD_LAYERS`), y
 * eso no es pereza: la validación del documento RECHAZA una entidad que
 * referencia una capa que el documento no declara, así que un bloque sembrado
 * en una capa inventada convertiría cada plano que lo usara en un plano que no
 * se puede guardar. Construcción —puertas, ventanas, escaleras, cocheras— va a
 * `architecture`; muebles y muebles de baño y cocina van a `equipment`, que es
 * exactamente donde los pone hoy `defaultCadLayerForAssetKind` para los
 * símbolos equivalentes. Una capa de mobiliario propia es deseable y está
 * anotada como trabajo pendiente: exige tocar las capas por defecto del editor.
 */
export type SeedLayer = 'architecture' | 'equipment';

export interface SeedAttribute {
  defaultValue: string;
  prompt: string;
}

export interface SeedBlock {
  /** Clave estable del sembrado; forma el id y la llave de idempotencia. */
  slug: string;
  name: string;
  description: string;
  keywords: string[];
  layer: SeedLayer;
  /**
   * Punto de inserción EN COORDENADAS DEL BLOQUE.
   *
   * No es el centro de la caja envolvente salvo que la pieza se coloque por su
   * centro. Una puerta se inserta en su quicial, un WC contra el muro y una
   * cama por el centro de su cabecera: insertar por el centro geométrico
   * obliga a mover la pieza a ojo después de cada colocación, que es la
   * definición de un bloque inservible.
   */
  basePoint: SeedPoint;
  /** Caja envolvente ESPERADA en mm; la spec la comprueba contra el dibujo. */
  extent: { width: number; depth: number };
  /** Claro libre en mm de puertas y ventanas; ausente en el resto. */
  opening?: number;
  attributes: Record<string, SeedAttribute>;
  shapes: SeedShape[];
}

/**
 * El id del bloque sembrado ES su llave en el carril de sistema. Se toma de
 * `system-cad-blocks.ts` en vez de repetir el literal: si el servicio y el
 * sembrado no coincidieran en el prefijo, los bloques quedarían en la base sin
 * que nadie los publicara ni los protegiera de un borrado.
 */
export const SEED_BLOCK_ID_PREFIX = SYSTEM_CAD_BLOCK_PREFIX;

export const point = (x: number, y: number): SeedPoint => ({ x, y, z: 0 });

export const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): SeedShape => ({ type: 'line', start: point(x1, y1), end: point(x2, y2) });

/** Ángulos en GRADOS y sentido antihorario, como el arco del documento. */
export const arc = (
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): SeedShape => ({
  type: 'arc',
  center: point(cx, cy),
  radius,
  startAngle,
  endAngle,
});

export const circle = (cx: number, cy: number, radius: number): SeedShape => ({
  type: 'circle',
  center: point(cx, cy),
  radius,
});

export const polyline = (
  points: ReadonlyArray<readonly [number, number]>,
  closed = true,
): SeedShape => ({
  type: 'polyline',
  vertices: points.map(([x, y]) => point(x, y)),
  closed,
});

/** Rectángulo por esquina inferior-izquierda + tamaño. */
export const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
): SeedShape =>
  polyline([
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ]);

export interface SeedBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Caja envolvente REAL del dibujo de un bloque.
 *
 * El arco se trata como arco y no como cuerda: sus extremos no son sus
 * máximos cuando el barrido cruza un eje. El arco de barrido de una puerta va
 * de 0° a 90° y ahí da igual, pero el de una ventana abatible va de 270° a
 * 360° y una envolvente calculada con los extremos daría un tamaño menor del
 * real. Una envolvente que miente convierte la comprobación de escala de la
 * spec en un sello de goma.
 */
export function seedBlockBounds(shapes: readonly SeedShape[]): SeedBounds {
  const xs: number[] = [];
  const ys: number[] = [];
  const push = (x: number, y: number) => {
    xs.push(x);
    ys.push(y);
  };
  for (const shape of shapes) {
    if (shape.type === 'line') {
      push(shape.start.x, shape.start.y);
      push(shape.end.x, shape.end.y);
      continue;
    }
    if (shape.type === 'circle') {
      push(shape.center.x - shape.radius, shape.center.y - shape.radius);
      push(shape.center.x + shape.radius, shape.center.y + shape.radius);
      continue;
    }
    if (shape.type === 'polyline') {
      for (const vertex of shape.vertices) push(vertex.x, vertex.y);
      continue;
    }
    const { center, radius, startAngle, endAngle } = shape;
    const sweepEnd = endAngle >= startAngle ? endAngle : endAngle + 360;
    const at = (degrees: number) =>
      push(
        center.x + radius * Math.cos((degrees * Math.PI) / 180),
        center.y + radius * Math.sin((degrees * Math.PI) / 180),
      );
    at(startAngle);
    at(sweepEnd);
    for (
      let axis = Math.ceil(startAngle / 90) * 90;
      axis <= sweepEnd;
      axis += 90
    )
      at(axis);
  }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Definición canónica lista para `sf_cad_blocks.definition`. */
export interface SeedBlockDefinition {
  id: string;
  name: string;
  basePoint: SeedPoint;
  entities: Array<SeedShape & { id: string; layer: SeedLayer }>;
  attributes: Record<string, SeedAttribute>;
  description: string;
  keywords: string[];
  version: number;
}

export const seedBlockId = (slug: string): string =>
  `${SEED_BLOCK_ID_PREFIX}${slug}`;

export function seedBlockDefinition(block: SeedBlock): SeedBlockDefinition {
  const id = seedBlockId(block.slug);
  return {
    id,
    name: block.name,
    basePoint: { ...block.basePoint },
    entities: block.shapes.map((shape, index) => ({
      ...shape,
      id: `${id}:e${index}`,
      layer: block.layer,
    })),
    attributes: { ...block.attributes },
    description: block.description,
    keywords: [...block.keywords],
    version: 1,
  };
}
