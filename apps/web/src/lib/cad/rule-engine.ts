/**
 * Motor de reglas transversal de AXOS CAD Next (CAD-NEXT-100).
 *
 * Sobre el `CadDocument` canónico corre un conjunto de reglas que revisan el
 * diseño y devuelven hallazgos accionables con las entidades implicadas — la
 * clase de gobierno que un ingeniero espera de un CAD serio (choques, holguras,
 * fuera de límites, ids duplicados) y la base de las reglas normativas por
 * industria. Las reglas son datos: se registran, se ordenan por severidad y NO
 * mutan el documento (proponen, no aplican — regla de la IA/optimización).
 *
 * Puro (sin three/DOM/Date.now): todo se testea en Node. Trabaja sobre la caja
 * envolvente alineada a ejes (AABB) de cada entidad de caja, teniendo en cuenta
 * la rotación; los círculos usan su caja envolvente (cota superior conservadora).
 */

import type { CadDocument, CadEntity } from "./cad-document";

export type RuleLevel = "error" | "warning" | "info";

export interface RuleFinding {
  ruleId: string;
  level: RuleLevel;
  message: string;
  /** Entidades implicadas (1 = local, 2 = relación/choque). */
  entityIds: string[];
}

export interface CadRule {
  id: string;
  label: string;
  evaluate: (doc: CadDocument) => RuleFinding[];
}

export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const LEVEL_ORDER: Record<RuleLevel, number> = { error: 0, warning: 1, info: 2 };

/** Sólo las entidades de caja tienen extensión revisable geométricamente. */
type BoxEntity = Extract<CadEntity, { type: "box" }>;
function boxes(doc: CadDocument): BoxEntity[] {
  return doc.entities.filter((e): e is BoxEntity => e.type === "box");
}

/**
 * Caja envolvente alineada a ejes de una entidad de caja, teniendo en cuenta la
 * rotación (medias-extensiones proyectadas). El ancla (x,y) es la esquina
 * superior-izquierda de la caja SIN rotar; se rota alrededor de su centro.
 */
export function boxAabb(e: BoxEntity): Aabb {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const rad = ((e.rotation || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const hx = (e.w / 2) * cos + (e.h / 2) * sin;
  const hy = (e.w / 2) * sin + (e.h / 2) * cos;
  return { minX: cx - hx, minY: cy - hy, maxX: cx + hx, maxY: cy + hy };
}

/** Separación entre dos AABB: negativa = solapan, 0 = tocan, positiva = holgura. */
export function aabbGap(a: Aabb, b: Aabb): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY);
  // Si solapan en ambos ejes la separación es negativa (la mayor penetración).
  if (dx < 0 && dy < 0) return Math.max(dx, dy);
  // Si están separados en algún eje, la distancia es por ese(esos) eje(s).
  if (dx >= 0 && dy >= 0) return Math.hypot(dx, dy);
  return Math.max(dx, dy);
}

// ---------------------------------------------------------------------------
// Índice espacial (broad phase) — CAD-NEXT-102
// ---------------------------------------------------------------------------

/**
 * Pares candidatos por rejilla hash: cada AABB (expandida por `expand`, p.ej.
 * la holgura mínima) se registra en las celdas que cubre; sólo los pares que
 * comparten celda se comparan después con `aabbGap` exacto. Baja el barrido de
 * O(n²) a ~O(n) en planos reales sin cambiar NINGÚN resultado: la fase exacta
 * decide, el índice sólo filtra. Los pares salen ordenados (i<j, ascendente)
 * para que el orden de los hallazgos sea idéntico al del barrido ingenuo.
 */
