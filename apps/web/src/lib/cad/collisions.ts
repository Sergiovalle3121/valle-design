import { gridPairCandidates, type Aabb } from "./rule-engine";

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
function toAabb(box: CadCollisionBox): Aabb {
  const b = bounds(box);
  return { minX: b.left, minY: b.top, maxX: b.right, maxY: b.bottom };
}

export function detectCadCollisions(
  boxes: CadCollisionBox[],
): CadCollisionHit[] {
  // Broad phase compartido con el motor de reglas (CAD-NEXT-101/102): un solo
  // núcleo geométrico y el barrido deja de ser O(n²). Los pares llegan en el
  // mismo orden (i<j asc) que el doble bucle, así el resultado es idéntico.
  const hits: CadCollisionHit[] = [];
  const aabbs = boxes.map(toAabb);
  for (const [i, j] of gridPairCandidates(aabbs)) {
    const hit = boxesOverlap(boxes[i], boxes[j]);
    if (hit) hits.push(hit);
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
  // Índice expandido por la holgura requerida: ningún par a distancia < required
  // se escapa (los que solapan comparten celda con expansión ≥ 0).
  const issues: CadClearanceIssue[] = [];
  const aabbs = boxes.map(toAabb);
  for (const [i, j] of gridPairCandidates(aabbs, Math.max(0, required))) {
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
  return issues;
}
