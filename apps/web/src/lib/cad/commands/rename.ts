/**
 * Renombrar (VD-CAD-RENAME-001): "renombra la mesa a 'Mesa VIP'". Solo
 * renombra la PRIMERA coincidencia (renombrar veinte objetos al mismo
 * nombre nunca es lo que se quiso); si hay más, lo avisa. Las estaciones
 * toman su nombre del routing — el estudio rechaza renombrarlas.
 */
import { matchObjectsByName } from "./targets";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadValidationIssue,
} from "./types";
import { error, warning } from "./validators";

export function renameObjectPreview(
  input: Extract<CadCommandInput, { id: "rename_object" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const issues: CadValidationIssue[] = [];
  const target = input.target?.trim() ?? "";
  const name = input.name?.trim() ?? "";
  if (!target || !name) {
    issues.push(
      error(
        "rename_input",
        "Dime qué y cómo: \"renombra la mesa a 'Mesa VIP'\".",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const matched = matchObjectsByName(context, target);
  if (!matched.length) {
    issues.push(
      error("rename_not_found", `No encontré '${target}' en el plano.`),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const first = matched[0];
  if (matched.length > 1) {
    issues.push(
      warning(
        "rename_multiple",
        `Hay ${matched.length} coincidencias con '${target}'; renombro la primera (${first.label}).`,
        [first.id],
      ),
    );
  }

  return {
    summary: `Renombrar '${first.label}' a '${name}'.`,
    affectedObjectIds: [first.id],
    operations: [{ type: "rename", objectId: first.id, label: name }],
    issues,
  };
}
