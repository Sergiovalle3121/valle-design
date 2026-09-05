/**
 * Las NUBES DE REVISIÓN del diff: dónde estuvo cada diferencia, dibujado.
 *
 * ## Por qué una lista de diferencias no basta
 *
 * `compare-documents.ts` contesta qué cambió y devuelve una lista. Un dibujante
 * que recibe «wall m1: geometría» no sabe dónde mirar en una planta de 40 m, y
 * la lista tampoco sobrevive a la impresión: lo que se manda a obra es el plano,
 * y el plano tiene que llevar la marca encima. Por eso AutoCAD dibuja las
 * diferencias en vez de listarlas, y por eso esto existe.
 *
 * ## Se AGRUPAN por vecindad, y ese es el trabajo de verdad
 *
 * Una nube por diferencia sería inútil dos veces: un muro que se movió produce
 * un rectángulo casi encima de otro, y una ventana reubicada produce cinco
 * nubes solapadas —jamba, jamba, dintel, alféizar, hoja— donde el ojo espera
 * una. Aquí las diferencias cuya envolvente separada por menos de `gap` se toca
 * caen en el MISMO grupo, transitivamente, y el grupo emite una sola nube sobre
 * la envolvente de todas. Es lo que hace que «la ventana se movió» se lea como
 * una revisión y no como cinco.
 *
 * Las clases no se mezclan: lo añadido no se agrupa con lo borrado aunque esté
 * encima. Son dos noticias distintas, van a capas distintas y con colores
 * distintos, y una nube que las juntara no podría tener las dos.
 *
 * ## El festón es el de REVCLOUD, no uno parecido
 *
 * El contorno sale de `revcloudVertices` de `engine/commands/draw-rings.ts`, la
 * misma función que dibuja la orden REVCLOUD, con la misma `REVCLOUD_BULGE`.
 * Reimplementarlo aquí habría dado dos nubes distintas en el mismo dibujo —la
 * que traza el usuario y la que traza COMPARE— y nadie lo habría notado hasta
 * verlas juntas en un plano impreso.
 *
 * El signo del bulge se niega porque el rectángulo se recorre en sentido
 * ANTIHORARIO, y en ese sentido un bulge positivo comba hacia DENTRO. Es la
 * única línea que separa una nube de revisión de una cadena de mordiscos, y las
 * dos se dibujan igual de bien.
 *
 * ## Los colores son el calco de AutoCAD, y la tercera capa es nuestra
 *
 * DWG Compare de AutoCAD tiene tres muestras: **verde** para lo que sólo está
 * en el dibujo actual, **rojo** para lo que sólo está en el comparado y gris
 * para lo que está en los dos. Las dos primeras se calcan exactamente —de ahí
 * que la orden pase el dibujo ajeno como base, para que «verde» siga
 * significando «esto lo tiene el dibujo abierto y el otro no»—. La tercera NO
 * es gris: el gris de AutoCAD marca lo idéntico, y lo idéntico no lleva nube.
 * La tercera clase de este diff —la entidad que existe en los dos lados y
 * cambió— no tiene equivalente allí, porque AutoCAD la parte en una verde y una
 * roja; aquí se empareja y se marca en **amarillo**, que es el tercer color de
 * la ACI y el que un plano de revisión usa para «esto no es nuevo ni se fue,
 * pero míralo».
 *
 * Los tres colores viven en la CAPA, no en la entidad: así el dibujante apaga
 * una clase entera desde el gestor de capas, que es exactamente lo que hacen
 * las tres casillas de la paleta de AutoCAD.
 */
import type { CadDocument, CadEntity, CadLayerDef, CadPoint2 } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";
import {
  CAD_ENTITY_REGISTRY,
  type CadBounds,
  type CadEntityRegistry,
  type CadNativeEntity,
} from "./entity-runtime";
import { REVCLOUD_BULGE, revcloudVertices } from "./engine/commands/draw-rings";
import type { CadCompareEntry, CadCompareResult } from "./compare-documents";

