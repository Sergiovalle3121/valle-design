/**
 * Comandos de creación por patrón (ADR §214): arreglo rectangular, polar, a lo
 * largo del flujo y copia paralela (offset). La matemática vive en los módulos
 * puros ya testeados `cad-array.ts` / `geom-edit.ts` (Fases 67/73) — aquí solo
 * se traduce CadCommandInput → operaciones `create` con validación e issues.
 *
 * v1 duplica ASSETS (equipos/zonas/muros): las estaciones pertenecen al routing
 * y no se copian — el validador lo explica en vez de fallar en silencio.
 */
import { pathArray, polarArray, rectangularArray } from "../cad-array";
import { offsetSegment } from "../geom-edit";
import { normalizeDeg } from "../precision-input";
import { matchObjectsByName } from "./targets";
import type {
  CadBox,
  CadCommandContext,
  CadCommandInput,
  CadCommandPreview,
  CadOperation,
  CadValidationIssue,
} from "./types";
import {
  error,
  findObjectByLabel,
  outOfBounds,
  selectedObjects,
  warning,
} from "./validators";

const MAX_COPIES = 120;

/** Assets de la selección/objectIds; issue de error si no hay ninguno. */
function sourceAssets(
  context: CadCommandContext,
  objectIds?: string[],
): { assets: CadBox[]; issues: CadValidationIssue[] } {
  const { objects, issues } = selectedObjects(context, objectIds, 1);
  const assets = objects.filter((o) => o.type === "asset");
  if (objects.length && !assets.length)
    issues.push(
      error(
        "stations_not_copyable",
        "Solo los activos/equipos se pueden copiar; las estaciones vienen del routing.",
        objects.map((o) => o.id),
      ),
    );
  return { assets, issues };
}

function createOp(
  source: CadBox,
  x: number,
  y: number,
  rotation?: number,
): CadOperation {
  return {
    type: "create",
    object: {
      sourceId: source.id,
      type: "asset",
      label: source.label,
      x: Math.round(x),
      y: Math.round(y),
      w: source.w,
      h: source.h,
      rotation: rotation ?? source.rotation ?? 0,
    },
  };
}

/** Filtra las copias que caen fuera del plano; agrega warning con el conteo. */
function keepInBounds(
  ops: CadOperation[],
  context: CadCommandContext,
  issues: CadValidationIssue[],
): CadOperation[] {
  const kept = ops.filter(
    (op) =>
      op.type !== "create" ||
      !outOfBounds(
        { ...op.object, id: op.object.sourceId ?? "", type: "asset" },
        context,
      ),
  );
  const dropped = ops.length - kept.length;
  if (dropped > 0)
    issues.push(
      warning(
        "copies_out_of_bounds",
        `${dropped} copia(s) caían fuera del plano y se omitieron.`,
      ),
    );
  return kept;
}

const empty = (
  summary: string,
  issues: CadValidationIssue[],
): CadCommandPreview => ({
  summary,
  affectedObjectIds: [],
  operations: [],
  issues,
});

export function arrayRectangularPreview(
  input: Extract<CadCommandInput, { id: "array_rectangular" }>,
  context: CadCommandContext,
): CadCommandPreview {
  // Objetivo por nombre (VD-CAD-ARRAY-001): 'repite la silla 4 veces'.
  const targetQuery = input.target?.trim();
  let assets: CadBox[];
  let issues: CadValidationIssue[];
  if (targetQuery) {
    assets = matchObjectsByName(context, targetQuery).filter(
      (o) => o.type === "asset",
    );
    issues = assets.length
      ? []
      : [
          error(
            "array_target_not_found",
            `No encontré '${targetQuery}' para repetir en el plano.`,
          ),
        ];
  } else {
    ({ assets, issues } = sourceAssets(context, input.objectIds));
  }
  const cols = Math.floor(input.cols);
  const rows = Math.floor(input.rows);
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1)
    issues.push(
      error("invalid_grid", "Indica columnas y filas ≥ 1 (ej. 3x4)."),
    );
  else if (cols * rows < 2)
    issues.push(
      error(
        "invalid_grid",
        "El arreglo debe generar al menos 1 copia (≥ 1x2).",
      ),
    );
  else if ((cols * rows - 1) * assets.length > MAX_COPIES)
    issues.push(
      error(
        "too_many_copies",
        `El arreglo generaría más de ${MAX_COPIES} copias; reduce filas/columnas.`,
      ),
    );
  if (issues.some((i) => i.level === "error"))
    return empty(`Arreglo rectangular ${input.cols}×${input.rows}`, issues);

  const gapX = Math.max(0, input.gapX ?? 0);
  const gapY = Math.max(0, input.gapY ?? 0);
  const dirX = input.dirX ?? 1;
  const dirY = input.dirY ?? 1;
  const ops: CadOperation[] = [];
  for (const src of assets) {
    const items = rectangularArray(
      { x: src.x, y: src.y },
      { cols, rows, dx: (src.w + gapX) * dirX, dy: (src.h + gapY) * dirY },
    );
    // items[0] es la posición original — solo las copias se crean.
    for (const item of items.slice(1))
      ops.push(createOp(src, item.point.x, item.point.y));
  }
  const kept = keepInBounds(ops, context, issues);
  return {
    summary: `Crear ${kept.length} copia(s) en arreglo ${cols}×${rows} (paso ${gapX}/${gapY}).`,
    affectedObjectIds: assets.map((a) => a.id),
    operations: kept,
    issues,
  };
}

