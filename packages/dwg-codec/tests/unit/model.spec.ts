import assert from "node:assert/strict";
import test from "node:test";
import { createDwgLimits, DEFAULT_DWG_LIMITS } from "../../src/api/limits.js";
import { createDwgDatabaseFoundation } from "../../src/model/database.js";
import {
  createDwgHandle,
  dwgHandleKey,
  sameDwgHandle,
} from "../../src/model/handle.js";
import { createOpaqueDwgObject } from "../../src/model/opaque-object.js";
import { createDwgReference } from "../../src/model/reference.js";
import {
  createDwgSymbolName,
  createDwgSymbolTable,
} from "../../src/model/symbol-table.js";
import { ResourceBudget } from "../../src/security/resource-budget.js";
import { assertDwgError } from "../support/assert.js";
import { FixedClock } from "../support/fake-clock.js";

const handle = (value: number) => createDwgHandle(Uint8Array.of(value));

function memoryBudget(
  maxMemoryBytes: number,
  maxWorkUnits = 10_000,
): ResourceBudget {
  return new ResourceBudget(
    createDwgLimits({
      maxMemoryBytes,
      maxWorkUnits,
      workPollInterval: Math.min(1_024, maxWorkUnits),
    }),
    { clock: new FixedClock(0) },
  );
}

test("neutral handles own immutable byte values", () => {
  const bytes = Uint8Array.of(1, 2, 3);
  const created = createDwgHandle(bytes);
  bytes.fill(9);
  assert.deepEqual(created.bytes.toUint8Array(), Uint8Array.of(1, 2, 3));
  assert.equal(Object.isFrozen(created), true);
  assert.equal(Object.isFrozen(created.bytes), true);
  assert.equal(
    sameDwgHandle(created, createDwgHandle(Uint8Array.of(1, 2, 3))),
    true,
  );
});

test("handle wrappers and returned hex keys have distinct retained accounting", () => {
  const exact = memoryBudget(513);
  const created = createDwgHandle(Uint8Array.of(1), 32, exact);
  assert.equal(exact.memoryBytes, 513);

  const exhausted = memoryBudget(512);
  assertDwgError(
    () => createDwgHandle(Uint8Array.of(1), 32, exhausted),
    "DWG_MEMORY_LIMIT_EXCEEDED",
  );
  assert.equal(exhausted.memoryBytes, 0);

  const keyBudget = memoryBudget(65_676, 1);
  assert.equal(dwgHandleKey(created, keyBudget), "01");
  assert.equal(keyBudget.memoryBytes, 132);
});

test("owned opaque payloads reserve copy and wrapper memory before allocation", () => {
  const input = {
    typeTag: 1,
    handle: handle(1),
    rawPayload: new Uint8Array(8),
  };
  const exact = memoryBudget(520);
  const object = createOpaqueDwgObject(input, DEFAULT_DWG_LIMITS, exact);
  assert.equal(object.rawPayload.length, 8);
  assert.equal(exact.memoryBytes, 520);

  const exhausted = memoryBudget(519);
  assertDwgError(
    () => createOpaqueDwgObject(input, DEFAULT_DWG_LIMITS, exhausted),
    "DWG_MEMORY_LIMIT_EXCEEDED",
  );
});

test("opaque construction rolls back copied references after a later failure", () => {
  const source = handle(1);
  const target = handle(2);
  const reference = createDwgReference("reference", source, target);
  const budget = memoryBudget(400);
  assertDwgError(
    () =>
      createOpaqueDwgObject(
        {
          typeTag: 1,
          handle: source,
          references: [reference],
          rawPayload: Uint8Array.of(1),
        },
        DEFAULT_DWG_LIMITS,
        budget,
      ),
    "DWG_MEMORY_LIMIT_EXCEEDED",
  );
  assert.equal(budget.memoryBytes, 0);
});

test("hex materialization charges bounded work, result and peak scratch memory", () => {
  const budget = memoryBudget(66_100, 8);
  const name = createDwgSymbolName(
    Uint8Array.of(0x00, 0x1f, 0xa0, 0xff),
    DEFAULT_DWG_LIMITS,
    budget,
  );
  assert.equal(name.bytes.toHex(budget), "001fa0ff");
  assert.equal(budget.memoryBytes, 532);
  assert.equal(budget.workUnits, 8);

  const exhausted = memoryBudget(66_099, 8);
  const second = createDwgSymbolName(
    Uint8Array.of(0x00, 0x1f, 0xa0, 0xff),
    DEFAULT_DWG_LIMITS,
    exhausted,
  );
  assertDwgError(
    () => second.bytes.toHex(exhausted),
    "DWG_MEMORY_LIMIT_EXCEEDED",
  );
  assert.equal(exhausted.memoryBytes, 388);
});

