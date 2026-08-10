import { createDwgLimits, type DwgLimits } from "../api/limits.js";
import { throwDwgError } from "./parse-error.js";

export interface DwgClock {
  now(): number;
}

export interface DwgCancellationSignal {
  readonly aborted: boolean;
}

export interface ResourceBudgetOptions {
  readonly clock?: DwgClock;
  readonly signal?: DwgCancellationSignal;
  readonly deadlineMs?: number;
}

const SYSTEM_CLOCK: DwgClock = Object.freeze({
  now: (): number => Date.now(),
});

function readClock(clock: DwgClock): number {
  const value = clock.now();
  if (!Number.isFinite(value) || value < 0) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The probe clock must return a finite non-negative millisecond value.",
    );
  }
  return value;
}

function readCancellation(signal: DwgCancellationSignal | undefined): boolean {
  if (signal === undefined) return false;
  let aborted: unknown;
  try {
    aborted = signal.aborted;
  } catch {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The cancellation signal cannot be read.",
    );
  }
  if (typeof aborted !== "boolean") {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The cancellation signal must expose a boolean aborted value.",
    );
  }
  return aborted;
}

export class ResourceBudget {
  readonly limits: DwgLimits;
  readonly deadlineMs: number;

  #clock: DwgClock;
  #signal: DwgCancellationSignal | undefined;
  #workUnits = 0;
  #memoryBytes = 0;
  #expandedBytes = 0;
  #unitsSincePoll = 0;

  constructor(limits: DwgLimits, options: ResourceBudgetOptions = {}) {
    this.limits = createDwgLimits(limits, "api");
    this.#clock = options.clock ?? SYSTEM_CLOCK;
    this.#signal = options.signal;

    const startMs = readClock(this.#clock);
    const configuredDeadline = options.deadlineMs;
    if (
      configuredDeadline !== undefined &&
      (!Number.isFinite(configuredDeadline) || configuredDeadline < 0)
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "The probe deadline must be a finite non-negative millisecond value.",
      );
    }
    const wallDeadline = startMs + this.limits.maxWallTimeMs;
    const boundedWallDeadline =
      !Number.isFinite(wallDeadline) || wallDeadline > Number.MAX_SAFE_INTEGER
        ? Number.MAX_SAFE_INTEGER
        : wallDeadline;
    this.deadlineMs = Math.min(
      boundedWallDeadline,
      configuredDeadline ?? Number.MAX_SAFE_INTEGER,
    );
    this.checkpoint(0, true);
  }

  get workUnits(): number {
    return this.#workUnits;
  }

  get memoryBytes(): number {
    return this.#memoryBytes;
  }

  get expandedBytes(): number {
    return this.#expandedBytes;
  }

  reserveMemory(bytes: number, offset: number): void {
    const checkedOffset =
      Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        checkedOffset,
        "A memory reservation must be a non-negative safe integer.",
      );
    }
    if (bytes > this.limits.maxMemoryBytes - this.#memoryBytes) {
      throwDwgError(
        "DWG_MEMORY_LIMIT_EXCEEDED",
        "resource",
        checkedOffset,
        "The concurrent memory budget was exceeded.",
      );
    }
    this.#memoryBytes += bytes;
  }

  releaseMemory(bytes: number, offset: number): void {
    const checkedOffset =
      Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      bytes > this.#memoryBytes
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        checkedOffset,
        "A memory release is outside the owned allocation budget.",
      );
    }
    this.#memoryBytes -= bytes;
  }

  consumeExpanded(bytes: number, offset: number): void {
    const checkedOffset =
      Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        checkedOffset,
        "Expanded bytes must be a non-negative safe integer.",
      );
    }
    if (bytes > this.limits.maxExpandedBytes - this.#expandedBytes) {
      throwDwgError(
        "DWG_EXPANSION_LIMIT_EXCEEDED",
        "resource",
        checkedOffset,
        "The aggregate expansion budget was exceeded.",
      );
    }
    this.#expandedBytes += bytes;
  }

  assertWorkAvailable(units: number, offset: number): void {
    const checkedOffset =
      Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    if (!Number.isSafeInteger(units) || units < 0) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        checkedOffset,
        "Work units must be a non-negative safe integer.",
      );
    }
    if (units > this.limits.maxWorkUnits - this.#workUnits) {
      throwDwgError(
        "DWG_WORK_LIMIT_EXCEEDED",
        "resource",
        checkedOffset,
        "The deterministic work budget was exceeded.",
      );
    }
  }

  consume(units: number, offset: number): void {
    const checkedOffset =
      Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    this.assertWorkAvailable(units, checkedOffset);

    let remaining = units;
    while (remaining > 0) {
      const untilPoll = this.limits.workPollInterval - this.#unitsSincePoll;
      const step = Math.min(remaining, untilPoll);
      this.#workUnits += step;
      this.#unitsSincePoll += step;
      remaining -= step;
      if (this.#unitsSincePoll === this.limits.workPollInterval) {
        const consumed = units - remaining;
        const pollOffset =
          consumed > Number.MAX_SAFE_INTEGER - checkedOffset
            ? Number.MAX_SAFE_INTEGER
            : checkedOffset + consumed;
        this.checkpoint(pollOffset, true);
      }
    }
  }

  checkpoint(offset: number, force = true): void {
    const checkedOffset =
      Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    if (!force && this.#unitsSincePoll < this.limits.workPollInterval) {
      return;
    }
    this.#unitsSincePoll = 0;
    if (readCancellation(this.#signal)) {
      throwDwgError(
        "DWG_CANCELLED",
        "cancelled",
        checkedOffset,
        "The probe was cancelled.",
      );
    }
    if (readClock(this.#clock) >= this.deadlineMs) {
      throwDwgError(
        "DWG_DEADLINE_EXCEEDED",
        "resource",
        checkedOffset,
        "The probe deadline was exceeded.",
      );
    }
  }
}
