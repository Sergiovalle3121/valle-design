import { getCadCommand } from "./registry";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadCommandResult,
} from "./types";
import { error } from "./validators";

const unknown = (input: CadCommandInput): CadCommandPreview => ({
  summary: `Comando ${input.id} no registrado.`,
  affectedObjectIds: [],
  operations: [],
  issues: [error("unknown_command", `Comando ${input.id} no registrado.`)],
});

export function previewCadCommand(
  input: CadCommandInput,
  context: CadCommandContext,
): CadCommandPreview {
  return getCadCommand(input.id)?.preview(input, context) ?? unknown(input);
}

export function executeCadCommand(
  input: CadCommandInput,
  context: CadCommandContext,
): CadCommandResult {
  const definition = getCadCommand(input.id);
  if (!definition)
    return {
      ...unknown(input),
      applied: false,
      historyLabel: `Comando ${input.id} no registrado.`,
    };
  const issues = definition.validate(input, context);
  if (issues.some((issue) => issue.level === "error")) {
    const preview = definition.preview(input, context);
    return {
      ...preview,
      issues,
      applied: false,
      historyLabel: preview.summary,
    };
  }
  return definition.execute(input, context);
}
