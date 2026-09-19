/**
 * Cómo se nombra UNA ARISTA de un sólido para que siga siendo la misma mañana.
 *
 * Hermano de `solid-face-ref.ts`: la cara se identifica por su plano, centroide
 * y área; la arista se identifica por sus dos extremos cuantizados y su diedro.
 *
 * La cuantización elimina la deriva entre dos evaluaciones del mismo árbol: el
 * kernel es facetado y las intersecciones producen flotantes distintos cada vez.
 * El paso de cuantización es relativo al tamaño del cuerpo, igual que en la cara.
 *
 * La resolución devuelve tres cosas:
 *  1. Casa por índice (O(1)).
 *  2. El índice falla pero exactamente una arista casa → se usa, `healed`.
 *  3. Cero o dos+ candidatas → fallo con motivo.
 */
import {
  BREP_TOLERANCE,
  aabbDiagonal,
  bodyBounds,
  edgeDihedralAngle,
  halfEdgeSegment,
  type BrepBody,
  type Vec3,
} from "../../brep";

/** Huella geométrica de una arista del B-rep. */
export interface CadSolidEdgeRef {
  /** Índice de la arista en `body.edges`, base 0. */
  edge: number;
  /** Extremo A cuantizado. */
  fromX: number;
  fromY: number;
  fromZ: number;
  /** Extremo B cuantizado. */
  toX: number;
  toY: number;
  toZ: number;
  /** Diedro en radianes, cuantizado. `null` si la arista es de borde. */
  dihedralRad: number | null;
}

export type CadEdgeRefResolution =
  | { ok: true; edge: number; healed: boolean }
  | { ok: false; reason: string; candidates: number[] };

function quantize(value: number, step: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value / step) * step + 0;
}

function linearStep(body: BrepBody): number {
  const diagonal = aabbDiagonal(bodyBounds(body));
  const scale = diagonal > 1e-12 ? diagonal : 1;
  return Math.max(BREP_TOLERANCE.linear, scale * 1e-9);
}

/** Orden canónico de los dos extremos: el que es lexicográficamente menor va primero. */
function canonicalEndpoints(
  a: Vec3,
  b: Vec3,
  step: number,
): { fx: number; fy: number; fz: number; tx: number; ty: number; tz: number } {
  const ax = quantize(a.x, step);
  const ay = quantize(a.y, step);
  const az = quantize(a.z, step);
  const bx = quantize(b.x, step);
  const by = quantize(b.y, step);
  const bz = quantize(b.z, step);
  // Orden canónico: el punto lexicográficamente menor es "from".
  if (ax < bx || (ax === bx && ay < by) || (ax === bx && ay === by && az < bz))
    return { fx: ax, fy: ay, fz: az, tx: bx, ty: by, tz: bz };
  return { fx: bx, fy: by, fz: bz, tx: ax, ty: ay, tz: az };
}

/** La huella de la arista `edge` del cuerpo `body`. */
export function cadEdgeRefFromBody(
  body: BrepBody,
  edge: number,
): CadSolidEdgeRef {
  if (edge < 0 || edge >= body.edges.length)
    throw new Error(
      `El cuerpo no tiene la arista ${edge}: tiene ${body.edges.length} arista(s), numeradas desde 0.`,
    );

  const step = linearStep(body);
  const seg = halfEdgeSegment(body, body.edges[edge].a);
  const { fx, fy, fz, tx, ty, tz } = canonicalEndpoints(seg.from, seg.to, step);
  const dihedral = edgeDihedralAngle(body, edge);
  const quantizedDihedral = dihedral !== null ? quantize(dihedral, step * 0.01) : null;

  return {
    edge,
    fromX: fx, fromY: fy, fromZ: fz,
    toX: tx, toY: ty, toZ: tz,
    dihedralRad: quantizedDihedral,
  };
}

function refsMatch(a: CadSolidEdgeRef, b: CadSolidEdgeRef): boolean {
  return (
    a.fromX === b.fromX && a.fromY === b.fromY && a.fromZ === b.fromZ &&
    a.toX === b.toX && a.toY === b.toY && a.toZ === b.toZ &&
    ((a.dihedralRad === null && b.dihedralRad === null) ||
     (a.dihedralRad !== null && b.dihedralRad !== null &&
      Math.abs(a.dihedralRad - b.dihedralRad) < 0.01))
  );
}

/**
 * Resuelve una referencia de arista contra un cuerpo.
 *
 * Primero intenta por índice (O(1)). Si la huella no casa, busca una arista
 * que sí lo haga. Si hay cero o dos+ candidatas, falla con motivo.
 */
export function resolveCadEdgeRef(
  ref: CadSolidEdgeRef,
  body: BrepBody,
): CadEdgeRefResolution {
  // 1. Por índice
  if (ref.edge >= 0 && ref.edge < body.edges.length) {
    const current = cadEdgeRefFromBody(body, ref.edge);
    if (refsMatch(ref, current)) return { ok: true, edge: ref.edge, healed: false };
  }

  // 2. Buscar candidata
  const candidates: number[] = [];
  for (let i = 0; i < body.edges.length; i++) {
    const current = cadEdgeRefFromBody(body, i);
    if (refsMatch(ref, current)) candidates.push(i);
  }

  if (candidates.length === 1) return { ok: true, edge: candidates[0], healed: true };
  if (candidates.length === 0)
    return { ok: false, reason: "ninguna arista del cuerpo coincide con la huella.", candidates };
  return { ok: false, reason: `${candidates.length} aristas coinciden con la huella.`, candidates };
}
