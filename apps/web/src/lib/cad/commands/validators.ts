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

/**
 * ¿Alguno de los dos extremos de un trazo cae fuera del lote?
 *
 * Vive aquí y no junto al comando porque `outOfBounds` mide OTRA cosa: la caja
 * del objeto, que se guarda sin rotar y por eso da falsos positivos con un muro
 * vertical (su x arranca negativa por construcción). Los extremos no mienten. El
 * banco de calidad NL→CAD midió que «muro de 0,0 a 0,25000» sobre un lote de
 * 20 m se dibujaba entero y en silencio, y que un muro de 900 km se trazaba sin
 * pestañear; con la caja como criterio no se podían distinguir de un muro
 * legítimo.
 */
export function wallSegmentIssues(
  from: { x: number; y: number },
  to: { x: number; y: number },
  length: number,
  context: CadCommandContext,
): CadValidationIssue[] {
  const issues: CadValidationIssue[] = [];
  if (length <= 1)
    issues.push(error("wall_too_short", "El muro necesita dos puntos distintos."));
  const outside = [from, to].some(
    (point) =>
      point.x < 0 ||
      point.y < 0 ||
      point.x > context.footprintW ||
      point.y > context.footprintH,
  );
  if (outside)
    issues.push(
      error(
        "wall_endpoint_outside_plan",
        `El muro sale del plano (${context.footprintW}×${context.footprintH} ${context.unit}). Amplía el footprint o corrige las coordenadas.`,
      ),
    );
  return issues;
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
