import { strict as assert } from "node:assert";
import { createHistoryItem } from "./commands";
import {
  CAD_COMMAND_HISTORY_LIMIT,
  cadCommandHistoryStorageKey,
  navigateCadCommandHistory,
  parseCadCommandHistory,
  prependCadCommandHistory,
  repeatableCadCommand,
  serializeCadCommandHistory,
} from "./command-session";

const input = { id: "fit_to_view" as const };
const newest = createHistoryItem(input, "applied", "Fit", undefined, undefined, {
  rawInput: "encuadra todo",
  durationMs: 12,
  affectedObjectIds: ["A-1"],
  completedAt: "2026-07-28T07:00:00.000Z",
});
const older = createHistoryItem(input, "applied", "Fit selection", undefined, undefined, {
  rawInput: "encuadra selección",
  durationMs: 8,
});

assert.equal(
  cadCommandHistoryStorageKey({
    tenantId: null,
    userId: "user-a",
    model: "M1",
    revision: "A",
  }),
  null,
  "never persists without an authenticated tenant scope",
);
assert.notEqual(
  cadCommandHistoryStorageKey({
    tenantId: "tenant-a",
    userId: "user-a",
    projectId: "project-a",
    model: "M1",
    revision: "A",
  }),
  cadCommandHistoryStorageKey({
    tenantId: "tenant-b",
    userId: "user-a",
    projectId: "project-a",
    model: "M1",
    revision: "A",
  }),
  "tenant boundary changes the storage key",
);

const serialized = serializeCadCommandHistory([newest, older]);
assert.equal(serialized.includes("preview"), false, "does not persist geometry previews");
const restored = parseCadCommandHistory(serialized);
assert.equal(restored.length, 2);
assert.equal(restored[0].rawInput, newest.rawInput);
assert.equal(restored[0].durationMs, newest.durationMs);
assert.deepEqual(restored[0].affectedObjectIds, newest.affectedObjectIds);
assert.equal(restored[0].preview, undefined);
assert.equal(restored[0].result, undefined);
assert.deepEqual(parseCadCommandHistory("not-json"), []);
assert.equal(repeatableCadCommand([newest, older]), "encuadra todo");
assert.deepEqual(navigateCadCommandHistory([newest, older], -1, "older"), {
  cursor: 0,
  value: "encuadra todo",
});
assert.deepEqual(navigateCadCommandHistory([newest, older], 0, "older"), {
  cursor: 1,
  value: "encuadra selección",
});
assert.deepEqual(navigateCadCommandHistory([newest, older], 1, "newer"), {
  cursor: 0,
  value: "encuadra todo",
});

let capped = [] as typeof newest[];
for (let index = 0; index < CAD_COMMAND_HISTORY_LIMIT + 5; index += 1) {
  capped = prependCadCommandHistory(capped, { ...newest, id: `cmd-${index}` });
}
assert.equal(capped.length, CAD_COMMAND_HISTORY_LIMIT);
assert.equal(capped[0].id, `cmd-${CAD_COMMAND_HISTORY_LIMIT + 4}`);

console.log("cad command session specs passed");
