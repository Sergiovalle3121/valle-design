import type {
  CadBox,
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

type CleanupInput = Extract<CadCommandInput, { id: "cleanup_geometry" }>;

function near(a: number, b: number, tolerance: number) {
  return Math.abs(a - b) <= tolerance;
}

function normalizedQuarterTurn(rotation: number) {
  const quarter = 90;
  return Math.round(rotation / quarter) * quarter;
}

function duplicate(a: CadBox, b: CadBox, tolerance: number) {
  return (
    a.type === b.type &&
    a.kind === b.kind &&
    near(a.x, b.x, tolerance) &&
    near(a.y, b.y, tolerance) &&
    near(a.w, b.w, tolerance) &&
    near(a.h, b.h, tolerance) &&
    near(
      a.rotation ?? 0,
      b.rotation ?? 0,
      Math.max(1e-6, tolerance / Math.max(1, a.w, a.h)),
    )
  );
}

/**
 * Governed cleanup: returns evidence and a deterministic change set. Preview is
 * pure; the editor applies the returned operations through the normal command
 * transaction and undo stack only after explicit confirmation.
 */
export function geometryCleanupPreview(
  input: CleanupInput,
  context: CadCommandContext,
): CadCommandPreview {
  const tolerance =
    input.tolerance ??
    Math.max(0.01, Math.min(5, Number(context.unit === "m" ? 0.001 : 1)));
  const angleTolerance = input.angleToleranceDeg ?? 1;
  const minLength = input.minLength ?? tolerance * 2;
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) {
    return {
      summary: "Limpiar geometría",
      affectedObjectIds: [],
      operations: [],
      issues: [
        error(
          "invalid_cleanup_tolerance",
          "La tolerancia de limpieza debe ser mayor que cero.",
        ),
      ],
    };
  }

  const requested = input.objectIds?.length
    ? new Set(input.objectIds)
    : new Set(context.selectedIds);
  const candidates = [...context.objects]
    .filter((object) => requested.size === 0 || requested.has(object.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const operations: CadOperation[] = [];
  const issues: CadValidationIssue[] = [];
  const deleted = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    const keep = candidates[i]!;
    if (deleted.has(keep.id)) continue;
    for (let j = i + 1; j < candidates.length; j++) {
      const remove = candidates[j]!;
      if (deleted.has(remove.id) || !duplicate(keep, remove, tolerance))
        continue;
      deleted.add(remove.id);
      operations.push({ type: "delete", objectId: remove.id });
      issues.push({
        level: "info",
        code: "duplicate_geometry",
        message: `"${remove.label}" duplica a "${keep.label}" dentro de tolerancia ${tolerance}; se propone conservar ${keep.id}.`,
        objectIds: [keep.id, remove.id],
      });
    }
  }

  for (const wall of candidates) {
    if (deleted.has(wall.id) || wall.kind !== "wall") continue;
    const rotation = wall.rotation ?? 0;
    const snapped = normalizedQuarterTurn(rotation);
    const delta = Math.abs(rotation - snapped);
    if (delta > 1e-12 && delta <= angleTolerance) {
      operations.push({
        type: "move",
        objectId: wall.id,
        before: wall,
        after: { ...wall, rotation: snapped },
      });
      issues.push({
        level: "info",
        code: "near_orthogonal",
        message: `"${wall.label}" está a ${delta.toFixed(3)}° de un eje; se propone ortogonalizar.`,
        objectIds: [wall.id],
      });
    }
    if (Math.max(wall.w, wall.h) < minLength) {
      issues.push({
        level: input.removeTiny ? "warning" : "info",
        code: "tiny_segment",
        message: `"${wall.label}" mide menos de ${minLength}; ${input.removeTiny ? "se propone eliminar" : "requiere revisión"}.`,
        objectIds: [wall.id],
      });
      if (input.removeTiny) {
        deleted.add(wall.id);
        operations.push({ type: "delete", objectId: wall.id });
      }
    }
  }

  const dedupedOperations = operations.filter(
    (operation, index, list) =>
      list.findIndex(
        (candidate) =>
          candidate.type === operation.type &&
          (candidate.type === "delete" && operation.type === "delete"
            ? candidate.objectId === operation.objectId
            : candidate.type === "move" &&
              operation.type === "move" &&
              candidate.objectId === operation.objectId),
      ) === index,
  );
  const affectedObjectIds = [
    ...new Set(
      dedupedOperations.flatMap((operation) =>
        operation.type === "delete" || operation.type === "move"
          ? [operation.objectId]
          : [],
      ),
    ),
  ].sort();

  return {
    summary: dedupedOperations.length
      ? `Limpieza geométrica: ${dedupedOperations.length} cambio(s) propuesto(s) sobre ${affectedObjectIds.length} entidad(es).`
      : `Limpieza geométrica: sin cambios dentro de tolerancia ${tolerance}.`,
    affectedObjectIds,
    operations: dedupedOperations,
    issues,
  };
}
