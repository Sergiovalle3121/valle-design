export type CadMeasureMode = "direct" | "horizontal" | "vertical";
export type CadMeasureUnit = "mm" | "m";

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
  const distanceMm =
    mode === "horizontal"
      ? Math.abs(dxMm)
      : mode === "vertical"
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
  };
}

export function measureBoxes(
  a: CadMeasureBox,
  b: CadMeasureBox,
  mode: CadMeasureMode = "direct",
  displayUnit: CadMeasureUnit = "mm",
): CadMeasurement {
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
  const axis =
    measurement.mode === "horizontal"
      ? "H"
      : measurement.mode === "vertical"
        ? "V"
        : "D";
  return `${axis} ${a.label} ↔ ${b.label}: ${measurement.label}`;
}

function trimNumber(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
