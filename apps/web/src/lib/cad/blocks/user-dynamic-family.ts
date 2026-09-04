/**
 * EL BLOQUE DEL USUARIO, VUELTO DINÁMICO.
 *
 * ## Qué faltaba, medido
 *
 * `docs/competitive/rubric.json`, criterio `bloques.dinamicos`: *«No hay
 * bloques dinámicos como tales (parámetros/acciones editables por grip).»* La
 * primera rebanada de esta ola abrió la puerta al motor que ya existía, pero
 * sus dos familias —la puerta y la marca de nivel— están escritas EN EL
 * PROGRAMA. Un despacho no puede tomar SU bloque y ponerle un parámetro, que es
 * exactamente lo que un bloque dinámico de AutoCAD es.
 *
 * ## Dónde viven los parámetros, sin un campo nuevo
 *
 * `CadBlockDefinition` no tiene sección de parámetros y añadírsela obligaría a
 * migrar el formato persistido. No hace falta: **el parámetro es una LÍNEA
 * dentro de la propia definición**, marcada en `context.metadata`. Es
 * exactamente lo que se ve en el editor de bloques de AutoCAD —el parámetro se
 * dibuja— y aquí además viaja al DXF como una línea normal en una capa que se
 * puede apagar.
 *
 * La línea dice dos cosas a la vez, y ninguna hace falta inventarla:
 *
 * - **de dónde a dónde**: su punto inicial es la base y su punto final marca la
 *   dirección y la longitud de referencia;
 * - **qué mueve**: todo lo que quede del lado del punto final, medido sobre esa
 *   dirección desde el punto MEDIO. Ése es el marco de estirado, y es
 *   deducible: no hace falta que el usuario dibuje además un rectángulo.
 *
 * ## Qué se admite hoy, y qué se dice que no
 *
 * Sólo parámetros LINEALES con acción de estirar. Un parámetro de ángulo pide
 * girar geometría alrededor de un punto —con arcos y textos, que rotan de otra
 * manera— y uno de espejo pide reflejarla; las dos cosas se pueden hacer bien o
 * se pueden hacer «casi», y «casi» en un bloque que alguien imprime y construye
 * no vale. Se declaran no admitidos POR SU NOMBRE, con el motivo, en vez de
 * aceptarlos y torcer el dibujo.
 */
import type { CadBlockDefinition, CadEntity, CadPoint2 } from "../cad-document";
import type {
  CadDynamicBlockFamily,
  CadDynamicShape,
  CadDynamicValues,
} from "../dynamic-blocks";
import { cadStretchAnchorPoint } from "../stretch-anchor";
import { cadTranslateEntity } from "../entity-translate";

/** Nombre del parámetro que declara esta línea. Sin él, es geometría normal. */
export const CAD_DIN_PARAM = "din:param";
/** Tipo declarado. Hoy sólo `lineal`; los demás se rechazan por su nombre. */
export const CAD_DIN_KIND = "din:tipo";
/** Rótulo que se lee al preguntar. Si falta, se usa el nombre. */
export const CAD_DIN_LABEL = "din:etiqueta";
/** Valor por defecto. Si falta, la longitud dibujada de la línea. */
export const CAD_DIN_DEFAULT = "din:def";
export const CAD_DIN_MIN = "din:min";
export const CAD_DIN_MAX = "din:max";
/** Medidas admitidas, separadas por comas: `600,700,800,900`. */
export const CAD_DIN_STEPS = "din:pasos";
/** Capa donde viven las líneas de parámetro, para poder apagarlas. */
export const CAD_DIN_LAYER = "BLOQUE-PARAM";

export interface CadUserDynamicFinding {
  /** El parámetro o la entidad que lo provoca. */
  subject: string;
  detail: string;
}

export interface CadUserDynamicRead {
  family: CadDynamicBlockFamily | null;
  findings: CadUserDynamicFinding[];
}

