#!/usr/bin/env node
/**
 * Sonda de la matriz AUDIT: por cada defecto del corpus de geometría
 * degenerada y de referencias colgantes, ¿lo detecta AUDIT, lo repara, y qué
 * declara al hacerlo?
 *
 * Corre los detectores y reparadores REALES contra una entidad representativa
 * de cada defecto — no adivina el resultado, lo mide: aplica el borrado que
 * `cadAuditGeometryRepairCommands`/`cadAuditReferenceRepairCommands` proponen
 * y vuelve a detectar sobre lo que queda, para que `reparado: true` signifique
 * «un segundo AUDIT no encuentra nada», no una promesa sin comprobar.
 */
import {
  cadAuditGeometryRepairCommands,
  detectCadAuditGeometryDefects,
  type CadAuditGeometryDefectKind,
} from "../src/lib/cad/audit/geometry";
import {
  cadAuditReferenceRepairCommands,
  detectCadAuditReferenceDefects,
  type CadAuditReferenceDefectKind,
} from "../src/lib/cad/audit/references";
import type { CadEntity } from "../src/lib/cad/cad-document";

interface MatrixRow {
  kind: string;
  category: "geometry" | "reference";
  entrada: string;
  detectado: boolean;
  reparado: boolean;
  declara: string;
}

const geometryFixtures: Record<CadAuditGeometryDefectKind, { entrada: string; entity: CadEntity }> = {
  "zero-length-line": {
    entrada: "una LINE cuyos dos extremos son el mismo punto",
    entity: { id: "g1", type: "line", start: { x: 5, y: 5, z: 0 }, end: { x: 5, y: 5, z: 0 }, layer: "0" },
  },
  "degenerate-polyline": {
    entrada: "una POLYLINE cuyos vértices son todos la misma posición",
    entity: {
      id: "g2", type: "polyline", closed: true,
      vertices: [{ x: 1, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }], layer: "0",
    },
  },
  "zero-radius-circle": {
    entrada: "un CIRCLE de radio 0 (el motor lo degrada: lo conserva sin dibujar nada)",
    entity: { id: "g3", type: "circle", center: { x: 300, y: 300, z: 0 }, radius: 0, layer: "0" },
  },
  "zero-radius-arc": {
    entrada: "un ARC de radio 0",
    entity: {
      id: "g4", type: "arc", center: { x: 1000, y: 1000, z: 0 }, radius: 0,
      startAngle: 0, endAngle: 90, layer: "0",
    },
  },
  "degenerate-ellipse": {
    entrada: "una ELLIPSE con el eje mayor colapsado a (0,0)",
    entity: {
      id: "g5", type: "ellipse", center: { x: 77, y: 33, z: 0 }, majorAxis: { x: 0, y: 0, z: 0 },
      ratio: 0.5, startParameter: 0, endParameter: 360, layer: "0",
    },
  },
  "degenerate-spline": {
    entrada: "una SPLINE con un solo punto de control",
    entity: { id: "g6", type: "spline", degree: 3, controlPoints: [{ x: 500, y: 500, z: 0 }], knots: [], layer: "0" },
  },
};

function checkGeometryFixture(kind: CadAuditGeometryDefectKind): MatrixRow {
  const { entrada, entity } = geometryFixtures[kind];
  const before = detectCadAuditGeometryDefects([entity]);
  const detectado = before.some((defect) => defect.kind === kind);
  const repairCommands = cadAuditGeometryRepairCommands(before);
  const deletedIds = new Set(repairCommands.filter((command) => command.type === "delete").map((command) => command.entityId));
  const after = detectCadAuditGeometryDefects([entity].filter((candidate) => !deletedIds.has(candidate.id)));
  return {
    kind,
    category: "geometry",
    entrada,
    detectado,
    reparado: detectado && after.length === 0,
    declara: before.find((defect) => defect.kind === kind)?.detail ?? "",
  };
}

const referenceFixtures: Record<CadAuditReferenceDefectKind, { entrada: string; entities: CadEntity[] }> = {
  "broken-dimension": {
    entrada: "una DIMENSION asociativa cuyas referencias apuntan a entidades borradas",
    entities: [{
      id: "r1", type: "dimension", a: { x: 0, y: 0 }, b: { x: 10, y: 0 },
      dimensionKind: "linear", axis: "x", associative: true, associationStatus: "associated",
      references: [{ entityId: "borrada-1", anchor: "start" }, { entityId: "borrada-2", anchor: "end" }],
      layer: "0",
    }],
  },
  "orphan-opening": {
    entrada: "un OPENING cuyo muro anfitrión ya no está en el documento",
    entities: [{ id: "r2", type: "opening", hostId: "muro-inexistente", layer: "0" } as unknown as CadEntity],
  },
  "missing-block-insert": {
    entrada: "un INSERT que nombra un bloque que el documento no declara",
    entities: [{
      id: "r3", type: "insert", block: "PLANTA-ESTRUCTURAL", insertion: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "0",
    }],
  },
};

function checkReferenceFixture(kind: CadAuditReferenceDefectKind): MatrixRow {
  const { entrada, entities } = referenceFixtures[kind];
  const before = detectCadAuditReferenceDefects({ entities, blocks: [] });
  const detectado = before.some((defect) => defect.kind === kind);
  const repairCommands = cadAuditReferenceRepairCommands(before);
  const deletedIds = new Set(repairCommands.filter((command) => command.type === "delete").map((command) => command.entityId));
  const survivors = entities.filter((entity) => !deletedIds.has(entity.id));
  const after = detectCadAuditReferenceDefects({ entities: survivors, blocks: [] });
  return {
    kind,
    category: "reference",
    entrada,
    detectado,
    reparado: detectado && after.length === 0,
    declara: before.find((defect) => defect.kind === kind)?.detail ?? "",
  };
}

const rows: MatrixRow[] = [
  ...(Object.keys(geometryFixtures) as CadAuditGeometryDefectKind[]).map(checkGeometryFixture),
  ...(Object.keys(referenceFixtures) as CadAuditReferenceDefectKind[]).map(checkReferenceFixture),
];

const evidence = {
  generatedBy: "apps/web/scripts/audit-repair-matrix-probe.mts",
  resumen: {
    total: rows.length,
    detectados: rows.filter((row) => row.detectado).length,
    reparados: rows.filter((row) => row.reparado).length,
  },
  filas: rows,
  limite:
    "Cubre los defectos que AUDIT sabe nombrar hoy: geometría degenerada (LINE/POLYLINE/CIRCLE/ARC/" +
    "ELLIPSE/SPLINE) y tres formas de referencia colgante (cota rota, vano sin muro, INSERT a bloque " +
    "inexistente). Capas/bloques/estilos huérfanos y duplicados exactos AUDIT también los reporta y " +
    "repara, delegando en PURGE/OVERKILL respectivamente — no se repiten aquí porque su matriz de " +
    "evidencia ya es la de esos dos comandos, no una nueva.",
};

process.stdout.write(JSON.stringify(evidence, null, 2));
