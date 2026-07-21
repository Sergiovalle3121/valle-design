/**
 * Transformaciones de selección (AXOS-CAD-XFORM-001): ROTATE y SCALE de
 * AutoCAD. Rotar gira los centros alrededor del pivote (centro del bounding
 * box del conjunto, o 'at' explícito) y suma el ángulo a la rotación de cada
 * objeto; escalar multiplica tamaños y distancias al pivote por el factor.
 * Ambos emiten moves con preview/undo del historial.
 */
import { normalizeDeg } from "../../../components/line-engineering/precision-input";
import type {
  CadBox,
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

function resolveSelection(
  input: { objectIds?: string[] },
  context: CadCommandContext,
): { objs: CadBox[]; issues: CadValidationIssue[] } {
  const issues: CadValidationIssue[] = [];
  const ids = input.objectIds?.length ? input.objectIds : context.selectedIds;
  const objs = ids
    .map((id) => context.objects.find((o) => o.id === id))
    .filter((o): o is CadBox => !!o);
  if (!objs.length) {
    issues.push(
      error(
        "transform_empty_selection",
        "Selecciona al menos un objeto para transformar.",
      ),
    );
  }
  return { objs, issues };
}

function selectionPivot(objs: CadBox[]): { x: number; y: number } {
  const minX = Math.min(...objs.map((o) => o.x));
  const maxX = Math.max(...objs.map((o) => o.x + o.w));
  const minY = Math.min(...objs.map((o) => o.y));
  const maxY = Math.max(...objs.map((o) => o.y + o.h));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function rotateSelectionPreview(
  input: Extract<CadCommandInput, { id: "rotate_selection" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const { objs, issues } = resolveSelection(input, context);
  if (!objs.length) {
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const angle = Number(input.angle);
  if (!Number.isFinite(angle) || angle === 0) {
    issues.push(
      error("rotate_invalid_angle", "Indica un ángulo distinto de cero."),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const pivot = selectionPivot(objs);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const operations: CadOperation[] = objs.map((o) => {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const dx = cx - pivot.x;
    const dy = cy - pivot.y;
    const ncx = pivot.x + dx * cos - dy * sin;
    const ncy = pivot.y + dx * sin + dy * cos;
    return {
      type: "move",
      objectId: o.id,
      before: o,
      after: {
        ...o,
        x: Math.round(ncx - o.w / 2),
        y: Math.round(ncy - o.h / 2),
        rotation: normalizeDeg((o.rotation ?? 0) + angle),
      },
    };
  });

  return {
    summary: `Rotación de ${angle}° a ${objs.length} objeto(s) alrededor del centro.`,
    affectedObjectIds: objs.map((o) => o.id),
    operations,
    issues,
  };
}

export function scaleSelectionPreview(
  input: Extract<CadCommandInput, { id: "scale_selection" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const { objs, issues } = resolveSelection(input, context);
  if (!objs.length) {
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const factor = Number(input.factor);
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
    issues.push(
      error(
        "scale_invalid_factor",
        "Indica un factor positivo distinto de 1 (p. ej. 2 o 0.5).",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }
  const pivot = selectionPivot(objs);

  const operations: CadOperation[] = objs.map((o) => {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const ncx = pivot.x + (cx - pivot.x) * factor;
    const ncy = pivot.y + (cy - pivot.y) * factor;
    const nw = Math.max(1, Math.round(o.w * factor));
    const nh = Math.max(1, Math.round(o.h * factor));
    return {
      type: "move",
      objectId: o.id,
      before: o,
      after: {
        ...o,
        x: Math.round(ncx - nw / 2),
        y: Math.round(ncy - nh / 2),
        w: nw,
        h: nh,
      },
    };
  });

  return {
    summary: `Escala ×${factor} a ${objs.length} objeto(s) desde el centro.`,
    affectedObjectIds: objs.map((o) => o.id),
    operations,
    issues,
  };
}