test("database arrays and indexes cannot bypass the concurrent memory budget", () => {
  const object = createOpaqueDwgObject(
    {
      typeTag: 1,
      handle: handle(1),
      rawPayload: new Uint8Array(),
    },
    DEFAULT_DWG_LIMITS,
  );
  const budget = memoryBudget(1_423);
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { objects: [object] },
        DEFAULT_DWG_LIMITS,
        budget,
      ),
    "DWG_MEMORY_LIMIT_EXCEEDED",
  );
  assert.equal(budget.memoryBytes, 0);
});

test("database failures restore their exact incoming memory checkpoint", () => {
  const duplicateHandle = handle(1);
  const first = createOpaqueDwgObject(
    { typeTag: 1, handle: duplicateHandle, rawPayload: new Uint8Array() },
    DEFAULT_DWG_LIMITS,
  );
  const second = createOpaqueDwgObject(
    { typeTag: 2, handle: duplicateHandle, rawPayload: new Uint8Array() },
    DEFAULT_DWG_LIMITS,
  );
  const budget = memoryBudget(1_000_000);
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { objects: [first, second] },
        DEFAULT_DWG_LIMITS,
        budget,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
  assert.equal(budget.memoryBytes, 0);

  const existing = createDwgHandle(Uint8Array.of(9), 32, budget);
  const checkpoint = budget.memoryBytes;
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { objects: [first, second] },
        DEFAULT_DWG_LIMITS,
        budget,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
  assert.equal(existing.kind, "handle");
  assert.equal(budget.memoryBytes, checkpoint);
});

test("database releases temporary validation collections on success", () => {
  const budget = memoryBudget(2_000);
  const database = createDwgDatabaseFoundation({}, DEFAULT_DWG_LIMITS, budget);
  assert.equal(database.status, "foundation-only");
  assert.equal(budget.memoryBytes, 512);

  const object = createOpaqueDwgObject(
    {
      typeTag: 1,
      handle: handle(1),
      rawPayload: new Uint8Array(),
    },
    DEFAULT_DWG_LIMITS,
  );
  const objectBudget = memoryBudget(100_000);
  createDwgDatabaseFoundation(
    { objects: [object] },
    DEFAULT_DWG_LIMITS,
    objectBudget,
  );
  assert.equal(objectBudget.memoryBytes, 912);
});

test("diagnostic and loss records reserve before construction and roll back", () => {
  const diagnosticBudget = memoryBudget(1_825);
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        {
          diagnostics: [
            { code: "c", severity: "info", offset: 0, message: "m" },
          ],
        },
        DEFAULT_DWG_LIMITS,
        diagnosticBudget,
      ),
    "DWG_MEMORY_LIMIT_EXCEEDED",
  );
  assert.equal(diagnosticBudget.memoryBytes, 0);

  const lossBudget = memoryBudget(2_083);
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        {
          lossManifest: [
            {
              code: "c",
              severity: "info",
              scope: "entity",
              subject: { kind: "object", stableId: "i" },
              message: "m",
            },
          ],
        },
        DEFAULT_DWG_LIMITS,
        lossBudget,
      ),
    "DWG_MEMORY_LIMIT_EXCEEDED",
  );
  assert.equal(lossBudget.memoryBytes, 0);
});

