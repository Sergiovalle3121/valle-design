import { strict as assert } from "node:assert";
import { buildCadMaterialRouteReport } from "./material-flow-route";

const nodes = [
  { id: "receiving", label: "Receiving", x: 0, y: 0 },
  { id: "supermarket", label: "Supermarket", x: 3000, y: 0 },
  { id: "smt", label: "SMT", x: 3000, y: 2000 },
  { id: "pack", label: "Packing", x: 6000, y: 2000 },
];

const connected = buildCadMaterialRouteReport({
  nodes,
  connectors: [
    { from: "receiving", to: "supermarket", kind: "material" },
    { from: "supermarket", to: "smt", kind: "flow" },
    { from: "smt", to: "pack", kind: "flow" },
  ],
});

assert.deepEqual(
  connected.routeNodeIds,
  ["receiving", "supermarket", "smt", "pack"],
  "connector route preserves material handoff order",
);
assert.equal(connected.connectorCount, 3, "counts route-like connectors");
assert.equal(connected.legCount, 3, "builds route legs");
assert.equal(
  Math.round(connected.totalDistance),
  8000,
  "sums material route distance",
);
assert.equal(
  connected.longestLeg?.fromId,
  "receiving",
  "reports the longest handoff leg",
);
assert.equal(
  connected.warnings.some((warning) => warning.includes("No flow/material")),
  false,
  "connected routes do not fall back to object sequence",
);

const selected = buildCadMaterialRouteReport({
  nodes,
  selectedIds: ["supermarket", "smt", "pack"],
  connectors: [
    { from: "receiving", to: "supermarket", kind: "material" },
    { from: "supermarket", to: "smt", kind: "flow" },
    { from: "smt", to: "pack", kind: "flow" },
  ],
});

assert.deepEqual(
  selected.routeNodeIds,
  ["supermarket", "smt", "pack"],
  "selected route scope excludes unselected connector endpoints",
);

const fallback = buildCadMaterialRouteReport({
  nodes: nodes.slice(0, 3),
});

assert.deepEqual(
  fallback.routeNodeIds,
  ["receiving", "supermarket", "smt"],
  "falls back to object order when connectors are absent",
);
assert.equal(
  fallback.warnings.some((warning) => warning.includes("object sequence")),
  true,
  "fallback route is explicit",
);

const missingRefs = buildCadMaterialRouteReport({
  nodes: nodes.slice(0, 2),
  connectors: [
    { from: "receiving", to: "supermarket", kind: "flow" },
    { from: "supermarket", to: "ghost", kind: "flow" },
  ],
});

assert.deepEqual(
  missingRefs.missingConnectorRefs,
  ["ghost"],
  "reports connector endpoints missing from the layout",
);
assert.equal(
  missingRefs.warnings.some((warning) => warning.includes("missing")),
  true,
  "missing connector refs produce a warning",
);

console.log("cad material flow route specs passed");
