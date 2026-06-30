/** Pure CAD command registry smoke tests. Run: node_modules/.bin/ts-node --compiler-options '{"module":"commonjs"}' --project apps/web/tsconfig.json apps/web/src/lib/cad/commands/registry.spec.ts */
import { strict as assert } from "node:assert";
import {
  CAD_COMMAND_REGISTRY,
  executeCadCommand,
  parseCadCommand,
  previewCadCommand,
  pushHistory,
  createHistoryItem,
  undoHistory,
  redoHistory,
} from "./index";
import type { CadCommandContext } from "./types";
import type { CadCommandHistoryState } from "./history";

const ctx: CadCommandContext = {
  unit: "mm",
  footprintW: 10000,
  footprintH: 6000,
  selectedIds: ["smt", "aoi", "pack"],
  connectors: [],
  objects: [
    {
      id: "smt",
      type: "station",
      label: "SMT",
      x: 100,
      y: 100,
      w: 1000,
      h: 600,
      sequence: 1,
    },
    {
      id: "aoi",
      type: "station",
      label: "Inspección AOI",
      x: 1500,
      y: 100,
      w: 800,
      h: 600,
      sequence: 2,
    },
    {
      id: "pack",
      type: "station",
      label: "Empaque",
      x: 2600,
      y: 100,
      w: 900,
      h: 600,
      sequence: 3,
    },
  ],
};

assert.equal(
  new Set(CAD_COMMAND_REGISTRY.map((c) => c.id)).size,
  CAD_COMMAND_REGISTRY.length,
  "registry ids are unique",
);
assert.equal(
  CAD_COMMAND_REGISTRY.length,
  12,
  "registry exposes 12 commands",
);

const parsed = parseCadCommand("haz un pasillo de 1.2m entre SMT e inspección");
assert.equal(parsed.ok, true, "parser detects clearance aisle");
assert.equal(parsed.input?.id, "create_clearance_aisle");

const preview = previewCadCommand(parsed.input!, ctx);
assert.equal(
  preview.affectedObjectIds.length,
  2,
  "preview reports affected objects",
);
assert.equal(preview.operations[0]?.type, "move", "preview proposes a move");

const invalid = executeCadCommand(
  { id: "distribute_selection", axis: "horizontal", objectIds: ["smt"] },
  ctx,
);
assert.equal(invalid.applied, false, "executor does not apply invalid command");
assert.equal(
  invalid.issues.some((i) => i.code === "selection_too_small"),
  true,
  "validator reports selection issue",
);

const flowPreview = previewCadCommand(
  { id: "connect_flow", objectIds: ["smt", "aoi", "pack"] },
  ctx,
);
assert.equal(
  flowPreview.operations.some((op) => op.type === "report"),
  true,
  "connect flow includes flow metrics report",
);

const arrangePreview = previewCadCommand(
  { id: "arrange_line", direction: "left_to_right", objectIds: ["smt", "aoi"] },
  ctx,
);
assert.equal(
  arrangePreview.operations.some((op) => op.type === "report"),
  true,
  "arrange line includes post-flow score report",
);

const flowLinePreview = previewCadCommand(
  {
    id: "arrange_flow_line",
    direction: "left_to_right",
    objectIds: ["smt", "aoi", "pack"],
    gap: 250,
  },
  ctx,
);
assert.equal(
  flowLinePreview.operations.filter((op) => op.type === "move").length,
  3,
  "flow line moves every object",
);
assert.equal(
  flowLinePreview.operations.filter((op) => op.type === "connect").length,
  2,
  "flow line creates connectors between sequence steps",
);
assert.equal(
  flowLinePreview.operations.some(
    (op) => op.type === "report" && op.title === "Linea de flujo",
  ),
  true,
  "flow line includes score report",
);
assert.equal(
  parseCadCommand("acomoda y conecta la linea de flujo").input?.id,
  "arrange_flow_line",
  "parser recognizes arrange and connect flow line intent",
);

const rackCtx: CadCommandContext = {
  ...ctx,
  footprintW: 12000,
  footprintH: 9000,
  selectedIds: ["rack-1", "rack-2", "rack-3", "rack-4"],
  objects: [
    {
      id: "rack-1",
      type: "asset",
      label: "Rack A1",
      x: 5000,
      y: 100,
      w: 1200,
      h: 900,
    },
    {
      id: "rack-2",
      type: "asset",
      label: "Rack A2",
      x: 5000,
      y: 1200,
      w: 1200,
      h: 900,
    },
    {
      id: "rack-3",
      type: "asset",
      label: "Rack B1",
      x: 5000,
      y: 2300,
      w: 1200,
      h: 900,
    },
    {
      id: "rack-4",
      type: "asset",
      label: "Rack B2",
      x: 5000,
      y: 3400,
      w: 1200,
      h: 900,
    },
  ],
};

