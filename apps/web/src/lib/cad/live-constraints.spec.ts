import { strict as assert } from "node:assert";
import { layoutToCadDocument, serializeCadDocument } from "./cad-document";
import { solveCadConstraints, upsertCadConstraint } from "./live-constraints";

const base = layoutToCadDocument({
  assets: [
    { id: "reference", kind: "wall", x: 0, y: 0, w: 1000, h: 100, rotation: 0 },
    {
      id: "dependent",
      kind: "wall",
      x: 0,
      y: 1000,
      w: 500,
      h: 100,
      rotation: 45,
    },
  ],
});
const constrained = upsertCadConstraint(base, {
  id: "parallel:reference:dependent",
  kind: "parallel",
  entityIds: ["reference", "dependent"],
  enabled: true,
});
const preview = solveCadConstraints(constrained, ["reference"]);
assert.equal(preview.converged, true, "parallel constraint converges");
assert.equal(
  preview.status,
  "under_constrained",
  "single relation remains under-constrained",
);
const dependent = preview.document.entities.find(
  (entity) => entity.id === "dependent",
);
assert.equal(dependent?.type, "box");
assert.ok(
  dependent?.type === "box" && Math.abs(dependent.rotation) < 1e-9,
  "dependent wall becomes parallel",
);
assert.notEqual(
  serializeCadDocument(preview.document),
  serializeCadDocument(constrained),
  "preview produces a changed immutable document",
);
assert.equal(
  (
    constrained.entities.find((entity) => entity.id === "dependent") as {
      rotation: number;
    }
  ).rotation,
  45,
  "input document is not mutated",
);

const movedReference = {
  ...preview.document,
  entities: preview.document.entities.map((entity) =>
    entity.id === "reference" && entity.type === "box"
      ? { ...entity, rotation: 90 }
      : entity,
  ),
};
const propagated = solveCadConstraints(movedReference, ["reference"]);
const propagatedDependent = propagated.document.entities.find(
  (entity) => entity.id === "dependent",
);
assert.ok(
  propagatedDependent?.type === "box" &&
    Math.abs(propagatedDependent.rotation - 90) < 1e-6,
  "editing the reference propagates to the related wall",
);

const dimensioned = upsertCadConstraint(propagated.document, {
  id: "distance:dependent",
  kind: "distance",
  entityIds: ["dependent"],
  value: 2400,
  enabled: true,
});
const dimensionResult = solveCadConstraints(dimensioned, ["dependent"]);
const dimensionWall = dimensionResult.document.entities.find(
  (entity) => entity.id === "dependent",
);
assert.ok(
  dimensionWall?.type === "box" && Math.abs(dimensionWall.w - 2400) < 1e-6,
  "persistent distance constraint fixes exact length",
);

const conflicted = {
  ...base,
  constraints: [
    {
      id: "h",
      kind: "horizontal" as const,
      entityIds: ["reference"],
      enabled: true,
    },
    {
      id: "v",
      kind: "vertical" as const,
      entityIds: ["reference"],
      enabled: true,
    },
  ],
};
const conflict = solveCadConstraints(conflicted, ["reference"]);
assert.equal(conflict.converged, false);
assert.equal(conflict.status, "over_constrained");
assert.equal(conflict.document, conflicted, "conflict rolls back atomically");

const degenerate = upsertCadConstraint(base, {
  id: "bad-distance",
  kind: "distance",
  entityIds: ["reference"],
  value: 0,
  enabled: true,
});
const degenerateResult = solveCadConstraints(degenerate);
assert.equal(degenerateResult.status, "inconsistent");
assert.equal(
  degenerateResult.document,
  degenerate,
  "invalid constraint keeps the original document",
);

console.log("cad live-constraints specs passed");