export function gridPairCandidates(aabbs: Aabb[], expand = 0): Array<[number, number]> {
  const n = aabbs.length;
  if (n < 2) return [];
  // Tamaño de celda ~ dimensión media de las cajas (+ expansión): equilibrio
  // entre celdas gigantes (degenera a O(n²)) y celdas diminutas (muchas celdas
  // por caja). Cota inferior 1 para planos degenerados.
  let sum = 0;
  for (const a of aabbs) sum += (a.maxX - a.minX + a.maxY - a.minY) / 2;
  const cell = Math.max(1, sum / n + expand * 2);
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const a = aabbs[i];
    const x0 = Math.floor((a.minX - expand) / cell);
    const x1 = Math.floor((a.maxX + expand) / cell);
    const y0 = Math.floor((a.minY - expand) / cell);
    const y1 = Math.floor((a.maxY + expand) / cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = `${cx}:${cy}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(i);
        else buckets.set(key, [i]);
      }
    }
  }
  const seen = new Set<number>();
  const pairs: Array<[number, number]> = [];
  for (const bucket of buckets.values()) {
    for (let a = 0; a < bucket.length; a++) {
      for (let b = a + 1; b < bucket.length; b++) {
        const i = Math.min(bucket[a], bucket[b]);
        const j = Math.max(bucket[a], bucket[b]);
        const key = i * n + j;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push([i, j]);
        }
      }
    }
  }
  return pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

// ---------------------------------------------------------------------------
// Reglas incorporadas
// ---------------------------------------------------------------------------

/** Ids duplicados: rompe undo/persistencia; siempre error. */
export const duplicateIdsRule: CadRule = {
  id: "duplicate-ids",
  label: "Ids duplicados",
  evaluate: (doc) => {
    const seen = new Map<string, number>();
    for (const e of doc.entities) seen.set(e.id, (seen.get(e.id) ?? 0) + 1);
    const findings: RuleFinding[] = [];
    for (const [id, count] of seen) {
      if (count > 1)
        findings.push({ ruleId: "duplicate-ids", level: "error", message: `El id "${id}" aparece ${count} veces.`, entityIds: [id] });
    }
    return findings;
  },
};

/** Solape entre cajas: dos objetos ocupan el mismo espacio. */
export const overlapRule: CadRule = {
  id: "overlap",
  label: "Solape entre objetos",
  evaluate: (doc) => {
    const list = boxes(doc);
    const aabbs = list.map(boxAabb);
    const findings: RuleFinding[] = [];
    for (const [i, j] of gridPairCandidates(aabbs)) {
      if (aabbGap(aabbs[i], aabbs[j]) < -1e-6) {
        findings.push({
          ruleId: "overlap",
          level: "warning",
          message: `"${list[i].label ?? list[i].id}" y "${list[j].label ?? list[j].id}" se solapan.`,
          entityIds: [list[i].id, list[j].id],
        });
      }
    }
    return findings;
  },
};

/** Fábrica: cajas que se salen del área de trabajo (footprint). */
export function withinBoundsRule(footprint: { w: number; h: number }): CadRule {
  return {
    id: "within-bounds",
    label: "Fuera del área de trabajo",
    evaluate: (doc) => {
      const findings: RuleFinding[] = [];
      for (const e of boxes(doc)) {
        const a = boxAabb(e);
        if (a.minX < -1e-6 || a.minY < -1e-6 || a.maxX > footprint.w + 1e-6 || a.maxY > footprint.h + 1e-6) {
          findings.push({
            ruleId: "within-bounds",
            level: "error",
            message: `"${e.label ?? e.id}" sobresale del área de trabajo.`,
            entityIds: [e.id],
          });
        }
      }
      return findings;
    },
  };
}

/** Fábrica: holgura mínima entre objetos (pasillos) que no solapan. */
export function minClearanceRule(minGap: number): CadRule {
  return {
    id: "min-clearance",
    label: "Holgura insuficiente",
    evaluate: (doc) => {
      const list = boxes(doc);
      const aabbs = list.map(boxAabb);
      const findings: RuleFinding[] = [];
      // Índice expandido por minGap: ningún par a distancia < minGap se escapa.
      for (const [i, j] of gridPairCandidates(aabbs, minGap)) {
        const gap = aabbGap(aabbs[i], aabbs[j]);
        if (gap >= 0 && gap < minGap - 1e-6) {
          findings.push({
            ruleId: "min-clearance",
            level: "warning",
            message: `"${list[i].label ?? list[i].id}" y "${list[j].label ?? list[j].id}" están a ${Math.round(gap)} (< ${minGap}).`,
            entityIds: [list[i].id, list[j].id],
          });
        }
      }
      return findings;
    },
  };
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export class RuleEngine {
  private rules: CadRule[];

  constructor(rules: CadRule[] = []) {
    this.rules = [...rules];
  }

  add(rule: CadRule): this {
    this.rules.push(rule);
    return this;
  }

  listRules(): CadRule[] {
    return [...this.rules];
  }

  /**
   * Corre todas las reglas y devuelve los hallazgos ordenados por severidad
   * (error → warning → info) y luego por regla, de forma estable.
   */
  run(doc: CadDocument): RuleFinding[] {
    const findings = this.rules.flatMap((rule) => {
      try {
        return rule.evaluate(doc);
      } catch {
        return [{ ruleId: rule.id, level: "error" as const, message: `La regla "${rule.id}" falló al evaluarse.`, entityIds: [] }];
      }
    });
    return findings.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
  }

  /** Resumen por severidad para paneles/badges. */
  summary(doc: CadDocument): Record<RuleLevel, number> {
    const counts: Record<RuleLevel, number> = { error: 0, warning: 0, info: 0 };
    for (const f of this.run(doc)) counts[f.level]++;
    return counts;
  }
}

/** Motor con las reglas universales cargadas (footprint opcional). */
export function createDefaultRuleEngine(options: { footprint?: { w: number; h: number }; minClearance?: number } = {}): RuleEngine {
  const engine = new RuleEngine([duplicateIdsRule, overlapRule]);
  if (options.footprint) engine.add(withinBoundsRule(options.footprint));
  if (options.minClearance && options.minClearance > 0) engine.add(minClearanceRule(options.minClearance));
  return engine;
}