const lineBalancePreview = previewCadCommand(
  {
    id: "analyze_line_balance",
    taktTimeSec: 45,
    cycleTimes: { smt: 38, aoi: 52, pack: 41 },
  },
  ctx,
);
assert.equal(
  lineBalancePreview.operations.some(
    (op) => op.type === "report" && op.title === "Balanceo de linea",
  ),
  true,
  "line balance emits a balance report",
);
assert.equal(
  lineBalancePreview.issues.some(
    (issue) => issue.code === "line_balance_over_takt",
  ),
  true,
  "line balance warns when a station is over takt",
);
assert.equal(
  parseCadCommand("analiza balanceo de linea takt 45s").input?.id,
  "analyze_line_balance",
  "parser recognizes line balance intent",
);

const rackParsed = parseCadCommand(
  "acomoda racks en 2 filas con pasillo de 3m",
);
assert.equal(
  rackParsed.input?.id,
  "arrange_rack_rows",
  "parser recognizes rack row intent before generic aisle commands",
);
assert.equal(
  rackParsed.input?.id === "arrange_rack_rows"
    ? rackParsed.input.aisleWidth
    : undefined,
  3000,
  "parser converts rack aisle metres to millimetres",
);
const rackPreview = previewCadCommand(
  {
    id: "arrange_rack_rows",
    rows: 2,
    baysPerRow: 2,
    aisleWidth: 3000,
    objectIds: ["rack-1", "rack-2", "rack-3", "rack-4"],
  },
  rackCtx,
);
assert.equal(
  rackPreview.operations.filter((op) => op.type === "move").length,
  4,
  "rack rows move every selected rack",
);
assert.equal(
  rackPreview.operations.some(
    (op) => op.type === "report" && op.title === "Filas de racks",
  ),
  true,
  "rack rows include a layout report",
);
const expandedRackPreview = previewCadCommand(
  {
    id: "arrange_rack_rows",
    rows: 1,
    baysPerRow: 2,
    objectIds: ["rack-1", "rack-2", "rack-3", "rack-4"],
  },
  rackCtx,
);
assert.equal(
  expandedRackPreview.issues.some(
    (issue) => issue.code === "rack_row_capacity_expanded",
  ),
  true,
  "rack rows warn when requested row capacity is too small",
);

const collisionPreview = previewCadCommand(
  { id: "find_collisions" },
  {
    ...ctx,
    objects: [
      ctx.objects[0],
      { ...ctx.objects[0], id: "overlap", label: "Overlap", x: 500 },
    ],
  },
);
assert.equal(
  collisionPreview.affectedObjectIds.includes("smt"),
  true,
  "collision preview reports object ids",
);
assert.equal(
  collisionPreview.issues.some((issue) => issue.code === "collisions_found"),
  true,
  "collision preview warns when overlaps exist",
);

const validatePreview = previewCadCommand(
  { id: "validate_layout" },
  {
    ...ctx,
    objects: [
      ctx.objects[0],
      { ...ctx.objects[0], id: "overlap", label: "Overlap", x: 500 },
    ],
  },
);
assert.equal(
  validatePreview.operations.some(
    (op) => op.type === "report" && op.title === "Validación de layout",
  ),
  true,
  "validate layout emits a combined validation report",
);
assert.equal(
  validatePreview.issues.some((issue) => issue.code === "layout_critical"),
  true,
  "validate layout flags critical severity on collisions",
);
assert.equal(
  parseCadCommand("valida el layout").input?.id,
  "validate_layout",
  "parser recognizes validate layout intent",
);

let history: CadCommandHistoryState = { undo: [], redo: [] };
history = pushHistory(
  history,
  createHistoryItem(parsed.input!, "applied", preview.summary, preview, {
    ...preview,
    applied: true,
    historyLabel: preview.summary,
  }),
);
const undone = undoHistory(history);
assert.equal(
  undone.item?.commandId,
  "create_clearance_aisle",
  "undo returns last command",
);
const redone = redoHistory(undone.state);
assert.equal(
  redone.item?.commandId,
  "create_clearance_aisle",
  "redo returns undone command",
);

console.log("cad command registry specs passed");
