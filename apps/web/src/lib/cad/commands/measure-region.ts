/**
 * Medición de regiones y zona envolvente (ADR §221): área, perímetro, centroide
 * y casco convexo de la selección — la matemática vive en los módulos puros ya
 * testeados `geom-measure.ts` (shoelace/hull/bbox, Fase 67/72) y
 * `dimension-format.ts` (presentación de medidas, Fase 73). Aquí solo se traduce
 * CadCommandInput → operaciones `report`/`create` con validación.
 */
import {
  boundingBox,
  convexHull,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
} from "../geom-measure";
import {
  formatArea,
  formatLength,
} from "../dimension-format";
import { rectGeometry } from "../snap-engine";
import type {
  CadBox,
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { matchObjectsByName } from "./targets";
import { error, findObjectByLabel, selectedObjects } from "./validators";

const empty = (summary: string, issues: CadValidationIssue[]): CadCommandPreview => ({
  summary,
  affectedObjectIds: [],
  operations: [],
  issues,
});

/** Área legible: mm² se presenta en m² (los mm² de una nave son ilegibles). */
function areaLabel(value: number, unit: string): string {
  if (unit === "mm") return formatArea(value / 1_000_000, { unit: "m", precision: 2, group: true });
  return formatArea(value, { unit: unit === "m" ? "m" : "mm", precision: 2, group: true });
}

function lengthLabel(value: number, unit: string): string {
  return formatLength(value, { unit: unit === "m" ? "m" : "mm", precision: 0, group: true });
}

function resolveObjects(
  input: { objectIds?: string[]; targetLabel?: string },
  context: CadCommandContext,
): { objects: CadBox[]; issues: CadValidationIssue[] } {
  if (input.targetLabel) {
    const obj = findObjectByLabel(context, input.targetLabel);
    return obj
      ? { objects: [obj], issues: [] }
      : {
          objects: [],
          issues: [
            error("target_not_found", `No encontré un objeto llamado ${input.targetLabel}.`),
          ],
        };
  }
  return selectedObjects(context, input.objectIds, 1);
}

export function measureAreaPreview(
  input: Extract<CadCommandInput, { id: "measure_area" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const { objects, issues } = resolveObjects(input, context);
  if (!objects.length || issues.some((i) => i.level === "error"))
    return empty("Medir área", issues);

  const unit = String(context.unit || "mm");
  const corners = objects.flatMap((o) => rectGeometry(o).corners);
  const rows: { label: string; value: string }[] = [];
  let focusIds = objects.map((o) => o.id);

  if (objects.length === 1) {
    const o = objects[0];
    rows.push(
      { label: "Objeto", value: o.label },
      { label: "Área", value: areaLabel(o.w * o.h, unit) },
      { label: "Perímetro", value: lengthLabel(2 * (o.w + o.h), unit) },
      { label: "Centro", value: `(${Math.round(o.x + o.w / 2)}, ${Math.round(o.y + o.h / 2)})` },
    );
  } else {
    const hull = convexHull(corners);
    const bbox = boundingBox(corners);
    const centroid = polygonCentroid(hull);
    rows.push(
      { label: "Objetos", value: String(objects.length) },
      { label: "Área del casco convexo", value: areaLabel(polygonArea(hull), unit) },
      { label: "Perímetro del casco", value: lengthLabel(polygonPerimeter(hull), unit) },
      { label: "Envolvente (bbox)", value: `${lengthLabel(bbox.w, unit)} × ${lengthLabel(bbox.h, unit)}` },
      { label: "Centroide", value: `(${Math.round(centroid.x)}, ${Math.round(centroid.y)})` },
    );
    focusIds = objects.map((o) => o.id);
  }

  const operations: CadOperation[] = [
    { type: "report", title: "Medición de región", rows },
    { type: "focus", objectIds: focusIds },
  ];
  return {
    summary:
      objects.length === 1
        ? `Área de ${objects[0].label}: ${areaLabel(objects[0].w * objects[0].h, unit)}.`
        : `Región de ${objects.length} objetos: ${areaLabel(polygonArea(convexHull(corners)), unit)} (casco convexo).`,
    affectedObjectIds: objects.map((o) => o.id),
    operations,
    issues,
  };
}

/**
 * Auto-acotado (ADR §225): cotas de tamaño (ancho/alto) por objeto y cotas de
 * hueco entre vecinos consecutivos en X — el trabajo mecánico de acotar un
 * plano que en AutoCAD es DIMLINEAR uno por uno.
 */
export function autoDimensionPreview(
  input: Extract<CadCommandInput, { id: "auto_dimension" }>,
  context: CadCommandContext,
): CadCommandPreview {
  // Objetivo por nombre (VD-CAD-NAME-005): 'acota las mesas'.
  const targetIds = input.target?.trim()
    ? matchObjectsByName(context, input.target).map((o) => o.id)
    : undefined;
  if (targetIds && !targetIds.length)
    return empty("Acotar selección", [
      error("target_not_found", `No encontré '${input.target?.trim()}' en el plano.`),
    ]);
  const { objects, issues } = selectedObjects(context, targetIds ?? input.objectIds, 1);
  if (objects.length > 30)
    issues.push(
      error("too_many_objects", "Máximo 30 objetos por acotado automático (selecciona menos)."),
    );
  if (!objects.length || issues.some((i) => i.level === "error"))
    return empty("Acotar selección", issues);

  const unit = String(context.unit || "mm");
  const mode = input.mode ?? "both";
  const off = Math.max(context.footprintW, context.footprintH) * 0.02;
  const dims: Extract<CadOperation, { type: "annotate" }>[] = [];
  if (mode !== "gaps") {
    for (const o of objects) {
      dims.push({
        type: "annotate",
        annotation: { kind: "dim", x: o.x, y: o.y + o.h + off, x2: o.x + o.w, y2: o.y + o.h + off, text: lengthLabel(o.w, unit) },
      });
      dims.push({
        type: "annotate",
        annotation: { kind: "dim", x: o.x + o.w + off, y: o.y, x2: o.x + o.w + off, y2: o.y + o.h, text: lengthLabel(o.h, unit) },
      });
    }
  }
  if (mode !== "size" && objects.length > 1) {
    const sorted = [...objects].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const gap = b.x - (a.x + a.w);
      if (gap <= 0) continue;
      const y = Math.max(a.y + a.h, b.y + b.h) + off * 1.5;
      dims.push({
        type: "annotate",
        annotation: { kind: "dim", x: a.x + a.w, y, x2: b.x, y2: y, text: lengthLabel(gap, unit) },
      });
    }
  }
  return {
    summary: `Crear ${dims.length} cota(s) para ${objects.length} objeto(s).`,
    affectedObjectIds: objects.map((o) => o.id),
    operations: dims,
    issues,
  };
}

export function createZoneAroundPreview(
  input: Extract<CadCommandInput, { id: "create_zone_around" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const { objects, issues } = selectedObjects(context, input.objectIds, 1);
  const margin = input.margin ?? 500;
  if (!Number.isFinite(margin) || margin < 0)
    issues.push(error("invalid_margin", "El margen de la zona debe ser ≥ 0."));
  if (!objects.length || issues.some((i) => i.level === "error"))
    return empty("Crear zona envolvente", issues);

  const corners = objects.flatMap((o) => rectGeometry(o).corners);
  const bbox = boundingBox(corners);
  const x = Math.max(0, bbox.minX - margin);
  const y = Math.max(0, bbox.minY - margin);
  const w = Math.min(context.footprintW, bbox.maxX + margin) - x;
  const h = Math.min(context.footprintH, bbox.maxY + margin) - y;
  if (w < 1 || h < 1)
    return empty("Crear zona envolvente", [
      ...issues,
      error("zone_degenerate", "La zona resultante queda sin tamaño dentro del plano."),
    ]);
  if (bbox.minX - margin < 0 || bbox.minY - margin < 0 || bbox.maxX + margin > context.footprintW || bbox.maxY + margin > context.footprintH)
    issues.push({
      level: "info",
      code: "zone_clipped",
      message: "La zona se recortó al borde del plano.",
    });

  const label = input.label?.trim() || `Zona de grupo (${objects.length})`;
  return {
    summary: `Crear zona ${lengthLabel(w, String(context.unit || "mm"))} × ${lengthLabel(h, String(context.unit || "mm"))} alrededor de ${objects.length} objeto(s) (margen ${margin}).`,
    affectedObjectIds: objects.map((o) => o.id),
    operations: [
      {
        type: "create",
        object: { type: "asset", kind: "zone", label, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), rotation: 0 },
      },
    ],
    issues,
  };
}
