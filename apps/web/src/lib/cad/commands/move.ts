/**
 * Mover selección (AXOS-CAD-MOVE-001): el MOVE de AutoCAD, conversacional.
 * 'mueve la puerta a 2000,650' lleva el conjunto (su esquina superior
 * izquierda, como place_symbol) al punto absoluto; 'mueve la selección
 * 500 a la derecha' desplaza en relativo. El grupo viaja rígido: un solo
 * delta para todos los objetos.
 */
import { resolveCommandTargets } from "./targets";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

export function moveSelectionPreview(
  input: Extract<CadCommandInput, { id: "move_selection" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const issues: CadValidationIssue[] = [];
  const { objs, usedTarget } = resolveCommandTargets(
    context,
    input.objectIds,
    input.target,
  );
  if (!objs.length) {
    issues.push(
      usedTarget
        ? error(
            "move_target_not_found",
            `No encontré '${input.target?.trim()}' en el plano.`,
          )
        : error(
            "move_empty_selection",
            "Selecciona al menos un objeto para mover.",
          ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  const hasAbs = Number.isFinite(input.x) && Number.isFinite(input.y);
  const hasRel =
    (Number.isFinite(input.dx) && (input.dx as number) !== 0) ||
    (Number.isFinite(input.dy) && (input.dy as number) !== 0);
  if (!hasAbs && !hasRel) {
    issues.push(
      error(
        "move_missing_destination",
        "Dime a dónde: 'a 2000,650' o '500 a la derecha'.",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  const minX = Math.min(...objs.map((o) => o.x));
  const minY = Math.min(...objs.map((o) => o.y));
  const dx = hasAbs
    ? Math.round((input.x as number) - minX)
    : Math.round(Number.isFinite(input.dx) ? (input.dx as number) : 0);
  const dy = hasAbs
    ? Math.round((input.y as number) - minY)
    : Math.round(Number.isFinite(input.dy) ? (input.dy as number) : 0);

  const operations: CadOperation[] = objs.map((o) => ({
    type: "move",
    objectId: o.id,
    before: o,
    after: { ...o, x: o.x + dx, y: o.y + dy },
  }));

  return {
    summary: hasAbs
      ? `Mover ${objs.length} objeto(s) a (${Math.round(input.x as number)}, ${Math.round(input.y as number)}).`
      : `Mover ${objs.length} objeto(s) ${dx ? `${dx > 0 ? "+" : ""}${dx} en X` : ""}${dx && dy ? ", " : ""}${dy ? `${dy > 0 ? "+" : ""}${dy} en Y` : ""}.`,
    affectedObjectIds: objs.map((o) => o.id),
    operations,
    issues,
  };
}