const meta = (entity: CadEntity, key: string): string | undefined => {
  const value = entity.context?.metadata?.[key];
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

const numberOf = (raw: string | undefined): number | undefined => {
  if (raw === undefined) return undefined;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
};

/** ¿Es esta entidad la línea que declara un parámetro? */
export const cadIsParameterCarrier = (entity: CadEntity): boolean =>
  entity.type === "line" && !!meta(entity, CAD_DIN_PARAM);

interface Carrier {
  name: string;
  label: string;
  base: CadPoint2;
  /** Vector unitario de la dirección declarada. */
  dir: CadPoint2;
  /** Longitud dibujada: la referencia contra la que se estira. */
  length: number;
  default: number;
  min?: number;
  max?: number;
  steps?: number[];
}

const shift = <P extends { x: number; y: number }>(point: P, dx: number, dy: number): P => ({
  ...point,
  x: point.x + dx,
  y: point.y + dy,
});

/**
 * ¿Cae este punto del lado que se mueve?
 *
 * Se mide sobre la dirección del parámetro y desde su punto MEDIO: lo que está
 * más allá de la mitad se mueve, lo que está más acá se queda. Es la regla que
 * hace que estirar una mesa por su lado derecho deje las patas izquierdas donde
 * estaban sin que nadie tenga que dibujar un marco.
 */
function moves(point: { x: number; y: number }, carrier: Carrier): boolean {
  const midX = carrier.base.x + carrier.dir.x * (carrier.length / 2);
  const midY = carrier.base.y + carrier.dir.y * (carrier.length / 2);
  return (point.x - midX) * carrier.dir.x + (point.y - midY) * carrier.dir.y > 0;
}

/** La entidad con los puntos que le tocan ya desplazados. */
function stretched(entity: CadEntity, carrier: Carrier, offset: number): CadEntity {
  const dx = carrier.dir.x * offset;
  const dy = carrier.dir.y * offset;
  const anchor = cadStretchAnchorPoint(entity);
  // Lo que no se estira por partes se mueve ENTERO, como en STRETCH: un círculo
  // estirado a medias sería una elipse que nadie pidió. La tabla de qué mover
  // en cada tipo es la compartida (`entity-translate.ts`).
  if (anchor) return moves(anchor, carrier) ? cadTranslateEntity(entity, dx, dy) : entity;
  if (entity.type === "line")
    return {
      ...entity,
      start: moves(entity.start, carrier) ? shift(entity.start, dx, dy) : entity.start,
      end: moves(entity.end, carrier) ? shift(entity.end, dx, dy) : entity.end,
    };
  if (entity.type === "polyline")
    return {
      ...entity,
      vertices: entity.vertices.map((vertex) =>
        moves(vertex, carrier) ? shift(vertex, dx, dy) : vertex,
      ),
    };
  if (entity.type === "spline")
    return {
      ...entity,
      controlPoints: entity.controlPoints.map((point) =>
        moves(point, carrier) ? shift(point, dx, dy) : point,
      ),
    };
  return entity;
}

/**
 * Lee un bloque del documento como familia dinámica.
 *
 * Devuelve `family: null` cuando el bloque no declara ningún parámetro —que es
 * el caso de la inmensa mayoría de los bloques y no es un error— y SIEMPRE los
 * hallazgos: un parámetro mal declarado tiene que decirse, porque el síntoma de
 * ignorarlo es un bloque que no obedece y nadie sabe por qué.
 */
export function cadUserDynamicFamily(definition: CadBlockDefinition): CadUserDynamicRead {
  const findings: CadUserDynamicFinding[] = [];
  const carriers: Carrier[] = [];
  const vistos = new Set<string>();

  for (const entity of definition.entities) {
    const name = meta(entity, CAD_DIN_PARAM);
    if (!name) continue;
    if (entity.type !== "line") {
      findings.push({
        subject: name,
        detail: `el parámetro «${name}» está declarado sobre un ${entity.type}: tiene que ser una LÍNEA, que es la que dice de dónde a dónde.`,
      });
      continue;
    }
    const limpio = name.trim().toLowerCase().replace(/\s+/gu, "-");
    if (!/^[a-z0-9-]+$/u.test(limpio)) {
      findings.push({
        subject: name,
        detail: `«${name}» no sirve como nombre de parámetro: forma parte de la llave del bloque materializado, así que sólo letras sin acento, cifras y guiones.`,
      });
      continue;
    }
    if (vistos.has(limpio)) {
      findings.push({
        subject: limpio,
        detail: `«${limpio}» está declarado dos veces en el bloque: uno de los dos no obedecería y no se puede saber cuál.`,
      });
      continue;
    }
    const kind = (meta(entity, CAD_DIN_KIND) ?? "lineal").toLowerCase();
    if (kind !== "lineal") {
      findings.push({
        subject: limpio,
        detail: `el tipo «${kind}» todavía no se admite en un bloque del usuario: hoy sólo «lineal» con acción de estirar. Girar y reflejar geometría cualquiera —arcos, textos, sombreados— se hace bien o no se hace.`,
      });
      continue;
    }
    const dx = entity.end.x - entity.start.x;
    const dy = entity.end.y - entity.start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) {
      findings.push({
        subject: limpio,
        detail: `la línea del parámetro «${limpio}» mide cero: no dice ninguna dirección.`,
      });
      continue;
    }
    vistos.add(limpio);
    carriers.push({
      name: limpio,
      label: meta(entity, CAD_DIN_LABEL) ?? limpio,
      base: { x: entity.start.x, y: entity.start.y },
      dir: { x: dx / length, y: dy / length },
      length,
      default: numberOf(meta(entity, CAD_DIN_DEFAULT)) ?? length,
      min: numberOf(meta(entity, CAD_DIN_MIN)),
      max: numberOf(meta(entity, CAD_DIN_MAX)),
      steps: meta(entity, CAD_DIN_STEPS)
        ?.split(",")
        .map((parte) => numberOf(parte.trim()))
        .filter((valor): valor is number => valor !== undefined),
    });
  }

  if (carriers.length === 0) return { family: null, findings };

  const geometry = definition.entities.filter((entity) => !cadIsParameterCarrier(entity));
  const family: CadDynamicBlockFamily = {
    id: definition.id,
    name: definition.name,
    description:
      definition.description ??
      `Bloque del dibujo con ${carriers.length} parámetro(s) declarado(s) dentro de su definición.`,
    keywords: [...(definition.keywords ?? []), "dinamico", "usuario"],
    // La capa la trae cada entidad del bloque; ésta sólo se usa para las
    // primitivas sin capa propia, que en una familia de usuario no hay.
    layer: geometry[0]?.layer ?? "0",
    parameters: carriers.map((carrier) => ({
      name: carrier.name,
      kind: "linear" as const,
      label: carrier.label,
      default: carrier.default,
      ...(carrier.min !== undefined ? { min: carrier.min } : {}),
      ...(carrier.max !== undefined ? { max: carrier.max } : {}),
      ...(carrier.steps && carrier.steps.length > 0 ? { steps: carrier.steps } : {}),
    })),
    build: (values: CadDynamicValues): CadDynamicShape[] => {
      let entities = geometry;
      for (const carrier of carriers) {
        const value = values[carrier.name];
        if (!Number.isFinite(value)) continue;
        const offset = value - carrier.length;
        if (offset === 0) continue;
        entities = entities.map((entity) => stretched(entity, carrier, offset));
      }
      return entities.map((entity) => ({ type: "entity", entity }));
    },
    attributes: () =>
      Object.fromEntries(
        Object.entries(definition.attributes ?? {}).map(([tag, value]) => [
          tag,
          { defaultValue: value.defaultValue ?? "", prompt: value.prompt ?? tag },
        ]),
      ),
  };
  return { family, findings };
}

/** Las familias que el DOCUMENTO trae, por encima de las del programa. */
export function cadUserDynamicFamilies(
  blocks: readonly CadBlockDefinition[],
): CadDynamicBlockFamily[] {
  const familias: CadDynamicBlockFamily[] = [];
  for (const definition of blocks) {
    const { family } = cadUserDynamicFamily(definition);
    if (family) familias.push(family);
  }
  return familias;
}
