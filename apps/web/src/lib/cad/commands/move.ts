/**
 * Mover selección (AXOS-CAD-MOVE-001): el MOVE de AutoCAD, conversacional.
 * 'mueve la puerta a 2000,650' lleva el conjunto (su esquina superior
 * izquierda, como place_symbol) al punto absoluto; 'mueve la selección
 * 500 a la derecha' desplaza en relativo. El grupo viaja rígido: un solo
 * delta para todos los objetos.
 */
import { matchObjectsByName, resolveCommandTargets } from "./targets";
import type {
  CadBox,
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

const ANCHOR_GAP = 100;

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

  // Destino relacional (AXOS-CAD-MOVE-003): 'mueve la silla junto a la
  // mesa' — el conjunto aterriza al lado del ancla (excluyendo del ancla a
  // los propios objetos movidos).
  const anchorQuery = input.anchor?.trim();
  let anchorBox: CadBox | undefined;
  if (anchorQuery) {
    const movedIds = new Set(objs.map((o) => o.id));
    const anchors = matchObjectsByName(context, anchorQuery).filter(
      (a) => !movedIds.has(a.id),
    );
    if (!anchors.length) {
      issues.push(
        error(
          "move_anchor_not_found",
          `No encontré '${anchorQuery}' para mover junto a él.`,
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    anchorBox = anchors[0];
  }

  // Destino de zona (AXOS-CAD-MOVE-004): 'mete la mesa en la cocina' — el
  // conjunto aterriza centrado dentro del contenedor nombrado.
  const intoQuery = input.into?.trim();
  let intoBox: CadBox | undefined;
  if (intoQuery && !anchorBox) {
    const movedIds = new Set(objs.map((o) => o.id));
    const containers = matchObjectsByName(context, intoQuery).filter(
      (c) => !movedIds.has(c.id),
    );
    if (!containers.length) {
      issues.push(
        error(
          "move_into_not_found",
          `No encontré '${intoQuery}' para meter ahí el conjunto.`,
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    intoBox = containers[0];
  }

  const hasAbs = Number.isFinite(input.x) && Number.isFinite(input.y);
  const hasRel =
    (Number.isFinite(input.dx) && (input.dx as number) !== 0) ||
    (Number.isFinite(input.dy) && (input.dy as number) !== 0);
  if (!hasAbs && !hasRel && !input.center && !anchorBox && !intoBox) {
    issues.push(
      error(
        "move_missing_destination",
        "Dime a dónde: 'a 2000,650', '500 a la derecha', 'junto a la mesa', 'a la cocina' o 'céntrala'.",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  const minX = Math.min(...objs.map((o) => o.x));
  const minY = Math.min(...objs.map((o) => o.y));
  // 'centra la mesa' (AXOS-CAD-MOVE-002): el bounding box del conjunto al
  // centro del footprint — mismo delta rígido para todos.
  const maxX = Math.max(...objs.map((o) => o.x + o.w));
  const maxY = Math.max(...objs.map((o) => o.y + o.h));
  const side = input.anchorSide ?? "right";
  const anchorX = anchorBox
    ? side === "left"
      ? anchorBox.x - ANCHOR_GAP - (maxX - minX)
      : side === "right"
        ? anchorBox.x + anchorBox.w + ANCHOR_GAP
        : anchorBox.x
    : undefined;
  const anchorY = anchorBox
    ? side === "above"
      ? anchorBox.y - ANCHOR_GAP - (maxY - minY)
      : side === "below"
        ? anchorBox.y + anchorBox.h + ANCHOR_GAP
        : anchorBox.y
    : undefined;
  const dx = input.center
    ? Math.round(((context.footprintW ?? 10000) - (maxX - minX)) / 2 - minX)
    : hasAbs
      ? Math.round((input.x as number) - minX)
      : anchorX !== undefined
        ? Math.round(anchorX - minX)
        : intoBox
          ? Math.round(intoBox.x + (intoBox.w - (maxX - minX)) / 2 - minX)
          : Math.round(Number.isFinite(input.dx) ? (input.dx as number) : 0);
  const dy = input.center
    ? Math.round(((context.footprintH ?? 6000) - (maxY - minY)) / 2 - minY)
    : hasAbs
      ? Math.round((input.y as number) - minY)
      : anchorY !== undefined
        ? Math.round(anchorY - minY)
        : intoBox
          ? Math.round(intoBox.y + (intoBox.h - (maxY - minY)) / 2 - minY)
          : Math.round(Number.isFinite(input.dy) ? (input.dy as number) : 0);

  const operations: CadOperation[] = objs.map((o) => ({
    type: "move",
    objectId: o.id,
    before: o,
    after: { ...o, x: o.x + dx, y: o.y + dy },
  }));

  return {
    summary: input.center
      ? `Centrar ${objs.length} objeto(s) en el plano.`
      : hasAbs
        ? `Mover ${objs.length} objeto(s) a (${Math.round(input.x as number)}, ${Math.round(input.y as number)}).`
        : anchorBox
          ? `Mover ${objs.length} objeto(s) junto a '${anchorQuery}'.`
          : intoBox
            ? `Mover ${objs.length} objeto(s) dentro de '${intoQuery}'.`
            : `Mover ${objs.length} objeto(s) ${dx ? `${dx > 0 ? "+" : ""}${dx} en X` : ""}${dx && dy ? ", " : ""}${dy ? `${dy > 0 ? "+" : ""}${dy} en Y` : ""}.`,
    affectedObjectIds: objs.map((o) => o.id),
    operations,
    issues,
  };
}
