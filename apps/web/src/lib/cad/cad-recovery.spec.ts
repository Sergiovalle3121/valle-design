import assert from "node:assert/strict";
import test from "node:test";
import { cadRecoveryScopeKey } from "./cad-recovery";

const base = {
  tenantId: "tenant-a",
  userId: "user-a",
  buildingId: "building-a",
  projectId: "project-a",
  model: "AX:1000",
  revision: "A/1",
};

test("builds a stable encoded recovery key", () => {
  assert.equal(cadRecoveryScopeKey(base), cadRecoveryScopeKey({ ...base }));
  assert.match(cadRecoveryScopeKey(base), /AX%3A1000/);
  assert.match(cadRecoveryScopeKey(base), /A%2F1/);
});

test("isolates recovery by tenant, user, workspace and drawing identity", () => {
  const original = cadRecoveryScopeKey(base);
  for (const change of [
    { tenantId: "tenant-b" },
    { userId: "user-b" },
    { buildingId: "building-b" },
    { projectId: "project-b" },
    { model: "AX-2000" },
    { revision: "B" },
  ]) {
    assert.notEqual(cadRecoveryScopeKey({ ...base, ...change }), original);
  }
});