test("handles reject empty and over-limit representations", () => {
  assertDwgError(
    () => createDwgHandle(new Uint8Array()),
    "DWG_STRUCTURE_CORRUPT",
  );
  assertDwgError(
    () => createDwgHandle(Uint8Array.of(1, 2), 1),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("neutral byte factories ignore hostile public properties and iterators", () => {
  const bytes = Uint8Array.of(7);
  Object.defineProperties(bytes, {
    byteLength: { value: 1 },
    [Symbol.iterator]: {
      value: function* hostileIterator(): Generator<number> {
        yield 7;
        yield 8;
        yield 300;
      },
    },
  });

  assert.deepEqual(
    createDwgHandle(bytes, 1).bytes.toUint8Array(),
    Uint8Array.of(7),
  );
  assert.deepEqual(
    createDwgSymbolName(bytes, {
      ...DEFAULT_DWG_LIMITS,
      maxStringBytes: 1,
    }).bytes.toUint8Array(),
    Uint8Array.of(7),
  );
  assert.deepEqual(
    createOpaqueDwgObject(
      { typeTag: 1, handle: handle(1), rawPayload: bytes },
      { ...DEFAULT_DWG_LIMITS, maxExpandedBytes: 1 },
    ).rawPayload.toUint8Array(),
    Uint8Array.of(7),
  );
});

test("opaque objects retain bytes without interpreting active content", () => {
  const payload = Uint8Array.of(104, 116, 116, 112, 58, 47, 47);
  const source = handle(1);
  const target = handle(2);
  const reference = createDwgReference("reference", source, target);
  const object = createOpaqueDwgObject(
    {
      typeTag: 7,
      handle: source,
      owner: target,
      references: [reference],
      rawPayload: payload,
    },
    DEFAULT_DWG_LIMITS,
  );
  payload.fill(0);
  assert.deepEqual(
    object.rawPayload.toUint8Array(),
    Uint8Array.of(104, 116, 116, 112, 58, 47, 47),
  );
  assert.equal(object.representation, "opaque");
  assert.equal(Object.isFrozen(object.references), true);
  assert.equal(Object.isFrozen(object.rawPayload), true);
});

test("opaque object references ignore a hostile replacement iterator", () => {
  const source = handle(1);
  const target = handle(2);
  const reference = createDwgReference("reference", source, target);
  const references: ReturnType<typeof createDwgReference>[] = [];
  Object.defineProperty(references, Symbol.iterator, {
    value: function* hostileIterator() {
      yield reference;
      yield reference;
    },
  });
  const object = createOpaqueDwgObject(
    {
      typeTag: 1,
      handle: source,
      references,
      rawPayload: new Uint8Array(),
    },
    { ...DEFAULT_DWG_LIMITS, maxReferences: 1 },
  );
  assert.deepEqual(object.references, []);
});

test("symbol names remain opaque bytes and tables reject duplicates", () => {
  const firstName = createDwgSymbolName(Uint8Array.of(65), DEFAULT_DWG_LIMITS);
  const table = createDwgSymbolTable(
    handle(9),
    [{ name: firstName, objectHandle: handle(1) }],
    DEFAULT_DWG_LIMITS,
  );
  assert.equal(table.representation, "symbol-table-foundation");
  assert.equal(Object.isFrozen(table.entries), true);
  assertDwgError(
    () =>
      createDwgSymbolTable(
        handle(9),
        [
          { name: firstName, objectHandle: handle(1) },
          { name: firstName, objectHandle: handle(2) },
        ],
        DEFAULT_DWG_LIMITS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("symbol tables ignore a hostile replacement map method", () => {
  const entries: {
    name: ReturnType<typeof createDwgSymbolName>;
    objectHandle: ReturnType<typeof createDwgHandle>;
  }[] = [];
  const injected = {
    name: createDwgSymbolName(Uint8Array.of(65), DEFAULT_DWG_LIMITS),
    objectHandle: handle(1),
  };
  Object.defineProperty(entries, "map", {
    value: () => [injected, injected],
  });
  const table = createDwgSymbolTable(handle(9), entries, {
    ...DEFAULT_DWG_LIMITS,
    maxArrayLength: 1,
  });
  assert.deepEqual(table.entries, []);
});

test("symbol tables snapshot entry fields once and type hostile getters", () => {
  const name = createDwgSymbolName(Uint8Array.of(65), DEFAULT_DWG_LIMITS);
  const objectHandle = handle(1);
  let nameReads = 0;
  let handleReads = 0;
  const entry = {
    get name() {
      nameReads += 1;
      if (nameReads > 1) throw new Error("name re-read");
      return name;
    },
    get objectHandle() {
      handleReads += 1;
      if (handleReads > 1) throw new Error("handle re-read");
      return objectHandle;
    },
  };
  const budget = memoryBudget(100_000);
  const table = createDwgSymbolTable(
    handle(9),
    [entry],
    DEFAULT_DWG_LIMITS,
    budget,
  );
  assert.equal(table.entries[0]?.name, name);
  assert.equal(nameReads, 1);
  assert.equal(handleReads, 1);
  assert.equal(budget.memoryBytes, 656);

  const hostileEntry = new Proxy(
    {},
    {
      get(): never {
        throw new Error("must not escape");
      },
    },
  );
  const hostileBudget = memoryBudget(100_000);
  assertDwgError(
    () =>
      createDwgSymbolTable(
        handle(10),
        [hostileEntry as never],
        DEFAULT_DWG_LIMITS,
        hostileBudget,
      ),
    "DWG_INPUT_INVALID",
  );
  assert.equal(hostileBudget.memoryBytes, 0);
});

test("opaque and database input proxies fail with typed errors and no leak", () => {
  const opaqueBudget = memoryBudget(100_000);
  const hostileOpaque = new Proxy(
    {},
    {
      get(): never {
        throw new Error("must not escape");
      },
    },
  );
  assertDwgError(
    () =>
      createOpaqueDwgObject(
        hostileOpaque as never,
        DEFAULT_DWG_LIMITS,
        opaqueBudget,
      ),
    "DWG_INPUT_INVALID",
  );
  assert.equal(opaqueBudget.memoryBytes, 0);

  const databaseBudget = memoryBudget(100_000);
  const hostileDatabase = new Proxy(
    {},
    {
      get(): never {
        throw new Error("must not escape");
      },
    },
  );
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        hostileDatabase as never,
        DEFAULT_DWG_LIMITS,
        databaseBudget,
      ),
    "DWG_INPUT_INVALID",
  );
  assert.equal(databaseBudget.memoryBytes, 0);
});

test("database foundation explicitly denies completeness", () => {
  const object = createOpaqueDwgObject(
    {
      typeTag: 1,
      handle: handle(1),
      rawPayload: new Uint8Array(),
    },
    DEFAULT_DWG_LIMITS,
  );
  const database = createDwgDatabaseFoundation(
    { objects: [object] },
    DEFAULT_DWG_LIMITS,
  );
  assert.equal(database.status, "foundation-only");
  assert.equal(database.objectDatabaseComplete, false);
  assert.equal(Object.isFrozen(database), true);
  assert.equal(Object.isFrozen(database.objects), true);
});

test("database foundation rejects duplicate handles and bounded counts", () => {
  const first = createOpaqueDwgObject(
    { typeTag: 1, handle: handle(1), rawPayload: new Uint8Array() },
    DEFAULT_DWG_LIMITS,
  );
  const second = createOpaqueDwgObject(
    { typeTag: 2, handle: handle(1), rawPayload: new Uint8Array() },
    DEFAULT_DWG_LIMITS,
  );
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { objects: [first, second] },
        DEFAULT_DWG_LIMITS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { objects: [first] },
        { ...DEFAULT_DWG_LIMITS, maxObjects: 0 },
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("database handle limits include owners and reference targets", () => {
  const source = handle(1);
  const owner = handle(2);
  const target = handle(3);
  const object = createOpaqueDwgObject(
    {
      typeTag: 1,
      handle: source,
      owner,
      references: [createDwgReference("reference", source, target)],
      rawPayload: new Uint8Array(),
    },
    DEFAULT_DWG_LIMITS,
  );
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { objects: [object] },
        { ...DEFAULT_DWG_LIMITS, maxHandles: 1 },
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("database enforces expanded bytes across all retained payloads", () => {
  const limits = { ...DEFAULT_DWG_LIMITS, maxExpandedBytes: 2 };
  const first = createOpaqueDwgObject(
    { typeTag: 1, handle: handle(1), rawPayload: Uint8Array.of(1, 2) },
    limits,
  );
  const second = createOpaqueDwgObject(
    { typeTag: 2, handle: handle(2), rawPayload: Uint8Array.of(3, 4) },
    limits,
  );
  assertDwgError(
    () => createDwgDatabaseFoundation({ objects: [first, second] }, limits),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("database bounds and owns diagnostics and loss entries", () => {
  const diagnostic = {
    code: "DWG_TEST",
    severity: "warning" as const,
    offset: 1,
    message: "before",
  };
  const loss = {
    code: "DWG_LOSS",
    severity: "warning" as const,
    scope: "entity" as const,
    subject: { kind: "object" as const, stableId: "handle:1" },
    message: "opaque",
  };
  const database = createDwgDatabaseFoundation(
    { diagnostics: [diagnostic], lossManifest: [loss] },
    DEFAULT_DWG_LIMITS,
  );
  diagnostic.message = "after";
  loss.message = "after";
  loss.subject.stableId = "handle:2";
  assert.equal(database.diagnostics[0]?.message, "before");
  assert.equal(database.lossManifest[0]?.message, "opaque");
  assert.equal(database.lossManifest[0]?.severity, "warning");
  assert.deepEqual(database.lossManifest[0]?.subject, {
    kind: "object",
    stableId: "handle:1",
  });
  assert.equal(Object.isFrozen(database.diagnostics[0]), true);
  assert.equal(Object.isFrozen(database.lossManifest[0]), true);
  assert.equal(Object.isFrozen(database.lossManifest[0]?.subject), true);
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { diagnostics: [diagnostic, diagnostic] },
        { ...DEFAULT_DWG_LIMITS, maxArrayLength: 1 },
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        {
          lossManifest: [{ ...loss, severity: "fatal" as never }],
        },
        DEFAULT_DWG_LIMITS,
      ),
    "DWG_INPUT_INVALID",
  );
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        {
          lossManifest: [
            { ...loss, subject: { kind: "object", stableId: "" } },
          ],
        },
        DEFAULT_DWG_LIMITS,
      ),
    "DWG_INPUT_INVALID",
  );
});

test("database captures diagnostic getters once and types hostile access", () => {
  let messageReads = 0;
  const diagnostic = {
    code: "c",
    severity: "info" as const,
    offset: 0,
    get message(): string {
      messageReads += 1;
      return messageReads === 1 ? "a" : "0123456789";
    },
  };
  const database = createDwgDatabaseFoundation(
    { diagnostics: [diagnostic] },
    {
      ...DEFAULT_DWG_LIMITS,
      maxExpandedBytes: 2,
      maxStringBytes: 1,
    },
  );
  assert.equal(messageReads, 1);
  assert.equal(database.diagnostics[0]?.message, "a");

  const hostile = {
    get code(): never {
      throw new Error("must not escape");
    },
    severity: "info" as const,
    offset: 0,
    message: "a",
  };
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { diagnostics: [hostile] },
        DEFAULT_DWG_LIMITS,
      ),
    "DWG_INPUT_INVALID",
  );
});

test("database foundation rejects mismatched reference sources and duplicates", () => {
  const firstHandle = handle(1);
  const otherHandle = handle(2);
  const wrongSource = createOpaqueDwgObject(
    {
      typeTag: 1,
      handle: firstHandle,
      references: [createDwgReference("reference", otherHandle, firstHandle)],
      rawPayload: new Uint8Array(),
    },
    DEFAULT_DWG_LIMITS,
  );
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { objects: [wrongSource] },
        DEFAULT_DWG_LIMITS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  const duplicate = createDwgReference("reference", firstHandle, otherHandle);
  const duplicatedReferences = createOpaqueDwgObject(
    {
      typeTag: 1,
      handle: firstHandle,
      references: [duplicate, duplicate],
      rawPayload: new Uint8Array(),
    },
    DEFAULT_DWG_LIMITS,
  );
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { objects: [duplicatedReferences] },
        DEFAULT_DWG_LIMITS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});

test("database foundation rejects owner cycles and excessive depth", () => {
  const first = createOpaqueDwgObject(
    {
      typeTag: 1,
      handle: handle(1),
      owner: handle(2),
      rawPayload: new Uint8Array(),
    },
    DEFAULT_DWG_LIMITS,
  );
  const second = createOpaqueDwgObject(
    {
      typeTag: 2,
      handle: handle(2),
      owner: handle(1),
      rawPayload: new Uint8Array(),
    },
    DEFAULT_DWG_LIMITS,
  );
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { objects: [first, second] },
        DEFAULT_DWG_LIMITS,
      ),
    "DWG_STRUCTURE_CORRUPT",
  );

  const root = createOpaqueDwgObject(
    { typeTag: 3, handle: handle(3), rawPayload: new Uint8Array() },
    DEFAULT_DWG_LIMITS,
  );
  const child = createOpaqueDwgObject(
    {
      typeTag: 4,
      handle: handle(4),
      owner: handle(3),
      rawPayload: new Uint8Array(),
    },
    DEFAULT_DWG_LIMITS,
  );
  assertDwgError(
    () =>
      createDwgDatabaseFoundation(
        { objects: [root, child] },
        { ...DEFAULT_DWG_LIMITS, maxDepth: 0 },
      ),
    "DWG_STRUCTURE_CORRUPT",
  );
});
