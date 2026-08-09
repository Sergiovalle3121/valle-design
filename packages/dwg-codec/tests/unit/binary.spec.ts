import assert from "node:assert/strict";
import test from "node:test";
import { BitCursor } from "../../src/binary/bit-cursor.js";
import { BoundedByteCursor } from "../../src/binary/byte-cursor.js";
import {
  assertNonNegativeSafeInteger,
  checkedAdd,
  checkedBigIntToNumber,
  checkedMultiply,
  checkedRange,
  checkedSubtract,
} from "../../src/binary/checked-arithmetic.js";
import { RangeTable } from "../../src/binary/range-table.js";
import { createDwgLimits } from "../../src/api/limits.js";
import { ResourceBudget } from "../../src/security/resource-budget.js";
import { assertDwgError } from "../support/assert.js";
import { FixedClock } from "../support/fake-clock.js";

test("checked arithmetic accepts exact safe boundaries", () => {
  assert.equal(
    assertNonNegativeSafeInteger(Number.MAX_SAFE_INTEGER),
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(
    checkedAdd(Number.MAX_SAFE_INTEGER - 1, 1),
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(
    checkedSubtract(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    0,
  );
  assert.equal(checkedMultiply(3, 7), 21);
  assert.equal(
    checkedBigIntToNumber(9_007_199_254_740_991n),
    Number.MAX_SAFE_INTEGER,
  );
  assert.deepEqual(checkedRange(3, 7, 10), { start: 3, length: 7, end: 10 });
});

for (const action of [
  () => assertNonNegativeSafeInteger(-1),
  () => assertNonNegativeSafeInteger(1.5),
  () => checkedAdd(Number.MAX_SAFE_INTEGER, 1),
  () => checkedSubtract(0, 1),
  () => checkedMultiply(Number.MAX_SAFE_INTEGER, 2),
  () => checkedBigIntToNumber(-1n),
  () => checkedBigIntToNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
  () => checkedRange(9, 2, 10),
]) {
  test("invalid arithmetic fails with a structural typed error", () => {
    assertDwgError(action, "DWG_STRUCTURE_CORRUPT");
  });
}

test("byte cursor reads unsigned endian widths including uint32 max", () => {
  const little = new BoundedByteCursor(
    Uint8Array.of(0x34, 0x12, 0x78, 0x56, 0x34, 0x12),
  );
  assert.equal(little.readUint16LE(), 0x1234);
  assert.equal(little.readUint32LE(), 0x12345678);
  assert.equal(little.remaining, 0);

  const big = new BoundedByteCursor(
    Uint8Array.of(0x12, 0x34, 0x12, 0x34, 0x56, 0x78),
  );
  assert.equal(big.readUint16BE(), 0x1234);
  assert.equal(big.readUint32BE(), 0x12345678);
  assert.equal(
    new BoundedByteCursor(Uint8Array.of(255, 255, 255, 255)).readUint32LE(),
    0xffff_ffff,
  );
  assert.equal(
    new BoundedByteCursor(Uint8Array.of(255, 255, 255, 255)).readUint32BE(),
    0xffff_ffff,
  );
});

for (const width of [1, 2, 4] as const) {
  for (let length = 0; length < width; length += 1) {
    test(`${width}-byte read rejects truncation at ${length} without advancing`, () => {
      const cursor = new BoundedByteCursor(new Uint8Array(length));
      const action =
        width === 1
          ? () => cursor.readUint8()
          : width === 2
            ? () => cursor.readUint16LE()
            : () => cursor.readUint32LE();
      assertDwgError(action, "DWG_STRUCTURE_CORRUPT");
      assert.equal(cursor.position, 0);
    });
  }
}

test("byte cursor seek, skip and reads remain bounded", () => {
  const cursor = new BoundedByteCursor(Uint8Array.of(1, 2, 3, 4));
  cursor.seek(1);
  assert.deepEqual(Array.from(cursor.readBytes(2)), [2, 3]);
  cursor.seek(0);
  cursor.skip(4);
  assert.equal(cursor.remaining, 0);
  assertDwgError(() => cursor.seek(5), "DWG_STRUCTURE_CORRUPT");
  assertDwgError(() => cursor.skip(1), "DWG_STRUCTURE_CORRUPT");
});

test("readBytes returns owned storage", () => {
  const source = Uint8Array.of(1, 2, 3);
  const copy = new BoundedByteCursor(source).readBytes(3);
  source.fill(9);
  assert.deepEqual(Array.from(copy), [1, 2, 3]);
});

test("byte cursor fails typed if a hostile budget callback detaches input", () => {
  const source = Uint8Array.of(1, 2, 3);
  let signalReads = 0;
  const budget = new ResourceBudget(createDwgLimits({ workPollInterval: 1 }), {
    clock: new FixedClock(0),
    signal: {
      get aborted(): boolean {
        signalReads += 1;
        if (signalReads === 2) {
          structuredClone(source.buffer, { transfer: [source.buffer] });
        }
        return false;
      },
    },
  });
  assertDwgError(
    () => new BoundedByteCursor(source, budget),
    "DWG_INPUT_INVALID",
  );
  assert.equal(source.byteLength, 0);
});

test("byte cursor rejects a bulk copy when work is exhausted", () => {
  const budget = new ResourceBudget(
    createDwgLimits({ maxWorkUnits: 3, workPollInterval: 3 }),
    { clock: new FixedClock(0) },
  );
  const cursor = new BoundedByteCursor(Uint8Array.of(1, 2, 3), budget);
  assertDwgError(() => cursor.readBytes(3), "DWG_WORK_LIMIT_EXCEEDED");
  assert.equal(cursor.position, 0);
  assert.equal(budget.workUnits, 3);
});

test("byte cursor rejects reentrant mutation from budget collaborators", () => {
  let armed = false;
  let cursor: BoundedByteCursor;
  const budget = new ResourceBudget(
    createDwgLimits({ maxWorkUnits: 10, workPollInterval: 1 }),
    {
      clock: new FixedClock(0),
      signal: {
        get aborted(): boolean {
          if (armed) cursor.seek(cursor.length);
          return false;
        },
      },
    },
  );
  cursor = new BoundedByteCursor(Uint8Array.of(7, 8), budget);
  armed = true;
  assertDwgError(() => cursor.readUint8(), "DWG_INPUT_INVALID");
  assert.equal(cursor.position, 0);
  assert.equal(cursor.remaining, 2);
});

test("least-significant-first bit reads cross byte boundaries exactly", () => {
  const cursor = new BitCursor(
    new BoundedByteCursor(Uint8Array.of(0b1010_0101, 0b0000_0011)),
  );
  assert.equal(cursor.readBits(3), 0b101);
  assert.equal(cursor.readBits(7), 0b111_0100);
  assert.equal(cursor.remaining, 6);
});

test("most-significant-first bit reads and alignment are explicit", () => {
  const bytes = new BoundedByteCursor(Uint8Array.of(0b1011_0010, 0xff));
  const cursor = new BitCursor(bytes, "most-significant-first");
  assert.equal(cursor.readBits(3), 0b101);
  assert.equal(cursor.aligned, false);
  assertDwgError(() => cursor.requireByteAlignment(), "DWG_STRUCTURE_CORRUPT");
  assert.equal(cursor.alignToByte(), 5);
  assert.equal(cursor.aligned, true);
  assert.equal(cursor.readBits(8), 0xff);
});

test("bit cursor rejects impossible widths and out-of-range reads", () => {
  const cursor = new BitCursor(new BoundedByteCursor(Uint8Array.of(0)));
  assertDwgError(() => cursor.readBits(-1), "DWG_STRUCTURE_CORRUPT");
  assertDwgError(() => cursor.readBits(33), "DWG_STRUCTURE_CORRUPT");
  assertDwgError(() => cursor.readBits(9), "DWG_STRUCTURE_CORRUPT");
  assert.equal(cursor.position, 0);
});

test("range table accepts touching ranges in canonical order", () => {
  const table = new RangeTable(20, 3);
  table.add("tail", 10, 10);
  table.add("head", 0, 10);
  assert.deepEqual(
    table.ranges.map(({ id }) => id),
    ["head", "tail"],
  );
  assert.equal(Object.isFrozen(table.ranges), true);
});

test("range table rejects duplicate, overlap, outside and count excess", () => {
  const duplicate = new RangeTable(20, 3);
  duplicate.add("a", 0, 5);
  assertDwgError(() => duplicate.add("a", 5, 5), "DWG_STRUCTURE_CORRUPT");
  assertDwgError(() => duplicate.add("b", 0, 5), "DWG_STRUCTURE_CORRUPT");
  assertDwgError(() => duplicate.add("b", 4, 3), "DWG_STRUCTURE_CORRUPT");
  assertDwgError(() => duplicate.add("b", 19, 2), "DWG_STRUCTURE_CORRUPT");
  const limited = new RangeTable(20, 1);
  limited.add("one", 0, 1);
  assertDwgError(() => limited.add("two", 2, 1), "DWG_STRUCTURE_CORRUPT");
});
