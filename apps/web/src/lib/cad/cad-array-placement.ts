/**
 * ARRAY sobre el modelo canónico: colocación y asociatividad.
 *
 * ## Cómo se reutiliza `array.ts` sin reescribir su matemática
 *
 * `array.ts` lleva desde la fase B3 probado y sin que nadie lo llame. Calcula
 * matrices rectangulares, polares y de camino sobre PRIMITIVAS, no sobre
 * entidades del documento, y traducir entidades a primitivas y de vuelta sería
 * a la vez lento y lesivo: una elipse no es una primitiva, un INSERT tampoco, y
 * lo que no se supiera convertir se perdería por el camino.
 *
 * La observación que lo resuelve: las tres matrices colocan cada copia con una
 * transformada RÍGIDA —giro más traslación—, la misma para toda la geometría de
 * esa copia. Así que basta pasarle a `array.ts` un segmento SONDA de longitud
 * uno en el origen y leer dónde ha ido a parar: su nuevo arranque es la
 * traslación y su nueva dirección, el giro. `array.ts` sigue siendo la única
 * fuente de la disposición —si alguien corrige ahí el reparto de una polar,
 * esto lo hereda— y el documento sólo ve `CadEntityTransform`, que cada
 * adaptador ya sabe aplicar a su tipo.
 *
 * ## Qué significa «asociativa» aquí, exactamente
 *
 * Cada copia (y el original) llevan en `context.metadata` el identificador de
 * la matriz, su índice y los PARÁMETROS con que se generó. Con eso, `ARRAYEDIT`
 * puede encontrar a todos los miembros y rehacerlos con otro número de filas
 * sin que el usuario vuelva a designar nada.
 *
 * Lo que NO hace, y conviene decirlo antes de que alguien lo suponga: editar la
 * geometría del original no regenera las copias. La regeneración es explícita,
 * por `ARRAYEDIT`. Una regeneración automática exige un ganchо en el ejecutor
 * de comandos como el de los sombreados asociativos, y eso es un cambio con su
 * propia decisión.
 */
import type { CadEntity } from "./cad-document";
import type { CadEntityTransform } from "./entity-runtime";
import { pathArray, polarArray, rectangularArray } from "./array";
import type { CadPrimitive, CadVec2 } from "./primitives";

/** Claves de asociatividad. Un solo sitio: buscarlas por cadena suelta se rompe. */
export const CAD_ARRAY_META = {
  id: "arrayId",
  kind: "arrayKind",
  index: "arrayIndex",
  params: "arrayParams",
} as const;

export type CadArrayKind = "rectangular" | "polar" | "path";

export type CadArraySpec =
  | { kind: "rectangular"; rows: number; cols: number; rowSpacing: number; colSpacing: number; angle?: number }
  | {
      kind: "polar";
      center: CadVec2;
      count: number;
      totalAngle?: number;
      rotateItems?: boolean;
      /**
       * Punto de referencia del objeto cuando NO gira. Sin él, «mantener la
       * orientación» desplazaría cada copia como si el objeto estuviera en el
       * origen, y la matriz saldría descolocada para todo lo que no lo esté.
       */
      itemBase?: CadVec2;
    }
  | { kind: "path"; path: CadVec2[]; count: number; align?: boolean; base: CadVec2 };

/**
 * Segmento sonda: de (0,0) a (1,0).
 *
 * Su imagen determina la transformada rígida por completo — el arranque da la
 * traslación y la dirección el giro — y con longitud uno el giro se lee sin
 * dividir por nada que pueda ser cero.
 */
const PROBE: CadPrimitive[] = [{ kind: "line", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }];

function transformFromProbe(group: CadPrimitive[]): CadEntityTransform | null {
  const image = group[0];
  if (!image || image.kind !== "line") return null;
  const dx = image.b.x - image.a.x;
  const dy = image.b.y - image.a.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    translation: { x: image.a.x, y: image.a.y },
    ...(Math.abs(rotationDeg) > 1e-12 ? { rotationDeg } : {}),
  };
}

/**
 * Una transformada por copia, en el orden en que `array.ts` las produce.
 *
 * La primera es siempre la identidad —la copia que coincide con el original—,
 * así que quien llame debe SALTARSELA para el original y usar el resto para las
 * copias nuevas. Se devuelve entera, y no ya recortada, porque el índice de
 * cada miembro forma parte de la asociatividad.
 */
