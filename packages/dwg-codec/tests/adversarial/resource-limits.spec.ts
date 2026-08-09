import assert from "node:assert/strict";
import test from "node:test";
import {
  API_DWG_HARD_TIMEOUT_MS,
  API_DWG_LIMITS,
  BROWSER_DWG_LIMITS,
  DEFAULT_DWG_LIMITS,
  probeDwg,
  type DwgCancellationSignal,
  type DwgClock,
  type DwgLimits,
} from "../../src/index.js";
import { createDwgLimits } from "../../src/api/limits.js";
import { createDwgHandle } from "../../src/model/handle.js";
import { createOpaqueDwgObject } from "../../src/model/opaque-object.js";
import type { DwgReference } from "../../src/model/reference.js";
import { createInputSnapshot } from "../../src/security/input-snapshot.js";
import { ResourceBudget } from "../../src/security/resource-budget.js";

const LIMIT_FIELDS = Object.keys(DEFAULT_DWG_LIMITS) as (keyof DwgLimits)[];

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function override(field: keyof DwgLimits, value: number): Partial<DwgLimits> {
  return { [field]: value } as Partial<DwgLimits>;
}

test("the limit contract exposes all thirteen immutable resource dimensions", () => {
  assert.deepEqual(LIMIT_FIELDS.sort(), [
    "maxArrayLength",
    "maxDepth",
    "maxExpandedBytes",
    "maxFileBytes",
    "maxHandles",
    "maxMemoryBytes",
    "maxObjects",
    "maxReferences",
    "maxSections",
    "maxStringBytes",
    "maxWallTimeMs",
    "maxWorkUnits",
    "workPollInterval",
  ]);
  assert.equal(Object.isFrozen(DEFAULT_DWG_LIMITS), true);
  assert.equal(Object.isFrozen(createDwgLimits()), true);
});

test("browser and API profiles keep file, memory, expansion, work and time separate", () => {
  assert.equal(BROWSER_DWG_LIMITS.maxMemoryBytes, 128 * 1024 * 1024);
  assert.equal(BROWSER_DWG_LIMITS.maxObjects, 250_000);
  assert.equal(BROWSER_DWG_LIMITS.maxWallTimeMs, 45_000);
  assert.equal(API_DWG_LIMITS.maxMemoryBytes, 512 * 1024 * 1024);
  assert.equal(API_DWG_LIMITS.maxObjects, 1_000_000);
  assert.equal(BROWSER_DWG_LIMITS.maxFileBytes, API_DWG_LIMITS.maxFileBytes);
  assert.notEqual(
    BROWSER_DWG_LIMITS.maxFileBytes,
    BROWSER_DWG_LIMITS.maxMemoryBytes,
  );
  assert.equal(createDwgLimits(undefined, "api"), API_DWG_LIMITS);
  assert.equal(
    createDwgLimits({ maxWallTimeMs: API_DWG_HARD_TIMEOUT_MS }, "api")
      .maxWallTimeMs,
    API_DWG_HARD_TIMEOUT_MS,
  );
  assert.throws(() =>
    createDwgLimits({ maxWallTimeMs: API_DWG_HARD_TIMEOUT_MS + 1 }, "api"),
  );
  assert.throws(() =>
    createDwgLimits({ maxObjects: BROWSER_DWG_LIMITS.maxObjects + 1 }),
  );
});

for (const field of LIMIT_FIELDS) {
  test(`${field} accepts its minimum value`, () => {
    const limits = createDwgLimits(override(field, 1));
    assert.equal(limits[field], 1);
    assert.equal(Object.isFrozen(limits), true);
  });

  test(`${field} accepts its maximum/default value`, () => {
    const maximum = DEFAULT_DWG_LIMITS[field];
    const limits = createDwgLimits(override(field, maximum));
    assert.equal(limits[field], maximum);
  });

  test(`${field} rejects one above its maximum`, () => {
    const maximum = DEFAULT_DWG_LIMITS[field];
    assert.throws(() => createDwgLimits(override(field, maximum + 1)));
    const result = probeDwg(new Uint8Array(), {
      limits: override(field, maximum + 1),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "DWG_INPUT_INVALID");
  });
}

for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`all limit fields reject invalid numeric value ${String(invalid)}`, () => {
    for (const field of LIMIT_FIELDS)
      assert.throws(() => createDwgLimits(override(field, invalid)));
  });
}

test("work budget accepts exact work and fails one unit below without a partial probe", () => {
  const bytes = ascii("AC1015");
  const exact = probeDwg(bytes, {
    limits: { maxWorkUnits: 13, workPollInterval: 1 },
  });
  assert.equal(exact.ok, false);
  if (!exact.ok) {
    assert.equal(exact.error.code, "DWG_VERSION_DECODER_UNSUPPORTED");
    assert.equal(exact.workUnits, 13);
  }

  const exhausted = probeDwg(bytes, {
    limits: { maxWorkUnits: 12, workPollInterval: 1 },
  });
  assert.equal(exhausted.ok, false);
  if (!exhausted.ok) {
    assert.equal(exhausted.error.code, "DWG_WORK_LIMIT_EXCEEDED");
    assert.equal(exhausted.probe, null);
    assert.ok(exhausted.workUnits <= 12);
  }
});

