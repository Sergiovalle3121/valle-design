import { strict as assert } from "node:assert";
import {
  createCadSnapshot,
  diffCadSnapshots,
  hashSnapshotLayout,
  pushCadSnapshot,
  restoreCadSnapshot,
} from "./snapshots";

const layout = { objects: [{ id: "a", x: 1 }] };
const a = createCadSnapshot(layout, "before", "manual", "s1");
const b = createCadSnapshot(
  { objects: [{ id: "a", x: 2 }] },
  "after",
  "command",
  "s2",
);
assert.notEqual(
  hashSnapshotLayout(a.layout),
  hashSnapshotLayout(b.layout),
  "hash changes with layout",
);
assert.equal(
  diffCadSnapshots(a, b).changed,
  true,
  "diff detects changed snapshots",
);
const history = pushCadSnapshot(pushCadSnapshot({ snapshots: [] }, a), b);
assert.equal(history.activeId, "s2", "push marks active snapshot");
assert.equal(
  restoreCadSnapshot(history, "s1").layout?.objects[0].x,
  1,
  "restore returns cloned layout",
);
console.log("cad snapshots specs passed");
