export type CadMeasureMode =
  | "direct"
  | "horizontal"
  | "vertical"
  | "edge-horizontal"
  | "edge-vertical";
export type CadMeasureUnit = "mm" | "m";
export type CadMeasurementRelation =
  | "center"
  | "clearance"
  | "touching"
  | "overlap";

export interface CadMeasurePoint {
  x: number;
  y: number;
}

export interface CadMeasureBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CadMeasurement {
  from: CadMeasurePoint;
  to: CadMeasurePoint;
  mode: CadMeasureMode;
  distanceMm: number;
  dxMm: number;
  dyMm: number;
  label: string;
  relation: CadMeasurementRelation;
  clearanceMm?: number;
  overlapMm?: number;
}

export function boxCenter(box: CadMeasureBox): CadMeasurePoint {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

export function measurePoints(
  from: CadMeasurePoint,
  to: CadMeasurePoint,
  mode: CadMeasureMode = "direct",
  displayUnit: CadMeasureUnit = "mm",
): CadMeasurement {
  const dxMm = to.x - from.x;
  const dyMm = to.y - from.y;
  const pointMode =
    mode === "edge-horizontal"
      ? "horizontal"
      : mode === "edge-vertical"
        ? "vertical"
        : mode;
  const distanceMm =
    pointMode === "horizontal"
      ? Math.abs(dxMm)
      : pointMode === "vertical"
        ? Math.abs(dyMm)
        : Math.hypot(dxMm, dyMm);
  return {
    from,
    to,
    mode,
    distanceMm,
    dxMm,
    dyMm,
    label: formatDistance(distanceMm, displayUnit),
    relation: "center",
  };
}

export function measureBoxes(
  a: CadMeasureBox,
  b: CadMeasureBox,
  mode: CadMeasureMode = "direct",
  displayUnit: CadMeasureUnit = "mm",
): CadMeasurement {
  if (mode === "edge-horizontal" || mode === "edge-vertical") {
    return measureBoxEdges(a, b, mode, displayUnit);
  }
  return measurePoints(boxCenter(a), boxCenter(b), mode, displayUnit);
}

export function formatDistance(
  distanceMm: number,
  unit: CadMeasureUnit = "mm",
): string {
  if (unit === "m") return `${trimNumber(distanceMm / 1000, 3)} m`;
  if (Math.abs(distanceMm) >= 1000)
    return `${trimNumber(distanceMm, 0)} mm (${trimNumber(distanceMm / 1000, 3)} m)`;
  return `${trimNumber(distanceMm, 0)} mm`;
}

export function measurementLabel(
  a: CadMeasureBox,
  b: CadMeasureBox,
  measurement: CadMeasurement,
): string {
  const axis = measurementAxisLabel(measurement.mode);
  return `${axis} ${a.label} ↔ ${b.label}: ${measurement.label}`;
}

function measurementAxisLabel(mode: CadMeasureMode): string {
  if (mode === "horizontal") return "H";
  if (mode === "vertical") return "V";
  if (mode === "edge-horizontal") return "EDGE H";
  if (mode === "edge-vertical") return "EDGE V";
  return "D";
}

function measureBoxEdges(
  a: CadMeasureBox,
  b: CadMeasureBox,
  mode: "edge-horizontal" | "edge-vertical",
  displayUnit: CadMeasureUnit,
): CadMeasurement {
  if (mode === "edge-horizontal") {
    const [left, right] =
      boxCenter(a).x <= boxCenter(b).x ? [a, b] : [b, a];
    const y = sharedMidpoint(
      left.y,
      left.y + left.h,
      right.y,
      right.y + right.h,
      boxCenter(left).y,
      boxCenter(right).y,
    );
    return edgeMeasurement(
      { x: left.x + left.w, y },
      { x: right.x, y },
      mode,
      displayUnit,
    );
  }

  const [top, bottom] =
    boxCenter(a).y <= boxCenter(b).y ? [a, b] : [b, a];
  const x = sharedMidpoint(
    top.x,
    top.x + top.w,
    bottom.x,
    bottom.x + bottom.w,
    boxCenter(top).x,
    boxCenter(bottom).x,
  );
  return edgeMeasurement(
    { x, y: top.y + top.h },
    { x, y: bottom.y },
    mode,
    displayUnit,
  );
}

function sharedMidpoint(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
  aCenter: number,
  bCenter: number,
): number {
  const overlapMin = Math.max(aMin, bMin);
  const overlapMax = Math.min(aMax, bMax);
  if (overlapMax >= overlapMin) return (overlapMin + overlapMax) / 2;
  return (aCenter + bCenter) / 2;
}

function edgeMeasurement(
  from: CadMeasurePoint,
  to: CadMeasurePoint,
  mode: "edge-horizontal" | "edge-vertical",
  displayUnit: CadMeasureUnit,
): CadMeasurement {
  const dxMm = to.x - from.x;
  const dyMm = to.y - from.y;
  const signed = mode === "edge-horizontal" ? dxMm : dyMm;
  const clearanceMm = Math.max(0, signed);
  const overlapMm = Math.max(0, -signed);
  const relation =
    overlapMm > 0 ? "overlap" : clearanceMm === 0 ? "touching" : "clearance";
  const distanceMm = Math.abs(signed);
  return {
    from,
    to,
    mode,
    distanceMm,
    dxMm,
    dyMm,
    label:
      relation === "overlap"
        ? `${formatDistance(overlapMm, displayUnit)} overlap`
        : `${formatDistance(clearanceMm, displayUnit)} clearance`,
    relation,
    clearanceMm,
    overlapMm,
  };
}

function trimNumber(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
