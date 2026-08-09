/**
 * Lo que comparten las nueve cotas.
 *
 * ## La asociatividad no es opcional
 *
 * Una cota que no se actualiza al estirar la pieza es PEOR que no tener cota,
 * porque miente con autoridad: dice 1.200 sobre algo que mide 1.400 y nadie
 * duda de un número escrito en un plano. `associative-dimension.ts` ya sabe
 * recalcularlas —lo llama `executeCadEntityCommandBatch` en cada lote—, pero
 * sólo si la cota lleva sus `references`. Colgarlas es trabajo de estas órdenes.
 *
 * Y aquí está el detalle que decide si funciona en la práctica: **un punto
 * TECLEADO también puede engancharse**. Sin eso, sólo las cotas puestas con
 * captura de objeto serían asociativas y el resto nacería suelto. Se busca si
 * el punto coincide con un anclaje —`cadResolveAnchorAt`, con la tolerancia
 * derivada de la vista— y, si coincide, la cota se cuelga de él. Es lo mismo que
 * haría un osnap, hecho sobre la coordenada en vez de sobre el ratón.
 *
 * ## Reflexión
 *
 * Una cota espejada NO invierte su texto: la medida de una longitud es una
 * MAGNITUD, y `buildCadDimensionGeometry` la calcula con valor absoluto para
 * `linear` y `aligned`. Lo que sí cambia es el ángulo legible del texto —se
 * recalcula desde la dirección espejada y `readableAngle` lo mantiene en
 * (-90, 90], así que nunca queda de cabeza— y, en una cota ALINEADA, el lado del
 * que sale la línea de cota: ver `dimension-entity-adapter.ts`.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadDimensionEntity } from "../../associative-dimension";
import type { CadNativeEntity } from "../../entity-runtime";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import {
  cadAnchorReference,
  cadDirection,
  cadEntityAnchorCandidates,
  cadResolveAnchorAt,
  type CadAssociationReference,
} from "./annotate-support";

export type CadDimensionKind = NonNullable<CadDimensionEntity["dimensionKind"]>;

/** Un punto de definición, con el anclaje del que salió si lo hubo. */
export interface CadDimensionPick {
  point: CadPoint2;
  reference?: CadAssociationReference;
}

/**
 * Traduce una entrada en un punto de definición.
 *
 * `entityPick` señala un objeto: se toma su anclaje MÁS CERCANO al punto
 * pinchado, sin tolerancia, porque señalar un objeto ya es decir «éste». Un
 * punto tecleado sólo se engancha si CAE sobre un anclaje.
 */
export function cadDimensionPick(
  input: CadCommandInput,
  context: CadCommandContext,
): CadDimensionPick | null {
  if (input.kind === "point") {
    const anchor = cadResolveAnchorAt(input.point, context);
    return anchor
      ? { point: anchor.point, reference: cadAnchorReference(anchor) }
      : { point: input.point };
  }
  if (input.kind !== "entityPick") return null;
  const entity = context.entity?.(input.entityId);
  if (!entity) return { point: input.point };
  let best: CadDimensionPick = { point: input.point };
  let bestDistance = Infinity;
  for (const candidate of cadEntityAnchorCandidates(entity)) {
    const distance = Math.hypot(candidate.point.x - input.point.x, candidate.point.y - input.point.y);
    if (distance >= bestDistance) continue;
    best = { point: candidate.point, reference: cadAnchorReference(candidate) };
    bestDistance = distance;
  }
  return best;
}

/** Los dos extremos de un objeto acotable, ya con sus anclajes. */
export function cadDimensionEnds(entity: CadEntity): [CadDimensionPick, CadDimensionPick] | null {
  const candidates = cadEntityAnchorCandidates(entity);
  const pick = (anchor: string): CadDimensionPick | null => {
    const found = candidates.find((candidate) => candidate.anchor === anchor);
    return found ? { point: found.point, reference: cadAnchorReference(found) } : null;
  };
  if (entity.type === "line") {
    const start = pick("start");
    const end = pick("end");
    return start && end ? [start, end] : null;
  }
  if (entity.type === "arc" || entity.type === "circle") {
    const start = pick("arc-start");
    const end = pick("arc-end");
    return start && end ? [start, end] : null;
  }
  if (entity.type === "spline") {
    const start = pick("start");
    const end = pick("end");
    return start && end ? [start, end] : null;
  }
  if (entity.type === "polyline" && entity.vertices.length >= 2) {
    // Sin anclaje de vértice de polilínea en el vocabulario del esquema, esta
    // cota nace SUELTA. Se dice aquí y en `annotate-support.ts`: es mejor una
    // cota honesta que no se actualiza que una que finge estar enganchada.
    const first = entity.vertices[0];
    const last = entity.vertices[entity.vertices.length - 1];
    return [{ point: { x: first.x, y: first.y } }, { point: { x: last.x, y: last.y } }];
  }
  return null;
}

