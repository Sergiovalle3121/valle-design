/**
 * Intercambiar (AXOS-CAD-SWAP-001): 'intercambia la mesa y el escritorio'
 * — los dos objetos cambian de lugar con dos moves rígidos (cada uno
 * conserva su tamaño y rotación; solo viajan los orígenes). Por nombres
 * a/b o con exactamente 2 seleccionados.
 */
import { matchObjectsByName } from "./targets";
import type {
  CadBox,
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

export function swapObjectsPreview(
  input: Extract<CadCommandInput, { id: "swap_objects" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const issues: CadValidationIssue[] = [];
  let first: CadBox | undefined;
  let second: CadBox | undefined;

  const nameA = input.a?.trim();
  const nameB = input.b?.trim();
  if (nameA && nameB) {
    const hitsA = matchObjectsByName(context, nameA);
    if (!hitsA.length) {
      issues.push(
        error("swap_target_not_found", `No encontré '${nameA}' en el plano.`),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    first = hitsA[0];
    const hitsB = matchObjectsByName(context, nameB).filter(
      (o) => o.id !== first!.id,
    );
    if (!hitsB.length) {
      issues.push(
        error("swap_target_not_found", `No encontré '${nameB}' en el plano.`),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    second = hitsB[0];
  } else {
    const ids = input.objectIds?.length ? input.objectIds : context.selectedIds;
    const objs = ids
      .map((id) => context.objects.find((o) => o.id === id))
      .filter((o): o is CadBox => !!o);
    if (objs.length !== 2) {
      issues.push(
        error(
          "swap_needs_two",
          "Dime cuáles dos ('intercambia la mesa y el escritorio') o selecciona exactamente 2 objetos.",
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    [first, second] = objs;
  }

  return {
    summary: `Intercambiar '${first!.label}' y '${second!.label}'.`,
    affectedObjectIds: [first!.id, second!.id],
    operations: [
      {
        type: "move",
        objectId: first!.id,
        before: first!,
        after: { ...first!, x: second!.x, y: second!.y },
      },
      {
        type: "move",
        objectId: second!.id,
        before: second!,
        after: { ...second!, x: first!.x, y: first!.y },
      },
    ],
    issues,
  };
}
