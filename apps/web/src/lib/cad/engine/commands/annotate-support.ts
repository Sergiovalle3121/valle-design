/**
 * Piezas compartidas por las órdenes de ANOTACIÓN.
 *
 * Texto, cotas, sombreados y directrices repiten los mismos cuatro finales —me
 * han cancelado, no puedo hacerlo y aquí está el motivo, esto es lo que hay que
 * escribir— y la misma pregunta: ¿a qué geometría se engancha esto?
 *
 * Tenerlo aquí no es sólo ahorro de líneas. El trinquete de
 * `check-monolith-budget` corta a las 800 por archivo, y las nueve cotas más el
 * sombreado no caben en uno; repartirlas obliga a que el final de un comando y
 * el de otro sean literalmente el mismo código, que es justo lo que hace que
 * «cancelar» signifique lo mismo en los veinticuatro.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "../../cad-document";
import { cadEntityAssociationAnchor, type CadDimensionEntity } from "../../associative-dimension";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadCommandContext, CadCommandStep } from "../command-types";

export type CadAssociationReference = NonNullable<CadDimensionEntity["references"]>[number];
export type CadAssociationAnchor = CadAssociationReference["anchor"];

/** El esquema canónico guarda puntos 3D; el dibujo 2D vive en z = 0. */
export const flat = (point: CadPoint2): CadPoint3 => ({ x: point.x, y: point.y, z: 0 });

const SILENT = { message: "", options: [] } as const;

/** El comando termina sin escribir nada. Esc, y también «no había nada que hacer». */
export function cadCommandCancelled<S>(state: S): CadCommandStep<S> {
  return { state, prompt: SILENT, accepts: 0, result: { kind: "none" } };
}

/**
 * El comando se NIEGA y dice por qué.
 *
 * Es la diferencia entre un CAD y un juguete: un DIMANGULAR sobre dos rectas
 * paralelas no tiene ángulo que medir, y callarse deja al dibujante mirando la
 * pantalla sin saber si falló él o el programa.
 */
export function cadCommandRefused<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: SILENT, accepts: 0, result: { kind: "message", text } };
}

/** El comando termina escribiendo. UN lote, UN paso de deshacer. */
export function cadCommandWrites<S>(
  state: S,
  commands: readonly CadEntityCommand[],
  label: string,
): CadCommandStep<S> {
  return { state, prompt: SILENT, accepts: 0, result: { kind: "document", commands, label } };
}

/**
 * Anclajes de asociatividad que ofrece cada tipo de entidad.
 *
 * El vocabulario de anclajes lo fija `CadDimensionEntity["references"]` y quien
 * sabe convertir un anclaje en coordenadas es `cadEntityAssociationAnchor`. Aquí
 * sólo se dice CUÁLES tiene cada tipo, y las coordenadas se piden a aquella
 * función: si la tabla de anclajes viviera dos veces, un día darían puntos
 * distintos y la cota se recalcularía a un sitio donde nunca se dibujó.
 *
 * **POLYLINE no aparece, y se nota.** El vocabulario no tiene un anclaje de
 * vértice de polilínea (`control` es sólo de spline), así que acotar entre dos
 * vértices de una polilínea sale NO asociativo. Ampliar el vocabulario toca
 * `cad-document.ts`, que es de otra sesión; queda anotado en vez de resuelto a
 * medias.
 */
const ANCHORS_BY_TYPE: Readonly<Record<string, readonly CadAssociationAnchor[]>> = {
  line: ["start", "end"],
  circle: ["center", "arc-start", "arc-end"],
  arc: ["center", "arc-start", "arc-end"],
  ellipse: ["center", "major-start", "major-end"],
  spline: ["start", "end"],
  mtext: ["insertion"],
};

export interface CadAnchorCandidate {
  entityId: string;
  anchor: CadAssociationAnchor;
  point: CadPoint2;
}

/** Todos los anclajes de una entidad, ya resueltos a coordenadas. */
export function cadEntityAnchorCandidates(entity: CadEntity): CadAnchorCandidate[] {
  const anchors = ANCHORS_BY_TYPE[entity.type] ?? [];
  const candidates: CadAnchorCandidate[] = [];
  for (const anchor of anchors) {
    const point = cadEntityAssociationAnchor(entity, { entityId: entity.id, anchor });
    if (point) candidates.push({ entityId: entity.id, anchor, point });
  }
  return candidates;
}

/**
 * Tolerancia de coincidencia, en unidades de dibujo.
 *
 * Medio píxel de pantalla. Se deriva de la vista y no de una constante en
 * milímetros porque un plano de urbanismo y una pieza mecánica no tienen la
 * misma idea de «el mismo punto»: con un valor fijo, en el plano grande nada
 * coincidiría nunca y en la pieza pequeña coincidiría todo.
 */
export function cadAnchorTolerance(context: CadCommandContext): number {
  const pixelsPerUnit = context.view.pixelsPerUnit;
  return Number.isFinite(pixelsPerUnit) && pixelsPerUnit > 1e-9 ? 0.5 / pixelsPerUnit : 1e-6;
}

/**
 * Busca a qué anclaje corresponde un punto tecleado o capturado.
 *
 * Es lo que convierte «he escrito 0,0» en «he señalado el extremo de esa
 * línea». Sin esto, una cota tecleada por coordenadas nacería suelta y dejaría
 * de decir la verdad en cuanto alguien estirase la pieza — que es peor que no
 * tener cota, porque miente con autoridad.
 *
 * Ante un empate gana el anclaje MÁS CERCANO, y a igual distancia el de la
 * entidad que aparece antes en el documento: hace falta un desempate
 * determinista o la misma orden daría cotas distintas en dos corridas.
 */
export function cadResolveAnchorAt(
  point: CadPoint2,
  context: CadCommandContext,
  exclude?: ReadonlySet<string>,
): CadAnchorCandidate | null {
  const tolerance = cadAnchorTolerance(context);
  let best: CadAnchorCandidate | null = null;
  let bestDistance = Infinity;
  for (const entityId of context.entityIds) {
    if (exclude?.has(entityId)) continue;
    const entity = context.entity?.(entityId);
    if (!entity) continue;
    for (const candidate of cadEntityAnchorCandidates(entity)) {
      const distance = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y);
      if (distance > tolerance || distance >= bestDistance) continue;
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Referencia lista para colgar de una cota o una directriz. */
export function cadAnchorReference(candidate: CadAnchorCandidate): CadAssociationReference {
  return { entityId: candidate.entityId, anchor: candidate.anchor };
}

/** Distancia entre dos puntos. Se repite en los nueve comandos de cota. */
export const cadDistance = (a: CadPoint2, b: CadPoint2): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Vector unitario, o `null` si el vector es degenerado. */
export function cadDirection(from: CadPoint2, to: CadPoint2): CadPoint2 | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length > 1e-9 ? { x: dx / length, y: dy / length } : null;
}