export interface CadDimensionDraft {
  kind: CadDimensionKind;
  a: CadPoint2;
  b: CadPoint2;
  c?: CadPoint2;
  axis?: "x" | "y";
  offset?: number;
  radius?: number;
  /** Anclajes, en el mismo orden que `a`, `b`, `c`. Los huecos se cuentan. */
  references: readonly (CadAssociationReference | undefined)[];
  /** Sobrescritura del texto medido. Vacío = se muestra la medida. */
  text?: string;
  style?: string;
}

/** Cuántas referencias necesita cada tipo para poder regenerarse. */
export function cadDimensionReferenceCount(kind: CadDimensionKind): number {
  return kind === "angular" || kind === "arc-length" ? 3 : 2;
}

/**
 * Materializa la cota.
 *
 * Se marca `associative` sólo si TODOS los puntos de definición vinieron de un
 * anclaje: con una referencia de dos, la regeneración no sabría dónde poner el
 * punto que falta y `regenerateAssociativeDimensions` la daría por rota en el
 * primer movimiento. Media asociatividad es peor que ninguna, porque el
 * indicador dice «asociada» y el número no cambia.
 */
export function cadDimensionEntity(
  draft: CadDimensionDraft,
  context: CadCommandContext,
): CadNativeEntity {
  const needed = cadDimensionReferenceCount(draft.kind);
  const references = draft.references.slice(0, needed);
  const associative = references.length === needed && references.every(Boolean);
  return {
    id: context.newEntityId(),
    type: "dimension",
    a: { x: draft.a.x, y: draft.a.y },
    b: { x: draft.b.x, y: draft.b.y },
    ...(draft.c ? { c: { x: draft.c.x, y: draft.c.y } } : {}),
    dimensionKind: draft.kind,
    ...(draft.axis ? { axis: draft.axis } : {}),
    ...(draft.offset !== undefined ? { offset: draft.offset } : {}),
    ...(draft.radius !== undefined ? { radius: draft.radius } : {}),
    ...(draft.text ? { text: draft.text } : {}),
    ...(draft.style ? { style: draft.style } : {}),
    ...(associative
      ? {
          associative: true,
          associationStatus: "associated" as const,
          references: references.map((reference) => ({ ...reference! })),
        }
      : {}),
    layer: context.activeLayer,
  };
}

/**
 * Desfase con signo de una cota ALINEADA a partir de dónde se soltó la línea.
 *
 * Es la proyección sobre la normal del tramo, así que el signo elige el lado,
 * que es exactamente lo que hace `alignedDimension`.
 */
export function cadAlignedOffset(a: CadPoint2, b: CadPoint2, location: CadPoint2): number | null {
  const direction = cadDirection(a, b);
  if (!direction) return null;
  return (location.x - a.x) * -direction.y + (location.y - a.y) * direction.x;
}

/**
 * Desfase de una cota LINEAL. `linearDimension` mide desde el extremo MAYOR del
 * eje perpendicular, así que el desfase se calcula contra ese mismo extremo o la
 * línea de cota no caería donde se soltó.
 */
export function cadLinearOffset(
  a: CadPoint2,
  b: CadPoint2,
  axis: "x" | "y",
  location: CadPoint2,
): number {
  return axis === "x" ? location.y - Math.max(a.y, b.y) : location.x - Math.max(a.x, b.x);
}

/**
 * Horizontal o vertical, decidido por hacia dónde se arrastró.
 *
 * Si la línea de cota se suelta ARRIBA o ABAJO del tramo, lo que se quiere medir
 * es la distancia horizontal; si se suelta a un lado, la vertical. Es el gesto
 * de AutoCAD y no hace falta preguntar nada.
 */
export function cadLinearAxis(a: CadPoint2, b: CadPoint2, location: CadPoint2): "x" | "y" {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  return Math.abs(location.y - midY) >= Math.abs(location.x - midX) ? "x" : "y";
}

/** Ángulo entre dos direcciones, en grados y dentro de [0, 360). */
export function cadSweepDegrees(first: CadPoint2, second: CadPoint2): number {
  const degrees =
    ((Math.atan2(second.y, second.x) - Math.atan2(first.y, first.x)) * 180) / Math.PI;
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
