/**
 * Duplicar selección (AXOS-CAD-DUP-001): el COPY de AutoCAD, conversacional.
 * "duplica la selección" o "copia esto a 800,0" emite creates con sourceId
 * (el estudio copia kind/etiqueta/capa del origen). Sin desplazamiento
 * explícito, la copia cae a +500,+500 mm para que no tape al original.
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

export function duplicateSelectionPreview(
  input: Extract<CadCommandInput, { id: "duplicate_selection" }>,
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
            "duplicate_target_not_found",
            `No encontré '${input.target?.trim()}' en el plano.`,
          )
        : error(
            "duplicate_empty_selection",
            "Selecciona al menos un objeto para duplicar.",
          ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  const hasExplicit =
    Number.isFinite(input.dx) || Number.isFinite(input.dy);
  let dx = Number.isFinite(input.dx) ? Math.round(input.dx as number) : 500;
  let dy = Number.isFinite(input.dy) ? Math.round(input.dy as number) : 500;
  // Copia a una zona (AXOS-CAD-DUP-002): 'duplica la mesa en la bodega'
  // — la copia aterriza centrada dentro del contenedor; un offset
  // explícito sigue ganando.
  const intoQuery = input.into?.trim();
  let intoBox: CadBox | undefined;
  if (intoQuery && !hasExplicit) {
    const dupIds = new Set(objs.map((o) => o.id));
    const containers = matchObjectsByName(context, intoQuery).filter(
      (c) => !dupIds.has(c.id),
    );
    if (!containers.length) {
      issues.push(
        error(
          "duplicate_into_not_found",
          `No encontré '${intoQuery}' para copiar ahí.`,
        ),
      );
      return { summary: "", affectedObjectIds: [], operations: [], issues };
    }
    intoBox = containers[0];
    const minX = Math.min(...objs.map((o) => o.x));
    const minY = Math.min(...objs.map((o) => o.y));
    const maxX = Math.max(...objs.map((o) => o.x + o.w));
    const maxY = Math.max(...objs.map((o) => o.y + o.h));
    dx = Math.round(intoBox.x + (intoBox.w - (maxX - minX)) / 2 - minX);
    dy = Math.round(intoBox.y + (intoBox.h - (maxY - minY)) / 2 - minY);
  }
  if (!intoBox && dx === 0 && dy === 0) {
    issues.push(
      error(
        "duplicate_zero_offset",
        "El desplazamiento no puede ser 0,0; dime a dónde va la copia (p. ej. 'a 800,0').",
      ),
    );
    return { summary: "", affectedObjectIds: [], operations: [], issues };
  }

  const operations: CadOperation[] = objs.map((o) => ({
    type: "create",
    object: {
      sourceId: o.id,
      kind: o.kind,
      type: o.type,
      label: `${o.label} (copia)`,
      x: o.x + dx,
      y: o.y + dy,
      w: o.w,
      h: o.h,
      rotation: o.rotation,
    },
  }));

  return {
    summary: intoBox
      ? `Duplicar ${objs.length} objeto(s) dentro de '${intoQuery}'.`
      : `Duplicar ${objs.length} objeto(s) con desplazamiento (${dx}, ${dy}).`,
    affectedObjectIds: objs.map((o) => o.id),
    operations,
    issues,
  };
}