export type CadCompareCloudClass = "nuevo" | "borrado" | "cambiado";

/**
 * Las tres capas dedicadas. El nombre es la identidad de una capa (como en
 * DXF), así que `id` y `name` coinciden a propósito.
 *
 * Los colores son ACI puro —verde 3, rojo 1, amarillo 2—: son datos de plano,
 * no marca, y por eso van en hexadecimal literal (AGENTS.md, «ACI drawing
 * colours … are plan data, not brand»).
 */
export const CAD_COMPARE_CLOUD_LAYERS: Record<CadCompareCloudClass, CadLayerDef> = {
  nuevo: { id: "VD-COMPARE-NUEVO", name: "VD-COMPARE-NUEVO", color: "#00ff00", visible: true, locked: false },
  borrado: { id: "VD-COMPARE-BORRADO", name: "VD-COMPARE-BORRADO", color: "#ff0000", visible: true, locked: false },
  cambiado: { id: "VD-COMPARE-CAMBIADO", name: "VD-COMPARE-CAMBIADO", color: "#ffff00", visible: true, locked: false },
};

/** El orden en que se emiten: como se leen, de lo nuevo a lo retocado. */
export const CAD_COMPARE_CLOUD_CLASSES: readonly CadCompareCloudClass[] = ["nuevo", "borrado", "cambiado"];

/** Cuerda de cada festón. La misma que estrena REVCLOUD por defecto. */
export const CAD_COMPARE_CLOUD_ARC = 500;
/** Holgura de la nube alrededor de lo que marca, en unidades de dibujo. */
export const CAD_COMPARE_CLOUD_MARGIN = 250;
/**
 * Distancia por debajo de la cual dos diferencias son la MISMA revisión.
 *
 * Mil unidades es un metro en un dibujo en milímetros: la escala a la que un
 * dibujante dice «esta zona». Más pequeño devuelve la nube por objeto que este
 * módulo existe para evitar; mucho más grande funde el plano entero en una.
 */
export const CAD_COMPARE_CLOUD_GAP = 1000;

export interface CadCompareCloudOptions {
  /** El documento base, si se tiene: INSERT resuelve su bloque contra él. */
  before?: CadDocument;
  /** El documento abierto, por lo mismo. */
  after?: CadDocument;
  gap?: number;
  margin?: number;
  arcLength?: number;
  registry?: CadEntityRegistry;
  /** Fábrica de ids. Por defecto, deterministas y legibles. */
  newEntityId?: () => string;
  /** Capas que el documento ya tiene: no se vuelven a dar de alta. */
  existingLayers?: readonly string[];
}

export interface CadCompareCloud {
  cloudClass: CadCompareCloudClass;
  layer: string;
  /** La envolvente de la nube, ya con su holgura. */
  bounds: CadBounds;
  /** La envolvente ceñida de las diferencias que agrupa, sin holgura. */
  tightBounds: CadBounds;
  entityIds: readonly string[];
  cloudId: string;
}

export interface CadCompareCloudPlan {
  /** El LOTE. Un solo deshacer devuelve el dibujo sin nubes y sin capas. */
  commands: readonly CadEntityCommand[];
  clouds: readonly CadCompareCloud[];
  /** Capas dadas de alta por este plan. */
  layers: readonly CadLayerDef[];
  /**
   * Diferencias que no llevan nube porque nadie sabe su envolvente: una entidad
   * opaca importada, un tipo que el registro no reclama. Se CUENTAN en vez de
   * desaparecer — una diferencia sin marca que tampoco se declara es la forma
   * más cara de mentir en un plano de revisión.
   */
  withoutBounds: number;
}

const CLASS_OF: Partial<Record<CadCompareEntry["kind"], CadCompareCloudClass>> = {
  added: "nuevo",
  deleted: "borrado",
  modified: "cambiado",
};

function usable(bounds: CadBounds | null | undefined): bounds is CadBounds {
  return (
    !!bounds &&
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY)
  );
}