export function arrayPolarPreview(
  input: Extract<CadCommandInput, { id: "array_polar" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const { assets, issues } = sourceAssets(context, input.objectIds);
  const count = Math.floor(input.count);
  if (!Number.isFinite(count) || count < 2 || count > 36)
    issues.push(
      error("invalid_count", "El arreglo polar necesita entre 2 y 36 copias."),
    );
  if (assets.length > 1)
    issues.push(
      error(
        "single_source_required",
        "Selecciona exactamente 1 activo para el arreglo polar.",
        assets.map((a) => a.id),
      ),
    );
  const centerObj = input.centerLabel
    ? findObjectByLabel(context, input.centerLabel)
    : undefined;
  if (input.centerLabel && !centerObj)
    issues.push(
      error(
        "center_not_found",
        `No encontré un objeto llamado ${input.centerLabel}.`,
      ),
    );
  if (issues.some((i) => i.level === "error"))
    return empty("Arreglo polar", issues);

  const src = assets[0];
  const center = centerObj
    ? { x: centerObj.x + centerObj.w / 2, y: centerObj.y + centerObj.h / 2 }
    : { x: context.footprintW / 2, y: context.footprintH / 2 };
  if (!centerObj)
    issues.push({
      level: "info",
      code: "center_defaulted",
      message:
        "Centro no especificado: uso el centro del plano. Di 'alrededor de <objeto>' para otro centro.",
    });
  const srcCenter = { x: src.x + src.w / 2, y: src.y + src.h / 2 };
  if (Math.hypot(srcCenter.x - center.x, srcCenter.y - center.y) < 1)
    return empty("Arreglo polar", [
      ...issues,
      error(
        "zero_radius",
        "El activo está sobre el centro del arreglo; muévelo o elige otro centro.",
      ),
    ]);
  const items = polarArray(center, srcCenter, {
    count,
    angleSpanDeg: input.angleSpanDeg,
    rotateItems: input.rotateItems ?? true,
  });
  // items[0] es la posición original — solo las copias se crean.
  const ops = items
    .slice(1)
    .map((item) =>
      createOp(
        src,
        item.point.x - src.w / 2,
        item.point.y - src.h / 2,
        normalizeDeg((src.rotation ?? 0) + item.rotationDeg),
      ),
    );
  const kept = keepInBounds(ops, context, issues);
  return {
    summary: `Crear ${kept.length} copia(s) de ${src.label} en arreglo polar (${input.angleSpanDeg ?? 360}°).`,
    affectedObjectIds: [src.id, ...(centerObj ? [centerObj.id] : [])],
    operations: kept,
    issues,
  };
}

/** Ruta de flujo: cadena de conectores desde el eslabón sin antecesor. */
export function flowRoutePoints(context: CadCommandContext): CadBox[] {
  const connectors = context.connectors ?? [];
  if (!connectors.length) return [];
  const byId = new Map(context.objects.map((o) => [o.id, o]));
  const targets = new Set(connectors.map((c) => c.to));
  const start =
    connectors.find((c) => !targets.has(c.from))?.from ?? connectors[0].from;
  const route: CadBox[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = start;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const obj = byId.get(cursor);
    if (obj) route.push(obj);
    cursor = connectors.find((c) => c.from === cursor)?.to;
  }
  const last = cursor ? byId.get(cursor) : undefined;
  if (last && !visited.has(last.id)) route.push(last);
  return route;
}

export function offsetObjectPreview(
  input: Extract<CadCommandInput, { id: "offset_object" }>,
  context: CadCommandContext,
): CadCommandPreview {
  const { assets, issues } = sourceAssets(context, input.objectIds);
  if (!Number.isFinite(input.distance) || input.distance <= 0)
    issues.push(
      error("invalid_distance", "La distancia del offset debe ser mayor a 0."),
    );
  const copies = Math.floor(input.copies ?? 1);
  if (!Number.isFinite(copies) || copies < 1 || copies > 10)
    issues.push(error("invalid_count", "Entre 1 y 10 copias paralelas."));
  if (issues.some((i) => i.level === "error"))
    return empty("Copia paralela (offset)", issues);

  const sideVector: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const ops: CadOperation[] = [];
  for (const src of assets) {
    const rad = ((src.rotation ?? 0) * Math.PI) / 180;
    const cx = src.x + src.w / 2;
    const cy = src.y + src.h / 2;
    // Línea central del objeto a lo largo de su eje largo (convención de muros).
    const half = src.w / 2;
    const centerline = {
      a: { x: cx - half * Math.cos(rad), y: cy - half * Math.sin(rad) },
      b: { x: cx + half * Math.cos(rad), y: cy + half * Math.sin(rad) },
    };
    // offsetSegment: dist>0 desplaza hacia la normal (-sinθ, cosθ). El signo se
    // elige para que la copia vaya hacia el lado pedido; si el lado es paralelo
    // al objeto se avisa y se usa la normal positiva.
    const normal = { x: -Math.sin(rad), y: Math.cos(rad) };
    let sign = 1;
    if (input.side) {
      const v = sideVector[input.side];
      const dot = normal.x * v.x + normal.y * v.y;
      if (Math.abs(dot) < 0.01)
        issues.push(
          warning(
            "side_parallel",
            `El lado "${input.side}" es paralelo a ${src.label}; uso la normal del objeto.`,
            [src.id],
          ),
        );
      else sign = dot >= 0 ? 1 : -1;
    }
    for (let k = 1; k <= copies; k++) {
      const seg = offsetSegment(centerline, sign * input.distance * k);
      const mx = (seg.a.x + seg.b.x) / 2;
      const my = (seg.a.y + seg.b.y) / 2;
      ops.push(createOp(src, mx - src.w / 2, my - src.h / 2));
    }
  }
  const kept = keepInBounds(ops, context, issues);
  return {
    summary: `Crear ${kept.length} copia(s) paralela(s) a ${input.distance} ${context.unit}.`,
    affectedObjectIds: assets.map((a) => a.id),
    operations: kept,
    issues,
  };
}
