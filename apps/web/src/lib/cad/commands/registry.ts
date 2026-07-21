import type {
  CadBox,
  CadCommandDefinition,
  CadCommandInput,
  CadCommandPreview,
  CadCommandResult,
  CadConnectorInput,
  CadOperation,
} from "./types";
import { measureBoxes, measurementLabel } from "../measurements";
import { detectCadCollisions } from "../collisions";
import { scoreFlowLayout } from "../flow-optimization";
import { buildCadLineBalanceReport } from "../line-balance";
import { buildCadMaterialRouteReport } from "../material-flow-route";
import { buildCadValidationReport } from "../validation-report";
import {
  error,
  findObjectByLabel,
  outOfBounds,
  selectedObjects,
  validateDistance,
  warning,
} from "./validators";
import {
  arrayAlongFlowPreview,
  arrayPolarPreview,
  arrayRectangularPreview,
  offsetObjectPreview,
} from "./create-patterns";
import {
  autoDimensionPreview,
  createZoneAroundPreview,
  measureAreaPreview,
} from "./measure-region";
import {
  chamferWallsPreview,
  extendWallPreview,
  trimWallPreview,
} from "./wall-edit";
import { deleteSelectionPreview } from "./delete";
import { duplicateSelectionPreview } from "./duplicate";
import { addLabelPreview } from "./label";
import { mirrorSelectionPreview } from "./mirror";
import { placeSymbolPreview } from "./place-symbol";
import {
  rotateSelectionPreview,
  scaleSelectionPreview,
} from "./transform";

const ok = (issues: ReturnType<CadCommandDefinition["validate"]>) =>
  !issues.some((i) => i.level === "error");
const result = (
  preview: CadCommandPreview,
  applied: boolean,
  historyLabel: string,
): CadCommandResult => ({ ...preview, applied, historyLabel });
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const bySequence = (xs: CadBox[]) =>
  [...xs].sort(
    (a, b) =>
      (a.sequence ?? 0) - (b.sequence ?? 0) || a.label.localeCompare(b.label),
  );