function union(a: CadBounds, b: CadBounds): CadBounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function inflate(bounds: CadBounds, by: number): CadBounds {
  return {
    minX: bounds.minX - by,
    minY: bounds.minY - by,
    maxX: bounds.maxX + by,
    maxY: bounds.maxY + by,
  };
}

function overlaps(a: CadBounds, b: CadBounds): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

function entityBounds(
  entity: CadEntity | undefined,
  document: CadDocument | undefined,
  registry: CadEntityRegistry,
): CadBounds | null {
  if (!entity || !registry.supports(entity)) return null;
  const bounds = registry.adapter(entity).bounds.bounds(entity, document);
  return usable(bounds) ? bounds : null;
}

/**
 * La envolvente que marca una diferencia.
 *
 * Un modificado ocupa la UNIÓN de sus dos lados, no sólo el nuevo: un muro que
 * se movió 250 mm dejó un hueco donde estaba, y una nube que sólo rodeara su
 * sitio actual mandaría a obra a mirar la mitad del cambio.
 */
export function cadCompareEntryBounds(
  entry: CadCompareEntry,
  options: CadCompareCloudOptions = {},
): CadBounds | null {
  const registry = options.registry ?? CAD_ENTITY_REGISTRY;
  const before = entityBounds(entry.before, options.before, registry);
  const after = entityBounds(entry.after, options.after, registry);
  if (before && after) return union(before, after);
  return before ?? after;
}

/** Une los índices que se tocan: agrupación transitiva, sin orden privilegiado. */
class Vecindad {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    let root = index;
    while (this.parent[root] !== root) root = this.parent[root];
    let walk = index;
    while (this.parent[walk] !== walk) {
      const next = this.parent[walk];
      this.parent[walk] = root;
      walk = next;
    }
    return root;
  }

  join(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  }
}

interface Difference {
  entry: CadCompareEntry;
  bounds: CadBounds;
}

