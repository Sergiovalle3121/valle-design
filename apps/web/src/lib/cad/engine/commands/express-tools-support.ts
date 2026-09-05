/**
 * Lo compartido por las cinco Express Tools puras de esta entrega: BREAKLINE,
 * TCOUNT, TXT2MTXT, FLATTEN y LAYDEL.
 *
 * Son cinco órdenes de dos temas distintos —geometría y documento— y aquí sólo
 * está lo que las cinco usan de verdad: los tres remates de paso que todo el
 * motor repite, el nombre en español de cada tipo de entidad (que es lo que
 * convierte «3 objetos» en «2 líneas y una polilínea») y el APLASTADO, que es
 * una función pura sobre una entidad y no tiene por qué vivir dentro del
 * diálogo de FLATTEN.
 *
 * Se separó del archivo de las órdenes por el trinquete de tamaño
 * (`check:monolith-budget` da 800 líneas a un archivo nuevo) y porque el
 * aplastado se prueba solo: dada una entidad, qué sale y qué se pierde.
 */
import type { CadEntity } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity, CadNativeEntityType } from "../../entity-runtime";
import type { CadCommandStep } from "../command-types";

export const NO_PROMPT = { message: "", options: [] } as const;

/** La orden terminó diciendo algo y sin escribir nada. */
export function say<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "message", text } };
}

/** Esc: ni documento ni mensaje. */
export function nothing<S>(state: S): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "none" } };
}

/**
 * La orden terminó ESCRIBIENDO. `label` es la entrada de deshacer —corta, la
 * lee quien busca a qué volver— y `notice` lo que hay que decir en voz alta,
 * que es donde van las pérdidas declaradas: el anfitrión imprime el aviso
 * DESPUÉS de aplicar el lote, y la etiqueta no se imprime nunca.
 */
export function documentResult<S>(
  state: S,
  commands: readonly CadEntityCommand[],
  label: string,
  notice?: string,
): CadCommandStep<S> {
  return {
    state,
    prompt: NO_PROMPT,
    accepts: 0,
    result: notice ? { kind: "document", commands, label, notice } : { kind: "document", commands, label },
  };
}

/**
 * Número para leer, no para redondear: se conservan hasta cuatro decimales y se
 * quitan los ceros de relleno. `200` se escribe `200`, no `200.0000`, y
 * `0.5` no se convierte en `1`.
 */
export function num(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number(value.toFixed(4)).toString();
}

