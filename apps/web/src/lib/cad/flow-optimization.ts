export interface CadFlowNode {
  id: string;
  label?: string;
  x: number;
  y: number;
}
export interface CadFlowSegment {
  from: CadFlowNode;
  to: CadFlowNode;
  distance: number;
}
export interface CadFlowScoreSummary {
  totalDistance: number;
  crossingCount: number;
  backtrackingCount: number;
  score: number;
}
export interface CadFlowReorderMove {
  id: string;
  label?: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}
export interface CadFlowReorderPreview {
  axis: "x" | "y";
  before: CadFlowScoreSummary;
  after: CadFlowScoreSummary;
  deltas: {
    score: number;
    totalDistance: number;
    crossingCount: number;
    backtrackingCount: number;
  };
  moves: CadFlowReorderMove[];
  improves: boolean;
}
export interface CadFlowScore extends CadFlowScoreSummary {
  suggestions: string[];
  reorderPreview?: CadFlowReorderPreview;
}

function distance(a: CadFlowNode, b: CadFlowNode): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
export function buildFlowSegments(nodes: CadFlowNode[]): CadFlowSegment[] {
  const segments: CadFlowSegment[] = [];
  for (let i = 0; i < nodes.length - 1; i += 1)
    segments.push({
      from: nodes[i],
      to: nodes[i + 1],
      distance: distance(nodes[i], nodes[i + 1]),
    });
  return segments;
}
export function calculateTotalFlowDistance(nodes: CadFlowNode[]): number {
  return buildFlowSegments(nodes).reduce(
    (sum, segment) => sum + segment.distance,
    0,
  );
}
function orientation(a: CadFlowNode, b: CadFlowNode, c: CadFlowNode): number {
  return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
}
function segmentsCross(a: CadFlowSegment, b: CadFlowSegment): boolean {
  if ([a.from.id, a.to.id].some((id) => id === b.from.id || id === b.to.id))
    return false;
  return (
    orientation(a.from, a.to, b.from) !== orientation(a.from, a.to, b.to) &&
    orientation(b.from, b.to, a.from) !== orientation(b.from, b.to, a.to)
  );
}
export function detectFlowCrossings(
  nodes: CadFlowNode[],
): Array<{ a: CadFlowSegment; b: CadFlowSegment }> {
  const segments = buildFlowSegments(nodes);
  const crossings: Array<{ a: CadFlowSegment; b: CadFlowSegment }> = [];
  for (let i = 0; i < segments.length; i += 1)
    for (let j = i + 1; j < segments.length; j += 1)
      if (segmentsCross(segments[i], segments[j]))
        crossings.push({ a: segments[i], b: segments[j] });
  return crossings;
}
export function detectBacktracking(
  nodes: CadFlowNode[],
  axis: "x" | "y" = "x",
): CadFlowSegment[] {
  return buildFlowSegments(nodes).filter(
    (segment) => segment.to[axis] < segment.from[axis],
  );
}
export function suggestSimpleFlowReorder(
  nodes: CadFlowNode[],
  axis: "x" | "y" = "x",
): CadFlowNode[] {
  return [...nodes].sort((a, b) => a[axis] - b[axis]);
}

function scoreFlowStats(nodes: CadFlowNode[]): CadFlowScoreSummary {
  const totalDistance = calculateTotalFlowDistance(nodes);
  const crossingCount = detectFlowCrossings(nodes).length;
  const backtrackingCount = detectBacktracking(nodes).length;
  const score = Math.max(
    0,
    100 - totalDistance / 1000 - crossingCount * 15 - backtrackingCount * 10,
  );
  return {
    totalDistance,
    crossingCount,
    backtrackingCount,
    score: Math.round(score),
  };
}

function candidateFlowReorder(
  nodes: CadFlowNode[],
  axis: "x" | "y",
  before: CadFlowScoreSummary,
): CadFlowReorderPreview {
  const orderedSlots = suggestSimpleFlowReorder(nodes, axis);
  const movedNodes = nodes.map((node, index) => ({
    ...node,
    x: orderedSlots[index]?.x ?? node.x,
    y: orderedSlots[index]?.y ?? node.y,
  }));
  const after = scoreFlowStats(movedNodes);
  return {
    axis,
    before,
    after,
    deltas: {
      score: after.score - before.score,
      totalDistance: before.totalDistance - after.totalDistance,
      crossingCount: before.crossingCount - after.crossingCount,
      backtrackingCount: before.backtrackingCount - after.backtrackingCount,
    },
    moves: nodes.map((node, index) => ({
      id: node.id,
      label: node.label,
      from: { x: node.x, y: node.y },
      to: {
        x: orderedSlots[index]?.x ?? node.x,
        y: orderedSlots[index]?.y ?? node.y,
      },
    })),
    improves: after.score > before.score || after.totalDistance < before.totalDistance,
  };
}

export function buildFlowReorderPreview(
  nodes: CadFlowNode[],
): CadFlowReorderPreview | null {
  if (nodes.length < 2) return null;
  const before = scoreFlowStats(nodes);
  const candidates = [
    candidateFlowReorder(nodes, "x", before),
    candidateFlowReorder(nodes, "y", before),
  ];
  return candidates.sort(
    (a, b) =>
      b.deltas.score - a.deltas.score ||
      b.deltas.totalDistance - a.deltas.totalDistance ||
      b.deltas.crossingCount - a.deltas.crossingCount ||
      b.deltas.backtrackingCount - a.deltas.backtrackingCount,
  )[0];
}

export function scoreFlowLayout(nodes: CadFlowNode[]): CadFlowScore {
  const stats = scoreFlowStats(nodes);
  const reorderPreview = buildFlowReorderPreview(nodes);
  const suggestions: string[] = [];
  if (stats.crossingCount)
    suggestions.push("Reduce cruces de flujo entre estaciones.");
  if (stats.backtrackingCount)
    suggestions.push("Reordena estaciones para evitar backtracking.");
  if (stats.totalDistance > 25000)
    suggestions.push("Acorta la distancia total del flujo.");
  if (reorderPreview?.improves) {
    const benefit =
      reorderPreview.deltas.score > 0
        ? `mejorar ${reorderPreview.deltas.score} puntos`
        : `reducir ${Math.round(reorderPreview.deltas.totalDistance)} mm`;
    suggestions.push(
      `Aplica el orden sugerido en eje ${reorderPreview.axis.toUpperCase()} para ${benefit}.`,
    );
  }
  return {
    ...stats,
    suggestions,
    reorderPreview: reorderPreview?.improves ? reorderPreview : undefined,
  };
}
