/**
 * Edición geométrica de muros (ADR §218): EXTEND, TRIM y CHAMFER estilo
 * AutoCAD como comandos del registry. La matemática vive en el módulo puro ya
 * testeado `geom-edit.ts` (Fase 67) — aquí solo se traduce muro⇄segmento
 * (línea central del box rotado) y se emiten operaciones move/create.
 */
import {
  chamferCorner,
  extendToLine,
  lineLineIntersection,
  trimAtCutter,
} from "../geom-edit";
import { normalizeDeg } from "../precision-input";
import type { Segment } from "../snap-engine";
import type {
  CadBox,
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import { error, findObjectByLabel, warning } from "./validators";

const isWall = (o: CadBox) =>
  o.type === "asset" &&
  (o.kind === "wall" || /\bmuro\b|\bwall\b/i.test(o.label));

/** Línea central del muro: a→b a lo largo de su eje largo (w) con rotación. */
export function wallToSegment(o: CadBox): Segment {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const rad = ((o.rotation ?? 0) * Math.PI) / 180;
  const dx = (Math.cos(rad) * o.w) / 2;
  const dy = (Math.sin(rad) * o.w) / 2;
  return { a: { x: cx - dx, y: cy - dy }, b: { x: cx + dx, y: cy + dy } };
}

/** Box del muro a partir de su nueva línea central (conserva grosor h). */
export function segmentToWall(seg: Segment, template: CadBox): CadBox {
  const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
  const cx = (seg.a.x + seg.b.x) / 2;
  const cy = (seg.a.y + seg.b.y) / 2;
  const angle = normalizeDeg(
    (Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180) / Math.PI,
  );
  return {
    ...template,
    x: Math.round(cx - len / 2),
    y: Math.round(cy - template.h / 2),
    w: Math.round(len),
    rotation: angle,
  };
}

/** Param t de un punto sobre la recta a→b (0=a, 1=b). */
function paramAlong(seg: Segment, p: { x: number; y: number }): number {
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const len2 = dx * dx + dy * dy || 1;
  return ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / len2;
}

/** Resuelve dos muros: por etiqueta explícita o los 2 primeros seleccionados. */
function resolveWallPair(
  context: CadCommandContext,
  labelA: string | undefined,
  labelB: string | undefined,
  objectIds: string[] | undefined,
  roles: [string, string],
): { a?: CadBox; b?: CadBox; issues: CadValidationIssue[] } {
  const issues: CadValidationIssue[] = [];
  const ids = objectIds?.length ? objectIds : context.selectedIds;
  const selectedWalls = ids
    .map((id) => context.objects.find((o) => o.id === id))
    .filter((o): o is CadBox => !!o && isWall(o));
  // La etiqueta manda; si no resuelve (los muros del editor suelen llamarse
  // todos "Muro"), cae a la selección — 2 muros seleccionados siempre funciona.
  const byLabel = (label?: string) => {
    if (!label) return undefined;
    const hit = findObjectByLabel(context, label);
    return hit && isWall(hit) ? hit : undefined;
  };
  const a = byLabel(labelA) ?? selectedWalls[0];
  const b = byLabel(labelB) ?? selectedWalls.find((w) => w.id !== a?.id);
  if (!a || !b)
    issues.push(
      error(
        "walls_required",
        `No identifiqué ${roles[0]} y ${roles[1]}: nómbralos como aparecen en el plano o selecciona 2 muros.`,
      ),
    );
  if (a && b && a.id === b.id)
    issues.push(error("walls_distinct", "Los dos muros deben ser distintos."));
  return { a, b, issues };
}

const empty = (summary: string, issues: CadValidationIssue[]): CadCommandPreview => ({
  summary,
  affectedObjectIds: [],
  operations: [],
  issues,
});

export function extendWallPreview(
  input: Extract<CadCommandInput, { id: "extend_wall" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const { a: target, b: boundary, issues } = resolveWallPair(
    context,
    input.target,
    input.boundary,
    input.objectIds,
    ["el muro a extender", "el muro frontera"],
  );
  if (!target || !boundary || issues.some((i) => i.level === "error"))
    return empty("Extender muro", issues);
  const seg = wallToSegment(target);
  const bseg = wallToSegment(boundary);
  const inter = lineLineIntersection(seg.a, seg.b, bseg.a, bseg.b);
  if (!inter)
    return empty("Extender muro", [
      ...issues,
      error("walls_parallel", "Los muros son paralelos: no hay hasta dónde extender."),
    ]);
  const t = paramAlong(seg, inter);
  if (t >= 0 && t <= 1)
    return empty("Extender muro", [
      ...issues,
      error("already_crossing", `${target.label} ya cruza a ${boundary.label}; usa recortar.`),
    ]);
  const extended = extendToLine(seg, t < 0 ? "a" : "b", bseg);
  if (!extended)
    return empty("Extender muro", [
      ...issues,
      error("walls_parallel", "Los muros son paralelos."),
    ]);
  const after = segmentToWall(extended, target);
  return {
    summary: `Extender ${target.label} hasta ${boundary.label} (${Math.round(after.w - target.w)} ${context.unit} más).`,
    affectedObjectIds: [target.id, boundary.id],
    operations: [{ type: "move", objectId: target.id, before: target, after }],
    issues,
  };
}

export function trimWallPreview(
  input: Extract<CadCommandInput, { id: "trim_wall" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const { a: target, b: cutter, issues } = resolveWallPair(
    context,
    input.target,
    input.cutter,
    input.objectIds,
    ["el muro a recortar", "el muro de corte"],
  );
  if (!target || !cutter || issues.some((i) => i.level === "error"))
    return empty("Recortar muro", issues);
  const seg = wallToSegment(target);
  const cseg = wallToSegment(cutter);
  const inter = lineLineIntersection(seg.a, seg.b, cseg.a, cseg.b);
  const t = inter ? paramAlong(seg, inter) : null;
  // sin keep explícito se conserva el lado más largo (heurística AutoCAD-NL)
  const keep = input.keep ?? (t !== null && t > 0.5 ? "start" : "end");
  const pick = keep === "start" ? seg.b : seg.a; // pick = el pedazo que se BORRA
  const trimmed = trimAtCutter(seg, cseg, pick);
  if (!trimmed)
    return empty("Recortar muro", [
      ...issues,
      error(
        "no_intersection",
        `${target.label} no cruza a ${cutter.label} dentro de sus tramos; usa extender primero.`,
      ),
    ]);
  const after = segmentToWall(trimmed, target);
  if (after.w < 1)
    return empty("Recortar muro", [
      ...issues,
      error("degenerate_wall", "El recorte dejaría el muro con longitud cero."),
    ]);
  return {
    summary: `Recortar ${target.label} en ${cutter.label} (conserva ${keep === "start" ? "el inicio" : "el final"}, queda ${after.w} ${context.unit}).`,
    affectedObjectIds: [target.id, cutter.id],
    operations: [{ type: "move", objectId: target.id, before: target, after }],
    issues,
  };
}

export function chamferWallsPreview(
  input: Extract<CadCommandInput, { id: "chamfer_walls" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const { a: wallA, b: wallB, issues } = resolveWallPair(
    context,
    input.wallA,
    input.wallB,
    input.objectIds,
    ["el primer muro", "el segundo muro"],
  );
  if (!Number.isFinite(input.distance) || input.distance <= 0)
    issues.push(error("invalid_distance", "La distancia del chaflán debe ser mayor a 0."));
  if (!wallA || !wallB || issues.some((i) => i.level === "error"))
    return empty("Chaflán entre muros", issues);
  const segA = wallToSegment(wallA);
  const segB = wallToSegment(wallB);
  const corner = lineLineIntersection(segA.a, segA.b, segB.a, segB.b);
  if (!corner)
    return empty("Chaflán entre muros", [
      ...issues,
      error("walls_parallel", "Los muros son paralelos: no forman esquina."),
    ]);
  // El extremo lejano de cada muro define la "pierna" que sobrevive.
  const farOf = (seg: Segment) => {
    const da = Math.hypot(seg.a.x - corner.x, seg.a.y - corner.y);
    const db = Math.hypot(seg.b.x - corner.x, seg.b.y - corner.y);
    return da >= db ? seg.a : seg.b;
  };
  const farA = farOf(segA);
  const farB = farOf(segB);
  const legA = Math.hypot(farA.x - corner.x, farA.y - corner.y);
  const legB = Math.hypot(farB.x - corner.x, farB.y - corner.y);
  if (input.distance >= legA || input.distance >= legB)
    return empty("Chaflán entre muros", [
      ...issues,
      error(
        "chamfer_too_big",
        `La distancia del chaflán (${input.distance}) no cabe en los muros.`,
      ),
    ]);
  const { trimA, trimB } = chamferCorner(corner, farA, farB, input.distance, input.distance);
  const afterA = segmentToWall({ a: farA, b: trimA }, wallA);
  const afterB = segmentToWall({ a: farB, b: trimB }, wallB);
  const chamferLen = Math.hypot(trimB.x - trimA.x, trimB.y - trimA.y);
  const chamferBox = segmentToWall({ a: trimA, b: trimB }, { ...wallA, label: "Chaflán" });
  const operations: CadOperation[] = [
    { type: "move", objectId: wallA.id, before: wallA, after: afterA },
    { type: "move", objectId: wallB.id, before: wallB, after: afterB },
    {
      type: "create",
      object: {
        sourceId: wallA.id,
        type: "asset",
        label: "Chaflán",
        x: chamferBox.x,
        y: chamferBox.y,
        w: chamferBox.w,
        h: chamferBox.h,
        rotation: chamferBox.rotation,
      },
    },
  ];
  const out: CadValidationIssue[] = [...issues];
  if (
    corner.x < 0 || corner.y < 0 ||
    corner.x > context.footprintW || corner.y > context.footprintH
  )
    out.push(
      warning("corner_outside", "La esquina de los muros cae fuera del plano."),
    );
  return {
    summary: `Chaflán de ${input.distance} ${context.unit} entre ${wallA.label} y ${wallB.label} (tramo nuevo de ${Math.round(chamferLen)}).`,
    affectedObjectIds: [wallA.id, wallB.id],
    operations,
    issues: out,
  };
}