/** Plural del castellano para los recuentos que estas órdenes imprimen. */
export function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`;
}

// ---------------------------------------------------------------------------
// Nombres en español de los tipos de entidad
// ---------------------------------------------------------------------------

/**
 * Cómo se llama cada tipo cuando hay que NOMBRARLO al usuario.
 *
 * Existe porque una orden que informa «3 objetos aplastados» no informa de
 * nada: quien designó una ventana de captura quiere leer QUÉ tocó. Las dos
 * formas —singular y plural— van juntas porque el castellano no las deriva
 * sumando una ese («directriz» → «directrices»).
 */
const ENTITY_NAMES: Readonly<Record<string, readonly [string, string]>> = {
  line: ["línea", "líneas"],
  polyline: ["polilínea", "polilíneas"],
  circle: ["círculo", "círculos"],
  arc: ["arco", "arcos"],
  ellipse: ["elipse", "elipses"],
  spline: ["spline", "splines"],
  hatch: ["sombreado", "sombreados"],
  text: ["texto", "textos"],
  mtext: ["MTEXT", "MTEXT"],
  dimension: ["cota", "cotas"],
  mleader: ["directriz", "directrices"],
  insert: ["bloque", "bloques"],
  point: ["punto", "puntos"],
  xline: ["recta de construcción", "rectas de construcción"],
  ray: ["semirrecta", "semirrectas"],
  solid: ["sólido 2D", "sólidos 2D"],
  wipeout: ["cubrimiento", "cubrimientos"],
  image: ["imagen", "imágenes"],
  attdef: ["definición de atributo", "definiciones de atributo"],
  table: ["tabla", "tablas"],
  solid3d: ["sólido 3D", "sólidos 3D"],
  region: ["región", "regiones"],
  wall: ["muro", "muros"],
  opening: ["hueco", "huecos"],
  box: ["objeto de planta", "objetos de planta"],
  station: ["objeto heredado", "objetos heredados"],
  connector: ["conector", "conectores"],
};

export function entityName(type: string, count = 1): string {
  const pair = ENTITY_NAMES[type];
  if (!pair) return count === 1 ? type : `${type}s`;
  return count === 1 ? pair[0] : pair[1];
}

/** «2 líneas, 1 polilínea», ordenado por cantidad y luego por nombre. */
export function nameTally(types: readonly string[]): string {
  const tally = new Map<string, number>();
  for (const type of types) tally.set(type, (tally.get(type) ?? 0) + 1);
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, count]) => `${count} ${entityName(type, count)}`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// FLATTEN: el aplastado, como función pura
// ---------------------------------------------------------------------------

type PointLike = { x: number; y: number; z: number };

const isPointLike = (value: unknown): value is PointLike =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { x?: unknown }).x === "number" &&
  typeof (value as { y?: unknown }).y === "number" &&
  typeof (value as { z?: unknown }).z === "number";

/**
 * Baja a `z = 0` todo punto que cuelgue de `value`, contando cuántos bajaron.
 *
 * Devuelve el MISMO objeto cuando nada cambia. No es una micro-optimización:
 * es lo que permite a `flattenCadEntity` distinguir «lo aplasté» de «ya estaba
 * plano» sin comparar documentos, y lo que impide que FLATTEN escriba un lote
 * de cien sustituciones idénticas que ensucian el deshacer sin mover un punto.
 */
function flattenValue(value: unknown, count: { moved: number }): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const flattened = flattenValue(item, count);
      if (flattened !== item) changed = true;
      return flattened;
    });
    return changed ? next : value;
  }
  if (isPointLike(value)) {
    if (value.z === 0) return value;
    count.moved += 1;
    return { ...value, z: 0 };
  }
  if (typeof value === "object" && value !== null) {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      const flattened = flattenValue(inner, count);
      if (flattened !== inner) changed = true;
      next[key] = flattened;
    }
    return changed ? next : value;
  }
  return value;
}

/**
 * Qué campos de cada tipo son POSICIONES.
 *
 * Es una lista explícita y no un recorrido ciego del objeto entero por una
 * razón medible: `insert.scale` es un `{x,y,z}` y no es un punto. Un aplastado
 * genérico le pondría `z: 0` y convertiría un bloque escalado en un bloque
 * de altura nula — un defecto que no se ve en planta y aparece al exportar.
 * Los VECTORES sí entran (`ellipse.majorAxis`, `image.uVector`): aplastar una
 * elipse inclinada es proyectar su eje, que es exactamente lo que se pide.
 *
 * Una lista vacía significa «este tipo ya es plano», que es distinto de «no sé
 * aplastarlo»: un TEXT guarda `x` e `y` sueltas y nunca tuvo cota.
 */
const FLATTEN_FIELDS: Readonly<Partial<Record<CadNativeEntityType, readonly string[]>>> = {
  line: ["start", "end"],
  polyline: ["vertices"],
  circle: ["center"],
  arc: ["center"],
  ellipse: ["center", "majorAxis"],
  spline: ["controlPoints"],
  hatch: ["boundaries", "origin"],
  mtext: ["insertion"],
  mleader: ["vertices", "leaderLines", "textPosition"],
  insert: ["insertion", "positionedAttributes"],
  point: ["position"],
  xline: ["basePoint", "direction"],
  ray: ["basePoint", "direction"],
  solid: ["points"],
  wipeout: ["boundary"],
  image: ["insertion", "uVector", "vVector", "clipBoundary"],
  attdef: ["insertion"],
  table: ["insertion"],
  region: ["outer", "inners"],
  wall: ["start", "end"],
  // Ya planos: su geometría no guarda cota en ninguna parte.
  text: [],
  dimension: [],
  opening: [],
};

export type CadFlattenVerdict =
  /** Se aplastó: `entity` sustituye a la original y `moved` cuenta los puntos. */
  | { kind: "flattened"; entity: CadNativeEntity; moved: number; note?: string }
  /** No había nada que bajar. No se escribe: un lote inerte no es un cambio. */
  | { kind: "flat" }
  /** No se aplasta, y se dice por qué. FLATTEN lo cuenta en voz alta. */
  | { kind: "refused"; reason: string };

/**
 * Aplasta UNA entidad a Z = 0.
 *
 * Lo que se niega —y por qué se niega en vez de hacer algo parecido:
 *
 * - Un **sólido 3D** no se aplasta. Proyectar un sólido es un trabajo de línea
 *   oculta y ya tiene su orden (`FLATSHOT`, `SOLPROF`); poner sus vértices a
 *   cero daría una maraña de aristas superpuestas que parece un dibujo y no lo
 *   es. AutoCAD hace la proyección; aquí se dice adónde ir.
 * - Una **recta de construcción o semirrecta vertical** deja de definir una
 *   recta al aplastarse: su dirección se queda en (0,0). Aplastarla sería
 *   dejar en el documento una entidad degenerada que no se dibuja.
 *
 * Y lo que se aplasta DECLARANDO lo que conserva: un **muro** baja su eje pero
 * mantiene su altura, porque un muro que olvida su grosor y su altura rompe el
 * cómputo y los cortes (ADR-0016). Eso es una decisión, no un descuido, y por
 * eso viaja como `note` hasta el aviso de la orden.
 */
export function flattenCadEntity(entity: CadEntity): CadFlattenVerdict {
  if (entity.type === "solid3d")
    return {
      kind: "refused",
      reason:
        "un sólido 3D no se aplasta poniendo sus vértices a cero: proyectarlo es trabajo de línea oculta y lo hacen FLATSHOT y SOLPROF",
    };
  const fields = FLATTEN_FIELDS[entity.type as CadNativeEntityType];
  if (!fields)
    return {
      kind: "refused",
      reason: `FLATTEN no sabe qué parte de ${entityName(entity.type)} es una posición`,
    };
  if (fields.length === 0) return { kind: "flat" };

  const count = { moved: 0 };
  const source = entity as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field in source)) continue;
    const flattened = flattenValue(source[field], count);
    if (flattened !== source[field]) patch[field] = flattened;
  }
  if (count.moved === 0) return { kind: "flat" };

  if ((entity.type === "xline" || entity.type === "ray") && "direction" in patch) {
    const direction = patch.direction as PointLike;
    if (direction.x === 0 && direction.y === 0)
      return {
        kind: "refused",
        reason: `${entityName(entity.type)} vertical: aplastada dejaría de definir una recta`,
      };
  }

  const flattened = { ...source, ...patch } as unknown as CadNativeEntity;
  const note =
    entity.type === "wall"
      ? "el muro baja su eje a Z=0 y CONSERVA su altura: un muro sin altura rompe el cómputo y los cortes"
      : entity.type === "ellipse"
        ? "el eje mayor de una elipse inclinada se proyecta, así que su longitud cambia"
        : undefined;
  return note
    ? { kind: "flattened", entity: flattened, moved: count.moved, note }
    : { kind: "flattened", entity: flattened, moved: count.moved };
}
