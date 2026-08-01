// Contrato de extensiones de análisis: sin analítica registrada (edición
// Design sin paquete industrial) los comandos degradan con aviso y el reporte
// de validación omite la sección de flujo; con analítica registrada se
// comportan como siempre (eso lo cubren registry.spec y validation-report.spec).
import { strict as assert } from "node:assert";
import {
  getCadAnalysisExtensions,
  registerCadAnalysisExtensions,
} from "./analysis-extensions";
import { previewCadCommand } from "./commands/index";
import type { CadBox, CadCommandContext } from "./commands/types";
import { buildCadValidationReport } from "./validation-report";

const boxes: CadBox[] = [
  { id: "a", type: "station", label: "A", x: 0, y: 0, w: 100, h: 100 },
  { id: "b", type: "station", label: "B", x: 300, y: 0, w: 100, h: 100 },
  { id: "c", type: "station", label: "C", x: 600, y: 0, w: 100, h: 100 },
];
const ctx: CadCommandContext = {
  unit: "mm",
  footprintW: 10000,
  footprintH: 6000,
  objects: boxes,
  selectedIds: ["a", "b", "c"],
  connectors: [],
};

const previous = getCadAnalysisExtensions();
try {
  registerCadAnalysisExtensions(undefined);

  // analyze_line_balance: degrada con aviso explícito, sin operaciones.
  const balance = previewCadCommand(
    { id: "analyze_line_balance", objectIds: ["a", "b", "c"] },
    ctx,
  );
  assert.equal(balance.operations.length, 0);
  assert.ok(
    balance.issues.some((issue) => issue.code === "analysis_pack_missing"),
    "analyze_line_balance debe avisar que falta el paquete de análisis",
  );

  // trace_material_route: ídem.
  const route = previewCadCommand(
    { id: "trace_material_route", objectIds: ["a", "b", "c"] },
    ctx,
  );
  assert.equal(route.operations.length, 0);
  assert.ok(
    route.issues.some((issue) => issue.code === "analysis_pack_missing"),
    "trace_material_route debe avisar que falta el paquete de análisis",
  );

  // arrange_flow_line: sigue FUNCIONANDO (acomoda y conecta); solo omite el
  // score de flujo del reporte.
  const arrange = previewCadCommand(
    { id: "arrange_flow_line", objectIds: ["a", "b", "c"] },
    ctx,
  );
  assert.ok(
    arrange.operations.some((op) => op.type === "move"),
    "arrange_flow_line debe seguir proponiendo movimientos sin analítica",
  );
  assert.ok(
    !arrange.issues.some((issue) => issue.code === "analysis_pack_missing"),
    "arrange_flow_line no debe bloquearse por falta de analítica",
  );

  // Reporte de validación: sin analítica no hay sección de flujo.
  const report = buildCadValidationReport({
    boxes: [
      { id: "a", x: 0, y: 0, width: 10, height: 10 },
      { id: "b", x: 30, y: 0, width: 10, height: 10 },
    ],
    flowNodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 30, y: 0 },
    ],
  });
  assert.equal(
    report.flow,
    undefined,
    "sin analítica registrada el reporte omite flow",
  );

  // Con analítica registrada, la sección de flujo vuelve.
  registerCadAnalysisExtensions({
    scoreFlowLayout: () => ({
      totalDistance: 30,
      crossingCount: 0,
      backtrackingCount: 0,
      score: 100,
      suggestions: [],
    }),
    buildLineBalanceReport: () => {
      throw new Error("no usado en este spec");
    },
    buildMaterialRouteReport: () => {
      throw new Error("no usado en este spec");
    },
  });
  const withFlow = buildCadValidationReport({
    boxes: [{ id: "a", x: 0, y: 0, width: 10, height: 10 }],
    flowNodes: [{ id: "a", x: 0, y: 0 }],
  });
  assert.equal(withFlow.flow?.score, 100, "con analítica el reporte trae flow");
} finally {
  registerCadAnalysisExtensions(previous);
}

console.log("analysis-extensions.spec: OK");
