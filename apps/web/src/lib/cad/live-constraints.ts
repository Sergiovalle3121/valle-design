import {
  makeCollinear,
  makeEqualLength,
  makeHorizontal,
  makeParallel,
  makePerpendicular,
  makeVertical,
  setAngle,
  setLength,
  type Segment,
} from "./geom-constraints";
import type { CadConstraint, CadDocument, CadEntity } from "./cad-document";

export type CadConstraintSolveStatus =
  | "under_constrained"
  | "fully_constrained"
  | "over_constrained"
  | "inconsistent";

export interface CadConstraintSolveResult {
  document: CadDocument;
  status: CadConstraintSolveStatus;
  converged: boolean;
  iterations: number;
  changedEntityIds: string[];
  issues: { code: string; message: string; constraintIds: string[] }[];
}

type SolvableEntity = Extract<CadEntity, { type: "box" | "line" }>;

function toSegment(entity: SolvableEntity): Segment | null {
  if (entity.type === "line") {
    return {
      a: { x: entity.start.x, y: entity.start.y },
      b: { x: entity.end.x, y: entity.end.y },
    };
  }
  if (entity.kind !== "wall" || !(entity.w > 0)) return null;
  const cx = entity.x + entity.w / 2;
  const cy = entity.y + entity.h / 2;
  const radians = (entity.rotation * Math.PI) / 180;
  const hx = (Math.cos(radians) * entity.w) / 2;
  const hy = (Math.sin(radians) * entity.w) / 2;
  return { a: { x: cx - hx, y: cy - hy }, b: { x: cx + hx, y: cy + hy } };
}

