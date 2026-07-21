/**
 * Espejo de selección (AXOS-CAD-MIRROR-001): MIRROR de AutoCAD. Refleja los
 * objetos seleccionados sobre un eje vertical u horizontal; por default el
 * eje pasa por el centro del bounding box del conjunto (espejo "en sitio"
 * simétrico), o por la coordenada explícita `at`. Con `copy` (default, como
 * el flujo típico de MIRROR) emite creates "(espejo)" conservando los
 * originales; con copy:false mueve los objetos en sitio.
 */
import { normalizeDeg } from "../../../components/line-engineering/precision-input";
import { resolveCommandTargets } from "./targets";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { error } from "./validators";

export function mirrorSelectionPreview(
  input: Extract<CadCommandInput, { id: "mirror_selection" }>,
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
            "mirror_target_not_found",
            `No encontré '${input.target?.trim()}' en el plano.`,
          )
        : error(
            "mirror_empty_selection",
            "Selecciona al menos un objeto para espejar.",
          ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  const axis = input.axis ?? "vertical";
  const minX = Math.min(...objs.map((o) => o.x));
  const maxX = Math.max(...objs.map((o) => o.x + o.w));
  const minY = Math.min(...objs.map((o) => o.y));
  const maxY = Math.max(...objs.map((o) => o.y + o.h));
  const at =
    input.at ?? (axis === "vertical" ? (minX + maxX) / 2 : (minY + maxY) / 2);
  const copy = input.copy ?? true;

  const operations: CadOperation[] = objs.map((o) => {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const rot = o.rotation ?? 0;
    // Reflejo del centro y de la orientación: eje vertical (x=at) manda
    // θ → 180−θ; eje horizontal (y=at) manda θ → −θ.
    const ncx = axis === "vertical" ? 2 * at - cx : cx;
    const ncy = axis === "vertical" ? cy : 2 * at - cy;
    const nrot = normalizeDeg(axis === "vertical" ? 180 - rot : -rot);
    const nx = Math.round(ncx - o.w / 2);
    const ny = Math.round(ncy - o.h / 2);
    if (copy) {
      return {
        type: "create",
        object: {
          sourceId: o.id,
          kind: o.kind,
          type: o.type,
          label: `${o.label} (espejo)`,
          x: nx,
          y: ny,
          w: o.w,
          h: o.h,
          rotation: nrot,
        },
      };
    }
    return {
      type: "move",
      objectId: o.id,
      before: o,
      after: { ...o, x: nx, y: ny, rotation: nrot },
    };
  });

  return {
    summary: `Espejo ${axis === "vertical" ? "vertical" : "horizontal"} de ${objs.length} objeto(s)${copy ? " (con copia)" : " en sitio"}.`,
    affectedObjectIds: objs.map((o) => o.id),
    operations,
    issues,
  };
}
