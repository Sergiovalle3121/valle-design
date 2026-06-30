export interface CadCollisionBox {
  id: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer?: string;
  locked?: boolean;
  tags?: string[];
}
export interface CadCollisionHit {
  aId: string;
  bId: string;
  aLabel: string;
  bLabel: string;
  overlapX: number;
  overlapY: number;
  area: number;
}
export interface CadClearanceIssue {
  aId: string;
  bId: string;
  distance: number;
  required: number;
  message: string;
}

function bounds(box: CadCollisionBox) {
  const halfW = Math.max(0, box.width) / 2;
  const halfH = Math.max(0, box.height) / 2;
  return {
    left: box.x - halfW,
    right: box.x + halfW,
    top: box.y - halfH,
    bottom: box.y + halfH,
  };
}
export function boxesOverlap(
  a: CadCollisionBox,
  b: CadCollisionBox,
): CadCollisionHit | null {
  const ab = bounds(a);
  const bb = bounds(b);
  const overlapX = Math.min(ab.right, bb.right) - Math.max(ab.left, bb.left);
  const overlapY = Math.min(ab.bottom, bb.bottom) - Math.max(ab.top, bb.top);
  if (overlapX <= 0 || overlapY <= 0) return null;
  return {
    aId: a.id,
    bId: b.id,
    aLabel: a.label ?? a.id,
    bLabel: b.label ?? b.id,
    overlapX,
    overlapY,
    area: overlapX * overlapY,
  };
}
export function detectCadCollisions(
  boxes: CadCollisionBox[],
): CadCollisionHit[] {
  const hits: CadCollisionHit[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const hit = boxesOverlap(boxes[i], boxes[j]);
      if (hit) hits.push(hit);
    }
  }
  return hits.sort((a, b) => b.area - a.area);
}
export function edgeDistance(a: CadCollisionBox, b: CadCollisionBox): number {
  const ab = bounds(a);
  const bb = bounds(b);
  const dx = Math.max(bb.left - ab.right, ab.left - bb.right, 0);
  const dy = Math.max(bb.top - ab.bottom, ab.top - bb.bottom, 0);
  return Math.hypot(dx, dy);
}
export function findClearanceIssues(
  boxes: CadCollisionBox[],
  required: number,
): CadClearanceIssue[] {
  const issues: CadClearanceIssue[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const distance = edgeDistance(boxes[i], boxes[j]);
      if (distance < required)
        issues.push({
          aId: boxes[i].id,
          bId: boxes[j].id,
          distance,
          required,
          message: `Separación insuficiente entre ${boxes[i].label ?? boxes[i].id} y ${boxes[j].label ?? boxes[j].id}.`,
        });
    }
  }
  return issues;
}
