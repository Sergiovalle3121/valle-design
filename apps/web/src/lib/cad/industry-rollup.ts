/**
 * Resumen / BOM de objetos inteligentes de Industry Packs (CAD-NEXT-098).
 *
 * La ventaja de AXOS CAD sobre un CAD genérico es que sabe QUÉ es cada objeto:
 * un CAD normal ve rectángulos, AXOS ve racks de pallets, góndolas, camas. Por
 * eso puede responder lo que AutoCAD no: "¿cuántas posiciones de pallet tiene
 * este almacén?", "¿cuántos facings de exhibición?", "¿cuántas camas?".
 *
 * Este módulo agrega los objetos de pack COLOCADOS (identificados por su
 * objectId) usando el tamaño ACTUAL de cada instancia para re-calcular sus
 * métricas de negocio (vía `calculatePlaced`), y las suma por objeto y por
 * industria. Puro y determinista: mismo input → mismo output, orden estable.
 */

import type { IndustryPackRegistry } from "./industry-pack";

/** Un objeto de pack colocado en el plano, con su tamaño actual. */
export interface PlacedIndustryObject {
  objectId: string;
  /** Ancho actual del asset en el editor (mm). */
  w: number;
  /** Alto/fondo actual del asset en el editor (mm). */
  h: number;
}

/** Fila del resumen por objeto de pack. */
export interface IndustryObjectRollup {
  objectId: string;
  label: string;
  industry: string;
  count: number;
  /** Métricas de negocio SUMADAS sobre todas las instancias (redondeadas). */
  metrics: Record<string, number>;
}

/** Fila del rollup por industria. */
export interface IndustryRollup {
  industry: string;
  objectCount: number;
  instanceCount: number;
}

export interface IndustrySummary {
  objects: IndustryObjectRollup[];
  industries: IndustryRollup[];
  /** Total de instancias de pack en el plano. */
  totalInstances: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Agrega los objetos de pack colocados. Los objetos que no pertenecen a ningún
 * pack registrado se ignoran (no son objetos inteligentes). Las métricas se
 * suman por clave; si distintas instancias del mismo objeto exponen claves
 * diferentes, cada clave suma sólo donde aparece.
 */
export function summarizeIndustryObjects(
  items: PlacedIndustryObject[],
  registry: IndustryPackRegistry,
): IndustrySummary {
  const byObject = new Map<string, IndustryObjectRollup>();

  for (const item of items) {
    const def = registry.getObject(item.objectId);
    if (!def) continue; // no es un objeto inteligente registrado
    let row = byObject.get(item.objectId);
    if (!row) {
      row = {
        objectId: item.objectId,
        label: def.label,
        industry: def.industry,
        count: 0,
        metrics: {},
      };
      byObject.set(item.objectId, row);
    }
    row.count += 1;
    const metrics = registry.calculatePlaced(item.objectId, item.w, item.h);
    for (const [key, value] of Object.entries(metrics)) {
      if (!Number.isFinite(value)) continue;
      row.metrics[key] = round2((row.metrics[key] ?? 0) + value);
    }
  }

  const objects = [...byObject.values()].sort((a, b) =>
    a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0,
  );

  const byIndustry = new Map<string, IndustryRollup>();
  for (const row of objects) {
    let ind = byIndustry.get(row.industry);
    if (!ind) {
      ind = { industry: row.industry, objectCount: 0, instanceCount: 0 };
      byIndustry.set(row.industry, ind);
    }
    ind.objectCount += 1;
    ind.instanceCount += row.count;
  }
  const industries = [...byIndustry.values()].sort((a, b) =>
    a.industry < b.industry ? -1 : a.industry > b.industry ? 1 : 0,
  );

  return {
    objects,
    industries,
    totalInstances: objects.reduce((sum, row) => sum + row.count, 0),
  };
}