export function cadArrayPlacements(spec: CadArraySpec): CadEntityTransform[] {
  const groups =
    spec.kind === "rectangular"
      ? rectangularArray(PROBE, {
          rows: spec.rows,
          cols: spec.cols,
          rowSpacing: spec.rowSpacing,
          colSpacing: spec.colSpacing,
          angle: spec.angle ?? 0,
        })
      : spec.kind === "polar"
        ? polarArray(PROBE, {
            center: spec.center,
            count: spec.count,
            totalAngle: spec.totalAngle ?? 360,
            rotateItems: spec.rotateItems ?? true,
            itemBase: spec.itemBase ?? { x: 0, y: 0 },
          })
        : pathArray(PROBE, {
            path: spec.path,
            count: spec.count,
            align: spec.align ?? true,
            sourceBase: spec.base,
          });
  return groups
    .map(transformFromProbe)
    .filter((transform): transform is CadEntityTransform => transform !== null);
}

/**
 * Presupuesto de la especificación guardada, en caracteres.
 *
 * Los parámetros viajan en el `metadata` de CADA miembro, así que una matriz de
 * camino de cincuenta elementos los guarda cincuenta veces. Un camino teselado
 * puede tener decenas de puntos, y sin tope una sola matriz engordaría el
 * documento —y cada guardado, y cada envío— más que el dibujo entero.
 */
const SPEC_BUDGET = 4_000;

/**
 * Los parámetros, serializados para caber en `metadata` (sólo escalares).
 *
 * Cadena vacía cuando no caben: quien llama omite entonces la clave, y
 * `ARRAYEDIT` responde que la matriz no conserva sus parámetros en vez de
 * regenerar una distinta de la que se ve. Perder la regeneración de una matriz
 * enorme es mejor que multiplicar el peso del documento por su número de
 * copias.
 */
export function serializeCadArraySpec(spec: CadArraySpec): string {
  // Las coordenadas del camino se redondean: seis decimales son nanómetros en
  // un plano en milímetros, y la diferencia en tamaño es de tres a uno.
  const compact =
    spec.kind === "path"
      ? {
          ...spec,
          path: spec.path.map((point) => ({
            x: Number(point.x.toFixed(6)),
            y: Number(point.y.toFixed(6)),
          })),
        }
      : spec;
  const serialized = JSON.stringify(compact);
  return serialized.length <= SPEC_BUDGET ? serialized : "";
}

/**
 * Recupera los parámetros guardados. Devuelve `null` ante cualquier cosa que no
 * sea una especificación completa: unos parámetros a medias regenerarían una
 * matriz distinta de la que el usuario ve, que es peor que negarse.
 */
export function parseCadArraySpec(raw: unknown): CadArraySpec | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Partial<CadArraySpec> & { kind?: string };
  if (candidate.kind === "rectangular") {
    const { rows, cols, rowSpacing, colSpacing } = candidate as Extract<CadArraySpec, { kind: "rectangular" }>;
    return [rows, cols, rowSpacing, colSpacing].every((value) => typeof value === "number" && Number.isFinite(value))
      ? (candidate as CadArraySpec)
      : null;
  }
  if (candidate.kind === "polar") {
    const polar = candidate as Extract<CadArraySpec, { kind: "polar" }>;
    return typeof polar.count === "number" &&
      polar.center &&
      typeof polar.center.x === "number" &&
      typeof polar.center.y === "number"
      ? (candidate as CadArraySpec)
      : null;
  }
  if (candidate.kind === "path") {
    const path = candidate as Extract<CadArraySpec, { kind: "path" }>;
    return Array.isArray(path.path) && path.path.length >= 2 && typeof path.count === "number"
      ? (candidate as CadArraySpec)
      : null;
  }
  return null;
}

export interface CadArrayMember {
  entity: CadEntity;
  index: number;
}

/** Todos los miembros de una matriz, ordenados por índice. */
export function cadArrayMembers(entities: readonly CadEntity[], arrayId: string): CadArrayMember[] {
  return entities
    .filter((entity) => entity.context?.metadata?.[CAD_ARRAY_META.id] === arrayId)
    .map((entity) => ({
      entity,
      index: Number(entity.context?.metadata?.[CAD_ARRAY_META.index] ?? 0),
    }))
    .sort((left, right) => left.index - right.index);
}

/** El identificador de matriz al que pertenece la entidad, si pertenece a alguna. */
export function cadArrayIdOf(entity: CadEntity | undefined): string | null {
  const value = entity?.context?.metadata?.[CAD_ARRAY_META.id];
  return typeof value === "string" && value.length > 0 ? value : null;
}
