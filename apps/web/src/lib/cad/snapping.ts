export type CadSnapKind = "grid" | "center" | "edge" | "connector";

export interface CadSnapBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CadSnapConnector {
  from: string;
  to: string;
}

export interface CadSnapAnchor {
  id: string;
  kind: CadSnapKind;
  axis: "x" | "y";
  value: number;
  objectId?: string;
}

export interface CadSnapOptions {
  gridSize: number;
  gridEnabled: boolean;
  objectEnabled: boolean;
  centerEnabled: boolean;
  edgeEnabled: boolean;
  connectorEnabled: boolean;
  tolerance: number;
}

export interface CadSnapResult {
  x: number;
  y: number;
  applied: CadSnapKind[];
  anchors: CadSnapAnchor[];
}

export const DEFAULT_CAD_SNAP_OPTIONS: CadSnapOptions = {
  gridSize: 100,
  gridEnabled: true,
  objectEnabled: true,
  centerEnabled: true,
  edgeEnabled: true,
  connectorEnabled: true,
  tolerance: 80,
};

export function snapScalarToGrid(value: number, gridSize: number): number {
  const g = Math.max(1, Math.abs(gridSize || 1));
  return Math.round(value / g) * g;
}

export function maybeSnapScalarToGrid(
  value: number,
  gridSize: number,
  gridEnabled: boolean,
): number {
  return gridEnabled ? snapScalarToGrid(value, gridSize) : value;
}

export function snapPointToGrid(
  x: number,
  y: number,
  gridSize: number,
): { x: number; y: number } {
  return { x: snapScalarToGrid(x, gridSize), y: snapScalarToGrid(y, gridSize) };
}

export function boxAnchors(
  box: CadSnapBox,
  kinds: Pick<
    CadSnapOptions,
    "centerEnabled" | "edgeEnabled"
  > = DEFAULT_CAD_SNAP_OPTIONS,
): CadSnapAnchor[] {
  const anchors: CadSnapAnchor[] = [];
  if (kinds.edgeEnabled) {
    anchors.push(
      {
        id: `${box.id}:left`,
        kind: "edge",
        axis: "x",
        value: box.x,
        objectId: box.id,
      },
      {
        id: `${box.id}:right`,
        kind: "edge",
        axis: "x",
        value: box.x + box.w,
        objectId: box.id,
      },
      {
        id: `${box.id}:top`,
        kind: "edge",
        axis: "y",
        value: box.y,
        objectId: box.id,
      },
      {
        id: `${box.id}:bottom`,
        kind: "edge",
        axis: "y",
        value: box.y + box.h,
        objectId: box.id,
      },
    );
  }
  if (kinds.centerEnabled) {
    anchors.push(
      {
        id: `${box.id}:cx`,
        kind: "center",
        axis: "x",
        value: box.x + box.w / 2,
        objectId: box.id,
      },
      {
        id: `${box.id}:cy`,
        kind: "center",
        axis: "y",
        value: box.y + box.h / 2,
        objectId: box.id,
      },
    );
  }
  return anchors;
}

export function collectSnapAnchors(
  boxes: CadSnapBox[],
  connectors: CadSnapConnector[] = [],
  options: CadSnapOptions = DEFAULT_CAD_SNAP_OPTIONS,
): CadSnapAnchor[] {
  const anchors = boxes.flatMap((box) => boxAnchors(box, options));
  if (options.connectorEnabled) {
    const byId = new Map(boxes.map((box) => [box.id, box]));
    for (const conn of connectors) {
      for (const id of [conn.from, conn.to]) {
        const box = byId.get(id);
        if (!box) continue;
        anchors.push(
          {
            id: `conn:${conn.from}:${conn.to}:${id}:x`,
            kind: "connector",
            axis: "x",
            value: box.x + box.w / 2,
            objectId: id,
          },
          {
            id: `conn:${conn.from}:${conn.to}:${id}:y`,
            kind: "connector",
            axis: "y",
            value: box.y + box.h / 2,
            objectId: id,
          },
        );
      }
    }
  }
  return anchors;
}

function nearestAnchor(
  value: number,
  axis: "x" | "y",
  anchors: CadSnapAnchor[],
  tolerance: number,
): CadSnapAnchor | null {
  let best: CadSnapAnchor | null = null;
  let bestD = Infinity;
  for (const anchor of anchors) {
    if (anchor.axis !== axis) continue;
    const d = Math.abs(anchor.value - value);
    if (d <= tolerance && d < bestD) {
      best = anchor;
      bestD = d;
    }
  }
  return best;
}

export function snapBoxPosition(
  input: { x: number; y: number; w: number; h: number },
  anchors: CadSnapAnchor[],
  options: CadSnapOptions = DEFAULT_CAD_SNAP_OPTIONS,
): CadSnapResult {
  let x = input.x;
  let y = input.y;
  const applied: CadSnapKind[] = [];
  const used: CadSnapAnchor[] = [];

  if (options.gridEnabled) {
    const p = snapPointToGrid(x, y, options.gridSize);
    x = p.x;
    y = p.y;
    applied.push("grid");
  }

  if (options.objectEnabled) {
    const candidates = [
      { axis: "x" as const, value: x, offset: 0 },
      { axis: "x" as const, value: x + input.w / 2, offset: input.w / 2 },
      { axis: "x" as const, value: x + input.w, offset: input.w },
      { axis: "y" as const, value: y, offset: 0 },
      { axis: "y" as const, value: y + input.h / 2, offset: input.h / 2 },
      { axis: "y" as const, value: y + input.h, offset: input.h },
    ];
    for (const c of candidates) {
      const hit = nearestAnchor(c.value, c.axis, anchors, options.tolerance);
      if (!hit) continue;
      if (c.axis === "x") x = hit.value - c.offset;
      else y = hit.value - c.offset;
      applied.push(hit.kind);
      used.push(hit);
    }
  }

  return { x, y, applied: [...new Set(applied)], anchors: used };
}