function clearancePreview(
  input: Extract<CadCommandInput, { id: "create_clearance_aisle" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const issues = validateDistance(input.distance);
  const a = findObjectByLabel(context, input.targetA);
  const b = findObjectByLabel(context, input.targetB);
  if (!a || !b)
    issues.push(
      error(
        "target_not_found",
        !a
          ? `No encontré un objeto llamado ${input.targetA ?? "origen"}.`
          : `No encontré un objeto llamado ${input.targetB ?? "destino"}.`,
      ),
    );
  if (!a || !b)
    return {
      summary: "Crear pasillo",
      affectedObjectIds: [],
      operations: [],
      issues,
    };
  const axis = input.axis ?? "x";
  const after = { ...b };
  if (axis === "x")
    after.x =
      a.x <= b.x ? a.x + a.w + input.distance : a.x - b.w - input.distance;
  else
    after.y =
      a.y <= b.y ? a.y + a.h + input.distance : a.y - b.h - input.distance;
  if (outOfBounds(after, context))
    issues.push(
      warning(
        "out_of_bounds",
        "La operación deja el objeto fuera del plano; la UI deberá limitar el movimiento.",
        [b.id],
      ),
    );
  return {
    summary: `Crear pasillo de ${input.distance}${input.unit ?? context.unit} entre ${a.label} y ${b.label}.`,
    affectedObjectIds: [a.id, b.id],
    operations: [{ type: "move", objectId: b.id, before: b, after }],
    issues,
  };
}

function alignPreview(
  input: Extract<CadCommandInput, { id: "align_selection" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const { objects, issues } = selectedObjects(context, input.objectIds, 2);
  if (!objects.length)
    return {
      summary: "Alinear selección",
      affectedObjectIds: [],
      operations: [],
      issues,
    };
  const minX = Math.min(...objects.map((o) => o.x));
  const maxX = Math.max(...objects.map((o) => o.x + o.w));
  const minY = Math.min(...objects.map((o) => o.y));
  const maxY = Math.max(...objects.map((o) => o.y + o.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const operations: CadOperation[] = objects.map((o) => {
    const after = { ...o };
    if (input.mode === "left") after.x = minX;
    if (input.mode === "right") after.x = maxX - o.w;
    if (input.mode === "center") after.x = Math.round(cx - o.w / 2);
    if (input.mode === "top") after.y = minY;
    if (input.mode === "bottom") after.y = maxY - o.h;
    if (input.mode === "middle") after.y = Math.round(cy - o.h / 2);
    return { type: "move", objectId: o.id, before: o, after };
  });
  return {
    summary: `Alinear ${objects.length} objetos (${input.mode}).`,
    affectedObjectIds: objects.map((o) => o.id),
    operations,
    issues,
  };
}

function distributePreview(
  input: Extract<CadCommandInput, { id: "distribute_selection" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const { objects, issues } = selectedObjects(context, input.objectIds, 3);
  const horizontal = input.axis === "horizontal";
  const sorted = [...objects].sort((a, b) =>
    horizontal ? a.x - b.x : a.y - b.y,
  );
  const start = horizontal ? sorted[0]?.x : sorted[0]?.y;
  if (sorted.length < 3 || start == null)
    return {
      summary: "Distribuir selección",
      affectedObjectIds: objects.map((o) => o.id),
      operations: [],
      issues,
    };
  const endEdge = horizontal
    ? sorted[sorted.length - 1].x + sorted[sorted.length - 1].w
    : sorted[sorted.length - 1].y + sorted[sorted.length - 1].h;
  const total = sorted.reduce((sum, o) => sum + (horizontal ? o.w : o.h), 0);
  const gap = (endEdge - start - total) / (sorted.length - 1);
  let cursor = start;
  const operations: CadOperation[] = sorted.map((o) => {
    const after = { ...o };
    if (horizontal) after.x = Math.round(cursor);
    else after.y = Math.round(cursor);
    cursor += (horizontal ? o.w : o.h) + gap;
    return { type: "move", objectId: o.id, before: o, after };
  });
  return {
    summary: `Distribuir ${objects.length} objetos en ${input.axis}.`,
    affectedObjectIds: objects.map((o) => o.id),
    operations,
    issues,
  };
}

function flowObjects(
  input: { objectIds?: string[] },
  context: Parameters<CadCommandDefinition["preview"]>[1],
) {
  const explicit = input.objectIds?.length
    ? input.objectIds
    : context.selectedIds;
  const objects = explicit.length
    ? explicit
        .map((id) => context.objects.find((o) => o.id === id))
        .filter((o): o is CadBox => !!o)
    : context.objects.filter((o) => o.type === "station");
  return bySequence(objects);
}

function flowScoreRows(objects: CadBox[]): { label: string; value: string }[] {
  const score = scoreFlowLayout(
    objects.map((object) => ({
      id: object.id,
      label: object.label,
      x: object.x + object.w / 2,
      y: object.y + object.h / 2,
    })),
  );
  return [
    { label: "Score", value: `${score.score}/100` },
    {
      label: "Distancia total",
      value: `${Math.round(score.totalDistance)} mm`,
    },
    { label: "Cruces", value: String(score.crossingCount) },
    { label: "Backtracking", value: String(score.backtrackingCount) },
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function flowScore(objects: CadBox[]) {
  return scoreFlowLayout(
    objects.map((object) => ({
      id: object.id,
      label: object.label,
      x: object.x + object.w / 2,
      y: object.y + object.h / 2,
    })),
  );
}

function arrangeFlowLinePreview(
  input: Extract<CadCommandInput, { id: "arrange_flow_line" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const objects = flowObjects(input, context);
  const issues =
    objects.length >= 2
      ? []
      : [
          error(
            "selection_too_small",
            "Selecciona al menos 2 objetos para crear una linea de flujo.",
          ),
        ];
  if (objects.length < 2)
    return {
      summary: "Acomodar linea de flujo",
      affectedObjectIds: objects.map((object) => object.id),
      operations: [],
      issues,
    };

  const direction = input.direction ?? "left_to_right";
  const gap = Math.max(0, input.gap ?? 500);
  const margin = Math.max(0, input.margin ?? 500);
  const hasFootprint = context.footprintW > 0 && context.footprintH > 0;
  const cursor = { x: margin, y: margin };
  const moveOps: CadOperation[] = [];
  let clipped = false;

  for (const object of objects) {
    const after = { ...object };
    if (direction === "top_to_bottom") {
      after.x = hasFootprint
        ? clamp(margin, 0, Math.max(0, context.footprintW - object.w))
        : margin;
      after.y = hasFootprint
        ? clamp(cursor.y, 0, Math.max(0, context.footprintH - object.h))
        : cursor.y;
      clipped ||= hasFootprint && after.y !== cursor.y;
      cursor.y += object.h + gap;
    } else {
      after.x = hasFootprint
        ? clamp(cursor.x, 0, Math.max(0, context.footprintW - object.w))
        : cursor.x;
      after.y = hasFootprint
        ? clamp(margin, 0, Math.max(0, context.footprintH - object.h))
        : margin;
      clipped ||= hasFootprint && after.x !== cursor.x;
      cursor.x += object.w + gap;
    }
    moveOps.push({ type: "move", objectId: object.id, before: object, after });
  }

  if (clipped)
    issues.push(
      warning(
        "flow_line_clipped",
        "La linea no cabe completa en el footprint; algunas posiciones fueron limitadas.",
        objects.map((object) => object.id),
      ),
    );

  const arranged = moveOps
    .map((op) => (op.type === "move" ? op.after : null))
    .filter((box): box is CadBox => !!box);
  const before = flowScore(objects);
  const after = flowScore(arranged);
  const connectOps: CadOperation[] = objects
    .slice(0, -1)
    .map((object, idx) => ({
      type: "connect",
      from: object.id,
      to: objects[idx + 1].id,
      kind: "flow",
    }));
  const report: CadOperation = {
    type: "report",
    title: "Linea de flujo",
    rows: [
      { label: "Objetos", value: String(objects.length) },
      {
        label: "Direccion",
        value: direction === "top_to_bottom" ? "Vertical" : "Horizontal",
      },
      { label: "Separacion", value: `${Math.round(gap)} mm` },
      { label: "Score antes", value: `${before.score}/100` },
      { label: "Score despues", value: `${after.score}/100` },
      {
        label: "Distancia despues",
        value: `${Math.round(after.totalDistance)} mm`,
      },
    ],
  };

  return {
    summary: `Acomodar y conectar ${objects.length} objetos como linea de flujo.`,
    affectedObjectIds: objects.map((object) => object.id),
    operations: [...moveOps, ...connectOps, report],
    issues,
  };
}

const RACK_LABEL = /rack|estante|warehouse|almacen|supermarket|pallet|tarima/i;

function spatialOrder(a: CadBox, b: CadBox): number {
  return a.y - b.y || a.x - b.x || a.label.localeCompare(b.label);
}

function rackObjects(
  input: { objectIds?: string[] },
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadBox[] {
  const explicit = input.objectIds?.length
    ? input.objectIds
    : context.selectedIds;
  if (explicit.length)
    return explicit
      .map((id) => context.objects.find((object) => object.id === id))
      .filter((object): object is CadBox => !!object);
  return context.objects
    .filter((object) => RACK_LABEL.test(`${object.id} ${object.label}`))
    .sort(spatialOrder);
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number.isFinite(value)
    ? Math.trunc(value as number)
    : fallback;
  return Math.max(min, Math.min(max, parsed));
}

function arrangeRackRowsPreview(
  input: Extract<CadCommandInput, { id: "arrange_rack_rows" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const objects = rackObjects(input, context);
  const issues =
    objects.length >= 2
      ? []
      : [
          error(
            "selection_too_small",
            "Selecciona al menos 2 racks/equipos para acomodar filas de almacen.",
          ),
        ];
  if (objects.length < 2)
    return {
      summary: "Acomodar filas de racks",
      affectedObjectIds: objects.map((object) => object.id),
      operations: [],
      issues,
    };

  const orientation = input.orientation ?? "horizontal";
  const defaultRows = objects.length > 6 ? 2 : 1;
  const rows = clampInteger(input.rows, 1, objects.length, defaultRows);
  let baysPerRow = clampInteger(
    input.baysPerRow,
    1,
    objects.length,
    Math.ceil(objects.length / rows),
  );
  if (rows * baysPerRow < objects.length) {
    baysPerRow = Math.ceil(objects.length / rows);
    issues.push(
      warning(
        "rack_row_capacity_expanded",
        "La capacidad indicada no alcanza; se aumento el numero de bahias por fila.",
        objects.map((object) => object.id),
      ),
    );
  }

  const aisleWidth = Math.max(0, input.aisleWidth ?? 3000);
  const bayGap = Math.max(0, input.bayGap ?? 100);
  const margin = Math.max(0, input.margin ?? 500);
  const hasFootprint = context.footprintW > 0 && context.footprintH > 0;
  const moveOps: CadOperation[] = [];
  let clipped = false;
  let cursor = 0;
  const grouped: CadBox[][] = [];
  while (cursor < objects.length) {
    grouped.push(objects.slice(cursor, cursor + baysPerRow));
    cursor += baysPerRow;
  }

  if (orientation === "vertical") {
    let x = margin;
    for (const row of grouped) {
      let y = margin;
      const columnWidth = Math.max(...row.map((object) => object.w));
      for (const object of row) {
        const target = { x, y };
        const after = { ...object };
        after.x = hasFootprint
          ? clamp(target.x, 0, Math.max(0, context.footprintW - object.w))
          : target.x;
        after.y = hasFootprint
          ? clamp(target.y, 0, Math.max(0, context.footprintH - object.h))
          : target.y;
        clipped ||=
          hasFootprint && (after.x !== target.x || after.y !== target.y);
        moveOps.push({
          type: "move",
          objectId: object.id,
          before: object,
          after,
        });
        y += object.h + bayGap;
      }
      x += columnWidth + aisleWidth;
    }
  } else {
    let y = margin;
    for (const row of grouped) {
      let x = margin;
      const rowHeight = Math.max(...row.map((object) => object.h));
      for (const object of row) {
        const target = { x, y };
        const after = { ...object };
        after.x = hasFootprint
          ? clamp(target.x, 0, Math.max(0, context.footprintW - object.w))
          : target.x;
        after.y = hasFootprint
          ? clamp(target.y, 0, Math.max(0, context.footprintH - object.h))
          : target.y;
        clipped ||=
          hasFootprint && (after.x !== target.x || after.y !== target.y);
        moveOps.push({
          type: "move",
          objectId: object.id,
          before: object,
          after,
        });
        x += object.w + bayGap;
      }
      y += rowHeight + aisleWidth;
    }
  }

  if (clipped)
    issues.push(
      warning(
        "rack_rows_clipped",
        "Las filas no caben completas en el footprint; algunas posiciones fueron limitadas.",
        objects.map((object) => object.id),
      ),
    );

  const report: CadOperation = {
    type: "report",
    title: "Filas de racks",
    rows: [
      { label: "Objetos", value: String(objects.length) },
      { label: "Filas", value: String(grouped.length) },
      { label: "Bahias/fila", value: String(baysPerRow) },
      {
        label: "Orientacion",
        value: orientation === "vertical" ? "Vertical" : "Horizontal",
      },
      { label: "Pasillo", value: `${Math.round(aisleWidth)} mm` },
      { label: "Separacion bahias", value: `${Math.round(bayGap)} mm` },
    ],
  };

  return {
    summary: `Acomodar ${objects.length} racks/equipos en ${grouped.length} fila(s).`,
    affectedObjectIds: objects.map((object) => object.id),
    operations: [...moveOps, report],
    issues,
  };
}

function lineBalanceObjects(
  input: { objectIds?: string[] },
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadBox[] {
  const explicit = input.objectIds?.length
    ? input.objectIds
    : context.selectedIds;
  const objects = explicit.length
    ? explicit
        .map((id) => context.objects.find((object) => object.id === id))
        .filter((object): object is CadBox => !!object)
    : context.objects.filter((object) => object.type === "station");
  return bySequence(objects);
}

function fmtSeconds(value: number | undefined): string {
  return value == null ? "Sin dato" : `${Math.round(value * 10) / 10}s`;
}

function analyzeLineBalancePreview(
  input: Extract<CadCommandInput, { id: "analyze_line_balance" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const objects = lineBalanceObjects(input, context);
  const issues =
    objects.length >= 2
      ? []
      : [
          error(
            "selection_too_small",
            "Selecciona al menos 2 estaciones para analizar balanceo.",
          ),
        ];
  const report = buildCadLineBalanceReport({
    taktTimeSec: input.taktTimeSec,
    stations: objects.map((object) => ({
      id: object.id,
      label: object.label,
      cycleTimeSec: input.cycleTimes?.[object.id],
    })),
  });

  if (objects.length >= 2 && report.missingStationIds.length)
    issues.push(
      warning(
        "line_balance_cycle_times_missing",
        `Faltan tiempos de ciclo en ${report.missingStationIds.length} estacion(es).`,
        report.missingStationIds,
      ),
    );
  if (objects.length >= 2 && report.overloadedStationIds.length)
    issues.push(
      warning(
        "line_balance_over_takt",
        `${report.overloadedStationIds.length} estacion(es) exceden el takt.`,
        report.overloadedStationIds,
      ),
    );
  if (objects.length >= 2 && !report.taktTimeSec)
    issues.push(
      warning(
        "line_balance_takt_missing",
        "No se indico takt; el reporte usa el cuello de botella como referencia.",
        objects.map((object) => object.id),
      ),
    );

  const rows = [
    { label: "Score", value: `${report.balanceScore}/100` },
    {
      label: "Cuello de botella",
      value: report.bottleneck
        ? `${report.bottleneck.label} (${fmtSeconds(report.bottleneck.cycleTimeSec)})`
        : "Sin tiempos",
    },
    {
      label: "Sobre takt",
      value: String(report.overloadedStationIds.length),
    },
    { label: "Takt", value: fmtSeconds(report.taktTimeSec) },
    {
      label: "Estaciones medidas",
      value: `${report.measuredStationCount}/${report.stationCount}`,
    },
    {
      label: "Carga maxima",
      value:
        report.maxLoadPercent == null
          ? "Sin dato"
          : `${report.maxLoadPercent}%`,
    },
    {
      label: "Eficiencia",
      value:
        report.balanceEfficiencyPercent == null
          ? "Sin dato"
          : `${report.balanceEfficiencyPercent}%`,
    },
    {
      label: "Recomendacion",
      value: report.recommendations[0] ?? "Sin recomendacion",
    },
  ];

  return {
    summary: `Analizar balanceo de ${objects.length} estacion(es).`,
    affectedObjectIds: objects.map((object) => object.id),
    operations:
      objects.length >= 2
        ? [{ type: "report", title: "Balanceo de linea", rows }]
        : [],
    issues,
  };
}

function materialRouteObjects(
  input: { objectIds?: string[] },
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadBox[] {
  const explicit = input.objectIds?.length
    ? input.objectIds
    : context.selectedIds;
  if (explicit.length) {
    return explicit
      .map((id) => context.objects.find((object) => object.id === id))
      .filter((object): object is CadBox => !!object);
  }
  const connectorIds = uniq(
    (context.connectors ?? []).flatMap((connector) => [
      connector.from,
      connector.to,
    ]),
  );
  if (connectorIds.length) {
    return connectorIds
      .map((id) => context.objects.find((object) => object.id === id))
      .filter((object): object is CadBox => !!object);
  }
  return bySequence(
    context.objects.filter((object) => object.type === "station"),
  );
}

function fmtDistanceMm(value: number | undefined): string {
  return value == null ? "Sin dato" : `${Math.round(value)} mm`;
}

function traceMaterialRoutePreview(
  input: Extract<CadCommandInput, { id: "trace_material_route" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const objects = materialRouteObjects(input, context);
  const issues =
    objects.length >= 2
      ? []
      : [
          error(
            "selection_too_small",
            "Selecciona al menos 2 objetos o crea conectores de flujo/material.",
          ),
        ];
  if (objects.length < 2)
    return {
      summary: "Trazar ruta material",
      affectedObjectIds: objects.map((object) => object.id),
      operations: [],
      issues,
    };

  const selectedIds = input.objectIds?.length
    ? input.objectIds
    : context.selectedIds.length
      ? context.selectedIds
      : undefined;
  const report = buildCadMaterialRouteReport({
    selectedIds,
    connectors: context.connectors,
    nodes: objects.map((object) => ({
      id: object.id,
      label: object.label,
      x: object.x + object.w / 2,
      y: object.y + object.h / 2,
    })),
  });

  if (report.connectorCount === 0)
    issues.push(
      warning(
        "material_route_no_connectors",
        "No hay conectores flow/material; se uso la secuencia de objetos.",
        report.routeNodeIds,
      ),
    );
  if (report.missingConnectorRefs.length)
    issues.push(
      warning(
        "material_route_missing_refs",
        `${report.missingConnectorRefs.length} endpoint(s) de conector no existen en el layout.`,
      ),
    );
  if (report.flow.crossingCount)
    issues.push(
      warning(
        "material_route_crossings",
        `${report.flow.crossingCount} cruce(s) de ruta material detectados.`,
        report.routeNodeIds,
      ),
    );
  if (report.flow.backtrackingCount)
    issues.push(
      warning(
        "material_route_backtracking",
        `${report.flow.backtrackingCount} tramo(s) con backtracking.`,
        report.routeNodeIds,
      ),
    );

  const rows = [
    { label: "Objetos ruta", value: String(report.nodeCount) },
    { label: "Tramos", value: String(report.legCount) },
    { label: "Conectores usados", value: String(report.connectorCount) },
    { label: "Distancia total", value: fmtDistanceMm(report.totalDistance) },
    {
      label: "Tramo mas largo",
      value: report.longestLeg
        ? `${report.longestLeg.fromLabel} -> ${report.longestLeg.toLabel} (${fmtDistanceMm(report.longestLeg.distance)})`
        : "Sin dato",
    },
    { label: "Cruces", value: String(report.flow.crossingCount) },
    { label: "Backtracking", value: String(report.flow.backtrackingCount) },
    { label: "Score", value: `${report.flow.score}/100` },
    ...report.legs.slice(0, 4).map((leg) => ({
      label: `${leg.fromLabel} -> ${leg.toLabel}`,
      value: fmtDistanceMm(leg.distance),
    })),
  ];

  return {
    summary: `Trazar ruta material de ${report.nodeCount} objeto(s): ${fmtDistanceMm(report.totalDistance)}.`,
    affectedObjectIds: report.routeNodeIds,
    operations: [{ type: "report", title: "Ruta material", rows }],
    issues,
  };
}

function drawWallSegmentPreview(
  input: Extract<CadCommandInput, { id: "draw_wall_segment" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const thickness = Math.max(1, input.thickness ?? 120);
  const dx = input.to.x - input.from.x;
  const dy = input.to.y - input.from.y;
  const len = Math.hypot(dx, dy);
  const issues =
    len > 1
      ? []
      : [error("wall_too_short", "El muro necesita dos puntos distintos.")];
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const object = {
    type: "asset" as const,
    kind: "wall",
    label: input.label ?? "Muro CAD",
    x: input.from.x + dx / 2 - len / 2,
    y: input.from.y + dy / 2 - thickness / 2,
    w: len,
    h: thickness,
    rotation: angle,
  };
  if (outOfBounds({ id: "draft-wall", ...object }, context))
    issues.push(
      warning(
        "wall_out_of_bounds",
        "El muro queda parcial o totalmente fuera del footprint.",
      ),
    );
  return {
    summary: `Dibujar muro de ${Math.round(len)} ${context.unit}.`,
    affectedObjectIds: [],
    operations: len > 1 ? [{ type: "create", object }] : [],
    issues,
  };
}

function drawRectZonePreview(
  input: Extract<CadCommandInput, { id: "draw_rect_zone" }>,
  context: Parameters<CadCommandDefinition["preview"]>[1],
): CadCommandPreview {
  const x = Math.min(input.from.x, input.to.x);
  const y = Math.min(input.from.y, input.to.y);
  const w = Math.abs(input.to.x - input.from.x);
  const h = Math.abs(input.to.y - input.from.y);
  const kind = input.kind ?? "zone";
  const issues =
    w > 1 && h > 1
      ? []
      : [
          error(
            "rect_too_small",
            "El rectángulo necesita ancho y alto mayores a cero.",
          ),
        ];
  const object = {
    type: "asset" as const,
    kind,
    label: input.label ?? (kind === "room" ? "Room CAD" : "Zona CAD"),
    x,
    y,
    w,
    h,
    rotation: 0,
  };
  if (outOfBounds({ id: "draft-rect", ...object }, context))
    issues.push(
      warning(
        "rect_out_of_bounds",
        "El rectángulo queda parcial o totalmente fuera del footprint.",
      ),
    );
  return {
    summary: `Dibujar ${kind === "room" ? "room" : "zona"} ${Math.round(w)}×${Math.round(h)} ${context.unit}.`,
    affectedObjectIds: [],
    operations: w > 1 && h > 1 ? [{ type: "create", object }] : [],
    issues,
  };
}

export const CAD_COMMAND_REGISTRY: CadCommandDefinition[] = [
  {
    id: "create_clearance_aisle",
    label: "Crear pasillo",
    category: "layout",
    description: "Separa dos objetos para crear una holgura/pasillo medible.",
    inputSchema: {
      targetA: { type: "string", required: true, description: "Objeto fijo." },
      targetB: {
        type: "string",
        required: true,
        description: "Objeto a mover.",
      },
      distance: {
        type: "number",
        required: true,
        description: "Distancia de holgura.",
      },
      unit: { type: "string", description: "Unidad interpretada." },
      axis: {
        type: "enum",
        enum: ["x", "y"],
        description: "Eje de separación.",
      },
    },
    examples: ["haz un pasillo de 1.2m entre SMT e inspección"],
    validate: (i, c) =>
      clearancePreview(
        i as Extract<CadCommandInput, { id: "create_clearance_aisle" }>,
        c,
      ).issues,
    preview: (i, c) =>
      clearancePreview(
        i as Extract<CadCommandInput, { id: "create_clearance_aisle" }>,
        c,
      ),
    execute: (i, c) => {
      const p = clearancePreview(
        i as Extract<CadCommandInput, { id: "create_clearance_aisle" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "align_selection",
    label: "Alinear selección",
    category: "layout",
    description: "Alinea objetos seleccionados a un borde o centro común.",
    inputSchema: {
      mode: {
        type: "enum",
        required: true,
        enum: ["left", "center", "right", "top", "middle", "bottom"],
        description: "Modo de alineación.",
      },
      objectIds: { type: "string[]", description: "Objetos afectados." },
    },
    examples: ["alinea las estaciones seleccionadas al centro"],
    validate: (i, c) =>
      alignPreview(i as Extract<CadCommandInput, { id: "align_selection" }>, c)
        .issues,
    preview: (i, c) =>
      alignPreview(i as Extract<CadCommandInput, { id: "align_selection" }>, c),
    execute: (i, c) => {
      const p = alignPreview(
        i as Extract<CadCommandInput, { id: "align_selection" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "distribute_selection",
    label: "Distribuir selección",
    category: "layout",
    description: "Distribuye objetos con espacios iguales.",
    inputSchema: {
      axis: {
        type: "enum",
        required: true,
        enum: ["horizontal", "vertical"],
        description: "Eje de distribución.",
      },
      objectIds: { type: "string[]", description: "Objetos afectados." },
    },
    examples: ["distribuye horizontalmente"],
    validate: (i, c) =>
      distributePreview(
        i as Extract<CadCommandInput, { id: "distribute_selection" }>,
        c,
      ).issues,
    preview: (i, c) =>
      distributePreview(
        i as Extract<CadCommandInput, { id: "distribute_selection" }>,
        c,
      ),
    execute: (i, c) => {
      const p = distributePreview(
        i as Extract<CadCommandInput, { id: "distribute_selection" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "connect_flow",
    label: "Conectar flujo",
    category: "flow",
    description: "Crea conectores secuenciales entre estaciones.",
    inputSchema: {
      objectIds: {
        type: "string[]",
        description: "Estaciones a conectar en secuencia.",
      },
      from: { type: "string", description: "Origen opcional." },
      to: { type: "string", description: "Destino opcional." },
    },
    examples: ["conecta flujo de SMT a inspección"],
    validate: (i, c) =>
      flowObjects(i as Extract<CadCommandInput, { id: "connect_flow" }>, c)
        .length >= 2
        ? []
        : [
            error(
              "selection_too_small",
              "Selecciona al menos 2 estaciones para conectar flujo.",
            ),
          ],
    preview: (i, c) => {
      const xs = flowObjects(
        i as Extract<CadCommandInput, { id: "connect_flow" }>,
        c,
      );
      const ops: CadOperation[] = xs.slice(0, -1).map((o, idx) => ({
        type: "connect",
        from: o.id,
        to: xs[idx + 1].id,
        kind: "flow",
      }));
      const flowReport: CadOperation = {
        type: "report",
        title: "Métricas de flujo",
        rows: flowScoreRows(xs),
      };
      return {
        summary: `Conectar ${ops.length} tramos de flujo.`,
        affectedObjectIds: xs.map((o) => o.id),
        operations: xs.length >= 2 ? [...ops, flowReport] : ops,
        issues:
          xs.length >= 2
            ? []
            : [
                error(
                  "selection_too_small",
                  "Selecciona al menos 2 estaciones para conectar flujo.",
                ),
              ],
      };
    },
    execute: (i, c) => {
      const p = CAD_COMMAND_REGISTRY.find(
        (d) => d.id === "connect_flow",
      )!.preview(i, c);
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "arrange_line",
    label: "Acomodar línea",
    category: "layout",
    description: "Propone acomodo secuencial simple para estaciones.",
    inputSchema: {
      direction: {
        type: "enum",
        enum: ["left_to_right", "top_to_bottom"],
        description: "Dirección del acomodo.",
      },
      objectIds: { type: "string[]", description: "Estaciones a acomodar." },
    },
    examples: ["acomoda la línea de izquierda a derecha"],
    validate: (i, c) =>
      flowObjects(i as Extract<CadCommandInput, { id: "arrange_line" }>, c)
        .length >= 1
        ? []
        : [error("selection_empty", "No hay estaciones para acomodar.")],
    preview: (i, c) => {
      const input = i as Extract<CadCommandInput, { id: "arrange_line" }>;
      const xs = flowObjects(input, c);
      const gap = 500;
      const cursor = { x: gap, y: gap };
      const ops: CadOperation[] = xs.map((o) => {
        const after = { ...o, x: cursor.x, y: cursor.y };
        if (input.direction === "top_to_bottom") cursor.y += o.h + gap;
        else cursor.x += o.w + gap;
        return { type: "move", objectId: o.id, before: o, after };
      });
      const arranged = ops
        .map((op) => (op.type === "move" ? op.after : null))
        .filter((box): box is CadBox => !!box);
      const flowReport: CadOperation = {
        type: "report",
        title: "Score de flujo posterior",
        rows: flowScoreRows(arranged),
      };
      return {
        summary: `Acomodar ${xs.length} estaciones por secuencia.`,
        affectedObjectIds: xs.map((o) => o.id),
        operations: xs.length ? [...ops, flowReport] : ops,
        issues: xs.length
          ? []
          : [error("selection_empty", "No hay estaciones para acomodar.")],
      };
    },
    execute: (i, c) => {
      const p = CAD_COMMAND_REGISTRY.find(
        (d) => d.id === "arrange_line",
      )!.preview(i, c);
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "arrange_flow_line",
    label: "Acomodar linea de flujo",
    category: "flow",
    description:
      "Acomoda objetos por secuencia y crea conectores de flujo en una sola vista previa.",
    inputSchema: {
      direction: {
        type: "enum",
        enum: ["left_to_right", "top_to_bottom"],
        description: "Direccion del acomodo.",
      },
      objectIds: { type: "string[]", description: "Objetos a acomodar." },
      gap: {
        type: "number",
        description: "Separacion entre objetos en mm.",
      },
      margin: {
        type: "number",
        description: "Margen inicial desde el footprint en mm.",
      },
    },
    examples: [
      "acomoda y conecta la linea de flujo",
      "crea una linea de flujo horizontal",
    ],
    validate: (i, c) =>
      arrangeFlowLinePreview(
        i as Extract<CadCommandInput, { id: "arrange_flow_line" }>,
        c,
      ).issues.filter((issue) => issue.level === "error"),
    preview: (i, c) =>
      arrangeFlowLinePreview(
        i as Extract<CadCommandInput, { id: "arrange_flow_line" }>,
        c,
      ),
    execute: (i, c) => {
      const p = arrangeFlowLinePreview(
        i as Extract<CadCommandInput, { id: "arrange_flow_line" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "arrange_rack_rows",
    label: "Acomodar racks",
    category: "layout",
    description:
      "Acomoda racks/equipos seleccionados en filas de almacen con pasillos medibles.",
    inputSchema: {
      orientation: {
        type: "enum",
        enum: ["horizontal", "vertical"],
        description: "Direccion de las filas de racks.",
      },
      objectIds: { type: "string[]", description: "Racks/equipos a acomodar." },
      rows: { type: "number", description: "Numero de filas." },
      baysPerRow: { type: "number", description: "Bahias por fila." },
      bayGap: { type: "number", description: "Separacion entre bahias en mm." },
      aisleWidth: { type: "number", description: "Ancho de pasillo en mm." },
      margin: { type: "number", description: "Margen inicial en mm." },
    },
    examples: [
      "acomoda racks en 2 filas con pasillo 3m",
      "arrange warehouse racks in 3 rows",
    ],
    validate: (i, c) =>
      arrangeRackRowsPreview(
        i as Extract<CadCommandInput, { id: "arrange_rack_rows" }>,
        c,
      ).issues.filter((issue) => issue.level === "error"),
    preview: (i, c) =>
      arrangeRackRowsPreview(
        i as Extract<CadCommandInput, { id: "arrange_rack_rows" }>,
        c,
      ),
    execute: (i, c) => {
      const p = arrangeRackRowsPreview(
        i as Extract<CadCommandInput, { id: "arrange_rack_rows" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "analyze_line_balance",
    label: "Analizar balanceo",
    category: "analysis",
    description:
      "Calcula takt, cuello de botella, carga y faltantes de tiempos de ciclo para la linea seleccionada.",
    inputSchema: {
      objectIds: { type: "string[]", description: "Estaciones a analizar." },
      taktTimeSec: {
        type: "number",
        description: "Takt objetivo en segundos.",
      },
      cycleTimes: {
        type: "object",
        description:
          "Mapa opcional objectId -> segundos. Si falta, se leen etiquetas como CT=42s.",
      },
    },
    examples: [
      "analiza balanceo de linea takt 45s",
      "yamazumi de estaciones seleccionadas",
    ],
    validate: (i, c) =>
      analyzeLineBalancePreview(
        i as Extract<CadCommandInput, { id: "analyze_line_balance" }>,
        c,
      ).issues.filter((issue) => issue.level === "error"),
    preview: (i, c) =>
      analyzeLineBalancePreview(
        i as Extract<CadCommandInput, { id: "analyze_line_balance" }>,
        c,
      ),
    execute: (i, c) => {
      const p = analyzeLineBalancePreview(
        i as Extract<CadCommandInput, { id: "analyze_line_balance" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "trace_material_route",
    label: "Trazar ruta material",
    category: "flow",
    description:
      "Reporta la ruta from-to de materiales usando conectores existentes o la secuencia seleccionada.",
    inputSchema: {
      objectIds: {
        type: "string[]",
        description: "Objetos a incluir en la ruta material.",
      },
    },
    examples: [
      "traza ruta material",
      "reporte from-to de materiales",
      "material route for selected stations",
    ],
    validate: (i, c) =>
      traceMaterialRoutePreview(
        i as Extract<CadCommandInput, { id: "trace_material_route" }>,
        c,
      ).issues.filter((issue) => issue.level === "error"),
    preview: (i, c) =>
      traceMaterialRoutePreview(
        i as Extract<CadCommandInput, { id: "trace_material_route" }>,
        c,
      ),
    execute: (i, c) => {
      const p = traceMaterialRoutePreview(
        i as Extract<CadCommandInput, { id: "trace_material_route" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "measure_distance",
    label: "Medir distancia",
    category: "analysis",
    description: "Mide la distancia centro a centro entre dos objetos.",
    inputSchema: {
      targetA: {
        type: "string",
        required: true,
        description: "Primer objeto.",
      },
      targetB: {
        type: "string",
        required: true,
        description: "Segundo objeto.",
      },
    },
    examples: ["mide distancia entre AOI y empaque"],
    validate: (i, c) => {
      const input = i as Extract<CadCommandInput, { id: "measure_distance" }>;
      return findObjectByLabel(c, input.targetA) &&
        findObjectByLabel(c, input.targetB)
        ? []
        : [error("target_not_found", "No encontré ambos objetos para medir.")];
    },
    preview: (i, c) => {
      const input = i as Extract<CadCommandInput, { id: "measure_distance" }>;
      const a = findObjectByLabel(c, input.targetA);
      const b = findObjectByLabel(c, input.targetB);
      const issues =
        a && b
          ? []
          : [
              error(
                "target_not_found",
                "No encontré ambos objetos para medir.",
              ),
            ];
      const measurement =
        a && b
          ? measureBoxes(a, b, "direct", c.unit === "m" ? "m" : "mm")
          : null;
      return {
        summary:
          a && b && measurement
            ? measurementLabel(a, b, measurement)
            : "Medir distancia",
        affectedObjectIds: [a?.id, b?.id].filter(Boolean) as string[],
        operations:
          a && b && measurement
            ? [
                {
                  type: "measure",
                  from: a.id,
                  to: b.id,
                  distance: measurement.distanceMm,
                  unit: "mm",
                },
              ]
            : [],
        issues,
      };
    },
    execute: (i, c) => {
      const p = CAD_COMMAND_REGISTRY.find(
        (d) => d.id === "measure_distance",
      )!.preview(i, c);
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "find_collisions",
    label: "Encontrar colisiones",
    category: "analysis",
    description: "Detecta traslapes básicos entre objetos.",
    inputSchema: {
      objectIds: { type: "string[]", description: "Subconjunto opcional." },
    },
    examples: ["encuentra colisiones"],
    validate: () => [],
    preview: (i, c) => {
      const ids = (i as Extract<CadCommandInput, { id: "find_collisions" }>)
        .objectIds;
      const xs = ids?.length
        ? c.objects.filter((o) => ids.includes(o.id))
        : c.objects;
      const byId = new Map(xs.map((box) => [box.id, box]));
      const collisions = detectCadCollisions(
        xs.map((box) => ({
          id: box.id,
          label: box.label,
          x: box.x + box.w / 2,
          y: box.y + box.h / 2,
          width: box.w,
          height: box.h,
        })),
      );
      const rows = collisions.map((hit) => ({
        label: hit.aLabel,
        value: `${hit.bLabel} · ${Math.round(hit.area)} mm²`,
      }));
      return {
        summary: rows.length
          ? `${rows.length} colisiones detectadas.`
          : "Sin colisiones detectadas.",
        affectedObjectIds: uniq(
          collisions
            .flatMap((hit) => [hit.aId, hit.bId])
            .filter((id) => byId.has(id)),
        ),
        operations: [{ type: "report", title: "Colisiones", rows }],
        issues: rows.length
          ? [
              warning(
                "collisions_found",
                `${rows.length} traslapes detectados con bounding boxes compartidos.`,
              ),
            ]
          : [],
      };
    },
    execute: (i, c) => {
      const p = CAD_COMMAND_REGISTRY.find(
        (d) => d.id === "find_collisions",
      )!.preview(i, c);
      return result(p, true, p.summary);
    },
  },
  {
    id: "validate_layout",
    label: "Validar layout",
    category: "analysis",
    description:
      "Reporte combinado: colisiones, holguras, zonas de seguridad y flujo, con veredicto de severidad.",
    inputSchema: {
      objectIds: { type: "string[]", description: "Subconjunto opcional." },
      requiredClearance: {
        type: "number",
        description: "Holgura mínima requerida en mm (opcional).",
      },
    },
    examples: ["valida el layout", "valida el layout con holgura 800"],
    validate: () => [],
    preview: (i, c) => {
      const input = i as Extract<CadCommandInput, { id: "validate_layout" }>;
      const xs = input.objectIds?.length
        ? c.objects.filter((o) => input.objectIds!.includes(o.id))
        : c.objects;
      const boxes = xs.map((box) => ({
        id: box.id,
        label: box.label,
        x: box.x + box.w / 2,
        y: box.y + box.h / 2,
        width: box.w,
        height: box.h,
      }));
      const flowNodes = bySequence(xs.filter((o) => o.type === "station")).map(
        (box) => ({
          id: box.id,
          label: box.label,
          x: box.x + box.w / 2,
          y: box.y + box.h / 2,
        }),
      );
      const report = buildCadValidationReport({
        boxes,
        flowNodes: flowNodes.length >= 2 ? flowNodes : undefined,
        requiredClearance: input.requiredClearance,
      });
      const severityLabel =
        report.severity === "critical"
          ? "Crítico"
          : report.severity === "warning"
            ? "Advertencia"
            : "OK";
      const rows = [
        { label: "Severidad", value: severityLabel },
        { label: "Colisiones", value: String(report.collisions.length) },
        { label: "Holguras", value: String(report.clearances.length) },
        { label: "Zonas de seguridad", value: String(report.safety.length) },
      ];
      if (report.flow)
        rows.push({ label: "Flujo", value: `${report.flow.score}/100` });
      const affected = uniq([
        ...report.collisions.flatMap((hit) => [hit.aId, hit.bId]),
        ...report.clearances.flatMap((issue) => [issue.aId, issue.bId]),
      ]).filter((id) => xs.some((o) => o.id === id));
      return {
        summary:
          report.severity === "ok"
            ? "Layout validado: sin incidencias."
            : `Layout ${severityLabel.toLowerCase()}: ${report.collisions.length} colisiones, ${report.clearances.length} holguras, ${report.safety.length} zonas.`,
        affectedObjectIds: affected,
        operations: [{ type: "report", title: "Validación de layout", rows }],
        issues:
          report.severity === "critical"
            ? [
                error(
                  "layout_critical",
                  "El layout tiene incidencias críticas (colisiones o invasión de zona).",
                ),
              ]
            : report.severity === "warning"
              ? [
                  warning(
                    "layout_warning",
                    "El layout tiene advertencias (holguras, zonas o flujo subóptimo).",
                  ),
                ]
              : [],
      };
    },
    execute: (i, c) => {
      const p = CAD_COMMAND_REGISTRY.find(
        (d) => d.id === "validate_layout",
      )!.preview(i, c);
      return result(p, true, p.summary);
    },
  },
  {
    id: "fit_to_view",
    label: "Enfocar vista",
    category: "viewport",
    description: "Solicita a la UI enfocar selección o layout.",
    inputSchema: {
      objectIds: { type: "string[]", description: "Objetos a enfocar." },
    },
    examples: ["enfoca la selección"],
    validate: () => [],
    preview: (i, c) => {
      const ids =
        (i as Extract<CadCommandInput, { id: "fit_to_view" }>).objectIds ??
        c.selectedIds;
      return {
        summary: ids.length
          ? `Enfocar ${ids.length} objetos.`
          : "Enfocar layout completo.",
        affectedObjectIds: ids,
        operations: [{ type: "focus", objectIds: ids }],
        issues: [],
      };
    },
    execute: (i, c) => {
      const p = CAD_COMMAND_REGISTRY.find(
        (d) => d.id === "fit_to_view",
      )!.preview(i, c);
      return result(p, true, p.summary);
    },
  },
  {
    id: "array_rectangular",
    label: "Arreglo rectangular",
    category: "layout",
    description:
      "Crea copias del activo seleccionado en una rejilla columnas×filas.",
    inputSchema: {
      cols: { type: "number", required: true, description: "Columnas." },
      rows: { type: "number", required: true, description: "Filas." },
      gapX: { type: "number", description: "Separación horizontal extra." },
      gapY: { type: "number", description: "Separación vertical extra." },
      objectIds: { type: "string[]", description: "Activos a replicar." },
    },
    examples: ["matriz 3x4 con separación de 500"],
    validate: (i, c) =>
      arrayRectangularPreview(
        i as Extract<CadCommandInput, { id: "array_rectangular" }>,
        c,
      ).issues,
    preview: (i, c) =>
      arrayRectangularPreview(
        i as Extract<CadCommandInput, { id: "array_rectangular" }>,
        c,
      ),
    execute: (i, c) => {
      const p = arrayRectangularPreview(
        i as Extract<CadCommandInput, { id: "array_rectangular" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "array_polar",
    label: "Arreglo polar",
    category: "layout",
    description:
      "Crea copias del activo seleccionado alrededor de un centro (círculo o abanico).",
    inputSchema: {
      count: {
        type: "number",
        required: true,
        description: "Total de posiciones.",
      },
      angleSpanDeg: {
        type: "number",
        description: "Abanico en grados (default 360).",
      },
      centerLabel: {
        type: "string",
        description: "Objeto que actúa como centro.",
      },
      objectIds: {
        type: "string[]",
        description: "Activo a replicar (exactamente 1).",
      },
    },
    examples: ["arreglo polar de 6 copias alrededor de Robot"],
    validate: (i, c) =>
      arrayPolarPreview(i as Extract<CadCommandInput, { id: "array_polar" }>, c)
        .issues,
    preview: (i, c) =>
      arrayPolarPreview(
        i as Extract<CadCommandInput, { id: "array_polar" }>,
        c,
      ),
    execute: (i, c) => {
      const p = arrayPolarPreview(
        i as Extract<CadCommandInput, { id: "array_polar" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "array_along_flow",
    label: "Arreglo sobre flujo",
    category: "flow",
    description:
      "Distribuye copias del activo seleccionado equiespaciadas a lo largo de la ruta de flujo conectada.",
    inputSchema: {
      count: {
        type: "number",
        required: true,
        description: "Copias a colocar.",
      },
      objectIds: {
        type: "string[]",
        description: "Activo a replicar (exactamente 1).",
      },
    },
    examples: ["coloca 5 copias a lo largo del flujo"],
    validate: (i, c) =>
      arrayAlongFlowPreview(
        i as Extract<CadCommandInput, { id: "array_along_flow" }>,
        c,
      ).issues,
    preview: (i, c) =>
      arrayAlongFlowPreview(
        i as Extract<CadCommandInput, { id: "array_along_flow" }>,
        c,
      ),
    execute: (i, c) => {
      const p = arrayAlongFlowPreview(
        i as Extract<CadCommandInput, { id: "array_along_flow" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "offset_object",
    label: "Copia paralela (offset)",
    category: "layout",
    description:
      "Crea copias paralelas de los activos seleccionados a una distancia dada (útil para muros y pasillos).",
    inputSchema: {
      distance: {
        type: "number",
        required: true,
        description: "Distancia del offset.",
      },
      side: {
        type: "enum",
        enum: ["left", "right", "up", "down"],
        description: "Lado hacia donde va la copia.",
      },
      copies: { type: "number", description: "Copias sucesivas (default 1)." },
      objectIds: { type: "string[]", description: "Activos a copiar." },
    },
    examples: ["offset de 800 hacia abajo"],
    validate: (i, c) =>
      offsetObjectPreview(
        i as Extract<CadCommandInput, { id: "offset_object" }>,
        c,
      ).issues,
    preview: (i, c) =>
      offsetObjectPreview(
        i as Extract<CadCommandInput, { id: "offset_object" }>,
        c,
      ),
    execute: (i, c) => {
      const p = offsetObjectPreview(
        i as Extract<CadCommandInput, { id: "offset_object" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "mirror_selection",
    label: "Espejo de selección",
    category: "layout",
    description:
      "Refleja la selección sobre un eje vertical u horizontal (MIRROR de AutoCAD); por default conserva los originales y crea copias.",
    inputSchema: {
      axis: {
        type: "enum",
        enum: ["vertical", "horizontal"],
        description: "Eje del espejo (default: vertical).",
      },
      at: {
        type: "number",
        description:
          "Coordenada del eje; default: centro del conjunto seleccionado.",
      },
      copy: {
        type: "enum",
        enum: ["true", "false"],
        description: "true (default) crea copias; false mueve en sitio.",
      },
      objectIds: {
        type: "string[]",
        description: "Alternativa: objetos seleccionados.",
      },
    },
    examples: ["espejo vertical de la selección", "espejo horizontal sin copia"],
    validate: (i, c) =>
      mirrorSelectionPreview(
        i as Extract<CadCommandInput, { id: "mirror_selection" }>,
        c,
      ).issues,
    preview: (i, c) =>
      mirrorSelectionPreview(
        i as Extract<CadCommandInput, { id: "mirror_selection" }>,
        c,
      ),
    execute: (i, c) => {
      const p = mirrorSelectionPreview(
        i as Extract<CadCommandInput, { id: "mirror_selection" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "delete_selection",
    label: "Borrar selección",
    category: "layout",
    description:
      "Borra los objetos seleccionados (ERASE de AutoCAD); el estudio respeta capas bloqueadas y limpia la selección.",
    inputSchema: {
      objectIds: {
        type: "string[]",
        description: "Alternativa: objetos seleccionados.",
      },
    },
    examples: ["borra la selección", "elimina lo seleccionado"],
    validate: (i, c) =>
      deleteSelectionPreview(
        i as Extract<CadCommandInput, { id: "delete_selection" }>,
        c,
      ).issues,
    preview: (i, c) =>
      deleteSelectionPreview(
        i as Extract<CadCommandInput, { id: "delete_selection" }>,
        c,
      ),
    execute: (i, c) => {
      const p = deleteSelectionPreview(
        i as Extract<CadCommandInput, { id: "delete_selection" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "duplicate_selection",
    label: "Duplicar selección",
    category: "layout",
    description:
      "Duplica los objetos seleccionados (COPY de AutoCAD); la copia hereda kind/etiqueta/capa y se desplaza para no tapar al original.",
    inputSchema: {
      dx: {
        type: "number",
        description: "Desplazamiento X en mm (default 500).",
      },
      dy: {
        type: "number",
        description: "Desplazamiento Y en mm (default 500).",
      },
      objectIds: {
        type: "string[]",
        description: "Alternativa: objetos seleccionados.",
      },
    },
    examples: ["duplica la selección", "copia esto a 800,0"],
    validate: (i, c) =>
      duplicateSelectionPreview(
        i as Extract<CadCommandInput, { id: "duplicate_selection" }>,
        c,
      ).issues,
    preview: (i, c) =>
      duplicateSelectionPreview(
        i as Extract<CadCommandInput, { id: "duplicate_selection" }>,
        c,
      ),
    execute: (i, c) => {
      const p = duplicateSelectionPreview(
        i as Extract<CadCommandInput, { id: "duplicate_selection" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "add_label",
    label: "Texto en el plano",
    category: "layout",
    description:
      "Escribe una nota de texto en el plano (TEXT de AutoCAD); sin coordenadas cae al centro para arrastrarla.",
    inputSchema: {
      text: {
        type: "string",
        description: "El texto de la nota.",
      },
      x: { type: "number", description: "Coordenada X en mm (opcional)." },
      y: { type: "number", description: "Coordenada Y en mm (opcional)." },
    },
    examples: ["escribe 'Recepción' en 2000,1000", "anota 'Zona de carga'"],
    validate: (i, c) =>
      addLabelPreview(
        i as Extract<CadCommandInput, { id: "add_label" }>,
        c,
      ).issues,
    preview: (i, c) =>
      addLabelPreview(i as Extract<CadCommandInput, { id: "add_label" }>, c),
    execute: (i, c) => {
      const p = addLabelPreview(
        i as Extract<CadCommandInput, { id: "add_label" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "place_symbol",
    label: "Colocar símbolo",
    category: "layout",
    description:
      "Coloca un símbolo de la biblioteca por nombre ('puerta', 'cama', 'mostrador'), con coordenadas opcionales.",
    inputSchema: {
      query: {
        type: "string",
        description: "Qué colocar; busca en la biblioteca universal y EMS.",
      },
      x: { type: "number", description: "X en mm (opcional; default centro)." },
      y: { type: "number", description: "Y en mm (opcional; default centro)." },
    },
    examples: ["pon una puerta", "coloca una cama en 3000,2000"],
    validate: (i, c) =>
      placeSymbolPreview(
        i as Extract<CadCommandInput, { id: "place_symbol" }>,
        c,
      ).issues,
    preview: (i, c) =>
      placeSymbolPreview(
        i as Extract<CadCommandInput, { id: "place_symbol" }>,
        c,
      ),
    execute: (i, c) => {
      const p = placeSymbolPreview(
        i as Extract<CadCommandInput, { id: "place_symbol" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "rotate_selection",
    label: "Rotar selección",
    category: "layout",
    description:
      "Gira la selección N grados alrededor de su centro (ROTATE de AutoCAD).",
    inputSchema: {
      angle: {
        type: "number",
        description: "Grados; positivo antihorario (p. ej. 90 o -45).",
      },
      objectIds: {
        type: "string[]",
        description: "Alternativa: objetos seleccionados.",
      },
    },
    examples: ["gira 90 la selección", "rota -45"],
    validate: (i, c) =>
      rotateSelectionPreview(
        i as Extract<CadCommandInput, { id: "rotate_selection" }>,
        c,
      ).issues,
    preview: (i, c) =>
      rotateSelectionPreview(
        i as Extract<CadCommandInput, { id: "rotate_selection" }>,
        c,
      ),
    execute: (i, c) => {
      const p = rotateSelectionPreview(
        i as Extract<CadCommandInput, { id: "rotate_selection" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "scale_selection",
    label: "Escalar selección",
    category: "layout",
    description:
      "Escala tamaños y posiciones de la selección desde su centro (SCALE de AutoCAD).",
    inputSchema: {
      factor: {
        type: "number",
        description: "Factor > 0 (p. ej. 2 duplica, 0.5 reduce a la mitad).",
      },
      objectIds: {
        type: "string[]",
        description: "Alternativa: objetos seleccionados.",
      },
    },
    examples: ["escala 2 la selección", "escala al 150%"],
    validate: (i, c) =>
      scaleSelectionPreview(
        i as Extract<CadCommandInput, { id: "scale_selection" }>,
        c,
      ).issues,
    preview: (i, c) =>
      scaleSelectionPreview(
        i as Extract<CadCommandInput, { id: "scale_selection" }>,
        c,
      ),
    execute: (i, c) => {
      const p = scaleSelectionPreview(
        i as Extract<CadCommandInput, { id: "scale_selection" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "extend_wall",
    label: "Extender muro",
    category: "layout",
    description:
      "Alarga un muro hasta tocar la línea de otro muro (EXTEND de AutoCAD).",
    inputSchema: {
      target: { type: "string", description: "Muro a extender." },
      boundary: { type: "string", description: "Muro frontera." },
      objectIds: {
        type: "string[]",
        description: "Alternativa: 2 muros seleccionados.",
      },
    },
    examples: ["extiende Muro 1 hasta Muro 2"],
    validate: (i, c) =>
      extendWallPreview(i as Extract<CadCommandInput, { id: "extend_wall" }>, c)
        .issues,
    preview: (i, c) =>
      extendWallPreview(
        i as Extract<CadCommandInput, { id: "extend_wall" }>,
        c,
      ),
    execute: (i, c) => {
      const p = extendWallPreview(
        i as Extract<CadCommandInput, { id: "extend_wall" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "trim_wall",
    label: "Recortar muro",
    category: "layout",
    description:
      "Recorta un muro donde cruza a otro, conservando un lado (TRIM de AutoCAD).",
    inputSchema: {
      target: { type: "string", description: "Muro a recortar." },
      cutter: { type: "string", description: "Muro de corte." },
      keep: {
        type: "enum",
        enum: ["start", "end"],
        description: "Lado que se conserva (default: el más largo).",
      },
      objectIds: {
        type: "string[]",
        description: "Alternativa: 2 muros seleccionados.",
      },
    },
    examples: ["recorta Muro 1 en Muro 2"],
    validate: (i, c) =>
      trimWallPreview(i as Extract<CadCommandInput, { id: "trim_wall" }>, c)
        .issues,
    preview: (i, c) =>
      trimWallPreview(i as Extract<CadCommandInput, { id: "trim_wall" }>, c),
    execute: (i, c) => {
      const p = trimWallPreview(
        i as Extract<CadCommandInput, { id: "trim_wall" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "chamfer_walls",
    label: "Chaflán entre muros",
    category: "layout",
    description:
      "Recorta la esquina de dos muros y la une con un tramo diagonal (CHAMFER de AutoCAD).",
    inputSchema: {
      wallA: { type: "string", description: "Primer muro." },
      wallB: { type: "string", description: "Segundo muro." },
      distance: {
        type: "number",
        required: true,
        description: "Distancia del corte desde la esquina.",
      },
      objectIds: {
        type: "string[]",
        description: "Alternativa: 2 muros seleccionados.",
      },
    },
    examples: ["chaflán de 400 entre Muro 1 y Muro 2"],
    validate: (i, c) =>
      chamferWallsPreview(
        i as Extract<CadCommandInput, { id: "chamfer_walls" }>,
        c,
      ).issues,
    preview: (i, c) =>
      chamferWallsPreview(
        i as Extract<CadCommandInput, { id: "chamfer_walls" }>,
        c,
      ),
    execute: (i, c) => {
      const p = chamferWallsPreview(
        i as Extract<CadCommandInput, { id: "chamfer_walls" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "measure_area",
    label: "Área y perímetro",
    category: "analysis",
    description:
      "Área, perímetro y centroide de un objeto o del casco convexo de la selección.",
    inputSchema: {
      targetLabel: {
        type: "string",
        description: "Objeto a medir (opcional).",
      },
      objectIds: { type: "string[]", description: "Objetos de la región." },
    },
    examples: ["área de la selección"],
    validate: (i, c) =>
      measureAreaPreview(
        i as Extract<CadCommandInput, { id: "measure_area" }>,
        c,
      ).issues,
    preview: (i, c) =>
      measureAreaPreview(
        i as Extract<CadCommandInput, { id: "measure_area" }>,
        c,
      ),
    execute: (i, c) => {
      const p = measureAreaPreview(
        i as Extract<CadCommandInput, { id: "measure_area" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "create_zone_around",
    label: "Zona envolvente",
    category: "layout",
    description:
      "Crea una zona editable alrededor de la selección con un margen dado (celdas, keep-out, supermercados).",
    inputSchema: {
      margin: {
        type: "number",
        description: "Margen alrededor del grupo (default 500).",
      },
      label: { type: "string", description: "Nombre de la zona." },
      objectIds: { type: "string[]", description: "Objetos a envolver." },
    },
    examples: ["crea una zona alrededor de la selección con margen de 800"],
    validate: (i, c) =>
      createZoneAroundPreview(
        i as Extract<CadCommandInput, { id: "create_zone_around" }>,
        c,
      ).issues,
    preview: (i, c) =>
      createZoneAroundPreview(
        i as Extract<CadCommandInput, { id: "create_zone_around" }>,
        c,
      ),
    execute: (i, c) => {
      const p = createZoneAroundPreview(
        i as Extract<CadCommandInput, { id: "create_zone_around" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },

  {
    id: "draw_wall_segment",
    label: "Dibujar muro por coordenadas",
    category: "layout",
    description:
      "Crea un muro preciso desde dos puntos CAD (x,y, @dx,dy o @dist<ángulo).",
    inputSchema: {
      from: { type: "object", required: true, description: "Punto inicial." },
      to: { type: "object", required: true, description: "Punto final." },
      thickness: { type: "number", description: "Espesor del muro." },
      label: { type: "string", description: "Etiqueta opcional." },
    },
    examples: ["muro 0,0 @5000,0", "wall 1000,1000 @3000<90 thickness 120"],
    validate: (i, c) =>
      drawWallSegmentPreview(
        i as Extract<CadCommandInput, { id: "draw_wall_segment" }>,
        c,
      ).issues.filter((issue) => issue.level === "error"),
    preview: (i, c) =>
      drawWallSegmentPreview(
        i as Extract<CadCommandInput, { id: "draw_wall_segment" }>,
        c,
      ),
    execute: (i, c) => {
      const p = drawWallSegmentPreview(
        i as Extract<CadCommandInput, { id: "draw_wall_segment" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "draw_rect_zone",
    label: "Dibujar rectángulo/zona",
    category: "layout",
    description:
      "Crea una zona o room rectangular desde dos esquinas precisas.",
    inputSchema: {
      from: { type: "object", required: true, description: "Primera esquina." },
      to: { type: "object", required: true, description: "Esquina opuesta." },
      kind: {
        type: "enum",
        enum: ["zone", "room"],
        description: "Tipo de asset.",
      },
      label: { type: "string", description: "Etiqueta opcional." },
    },
    examples: ["rect 0,0 @4000,2500", "room 1000,1000 @5000,3000 etiqueta QA"],
    validate: (i, c) =>
      drawRectZonePreview(
        i as Extract<CadCommandInput, { id: "draw_rect_zone" }>,
        c,
      ).issues.filter((issue) => issue.level === "error"),
    preview: (i, c) =>
      drawRectZonePreview(
        i as Extract<CadCommandInput, { id: "draw_rect_zone" }>,
        c,
      ),
    execute: (i, c) => {
      const p = drawRectZonePreview(
        i as Extract<CadCommandInput, { id: "draw_rect_zone" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
  {
    id: "auto_dimension",
    label: "Acotar selección",
    category: "analysis",
    description:
      "Genera cotas de ancho/alto por objeto y de hueco entre vecinos — el acotado mecánico del plano.",
    inputSchema: {
      mode: {
        type: "enum",
        enum: ["size", "gaps", "both"],
        description: "Qué cotas generar (default both).",
      },
      objectIds: { type: "string[]", description: "Objetos a acotar." },
    },
    examples: ["acota la selección"],
    validate: (i, c) =>
      autoDimensionPreview(
        i as Extract<CadCommandInput, { id: "auto_dimension" }>,
        c,
      ).issues,
    preview: (i, c) =>
      autoDimensionPreview(
        i as Extract<CadCommandInput, { id: "auto_dimension" }>,
        c,
      ),
    execute: (i, c) => {
      const p = autoDimensionPreview(
        i as Extract<CadCommandInput, { id: "auto_dimension" }>,
        c,
      );
      return result(p, ok(p.issues), p.summary);
    },
  },
];

export const CAD_COMMAND_IDS = CAD_COMMAND_REGISTRY.map((c) => c.id);
export function getCadCommand(id: CadCommandInput["id"]) {
  return CAD_COMMAND_REGISTRY.find((c) => c.id === id);
}
export function openAiCompatibleToolSchemas() {
  return CAD_COMMAND_REGISTRY.map(
    ({ id, label, description, inputSchema }) => ({
      type: "function" as const,
      function: {
        name: id,
        description: `${label}: ${description}`,
        parameters: inputSchema,
      },
    }),
  );
}
export type { CadConnectorInput };
