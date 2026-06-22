/**
 * Pure Clear-to-Build readiness derivation for the legacy production plan.
 *
 * Replaces the old hard-coded `green` mock in `PlansService.calculateReadiness`:
 * the release semaphore now reflects REAL state read from existing tables — the
 * WO's material demand (its picked BOM) vs available inventory, active quality
 * holds on those parts, and the commit date for shipping. Kept side-effect-free
 * so the rules are unit-tested without a database; the service just gathers the
 * inputs and delegates here.
 *
 * Mirrors the criterion the WO board already uses on the floor
 * (`apps/web/.../production-plan/wo-board.ts#computeClearToBuild`) so Planning
 * and the floor agree on what "listo para construir" means.
 */

export type ReadinessLight = 'green' | 'yellow' | 'red' | 'unknown';

export interface ReadinessDemandLine {
  partNumber: string;
  quantityRequired: number;
  description?: string | null;
  unit?: string | null;
}

export interface ReadinessShortage {
  partNumber: string;
  description: string | null;
  required: number;
  available: number;
  shortage: number;
  unit: string;
}

export interface ReadinessDetail {
  totalParts: number;
  shortParts: number;
  shortages: ReadinessShortage[];
  heldParts: string[];
  dueDate: string | null;
  daysToDue: number | null;
  reasons: string[];
}

export interface ReadinessSummary {
  materials: ReadinessLight;
  quality: ReadinessLight;
  shipping: ReadinessLight;
  detail: ReadinessDetail;
  timestamp: Date;
}

export interface ReadinessInput {
  /** The WO's material demand (its exploded/picked BOM). */
  demand: ReadinessDemandLine[];
  /** partNumber → available qty (onHand − allocated, only `available` stock). */
  availableByPart: Map<string, number>;
  /** Part numbers under an active quality hold that blocks this WO. */
  heldParts: Set<string>;
  /** The plan's commit/due date, if any. */
  dueDate: Date | null;
  now?: Date;
}

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
};

const startOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/**
 * Derive the materials/quality/shipping semaphore from already-read data.
 *
 * - materials: explode the demand vs available inventory. green = nothing short,
 *   yellow = some parts short, red = every part short, unknown = no BOM/kit to
 *   judge against.
 * - quality: red if any of the WO's parts is under an active hold; green if not;
 *   unknown when there is no demand to evaluate.
 * - shipping: schedule feasibility against the commit date — red (past due),
 *   yellow (due today), green (still ahead), unknown (no committed date).
 */
export function deriveReadiness(input: ReadinessInput): ReadinessSummary {
  const now = input.now ?? new Date();
  const availableByPart = input.availableByPart ?? new Map<string, number>();
  const heldSet = input.heldParts ?? new Set<string>();
  const demand = (input.demand ?? []).filter((d) => !!d.partNumber);
  const reasons: string[] = [];

  // ── Materials: demand vs available inventory ───────────────────────────────
  const shortages: ReadinessShortage[] = [];
  const totalParts = demand.length;
  for (const line of demand) {
    const required = round(Number(line.quantityRequired) || 0);
    const available = round(availableByPart.get(line.partNumber) ?? 0);
    const shortage = round(Math.max(0, required - available));
    if (shortage > 0) {
      shortages.push({
        partNumber: line.partNumber,
        description: line.description ?? null,
        required,
        available,
        shortage,
        unit: line.unit ?? 'EA',
      });
    }
  }
  shortages.sort((a, b) => b.shortage - a.shortage);
  const shortParts = shortages.length;

  let materials: ReadinessLight;
  if (totalParts === 0) {
    materials = 'unknown';
    reasons.push(
      'Sin lista de materiales (BOM/kit) para evaluar disponibilidad.',
    );
  } else if (shortParts === 0) {
    materials = 'green';
  } else if (shortParts === totalParts) {
    materials = 'red';
    reasons.push(
      `Faltante total: ${shortParts} de ${totalParts} materiales sin existencia.`,
    );
  } else {
    materials = 'yellow';
    reasons.push(`${shortParts} de ${totalParts} materiales con faltante.`);
  }

  // ── Quality: any of the WO's parts under an active hold ────────────────────
  const heldParts = [
    ...new Set(demand.map((d) => d.partNumber).filter((pn) => heldSet.has(pn))),
  ];
  let quality: ReadinessLight;
  if (totalParts === 0) {
    quality = 'unknown';
  } else if (heldParts.length > 0) {
    quality = 'red';
    reasons.push(
      `Retención de calidad activa en ${heldParts.length} material(es).`,
    );
  } else {
    quality = 'green';
  }

  // ── Shipping: schedule feasibility against the commit date ─────────────────
  let shipping: ReadinessLight;
  let daysToDue: number | null = null;
  const dueValid =
    input.dueDate && !Number.isNaN(new Date(input.dueDate).getTime());
  if (!dueValid) {
    shipping = 'unknown';
    reasons.push('Sin fecha compromiso para evaluar embarque.');
  } else {
    const due = startOfDay(new Date(input.dueDate as Date));
    daysToDue = Math.round(
      (due.getTime() - startOfDay(now).getTime()) / 86_400_000,
    );
    if (daysToDue < 0) {
      shipping = 'red';
      reasons.push(`Fecha compromiso vencida hace ${Math.abs(daysToDue)} d.`);
    } else if (daysToDue === 0) {
      shipping = 'yellow';
      reasons.push('Vence hoy (ventana de embarque ajustada).');
    } else {
      shipping = 'green';
    }
  }

  return {
    materials,
    quality,
    shipping,
    detail: {
      totalParts,
      shortParts,
      shortages,
      heldParts,
      dueDate: dueValid ? new Date(input.dueDate as Date).toISOString() : null,
      daysToDue,
      reasons,
    },
    timestamp: now,
  };
}