function groupByNeighborhood(items: readonly Difference[], gap: number): Difference[][] {
  const vecindad = new Vecindad(items.length);
  // La holgura se reparte a medias entre los dos vecinos: así «se agrupan si
  // distan menos de `gap`» significa literalmente eso, y no el doble.
  const halo = items.map((item) => inflate(item.bounds, gap / 2));
  for (let i = 0; i < items.length; i += 1)
    for (let j = i + 1; j < items.length; j += 1)
      if (overlaps(halo[i], halo[j])) vecindad.join(i, j);

  const groups = new Map<number, Difference[]>();
  items.forEach((item, index) => {
    const root = vecindad.find(index);
    const group = groups.get(root);
    if (group) group.push(item);
    else groups.set(root, [item]);
  });
  // Por raíz ascendente: la raíz es el índice MENOR del grupo, así que el orden
  // de salida es el de la primera diferencia de cada grupo. Determinista.
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

/**
 * El rectángulo que se va a nublar: la envolvente del grupo con su holgura y
 * con un tamaño mínimo.
 *
 * El mínimo no es cosmético. La envolvente de un POINT o de una línea
 * horizontal es degenerada —alto cero—, y `revcloudVertices` salta los lados de
 * longitud nula: sin este crecimiento la «nube» de un punto saldría con dos
 * vértices, que no es una nube ni es nada.
 */
function cloudRectangle(bounds: CadBounds, margin: number, minSize: number): CadBounds {
  const padded = inflate(bounds, margin);
  const growX = Math.max(0, (minSize - (padded.maxX - padded.minX)) / 2);
  const growY = Math.max(0, (minSize - (padded.maxY - padded.minY)) / 2);
  return {
    minX: padded.minX - growX,
    minY: padded.minY - growY,
    maxX: padded.maxX + growX,
    maxY: padded.maxY + growY,
  };
}

/** El contorno, en sentido ANTIHORARIO. Lo lee `cadCompareCloudEntity`. */
function outlineOf(bounds: CadBounds): CadPoint2[] {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
}

/** La polilínea festoneada de una nube, ya con su capa y su marca. */
export function cadCompareCloudEntity(
  id: string,
  bounds: CadBounds,
  cloudClass: CadCompareCloudClass,
  entityIds: readonly string[],
  arcLength: number = CAD_COMPARE_CLOUD_ARC,
): CadNativeEntity {
  const vertices = revcloudVertices(outlineOf(bounds), arcLength);
  return {
    id,
    type: "polyline",
    vertices: vertices.map((vertex) => ({
      x: vertex.x,
      y: vertex.y,
      z: 0,
      // Antihorario: el bulge positivo comba hacia DENTRO, así que se niega.
      bulge: -vertex.bulge,
    })),
    closed: true,
    layer: CAD_COMPARE_CLOUD_LAYERS[cloudClass].name,
    context: {
      // Deja escrito de qué es cada nube. Sin esto, volver a comparar no podría
      // distinguir sus propias marcas del dibujo, y borrarlas exigiría
      // recordar en qué capa estaban.
      metadata: { "compare:class": cloudClass, "compare:count": entityIds.length },
    },
  };
}

/**
 * El plan de nubes de una comparación. No toca el documento: devuelve el LOTE,
 * y quien llama lo pasa entero por `executeCadEntityCommandBatch`. Un lote por
 * nube dejaría al dibujante deshaciendo cuarenta veces una sola orden.
 */
export function cadCompareRevisionClouds(
  comparison: CadCompareResult,
  options: CadCompareCloudOptions = {},
): CadCompareCloudPlan {
  const gap = options.gap ?? CAD_COMPARE_CLOUD_GAP;
  const margin = options.margin ?? CAD_COMPARE_CLOUD_MARGIN;
  const arcLength = options.arcLength ?? CAD_COMPARE_CLOUD_ARC;
  const known = new Set((options.existingLayers ?? []).map((name) => name.toUpperCase()));

  let serial = 0;
  const newEntityId = options.newEntityId ?? (() => `vd-compare-${(serial += 1)}`);

  const byClass = new Map<CadCompareCloudClass, Difference[]>();
  let withoutBounds = 0;
  for (const entry of comparison.entries) {
    const cloudClass = CLASS_OF[entry.kind];
    if (!cloudClass) continue;
    const bounds = cadCompareEntryBounds(entry, options);
    if (!bounds) {
      withoutBounds += 1;
      continue;
    }
    const bucket = byClass.get(cloudClass);
    if (bucket) bucket.push({ entry, bounds });
    else byClass.set(cloudClass, [{ entry, bounds }]);
  }

  const clouds: CadCompareCloud[] = [];
  const layers: CadLayerDef[] = [];
  const inserts: CadEntityCommand[] = [];

  for (const cloudClass of CAD_COMPARE_CLOUD_CLASSES) {
    const bucket = byClass.get(cloudClass);
    if (!bucket || bucket.length === 0) continue;
    const definition = CAD_COMPARE_CLOUD_LAYERS[cloudClass];
    if (!known.has(definition.name.toUpperCase())) {
      known.add(definition.name.toUpperCase());
      layers.push(definition);
    }
    for (const group of groupByNeighborhood(bucket, gap)) {
      const tightBounds = group.map((item) => item.bounds).reduce(union);
      const bounds = cloudRectangle(tightBounds, margin, arcLength);
      const entityIds = group.map((item) => item.entry.entityId);
      const cloudId = newEntityId();
      clouds.push({ cloudClass, layer: definition.name, bounds, tightBounds, entityIds, cloudId });
      inserts.push({
        type: "insert",
        entity: cadCompareCloudEntity(cloudId, bounds, cloudClass, entityIds, arcLength),
      });
    }
  }

  return {
    // Las capas primero: la nube nace ya en la suya, no en la activa.
    commands: [
      ...layers.map((layer): CadEntityCommand => ({ type: "layer", op: "upsert", layer })),
      ...inserts,
    ],
    clouds,
    layers,
    withoutBounds,
  };
}

/** El festón que emiten estas nubes es el de REVCLOUD, y se reexporta para decirlo. */
export { REVCLOUD_BULGE };