function fromSegment(
  entity: SolvableEntity,
  segment: Segment,
): SolvableEntity | null {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9) || !Number.isFinite(length)) return null;
  if (entity.type === "line") {
    return {
      ...entity,
      start: { ...entity.start, x: segment.a.x, y: segment.a.y },
      end: { ...entity.end, x: segment.b.x, y: segment.b.y },
    };
  }
  const cx = (segment.a.x + segment.b.x) / 2;
  const cy = (segment.a.y + segment.b.y) / 2;
  return {
    ...entity,
    w: length,
    x: cx - length / 2,
    y: cy - entity.h / 2,
    rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

function maxDelta(a: Segment, b: Segment): number {
  return Math.max(
    Math.abs(a.a.x - b.a.x),
    Math.abs(a.a.y - b.a.y),
    Math.abs(a.b.x - b.b.x),
    Math.abs(a.b.y - b.b.y),
  );
}

function conflictIssues(constraints: CadConstraint[]) {
  const axis = new Map<string, CadConstraint[]>();
  for (const constraint of constraints) {
    if (
      !constraint.enabled ||
      (constraint.kind !== "horizontal" && constraint.kind !== "vertical")
    )
      continue;
    const id = constraint.entityIds[0];
    if (!id) continue;
    const list = axis.get(id) ?? [];
    list.push(constraint);
    axis.set(id, list);
  }
  return [...axis.entries()].flatMap(([entityId, list]) => {
    const kinds = new Set(list.map((constraint) => constraint.kind));
    if (kinds.size < 2) return [];
    return [
      {
        code: "axis_conflict",
        message: `${entityId} cannot be horizontal and vertical while preserving a non-zero length.`,
        constraintIds: list.map((constraint) => constraint.id),
      },
    ];
  });
}

function chooseReference(
  constraint: CadConstraint,
  changed: Set<string>,
): { referenceId: string; targetId: string } | null {
  const [a, b] = constraint.entityIds;
  if (!a || !b) return null;
  if (changed.has(b) && !changed.has(a)) return { referenceId: b, targetId: a };
  return { referenceId: a, targetId: b };
}

function applyConstraint(
  constraint: CadConstraint,
  entities: Map<string, SolvableEntity>,
  changed: Set<string>,
): { delta: number; changedId?: string; error?: string } {
  const firstId = constraint.entityIds[0];
  const first = firstId ? entities.get(firstId) : undefined;
  const firstSegment = first ? toSegment(first) : null;
  if (!first || !firstSegment)
    return {
      delta: 0,
      error: `Entity ${firstId ?? "(missing)"} is not a solvable wall/line.`,
    };

  let target = first;
  let before = firstSegment;
  let after: Segment;
  if (constraint.kind === "horizontal") after = makeHorizontal(before);
  else if (constraint.kind === "vertical") after = makeVertical(before);
  else if (constraint.kind === "distance") {
    if (!(constraint.value && constraint.value > 0))
      return { delta: 0, error: "Distance must be greater than zero." };
    after = setLength(before, constraint.value, "start");
  } else if (constraint.kind === "angle") {
    if (!Number.isFinite(constraint.value))
      return { delta: 0, error: "Angle must be finite." };
    after = setAngle(before, constraint.value!, "start");
  } else {
    const pair = chooseReference(constraint, changed);
    if (!pair)
      return { delta: 0, error: `${constraint.kind} needs two entities.` };
    const reference = entities.get(pair.referenceId);
    const targetEntity = entities.get(pair.targetId);
    const referenceSegment = reference ? toSegment(reference) : null;
    const targetSegment = targetEntity ? toSegment(targetEntity) : null;
    if (!reference || !targetEntity || !referenceSegment || !targetSegment) {
      return {
        delta: 0,
        error: `${constraint.kind} references an unknown entity.`,
      };
    }
    target = targetEntity;
    before = targetSegment;
    if (constraint.kind === "parallel")
      after = makeParallel(before, referenceSegment);
    else if (constraint.kind === "perpendicular")
      after = makePerpendicular(before, referenceSegment);
    else if (constraint.kind === "equalLength")
      after = makeEqualLength(before, referenceSegment);
    else if (constraint.kind === "collinear")
      after = makeCollinear(before, referenceSegment);
    else {
      const dx = before.b.x - before.a.x;
      const dy = before.b.y - before.a.y;
      after = {
        a: { ...referenceSegment.b },
        b: { x: referenceSegment.b.x + dx, y: referenceSegment.b.y + dy },
      };
    }
  }

  const next = fromSegment(target, after);
  if (!next)
    return {
      delta: 0,
      error: `${constraint.kind} produced degenerate geometry.`,
    };
  entities.set(target.id, next);
  return { delta: maxDelta(before, after), changedId: target.id };
}

/**
 * Deterministic live solver for the wall/line subset. It never mutates the
 * input document and rolls back to it on conflict, degeneration or non-
 * convergence.
 */
export function solveCadConstraints(
  document: CadDocument,
  changedEntityIds: string[] = [],
  options: { tolerance?: number; maxIterations?: number } = {},
): CadConstraintSolveResult {
  const tolerance = Math.max(1e-9, options.tolerance ?? 1e-6);
  const maxIterations = Math.min(64, Math.max(1, options.maxIterations ?? 16));
  const constraints = document.constraints
    .filter((constraint) => constraint.enabled)
    .sort((a, b) => a.id.localeCompare(b.id));
  const conflicts = conflictIssues(constraints);
  if (conflicts.length) {
    return {
      document,
      status: "over_constrained",
      converged: false,
      iterations: 0,
      changedEntityIds: [],
      issues: conflicts,
    };
  }

  const solvable = new Map<string, SolvableEntity>();
  for (const entity of document.entities) {
    if (
      entity.type === "line" ||
      (entity.type === "box" && entity.kind === "wall")
    )
      solvable.set(entity.id, structuredClone(entity));
  }
  const changed = new Set(changedEntityIds);
  const touched = new Set<string>();
  const issues: CadConstraintSolveResult["issues"] = [];
  let converged = constraints.length === 0;
  let iterations = 0;

  for (let pass = 1; pass <= maxIterations && constraints.length; pass++) {
    iterations = pass;
    let largest = 0;
    for (const constraint of constraints) {
      const result = applyConstraint(constraint, solvable, changed);
      if (result.error) {
        issues.push({
          code: "constraint_invalid",
          message: result.error,
          constraintIds: [constraint.id],
        });
        return {
          document,
          status: "inconsistent",
          converged: false,
          iterations,
          changedEntityIds: [],
          issues,
        };
      }
      largest = Math.max(largest, result.delta);
      if (result.changedId && result.delta > tolerance)
        touched.add(result.changedId);
    }
    if (largest <= tolerance) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    return {
      document,
      status: "inconsistent",
      converged: false,
      iterations,
      changedEntityIds: [],
      issues: [
        {
          code: "constraint_no_convergence",
          message: `Constraint graph did not converge in ${maxIterations} iterations.`,
          constraintIds: constraints.map((constraint) => constraint.id),
        },
      ],
    };
  }

  const entities = document.entities.map(
    (entity) => solvable.get(entity.id) ?? entity,
  );
  const constrainedIds = new Set(
    constraints.flatMap((constraint) => constraint.entityIds),
  );
  const status: CadConstraintSolveStatus =
    constraints.length > 0 &&
    [...constrainedIds].every(
      (id) =>
        constraints.filter((constraint) => constraint.entityIds.includes(id))
          .length >= 2,
    )
      ? "fully_constrained"
      : "under_constrained";
  return {
    document: { ...document, entities },
    status,
    converged: true,
    iterations,
    changedEntityIds: [...touched].sort(),
    issues,
  };
}

export function upsertCadConstraint(
  document: CadDocument,
  constraint: CadConstraint,
): CadDocument {
  const constraints = document.constraints.filter(
    (candidate) => candidate.id !== constraint.id,
  );
  constraints.push({ ...constraint, entityIds: [...constraint.entityIds] });
  constraints.sort((a, b) => a.id.localeCompare(b.id));
  return { ...document, constraints };
}