test("the owned snapshot is stable after the caller mutates its original buffer", () => {
  const limits = createDwgLimits({
    maxFileBytes: 6,
    maxWorkUnits: 13,
    workPollInterval: 1,
  });
  const budget = new ResourceBudget(limits, { clock: new FixedClock(0) });
  const callerBytes = ascii("AC1015");
  const snapshot = createInputSnapshot(callerBytes, limits, budget);
  assert.notEqual(snapshot.buffer, callerBytes.buffer);
  assert.deepEqual([...snapshot], [...ascii("AC1015")]);
  assert.equal(budget.workUnits, 6);
  assert.equal(budget.memoryBytes, 6);

  callerBytes.fill(0);
  assert.deepEqual([...snapshot], [...ascii("AC1015")]);
});

test("snapshot memory is rejected independently before copy work", () => {
  const result = probeDwg(ascii("AC1015"), {
    limits: { maxFileBytes: 6, maxMemoryBytes: 5 },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "DWG_MEMORY_LIMIT_EXCEEDED");
    assert.equal(result.workUnits, 0);
  }
});

test("sparse hostile reference counts exhaust accounting before array allocation", () => {
  const limits = createDwgLimits({ maxMemoryBytes: 1_024 });
  const budget = new ResourceBudget(limits, {
    clock: { now: () => 0 },
  });
  const references: DwgReference[] = [];
  references.length = limits.maxReferences;
  let itemReads = 0;
  Object.defineProperty(references, "0", {
    get() {
      itemReads += 1;
      throw new Error("must not inspect an unbudgeted reference");
    },
  });

  assert.throws(
    () =>
      createOpaqueDwgObject(
        {
          typeTag: 1,
          handle: createDwgHandle(Uint8Array.of(1)),
          references,
          rawPayload: new Uint8Array(),
        },
        limits,
        budget,
      ),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "detail" in error &&
      (error as { detail?: { code?: string } }).detail?.code ===
        "DWG_MEMORY_LIMIT_EXCEEDED",
  );
  assert.equal(itemReads, 0);
  assert.equal(budget.memoryBytes, 0);
});

test("an already-cancelled operation returns a typed cancellation", () => {
  const signal: DwgCancellationSignal = { aborted: true };
  const result = probeDwg(ascii("AC1015"), {
    limits: { workPollInterval: 1 },
    signal,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "DWG_CANCELLED");
    assert.equal(result.probe, null);
  }
});

class FixedClock implements DwgClock {
  public constructor(private readonly timestamp: number) {}
  public now(): number {
    return this.timestamp;
  }
}

test("an absolute fake-clock deadline expires deterministically without sleeping", () => {
  const options = {
    clock: new FixedClock(1_000),
    deadlineMs: 1_000,
    limits: { workPollInterval: 1 },
  } as const;
  const result = probeDwg(ascii("AC1015"), options);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "DWG_DEADLINE_EXCEEDED");
    assert.equal(result.probe, null);
  }
  assert.deepEqual(
    probeDwg(ascii("AC1015"), { ...options, clock: new FixedClock(1_000) }),
    result,
  );
});

class SequenceClock implements DwgClock {
  private index = 0;
  public constructor(private readonly timestamps: readonly number[]) {}
  public now(): number {
    const timestamp =
      this.timestamps[Math.min(this.index, this.timestamps.length - 1)];
    this.index += 1;
    return timestamp ?? 0;
  }
}

test("deadline polling follows the injected schedule at bounded work intervals", () => {
  const run = (): ReturnType<typeof probeDwg> =>
    probeDwg(ascii("AC1015"), {
      clock: new SequenceClock([0, 0, 0, 5]),
      deadlineMs: 5,
      limits: { workPollInterval: 1 },
    });
  const first = run();
  assert.equal(first.ok, false);
  if (!first.ok) assert.equal(first.error.code, "DWG_DEADLINE_EXCEEDED");
  assert.deepEqual(run(), first);
});

class CountingCancellation implements DwgCancellationSignal {
  private reads = 0;
  public constructor(private readonly abortAtRead: number) {}
  public get aborted(): boolean {
    this.reads += 1;
    return this.reads >= this.abortAtRead;
  }
}

test("cancellation polling is deterministic and produces no partial metadata", () => {
  const run = (): ReturnType<typeof probeDwg> =>
    probeDwg(ascii("AC1015"), {
      limits: { workPollInterval: 1 },
      signal: new CountingCancellation(4),
    });
  const first = run();
  assert.equal(first.ok, false);
  if (!first.ok) {
    assert.equal(first.error.code, "DWG_CANCELLED");
    assert.equal(first.probe, null);
  }
  assert.deepEqual(run(), first);
});
