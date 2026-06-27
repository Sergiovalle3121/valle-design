import type { CadBox, CadCommandContext, CadValidationIssue } from "./types";

export function error(
  code: string,
  message: string,
  objectIds?: string[],
): CadValidationIssue {
  return { level: "error", code, message, objectIds };
}

export function warning(
  code: string,
  message: string,
  objectIds?: string[],
): CadValidationIssue {
  return { level: "warning", code, message, objectIds };
}

export function selectedObjects(
  context: CadCommandContext,
  objectIds?: string[],
  min = 1,
): { objects: CadBox[]; issues: CadValidationIssue[] } {
  const ids = objectIds?.length ? objectIds : context.selectedIds;
  const objects = ids
    .map((id) => context.objects.find((o) => o.id === id))
    .filter((o): o is CadBox => !!o);
  const issues: CadValidationIssue[] = [];
  if (objects.length < min)
    issues.push(
      error(
        "selection_too_small",
        min === 1
          ? "Selecciona al menos 1 objeto."
          : `Selecciona al menos ${min} objetos.`,
        ids,
      ),
    );
  return { objects, issues };
}

export function findObjectByLabel(
  context: CadCommandContext,
  label?: string,
): CadBox | undefined {
  const q = label?.trim().toLocaleLowerCase("es-MX");
  if (!q) return undefined;
  return context.objects.find(
    (o) =>
      o.label.toLocaleLowerCase("es-MX").includes(q) ||
      o.id.toLocaleLowerCase("es-MX") === q,
  );
}

export function validateDistance(distance: number): CadValidationIssue[] {
  return Number.isFinite(distance) && distance > 0
    ? []
    : [error("invalid_distance", "La holgura debe ser mayor a 0.")];
}

export function outOfBounds(box: CadBox, context: CadCommandContext): boolean {
  return (
    box.x < 0 ||
    box.y < 0 ||
    box.x + box.w > context.footprintW ||
    box.y + box.h > context.footprintH
  );
}

export function overlaps(a: CadBox, b: CadBox): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}
