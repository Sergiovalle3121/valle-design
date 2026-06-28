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
  9,
  "initial registry exposes 9 commands",
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
