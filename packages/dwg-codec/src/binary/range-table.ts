import {
  assertNonNegativeSafeInteger,
  checkedAdd,
  checkedMultiply,
  checkedRange,
} from "./checked-arithmetic.js";
import { throwDwgError } from "../security/parse-error.js";
import type { ResourceBudget } from "../security/resource-budget.js";

export interface BoundedRange {
  readonly id: string;
  readonly start: number;
  readonly length: number;
  readonly end: number;
}

interface RangeNode {
  readonly range: BoundedRange;
  height: number;
  left: RangeNode | null;
  right: RangeNode | null;
}

// Conservative retained-heap charges for the Set, AVL node, frozen range,
// references and allocator/container overhead. They deliberately exceed the
// current V8 shallow sizes and are runtime-independent accounting units.
const RANGE_TABLE_BASE_BYTES = 192;
const RANGE_RETAINED_BYTES = 256;
const RANGE_ARRAY_OVERHEAD_BYTES = 64;
const RANGE_ARRAY_SLOT_BYTES = 8;

function height(node: RangeNode | null): number {
  return node?.height ?? 0;
}

function refresh(node: RangeNode): void {
  node.height = Math.max(height(node.left), height(node.right)) + 1;
}

function rotateLeft(root: RangeNode): RangeNode {
  const replacement = root.right;
  if (replacement === null) return root;
  root.right = replacement.left;
  replacement.left = root;
  refresh(root);
  refresh(replacement);
  return replacement;
}

function rotateRight(root: RangeNode): RangeNode {
  const replacement = root.left;
  if (replacement === null) return root;
  root.left = replacement.right;
  replacement.right = root;
  refresh(root);
  refresh(replacement);
  return replacement;
}

function rebalance(root: RangeNode): RangeNode {
  refresh(root);
  const balance = height(root.left) - height(root.right);
  if (balance > 1) {
    if (
      root.left !== null &&
      height(root.left.left) < height(root.left.right)
    ) {
      root.left = rotateLeft(root.left);
    }
    return rotateRight(root);
  }
  if (balance < -1) {
    if (
      root.right !== null &&
      height(root.right.right) < height(root.right.left)
    ) {
      root.right = rotateRight(root.right);
    }
    return rotateLeft(root);
  }
  return root;
}

function insert(root: RangeNode | null, node: RangeNode): RangeNode {
  if (root === null) return node;
  if (node.range.start < root.range.start) {
    root.left = insert(root.left, node);
  } else {
    root.right = insert(root.right, node);
  }
  return rebalance(root);
}

export class RangeTable {
  readonly #containerLength: number;
  readonly #maximumRanges: number;
  readonly #ids: Set<string>;
  readonly #budget: ResourceBudget | undefined;
  #root: RangeNode | null = null;
  #size = 0;

  constructor(
    containerLength: number,
    maximumRanges: number,
    budget?: ResourceBudget,
  ) {
    this.#containerLength = assertNonNegativeSafeInteger(containerLength);
    this.#maximumRanges = assertNonNegativeSafeInteger(maximumRanges);
    this.#budget = budget;
    if (maximumRanges === 0) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A range table must allow at least one range.",
      );
    }
    let reserved = false;
    try {
      budget?.reserveMemory(RANGE_TABLE_BASE_BYTES, 0);
      reserved = budget !== undefined;
      this.#ids = new Set<string>();
    } catch (error) {
      if (reserved) budget!.releaseMemory(RANGE_TABLE_BASE_BYTES, 0);
      throw error;
    }
  }

  get size(): number {
    return this.#size;
  }

  get ranges(): readonly BoundedRange[] {
    const retainedBytes = checkedAdd(
      RANGE_ARRAY_OVERHEAD_BYTES,
      checkedMultiply(this.#size, RANGE_ARRAY_SLOT_BYTES),
    );
    const transientBytes = retainedBytes;
    const totalBytes = checkedAdd(retainedBytes, transientBytes);
    this.#budget?.reserveMemory(totalBytes, 0);
    let completed = false;
    try {
      const ordered = new Array<BoundedRange>(this.#size);
      const stack = new Array<RangeNode>(this.#size);
      let orderedLength = 0;
      let stackLength = 0;
      let current = this.#root;
      while (current !== null || stackLength > 0) {
        while (current !== null) {
          stack[stackLength] = current;
          stackLength += 1;
          current = current.left;
        }
        stackLength -= 1;
        const node = stack[stackLength]!;
        this.#budget?.consume(1, node.range.start);
        ordered[orderedLength] = node.range;
        orderedLength += 1;
        current = node.right;
      }
      const frozen = Object.freeze(ordered);
      completed = true;
      return frozen;
    } finally {
      if (this.#budget !== undefined) {
        this.#budget.releaseMemory(completed ? transientBytes : totalBytes, 0);
      }
    }
  }

  add(id: string, start: number, length: number): BoundedRange {
    if (typeof id !== "string" || id.length === 0) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        start,
        "A range identifier is missing.",
      );
    }
    if (this.#size >= this.#maximumRanges) {
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "resource",
        start,
        "The range count exceeds its configured limit.",
      );
    }
    let reserved = false;
    try {
      this.#budget?.reserveMemory(RANGE_RETAINED_BYTES, start);
      reserved = this.#budget !== undefined;
      const checked = checkedRange(start, length, this.#containerLength, start);
      if (this.#ids.has(id)) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          start,
          "A duplicate binary range was rejected.",
        );
      }

      let current = this.#root;
      let predecessor: BoundedRange | null = null;
      let successor: BoundedRange | null = null;
      while (current !== null) {
        this.#budget?.consume(1, start);
        if (start === current.range.start) {
          throwDwgError(
            "DWG_STRUCTURE_CORRUPT",
            "input",
            start,
            "A duplicate binary range start was rejected.",
          );
        }
        if (start < current.range.start) {
          successor = current.range;
          current = current.left;
        } else {
          predecessor = current.range;
          current = current.right;
        }
      }

      if (
        (predecessor !== null && predecessor.end > checked.start) ||
        (successor !== null && checked.end > successor.start)
      ) {
        throwDwgError(
          "DWG_STRUCTURE_CORRUPT",
          "input",
          start,
          "Overlapping binary ranges were rejected.",
        );
      }

      const range: BoundedRange = Object.freeze({ id, ...checked });
      const node: RangeNode = {
        range,
        height: 1,
        left: null,
        right: null,
      };
      this.#root = insert(this.#root, node);
      this.#ids.add(id);
      this.#size += 1;
      reserved = false;
      return range;
    } finally {
      if (reserved) {
        this.#budget!.releaseMemory(RANGE_RETAINED_BYTES, start);
      }
    }
  }
}
