import { strict as assert } from "node:assert";
import { executeCadCommand, parseCadCommand, previewCadCommand } from "./index";
import type { CadCommandContext } from "./types";

const context: CadCommandContext = {
  unit: "mm",
  footprintW: 20_000,
  footprintH: 10_000,
  selectedIds: [],
  objects: [
    {
      id: "wall-a",
      type: "asset",
      kind: "wall",
      label: "Muro A",
      x: 0,
      y: 0,
      w: 2000,
      h: 100,
      rotation: 0,
    },
    {
      id: "wall-duplicate",
      type: "asset",
      kind: "wall",
      label: "Muro duplicado",
      x: 0.4,
      y: 0.3,
      w: 2000,
      h: 100,
      rotation: 0,
    },
    {
      id: "wall-near-ortho",
      type: "asset",
      kind: "wall",
      label: "Muro casi ortogonal",
      x: 0,
      y: 500,
      w: 1000,
      h: 100,
      rotation: 90.5,
    },
    {
      id: "wall-tiny",
      type: "asset",
      kind: "wall",
      label: "Muro corto",
      x: 4000,
      y: 0,
      w: 3,
      h: 1,
      rotation: 0,
    },
  ],
};

const parsed = parseCadCommand("limpia la geometría con tolerancia 1");
assert.equal(parsed.ok, true, "command line recognizes governed cleanup");
assert.equal(parsed.input?.id, "cleanup_geometry");

const preview = previewCadCommand(
  { id: "cleanup_geometry", tolerance: 1, angleToleranceDeg: 1, minLength: 10 },
  context,
);
assert.equal(
  preview.operations.filter((operation) => operation.type === "delete").length,
  1,
  "duplicate is proposed once",
);
assert.equal(
  preview.operations.filter((operation) => operation.type === "move").length,
  1,
  "near-orthogonal wall is proposed once",
);
assert.ok(
  preview.issues.some((issue) => issue.code === "duplicate_geometry"),
  "preview includes duplicate evidence",
);
assert.ok(
  preview.issues.some((issue) => issue.code === "near_orthogonal"),
  "preview includes angular evidence",
);
assert.ok(
  preview.issues.some((issue) => issue.code === "tiny_segment"),
  "tiny segment is reported without silent deletion",
);

const apply = executeCadCommand(
  {
    id: "cleanup_geometry",
    tolerance: 1,
    angleToleranceDeg: 1,
    minLength: 10,
    removeTiny: true,
  },
  context,
);
assert.equal(apply.applied, true);
assert.equal(
  apply.operations.filter((operation) => operation.type === "delete").length,
  2,
  "confirmed batch can include duplicate and tiny entity",
);

const scoped = previewCadCommand(
  {
    id: "cleanup_geometry",
    objectIds: ["wall-near-ortho"],
    tolerance: 1,
    angleToleranceDeg: 1,
  },
  context,
);
assert.deepEqual(
  scoped.affectedObjectIds,
  ["wall-near-ortho"],
  "selection scopes individual cleanup",
);

const invalid = executeCadCommand(
  { id: "cleanup_geometry", tolerance: 0 },
  context,
);
assert.equal(invalid.applied, false, "invalid tolerance fails closed");
assert.ok(invalid.issues.some((issue) => issue.level === "error"));

console.log("cad geometry-cleanup specs passed");
