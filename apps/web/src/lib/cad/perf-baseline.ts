/**
 * Baseline de rendimiento de AXOS CAD Next (CAD-NEXT-050).
 *
 * Mide las operaciones canónicas del CAD sobre un plano sintético de N
 * entidades: adaptar el layout al `CadDocument`, serializarlo, correr el motor
 * de reglas y hacer el round-trip DXF (export + import con el parser real).
 * El generador es DETERMINISTA (LCG con semilla, sin `Math.random`) para que
 * dos corridas midan exactamente el mismo trabajo y los números sean
 * comparables entre commits — un baseline de verdad, no una foto borrosa.
 *
 * No impone umbrales agresivos en CI (el hardware varía); el spec exige sanidad
 * estructural y cotas holgadas, y los números medidos se registran en la
 * auditoría del programa.
 */

import {
  layoutToCadDocument,
  serializeCadDocument,
  type CadDocument,
  type LayoutInput,
} from "./cad-document";
import { createDefaultRuleEngine } from "./rule-engine";
import { exportCadDxf } from "./dxf-export";
import { importDxfPrimitives, type CadDxfPrimitive } from "./dxf-import";

/** Congruencial lineal clásico: reproducible en cualquier runtime. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export interface SyntheticLayoutOptions {
  /** Número de assets a generar. */
  entities: number;
  seed?: number;
  /** Lado de la celda de la rejilla de colocación (evita solapes masivos). */
  cellSize?: number;
}

/**
 * Plano sintético determinista: assets en rejilla (mezcla de cajas y círculos),
 * una anotación por cada 10 assets y un conector por cada 20.
 */
export function buildSyntheticLayout(options: SyntheticLayoutOptions): {
  layout: LayoutInput;
  footprint: { w: number; h: number };
} {
  const count = Math.max(1, Math.floor(options.entities));
  const cell = options.cellSize ?? 4000;
  const rng = makeRng(options.seed ?? 42);
  const columns = Math.ceil(Math.sqrt(count));
  const layout: Required<LayoutInput> = { assets: [], annotations: [], connectors: [], layers: [] };

  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const isCircle = rng() < 0.3;
    const w = 2000 + Math.round(rng() * 1000);
    const size = isCircle ? { w, h: w } : { w, h: 1500 + Math.round(rng() * 1000) };
    // Centrado en su celda: la AABB (incluso rotada 90°) nunca sale de la celda,
    // así el plano es limpio por construcción y las reglas miden el barrido puro.
    const cx = col * cell + cell / 2;
    const cy = row * cell + cell / 2;
    layout.assets.push({
      id: `syn_${i}`,
      kind: isCircle ? "zone" : "machine",
      x: Math.round(cx - size.w / 2),
      y: Math.round(cy - size.h / 2),
      w: size.w,
      h: size.h,
      rotation: rng() < 0.2 ? 90 : 0,
      label: `Obj ${i}`,
      layer: i % 3 === 0 ? "architecture" : "equipment",
      ...(isCircle ? { shape: "circle" as const } : {}),
    });
    if (i % 10 === 0) {
      layout.annotations.push({ id: `note_${i}`, type: "text", x: col * cell, y: row * cell, text: `Nota ${i}` });
    }
    if (i % 20 === 0 && i > 0) {
      layout.connectors.push({ from: `syn_${i - 20}`, to: `syn_${i}` });
    }
  }
  layout.layers.push(
    { id: "architecture", name: "Arquitectura", color: "#888", visible: true, locked: false },
    { id: "equipment", name: "Equipo", color: "#4af", visible: true, locked: false },
  );
  const rows = Math.ceil(count / columns);
  return { layout, footprint: { w: columns * cell, h: rows * cell } };
}

export interface CadPerfTimings {
  adaptMs: number;
  serializeMs: number;
  rulesMs: number;
  dxfExportMs: number;
  dxfImportMs: number;
  totalMs: number;
}

export interface CadPerfBaselineResult {
  entities: number;
  documentEntities: number;
  serializedBytes: number;
  ruleFindings: number;
  dxfEntityCount: number;
  dxfReimportedPrimitives: number;
  timings: CadPerfTimings;
}

function docToDxfPrimitives(doc: CadDocument): CadDxfPrimitive[] {
  const primitives: CadDxfPrimitive[] = [];
  for (const e of doc.entities) {
    if (e.type !== "box") continue;
    if (e.shape === "circle") {
      primitives.push({
        kind: "circle",
        layer: e.layer,
        points: [{ x: e.x + e.w / 2, y: e.y + e.h / 2 }],
        radius: e.w / 2,
      });
    } else {
      primitives.push({
        kind: "rect",
        layer: e.layer,
        points: [
          { x: e.x, y: e.y },
          { x: e.x + e.w, y: e.y + e.h },
        ],
      });
    }
  }
  return primitives;
}

/** Corre el baseline completo sobre un plano sintético de `entities` assets. */
export function runCadPerfBaseline(options: SyntheticLayoutOptions): CadPerfBaselineResult {
  const { layout, footprint } = buildSyntheticLayout(options);
  const now = () => performance.now();

  const t0 = now();
  const doc = layoutToCadDocument(layout);
  const t1 = now();
  const serialized = serializeCadDocument(doc);
  const t2 = now();
  const findings = createDefaultRuleEngine({ footprint, minClearance: 500 }).run(doc);
  const t3 = now();
  const exported = exportCadDxf({ primitives: docToDxfPrimitives(doc) });
  const t4 = now();
  const reimported = importDxfPrimitives(exported.content);
  const t5 = now();

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    entities: layout.assets?.length ?? 0,
    documentEntities: doc.entities.length,
    serializedBytes: serialized.length,
    ruleFindings: findings.length,
    dxfEntityCount: exported.entityCount,
    dxfReimportedPrimitives: reimported.primitives.length,
    timings: {
      adaptMs: round(t1 - t0),
      serializeMs: round(t2 - t1),
      rulesMs: round(t3 - t2),
      dxfExportMs: round(t4 - t3),
      dxfImportMs: round(t5 - t4),
      totalMs: round(t5 - t0),
    },
  };
}
